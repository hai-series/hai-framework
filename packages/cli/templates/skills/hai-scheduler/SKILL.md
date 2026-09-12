---
name: hai-scheduler
description: "使用 @h-ai/scheduler 注册 cron/API/JS/Hook 任务、手工触发并查询执行日志。"
---

# hai-scheduler

## 能力契约

持久化动态任务每个 `tickInterval`（默认 1000ms）在运行节点刷新；API 操作及获锁后的每次尝试重读定义，读取失败或任务已禁用/删除/改期时中断执行。`tasks` 仅表示最近成功刷新快照，已开始的外部副作用不会回滚。跨节点任务使用 `register()` 与共享数据库、Redis；`init({ tasks })` 是节点本地配置，memory cache 不支持跨进程防重。

关闭必须 `await scheduler.close()` 后再关闭数据库和缓存：关闭会拒绝新任务、取消 HTTP/Worker/重试并等待执行链退出。生命周期回调通过事件 `signal` 协作取消，必须自行停止外部副作用，禁止在 Hook 阻塞主线程。旧任务取消后不重试、不删除新实例同 ID 的任务。

JS 任务每次调用独立 Worker，默认 30000 毫秒期限包含线程启动；超时后等待线程终止才返回失败或重试，同步死循环不会占用主事件循环。上下文和结果须支持结构化克隆。Worker/vm 不构成安全沙箱，仍只接受受信任的服务端代码。

初始化为全有或全无：必须检查 `init()` 的 HaiResult。空 ID、重复 ID（包括与数据库记录重复）、无效 cron、持久化读取或解析失败均使初始化失败并清理状态；修正后重试，不会静默跳过任务。

API 任务 `timeout` 默认 30000 毫秒，覆盖请求及完整响应体读取；`maxResponseBytes` 指定实际接收字节上限（正安全整数，默认 1048576 即 1 MiB），例如 `maxResponseBytes: 10 * 1024 * 1024` 允许最大 10 MiB；非法值在请求前失败。超时、超限和非成功 HTTP 状态均失败，重试由任务 retry 策略控制。

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/scheduler 注册 cron/API/JS/Hook 任务、手工触发并查询执行日志 |
| 适用场景 | 服务端任务调度、持久化和手工触发 |
| 输入 | SchedulerConfigInput、任务定义、已初始化依赖与 hooks |
| 输出 | 任务管理、触发和日志查询的 HaiResult |
| 限制 | 仅服务端；vm 不是安全沙箱，JS 任务只执行可信代码。多节点需要共享锁，关闭释放调度资源。 |

> `@h-ai/scheduler` 使用统一任务模型管理 API / JS / Hook 三类执行路径，支持持久化、手工触发来源记录、分布式锁与全局生命周期回调。

## 运行环境

> ⚠️ **服务端模块（Node.js only）。** 浏览器端通过 API 端点触发 `scheduler.trigger()` 或查询任务日志。

## 依赖

| 模块 | 用途 | 是否必需 | 初始化要求 |
| --- | --- | --- | --- |
| `@h-ai/reldb` | 任务定义与执行日志持久化 | `enableDb: true` 时必需 | 需在 `scheduler.init()` 前初始化 |
| `@h-ai/cache` | 分布式锁 | 可选 | 初始化后自动启用 |

## 使用步骤

### 1. 初始化

```ts
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { scheduler } from '@h-ai/scheduler'

await reldb.init({ type: 'sqlite', database: './scheduler.db' })
await cache.init({ type: 'memory' })

await scheduler.init({
  enableDb: true,
  maxLogs: 1000,
  retentionDays: 30,
  hooks: {
    onTaskStart(event) {
      core.logger.info('Task started', { taskId: event.task.id, trigger: event.trigger })
    },
    onTaskInterrupted(event) {
      core.logger.warn('Task interrupted', { taskId: event.task.id, reason: event.reason })
    },
    onTaskFinish(event) {
      core.logger.info('Task finished', { status: event.log.status })
    },
  },
})
```

### 2. 注册任务

```ts
await scheduler.register({
  id: 'health-check',
  name: '健康检查',
  description: '每 5 分钟巡检一次接口健康状态',
  cron: '*/5 * * * *',
  params: { channel: 'ops' },
  retry: { maxAttempts: 3, backoffMs: [1000, 5000] },
  handler: {
    kind: 'api',
    url: 'https://api.example.com/health',
    method: 'GET',
  },
})

await scheduler.register({
  id: 'cleanup',
  name: '清理过期数据',
  description: '夜间单次清理任务',
  cron: '0 2 * * *',
  deleteAfterRun: true,
  params: { source: 'nightly' },
  handler: {
    kind: 'js',
    code: '(context) => ({ taskId: context.taskId, params: context.params })',
  },
})
```

> ⚠️ **安全警示**：`kind: 'js'` 仅允许受信任的服务端代码。当前实现使用 Node.js `vm` 便捷执行，不是安全沙箱；禁止把用户、租户或运营后台自由输入的 JS 字符串直接注册为任务。需要可配置执行逻辑时，优先改用 `kind: 'api'` 或 `hooks.onTaskExecute`。

