# @h-ai/cache 功能说明

[English](cache.en.md) · [日本語](cache.ja.md)

通过 `cache` 使用进程内缓存或 Redis，保存键值、列表和集合。多个进程可借助共享 Redis 获取同一把有时效的锁。先检查 `cache.init()` 成功，再读写数据或获取锁。

[模块 README](../../../packages/cache/README.md) · [配置清单](../configuration/cache.md) · [数据结构](../data/cache.md) · [数据服务接入](../development/data.md)

<a id="quick-start"></a>

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

<a id="api-reference"></a>

## 功能说明

下面的场景代码从本页最小接入中导入模块；除连接/关闭场景外，均在初始化成功后、关闭前运行。`value` 先检查 `HaiResult.success`，失败保留原错误，成功返回 data；只用于读取结果。各场景使用独立测试数据，不能把相邻片段当成无需清理的生产脚本。

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="connection"></a>

### 连接与关闭：`cache`

应用启动时选择后端，健康检查通过后再读写；停机时先关闭借用缓存的模块，再关闭 Cache。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `cache.init` | 按配置创建进程内缓存或连接 Redis | `config`（必填） | `Promise<HaiResult<void>>` | `await cache.init({ type: 'memory' })` |
| `cache.close` | 释放缓存实例。用内存模式时，关闭后该实例中的值不再可用 | 无 | `Promise<HaiResult<void>>` | `await cache.close()` |
| `cache.ping` | 检查后端连接 | 无参数 | `string` | `await cache.ping()` |
| `cache.config` | 读取当前脱敏配置 | 只读属性，无参数 | `CacheConfig \| null` | `cache.config` |
| `cache.isInitialized` | 检查缓存能否接收操作 | 只读属性，无参数 | `boolean` | `cache.isInitialized` |

#### 场景：连接与关闭

```ts
value(await cache.init({ type: 'memory' }))
value(await cache.ping()) // 'PONG'
cache.isInitialized // true
cache.config?.type // 'memory'
value(await cache.close()) // undefined; the memory instance is released
```

输入为开发环境的 memory 配置。成功后 ping 得到 `PONG`，close 成功没有业务数据；关闭后的内存记录不再可用。其他示例各自重新初始化。

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

初始化成功后才能调用业务方法。应用代码在调用前准备实际的业务参数，校验输入和权限。收到 `HaiResult` 时先检查 `success`，成功时读 `data`，失败时读 `error`。成功结果为 `void` 时没有业务数据。返回 `null` 时表示没有找到值。

示例中的 `key` 是业务数据的键，`field` 是哈希中的字段名。列表下标用 `start`、`stop` 或 `index`，有序集合的分数范围用 `min` 和 `max`。表中 `seconds`、`ttl`、`timeout` 按秒传入，`timestamp` 是 Unix 秒数。释放或续期锁时，`owner` 使用获取锁时实际返回的值。

<a id="values"></a>

### 保存对象、计数和期限：`cache.kv`

