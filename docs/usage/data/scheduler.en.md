# @h-ai/scheduler Data structures

<!-- translation: partial -->

[Chinese source](scheduler.md) · [Configuration](../configuration/scheduler.en.md) · [API reference](../function/scheduler.en.md)

Schedules, ownership and logs reside in RelDB when persistence is enabled. A unique occurrence prevents the same trigger from being claimed twice.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_scheduler_tasks` | Unique `task_id`, name, description, cron, timezone, enabled (true), idempotent and delete_after_run (false). Handler, retry and parameters are JSON. |
| `hai_scheduler_executions` | Unique `occurrence_id`, task, active task claim, status, owner, lease, attempt limits, snapshot, trigger and log data. |
| `hai_scheduler_logs` | Log ID, occurrence (nullable), task identity, trigger source/type, status and JSON payload, start/end times and duration. |

Field constraints, defaults and retention details are available in the [Chinese reference](scheduler.md).
