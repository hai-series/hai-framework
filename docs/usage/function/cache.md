# @h-ai/cache 功能说明

通过 `cache` 使用进程内缓存或 Redis，保存键值、列表和集合。多个进程可借助共享 Redis 获取同一把有时效的锁。先检查 `cache.init()` 成功，再读写数据或获取锁。

[模块 README](../../../packages/cache/README.md) · [配置清单](../configuration/cache.md) · [数据结构](../data/cache.md) · [数据服务接入](../development/data.md)

## 最小接入示例

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

`cache.config` 返回当前配置的一份副本。Redis 的 `password` 或连接 URL 里的认证信息会隐藏。排查配置时可读取这个属性，启动时请从原配置位置读取真实凭据。

## 功能说明

内存 KV 在到期时间点即视为失效；`incr/decr/incrBy/decrBy` 只接受安全整数数值或整数字符串，非法增量和溢出返回 `OPERATION_FAILED` 并保留原值。Hash 的 `__proto__` / `constructor` 等名称按普通字段保留，不修改返回对象原型。

Memory 的 KV、Hash、List、Set、ZSet 共用 key 命名空间。`exists/expire/expireAt/ttl/persist/keys/scan/del/type` 覆盖全部结构，期限到达后结构操作也立即视为不存在；del 按实际删除的逻辑 key 计数，错误类型的结构操作返回失败。

`cache.init()` 在确认后端可用后才让应用开始读写。连接失败时先尝试释放资源。如果释放也失败，返回错误的 `error.ext.cleanupPending` 为 `true`。

`cache.close()` 等待正在进行的初始化。多次同时关闭时共用同一次清理。开始清理后，`cache.isInitialized` 为 `false`，读写暂停。检查 `await cache.close()` 的结果。如果关闭失败，下次调用 `cache.close()` 或 `cache.init()` 会先重试清理原连接，清理完成后才能重新连接。

```ts
const closed = await cache.close()
if (!closed.success) {
  // 处理清理故障后有限重试；再次失败应向应用报告。
  const retried = await cache.close()
  if (!retried.success)
    throw new Error(retried.error.message)
}
```

Redis 的 QUIT 失败后会强制 disconnect；只有实际释放成功才报告关闭成功。

<a id="api-reference"></a>

### 功能输入输出

下表中的调用假定模块已经初始化成功。应用代码提供实际的业务参数，并在调用前校验输入和权限。收到 `HaiResult` 时先检查 `success`，成功时读 `data`，失败时读 `error`。成功结果为 `void` 时没有业务数据。返回 `null` 时表示没有找到值。

示例中的 `key` 是业务数据的键，`field` 是哈希中的字段名。列表下标用 `start`、`stop` 或 `index`，有序集合的分数范围用 `min` 和 `max`。表中 `seconds`、`ttl`、`timeout` 按秒传入，`timestamp` 是 Unix 秒数。释放或续期锁时，`owner` 使用获取锁时实际返回的值。

#### cache.kv · 读写 JSON 值

用 `cache.kv.set()` 保存可序列化为 JSON 的值。留下过期时间后，过期的键读出为 `null`。批量读取按传入的键顺序返回。设置 `nx` 仅在键不存在时写入，设置 `xx` 仅在键已存在时写入，返回布尔值表示是否写入。

| 入口            | 输入参数            | 成功结果        | 调用示例                                                   |
| --------------- | ------------------- | --------------- | ---------------------------------------------------------- |
| `cache.kv.get`  | key                 | `T \| null`     | `await cache.kv.get('u:1')`                                |
| `cache.kv.set`  | key, value, options | `boolean`       | `await cache.kv.set('u:1', { name: 'Alice' }, { ex: 60 })` |
| `cache.kv.mget` | keys                | `(T \| null)[]` | `await cache.kv.mget('u:1', 'u:2')`                        |
| `cache.kv.mset` | entries             | `void`          | `await cache.kv.mset([['u:1', { name: 'Alice' }]])`        |

#### cache.kv · 比较并交换

用 `cache.kv.compareAndSwap()` 在同一次操作中比较现有值并写入新值。传 `expected: undefined` 表示只有键不存在时才应用新值，传 `value: undefined` 表示删除键。比较失败时返回 `false`，原值和有效期都保留。

