# @h-ai/cache

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

A unified cache module. The `cache` object provides KV / Hash / List / Set / ZSet / distributed lock operations with Memory and Redis backends.

## Quick Start

```ts
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'

const initialized = await cache.init({ type: 'redis', host: 'localhost' })
if (!initialized.success)
  throw new Error(initialized.error.message)
try {
  const written = await cache.kv.set('user:1', { name: 'Alice' }, { ex: 3600 })
  if (!written.success)
    throw new Error(written.error.message)
  const user = await cache.kv.get<{ name: string }>('user:1')
  if (!user.success)
    throw new Error(user.error.message)
  if (user.data)
    core.logger.info('Cached user', { name: user.data.name })
}
finally {
  const closed = await cache.close()
  if (!closed.success)
    core.logger.error('Cache cleanup pending', { code: closed.error.code })
}
```

`cache.config` returns a **redacted configuration snapshot**. Redis credential fields such as `password` / `url` are sanitized automatically; do not use the snapshot to write back original secrets.

## Features

Memory KV entries expire at their expiration time. `incr/decr/incrBy/decrBy` accept only safe integers or integer strings; invalid increments and overflow return `OPERATION_FAILED` without changing the original value. Hash names such as `__proto__` / `constructor` remain ordinary fields and do not change the returned object's prototype.

Memory KV, Hash, List, Set, and ZSet share one key namespace. `exists/expire/expireAt/ttl/persist/keys/scan/del/type` cover every structure; structure operations also treat expired keys as absent. del counts logical keys actually removed, and structure operations on another key type fail.

Connections become available only after a successful health check. Failed initialization disposes its candidate; `error.ext.cleanupPending === true` identifies cleanup that still needs retry. `cache.close()` returns `Promise<HaiResult<void>>`, waits for initialization, and coalesces concurrent close calls. Once cleanup starts, `isInitialized` is false and configuration/operations are unavailable. A failed cleanup retains the resource: the next `close()` or `init()` retries disposal before allocating a replacement. Always inspect the close result.

```ts
const closed = await cache.close()
if (!closed.success) {
  // Retry once after addressing the cleanup failure; report another failure.
  const retried = await cache.close()
  if (!retried.success)
    throw new Error(retried.error.message)
}
```

Redis falls back to disconnect when QUIT fails, and reports success only after releasing the client.

### Operations and results

Use the complete initialization flow in this section first. The host validates and authorizes example business values; check success before reading data from asynchronous domain results. Here void means completion without data, null means absent; synchronous factories/tools return the listed type directly.

key/keys identify business keys, field/fields hash fields, value/members JSON values; start/stop/index are indexes, min/max score bounds; seconds/ttl/timeout are seconds, timestamp Unix seconds; owner must come from acquire.

#### cache.kv

Cache JSON snapshots: get/mget yield values/null in input order; set takes TTL/NX/XX and returns applied boolean; mset takes [key,value][] and yields void.

| Entry           | Input parameters    | Successful result | Call example                                               |
| --------------- | ------------------- | ----------------- | ---------------------------------------------------------- |
| `cache.kv.get`  | key                 | `T \| null`       | `await cache.kv.get('u:1')`                                |
| `cache.kv.set`  | key, value, options | `boolean`         | `await cache.kv.set('u:1', { name: 'Alice' }, { ex: 60 })` |
| `cache.kv.mget` | keys                | `(T \| null)[]`   | `await cache.kv.mget('u:1', 'u:2')`                        |
| `cache.kv.mset` | entries             | `void`            | `await cache.kv.mset([['u:1', { name: 'Alice' }]])`        |

#### cache.kv

Versioned cross-node commit: key, expected, value and expiry atomically return applied; undefined means absent/delete, a mismatch preserves data and TTL.

| Entry                     | Input parameters              | Successful result | Call example                                     |
| ------------------------- | ----------------------------- | ----------------- | ------------------------------------------------ |
| `cache.kv.compareAndSwap` | key, expected, value, options | `boolean`         | `await cache.kv.compareAndSwap('version', 1, 2)` |

#### cache.kv

Manage all structures by key: del/exists take keys and return deleted/existing counts; type takes one key and returns its structure name.

| Entry             | Input parameters | Successful result | Call example                          |
| ----------------- | ---------------- | ----------------- | ------------------------------------- |
| `cache.kv.del`    | keys             | `number`          | `await cache.kv.del('u:1', 'u:2')`    |
| `cache.kv.exists` | keys             | `number`          | `await cache.kv.exists('u:1', 'u:2')` |
| `cache.kv.type`   | key              | `string`          | `await cache.kv.type('u:1')`          |