把可序列化的数据放在有业务含义的键下；同一次比较并交换用于防止覆盖别人刚写的新值。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `cache.kv.get` | 读取一个缓存值 | key | `T \| null` | `await cache.kv.get('u:1')` |
| `cache.kv.set` | 写入值并设置期限或写入条件 | key, value, options | `boolean` | `await cache.kv.set('u:1', { name: 'Alice' }, { ex: 60 })` |
| `cache.kv.mget` | 按输入顺序批量读取 | keys | `(T \| null)[]` | `await cache.kv.mget('u:1', 'u:2')` |
| `cache.kv.mset` | 批量写入键值 | entries | `void` | `await cache.kv.mset([['u:1', { name: 'Alice' }]])` |
| `cache.kv.compareAndSwap` | 仅当原值符合预期时修改 | key, expected, value, options | `boolean` | `await cache.kv.compareAndSwap('version', 1, 2)` |
| `cache.kv.del` | 删除指定键 | keys | `number` | `await cache.kv.del('u:1', 'u:2')` |
| `cache.kv.exists` | 统计指定键中仍存在的数量 | keys | `number` | `await cache.kv.exists('u:1', 'u:2')` |
| `cache.kv.type` | 查询键保存的数据类型 | key | `string` | `await cache.kv.type('u:1')` |
| `cache.kv.expire` | 设置相对到期秒数 | key, seconds | `boolean` | `await cache.kv.expire('u:1', 60)` |
| `cache.kv.expireAt` | 设置绝对到期时间 | key, timestamp | `boolean` | `await cache.kv.expireAt('u:1', Math.floor(Date.now() / 1000) + 60)` |
| `cache.kv.ttl` | 读取剩余有效秒数 | key | `number` | `await cache.kv.ttl('u:1')` |
| `cache.kv.persist` | 移除过期时间 | key | `boolean` | `await cache.kv.persist('u:1')` |
| `cache.kv.incr` | 计数加一 | key | `number` | `await cache.kv.incr('hits')` |
| `cache.kv.incrBy` | 按增量增加计数 | key, increment | `number` | `await cache.kv.incrBy('hits', 2)` |
| `cache.kv.decr` | 计数减一 | key | `number` | `await cache.kv.decr('stock')` |
| `cache.kv.decrBy` | 按减量减少计数 | key, decrement | `number` | `await cache.kv.decrBy('stock', 2)` |
| `cache.kv.keys` | 列出符合模式的键 | pattern | `string[]` | `await cache.kv.keys('u:*')` |
| `cache.kv.scan` | 分批扫描符合模式的键 | cursor, options | `[string, string[]]` | `await cache.kv.scan('0', { match: 'u:*', count: 100 })` |

#### 场景：保存对象、计数和期限

“先 get，再 set”之间可能插入另一节点的写入。compareAndSwap 把比较和修改合成一次操作，避免覆盖刚更新的值。

![compareAndSwap：比较和修改必须同时发生](../images/function-cache-cas.svg)

若当前值为 1，expected=1、value=2 会成功；另一节点已改成 2 时，同样的提交返回 false，并保留当前值和 TTL。存储不可用则返回失败 HaiResult，不能把 false 和存储失败混为一谈。expected=undefined 表示仅在不存在时创建。

```ts
value(await cache.kv.set('demo:user:1', { name: 'Ada' }, { ex: 60 })) // true
value(await cache.kv.get('demo:user:1')) // { name: 'Ada' }
value(await cache.kv.mset([['demo:user:2', { name: 'Lin' }]])) // undefined
value(await cache.kv.mget('demo:user:1', 'demo:user:2')) // [{ name: 'Ada' }, { name: 'Lin' }]
value(await cache.kv.compareAndSwap('demo:revision', undefined, 1, { px: 60_000 })) // true
value(await cache.kv.compareAndSwap('demo:revision', 0, 2)) // false; revision stays 1
value(await cache.kv.exists('demo:user:1', 'demo:missing')) // 1
value(await cache.kv.type('demo:user:1')) // 'string' (JSON value)
value(await cache.kv.expire('demo:user:1', 120)) // true
value(await cache.kv.expireAt('demo:user:2', Math.floor(Date.now() / 1000) + 120)) // true
value(await cache.kv.ttl('demo:user:1')) // about 120 seconds
value(await cache.kv.persist('demo:user:1')) // true
value(await cache.kv.ttl('demo:user:1')) // -1
value(await cache.kv.incr('demo:hits')) // 1
value(await cache.kv.incrBy('demo:hits', 4)) // 5
value(await cache.kv.decr('demo:hits')) // 4
value(await cache.kv.decrBy('demo:hits', 2)) // 2
value(await cache.kv.keys('demo:user:*')) // the two user keys, order is backend-dependent
let cursor = '0'
do {
  const page = value(await cache.kv.scan(cursor, { match: 'demo:user:*', count: 100 }))
  cursor = page[0] // use the returned cursor, not a page number
  const keys = page[1] // a batch of matching keys; duplicates are possible
} while (cursor !== '0')
value(await cache.kv.del('demo:user:1', 'demo:user:2')) // 2
value(await cache.kv.get('demo:user:1')) // null
```

