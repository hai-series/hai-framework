# @h-ai/reldb Data structures

[简体中文](reldb.md) · [日本語](reldb.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/reldb.en.md) · [API reference](../function/reldb.en.md)

When an application queries orders, RelDB uses the active database connection and returns the columns the application defined. The application or module that defines the table owns its constraints and retention.

<a id="database-connections"></a>

## Tables, connections, and transactions

RelDB manages connections or connection pools and the transaction handles borrowed by the current process. Modules such as [IAM](iam.en.md), [Runner](runner.en.md), [Scheduler](scheduler.en.md), and [Audit](audit.en.md) define and create their own tables. RelDB creates zero business tables and zero cache keys of its own.

| Data | Owner | Access and retention |
| --- | --- | --- |
| Business tables and indexes | Application or module that defines them | Callers manage schemas with `reldb.ddl` and access records through `reldb.sql` or repositories. Callers set retention and migration rules for persistent records. |
| SQLite database file | Application or deployment environment | Stored at the configured path. A development database created with `:memory:` is released when its connection closes. |
| Connections, pools, and transaction handles | Current process's RelDB instance | `reldb.init()` opens a connection or pool. Each transaction holds a borrowed connection until the application commits or rolls back. `reldb.close()` releases connection resources. |

<a id="example-data"></a>

### An application-owned orders table

The following example shows four columns returned from an application-owned orders table. Order `order-42` belongs to customer `user-42` and costs 1200 minor currency units, or 12 yuan. A `null` note means the order has no note yet.

```json
[
  {
    "id": "order-42",
    "user_id": "user-42",
    "total_cents": 1200,
    "note": null
  }
]
```

<a id="result-examples"></a>

### Order query and write results

The application queries 21 orders in a stable order. With 10 items per page, only `order-42` appears on page 3. A successful `reldb.sql.queryPage()` call returns the following object. `total` counts all matching rows, and `items` contains the current page.

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "order-42",
        "user_id": "user-42",
        "total_cents": 1200,
        "note": null
      }
    ],
    "total": 21,
    "page": 3,
    "pageSize": 10
  }
}
```

When the application adds a note using a parameterized `UPDATE`, `reldb.sql.execute()` returns the driver's affected-row count. This example projects `success` and `data.changes` from the result. If the write runs in a transaction, wait for a successful commit before treating the note as saved.

```json
{
  "success": true,
  "data": { "changes": 1 }
}
```

[Paginated queries](../function/reldb.en.md#sql) · [Transactions and commit results](../function/reldb.en.md#transactions)

<a id="schema-migration-checks"></a>

### Check primary keys in existing SQLite tables

For an existing SQLite orders table, check the `pk` and `notnull` values for the text column `id` with `PRAGMA table_info(orders)`. Use `SELECT COUNT(*) AS total FROM orders WHERE id IS NULL` to check existing rows. For a new text column declared with `primaryKey: true, notNull: true`, both metadata values should be 1. A table created by an earlier release may still allow nulls. Decide how to handle those records before rebuilding the constraint, then read back the data to verify the migration.

### Check existing MySQL constraints and PostgreSQL partial indexes

In MySQL, if an earlier release added `order_id` with `addColumn()`, use `SHOW CREATE TABLE order_items` to verify that the foreign key references `orders(id)` and has the expected delete and update actions. If the key is missing, check for order items with no matching order before adding the constraint in an application migration. Run `SHOW INDEX FROM order_items` and `SHOW INDEX FROM orders` for tables that may use the same index name. Check the owning table, key column order, and uniqueness.

In PostgreSQL, use `SELECT pg_get_indexdef(to_regclass('public.orders_pending_idx'))` to read the existing index definition and its `WHERE` clause. Compare the actual predicate with the current `prepareSchema()` definition. If the predicate needs to change, migrate the index explicitly and run schema preparation again.
