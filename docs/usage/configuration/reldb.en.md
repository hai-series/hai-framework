# @h-ai/reldb Configuration

<!-- translation: partial -->

[Chinese source](reldb.md) · [Data structures](../data/reldb.en.md) · [API reference](../function/reldb.en.md)

Load database settings before `reldb.init()`. SQLite supports local databases; choose PostgreSQL or MySQL with a shared server for multi-instance workloads.

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: sqlite
database: ./data/orders.db
```

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `type`, `database` | Required | Choose `sqlite`, `postgresql` or `mysql`, and the SQLite file or database name. |
| `sqlite.walMode`, `readonly`, `executor`, `workerConnectTimeoutMs` | See backend | Set write-ahead logging, connection permissions, execution strategy and worker startup deadline. |
| `url`, `host`, `port`, `user`, `password` | See backend | Use the connection URL or backend-specific connection fields. Keep passwords on the server. |
| `ssl` | See backend | Configure TLS by driver and certificate verification requirements. |
| `pool.min`, `max`, `idleTimeout`, `acquireTimeout` | See backend | Set pool size, idle timeout and connection acquisition deadline. |
| `operationLog.read`, `write`, `maxLength`, `level` | See backend | Select operations to record, output length and log level. |

Still untranslated: provider-specific TLS, pools, SQLite workers and operation logging. Read the [Chinese source section](reldb.md#configuration-fields).
