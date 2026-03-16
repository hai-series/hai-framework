---
name: hai-reldb
description: 使用 @h-ai/reldb 进行 SQLite/PostgreSQL/MySQL 的初始化、SQL/DDL/CRUD/事务与分页操作；当需求涉及数据库访问、CRUD 仓库、事务处理、分页查询或 ReldbErrorCode 分支处理时使用。
---

# hai-reldb

> `@h-ai/reldb` 提供统一的数据库操作接口，支持 SQLite、PostgreSQL、MySQL，包含 DDL、SQL、CRUD 抽象、事务与分页。

---

## 适用场景

- 新增或修改数据库访问逻辑（SQL/DDL/CRUD/事务）
- 使用 `reldb.crud.table` 或 `BaseReldbCrudRepository` 构建数据仓库
- 处理分页查询与分页结果规范化
- 基于 `ReldbErrorCode` 做错误分支处理
- JSON 列的路径提取、设置、插入、删除、合并操作（跨数据库统一语法）

---

## 使用步骤

### 1. 配置

```yaml
# config/_db.yml
type: ${HAI_DB_TYPE:sqlite}
database: ${HAI_DB_DATABASE:./data/app.db}
# PostgreSQL/MySQL 额外字段：
# host: ${HAI_DB_HOST:localhost}
# port: ${HAI_DB_PORT:5432}
# user: ${HAI_DB_USER:postgres}
# password: ${HAI_DB_PASSWORD:}
```

### 2. 初始化与关闭

```typescript
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'

await reldb.init(core.config.get('db'))
// ... 使用数据库
await reldb.close()
```

### 3. 选择操作接口

| 接口 | 用途               | 入口                         |
| ---- | ------------------ | ---------------------------- |
| DDL  | 建表/索引/字段变更 | `reldb.ddl`                     |
| SQL  | 原始查询/执行/分页 | `reldb.sql`                     |
| CRUD | 通用增删改查       | `reldb.crud.table(config)`      |
| 仓库 | 业务数据仓库封装   | `extends BaseReldbCrudRepository` |
| 事务 | 事务管理           | `reldb.tx`                      |
| 分页 | 分页参数与结果     | `reldb.pagination`              |
| JSON | JSON 路径操作      | `reldb.json`                    |

---

## 核心 API

### DDL — `reldb.ddl`

| 方法          | 签名                                                                    | 说明                       |
| ------------- | ----------------------------------------------------------------------- | -------------------------- |
| `createTable` | `(tableName, columns: TableDef, ifNotExists?: boolean) => Result<void>` | 建表（默认 IF NOT EXISTS） |
| `dropTable`   | `(tableName, ifExists?: boolean) => Result<void>`                       | 删除表（默认 IF EXISTS）   |
| `addColumn`   | `(tableName, columnName, columnDef: ColumnDef) => Result<void>`         | 添加列                     |
| `dropColumn`  | `(tableName, columnName) => Result<void>`                               | 删除列                     |
| `renameTable` | `(oldName, newName) => Result<void>`                                    | 重命名表                   |
| `createIndex` | `(tableName, indexName, indexDef: IndexDef) => Result<void>`            | 创建索引                   |
| `dropIndex`   | `(indexName, ifExists?: boolean) => Result<void>`                       | 删除索引                   |
| `raw`         | `(sql: string) => Result<void>`                                         | 执行原始 DDL               |

> 所有方法均返回 `Promise<Result<void, ReldbError>>`，上表省略异步与错误类型。

**TableDef**（列名到列定义的映射）：

```typescript
const columns: TableDef = {
  id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
  name: { type: 'TEXT', notNull: true },
  email: { type: 'TEXT', unique: true },
  score: { type: 'REAL', defaultValue: 0 },
  active: { type: 'BOOLEAN' },
  metadata: { type: 'JSON' },
  created_at: { type: 'TIMESTAMP' },
}
```

**ColumnDef**（列类型与约束）：

```typescript
interface ColumnDef {
  type: 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'BOOLEAN' | 'TIMESTAMP' | 'JSON'
  primaryKey?: boolean
  autoIncrement?: boolean
  notNull?: boolean
  unique?: boolean
  defaultValue?: string | number | boolean | null
  references?: { table: string, column: string, onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION', onUpdate?: '...' }
}
```

**跨数据库类型映射**：

