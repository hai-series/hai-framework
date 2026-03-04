---
name: hai-core
description: 使用 @h-ai/core 进行配置加载、日志记录、i18n 国际化、Result 错误处理与模块生命周期管理；当需求涉及 core.init、core.logger、core.config、core.i18n、ok/err 或模块初始化模式时使用。
---

# hai-core

> `@h-ai/core` 是 hai-framework 的基础模块，提供配置管理、结构化日志、国际化、Result 错误模型与模块生命周期工具。所有其他模块均依赖 core。

---

## 适用场景

- 项目初始化与配置加载
- 使用 `core.logger` 记录日志
- 使用 `core.config` 读取/校验模块配置
- 使用 `core.i18n` 管理多语言
- 使用 `ok()` / `err()` 构建 Result 类型返回值
- 创建模块级 logger 或 i18n 消息获取器

---

## 使用步骤

### 1. 初始化

```typescript
import { core } from '@h-ai/core'

// 自动加载 config/ 目录下的所有 _*.yml 和 *.yml
core.init({ configDir: './config' })

// 也可指定日志级别和配置监听
core.init({ configDir: './config', watchConfig: true })
```

### 2. 使用功能

```typescript
// 日志
core.logger.info('Server started', { port: 3000 })

// 配置
const dbConfig = core.config.get('db')
```

---

## 核心 API

### 生命周期

| 方法        | 签名                              | 说明                                      |
| ----------- | --------------------------------- | ----------------------------------------- |
| `core.init` | `(options?: CoreOptions) => void` | 初始化（同步，加载配置目录中的所有 YAML） |

> `CoreOptions`：`{ logging?: Partial<LoggingConfig>, configDir?: string, watchConfig?: boolean }`
>
> 注意：core 没有 `close()` 方法，初始化后持续可用。

### 配置管理 — `core.config`

| 方法         | 签名                                                           | 说明                           |
| ------------ | -------------------------------------------------------------- | ------------------------------ |
| `get`        | `<T>(name: string) => T \| undefined`                          | 获取模块配置段                 |
| `getOrThrow` | `<T>(name: string) => T`                                       | 获取配置（未加载时抛异常）     |
| `load`       | `<T>(name, filePath, schema?) => Result<T, ConfigError>`       | 手动加载配置文件               |
| `validate`   | `<T>(name: string, schema: ZodType) => Result<T, ConfigError>` | 用 Zod Schema 校验已加载的配置 |
| `has`        | `(name: string) => boolean`                                    | 检查配置段是否存在             |
| `reload`     | `(name: string) => Result<unknown, ConfigError>`               | 重新从磁盘加载配置             |
| `clear`      | `(name?: string) => void`                                      | 清除配置缓存                   |
| `keys`       | `() => string[]`                                               | 获取所有已加载的配置名称       |
| `watch`      | `<T>(name, callback) => () => void`                            | 监听配置文件变更并自动重载     |
| `unwatch`    | `(name?: string) => void`                                      | 停止配置文件监听               |
| `isWatching` | `(name: string) => boolean`                                    | 检查是否正在监听某个配置       |

配置文件格式（YAML，支持环境变量）：

```yaml
# config/_core.yml
app:
  name: ${APP_NAME:my-app}
  env: ${NODE_ENV:development}
log:
  level: ${LOG_LEVEL:info}
  format: ${LOG_FORMAT:pretty} # pretty | json
i18n:
  defaultLocale: zh-CN
  supportedLocales:
    - zh-CN
    - en-US
```

### 日志 — `core.logger`

方法：`trace` / `debug` / `info` / `warn` / `error` / `fatal`

```typescript
core.logger.info('User created', { userId: '123' })
core.logger.error('Failed to connect', { error })
core.logger.debug('Processing item', { id, step: 'validation' })
```

**日志级别规范**：

| 级别    | 适用场景                           |
| ------- | ---------------------------------- |
| `trace` | 循环内详细调试数据                 |
| `debug` | 函数进入、参数概要、读操作         |
| `info`  | 业务事件（初始化完成、写操作成功） |
| `warn`  | 异常但可恢复（校验失败、重试）     |
| `error` | 操作失败（需人工排查）             |
| `fatal` | 致命错误（服务无法继续）           |

创建模块级 logger：

```typescript
const logger = core.createLogger({ name: 'my-module' })
logger.info('Module initialized')
```

### 国际化 — `core.i18n`

| 方法                  | 签名                                                                  | 说明           |
| --------------------- | --------------------------------------------------------------------- | -------------- |
| `getGlobalLocale`     | `() => string`                                                        | 获取当前语言   |
| `setGlobalLocale`     | `(locale: string) => void`                                            | 设置全局语言   |
| `createMessageGetter` | `(messages: Record<string, Record<string, string>>) => MessageGetter` | 创建消息获取器 |

