# @h-ai/core

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md)

## Introduction

`@h-ai/core` is the shared foundation of Hai Framework. It gives applications and framework modules consistent configuration, errors, logging, and internationalization. Utilities work directly; call `core.init()` when a Node application needs file configuration.

## Core capabilities

| Capability                                   | Purpose                                                                                                                                     | Main entry points                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Configuration and startup                    | Load YAML, merge environment overrides, validate settings, and orchestrate module startup and shutdown                                      | `core.config`, `core.init`, `core.module.createRuntime` |
| Results and errors                           | Express business success/failure, define error codes, and produce safe messages at API boundaries                                           | `HaiResult`, `ok` / `err`, `core.error`                 |
| Logging and diagnostics                      | Structured logs, request correlation, credential masking, and log observation                                                               | `core.logger`, `core.context`, `core.sanitize`          |
| Internationalization and validation messages | Manage message languages, isolate concurrent request locales, and localize Zod field errors                                                 | `core.i18n`, `core.zodValidation`                       |
| Request access control                       | Resolve trusted client addresses and check paths, methods, IPs, and time windows                                                            | `core.access` (Node only)                               |
| General utilities                            | Generate identifiers and reuse type, object, string, array, async, and time operations, plus consistent errors before module initialization | `core.id`, `core.typeUtils`, `core.object`, and others  |

### Node and browser boundaries

Both environments use `import { core } from '@h-ai/core'`; the bundler selects the code for the target environment.

| Capability                                                                        | Node.js                                                                                           | Browser                                                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Logging, results/errors, messages, utilities, and ordered module startup/shutdown | Supported                                                                                         | Supported                                                                                      |
| YAML, dotenv, environment mapping, file watching                                  | Reads and watches local configuration files                                                       | Cannot read or watch local files; loading methods return failure                               |
| Request correlation with `core.context.run`                                       | Each request retains its own IDs after asynchronous work, without mixing them with other requests | Values exist only during synchronous callback code and are no longer available after `await`   |
| Request locale with `core.i18n.runWithLocale`                                     | Each request keeps its chosen language after asynchronous work; other requests do not change it   | Throws; set the page language with `setGlobalLocale()` or pass a locale when getting a message |
| Request policies with `core.access`                                               | Checks request addresses, paths, and time windows                                                 | This tool is unavailable                                                                       |

`core.init()` configures Core settings and logging synchronously, returns `void`, and Core provides no `close()` method. Applications starting databases, caches, or other modules can manage them with `core.module.createRuntime()`: its returned object's `start()` initializes them in order, and `close()` cleans them up in reverse. A complete example follows under “Application startup and shutdown”.

## Getting started

Each Core feature below has a purpose, examples, and relevant limits. Start with initialization when loading configuration; logging, messages, and general utilities work directly.

Call runtime functions through `core.xxx()` or `core.<feature>.xxx()`. Import the result constructors `ok` / `err`, types, schemas, and error constants separately from the package entry. Their sections below show the usage.

```bash
pnpm add @h-ai/core
```

The custom configuration and form-validation examples also use Zod; install it with `pnpm add zod` before running them. Database and cache examples list their additional dependencies in their section.

### Initialization: `core.init`

Load YAML and configure logging at Node startup, or configure logging in a browser. Initializing Core does not start databases or other modules.

#### Node.js

Create `config/_core.yml`:

```yaml
# 应用元信息，供启动代码和页面读取。
name: orders
version: 0.1.0
env: development
# 默认消息语言；启动代码读取后调用 setGlobalLocale 应用。
defaultLocale: zh-CN
logging:
  level: info # 输出 info 及以上级别。
  format: pretty # 本地开发使用便于阅读的日志。
```

```ts
import { core, CoreConfigSchema } from '@h-ai/core'

// 1. 读取 config 目录中的 YAML，_core.yml 对应名称 core。
core.init({ configDir: './config' }) // 返回 undefined；配置缓存中可读取 core。

// 2. 检查应用必需的配置；失败时停止启动，保留原始错误供排查。
const config = core.config.validate('core', CoreConfigSchema)
if (!config.success)
  throw new Error(config.error.message, { cause: config.error })

// 成功时 config.success 为 true；config.data.name 为 'orders'，defaultLocale 为 'zh-CN'。

// 3. 将配置中的语言应用到默认消息；读取 YAML 本身不会切换语言。
core.i18n.setGlobalLocale(config.data.defaultLocale) // 返回 undefined；后续默认消息使用中文。

// 4. 记录已验证的应用名称，确认启动完成。
core.logger.info('Application ready', { name: config.data.name }) // 返回 undefined；info 日志包含 name: 'orders'。
```

The startup boundary stops when required configuration is unavailable. `core.init()` logs individual load failures and continues, so completion does not mean every configuration is valid. Directory scanning and logger setup can still throw.

#### Browser

```ts
import { core } from '@h-ai/core'

// 浏览器不读取 YAML；此处只设置日志，输出 warn 及以上级别。
core.init({
  logging: { level: 'warn' }
}) // 返回 undefined；之后 info 日志被过滤。

// 设置当前页面使用的默认消息语言。
core.i18n.setGlobalLocale('zh-CN') // 返回 undefined；页面默认消息使用中文。

// 给一次请求生成编号，后续日志可用同一编号关联排查。
const requestId = core.id.request() // 返回随机字符串，如 'req-V1StGXR8_Z5jdHi6B-myT'。
core.logger.warn('Request needs attention', { requestId }) // 返回 undefined；浏览器输出 warn 消息及同一个 requestId。
```

The host supplies public configuration fields; never send complete server settings or secrets. Browser `core.config.get()` / `has()` / `keys()` return `undefined` / `false` / `[]`. `loadEnvFiles()`, `load()`, `validate()`, and `reload()` return `SERVICE_UNAVAILABLE`; `getOrThrow()` throws. `watch()` immediately calls back with the same unavailable error and returns a no-op unsubscribe function.

### Files and environment settings: `core.config`

Read YAML, apply environment overrides, validate configuration types, and manage cached settings and file watchers. The file and environment operations below require Node.

#### Loading, validating, and reading

