---
name: hai-db
description: 使用 @h-ai/db 进行 SQLite/PostgreSQL/MySQL 的初始化、SQL/DDL/CRUD/事务与分页操作；当需求涉及数据库访问、CRUD 仓库、事务处理、分页查询或 DbErrorCode 分支处理时使用。
---

# hai-db

> `@h-ai/db` 提供统一的数据库操作接口，支持 SQLite、PostgreSQL、MySQL，包含 DDL、SQL、CRUD 抽象、事务与分页。

---

## 适用场景

- 新增或修改数据库访问逻辑（SQL/DDL/CRUD/事务）
- 使用 `db.crud.table` 或 `BaseCrudRepository` 构建数据仓库
- 处理分页查询与分页结果规范化
- 基于 `DbErrorCode` 做错误分支处理

---

## 使用步骤

### 1. 配置

```yaml
# config/_db.yml
type: ${DB_TYPE:sqlite}
database: ${DB_DATABASE:./data/app.db}
# PostgreSQL/MySQL 额外字段：
# host: ${DB_HOST:localhost}
# port: ${DB_PORT:5432}
# user: ${DB_USER:postgres}
# password: ${DB_PASSWORD:}
```

### 2. 初始化与关闭

```typescript
import { core } from '@h-ai/core'
import { db } from '@h-ai/db'

await db.init(core.config.get('db'))
// ... 使用数据库
await db.close()
```

### 3. 选择操作接口

| 接口 | 用途               | 入口                         |
| ---- | ------------------ | ---------------------------- |
| DDL  | 建表/索引/字段变更 | `db.ddl`                     |
| SQL  | 原始查询/执行/分页 | `db.sql`                     |
| CRUD | 通用增删改查       | `db.crud.table(config)`      |
| 仓库 | 业务数据仓库封装   | `extends BaseCrudRepository` |
| 事务 | 事务管理           | `db.tx`                      |
| 分页 | 分页参数与结果     | `db.pagination`              |

---

## 核心 API

### DDL — `db.ddl`

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

> 所有方法均返回 `Promise<Result<void, DbError>>`，上表省略异步与错误类型。

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
| TIMESTAMP | INTEGER | TIMESTAMPTZ      | DATETIME     |
| JSON      | TEXT    | JSONB            | JSON         |

> MySQL 将 TEXT 映射为 VARCHAR(255) 以支持索引和 UNIQUE 约束。INTEGER + autoIncrement 在 MySQL 映射为 BIGINT。

### SQL — `db.sql`

| 方法        | 签名                                                              | 说明         |
| ----------- | ----------------------------------------------------------------- | ------------ |
| `query`     | `<T>(sql, params?) => Result<T[]>`                                | 查询返回多行 |
| `get`       | `<T>(sql, params?) => Result<T \| null>`                          | 查询返回单行 |
| `execute`   | `(sql, params?) => Result<ExecuteResult>`                         | 执行写操作   |
| `batch`     | `(statements: Array<{ sql, params? }>) => Result<void>`           | 批量执行     |
| `queryPage` | `<T>(options: PaginationQueryOptions) => Result<PaginatedResult>` | 分页查询     |

> 所有方法均返回 `Promise<Result<T, DbError>>`，上表省略异步与错误类型。

**参数占位符统一使用 `?`**（PostgreSQL 的 `$n` 由 Provider 自动转换）：

```typescript
const result = await db.sql.query<User>(
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
const page = await db.sql.queryPage<User>({
  sql: 'SELECT * FROM users WHERE status = ? ORDER BY id',
  params: ['active'],
  pagination: { page: 1, pageSize: 20 },
  overrides: { maxPageSize: 100 }, // 可选：限制最大页大小
})
// page.data => { items, total, page, pageSize }
```

### CRUD — `db.crud.table(config)`

```typescript
const userCrud = db.crud.table({
  table: 'users',
  idColumn: 'id',
  select: ['id', 'name', 'email', 'created_at'],
  createColumns: ['name', 'email'],
  updateColumns: ['name', 'email'],
})
```

返回的 CrudRepository 方法：

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

### BaseCrudRepository

业务仓库基类，提供字段映射、自动建表与类型转换能力：

```typescript
import { BaseCrudRepository } from '@h-ai/db'

interface User { id: number, name: string, email: string, createdAt: Date, updatedAt: Date }

class UserRepository extends BaseCrudRepository<User> {
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
  async findByEmail(email: string, tx?: TxHandle) {
    return this.sql(tx).get<User>('SELECT * FROM users WHERE email = ?', [email])
  }
}
```

**`this.sql(tx?)`**：返回 `DataOperations`（`db.sql` 或传入的事务句柄），自动适配事务场景。

**自动能力**：

- `createdAt` / `updatedAt` 字段自动填充时间戳
- 主键生成（非 autoIncrement 主键默认使用 `crypto.randomUUID()`）
- BOOLEAN → 1/0（SQLite/MySQL）或 true/false（PostgreSQL）
- TIMESTAMP → 毫秒时间戳（SQLite）或 Date（PG/MySQL）
- JSON → 字符串序列化（SQLite/MySQL）或原生 JSONB（PG）

### 事务 — `db.tx`

```typescript
// 方式1：wrap（自动 commit/rollback）
const result = await db.tx.wrap(async (tx) => {
  await tx.execute('INSERT INTO users (name) VALUES (?)', ['张三'])
  await tx.execute('INSERT INTO logs (action) VALUES (?)', ['user_created'])
  return 'done'
})
// result.data === 'done'（正常返回自动 commit）
// 回调抛异常 → 自动 rollback → result.success === false

// 方式2：手动管理
const txResult = await db.tx.begin()
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

**事务内可用操作**（`TxHandle` 继承 `DataOperations`）：

- `tx.query / tx.get / tx.execute / tx.batch / tx.queryPage`
- `tx.crud.table(config)` — 事务内的 CRUD 仓库
- `tx.commit() / tx.rollback()`

### 分页 — `db.pagination`

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

## 错误码 — `DbErrorCode`

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
import { db, DbErrorCode } from '@h-ai/db'
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
const result = await db.tx.wrap(async (tx) => {
  const user = await userRepo.create(userData, tx)
  if (!user.success)
    throw new Error(user.error.message)

  await profileRepo.create({ userId: user.data.lastInsertRowid, ...profileData }, tx)
  return user.data
})
```

### BaseCrudRepository 事务集成

```typescript
const txResult = await db.tx.begin()
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
- `hai-iam`：IAM 模块内部使用 db 进行用户/角色/权限存储
- `hai-cache`：缓存穿透保护中配合 db 使用
