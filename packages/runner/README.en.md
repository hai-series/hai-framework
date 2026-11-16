# @h-ai/runner

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · [Relational database](../reldb/README.en.md) · [AI agents](../ai/README.en.md)

Runner executes managed agent workers and tool jobs on Node.js. API nodes submit work, read status, and request cancellation. Executor nodes claim work and own its containers. A relational database shares tasks, leases, events, and execution results.

## Quick Start

```sh
pnpm add @h-ai/runner @h-ai/reldb
```

Start RelDB before Runner. This Node.js startup example uses SQLite and a trusted server-side handler, so it needs no container engine. In an application, derive `tenantId` and `userId` from the authenticated identity and check business authorization before invoking Runner.

```ts
import { setTimeout as delay } from 'node:timers/promises' // Provides bounded polling for this example.
import { reldb } from '@h-ai/reldb' // Supplies Runner's relational database.
import { runner } from '@h-ai/runner' // The process-wide Runner instance.

const database = await reldb.init({ type: 'sqlite', database: ':memory:' }) // Success is { success: true, data: undefined }.
if (!database.success)
  throw new Error(database.error.message) // Stop startup if the database is unavailable.

try {
  const started = await runner.init({ nodeId: 'worker-east' }) // The default role is executor. isExecutor becomes true on success.
  if (!started.success)
    throw new Error(started.error.message) // Stop startup before submitting work.

  const registration = runner.register('report.v1', async (input, context) => { // Success returns an unregister callback.
    if (typeof input !== 'string')
      throw new TypeError('Expected report title') // Validate business input in the handler.
    const event = await context.emit({ phase: 'ready' }) // Success persists sequence 1 for other nodes to read.
    if (!event.success)
      throw new Error(event.error.message) // Stop the handler if event persistence fails.
    return { title: input } // Becomes output on the successful execution.
  })
  if (!registration.success)
    throw new Error(registration.error.message) // Duplicate registration fails.

  const scope = { tenantId: 'studio', userId: 'alice' } // Example identity. Derive it from server authentication in production.
  const accepted = await runner.submit({
    scope,
    kind: 'report.v1',
    idempotencyKey: 'report-nov',
    input: 'Monthly report'
  }) // Returns a queued receipt with a task id.
  if (!accepted.success)
    throw new Error(accepted.error.message) // A failed result has no usable receipt.

  const deadline = Date.now() + 5_000 // Wait at most five seconds in this example.
  let completed = false // Set to true only after reading a successful terminal state.
  while (Date.now() < deadline) {
    const task = await runner.get(scope, accepted.data.id) // Read status and result for the same principal.
    if (!task.success)
      throw new Error(task.error.message) // Stop if lookup fails.
    if (task.data.status === 'succeeded') {
      process.stdout.write(`${JSON.stringify(task.data.output)}\n`) // Prints {"title":"Monthly report"}.
      completed = true
      break
    }
    if (task.data.status !== 'queued' && task.data.status !== 'running')
      throw new Error(task.data.failure ?? task.data.status) // Execution failure is separate from lookup failure.
    await delay(100) // Wait 100 ms, then return undefined.
  }
  if (!completed)
    throw new Error('Timed out waiting for the report') // Report a timeout. Shutdown attempts to cancel this node's work.
  registration.data() // Unregister the handler and return undefined.
}
finally {
  try {
    const closed = await runner.close() // Stop claiming, cancel local work, and wait for cleanup confirmation.
    if (!closed.success) {
      process.stderr.write(`${closed.error.message}\n`) // Report unconfirmed cleanup and leave the database available.
      process.exitCode = 1
    }
    else {
      const released = await reldb.close() // Release database connections. Success is { success: true, data: undefined }.
      if (!released.success) {
        process.stderr.write(`${released.error.message}\n`)
        process.exitCode = 1
      }
    }
  }
  catch (cause) {
    process.stderr.write(`${String(cause)}\n`) // Preserve the original task exception.
    process.exitCode = 1
  }
}
```

## Configuration Reference

Set node roles, executor options and task retention through `runner.init()`.

See the [configuration reference](../../docs/usage/configuration/runner.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/runner.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `init` / `close` / `environment` / `isExecutor` — Configure node roles and execution environments
- `register` / `registerWarmPool` / `submit` — Register executors and warm pools and submit jobs
- `find` / `get` / `events` / `cancel` / `reconcileUnknown` — Find jobs, read events, cancel and reconcile unknown outcomes

## Data Structures

See the [data reference](../../docs/usage/data/runner.md) in Chinese for persistent tasks, execution leases, events, workspaces and artifacts.

## Development and Testing

Run from the repository root (use `pnpm.cmd` in PowerShell). SQLite covers task flow, PostgreSQL and MySQL cover shared ownership, and Podman/Docker cover actual container limits, cancellation, and artifacts. Set `HAI_TEST_CONTAINER_ENGINE` to choose the container engine. Database tests also need a Docker-compatible Testcontainers endpoint. Set `HAI_TEST_RUNNER_ARTIFACT_IMAGE` to a prebuilt tool test image to enable artifact and cross-node warm-pool tests.

```sh
pnpm --filter @h-ai/runner typecheck
pnpm --filter @h-ai/runner lint
pnpm --filter @h-ai/runner build
pnpm --filter @h-ai/runner test
```

## License

Apache-2.0
