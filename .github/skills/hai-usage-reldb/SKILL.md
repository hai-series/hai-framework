---
name: hai-usage-reldb
description: "Use when: using @h-ai/reldb, database operations, SQL queries, DDL, CRUD, transactions, pagination, JSON operations, BaseReldbCrudRepository, ReldbErrorCode, table creation, database access. 使用 @h-ai/reldb 进行 SQLite/PostgreSQL/MySQL 的初始化、SQL/DDL/CRUD/事务与分页操作。"
---

# hai-usage-reldb — 数据库操作指南

> `@h-ai/reldb` 提供统一的数据库操作接口，支持 SQLite、PostgreSQL、MySQL，包含 DDL、SQL、CRUD 抽象、事务与分页。

---

## §1 配置与初始化

### 配置

```yaml
# config/_db.yml
type: ${HAI_RELDB_TYPE:sqlite}
database: ${HAI_RELDB_DATABASE:./data/app.db}
# PostgreSQL/MySQL 额外字段：
# host: ${HAI_RELDB_HOST:localhost}
# port: ${HAI_RELDB_PORT:5432}
# user: ${HAI_RELDB_USER:postgres}
# password: ${HAI_RELDB_PASSWORD:}
```

### 初始化与关闭

```typescript
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'

await reldb.init(core.config.get('db'))
// ... 使用数据库
await reldb.close()
```

### 命名约定（与模块规范保持一致）

- 表名必须使用 `hai_<module>_<feature>`（如 `hai_iam_users`）
- 缓存 key（如该仓库逻辑涉及 cache）必须使用 `hai:<module>:<feature>`（如 `hai:iam:user:123`）
- 表名/缓存 key 常量应在使用处就近定义，不做配置项暴露

---

## §2 操作接口总览

| 接口 | 用途 | 入口 |
|------|------|------|
| DDL | 建表/索引/字段变更 | `reldb.ddl` |
| SQL | 原始查询/执行/分页 | `reldb.sql` |
| CRUD | 通用增删改查 | `reldb.crud.table(config)` |
| 仓库 | 业务数据仓库封装 | `extends BaseReldbCrudRepository` |
| 事务 | 事务管理 | `reldb.tx` |
| 分页 | 分页参数与结果 | `reldb.pagination` |
| JSON | JSON 路径操作 | `reldb.json` |

---

## §3 DDL — `reldb.ddl`

| 方法 | 签名 | 说明 |
|------|------|------|
| `createTable` | `(tableName, columns: TableDef, ifNotExists?) => HaiResult<void>` | 建表（默认 IF NOT EXISTS） |
| `dropTable` | `(tableName, ifExists?) => HaiResult<void>` | 删除表 |
| `addColumn` | `(tableName, columnName, columnDef) => HaiResult<void>` | 添加列 |
| `dropColumn` | `(tableName, columnName) => HaiResult<void>` | 删除列 |
| `renameTable` | `(oldName, newName) => HaiResult<void>` | 重命名表 |
| `createIndex` | `(tableName, indexName, indexDef) => HaiResult<void>` | 创建索引 |
| `dropIndex` | `(indexName, ifExists?) => HaiResult<void>` | 删除索引 |
| `raw` | `(sql: string) => HaiResult<void>` | 执行原始 DDL |

> 所有方法返回 `Promise<HaiResult<void>>`。

### TableDef 与 ColumnDef

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

### 跨数据库类型映射

| 类型 | SQLite | PostgreSQL | MySQL |
|------|--------|-----------|-------|
| TEXT | TEXT | TEXT | VARCHAR(255) |
| INTEGER | INTEGER | INTEGER/SERIAL | INT/BIGINT |
| REAL | REAL | DOUBLE PRECISION | DOUBLE |
| BLOB | BLOB | BYTEA | BLOB |
| BOOLEAN | INTEGER | BOOLEAN | TINYINT(1) |
| TIMESTAMP | INTEGER | TIMESTAMPTZ | DATETIME |
| JSON | TEXT | JSONB | JSON |

---

## §4 SQL — `reldb.sql`

| 方法 | 签名 | 说明 |
|------|------|------|
| `query` | `<T>(sql, params?) => HaiResult<T[]>` | 查询多行 |
| `get` | `<T>(sql, params?) => HaiResult<T \| null>` | 查询单行 |
| `execute` | `(sql, params?) => HaiResult<ExecuteResult>` | 执行写操作 |
| `batch` | `(statements: Array<{ sql, params? }>) => HaiResult<void>` | 批量执行 |
| `queryPage` | `<T>(options) => HaiResult<PaginatedResult>` | 分页查询 |

