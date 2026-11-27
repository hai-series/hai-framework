# @h-ai/tools-runner Data Structures

[简体中文](tools-runner.md) · [日本語](tools-runner.ja.md)

[Module README](../../../packages/tools-runner/README.en.md) · [Configuration](../configuration/tools-runner.en.md) · [API reference](../function/tools-runner.en.md)

After submitting a background tool call, use the receipt to retrieve status and output. Tools Runner delegates persistence to Runner. The host stores file bytes. [Artifact contract](tools.en.md#artifact-access)

<a id="runtime-tasks"></a>

## Tasks and receipts

`ToolRun` is a snapshot of a task. A successful submission means Runner accepted the task. Check `status` to see whether the tool finished successfully. Resubmitting an existing task returns its current status and any stored output or failure reason.

| Field | Meaning |
| --- | --- |
| `receipt.id` | A Runner-generated execution ID of 64 hexadecimal characters |
| `receipt.key` | The idempotency key used for submission. The service generates one if the caller omits it |
| `status` | The current persisted state, described below |
| `output` | The JSON result of a successful execution. Addition returns the number `5` |
| `failure` | Optional failure reason recorded by Runner, such as `handler-failed` or `queue-timeout` |
| `events` and `next` | This page of events and the cursor for the next read. Submission returns an empty event list and cursor `0`. A status query can return saved events |

Save the complete `receipt` and use it with the authenticated `scope` in the same service to inspect or cancel the task. The service looks up the key and verifies the execution ID and ownership. If the submission response is lost, call `find` with the original key. A successful lookup with no match returns `data: undefined`. A caller can inspect existing tasks for the same principal and service even after the tool is disabled.

| Status | What you can confirm |
| --- | --- |
| `queued` | Runner saved the task and is waiting for a worker to claim it |
| `running` | A worker claimed the task. Continue checking its status |
| `cancelling` | Runner recorded a stop request and is waiting for the task to stop |
| `succeeded` | The task completed successfully. Read the result from `output` |
| `failed` | The task failed. Consult `failure` and any saved events |
| `cancelled` | Runner cancelled the queued task or confirmed the running task stopped. The application still checks any writes that already occurred |
| `unknown` | Runner could not confirm the execution outcome. Check what happened before deciding whether to retry. [Runner reconciliation](../function/runner.en.md#reconciliation) |

If `invoke()` receives cancellation during persistence and Runner then accepts the task, the `CANCELLED` error includes the full receipt in `ext.receipt`. The service attempts to cancel the task when it generated the key. With a caller-provided key, inspect the task first, then call `cancel()` if appropriate. If Runner rejects the submission, `invoke()` returns the Runner error. Closing the Tools service unregisters its handler. Runner continues to manage existing tasks. [Submission and cancellation](../function/tools-runner.en.md#services)

<a id="example-data"></a>

### Progress and result of a tool run

These are two synthetic snapshots of the same task, showing the returned `data`. The application uses `{ tenantId: 'demo', userId: 'alice' }` as the trusted identity and submits `sum` to the `sum-demo` service with input `{ a: 2, b: 3 }` and the key `sum-2-plus-3`. The first submission returns a queued receipt. [Runnable addition service](../function/tools-runner.en.md#service-example)

```json
{
  "receipt": {
    "id": "263f23b73db46ef9b8f3c891120f39d541a55d2b9d8b99116ec66def48fff51d",
    "key": "sum-2-plus-3"
  },
  "status": "queued",
  "events": [],
  "next": 0
}
```

A later query with the same receipt reports success and the number `5`. The addition handler emits no events, so the cursor stays at `0`.

```json
{
  "receipt": {
    "id": "263f23b73db46ef9b8f3c891120f39d541a55d2b9d8b99116ec66def48fff51d",
    "key": "sum-2-plus-3"
  },
  "status": "succeeded",
  "output": 5,
  "events": [],
  "next": 0
}
```

<a id="tool-events"></a>

### Continue reading events and identify failures

A separate synthetic run uses the same addition input with the key `sum-permission-check`. Suppose Runner accepts the task and the worker then denies execution when it rechecks permissions. The lookup itself succeeds, with `ToolRun.status` set to `failed` and `failure` set to `handler-failed`. If Runner saved the tool error event, `events` contains an item like the one below. `createdAt` is an epoch timestamp in milliseconds.

```json
{
  "sequence": 1,
  "data": {
    "type": "tool-error",
    "error": {
      "code": "hai:tools:024",
      "message": "Tool execution is not authorized (traceId: demo-sum-42)",
      "httpStatus": 403,
      "traceId": "demo-sum-42"
    }
  },
  "createdAt": 1767225600000
}
```

After `inspect(receipt, context, { after: 0 })` returns sequence `1`, pass `next`, now `1`, as the next cursor. Each read returns up to 100 events. With no further events, the list is empty and the cursor stays at the supplied value. This example assumes the first submission used `en-US`. Retries with the same key preserve that language, and older tasks without a stored language use the worker's default language.

<a id="size-and-retention"></a>

## Payload limits and retention

| Data | Limit and handling |
| --- | --- |
| Submission, each event, and final output | Runner limits each of these to 512 KiB of JSON. A task can store up to 16 MiB of events in total. Its event count is limited by `maxEvents`, which defaults to 10,000 |
| An input file or artifact from a container job | A file is limited to 50 MiB. Total container inputs also respect the environment's `scratchMiB` limit, using the smaller budget. Individual jobs can set lower limits. Pass authorized references for file contents. [Job limits](../function/tools-runner.en.md#job-tools) |
| Tasks, events, and idempotency records | Runner's `retentionMs` keeps settled tasks for seven days by default. Unreconciled `unknown` records stay until reconciliation. After cleanup, `find` can succeed with `undefined`. For longer-lived deduplication, the application keeps its own record of business operations. [Runner retention](../configuration/runner.en.md#configuration-fields) |
