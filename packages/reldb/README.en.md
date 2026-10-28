# @h-ai/reldb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

## Introduction

A relational database module with a unified `reldb` object for SQLite, PostgreSQL, and MySQL.

Connections become available only after a successful health check. Failed initialization disposes its candidate; `error.ext.cleanupPending === true` identifies cleanup that still needs retry. `reldb.close()` returns `Promise<HaiResult<void>>`, waits for initialization, and coalesces concurrent close calls. Once cleanup starts, `isInitialized` is false and configuration/operations are unavailable. A failed cleanup retains the resource: the next `close()` or `init()` retries disposal before allocating a replacement. Always inspect the close result.

```ts
const closed = await reldb.close()
if (!closed.success) {
  // Retry once after addressing the cleanup failure; report another failure.
  const retried = await reldb.close()
  if (!retried.success)
    throw new Error(retried.error.message)
}
```

Close waits for borrowed transactions to commit/roll back and release their handles; applications must finish transactions for shutdown to complete. SQLite WAL setup and worker handshakes are part of the owned initialization chain. PostgreSQL removes disconnected idle clients and replaces them on later queries without terminating the process; logs contain safe error identifiers rather than raw driver errors.

## Core features

- Connect to SQLite, PostgreSQL and MySQL through one API.
- Run parameterized SQL, manage tables/indexes and read paginated results.
- Organize application reads and writes with transactions, CRUD and repositories.

## Getting started

### Quick start

```ts
import { HaiReldbError, reldb } from '@h-ai/reldb'

// 初始化
const initialized = await reldb.init({ type: 'sqlite', database: ':memory:' })
if (!initialized.success)
  throw new Error(initialized.error.message)

// DDL
await reldb.ddl.createTable('users', {
  id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
  name: { type: 'TEXT', notNull: true },
  email: { type: 'TEXT', unique: true },
})

// SQL
await reldb.sql.execute('INSERT INTO users (name, email) VALUES (?, ?)', ['张三', 'test@example.com'])
const users = await reldb.sql.query<{ id: number, name: string }>('SELECT * FROM users')

// 分页查询
const page = await reldb.sql.queryPage<{ id: number, name: string }>({
  sql: 'SELECT id, name FROM users ORDER BY id',
  pagination: { page: 1, pageSize: 20 },
})

// CRUD
const userCrud = reldb.crud.table({
  table: 'users',
  idColumn: 'id',
  select: ['id', 'name', 'email'],
  createColumns: ['name', 'email'],
  updateColumns: ['name', 'email'],
  dbType: 'sqlite',
})
await userCrud.create({ name: '李四', email: 'li@test.com' })
const user = await userCrud.findById(1)

// 关闭
await reldb.close()
```

`reldb.config` returns a **redacted configuration snapshot**. Database `password`, URL credentials and the TLS client private key `ssl.key` are hidden. Use it to inspect state, not to replay connection details.

### Configuration

`@h-ai/reldb/schemas` exports the same configuration schemas and types with only Zod, without loading the database singleton or drivers. CLI and browser code can validate configuration through this entry. MySQL TLS accepts `false` or a strict object; `{}` verifies the certificate chain and DNS identity by default. PostgreSQL retains its boolean, string mode and object contract.

```ts
import { ReldbConfigSchema } from '@h-ai/reldb/schemas'

const checked = ReldbConfigSchema.safeParse({ type: 'mysql', database: 'shop', ssl: {} })
if (!checked.success)
  throw new Error('Invalid database configuration')
// checked.data.ssl: { rejectUnauthorized: true, verifyIdentity: true }
```

Use either a connection string (`url`) or separate fields (`host/port/database/user/password`).

```ts
// SQLite
await reldb.init({ type: 'sqlite', database: './data.db' })

// PostgreSQL
await reldb.init({ type: 'postgresql', url: 'postgres://user:pass@localhost:5432/mydb', database: 'mydb' })

// MySQL
await reldb.init({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'mydb',
  user: 'admin',
  password: 'secret',
  mysql: { charset: 'utf8mb4' },
  pool: { max: 10, acquireTimeout: 5000, queueLimit: 100 },
})
```

#### Connection pools and MySQL URLs

