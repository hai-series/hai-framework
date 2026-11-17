# @h-ai/scheduler Data structures

<!-- translation: partial -->

[Chinese source](scheduler.md) · [Configuration](../configuration/scheduler.en.md) · [API reference](../function/scheduler.en.md)

<a id="example-data"></a>

## What these records are for

Start with the purpose and examples, then consult field and storage details below. IDs and business content are fictional; sensitive values are redacted. Times use 2026-11-17 00:00 UTC as the example start, with units explained for each record.

Database and file samples show relevant fields, not complete writable records. Omitted fields are not automatically optional. Examples can represent different moments in a process.

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
  "occurrence_id": "occurrence-42",
  "task_id": "daily-report",
  "active_task": "daily-report",
  "status": "running",
  "owner": "node-1",
  "leased_until": 1794873630000,
  "attempt_count": 1,
  "max_attempts": 1
}
```

node-1 is running occurrence-42 and holds daily-report. Lease expiry does not prove external effects never happened.

### Task history for inspection

Structure: `hai_scheduler_logs`.

Keep results, duration and diagnostics for management views; logs do not control task ownership.

```json
{
  "id": "log-42",
  "occurrence_id": "occurrence-42",
  "task_id": "daily-report",
  "task_name": "Daily report",
  "status": "success",
  "duration": 125
}
```

occurrence-42 later succeeded in 125 ms, a later moment than the running sample. Deleting logs does not free a running task.

## Field, storage and cleanup reference

<a id="tables"></a>

### Database tables

Scheduler stores tasks and execution state in RelDB when enabled. Unlisted values come from the writer; missing nullable values are NULL.

| Field or table | Shape and meaning |
| --- | --- |
| `hai_scheduler_tasks` | Auto-increment `id`, unique business `task_id`, display `task_name`, optional `description`, `cron` and optional IANA `timezone` (UTC when omitted). Booleans: `enabled=true`, `idempotent=false`, `delete_after_run=false`. Nullable JSON: `retry`, `params`, `handler`. `created_at` and `updated_at` track changes. |
| `hai_scheduler_executions` | Auto-increment `sequence`, unique `occurrence_id`, `task_id`, nullable unique `active_task`, `status` and lease `owner`. `snapshot`, `trigger_json`, `log_json` and `logs_json` preserve task, trigger, current log and attempt logs. `log_persistence` records persistence state; `leased_until`, `attempt_count`, `max_attempts`, `created_at` and `updated_at` track deadlines, attempt budget and timestamps. |
| `hai_scheduler_logs` | Text primary key `id`, nullable `occurrence_id`, `task_id`, `task_name`, `task_type`, `trigger_type`, nullable `trigger_source`, and `status`; JSON `payload`; integer `started_at`, `finished_at` and `duration`. |

Scheduled and manual starts share the unique `active_task` claim. When a lease expires and the external effect is uncertain, the claim remains until reconciliation. Deleting logs does not release it. No Redis keys are created; local timers only schedule polls, and the database decides ownership and expiry.

For the remaining database types and constraints, compare the [Chinese reference](scheduler.md) and the table definitions for [tasks](../../../packages/scheduler/src/repositories/scheduler-repository-task.ts), [executions](../../../packages/scheduler/src/repositories/scheduler-repository-execution.ts) and [logs](../../../packages/scheduler/src/repositories/scheduler-repository-log.ts).
