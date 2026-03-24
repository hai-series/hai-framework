# @h-ai/core

> hai Agent Framework 核心模块 — 提供统一的基础工具、类型定义、配置管理和日志功能。

## 支持的能力

- **HaiResult 类型** — 函数式错误处理（`ok` / `err`）
- **统一日志** — Node.js 基于 pino，浏览器基于 loglevel，API 一致
- **国际化（i18n）** — 集中式 locale 管理 + 类型安全的消息获取器
- **配置管理** — YAML 加载、环境变量插值、Zod 校验、文件监听（Node.js 专用）
- **ID 生成** — nanoid 与 UUID v4
- **工具函数库** — 类型检查、对象 / 字符串 / 数组 / 异步 / 时间操作

## 快速开始

### Node.js 环境

```typescript
import { core } from '@h-ai/core'

// 初始化：加载配置目录（可选）
core.init({ configDir: './config', watchConfig: true })

// 日志（所有级别）
core.logger.info('Server started')
core.logger.warn('Warning', { detail: 'some detail' })
core.logger.error('Error', { error })

// 创建应用级 logger
const appLogger = core.logger.create({ name: 'app' })
appLogger.debug('Debug enabled')

// 用 i18n 创建异常消息
core.i18n.setGlobalLocale('zh-CN')
const getMessage = core.i18n.createMessageGetter({
  'zh-CN': { error: '发生错误：{msg}' },
  'en-US': { error: 'Error occurred: {msg}' },
})
core.logger.error(getMessage('error', { params: { msg: 'auth failed' } }))

// ID 生成
const nanoid = core.id.generate()
const uuid = core.id.uuid()

// 工具函数
core.object.deepMerge(objA, objB)
core.string.capitalize('hello')
core.array.unique([1, 1, 2, 3])
core.array.chunk([1, 2, 3, 4, 5], 2) // [[1,2], [3,4], [5]]
await core.async.delay(1000)
await core.async.retry(() => fetchData(), { maxRetries: 3, delayFn: exp })
core.time.formatDate(new Date(), 'YYYY-MM-DD')
core.typeUtils.isDefined(value)
```

### 浏览器环境

```typescript
import { core } from '@h-ai/core'

// 初始化日志级别（浏览器不支持配置加载）
core.init({ logging: { level: 'warn' } })

core.logger.info('Page ready')
const id = core.id.generate()

// 其他工具函数与 Node.js 相同
core.string.capitalize('hello')
core.array.unique([1, 1, 2])
```

## 详细 API

### 日志（Logger）

```typescript
// 有 5 种日志级别：trace, debug, info, warn, error
core.logger.info('message', { context: 'optional' })

// 创建带命名空间的 logger
const db = core.logger.create({ name: 'db' })
db.debug('Query prepared', { sql: '...' })

// 为 logger 添加子上下文（自动合并到所有日志中）
const requestLogger = core.logger.child({ requestId: 'abc123', userId: 'user456' })
requestLogger.info('Request started') // 日志中自动包含 requestId 和 userId

// 嵌套 child：子上下文会递归合并
const operationLogger = requestLogger.child({ operation: 'login' })
operationLogger.warn('Invalid password')

// 配置日志格式和输出
core.logger.configure({
  level: 'info', // Node.js 支持
  format: 'json', // Node.js 支持
})
core.logger.setLevel('debug')
const level = core.logger.getLevel() // 'debug'
```

### 国际化（i18n）

```typescript
// 设置全局语言（所有 getMessage 函数自动响应）
core.i18n.setGlobalLocale('en-US')
const current = core.i18n.getGlobalLocale() // 'en-US'

// 为每个模块创建消息获取器
const getMessage = core.i18n.createMessageGetter({
  'zh-CN': {
    welcome: '欢迎 {name}',
    error: '错误：{code}',
  },
  'en-US': {
    welcome: 'Welcome {name}',
    error: 'Error: {code}',
  },
})

// 使用：自动读取全局 locale，支持参数插值
getMessage('welcome', { params: { name: 'Alice' } }) // 'Welcome Alice'

// 支持 locale 参数覆盖
getMessage('welcome', { locale: 'zh-CN', params: { name: 'Alice' } }) // '欢迎 Alice'

// Core 内置消息（如超时、验证失败等）
core.i18n.coreM('core_errorTimeout')
core.i18n.coreM('core_validationRequired', { params: { field: 'username' } })

// 常量
core.i18n.DEFAULT_LOCALES // [{ code: 'zh-CN', label: '简体中文' }, { code: 'en-US', label: 'English' }]
core.i18n.DEFAULT_LOCALE // 'zh-CN'
```

### 配置管理（Node.js 专用）

