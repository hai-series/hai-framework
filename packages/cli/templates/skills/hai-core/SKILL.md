---
name: hai-core
description: 使用 @h-ai/core 进行配置加载、日志记录、i18n 国际化、HaiResult 错误处理与模块生命周期管理；当需求涉及 core.init、core.logger、core.config、core.i18n、ok/err 或模块初始化模式时使用。
---

# hai-core

> `@h-ai/core` 是 hai-framework 的基础模块，提供配置管理、结构化日志、国际化、HaiResult 错误模型与模块生命周期工具。所有其他模块均依赖 core。

---

## 适用场景

- 项目初始化与配置加载
- 使用 `core.logger` 记录日志
- 使用 `core.config` 读取/校验模块配置
- 使用 `core.i18n` 管理多语言
- 使用 `ok()` / `err()` 构建 HaiResult 类型返回值
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
| `load`       | `<T>(name, filePath, schema?) => HaiResult<T>`       | 手动加载配置文件               |
| `validate`   | `<T>(name: string, schema: ZodType) => HaiResult<T>` | 用 Zod Schema 校验已加载的配置 |
| `has`        | `(name: string) => boolean`                                    | 检查配置段是否存在             |
| `reload`     | `(name: string) => HaiResult<unknown>`               | 重新从磁盘加载配置             |
| `clear`      | `(name?: string) => void`                                      | 清除配置缓存                   |
| `keys`       | `() => string[]`                                               | 获取所有已加载的配置名称       |
| `watch`      | `<T>(name, callback) => () => void`                            | 监听配置文件变更并自动重载     |
| `unwatch`    | `(name?: string) => void`                                      | 停止配置文件监听               |
| `isWatching` | `(name: string) => boolean`                                    | 检查是否正在监听某个配置       |

**`watch()` 回调处理**：

```typescript
// watch 回调签名：(config: T | null, error?: HaiError) => void
// - 成功重载时：传入新配置，error 为 undefined
// - 重载失败时：config 为 null，error 为错误详情（包含 code 和 message）

const unwatch = core.config.watch('db', (cfg, error) => {
  if (error) {
    // 处理重载失败（如文件解析错误），不应更新本地使用的配置
    core.logger.error('Config reload failed', {
      name: 'db',
      code: error.code,
      message: error.message,
    })
    return
  }
  // 使用新配置
  // 注意：此时 core.config.get('db') 已经指向新数据
  core.logger.info('Config updated', { db: cfg })
})

// 调用 unwatch() 停止监听
unwatch()

// 配置未加载时立即返回 NOT_LOADED 错误
core.config.watch('nonexistent', (_cfg, error) => {
  // error.code === HaiConfigError.CONFIG_NOT_LOADED.code
})

// 多个监听回调可在同一配置文件变更时同时触发
core.config.watch('app', cb1)
core.config.watch('app', cb2) // cb1 和 cb2 都会被调用
```

**文件监听特性**：

- 使用 `fs.watch()` 实现，自动防抖（100ms 防抖避免快速重复保存触发多次回调）
- 同一配置名只会创建一个 watcher（多次 `watch()` 共享同一 watcher 实例）
- 当最后一个回调被移除时，watcher 自动关闭
- `unwatch()` 会关闭watcher，但缓存的配置数据保留

配置文件格式（YAML，支持环境变量插值）：

- `${VAR}` — 读取 `process.env.VAR`；缺失则返回 `HaiConfigError.CONFIG_ENV_VAR_MISSING` 错误
- `${VAR:default}` — 读取 `process.env.VAR`；缺失则使用默认值
- **类型还原**：整个值恰好是单个变量表达式时，结果还原为原生类型（number / boolean 等）；混合文本始终为字符串

