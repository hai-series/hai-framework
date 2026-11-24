# @h-ai/runner Data structures

[简体中文](runner.md) · [日本語](runner.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/runner.en.md) · [API reference](../function/runner.en.md)

After a container job is submitted, Runner stores its state, resource budget, and progress events. A reconnecting client can resume reading events with the original execution ID.

<a id="tables"></a>

## Database

Runner keeps tasks, resource limits and execution events in shared [RelDB](reldb.en.md). Nodes use the database clock to check deadlines.

The module uses 3 tables.

| Table | Purpose |
| --- | --- |
| [`hai_runner_executions`](#table-hai-runner-executions) | Track job state, ownership, resource limits and results. |
| [`hai_runner_events`](#table-hai-runner-events) | Read progress and output in order, including after reconnecting. |
| [`hai_runner_gate`](#table-hai-runner-gate) | Coordinate transactions that check shared capacity. |

<a id="table-hai-runner-executions"></a>

### `hai_runner_executions`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Execution primary key. | `execution-42` |
| `scope_key` | `TEXT` | No | — | Key of the job's authorization scope. | `<scope-key>` |
| `reuse_key` | `TEXT` | Yes | — | Unique reuse key that lets repeated submissions find the existing execution. | `NULL` |
| `request_key` | `TEXT` | No | — | Key used to verify the request parameters. | `<request-key>` |
| `kind` | `TEXT` | No | — | Registered job type. | `hai.tools.example.v1` |
| `request_json` | `JSON` | Yes | — | Job input, scope, environment, resources and timeout. The example is an excerpt. | `{"input":{"orderId":"order-42"}}` |
| `environment_key` | `TEXT` | Yes | — | Execution environment selected for a container job. | `NULL` |
| `state` | `TEXT` | No | — | Current execution state. | `queued` |
| `reason` | `TEXT` | Yes | — | Reason a job failed or stopped. | `NULL` |
| `owner_node` | `TEXT` | Yes | — | ID of the node holding the execution lease. | `null` |
| `owner_generation` | `TEXT` | Yes | — | Identifies the node startup that holds the lease. | `null` |
| `owner_process_json` | `JSON` | Yes | — | Identity of the local process that owns the job. | `NULL` |
| `pinned_node` | `TEXT` | Yes | — | Specific node required to run the job. | `NULL` |
| `pinned_generation` | `TEXT` | Yes | — | Specific node startup required to run the job. | `NULL` |
| `parent_id` | `TEXT` | Yes | — | Parent execution ID. | `NULL` |
| `leased_until` | `BIGINT` | No | — | Deadline for the current execution lease. | `0` |
| `queue_until` | `BIGINT` | No | — | Deadline for claiming the queued job. | `1794873660000` |
| `run_until` | `BIGINT` | No | — | Deadline once the job starts running. | `0` |
| `event_sequence` | `BIGINT` | No | — | Latest event sequence, starting at `0` before any events. | `0` |
| `event_bytes` | `BIGINT` | No | `0` | Bytes used by stored events. | `0` |
| `cpu_milli` | `BIGINT` | No | — | CPU limit in millicores. | `1000` |
| `memory_mib` | `BIGINT` | No | — | Memory limit in MiB. | `256` |
| `pids` | `BIGINT` | No | — | Maximum process count. | `64` |
| `scratch_mib` | `BIGINT` | No | — | Temporary storage limit in MiB. | `64` |
| `result_json` | `JSON` | Yes | — | Execution output. A successful result is stored under `value`. | `NULL` |
| `created_at` | `BIGINT` | No | — | Time the execution was queued. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time of the execution record. | `1794873600000` |
| `container_json` | `JSON` | Yes | — | Container identity used for cleanup and reconciliation. | `NULL` |
| `reconciliation_json` | `JSON` | Yes | — | Outcome recorded after reconciliation. | `NULL` |
| `reconciled_at` | `BIGINT` | Yes | — | Time reconciliation was recorded. | `NULL` |
| `capacity_class` | `TEXT` | No | — | Class of capacity the job uses. | `tool` |
| `concurrency_key` | `TEXT` | Yes | — | Group key used for concurrency limits. | `NULL` |
| `concurrency_limit` | `BIGINT` | No | — | Maximum concurrent jobs in that group. | `1` |
| `pool_fingerprint` | `TEXT` | Yes | — | Fingerprint used to match the warm pool. | `NULL` |
| `pool_limit` | `BIGINT` | Yes | — | Warm pool capacity limit. | `NULL` |
| `warm_state` | `TEXT` | Yes | — | Whether the warm container is ready or transferred to a job. | `NULL` |

Times are Unix milliseconds. Indexes support queues, node leases, scope and capacity, concurrency groups, parent executions, cleanup and deadlines.

<a id="example-data"></a>

<a id="one-queued-or-running-job"></a>

#### Example · One queued or running job

Track work, owner, resource budget and state so nodes coordinate one execution.

```json
{
  "id": "execution-42",
  "kind": "hai.tools.example.v1",
  "state": "queued",
  "owner_node": null,
  "owner_generation": null,
  "cpu_milli": 1000,
  "memory_mib": 256,
  "pids": 64,
  "scratch_mib": 64,
  "created_at": 1794873600000,
  "updated_at": 1794873600000,
  "event_sequence": 0,
  "event_bytes": 0
}
```

This excerpt shows a queued `execution-42` with no owner. Its resource limits are one CPU, 256 MiB RAM, 64 processes and 64 MiB scratch space; no events have been recorded. `created_at` and `updated_at` are Unix milliseconds.

<a id="events"></a>

<a id="table-hai-runner-events"></a>

### `hai_runner_events`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Event primary key. | `event-42` |
| `execution_id` | `TEXT` | No | — | Execution that emitted the event. | `execution-42` |
| `sequence_number` | `BIGINT` | No | — | Event sequence within the execution. | `1` |
| `event_json` | `JSON` | Yes | — | Event data emitted by the job, stored under `value`. | `{"value":{"type":"progress"}}` |
| `created_at` | `BIGINT` | No | — | Time the event was written. | `1794873600000` |

Indexed by execution ID and sequence number.

<a id="ordered-messages-from-a-job"></a>

#### Example · Ordered messages from a job

Persist ordered progress or output so a reconnecting client can resume reading without rerunning work.

```json
{
  "id": "event-42",
  "execution_id": "execution-42",
  "sequence_number": 1,
  "created_at": 1794873600000
}
```

event-42 is execution-42’s first event. event_json holds its actual message, omitted from this linkage excerpt.

<a id="table-hai-runner-gate"></a>

### `hai_runner_gate`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `BIGINT` | No | — | Fixed primary key for the one row inserted on initialization. | `1` |
| `revision` | `BIGINT` | No | — | The initial row gets `0`. Capacity transactions update the value to coordinate concurrent checks. | `1` |

Completed records normally expire after 7 days. When it is unclear whether the original job completed, records remain until reconciliation. There are no Redis keys: the running node owns local process/container objects; other nodes read the database.

<a id="coordinate-shared-capacity-checks"></a>

#### Example · Coordinate shared capacity checks

Coordinate capacity checks before concurrent claims so nodes do not all spend the same spare capacity.

```json
{
  "id": 1,
  "revision": 1
}
```

The table has one id:1 row. revision changes during coordination; it is neither a run count nor permanent ownership.
