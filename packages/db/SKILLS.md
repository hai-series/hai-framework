# @hai/db - AI 助手参考

## 模块概述

`@hai/db` 提供统一的关系型数据库访问能力，支持 SQLite / PostgreSQL / MySQL，统一异步 API 与统一错误码。架构为**无子功能 + 有 Provider（模块级）**。

## 入口与初始化

```ts
import type { DbConfig, DbConfigInput, DbError, DbFunctions } from '@hai/db'
import { BaseCrudRepository, db, DbErrorCode } from '@hai/db'

// 初始化
await db.init({ type: 'sqlite', database: ':memory:' })

// 状态
db.isInitialized // boolean
db.config // DbConfig | null

// 关闭
await db.close()
```

## 目录结构

```
packages/db/
  package.json
  README.md
  SKILLS.md
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
  messages/
    en-US.json
    zh-CN.json
  src/
    index.ts                  # 唯一入口，仅做 export * 聚合
    db-main.ts                # 服务对象（export const db）
    db-types.ts               # 公共类型
    db-config.ts              # 错误码 + Zod Schema（discriminatedUnion）+ 配置类型
    db-i18n.ts                # i18n 消息获取器
    db-pagination.ts          # 分页工具（内部）
    db-crud-kernel.ts         # CRUD 工厂（内部）
    db-crud-repository.ts     # BaseCrudRepository（导出）
    providers/                # Provider 实现目录
      db-provider-sqlite.ts   # SQLite Provider
      db-provider-postgres.ts # PostgreSQL Provider
      db-provider-mysql.ts    # MySQL Provider
  tests/
```

## 配置说明

### DbConfigInput（db.init 参数，判别联合体 discriminatedUnion）

配置按 `type` 字段区分，不同类型包含不同字段：

#### SQLite

| 字段       | 类型                      | 默认值              | 说明                                    |
| ---------- | ------------------------- | ------------------- | --------------------------------------- |
| `type`     | `'sqlite'`                | 必填                | 数据库类型                              |
| `database` | `string`                  | 必填                | 文件路径（如 `./data.db`）或 `:memory:` |
| `sqlite`   | `{ walMode?, readonly? }` | `{ walMode: true }` | SQLite 选项                             |

#### PostgreSQL

| 字段       | 类型                          | 默认值        | 说明               |
| ---------- | ----------------------------- | ------------- | ------------------ |
| `type`     | `'postgresql'`                | 必填          | 数据库类型         |
| `database` | `string`                      | 必填          | 数据库名称         |
| `url`      | `string?`                     | -             | 连接字符串（优先） |
| `host`     | `string?`                     | `'localhost'` | 主机地址           |
| `port`     | `number?`                     | -             | 端口（默认 5432）  |
| `user`     | `string?`                     | -             | 用户名             |
| `password` | `string?`                     | -             | 密码               |
| `ssl`      | `boolean \| string \| Record` | -             | SSL 配置           |
| `pool`     | `PoolConfig?`                 | -             | 连接池配置         |

#### MySQL

| 字段       | 类型                          | 默认值                   | 说明               |
| ---------- | ----------------------------- | ------------------------ | ------------------ |
| `type`     | `'mysql'`                     | 必填                     | 数据库类型         |
| `database` | `string`                      | 必填                     | 数据库名称         |
| `url`      | `string?`                     | -                        | 连接字符串（优先） |
| `host`     | `string?`                     | `'localhost'`            | 主机地址           |
| `port`     | `number?`                     | -                        | 端口（默认 3306）  |
| `user`     | `string?`                     | -                        | 用户名             |
| `password` | `string?`                     | -                        | 密码               |
| `ssl`      | `boolean \| string \| Record` | -                        | SSL 配置           |
| `pool`     | `PoolConfig?`                 | -                        | 连接池配置         |
| `mysql`    | `{ charset?, timezone? }`     | `{ charset: 'utf8mb4' }` | MySQL 选项         |

### PoolConfig

| 字段             | 类型     | 默认值  | 说明               |
| ---------------- | -------- | ------- | ------------------ |
| `min`            | `number` | `1`     | 最小连接数         |
| `max`            | `number` | `10`    | 最大连接数         |
| `idleTimeout`    | `number` | `30000` | 空闲超时（ms）     |
| `acquireTimeout` | `number` | `10000` | 获取连接超时（ms） |

## 操作接口

### DDL（db.ddl）

| 方法          | 签名                                                                            | 说明         |
| ------------- | ------------------------------------------------------------------------------- | ------------ |
| `createTable` | `(tableName, columns: TableDef, ifNotExists?: boolean) → Result<void, DbError>` | 创建表       |
| `dropTable`   | `(tableName, ifExists?: boolean) → Result<void, DbError>`                       | 删除表       |
| `addColumn`   | `(tableName, columnName, columnDef: ColumnDef) → Result<void, DbError>`         | 添加列       |
| `dropColumn`  | `(tableName, columnName) → Result<void, DbError>`                               | 删除列       |
| `renameTable` | `(oldName, newName) → Result<void, DbError>`                                    | 重命名表     |
| `createIndex` | `(tableName, indexName, indexDef: IndexDef) → Result<void, DbError>`            | 创建索引     |
| `dropIndex`   | `(indexName, ifExists?: boolean) → Result<void, DbError>`                       | 删除索引     |
| `raw`         | `(sql) → Result<void, DbError>`                                                 | 执行原始 DDL |

