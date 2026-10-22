# @h-ai/audit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md) · [@h-ai/reldb](../reldb/README.en.md)

## Introduction

A unified audit logging module. The `audit` object records, queries, cleans up, and aggregates audit logs, with persistence provided by `@h-ai/reldb`.

## Core features

- Record user actions and security events; filter by user, date and action.
- Query paginated logs and statistics, and clean up by retention period.
- Persist through the relational database and redact credential fields before writing.

## Getting started

### Dependencies

- `@h-ai/reldb`: database for audit log persistence; **initialize it before audit.init()**.

### Use cases

- User activity auditing (login, logout, registration, password reset, etc.)
- CRUD auditing (resource creation, reads, updates, and deletion)
- Security event tracking and compliance auditing
- Operational statistics (operation frequency, active users, etc.)

### Quick start

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
await audit.helper.crud({ userId: 'user_1', action: 'create', resource: 'users', resourceId: 'user_2', details: { name: '张三' } })

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

### Initialization options

```ts
// 默认配置（无需传参）
await audit.init()

// 自定义用户表映射
await audit.init({
  userTable: 'hai_iam_users', // 用户表名（默认 'hai_iam_users'）
  userIdColumn: 'id', // 用户表主键列名（默认 'id'）
  userNameColumn: 'username', // 用户表用户名列名（默认 'username'）
})
```

Audit logs are stored in the fixed `hai_audit_logs` table and require an initialized `@h-ai/reldb`.

### API overview

- `audit.init(config)`: initialize the audit module.
- `audit.log(input)`: record an audit log.
- `audit.list(options)`: returns `PaginatedResult<AuditLogWithUser>` (items/total/page/pageSize, including usernames). Core normalizes pagination, with pageSize 20 by default; consume the returned metadata directly.
- `audit.getUserRecent(userId, limit)`: get recent user activity.
- `audit.cleanup(days)`: delete old logs.
- `audit.getStats(days)`: get operation statistics.
- `audit.helper.login/logout/register/...`: convenient log helpers.
- `audit.close()`: close the module.

Record common events through `audit.helper`, with the public `AuditHelper` type. The helper's internal assembly factory is outside the package API.

#### Input constraints

- `audit.log(input)`: `action` / `resource` must be nonempty strings of at most 256 characters.
- `audit.log(input)`: credential fields in `details` (such as `password` / `token` / `secret`) are redacted automatically before persistence; email addresses and phone numbers retain their original values by default.
- `audit.list(options)`: when both `startDate` and `endDate` are provided, `startDate <= endDate` is required.
- `audit.getUserRecent(userId, limit)`: `userId` must be nonempty; `limit`, if provided, must be a positive integer.
- `audit.cleanup(days)`: `days`, if provided, must be a nonnegative integer.
- `audit.getStats(days)`: `days`, if provided, must be a nonnegative integer.

### Error codes

All operations return `HaiResult<T>`. Common error codes:

| Error code                       | code            | Description                |
| -------------------------------- | --------------- | -------------------------- |
| `HaiAuditError.LOG_FAILED`       | `hai:audit:001` | Recording failed           |
| `HaiAuditError.QUERY_FAILED`     | `hai:audit:002` | Query failed               |
| `HaiAuditError.CLEANUP_FAILED`   | `hai:audit:003` | Cleanup failed             |
| `HaiAuditError.STATS_FAILED`     | `hai:audit:004` | Aggregation failed         |
| `HaiAuditError.INIT_IN_PROGRESS` | `hai:audit:005` | Initialization in progress |
| `HaiAuditError.NOT_INITIALIZED`  | `hai:audit:010` | Module not initialized     |
| `HaiAuditError.CONFIG_ERROR`     | `hai:audit:012` | Invalid configuration      |

> Note: `audit.close()` also returns `HaiResult<void>`. `audit.helper.passwordResetRequest()` records the original email address without additional masking by default.

`audit.init()` awaits automatic table creation and repository readiness before success. DDL failures leave `isInitialized=false`; correct the database and retry. Custom joins, statistics and cleanup share the same barrier. Closing during initialization invalidates late publication. Check the init HaiResult before recording or querying. Audit does not own the shared RelDB connection; close audit before the database.

## Development and testing

```bash
pnpm --filter @h-ai/audit test
```

Source examples initialize RelDB first, check audit results, and check cleanup in reverse dependency order; see the [JSDoc conventions (Chinese)](../../docs/module-jsdoc.md).

## License

Apache-2.0
