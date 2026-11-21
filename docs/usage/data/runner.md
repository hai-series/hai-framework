# runner 数据结构

[English](runner.en.md) · [日本語](runner.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/runner.md) · [功能说明](../function/runner.md)

<a id="example-data"></a>

## 这些数据用来做什么

### 一次待运行或运行中的任务

对应结构：`hai_runner_executions`。

记录一次真实执行要做什么、谁领取、资源上限和当前状态，让多个节点协作而不各执行一份。

```json
{
  "id": "execution-42",
  "kind": "hai.tools.example.v1",
  "state": "queued",
  "owner_node": null,
  "owner_generation": null,
  "cpu_milli": 1000,
  "memory_mib": 256,
  "pids": 64,
  "scratch_mib": 64,
  "created_at": 1794873600000,
  "updated_at": 1794873600000,
  "event_sequence": 0,
  "event_bytes": 0
}
```

这是任务记录的字段节选。`execution-42` 仍在 `queued`，所以 `owner_node` 为空；资源上限是 1 核、256 MiB 内存、64 个进程、64 MiB 临时空间，还没有事件。`created_at` 和 `updated_at` 是 Unix 毫秒。

### 任务运行中留下的顺序消息

对应结构：`hai_runner_events`。

把进度或输出按顺序保存，客户端断线后可从上次读到的位置继续取，不必重新执行任务。

```json
{
  "id": "event-42",
  "execution_id": "execution-42",
  "sequence_number": 1,
  "created_at": 1794873600000
}
```

event-42 是 execution-42 的第1条事件记录；event_json 是实际消息，本例只展示关联和顺序字段。

### 多个节点一起核对剩余资源

对应结构：`hai_runner_gate`。

多个节点同时领取任务时，先围绕这条记录协调资源检查，避免每台都认为还有同一份空闲容量。

```json
{
  "id": 1,
  "revision": 1
}
```

整张表只有 id:1 这一条，revision 随协调更新；1 不是已运行任务总数，也不表示某个节点永久持锁。

## 字段、存储与清理参考

<a id="tables"></a>

### 数据库

Runner 把任务、资源配额和执行事件保存在共享 [reldb](reldb.md)。多个执行节点使用数据库时钟判断截止时间。未列默认值的字段由写入代码设置。

#### `hai_runner_executions`

| 字段                                                     | 含义与约束                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `id`                                                     | 执行主键                                                                                                |
| `scope_key`、`kind`                                      | 权限范围标识、已注册的执行类型                                                                          |
| `request_key`、`reuse_key`                               | 请求内容的核对标识，以及可为空的唯一去重键。提交同一次任务时可用同一去重键找到之前的执行                |
| `request_json`、`environment_key`                        | JSON 保存服务端认可的任务参数、范围、环境、资源上限和执行超时。第二列可为空，有值时标明使用哪个容器环境 |
| `state`、`reason`                                        | 状态与可空失败原因                                                                                      |
| `owner_node`、`owner_generation`、`owner_process_json`   | 可空。保存哪个节点、该节点的哪次启动和哪个进程领取了任务                                                |
| `pinned_node`、`pinned_generation`、`parent_id`          | 可空。记录任务只能由哪个节点或哪次节点启动处理，以及上级任务的 ID                                       |
| `leased_until`、`queue_until`、`run_until`               | 租约、排队和运行截止时间                                                                                |
| `event_sequence`、`event_bytes`                          | 事件游标和已写入字节数，后者 SQL 默认 0                                                                 |
| `cpu_milli`、`memory_mib`、`pids`、`scratch_mib`         | CPU 毫核、内存 MiB、进程数和临时空间 MiB 的额度                                                         |
| `result_json`、`container_json`                          | 可空结果和容器身份/运行信息                                                                             |
| `created_at`、`updated_at`                               | 创建和更新时间                                                                                          |
| `reconciliation_json`、`reconciled_at`                   | 可空人工裁定内容和时间                                                                                  |
| `capacity_class`、`concurrency_key`、`concurrency_limit` | 记录任务占用哪类资源、归入哪组并发统计及该组上限。并发组可为空，上限为必填整数                                    |
| `pool_fingerprint`、`pool_limit`、`warm_state`           | 可空。记录提前启动容器所用的预热池标识、容量上限和准备状态                                              |

时间字段是 Unix 毫秒。除可空字段外，计时与配额使用整数；JSON 列保存任务输入、执行或核验结果。索引覆盖排队状态、节点及租约、范围及容量、并发组、父执行、清理游标以及三类超时。

<a id="events"></a>

#### 执行事件与容量闸门

| 表                  | 字段与用途                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `hai_runner_events` | `id` 是事件主键，`execution_id` 是执行编号，`sequence_number` 是可续读顺序，`event_json` 保存事件，`created_at` 是写入时间。按执行和顺序建索引 |
| `hai_runner_gate`   | `id` 是容量事务的单行主键 1，`revision` 初始为 0，随事务更新，用于协调共享资源预算                                                             |

通常在记录满 7 天后清理。无法确认任务是否已在容器中执行完成时，数据库会保留相关记录，待人工或业务核对结果后再进入清理流程。

### 缓存

模块没有 Redis 键。只有启动任务的节点持有本机进程和容器对象。其他节点通过数据库查询执行状态、检查是否已被领取，或者记录核对后的结果。
