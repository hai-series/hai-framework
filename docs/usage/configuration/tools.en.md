# @h-ai/tools configuration

[Features](../function/tools.en.md) · [Data ownership](../data/tools.en.md)

`tools.define/createRegistry` are pure definitions and factories, with no module YAML, environment variables or `init/close`. Import server factories from `@h-ai/tools/server`; they borrow an initialized Runner.

## Definitions and lightweight execution

| Location | Field | Default and purpose |
| --- | --- | --- |
| Definition | `name/description/parameters` | Required; name has 1–64 ASCII characters, starts with a letter, then letters/digits/underscores/hyphens; Zod validates input |
| Definition | `handler` or `resultHandler` | Exactly one is required: plain data or an existing `HaiResult`, respectively |
| Definition | `title/examples` | Optional UI label and `{ label, input }[]` presets; no authorization effect |
| Definition | `timeoutMs` | Integer 0–2147483647 ms; default 30 seconds; 0 times out immediately |
| Registry | `authorize` | Optional; every registry invocation must pass when configured |
| Execution | `signal` | Cancellation signal forwarded to the handler |
| Execution | `objectId/sessionId` | Trusted identity/session, not unauthenticated model input |
| Execution | `deadline/timeoutMs` | Absolute deadline first, then call timeout, tool timeout, 30 seconds; includes validation, authorization and handler |
| Execution | `authorize` | Additional per-call check; must pass alongside registry authorization |
| Batch | `parallel` | Default false; enable only for operations that can run concurrently |

Invalid names, default timeouts and handler combinations throw `TypeError` when defined. Business execution returns `HaiResult`. Registries only accept tools created by `tools.define`. Model parameters must convert to JSON Schema, usually object parameters.

## tools.createService

| Field | Requirement/default | Purpose |
| --- | --- | --- |
| `id` | Required, 1–60 letters, digits, underscores, dots or hyphens | Runner kind `hai.tools.<id>.v1`; identical across nodes of one service |
| `runner` | Required | Initialized Runner; the service does not own its lifecycle |
| `createTools` | Required | Trusted `ToolServiceContext` → `ToolSet` or Promise; rebuilt on the execution node |
| `enabled` | Required | `ToolSelection` or context function; union groups/tools, then apply `exclude`; `{}` disables all |
| `authorize` | Required | Receives `{ context, name, input, phase }`, with `phase: 'submit'` or `'execute'`; both must allow |
| `runTimeoutMs` | 300000 ms | Execution timeout; integer 1–86400000 |
| `queueTimeoutMs` | 300000 ms | Queue timeout; integer 1–86400000 |

`ToolServiceContext` contains `scope: { tenantId, userId }` and optional `sessionId/signal`. The Runner executor supplies the real `execution` context. Do not accept identities or execution contexts claimed by clients.

`ToolSet` contains `tools`, optional `groups: { id, title, tools }[]` and `environments: Record<toolName, environmentId>`. Environment bindings select Runner environments and are checked again at execution. `ToolSelection` has `groups/tools/exclude`, each an array of names.

The catalog does not call `authorize` for every tool. Filter `createTools/enabled` by context to restrict visibility. Server authorization and final resource access still apply; hiding buttons does not disable execution.

Keep one idempotencyKey per user intent for `service.submit/invoke`. If acceptance is unknown, recover with `service.find(key, context)` rather than resubmitting a new key. Catalog disabling does not prevent owned-task lookup; principal/service checks still apply.

## Artifact and job factories

`tools.createArtifactTools({ context, files })` requires `ToolArtifactAccess.read/publish`, with optional `save`. Without `save`, it omits `artifact_save`. The host owns versions, conflicts, access and byte storage.

`tools.createJobTools({ context, files, runner, environments, browserProxy? })` supports these environment keys. Omitted keys produce no corresponding tools.

