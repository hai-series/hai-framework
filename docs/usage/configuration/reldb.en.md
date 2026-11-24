# @h-ai/reldb Configuration

<!-- translation: partial -->

[Chinese source](reldb.md) · [Data structures](../data/reldb.en.md) · [API reference](../function/reldb.en.md)

## Configuration entry

Load database settings before `reldb.init()`. SQLite supports local databases; choose PostgreSQL or MySQL with a shared server for multi-instance workloads.

## Configuration reference


| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `type`, `database` | Required | Choose `sqlite`, `postgresql` or `mysql`, and the SQLite file or database name. |
| `sqlite.walMode`, `readonly`, `executor`, `workerConnectTimeoutMs` | See backend | Set write-ahead logging, connection permissions, execution strategy and worker startup deadline. |
| `url`, `host`, `port`, `user`, `password` | See backend | Use the connection URL or backend-specific connection fields. Keep passwords on the server. |
| `ssl` | See backend | Configure TLS by driver and certificate verification requirements. |
| `pool.min`, `max`, `idleTimeout`, `acquireTimeout` | See backend | Set pool size, idle timeout and connection acquisition deadline. |
| `operationLog.read`, `write`, `maxLength`, `level` | See backend | Select operations to record, output length and log level. |

Still untranslated: provider-specific TLS, pools, SQLite workers and operation logging. Read the [Chinese source section](reldb.md#configuration-fields).

## Configuration examples

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: sqlite
database: ./data/orders.db
```

### Share a PostgreSQL database

Put this in `config/_db.yml`. Each service process uses at most ten connections and waits at most five seconds to acquire one. Load the password from the private server environment. Services share data only when they use the same database.

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: postgresql
host: postgres.internal
port: 5432
database: orders
user: orders_app
password: ${HAI_DB_PASSWORD}
pool:
  max: 10
  acquireTimeout: 5000
```

### Connect to an existing MySQL database

Create the database and account first. With no `url`, the connection uses the separate host, port and database fields. After startup, read and write a test record to check permissions. A successful connection does not prove that the account can create tables.

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: mysql
host: mysql.internal
port: 3306
database: orders
user: orders_app
password: ${HAI_DB_PASSWORD}
```

### Run SQLite queries in a worker

Use this when synchronous SQLite work should run outside the main thread. The database is still one local file, not a remote database. Its directory must be writable. Opening the worker connection has a ten-second timeout.

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: sqlite
database: ./data/orders.db
sqlite:
  executor: worker
  workerConnectTimeoutMs: 10000
```