`core.init({ configDir, configSchemas?, watchConfig? })` scans direct `.yml` / `.yaml` children of the directory. `_core.yml` becomes `core`, `_db.yml` becomes `db`, and `app.yml` becomes `app`. The CLI reads build/deploy settings from root `hai.json`; they are separate from runtime YAML.

`_core.yml` is validated with `CoreConfigSchema`, accepting only `name`, `version`, `env`, `defaultLocale`, and `logging`. The metadata defaults are `hai Admin`, `0.1.0`, `development`, and `zh-CN`; `logging` is optional. Metadata does not set `NODE_ENV`, switch message languages, or register application translations. Configure logging here; explicit `core.init({ logging })` overrides the application of YAML logging settings during that initialization.

For other files, host-supplied `configSchemas` provide structural and type hints during scanning. Full business validation stays in module initialization or explicit `validate()`. A direct `load(name, file, schema)` validates immediately.

The following file examples use this `config/app.yml` with no additional environment overrides:

```yaml
# config/app.yml
port: 3000
```

load() reads a file and can validate it immediately; validate() validates cached settings. get() returns undefined for a missing entry, while getOrThrow() throws. Generic arguments help TypeScript and do not validate data. has()/keys() show which entries exist.

```ts
import { core } from '@h-ai/core'
import { z } from 'zod'

// 读取上方 config/app.yml；Schema 同时描述类型和校验规则。
const AppSchema = z.object({
  port: z.number().int().min(1).max(65535)
})
const loaded = core.config.load('app', './config/app.yml', AppSchema)
if (!loaded.success)
  throw new Error(loaded.error.message, { cause: loaded.error })

// loaded：{ success: true, data: { port: 3000 } }。

// validate 用于重新校验缓存；加载时未传 Schema 的配置也可在这里校验。
const validated = core.config.validate('app', AppSchema)
if (!validated.success)
  throw new Error(validated.error.message, { cause: validated.error })

// validated：{ success: true, data: { port: 3000 } }。

// get 适合可选配置；getOrThrow 适合已确认存在的必需配置。
if (core.config.has('app')) { // true：上方已成功加载 app。
  const optional = core.config.get<z.infer<typeof AppSchema>>('app') // { port: 3000 }。
  const required = core.config.getOrThrow<z.infer<typeof AppSchema>>('app') // { port: 3000 }；缺失则抛错。
  core.logger.info('App config ready', { port: required.port, available: optional !== undefined })
}
core.config.keys() // 仅运行本节 load 示例时为 ['app']。
```

#### Reloading, watching, and cleanup

Use reload() to reread a file or watch() to receive new values and errors. Watching survives ordinary saves, atomic replacement, and file deletion/recreation. Failures retain the last successful cache. unwatch() stops watchers; clear() also removes the cache. Omitting the name affects all entries.

watchConfig defaults to false. Reloading settings does not reinitialize running database modules. Use the cleanup calls below when the setting is no longer needed.

```ts
import { core } from '@h-ai/core'

// 前提：app 已由 init/load 加载。回调需先处理读取或校验失败。
const stop = core.config.watch('app', (_settings, error) => {
  // 文件改成 port: 4000 后，成功回调收到 { port: 4000 }、error 为 undefined；失败时为 null 和错误对象。
  if (error)
    core.logger.error('Config reload failed', { error })
  else
    core.logger.info('Config reloaded')
})
// watch 返回取消函数 stop，不立即返回配置值。
core.config.isWatching('app') // true。
const reloaded = core.config.reload('app') // 文件仍为 port: 3000 时返回 { success: true, data: { port: 3000 } }。
if (!reloaded.success)
  core.logger.warn('Manual reload failed', { error: reloaded.error })

stop() // 返回 undefined；取消当前回调，没有其他回调时停止底层监听。
core.config.unwatch('app') // 返回 undefined；isWatching('app') 变为 false。
core.config.clear('app') // 返回 undefined；get('app') 变为 undefined，has('app') 变为 false。
```

#### How environment variables change YAML settings

The framework derives environment override names from the configuration name and field path. For app.yml, port maps to HAI_APP_PORT and http.maxRetries maps to HAI_APP_HTTP_MAXRETRIES. Segments are uppercased and joined with underscores without splitting camelCase. YAML does not need a ${...} expression for this override to work.

For a fixed YAML value `port: 3000`, the result is 3000 without HAI_APP_PORT and 5000 after setting HAI_APP_PORT=5000.

Write `${VARIABLE}` in YAML to replace the expression with its environment value when loading. Text after the colon is the fallback when the variable is unset:

| YAML                         | Environment input            | Result                                                  |
| ---------------------------- | ---------------------------- | ------------------------------------------------------- |
| `port: ${PORT}`              | PORT=4000                    | Uses 4000; an unset PORT returns CONFIG_ENV_VAR_MISSING |
| `port: ${PORT:3000}`         | No PORT                      | Uses the expression's fallback, 3000                    |
| `port: ${PORT:3000}`         | PORT=4000, HAI_APP_PORT=5000 | Uses 5000: the convention variable wins                 |
| `label: server-${PORT:3000}` | PORT=4000                    | Produces the string server-4000                         |

The loader first checks HAI_APP_PORT. If set, it replaces this field and does not evaluate its ${PORT...} expression. Otherwise it reads YAML: an expression looks up PORT, while a fixed value is used directly. Therefore PORT need not exist when HAI_APP_PORT already overrides the field.

Within one source, parent JSON can supply a base and child variables refine it. HAI_APP='{"port":3000,"label":"local"}' plus HAI_APP_PORT=4000 produces port=4000 and label=local regardless of line order. A higher-priority whole-object replacement removes lower-priority child overrides. Array JSON replaces the list; indexed variables only update existing items and out-of-range indexes fail.

#### Reading .env files

core.init() does not read .env files. Call loadEnvFiles(), check success, assign its results to process.env, then load YAML. development/production map to dev/prod; missing files are skipped and duplicate keys in a file fail. Highest priority first: **process environment > `.env.<mode>.local` > `.env.local` > `.env.<mode>` > `.env` > YAML**. Keep private .local files out of Git.

