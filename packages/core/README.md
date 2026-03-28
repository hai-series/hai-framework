# @h-ai/core

> hai Agent Framework 核心模块 — 提供统一的基础工具、类型定义、配置管理和日志功能。

## 支持的能力

- **HaiResult 类型** — 函数式错误处理（`ok` / `err`），所有模块统一返回值
- **统一日志** — Node.js 基于 pino，浏览器基于 loglevel，API 一致
- **国际化（i18n）** — 集中式 locale 管理 + 类型安全的消息获取器
- **配置管理** — YAML 加载、环境变量插值、Zod 校验、文件监听（Node.js 专用）
- **ID 生成** — nanoid 与 UUID v4
- **错误定义** — 标准化错误码体系，支持跨模块统一的错误定义与实例创建
- **模块工具** — NotInitializedKit 代理模式，各模块共用的生命周期基础设施
- **工具函数库** — 类型检查、对象 / 字符串 / 数组 / 异步 / 时间操作

## 快速开始

### Node.js 环境

```typescript
import { core } from '@h-ai/core'

// 初始化：加载配置目录（可选）
core.init({ configDir: './config', watchConfig: true })

// 日志
core.logger.info('Server started', { port: 3000 })
core.logger.warn('Slow query', { duration: 2500 })
core.logger.error('Connection failed', { error })

// 创建模块级 logger（独立名称空间）
const dbLogger = core.logger.create({ name: 'db' })
dbLogger.info('Connected to PostgreSQL')

// 创建子 logger（自动携带固定上下文，适合请求级/操作级追踪）
const reqLogger = core.logger.child({ requestId: 'req-001', userId: 'u-123' })
reqLogger.info('Request started') // 日志自动包含 requestId + userId
reqLogger.error('Request failed') // 同上

// 子 logger 可嵌套
const opLogger = reqLogger.child({ operation: 'createOrder' })
opLogger.info('Order created') // 包含 requestId + userId + operation

// i18n
core.i18n.setGlobalLocale('zh-CN')
const getMessage = core.i18n.createMessageGetter({
  'zh-CN': { welcome: '欢迎 {name}', error: '发生错误：{msg}' },
  'en-US': { welcome: 'Welcome {name}', error: 'Error: {msg}' },
})
getMessage('welcome', { params: { name: 'Alice' } }) // '欢迎 Alice'

// ID 生成
const nanoid = core.id.generate()
const shortId = core.id.short()
const uuid = core.id.uuid()
const prefixed = core.id.withPrefix('order_')

// 工具函数
core.object.deepMerge(objA, objB)
core.string.capitalize('hello')
core.array.unique([1, 1, 2, 3])
core.array.chunk([1, 2, 3, 4, 5], 2) // [[1,2], [3,4], [5]]
await core.async.delay(1000)
await core.async.retry(() => fetchData(), { maxRetries: 3, delay: 1000 })
core.time.formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')
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

`core.logger` 既是默认 Logger 实例，也是日志管理的统一入口。

#### 日志记录

6 个级别：`trace` / `debug` / `info` / `warn` / `error` / `fatal`

```typescript
core.logger.info('User created', { userId: '123' })
core.logger.error('Failed to connect', { error })
core.logger.debug('Processing item', { id, step: 'validation' })
```

#### 创建模块级 logger

```typescript
// 独立名称空间，适合模块内全局使用
const logger = core.logger.create({ name: 'payment' })
logger.info('Payment processed')
```

#### 子 logger（child）

```typescript
// 携带固定上下文，每条日志自动附带这些字段
const reqLogger = core.logger.child({ requestId: 'req-001', userId: 'u-123' })
reqLogger.info('Request started') // 输出包含 requestId + userId
reqLogger.warn('Slow response') // 同上

// 嵌套 child：子上下文递归合并
const opLogger = reqLogger.child({ operation: 'login' })
opLogger.info('Login succeeded') // 输出包含 requestId + userId + operation
opLogger.error('Login failed', { reason: 'invalid_password' })
```

> **典型用法**：在请求入口创建 `reqLogger`，传入 service 层，service 层再 `child` 添加操作上下文，最终日志自动串联完整链路。

#### 日志管理

```typescript
// 配置输出格式和级别（Node.js）
core.logger.configure({
  level: 'info',
  format: 'json', // 'json' | 'pretty'
  context: { app: 'my-service' }, // 全局默认上下文
  redact: ['password', 'token'], // 脱敏字段
})

core.logger.setLevel('debug')
const level = core.logger.getLevel() // 'debug'
```

#### 日志级别规范

| 级别    | 适用场景                           |
| ------- | ---------------------------------- |
| `trace` | 循环内详细调试数据                 |
| `debug` | 函数进入、参数概要、读操作         |
| `info`  | 业务事件（初始化完成、写操作成功） |
| `warn`  | 异常但可恢复（校验失败、重试）     |
| `error` | 操作失败（需人工排查）             |
| `fatal` | 致命错误（服务无法继续）           |

### 国际化（i18n）

```typescript
// 设置全局语言（所有 getMessage 函数自动响应）
core.i18n.setGlobalLocale('en-US')
const current = core.i18n.getGlobalLocale() // 'en-US'

