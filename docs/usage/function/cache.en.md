# @h-ai/cache API reference

<!-- translation: partial -->

[Chinese source](cache.md) · [Configuration](../configuration/cache.en.md) · [Data structures](../data/cache.en.md)

<a id="quick-start"></a>

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

<a id="api-reference"></a>

## API list

| API | Input and result | Example |
| --- | --- | --- |
| `cache.init(config)`, `close()` | Select a provider and release its resources. | `await cache.init({ type: 'memory' })` |
| `cache.kv.get`, `set`, `mget`, `mset`, `compareAndSwap` | Read/write JSON values or atomically replace the expected value. | `await cache.kv.get('session:1')` |
| `cache.kv.del`, `exists`, `type`, `expire`, `expireAt`, `ttl`, `persist` | Inspect or remove a key and manage expiry. | `await cache.kv.ttl('session:1')` |
| `cache.kv.incr`, `incrBy`, `decr`, `decrBy`, `keys`, `scan` | Change counters or enumerate keys. Use a cursor scan on large stores. | `await cache.kv.incr('count')` |
| `cache.hash.hget`, `hset`, `hdel`, `hexists`, `hgetall`, `hkeys`, `hvals`, `hlen`, `hmget`, `hincrBy` | Read, write, remove, or count fields in a hash. | `await cache.hash.hget('user:1', 'name')` |
| `cache.list.lpush`, `rpush`, `lpop`, `rpop`, `llen`, `lrange`, `lindex`, `lset`, `ltrim`, `blpop`, `brpop` | Operate on list ends, indexes and ranges. Blocking pops wait up to their time limit. | `await cache.list.lrange('jobs', 0, 9)` |
| `cache.set_.sadd`, `srem`, `smembers`, `sismember`, `scard`, `srandmember`, `spop`, `sinter`, `sunion`, `sdiff` | Manage unique members and compute set operations. | `await cache.set_.smembers('roles')` |
| `cache.zset.zadd`, `zrem`, `zscore`, `zrank`, `zrevrank`, `zrange`, `zrevrange`, `zrangeByScore`, `zcard`, `zcount`, `zincrBy`, `zremRangeByRank`, `zremRangeByScore` | Store scores and query or remove by rank or score. | `await cache.zset.zrange('scores', 0, 9)` |
| `cache.lock.acquire`, `release`, `isLocked` | Acquire a timed lease, release by owner token, or check its status. | `await cache.lock.isLocked('daily')` |

Still untranslated: the remaining collection operations, Cluster scans and lease examples. Read the [Chinese source section](cache.md#api-reference).