输入使用全新的 `demo:*` 键；示例按顺序执行且没有其他写入者。CAS 比较失败的 `false` 是成功返回的数据。TTL 为剩余秒数，`-1` 表示永久、`-2` 表示不存在。扫描批次大小只是提示，不能假定一页读完或没有重复。

#### 写入条件与到期规则

用 `cache.kv.set()` 保存可序列化为 JSON 的值。留下过期时间后，过期的键读出为 `null`。批量读取按传入的键顺序返回。设置 `nx` 仅在键不存在时写入，设置 `xx` 仅在键已存在时写入，返回布尔值表示是否写入。

#### 场景：避免覆盖别人刚写的新值

用 `cache.kv.compareAndSwap()` 在同一次操作中比较现有值并写入新值。传 `expected: undefined` 表示只有键不存在时才应用新值，传 `value: undefined` 表示删除键。比较失败时返回 `false`，原值和有效期都保留。

#### 场景：在 Redis Cluster 批量操作与续页扫描

`mget/del/exists` 支持跨 slot，按独立 key 有界执行，mget 保留输入顺序；不提供跨 slot 的原子性或快照。DEL 失败可能已有部分键被删除，重试幂等。`mset`、集合交/并/差和多键阻塞弹出要求同 slot；用共同的 `{hash-tag}` 分组，否则返回 `CROSS_SLOT`，MSET 不进行部分写入。

`scan` 首次传字符串 `'0'`，返回不透明字符串游标，可在配置和拓扑一致的不同应用节点继续。Cluster 遍历全部主节点；拓扑、match 或 keyPrefix 变化返回 `SCAN_TOPOLOGY_CHANGED`，调用方从 `'0'` 重新遍历。返回 key 已去除 keyPrefix，前缀中的 glob 字符按字面量匹配；`keys` 也遵循此规则并去重。SCAN 无快照，允许重复项，count 是正整数提示值，不保证返回条数。无效游标/count 返回 `INVALID_SCAN`。


<a id="hashes"></a>

### 按字段更新资料：`cache.hash`

只修改对象中的一个字段时使用 Hash，避免整份对象读回再覆盖。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `cache.hash.hget` | 读取单个字段 | key, field | `T \| null` | `await cache.hash.hget('u:1', 'name')` |
| `cache.hash.hset` | 写入单个字段 | key, field, value | `number` | `await cache.hash.hset('u:1', 'name', 'Alice')` |
| `cache.hash.hdel` | 删除指定字段 | key, fields | `number` | `await cache.hash.hdel('u:1', 'name')` |
| `cache.hash.hexists` | 检查字段是否存在 | key, field | `boolean` | `await cache.hash.hexists('u:1', 'name')` |
| `cache.hash.hgetall` | 读取全部字段和值 | key | `T` | `await cache.hash.hgetall('u:1')` |
| `cache.hash.hkeys` | 列出字段名 | key | `string[]` | `await cache.hash.hkeys('u:1')` |
| `cache.hash.hvals` | 列出字段值 | key | `T[]` | `await cache.hash.hvals('u:1')` |
| `cache.hash.hlen` | 统计字段数量 | key | `number` | `await cache.hash.hlen('u:1')` |
| `cache.hash.hmget` | 按输入顺序读取多个字段 | key, fields | `(T \| null)[]` | `await cache.hash.hmget('u:1', 'name', 'age')` |
| `cache.hash.hincrBy` | 增加字段计数 | key, field, increment | `number` | `await cache.hash.hincrBy('u:1', 'visits', 1)` |

#### 场景：按字段更新资料

