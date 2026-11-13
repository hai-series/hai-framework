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

## Features

| Capability                       | Use                                                                                    | Public entry points                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Node lifecycle                   | Start API and executor nodes and inspect environments                                  | `init`, `close`, `isExecutor`, `environment`, `createRunner`         |
| Tasks and events                 | Submit durably, recover a receipt, query, cancel, and page through events              | `register`, `submit`, `find`, `get`, `events`, `cancel`              |
| Containers and files             | Run a pinned image, use standard streams, and retrieve authorized artifacts            | `context.start`, `context.emit`, `process.wait`, `artifact`, `close` |
| Child jobs and warm pools        | Route controls to the parent's node and reserve tool capacity                          | `submit({ parentId })`, `registerWarmPool`                           |
| Unknown execution reconciliation | Verify that a container or host process has stopped and record the operator and reason | `reconcileUnknown`                                                   |

### Set node roles and inspect an environment

Use `runner` for a single-process app. `createRunner()` returns an independent instance for dependency injection or isolated tests. Multi-node production deployments use shared PostgreSQL or MySQL and consistent environment definitions and concurrency limits. Executor node IDs must be unique and stable across restarts. The example assumes RelDB is running. The deployment supplies `imageId`, an OCI image ID or manifest digest cached on each executor.

```ts
import type { RunnerConfigInput } from '@h-ai/runner' // Checks settings shared by both roles.
import { createRunner, RunnerConfigSchema } from '@h-ai/runner' // Factory for instances and Schema for validating settings.

function prepareApi(imageId: string) {
  const settings: RunnerConfigInput = {
    nodeId: 'api-east', // Node ID. Give executors their own IDs.
    executor: false, // Submit, query, and cancel tasks from this node.
    environments: [
      {
        id: 'docs', // The environmentId to use at submission.
        image: imageId, // A pinned digest already prepared on executors.
        capabilities: ['documents.extract'], // Allows the caller to choose an environment by capability.
        resources: {
          cpu: 1,
          memoryMiB: 256,
          pids: 64,
          scratchMiB: 64
        }, // Upper limits for this environment.
      }
    ],
  }
  return RunnerConfigSchema.safeParse(settings) // Valid data includes the default podman engine and offline policy.
}

async function startApi(imageId: string) {
  const settings = prepareApi(imageId) // Invalid resource settings or image digests produce Zod issues.
  if (!settings.success)
    throw new Error(settings.error.message)
  const api = createRunner() // A new instance. isExecutor is false before initialization.
  const started = await api.init(settings.data) // Successful result has data: undefined.
  if (!started.success)
    throw new Error(started.error.message)
  const docs = api.environment('docs') // Success contains a configuration copy with data.image equal to imageId.
  if (!docs.success)
    throw new Error(docs.error.message)
  return api // On shutdown, call and check api.close() before closing RelDB.
}
```

Executors start with `executor: true` and register trusted handlers with `register(kind, handler)`. API nodes can use the same setup code. Their `register` returns a no-op unregister callback. `environment(id)` returns `NOT_FOUND` for an unknown ID.

### Recover tasks, read events, and cancel

Retry an identical submission under the same principal, task kind, and idempotency key to obtain its original receipt. A changed submission returns `CONFLICT`. Trusted services can use `reuseKey` for active executions such as a user's worker. `find` takes the idempotency key. The service manages reuse keys. This function takes an authenticated principal and the idempotency key of an existing `report.v1` receipt.

