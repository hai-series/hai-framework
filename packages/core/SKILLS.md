# @h-ai/core Skills

> 此文件描述 @h-ai/core 模块的 API 调用方式，供 AI 助手参考。

## 1. 模块概述

`@h-ai/core` 是 hai-framework 的核心基础模块，提供统一的 core 服务对象，聚合日志、配置、ID 生成、i18n 与基础工具函数。Node.js 与浏览器 API 形态一致（浏览器不支持 `core.config`）。

## 2. 入口与初始化

### 导入

```typescript
import type { InterpolationParams, Locale, LocaleInfo, LocaleMessages, Logger, MessageDictionary, MessageOptions, PaginatedResult, PaginationOptions, PaginationOptionsInput, Result } from '@h-ai/core'
import { CommonErrorCode, ConfigErrorCode, core, CoreConfigSchema, err, ok } from '@h-ai/core'
```

### Node.js 初始化（可选）

```typescript
core.init({
  configDir: './config',
  watchConfig: true,
  logging: { level: 'info' },
})
```

### 浏览器初始化（可选）

```typescript
core.init({ logging: { level: 'info' } })
```

> core 模块无显式 close 方法。

## 3. 目录结构

```
packages/core/
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
    index.ts                              # Node.js 入口（export * 聚合）
    core-index.browser.ts                 # 浏览器入口
    core-config.ts                        # 错误码 + Zod Schema + 配置类型
    core-types.ts                         # 公共类型（Result, Logger, i18n 类型等）
    core-main.ts                          # Core 对象工厂（通用部分）
    core-main.node.ts                     # Node.js Core 实例 + init
    core-main.browser.ts                  # 浏览器 Core 实例 + init
    i18n/
      core-i18n-utils.ts                  # i18n 工具实现 + coreM 消息获取器
    functions/
      core-function-config.ts             # 配置管理（Node.js 专用）
      core-function-id.ts                 # ID 生成
      core-function-logger.node.ts        # Logger（Node.js，基于 pino）
      core-function-logger.browser.ts     # Logger（浏览器，基于 loglevel）
    utils/
      core-util-array.ts                  # 数组工具
      core-util-async.ts                  # 异步工具
      core-util-module.ts                 # 模块初始化工具（createNotInitializedKit）
      core-util-object.ts                 # 对象工具
      core-util-string.ts                 # 字符串工具
      core-util-time.ts                   # 时间工具
      core-util-type.ts                   # 类型检查工具
  tests/
```

## 4. 配置说明

### CoreOptions（core.init 参数）

| 字段          | 类型                     | 默认值  | 说明                       |
| ------------- | ------------------------ | ------- | -------------------------- |
| `logging`     | `Partial<LoggingConfig>` | —       | 日志配置                   |
| `configDir`   | `string`                 | —       | 配置目录路径（仅 Node.js） |
| `watchConfig` | `boolean`                | `false` | 是否监听配置文件变更       |

### LoggingConfig

| 字段      | 类型                                                           | 默认值   | 说明       |
| --------- | -------------------------------------------------------------- | -------- | ---------- |
| `level`   | `'trace' \| 'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal'` | `'info'` | 日志级别   |
| `format`  | `'json' \| 'pretty'`                                           | `'json'` | 日志格式   |
| `context` | `Record<string, unknown>`                                      | —        | 默认上下文 |
| `redact`  | `string[]`                                                     | `[]`     | 脱敏字段   |

### CoreConfigSchema（\_core.yml）

| 字段            | 类型                                                   | 默认值           | 说明     |
| --------------- | ------------------------------------------------------ | ---------------- | -------- |
| `name`          | `string`                                               | `'hai Admin'`    | 应用名称 |
| `version`       | `string`                                               | `'0.1.0'`        | 应用版本 |
| `env`           | `'development' \| 'production' \| 'test' \| 'staging'` | `'development'`  | 运行环境 |
| `debug`         | `boolean`                                              | `false`          | 调试模式 |
| `logging`       | `LoggingConfig`                                        | —                | 日志配置 |
| `id`            | `{ prefix?: string, length?: number }`                 | `{ length: 21 }` | ID 配置  |
| `defaultLocale` | `string`                                               | `'zh-CN'`        | 默认语言 |

## 5. 操作接口

### 日志 — core.logger