```ts
value(await cache.hash.hset('demo:profile', 'name', 'Ada')) // 1 new field
value(await cache.hash.hget('demo:profile', 'name')) // 'Ada'
value(await cache.hash.hexists('demo:profile', 'name')) // true
value(await cache.hash.hincrBy('demo:profile', 'visits', 1)) // 1
value(await cache.hash.hmget('demo:profile', 'name', 'missing')) // ['Ada', null]
value(await cache.hash.hgetall('demo:profile')) // { name: 'Ada', visits: 1 }
value(await cache.hash.hkeys('demo:profile')) // 'name' and 'visits'; order may vary
value(await cache.hash.hvals('demo:profile')) // 'Ada' and 1; order may vary
value(await cache.hash.hlen('demo:profile')) // 2
value(await cache.hash.hdel('demo:profile', 'name')) // 1
```

输入为资料键及两个字段。新增字段数、命中布尔值与读取结果分别写在调用后；不存在的字段读出为 null。

<a id="lists"></a>

### 排队与顺序读取：`cache.list`

列表保留顺序，可从两端放入或取走数据；阻塞弹出会等到有值或超时。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `cache.list.lpush` | 从左端插入 | key, values | `number` | `await cache.list.lpush('jobs', 'job-1')` |
| `cache.list.rpush` | 从右端插入 | key, values | `number` | `await cache.list.rpush('jobs', 'job-2')` |
| `cache.list.lpop` | 取走左端元素 | key | `T \| null` | `await cache.list.lpop('jobs')` |
| `cache.list.rpop` | 取走右端元素 | key | `T \| null` | `await cache.list.rpop('jobs')` |
| `cache.list.llen` | 读取列表长度 | key | `number` | `await cache.list.llen('jobs')` |
| `cache.list.lrange` | 读取包含端点的索引区间 | key, start, stop | `T[]` | `await cache.list.lrange('jobs', 0, 9)` |
| `cache.list.lindex` | 按索引读取一个元素 | key, index | `T \| null` | `await cache.list.lindex('jobs', 0)` |
| `cache.list.lset` | 替换指定索引的元素 | key, index, value | `void` | `await cache.list.lset('jobs', 0, 'replacement')` |
| `cache.list.ltrim` | 只保留指定索引区间 | key, start, stop | `void` | `await cache.list.ltrim('jobs', 0, 99)` |
| `cache.list.blpop` | 等待并取走左端元素 | timeout, keys | `[string, T] \| null` | `await cache.list.blpop(5, 'jobs')` |
| `cache.list.brpop` | 等待并取走右端元素 | timeout, keys | `[string, T] \| null` | `await cache.list.brpop(5, 'jobs')` |

#### 场景：排队与顺序读取

```ts
value(await cache.list.rpush('demo:jobs', 'b', 'c')) // 2
value(await cache.list.lpush('demo:jobs', 'a')) // 3
value(await cache.list.llen('demo:jobs')) // 3
value(await cache.list.lrange('demo:jobs', 0, -1)) // ['a', 'b', 'c']
value(await cache.list.lindex('demo:jobs', 1)) // 'b'
value(await cache.list.lset('demo:jobs', 1, 'B')) // undefined
value(await cache.list.ltrim('demo:jobs', 0, 1)) // undefined; ['a', 'B'] remains
value(await cache.list.lpop('demo:jobs')) // 'a'
value(await cache.list.rpop('demo:jobs')) // 'B'
value(await cache.list.rpush('demo:jobs', 'd', 'e')) // 2
value(await cache.list.blpop(1, 'demo:jobs')) // ['demo:jobs', 'd']
value(await cache.list.brpop(1, 'demo:jobs')) // ['demo:jobs', 'e']
value(await cache.list.lpop('demo:jobs')) // null
```

本例从空列表开始，区间 stop 包含端点，`-1` 指末项。两个阻塞调用已有待取值，所以立即返回键和值；队列为空时等待指定秒数，超时成功返回 null。

<a id="sets"></a>

### 去重与集合比较：`cache.set_`

