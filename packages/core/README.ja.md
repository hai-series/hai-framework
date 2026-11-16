# @h-ai/core

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md)

`@h-ai/core` は Hai Framework の共通基盤です。アプリケーションと他のモジュールに、設定、エラー、ログ、国際化の共通機能を提供します。ツールはそのまま利用でき、Node アプリでファイル設定が必要な場合に `core.init()` を呼びます。

## クイックスタート

```bash
pnpm add @h-ai/core
```

`@h-ai/core` から `core` をインポートすると、すぐにログ出力、メッセージ取得、汎用ツールを利用できます。`ok`、`err`、型、スキーマ、エラー定数も同じ入口からインポートできます。独自の設定やフォーム検証の例を実行するには、`pnpm add zod` で Zod を追加してください。

### 初期化：`core.init`

Node では起動時に YAML の読み込みとログの設定を行います。ブラウザーではページで使うログの設定を渡します。データベースやキャッシュを起動する例は[アプリケーションの起動と終了](#アプリケーションの起動と終了)を参照してください。

#### Node.js

`config/_core.yml` を用意します。

```yaml
name: orders
version: 0.1.0
env: development
defaultLocale: ja-JP
logging:
  level: info
  format: pretty
```

```ts
import type { CoreConfig } from '@h-ai/core'
import { core } from '@h-ai/core'

// config ディレクトリを読み込みます。検証に成功した _core.yml は core として保存されます。
core.init({ configDir: './config' })
const settings = core.config.getOrThrow<CoreConfig>('core')

// 既定の言語を設定し、起動完了をログに記録します。
core.i18n.setGlobalLocale(settings.defaultLocale)
core.logger.info('Application ready', { app: settings.name }) // app: 'orders'
```

`core.init()` はディレクトリを同期的に読み込みます。個々のファイルの読み込みや検証に失敗した場合は、ファイル名とエラーコードを記録し、残りのファイルを読み込みます。この例では必須の `core` 設定がないと、`getOrThrow()` で起動が止まります。ディレクトリの走査やログの設定時にも例外が発生することがあります。

#### ブラウザー

```ts
import { core } from '@h-ai/core'

// ページの起動時にログレベルと既定の言語を設定します。
core.init({
  logging: { level: 'warn' }
})
core.i18n.setGlobalLocale('ja-JP')

// 関連するログを追えるように、リクエスト ID を出力します。
const requestId = core.id.request()
core.logger.warn('Request needs attention', { requestId })
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

複数の設定ファイルを読み込むときは、`core.init({ configDir: './config', configSchemas: { app: AppSchema } })` を使います。Core はスキーマから任意項目のパスや置換後の型を判断します。その後 `core.config.validate('app', AppSchema)` を呼び、`success` を確認して `data` を取得します。

`validate()` は、直近の読み込みに成功した YAML を使い、現在の環境変数と指定したスキーマで毎回検証します。例えば `code: ${APP_CODE:00123}` で環境変数による上書きがなければ、最初にスキーマを指定せず数値として読み込んだ場合も、文字列型で検証すると `'00123'` が得られます。繰り返し検証しても変換は元の値から実行します。ファイルを編集した場合は `reload()` を使います。成功すると読み込んだ YAML と検証結果の両方が更新されます。

以下のファイル例では、この `config/app.yml` を使い、環境変数による追加の上書きがないものとします。

```yaml
# config/app.yml
port: 3000
```

ファイルを 1 つだけ読み込むときは、`load()` に同期スキーマを渡します。スキーマで検証に失敗した場合や独自の検証処理で例外が発生した場合は、`CONFIG_VALIDATION_ERROR` が返ります。`error.cause` には検証結果の問題一覧、または元の例外が残ります。`get()` と `getOrThrow()` の型引数は TypeScript 用です。実際の値はスキーマで検証します。

```ts
import { core } from '@h-ai/core'
import { z } from 'zod'

const AppSchema = z.object({
  port: z.number().int().min(1).max(65535),
})

// ファイルを読み込んで検証します。成功時は { success: true, data: { port: 3000 } } が返ります。
const loaded = core.config.load('app', './config/app.yml', AppSchema)
if (!loaded.success)
  throw new Error(loaded.error.message, { cause: loaded.error })

// 以下は app だけを読み込んだ状態の結果です。
core.config.has('app') // true
core.config.keys() // ['app']
core.config.get<z.infer<typeof AppSchema>>('app') // { port: 3000 }
core.config.getOrThrow<z.infer<typeof AppSchema>>('app') // { port: 3000 }
```

#### 再読み込み・監視・解放

`reload()` はファイルを読み直し、登録済みのコールバックに結果を渡します。`watch()` は親ディレクトリ内の対象ファイルを監視するため、通常の保存、原子的な置き換え、削除後の再作成にも反応します。読み込みや検証に失敗した場合は直近の成功値をキャッシュに残し、コールバックに `null` とエラーを渡します。

- 指定した名前の設定をまだ読み込んでいない場合は、`watch()` がただちに `CONFIG_NOT_LOADED` を通知します。
- OS が監視を開始できない場合や監視中にエラーを報告した場合は、`SERVICE_UNAVAILABLE` を通知し、`isWatching()` は `false` を返します。ディレクトリの状態が復旧したら `watch()` を再度呼び出せます。
- 解除関数は対象のコールバックを 1 件だけ解除します。`unwatch(name)` はその設定の監視を停止し、`clear(name)` はキャッシュも削除します。名前を省略するとすべての設定が対象です。

同じ設定名で別のファイルを使う場合は、現在の監視を止めてから、新しいファイルを読み込んで監視します。

`watchConfig` の既定値は `false` です。有効にすると、`core.init()` は読み込みに成功したファイルを監視します。再読み込みで更新されるのは Core のキャッシュです。各モジュールへの反映は、そのモジュールのライフサイクルに沿って行います。

```ts
import { core } from '@h-ai/core'

// 前の例に続けて実行します。再読み込みに成功すると、コールバックに現在のポート番号が渡ります。
const stop = core.config.watch<{ port: number }>('app', (settings, error) => {
  if (error) {
    core.logger.warn('App config watch reported a failure', { code: error.code })
    return
  }
  core.logger.info('App config reloaded', { port: settings?.port })
})

try {
  // 手動で読み直します。ファイルが port: 3000 のままなら、コールバックは port: 3000 を記録します。
  const reloaded = core.config.reload('app')
  if (!reloaded.success)
    throw new Error(reloaded.error.message, { cause: reloaded.error })
}
finally {
  stop()
  core.config.clear('app')
}
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

Node の起動時に `loadEnvFiles()` を呼び、`success` を確認します。戻り値を `process.env` に反映してから YAML を読み込みます。`development` と `production` は `dev` と `prod` のファイルを選択します。存在しないファイルはスキップし、同じファイル内に同名のキーがある場合はエラーになります。

優先順はプロセス環境、`.env.<mode>.local`、`.env.local`、`.env.<mode>`、`.env`、YAML です。`loadEnvFiles()` がプロセス環境から取り込むのは、`HAI_*` の変数と dotenv ファイルに同名のキーがある変数です。秘密情報を含む `.local` ファイルはローカルに置いてください。

```ts
import { core } from '@h-ai/core'

// config/app.yml に port: 3000、.env に HAI_APP_PORT=4000 を設定します。より優先度の高い上書きがない場合の例です。
const result = core.config.loadEnvFiles({ mode: 'dev', envDir: '.' })
if (!result.success)
  throw new Error(result.error.message, { cause: result.error })

Object.assign(process.env, result.data)
core.init({ configDir: './config' })
core.config.get('app') // { port: 4000 }
```

#### 置換後の値の型

環境変数はテキストです。`load()` / `resolve()` に Zod Schema を渡すと、項目の型に従って置換結果を変換します。`z.number()` は数値、`z.boolean()` は真偽値となり、`z.string()` は文字列を保持します。

値全体が ${PORT:3000} なら数値 3000、${ENABLED:false} なら真偽値 false にできます。server-${PORT:3000} のような混合テキストは文字列です。文字列項目 code の 00123 は先頭の 0 を保った '00123' になります。以下はファイルを読まず、同等の YAML 値と環境データを直接渡す例です。

```ts
import { core } from '@h-ai/core'
import { z } from 'zod'

// process.env に依存しない例にするため、環境変数の値を直接渡します。
const AppSchema = z.object({
  port: z.number(),
  enabled: z.boolean(),
  label: z.string(),
  code: z.string()
})
const resolved = core.config.resolve({
  name: 'app',

  value: {
    // eslint-disable-next-line no-template-curly-in-string -- Core が展開するプレースホルダー。
    port: '${PORT:3000}',
    // eslint-disable-next-line no-template-curly-in-string -- Core が展開するプレースホルダー。
    enabled: '${ENABLED:false}',
    // eslint-disable-next-line no-template-curly-in-string -- Core が展開するプレースホルダー。
    label: 'server-${PORT:3000}',
    // eslint-disable-next-line no-template-curly-in-string -- Core が展開するプレースホルダー。
    code: '${APP_CODE:00123}'
  },
  environment: { PORT: '4000', HAI_APP_PORT: '5000' },
  schema: AppSchema,
})
if (!resolved.success)
  throw new Error(resolved.error.message, { cause: resolved.error })

// resolved：{ success: true, data: { port: 5000, enabled: false, label: 'server-4000', code: '00123' } }

// 置換後の値をアプリのスキーマで検証します。
const validated = AppSchema.safeParse(resolved.data)
if (!validated.success)
  throw new Error(validated.error.message, { cause: validated.error })
core.logger.info('Config resolved', { port: validated.data.port }) // port: 5000
```

空文字列は「設定済みだが文字がない」値で、未設定、null、false、0 ではありません。APP_CODE='' は 00123 に戻らず '' のままです。許可するかは Schema が決め、数値項目の空文字列は通常検証に失敗します。

変数の置換は YAML 内の式に適用されます。環境値や親 JSON 内の `server-${PORT}` は原文のまま保持されます。HAI_APP_LABEL='server-${PORT}' の最終値は server-${PORT} です。置換したい式は YAML に書きます。

Schema がなければ既存 YAML/JSON 構造からパスを判断し、単独の式は YAML の規則で数値・真偽値を解釈します。YAML にない合法な省略項目は configSchemas で示せます。最終的な業務検証は validate() またはモジュール初期化で行います。

#### 設定ファイル生成用のツール

resolve() はビルド・デプロイ時のメモリ上の設定計算にも使えます。toEnv() はオブジェクトを環境変数へ、mergeEnv() は複数ソースの統合、stringifyEnv()/parseEnv() は .env の符号化・解析を行います。秘密のマスキングは行いません。

```ts
import { core } from '@h-ai/core'

// 設定を環境変数に変換します。配列は JSON のままです。
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
const text = core.config.stringifyEnv(merged) // dotenv 形式のテキストにします。
// テキストには次の 2 行が入ります。
// HAI_APP_PORT='4000'
// HAI_APP_TAGS='["local"]'
const restored = core.config.parseEnv(text) // 値を文字列として読み戻します。
// restored：{ HAI_APP_PORT: '4000', HAI_APP_TAGS: '["local"]' }
core.logger.info('Generated config verified', { port: restored.HAI_APP_PORT })
```

通常のオブジェクトは項目ごとに展開し、配列、動的な辞書、空オブジェクトは JSON のまま出力します。`stringifyEnv()` は既定で Node 用のテキストを生成します。Compose のドル記号の扱いに合わせるには `{ target: 'compose' }` を渡します。Node のパーサーは単引用符で囲まれた値に含まれる改行の復帰文字（`\r`）を取り除きます。[基本設定ガイド](../../docs/usage/configuration/runtime.md)

### ログ：`core.logger`

`core.logger` は設定レベル以上のログを出力します。重大度が低い順に `trace`、`debug`、`info`、`warn`、`error`、`fatal` です。レベルを `fatal` に設定すると `fatal` のログだけが出力されます。アプリを終了するかどうかは呼び出し側で判断します。

初期状態のレベルは `info`、出力形式は `pretty` です。YAML に `logging` を指定した状態で `format` を省略すると、スキーマが `json` を補います。Node は pino を使い、任意依存の `pino-pretty` がなければ JSON を出力します。ブラウザーの開発者コンソールでは `bigint` を十進文字列、循環参照を `[Circular]` として出力します。

```ts
import { core } from '@h-ai/core'

core.logger.setLevel('info')
core.logger.debug('Read started') // info 未満のため出力されません。
core.logger.info('Order created', { orderId: 'order-1' }) // orderId がログに含まれます。
core.logger.warn('Retry scheduled')
core.logger.error('Operation failed', {
  error: new Error('Example failure')
})
```

create() は名前付き Logger、child() は固定項目付き Logger を作ります。configure() は出力と追加マスキング、setLevel()/getLevel() はグローバルレベルの変更・取得です。

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

既存の既定・モジュール・入れ子 child Logger も、その後の出力で最新のグローバル設定を使います。`setLevel()` も即座に反映します。`create()` の明示的な level/format/context が優先し、省略項目は動的に継承します。呼び出し時の context が固定値を上書きし、最後に `core.context` のリクエスト関連項目を追加します。ブラウザーの JSON は `level` / `msg`、pretty は読みやすい文面と context を出力します。

observe() はレベル判定・マスキング済みレコードを診断収集に通知し、解除関数を返します。コールバックでは上限付きメモリ収集のみ行い、保存は別途非同期に行います。観測は保存完了を意味せず、例外と同期再入は分離します。

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

### リクエストの関連付け：`core.context`

run() は requestId、userId、scopeId、jobId などをリクエストやタスクに持たせ、get() は現在値を読みます。Node では DB などの非同期処理後も他のリクエストに上書きされず読み取れます。既存 Logger にも自動で付加します。

```ts
import { core } from '@h-ai/core'

// Node では非同期処理を待った後も、リクエストの情報を取得できます。
await core.context.run({ requestId: 'request-1', userId: 'user-1' }, async () => {
  await core.async.delay(1)
  const current = core.context.get() // requestId と traceId は 'request-1'、userId は 'user-1'。
  core.logger.info('Request continued', { requestId: current.requestId })
  return current.requestId
}) // コールバックの結果は 'request-1'。
core.context.get() // リクエストの外では {}

// 収集処理自身のログを、監視コールバックを呼び出さずに出力できます。
core.context.run({ suppressLogObservers: true }, () => core.logger.warn('Collector diagnostic'))
```

ブラウザーでは同期コールバック中だけ保持し、await 後は保持しません。関連 ID は認可情報ではなく、主体とテナント範囲は信頼できるサーバーコードが渡します。

### 診断データのマスキング：`core.sanitize`

ログ、診断パッケージ、公開エラーの前に認証情報を隠します。項目名の判定、単一値・オブジェクト全体・URL の処理、ラベル付きまたは既知の秘密のテキスト除去に使えます。

```ts
import { core } from '@h-ai/core'

core.sanitize.isSensitiveKey('apiKey') // true
core.sanitize.sanitizeSensitiveValue('example-only', 'password') // '[REDACTED]'
const safe = core.sanitize.sanitizeSensitiveFields({ password: 'example-only', email: 'user@example.com' })
// safe は { password: '[REDACTED]', email: 'user@example.com' }。元のデータは変わりません。
// 認証情報をマスクしたコピーに対して、メールアドレスもマスクします。
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

defaultSensitiveKeyRegex/defaultSensitiveReplacement は既定の照合と [REDACTED] を提供します。独自 matcher は既定の規則を置換するため、業務上の個人情報を追加処理する前に既定の認証情報マスキングを残します。

ログは password/passwordHash、token、secretKey、privateKey などの認証項目と、URL のユーザー名・パスワード・機密クエリー・OAuth のキー値 fragment を隠します。不正 URL は `(invalid url)` になります。`redact` は業務上の個人情報パスを追加し、ドット・括弧・単一階層 `*` に対応し、大文字小文字を区別します。メールアドレスと電話番号は既定では保持します。

ネイティブ `Error` は name/message/stack/cause、集約エラー、列挙可能な context を含むコピーにしてから隠し、元の例外は変更しません。例外内の循環と 32 階層の上限は `[Circular]` / `[MaxDepth]` に置換します。通常オブジェクトの循環は保持され、JSON 化できるとは限りません。文面内では明示的な認証情報ラベルと URL を処理しますが、ラベルのない任意の秘密は識別できないため、呼び出し側で除去するかパス全体を隠します。

マスキング結果はデータだけを保持します。通常オブジェクトとクラスインスタンスの自有・列挙可能なデータ項目をコピーし、元のプロトタイプ、アクセサー、独自の `toJSON()` を保持・実行しません。日付は ISO 文字列、URL はマスキング済み文字列に変換し、元の値は変更しません。SDK や業務オブジェクトからは診断に必要な項目だけを選び、ラベルのない秘密や業務上の個人情報は引き続き明示的に除去してください。

### 結果とエラー：`core.error`

core.error はエラーコード定義、実際の失敗インスタンス、安全な HTTP/UI メッセージを扱います。コードは安定し、文面は現在の言語で生成できます。HTTP ステータスとヘッダーは Serv/Kit などが扱います。

```ts
import { core } from '@h-ai/core'

// 固定のエラーコードを定義し、エラー生成時にメッセージを取得します。
const OrderError = core.error.buildHaiErrorsDef('orders', { NOT_FOUND: '300:404' })
// OrderError.NOT_FOUND：{ code: 'hai:orders:300', httpStatus: 404, system: 'hai', module: 'orders' }
const failure = core.error.buildHaiErrorInst(OrderError.NOT_FOUND, core.i18n.coreM('core_errorNotFound', { locale: 'ja-JP' }))
// failure はエラー定義と message: 'リソースが見つかりません' をまとめたものです。
const publicError = core.error.toPublic(failure, 'request-1')
// 公開エラーには code、httpStatus、system、module が残ります。
// traceId は 'request-1'、メッセージは 'リソースが見つかりません (traceId: request-1)'。
const message = core.error.formatMessage(publicError) // 'リソースが見つかりません (traceId: request-1)'
core.logger.warn('Order unavailable', { error: failure, publicMessage: message })
```

#### 共通結果型と独立した構築関数

`HaiResult<T>` は success で data/error を区別します。`ok` / `err` を個別に import して成功・失敗の結果を構築します。業務 API 後は success を確認し、getter・ツール・ファクトリーはそれぞれの戻り値・例外契約に従います。

```ts
import type { HaiResult } from '@h-ai/core'
import { core, err, HaiCommonError, ok } from '@h-ai/core'

// 業務処理の失敗には err、成功には ok を返します。
function divide(a: number, b: number): HaiResult<number> {
  if (b === 0)
    return err(HaiCommonError.VALIDATION_ERROR, core.i18n.coreM('core_errorValidation', { locale: 'ja-JP' }))
  return ok(a / b) // ok(5) は { success: true, data: 5 } を返します。
}

// success を確認してから data または error を読み取ります。
const result = divide(10, 2) // { success: true, data: 5 }
if (!result.success)
  core.logger.warn('Calculation failed', { error: result.error })
else
  core.logger.info('Calculation completed', { value: result.data })

const failed = divide(10, 0)
// failed：{ success: false, error: { code: 'hai:common:200', httpStatus: 400,
// system: 'hai', module: 'common', message: '入力内容の検証に失敗しました' } }
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

// ページの言語、または起動時のプロセス既定言語を設定します。
core.i18n.setGlobalLocale('ja-JP')
core.i18n.getGlobalLocale() // 'ja-JP'
core.i18n.coreM('core_errorNotFound') // 'リソースが見つかりません'
core.i18n.DEFAULT_LOCALE // zh-CN
core.i18n.DEFAULT_LOCALES // [{ code: 'zh-CN', label: '简体中文' }, { code: 'en-US', label: 'English' }, { code: 'ja-JP', label: '日本語' }]
```

`zh`、`en`、`ja` はそれぞれ `zh-CN`、`en-US`、`ja-JP` の略記です。メッセージを取得するときは、明示した `locale`、Node のリクエスト言語、アプリの既定言語の順に参照します。未対応の言語か、その言語の辞書がない場合は `zh-CN` の辞書を使います。キーに対応する文言がなければキー自体を返し、パラメーターがなければ `{name}` などのプレースホルダーが文中に残ります。

```ts
import { core } from '@h-ai/core'

// 言語ごとに辞書を用意し、メッセージ取得時に置換する値を指定します。
const message = core.i18n.createMessageGetter({
  'zh-CN': { welcome: '欢迎 {name}' },
  'en-US': { welcome: 'Welcome {name}' },
  'ja-JP': { welcome: 'ようこそ {name}' },
})
// locale が 'zh-CN'、name が 'Alice' なら、message('welcome', ...) は '欢迎 Alice' を返します。
const greeting = await core.i18n.runWithLocale('en-US', async () => {
  await Promise.resolve()
  return message('welcome', {
    params: { name: 'Alice' }
  })
})
// コールバックの完了後、greeting は 'Welcome Alice'。
core.logger.info('Greeting prepared', { greeting })
```

Node のリクエスト/SSR では、実際の非同期処理を `runWithLocale()` で囲みます。Serv は自動でリクエスト言語を設定し、Kit は同名の入口を提供します。リクエスト内の `setGlobalLocale()` はそのリクエストだけを変更し、外側では起動時の既定値にのみ使います。ブラウザーはアプリの `setGlobalLocale()` または明示 locale を使用します。SSR の UI store はプロセス既定言語を変更しません。

### フィールド検証メッセージ：`core.zodValidation`

Zod エラーをフォームに表示できる { field, message }[] に変換します。createPrefixedZodMessageGetter() は接頭辞で翻訳キーを選び、mapZodErrorToFormErrors() は抽出、翻訳、フィールドパス変換を行います。

```ts
import { core } from '@h-ai/core'
import { z } from 'zod'

// この例では Core のメールアドレス用メッセージを使います。フォーム独自のメッセージ取得関数も渡せます。
const message = core.zodValidation.createPrefixedZodMessageGetter('core', key =>
  key === 'core_validationEmail'
    ? core.i18n.coreM('core_validationEmail', { locale: 'ja-JP' })
    : core.i18n.coreM('core_errorValidation', { locale: 'ja-JP' }))
// message('validationEmail') は '有効なメールアドレスを入力してください' を返します。
const parsed = z.object({
  email: z.email()
}).safeParse({ email: 'invalid' })
if (!parsed.success) {
  const errors = core.zodValidation.mapZodErrorToFormErrors(parsed.error, message)
  // errors は [{ field: 'email', message: '有効なメールアドレスを入力してください' }]。
  core.logger.info('Validation failed', { errors })
}
```

`safeParse()` が失敗したときの `error` を渡します。Zod v3/v4 の `issues` または `errors` の配列から、パスとメッセージのある項目を読み取ります。Zod の英語の既定メッセージは翻訳し、アプリ独自の文言はそのまま使います。フィールドのパスは `items.0.email` のように表し、フォーム全体のエラーには `_` を使います。厳密なスキーマの未知項目には共通の `validationUnexpectedFields` メッセージが使われます。

### モジュールの起動と補助機能：`core.module`

アプリ起動コードやモジュール実装で、複数モジュールの管理と未初期化時の共通エラーを再利用します。どのモジュールを使うかはアプリが選びます。

#### アプリケーションの起動と終了

複数のモジュールを使うアプリは、業務処理の前にデータベースなどを初期化し、処理後に解放する必要があります。`core.module.createRuntime()` は各モジュールの起動・終了関数を受け取り、アプリから呼び出すオブジェクトを返します。この作成時点ではモジュールを起動しません。

以下はローカル開発用の例で、`@h-ai/reldb` と `@h-ai/cache` の追加インストールが必要です。両方とも説明用のメモリ設定を使います。本番では各モジュールが要求する共有バックエンドを設定してください。

```ts
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'

// 起動順に各モジュールの関数を並べます。
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

// ホストが runtime.start() を呼ぶと、両方のモジュールの起動が始まります。

// データベースを起動してから、キャッシュを起動します。
const started = await runtime.start() // 両方の起動に成功すると { success: true, data: undefined }。
if (!started.success)
  throw new Error(started.error.message, { cause: started.error })

try {
  // 両方の起動を確認してからアプリの処理を行います。
  core.logger.info('Application modules ready')
}
finally {
  // キャッシュを閉じてから、データベースを閉じます。
  const closed = await runtime.close() // 両方の終了に成功すると { success: true, data: undefined }。
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
core.i18n.setGlobalLocale('ja-JP')
const waiting = core.module.createNotInitializedKit(HaiCommonError.NOT_INITIALIZED, () => message('notReady'))
waiting.error() // { code: 'hai:common:001', httpStatus: 500, system: 'hai', module: 'common', message: '先にモジュールを初期化してください' }
waiting.result<string>() // { success: false, error: waiting.error() }

// モジュールの起動が完了するまで、プロキシが各操作の応答を返します。
const asyncOperations = waiting.proxy<{ read: () => Promise<HaiResult<string>> }>()
const syncOperations = waiting.proxy<{ read: () => HaiResult<string> }>('sync')
const result = await asyncOperations.read() // { success: false, error: waiting.error() }
if (!result.success)
  core.logger.warn('Read before initialization', { error: result.error })
syncOperations.read() // { success: false, error: waiting.error() } を同期的に返します。
```

#### 共有状態の必要性を判断

requiresSharedState() は本番で単一ホスト限定の業務状態を拒否すべきかを判断します。判定のみで、DB 接続や切り替えは行いません。実際の環境はサーバーから渡します。

```ts
import { core } from '@h-ai/core'

// Node サービスでは process.env を渡します。
core.module.requiresSharedState({ NODE_ENV: 'production' }) // true
core.module.requiresSharedState({ NODE_ENV: 'production', HAI_E2E: '1' }) // E2E と明示した実行では false。
```

### リクエストアクセス検査：`core.access`（Node）

HTTP 入口で信頼できるクライアント IP を解決し、アドレス、パス、メソッド、時間帯を検査します。Core は判定だけを提供し、Serv の http.access または Kit の createHandle({ access }) がリクエスト処理へ組み込みます。

#### アドレスの解決と検査

```ts
import { AccessConditionSchema, core } from '@h-ai/core'

core.access.normalizeClientIp('::ffff:198.51.100.23') // 198.51.100.23
const resolve = core.access.createClientIpResolver(['192.0.2.10']) // このプロキシだけを信頼します。
const request = new Request('https://example.test/api/orders', {
  headers: { 'x-forwarded-for': '198.51.100.23' }
})
// 第 2 引数にはソケットか信頼できるホストから取得した接続元アドレスを渡します。
const clientIp = resolve(request, '192.0.2.10') // 信頼するプロキシから渡された '198.51.100.23'。
const check = core.access.createConditionCheck(AccessConditionSchema.parse({
  allowIps: ['198.51.100.0/24']
}))
// check(clientIp) は { allowed: true } を返します。
core.logger.info('Address checked', { allowed: check(clientIp).allowed })
```

#### ポリシー読み込みとリクエスト検査

```ts
import { core } from '@h-ai/core'

// 起動時に別ファイルを読む場合は { file: './config/security/request-access.yml' } を渡します。
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
// ルールに denyIps: []、windows: []、timezone: 'UTC' の既定値が入ります。
const check = core.access.createRequestCheck(policy) // encryption と requiresEncryption を持つチェック関数を返します。
const decision = check('/api/external/sync', 'POST', '192.0.2.10') // { allowed: true }
check.encryption('/api/external/sync', 'POST') // 'disabled'
check.requiresEncryption // false
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

// 生成される値は毎回異なります。コメントは形式の例です。
core.id.generate() // 例 'V1StGXR8_Z5jdHi6B-myT'（既定で 21 文字）。
const shortId = core.id.short() // 例 'V1StGXR8_Z'（10 文字）。
core.id.withPrefix('order_') // 例 'order_V1StGXR8_Z5jdHi6B-myT'。
core.id.trace() // 例 'trace-V1StGXR8_Z5jdHi6B-myT'。
core.id.request() // 例 'req-V1StGXR8_Z5jdHi6B-myT'。
const uuid = core.id.uuid() // 例 '550e8400-e29b-41d4-a716-446655440000'（UUID v4）。
core.id.isValidUUID(uuid) // true
core.id.isValidNanoId(shortId, 10) // true
```

ID を秘密鍵には使いません。UUID は暗号学的乱数を必要とし、なければ例外です。_core.yml に全体の長さ・接頭辞設定はなく、呼び出しごとに指定します。

### 値の型確認：`core.typeUtils`

境界の値を型判定し、分岐内で TypeScript の型を絞り込みます。業務 Schema の検証は別途必要です。

```ts
import { core } from '@h-ai/core'

core.typeUtils.isDefined(null) // null と undefined は false。
core.typeUtils.isObject({ name: 'orders' }) // true。Date やクラスのインスタンスも対象で、配列と null は false。
core.typeUtils.isFunction(() => {}) // true
core.typeUtils.isPromise(Promise.resolve('ready')) // true
core.typeUtils.isString('orders') // true
core.typeUtils.isNumber(3000) // true。NaN は false。
core.typeUtils.isBoolean(false) // true
core.typeUtils.isArray([1, 2]) // true
```

### オブジェクト：`core.object`

複製、結合、項目選択と、型付き keys/values/entries、fromEntries を提供します。

```ts
import { core } from '@h-ai/core'

const defaults = { name: 'orders', port: 3000 }
const copy = core.object.deepClone(defaults) // { name: 'orders', port: 3000 }（新しいオブジェクト）。
// 一部の項目を上書きするときは、既定値のオブジェクトの型を指定します。
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

deepClone は structuredClone で Date/Map/Set/循環など複製可能な値を扱い、関数など非対応値では例外です。deepMerge は通常オブジェクトのみ再帰結合し、配列・Date・集合・クラスは後の値で置換し、入力は変更しません。インスタンスの複製ではありません。

### 文字列：`core.string`

命名形式の変換、表示文字列の処理、空白判定、文字列比較に使います。

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

Node の constantTimeEqual は同じ長さの UTF-16 バイト列をネイティブ timingSafeEqual で比較し、長さが違えば即座に false です。ブラウザーは定時間保証がなく、サーバー認証の検査には使いません。

### 配列：`core.array`

入力配列を保持しながら、重複除去、分割、分類、nullish 値の除外、積集合・差集合を計算します。

```ts
import { core } from '@h-ai/core'

core.array.unique([1, 1, 2]) // [1, 2]
core.array.chunk([1, 2, 3], 2) // [[1, 2], [3]]
core.array.groupBy([
  { role: 'admin' },
  { role: 'user' }
], item => item.role)
// => { admin: [{ role: 'admin' }], user: [{ role: 'user' }] }
core.array.first([1, 2, 3]) // 1。空配列では undefined。
core.array.last([1, 2, 3]) // 3。空配列では undefined。
core.array.flatten([
  [1],
  [2, 3]
]) // [1, 2, 3]（1 階層だけ展開）。
core.array.compact([0, null, 1, undefined]) // [0, 1]。0、false、空文字列は残ります。
core.array.shuffle([1, 2, 3]) // 例 [2, 3, 1]（新しい配列）。
core.array.intersection([1, 2], [2, 3]) // [2]
core.array.difference([1, 2], [2, 3]) // [1]
```

`groupBy()` は `constructor` など、オブジェクトのプロトタイプと同名のキーにも対応します。`chunk()` の分割サイズには正の安全な整数を指定します。小数や無限大などの無効なサイズでは空の配列が返ります。

### 非同期処理：`core.async`

遅延、タイムアウト、再試行、並行制限・直列処理と、入力やスクロールの debounce/throttle を行います。

```ts
import { core } from '@h-ai/core'

await core.async.delay(1) // タイマーに従い、およそ 1ms 後に完了します。
await core.async.withTimeout(Promise.resolve('ready'), 1000) // 'ready'。タイムアウト時は Error で拒否されます。
await core.async.retry(async () => 'ready', { maxRetries: 3, delay: 10 }) // 初回で 'ready'。
await core.async.parallel([1, 2, 3], async value => value * 2, 2) // [2, 4, 6]。同時に最大 2 件を処理します。
await core.async.serial([1, 2, 3], async value => value * 2) // [2, 4, 6]。入力順に 1 件ずつ処理します。

// どちらのラッパーも、コールバックの引数の型を引き継ぎます。
const search = core.async.debounce((term: string) => core.logger.debug('Search requested', { term }), 100)
const scroll = core.async.throttle((position: number) => core.logger.debug('Scroll position', { position }), 100)
core.logger.setLevel('debug')
search('orders') // その後約 100ms 入力がなければ、'orders' でコールバックを呼び出します。
scroll(100) // 初回はすぐに実行し、続く 100ms の呼び出しは飛ばします。
```

- `withTimeout()` はタイムアウト時に待機中の Promise を拒否します。元の処理を中止する場合は、呼び出し側で中止を管理します。
- `retry()` は処理が例外を投げるか Promise が拒否された場合に再試行します。`maxRetries` には初回も含まれ、既定では 1000 ミリ秒間隔で最大 3 回実行します。失敗を示す `HaiResult` が返った場合は呼び出し側で処理します。
- `parallel()` の結果は入力順に並びます。同時実行数には正の安全な整数を指定します。無効な値の場合は処理を始める前に `RangeError` で拒否されます。ある処理が拒否されても、他のワーカーは残りの処理を続ける場合があります。

### 日時：`core.time`

タイムスタンプ、Date、表示テキストを変換し、地域時刻の日付境界と相対時間を計算します。

```ts
import { core } from '@h-ai/core'

// 日付の計算には実行環境のローカルタイムゾーンを使います。
const date = new Date(2026, 0, 1, 12, 0, 0)
core.time.formatDate(date, 'YYYY-MM-DD HH:mm:ss') // '2026-01-01 12:00:00'
core.time.formatDate(date, 'MM/DD (MM-DD)') // '01/01 (01-01)'

core.i18n.setGlobalLocale('ja-JP')
core.time.timeAgo(new Date(Date.now() - 120_000)) // '2分前'
core.time.now() // 現在の Unix タイムスタンプ（ミリ秒）。
core.time.nowSeconds() // 現在の Unix タイムスタンプ（秒未満は切り捨て）。

const parsed = core.time.parseDate('2026-01-01T00:00:00Z')
parsed.toISOString() // '2026-01-01T00:00:00.000Z'
core.time.isValidDate(parsed) // true
core.time.addDays(date, 7) // 2026-01-08 12:00:00
core.time.addHours(date, 2) // 2026-01-01 14:00:00
core.time.startOfDay(date) // 2026-01-01 00:00:00.000
core.time.endOfDay(date) // 2026-01-01 23:59:59.999
```

`formatDate()` の既定形式は `YYYY-MM-DD` です。テンプレート内の日付の置換記号は、同じものが複数あってもすべて置き換えます。`parseDate()` は標準の `Date` で解析します。結果は `isValidDate()` で確認でき、環境間で日時を渡す場合はタイムゾーン付きの ISO 文字列を使います。`addDays()` と `addHours()` はローカル時刻に沿って計算するため、夏時間の切り替えをまたぐと実際の経過時間が変わることがあります。

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
