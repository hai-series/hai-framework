# @h-ai/audit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md) · [@h-ai/reldb](../reldb/README.en.md)

A unified audit logging module. The `audit` object records, queries, cleans up, and aggregates audit logs, with persistence provided by `@h-ai/reldb`.

## Quick Start

### Dependencies

- `@h-ai/reldb`: database for audit log persistence; **initialize it before audit.init()**.

```ts
import { audit } from '@h-ai/audit'
import { reldb } from '@h-ai/reldb'

// 1. 初始化依赖
await reldb.init({ type: 'sqlite', database: './data.db' })

// 2. 初始化审计模块（自动使用已初始化的 reldb 单例）
const result = await audit.init()
if (!result.success) {
  throw new Error(result.error.message)
}

// 3. 记录审计日志
await audit.log({
  userId: 'user_1',
  action: 'login',
  resource: 'auth',
  ipAddress: '127.0.0.1',
})

// 4. 使用便捷方法
await audit.helper.login('user_1', '127.0.0.1')
await audit.helper.crud({
  userId: 'user_1',
  action: 'create',
  resource: 'users',
  resourceId: 'user_2',
  details: { name: '张三' }
})

// 5. 查询日志
const logs = await audit.list({ pageSize: 20, action: 'login' })

// 6. 获取统计
const stats = await audit.getStats(7) // 最近 7 天

// 7. 清理旧日志
await audit.cleanup(90) // 清理 90 天前的日志

// 8. 关闭
const closeResult = await audit.close()
if (!closeResult.success) {
  throw new Error(closeResult.error.message)
}
```

## Configuration Reference

Generated projects use `config/_audit.yml`, with `audit.init(config)` as the application configuration entry point.

See the [configuration reference](../../docs/usage/configuration/audit.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/audit.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `init` / `close` / `isInitialized` — Connect and close the audit service
- `withContext` / `log` / `capture` / `helper` — Record auditable events with operation context
- `list` / `getUserRecent` / `getStats` / `cleanup` — Query records and statistics and expire old records
- `backup` / `schedulerPlan` / `checkAlerts` — Export private archives, schedule jobs and check alerts

## Data Structures

See the [data reference](../../docs/usage/data/audit.md) in Chinese for audit rows, field mappings, archives and alert deduplication.

## Development and Testing

```bash
pnpm --filter @h-ai/audit test
```

Source examples initialize RelDB first, check audit results, and check cleanup in reverse dependency order; see the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## License

Apache-2.0