### SQL（db.sql）

| 方法        | 签名                                                                         | 说明     |
| ----------- | ---------------------------------------------------------------------------- | -------- |
| `query`     | `<T>(sql, params?) → Result<T[], DbError>`                                   | 查询多行 |
| `get`       | `<T>(sql, params?) → Result<T \| null, DbError>`                             | 查询单行 |
| `execute`   | `(sql, params?) → Result<ExecuteResult, DbError>`                            | 执行修改 |
| `batch`     | `(statements) → Result<void, DbError>`                                       | 批量执行 |
| `queryPage` | `<T>(options: PaginationQueryOptions) → Result<PaginatedResult<T>, DbError>` | 分页查询 |

参数占位符统一使用 `?`。

### 事务（db.tx）

| 方法    | 签名                                                         | 说明          |
| ------- | ------------------------------------------------------------ | ------------- |
| `wrap`  | `<T>(fn: (tx: TxHandle) => Promise<T>) → Result<T, DbError>` | 自动提交/回滚 |
| `begin` | `() → Result<TxHandle, DbError>`                             | 分步事务      |

`TxHandle` 继承 `DataOperations`（query/get/execute/batch/queryPage），额外提供 `commit()`、`rollback()` 和 `crud` 管理器。

### CRUD（db.crud）

```ts
const repo = db.crud.table<TItem>({
  table: 'users',
  idColumn: 'id',
  select: ['id', 'name'],
  createColumns: ['name'],
  updateColumns: ['name'],
  mapRow: row => row as TItem,
})
```

CrudRepository 方法（均支持可选 `tx` 参数）：

| 方法         | 签名                                                       | 说明        |
| ------------ | ---------------------------------------------------------- | ----------- |
| `create`     | `(data, tx?) → Result<ExecuteResult, DbError>`             | 创建        |
| `createMany` | `(items, tx?) → Result<void, DbError>`                     | 批量创建    |
| `findById`   | `(id, tx?) → Result<TItem \| null, DbError>`               | 按 ID 查    |
| `findAll`    | `(options?, tx?) → Result<TItem[], DbError>`               | 列表查询    |
| `findPage`   | `(options, tx?) → Result<PaginatedResult<TItem>, DbError>` | 分页        |
| `updateById` | `(id, data, tx?) → Result<ExecuteResult, DbError>`         | 更新        |
| `deleteById` | `(id, tx?) → Result<ExecuteResult, DbError>`               | 删除        |
| `count`      | `(options?, tx?) → Result<number, DbError>`                | 统计        |
| `exists`     | `(options?, tx?) → Result<boolean, DbError>`               | 是否存在    |
| `existsById` | `(id, tx?) → Result<boolean, DbError>`                     | ID 是否存在 |

### BaseCrudRepository

业务仓库继承 `BaseCrudRepository<TItem>`，通过 `fields` 定义字段映射、自动建表、类型转换：

```ts
class UserRepository extends BaseCrudRepository<User> {
  constructor() {
    super(db, { table: 'users', idColumn: 'id', fields: [/* ... */] })
  }
  // 自定义方法中使用 this.sql(tx) 自动路由到事务
}
```

### 分页工具（db.pagination）

| 方法        | 签名                                                 | 说明           |
| ----------- | ---------------------------------------------------- | -------------- |
| `normalize` | `(options?, overrides?) → NormalizedPagination`      | 规范化分页参数 |
| `build`     | `<T>(items, total, pagination) → PaginatedResult<T>` | 构建分页结果   |

## 错误码

| 名称                   | 数值 | 含义         |
| ---------------------- | ---- | ------------ |
| `CONNECTION_FAILED`    | 3000 | 连接失败     |
| `QUERY_FAILED`         | 3001 | 查询失败     |
| `CONSTRAINT_VIOLATION` | 3002 | 约束违反     |
| `TRANSACTION_FAILED`   | 3003 | 事务失败     |
| `MIGRATION_FAILED`     | 3004 | 迁移失败     |
| `RECORD_NOT_FOUND`     | 3005 | 记录不存在   |
| `DUPLICATE_ENTRY`      | 3006 | 重复条目     |
| `DEADLOCK`             | 3007 | 死锁         |
| `TIMEOUT`              | 3008 | 超时         |
| `POOL_EXHAUSTED`       | 3009 | 连接池耗尽   |
| `NOT_INITIALIZED`      | 3010 | 未初始化     |
| `DDL_FAILED`           | 3011 | DDL 操作失败 |
| `UNSUPPORTED_TYPE`     | 3012 | 不支持的类型 |
| `CONFIG_ERROR`         | 3013 | 配置错误     |

## 注意事项

- 所有操作异步，需 `await`
- `db.init` 未调用时，所有子接口返回 `NOT_INITIALIZED`
- CRUD `create`/`update` payload 为空时返回 `CONFIG_ERROR`
- MySQL `dropIndex` 按索引名在库内查找所属表，索引名需唯一
- SQLite `database` 字段为文件路径或 `:memory:`
- 参数占位符统一使用 `?`，模块内部自动转换
- `db.pagination.normalize` 会裁剪 `pageSize`（默认最大 200）
