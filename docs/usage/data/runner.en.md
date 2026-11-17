# @h-ai/runner Data structures

[Chinese source](runner.md) · [Configuration](../configuration/runner.en.md) · [API reference](../function/runner.en.md)

<a id="tables"></a>

## Database tables

Use shared RelDB so nodes agree on ownership and deadlines. Times are Unix milliseconds; writes use the database clock. The table below uses the RelDB field types before backend-specific mapping.

### `hai_runner_executions`

| Field or table | Shape and meaning |
| --- | --- |
| `id`, `scope_key`, `kind` | Required text; execution primary key, authorization scope and registered job kind. |
| `request_key`, `reuse_key` | Text request fingerprint and optional unique deduplication key. |
| `request_json`, `environment_key` | JSON snapshot of validated input, scope, environment, limits and timeout; optional text environment ID. |
| `state`, `reason` | Required text state and nullable reason. |
| `owner_node`, `owner_generation`, `owner_process_json` | Nullable text node and generation plus JSON process identity. |
| `pinned_node`, `pinned_generation`, `parent_id` | Nullable text: required node/generation for the task and the parent execution ID. |
| `leased_until`, `queue_until`, `run_until` | Required integer deadlines for the lease, queue and run. |
| `event_sequence`, `event_bytes` | Required integers: event cursor and stored bytes. `event_bytes` has SQL default `0`. |
| `cpu_milli`, `memory_mib`, `pids`, `scratch_mib` | Required integer resource budgets: millicores, RAM in MiB, processes and scratch MiB. |
| `result_json`, `container_json`, `reconciliation_json` | Nullable JSON result, container identity/state and operator reconciliation record. |
| `created_at`, `updated_at`, `reconciled_at` | Integer timestamps; reconciliation time may be null. |
| `capacity_class`, `concurrency_key`, `concurrency_limit` | Required text capacity class, nullable text concurrency group, required integer limit. |
| `pool_fingerprint`, `pool_limit`, `warm_state` | Optional pool identity (text), capacity (integer) and readiness (text). |

Queues, leases, scope/capacity, concurrency, parent execution, deadlines and cleanup each have indexes. SQL defaults apply only where listed.

<a id="events"></a>

## Events, capacity and cleanup

| Field or table | Shape and meaning |
| --- | --- |
| `hai_runner_events` | String primary key `id` and execution `execution_id`; integer `sequence_number` and `created_at`; JSON `event_json`. Indexed by execution and sequence. |
| `hai_runner_gate` | Integer primary key `id=1` and integer `revision` (seeded to `0`). Resource updates change the revision inside the shared transaction. |

Completed records normally expire after 7 days. When it is unclear whether the original job completed, records remain until reconciliation. There are no Redis keys: the running node owns local process/container objects; other nodes read the database.
