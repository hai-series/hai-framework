# @h-ai/tools data structures

[简体中文](tools.md) · [日本語](tools.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/tools.en.md) · [API reference](../function/tools.en.md)

After submitting a server-side tool, a client uses its receipt to check progress and an artifact reference to read the file or page produced. Runner persists executions, and the host checks artifact access.

<a id="runtime-data"></a>

## In-process data

Tools owns no database tables, cache keys or persistent leases. Lightweight definitions and registries live in the current process and disappear on `clear()` or exit. Server tasks reuse Runner storage without new queues or execution-state tables.

| Data | Owner and lifecycle |
| --- | --- |
| Implementations, Schemas, titles, examples and groups | Assembled by the host on each node; not shared task state |
| Enablement and authorization | Trusted host configuration; rechecked at submission and execution |
| Tasks, idempotency keys, leases, status and events | [Runner](runner.en.md); kind `hai.tools.<id>.v1` |
| File and artifact bytes | [Storage](storage.en.md); host callbacks read and publish |
| Document versions, ownership and conflicts | Business service; `baseVersion` guards the final write |
| MCP service list and Broker | [AI](ai.en.md) and host; not duplicated in Tools |

<a id="runtime-tasks"></a>

## Tasks and receipts

`ToolRun` includes `receipt: { id, key }`, Runner `status`, optional `output/failure`, `events` and incremental cursor `next`. Use `inspect(receipt, context, { after })` to continue reading. Retain the entire receipt: each node checks service and principal ownership rather than accepting a task ID alone.

`queued/running/cancelling` are nonterminal. Cancellation requests a stop; Runner records actual completion, failure and cleanup. `service.close()` neither deletes tasks nor proves they stopped.

<a id="example-data"></a>

### Progress and result of a tool run

Keep the receipt to query progress or more events without resubmitting the task.

```json
{
  "receipt": {
    "id": "execution-42",
    "key": "order-42-preview"
  },
  "status": "succeeded",
  "output": {
    "artifactId": "artifact-42"
  },
  "events": [],
  "next": 0
}
```

execution-42 succeeded and references artifact-42. No events are shown, so next is 0. A receipt does not grant public access.

<a id="artifact-access"></a>

## Artifact access contract

The host implements `ToolArtifactAccess` and checks the current principal and final commit conditions for every operation.

| Callback/data | Structure and purpose |
| --- | --- |
| `read(context, { id })` | `HaiResult<ToolArtifact>` with `id/name/mediaType/data` and optional `kind/version` |
| `publish(context, { name, kind, mediaType, data, id? })` | Store bytes and return an authorized reference; host handles idempotency, ownership and retention |
| `save(context, { id, baseVersion, content })` | Optional version-conditional write returning a reference; host reports conflicts |
| `ToolArtifactReference` | `{ id, title, kind, version, mediaType }`, used in tool results and subsequent UI reads |

Job output uses stable execution/output identities to support retry deduplication; the host must still validate publishing access and idempotency. Shared deployments use the same Storage and Runner database. One node's memory or local temporary path is not a shared artifact store.

Browser egress proxy settings belong to the host deployment and reach jobs through `HAI_TOOL_BROWSER_PROXY`. They are neither user input nor shared business state. Keep proxy credentials out of model arguments and output.

Model messages, events and logs contain only necessary structured data, sanitized errors and authorized references. Do not put secrets, images, audio/video or large byte bodies into definitions or LLM context. Downloads, Range requests and version reads remain subject to host authorization.

website_video capture, script, editable storyboard, per-shot audio, subtitles, cover, project and video are host-authorized artifacts. captureId/storyboardId/audioIds support recovery but do not grant public download access. Reuse audio only when narration still matches; final publication rechecks ownership.

`service.find(key, context)` reads the existing Runner idempotency record and returns success: true with data: undefined when absent (projected to null by the application HTTP API), without a new pending-submission table. Cancellation, disabling and lookup are distinct; the principal can still inspect owned receipts after disabling.

`preview_build` reads only an authorized ZIP and publishes a new self-contained HTML reference. The ZIP, sources and HTML use the same ownership checks. Build directories are temporary task data cleaned by Runner, without a persistent build service. Expanded input is limited to 8 MiB, each source and final HTML to 1 MiB, and the fixed build command to 60 seconds; these tighter limits take precedence over generic file budgets. A failed build creates no new preview artifact.

### Reference a generated file or page

Return an artifact ID and display metadata while the host stores bytes and checks read permissions.

```json
{
  "id": "artifact-42",
  "title": "Order preview",
  "kind": "html",
  "version": "version-1",
  "mediaType": "text/html"
}
```

artifact-42 is an HTML preview at version-1, used to check later edits. HTML bytes are not included.

## Size and retention

ToolService inherits Runner's 512 KiB JSON limit independently for submission, each event and final output. Job file/artifact bytes are limited to 50 MiB; container input totals also respect scratchMiB, using the smaller bound. These limits are not interchangeable; pass authorized references for file bodies. [Runner](runner.en.md) owns total event bytes/count and task/idempotency retention. Settled tasks default to seven days. After cleanup, find succeeds with data: undefined, which does not prove a request was never accepted or was cancelled. The host owns any longer-lived business deduplication.