| 入口                      | 输入参数                      | 成功结果  | 调用示例                                         |
| ------------------------- | ----------------------------- | --------- | ------------------------------------------------ |
| `cache.kv.compareAndSwap` | key, expected, value, options | `boolean` | `await cache.kv.compareAndSwap('version', 1, 2)` |

#### cache.kv · 删除与检查键

按 key 管理全部数据结构；del/exists 输入一个或多个键，返回删除/存在数；type 输入单键返回结构类型。

| 入口              | 输入参数 | 成功结果 | 调用示例                              |
| ----------------- | -------- | -------- | ------------------------------------- |
| `cache.kv.del`    | keys     | `number` | `await cache.kv.del('u:1', 'u:2')`    |
| `cache.kv.exists` | keys     | `number` | `await cache.kv.exists('u:1', 'u:2')` |
| `cache.kv.type`   | key      | `string` | `await cache.kv.type('u:1')`          |

#### cache.kv · 到期时间

控制保存期限；相对秒数、Unix 秒数或键分别设置/查询/移除 TTL。修改返回 boolean，ttl 返回秒数（-1 无期限、-2 不存在）。

| 入口                | 输入参数       | 成功结果  | 调用示例                                                             |
| ------------------- | -------------- | --------- | -------------------------------------------------------------------- |
| `cache.kv.expire`   | key, seconds   | `boolean` | `await cache.kv.expire('u:1', 60)`                                   |
| `cache.kv.expireAt` | key, timestamp | `boolean` | `await cache.kv.expireAt('u:1', Math.floor(Date.now() / 1000) + 60)` |
| `cache.kv.ttl`      | key            | `number`  | `await cache.kv.ttl('u:1')`                                          |
| `cache.kv.persist`  | key            | `boolean` | `await cache.kv.persist('u:1')`                                      |

#### cache.kv · 计数器

计数器输入 key 和可选整数增量，返回新安全整数；类型不符或溢出失败且不修改原值。

| 入口              | 输入参数       | 成功结果 | 调用示例                            |
| ----------------- | -------------- | -------- | ----------------------------------- |
| `cache.kv.incr`   | key            | `number` | `await cache.kv.incr('hits')`       |
| `cache.kv.incrBy` | key, increment | `number` | `await cache.kv.incrBy('hits', 2)`  |
| `cache.kv.decr`   | key            | `number` | `await cache.kv.decr('stock')`      |
| `cache.kv.decrBy` | key, decrement | `number` | `await cache.kv.decrBy('stock', 2)` |

#### cache.kv · 扫描键

排查缓存时可用 `cache.kv.keys()` 按匹配模式列出键，或用 `cache.kv.scan()` 分批扫描。每次扫描返回一组键和下次调用的游标。扫描过程中可能有其他请求修改键，同一个键也可能出现多次。

| 入口            | 输入参数        | 成功结果             | 调用示例                                                 |
| --------------- | --------------- | -------------------- | -------------------------------------------------------- |
| `cache.kv.keys` | pattern         | `string[]`           | `await cache.kv.keys('u:*')`                             |
| `cache.kv.scan` | cursor, options | `[string, string[]]` | `await cache.kv.scan('0', { match: 'u:*', count: 100 })` |

#### cache.hash

字段缓存输入 key、field/fields/对象或增量。读取返回值/null、对象、字段/值数组或长度；hset/hdel 返回新增/删除数，hexists 返回 boolean，hincrBy 返回新整数。

| 入口                 | 输入参数              | 成功结果        | 调用示例                                        |
| -------------------- | --------------------- | --------------- | ----------------------------------------------- |
| `cache.hash.hget`    | key, field            | `T \| null`     | `await cache.hash.hget('u:1', 'name')`          |
| `cache.hash.hset`    | key, field, value     | `number`        | `await cache.hash.hset('u:1', 'name', 'Alice')` |
| `cache.hash.hdel`    | key, fields           | `number`        | `await cache.hash.hdel('u:1', 'name')`          |
| `cache.hash.hexists` | key, field            | `boolean`       | `await cache.hash.hexists('u:1', 'name')`       |
| `cache.hash.hgetall` | key                   | `T`             | `await cache.hash.hgetall('u:1')`               |
| `cache.hash.hkeys`   | key                   | `string[]`      | `await cache.hash.hkeys('u:1')`                 |
| `cache.hash.hvals`   | key                   | `T[]`           | `await cache.hash.hvals('u:1')`                 |
| `cache.hash.hlen`    | key                   | `number`        | `await cache.hash.hlen('u:1')`                  |
| `cache.hash.hmget`   | key, fields           | `(T \| null)[]` | `await cache.hash.hmget('u:1', 'name', 'age')`  |
| `cache.hash.hincrBy` | key, field, increment | `number`        | `await cache.hash.hincrBy('u:1', 'visits', 1)`  |

