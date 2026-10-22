# @h-ai/cache

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

## Introduction

A unified cache module. The `cache` object provides KV / Hash / List / Set / ZSet / distributed lock operations with Memory and Redis backends.

Memory KV entries expire at their expiration time. `incr/decr/incrBy/decrBy` accept only safe integers or integer strings; invalid increments and overflow return `OPERATION_FAILED` without changing the original value. Hash names such as `__proto__` / `constructor` remain ordinary fields and do not change the returned object's prototype.

## Core features

- In-memory caching for development and tests
- Redis caching in production (standalone, URL, Cluster, Sentinel)
- Set caches for IAM sessions and permissions
- Distributed locks for mutual exclusion across nodes

## Getting started

### Quick start

```ts
import { cache, HaiCacheError } from '@h-ai/cache'

const initResult = await cache.init({ type: 'memory' })
if (!initResult.success) {
  throw new Error(initResult.error.message)
}

await cache.kv.set('user:1', { name: '张三' }, { ex: 3600 })
const user = await cache.kv.get<{ name: string }>('user:1')

await cache.hash.hset('profile:1', { age: 18, city: 'Hangzhou' })
await cache.list.lpush('queue:jobs', 'job-1', 'job-2')
await cache.set_.sadd('role:admin:perms', 'user.read', 'user.write')
await cache.zset.zadd('rank', { member: 'u1', score: 100 })

// 分布式锁
const acquired = await cache.lock.acquire('my-lock', { ttl: 30 })
if (acquired.success && acquired.data) {
  try {
    // 执行受保护的操作
  }
  finally {
    await cache.lock.release('my-lock', acquired.data)
  }
}

if (!user.success && user.error.code === HaiCacheError.NOT_INITIALIZED.code) {
  // 请先调用 cache.init()
}

await cache.close()
```

`cache.config` returns a **redacted configuration snapshot**. Redis credential fields such as `password` / `url` are sanitized automatically; do not use the snapshot to write back original secrets.

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
    sentinels: [{ host: 'sentinel1', port: 26379 }],
    name: 'mymaster',
  },
})
```

### API overview

- `cache.kv`: string/object key-value storage and TTL (`set/get/mget/mset/expire/ttl/...`).
- `cache.hash`: hash structures (`hset/hget/hgetall/...`).
- `cache.list`: lists (`lpush/rpush/lpop/rpop/...`).
- `cache.set_`: sets (`sadd/smembers/sismember/...`).
- `cache.zset`: sorted sets (`zadd/zrange/zrevrange/...`).
- `cache.lock`: distributed locks (`acquire/release/isLocked/extend`).
- `CacheProvider`: a public provider contract for advanced integrations and custom backends.

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

### Error codes

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

## Development and testing

```bash
pnpm --filter @h-ai/cache test
```

> Redis tests require Docker.

## License

Apache-2.0

`password` authenticates standalone, Cluster, and Sentinel data nodes, including discovered/redirected Cluster connections. In `url` mode the credentials in the URL take precedence; the separate password field does not override them.

compareAndSwap atomically compares one JSON value and replaces/deletes it, returning boolean applied. Undefined expected means absent; undefined value deletes; null is a JSON value. px is a positive integer and excludes keepTtl. Omitting expiry persists the replacement; a comparison miss preserves TTL. Use it for shared versioned commits.