```typescript
import { core, CoreErrorCode } from '@h-ai/core'
import { z } from 'zod'

// 方式 1：init 时自动加载整个配置目录
core.init({
  configDir: './config', // 扫描该目录所有 .yml 文件
  watchConfig: true, // 监听变更并自动重载
})

// 方式 2：手动加载单个文件
const AppSchema = z.object({
  name: z.string(),
  port: z.number().default(3000),
})
const result = core.config.load('app', './config/app.yml', AppSchema)
if (result.success) {
  console.warn(result.data.name)
}
else {
  console.error(result.error.code) // CoreErrorCode.CONFIG_FILE_NOT_FOUND 等
}

// 校验已加载的配置（模块若使用 init 自动加载，调用方需主动校验）
const validResult = core.config.validate('app', AppSchema)

// 查询和获取
if (core.config.has('app')) {
  const config = core.config.get<typeof AppSchema>('app') // undefined 或配置
  const config = core.config.getOrThrow<typeof AppSchema>('app') // 抛错或返回
}
core.config.keys() // ['app', 'db', ...]

// 重新加载（从磁盘重新读取）
const reloadResult = core.config.reload('app')

// 监听文件变更（自动重载 + 通知回调）
const unwatch = core.config.watch('app', (newConfig, error) => {
  if (error) {
    core.logger.error('Config reload failed', { error })
    return
  }
  core.logger.info('Config updated', { config: newConfig })
})

// 检查和停止监听
if (core.config.isWatching('app')) {
  core.config.unwatch('app') // 停止单个
}
core.config.unwatch() // 停止所有监听

// 清除缓存（同时停止对应的监听）
core.config.clear('app') // 清除单个
core.config.clear() // 清除全部
```

#### 环境变量插值

`core.config.load()` 加载 YAML 时，会自动对字符串值做 `${VAR}` 环境变量替换。

**语法：**

- `${VAR}` — 读取 `process.env.VAR`；若不存在则返回 `CoreErrorCode.CONFIG_ENV_VAR_MISSING` 错误
- `${VAR:default}` — 读取 `process.env.VAR`；若不存在则使用冒号后的默认值

**类型还原：** 当整个值恰好是单个变量表达式（如 `${PORT:3000}`）时，插值结果会按 YAML 规则还原为原生类型（number / boolean 等）。若值中包含其他文本（如 `http://${HOST}:${PORT}`），则结果始终为字符串。

```yaml
# config/app.yml
debug: ${DEBUG:false} # → boolean false（整值单变量，类型还原）
port: ${PORT:3000} # → number 3000（整值单变量，类型还原）
database: ${DB_CONNECTION} # → 无默认值，环境变量缺失时报错
url: http://${HOST}:${PORT} # → string "http://localhost:3000"（混合文本，保持字符串）
```

### ID 生成

```typescript
// nanoid（短 ID，URL 安全）
const id = core.id.generate() // 'V1StGXR_Z5j3eK4uA9b8c'
const customId = core.id.generate(8) // 长度 8

// UUID v4
const uuid = core.id.uuid() // 'a550...3c21'
```

### 工具函数库

#### 类型检查（typeUtils）

```typescript
core.typeUtils.isDefined(x) // true if x !== undefined
core.typeUtils.isObject(x) // true if x is plain object
```

#### 对象操作（object）

```typescript
core.object.pick(obj, ['a', 'b']) // 提取指定字段
core.object.omit(obj, ['c', 'd']) // 排除指定字段
core.object.deepMerge(a, b) // 递归合并
core.object.deepMerge(a, b, c) // 支持多个对象
```

#### 字符串操作（string）

```typescript
core.string.capitalize('hello') // 'Hello'
core.string.uncapitalize('Hello') // 'hello'
```

#### 数组操作（array）

```typescript
core.array.unique([1, 1, 2]) // [1, 2]
core.array.chunk([1, 2, 3, 4], 2) // [[1,2], [3,4]]
```

#### 异步操作（async）

```typescript
await core.async.delay(1000) // 延迟 1 秒
await core.async.retry(fn, {
  // 指数退避重试
  maxRetries: 3,
  delayFn: (attempt, baseDelay) => baseDelay * 2 ** attempt,
})
```

#### 时间操作（time）

```typescript
core.time.formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')
core.time.sleep(1000) // 等同于 core.async.delay
```

### 模块基础工具（module）

提供各模块共用的初始化错误处理：

```typescript
import { core } from '@h-ai/core'

const notInitialized = core.module.createNotInitializedKit<DbError>(
  DbErrorCode.NOT_INITIALIZED,
  () => dbM('db_notInitialized'),
)

// 内部使用此 kit 创建 Proxy，未初始化前所有操作返回错误
const dbOperations = notInitialized.proxy<DbOperations>()
```

## 错误处理

### Result 类型

所有可能失败的操作都返回 `HaiResult<T>`（可以是 `ok(data)` 或 `err(error)`）：

```typescript
import type { HaiResult } from '@h-ai/core'
import { err, ok } from '@h-ai/core'

function divide(a: number, b: number): HaiResult<number> {
  if (b === 0)
    return err(HaiCommonError.VALIDATION_ERROR, 'Division by zero')
  return ok(a / b)
}

const result = divide(10, 2)
if (result.success) {
  console.warn(result.data) // 5
}
else {
  console.error(result.error) // error object
}
```

### 配置错误码

仅 `core.config` 操作会产生这些错误：

```typescript
import { CoreErrorCode } from '@h-ai/core'

// 常见错误码
CoreErrorCode.CONFIG_FILE_NOT_FOUND // hai:core:010 - 配置文件不存在
CoreErrorCode.CONFIG_PARSE_ERROR // hai:core:011 - YAML 解析失败
CoreErrorCode.CONFIG_VALIDATION_ERROR // hai:core:012 - Schema 校验失败
CoreErrorCode.CONFIG_ENV_VAR_MISSING // hai:core:013 - 环境变量缺失
CoreErrorCode.CONFIG_NOT_LOADED // hai:core:014 - 配置未加载
```

## 测试

运行所有测试：

```bash
pnpm --filter @h-ai/core test
```

运行特定测试：

```bash
pnpm --filter @h-ai/core test -- --grep i18n
```

## License

Apache-2.0
