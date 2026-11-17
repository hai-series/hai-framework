# @h-ai/reldb API reference

<!-- translation: partial -->

[Chinese source](reldb.md) · [Configuration](../configuration/reldb.en.md) · [Data structures](../data/reldb.en.md)

<a id="quick-start"></a>

Initialize the configured database, then select SQL, a typed CRUD table or a transaction. Pass data as bound parameters and choose identifiers from trusted definitions. Check `HaiResult.success` before using data.

<a id="api-reference"></a>

| API | Input and result | Example |
| --- | --- | --- |
| `reldb.ddl.createTable`, `dropTable`, `addColumn`, `dropColumn`, `renameTable`, `createIndex`, `dropIndex`, `raw` | Modify the database schema using trusted table and column definitions. | `await reldb.ddl.dropTable('orders')` |
| `reldb.sql.query`, `get`, `execute`, `batch`, `queryPage` | Run queries, read one row, run writes, batch commands or return a page. | `await reldb.sql.query('SELECT id FROM orders')` |
| `reldb.pagination.normalize`, `build`, `reldb.schemaColumns` | Normalize a page request, prepare paging clauses or map a schema to column definitions. | `reldb.pagination.normalize({ page: 1 })` |
| `reldb.tx.begin`, `wrap` | Manage a transaction explicitly or run work within a controlled transaction. | `await reldb.tx.begin()` |
| `reldb.crud.table` | Create a typed table handle for common create/read/update/delete operations. | `reldb.crud.table('orders')` |
| `reldb.json.extract`, `set`, `insert`, `remove`, `merge` | Build driver-specific JSON functions for extracting and updating document fields. | `reldb.json.extract('payload', '$.status')` |

Additional options and workflow examples are available in the [Chinese reference](reldb.md).
