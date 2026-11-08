# @h-ai/core

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md)

`@h-ai/core` は Hai Framework の共通基盤です。アプリケーションと他のモジュールに、設定、エラー、ログ、国際化の共通機能を提供します。ツールはそのまま利用でき、Node アプリでファイル設定が必要な場合に `core.init()` を呼びます。

## クイックスタート

以下では Core の全機能について用途、例、制約を説明します。設定を読み込む場合は初期化から確認してください。ログ、メッセージ、汎用ツールは直接利用できます。

実行機能は `core.xxx()` または `core.<子機能>.xxx()` で呼びます。結果構築関数 `ok` / `err`、型、Schema、エラー定数はパッケージの入口から個別に import します。使い方は該当節で説明します。

```bash
pnpm add @h-ai/core
```

独自設定やフォーム検証の例では Zod も使用するため、実行前に `pnpm add zod` でインストールしてください。データベース・キャッシュの追加依存は該当節で説明します。

### 初期化：`core.init`

Node 起動時に YAML を読み込み、ログを設定します。ブラウザーではログのみを設定します。Core の初期化ではデータベースなどの他モジュールは起動しません。

#### Node.js

`config/_core.yml` を用意します。

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

必須設定を取得できない場合、起動境界で停止します。`core.init()` は個々の読み込み失敗をログに記録して続行するため、完了してもすべての設定が有効とは限りません。ディレクトリー走査やログ設定では例外が伝播する場合があります。

#### ブラウザー

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

ホストは公開可能な設定項目だけを渡し、サーバー設定全体や秘密情報は送りません。ブラウザーの `core.config.get()` / `has()` / `keys()` は `undefined` / `false` / `[]` を返します。`loadEnvFiles()`、`load()`、`validate()`、`reload()` は `SERVICE_UNAVAILABLE` を返し、`getOrThrow()` は例外を送出します。`watch()` は同じ利用不可エラーを即座に通知し、何もしない解除関数を返します。

## 機能

| 機能                   | 用途                                                                                     | 主な入口                                                |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 設定と起動             | YAML の読み込み、環境変数の上書き、設定検証、依存順に沿ったモジュールの起動と終了        | `core.config`、`core.init`、`core.module.createRuntime` |
| 結果とエラー           | 業務処理の成否、エラーコード、API 境界で公開する安全なメッセージ                         | `HaiResult`、`ok` / `err`、`core.error`                 |
| ログと診断             | 構造化ログ、リクエスト関連付け、認証情報のマスキング、ログ監視                           | `core.logger`、`core.context`、`core.sanitize`          |
| 国際化と検証メッセージ | メッセージ言語、並行リクエストの言語分離、Zod フィールドエラーの翻訳                     | `core.i18n`、`core.zodValidation`                       |
| リクエストアクセス制御 | 信頼できるクライアント IP の解決と、パス・メソッド・IP・時間帯の検査                     | `core.access`（Node 専用）                              |
| 共通ツール             | ID、型確認、オブジェクト、文字列、配列、非同期処理、日時操作、未初期化時の共通エラー応答 | `core.id`、`core.typeUtils`、`core.object` など         |

### Node とブラウザーの境界

両環境とも `import { core } from '@h-ai/core'` を使い、ビルドツールが対象環境のコードを選びます。

| 機能                                                                  | Node.js                                                                    | ブラウザー                                                                               |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| ログ、結果/エラー、メッセージ、共通ツール、モジュールの順次起動と終了 | 対応                                                                       | 対応                                                                                     |
| YAML、dotenv、環境変数マッピング、ファイル監視                        | ローカル設定ファイルを読み込み、監視できる                                 | ローカルファイルを読み込み・監視できず、読み込みメソッドは失敗を返す                     |
| `core.context.run` による関連付け                                     | 非同期処理の待機後も各リクエストの ID を保持し、他のリクエストと混在しない | コールバックの同期処理中だけ保持し、`await` 後には保持しない                             |
| `core.i18n.runWithLocale` によるリクエスト言語                        | 非同期処理の待機後も選んだ言語を保持し、他のリクエストに変更されない       | 例外となる。ページ言語は `setGlobalLocale()`、またはメッセージ取得時の locale で指定する |
| `core.access` によるアクセス制御                                      | リクエストのアドレス、パス、時間帯を検査できる                             | このツールは利用不可                                                                     |

