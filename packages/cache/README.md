# @h-ai/cache

统一缓存模块，通过 `cache` 对象提供 KV / Hash / List / Set / ZSet 操作，支持内存与 Redis 两种后端。

## 适用场景

- 开发/测试场景下的内存缓存
- 生产环境 Redis 缓存（单机、URL、集群、哨兵）
- IAM 会话与权限相关的集合缓存

## 快速开始

```ts
import { cache, CacheErrorCode } from '@h-ai/cache'

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

if (!user.success && user.error.code === CacheErrorCode.NOT_INITIALIZED) {
  // 请先调用 cache.init()
}

await cache.close()
```

## 初始化配置

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

## API 概览

- `cache.kv`: 字符串/对象键值与 TTL（`set/get/mget/mset/expire/ttl/...`）
- `cache.hash`: 哈希结构（`hset/hget/hgetall/...`）
- `cache.list`: 列表结构（`lpush/rpush/lpop/rpop/...`）
- `cache.set_`: 集合结构（`sadd/smembers/sismember/...`）
- `cache.zset`: 有序集合（`zadd/zrange/zrevrange/...`）

## 错误码

所有操作返回 `Result<T, CacheError>`，常用错误码如下：

- `CacheErrorCode.NOT_INITIALIZED`
- `CacheErrorCode.CONNECTION_FAILED`
- `CacheErrorCode.OPERATION_FAILED`
- `CacheErrorCode.SERIALIZATION_FAILED`
- `CacheErrorCode.DESERIALIZATION_FAILED`
- `CacheErrorCode.KEY_NOT_FOUND`
- `CacheErrorCode.TIMEOUT`
- `CacheErrorCode.UNSUPPORTED_TYPE`
- `CacheErrorCode.CONFIG_ERROR`

## 测试

```bash
pnpm --filter @h-ai/cache test
```

> Redis 相关测试需要 Docker 环境。

## License

Apache-2.0
