# @h-ai/reldb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

关系型数据库访问模块，通过统一的 `reldb` 对象访问 SQLite、PostgreSQL、MySQL。

## 快速开始

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

`reldb.config` 返回的是**脱敏后的配置快照**：数据库 `password`、URL 内嵌凭证和 TLS 客户端私钥 `ssl.key` 会自动隐藏，便于排查状态但不应用于回放原始连接信息。

## 功能

初始化只在健康检查成功后发布连接；失败时释放候选资源。若清理仍失败，初始化错误的 `error.ext.cleanupPending` 为 `true`。`reldb.close()` 返回 `Promise<HaiResult<void>>`，等待正在进行的初始化，并合并并发关闭。开始清理后 `isInitialized` 为 `false`，配置与业务操作不再可用；清理失败仍保留资源，后续 `close()` 或 `init()` 先重试释放，成功前不会创建替代连接。调用方必须检查关闭结果。

```ts
const closed = await reldb.close()
if (!closed.success) {
  // 处理清理故障后有限重试；再次失败应向应用报告。
  const retried = await reldb.close()
  if (!retried.success)
    throw new Error(retried.error.message)
}
```

关闭会等待已借出的事务提交/回滚并释放句柄；应用必须结束事务才能完成关闭。SQLite 的 WAL 配置与 worker 握手也属于初始化资源链。PostgreSQL 空闲连接断开由连接池移除并在后续查询时替换，不使进程退出；日志仅记录安全错误标识，不输出驱动错误原文。

### 功能输入输出

以下片段依赖本节完整初始化流程。示例中的业务值由宿主校验和授权后传入；异步领域结果先判断 success，再读取 data。表中 void 表示操作已完成且没有返回数据，null 表示不存在；同步工厂/工具直接返回表中类型。

table/column/index 名必须来自可信代码；sql 是可信语句，params 绑定业务值；steps 是模块迁移步骤，options 控制预检和分页。

#### reldb.ddl

维护表、列和索引。输入可信标识符、列/索引定义或 DDL；成功返回 void，结构错误返回失败。

| 入口                    | 输入参数                         | 成功结果 | 调用示例                                                                             |
| ----------------------- | -------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `reldb.ddl.createTable` | tableName, columns, ifNotExists  | `void`   | `await reldb.ddl.createTable('orders', { id: { type: 'TEXT', primaryKey: true } })`  |
| `reldb.ddl.dropTable`   | tableName, ifExists              | `void`   | `await reldb.ddl.dropTable('orders_archive', true)`                                  |
| `reldb.ddl.addColumn`   | tableName, columnName, columnDef | `void`   | `await reldb.ddl.addColumn('orders', 'note', { type: 'TEXT' })`                      |
| `reldb.ddl.dropColumn`  | tableName, columnName            | `void`   | `await reldb.ddl.dropColumn('orders', 'note')`                                       |
| `reldb.ddl.renameTable` | oldName, newName                 | `void`   | `await reldb.ddl.renameTable('orders_draft', 'orders')`                              |
| `reldb.ddl.createIndex` | tableName, indexName, indexDef   | `void`   | `await reldb.ddl.createIndex('orders', 'orders_status', { columns: ['status'] })`    |
| `reldb.ddl.dropIndex`   | indexName, ifExists              | `void`   | `await reldb.ddl.dropIndex('orders_status', true)`                                   |
| `reldb.ddl.raw`         | sql                              | `void`   | `await reldb.ddl.raw('CREATE TABLE IF NOT EXISTS app_marker (id TEXT PRIMARY KEY)')` |

#### reldb.sql

业务查询/写入。SQL 值通过 params 绑定；分别返回行数组、首行/null、写入结果、void 或分页结果。batch 接收语句数组。

| 入口                  | 输入参数    | 成功结果             | 调用示例                                                                                                         |
| --------------------- | ----------- | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `reldb.sql.query`     | sql, params | `T[]`                | `await reldb.sql.query('SELECT id FROM orders WHERE status = ?', ['pending'])`                                   |
| `reldb.sql.get`       | sql, params | `T \| null`          | `await reldb.sql.get('SELECT id FROM orders WHERE id = ?', ['o1'])`                                              |
| `reldb.sql.execute`   | sql, params | `ExecuteResult`      | `await reldb.sql.execute('UPDATE orders SET status = ? WHERE id = ?', ['paid', 'o1'])`                           |
| `reldb.sql.batch`     | statements  | `void`               | `await reldb.sql.batch([{ sql: 'DELETE FROM orders WHERE id = ?', params: ['o1'] }])`                            |
| `reldb.sql.queryPage` | options     | `PaginatedResult<T>` | `await reldb.sql.queryPage({ sql: 'SELECT id FROM orders ORDER BY id', pagination: { page: 1, pageSize: 20 } })` |

