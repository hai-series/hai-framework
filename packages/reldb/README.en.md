# @h-ai/reldb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

## Introduction

A relational database module with a unified `reldb` object for SQLite, PostgreSQL, and MySQL.

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

`reldb.config` returns a **redacted configuration snapshot**. Database `password` and credentials embedded in URLs are hidden automatically. Use it to inspect state, not to replay original connection details.

### Configuration

Use either a connection string (`url`) or separate fields (`host/port/database/user/password`).

```ts
// SQLite
await reldb.init({ type: 'sqlite', database: './data.db' })

// PostgreSQL
await reldb.init({ type: 'postgresql', url: 'postgres://user:pass@localhost:5432/mydb' })

// MySQL
await reldb.init({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'mydb',
  user: 'admin',
  password: 'secret',
  mysql: { charset: 'utf8mb4' },
})
```

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
  maxLength: 1000 # 参数序列化后的最大输出长度，超出会截断
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

### Transactions

Three approaches:

#### wrap (automatic commit/rollback)

```ts
const result = await reldb.tx.wrap(async (tx) => {
  await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
  await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
  return 'ok'
})
// 回调正常返回 → 自动提交；抛异常 → 自动回滚
```

#### begin + commit (explicit commit)

```ts
const txResult = await reldb.tx.begin()
if (!txResult.success) { /* 处理错误 */ }
const tx = txResult.data

await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
await tx.commit()
```

#### begin + rollback (explicit rollback)

```ts
const txResult = await reldb.tx.begin()
if (!txResult.success) { /* 处理错误 */ }
const tx = txResult.data

await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
// 业务检查失败，手动回滚
await tx.rollback()
```

#### batch / queryPage inside transactions

```ts
await reldb.tx.wrap(async (tx) => {
  await tx.batch([
    { sql: 'INSERT INTO users (name) VALUES (?)', params: ['用户1'] },
    { sql: 'INSERT INTO users (name) VALUES (?)', params: ['用户2'] },
  ])

  const page = await tx.queryPage<{ id: number, name: string }>({
    sql: 'SELECT id, name FROM users ORDER BY id',
    pagination: { page: 1, pageSize: 10 },
  })
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
  await userCrud.create({ name: '用户A', email: 'a@test.com' }, tx)
  await userCrud.updateById(1, { name: '新名字' }, tx)
  const user = await userCrud.findById(1, tx)
})
```

### BaseReldbCrudRepository

Business repositories extend `BaseReldbCrudRepository` and define field mappings with `fields` for automatic table creation and type conversion:

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

| Error code                           | code            | Description           |
| ------------------------------------ | --------------- | --------------------- |
| `HaiReldbError.NOT_INITIALIZED`      | `hai:reldb:010` | Not initialized       |
| `HaiReldbError.CONNECTION_FAILED`    | `hai:reldb:001` | Connection failed     |
| `HaiReldbError.QUERY_FAILED`         | `hai:reldb:002` | Query failed          |
| `HaiReldbError.CONSTRAINT_VIOLATION` | `hai:reldb:003` | Constraint violation  |
| `HaiReldbError.TRANSACTION_FAILED`   | `hai:reldb:004` | Transaction failed    |
| `HaiReldbError.DDL_FAILED`           | `hai:reldb:020` | DDL operation failed  |
| `HaiReldbError.CONFIG_ERROR`         | `hai:reldb:013` | Invalid configuration |

## Development and testing

```bash
pnpm --filter @h-ai/reldb test
```

> MySQL/PostgreSQL tests require Docker.

## License

Apache-2.0
