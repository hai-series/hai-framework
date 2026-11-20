# @h-ai/reldb API reference

<!-- translation: partial -->

[Chinese source](reldb.md) · [Configuration](../configuration/reldb.en.md) · [Data structures](../data/reldb.en.md)

## Quick start

Initialize the configured database, then select SQL, a typed CRUD table or a transaction. Pass data as bound parameters and choose identifiers from trusted definitions. Check `HaiResult.success` before using data.

```ts
import { HaiReldbError, reldb } from '@h-ai/reldb'

// 初始化
// Open an in-memory SQLite database for this process. Success enables SQL. Read error on failure.
const initialized = await reldb.init({ type: 'sqlite', database: ':memory:' })
if (!initialized.success)
  throw new Error(initialized.error.message)

// DDL
// Create users with the ID, name, and email fields below. Success has no data. DDL failures appear in error.
await reldb.ddl.createTable('users', {
  id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
  name: { type: 'TEXT', notNull: true },
  email: { type: 'TEXT', unique: true },
})

// SQL
// Bind the sample name and email to the two placeholders. data.changes is the insert count. Check error on failure.
await reldb.sql.execute('INSERT INTO users (name, email) VALUES (?, ?)', ['张三', 'test@example.com'])
// Read all users rows. Success is an array containing the inserted user. Check error on failure.
const users = await reldb.sql.query<{ id: number, name: string }>('SELECT * FROM users')

// 分页查询
// Read page 1 in ID order, up to 20 rows. Success has items and total. Check error on failure.
const page = await reldb.sql.queryPage<{ id: number, name: string }>({
  sql: 'SELECT id, name FROM users ORDER BY id',
  pagination: { page: 1, pageSize: 20 },
})

// CRUD
// Build a CRUD repository for users using the key and allowed columns below. The following calls use that object.
const userCrud = reldb.crud.table({
  table: 'users',
  idColumn: 'id',
  select: ['id', 'name', 'email'],
  createColumns: ['name', 'email'],
  updateColumns: ['name', 'email'],
  dbType: 'sqlite',
})
// Create the second user from the sample name and email. Success includes the affected-row count. Check error on failure.
await userCrud.create({ name: '李四', email: 'li@test.com' })
// Look up key 1 for the first user. Success data is the row or null. Check error on failure.
const user = await userCrud.findById(1)

// 关闭
// Close this database connection without arguments. Success has no data. Check error on failure.
await reldb.close()
```

<a id="api-list"></a>

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Import the module as in the quick start. Except for lifecycle examples, run scenarios after initialization and before closure. The value helper checks HaiResult.success and preserves the original error. Use isolated test data and explicit cleanup.

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="connection"></a>

### Connect, prepare and close: `reldb`

Connect first, coordinate schema preparation with prepareSchema and end transactions before closing.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `reldb.init` | 创建并验证数据库连接 | `config`（必填） | `Promise<HaiResult<void>>` | `await reldb.init({ type: 'sqlite', database: ':memory:' })` |
| `reldb.close` | 释放连接；先结束应用仍持有的事务 | 先结束应用仍持有的事务；无 | `Promise<HaiResult<void>>` | `await reldb.close()` |
| `reldb.prepareSchema` | 同一个数据库连接上以指定名称协调表结构准备 | `key` 和异步回调 `prepare`；回调接收当前连接的 `ddl`、`sql` | `Promise<HaiResult<T>>` | `await reldb.prepareSchema('orders', db => db.ddl.createTable('orders', { id: { type: 'TEXT', primaryKey: true } }))` |

#### Scenario: Connect, prepare and close

The quick start uses development SQLite. init and close have no business data; prepareSchema supplies this connection’s ddl/sql and returns the callback result. Production and cleanup rules follow.