```ts
import type { RunnerScope } from '@h-ai/runner' // Contains tenantId and userId.
import { runner } from '@h-ai/runner' // Initialized against the database that holds the task.

async function cancelReport(scope: RunnerScope, key: string) {
  const found = await runner.find(scope, 'report.v1', key) // Returns the original receipt, or success with data: undefined when absent.
  if (!found.success || !found.data)
    return found // Preserve the error or the missing result.
  const id = found.data.id // Use this task id for events, lookup, and cancellation.
  const page = await runner.events(scope, id, 0, 20) // First 20 events with sequence > 0. An empty page is [].
  if (!page.success)
    return page // Preserve a lookup error.
  const after = page.data.at(-1)?.sequence ?? 0 // The last event sequence is the cursor for the next page.
  const next = await runner.events(scope, id, after, 20) // Up to 20 subsequent events in sequence order.
  if (!next.success)
    return next
  const cancelled = await runner.cancel(scope, id) // A queued task goes to cancelled. A running task typically goes to cancelling first.
  if (!cancelled.success)
    return cancelled
  return runner.get(scope, id) // Read current status. Continue polling if needed to confirm the stop.
}
```

Cancelling a finished task returns its current state. `events` defaults to `after: 0` and `limit: 100`, with a limit range of `1–100`. Submissions, individual events, and outputs each have a 512 KiB JSON limit. Each execution can persist 16 MiB of events in total, and `maxEvents` also caps their count. Use business object references or executor-side secret management for large files and credentials.

Executors use the database clock to remove terminal jobs, reconciled unknown jobs, and their events in batches after `retentionMs`, which defaults to seven days. Unreconciled `unknown` jobs and parents with remaining child records stay in storage. After removal, `find` returns no record and `get` and `events` return `NOT_FOUND`. An idempotency key can be submitted again after expiration. Retry within the retention window and manage longer external idempotency requirements in the application.

### Run an isolated container, stage files, and retrieve artifacts

Executors require Linux cgroup v2, Podman or Docker with CPU, memory, and PID limits, and cached pinned images. An image needs `/bin/sh`, must work under UID/GID 1000, and may not declare extra image volumes. The default is offline with a read-only root filesystem. `/state`, `/workspace`, and `/tmp` use bounded temporary filesystems. Networked environments use `networkPolicy: 'internal'` and a named internal network verified by the engine. The deployment owns trust zones and egress rules.

This example assumes `docs` is registered and its image provides `cat` and `/usr/bin/python3`. The handler uses a fixed fixture. For real files, recheck the authorized file ID using `context.scope` on the executor, publish the artifact, and return its business ID.

```ts
import { Buffer } from 'node:buffer' // Encode the input file and decode the returned bytes.
import { once } from 'node:events' // Wait for the artifact readiness notification on stdout.
import { core } from '@h-ai/core' // Log unconfirmed cleanup.
import { runner } from '@h-ai/runner' // Run on an executor node.

const registration = runner.register('copy.v1', async (_input, context) => { // Returns an unregister callback. Only the lease owner runs the handler.
  const launched = await context.start({
    command: '/bin/sh', // Trusted entry point in the pinned image.
    args: ['-ec', 'cat /input/source.txt > /output/result.txt; printf ready; read -r done || true'], // Announces readiness and waits for stdin to close.
    inputs: {
      'source.txt': Buffer.from('hello').toString('base64')
    }, // Creates read-only /input/source.txt containing hello.
  }) // Success contains stdin, stdout, stderr, wait, artifact, and close on a process handle.
  if (!launched.success)
    throw new Error(launched.error.message)
  const process = launched.data // Read the artifact before the container exits.
  try {
    process.stderr.resume() // Drain stderr so it does not block the subprocess.
    await once(process.stdout, 'data', { signal: context.signal }) // The first data comes from the fixed command's readiness notification.
    const artifact = await process.artifact('result.txt', 64) // Success is { success: true, data: 'aGVsbG8=' }.
    if (!artifact.success)
      throw new Error(artifact.error.message)
    process.stdin.end() // Close stdin so the example command can exit.
    const exit = await process.wait() // Normal exit here is { code: 0, signal: null }.
    if (exit.code !== 0)
      throw new Error('Copy failed')
    return {
      text: Buffer.from(artifact.data, 'base64').toString('utf8')
    } // Example output is { text: 'hello' }.
  }
  finally {
    const stopped = await process.close() // Success confirms container removal and returns data: undefined.
    if (!stopped.success)
      core.logger.error('Container cleanup unconfirmed', { code: stopped.error.code }) // Runner checks cleanup after the handler returns.
  }
})
if (!registration.success)
  throw new Error(registration.error.message)
```

