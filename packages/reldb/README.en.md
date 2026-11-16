# @h-ai/reldb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

A relational database module with a unified `reldb` object for SQLite, PostgreSQL, and MySQL.

## Quick Start

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

`reldb.config` returns a **redacted configuration snapshot**. Database `password`, URL credentials and the TLS client private key `ssl.key` are hidden. Use it to inspect state, not to replay connection details.

Use `reldb.prepareSchema(key, ({ ddl, sql }) => ...)` to coordinate schema preparation across PostgreSQL nodes. The callback uses one locked transaction and rolls back on failure. Use the supplied operations and keep external work outside the transaction. Other providers retain their own DDL commit rules.

## Configuration Reference

Generated projects use `config/_db.yml`, with `reldb.init(config)` as the application configuration entry point.

See the [configuration reference](../../docs/usage/configuration/reldb.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/reldb.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `init` / `close` / `config` / `isInitialized` — Manage the database connection lifecycle
- `ddl` / `schemaColumns` / `prepareSchema` — Define, prepare and inspect table schemas
- `sql` / `crud` / `tx` / `pagination` / `json` — Run SQL, use CRUD and transactions, paginate and query JSON paths

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/reldb.md) in Chinese for connection pools, application tables, DDL conventions and transaction state.

## Development and Testing

```bash
pnpm --filter @h-ai/reldb test
```

> MySQL/PostgreSQL tests require Docker.

Source JSDoc follows the [shared conventions](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证): public examples use published entry points, and internal examples are checked in their module scope. After building, run `pnpm check:jsdoc --package reldb`; compiling examples does not replace backend behavior tests.

## License

Apache-2.0
