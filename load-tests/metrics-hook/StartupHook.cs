using System.Collections.Concurrent;
using System.Data.Common;
using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;

/// <summary>
/// Loaded through DOTNET_STARTUP_HOOKS only by the load test runner, so the API under test
/// ships unchanged. Samples the runtime every five seconds and aggregates EF Core timings.
/// </summary>
internal sealed class StartupHook
{
    public static void Initialize()
    {
        var path = Environment.GetEnvironmentVariable("TT_METRICS_FILE");
        if (string.IsNullOrWhiteSpace(path))
        {
            return;
        }

        DiagnosticListener.AllListeners.Subscribe(new ListenerObserver());
        new Thread(() => Sampler.Run(path)) { IsBackground = true, Name = "metrics-hook" }.Start();
    }
}

internal static class Sampler
{
    public static void Run(string path)
    {
        var process = Process.GetCurrentProcess();
        var clock = Stopwatch.StartNew();
        var lastElapsed = 0d;
        var lastCpu = process.TotalProcessorTime.TotalMilliseconds;
        var lastPause = GC.GetTotalPauseDuration().TotalMilliseconds;
        var lastCompleted = ThreadPool.CompletedWorkItemCount;
        using var writer = new StreamWriter(path, append: false) { AutoFlush = true };

        while (true)
        {
            Thread.Sleep(5000);
            process.Refresh();
            var elapsed = clock.Elapsed.TotalMilliseconds;
            var cpu = process.TotalProcessorTime.TotalMilliseconds;
            var pause = GC.GetTotalPauseDuration().TotalMilliseconds;
            var completed = ThreadPool.CompletedWorkItemCount;
            var window = elapsed - lastElapsed;

            writer.WriteLine(JsonSerializer.Serialize(new
            {
                at = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                cpuPct = Math.Round((cpu - lastCpu) / window / Environment.ProcessorCount * 100, 1),
                workingSetMb = process.WorkingSet64 / 1048576,
                gcHeapMb = GC.GetTotalMemory(false) / 1048576,
                gcPauseMs = Math.Round(pause - lastPause, 1),
                gen0 = GC.CollectionCount(0),
                gen1 = GC.CollectionCount(1),
                gen2 = GC.CollectionCount(2),
                threadPoolThreads = ThreadPool.ThreadCount,
                threadPoolQueue = ThreadPool.PendingWorkItemCount,
                threadPoolCompletedPerSec = Math.Round((completed - lastCompleted) / window * 1000),
                openConnectionsMax = EfMetrics.TakeOpenPeak(),
                lockWaitMs = EfMetrics.TakeLockWaitMs(),
                lockWaitMaxMs = EfMetrics.TakeLockWaitMax()
            }));

            File.WriteAllText(path + ".sql.json", EfMetrics.DumpQueries());
            (lastElapsed, lastCpu, lastPause, lastCompleted) = (elapsed, cpu, pause, completed);
        }
    }
}

internal static class EfMetrics
{
    private static readonly ConcurrentDictionary<string, QueryStat> Queries = new();
    private static long _open;
    private static long _peak;
    private static double _lockWait;
    private static double _lockWaitMax;
    private static readonly object Gate = new();

    public static void Opened()
    {
        var now = Interlocked.Increment(ref _open);
        long peak;
        while (now > (peak = Interlocked.Read(ref _peak)) && Interlocked.CompareExchange(ref _peak, now, peak) != peak)
        {
        }
    }

    public static void Closed() => Interlocked.Decrement(ref _open);

    public static long TakeOpenPeak() => Interlocked.Exchange(ref _peak, Interlocked.Read(ref _open));

    public static void LockWait(double ms)
    {
        lock (Gate)
        {
            _lockWait += ms;
            _lockWaitMax = Math.Max(_lockWaitMax, ms);
        }
    }

    public static double TakeLockWaitMs()
    {
        lock (Gate)
        {
            var value = _lockWait;
            _lockWait = 0;
            return Math.Round(value);
        }
    }

    public static double TakeLockWaitMax()
    {
        lock (Gate)
        {
            var value = _lockWaitMax;
            _lockWaitMax = 0;
            return Math.Round(value);
        }
    }

    public static void Command(string sql, double ms)
    {
        var stat = Queries.GetOrAdd(sql, _ => new QueryStat());
        lock (stat)
        {
            stat.Count++;
            stat.TotalMs += ms;
            stat.MaxMs = Math.Max(stat.MaxMs, ms);
            if (ms >= 100)
            {
                stat.SlowCount++;
            }
        }
    }

    public static string DumpQueries()
    {
        var rows = Queries
            .Select(kv => new { sql = kv.Key, count = kv.Value.Count, totalMs = Math.Round(kv.Value.TotalMs), maxMs = Math.Round(kv.Value.MaxMs), slowCount = kv.Value.SlowCount })
            .OrderByDescending(r => r.totalMs)
            .Take(25)
            .ToList();
        return JsonSerializer.Serialize(rows);
    }

    private sealed class QueryStat
    {
        public long Count;
        public long SlowCount;
        public double TotalMs;
        public double MaxMs;
    }
}

internal sealed class ListenerObserver : IObserver<DiagnosticListener>
{
    public void OnNext(DiagnosticListener value)
    {
        if (value.Name == "Microsoft.EntityFrameworkCore")
        {
            value.Subscribe(new EventObserver());
        }
    }

    public void OnCompleted()
    {
    }

    public void OnError(Exception error)
    {
    }
}

internal sealed class EventObserver : IObserver<KeyValuePair<string, object?>>
{
    public void OnNext(KeyValuePair<string, object?> value)
    {
        switch (value.Key)
        {
            case "Microsoft.EntityFrameworkCore.Database.Connection.ConnectionOpened":
                EfMetrics.Opened();
                break;
            case "Microsoft.EntityFrameworkCore.Database.Connection.ConnectionClosed":
                EfMetrics.Closed();
                break;
            case "Microsoft.EntityFrameworkCore.Database.Transaction.TransactionStarted":
                // BEGIN IMMEDIATE takes SQLite's single write lock, so its duration is the lock wait.
                EfMetrics.LockWait(Duration(value.Value));
                break;
            case "Microsoft.EntityFrameworkCore.Database.Command.CommandExecuted":
                if (value.Value is not null
                    && value.Value.GetType().GetProperty("Command")?.GetValue(value.Value) is DbCommand command)
                {
                    EfMetrics.Command(Normalise(command.CommandText), Duration(value.Value));
                }

                break;
        }
    }

    public void OnCompleted()
    {
    }

    public void OnError(Exception error)
    {
    }

    private static double Duration(object? data)
        => data?.GetType().GetProperty("Duration")?.GetValue(data) is TimeSpan span ? span.TotalMilliseconds : 0;

    private static string Normalise(string sql)
    {
        var builder = new StringBuilder(sql.Length);
        foreach (var c in sql)
        {
            builder.Append(char.IsWhiteSpace(c) ? ' ' : c);
        }

        var flat = string.Create(CultureInfo.InvariantCulture, $"{builder}");
        return flat.Length > 4000 ? flat[..4000] : flat;
    }
}
