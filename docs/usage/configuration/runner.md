# @h-ai/runner 配置

<a id="runner-配置"></a>

[English](runner.en.md) · [日本語](runner.ja.md)

[配置手册](README.md) · [功能说明](../function/runner.md) · [数据结构](../data/runner.md)

<a id="configuration-entry"></a>

## 配置入口

Runner 从 Node.js 宿主传给 `runner.init(config)` 的对象读取配置。宿主先初始化 RelDB，再检查 Runner 初始化结果。配置可以由代码直接提供，例如 `await runner.init({ nodeId: 'report-local' })`。本地报表任务可以在同一进程提交和执行，配置中省略 `environments` 即可。

如果希望从文件维护设置，将下面示例中的 YAML 存为应用目录下的 `config/_runner.yml`。应用负责读取文件和处理环境变量，Runner 只接收读取后的配置对象。以下是本地 SQLite 服务的启动片段，从应用目录执行。用 `pnpm add @h-ai/core @h-ai/reldb @h-ai/runner` 安装示例依赖。应用仍需登记处理器，并在退出时先关闭 Runner，再关闭 RelDB。 [最小接入与关闭示例](../function/runner.md#quick-start)

```ts
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { runner, RunnerConfigSchema } from '@h-ai/runner'

// 从当前应用目录读取 runner 配置。失败时先修正路径或字段。
const config = core.config.load('runner', './config/_runner.yml', RunnerConfigSchema)
if (!config.success)
  throw new Error(config.error.message)

// 打开应用目录下的 SQLite 文件。失败时不启动 Runner。
const database = await reldb.init({ type: 'sqlite', database: './runner.sqlite' })
if (!database.success)
  throw new Error(database.error.message)

// 传入校验后的配置。失败时关闭此片段打开的数据库。
const started = await runner.init(config.data)
if (!started.success) {
  const closed = await reldb.close()
  if (!closed.success)
    process.stderr.write(closed.error.message + '\n')
  throw new Error(started.error.message)
}
```

已经统一读取配置目录的宿主，可以在 `core.init({ configDir: './config', configSchemas: { runner: RunnerConfigSchema } })` 中登记 Schema，再校验 `core.config.get('runner')` 的结果并传给 Runner。

使用 Core 的环境覆盖时，`HAI_RUNNER` 可设置整个配置对象，`HAI_RUNNER_EXECUTOR` 之类的单项覆盖可进一步指定字段。Core 先应用覆盖，再展开保留下来的 YAML 占位符，最后按 Schema 校验。宿主如果读取 dotenv 文件，环境来源按进程环境、`.env.<mode>.local`、`.env.local`、`.env.<mode>`、`.env` 的顺序降低优先级。修改文件或环境变量后，重启对应服务以重新初始化 Runner。 [环境来源和覆盖规则](runtime.md#配置从哪里来)

<a id="configuration-fields"></a>

## 配置清单

### 节点角色与生命周期

| 路径 | 类型与取值 | 默认值或必填条件 | 用途 |
| --- | --- | --- | --- |
| `nodeId` | 1–100 个 ASCII 字母、数字、下划线、点或连字符 | 必填 | 标识当前节点。每个同时运行的节点使用不同 ID，同一执行节点重启后保留原 ID，以便核对未结算执行 |
| `executor` | 布尔值 | `true` | 为 `true` 时轮询和执行已登记的任务。为 `false` 时用于提交、查询和请求取消 |
| `leaseMs` | 整数，1000–120000 毫秒 | `10000` | 执行节点周期性续租。失去执行租约的任务可能转为待核验的 `unknown` |
| `pollMs` | 整数，10–1000 毫秒，且 `pollMs × 3 < leaseMs` | `50` | 执行节点的后台调度轮询间隔 |
| `closeTimeoutMs` | 整数，100–120000 毫秒 | `20000` | 从开始关闭起计算，覆盖数据库等待和资源清理 |

<a id="配置示例"></a>
<a id="runner-sqlite"></a>

#### 在一个进程运行本地报表

将以下内容保存为本地应用的 `config/_runner.yml`，使用上面的 SQLite 启动代码。同一进程登记并提交 `report.v1`，用回执中的任务 ID 查询。以 `input: { month: '2026-11' }` 提交时，结果应为 `succeeded`，输出包含月份 `2026-11` 和 `rows: 120`。 [本地报表完整示例](../function/runner.md#quick-start)

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-local
executor: true
```

<a id="runner-deployment"></a>

#### 用共享数据库分开提交与执行

让两个进程分别初始化 RelDB，连接同一个 PostgreSQL 或 MySQL 数据库。下面两份 YAML 各自保存为该进程的 `config/_runner.yml`。已有配置时调整各自的 `nodeId` 和 `executor`，每个节点的 ID 保持唯一且重启后不变。 [数据库配置](reldb.md)

API 节点提交和查询任务，启动后 `runner.isExecutor` 为 `false`。

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-api
executor: false
```

执行节点启动后 `runner.isExecutor` 为 `true`，在此节点登记 `report.v1`。从 API 节点提交月报并查询结果，正常应看到 `succeeded`，且 `owner.nodeId` 为 `report-worker`。 [可运行的两节点示例](../function/runner.md#two-node-example)

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-worker
executor: true
```

### 事件与记录保留

| 路径 | 类型与取值 | 默认值或必填条件 | 用途 |
| --- | --- | --- | --- |
| `maxEvents` | 整数，1–100000 | `10000` | 每次执行可写入的事件数。事件还受单次写入和累计字节限制 |
| `retentionMs` | 整数，3600000–31536000000 毫秒 | `604800000`（7 天） | 由执行节点清理已结算任务、事件及附加幂等键。未核验的 `unknown` 继续保留 |

#### 限制测试报表的事件数与保留时间

把 `maxEvents` 和 `retentionMs` 写入执行节点的 `config/_runner.yml`，重启执行节点。以下完整配置适合临时测试实例。

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-local
executor: true
maxEvents: 2
retentionMs: 3600000
```

让测试处理器调用 `context.emit()` 写入三条小事件，逐次检查结果。前两条成功，第三条达到上限后返回失败；如果处理器继续正常返回，仍可用回执 ID 读取前两条事件。对无子任务的已结算记录，经过一小时保留期并完成下一次清理后，按原幂等键执行 `runner.find()` 应成功返回 `data: undefined`。未核验的 `unknown` 继续保留。 [大小限制与保留](../data/runner.md#size-and-retention)

### 调度与普通任务资源

| 路径 | 类型与取值 | 默认值或必填条件 | 用途 |
| --- | --- | --- | --- |
| `maxQueued` | 整数，1–100000 | `5000` | 提交时检查共享数据库中的等待数量。无父任务的作业共用一份额度，控制子任务另有一份同等额度 |
| `maxRunning` | 整数，1–1000 | `8` | 单节点普通任务并发上限 |
| `maxControlRunning` | 整数，1–1000 | `8` | 单节点控制子任务并发上限 |
| `maxRunningPerScope` | 整数，1–1000 | `4` | 同一主体在共享数据库中的活动任务上限。普通、工具和控制子任务分别计算 |
| `capacity` | 资源对象 | 省略时采用下列四个默认值。显式填写时四项均必填 | 节点的普通任务总预算 |
| `capacity.cpu` | 核心数，大于 0 且不超过 1024，可用小数 | `4` | 普通任务 CPU 预算 |
| `capacity.memoryMiB` | 整数，16–2097152 MiB | `4096` | 普通任务内存预算 |
| `capacity.pids` | 整数，1–1048576 | `512` | 普通任务进程数预算 |
| `capacity.scratchMiB` | 整数，3–2097152 MiB | `2048` | 普通任务临时空间预算 |

#### 限制共享数据库中的等候任务数

用下面的 `maxQueued` 配置提交端。多个进程均可提交时，在各提交进程设置同一个值。用空的测试数据库，提交三条没有处理器领取且没有父任务的请求。先确认前两条处于 `queued`，第三条应返回 `CAPACITY`。测试后按前两条回执取消它们。

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: report-api
executor: false
maxQueued: 2
```

<a id="给执行节点设置资源和排队上限"></a>

#### 给执行节点设置资源和并发上限

在执行节点合并 `capacity`、`maxRunning` 和 `maxRunningPerScope`，保留该节点的角色和 ID。这个例子假设只有一个执行节点，且当前没有其他任务。

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

用一个能暂时保持运行的测试处理器，先让不同主体各启动一条申请 `resources: { cpu: 1 }` 的普通任务。两条都在运行时，从第三个主体提交同等资源的任务。它会继续等待，直到释放 1 核 CPU。改用同一主体和 `resources: { cpu: 0.5 }` 重做时，第三条仍等待，此时受 `maxRunningPerScope: 2` 限制。 [提交参数与状态](../function/runner.md#tasks)

### 容器引擎与环境

| 路径 | 类型与取值 | 默认值或必填条件 | 用途 |
| --- | --- | --- | --- |
| `engine` | `"podman"` 或 `"docker"` | `"podman"` | 执行节点用于启动容器作业的本地引擎 |
| `environments` | 对象数组，最多 1000 项 | `[]` | 允许任务使用的容器环境。各环境的 `id` 必须唯一 |
| `environments[].id` | 1–100 个 ASCII 字母、数字、下划线、点或连字符 | 每项必填 | 应用在提交时使用的 `environmentId` |
| `environments[].image` | 最长 255 个字符的固定镜像引用 | 每项必填 | 使用本地镜像 ID `sha256:<64 位十六进制>` 或已准备的 `镜像名@sha256:<64 位十六进制>`。摘要使用小写字母 |
| `environments[].backend` | 仅 `"container"` | `"container"` | 指定容器执行 |
| `environments[].architecture` | `"x64"` 或 `"arm64"` | 可省略 | 指定时仅匹配该架构的执行节点 |
| `environments[].capabilities` | 字符串数组，最多 64 项。元素格式与 `id` 一致 | `[]` | 供调用方选择环境或校验能力的标签 |
| `environments[].resources` | 资源对象 | 每项必填 | 单次容器执行的四项资源上限 |
| `environments[].resources.cpu` | 核心数，大于 0 且不超过 1024，可用小数 | 必填 | 容器 CPU 上限 |
| `environments[].resources.memoryMiB` | 整数，16–2097152 MiB | 必填 | 容器内存上限 |
| `environments[].resources.pids` | 整数，2–1048576 | 必填 | 容器进程数上限 |
| `environments[].resources.scratchMiB` | 整数，3–2097152 MiB | 必填 | 容器临时空间上限 |
| `environments[].networkPolicy` | `"offline"` 或 `"internal"` | `"offline"` | `offline` 关闭网络，`internal` 连接到指定的内部网络 |
| `environments[].network` | 1–100 个 ASCII 字母、数字、下划线、点或连字符 | `internal` 时必填，`offline` 时省略 | 引擎已创建并确认是内部网络的名称。保留名称 `host`、`bridge`、`none`、`default`、`podman` 不可使用 |

提交任务时可以下调环境的资源上限。容器的 `pids` 仍须至少为 2。不带 `inputs` 的冷启动允许 `scratchMiB: 3`。带 `inputs` 的启动（含空对象）和预热池至少需要 4 MiB。运行时会从这份临时空间中分配工作区、状态和临时目录，带输入的容器还会分配输出目录。

<a id="runner-container"></a>
<a id="container-example"></a>

#### 增加离线容器环境

运行容器的节点需要 Linux cgroup v2、支持 CPU／内存／进程数限制的本地引擎，以及已准备好的固定镜像。Runner 使用 UID/GID 1000 在镜像内执行，镜像需要提供 `/bin/sh` 且不声明额外镜像卷。用选定的引擎准备下例镜像并查看其本地 ID。使用 Docker 时，将下面两条命令中的 `podman` 与 YAML 中的 `engine` 一并改成 `docker`。

```sh
podman pull docker.io/library/alpine:3.22
podman image inspect --format '{{.Id}}' docker.io/library/alpine:3.22
```

把镜像占位值换成上一步的 ID，确保带一个 `sha256:` 前缀。已有执行节点时，合并 `engine` 和 `environments`，保留该节点原有设置。有单独的 API 节点时，把同一条 `alpine-offline` 环境定义加到它的 `environments` 中，两端使用相同的镜像 ID 和资源字段。

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

在执行节点登记 `report.banner.v1`，从提交端指定 `environmentId: 'alpine-offline'`，用回执编号查询结果。成功时状态为 `succeeded`，输出 `{"text":"report-ready"}`。需要使用内部网络时，先在引擎中建立该网络，再在两端把对应环境的 `networkPolicy` 改为 `internal` 并填写同一个 `network`。 [固定命令与输出示例](../function/runner.md#container-command-example)

进阶示例可沿用相同结构添加两个环境，并分别填入对应镜像的固定 ID。

- `python-offline` 用于读回产物和预热。镜像需有 `/usr/bin/python3`、`/bin/sh` 和 `cat`。可在镜像构建阶段为上面的 Alpine 基础镜像执行 `RUN apk add --no-cache python3`。
- `node-offline` 用于工作区快照。可准备带 `/bin/sh` 和 Node.js 的 `docker.io/library/node:24.22.1-bookworm-slim`。 [容器功能示例](../function/runner.md#containers)

### 工具任务资源

| 路径 | 类型与取值 | 默认值或必填条件 | 用途 |
| --- | --- | --- | --- |
| `toolMaxRunning` | 整数，1–1000 | `4` | 单节点工具任务上限，计入预热预留、正在清理和待核验的作业 |
| `toolCapacity` | 资源对象 | 省略时采用下列四个默认值。显式填写时四项均必填 | 独立的工具作业总预算 |
| `toolCapacity.cpu` | 核心数，大于 0 且不超过 1024，可用小数 | `1` | 工具作业 CPU 预算 |
| `toolCapacity.memoryMiB` | 整数，16–2097152 MiB | `1024` | 工具作业内存预算 |
| `toolCapacity.pids` | 整数，1–1048576 | `128` | 工具作业进程数预算 |
| `toolCapacity.scratchMiB` | 整数，3–2097152 MiB | `512` | 工具作业临时空间预算 |

<a id="tool-capacity-example"></a>

#### 为工具任务另留一份资源

保留上一例的容器环境，在执行节点合并 `toolCapacity` 和 `toolMaxRunning`。下方完整示例沿用同一个离线环境，替换镜像占位值后可独立使用。宿主资源需覆盖普通任务与工具任务两套总预算。

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

提交时指定 `capacityClass: 'tool'` 才会使用这份预算。用能保持运行的测试处理器，让两个主体各运行一条 `alpine-offline` 工具任务，每个容器最多用 0.5 核。第三条工具任务会等到有空余名额和资源，普通任务仍可使用其自身的预算。带预热的任务还需登记离线工具环境和预热池。 [任务类别](../function/runner.md#task-kinds) · [预热池与任务提交](../function/runner.md#warm-pool)

### 生效与核对

以应用真实的启动入口重启服务。先确认 `runner.init()` 成功，角色符合 `runner.isExecutor`，再提交一条已登记的测试任务。持续排队时，检查提交与执行是否使用同一数据库、执行端是否已注册任务类型，以及节点、容器环境和资源预算是否匹配。关闭时先等待 `runner.close()`，若清理未确认，保留数据库连接以便继续核验。 [任务状态与核验](../function/runner.md#reconciliation)
