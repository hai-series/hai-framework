# hai-cache 参考

> `@h-ai/cache` 提供统一缓存接口，支持 Memory 与 Redis 后端，包含 KV / Hash / List / Set / ZSet / 分布式锁 六类操作。

内存 KV 在到期时间点即失效。整数计数器拒绝 null/boolean/array、非整数增量和安全整数溢出，失败不修改原值；Hash 的 `__proto__` / `constructor` 名称按普通字段保留。

## 运行环境

> ⚠️ **服务端模块（Node.js only）。** 浏览器通过服务端接口使用依赖缓存的功能，例如 IAM 会话。

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
import { core } from '@h-ai/core'
import { CacheConfigSchema, cache } from '@h-ai/cache'

// 从已加载的 cache 配置按 CacheConfigSchema 校验并补齐默认值。成功 data 是配置，失败包含配置错误。
const config = core.config.validate('cache', CacheConfigSchema)
if (!config.success) throw new Error(config.error.message)
// 用校验后的 config.data 初始化选定的 Memory 或 Redis。成功 data 为 undefined，连接失败可用 error 诊断。
const initialized = await cache.init(config.data)
if (!initialized.success) throw new Error(initialized.error.message)
// 无参数，等待初始化和连接清理完成。成功 data 为 undefined，失败时可检查 error 并重试清理。
const closed = await cache.close()
if (!closed.success) throw new Error(closed.error.message)
```


初始化只在健康检查成功后发布连接；失败时释放候选资源。若清理仍失败，初始化错误的 `error.ext.cleanupPending` 为 `true`。`cache.close()` 返回 `Promise<HaiResult<void>>`，等待正在进行的初始化，并合并并发关闭。开始清理后 `isInitialized` 为 `false`，配置与业务操作不再可用；清理失败仍保留资源，后续 `close()` 或 `init()` 先重试释放，成功前不会创建替代连接。调用方必须检查关闭结果。

关闭或重新初始化开始清理原连接后，留存的操作对象和此前从中取出的操作函数都返回 `NOT_INITIALIZED`。新实例就绪后，从 `cache` 重新取得操作。

```ts
// 无参数，等待初始化和连接清理完成。成功 data 为 undefined，失败时可检查 error 并重试清理。
const closed = await cache.close()
if (!closed.success) {
  // 处理清理故障后有限重试；再次失败应向应用报告。
  // 无参数，重试清理此前保留的连接资源。成功 data 为 undefined，再次失败报告 error。
  const retried = await cache.close()
  if (!retried.success) throw new Error(retried.error.message)
}
```


`cache.config` 返回的是脱敏后的配置快照；Redis `password` / `url` 等敏感值不会原样暴露给日志或调试输出。

## 核心 API

### KV 操作（`cache.kv`）

| 方法                                | 说明                 |
| ----------------------------------- | -------------------- |
| `get / set / del / exists`          | 基础读写与存在性判断 |
| `expire / expireAt / ttl / persist` | TTL 管理             |
| `incr / incrBy / decr / decrBy`     | 计数器操作           |
| `mget / mset`                       | 批量读写。`mget` 按输入顺序返回，缺失或非 KV 类型的位置为 `null` |
| `scan / keys / type`                | Key 检索与类型判断   |

```typescript
// 将用户对象快照保存到 user:123，60 分钟后过期。成功 data 为 true，序列化或存储失败返回 error。
await cache.kv.set('user:123', { name: '张三' }, { ex: 3600 })
// 读取 user:123 的 JSON 快照。命中时 data 是用户对象，键不存在时 data 为 null。
const result = await cache.kv.get<{ name: string }>('user:123')
if (result.success && result.data) {
  // result.data.name === '张三'
}

