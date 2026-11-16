# @h-ai/cache

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

A unified cache module. The `cache` object provides KV / Hash / List / Set / ZSet / distributed lock operations with Memory and Redis backends.

## Quick Start

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

`cache.config` returns a **redacted configuration snapshot**. Redis credential fields such as `password` / `url` are sanitized automatically; do not use the snapshot to write back original secrets.

## Configuration Reference

Generated projects define the backend type and Redis connection settings in `config/_cache.yml`. At startup, the application reads the file and passes the settings object to `cache.init(config)`.

See the [configuration reference](../../docs/usage/configuration/cache.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/cache.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `cache.init` / `cache.close` / `cache.config` / `cache.isInitialized` / `cache.ping` — Manage connections and check availability
- `cache.kv` / `cache.hash` / `cache.list` / `cache.set_` / `cache.zset` — Work with key-value data, hashes, lists, sets and sorted sets
- `cache.lock` — Coordinate exclusive work with expiring locks

## Data Structures

See the [data reference](../../docs/usage/data/cache.md) in Chinese for Redis and memory value types, keys, TTL and lock ownership.

## Development and Testing

```bash
pnpm --filter @h-ai/cache test
```

> Redis tests require Docker.

Public contracts and internal structures include typechecked examples; see the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## License

Apache-2.0
