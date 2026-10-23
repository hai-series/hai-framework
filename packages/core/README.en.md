# @h-ai/core

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md)

## Introduction

The core of hai Agent Framework: shared utilities, types, configuration management, and logging.

## Core features

- **HaiResult types**: functional error handling (`ok` / `err`) with a shared result format across modules.
- **Unified logging**: pino on Node.js and loglevel in browsers, with the same API.
- **Internationalization (i18n)**: centralized locale management and typed message getters.
- **Zod validation error mapping**: Zod v3/v4 issue extraction and localization of default English messages.
- **Configuration management**: YAML loading, convention-based environment mapping, explicit interpolation, Zod validation, and file watching (Node.js only).
- **ID generation**: nanoid and UUID v4.
- **Error definitions**: standardized codes and consistent error definitions and instances across modules.
- **Module utilities**: NotInitializedKit proxies and shared lifecycle infrastructure.
- **Utility library**: type checks and object / string / array / async / time operations.

## Getting started

### Quick start

#### Node.js environment

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
core.sanitize.sanitizeSensitiveFields({ password: 'secret', email: 'user@example.com' })
core.string.capitalize('hello')
core.array.unique([1, 1, 2, 3])
core.array.chunk([1, 2, 3, 4, 5], 2) // [[1,2], [3,4], [5]]
await core.async.delay(1000)
await core.async.retry(() => fetchData(), { maxRetries: 3, delay: 1000 })
core.time.formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')
core.typeUtils.isDefined(value)
```

#### Browser environment

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

The browser retains the `core.config` API shape for type compatibility, but does not support file configuration:

- `core.config.get()` returns `undefined`, `has()` returns `false`, and `keys()` returns `[]`.
- `loadEnvFiles()` / `load()` / `validate()` / `reload()` return `HaiCommonError.SERVICE_UNAVAILABLE`.
- `watch()` immediately calls its callback with the same error and returns a safe no-op unsubscribe function.
- Read configuration on the server and deliver it through an API, or use `core.init({ logging })` only to configure browser logging.

### Detailed API

#### Logging (Logger)

`core.logger` is both the default Logger instance and the shared entry point for logger management.

##### Write logs

Six levels: `trace` / `debug` / `info` / `warn` / `error` / `fatal`.

```typescript
core.logger.info('User created', { userId: '123' })
core.logger.error('Failed to connect', { error })
core.logger.debug('Processing item', { id, step: 'validation' })
```

##### Create a module logger

```typescript
// 独立名称空间，适合模块内全局使用
const logger = core.logger.create({ name: 'payment' })
logger.info('Payment processed')
```

##### Child loggers

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

> **Typical usage**: create `reqLogger` at the request entry, pass it to the service layer, and add operation context with `child`. Logs then include the complete request context.

##### Logger management

```typescript
// 配置输出格式和级别（Node.js / Browser）
core.logger.configure({
  level: 'info',
  format: 'json', // 'json' | 'pretty'
  context: { app: 'my-service' }, // 全局默认上下文
  redact: ['password', 'token'], // 脱敏字段
})