`core.init()` は Core の設定とログを同期的に準備し、`void` を返します。Core に `close()` メソッドはありません。データベースやキャッシュなども使うアプリは `core.module.createRuntime()` でまとめて管理できます。返されたオブジェクトの `start()` で順に初期化し、`close()` で逆順に解放します。下の「アプリケーションの起動と終了」に例を示します。

### ファイルと環境設定：`core.config`

YAML の読み込み、環境変数による上書き、型の検証、設定キャッシュとファイル監視を管理します。以下のファイル・環境操作は Node 専用です。

#### 読み込み・検証・取得

`core.init({ configDir, configSchemas?, watchConfig? })` は指定ディレクトリー直下の `.yml` / `.yaml` を走査します。`_core.yml` は `core`、`_db.yml` は `db`、`app.yml` は `app` として登録されます。ビルド・デプロイ設定は CLI がルートの `hai.json` から読み、実行時 YAML には含まれません。

`_core.yml` は `CoreConfigSchema` で検証し、`name`、`version`、`env`、`defaultLocale`、`logging` だけを受け付けます。メタデータの既定値は順に `hai Admin`、`0.1.0`、`development`、`zh-CN` で、`logging` は省略可能です。メタデータは `NODE_ENV` の変更、メッセージ言語の切り替え、業務翻訳の登録を行いません。通常はここでログを設定します。明示的な `core.init({ logging })` は、その初期化における YAML ログ設定の適用を上書きします。

その他のファイルでは、ホストが渡す `configSchemas` を構造と型のヒントとして使います。完全な業務検証はモジュール初期化または明示的な `validate()` で行います。`load(name, file, schema)` は即座に検証します。

以下のファイル例では、この `config/app.yml` を使い、環境変数による追加の上書きがないものとします。

```yaml
# config/app.yml
port: 3000
```

load() はファイルを読み、任意で即時検証します。validate() はキャッシュを検証します。get() は未登録時に undefined、getOrThrow() は例外です。型引数は TypeScript の補助であり、実データを検証しません。has()/keys() で登録を確認できます。

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

#### 再読み込み・監視・解放

reload() で再読み込み、watch() で新しい値やエラーを受け取ります。通常保存、原子的な置換、削除後の再作成に対応し、失敗時は最後の成功値を保持します。unwatch() は監視停止、clear() はキャッシュも削除し、名前省略時は全件が対象です。

watchConfig の既定値は false です。設定を再読込しても稼働中の DB モジュールは再初期化しません。以下の解放処理は設定が不要になった時に呼びます。

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

#### 環境変数で YAML の値を変える

設定名と項目の場所から、上書き用の環境変数名が自動で決まります。app.yml の port は HAI_APP_PORT、http.maxRetries は HAI_APP_HTTP_MAXRETRIES です。階層を大文字と_ で連結し、camelCase は分割しません。上書きのために YAML に ${...} を書く必要はありません。

固定値の `port: 3000` は、HAI_APP_PORT がなければ 3000、HAI_APP_PORT=5000 を設定すれば 5000 になります。

YAML に `${変数名}` を書くと、読み込み時に環境変数の値で置き換えられます。コロンの後は変数が未設定の場合の既定値です。

| YAML                         | 環境入力                     | 結果                                                |
| ---------------------------- | ---------------------------- | --------------------------------------------------- |
| `port: ${PORT}`              | PORT=4000                    | 4000 を使用。PORT がなければ CONFIG_ENV_VAR_MISSING |
| `port: ${PORT:3000}`         | PORT なし                    | 式内の既定値 3000                                   |
| `port: ${PORT:3000}`         | PORT=4000、HAI_APP_PORT=5000 | 規約変数を優先して 5000                             |
| `label: server-${PORT:3000}` | PORT=4000                    | 文字列 server-4000                                  |

