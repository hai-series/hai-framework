# @hai/db - AI 助手参考

## 模块概述

`@hai/db` 提供统一的关系型数据库访问能力，支持 SQLite / PostgreSQL / MySQL，统一异步 API 与统一错误码。

## 入口与初始化

- 入口：`import { db, DbErrorCode } from '@hai/db'`
- 初始化：`db.init(config)` → `Result<void, DbError>`
- 关闭：`db.close()` → `Promise<void>`
- 状态：`db.isInitialized` / `db.config`

```ts
await db.init({ type: 'sqlite', database: ':memory:' })
await db.close()
```

## 配置说明（DbConfigInput）

### 通用字段

- `type`: `'sqlite' | 'postgresql' | 'mysql'`
- `url?`: 连接字符串（PostgreSQL/MySQL）；提供后会忽略 `host/port` 等字段
- `host?`: 主机（默认 `localhost`）
- `port?`: 端口（PostgreSQL 默认 5432，MySQL 默认 3306）
- `database`: 数据库名（SQLite 为文件路径或 `:memory:`）
- `user?`: 用户名
- `password?`: 密码
- `ssl?`: `boolean | 'require' | 'prefer' | 'allow' | 'disable' | Record<string, unknown>`
- `pool?`: 连接池配置（PostgreSQL/MySQL）

### 连接池字段（PoolConfig）

- `min?`: 最小连接数（默认 1）
- `max?`: 最大连接数（默认 10）
- `idleTimeout?`: 空闲超时（毫秒，默认 30000）
- `acquireTimeout?`: 获取连接超时（毫秒，默认 10000）

### SQLite 选项（SqliteOptions）

- `walMode?`: 是否启用 WAL（默认 true）
- `readonly?`: 是否只读（默认 false）

### MySQL 选项（MysqlOptions）

- `charset?`: 字符集（默认 utf8mb4）
- `timezone?`: 时区（如 `+08:00`）

## DDL（db.ddl）

### 接口

- `createTable(tableName, columns, ifNotExists?)`
- `dropTable(tableName, ifExists?)`
- `addColumn(tableName, columnName, columnDef)`
- `dropColumn(tableName, columnName)`
- `renameTable(oldName, newName)`
- `createIndex(tableName, indexName, indexDef)`
- `dropIndex(indexName, ifExists?)`
- `raw(sql)`

> MySQL 的 `dropIndex` 会在当前数据库中按索引名解析所属表并执行删除，确保索引名在库内唯一；如遇重名，建议使用 `raw()` 显式指定表。

### ColumnDef

- `type`: `'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'BOOLEAN' | 'TIMESTAMP' | 'JSON'`
- `primaryKey?`: 是否主键
- `autoIncrement?`: 主键自增（仅主键有效）
- `notNull?`: 是否非空
- `unique?`: 是否唯一
- `defaultValue?`: `string | number | boolean | null`
- `references?`: `{ table, column, onDelete?, onUpdate? }`

### IndexDef

- `columns`: 索引列名数组
- `unique?`: 是否唯一
- `where?`: 部分索引条件（WHERE 子句）

## SQL（db.sql）

### 接口

- `query<T>(sql, params?)` → `Result<T[], DbError>`
- `get<T>(sql, params?)` → `Result<T | null, DbError>`
- `execute(sql, params?)` → `Result<{ changes, lastInsertRowid? }, DbError>`
- `batch(statements)` → `Result<void, DbError>`
- `queryPage(options)` → `Result<PaginatedResult<T>, DbError>`

### 参数占位符

统一使用 `?` 作为占位符，模块内部会转为各数据库对应格式。

### 分页查询（queryPage）

```ts
const pageResult = await db.sql.queryPage<{ id: number, name: string }>({
  sql: 'SELECT id, name FROM users ORDER BY created_at DESC',
  pagination: { page: 1, pageSize: 20 },
})

if (pageResult.success) {
  const { items, total, page, pageSize } = pageResult.data
}
```

## CRUD 抽象（db.crud）

- `db.crud.table(config)` → 单表 CRUD 仓库
- `tx.crud.table(config)` → 事务内 CRUD 仓库
- 统一提供 `create/createMany/findById/findAll/findPage/updateById/deleteById/count/exists/existsById`
- CRUD 方法支持可选事务参数 `tx`（同一事务内跨仓库操作）

```ts
const userCrud = db.crud.table({
  table: 'users',
  idColumn: 'id',
  select: ['id', 'name', 'email'],
  createColumns: ['name', 'email'],
  updateColumns: ['name', 'email'],
})

await userCrud.create({ name: '张三', email: 'test@example.com' })
const user = await userCrud.findById(1)

const txResult = await db.tx.begin()
if (txResult.success) {
  const tx = txResult.data
  await userCrud.create({ name: '事务用户', email: 'tx@test.com' }, tx)
  await tx.rollback()
}
```

