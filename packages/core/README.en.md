# @h-ai/core

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md)

`@h-ai/core` is the shared foundation of Hai Framework. It gives applications and framework modules consistent configuration, errors, logging, and internationalization. Utilities work directly; call `core.init()` when a Node application needs file configuration.

## Quick Start

```bash
pnpm add @h-ai/core
```

Import `core` from `@h-ai/core` to log events, read messages, or use the utilities right away. The same entry point exports `ok`, `err`, types, schemas, and error constants. Install Zod with `pnpm add zod` for the custom configuration and form validation examples.

### Initialization: `core.init`

Use `core.init()` to load YAML and configure logging at Node startup, or to set up logging on a web page. See [Application startup and shutdown](#application-startup-and-shutdown) for starting a database or cache.

#### Node.js

Create `config/_core.yml`:

```yaml
name: orders
version: 0.1.0
env: development
defaultLocale: en-US
logging:
  level: info
  format: pretty
```

```ts
import type { CoreConfig } from '@h-ai/core'
import { core } from '@h-ai/core'

// Read the config directory. A valid _core.yml is cached under core.
core.init({ configDir: './config' })
const settings = core.config.getOrThrow<CoreConfig>('core')

// Set the default language and log startup.
core.i18n.setGlobalLocale(settings.defaultLocale)
core.logger.info('Application ready', { app: settings.name }) // app: 'orders'
```

`core.init()` reads the directory synchronously. If a file fails to load or validate, Core logs its path and error code and continues with the remaining files. The example uses `getOrThrow()` to stop startup if the required `core` entry is missing. Directory scanning and logger setup can throw.

#### Browser

```ts
import { core } from '@h-ai/core'

// Set the log threshold and default language on page startup.
core.init({
  logging: { level: 'warn' }
})
core.i18n.setGlobalLocale('en-US')

// Log a request ID so related events can be correlated.
const requestId = core.id.request()
core.logger.warn('Request needs attention', { requestId })
```

The host supplies public configuration fields; never send complete server settings or secrets. Browser `core.config.get()` / `has()` / `keys()` return `undefined` / `false` / `[]`. `loadEnvFiles()`, `load()`, `validate()`, and `reload()` return `SERVICE_UNAVAILABLE`; `getOrThrow()` throws. `watch()` immediately calls back with the same unavailable error and returns a no-op unsubscribe function.

## Features

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

### Files and environment settings: `core.config`

Read YAML, apply environment overrides, validate configuration types, and manage cached settings and file watchers. The file and environment operations below require Node.

#### Loading, validating, and reading

`core.init({ configDir, configSchemas?, watchConfig? })` scans direct `.yml` / `.yaml` children of the directory. `_core.yml` becomes `core`, `_db.yml` becomes `db`, and `app.yml` becomes `app`. The CLI reads build/deploy settings from root `hai.json`; they are separate from runtime YAML.

`_core.yml` is validated with `CoreConfigSchema`, accepting only `name`, `version`, `env`, `defaultLocale`, and `logging`. The metadata defaults are `hai Admin`, `0.1.0`, `development`, and `zh-CN`; `logging` is optional. Metadata does not set `NODE_ENV`, switch message languages, or register application translations. Configure logging here; explicit `core.init({ logging })` overrides the application of YAML logging settings during that initialization.

To load multiple application files, pass `core.init({ configDir: './config', configSchemas: { app: AppSchema } })` so Core can find optional fields and interpret interpolated values. Then call `core.config.validate('app', AppSchema)` and check `success` before reading `data`.

Each `validate()` call starts from the last successfully loaded YAML snapshot and uses the current environment variables and the supplied schema. For example, with `code: ${APP_CODE:00123}` and no environment override, a string schema gets `'00123'` even if the initial load without a schema returned a number. Repeated validation applies schema transforms to the original input each time. Use `reload()` after editing the file. A successful reload updates both the snapshot and the result.

The following file examples use this `config/app.yml` with no additional environment overrides:

```yaml
# config/app.yml
port: 3000
```

To read a single file, pass a synchronous schema to `load()`. When the schema rejects data or a custom check throws, Core returns `CONFIG_VALIDATION_ERROR` and keeps the issues or original exception in `error.cause`. The type arguments to `get()` and `getOrThrow()` tell TypeScript what to expect. The schema validates the data.

```ts
import { core } from '@h-ai/core'
import { z } from 'zod'

const AppSchema = z.object({
  port: z.number().int().min(1).max(65535),
})

// Read and validate the file. Success yields { success: true, data: { port: 3000 } }.
const loaded = core.config.load('app', './config/app.yml', AppSchema)
if (!loaded.success)
  throw new Error(loaded.error.message, { cause: loaded.error })

// These results assume app is the only loaded entry.
core.config.has('app') // true
core.config.keys() // ['app']
core.config.get<z.infer<typeof AppSchema>>('app') // { port: 3000 }
core.config.getOrThrow<z.infer<typeof AppSchema>>('app') // { port: 3000 }
```

#### Reloading, watching, and cleanup

`reload()` rereads a file and notifies its subscribers. `watch()` monitors the file in its parent directory, so a save, atomic replacement, or deletion and recreation can trigger a reload. If reading or validation fails, the last successful value stays in the cache and the callback receives `null` and an error.

- If the name has yet to be loaded, `watch()` immediately calls back with `CONFIG_NOT_LOADED`.
- If the system cannot start a watcher or reports a watcher error, the callback receives `SERVICE_UNAVAILABLE` and `isWatching()` returns `false`. Call `watch()` again once the directory is available.
- The unsubscribe function removes one callback. `unwatch(name)` stops every watcher for that name, and `clear(name)` also removes the cached entry. Omit the name to apply either method to all entries.

To point an existing name at another file, stop watching it before loading and watching the new file.

`watchConfig` defaults to `false`. When enabled, `core.init()` watches the files it loaded successfully. Reloading updates the Core cache. Each module applies the settings through its own lifecycle.

```ts
import { core } from '@h-ai/core'

// Continue from the previous example. A successful reload passes the current port to the callback.
const stop = core.config.watch<{ port: number }>('app', (settings, error) => {
  if (error) {
    core.logger.warn('App config watch reported a failure', { code: error.code })
    return
  }
  core.logger.info('App config reloaded', { port: settings?.port })
})

try {
  // Trigger a reload. If the file still says port: 3000, the callback logs port: 3000.
  const reloaded = core.config.reload('app')
  if (!reloaded.success)
    throw new Error(reloaded.error.message, { cause: reloaded.error })
}
finally {
  stop()
  core.config.clear('app')
}
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

At the Node entry point, call `loadEnvFiles()` and check `success`. Assign the result to `process.env` before loading YAML. The modes `development` and `production` select the `dev` and `prod` files. Missing files are skipped, and duplicate keys within one file produce an error.

Values come from the process environment first, then `.env.<mode>.local`, `.env.local`, `.env.<mode>`, `.env`, and finally YAML. `loadEnvFiles()` merges existing `HAI_*` process variables and process variables whose names appear in a dotenv file. Keep private `.local` files on your machine.

```ts
import { core } from '@h-ai/core'

// Start with port: 3000 in config/app.yml and HAI_APP_PORT=4000 in .env. Assume no higher-priority override.
const result = core.config.loadEnvFiles({ mode: 'dev', envDir: '.' })
if (!result.success)
  throw new Error(result.error.message, { cause: result.error })

Object.assign(process.env, result.data)
core.init({ configDir: './config' })
core.config.get('app') // { port: 4000 }
```

#### What type does the replacement produce?

Environment variables start as text. Pass a Zod schema to `load()` / `resolve()` to convert replacements by field type: `z.number()` produces numbers, `z.boolean()` produces booleans, and `z.string()` preserves strings.

A full-value ${PORT:3000} can produce number 3000, and ${ENABLED:false} boolean false. Mixed text such as server-${PORT:3000} stays a string. A string field code preserves the fallback 00123 as '00123', including leading zeros. This example supplies the equivalent YAML values and environment in memory without reading a file:

```ts
import { core } from '@h-ai/core'
import { z } from 'zod'

// Pass explicit environment data so the example is independent of process.env.
const AppSchema = z.object({
  port: z.number(),
  enabled: z.boolean(),
  label: z.string(),
  code: z.string()
})
const resolved = core.config.resolve({
  name: 'app',

  value: {
    // eslint-disable-next-line no-template-curly-in-string -- Leave the placeholder for Core to resolve.
    port: '${PORT:3000}',
    // eslint-disable-next-line no-template-curly-in-string -- Leave the placeholder for Core to resolve.
    enabled: '${ENABLED:false}',
    // eslint-disable-next-line no-template-curly-in-string -- Leave the placeholder for Core to resolve.
    label: 'server-${PORT:3000}',
    // eslint-disable-next-line no-template-curly-in-string -- Leave the placeholder for Core to resolve.
    code: '${APP_CODE:00123}'
  },
  environment: { PORT: '4000', HAI_APP_PORT: '5000' },
  schema: AppSchema,
})
if (!resolved.success)
  throw new Error(resolved.error.message, { cause: resolved.error })

// resolved：{ success: true, data: { port: 5000, enabled: false, label: 'server-4000', code: '00123' } }

// Check the resolved values against the application schema.
const validated = AppSchema.safeParse(resolved.data)
if (!validated.success)
  throw new Error(validated.error.message, { cause: validated.error })
core.logger.info('Config resolved', { port: validated.data.port }) // port: 5000
```

An empty string means the variable is set with no characters; it is not missing, null, false, or zero. APP_CODE='' leaves code as '' instead of using 00123. The schema decides whether this is allowed; numeric fields usually reject empty strings.

Substitution processes expressions in YAML; `server-${PORT}` inside an environment value or parent JSON remains literal text. For example, HAI_APP_LABEL='server-${PORT}' stays server-${PORT}. Put the expression in YAML when substitution is intended.

Without a schema, paths come from existing YAML/JSON structure and single expressions use YAML scalar rules for numbers/booleans. configSchemas can supply optional legal paths missing from YAML. Final business validation still belongs in validate() or module initialization.

#### Tools for generating configuration files

resolve() also lets build/deploy tools calculate settings in memory. toEnv() converts objects to environment variables, mergeEnv() merges sources, and stringifyEnv()/parseEnv() encode/decode literal .env text. These tools do not mask secrets.

```ts
import { core } from '@h-ai/core'

// Convert the config to environment variables. Arrays remain JSON.
const values = core.config.toEnv({
  prefix: 'HAI_APP',
  value: {
    port: 3000,
    tags: ['local']
  }
})
// values：{ HAI_APP_PORT: '3000', HAI_APP_TAGS: '["local"]' }
const merged = core.config.mergeEnv([
  values,
  { HAI_APP_PORT: '4000' }
])
// merged：{ HAI_APP_PORT: '4000', HAI_APP_TAGS: '["local"]' }
const text = core.config.stringifyEnv(merged) // Encode the values as dotenv text.
// The text contains these two lines.
// HAI_APP_PORT='4000'
// HAI_APP_TAGS='["local"]'
const restored = core.config.parseEnv(text) // Read back the literal values.
// restored：{ HAI_APP_PORT: '4000', HAI_APP_TAGS: '["local"]' }
core.logger.info('Generated config verified', { port: restored.HAI_APP_PORT })
```

Plain objects expand into fields. Arrays, dynamic dictionaries, and empty objects stay in JSON. `stringifyEnv()` generates text for Node by default. Pass `{ target: 'compose' }` for Compose’s dollar sign handling. The Node parser strips literal carriage returns (`\r`) from single-quoted values. [Runtime configuration guide](../../docs/usage/configuration/runtime.md)

### Logging: `core.logger`

`core.logger` emits records at or above the configured threshold. The levels are `trace`, `debug`, `info`, `warn`, `error`, and `fatal` in increasing severity. A `fatal` threshold emits only `fatal` records. The application decides when to exit.

The logger starts at `info` with `pretty` formatting. When YAML supplies a `logging` object, its schema defaults an omitted `format` to `json`. Node uses pino and falls back to JSON when optional `pino-pretty` is unavailable. Browsers write to the developer console, with `bigint` values rendered as decimal strings and circular references as `[Circular]`.

```ts
import { core } from '@h-ai/core'

core.logger.setLevel('info')
core.logger.debug('Read started') // Filtered out by the info threshold.
core.logger.info('Order created', { orderId: 'order-1' }) // The log includes orderId.
core.logger.warn('Retry scheduled')
core.logger.error('Operation failed', {
  error: new Error('Example failure')
})
```

create() makes a named logger; child() attaches fixed context. configure() sets output and extra redaction paths; setLevel()/getLevel() change or inspect the global level.

```ts
import { core } from '@h-ai/core'

core.logger.configure({
  level: 'info',
  format: 'json',
  redact: ['customer.email'],
})
const orders = core.logger.create({ name: 'orders' })
const request = orders.child({ requestId: 'request-1' })

orders.info('Order created', {
  customer: { email: 'user@example.com' },
}) // customer.email: '[REDACTED]'
request.warn('Request needs attention') // requestId: 'request-1'
core.logger.getLevel() // 'info'
```

Existing default, module, and nested child loggers use current global settings on subsequent writes; `setLevel()` also takes effect immediately. Explicit `create()` level/format/context options take precedence; unspecified options inherit dynamically. Per-call context overrides fixed context, then `core.context` adds current request correlation fields. Browser JSON includes `level` / `msg`; pretty output includes readable text and context.

observe() supports diagnostics collection, receiving records after level filtering and masking and returning an unsubscribe function. Collect bounded memory data in the callback and persist asynchronously elsewhere. Observation is not persistence; exceptions and synchronous reentry are isolated.

```ts
import { core } from '@h-ai/core'

const recentMessages: string[] = []
const stop = core.logger.observe((record) => {
  if (recentMessages.length === 100)
    recentMessages.shift()
  recentMessages.push(record.message)
})
try {
  core.logger.warn('Observed event')
  recentMessages // ['Observed event']
}
finally {
  stop()
}
```

### Request correlation: `core.context`

run() gives a request/task its requestId, userId, scopeId, jobId, and other correlation fields; get() reads them. On Node they remain available after database or other asynchronous work, without another request overwriting them. Existing loggers automatically include these fields.

```ts
import { core } from '@h-ai/core'

// Node preserves the request context across async work.
await core.context.run({ requestId: 'request-1', userId: 'user-1' }, async () => {
  await core.async.delay(1)
  const current = core.context.get() // requestId and traceId are both 'request-1'. userId is 'user-1'.
  core.logger.info('Request continued', { requestId: current.requestId })
  return current.requestId
}) // The callback resolves to 'request-1'.
core.context.get() // {} outside the request

// The collector can write a log without notifying its own observer.
core.context.run({ suppressLogObservers: true }, () => core.logger.warn('Collector diagnostic'))
```

In browsers values exist only in synchronous callback code and are not retained after await. Correlation IDs do not authorize access; trusted server code must provide identity and tenant scope.

### Cleaning diagnostic data: `core.sanitize`

Clean credentials before logs, diagnostic exports, or public errors. Check sensitive names, mask a single value or object tree, clean URL credentials, or remove labeled/known secrets from text.

```ts
import { core } from '@h-ai/core'

core.sanitize.isSensitiveKey('apiKey') // true
core.sanitize.sanitizeSensitiveValue('example-only', 'password') // '[REDACTED]'
const safe = core.sanitize.sanitizeSensitiveFields({ password: 'example-only', email: 'user@example.com' })
// safe is { password: '[REDACTED]', email: 'user@example.com' }. The input stays intact.
// Mask the email in a second pass over the redacted copy.
core.sanitize.sanitizeSensitiveFields(safe, {
  matcher: ['email'],
  replacement: '***'
})
// => { password: '[REDACTED]', email: '***' }
core.sanitize.sanitizeUrl('https://user:example-only@example.com/?token=example-only')
// => 'https://[REDACTED]:[REDACTED]@example.com/?token=[REDACTED]'
core.sanitize.sanitizeText('Bearer example-only') // '[REDACTED]'
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

// Define a stable error code and look up the message when the error occurs.
const OrderError = core.error.buildHaiErrorsDef('orders', { NOT_FOUND: '300:404' })
// OrderError.NOT_FOUND：{ code: 'hai:orders:300', httpStatus: 404, system: 'hai', module: 'orders' }
const failure = core.error.buildHaiErrorInst(OrderError.NOT_FOUND, core.i18n.coreM('core_errorNotFound', { locale: 'en-US' }))
// failure combines the definition with message: 'Resource not found'.
const publicError = core.error.toPublic(failure, 'request-1')
// The public error preserves code, httpStatus, system, and module.
// traceId is 'request-1' and the message is 'Resource not found (traceId: request-1)'.
const message = core.error.formatMessage(publicError) // 'Resource not found (traceId: request-1)'
core.logger.warn('Order unavailable', { error: failure, publicMessage: message })
```

#### Shared result type and standalone constructors

`HaiResult<T>` uses success to distinguish data from error. Import `ok` / `err` to construct successful or failed results. Check success after business operations. Getters, utilities, and factories follow their direct-value or throwing signatures.

```ts
import type { HaiResult } from '@h-ai/core'
import { core, err, HaiCommonError, ok } from '@h-ai/core'

// Return err for a business failure and ok for a result.
function divide(a: number, b: number): HaiResult<number> {
  if (b === 0)
    return err(HaiCommonError.VALIDATION_ERROR, core.i18n.coreM('core_errorValidation', { locale: 'en-US' }))
  return ok(a / b) // ok(5) returns { success: true, data: 5 }
}

// Check success before using data or error.
const result = divide(10, 2) // { success: true, data: 5 }
if (!result.success)
  core.logger.warn('Calculation failed', { error: result.error })
else
  core.logger.info('Calculation completed', { value: result.data })

const failed = divide(10, 0)
// failed：{ success: false, error: { code: 'hai:common:200', httpStatus: 400,
// system: 'hai', module: 'common', message: 'Validation failed' } }
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

// Set the page language or the process default at startup.
core.i18n.setGlobalLocale('en-US')
core.i18n.getGlobalLocale() // 'en-US'
core.i18n.coreM('core_errorNotFound') // 'Resource not found'
core.i18n.DEFAULT_LOCALE // zh-CN
core.i18n.DEFAULT_LOCALES // [{ code: 'zh-CN', label: '简体中文' }, { code: 'en-US', label: 'English' }, { code: 'ja-JP', label: '日本語' }]
```

`zh`, `en`, and `ja` are aliases for `zh-CN`, `en-US`, and `ja-JP`. A message getter uses the explicit `locale` first, then the Node request language, then the app default. It uses the `zh-CN` dictionary when the requested locale is unsupported or its dictionary is missing. A missing message returns the key, and a missing parameter leaves a placeholder such as `{name}` in the text.

```ts
import { core } from '@h-ai/core'

// Supply one dictionary per language. Pass interpolation values at the call site.
const message = core.i18n.createMessageGetter({
  'zh-CN': { welcome: '欢迎 {name}' },
  'en-US': { welcome: 'Welcome {name}' },
  'ja-JP': { welcome: 'ようこそ {name}' },
})
// With locale 'zh-CN' and name 'Alice', message('welcome', ...) returns '欢迎 Alice'.
const greeting = await core.i18n.runWithLocale('en-US', async () => {
  await Promise.resolve()
  return message('welcome', {
    params: { name: 'Alice' }
  })
})
// greeting is 'Welcome Alice' after awaiting the callback.
core.logger.info('Greeting prepared', { greeting })
```

Wrap actual asynchronous Node request/SSR work in `runWithLocale()`. Serv establishes the request locale automatically; Kit provides the same entry point. Within a request, `setGlobalLocale()` changes only that request. Outside it, use it only for startup defaults. Browsers use application-level `setGlobalLocale()` or explicit locales. SSR UI stores should not modify process defaults.

### Field validation messages: `core.zodValidation`

Convert Zod errors into { field, message }[] for form hints. createPrefixedZodMessageGetter() selects translation keys by prefix; mapZodErrorToFormErrors() extracts, translates, and flattens field paths.

```ts
import { core } from '@h-ai/core'
import { z } from 'zod'

// This example uses Core’s email message. You can supply your form’s own message getter.
const message = core.zodValidation.createPrefixedZodMessageGetter('core', key =>
  key === 'core_validationEmail'
    ? core.i18n.coreM('core_validationEmail', { locale: 'en-US' })
    : core.i18n.coreM('core_errorValidation', { locale: 'en-US' }))
// message('validationEmail') returns 'Please enter a valid email address'.
const parsed = z.object({
  email: z.email()
}).safeParse({ email: 'invalid' })
if (!parsed.success) {
  const errors = core.zodValidation.mapZodErrorToFormErrors(parsed.error, message)
  // errors is [{ field: 'email', message: 'Please enter a valid email address' }].
  core.logger.info('Validation failed', { errors })
}
```

Pass the `error` from a failed `safeParse()` call. The mapper reads Zod v3/v4 `issues` or `errors` arrays and skips entries without a valid path and message. It translates default English messages and keeps application-supplied text. Field paths look like `items.0.email` and form-wide errors use `_`. Unknown fields in strict schemas receive a generic `validationUnexpectedFields` message.

### Module startup and helpers: `core.module`

Applications and module implementations can reuse these helpers to manage several modules or return consistent failures before initialization. The application chooses its actual modules.

#### Application startup and shutdown

Applications using several modules need to initialize resources such as databases before handling business work, then release them afterward. `core.module.createRuntime()` accepts each module's startup and cleanup functions and returns an object the application can call. Creating it does not start the modules.

This local development example additionally requires `@h-ai/reldb` and `@h-ai/cache`. Both use in-memory settings for demonstration; production must use the shared backends required by each module.

```ts
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'

// List the module callbacks in startup order.
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

// Both modules start when the host calls runtime.start().

// Start the database first, then the cache.
const started = await runtime.start() // { success: true, data: undefined } when both are ready
if (!started.success)
  throw new Error(started.error.message, { cause: started.error })

try {
  // Run application work after both modules are ready.
  core.logger.info('Application modules ready')
}
finally {
  // Close the cache first, then the database.
  const closed = await runtime.close() // { success: true, data: undefined } when both have closed
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
core.i18n.setGlobalLocale('en-US')
const waiting = core.module.createNotInitializedKit(HaiCommonError.NOT_INITIALIZED, () => message('notReady'))
waiting.error() // { code: 'hai:common:001', httpStatus: 500, system: 'hai', module: 'common', message: 'Initialize the module first' }
waiting.result<string>() // { success: false, error: waiting.error() }

// Use a proxy to supply operations until the module is ready.
const asyncOperations = waiting.proxy<{ read: () => Promise<HaiResult<string>> }>()
const syncOperations = waiting.proxy<{ read: () => HaiResult<string> }>('sync')
const result = await asyncOperations.read() // { success: false, error: waiting.error() }
if (!result.success)
  core.logger.warn('Read before initialization', { error: result.error })
syncOperations.read() // { success: false, error: waiting.error() } synchronously
```

#### Checking shared-state requirements

requiresSharedState() decides whether a production process should reject backends limited to one host. It only returns a decision; it does not connect or switch databases. Server code supplies the real environment.

```ts
import { core } from '@h-ai/core'

// In a Node service, pass process.env.
core.module.requiresSharedState({ NODE_ENV: 'production' }) // true
core.module.requiresSharedState({ NODE_ENV: 'production', HAI_E2E: '1' }) // false for an explicitly marked E2E run
```

### Request access checks: `core.access` (Node)

At HTTP entry points, resolve a trusted client IP and check addresses, paths, methods, and time windows. Core returns decisions; Serv http.access or Kit createHandle({ access }) connects them to request processing.

#### Resolving and checking client addresses

```ts
import { AccessConditionSchema, core } from '@h-ai/core'

core.access.normalizeClientIp('::ffff:198.51.100.23') // 198.51.100.23
const resolve = core.access.createClientIpResolver(['192.0.2.10']) // Trust only this proxy.
const request = new Request('https://example.test/api/orders', {
  headers: { 'x-forwarded-for': '198.51.100.23' }
})
// The second argument represents the peer address from the socket or trusted host.
const clientIp = resolve(request, '192.0.2.10') // '198.51.100.23' from the trusted proxy
const check = core.access.createConditionCheck(AccessConditionSchema.parse({
  allowIps: ['198.51.100.0/24']
}))
// check(clientIp) returns { allowed: true }.
core.logger.info('Address checked', { allowed: check(clientIp).allowed })
```

#### Loading policies and checking requests

```ts
import { core } from '@h-ai/core'

// To read a separate file at startup, pass { file: './config/security/request-access.yml' }.
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
// The rule gets denyIps: [], windows: [], and timezone: 'UTC'.
const check = core.access.createRequestCheck(policy) // Returns a callable check with encryption and requiresEncryption.
const decision = check('/api/external/sync', 'POST', '192.0.2.10') // { allowed: true }
check.encryption('/api/external/sync', 'POST') // 'disabled'
check.requiresEncryption // false
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

// Generated values vary. These comments show the format.
core.id.generate() // e.g. 'V1StGXR8_Z5jdHi6B-myT' (21 characters by default)
const shortId = core.id.short() // e.g. 'V1StGXR8_Z' (10 characters)
core.id.withPrefix('order_') // e.g. 'order_V1StGXR8_Z5jdHi6B-myT'
core.id.trace() // e.g. 'trace-V1StGXR8_Z5jdHi6B-myT'
core.id.request() // e.g. 'req-V1StGXR8_Z5jdHi6B-myT'
const uuid = core.id.uuid() // e.g. '550e8400-e29b-41d4-a716-446655440000' (UUID v4)
core.id.isValidUUID(uuid) // true
core.id.isValidNanoId(shortId, 10) // true
```

IDs are not secrets. UUID requires cryptographic randomness and throws if unavailable. _core.yml has no global ID length/prefix settings; pass options per call.

### Checking value types: `core.typeUtils`

Check boundary values and narrow their TypeScript types in branches. These checks do not replace business schema validation.

```ts
import { core } from '@h-ai/core'

core.typeUtils.isDefined(null) // false for null or undefined
core.typeUtils.isObject({ name: 'orders' }) // true, including Date and class instances. Arrays and null return false.
core.typeUtils.isFunction(() => {}) // true
core.typeUtils.isPromise(Promise.resolve('ready')) // true
core.typeUtils.isString('orders') // true
core.typeUtils.isNumber(3000) // true. NaN returns false.
core.typeUtils.isBoolean(false) // true
core.typeUtils.isArray([1, 2]) // true
```

### Objects: `core.object`

Clone, merge, and select object fields, with typed keys/values/entries and fromEntries.

```ts
import { core } from '@h-ai/core'

const defaults = { name: 'orders', port: 3000 }
const copy = core.object.deepClone(defaults) // { name: 'orders', port: 3000 } (a new object)
// Use the defaults type when merging a partial override.
const settings = core.object.deepMerge<typeof defaults>(copy, { port: 4000 }) // { name: 'orders', port: 4000 }
core.object.pick(settings, ['name']) // { name: 'orders' }
core.object.omit(settings, ['port']) // { name: 'orders' }
core.object.keys(settings) // ['name', 'port']
core.object.values(settings) // ['orders', 4000]
core.object.entries(settings) // [['name', 'orders'], ['port', 4000]]
core.object.fromEntries([
  ['mode', 'local']
]) // { mode: 'local' }
```

deepClone uses structuredClone for cloneable Date/Map/Set/cyclic values and throws for unsupported values such as functions. deepMerge recursively merges plain objects only; later arrays, dates, collections, and class instances replace earlier values without modifying inputs. It does not clone instances.

### Strings: `core.string`

Convert naming formats, prepare display strings, detect whitespace, and compare strings.

```ts
import { core } from '@h-ai/core'

core.string.capitalize('hello') // 'Hello'
core.string.kebabCase('helloWorld') // 'hello-world'
core.string.camelCase('hello-world') // 'helloWorld'
core.string.snakeCase('helloWorld') // 'hello_world'
core.string.pascalCase('hello-world') // 'HelloWorld'
core.string.truncate('abcdef', 3) // 'abc...'
core.string.trim(' hello ') // 'hello'
core.string.isBlank(' ') // true
core.string.isNotBlank('hello') // true
core.string.padStart('5', 3, '0') // '005'
core.string.padEnd('5', 3, '0') // '500'
core.string.constantTimeEqual('same', 'same') // true
```

Node constantTimeEqual uses native timingSafeEqual on equal-length UTF-16 bytes and rejects unequal lengths immediately. Browser engines provide no constant-time guarantee; do not use this for server credential checks.

### Arrays: `core.array`

Deduplicate, chunk, group, remove nullish values, or calculate intersections/differences while retaining the input array.

```ts
import { core } from '@h-ai/core'

core.array.unique([1, 1, 2]) // [1, 2]
core.array.chunk([1, 2, 3], 2) // [[1, 2], [3]]
core.array.groupBy([
  { role: 'admin' },
  { role: 'user' }
], item => item.role)
// => { admin: [{ role: 'admin' }], user: [{ role: 'user' }] }
core.array.first([1, 2, 3]) // 1. An empty array returns undefined.
core.array.last([1, 2, 3]) // 3. An empty array returns undefined.
core.array.flatten([
  [1],
  [2, 3]
]) // [1, 2, 3] (one level)
core.array.compact([0, null, 1, undefined]) // [0, 1]. Keeps 0, false, and empty strings.
core.array.shuffle([1, 2, 3]) // e.g. [2, 3, 1] (a new array)
core.array.intersection([1, 2], [2, 3]) // [2]
core.array.difference([1, 2], [2, 3]) // [1]
```

`groupBy()` accepts keys that also occur on object prototypes, such as `constructor`. `chunk()` requires a positive safe integer and returns an empty array for fractions, infinity, and other invalid sizes.

### Asynchronous work: `core.async`

Schedule delays, timeouts, retries, bounded/serial work, or debounce/throttle input and scroll events.

```ts
import { core } from '@h-ai/core'

await core.async.delay(1) // Resolves after about 1 ms, depending on the timer.
await core.async.withTimeout(Promise.resolve('ready'), 1000) // 'ready'. A timeout rejects with Error.
await core.async.retry(async () => 'ready', { maxRetries: 3, delay: 10 }) // 'ready' on the first attempt
await core.async.parallel([1, 2, 3], async value => value * 2, 2) // [2, 4, 6], up to two at a time
await core.async.serial([1, 2, 3], async value => value * 2) // [2, 4, 6], one at a time

// Both wrappers preserve the callback parameter types.
const search = core.async.debounce((term: string) => core.logger.debug('Search requested', { term }), 100)
const scroll = core.async.throttle((position: number) => core.logger.debug('Scroll position', { position }), 100)
core.logger.setLevel('debug')
search('orders') // Calls the callback with 'orders' after about 100 ms of inactivity.
scroll(100) // Runs immediately, then ignores calls for 100 ms.
```

- `withTimeout()` rejects the waiting promise on timeout. The caller manages cancellation of the underlying work.
- `retry()` runs again when the operation throws or rejects. `maxRetries` includes the initial attempt and defaults to three total attempts with a 1,000 ms delay. The caller handles a returned failed `HaiResult`.
- `parallel()` returns results in input order. Concurrency must be a positive safe integer. Invalid values reject with `RangeError` before any task runs. When a task rejects, the other workers may continue processing the queue.

### Dates and time: `core.time`

Convert timestamps, Date values, and display text, and calculate local calendar boundaries or relative time.

```ts
import { core } from '@h-ai/core'

// These date operations use the runtime’s local time zone.
const date = new Date(2026, 0, 1, 12, 0, 0)
core.time.formatDate(date, 'YYYY-MM-DD HH:mm:ss') // '2026-01-01 12:00:00'
core.time.formatDate(date, 'MM/DD (MM-DD)') // '01/01 (01-01)'

core.i18n.setGlobalLocale('en-US')
core.time.timeAgo(new Date(Date.now() - 120_000)) // '2 minutes ago'
core.time.now() // Current Unix timestamp in milliseconds.
core.time.nowSeconds() // Current Unix timestamp rounded down to seconds.

const parsed = core.time.parseDate('2026-01-01T00:00:00Z')
parsed.toISOString() // '2026-01-01T00:00:00.000Z'
core.time.isValidDate(parsed) // true
core.time.addDays(date, 7) // 2026-01-08 12:00:00
core.time.addHours(date, 2) // 2026-01-01 14:00:00
core.time.startOfDay(date) // 2026-01-01 00:00:00.000
core.time.endOfDay(date) // 2026-01-01 23:59:59.999
```

`formatDate()` defaults to `YYYY-MM-DD` and substitutes every occurrence of a date token in the template. `parseDate()` uses the native `Date` parser. Use `isValidDate()` to check the result and ISO strings with a time zone when exchanging dates across environments. `addDays()` and `addHours()` use the local calendar and clock. Elapsed time can vary across daylight saving changes.

See the [Core reference](../cli/templates/skills/hai-core/reference.md) for complete parameters and less common options. Current published declarations define the contract.

## Configuration

core.init takes configuration directory, schemas and logging options, returns void synchronously and has no close. See Quick Start and core.config for file loading, environment precedence and field examples; init completing does not prove all business configuration is valid.

[Per-option purpose, use cases and examples](../../docs/usage/configuration/runtime.md).

## Error Handling

Check result.success for domain operations. Handle failures with the module error definitions and safe messages; retain codes, correlation IDs and sanitized causes in server logs. Synchronous tools, factories, stream iteration and lifecycle calls follow their own signatures. A completed Promise alone is not business success. See each feature for recovery limits.

## Development

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
