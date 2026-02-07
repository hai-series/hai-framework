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
import { BaseCrudRepository, db } from '@hai/db'

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
await db.tx.wrap(async (tx) => {
  await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
  await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])

  const page = await tx.queryPage<{ id: number, name: string }>({
    sql: 'SELECT id, name FROM users ORDER BY created_at DESC',
    pagination: { page: 1, pageSize: 10 },
  })
  // page.items / total / page / pageSize
})

// 5.1 CRUD 抽象（可用于 db.sql 或 tx）
const userCrud = db.crud.table({
  table: 'users',
  idColumn: 'id',
  select: ['id', 'name', 'email'],
  createColumns: ['name', 'email'],
  updateColumns: ['name', 'email'],
})

await userCrud.create({ name: '张三', email: 'test@example.com' })
const user = await userCrud.findById(1)
const hasUser = await userCrud.existsById(1)

// 5.1.1 在事务中使用 CRUD
const txResult = await db.tx.begin()
if (txResult.success) {
  const tx = txResult.data
  await userCrud.create({ name: '事务用户', email: 'tx@test.com' }, tx)
  await tx.commit()
}

// 5.2 基于 BaseCrudRepository 的业务仓库
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

const userRepo = new UserRepository()
await userRepo.create({ name: '李四', email: 'li@test.com' })
await userRepo.findByEmail('li@test.com')

const txResult2 = await db.tx.begin()
if (txResult2.success) {
  const tx = txResult2.data
  await userRepo.create({ name: '事务用户2', email: 'tx2@test.com' }, tx)
  await tx.commit()
}

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

## 注意事项

- MySQL 的 `dropIndex` 会在当前数据库中按索引名查找所属表并执行删除，确保索引名在库内唯一；如遇重名，建议使用 `db.ddl.raw()` 明确指定表。

## 测试

```bash
pnpm test
```

> 需要 Docker 运行 MySQL/PostgreSQL 容器测试。

## 许可证

Apache-2.0
