# Core API reference

[中文完整参考](core.md) · [日本語](core.ja.md) · [Core settings](../configuration/core.en.md) · [Core data](../data/core.en.md)

<a id="quick-start"></a>

## Quick start

Install the package with `pnpm add @h-ai/core`. Add `config/_core.yml` to a Node.js application.

```yaml schema=@h-ai/core:CoreConfigSchema
name: Orders
defaultLocale: en-US
```

```ts
import type { CoreConfig } from '@h-ai/core'
import { core } from '@h-ai/core'

core.init({ configDir: './config' })
const settings = core.config.getOrThrow<CoreConfig>('core')
core.i18n.setGlobalLocale(settings.defaultLocale)
core.logger.info('Application ready', { app: settings.name })
```

Core loads the immediate YAML files in the directory. It registers `_core.yml` as `core`, and `app.yml` as `app`. The example stops startup if the required Core settings could not be loaded. In a browser, pass logging options directly to `core.init({ logging: { level: 'warn' } })`. If the page needs the application name, return that field in the server's page data and keep credentials on the server.

<a id="api-reference"></a>
<a id="config-api"></a>

## Configuration API

The file and environment methods below are for Node.js. A name identifies the saved configuration, such as `app` for `config/app.yml`. Use a Zod schema such as `const AppSchema = z.object({ port: z.number().int().positive() })` to validate values loaded from a file containing `port: 3000`. Import `z` from `zod` for that example.