| 类型      | SQLite  | PostgreSQL       | MySQL        |
| --------- | ------- | ---------------- | ------------ |
| TEXT      | TEXT    | TEXT             | VARCHAR(255) |
| INTEGER   | INTEGER | INTEGER/SERIAL   | INT/BIGINT   |
| REAL      | REAL    | DOUBLE PRECISION | DOUBLE       |
| BLOB      | BLOB    | BYTEA            | BLOB         |
| BOOLEAN   | INTEGER | BOOLEAN          | TINYINT(1)   |
| TIMESTAMP | INTEGER | TIMESTAMP        | DATETIME     |
| JSON      | TEXT    | JSONB            | JSON         |

> MySQL 将 TEXT 映射为 VARCHAR(255) 以支持索引和 UNIQUE 约束。INTEGER + autoIncrement 在 MySQL 映射为 BIGINT。

### SQL — `reldb.sql`

| 方法        | 签名                                                              | 说明         |
| ----------- | ----------------------------------------------------------------- | ------------ |
| `query`     | `<T>(sql, params?) => Result<T[]>`                                | 查询返回多行 |
| `get`       | `<T>(sql, params?) => Result<T \| null>`                          | 查询返回单行 |
| `execute`   | `(sql, params?) => Result<ExecuteResult>`                         | 执行写操作   |
| `batch`     | `(statements: Array<{ sql, params? }>) => Result<void>`           | 批量执行     |
| `queryPage` | `<T>(options: PaginationQueryOptions) => Result<PaginatedResult>` | 分页查询     |

> 所有方法均返回 `Promise<Result<T, ReldbError>>`，上表省略异步与错误类型。

**参数占位符统一使用 `?`**（PostgreSQL 的 `$n` 由 Provider 自动转换）：

```typescript
const result = await reldb.sql.query<User>(
  'SELECT * FROM users WHERE status = ? AND age > ?',
  ['active', 18],
)
```

**ExecuteResult**：

```typescript
interface ExecuteResult {
  changes: number // 影响的行数
  lastInsertRowid?: number | bigint // INSERT 时生效（PostgreSQL 不返回此字段）
}
```

**分页查询**：

```typescript
const page = await reldb.sql.queryPage<User>({
  sql: 'SELECT * FROM users WHERE status = ? ORDER BY id',
  params: ['active'],
  pagination: { page: 1, pageSize: 20 },
  overrides: { maxPageSize: 100 }, // 可选：限制最大页大小
})
// page.data => { items, total, page, pageSize }
```

### CRUD — `reldb.crud.table(config)`

通过配置创建单表 CRUD 仓库，免写 SQL：

```typescript
const userCrud = reldb.crud.table<{ id: number, name: string, email: string }>({
  table: 'users',
  idColumn: 'id',           // 主键列，默认 'id'
  select: ['id', 'name', 'email'],   // 查询列，默认 '*'
  createColumns: ['name', 'email'],   // 允许插入的列
  updateColumns: ['name', 'email'],   // 允许更新的列
})
```

返回的 ReldbCrudRepository 方法：

| 方法         | 签名                                           | 说明         |
| ------------ | ---------------------------------------------- | ------------ |
| `create`     | `(data, tx?) => Result<ExecuteResult>`         | 创建单条     |
| `createMany` | `(items, tx?) => Result<void>`                 | 批量创建     |
| `findById`   | `(id, tx?) => Result<T \| null>`               | 按 ID 查询   |
| `findAll`    | `(options?, tx?) => Result<T[]>`               | 条件查询     |
| `findPage`   | `(options, tx?) => Result<PaginatedResult<T>>` | 分页查询     |
| `updateById` | `(id, data, tx?) => Result<ExecuteResult>`     | 按 ID 更新   |
| `deleteById` | `(id, tx?) => Result<ExecuteResult>`           | 按 ID 删除   |
| `count`      | `(options?, tx?) => Result<number>`            | 计数         |
| `exists`     | `(options?, tx?) => Result<boolean>`           | 条件是否存在 |
| `existsById` | `(id, tx?) => Result<boolean>`                 | ID 是否存在  |

> 所有方法均支持可选 `tx` 事务参数。`create`/`updateById` 中的 `data` 会根据 `createColumns`/`updateColumns` 白名单过滤列。

**使用示例**：

