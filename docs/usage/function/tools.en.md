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

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Tools has no module-level init/close. Lightweight examples use the root export; server examples import /server and borrow an initialized Runner. The value helper checks HaiResult.success and preserves the original error. Use isolated test data and explicit cleanup.

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="definitions"></a>

### Define and execute a tool: `tools.define`

Bind validation and a business function as a neutral tool. Definition does not execute it; execute produces the result.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `tools.define` | Define a tool and validate its input at execution. The default timeout is `30000` ms. Invalid definitions throw `TypeError` | `definition` | `Tool<TInput, TOutput>` | `const tool = tools.define(definition)` |
| `tool.execute` | Validate and execute. Options can supply identity, authorization, an abort signal and a deadline | `input, options? = {}` | `Promise<HaiResult<TOutput>>` | `await tool.execute({ a: 2, b: 3 })` |
| `tool.toDefinition` | Convert parameter rules to JSON Schema. Throws if conversion is unsupported | None | `ToolDefinition` | `tool.toDefinition()` |

#### Scenario: Define and execute a tool

```ts
import { z } from 'zod'
const tool = tools.define({
  name: 'sum', description: 'Add two numbers',
  parameters: z.object({ a: z.number(), b: z.number() }),
  handler: ({ a, b }) => ({ total: a + b }),
})
tool.toDefinition().name // 'sum'; parameters are JSON Schema
value(await tool.execute({ a: 2, b: 3 })) // { total: 5 }
const invalid = await tool.execute({ a: 'wrong', b: 3 }) // success false: VALIDATION_FAILED
```

Two numbers produce total=5; invalid a never reaches the handler. Use resultHandler for existing HaiResult services. Definition errors throw TypeError, execution failures return HaiResult.

#### Lightweight tool contracts

`tool` and `registry` are returned instances, not independent package functions. Registries do not discover other tools. They accept instances made by `tools.define`, rejecting handwritten or copied objects.

Tool names contain 1–64 ASCII characters: start with a letter, followed by letters, digits, underscores or hyphens. Invalid names, default timeouts or handler combinations are definition errors and throw `TypeError`. Model parameters must convert to JSON Schema, usually an object Schema; unrepresentable types such as `z.date()` cannot be used directly.

`HaiToolsError` includes NOT_FOUND, ALREADY_REGISTERED, VALIDATION_FAILED, EXECUTION_FAILED, FORBIDDEN, TIMEOUT and CANCELLED under `hai:tools`. Input, authorization, timeout and cancellation failures return failed `HaiResult` values. `resultHandler` preserves existing business errors; model JSON parsing errors remain in the AI adapter.

Fixed jobs map `TIMEOUT` to `HaiToolsError.TIMEOUT`, and unsafe Office documents/projects or other known input rejections to `VALIDATION_FAILED`. Missing sandbox support/dependencies, invalid worker output and unknown worker faults remain `EXECUTION_FAILED`; they are not classified as user input errors. Public messages are localized and do not expose raw worker messages. If both the operation and container cleanup fail, the cleanup error remains primary and `error.ext.operationError` retains the sanitized original operation error. A single failure does not add this extension.

#### Development tests

`pnpm --filter @h-ai/tools test` checks the kernel and service; `pnpm --filter @h-ai/tools test:jobs` checks job protocols. Real images and browser acceptance require the job environments separately. Unit results do not certify an image.

<a id="call-options"></a>

#### Call arguments

`tools.define/createRegistry` are pure definitions and factories, with no module YAML, environment variables or `init/close`. Import server factories from `@h-ai/tools/server`; they borrow an initialized Runner.

#### Definition and execution options

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