#### cache.kv

Retention: relative seconds, Unix seconds or key set/read/remove TTL. Changes yield boolean; ttl yields seconds (-1 persistent, -2 absent).

| Entry               | Input parameters | Successful result | Call example                                                         |
| ------------------- | ---------------- | ----------------- | -------------------------------------------------------------------- |
| `cache.kv.expire`   | key, seconds     | `boolean`         | `await cache.kv.expire('u:1', 60)`                                   |
| `cache.kv.expireAt` | key, timestamp   | `boolean`         | `await cache.kv.expireAt('u:1', Math.floor(Date.now() / 1000) + 60)` |
| `cache.kv.ttl`      | key              | `number`          | `await cache.kv.ttl('u:1')`                                          |
| `cache.kv.persist`  | key              | `boolean`         | `await cache.kv.persist('u:1')`                                      |

#### cache.kv

Counters take a key and optional integer delta and return the new safe integer; invalid type/overflow fails without changing data.

| Entry             | Input parameters | Successful result | Call example                        |
| ----------------- | ---------------- | ----------------- | ----------------------------------- |
| `cache.kv.incr`   | key              | `number`          | `await cache.kv.incr('hits')`       |
| `cache.kv.incrBy` | key, increment   | `number`          | `await cache.kv.incrBy('hits', 2)`  |
| `cache.kv.decr`   | key              | `number`          | `await cache.kv.decr('stock')`      |
| `cache.kv.decrBy` | key, decrement   | `number`          | `await cache.kv.decrBy('stock', 2)` |

#### cache.kv

Enumeration: keys takes a glob and yields keys; scan takes an opaque cursor and match/count and yields [nextCursor,keys], without snapshot or uniqueness guarantees.

| Entry           | Input parameters | Successful result    | Call example                                             |
| --------------- | ---------------- | -------------------- | -------------------------------------------------------- |
| `cache.kv.keys` | pattern          | `string[]`           | `await cache.kv.keys('u:*')`                             |
| `cache.kv.scan` | cursor, options  | `[string, string[]]` | `await cache.kv.scan('0', { match: 'u:*', count: 100 })` |

#### cache.hash

Field cache accepts key plus fields/object/delta. Reads yield value/null, object, field/value arrays or length; hset/hdel count additions/deletions, hexists yields boolean, hincrBy the new integer.

| Entry                | Input parameters      | Successful result | Call example                                    |
| -------------------- | --------------------- | ----------------- | ----------------------------------------------- |
| `cache.hash.hget`    | key, field            | `T \| null`       | `await cache.hash.hget('u:1', 'name')`          |
| `cache.hash.hset`    | key, field, value     | `number`          | `await cache.hash.hset('u:1', 'name', 'Alice')` |
| `cache.hash.hdel`    | key, fields           | `number`          | `await cache.hash.hdel('u:1', 'name')`          |
| `cache.hash.hexists` | key, field            | `boolean`         | `await cache.hash.hexists('u:1', 'name')`       |
| `cache.hash.hgetall` | key                   | `T`               | `await cache.hash.hgetall('u:1')`               |
| `cache.hash.hkeys`   | key                   | `string[]`        | `await cache.hash.hkeys('u:1')`                 |
| `cache.hash.hvals`   | key                   | `T[]`             | `await cache.hash.hvals('u:1')`                 |
| `cache.hash.hlen`    | key                   | `number`          | `await cache.hash.hlen('u:1')`                  |
| `cache.hash.hmget`   | key, fields           | `(T \| null)[]`   | `await cache.hash.hmget('u:1', 'name', 'age')`  |
| `cache.hash.hincrBy` | key, field, increment | `number`          | `await cache.hash.hincrBy('u:1', 'visits', 1)`  |

#### cache.list

Ordered queues use key, values and index/range: push returns length, pop/index value/null, range an array, set/trim void. Blocking pops take seconds and keys and return [key,value]/null.

