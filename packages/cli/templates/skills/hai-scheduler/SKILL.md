---
name: hai-scheduler
description: 使用 @h-ai/scheduler 进行定时任务的注册、调度、手动触发与执行日志查询；当需求涉及 cron 定时任务、JS 函数调度、API 调用调度或任务执行日志时使用。
---

# hai-scheduler

> `@h-ai/scheduler` 提供统一的定时任务调度入口，支持 cron 表达式、JS 函数 / HTTP API 两种任务类型，以及通过 `@h-ai/db` 的执行日志持久化。

---

## 适用场景

- 注册和调度 cron 定时任务（JS 函数或 HTTP API）
- 手动触发任务并获取执行结果
- 查询执行日志（按 taskId、状态过滤、分页）
- 基于 `SchedulerErrorCode` 做错误分支处理

---

## 使用步骤

### 1. 初始化

```typescript
import { db } from '@h-ai/db'
import { scheduler } from '@h-ai/scheduler'

// 可选：初始化 DB 以启用日志持久化
await db.init({ type: 'sqlite', database: './scheduler.db' })

// 初始化调度器
await scheduler.init({ enableDb: true })
```

### 2. 注册任务

```typescript
// JS 函数任务
scheduler.register({
  id: 'cleanup',
  name: '清理过期数据',
  cron: '0 2 * * *',
  type: 'js',
  handler: async (taskId) => {
    // 业务逻辑，taskId 会自动传入
    return { deleted: 100 }
  },
})

// API 任务
scheduler.register({
  id: 'health-check',
  name: '健康检查',
  cron: '*/5 * * * *',
  type: 'api',
  api: {
    url: 'https://api.example.com/health',
    method: 'GET',
    timeout: 10000,
  },
})
```

### 3. 调度控制

```typescript
scheduler.start() // 启动调度
scheduler.stop() // 停止调度
await scheduler.close() // 关闭并清理资源
```

### 4. 手动触发与日志查询

```typescript
const result = await scheduler.trigger('cleanup')
// result.data => TaskExecutionLog

const logs = await scheduler.getLogs({
  taskId: 'cleanup',
  status: 'failed',
  limit: 20,
  offset: 0,
})
```

---

## 核心 API

### scheduler 对象

| 方法 / 属性     | 签名                                                    | 说明         |
| --------------- | ------------------------------------------------------- | ------------ |
| `init`          | `(config?) => Promise<Result<void, SchedulerError>>`    | 初始化调度器 |
| `register`      | `(task: TaskDefinition) => Result<void>`                | 注册任务     |
| `unregister`    | `(taskId: string) => Result<void>`                      | 注销任务     |
| `start`         | `() => Result<void>`                                    | 启动调度     |
| `stop`          | `() => Result<void>`                                    | 停止调度     |
| `trigger`       | `(taskId: string) => Promise<Result<TaskExecutionLog>>` | 手动触发任务 |
| `getLogs`       | `(options?) => Promise<Result<TaskExecutionLog[]>>`     | 查询执行日志 |
| `tasks`         | `ReadonlyMap<string, TaskDefinition>`                   | 已注册任务   |
| `config`        | `SchedulerConfig \| null`                               | 当前配置     |
| `isInitialized` | `boolean`                                               | 是否已初始化 |
| `isRunning`     | `boolean`                                               | 是否正在运行 |
| `close`         | `() => Promise<void>`                                   | 关闭调度器   |

### TaskDefinition（联合类型）

**JS 任务**：

```typescript
interface TaskDefinitionJs {
  id: string
  name: string
  cron: string // 标准 5 字段 cron 表达式
  type: 'js'
  handler: (taskId: string) => unknown | Promise<unknown>
  enabled?: boolean // 默认 true
}
```

**API 任务**：

```typescript
interface TaskDefinitionApi {
  id: string
  name: string
  cron: string
  type: 'api'
  api: {
    url: string
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
    headers?: Record<string, string>
    body?: unknown
    timeout?: number // 毫秒，默认 30000
  }
  enabled?: boolean
}
```

### TaskExecutionLog

```typescript
{
  id: number
  taskId: string
  taskName: string
  taskType: 'js' | 'api'
  status: 'success' | 'failed'
  result: string | null // JSON 序列化的返回值
  error: string | null
  startedAt: number // Unix 毫秒时间戳
  finishedAt: number
  duration: number // 毫秒
}
```

---

## 错误码 — `SchedulerErrorCode`

| 错误码                 | 值    | 说明                       |
| ---------------------- | ----- | -------------------------- |
| `NOT_INITIALIZED`      | 10000 | 调度器未初始化             |
| `INIT_FAILED`          | 10001 | 初始化失败                 |
| `TASK_NOT_FOUND`       | 10002 | 任务未找到                 |
| `TASK_ALREADY_EXISTS`  | 10003 | 重复注册同一 taskId        |
| `INVALID_CRON`         | 10004 | cron 表达式无效            |
| `EXECUTION_FAILED`     | 10005 | 任务执行失败（通用）       |
| `JS_EXECUTION_FAILED`  | 10006 | JS 处理函数抛出异常        |
| `API_EXECUTION_FAILED` | 10007 | HTTP 请求失败或非 2xx 响应 |
| `DB_SAVE_FAILED`       | 10008 | 数据库操作失败             |
| `ALREADY_RUNNING`      | 10009 | 重复调用 start             |
| `NOT_RUNNING`          | 10010 | 未启动时调用 stop          |

---

## 常见模式

### 注册后立即测试

```typescript
await scheduler.init({ enableDb: false })
scheduler.register({
  id: 'my-task',
  name: '我的任务',
  cron: '0 * * * *',
  type: 'js',
  handler: async () => { /* ... */ },
})

// 不启动调度，直接手动触发验证
const result = await scheduler.trigger('my-task')
if (result.success) {
  // result.data.status === 'success' | 'failed'
}
```

### 带日志查询的完整流程

```typescript
await db.init({ type: 'sqlite', database: ':memory:' })
await scheduler.init({ enableDb: true })

scheduler.register({ id: 'job', name: '任务', cron: '* * * * *', type: 'js', handler: () => 'done' })
scheduler.start()

// 稍后查询失败日志
const failedLogs = await scheduler.getLogs({ status: 'failed', limit: 50 })

scheduler.stop()
await scheduler.close()
```

### 禁用 DB 的轻量模式

```typescript
// 不需要 @h-ai/db，纯调度
await scheduler.init({ enableDb: false })
scheduler.register({ /* ... */ })
scheduler.start()
```

---

## 相关 Skills

- `hai-db`：数据库初始化与操作
- `hai-core`：配置管理、Result 模型、日志
