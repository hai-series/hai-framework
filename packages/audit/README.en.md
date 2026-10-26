# @h-ai/audit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md) · [@h-ai/reldb](../reldb/README.en.md)

## Introduction

A unified audit logging module. The `audit` object records, queries, cleans up, and aggregates audit logs, with persistence provided by `@h-ai/reldb`.

SQLite, PostgreSQL and MySQL share the same read contract: `createdAt` is a `Date`, `details` is a JSON string or `null`, and absent nullable fields return `null`. Date filters use the same driver conversion as writes. Counts are safe integers; out-of-range counts return `STATS_FAILED`.

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
- `audit.log(input)`: credential fields in `details` (such as `password` / `token` / `secret`) are redacted automatically before persistence; business privacy fields such as email and phone are also hidden by default and can be configured through privacy.
- `audit.list(options)`: when both `startDate` and `endDate` are provided, `startDate <= endDate` is required.
- `audit.getUserRecent(userId, limit)`: `userId` must be nonempty; `limit`, if provided, must be a positive integer.
- `audit.cleanup(days)`: `days`, if provided, must be a nonnegative integer.
- `audit.getStats(days)`: `days`, if provided, must be a nonnegative integer.

### Error codes

Business data operations return `HaiResult<T>`. Common error codes:

| Error code                       | code            | Description                          |
| -------------------------------- | --------------- | ------------------------------------ |
| `HaiAuditError.LOG_FAILED`       | `hai:audit:001` | Recording failed                     |
| `HaiAuditError.QUERY_FAILED`     | `hai:audit:002` | Query failed                         |
| `HaiAuditError.CLEANUP_FAILED`   | `hai:audit:003` | Cleanup failed                       |
| `HaiAuditError.STATS_FAILED`     | `hai:audit:004` | Aggregation failed                   |
| `HaiAuditError.INIT_IN_PROGRESS` | `hai:audit:005` | Initialization in progress           |
| `HaiAuditError.NOT_INITIALIZED`  | `hai:audit:010` | Module not initialized               |
| `HaiAuditError.CONFIG_ERROR`     | `hai:audit:012` | Invalid configuration                |
| `HaiAuditError.BACKUP_DISABLED`  | `hai:audit:020` | Backup disabled                      |
| `HaiAuditError.BACKUP_FAILED`    | `hai:audit:021` | Backup or verification failed        |
| `HaiAuditError.BACKUP_INVALID`   | `hai:audit:022` | Invalid backup input                 |
| `HaiAuditError.BACKUP_CONFLICT`  | `hai:audit:023` | Backup ID/export conditions conflict |
| `HaiAuditError.ALERTS_DISABLED`  | `hai:audit:024` | Alerts disabled                      |
| `HaiAuditError.ALERTS_FAILED`    | `hai:audit:025` | Alert check or notification failed   |

> Note: `audit.close()` also returns `HaiResult<void>`. Email details in `audit.helper.passwordResetRequest()` are hidden by the default business privacy settings.

`audit.init()` awaits automatic table creation and repository readiness before success. DDL failures leave `isInitialized=false`; correct the database and retry. Custom joins, statistics and cleanup share the same barrier. Closing during initialization invalidates late publication. Check the init HaiResult before recording or querying. Audit does not own the shared RelDB connection; close audit before the database.

## Event context, privacy and retention

Audit createdAt, alert windows and archive cutoffs share the database clock rather than individual node clocks. Scheduled backup/alert tasks declare idempotency based on their persistent deduplication guarantees; failures do not incorrectly block subsequent schedules as non-idempotent unknown tasks.

`capture: { enabled: true, includeReads: false }` controls automatic framework events. IAM records important account, authentication, password, authorization, API Key and session changes. Serv/Kit bind verified identity and trusted client addresses and capture writes and failures/denials; successful reads are skipped by default. Protocol or validation failures before identity is established remain anonymous. HTTP events contain operation/method/status or reason codes, without request bodies, tokens or error details. Applications still call `audit.log()` at domain completion/failure boundaries; disabling capture does not disable explicit logs. Initialize audit before IAM and close it after IAM. Trusted jobs/CLI callers must supply their actor and correlation context.

`audit.log(input, tx)` and `audit.capture(input, { tx })` use an existing RelDB transaction: events commit or roll back with the change, without an independent commit or a false success record after rollback. Record failed/denied attempts at the caller boundary after rollback. Automatic audit failures emit correlated diagnostics and preserve an already-applied business result to avoid unsafe retries. When recording is mandatory, check an explicit log's HaiResult in the same transaction before committing.

New records include category (system/business), outcome (success/failure/denied), severity (info/warning/error/critical), request/trace/scope IDs and actorSnapshot. Identity is copied at event time and survives account renames, role changes and deletion. With userId alone, configured name lookup captures the available username; lookup failure retains an explicitly unnamed identity and emits diagnostics. Trusted HTTP hosts should provide `audit.withContext({ actor, requestId, ipAddress, userAgent }, operation)` using verified identities. This context tool preserves the operation's return value or exception; business writes return HaiResult.

`audit.list({ category, outcome, severity, scopeId, requestId, traceId, sortBy, sortDirection })` filters and sorts through controlled fields. `getStats(7, { category: 'system' })` counts operations in that category. Business privacy is enabled by default; `privacy.fields` adds project field names. Credentials are always hidden, even with business privacy disabled. Hide the whole configured field when free text contains private information.

`retention: { enabled: true, minDays: 90 }` activates a shared database policy. Cleanup honors the actual minimum even with cleanup(0); triggers reject protected UPDATE, DELETE and conflicting replacement writes. An unconfigured fresh framework installation does not force retention protection: the default cleanup argument of 90 days alone is no immutability guarantee. Reinitialization without retention preserves the database policy; explicit trusted startup configuration can disable it. This covers ordinary row writes; database-owner DDL/privileges and stronger archive/storage protection belong to deployment management.