| API                                          | Purpose                                                   | Inputs and defaults                                                                                                                                                                                               | Result                                                                                                     | Example                                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `core.init(options?)`                        | Configure logging and scan YAML at startup                | Without `configDir`, Core skips the scan. `configSchemas` optionally supplies field types by config name. `watchConfig` defaults to `false`. Explicit `logging` takes precedence over YAML logging settings       | `void`. Logs individual file failures and continues. Directory or logger errors can throw                  | `core.init({ configDir: './config', configSchemas: { app: AppSchema }, watchConfig: true })`                                       |
| `core.config.loadEnvFiles(options)`          | Merge dotenv and existing environment variables           | `mode` required. `envDir` defaults to the working directory                                                                                                                                                       | `HaiResult<Record<string, string>>`. Apply `data` to `process.env` explicitly                              | `core.config.loadEnvFiles({ mode: 'dev' })`                                                                                        |
| `core.config.load(name, filePath, schema?)`  | Load one file and apply overrides                         | `name` and `filePath` required. Omit `schema` to load without schema validation                                                                                                                                   | `HaiResult<T>`. A failure preserves the last successful value                                              | `core.config.load('app', './config/app.yml', AppSchema)`                                                                           |
| `core.config.validate(name, schema)`         | Recheck the last loaded YAML with the current environment | Both parameters required. Use `reload()` to read edits on disk                                                                                                                                                    | `HaiResult<T>`. Success saves the checked values and the schema used for future reloads                    | `core.config.validate('app', AppSchema)`                                                                                           |
| `core.config.get<T>(name)`                   | Read the last saved value                                 | `name` required. `T` supplies a TypeScript type                                                                                                                                                                   | `T` or `undefined`                                                                                         | `core.config.get<{ port: number }>('app')`                                                                                         |
| `core.config.getOrThrow<T>(name)`            | Read a setting required to continue                       | `name` required                                                                                                                                                                                                   | `T`. Throws if the name has not been loaded                                                                | `core.config.getOrThrow<{ port: number }>('app')`                                                                                  |
| `core.config.has(name)`                      | Check whether a name has been loaded                      | `name` required                                                                                                                                                                                                   | `boolean`                                                                                                  | `core.config.has('app')`                                                                                                           |
| `core.config.keys()`                         | List loaded names                                         | No arguments                                                                                                                                                                                                      | `string[]`                                                                                                 | `core.config.keys()`                                                                                                               |
| `core.config.reload(name)`                   | Read the file again and notify subscribers                | `name` required                                                                                                                                                                                                   | `HaiResult<unknown>`. Missing names return `CONFIG_NOT_LOADED`. Failed reloads preserve the previous value | `core.config.reload('app')`                                                                                                        |
| `core.config.watch<T>(name, callback)`       | Reload on file changes                                    | Both parameters required. `T` defaults to `unknown`. The callback receives the new value on success or `null` and an error on failure                                                                             | A function that removes this subscription. An unloaded name reports `CONFIG_NOT_LOADED` immediately        | `const stop = core.config.watch('app', (_value, error) => { if (error) core.logger.warn('Reload failed', { code: error.code }) })` |
| `core.config.isWatching(name)`               | Check whether a file watch is active                      | `name` required                                                                                                                                                                                                   | `boolean`                                                                                                  | `core.config.isWatching('app')`                                                                                                    |
| `core.config.unwatch(name?)`                 | Stop watches and keep the loaded values                   | Omit `name` to stop all watches                                                                                                                                                                                   | `void`                                                                                                     | `core.config.unwatch('app')`                                                                                                       |
| `core.config.clear(name?)`                   | Remove loaded values and stop their watches               | Omit `name` to clear all names                                                                                                                                                                                    | `void`. Leaves the files on disk intact                                                                    | `core.config.clear('app')`                                                                                                         |
| `core.config.resolve(options)`               | Apply environment overrides in memory                     | `name` and `value` required. `environment` defaults to `process.env`. A `schema` or `shape` can provide field types. `missing` defaults to `'error'`; `'empty'` inserts an empty string for a missing placeholder | `HaiResult<unknown>`. Validate the result with the application schema                                      | `core.config.resolve({ name: 'app', value: { port: 3000 }, environment: { HAI_APP_PORT: '4000' } })`                               |
| `core.config.toEnv(options)`                 | Flatten configuration into environment variables          | `prefix` and `value` required. Optional `schema` or `shape` describes fields                                                                                                                                      | `Record<string, string>`. Throws on invalid names                                                          | `core.config.toEnv({ prefix: 'HAI_APP', value: { port: 3000 } })`                                                                  |
| `core.config.mergeEnv(layers)`               | Merge sources by precedence                               | Pass objects in order from lowest to highest priority                                                                                                                                                             | `Record<string, string>`                                                                                   | `core.config.mergeEnv([{ HAI_APP_PORT: '3000' }, { HAI_APP_PORT: '4000' }])`                                                       |
| `core.config.parseEnv(text)`                 | Read literal variables from dotenv text                   | `text` required                                                                                                                                                                                                   | `Record<string, string>`. Throws for duplicate keys or malformed values marked as generated JSON           | `core.config.parseEnv('HAI_APP_PORT=3000\n')`                                                                                      |
| `core.config.stringifyEnv(values, options?)` | Write dotenv text                                         | `values` required. `target` defaults to `'node'`. Choose `'compose'` for a Compose env file                                                                                                                       | A string. Throws on invalid names                                                                          | `core.config.stringifyEnv({ HAI_APP_PORT: '3000' })`                                                                               |

Check `success` before using `data` from a `HaiResult`. Reloading changes the values held by Core. If a database or other service read its settings when it was initialized, arrange for that service to apply the new values.

## Configuration in Node and the browser

Node configuration can read and watch YAML and dotenv files. In a browser, embedded assets or server load data carry public settings. File operations return `SERVICE_UNAVAILABLE`, `getOrThrow()` throws, and watchers report the failure immediately.

Load dotenv values before initializing modules. The order is process environment, mode-local file, local file, mode file, then base file. Apply the returned map explicitly. YAML placeholders are expanded before hierarchical environment overrides, for example `HAI_APP_PORT` overrides `app.port`. A parent JSON value replaces that node. Child keys override it at the same priority. An empty string is a supplied value. Placeholder expressions supplied through environment values or JSON remain literal. Validate the resolved object separately when using `resolve()` directly. A reload updates Core's in-memory copy, so have consumers apply new settings explicitly. Unsubscribe after use, and keep the `# hai:json` marker on values emitted by the dotenv writer.

