# @hai/db

关系型数据库访问模块，提供统一的 `db` 对象访问数据库功能。

## 支持的数据库

| 数据库         | 驱动           | 特点                            |
| -------------- | -------------- | ------------------------------- |
| **SQLite**     | better-sqlite3 | 嵌入式、同步 API、开发/测试友好 |
| **PostgreSQL** | pg             | 功能强大、异步 API、生产推荐    |
| **MySQL**      | mysql2         | 广泛使用、异步 API、生产推荐    |

## 安装

```bash
pnpm add @hai/db

# PostgreSQL（可选）
pnpm add pg

# MySQL（可选）
pnpm add mysql2
```

## 快速开始

```ts
import { closeDB, db, initDB } from '@hai/db'

// 1. 初始化数据库
initDB({ type: 'sqlite', database: './data.db' })

// 2. 创建表
db.ddl.createTable('users', {
  id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
  name: { type: 'TEXT', notNull: true },
  email: { type: 'TEXT', unique: true },
  created_at: { type: 'TIMESTAMP', defaultValue: '(unixepoch())' }
})

// 3. 插入数据
db.sql.execute('INSERT INTO users (name, email) VALUES (?, ?)', ['张三', 'test@example.com'])

// 4. 查询数据
const users = db.sql.query<{ id: number, name: string }>('SELECT * FROM users')
if (users.success) {
  // 使用 users.data
}

// 5. 事务操作
db.tx((tx) => {
  tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
  tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
})

// 6. 关闭连接
closeDB()
```

## API 参考

### 初始化函数

| 函数             | 说明             |
| ---------------- | ---------------- |
| `initDB(config)` | 初始化数据库连接 |
| `closeDB()`      | 关闭数据库连接   |

### db.ddl - 表结构操作

| 方法                                       | 说明         |
| ------------------------------------------ | ------------ |
| `createTable(name, columns, ifNotExists?)` | 创建表       |
| `dropTable(name, ifExists?)`               | 删除表       |
| `addColumn(table, column, def)`            | 添加列       |
| `dropColumn(table, column)`                | 删除列       |
| `renameTable(oldName, newName)`            | 重命名表     |
| `createIndex(table, name, def)`            | 创建索引     |
| `dropIndex(name, ifExists?)`               | 删除索引     |
| `raw(sql)`                                 | 执行原始 DDL |

### db.sql - 数据操作

| 方法                     | 说明                      |
| ------------------------ | ------------------------- |
| `query<T>(sql, params?)` | 查询多行                  |
| `get<T>(sql, params?)`   | 查询单行                  |
| `execute(sql, params?)`  | 执行 INSERT/UPDATE/DELETE |
| `batch(statements)`      | 批量执行                  |

> **注意**：PostgreSQL 和 MySQL 不支持同步的 sql 操作，请使用 `txAsync()`。

### db.tx / db.txAsync - 事务

| 方法             | 说明                   |
| ---------------- | ---------------------- |
| `db.tx(fn)`      | 同步事务（仅 SQLite）  |
| `db.txAsync(fn)` | 异步事务（所有数据库） |

### db 属性

| 属性               | 说明           |
| ------------------ | -------------- |
| `db.config`        | 当前数据库配置 |
| `db.isInitialized` | 是否已初始化   |
| `db.close()`       | 关闭连接       |

## 列类型映射

| 类型        | SQLite  | PostgreSQL       | MySQL      |
| ----------- | ------- | ---------------- | ---------- |
| `TEXT`      | TEXT    | TEXT             | TEXT       |
| `INTEGER`   | INTEGER | INTEGER/SERIAL   | INT/BIGINT |
| `REAL`      | REAL    | DOUBLE PRECISION | DOUBLE     |
| `BLOB`      | BLOB    | BYTEA            | BLOB       |
| `BOOLEAN`   | INTEGER | BOOLEAN          | TINYINT(1) |
| `TIMESTAMP` | INTEGER | TIMESTAMPTZ      | DATETIME   |
| `JSON`      | TEXT    | JSONB            | JSON       |

## 统一配置

所有数据库使用统一的配置结构：

