# @h-ai/runner Data structures

<!-- translation: partial -->

[Chinese source](runner.md) · [Configuration](../configuration/runner.en.md) · [API reference](../function/runner.en.md)

Use the same relational database for all nodes of one runner. Job ownership is checked by lease and generation. Redis does not decide which node owns an execution.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_runner_executions` | ID, scope, kind, request/reuse keys, validated request and environment, state, owner and pinned node generations, lease/queue/run deadlines, resource limits, result and container data, reconciliation and warm-pool state. The reuse key may be null. |
| `hai_runner_events` | `id` primary key, `execution_id`, `sequence_number`, `event_json`, `created_at`. Read by execution and sequence. |
| `hai_runner_gate` | Single row `id=1`. `revision` starts at 0 and changes in shared capacity transactions. |

Field constraints, defaults and retention details are available in the [Chinese reference](runner.md).
