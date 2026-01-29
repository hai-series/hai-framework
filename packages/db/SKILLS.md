# @hai/db - AI 助手参考

## 模块概述

`@hai/db` 是一个统一的关系型数据库访问模块，支持 SQLite、PostgreSQL 和 MySQL。

**重要限制**：PostgreSQL 和 MySQL 仅支持异步操作，必须使用 `txAsync()`，且事务内的所有操作都需要 `await`。

## 核心 API

```ts
import { db, DbErrorCode } from '@hai/db'
```

### 初始化

```ts
// SQLite（支持同步和异步）
db.init({ type: 'sqlite', database: './data.db' })
db.init({ type: 'sqlite', database: ':memory:' })

// PostgreSQL（仅支持异步）
db.init({
  type: 'postgresql',
  url: 'postgres://user:pass@localhost:5432/mydb'
})
db.init({
  type: 'postgresql',
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'admin',
  password: 'secret',
  pool: { max: 20 }
})

// MySQL（仅支持异步）
db.init({
  type: 'mysql',
  url: 'mysql://user:pass@localhost:3306/mydb'
})
db.init({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'mydb',
  user: 'admin',
  password: 'secret',
  mysql: { charset: 'utf8mb4' }
})

// 关闭
db.close()
```

````

### DDL 操作 (db.ddl)

```ts
// 创建表
db.ddl.createTable('users', {
    id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
    name: { type: 'TEXT', notNull: true },
    email: { type: 'TEXT', unique: true },
    age: { type: 'INTEGER' },
    is_active: { type: 'BOOLEAN', defaultValue: true },
    created_at: { type: 'TIMESTAMP', defaultValue: '(unixepoch())' }
})

// 删除表
db.ddl.dropTable('users')
db.ddl.dropTable('users', true)  // IF EXISTS

// 添加列
db.ddl.addColumn('users', 'phone', { type: 'TEXT' })

// 删除列
db.ddl.dropColumn('users', 'phone')

// 重命名表
db.ddl.renameTable('users', 'members')

// 创建索引
db.ddl.createIndex('users', 'idx_email', { columns: ['email'], unique: true })

// 删除索引
db.ddl.dropIndex('idx_email')

// 原始 DDL
db.ddl.raw('CREATE VIEW active_users AS SELECT * FROM users WHERE is_active = 1')
````

### SQL 操作 (db.sql)

```ts
// 查询多行
const users = db.sql.query<{ id: number, name: string }>('SELECT * FROM users')
const active = db.sql.query('SELECT * FROM users WHERE is_active = ?', [true])

// 查询单行
const user = db.sql.get<{ id: number, name: string }>('SELECT * FROM users WHERE id = ?', [1])

// 执行 INSERT/UPDATE/DELETE
const insertResult = db.sql.execute('INSERT INTO users (name, email) VALUES (?, ?)', ['张三', 'test@example.com'])
const updateResult = db.sql.execute('UPDATE users SET name = ? WHERE id = ?', ['李四', 1])
const deleteResult = db.sql.execute('DELETE FROM users WHERE id = ?', [1])

// 批量执行
db.sql.batch([
  { sql: 'INSERT INTO users (name) VALUES (?)', params: ['用户1'] },
  { sql: 'INSERT INTO users (name) VALUES (?)', params: ['用户2'] },
  { sql: 'INSERT INTO users (name) VALUES (?)', params: ['用户3'] }
])
```

### 事务 (db.tx / db.txAsync)

```ts
// 同步事务（仅 SQLite 支持）
const result = db.tx((tx) => {
  tx.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, 1])
  tx.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [100, 2])
  return tx.get('SELECT balance FROM accounts WHERE id = ?', [2])
})

