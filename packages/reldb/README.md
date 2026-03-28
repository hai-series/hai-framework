# @h-ai/reldb

关系型数据库访问模块，通过统一的 `reldb` 对象访问 SQLite、PostgreSQL、MySQL。

## 支持的数据库

- SQLite
- PostgreSQL
- MySQL

## 快速开始

```ts
import { reldb, ReldbErrorCode } from '@h-ai/reldb'

// 初始化
await reldb.init({ type: 'sqlite', database: ':memory:' })

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

## 配置

支持连接字符串（`url`）或分字段（`host/port/database/user/password`）。

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

## 事务

三种使用方式：

### wrap（自动提交/回滚）

```ts
const result = await reldb.tx.wrap(async (tx) => {
  await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
  await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
  return 'ok'
})
// 回调正常返回 → 自动提交；抛异常 → 自动回滚
```

### begin + commit（分步提交）

```ts
const txResult = await reldb.tx.begin()
if (!txResult.success) { /* 处理错误 */ }
const tx = txResult.data

await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
await tx.commit()
```

### begin + rollback（分步回滚）

```ts
const txResult = await reldb.tx.begin()
if (!txResult.success) { /* 处理错误 */ }
const tx = txResult.data

await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
// 业务检查失败，手动回滚
await tx.rollback()
```

### 事务内使用 batch / queryPage

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

## Crud

通过 `reldb.crud.table()` 创建单表 CRUD 仓库，免写 SQL：

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

### create / createMany

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

### createOrUpdate

主键存在时更新，否则创建（upsert）：

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

`BaseReldbCrudRepository` 自动获取 `dbType`，无需手动传入。

### findById / getById / findAll / findPage

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

### updateById / deleteById

```ts
await userCrud.updateById(1, { name: '李四' })
await userCrud.deleteById(1)
```

### count / exists / existsById

```ts
const total = await userCrud.count({ where: 'name LIKE ?', params: ['%张%'] })
// total.data → 5

const has = await userCrud.exists({ where: 'email = ?', params: ['test@example.com'] })
// has.data → true

const found = await userCrud.existsById(1)
// found.data → true
```

### 事务中使用 Crud

所有方法均支持传入 `tx` 参数，自动路由到事务上下文：

```ts
await reldb.tx.wrap(async (tx) => {
  await userCrud.create({ name: '用户A', email: 'a@test.com' }, tx)
  await userCrud.updateById(1, { name: '新名字' }, tx)
  const user = await userCrud.findById(1, tx)
})
```

## BaseReldbCrudRepository

业务仓库继承 `BaseReldbCrudRepository`，通过 `fields` 定义字段映射，自动建表、类型转换：

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

## JSON 路径操作

通过 `reldb.json` 构建跨数据库统一的 JSON 路径操作 SQL 表达式。

路径格式遵循 SQL/JSON Path 标准（`$.key` / `$.key.subkey` / `$[0]`），各数据库后端自动映射到对应函数或操作符。

| 操作      | SQLite         | PostgreSQL     | MySQL              |
| --------- | -------------- | -------------- | ------------------ |
| `extract` | `json_extract` | `#>` (text[])  | `JSON_EXTRACT`     |
| `set`     | `json_set`     | `jsonb_set`    | `JSON_SET`         |
| `insert`  | `json_insert`  | `jsonb_insert` | `JSON_INSERT`      |
| `remove`  | `json_remove`  | `#-` (text[])  | `JSON_REMOVE`      |
| `merge`   | `json_patch`   | `\|\| ::jsonb` | `JSON_MERGE_PATCH` |

所有方法返回 `{ sql, params }` 片段，可直接嵌入 `reldb.sql.query` / `reldb.sql.execute`。

### extract — 提取 JSON 字段值

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

### set — 设置 JSON 字段路径（创建或替换）

```ts
const { sql, params } = reldb.json.set('settings', '$.theme', 'dark')
await reldb.sql.execute(
  `UPDATE users SET settings = ${sql} WHERE id = ?`,
  [...params, userId],
)
```

### insert — 插入 JSON 字段路径（仅当路径不存在时）

```ts
const { sql, params } = reldb.json.insert('data', '$.firstSeen', new Date().toISOString())
await reldb.sql.execute(
  `UPDATE events SET data = ${sql} WHERE id = ?`,
  [...params, eventId],
)
```

### remove — 删除 JSON 字段路径

```ts
const { sql, params } = reldb.json.remove('settings', '$.deprecated')
await reldb.sql.execute(
  `UPDATE users SET settings = ${sql} WHERE id = ?`,
  [...params, userId],
)
```

### merge — 合并 JSON 对象（RFC 7396 Merge Patch）

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

### 完整示例

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

## 错误处理

所有操作返回 `HaiResult<T>`，通过 `result.success` 判断成功或失败。

```ts
import { reldb, ReldbErrorCode } from '@h-ai/reldb'

const result = await reldb.sql.query('SELECT * FROM users')
if (!result.success) {
  switch (result.error.code) {
    case ReldbErrorCode.NOT_INITIALIZED:
      // 请先调用 reldb.init()
      break
    case ReldbErrorCode.QUERY_FAILED:
      // SQL 执行错误
      break
    case ReldbErrorCode.CONSTRAINT_VIOLATION:
      // 约束违反（如唯一约束、外键等）
      break
  }
}
```

常用错误码：

- `NOT_INITIALIZED` — 未初始化
- `CONNECTION_FAILED` — 连接失败
- `QUERY_FAILED` — 查询/执行失败
- `CONSTRAINT_VIOLATION` — 约束违反
- `TRANSACTION_FAILED` — 事务失败
- `DDL_FAILED` — DDL 操作失败
- `CONFIG_ERROR` — 配置错误

## 测试

```bash
pnpm --filter @h-ai/reldb test
```

> MySQL/PostgreSQL 测试需要 Docker。

## License

Apache-2.0