```typescript
core.logger.trace('详细跟踪')
core.logger.debug('调试信息')
core.logger.info('一般信息', { key: 'value' })
core.logger.warn('警告')
core.logger.error('错误', { error: err })
core.logger.fatal('致命错误')

// 子 Logger
const logger = core.logger.child({ module: 'api' })

// 动态配置
core.configureLogger({ level: 'debug', format: 'pretty' })
core.setLogLevel('warn')
core.getLogLevel() // 'warn'
core.createLogger({ name: 'service', level: 'debug' })
```

### ID 生成 — core.id

```typescript
core.id.generate() // 标准 nanoid（21 位）
core.id.generate(10) // 指定长度
core.id.short() // 短 ID（10 位）
core.id.withPrefix('user_') // 带前缀 ID
core.id.trace() // trace-xxx
core.id.request() // req-xxx
core.id.uuid() // UUID v4
core.id.isValidUUID(str) // 验证 UUID
core.id.isValidNanoId(str) // 验证 nanoid
```

### 配置管理 — core.config（仅 Node.js）

```typescript
// 加载
core.config.load('core', './config/_core.yml', CoreConfigSchema)

// 获取
const cfg = core.config.get<CoreConfig>('core')
const cfg2 = core.config.getOrThrow<CoreConfig>('core')

// 校验（模块使用前必须显式校验）
core.config.validate('db', DbConfigSchema)

// 查询
core.config.has('core')
core.config.keys()

// 重载 / 清除
core.config.reload('core')
core.config.clear()
core.config.clear('core')

// 监听
const unwatch = core.config.watch('core', (newConfig, error) => {
  // 处理配置变更
})
core.config.isWatching('core')
unwatch()
core.config.unwatch('core')
core.config.unwatch()
```

### 国际化 — core.i18n

```typescript
// 设置 / 获取全局 locale
core.i18n.setGlobalLocale('en-US')
core.i18n.getGlobalLocale()

// 创建消息获取器（读取全局 locale）
const xxM = core.i18n.createMessageGetter<XxMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
xxM('xx_notInitialized')
xxM('xx_initFailed', { params: { error: 'timeout' } })
xxM('xx_hello', { locale: 'en-US' })

// 工具
core.i18n.detectBrowserLocale()
core.i18n.resolveLocale('fr-FR') // 回退到 zh-CN
core.i18n.isLocaleSupported('zh-CN')
core.i18n.interpolate('Hello, {name}!', { name: 'World' })

// 订阅
const unsub = core.i18n.subscribeLocale((locale) => {
  // 处理 locale 变更
})
unsub()

// 注册 / 获取消息
core.i18n.registerMessages('demo', { 'zh-CN': { ok: '好' }, 'en-US': { ok: 'OK' } })
core.i18n.getRegisteredMessage('demo', 'ok')
```

### 类型检查 — core.typeUtils

```typescript
core.typeUtils.isDefined(value)
core.typeUtils.isObject(value)
core.typeUtils.isArray(value)
core.typeUtils.isString(value)
core.typeUtils.isNumber(value)
core.typeUtils.isBoolean(value)
core.typeUtils.isFunction(value)
core.typeUtils.isPromise(value)
```

### 对象操作 — core.object

```typescript
core.object.deepClone(obj)
core.object.deepMerge(target, source)
core.object.pick(obj, ['a', 'b'])
core.object.omit(obj, ['password'])
core.object.keys(obj)
core.object.values(obj)
core.object.entries(obj)
core.object.fromEntries(entries)
```

### 字符串操作 — core.string

```typescript
core.string.capitalize('hello')
core.string.camelCase('hello-world')
core.string.kebabCase('helloWorld')
core.string.snakeCase('helloWorld')
core.string.pascalCase('hello-world')
core.string.truncate('long text', 5)
core.string.trim('  hi  ')
core.string.isBlank('   ')
core.string.isNotBlank('hi')
core.string.padStart('1', 3, '0')
core.string.padEnd('1', 3, '0')
```

### 数组操作 — core.array

```typescript
core.array.unique([1, 1, 2])
core.array.groupBy(arr, item => item.type)
core.array.chunk([1, 2, 3, 4, 5], 2)
core.array.first([1, 2, 3])
core.array.last([1, 2, 3])
core.array.flatten([[1], [2, 3]])
core.array.compact([0, null, 1])
core.array.shuffle([1, 2, 3])
core.array.intersection([1, 2], [2, 3])
core.array.difference([1, 2, 3], [2])
```