```yaml
# config/_core.yml
app:
  name: ${HAI_APP_NAME:my-app} # → string
  env: ${HAI_ENV:development} # → string
log:
  level: ${HAI_LOG_LEVEL:info} # → string
  format: ${HAI_LOG_FORMAT:pretty} # → string，pretty | json
feature:
  debug: ${DEBUG:false} # → boolean false（类型还原）
  maxRetries: ${MAX_RETRIES:3} # → number 3（类型还原）
  url: http://${HOST}:${PORT} # → string（混合文本，不还原）
```

### 日志 — `core.logger`

`core.logger` 既是默认 Logger 实例，也是日志管理的统一入口。

**日志记录**（实例方法）：`trace` / `debug` / `info` / `warn` / `error` / `fatal`

```typescript
core.logger.info('User created', { userId: '123' })
core.logger.error('Failed to connect', { error })
core.logger.debug('Processing item', { id, step: 'validation' })
```

**管理方法**：

| 方法        | 签名                                   | 说明                     |
| ----------- | -------------------------------------- | ------------------------ |
| `create`    | `(options?: LoggerOptions) => Logger`  | 创建新 Logger 实例       |
| `child`     | `(context: Record<string, unknown>) => Logger` | 创建携带固定上下文的子 Logger |
| `configure` | `(config: Partial<LoggingConfig>) => void` | 配置全局日志选项（级别、格式等） |
| `setLevel`  | `(level: LogLevel) => void`            | 设置全局日志级别         |
| `getLevel`  | `() => LogLevel`                       | 获取当前全局日志级别     |

```typescript
// 创建模块级 logger
const logger = core.logger.create({ name: 'my-module' })
logger.info('Module initialized')

// 创建携带固定上下文的子 logger（自动合并到每条日志）
const reqLogger = core.logger.child({ requestId: 'req-001' })
reqLogger.info('Request started') // 日志中自动包含 requestId

// 配置输出格式和级别
core.logger.configure({
  level: 'warn',
  format: 'json',
  redact: ['password', 'token'], // 脱敏字段
}) // Node.js 支持
core.logger.setLevel('debug')
const level = core.logger.getLevel() // 'debug'
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

### ID 生成 — `core.id`

| 方法           | 签名                                    | 说明                          |
| -------------- | --------------------------------------- | ----------------------------- |
| `generate`     | `(size?: number) => string`             | nanoid（默认 21 字符）        |
| `short`        | `() => string`                          | 10 字符短 ID                  |
| `withPrefix`   | `(prefix: string, length?: number) => string` | 带前缀的 nanoid               |
| `trace`        | `() => string`                          | `trace-` 前缀 ID              |
| `request`      | `() => string`                          | `req-` 前缀 ID                |
| `uuid`         | `() => string`                          | UUID v4                       |
| `isValidUUID`  | `(value: string) => boolean`            | 校验 UUID 格式                |
| `isValidNanoId`| `(value: string, size?: number) => boolean` | 校验 nanoid 格式          |

```typescript
const id = core.id.generate()          // 'V1StGXR_Z5j3eK4uA9b8c'
const shortId = core.id.short()        // 10 字符
const prefixed = core.id.withPrefix('order_') // 'order_V1StGXR...'
const traceId = core.id.trace()        // 'trace-V1StGXR...'
const reqId = core.id.request()        // 'req-V1StGXR...'
const uuid = core.id.uuid()            // UUID v4

