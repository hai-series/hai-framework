# @h-ai/scheduler Data structures

[Chinese source](scheduler.md) · [Configuration](../configuration/scheduler.en.md) · [API reference](../function/scheduler.en.md)

<a id="example-data"></a>

## What these records are for

### What task should run on what schedule

Structure: `hai_scheduler_tasks`.

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
  "params": {
    "reportId": "report-42"
  }
}
```

daily-report runs at midnight UTC for report-42. idempotent:true is a business declaration, not automatic exactly-once effects.

### Whether this occurrence is running

Structure: `hai_scheduler_executions`.

Track each scheduled or manual occurrence to prevent overlapping runs and identify its worker.

```json
{
  "sequence": 42,
  "occurrence_id": "1aac2af840fe011ae7e489827dd6ea6de833cf24cd5c572ef913becb44294f22",
  "task_id": "daily-report",
  "active_task": "daily-report",
  "status": "running",
  "owner": "node-1",
  "leased_until": 1794873630000,
  "attempt_count": 1,
  "max_attempts": 1
}
```

node-1 is running 1aac2af840fe011ae7e489827dd6ea6de833cf24cd5c572ef913becb44294f22 and holds daily-report. Lease expiry does not prove external effects never happened.

### Task history for inspection

Structure: `hai_scheduler_logs`.

Keep results, duration and diagnostics for management views; logs do not control task ownership.

```json
{
  "id": "log-42",
  "occurrence_id": "1aac2af840fe011ae7e489827dd6ea6de833cf24cd5c572ef913becb44294f22",
  "task_id": "daily-report",
  "task_name": "Daily report",
  "status": "success",
  "duration": 125
}
```

1aac2af840fe011ae7e489827dd6ea6de833cf24cd5c572ef913becb44294f22 later succeeded in 125 ms, a later moment than the running sample. Deleting logs does not free a running task.

## Field, storage and cleanup reference

<a id="tables"></a>

### Database tables

With database persistence enabled, Scheduler stores schedules, execution claims and results in [RelDB](reldb.en.md). Task timestamps are shown as dates. Execution and log times use Unix milliseconds.

The module uses 3 tables.

| Table | Purpose |
| --- | --- |
| [`hai_scheduler_tasks`](#table-hai-scheduler-tasks) | Find when a task runs and which handler and arguments it uses. |
| [`hai_scheduler_executions`](#table-hai-scheduler-executions) | Coordinate claims, runs and reconciliation for each occurrence. |
| [`hai_scheduler_logs`](#table-hai-scheduler-logs) | Inspect individual run results, timing and details. |

<a id="table-hai-scheduler-tasks"></a>

#### `hai_scheduler_tasks`

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
| `retry` | `JSON` | Yes | — | Task retry settings. | `NULL` |
| `params` | `JSON` | Yes | — | Arguments passed to the task handler. | `{"reportId":"report-42"}` |
| `handler` | `JSON` | Yes | — | Persistent handler description. | `NULL` |
| `created_at` | `TIMESTAMP` | Yes | — | Task registration time. | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | Yes | — | Task's last update time. | `2026-11-17T00:00:00Z` |

<a id="table-hai-scheduler-executions"></a>

#### `hai_scheduler_executions`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `sequence` | `INTEGER` | No | — | Auto-incrementing execution row primary key. | `42` |
| `occurrence_id` | `TEXT` | No | — | Unique occurrence ID used to find the same execution. | `1aac2af840fe011ae7e489827dd6ea6de833cf24cd5c572ef913becb44294f22` |
| `task_id` | `TEXT` | No | — | Related task ID. | `daily-report` |
| `active_task` | `TEXT` | Yes | — | Task ID held by the current execution. Only one record can hold it. | `daily-report` |
| `status` | `TEXT` | No | — | Current state of the execution. | `running` |
| `owner` | `TEXT` | Yes | — | Identifier of the worker that claimed the execution. | `node-1` |
| `snapshot` | `JSON` | No | — | Task definition at trigger time. The example shows an excerpt. | `{"id":"daily-report"}` |
| `trigger_json` | `JSON` | No | — | Trigger type and source. The example shows an excerpt. | `{"type":"scheduled"}` |
| `log_json` | `JSON` | Yes | — | Primary log for the execution. | `NULL` |
| `logs_json` | `JSON` | Yes | — | History of log entries for individual attempts. | `NULL` |
| `log_persistence` | `TEXT` | No | — | Whether the execution log has been persisted. | `pending` |
| `leased_until` | `BIGINT` | No | — | Processing deadline for the current lease holder. | `1794873630000` |
| `attempt_count` | `BIGINT` | No | — | Number of attempts so far. | `1` |
| `max_attempts` | `BIGINT` | No | — | Attempt limit for this occurrence. | `1` |
| `updated_at` | `BIGINT` | No | — | Last update time of the execution state. | `1794873600000` |
| `created_at` | `BIGINT` | No | — | Time the occurrence was registered. | `1794873600000` |
| `idempotent` | `BOOLEAN` | No | — | Whether the task was declared safe to rerun when triggered. | `true` |

<a id="table-hai-scheduler-logs"></a>

#### `hai_scheduler_logs`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Log row primary key. | `log-42` |
| `occurrence_id` | `TEXT` | Yes | — | Occurrence ID associated with the log. | `1aac2af840fe011ae7e489827dd6ea6de833cf24cd5c572ef913becb44294f22` |
| `task_id` | `TEXT` | No | — | ID of the task that ran. | `daily-report` |
| `task_name` | `TEXT` | No | — | Task display name at execution time. | `Daily report` |
| `task_type` | `TEXT` | No | — | Task type. | `hook` |
| `trigger_type` | `TEXT` | No | — | Scheduled or manual trigger. | `scheduled` |
| `trigger_source` | `TEXT` | Yes | — | Specific source of the trigger. | `NULL` |
| `status` | `TEXT` | No | — | Run outcome in this log entry. | `success` |
| `payload` | `JSON` | No | — | Detailed execution log. The example shows an excerpt. | `{"status":"success"}` |
| `started_at` | `BIGINT` | No | — | Time this run started. | `1794873600000` |
| `finished_at` | `BIGINT` | No | — | Time this run finished. | `1794873600125` |
| `duration` | `INTEGER` | No | — | Run duration in milliseconds. | `125` |

Scheduled and manual starts share the unique `active_task` claim. When a lease expires and the external effect is uncertain, the claim remains until reconciliation. Deleting logs does not release it. No Redis keys are created; local timers only schedule polls, and the database decides ownership and expiry.

See the table definitions for [tasks](../../../packages/scheduler/src/repositories/scheduler-repository-task.ts), [executions](../../../packages/scheduler/src/repositories/scheduler-repository-execution.ts) and [logs](../../../packages/scheduler/src/repositories/scheduler-repository-log.ts).