最初に HAI_APP_PORT を確認し、値があれば項目全体を置換して ${PORT...} は評価しません。なければ YAML を読み、式の場合だけ PORT を参照し、固定値ならそのまま使います。HAI_APP_PORT で上書き済みなら PORT は不要です。

同じ設定元では、親 JSON を先に使い、細かな項目で上書きできます。HAI_APP='{"port":3000,"label":"local"}' と HAI_APP_PORT=4000 は行順に関係なく port=4000、label=local です。高優先度のオブジェクト全体の置換は低優先度の子項目上書きを残しません。配列 JSON はリスト全体を置換し、添字変数は既存要素だけを変更し、範囲外はエラーです。

#### .env ファイルを読み込む

core.init() は .env を読みません。loadEnvFiles() の success を確認し、結果を process.env に反映してから YAML を読みます。development/production は dev/prod に対応し、存在しないファイルは無視、同一ファイルの重複キーはエラーです。優先順位は **プロセス環境 > `.env.<mode>.local` > `.env.local` > `.env.<mode>` > `.env` > YAML** です。秘密を含む .local は Git に登録しません。

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

#### 置換後の値の型

環境変数はテキストです。`load()` / `resolve()` に Zod Schema を渡すと、項目の型に従って置換結果を変換します。`z.number()` は数値、`z.boolean()` は真偽値となり、`z.string()` は文字列を保持します。

値全体が ${PORT:3000} なら数値 3000、${ENABLED:false} なら真偽値 false にできます。server-${PORT:3000} のような混合テキストは文字列です。文字列項目 code の 00123 は先頭の 0 を保った '00123' になります。以下はファイルを読まず、同等の YAML 値と環境データを直接渡す例です。

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

空文字列は「設定済みだが文字がない」値で、未設定、null、false、0 ではありません。APP_CODE='' は 00123 に戻らず '' のままです。許可するかは Schema が決め、数値項目の空文字列は通常検証に失敗します。

変数の置換は YAML 内の式に適用されます。環境値や親 JSON 内の `server-${PORT}` は原文のまま保持されます。HAI_APP_LABEL='server-${PORT}' の最終値は server-${PORT} です。置換したい式は YAML に書きます。

Schema がなければ既存 YAML/JSON 構造からパスを判断し、単独の式は YAML の規則で数値・真偽値を解釈します。YAML にない合法な省略項目は configSchemas で示せます。最終的な業務検証は validate() またはモジュール初期化で行います。

#### 設定ファイル生成用のツール

resolve() はビルド・デプロイ時のメモリ上の設定計算にも使えます。toEnv() はオブジェクトを環境変数へ、mergeEnv() は複数ソースの統合、stringifyEnv()/parseEnv() は .env の符号化・解析を行います。秘密のマスキングは行いません。

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

通常オブジェクトは展開し、配列・動的辞書・空オブジェクトは JSON を保持します。全体置換の生成規則、優先順位、組み込みは[基本設定ガイド](../../docs/usage/configuration/runtime.md)を参照してください。

### ログ：`core.logger`

core.logger は構造化ログを記録します。詳細から重大の順に trace、debug、info、warn、error、fatal です。fatal はログを記録し、終了するかはアプリが決めます。

`core.logger` は `trace` / `debug` / `info` / `warn` / `error` / `fatal` に対応します。Node は pino、ブラウザーは loglevel を使います。未設定時は `info` / `pretty` で、`LoggingConfigSchema` で解析した `logging` オブジェクトの形式既定値は `json` です。Node で任意依存の `pino-pretty` がなければ JSON 出力になります。

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

