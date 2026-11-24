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

### Database

Cache creates no SQL tables. Redis uses the database from the connection settings. Memory mode keeps keys in the current process and clears them at shutdown.

### Cache keys

Cache supports six key families. The caller chooses the names and values for business keys. The examples use an application prefix of `orders:`.

| Key or family | Purpose | Default expiry and cleanup |
| --- | --- | --- |
| [`kv`](#cache-cache-kv) | Temporarily store a value or update a counter. | No expiry by default. Use `ex` in seconds or `px` in milliseconds. An update that compares the old value can use `keepTtl`. |
| [`hash`](#cache-cache-hash) | Read and update selected fields in a record. | No expiry by default. Set expiry on the entire key. |
| [`list`](#cache-cache-list) | Keep items in order. | No expiry by default. Set expiry on the whole list. |
| [`set_`](#cache-cache-set) | Keep each member once. | No expiry by default. Set expiry on the entire set. |
| [`zset`](#cache-cache-zset) | Rank members by score. | No expiry by default. Set expiry on the entire sorted set. |
| [`__lock:<key>`](#cache-cache-lock) | Let one worker hold a short-lived business lock. | Defaults to 30 seconds. Renew or release with the same `owner`. Final release or expiry removes the key. |

<a id="cache-cache-kv"></a>

#### `kv`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| whole value | JSON | — | Stores an entire record. A missing key reads as `null`. | `orders:profile:42` → `{"id":"user-42"}` |
| counter | `number` | — | Counter operations update the number atomically. | `orders:total` → `3` |

<a id="cache-cache-hash"></a>

#### `hash`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| fields | `string` → JSON | — | The application names fields and reads or writes each independently. | `orders:profile-fields:42` → `{"status":"active"}` |

<a id="cache-cache-list"></a>

#### `list`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| elements | JSON array | — | Keeps insertion order and allows duplicates. | `orders:queue` → `["order-41","order-42"]` |

<a id="cache-cache-set"></a>

#### `set_`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| members | set of strings | — | Stores each member once with no ordering guarantee. | `orders:tags` → `["paid","priority"]` |

<a id="cache-cache-zset"></a>

#### `zset`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| member | `string` | — | Unique member within the set. | `order-42` |
| score | `number` | — | Score used for sorting. Example key is `orders:scores`. | `99` |

<a id="cache-cache-lock"></a>

#### `__lock:<key>`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| owner | `string` | — | Token saved on the first acquisition. Business key `invoice-42` maps to `__lock:invoice-42`. | `<lock-token:redacted>` |
| depth | `integer` | `1` | For repeated acquisitions by the owner, depth is encoded in the same string. | `<lock-token:redacted>\|2` |

Removing the last item in a Hash, List, Set or ZSet removes the key and its expiry. A new collection reusing that name starts without an expiry.

Pass the logical key when calling Cache. A `keyPrefix` of `orders:` turns `total` into the Redis key `orders:total`. Scan returns `total`. Redis Cluster requires related keys in the same hash slot for atomic operations across keys. A shared tag such as `{order42}` places related keys together.
