# @h-ai/scheduler 功能说明

[English](scheduler.en.md) · [日本語](scheduler.ja.md)

在服务端用 `scheduler` 创建、修改、触发定时任务并查询执行记录。执行前后可以运行回调。配置数据库后，多个服务进程可以共用任务定义和运行记录。

[模块 README](../../../packages/scheduler/README.md) · [配置清单](../configuration/scheduler.md) · [数据结构](../data/scheduler.md) · [服务集成](../development/integrations.md)

<a id="quick-start"></a>

## 最小接入示例

### 依赖

- `@h-ai/reldb` 用来保存任务、执行结果和当前领取期限，须先连接。若提供 `enableDb`，只能设为 `true`。

本例用内存 SQLite 保存任务和日志，手动触发一次任务，无需等待 cron，也不会发送网络请求。`trigger()` 加载任务成功后还要查看 `run.status`，因为任务执行失败也能返回一条执行记录。此处应得到 `success`，`logs.items` 包含一条执行记录。长期定时运行时，注册任务后再调用 `scheduler.start()`。请在开发环境运行（例如 `NODE_ENV=development`）；生产模式需要跨节点共享的数据库。

```ts
// 独立的启动/关闭脚本：此边界抛出原错误；返回 HaiResult 的业务函数仍应返回失败结果。
import { reldb } from '@h-ai/reldb'
import { scheduler } from '@h-ai/scheduler'

// 用内存 SQLite 启动开发数据库，成功无数据；RelDB 不可用时阻止调度器初始化。
const initResult = await reldb.init({ type: 'sqlite', database: ':memory:' })
if (!initResult.success)
  throw new Error(initResult.error.message, { cause: initResult.error })

try {
  // 在已初始化的 RelDB 上准备调度表，并用下方钩子把任务 ID 作为执行结果；初始化失败不登记任务。
  const initResult2 = await scheduler.init({
    hooks: {
      onTaskExecute: ({ context }) => ({ taskId: context.taskId }),
    },
  })
  if (!initResult2.success)
    throw new Error(initResult2.error.message, { cause: initResult2.error })
  try {
    // 登记每天 02:00 的 daily 报表；成功无数据，重复 ID 或无效表达式时失败。
    const registerResult = await scheduler.register({ id: 'daily', name: 'Daily report', cron: '0 2 * * *' })
    if (!registerResult.success)
      throw new Error(registerResult.error.message, { cause: registerResult.error })
    // 用 docs 来源手动执行 daily，成功返回执行日志；日志 status 仍须单独检查。
    const triggerResult = await scheduler.trigger('daily', { source: 'docs' })
    if (!triggerResult.success)
      throw new Error(triggerResult.error.message, { cause: triggerResult.error })
    const run = triggerResult.data
    if (run.status !== 'success')
      throw new Error(run.error ?? 'Task did not succeed')

    // 读取 daily 且来源 docs 的第一页、最多 20 条执行日志；此前执行成功时应有一条。
    const getLogsResult = await scheduler.getLogs({
      taskId: 'daily',
      triggerSource: 'docs',
      pagination: { page: 1, pageSize: 20 },
    })
    if (!getLogsResult.success)
      throw new Error(getLogsResult.error.message, { cause: getLogsResult.error })
    const logs = getLogsResult.data
    if (logs.items.length !== 1)
      throw new Error('Expected one execution record')
  }
  finally {
    // 不传参数结束调度器，停止后续领取并等待关闭，完成后 Promise 无业务数据。
    await scheduler.close()
  }
}
finally {
  // 在调度器结束后释放数据库，成功无数据，失败时在脚本边界抛出原错误。
  const closeResult = await reldb.close()
  if (!closeResult.success)
    throw new Error(closeResult.error.message, { cause: closeResult.error })
}
```

<a id="api-reference"></a>

## 功能说明

下面的场景代码从本页最小接入中导入模块；除连接/关闭场景外，均在初始化成功后、关闭前运行。每次调用后先检查 `HaiResult.success`；失败分支返回原结果，成功分支再读取 `data`。未给出函数声明的场景是应用异步业务函数内的片段。各场景使用独立测试数据，不能把相邻片段当成无需清理的生产脚本。

