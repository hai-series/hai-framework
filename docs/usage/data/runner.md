# @h-ai/runner 数据结构

<a id="runner-数据结构"></a>

[English](runner.en.md) · [日本語](runner.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/runner.md) · [功能说明](../function/runner.md)

Alice 在 `demo` 租户生成 2026 年 11 月的报表。API 节点保存提交并返回执行 ID，执行节点领取任务、记录进度和最终结果。页面断线重连后，用同一主体和执行 ID 从上次的事件序号继续读。生成报表的宿主处理器无需容器，且这次执行没有父任务。

<a id="report-receipt"></a>

## 从报表回执查看执行和进度

以下代码在已初始化的服务端运行，执行节点已登记 `report.v1`。示例用固定主体显示服务器从认证结果取得的范围。页面重试时使用同一个业务幂等键。 [最小接入和处理器示例](../function/runner.md#quick-start)

```ts
import { runner } from '@h-ai/runner'

const scope = { tenantId: 'demo', userId: 'alice' }
// 以示例主体提交本月报表。成功时得到含 id 的回执，失败时没有可用回执。
const accepted = await runner.submit({
  scope,
  kind: 'report.v1',
  input: { month: '2026-11' },
  idempotencyKey: 'report-2026-11',
  reuseKey: 'monthly-report-2026-11',
  locale: 'en-US',
})
if (!accepted.success)
  throw new Error(accepted.error.message)
const id = accepted.data.id
```

首次提交返回 `success: true` 时，`data` 中已有以下执行回执。`queued` 表示数据库已保存任务。处理器成功返回后，由 Runner 提交输出。时间是示例数据库记录的 Unix 毫秒。

```json
{
  "id": "11dd5ca46347e93111bd771e6bd59e04d4f9c8b4ba9f2b545313eebfc8da83fd",
  "status": "queued",
  "createdAt": 1796083200000,
  "updatedAt": 1796083200000
}
```

用 `runner.get(scope, id)` 读取最新回执。调用成功时，按 `data.status` 判断报表进度。只有节点 ID 和代次都已登记时才有 `owner`。容器任务还会带 `environmentId`，核验过的未知任务会带 `reconciledAt`。

| `status` | 此时能读到什么 | 下一步 |
| --- | --- | --- |
| `queued` | 已受理的 ID 和时间，无输出和事件。 | 保存 ID 并轮询，或调用 `runner.cancel(scope, id)` 撤销排队。 |
| `running` | 当前执行者和已提交的事件。 | 分页读取事件，继续查询最终结果。 |
| `cancelling` | 停止请求已登记，之前提交的事件仍可读。`failure` 可能已显示超时或父任务结束。 | 等停止和清理结果，期间仍占用容量。 |
| `succeeded` | 报表结果在 `output` 中，例如 `{"month":"2026-11","rows":120}`。处理器返回 JSON `null` 时，`output` 也为 `null`。 | 使用结果，并按业务需要另存报表。 |
| `failed` | 可读原因，如 `queue-timeout`、`run-timeout` 或 `handler-failed`。已提交事件仍可读。 | 核对失败原因和已有业务效果，按业务规则决定是否发起新执行。 |
| `cancelled` | 任务已经结束。可读取此前提交的事件，控制子任务可能有 `parent-ended` 原因。 | 停止轮询，按需保留记录。 |
| `unknown` | `owner-lost` 或 `cleanup-unconfirmed`。`reconciledAt` 记录已核验资源的时间，业务结果仍待核对。 | 保留原 ID，由运维在原执行节点核验和释放资源。 |

<a id="tables"></a>
<a id="database"></a>

## 数据库

Runner 在共享 RelDB 中使用以下四张表。初始化创建缺失的表和索引，并检查已有表包含所有必需列。列缺失时初始化失败。下表按 RelDB 的逻辑类型列出字段，时间与截止点统一使用数据库时钟和 Unix 毫秒。字段表中的 `—` 表示未声明数据库默认值。应用在入队、领取或写入后补充的值另行说明。 [RelDB 数据结构](reldb.md)

| 表名 | 用途 |
| --- | --- |
| [`hai_runner_executions`](#table-hai-runner-executions) | 每次执行的输入、状态、归属、容量、输出和核验记录。 |
| [`hai_runner_events`](#table-hai-runner-events) | 按执行和序号保存已发布的进度。 |
| [`hai_runner_idempotency`](#table-hai-runner-idempotency) | 保存复用请求接受的额外业务幂等键。 |
| [`hai_runner_gate`](#table-hai-runner-gate) | 串行化需要一致检查和更新的事务。 |

<a id="table-hai-runner-executions"></a>

### `hai_runner_executions`

| 字段 | 类型 | 可空 | 数据库默认值 | 用途 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 执行主键。指定业务幂等键时，由主体、任务类型和该键派生。 | `<report-id>` |
| `scope_key` | `TEXT` | 否 | — | 租户 ID 和用户 ID 的哈希，用于约束任务查询和写入。 | `<scope-hash>` |
| `reuse_key` | `TEXT` | 是 | — | 主体、任务类型和复用键的哈希，非空值唯一。终结或核验后释放。 | `<reuse-hash>` |
| `request_key` | `TEXT` | 否 | — | 请求指纹，同一幂等键或复用键下用来检查业务内容。 | `<request-hash>` |
| `kind` | `TEXT` | 否 | — | 执行节点登记的处理器类型。 | `report.v1` |
| `request_json` | `JSON` | 是 | — | Runner 写入请求快照，包含主体、输入、运行超时和可选语言、环境与有效资源。 | `{"input":{"month":"2026-11"},"locale":"en-US"}`（节选） |
| `environment_key` | `TEXT` | 是 | — | 容器环境快照哈希，用于核对可执行节点。 | `NULL` |
| `state` | `TEXT` | 否 | — | 执行状态，新提交写入 `queued`，对应回执 `status`。 | `queued` |
| `reason` | `TEXT` | 是 | — | 可用的失败、停止或失租原因，对应回执 `failure`。 | `run-timeout` |
| `owner_node` | `TEXT` | 是 | — | 领取任务的执行节点。 | `reports-01` |
| `owner_generation` | `TEXT` | 是 | — | 该节点当次启动的代次。 | `<generation-uuid>` |
| `owner_process_json` | `JSON` | 是 | — | 宿主任务领取时可保存原执行进程的 PID、宿主证明和启动标识。 | `{"pid":4121,"hostKey":"<host-hash>","started":"312345"}` |
| `pinned_node` | `TEXT` | 是 | — | 显式指定或从父任务继承的目标节点。 | `NULL` |
| `pinned_generation` | `TEXT` | 是 | — | 控制子任务从父任务继承的目标代次。 | `NULL` |
| `parent_id` | `TEXT` | 是 | — | 控制子任务关联的父执行 ID。Runner 在应用层维护此关联。 | `NULL` |
| `leased_until` | `BIGINT` | 否 | — | 所有者的当前租约截止时间。首次入队写入 `0`，领取后设置并续租。 | `0` |
| `queue_until` | `BIGINT` | 否 | — | 接收提交时按 `queueTimeoutMs` 算出的排队截止时间。 | `1796083500000` |
| `run_until` | `BIGINT` | 否 | — | 领取时按保存的 `runTimeoutMs` 算出的运行截止时间。首次入队写入 `0`。 | `0` |
| `event_sequence` | `BIGINT` | 否 | — | 最近一次成功提交的事件序号。Runner 首次写入 `0`。 | `1` |
| `event_bytes` | `BIGINT` | 否 | `0` | 本次执行已经保存的事件 JSON 字节数，计入 `value` 包装。 | `29` |
| `cpu_milli` | `BIGINT` | 否 | — | 调度预留的 CPU 毫核数。 | `0` |
| `memory_mib` | `BIGINT` | 否 | — | 调度预留的内存 MiB。 | `0` |
| `pids` | `BIGINT` | 否 | — | 调度预留的进程数。 | `0` |
| `scratch_mib` | `BIGINT` | 否 | — | 调度预留的临时写入空间 MiB。 | `0` |
| `result_json` | `JSON` | 是 | — | 成功提交的结果以 `value` 保存，读取回执时展开为 `output`。 | `{"value":{"month":"2026-11","rows":120}}` |
| `created_at` | `BIGINT` | 否 | — | 执行记录首次写入的时间。 | `1796083200000` |
| `updated_at` | `BIGINT` | 否 | — | 最近一次更新记录时写入的时间，例如续租或写入终态。 | `1796083202000` |
| `container_json` | `JSON` | 是 | — | 容器创建和清理凭据，包含引擎、暂存身份，以及创建尝试或完整容器 ID。 | `NULL` |
| `reconciliation_json` | `JSON` | 是 | — | 原执行节点记录的核验人、原因和适用时的资源停止声明。 | `{"operatorId":"ops-1","reason":"Report worker stopped","hostResourcesStopped":true}` |
| `reconciled_at` | `BIGINT` | 是 | — | 写入资源核验结果的时间。 | `NULL` |
| `capacity_class` | `TEXT` | 否 | — | 调度容量类别，提交参数默认 `default`，可信工具作业可用 `tool`。 | `default` |
| `concurrency_key` | `TEXT` | 是 | — | 任务类型和并发键派生的共享并发组标识。 | `NULL` |
| `concurrency_limit` | `BIGINT` | 否 | — | 并发组的运行上限，无并发分组时写入 `0`。 | `0` |
| `pool_fingerprint` | `TEXT` | 是 | — | 预热池和环境的快照指纹，供请求核对。实际领取匹配环境、并发分组及上限，`minReady` 用于调度预热目标。 | `NULL` |
| `pool_limit` | `BIGINT` | 是 | — | 预热池总量上限 `maxTotal`。 | `NULL` |
| `warm_state` | `TEXT` | 是 | — | 预热记录使用 `starting`、`ready` 或 `transferred`，普通执行为空。 | `NULL` |

执行主键和非空复用键分别由主键、唯一约束保护。其他索引用于领取、配额和清理。

| 索引 | 列顺序 |
| --- | --- |
| `hai_runner_queue_idx` | `state`, `kind`, `created_at` |
| `hai_runner_owner_idx` | `owner_node`, `state`, `leased_until` |
| `hai_runner_scope_idx` | `scope_key`, `capacity_class`, `state` |
| `hai_runner_concurrency_idx` | `concurrency_key`, `state` |
| `hai_runner_parent_idx` | `parent_id` |
| `hai_runner_retention_idx` | `state`, `reconciled_at`, `updated_at`, `id` |
| `hai_runner_queue_due_idx` | `state`, `queue_until` |
| `hai_runner_lease_due_idx` | `state`, `leased_until` |
| `hai_runner_run_due_idx` | `state`, `run_until` |

<a id="example-data"></a>
<a id="示例--一次待运行或运行中的任务"></a>

#### 示例 · 报表刚排队时的记录

下面是与上述回执对应的数据库字段节选。`<report-id>` 在字段表和后续示例中均代指此执行 ID。示例应用未请求显式资源，所以四个容量字段写入 `0`，运行时仍计入并发任务数。`queue_until` 按默认的 `300000` 毫秒加到接收时间。

```json
{
  "id": "11dd5ca46347e93111bd771e6bd59e04d4f9c8b4ba9f2b545313eebfc8da83fd",
  "kind": "report.v1",
  "request_json": {
    "scope": { "tenantId": "demo", "userId": "alice" },
    "input": { "month": "2026-11" },
    "locale": "en-US",
    "runTimeoutMs": 300000
  },
  "state": "queued",
  "owner_node": null,
  "queue_until": 1796083500000,
  "event_sequence": 0,
  "event_bytes": 0
}
```

处理器从 `RunnerContext.locale` 读取首次提交保存的语言。重试改用其他语言仍取得已有执行。读取缺少 `locale` 的记录时，处理器上下文中的语言为 `undefined`，宿主自行选择默认语言。执行 ID 和附加幂等键的查询始终使用服务端提供的主体。

<a id="events"></a>
<a id="table-hai-runner-events"></a>

### `hai_runner_events`

| 字段 | 类型 | 可空 | 数据库默认值 | 用途 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 由执行 ID 和序号派生的事件主键。 | `<event-id>` |
| `execution_id` | `TEXT` | 否 | — | 产生事件的执行 ID，由 Runner 关联。 | `<report-id>` |
| `sequence_number` | `BIGINT` | 否 | — | 执行内递增的序号，第一条为 `1`。 | `1` |
| `event_json` | `JSON` | 是 | — | Runner 用 `value` 包装并保存处理器传给 `context.emit` 的 JSON。 | `{"value":{"phase":"reading"}}` |
| `created_at` | `BIGINT` | 否 | — | 事件成功提交的数据库时间。 | `1796083201100` |

`hai_runner_event_cursor_idx` 按 `(execution_id, sequence_number)` 建索引。Runner 在同一事务中更新执行的事件计数并插入事件。单条事件数据最多 512 KiB，单次执行受 `maxEvents` 和 16 MiB 事件 JSON 总量限制，默认事件数上限为 10,000。执行清理时在同一事务中删除关联事件。 [Runner 配置清单](../configuration/runner.md#configuration-fields)

<a id="任务运行中留下的顺序消息"></a>
<a id="示例--任务运行中留下的顺序消息"></a>
<a id="example-event"></a>

#### 示例 · 断线后接着读报表事件

处理器读取报表数据时发出 `{"phase":"reading"}`。第一条已提交的事件记录节选如下。

```json
{
  "execution_id": "11dd5ca46347e93111bd771e6bd59e04d4f9c8b4ba9f2b545313eebfc8da83fd",
  "sequence_number": 1,
  "event_json": { "value": { "phase": "reading" } },
  "created_at": 1796083201100
}
```

初次用 `runner.events(scope, id, 0, 100)`，成功时 `data` 为升序的事件数组。该记录返回 `{ sequence: 1, data: { phase: 'reading' }, createdAt: 1796083201100 }`。消费后保存 `sequence: 1`，重连时传 `after: 1` 获取序号更大的事件。空数组表示当前没有更多已提交事件，用 `runner.get` 判断任务是否结束。

<a id="table-hai-runner-idempotency"></a>

### `hai_runner_idempotency`

| 字段 | 类型 | 可空 | 数据库默认值 | 用途 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 主键，由主体、任务类型和附加业务幂等键派生。 | `<retry-key-hash>` |
| `execution_id` | `TEXT` | 否 | — | 外键，引用 `hai_runner_executions.id`。原执行删除时级联删除。 | `<report-id>` |

`hai_runner_idempotency_execution_idx` 索引 `execution_id`。原报表按首个业务幂等键派生执行 ID，旧记录也可通过这个 ID 或首键读取。报表仍可复用时，用相同任务参数和 `reuseKey`、另一个业务幂等键 `report-2026-11-retry` 提交，会在复用事务中保存这条附加映射。下面是映射节选。

```json
{
  "id": "6a04517c9663a70069ea8eb9513fc8a8a0d5f6cffd32f75960fe7ed7e29dee29",
  "execution_id": "11dd5ca46347e93111bd771e6bd59e04d4f9c8b4ba9f2b545313eebfc8da83fd"
}
```

任务结束、复用键已释放后，在保留期内仍可用 `runner.find(scope, 'report.v1', 'report-2026-11-retry')` 找回原回执。用已受理的键提交不同业务内容会返回 `CONFLICT`。`find` 无匹配记录时返回成功，`data` 为 `undefined`。

该表只保存额外键的哈希与执行 ID，每个成功接受的不同键占一行。用同一个键重试会使用原行。Runner 的提交、恢复和保留清理共用这张表，应随执行表一起保留。单独删除表会使需要查附加键的请求失败，重新初始化空表也无法恢复已经受理的附加键。

<a id="table-hai-runner-gate"></a>

### `hai_runner_gate`

| 字段 | 类型 | 可空 | 数据库默认值 | 用途 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `BIGINT` | 否 | — | 主键，Runner 初始化时准备 `id = 1` 的协调行。 | `1` |
| `revision` | `BIGINT` | 否 | — | 应用首次写入 `0`，每次通过协调行串行执行事务时递增。 | `2` |

<a id="多个节点一起核对剩余资源"></a>
<a id="示例--多个节点一起核对剩余资源"></a>
<a id="example-gate"></a>

#### 示例 · 领取报表前检查容量

两个执行节点都准备领取报表时，提交、领取和容量检查在共享协调行上串行。下例表示协调行的某个版本，`revision` 随事务推进而变化。

```json
{ "id": 1, "revision": 2 }
```

容量统计来自执行表。执行和事件的保留清理不删除协调行。

每个共享数据库使用 `id = 1` 的协调行。涉及多条记录的一致性操作先在同一事务更新该行，再核对并写入执行记录。所有连接同一库的 Runner 节点共用这条数据库锁，SQLite、PostgreSQL、MySQL 都使用这一入口。保留表和协调行是提交、领取等事务正常运行的前提。单独删除表会使事务失败，直接删除协调行也会破坏串行化约束。

<a id="size-and-retention"></a>

## 保留期和 `unknown` 的容量

- 执行节点按数据库时间分批清理，每批最多 128 条执行记录。`succeeded`、`failed`、`cancelled` 从 `updated_at` 起算，已核验的 `unknown` 从 `reconciled_at` 起算。`retentionMs` 默认七天，可设为一小时至 365 天。父任务在子记录尚存时继续保留。 [保留时间设置](../configuration/runner.md#configuration-fields)
- 清理随执行节点的轮询运行。成功删除记录后，至少间隔 250 毫秒再检查。无记录或清理失败时，至少间隔 1 秒。实际进度受轮询间隔、数据库和任务负载影响。仅部署 API 节点或执行节点中断期间，过期记录继续积压，待执行节点恢复后分批处理。
- 清理一条执行时，同一事务删除其事件和附加幂等键。之后 `find` 返回空，`get` 和 `events` 返回 `NOT_FOUND`。用原业务幂等键再次提交可获新执行，即使算出的执行 ID 与原记录一样。需要保留更久的报表或业务幂等约束由应用保存。
- `queued` 达到排队期限后由执行节点标为 `failed`，再从失败时间计算保留期。`running` 达到运行期限时先请求停止。`running`、`cancelling` 和未核验的 `unknown` 仍计入相应的执行容量。失租或清理未确认可进入 `unknown`。未核验时保留占用和复用键，核验成功才登记 `reconciledAt`、释放预留并开始计算保留期。 [原执行节点核验入口](../function/runner.md#reconciliation)

<a id="capacity-limits"></a>

### 容量上限和估算

Runner 的配置限制待领取数量、活跃并发和单次载荷。数据库的累计行数和磁盘占用由任务量、保留期、附加键数量和清理延迟共同决定，当前没有全库字节配额。持续未核验的 `unknown` 可一直保留，其事件和附加键随执行记录保留。

| 限制 | 计量范围 |
| --- | --- |
| `maxQueued` | 无父任务与控制子任务各自计算，默认每类最多 5000 条待领取任务。已结算记录继续保留到清理。 |
| 提交、输出和单条事件 | 各为 512 KiB JSON。提交按完整请求计，事件的单条上限按传给 `context.emit` 的数据计。 |
| 单任务事件总量 | 同时受 `maxEvents`（默认 10000 条）和 16 MiB 约束，总字节含数据库事件的 `value` 包装。触及上限时写入失败，由处理器决定如何处理该结果。 |
| 附加幂等键 | 每次接受新的附加键增加一行，清理原执行时一起删除。当前没有按执行设置的附加键行数上限。 |

例如每天完成 1000 个任务，每个任务保存 1 KiB 输入、1 KiB 输出和 10 条各 1 KiB 的事件（含 `value` 包装）。按默认七天保留，正常清理时约有 7000 条执行记录和 7 万条事件，应用载荷约 `7000 × (1 + 1 + 10) KiB ≈ 82 MiB`。待处理及核验积压、行字段、索引、WAL 或事务日志、备份和数据库空间回收行为会影响实际占用。 [队列与事件配置](../configuration/runner.md#configuration-fields)

生产中可用 `hai_runner_executions.event_sequence` 和 `event_bytes` 观察单任务写入量，按 `state` 统计行数，并关注最老的待清理执行、未核验的 `unknown` 和 `Managed execution retention failed` 日志。再用数据库大小指标核对实际的表、索引和日志增长。提交时复用同一业务幂等键可避免为同一次请求增加额外映射。

<a id="ai-sse"></a>

### AI 流式数据何时写入 Runner

SSE 负责向客户端传送数据。Runner 持久事件由处理器调用 `context.emit` 产生，查询后可以通过 SSE 或轮询送出。

| 调用路径 | 持久化行为 |
| --- | --- |
| 普通 `ai.llm.chatStream()` 直接推送 SSE | 模型分片由调用方转发，Runner 表无写入。满足 `objectId`、记录 Store 和持久化设置时，AI 可以把聚合后的对话另存为 ChatRecord。 [AI 的对话记录](ai.md#table-hai-ai-chat-records) |
| 通过 Runner 执行的受管 ACP | AI 将助手文本分片合并为 `type: 'text'` 事件后调用 `context.emit`，运行中通常按 50 毫秒刷新，并在工具更新或轮次收尾时按需刷新。工具进展、审批和产物引用等也可以写入。正常完成的 `output` 可包含完整回复文本。客户端按任务 ID 和序号续读已保存的事件。 [受管 ACP 接口](../function/ai.md#acp) |
| 使用 Runner 的 Tools 服务或自定义处理器 | 已验证的工具输入和最终 JSON 输出进入执行记录，调用 `context.emit` 的业务事件进入事件表。例如视频工具保存阶段和进度，可另外返回已授权的产物引用。 [Tools 数据结构](tools-runner.md) |

例如自定义报表处理器可只保存 `reading`、`exporting` 等阶段以及必要的进度数值。把大报告、音视频或完整长文本写入应用的持久存储，事件和结果中保存已授权的业务引用。若使用受管 ACP 并依赖断线续读，它会保存上述合并文本，容量估算应同时计入流式文本事件和最终输出。

估算 ACP 时可以先量每轮的事件条数。若一轮连续输出 60 秒、平均每 50 毫秒写一条文本事件，约产生 1,200 条事件。每天 1,000 轮、保留七天，仅这部分就约有 840 万条事件。稀疏输出会减少条数，工具与审批事件需另外计入。

<a id="runtime-data"></a>

## 节点暂存和运行时对象

Runner 的共享状态通过上面的关系表读写，模块没有自有缓存键。运行中的处理器、停止信号、容器句柄及标准流由执行节点持有。报表进度和 JSON 结果通过 `events` 和 `get` 读取。应用需要长期保存报表文件时，由处理器将文件写入应用自己的持久存储，回执中只保存业务引用。

报表这样的宿主任务在原执行节点能读取 Linux 进程身份时保存 `owner_process_json`。缺少这项凭据的记录仍可查看状态和事件。如果任务进入 `unknown`，确认释放宿主资源需要原执行进程的凭据和运维核验结论。 [核验宿主资源](../function/runner.md#reconciliation)

容器任务另外使用执行节点上的私有暂存目录。Runner 在容器创建前记录尝试标识、原引擎及暂存目录身份，取得完整容器 ID 后把它补到同一条凭据内。下例是尚未记录完整 ID 的 `container_json` 字段节选，标识和文件系统数值为示意。

```json
{
  "attempt": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "engine": "podman",
  "engineKey": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "stageName": "hai-runner-Ab12Cd",
  "stageKey": "2049:123456"
}
```

只有创建尝试凭据时，Runner 会检查暂存目录中是否保存了完整容器 ID。若仍缺少 ID，运维先确认原引擎的创建请求已经结束，再用尝试标识核验容器是否存在。缺少 `attempt` 而有完整 `id` 的已保存凭据仍可按原引擎、容器 ID 和暂存身份核验。

正常停止时执行节点清理容器和暂存。清理未确认的 `unknown` 记录继续占用容量。数据库保留清理只处理符合期限的记录，实际资源需先在原执行节点核验。 [容器数据和核验方法](../function/runner.md#reconciliation)
