---
name: hai-core
description: 使用 @h-ai/core 进行配置加载、日志记录、i18n 国际化、HaiResult 错误处理、Zod 校验错误本地化与模块生命周期管理；当需求涉及 core.init、core.logger、core.config、core.i18n、core.zodValidation、ok/err 或模块初始化模式时使用。
---

# hai-core

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/core 进行配置加载、日志记录、i18n 国际化、HaiResult 错误处理、Zod 校验错误本地化与模块生命周期管理；当需求涉及 core.init、core.logger、core.config、core.i18n、core.zodValidation、ok/err 或模块初始化模式时使用。 |
| 适用场景 | 当任务与 `hai-core` 的能力描述匹配，并且需要遵循本 Skill 的流程和边界时 |
| 输入 | 模块配置、类型化业务参数、依赖初始化状态和目标运行环境 |
| 输出 | 符合模块公共 API 的实现或示例；业务结果使用 HaiResult，并同步必要测试与文档 |
| 限制 | 遵守 init → use → close 生命周期与运行环境边界；不绕过类型、授权、输入校验或敏感信息保护 |

> `@h-ai/core` 是 hai-framework 的基础模块，提供配置管理、结构化日志、国际化、HaiResult 错误模型、Zod 校验错误本地化与模块生命周期工具。所有其他模块均依赖 core。

---

## 运行环境

**Node.js + 浏览器双端可用。** 构建工具自动选择正确入口（`package.json` exports 条件导出）。

| 能力 | Node.js | 浏览器 |
|------|---------|--------|
| `core.logger` | ✅ pino（结构化 JSON / pretty） | ✅ loglevel（DevTools console） |
| `core.config` | ✅ 完整（YAML 加载、watch、validate） | ⚠️ 占位 API；文件配置方法返回 `SERVICE_UNAVAILABLE` |
| `core.i18n` | ✅ | ✅ |
| `core.zodValidation` | ✅ | ✅ |
| `core.id` | ✅ | ✅ |
| 工具函数 | ✅ | ✅ |

---

## 适用场景

- 项目初始化与配置加载
- 使用 `core.logger` 记录日志
- 使用 `core.config` 读取/校验模块配置
- 使用 `core.i18n` 管理多语言
- 使用 `core.zodValidation` 将 Zod 默认英文错误映射为模块自己的 i18n 文案
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

// Zod 校验错误本地化
const formErrors = core.zodValidation.mapZodErrorToFormErrors(zodError, getMessage)
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

> 浏览器端保留 `core.config` 对象用于类型/runtime 对齐，但没有文件系统：`get()` 返回 `undefined`，`has()` 返回 `false`，`keys()` 返回 `[]`；`load()` / `validate()` / `reload()` 返回 `HaiCommonError.SERVICE_UNAVAILABLE`；`watch()` 会立即回调该错误并返回 no-op 取消函数。

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
```

配置文件格式（YAML，支持约定式环境变量映射和显式插值）：

- 每个 YAML 叶子配置项自动映射为 `HAI_<配置名>_<YAML 路径>`；配置名和 key 转大写、层级以 `_` 分隔，camelCase 不拆词
- 例如 `core.config.load('ai', ...)` 加载的 `llm.apiKey` 对应 `HAI_AI_LLM_APIKEY`，`llm.models[0].temperature` 对应 `HAI_AI_LLM_MODELS_0_TEMPERATURE`
- 约定环境变量存在时覆盖 YAML 值并按 YAML 标量规则还原类型；不存在时保留 YAML 值，且不会新增 YAML 中未声明的配置项
- 优先级固定为约定环境变量 > 显式 `${VAR}` > YAML 默认值；显式语法只用于指定特殊变量名

- `${VAR}` — 读取 `process.env.VAR`；缺失则返回 `HaiConfigError.CONFIG_ENV_VAR_MISSING` 错误
- `${VAR:default}` — 读取 `process.env.VAR`；缺失则使用默认值
- **类型还原**：整个值恰好是单个变量表达式时，结果还原为原生类型（number / boolean 等）；混合文本始终为字符串
- **空值语义**：`${VAR:}` 或值为空字符串的 `${VAR}` 保持为 `''`，不会被 YAML 解析为 `null`；是否把空字符串视为未配置由模块 Schema 明确定义

```yaml
# config/_core.yml
name: my-app
env: development
logging:
  level: info
  format: pretty