```ts
import { core } from '@h-ai/core'
import { z } from 'zod'

const AppSchema = z.object({ port: z.number().int().positive() })
const environment = core.config.loadEnvFiles({ mode: 'dev' })
if (!environment.success)
  throw new Error(environment.error.message)
Object.assign(process.env, environment.data)

const loaded = core.config.load('app', './config/app.yml', AppSchema)
if (!loaded.success)
  throw new Error(loaded.error.message)
core.logger.info('Listening', { port: loaded.data.port })
```

With `port: 3000` in `config/app.yml`, this logs port 3000 unless `HAI_APP_PORT` overrides it. The application exits before serving traffic if loading or validation fails.

<a id="logging-api"></a>

## Logging

`core.logger` starts at `info` with `pretty` output. Set `format: 'json'` for log collection. Node also emits JSON when the optional `pino-pretty` dependency is unavailable. The browser uses the developer console. Messages below the current level are dropped. Named loggers inherit global settings unless configured explicitly. A child binds extra fields. The current request context is included, and sensitive values are masked before output.

Use observers for bounded diagnostics. An observer receives entries after level filtering and redaction. Its exceptions and immediate recursive invocations are isolated. Calling the returned function unsubscribes the observer.

| API | Purpose | Inputs and defaults | Result | Example |
| --- | --- | --- | --- | --- |
| `core.logger.trace()`, `debug()`, `info()`, `warn()`, `error()`, `fatal()` | Emit a log at the chosen level | Message, optional fields. Default threshold is `info`. | `void` | `core.logger.warn('Retry scheduled', { attempt: 2 })` |
| `core.logger.create(options?)` | Create a named logger | Optional name, level, format and context. Unset values inherit global settings. | `Logger` | `const orders = core.logger.create({ name: 'orders' })` |
| `core.logger.child(fields)` | Bind fields to a child logger | Fields to include | `Logger` | `core.logger.child({ requestId: 'req-1' })` |
| `core.logger.configure(options)` | Change global formatting and redaction | Logging options | `void` | `core.logger.configure({ format: 'json', redact: ['customer.email'] })` |
| `core.logger.setLevel(level)`, `getLevel()` | Change or read the threshold | A level for the setter. No arguments for the getter. | `void` / `LogLevel` | `core.logger.setLevel('warn')`, `core.logger.getLevel()` |
| `core.logger.observe(callback)` | Subscribe to redacted entries | Callback receiving a log record | `() => void` | `const stop = core.logger.observe(record => { recentMessages.push(record.message) })` |

<a id="context-api"></a>

## Request context

Use `core.context.run()` with correlation fields such as `requestId`, `userId`, `scopeId`, and `jobId`. In Node, each request retains its own context across `await`. In a browser the context only lasts through synchronous work. Loggers automatically include the current fields. Obtain user and tenant identifiers from trusted server code. If a collector logs its own diagnostics, run that work with `suppressLogObservers: true` to avoid notifying the observers again.

| API | Purpose | Inputs and defaults | Result | Example |
| --- | --- | --- | --- | --- |
| `core.context.run(context, operation)` | Run within a request or task context | Fields and callback. Observers are enabled by default. | Callback result, including a promise | `await core.context.run({ requestId: 'req-1' }, async () => core.context.get().requestId)` |
| `core.context.get()` | Read the current context | No arguments | Readonly `RequestContext` (empty object without context) | `const { requestId } = core.context.get()` |

<a id="sanitize-api"></a>

## Redaction

Use these helpers before retaining diagnostics or exposing messages. The standard matcher masks credential fields. To add a separate business field using a custom matcher, apply the standard redaction first. Structured redaction works on a copy. Class getters and custom `toJSON()` are never executed. Dates become ISO strings, and URLs are masked. Supply known secret values explicitly when you need to redact unlabelled text. A general object copy may still contain cycles.

