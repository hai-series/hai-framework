# @h-ai/tools-runner API Reference

[简体中文](tools-runner.md) · [日本語](tools-runner.ja.md)

Tools Runner connects tools to the durable Runner queue. The application supplies an initialized Runner, the tool set, and an authorization policy. Clients can inspect status, resume reading events, and request cancellation using a receipt. For direct execution, use [Tools](tools.en.md).

[Module README](../../../packages/tools-runner/README.en.md) · [Configuration](../configuration/tools-runner.en.md) · [Data ownership](../data/tools-runner.en.md)

To migrate from `@h-ai/tools/server`, import `toolsRunner` from `@h-ai/tools-runner` and call its `createService()` and `createJobTools()`. The same service ID, inputs, idempotency keys, and receipts still address tasks in Runner.

<a id="module-dependencies"></a>

## Dependencies

| Dependency | Purpose | When required | Setup order |
| --- | --- | --- | --- |
| Node.js | Runs services and container job factories | Server processes | Import the adapter from a Node application |
| `@h-ai/core`, `zod` | Shared results, localization, and validation | Installed with the adapter | Add any packages that the application imports directly |
| `@h-ai/tools` | Defines, validates, and executes tools | All services | Provide the tool set and authorization policy |
| `@h-ai/reldb`, `@h-ai/runner` | Persist, claim, and execute jobs | All services | Initialize RelDB, then Runner, then create the service |
| Host file access and container environments | Read authorized files and run fixed images | Container jobs | Supply environments and file callbacks, then create job tools |

<a id="quick-start"></a>

## Quick start

<a id="service-example"></a>

Install the dependencies in a Node project and save the next block as `sum-service.mts`. This example runs Runner and an in-memory SQLite database in one process. The application supplies `demo/alice` as the trusted demonstration identity. In a deployed service, get that identity from the session or credentials.

```sh
pnpm add --allow-build=better-sqlite3 @h-ai/core @h-ai/reldb @h-ai/runner @h-ai/tools @h-ai/tools-runner zod@^4
node sum-service.mts
node sum-service.mts --receipts
```

`--allow-build=better-sqlite3` lets pnpm install the native SQLite binding. If your project already allows the binding, use your existing install settings.

<!-- example: tools-service -->

```ts
import type { HaiResult } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { runner } from '@h-ai/runner'
import { tools } from '@h-ai/tools'
import { toolsRunner } from '@h-ai/tools-runner'
import { z } from 'zod'
import process from 'node:process'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(`${result.error.code} ${result.error.message}`)
  return result.data
}

const receiptsOnly = process.argv.includes('--receipts')
const context = { scope: { tenantId: 'demo', userId: 'alice' } }
const request = {
  name: 'sum',
  input: { a: 2, b: 3 },
  idempotencyKey: 'sum-2-plus-3',
}
const worker = runner.create()

// Initialize the demonstration database in this process.
value(await reldb.init({ type: 'sqlite', database: ':memory:' }))
try {
  // Normal mode can claim tasks. Receipt mode only accepts tasks.
  value(await worker.init({ nodeId: 'sum-demo', executor: !receiptsOnly }))
  try {
    const sum = tools.define({
      name: 'sum',
      description: 'Add two numbers',
      parameters: z.object({ a: z.number(), b: z.number() }),
      handler: ({ a, b }) => a + b,
    })
    // Register and enable sum, and allow only the demonstration principal.
    const service = value(toolsRunner.createService({
      id: 'sum-demo',
      runner: worker,
      createTools: () => ({ tools: [sum] }),
      enabled: { tools: ['sum'] },
      authorize: ({ context: { scope }, name }) =>
        scope.tenantId === 'demo' && scope.userId === 'alice' && name === 'sum',
    }))
    try {
      // Read the catalog as demo/alice. It contains the sum definition and an empty groups array.
      // An invalid context returns a failure.
      const catalog = value(await service.catalog(context))
      process.stdout.write(`catalog: ${catalog.tools.map(tool => tool.name).join(', ')}\n`)

      if (!receiptsOnly) {
        // Submit sum(2, 3) as demo/alice and wait. Success returns 5. Denial or a failed task returns an error.
        const total = value(await service.invoke(request, context))
        process.stdout.write(`sum: ${total}\n`)
      }
      else {
        // Submit the same sum request. Acceptance returns queued and a receipt with id and key.
        // Input validation or authorization failure returns an error.
        const submitted = value(await service.submit(request, context))
        // Look up the ToolRun with the same principal and key. It is still queued in this example.
        // A miss returns undefined on success. An invalid key or storage failure makes value() throw.
        const recovered = value(await service.find(request.idempotencyKey, context))
        if (recovered?.receipt.id !== submitted.receipt.id)
          throw new Error('Expected the existing sum receipt')

        // Read the full receipt from cursor 0. Expect status: 'queued', events: [], next: 0.
        // An invalid receipt or a task missing from this principal and service returns a failure.
        const current = value(await service.inspect(recovered.receipt, context))
        // Cancel by receipt. This unclaimed task returns cancelled. A running task may return cancelling first.
        // Invalid receipts or a Runner cancellation failure return an error.
        value(await service.cancel(recovered.receipt, context))
        // Read after current.next (0). Expect terminal status cancelled, events: [], next: 0. A failed read returns an error.
        const final = value(await service.inspect(recovered.receipt, context, { after: current.next }))
        process.stdout.write(`status: ${current.status} -> ${final.status}\n`)
        process.stdout.write(`next: ${final.next}\n`)
      }
    }
    finally {
      service.close()
    }
  }
  finally {
    value(await worker.close())
  }
}
finally {
  value(await reldb.close())
}
```

