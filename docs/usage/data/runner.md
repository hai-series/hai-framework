# runner 数据结构

[数据结构索引](README.md) · [模块配置](../configuration/runner.md) · [功能说明](../function/runner.md)

## 数据库

模块借用共享 [reldb](reldb.md) 持久化执行、容量和事件。时间列以数据库时间戳协调。未列默认值时由代码在写入时设置。

### `hai_runner_executions`

| 字段                                                     | 含义与约束                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `id`                                                     | 执行主键                                                                    |
| `scope_key`、`kind`                                      | 权限范围标识、已注册的执行类型                                              |
| `request_key`、`reuse_key`                               | 请求指纹、可空唯一的复用键                                                  |
| `request_json`、`environment_key`                        | JSON 保存受信输入、范围、环境与资源上限及执行超时；可空环境标识关联相应环境 |
| `state`、`reason`                                        | 状态与可空失败原因                                                          |
| `owner_node`、`owner_generation`、`owner_process_json`   | 可空执行所有者节点、代际和进程标识                                          |
| `pinned_node`、`pinned_generation`、`parent_id`          | 可空节点或代际绑定，以及父执行标识                                          |
| `leased_until`、`queue_until`、`run_until`               | 租约、排队和运行截止时间                                                    |
| `event_sequence`、`event_bytes`                          | 事件游标和已写入字节数，后者 SQL 默认 0                                     |
| `cpu_milli`、`memory_mib`、`pids`、`scratch_mib`         | CPU 毫核、内存 MiB、进程数和临时空间 MiB 的额度                             |
| `result_json`、`container_json`                          | 可空结果和容器身份/运行信息                                                 |
| `created_at`、`updated_at`                               | 创建和更新时间                                                              |
| `reconciliation_json`、`reconciled_at`                   | 可空人工裁定内容和时间                                                      |
| `capacity_class`、`concurrency_key`、`concurrency_limit` | 容量类别、可空并发组及其上限                                                |
| `pool_fingerprint`、`pool_limit`、`warm_state`           | 可空预热池指纹、容量上限和预热状态                                          |

索引覆盖排队状态、节点及租约、范围及容量、并发组、父执行、清理游标以及三类超时。

### 执行事件与容量闸门

| 表                  | 字段与用途                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `hai_runner_events` | `id` 是事件主键，`execution_id` 是执行编号，`sequence_number` 是可续读顺序，`event_json` 保存事件，`created_at` 是写入时间。按执行和顺序建索引 |
| `hai_runner_gate`   | `id` 是容量事务的单行主键 1，`revision` 初始为 0，随事务更新，用于协调共享资源预算                                                             |

常规记录默认按 7 天保留期清理。效果待核对的记录保留共享状态，直至裁定后才进入相应回收流程。

## 缓存

模块没有 Redis 键。进程和容器句柄属于执行节点，跨节点查询、租约和裁定以数据库为准。
