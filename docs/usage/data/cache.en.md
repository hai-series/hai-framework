# @h-ai/cache Data structures

[简体中文](cache.md) · [日本語](cache.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/cache.en.md) · [API reference](../function/cache.en.md)

Applications can cache an order count, a profile snapshot, or a list of pending IDs. Workers coordinating the same job can use a lock token. Sharing these values across processes depends on the backend.

Cache creates no SQL tables. Redis uses the database from the connection settings. Memory mode keeps keys in the current process and clears them at shutdown.

## Cache

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

### `kv`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| whole value | JSON | — | Stores an entire record. A missing key reads as `null`. | `orders:profile:42` → `{"id":"user-42"}` |
| counter | `number` | — | Counter operations update the number atomically. | `orders:total` → `3` |

<a id="example-data"></a>

<a id="a-cached-number"></a>

#### Example · A cached number

Cache a business count to avoid recalculation. Use atomic counter operations for concurrent changes.

```json
3
```

total is application-owned; 3 is that business count, not Cache’s total number of keys.

<a id="a-cached-profile"></a>

#### Example · A cached profile

Reuse a fetched profile across requests; business code updates or removes it when changed.

```json
{
  "id": "user-42",
  "name": "Example"
}
```

This example shows the profile for `user-42`. Writing it with `ex: 60` makes it expire 60 seconds after the write. When the application omits expiry, it can update or delete the profile as needed.

<a id="cache-cache-hash"></a>

### `hash`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| fields | `string` → JSON | — | The application names fields and reads or writes each independently. | `orders:profile-fields:42` → `{"status":"active"}` |

<a id="individual-profile-fields"></a>

#### Example · Individual profile fields

A hash lets code update one field without replacing a whole object.

```json
{
  "name": "Example",
  "status": "active"
}
```

name and status are separate fields. Expiry applies to the whole hash, not status alone.

<a id="cache-cache-list"></a>

### `list`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| elements | JSON array | — | Keeps insertion order and allows duplicates. | `orders:queue` → `["order-41","order-42"]` |

<a id="an-ordered-queue"></a>

#### Example · An ordered queue

A list keeps insertion order and permits duplicates.

```json
[
  "order-42",
  "order-43"
]
```

order-42 precedes order-43. A list alone does not guarantee one execution; use a job service such as Runner for durable tasks.

<a id="cache-cache-set"></a>

### `set_`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| members | set of strings | — | Stores each member once with no ordering guarantee. | `orders:tags` → `["paid","priority"]` |

<a id="unique-members"></a>

#### Example · Unique members

A set answers membership questions and keeps one copy of each value.

```json
[
  "new",
  "paid"
]
```

The set contains new and paid. The displayed array is an inspection view; sets have no guaranteed order.

<a id="cache-cache-zset"></a>

### `zset`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| member | `string` | — | Unique member within the set. | `order-42` |
| score | `number` | — | Score used for sorting. Example key is `orders:scores`. | `99` |

<a id="members-ranked-by-score"></a>

#### Example · Members ranked by score

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

<a id="cache-cache-lock"></a>

### `__lock:<key>`

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| owner | `string` | — | Token saved on the first acquisition. Business key `invoice-42` maps to `__lock:invoice-42`. | `<lock-token:redacted>` |
| depth | `integer` | `1` | For repeated acquisitions by the owner, depth is encoded in the same string. | `<lock-token:redacted>\|2` |

Removing the last item in a Hash, List, Set or ZSet removes the key and its expiry. A new collection reusing that name starts without an expiry.

Pass the logical key when calling Cache. A `keyPrefix` of `orders:` turns `total` into the Redis key `orders:total`. Scan returns `total`. Redis Cluster requires related keys in the same hash slot for atomic operations across keys. A shared tag such as `{order42}` places related keys together.

<a id="a-temporary-lock-owner"></a>

#### Example · A temporary lock owner

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
