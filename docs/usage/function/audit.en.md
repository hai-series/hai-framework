# @h-ai/audit API reference

<!-- translation: partial -->

[Chinese source](audit.md) · [Configuration](../configuration/audit.en.md) · [Data structures](../data/audit.en.md)

## Quick start

Initialize Audit on the server. Pass trusted actor, request and resource identifiers in the context. Write explicit entries for caller-defined events and use capture around business operations.

This example uses an in-memory SQLite database. Initialize RelDB, then Audit. Record a login and query for that action; `logs.items` contains the entry you just wrote. When the example finishes, close Audit before RelDB. Run it in a development environment (for example, `NODE_ENV=development`). Production mode requires a database shared across nodes.

```ts
import type { HaiResult } from '@h-ai/core'
import { audit } from '@h-ai/audit'
import { reldb } from '@h-ai/reldb'

function dataOrThrow<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

dataOrThrow(await reldb.init({ type: 'sqlite', database: ':memory:' }))

try {
  dataOrThrow(await audit.init())
  try {
    const saved = dataOrThrow(await audit.log({ userId: 'demo-user', action: 'login', resource: 'auth' }))
    const logs = dataOrThrow(await audit.list({ action: 'login', pageSize: 20 }))
    // 新数据库中，查询到的第一条记录就是刚写入的那条。
    if (logs.items[0]?.id !== saved.id)
      throw new Error('Expected the new login event')
  }
  finally {
    dataOrThrow(await audit.close())
  }
}
finally {
  dataOrThrow(await reldb.close())
}
```

<a id="api-list"></a>

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Import the module as in the quick start. Except for lifecycle examples, run scenarios after initialization and before closure. The value helper checks HaiResult.success and preserves the original error. Use isolated test data and explicit cleanup.

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="lifecycle"></a>

### Prepare audit services: `audit`

Connect RelDB before Audit and close them in reverse order.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `audit.init` | Prepare audit tables using initialized RelDB | `config?` | `void` | `await audit.init()` |
| `audit.close` | Release the module without closing borrowed services | None | `void` | `await audit.close()` |
| `audit.isInitialized` | Check whether audit is ready | Read-only property; no arguments | `boolean` | `audit.isInitialized` |

#### Scenario: Prepare audit services