#### reldb.pagination

界面分页。normalize 接收页码/页大小及上限，返回规范化参数；build 接收 items、total、分页参数，直接返回分页对象。

| 入口                         | 输入参数                 | 成功结果               | 调用示例                                                   |
| ---------------------------- | ------------------------ | ---------------------- | ---------------------------------------------------------- |
| `reldb.pagination.normalize` | options, overrides       | `NormalizedPagination` | `reldb.pagination.normalize({ page: 1, pageSize: 20 })`    |
| `reldb.pagination.build`     | items, total, pagination | `PaginatedResult<T>`   | `reldb.pagination.build([], 0, { page: 1, pageSize: 20 })` |

#### reldb

模块持久化准备。输入表名得到列名数组；输入模块名、迁移步骤和 dryRun 得到迁移计划。执行前备份并停止冲突写入。

| 入口                  | 输入参数               | 成功结果              | 调用示例                                                                |
| --------------------- | ---------------------- | --------------------- | ----------------------------------------------------------------------- |
| `reldb.schemaColumns` | table, sql             | `string[]`            | `await reldb.schemaColumns('orders')`                                   |
| `reldb.migrateSchema` | module, steps, options | `SchemaMigrationPlan` | `await reldb.migrateSchema('orders', migrationSteps, { dryRun: true })` |

#### reldb.tx

原子业务写入。begin 返回检查结果后的事务句柄，具备 query/get/execute/batch/queryPage/commit/rollback；wrap 接收回调并返回其结果。失败 HaiResult 必须显式触发回滚。

