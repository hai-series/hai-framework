# @hai/cache - AI 助手参考

## 模块概述

`@hai/cache` 是一个统一的缓存访问模块，支持 Redis。

**特点**：
- 通过 `cache` 对象统一访问所有操作
- 支持多种数据结构：String、Hash、List、Set、SortedSet
- 自动处理 JSON 序列化/反序列化

## 核心 API

```ts
import { cache, initCache, closeCache } from '@hai/cache'
```

### 初始化

```ts
// Redis 单机模式
await initCache({
    type: 'redis',
    host: 'localhost',
    port: 6379,
    password: 'secret',
    db: 0
})

// Redis URL 模式
await initCache({
    type: 'redis',
    url: 'redis://:password@localhost:6379/0'
})

// Redis 集群模式
await initCache({
    type: 'redis',
    cluster: [
        { host: 'node1', port: 6379 },
        { host: 'node2', port: 6379 },
        { host: 'node3', port: 6379 }
    ]
})
```

### 基础操作 (cache.*)

```ts
// 设置值（带过期时间）
await cache.set('key', { name: '张三' }, { ex: 3600 })

// 获取值
const result = await cache.get<{ name: string }>('key')

// 删除键
await cache.del('key')

// 检查存在
await cache.exists('key')

// 过期时间
await cache.expire('key', 60)
await cache.ttl('key')

// 自增/自减
await cache.incr('counter')
await cache.incrBy('counter', 5)
await cache.decr('counter')

// 批量操作
await cache.mset([['k1', 'v1'], ['k2', 'v2']])
const values = await cache.mget('k1', 'k2')
```

### Hash 操作 (cache.hash.*)

```ts
// 设置字段
await cache.hash.hset('user:1', 'name', '张三')
await cache.hash.hset('user:1', { name: '张三', age: 25 })

// 获取字段
const name = await cache.hash.hget<string>('user:1', 'name')

// 获取所有字段
const user = await cache.hash.hgetall('user:1')

// 删除字段
await cache.hash.hdel('user:1', 'age')

// 字段自增
await cache.hash.hincrBy('user:1', 'count', 1)
```

### List 操作 (cache.list.*)

```ts
// 推入元素
await cache.list.lpush('queue', 'task1', 'task2')
await cache.list.rpush('queue', 'task3')

// 弹出元素
const item = await cache.list.lpop<string>('queue')
const item2 = await cache.list.rpop<string>('queue')

// 获取范围
const items = await cache.list.lrange<string>('queue', 0, -1)

// 阻塞式弹出（消息队列）
const result = await cache.list.brpop<string>(5, 'queue')
```

### Set 操作 (cache.set_.*)

```ts
// 添加成员
await cache.set_.sadd('tags', 'redis', 'cache')

// 检查成员
await cache.set_.sismember('tags', 'redis')

// 获取所有成员
const members = await cache.set_.smembers<string>('tags')

// 集合运算
await cache.set_.sinter<string>('set1', 'set2')  // 交集
await cache.set_.sunion<string>('set1', 'set2')  // 并集
await cache.set_.sdiff<string>('set1', 'set2')   // 差集
```

### SortedSet 操作 (cache.zset.*)

```ts
// 添加成员（排行榜）
await cache.zset.zadd('rank', { score: 100, member: 'player1' })

// 获取排行榜（从高到低）
const top10 = await cache.zset.zrevrange('rank', 0, 9, true)

// 获取排名
const rank = await cache.zset.zrevrank('rank', 'player1')

// 获取分数
const score = await cache.zset.zscore('rank', 'player1')

// 增加分数
await cache.zset.zincrBy('rank', 50, 'player1')
```

## 统一配置结构

```ts
interface CacheConfig {
    type: 'redis'
    
    // 连接配置
    url?: string                    // 连接 URL
    host?: string                   // 主机（默认 localhost）
    port?: number                   // 端口（默认 6379）
    password?: string               // 密码
    db?: number                     // 数据库索引（默认 0）
    
    // 集群/哨兵
    cluster?: Array<{ host: string; port: number }>
    sentinel?: { sentinels: Array<{ host: string; port: number }>; name: string }
    
    // 通用选项
    connectTimeout?: number         // 连接超时（默认 10000）
    commandTimeout?: number         // 命令超时（默认 5000）
    keyPrefix?: string              // 键前缀
    tls?: boolean                   // 是否启用 TLS
    maxRetries?: number             // 最大重试次数（默认 3）
    silent?: boolean                // 静默模式
}
```

## 返回值类型

所有操作返回 `Result<T, CacheError>`：

```ts
interface Result<T, E> {
    success: boolean
    data?: T
    error?: E
}

interface CacheError {
    code: CacheErrorCode      // 数字类型错误码
    message: string
    cause?: unknown
}

// 错误码常量（数字类型 4000-4999）
const CacheErrorCode = {
    CONNECTION_FAILED: 4000,    // 连接失败
    OPERATION_FAILED: 4001,     // 操作失败
    SERIALIZATION_FAILED: 4002, // 序列化失败
    DESERIALIZATION_FAILED: 4003, // 反序列化失败
    KEY_NOT_FOUND: 4004,        // 键不存在
    TIMEOUT: 4005,              // 超时
    NOT_INITIALIZED: 4010,      // 缓存未初始化
    UNSUPPORTED_TYPE: 4011,     // 不支持的缓存类型
    CONFIG_ERROR: 4012          // 配置错误
} as const
```

## 使用模式

```ts
// 标准使用
const result = await cache.get('key')
if (result.success) {
    // 使用 result.data
} else {
    // 处理错误：result.error.message
}

// 解构使用
const { success, data, error } = await cache.get('key')

// 错误码判断
if (!result.success && result.error.code === CacheErrorCode.NOT_INITIALIZED) {
    // 处理错误：请先调用 initCache()
}
```

## 常用场景

### 会话存储

```ts
// 存储会话
await cache.hash.hset(`session:${sessionId}`, {
    userId: user.id,
    loginTime: Date.now(),
    ip: clientIp
})
await cache.expire(`session:${sessionId}`, 7200) // 2 小时过期

// 获取会话
const session = await cache.hash.hgetall(`session:${sessionId}`)
```

### 消息队列

```ts
// 生产者
await cache.list.lpush('task:queue', { type: 'send_email', data: { to: 'test@example.com' } })

// 消费者
const task = await cache.list.brpop<{ type: string; data: unknown }>(0, 'task:queue')
if (task.success && task.data) {
    const [key, value] = task.data
    // 处理任务
}
```

### 排行榜

```ts
// 更新分数
await cache.zset.zincrBy('game:score', 10, `player:${playerId}`)

// 获取 Top 10
const result = await cache.zset.zrevrange('game:score', 0, 9, true)
if (result.success) {
    result.data.forEach((item, index) => {
        // 使用 item.member / item.score
    })
}
```

### 分布式锁（简单实现）

```ts
// 获取锁
const acquired = await cache.set(`lock:${resource}`, 'locked', { nx: true, ex: 30 })
if (acquired.success) {
    try {
        // 执行业务逻辑
    } finally {
        // 释放锁
        await cache.del(`lock:${resource}`)
    }
}
```

## 注意事项

1. **序列化**：对象会自动 JSON 序列化，字符串直接存储
2. **类型安全**：使用泛型获取正确的返回类型
3. **键前缀**：可通过 `keyPrefix` 配置实现命名空间隔离
4. **连接管理**：应用退出前调用 `closeCache()` 释放连接
5. **错误处理**：所有操作都返回 Result 类型，需检查 success 字段
