# @h-ai/reldb 功能说明

在服务端管理关系数据库连接，执行 SQL、事务和可复用的 CRUD。业务 schema 与迁移由使用方或上层模块管理。

[模块 README](../../../packages/reldb/README.md) · [配置清单](../configuration/reldb.md) · [数据结构](../data/reldb.md) · [数据服务接入](../development/data.md)

## 最小接入示例

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

多个部署节点同时准备模块结构时，使用 `reldb.prepareSchema(key, ({ ddl, sql }) => ...)`。PostgreSQL 通过固定模块标识的事务锁协调建表、检查索引和更新种子行，回调失败回滚。请通过回调提供的操作访问数据库，并将模型服务、容器等外部调用放在事务结束之后。其他提供方沿用自身 DDL 提交规则。

## 功能说明

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

以下片段依赖上面的最小接入示例。示例中的业务值由宿主校验和授权后传入；异步领域结果先判断 success，再读取 data。表中 void 表示操作已完成且没有返回数据，null 表示不存在；同步工厂/工具直接返回表中类型。

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

| 入口                  | 输入参数   | 成功结果   | 调用示例                              |
| --------------------- | ---------- | ---------- | ------------------------------------- |
| `reldb.schemaColumns` | table, sql | `string[]` | `await reldb.schemaColumns('orders')` |

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

生产仅使用 PostgreSQL/MySQL；SQLite（含磁盘文件）只用于开发/明确测试，不能作为跨主机共享状态。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化发布成功前校验；仅 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试可豁免。 [状态、并发和恢复边界](../../../.agents/instructions/distributed-state.md).

### 检查数据表结构

`reldb.schemaColumns(table, sql?)` 只读查询实际列名。传入当前事务的 SQL 操作句柄，可在同一事务中检查表结构。框架模块初始化时校验各自的表结构，业务表由应用管理。

### SQL 标识符与独立 JSON 方言工具

动态值优先通过 SQL 参数绑定。表名和列名由调用方从已授权集合中选择，使用标识符工具校验。

```ts
import { createJsonOps, escapeSqlString, parseJsonPath, quoteIdentifier, validateIdentifier, validateIdentifiers } from '@h-ai/reldb'

const column = validateIdentifier('order_total') // 成功的 data 为 'order_total'。
const columns = validateIdentifiers(['order_id', 'order_total']) // 成功的 data 为 undefined，任一非法时返回失败。
const quoted = quoteIdentifier('order_total') // 结果为 '"order_total"'，适用支持双引号的方言。
const escaped = escapeSqlString('O\'Reilly') // 将单引号加倍，返回 "O''Reilly"。
const segments = parseJsonPath('$.profile.name') // 按支持的 JSON Path 语法返回路径段数组。
const ops = createJsonOps('postgresql') // 返回 PostgreSQL 的 JSON 操作构造器，使用方式见 JSON 路径操作。
```

`parseJsonPath` 解析支持的路径段，遇到无法继续解析的内容时可能只返回已读的部分。已经初始化 `reldb` 的应用可优先用 `reldb.json` 自动选取活动后端的方言。

## 错误处理

返回 `HaiResult<T>` 的操作通过 `result.success` 区分成功与失败。业务成功后读取 `data`，诊断失败时记录 `error.code` 和关联编号。

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
