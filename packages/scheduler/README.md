# @h-ai/scheduler

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md) · [@h-ai/reldb](../reldb/README.md)

定时任务调度模块，支持统一任务模型、cron 调度、JS 函数字符串 / HTTP API 执行、任务持久化、执行日志查询，以及全局任务生命周期回调。

## 快速开始

### 依赖

- `@h-ai/reldb` — 必须先初始化共享数据库，保存任务、执行 journal 与自动续租；`enableDb` 只能为 true。

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

## 配置清单

生成项目使用 `config/_scheduler.yml`。应用可以通过 `scheduler.init(config)` 接入配置。

在[模块配置清单](../../docs/usage/configuration/scheduler.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/scheduler.md)中查看调用示例、输入输出、错误处理与使用要点。

- `init` / `close` / `config` / `isInitialized` / `isRunning` / `start` / `stop` — 管理调度生命周期
- `register` / `updateTask` / `unregister` / `refreshTasks` / `tasks` — 维护任务定义与运行视图
- `trigger` / `getLogs` / `setHooks` / `clearHooks` / `hooks` / `execution` — 手工触发、查询日志、设置回调并读取执行上下文

## 数据结构

查看[数据结构](../../docs/usage/data/scheduler.md)，了解任务、执行日志、分布式租约和恢复状态。

## 开发测试

```bash
pnpm --filter @h-ai/scheduler test
```

声明旁的 JSDoc 示例从真实公开入口导入，内部仓库、runner、编译器和 cron 工具则明确标注“模块内部上下文”，不代表可从包根导入。示例区分 HaiResult、显式取消异常和 close 的 Promise<void>，并检查业务 status 与日志 persistence；补写日志不会重做业务。维护时运行 `node scripts/check-module-jsdoc.mjs --package scheduler`，同时校验声明覆盖与真实类型；示例编译不代替共享数据库/独立进程验收。

## 许可证

Apache-2.0