<a id="task-definitions"></a>

### 准备与维护任务定义：`scheduler`

连接 RelDB 后登记任务定义；定义变化和当前进程正在使用的快照分开处理。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `scheduler.init` | 使用已连接的 RelDB 准备任务表和执行记录。随后另行调用 `scheduler.start()` | `config?`（省略时使用默认配置） | `Promise<HaiResult<void>>` | `await scheduler.init()` |
| `scheduler.close` | 停止调度并释放自身资源；已发生的外部副作用无法撤销 | 已发生的外部副作用无法撤销；无 | `Promise<void>` | `await scheduler.close()` |
| `scheduler.register` | 登记任务定义 | task | `Promise<HaiResult<void>>` | `await scheduler.register({ id: 'daily', name: 'Daily', cron: '0 2 * * *', timezone: 'UTC' })` |
| `scheduler.unregister` | 移除任务定义 | taskId | `Promise<HaiResult<void>>` | `await scheduler.unregister('daily')` |
| `scheduler.updateTask` | 修改任务定义 | taskId, updates | `Promise<HaiResult<void>>` | `await scheduler.updateTask('daily', { enabled: false })` |
| `scheduler.refreshTasks` | 读取当前进程任务快照 | 无参数 | `Promise<HaiResult<void>>` | `await scheduler.refreshTasks()` |

#### 场景：准备与维护任务定义

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 以 demo-daily 登记每天 UTC 02:00 的任务；成功无数据，配置不合法时返回原失败结果。
const registerResult = await scheduler.register({ id: 'demo-daily', name: 'Demo daily', cron: '0 2 * * *', timezone: 'UTC' })
if (!registerResult.success)
  return registerResult
// 禁用刚登记的 demo-daily，不删除任务；更新失败时返回原失败结果。
const updateTaskResult = await scheduler.updateTask('demo-daily', { enabled: false })
if (!updateTaskResult.success)
  return updateTaskResult
// 无参从持久存储刷新本节点任务定义，成功无数据；读取失败不当作刷新成功。
const refreshTasksResult = await scheduler.refreshTasks()
if (!refreshTasksResult.success)
  return refreshTasksResult
// 按 ID 删除 demo-daily 的任务定义；成功无数据，持久化错误时返回原失败结果。
const unregisterResult = await scheduler.unregister('demo-daily')
if (!unregisterResult.success)
  return unregisterResult
// Each successful result has no business data; only the stored definition changes.
```

输入是在 UTC 每天 02:00 的定义，未调用 start 不会自动开始调度；启停和单次触发见下一节。init/close 见最小接入，先检查 init 的 HaiResult，close 返回 Promise<void>。

- 按 cron 定时执行，也可从业务代码手动触发。
- 支持 HTTP、受信任的 JavaScript 和应用 Hook，提供重试与取消。
- 共享数据库持久化任务、执行状态与可续期租约，支持未知结果隔离。

初始化成功后才能调用业务方法。应用代码在调用前准备实际的业务参数，校验输入和权限。收到 `HaiResult` 时先检查 `success`，成功时读 `data`，失败时读 `error`。成功结果为 `void` 时没有业务数据。返回 `null` 时表示没有找到值。

#### 统一任务模型

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

#### 读取本进程的任务定义快照

```ts
import { scheduler } from '@h-ai/scheduler'

