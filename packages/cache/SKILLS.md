# @hai/cache - AI 助手参考

## 模块概述

`@hai/cache` 提供统一的缓存访问能力，支持 Memory / Redis，统一异步 API 与统一错误码。架构为**无子功能 + 有 Provider（模块级）**。

## 入口与初始化

```ts
import type { CacheConfig, CacheConfigInput, CacheError, CacheFunctions } from '@hai/cache'
import { cache, CacheErrorCode } from '@hai/cache'

// 初始化
await cache.init({ type: 'redis', host: 'localhost', port: 6379 })

// 状态
cache.isInitialized // boolean
cache.config // CacheConfig | null

// 关闭
await cache.close()
```

## 目录结构

```
packages/cache/
  package.json
  README.md
  SKILLS.md
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
  messages/
    en-US.json
    zh-CN.json
  src/
    index.ts                          # 唯一入口，仅做 export * 聚合
    cache-main.ts                     # 服务对象（export const cache）
    cache-types.ts                    # 公共类型
    cache-config.ts                   # 错误码 + Zod Schema（discriminatedUnion）+ 配置类型
    cache-i18n.ts                     # i18n 消息获取器
    providers/                        # Provider 实现目录
      cache-provider-memory.ts        # Memory Provider
      cache-provider-redis.ts         # Redis Provider
  tests/
```

## 配置说明

### CacheConfigInput（cache.init 参数，判别联合体 discriminatedUnion）

配置按 `type` 字段区分：

#### Memory

| 字段   | 类型       | 默认值 | 说明     |
| ------ | ---------- | ------ | -------- |
| `type` | `'memory'` | 必填   | 缓存类型 |

#### Redis

| 字段             | 类型                                      | 默认值        | 说明               |
| ---------------- | ----------------------------------------- | ------------- | ------------------ |
| `type`           | `'redis'`                                 | 必填          | 缓存类型           |
| `url`            | `string?`                                 | -             | 连接 URL（优先）   |
| `host`           | `string?`                                 | `'localhost'` | 主机地址           |
| `port`           | `number?`                                 | `6379`        | 端口               |
| `password`       | `string?`                                 | -             | 密码               |
| `db`             | `number?`                                 | `0`           | 数据库索引（0-15） |
| `cluster`        | `Array<{ host, port }>?`                  | -             | 集群节点列表       |
| `sentinel`       | `{ sentinels: Array<...>, name: string }` | -             | 哨兵配置           |
| `connectTimeout` | `number?`                                 | `10000`       | 连接超时（ms）     |
| `commandTimeout` | `number?`                                 | `5000`        | 命令超时（ms）     |
| `keyPrefix`      | `string?`                                 | -             | 键前缀             |
| `tls`            | `boolean?`                                | `false`       | 是否启用 TLS       |
| `maxRetries`     | `number?`                                 | `3`           | 最大重试次数       |
| `retryDelay`     | `number?`                                 | `50`          | 重试延迟（ms）     |
| `readOnly`       | `boolean?`                                | `false`       | 只读模式           |

连接优先级：`url` > `cluster` > `sentinel` > `host`。

## 操作接口

### KV（cache.kv）

| 方法       | 签名                                                           | 说明               |
| ---------- | -------------------------------------------------------------- | ------------------ |
| `get`      | `<T>(key) → Result<T \| null, CacheError>`                     | 获取值             |
| `set`      | `(key, value, options?) → Result<void, CacheError>`            | 设置值             |
| `del`      | `(...keys) → Result<number, CacheError>`                       | 删除键             |
| `exists`   | `(...keys) → Result<number, CacheError>`                       | 检查存在           |
| `expire`   | `(key, seconds) → Result<boolean, CacheError>`                 | 设置过期（秒）     |
| `expireAt` | `(key, timestamp) → Result<boolean, CacheError>`               | 设置过期时间点     |
| `ttl`      | `(key) → Result<number, CacheError>`                           | 获取剩余过期时间   |
| `persist`  | `(key) → Result<boolean, CacheError>`                          | 移除过期时间       |
| `incr`     | `(key) → Result<number, CacheError>`                           | 自增               |
| `incrBy`   | `(key, increment) → Result<number, CacheError>`                | 自增指定值         |
| `decr`     | `(key) → Result<number, CacheError>`                           | 自减               |
| `decrBy`   | `(key, decrement) → Result<number, CacheError>`                | 自减指定值         |
| `mget`     | `<T>(...keys) → Result<(T \| null)[], CacheError>`             | 批量获取           |
| `mset`     | `(entries: [string, CacheValue][]) → Result<void, CacheError>` | 批量设置           |
| `scan`     | `(cursor, options?) → Result<[number, string[]], CacheError>`  | 扫描键             |
| `keys`     | `(pattern) → Result<string[], CacheError>`                     | 获取匹配键（慎用） |
| `type`     | `(key) → Result<string, CacheError>`                           | 获取值类型         |

SetOptions：`ex`（秒）、`px`（毫秒）、`exat`、`pxat`、`nx`、`xx`、`keepTtl`。

### Hash（cache.hash）