| Entry               | Input parameters  | Successful result     | Call example                                      |
| ------------------- | ----------------- | --------------------- | ------------------------------------------------- |
| `cache.list.lpush`  | key, values       | `number`              | `await cache.list.lpush('jobs', 'job-1')`         |
| `cache.list.rpush`  | key, values       | `number`              | `await cache.list.rpush('jobs', 'job-2')`         |
| `cache.list.lpop`   | key               | `T \| null`           | `await cache.list.lpop('jobs')`                   |
| `cache.list.rpop`   | key               | `T \| null`           | `await cache.list.rpop('jobs')`                   |
| `cache.list.llen`   | key               | `number`              | `await cache.list.llen('jobs')`                   |
| `cache.list.lrange` | key, start, stop  | `T[]`                 | `await cache.list.lrange('jobs', 0, 9)`           |
| `cache.list.lindex` | key, index        | `T \| null`           | `await cache.list.lindex('jobs', 0)`              |
| `cache.list.lset`   | key, index, value | `void`                | `await cache.list.lset('jobs', 0, 'replacement')` |
| `cache.list.ltrim`  | key, start, stop  | `void`                | `await cache.list.ltrim('jobs', 0, 99)`           |
| `cache.list.blpop`  | timeout, keys     | `[string, T] \| null` | `await cache.list.blpop(5, 'jobs')`               |
| `cache.list.brpop`  | timeout, keys     | `[string, T] \| null` | `await cache.list.brpop(5, 'jobs')`               |

#### cache.set_

Deduplication/set operations: key+members add/remove/test with count/boolean; members returns an array, card a count, random/pop a member/array/null by count, intersections/unions/differences take keys and yield arrays.

| Entry                    | Input parameters | Successful result  | Call example                                    |
| ------------------------ | ---------------- | ------------------ | ----------------------------------------------- |
| `cache.set_.sadd`        | key, members     | `number`           | `await cache.set_.sadd('roles', 'editor')`      |
| `cache.set_.srem`        | key, members     | `number`           | `await cache.set_.srem('roles', 'editor')`      |
| `cache.set_.smembers`    | key              | `T[]`              | `await cache.set_.smembers('roles')`            |
| `cache.set_.sismember`   | key, member      | `boolean`          | `await cache.set_.sismember('roles', 'editor')` |
| `cache.set_.scard`       | key              | `number`           | `await cache.set_.scard('roles')`               |
| `cache.set_.srandmember` | key, count       | `T \| T[] \| null` | `await cache.set_.srandmember('roles', 2)`      |
| `cache.set_.spop`        | key, count       | `T \| T[] \| null` | `await cache.set_.spop('roles', 1)`             |
| `cache.set_.sinter`      | keys             | `T[]`              | `await cache.set_.sinter('roles:a', 'roles:b')` |
| `cache.set_.sunion`      | keys             | `T[]`              | `await cache.set_.sunion('roles:a', 'roles:b')` |
| `cache.set_.sdiff`       | keys             | `T[]`              | `await cache.set_.sdiff('roles:a', 'roles:b')`  |

#### cache.zset

Rankings accept members/scores or rank/score ranges; adds/removals yield counts, score/rank number/null, ranges member/scored-object arrays, incrBy the new score, card/count counts.

| Entry                         | Input parameters             | Successful result       | Call example                                                              |
| ----------------------------- | ---------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| `cache.zset.zadd`             | key, members                 | `number`                | `await cache.zset.zadd('scores', { member: 'u1', score: 10 })`            |
| `cache.zset.zrem`             | key, members                 | `number`                | `await cache.zset.zrem('scores', 'u1')`                                   |
| `cache.zset.zscore`           | key, member                  | `number \| null`        | `await cache.zset.zscore('scores', 'u1')`                                 |
| `cache.zset.zrank`            | key, member                  | `number \| null`        | `await cache.zset.zrank('scores', 'u1')`                                  |
| `cache.zset.zrevrank`         | key, member                  | `number \| null`        | `await cache.zset.zrevrank('scores', 'u1')`                               |
| `cache.zset.zrange`           | key, start, stop, withScores | `string[] \| ZMember[]` | `await cache.zset.zrange('scores', 0, 9, true)`                           |
| `cache.zset.zrevrange`        | key, start, stop, withScores | `string[] \| ZMember[]` | `await cache.zset.zrevrange('scores', 0, 9, true)`                        |
| `cache.zset.zrangeByScore`    | key, min, max, options       | `string[] \| ZMember[]` | `await cache.zset.zrangeByScore('scores', 10, 100, { withScores: true })` |
| `cache.zset.zcard`            | key                          | `number`                | `await cache.zset.zcard('scores')`                                        |
| `cache.zset.zcount`           | key, min, max                | `number`                | `await cache.zset.zcount('scores', 10, 100)`                              |
| `cache.zset.zincrBy`          | key, increment, member       | `number`                | `await cache.zset.zincrBy('scores', 5, 'u1')`                             |
| `cache.zset.zremRangeByRank`  | key, start, stop             | `number`                | `await cache.zset.zremRangeByRank('scores', 0, 9)`                        |
| `cache.zset.zremRangeByScore` | key, min, max                | `number`                | `await cache.zset.zremRangeByScore('scores', 0, 10)`                      |