创建模块 i18n：

```typescript
import enUS from '../messages/en-US.json'
import zhCN from '../messages/zh-CN.json'

const m = core.i18n.createMessageGetter({
  'zh-CN': zhCN,
  'en-US': enUS,
})

// 使用
m('user_created') // "用户已创建"
m('welcome', { params: { name: '张三' } }) // "欢迎，张三"
```

### Result 模型

所有 hai 模块操作返回 `Result<T, E>` 类型，强制处理成功/失败分支：

```typescript
import type { Result } from '@h-ai/core'
import { err, ok } from '@h-ai/core'

// 成功
return ok(data)

// 失败
return err({ code: 'NOT_FOUND', message: m('item_not_found') })
```

**Result 类型定义**：

```typescript
type Result<T, E = HaiError>
  = | { success: true, data: T }
    | { success: false, error: E }

interface HaiError {
  code: string
  message: string
  details?: unknown
}
```

**使用模式**：

```typescript
const result = await someOperation()

// 模式1：直接检查
if (!result.success) {
  core.logger.error('Operation failed', { error: result.error })
  return result // 直接透传错误
}
const data = result.data

// 模式2：提前返回
if (!result.success)
  return result
// 后续代码可安全使用 result.data
```

### 模块工具 — `core.module`

| 方法                      | 签名                                                                 | 说明                                     |
| ------------------------- | -------------------------------------------------------------------- | ---------------------------------------- |
| `createNotInitializedKit` | `<E>(code: E['code'], messageFn: () => string) => NotInitializedKit` | 创建未初始化代理（访问任何方法返回错误） |

```typescript
// 在模块 main.ts 中使用
const notInitialized = core.module.createNotInitializedKit<ReldbError>(
  ReldbErrorCode.NOT_INITIALIZED,
  () => reldbM('db_notInitialized'),
)

// 创建占位 Proxy（异步接口，默认）
let currentDdl: DdlOperations = notInitialized.proxy<DdlOperations>()
// 创建占位 Proxy（同步接口）
const currentHash: HashOperations = notInitialized.proxy<HashOperations>('sync')

export const myModule = {
  async init(config) {
    currentDdl = createDdlOperations(config)
    return ok(undefined)
  },
  get ddl() {
    return currentDdl
  },
}
```

---

## 错误码

### `CommonErrorCode`（通用，1000-1099）

| 错误码         | 值   | 说明       |
| -------------- | ---- | ---------- |
| `UNKNOWN`      | 1000 | 未知错误   |
| `VALIDATION`   | 1001 | 校验失败   |
| `NOT_FOUND`    | 1002 | 资源不存在 |
| `UNAUTHORIZED` | 1003 | 未认证     |
| `FORBIDDEN`    | 1004 | 无权限     |
| `CONFLICT`     | 1005 | 冲突       |
| `INTERNAL`     | 1006 | 内部错误   |
| `TIMEOUT`      | 1007 | 超时       |
| `NETWORK`      | 1008 | 网络错误   |

### `ConfigErrorCode`（配置，1100-1199）

| 错误码             | 值   | 说明            |
| ------------------ | ---- | --------------- |
| `FILE_NOT_FOUND`   | 1100 | 配置文件不存在  |
| `PARSE_ERROR`      | 1101 | YAML 解析失败   |
| `VALIDATION_ERROR` | 1102 | Schema 校验失败 |
| `ENV_VAR_MISSING`  | 1103 | 环境变量缺失    |
| `NOT_LOADED`       | 1104 | 配置未加载      |

---

## 常见模式

### 服务端初始化（SvelteKit hooks.server.ts）

```typescript
import { initModules } from '$lib/server/init'

// init.ts
import { core } from '@h-ai/core'

const appHandle = kit.createHandle({ /* ... */ })

export const handle = kit.sequence(appHandle)

let initialized = false
export async function initModules() {
  if (initialized)
    return
  core.init({ configDir: './config' })
  // ... 其他模块 init
  initialized = true
}
```

### 配置校验最佳实践

```typescript
import { z } from 'zod'

const MyConfigSchema = z.object({
  apiKey: z.string().min(1),
  timeout: z.number().positive().default(5000),
})

// 模块初始化时校验
const result = core.config.validate('myModule', MyConfigSchema)
if (!result.success) {
  core.logger.error('Invalid config', { error: result.error })
  return result
}
const config = result.data // 类型安全
```

---

## 相关 Skills

- `hai-build`：项目整体架构与技能导航
- `hai-kit`：SvelteKit 集成层（Handle/Guard/Middleware）
- `hai-db` / `hai-cache` / `hai-iam`：使用 core.config 读取配置的下游模块
