# @h-ai/cache Data structures

[Chinese source](cache.md) · [Configuration](../configuration/cache.en.md) · [API reference](../function/cache.en.md)

<a id="example-data"></a>

## What these records are for

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

This example shows the profile for `user-42`. Writing it with `ex: 60` makes it expire 60 seconds after the write. When the application omits expiry, it can update or delete the profile as needed.

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

The logical key is `__lock:invoice-42`. Redis stores it as `orders:__lock:invoice-42` when `keyPrefix` is `orders:`. Redis and Memory both store the owner and acquisition depth as one string.

The first acquisition of `invoice-42` stores the owner token returned to the caller. The example below uses a redacted token. The default lease lasts 30 seconds from the first acquisition.

```json
"<lock-token:redacted>"
```

The holder can call `cache.lock.acquire('invoice-42', { owner })` again. It returns the same `owner`, increases the depth, and preserves the original expiry. The stored value after the second acquisition looks like this.

```json
"<lock-token:redacted>|2"
```

The first `release` succeeds with `data: true`, restores the token-only value, and leaves the lock held at depth one. The next release deletes the key. Renewal requires the same `owner`. Expiry deletes the entire key at any depth. Final writes still need version or uniqueness checks.

## Field, storage and cleanup reference

The caller owns business keys and values. Select a namespace and set expiry deliberately. Memory data disappears on close or restart.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `kv`, `hash` | Caller key. JSON value or field-to-value map. Counters store numeric values. |
| `list`, `set_`, `zset` | Ordered list with duplicates, unique members, or members with numeric scores. |
| `__lock:<key>` | A string containing `owner` at depth one or `owner\|depth` at greater depths. The default lease is 30 seconds. Renewal and release use the same `owner`. |

Removing the last item in a Hash, List, Set, or ZSet deletes the key and its TTL. A collection created under the same name starts with no expiry.