core.logger.setLevel('debug')
const level = core.logger.getLevel() // 'debug'
```

After `core.init()` loads `_core.yml.logging`, or after `configure` / `setLevel`, default, module and nested child loggers use current global configuration for subsequent output, including instances created before initialization. Explicit `create({ level, format, context })` options retain priority; omitted options inherit global configuration dynamically, and per-call context overrides fixed context. Additional `redact` rules apply to all these instances without recreating module loggers.

Browser logs still use the DevTools console: `pretty` prints readable messages with context, while `json` prints a JSON string containing `level` / `msg`. Default credential masking and configured path redaction both apply, including nested dot/bracket paths and `*`. Callers remain responsible for redacting message text.

Native `Error` values in log context are copied into diagnostics containing `name`, `message`, `stack`, `cause`, `AggregateError.errors`, and enumerable own context before default field/URL masking and configured `redact` paths run. Both backends use the same rules and leave the original error unchanged. Error-subgraph cycles become `[Circular]` and the 32-level limit becomes `[MaxDepth]`; custom replacements in these subgraphs follow the same normalization, while ordinary-object replacement behavior is unchanged. Ordinary-object cycles without an Error retain their original structure and are not guaranteed to be directly JSON-serializable. `name/message/stack` are free text: secrets embedded in them are not automatically parsed. Clean them before logging or mask whole paths such as `error.message` / `error.stack`.

`core.logger` redacts log context by default: credentials such as `password`, `token`, `secret`, `privateKey`, and `apiV3Key` become `[REDACTED]`. Fields such as `url` / `baseUrl` / `endpoint` mask embedded usernames/passwords, sensitive query parameters, and OAuth key/value fragments; malformed URLs return a fixed placeholder. Email addresses and phone numbers are not masked by default.

##### Log level conventions

| Level   | Use case                                            |
| ------- | --------------------------------------------------- |
| `trace` | Detailed debugging data inside loops                |
| `debug` | Function entry, parameter summaries, reads          |
| `info`  | Business events (initialized, write succeeded)      |
| `warn`  | Recoverable problems (validation failures, retries) |
| `error` | Operation failures requiring investigation          |
| `fatal` | Fatal errors preventing continued service           |

#### Internationalization (i18n)

Built-in locales are `zh-CN`, `en-US` and `ja-JP`. The `ja` alias normalizes to `ja-JP`; all modules share this setting.

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
core.i18n.DEFAULT_LOCALES // [{ code: 'zh-CN', label: '简体中文' }, { code: 'en-US', label: 'English' }, { code: 'ja-JP', label: '日本語' }]
core.i18n.DEFAULT_LOCALE // 'zh-CN'
```

#### Redaction utilities

`core.sanitize.sanitizeSensitiveFields()` recursively redacts objects and arrays. By default it handles password, token, secret, privateKey, apiV3Key, and similar credentials, and masks embedded credentials in `url` / `baseUrl` / `endpoint`. `core.sanitize.sanitizeUrl(url, options)` also handles individual URLs and returns `(invalid url)` for malformed input. Custom matchers apply to parameter names as well.

```typescript
core.sanitize.sanitizeSensitiveFields({
  email: 'user@example.com',
  password: 'secret',
  baseUrl: 'https://user:pass@example.com/api/v1',
  profile: { token: 'jwt-token' },
})
// => { email: 'user@example.com', password: '[REDACTED]', baseUrl: 'https://[REDACTED]:[REDACTED]@example.com/api/v1', profile: { token: '[REDACTED]' } }

core.sanitize.sanitizeSensitiveFields({ email: 'user@example.com' }, {
  matcher: /email/i,
  replacement: '***',
})
// => { email: '***' }
```

#### Zod validation error localization

`core.zodValidation` converts Zod `SafeParseError` / `ZodError` into flat form errors and maps Zod's
default English messages to the caller's own localized messages.

- Two public entry points:
  - `createPrefixedZodMessageGetter()`: derive keys such as `serv_validation*` / `kit_validation*` from module prefixes without a manual `KEY_MAP`.
  - `mapZodErrorToFormErrors()`: extract, localize, and flatten in one step.