| Key | Tools | Capability and network requirements |
| --- | --- | --- |
| `documents` | `documents_extract/documents_generate` | Pinned document image; offline |
| `office` | `office_convert/office_recalculate` | Pinned Office image; offline |
| `ocr` | `ocr_recognize` | Pinned OCR image; offline |
| `browser` | `browser_navigate` | Browser capability; internal network and controlled proxy |
| `web` | `web_capture` | Website capture capability; internal network and controlled proxy |
| `preview` | `preview_build` | Pinned `preview.build` toolchain; offline |
| `video` | `video_render` | Pinned video image; offline |

`browser/web` enter the catalog only when both their environment and `browserProxy` are configured. The trusted host supplies `http://non-loopback-IPv4:port`; `RunnerLaunch.env.HAI_TOOL_BROWSER_PROXY` forwards it to the container. Model arguments cannot set or override it. An existing model egress proxy can be reused; no additional proxy service is mandatory.

browserProxy must be an HTTP root address with a complete IPv4 literal and explicit port (`http://<IPv4>:<port>`, optionally ending in /), port 1–65535. Hostnames, IPv6, credentials, other paths, query and fragments are unsupported. It rejects 0.0.0.0, 127.0.0.0/8, 169.254.0.0/16 and 224.0.0.0/4. Invalid proxies omit browser/web tools; validate deployment settings first.

office/ocr are environment keys whose jobs belong to documents; browser/preview jobs belong to web. Select documents/web and bind the required environments.

Start testing web/video environments with resources.pids: 512 and configure Runner toolCapacity to cover total concurrent reservations. Custom resource objects require all four fields. The tested browser image encountered EAGAIN with a 128 process/thread limit; 512 is a starting point from this acceptance run, not a guarantee for every image or concurrency level. Measure CPU, memory and scratch usage as well.

For this validation, set the video Runner environment to `resources.scratchMiB: 6144` and the node to `toolCapacity.scratchMiB: 8192`; these are Runner fields, not new Tools settings. HyperFrames 0.9.56 requires at least 1024 MiB free in both the temporary and output directories before rendering. With input files, Runner allocates only one quarter of total scratchMiB to tmp, so 6144 MiB leaves 1536 MiB there; a total of 512 MiB fails the check. A quota is not allocated memory, and the disk check must remain enabled. Physical node budgets must also cover concurrent jobs and the coordinator's default capacity. The 6144/8192 values are acceptance starting points, not proof that every workload or the full workflow has passed. See [job resource requirements](../../../packages/tools/jobs/README.md#配置).

Values are Runner environment IDs, not image names. Register matching capabilities, pinned images and resource/network limits; see [job instructions](../../../packages/tools/jobs/README.md) and [Runner configuration](runner.md). Installing Tools does not download images or start containers.

The AI website_video tool is registered only when `ai.tools.createBuiltinTools` receives `executeJob`; the host restricts it to web_capture/video_render in the same service. It requires a real LLM, default WAV TTS, web/video environments and browserProxy. Long workflows may explicitly use service runTimeoutMs: 1200000; see the [workflow](../function/tools.en.md#editable-introduction-videos-from-websites).

## Applications and multiple nodes

Tools has no global enable switch. Applications translate their own configuration into factories and `enabled`. Agent uses `workbench.selection` with groups/tools/exclude: omitting it selects default built-in groups; explicit `{}` disables all. See [Agent usage](../../../apps/agent/README.en.md#configuration) for its `workbench` switches, groups and environment mappings. Image/audio models remain in [AI configuration](ai.md).

Nodes of one service share the original Runner database and Storage, with consistent service IDs, definitions and environments. No new queue or state tables are created. API nodes may set Runner `executor: false`; executors use unique, restart-stable `nodeId` values. Execution nodes check current enablement and authorization again; frontend changes alone do not disable tools.

Service `close()` unregisters its own handler without closing Runner. After cancellation, continue reading until a terminal state; stopping local waiting does not prove process termination.

Parameters, each event and output also respect Runner's separate 512 KiB JSON bounds. The 50 MiB file and scratchMiB budgets are distinct; see [data boundaries](../data/tools.en.md#size-and-retention).