```ts
interface DbConfig {
  type: 'sqlite' | 'postgresql' | 'mysql'

  // 连接方式（二选一）
  url?: string // 连接字符串
  host?: string // 主机（默认 localhost）
  port?: number // 端口
  database: string // 数据库名（SQLite 为文件路径）
  user?: string // 用户名
  password?: string // 密码

  // 通用选项
  ssl?: boolean | 'require' | 'prefer' | 'allow' | 'disable'
  pool?: { // 连接池配置
    min?: number // 最小连接数
    max?: number // 最大连接数（默认 10）
    idleTimeout?: number // 空闲超时（毫秒）
    acquireTimeout?: number // 获取连接超时（毫秒）
  }

  // 数据库特定选项
  sqlite?: { // SQLite 特定
    walMode?: boolean // 启用 WAL 模式（默认 true）
    readonly?: boolean // 只读模式
  }
  mysql?: { // MySQL 特定
    charset?: string // 字符集（默认 utf8mb4）
  }
}
```

## 配置示例

### SQLite

```ts
// 最简配置
initDB({ type: 'sqlite', database: './data.db' })

// 内存数据库
initDB({ type: 'sqlite', database: ':memory:' })

// 完整配置
initDB({
  type: 'sqlite',
  database: './data.db',
  sqlite: {
    walMode: true, // 启用 WAL 模式
    readonly: false // 只读模式
  }
})
```

### PostgreSQL

```ts
// 使用连接字符串
initDB({
  type: 'postgresql',
  url: 'postgres://user:pass@localhost:5432/mydb'
})

// 使用分开的参数
initDB({
  type: 'postgresql',
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'admin',
  password: 'secret',
  ssl: 'require',
  pool: {
    min: 2,
    max: 20,
    idleTimeout: 30000
  }
})
```

### MySQL

```ts
// 使用连接字符串
initDB({
  type: 'mysql',
  url: 'mysql://user:pass@localhost:3306/mydb'
})

// 使用分开的参数
initDB({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'mydb',
  user: 'admin',
  password: 'secret',
  pool: { max: 20 },
  mysql: { charset: 'utf8mb4' }
})
```

## 事务示例

### SQLite 同步事务

```ts
const result = db.tx((tx) => {
  // 转账操作
  tx.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, 1])
  tx.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [100, 2])

  // 查询余额
  const account1 = tx.get<{ balance: number }>('SELECT balance FROM accounts WHERE id = ?', [1])
  const account2 = tx.get<{ balance: number }>('SELECT balance FROM accounts WHERE id = ?', [2])

  return { from: account1?.balance, to: account2?.balance }
})

if (result.success) {
  // 处理成功结果 result.data
}
else {
  // 处理错误：result.error.message
}
```

### PostgreSQL/MySQL 异步事务

```ts
// PostgreSQL/MySQL 必须使用 txAsync，且事务内操作需要 await
const result = await db.txAsync(async (tx) => {
  // 转账操作（必须使用 await）
  await tx.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, 1])
  await tx.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [100, 2])

  // 查询余额
  const account1 = await tx.get<{ balance: number }>('SELECT balance FROM accounts WHERE id = ?', [1])
  const account2 = await tx.get<{ balance: number }>('SELECT balance FROM accounts WHERE id = ?', [2])

  return { from: account1?.balance, to: account2?.balance }
})

if (result.success) {
  // 处理成功结果 result.data
}
else {
  // 处理错误：result.error.message
}
```

## 错误处理

所有操作返回 `Result<T, DbError>` 类型：

```ts
import { db, DbErrorCode } from '@hai/db'

const result = db.sql.query('SELECT * FROM users')

if (result.success) {
  // 使用 result.data
}
else {
  // 处理错误：result.error.message

  // 根据错误码处理
  switch (result.error.code) {
    case DbErrorCode.NOT_INITIALIZED:
      // 处理错误：请先调用 initDB()
      break
    case DbErrorCode.QUERY_FAILED:
      // 处理错误：SQL 语法错误或表不存在
      break
    case DbErrorCode.UNSUPPORTED_TYPE:
      // 处理错误：PostgreSQL/MySQL 请使用 txAsync()
      break
  }
}
```

### 错误码

| 常量                   | 值   | 说明           |
| ---------------------- | ---- | -------------- |
| `CONNECTION_FAILED`    | 3000 | 数据库连接失败 |
| `QUERY_FAILED`         | 3001 | 查询执行失败   |
| `CONSTRAINT_VIOLATION` | 3002 | 约束违反       |
| `TRANSACTION_FAILED`   | 3003 | 事务执行失败   |
| `NOT_INITIALIZED`      | 3010 | 数据库未初始化 |
| `DDL_FAILED`           | 3011 | DDL 操作失败   |
| `UNSUPPORTED_TYPE`     | 3012 | 不支持的操作   |
| `CONFIG_ERROR`         | 3013 | 配置错误       |

## 测试

```bash
# 运行 SQLite 单元测试
pnpm test

# 运行容器化测试（需要 Docker）
pnpm test:container
```

## 许可证

Apache-2.0