const tasks = scheduler.tasks // 无输入，取得当前进程最后一次成功载入的只读映射。
// 从 scheduler.tasks 的只读任务快照按 cleanup 找定义，未登记为 undefined。
const cleanup = tasks.get('cleanup') // 输入任务 ID，返回该定义或 undefined。
// 在同一个任务快照中检查 cleanup 是否已登记，返回布尔值。
const hasCleanup = tasks.has('cleanup') // 同一键是否存在，返回 boolean。
const taskIds = [
  // 读取任务快照的 ID 迭代器并收集为数组。
  ...tasks.keys()
] // 遍历任务 ID，得到 string[]。
const definitions = [
  // 读取任务快照的定义迭代器并收集为数组。
  ...tasks.values()
] // 遍历任务定义，得到 TaskDefinition[]。
const entries = [
  // 读取任务快照中的 [ID, 任务定义] 对并收集为数组。
  ...tasks.entries()
] // 遍历 ID 和定义，得到 [string, TaskDefinition][]。
const enabledIds: string[] = [] // 保存供展示的 ID。
// 同步访问快照中的每个定义和 ID，用回调筛选已启用项；遍历本身无返回值。
tasks.forEach((task, id) => { // 输入回调，接收定义和 ID，返回 void。
  if (task.enabled !== false)
    enabledIds.push(id) // 记录启用任务。
})
```

修改任务请调用 `scheduler.updateTask` 等方法，查询运行结果请用 `scheduler.getLogs` 或 `scheduler.execution`。

#### 定义一致性与持久化准备

任务定义的刷新、注册、更新和删除在同一进程内按接收顺序协调，包含写操作所需的刷新与提交。合法并发注册不会仅因快照交错而失败；真实数据库故障仍返回失败。close 先停止入口和 runner，取消只读等待和尚未开始写入的操作，再等待已开始的持久写入；迟到快照不发布，避免关闭后旧操作重新填充任务表。执行回调不占用这条队列；跨节点仍依靠共享数据库、版本与租约，不把进程内协调当分布式锁。

先初始化 RelDB，再调用 `scheduler.init()` 创建和校验任务、执行及日志表。结构不符时返回初始化失败。执行账本与观测日志各有用途，应分别管理。

<a id="execution"></a>

### 启动调度与查看执行日志：`scheduler`

start 开始按时间领取任务，trigger 主动执行指定任务；stop 停止后续调度，不撤销外部副作用。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `scheduler.start` | 启动调度轮询 | 无参数 | `HaiResult<void>` | `scheduler.start()` |
| `scheduler.stop` | 停止接纳新的调度 | 无参数 | `HaiResult<void>` | `scheduler.stop()` |
| `scheduler.trigger` | 手动触发任务 | taskId, options | `TaskExecutionLog` | `await scheduler.trigger('daily')` |
| `scheduler.getLogs` | 分页查询执行日志 | options | `PaginatedResult<TaskExecutionLog>` | `await scheduler.getLogs({ pagination: { page: 1, pageSize: 20 } })` |

#### 场景：启动调度与查看执行日志

cron 和手动触发先确定一次运行的 occurrenceId。多个节点争用同一数据库中的执行资格，下面重点展开旧执行到期后的分支。

![共享调度：超时后能否接手](../images/function-scheduler-timeout.svg)

所有领取、续租和最终提交都核验数据库时钟及当前执行 token。只有明确声明可安全重试且次数未耗尽，才允许用同一 occurrenceId 接手；否则记为 unknown 并暂停后续周期，等待人工核对。租约失效不会撤销已发送的 HTTP 或其它外部效果。

初始化并登记任务后运行；start/stop 都返回同步 HaiResult<void>，只控制定时轮询。trigger 仍需检查返回执行记录的 status，输出日志按本次来源筛选。

```ts
async function runAndRead(taskId: string) {
  // 不传参数启动定时轮询，成功无数据；未初始化时返回原失败结果。
  const startResult = scheduler.start()
  if (!startResult.success)
    return startResult
  try {
    // 手动执行调用方指定任务并标记 docs-console，返回执行记录；status 决定实际执行结果。
    const runResult = await scheduler.trigger(taskId, { source: 'docs-console' })
    if (!runResult.success)
      return runResult
    const run = runResult.data
    // 查询该任务、该来源的第一页 20 条日志，items 可为空；查询失败时返回原失败结果。
    const logsResult = await scheduler.getLogs({ taskId, triggerSource: 'docs-console', pagination: { page: 1, pageSize: 20 } })
    if (!logsResult.success)
      return logsResult
    const logs = logsResult.data
    return { status: run.status, logs: logs.items }
  }
  finally {
    // 无参停止后续定时领取，成功无数据；已开始的外部操作不会被撤销。
    const stopResult = scheduler.stop()
    if (!stopResult.success)
      return stopResult
  }
}
```

#### 执行日志

查询日志时可按触发来源过滤：

```ts
// 按下方的任务、状态、来源、近 24 小时时间窗及分页筛选日志；成功返回 items 与分页元数据，读库错误保留在 error。
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

