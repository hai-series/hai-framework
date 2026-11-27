# @h-ai/runner Data Structures

[简体中文](runner.md) · [日本語](runner.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/runner.en.md) · [API reference](../function/runner.en.md)

Alice generates a November 2026 report in the `demo` tenant. The API node saves the submission and returns an execution ID. An execution node claims the job and records its progress and final result. If the page disconnects, it can read the next events using the same scope, execution ID and last event sequence. This report runs in a host handler without a container or a parent execution.

<a id="report-receipt"></a>

## Find report progress from its receipt

Run this code on the server after initialization. The execution node has registered `report.v1`. The fixed scope illustrates values the server obtains from authentication. The page keeps the same business idempotency key when retrying. [Quick start and handler example](../function/runner.en.md#quick-start)

```ts
import { runner } from '@h-ai/runner'

const scope = { tenantId: 'demo', userId: 'alice' }
// Submit this month's report for the example scope. Success returns a receipt with an ID.
const accepted = await runner.submit({
  scope,
  kind: 'report.v1',
  input: { month: '2026-11' },
  idempotencyKey: 'report-2026-11',
  reuseKey: 'monthly-report-2026-11',
  locale: 'en-US',
})
if (!accepted.success)
  throw new Error(accepted.error.message)
const id = accepted.data.id
```

When the first submission returns `success: true`, `data` contains the execution receipt below. `queued` means the database has saved the job. Runner commits the output after the handler returns successfully. These example timestamps are Unix milliseconds from the database.

```json
{
  "id": "11dd5ca46347e93111bd771e6bd59e04d4f9c8b4ba9f2b545313eebfc8da83fd",
  "status": "queued",
  "createdAt": 1796083200000,
  "updatedAt": 1796083200000
}
```

Use `runner.get(scope, id)` for the latest receipt. On success, read `data.status` to see how far the report has progressed. `owner` appears when both the node ID and generation have been recorded. Container jobs also include `environmentId`, and reconciled unknown jobs include `reconciledAt`.

| `status` | What you can read | Next step |
| --- | --- | --- |
| `queued` | The accepted ID and timestamps. Output and events are pending. | Keep the ID and poll, or use `runner.cancel(scope, id)` to cancel the queued job. |
| `running` | The current owner and any committed events. | Read event pages and check for the final result. |
| `cancelling` | A stop request and any previously committed events. `failure` may already show a timeout or that the parent ended. | Wait for stopping and cleanup. The job still consumes capacity. |
| `succeeded` | The report result in `output`, for example `{"month":"2026-11","rows":120}`. If the handler returns JSON `null`, `output` is `null`. | Use the result and keep a copy of the report if the application needs it. |
| `failed` | The reason, such as `queue-timeout`, `run-timeout`, or `handler-failed`, and any committed events. | Check the reason and any business effects before deciding whether to start a new execution. |
| `cancelled` | The task has ended. Previously committed events remain readable, and a control child may show `parent-ended`. | Stop polling and keep the record as needed. |
| `unknown` | `owner-lost` or `cleanup-unconfirmed`. `reconciledAt` records when resource cleanup was verified. The business outcome still needs review. | Keep the ID and have an operator verify and release resources on the original execution node. |

<a id="tables"></a>

## Database

Runner uses these four tables in shared RelDB. Initialization creates missing tables and indexes and checks that existing tables contain every required column. A missing column causes initialization to fail. The tables below use RelDB logical types. Timestamps and deadlines use the database clock and Unix milliseconds. `—` indicates that the database column has no declared default. Values the application supplies during submission, claim or later writes are described separately. [RelDB data structures](reldb.en.md)

| Table | Purpose |
| --- | --- |
| [`hai_runner_executions`](#table-hai-runner-executions) | Store the input, status, owner, capacity, result and reconciliation record for each execution. |
| [`hai_runner_events`](#table-hai-runner-events) | Store published progress by execution and sequence number. |
| [`hai_runner_idempotency`](#table-hai-runner-idempotency) | Keep additional business idempotency keys accepted by reused submissions. |
| [`hai_runner_gate`](#table-hai-runner-gate) | Serialize transactions that need consistent checks and updates. |

<a id="table-hai-runner-executions"></a>

### `hai_runner_executions`

| Field | Type | Nullable | Database default | Purpose | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Execution primary key. When a client supplies a business idempotency key, the ID derives from the scope, job kind and key. | `<report-id>` |
| `scope_key` | `TEXT` | No | — | Hash of the tenant and user IDs used to scope reads and writes. | `<scope-hash>` |
| `reuse_key` | `TEXT` | Yes | — | Hash of the scope, kind and reuse key, unique when present. Released after settlement or reconciliation. | `<reuse-hash>` |
| `request_key` | `TEXT` | No | — | Fingerprint used to check business inputs when a key is reused. | `<request-hash>` |
| `kind` | `TEXT` | No | — | Handler kind registered on the execution node. | `report.v1` |
| `request_json` | `JSON` | Yes | — | Runner writes a request snapshot with scope, input, execution timeout, and optional locale, environment and effective resources. | `{"input":{"month":"2026-11"},"locale":"en-US"}` (excerpt) |
| `environment_key` | `TEXT` | Yes | — | Hash of the container environment snapshot used to match eligible execution nodes. | `NULL` |
| `state` | `TEXT` | No | — | Execution state, exposed as `status`. New submissions start in `queued`. | `queued` |
| `reason` | `TEXT` | Yes | — | Available failure, stop or lease-loss reason, exposed as `failure`. | `run-timeout` |
| `owner_node` | `TEXT` | Yes | — | Execution node that claimed the job. | `reports-01` |
| `owner_generation` | `TEXT` | Yes | — | Generation of that node's current startup. | `<generation-uuid>` |
| `owner_process_json` | `JSON` | Yes | — | Host jobs can store the original PID, host evidence and process start identity at claim time. | `{"pid":4121,"hostKey":"<host-hash>","started":"312345"}` |
| `pinned_node` | `TEXT` | Yes | — | Target node, set explicitly or inherited from the parent. | `NULL` |
| `pinned_generation` | `TEXT` | Yes | — | Target generation inherited by a control child from its parent. | `NULL` |
| `parent_id` | `TEXT` | Yes | — | Parent execution ID for a control child. Runner maintains this association in application logic. | `NULL` |
| `leased_until` | `BIGINT` | No | — | Current owner's lease deadline. Runner writes `0` on submission, then sets and renews it after claim. | `0` |
| `queue_until` | `BIGINT` | No | — | Queue deadline calculated from `queueTimeoutMs` at submission. | `1796083500000` |
| `run_until` | `BIGINT` | No | — | Execution deadline calculated from the saved `runTimeoutMs` at claim. Runner writes `0` on submission. | `0` |
| `event_sequence` | `BIGINT` | No | — | Most recent committed event sequence. Runner starts it at `0`. | `1` |
| `event_bytes` | `BIGINT` | No | `0` | Bytes of event JSON stored for the execution, including the `value` wrapper. | `29` |
| `cpu_milli` | `BIGINT` | No | — | CPU reserved by the scheduler, in millicores. | `0` |
| `memory_mib` | `BIGINT` | No | — | Memory reserved by the scheduler, in MiB. | `0` |
| `pids` | `BIGINT` | No | — | Process budget reserved by the scheduler. | `0` |
| `scratch_mib` | `BIGINT` | No | — | Writable temporary storage reserved by the scheduler, in MiB. | `0` |
| `result_json` | `JSON` | Yes | — | Committed successful result stored under `value` and exposed as `output`. | `{"value":{"month":"2026-11","rows":120}}` |
| `created_at` | `BIGINT` | No | — | Time at which Runner first wrote the execution row. | `1796083200000` |
| `updated_at` | `BIGINT` | No | — | Most recent recorded update time, for example after renewing or reaching a terminal state. | `1796083202000` |
| `container_json` | `JSON` | Yes | — | Container creation and cleanup evidence, including the engine, staging identity, and creation attempt or full container ID. | `NULL` |
| `reconciliation_json` | `JSON` | Yes | — | Operator, reason and any applicable resource-stop attestation recorded on the original node. | `{"operatorId":"ops-1","reason":"Report worker stopped","hostResourcesStopped":true}` |
| `reconciled_at` | `BIGINT` | Yes | — | Time at which Runner recorded the resource verification. | `NULL` |
| `capacity_class` | `TEXT` | No | — | Scheduling capacity class. The submission defaults to `default`, and trusted tool jobs may use `tool`. | `default` |
| `concurrency_key` | `TEXT` | Yes | — | Shared concurrency group derived from the job kind and concurrency key. | `NULL` |
| `concurrency_limit` | `BIGINT` | No | — | Running limit for the concurrency group. Runner writes `0` when no group is supplied. | `0` |
| `pool_fingerprint` | `TEXT` | Yes | — | Pool and environment snapshot fingerprint used to verify requests. Claiming matches the environment, concurrency group and limits. `minReady` sets the warm target. | `NULL` |
| `pool_limit` | `BIGINT` | Yes | — | Warm pool total capacity, `maxTotal`. | `NULL` |
| `warm_state` | `TEXT` | Yes | — | Standby container records use `starting`, `ready`, or `transferred`. Ordinary executions leave this field empty. | `NULL` |

The primary key protects the execution ID, and a unique constraint protects non-null reuse keys. Other indexes support claims, quotas and cleanup.

| Index | Column order |
| --- | --- |
| `hai_runner_queue_idx` | `state`, `kind`, `created_at` |
| `hai_runner_owner_idx` | `owner_node`, `state`, `leased_until` |
| `hai_runner_scope_idx` | `scope_key`, `capacity_class`, `state` |
| `hai_runner_concurrency_idx` | `concurrency_key`, `state` |
| `hai_runner_parent_idx` | `parent_id` |
| `hai_runner_retention_idx` | `state`, `reconciled_at`, `updated_at`, `id` |
| `hai_runner_queue_due_idx` | `state`, `queue_until` |
| `hai_runner_lease_due_idx` | `state`, `leased_until` |
| `hai_runner_run_due_idx` | `state`, `run_until` |

<a id="example-data"></a>
<a id="one-queued-or-running-job"></a>
<a id="example--one-queued-or-running-job"></a>

#### Example · The queued report row

This excerpt corresponds to the receipt above. `<report-id>` refers to this execution ID in the field tables and later examples. The application requested no explicit resources, so Runner writes `0` in all four resource columns. The job still counts toward concurrency while running. `queue_until` adds the default `300000` milliseconds to the acceptance time.

```json
{
  "id": "11dd5ca46347e93111bd771e6bd59e04d4f9c8b4ba9f2b545313eebfc8da83fd",
  "kind": "report.v1",
  "request_json": {
    "scope": { "tenantId": "demo", "userId": "alice" },
    "input": { "month": "2026-11" },
    "locale": "en-US",
    "runTimeoutMs": 300000
  },
  "state": "queued",
  "owner_node": null,
  "queue_until": 1796083500000,
  "event_sequence": 0,
  "event_bytes": 0
}
```

The handler reads the locale saved on the first submission from `RunnerContext.locale`. A retry in another locale still returns the existing execution. When a saved request omits `locale`, the handler sees `undefined` and the host chooses a default. Execution ID and additional-key lookups use the scope supplied by the server.

<a id="events"></a>
<a id="table-hai-runner-events"></a>

### `hai_runner_events`

| Field | Type | Nullable | Database default | Purpose | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Event primary key derived from the execution ID and sequence. | `<event-id>` |
| `execution_id` | `TEXT` | No | — | ID of the execution that produced the event. Runner maintains this association. | `<report-id>` |
| `sequence_number` | `BIGINT` | No | — | Increasing sequence within an execution, starting at `1`. | `1` |
| `event_json` | `JSON` | Yes | — | Runner stores the JSON passed to `context.emit` under `value`. | `{"value":{"phase":"reading"}}` |
| `created_at` | `BIGINT` | No | — | Database time at which Runner successfully wrote the event. | `1796083201100` |

`hai_runner_event_cursor_idx` covers `(execution_id, sequence_number)`. Runner updates the execution's event counters and inserts the event in one transaction. Each event value can use up to 512 KiB. The total is subject to `maxEvents` and 16 MiB of event JSON per execution. The event count defaults to 10,000. Cleanup deletes associated events in the same transaction as the execution. [Runner configuration reference](../configuration/runner.en.md#configuration-fields)

<a id="ordered-messages-from-a-job"></a>
<a id="example--ordered-messages-from-a-job"></a>
<a id="example-event"></a>

#### Example · Resume report events after a disconnect

The handler emits `{"phase":"reading"}` while loading the report data. The first committed event contains these fields.

```json
{
  "execution_id": "11dd5ca46347e93111bd771e6bd59e04d4f9c8b4ba9f2b545313eebfc8da83fd",
  "sequence_number": 1,
  "event_json": { "value": { "phase": "reading" } },
  "created_at": 1796083201100
}
```

Start with `runner.events(scope, id, 0, 100)`. On success, `data` is an array of events sorted in ascending order. This record appears as `{ sequence: 1, data: { phase: 'reading' }, createdAt: 1796083201100 }`. Save `sequence: 1` after consuming the event, then pass `after: 1` on reconnect to read higher sequences. An empty array indicates no further committed events at the time of the query. Use `runner.get` to check whether the execution has ended.

<a id="table-hai-runner-idempotency"></a>

### `hai_runner_idempotency`

| Field | Type | Nullable | Database default | Purpose | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Primary key derived from the scope, job kind and additional business idempotency key. | `<retry-key-hash>` |
| `execution_id` | `TEXT` | No | — | Foreign key to `hai_runner_executions.id`. Deleting the original execution cascades to this row. | `<report-id>` |

`hai_runner_idempotency_execution_idx` indexes `execution_id`. Runner derives the original report's execution ID from its first business idempotency key. Existing records remain readable by that ID or first key. While the report can still be reused, submit the same job and `reuseKey` under a different business idempotency key, `report-2026-11-retry`. The transaction that reuses the report stores this additional mapping. The row below is an example.

```json
{
  "id": "6a04517c9663a70069ea8eb9513fc8a8a0d5f6cffd32f75960fe7ed7e29dee29",
  "execution_id": "11dd5ca46347e93111bd771e6bd59e04d4f9c8b4ba9f2b545313eebfc8da83fd"
}
```

After the job ends and the reuse key is released, `runner.find(scope, 'report.v1', 'report-2026-11-retry')` still returns the original receipt during retention. Submitting different business inputs under an accepted key returns `CONFLICT`. With no matching record, `find` succeeds with `data` set to `undefined`.

This table stores the additional key's hash and the execution ID. Each distinct accepted key takes one row. Retrying the same key reuses its row. Keep this table alongside the execution table because submission, recovery, and pruning rely on it. Dropping this table alone breaks requests that look up an additional key. Reinitializing an empty table leaves the accepted mappings lost.

<a id="table-hai-runner-gate"></a>

### `hai_runner_gate`

| Field | Type | Nullable | Database default | Purpose | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `BIGINT` | No | — | Primary key. Runner creates the coordination row with `id = 1` at initialization. | `1` |
| `revision` | `BIGINT` | No | — | Runner writes `0` initially and increments it when serializing a transaction through the coordination row. | `2` |

<a id="coordinate-shared-capacity-checks"></a>
<a id="example--coordinate-shared-capacity-checks"></a>
<a id="example-gate"></a>

#### Example · Check capacity before claiming the report

When two execution nodes are ready to claim the report, submissions, claims and capacity checks are serialized on the shared coordination row. The row below shows one revision. `revision` advances as transactions use the row.

```json
{ "id": 1, "revision": 2 }
```

Runner counts capacity from execution records. Pruning executions and events leaves the coordination row in place.

Each shared database has a coordination row with `id = 1`. Operations that need consistent changes across records update that row in the same transaction before checking and writing execution records. All Runner nodes connected to that database share the lock. SQLite, PostgreSQL, and MySQL use this same transaction path. Keep both the table and its coordination row for submissions and claims to work correctly. Dropping the table makes transactions fail. Deleting the row breaks serialization.

<a id="size-and-retention"></a>

## Retention and capacity held by `unknown`

- Execution nodes prune by database time in batches of up to 128 execution records. `succeeded`, `failed`, and `cancelled` age from `updated_at`. Reconciled `unknown` records age from `reconciled_at`. `retentionMs` defaults to seven days and supports one hour through 365 days. Parent executions remain while child records exist. [Retention configuration](../configuration/runner.en.md#configuration-fields)
- Pruning runs during executor polling. After deleting records, the next check runs at least 250 ms later. After an empty batch or a failed check, it runs at least one second later. The actual rate depends on the polling interval, database, and workload. Expired records accumulate when you run API nodes alone or execution nodes are down. The execution nodes process them in batches after they return.
- Pruning an execution removes its events and additional keys in the same transaction. Afterward, `find` returns an empty result, and `get` and `events` return `NOT_FOUND`. Submitting with the original business key can start a new execution, even if it derives the same ID. The application is responsible for storing reports or business idempotency records that need to last longer.
- When a queue deadline passes, an execution node marks the `queued` job as `failed` and retention starts from that update. A run deadline requests that the `running` job stop. `running`, `cancelling`, and unreconciled `unknown` all count against their execution capacity. Lease loss or unconfirmed cleanup can lead to `unknown`. Runner holds the reservation and reuse key until successful reconciliation sets `reconciledAt`, releases the reservation, and starts the retention period. [Reconcile on the original execution node](../function/runner.en.md#reconciliation)

<a id="capacity-limits"></a>

### Limits and storage estimates

Runner limits the number of queued jobs, concurrent executions, and individual payloads. Total rows and disk usage depend on throughput, retention, additional keys, and the pruning backlog. Runner has no database-wide byte quota. An unreconciled `unknown` can remain indefinitely, along with its events and additional keys.

| Limit | What it counts |
| --- | --- |
| `maxQueued` | Counts jobs without a parent and control child jobs separately. Each defaults to 5000 queued jobs. Settled records stay until pruning. |
| Submission, output, and individual event | Each has a 512 KiB JSON limit. Submission measures the full request. An event measures the data passed to `context.emit`. |
| Total events per job | Subject to `maxEvents` (default 10000 events) and 16 MiB including the stored event's `value` wrapper. A write fails at the limit. The handler decides how to handle that result. |
| Additional idempotency keys | Each new accepted key adds one row, removed with its execution. There is no separate per-execution limit for these rows. |

For example, suppose 1000 jobs finish per day. Each stores 1 KiB of input, 1 KiB of output, and 10 events of 1 KiB each, including the `value` wrapper. With seven-day retention and pruning keeping up, expect about 7000 execution records, 70,000 events, and `7000 × (1 + 1 + 10) KiB ≈ 82 MiB` of application payload. Actual usage also includes queued work, unreconciled jobs, row overhead, indexes, WAL or transaction logs, and backups. Database space reclamation affects the disk footprint. [Queue and event settings](../configuration/runner.en.md#configuration-fields)

In production, use `hai_runner_executions.event_sequence` and `event_bytes` to measure event writes per job. Count execution records by `state` and watch for an aging pruning backlog, unreconciled `unknown` jobs, and `Managed execution retention failed` log messages. Check database size metrics to track growth of tables, indexes, and logs. Reuse the same business idempotency key on retries to avoid creating extra mappings for one request.

<a id="ai-sse"></a>

### When AI streaming data is stored in Runner

SSE transports data to the client. Runner events are written by handlers calling `context.emit`. An app can read the persisted events and deliver them through SSE or polling.

| Call path | Persistence behavior |
| --- | --- |
| Direct SSE relay of `ai.llm.chatStream()` | The caller forwards model chunks without writing to Runner tables. If `objectId`, a record store, and persistence settings allow it, AI saves the aggregated conversation separately as a ChatRecord. [AI conversation records](ai.en.md#table-hai-ai-chat-records) |
| Managed ACP running through Runner | AI combines assistant text chunks into `type: 'text'` events and calls `context.emit`. It usually flushes every 50 ms while running and also flushes as needed at tool updates or turn completion. Tool progress, approvals, and artifact references can be written too. A completed job's `output` can contain the full reply. Clients resume by reading saved events by task ID and sequence. [Managed ACP API](../function/ai.en.md#acp) |
| Tools service or custom handler using Runner | Validated tool input and final JSON output are in the execution record. Business events sent by `context.emit` go to the events table. A video tool, for example, records a phase and progress and can return authorized artifact references separately. [Tools data structures](tools-runner.en.md) |

A custom report handler can store phases such as `reading` and `exporting` along with useful progress values. Write large reports, media, or long text to the application's durable storage, and store authorized references in events and outputs. If you use managed ACP for transcript recovery after disconnects, account for both the merged text events and the final output in your storage estimate.

For ACP, measure the number of events per turn. A 60-second turn that emits a text event every 50 ms on average produces about 1,200 text events. At 1,000 turns per day and seven days of retention, those events alone amount to about 8.4 million rows. Sparse output reduces the count. Include tool and approval events separately.

<a id="runtime-data"></a>

## Local staging and runtime objects

Runner reads and writes shared state through the relational tables above and owns no cache keys. The executor holds running handlers, stop signals, container handles and standard streams. Retrieve report progress and JSON results with `events` and `get`. To keep a report file long term, have the handler write it to the application's persistent storage and put a business reference in the receipt.

For host jobs such as the report, Runner stores `owner_process_json` when the execution node can read the Linux process identity. Status and events remain readable when that evidence is missing. If the job reaches `unknown`, releasing host resources requires evidence of the original process and an operator's verification. [Verify host resources](../function/runner.en.md#reconciliation)

Container jobs also use a private staging directory on the execution node. Runner records each create attempt, original engine, and staging directory identity before creating the container. It adds the full container ID to the same evidence once available. This excerpt from `container_json` shows an attempt without a recorded full ID. Identifiers and filesystem values are illustrative.

```json
{
  "attempt": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "engine": "podman",
  "engineKey": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "stageName": "hai-runner-Ab12Cd",
  "stageKey": "2049:123456"
}
```

When only the create attempt is recorded, Runner looks for a full container ID in the staging directory. If the ID is still unavailable, the operator first verifies that the original engine's create request has ended, then uses the attempt identifier to check for a container. Saved evidence with a full `id` and no `attempt` can still be checked against the original engine, container ID and staging identity.

On a normal stop, the execution node cleans up the container and staging directory. `unknown` records with unconfirmed cleanup still occupy capacity. Database pruning applies to eligible records after retention. Any remaining resources require verification on the original node first. [Container evidence and reconciliation](../function/runner.en.md#reconciliation)