```ts
import { core } from '@h-ai/core'

// 前提：.env 写 HAI_APP_PORT=4000，没有其他来源覆盖这个变量。
// 先读取并合并 .env 文件与进程环境，失败时停止启动。
const result = core.config.loadEnvFiles({ mode: 'dev', envDir: '.' })
if (!result.success)
  throw new Error(result.error.message, { cause: result.error })
// 成功时 result.success 为 true，result.data.HAI_APP_PORT 为 '4000'；其他键来自合并后的环境。
// 返回值不会自动写入进程；显式应用后再初始化。
Object.assign(process.env, result.data)
core.init({ configDir: './config' }) // 返回 undefined；app.yml 中 port: 3000 被覆盖为数字 4000。
```

#### What type does the replacement produce?

Environment variables start as text. Pass a Zod schema to `load()` / `resolve()` to convert replacements by field type: `z.number()` produces numbers, `z.boolean()` produces booleans, and `z.string()` preserves strings.

A full-value ${PORT:3000} can produce number 3000, and ${ENABLED:false} boolean false. Mixed text such as server-${PORT:3000} stays a string. A string field code preserves the fallback 00123 as '00123', including leading zeros. This example supplies the equivalent YAML values and environment in memory without reading a file:

```ts
import { core } from '@h-ai/core'
import { z } from 'zod'

// 用显式环境数据演示覆盖顺序、数值/布尔转换与字符串保留。
const AppSchema = z.object({
  port: z.number(),
  enabled: z.boolean(),
  label: z.string(),
  code: z.string()
})
const resolved = core.config.resolve({
  name: 'app',

  value: {
    // eslint-disable-next-line no-template-curly-in-string -- 保留供配置解析器处理的字面占位符。
    port: '${PORT:3000}',
    // eslint-disable-next-line no-template-curly-in-string -- 保留供配置解析器处理的字面占位符。
    enabled: '${ENABLED:false}',
    // eslint-disable-next-line no-template-curly-in-string -- 保留供配置解析器处理的字面占位符。
    label: 'server-${PORT:3000}',
    // eslint-disable-next-line no-template-curly-in-string -- 保留供配置解析器处理的字面占位符。
    code: '${APP_CODE:00123}'
  },
  environment: { PORT: '4000', HAI_APP_PORT: '5000' },
  schema: AppSchema,
})
if (!resolved.success)
  throw new Error(resolved.error.message, { cause: resolved.error })

// resolved：{ success: true, data: { port: 5000, enabled: false, label: 'server-4000', code: '00123' } }。

// resolve 只做替换和类型还原；再用 Schema 确认最终数据符合要求。
const validated = AppSchema.safeParse(resolved.data)
if (!validated.success)
  throw new Error(validated.error.message, { cause: validated.error })
core.logger.info('Config resolved', { settings: validated.data })
// settings: { port: 5000, enabled: false, label: 'server-4000', code: '00123' }
```

An empty string means the variable is set with no characters; it is not missing, null, false, or zero. APP_CODE='' leaves code as '' instead of using 00123. The schema decides whether this is allowed; numeric fields usually reject empty strings.

Substitution processes expressions in YAML; `server-${PORT}` inside an environment value or parent JSON remains literal text. For example, HAI_APP_LABEL='server-${PORT}' stays server-${PORT}. Put the expression in YAML when substitution is intended.

Without a schema, paths come from existing YAML/JSON structure and single expressions use YAML scalar rules for numbers/booleans. configSchemas can supply optional legal paths missing from YAML. Final business validation still belongs in validate() or module initialization.

#### Tools for generating configuration files

resolve() also lets build/deploy tools calculate settings in memory. toEnv() converts objects to environment variables, mergeEnv() merges sources, and stringifyEnv()/parseEnv() encode/decode literal .env text. These tools do not mask secrets.

```ts
import { core } from '@h-ai/core'

// 配置生成器把普通对象转成 HAI_APP_PORT 等变量；数组保留为 JSON。
const values = core.config.toEnv({
  prefix: 'HAI_APP',
  value: {
    port: 3000,
    tags: ['local']
  }
})
// values：{ HAI_APP_PORT: '3000', HAI_APP_TAGS: '["local"]' }。
const merged = core.config.mergeEnv([
  values,
  { HAI_APP_PORT: '4000' }
])
// merged：{ HAI_APP_PORT: '4000', HAI_APP_TAGS: '["local"]' }。
const text = core.config.stringifyEnv(merged) // 编码为可写入 .env 的文本。
// text 含以下两行，每行以换行符结尾：
// HAI_APP_PORT='4000'
// HAI_APP_TAGS='["local"]'
const restored = core.config.parseEnv(text) // 解析回字面字符串，不执行其中的变量。
// restored：{ HAI_APP_PORT: '4000', HAI_APP_TAGS: '["local"]' }。
core.logger.info('Generated config verified', { port: restored.HAI_APP_PORT })
```

Plain objects expand by default; arrays, dynamic dictionaries, and empty objects retain JSON. See the [runtime configuration guide](../../docs/usage/configuration/runtime.md) for replacement generation rules, full precedence, and application integration.

### Logging: `core.logger`

core.logger records structured logs. Levels progress from detail to severity: trace, debug, info, warn, error, fatal. fatal records a log; the application decides whether to exit.

`core.logger` supports `trace` / `debug` / `info` / `warn` / `error` / `fatal`. Node uses pino and browsers use loglevel. Unconfigured loggers default to `info` / `pretty`; a `logging` object parsed by `LoggingConfigSchema` defaults its format to `json`. Node falls back to JSON when optional `pino-pretty` is unavailable.

```ts
import { core } from '@h-ai/core'

// 先设置级别；低于当前级别的日志不会输出。
core.logger.setLevel('trace') // 返回 undefined；以下六个级别均会输出。
core.logger.trace('Processing detail', { step: 1 })
core.logger.debug('Read started')
core.logger.info('Order created', { orderId: 'order-1' })
core.logger.warn('Retry scheduled')
core.logger.error('Operation failed', {
  error: new Error('Example failure')
})
core.logger.fatal('Service cannot continue')
// 六次日志调用均返回 undefined；分别输出对应级别、上面的消息及所传字段。
// 例如 info 日志的消息为 'Order created'，字段 orderId 为 'order-1'。
```