// 为每个模块创建消息获取器
const getMessage = core.i18n.createMessageGetter({
  'zh-CN': { welcome: '欢迎 {name}', error: '错误：{code}' },
  'en-US': { welcome: 'Welcome {name}', error: 'Error: {code}' },
})

// 使用：自动读取全局 locale，支持参数插值
getMessage('welcome', { params: { name: 'Alice' } }) // 'Welcome Alice'

// 支持 locale 参数覆盖
getMessage('welcome', { locale: 'zh-CN', params: { name: 'Alice' } }) // '欢迎 Alice'

// 常量
core.i18n.DEFAULT_LOCALES // [{ code: 'zh-CN', label: '简体中文' }, { code: 'en-US', label: 'English' }]
core.i18n.DEFAULT_LOCALE // 'zh-CN'
```

### 配置管理（Node.js 专用）

```typescript
import { core, HaiConfigError } from '@h-ai/core'
import { z } from 'zod'

// 方式 1：init 时自动加载整个配置目录
core.init({
  configDir: './config', // 扫描该目录所有 .yml 文件
  watchConfig: true, // 监听变更并自动重载
})

// 方式 2：手动加载单个文件（可选 Schema 校验）
const AppSchema = z.object({
  name: z.string(),
  port: z.number().default(3000),
})
const result = core.config.load('app', './config/app.yml', AppSchema)
if (result.success) {
  core.logger.info('Config loaded', { name: result.data.name })
}
else {
  core.logger.error('Config load failed', { code: result.error.code })
}

// 校验已加载的配置
const validResult = core.config.validate('app', AppSchema)

// 查询和获取
if (core.config.has('app')) {
  const cfg = core.config.get<typeof AppSchema>('app') // undefined 或配置
  const cfg2 = core.config.getOrThrow<typeof AppSchema>('app') // 未加载时抛异常
}
core.config.keys() // ['core', 'app', 'db', ...]

// 重新加载
const reloadResult = core.config.reload('app')

// 监听文件变更
const unwatch = core.config.watch('app', (newConfig, error) => {
  if (error) {
    core.logger.error('Config reload failed', { error })
    return
  }
  core.logger.info('Config updated', { config: newConfig })
})
unwatch() // 取消监听

// 清除缓存（同时停止对应监听）
core.config.clear('app') // 清除单个
core.config.clear() // 清除全部
```

#### 环境变量插值

`core.config.load()` 加载 YAML 时，自动对字符串值做 `${VAR}` 环境变量替换。

- `${VAR}` — 读取 `process.env.VAR`；若不存在则返回 `CONFIG_ENV_VAR_MISSING` 错误
- `${VAR:default}` — 读取 `process.env.VAR`；若不存在则使用冒号后的默认值

**类型还原：** 当整个值恰好是单个变量表达式（如 `${PORT:3000}`）时，插值结果按 YAML 规则还原为原生类型（number / boolean 等）。混合文本始终为字符串。

```yaml
# config/app.yml
debug: ${DEBUG:false} # → boolean false
port: ${PORT:3000} # → number 3000
database: ${DB_CONNECTION} # → 环境变量缺失时报错
url: http://${HOST}:${PORT} # → string（混合文本）
```

### ID 生成

```typescript
const id = core.id.generate() // nanoid 21 字符
const id8 = core.id.generate(8) // 自定义长度
const shortId = core.id.short() // 10 字符短 ID
const prefixed = core.id.withPrefix('user_') // 'user_V1StGXR...'
const traceId = core.id.trace() // 'trace-V1StGXR...'
const reqId = core.id.request() // 'req-V1StGXR...'
const uuid = core.id.uuid() // UUID v4

// 校验
core.id.isValidUUID('f47ac10b-...') // true/false
core.id.isValidNanoId('abc123', 6) // true/false
```

### 工具函数

```typescript
// 类型检查
core.typeUtils.isDefined(x) // x !== undefined
core.typeUtils.isObject(x) // plain object
core.typeUtils.isFunction(x)
core.typeUtils.isPromise(x)
core.typeUtils.isString(x)
core.typeUtils.isNumber(x)
core.typeUtils.isBoolean(x)
core.typeUtils.isArray(x)

// 对象操作
core.object.deepClone(obj)
core.object.deepMerge(a, b) // 递归合并（防原型污染）
core.object.deepMerge(a, b, c) // 支持多个对象
core.object.pick(obj, ['a', 'b'])
core.object.omit(obj, ['c', 'd'])
core.object.keys(obj) // typed Object.keys
core.object.values(obj)
core.object.entries(obj)
core.object.fromEntries(entries)