The first run prints `catalog: sum` and `sum: 5`. `enabled` puts the function in the catalog, and `authorize` admits only the given principal calling `sum` at both submission and execution. Change the principal to `bob` and the catalog still lists `sum`, but `invoke()` returns `FORBIDDEN` before the handler runs.

The second run uses an API-only Runner so it leaves the same task `queued`. It recovers the task by its idempotency key, requests cancellation with the full receipt, and prints `status: queued -> cancelled` and `next: 0`. The example tool emits no events. For a running task, `cancel()` may return `cancelling` first. Keep checking `inspect()` until you have a terminal status. The two commands use separate in-memory databases. To recover work after a restart, configure a [durable Runner database](../configuration/runner.en.md) and retain the key.

<a id="api-reference"></a>

## API reference

<a id="services"></a>

### Submit recoverable tasks: `toolsRunner.createService`

A tool service is an object in your application process. It builds the catalog, validates and authorizes requests, and hands work to Runner. Runner keeps the tasks and results in RelDB. Your host decides how to expose the service, for example through an HTTP route or a CLI.

```text
Application → service.submit()
  ↓ Validate and authorize
Runner saves the task, returns a receipt
  ↓ Executor rechecks authorization
Tool runs, Runner saves final status
  ↓
service.inspect() reads status and output
```

Use `service.invoke()` when you can wait for the result. It submits the task and waits in one call. Use `submit()` and keep the full receipt if your caller needs to return first and check later.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `toolsRunner.createService(options)` | Create a tool service borrowing Runner | `options: ToolServiceOptions`. `id`, `runner`, `createTools`, `enabled`, and `authorize` are required. | `HaiResult<ToolService>` | `toolsRunner.createService(options)` |
| `service.catalog(context)` | List available tools | `context: ToolServiceContext`. Supply trusted context from the application. | `Promise<HaiResult<ToolCatalog>>` | `await service.catalog(context)` |
| `service.submit(request, context)` | Submit a durable job. A replay returns the existing status and any recorded failure reason. | `request: ToolSubmitRequest, context: ToolServiceContext`. The request includes the tool name, input, and optional idempotency key. The application supplies the context. | `Promise<HaiResult<ToolRun>>` | `await service.submit(request, context)` |
| `service.find(idempotencyKey, context)` | Find a job by its idempotency key | `idempotencyKey: string, context: ToolServiceContext` | `Promise<HaiResult<ToolRun \| undefined>>` | `await service.find(key, context)` |
| `service.inspect(receipt, context, options?)` | Inspect job status and output | `receipt: ToolReceipt, context: ToolServiceContext, options?: { after?: number }`. Pass the complete receipt. Use `after` to resume after an event sequence number. | `Promise<HaiResult<ToolRun>>` | `await service.inspect(receipt, context)` |
| `service.cancel(receipt, context)` | Request job cancellation | `receipt: ToolReceipt, context: ToolServiceContext`. Pass the complete job receipt and trusted context. | `Promise<HaiResult<ToolRun>>` | `await service.cancel(receipt, context)` |
| `service.invoke(request, context)` | Invoke a tool and await its result | `request: ToolSubmitRequest, context: ToolServiceContext`. Uses the same request structure as `submit`. | `Promise<HaiResult<RunnerJson>>` | `await service.invoke(request, context)` |
| `service.close()` | Unregister the service handler. The host still owns Runner shutdown. | No arguments | `void` | `service.close()` |