create() makes a named logger; child() attaches fixed context. configure() sets output and extra redaction paths; setLevel()/getLevel() change or inspect the global level.

```ts
import { core } from '@h-ai/core'

// 全局配置可作用于已经创建的 Logger；redact 补充业务隐私字段。
core.logger.configure({
  level: 'info',
  format: 'json',
  redact: ['customer.email']
}) // 返回 undefined；后续日志按此配置输出。
const orders = core.logger.create({ name: 'orders' }) // 返回 Logger 对象，可调用 info/warn 等方法。
const request = core.logger.child({ requestId: 'request-1' }) // 返回带固定 requestId 的 Logger。
orders.info('Order created', {
  customer: { email: 'user@example.com' }
}) // 返回 undefined；输出中 customer.email 为 '[REDACTED]'。
request.warn('Request needs attention') // 返回 undefined；输出中 requestId 为 'request-1'。
core.logger.getLevel() // 'info'。
```

Existing default, module, and nested child loggers use current global settings on subsequent writes; `setLevel()` also takes effect immediately. Explicit `create()` level/format/context options take precedence; unspecified options inherit dynamically. Per-call context overrides fixed context, then `core.context` adds current request correlation fields. Browser JSON includes `level` / `msg`; pretty output includes readable text and context.

observe() supports diagnostics collection, receiving records after level filtering and masking and returning an unsubscribe function. Collect bounded memory data in the callback and persist asynchronously elsewhere. Observation is not persistence; exceptions and synchronous reentry are isolated.

```ts
import { core } from '@h-ai/core'

// 观察经过级别过滤和脱敏的记录；内存收集设置上限。
const recentMessages: string[] = []
const stop = core.logger.observe((record) => {
  if (recentMessages.length === 100)
    recentMessages.shift()
  recentMessages.push(record.message)
})
// observe 返回取消函数 stop；本例 warn 日志触发一次回调，record.message 为 'Observed event'。
core.logger.warn('Observed event')
recentMessages // ['Observed event']。
stop() // 返回 undefined；后续日志不再进入这个回调。
```

### Request correlation: `core.context`

run() gives a request/task its requestId, userId, scopeId, jobId, and other correlation fields; get() reads them. On Node they remain available after database or other asynchronous work, without another request overwriting them. Existing loggers automatically include these fields.

```ts
import { core } from '@h-ai/core'

// Node 示例：同一请求等待异步处理后，仍能取得自己的编号。
await core.context.run({ requestId: 'request-1', userId: 'user-1' }, async () => {
  await core.async.delay(1)
  const current = core.context.get() // 包含 requestId: 'request-1'、traceId: 'request-1'、userId: 'user-1'；其他字段为 undefined。
  core.logger.info('Request continued', { requestId: current.requestId })
  return current.requestId
}) // run 返回回调的结果；此处 await 后得到 'request-1'。
core.context.get() // {}，回到外层后不保留上面请求的上下文。

// 采集器自身写日志时，可暂停观察回调，正常日志输出仍然执行。
core.context.run({ suppressLogObservers: true }, () => core.logger.warn('Collector diagnostic'))
// 返回 undefined；输出 warn 日志，但不会触发日志观察回调。
```

In browsers values exist only in synchronous callback code and are not retained after await. Correlation IDs do not authorize access; trusted server code must provide identity and tenant scope.

### Cleaning diagnostic data: `core.sanitize`

Clean credentials before logs, diagnostic exports, or public errors. Check sensitive names, mask a single value or object tree, clean URL credentials, or remove labeled/known secrets from text.

```ts
import { core } from '@h-ai/core'

core.sanitize.isSensitiveKey('apiKey') // true。
core.sanitize.sanitizeSensitiveValue('example-only', 'password') // '[REDACTED]'。
const safe = core.sanitize.sanitizeSensitiveFields({ password: 'example-only', email: 'user@example.com' })
// safe：{ password: '[REDACTED]', email: 'user@example.com' }，原对象不变。
// 默认仅遮蔽凭据；额外业务隐私可在已处理凭据的副本上继续清理。
core.sanitize.sanitizeSensitiveFields(safe, {
  matcher: ['email'],
  replacement: '***'
})
// => { password: '[REDACTED]', email: '***' }
core.sanitize.sanitizeUrl('https://user:example-only@example.com/?token=example-only')
// => 'https://[REDACTED]:[REDACTED]@example.com/?token=[REDACTED]'
core.sanitize.sanitizeText('Bearer example-only') // '[REDACTED]'。
core.sanitize.sanitizeText('Request failed with a known private value', ['private value'])
// => 'Request failed with a known [REDACTED]'
```

defaultSensitiveKeyRegex/defaultSensitiveReplacement expose the default matching rule and [REDACTED] value. A custom matcher replaces the default rule, so retain default credential masking before applying extra business privacy rules.

Logs mask credential fields such as password/passwordHash, token, secretKey, and privateKey, plus URL userinfo, sensitive query parameters, and OAuth key-value fragments. Invalid URLs return `(invalid url)`. `redact` adds business privacy paths using dots, brackets, and single-level `*`, case sensitively. Email addresses and phone numbers remain visible by default.

Native `Error` values are copied with name/message/stack/cause, aggregate errors, and enumerable context before masking; originals are unchanged. Error-subgraph cycles and the 32-level depth limit use `[Circular]` / `[MaxDepth]`. Ordinary object cycles remain and may prevent JSON serialization. Message and error text masking handles explicit credential labels and URLs, not arbitrary unlabeled secrets; callers must clean these or redact the whole path.

Masked results contain data only. Plain objects and class instances contribute their own enumerable data properties; prototypes, accessors, and custom `toJSON()` methods are not retained or invoked. Dates become ISO strings and URLs become masked strings, without changing the original. Still select only useful diagnostic fields from SDK/business objects and explicitly clean unlabeled secrets and business privacy data.

### Results and errors: `core.error`

core.error defines module errors, creates failure instances, and builds safe HTTP/UI messages. Codes stay stable and messages can follow the current locale. Serv/Kit or another HTTP framework handles response status and headers.

