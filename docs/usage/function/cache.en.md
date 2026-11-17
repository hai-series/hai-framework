# @h-ai/cache API reference

<!-- translation: partial -->

[Chinese source](cache.md) · [Configuration](../configuration/cache.en.md) · [Data structures](../data/cache.en.md)

## Quick start

Initialize Cache before work and close it after dependent modules stop. Inspect the result before using values. Limit distributed locks to work that can safely end before the lease expires.

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

<a id="api-list"></a>

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Import the module as in the quick start. Except for lifecycle examples, run scenarios after initialization and before closure. The value helper checks HaiResult.success and preserves the original error. Use isolated test data and explicit cleanup.

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="connection"></a>

### Connect and close: `cache`

Choose a backend at startup, use it after its health check, and close dependent modules before Cache.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `cache.init` | 按配置创建进程内缓存或连接 Redis | `config`（必填） | `Promise<HaiResult<void>>` | `await cache.init({ type: 'memory' })` |
| `cache.close` | 释放缓存实例。用内存模式时，关闭后该实例中的值不再可用 | 无 | `Promise<HaiResult<void>>` | `await cache.close()` |
| `cache.ping` | Check the backend connection | 无参数 | `string` | `await cache.ping()` |
| `cache.config` | Read the current redacted config | Read-only property; no arguments | `CacheConfig \| null` | `cache.config` |
| `cache.isInitialized` | Check whether cache operations are available | Read-only property; no arguments | `boolean` | `cache.isInitialized` |

#### Scenario: Connect and close

```ts
value(await cache.init({ type: 'memory' }))
value(await cache.ping()) // 'PONG'
cache.isInitialized // true
cache.config?.type // 'memory'
value(await cache.close()) // undefined; the memory instance is released
```

With a development memory backend, ping returns `PONG`. Closing has no business data and releases its records. Reinitialize before the other scenarios.