[Detailed parameters and workflows](tools.md#definitions)

<a id="registry"></a>

### Register, find and execute tools: `tools.createRegistry`

The registry contains explicitly registered tools. Host authorization controls execution rather than model-selected privileges.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `tools.createRegistry` | Create an empty registry. Without `authorize` it applies no registry-level authorization | `options? = {}` | `ToolRegistryOperations` | `const registry = tools.createRegistry()` |
| `registry.register` | Register a tool instance | `tool` | `HaiResult<void>` | `registry.register(tool)` |
| `registry.registerMany` | Add several tools. If any name is duplicate or any entry invalid, none are added | `tools: Tool[]` | `HaiResult<void>` | `registry.registerMany([tool])` |
| `registry.replace` | Replace an existing tool with the same name. The name must already exist | `tool` | `HaiResult<void>` | `registry.replace(updatedTool)` |
| `registry.unregister` | Remove by name. Returns `true` only if the name existed | `name` | `boolean` | `registry.unregister('sum')` |
| `registry.get` | Read a tool by name | `name` | `Tool / undefined` | `registry.get('sum')` |
| `registry.has` | Check whether a name is registered | `name` | `boolean` | `registry.has('sum')` |
| `registry.getNames` | List the registered names | None | `string[]` | `registry.getNames()` |
| `registry.getDefinitions` | List registered definitions. Throws if a parameter schema cannot be converted | None | `ToolDefinition[]` | `registry.getDefinitions()` |
| `registry.execute` | Run a registered tool. When both registry and call define authorization, both must allow it | `name, input, options? = {}` | `Promise<HaiResult<unknown>>` | `await registry.execute('sum', { a: 2, b: 3 })` |
| `registry.executeAll` | By default runs in order and stops at the first failure. With `parallel: true`, a failure does not undo already started calls | `calls: ToolInvocation[], options?` | `Promise<HaiResult<unknown[]>>` | `await registry.executeAll([{ name: 'sum', input: { a: 2, b: 3 } }])` |
| `registry.clear` | Remove all registrations. Calls already running are not cancelled | None | `void` | `registry.clear()` |
| `registry.size` | Read the number of registered tools (property) | None | `number` | `registry.size` |

#### Scenario: Register, find and execute tools

```ts
// Continue with the sum tool from the preceding scenario.
const registry = tools.createRegistry({ authorize: ({ context }) => context.objectId === 'demo-user' })
value(registry.register(tool)) // undefined
value(registry.registerMany([])) // undefined; no tools added
registry.size // 1
registry.has('sum') // true
registry.get('sum')?.toDefinition().name // 'sum'
registry.getNames() // ['sum']
registry.getDefinitions().map(definition => definition.name) // ['sum']
value(await registry.execute('sum', { a: 2, b: 3 }, { objectId: 'demo-user' })) // { total: 5 }
value(await registry.executeAll([{ name: 'sum', input: { a: 4, b: 1 } }], { objectId: 'demo-user' })) // [{ total: 5 }]
value(registry.replace(tool)) // undefined; same registered name
registry.unregister('sum') // true
value(registry.registerMany([tool])) // undefined
registry.clear() // undefined
registry.size // 0
```

Only trusted demo-user is allowed here; derive real identities server-side. Registration returns void; queries return instances, definitions, names or counts. clear does not cancel in-flight work.

#### Lifecycle and multiple nodes

Tools has no global enable switch. Applications translate their own configuration into factories and `enabled`. Agent uses `workbench.selection` with groups/tools/exclude: omitting it selects default built-in groups; explicit `{}` disables all. See [Agent usage](../../../apps/agent/README.en.md#configuration) for its `workbench` switches, groups and environment mappings. Image/audio models remain in [AI configuration](../configuration/ai.md).

Nodes of one service share the original Runner database and Storage, with consistent service IDs, definitions and environments. No new queue or state tables are created. API nodes may set Runner `executor: false`; executors use unique, restart-stable `nodeId` values. Execution nodes check current enablement and authorization again; frontend changes alone do not disable tools.

Service `close()` unregisters its own handler without closing Runner. After cancellation, continue reading until a terminal state; stopping local waiting does not prove process termination.

Parameters, each event and output also respect Runner's separate 512 KiB JSON bounds. The 50 MiB file and scratchMiB budgets are distinct; see [data boundaries](../data/tools.en.md#size-and-retention).

[Detailed parameters and workflows](tools.md#registry)

<a id="services"></a>

### Submit recoverable tasks: `tools.createService`

The server factory borrows Runner and connects catalogs, submission, receipts, inspection and cancellation into a recoverable workflow.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `tools.createService` | Create a tool service borrowing Runner | `ToolServiceOptions`; id, runner, createTools, enabled and authorize required | `HaiResult<ToolService>` | `tools.createService(options)` |
| `service.catalog` | List available tools | Trusted context | `Promise<HaiResult<ToolCatalog>>` | `await service.catalog(context)` |
| `service.submit` | Submit a durable job | `{ name, input, idempotencyKey? }`, context | `Promise<HaiResult<ToolRun>>` | `await service.submit(request, context)` |
| `service.find` | Find a job by its idempotency key | Idempotency key, trusted context | `Promise<HaiResult<ToolRun \| undefined>>` | `await service.find(key, context)` |
| `service.inspect` | Inspect job status and output | Complete receipt, context, optional `{ after }` | `Promise<HaiResult<ToolRun>>` | `await service.inspect(receipt, context)` |
| `service.cancel` | Request job cancellation | Complete receipt, context | `Promise<HaiResult<ToolRun>>` | `await service.cancel(receipt, context)` |
| `service.invoke` | Invoke a tool and await its result | 与 submit 相同 | `Promise<HaiResult<RunnerJson>>` | `await service.invoke(request, context)` |
| `service.close` | Close the service and owned resources | None | `void` | `service.close()` |

#### Scenario: Submit recoverable tasks

Construct service, select from catalog, submit/find with one idempotency key and preserve the full receipt for inspect/cancel. invoke waits for a terminal result. close removes handlers without closing borrowed Runner.

#### Scenario: Create a server task service

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

Check `success` before reading business results. Use `invoke` when business code needs the final output. Long-running UI actions usually use `submit/inspect`, retain the entire receipt and display actual states including `queued/running/cancelling`. A cancellation receipt does not prove process exit.

`enabled` is required: union the selected groups and individual tools, then apply `exclude`. An empty object disables everything. `catalog` uses the current factory and selection without calling per-tool `authorize`; use context-dependent `createTools/enabled` to hide tools by principal. Submission and execution rebuild the enabled set and authorize again, so an old catalog does not bypass disabling.

#### Model adapters, cancellation and shared state

Adapt a lightweight registry with `ai.tools.adapt(registry)`: `getDefinitions()` supplies model requests, while `execute(toolCall)` invokes the same registry. Server UIs and agents should likewise share one tool service and its authorization.

Lightweight execution uses absolute `deadline`, then per-call `timeoutMs`, tool timeout, then 30 seconds. The deadline covers async validation, authorization and handler execution. Cancellation/timeouts stop waiting and forward the signal; uncooperative functions may continue. Runner confirms process termination and cleanup.

The service registers Runner kind `hai.tools.<id>.v1` and reuses Runner tasks, leases and events. It creates no new queue or Tools state tables. Nodes use consistent service IDs, tool configuration, the shared Runner database and Storage. API nodes may use `executor: false`; execution nodes provide images and unique, restart-stable node IDs. Validate the full receipt against task, service and principal ownership rather than accepting only a task ID.

Return authorized references for large artifacts. The host still checks file reads and publication. Keep secrets and image/audio/video bodies out of logs and events.

#### Service factory parameters

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

[Detailed parameters and workflows](tools.md#services)

#### Scenario: Submit, recover, inspect and cancel

Use successful data from createDocumentService, a server-authenticated context and a validated request chosen from the catalog. Retain one idempotency key for submit and find. Inspect actual state after cancellation; invoke waits for the same request rather than creating a new intent.

```ts
import type { ToolService, ToolServiceContext, ToolSubmitRequest } from '@h-ai/tools/server'

async function followJob(service: ToolService, context: ToolServiceContext, request: ToolSubmitRequest) {
  const catalog = value(await service.catalog(context))
  // catalog.tools describes what this context can submit.
  const keyed = { ...request, idempotencyKey: 'demo-operation-42' }
  const submitted = value(await service.submit(keyed, context))
  const recovered = value(await service.find(keyed.idempotencyKey, context))
  // recovered is the same logical run, or undefined if none was accepted.
  const current = value(await service.inspect(submitted.receipt, context))
  const cancelling = value(await service.cancel(submitted.receipt, context))
  // current/cancelling are ToolRun values; cancellation may still be in progress.
  return service.invoke(keyed, context)
}
// At application shutdown, after all users of the service finish:
// service.close() returns void and leaves Runner open.
```

<a id="artifact-jobs"></a>

### Reuse artifacts, web and document jobs: tool factories

Provide authorized artifact access and environment bindings. Factories return tools; catalog construction does not launch jobs.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `tools.createArtifactTools` | Create artifact and analysis tools | `ArtifactToolOptions`: context, files | `ToolSet` | `tools.createArtifactTools({ context, files })` |
| `tools.createJobTools` | Create tools for bound job environments | `JobToolOptions`: context, files, runner, environments; browserProxy? | `ToolSet` | `tools.createJobTools({ context, files, runner, environments })` |

#### Scenario: Reuse artifacts, web and document jobs

The host supplies authenticated context, authorized file access, an initialized Runner and trusted environment mappings. Return the resulting ToolSet from createService.createTools. These factories neither submit jobs nor own resources to close.

```ts
import type { JobToolOptions, ToolSet } from '@h-ai/tools/server'
import { tools } from '@h-ai/tools/server'

function createWorkTools(options: JobToolOptions): ToolSet {
  const artifacts = tools.createArtifactTools({ context: options.context, files: options.files })
  const jobs = tools.createJobTools(options)
  return {
    tools: [...artifacts.tools, ...jobs.tools],
    groups: [...(artifacts.groups ?? []), ...(jobs.groups ?? [])],
    environments: { ...artifacts.environments, ...jobs.environments },
  }
}
// The result includes artifact_create/read/save and data_analyze.
// Job tools appear only for the environments present in options.environments.
```
