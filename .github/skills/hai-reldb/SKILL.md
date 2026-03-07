````skill
---
name: hai-reldb
description: 使用 @h-ai/reldb 进行 SQLite/PostgreSQL/MySQL 的初始化、DDL、SQL、CRUD、事务、分页与错误处理；当需求涉及数据库访问、ReldbCrudRepository、事务处理、分页查询或 ReldbErrorCode 分支处理时使用。
---

# hai-reldb

本技能用于指导在本仓库中正确使用 `@h-ai/reldb` 模块进行数据库操作与代码改动。涵盖初始化、DDL、SQL、CRUD 抽象、事务、分页与错误处理的正确姿势，并遵循仓库规范（i18n、日志、导出、测试、Result 返回值要求）。

## 适用场景

- 新增或修改数据库访问逻辑（SQL / DDL / CRUD / 事务）
- 需要配置不同数据库（SQLite / PostgreSQL / MySQL）的初始化
- 使用或扩展 `reldb.crud.table` / `BaseReldbCrudRepository`
- 处理分页查询或分页结果规范化
- 需要基于 `ReldbErrorCode` 做错误分支处理
- 跨仓库事务（多个 Repository 共享同一 `tx` 句柄）
- JSON 列的路径提取、设置、插入、删除、合并操作（跨数据库统一语法）

## 参考资料（优先读取）

- `packages/reldb/README.md` — 面向开发者的使用文档
- `packages/reldb/src/reldb-main.ts` — `reldb` 对象入口
- `packages/reldb/src/reldb-types.ts` — 全部公共类型定义
- `packages/reldb/src/reldb-config.ts` — 配置 Schema、错误码、DbType
- `packages/reldb/src/reldb-json.ts` — JSON 路径操作 SQL 构建器
- `packages/reldb/src/reldb-crud-kernel.ts` — `reldb.crud.table()` 实现
- `packages/reldb/src/reldb-crud-repository.ts` — `BaseReldbCrudRepository` 抽象类
- `packages/reldb/src/reldb-pagination.ts` — 分页工具函数

---

## 使用步骤

### 1. 导入与初始化

统一通过 `import { reldb, ReldbErrorCode } from '@h-ai/reldb'` 使用。

```ts
import { reldb, ReldbErrorCode } from '@h-ai/reldb'

// SQLite（文件或内存）
await reldb.init({ type: 'sqlite', database: ':memory:' })

// PostgreSQL（url 连接字符串）
await reldb.init({ type: 'postgresql', url: 'postgres://user:pass@localhost:5432/mydb' })

// MySQL（分字段）
await reldb.init({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'mydb',
  user: 'admin',
  password: 'secret',
  mysql: { charset: 'utf8mb4' },
})

// 操作完成后关闭
await reldb.close()
````

> **规则**：`reldb.init()` 返回 `Result`，必须检查 `success`；不可直接 `throw`。

### 2. 选择正确的操作接口

根据场景选择对应的子模块：

| 需求                 | 接口                       | 说明                                         |
| -------------------- | -------------------------- | -------------------------------------------- |
| 建表 / 改列 / 加索引 | `reldb.ddl.*`              | DDL 操作，Schema 管理                        |
| 原生 SQL 查询        | `reldb.sql.*`              | `query / get / execute / batch / queryPage`  |
| 单表 CRUD（快速）    | `reldb.crud.table(config)` | 基于配置的轻量 CRUD，无自动建表              |
| 业务仓库封装         | `BaseReldbCrudRepository`  | 字段映射、自动建表、类型转换、时间戳自动填充 |
| 事务                 | `reldb.tx.*`               | `wrap`（自动）/ `begin`（手动）              |
| 分页工具             | `reldb.pagination.*`       | `normalize` 参数校验 / `build` 构造结果      |
| JSON 路径操作        | `reldb.json.*`             | 跨数据库统一 JSON 表达式构建                 |

### 3. DDL 操作

```ts
// 建表
await reldb.ddl.createTable('users', {
  id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
  name: { type: 'TEXT', notNull: true },
  email: { type: 'TEXT', unique: true },
  created_at: { type: 'TIMESTAMP', notNull: true },
}, true) // ifNotExists = true