需要判断成员是否存在、合并成员或比较两组成员时使用集合，集合没有排列顺序。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `cache.set_.sadd` | 添加去重成员 | key, members | `number` | `await cache.set_.sadd('roles', 'editor')` |
| `cache.set_.srem` | 移除指定成员 | key, members | `number` | `await cache.set_.srem('roles', 'editor')` |
| `cache.set_.smembers` | 读取全部成员 | key | `T[]` | `await cache.set_.smembers('roles')` |
| `cache.set_.sismember` | 检查是否包含成员 | key, member | `boolean` | `await cache.set_.sismember('roles', 'editor')` |
| `cache.set_.scard` | 统计成员数量 | key | `number` | `await cache.set_.scard('roles')` |
| `cache.set_.srandmember` | 随机读取但不删除 | key, count | `T \| T[] \| null` | `await cache.set_.srandmember('roles', 2)` |
| `cache.set_.spop` | 随机取走成员 | key, count | `T \| T[] \| null` | `await cache.set_.spop('roles', 1)` |
| `cache.set_.sinter` | 求多个集合的交集 | keys | `T[]` | `await cache.set_.sinter('roles:a', 'roles:b')` |
| `cache.set_.sunion` | 求多个集合的并集 | keys | `T[]` | `await cache.set_.sunion('roles:a', 'roles:b')` |
| `cache.set_.sdiff` | 求首个集合相对其余集合的差集 | keys | `T[]` | `await cache.set_.sdiff('roles:a', 'roles:b')` |

#### 场景：去重与集合比较

```ts
value(await cache.set_.sadd('demo:roles:a', 'reader', 'editor')) // 2
value(await cache.set_.sadd('demo:roles:b', 'editor', 'owner')) // 2
value(await cache.set_.sismember('demo:roles:a', 'reader')) // true
value(await cache.set_.scard('demo:roles:a')) // 2
value(await cache.set_.smembers('demo:roles:a')) // reader, editor
value(await cache.set_.sinter('demo:roles:a', 'demo:roles:b')) // ['editor']
value(await cache.set_.sunion('demo:roles:a', 'demo:roles:b')) // reader, editor, owner
value(await cache.set_.sdiff('demo:roles:a', 'demo:roles:b')) // ['reader']
value(await cache.set_.srandmember('demo:roles:a', 1)) // one-member array; set unchanged
value(await cache.set_.spop('demo:roles:b', 1)) // one-member array; chosen member removed
value(await cache.set_.srem('demo:roles:a', 'reader')) // 1
```

输入是两组角色名；输出的顺序不固定。随机读取保留原集合，随机弹出会删除选中的成员，不能预设抽到哪一个。

<a id="scores"></a>

### 排行榜与分数筛选：`cache.zset`

有序集合给每个成员保存一个分数，用于排行榜和分数区间查询。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `cache.zset.zadd` | 添加成员及分数 | key, members | `number` | `await cache.zset.zadd('scores', { member: 'u1', score: 10 })` |
| `cache.zset.zrem` | 删除指定成员 | key, members | `number` | `await cache.zset.zrem('scores', 'u1')` |
| `cache.zset.zscore` | 读取成员分数 | key, member | `number \| null` | `await cache.zset.zscore('scores', 'u1')` |
| `cache.zset.zrank` | 查询从零开始的升序排名 | key, member | `number \| null` | `await cache.zset.zrank('scores', 'u1')` |
| `cache.zset.zrevrank` | 查询从零开始的降序排名 | key, member | `number \| null` | `await cache.zset.zrevrank('scores', 'u1')` |
| `cache.zset.zrange` | 按升序排名读取 | key, start, stop, withScores | `string[] \| ZMember[]` | `await cache.zset.zrange('scores', 0, 9, true)` |
| `cache.zset.zrevrange` | 按降序排名读取 | key, start, stop, withScores | `string[] \| ZMember[]` | `await cache.zset.zrevrange('scores', 0, 9, true)` |
| `cache.zset.zrangeByScore` | 按分数区间筛选 | key, min, max, options | `string[] \| ZMember[]` | `await cache.zset.zrangeByScore('scores', 10, 100, { withScores: true })` |
| `cache.zset.zcard` | 统计成员总数 | key | `number` | `await cache.zset.zcard('scores')` |
| `cache.zset.zcount` | 统计分数区间内的成员 | key, min, max | `number` | `await cache.zset.zcount('scores', 10, 100)` |
| `cache.zset.zincrBy` | 增加成员分数 | key, increment, member | `number` | `await cache.zset.zincrBy('scores', 5, 'u1')` |
| `cache.zset.zremRangeByRank` | 删除排名区间内的成员 | key, start, stop | `number` | `await cache.zset.zremRangeByRank('scores', 0, 9)` |
| `cache.zset.zremRangeByScore` | 删除分数区间内的成员 | key, min, max | `number` | `await cache.zset.zremRangeByScore('scores', 0, 10)` |

