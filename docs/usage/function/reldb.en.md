# @h-ai/reldb API reference

<!-- translation: partial -->

[Chinese source](reldb.md) · [Configuration](../configuration/reldb.en.md) · [Data structures](../data/reldb.en.md)

<a id="quick-start"></a>

## Quick start

Initialize the configured database, then select SQL, a typed CRUD table or a transaction. Pass data as bound parameters and choose identifiers from trusted definitions. Check `HaiResult.success` before using data.

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

<a id="api-reference"></a>

## API list

| API | Input and result | Example |
| --- | --- | --- |
| `reldb.ddl.createTable`, `dropTable`, `addColumn`, `dropColumn`, `renameTable`, `createIndex`, `dropIndex`, `raw` | Modify the database schema using trusted table and column definitions. | `await reldb.ddl.dropTable('orders')` |
| `reldb.sql.query`, `get`, `execute`, `batch`, `queryPage` | Run queries, read one row, run writes, batch commands or return a page. | `await reldb.sql.query('SELECT id FROM orders')` |
| `reldb.pagination.normalize`, `build`, `reldb.schemaColumns` | Normalize a page request, prepare paging clauses or map a schema to column definitions. | `reldb.pagination.normalize({ page: 1 })` |
| `reldb.tx.begin`, `wrap` | Manage a transaction explicitly or run work within a controlled transaction. | `await reldb.tx.begin()` |
| `reldb.crud.table` | Create a typed table handle for common create/read/update/delete operations. | `reldb.crud.table('orders')` |
| `reldb.json.extract`, `set`, `insert`, `remove`, `merge` | Build driver-specific JSON functions for extracting and updating document fields. | `reldb.json.extract('payload', '$.status')` |

Still untranslated: the per-method SQL, JSON, transaction and repository examples. Read the [Chinese source section](reldb.md#api-reference).