create() は名前付き Logger、child() は固定項目付き Logger を作ります。configure() は出力と追加マスキング、setLevel()/getLevel() はグローバルレベルの変更・取得です。

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

既存の既定・モジュール・入れ子 child Logger も、その後の出力で最新のグローバル設定を使います。`setLevel()` も即座に反映します。`create()` の明示的な level/format/context が優先し、省略項目は動的に継承します。呼び出し時の context が固定値を上書きし、最後に `core.context` のリクエスト関連項目を追加します。ブラウザーの JSON は `level` / `msg`、pretty は読みやすい文面と context を出力します。

observe() はレベル判定・マスキング済みレコードを診断収集に通知し、解除関数を返します。コールバックでは上限付きメモリ収集のみ行い、保存は別途非同期に行います。観測は保存完了を意味せず、例外と同期再入は分離します。

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

### リクエストの関連付け：`core.context`

run() は requestId、userId、scopeId、jobId などをリクエストやタスクに持たせ、get() は現在値を読みます。Node では DB などの非同期処理後も他のリクエストに上書きされず読み取れます。既存 Logger にも自動で付加します。

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

ブラウザーでは同期コールバック中だけ保持し、await 後は保持しません。関連 ID は認可情報ではなく、主体とテナント範囲は信頼できるサーバーコードが渡します。

### 診断データのマスキング：`core.sanitize`

ログ、診断パッケージ、公開エラーの前に認証情報を隠します。項目名の判定、単一値・オブジェクト全体・URL の処理、ラベル付きまたは既知の秘密のテキスト除去に使えます。

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

defaultSensitiveKeyRegex/defaultSensitiveReplacement は既定の照合と [REDACTED] を提供します。独自 matcher は既定の規則を置換するため、業務上の個人情報を追加処理する前に既定の認証情報マスキングを残します。

ログは password/passwordHash、token、secretKey、privateKey などの認証項目と、URL のユーザー名・パスワード・機密クエリー・OAuth のキー値 fragment を隠します。不正 URL は `(invalid url)` になります。`redact` は業務上の個人情報パスを追加し、ドット・括弧・単一階層 `*` に対応し、大文字小文字を区別します。メールアドレスと電話番号は既定では保持します。

ネイティブ `Error` は name/message/stack/cause、集約エラー、列挙可能な context を含むコピーにしてから隠し、元の例外は変更しません。例外内の循環と 32 階層の上限は `[Circular]` / `[MaxDepth]` に置換します。通常オブジェクトの循環は保持され、JSON 化できるとは限りません。文面内では明示的な認証情報ラベルと URL を処理しますが、ラベルのない任意の秘密は識別できないため、呼び出し側で除去するかパス全体を隠します。

マスキング結果はデータだけを保持します。通常オブジェクトとクラスインスタンスの自有・列挙可能なデータ項目をコピーし、元のプロトタイプ、アクセサー、独自の `toJSON()` を保持・実行しません。日付は ISO 文字列、URL はマスキング済み文字列に変換し、元の値は変更しません。SDK や業務オブジェクトからは診断に必要な項目だけを選び、ラベルのない秘密や業務上の個人情報は引き続き明示的に除去してください。

### 結果とエラー：`core.error`

core.error はエラーコード定義、実際の失敗インスタンス、安全な HTTP/UI メッセージを扱います。コードは安定し、文面は現在の言語で生成できます。HTTP ステータスとヘッダーは Serv/Kit などが扱います。

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

#### 共通結果型と独立した構築関数

`HaiResult<T>` は success で data/error を区別します。`ok` / `err` を個別に import して成功・失敗の結果を構築します。業務 API 後は success を確認し、getter・ツール・ファクトリーはそれぞれの戻り値・例外契約に従います。

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

HTTP/UI 境界では `core.error.toPublic(error, traceId?, locale?)` を使います。5xx は翻訳済みの一般的な案内に置換し、その他の文面から既知の認証情報を除き、安全な項目だけを保持します。追跡 ID は明示引数、コンテキストの traceId/requestId、既存 error.traceId の順で選び、なければ生成します。`formatMessage()` は有効な ID を追記し、同じ末尾を重複させません。

