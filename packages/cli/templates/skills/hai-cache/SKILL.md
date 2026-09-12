---
name: hai-cache
description: "使用 @h-ai/cache 的 Memory/Redis 缓存、TTL、集合、排行榜和锁。"
---

# hai-cache

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/cache 的 Memory/Redis 缓存、TTL、集合、排行榜和锁 |
| 适用场景 | 缓存读写、过期策略或共享资源互斥 |
| 输入 | CacheConfigInput、key/value、TTL、每次获锁的唯一 owner |
| 输出 | 缓存和锁操作的 HaiResult，获锁 data 为 boolean |
| 限制 | 仅服务端；Memory 不跨节点。release/extend 携带本次 owner，避免锁过期后误操作新持有者。 |

> `@h-ai/cache` 提供统一缓存接口，支持 Memory 与 Redis 后端，包含 KV / Hash / List / Set / ZSet / 分布式锁 六类操作。

内存 KV 在到期时间点即失效。整数计数器拒绝 null/boolean/array、非整数增量和安全整数溢出，失败不修改原值；Hash 的 `__proto__` / `constructor` 名称按普通字段保留。

## 运行环境

> ⚠️ **服务端模块（Node.js only）。** 浏览器端无需直接操作缓存，由服务端模块（如 IAM、Scheduler）内部使用。

## 适用场景

- 缓存热点数据减少数据库查询
- 会话存储（配合 IAM）
- 分布式缓存（Redis）与本地测试缓存（Memory）
- 集合操作（权限缓存、标签集合）
- 排行榜（ZSet）与队列（List）
- 分布式锁（多节点部署互斥控制）

## 使用步骤

### 1. 配置

```yaml
# config/_cache.yml
type: memory # memory | redis
# Redis 配置（type=redis 时生效）：
# host: localhost
# port: 6379
# password: ''
# db: 0
# keyPrefix: 'hai:'
```

约定环境变量优先于 YAML，例如 `HAI_CACHE_TYPE`、`HAI_CACHE_HOST`、
`HAI_CACHE_KEYPREFIX`。

### 2. 初始化与关闭

```typescript
import { cache } from '@h-ai/cache'

await cache.init(core.config.get('cache'))
// 使用后关闭
await cache.close()
```

`cache.config` 返回的是脱敏后的配置快照；Redis `password` / `url` 等敏感值不会原样暴露给日志或调试输出。

## 核心 API

### KV 操作（`cache.kv`）

| 方法                                | 说明                 |
| ----------------------------------- | -------------------- |
| `get / set / del / exists`          | 基础读写与存在性判断 |
| `expire / expireAt / ttl / persist` | TTL 管理             |
| `incr / incrBy / decr / decrBy`     | 计数器操作           |
| `mget / mset`                       | 批量读写             |
| `scan / keys / type`                | Key 检索与类型判断   |

```typescript
await cache.kv.set('user:123', { name: '张三' }, { ex: 3600 })
const result = await cache.kv.get<{ name: string }>('user:123')
if (result.success && result.data) {
  // result.data.name === '张三'
}

await cache.kv.del('user:123')
```

### Hash/List/Set/ZSet（`cache.hash/list/set_/zset`）

- `cache.hash`：对象字段读写（如用户 profile 局部更新）
- `cache.list`：队列/消息顺序处理
- `cache.set_`：去重集合（成员关系、权限集合）
- `cache.zset`：分数排序（排行榜、权重调度）

```typescript
await cache.hash.hset('profile:1', { nickname: 'alice' })
await cache.list.lpush('queue:jobs', 'job-1', 'job-2')
await cache.set_.sadd('role:admin:perms', 'user.read', 'user.write')
await cache.zset.zadd('rank:daily', { member: 'u1', score: 100 })
```

### 分布式锁（`cache.lock`）

| 方法       | 说明                                       |
| ---------- | ------------------------------------------ |
| `acquire`  | 尝试获锁（SET NX EX），返回 true/false     |
| `release`  | 释放锁（支持 owner 验证，防止误释放）      |
| `isLocked` | 检查锁是否被持有                           |
| `extend`   | 续期锁 TTL（支持 owner 验证）              |

```typescript
// 每次尝试生成唯一 owner，后续释放/续期复用同一个值
const owner = core.id.generate()
const acquired = await cache.lock.acquire('my-lock', { ttl: 30, owner })
if (acquired.success && acquired.data) {
  try {
    // 长任务仅在仍持有锁时续期；失败或 data=false 时停止依赖锁的后续操作
    const extended = await cache.lock.extend('my-lock', 60, owner)
    if (!extended.success || !extended.data) {
      logger.warn('Lock extension failed; protected work cancelled')
    }
    else {
      // 受保护的操作
    }
  }
  finally {
    await cache.lock.release('my-lock', owner)
  }
}

// 检查
const locked = await cache.lock.isLocked('my-lock')
```

**最佳实践：**

- `owner` 每次获锁尝试唯一，释放/续期复用该值；仅用 nodeId 会使同节点旧任务误释放过期后重新获得的锁
- 释放锁时传入 `owner` 防止误释放他人锁
- Memory 后端适合开发/测试；Redis 后端用 Lua 脚本保证 release/extend 原子性

## 错误码 — `HaiCacheError`

| 错误码 | code | 说明 |
|--------|------|------|
| `HaiCacheError.CONNECTION_FAILED` | `hai:cache:001` | 连接失败 |
| `HaiCacheError.OPERATION_FAILED` | `hai:cache:002` | 操作失败 |
| `HaiCacheError.SERIALIZATION_FAILED` | `hai:cache:003` | 序列化失败 |
| `HaiCacheError.DESERIALIZATION_FAILED` | `hai:cache:004` | 反序列化失败 |
| `HaiCacheError.KEY_NOT_FOUND` | `hai:cache:005` | 键不存在 |
| `HaiCacheError.TIMEOUT` | `hai:cache:006` | 超时 |
| `HaiCacheError.NOT_INITIALIZED` | `hai:cache:010` | 未初始化 |
| `HaiCacheError.UNSUPPORTED_TYPE` | `hai:cache:011` | 不支持的缓存类型 |
| `HaiCacheError.CONFIG_ERROR` | `hai:cache:012` | 配置错误 |

## 常见模式

### 缓存命中与回源（未缓存空值，不防穿透）

```typescript
async function getUserCached(userId: string) {
  const cached = await cache.kv.get<User>(`user:${userId}`)
  if (cached.success && cached.data)
    return cached.data

  const user = await userRepo.findById(userId)
  if (user.success && user.data) {
    await cache.kv.set(`user:${userId}`, user.data, { ex: 3600 })
    return user.data
  }
  return null
}
```

### 分布式锁保护共享资源

```typescript
const lockKey = 'batch:import'
const owner = core.id.generate()
const acquired = await cache.lock.acquire(lockKey, { ttl: 60, owner })
if (acquired.success && acquired.data) {
  try {
    await runBatchImport()
  }
  finally {
    await cache.lock.release(lockKey, owner)
  }
}
else if (acquired.success) {
  logger.info('Another node is running the import')
}
else {
  logger.error('Lock acquisition failed', { code: acquired.error.code })
}
```

## 相关 Skills

- `hai-build`：模块初始化顺序（cache 在 db 之后、iam 之前）
- `hai-core`：配置与 HaiResult 模型
- `hai-iam`：会话存储与权限缓存（底层使用 cache）
- `hai-scheduler`：定时任务分布式锁（底层使用 cache.lock）
- `hai-reach`：消息发送互斥锁（底层使用 cache.lock）
- `hai-kit`：SvelteKit 集成层
