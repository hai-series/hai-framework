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
# username: ${DB_USER:postgres}
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

| 方法          | 签名                                              | 说明                  |
| ------------- | ------------------------------------------------- | --------------------- |
| `createTable` | `(name, columns: ColumnDef[]) => Promise<Result>` | 建表（IF NOT EXISTS） |
| `addColumn`   | `(table, column: ColumnDef) => Promise<Result>`   | 添加列                |
| `createIndex` | `(table, columns, options?) => Promise<Result>`   | 创建索引              |
| `dropTable`   | `(name) => Promise<Result>`                       | 删除表                |
| `tableExists` | `(name) => Promise<Result<boolean>>`              | 检查表是否存在        |

**ColumnDef**：

```typescript
interface ColumnDef {
  name: string
  type: 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'BOOLEAN' | 'TIMESTAMP' | 'JSON' | 'VARCHAR' | 'BIGINT'
  primaryKey?: boolean
  autoIncrement?: boolean
  notNull?: boolean
  unique?: boolean
  defaultValue?: unknown
  references?: { table: string, column: string }
}
```

### SQL — `db.sql`

| 方法        | 签名                                                       | 说明         |
| ----------- | ---------------------------------------------------------- | ------------ |
| `query`     | `<T>(sql, params?) => Promise<Result<T[]>>`                | 查询返回多行 |
| `get`       | `<T>(sql, params?) => Promise<Result<T \| null>>`          | 查询返回单行 |
| `execute`   | `(sql, params?) => Promise<Result<{ changes: number }>>`   | 执行写操作   |
| `batch`     | `(statements: [sql, params][]) => Promise<Result>`         | 批量执行     |
| `queryPage` | `<T>(sql, params, page) => Promise<Result<PageResult<T>>>` | 分页查询     |

**参数占位符统一使用 `?`**：

```typescript
const result = await db.sql.query<User>(
  'SELECT * FROM users WHERE status = ? AND age > ?',
  ['active', 18],
)
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

返回的 CRUD 对象方法：

| 方法       | 签名                                                      | 说明       |
| ---------- | --------------------------------------------------------- | ---------- |
| `getById`  | `(id, tx?) => Promise<Result<T \| null>>`                 | 按 ID 查询 |
| `list`     | `(options?, tx?) => Promise<Result<T[]>>`                 | 列表查询   |
| `listPage` | `(page, options?, tx?) => Promise<Result<PageResult<T>>>` | 分页列表   |
| `create`   | `(data, tx?) => Promise<Result<T>>`                       | 创建       |
| `update`   | `(id, data, tx?) => Promise<Result<T>>`                   | 更新       |
| `delete`   | `(id, tx?) => Promise<Result<void>>`                      | 删除       |
| `count`    | `(options?, tx?) => Promise<Result<number>>`              | 计数       |

### BaseCrudRepository

业务仓库基类，提供字段映射与自定义 SQL 能力：

```typescript
import { BaseCrudRepository } from '@h-ai/db'

interface User { id: number, name: string, email: string }

class UserRepository extends BaseCrudRepository<User> {
  constructor() {
    super(db, {
      table: 'users',
      idColumn: 'id',
      fields: [
        { fieldName: 'id', columnName: 'id', def: { type: 'INTEGER', primaryKey: true, autoIncrement: true }, select: true, create: false, update: false },
        { fieldName: 'name', columnName: 'name', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
        { fieldName: 'email', columnName: 'email', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
      ],
    })
  }

  /** 自定义查询示例 */
  async findByEmail(email: string, tx?: DataOperations) {
    return this.sql(tx).get<User>('SELECT * FROM users WHERE email = ?', [email])
  }
}
```

**`this.sql(tx?)`**：返回 `DataOperations`（`db.sql` 或传入的事务句柄），自动适配事务场景。

### 事务 — `db.tx`

```typescript
// 方式1：wrap（自动 commit/rollback）
const result = await db.tx.wrap(async (tx) => {
  await userCrud.create({ name: '张三', email: 'z@test.com' }, tx)
  await logCrud.create({ action: 'user_created' }, tx)
  return ok(undefined)
})

// 方式2：手动管理
const txResult = await db.tx.begin()
if (txResult.success) {
  const tx = txResult.data
  try {
    await userCrud.create({ name: '李四', email: 'l@test.com' }, tx)
    await tx.commit()
  }
  catch {
    await tx.rollback()
  }
}
```

### 分页 — `db.pagination`

| 方法        | 签名                                        | 说明                                |
| ----------- | ------------------------------------------- | ----------------------------------- |
| `normalize` | `(input: PageInput) => PageParams`          | 规范化分页参数（裁剪过大 pageSize） |
| `build`     | `<T>(data, total, params) => PageResult<T>` | 构建分页结果                        |

```typescript
interface PageInput { page?: number, pageSize?: number }
interface PageResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
```

---

## 错误码 — `DbErrorCode`

| 错误码                | 说明         |
| --------------------- | ------------ |
| `NOT_INITIALIZED`     | 未初始化     |
| `ALREADY_INITIALIZED` | 重复初始化   |
| `CONFIG_ERROR`        | 配置错误     |
| `CONNECTION_ERROR`    | 连接失败     |
| `QUERY_ERROR`         | 查询错误     |
| `EXECUTE_ERROR`       | 执行错误     |
| `TRANSACTION_ERROR`   | 事务错误     |
| `NOT_FOUND`           | 记录不存在   |
| `DUPLICATE`           | 唯一约束冲突 |
| `CONSTRAINT_ERROR`    | 约束错误     |

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

  const result = await userCrud.listPage(data!)
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
    return user

  await profileRepo.create({ userId: user.data.id, ...profileData }, tx)
  return ok(user.data)
})
```

---

## 相关 Skills

- `hai-build`：模块初始化顺序
- `hai-core`：配置管理、Result 模型
- `hai-iam`：IAM 模块内部使用 db 进行用户/角色/权限存储
- `hai-app-create`：生成数据模型与迁移文件
