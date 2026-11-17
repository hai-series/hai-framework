# @h-ai/audit API reference

<!-- translation: partial -->

[Chinese source](audit.md) · [Configuration](../configuration/audit.en.md) · [Data structures](../data/audit.en.md)

<a id="quick-start"></a>

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

<a id="api-reference"></a>

## API list

Outputs are successful HaiResult.data, except withContext, which returns exactly what its callback returns.

| API | Purpose | Inputs and defaults | Output | Example |
| --- | --- | --- | --- | --- |
| `audit.init` | Prepare audit tables using initialized RelDB | `config?` | `void` | `await audit.init()` |
| `audit.close` | Release the module without closing borrowed services | None | `void` | `await audit.close()` |
| `audit.log` | Write an event, optionally in the caller’s transaction | `input, tx?` | `AuditLog` | `await audit.log(event)` |
| `audit.capture` | Write only if the automatic capture policy permits it | `input, options?` | `void` | `await audit.capture(event)` |
| `audit.withContext` | Run with the trusted audit context and return the callback’s result | `context, operation` | `T` | `audit.withContext(trustedContext, () => saveOrder())` |
| `audit.list` | Read a filtered page with user information | `options?` | `PaginatedResult<AuditLogWithUser>` | `await audit.list({ page: 1, pageSize: 20 })` |
| `audit.getUserRecent` | Read a user’s recent activity | `userId, limit?` | `AuditLog[]` | `await audit.getUserRecent(userId, 10)` |
| `audit.getStats` | Summarize recent audit activity | `days?, filters?` | `AuditStatItem[]` | `await audit.getStats(7)` |
| `audit.cleanup` | Delete records allowed by the retention policy | `olderThanDays?` | `number` | `await audit.cleanup(90)` |
| `audit.checkAlerts` | Evaluate configured alert windows and claim deliveries | `{ signal? }?` | `AuditAlertReport` | `await audit.checkAlerts()` |
| `audit.backup.run` | Write an audit backup to private Storage | `options?` | `AuditBackupInfo` | `await audit.backup.run()` |
| `audit.backup.verify` | Verify the stored JSON Lines backup | `key, { signal? }?` | `AuditBackupInfo` | `await audit.backup.verify(backupKey)` |
| `audit.helper.login` | Record a login | `userId, ip?, ua?` | `void` | `await audit.helper.login(userId)` |
| `audit.helper.logout` | Record a logout | `userId, ip?, ua?` | `void` | `await audit.helper.logout(userId)` |
| `audit.helper.register` | Record a registration | `userId, ip?, ua?` | `void` | `await audit.helper.register(userId)` |
| `audit.helper.passwordResetRequest` | Record a reset request | `email, ip?, ua?` | `void` | `await audit.helper.passwordResetRequest(email)` |
| `audit.helper.passwordResetComplete` | Record completion of a reset | `userId, ip?, ua?` | `void` | `await audit.helper.passwordResetComplete(userId)` |
| `audit.helper.crud` | Record a business data operation | `input` | `void` | `await audit.helper.crud(event)` |

Pass a transaction to audit.log when the audit record must commit with a business change. A backup is not itself a deletion.

Still untranslated: the retention, alert scheduling and backup examples. Read the [Chinese source section](audit.md#api-reference).
