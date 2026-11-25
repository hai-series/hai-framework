# @h-ai/audit API Reference

<!-- translation: partial -->

[Chinese source](audit.md) · [Configuration](../configuration/audit.en.md) · [Data structures](../data/audit.en.md)

## Quick start

Initialize Audit on the server. Pass trusted actor, request and resource identifiers in the context. Write explicit entries for caller-defined events and use capture around business operations.

This example uses an in-memory SQLite database. Initialize RelDB, then Audit. Record a login and query for that action; `logs.items` contains the entry you just wrote. When the example finishes, close Audit before RelDB. Run it in a development environment (for example, `NODE_ENV=development`). Production mode requires a database shared across nodes.

```ts
// Standalone startup/shutdown script: throw the original error at this boundary; HaiResult business functions should return failed results.
import { audit } from '@h-ai/audit'
import { reldb } from '@h-ai/reldb'

// Open the in-memory SQLite database for audit tables. Success has no data. Connection throw the original error at this script boundary on failure.
const initResult = await reldb.init({ type: 'sqlite', database: ':memory:' })
if (!initResult.success)
  throw new Error(initResult.error.message, { cause: initResult.error })

try {
  // Borrow the open database and use default audit settings. Success enables logging; throw the original error at this script boundary on failure.
  const initResult2 = await audit.init()
  if (!initResult2.success)
    throw new Error(initResult2.error.message, { cause: initResult2.error })
  try {
    // Write the auth login event for demo-user. Success returns the record with its ID; throw the original error at this script boundary on failure.
    const logResult = await audit.log({ userId: 'demo-user', action: 'login', resource: 'auth' })
    if (!logResult.success)
      throw new Error(logResult.error.message, { cause: logResult.error })
    const saved = logResult.data
    // Query login events in pages of up to 20. In the fresh database the page contains the new event. Query throw the original error at this script boundary on failure.
    const listResult = await audit.list({ action: 'login', pageSize: 20 })
    if (!listResult.success)
      throw new Error(listResult.error.message, { cause: listResult.error })
    const logs = listResult.data
    // 新数据库中，查询到的第一条记录就是刚写入的那条。
    if (logs.items[0]?.id !== saved.id)
      throw new Error('Expected the new login event')
  }
  finally {
    // Close audit state without arguments. Success has no data; cleanup throw the original error at this script boundary on failure.
    const closeResult = await audit.close()
    if (!closeResult.success)
      throw new Error(closeResult.error.message, { cause: closeResult.error })
  }
}
finally {
  // Close SQLite after audit shuts down. Success has no data; cleanup throw the original error at this script boundary on failure.
  const closeResult2 = await reldb.close()
  if (!closeResult2.success)
    throw new Error(closeResult2.error.message, { cause: closeResult2.error })
}
```

<a id="api-list"></a>

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Import the module as in the quick start. Except for lifecycle examples, run scenarios after initialization and before closure. Each call checks HaiResult.success before reading data and returns the original failed result to its caller. Scenarios without a function declaration are fragments inside an async application function. Use isolated test data and explicit cleanup.

<a id="lifecycle"></a>

### Prepare audit services: `audit`

Connect RelDB before Audit and close them in reverse order.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `audit.init(config?)` | Prepare audit tables using initialized RelDB | `config?` | `void` | `await audit.init()` |
| `audit.close()` | Release the module without closing borrowed services | None | `void` | `await audit.close()` |
| `audit.isInitialized` | Check whether audit is ready | Read-only property; no arguments | `boolean` | `audit.isInitialized` |

#### Scenario: Prepare audit services

```ts
// Fragment inside an async application function; return failed results to its caller.
// Use default settings with the initialized RelDB. Success prepares tables. Return the failed result on failure.
const initResult = await audit.init()
if (!initResult.success)
  return initResult
// audit tables are ready
// Read readiness. It is true here once the audit tables are ready.
audit.isInitialized // true
// Stop audit without arguments. Success leaves the borrowed database open and has no data. Return the failed result on failure.
const closeResult = await audit.close()
if (!closeResult.success)
  return closeResult
// the borrowed RelDB remains open
```

