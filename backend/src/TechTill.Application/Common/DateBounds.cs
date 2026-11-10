using TechTill.Application.Common.Exceptions;

namespace TechTill.Application.Common;

/// <summary>
/// Reports bucket by day and load each document in the range, so the range is bounded: a
/// thousand years used to build 72 MB, and a date near DateTime.MaxValue overflowed into a 500.
/// </summary>
public static class DateBounds
{
    public const int MaxRangeDays = 3660;

    public static readonly DateTime Earliest = new(2000, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    public static readonly DateTime Latest = new(2100, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    public static void EnsureRange(DateTime? from, DateTime? to)
    {
        Ensure(from, "From");
        Ensure(to, "To");

        if (from is { } start && to is { } end && Math.Abs((end - start).TotalDays) > MaxRangeDays)
        {
            throw ValidationFailedException.ForField("To", $"Pick a range of at most {MaxRangeDays / 366} years.");
        }
    }

    private static void Ensure(DateTime? value, string field)
    {
        if (value is { } date && (date < Earliest || date >= Latest))
        {
            throw ValidationFailedException.ForField(field, $"Pick a date between {Earliest:yyyy} and {Latest.Year - 1}.");
        }
    }
}
