# @h-ai/cache Data structures

[Chinese source](cache.md) · [Configuration](../configuration/cache.en.md) · [API reference](../function/cache.en.md)

The caller owns business keys and values. Select a namespace and set expiry deliberately. Memory data disappears on close or restart.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `kv`, `hash` | Caller key. JSON value or field-to-value map. Counters store numeric values. |
| `list`, `set_`, `zset` | Ordered list with duplicates, unique members, or members with numeric scores. |
| `__lock:<key>` | Owner token. Expiry releases the lease. Release with the token for the same lease. |
