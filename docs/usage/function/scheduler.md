# @h-ai/scheduler 功能说明

[English](scheduler.en.md) · [日本語](scheduler.ja.md)

在服务端用 `scheduler` 创建、修改、触发定时任务并查询执行记录。执行前后可以运行回调。配置数据库后，多个服务进程可以共用任务定义和运行记录。

[模块 README](../../../packages/scheduler/README.md) · [配置清单](../configuration/scheduler.md) · [数据结构](../data/scheduler.md) · [服务集成](../development/integrations.md)

<a id="quick-start"></a>

## 最小接入示例

### 依赖

- `@h-ai/reldb` 用来保存任务、执行结果和当前领取期限，须先连接。若提供 `enableDb`，只能设为 `true`。

```ts
import { reldb } from '@h-ai/reldb'
import { scheduler } from '@h-ai/scheduler'

await reldb.init({ type: 'sqlite', database: './scheduler.db' })

await scheduler.init({
  enableDb: true,
  maxLogs: 1000,
  retentionDays: 30,
  hooks: {
    onTaskStart(event) {
      void event
    },
  },
})

await scheduler.register({
  id: 'health-check',
  name: '健康检查',
  description: '每 5 分钟执行一次系统健康检查',
  cron: '*/5 * * * *',
  params: { channel: 'ops' },
  handler: {
    kind: 'api',
    url: 'https://api.example.com/health',
    method: 'GET',
    timeout: 10000,
  },
})

await scheduler.register({
  id: 'cleanup',
  name: '清理过期数据',
  description: '每日凌晨执行过期数据清理',
  cron: '0 2 * * *',
  deleteAfterRun: true,
  params: { source: 'nightly' },
  handler: {
    kind: 'js',
    code: '(context) => ({ taskId: context.taskId, params: context.params })',
  },
})

scheduler.start()

const manualResult = await scheduler.trigger('cleanup', { source: 'admin-console' })
const logs = await scheduler.getLogs({
  triggerType: 'manual',
  triggerSource: 'admin-console',
  startedAfter: Date.now() - 24 * 60 * 60 * 1000,
})

scheduler.stop()
await scheduler.close()
```

## 功能说明

- 按 cron 定时执行，也可从业务代码手动触发。
- 支持 HTTP、受信任的 JavaScript 和应用 Hook，提供重试与取消。
- 共享数据库持久化任务、执行状态与可续期租约，支持未知结果隔离。

<a id="api-reference"></a>

### 功能输入输出

下表中的调用假定模块已经初始化成功。应用代码提供实际的业务参数，并在调用前校验输入和权限。收到 `HaiResult` 时先检查 `success`，成功时读 `data`，失败时读 `error`。成功结果为 `void` 时没有业务数据。返回 `null` 时表示没有找到值。

#### scheduler · 管理任务定义

把完整定义交给 `scheduler.register()`，按 ID 使用 `scheduler.updateTask()` 修改或用 `scheduler.unregister()` 删除。`scheduler.refreshTasks()` 无需参数，会重新读取定义。`scheduler.tasks` 显示本进程上一次成功读取的任务列表。

| 入口                     | 输入参数        | 成功结果 | 调用示例                                                                                       |
| ------------------------ | --------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `scheduler.register`     | task            | `void`   | `await scheduler.register({ id: 'daily', name: 'Daily', cron: '0 2 * * *', timezone: 'UTC' })` |
| `scheduler.unregister`   | taskId          | `void`   | `await scheduler.unregister('daily')`                                                          |
| `scheduler.updateTask`   | taskId, updates | `void`   | `await scheduler.updateTask('daily', { enabled: false })`                                      |
| `scheduler.refreshTasks` | 无参数          | `void`   | `await scheduler.refreshTasks()`                                                               |

#### scheduler · 启动、触发与日志

start/stop 无参数返回同步 HaiResult；trigger 输入任务 ID/参数返回一次执行日志；getLogs 输入过滤/分页返回日志页。stop 不代表在途副作用已撤销。

| 入口                | 输入参数        | 成功结果                            | 调用示例                                             |
| ------------------- | --------------- | ----------------------------------- | ---------------------------------------------------- |
| `scheduler.start`   | 无参数          | `void`                              | `scheduler.start()`                                  |
| `scheduler.stop`    | 无参数          | `void`                              | `scheduler.stop()`                                   |
| `scheduler.trigger` | taskId, options | `TaskExecutionLog`                  | `await scheduler.trigger('daily')`                   |
| `scheduler.getLogs` | options         | `PaginatedResult<TaskExecutionLog>` | `await scheduler.getLogs({ page: 1, pageSize: 20 })` |

