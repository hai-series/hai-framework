# @hai/core Skills

> 此文件描述 @hai/core 模块的 API 调用方式，供 AI 助手参考。

## 导入

```typescript
import type { Logger, Result } from '@hai/core'
import { CommonErrorCode, ConfigErrorCode, core, CoreConfigSchema, err, ok } from '@hai/core'
```

## 核心 API

所有功能统一通过 `core` 对象访问。

### 初始化

```typescript
// 初始化（可选，仅 Node.js，加载配置文件）
core.init({
  silent: false,
  logging: { level: 'info' },
  configs: [
    { name: 'core', filePath: './config/_core.yml', schema: CoreConfigSchema },
  ],
  watchConfig: true,
})
```

```typescript
// 浏览器初始化（可选）
import { initCore } from '@hai/core'

initCore({
  logging: { level: 'info' },
})
```

### 日志 - core.logger

```typescript
core.logger.trace('详细跟踪')
core.logger.debug('调试信息')
core.logger.info('一般信息', { key: 'value' })
core.logger.warn('警告')
core.logger.error('错误', { error: err })
core.logger.fatal('致命错误')

// 创建独立 logger
const logger = core.createLogger({ context: { service: 'api' } })

// 配置日志
core.configureLogger({ level: 'debug', format: 'pretty' })
core.setLogLevel('warn')
core.getLogLevel() // 'warn'
```

### ID 生成 - core.id

```typescript
core.id.generate() // 标准 nanoid (21位)
core.id.generate(10) // 指定长度
core.id.short() // 短 ID (10位)
core.id.withPrefix('user_') // 带前缀 ID
core.id.trace() // trace-xxx
core.id.request() // req-xxx
core.id.uuid() // UUID v4

core.id.isValidUUID(str) // 验证 UUID
core.id.isValidNanoId(str) // 验证 nanoid
```

### 配置管理 - core.config（仅 Node.js）

```typescript
// 加载配置
const result = core.config.load('core', './config/_core.yml', CoreConfigSchema)

// 获取配置
const cfg = core.config.get('core')
const cfg = core.config.getOrThrow('core') // 不存在则抛出异常

// 检查/重新加载
core.config.has('core') // true/false
core.config.reload('core') // 重新加载
core.config.keys() // ['core', ...]
core.config.clear() // 清空所有

// 监听变更（文件变更或手动 reload）
const unwatch = core.config.watch('core', (newConfig, error) => {
  if (error) {
    // 这里可以记录错误或做兜底处理
  }
  else {
    // 在此处理配置变更（例如：热更新某些运行时参数）
  }
})

core.config.isWatching('core') // true/false

// 停止监听
unwatch()
core.config.unwatch('core')
core.config.unwatch() // 停止全部
```

### 类型检查 - core.type

```typescript
core.type.isDefined(value) // 非 null/undefined
core.type.isObject(value) // 对象（排除数组）
core.type.isArray(value) // 数组
core.type.isString(value) // 字符串
core.type.isNumber(value) // 数字
core.type.isBoolean(value) // 布尔
core.type.isFunction(value) // 函数
core.type.isPromise(value) // Promise
```

### 对象操作 - core.object

```typescript
core.object.deepClone(obj) // 深拷贝
core.object.deepMerge(target, source) // 深合并
core.object.pick(obj, ['a', 'b']) // 选取属性
core.object.omit(obj, ['password']) // 排除属性
core.object.keys(obj) // 类型安全的 keys
core.object.values(obj) // 类型安全的 values
core.object.entries(obj) // 类型安全的 entries
core.object.fromEntries(entries) // 从 entries 创建对象
```

### 字符串操作 - core.string

```typescript
core.string.capitalize('hello') // 'Hello'
core.string.camelCase('hello-world') // 'helloWorld'
core.string.kebabCase('helloWorld') // 'hello-world'
core.string.snakeCase('helloWorld') // 'hello_world'
core.string.pascalCase('hello-world') // 'HelloWorld'
core.string.truncate('long text', 5) // 'long ...'
core.string.trim('  hi  ') // 'hi'
core.string.isBlank('   ') // true
core.string.isNotBlank('hi') // true
core.string.padStart('1', 3, '0') // '001'
core.string.padEnd('1', 3, '0') // '100'
```

