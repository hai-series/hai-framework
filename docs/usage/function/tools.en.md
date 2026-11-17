# @h-ai/tools features

Use `tools` to define, register and execute business tools. Ordinary business code, UI actions and AI can call the same implementation.

[Module README](../../../packages/tools/README.en.md) · [Configuration](../configuration/tools.en.md) · [Data ownership](../data/tools.en.md)

## Choose an entry point

| Entry point | Use cases | Execution and lifecycle |
| --- | --- | --- |
| `@h-ai/tools` | Short business functions, browser-local tools and neutral definitions for model adapters | `tools.define/createRegistry` are pure definitions and factories. No `init/close`; no Runner or model SDK import |
| `@h-ai/tools/server` | Recoverable tasks, progress, cancellation, documents and container jobs | Includes the lightweight methods plus `tools.createService/createArtifactTools/createJobTools`; borrows an initialized Runner |

The lightweight entry works in browsers, but a trusted server must still verify server-side access. Keep `/server` out of frontend imports.

<a id="quick-start"></a>

## Minimal integration

```sh
pnpm add @h-ai/tools zod
```

This is an ordinary business call. The registry includes only explicitly registered tools, and a trusted server supplies the identity.

```ts
import { tools } from '@h-ai/tools'
import { z } from 'zod'

export async function calculate(objectId: string) {
  const registry = tools.createRegistry({
    authorize: ({ context }) => context.objectId === objectId,
  })
  const registered = registry.register(tools.define({
    name: 'sum',
    title: 'Sum',
    description: 'Add two numbers',
    examples: [{ label: '2 + 3', input: { a: 2, b: 3 } }],
    parameters: z.object({ a: z.number(), b: z.number() }),
    handler: ({ a, b }) => ({ total: a + b }),
  }))
  if (!registered.success)
    return registered
  return registry.execute('sum', { a: 2, b: 3 }, { objectId })
}
```

On success, `data` is `{ total: 5 }`. `title` is a UI label; the stable `name` identifies the tool in protocols and enablement rules. `examples` supplies form presets without executing or granting access. `tool.toDefinition()` and registry definitions preserve this metadata.

Use `resultHandler` when an existing service returns `HaiResult`; use `handler` for plain data. Supply exactly one. Returning a failed `HaiResult` through `handler` would wrap it as successful data.

```ts
import type { HaiResult } from '@h-ai/core'
import { tools } from '@h-ai/tools'
import { z } from 'zod'

export function createLookup(read: (id: string) => Promise<HaiResult<string>>) {
  return tools.define({
    name: 'document_lookup',
    description: 'Read an authorized document',
    parameters: z.object({ id: z.string().min(1) }),
    resultHandler: ({ id }) => read(id),
  })
}
```

<a id="api-reference"></a>

## Lightweight methods

| API | Purpose | Input | Output | Example |
| --- | --- | --- | --- | --- |
| `tools.define` | Define a tool and validate its input at execution. The default timeout is `30000` ms. Invalid definitions throw `TypeError` | `definition` | `Tool<TInput, TOutput>` | `const tool = tools.define(definition)` |
| `tools.createRegistry` | Create an empty registry. Without `authorize` it applies no registry-level authorization | `options? = {}` | `ToolRegistryOperations` | `const registry = tools.createRegistry()` |
| `tool.execute` | Validate and execute. Options can supply identity, authorization, an abort signal and a deadline | `input, options? = {}` | `Promise<HaiResult<TOutput>>` | `await tool.execute({ a: 2, b: 3 })` |
| `tool.toDefinition` | Convert parameter rules to JSON Schema. Throws if conversion is unsupported | None | `ToolDefinition` | `tool.toDefinition()` |
| `registry.register` | Add one tool. A duplicate name fails | `tool` | `HaiResult<void>` | `registry.register(tool)` |
| `registry.registerMany` | Add several tools. If any name is duplicate or any entry invalid, none are added | `tools: Tool[]` | `HaiResult<void>` | `registry.registerMany([tool])` |
| `registry.replace` | Replace an existing tool with the same name. The name must already exist | `tool` | `HaiResult<void>` | `registry.replace(updatedTool)` |
| `registry.unregister` | Remove by name. Returns `true` only if the name existed | `name` | `boolean` | `registry.unregister('sum')` |
| `registry.get` | Get the tool instance by name, or `undefined` if absent | `name` | `Tool / undefined` | `registry.get('sum')` |
| `registry.has` | Check whether a name is registered | `name` | `boolean` | `registry.has('sum')` |
| `registry.getNames` | List the registered names | None | `string[]` | `registry.getNames()` |
| `registry.getDefinitions` | List registered definitions. Throws if a parameter schema cannot be converted | None | `ToolDefinition[]` | `registry.getDefinitions()` |
| `registry.execute` | Run a registered tool. When both registry and call define authorization, both must allow it | `name, input, options? = {}` | `Promise<HaiResult<unknown>>` | `await registry.execute('sum', { a: 2, b: 3 })` |
| `registry.executeAll` | By default runs in order and stops at the first failure. With `parallel: true`, a failure does not undo already started calls | `calls: ToolInvocation[], options?` | `Promise<HaiResult<unknown[]>>` | `await registry.executeAll([{ name: 'sum', input: { a: 2, b: 3 } }])` |
| `registry.clear` | Remove all registrations. Calls already running are not cancelled | None | `void` | `registry.clear()` |
| `registry.size` | Read the number of registered tools (property) | None | `number` | `registry.size` |