#### Service requests, trusted context, and event cursors

| Object | Fields | Conditions and effect |
| --- | --- | --- |
| `ToolServiceContext` | `scope`, `sessionId`, `signal` | Pass the authenticated `scope` and optional `sessionId` and `signal`. The principal IDs and session ID are 1–200 characters. Services ignore caller-supplied `execution`. |
| `ToolSubmitRequest` | `name`, `input`, `idempotencyKey` | Name and input are required. Use a tool from the enabled catalog and JSON matching its schema. An optional idempotency key has 1–200 characters, or omission generates a UUID. Supply a stable key to recover the same action after disconnection |
| `ToolReceipt` | `id`, `key` | Both required. ID is a 64-digit hexadecimal execution ID and key has 1–200 characters. `inspect/cancel` verify both against the current principal and service. `find` takes the business idempotency key from submission |
| `inspect` options | `after` | Optional integer 0–100000, default 0. Returns a page of up to 100 events with sequence greater than the cursor, plus current state and `next` |
| `ToolServiceOptions.enabled` | `groups`, `tools`, `exclude` | Each is an optional array of names. Take the union of groups and tools and remove excluded names. An empty object disables all tools. Each execution still checks authorization |

`ToolServiceContext.execution` supplies the execution ID, a progress writer, and an optional `maxResultBytes` to artifact and similar tools. Runner supplies a JSON result byte budget so `artifact_read` can paginate. The container factory takes the full handle through `RunnerToolServiceContext`. [Paginated artifact reads](tools.en.md#artifact-byte-limit)

For events 5, 6, and 7, `inspect(receipt, context, { after: 5 })` returns 6 and 7. Continue with the returned `next`. Selection `{ groups: ['docs'], exclude: ['docs_export'] }` exposes the other registered tools in the docs group and submissions still pass through the authorization callback.

##### Service factory parameters

| Field | Requirement/default | Purpose |
| --- | --- | --- |
| `id` | Required, 1–60 letters, digits, underscores, dots or hyphens | Runner kind `hai.tools.<id>.v1`; identical across nodes of one service |
| `runner` | Required | Initialized Runner; the service does not own its lifecycle |
| `createTools` | Required | Receives trusted `RunnerToolServiceContext` and returns a `RunnerToolSet` or promise. The worker rebuilds the tool set with a real Runner context so container handlers can use `execution.start` |
| `enabled` | Required | `ToolSelection` or context function; union groups/tools, then apply `exclude`; `{}` disables all |
| `authorize` | Required | Receives `{ context, name, input, phase }`, with `phase: 'submit'` or `'execute'`. Both phases must allow the call. During execution, `context.signal` incorporates the tool's deadline. |
| `runTimeoutMs` | 300000 ms | Separate budgets for request preparation and Runner execution. Integer 1–86400000. |
| `queueTimeoutMs` | 300000 ms | Queue timeout; integer 1–86400000 |

`RunnerToolSet` contains `tools`, optional `groups: { id, title, tools }[]` and `environments: Record<toolName, environmentId>`. Environment bindings select Runner environments and are checked again at execution. `ToolSelection` has `groups/tools/exclude`, each an array of names.

Keep one idempotencyKey per user intent for `service.submit/invoke`. If acceptance is unknown, recover with `service.find(key, context)` rather than resubmitting a new key. Catalog disabling does not prevent owned-task lookup; principal/service checks still apply.

`submit()` honors cancellation and the request deadline until it starts the durable write. Once the write begins, it waits for Runner's result and returns a receipt if accepted. If the signal aborts during that write and Runner accepts the task, `invoke()` returns `CANCELLED` with the full receipt in `error.ext.receipt`. If Runner rejects the submission, `invoke()` returns that error. It attempts to cancel a task with a service-generated key. With a caller-provided key, use the receipt to inspect the task and decide whether to cancel it, since the key may identify a task already in progress.

The service records the framework-supported request language on first submission. The execution node uses it for error events, and retries with the same key keep the original language. Existing records without a language use the execution node's default language. Deploy matching releases of Tools and Runner together. Existing tasks require no migration.

##### Receipts, states, and failures

`ToolCatalog` returns `tools: ToolDefinition[]` and `groups: ToolGroup[]`. The catalog comes from `createTools` and `enabled`. Filter there when a user should see only some tools. The service still authorizes both submission and execution.

`ToolRun` contains the full `receipt`, `status`, optional `output` and `failure`, and `events` and `next`. Read the next page with `inspect(..., { after: next })`. `submit` returns a status snapshot. Use `inspect` to read events.

| Status | What the caller should do |
| --- | --- |
| `queued`, `running`, `cancelling` | Keep the receipt and poll. The executor may still be cleaning up while the task is cancelling. |
| `succeeded` | Read `output`. A handler without a return value produces JSON `null` in the service. |
| `failed`, `cancelled`, `unknown` | Read any `failure` and events. `unknown` means Runner could not confirm the outcome. Check the business result before repeating a write. |

`success: false` indicates an API failure such as invalid input, denial, a conflict, or a timeout. `submit/find/inspect/cancel` can succeed while returning a task in the `failed` state. `failure` is Runner's reason category. A `tool-error` event includes the tool error code, safe message, HTTP status, and trace ID. When waiting with `invoke()`, a failed task returns a failed `HaiResult`. See [Runner states and task lookup](runner.en.md#tasks).

Nodes serving the same tool service use the same ID, selection, and environment bindings and share the Runner database. API nodes may use `executor: false`. Executors need unique, restart-stable node IDs. Shut down the service, Runner, and RelDB in that order.

For compatible upgrades, use the same service ID, environment definitions, and database so saved receipts continue to work. In a rolling deployment, give old and new workers distinct node IDs. Let active tool calls and their nested jobs finish on old workers before shutting them down. Closing Runner requests cancellation of local tasks.

<a id="job-tools"></a>

### Run container jobs

Use `toolsRunner.createJobTools()` to make fixed container operations available through a tool service. The factory builds definitions and their environment bindings. Runner allocates resources and starts a container when the service executes a task.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `toolsRunner.createJobTools(options)` | Offer jobs for configured Runner environments | `options: JobToolOptions`. Supply `context`, `files`, `runner`, and `environments`. Supply `browserProxy` for networked jobs | `RunnerToolSet` containing tools, groups, and environment bindings. Runner or file access failures occur during execution | `toolsRunner.createJobTools({ context, files, runner, environments })` |

##### Runner environment and file options

| Field | Input and behavior |
| --- | --- |
| `context`, `files` | Use the authenticated context supplied to `createTools` and the host read and publish callbacks described under [artifacts](tools.en.md#artifact-jobs) |
| `runner` | The initialized Runner used by the service to execute these jobs |
| `environments` | Map the keys below to Runner environment IDs. Omit a key to leave its tools out of the catalog |
| `browserProxy` | For `browser` and `web`, the deployment configures a controlled HTTP IPv4 proxy. The host passes it to the container as `HAI_TOOL_BROWSER_PROXY` |

Register a pinned image, resource limits, the required capabilities, and the network policy for each environment. The group selects which tools a service enables, while the environment ID selects where they run. See the [Runner settings](../configuration/runner.en.md#container-engine-and-environments) and [image and resource examples, in Chinese](../../../packages/tools/jobs/README.md#配置).

| Environment key | Tool group | Tools | Runner capabilities | Network policy |
| --- | --- | --- | --- | --- |
| `documents` | `documents` | `documents_extract`, `documents_generate` | `documents.extract`, `documents.generate` | `offline` |
| `office` | `documents` | `office_convert`, `office_recalculate` | `office.convert`, `office.recalculate` | `offline` |
| `ocr` | `documents` | `ocr_recognize` | `ocr.recognize` | `offline` |
| `browser` | `web` | `browser_navigate` | `browser.navigate` | `internal` with a controlled proxy |
| `web` | `web` | `web_capture` | `web.capture` | `internal` with a controlled proxy |
| `preview` | `web` | `preview_build` | `preview.build` | `offline` |
| `video` | `video` | `video_render` | `video.render` | `offline` |

Browser and capture jobs appear in the catalog when the environment and proxy are both configured. Use `http://<IPv4>:<port>` with a port from 1 to 65535 and an optional trailing slash. Choose an IPv4 literal outside the wildcard, loopback, link-local and multicast ranges, and omit credentials and additional URL components. Both jobs take HTTPS URLs with an ASCII DNS hostname and the default HTTPS port, with a maximum of 2048 Unicode characters. Invalid input returns `VALIDATION_FAILED` before queuing. See [proxy and browser sandbox requirements, in Chinese](../../../packages/tools/jobs/README.md#配置).

Runner limits each submission, event, and final output to 512 KiB of JSON. A job file can be up to 50 MiB. Total container inputs also follow the environment's `scratchMiB` budget, and individual jobs can have tighter limits. Pass authorized file IDs for larger inputs. See [data limits](../data/tools-runner.en.md#size-and-retention) and [job-specific input and output formats, in Chinese](../../../packages/tools/jobs/README.md#job-operations).

Known input rejections return `VALIDATION_FAILED`. Worker deadlines return `TIMEOUT`. A missing sandbox, missing dependency or invalid worker output returns `EXECUTION_FAILED`. A job publishes new artifacts after cleanup succeeds. When direct job execution and cleanup both fail, the cleanup error takes precedence and the sanitized original failure appears in `error.ext.operationError`. The service reports safe public error events and trace IDs. See [task status and events](../data/tools-runner.en.md#runtime-tasks).

<a id="managed-job-example"></a>

#### Scenario: Extract text from an authorized document

On a machine with Node 26 and Podman, save the following TypeScript as `documents-managed.mts`. Run the commands from the repository root or specify the same Dockerfile and build context using their paths in your checkout. The script gives Runner the content-addressed ID of the locally built image.

```sh
pnpm add @h-ai/core @h-ai/reldb @h-ai/runner @h-ai/tools @h-ai/tools-runner
podman build -f packages/tools/jobs/documents/Dockerfile \
  -t localhost/hai-tools-documents:local packages/tools/jobs
docs_image=$(podman image inspect --format '{{.Id}}' localhost/hai-tools-documents:local)
node documents-managed.mts "sha256:${docs_image#sha256:}"
```

The simulated host supplies the UTF-8 file `checklist.txt` under the ID `release-checklist`. The service enables only `documents_extract` and checks Alice's scope when the task is submitted and executed.

<!-- example: tools-managed-job -->

```ts
import type { HaiResult } from '@h-ai/core'
import type { RunnerScope } from '@h-ai/runner'
import type { ToolArtifactAccess } from '@h-ai/tools/server'
import process from 'node:process'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { runner } from '@h-ai/runner'
import { HaiToolsError } from '@h-ai/tools'
import { toolsRunner } from '@h-ai/tools-runner'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.data
}

const image = process.argv[2]
if (!image)
  throw new Error('Pass the local documents image ID with its sha256: prefix.')

const jobRunner = runner.create()
const scope = { tenantId: 'demo', userId: 'alice' }
const file = {
  id: 'release-checklist',
  name: 'checklist.txt',
  mediaType: 'text/plain',
  data: new TextEncoder().encode('Release checklist'),
}
const canRead = (caller: RunnerScope) => caller.tenantId === scope.tenantId && caller.userId === scope.userId
const files: ToolArtifactAccess = {
  async read(context, { id }) {
    if (context.signal?.aborted)
      return core.err(HaiToolsError.CANCELLED, 'File read cancelled')
    return canRead(context.scope) && id === file.id
      ? core.ok(file)
      : core.err(HaiToolsError.FORBIDDEN, 'File access denied')
  },
  async publish() {
    return core.err(HaiToolsError.FORBIDDEN, 'This text-only example does not publish files')
  },
}

// Save this run in an in-memory SQLite database. value throws on initialization failure.
value(await reldb.init({ type: 'sqlite', database: ':memory:' }))
try {
  // Start a Podman Runner that can execute jobs and register docs-offline. Stop if initialization fails.
  value(await jobRunner.init({
    engine: 'podman',
    nodeId: 'documents-demo',
    environments: [{
      id: 'docs-offline',
      image,
      capabilities: ['documents.extract'],
      networkPolicy: 'offline',
      resources: { cpu: 0.5, memoryMiB: 192, pids: 32, scratchMiB: 24 },
    }],
  }))

  // Enable only documents_extract. Take the service from the result, or throw a configuration or registration error.
  const service = value(toolsRunner.createService({
    id: 'checklist',
    runner: jobRunner,
    enabled: { tools: ['documents_extract'] },
    authorize: ({ context, name }) => name === 'documents_extract' && canRead(context.scope),
    // Bind document jobs to docs-offline and return their tools for the current context.
    createTools: context => toolsRunner.createJobTools({
      context,
      files,
      runner: jobRunner,
      environments: { documents: 'docs-offline' },
    }),
  }))
  try {
    // Wait for extraction from the authorized file ID. Success yields { text: 'Release checklist' }. File or job errors propagate.
    const result = value(await service.invoke({
      name: 'documents_extract',
      input: { fileId: file.id },
    }, { scope }))
    process.stdout.write(JSON.stringify(result) + '\n')
  }
  finally {
    // Unregister this service handler. close returns void.
    service.close()
  }
}
finally {
  try {
    // Close Runner and wait for cleanup. Success has no business data. Report cleanup failures.
    value(await jobRunner.close())
  }
  finally {
    // Release this demo database even if Runner closure fails. Success has no business data.
    value(await reldb.close())
  }
}
```

On success, the program prints `{"text":"Release checklist"}`. The host reads the source through its authorized file callback, and Runner releases the container before the service returns its result. To let a caller recover the task later, keep a stable key and use `submit()` and `inspect()` as in the [runnable service example](#service-example).

<a id="从项目构建网页预览"></a>
<a id="web-preview"></a>
<a id="build-a-website-preview-from-a-project"></a>

#### Scenario: Build a web preview from a project

Start from the [managed document example](#managed-job-example). Use the setup below to switch from document extraction to preview building, then replace the tool request in its `try` block.

| What to prepare | Values for this example |
| --- | --- |
| Runner environment | ID `preview-local`, capability `preview.build`, the preview image, and `offline` networking |
| Factory environment binding | `environments: { preview: 'preview-local' }` |
| Tool selection and authorization | `enabled: { tools: ['preview_build'] }`. The authorization callback permits this tool for the trusted principal. |
| File access and publication | The host resolves `uploaded-project` to the uploaded and authorized ZIP, then stores the resulting HTML in `files.publish()`. |

<!-- example: tools-web-preview -->

```ts
// Reuse service, scope, and value from the preceding example.
// On success, data.artifacts contains an HTML reference. value throws the file-access or build error on failure.
const preview = value(await service.invoke({
  name: 'preview_build',
  input: { fileId: 'uploaded-project' },
}, { scope }))
process.stdout.write(`${JSON.stringify(preview)}\n`)
```

Use `artifacts[0].id` to retrieve the `text/html` artifact through the host. Put `index.html` at the ZIP root. The job guide shows how to prepare a ZIP with a local module, run the container directly, and check the size and time limits. [Prepare a ZIP and build HTML (Chinese)](../../../packages/tools/jobs/README.md#构建多文件网页预览)

<a id="从网址生成可编辑介绍视频"></a>
<a id="website-video"></a>
<a id="editable-introduction-videos-from-websites"></a>

#### Scenario: Create an editable intro video from a URL

To turn a site into an editable video, include `website_video` from `ai.tools.createBuiltinTools({ context, files, executeJob })` in the `video` group. Route the trusted `executeJob` callback to `web_capture` and `video_render` in the same authorized tool service. Enable these two jobs globally as well. Hai Agent checks the union of `workbench.selection.groups` and `workbench.selection.tools`, then applies `exclude`. Enable both `web` and `video`, or select `website_video`, `web_capture`, and `video_render` individually. Per-task authorization remains subject to global exclusions.

Configure an LLM, a TTS provider that can return WAV, both job environments, and `browserProxy`. For a longer workflow, you can set the tool service's `runTimeoutMs` to `1200000` (20 minutes). The orchestration task uses Runner's default capacity, while capture and rendering use their bound tool environments. Validate the actual model and HyperFrames renderer in your deployment.

Pass an HTTPS `url` and optionally `goal`, `durationSeconds` (6–30, default 15), `width` and `height` (default 1280 × 720), `language` (default `zh-CN`), `voice`, `model`, and `brandColor`. Width and height must be even, form a 16:9, 9:16, or 1:1 canvas, and fit within 1920 × 1080 total pixels. The model builds a script and storyboard from captured site content, TTS produces WAV narration for each scene, and the renderer turns the assembled project into an MP4.

The result gives you `sourceUrl`, `captureId`, `scriptId`, `storyboardId`, `audioIds`, `projectId`, `subtitlesId`, `coverId`, `videoId`, `durationSeconds`, and `artifacts`. Use the references to open the script, design, JSON and editable Markdown storyboards, per-scene WAV files, SRT subtitles, cover from the website capture, project ZIP, workflow manifest, and MP4.

To reuse the capture on a new run, pass its `captureId` for the same URL. To revise the story, edit the storyboard Markdown and pass its `storyboardId` and `audioIds`. Scenes whose `audioText` still matches their narration keep their original audio. Send the project ZIP to `video_render` to render it again. Subtitles are segmented by sentence. If the narration cannot fit the requested duration, the tool fails and leaves the narration intact.
