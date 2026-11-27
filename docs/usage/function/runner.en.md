# @h-ai/runner API Reference

[简体中文](runner.md) · [日本語](runner.ja.md)

Runner provides a durable job queue for Node.js services. Submitting a job returns an execution ID. A background handler claims the job and records progress and results. Callers can disconnect and resume with the original execution ID or idempotency key. A single process can run trusted TypeScript or JavaScript handlers directly. Configure container environments for jobs that need process isolation.

Start by [submitting and executing a report in one process](#quick-start). Then reuse the same handler with [separate API and execution nodes](#two-node-example). To choose how a job runs, see [regular, control, and tool jobs](#task-kinds).

[Module README](../../../packages/runner/README.en.md) · [Configuration](../configuration/runner.en.md) · [Data structures](../data/runner.en.md)

<a id="module-dependencies"></a>

## Dependencies

| Dependency | Purpose | When required | Setup order |
| --- | --- | --- | --- |
| Node.js | Runs the server API, handlers, and container streams | All nodes. Supported releases start at 22.23.4, 24.22.1, and 26.12.1 in their respective major versions | Install and import Runner in your Node.js app |
| `@h-ai/reldb` | Stores jobs, events, and execution ownership | All nodes. Use SQLite in a single process or connect separate processes to the same PostgreSQL or MySQL database | Initialize RelDB before Runner. Confirm Runner has shut down before closing RelDB |
| Podman or Docker | Runs container processes with resource limits | Execution nodes that run containers. The host needs Linux cgroup v2 and support for CPU, memory, and process limits | Prepare the engine and fixed images, then register the execution environments |

Runner installs `@h-ai/core` as a dependency. Pass a configuration object directly, or use Core in the host to read YAML. The host authenticates each caller and checks the permissions for the job. [Configuration entry](../configuration/runner.en.md#configuration-entry)

<a id="quick-start"></a>

## Quick start example

Use one Node.js process to submit and run a monthly report. The program prints a queue receipt first, followed by the report result and one progress event. It uses in-memory SQLite, so you can run it without starting a database server.

#### 1. Install the dependencies

Install both packages in your Node.js project. Save the example files in that same directory.

```sh
pnpm add @h-ai/runner @h-ai/reldb
```

#### 2. Write the report handler

Save this file as `report.mjs`. The submission side uses `reportKind` to identify the job. The execution side uses the same value to register `buildReport`. The handler returns a fixed row count for the example report.

```js
export const reportKind = 'report.v1'

/** @type {import('@h-ai/runner').RunnerHandler} */
export const buildReport = async (input, context) => {
  // The input is the payload from runner.submit. Invalid input makes the job fail.
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.month !== 'string')
    throw new TypeError('Expected a report month')

  // Save a durable progress event for this job. The submission side reads it with runner.events.
  const recorded = await context.emit({ phase: 'reading' })
  if (!recorded.success)
    throw new Error(recorded.error.message)

  // The returned JSON becomes the job output. Read it with runner.get after the job succeeds.
  return { month: input.month, rows: 120 }
}
```

#### 3. Submit a job and read its result

Save this file as `report-demo.mjs`. It combines the two roles in one process, registers the handler, and submits the November 2026 report.

```js
import { setTimeout as delay } from 'node:timers/promises'
import { reldb } from '@h-ai/reldb'
import { runner } from '@h-ai/runner'
import { buildReport, reportKind } from './report.mjs'

// RelDB stores the jobs and events. First open an in-memory database private to this process.
const database = await reldb.init({ type: 'sqlite', database: ':memory:' })
if (!database.success)
  throw new Error(database.error.message)

try {
  // Start Runner and prepare its tables. executor defaults to true, so this process can claim jobs.
  const started = await runner.init({ nodeId: 'report-local' })
  if (!started.success)
    throw new Error(started.error.message)

  // Register the handler under the kind used at submission. Submit work of this kind once registration succeeds.
  const registered = runner.register(reportKind, buildReport)
  if (!registered.success)
    throw new Error(registered.error.message)

  // Simulate an authenticated user. A real service takes both fields from the trusted login identity.
  const scope = { tenantId: 'demo', userId: 'alice' }
  // The idempotencyKey identifies this monthly report. Retrying with the same scope, kind, and payload returns the same ID.
  const submitted = await runner.submit({
    scope,
    kind: reportKind,
    idempotencyKey: 'report-2026-11',
    input: { month: '2026-11' },
  })
  if (!submitted.success)
    throw new Error(submitted.error.message)

  // Use the receipt's id to check the job later. queued means the job is saved and waiting to be claimed.
  const { id, status } = submitted.data
  process.stdout.write(JSON.stringify({ id, status }) + '\n')

  const deadline = Date.now() + 5_000
  for (;;) {
    // Read the state using the original scope and receipt ID. success confirms the read. status is the job's state.
    const task = await runner.get(scope, id)
    if (!task.success)
      throw new Error(task.error.message)

    if (task.data.status === 'succeeded') {
      // Read the first page after sequence 0. This handler emits one event, with sequence 1.
      const events = await runner.events(scope, id, 0, 20)
      if (!events.success)
        throw new Error(events.error.message)
      process.stdout.write(JSON.stringify({
        id,
        status: task.data.status,
        output: task.data.output,
        events: events.data.map(({ sequence, data }) => ({ sequence, data })),
      }) + '\n')
      break
    }

    // Keep waiting while the job is queued or running. Other states end the wait and report the failure or status.
    if (task.data.status !== 'queued' && task.data.status !== 'running')
      throw new Error(task.data.failure ?? task.data.status)
    if (Date.now() >= deadline)
      throw new Error('Timed out waiting for the report')
    await delay(50)
  }
}
finally {
  // Shutdown stops claims, unregisters handlers, and cleans up local executions. Close the database after cleanup is confirmed.
  const closed = await runner.close()
  if (!closed.success) {
    process.stderr.write(closed.error.message + '\n')
    process.exitCode = 1
  }
  else {
    const released = await reldb.close()
    if (!released.success) {
      process.stderr.write(released.error.message + '\n')
      process.exitCode = 1
    }
  }
}
```

#### 4. Run the example and check the output

```sh
node report-demo.mjs
```

The startup logs are followed by these two lines. Both show the same 64-character hexadecimal ID. The second line's `output` comes from the handler's return value. The event with sequence 1 comes from `context.emit`.

```text
{"id":"<ID>","status":"queued"}
{"id":"<ID>","status":"succeeded","output":{"month":"2026-11","rows":120},"events":[{"sequence":1,"data":{"phase":"reading"}}]}
```

The in-memory database closes when the example exits. Use a shared database to let another process claim the job or to read results after restarting the API process. [Two-node example](#two-node-example)

<a id="api-reference"></a>

## Runner operations

<a id="nodes"></a>

### Start nodes and register handlers

One process can submit and execute jobs. To scale the two roles independently, set `executor: false` in the request-handling process. The execution process registers handlers and claims jobs. Each execution node requires a unique `nodeId` that stays stable across restarts.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `runner.create()` | Create an instance with an independent lifecycle | No arguments. Instances share the process's RelDB connection | `RunnerFunctions`. Call `init` to start it | `const api = runner.create()` |
| `RunnerConfigSchema.safeParse(input)` | Validate the settings read by the host | Configuration object supplied by YAML or application code | Zod result. Success data includes defaults. On failure, `error.issues` identifies the fields | `RunnerConfigSchema.safeParse({ nodeId: 'reports-api' })` |
| `runner.init(config)` | Initialize the durable tables and start a node | `config: RunnerConfigInput`. `nodeId` is required and `executor` defaults to `true`. [Configuration fields](../configuration/runner.en.md#configuration-fields) | `Promise<HaiResult<void>>`. Configuration, database, or duplicate startup errors stop initialization | `await runner.init({ nodeId: 'reports-api', executor: false })` |
| `runner.isExecutor` | Check whether the instance is active in the execution role | Read-only property | `boolean`. Returns `false` before initialization, during shutdown, or on API-only nodes | `const canExecute = runner.isExecutor` |
| `runner.register(kind, handler)` | Bind a job kind to a trusted handler | `kind` is a 1–100 character identifier. `handler(input, context)` validates the input and returns JSON asynchronously | `HaiResult<() => void>`. Duplicate kinds on an execution node give `CONFLICT`. The success callback unregisters this handler | `runner.register('report.v1', async input => input)` |
| `runner.environment(id)` | Inspect a configured container environment | `id` is the environment ID from configuration | `HaiResult<RunnerEnvironment>`. Unknown IDs give `NOT_FOUND` | `runner.environment('alpine-offline')` |
| `context.emit(data)` | Save progress for the current job | `data: RunnerJson`. Up to 512 KiB per event, subject to the event count and total persisted payload limit of 16 MiB per job | `Promise<HaiResult<void>>`. Read successful writes in sequence. An expired lease, exceeded deadline, or exceeded limit causes failure | `await context.emit({ phase: 'reading' })` |
| `runner.close()` | Stop claiming work and wait for local jobs to release resources | No arguments. `closeTimeoutMs` controls the shutdown deadline | `Promise<HaiResult<void>>`. If cleanup cannot be confirmed, returns `CLEANUP_UNCONFIRMED` | `await runner.close()` |

The handler receives the execution ID in `context.id`, the original caller's `scope`, and the node ID and process generation in `owner`. The submission also supplies any `parentId` and `locale`. Use `context.signal` to interrupt slow queries and I/O. API nodes can call `register` as part of the same startup routine. Handlers execute only on execution nodes.

<a id="two-node-example"></a>

#### Scenario: Submit and execute jobs in separate processes

Use two terminals to simulate separate deployments. The API node submits jobs to PostgreSQL and reads their state. The execution node polls the same database, claims `report.v1`, calls the report handler, and writes back its output and events. The processes exchange jobs through the database.

| Node | How it runs | Responsibilities |
| --- | --- | --- |
| API node `report-api` | One command per request, with `executor: false` | `submit` saves the job and returns its execution ID. A separate `status` command uses the same scope and ID to call `get` and `events` |
| Execution node `report-worker` | Long-running process, with `executor: true` | Registers `report.v1` using `register`, claims the job from the shared database, and runs the handler |

A job goes through these three steps. The arrows show how each process uses the shared database.

```text
API submit → PostgreSQL   Save the report request and return its ID
Worker     ↔ PostgreSQL   Claim the job and write progress and output
API status ← PostgreSQL   Read progress and output using the original scope and ID
```

**1. Prepare the shared database.** Open both terminals in the quick start project directory. Reuse its dependencies and `report.mjs`. Prepare a reachable PostgreSQL database. The database role needs permission to create tables and indexes and read and write records in the target schema. Save the actual connection settings in `.env.local` and exclude this file from version control. For separate machines, use a reachable database address and point both processes to the same database and schema.

```dotenv
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=runner_demo
PGUSER=runner_demo
PGPASSWORD=your-database-password
```

Save `report-db.mjs`. Both scripts open the database with these settings. At shutdown, wait for Runner to stop claiming jobs and confirm local cleanup before releasing the database connection.

```js
import { reldb } from '@h-ai/reldb'
import { runner } from '@h-ai/runner'

export async function openReportDatabase() {
  // Read the connection settings from the environment file shared by both processes.
  const { PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } = process.env
  if (!PGHOST || !PGDATABASE || !PGUSER)
    throw new Error('Set PGHOST, PGDATABASE and PGUSER before starting')

  // RelDB verifies the connection. A connection failure prevents either script from calling runner.init.
  const opened = await reldb.init({
    type: 'postgresql',
    host: PGHOST,
    port: Number(PGPORT ?? '5432'),
    database: PGDATABASE,
    user: PGUSER,
    password: PGPASSWORD,
  })
  if (!opened.success)
    throw new Error(opened.error.message)
}

export async function closeReportNode() {
  // If cleanup is unconfirmed, keep RelDB open so the caller can report the error and retry.
  const stopped = await runner.close()
  if (!stopped.success)
    return stopped

  // Runner has stopped using the database. Report any database shutdown error.
  const released = await reldb.close()
  if (!released.success)
    throw new Error(released.error.message)
  return stopped
}
```

**2. Save the execution script as `report-worker.mjs`.** It needs the job kind and handler. Once the command prints `report-worker ready for report.v1`, it can claim jobs submitted from the other terminal.

```js
import { setTimeout as delay } from 'node:timers/promises'
import { runner } from '@h-ai/runner'
import { closeReportNode, openReportDatabase } from './report-db.mjs'
import { buildReport, reportKind } from './report.mjs'

await openReportDatabase()
let stopping = false
const requestStop = () => { stopping = true }
process.on('SIGINT', requestStop)
process.on('SIGTERM', requestStop)

try {
  // Use a stable ID for this execution node. Only register the handler and print ready after startup succeeds.
  const started = await runner.init({ nodeId: 'report-worker', executor: true })
  if (!started.success)
    throw new Error(started.error.message)

  // Jobs whose kind matches report.v1 are routed to this handler.
  const registered = runner.register(reportKind, buildReport)
  if (!registered.success)
    throw new Error(registered.error.message)
  process.stdout.write('report-worker ready for report.v1\n')

  for (;;) {
    // Runner's poll timer does not keep Node.js running. Use a regular timer to keep this standalone process alive.
    while (!stopping)
      await delay(100)

    // Ctrl+C or SIGTERM starts shutdown. If cleanup is unconfirmed, keep the process and database open and wait for another signal.
    stopping = false
    const closed = await closeReportNode()
    if (closed.success)
      break
    process.stderr.write(closed.error.message + '\n')
  }
}
catch (error) {
  // Attempt cleanup after a startup or execution error, then propagate the original error to Node.js.
  const closed = await closeReportNode()
  if (!closed.success)
    process.stderr.write(closed.error.message + '\n')
  throw error
}
finally {
  process.off('SIGINT', requestStop)
  process.off('SIGTERM', requestStop)
}
```

**3. Save the submission script as `report-api.mjs`.** The `submit` command writes a monthly report job to the shared database and exits. The `status <ID>` command opens a new process to query it. Both commands use the same sample `scope`.

```js
import { runner } from '@h-ai/runner'
import { closeReportNode, openReportDatabase } from './report-db.mjs'
import { reportKind } from './report.mjs'

const [command, id = ''] = process.argv.slice(2)
if (command !== 'submit' && (command !== 'status' || !id))
  throw new Error('Usage: report-api.mjs submit | status <ID>')

await openReportDatabase()
try {
  // Enable only submission and query APIs. This process does not claim jobs.
  const started = await runner.init({ nodeId: 'report-api', executor: false })
  if (!started.success)
    throw new Error(started.error.message)

  const scope = { tenantId: 'demo', userId: 'alice' }
  if (command === 'submit') {
    // The execution node matches the kind from reportKind. Running the same command again returns the same ID.
    const submitted = await runner.submit({
      scope,
      kind: reportKind,
      idempotencyKey: 'report-2026-11',
      input: { month: '2026-11' },
    })
    if (!submitted.success)
      throw new Error(submitted.error.message)
    process.stdout.write(JSON.stringify({ id: submitted.data.id, status: submitted.data.status }) + '\n')
  }
  else {
    // Read the state using the original scope and the ID passed on the command line. Check status once the read succeeds.
    const task = await runner.get(scope, id)
    if (!task.success)
      throw new Error(task.error.message)

    // Read the job's durable events. The list is empty while the job is queued.
    const events = await runner.events(scope, id, 0, 20)
    if (!events.success)
      throw new Error(events.error.message)
    process.stdout.write(JSON.stringify({
      id,
      status: task.data.status,
      owner: task.data.owner?.nodeId,
      output: task.data.output,
      failure: task.data.failure,
      events: events.data.map(({ sequence, data }) => ({ sequence, data })),
    }) + '\n')
  }
}
finally {
  // Close this API process's Runner and RelDB. Submitted jobs remain in the shared database.
  const closed = await closeReportNode()
  if (!closed.success)
    throw new Error(closed.error.message)
}
```

**4. Follow the job from submission to result.** With a fresh database, leave the execution node stopped. Submit the job in terminal A and copy the receipt's `id`. Replace `<ID>` in the remaining commands with that value.

```sh
node --env-file=.env.local report-api.mjs submit
node --env-file=.env.local report-api.mjs status "<ID>"
```

The submit command prints `{"id":"<ID>","status":"queued"}`. After it exits, the status command still returns `queued` and `events: []`. The job is saved in PostgreSQL and waiting to be claimed.

Start the execution node in terminal B and leave it running.

```sh
node --env-file=.env.local report-worker.mjs
```

After `report-worker ready for report.v1` appears, query the same ID from terminal A. If you see `queued` or `running`, repeat the query after a short wait.

```sh
node --env-file=.env.local report-api.mjs status "<ID>"
```

```text
{"id":"<ID>","status":"succeeded","owner":"report-worker","output":{"month":"2026-11","rows":120},"events":[{"sequence":1,"data":{"phase":"reading"}}]}
```

The `owner` field confirms that the node in terminal B ran the report. Running `submit` again returns the original ID and current state. Once the job succeeds, press Ctrl+C in terminal B and run the same status command in terminal A. The result is still available. On shutdown, Runner signals any handlers still running on that execution node to cancel. If the job stays queued, check that both processes use the same database and schema, that the execution node is ready, and that its registered kind matches the submitted `kind`.

Map the commands to `POST /reports` and `GET /reports/{id}` to integrate with a web API. In the create route, derive `scope` from the authenticated caller, pass the requested report month in `input`, and return HTTP 202 with `{ id, status }` after submission succeeds. In the query route, derive `scope` from the current authenticated caller and use the path `id` to read status and events. The same long-running execution script claims jobs through PostgreSQL.

<a id="tasks"></a>

### Submit jobs, resume progress, and cancel

Save the execution ID from the receipt with the business record. If the client disconnects, the server can recover the execution ID using the business idempotency key and read the status and events under the same scope.

<a id="task-kinds"></a>

#### Choose how a job runs

When `submit` accepts a new job, it creates an execution record. Choose the `kind` that matches a handler, such as `report.v1` for generating a monthly report. Then decide which capacity the job should use and whether it needs a specific running process.

| Term | How to submit | When to use it |
| --- | --- | --- |
| Regular job | Omit `capacityClass` and `parentId` | Generate a report or export a file as independent work. A matching execution node claims it from regular capacity |
| Parent job | Submit it as usual and keep the receipt's `id` | It holds an open connection or a running process. It becomes a parent when another job refers to that ID as its `parentId` |
| Control child job | Use the ID of a running parent in the same scope as `parentId` and leave `capacityClass` at its default | Send a message to a live session in the original process. The parent's node and process generation execute it. It has its own receipt and uses `maxControlRunning` |
| Tool job | A trusted service sets `capacityClass: 'tool'` | Reserve resources and concurrency for tools even when regular jobs such as reports fill their own allocation. Uses `toolMaxRunning` and `toolCapacity` |

Containers are a separate choice. Supply an `environmentId` when the job needs process isolation. Regular jobs can also use containers. To read progress or cancel an entire execution, use `get`, `events`, or `cancel` from the table below.

Applications already using the Tools catalog and authorization can submit durable tool jobs through [Tools Runner](tools-runner.en.md) and use Runner’s existing queues, containers, and capacity settings.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `runner.submit(request)` | Durably accept a job | `request: RunnerSubmit`. `scope`, `kind`, and `input` are required | `Promise<HaiResult<RunnerExecution>>`. New jobs are `queued`. Retrying the same key can return the existing job's state | `await runner.submit({ scope, kind: 'report.v1', input: { month: '2026-11' } })` |
| `runner.find(scope, kind, key)` | Recover an execution using its business idempotency key | `scope: RunnerScope`, `kind: string`, and the initial submission's `idempotencyKey` | `Promise<HaiResult<RunnerExecution \| undefined>>`. No match can mean the record has yet to be created or has been pruned | `await runner.find(scope, 'report.v1', 'report-2026-11')` |
| `runner.get(scope, id)` | Read the current state and output | Original scope and the 64-character hexadecimal execution ID from the receipt | `Promise<HaiResult<RunnerExecution>>`. A missing record for this scope gives `NOT_FOUND` | `await runner.get(scope, id)` |
| `runner.events(scope, id, after?, limit?)` | Continue reading persisted job events | Scope and execution ID. `after` is a nonnegative safe integer and defaults to `0`. Reads events after that sequence. `limit` defaults to `100` and accepts 1–100 | `Promise<HaiResult<RunnerEvent[]>>`. A successful empty page means no more events are currently available | `await runner.events(scope, id, 1, 20)` |
| `runner.cancel(scope, id)` | Save a cancellation request | Original scope and execution ID | `Promise<HaiResult<RunnerExecution>>`. A queued job can change directly to `cancelled`. A running job typically returns `cancelling` first | `await runner.cancel(scope, id)` |

##### Submission fields

| Field | Requirements, defaults, and effect |
| --- | --- |
| `scope` | Required `{ tenantId, userId }`. Each ID is 1–200 characters. Derive it from the authenticated caller and check permissions on every query and cancellation |
| `kind` | Required, 1–100 letters, digits, underscores, periods, or hyphens. Execution nodes match this string against registered handlers |
| `input` | Required JSON. Use `null` for jobs with no business input. The entire submission and a successful business output each have a 512 KiB limit |
| `idempotencyKey` | Optional, 1–200 characters. The same request with the same scope, kind, and key returns the same execution ID. Changing business input or other identity fields gives `CONFLICT` |
| `reuseKey` | Optional, 1–200 characters. Trusted services can reuse an existing reservation. A successful submission also records a new idempotency key supplied with it. An unreconciled `unknown` job can retain the reuse key |
| `locale` | Optional language tag, 1–64 characters. The first segment uses ASCII letters. Hyphen-separated segments may contain ASCII letters or digits. A handler reads it through `context.locale`. Retries use the first recorded locale |
| `environmentId` | Optional container environment ID. Omit it for a handler that runs directly on the host. When set, register the same environment on the API and execution nodes |
| `resources` | Optional overrides for `cpu`, `memoryMiB`, `pids`, and `scratchMiB`. With a container, overrides cannot exceed the environment's limits and the process limit must be at least 2. When a host job supplies overrides, omitted fields default to 1 CPU, 64 MiB of memory, 16 processes, and 16 MiB of temporary storage |
| `nodeId` | Optional target node. When omitted, any eligible execution node can claim the job |
| `parentId` | Optional ID of a running execution in the same scope. Control jobs run on that parent's node and generation. Use `capacityClass: 'default'` and omit `nodeId`, `environmentId`, `resources`, `reuseKey`, and `concurrency` |
| `capacityClass` | Optional, defaults to `default`. Trusted services can use `tool` for a separate concurrency and resource budget |
| `concurrency` | Optional `{ key, limit }`. The same kind and key share a concurrency limit across nodes. `limit` is an integer from 1 to 1000. When active limits differ, the smaller limit applies |
| `warmPool` | Optional `true`. Use `tool` and match the registered pool's environment, job kind, and concurrency settings. Omit per-job resource overrides |
| `queueTimeoutMs`, `runTimeoutMs` | Optional deadlines measured from durable queuing and claim respectively. Each accepts 1–86400000 milliseconds and defaults to 300000 |

#### Scenario: Resume the monthly report after reconnecting

Suppose the caller kept the report's idempotency key but disconnected before reading any events. After submitting the sample report, run this code on an initialized API node connected to the same database. A real service derives `scope` from the authenticated caller and stores the last event sequence on the caller's side. This example uses a fixed test scope.

```ts
import { runner, type RunnerScope } from '@h-ai/runner'

async function resumeReport(scope: RunnerScope, after = 0) {
  // Recover the execution ID using the original scope, kind, and idempotency key. An undefined data value means there is no current record to resume.
  const found = await runner.find(scope, 'report.v1', 'report-2026-11')
  if (!found.success)
    throw new Error(found.error.message)
  if (!found.data)
    return undefined

  // Read at most 20 events after this cursor. Keep the old cursor if the page is empty.
  const latest = await runner.events(scope, found.data.id, after, 20)
  if (!latest.success)
    throw new Error(latest.error.message)
  return {
    id: found.data.id,
    status: found.data.status,
    output: found.data.output,
    events: latest.data.map(({ sequence, data }) => ({ sequence, data })),
    after: latest.data.at(-1)?.sequence ?? after,
  }
}

const scope = { tenantId: 'demo', userId: 'alice' }
// Start at 0. For the completed sample report, this page includes the reading event and report output.
const firstPage = await resumeReport(scope, 0)
if (firstPage) {
  process.stdout.write(JSON.stringify(firstPage) + '\n')
  // Resume with the previous page's after value. This handler emits one event, so the second page is empty.
  const nextPage = await resumeReport(scope, firstPage.after)
  process.stdout.write(JSON.stringify(nextPage) + '\n')
}
```

In this example `firstPage.after` is `1` and `events` contains `{"sequence":1,"data":{"phase":"reading"}}`. The second query returns `events: []` and keeps the cursor at `1`. If there is no record, check the original scope, kind, and key, then check the retention period. Runner can accept the same key again after pruning the record. The app maintains any longer business deduplication period.

If report requests must first be saved as business records, commit the business transaction and pass the record's stable ID to Runner as the `idempotencyKey`. If delivery is interrupted, scan for saved records without an execution ID and submit them again with the same key. The business system verifies ownership and prevents duplicate writes when publishing the report.

#### Scenario: Cancel a queued report preview

Run this code on an initialized API node. The execution node registers only `report.v1` in this example, so `report.preview.v1` stays queued. Use the same cancellation API to cancel queued or running jobs in production.

```ts
import { runner, type RunnerScope } from '@h-ai/runner'

async function cancelPreview(scope: RunnerScope) {
  // Save a preview job with no registered handler. A submission failure leaves no receipt to cancel.
  const preview = await runner.submit({
    scope,
    kind: 'report.preview.v1',
    input: { month: '2026-11' },
  })
  if (!preview.success)
    return preview
  // Cancel using the original scope and receipt ID. This example should return cancelled.
  const requested = await runner.cancel(scope, preview.data.id)
  if (!requested.success)
    return requested
  // Read the current state. For jobs that already started, keep polling until they settle.
  return await runner.get(scope, preview.data.id)
}

const scope = { tenantId: 'demo', userId: 'alice' }
const result = await cancelPreview(scope)
if (!result.success)
  throw new Error(result.error.message)
process.stdout.write(JSON.stringify({ id: result.data.id, status: result.data.status }) + '\n')
```

The diagram shows the saved state of one job in the shared database. `queued` confirms acceptance. In `cancelling`, the executor is still handling the stop request. Lease loss or unconfirmed cleanup can lead to `unknown`. Review external effects and resource reservations in that case.

![Runner job states from durable queuing to claim, shutdown, and manual reconciliation](../images/function-runner-states.en.svg)

The report preview goes from `queued` to `cancelled`. For work already in progress, keep querying after `cancelling` until the job reaches `cancelled`, another terminal state, or `unknown`. See the fields, states, and retention period in [Execution records](../data/runner.en.md#table-hai-runner-executions).

<a id="scenario-send-control-work-to-the-parent-jobs-execution-node"></a>
<a id="parent-control"></a>

#### Scenario: Send the next message to a live session

The next message can arrive at a different API process. The open connection to the agent or other interactive program still lives in the execution process that started it. Runner uses `parentId` to deliver the message to the process that holds that connection. A restarted process with the same node ID cannot take over the old connection. Hai's managed ACP uses this approach to route prompts and session-close requests. [Managed ACP sessions](../development/ai-acp.md)

| Who | What they do |
| --- | --- |
| Original execution process | The parent job opens the connection, stores it in process memory using `context.id`, and removes it when the parent ends. The same process handles messages for the connection |
| API process | Look up the parent's receipt ID in the application's session record, use the same authorized scope as the parent, and submit a message job. Keep the new receipt ID to look up the reply to that message |

Here is how to connect an application that already has a session protocol. On the execution process, call `registerSessionMessages(connections)` after `runner.init`. After a successful handshake, the parent job calls `connections.set(context.id, connection)` and emits a progress event to tell the API that the connection is ready. It removes the entry in `finally`. The application's `connection.send` method sends the message and returns a reply.

```ts
import { runner } from '@h-ai/runner'

type SessionConnection = { send: (message: string, signal: AbortSignal) => Promise<string> }

function registerSessionMessages(connections: ReadonlyMap<string, SessionConnection>) {
  // Register the message handler. It can look up the connection in the parent's execution process.
  const registered = runner.register('session.message.v1', async (input, context) => {
    if (typeof input !== 'string' || !context.parentId)
      throw new Error('Expected a message and a parent execution')
    const connection = connections.get(context.parentId)
    if (!connection)
      throw new Error('Session connection is closed')

    // Pass cancellation through to the session protocol. The reply becomes the output of this child job.
    const reply = await connection.send(input, context.signal)
    return { reply }
  })
  if (!registered.success)
    throw new Error(registered.error.message)
  return registered.data
}
```

The API process calls the following submission function. It takes the parent ID from the application's session record and uses the new receipt ID for subsequent lookups.

```ts
import { runner, type RunnerScope } from '@h-ai/runner'

async function submitSessionMessage(scope: RunnerScope, parentId: string, message: string) {
  // Route the message to the original running process. An ended parent causes CONFLICT.
  const submitted = await runner.submit({ scope, parentId, kind: 'session.message.v1', input: message })
  if (!submitted.success)
    throw new Error(submitted.error.message)

  // The receipt ID identifies this message. The parent ID still identifies the original session.
  return submitted.data.id
}
```

For example, send `next`. If the session replies with `ready`, `runner.get` using the new receipt ID returns `output: { reply: 'ready' }` once the child succeeds. If the parent already ended, submission returns `CONFLICT`. If it ends while the child is queued, the child becomes `cancelled` with `failure: 'parent-ended'`. To display recorded progress, call `events`. To stop the whole parent job, cancel its ID.

<a id="containers"></a>

### Run jobs in isolated containers

The submission process selects a configured environment through `environmentId` in `runner.submit`. The handler on the execution process uses `context.start({ command, args })` to start the command and get a `child` handle. The trusted handler chooses the command. Containers are offline by default, have read-only root filesystems, and run as UID and GID 1000. [Container configuration example](../configuration/runner.en.md#container-example)

| What to retrieve | What to call on the execution process | Where the submission process sees it |
| --- | --- | --- |
| A short command result | Read `child.stdout`, check the exit code, then return JSON | Read `output` using `runner.get` |
| One generated file | Have the program write to `/output` and call `child.artifact` before it exits | Return short text or save a large file to authorized storage and return a reference |
| Multiple files changed by a script | Initialize a `workspace`, then capture it with `child.snapshot` before the program exits | Read the content or reference the handler returns |

`child.wait()` reports how the program exited. `child.close()` stops the container and clears staging files, so the examples call it in `finally`. The handler reads streams and files explicitly. Use `context.emit` for progress that clients should be able to read after reconnecting. [Which streamed data is stored](../data/runner.en.md#ai-sse)

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `context.start(launch)` | Start one process in the assigned environment | `launch: RunnerLaunch`. Call at most once per job | `Promise<HaiResult<RunnerProcess>>`. Missing environment, invalid settings, lease loss, or engine startup errors cause failure | `await context.start({ command: '/bin/sh', args: ['-c', 'printf ready'] })` |
| `child.stdin`, `child.stdout`, `child.stderr` | Send and read standard streams | Node.js streams on the returned handle | `Writable`, `Readable`, and `Readable` | `child.stdin.end()`, `child.stderr.resume()` |
| `child.wait()` | Wait for the attached process to exit | No arguments | `Promise<{ code, signal }>`. Check the exit code. `0` indicates successful completion | `const exit = await child.wait()` |
| `child.artifact(name, maxBytes)` | Read an artifact from a running container | `name` is a flat filename in `/output`. `maxBytes` is an integer from 1 byte to 50 MiB | `Promise<HaiResult<string>>`. Success carries Base64. A stopped container, non-regular file, or exceeded limit causes failure | `await child.artifact('report.txt', 64)` |
| `child.snapshot(maxBytes)` | Capture a running container's writable workspace | Positive integer `maxBytes` within the workspace budget. The launch needs `workspace` and the image needs Node.js | `Promise<HaiResult<Record<string, string>>>`. Maps relative paths to Base64 contents | `await child.snapshot(1024 * 1024)` |
| `child.close()` | Remove the container and clear local staging files | No arguments | `Promise<HaiResult<void>>`. Returns `CLEANUP_UNCONFIRMED` when release cannot be verified. You can retry | `await child.close()` |

<a id="launch-and-warm-pool-fields"></a>

##### Container launch fields

| Field | Requirements, defaults, and effect |
| --- | --- |
| `command`, `args` | `command` is required, cannot be empty, and cannot start with a hyphen. `args` defaults to an empty array and accepts up to 128 items. Pass the executable and arguments directly when a shell is unnecessary |
| `cwd` | Defaults to `/workspace`. May specify a normalized directory below it |
| `env`, `files` | Default to empty objects. Up to 128 `env` entries go to the container process. Up to 32 flat text files are copied to `/state` at startup |
| `inputs` | Optional, up to eight flat Base64 files mounted read-only in `/input`. An empty map also allocates `/input` and `/output`. The decoded byte limit is the smaller of 50 MiB and `scratchMiB` converted to bytes. Launches with inputs and prewarming require at least 4 MiB of temporary storage |
| `workspace`, `workspaceExecutables` | Optional cold-start settings. Initialize a private workspace from relative POSIX paths and Base64 contents, up to 512 regular files and 50 MiB within the workspace budget. Executable paths must be unique and present in `workspace`. Snapshots return file contents |

##### Scenario setup

Set up the container engine and environment IDs, then initialize Runner with those settings. Register the following handlers after `runner.init` succeeds on the execution node. For a single-process test, submit jobs from the same script after registration. For separate deployments, submit from the API node and configure the same job environments on both nodes. [Container configuration example](../configuration/runner.en.md#container-example)

Use `alpine-offline` for standard streams, `python-offline` with `/usr/bin/python3` for artifacts and prewarming, and `node-offline` with `node` for snapshots. Resolve real files through the host's authorization policy. The handler rechecks `context.scope` and saves artifacts in the storage chosen by the host.

<a id="container-command-example"></a>

#### Scenario: Run a fixed command and read stdout

Register the `alpine-offline` environment and the following handler on the execution process. It turns stdout into `{ text }`, which the submission process reads using the receipt ID.

```ts
import { runner } from '@h-ai/runner'

function registerContainerReport() {
  // Check that the launch environment is configured before registering this job kind.
  const environment = runner.environment('alpine-offline')
  if (!environment.success)
    return environment

  // Register the handler for the fixed command. Success returns a disposer.
  return runner.register('report.banner.v1', async (_input, context) => {
    // Print a line in the assigned image. Output streams are available after launch succeeds.
    const launched = await context.start({ command: '/bin/sh', args: ['-c', 'printf report-ready'] })
    if (!launched.success)
      throw new Error(launched.error.message)
    const child = launched.data
    child.stdin.end()
    child.stderr.resume()
    try {
      let text = ''
      for await (const chunk of child.stdout)
        text += String(chunk)
      // Check the exit code along with stdout to verify that the command completed.
      const exit = await child.wait()
      if (exit.code !== 0)
        throw new Error('Report command failed')
      return { text }
    }
    finally {
      // Confirm container and staging cleanup. Runner checks again if cleanup cannot be confirmed.
      const stopped = await child.close()
      if (!stopped.success)
        throw new Error(stopped.error.message)
    }
  })
}

const registered = registerContainerReport()
if (!registered.success)
  throw new Error(registered.error.message)
```

Submit the job from an initialized API node. This example uses the scope from the quick start. In a single-process test, reuse the existing `scope` if it has already been declared.

```ts
import { runner } from '@h-ai/runner'

const scope = { tenantId: 'demo', userId: 'alice' }
// Select the registered environment and job kind. Use the receipt ID with the status example to query the result.
const submitted = await runner.submit({
  scope,
  kind: 'report.banner.v1',
  environmentId: 'alpine-offline',
  input: null,
})
if (!submitted.success)
  throw new Error(submitted.error.message)
process.stdout.write(JSON.stringify({ id: submitted.data.id, status: submitted.data.status }) + '\n')
```

Query with the receipt ID and original scope. The successful output is `{"text":"report-ready"}`. The job stays queued while no node matches the job kind, environment, and resource requirements. If a matching node claims the job and its local image is missing, the handler encounters a startup error at `context.start`.

<a id="artifact-example"></a>

#### Scenario: Retrieve a report artifact from a container

The submission process selects `python-offline`. The execution process stages the source in `/input` and the command writes `/output/report.txt`. After printing `ready`, the command waits at `read` while the handler copies the file. Closing stdin then lets the command exit. Register the following handler on the execution process.

```ts
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { runner } from '@h-ai/runner'

// Register a fixed copy job for the demo. The production handler resolves authorized input using the scope.
const copy = runner.register('report.copy.v1', async (_input, context) => {
  // Copy a sanitized read-only sample, signal readiness, and wait for stdin to close.
  const launched = await context.start({
    command: '/bin/sh',
    args: ['-ec', 'cat /input/source.txt > /output/report.txt\nprintf ready\nread -r done || true'],
    inputs: { 'source.txt': Buffer.from('example report').toString('base64') },
  })
  if (!launched.success)
    throw new Error(launched.error.message)
  const child = launched.data
  child.stderr.resume()
  try {
    const ready = once(child.stdout, 'data', { signal: context.signal })
    child.stdout.resume()
    // Wait for readiness or an early exit. If the process exits before generating the file, report its exit status.
    await Promise.race([
      ready,
      child.wait().then(({ code, signal }) => { throw new Error(`Copy exited before ready: ${code ?? signal}`) }),
    ])
    // Read the generated file before the process exits, up to 64 bytes.
    const file = await child.artifact('report.txt', 64)
    if (!file.success)
      throw new Error(file.error.message)
    child.stdin.end()
    // Wait for the command to end. A nonzero exit code indicates handler failure.
    const exit = await child.wait()
    if (exit.code !== 0)
      throw new Error('Copy failed')
    return { text: Buffer.from(file.data, 'base64').toString('utf8') }
  }
  finally {
    // Remove the container and staging files. Cleanup failures retain evidence for reconciliation.
    const stopped = await child.close()
    if (!stopped.success)
      throw new Error(stopped.error.message)
  }
})
if (!copy.success)
  throw new Error(copy.error.message)
```

Reuse the previous scenario's submission code with `kind: 'report.copy.v1'` and `environmentId: 'python-offline'`, keeping `input: null`. Query with the ID from the receipt. The successful output is `{"text":"example report"}`. A production handler normally returns an authorized artifact reference.

<a id="snapshot-example"></a>

#### Scenario: Run a project script and inspect its workspace

The submission process selects `node-offline`. The execution process puts a script in a private `/workspace` and runs it. After the script finishes, the shell waits at `read` while the handler takes the snapshot. Register this handler on the execution process first.

```ts
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { runner } from '@h-ai/runner'

// Register a cold-start workspace check. The app chooses the script. Enable this job kind after registration succeeds.
const registered = runner.register('report.inspect.v1', async (_input, context) => {
  // Run the initial workspace script. Keep the process alive after creating report.txt so the handler can take a snapshot.
  const launched = await context.start({
    command: '/bin/sh',
    args: ['-ec', './scripts/check.sh\nread -r done || true'],
    workspace: {
      'scripts/check.sh': Buffer.from('#!/bin/sh\nprintf checked > report.txt\nprintf ready\n').toString('base64'),
    },
    workspaceExecutables: ['scripts/check.sh'],
  })
  if (!launched.success)
    throw new Error(launched.error.message)
  const child = launched.data
  child.stderr.resume()
  try {
    const ready = once(child.stdout, 'data', { signal: context.signal })
    child.stdout.resume()
    // Wait for the script's ready signal and handle an early exit without readiness.
    await Promise.race([
      ready,
      child.wait().then(({ code, signal }) => { throw new Error(`Workspace check exited before ready: ${code ?? signal}`) }),
    ])
    // Capture relative paths and Base64 contents from the running Node.js image within the byte limit.
    const files = await child.snapshot(1024 * 1024)
    if (!files.success)
      throw new Error(files.error.message)
    const report = files.data['report.txt']
    if (!report)
      throw new Error('Missing report.txt')
    child.stdin.end()
    // Verify that the command exited successfully before returning the text from the snapshot.
    const exit = await child.wait()
    if (exit.code !== 0)
      throw new Error('Workspace check failed')
    return { text: Buffer.from(report, 'base64').toString('utf8') }
  }
  finally {
    // Remove the container and staging directory used by this execution.
    const stopped = await child.close()
    if (!stopped.success)
      throw new Error(stopped.error.message)
  }
})
if (!registered.success)
  throw new Error(registered.error.message)
```

Reuse the submission code from the [fixed command scenario](#container-command-example) with `kind: 'report.inspect.v1'` and `environmentId: 'node-offline'`, keeping `input: null`. Query with the receipt ID. The successful output is `{"text":"checked"}`. Removing the container also removes its workspace. Keep any file contents you need from the snapshot.

<a id="warm-pool"></a>

### Start containers in advance for frequently used tools

A frequently used report-copy tool can move part of its startup cost ahead of submission. The execution node prepares an empty container, writes the input when a matching job arrives, then hands the container to the handler. Each warm container serves one job and is cleaned up after use.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `runner.registerWarmPool(pool)` | Register a pool of single-use prewarmed containers | `pool: RunnerWarmPool`. Register the handler first on execution nodes. The environment must be offline and have enough space for input and output | `HaiResult<() => void>`. Call the success callback to remove the registration and reclaim the node's unassigned containers | `runner.registerWarmPool({ key: 'report-copy', kind: 'report.copy.v1', environmentId: 'python-offline', minReady: 1, maxRunning: 2, maxTotal: 3 })` |

##### Warm pool fields

| Field | Requirements, defaults, and effect |
| --- | --- |
| `pool.key`, `pool.kind`, `pool.environmentId` | Required pool key, job kind, and offline environment ID. Register matching environments and capacity limits on API and execution nodes |
| `pool.minReady`, `pool.maxRunning`, `pool.maxTotal` | Required integers. The ready target accepts 0–1000 and the active and total limits accept 1–1000. The first two must not exceed the total limit. The total includes starting, ready, running, cleaning up, and unreconciled reservations |

#### Scenario: Prepare a warm pool for repeated copy jobs

Reuse the [report artifact handler](#artifact-example). Register `report.copy.v1` on the execution process first, then register the pool on both processes with the same key, kind, environment, and concurrency limits. Only the execution process prepares and claims containers. The handler still supplies `inputs` with the default working directory, leaves `env` and `files` empty, and omits any workspace seed. [Tool capacity configuration](../configuration/runner.en.md#tool-capacity-example)

```ts
import { runner } from '@h-ai/runner'

// Register a single-use warm pool for the Python environment before sending jobs with warmPool.
const pool = runner.registerWarmPool({
  key: 'report-copy',
  kind: 'report.copy.v1',
  environmentId: 'python-offline',
  minReady: 1,
  maxRunning: 2,
  maxTotal: 3,
})
if (!pool.success)
  throw new Error(pool.error.message)
```

The execution process stops at pool registration. The submission process submits a tool job using the same pool key. Match `concurrency.limit` to the pool’s `maxRunning`.

```ts
import { runner, type RunnerScope } from '@h-ai/runner'

async function queueCopy(scope: RunnerScope) {
  // Match the pool's concurrency key and limit. After acceptance, the execution node schedules a container.
  return await runner.submit({
    scope,
    kind: 'report.copy.v1',
    environmentId: 'python-offline',
    capacityClass: 'tool',
    concurrency: { key: 'report-copy', limit: 2 },
    warmPool: true,
    input: null,
  })
}

const submitted = await queueCopy({ tenantId: 'demo', userId: 'alice' })
if (!submitted.success)
  throw new Error(submitted.error.message)
process.stdout.write(JSON.stringify({ id: submitted.data.id, status: submitted.data.status }) + '\n')
```

Use the receipt ID to query the copy job. The successful output is `{"text":"example report"}`. This pool targets one ready container, runs up to two active jobs, and has three slots in total. If no compatible warm container is available, a fresh container can produce the same result within the available budget. Changing only `minReady` updates the ready target and queued jobs remain claimable. When you stop accepting this job kind, call `pool.data()` to release unassigned local containers. Jobs already handed to handlers continue to settle.

<a id="reconciliation"></a>

### Reconcile an unknown job on its original execution node

When a job shows `unknown`, operations checks whether the application wrote or published the report to decide whether it needs a rerun. They also check whether the original process and staging files are gone to decide whether Runner can release its reserved capacity. `reconcileUnknown` handles the second check.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `runner.reconcileUnknown(scope, id, review)` | Record verified cleanup on the original execution node | Original scope and execution ID. `review: RunnerReconciliation` includes the trusted operator and ticket reason | `Promise<HaiResult<RunnerExecution>>`. Success leaves the status `unknown`, sets `reconciledAt`, and releases the reservation. Missing evidence or ongoing cleanup causes failure | `await runner.reconcileUnknown(scope, id, { operatorId: 'ops-1', reason: 'INC-47 container removed' })` |

##### Reconciliation fields and evidence

| Field | Purpose |
| --- | --- |
| `operatorId` | Required identifier, 1–100 characters, from the authorized operations endpoint |
| `reason` | Required, nonempty after trimming, up to 300 characters. Record the ticket and evidence. Newline and NUL characters are invalid |
| `hostResourcesStopped` | Optional `true`. Confirms the host handler has stopped its resources, or confirms that a container creation attempt with no complete ID has settled on the original engine |

- With a complete container ID, confirm the container has stopped and been removed on the original node. Runner verifies the original engine and container identity, then checks and removes the staging files.
- With no complete ID, Runner checks the recorded creation attempt and verified staging receipt. If an ID is still missing, pass `hostResourcesStopped: true` only after confirming the original engine has finished the creation attempt. Runner also checks the attempt and staging identities.
- For jobs run on the host, confirm the application resources have stopped. Runner also checks the original Linux process identity and verifies that the process exited. Control jobs additionally require their parent to have settled or been reconciled. The reservation stays in place while evidence is missing.

#### Scenario: Record removal of the original container

1. Call `runner.get(scope, id)` with the original scope and receipt ID. Confirm `unknown` and find the original execution node from `owner.nodeId`.
2. In an authorized operations interface, get the full ID from `container_json.id`. Verify on the original node that its engine stopped and removed that container. [Execution record](../data/runner.en.md#table-hai-runner-executions)
3. Call the function below on that node. Pass the scope and ID from step 1 and the authenticated operator ID, and replace the reason with the actual incident and evidence. Use the evidence rules above if the full container ID is missing.

```ts
import { runner, type RunnerScope } from '@h-ai/runner'

async function recordContainerCleanup(scope: RunnerScope, id: string, operatorId: string) {
  // Record the verified container removal from INC-47. Success returns an unknown receipt with reconciledAt.
  const verified = await runner.reconcileUnknown(scope, id, {
    operatorId,
    reason: 'INC-47 container removed',
  })
  if (!verified.success)
    return verified
  return { status: verified.data.status, reconciledAt: verified.data.reconciledAt }
}
```

A successful receipt has `status: 'unknown'` and `reconciledAt`, so the capacity reserved by the job is available for reuse. If reconciliation fails, the reservation stays in place. Use the error to check the original node and cleanup evidence. Before rerunning the report, check whether the business system saved or published the original result and apply its idempotency rules.

## Error handling

`HaiResult.success` reports whether the API call succeeded. A successful `get()` can read a `failed` job, and a successful `cancel()` can return a job still in `cancelling`. The package exports these codes through `HaiRunnerError`.

| Error | When it occurs and what to check |
| --- | --- |
| `NOT_INITIALIZED` | The instance has yet to start, or the operation is unavailable during shutdown |
| `ALREADY_INITIALIZED` | The instance is already active, starting, or stopping |
| `INVALID` | Invalid parameters, file paths, resource combinations, or launch settings. Check the relevant field table |
| `NOT_FOUND` | The environment is unregistered or the specified execution is unavailable to this scope |
| `CONFLICT` | A key was used for another request, a registration already exists, the parent is unavailable, or reconciliation conditions changed |
| `UNAVAILABLE` | A dependency, execution engine, or durable store is unavailable. Resolve the cause and recover using the original idempotency key |
| `CAPACITY` | The queue is full or requested resources exceed an allowed limit |
| `LEASE_LOST` | The execution lease is no longer valid or an event write exceeded the job's count or byte limit. Check job status and the event budget. Stop publishing external results after losing the lease |
| `CLEANUP_UNCONFIRMED` | The cleanup deadline passed or resource shutdown could not be verified. Check the job and reconcile on the original node if needed |
