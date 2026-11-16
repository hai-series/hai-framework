# @h-ai/scheduler

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md) · [@h-ai/reldb](../reldb/README.en.md)

Use `scheduler` to run JavaScript handlers or call HTTP endpoints on a cron schedule. It saves task settings and execution logs in the database and can call application callbacks before and after runs.

## Quick Start

### Dependencies

- `@h-ai/reldb`: initialize the shared database first; tasks, execution journals and leases are mandatory, and `enableDb` accepts only true.

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

## Configuration Reference

Generated projects define how often to check for work and how long a worker owns a task in `config/_scheduler.yml`. At startup, the application reads the file and passes the settings object to `scheduler.init(config)`.

See the [configuration reference](../../docs/usage/configuration/scheduler.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/scheduler.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `scheduler.init` / `scheduler.close` / `scheduler.config` / `scheduler.isInitialized` / `scheduler.isRunning` / `scheduler.start` / `scheduler.stop` — Read settings, check status, start or stop scanning for tasks, and release resources at shutdown
- `scheduler.register` / `scheduler.updateTask` / `scheduler.unregister` / `scheduler.refreshTasks` / `scheduler.tasks` — Register, update, or remove tasks, reload them from the database, and inspect the current list
- `scheduler.trigger` / `scheduler.getLogs` / `scheduler.setHooks` / `scheduler.clearHooks` / `scheduler.hooks` / `scheduler.execution` — Run a task now, inspect execution logs, register callbacks, and read information about the current run

## Data Structures

See the [data reference](../../docs/usage/data/scheduler.md) in Chinese for tasks, execution logs, distributed leases and recovery state.

## Development and Testing

```bash
pnpm --filter @h-ai/scheduler test
```

Declaration JSDoc examples import real public entries. Internal repositories, the runner, compiler and cron helpers are marked as internal module context and are not root exports. Examples distinguish HaiResult, explicit cancellation rejection, and close returning Promise<void>; business status and log persistence remain separate, and log repair never reruns business work. Maintainers can run `node scripts/check-module-jsdoc.mjs --package scheduler` to check declaration coverage and real types. Compiling examples does not replace shared-database and independent-process validation.

## License

Apache-2.0