#### 场景：排行榜与分数筛选

```ts
value(await cache.zset.zadd('demo:scores', { member: 'a', score: 10 }, { member: 'b', score: 20 })) // 2
value(await cache.zset.zscore('demo:scores', 'a')) // 10
value(await cache.zset.zrank('demo:scores', 'a')) // 0
value(await cache.zset.zrevrank('demo:scores', 'a')) // 1
value(await cache.zset.zrange('demo:scores', 0, -1)) // ['a', 'b']
value(await cache.zset.zrevrange('demo:scores', 0, -1)) // ['b', 'a']
value(await cache.zset.zrangeByScore('demo:scores', 10, 20)) // ['a', 'b']
value(await cache.zset.zcard('demo:scores')) // 2
value(await cache.zset.zcount('demo:scores', 10, 15)) // 1
value(await cache.zset.zincrBy('demo:scores', 5, 'a')) // 15
value(await cache.zset.zremRangeByScore('demo:scores', 0, 14)) // 0
value(await cache.zset.zremRangeByRank('demo:scores', 0, 0)) // 1; removes a
value(await cache.zset.zrem('demo:scores', 'b')) // 1
```

输入为 a=10、b=20 的全新排行榜。排名从零开始；加分后 a=15，所以删除 0–14 分的人数是零。排名与分数删除返回实际删除数。

<a id="locks"></a>

### 短时间互斥执行：`cache.lock`

多进程共享 Redis 时，可让同名任务在租期内尽量只由一个持有者执行。最终业务提交仍要检查自己的并发条件。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `cache.lock.acquire` | 尝试取得有期限的锁 | key, options | `string \| null` | `await cache.lock.acquire('daily', { ttl: 30 })` |
| `cache.lock.release` | 凭持有者凭据释放锁 | key, owner | `boolean` | `await cache.lock.release('daily', owner)` |
| `cache.lock.isLocked` | 观察锁当前是否存在 | key | `boolean` | `await cache.lock.isLocked('daily')` |
| `cache.lock.extend` | 凭持有者凭据续期 | key, ttl, owner | `boolean` | `await cache.lock.extend('daily', 60, owner)` |

#### 场景：短时间互斥执行

```ts
const owner = value(await cache.lock.acquire('demo:daily', { ttl: 30 }))
if (owner !== null) {
  try {
    value(await cache.lock.isLocked('demo:daily')) // true while the lease is valid
    const extended = value(await cache.lock.extend('demo:daily', 60, owner))
    if (!extended)
      throw new Error('Lease lost')
  }
  finally {
    value(await cache.lock.release('demo:daily', owner)) // true only if this owner still holds it
  }
}
```

输入是任务键和秒数，成功获取返回随机 owner；null 表示本次没拿到锁。续期和释放必须用原 owner，false 表示锁已丢失或不属于该持有者。

#### 锁的后端与失效边界

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

#### 生产后端要求

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
