# @h-ai/tools functionality

Use `tools` to define, register, and execute business tools independently of model protocols. The lightweight entry works in Node and browsers without initialization, a database, or containers.

[Module README](../../../packages/tools/README.en.md) · [Configuration](../configuration/tools.en.md) · [Data ownership](../data/tools.en.md)

## Minimal integration

```sh
pnpm add @h-ai/tools zod
```

The following example calls a tool directly from business code. The `registry` contains only tools explicitly registered by the host. Identity comes from a trusted server context.

```ts
import { tools } from '@h-ai/tools'
import { z } from 'zod'

export async function calculate(objectId: string) {
  const registry = tools.createRegistry({
    authorize: ({ context }) => context.objectId === objectId,
  })
  const registered = registry.register(tools.define({
    name: 'sum',
    description: 'Add two numbers',
    parameters: z.object({ a: z.number(), b: z.number() }),
    handler: ({ a, b }) => ({ total: a + b }),
  }))
  if (!registered.success)
    return registered
  return registry.execute('sum', { a: 2, b: 3 }, { objectId })
  // 成功结果的 data 为 { total: 5 }。
}
```

## Public entry points and instance methods

| Entry point | Purpose | Inputs and defaults | Return value |
| --- | --- | --- | --- |
| `tools.define` | Define a tool with input validation | Name, description, Zod Schema, and handler; the default tool timeout is 30 seconds | Tool instance |
| `tools.createRegistry` | Create an explicitly enabled tool collection | Optional `authorize` | Registry instance |
| `tool.execute` | Execute one definition | Business input and optional execution context | `Promise<HaiResult<TOutput>>` |
| `tool.toDefinition` | Read the neutral tool description | None | Name, description, and input JSON Schema |
| `registry.register/registerMany` | Register tools | One tool or an array | `HaiResult<void>`; duplicate names are not overwritten, and batch registration is atomic |
| `registry.replace` | Explicitly replace an existing tool | Tool instance | `HaiResult<void>`; fails if the name does not exist |
| `registry.get/has/getNames` | Query the current collection | Name or no arguments | Tool, existence check, or name list |
| `registry.getDefinitions` | Read the current neutral definitions | None | Array of neutral definitions |
| `registry.execute` | Execute by name | Name, business input, and optional context | `Promise<HaiResult<unknown>>` |
| `registry.executeAll` | Execute a batch | `{ name, input }[]`; sequential by default, with explicit parallel execution available | `Promise<HaiResult<unknown[]>>` |
| `registry.unregister/clear/size` | Disable, clear, and count tools | Name or no arguments | Deletion result, void, or count |

Here, `tool` and `registry` are instances returned by creation operations, not standalone package functions. A registry does not implicitly discover or enable other tools.

## Custom extensions and model integration

To add a tool, provide its Schema and handler, create it with `tools.define`, and register it in the required collection. No Tools kernel changes are needed. Registries reject handwritten or copied tool objects so that every execution passes through the same validation, authorization, and cancellation handling. Handlers can compose existing modules, while Tools itself does not depend on AI.

Names contain 1–64 ASCII characters, start with a letter, and otherwise contain letters, digits, underscores, or hyphens. An invalid name or default timeout throws `TypeError` during definition. This is a developer configuration error; business execution still returns `HaiResult`. Model tool parameters should use an object Schema that can be converted to JSON Schema. Types such as `z.date()` and custom types that JSON Schema cannot represent cannot be used directly as model parameters; definition conversion reports an error.

For model use, install `@h-ai/ai` and obtain a protocol adapter through `ai.tools.adapt(registry)`. Its `getDefinitions()` supplies model requests, while `execute(toolCall)` converts a model message into a business call on the same registry. See [AI tool calling](ai.md#工具调用) (Chinese).

## Authorization, failures, and cancellation

Input validation completes before authorization and the handler run. Both registry authorization and per-call authorization must pass. Returning false or throwing during authorization rejects execution. Handlers must still recheck permissions for the resources they ultimately access.

The execution options `signal`, `objectId`, `sessionId`, `deadline`, and `timeoutMs` are passed to the handler. Precedence is the absolute `deadline`, per-call timeout, tool timeout, then the 30-second default. The deadline covers asynchronous input validation, authorization, and the handler; each stage also checks the actual deadline. Cancellation and timeout can stop waiting and propagate an abort signal. A function that ignores the signal may continue running. Runner provides confirmation that processes and containers have stopped.

Business failures return `HaiResult`; check `success` before reading `data`. Tools validation, authorization, execution, timeout, and cancellation errors use the `hai:tools` namespace. The AI adapter handles model JSON parsing errors.

## Multiple nodes and standalone jobs

Each node builds its tool collection from the same configuration, while business authorization and resources use shared backends. A registry is an in-process implementation collection. Task claiming, leases, events, and cancellation remain with Runner, and artifact bytes remain with Storage. Do not store distributed execution state in a registry.

Standalone document, Office, OCR, and browser images are in [jobs](../../../packages/tools/jobs/README.md). Managed MCP jobs continue to enter Runner through `ai.mcp.services`. Supply only authorized file IDs; the execution node rechecks them before reading inputs and publishing artifacts.

## Development and testing

Run `pnpm --filter @h-ai/tools test` to verify the neutral kernel and `pnpm --filter @h-ai/tools test:jobs` to verify the standalone job protocol. Container acceptance additionally requires the fixed images described in the job instructions. Unit test results do not constitute acceptance of real images.
