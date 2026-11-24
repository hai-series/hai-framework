# @h-ai/reldb Configuration

[简体中文](reldb.md) · [日本語](reldb.ja.md)

[Configuration index](README.en.md) · [Data structures](../data/reldb.en.md) · [API reference](../function/reldb.en.md)

## Configuration entry

Generated projects use `config/_db.yml`. At startup, the application loads and validates `db` through `core.config` and passes it to `reldb.init()`. The server environment can override corresponding YAML values through `HAI_DB_*`. For example, `HAI_DB_POOL_MAX` overrides `pool.max`. See [configuration sources and precedence (Chinese)](runtime.md#配置从哪里来).

Wait for a successful database connection before starting modules that need it, such as IAM and Audit. An SQLite database at `database: ":memory:"` lasts until its connection closes. Use PostgreSQL or MySQL in production. Processes that share business records must connect to the same database.

<a id="configuration-fields"></a>

## Configuration reference

The required string field `type` accepts `sqlite`, `postgresql`, or `mysql`. Use the fields for the selected database. Operation logging applies to all three.

### SQLite

| Field | Type | Requirement or default | Meaning |
| --- | --- | --- | --- |
| `database` | Nonempty string | Required | A database file or `:memory:`. File paths are relative to the application process's working directory. |
| `sqlite` | Object | Optional | File access and execution options. The following defaults apply when the object is omitted. |
| `sqlite.walMode` | Boolean | `true` | Try to enable write-ahead logging at startup to improve concurrent reads and writes on a local file. |
| `sqlite.readonly` | Boolean | `false` | Open an existing database file for reads only. |
| `sqlite.executor` | `"sync"` or `"worker"` | `"sync"` | `sync` runs operations on the main thread. With `worker`, a dedicated thread holds the connection and runs operations. |
| `sqlite.workerConnectTimeoutMs` | Positive integer | `10000` | Maximum time in milliseconds for the worker to start and open the connection. |

### PostgreSQL

| Field | Type | Requirement or default | Meaning |
| --- | --- | --- | --- |
| `database` | String | Required | Database name. The schema requires this field even when `url` is set. |
| `url` | String | Optional | PostgreSQL connection string. The connection parameters parsed from this string by `pg` take precedence over separate fields. |
| `host` | String | `"localhost"` | Hostname or address. |
| `port` | Integer from 1 to 65535 | Optional | The driver uses `PGPORT` or the default port `5432`. |
| `user` | String | Optional | Database username. |
| `password` | String | Optional | Database password. Supply it through the private server environment. |
| `ssl` | Boolean, `"require"`, `"prefer"`, `"allow"`, `"disable"`, or object | Optional | TLS setting passed to `pg`. TLS options in the URL can override this field. |
| `pool` | Object | Optional | When an object is present, RelDB fills in the defaults below. Without the object, the pool holds at most 10 connections, retains a minimum of 0, reclaims idle connections after 10 seconds, and uses no acquisition timeout. |
| `pool.min` | Nonnegative integer | `1` | Minimum number of established connections to retain. The pool opens connections on demand. |
| `pool.max` | Positive integer | `10` | Maximum connections per pool. |
| `pool.idleTimeout` | Nonnegative integer | `30000` | Idle timeout in milliseconds. `0` disables idle cleanup. |
| `pool.acquireTimeout` | Nonnegative integer | `10000` | Connection acquisition timeout in milliseconds. `0` disables the pool acquisition timeout. |

### MySQL

| Field | Type | Requirement or default | Meaning |
| --- | --- | --- | --- |
| `url` | String | Optional | A nonempty URL uses `mysql://` and may contain neither query parameters nor a fragment. The URL supplies the host, port, database, and credentials. An empty string is treated as omitted. |
| `database` | Nonempty string | Required without a URL | Database name. Omit this field when the URL names the intended database. |
| `host` | String | `"localhost"` | Hostname or address when using separate fields. |
| `port` | Integer from 1 to 65535 | `3306` (driver default) | Port when using separate fields. |
| `user` | String | Optional | Username when using separate fields. |
| `password` | String | Optional | Password when using separate fields. Supply it through the private server environment. |
| `ssl` | `false` or object | Optional | TLS is off when omitted or set to `false`. An empty object enables TLS and verifies the certificate chain and DNS hostname. The target must use a DNS hostname when both checks are enabled. |
| `ssl.rejectUnauthorized` | Boolean | `true` | Verify the certificate chain when TLS is configured as an object. |
| `ssl.verifyIdentity` | Boolean | `true` | Verify the DNS hostname when certificate chain verification is enabled. |
| `ssl.ca` | Nonempty string | Optional | Trusted CA in PEM format. Node.js uses its trust store if omitted. |
| `ssl.cert` | Nonempty string | Optional | Client certificate in PEM format. Supply it with `ssl.key`. |
| `ssl.key` | Nonempty string | Optional | Client private key in PEM format. Supply it with `ssl.cert`. |
| `pool` | Object | Optional | Supports the three fields below. The listed defaults apply even if the object is omitted. |
| `pool.max` | Positive integer | `10` | Maximum connections per pool. |
| `pool.acquireTimeout` | Integer from 1 to 2147483647 | `10000` | Time limit in milliseconds for queuing and acquiring a connection. SQL execution takes place after acquisition. |
| `pool.queueLimit` | Positive integer | `1000` | Maximum requests waiting for a connection. |
| `mysql` | Object | Optional | MySQL driver options. |
| `mysql.charset` | String | `"utf8mb4"` | Connection character set. |

### Operation logging

| Field | Type | Requirement or default | Meaning |
| --- | --- | --- | --- |
| `operationLog` | Object | Optional | Omit it to disable the normal-operation summaries below. |
| `operationLog.read` | Boolean | `false` | Summarize multi-row queries, single-row queries, and paginated queries. |
| `operationLog.write` | Boolean | `false` | Summarize schema changes, writes, batches, and transaction operations. |
| `operationLog.maxLength` | Nonnegative integer | `1000` | Character limit for the summary of counts. `0` omits that summary. It contains no SQL text or bound values. |
| `operationLog.level` | `"info"`, `"debug"`, or `"trace"` | `"debug"` | Log level for normal-operation summaries. |

## Configuration examples

Each example goes in `config/_db.yml`. For local order storage, place the SQLite file in a writable `data` directory. After a successful startup, write and read a test order to confirm that the application uses the intended file.

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: sqlite
database: ./data/orders.db
```

### Share a PostgreSQL database

Point each service at the `orders` database on `postgres.internal` and provide `HAI_DB_PASSWORD` through the private server environment. Each process can use up to 10 connections and wait up to five seconds to acquire one. Write a test order from one service and read it from another to verify that they share the database.

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

Have the database administrator create the `orders` database and its account first. This example sets the connection fields individually and reads the password from the private server environment.

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: mysql
host: mysql.internal
port: 3306
database: orders
user: orders_app
password: ${HAI_DB_PASSWORD}
```

If your deployment supplies a connection string, use the form below. The example URL shows only the host, port, database, and username. When a password is required, inject the full URL with credentials through the private `HAI_DB_URL` environment variable. After startup, read and write a test record in the intended database to verify the account's application permissions.

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: mysql
url: mysql://orders_app@mysql.internal:3306/orders
```

### Run SQLite queries in a worker

Move synchronous SQLite work to a dedicated thread when local queries take time. The database stays at the same path, and the application needs read and write access to its directory. This example gives the worker ten seconds to start and open the database. Check for `executor: worker` in the startup log and read back an existing record.

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: sqlite
database: ./data/orders.db
sqlite:
  executor: worker
  workerConnectTimeoutMs: 10000
```

### Apply and verify changes

Restart the application after changing the YAML or environment so that startup passes the new settings to `reldb.init()`. Check the initialization result, then verify the connection target, account permissions, and TLS mode. Records remain in their original database after a connection change. Migrate them separately when needed. [Database types and addresses (Chinese)](data.md#数据库类型与地址)
