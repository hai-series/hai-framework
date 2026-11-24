# @h-ai/scheduler Data structures

[简体中文](scheduler.md) · [日本語](scheduler.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/scheduler.en.md) · [API reference](../function/scheduler.en.md)

Scheduler nodes share a database for task definitions and execution receipts. For example, scheduled and manual runs of a daily report share task ownership, and operators can look up individual attempt results.

<a id="tables"></a>

## Database

With database persistence enabled, Scheduler stores schedules, execution claims and results in [RelDB](reldb.en.md). Task timestamps are shown as dates. Execution and log times use Unix milliseconds.

The module uses 3 tables.

| Table | Purpose |
| --- | --- |
| [`hai_scheduler_tasks`](#table-hai-scheduler-tasks) | Find when a task runs and which handler and arguments it uses. |
| [`hai_scheduler_executions`](#table-hai-scheduler-executions) | Coordinate claims, runs and reconciliation for each occurrence. |
| [`hai_scheduler_logs`](#table-hai-scheduler-logs) | Inspect individual run results, timing and details. |

<a id="table-hai-scheduler-tasks"></a>

### `hai_scheduler_tasks`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | No | — | Auto-incrementing task row primary key. | `1` |
| `task_id` | `TEXT` | No | — | Unique ID the application uses to find the task. | `daily-report` |
| `task_name` | `TEXT` | No | — | Task display name. | `Daily report` |
| `description` | `TEXT` | Yes | — | Task description. | `NULL` |
| `cron` | `TEXT` | No | — | Cron schedule expression. | `0 0 * * *` |
| `timezone` | `TEXT` | Yes | — | IANA time zone. Omit to schedule in UTC. | `UTC` |
| `enabled` | `BOOLEAN` | No | `true` | Whether scheduled triggers are enabled. | `true` |
| `idempotent` | `BOOLEAN` | No | `false` | Application declaration that the task can safely be rerun. | `true` |
| `delete_after_run` | `BOOLEAN` | No | `false` | Whether to remove the task after it runs. | `false` |
| `retry` | `JSON` | Yes | — | Task retry settings. | `{"maxAttempts":2,"backoffMs":[45000]}` |
| `params` | `JSON` | Yes | — | Arguments passed to the task handler. | `{"reportId":"report-42"}` |
| `handler` | `JSON` | Yes | — | Persistent handler description. | `NULL` |
| `created_at` | `TIMESTAMP` | Yes | — | Task registration time. | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | Yes | — | Task's last update time. | `2026-11-17T00:00:00Z` |

<a id="example-data"></a>

<a id="what-task-should-run-on-what-schedule"></a>

#### Example · What task should run on what schedule

Persist schedules and task definitions so restarts retain what should run.

```json
{
  "id": 1,
  "task_id": "daily-report",
  "task_name": "Daily report",
  "cron": "0 0 * * *",
  "timezone": "UTC",
  "enabled": true,
  "idempotent": true,
  "delete_after_run": false,
  "retry": { "maxAttempts": 2, "backoffMs": [45000] },
  "params": {
    "reportId": "report-42"
  }
}
```

daily-report runs at midnight UTC for report-42. idempotent:true is a business declaration, not automatic exactly-once effects.

<a id="table-hai-scheduler-executions"></a>

### `hai_scheduler_executions`

**Each occurrence gets one ledger row, which remains after completion.** The row's `occurrence_id` stays fixed, and `owner` holds the current claim token. Success, failure, or a confirmed skip releases `active_task`. An `unknown` outcome keeps the slot until an operator reconciles it. Log retention applies to the log table. The ledger continues to support keyed replay and log repair.

<a id="occurrence-identity"></a>

#### How an execution ID is created and reused

**Calculate the ID for a new trigger.** When `daily-report` is due at `2026-11-17T00:00:00Z`, the nodes derive minute number `29914560` from the database clock. They serialize `["daily-report","scheduled","29914560"]` and hash it with SHA-256. The resulting ID is `8012c99d…aaed96`, shortened to `X` below. Two nodes that see the same minute get the same `X`, and a unique database constraint allows one row. A manual trigger uses the same algorithm with `manual` and the supplied `idempotencyKey` or a new UUID.

**Read the ID from the ledger after claiming.** The task declares `idempotent: true`, with a 30-second lease, a two-attempt limit, and a 45-second retry delay. Times are in UTC.

| Time | What happens | How row `X` changes |
| --- | --- | --- |
| 00:00:00 | Node A claims and starts | Insert `X` with A's claim token in `owner`. Starting the attempt sets `attempt_count` to 1 |
| 00:00:10 | A renews the lease | Use the `X` returned at claim time to update `leased_until` to 00:00:40 |
| 00:00:20 | Attempt 1 fails, and A goes offline after saving it | Save the failed attempt and the next eligible retry time, 00:01:05, in row `X` |
| 00:01:00 | Node B finds the expired lease | Read `X` from the expired row and replace `owner` with B's claim token. Recovery still uses `X` in the new minute |
| 00:01:05 | B starts attempt 2 and succeeds | Use `X` to set the count to 2, record `success`, and release the task slot |

Renewal, retry, and completion take `row.occurrenceId` from the claimed record and bind it to `WHERE occurrence_id = ?`. The database also checks the current `owner`, state, and lease. After takeover, A's old claim token can no longer update the row even if A still has `X`. External receivers can use `X` for persistent deduplication.

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `sequence` | `INTEGER` | No | — | Auto-incrementing execution row primary key. | `42` |
| `occurrence_id` | `TEXT` | No | — | Unique occurrence ID used to find the same execution. | `8012c99d724db341a30565a0f440a11198a4a43e6b28c9251ab191e8beaaed96` |
| `task_id` | `TEXT` | No | — | Related task ID. | `daily-report` |
| `active_task` | `TEXT` | Yes | — | Task ID held by the current execution. Only one record can hold it. | `daily-report` |
| `status` | `TEXT` | No | — | Current state of the execution. | `running` |
| `owner` | `TEXT` | Yes | — | Identifier of the worker that claimed the execution. | `node-1:<claim-token>` |
| `snapshot` | `JSON` | No | — | Task definition at first claim. Persisted definitions also carry an internal row ID to distinguish a later registration with the same task ID. | `{"id":"daily-report"}` |
| `trigger_json` | `JSON` | No | — | Trigger type and source. The example shows an excerpt. | `{"type":"scheduled","source":null,"minute":29914560}` |
| `log_json` | `JSON` | Yes | — | Final receipt, or the earliest retry time on the database clock while waiting. | `{"retryAt":1794873665000}` |
| `logs_json` | `JSON` | Yes | — | Logs for completed attempts. Takeover preserves them and log repair can publish them after the final commit. | `NULL` |
| `log_persistence` | `TEXT` | No | — | Whether the execution log has been persisted. | `unconfirmed` |
| `leased_until` | `BIGINT` | No | — | Processing deadline for the current lease holder. | `1794873630000` |
| `attempt_count` | `BIGINT` | No | — | Number of attempts so far. | `1` |
| `max_attempts` | `BIGINT` | No | — | Attempt limit for this occurrence. | `2` |
| `updated_at` | `BIGINT` | No | — | Last update time of the execution state. | `1794873600000` |
| `created_at` | `BIGINT` | No | — | Time the occurrence was registered. | `1794873600000` |
| `idempotent` | `BOOLEAN` | No | — | Whether the task was declared safe to rerun when triggered. | `true` |

<a id="whether-this-occurrence-is-running"></a>

#### Example · Whether this occurrence is running

Track each scheduled or manual occurrence to prevent overlapping runs and identify its worker.

```json
{
  "sequence": 42,
  "occurrence_id": "8012c99d724db341a30565a0f440a11198a4a43e6b28c9251ab191e8beaaed96",
  "task_id": "daily-report",
  "active_task": "daily-report",
  "status": "running",
  "owner": "node-1:<claim-token>",
  "leased_until": 1794873630000,
  "attempt_count": 1,
  "max_attempts": 2
}
```

node-1 is running 8012c99d724db341a30565a0f440a11198a4a43e6b28c9251ab191e8beaaed96 and holds daily-report. Lease expiry does not prove external effects never happened.

<a id="table-hai-scheduler-logs"></a>

### `hai_scheduler_logs`

**Logs refer to the ledger many-to-one by `occurrence_id`.** In the example above, the ledger has one `success` row with `attempt_count = 2`. Once published, the log table has two rows with occurrence ID `X` and distinct log IDs, one `failed` and one `success`. A ledger row may have no logs during execution or while repair is pending. A log recording an unsuccessful claim may have no corresponding ledger row, so there is no database foreign key.

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Log row primary key. | `10000000-0000-4000-8000-000000000042` |
| `occurrence_id` | `TEXT` | Yes | — | Occurrence ID associated with the log. | `8012c99d724db341a30565a0f440a11198a4a43e6b28c9251ab191e8beaaed96` |
| `task_id` | `TEXT` | No | — | ID of the task that ran. | `daily-report` |
| `task_name` | `TEXT` | No | — | Task display name at execution time. | `Daily report` |
| `task_type` | `TEXT` | No | — | Task type. | `hook` |
| `trigger_type` | `TEXT` | No | — | Scheduled or manual trigger. | `scheduled` |
| `trigger_source` | `TEXT` | Yes | — | Specific source of the trigger. | `NULL` |
| `status` | `TEXT` | No | — | Run outcome in this log entry. | `success` |
| `payload` | `JSON` | No | — | Detailed execution log. The example shows an excerpt. | `{"status":"success"}` |
| `started_at` | `BIGINT` | No | — | Time this attempt started. | `1794873665000` |
| `finished_at` | `BIGINT` | No | — | Time this attempt finished. | `1794873665125` |
| `duration` | `INTEGER` | No | — | Run duration in milliseconds. | `125` |

Scheduled and manual starts share the unique `active_task` claim. When a lease expires and the external effect is uncertain, the claim remains until reconciliation. Deleting logs does not release it. No Redis keys are created; local timers only schedule polls, and the database decides ownership and expiry.

See the table definitions for [tasks](../../../packages/scheduler/src/repositories/scheduler-repository-task.ts), [executions](../../../packages/scheduler/src/repositories/scheduler-repository-execution.ts) and [logs](../../../packages/scheduler/src/repositories/scheduler-repository-log.ts).

<a id="task-history-for-inspection"></a>

#### Example · Task history for inspection

Keep results, duration and diagnostics for management views; logs do not control task ownership.

```json
{
  "id": "10000000-0000-4000-8000-000000000042",
  "occurrence_id": "8012c99d724db341a30565a0f440a11198a4a43e6b28c9251ab191e8beaaed96",
  "task_id": "daily-report",
  "task_name": "Daily report",
  "status": "success",
  "duration": 125
}
```

This is B's second attempt. It starts at 00:01:05 and succeeds 125 milliseconds later. The log has its own `id` and refers to ledger row `X` through `occurrence_id`.