```ts
import { core } from '@h-ai/core'

// 定义稳定错误码，消息在创建实例时根据当前语言获取。
const OrderError = core.error.buildHaiErrorsDef('orders', { NOT_FOUND: '300:404' })
// OrderError.NOT_FOUND：{ code: 'hai:orders:300', httpStatus: 404, system: 'hai', module: 'orders' }。
const failure = core.error.buildHaiErrorInst(OrderError.NOT_FOUND, core.i18n.coreM('core_errorNotFound', { locale: 'zh-CN' }))
// failure：上面的错误定义加上 message: '资源不存在'。
const publicError = core.error.toPublic(failure, 'request-1')
// publicError：保留 code/httpStatus/system/module，增加 traceId: 'request-1'；
// message 为 '资源不存在 (traceId: request-1)'。
const message = core.error.formatMessage(publicError) // '资源不存在 (traceId: request-1)'，编号不会重复追加。
core.logger.warn('Order unavailable', { error: failure, publicMessage: message })
```

#### Shared result type and standalone constructors

`HaiResult<T>` uses success to distinguish data from error. Import `ok` / `err` to construct successful or failed results. Check success after business operations. Getters, utilities, and factories follow their direct-value or throwing signatures.

```ts
import type { HaiResult } from '@h-ai/core'
import { core, err, HaiCommonError, ok } from '@h-ai/core'

// 业务失败返回 err，成功返回 ok；共用构造器保持独立导入。
function divide(a: number, b: number): HaiResult<number> {
  if (b === 0)
    return err(HaiCommonError.VALIDATION_ERROR, core.i18n.coreM('core_errorValidation', { locale: 'zh-CN' }))
  return ok(a / b) // 如 ok(5) 返回 { success: true, data: 5 }。
}

// 先检查 success，再读取 data 或 error。
const result = divide(10, 2) // { success: true, data: 5 }。
if (!result.success)
  core.logger.warn('Calculation failed', { error: result.error })
else
  core.logger.info('Calculation completed', { value: result.data })

const failed = divide(10, 0)
// failed：{ success: false, error: { code: 'hai:common:200', httpStatus: 400,
// system: 'hai', module: 'common', message: '验证失败' } }，无 data。
if (!failed.success)
  core.logger.warn('Calculation rejected', { code: failed.error.code })
```

Use `core.error.toPublic(error, traceId?, locale?)` at HTTP/UI boundaries. It replaces 5xx details with a localized generic message, removes known credentials from other messages, and retains safe fields. Correlation IDs are selected from the explicit argument, context traceId/requestId, or the error's traceId, otherwise generated. `formatMessage()` appends a valid ID without duplicating the same suffix.

Internal `cause` / `ext` are private by default. Field errors for 400/422 can retain `field` / `message`; explicitly approved, business-schema-validated `publicExt` is masked and exposed as `ext`. Core does not validate its business safety automatically. Serv/Kit/UI hosts handle HTTP status, headers, and message components.

| Configuration error       | Code           | Meaning                                      |
| ------------------------- | -------------- | -------------------------------------------- |
| `CONFIG_FILE_NOT_FOUND`   | `hai:core:010` | Missing file                                 |
| `CONFIG_PARSE_ERROR`      | `hai:core:011` | YAML/dotenv reading or parsing failed        |
| `CONFIG_VALIDATION_ERROR` | `hai:core:012` | Invalid schema input or environment override |
| `CONFIG_ENV_VAR_MISSING`  | `hai:core:013` | Required interpolation variable missing      |
| `CONFIG_NOT_LOADED`       | `hai:core:014` | Configuration not loaded                     |

These constants belong to `HaiConfigError`; cross-module failures use `HaiCommonError`.

`HaiCommonError.RATE_LIMIT_EXCEEDED` maps to `hai:common:203` / HTTP 429. Kit shortcut responses and guards use the same common error definitions.

HTTP/UI boundaries expose business messages only for explicit valid 4xx statuses. Missing or invalid `httpStatus` is treated as 500 with a safe message. Custom business errors must carry a complete error definition or an explicit status.

### Messages and locales: `core.i18n`

Create message getters with parameter interpolation, read built-in Core messages, and manage locale selection. Constants list framework locales and do not register application translations.

```ts
import { core } from '@h-ai/core'

// 页面语言或服务进程的启动默认值；请求中使用 runWithLocale 单独选择语言。
core.i18n.setGlobalLocale('zh-CN') // 返回 undefined；后续默认消息使用中文。
core.i18n.getGlobalLocale() // 'zh-CN'。
core.i18n.coreM('core_errorNotFound') // '资源不存在'。
core.i18n.DEFAULT_LOCALE // zh-CN。
core.i18n.DEFAULT_LOCALES // [{ code: 'zh-CN', label: '简体中文' }, { code: 'en-US', label: 'English' }, { code: 'ja-JP', label: '日本語' }]。
```

Message locales are `zh-CN`, `en-US`, and `ja-JP`; `zh` / `en` / `ja` aliases are normalized. Explicit locale takes priority over Node request locale and then the application default. Unsupported locales fall back to `zh-CN`; missing keys return the key itself.

```ts
import { core } from '@h-ai/core'

// 业务字典按语言组织；占位参数在取消息时传入。
const message = core.i18n.createMessageGetter({
  'zh-CN': { welcome: '欢迎 {name}' },
  'en-US': { welcome: 'Welcome {name}' },
  'ja-JP': { welcome: 'ようこそ {name}' },
})
// createMessageGetter 返回消息函数；如 message('welcome', { locale: 'zh-CN', params: { name: 'Alice' } }) 得到 '欢迎 Alice'。
const greeting = await core.i18n.runWithLocale('en-US', async () => {
  await Promise.resolve()
  return message('welcome', {
    params: { name: 'Alice' }
  })
})
// greeting：'Welcome Alice'；runWithLocale 返回回调的结果，此处等待 Promise 得到字符串。
core.logger.info('Greeting prepared', { greeting })
```

Wrap actual asynchronous Node request/SSR work in `runWithLocale()`. Serv establishes the request locale automatically; Kit provides the same entry point. Within a request, `setGlobalLocale()` changes only that request. Outside it, use it only for startup defaults. Browsers use application-level `setGlobalLocale()` or explicit locales. SSR UI stores should not modify process defaults.