#### scheduler · 执行器与事件回调

使用 `scheduler.setHooks()` 设置执行回调，使用 `scheduler.clearHooks()` 清除。回调收到取消信号后应停止工作。同一次任务在重试时可能调用多次，请将外部操作按任务标识去重。

| 入口                   | 输入参数 | 成功结果 | 调用示例                        |
| ---------------------- | -------- | -------- | ------------------------------- |
| `scheduler.setHooks`   | hooks    | `void`   | `scheduler.setHooks(taskHooks)` |
| `scheduler.clearHooks` | 无参数   | `void`   | `scheduler.clearHooks()`        |

#### scheduler.execution

执行记录保存在共享数据库。用 `scheduler.execution.get(occurrenceId)` 按每次计划运行的 ID 查询。记录缺失时返回 `null`。可分页查询结果不明和日志待补写的记录，分别调用 `scheduler.execution.resolveUnknown()` 或 `scheduler.execution.repairLog()` 处理。

| 入口                                  | 输入参数                 | 成功结果                          | 调用示例                                                                                           |
| ------------------------------------- | ------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `scheduler.execution.get`             | occurrenceId             | `SchedulerExecutionEntry \| null` | `await scheduler.execution.get(occurrenceId)`                                                      |
| `scheduler.execution.listUnknown`     | options                  | `SchedulerExecutionEntry[]`       | `await scheduler.execution.listUnknown({ limit: 20, offset: 0 })`                                  |
| `scheduler.execution.listLogFailures` | options                  | `SchedulerExecutionEntry[]`       | `await scheduler.execution.listLogFailures({ limit: 20, offset: 0 })`                              |
| `scheduler.execution.repairLog`       | occurrenceId             | `void`                            | `await scheduler.execution.repairLog(occurrenceId)`                                                |
| `scheduler.execution.resolveUnknown`  | occurrenceId, resolution | `void`                            | `await scheduler.execution.resolveUnknown(occurrenceId, { status: 'success', expectedUpdatedAt })` |

### 统一任务模型

```ts
interface TaskDefinition {
  id: string
  name: string
  description?: string
  cron: string
  timezone?: string // IANA 时区，例如 Asia/Shanghai；省略时为 UTC，不读取节点 TZ
  enabled?: boolean
  deleteAfterRun?: boolean
  idempotent?: boolean
  retry?: {
    maxAttempts: number
    backoffMs?: number[]
  }
  params?: Record<string, unknown>
  handler?: ApiTaskConfig | JsTaskConfig
}

interface ApiTaskConfig {
  kind: 'api'
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  body?: unknown
  maxResponseBytes?: number
  timeout?: number
}

interface JsTaskConfig {
  kind: 'js'
  code: string // JS 函数字符串
  timeout?: number
}
```

说明：

- 所有任务都可持久化到数据库，包括 `kind: 'js'` 的任务
- JS 任务会在运行时编译，并基于源码做缓存，避免每次触发都重新编译
- `handler` 可为空；此时可通过全局 `hooks.onTaskExecute` 统一执行

> ⚠️ **安全警示**：`kind: 'js'` 仅适用于受信任的服务端代码。当前实现基于 Node.js `vm` 做便捷执行，**不是安全沙箱**；禁止直接接收用户、租户或后台任意输入的 JS 字符串。可配置任务优先使用 `kind: 'api'` 或 `hooks.onTaskExecute`。

### 任务生命周期回调

初始化时传入或运行时通过 `setHooks()` 设置：

```ts
await scheduler.init({
  enableDb: true,
  hooks: {
    onTaskStart(event) {
      void event
    },
    async onTaskExecute(event) {
      return { via: 'hook', source: event.context.trigger.source }
    },
    onTaskInterrupted(event) {
      void event
    },
    onTaskFinish(event) {
      void event
    },
  },
})
```

### 执行日志

查询日志时可按触发来源过滤：

```ts
const logs = await scheduler.getLogs({
  taskId: 'cleanup',
  triggerType: 'manual',
  triggerSource: 'admin-console',
  startedAfter: Date.now() - 24 * 60 * 60 * 1000,
  startedBefore: Date.now(),
  pagination: { page: 1, pageSize: 20 },
})
```

