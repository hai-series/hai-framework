# @hai/core Skills

> 此文件描述 @hai/core 模块的 API 调用方式，供 AI 助手参考。

## 导入

```typescript
import { core, initCore, ok, err } from '@hai/core'
import type { Result, Logger } from '@hai/core'
import { AppConfigSchema, CommonErrorCode } from '@hai/core'
```

## 核心 API

所有功能统一通过 `core` 对象访问。

### 初始化

```typescript
// 初始化（可选，加载配置文件）
initCore({
  silent: false,
  logging: { level: 'info' },
  configs: [
    { name: 'app', filePath: './config/app.yml', schema: AppConfigSchema }
  ],
  watchConfig: true,
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
core.getLogLevel()  // 'warn'
```

### ID 生成 - core.id

```typescript
core.id.generate()           // 标准 nanoid (21位)
core.id.generate(10)         // 指定长度
core.id.short()              // 短 ID (10位)
core.id.withPrefix('user_')  // 带前缀 ID
core.id.trace()              // trace-xxx
core.id.request()            // req-xxx
core.id.uuid()               // UUID v4

core.isValidUUID(str)        // 验证 UUID
core.isValidNanoId(str)      // 验证 nanoid
```

### 配置管理 - core.config（仅 Node.js）

```typescript
// 加载配置
const result = core.config.load('app', './config/app.yml', AppConfigSchema)

// 获取配置
const cfg = core.config.get('app')
const cfg = core.config.getOrThrow('app')  // 不存在则抛出异常

// 检查/重新加载
core.config.has('app')       // true/false
core.config.reload('app')    // 重新加载
core.config.keys()           // ['app', ...]
core.config.clear()          // 清空所有

// 监听变更
core.config.onChange('app', (newConfig) => {
  console.log('配置已更新', newConfig)
})
```

### 类型检查 - core.type

```typescript
core.type.isDefined(value)     // 非 null/undefined
core.type.isNull(value)        // null
core.type.isUndefined(value)   // undefined
core.type.isObject(value)      // 对象（排除数组）
core.type.isPlainObject(value) // 纯对象
core.type.isArray(value)       // 数组
core.type.isString(value)      // 字符串
core.type.isNumber(value)      // 数字
core.type.isBoolean(value)     // 布尔
core.type.isFunction(value)    // 函数
core.type.isPromise(value)     // Promise
core.type.isDate(value)        // Date
core.type.isRegExp(value)      // RegExp
core.type.isEmpty(value)       // 空值
```

### 对象操作 - core.object

```typescript
core.object.deepClone(obj)              // 深拷贝
core.object.deepMerge(target, source)   // 深合并
core.object.pick(obj, ['a', 'b'])       // 选取属性
core.object.omit(obj, ['password'])     // 排除属性
core.object.get(obj, 'a.b.c')           // 安全获取嵌套属性
core.object.set(obj, 'a.b.c', value)    // 安全设置嵌套属性
core.object.has(obj, 'a.b.c')           // 检查嵌套属性
core.object.keys(obj)                   // 类型安全的 keys
core.object.values(obj)                 // 类型安全的 values
core.object.entries(obj)                // 类型安全的 entries
core.object.fromEntries(entries)        // 从 entries 创建对象
```

### 字符串操作 - core.string

```typescript
core.string.capitalize('hello')         // 'Hello'
core.string.camelCase('hello-world')    // 'helloWorld'
core.string.kebabCase('helloWorld')     // 'hello-world'
core.string.snakeCase('helloWorld')     // 'hello_world'
core.string.pascalCase('hello-world')   // 'HelloWorld'
core.string.truncate('long text', 5)    // 'long ...'
core.string.padStart('1', 3, '0')       // '001'
core.string.padEnd('1', 3, '0')         // '100'
core.string.template('Hello {name}', { name: 'World' })  // 'Hello World'
core.string.escapeHtml('<script>')      // '&lt;script&gt;'
core.string.unescapeHtml('&lt;')        // '<'
```

### 数组操作 - core.array

```typescript
core.array.unique([1, 1, 2])            // [1, 2]
core.array.groupBy(arr, item => item.type)
core.array.chunk([1,2,3,4,5], 2)        // [[1,2], [3,4], [5]]
core.array.first([1, 2, 3])             // 1
core.array.last([1, 2, 3])              // 3
core.array.flatten([[1], [2, 3]])       // [1, 2, 3]
core.array.compact([0, null, 1])        // [0, 1]
core.array.shuffle([1, 2, 3])           // 随机打乱
core.array.intersection([1,2], [2,3])   // [2]
core.array.difference([1,2,3], [2])     // [1, 3]
```

### 异步操作 - core.async

```typescript
await core.async.delay(1000)                           // 延迟 1 秒
await core.async.withTimeout(promise, 5000)            // 超时控制
await core.async.retry(fn, { maxRetries: 3 })          // 重试
await core.async.parallel([fn1, fn2], { concurrency: 2 })
const debounced = core.async.debounce(fn, 300)         // 防抖
const throttled = core.async.throttle(fn, 300)         // 节流
```

### 时间操作 - core.time

```typescript
core.time.formatDate(date)              // '2024-01-15'
core.time.formatTime(date)              // '14:30:00'
core.time.formatDateTime(date)          // '2024-01-15 14:30:00'
core.time.timeAgo(date)                 // '5分钟前'
core.time.isToday(date)                 // true/false
core.time.isSameDay(date1, date2)       // true/false
core.time.parseDate('2024-01-15')       // Date
core.time.addDays(date, 7)              // 7天后
core.time.addMonths(date, 1)            // 1个月后
core.time.startOfDay(date)              // 当天 00:00:00
core.time.endOfDay(date)                // 当天 23:59:59
```

## Result 类型

```typescript
import { ok, err, type Result } from '@hai/core'

function divide(a: number, b: number): Result<number, string> {
  if (b === 0) return err('除数不能为零')
  return ok(a / b)
}

const result = divide(10, 2)
if (result.success) {
  console.log(result.data)  // 5
} else {
  console.log(result.error)
}
```

## 配置 Schema

```typescript
import {
  AppConfigSchema,
  AIConfigSchema,
  DbConfigSchema,
  IAMConfigSchema,
  StorageConfigSchema,
  CryptoConfigSchema,
} from '@hai/core'
```

## 错误码

```typescript
import {
  CommonErrorCode,   // 1000-1099 通用
  ConfigErrorCode,   // 1100-1199 配置
  AuthErrorCode,     // 2000-2999 认证
  DbErrorCode,       // 3000-3999 数据库
  AIErrorCode,       // 4000-4999 AI
  StorageErrorCode,  // 5000-5999 存储
  CryptoErrorCode,   // 6000-6999 加密
} from '@hai/core'
```

## 环境支持

- **Node.js**: 完整功能支持
- **浏览器**: 除 `core.config` 外全部支持