[Detailed parameters and workflows](cache.md#connection)

<a id="values"></a>

### Store values, counters and expiry: `cache.kv`

Use business keys for serializable values. Compare and swap prevents replacing a value that has changed since it was read.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `cache.kv.get` | Read a cached value | key | `T \| null` | `await cache.kv.get('u:1')` |
| `cache.kv.set` | Store a value with expiry or a write condition | key, value, options | `boolean` | `await cache.kv.set('u:1', { name: 'Alice' }, { ex: 60 })` |
| `cache.kv.mget` | Read multiple values in input order | keys | `(T \| null)[]` | `await cache.kv.mget('u:1', 'u:2')` |
| `cache.kv.mset` | Store multiple values | entries | `void` | `await cache.kv.mset([['u:1', { name: 'Alice' }]])` |
| `cache.kv.compareAndSwap` | Replace only when the current value matches | key, expected, value, options | `boolean` | `await cache.kv.compareAndSwap('version', 1, 2)` |
| `cache.kv.del` | Delete the specified keys | keys | `number` | `await cache.kv.del('u:1', 'u:2')` |
| `cache.kv.exists` | Count existing keys | keys | `number` | `await cache.kv.exists('u:1', 'u:2')` |
| `cache.kv.type` | Read the stored structure type | key | `string` | `await cache.kv.type('u:1')` |
| `cache.kv.expire` | Set expiry in seconds from now | key, seconds | `boolean` | `await cache.kv.expire('u:1', 60)` |
| `cache.kv.expireAt` | Set an absolute expiry time | key, timestamp | `boolean` | `await cache.kv.expireAt('u:1', Math.floor(Date.now() / 1000) + 60)` |
| `cache.kv.ttl` | Read remaining lifetime in seconds | key | `number` | `await cache.kv.ttl('u:1')` |
| `cache.kv.persist` | Remove expiry | key | `boolean` | `await cache.kv.persist('u:1')` |
| `cache.kv.incr` | Increment by one | key | `number` | `await cache.kv.incr('hits')` |
| `cache.kv.incrBy` | Increment by a given amount | key, increment | `number` | `await cache.kv.incrBy('hits', 2)` |
| `cache.kv.decr` | Decrement by one | key | `number` | `await cache.kv.decr('stock')` |
| `cache.kv.decrBy` | Decrement by a given amount | key, decrement | `number` | `await cache.kv.decrBy('stock', 2)` |
| `cache.kv.keys` | List keys matching a pattern | pattern | `string[]` | `await cache.kv.keys('u:*')` |
| `cache.kv.scan` | Scan matching keys in batches | cursor, options | `[string, string[]]` | `await cache.kv.scan('0', { match: 'u:*', count: 100 })` |

#### Scenario: Store values, counters and expiry

```ts
value(await cache.kv.set('demo:user:1', { name: 'Ada' }, { ex: 60 })) // true
value(await cache.kv.get('demo:user:1')) // { name: 'Ada' }
value(await cache.kv.mset([['demo:user:2', { name: 'Lin' }]])) // undefined
value(await cache.kv.mget('demo:user:1', 'demo:user:2')) // [{ name: 'Ada' }, { name: 'Lin' }]
value(await cache.kv.compareAndSwap('demo:revision', undefined, 1, { px: 60_000 })) // true
value(await cache.kv.compareAndSwap('demo:revision', 0, 2)) // false; revision stays 1
value(await cache.kv.exists('demo:user:1', 'demo:missing')) // 1
value(await cache.kv.type('demo:user:1')) // 'string' (JSON value)
value(await cache.kv.expire('demo:user:1', 120)) // true
value(await cache.kv.expireAt('demo:user:2', Math.floor(Date.now() / 1000) + 120)) // true
value(await cache.kv.ttl('demo:user:1')) // about 120 seconds
value(await cache.kv.persist('demo:user:1')) // true
value(await cache.kv.ttl('demo:user:1')) // -1
value(await cache.kv.incr('demo:hits')) // 1
value(await cache.kv.incrBy('demo:hits', 4)) // 5
value(await cache.kv.decr('demo:hits')) // 4
value(await cache.kv.decrBy('demo:hits', 2)) // 2
value(await cache.kv.keys('demo:user:*')) // the two user keys, order is backend-dependent
let cursor = '0'
do {
  const page = value(await cache.kv.scan(cursor, { match: 'demo:user:*', count: 100 }))
  cursor = page[0] // use the returned cursor, not a page number
  const keys = page[1] // a batch of matching keys; duplicates are possible
} while (cursor !== '0')
value(await cache.kv.del('demo:user:1', 'demo:user:2')) // 2
value(await cache.kv.get('demo:user:1')) // null
```

Run in order with fresh `demo:*` keys and no concurrent writes. A CAS mismatch returns successful data `false`. TTL is remaining seconds: `-1` means persistent and `-2` missing. Scan count is a hint; pages can repeat keys.

[Detailed parameters and workflows](cache.md#values)

<a id="hashes"></a>

### Update individual fields: `cache.hash`

Use a hash to update one field without replacing the entire object.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `cache.hash.hget` | Read a field | key, field | `T \| null` | `await cache.hash.hget('u:1', 'name')` |
| `cache.hash.hset` | Store a field | key, field, value | `number` | `await cache.hash.hset('u:1', 'name', 'Alice')` |
| `cache.hash.hdel` | Delete fields | key, fields | `number` | `await cache.hash.hdel('u:1', 'name')` |
| `cache.hash.hexists` | Check field existence | key, field | `boolean` | `await cache.hash.hexists('u:1', 'name')` |
| `cache.hash.hgetall` | Read all fields and values | key | `T` | `await cache.hash.hgetall('u:1')` |
| `cache.hash.hkeys` | List field names | key | `string[]` | `await cache.hash.hkeys('u:1')` |
| `cache.hash.hvals` | List field values | key | `T[]` | `await cache.hash.hvals('u:1')` |
| `cache.hash.hlen` | Count fields | key | `number` | `await cache.hash.hlen('u:1')` |
| `cache.hash.hmget` | Read multiple fields in input order | key, fields | `(T \| null)[]` | `await cache.hash.hmget('u:1', 'name', 'age')` |
| `cache.hash.hincrBy` | Increment a numeric field | key, field, increment | `number` | `await cache.hash.hincrBy('u:1', 'visits', 1)` |

#### Scenario: Update individual fields

```ts
value(await cache.hash.hset('demo:profile', 'name', 'Ada')) // 1 new field
value(await cache.hash.hget('demo:profile', 'name')) // 'Ada'
value(await cache.hash.hexists('demo:profile', 'name')) // true
value(await cache.hash.hincrBy('demo:profile', 'visits', 1)) // 1
value(await cache.hash.hmget('demo:profile', 'name', 'missing')) // ['Ada', null]
value(await cache.hash.hgetall('demo:profile')) // { name: 'Ada', visits: 1 }
value(await cache.hash.hkeys('demo:profile')) // 'name' and 'visits'; order may vary
value(await cache.hash.hvals('demo:profile')) // 'Ada' and 1; order may vary
value(await cache.hash.hlen('demo:profile')) // 2
value(await cache.hash.hdel('demo:profile', 'name')) // 1
```

The inputs are one profile key and two fields. Comments show added-field counts, membership and values; a missing field reads as null.

[Detailed parameters and workflows](cache.md#hashes)

<a id="lists"></a>

### Queue and read in order: `cache.list`

Lists preserve order and support pushes and pops at both ends. Blocking pops wait for a value or timeout.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `cache.list.lpush` | Push onto the left end | key, values | `number` | `await cache.list.lpush('jobs', 'job-1')` |
| `cache.list.rpush` | Push onto the right end | key, values | `number` | `await cache.list.rpush('jobs', 'job-2')` |
| `cache.list.lpop` | Pop the leftmost value | key | `T \| null` | `await cache.list.lpop('jobs')` |
| `cache.list.rpop` | Pop the rightmost value | key | `T \| null` | `await cache.list.rpop('jobs')` |
| `cache.list.llen` | Read list length | key | `number` | `await cache.list.llen('jobs')` |
| `cache.list.lrange` | Read an inclusive index range | key, start, stop | `T[]` | `await cache.list.lrange('jobs', 0, 9)` |
| `cache.list.lindex` | Read a value at an index | key, index | `T \| null` | `await cache.list.lindex('jobs', 0)` |
| `cache.list.lset` | Replace a value at an index | key, index, value | `void` | `await cache.list.lset('jobs', 0, 'replacement')` |
| `cache.list.ltrim` | Keep only an index range | key, start, stop | `void` | `await cache.list.ltrim('jobs', 0, 99)` |
| `cache.list.blpop` | Wait for and pop a leftmost value | timeout, keys | `[string, T] \| null` | `await cache.list.blpop(5, 'jobs')` |
| `cache.list.brpop` | Wait for and pop a rightmost value | timeout, keys | `[string, T] \| null` | `await cache.list.brpop(5, 'jobs')` |

#### Scenario: Queue and read in order

```ts
value(await cache.list.rpush('demo:jobs', 'b', 'c')) // 2
value(await cache.list.lpush('demo:jobs', 'a')) // 3
value(await cache.list.llen('demo:jobs')) // 3
value(await cache.list.lrange('demo:jobs', 0, -1)) // ['a', 'b', 'c']
value(await cache.list.lindex('demo:jobs', 1)) // 'b'
value(await cache.list.lset('demo:jobs', 1, 'B')) // undefined
value(await cache.list.ltrim('demo:jobs', 0, 1)) // undefined; ['a', 'B'] remains
value(await cache.list.lpop('demo:jobs')) // 'a'
value(await cache.list.rpop('demo:jobs')) // 'B'
value(await cache.list.rpush('demo:jobs', 'd', 'e')) // 2
value(await cache.list.blpop(1, 'demo:jobs')) // ['demo:jobs', 'd']
value(await cache.list.brpop(1, 'demo:jobs')) // ['demo:jobs', 'e']
value(await cache.list.lpop('demo:jobs')) // null
```

Start with an empty list. Range endpoints are inclusive; `-1` means the last item. Blocking calls return immediately here because values exist. An empty list returns null after the requested seconds.

[Detailed parameters and workflows](cache.md#lists)

<a id="sets"></a>

### Deduplicate and compare sets: `cache.set_`

Use sets for membership, unions and comparisons. Members have no defined order.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `cache.set_.sadd` | Add unique members | key, members | `number` | `await cache.set_.sadd('roles', 'editor')` |
| `cache.set_.srem` | Remove members | key, members | `number` | `await cache.set_.srem('roles', 'editor')` |
| `cache.set_.smembers` | Read all members | key | `T[]` | `await cache.set_.smembers('roles')` |
| `cache.set_.sismember` | Test membership | key, member | `boolean` | `await cache.set_.sismember('roles', 'editor')` |
| `cache.set_.scard` | Count members | key | `number` | `await cache.set_.scard('roles')` |
| `cache.set_.srandmember` | Sample without removing | key, count | `T \| T[] \| null` | `await cache.set_.srandmember('roles', 2)` |
| `cache.set_.spop` | Remove random members | key, count | `T \| T[] \| null` | `await cache.set_.spop('roles', 1)` |
| `cache.set_.sinter` | Find the intersection | keys | `T[]` | `await cache.set_.sinter('roles:a', 'roles:b')` |
| `cache.set_.sunion` | Find the union | keys | `T[]` | `await cache.set_.sunion('roles:a', 'roles:b')` |
| `cache.set_.sdiff` | Subtract other sets from the first | keys | `T[]` | `await cache.set_.sdiff('roles:a', 'roles:b')` |

#### Scenario: Deduplicate and compare sets

```ts
value(await cache.set_.sadd('demo:roles:a', 'reader', 'editor')) // 2
value(await cache.set_.sadd('demo:roles:b', 'editor', 'owner')) // 2
value(await cache.set_.sismember('demo:roles:a', 'reader')) // true
value(await cache.set_.scard('demo:roles:a')) // 2
value(await cache.set_.smembers('demo:roles:a')) // reader, editor
value(await cache.set_.sinter('demo:roles:a', 'demo:roles:b')) // ['editor']
value(await cache.set_.sunion('demo:roles:a', 'demo:roles:b')) // reader, editor, owner
value(await cache.set_.sdiff('demo:roles:a', 'demo:roles:b')) // ['reader']
value(await cache.set_.srandmember('demo:roles:a', 1)) // one-member array; set unchanged
value(await cache.set_.spop('demo:roles:b', 1)) // one-member array; chosen member removed
value(await cache.set_.srem('demo:roles:a', 'reader')) // 1
```

The input is two role sets; result order is unspecified. Random reads preserve members, while random pops remove the selected member.

[Detailed parameters and workflows](cache.md#sets)

<a id="scores"></a>

### Rank and filter scores: `cache.zset`

A sorted set associates each member with a score for rankings and range queries.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `cache.zset.zadd` | Store scored members | key, members | `number` | `await cache.zset.zadd('scores', { member: 'u1', score: 10 })` |
| `cache.zset.zrem` | Remove scored members | key, members | `number` | `await cache.zset.zrem('scores', 'u1')` |
| `cache.zset.zscore` | Read a member score | key, member | `number \| null` | `await cache.zset.zscore('scores', 'u1')` |
| `cache.zset.zrank` | Read a zero-based ascending rank | key, member | `number \| null` | `await cache.zset.zrank('scores', 'u1')` |
| `cache.zset.zrevrank` | Read a zero-based descending rank | key, member | `number \| null` | `await cache.zset.zrevrank('scores', 'u1')` |
| `cache.zset.zrange` | Read an ascending rank range | key, start, stop, withScores | `string[] \| ZMember[]` | `await cache.zset.zrange('scores', 0, 9, true)` |
| `cache.zset.zrevrange` | Read a descending rank range | key, start, stop, withScores | `string[] \| ZMember[]` | `await cache.zset.zrevrange('scores', 0, 9, true)` |
| `cache.zset.zrangeByScore` | Read a score range | key, min, max, options | `string[] \| ZMember[]` | `await cache.zset.zrangeByScore('scores', 10, 100, { withScores: true })` |
| `cache.zset.zcard` | Count scored members | key | `number` | `await cache.zset.zcard('scores')` |
| `cache.zset.zcount` | Count members in a score range | key, min, max | `number` | `await cache.zset.zcount('scores', 10, 100)` |
| `cache.zset.zincrBy` | Increment a member score | key, increment, member | `number` | `await cache.zset.zincrBy('scores', 5, 'u1')` |
| `cache.zset.zremRangeByRank` | Remove a rank range | key, start, stop | `number` | `await cache.zset.zremRangeByRank('scores', 0, 9)` |
| `cache.zset.zremRangeByScore` | Remove a score range | key, min, max | `number` | `await cache.zset.zremRangeByScore('scores', 0, 10)` |

#### Scenario: Rank and filter scores

```ts
value(await cache.zset.zadd('demo:scores', { member: 'a', score: 10 }, { member: 'b', score: 20 })) // 2
value(await cache.zset.zscore('demo:scores', 'a')) // 10
value(await cache.zset.zrank('demo:scores', 'a')) // 0
value(await cache.zset.zrevrank('demo:scores', 'a')) // 1
value(await cache.zset.zrange('demo:scores', 0, -1)) // ['a', 'b']
value(await cache.zset.zrevrange('demo:scores', 0, -1)) // ['b', 'a']
value(await cache.zset.zrangeByScore('demo:scores', 10, 20)) // ['a', 'b']
value(await cache.zset.zcard('demo:scores')) // 2
value(await cache.zset.zcount('demo:scores', 10, 15)) // 1
value(await cache.zset.zincrBy('demo:scores', 5, 'a')) // 15
value(await cache.zset.zremRangeByScore('demo:scores', 0, 14)) // 0
value(await cache.zset.zremRangeByRank('demo:scores', 0, 0)) // 1; removes a
value(await cache.zset.zrem('demo:scores', 'b')) // 1
```

Start with a=10 and b=20. Ranks start at zero. After a gains 5, removing scores 0–14 removes nothing. Removal calls return actual counts.

[Detailed parameters and workflows](cache.md#scores)

<a id="locks"></a>

### Coordinate short work: `cache.lock`

With shared Redis, a timed lease coordinates one holder for short work. The business commit still needs its own concurrency checks.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `cache.lock.acquire` | Try to acquire a lease | key, options | `string \| null` | `await cache.lock.acquire('daily', { ttl: 30 })` |
| `cache.lock.release` | Release a lease using its owner token | key, owner | `boolean` | `await cache.lock.release('daily', owner)` |
| `cache.lock.isLocked` | Check whether a lease exists | key | `boolean` | `await cache.lock.isLocked('daily')` |
| `cache.lock.extend` | Extend a lease using its owner token | key, ttl, owner | `boolean` | `await cache.lock.extend('daily', 60, owner)` |

#### Scenario: Coordinate short work

```ts
const owner = value(await cache.lock.acquire('demo:daily', { ttl: 30 }))
if (owner !== null) {
  try {
    value(await cache.lock.isLocked('demo:daily')) // true while the lease is valid
    const extended = value(await cache.lock.extend('demo:daily', 60, owner))
    if (!extended)
      throw new Error('Lease lost')
  }
  finally {
    value(await cache.lock.release('demo:daily', owner)) // true only if this owner still holds it
  }
}
```

Inputs are the task key and seconds. Acquisition returns a random owner token, or null if unavailable. Renewal and release require that token; false means ownership was lost.

[Detailed parameters and workflows](cache.md#locks)
