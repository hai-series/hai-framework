# @hai/core

> hai Admin Framework 核心模块 - 提供基础工具、类型定义、配置管理和日志功能

[![npm version](https://img.shields.io/npm/v/@hai/core.svg)](https://www.npmjs.com/package/@hai/core)
[![License](https://img.shields.io/npm/l/@hai/core.svg)](https://github.com/hai-framework/hai/blob/main/LICENSE)

## 特性

- 🛠️ **核心工具** - ID 生成、类型检查、对象/字符串/数组操作、异步工具、时间处理
- 📝 **统一日志** - Node.js 基于 pino，浏览器基于 loglevel，统一 API
- ⚙️ **配置管理** - 支持 YAML 配置文件加载、验证和监听变更（仅 Node.js）
- 📦 **Result 类型** - 函数式错误处理，避免异常驱动控制流
- 🔒 **类型安全** - 完整的 TypeScript 类型定义
- 🌐 **同构支持** - Node.js / 浏览器环境统一使用方式

## 安装

```bash
pnpm add @hai/core
```

## 快速开始（Node.js）

```typescript
import { core, CoreConfigSchema } from '@hai/core'

// 初始化（可选）
core.init({
  configDir: './config',
  watchConfig: true,
  logging: { level: 'info' },
})

// 日志
core.logger.info('应用启动', { version: '1.0.0' })

// 配置（也可手动加载）
core.config.load('core', './config/_core.yml', CoreConfigSchema)

// ID 生成
const myId = core.id.generate()
const uuid = core.id.uuid()

// 类型检查
core.typeUtils.isDefined(myId)

// 工具函数
core.object.deepMerge({ a: 1 }, { b: 2 })
core.string.capitalize('hello')
core.array.unique([1, 1, 2])
await core.async.delay(100)
core.time.formatDate(new Date())
```

## 快速开始（浏览器）

```typescript
import { core } from '@hai/core'

// 初始化（可选）
core.init({ logging: { level: 'debug' } })

core.logger.info('browser ready')
const myId = core.id.generate()
const isObj = core.typeUtils.isObject({})
```

## Result 类型

```typescript
import type { Result } from '@hai/core'
import { err, ok } from '@hai/core'

function divide(a: number, b: number): Result<number, string> {
  if (b === 0)
    return err('Division by zero')
  return ok(a / b)
}
```

## 分页类型

```typescript
import type { PaginatedResult, PaginationOptionsInput } from '@hai/core'

const options: PaginationOptionsInput = { page: 1, pageSize: 20 }

const result: PaginatedResult<string> = {
  items: ['a', 'b'],
  total: 2,
  page: 1,
  pageSize: 20,
}
```

## 配置管理（Node.js）

```typescript
import { core } from '@hai/core'
import { z } from 'zod'

const AppConfigSchema = z.object({ name: z.string() })

const result = core.config.load('app', './config/app.yml', AppConfigSchema)
if (result.success) {
  core.logger.info('App config loaded')
}

// 注意：core.init 会统一加载配置文件，但不会自动校验各模块配置。
// 模块使用前请显式校验一次。
// 注意：core.init 会使用 CoreConfigSchema 解析 _core.yml，并应用默认值。
core.config.validate('app', AppConfigSchema)

const unwatch = core.config.watch('app', (newConfig, error) => {
  if (error) {
    core.logger.error('Config reload failed', { error })
    return
  }
  core.logger.info('Config changed', { config: newConfig })
})

unwatch()
```

## i18n

```typescript
import { core } from '@hai/core'

const getMessage = core.i18n.createMessageGetter({
  'zh-CN': { hello: '你好 {name}' },
  'en-US': { hello: 'Hello {name}' },
})

core.i18n.setGlobalLocale('en-US')
getMessage('hello', { params: { name: 'World' } })
```

## 错误码 & Schema

```typescript
import { CommonErrorCode, ConfigErrorCode, CoreConfigSchema } from '@hai/core'

CommonErrorCode.UNKNOWN
ConfigErrorCode.FILE_NOT_FOUND
CoreConfigSchema.parse({ name: 'demo' })
```

## 浏览器支持

- 日志使用 `loglevel` 替代 `pino`
- 配置管理不可用（`core.config`）
- 其余功能与 Node.js 一致

## 许可证

Apache-2.0