**参数占位符统一使用 `?`**（PostgreSQL 的 `$n` 由 Provider 自动转换）：

```typescript
const result = await reldb.sql.query<User>(
  'SELECT * FROM hai_demo_users WHERE status = ? AND age > ?',
  ['active', 18],
)
```

**分页查询**：

```typescript
const page = await reldb.sql.queryPage<User>({
  sql: 'SELECT * FROM hai_demo_users WHERE status = ? ORDER BY id',
  params: ['active'],
  pagination: { page: 1, pageSize: 20 },
  overrides: { maxPageSize: 100 },
})
// page.data => { items, total, page, pageSize }
```

---

## §5 CRUD — `reldb.crud.table(config)`

通过配置创建单表 CRUD 仓库，免写 SQL：

```typescript
const userCrud = reldb.crud.table<{ id: number, name: string, email: string }>({
  table: 'hai_demo_users',
  idColumn: 'id',
  select: ['id', 'name', 'email'],
  createColumns: ['name', 'email'],
  updateColumns: ['name', 'email'],
  dbType: 'sqlite',
})
```

### CRUD 方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `create` | `(data, tx?) => HaiResult<ExecuteResult>` | 创建 |
| `createMany` | `(items, tx?) => HaiResult<void>` | 批量创建 |
| `createOrUpdate` | `(data, tx?) => HaiResult<ExecuteResult>` | 创建或更新（upsert） |
| `findById` | `(id, tx?) => HaiResult<T \| null>` | 按 ID 查（不存在返回 null） |
| `getById` | `(id, tx?) => HaiResult<T>` | 按 ID 获取（不存在返回 RECORD_NOT_FOUND 错误） |
| `findAll` | `(options?, tx?) => HaiResult<T[]>` | 条件查询 |
| `findPage` | `(options, tx?) => HaiResult<PaginatedResult<T>>` | 分页查询 |
| `updateById` | `(id, data, tx?) => HaiResult<ExecuteResult>` | 按 ID 更新 |
| `deleteById` | `(id, tx?) => HaiResult<ExecuteResult>` | 按 ID 删除 |
| `count` | `(options?, tx?) => HaiResult<number>` | 计数 |
| `exists` | `(options?, tx?) => HaiResult<boolean>` | 条件存在 |
| `existsById` | `(id, tx?) => HaiResult<boolean>` | ID 存在 |

> 所有方法支持可选 `tx` 事务参数。

### 使用示例

```typescript
// 创建
await userCrud.create({ name: '张三', email: 'test@example.com' })

// 创建或更新
await userCrud.createOrUpdate({ id: 1, name: '张三', email: 'new@example.com' })
// 不存在 → 插入；主键冲突 → 更新 updateColumns 中的字段

// 条件查询
const actives = await userCrud.findAll({
  where: 'name LIKE ?',
  params: ['%张%'],
  orderBy: 'id DESC',
  limit: 10,
})

// 分页
const page = await userCrud.findPage({
  where: 'name LIKE ?',
  params: ['%张%'],
  pagination: { page: 1, pageSize: 20 },
})

// 事务中使用
await reldb.tx.wrap(async (tx) => {
  await userCrud.create({ name: '用户A', email: 'a@test.com' }, tx)
  await userCrud.updateById(1, { name: '新名字' }, tx)
})
```

---

## §6 BaseReldbCrudRepository

业务仓库基类，提供字段映射、自动建表与类型转换：

```typescript
import { BaseReldbCrudRepository } from '@h-ai/reldb'

interface User { id: number, name: string, email: string, createdAt: Date }

class UserRepository extends BaseReldbCrudRepository<User> {
  constructor() {
    super(db, {
      table: 'hai_demo_users',
      idColumn: 'id',
      fields: [
        { fieldName: 'id', columnName: 'id', def: { type: 'INTEGER', primaryKey: true, autoIncrement: true }, select: true, create: false, update: false },
        { fieldName: 'name', columnName: 'name', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
        { fieldName: 'email', columnName: 'email', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
        { fieldName: 'createdAt', columnName: 'created_at', def: { type: 'TIMESTAMP', notNull: true }, select: true, create: true, update: false },
      ],
    })
  }

  async findByEmail(email: string, tx?: DmlWithTxOperations) {
    return this.sql(tx).get<User>('SELECT * FROM hai_demo_users WHERE email = ?', [email])
  }
}
```

**`this.sql(tx?)`**：返回当前数据操作对象（自动适配事务）。

**自动能力**：createdAt/updatedAt 自动时间戳、BOOLEAN → 1/0、TIMESTAMP → 毫秒、JSON → 序列化。

