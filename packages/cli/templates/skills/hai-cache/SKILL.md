---
name: hai-cache
description: 使用 @h-ai/cache 进行内存或 Redis 缓存操作，包括 get/set/delete/TTL/集合/分布式锁；当需求涉及缓存读写、TTL 管理、Redis 集合操作或缓存失效策略时使用。
---

# hai-cache

> `@h-ai/cache` 提供统一的缓存接口，支持内存缓存（MemoryProvider）和 Redis 缓存（RedisProvider），包含基础键值、TTL 管理、集合操作与分布式锁。

---

## 适用场景

- 缓存热点数据减少数据库查询
- 会话存储（配合 IAM）
- 分布式缓存（Redis）
- 集合操作（权限缓存等）
- 分布式锁与并发控制

---

## 使用步骤

### 1. 配置

```yaml
# config/_cache.yml
type: ${CACHE_TYPE:memory} # memory | redis
# Redis 配置（type=redis 时生效）：
# host: ${REDIS_HOST:localhost}
# port: ${REDIS_PORT:6379}
# password: ${REDIS_PASSWORD:}
# db: ${REDIS_DB:0}
# keyPrefix: ${REDIS_PREFIX:hai:}
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

### 基础操作

| 方法     | 签名                                          | 说明                 |
| -------- | --------------------------------------------- | -------------------- |
| `get`    | `<T>(key) => Promise<Result<T \| null>>`      | 获取缓存值           |
| `set`    | `(key, value, ttl?) => Promise<Result<void>>` | 设置缓存值（ttl 秒） |
| `delete` | `(key) => Promise<Result<void>>`              | 删除缓存             |
| `exists` | `(key) => Promise<Result<boolean>>`           | 检查 key 是否存在    |
| `ttl`    | `(key) => Promise<Result<number>>`            | 获取剩余 TTL（秒）   |
| `expire` | `(key, ttl) => Promise<Result<void>>`         | 设置/更新 TTL        |
| `keys`   | `(pattern) => Promise<Result<string[]>>`      | 按模式搜索 key       |
| `clear`  | `() => Promise<Result<void>>`                 | 清空所有缓存         |

```typescript
// 基本用法
await cache.set('user:123', { name: '张三' }, 3600) // 1 小时 TTL
const result = await cache.get<{ name: string }>('user:123')
if (result.success && result.data) {
  // result.data.name === '张三'
}

await cache.delete('user:123')
```

### 集合操作

| 方法        | 签名                                           | 说明             |
| ----------- | ---------------------------------------------- | ---------------- |
| `sadd`      | `(key, ...members) => Promise<Result<number>>` | 添加集合成员     |
| `srem`      | `(key, ...members) => Promise<Result<number>>` | 移除集合成员     |
| `smembers`  | `(key) => Promise<Result<string[]>>`           | 获取所有成员     |
| `sismember` | `(key, member) => Promise<Result<boolean>>`    | 检查成员是否存在 |

```typescript
// 权限缓存示例
await cache.sadd('role:admin:perms', 'users:read', 'users:write', 'users:delete')
const perms = await cache.smembers('role:admin:perms')
const hasRead = await cache.sismember('role:admin:perms', 'users:read')
```

### 分布式锁（仅 Redis）

| 方法     | 签名                                     | 说明                |
| -------- | ---------------------------------------- | ------------------- |
| `lock`   | `(key, ttl?) => Promise<Result<string>>` | 获取锁（返回锁 ID） |
| `unlock` | `(key, lockId) => Promise<Result<void>>` | 释放锁              |

```typescript
const lockResult = await cache.lock('process:order:123', 30)
if (lockResult.success) {
  try {
    // 执行互斥操作
  }
  finally {
    await cache.unlock('process:order:123', lockResult.data)
  }
}
```

---

## 错误码 — `CacheErrorCode`

| 错误码                | 说明                |
| --------------------- | ------------------- |
| `NOT_INITIALIZED`     | 未初始化            |
| `CONNECTION_ERROR`    | 连接失败（Redis）   |
| `OPERATION_ERROR`     | 操作失败            |
| `SERIALIZATION_ERROR` | 序列化/反序列化失败 |
| `LOCK_ERROR`          | 锁操作失败          |
| `CONFIG_ERROR`        | 配置错误            |

---

## 常见模式

### 缓存穿透保护

```typescript
async function getUserCached(userId: string) {
  const cached = await cache.get<User>(`user:${userId}`)
  if (cached.success && cached.data)
    return cached.data

  const result = await db.sql.get<User>('SELECT * FROM users WHERE id = ?', [userId])
  if (result.success && result.data) {
    await cache.set(`user:${userId}`, result.data, 3600)
    return result.data
  }
  return null
}
```

### 与 kit 集成（路由缓存）

```typescript
const cacheHandle = kit.cache.createHandle({
  cache,
  routes: {
    '/api/products': { ttl: 300 },
    '/api/config': { ttl: 3600, staleWhileRevalidate: 60 },
  },
})

export const handle = kit.sequence(cacheHandle, appHandle)
```

---

## 相关 Skills

- `hai-build`：模块初始化顺序（cache 在 db 之后、iam 之前）
- `hai-core`：配置与 Result 模型
- `hai-iam`：会话存储与权限缓存（底层使用 cache）
- `hai-kit`：路由缓存集成（`kit.cache.createHandle`）
