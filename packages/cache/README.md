# @hai/cache

统一的缓存访问模块，目前支持 Redis。

## 特性

- 🚀 统一 API - 通过 `cache` 对象访问所有缓存操作
- 📦 多数据结构 - 支持 String、Hash、List、Set、SortedSet
- 🔄 自动序列化 - 自动处理 JSON 对象的序列化和反序列化
- 🔒 类型安全 - 完整的 TypeScript 类型支持
- ⚡ 高性能 - 基于 ioredis 实现

## 支持的缓存

| 类型  | 库      | 模式           |
| ----- | ------- | -------------- |
| Redis | ioredis | 单机/集群/哨兵 |

## 安装

```bash
pnpm add @hai/cache
```

## 快速开始

### 1. 初始化缓存

```ts
import { cache, initCache, closeCache } from '@hai/cache'

// Redis 单机模式
await initCache({
    type: 'redis',
    host: 'localhost',
    port: 6379,
    password: 'secret',  // 可选
    db: 0                // 可选，默认 0
})

// 或使用 URL
await initCache({
    type: 'redis',
    url: 'redis://:password@localhost:6379/0'
})
```

### 2. 基础操作

```ts
// 设置值（带过期时间）
await cache.set('user:1', { name: '张三', age: 25 }, { ex: 3600 })

// 获取值
const result = await cache.get<{ name: string; age: number }>('user:1')
if (result.success && result.data) {
    // 使用 result.data
}

// 删除键
await cache.del('user:1')

// 检查键是否存在
const exists = await cache.exists('user:1')

// 设置过期时间
await cache.expire('key', 60) // 60 秒后过期
```

### 3. Hash 操作

```ts
// 设置字段
await cache.hash.hset('user:1', 'name', '张三')
await cache.hash.hset('user:1', { name: '张三', age: 25, city: '北京' })

// 获取字段
const name = await cache.hash.hget<string>('user:1', 'name')

// 获取所有字段
const user = await cache.hash.hgetall('user:1')

// 删除字段
await cache.hash.hdel('user:1', 'city')

// 字段自增
await cache.hash.hincrBy('user:1', 'age', 1)
```

### 4. List 操作

```ts
// 从左侧推入
await cache.list.lpush('queue', 'task1', 'task2')

// 从右侧弹出（FIFO 队列）
const task = await cache.list.rpop<string>('queue')

// 获取列表范围
const items = await cache.list.lrange<string>('queue', 0, -1)

// 阻塞式弹出（用于消息队列）
const result = await cache.list.brpop<string>(5, 'queue') // 等待 5 秒
```

### 5. Set 操作

```ts
// 添加成员
await cache.set_.sadd('tags', 'redis', 'cache', 'database')

// 检查成员
const isMember = await cache.set_.sismember('tags', 'redis')

// 获取所有成员
const members = await cache.set_.smembers<string>('tags')

// 集合运算
await cache.set_.sinter<string>('tags1', 'tags2')  // 交集
await cache.set_.sunion<string>('tags1', 'tags2')  // 并集
await cache.set_.sdiff<string>('tags1', 'tags2')   // 差集
```

### 6. SortedSet 操作

```ts
// 添加成员（排行榜）
await cache.zset.zadd('leaderboard', 
    { score: 1000, member: 'player1' },
    { score: 800, member: 'player2' },
    { score: 1200, member: 'player3' }
)

// 获取排行榜（从高到低）
const top10 = await cache.zset.zrevrange('leaderboard', 0, 9, true)

// 获取排名
const rank = await cache.zset.zrevrank('leaderboard', 'player1')

// 增加分数
await cache.zset.zincrBy('leaderboard', 100, 'player1')

// 获取成员分数
const score = await cache.zset.zscore('leaderboard', 'player1')
```

### 7. 关闭连接

```ts
await closeCache()
```

## API 参考

### 基础操作 (cache.*)

| 方法                        | 说明               |
| --------------------------- | ------------------ |
| `get<T>(key)`               | 获取值             |
| `set(key, value, options?)` | 设置值             |
| `del(...keys)`              | 删除键             |
| `exists(...keys)`           | 检查键是否存在     |
| `expire(key, seconds)`      | 设置过期时间（秒） |
| `expireAt(key, timestamp)`  | 设置过期时间点     |
| `ttl(key)`                  | 获取剩余过期时间   |
| `persist(key)`              | 移除过期时间       |
| `incr(key)`                 | 自增               |
| `incrBy(key, increment)`    | 自增指定值         |
| `decr(key)`                 | 自减               |
| `decrBy(key, decrement)`    | 自减指定值         |
| `mget<T>(...keys)`          | 批量获取           |
| `mset(entries)`             | 批量设置           |
| `keys(pattern)`             | 获取匹配的键       |
| `scan(cursor, options?)`    | 扫描键             |
| `type(key)`                 | 获取值类型         |

### Hash 操作 (cache.hash.*)

| 方法                             | 说明             |
| -------------------------------- | ---------------- |
| `hget<T>(key, field)`            | 获取字段值       |
| `hset(key, field, value)`        | 设置字段值       |
| `hset(key, data)`                | 批量设置字段     |
| `hdel(key, ...fields)`           | 删除字段         |
| `hexists(key, field)`            | 检查字段是否存在 |
| `hgetall<T>(key)`                | 获取所有字段和值 |
| `hkeys(key)`                     | 获取所有字段名   |
| `hvals<T>(key)`                  | 获取所有字段值   |
| `hlen(key)`                      | 获取字段数量     |
| `hmget<T>(key, ...fields)`       | 批量获取字段值   |
| `hincrBy(key, field, increment)` | 字段自增         |

