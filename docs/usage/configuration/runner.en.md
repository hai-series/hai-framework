# @h-ai/runner Configuration

<!-- translation: partial -->

[Chinese source](runner.md) · [Data structures](../data/runner.en.md) · [API reference](../function/runner.en.md)

Load `_runner.yml` after initializing shared RelDB. Every participating process needs its own node ID. Register execution environments on worker nodes before submitting jobs.

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: api-east
executor: false
```

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `nodeId`, `executor`, `engine` | Required, `true`, `podman` | Node identity, whether it runs jobs, and container engine. |
| `capacity` | `4` CPU, `4096` MiB, `512` PIDs, `2048` MiB scratch | Shared budget for normal execution. |
| `toolCapacity`, `toolMaxRunning` | `1` CPU, `1024` MiB, `128` PIDs, `512` MiB scratch, `4` jobs | Separate tool budget and maximum number of active tool jobs. |
| `leaseMs`, `pollMs`, `closeTimeoutMs` | `10000`, `50`, `20000` | Lease duration, scheduling interval and shutdown deadline in milliseconds. |
| `maxRunning`, `maxRunningPerScope`, `maxControlRunning`, `maxQueued` | `8`, `4`, `8`, `5000` | Active jobs, per-scope limit, control concurrency and queue capacity. |
| `maxEvents`, `retentionMs` | `10000`, `604800000` | Event cap and retention duration in milliseconds. |
| `environments` | `[]` | Each entry declares an ID, image and resources. Backend defaults to `container`; capabilities default to an empty list. |

Additional options and workflow examples are available in the [Chinese reference](runner.md).