- Custom business messages are preserved; only Zod's default English messages are replaced.

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
    case 'validationRequired':
      return '此项为必填项'
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
    'kit',
    (messageKey, params) => {
      if (messageKey === 'kit_validationEmail')
        return '请输入合法邮箱地址'
      if (messageKey === 'kit_validationStringMin')
        return `至少输入 ${params?.min} 个字符`
      return '输入不合法'
    },
  )
  const errors = core.zodValidation.mapZodErrorToFormErrors(result.error, getMessage)

  errors[0]?.field // 'email'
  errors[0]?.message // '请输入合法邮箱地址'
  errors[2]?.message // '请填写昵称'（schema 自定义消息原样保留）

  core.logger.info('Validation failed', { errors })
}
```

#### Configuration management (Node.js only)

> Browsers have no filesystem access. `core.config` offers placeholder APIs only: file-related methods return `SERVICE_UNAVAILABLE` and do not load YAML.

Node automatically loads and watches runtime `.yml` / `.yaml` files, excluding exactly `_deploy.yml` and `_deploy.yaml`. The deployment CLI parses those reserved files after loading its target environment and credentials. Business `deploy.yml` and explicit `core.config.load` remain supported. A failed per-file load result is logged and loading continues; applications must validate required configuration and check `success`. Directory scanning, logger setup and other exceptions may still propagate.

```typescript
import { core, HaiConfigError } from '@h-ai/core'
import { z } from 'zod'