// 加列
await reldb.ddl.addColumn('users', 'avatar', { type: 'TEXT' })

// 创建索引
await reldb.ddl.createIndex('users', 'idx_users_email', {
  columns: ['email'],
  unique: true,
})

// 原始 DDL
await reldb.ddl.raw('ALTER TABLE users ADD CONSTRAINT ...')

// 删表（ifExists）
await reldb.ddl.dropTable('users', true)
```

> DDL 完整方法：`createTable` / `dropTable` / `addColumn` / `dropColumn` / `renameTable` / `createIndex` / `dropIndex` / `raw`。

### 4. SQL 操作

```ts
// 查多条
const users = await reldb.sql.query<{ id: number, name: string }>('SELECT * FROM users')

// 查单条
const user = await reldb.sql.get<{ id: number, name: string }>('SELECT * FROM users WHERE id = ?', [1])

// 执行（INSERT/UPDATE/DELETE）
const execResult = await reldb.sql.execute(
  'INSERT INTO users (name, email) VALUES (?, ?)',
  ['张三', 'test@example.com'],
)
// execResult.data => { changes: 1, lastInsertRowid: 1 }

// 批量执行
await reldb.sql.batch([
  { sql: 'INSERT INTO users (name) VALUES (?)', params: ['用户1'] },
  { sql: 'INSERT INTO users (name) VALUES (?)', params: ['用户2'] },
])

// 分页查询
const page = await reldb.sql.queryPage<{ id: number, name: string }>({
  sql: 'SELECT id, name FROM users ORDER BY id',
  pagination: { page: 1, pageSize: 20 },
})
// page.data => { items: [...], total, page, pageSize, totalPages }
```

> **参数占位符**统一使用 `?`（跨数据库兼容）。

### 5. CRUD 操作（reldb.crud.table）

轻量级 CRUD，适用于简单场景，免写 SQL：

```ts
const userCrud = reldb.crud.table<{ id: number, name: string, email: string }>({
  table: 'users',
  idColumn: 'id', // 主键列，默认 'id'
  select: ['id', 'name', 'email'], // 查询列，默认 '*'
  createColumns: ['name', 'email'], // 允许插入的列
  updateColumns: ['name', 'email'], // 允许更新的列
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

#### findById / findAll / findPage

```ts
// 主键查找
const user = await userCrud.findById(1)
// user.data → { id: 1, name: '张三', email: 'test@example.com' } | null

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
await userCrud.updateById(1, { name: '新名字' })
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

#### 事务中使用 Crud

所有方法均支持传入 `tx` 参数，自动路由到事务上下文：

```ts
await reldb.tx.wrap(async (tx) => {
  await userCrud.create({ name: '用户A', email: 'a@test.com' }, tx)
  await userCrud.updateById(1, { name: '新名字' }, tx)
  const user = await userCrud.findById(1, tx)
})
```

### 6. 事务

三种模式，根据场景选择：

#### wrap（推荐 — 自动提交/回滚）

```ts
const result = await reldb.tx.wrap(async (tx) => {
  await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
  await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])

  // 可在事务内使用 batch / queryPage
  await tx.batch([
    { sql: 'INSERT INTO logs (msg) VALUES (?)', params: ['op1'] },
    { sql: 'INSERT INTO logs (msg) VALUES (?)', params: ['op2'] },
  ])

  const page = await tx.queryPage<{ id: number, name: string }>({
    sql: 'SELECT id, name FROM users ORDER BY id',
    pagination: { page: 1, pageSize: 10 },
  })

  return page
})
// 回调正常返回 → 自动提交；抛异常 → 自动回滚
```

#### begin + commit（分步提交）

```ts
const txResult = await reldb.tx.begin()
if (!txResult.success) { /* 处理错误 */ }
const tx = txResult.data