内部 `cause` / `ext` は既定で非公開です。400/422 のフィールドエラーは `field` / `message` を保持できます。明示的に公開を許可し、業務 Schema で検証した `publicExt` は、マスキング後に公開 `ext` となります。Core は業務上の公開可否を自動検証しません。HTTP ステータス、ヘッダー、通知 UI は Serv/Kit/UI ホストが組み込みます。

| 設定エラー                | コード         | 内容                             |
| ------------------------- | -------------- | -------------------------------- |
| `CONFIG_FILE_NOT_FOUND`   | `hai:core:010` | ファイルなし                     |
| `CONFIG_PARSE_ERROR`      | `hai:core:011` | YAML/dotenv の読み取り・解析失敗 |
| `CONFIG_VALIDATION_ERROR` | `hai:core:012` | Schema または環境上書きが無効    |
| `CONFIG_ENV_VAR_MISSING`  | `hai:core:013` | 必須展開変数の欠落               |
| `CONFIG_NOT_LOADED`       | `hai:core:014` | 設定未読み込み                   |

これらは `HaiConfigError` の定数です。モジュール共通のエラーは `HaiCommonError` を使います。

`HaiCommonError.RATE_LIMIT_EXCEEDED` は `hai:common:203` / HTTP 429 に対応します。Kit の応答ヘルパーとガードも共通エラー定義を使用します。

HTTP/UI 境界で業務メッセージを公開するのは、明示された有効な4xx状態のみです。`httpStatus` が未指定または不正な場合は500として安全なメッセージを返します。独自の業務エラーには完全なエラー定義または明示的な状態を指定してください。

### メッセージと言語：`core.i18n`

パラメーター置換付きのメッセージ取得関数を作り、Core 内蔵メッセージや言語を取得・設定します。定数は内蔵言語一覧であり、アプリ翻訳の自動登録は行いません。

```ts
import { core } from '@h-ai/core'

// 页面语言或服务进程的启动默认值；请求中使用 runWithLocale 单独选择语言。
core.i18n.setGlobalLocale('zh-CN') // 返回 undefined；后续默认消息使用中文。
core.i18n.getGlobalLocale() // 'zh-CN'。
core.i18n.coreM('core_errorNotFound') // '资源不存在'。
core.i18n.DEFAULT_LOCALE // zh-CN。
core.i18n.DEFAULT_LOCALES // [{ code: 'zh-CN', label: '简体中文' }, { code: 'en-US', label: 'English' }, { code: 'ja-JP', label: '日本語' }]。
```

対応言語は `zh-CN`、`en-US`、`ja-JP` で、略記 `zh` / `en` / `ja` を正規化します。明示 locale、Node リクエスト言語、アプリ既定言語の順に参照します。未対応言語は `zh-CN`、未定義キーはキー自体にフォールバックします。

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

Node のリクエスト/SSR では、実際の非同期処理を `runWithLocale()` で囲みます。Serv は自動でリクエスト言語を設定し、Kit は同名の入口を提供します。リクエスト内の `setGlobalLocale()` はそのリクエストだけを変更し、外側では起動時の既定値にのみ使います。ブラウザーはアプリの `setGlobalLocale()` または明示 locale を使用します。SSR の UI store はプロセス既定言語を変更しません。

### フィールド検証メッセージ：`core.zodValidation`

Zod エラーをフォームに表示できる { field, message }[] に変換します。createPrefixedZodMessageGetter() は接頭辞で翻訳キーを選び、mapZodErrorToFormErrors() は抽出、翻訳、フィールドパス変換を行います。

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

Zod v3/v4 の issues/errors に対応し、既定英語は翻訳、業務の独自メッセージは保持します。パスはドット、全体エラーは _ です。厳密 Schema の未知項目は validationUnexpectedFields を使い、内部項目名を公開しません。