**createOrUpdate**：`repo.createOrUpdate({ id: 1, name: '新名字' })` — 主键存在时更新（保留 createdAt），否则插入。dbType 自动获取，无需手动传入。

---

## §7 事务 — `reldb.tx`

```typescript
// 方式1：wrap（自动 commit/rollback）
const result = await reldb.tx.wrap(async (tx) => {
  await tx.execute('INSERT INTO hai_demo_users (name) VALUES (?)', ['张三'])
  await tx.execute('INSERT INTO logs (action) VALUES (?)', ['user_created'])
  return 'done'
})

// 方式2：手动管理
const txResult = await reldb.tx.begin()
if (txResult.success) {
  const tx = txResult.data
  try {
    await tx.execute('INSERT INTO hai_demo_users (name) VALUES (?)', ['李四'])
    await tx.commit()
  } catch {
    await tx.rollback()
  }
}
```

事务内可用：`tx.query / tx.get / tx.execute / tx.batch / tx.queryPage / tx.crud.table / tx.commit / tx.rollback`

---

## §8 JSON 操作 — `reldb.json`

跨数据库统一的 JSON 路径操作（路径以 `$` 开头）：

```typescript
// 提取
const { sql, params } = reldb.json.extract('settings', '$.theme')
const rows = await reldb.sql.query(`SELECT * FROM hai_demo_users WHERE ${sql} = ?`, [...params, '"dark"'])

// 设置
const { sql, params } = reldb.json.set('settings', '$.theme', 'dark')
await reldb.sql.execute(`UPDATE hai_demo_users SET settings = ${sql} WHERE id = ?`, [...params, userId])

// 删除
const { sql, params } = reldb.json.remove('settings', '$.deprecated')
await reldb.sql.execute(`UPDATE hai_demo_users SET settings = ${sql} WHERE id = ?`, [...params, id])

// 合并
const { sql, params } = reldb.json.merge('profile', { bio: '新简介', avatar: null })
await reldb.sql.execute(`UPDATE hai_demo_users SET profile = ${sql} WHERE id = ?`, [...params, userId])
```

> `column` 参数为列名，**禁止传入用户输入**。

---

## §9 分页 — `reldb.pagination`

| 方法 | 签名 | 说明 |
|------|------|------|
| `normalize` | `(options?, overrides?) => NormalizedPagination` | 规范化分页参数 |
| `build` | `<T>(items, total, pagination) => PaginatedResult<T>` | 构建分页结果 |

默认值：page=1, pageSize=20, maxPageSize=200。

---

## §10 错误码 — `ReldbErrorCode`

| 错误码 | 值 | 说明 |
|--------|------|------|
| `CONNECTION_FAILED` | 3000 | 连接失败 |
| `QUERY_FAILED` | 3001 | 查询失败 |
| `CONSTRAINT_VIOLATION` | 3002 | 约束违反 |
| `TRANSACTION_FAILED` | 3003 | 事务失败 |
| `MIGRATION_FAILED` | 3004 | 迁移失败 |
| `RECORD_NOT_FOUND` | 3005 | 记录不存在 |
| `DUPLICATE_ENTRY` | 3006 | 重复条目 |
| `DEADLOCK` | 3007 | 死锁 |
| `TIMEOUT` | 3008 | 超时 |
| `POOL_EXHAUSTED` | 3009 | 连接池耗尽 |
| `NOT_INITIALIZED` | 3010 | 未初始化 |
| `DDL_FAILED` | 3011 | DDL 失败 |
| `UNSUPPORTED_TYPE` | 3012 | 不支持的类型 |
| `CONFIG_ERROR` | 3013 | 配置错误 |

---

## §11 常见模式

### API 端点中使用

```typescript
import { kit } from '@h-ai/kit'

export const GET = kit.handler(async ({ url }) => {
  const pagination = kit.validate.query(url, PaginationQuerySchema)
  const result = await userCrud.findPage({ pagination, orderBy: 'id ASC' })
  if (!result.success) return kit.response.internalError()
  return kit.response.ok(result.data)
})
```

### 事务跨仓库

```typescript
const result = await reldb.tx.wrap(async (tx) => {
  const user = await userRepo.create(userData, tx)
  if (!user.success) throw new Error(user.error.message)
  await profileRepo.create({ userId: user.data.lastInsertRowid, ...profileData }, tx)
  return user.data
})
```

### SQL 安全

- 所有 SQL 必须参数化（`?` 占位符），禁止字符串拼接/模板字面量
- `reldb.json` 的 `column` 参数禁止传入用户输入

---

## 示例触发语句

- "创建数据库表"
- "写一个分页查询"
- "使用事务"
- "创建 Repository"
- "JSON 列操作"
