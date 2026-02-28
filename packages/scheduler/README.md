# @h-ai/scheduler

定时任务调度模块，支持 cron 表达式、JS 函数 / HTTP API 执行，以及通过 `@h-ai/db` 持久化执行日志。

## 支持的任务类型

- **JS 函数任务**：执行用户提供的 JS/TS 处理函数
- **API 任务**：发起 HTTP 请求（GET/POST/PUT/DELETE/PATCH），支持自定义 headers、body 和超时

## 快速开始

```ts
import { db } from '@h-ai/db'
import { scheduler } from '@h-ai/scheduler'

// 初始化 DB（可选，用于记录执行日志）
await db.init({ type: 'sqlite', database: './scheduler.db' })

// 初始化调度器
await scheduler.init({ enableDb: true })

// 注册 JS 函数任务
scheduler.register({
  id: 'cleanup',
  name: '清理过期数据',
  cron: '0 2 * * *', // 每天凌晨 2 点
  type: 'js',
  handler: async () => { /* 清理逻辑 */ },
})

// 注册 API 调用任务
scheduler.register({
  id: 'health-check',
  name: '健康检查',
  cron: '*/5 * * * *', // 每 5 分钟
  type: 'api',
  api: { url: 'https://api.example.com/health', method: 'GET' },
})

// 启动调度
scheduler.start()

// 手动触发
await scheduler.trigger('cleanup')

// 查询执行日志
const logs = await scheduler.getLogs({ taskId: 'cleanup', status: 'failed', limit: 20 })

// 停止并关闭
scheduler.stop()
await scheduler.close()
```

## 配置

```ts
await scheduler.init({
  enableDb: true, // 是否启用数据库日志（默认 true，需 @h-ai/db 已初始化）
  tableName: 'scheduler_logs', // 日志表名（默认 'scheduler_logs'）
  tickInterval: 1000, // 调度检查间隔，毫秒（默认 1000）
})
```

若 `enableDb: true` 但 `@h-ai/db` 未初始化，调度器会自动降级为 `enableDb: false`。

## 错误处理

所有操作返回 `Result<T, SchedulerError>`，通过 `result.success` 判断成功或失败。

```ts
import { scheduler, SchedulerErrorCode } from '@h-ai/scheduler'

const result = scheduler.register({ /* ... */ })
if (!result.success) {
  switch (result.error.code) {
    case SchedulerErrorCode.INVALID_CRON:
      // cron 表达式无效
      break
    case SchedulerErrorCode.TASK_ALREADY_EXISTS:
      // 任务 ID 已存在
      break
  }
}
```

常用错误码：

- `NOT_INITIALIZED` — 调度器未初始化
- `TASK_NOT_FOUND` — 任务未找到
- `TASK_ALREADY_EXISTS` — 重复注册
- `INVALID_CRON` — cron 表达式无效
- `JS_EXECUTION_FAILED` — JS 函数执行失败
- `API_EXECUTION_FAILED` — API 调用失败
- `DB_SAVE_FAILED` — 数据库操作失败
- `ALREADY_RUNNING` — 重复启动
- `NOT_RUNNING` — 未启动时停止

## 测试

```bash
pnpm --filter @h-ai/scheduler test
```

## License

Apache-2.0