#### cache.list

有序队列输入 key、值、索引/区间；push 返回长度，pop/index 返回值/null，range 返回数组，set/trim 返回 void。阻塞 pop 输入秒数与键，返回 [key,value]/null。

| 入口                | 输入参数          | 成功结果              | 调用示例                                          |
| ------------------- | ----------------- | --------------------- | ------------------------------------------------- |
| `cache.list.lpush`  | key, values       | `number`              | `await cache.list.lpush('jobs', 'job-1')`         |
| `cache.list.rpush`  | key, values       | `number`              | `await cache.list.rpush('jobs', 'job-2')`         |
| `cache.list.lpop`   | key               | `T \| null`           | `await cache.list.lpop('jobs')`                   |
| `cache.list.rpop`   | key               | `T \| null`           | `await cache.list.rpop('jobs')`                   |
| `cache.list.llen`   | key               | `number`              | `await cache.list.llen('jobs')`                   |
| `cache.list.lrange` | key, start, stop  | `T[]`                 | `await cache.list.lrange('jobs', 0, 9)`           |
| `cache.list.lindex` | key, index        | `T \| null`           | `await cache.list.lindex('jobs', 0)`              |
| `cache.list.lset`   | key, index, value | `void`                | `await cache.list.lset('jobs', 0, 'replacement')` |
| `cache.list.ltrim`  | key, start, stop  | `void`                | `await cache.list.ltrim('jobs', 0, 99)`           |
| `cache.list.blpop`  | timeout, keys     | `[string, T] \| null` | `await cache.list.blpop(5, 'jobs')`               |
| `cache.list.brpop`  | timeout, keys     | `[string, T] \| null` | `await cache.list.brpop(5, 'jobs')`               |

#### cache.set_

去重/集合运算。key+成员用于增删/成员判定，返回数量/boolean；members 返回数组，card 返回基数，random/pop 按 count 返回成员/数组/null，交并差接收多个键返回数组。

| 入口                     | 输入参数     | 成功结果           | 调用示例                                        |
| ------------------------ | ------------ | ------------------ | ----------------------------------------------- |
| `cache.set_.sadd`        | key, members | `number`           | `await cache.set_.sadd('roles', 'editor')`      |
| `cache.set_.srem`        | key, members | `number`           | `await cache.set_.srem('roles', 'editor')`      |
| `cache.set_.smembers`    | key          | `T[]`              | `await cache.set_.smembers('roles')`            |
| `cache.set_.sismember`   | key, member  | `boolean`          | `await cache.set_.sismember('roles', 'editor')` |
| `cache.set_.scard`       | key          | `number`           | `await cache.set_.scard('roles')`               |
| `cache.set_.srandmember` | key, count   | `T \| T[] \| null` | `await cache.set_.srandmember('roles', 2)`      |
| `cache.set_.spop`        | key, count   | `T \| T[] \| null` | `await cache.set_.spop('roles', 1)`             |
| `cache.set_.sinter`      | keys         | `T[]`              | `await cache.set_.sinter('roles:a', 'roles:b')` |
| `cache.set_.sunion`      | keys         | `T[]`              | `await cache.set_.sunion('roles:a', 'roles:b')` |
| `cache.set_.sdiff`       | keys         | `T[]`              | `await cache.set_.sdiff('roles:a', 'roles:b')`  |

#### cache.zset

排行榜输入成员及 score、排序范围或分数范围；新增/删除返回数量，score/rank 返回数字/null，range 返回成员或带分数对象数组，incrBy 返回新分数，card/count 返回数量。

