---
name: hai-scheduler
description: 使用 @h-ai/scheduler 进行统一定时任务管理、任务持久化、手工触发、触发来源审计、全局生命周期回调与执行日志查询；当需求涉及 cron 调度、JS 函数字符串任务、API 任务、分布式锁或任务事件回调时使用。
---

# hai-scheduler

> `@h-ai/scheduler` 使用统一任务模型管理 API / JS / Hook 三类执行路径，支持持久化、手工触发来源记录、分布式锁与全局生命周期回调。

## 依赖

| 模块 | 用途 | 是否必需 | 初始化要求 |
| --- | --- | --- | --- |
| `@h-ai/reldb` | 任务定义与执行日志持久化 | `enableDb: true` 时必需 | 需在 `scheduler.init()` 前初始化 |
| `@h-ai/cache` | 分布式锁 | 可选 | 初始化后自动启用 |

## 使用步骤

### 1. 初始化

```ts
import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { scheduler } from '@h-ai/scheduler'

await reldb.init({ type: 'sqlite', database: './scheduler.db' })
await cache.init({ type: 'memory' })

await scheduler.init({
  enableDb: true,
  hooks: {
    onTaskStart(event) {
      console.info('start', event.task.id, event.trigger)
    },
    onTaskInterrupted(event) {
      console.warn('interrupted', event.task.id, event.reason)
    },
    onTaskFinish(event) {
      console.info('finish', event.log.status)
    },
  },
})
```

### 2. 注册任务

```ts
await scheduler.register({
  id: 'health-check',
  name: '健康检查',
  cron: '*/5 * * * *',
  params: { channel: 'ops' },
  handler: {
    kind: 'api',
    url: 'https://api.example.com/health',
    method: 'GET',
  },
})

await scheduler.register({
  id: 'cleanup',
  name: '清理过期数据',
  cron: '0 2 * * *',
  params: { source: 'nightly' },
  handler: {
    kind: 'js',
    code: '(context) => ({ taskId: context.taskId, params: context.params })',
  },
})
```

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
  pagination: { page: 1, pageSize: 20 },
})
```

## 核心类型

### TaskDefinition

```ts
interface TaskDefinition {
  id: string
  name: string
  cron: string
  enabled?: boolean
  params?: Record<string, string>
  handler?: ApiTaskConfig | JsTaskConfig
}
```

### Handler 配置

```ts
interface ApiTaskConfig {
  kind: 'api'
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  body?: unknown
  timeout?: number
}

interface JsTaskConfig {
  kind: 'js'
  code: string
  timeout?: number
}
```

### TaskExecutionLog

```ts
interface TaskExecutionLog {
  id: number
  taskId: string
  taskName: string
  taskType: 'api' | 'js' | 'hook'
  triggerType: 'scheduled' | 'manual'
  triggerSource: string | null
  status: 'success' | 'failed' | 'interrupted'
  result: string | null
  error: string | null
  startedAt: number
  finishedAt: number
  duration: number
}
```

## 核心 API

| 方法 / 属性 | 签名 | 说明 |
| --- | --- | --- |
| `init` | `(config?) => Promise<Result<void, SchedulerError>>` | 初始化调度器 |
| `register` | `(task) => Promise<Result<void>>` | 注册统一任务模型 |
| `updateTask` | `(taskId, updates) => Promise<Result<void>>` | 更新 cron / params / handler |
| `trigger` | `(taskId, { source? }) => Promise<Result<TaskExecutionLog>>` | 手工触发并记录来源 |
| `getLogs` | `(options?) => Promise<Result<PaginatedResult<TaskExecutionLog>>>` | 支持按 trigger 过滤日志 |
| `setHooks` | `(hooks) => Result<void>` | 设置全局生命周期回调 |
| `clearHooks` | `() => Result<void>` | 清空全局生命周期回调 |
| `start / stop` | `() => Result<void>` | 启动 / 停止调度 |
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
  lockExpireMs: 300000,
  nodeId: 'node-1',
})
```

## 错误码

重点关注：

- `NOT_INITIALIZED`
- `TASK_NOT_FOUND`
- `TASK_ALREADY_EXISTS`
- `INVALID_CRON`
- `EXECUTION_FAILED`
- `JS_COMPILE_FAILED`
- `JS_EXECUTION_FAILED`
- `API_EXECUTION_FAILED`
- `HOOK_EXECUTION_FAILED`
- `DB_SAVE_FAILED`
- `LOCK_ACQUIRE_FAILED`
