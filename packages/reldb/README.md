# @h-ai/reldb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

关系型数据库访问模块，通过统一的 `reldb` 对象访问 SQLite、PostgreSQL、MySQL。

## 快速开始

```ts
import { HaiReldbError, reldb } from '@h-ai/reldb'

// 初始化
const initialized = await reldb.init({ type: 'sqlite', database: ':memory:' })
if (!initialized.success)
  throw new Error(initialized.error.message)

// DDL
await reldb.ddl.createTable('users', {
  id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
  name: { type: 'TEXT', notNull: true },
  email: { type: 'TEXT', unique: true },
})

// SQL
await reldb.sql.execute('INSERT INTO users (name, email) VALUES (?, ?)', ['张三', 'test@example.com'])
const users = await reldb.sql.query<{ id: number, name: string }>('SELECT * FROM users')

// 分页查询
const page = await reldb.sql.queryPage<{ id: number, name: string }>({
  sql: 'SELECT id, name FROM users ORDER BY id',
  pagination: { page: 1, pageSize: 20 },
})

// CRUD
const userCrud = reldb.crud.table({
  table: 'users',
  idColumn: 'id',
  select: ['id', 'name', 'email'],
  createColumns: ['name', 'email'],
  updateColumns: ['name', 'email'],
  dbType: 'sqlite',
})
await userCrud.create({ name: '李四', email: 'li@test.com' })
const user = await userCrud.findById(1)

// 关闭
await reldb.close()
```

`reldb.config` 返回的是**脱敏后的配置快照**：数据库 `password`、URL 内嵌凭证和 TLS 客户端私钥 `ssl.key` 会自动隐藏，便于排查状态但不应用于回放原始连接信息。

多个部署节点同时准备模块结构时，使用 `reldb.prepareSchema(key, ({ ddl, sql }) => ...)`。PostgreSQL 通过固定模块标识的事务锁协调建表、检查索引和更新种子行，回调失败回滚。请通过回调提供的操作访问数据库，并将模型服务、容器等外部调用放在事务结束之后。其他提供方沿用自身 DDL 提交规则。

## 配置清单

生成的项目在 `config/_db.yml` 中设置数据库类型、地址和连接选项。应用启动代码读取该文件，把配置对象传给 `reldb.init(config)`。

在[模块配置清单](../../docs/usage/configuration/reldb.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/reldb.md)中查看调用示例、输入输出、错误处理与使用要点。

- `reldb.init` / `reldb.close` / `reldb.config` / `reldb.isInitialized` — 管理数据库连接生命周期
- `reldb.ddl` / `reldb.schemaColumns` / `reldb.prepareSchema` — 定义、准备和检查表结构
- `reldb.sql` / `reldb.crud` / `reldb.tx` / `reldb.pagination` / `reldb.json` — 执行 SQL、生成 CRUD、使用事务、分页和 JSON 路径

<a id="事务"></a>

[事务用法](../../docs/usage/function/reldb.md#事务)

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/reldb.md)，了解连接池、应用表、DDL 约定与事务状态。

## 开发测试

```bash
pnpm --filter @h-ai/reldb test
```

> MySQL/PostgreSQL 测试需要 Docker。

源码 JSDoc 遵循[统一规范](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)：公开示例使用实际发布入口，内部示例在原模块作用域检查。构建后执行 `pnpm check:jsdoc --package reldb`；示例编译不代替真实后端行为验证。

## 许可证

Apache-2.0
