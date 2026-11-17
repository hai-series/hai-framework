# @h-ai/audit API reference

<!-- translation: partial -->

[Chinese source](audit.md) · [Configuration](../configuration/audit.en.md) · [Data structures](../data/audit.en.md)

<a id="quick-start"></a>

Initialize Audit on the server. Pass trusted actor, request and resource identifiers in the context. Write explicit entries for caller-defined events and use capture around business operations.

<a id="api-reference"></a>

| API | Input and result | Example |
| --- | --- | --- |
| `audit.log`, `capture`, `withContext` | Record one event, observe an operation, or bind context for nested work. | `await audit.log(entry)` |
| `audit.list`, `getUserRecent`, `getStats`, `cleanup` | Query audit entries and statistics, or clean up permitted records. | `await audit.getUserRecent(userId)` |
| `audit.helper.login`, `logout`, `register`, `passwordResetRequest`, `passwordResetComplete`, `crud` | Create audit records for authentication and common business operations. | `audit.helper.crud(event)` |
| `audit.backup.run`, `backup.verify`, `checkAlerts` | Run or verify a backup, or evaluate notification rules. | `await audit.checkAlerts()` |

Additional options and workflow examples are available in the [Chinese reference](audit.md).
