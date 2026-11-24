# @h-ai/runner Configuration

<!-- translation: partial -->

[Chinese source](runner.md) · [Data structures](../data/runner.en.md) · [API reference](../function/runner.en.md)

## Configuration entry

The actual file is `config/_runner.yml`, loaded by applications such as AI Playground through `RunnerConfigSchema`. This page lists file fields; injected runtime services and callbacks belong to the [API guide](../function/runner.en.md).

Load `_runner.yml` after initializing shared RelDB. Every participating process needs its own node ID. Register execution environments on worker nodes before submitting jobs.

## Configuration reference


| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `nodeId`, `executor`, `engine` | Required, `true`, `podman` | Node identity, whether it runs jobs, and container engine. |
| `capacity` | `4` CPU, `4096` MiB, `512` PIDs, `2048` MiB scratch | Shared budget for normal execution. |
| `toolCapacity`, `toolMaxRunning` | `1` CPU, `1024` MiB, `128` PIDs, `512` MiB scratch, `4` jobs | Separate tool budget and maximum number of active tool jobs. |
| `leaseMs`, `pollMs`, `closeTimeoutMs` | `10000`, `50`, `20000` | Lease duration, scheduling interval and shutdown deadline in milliseconds. |
| `maxRunning`, `maxRunningPerScope`, `maxControlRunning`, `maxQueued` | `8`, `4`, `8`, `5000` | Active jobs, per-scope limit, control concurrency and queue capacity. |
| `maxEvents`, `retentionMs` | `10000`, `604800000` | Event cap and retention duration in milliseconds. |
| `environments` | `[]` | Each entry declares an ID, image and resources. Backend defaults to `container`; capabilities default to an empty list. |

Still untranslated: individual container environment, network and resource fields. Read the [Chinese source section](runner.md#configuration-fields).

## Configuration examples

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: api-east
executor: false
```

### Set worker resource and queue limits

Put this in `config/_runner.yml`. Ordinary tasks share two CPU cores, 2 GiB of memory and 1 GiB of scratch space, with at most four running together. This is the combined node budget, not a grant to every task. The node must share the database and task definitions with the submitting service.

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: worker-east
executor: true
capacity:
  cpu: 2
  memoryMiB: 2048
  pids: 256
  scratchMiB: 1024
maxRunning: 4
maxRunningPerScope: 2
maxQueued: 1000
```

### Reserve a separate budget for tool jobs

Ordinary tasks and tool jobs use separate budgets. Tools share one CPU core and 1 GiB of memory, with at most two active jobs. The host must accommodate both `capacity` and `toolCapacity`. This does not register tools; the application must still register their handlers.

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: tools-east
executor: true
toolCapacity:
  cpu: 1
  memoryMiB: 1024
  pids: 128
  scratchMiB: 512
toolMaxRunning: 2
```