执行日志支持自动清理策略（初始化时配置）：

- `maxLogs`：最多保留 N 条日志
- `retentionDays`：最多保留最近 N 天日志

### API 概览

- `init(config?)`
- `register(task)`
- `unregister(taskId)`
- `updateTask(taskId, updates)`
- `refreshTasks()`
- `start()` / `stop()`
- `trigger(taskId, { source?, idempotencyKey? })`
- `getLogs(options?)`
- `execution.listLogFailures(options?)` / `execution.repairLog(occurrenceId)`
- `execution.get(occurrenceId)` / `execution.listUnknown(options?)` / `execution.resolveUnknown(occurrenceId, input)`
- `setHooks(hooks)` / `clearHooks()`
- `tasks` / `hooks` / `config` / `isInitialized` / `isRunning`
- `close()`

### 读取本进程的任务定义快照

```ts
import { scheduler } from '@h-ai/scheduler'

const tasks = scheduler.tasks // 无输入，取得当前进程最后一次成功载入的只读映射。
const cleanup = tasks.get('cleanup') // 输入任务 ID，返回该定义或 undefined。
const hasCleanup = tasks.has('cleanup') // 同一键是否存在，返回 boolean。
const taskIds = [
  ...tasks.keys()
] // 遍历任务 ID，得到 string[]。
const definitions = [
  ...tasks.values()
] // 遍历任务定义，得到 TaskDefinition[]。
const entries = [
  ...tasks.entries()
] // 遍历 ID 和定义，得到 [string, TaskDefinition][]。
const enabledIds: string[] = [] // 保存供展示的 ID。
tasks.forEach((task, id) => { // 输入回调，接收定义和 ID，返回 void。
  if (task.enabled !== false)
    enabledIds.push(id) // 记录启用任务。
})
```

修改任务请调用 `scheduler.updateTask` 等方法，查询运行结果请用 `scheduler.getLogs` 或 `scheduler.execution`。

### 运行行为与边界

所有调度节点应先连接同一 PostgreSQL 或 MySQL。SQLite 文件适合正确共享同一文件的本机进程。数据库保存任务定义、实际执行结果及谁可以在期限内执行它。无需另外初始化 Cache，`enableDb` 只能为 `true`。

每个任务同一时间只能有一次执行，无论从 cron、手工触发或后续周期进入。一次领取默认有效 5 分钟（`leaseMs`，1 秒至 24 小时），调度器在执行期间续期。超过期限的节点无法续期或登记执行结果。各节点每隔 `tickInterval` 读取任务定义，`scheduler.tasks` 显示上一次成功读取的结果。如果读取失败，或者任务已删除、禁用或改期，旧尝试会中断。业务已经执行的操作不会随之撤销。

`context.occurrenceId` 是一次计划运行在数据库中的 ID。同一个任务在同一个计划分钟内，所有节点得到相同 ID。手动触发时可传 1 到 128 个字符的 `idempotencyKey`，再次用同一个值触发会复用原记录。省略时每次创建新记录。

每次领取都会产生不同的 `executionToken`，`sequence` 和 `attempt` 可区分执行次数。HTTP 任务会写入 `Idempotency-Key`、`X-Scheduler-Sequence`、`X-Scheduler-Attempt` 及 `X-Scheduler-Task`（任务 ID 经过百分号编码），覆盖同名请求头。Hook 与执行事件中的 `event.context` 使用同一个 `occurrenceId`，需要发送、写入或调用外部服务的回调可用它去重。

使用 PostgreSQL 时，同一分钟重启或多个节点同时领取可能遇到已有执行记录或被占用的任务槽。调度器将这些冲突作为正常竞争处理。排查任务是否完成时，用 `scheduler.execution.get(occurrenceId)` 查看执行状态，并保留账本和唯一约束以防止重复执行。

默认 `idempotent: false`。只有接收端能在同一次提交中登记去重记录并完成业务写入，才可设为 `true`。例如 HTTP 接收端不能只读取 `Idempotency-Key` 就承诺重复请求只扣款一次，它还要把这次扣款和已处理的请求编号一起保存。

已开始的任务领取超时后，只有声明可安全重试且未超过次数上限，其他节点才能用原 `occurrenceId` 接手。重试次数包括第一次执行和超时接手，`retry.maxAttempts` 默认为 1，范围为 1 到 100。其余情况标记为 `unknown`，暂停该任务的后续执行，等人工核对旧节点或远端请求是否已产生结果。

