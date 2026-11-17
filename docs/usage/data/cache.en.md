# @h-ai/cache Data structures

[Chinese source](cache.md) · [Configuration](../configuration/cache.en.md) · [API reference](../function/cache.en.md)

<a id="example-data"></a>

## What these records are for

Start with the purpose and examples, then consult field and storage details below. IDs and business content are fictional; sensitive values are redacted. Times use 2026-11-17 00:00 UTC as the example start, with units explained for each record.

### A cached number

Structure: `orders:total`.

Cache a business count to avoid recalculation. Use atomic counter operations for concurrent changes.

```json
3
```

total is application-owned; 3 is that business count, not Cache’s total number of keys.

### A cached profile

Structure: `orders:profile:42`.

Reuse a fetched profile across requests; business code updates or removes it when changed.

```json
{
  "id": "user-42",
  "name": "Example"
}
```

This is user-42. With ex:60 it expires after 60 seconds; no explicit lifetime means no automatic expiry.

### Individual profile fields

Structure: `orders:profile-fields:42`.

A hash lets code update one field without replacing a whole object.

```json
{
  "name": "Example",
  "status": "active"
}
```

name and status are separate fields. Expiry applies to the whole hash, not status alone.

### An ordered queue

Structure: `orders:queue`.

A list keeps insertion order and permits duplicates.

```json
[
  "order-42",
  "order-43"
]
```

order-42 precedes order-43. A list alone does not guarantee one execution; use a job service such as Runner for durable tasks.

### Unique members

Structure: `orders:tags`.

A set answers membership questions and keeps one copy of each value.

```json
[
  "new",
  "paid"
]
```

The set contains new and paid. The displayed array is an inspection view; sets have no guaranteed order.

### Members ranked by score

Structure: `orders:scores`.

A sorted set ranks each member by a numeric score.

```json
[
  {
    "member": "user-42",
    "score": 8
  }
]
```

user-42 has score 8. The score controls ordering, not how often the member appears.

### A temporary lock owner

Structure: `orders:__lock:invoice-42`.

A lock makes competing workers defer temporarily; release or renewal must match its owner token.

```json
"<lock-token:redacted>"
```

The redacted token defaults to a 30-second lease. Final writes still need version or uniqueness checks.

## Field, storage and cleanup reference

The caller owns business keys and values. Select a namespace and set expiry deliberately. Memory data disappears on close or restart.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `kv`, `hash` | Caller key. JSON value or field-to-value map. Counters store numeric values. |
| `list`, `set_`, `zset` | Ordered list with duplicates, unique members, or members with numeric scores. |
| `__lock:<key>` | Owner token. Expiry releases the lease. Release with the token for the same lease. |