#### 运行行为与边界

所有调度节点应先连接同一 PostgreSQL 或 MySQL。SQLite 文件适合正确共享同一文件的本机进程。数据库保存任务定义、实际执行结果及谁可以在期限内执行它。无需另外初始化 Cache，`enableDb` 只能为 `true`。

每个任务同一时间只能有一次执行，无论从 cron、手工触发或后续周期进入。一次领取默认有效 5 分钟（`leaseMs`，1 秒至 24 小时），调度器在执行期间续期。超过期限的节点无法续期或登记执行结果。各节点每隔 `tickInterval` 读取任务定义，`scheduler.tasks` 显示上一次成功读取的结果。如果读取失败，或者任务已删除、禁用或改期，旧尝试会中断。业务已经执行的操作不会随之撤销。

`context.occurrenceId` 是一次计划运行在数据库中的 ID。同一个任务在同一个计划分钟内，所有节点得到相同 ID。手动触发时可传 1 到 128 个字符的 `idempotencyKey`，再次用同一个值触发会复用原记录。省略时每次创建新记录。

每次领取都会产生不同的 `executionToken`，`sequence` 和 `attempt` 可区分执行次数。HTTP 任务会写入 `Idempotency-Key`、`X-Scheduler-Sequence`、`X-Scheduler-Attempt` 及 `X-Scheduler-Task`（任务 ID 经过百分号编码），覆盖同名请求头。Hook 与执行事件中的 `event.context` 使用同一个 `occurrenceId`，需要发送、写入或调用外部服务的回调可用它去重。

使用 PostgreSQL 时，同一分钟重启或多个节点同时领取可能遇到已有执行记录或被占用的任务槽。调度器将这些冲突作为正常竞争处理。排查任务是否完成时，用 `scheduler.execution.get(occurrenceId)` 查看执行状态，并保留账本和唯一约束以防止重复执行。

默认 `idempotent: false`。只有接收端能在同一次提交中登记去重记录并完成业务写入，才可设为 `true`。例如 HTTP 接收端不能只读取 `Idempotency-Key` 就承诺重复请求只扣款一次，它还要把这次扣款和已处理的请求编号一起保存。

已开始的任务领取超时后，只有声明可安全重试且未超过次数上限，其他节点才能用原 `occurrenceId` 接手。重试次数包括第一次执行和超时接手，`retry.maxAttempts` 默认为 1，范围为 1 到 100。其余情况标记为 `unknown`，暂停该任务的后续执行，等人工核对旧节点或远端请求是否已产生结果。

`await scheduler.close()` 停止接收并取消 HTTP、JS Worker 与重试等待，再等待执行链退出后清理状态。重新初始化等待关闭完成。所有生命周期事件提供 `signal`；Hook 必须监听取消并停止自己的外部副作用（框架无法强制终止同一线程中的业务代码），不要在 Hook 中阻塞事件循环。取消后的旧执行不再重试、不自动删除任务，也不会调用新实例的 Hook。关闭期间保持数据库可用，待 scheduler 关闭后再关闭依赖。

JS 字符串在每次调用的独立 Worker 中执行，`timeout` 默认 30000 毫秒（含启动）。到期后终止并等待线程退出，再记录失败或重试；同步死循环也不会阻塞主事件循环。上下文及返回值必须支持结构化克隆。Worker 中的 `vm` 仍不是安全沙箱，代码必须来自受信任的服务端来源。

