# @h-ai/audit API reference

<!-- translation: partial -->

[Chinese source](audit.md) · [Configuration](../configuration/audit.en.md) · [Data structures](../data/audit.en.md)

<a id="quick-start"></a>

## Quick start

Initialize Audit on the server. Pass trusted actor, request and resource identifiers in the context. Write explicit entries for caller-defined events and use capture around business operations.

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

<a id="api-reference"></a>

## API list

| API | Input and result | Example |
| --- | --- | --- |
| `audit.log`, `capture`, `withContext` | Record one event, observe an operation, or bind context for nested work. | `await audit.log(entry)` |
| `audit.list`, `getUserRecent`, `getStats`, `cleanup` | Query audit entries and statistics, or clean up permitted records. | `await audit.getUserRecent(userId)` |
| `audit.helper.login`, `logout`, `register`, `passwordResetRequest`, `passwordResetComplete`, `crud` | Create audit records for authentication and common business operations. | `audit.helper.crud(event)` |
| `audit.backup.run`, `backup.verify`, `checkAlerts` | Run or verify a backup, or evaluate notification rules. | `await audit.checkAlerts()` |

Additional options and workflow examples are available in the [Chinese reference](audit.md).