`scheduler.execution.get(occurrenceId)` 查询权威状态；`listUnknown({ limit, offset })` 分页获取未知结果，limit 为 1～100，offset 为 0～1000000。可信人工先核实外部效果、确认旧 runner 已终止，再按 `expectedUpdatedAt` CAS 调用 `resolveUnknown(id, { status: 'success' | 'discarded', expectedUpdatedAt })` 释放占位；不能直接把 unknown 重排。`log.occurrenceId` 可作查询回执；`getLogs` 仅为尝试观测日志，日志保留策略不删除 journal/幂等历史。

每次执行尝试都有固定的日志 UUID。业务是否成功和日志是否写完分别记录。日志的 `persistence.status` 有以下取值。

- `persisted` 表示结果和日志都已写入。
- `pending` 表示业务结果已确认，日志需要补写。
- `unconfirmed` 表示没有可确认的业务终态，不能按成功补写。

节点仅在领取有效期内才可提交最终结果，提交后调度器再生成日志。写日志失败时，已经提交的业务结果保持有效，也不会因为日志故障再次执行任务。

补写会缩小 pending 列表；批量补写应反复读取 offset=0，避免一边补写一边增加 offset 跳过记录。

可信服务端用 `execution.listLogFailures({ limit, offset })` 监控 pending（范围与 listUnknown 相同），用 `execution.repairLog(occurrenceId)` 从共享 journal 幂等补写；可跨节点、重启及并发调用。写入已提交但回执丢失时通过固定主键和完整内容核对去重。补写返回 `LOG_PERSIST_FAILED`（032）时继续保留 pending，并输出安全告警；全部数据库不可用且终态未提交时仍按 unknown 核对外部效果，不能假定存在可恢复结果。补写与日志保留均不调用业务 Hook。保留策略失败仅告警，不撤销已保存日志。`onTaskFinish` 是本地业务完成通知，其 unconfirmed 状态不是持久化确认；以 trigger 返回值及 execution.get 的 logPersistence 为准。

领取前竞争/跳过的 interrupted 仅为观测日志，没有可补写的终态；其写入未确认时返回 unconfirmed。JSON 大载荷保存完整结果和全部重试记录，避免 MySQL 的 255 字符截断；执行账本保持独立。关闭会等待在途补写，先关闭 scheduler 再关闭数据库。

```ts
const result = await scheduler.trigger('cleanup', { idempotencyKey: 'cleanup-2026-10-23' })
if (!result.success)
  return result
if (result.data.persistence.status === 'pending' && result.data.occurrenceId) {
  const repaired = await scheduler.execution.repairLog(result.data.occurrenceId)
  if (!repaired.success)
    return repaired
}
// 不用日志补写失败重新 trigger 业务；定期按页扫描 listLogFailures。
```

`await scheduler.close()` 停止接收并取消 HTTP、JS Worker 与重试等待，再等待执行链退出后清理状态。重新初始化等待关闭完成。所有生命周期事件提供 `signal`；Hook 必须监听取消并停止自己的外部副作用（框架无法强制终止同一线程中的业务代码），不要在 Hook 中阻塞事件循环。取消后的旧执行不再重试、不自动删除任务，也不会调用新实例的 Hook。关闭期间保持数据库可用，待 scheduler 关闭后再关闭依赖。

JS 字符串在每次调用的独立 Worker 中执行，`timeout` 默认 30000 毫秒（含启动）。到期后终止并等待线程退出，再记录失败或重试；同步死循环也不会阻塞主事件循环。上下文及返回值必须支持结构化克隆。Worker 中的 `vm` 仍不是安全沙箱，代码必须来自受信任的服务端来源。

API 任务的 `timeout`（默认 30000 毫秒）覆盖请求和完整响应体读取。`ApiTaskConfig.maxResponseBytes` 指定响应体实际接收字节上限（正安全整数，默认 1048576 即 1 MiB）；例如 `maxResponseBytes: 10 * 1024 * 1024` 允许最大 10 MiB，非法值在请求前失败；超时、超限或非成功 HTTP 状态在默认非幂等模式进入 unknown；仅声明幂等能力后才按有限重试策略处理。

`init()` 必须完整加载全部任务才返回成功。配置中的空 ID、重复 ID（含与持久化任务重复）、无效 cron，以及数据库读取或持久化任务解析失败，均返回失败并清空初始化状态；修正配置或数据后重新初始化。不要同时在 `tasks` 中重复声明已有的数据库任务。