| 入口             | 输入参数 | 成功结果              | 调用示例                                                                                                                                                            |
| ---------------- | -------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reldb.tx.begin` | 无参数   | `DmlWithTxOperations` | `await reldb.tx.begin()`                                                                                                                                            |
| `reldb.tx.wrap`  | fn       | `T`                   | `await reldb.tx.wrap(async tx => { const found = await tx.get('SELECT 1 AS value'); if (!found.success) throw new Error(found.error.message); return found.data })` |

#### reldb.crud

为业务实体配置 table/字段映射，直接取得仓储；后续通过仓储执行 CRUD 和分页，不暴露数据库连接。

| 入口               | 输入参数 | 成功结果                     | 调用示例                                  |
| ------------------ | -------- | ---------------------------- | ----------------------------------------- |
| `reldb.crud.table` | config   | `ReldbCrudRepository<TItem>` | `reldb.crud.table(orderRepositoryConfig)` |

#### reldb.json

跨方言 JSON 表达式。输入可信列名、JSON 路径及值/patch，直接返回 SQL 表达式和绑定参数；不是立即执行 SQL。

| 入口                 | 输入参数            | 成功结果      | 调用示例                                            |
| -------------------- | ------------------- | ------------- | --------------------------------------------------- |
| `reldb.json.extract` | column, path        | `JsonSqlExpr` | `reldb.json.extract('payload', '$.status')`         |
| `reldb.json.set`     | column, path, value | `JsonSqlExpr` | `reldb.json.set('payload', '$.status', 'paid')`     |
| `reldb.json.insert`  | column, path, value | `JsonSqlExpr` | `reldb.json.insert('payload', '$.note', 'checked')` |
| `reldb.json.remove`  | column, path        | `JsonSqlExpr` | `reldb.json.remove('payload', '$.note')`            |
| `reldb.json.merge`   | column, patch       | `JsonSqlExpr` | `reldb.json.merge('payload', { status: 'paid' })`   |

- 用同一套 API 连接 SQLite、PostgreSQL 和 MySQL。
- 执行参数化 SQL，创建表和索引，读取分页结果。
- 使用事务、CRUD 与 Repository 组织业务读写。

### 事务

一个事务只允许一个结束操作。`commit()` 或 `rollback()` 开始后，新查询、重复提交和并发回滚立即返回 TRANSACTION_FAILED；连接只归还一次。调用方仍须等待首次结束结果，不能把并发结束当作故障恢复。

三种使用方式：

#### wrap（自动提交/回滚）

事务回调正常返回就会提交，返回失败 HaiResult 也不例外。必须检查每一步结果，并在失败时抛出异常触发回滚；wrap 会把异常转为 TRANSACTION_FAILED。需要保留原领域错误时，使用下方手动事务。各片段假定数据库已成功初始化且 users 表已经创建。

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

#### begin + commit（分步提交）

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

#### begin + rollback（分步回滚）

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

#### 事务内使用 batch / queryPage

```ts
await reldb.tx.wrap(async (tx) => {
  const inserted = await tx.batch([
    {
      sql: 'INSERT INTO users (name) VALUES (?)',
      params: ['Alice']
    },
    {
      sql: 'INSERT INTO users (name) VALUES (?)',
      params: ['Bob']
    },
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
const total = await userCrud.count({
  where: 'name LIKE ?',
  params: ['%张%']
})
// total.data → 5

const has = await userCrud.exists({
  where: 'email = ?',
  params: ['test@example.com']
})
// has.data → true

const found = await userCrud.existsById(1)
// found.data → true
```

#### 事务中使用 Crud

所有方法均支持传入 `tx` 参数，自动路由到事务上下文：

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

业务仓库继承 `BaseReldbCrudRepository`，通过 `fields` 定义字段映射，自动建表、类型转换：

Unix 毫秒字段使用 `BIGINT`（SQLite 为 64 位 INTEGER，PostgreSQL/MySQL 为 BIGINT），普通 INTEGER 在 PostgreSQL/MySQL 中无法容纳当前毫秒时间。BIGINT 的原始 SQL/CRUD 和基类读取值保留驱动的 number/string/bigint 类型；需要 number 的业务仓库须校验安全整数后转换，避免静默精度丢失。TIMESTAMP 字段由基类读取为 Date。

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
  {
    fieldName: 'id',
    columnName: 'id',
    def: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
    select: true,
    create: false,
    update: false
  },
  {
    fieldName: 'name',
    columnName: 'name',
    def: { type: 'TEXT', notNull: true },
    select: true,
    create: true,
    update: true
  },
  {
    fieldName: 'email',
    columnName: 'email',
    def: { type: 'TEXT', notNull: true },
    select: true,
    create: true,
    update: true
  },
  {
    fieldName: 'createdAt',
    columnName: 'created_at',
    def: { type: 'TIMESTAMP', notNull: true },
    select: true,
    create: true,
    update: false
  },
  {
    fieldName: 'updatedAt',
    columnName: 'updated_at',
    def: { type: 'TIMESTAMP', notNull: true },
    select: true,
    create: true,
    update: false
  },
]

class UserRepository extends BaseReldbCrudRepository<UserRow> {
  constructor() {
    super(reldb, { table: 'users', idColumn: 'id', fields: USER_FIELDS })
  }

  /** 自定义查询方法 */
  async findByEmail(email: string) {
    return this.findAll({
      where: 'email = ?',
      params: [email],
      limit: 1
    })
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

### JSON 路径操作

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

#### extract — 提取 JSON 字段值

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

#### set — 设置 JSON 字段路径（创建或替换）

```ts
const { sql, params } = reldb.json.set('settings', '$.theme', 'dark')
await reldb.sql.execute(
  `UPDATE users SET settings = ${sql} WHERE id = ?`,
  [...params, userId],
)
```

#### insert — 插入 JSON 字段路径（仅当路径不存在时）

```ts
const { sql, params } = reldb.json.insert('data', '$.firstSeen', new Date().toISOString())
await reldb.sql.execute(
  `UPDATE events SET data = ${sql} WHERE id = ?`,
  [...params, eventId],
)
```

#### remove — 删除 JSON 字段路径

```ts
const { sql, params } = reldb.json.remove('settings', '$.deprecated')
await reldb.sql.execute(
  `UPDATE users SET settings = ${sql} WHERE id = ?`,
  [...params, userId],
)
```

#### merge — 合并 JSON 对象（RFC 7396 Merge Patch）

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

`json.merge(column, patch)` 在三种后端均实现 RFC 7396 的对象补丁：递归保留未改键，补丁 null 删除指定键，数组整体替换。PostgreSQL 用参数化递归 CTE 在单次 SQL 中修改当前行，不要求预装函数，也不先在应用读取再写回。补丁根必须是可 JSON 序列化的对象；此契约不扩展为任意 JSON 根补丁。列表达式由开发者静态提供，动态路径和值全部作为参数。参见 [RFC 7396](https://www.rfc-editor.org/rfc/rfc7396) 和 [PostgreSQL JSON 运算](https://www.postgresql.org/docs/16/functions-json.html).

#### 完整示例

```ts
// 建表（含 JSON 列）
await reldb.ddl.createTable('products', {
  id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
  meta: { type: 'JSON' },
})

// 插入初始 JSON
await reldb.sql.execute(
  `INSERT INTO products (meta) VALUES (?)`,
  [
    JSON.stringify({
      status: 'draft',
      tags: ['new'],
      version: 1
    })
  ],
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

### 生产共享状态

生产仅使用 PostgreSQL/MySQL；SQLite（含磁盘文件）只用于开发/明确测试，不能作为跨主机共享状态。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化发布成功前校验；仅 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试可豁免。 [状态、并发和恢复边界](../../.agents/instructions/distributed-state.md).

### 模块架构迁移

`reldb.schemaColumns(table, sql?)` 只读检查真实结构；`reldb.migrateSchema(module, steps, { dryRun: true })` 不创建账本。版本步骤由所属模块维护，业务不修改框架内部表。执行使用 `hai_schema_migrations`，SQLite/PostgreSQL 整体事务，MySQL DDL 隐式提交因此步骤必须可重入；失败不推进版本，重新检查真实结构后续做，拒绝向低版本降级。升级前停止所有旧写入并备份 DB/会话缓存；回退需恢复兼容数据库与旧代码，不能只换二进制。详见 [升级指南](../../docs/usage/README.md).

## 配置

生命周期：init 输入后端/业务配置，成功后才能使用；close 在释放借用依赖前等待完成。返回值以快速开始示例和公开签名为准。

`@h-ai/reldb/schemas` 直接导出同一组配置 Schema 和类型，只依赖 Zod，不加载数据库实例或驱动，可用于 CLI 或浏览器的配置校验。MySQL TLS 仅接受 `false` 或严格对象，`{}` 默认校验证书链和 DNS 身份；PostgreSQL 保留其布尔值、字符串模式及对象契约。

```ts
import { ReldbConfigSchema } from '@h-ai/reldb/schemas'

const checked = ReldbConfigSchema.safeParse({ type: 'mysql', database: 'shop', ssl: {} })
if (!checked.success)
  throw new Error('Invalid database configuration')
// checked.data.ssl: { rejectUnauthorized: true, verifyIdentity: true }
```

支持连接字符串（`url`）或分字段（`host/port/database/user/password`）。

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

### 连接池与 MySQL URL

MySQL 的 `pool` 只接受 `max`、`acquireTimeout`、`queueLimit`，省略时默认分别为 10、10000 毫秒、1000。其他池字段（包括 `min`、`idleTimeout`）以及未实现的 `mysql.timezone` 会在配置校验时失败。空闲连接由 mysql2/服务端断开或 `close()` 释放，本模块不承诺 MySQL 的最小保留数或可配置的空闲回收期限；[mysql2 3.24.5 的真实选项](https://github.com/sidorares/node-mysql2/blob/v3.24.5/typings/mysql/lib/Pool.d.ts)与 PostgreSQL 不同。

| 字段             | PostgreSQL（显式提供 `pool` 时的默认值） | MySQL                                  |
| ---------------- | ---------------------------------------- | -------------------------------------- |
| `max`            | 10                                       | 10，借用和正在建连合计不超过此值       |
| `min`            | 1，已建立连接的保留下限，不主动预建      | 不支持，明确拒绝                       |
| `idleTimeout`    | 30000 毫秒，0 禁用                       | 不支持，明确拒绝                       |
| `acquireTimeout` | 10000 毫秒，0 禁用                       | 10000 毫秒，必须为 1–2147483647 的整数 |
| `queueLimit`     | 不支持                                   | 1000，等待请求上限，必须为正整数       |

PostgreSQL 未提供 `pool` 时沿用 pg 驱动默认值；保留与空闲回收语义见 [pg.Pool](https://node-postgres.com/apis/pool)。MySQL 所有 SQL、DDL、CRUD、批量和事务入口共用有界 FIFO 借用队列：排队与建立连接共用一个 `acquireTimeout` 截止期限，超时返回 `TIMEOUT`，队列满返回 `POOL_EXHAUSTED`。超时排队请求会移除；已开始但迟到的建连只释放连接，不启动 SQL，结算前仍占容量槽位。取得连接及业务执行前再次校验期限；它不限制已启动 SQL 或事务的执行时长。

MySQL `close()` 立即拒绝新请求并结束排队等待，随后等待已借出连接、事务及在途建连结算再关闭池。驱动 `connectTimeout` 使用相同超时值；关闭可能等到该建连时限或现有 SQL/事务结束，应用仍须主动结束事务。环境变量使用 `HAI_DB_POOL_*`，`HAI_DB_POOL_MIN` / `HAI_DB_POOL_IDLETIMEOUT` 仅用于 PostgreSQL，MySQL 的 `HAI_DB_POOL_QUEUELIMIT` 控制等待总量。

MySQL 支持仅传 `url`（`mysql://`），未给 URL 时 `database` 必填。URL 中的 host/port/database/user/password 优先，冲突的分字段不参与连接；`pool`、`mysql.charset`、`ssl` 和 `operationLog` 独立适用。URL 仅接受连接地址，query/fragment 会被拒绝，不能用隐藏 URL 参数改变 TLS 或池策略。URL 模式的连接日志会脱敏。以下示例假定已设置 `HAI_DB_URL`：

```ts
const initialized = await reldb.init({
  type: 'mysql',
  url: process.env.HAI_DB_URL,
  pool: { max: 10, acquireTimeout: 5000, queueLimit: 100 }
})
if (!initialized.success)
  throw new Error(initialized.error.message)
```

MySQL 的空 `url`（例如空环境变量占位）表示使用 host/port/database/user/password；非空 URL 仍严格校验。

#### MySQL TLS

`ssl` 省略或为 `false` 时不启用 TLS；启用时只能传严格对象，空对象默认 `{ rejectUnauthorized: true, verifyIdentity: true }`。`ca` 是受信 CA 的 PEM 内容，省略时使用 Node 信任库；可选客户端 `cert` / `key` 也必须是 PEM 内容且成对提供。未知 TLS 字段、`true` 和 PostgreSQL 字符串模式明确拒绝，不提供任意参数/回调透传。

当前 [mysql2 3.24.5 的主机身份校验](https://github.com/sidorares/node-mysql2/blob/v3.24.5/lib/base/connection.js)依赖 DNS servername。因此在证书链及身份校验均开启时，IP 目标返回 `CONFIG_ERROR`，须使用与证书 DNS SAN 匹配的主机名。显式 `verifyIdentity: false` 只保留证书链校验；`rejectUnauthorized: false` 放弃服务端认证，即使存在加密也不能确认服务端身份。关闭任一验证会输出固定风险日志，不会称为安全连接。

```ts
// trustedCaPem 由部署时的受信 CA 提供，不是任意远端返回的证书。
const initialized = await reldb.init({
  type: 'mysql',
  host: 'db.example.com',
  database: 'app',
  ssl: { ca: trustedCaPem }
})
if (!initialized.success)
  throw new Error(initialized.error.message)
```

TLS 定向测试需要 OpenSSL（Windows 可使用 Git 附带版本）及本机容器端口转发；每轮生成并销毁 CA/私钥，通过真实 MySQL 验证受信 DNS、错误 CA/主机名拒绝、`REQUIRE X509` 客户端认证和会话 `Ssl_cipher`，不使用关闭验证替代认证成功证据。

#### SQLite 执行方式（worker 异步）

better-sqlite3 是同步驱动，查询会阻塞 Node 主线程事件循环。WAL 只能改善数据库锁并发，无法避免同步调用占用主线程。需要卸载这一阻塞时，可把 SQLite 切到专用 worker 线程执行（单连接，opt-in，默认 `sync`）：

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

worker 模式下查询、写入与事务均在 worker 线程串行执行；公共 API 与返回值与同步模式完全一致。

#### 操作日志

可在数据库配置中通过 `operationLog` 开启 SQL 操作日志。日志在 reldb provider-base 的 DML 操作层统一输出，不在 `reldb-main.ts` 或各 raw provider 中重复包装。

```yaml
# config/_db.yml
type: sqlite
database: ./data/app.db
operationLog:
  read: false # query / get / queryPage
  write: false # DDL, execute / batch, tx.begin / tx.commit / tx.rollback
  maxLength: 1000 # 安全数量摘要的最大字符数，0省略摘要；不记录SQL原文/参数值
  level: debug # info | debug | trace，默认 debug
```

通过 `core.config.load('db', ...)` 加载时，`HAI_DB_TYPE`、
`HAI_DB_DATABASE`、`HAI_DB_OPERATIONLOG_LEVEL` 等约定变量优先于 YAML。

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

操作日志记录固定操作名、SQL 长度、参数数量和批量数量等摘要。失败日志额外保留错误码、traceId 以及白名单内的脱敏驱动消息和堆栈，便于定位；不会直接记录整份 SQL、绑定参数或连接配置。

配置由宿主加载和校验，再传入本模块；私密值放服务端私有环境，不传到浏览器。按实际使用场景逐项选择后端、容量、期限和日志策略，修改后重新初始化并核验成功结果。

[逐项配置说明、适用场景和示例](../../docs/usage/configuration/data.md).

## 错误处理

领域操作先判断 `result.success`，失败按本模块错误定义与安全提示处理，服务端保留错误码、关联编号和脱敏原因。同步工具、工厂、流迭代及生命周期按各自签名处理，不把 Promise 完成视为业务成功。具体失败与恢复边界见对应功能。

所有操作返回 `HaiResult<T>`，通过 `result.success` 判断成功或失败。

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

常用错误码：

| 错误码                               | code            | 说明                       |
| ------------------------------------ | --------------- | -------------------------- |
| `HaiReldbError.NOT_INITIALIZED`      | `hai:reldb:010` | 未初始化                   |
| `HaiReldbError.CONNECTION_FAILED`    | `hai:reldb:001` | 连接失败                   |
| `HaiReldbError.QUERY_FAILED`         | `hai:reldb:002` | 查询失败                   |
| `HaiReldbError.CONSTRAINT_VIOLATION` | `hai:reldb:003` | 约束违反                   |
| `HaiReldbError.TRANSACTION_FAILED`   | `hai:reldb:004` | 事务失败                   |
| `HaiReldbError.DDL_FAILED`           | `hai:reldb:020` | DDL 操作失败               |
| `HaiReldbError.CONFIG_ERROR`         | `hai:reldb:013` | 配置错误                   |
| `HaiReldbError.TIMEOUT`              | `hai:reldb:009` | MySQL 连接获取超过截止期限 |
| `HaiReldbError.POOL_EXHAUSTED`       | `hai:reldb:011` | MySQL 连接等待队列已满     |

派生 `BaseReldbCrudRepository` 的自定义 SQL 方法先检查 `await this.ensureReady()`；构造函数启动自动建表不等于仓库就绪，服务 init 必须等待候选仓库的就绪入口再发布。PostgreSQL 自动提交的单条 `CREATE TABLE/INDEX IF NOT EXISTS` 仅对 `23505/pg_class_relname_nsp_index`（建表还包括 `pg_type_typname_nsp_index`）目录竞争，以及建表时 `42710/heap_create_with_catalog`、`42710/TypeCreate` 或 `42P07/heap_create_with_catalog` 的目录竞争重执行一次。DDL 和 SQL 入口均保留重试后的错误。事务、业务唯一约束及其他错误不自动重试。初始化连接探测仅对临时 DNS 错误 `EAI_AGAIN` 最多尝试三次，间隔 250/500 ms；不重放业务 SQL。

### 错误提示与关联日志

唯一约束冲突统一返回 `HaiReldbError.DUPLICATE_ENTRY`（409）；超时、队列已满等已有错误码保持不变。业务按错误码分支，不解析本地化消息或驱动错误文本。日志保留驱动 code/schema/routine/constraint 和堆栈行号；数字绑定值不会误遮蔽这些诊断标识。

HTTP 错误返回本地化安全文案及追踪编号；ToastContainer 默认隐藏编号，由排查信息图标展开和复制。响应同时包含 `error.traceId` 和 `X-Trace-Id`。框架复用本次 requestId 作为 traceId，前后端日志自动关联。底层异常、堆栈和操作上下文经凭据脱敏后写入日志，不通过 cause/ext 向用户公开。字段校验只返回本地化的字段名和错误。

`core.error.toPublic(error, traceId?)` 用于接口/UI 边界；`core.error.formatMessage(error)` 用于重新翻译后的提示，重复调用不会重复追加标识。日志传入完整 Error 对象，不能只记录通用标题或提前 String(error) 丢失上下文。数据库失败记录驱动错误码、消息、堆栈及表/列；SQL 原文、绑定值和连接凭据不进入日志。

## 开发测试

```bash
pnpm --filter @h-ai/reldb test
```

> MySQL/PostgreSQL 测试需要 Docker。

源码 JSDoc 遵循[统一规范](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)：公开示例使用实际发布入口，内部示例在原模块作用域检查。构建后执行 `pnpm check:jsdoc --package reldb`；示例编译不代替真实后端行为验证。

## 许可证

Apache-2.0
