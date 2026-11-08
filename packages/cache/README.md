# @h-ai/cache

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

统一缓存模块，通过 `cache` 对象提供 KV / Hash / List / Set / ZSet / 分布式锁 操作，支持内存与 Redis 两种后端。

## 快速开始

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

`cache.config` 返回的是**脱敏后的配置快照**：如后续接入 Redis `password` / `url` 等凭证字段，会自动做安全处理，不应用作回写原始密钥。

## 功能

内存 KV 在到期时间点即视为失效；`incr/decr/incrBy/decrBy` 只接受安全整数数值或整数字符串，非法增量和溢出返回 `OPERATION_FAILED` 并保留原值。Hash 的 `__proto__` / `constructor` 等名称按普通字段保留，不修改返回对象原型。

Memory 的 KV、Hash、List、Set、ZSet 共用 key 命名空间。`exists/expire/expireAt/ttl/persist/keys/scan/del/type` 覆盖全部结构，期限到达后结构操作也立即视为不存在；del 按实际删除的逻辑 key 计数，错误类型的结构操作返回失败。

初始化只在健康检查成功后发布连接；失败时释放候选资源。若清理仍失败，初始化错误的 `error.ext.cleanupPending` 为 `true`。`cache.close()` 返回 `Promise<HaiResult<void>>`，等待正在进行的初始化，并合并并发关闭。开始清理后 `isInitialized` 为 `false`，配置与业务操作不再可用；清理失败仍保留资源，后续 `close()` 或 `init()` 先重试释放，成功前不会创建替代连接。调用方必须检查关闭结果。

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

### 功能输入输出

以下片段依赖本节完整初始化流程。示例中的业务值由宿主校验和授权后传入；异步领域结果先判断 success，再读取 data。表中 void 表示操作已完成且没有返回数据，null 表示不存在；同步工厂/工具直接返回表中类型。

key/keys 是业务键，field/fields 是哈希字段，value/members 为 JSON 值；start/stop/index 为下标，min/max 为分数边界；seconds/ttl/timeout 为秒，timestamp 为 Unix 秒；owner 只能使用 acquire 返回值。

#### cache.kv

缓存 JSON 快照。get/mget 返回值或 null（批量保序）；set 输入期限/NX/XX，返回实际写入 boolean；mset 接收 [key,value][] 返回 void。

| 入口            | 输入参数            | 成功结果        | 调用示例                                                   |
| --------------- | ------------------- | --------------- | ---------------------------------------------------------- |
| `cache.kv.get`  | key                 | `T \| null`     | `await cache.kv.get('u:1')`                                |
| `cache.kv.set`  | key, value, options | `boolean`       | `await cache.kv.set('u:1', { name: 'Alice' }, { ex: 60 })` |
| `cache.kv.mget` | keys                | `(T \| null)[]` | `await cache.kv.mget('u:1', 'u:2')`                        |
| `cache.kv.mset` | entries             | `void`          | `await cache.kv.mset([['u:1', { name: 'Alice' }]])`        |

#### cache.kv

跨节点版本提交。key、expected、value 加期限选项原子比较后返回 applied；undefined 代表不存在/删除，比较失败不改原值或 TTL。

| 入口                      | 输入参数                      | 成功结果  | 调用示例                                         |
| ------------------------- | ----------------------------- | --------- | ------------------------------------------------ |
| `cache.kv.compareAndSwap` | key, expected, value, options | `boolean` | `await cache.kv.compareAndSwap('version', 1, 2)` |

#### cache.kv

按 key 管理全部数据结构；del/exists 输入一个或多个键，返回删除/存在数；type 输入单键返回结构类型。

| 入口              | 输入参数 | 成功结果 | 调用示例                              |
| ----------------- | -------- | -------- | ------------------------------------- |
| `cache.kv.del`    | keys     | `number` | `await cache.kv.del('u:1', 'u:2')`    |
| `cache.kv.exists` | keys     | `number` | `await cache.kv.exists('u:1', 'u:2')` |
| `cache.kv.type`   | key      | `string` | `await cache.kv.type('u:1')`          |