### 数组操作 - core.array

```typescript
core.array.unique([1, 1, 2]) // [1, 2]
core.array.groupBy(arr, item => item.type)
core.array.chunk([1, 2, 3, 4, 5], 2) // [[1,2], [3,4], [5]]
core.array.first([1, 2, 3]) // 1
core.array.last([1, 2, 3]) // 3
core.array.flatten([[1], [2, 3]]) // [1, 2, 3]
core.array.compact([0, null, 1]) // [0, 1]
core.array.shuffle([1, 2, 3]) // 随机打乱
core.array.intersection([1, 2], [2, 3]) // [2]
core.array.difference([1, 2, 3], [2]) // [1, 3]
```

### 异步操作 - core.async

```typescript
await core.async.delay(1000) // 延迟 1 秒
await core.async.withTimeout(promise, 5000) // 超时控制
await core.async.retry(fn, { maxRetries: 3 }) // 重试
await core.async.parallel([1, 2, 3], async n => n * 2, 2) // 并发处理
await core.async.serial([1, 2, 3], async n => n * 2) // 串行处理
const debounced = core.async.debounce(fn, 300) // 防抖
const throttled = core.async.throttle(fn, 300) // 节流
```

### 时间操作 - core.time

```typescript
core.time.formatDate(date) // '2024-01-15'
core.time.timeAgo(date) // '5分钟前'
core.time.now() // 当前时间戳（毫秒）
core.time.nowSeconds() // 当前时间戳（秒）
core.time.parseDate('2024-01-15') // Date
core.time.isValidDate(date) // 是否有效日期
core.time.addDays(date, 7) // 7天后
core.time.addHours(date, 1) // 1小时后
core.time.startOfDay(date) // 当天 00:00:00
core.time.endOfDay(date) // 当天 23:59:59
```

### 国际化 - core.i18n

通过 `core.i18n` 访问所有 i18n 功能。

```typescript
import { core } from '@hai/core'

// 设置全局 locale（所有模块自动同步）
core.i18n.setGlobalLocale('en-US')
core.i18n.getGlobalLocale() // 'en-US'

// 支持短格式自动扩展
core.i18n.setGlobalLocale('en') // 自动变为 'en-US'
core.i18n.setGlobalLocale('zh') // 自动变为 'zh-CN'
```

```typescript
// 为模块创建消息获取器
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

const { getMessage } = core.i18n.createMessageGetter({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
// createMessageGetter 会读取全局 locale

// 使用消息
getMessage('error_not_found') // 根据当前 locale 返回
getMessage('error_not_found', { locale: 'en-US' }) // 指定 locale
getMessage('welcome', { params: { name: 'World' } }) // 带插值

// 浏览器语言检测
const browserLocale = core.i18n.detectBrowserLocale() // 'zh-CN' | 'en-US' | undefined

// 语言解析（不支持时回退到默认）
core.i18n.resolveLocale('fr-FR') // 'zh-CN'（回退）
core.i18n.resolveLocale('en-US') // 'en-US'

// 检查语言是否支持
core.i18n.isLocaleSupported('zh-CN') // true
core.i18n.isLocaleSupported('fr-FR') // false

// 字符串插值
core.i18n.interpolate('Hello, {name}!', { name: 'World' }) // 'Hello, World!'
```

## Result 类型

```typescript
import type { Result } from '@hai/core'
import { core, err, ok } from '@hai/core'

function divide(a: number, b: number): Result<number, string> {
  if (b === 0)
    return err('除数不能为零')
  return ok(a / b)
}

const result = divide(10, 2)
if (result.success) {
  core.logger.info(`Result: ${result.data}`) // 5
}
else {
  core.logger.error(`Error: ${result.error}`)
}
```

## 配置 Schema

```typescript
import {
  CoreConfigSchema,
} from '@hai/core'
```

其他模块的配置 Schema 请从对应模块导入（如 `@hai/db`、`@hai/iam` 等）。

## 错误码

```typescript
import {
  CommonErrorCode, // 1000-1099 通用
  ConfigErrorCode, // 1100-1199 配置
} from '@hai/core'
```

## 环境支持

- **Node.js**: 完整功能支持
- **浏览器**: 除 `core.config` 外全部支持
