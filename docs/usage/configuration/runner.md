# Runner 配置

[配置手册](README.md)

## 配置入口

宿主在服务启动时提供参数，可直接创建对象，也可自行加载外部文件并校验。

向 `runner.init(config)` 提供 `RunnerConfigInput`，由 `RunnerConfigSchema` 校验。请求接入节点可设置 `executor: false`，执行节点分别分配普通和工具任务容量。分布式节点使用同一共享关系数据库，并由部署方维护相同的环境登记和业务任务类型。

## 配置示例

```yaml schema=@h-ai/runner:RunnerConfigSchema
nodeId: api-east
executor: false
```

## 配置清单

表中的默认值适用于当前配置区块存在时。标为“必填”的字段在使用对应区块或后端时填写。“可省略”表示 Schema 不填充值；如有运行时回退，单独注明。`[]` 表示数组中每一项。

| 配置项                                | 默认值/必填   | 说明                                                                                                      |
| ------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------- |
| `nodeId`                              | 必填          | 部署中唯一的执行节点 ID。可填字符串，1–100 个字符                                                         |
| `executor`                            | `true`        | `false` 时仅接收 API 提交和查询，不运行后台任务                                                           |
| `engine`                              | `"podman"`    | 执行节点使用的本地容器引擎。可填`"podman"`、`"docker"`                                                    |
| `capacity`                            | 存在，见子项  | 普通任务预留资源。填写自定义对象时 4 项都要填写                                                           |
| `capacity.cpu`                        | `4`           | CPU 核心数，可用小数。可填数值，0–1024（不含下界）                                                        |
| `capacity.memoryMiB`                  | `4096`        | 内存上限，单位 MiB。可填整数，16–2097152                                                                  |
| `capacity.pids`                       | `512`         | 进程数量上限。可填整数，1–1048576                                                                         |
| `capacity.scratchMiB`                 | `2048`        | 临时写入空间上限，单位 MiB。可填整数，3–2097152                                                           |
| `toolCapacity`                        | 存在，见子项  | 工具任务专用预算。节点的总资源须同时覆盖普通任务和工具两套容量                                            |
| `toolCapacity.cpu`                    | `1`           | CPU 核心数，可用小数。可填数值，0–1024（不含下界）                                                        |
| `toolCapacity.memoryMiB`              | `1024`        | 内存上限，单位 MiB。可填整数，16–2097152                                                                  |
| `toolCapacity.pids`                   | `128`         | 进程数量上限。可填整数，1–1048576                                                                         |
| `toolCapacity.scratchMiB`             | `512`         | 临时写入空间上限，单位 MiB。可填整数，3–2097152                                                           |
| `toolMaxRunning`                      | `4`           | 工具任务节点并发上限，包含等待清理与待核验作业。可填整数，1–1000                                          |
| `leaseMs`                             | `10000`       | 运行租约（毫秒），活跃执行周期性续租。可填整数，1000–120000                                               |
| `pollMs`                              | `50`          | Worker 取任务的轮询间隔（毫秒），必须小于 `leaseMs / 3`。可填整数，10–1000                                |
| `maxRunning`                          | `8`           | 普通任务节点并发上限。可填整数，1–1000                                                                    |
| `maxRunningPerScope`                  | `4`           | 同一个主体范围内的普通任务并发上限。可填整数，1–1000                                                      |
| `maxControlRunning`                   | `8`           | 用于控制型任务的并发上限。可填整数，1–1000                                                                |
| `maxQueued`                           | `5000`        | 等待队列上限。可填整数，1–100000                                                                          |
| `maxEvents`                           | `10000`       | 单次任务可保留的事件上限。可填整数，1–100000                                                              |
| `retentionMs`                         | `604800000`   | 已结算任务、事件和幂等键的保留期限（毫秒）。待核验的未知状态保留至处理完成。可填整数，3600000–31536000000 |
| `closeTimeoutMs`                      | `20000`       | 关闭执行器时等待在途工作退出的期限（毫秒）。可填整数，100–120000                                          |
| `environments`                        | `[]`          | 已登记可分派的执行环境。ID 必须唯一。可填数组，最多 1000 项                                               |
| `environments[].id`                   | 必填          | 任务引用的部署环境标识。可填字符串，1–100 个字符                                                          |
| `environments[].image`                | 必填          | 固定镜像 digest，例如 `registry.example/sandbox@sha256:…`。可填字符串，最多 255 个字符                    |
| `environments[].backend`              | `"container"` | 环境以容器执行。可填`"container"`                                                                         |
| `environments[].architecture`         | 可省略        | 指定目标架构，省略时不对架构作额外限制。可填`"x64"`、`"arm64"`                                            |
| `environments[].capabilities`         | `[]`          | 部署方给环境登记的能力标签。可填数组（元素为字符串，1–100 个字符），最多 64 项                            |
| `environments[].resources`            | 必填          | 每次容器执行的 CPU（核心数）、内存（MiB）、进程数及临时空间（MiB）上限                                    |
| `environments[].resources.cpu`        | 必填          | CPU 核心数，可用小数。可填数值，0–1024（不含下界）                                                        |
| `environments[].resources.memoryMiB`  | 必填          | 内存上限，单位 MiB。可填整数，16–2097152                                                                  |
| `environments[].resources.pids`       | 必填          | 进程数量上限。可填整数，1–1048576                                                                         |
| `environments[].resources.scratchMiB` | 必填          | 临时写入空间上限，单位 MiB。可填整数，3–2097152                                                           |
| `environments[].networkPolicy`        | `"offline"`   | `offline` 隔离网络。`internal` 限制在指定的隔离网络。可填`"offline"`、`"internal"`                        |
| `environments[].network`              | 可省略        | `internal` 时必填，必须是预先配置的内部网络名称。可填字符串，1–100 个字符                                 |

## 生效与核对

执行节点登记固定镜像 digest 和内网能力，使用稳定节点 ID。调用方为任务指定的资源覆盖只在已登记环境及节点预算内生效。环境和 ACP 联调见 [ACP 接入与模型能力](ai.md#acp-接入与模型能力)。