### Field validation messages: `core.zodValidation`

Convert Zod errors into { field, message }[] for form hints. createPrefixedZodMessageGetter() selects translation keys by prefix; mapZodErrorToFormErrors() extracts, translates, and flattens field paths.

```ts
import { core } from '@h-ai/core'
import { z } from 'zod'

// 此例复用 Core 已有翻译；业务表单可注入自己的消息获取器。
const message = core.zodValidation.createPrefixedZodMessageGetter('core', key =>
  key === 'core_validationEmail'
    ? core.i18n.coreM('core_validationEmail', { locale: 'zh-CN' })
    : core.i18n.coreM('core_errorValidation', { locale: 'zh-CN' }))
// 返回消息函数；message('validationEmail') 得到 '请输入有效的邮箱地址'。
const parsed = z.object({
  email: z.email()
}).safeParse({ email: 'invalid' })
if (!parsed.success) {
  const errors = core.zodValidation.mapZodErrorToFormErrors(parsed.error, message)
  // errors：[{ field: 'email', message: '请输入有效的邮箱地址' }]。
  core.logger.info('Validation failed', { errors })
}
```

Supports Zod v3/v4 issues/errors. Default English messages are translated; explicit business messages remain unchanged. Paths use dots and global errors use _. Unknown fields in strict schemas use validationUnexpectedFields without exposing internal names.

### Module startup and helpers: `core.module`

Applications and module implementations can reuse these helpers to manage several modules or return consistent failures before initialization. The application chooses its actual modules.

#### Application startup and shutdown

Applications using several modules need to initialize resources such as databases before handling business work, then release them afterward. `core.module.createRuntime()` accepts each module's startup and cleanup functions and returns an object the application can call. Creating it does not start the modules.

This local development example additionally requires `@h-ai/reldb` and `@h-ai/cache`. Both use in-memory settings for demonstration; production must use the shared backends required by each module.

```ts
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'

// 按需要的启动顺序，列出各模块的初始化和关闭函数。
const runtime = core.module.createRuntime([
  {
    name: 'database',
    start: () => reldb.init({ type: 'sqlite', database: ':memory:' }),
    close: () => reldb.close(),
  },
  {
    name: 'cache',
    start: () => cache.init({ type: 'memory' }),
    close: () => cache.close(),
  },
])

// createRuntime 返回带 start()/close() 的对象；到这里数据库和缓存尚未启动。

// 依次启动数据库、缓存；失败时自动清理已尝试启动的模块。
const started = await runtime.start() // 成功为 { success: true, data: undefined }；两个模块均已初始化。
if (!started.success)
  throw new Error(started.error.message, { cause: started.error })

try {
  // 启动成功后再执行应用业务；这里演示记录启动结果。
  core.logger.info('Application modules ready')
}
finally {
  // 演示结束后先关闭缓存，再关闭数据库，并检查清理结果。
  const closed = await runtime.close() // 成功为 { success: true, data: undefined }；两个模块均已关闭。
  if (!closed.success)
    core.logger.error('Application cleanup failed', { error: closed.error })
}
```

Startup here is database → cache; shutdown is cache → database. This demonstration cleans up immediately afterward. A long-running service should call the same `runtime.close()` when exiting.

A startup failure cleans up modules whose startup was attempted. A shutdown failure stops cleanup at that module and retains dependencies it still needs; the next `close()` or `start()` retries cleanup. Simultaneous `start()` calls do not initialize twice. An optional `enabled()` returning false skips its step.

Both methods return `HaiResult`; check `success`. Errors include the module, phase, code, and necessary configuration field hints while keeping configuration secrets and raw SDK exceptions out of public startup errors.

#### Returning errors before initialization

createNotInitializedKit() provides error/result/proxy forms. Proxies return a consistent sync/async failure until the implementation switches to real operations. The message function reads the locale at call time.

```ts
import type { HaiResult } from '@h-ai/core'
import { core, HaiCommonError } from '@h-ai/core'

const message = core.i18n.createMessageGetter({
  'zh-CN': { notReady: '请先初始化模块' },
  'en-US': { notReady: 'Initialize the module first' },
  'ja-JP': { notReady: '先にモジュールを初期化してください' },
})
// 本例固定使用中文消息，便于观察返回值。
core.i18n.setGlobalLocale('zh-CN') // 返回 undefined。
const waiting = core.module.createNotInitializedKit(HaiCommonError.NOT_INITIALIZED, () => message('notReady'))
// waiting 是带 error/result/proxy 的对象。
waiting.error() // { code: 'hai:common:001', httpStatus: 500, system: 'hai', module: 'common', message: '请先初始化模块' }。
waiting.result<string>() // { success: false, error: 上方错误对象 }，无 data。

// 模块实现可把尚未就绪的操作暂时指向这些代理。
const asyncOperations = waiting.proxy<{ read: () => Promise<HaiResult<string>> }>()
const syncOperations = waiting.proxy<{ read: () => HaiResult<string> }>('sync')
// 两次 proxy 调用分别返回异步和同步操作对象。
const result = await asyncOperations.read() // { success: false, error: 上方错误对象 }。
if (!result.success)
  core.logger.warn('Read before initialization', { error: result.error })
syncOperations.read() // 直接返回 { success: false, error: 上方错误对象 }，不返回 Promise。
```

#### Checking shared-state requirements

requiresSharedState() decides whether a production process should reject backends limited to one host. It only returns a decision; it does not connect or switch databases. Server code supplies the real environment.

```ts
import { core } from '@h-ai/core'

// 此例用显式数据演示；服务端实际使用时传入 process.env。
core.module.requiresSharedState({ NODE_ENV: 'production' }) // true：应使用跨主机共享后端。
core.module.requiresSharedState({ NODE_ENV: 'production', HAI_E2E: '1' }) // false：显式 E2E 例外。
```

### Request access checks: `core.access` (Node)

At HTTP entry points, resolve a trusted client IP and check addresses, paths, methods, and time windows. Core returns decisions; Serv http.access or Kit createHandle({ access }) connects them to request processing.

#### Resolving and checking client addresses