`tool` and `registry` are returned instances, not independent package functions. Registries do not discover other tools. They accept instances made by `tools.define`, rejecting handwritten or copied objects.

Tool names contain 1–64 ASCII characters: start with a letter, followed by letters, digits, underscores or hyphens. Invalid names, default timeouts or handler combinations are definition errors and throw `TypeError`. Model parameters must convert to JSON Schema, usually an object Schema; unrepresentable types such as `z.date()` cannot be used directly.

`HaiToolsError` includes NOT_FOUND, ALREADY_REGISTERED, VALIDATION_FAILED, EXECUTION_FAILED, FORBIDDEN, TIMEOUT and CANCELLED under `hai:tools`. Input, authorization, timeout and cancellation failures return failed `HaiResult` values. `resultHandler` preserves existing business errors; model JSON parsing errors remain in the AI adapter.

Fixed jobs map `TIMEOUT` to `HaiToolsError.TIMEOUT`, and unsafe Office documents/projects or other known input rejections to `VALIDATION_FAILED`. Missing sandbox support/dependencies, invalid worker output and unknown worker faults remain `EXECUTION_FAILED`; they are not classified as user input errors. Public messages are localized and do not expose raw worker messages. If both the operation and container cleanup fail, the cleanup error remains primary and `error.ext.operationError` retains the sanitized original operation error. A single failure does not add this extension.

## Server task service

Install and initialize [Runner](runner.en.md), then import from `/server`. The host supplies trusted identity, enablement, authorization and artifact access. The service neither initializes nor closes the borrowed Runner.

```ts
import type { RunnerFunctions } from '@h-ai/runner'
import type { ToolArtifactAccess } from '@h-ai/tools/server'
import { tools } from '@h-ai/tools/server'

export function createDocumentService(runner: RunnerFunctions, files: ToolArtifactAccess) {
  return tools.createService({
    id: 'documents',
    runner,
    createTools: context => tools.createArtifactTools({ context, files }),
    enabled: { groups: ['documents', 'analysis'] },
    authorize: ({ context }) => context.scope.userId.length > 0,
  })
}
```

This example only checks that a trusted user exists. `files.read/publish/save` must also check the principal, resource and final commit conditions. Supply identity through `ToolServiceContext.scope`, never model parameters.

| Service method | Input | Result |
| --- | --- | --- |
| `service.catalog` | Trusted context | Enabled definitions and groups |
| `service.submit` | `{ name, input, idempotencyKey? }`, context | Runner status, `receipt: { id, key }`, events and optional output |
| `service.find` | Idempotency key, trusted context | Recover the principal's accepted task; data is undefined when absent, without claiming cancellation |
| `service.inspect` | Complete receipt, context, optional `{ after }` | Current status and incremental events; use `next` on the next read |
| `service.cancel` | Complete receipt, context | Actual status after requesting cancellation; keep reading until terminal |
| `service.invoke` | Same as submit | Submit and await completion → `HaiResult<RunnerJson>` |
| `service.close` | None | Unregister this service handler; neither closes Runner nor proves active tasks stopped |