// 字符串操作
core.string.capitalize('hello') // 'Hello'
core.string.kebabCase('helloWorld') // 'hello-world'
core.string.camelCase('hello-world') // 'helloWorld'
core.string.snakeCase('helloWorld') // 'hello_world'
core.string.pascalCase('hello-world') // 'HelloWorld'
core.string.truncate('long text', 5) // 'long ...'
core.string.trim(' hello ') // 'hello'
core.string.isBlank('') // true
core.string.isNotBlank('x') // true
core.string.padStart('5', 3, '0') // '005'
core.string.padEnd('5', 3, '0') // '500'
core.string.constantTimeEqual(a, b) // 防时序攻击比较

// 数组操作
core.array.unique([1, 1, 2]) // [1, 2]
core.array.chunk([1, 2, 3, 4], 2) // [[1,2], [3,4]]
core.array.groupBy(items, item => item.type) // Record<string, T[]>
core.array.first([1, 2, 3]) // 1
core.array.last([1, 2, 3]) // 3
core.array.flatten([[1], [2, 3]]) // [1, 2, 3]
core.array.compact([1, null, 2]) // [1, 2]
core.array.shuffle([1, 2, 3]) // 随机排列
core.array.intersection([1, 2], [2, 3]) // [2]
core.array.difference([1, 2], [2, 3]) // [1]

// 异步操作
await core.async.delay(1000)
await core.async.withTimeout(fetch('/api'), 5000)
await core.async.retry(fn, { maxRetries: 3, delay: 1000 })
await core.async.parallel(items, processFn, 5) // 并发限制
await core.async.serial(items, processFn)
const debouncedFn = core.async.debounce(fn, 300)
const throttledFn = core.async.throttle(fn, 200)

// 时间操作
core.time.formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')
core.time.timeAgo(new Date(Date.now() - 60000)) // '1 分钟前'
core.time.now() // Date.now()
core.time.nowSeconds() // Math.floor(Date.now() / 1000)
core.time.parseDate('2024-01-01')
core.time.isValidDate(date)
core.time.addDays(date, 7)
core.time.addHours(date, 2)
core.time.startOfDay(date)
core.time.endOfDay(date)
```

### 模块基础工具（module）

提供各模块共用的初始化错误处理：

```typescript
import { core } from '@h-ai/core'

const notInitialized = core.module.createNotInitializedKit<DbError>(
  DbErrorCode.NOT_INITIALIZED,
  () => dbM('db_notInitialized'),
)

// 创建占位 Proxy（异步接口，默认）
const currentDdl: DdlOperations = notInitialized.proxy<DdlOperations>()
// 创建占位 Proxy（同步接口）
const currentHash: HashOperations = notInitialized.proxy<HashOperations>('sync')
```

## 错误处理

### Result 类型

所有可能失败的操作返回 `HaiResult<T>`：

```typescript
import type { HaiResult } from '@h-ai/core'
import { core, err, HaiCommonError, ok } from '@h-ai/core'

function divide(a: number, b: number): HaiResult<number> {
  if (b === 0)
    return err(HaiCommonError.VALIDATION_ERROR, 'Division by zero')
  return ok(a / b)
}

const result = divide(10, 2)
if (result.success) {
  core.logger.info('Result', { data: result.data })
}
else {
  core.logger.error('Error', { error: result.error })
}
```

### 自定义错误码（模块级）

```typescript
import type { ErrorInfo } from '@h-ai/core'
import { core } from '@h-ai/core'

// 定义错误码（格式 'code:httpStatus'）
const DbErrorInfo = {
  NOT_INITIALIZED: '001:500',
  CONNECTION_FAILED: '010:500',
  QUERY_FAILED: '011:500',
} as const satisfies ErrorInfo

// 生成错误定义对象
export const DbError = core.error.buildHaiErrorsDef('db', DbErrorInfo)
// DbError.CONNECTION_FAILED → { code: 'hai:db:010', httpStatus: 500, system: 'hai', module: 'db' }

// 创建错误实例
const errorInst = core.error.buildHaiErrorInst(
  DbError.CONNECTION_FAILED,
  'Unable to connect to PostgreSQL',
  originalError, // cause（可选）
  'Check connection string', // suggestion（可选）
)
```

### 配置错误码

```typescript
import { HaiConfigError } from '@h-ai/core'

HaiConfigError.CONFIG_FILE_NOT_FOUND // hai:core:010 - 配置文件不存在
HaiConfigError.CONFIG_PARSE_ERROR // hai:core:011 - YAML 解析失败
HaiConfigError.CONFIG_VALIDATION_ERROR // hai:core:012 - Schema 校验失败
HaiConfigError.CONFIG_ENV_VAR_MISSING // hai:core:013 - 环境变量缺失
HaiConfigError.CONFIG_NOT_LOADED // hai:core:014 - 配置未加载
```

## 测试

```bash
pnpm --filter @h-ai/core test
```

## License

Apache-2.0
