# @h-ai/scheduler Data structures

<!-- translation: partial -->

[Chinese source](scheduler.md) · [Configuration](../configuration/scheduler.en.md) · [API reference](../function/scheduler.en.md)

<a id="tables"></a>

## Database tables

Scheduler stores tasks and execution state in RelDB when enabled. Unlisted values come from the writer; missing nullable values are NULL.

| Field or table | Shape and meaning |
| --- | --- |
| `hai_scheduler_tasks` | Auto-increment `id`, unique business `task_id`, display `task_name`, optional `description`, `cron` and optional IANA `timezone` (UTC when omitted). Booleans: `enabled=true`, `idempotent=false`, `delete_after_run=false`. Nullable JSON: `retry`, `params`, `handler`. `created_at` and `updated_at` track changes. |
| `hai_scheduler_executions` | Auto-increment `sequence`, unique `occurrence_id`, `task_id`, nullable unique `active_task`, `status` and lease `owner`. `snapshot`, `trigger_json`, `log_json` and `logs_json` preserve task, trigger, current log and attempt logs. `log_persistence` records persistence state; `leased_until`, `attempt_count`, `max_attempts`, `created_at` and `updated_at` track deadlines, attempt budget and timestamps. |
| `hai_scheduler_logs` | Text primary key `id`, nullable `occurrence_id`, `task_id`, `task_name`, `task_type`, `trigger_type`, nullable `trigger_source`, and `status`; JSON `payload`; integer `started_at`, `finished_at` and `duration`. |

Scheduled and manual starts share the unique `active_task` claim. When a lease expires and the external effect is uncertain, the claim remains until reconciliation. Deleting logs does not release it. No Redis keys are created; local timers only schedule polls, and the database decides ownership and expiry.

For the remaining database types and constraints, compare the [Chinese reference](scheduler.md) and the table definitions for [tasks](../../../packages/scheduler/src/repositories/scheduler-repository-task.ts), [executions](../../../packages/scheduler/src/repositories/scheduler-repository-execution.ts) and [logs](../../../packages/scheduler/src/repositories/scheduler-repository-log.ts).
