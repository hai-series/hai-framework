# @h-ai/runner 配置

<a id="runner-配置"></a>

[English](runner.en.md) · [日本語](runner.ja.md)

[配置手册](README.md)

实际文件入口是 `config/_runner.yml`，例如 AI Playground 的启动代码注册 `RunnerConfigSchema` 并读取该文件。以下清单只列文件字段；初始化时注入的服务实例和回调属于[功能接入](../function/runner.md)。

## 配置入口

服务启动代码把对象传给 `runner.init(config)`。可以在代码中写这些设置，也可以从项目配置文件读取后再传入。Runner 初始化时会检查字段和取值。

只负责提交或查询任务的 API 服务可以设为 `executor: false`。实际运行任务的服务需要配置普通任务和工具任务的资源上限。多个服务需要连接同一个关系数据库，并登记一致的任务类型与执行环境，才能从同一队列分派任务。

<a id="configuration-fields"></a>

## 配置清单

省略整个 `capacity` 时，普通任务使用 4 核 CPU、4 GiB 内存、512 个进程和 2 GiB 临时空间。如果要改其中一项，例如把内存提高到 8 GiB，需在 `capacity` 中提供完整的四项。`toolCapacity` 用同样方式管理工具任务的独立上限。

| 配置项                                | 默认值/必填                                        | 说明                                                                                                      |
| ------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `nodeId`                              | 必填                                               | 部署中唯一的执行节点 ID。可填字符串，1–100 个字符                                                         |
| `executor`                            | `true`                                             | `false` 时仅接收 API 提交和查询，不运行后台任务                                                           |
| `engine`                              | `"podman"`                                         | 执行节点使用的本地容器引擎。可填 `"podman"`、`"docker"`                                                   |
| `capacity`                            | 4 核 CPU、4 GiB 内存、512 个进程、2 GiB 临时空间   | 普通任务预留资源。填写自定义对象时 4 项都要填写                                                           |
| `capacity.cpu`                        | `4`                                                | CPU 核心数，可用小数。可填数值，0–1024（不含下界）                                                        |
| `capacity.memoryMiB`                  | `4096`                                             | 内存上限，单位 MiB。可填整数，16–2097152                                                                  |
| `capacity.pids`                       | `512`                                              | 进程数量上限。可填整数，1–1048576                                                                         |
| `capacity.scratchMiB`                 | `2048`                                             | 临时写入空间上限，单位 MiB。可填整数，3–2097152                                                           |
| `toolCapacity`                        | 1 核 CPU、1 GiB 内存、128 个进程、512 MiB 临时空间 | 工具任务专用预算。节点的总资源须同时覆盖普通任务和工具两套容量                                            |
| `toolCapacity.cpu`                    | `1`                                                | CPU 核心数，可用小数。可填数值，0–1024（不含下界）                                                        |
| `toolCapacity.memoryMiB`              | `1024`                                             | 内存上限，单位 MiB。可填整数，16–2097152                                                                  |
| `toolCapacity.pids`                   | `128`                                              | 进程数量上限。可填整数，1–1048576                                                                         |
| `toolCapacity.scratchMiB`             | `512`                                              | 临时写入空间上限，单位 MiB。可填整数，3–2097152                                                           |
| `toolMaxRunning`                      | `4`                                                | 工具任务节点并发上限，包含等待清理与待核验作业。可填整数，1–1000                                          |
| `leaseMs`                             | `10000`                                            | 运行租约（毫秒），活跃执行周期性续租。可填整数，1000–120000                                               |
| `pollMs`                              | `50`                                               | Worker 取任务的轮询间隔（毫秒），必须小于 `leaseMs / 3`。可填整数，10–1000                                |
| `maxRunning`                          | `8`                                                | 普通任务节点并发上限。可填整数，1–1000                                                                    |
| `maxRunningPerScope`                  | `4`                                                | 同一个主体范围内的普通任务并发上限。可填整数，1–1000                                                      |
| `maxControlRunning`                   | `8`                                                | 用于控制型任务的并发上限。可填整数，1–1000                                                                |
| `maxQueued`                           | `5000`                                             | 等待队列上限。可填整数，1–100000                                                                          |
| `maxEvents`                           | `10000`                                            | 单次任务可保留的事件上限。可填整数，1–100000                                                              |
| `retentionMs`                         | `604800000`                                        | 已结算任务、事件和幂等键的保留期限（毫秒）。待核验的未知状态保留至处理完成。可填整数，3600000–31536000000 |
| `closeTimeoutMs`                      | `20000`                                            | 关闭执行器时等待在途工作退出的期限（毫秒）。可填整数，100–120000                                          |
| `environments`                        | `[]`                                               | 已登记可分派的执行环境。ID 必须唯一。可填数组，最多 1000 项                                               |
| `environments[].id`                   | 必填                                               | 任务引用的部署环境标识。可填字符串，1–100 个字符                                                          |
| `environments[].image`                | 必填                                               | 固定镜像 digest，例如 `registry.example/sandbox@sha256:…`。可填字符串，最多 255 个字符                    |
| `environments[].backend`              | `"container"`                                      | 环境以容器执行。可填 `"container"`                                                                        |
| `environments[].architecture`         | 可省略                                             | 指定目标架构，省略时不对架构作额外限制。可填 `"x64"`、`"arm64"`                                           |
| `environments[].capabilities`         | `[]`                                               | 部署方给环境登记的能力标签。可填数组（元素为字符串，1–100 个字符），最多 64 项                            |
| `environments[].resources`            | 必填                                               | 每次容器执行的 CPU（核心数）、内存（MiB）、进程数及临时空间（MiB）上限                                    |
| `environments[].resources.cpu`        | 必填                                               | CPU 核心数，可用小数。可填数值，0–1024（不含下界）                                                        |
| `environments[].resources.memoryMiB`  | 必填                                               | 内存上限，单位 MiB。可填整数，16–2097152                                                                  |
| `environments[].resources.pids`       | 必填                                               | 进程数量上限。可填整数，1–1048576                                                                         |
| `environments[].resources.scratchMiB` | 必填                                               | 临时写入空间上限，单位 MiB。可填整数，3–2097152                                                           |
| `environments[].networkPolicy`        | `"offline"`                                        | `offline` 隔离网络。`internal` 限制在指定的隔离网络。可填 `"offline"`、`"internal"`                       |
| `environments[].network`              | 可省略                                             | `internal` 时必填，必须是预先配置的内部网络名称。可填字符串，1–100 个字符                                 |

## 配置示例

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: api-east
executor: false
```

### 给执行节点设置资源和排队上限

写入 `config/_runner.yml`。普通任务合计最多使用 2 核 CPU、2 GiB 内存和 1 GiB 临时空间，同时最多运行 4 个。不是每个任务都获得这份总额度；单任务申请还须在剩余额度内。节点必须与提交任务的服务共用数据库和任务定义。

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

### 为工具任务另留一份资源

普通任务和工具任务分别计算资源。本例给工具任务总计 1 核 CPU、1 GiB 内存，最多同时运行两项；机器的实际总容量须同时容纳 `capacity` 和 `toolCapacity`。这段配置不会注册工具，应用仍需登记真实工具处理程序。

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

### 生效与核对

为执行服务设置独立且稳定的 `nodeId`，并给每个容器环境填写固定的镜像摘要和网络权限。举例来说，容器环境的内存上限为 512 MiB 时，应用不能为单个任务申请 1 GiB。部署后提交一个测试任务，从同一队列查询该任务是否由执行服务领取。[ACP 接入与模型能力](ai.md#acp-接入与模型能力)