API 任务的 `timeout`（默认 30000 毫秒）覆盖请求和完整响应体读取。`ApiTaskConfig.maxResponseBytes` 指定响应体实际接收字节上限（正安全整数，默认 1048576 即 1 MiB）；例如 `maxResponseBytes: 10 * 1024 * 1024` 允许最大 10 MiB，非法值在请求前失败；超时、超限或非成功 HTTP 状态在默认非幂等模式进入 unknown；仅声明幂等能力后才按有限重试策略处理。

`init()` 必须完整加载全部任务才返回成功。配置中的空 ID、重复 ID（含与持久化任务重复）、无效 cron，以及数据库读取或持久化任务解析失败，均返回失败并清空初始化状态；修正配置或数据后重新初始化。不要同时在 `tasks` 中重复声明已有的数据库任务。

调度循环按分钟匹配 cron，并从同一分钟生成持久 occurrenceId；延迟 tick 仍检查当前分钟，运行中每分钟只检查一次。

共享租约的首次领取、开始、续租、完成、过期扫描和隔离，均在同一条数据库 SQL 内计算或核验存储端时间。PostgreSQL 使用 clock_timestamp、MySQL 使用 SYSDATE(3)、SQLite 使用存储端 now；先查时间再写入不能替代最终 deadline 条件。cron 也读取 DB 时间选定分钟 occurrence 并匹配表达式，省略 timezone 时固定 UTC；显式 IANA 时区仅改变 cron 的墙上时间解释，节点 TZ 不改变身份或匹配。节点 Date.now 仅用于耗时诊断，不授权 owner；两个节点相差数小时也不会提前接管或延长过期凭据。行锁等待结束后仍须通过期限条件，失租结果不能投影成功日志。数据库服务自身的时间须由运维保持可信；未知外部副作用仍须核对，不能自动重放。

<a id="hooks"></a>

### 接入业务执行与回调：`scheduler.setHooks`

把业务处理及开始、中断、完成回调一次性登记；回调输入来自调度器的本次执行上下文。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `scheduler.setHooks` | 设置执行器与生命周期回调 | hooks | `HaiResult<void>` | `scheduler.setHooks(taskHooks)` |
| `scheduler.clearHooks` | 清除当前回调 | 无参数 | `HaiResult<void>` | `scheduler.clearHooks()` |

#### 场景：接入业务执行与回调

四个 onTask* 是传给 setHooks 的回调字段，由调度器调用；不是让应用调用 scheduler.hooks.onTask*。输入任务不带 handler，执行回调返回任务 ID，输出包含 start/finish 事件与成功记录。

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
const events: Array<{ stage: string, taskId: string }> = []
// 用下方三个回调记录开始、中断和结束事件；成功替换宿主钩子，未就绪时 返回原失败结果。
const setHooksResult = scheduler.setHooks({
  onTaskStart: event => { events.push({ stage: 'start', taskId: event.task.id }) },
  onTaskExecute: event => ({ taskId: event.context.taskId }),
  onTaskInterrupted: event => { events.push({ stage: 'interrupted', taskId: event.task.id }) },
  onTaskFinish: event => { events.push({ stage: 'finish', taskId: event.task.id }) },
})
if (!setHooksResult.success)
  return setHooksResult
// 登记用于观察钩子的 demo-hook 任务，配置每日 02:00；成功无数据，重复 ID 失败。
const registerResult = await scheduler.register({ id: 'demo-hook', name: 'Hook demo', cron: '0 2 * * *' })
if (!registerResult.success)
  return registerResult
// 手动执行刚登记的 demo-hook 并产生钩子事件；返回执行日志，检查其 status。
const runResult = await scheduler.trigger('demo-hook')
if (!runResult.success)
  return runResult
const run = runResult.data
// run.status === 'success'; events contains start and finish for demo-hook.
// 删除本例的 demo-hook 定义，成功无数据；失败时返回原失败结果。
const unregisterResult = await scheduler.unregister('demo-hook')
if (!unregisterResult.success)
  return unregisterResult
// 无参清除已登记的宿主钩子，成功无数据。
const clearHooksResult = scheduler.clearHooks()
if (!clearHooksResult.success)
  return clearHooksResult
