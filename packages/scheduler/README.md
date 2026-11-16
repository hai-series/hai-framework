# @h-ai/scheduler

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md) · [@h-ai/reldb](../reldb/README.md)

用 `scheduler` 按 cron 表达式运行任务。任务可执行 JavaScript 处理函数或调用 HTTP 接口。模块把任务设置和执行日志写入数据库，也可在执行前后调用应用提供的函数。

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

生成的项目在 `config/_scheduler.yml` 中设置任务检查间隔和执行租约时长。应用启动代码读取该文件，把配置对象传给 `scheduler.init(config)`。

在[模块配置清单](../../docs/usage/configuration/scheduler.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/scheduler.md)中查看调用示例、输入输出、错误处理与使用要点。

- `scheduler.init` / `scheduler.close` / `scheduler.config` / `scheduler.isInitialized` / `scheduler.isRunning` / `scheduler.start` / `scheduler.stop` — 读取调度设置、检查状态、启动或停止扫描，并在应用退出时释放资源
- `scheduler.register` / `scheduler.updateTask` / `scheduler.unregister` / `scheduler.refreshTasks` / `scheduler.tasks` — 登记、更新或删除任务，读取数据库中的最新内容和当前任务列表
- `scheduler.trigger` / `scheduler.getLogs` / `scheduler.setHooks` / `scheduler.clearHooks` / `scheduler.hooks` / `scheduler.execution` — 立即运行任务、查询执行日志、设置处理前后的回调并读取当前执行信息

## 数据结构

查看[数据结构](../../docs/usage/data/scheduler.md)，了解任务、执行日志、分布式租约和恢复状态。

## 开发测试

```bash
pnpm --filter @h-ai/scheduler test
```

声明旁的 JSDoc 示例从真实公开入口导入，内部仓库、runner、编译器和 cron 工具则明确标注“模块内部上下文”，不代表可从包根导入。示例区分 HaiResult、显式取消异常和 close 的 Promise<void>，并检查业务 status 与日志 persistence；补写日志不会重做业务。维护时运行 `node scripts/check-module-jsdoc.mjs --package scheduler`，同时校验声明覆盖与真实类型；示例编译不代替共享数据库/独立进程验收。

## 许可证

Apache-2.0
