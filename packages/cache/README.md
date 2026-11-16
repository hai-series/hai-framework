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

## 配置清单

生成的项目在 `config/_cache.yml` 中设置后端类型和 Redis 连接参数。应用启动代码读取该文件，把配置对象传给 `cache.init(config)`。

在[模块配置清单](../../docs/usage/configuration/cache.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/cache.md)中查看调用示例、输入输出、错误处理与使用要点。

- `cache.init` / `cache.close` / `cache.config` / `cache.isInitialized` / `cache.ping` — 管理连接并检查可用性
- `cache.kv` / `cache.hash` / `cache.list` / `cache.set_` / `cache.zset` — 操作键值、散列、列表、集合与有序集合
- `cache.lock` — 用带有效期的锁协调互斥操作

## 数据结构

查看[数据结构](../../docs/usage/data/cache.md)，了解Redis/内存的数据类型、键、TTL 和锁所有者。

## 开发测试

```bash
pnpm --filter @h-ai/cache test
```

> Redis 相关测试需要 Docker 环境。

公开契约与内部结构均提供可类型检查的示例；见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## 许可证

Apache-2.0