await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
await tx.commit()
```

#### begin + rollback（分步回滚）

```ts
const txResult = await reldb.tx.begin()
if (!txResult.success) { /* 处理错误 */ }
const tx = txResult.data

await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
// 业务检查失败
await tx.rollback()
```

> **选型建议**：优先用 `wrap`，避免遗漏 `commit/rollback`。仅在需要条件式提交/回滚时用 `begin`。

### 7. CRUD + 事务组合

所有 CRUD 方法支持传入 `tx` 句柄（同一事务内跨仓库操作）：

```ts
// reldb.crud.table + tx
await reldb.tx.wrap(async (tx) => {
  await userCrud.create({ name: '用户A', email: 'a@test.com' }, tx)
  await userCrud.create({ name: '用户B', email: 'b@test.com' }, tx)
  await orderCrud.create({ userId: 1, amount: 100 }, tx)
})

// begin 模式
const txResult = await reldb.tx.begin()
if (txResult.success) {
  const tx = txResult.data
  await userCrud.create({ name: '用户C', email: 'c@test.com' }, tx)
  // tx 上也可以直接使用 CRUD
  const txOrderCrud = tx.crud.table<{ id: number, userId: number }>({
    table: 'orders',
    idColumn: 'id',
    select: ['id', 'userId'],
    createColumns: ['userId'],
    updateColumns: [],
  })
  await txOrderCrud.create({ userId: 1 }, tx)
  await tx.commit()
}
```

### 8. BaseReldbCrudRepository（业务仓库）

适用于需要字段映射、自动建表、类型转换、时间戳自动填充的业务场景：

```ts
import type { ReldbCrudFieldDefinition, ReldbTxHandle } from '@h-ai/reldb'
import { BaseReldbCrudRepository, reldb } from '@h-ai/reldb'

