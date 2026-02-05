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

### 参数占位符

统一使用 `?` 作为占位符，模块内部会转为各数据库对应格式。

## 事务（db.tx）

- `db.tx(fn)` → `Result<T, DbError>`
- `TxOperations` 提供 `query/get/execute`（与 `db.sql` 相同语义）
- 事务回调内所有操作必须 `await`

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
const result = await db.tx(async (tx) => {
  await tx.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, 1])
  await tx.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [100, 2])
  return await tx.get('SELECT balance FROM accounts WHERE id = ?', [1])
})
```

## 注意事项

- 所有数据库操作均为异步，需要 `await`
- 应用退出前调用 `db.close()` 释放连接资源
- 错误处理请使用 `DbErrorCode` 做分支判断