### モジュールの起動と補助機能：`core.module`

アプリ起動コードやモジュール実装で、複数モジュールの管理と未初期化時の共通エラーを再利用します。どのモジュールを使うかはアプリが選びます。

#### アプリケーションの起動と終了

複数のモジュールを使うアプリは、業務処理の前にデータベースなどを初期化し、処理後に解放する必要があります。`core.module.createRuntime()` は各モジュールの起動・終了関数を受け取り、アプリから呼び出すオブジェクトを返します。この作成時点ではモジュールを起動しません。

以下はローカル開発用の例で、`@h-ai/reldb` と `@h-ai/cache` の追加インストールが必要です。両方とも説明用のメモリ設定を使います。本番では各モジュールが要求する共有バックエンドを設定してください。

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

この例はデータベース → キャッシュの順に起動し、キャッシュ → データベースの順に終了します。例では実行直後に解放しますが、常駐サービスでは終了時に同じ `runtime.close()` を呼びます。

起動失敗時は起動を試みたモジュールを解放します。終了失敗時はそのモジュールで止まり、まだ必要な依存先を保持し、次の `close()` / `start()` で解放を再試行します。同時に複数の `start()` を呼んでも初期化は重複しません。任意の `enabled()` が false を返す項目は実行しません。

両メソッドは `HaiResult` を返すため、`success` を確認します。エラーはモジュール名、段階、コード、必要な設定項目の案内を含み、秘密の設定値や SDK の元例外を公開の起動エラーに含めません。

#### 未初期化時のエラー応答

createNotInitializedKit() は error/result/proxy を返します。proxy は実際の操作へ切り替わるまで同期・非同期の共通失敗結果を返し、メッセージ関数は呼び出し時に現在言語を参照します。

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

#### 共有状態の必要性を判断

requiresSharedState() は本番で単一ホスト限定の業務状態を拒否すべきかを判断します。判定のみで、DB 接続や切り替えは行いません。実際の環境はサーバーから渡します。

```ts
import { core } from '@h-ai/core'

// 此例用显式数据演示；服务端实际使用时传入 process.env。
core.module.requiresSharedState({ NODE_ENV: 'production' }) // true：应使用跨主机共享后端。
core.module.requiresSharedState({ NODE_ENV: 'production', HAI_E2E: '1' }) // false：显式 E2E 例外。
```

### リクエストアクセス検査：`core.access`（Node）

HTTP 入口で信頼できるクライアント IP を解決し、アドレス、パス、メソッド、時間帯を検査します。Core は判定だけを提供し、Serv の http.access または Kit の createHandle({ access }) がリクエスト処理へ組み込みます。

#### アドレスの解決と検査

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

#### ポリシー読み込みとリクエスト検査

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

- 検査器作成時に規則を検証・コンパイルします。`loadPolicy({ file })` は起動時に最大 1 MiB の独立 YAML を読みます。設定不正は例外となり、ホストの起動を停止します。ファイル指定とインライン規則は混在できません。
- グローバル条件とすべての一致規則を満たす必要があり、拒否 IP を優先します。空の IP/時間リストはその軸を制限せず、既定時区は UTC です。パスにはデプロイ接頭辞を含め、完全一致または末尾 `/**` を使います。GET は HEAD を含みません。
- `createClientIpResolver()` の既定 `auto` は通常ホストで転送ヘッダーを無視し、管理された非公開 Compose だけでコンテナー網を使います。`[]` はプロキシ信頼を無効にします。独自管理の入口では実際のプロキシ IP/CIDR を指定し、対向アドレスは socket または信頼できる基盤から取得します。
- パスの `encryption` は `required` / `disabled` で、省略時はホストに従います。パスとメソッドが重なる逆の指定は作成時に失敗します。ホストは `check.encryption()` / `requiresEncryption` で通信モードを組み込みます。Core は鍵を保持せず暗号化も行わないため、HTTPS と認証は引き続き必要です。

