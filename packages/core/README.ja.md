# @h-ai/core

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md)

## 概要

hai Agent Framework の中核モジュール。共通ツール、型定義、設定管理、ログ機能を提供します。

## 主な機能

- **HaiResult 型**：関数型のエラー処理（`ok` / `err`）とモジュール共通の戻り値形式。
- **統一ログ**：Node.js は pino、ブラウザーは loglevel を使い、API は共通。
- **国際化（i18n）**：一元化された locale 管理と型安全なメッセージ取得。
- **Zod 検証エラーの変換**：Zod v3/v4 の issue 抽出と、既定の英語メッセージのローカライズ。
- **設定管理**：YAML 読み込み、規約に沿う環境変数マッピング、明示的な変数展開、Zod 検証、ファイル監視（Node.js 専用）。
- **ID 生成**：nanoid と UUID v4。
- **エラー定義**：標準化されたコードと、モジュール共通のエラー定義・インスタンス生成。
- **モジュールツール**：NotInitializedKit のプロキシと共通のライフサイクル基盤。
- **ツール関数**：型確認、オブジェクト・文字列・配列・非同期・時刻の操作。

## 使い始める

### クイックスタート

#### Node.js 環境

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

#### ブラウザー環境

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

ブラウザー版は型定義に合わせて `core.config` の API 形状を保持しますが、ファイル設定には対応しません：

- `core.config.get()` は `undefined`、`has()` は `false`、`keys()` は `[]` を返します。
- `loadEnvFiles()` / `load()` / `validate()` / `reload()` は `HaiCommonError.SERVICE_UNAVAILABLE` を返します。
- `watch()` は同じエラーで直ちにコールバックを呼び、安全な no-op の監視解除関数を返します。
- 設定が必要な場合はサーバーで読み込み API で渡すか、ブラウザーでは `core.init({ logging })` でログのみ設定してください。

### API の詳細

#### ログ（Logger）

`core.logger` は既定の Logger インスタンスであり、ログ管理の共通入口でもあります。

##### ログの記録

6 つのレベル：`trace` / `debug` / `info` / `warn` / `error` / `fatal`。

```typescript
core.logger.info('User created', { userId: '123' })
core.logger.error('Failed to connect', { error })
core.logger.debug('Processing item', { id, step: 'validation' })
```

##### モジュール用 logger の作成

```typescript
// 独立名称空间，适合模块内全局使用
const logger = core.logger.create({ name: 'payment' })
logger.info('Payment processed')
```

##### 子 logger（child）

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

> **典型的な使い方**：リクエスト入口で `reqLogger` を作成してサービス層に渡し、サービス層で `child` に操作コンテキストを追加します。ログに処理全体のコンテキストが自動的に含まれます。

##### ログの管理

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

`core.init()` で `_core.yml.logging` を読み込んだ後、または `configure` / `setLevel` の後は、既定・モジュール・ネストした child Logger の次の出力に現在の共通設定を適用します。初期化前に作成したインスタンスも対象です。`create({ level, format, context })` の明示指定は優先され、省略項目は共通設定を動的に継承します。呼び出し時の context は固定 context を上書きし、追加 `redact` 規則も全インスタンスに適用するため、モジュール Logger の再作成は不要です。

ブラウザーでは引き続き DevTools console に出力します。`pretty` は読みやすいメッセージと context、`json` は `level` / `msg` を含む JSON 文字列です。既定の認証情報マスキングと設定したパスのマスキングを併用し、ネストしたドット・括弧パスと `*` に対応します。メッセージ本文の機密情報は呼び出し側で除去してください。

`core.logger` は既定でログの機密情報をマスクします。`password`、`token`、`secret`、`privateKey`、`apiV3Key` などは `[REDACTED]` に置換されます。`url` / `baseUrl` / `endpoint` は URL 内のユーザー名・パスワード、機密クエリ値、OAuth 形式の fragment をマスクします。不正な URL は固定値を返します。メールアドレス・電話番号は既定では隠しません。

##### ログレベルの規約