#### cache.lock

Short leases: acquire takes key/TTL and yields owner/null; release/extend require owner and yield boolean; isLocked only observes. A lease does not replace resource-side CAS.

| Entry                 | Input parameters | Successful result | Call example                                     |
| --------------------- | ---------------- | ----------------- | ------------------------------------------------ |
| `cache.lock.acquire`  | key, options     | `string \| null`  | `await cache.lock.acquire('daily', { ttl: 30 })` |
| `cache.lock.release`  | key, owner       | `boolean`         | `await cache.lock.release('daily', owner)`       |
| `cache.lock.isLocked` | key              | `boolean`         | `await cache.lock.isLocked('daily')`             |
| `cache.lock.extend`   | key, ttl, owner  | `boolean`         | `await cache.lock.extend('daily', 60, owner)`    |

#### cache

Health check with no arguments; returns the backend response string or a connection failure.

| Entry        | Input parameters | Successful result | Call example         |
| ------------ | ---------------- | ----------------- | -------------------- |
| `cache.ping` | No arguments     | `string`          | `await cache.ping()` |

- In-memory caching for development and tests
- Redis caching in production (standalone, URL, Cluster, Sentinel)
- Set caches for IAM sessions and permissions
- Distributed locks for mutual exclusion across nodes

### Initialization options

```ts
// Memory（开发/测试）
await cache.init({ type: 'memory' })

// Redis 单机
await cache.init({
  type: 'redis',
  host: 'localhost',
  port: 6379,
  password: 'secret',
  db: 0,
})

// Redis URL（优先级最高）
await cache.init({
  type: 'redis',
  url: 'redis://:password@localhost:6379/0',
})

// Redis 集群
await cache.init({
  type: 'redis',
  cluster: [
    { host: 'node1', port: 6379 },
    { host: 'node2', port: 6379 },
  ],
})

// Redis 哨兵
await cache.init({
  type: 'redis',
  sentinel: {
    sentinels: [
      { host: 'sentinel1', port: 26379 }
    ],
    name: 'mymaster',
  },
})
```

`cache.init(config)` selects the built-in memory/redis backend. Provider implementations are internal; there is no custom backend registration API.

`password` authenticates standalone, Cluster, and Sentinel data nodes, including discovered/redirected Cluster connections. In `url` mode the credentials in the URL take precedence; the separate password field does not override them.

### API overview

- `cache.kv`: string/object key-value storage and TTL (`set/get/mget/mset/expire/ttl/...`).
- `cache.hash`: hash structures (`hset/hget/hgetall/...`).
- `cache.list`: lists (`lpush/rpush/lpop/rpop/...`).
- `cache.set_`: sets (`sadd/smembers/sismember/...`).
- `cache.zset`: sorted sets (`zadd/zrange/zrevrange/...`).
- `cache.lock`: distributed locks (`acquire/release/isLocked/extend`).

`kv.set` returns `HaiResult<boolean>`: `data=true` means the write applied. An NX/XX miss returns `success=true,data=false` without changing the value or TTL. Check both fields before issuing tickets, sessions or key registrations. `ex/px/exat/pxat` use seconds, milliseconds, Unix seconds and Unix milliseconds; choose one positive safe integer, excluding `keepTtl=true`. NX and XX are mutually exclusive. Zero, negative, fractional, non-finite or overflowing values return `INVALID_SET_OPTIONS` (`cache:016`) without creating a permanent key. A positive absolute deadline in the past expires immediately. Omitting expiry removes an existing TTL; `keepTtl` retains it and leaves new keys permanent. Both providers store JSON snapshots.

compareAndSwap atomically compares one JSON value and replaces/deletes it, returning boolean applied. Undefined expected means absent; undefined value deletes; null is a JSON value. px is a positive integer and excludes keepTtl. Omitting expiry persists the replacement; a comparison miss preserves TTL. Use it for shared versioned commits.

### Cluster multi-key operations and scanning