MySQL `pool` accepts only `max`, `acquireTimeout` and `queueLimit`, defaulting to 10, 10000 milliseconds and 1000 even when omitted. Unsupported pool fields such as `min` and `idleTimeout`, and the unimplemented `mysql.timezone`, fail configuration validation. Idle connections remain subject to mysql2/server disconnection and `close()`; the module promises no MySQL minimum retention or configurable idle expiry. [mysql2 3.24.5 options](https://github.com/sidorares/node-mysql2/blob/v3.24.5/typings/mysql/lib/Pool.d.ts) differ from PostgreSQL.

| Field            | PostgreSQL (defaults when `pool` is provided)                 | MySQL                                               |
| ---------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| `max`            | 10                                                            | 10, counting borrowed and connecting slots together |
| `min`            | 1, retention floor for established connections; no prewarming | Unsupported; rejected                               |
| `idleTimeout`    | 30000 ms; 0 disables                                          | Unsupported; rejected                               |
| `acquireTimeout` | 10000 ms; 0 disables                                          | 10000 ms; integer from 1 to 2147483647              |
| `queueLimit`     | Unsupported                                                   | 1000; positive integer limiting queued requests     |

PostgreSQL uses pg defaults when `pool` is omitted; see [pg.Pool](https://node-postgres.com/apis/pool) for retention semantics. All MySQL SQL, DDL, CRUD, batch and transaction entry points use a bounded FIFO acquisition queue. Waiting and establishment share one deadline: expiry returns `TIMEOUT`, and a full queue returns `POOL_EXHAUSTED`. Expired waiters are removed; late connections are released without executing SQL and retain their capacity slot until settled. The deadline is checked on delivery and before starting work. It does not limit SQL or transactions that have already started.

MySQL `close()` rejects new and queued requests immediately, then waits for borrowed connections, transactions and pending establishment before ending the pool. The driver uses the same value for `connectTimeout`; shutdown may wait for that timeout or existing work to finish. Applications must finish transactions. Environment variables use `HAI_DB_POOL_*`: `MIN` and `IDLETIMEOUT` apply only to PostgreSQL; MySQL `QUEUELIMIT` bounds queued requests.

MySQL accepts a `mysql://` URL without split connection fields; `database` is required without a URL. URL host/port/database/user/password take precedence over conflicting split fields. `pool`, `mysql.charset`, `ssl` and `operationLog` remain independent options. Query strings and fragments are rejected, so hidden URL parameters cannot change TLS or pool policy. Connection logs sanitize URLs. This example assumes `HAI_DB_URL` is set:

```ts
const initialized = await reldb.init({ type: 'mysql', url: process.env.HAI_DB_URL, pool: { max: 10, acquireTimeout: 5000, queueLimit: 100 } })
if (!initialized.success)
  throw new Error(initialized.error.message)
```

An empty MySQL `url` (including an empty environment placeholder) selects host/port/database/user/password; nonempty URLs remain strictly validated.

#### MySQL TLS

Omitting `ssl` or using `false` disables TLS. Enabling it requires a strict object; an empty object defaults to `{ rejectUnauthorized: true, verifyIdentity: true }`. `ca` contains trusted CA PEM text, or Node's trust store is used when omitted. Optional client `cert` and `key` must contain PEM text and be provided together. Unknown TLS fields, `true` and PostgreSQL string modes are rejected; arbitrary options and callbacks are not forwarded.

[mysql2 3.24.5 identity checks](https://github.com/sidorares/node-mysql2/blob/v3.24.5/lib/base/connection.js) depend on a DNS servername. With both certificate and identity checks enabled, IP targets return `CONFIG_ERROR`; use a hostname matching the certificate DNS SAN. Explicit `verifyIdentity: false` retains only chain verification. `rejectUnauthorized: false` abandons server authentication; encryption alone does not authenticate the server. Disabling either check emits a fixed risk warning and is not reported as a secure configuration.

```ts
// Supply trustedCaPem from deployment trust configuration, not an arbitrary peer certificate.
const initialized = await reldb.init({ type: 'mysql', host: 'db.example.com', database: 'app', ssl: { ca: trustedCaPem } })
if (!initialized.success)
  throw new Error(initialized.error.message)
```

TLS tests require OpenSSL (Git for Windows includes one) and local container port forwarding. Each run generates and removes its own CA/private keys and checks trusted DNS, wrong CA/hostname rejection, `REQUIRE X509` client authentication and actual session `Ssl_cipher`. Disabling verification is not accepted as proof of authenticated TLS.

#### SQLite execution (asynchronous worker)

better-sqlite3 is synchronous, so queries block Node's main event loop. WAL improves database lock concurrency but cannot remove this blocking. To offload it, opt in to a dedicated SQLite worker thread (single connection; defaults to `sync`):

```ts
await reldb.init({
  type: 'sqlite',
  database: './data.db',
  sqlite: {
    executor: 'worker', // 'sync'（默认）| 'worker'
    walMode: true, // 默认 true
    workerConnectTimeoutMs: 10000, // worker 打开连接超时，默认 10000
  },
})
```

In worker mode, queries, writes, and transactions run serially on the worker thread. Public APIs and return values remain identical to synchronous mode.

#### Operation logging

Enable SQL operation logs with `operationLog` in the database configuration. Logs are emitted at the DML layer of reldb provider-base, without duplicate wrappers in `reldb-main.ts` or raw providers.

```yaml
# config/_db.yml
type: sqlite
database: ./data/app.db
operationLog:
  read: false # query / get / queryPage
  write: false # DDL, execute / batch, tx.begin / tx.commit / tx.rollback
  maxLength: 1000 # maximum numeric summary length; 0 omits the summary, SQL text and values are never logged
  level: debug # info | debug | trace，默认 debug
```

When loading through `core.config.load('db', ...)`, convention-based variables such as `HAI_DB_TYPE`,
`HAI_DB_DATABASE`, and `HAI_DB_OPERATIONLOG_LEVEL` override YAML values.

```ts
await reldb.init({
  type: 'sqlite',
  database: './data.db',
  operationLog: {
    read: true,
    write: true,
    maxLength: 500,
    level: 'debug',
  },
})
```

Operation logs contain fixed operation names and SQL length, parameter count, and batch count. Failure logs also retain error codes, traceId, and allowlisted, sanitized driver messages and stacks for diagnosis. Full SQL, bound parameters, and connection configuration are not logged directly.

### Transactions

Three approaches:

#### wrap (automatic commit/rollback)

A normally returned transaction callback commits, even if it returns a failed HaiResult. Check every operation and throw on failure to trigger rollback; wrap returns TRANSACTION_FAILED. Use an explicit transaction below to preserve the original domain error. The examples assume successful initialization and an existing users table.

```ts
const result = await reldb.tx.wrap(async (tx) => {
  for (const name of ['Alice', 'Bob']) {
    const inserted = await tx.execute('INSERT INTO users (name) VALUES (?)', [name])
    if (!inserted.success)
      throw new Error(inserted.error.message, { cause: inserted.error })
  }
  return 'ok'
})
// 回调正常返回 → 自动提交；抛异常 → 自动回滚
```

#### begin + commit (explicit commit)

```ts
// 放在 async 业务函数内，失败时向调用方返回 HaiResult。
const txResult = await reldb.tx.begin()
if (!txResult.success)
  return txResult
const tx = txResult.data
try {
  for (const name of ['Alice', 'Bob']) {
    const inserted = await tx.execute('INSERT INTO users (name) VALUES (?)', [name])
    if (!inserted.success) {
      const rolledBack = await tx.rollback()
      return rolledBack.success ? inserted : rolledBack
    }
  }
  return await tx.commit()
}
catch (error) {
  const rolledBack = await tx.rollback()
  if (!rolledBack.success)
    return rolledBack
  throw error // 只传播非业务异常，由宿主边界处理。
}
```

#### begin + rollback (explicit rollback)

```ts
// 独立脚本：试写后回滚，不保留用户数据。
const txResult = await reldb.tx.begin()
if (!txResult.success)
  throw new Error(txResult.error.message, { cause: txResult.error })
const tx = txResult.data
// 两个 API 均返回 HaiResult；同时失败时保留执行和回滚两份原因。
const inserted = await tx.execute('INSERT INTO users (name) VALUES (?)', ['Alice'])
const rolledBack = await tx.rollback()
if (!inserted.success && !rolledBack.success)
  throw new AggregateError([inserted.error, rolledBack.error], rolledBack.error.message)
if (!inserted.success)
  throw new Error(inserted.error.message, { cause: inserted.error })
if (!rolledBack.success)
  throw new Error(rolledBack.error.message, { cause: rolledBack.error })
```

#### batch / queryPage inside transactions

```ts
await reldb.tx.wrap(async (tx) => {
  const inserted = await tx.batch([
    { sql: 'INSERT INTO users (name) VALUES (?)', params: ['Alice'] },
    { sql: 'INSERT INTO users (name) VALUES (?)', params: ['Bob'] },
  ])
  if (!inserted.success)
    throw new Error(inserted.error.message, { cause: inserted.error })

  const page = await tx.queryPage<{ id: number, name: string }>({
    sql: 'SELECT id, name FROM users ORDER BY id',
    pagination: { page: 1, pageSize: 10 },
  })
  if (!page.success)
    throw new Error(page.error.message, { cause: page.error })
  return page.data
})
```

### Crud

Create a single-table CRUD repository with `reldb.crud.table()`, without writing SQL:

```ts
const userCrud = reldb.crud.table<{ id: number, name: string, email: string }>({
  table: 'users',
  idColumn: 'id', // 主键列，默认 'id'
  select: ['id', 'name', 'email'], // 查询列，默认 '*'
  createColumns: ['name', 'email'], // 允许插入的列
  updateColumns: ['name', 'email'], // 允许更新的列
  dbType: 'sqlite', // 数据库类型
})
```

#### create / createMany

```ts
// 单条插入
const result = await userCrud.create({ name: '张三', email: 'test@example.com' })
// result.data → { changes: 1, lastInsertRowid: 1 }

// 批量插入
await userCrud.createMany([
  { name: '用户A', email: 'a@test.com' },
  { name: '用户B', email: 'b@test.com' },
])
```

#### createOrUpdate

Update when the primary key exists; otherwise create (upsert):

```ts
const userCrud = reldb.crud.table<{ id: number, name: string, email: string }>({
  table: 'users',
  idColumn: 'id',
  createColumns: ['id', 'name', 'email'],
  updateColumns: ['name', 'email'],
  dbType: 'sqlite',
})

await userCrud.createOrUpdate({ id: 1, name: '张三', email: 'test@example.com' })
// 不存在 → 插入；已存在 → 更新 name、email
```

`BaseReldbCrudRepository` obtains `dbType` automatically; no manual argument is needed.

#### findById / getById / findAll / findPage

```ts
// 主键查找（不存在时返回 null）
const user = await userCrud.findById(1)
// user.data → { id: 1, name: '张三', email: 'test@example.com' } | null

// 主键获取（不存在时返回 RECORD_NOT_FOUND 错误）
const user2 = await userCrud.getById(1)
// user2.data → { id: 1, name: '张三', email: 'test@example.com' }

// 条件查询（where + params 占位符）
const actives = await userCrud.findAll({
  where: 'name LIKE ?',
  params: ['%张%'],
  orderBy: 'id DESC',
  limit: 10,
  offset: 0,
})

// 分页查询
const page = await userCrud.findPage({
  where: 'name LIKE ?',
  params: ['%张%'],
  orderBy: 'id DESC',
  pagination: { page: 1, pageSize: 20 },
})
// page.data → { items: [...], total: 100, page: 1, pageSize: 20 }
```

#### updateById / deleteById

```ts
await userCrud.updateById(1, { name: '李四' })
await userCrud.deleteById(1)
```

#### count / exists / existsById

```ts
const total = await userCrud.count({ where: 'name LIKE ?', params: ['%张%'] })
// total.data → 5

const has = await userCrud.exists({ where: 'email = ?', params: ['test@example.com'] })
// has.data → true

const found = await userCrud.existsById(1)
// found.data → true
```

#### Crud inside transactions

All methods accept `tx` and automatically route operations to that transaction context:

```ts
await reldb.tx.wrap(async (tx) => {
  const created = await userCrud.create({ name: 'Alice', email: 'alice@example.com' }, tx)
  if (!created.success)
    throw new Error(created.error.message, { cause: created.error })
  if (created.data.lastInsertRowid === undefined)
    throw new Error('Insert did not return an ID')
  const updated = await userCrud.updateById(created.data.lastInsertRowid, { name: 'Alice Smith' }, tx)
  if (!updated.success)
    throw new Error(updated.error.message, { cause: updated.error })
  const user = await userCrud.findById(created.data.lastInsertRowid, tx)
  if (!user.success)
    throw new Error(user.error.message, { cause: user.error })
  return user.data
})
```

### BaseReldbCrudRepository

Business repositories extend `BaseReldbCrudRepository` and define field mappings with `fields` for automatic table creation and type conversion:

Use `BIGINT` for Unix milliseconds (64-bit INTEGER on SQLite, BIGINT on PostgreSQL/MySQL). A regular INTEGER on PostgreSQL/MySQL cannot hold current epoch milliseconds. Raw SQL/CRUD and base repository reads preserve driver BIGINT types: number/string/bigint. Business repositories requiring number must validate safe integers before conversion to avoid silent precision loss. The base repository reads TIMESTAMP fields as Date.

```ts
import type { DmlWithTxOperations, ReldbCrudFieldDefinition } from '@h-ai/reldb'
import { BaseReldbCrudRepository, reldb } from '@h-ai/reldb'

interface UserRow {
  id: number
  name: string
  email: string
  createdAt: Date
  updatedAt: Date
}

const USER_FIELDS: ReldbCrudFieldDefinition[] = [
  { fieldName: 'id', columnName: 'id', def: { type: 'INTEGER', primaryKey: true, autoIncrement: true }, select: true, create: false, update: false },
  { fieldName: 'name', columnName: 'name', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
  { fieldName: 'email', columnName: 'email', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
  { fieldName: 'createdAt', columnName: 'created_at', def: { type: 'TIMESTAMP', notNull: true }, select: true, create: true, update: false },
  { fieldName: 'updatedAt', columnName: 'updated_at', def: { type: 'TIMESTAMP', notNull: true }, select: true, create: true, update: false },
]

class UserRepository extends BaseReldbCrudRepository<UserRow> {
  constructor() {
    super(reldb, { table: 'users', idColumn: 'id', fields: USER_FIELDS })
  }

  /** 自定义查询方法 */
  async findByEmail(email: string) {
    return this.findAll({ where: 'email = ?', params: [email], limit: 1 })
  }

  /** 自定义方法中使用 this.sql(tx) 自动路由到事务 */
  async insertRaw(data: { name: string, email: string }, tx?: DmlWithTxOperations) {
    // 自定义原始写操作应先确保表已就绪（避免刚建库/建表较慢时的竞态）
    const ready = await this.ensureReady()
    if (!ready.success)
      return ready
    const now = Date.now()
    return this.sql(tx).execute(
      'INSERT INTO users (name, email, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [data.name, data.email, now, now],
    )
  }
}

// 使用
const repo = new UserRepository()
await repo.create({ name: '张三', email: 'test@example.com' })
const user = await repo.findById(1)

// 创建或更新（upsert）
await repo.createOrUpdate({ id: 1, name: '李四', email: 'test@example.com' })
// id=1 已存在 → 更新 name；不存在 → 插入新记录

// 跨仓库事务
const txResult = await reldb.tx.begin()
if (txResult.success) {
  const tx = txResult.data
  await repo.create({ name: '用户A', email: 'a@test.com' }, tx)
  await repo.create({ name: '用户B', email: 'b@test.com' }, tx)
  await tx.commit()
}
```

### JSON path operations

Use `reldb.json` to build SQL expressions for consistent JSON path operations across databases.

Paths follow SQL/JSON Path (`$.key` / `$.key.subkey` / `$[0]`); each backend maps them to its own functions or operators.

| Operation | SQLite         | PostgreSQL     | MySQL              |
| --------- | -------------- | -------------- | ------------------ |
| `extract` | `json_extract` | `#>` (text[])  | `JSON_EXTRACT`     |
| `set`     | `json_set`     | `jsonb_set`    | `JSON_SET`         |
| `insert`  | `json_insert`  | `jsonb_insert` | `JSON_INSERT`      |
| `remove`  | `json_remove`  | `#-` (text[])  | `JSON_REMOVE`      |
| `merge`   | `json_patch`   | `\|\| ::jsonb` | `JSON_MERGE_PATCH` |

All methods return `{ sql, params }` fragments that can be embedded in `reldb.sql.query` / `reldb.sql.execute`.

#### extract — read a JSON field value

```ts
// 用于 WHERE 条件
const { sql, params } = reldb.json.extract('settings', '$.theme')
const rows = await reldb.sql.query(
  `SELECT * FROM users WHERE ${sql} = ?`,
  [...params, '"dark"'],
)

// 用于 SELECT 列
const { sql, params } = reldb.json.extract('profile', '$.name')
const result = await reldb.sql.query(
  `SELECT id, ${sql} as display_name FROM users`,
  params,
)
```

#### set — set a JSON path (create or replace)

```ts
const { sql, params } = reldb.json.set('settings', '$.theme', 'dark')
await reldb.sql.execute(
  `UPDATE users SET settings = ${sql} WHERE id = ?`,
  [...params, userId],
)
```

#### insert — insert at a JSON path (only when absent)

```ts
const { sql, params } = reldb.json.insert('data', '$.firstSeen', new Date().toISOString())
await reldb.sql.execute(
  `UPDATE events SET data = ${sql} WHERE id = ?`,
  [...params, eventId],
)
```

#### remove — remove a JSON path

```ts
const { sql, params } = reldb.json.remove('settings', '$.deprecated')
await reldb.sql.execute(
  `UPDATE users SET settings = ${sql} WHERE id = ?`,
  [...params, userId],
)
```

#### merge — merge JSON objects (RFC 7396 Merge Patch)

```ts
// 覆盖已有键、保留未提及键、将 null 键删除
const { sql, params } = reldb.json.merge('profile', {
  bio: '新简介',
  avatar: null, // 传入 null 表示删除该键
})
await reldb.sql.execute(
  `UPDATE users SET profile = ${sql} WHERE id = ?`,
  [...params, userId],
)
```

`json.merge(column, patch)` implements RFC 7396 object patches on all three backends: preserve untouched nested keys, delete keys targeted by null, and replace arrays as a whole. PostgreSQL applies parameterized steps in a recursive CTE within one SQL statement, with no installed function or application read-modify-write. The patch root must be a JSON-serializable object; arbitrary JSON patch roots are outside this contract. Column expressions are developer-owned SQL; paths and values remain parameters. See [RFC 7396](https://www.rfc-editor.org/rfc/rfc7396) and [PostgreSQL JSON operators](https://www.postgresql.org/docs/16/functions-json.html).

#### Complete example

```ts
// 建表（含 JSON 列）
await reldb.ddl.createTable('products', {
  id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
  meta: { type: 'JSON' },
})

// 插入初始 JSON
await reldb.sql.execute(
  `INSERT INTO products (meta) VALUES (?)`,
  [JSON.stringify({ status: 'draft', tags: ['new'], version: 1 })],
)

// 设置字段
const { sql: setSql, params: setParams } = reldb.json.set('meta', '$.status', 'published')
await reldb.sql.execute(`UPDATE products SET meta = ${setSql} WHERE id = ?`, [...setParams, 1])

// 提取字段（用于过滤）
const { sql: exSql, params: exParams } = reldb.json.extract('meta', '$.status')
const published = await reldb.sql.query(
  `SELECT * FROM products WHERE ${exSql} = ?`,
  [...exParams, '"published"'],
)

// 合并更新
const { sql: mSql, params: mParams } = reldb.json.merge('meta', { version: 2, reviewer: 'admin' })
await reldb.sql.execute(`UPDATE products SET meta = ${mSql} WHERE id = ?`, [...mParams, 1])

// 删除字段
const { sql: rmSql, params: rmParams } = reldb.json.remove('meta', '$.reviewer')
await reldb.sql.execute(`UPDATE products SET meta = ${rmSql} WHERE id = ?`, [...rmParams, 1])
```

### Error handling

All operations return `HaiResult<T>`; check `result.success` for success or failure.

```ts
import { HaiReldbError, reldb } from '@h-ai/reldb'

const result = await reldb.sql.query('SELECT * FROM users')
if (!result.success) {
  switch (result.error.code) {
    case HaiReldbError.NOT_INITIALIZED.code:
      // 请先调用 reldb.init()
      break
    case HaiReldbError.QUERY_FAILED.code:
      // SQL 执行错误
      break
    case HaiReldbError.CONSTRAINT_VIOLATION.code:
      // 约束违反（如唯一约束、外键等）
      break
  }
}
```

Common error codes:

| Error code                           | code            | Description                         |
| ------------------------------------ | --------------- | ----------------------------------- |
| `HaiReldbError.NOT_INITIALIZED`      | `hai:reldb:010` | Not initialized                     |
| `HaiReldbError.CONNECTION_FAILED`    | `hai:reldb:001` | Connection failed                   |
| `HaiReldbError.QUERY_FAILED`         | `hai:reldb:002` | Query failed                        |
| `HaiReldbError.CONSTRAINT_VIOLATION` | `hai:reldb:003` | Constraint violation                |
| `HaiReldbError.TRANSACTION_FAILED`   | `hai:reldb:004` | Transaction failed                  |
| `HaiReldbError.DDL_FAILED`           | `hai:reldb:020` | DDL operation failed                |
| `HaiReldbError.CONFIG_ERROR`         | `hai:reldb:013` | Invalid configuration               |
| `HaiReldbError.TIMEOUT`              | `hai:reldb:009` | MySQL acquisition deadline exceeded |
| `HaiReldbError.POOL_EXHAUSTED`       | `hai:reldb:011` | MySQL acquisition queue is full     |

Custom SQL methods in `BaseReldbCrudRepository` subclasses must check `await this.ensureReady()`. Construction starts table creation; service init must await candidate readiness before publication. PostgreSQL retries a single autocommit `CREATE TABLE/INDEX IF NOT EXISTS` once only for `23505/pg_class_relname_nsp_index` catalog contention (also `pg_type_typname_nsp_index` for tables), or a table row-type race reported as `42710` with server routine `heap_create_with_catalog` / `TypeCreate`, consistently through DDL and SQL entry points. A failed retry remains an error. Transactions, business uniqueness errors and other failures are not retried. Initial connection probing attempts temporary DNS `EAI_AGAIN` failures at most three times, with 250/500 ms delays; business SQL is never replayed.

## Production shared state

Production requires PostgreSQL/MySQL. SQLite, including disk files, is for development/explicit tests and does not provide cross-host shared state. Initialization checks apply when NODE_ENV or HAI_CORE_ENV is production; only explicit HAI_E2E=1/HAI_E2E_MOCK=1 tests are exempt. [State, concurrency and recovery (Chinese)](../../.agents/instructions/distributed-state.md)。

## Module schema migrations

`schemaColumns(reldb, table, sql?)` inspects real columns. `migrateSchema(reldb, module, steps, { dryRun: true })` creates no ledger. Modules own their steps. Execution journals versions in `hai_schema_migrations`; SQLite/PostgreSQL are transactional, while MySQL implicit DDL commits require reentrant steps. Failures do not advance versions; retries inspect real state. Older code rejects newer ledgers. Stop old writers and back up DB/session cache first. Rollback restores compatible database and binaries together. See the [upgrade guide](../../docs/usage/README.en.md).

## Error messages and correlated logs

Unique constraint violations return `HaiReldbError.DUPLICATE_ENTRY` (409); timeout, pool exhaustion and other existing error codes remain intact. Branch on error codes rather than localized messages or driver text. Logs preserve driver code/schema/routine/constraint and stack line numbers; numeric bound values do not obscure these diagnostic identifiers.

HTTP errors carry safe localized messages and a reference ID. ToastContainer hides the ID by default and reveals it through its diagnostic icon. The same ID remains in `error.traceId` and `X-Trace-Id`. The framework reuses the request ID to correlate browser and server logs. Sanitized exceptions, stacks and operation context remain in logs; internal cause/ext are not exposed. Field validation returns localized field names and messages only.

Use `core.error.toPublic(error, traceId?)` at HTTP/UI boundaries and `core.error.formatMessage(error)` after translating messages; formatting is idempotent. Pass complete Error objects to logs instead of discarding their context. Database failures log driver codes, sanitized messages/stacks and table/column context; SQL text, bound values and connection credentials are excluded.

## Development and testing

```bash
pnpm --filter @h-ai/reldb test
```

> MySQL/PostgreSQL tests require Docker.

Source JSDoc follows the [shared conventions](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证): public examples use published entry points, and internal examples are checked in their module scope. After building, run `pnpm check:jsdoc --package reldb`; compiling examples does not replace backend behavior tests.

## License

Apache-2.0