```ts
import { AccessConditionSchema, core } from '@h-ai/core'

core.access.normalizeClientIp('::ffff:198.51.100.23') // 198.51.100.23。
const resolve = core.access.createClientIpResolver(['192.0.2.10']) // 返回 IP 解析函数，只信任这个代理。
const request = new Request('https://example.test/api/orders', {
  headers: { 'x-forwarded-for': '198.51.100.23' }
})
// 第二参数必须来自真实 socket/可信平台；这里用测试地址模拟代理对端。
const clientIp = resolve(request, '192.0.2.10') // '198.51.100.23'，读取受信代理的转发头。
const check = core.access.createConditionCheck(AccessConditionSchema.parse({
  allowIps: ['198.51.100.0/24']
}))
// createConditionCheck 返回检查函数；check(clientIp) 得到 { allowed: true }。
core.logger.info('Address checked', { allowed: check(clientIp).allowed })
```

#### Loading policies and checking requests

```ts
import { core } from '@h-ai/core'

// 可改为 loadPolicy({ file: './config/security/request-access.yml' }) 在启动时读独立文件。
const policy = core.access.loadPolicy({
  rules: [
    {
      id: 'external-api',
      paths: ['/api/external/**'],
      methods: ['POST'],
      allowIps: ['192.0.2.0/24'],
      encryption: 'disabled'
    }
  ],
})
// policy.rules[0] 保留上方规则，并补 denyIps: []、windows: []、timezone: 'UTC'。
const check = core.access.createRequestCheck(policy) // 返回请求检查函数，另带 encryption 方法和 requiresEncryption 属性。
const decision = check('/api/external/sync', 'POST', '192.0.2.10') // { allowed: true }。
check.encryption('/api/external/sync', 'POST') // disabled，供 HTTP 框架选择传输模式。
check.requiresEncryption // false；本例没有 required 规则。
core.logger.info('Request access checked', { allowed: decision.allowed })
```

- Creating a checker validates and compiles rules. `loadPolicy({ file })` reads independent YAML at startup, limited to 1 MiB. Invalid configuration throws and must stop the host. File references cannot be mixed with inline rules.
- Global conditions and all matching rules must pass; deny addresses take priority. Empty IP/time lists leave that dimension unrestricted, and timezone defaults to UTC. Paths include deployment prefixes, match exactly or end in `/**`, and GET does not imply HEAD.
- Default `auto` in `createClientIpResolver()` ignores forwarded headers on ordinary hosts; only managed private Compose uses the container subnet. `[]` disables proxy trust. Self-managed hosts explicitly list proxy IPs/CIDRs; peer addresses must come from sockets or trusted platforms.
- Path `encryption` can be `required` / `disabled`; omission inherits the host setting. Opposing modes on overlapping paths and methods fail at creation. Hosts use `check.encryption()` / `requiresEncryption` to wire transport behavior. Core does not hold keys or encrypt/decrypt; HTTPS and authentication are still required.

See the [request access guide](../../docs/usage/configuration/request-access.md) for defaults, policy files, proxy topology, and deployment steps.

### Creating and checking identifiers: `core.id`

Create business identifiers and log correlation IDs, or validate UUID v4/nanoid inputs.

```ts
import { core } from '@h-ai/core'

// 以下随机值仅展示格式，每次执行都不同。
core.id.generate() // 如 'V1StGXR8_Z5jdHi6B-myT'，默认 21 字符；generate(8) 返回 8 字符。
const shortId = core.id.short() // 如 'V1StGXR8_Z'，10 字符。
core.id.withPrefix('order_') // 如 'order_V1StGXR8_Z5jdHi6B-myT'，前缀后接 21 字符。
core.id.trace() // 如 'trace-V1StGXR8_Z5jdHi6B-myT'。
core.id.request() // 如 'req-V1StGXR8_Z5jdHi6B-myT'。
const uuid = core.id.uuid() // 如 '550e8400-e29b-41d4-a716-446655440000'，UUID v4。
core.id.isValidUUID(uuid) // true。
core.id.isValidNanoId(shortId, 10) // true。
```

IDs are not secrets. UUID requires cryptographic randomness and throws if unavailable. _core.yml has no global ID length/prefix settings; pass options per call.

### Checking value types: `core.typeUtils`

Check boundary values and narrow their TypeScript types in branches. These checks do not replace business schema validation.

```ts
import { core } from '@h-ai/core'

core.typeUtils.isDefined(null) // false，同时排除 null 和 undefined。
core.typeUtils.isObject({ name: 'orders' }) // true；排除 null/数组，但也接受 Date 和类实例。
core.typeUtils.isFunction(() => {}) // true。
core.typeUtils.isPromise(Promise.resolve('ready')) // true。
core.typeUtils.isString('orders') // true。
core.typeUtils.isNumber(3000) // true；传 NaN 返回 false。
core.typeUtils.isBoolean(false) // true。
core.typeUtils.isArray([1, 2]) // true。
```

### Objects: `core.object`

Clone, merge, and select object fields, with typed keys/values/entries and fromEntries.

```ts
import { core } from '@h-ai/core'

const defaults = { name: 'orders', port: 3000 }
const copy = core.object.deepClone(defaults) // { name: 'orders', port: 3000 }，新副本。
// 合并局部覆盖时，显式保留包含 name/port 的完整配置类型。
const settings = core.object.deepMerge<typeof defaults>(copy, { port: 4000 }) // { name: 'orders', port: 4000 }。
core.object.pick(settings, ['name']) // { name: 'orders' }。
core.object.omit(settings, ['port']) // { name: 'orders' }。
core.object.keys(settings) // ['name', 'port']，元素类型为 'name' | 'port'。
core.object.values(settings) // ['orders', 4000]。
core.object.entries(settings) // [['name', 'orders'], ['port', 4000]]。
core.object.fromEntries([
  ['mode', 'local']
]) // { mode: 'local' }。
```

deepClone uses structuredClone for cloneable Date/Map/Set/cyclic values and throws for unsupported values such as functions. deepMerge recursively merges plain objects only; later arrays, dates, collections, and class instances replace earlier values without modifying inputs. It does not clone instances.

### Strings: `core.string`