调度循环按分钟匹配 cron，并从同一分钟生成持久 occurrenceId；延迟 tick 仍检查当前分钟，运行中每分钟只检查一次。

共享租约的首次领取、开始、续租、完成、过期扫描和隔离，均在同一条数据库 SQL 内计算或核验存储端时间。PostgreSQL 使用 clock_timestamp、MySQL 使用 SYSDATE(3)、SQLite 使用存储端 now；先查时间再写入不能替代最终 deadline 条件。cron 也读取 DB 时间选定分钟 occurrence 并匹配表达式，省略 timezone 时固定 UTC；显式 IANA 时区仅改变 cron 的墙上时间解释，节点 TZ 不改变身份或匹配。节点 Date.now 仅用于耗时诊断，不授权 owner；两个节点相差数小时也不会提前接管或延长过期凭据。行锁等待结束后仍须通过期限条件，失租结果不能投影成功日志。数据库服务自身的时间须由运维保持可信；未知外部副作用仍须核对，不能自动重放。

### 可选集成

调度任务触发 Reach 通知时，调度锁或任务完成不等于外部消息只投递一次。按 [Reach 队列语义](../../../packages/reach/README.md) 使用持久 queueId；HTTP 接收端须原子持久去重，SMTP/短信等在途未知结果须人工核对，不能由调度重试直接重发。

### 定义一致性与持久化准备

任务定义的刷新、注册、更新和删除在同一进程内按接收顺序协调，包含写操作所需的刷新与提交。合法并发注册不会仅因快照交错而失败；真实数据库故障仍返回失败。close 先停止入口和 runner，取消只读等待和尚未开始写入的操作，再等待已开始的持久写入；迟到快照不发布，避免关闭后旧操作重新填充任务表。执行回调不占用这条队列；跨节点仍依靠共享数据库、版本与租约，不把进程内协调当分布式锁。

先初始化 RelDB，再调用 `scheduler.init()` 创建和校验任务、执行及日志表。结构不符时返回初始化失败。执行账本与观测日志各有用途，应分别管理。

## 错误处理

收到 `HaiResult<T>` 时先检查 `result.success`。成功时读取 `result.data`，失败时查看 `result.error`。记录故障时保留错误码和追踪编号，便于从日志找到对应请求。

任务写入、触发与执行查询返回 `HaiResult<T>`。读取 `scheduler.tasks` 等属性直接得到返回值。关闭时等待 `scheduler.close()` 返回的 `Promise<void>`。

常用错误码：

| 错误码                                    | code                | 说明             |
| ----------------------------------------- | ------------------- | ---------------- |
| `HaiSchedulerError.NOT_INITIALIZED`       | `hai:scheduler:010` | 未初始化         |
| `HaiSchedulerError.INIT_FAILED`           | `hai:scheduler:011` | 初始化失败       |
| `HaiSchedulerError.CONFIG_ERROR`          | `hai:scheduler:012` | 配置错误         |
| `HaiSchedulerError.TASK_NOT_FOUND`        | `hai:scheduler:020` | 任务不存在       |
| `HaiSchedulerError.TASK_ALREADY_EXISTS`   | `hai:scheduler:021` | 任务已存在       |
| `HaiSchedulerError.INVALID_CRON`          | `hai:scheduler:022` | Cron 表达式无效  |
| `HaiSchedulerError.EXECUTION_FAILED`      | `hai:scheduler:023` | 执行失败         |
| `HaiSchedulerError.JS_EXECUTION_FAILED`   | `hai:scheduler:024` | JS 执行失败      |
| `HaiSchedulerError.API_EXECUTION_FAILED`  | `hai:scheduler:025` | API 执行失败     |
| `HaiSchedulerError.DB_SAVE_FAILED`        | `hai:scheduler:026` | DB 保存失败      |
| `HaiSchedulerError.ALREADY_RUNNING`       | `hai:scheduler:027` | 已在运行         |
| `HaiSchedulerError.NOT_RUNNING`           | `hai:scheduler:028` | 未在运行         |
| `HaiSchedulerError.JS_COMPILE_FAILED`     | `hai:scheduler:030` | JS 编译失败      |
| `HaiSchedulerError.HOOK_EXECUTION_FAILED` | `hai:scheduler:031` | Hook 执行失败    |
| `HaiSchedulerError.LOG_PERSIST_FAILED`    | `hai:scheduler:032` | 日志持久化未确认 |