// 异步事务（PostgreSQL/MySQL 必须使用，SQLite 也可用）
// 注意：事务内的所有操作都需要 await
const asyncResult = await db.txAsync(async (tx) => {
  await tx.execute('INSERT INTO logs (message) VALUES (?)', ['开始'])
  await someAsyncOperation()
  await tx.execute('INSERT INTO logs (message) VALUES (?)', ['完成'])
  return await tx.query('SELECT * FROM logs')
})
```

## 数据库特性差异

| 特性                    | SQLite | PostgreSQL | MySQL |
| ----------------------- | ------ | ---------- | ----- |
| 同步事务 `db.tx()`      | ✅     | ❌         | ❌    |
| 异步事务 `db.txAsync()` | ✅     | ✅         | ✅    |
| 同步 SQL `db.sql.*`     | ✅     | ❌         | ❌    |
| 连接池                  | ❌     | ✅         | ✅    |
| 内存数据库              | ✅     | ❌         | ❌    |

## 统一配置结构

```ts
interface DbConfig {
  type: 'sqlite' | 'postgresql' | 'mysql'

  // 连接（二选一）
  url?: string // 连接字符串
  host?: string // 主机
  port?: number // 端口
  database: string // 数据库名/文件路径
  user?: string // 用户名
  password?: string // 密码

  // 通用选项
  ssl?: boolean | 'require' | 'prefer' | 'allow' | 'disable'
  pool?: PoolConfig // 连接池

  // 数据库特定选项
  sqlite?: { walMode?: boolean, readonly?: boolean }
  mysql?: { charset?: string }
}

interface PoolConfig {
  min?: number // 最小连接数
  max?: number // 最大连接数（默认 10）
  idleTimeout?: number // 空闲超时（毫秒）
  acquireTimeout?: number // 获取连接超时（毫秒）
}
```

## 列类型

```ts
type ColumnType = 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'BOOLEAN' | 'TIMESTAMP' | 'JSON'

interface ColumnDef {
  type: ColumnType
  primaryKey?: boolean
  autoIncrement?: boolean
  notNull?: boolean
  unique?: boolean
  defaultValue?: unknown
  references?: { table: string, column: string }
}
```

## 返回值类型

所有操作返回 `Result<T, DbError>`：

```ts
interface Result<T, E> {
  success: boolean
  data?: T
  error?: E
}

interface DbError {
  code: DbErrorCode // 数字类型错误码
  message: string
  cause?: unknown
}

// 错误码常量（数字类型 3000-3999）
const DbErrorCode = {
  CONNECTION_FAILED: 3000, // 数据库连接失败
  QUERY_FAILED: 3001, // 查询执行失败
  CONSTRAINT_VIOLATION: 3002, // 约束违反
  TRANSACTION_FAILED: 3003, // 事务执行失败
  NOT_INITIALIZED: 3010, // 数据库未初始化
  DDL_FAILED: 3011, // DDL 操作失败
  UNSUPPORTED_TYPE: 3012, // 不支持的操作
  CONFIG_ERROR: 3013 // 配置错误
} as const
```

## 使用模式

```ts
// 标准使用
const result = db.sql.query('SELECT * FROM users')
if (result.success) {
  // 使用 result.data
}
else {
  // 处理错误：result.error.message
}

// 解构使用
const { success, data, error } = db.sql.get('SELECT * FROM users WHERE id = ?', [1])

// 错误码判断
if (!result.success && result.error.code === DbErrorCode.NOT_INITIALIZED) {
  // 处理错误：请先调用 initDB()
}
```

## 注意事项

1. **PostgreSQL/MySQL 限制**：这两种数据库仅支持异步操作，调用 `db.sql.*` 或 `db.tx()` 会返回 `UNSUPPORTED_TYPE` 错误
2. **事务内 await**：使用 `txAsync()` 时，事务内的所有数据库操作都需要 `await`
3. **参数占位符**：统一使用 `?` 作为参数占位符，模块内部会自动转换为各数据库的格式
4. **资源释放**：应用退出前调用 `closeDB()` 释放连接资源
5. **错误码**：错误码是数字类型（3000-3999），使用 `DbErrorCode` 常量进行比较
