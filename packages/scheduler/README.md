# @h-ai/scheduler

定时任务调度模块，支持统一任务模型、cron 调度、JS 函数字符串 / HTTP API 执行、任务持久化、执行日志查询，以及全局任务生命周期回调。

## 依赖

- `@h-ai/reldb` — 任务定义与执行日志持久化，`enableDb: true` 时需先初始化
- `@h-ai/cache` — 分布式锁，可选；初始化后自动参与定时触发抢锁

## 快速开始

```ts
import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { scheduler } from '@h-ai/scheduler'

await reldb.init({ type: 'sqlite', database: './scheduler.db' })
await cache.init({ type: 'memory' }) // 可选

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
  retry: { maxAttempts: 3, backoffMs: [1000, 5000] },
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

## 统一任务模型

```ts
interface TaskDefinition {
  id: string
  name: string
  description?: string
  cron: string
  enabled?: boolean
  deleteAfterRun?: boolean
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

## 任务生命周期回调

初始化时传入或运行时通过 `setHooks()` 设置：

```ts
await scheduler.init({
  enableDb: false,
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

## 执行日志

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

## API 概览

- `init(config?)`
- `register(task)`
- `unregister(taskId)`
- `updateTask(taskId, updates)`
- `start()` / `stop()`
- `trigger(taskId, { source? })`
- `getLogs(options?)`
- `setHooks(hooks)` / `clearHooks()`
- `tasks` / `hooks` / `config` / `isInitialized` / `isRunning`
- `close()`

## 错误处理

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
| `HaiSchedulerError.LOCK_ACQUIRE_FAILED`   | `hai:scheduler:029` | 锁获取失败      |
| `HaiSchedulerError.JS_COMPILE_FAILED`     | `hai:scheduler:030` | JS 编译失败     |
| `HaiSchedulerError.HOOK_EXECUTION_FAILED` | `hai:scheduler:031` | Hook 执行失败   |

## 测试

```bash
pnpm --filter @h-ai/scheduler test
```

## License

Apache-2.0
