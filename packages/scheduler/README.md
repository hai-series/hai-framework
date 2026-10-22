# @h-ai/scheduler

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md) · [@h-ai/reldb](../reldb/README.md)

## 简介

定时任务调度模块，支持统一任务模型、cron 调度、JS 函数字符串 / HTTP API 执行、任务持久化、执行日志查询，以及全局任务生命周期回调。

## 核心功能清单

- 按 cron 定时执行，也可从业务代码手动触发。
- 支持 HTTP、受信任的 JavaScript 和应用 Hook，提供重试与取消。
- 共享数据库持久化任务、执行状态与可续期租约，支持未知结果隔离。

## 使用入门

### 依赖

- `@h-ai/reldb` — 必须先初始化共享数据库，保存任务、执行 journal 与自动续租；`enableDb` 只能为 true。

### 快速开始

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

### 统一任务模型

```ts
interface TaskDefinition {
  id: string
  name: string
  description?: string
  cron: string
  timezone?: string // IANA 时区，例如 Asia/Shanghai；按该时区解释 cron 墙上时间
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
- `execution.get(occurrenceId)` / `execution.listUnknown(options?)` / `execution.resolveUnknown(occurrenceId, input)`
- `setHooks(hooks)` / `clearHooks()`
- `tasks` / `hooks` / `config` / `isInitialized` / `isRunning`
- `close()`

### 错误处理

所有公共 API（除 `close()`）返回 `HaiResult<T>`。

常用错误码：

| 错误码                                    | code                | 说明            |
| ----------------------------------------- | ------------------- | --------------- |
| `HaiSchedulerError.NOT_INITIALIZED`       | `hai:scheduler:010` | 未初始化        |
| `HaiSchedulerError.INIT_FAILED`           | `hai:scheduler:011` | 初始化失败      |
| `HaiSchedulerError.CONFIG_ERROR`          | `hai:scheduler:012` | 配置错误        |
| `HaiSchedulerError.TASK_NOT_FOUND`        | `hai:scheduler:020` | 任务不存在      |
| `HaiSchedulerError.TASK_ALREADY_EXISTS`   | `hai:scheduler:021` | 任务已存在      |
| `HaiSchedulerError.INVALID_CRON`          | `hai:scheduler:022` | Cron 表达式无效 |
| `HaiSchedulerError.EXECUTION_FAILED`      | `hai:scheduler:023` | 执行失败        |
| `HaiSchedulerError.JS_EXECUTION_FAILED`   | `hai:scheduler:024` | JS 执行失败     |
| `HaiSchedulerError.API_EXECUTION_FAILED`  | `hai:scheduler:025` | API 执行失败    |
| `HaiSchedulerError.DB_SAVE_FAILED`        | `hai:scheduler:026` | DB 保存失败     |
| `HaiSchedulerError.ALREADY_RUNNING`       | `hai:scheduler:027` | 已在运行        |
| `HaiSchedulerError.NOT_RUNNING`           | `hai:scheduler:028` | 未在运行        |
| `HaiSchedulerError.JS_COMPILE_FAILED`     | `hai:scheduler:030` | JS 编译失败     |
| `HaiSchedulerError.HOOK_EXECUTION_FAILED` | `hai:scheduler:031` | Hook 执行失败   |

### 运行行为与边界

所有节点必须先初始化同一共享 RelDB（跨主机生产使用 PostgreSQL/MySQL；SQLite 文件只适合可正确共享同一文件的本机进程）。数据库保存任务、执行 journal、全局任务占位和租约，`enableDb` 只能为 true；不再依赖缓存。`leaseMs` 默认 300000，范围 1000～86400000 毫秒，执行中自动续期。cron、手动和跨周期执行均争用同一任务槽，过期 owner 不能续活或提交。节点每个 `tickInterval` 刷新定义，`tasks` 只是最近成功快照；定义读取失败、删除、禁用、改期均中断旧尝试，已发生副作用不会回滚。

`context.occurrenceId` 是持久发生标识；同一 cron 分钟跨节点一致，手动可传 1～128 字符 `idempotencyKey` 重用原记录，省略时每次独立。`executionToken` 每次领取变化，`sequence` / `attempt` 提供执行代信息。API 会覆盖 `Idempotency-Key`、`X-Scheduler-Sequence`、`X-Scheduler-Attempt`、`X-Scheduler-Task`（任务 ID 使用 percent-encoding）。Hook 及生命周期回调已领取时的 `event.context` 使用同一发生标识；观测回调若产生副作用也须去重。

`idempotent` 默认为 false；只有接收端已将幂等账本和全部副作用原子持久提交，才声明 true。租约过期的已执行任务仅在 true 时以同 occurrenceId 接管；非幂等或耗尽本 occurrence 保存的 retry.maxAttempts（默认 1，范围 1–100，包含首次执行及恢复）时进入 `unknown` 并继续占住任务槽。租约无法强制撤销暂停进程已发出的外部操作，单有 HTTP 头不构成去重实现。重试同样受幂等声明约束。

`scheduler.execution.get(occurrenceId)` 查询权威状态；`listUnknown({ limit, offset })` 分页获取未知结果，limit 为 1～100，offset 为 0～1000000。可信人工先核实外部效果、确认旧 runner 已终止，再按 `expectedUpdatedAt` CAS 调用 `resolveUnknown(id, { status: 'success' | 'discarded', expectedUpdatedAt })` 释放占位；不能直接把 unknown 重排。`log.occurrenceId` 可作查询回执；`getLogs` 仅为尝试观测日志，日志保留策略不删除 journal/幂等历史。

`await scheduler.close()` 停止接收并取消 HTTP、JS Worker 与重试等待，再等待执行链退出后清理状态。重新初始化等待关闭完成。所有生命周期事件提供 `signal`；Hook 必须监听取消并停止自己的外部副作用（框架无法强制终止同一线程中的业务代码），不要在 Hook 中阻塞事件循环。取消后的旧执行不再重试、不自动删除任务，也不会调用新实例的 Hook。关闭期间保持数据库可用，待 scheduler 关闭后再关闭依赖。

JS 字符串在每次调用的独立 Worker 中执行，`timeout` 默认 30000 毫秒（含启动）。到期后终止并等待线程退出，再记录失败或重试；同步死循环也不会阻塞主事件循环。上下文及返回值必须支持结构化克隆。Worker 中的 `vm` 仍不是安全沙箱，代码必须来自受信任的服务端来源。

API 任务的 `timeout`（默认 30000 毫秒）覆盖请求和完整响应体读取。`ApiTaskConfig.maxResponseBytes` 指定响应体实际接收字节上限（正安全整数，默认 1048576 即 1 MiB）；例如 `maxResponseBytes: 10 * 1024 * 1024` 允许最大 10 MiB，非法值在请求前失败；超时、超限或非成功 HTTP 状态在默认非幂等模式进入 unknown；仅声明幂等能力后才按有限重试策略处理。

`init()` 必须完整加载全部任务才返回成功。配置中的空 ID、重复 ID（含与持久化任务重复）、无效 cron，以及数据库读取或持久化任务解析失败，均返回失败并清空初始化状态；修正配置或数据后重新初始化。不要同时在 `tasks` 中重复声明已有的数据库任务。

### 可选集成

调度任务触发 Reach 通知时，调度锁或任务完成不等于外部消息只投递一次。按 [Reach 队列语义](../reach/README.md) 使用持久 queueId；HTTP 接收端须原子持久去重，SMTP/短信等在途未知结果须人工核对，不能由调度重试直接重发。

调度循环按分钟匹配 cron，并从同一分钟生成持久 occurrenceId；延迟 tick 仍检查当前分钟，运行中每分钟只检查一次。

## 开发测试

```bash
pnpm --filter @h-ai/scheduler test
```

## 许可证

Apache-2.0