// 后续任务不再使用这些回调，没有业务数据
```

#### 任务生命周期回调

这些可选回调由 Scheduler 调用。应用用 `scheduler.init({ hooks })` 或 `scheduler.setHooks(hooks)` 注册；省略某一项就不会调用它。

#### 可选集成

调度任务触发 Reach 通知时，调度锁或任务完成不等于外部消息只投递一次。按 [Reach 队列语义](../../../packages/reach/README.md) 使用持久 queueId；HTTP 接收端须原子持久去重，SMTP/短信等在途未知结果须人工核对，不能由调度重试直接重发。

<a id="recovery"></a>

### 核对未知结果与修复日志：`scheduler.execution`

执行记录不确定时先核对外部结果；仅日志写失败时修复日志，不能重新执行业务冒充修复。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `scheduler.execution.get` | 按编号读取执行记录 | occurrenceId | `SchedulerExecutionEntry \| null` | `await scheduler.execution.get(occurrenceId)` |
| `scheduler.execution.listUnknown` | 分页查询结果未知的执行 | options | `SchedulerExecutionEntry[]` | `await scheduler.execution.listUnknown({ limit: 20, offset: 0 })` |
| `scheduler.execution.listLogFailures` | 查询日志写入失败的执行 | options | `SchedulerExecutionEntry[]` | `await scheduler.execution.listLogFailures({ limit: 20, offset: 0 })` |
| `scheduler.execution.repairLog` | 修复已核对的执行日志 | occurrenceId | `void` | `await scheduler.execution.repairLog(occurrenceId)` |
| `scheduler.execution.resolveUnknown` | 人工确认执行结果 | occurrenceId, resolution | `void` | `await scheduler.execution.resolveUnknown(occurrenceId, { status: 'success', expectedUpdatedAt })` |

#### 场景：核对未知结果与修复日志

补写与人工裁定分开进行：扫描 pending 日志不执行业务；裁定函数输入必须来自外部核验，带最新 updatedAt 才能提交。

```ts
async function repairPendingLogs() {
  // 从偏移 0 读最多 20 条日志写入失败的运行记录；没有待修记录时返回空数组。
  const pendingResult = await scheduler.execution.listLogFailures({ limit: 20, offset: 0 })
  if (!pendingResult.success)
    return pendingResult
  const pending = pendingResult.data
  for (const entry of pending) {
    // 用当前条目的 occurrenceId 修复已存在的观测日志，成功无数据，不重新执行任务。
    const repairLogResult = await scheduler.execution.repairLog(entry.occurrenceId)
    if (!repairLogResult.success)
      return repairLogResult
  }
  return pending.length // at most 20; the next scan starts at offset 0 again
}
async function recordVerifiedOutcome(occurrenceId: string, status: 'success' | 'discarded') {
  // 从偏移 0 取最多 20 条效果待核对的 unknown 执行；没有匹配为 []。
  const unknownResult = await scheduler.execution.listUnknown({ limit: 20, offset: 0 })
  if (!unknownResult.success)
    return unknownResult
  const unknown = unknownResult.data
  // 按核对的 occurrenceId 读取当前执行及更新时间；不存在时返回 null。
  const currentResult = await scheduler.execution.get(occurrenceId)
  if (!currentResult.success)
    return currentResult
  const current = currentResult.data
  if (current?.status !== 'unknown')
    throw new Error('Expected an unknown execution')
  // 以现有更新时间为条件写入人工核对的 success 或 discarded；成功无数据，状态已变化则失败。
  const resolveUnknownResult = await scheduler.execution.resolveUnknown(occurrenceId, { status, expectedUpdatedAt: current.updatedAt })
  if (!resolveUnknownResult.success)
    return resolveUnknownResult
  // 以同一 occurrenceId 重读人工核对后的结果；独立查询失败时仍返回原失败结果。
  const getResult = await scheduler.execution.get(occurrenceId)
  if (!getResult.success)
    return getResult
  return { scanned: unknown.length, entry: getResult.data }
}
```

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