feature:
  debug: false
  maxRetries: 3
  # 只有特殊变量名才需要显式语法：
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

### Zod 校验错误映射 — `core.zodValidation`

适用于 `@h-ai/kit`、`@h-ai/serv`、`@h-ai/api-client` 等需要把 Zod 默认英文错误
转换为模块自身 i18n 文案的场景。优先复用 `core.zodValidation`，不要在各模块重复维护
默认消息正则 / issue 本地化逻辑。

| 方法 | 签名 | 说明 |
|------|------|------|
| `createPrefixedZodMessageGetter` | `(prefix, getMessage) => ZodMessageGetter` | 按模块前缀自动派生 `serv_validation*` / `kit_validation*` 这类消息 key |
| `mapZodErrorToFormErrors` | `(error, getMessage) => ValidationFormError[]` | 一步完成提取 + 本地化 + 扁平化 |

```typescript
import type { ZodMessageGetter } from '@h-ai/core'
import { core } from '@h-ai/core'
import { z } from 'zod'

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  nickname: z.string().min(1, '请填写昵称'),
})

const getMessage: ZodMessageGetter = (key, params) => {
  switch (key) {
    case 'validationEmail':
      return '请输入合法邮箱地址'
    case 'validationStringMin':
      return `至少输入 ${params?.min} 个字符`
    default:
      return '输入不合法'
  }
}

const result = LoginSchema.safeParse({
  email: 'bad',
  password: '123',
  nickname: '',
})

if (!result.success) {
  const getMessage = core.zodValidation.createPrefixedZodMessageGetter(
    'serv',
    (messageKey, params) => {
      if (messageKey === 'serv_validationEmail')
        return '请输入合法邮箱地址'
      if (messageKey === 'serv_validationStringMin')
        return `至少输入 ${params?.min} 个字符`
      return '输入不合法'
    },
  )
  const errors = core.zodValidation.mapZodErrorToFormErrors(result.error, getMessage)

  errors[0]?.field // 'email'
  errors[0]?.message // '请输入合法邮箱地址'
  errors[2]?.message // '请填写昵称'（schema 自定义消息原样保留）
}
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

#### UUID 生成规范（强制）

- 生成 UUID **一律用 `core.id.uuid()`**，禁止裸调 `crypto.randomUUID()`。
- 原因：`crypto.randomUUID` 仅在**安全上下文（HTTPS / localhost）**下可用，生产 http 环境会抛
  `crypto.randomUUID is not a function`；`core.id.uuid()` 已做 `randomUUID → getRandomValues → Math.random` 三级兜底，Node.js 与浏览器通用。
- 需要不带横线的 compact 形式：`core.id.uuid().replaceAll('-', '')`。
- 代码评审与新建代码时以此为准，发现裸调 `crypto.randomUUID()` 一律改走 `core.id.uuid()`。

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
import { ok, err, HaiCommonError } from '@h-ai/core'

// 成功
return ok(data)

// 失败
return err(HaiCommonError.NOT_FOUND, 'Resource not found')
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

---

## 浏览器侧使用

> **禁止在应用中直接引入 `loglevel`。** `core.logger` 在浏览器端自动使用 loglevel 作为后端，API 与 Node.js 完全一致。

### 初始化

浏览器端无文件系统，不需要 `configDir`。在 `+layout.svelte` 或应用入口调用：

```typescript
import { core } from '@h-ai/core'

// 浏览器端：仅传入 logging 配置即可
core.init({ logging: { level: 'info' } })
```

### 日志记录

```typescript
// 与 Node.js 完全一致的 API
core.logger.info('Page loaded', { route: '/home' })
core.logger.error('API call failed', { url, status })

// 创建模块级 logger
const logger = core.logger.create({ name: 'my-page' })
logger.debug('Data fetched', { count: items.length })

// ❌ 禁止直接引用底层日志库
// import log from 'loglevel'  ← 不要这样做
```

### 浏览器侧限制

| 功能 | 行为 |
|------|------|
| `core.config` 文件配置 | 不支持；文件相关方法返回 `SERVICE_UNAVAILABLE`，配置应由服务端读取后下发 |
| `format: 'json' \| 'pretty'` | 被忽略（始终输出到 DevTools console） |
| `redact` 字段脱敏 | 不生效（需手动脱敏） |
| `fatal` 级别 | 映射为 `console.error`（带 `[FATAL]` 前缀） |
| context 输出 | JSON 字符串追加到消息末尾（非结构化对象） |