Convert naming formats, prepare display strings, detect whitespace, and compare strings.

```ts
import { core } from '@h-ai/core'

core.string.capitalize('hello') // 'Hello'。
core.string.kebabCase('helloWorld') // 'hello-world'。
core.string.camelCase('hello-world') // 'helloWorld'。
core.string.snakeCase('helloWorld') // 'hello_world'。
core.string.pascalCase('hello-world') // 'HelloWorld'。
core.string.truncate('abcdef', 3) // 'abc...'。
core.string.trim(' hello ') // 'hello'。
core.string.isBlank(' ') // true。
core.string.isNotBlank('hello') // true。
core.string.padStart('5', 3, '0') // '005'。
core.string.padEnd('5', 3, '0') // '500'。
core.string.constantTimeEqual('same', 'same') // true；安全边界见下方说明。
```

Node constantTimeEqual uses native timingSafeEqual on equal-length UTF-16 bytes and rejects unequal lengths immediately. Browser engines provide no constant-time guarantee; do not use this for server credential checks.

### Arrays: `core.array`

Deduplicate, chunk, group, remove nullish values, or calculate intersections/differences while retaining the input array.

```ts
import { core } from '@h-ai/core'

core.array.unique([1, 1, 2]) // [1, 2]。
core.array.chunk([1, 2, 3], 2) // [[1, 2], [3]]。
core.array.groupBy([
  { role: 'admin' },
  { role: 'user' }
], item => item.role)
// => { admin: [{ role: 'admin' }], user: [{ role: 'user' }] }
core.array.first([1, 2, 3]) // 1；空数组为 undefined。
core.array.last([1, 2, 3]) // 3；空数组为 undefined。
core.array.flatten([
  [1],
  [2, 3]
]) // [1, 2, 3]，只展开一层。
core.array.compact([0, null, 1, undefined]) // [0, 1]，保留 0/false/空字符串。
core.array.shuffle([1, 2, 3]) // 如 [2, 3, 1]，次序随机；新数组不修改输入。
core.array.intersection([1, 2], [2, 3]) // [2]。
core.array.difference([1, 2], [2, 3]) // [1]。
```

groupBy supports prototype names such as `constructor` and `__proto__`. chunk expects a positive integer size and returns an empty array for size<=0.

### Asynchronous work: `core.async`

Schedule delays, timeouts, retries, bounded/serial work, or debounce/throttle input and scroll events.

```ts
import { core } from '@h-ai/core'

await core.async.delay(1) // 等待约 1ms 后得到 undefined；计时以运行环境为准。
await core.async.withTimeout(Promise.resolve('ready'), 1000) // 'ready'；超时则 reject 为 Error。
await core.async.retry(async () => 'ready', { maxRetries: 3, delay: 10 }) // 'ready'，本例首次即成功。
await core.async.parallel([1, 2, 3], async value => value * 2, 2) // [2, 4, 6]，最多同时执行两项。
await core.async.serial([1, 2, 3], async value => value * 2) // [2, 4, 6]，按输入顺序逐项执行。

// 两种包装保留回调参数类型；调用 search/scroll 时传入同样类型的参数。
const search = core.async.debounce((term: string) => core.logger.debug('Search requested', { term }), 100)
const scroll = core.async.throttle((position: number) => core.logger.debug('Scroll position', { position }), 100)
// debounce/throttle 均返回包装函数，调用时返回 undefined。
core.logger.setLevel('debug') // 返回 undefined；确保下面的 debug 日志可见。
search('orders') // 约 100ms 后回调收到 'orders'；100ms 内连续调用只处理最后一次。
scroll(100) // 本例第一次调用立即回调，position 为 100；100ms 内最多执行一次。
```

withTimeout limits waiting but does not cancel work. retry handles throws/rejections, not failed HaiResult values; current maxRetries includes the first attempt, so 3 means at most three executions. parallel requires positive safe integer concurrency; invalid values reject with RangeError before any task runs. Result order follows input order.

### Dates and time: `core.time`

Convert timestamps, Date values, and display text, and calculate local calendar boundaries or relative time.

```ts
import { core } from '@h-ai/core'

// date 与以下日期运算使用本机时区；parseDate 中的 Z 表示 UTC。
const date = new Date(2026, 0, 1, 12, 0, 0)
core.time.formatDate(date, 'YYYY-MM-DD HH:mm:ss') // '2026-01-01 12:00:00'。
core.i18n.setGlobalLocale('zh-CN') // 返回 undefined；相对时间使用中文。
core.time.timeAgo(new Date(Date.now() - 60_000)) // '1 分钟前'（立即执行时）。
core.time.now() // 当前毫秒时间戳，如 1767268800000；每次执行随时间变化。
core.time.nowSeconds() // 当前秒时间戳，如 1767268800；相当于当前毫秒时间戳除以 1000 后向下取整。
const parsed = core.time.parseDate('2026-01-01T00:00:00Z') // Date 对象，toISOString() 为 '2026-01-01T00:00:00.000Z'。
core.time.isValidDate(parsed) // true；Invalid Date 返回 false。
core.time.addDays(date, 7) // 新 Date，本机时间 2026-01-08 12:00:00。
core.time.addHours(date, 2) // 新 Date，本机时间 2026-01-01 14:00:00。
core.time.startOfDay(date) // 新 Date，本机时间 2026-01-01 00:00:00.000。
core.time.endOfDay(date) // 新 Date，本机时间 2026-01-01 23:59:59.999。
```

formatDate supports YYYY/MM/DD/HH/mm/ss tokens and defaults to YYYY-MM-DD. Date arithmetic returns new Date values. Invalid parseDate input produces an invalid date rather than automatically throwing; check isValidDate.

See the [Core reference](../cli/templates/skills/hai-core/reference.md) for complete parameters and less common options. Current published declarations define the contract.

## Development and testing

Run from the repository root (use `pnpm.cmd` in PowerShell):

```bash
pnpm --filter @h-ai/core typecheck
pnpm --filter @h-ai/core lint
pnpm --filter @h-ai/core build
pnpm --filter @h-ai/core test
```

See the [module JSDoc conventions](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) for declaration and example checks.

## License

Apache-2.0