core.id.isValidUUID('f47ac10b-...')    // true/false
core.id.isValidNanoId('abc123', 6)     // true/false
```

### 工具函数

#### 类型检查 — `core.typeUtils`

`isDefined` / `isObject` / `isFunction` / `isPromise` / `isString` / `isNumber` / `isBoolean` / `isArray`

#### 对象操作 — `core.object`

`deepClone` / `deepMerge` / `pick` / `omit` / `keys` / `values` / `entries` / `fromEntries`

```typescript
core.object.deepMerge(a, b, c)       // 递归合并（防原型污染）
core.object.pick(obj, ['a', 'b'])
core.object.omit(obj, ['c', 'd'])
```

#### 字符串操作 — `core.string`

`capitalize` / `kebabCase` / `camelCase` / `snakeCase` / `pascalCase` / `truncate` / `trim` / `isBlank` / `isNotBlank` / `padStart` / `padEnd` / `constantTimeEqual`

```typescript
core.string.capitalize('hello')      // 'Hello'
core.string.kebabCase('helloWorld')  // 'hello-world'
core.string.constantTimeEqual(a, b)  // 防时序攻击比较
```

#### 数组操作 — `core.array`

`unique` / `chunk` / `groupBy` / `first` / `last` / `flatten` / `compact` / `shuffle` / `intersection` / `difference`

```typescript
core.array.unique([1, 1, 2])           // [1, 2]
core.array.chunk([1, 2, 3, 4], 2)      // [[1,2], [3,4]]
core.array.groupBy(items, item => item.type) // Record<string, T[]>
core.array.intersection([1, 2], [2, 3]) // [2]
```

#### 异步操作 — `core.async`

`delay` / `withTimeout` / `retry` / `parallel` / `serial` / `debounce` / `throttle`

```typescript
await core.async.delay(1000)
await core.async.withTimeout(fetch('/api'), 5000)
await core.async.retry(fn, { maxRetries: 3, delay: 1000 })
await core.async.parallel(items, processFn, 5)  // 并发限制
const debouncedFn = core.async.debounce(fn, 300)
```

#### 时间操作 — `core.time`

`formatDate` / `timeAgo` / `now` / `nowSeconds` / `parseDate` / `isValidDate` / `addDays` / `addHours` / `startOfDay` / `endOfDay`

```typescript
core.time.formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')
core.time.timeAgo(new Date(Date.now() - 60000)) // '1 分钟前'
core.time.addDays(date, 7)
```

### HaiResult 模型与错误处理

所有 hai 模块操作返回 `HaiResult<T>` 类型，强制处理成功/失败分支：

```typescript
import type { HaiResult, HaiErrorDef, HaiError } from '@h-ai/core'
import { err, ok } from '@h-ai/core'

// 成功
return ok(data)

// 失败：使用预定义错误定义创建错误实例
return err(HaiCommonError.NOT_FOUND, 'Resource not found')

// 带原始错误和建议的完整失败
return err(
  HaiCommonError.INTERNAL_ERROR,
  'Failed to process request',
  originalError,
  'Check database connection'
)
```

**错误定义 vs 错误实例**：

```typescript
// HaiErrorDef 是错误定义（包含错误码、HTTP 状态码、模块信息）
const errorDef: HaiErrorDef = {
  code: 'hai:common:001',        // system:module:code
  httpStatus: 500,               // HTTP 响应状态码
  system: 'hai',                 // 系统标识
  module: 'common',              // 所属模块
}

// HaiError 是具体错误实例（包含定义数据 + 运行时信息）
const errorInst: HaiError = {
  ...errorDef,
  message: '具体错误消息',        // i18n 翻译后的消息
  cause?: originalError,         // 原始错误
  suggestion?: '用户可采取的行动', // 建议
}