Check `success` before reading business results. Use `invoke` when business code needs the final output. Long-running UI actions usually use `submit/inspect`, retain the entire receipt and display actual states including `queued/running/cancelling`. A cancellation receipt does not prove process exit.

`enabled` is required: union the selected groups and individual tools, then apply `exclude`. An empty object disables everything. `catalog` uses the current factory and selection without calling per-tool `authorize`; use context-dependent `createTools/enabled` to hide tools by principal. Submission and execution rebuild the enabled set and authorize again, so an old catalog does not bypass disabling.

## Reuse artifact and job tools

| Factory | Included capabilities | Host provides |
| --- | --- | --- |
| `tools.createArtifactTools` | `artifact_create/read/save`, `data_analyze` | `context`, `files`; the save tool exists only when `files.save` is supplied |
| `tools.createJobTools` | Document extraction/generation, Office conversion/recalculation, OCR, browser screenshots, website capture, project preview building and video rendering | `context`, `files`, initialized `runner`, `environments` mapping; browser jobs also require `browserProxy` |

`artifact_create` creates Markdown, HTML, tables or charts; table/chart content must be a JSON object. `artifact_save` includes `baseVersion`; the host handles conflicts and the final write. `data_analyze` computes count, sum, mean, minimum and maximum from structured rows and publishes table/chart references. It does not execute arbitrary code.

Jobs enter the catalog only when bound to environments: `documents` → `documents_extract/documents_generate`; `office` → `office_convert/office_recalculate`; `ocr` → `ocr_recognize`; `browser` → `browser_navigate`; `web` → `web_capture`; `preview` → `preview_build`; `video` → `video_render`. See [job instructions](../../../packages/tools/jobs/README.md) for exact inputs, pinned images, capabilities and network policies. `browser/web` also require a trusted host `browserProxy` in `http://non-loopback-IPv4:port` form. Reuse an existing model egress proxy if available; jobs receive it through `HAI_TOOL_BROWSER_PROXY`, not model arguments. Environment bindings still require Runner capability and network checks.

For image, audio and document rewriting, use [AI](ai.en.md)'s `ai.tools.createBuiltinTools` and combine the factories into one `ToolSet`. Tools does not depend back on AI. `video_render` consumes a prepared project archive. The AI workflow below adds capture, planning, narration and asset assembly for a complete website introduction video.

`documents_generate` accepts `format: docx/xlsx/pptx`, a title and optional paragraphs, table or slides to generate Office files in fixed formats. UTF-8 JSON source data is limited to 256 KiB, with format-specific paragraph/table validation. PPTX permits at most 6 paragraphs per slide, 160 characters each and 800 total; tables allow 6 columns and 6 data rows, with 32 characters per cell. A slide with a table allows one body paragraph of 120 characters. `slides` is PPTX-only and cannot be combined with top-level paragraphs or a table. Built-in examples fill the workbench before editing title and content.

`artifact_create` and `data_analyze` allocate stable IDs per logical output during managed execution; the host still checks retried output content for consistency. Analysis tables retain original column labels. When source data contains the editor's reserved `row_id` column, that source column receives a different field name to avoid overwriting data. Internal row IDs follow row order; generated filenames retain their extensions and stay within 160 characters.

Tool groups and environment keys are distinct: office/ocr jobs belong to the documents group, and browser/preview jobs belong to web. Enable the corresponding group and bind the environment keys; do not invent matching group names.