| レベル  | 用途                                     |
| ------- | ---------------------------------------- |
| `trace` | ループ内の詳細なデバッグデータ           |
| `debug` | 関数開始、引数の概要、読み取り操作       |
| `info`  | 業務イベント（初期化完了、書き込み成功） |
| `warn`  | 回復可能な問題（検証失敗、再試行）       |
| `error` | 調査が必要な操作の失敗                   |
| `fatal` | サービス継続不能の致命的エラー           |

#### 国際化（i18n）

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

#### 機密情報のマスク

`core.sanitize.sanitizeSensitiveFields()` はオブジェクト・配列内の機密情報を再帰的にマスクします。既定では password、token、secret、privateKey、apiV3Key などを処理し、`url` / `baseUrl` / `endpoint` の認証情報もマスクします。`core.sanitize.sanitizeUrl(url, options)` は単独の URL にも使用でき、不正な URL は `(invalid url)` を返します。独自の matcher はクエリ名にも適用されます。

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

#### Zod 検証エラーの i18n 変換

`core.zodValidation` は Zod の `SafeParseError` / `ZodError` をフラットなフォームエラーに変換し、
Zod の既定の英語メッセージを呼び出し元の i18n 文言に変換します。

- 公開入口は 2 つです：
  - `createPrefixedZodMessageGetter()`：モジュールの接頭辞から `serv_validation*` / `kit_validation*` などの key を生成し、手書きの `KEY_MAP` を省略。
  - `mapZodErrorToFormErrors()`：抽出・ローカライズ・フラット化を一度に実行。
- 独自の業務メッセージは保持し、Zod の既定の英語メッセージのみを置換します。

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

#### 設定管理（Node.js 専用）

> ブラウザーにはファイルシステムがないため、`core.config` は代替 API の形状のみを提供します。ファイル関連メソッドは `SERVICE_UNAVAILABLE` を返し、YAML を読み込みません。

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

##### dotenv ファイルと環境切り替え

Node 専用の `core.config.loadEnvFiles({ mode, envDir })` は HaiResult を返し、`.env` → `.env.<mode>` → `.env.local` の順で読み込みます。既存のプロセス変数が最優先です。development/production は dev/prod に対応し、存在しないファイルは省略します。プロセスは変更しないため、success を確認してから代入します。公開設定と `.env.example` は Git 登録し、私有の `.env.local` は除外します。core.init は dotenv を読み込まず、ブラウザーでは SERVICE_UNAVAILABLE を返します。

```ts
const env = core.config.loadEnvFiles({ mode: 'dev', envDir: '.' })
if (!env.success)
  throw new Error(env.error.message)
Object.assign(process.env, env.data)
core.init({ configDir: './config' })
```

##### 環境変数のマッピングと展開

`core.config.load(name, ...)` は YAML の各末端設定を
`HAI_<CONFIG_NAME>_<YAML_PATH>` の環境変数に自動対応付けします。設定名・各 key は大文字化し、階層は `_` で区切り、
camelCase の単語は分割しません。例：`ai.llm.apiKey` は `HAI_AI_LLM_APIKEY`、
`ai.llm.maxTokens` は `HAI_AI_LLM_MAXTOKENS`。配列の添字も 1 階層として扱い、
`ai.llm.models[0].temperature` は `HAI_AI_LLM_MODELS_0_TEMPERATURE` です。

環境変数が存在すれば YAML を上書きし、YAML のスカラー規則で number / boolean などに変換します。
変数がなければ YAML 値を保持します。オブジェクト・配列全体も同名の JSON 変数で置換でき、HAI_DB は接続設定全体、HAI_REACH_PROVIDERS は配信チャネル配列を置換します。親ノード全体の上書きが子フィールド変数より優先され、置換後も Schema 検証を行います。

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

特殊な変数名が必要な場合は明示的な `${VAR}` を使用します。優先順位は固定です：
規約に沿う環境変数 > 明示的な環境変数 > YAML の既定値。

- `${VAR}`：`process.env.VAR` を読み、存在しなければ `CONFIG_ENV_VAR_MISSING`。
- `${VAR:default}`：`process.env.VAR` を読み、存在しなければコロン以降の既定値を使用。