#### cache.kv

控制保存期限；相对秒数、Unix 秒数或键分别设置/查询/移除 TTL。修改返回 boolean，ttl 返回秒数（-1 无期限、-2 不存在）。

| 入口                | 输入参数       | 成功结果  | 调用示例                                                             |
| ------------------- | -------------- | --------- | -------------------------------------------------------------------- |
| `cache.kv.expire`   | key, seconds   | `boolean` | `await cache.kv.expire('u:1', 60)`                                   |
| `cache.kv.expireAt` | key, timestamp | `boolean` | `await cache.kv.expireAt('u:1', Math.floor(Date.now() / 1000) + 60)` |
| `cache.kv.ttl`      | key            | `number`  | `await cache.kv.ttl('u:1')`                                          |
| `cache.kv.persist`  | key            | `boolean` | `await cache.kv.persist('u:1')`                                      |

#### cache.kv

计数器输入 key 和可选整数增量，返回新安全整数；类型不符或溢出失败且不修改原值。

| 入口              | 输入参数       | 成功结果 | 调用示例                            |
| ----------------- | -------------- | -------- | ----------------------------------- |
| `cache.kv.incr`   | key            | `number` | `await cache.kv.incr('hits')`       |
| `cache.kv.incrBy` | key, increment | `number` | `await cache.kv.incrBy('hits', 2)`  |
| `cache.kv.decr`   | key            | `number` | `await cache.kv.decr('stock')`      |
| `cache.kv.decrBy` | key, decrement | `number` | `await cache.kv.decrBy('stock', 2)` |

#### cache.kv

运维遍历。keys 接收 glob 返回键数组；scan 接收不透明游标和 match/count，返回 [新游标,键数组]，不保证快照或无重复。

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

owner 只保护锁的续期与释放，不是资源 fencing token。进程暂停或租约到期后旧任务仍能继续；最终写入必须在资源存储中使用 CAS、代际条件或事务约束。续租成功或最后返回失败都不能代替提交条件。

### 生产共享状态

生产仅使用 Redis（含 Cluster）；memory 只用于开发/明确测试。Redis 故障返回失败，不回退本机缓存。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化发布成功前校验；仅 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试可豁免。 [状态、并发和恢复边界](../../.agents/instructions/distributed-state.md).

## 配置

生命周期：init 输入后端/业务配置，成功后才能使用；close 在释放借用依赖前等待完成。返回值以快速开始示例和公开签名为准。

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
    sentinels: [
      { host: 'sentinel1', port: 26379 }
    ],
    name: 'mymaster',
  },
})
```

内置后端由 `cache.init(config)` 选择 memory/redis；Provider 实现是内部契约，不提供自定义后端注册入口。

`password` 用于单机、Cluster 与 Sentinel 数据节点；Cluster 发现和重定向后的节点连接也携带密码。配置 `url` 时采用 URL 自身的认证信息，独立 password 字段不覆盖它。

配置由宿主加载和校验，再传入本模块；私密值放服务端私有环境，不传到浏览器。按实际使用场景逐项选择后端、容量、期限和日志策略，修改后重新初始化并核验成功结果。

[逐项配置说明、适用场景和示例](../../docs/usage/configuration/data.md).

## 错误处理

领域操作先判断 `result.success`，失败按本模块错误定义与安全提示处理，服务端保留错误码、关联编号和脱敏原因。同步工具、工厂、流迭代及生命周期按各自签名处理，不把 Promise 完成视为业务成功。具体失败与恢复边界见对应功能。

所有操作返回 `HaiResult<T>`，常用错误码如下：

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

## 开发测试

```bash
pnpm --filter @h-ai/cache test
```

> Redis 相关测试需要 Docker 环境。

公开契约与内部结构均提供可类型检查的示例；见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## 许可证

Apache-2.0