// 删除 user:123 和它的期限。成功 data 是实际删除数，本例有键时为 1。
await cache.kv.del('user:123')
```

### Cluster 多键与扫描

`mget/del/exists` 跨 slot 时有界并发且无整体原子性/快照；mget 保留输入顺序，DEL 失败可能已部分删除，重试幂等。`mset`、集合交/并/差和多键 blocking pop 须同 slot，否则返回 `CROSS_SLOT`；使用共同的 `{hash-tag}`，MSET 不做部分写入回退。

scan 首次传字符串 `'0'`，后续原样传回不透明游标，返回 `'0'` 表示完成。Cluster 覆盖所有 master；同配置和拓扑的另一应用节点可接续。拓扑、match 或 keyPrefix 改变时返回 `SCAN_TOPOLOGY_CHANGED`，从 `'0'` 重启；无效游标或 count 返回 `INVALID_SCAN`。返回去除 keyPrefix 的逻辑 key，前缀 glob 字符按字面量解释；keys 同样扫描并去重。SCAN 无快照，可能重复，count 仅为正整数提示值。

```ts
// 从游标 '0' 开始匹配 users:*，每批参考 100 个键。成功 data 是 [下个游标, 逻辑键数组]。
const first = await cache.kv.scan('0', { match: 'users:*', count: 100 })
if (first.success && first.data[0] !== '0') {
  // 以原游标和同一组筛选条件继续。成功 data 的游标为 '0' 时已完成，拓扑变化则返回 SCAN_TOPOLOGY_CHANGED。
  const next = await cache.kv.scan(first.data[0], { match: 'users:*', count: 100 })
}
```

### Hash/List/Set/ZSet（`cache.hash/list/set_/zset`）

- `cache.hash`：对象字段读写（如用户 profile 局部更新）
- `cache.list`：队列/消息顺序处理
- `cache.set_`：去重集合（成员关系、权限集合）
- `cache.zset`：分数排序（排行榜、权重调度）

```typescript
// 设置 profile:1 的 nickname 字段为 alice。成功 data 是新增字段数，覆盖时该字段计为 0。
await cache.hash.hset('profile:1', { nickname: 'alice' })
// 向 queue:jobs 左端依次压入两项，job-2 成为首项。成功 data 是压入完成后的列表长度。
await cache.list.lpush('queue:jobs', 'job-1', 'job-2')
// 把两项权限加入 role:admin:perms。成功 data 是首次加入的成员数。
await cache.set_.sadd('role:admin:perms', 'user.read', 'user.write')
// 写入 rank:daily 的成员 u1 和分数 100。成功 data 是新增成员数，更新已有成员计为 0。
await cache.zset.zadd('rank:daily', { member: 'u1', score: 100 })
```

Redis 的 `blpop` 和 `brpop` 每次使用独立连接，返回去除 `keyPrefix` 的逻辑键。`timeout` 是服务端等待秒数，`0` 代表一直等待，超时成功返回 `null`。`commandTimeout` 不会截断该等待。关闭或更换后端时，仍在等待的弹出返回 `OPERATION_FAILED`。Memory 按输入顺序检查列表，无可取值时立即返回 `null`。

移除结构的最后一项会删除键和 TTL。Memory 的 `hincrBy` 只接受安全整数的字段值、增量和结果。集合随机操作指定整数 `count` 时，缺键返回 `[]`。`srandmember` 负数允许重复取样，`spop` 仅接受非负数。ZSet 同分按成员的 UTF-8 字节顺序，分数支持正负无穷并拒绝 `NaN`。分数范围用 `'(10'` 排除端点，`zrangeByScore` 的 `offset` 和 `count` 可以分别指定，默认是 `0` 和 `-1`（不限）。

### 分布式锁（`cache.lock`）

| 方法       | 说明                                       |
| ---------- | ------------------------------------------ |
| `acquire`  | 首次获取返回随机 owner。传入当前 `{ owner }` 可重入并返回同一凭据，失败竞争返回 `null` |
| `release`  | 当前 owner 释放一层，最后一层释放后解锁。凭据不匹配返回 `false` |
| `isLocked` | 检查锁是否被持有                           |
| `extend`   | 续期锁 TTL（必须携带本次 owner） |

```typescript
// 尝试持有逻辑键 my-lock 30 秒。成功 data 是新 owner，已被占用时为 null，后端失败返回 error。
const acquired = await cache.lock.acquire('my-lock', { ttl: 30 })
if (acquired.success && acquired.data) {
  const owner = acquired.data
  try {
    // 以首次返回的 owner 重入 my-lock。成功时返回同一 owner 并增加一层，凭据已失效时 data 为 null。
    const nested = await cache.lock.acquire('my-lock', { owner })
    if (nested.success && nested.data !== null) {
      try {
        // 执行嵌套步骤。
      }
      finally {
        // 用同一个 owner 释放 my-lock 的一层。data=true 表示释放成功，最后一层删除锁。过期或凭据不符时 data=false。
        const released = await cache.lock.release('my-lock', owner)
        if (!released.success || !released.data)
          logger.warn('Nested lock release failed')
      }
    }
  }
  finally {
    // 用同一个 owner 释放 my-lock 的一层。data=true 表示释放成功，最后一层删除锁。过期或凭据不符时 data=false。
    const released = await cache.lock.release('my-lock', owner)
    if (!released.success || !released.data)
      logger.warn('Outer lock release failed')
  }
}
```

- `owner` 取自首次获取结果，只在同一业务执行的可信服务之间传递。每次成功进入对应一次 `release`。`release` 的 `true` 表示释放了一层。
- 重入保留期限。需要延期时调用 `extend(key, ttl, owner)`。首次获取和续期的 TTL 用正安全整数秒，换算后的到期毫秒须可精确表示。重入同时传 `ttl` 和非法 TTL 均返回 `OPERATION_FAILED`。
- 多机使用同一 Redis 或 Redis Cluster 和键前缀。Redis 在同一键内原子更新持有次数，Memory 的状态仅限本进程。滚动部署时先升级所有使用同一把锁的参与者，再使用重入。
- 锁操作若在网络中断后未收到结果，按结果未知处理，避免盲目重复重入或释放。为同一任务保留最终写入的条件校验。

## 错误码 — `HaiCacheError`

| 错误码 | code | 说明 |
|--------|------|------|
| `HaiCacheError.CONNECTION_FAILED` | `hai:cache:001` | 连接或资源释放失败 |
| `HaiCacheError.OPERATION_FAILED` | `hai:cache:002` | 操作失败 |
| `HaiCacheError.SERIALIZATION_FAILED` | `hai:cache:003` | 缓存值无法序列化为 JSON，例如存在循环引用或 `toJSON()` 返回 `undefined`。批量写入遇到此错误时不提交任何项 |
| `HaiCacheError.KEY_NOT_FOUND` | `hai:cache:005` | Memory 通过 `lset` 更新不存在的列表 |
| `HaiCacheError.NOT_INITIALIZED` | `hai:cache:010` | 未初始化 |
| `HaiCacheError.CONFIG_ERROR` | `hai:cache:012` | 配置校验失败或生产环境要求 Redis |
| `HaiCacheError.INVALID_SCAN` | `hai:cache:013` | 游标或 count 无效 |
| `HaiCacheError.SCAN_TOPOLOGY_CHANGED` | `hai:cache:014` | 拓扑或条件变化，重新遍历 |
| `HaiCacheError.CROSS_SLOT` | `hai:cache:015` | 多键操作不在同一 slot |
| `HaiCacheError.INVALID_SET_OPTIONS` | `hai:cache:016` | `kv.set` 的写入条件或期限配置无效 |

`HaiCacheError` 仍导出 `DESERIALIZATION_FAILED`（`hai:cache:004`）、`TIMEOUT`（`hai:cache:006`）和内部防御用的 `UNSUPPORTED_TYPE`（`hai:cache:011`）。阻塞弹出等到 Redis 超时会成功返回 `null`，配置中不支持的 `type` 由 Schema 校验返回 `CONFIG_ERROR`。

## 常见模式

### 缓存命中与回源（未缓存空值，不防穿透）

```typescript
async function getUserCached(userId: string) {
  // 由 userId 拼出逻辑缓存键。成功 data 是缓存的用户或 null。
  const cached = await cache.kv.get<User>(`user:${userId}`)
  if (cached.success && cached.data)
    return cached.data

  // 缓存未命中时，用同一 userId 查用户表。成功 data 是用户或 null，查询失败返回 error。
  const user = await userRepo.findById(userId)
  if (user.success && user.data) {
    // 把数据库返回的用户保存一小时。成功 data 为 true，本示例仍返回已查到的用户。
    await cache.kv.set(`user:${userId}`, user.data, { ex: 3600 })
    return user.data
  }
  return null
}
```

### 分布式锁保护共享资源

```typescript
const lockKey = 'batch:import'
// 尝试持有导入锁 60 秒，成功 data 是 owner 或表示竞争失败的 null。
const acquired = await cache.lock.acquire(lockKey, { ttl: 60 })
if (acquired.success && acquired.data) {
  const owner = acquired.data
  try {
    // 执行导入，每次持久化时校验资源自己的提交条件，提交失败由应用处理。
    await runBatchImportWithConditionalCommit()
  }
  finally {
    // 用本次获取的 owner 释放导入锁。data=true 表示解锁，data=false 表示租约已失效。
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

- `hai-build`：模块初始化顺序（cache 在 iam 之前；cache 自身不依赖 reldb）
- `hai-core`：配置与 HaiResult 模型
- `hai-iam`：会话存储与权限缓存（底层使用 cache）
- `hai-reach`：消息发送互斥锁（底层使用 cache.lock）
- `hai-kit`：SvelteKit 集成层

Cluster 与 Sentinel 数据节点认证使用 `password`，Cluster 发现的新节点继承同一鉴权配置。`url` 模式只使用 URL 内凭据，单独 password 不覆盖 URL。

单键 compareAndSwap(key, expected, value, {px?,keepTtl?}) 比较 JSON 序列化快照并原子替换，必须检查 success 与 boolean data。expected=undefined 表示不存在，value=undefined 表示删除，null 是值；px 正整数且与 keepTtl 互斥。比较失败不修改 TTL；跨节点版本状态优先使用 CAS 而不是租约后无条件 SET。

`owner` 用于校验租约重入、续期和释放。暂停或过期后旧任务仍可能继续执行，最终持久化写入必须使用资源自己的 CAS、版本条件或事务约束。批量导入等应用函数须在每次提交时校验条件。

## 生产共享状态

生产仅使用 Redis（含 Cluster）；memory 只用于开发/明确测试。Redis 故障返回失败，不回退本机缓存。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化成功前检查，只有 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试豁免。不要将租约当作最终写入条件，外部未知效果须按稳定业务键核对。

`kv.set` 返回 `HaiResult<boolean>`：`data=true` 表示实际写入，NX/XX 未命中返回 `success=true,data=false` 且不改变原值或 TTL。签发票据、会话或登记公钥前必须检查这两个字段。`ex/px/exat/pxat` 分别使用秒、毫秒、Unix 秒、Unix 毫秒，须为正安全整数且只能指定一种，与 `keepTtl=true` 互斥；`nx/xx` 也互斥。零、负数、小数、非有限值或溢出返回 `INVALID_SET_OPTIONS`（`cache:016`），不会写成永久键。过去的正绝对时间表示立即过期。省略期限会移除原 TTL；`keepTtl` 保留已有 TTL，新键仍永久保存。memory 和 Redis 都保存 JSON 快照。
