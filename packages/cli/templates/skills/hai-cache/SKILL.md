---
name: hai-cache
description: 使用 @h-ai/cache 进行内存或 Redis 缓存操作（kv/hash/list/set/zset/分布式锁）；当需求涉及缓存读写、TTL 管理、集合运算、排行榜、缓存一致性策略或分布式互斥锁时使用。
---

# hai-cache

> `@h-ai/cache` 提供统一缓存接口，支持 Memory 与 Redis 后端，包含 KV / Hash / List / Set / ZSet / 分布式锁 六类操作。

---

## 适用场景

- 缓存热点数据减少数据库查询
- 会话存储（配合 IAM）
- 分布式缓存（Redis）与本地测试缓存（Memory）
- 集合操作（权限缓存、标签集合）
- 排行榜（ZSet）与队列（List）
- 分布式锁（多节点部署互斥控制）

---

## 使用步骤

### 1. 配置

```yaml
# config/_cache.yml
type: ${HAI_CACHE_TYPE:memory} # memory | redis
# Redis 配置（type=redis 时生效）：
# host: ${HAI_CACHE_REDIS_HOST:localhost}
# port: ${HAI_CACHE_REDIS_PORT:6379}
# password: ${HAI_CACHE_REDIS_PASSWORD:}
# db: ${HAI_CACHE_REDIS_DB:0}
# keyPrefix: ${HAI_CACHE_KEY_PREFIX:hai:}
```

### 2. 初始化与关闭

```typescript
import { cache } from '@h-ai/cache'

await cache.init(core.config.get('cache'))
// 使用后关闭
await cache.close()
```

---

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
// 获锁（TTL 30 秒，owner 用于标识持有者）
const acquired = await cache.lock.acquire('my-lock', { ttl: 30, owner: 'node-1' })
if (acquired.success && acquired.data) {
  try {
    // 受保护的操作
  }
  finally {
    await cache.lock.release('my-lock', 'node-1')
  }
}

// 续期
await cache.lock.extend('my-lock', 60, 'node-1')

// 检查
const locked = await cache.lock.isLocked('my-lock')
```

**最佳实践：**

- `owner` 使用稳定的节点标识（如 `nodeId`），不要每次随机生成
- 释放锁时传入 `owner` 防止误释放他人锁
- Memory 后端适合开发/测试；Redis 后端用 Lua 脚本保证 release/extend 原子性

---

## 错误码 — `CacheErrorCode`

| 错误码                   | 说明              |
| ------------------------ | ----------------- |
| `NOT_INITIALIZED`        | 未初始化          |
| `CONNECTION_FAILED`      | 连接失败（Redis） |
| `OPERATION_FAILED`       | 操作失败          |
| `SERIALIZATION_FAILED`   | 序列化失败        |
| `DESERIALIZATION_FAILED` | 反序列化失败      |
| `KEY_NOT_FOUND`          | 键不存在          |
| `TIMEOUT`                | 超时              |
| `UNSUPPORTED_TYPE`       | 不支持的缓存类型  |
| `CONFIG_ERROR`           | 配置错误          |

---

## 常见模式

### 缓存穿透保护

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
const acquired = await cache.lock.acquire(lockKey, { ttl: 60, owner: nodeId })
if (acquired.success && acquired.data) {
  try {
    await runBatchImport()
  }
  finally {
    await cache.lock.release(lockKey, nodeId)
  }
}
else {
  logger.info('Another node is running the import')
}
```

---

## 相关 Skills

- `hai-build`：模块初始化顺序（cache 在 db 之后、iam 之前）
- `hai-core`：配置与 Result 模型
- `hai-iam`：会话存储与权限缓存（底层使用 cache）
- `hai-scheduler`：定时任务分布式锁（底层使用 cache.lock）
- `hai-reach`：消息发送互斥锁（底层使用 cache.lock）
- `hai-kit`：SvelteKit 集成层