/** 行类型定义 */
interface UserRow {
  id: number
  name: string
  email: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

/** 字段映射（字段级 select/create/update 控制） */
const USER_FIELDS: ReldbCrudFieldDefinition[] = [
  { fieldName: 'id', columnName: 'id', def: { type: 'INTEGER', primaryKey: true, autoIncrement: true }, select: true, create: false, update: false },
  { fieldName: 'name', columnName: 'name', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
  { fieldName: 'email', columnName: 'email', def: { type: 'TEXT', notNull: true, unique: true }, select: true, create: true, update: true },
  { fieldName: 'isActive', columnName: 'is_active', def: { type: 'BOOLEAN', notNull: true, defaultValue: 1 }, select: true, create: true, update: true },
  { fieldName: 'createdAt', columnName: 'created_at', def: { type: 'TIMESTAMP', notNull: true }, select: true, create: true, update: false },
  { fieldName: 'updatedAt', columnName: 'updated_at', def: { type: 'TIMESTAMP', notNull: true }, select: true, create: true, update: false },
]

class UserRepository extends BaseReldbCrudRepository<UserRow> {
  constructor() {
    super(reldb, {
      table: 'users',
      idColumn: 'id',
      fields: USER_FIELDS,
      createTableIfNotExists: true, // 首次使用自动建表
    })
  }

  /** 自定义查询：按邮箱查找 */
  async findByEmail(email: string, tx?: ReldbTxHandle) {
    return this.findAll({ where: 'email = ?', params: [email], limit: 1 }, tx)
  }

  /** 自定义查询：使用 this.sql(tx) 自动路由到事务或 reldb.sql */
  async countActive(tx?: ReldbTxHandle) {
    return this.sql(tx).get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users WHERE is_active = ?', [1])
  }

  /** 自定义原始 SQL（在事务内） */
  async deactivateByEmail(email: string, tx?: ReldbTxHandle) {
    return this.sql(tx).execute(
      'UPDATE users SET is_active = ?, updated_at = ? WHERE email = ?',
      [0, Date.now(), email],
    )
  }
}
```

#### BaseReldbCrudRepository 完整方法

| 方法         | 签名                                                                    | 说明                                                    |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| `create`     | `(data, tx?) => Promise<Result<ExecuteResult, ReldbError>>`             | 插入一条（自动填充 PK、createdAt、updatedAt）           |
| `createMany` | `(items, tx?) => Promise<Result<void, ReldbError>>`                     | 批量插入                                                |
| `findById`   | `(id, tx?) => Promise<Result<TItem \| null, ReldbError>>`               | 按主键查找                                              |
| `findAll`    | `(options?, tx?) => Promise<Result<TItem[], ReldbError>>`               | 条件查询（`where / params / orderBy / limit / offset`） |
| `findPage`   | `(options, tx?) => Promise<Result<PaginatedResult<TItem>, ReldbError>>` | 分页查询                                                |
| `updateById` | `(id, data, tx?) => Promise<Result<ExecuteResult, ReldbError>>`         | 按主键更新（自动填充 updatedAt）                        |
| `deleteById` | `(id, tx?) => Promise<Result<ExecuteResult, ReldbError>>`               | 按主键删除                                              |
| `count`      | `(options?, tx?) => Promise<Result<number, ReldbError>>`                | 计数                                                    |
| `exists`     | `(options?, tx?) => Promise<Result<boolean, ReldbError>>`               | 条件存在性                                              |
| `existsById` | `(id, tx?) => Promise<Result<boolean, ReldbError>>`                     | 主键存在性                                              |

**Protected 辅助方法**：`sql(tx?)` 返回 `DataOperations`，根据是否传入 `tx` 自动选择 `reldb.sql` 或事务句柄。

#### 关键特性

- **自动建表**：`createTableIfNotExists: true` 时，首次调用任意方法会自动执行 `CREATE TABLE IF NOT EXISTS`。
- **字段级控制**：通过 `select / create / update` 布尔值精细控制哪些字段参与哪些操作。
- **跨数据库类型转换**：`BOOLEAN`、`TIMESTAMP`、`JSON` 类型在不同数据库间自动转换。
- **自动时间戳**：`create` 自动填充 `createdAt` + `updatedAt`；`updateById` 自动填充 `updatedAt`。
- **自动 ID 生成**：可通过 `generateId` 配置自定义 ID 生成策略。

### 9. 分页工具

```ts
// 参数规范化（裁剪 pageSize、设置默认值）
const normalized = reldb.pagination.normalize(
  { page: 1, pageSize: 100 },
  { maxPageSize: 50, defaultPageSize: 20 },
)
// => { page: 1, pageSize: 50, offset: 0, limit: 50 }

// 手动构建分页结果
const result = reldb.pagination.build(items, total, { page: 1, pageSize: 20 })
// => { items, total, page, pageSize, totalPages }
```

### 10. JSON 路径操作 — `reldb.json`

通过 `reldb.json` 构建跨数据库统一的 JSON 路径操作 SQL 表达式，返回 `{ sql, params }` 可直接嵌入 `reldb.sql.*`。

**路径格式**：遵循 SQL/JSON Path 标准，以 `$` 开头，例如 `$.key`、`$.key.subkey`、`$[0]`。

**跨数据库映射**：

| 操作      | SQLite         | PostgreSQL     | MySQL          |
| --------- | -------------- | -------------- | -------------- | -------- | ------------------ |
| `extract` | `json_extract` | `#>` (text[])  | `JSON_EXTRACT` |
| `set`     | `json_set`     | `jsonb_set`    | `JSON_SET`     |
| `insert`  | `json_insert`  | `jsonb_insert` | `JSON_INSERT`  |
| `remove`  | `json_remove`  | `#-` (text[])  | `JSON_REMOVE`  |
| `merge`   | `json_patch`   | `              |                | ::jsonb` | `JSON_MERGE_PATCH` |

```ts
// 提取 JSON 字段值（用于 WHERE 条件或 SELECT 列）
const { sql, params } = reldb.json.extract('settings', '$.theme')
const rows = await reldb.sql.query(
  `SELECT * FROM users WHERE ${sql} = ?`,
  [...params, '"dark"'],
)

// 设置 JSON 字段路径（创建或替换）
const { sql, params } = reldb.json.set('settings', '$.theme', 'dark')
await reldb.sql.execute(
  `UPDATE users SET settings = ${sql} WHERE id = ?`,
  [...params, userId],
)

// 插入 JSON 字段路径（仅当路径不存在时）
const { sql, params } = reldb.json.insert('data', '$.firstSeen', new Date().toISOString())
await reldb.sql.execute(`UPDATE events SET data = ${sql} WHERE id = ?`, [...params, id])

// 删除 JSON 字段路径
const { sql, params } = reldb.json.remove('settings', '$.deprecated')
await reldb.sql.execute(`UPDATE users SET settings = ${sql} WHERE id = ?`, [...params, id])

// 合并 JSON 对象（RFC 7396：null 值表示删除对应键）
const { sql, params } = reldb.json.merge('profile', { bio: '新简介', avatar: null })
await reldb.sql.execute(`UPDATE users SET profile = ${sql} WHERE id = ?`, [...params, userId])
```

> **注意**：`column` 参数为列名或 SQL 表达式，**禁止传入用户输入**（开发者负责安全性）。

---

## 错误处理

所有操作返回 `Result<T, ReldbError>`，通过 `result.success` 判断成功或失败。

```ts
import { reldb, ReldbErrorCode } from '@h-ai/reldb'

const result = await reldb.sql.query('SELECT * FROM users')
if (!result.success) {
  switch (result.error.code) {
    case ReldbErrorCode.NOT_INITIALIZED:
      // 未调用 reldb.init()
      break
    case ReldbErrorCode.QUERY_FAILED:
      // SQL 语法错误或执行失败
      break
    case ReldbErrorCode.CONSTRAINT_VIOLATION:
      // 唯一约束 / 外键约束违反
      break
    case ReldbErrorCode.TRANSACTION_FAILED:
      // 事务提交/回滚失败
      break
  }
}
```

### 完整错误码

| 错误码                 | 值   | 说明                    |
| ---------------------- | ---- | ----------------------- |
| `CONNECTION_FAILED`    | 3000 | 连接失败                |
| `QUERY_FAILED`         | 3001 | 查询/执行失败           |
| `CONSTRAINT_VIOLATION` | 3002 | 唯一约束 / 外键约束违反 |
| `TRANSACTION_FAILED`   | 3003 | 事务操作失败            |
| `MIGRATION_FAILED`     | 3004 | 迁移失败                |
| `RECORD_NOT_FOUND`     | 3005 | 记录未找到              |
| `DUPLICATE_ENTRY`      | 3006 | 重复记录                |
| `DEADLOCK`             | 3007 | 死锁                    |
| `TIMEOUT`              | 3008 | 超时                    |
| `POOL_EXHAUSTED`       | 3009 | 连接池耗尽              |
| `NOT_INITIALIZED`      | 3010 | 未初始化                |
| `DDL_FAILED`           | 3011 | DDL 操作失败            |
| `UNSUPPORTED_TYPE`     | 3012 | 不支持的数据库类型      |
| `CONFIG_ERROR`         | 3013 | 配置错误                |

---

## 核心类型速查

```ts
/** 列类型 */
type ColumnType = 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'BOOLEAN' | 'TIMESTAMP' | 'JSON'

/** 列定义 */
interface ReldbColumnDef {
  type: ColumnType
  primaryKey?: boolean
  autoIncrement?: boolean
  notNull?: boolean
  defaultValue?: unknown
  unique?: boolean
  references?: { table: string, column: string }
}

/** 执行结果 */
interface ExecuteResult { changes: number, lastInsertRowid?: number | bigint }

/** 分页查询参数 */
interface PaginationQueryOptions {
  sql: string
  params?: unknown[]
  pagination?: { page?: number, pageSize?: number }
  overrides?: { defaultPage?: number, defaultPageSize?: number, maxPageSize?: number }
}

/** 分页结果 */
interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** CRUD 字段定义（BaseReldbCrudRepository 使用） */
interface ReldbCrudFieldDefinition {
  fieldName: string // TypeScript 属性名（驼峰）
  columnName: string // 数据库列名（蛇形）
  def: ReldbColumnDef // 列定义
  select: boolean // 是否出现在 SELECT 列表
  create: boolean // 是否出现在 INSERT 列表
  update: boolean // 是否出现在 UPDATE SET 列表
}

/** 事务句柄（继承 DataOperations + crud） */
interface ReldbTxHandle extends DataOperations {
  crud: ReldbCrudManager
  commit: () => Promise<Result<void, ReldbError>>
  rollback: () => Promise<Result<void, ReldbError>>
}
```

---

## 常见边界与注意事项

| 场景                               | 行为                                                      |
| ---------------------------------- | --------------------------------------------------------- |
| `reldb.init()` 未调用              | `reldb.ddl / sql / tx / crud` 返回 `NOT_INITIALIZED` 错误 |
| CRUD `create/update` payload 为空  | 返回 `CONFIG_ERROR`                                       |
| SQLite `database` 参数             | 文件路径或 `:memory:`（内存）                             |
| PostgreSQL / MySQL 连接            | 支持 `url` 连接字符串或分字段配置                         |
| `reldb.pagination.normalize`       | 自动裁剪 `pageSize` 不超过 `maxPageSize`，避免过大分页    |
| `BaseReldbCrudRepository` 自动建表 | 需设置 `createTableIfNotExists: true`；默认不自动建表     |
| `BOOLEAN` 类型跨数据库             | SQLite 存储为 `0/1`，Repository 自动转换                  |
| `TIMESTAMP` 类型跨数据库           | SQLite 存储为毫秒时间戳，Repository 自动转换为 `Date`     |
| `wrap` 事务中抛异常                | 自动回滚，异常信息包装在 `TRANSACTION_FAILED` 错误中      |
| `begin` 后未 commit/rollback       | 连接泄漏风险，优先使用 `wrap`                             |

---

## 变更规范（改动 reldb 相关代码时必须遵守）

- 所有数据库操作函数返回 `Result<T, ReldbError>`，**禁止 throw**
- 禁止 `console.log`，使用模块 logger
- 禁止 `any`，必要时用 `unknown` 并做缩窄
- 用户可见文本必须使用 i18n key
- `index.ts` 仅做 `export *` 聚合
- 有功能变更必须补测试（Vitest），避免真实外部依赖
- 参数占位符统一使用 `?`
- 跨仓库事务使用 `tx` 句柄传递，不要在 Repository 内部开事务

---

## 触发提示

当用户提到以下关键词时优先启用本技能：

- 数据库 / 初始化 / 连接 / 事务 / 分页 / CRUD / SQL / DDL
- `reldb` / `ReldbErrorCode` / `BaseReldbCrudRepository` / `ReldbCrudFieldDefinition`
- SQLite / PostgreSQL / MySQL
- `wrap` / `begin` / `commit` / `rollback` / `queryPage` / `batch`
- 字段映射 / 自动建表 / 类型转换 / 时间戳填充
- JSON 路径 / `reldb.json` / `json_extract` / `jsonb_set` / `JSON_EXTRACT` / `json_patch`

```

```