Submit `{ scope, kind: 'copy.v1', input: null, environmentId: 'docs' }` to queue the job. `context.start` is available once per job. `files` puts startup text files in `/state`, `env` goes to the container process, and `cwd` defaults to `/workspace`. `inputs` accepts up to 8 flat files with a total decoded size capped at the smaller of 50 MiB and `scratchMiB`. `artifact` reads a regular file from `/output` in a still-running container and applies both the requested `maxBytes` and a 50 MiB hard limit. Check artifact ownership before providing downloads.

### Route child jobs, cap tool concurrency, and prewarm

`parentId` routes a child job to the current executor and generation of a running parent under the same principal. Use this for controls on an open connection. `maxControlRunning` caps concurrent control jobs. `capacityClass: 'tool'` uses a separate tool budget. `concurrency: { key, limit }` caps active jobs of the same kind and service key across nodes.

```ts
import type { RunnerScope } from '@h-ai/runner' // Comes from server authentication or the trusted parent handler.
import { runner } from '@h-ai/runner' // Connected to the shared database.

async function sendControl(scope: RunnerScope, parentId: string) {
  return runner.submit({
    scope,
    parentId,
    kind: 'worker.control',
    input: { operation: 'status' }
  }) // A queued receipt, or a conflict for an ended or mismatched parent.
}

function registerCopyPool() {
  return runner.registerWarmPool({
    key: 'docs-copy',
    kind: 'copy.v1',
    environmentId: 'docs',
    minReady: 1,
    maxRunning: 2,
    maxTotal: 3
  }) // Success returns an unregister callback. Executors must first register copy.v1.
}

async function queuePrewarmedCopy(scope: RunnerScope) {
  return runner.submit({
    scope,
    kind: 'copy.v1',
    input: null,
    environmentId: 'docs',
    capacityClass: 'tool',
    warmPool: true,
    concurrency: { key: 'docs-copy', limit: 2 }
  }) // Returns a queued receipt. An executor assigns a single-use container.
}
```

Register `worker.control` on executor nodes. Call `registerCopyPool()` once at startup and check `success`, with the same configuration on API and executor nodes. Each prewarmed container handles one job and receives user files only after claim. `maxTotal` includes preparing, standby, running, cleaning, and unverified instances. `maxRunning` limits active jobs. Prewarming requires `/usr/bin/python3` and an offline environment. Launch jobs with `inputs`, the `/workspace` working directory, and empty `env` and `files`. To retire the pool, stop accepting its jobs and invoke the unregister callback to release locally unclaimed containers.

### Reconcile an unknown execution

A lost lease or unconfirmed cleanup can mark a task `unknown` while retaining its resource reservation. Inspect the actual container and external effects before calling the administrative operation on the original executor. Runner verifies engine identity, container removal, and local staging cleanup, and retains an audit record.

For a trusted host job without a container, supply `hostResourcesStopped: true` after checking that all application-managed resources have stopped. Runner verifies the original process has exited on the same Linux host, boot, and PID namespace. A child control job also requires a terminal or reconciled parent. Legacy records without process evidence and container jobs missing their container receipt keep their reservation.