| 方法      | 签名                                                                      | 说明       |
| --------- | ------------------------------------------------------------------------- | ---------- |
| `hget`    | `<T>(key, field) → Result<T \| null, CacheError>`                         | 获取字段   |
| `hset`    | `(key, field, value) \| (key, data: Record) → Result<number, CacheError>` | 设置字段   |
| `hdel`    | `(key, ...fields) → Result<number, CacheError>`                           | 删除字段   |
| `hexists` | `(key, field) → Result<boolean, CacheError>`                              | 字段存在   |
| `hgetall` | `<T>(key) → Result<T, CacheError>`                                        | 获取全部   |
| `hkeys`   | `(key) → Result<string[], CacheError>`                                    | 所有字段名 |
| `hvals`   | `<T>(key) → Result<T[], CacheError>`                                      | 所有字段值 |
| `hlen`    | `(key) → Result<number, CacheError>`                                      | 字段数量   |
| `hmget`   | `<T>(key, ...fields) → Result<(T \| null)[], CacheError>`                 | 批量获取   |
| `hincrBy` | `(key, field, increment) → Result<number, CacheError>`                    | 字段自增   |

### List（cache.list）

| 方法     | 签名                                                              | 说明       |
| -------- | ----------------------------------------------------------------- | ---------- |
| `lpush`  | `(key, ...values) → Result<number, CacheError>`                   | 左侧推入   |
| `rpush`  | `(key, ...values) → Result<number, CacheError>`                   | 右侧推入   |
| `lpop`   | `<T>(key) → Result<T \| null, CacheError>`                        | 左侧弹出   |
| `rpop`   | `<T>(key) → Result<T \| null, CacheError>`                        | 右侧弹出   |
| `llen`   | `(key) → Result<number, CacheError>`                              | 列表长度   |
| `lrange` | `<T>(key, start, stop) → Result<T[], CacheError>`                 | 获取范围   |
| `lindex` | `<T>(key, index) → Result<T \| null, CacheError>`                 | 按索引获取 |
| `lset`   | `(key, index, value) → Result<void, CacheError>`                  | 按索引设置 |
| `ltrim`  | `(key, start, stop) → Result<void, CacheError>`                   | 保留范围   |
| `blpop`  | `<T>(timeout, ...keys) → Result<[string, T] \| null, CacheError>` | 阻塞左弹出 |
| `brpop`  | `<T>(timeout, ...keys) → Result<[string, T] \| null, CacheError>` | 阻塞右弹出 |

### Set（cache.set\_）

| 方法          | 签名                                                      | 说明     |
| ------------- | --------------------------------------------------------- | -------- |
| `sadd`        | `(key, ...members) → Result<number, CacheError>`          | 添加     |
| `srem`        | `(key, ...members) → Result<number, CacheError>`          | 移除     |
| `smembers`    | `<T>(key) → Result<T[], CacheError>`                      | 所有成员 |
| `sismember`   | `(key, member) → Result<boolean, CacheError>`             | 是否成员 |
| `scard`       | `(key) → Result<number, CacheError>`                      | 成员数量 |
| `srandmember` | `<T>(key, count?) → Result<T \| T[] \| null, CacheError>` | 随机获取 |
| `spop`        | `<T>(key, count?) → Result<T \| T[] \| null, CacheError>` | 随机弹出 |
| `sinter`      | `<T>(...keys) → Result<T[], CacheError>`                  | 交集     |
| `sunion`      | `<T>(...keys) → Result<T[], CacheError>`                  | 并集     |
| `sdiff`       | `<T>(...keys) → Result<T[], CacheError>`                  | 差集     |

### SortedSet（cache.zset）

| 方法               | 签名                                                                          | 说明         |
| ------------------ | ----------------------------------------------------------------------------- | ------------ |
| `zadd`             | `(key, ...members: ZMember[]) → Result<number, CacheError>`                   | 添加成员     |
| `zrem`             | `(key, ...members) → Result<number, CacheError>`                              | 移除成员     |
| `zscore`           | `(key, member) → Result<number \| null, CacheError>`                          | 获取分数     |
| `zrank`            | `(key, member) → Result<number \| null, CacheError>`                          | 排名（升序） |
| `zrevrank`         | `(key, member) → Result<number \| null, CacheError>`                          | 排名（降序） |
| `zrange`           | `(key, start, stop, withScores?) → Result<string[] \| ZMember[], CacheError>` | 范围（升序） |
| `zrevrange`        | `(key, start, stop, withScores?) → Result<string[] \| ZMember[], CacheError>` | 范围（降序） |
| `zrangeByScore`    | `(key, min, max, options?) → Result<string[] \| ZMember[], CacheError>`       | 按分数范围   |
| `zcard`            | `(key) → Result<number, CacheError>`                                          | 成员数量     |
| `zcount`           | `(key, min, max) → Result<number, CacheError>`                                | 分数范围计数 |
| `zincrBy`          | `(key, increment, member) → Result<number, CacheError>`                       | 增加分数     |
| `zremRangeByRank`  | `(key, start, stop) → Result<number, CacheError>`                             | 按排名删除   |
| `zremRangeByScore` | `(key, min, max) → Result<number, CacheError>`                                | 按分数删除   |

### ping

```ts
cache.ping() // → Promise<Result<string, CacheError>>
```

## 错误码

| 名称                     | 数值 | 含义             |
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

## 注意事项

- 所有操作异步，需 `await`
- `cache.init` 未调用时，所有子接口（kv / hash / list / set\_ / zset / ping）返回 `NOT_INITIALIZED`
- 基础 KV 操作通过 `cache.kv.*` 访问，不是 `cache.*`
- 对象会自动 JSON 序列化/反序列化，字符串直接存储
- Memory Provider 仅用于开发/测试，不支持跨进程
- Redis 连接优先级：`url` > `cluster` > `sentinel` > `host`
- 应用退出前应调用 `cache.close()` 释放连接