// 方式 1：init 时自动加载运行时配置
core.init({
  configDir: './config', // 扫描 .yml / .yaml，排除 _deploy.yml / _deploy.yaml
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
  const cfg = core.config.get<z.infer<typeof AppSchema>>('app') // undefined 或配置
  const cfg2 = core.config.getOrThrow<z.infer<typeof AppSchema>>('app') // 未加载时抛异常
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

##### Dotenv files and environment modes

Node-only `core.config.loadEnvFiles({ mode, envDir })` returns HaiResult and merges `.env` → `.env.<mode>` → `.env.local`, with existing process variables taking priority. development/production map to dev/prod; missing files are skipped. It does not mutate the process: check success before assigning. Track public environment files and `.env.example`; ignore private `.env.local`. core.init does not load dotenv. Browser calls return SERVICE_UNAVAILABLE.

```ts
const env = core.config.loadEnvFiles({ mode: 'dev', envDir: '.' })
if (!env.success)
  throw new Error(env.error.message)
Object.assign(process.env, env.data)
core.init({ configDir: './config' })
```

##### Environment variable mapping and interpolation

`core.config.load(name, ...)` automatically maps each YAML leaf to an
environment variable named `HAI_<CONFIG_NAME>_<YAML_PATH>`. Configuration names and keys are uppercased, levels are separated by `_`,
and camelCase is not split. For example, `ai.llm.apiKey` maps to `HAI_AI_LLM_APIKEY`,
and `ai.llm.maxTokens` to `HAI_AI_LLM_MAXTOKENS`. Array indexes are also levels:
`ai.llm.models[0].temperature` maps to `HAI_AI_LLM_MODELS_0_TEMPERATURE`.

Existing environment variables override YAML and are parsed with YAML scalar rules into numbers, booleans, and other native types.
Absent variables leave YAML unchanged. Object/array nodes can also be replaced wholesale with same-name JSON variables, such as HAI_DB for connection configuration or HAI_REACH_PROVIDERS for channel arrays. A parent replacement takes precedence over child variables; schema validation still runs afterward.

```yaml
# config/_ai.yml（core.init 扫描后配置名为 ai）
llm:
  apiKey: ''
  baseUrl: https://api.xiaomimimo.com/v1
  model: mimo-v2.5
  maxTokens: 4096
```

```dotenv
HAI_AI_LLM_APIKEY=your-api-key
HAI_AI_LLM_MAXTOKENS=8192
```

For special variable names, use explicit `${VAR}` interpolation. Precedence is fixed:
Convention-based environment variables > explicit environment variables > YAML defaults.

- `${VAR}`: read `process.env.VAR`; return `CONFIG_ENV_VAR_MISSING` if absent.
- `${VAR:default}`: read `process.env.VAR`; use the value after the colon if absent.

**Type restoration:** when the whole value is one variable expression (such as `${PORT:3000}`), YAML rules restore native types (number / boolean, etc.). Mixed text always stays a string.

`${VAR:}` or `${VAR}` resolving to an empty string stays `''`, rather than becoming YAML `null`. Modules that treat empty strings as unset should normalize them to `undefined` in their own schemas.

```yaml
# config/app.yml
debug: ${DEBUG:false} # → boolean false
port: ${PORT:3000} # → number 3000
database: ${DB_CONNECTION} # → 环境变量缺失时报错
url: http://${HOST}:${PORT} # → string（混合文本）
```

#### ID generation

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

#### Utilities

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
core.string.constantTimeEqual(a, b) // Node 使用原生等长比较；浏览器不保证恒时

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

#### Module utilities (module)

Shared initialization error handling for modules:

```typescript
import { core } from '@h-ai/core'

const notInitialized = core.module.createNotInitializedKit(
  HaiDbError.NOT_INITIALIZED,
  () => dbM('db_notInitialized'),
)

// 创建占位 Proxy（异步接口，默认）
const currentDdl: DdlOperations = notInitialized.proxy<DdlOperations>()
// 创建占位 Proxy（同步接口）
const currentHash: HashOperations = notInitialized.proxy<HashOperations>('sync')
```

### Error handling

#### HaiResult types

All operations that may fail return `HaiResult<T>`:

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

#### Custom error codes (per module)

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

#### Configuration error codes

```typescript
import { HaiConfigError } from '@h-ai/core'

HaiConfigError.CONFIG_FILE_NOT_FOUND // hai:core:010 - 配置文件不存在
HaiConfigError.CONFIG_PARSE_ERROR // hai:core:011 - YAML 解析失败
HaiConfigError.CONFIG_VALIDATION_ERROR // hai:core:012 - Schema 校验失败
HaiConfigError.CONFIG_ENV_VAR_MISSING // hai:core:013 - 环境变量缺失
HaiConfigError.CONFIG_NOT_LOADED // hai:core:014 - 配置未加载
```

### Request locale isolation

Wrap Node requests and SSR in `core.i18n.runWithLocale(locale, () => handleRequest())`. SvelteKit can use `kit.i18n.runWithLocale(locale, () => resolve(event))`; serv creates the scope automatically from request headers. Async descendants inherit it. Explicit `MessageOptions.locale` takes precedence over the request locale and the startup default. Within a scope, `setGlobalLocale` only changes that request; outside a scope it configures the startup default and must not be called by request hooks.

Browsers keep application-level `setGlobalLocale` / `createLocaleStore`. During SSR, UI store initialization and setters only update the store; messages read the request scope. `runWithLocale` requires the Node entry; browser translations use explicit locale options or application state.

## Development and testing

```bash
pnpm --filter @h-ai/core test
```

## Configuration consumption

`_core.yml` accepts only name/version/env/defaultLocale metadata and logging; unknown fields fail loading. Core has no global debug, ID length/prefix, business features or locale registration list. Use logging.level, per-call core.id arguments, and application-owned app.yml with its own schema. defaultLocale is metadata, not automatic translation registration or a Paraglide switch. Importing Logger preserves LANG, LC_ALL and PYTHONIOENCODING, including Windows TTY. See the [configuration-to-consumer map (Chinese)](../../docs/configuration-map.md).

See the [module JSDoc conventions (Chinese)](../../docs/module-jsdoc.md) for declaration comments and compilable examples. Node core.init is synchronous and returns void. A failed per-file config.load result is logged and loading continues; validate required configuration and check success. Directory scanning and other exceptions may still throw. Business HaiResult APIs require a success check.

The Node entry uses node:crypto.timingSafeEqual over equal-length UTF-16LE code units. Different lengths return false; length is not hidden. The browser implementation avoids content-based early returns but has no JavaScript-engine timing guarantee and is not a server credential boundary. Surrounding branches, encoding and request handling are not made timing-safe by this helper.

UUID generation requires cryptographic randomUUID/getRandomValues and throws if neither is available; it never falls back to Math.random.

## License

Apache-2.0