```typescript
// 单条插入
const result = await userCrud.create({ name: '张三', email: 'test@example.com' })
// result.data → { changes: 1, lastInsertRowid: 1 }

// 批量插入
await userCrud.createMany([
  { name: '用户A', email: 'a@test.com' },
  { name: '用户B', email: 'b@test.com' },
])

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

// 更新 / 删除
await userCrud.updateById(1, { name: '新名字' })
await userCrud.deleteById(1)

// 计数 / 存在性
const total = await userCrud.count({ where: 'name LIKE ?', params: ['%张%'] })
const has = await userCrud.exists({ where: 'email = ?', params: ['test@example.com'] })
const found = await userCrud.existsById(1)

// 事务中使用（所有方法均支持 tx 参数）
await reldb.tx.wrap(async (tx) => {
  await userCrud.create({ name: '用户A', email: 'a@test.com' }, tx)
  await userCrud.updateById(1, { name: '新名字' }, tx)
  const user = await userCrud.findById(1, tx)
})
```

### BaseReldbCrudRepository

业务仓库基类，提供字段映射、自动建表与类型转换能力：

```typescript
import { BaseReldbCrudRepository } from '@h-ai/reldb'

interface User { id: number, name: string, email: string, createdAt: Date, updatedAt: Date }

class UserRepository extends BaseReldbCrudRepository<User> {
  constructor() {
    super(db, {
      table: 'users',
      idColumn: 'id',
      fields: [
        { fieldName: 'id', columnName: 'id', def: { type: 'INTEGER', primaryKey: true, autoIncrement: true }, select: true, create: false, update: false },
        { fieldName: 'name', columnName: 'name', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
        { fieldName: 'email', columnName: 'email', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
        { fieldName: 'createdAt', columnName: 'created_at', def: { type: 'TIMESTAMP', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'updatedAt', columnName: 'updated_at', def: { type: 'TIMESTAMP', notNull: true }, select: true, create: true, update: false },
      ],
    })
  }

  /** 自定义查询示例 */
  async findByEmail(email: string, tx?: DmlWithTxOperations) {
    return this.sql(tx).get<User>('SELECT * FROM users WHERE email = ?', [email])
  }
}
```

**`this.sql(tx?)`**：返回 `DmlOperations`（`reldb.sql` 或传入的事务句柄），自动适配事务场景。

**自动能力**：

- `createdAt` / `updatedAt` 字段自动填充时间戳
- 主键生成（非 autoIncrement 主键默认使用 `crypto.randomUUID()`）
- BOOLEAN → 1/0（SQLite/MySQL）或 true/false（PostgreSQL）
- TIMESTAMP → 毫秒时间戳（SQLite）或 Date（PG/MySQL）
- JSON → 字符串序列化（SQLite/MySQL）或原生 JSONB（PG）

### 事务 — `reldb.tx`

```typescript
// 方式1：wrap（自动 commit/rollback）
const result = await reldb.tx.wrap(async (tx) => {
  await tx.execute('INSERT INTO users (name) VALUES (?)', ['张三'])
  await tx.execute('INSERT INTO logs (action) VALUES (?)', ['user_created'])
  return 'done'
})
// result.data === 'done'（正常返回自动 commit）
// 回调抛异常 → 自动 rollback → result.success === false

// 方式2：手动管理
const txResult = await reldb.tx.begin()
if (txResult.success) {
  const tx = txResult.data
  try {
    await tx.execute('INSERT INTO users (name) VALUES (?)', ['李四'])
    await tx.commit()
  }
  catch {
    await tx.rollback()
  }
}
```

**事务内可用操作**（`DmlWithTxOperations` 继承 `DmlOperations`）：

- `tx.query / tx.get / tx.execute / tx.batch / tx.queryPage`
- `tx.crud.table(config)` — 事务内的 CRUD 仓库
- `tx.commit() / tx.rollback()`

### 分页 — `reldb.pagination`

| 方法        | 签名                                                  | 说明                                   |
| ----------- | ----------------------------------------------------- | -------------------------------------- |
| `normalize` | `(options?, overrides?) => NormalizedPagination`      | 规范化分页参数（含 offset/limit 计算） |
| `build`     | `<T>(items, total, pagination) => PaginatedResult<T>` | 构建分页结果对象                       |

```typescript
// PaginatedResult 结构
interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

// 默认值：page=1, pageSize=20, maxPageSize=200
```

---

### JSON — `reldb.json`

