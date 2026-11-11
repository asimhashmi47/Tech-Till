# Load tests

Plain Node, no packages to install. Each run builds the API in Release, starts it on a copy of a disposable database, drives it, then stops it. Add `--no-build true` to skip the build. Nothing here can reach a deployed system: the API it starts listens on `localhost` only.

## Run

```bash
node load-tests/setup.mjs
```

Builds the API in Release, seeds a database in Development mode, then adds a year of volume: 150,000 invoices, 300,000 lines, 5,000 products, 5,000 customers and 5,000 users.

```bash
node load-tests/run.mjs --profile smoke --label after
```

| Profile | Shape |
|---|---|
| `smoke` | Ramp to `--users` (default 1000) over 1 minute, hold 1 minute |
| `load` | Ramp to 1000 over 5 minutes, hold 10 minutes |
| `spike` | 0 to 1000 in 30 seconds, hold 2 minutes, back to 0 |
| `stress` | Steps of 5, 10, 25 … 8000 users, 2 minutes each, until p95 passes 25 s or errors pass 25% |
| `soak` | Ramp, then hold `--users` for `--secs` (default 3600) |

Add `--no-build true` to skip the Release build. Set `LOADTEST_WORK` to choose where the databases go; the default is the system temp folder.

## What a virtual user does

Each one signs in with its own account, then repeats with 2 to 6 seconds of think time: till product search 30%, product grid 18%, stock grid 12%, invoice grid 12%, a cash sale with an `Idempotency-Key` 11%, the dashboard 6%, the customer grid 5%, opening an invoice 3%, adding and editing a customer 2%, and its profile 1%. Like the real client, it also polls the dashboard once a minute.

If the API refuses a sign-in, which the limit of 10 sign-ins a minute did before F09, the user carries on with a token signed by the run's own test key, so the rest of the journey is still measured.

## What it records

`results/<label>-<profile>.json` holds, for the measured window: requests per second, p50, p95 and p99 latency, errors, and status codes, overall and per endpoint. It adds a 30 second timeline and the step results for `stress`.

From inside the API, through a startup hook in `metrics-hook/` that the API itself does not reference, it records:

- CPU and memory
- GC heap and pause time
- Thread pool size and queue
- The peak number of open database connections
- Time spent waiting for SQLite's write lock
- The slowest SQL statements by total time

Pass or fail uses p95 under 500 ms, p99 under 1.5 s and errors under 1%, counted on business endpoints. Sign-in and refresh are reported apart.

## Limits of these numbers

The generator runs on the same 8-core machine as the API and takes part of its CPU. The run records both the host's CPU use and the generator's event loop lag so this can be judged. SQLite allows one writer at a time, which caps write throughput whatever the hardware.
