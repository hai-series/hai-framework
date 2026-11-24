# runner 数据结构

[English](runner.en.md) · [日本語](runner.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/runner.md) · [功能说明](../function/runner.md)

提交容器任务后，Runner 保存任务状态、执行资源预算和进度事件。客户端断开重连时，可以用原执行编号继续读取事件。

<a id="tables"></a>

<a id="database"></a>

## 数据库

Runner 把任务、资源配额和执行事件保存在共享 [RelDB](reldb.md) 中。节点用数据库时钟判断截止时间。

模块使用 3 张表。

| 表名 | 用途 |
| --- | --- |
| [`hai_runner_executions`](#table-hai-runner-executions) | 读写任务状态、领取资格、资源预算和结果。 |
| [`hai_runner_events`](#table-hai-runner-events) | 客户端按顺序读取进度和输出，断开后可以继续读。 |
| [`hai_runner_gate`](#table-hai-runner-gate) | 多节点检查同一份容量预算时，用这条记录协调事务。 |

<a id="table-hai-runner-executions"></a>

### `hai_runner_executions`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 执行主键。 | `execution-42` |
| `scope_key` | `TEXT` | 否 | — | 任务所属的权限范围标识。 | `<scope-key>` |
| `reuse_key` | `TEXT` | 是 | — | 唯一复用键，重提同一任务时可找回已有执行。 | `NULL` |
| `request_key` | `TEXT` | 否 | — | 核对请求参数的标识。 | `<request-key>` |
| `kind` | `TEXT` | 否 | — | 已登记的任务类型。 | `hai.tools.example.v1` |
| `request_json` | `JSON` | 是 | — | 任务入参、范围、环境、资源和超时。示例节选。 | `{"input":{"orderId":"order-42"}}` |
| `environment_key` | `TEXT` | 是 | — | 容器任务选择的运行环境。 | `NULL` |
| `state` | `TEXT` | 否 | — | 当前执行状态。 | `queued` |
| `reason` | `TEXT` | 是 | — | 任务失败或中止时的原因。 | `NULL` |
| `owner_node` | `TEXT` | 是 | — | 当前领取任务的节点 ID。 | `null` |
| `owner_generation` | `TEXT` | 是 | — | 领取时的节点启动标识。 | `null` |
| `owner_process_json` | `JSON` | 是 | — | 领取任务的本机进程身份。 | `NULL` |
| `pinned_node` | `TEXT` | 是 | — | 任务限定的执行节点。 | `NULL` |
| `pinned_generation` | `TEXT` | 是 | — | 任务限定的节点启动批次。 | `NULL` |
| `parent_id` | `TEXT` | 是 | — | 上级执行的 ID。 | `NULL` |
| `leased_until` | `BIGINT` | 否 | — | 当前领取者的执行权截止时间。 | `0` |
| `queue_until` | `BIGINT` | 否 | — | 任务可以等待领取到什么时候。 | `1794873660000` |
| `run_until` | `BIGINT` | 否 | — | 任务开始运行后的截止时间。 | `0` |
| `event_sequence` | `BIGINT` | 否 | — | 最近一条事件的顺序编号，从 `0` 开始。 | `0` |
| `event_bytes` | `BIGINT` | 否 | `0` | 已写入的事件占用多少字节。 | `0` |
| `cpu_milli` | `BIGINT` | 否 | — | CPU 上限，单位是毫核。 | `1000` |
| `memory_mib` | `BIGINT` | 否 | — | 内存上限，单位是 MiB。 | `256` |
| `pids` | `BIGINT` | 否 | — | 进程数量上限。 | `64` |
| `scratch_mib` | `BIGINT` | 否 | — | 临时存储上限，单位是 MiB。 | `64` |
| `result_json` | `JSON` | 是 | — | 执行输出，成功结果放在 `value` 中。 | `NULL` |
| `created_at` | `BIGINT` | 否 | — | 入队时间。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 执行记录最近修改时间。 | `1794873600000` |
| `container_json` | `JSON` | 是 | — | 供清理和核对使用的容器身份。 | `NULL` |
| `reconciliation_json` | `JSON` | 是 | — | 人工或业务核对后记录的处理结果。 | `NULL` |
| `reconciled_at` | `BIGINT` | 是 | — | 核对结果写入的时间。 | `NULL` |
| `capacity_class` | `TEXT` | 否 | — | 任务占用哪类运行容量。 | `tool` |
| `concurrency_key` | `TEXT` | 是 | — | 并发限制所使用的分组键。 | `NULL` |
| `concurrency_limit` | `BIGINT` | 否 | — | 这个并发组可以同时运行多少任务。 | `1` |
| `pool_fingerprint` | `TEXT` | 是 | — | 预热池的匹配标识。 | `NULL` |
| `pool_limit` | `BIGINT` | 是 | — | 预热池容量上限。 | `NULL` |
| `warm_state` | `TEXT` | 是 | — | 容器是否已预热好，或已转交给任务。 | `NULL` |

时间字段以 Unix 毫秒记录。索引覆盖排队状态、节点和租约、范围和容量、并发组、父执行、清理游标及排队、租约、运行截止时间。

<a id="example-data"></a>

<a id="一次待运行或运行中的任务"></a>

#### 示例 · 一次待运行或运行中的任务

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

<a id="events"></a>

<a id="table-hai-runner-events"></a>

### `hai_runner_events`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 事件主键。 | `event-42` |
| `execution_id` | `TEXT` | 否 | — | 产生事件的执行 ID。 | `execution-42` |
| `sequence_number` | `BIGINT` | 否 | — | 同一执行内的事件顺序。 | `1` |
| `event_json` | `JSON` | 是 | — | 任务发出的事件数据，存放在 `value` 中。 | `{"value":{"type":"progress"}}` |
| `created_at` | `BIGINT` | 否 | — | 事件写入时间。 | `1794873600000` |

按执行 ID 和事件顺序建索引。

<a id="任务运行中留下的顺序消息"></a>

#### 示例 · 任务运行中留下的顺序消息

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

<a id="table-hai-runner-gate"></a>

### `hai_runner_gate`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `BIGINT` | 否 | — | 固定主键，初始化只写一行。 | `1` |
| `revision` | `BIGINT` | 否 | — | 初始化写入 `0`，容量事务更新此值来协调并发。 | `1` |

通常在记录满 7 天后清理。无法确认任务是否已在容器中执行完成时，数据库会保留相关记录，待人工或业务核对结果后再进入清理流程。

<a id="多个节点一起核对剩余资源"></a>

#### 示例 · 多个节点一起核对剩余资源

多个节点同时领取任务时，先围绕这条记录协调资源检查，避免每台都认为还有同一份空闲容量。

```json
{
  "id": 1,
  "revision": 1
}
```

整张表只有 id:1 这一条，revision 随协调更新；1 不是已运行任务总数，也不表示某个节点永久持锁。

模块没有 Redis 键。只有启动任务的节点持有本机进程和容器对象。其他节点通过数据库查询执行状态、检查是否已被领取，或者记录核对后的结果。