```ts
import type { RunnerScope } from '@h-ai/runner' // Obtain from task ownership and an authenticated administrative session.
import { runner } from '@h-ai/runner' // Use the Runner instance on the original executor node.

async function reconcile(scope: RunnerScope, id: string) {
  const checked = await runner.reconcileUnknown(scope, id, { operatorId: 'ops-1', reason: 'INC-47: container cleanup verified' }) // Success returns an unknown receipt with reconciledAt.
  if (!checked.success)
    return checked // Preserve the error and reservation when evidence is missing, the container is running, or the engine differs.
  return checked // Resource budget and reuse key are released. The application still verifies external effects.
}

async function reconcileHost(scope: RunnerScope, id: string) {
  const checked = await runner.reconcileUnknown(scope, id, { operatorId: 'ops-1', reason: 'INC-48: host resources verified', hostResourcesStopped: true }) // Submit the operator's attestation and read an unknown receipt with reconciledAt on success.
  if (!checked.success)
    return checked // Keep the reservation if the original process is alive, the parent is unresolved, or local evidence is missing.
  return checked // Resources were released. The application still verifies external effects.
}
```

## Configuration

Pass an object to `runner.init(config)` from the application's deployment configuration. Use `RunnerConfigSchema.safeParse(config)` to validate it ahead of startup. Durations below are in milliseconds. The host must have resources for both node budgets.

| Field                                                   | Default                                     | Purpose                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `nodeId`                                                | Required                                    | Stable node ID across restarts                                                                                                           |
| `executor`, `engine`                                    | `true`, `podman`                            | Role and container engine. Also supports `docker`                                                                                        |
| `capacity`                                              | `4 CPU / 4096 MiB / 512 PID / 2048 MiB`     | Ordinary budget for CPU, memory, PIDs, and scratch                                                                                       |
| `toolCapacity`, `toolMaxRunning`                        | `1 CPU / 1024 MiB / 128 PID / 512 MiB`, `4` | Separate per-node tool budget and concurrency                                                                                            |
| `maxRunning`, `maxRunningPerScope`, `maxControlRunning` | `8`, `4`, `8`                               | Ordinary node, principal, and node control-job concurrency                                                                               |
| `maxQueued`, `maxEvents`                                | `5000`, `10000`                             | Queue limits for ordinary and control jobs, and durable event count per execution                                                        |
| `retentionMs`                                           | `604800000`                                 | Retention for terminal jobs and events, from 1 hour to 365 days. Use the same value on all nodes in a deployment                         |
| `leaseMs`, `pollMs`, `closeTimeoutMs`                   | `10000`, `50`, `20000`                      | Lease, polling, and shutdown wait. `pollMs × 3` must be below `leaseMs`                                                                  |
| `environments`                                          | `[]`                                        | IDs, pinned images, resource limits, optional `architecture` and `capabilities`. `offline` is the default. `internal` requires `network` |

Use `resources` to request lower limits than the selected environment. `queueTimeoutMs` and `runTimeoutMs` both default to `300000`. Trusted services can pin a job to `nodeId` or attach it to a running parent with `parentId`. Warm jobs use the registered environment limits.

## Error Handling

Check `result.success` before reading `data` or `error`. `HaiRunnerError` defines initialization, invalid input, missing task, conflict, capacity, lost lease, and unconfirmed cleanup errors. Handler failures appear as `status: 'failed'` and `failure` inside a successful `get()` result. Successful `cancel()` acknowledges the request. Read the task state to confirm its stop. If `close()` cannot confirm cleanup, keep the database connection available while inspecting or retrying shutdown.

## Development

Run from the repository root (use `pnpm.cmd` in PowerShell). SQLite covers task flow, PostgreSQL and MySQL cover shared ownership, and Podman/Docker cover actual container limits, cancellation, and artifacts. Set `HAI_TEST_CONTAINER_ENGINE` to choose the container engine. Database tests also need a Docker-compatible Testcontainers endpoint. Set `HAI_TEST_RUNNER_ARTIFACT_IMAGE` to a prebuilt tool test image to enable artifact and cross-node warm-pool tests.

```sh
pnpm --filter @h-ai/runner typecheck
pnpm --filter @h-ai/runner lint
pnpm --filter @h-ai/runner build
pnpm --filter @h-ai/runner test
```

## License

Apache-2.0