### BaseCrudRepository

业务仓库可继承 `BaseCrudRepository`，复用通用 CRUD，仅实现自定义方法：

```ts
class UserRepository extends BaseCrudRepository<{ id: number, name: string, email: string }> {
  constructor() {
    super(db, {
      table: 'users',
      idColumn: 'id',
      fields: [
        {
          fieldName: 'id',
          columnName: 'id',
          def: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
          select: true,
          create: false,
          update: false,
        },
        {
          fieldName: 'name',
          columnName: 'name',
          def: { type: 'TEXT', notNull: true },
          select: true,
          create: true,
          update: true,
        },
        {
          fieldName: 'email',
          columnName: 'email',
          def: { type: 'TEXT', notNull: true },
          select: true,
          create: true,
          update: true,
        },
      ],
    })
  }

  async findByEmail(email: string) {
    return this.findAll({ where: 'email = ?', params: [email], limit: 1 })
  }

  // 在自定义方法中可使用 sql(tx) 自动选择事务内 CRUD
  async insertWithTx(data: { name: string, email: string }, tx?: import('@hai/db').TxHandle) {
    const now = new Date()
    return this.sql(tx).execute(
      'INSERT INTO users (name, email, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [data.name, data.email, now, now],
    )
  }
}

const txResult2 = await db.tx.begin()
if (txResult2.success) {
  const tx = txResult2.data
  await userRepo.create({ name: '事务用户2', email: 'tx2@test.com' }, tx)
  await tx.commit()
}
```

## 事务（db.tx）

- `db.tx.wrap(fn)` → `Result<T, DbError>`（自动提交/回滚）
- `db.tx.begin()` → `Result<TxHandle, DbError>`（分步事务）
- `TxHandle` 提供 `query/get/execute/batch/queryPage` 并支持 `commit/rollback`
- 事务回调内所有操作必须 `await`

```ts
const result = await db.tx.wrap(async (tx) => {
  await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户A'])
  const page = await tx.queryPage<{ id: number, name: string }>({
    sql: 'SELECT id, name FROM users ORDER BY created_at DESC',
    pagination: { page: 1, pageSize: 10 },
  })
  return page
})

const txResult = await db.tx.begin()
if (txResult.success) {
  const tx = txResult.data
  await tx.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, 1])
  await tx.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [100, 2])
  await tx.commit()
}
```

## 返回值与错误码

### Result 与 DbError

- `Result<T, DbError>`：`success` / `data` / `error`
- `DbError`: `{ code, message, cause? }`

### DbErrorCode

- `CONNECTION_FAILED` 3000
- `QUERY_FAILED` 3001
- `CONSTRAINT_VIOLATION` 3002
- `TRANSACTION_FAILED` 3003
- `MIGRATION_FAILED` 3004
- `RECORD_NOT_FOUND` 3005
- `DUPLICATE_ENTRY` 3006
- `DEADLOCK` 3007
- `TIMEOUT` 3008
- `POOL_EXHAUSTED` 3009
- `NOT_INITIALIZED` 3010
- `DDL_FAILED` 3011
- `UNSUPPORTED_TYPE` 3012
- `CONFIG_ERROR` 3013

## 常见使用场景

### SQLite 内存数据库

```ts
await db.init({ type: 'sqlite', database: ':memory:' })
```

### PostgreSQL 连接字符串

```ts
await db.init({
  type: 'postgresql',
  url: 'postgres://user:pass@localhost:5432/app',
})
```

### MySQL 参数化连接

```ts
await db.init({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'app',
  user: 'root',
  password: 'secret',
  mysql: { charset: 'utf8mb4' },
})
```

### 事务处理

```ts
const result = await db.tx.wrap(async (tx) => {
  await tx.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, 1])
  await tx.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [100, 2])
  return await tx.get('SELECT balance FROM accounts WHERE id = ?', [1])
})
```

## 分页工具（db.pagination）

```ts
const pagination = db.pagination.normalize({ page: 1, pageSize: 20 })
// pagination: { page, pageSize, offset, limit }

const result = db.pagination.build(['a', 'b'], 2, pagination)
// result: { items, total, page, pageSize }
```

## 注意事项

- 所有数据库操作均为异步，需要 `await`
- 应用退出前调用 `db.close()` 释放连接资源
- 错误处理请使用 `DbErrorCode` 做分支判断