既定値、独立ファイル、プロキシ構成、デプロイ手順は[アクセス制御ガイド](../../docs/usage/configuration/request-access.md)を参照してください。

### ID の生成と検証：`core.id`

業務 ID とログ関連番号を作り、UUID v4/nanoid の形式を確認します。

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

ID を秘密鍵には使いません。UUID は暗号学的乱数を必要とし、なければ例外です。_core.yml に全体の長さ・接頭辞設定はなく、呼び出しごとに指定します。

### 値の型確認：`core.typeUtils`

境界の値を型判定し、分岐内で TypeScript の型を絞り込みます。業務 Schema の検証は別途必要です。

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

### オブジェクト：`core.object`

複製、結合、項目選択と、型付き keys/values/entries、fromEntries を提供します。

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

deepClone は structuredClone で Date/Map/Set/循環など複製可能な値を扱い、関数など非対応値では例外です。deepMerge は通常オブジェクトのみ再帰結合し、配列・Date・集合・クラスは後の値で置換し、入力は変更しません。インスタンスの複製ではありません。

### 文字列：`core.string`

命名形式の変換、表示文字列の処理、空白判定、文字列比較に使います。

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

Node の constantTimeEqual は同じ長さの UTF-16 バイト列をネイティブ timingSafeEqual で比較し、長さが違えば即座に false です。ブラウザーは定時間保証がなく、サーバー認証の検査には使いません。

### 配列：`core.array`

入力配列を保持しながら、重複除去、分割、分類、nullish 値の除外、積集合・差集合を計算します。

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

groupBy は `constructor`/`__proto__` などと同名のキーにも対応します。chunk の大きさは正の整数で、size<=0 は空配列を返します。

### 非同期処理：`core.async`

遅延、タイムアウト、再試行、並行制限・直列処理と、入力やスクロールの debounce/throttle を行います。

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

withTimeout は待機だけを制限し、元の処理を中止しません。retry は例外/reject が対象で、失敗 HaiResult は再試行しません。現在の maxRetries は初回を含み、3 は最大 3 回です。parallel は 0 より大きい安全な整数の並行数が必要で、不正値は実行前に RangeError で失敗します。結果順序は入力と同じです。

### 日時：`core.time`

タイムスタンプ、Date、表示テキストを変換し、地域時刻の日付境界と相対時間を計算します。

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

formatDate は YYYY/MM/DD/HH/mm/ss に対応し、既定は YYYY-MM-DD です。日付計算は新しい Date を返します。parseDate の不正入力は自動例外ではなく無効な Date になるため isValidDate で確認します。

詳しい引数と低頻度の選択肢は [Core 利用リファレンス](../cli/templates/skills/hai-core/reference.md)を参照し、公開契約は現在の宣言に従ってください。

## 設定

core.init は設定ディレクトリー・Schema・ログ指定を受け同期 void を返し、close はありません。読込・環境優先順位・フィールド例はクイックスタートと core.config を参照し、init 完了だけで業務設定全体の妥当性を判断しないでください。

[項目別の用途・適用場面・例](../../docs/usage/configuration/runtime.md).

## エラー処理

領域操作は result.success を確認し、失敗時はモジュールのエラー定義と安全な説明を使います。コード・関連 ID・秘匿した原因をサーバーログに残します。同期ツール・ファクトリー・ストリーム反復・ライフサイクルは各署名に従い、Promise 完了だけで成功と判断しません。回復条件は各機能を参照してください。

## 開発とテスト

リポジトリールートで実行します（PowerShell は `pnpm.cmd`）。

```bash
pnpm --filter @h-ai/core typecheck
pnpm --filter @h-ai/core lint
pnpm --filter @h-ai/core build
pnpm --filter @h-ai/core test
```

公開宣言と例の検証は[モジュール JSDoc 規約](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)を参照してください。

## ライセンス

Apache-2.0
