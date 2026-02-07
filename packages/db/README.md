# @hai/db

关系型数据库访问模块，提供统一的 `db` 对象访问 SQLite、PostgreSQL、MySQL（异步 API）。

## 支持的数据库

- SQLite（better-sqlite3）
- PostgreSQL（pg）
- MySQL（mysql2）

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
import { db } from '@hai/db'

// 1. 初始化数据库
await db.init({ type: 'sqlite', database: './data.db' })

// 2. 创建表
await db.ddl.createTable('users', {
  id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
  name: { type: 'TEXT', notNull: true },
  email: { type: 'TEXT', unique: true },
  created_at: { type: 'TIMESTAMP', defaultValue: '(unixepoch())' },
})

// 3. 插入数据
await db.sql.execute('INSERT INTO users (name, email) VALUES (?, ?)', ['张三', 'test@example.com'])

// 4. 查询数据
const users = await db.sql.query<{ id: number, name: string }>('SELECT id, name FROM users')
if (users.success) {
  // 使用 users.data
}

// 4.1 分页查询
const pageResult = await db.sql.queryPage<{ id: number, name: string }>({
  sql: 'SELECT id, name FROM users ORDER BY created_at DESC',
  pagination: { page: 1, pageSize: 20 },
})
if (pageResult.success) {
  // pageResult.data.items / total / page / pageSize
}

// 5. 事务操作
await db.tx(async (tx) => {
  await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
  await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])

  const page = await tx.queryPage<{ id: number, name: string }>({
    sql: 'SELECT id, name FROM users ORDER BY created_at DESC',
    pagination: { page: 1, pageSize: 10 },
  })
  // page.items / total / page / pageSize
})

// 6. 关闭连接
await db.close()
```

## 分页工具

`db.pagination` 提供业务无关的分页参数规范化与结果构建工具：

```ts
const pagination = db.pagination.normalize({ page: 2, pageSize: 20 })
// pagination: { page, pageSize, offset, limit }

const result = db.pagination.build(['a', 'b'], 100, pagination)
// result: { items, total, page, pageSize }
```

## 配置要点

- 支持连接字符串（`url`）或分字段（`host/port/database/user/password`）二选一。
- SQLite 使用 `database` 作为文件路径或 `:memory:`。
- PostgreSQL/MySQL 可配置连接池与 SSL。

示例：

```ts
await db.init({ type: 'sqlite', database: ':memory:' })

await db.init({
  type: 'postgresql',
  url: 'postgres://user:pass@localhost:5432/mydb',
})

await db.init({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'mydb',
  user: 'admin',
  password: 'secret',
  mysql: { charset: 'utf8mb4' },
})
```

## 错误处理示例

```ts
import { db, DbErrorCode } from '@hai/db'

const result = await db.sql.query('SELECT * FROM users')
if (!result.success && result.error.code === DbErrorCode.NOT_INITIALIZED) {
  // 请先调用 db.init()
}
```

## 测试

```bash
pnpm test
```

> 需要 Docker 运行 MySQL/PostgreSQL 容器测试。

## 许可证

Apache-2.0