// err() 函数接受 HaiErrorDef，自动创建 HaiError 实例
err(errorDef, '消息文本', cause, '建议')
```

**HaiResult 类型定义**：

```typescript
type HaiResult<T>
  = | { success: true, data: T }
  | { success: false, error: HaiError }
  code: string
  message: string
  httpStatus?: number
  system?: string
  module?: string
  cause?: unknown
  suggestion?: string
  ext?: Record<string, unknown>
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
const notInitialized = core.module.createNotInitializedKit(
  HaiReldbError.NOT_INITIALIZED,
  () => reldbM('reldb_notInitialized'),
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

## 错误码

Core 模块定义了两组标准错误码：

### `HaiCommonError`（通用错误）

| 错误码 | code | 说明 |
|--------|------|------|
| `HaiCommonError.NOT_INITIALIZED` | `hai:common:001` | 模块未初始化 |
| `HaiCommonError.INIT_FAILED` | `hai:common:002` | 初始化失败 |
| `HaiCommonError.INIT_IN_PROGRESS` | `hai:common:004` | 正在初始化中 |
| `HaiCommonError.UNAUTHORIZED` | `hai:common:100` | 未认证 |
| `HaiCommonError.FORBIDDEN` | `hai:common:101` | 无权限 |
| `HaiCommonError.TOKEN_EXPIRED` | `hai:common:102` | Token 已过期 |
| `HaiCommonError.TOKEN_INVALID` | `hai:common:103` | Token 无效 |
| `HaiCommonError.VALIDATION_ERROR` | `hai:common:200` | 校验失败 |
| `HaiCommonError.INVALID_REQUEST` | `hai:common:201` | 请求无效 |
| `HaiCommonError.PARAMETER_MISSING` | `hai:common:202` | 参数缺失 |
| `HaiCommonError.NOT_FOUND` | `hai:common:300` | 资源不存在 |
| `HaiCommonError.ALREADY_EXISTS` | `hai:common:301` | 资源已存在 |
| `HaiCommonError.CONFLICT` | `hai:common:302` | 冲突 |
| `HaiCommonError.API_ERROR` | `hai:common:400` | API 错误 |
| `HaiCommonError.NETWORK_ERROR` | `hai:common:401` | 网络错误 |
| `HaiCommonError.TIMEOUT` | `hai:common:402` | 超时 |
| `HaiCommonError.SERVICE_UNAVAILABLE` | `hai:common:403` | 服务不可用 |
| `HaiCommonError.INTERNAL_ERROR` | `hai:common:500` | 内部错误 |
| `HaiCommonError.DATABASE_ERROR` | `hai:common:501` | 数据库错误 |
| `HaiCommonError.UNKNOWN_ERROR` | `hai:common:599` | 未知错误 |

**使用示例**：

```typescript
import { HaiCommonError, err } from '@h-ai/core'

// 创建错误实例
err(HaiCommonError.NOT_FOUND, 'User not found')
err(HaiCommonError.VALIDATION_ERROR, 'Invalid email', validationErrors)
```

### `HaiConfigError`（配置错误）

| 错误码 | code | 说明 |
|--------|------|------|
| `HaiConfigError.CONFIG_FILE_NOT_FOUND` | `hai:core:010` | 配置文件不存在 |
| `HaiConfigError.CONFIG_PARSE_ERROR` | `hai:core:011` | YAML 解析失败 |
| `HaiConfigError.CONFIG_VALIDATION_ERROR` | `hai:core:012` | Schema 校验失败 |
| `HaiConfigError.CONFIG_ENV_VAR_MISSING` | `hai:core:013` | 必需环境变量缺失 |
| `HaiConfigError.CONFIG_NOT_LOADED` | `hai:core:014` | 配置未加载 |

**使用场景**：

```typescript
import { core, HaiConfigError } from '@h-ai/core'

const result = core.config.load('db', './config/db.yml', schema)
if (!result.success) {
  if (result.error.code === HaiConfigError.CONFIG_FILE_NOT_FOUND.code) {
    core.logger.error('Config file missing')
  }
  else if (result.error.code === HaiConfigError.CONFIG_VALIDATION_ERROR.code) {
    core.logger.error('Config validation failed', { issues: result.error.cause })
  }
}
```

### 自定义错误码（模块级）

各模块应定义自己的错误码常量，遵循格式 `hai:<module>:<code>`：

```typescript
// 示例：db 模块定义错误码
const DbErrorInfo = {
  NOT_INITIALIZED: '001:500',
  CONNECTION_FAILED: '010:500',
  QUERY_FAILED: '011:500',
  INVALID_SCHEMA: '012:400',
} as const satisfies ErrorInfo

export const DbError = error.buildHaiErrorsDef('db', DbErrorInfo)

// 使用
import { DbError, err } from '@h-ai/db'

err(DbError.CONNECTION_FAILED, 'Failed to connect to PostgreSQL')
```

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
- `hai-reldb` / `hai-cache` / `hai-iam`：使用 core.config 读取配置的下游模块
