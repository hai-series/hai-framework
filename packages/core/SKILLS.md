# @hai/core Skills

> 此文件描述 @hai/core 模块的 API 调用方式，供 AI 助手参考。

## 模块简介

`@hai/core` 提供统一的 core 服务对象，包含日志、配置、ID、i18n 与基础工具函数。
Node.js 与浏览器 API 形态一致（浏览器不支持 `core.config`）。

## 导入

```typescript
import type { Logger, Result } from '@hai/core'
import { CommonErrorCode, ConfigErrorCode, core, CoreConfigSchema, err, ok } from '@hai/core'
```

## 初始化/关闭

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
import { core } from '@hai/core'

core.init({ logging: { level: 'info' } })
```

> 说明：core 模块无显式 close 方法。

## 日志 - core.logger

```typescript
core.logger.trace('详细跟踪')
core.logger.debug('调试信息')
core.logger.info('一般信息', { key: 'value' })
core.logger.warn('警告')
core.logger.error('错误', { error: err })
core.logger.fatal('致命错误')

const logger = core.createLogger({ context: { service: 'api' } })

core.configureLogger({ level: 'debug', format: 'pretty' })
core.setLogLevel('warn')
core.getLogLevel() // 'warn'
```

## ID 生成 - core.id

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

## 配置管理 - core.config（仅 Node.js）

```typescript
const result = core.config.load('core', './config/_core.yml', CoreConfigSchema)

const cfg = core.config.get('core')
const cfg2 = core.config.getOrThrow('core')

core.config.has('core')
core.config.reload('core')
core.config.keys()
core.config.clear()

const unwatch = core.config.watch('core', (newConfig, error) => {
  if (error) {
    // 可记录错误
  }
  else {
    // 处理配置变更
  }
})

core.config.isWatching('core')

unwatch()
core.config.unwatch('core')
core.config.unwatch()
```

> 注意：core.init 会统一加载配置文件，但不会自动校验各模块配置。
> 模块使用前请显式调用 `core.config.validate(name, schema)` 进行校验。

### core.config 关键参数说明

- `load(name, filePath, schema?)`
  - `name`：配置名称（缓存 key）
  - `filePath`：配置文件路径
  - `schema`：可选 Zod 校验
- `validate(name, schema)`：对已加载配置进行校验并写回缓存
- `watch(name, callback)`：监听配置变更
  - `callback(config, error)`：成功时返回新配置，失败时返回错误

## 类型检查 - core.typeUtils

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

## 对象操作 - core.object

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

## 字符串操作 - core.string

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

## 数组操作 - core.array

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

## 异步操作 - core.async

```typescript
await core.async.delay(1000)
await core.async.withTimeout(promise, 5000)
await core.async.retry(fn, { maxRetries: 3 })
await core.async.parallel([1, 2, 3], async n => n * 2, 2)
await core.async.serial([1, 2, 3], async n => n * 2)
const debounced = core.async.debounce(fn, 300)
const throttled = core.async.throttle(fn, 300)
```

## 时间操作 - core.time

```typescript
core.time.formatDate(date)
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

## 国际化 - core.i18n

```typescript
core.i18n.setGlobalLocale('en-US')
core.i18n.getGlobalLocale()

const getMessage = core.i18n.createMessageGetter({
  'zh-CN': { hello: '你好 {name}' },
  'en-US': { hello: 'Hello {name}' },
})

getMessage('hello', { params: { name: 'World' } })
getMessage('hello', { locale: 'en-US' })

core.i18n.detectBrowserLocale()
core.i18n.resolveLocale('fr-FR')
core.i18n.isLocaleSupported('zh-CN')
core.i18n.interpolate('Hello, {name}!', { name: 'World' })
```

## Result 类型

```typescript
function divide(a: number, b: number): Result<number, string> {
  if (b === 0)
    return err('除数不能为零')
  return ok(a / b)
}
```

## 配置 Schema

```typescript
import { CoreConfigSchema } from '@hai/core'
```

## 错误码

```typescript
import { CommonErrorCode, ConfigErrorCode } from '@hai/core'
```

## 环境支持

- **Node.js**：完整功能支持
- **浏览器**：除 `core.config` 外全部支持