通过 `reldb.json` 构建跨数据库统一的 JSON 路径操作 SQL 表达式，返回 `{ sql, params }` 可直接嵌入 `reldb.sql.*`。

路径格式遵循 SQL/JSON Path 标准，以 `$` 开头（如 `$.key`、`$.key.subkey`、`$[0]`）。

| 操作      | SQLite             | PostgreSQL               | MySQL                  |
| --------- | ------------------ | ------------------------ | ---------------------- |
| `extract` | `json_extract`     | `#>` (text[])            | `JSON_EXTRACT`         |
| `set`     | `json_set`         | `jsonb_set`              | `JSON_SET`             |
| `insert`  | `json_insert`      | `jsonb_insert`           | `JSON_INSERT`          |
| `remove`  | `json_remove`      | `#-` (text[])            | `JSON_REMOVE`          |
| `merge`   | `json_patch`       | `|| ::jsonb`              | `JSON_MERGE_PATCH`     |

```typescript
// 提取 JSON 字段值（用于 WHERE 条件）
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

// 删除 JSON 字段路径
const { sql, params } = reldb.json.remove('settings', '$.deprecated')
await reldb.sql.execute(`UPDATE users SET settings = ${sql} WHERE id = ?`, [...params, id])

// 合并 JSON 对象（RFC 7396：null 值表示删除对应键）
const { sql, params } = reldb.json.merge('profile', { bio: '新简介', avatar: null })
await reldb.sql.execute(`UPDATE users SET profile = ${sql} WHERE id = ?`, [...params, userId])
```

> `column` 参数为列名，**禁止传入用户输入**（开发者负责安全性）。

---

## 错误码 — `ReldbErrorCode`

| 错误码                 | 值   | 说明               |
| ---------------------- | ---- | ------------------ |
| `CONNECTION_FAILED`    | 3000 | 数据库连接失败     |
| `QUERY_FAILED`         | 3001 | 查询或执行失败     |
| `CONSTRAINT_VIOLATION` | 3002 | 约束违反           |
| `TRANSACTION_FAILED`   | 3003 | 事务失败           |
| `MIGRATION_FAILED`     | 3004 | 迁移失败           |
| `RECORD_NOT_FOUND`     | 3005 | 记录不存在         |
| `DUPLICATE_ENTRY`      | 3006 | 重复条目           |
| `DEADLOCK`             | 3007 | 死锁               |
| `TIMEOUT`              | 3008 | 超时               |
| `POOL_EXHAUSTED`       | 3009 | 连接池耗尽         |
| `NOT_INITIALIZED`      | 3010 | 数据库未初始化     |
| `DDL_FAILED`           | 3011 | DDL 操作失败       |
| `UNSUPPORTED_TYPE`     | 3012 | 不支持的数据库类型 |
| `CONFIG_ERROR`         | 3013 | 配置错误           |

---

## 常见模式

### API 端点中使用

```typescript
import { reldb, ReldbErrorCode } from '@h-ai/reldb'
import { kit } from '@h-ai/kit'

export async function GET(event) {
  const { valid, data } = kit.validate.query(event.url, PageSchema)
  if (!valid)
    return kit.response.badRequest('Invalid params')

  const result = await userCrud.findPage({
    pagination: data,
    orderBy: 'id ASC',
  })
  if (!result.success)
    return kit.response.internalError()

  return kit.response.ok(result.data)
}
```

### 事务跨仓库

```typescript
const result = await reldb.tx.wrap(async (tx) => {
  const user = await userRepo.create(userData, tx)
  if (!user.success)
    throw new Error(user.error.message)

  await profileRepo.create({ userId: user.data.lastInsertRowid, ...profileData }, tx)
  return user.data
})
```

### BaseReldbCrudRepository 事务集成

```typescript
const txResult = await reldb.tx.begin()
if (txResult.success) {
  const tx = txResult.data
  await userRepo.create({ name: '用户A', email: 'a@test.com' }, tx)
  await userRepo.create({ name: '用户B', email: 'b@test.com' }, tx)
  await tx.commit()
}
```

---

## 相关 Skills

- `hai-build`：模块初始化顺序
- `hai-core`：配置管理、Result 模型
- `hai-iam`：IAM 模块内部使用 reldb 进行用户/角色/权限存储
- `hai-cache`：缓存穿透保护中配合 reldb 使用