**型の復元：** 値全体が単一の変数式（`${PORT:3000}` など）の場合、YAML 規則で number / boolean などの型に戻します。文字列との混在は常に文字列です。

`${VAR:}` や空文字列の `${VAR}` は `''` を保持し、YAML の `null` には変換しません。空文字列を未設定として扱うモジュールは、自身の Schema で `undefined` に正規化してください。

```yaml
# config/app.yml
debug: ${DEBUG:false} # → boolean false
port: ${PORT:3000} # → number 3000
database: ${DB_CONNECTION} # → 环境变量缺失时报错
url: http://${HOST}:${PORT} # → string（混合文本）
```

#### ID 生成

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

#### ツール関数

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

#### モジュール共通ツール（module）

モジュール共通の初期化エラー処理：

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

### エラー処理

#### HaiResult 型

失敗する可能性がある操作は `HaiResult<T>` を返します：

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

#### 独自のエラーコード（モジュール単位）

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

#### 設定エラーコード

```typescript
import { HaiConfigError } from '@h-ai/core'

HaiConfigError.CONFIG_FILE_NOT_FOUND // hai:core:010 - 配置文件不存在
HaiConfigError.CONFIG_PARSE_ERROR // hai:core:011 - YAML 解析失败
HaiConfigError.CONFIG_VALIDATION_ERROR // hai:core:012 - Schema 校验失败
HaiConfigError.CONFIG_ENV_VAR_MISSING // hai:core:013 - 环境变量缺失
HaiConfigError.CONFIG_NOT_LOADED // hai:core:014 - 配置未加载
```

### リクエスト言語の分離

Node リクエストと SSR は `core.i18n.runWithLocale(locale, () => handleRequest())` で囲みます。SvelteKit は `kit.i18n.runWithLocale(locale, () => resolve(event))` を使えます。serv はリクエストヘッダーから自動設定します。非同期の子処理も言語を継承し、明示的な `MessageOptions.locale`、リクエスト言語、起動時の既定値の順で優先します。コンテキスト内の `setGlobalLocale` はそのリクエストだけを変更します。コンテキスト外の設定は起動時に限定し、リクエスト hook から呼びません。

ブラウザーはアプリ全体の `setGlobalLocale` / `createLocaleStore` を使います。SSR の UI store 初期化と setter は自身の状態のみ変更し、メッセージはリクエストコンテキストを参照します。`runWithLocale` は Node 入口専用です。

## 開発とテスト

```bash
pnpm --filter @h-ai/core test
```

## 設定の消費範囲

`_core.yml` は name/version/env/defaultLocale のメタデータと logging のみを受け付け、不明なフィールドでは読み込みに失敗します。グローバルな debug、ID 長/接頭辞、業務 features、言語登録リストは提供しません。logging.level、core.id の呼び出し引数、独自 Schema で検証する app.yml を使用してください。defaultLocale はメタデータであり、翻訳登録や Paraglide の切り替えを自動実行しません。Logger の import は Windows TTY でも LANG、LC_ALL、PYTHONIOENCODING を変更しません。[設定と消費点の対応表（中国語）](../../docs/configuration-map.md)を参照してください。

宣言の注釈と型検査できる例は [JSDoc 規約（中国語）](../../docs/module-jsdoc.md) を参照してください。Node core.init は同期的に void を返し、設定エラーでは例外を送出します。業務 HaiResult API は success を先に確認します。

Node 入口は元の UTF-16 コード単位を UTF-16LE に変換し、同じバイト長を node:crypto.timingSafeEqual で比較します。長さが違えば false となり、長さ自体は隠しません。ブラウザー実装には JavaScript エンジンの定時間保証がなく、サーバーの認証境界には使用しません。周辺の分岐・変換・リクエスト処理まで定時間になるわけではありません。

UUID は暗号学的乱数の randomUUID/getRandomValues のみを使用し、どちらも利用できない場合は例外を送出します。Math.random にはフォールバックしません。

## ライセンス

Apache-2.0