`mget/del/exists` support multiple slots through bounded independent key operations. MGET preserves input order; there is no cross-slot atomicity or snapshot. A failed DEL may already have deleted some keys; retry is idempotent. `mset`, set algebra and multi-key blocking pops require a shared slot; group keys with a common `{hash-tag}` or receive `CROSS_SLOT`. MSET never falls back to partial writes.

Start `scan` with string `'0'` and pass the returned opaque cursor unchanged. Another application node with the same configuration and topology can continue it. Cluster scans every master. A topology, match or keyPrefix change returns `SCAN_TOPOLOGY_CHANGED`; restart from `'0'`. Returned keys omit keyPrefix, whose glob characters are literal. `keys` follows the same rule and deduplicates. SCAN has no snapshot and may repeat keys; count is a positive integer hint, not an output limit. Invalid cursors/count return `INVALID_SCAN`.

### Distributed locks

Distributed mutual exclusion based on SET NX EX, suitable for deployments across multiple nodes.

```ts
// 获取锁（TTL 30 秒，owner 用于标识持有者）
const acquired = await cache.lock.acquire('my-lock', { ttl: 30 })
if (acquired.success && acquired.data) {
  try {
    // 执行受保护操作
  }
  finally {
    await cache.lock.release('my-lock', acquired.data)
  }
}

// 检查锁状态
const locked = await cache.lock.isLocked('my-lock')

// 续期锁
if (acquired.success && acquired.data)
  await cache.lock.extend('my-lock', 60, acquired.data)
```

- **Memory backend**: Map-based storage with TTL expiration.
- **Redis backend**: atomic locking with `SET NX EX`; Lua scripts verify the owner for safe release and renewal.
- `acquire` returns a unique acquisition token, or `null` while occupied. Release/renewal require this token; node IDs and ownerless operations are not supported.

The owner token only protects lease renewal and release; it is not a resource fencing token. A paused task can resume after expiry. Final writes require CAS, generation predicates or transactional constraints in the resource store; renewal or returning a failure afterwards cannot prevent a stale commit.

### Production shared state

Production requires Redis (including Cluster); memory is for development/explicit tests. Redis errors fail rather than falling back locally. Initialization checks apply when NODE_ENV or HAI_CORE_ENV is production; only explicit HAI_E2E=1/HAI_E2E_MOCK=1 tests are exempt. [State, concurrency and recovery (Chinese)](../../.agents/instructions/distributed-state.md).

## Configuration

Lifecycle: init takes backend/business configuration; use the module only after success. Await close before releasing borrowed dependencies. Follow the quick-start example and public signatures for exact return values.

The host loads and validates configuration before passing it to this module. Keep secrets in private server environment files. Select the backend, capacity, deadlines and logging for the actual use case; reinitialize and check the result after changes.

[Per-option purpose, use cases and examples](../../docs/usage/configuration/data.md).

## Error Handling

Check result.success for domain operations. Handle failures with the module error definitions and safe messages; retain codes, correlation IDs and sanitized causes in server logs. Synchronous tools, factories, stream iteration and lifecycle calls follow their own signatures. A completed Promise alone is not business success. See each feature for recovery limits.

All operations return `HaiResult<T>`. Common error codes:

| Error code                             | code            | Description            |
| -------------------------------------- | --------------- | ---------------------- |
| `HaiCacheError.CONNECTION_FAILED`      | `hai:cache:001` | Connection failed      |
| `HaiCacheError.OPERATION_FAILED`       | `hai:cache:002` | Operation failed       |
| `HaiCacheError.SERIALIZATION_FAILED`   | `hai:cache:003` | Serialization failed   |
| `HaiCacheError.DESERIALIZATION_FAILED` | `hai:cache:004` | Deserialization failed |
| `HaiCacheError.KEY_NOT_FOUND`          | `hai:cache:005` | Key not found          |
| `HaiCacheError.TIMEOUT`                | `hai:cache:006` | Timeout                |
| `HaiCacheError.NOT_INITIALIZED`        | `hai:cache:010` | Not initialized        |
| `HaiCacheError.UNSUPPORTED_TYPE`       | `hai:cache:011` | Unsupported cache type |
| `HaiCacheError.CONFIG_ERROR`           | `hai:cache:012` | Invalid configuration  |

## Development

```bash
pnpm --filter @h-ai/cache test
```

> Redis tests require Docker.

Public contracts and internal structures include typechecked examples; see the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## License

Apache-2.0
