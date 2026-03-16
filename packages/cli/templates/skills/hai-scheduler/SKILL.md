---
name: hai-scheduler
description: 使用 @h-ai/scheduler 进行定时任务的注册、调度、持久化管理、手动触发与执行日志查询；当需求涉及 cron 定时任务、JS 函数调度、API 调用调度、任务持久化或任务执行日志时使用。
---

# hai-scheduler

> `@h-ai/scheduler` 提供统一的定时任务调度入口，支持 cron 表达式、JS 函数 / HTTP API 两种任务类型，API 任务定义自动持久化到数据库，以及执行日志的持久化与查询。

---

## 适用场景

- 注册和调度 cron 定时任务（JS 函数或 HTTP API）
- API 任务持久化管理（自动保存、启动时加载、更新、删除）
- 手动触发任务并获取执行结果
- 查询执行日志（按 taskId、状态过滤、分页）
- 基于 `SchedulerErrorCode` 做错误分支处理

---

## 使用步骤

### 1. 初始化

```typescript
import { reldb } from '@h-ai/reldb'
import { scheduler } from '@h-ai/scheduler'

// 初始化 DB 以启用任务持久化和日志记录
await reldb.init({ type: 'sqlite', database: './scheduler.db' })

// 初始化调度器（自动加载之前持久化的 API 任务）
await scheduler.init({ enableDb: true })
```

### 2. 注册任务

```typescript
// API 任务（自动持久化到 DB，重启后自动恢复）
await scheduler.register({
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

// JS 函数任务（仅存在于内存，不持久化）
await scheduler.register({
  id: 'cleanup',
  name: '清理过期数据',
  cron: '0 2 * * *',
  type: 'js',
  handler: async (taskId) => {
    return { deleted: 100 }
  },
})
```

### 3. 任务管理

```typescript
// 更新任务配置（自动同步到 DB）
await scheduler.updateTask('health-check', {
  cron: '*/10 * * * *',
  api: { url: 'https://api.example.com/health/v2' },
})

// 禁用任务
await scheduler.updateTask('health-check', { enabled: false })

// 注销任务（同时从 DB 删除）
await scheduler.unregister('health-check')
```

### 4. 调度控制

```typescript
scheduler.start() // 启动调度
scheduler.stop() // 停止调度
await scheduler.close() // 关闭并清理资源
```

### 5. 手动触发与日志查询

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

| 方法 / 属性     | 签名                                                          | 说明                           |
| --------------- | ------------------------------------------------------------- | ------------------------------ |
| `init`          | `(config?) => Promise<Result<void, SchedulerError>>`          | 初始化调度器，加载持久化任务   |
| `register`      | `(task: TaskDefinition) => Promise<Result<void>>`             | 注册任务（API 任务自动持久化） |
| `unregister`    | `(taskId: string) => Promise<Result<void>>`                   | 注销任务（同时删除持久化数据） |
| `updateTask`    | `(taskId, updates: TaskUpdateInput) => Promise<Result<void>>` | 更新任务配置（同步到 DB）      |
| `start`         | `() => Result<void>`                                          | 启动调度                       |
| `stop`          | `() => Result<void>`                                          | 停止调度                       |
| `trigger`       | `(taskId: string) => Promise<Result<TaskExecutionLog>>`       | 手动触发任务                   |
| `getLogs`       | `(options?) => Promise<Result<TaskExecutionLog[]>>`           | 查询执行日志                   |
| `tasks`         | `ReadonlyMap<string, TaskDefinition>`                         | 已注册任务                     |
| `config`        | `SchedulerConfig \| null`                                     | 当前配置                       |
| `isInitialized` | `boolean`                                                     | 是否已初始化                   |
| `isRunning`     | `boolean`                                                     | 是否正在运行                   |
| `close`         | `() => Promise<void>`                                         | 关闭调度器                     |

### TaskDefinition（联合类型）

**JS 任务**（不可持久化）：

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

**API 任务**（启用 DB 时自动持久化）：

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

### TaskUpdateInput

```typescript
interface TaskUpdateInput {
  name?: string
  cron?: string
  enabled?: boolean
  api?: ApiTaskConfig // 仅 API 类型任务
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
| `NOT_INITIALIZED`      | 11010 | 调度器未初始化             |
| `INIT_FAILED`          | 11011 | 初始化失败                 |
| `CONFIG_ERROR`         | 11012 | 配置校验失败               |
| `TASK_NOT_FOUND`       | 11020 | 任务未找到                 |
| `TASK_ALREADY_EXISTS`  | 11021 | 重复注册同一 taskId        |
| `INVALID_CRON`         | 11022 | cron 表达式无效            |
| `EXECUTION_FAILED`     | 11023 | 任务执行失败（通用）       |
| `JS_EXECUTION_FAILED`  | 11024 | JS 处理函数抛出异常        |
| `API_EXECUTION_FAILED` | 11025 | HTTP 请求失败或非 2xx 响应 |
| `DB_SAVE_FAILED`       | 11026 | 数据库操作失败             |
| `ALREADY_RUNNING`      | 11027 | 重复调用 start             |
| `NOT_RUNNING`          | 11028 | 未启动时调用 stop          |
| `LOCK_ACQUIRE_FAILED`  | 11029 | 分布式锁获取失败           |

---

## 常见模式

### 持久化 API 任务的完整生命周期

```typescript
await reldb.init({ type: 'sqlite', database: './data.db' })
await scheduler.init({ enableDb: true })

// 注册 API 任务（自动持久化）
await scheduler.register({
  id: 'webhook',
  name: 'Webhook 回调',
  cron: '0 * * * *',
  type: 'api',
  api: { url: 'https://example.com/webhook', method: 'POST', body: { event: 'scheduled' } },
})

scheduler.start()

// 后续重启时，init() 自动加载已持久化的任务
// 无需再次 register
```

### 注册后立即测试

```typescript
await scheduler.init({ enableDb: false })
await scheduler.register({
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

### 禁用 DB 的轻量模式

```typescript
// 不需要 @h-ai/reldb，纯调度
await scheduler.init({ enableDb: false })
await scheduler.register({ /* ... */ })
scheduler.start()
```

### 多节点部署（分布式锁）

> 多节点部署时，同一任务可能被多个节点同时调度。scheduler 内置基于数据库的分布式锁，通过 UNIQUE 约束保证同一时刻只有一个节点执行某任务。

```typescript
await reldb.init({ type: 'sqlite', database: './scheduler.db' })
// enableDb: true 时自动启用分布式锁
await scheduler.init({ enableDb: true })
```

锁配置（均有默认值，可选覆盖）：

```typescript
await scheduler.init({
  enableDb: true,
  lockExpireMs: 300000,              // 锁过期时间，默认 5 分钟
  nodeId: 'node-1',                  // 节点标识，默认 crypto.randomUUID()
})
```

**注意**：`runningTasks` 等内存状态仅表示当前节点的运行情况，不代表全局状态。跨节点互斥由数据库锁表保证。

---

## 相关 Skills

- `hai-reldb`：数据库初始化与操作
- `hai-core`：配置管理、Result 模型、日志