| API | Purpose | Inputs and defaults | Result | Example |
| --- | --- | --- | --- | --- |
| `core.sanitize.isSensitiveKey(key, matcher?)` | Match a field name | Key and optional matcher | `boolean` | `core.sanitize.isSensitiveKey('apiKey')` |
| `core.sanitize.sanitizeSensitiveValue(value, key, options?)` | Redact one value | Value, key (or `null`), optional replacement (default `[REDACTED]`) | Value | `core.sanitize.sanitizeSensitiveValue('example-only', 'password')` |
| `core.sanitize.sanitizeSensitiveFields(value, options?)` | Copy and redact structured data | Value, optional matcher and replacement | Redacted copy | `core.sanitize.sanitizeSensitiveFields({ password: 'example-only' })` |
| `core.sanitize.sanitizeUrl(url, options?)` | Mask URL credentials | URL, optional redaction options | `string` / `(invalid url)` | `core.sanitize.sanitizeUrl('https://example.com/?token=example-only')` |
| `core.sanitize.sanitizeText(text, secretValues?)` | Mask credential text | Text and known values (default `[]`) | `string` | `core.sanitize.sanitizeText('Bearer example-only')` |
| `core.sanitize.defaultSensitiveKeyRegex`, `defaultSensitiveReplacement` | Read the built-in matcher and replacement | Read-only constants | `RegExp` / `string` | `const replacement = core.sanitize.defaultSensitiveReplacement` |

<a id="error-api"></a>

## Results and errors

A business caller checks `result.success` before reading `data` or `error`. Define codes once and translate messages when the failure occurs. Before sending an error over HTTP, strip internal causes with `core.error.toPublic()`. Return the visible error to the caller and correlate server logs using the trace ID. Import `ok` and `err` directly from `@h-ai/core`.

| API | Purpose | Inputs and defaults | Result | Example |
| --- | --- | --- | --- | --- |
| `core.error.buildHaiErrorsDef(module, codes)` | Define stable module error codes | Module name and a name-to-code/status mapping | Error definitions | `const errors = core.error.buildHaiErrorsDef('orders', { NOT_FOUND: '300:404' })` |
| `core.error.buildHaiErrorInst(def, message, cause?, suggestion?)` | Attach a message to a failure | Definition, message, optional cause and suggestion | `HaiError` | `const error = core.error.buildHaiErrorInst(errors.NOT_FOUND, 'Order not found')` |
| `core.error.toPublic(error, traceId?)` | Prepare an error for a client | Error and optional trace ID | Public error | `core.error.toPublic(error, 'req-1')` |
| `core.error.formatMessage(error)` | Format the visible message | Error message and optional trace ID | `string` | `core.error.formatMessage(error)` |
| `ok(data)`, `err(def, message, cause?)` | Construct a business result | Success data, or error definition and message (or a complete error) | `HaiResult` | `ok({ id: 'order-1' })`, `err(errors.NOT_FOUND, 'Order not found')` |

<a id="i18n-api"></a>

## Messages and locales

A message lookup uses its explicit locale first, then the Node request locale, then the global locale. Unsupported locales or missing dictionaries fall back to `zh-CN`. Language aliases `zh`, `en`, and `ja` resolve to the region-specific locales. Missing message keys return the key. Missing placeholder values leave the placeholder in the text. Use a separate dictionary for your application's messages.

| API | Purpose | Inputs and defaults | Result | Example |
| --- | --- | --- | --- | --- |
| `core.i18n.setGlobalLocale(locale)`, `getGlobalLocale()` | Set or read the global locale | Set with a locale. Initial locale is `zh-CN`. | `void` / locale | `core.i18n.setGlobalLocale('ja-JP')`, `core.i18n.getGlobalLocale()` |
| `core.i18n.runWithLocale(locale, operation)` | Scope a Node request locale | Locale and callback | Callback result | `await core.i18n.runWithLocale('en-US', async () => core.i18n.coreM('core_errorNotFound'))` |
| `core.i18n.createMessageGetter(dictionaries)` | Create a message lookup | Dictionaries keyed by locale | `(key, options?) => string` | `const message = core.i18n.createMessageGetter({ 'zh-CN': { welcome: 'Welcome' } })` |
| `core.i18n.coreM(key, options?)` | Read a built-in message | Key, optional locale and interpolation parameters | `string` | `core.i18n.coreM('core_errorNotFound', { locale: 'en-US' })` |
| `core.i18n.DEFAULT_LOCALE`, `DEFAULT_LOCALES` | Read supported locales | Read-only constants | Locale and choices | `const choices = core.i18n.DEFAULT_LOCALES` |