[Detailed parameters and workflows](reldb.md#connection)

<a id="schema"></a>

### Create and change tables: `reldb.ddl`

Use trusted table names, columns and definitions, and inspect destructive changes before executing them.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `reldb.ddl.createTable` | Create a table | tableName, columns, ifNotExists | `void` | `await reldb.ddl.createTable('orders', { id: { type: 'TEXT', primaryKey: true } })` |
| `reldb.ddl.dropTable` | Drop a table and its data | tableName, ifExists | `void` | `await reldb.ddl.dropTable('orders_archive', true)` |
| `reldb.ddl.addColumn` | Add a column | tableName, columnName, columnDef | `void` | `await reldb.ddl.addColumn('orders', 'note', { type: 'TEXT' })` |
| `reldb.ddl.dropColumn` | Drop a column | tableName, columnName | `void` | `await reldb.ddl.dropColumn('orders', 'note')` |
| `reldb.ddl.renameTable` | Rename a table | oldName, newName | `void` | `await reldb.ddl.renameTable('orders_draft', 'orders')` |
| `reldb.ddl.createIndex` | Create an index | tableName, indexName, indexDef | `void` | `await reldb.ddl.createIndex('orders', 'orders_status', { columns: ['status'] })` |
| `reldb.ddl.dropIndex` | Drop an index | indexName, ifExists | `void` | `await reldb.ddl.dropIndex('orders_status', true)` |
| `reldb.ddl.raw` | Execute trusted DDL | sql | `void` | `await reldb.ddl.raw('CREATE TABLE IF NOT EXISTS app_marker (id TEXT PRIMARY KEY)')` |
| `reldb.schemaColumns` | Inspect table columns | table, sql | `string[]` | `await reldb.schemaColumns('orders')` |

#### Scenario: Create and change tables

```ts
// Create the sample order table with a text ID primary key. Success has no data. value throws on failure.
value(await reldb.ddl.createTable('demo_orders', { id: { type: 'TEXT', primaryKey: true } }))
// Add the nullable TEXT column note to demo_orders. Success updates the schema. value throws on failure.
value(await reldb.ddl.addColumn('demo_orders', 'note', { type: 'TEXT' }))
// Inspect the modified table. Success returns ['id', 'note']. value throws on failure.
value(await reldb.schemaColumns('demo_orders')) // ['id', 'note']
// Create the named index on demo_orders.note. Success changes the schema. value throws on failure.
value(await reldb.ddl.createIndex('demo_orders', 'demo_orders_note', { columns: ['note'] }))
// Drop the new index by name. true allows it to be absent. Success has no data. value throws on failure.
value(await reldb.ddl.dropIndex('demo_orders_note', true))
// Drop note and its values from demo_orders. Success has no data. value throws on failure.
value(await reldb.ddl.dropColumn('demo_orders', 'note'))
// Rename the table to demo_orders_old. Success has no data. value throws on failure.
value(await reldb.ddl.renameTable('demo_orders', 'demo_orders_old'))
// Drop the renamed table. true allows absence. Success has no data. value throws on failure.
value(await reldb.ddl.dropTable('demo_orders_old', true))
// Execute the trusted constant DDL for the marker table. Success has no data. value throws on failure.
value(await reldb.ddl.raw('CREATE TABLE IF NOT EXISTS demo_marker (id TEXT PRIMARY KEY)'))
// All successful DDL calls have no business data.
```

Use new demo_ tables and indexes. schemaColumns returns actual column names. raw accepts trusted SQL; DDL transaction support varies by database.

[Detailed parameters and workflows](reldb.md#schema)

<a id="sql"></a>

### Parameterized queries and pages: `reldb.sql`, `reldb.pagination`

Pass dynamic values as parameters, distinguish query rows from execution counts and use stable ordering for pages.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `reldb.sql.query` | Query multiple rows with parameters | sql, params | `T[]` | `await reldb.sql.query('SELECT id FROM orders WHERE status = ?', ['pending'])` |
| `reldb.sql.get` | Query one row with parameters | sql, params | `T \| null` | `await reldb.sql.get('SELECT id FROM orders WHERE id = ?', ['o1'])` |
| `reldb.sql.execute` | Execute a parameterized write | sql, params | `ExecuteResult` | `await reldb.sql.execute('UPDATE orders SET status = ? WHERE id = ?', ['paid', 'o1'])` |
| `reldb.sql.batch` | Execute a batch of statements | statements | `void` | `await reldb.sql.batch([{ sql: 'DELETE FROM orders WHERE id = ?', params: ['o1'] }])` |
| `reldb.sql.queryPage` | Read a result page and total | options | `PaginatedResult<T>` | `await reldb.sql.queryPage({ sql: 'SELECT id FROM orders ORDER BY id', pagination: { page: 1, pageSize: 20 } })` |
| `reldb.pagination.normalize` | Normalize pagination values | options, overrides | `NormalizedPagination` | `reldb.pagination.normalize({ page: 1, pageSize: 20 })` |
| `reldb.pagination.build` | Build a paginated result | items, total, pagination | `PaginatedResult<T>` | `reldb.pagination.build([], 0, { page: 1, pageSize: 20 })` |

#### Scenario: Parameterized queries and pages

```ts
// Create the query example table with a text primary key. Success has no data. value throws on failure.
value(await reldb.ddl.createTable('demo_sql', { id: { type: 'TEXT', primaryKey: true } }))
// Bind o1 to the insert placeholder. The result includes affected rows. value throws on failure.
const inserted = value(await reldb.sql.execute('INSERT INTO demo_sql (id) VALUES (?)', ['o1'])) // affected-row result
// Read the inserted ID column. Success returns [{ id: 'o1' }]. value throws on failure.
value(await reldb.sql.query('SELECT id FROM demo_sql ORDER BY id')) // [{ id: 'o1' }]
// Bind o1 and read the first matching row, { id: 'o1' }. value throws on failure.
value(await reldb.sql.get('SELECT id FROM demo_sql WHERE id = ?', ['o1'])) // { id: 'o1' }
// Normalize page 1 and size 20 into the limit and offset for the first page.
const pagination = reldb.pagination.normalize({ page: 1, pageSize: 20 })
// Run the trusted SQL with normalized pagination. The page contains o1 and total 1. value throws on failure.
const page = value(await reldb.sql.queryPage({ sql: 'SELECT id FROM demo_sql ORDER BY id', pagination }))
// page.items: [{ id: 'o1' }], total: 1
// Build the equivalent page envelope from the sample row, total, and page settings.
reldb.pagination.build([{ id: 'o1' }], 1, { page: 1, pageSize: 20 }) // equivalent page envelope
// Execute the deletion of o1 in this batch. Success removes the row and returns no data. value throws on failure.
value(await reldb.sql.batch([{ sql: 'DELETE FROM demo_sql WHERE id = ?', params: ['o1'] }])) // undefined
// Look up o1 after deletion. Success returns null. value throws on query failure.
value(await reldb.sql.get('SELECT id FROM demo_sql WHERE id = ?', ['o1'])) // null
```

o1 is a bound value. get returns successful null when missing, query returns an array and batch has no business data. Value parameters cannot substitute identifiers.

[Detailed parameters and workflows](reldb.md#sql)

<a id="transactions"></a>

### Commit or roll back together: `reldb.tx`

Use one transaction for related reads and writes. Manually opened transactions must commit or roll back on every path.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `reldb.tx.begin` | Begin a manual transaction | 无参数 | `DmlWithTxOperations` | `await reldb.tx.begin()` |
| `reldb.tx.wrap` | Commit or roll back a transaction callback | fn | `T` | `await reldb.tx.wrap(async tx => { const found = await tx.get('SELECT 1 AS value'); if (!found.success) throw new Error(found.error.message); return found.data })` |

#### Scenario: Commit or roll back together

This shows the automatic transaction boundary. Each operation still returns HaiResult: inspect it and throw on failure to prevent a commit.

![tx.wrap: commit and rollback conditions](../images/function-reldb-transaction.en.svg)

Any normal callback return, including an unchecked failed HaiResult, enters commit. A throw enters rollback; commit/rollback failures must also be handled. The transaction covers its database operations, not messages, payments or file uploads in other systems.

Below, wrap returns the callback value and rolls back on throws; manual begin ends with commit or rollback. Check failed HaiResult values before allowing the callback to commit.

[Detailed parameters and workflows](reldb.md#transactions)

<a id="repositories"></a>

### Work with records: `reldb.crud`

Map table fields to application objects with a repository, then create, query, update or delete records and bind transactions when needed.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `reldb.crud.table` | Create CRUD operations for a table | Create a typed table handle for common create/read/update/delete operations. | Create a typed table handle for common create/read/update/delete operations. | `reldb.crud.table('orders')` |

| `repository.create` | Insert a record | `data, tx?` | `Promise<HaiResult<ExecuteResult>>` | `await repository.create({ id: 'r1', name: 'Ada' })` |
| `repository.createMany` | Insert records | `items, tx?` | `Promise<HaiResult<void>>` | `await repository.createMany([{ id: 'r2', name: 'Lin' }])` |
| `repository.createOrUpdate` | Upsert by ID | `data, tx?` | `Promise<HaiResult<ExecuteResult>>` | `await repository.createOrUpdate({ id: 'r1', name: 'Ada v2' })` |
| `repository.findById` | Find, allowing a missing record | `id, tx?` | `Promise<HaiResult<TItem \| null>>` | `await repository.findById('r1')` |
| `repository.getById` | Get, failing if missing | `id, tx?` | `Promise<HaiResult<TItem>>` | `await repository.getById('r1')` |
| `repository.findAll` | Query records | `options?, tx?` | `Promise<HaiResult<TItem[]>>` | `await repository.findAll({ orderBy: 'id ASC' })` |
| `repository.findPage` | Query a page | `options, tx?` | `Promise<HaiResult<PaginatedResult<TItem>>>` | `await repository.findPage({ pagination: { page: 1, pageSize: 10 } })` |
| `repository.updateById` | Update by ID | `id, data, tx?` | `Promise<HaiResult<ExecuteResult>>` | `await repository.updateById('r1', { name: 'Ada v3' })` |
| `repository.deleteById` | Delete by ID | `id, tx?` | `Promise<HaiResult<ExecuteResult>>` | `await repository.deleteById('r2')` |
| `repository.count` | Count records | `options?, tx?` | `Promise<HaiResult<number>>` | `await repository.count()` |
| `repository.exists` | Test a condition | `options?, tx?` | `Promise<HaiResult<boolean>>` | `await repository.exists({ where: 'name = ?', params: ['Lin'] })` |
| `repository.existsById` | Test an ID | `id, tx?` | `Promise<HaiResult<boolean>>` | `await repository.existsById('r2')` |

`findAll({ orderBy, offset })` skips the specified number of rows and returns the rest. You can omit `limit` in SQLite, PostgreSQL, and MySQL.

#### Scenario: Work with records

The full repository definition below is followed by instance-method scenarios with input records, pages, counts and missing-record behavior. BaseReldbCrudRepository supports custom repositories.

[Detailed parameters and workflows](reldb.md#repositories)

<a id="json-fields"></a>

### Read and write JSON fields: `reldb.json`

These helpers build parameterized SQL expressions; they do not modify the database until executed.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `reldb.json.extract` | Build a JSON extraction SQL expression | column, path | `JsonSqlExpr` | `reldb.json.extract('payload', '$.status')` |
| `reldb.json.set` | Build a JSON path assignment | column, path, value | `JsonSqlExpr` | `reldb.json.set('payload', '$.status', 'paid')` |
| `reldb.json.insert` | Build a JSON path insertion | column, path, value | `JsonSqlExpr` | `reldb.json.insert('payload', '$.note', 'checked')` |
| `reldb.json.remove` | Build a JSON path removal | column, path | `JsonSqlExpr` | `reldb.json.remove('payload', '$.note')` |
| `reldb.json.merge` | Build a JSON merge SQL expression | column, patch | `JsonSqlExpr` | `reldb.json.merge('payload', { status: 'paid' })` |

#### Scenario: Read and write JSON fields

The payload examples below cover extract, set, insert, remove and merge paths and resulting JSON. Match dialects to the backend; an expression is not persisted data.

[Detailed parameters and workflows](reldb.md#json-fields)
