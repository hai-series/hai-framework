# @h-ai/runner Configuration

[简体中文](runner.md) · [日本語](runner.ja.md)

[Configuration index](README.en.md) · [API reference](../function/runner.en.md) · [Data structures](../data/runner.en.md)

## Configuration entry

Runner reads the object that the Node.js host passes to `runner.init(config)`. Initialize RelDB first and check the Runner initialization result. The host can provide settings directly, for example `await runner.init({ nodeId: 'report-local' })`. A local report job can be submitted and executed in the same process with `environments` omitted.

To maintain settings in a file, save one of the YAML examples below as `config/_runner.yml` in the application directory. The application loads the file and applies environment variables before passing the configuration object to Runner. This startup snippet uses SQLite and runs from the application directory. Install its dependencies with `pnpm add @h-ai/core @h-ai/reldb @h-ai/runner`. The application still needs to register its handler and close Runner before RelDB at shutdown. [Quick start and shutdown example](../function/runner.en.md#quick-start)

```ts
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { runner, RunnerConfigSchema } from '@h-ai/runner'

// Load the Runner file from the application directory. Correct the path or fields if loading fails.
const config = core.config.load('runner', './config/_runner.yml', RunnerConfigSchema)
if (!config.success)
  throw new Error(config.error.message)

// Open the SQLite file in the application directory. A connection failure stops startup.
const database = await reldb.init({ type: 'sqlite', database: './runner.sqlite' })
if (!database.success)
  throw new Error(database.error.message)

// Pass the validated settings to Runner. If startup fails, release the connection opened here.
const started = await runner.init(config.data)
if (!started.success) {
  const closed = await reldb.close()
  if (!closed.success)
    process.stderr.write(closed.error.message + '\n')
  throw new Error(started.error.message)
}
```

Applications that load a shared configuration directory can register the schema with `core.init({ configDir: './config', configSchemas: { runner: RunnerConfigSchema } })`, then validate the value from `core.config.get('runner')` and pass it to Runner.

With Core's environment overrides, `HAI_RUNNER` can supply the whole configuration object, and a field-specific variable such as `HAI_RUNNER_EXECUTOR` can set an individual value. Core applies overrides, expands remaining placeholders in the YAML, and validates the result against the schema. For hosts loading dotenv files, the priority from highest to lowest is the process environment, `.env.<mode>.local`, `.env.local`, `.env.<mode>`, and `.env`. Restart the affected service after changing a file or environment variable to initialize Runner with the new settings. [Environment sources and override rules (Chinese)](runtime.md#配置从哪里来)

<a id="configuration-fields"></a>

## Configuration reference

### Node roles and lifecycle

| Path | Type and accepted values | Default or requirement | Purpose |
| --- | --- | --- | --- |
| `nodeId` | 1–100 ASCII letters, digits, underscores, dots, or hyphens | Required | Identifies the node. Give each concurrently running node a distinct ID and keep an executor's ID stable across restarts so operators can reconcile unsettled jobs |
| `executor` | Boolean | `true` | With `true`, polls for and runs registered jobs. With `false`, supports submission, status queries, and cancellation requests |
| `leaseMs` | Integer, 1000–120000 milliseconds | `10000` | Executors renew their leases periodically. A job that loses its lease can move to `unknown` pending reconciliation |
| `pollMs` | Integer, 10–1000 milliseconds, with `pollMs × 3 < leaseMs` | `50` | Background scheduling interval on an executor |
| `closeTimeoutMs` | Integer, 100–120000 milliseconds | `20000` | Deadline measured from the start of shutdown, including database waits and resource cleanup |

<a id="configuration-examples"></a>
<a id="runner-sqlite"></a>

#### Run local reports in one process

Save this as the local application's `config/_runner.yml` and use the SQLite startup code above. Register and submit `report.v1` in the same process, then query it by its receipt ID. With `input: { month: '2026-11' }`, expect `succeeded` and an output with month `2026-11` and `rows: 120`. [Complete local report example](../function/runner.en.md#quick-start)

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-local
executor: true
```

<a id="runner-deployment"></a>

#### Separate submission and execution with a shared database

Initialize RelDB in both processes against the same PostgreSQL or MySQL database. Save each YAML block as that process's `config/_runner.yml`. If the files already exist, update `nodeId` and `executor` in each one. Give every node a distinct ID and keep that ID across restarts. [Database configuration](reldb.en.md)

The API node submits jobs and queries results. Its `runner.isExecutor` is `false` after startup.

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-api
executor: false
```

On the execution node, `runner.isExecutor` is `true`. Register `report.v1` there and submit a report from the API node. The result should be `succeeded`, with `report-worker` as `owner.nodeId`. [Runnable two-node example](../function/runner.en.md#two-node-example)

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-worker
executor: true
```

### Events and record retention

| Path | Type and accepted values | Default or requirement | Purpose |
| --- | --- | --- | --- |
| `maxEvents` | Integer, 1–100000 | `10000` | Maximum number of events written for one execution. Individual and cumulative byte limits also apply |
| `retentionMs` | Integer, 3600000–31536000000 milliseconds | `604800000` (7 days) | Executors prune settled jobs, events, and additional idempotency keys. Unreconciled `unknown` jobs remain in the database |

#### Limit events and retention for a test report

Set `maxEvents` and `retentionMs` in the executor's `config/_runner.yml`, then restart it. This complete configuration is suitable for a temporary test instance.

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-local
executor: true
maxEvents: 2
retentionMs: 3600000
```

Write three small events with `context.emit()` in the test handler and check each result. The first two succeed and the third is rejected at the limit. If the handler then returns normally, the first two events remain readable by receipt ID. For a settled job with no child jobs, after an hour and the following cleanup pass, `runner.find()` with the original key should succeed with `data: undefined`. Unreconciled `unknown` jobs remain. [Size and retention limits](../data/runner.en.md#size-and-retention)

### Scheduling and ordinary job resources

| Path | Type and accepted values | Default or requirement | Purpose |
| --- | --- | --- | --- |
| `maxQueued` | Integer, 1–100000 | `5000` | Queue limit checked at submission against the shared database. Jobs without a parent share one allowance, and control child jobs have a separate allowance of the same size |
| `maxRunning` | Integer, 1–1000 | `8` | Per-node concurrency limit for ordinary jobs |
| `maxControlRunning` | Integer, 1–1000 | `8` | Per-node concurrency limit for control child jobs |
| `maxRunningPerScope` | Integer, 1–1000 | `4` | Active job limit for a single scope across the shared database. Ordinary jobs, tool jobs, and control child jobs count separately |
| `capacity` | Resource object | Uses the four defaults below if omitted. Supply all four fields when setting it explicitly | Total node budget for ordinary jobs |
| `capacity.cpu` | CPU cores, greater than 0 and at most 1024. Fractions allowed | `4` | CPU budget for ordinary jobs |
| `capacity.memoryMiB` | Integer, 16–2097152 MiB | `4096` | Memory budget for ordinary jobs |
| `capacity.pids` | Integer, 1–1048576 | `512` | Process budget for ordinary jobs |
| `capacity.scratchMiB` | Integer, 3–2097152 MiB | `2048` | Scratch space budget for ordinary jobs |

#### Cap waiting jobs across the shared database

Use this `maxQueued` value on the submitting node. If multiple processes submit jobs, set the same value in each. With an empty test database, submit three jobs that have no parent and no registered handler. Check that the first two are `queued` and the third returns `CAPACITY`. Cancel the first two using their receipts after the test.

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-api
executor: false
maxQueued: 2
```

<a id="set-worker-resource-and-queue-limits"></a>

#### Set worker resource and concurrency limits

Merge `capacity`, `maxRunning`, and `maxRunningPerScope` into the executor configuration. Keep its role and node ID. This example assumes a single executor with no other jobs running.

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-worker
executor: true
capacity:
  cpu: 2
  memoryMiB: 2048
  pids: 256
  scratchMiB: 1024
maxRunning: 4
maxRunningPerScope: 2
```

Use a test handler that can stay active. Start two ordinary jobs with `resources: { cpu: 1 }`, each from a different scope. Once both are running, submit a job with the same resource request from a third scope. It stays queued until one CPU core is available. Repeat with the same scope and `resources: { cpu: 0.5 }` on all three jobs. The third still queues, this time because of `maxRunningPerScope: 2`. [Submission fields and statuses](../function/runner.en.md#tasks)

### Container engine and environments

| Path | Type and accepted values | Default or requirement | Purpose |
| --- | --- | --- | --- |
| `engine` | `"podman"` or `"docker"` | `"podman"` | Local engine used by the executor to launch container jobs |
| `environments` | Array of up to 1000 objects | `[]` | Container environments available to jobs. Each environment has a unique `id` |
| `environments[].id` | 1–100 ASCII letters, digits, underscores, dots, or hyphens | Required on each entry | Value used for `environmentId` at submission |
| `environments[].image` | Pinned image reference of up to 255 characters | Required on each entry | Use a local image ID `sha256:<64 hexadecimal digits>` or a prepared `image-name@sha256:<64 hexadecimal digits>` reference. Digest letters must be lowercase |
| `environments[].backend` | `"container"` | `"container"` | Selects container execution |
| `environments[].architecture` | `"x64"` or `"arm64"` | Optional | When set, selects executors of that architecture |
| `environments[].capabilities` | Array of up to 64 strings in the same format as `id` | `[]` | Labels that callers use to select an environment or check its capabilities |
| `environments[].resources` | Resource object | Required on each entry | Four resource limits for a single container execution |
| `environments[].resources.cpu` | CPU cores, greater than 0 and at most 1024. Fractions allowed | Required | Container CPU limit |
| `environments[].resources.memoryMiB` | Integer, 16–2097152 MiB | Required | Container memory limit |
| `environments[].resources.pids` | Integer, 2–1048576 | Required | Container process limit |
| `environments[].resources.scratchMiB` | Integer, 3–2097152 MiB | Required | Container scratch space limit |
| `environments[].networkPolicy` | `"offline"` or `"internal"` | `"offline"` | `offline` disables network access. `internal` connects the container to a named internal network |
| `environments[].network` | 1–100 ASCII letters, digits, underscores, dots, or hyphens | Required with `internal`. Omit with `offline` | Name of a network already created in the engine and verified as internal. Reserved names are `host`, `bridge`, `none`, `default`, and `podman` |

A submission can lower the environment's resource limits. Its container still needs at least two PIDs. A cold launch without `inputs` can use `scratchMiB: 3`. A launch with `inputs`, including an empty object, and a warm pool need at least 4 MiB. Runner divides the scratch budget between the workspace, state, and temporary directories. Containers with inputs also get an output directory.

<a id="runner-container"></a>
<a id="container-example"></a>

#### Add an offline container environment

Container jobs need Linux cgroup v2, a local engine that supports CPU, memory, and process limits, and a pinned image. Runner executes with UID/GID 1000. The image must provide `/bin/sh` and declare no additional image volumes. Prepare the image and inspect its local ID with the selected engine. For Docker, replace `podman` with `docker` in both commands below and in the YAML `engine` field.

```sh
podman pull docker.io/library/alpine:3.22
podman image inspect --format '{{.Id}}' docker.io/library/alpine:3.22
```

Replace the image placeholder with the ID from the previous step, including the `sha256:` prefix once. For an existing executor, merge `engine` and `environments` into its settings. If you have a separate API node, add the same `alpine-offline` entry to its `environments` with the same image ID and resource settings.

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-worker
executor: true
engine: podman
environments:
  - id: alpine-offline
    image: sha256:0000000000000000000000000000000000000000000000000000000000000000
    resources:
      cpu: 0.5
      memoryMiB: 128
      pids: 32
      scratchMiB: 64
    networkPolicy: offline
```

Register `report.banner.v1` on the execution node, submit from the API with `environmentId: 'alpine-offline'`, then query by receipt ID. Expect `succeeded` and `{"text":"report-ready"}`. For internal networking, first create an internal network in the engine, then use `networkPolicy: internal` and the same `network` name in the corresponding environment on both nodes. [Fixed command and output example](../function/runner.en.md#container-command-example)

For the advanced examples, add two environments with the same structure and their own pinned image IDs.

- `python-offline` supports artifact export and warm pools. Its image needs `/usr/bin/python3`, `/bin/sh`, and `cat`. For the Alpine base image above, add `RUN apk add --no-cache python3` at image build time.
- `node-offline` supports workspace snapshots. Prepare an image with `/bin/sh` and Node.js, such as `docker.io/library/node:24.22.1-bookworm-slim`. [Container API examples](../function/runner.en.md#containers)

### Tool job resources

| Path | Type and accepted values | Default or requirement | Purpose |
| --- | --- | --- | --- |
| `toolMaxRunning` | Integer, 1–1000 | `4` | Per-node tool job limit, including warm reservations and jobs pending cleanup or reconciliation |
| `toolCapacity` | Resource object | Uses the four defaults below if omitted. Supply all four fields when setting it explicitly | Separate total budget for tool jobs |
| `toolCapacity.cpu` | CPU cores, greater than 0 and at most 1024. Fractions allowed | `1` | CPU budget for tool jobs |
| `toolCapacity.memoryMiB` | Integer, 16–2097152 MiB | `1024` | Memory budget for tool jobs |
| `toolCapacity.pids` | Integer, 1–1048576 | `128` | Process budget for tool jobs |
| `toolCapacity.scratchMiB` | Integer, 3–2097152 MiB | `512` | Scratch space budget for tool jobs |

<a id="tool-capacity-example"></a>

#### Reserve a separate budget for tool jobs

Keep the container environment from the previous example and merge `toolCapacity` and `toolMaxRunning` into the executor's settings. The complete configuration below uses the same offline environment. Replace its image placeholder to use it on its own. The host needs resources for both the ordinary and tool budgets.

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-worker
executor: true
engine: podman
toolCapacity:
  cpu: 1
  memoryMiB: 1024
  pids: 128
  scratchMiB: 512
toolMaxRunning: 2
environments:
  - id: alpine-offline
    image: sha256:0000000000000000000000000000000000000000000000000000000000000000
    resources:
      cpu: 0.5
      memoryMiB: 128
      pids: 32
      scratchMiB: 64
    networkPolicy: offline
```

Submit with `capacityClass: 'tool'` to use this budget. Use a test handler that can keep two `alpine-offline` tool jobs running, each under a different scope. Each container can use at most 0.5 CPU cores. A third tool job waits for an available slot and resources, while ordinary jobs can still use their own budget. To use a warm pool, also register an offline tool environment and its pool. [Job categories](../function/runner.en.md#task-kinds) · [Warm pools and task submission](../function/runner.en.md#warm-pool)

### Apply and verify changes

Restart the services through their usual startup entry points. Check that `runner.init()` succeeds and `runner.isExecutor` matches each process's role, then submit a registered test job. If it stays queued, check the shared database connection, the handler registration, and whether the node, container environment, and resource budget match the submission. At shutdown, wait for `runner.close()` and keep the database connection open if cleanup remains unconfirmed. [Job status and reconciliation](../function/runner.en.md#reconciliation)