| 入口                          | 输入参数                     | 成功结果                | 调用示例                                                                  |
| ----------------------------- | ---------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| `cache.zset.zadd`             | key, members                 | `number`                | `await cache.zset.zadd('scores', { member: 'u1', score: 10 })`            |
| `cache.zset.zrem`             | key, members                 | `number`                | `await cache.zset.zrem('scores', 'u1')`                                   |
| `cache.zset.zscore`           | key, member                  | `number \| null`        | `await cache.zset.zscore('scores', 'u1')`                                 |
| `cache.zset.zrank`            | key, member                  | `number \| null`        | `await cache.zset.zrank('scores', 'u1')`                                  |
| `cache.zset.zrevrank`         | key, member                  | `number \| null`        | `await cache.zset.zrevrank('scores', 'u1')`                               |
| `cache.zset.zrange`           | key, start, stop, withScores | `string[] \| ZMember[]` | `await cache.zset.zrange('scores', 0, 9, true)`                           |
| `cache.zset.zrevrange`        | key, start, stop, withScores | `string[] \| ZMember[]` | `await cache.zset.zrevrange('scores', 0, 9, true)`                        |
| `cache.zset.zrangeByScore`    | key, min, max, options       | `string[] \| ZMember[]` | `await cache.zset.zrangeByScore('scores', 10, 100, { withScores: true })` |
| `cache.zset.zcard`            | key                          | `number`                | `await cache.zset.zcard('scores')`                                        |
| `cache.zset.zcount`           | key, min, max                | `number`                | `await cache.zset.zcount('scores', 10, 100)`                              |
| `cache.zset.zincrBy`          | key, increment, member       | `number`                | `await cache.zset.zincrBy('scores', 5, 'u1')`                             |
| `cache.zset.zremRangeByRank`  | key, start, stop             | `number`                | `await cache.zset.zremRangeByRank('scores', 0, 9)`                        |
| `cache.zset.zremRangeByScore` | key, min, max                | `number`                | `await cache.zset.zremRangeByScore('scores', 0, 10)`                      |

#### cache.lock

短期互斥。acquire 输入键/TTL 返回 owner 或 null；release/extend 必须传 owner，返回 boolean；isLocked 仅观察占用。锁不替代业务存储的 CAS。

| 入口                  | 输入参数        | 成功结果         | 调用示例                                         |
| --------------------- | --------------- | ---------------- | ------------------------------------------------ |
| `cache.lock.acquire`  | key, options    | `string \| null` | `await cache.lock.acquire('daily', { ttl: 30 })` |
| `cache.lock.release`  | key, owner      | `boolean`        | `await cache.lock.release('daily', owner)`       |
| `cache.lock.isLocked` | key             | `boolean`        | `await cache.lock.isLocked('daily')`             |
| `cache.lock.extend`   | key, ttl, owner | `boolean`        | `await cache.lock.extend('daily', 60, owner)`    |

#### cache

健康检查，无参数；返回后端响应字符串，连接故障为失败。

| 入口         | 输入参数 | 成功结果 | 调用示例             |
| ------------ | -------- | -------- | -------------------- |
| `cache.ping` | 无参数   | `string` | `await cache.ping()` |

- 开发/测试场景下的内存缓存
- 生产环境 Redis 缓存（单机、URL、集群、哨兵）
- IAM 会话与权限相关的集合缓存
- 分布式锁（多节点部署互斥控制）

### API 概览

- `cache.kv`: 字符串/对象键值与 TTL（`set/get/mget/mset/expire/ttl/...`）
- `cache.hash`: 哈希结构（`hset/hget/hgetall/...`）
- `cache.list`: 列表结构（`lpush/rpush/lpop/rpop/...`）
- `cache.set_`: 集合结构（`sadd/smembers/sismember/...`）
- `cache.zset`: 有序集合（`zadd/zrange/zrevrange/...`）
- `cache.lock`: 分布式锁（`acquire/release/isLocked/extend`）

`kv.set` 返回 `HaiResult<boolean>`：`data=true` 表示实际写入，NX/XX 未命中返回 `success=true,data=false` 且不改变原值或 TTL。签发票据、会话或登记公钥前必须检查这两个字段。`ex/px/exat/pxat` 分别使用秒、毫秒、Unix 秒、Unix 毫秒，须为正安全整数且只能指定一种，与 `keepTtl=true` 互斥；`nx/xx` 也互斥。零、负数、小数、非有限值或溢出返回 `INVALID_SET_OPTIONS`（`cache:016`），不会写成永久键。过去的正绝对时间表示立即过期。省略期限会移除原 TTL；`keepTtl` 保留已有 TTL，新键仍永久保存。memory 和 Redis 都保存 JSON 快照。

