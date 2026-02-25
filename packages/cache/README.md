# @h-ai/cache

统一的缓存访问模块，支持 Redis 与内存缓存（开发/测试场景）。

## 支持的后端

| 类型   | 库      | 模式           |
| ------ | ------- | -------------- |
| Memory | 内置    | 单进程         |
| Redis  | ioredis | 单机/集群/哨兵 |

## 快速开始

```ts
import { cache, CacheErrorCode } from '@h-ai/cache'

// 初始化
await cache.init({ type: 'redis', host: 'localhost', port: 6379 })

// KV 操作
await cache.kv.set('user:1', { name: '张三' }, { ex: 3600 })
const result = await cache.kv.get<{ name: string }>('user:1')

// Hash 操作
await cache.hash.hset('user:1', { name: '张三', age: 25 })
const user = await cache.hash.hgetall('user:1')

// List 操作
await cache.list.lpush('queue', 'task1', 'task2')
const task = await cache.list.rpop<string>('queue')

// Set 操作
await cache.set_.sadd('tags', 'redis', 'cache')
const members = await cache.set_.smembers<string>('tags')

// SortedSet 操作
await cache.zset.zadd('rank', { score: 100, member: 'player1' })
const top10 = await cache.zset.zrevrange('rank', 0, 9, true)

// 关闭
await cache.close()
```

## 配置

```ts
// Memory（开发/测试）
await cache.init({ type: 'memory' })

// Redis 单机
await cache.init({ type: 'redis', host: 'localhost', port: 6379, password: 'secret', db: 0 })

// Redis URL
await cache.init({ type: 'redis', url: 'redis://:password@localhost:6379/0' })

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
  sentinel: { sentinels: [{ host: 'sentinel1', port: 26379 }], name: 'mymaster' },
})
```

## 错误处理

所有操作返回 `Result<T, CacheError>`：

```ts
const result = await cache.kv.get('key')
if (result.success) {
  // result.data
}
else {
  switch (result.error.code) {
    case CacheErrorCode.NOT_INITIALIZED:
      break
    case CacheErrorCode.CONNECTION_FAILED:
      break
    case CacheErrorCode.OPERATION_FAILED:
      break
  }
}
```

## 测试

```bash
pnpm --filter @h-ai/cache test
```

## License

Apache-2.0