<a id="validation-api"></a>

## Validation messages

The mapper turns Zod v3/v4 issues into field-level messages. Array indexes appear in paths such as `items.0.email`, and `_` represents the whole form. Custom messages stay intact. The getter maps library message keys to your own dictionary.

| API | Purpose | Inputs and defaults | Result | Example |
| --- | --- | --- | --- | --- |
| `core.zodValidation.createPrefixedZodMessageGetter(prefix, message)` | Adapt a module message prefix | Prefix and message getter | Message getter | `const translate = core.zodValidation.createPrefixedZodMessageGetter('core', message)` |
| `core.zodValidation.mapZodErrorToFormErrors(error, message)` | Map Zod issues to form fields | Failure value and adapted message getter | `{ field, message }[]` | `core.zodValidation.mapZodErrorToFormErrors(parsed.error, translate)` |

<a id="module-api"></a>

## Module startup and shutdown

`core.module.createRuntime()` returns a controller. Call `start()` when you are ready to initialize the dependencies in order, and call `close()` on shutdown to release them in reverse order. A failed start triggers cleanup. If cleanup fails, a later close or start retries it before releasing dependencies still in use. Concurrent starts share the pending operation. Check the `HaiResult` from both calls. Set `enabled` on a step to decide when it participates.

| API | Purpose | Inputs and defaults | Result | Example |
| --- | --- | --- | --- | --- |
| `core.module.createRuntime(steps)` | Manage dependency startup and shutdown | Named steps with start and close functions, optional enabled predicate | `ModuleRuntime`, each call returns `Promise<HaiResult<void>>` | `const runtime = core.module.createRuntime([{ name: 'cache', start: () => cache.init({ type: 'memory' }), close: () => cache.close() }])` |
| `core.module.createNotInitializedKit(error, message?)` | Build errors and proxy methods for uninitialized modules | Error definition and optional message getter. Proxies default to async. | `error()`, `result()`, `proxy()` | `core.module.createNotInitializedKit(HaiCommonError.NOT_INITIALIZED, () => 'Initialize the module first')` |
| `core.module.requiresSharedState(environment)` | Check whether a shared backend is required | Environment values. Explicit production E2E runs can opt out. | `boolean` | `core.module.requiresSharedState(process.env)` |

<a id="access-api"></a>

## Request access checks in Node

Use the address supplied by the HTTP server and list only trusted proxies. An application can compile address and schedule rules once at startup and call the checker per request. The checker exposes the decision, the matched rule when applicable, and request encryption policy. The default proxy mode is `auto`; read the managed deployment rules before relying on forwarded headers. Invalid policies throw during startup. Restart after changing an independently loaded policy file.

| API | Purpose | Inputs and defaults | Result | Example |
| --- | --- | --- | --- | --- |
| `core.access.normalizeClientIp(value?)` | Normalize an IPv4 or IPv6 address | Optional address string | `string` / `undefined` | `core.access.normalizeClientIp('::ffff:198.51.100.23')` |
| `core.access.createClientIpResolver(trustedProxies?)` | Build a trusted client address resolver | Trusted proxy configuration (default `auto`) | `(request, remoteAddress?) => string` or `undefined` | `const resolve = core.access.createClientIpResolver(['192.0.2.10'])` |
| `core.access.createConditionCheck(condition)` | Prepare address and schedule conditions | Condition object with address lists and time windows | `(ip?) => AccessDecision` | `core.access.createConditionCheck({ allowIps: [], denyIps: [], timezone: 'UTC', windows: [] })` |
| `core.access.createRequestCheck(input?)` | Compile a request policy | Rules, file reference, or `false`. Omission disables the policy. | `RequestAccessCheck` | `core.access.createRequestCheck({ file: './config/security/request-access.yml' })` |
| `core.access.loadPolicy(input?, baseDirectory?)` | Read and validate policy content | Policy input and base directory (default working directory) | `RequestAccessPolicy` / `false` | `core.access.loadPolicy({ file: './config/security/request-access.yml' })` |