compareAndSwap 对一个 key 原子比较 JSON 值并替换/删除，返回 boolean applied；expected=undefined 表示不存在，value=undefined 表示删除，null 是实际 JSON 值。px 必须为正整数且与 keepTtl 互斥，省略过期策略会持久保存；比较失败不改 TTL。可用于跨节点版本提交，不能把进程锁当作提交条件。

### Cluster 多键与扫描

`mget/del/exists` 支持跨 slot，按独立 key 有界执行，mget 保留输入顺序；不提供跨 slot 的原子性或快照。DEL 失败可能已有部分键被删除，重试幂等。`mset`、集合交/并/差和多键阻塞弹出要求同 slot；用共同的 `{hash-tag}` 分组，否则返回 `CROSS_SLOT`，MSET 不进行部分写入。

`scan` 首次传字符串 `'0'`，返回不透明字符串游标，可在配置和拓扑一致的不同应用节点继续。Cluster 遍历全部主节点；拓扑、match 或 keyPrefix 变化返回 `SCAN_TOPOLOGY_CHANGED`，调用方从 `'0'` 重新遍历。返回 key 已去除 keyPrefix，前缀中的 glob 字符按字面量匹配；`keys` 也遵循此规则并去重。SCAN 无快照，允许重复项，count 是正整数提示值，不保证返回条数。无效游标/count 返回 `INVALID_SCAN`。

```ts
let cursor = '0'
do {
  const page = await cache.kv.scan(cursor, { match: 'users:*', count: 100 })
  if (!page.success)
    throw new Error(page.error.message)
  cursor = page.data[0]
  await consume(page.data[1])
} while (cursor !== '0')
```

### 分布式锁

基于 SET NX EX 模式实现的分布式互斥锁，适用于多节点部署场景。

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

- **Memory 后端**：基于 Map + TTL 过期机制
- **Redis 后端**：使用 `SET NX EX` 原子获锁，Lua 脚本实现 owner 验证的安全释放/续期
- `acquire` 返回本次获锁的唯一凭据，锁占用时为 `null`；释放/续租必须传回该凭据，禁止使用节点 ID 或无凭据强制操作。

续期和释放锁时，`owner` 用于证明调用者持有这把锁。持锁进程暂停或锁已过期时，旧任务仍可能继续执行。要防止旧任务覆盖新结果，在最终写入数据时再检查记录版本，或使用数据库事务加上对应写入条件。

### 生产共享状态

生产仅使用 Redis（含 Cluster）；memory 只用于开发/明确测试。Redis 故障返回失败，不回退本机缓存。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化发布成功前校验；仅 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试可豁免。 [状态、并发和恢复边界](../../../.agents/instructions/distributed-state.md).

## 错误处理

收到 `HaiResult<T>` 时先检查 `result.success`。成功时读取 `result.data`，失败时查看 `result.error`。记录故障时保留错误码和追踪编号，便于从日志找到对应请求。

缓存读写和锁操作返回 `HaiResult<T>`，配置和就绪状态等属性可直接读取。常用错误码如下。

| 错误码                                 | code            | 说明             |
| -------------------------------------- | --------------- | ---------------- |
| `HaiCacheError.CONNECTION_FAILED`      | `hai:cache:001` | 连接失败         |
| `HaiCacheError.OPERATION_FAILED`       | `hai:cache:002` | 操作失败         |
| `HaiCacheError.SERIALIZATION_FAILED`   | `hai:cache:003` | 序列化失败       |
| `HaiCacheError.DESERIALIZATION_FAILED` | `hai:cache:004` | 反序列化失败     |
| `HaiCacheError.KEY_NOT_FOUND`          | `hai:cache:005` | 键不存在         |
| `HaiCacheError.TIMEOUT`                | `hai:cache:006` | 超时             |
| `HaiCacheError.NOT_INITIALIZED`        | `hai:cache:010` | 未初始化         |
| `HaiCacheError.UNSUPPORTED_TYPE`       | `hai:cache:011` | 不支持的缓存类型 |
| `HaiCacheError.CONFIG_ERROR`           | `hai:cache:012` | 配置错误         |
