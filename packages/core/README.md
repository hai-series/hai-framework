# @hai/core

> hai Admin Framework 核心模块 - 提供基础工具、类型定义、配置管理和日志功能

[![npm version](https://img.shields.io/npm/v/@hai/core.svg)](https://www.npmjs.com/package/@hai/core)
[![License](https://img.shields.io/npm/l/@hai/core.svg)](https://github.com/hai-framework/hai/blob/main/LICENSE)

## 特性

- 🛠️ **核心工具** - ID 生成、类型检查、对象/字符串/数组操作、异步工具、时间处理
- 📝 **统一日志** - Node.js 基于 pino，浏览器基于 loglevel，统一 API
- ⚙️ **配置管理** - 支持 YAML 配置文件加载、验证和监听变更
- 📦 **Result 类型** - 函数式错误处理，告别 try-catch
- 🎯 **零配置** - 开箱即用，合理的默认值
- 🔒 **类型安全** - 完整的 TypeScript 类型定义
- 🌐 **同构支持** - 同时支持 Node.js 和浏览器环境

## 安装

```bash
pnpm add @hai/core
```

## 快速开始

所有功能统一通过 `core` 对象访问：

```typescript
import { core, initCore } from '@hai/core'

// 初始化（可选）
initCore({
  silent: false, // 是否静默启动
  configs: [ // 配置文件列表（Node.js）
    { path: './config/_app.yml', schema: AppConfigSchema, key: 'app' }
  ]
})

// 日志
core.logger.info('应用启动', { version: '1.0.0' })
core.logger.error('发生错误', { error: 'Connection failed' })

// ID 生成
const myId = core.id.generate() // 'V1StGXR8_Z5jdHi6B-myT'
const shortId = core.id.short() // 'dV3f2a9Km'
const traceId = core.id.trace() // 'trace-V1StGXR8_Z5jdHi6B-myT'
const uuid = core.id.uuid() // 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

// 类型检查
core.type.isDefined(value) // 非 null/undefined 检查
core.type.isObject(value) // 对象检查（排除数组）
core.type.isFunction(value) // 函数检查
core.type.isPromise(value) // Promise 检查

// 对象操作
const cloned = core.object.deepClone(obj)
const merged = core.object.deepMerge(obj1, obj2)
const picked = core.object.pick(obj, ['name', 'email'])
const omitted = core.object.omit(obj, ['password'])

// 字符串操作
core.string.capitalize('hello') // 'Hello'
core.string.kebabCase('helloWorld') // 'hello-world'
core.string.camelCase('hello-world') // 'helloWorld'
core.string.truncate('hello world', 5) // 'hello...'

// 数组操作
core.array.unique([1, 1, 2, 3]) // [1, 2, 3]
core.array.groupBy(users, u => u.role)
core.array.chunk([1, 2, 3, 4, 5], 2) // [[1,2], [3,4], [5]]

// 异步操作
await core.async.delay(1000)
await core.async.withTimeout(fetch('/api'), 5000)
await core.async.retry(() => fetch('/api'), { maxRetries: 3 })

// 时间操作
core.time.formatDate(new Date()) // '2024-01-15'
core.time.timeAgo(someDate) // '5分钟前'
```

## Result 类型

函数式错误处理，避免 try-catch 的嵌套：

```typescript
import type { Result } from '@hai/core'
import { core, err, ok } from '@hai/core'

// 定义返回 Result 的函数
function divide(a: number, b: number): Result<number, string> {
  if (b === 0) {
    return err('Division by zero')
  }
  return ok(a / b)
}

// 使用结果
const result = divide(10, 2)

if (result.success) {
  core.logger.info(`Result: ${result.data}`) // 5
}
else {
  core.logger.error(`Error: ${result.error}`)
}
```

## 配置管理（Node.js）

### 加载配置文件

```typescript
import { AppConfigSchema, core } from '@hai/core'

// 加载单个配置文件
const result = core.config.load('app', './config/_app.yml', AppConfigSchema)
if (result.success) {
  core.logger.info('App config loaded')
}

// 获取已加载的配置
const appConfig = core.config.get('app')

// 监听配置变更
core.config.onChange('app', (newConfig) => {
  core.logger.info('Config changed', { config: newConfig })
})
```

### 配置 Schema

模块提供了预定义的配置 Schema：

```typescript
import {
  AIConfigSchema, // AI 配置
  AppConfigSchema, // 应用配置
  CryptoConfigSchema, // 加密配置
  DbConfigSchema, // 数据库配置
  IAMConfigSchema, // 身份认证配置
  StorageConfigSchema, // 存储配置
} from '@hai/core'
```

## 日志

### 基本用法

```typescript
import { core } from '@hai/core'

// 使用默认 logger
core.logger.info('消息')
core.logger.error('错误', { error: err })

// 创建独立 logger
const logger = core.createLogger({ context: { service: 'api' } })
logger.info('API 启动')

// 配置日志级别
core.configureLogger({ level: 'debug', format: 'pretty' })
core.setLogLevel('warn')
```

### 日志级别

| 级别    | 说明             |
| ------- | ---------------- |
| `trace` | 最详细的跟踪信息 |
| `debug` | 调试信息         |
| `info`  | 一般信息（默认） |
| `warn`  | 警告             |
| `error` | 错误             |
| `fatal` | 致命错误         |

## 错误码

模块定义了统一的错误码：

| 范围      | 模块   | 示例                               |
| --------- | ------ | ---------------------------------- |
| 1000-1099 | 通用   | UNKNOWN, VALIDATION, NOT_FOUND     |
| 1100-1199 | 配置   | FILE_NOT_FOUND, PARSE_ERROR        |
| 2000-2999 | 认证   | INVALID_CREDENTIALS, TOKEN_EXPIRED |
| 3000-3999 | 数据库 | CONNECTION_FAILED, QUERY_FAILED    |
| 4000-4999 | AI     | API_ERROR, RATE_LIMIT              |
| 5000-5999 | 存储   | FILE_NOT_FOUND, UPLOAD_FAILED      |
| 6000-6999 | 加密   | ENCRYPT_FAILED, DECRYPT_FAILED     |

```typescript
import { AuthErrorCode, CommonErrorCode, ConfigErrorCode } from '@hai/core'

// 通用错误
CommonErrorCode.UNKNOWN // 1000
CommonErrorCode.VALIDATION // 1001
CommonErrorCode.NOT_FOUND // 1002

// 配置错误
ConfigErrorCode.FILE_NOT_FOUND // 1100
ConfigErrorCode.PARSE_ERROR // 1101
ConfigErrorCode.VALIDATION_ERROR // 1102
```

## API 参考

### core 对象

| 属性/方法                    | 说明                   |
| ---------------------------- | ---------------------- |
| `core.logger`                | 默认 Logger 实例       |
| `core.createLogger(opts?)`   | 创建新的 Logger 实例   |
| `core.configureLogger(opts)` | 配置默认 Logger        |
| `core.setLogLevel(level)`    | 设置日志级别           |
| `core.getLogLevel()`         | 获取当前日志级别       |
| `core.id`                    | ID 生成工具            |
| `core.config`                | 配置管理（仅 Node.js） |
| `core.type`                  | 类型检查工具           |
| `core.object`                | 对象操作工具           |
| `core.string`                | 字符串操作工具         |
| `core.array`                 | 数组操作工具           |
| `core.async`                 | 异步操作工具           |
| `core.time`                  | 时间操作工具           |

### core.id - ID 生成

| 方法                      | 说明                      |
| ------------------------- | ------------------------- |
| `core.id.generate(len?)`  | 生成 nanoid（默认 21 位） |
| `core.id.short()`         | 生成短 ID（10 位）        |
| `core.id.withPrefix(p)`   | 生成带前缀的 ID           |
| `core.id.trace()`         | 生成 trace ID             |
| `core.id.request()`       | 生成 request ID           |
| `core.id.uuid()`          | 生成 UUID v4              |
| `core.isValidUUID(str)`   | 验证 UUID 格式            |
| `core.isValidNanoId(str)` | 验证 nanoid 格式          |

### core.config - 配置管理（Node.js）

| 方法                                   | 说明                     |
| -------------------------------------- | ------------------------ |
| `core.config.load(name, path, schema)` | 加载配置文件             |
| `core.config.get(name)`                | 获取配置                 |
| `core.config.getOrThrow(name)`         | 获取配置（不存在则抛出） |
| `core.config.has(name)`                | 检查配置是否存在         |
| `core.config.reload(name)`             | 重新加载配置             |
| `core.config.onChange(name, cb)`       | 监听配置变更             |
| `core.config.clear()`                  | 清空所有配置             |
| `core.config.keys()`                   | 获取所有配置名称         |

### core.type - 类型检查

| 方法                         | 说明                   |
| ---------------------------- | ---------------------- |
| `core.type.isDefined(v)`     | 非 null/undefined 检查 |
| `core.type.isNull(v)`        | null 检查              |
| `core.type.isUndefined(v)`   | undefined 检查         |
| `core.type.isObject(v)`      | 对象检查（排除数组）   |
| `core.type.isPlainObject(v)` | 纯对象检查             |
| `core.type.isArray(v)`       | 数组检查               |
| `core.type.isString(v)`      | 字符串检查             |
| `core.type.isNumber(v)`      | 数字检查               |
| `core.type.isBoolean(v)`     | 布尔检查               |
| `core.type.isFunction(v)`    | 函数检查               |
| `core.type.isPromise(v)`     | Promise 检查           |
| `core.type.isDate(v)`        | Date 检查              |
| `core.type.isRegExp(v)`      | RegExp 检查            |
| `core.type.isEmpty(v)`       | 空值检查               |

### core.object - 对象操作

| 方法                            | 说明                |
| ------------------------------- | ------------------- |
| `core.object.deepClone(obj)`    | 深拷贝              |
| `core.object.deepMerge(a, b)`   | 深合并              |
| `core.object.pick(obj, keys)`   | 选取属性            |
| `core.object.omit(obj, keys)`   | 排除属性            |
| `core.object.get(obj, path)`    | 安全获取嵌套属性    |
| `core.object.set(obj, path, v)` | 安全设置嵌套属性    |
| `core.object.has(obj, path)`    | 检查嵌套属性存在    |
| `core.object.keys(obj)`         | 类型安全的 keys     |
| `core.object.values(obj)`       | 类型安全的 values   |
| `core.object.entries(obj)`      | 类型安全的 entries  |
| `core.object.fromEntries(arr)`  | 从 entries 创建对象 |

### core.string - 字符串操作

| 方法                              | 说明         |
| --------------------------------- | ------------ |
| `core.string.capitalize(str)`     | 首字母大写   |
| `core.string.camelCase(str)`      | 转驼峰命名   |
| `core.string.kebabCase(str)`      | 转短横线命名 |
| `core.string.snakeCase(str)`      | 转下划线命名 |
| `core.string.pascalCase(str)`     | 转帕斯卡命名 |
| `core.string.truncate(str, len)`  | 截断字符串   |
| `core.string.padStart(str, l, c)` | 左填充       |
| `core.string.padEnd(str, len, c)` | 右填充       |
| `core.string.template(str, data)` | 模板替换     |
| `core.string.escapeHtml(str)`     | HTML 转义    |
| `core.string.unescapeHtml(str)`   | HTML 反转义  |

### core.array - 数组操作

| 方法                            | 说明                |
| ------------------------------- | ------------------- |
| `core.array.unique(arr)`        | 去重                |
| `core.array.groupBy(arr, fn)`   | 按条件分组          |
| `core.array.chunk(arr, size)`   | 分块                |
| `core.array.first(arr)`         | 获取第一个元素      |
| `core.array.last(arr)`          | 获取最后一个元素    |
| `core.array.flatten(arr)`       | 扁平化              |
| `core.array.compact(arr)`       | 移除 null/undefined |
| `core.array.shuffle(arr)`       | 随机打乱            |
| `core.array.intersection(a, b)` | 交集                |
| `core.array.difference(a, b)`   | 差集                |

### core.async - 异步操作

| 方法                             | 说明         |
| -------------------------------- | ------------ |
| `core.async.delay(ms)`           | 延迟指定毫秒 |
| `core.async.withTimeout(p, ms)`  | 超时控制     |
| `core.async.retry(fn, opts)`     | 重试机制     |
| `core.async.parallel(fns, opts)` | 并发控制     |
| `core.async.debounce(fn, ms)`    | 防抖         |
| `core.async.throttle(fn, ms)`    | 节流         |

### core.time - 时间操作

| 方法                             | 说明                    |
| -------------------------------- | ----------------------- |
| `core.time.formatDate(date)`     | 格式化日期 YYYY-MM-DD   |
| `core.time.formatTime(date)`     | 格式化时间 HH:mm:ss     |
| `core.time.formatDateTime(date)` | 格式化日期时间          |
| `core.time.timeAgo(date)`        | 相对时间（如"5分钟前"） |
| `core.time.isToday(date)`        | 是否今天                |
| `core.time.isSameDay(a, b)`      | 是否同一天              |
| `core.time.parseDate(str)`       | 解析日期字符串          |
| `core.time.addDays(date, n)`     | 增加天数                |
| `core.time.addMonths(date, n)`   | 增加月数                |
| `core.time.startOfDay(date)`     | 当天开始时间            |
| `core.time.endOfDay(date)`       | 当天结束时间            |

### Result 类型

| 函数/类型      | 说明         |
| -------------- | ------------ |
| `ok(data)`     | 创建成功结果 |
| `err(error)`   | 创建失败结果 |
| `Result<T, E>` | 结果类型     |

## 浏览器支持

模块在浏览器环境下会自动使用轻量级实现：

- 日志使用 `loglevel` 替代 `pino`
- 配置文件功能在浏览器环境下不可用
- 其他功能完全兼容

```typescript
// 浏览器中使用
import { core } from '@hai/core'

// 所有工具函数正常工作
const myId = core.id.generate()
const isObj = core.type.isObject({})
const merged = core.object.deepMerge(a, b)

// 日志输出到 console
core.logger.info('Hello from browser')
```

## 与其他 @hai 模块集成

```typescript
import { ai } from '@hai/ai'
import { core } from '@hai/core'
import { crypto } from '@hai/crypto'

// 所有模块共享 core 的 Result 类型和工具
const result = await crypto.password.hash('secret')
if (result.success) {
  core.logger.info('密码已哈希', { hash: result.data })
}

// 使用 core 生成请求 ID
const requestId = core.id.request()
const response = await ai.llm.chat({
  messages: [{ role: 'user', content: 'Hello' }]
})
```

## 许可证

Apache-2.0