The service inherits Runner limits: submission parameters, each event and final output are separately limited to 512 KiB of JSON. The 50 MiB file/artifact byte limit does not permit an equally large inline JSON body. Container input totals are also bounded by the smaller of 50 MiB and environment scratchMiB. Even when a Schema allows longer text or more rows, the complete task must fit the JSON budget; use authorized file references for large content. See [Runner boundaries](runner.en.md#api-reference).

## Build a website preview from a project

`preview_build({ fileId })` reads an authorized project ZIP, uses the fixed `preview.build` job bound through optional `environments.preview`, and publishes one `text/html`, `kind: html` artifact. It belongs to the `web` group. Building a local project requires no browserProxy. The existing artifact workspace previews the result without a persistent preview gateway or new state table. Closing the preview unloads its iframe; the build container has already ended with its job.

The archive must contain `index.html` at its root. A pinned esbuild/Svelte toolchain bundles local HTML, JS/TS, CSS, supported local assets and browser-only Svelte components into self-contained HTML, including supported Vite-style root-relative asset layouts. Only fixed production fields are provided for import.meta.env; import.meta.url and runtime computed imports are unsupported. It never executes project package scripts or configuration, or installs dependencies; configuration files are ignored. SvelteKit, arbitrary npm packages and Vite plugins are unsupported. Archives cannot include node_modules. One module entry is supported, which may import multiple local modules; srcset, async/defer scripts and nested iframe documents are unsupported. Images, fonts and audio/video are embedded as data URLs; local SVG must contain no scripts or external references. Expanded content is limited to 8 MiB, each source file and final HTML to 1 MiB, and the build command to 60 seconds, within outer Runner limits. Failed builds do not publish an old HTML result. Preview still requires an iframe without same-origin access and the host parent frame-src policy; compilation does not provide unrestricted network execution.

## Editable introduction videos from websites

The AI factory `ai.tools.createBuiltinTools({ context, files, executeJob? })` adds `website_video` to the `video` group only when `executeJob` is supplied. The host restricts this callback to `web_capture/video_render` through the same service, preserving authorization, Runner and artifact access without reimplementing video generation in the app.

Input is an HTTPS `url`, with optional `goal`, `durationSeconds` from 6–30 (default 15), `width/height` (default 1280×720; even dimensions, 16:9/9:16/1:1, at most 1920×1080 total pixels), `language` (default zh-CN), and `voice/model/brandColor`. The model plans a script and storyboard from captured website content; TTS creates a WAV for each shot, followed by project assembly and video rendering.

Outputs retain SCRIPT.md, DESIGN.md, STORYBOARD.json, editable STORYBOARD.md, per-shot WAVs, SRT, a captured website cover, project ZIP, video-workflow.json and MP4. The result contains `sourceUrl/captureId/scriptId/storyboardId/audioIds/projectId/subtitlesId/coverId/videoId/durationSeconds/artifacts`. The cover comes from website capture, not a generated image presented as the website.

Retry with `captureId` to reuse capture. Edit the storyboard Markdown and pass `storyboardId` plus `audioIds` to reuse narration: shots whose audioText still equals narration retain their audio; changed narration is regenerated. The project ZIP can also be sent directly to `video_render`. Subtitles are sentence intervals, not promised word alignment. Narration that cannot fit the requested duration fails explicitly instead of being cut off.

The host must also enable both `web_capture` and `video_render` through its global selection. Hai Agent unions `workbench.selection.groups/tools`, then applies exclude, and registers `website_video` only when both dependencies are available. Selecting only the video group or website_video tool is insufficient: select both web/video groups, or explicitly select website_video/web_capture/video_render. Task-setting dependency authorization does not override global disabling.

This requires a real LLM, default WAV TTS, web/video environments and browserProxy. Long workflows may set service `runTimeoutMs` to 1200000. The coordinator uses ordinary capacity while nested jobs use their bound tool environments, avoiding tool-slot exhaustion. Real models and HyperFrames rendering need deployment acceptance separately.

## Model integration, cancellation and multiple nodes

Adapt a lightweight registry with `ai.tools.adapt(registry)`: `getDefinitions()` supplies model requests, while `execute(toolCall)` invokes the same registry. Server UIs and agents should likewise share one tool service and its authorization.

Lightweight execution uses absolute `deadline`, then per-call `timeoutMs`, tool timeout, then 30 seconds. The deadline covers async validation, authorization and handler execution. Cancellation/timeouts stop waiting and forward the signal; uncooperative functions may continue. Runner confirms process termination and cleanup.

The service registers Runner kind `hai.tools.<id>.v1` and reuses Runner tasks, leases and events. It creates no new queue or Tools state tables. Nodes use consistent service IDs, tool configuration, the shared Runner database and Storage. API nodes may use `executor: false`; execution nodes provide images and unique, restart-stable node IDs. Validate the full receipt against task, service and principal ownership rather than accepting only a task ID.

Return authorized references for large artifacts. The host still checks file reads and publication. Keep secrets and image/audio/video bodies out of logs and events.

## Development tests

`pnpm --filter @h-ai/tools test` checks the kernel and service; `pnpm --filter @h-ai/tools test:jobs` checks job protocols. Real images and browser acceptance require the job environments separately. Unit results do not certify an image.