Stop old writers and back up before upgrading. `migrateAudit({ dryRun: true })` previews without writes; audit.init applies repeatable migrations. Unknown historical fields remain null. Legacy joined usernames are display compatibility, rather than historical identity evidence. Failed writes return failure and emit correlated diagnostics. close drains started writes before RelDB can close.

Redaction matches whole fields, including objects, arrays and sensitive values produced by custom JSON projections. capture returns not-initialized failure before initialization or after close; only an initialized module with capture disabled skips automatic events.

## Private backups and scheduled archives

`backup.enabled` is off by default. Inject initialized `StorageFunctions` with `audit.init({ storage, backup: { enabled: true } })`; initialize RelDB first. `backup.batchSize` controls scan batches (default200), while `maxRecordBytes` bounds each UTF-8 record (default1 MiB). Oversized records fail the archive without truncating stored evidence.

`audit.backup.run({ id?, from?, to?, signal? })` writes private JSONL and returns its ID/key, count, SHA-256 and start/cutoff dates. The fixed namespace is `AUDIT_BACKUP_PREFIX` (hai-private/audit-backups/). Use a stable ID for one execution: a complete existing archive is verified and reused. Different export conditions, incomplete or damaged files fail rather than overwrite. Conditional-write races and uncertain writes are reconciled against the actual object. `audit.backup.verify(key, { signal? })` streams bounded format/count/checksum verification. The checksum establishes integrity, not authenticity.

Version1 contains a header, `{type:'entry',record}` lines and a footer. Entries preserve original IDs, ISO dates, stored details and nullable historical identities without joining current usernames. The footer SHA-256 covers all preceding UTF-8 lines including newlines; recordCount counts entry lines. Verified archives can be read offline or restored into a separate query store, without replacing protected live records. Online export uses a fixed cutoff and primary-key cursor; coverage reflects the actual scan. Pause writes/cleanup or use a native database snapshot for recovery at one exact point in time.

`backup.schedule` configures enabled, five-field cron (default `0 2 * * *`) and IANA timezone (default UTC). When both switches are enabled, `audit.schedulerPlan` returns tasks/hooks for explicit composition into `scheduler.init()`; it is null when no automatic backup or alert tasks are enabled. Its callback uses Scheduler's shared occurrence ID and cancellation signal and throws on failure so the task fails correctly. Reconcile unknown executions using Scheduler's rules. The example/fullstack runtimes wire this plan; other hosts explicitly compose existing tasks/hooks. Close Scheduler, IAM, Audit, Storage and RelDB in that order. Audit cancels/drains its own backups and leaves host Storage ownership intact.

```ts
const plan = audit.schedulerPlan
if (plan) {
  const initialized = await scheduler.init({ ...schedulerSettings, ...plan })
  if (!initialized.success)
    throw new Error(initialized.error.message)
  const started = scheduler.start()
  if (!started.success)
    throw new Error(started.error.message)
}
```

The host imports audit/scheduler and supplies validated schedulerSettings, with Audit/Storage/RelDB initialized. Use private archive storage: enabling backups rejects an S3 publicUrl setting, and deployment must restrict bucket/CDN access. Public asset endpoints should expose designated resources only. The example/fullstack runtimes expose canonical avatar paths; archives require an authorized audit download endpoint. Disabling backups preserves the private boundary of existing files.

## Graded anomaly alerts

`alerts.enabled` defaults to false. Inject initialized Reach when enabling it: `audit.init({ reach, alerts: { enabled: true, rules: [...] } })`. Each rule has a stable id, exact actions, optional resource, outcomes and minimumSeverity filters, threshold/windowSeconds, notification severity, and targets containing id/provider/to. Windows default to 300 seconds (60–86400); default outcomes are failure/denied, while an empty outcomes list matches all. Rule and target IDs must be unique; providers must exist in Reach. Business roles remain application choices.

`audit.checkAlerts({signal?})` checks committed events in the current and previous fixed windows. Rolled-back events do not notify; downtime beyond two windows does not replay historical alerts. This is a fixed-window threshold check. maxNotificationsPerCheck defaults to 100; report.more indicates remaining targets. Shared database claims permit one external attempt per rule/target/window, using the database execution clock in the final atomic claim. Semantic rule or recipient changes create a new policy and may notify again.

Messages include only rule/target IDs, level, count and window, without event details or credentials. submitted means provider acceptance; queued means durable Reach enqueue, with queueId for inspection. Neither proves recipient delivery or reading. Failed, interrupted or crashed attempts retain unknown/sending/claimed receipts and are not automatically resent. Inspect audit.alert events and hai_audit_alert_claims, then reconcile with the notification endpoint. Reach-queued messages follow Reach recovery. Claims store no recipient address/body and confirmed submissions/enqueues are cleaned outside the check horizon; unresolved receipts remain for operational review; notification events follow audit retention.

alerts.schedule defaults to disabled, once per minute in UTC. audit.schedulerPlan composes enabled backup and alert tasks for explicit host Scheduler initialization; it is null without automatic tasks. Scheduler callbacks fail when checking fails or report.failed>0. Close Scheduler before Audit/Reach. Audit cancels further claims and drains in-flight sends within Reach provider timeouts without closing host Reach. Query/audit failures return a failed HaiResult; notification failures appear in a successful report.failed and must be checked by callers.

## Development and testing

```bash
pnpm --filter @h-ai/audit test
```

Source examples initialize RelDB first, check audit results, and check cleanup in reverse dependency order; see the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## License

Apache-2.0