[Request policy settings](../configuration/core.en.md#request-access)

<a id="id-api"></a>

## Identifiers

IDs identify records and correlate operations. Use a credential generator for secrets. UUID generation throws when secure randomness is unavailable.

| API | Inputs, defaults and result | Example |
| --- | --- | --- |
| `core.id.generate(size?)`, `short()` | Random ID, default 21 characters. Short IDs have 10. | `generate(8)` |
| `core.id.withPrefix(prefix, size?)`, `trace()`, `request()` | Prefix plus random ID. Trace and request defaults are `trace-` and `req-`. | `withPrefix('order_')` |
| `core.id.uuid()`, `isValidUUID(value)`, `isValidNanoId(value, size?)` | Create a UUID v4 or return whether the supplied string matches the expected format. | `isValidUUID(core.id.uuid())` |

<a id="type-api"></a>

## Type guards

These predicates narrow TypeScript types. Validate business data with a schema.

| API | Inputs, defaults and result | Example |
| --- | --- | --- |
| `core.typeUtils.isDefined(value)`, `isObject(value)` | The first excludes null and undefined. The second excludes arrays and null but accepts instances. | `isDefined(null)` → `false` |
| `core.typeUtils.isFunction(value)`, `isPromise(value)` | Return whether the value is a function or a promise. | `isPromise(Promise.resolve())` → `true` |
| `core.typeUtils.isString(value)`, `isNumber(value)`, `isBoolean(value)`, `isArray(value)` | Check a primitive or array. A number check excludes `NaN`. | `isNumber(NaN)` → `false` |

<a id="object-api"></a>

## Objects

`deepClone` delegates to `structuredClone`. It can copy dates, maps, sets and cycles. Functions or other uncloneable inputs throw. `deepMerge` recurses into plain objects only. Later arrays, dates, collections and instances replace earlier values.

| API | Inputs, defaults and result | Example |
| --- | --- | --- |
| `core.object.deepClone(value)`, `deepMerge(target, ...sources)` | Return a copy or a merged object without modifying the inputs. | `deepMerge({ a: 1 }, { a: 2 })` → `{ a: 2 }` |
| `core.object.pick(value, keys)`, `omit(value, keys)` | Return an object with only the listed keys, or with those keys removed. | `pick({ a: 1, b: 2 }, ['a'])` → `{ a: 1 }` |
| `core.object.keys(value)`, `values(value)`, `entries(value)`, `fromEntries(entries)` | Return typed key, value, or pair arrays, or build an object from pairs. | `fromEntries([['mode', 'local']])` → `{ mode: 'local' }` |

<a id="string-api"></a>

## Strings

Node uses native timing-safe comparison for equal-length UTF-16 byte sequences. The browser cannot guarantee constant-time execution. Keep credential checks on the server.

| API | Inputs, defaults and result | Example |
| --- | --- | --- |
| `core.string.capitalize()`, `kebabCase()`, `camelCase()`, `snakeCase()`, `pascalCase()` | Convert one string to the chosen case. | `kebabCase('helloWorld')` → `'hello-world'` |
| `core.string.truncate(value, length, suffix?)`, `trim(value)` | Shorten with a suffix (default `'...'`) or trim whitespace. | `truncate('abcdef', 3)` → `'abc...'` |
| `core.string.isBlank(value)`, `isNotBlank(value)` | Return whether the string is blank or nonblank. | `isBlank(' ')` → `true` |
| `core.string.padStart(value, length, char?)`, `padEnd(value, length, char?)` | Pad to the requested length. The character defaults to a space. | `padStart('5', 3, '0')` → `'005'` |
| `core.string.constantTimeEqual(left, right)` | Compare two strings. Different lengths return false immediately. | `constantTimeEqual('a', 'a')` → `true` |

<a id="array-api"></a>

## Arrays

These helpers preserve the input array. Chunk sizes must be positive safe integers. Invalid sizes return an empty array. Group keys such as `constructor` are supported.

| API | Inputs, defaults and result | Example |
| --- | --- | --- |
| `core.array.unique(items)`, `chunk(items, size)`, `groupBy(items, key)` | Deduplicate, split into arrays, or group using a key selector. | `chunk([1, 2, 3], 2)` → `[[1, 2], [3]]` |
| `core.array.first(items)`, `last(items)` | Read an edge element. Empty arrays return `undefined`. | `last([1, 2])` → `2` |
| `core.array.flatten(items)`, `compact(items)`, `shuffle(items)` | Flatten one level, remove null and undefined, or return a shuffled copy. | `compact([0, null, 1])` → `[0, 1]` |
| `core.array.intersection(a, b)`, `difference(a, b)` | Return shared elements or elements in the first array only. | `intersection([1, 2], [2, 3])` → `[2]` |

<a id="async-api"></a>

## Asynchronous operations

A timeout rejects the waiting promise. The caller owns cancellation of the underlying work. Retry handles thrown errors and rejected promises. Inspect a failed `HaiResult` separately. Parallel work returns results in input order. The default concurrency is five. A rejected task does not stop every worker immediately.

| API | Inputs, defaults and result | Example |
| --- | --- | --- |
| `core.async.delay(ms)`, `withTimeout(promise, ms)` | Wait for a time or bound how long a promise is awaited. | `await core.async.delay(10)` |
| `core.async.retry(operation, options?)` | Run up to three attempts by default, including the initial call, with a 1000 ms delay. | `await core.async.retry(async () => 'ready', { maxRetries: 2, delay: 10 })` |
| `core.async.parallel(items, action, concurrency?)`, `serial(items, action)` | Map items with bounded concurrency or one by one. Invalid concurrency rejects with `RangeError`. | `await core.async.parallel([1, 2], async n => n * 2, 2)` → `[2, 4]` |
| `core.async.debounce(callback, ms)`, `throttle(callback, ms)` | Return callbacks that preserve their parameter types. Debounce runs after the quiet period. Throttle accepts one call per interval. | `core.async.debounce((term: string) => search(term), 100)` |

<a id="time-api"></a>

## Dates and times

Calendar operations use the runtime time zone. Daylight-saving changes can affect elapsed time. Pass ISO timestamps with offsets between systems.

| API | Inputs, defaults and result | Example |
| --- | --- | --- |
| `core.time.formatDate(date, format?)`, `timeAgo(date)` | Format locally (default `YYYY-MM-DD`) or return localized relative text. | `formatDate(new Date(2026, 0, 1))` → `'2026-01-01'` |
| `core.time.now()`, `nowSeconds()` | Unix time in milliseconds or floored seconds. | `core.time.nowSeconds()` |
| `core.time.parseDate(value)`, `isValidDate(date)` | Construct a Date and check whether it represents a valid time. | `isValidDate(core.time.parseDate('2026-01-01T00:00:00Z'))` |
| `core.time.addDays(date, days)`, `addHours(date, hours)`, `startOfDay(date)`, `endOfDay(date)` | Return a date after local calendar arithmetic or the local day boundary. | `startOfDay(new Date(2026, 0, 1, 12))` |

## Error handling

Check `success` first when a business operation returns `HaiResult`. Handle thrown exceptions and rejected promises according to the individual function contract. Log the code and trace ID while keeping internal diagnostics out of client responses.