```ts
value(await audit.init()) // undefined; audit tables are ready
audit.isInitialized // true
value(await audit.close()) // undefined; the borrowed RelDB remains open
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
| `audit.log` | Save an explicit audit event | `input, tx?` | `AuditLog` | `await audit.log(event)` |
| `audit.capture` | Capture according to the configured policy | `input, options?` | `void` | `await audit.capture(event)` |
| `audit.withContext` | Bind trusted actor and request context | `context, operation` | `T` | `audit.withContext(trustedContext, () => saveOrder())` |
| `audit.helper.login` | Record a login | `userId, ip?, ua?` | `void` | `await audit.helper.login(userId)` |
| `audit.helper.logout` | Record a logout | `userId, ip?, ua?` | `void` | `await audit.helper.logout(userId)` |
| `audit.helper.register` | Record registration | `userId, ip?, ua?` | `void` | `await audit.helper.register(userId)` |
| `audit.helper.passwordResetRequest` | Record a password reset request | `email, ip?, ua?` | `void` | `await audit.helper.passwordResetRequest(email)` |
| `audit.helper.passwordResetComplete` | Record a completed password reset | `userId, ip?, ua?` | `void` | `await audit.helper.passwordResetComplete(userId)` |
| `audit.helper.crud` | Record a CRUD operation | `input` | `void` | `await audit.helper.crud(event)` |

#### Scenario: Record actions and identity

```ts
const saved = value(await audit.log({ userId: 'demo-user', action: 'login', resource: 'auth' }))
// saved includes its generated id and createdAt
value(await audit.capture({ userId: 'demo-user', action: 'read', resource: 'orders' })) // undefined
const id = await audit.withContext({ actor: { id: 'demo-user' } }, async () => {
  const record = value(await audit.log({ action: 'update', resource: 'orders' }))
  return record.id
}) // id is the callback's returned record id
value(await audit.helper.register('demo-user'))
value(await audit.helper.login('demo-user'))
value(await audit.helper.logout('demo-user'))
value(await audit.helper.passwordResetRequest('demo@example.com'))
value(await audit.helper.passwordResetComplete('demo-user'))
// helper calls succeed with undefined; query their saved events using audit.list
```

The application supplies authenticated IDs; these IDs are fictional. log returns the saved record, capture and helpers have no business data, and withContext preserves the callback result. A CRUD example follows.

[Detailed parameters and workflows](audit.md#events)

#### Scenario: Record an order update

Pass a trusted actor, resource name and order ID. Success has no business data; audit.list can read the saved event.

```ts
value(await audit.helper.crud({
  userId: 'demo-user', action: 'update', resource: 'orders', resourceId: 'order-42',
})) // undefined
```

<a id="queries"></a>

### Query and clean old records: `audit`

Investigate by user, action and time, then clean records according to retention policy.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `audit.list` | Filter and paginate events | `options?` | `PaginatedResult<AuditLogWithUser>` | `await audit.list({ page: 1, pageSize: 20 })` |
| `audit.getUserRecent` | Read recent user activity | `userId, limit?` | `AuditLog[]` | `await audit.getUserRecent(userId, 10)` |
| `audit.getStats` | Aggregate operations over recent days | `days?, filters?` | `AuditStatItem[]` | `await audit.getStats(7)` |
| `audit.cleanup` | Delete old events under the retention policy | `olderThanDays?` | `number` | `await audit.cleanup(90)` |

#### Scenario: Query and clean old records

```ts
const page = value(await audit.list({ action: 'login', page: 1, pageSize: 20 })) // items, total, pagination
const recent = value(await audit.getUserRecent('demo-user', 20)) // up to 20 AuditLog records
const stats = value(await audit.getStats(7)) // action statistics for the last seven days
const removed = value(await audit.cleanup(90)) // count of records older than 90 days
```

Results depend on saved history. Empty pages, empty statistics and zero deletions can all be successful. Run destructive cleanup examples only in a test database.

[Detailed parameters and workflows](audit.md#queries)

<a id="backups"></a>

### Archive and verify backups: `audit.backup`

Archive history to private object storage and verify it before applying retention to the source.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `audit.backup.run` | Create or verify a private archive | `options?` | `AuditBackupInfo` | `await audit.backup.run()` |
| `audit.backup.verify` | Verify archive format and checksum | `key, { signal? }?` | `AuditBackupInfo` | `await audit.backup.verify(backupKey)` |

#### Scenario: Archive and verify backups

Below, run takes archive filters and returns AuditBackupInfo. Pass its object key to verify for checked archive information; the archive is not a public download.

[Detailed parameters and workflows](audit.md#backups)

#### Scenario: Create and verify an archive

Initialize with private Storage and backup enabled. Supply an archive ID and range, then pass the returned key to verify. The second result describes the verified archive.

```ts
const archive = value(await audit.backup.run({
  id: 'demo-login-archive',
  from: new Date('2026-01-01T00:00:00Z'),
  to: new Date('2026-01-02T00:00:00Z'),
}))
const verifiedArchive = value(await audit.backup.verify(archive.key))
// verifiedArchive identifies the same private archive; its contents passed verification.
```

<a id="alerts"></a>

### Check anomalies and notify: `audit.checkAlerts`

Check rules that currently meet their thresholds; use Scheduler for recurring checks.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `audit.checkAlerts` | Evaluate thresholds and attempt notifications | `{ signal? }?` | `AuditAlertReport` | `await audit.checkAlerts()` |

#### Scenario: Check anomalies and notify

```ts
const report = value(await audit.checkAlerts()) // AuditAlertReport for this check
```

With no arguments, current rules apply. The report describes this check and notification attempts; inspect actual outcomes rather than assuming delivery.

[Detailed parameters and workflows](audit.md#alerts)
