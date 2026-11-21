# @h-ai/reldb Data structures

[Chinese source](reldb.md) · [Configuration](../configuration/reldb.en.md) · [API reference](../function/reldb.en.md)

<a id="example-data"></a>

## What these records are for

### An application-owned orders table

Structure: `application table: orders`.

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

## Field, storage and cleanup reference

RelDB operates on tables, indexes and column defaults defined by the calling application or module. It owns the active connection or connection pool and transaction handles. It stores no cache keys of its own.