### 3. 使用全局 execute hook 处理无 handler 任务

```ts
await scheduler.setHooks({
  async onTaskExecute(event) {
    return { via: 'hook', source: event.context.trigger.source }
  },
})

await scheduler.register({
  id: 'hook-task',
  name: 'Hook 任务',
  cron: '* * * * *',
})
```

### 4. 手工触发与日志查询

```ts
const result = await scheduler.trigger('cleanup', { source: 'admin-console' })

const logs = await scheduler.getLogs({
  taskId: 'cleanup',
  triggerType: 'manual',
  triggerSource: 'admin-console',
  startedAfter: Date.now() - 24 * 60 * 60 * 1000,
  startedBefore: Date.now(),
  pagination: { page: 1, pageSize: 20 },
})
```

## 核心 API

| 方法 / 属性 | 签名 | 说明 |
| --- | --- | --- |
| `init` | `(config?) => Promise<HaiResult<void>>` | 初始化调度器 |
| `register` | `(task) => Promise<HaiResult<void>>` | 注册统一任务模型 |
| `updateTask` | `(taskId, updates) => Promise<HaiResult<void>>` | 更新 cron / params / handler |
| `register` 扩展字段 | `description / deleteAfterRun / retry` | 支持任务描述、一次性任务、失败重试策略 |
| `trigger` | `(taskId, { source? }) => Promise<HaiResult<TaskExecutionLog>>` | 手工触发并记录来源 |
| `getLogs` | `(options?) => Promise<HaiResult<PaginatedResult<TaskExecutionLog>>>` | 支持按 trigger + startedAfter/startedBefore 过滤日志 |
| `setHooks` | `(hooks) => HaiResult<void>` | 设置全局生命周期回调 |
| `clearHooks` | `() => HaiResult<void>` | 清空全局生命周期回调 |
| `start / stop` | `() => HaiResult<void>` | 启动 / 停止调度 |
| `close` | `() => Promise<void>` | 关闭调度器 |

## 常见模式

### 持久化 JS 任务

```ts
await scheduler.init({ enableDb: true })

await scheduler.register({
  id: 'persisted-js',
  name: '持久化 JS 任务',
  cron: '*/10 * * * *',
  handler: {
    kind: 'js',
    code: '(context) => ({ taskId: context.taskId })',
  },
})
```

### 手工触发来源审计

```ts
await scheduler.trigger('cleanup', { source: 'admin-console' })
await scheduler.trigger('cleanup', { source: 'cli' })

const adminLogs = await scheduler.getLogs({ triggerSource: 'admin-console' })
```

### 分布式锁

```ts
await cache.init({ type: 'redis', host: 'localhost', port: 6379 })
await reldb.init({ type: 'sqlite', database: './scheduler.db' })
await scheduler.init({
  enableDb: true,
  maxLogs: 500,
  retentionDays: 14,
  lockExpireMs: 300000,
  nodeId: 'node-1',
})
```

## 错误码 — `HaiSchedulerError`

| 错误码 | code | 说明 |
|--------|------|------|
| `HaiSchedulerError.NOT_INITIALIZED` | `hai:scheduler:010` | 未初始化 |
| `HaiSchedulerError.INIT_FAILED` | `hai:scheduler:011` | 初始化失败 |
| `HaiSchedulerError.CONFIG_ERROR` | `hai:scheduler:012` | 配置错误 |
| `HaiSchedulerError.TASK_NOT_FOUND` | `hai:scheduler:020` | 任务不存在 |
| `HaiSchedulerError.TASK_ALREADY_EXISTS` | `hai:scheduler:021` | 任务已存在 |
| `HaiSchedulerError.INVALID_CRON` | `hai:scheduler:022` | Cron 表达式无效 |
| `HaiSchedulerError.EXECUTION_FAILED` | `hai:scheduler:023` | 执行失败 |
| `HaiSchedulerError.JS_EXECUTION_FAILED` | `hai:scheduler:024` | JS 执行失败 |
| `HaiSchedulerError.API_EXECUTION_FAILED` | `hai:scheduler:025` | API 执行失败 |
| `HaiSchedulerError.DB_SAVE_FAILED` | `hai:scheduler:026` | DB 保存失败 |
| `HaiSchedulerError.ALREADY_RUNNING` | `hai:scheduler:027` | 已在运行 |
| `HaiSchedulerError.NOT_RUNNING` | `hai:scheduler:028` | 未在运行 |
| `HaiSchedulerError.LOCK_ACQUIRE_FAILED` | `hai:scheduler:029` | 锁获取失败 |
| `HaiSchedulerError.JS_COMPILE_FAILED` | `hai:scheduler:030` | JS 编译失败 |
| `HaiSchedulerError.HOOK_EXECUTION_FAILED` | `hai:scheduler:031` | Hook 执行失败 |

调度循环按分钟时间点匹配 cron，并用同一分钟生成分布式锁键；启动或 tick 延迟至非零秒仍检查当前分钟，同一轮运行不会每个 tick 重复调度。