### 异步操作 — core.async

```typescript
await core.async.delay(1000)
await core.async.withTimeout(promise, 5000)
await core.async.retry(fn, { maxRetries: 3, delay: 1000 })
await core.async.parallel([1, 2, 3], async n => n * 2, 2)
await core.async.serial([1, 2, 3], async n => n * 2)
const debounced = core.async.debounce(fn, 300)
const throttled = core.async.throttle(fn, 300)
```

### 时间操作 — core.time

```typescript
core.time.formatDate(date, 'YYYY-MM-DD HH:mm:ss')
core.time.timeAgo(date)
core.time.now()
core.time.nowSeconds()
core.time.parseDate('2024-01-15')
core.time.isValidDate(date)
core.time.addDays(date, 7)
core.time.addHours(date, 1)
core.time.startOfDay(date)
core.time.endOfDay(date)
```

### Result 类型

```typescript
import type { Result } from '@h-ai/core'
import { err, ok } from '@h-ai/core'

function divide(a: number, b: number): Result<number, string> {
  if (b === 0)
    return err('Division by zero')
  return ok(a / b)
}

const result = divide(10, 2)
if (result.success) {
  // result.data: number
}
else {
  // result.error: string
}
```

### 分页类型

```typescript
import type { PaginatedResult, PaginationOptions, PaginationOptionsInput } from '@h-ai/core'

const options: PaginationOptionsInput = { page: 1, pageSize: 20 }
const result: PaginatedResult<string> = { items: ['a'], total: 1, page: 1, pageSize: 20 }
```

### 模块初始化工具 — core.module

```typescript
// 各模块在 main.ts 中使用，创建未初始化错误工具集
const notInitialized = core.module.createNotInitializedKit<XxError>(
  XxErrorCode.NOT_INITIALIZED,
  () => xxM('xx_notInitialized'),
)

// 创建未初始化占位 Proxy
const notInitializedOps = notInitialized.proxy<XxOperations>()

// 在 get 访问器中使用
// get operations() { return currentOps ?? notInitializedOps }
```

## 6. Client 接口

core 模块无独立 Client，浏览器入口通过 `core-index.browser.ts` 提供。

## 7. 错误码

### CommonErrorCode（1000-1099）

| 错误码         | 值   | 说明       |
| -------------- | ---- | ---------- |
| `UNKNOWN`      | 1000 | 未知错误   |
| `VALIDATION`   | 1001 | 验证失败   |
| `NOT_FOUND`    | 1002 | 资源不存在 |
| `UNAUTHORIZED` | 1003 | 未授权     |
| `FORBIDDEN`    | 1004 | 无权限     |
| `CONFLICT`     | 1005 | 冲突       |
| `INTERNAL`     | 1006 | 内部错误   |
| `TIMEOUT`      | 1007 | 超时       |
| `NETWORK`      | 1008 | 网络错误   |

### ConfigErrorCode（1100-1199）

| 错误码             | 值   | 说明           |
| ------------------ | ---- | -------------- |
| `FILE_NOT_FOUND`   | 1100 | 配置文件不存在 |
| `PARSE_ERROR`      | 1101 | 解析失败       |
| `VALIDATION_ERROR` | 1102 | 校验失败       |
| `ENV_VAR_MISSING`  | 1103 | 环境变量缺失   |
| `NOT_LOADED`       | 1104 | 配置未加载     |

## 8. 注意事项

- `core.config` 仅 Node.js 可用，浏览器环境下不存在。
- `core.init` 会统一加载配置文件，但不会自动校验各模块配置。模块使用前必须显式调用 `core.config.validate(name, schema)`。
- 所有模块的日志统一使用 `core.logger.child({ module: 'xx' })`，禁止 `console.log`。
- i18n 消息键统一使用 `{module}_camelCase` 格式，如 `core_errorTimeout`、`db_notInitialized`。
- 各模块通过 `core.i18n.createMessageGetter(messages)` 创建自己的消息获取器，读取全局 locale。
- `core.module.createNotInitializedKit` 用于各模块创建未初始化错误处理，实现 `get` 访问器模式。