Omitting input uses current defaults. Reinitialize before continuing; close leaves the borrowed database open.

Outputs are successful HaiResult.data, except withContext, which returns exactly what its callback returns.

Pass a transaction to audit.log when the audit record must commit with a business change. A backup is not itself a deletion.

[Detailed parameters and workflows](audit.md#lifecycle)

<a id="events"></a>

### Record actions and identity: `audit.log`, `audit.helper`

Record events using server-derived identities and request IDs. Helpers cover common authentication and CRUD events.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `audit.log(input, tx?)` | Save an explicit audit event | `input: CreateAuditLogInput` Required event. See [event fields](#audit-event-fields). `tx?: DmlWithTxOperations` Optional existing transaction to commit the log with the business operation | `AuditLog` | `await audit.log(event)` |
| `audit.capture(input, options?)` | Capture according to the configured policy | `input: CreateAuditLogInput` Required event. See [event fields](#audit-event-fields). `options?` Read flag and transaction. See [capture fields](#audit-event-fields) | `void` | `await audit.capture(event)` |
| `audit.withContext(context, operation)` | Bind trusted actor and request context | `context: AuditContext` Trusted async context. See [identity fields](#audit-event-fields). `operation: () => T` Run in the context and return its original value | `T` | `audit.withContext(trustedContext, () => saveOrder())` |
| `audit.helper.login(userId, ip?, ua?)` | Record a login | `userId: string` Trusted user ID from the session. `ip?: string, ua?: string` Optional client IP and User-Agent | `void` | `await audit.helper.login(userId)` |
| `audit.helper.logout(userId, ip?, ua?)` | Record a logout | `userId: string` Trusted user ID from the session. `ip?: string, ua?: string` Optional client IP and User-Agent | `void` | `await audit.helper.logout(userId)` |
| `audit.helper.register(userId, ip?, ua?)` | Record registration | `userId: string` Trusted user ID from the session. `ip?: string, ua?: string` Optional client IP and User-Agent | `void` | `await audit.helper.register(userId)` |
| `audit.helper.passwordResetRequest(email, ip?, ua?)` | Record a password reset request | `email: string` Email requesting the reset. `ip?: string, ua?: string` Optional client IP and User-Agent | `void` | `await audit.helper.passwordResetRequest(email)` |
| `audit.helper.passwordResetComplete(userId, ip?, ua?)` | Record a completed password reset | `userId: string` Trusted user ID from the session. `ip?: string, ua?: string` Optional client IP and User-Agent | `void` | `await audit.helper.passwordResetComplete(userId)` |
| `audit.helper.crud(input)` | Record a CRUD operation | `input: CrudAuditInput` Required action (create, read, update, or delete) and resource. Optional resourceId, details, userId, ip, ua and [event fields](#audit-event-fields) | `void` | `await audit.helper.crud(event)` |

<a id="audit-event-fields"></a>

**Event, context, and capture fields**

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `CreateAuditLogInput.action / resource` | `string` | Required | Action and resource type, such as update and orders. |
| `CreateAuditLogInput.userId / resourceId` | `string \| null` | Optional | Actor and affected resource identifiers. A system event can have no user. |
| `CreateAuditLogInput.details` | `Record<string, unknown> \| null` | Optional | JSON details to persist, redacted before writing. |
| `category` | `'system' \| 'business' \| null` | Optional | Event category. AuditContext can also supply the default for the current operation. |
| `outcome` | `'success' \| 'failure' \| 'denied' \| null` | Optional | Record the outcome of the operation. |
| `severity` | `'info' \| 'warning' \| 'error' \| 'critical' \| null` | Optional | Mark event severity. |
| `requestId / traceId / scopeId` | `string` | Optional | Trusted request, trace, and scope IDs in the event or context. Event inputs also accept null. |
| `ipAddress / userAgent` | `string` | Optional | Trusted client address and User-Agent. Event inputs also accept null. |
| `actorSnapshot / AuditContext.actor` | `AuditActorSnapshot \| null` | Optional | Capture the actor’s identity at event time. The object requires id and can include username, displayName, and roles. |
| `capture.options.read` | `boolean` | `false` | Mark a read. If read capture is disabled, successful reads are skipped, while failures and denials can still be recorded. |
| `capture.options.tx` | `DmlWithTxOperations` | Optional | Use the business transaction so its audit write can roll back with the business operation. |

With automatic capture enabled but read capture disabled, `{ read: true }` skips the write for `outcome: "success"` and records it for `outcome: "denied"`.

#### Scenario: Record actions and identity

If business data must never commit without an audit event, explicitly use the same RelDB transaction and inspect audit.log.

![Required audit: commit business data and event together](../images/function-audit-transaction.en.svg)

Both business writes and audit.log(input, tx) use tx; a failed step makes the caller abort and roll back. Automatic HTTP capture reports failure without undoing completed business work. Record a rollback failure event after the original transaction finishes rolling back.

```ts
// Fragment inside an async application function; return failed results to its caller.
// Save an explicit login using the user, action, and resource. Success returns the record with ID and creation time. Return the failed result on failure.
const savedResult = await audit.log({ userId: 'demo-user', action: 'login', resource: 'auth' })
if (!savedResult.success)
  return savedResult
const saved = savedResult.data
// saved includes its generated id and createdAt
// Pass safe read-event fields for demo-user and orders to automatic capture. Writing or skipping returns no data. Return the failed result on failure.
const captureResult = await audit.capture({ userId: 'demo-user', action: 'read', resource: 'orders' })
if (!captureResult.success)
  return captureResult
// Bind the trusted actor ID to the async operation. Return the event ID produced by the callback and propagate its errors.
const id = await audit.withContext({ actor: { id: 'demo-user' } }, async () => {
  // Write an orders update with the actor inherited from context. Success returns the saved record; write failure ends this callback below.
  const recordResult = await audit.log({ action: 'update', resource: 'orders' })
  // withContext returns ordinary callback data; throw here so a write failure is not mistaken for a saved record.
  if (!recordResult.success)
    throw new Error(recordResult.error.message, { cause: recordResult.error })
  const record = recordResult.data
  return record.id
}) // id is the callback's returned record id
// Record registration for demo-user. Success has no data; return the original failed result on failure.
const registerResult = await audit.helper.register('demo-user')
if (!registerResult.success)
  return registerResult
// Record a login for demo-user. Success has no data; return the original failed result on failure.
const loginResult = await audit.helper.login('demo-user')
if (!loginResult.success)
  return loginResult
// Record logout for demo-user. Success has no data; return the original failed result on failure.
const logoutResult = await audit.helper.logout('demo-user')
if (!logoutResult.success)
  return logoutResult
// Record a password reset request for the sample email. Success has no data; return the original failed result on failure.
const passwordResetRequestResult = await audit.helper.passwordResetRequest('demo@example.com')
if (!passwordResetRequestResult.success)
  return passwordResetRequestResult
// Record a completed reset for demo-user. Success has no data; return the original failed result on failure.
const passwordResetCompleteResult = await audit.helper.passwordResetComplete('demo-user')
if (!passwordResetCompleteResult.success)
  return passwordResetCompleteResult
// helper calls succeed with undefined; query their saved events using audit.list
```

The application supplies authenticated IDs; these IDs are fictional. log returns the saved record, capture and helpers have no business data, and withContext preserves the callback result. A CRUD example follows.

[Detailed parameters and workflows](audit.md#events)

#### Scenario: Record an order update

Pass a trusted actor, resource name and order ID. Success has no business data; audit.list can read the saved event.

```ts
// Fragment inside an async application function; return failed results to its caller.
// Record demo-user updating order-42 in orders. Success has no data. Return the failed result on failure.
const crudResult = await audit.helper.crud({
  userId: 'demo-user', action: 'update', resource: 'orders', resourceId: 'order-42',
})
if (!crudResult.success)
  return crudResult
```

<a id="queries"></a>

### Query and clean old records: `audit`

Investigate by user, action and time, then clean records according to retention policy.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `audit.list(options?)` | Filter and paginate events | Optional `options: ListAuditLogsOptions`. See [filter and pagination fields](#audit-list-options). | `PaginatedResult<AuditLogWithUser>` | `await audit.list({ page: 1, pageSize: 20 })` |
| `audit.getUserRecent(userId, limit?)` | Read recent user activity | Required `userId: string` selects the user. Optional `limit: number` defaults to 10 results. | `AuditLog[]` | `await audit.getUserRecent(userId, 10)` |
| `audit.getStats(days?, filters?)` | Aggregate operations over recent days | Optional `days: number` defaults to seven days. Optional `filters` takes category, outcome, severity, scopeId, userId, and resource from the [list fields](#audit-list-options). | `AuditStatItem[]` | `await audit.getStats(7)` |
| `audit.countByOutcome` | Count outcomes using the list filters | `options?`, all records by default | `AuditOutcomeCounts` | `await audit.countByOutcome({ action: 'login' })` |
| `audit.cleanup(olderThanDays?)` | Delete old events under the retention policy | `olderThanDays?: number` Defaults to 90 days. Deletes events older than the cutoff | `number` | `await audit.cleanup(90)` |

<a id="audit-list-options"></a>

**ListAuditLogsOptions**

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `requestId / traceId / scopeId` | `string` | Optional | Match the request, trace, or business scope exactly. |
| `userId / action / resource` | `string` | Optional | Match the event user, action, or resource type exactly. |
| `category` | `'system' \| 'business'` | Optional | Select system or business events. |
| `outcome` | `'success' \| 'failure' \| 'denied'` | Optional | Retain only the specified outcome. |
| `severity` | `'info' \| 'warning' \| 'error' \| 'critical'` | Optional | Retain only the specified severity. |
| `startDate / endDate` | `Date` | Optional | Inclusive event timestamps. If both are supplied, start must not be after end. |
| `sortBy` | `'createdAt' \| 'action' \| 'resource' \| 'category' \| 'outcome' \| 'severity'` | `createdAt` | Select the sort key. |
| `sortDirection` | `'asc' \| 'desc'` | `desc` | Set the sort direction. |
| `page / pageSize` | `number` | Page 1, 20 rows | Set the page and rows per page. |

For example, `{ resource: "orders", outcome: "denied", sortDirection: "asc", pageSize: 5 }` returns only denied order events, oldest first, with at most five on page one.

#### Scenario: Query and clean old records

```ts
// Fragment inside an async application function; return failed results to its caller.
// Filter login events and read up to 20 from page 1. The result has items and totals; query return the original failed result on failure.
const pageResult = await audit.list({ action: 'login', page: 1, pageSize: 20 })
if (!pageResult.success)
  return pageResult
const page = pageResult.data // items, total, pagination
// Apply the same login filter as the list and count each outcome, including unclassified records. Return the original error on failure.
const outcomesResult = await audit.countByOutcome({ action: 'login' })
if (!outcomesResult.success)
  return outcomesResult
const outcomes = outcomesResult.data
// Read up to 20 recent records for the user ID. The result is an array; query return the original failed result on failure.
const recentResult = await audit.getUserRecent('demo-user', 20)
if (!recentResult.success)
  return recentResult
const recent = recentResult.data // up to 20 AuditLog records
// Aggregate the last seven days by action. The result is grouped counts; return the original failed result on failure.
const statsResult = await audit.getStats(7)
if (!statsResult.success)
  return statsResult
const stats = statsResult.data // action statistics for the last seven days
// Keep 90 days of records and return the number deleted. Cleanup return the original failed result on failure.
const removedResult = await audit.cleanup(90)
if (!removedResult.success)
  return removedResult
const removed = removedResult.data // count of records older than 90 days
```

Results depend on saved history. Empty pages, empty statistics and zero deletions can all be successful. Run destructive cleanup examples only in a test database.

[Detailed parameters and workflows](audit.md#queries)

<a id="backups"></a>

### Archive and verify backups: `audit.backup`

Archive history to private object storage and verify it before applying retention to the source.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `audit.backup.run(options?)` | Create or verify a private archive | Optional `options: AuditBackupOptions` sets the ID and scanned interval. See [backup fields](#audit-backup-options). | `AuditBackupInfo` | `await audit.backup.run()` |
| `audit.backup.verify(key, options?)` | Verify archive format and checksum | Required `key: string` comes from the private backup receipt. Optional `options.signal: AbortSignal` cancels verification. | `AuditBackupInfo` | `await audit.backup.verify(backupKey)` |

<a id="audit-backup-options"></a>

**Backup and verification options**

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `AuditBackupOptions.id` | `string` | Random UUID | Use a stable ID for the same archival run. A matching existing archive is checked and reused. A conflict fails. |
| `AuditBackupOptions.from` | `Date` | No lower bound | Start of the archived interval. |
| `AuditBackupOptions.to` | `Date` | Database clock at archive start | Cannot be after archive start or before from. |
| `signal` | `AbortSignal` | Optional | Both run and verify accept cancellation. |

Retry the same archive using the same `{ id: "daily-audit", from, to }`. If complete, it returns a receipt for the same object key.

#### Scenario: Archive and verify backups

Below, run takes archive filters and returns AuditBackupInfo. Pass its object key to verify for checked archive information; the archive is not a public download.

[Detailed parameters and workflows](audit.md#backups)

#### Scenario: Create and verify an archive

Initialize with private Storage and backup enabled. Supply an archive ID and range, then pass the returned key to verify. The second result describes the verified archive.

```ts
// Fragment inside an async application function; return failed results to its caller.
// Pass the archive ID and UTC interval. Success returns the private archive key and manifest information; return the original failed result on failure.
const archiveResult = await audit.backup.run({
  id: 'demo-login-archive',
  from: new Date('2026-01-01T00:00:00Z'),
  to: new Date('2026-01-02T00:00:00Z'),
})
if (!archiveResult.success)
  return archiveResult
const archive = archiveResult.data
// Verify the archive using archive.key from the prior step. Success returns verified archive information; corruption or read return the original failed result on failure.
const verifiedArchiveResult = await audit.backup.verify(archive.key)
if (!verifiedArchiveResult.success)
  return verifiedArchiveResult
const verifiedArchive = verifiedArchiveResult.data
// verifiedArchive identifies the same private archive; its contents passed verification.
```

<a id="alerts"></a>

### Check anomalies and notify: `audit.checkAlerts`

Check rules that currently meet their thresholds; use Scheduler for recurring checks.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `audit.checkAlerts(options?)` | Evaluate thresholds and attempt notifications | `options?: { signal?: AbortSignal }` Optionally cancel the check or notification. Omit to use the configured behavior | `AuditAlertReport` | `await audit.checkAlerts()` |

#### Scenario: Check anomalies and notify

```ts
// Fragment inside an async application function; return failed results to its caller.
// Check configured windows without arguments. The report counts submitted, queued, and failed notifications. Check return the original failed result on failure.
const reportResult = await audit.checkAlerts()
if (!reportResult.success)
  return reportResult
const report = reportResult.data // AuditAlertReport for this check
```

With no arguments, current rules apply. The report describes this check and notification attempts; inspect actual outcomes rather than assuming delivery.

Reach API receivers can deduplicate alerts by `extra.alertId` in the JSON payload. It matches `resourceId` in the corresponding audit events.

[Detailed parameters and workflows](audit.md#alerts)