### List 操作 (cache.list.*)

| 方法                          | 说明             |
| ----------------------------- | ---------------- |
| `lpush(key, ...values)`       | 从左侧推入       |
| `rpush(key, ...values)`       | 从右侧推入       |
| `lpop<T>(key)`                | 从左侧弹出       |
| `rpop<T>(key)`                | 从右侧弹出       |
| `llen(key)`                   | 获取列表长度     |
| `lrange<T>(key, start, stop)` | 获取指定范围     |
| `lindex<T>(key, index)`       | 获取指定索引元素 |
| `lset(key, index, value)`     | 设置指定索引元素 |
| `ltrim(key, start, stop)`     | 保留指定范围     |
| `blpop<T>(timeout, ...keys)`  | 阻塞式左侧弹出   |
| `brpop<T>(timeout, ...keys)`  | 阻塞式右侧弹出   |

### Set 操作 (cache.set_.*)

| 方法                          | 说明           |
| ----------------------------- | -------------- |
| `sadd(key, ...members)`       | 添加成员       |
| `srem(key, ...members)`       | 移除成员       |
| `smembers<T>(key)`            | 获取所有成员   |
| `sismember(key, member)`      | 检查是否为成员 |
| `scard(key)`                  | 获取成员数量   |
| `srandmember<T>(key, count?)` | 随机获取成员   |
| `spop<T>(key, count?)`        | 随机弹出成员   |
| `sinter<T>(...keys)`          | 集合交集       |
| `sunion<T>(...keys)`          | 集合并集       |
| `sdiff<T>(...keys)`           | 集合差集       |

### SortedSet 操作 (cache.zset.*)

| 方法                                       | 说明                     |
| ------------------------------------------ | ------------------------ |
| `zadd(key, ...members)`                    | 添加成员                 |
| `zrem(key, ...members)`                    | 移除成员                 |
| `zscore(key, member)`                      | 获取分数                 |
| `zrank(key, member)`                       | 获取排名（升序）         |
| `zrevrank(key, member)`                    | 获取排名（降序）         |
| `zrange(key, start, stop, withScores?)`    | 获取范围（升序）         |
| `zrevrange(key, start, stop, withScores?)` | 获取范围（降序）         |
| `zrangeByScore(key, min, max, options?)`   | 按分数获取范围           |
| `zcard(key)`                               | 获取成员数量             |
| `zcount(key, min, max)`                    | 获取分数范围内的成员数量 |
| `zincrBy(key, increment, member)`          | 增加分数                 |
| `zremRangeByRank(key, start, stop)`        | 按排名移除               |
| `zremRangeByScore(key, min, max)`          | 按分数移除               |

## 配置选项

```ts
interface CacheConfig {
    type: 'redis'
    
    // 连接配置（多种方式）
    url?: string                    // 连接 URL
    host?: string                   // 主机（默认 localhost）
    port?: number                   // 端口（默认 6379）
    password?: string               // 密码
    db?: number                     // 数据库索引（默认 0）
    
    // 集群模式
    cluster?: Array<{ host: string; port: number }>
    
    // 哨兵模式
    sentinel?: {
        sentinels: Array<{ host: string; port: number }>
        name: string
    }
    
    // 通用选项
    connectTimeout?: number         // 连接超时（默认 10000）
    commandTimeout?: number         // 命令超时（默认 5000）
    keyPrefix?: string              // 键前缀
    tls?: boolean                   // 是否启用 TLS
    maxRetries?: number             // 最大重试次数（默认 3）
    retryDelay?: number             // 重试延迟（默认 50）
    readOnly?: boolean              // 只读模式
    silent?: boolean                // 静默模式
}
```

## 错误处理

所有操作返回 `Result<T, CacheError>` 类型：

```ts
import { cache, CacheErrorCode } from '@hai/cache'

const result = await cache.get('key')

if (result.success) {
    // 使用 result.data
} else {
    // 处理错误：result.error.message
    
    // 根据错误码处理
    switch (result.error.code) {
        case CacheErrorCode.NOT_INITIALIZED:
            // 处理错误：请先调用 initCache()
            break
        case CacheErrorCode.CONNECTION_FAILED:
            // 处理错误：Redis 连接失败
            break
        case CacheErrorCode.OPERATION_FAILED:
            // 处理错误：操作执行失败
            break
    }
}
```

### 错误码

| 常量                     | 值   | 说明             |
| ------------------------ | ---- | ---------------- |
| `CONNECTION_FAILED`      | 4000 | 连接失败         |
| `OPERATION_FAILED`       | 4001 | 操作失败         |
| `SERIALIZATION_FAILED`   | 4002 | 序列化失败       |
| `DESERIALIZATION_FAILED` | 4003 | 反序列化失败     |
| `KEY_NOT_FOUND`          | 4004 | 键不存在         |
| `TIMEOUT`                | 4005 | 超时             |
| `NOT_INITIALIZED`        | 4010 | 缓存未初始化     |
| `UNSUPPORTED_TYPE`       | 4011 | 不支持的缓存类型 |
| `CONFIG_ERROR`           | 4012 | 配置错误         |

## 测试

```bash
# 运行容器化测试（需要 Docker）
pnpm test:container
```

## 许可证

Apache-2.0
