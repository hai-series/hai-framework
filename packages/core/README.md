# @h-ai/core

> hai Agent Framework 核心模块 — 提供统一的基础工具、类型定义、配置管理和日志功能。

## 支持的能力

- **Result 类型** — 函数式错误处理（`ok` / `err`）
- **统一日志** — Node.js 基于 pino，浏览器基于 loglevel，API 一致
- **配置管理** — YAML 配置加载、Zod 校验、文件监听（仅 Node.js）
- **ID 生成** — nanoid / UUID v4
- **i18n** — 集中式 locale 管理 + 消息获取器
- **工具函数** — 类型检查、对象 / 字符串 / 数组 / 异步 / 时间操作

## 快速开始

### Node.js 服务端

```typescript
import { core } from '@h-ai/core'

// 初始化（可选，加载配置目录）
core.init({ configDir: './config' })

// 日志
core.logger.info('App started')

// ID 生成
const id = core.id.generate()

// 工具函数
core.object.deepMerge({ a: 1 }, { b: 2 })
core.string.capitalize('hello')
core.array.unique([1, 1, 2])
await core.async.delay(100)
core.time.formatDate(new Date())
```

### 浏览器端

```typescript
import { core } from '@h-ai/core'

core.init({ logging: { level: 'debug' } })
core.logger.info('browser ready')
const id = core.id.generate()
```

## 配置

### Node.js 配置加载

```typescript
import { core, CoreConfigSchema } from '@h-ai/core'
import { z } from 'zod'

// 方式 1：通过 init 自动加载配置目录
core.init({ configDir: './config', watchConfig: true })

// 方式 2：手动加载
const AppSchema = z.object({ name: z.string() })
core.config.load('app', './config/app.yml', AppSchema)

// 校验已加载的配置（模块使用 configDir 自动加载的配置前，需显式校验）
core.config.validate('app', AppSchema)

// 监听变更
const unwatch = core.config.watch('app', (newConfig, error) => {
  if (error)
    return core.logger.error('Reload failed', { error })
  core.logger.info('Config reloaded')
})
unwatch()
```

### 浏览器配置

浏览器不支持 `core.config`，其余功能与 Node.js 一致。

## 错误处理

```typescript
import type { Result } from '@h-ai/core'
import { err, ok } from '@h-ai/core'

function divide(a: number, b: number): Result<number, string> {
  if (b === 0)
    return err('Division by zero')
  return ok(a / b)
}
```

## 测试

```bash
pnpm --filter @h-ai/core test
```

## License

Apache-2.0
