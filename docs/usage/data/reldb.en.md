# @h-ai/reldb Data structures

[简体中文](reldb.md) · [日本語](reldb.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/reldb.en.md) · [API reference](../function/reldb.en.md)

When an application queries orders, RelDB uses the active database connection and returns the columns the application defined. The module that defines the table owns its constraints and retention.

<a id="database-connections"></a>

## Tables, connections, and transactions

RelDB operates on tables, indexes and column defaults defined by the calling application or module. It owns the active connection or connection pool and transaction handles. It stores no cache keys of its own.

<a id="example-data"></a>

### An application-owned orders table

RelDB provides database access; the application designs its orders table.

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

This order belongs to user-42, costs 1200 minor currency units, and has no note. The framework does not create this example table.
