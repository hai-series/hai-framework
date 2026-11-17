# Core API リファレンス

[中文完整参考](core.md) · [English](core.en.md) · [Core の設定](../configuration/core.ja.md) · [Core のデータ](../data/core.ja.md)

<a id="quick-start"></a>

## 最小構成で使う

`pnpm add @h-ai/core` でインストールします。Node.js アプリに `config/_core.yml` を作成します。

```yaml schema=@h-ai/core:CoreConfigSchema
name: Orders
defaultLocale: ja-JP
```

```ts
import type { CoreConfig } from '@h-ai/core'
import { core } from '@h-ai/core'

core.init({ configDir: './config' })
const settings = core.config.getOrThrow<CoreConfig>('core')
core.i18n.setGlobalLocale(settings.defaultLocale)
core.logger.info('Application ready', { app: settings.name })
```

Core は指定したディレクトリの直下にある YAML を読み込みます。`_core.yml` は `core`、`app.yml` は `app` という名前で保存されます。上の例では、必須の Core 設定を取得できないと起動を中止します。ブラウザーではページのコードから `core.init({ logging: { level: 'warn' } })` のようにログ設定を渡します。ページでアプリ名が必要な場合、サーバーのページデータにその項目だけを含めます。

<a id="api-reference"></a>
<a id="config-api"></a>

## 設定 API

ファイルと環境変数を扱う以下の API は Node.js 用です。`name` は Core に保存した設定の名前です。たとえば `config/app.yml` は `app` です。例の `AppSchema` は、`zod` の `z` で作成した `z.object({ port: z.number().int().positive() })` を想定しています。

| API                                          | 用途                                               | 引数と既定値                                                                                                                                                                                   | 戻り値・失敗                                                                                                     | 例                                                                                                                                 |
| -------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `core.init(options?)`                        | 起動時にログを設定し、YAML を読み込む              | `configDir` を省略するとファイルを読み込みません。`configSchemas` で名前ごとの型を渡せます。`watchConfig` は既定で `false`。明示した `logging` が YAML より優先されます                        | `void`。個別ファイルの失敗はログに記録して続行します。ディレクトリやログの初期化エラーは例外になる場合があります | `core.init({ configDir: './config', configSchemas: { app: AppSchema }, watchConfig: true })`                                       |
| `core.config.loadEnvFiles(options)`          | dotenv ファイルと既存の環境変数をまとめる          | `mode` は必須。`envDir` の既定値は作業ディレクトリ                                                                                                                                             | `HaiResult<Record<string, string>>`。アプリが `data` を `process.env` に書き込みます                             | `core.config.loadEnvFiles({ mode: 'dev' })`                                                                                        |
| `core.config.load(name, filePath, schema?)`  | 1 ファイルを読み込み、環境変数で上書きする         | `name` と `filePath` は必須。`schema` を省略すると解析と置換のみ行います                                                                                                                       | `HaiResult<T>`。失敗時は直前に保存した値を保持します                                                             | `core.config.load('app', './config/app.yml', AppSchema)`                                                                           |
| `core.config.validate(name, schema)`         | 最後に読み込んだ YAML を現在の環境変数で検証し直す | 両方必須。変更したファイルを読み直すには `reload()` を使います                                                                                                                                 | `HaiResult<T>`。成功時は値と今後の再読み込みに使う検証ルールを保存します                                         | `core.config.validate('app', AppSchema)`                                                                                           |
| `core.config.get<T>(name)`                   | 保存済みの設定を読む                               | `name` は必須。`T` は TypeScript で使う型です                                                                                                                                                  | `T` または `undefined`                                                                                           | `core.config.get<{ port: number }>('app')`                                                                                         |
| `core.config.getOrThrow<T>(name)`            | 処理の続行に必要な設定を読む                       | `name` は必須                                                                                                                                                                                  | `T`。未読み込みなら例外になります                                                                                | `core.config.getOrThrow<{ port: number }>('app')`                                                                                  |
| `core.config.has(name)`                      | 指定の設定が読み込まれたか調べる                   | `name` は必須                                                                                                                                                                                  | `boolean`                                                                                                        | `core.config.has('app')`                                                                                                           |
| `core.config.keys()`                         | 読み込み済みの設定名を一覧にする                   | 引数なし                                                                                                                                                                                       | `string[]`                                                                                                       | `core.config.keys()`                                                                                                               |
| `core.config.reload(name)`                   | ファイルを読み直し、監視中のコールバックへ知らせる | `name` は必須                                                                                                                                                                                  | `HaiResult<unknown>`。設定名が未読み込みなら `CONFIG_NOT_LOADED`。失敗時は以前の値を保持します                   | `core.config.reload('app')`                                                                                                        |
| `core.config.watch<T>(name, callback)`       | ファイルの変更後に再読み込みする                   | 両方必須。`T` は既定で `unknown`。コールバックは成功時に新しい値、失敗時に `null` とエラーを受け取ります                                                                                       | この登録を解除する関数。設定名が未読み込みの場合はすぐに `CONFIG_NOT_LOADED` を通知します                        | `const stop = core.config.watch('app', (_value, error) => { if (error) core.logger.warn('Reload failed', { code: error.code }) })` |
| `core.config.isWatching(name)`               | ファイル監視が稼働中か調べる                       | `name` は必須                                                                                                                                                                                  | `boolean`                                                                                                        | `core.config.isWatching('app')`                                                                                                    |
| `core.config.unwatch(name?)`                 | 監視を止め、現在の値を保持する                     | `name` を省略すると全件停止                                                                                                                                                                    | `void`                                                                                                           | `core.config.unwatch('app')`                                                                                                       |
| `core.config.clear(name?)`                   | 保存済みの設定を消して監視を止める                 | `name` を省略すると全件削除                                                                                                                                                                    | `void`。ディスク上のファイルはそのままです                                                                       | `core.config.clear('app')`                                                                                                         |
| `core.config.resolve(options)`               | メモリ上で環境変数による置換を行う                 | `name` と `value` は必須。`environment` は既定で `process.env`。`schema` または `shape` で項目の型を渡せます。`missing` は既定で `'error'`、`'empty'` では未設定の変数を空文字列に置き換えます | `HaiResult<unknown>`。用途に応じてアプリが値を検証します                                                         | `core.config.resolve({ name: 'app', value: { port: 3000 }, environment: { HAI_APP_PORT: '4000' } })`                               |
| `core.config.toEnv(options)`                 | 設定を環境変数へ変換する                           | `prefix` と `value` は必須。`schema` または `shape` は任意                                                                                                                                     | `Record<string, string>`。名前が不正なら例外になります                                                           | `core.config.toEnv({ prefix: 'HAI_APP', value: { port: 3000 } })`                                                                  |
| `core.config.mergeEnv(layers)`               | 変数を優先順位に従ってまとめる                     | 優先度が低い順にオブジェクトを渡す                                                                                                                                                             | `Record<string, string>`                                                                                         | `core.config.mergeEnv([{ HAI_APP_PORT: '3000' }, { HAI_APP_PORT: '4000' }])`                                                       |
| `core.config.parseEnv(text)`                 | dotenv の文字列を変数に変換する                    | `text` は必須                                                                                                                                                                                  | `Record<string, string>`。重複キーや生成用 JSON マーク付きの不正な値は例外になります                             | `core.config.parseEnv('HAI_APP_PORT=3000\n')`                                                                                      |
| `core.config.stringifyEnv(values, options?)` | 変数を dotenv テキストに変換する                   | `values` は必須。`target` は既定で `'node'`。Compose 用には `'compose'` を指定                                                                                                                 | 文字列。名前が不正なら例外になります                                                                             | `core.config.stringifyEnv({ HAI_APP_PORT: '3000' })`                                                                               |

`HaiResult` は `success` を確認してから `data` を使います。再読み込みで更新されるのは Core に保存された値です。データベースなど起動時に設定を取得するモジュールには、アプリ側で新しい値を反映します。

## Node とブラウザーでの設定

Node では YAML や dotenv を読み込み、ファイルを監視できます。ブラウザーで使う公開設定は、ビルド時に指定するかサーバーから受け取ります。ファイル操作は `SERVICE_UNAVAILABLE` を返し、`getOrThrow()` は例外を送出します。監視コールバックにはすぐ失敗が通知されます。

モジュールの初期化前に dotenv の値を読み込んでください。優先順位はプロセスの環境変数、モード別ローカル、ローカル、モード別、基本ファイルの順です。戻り値の変数は必要に応じて明示的に反映します。YAML のプレースホルダーを展開した後、たとえば `HAI_APP_PORT` を `app.port` に反映します。親に JSON を設定するとそのノードを置き換え、同じ優先順位の子キーが親を上書きします。空文字列も指定値です。環境値や JSON から渡したプレースホルダーは展開されません。`resolve()` の結果は別途検証してください。再読み込みで更新されるのは Core 内の値なので、利用側でも明示的に反映し、監視が不要になったら解除します。dotenv の生成結果にある `# hai:json` は保持してください。

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

`config/app.yml` に `port: 3000` があれば、`HAI_APP_PORT` による上書きがない限り 3000 をログに出します。読み込みや検証に失敗したらリクエストを受け付ける前に終了します。

<a id="logging-api"></a>

## ログ

`core.logger` は既定で `info` 以上を `pretty` 形式で出力します。ログ収集基盤へ送る場合は `format: 'json'` を指定します。Node で任意依存の `pino-pretty` を使用できない場合も JSON 形式になります。ブラウザーでは開発者コンソールに出力します。設定したレベルより低いメッセージは出力されません。名前付きロガーは、明示的な設定がなければ全体設定を継承します。子ロガーには固定フィールドを追加できます。リクエスト情報を付け、機密値をマスクしてから出力します。

監視コールバックは、レベル判定とマスク処理を通過したログを受け取ります。記録件数などに上限を設けてください。コールバックの例外や即時の再帰呼び出しは他のログ処理から分離されます。戻り値の関数で購読を解除できます。

| API | 用途 | 引数と既定値 | 結果 | 例 |
| --- | --- | --- | --- | --- |
| `core.logger.trace()`、`debug()`、`info()`、`warn()`、`error()`、`fatal()` | 指定レベルでログを出力 | メッセージと任意の追加フィールド。既定の下限は `info`。 | `void` | `core.logger.warn('Retry scheduled', { attempt: 2 })` |
| `core.logger.create(options?)` | 名前付きロガーを作成 | 名前、レベル、形式、コンテキストは省略可。未指定の項目は全体設定を継承。 | `Logger` | `const orders = core.logger.create({ name: 'orders' })` |
| `core.logger.child(fields)` | 子ロガーにフィールドを固定 | 追加するフィールド | `Logger` | `core.logger.child({ requestId: 'req-1' })` |
| `core.logger.configure(options)` | 全体の形式とマスク規則を変更 | ログ設定 | `void` | `core.logger.configure({ format: 'json', redact: ['customer.email'] })` |
| `core.logger.setLevel(level)`、`getLevel()` | 出力レベルを設定・取得 | 設定時はレベルを指定。取得時は引数なし。 | `void` / `LogLevel` | `core.logger.setLevel('warn')`、`core.logger.getLevel()` |
| `core.logger.observe(callback)` | マスク済みログを購読 | ログレコードを受け取る関数 | `() => void` | `const stop = core.logger.observe(record => { recentMessages.push(record.message) })` |

<a id="context-api"></a>

## リクエストコンテキスト

`core.context.run()` に `requestId`、`userId`、`scopeId`、`jobId` などの追跡項目を渡します。Node では `await` をまたいでもリクエストごとに値が保持されます。ブラウザーで保持されるのは同期処理中だけです。ロガーは現在の値を自動で付加します。利用者やテナントの識別子は信頼できるサーバー側の処理で取得してください。収集処理自体の診断ログを出すときは、`suppressLogObservers: true` を指定すると監視コールバックへの再通知を抑制できます。

| API | 用途 | 引数と既定値 | 結果 | 例 |
| --- | --- | --- | --- | --- |
| `core.context.run(context, operation)` | リクエストやタスクのコンテキストで実行 | 追跡項目とコールバック。ログ監視は既定で有効。 | コールバックの戻り値 | `await core.context.run({ requestId: 'req-1' }, async () => core.context.get().requestId)` |
| `core.context.get()` | 現在の値を取得 | 引数なし | 空の場合は `{}` | `const { requestId } = core.context.get()` |

<a id="sanitize-api"></a>

## 機密情報のマスク

診断情報を保存したり利用者へメッセージを返したりする前に使います。標準の規則は認証情報のフィールドをマスクします。業務固有の項目に独自の規則を使う場合は、先に標準の処理を適用してください。処理はデータのコピーを対象とし、クラスの getter や独自の `toJSON()` は実行しません。日付は ISO 文字列、URL はマスク済みの文字列になります。ラベルなしの機密値もテキストから取り除くには、その値を明示的に渡してください。通常のオブジェクトのコピーには循環参照が残ることがあります。

| API | 用途 | 引数と既定値 | 結果 | 例 |
| --- | --- | --- | --- | --- |
| `core.sanitize.isSensitiveKey(key, matcher?)` | 機密フィールド名か判定 | キーと任意の判定規則 | `boolean` | `core.sanitize.isSensitiveKey('apiKey')` |
| `core.sanitize.sanitizeSensitiveValue(value, key, options?)` | 値を一つマスク | 値、キーまたは `null`、任意の置換値（既定は `[REDACTED]`） | 値 | `core.sanitize.sanitizeSensitiveValue('example-only', 'password')` |
| `core.sanitize.sanitizeSensitiveFields(value, options?)` | 構造データをコピーしてマスク | 値、任意の判定規則と置換値 | マスク済みコピー | `core.sanitize.sanitizeSensitiveFields({ password: 'example-only' })` |
| `core.sanitize.sanitizeUrl(url, options?)` | URL の認証情報をマスク | URL、任意のマスク設定 | `string` / `(invalid url)` | `core.sanitize.sanitizeUrl('https://example.com/?token=example-only')` |
| `core.sanitize.sanitizeText(text, secretValues?)` | 認証情報を含む文字列をマスク | 文字列と既知の機密値（既定は `[]`） | `string` | `core.sanitize.sanitizeText('Bearer example-only')` |
| `core.sanitize.defaultSensitiveKeyRegex`、`defaultSensitiveReplacement` | 組み込みの判定規則と置換値を参照 | 読み取り専用定数 | `RegExp` / `string` | `const replacement = core.sanitize.defaultSensitiveReplacement` |

<a id="error-api"></a>

## 結果とエラー

業務処理の呼び出し元は、`data` や `error` を読む前に `result.success` を確認します。エラーコードは共通の定義にまとめ、発生時にメッセージを翻訳します。HTTP で返す前に `core.error.toPublic()` で内部の原因情報を除去します。公開可能なエラーを返し、追跡 ID を使ってサーバーログと照合できます。`ok` と `err` は `@h-ai/core` から直接インポートします。

| API | 用途 | 引数と既定値 | 結果 | 例 |
| --- | --- | --- | --- | --- |
| `core.error.buildHaiErrorsDef(module, codes)` | モジュールの安定したエラーコードを定義 | モジュール名とエラー名・コード・HTTP ステータスの対応 | エラー定義 | `const errors = core.error.buildHaiErrorsDef('orders', { NOT_FOUND: '300:404' })` |
| `core.error.buildHaiErrorInst(def, message, cause?, suggestion?)` | 失敗にメッセージを付加 | 定義、メッセージ、任意の原因と対処案 | `HaiError` | `const error = core.error.buildHaiErrorInst(errors.NOT_FOUND, 'Order not found')` |
| `core.error.toPublic(error, traceId?)` | クライアントに返すエラーを整形 | エラーと任意の追跡 ID | 公開用エラー | `core.error.toPublic(error, 'req-1')` |
| `core.error.formatMessage(error)` | 表示メッセージを整形 | メッセージと任意の追跡 ID | `string` | `core.error.formatMessage(error)` |
| `ok(data)`、`err(def, message, cause?)` | 業務処理の結果を構築 | 成功時のデータ、またはエラー定義とメッセージ（完成したエラーも可） | `HaiResult` | `ok({ id: 'order-1' })`、`err(errors.NOT_FOUND, 'Order not found')` |

<a id="i18n-api"></a>

## メッセージと言語

メッセージは、呼び出し時に指定した言語、Node の現在のリクエスト言語、全体の言語の順に選ばれます。未対応の言語や辞書が存在しない場合は `zh-CN` に切り替わります。`zh`、`en`、`ja` はそれぞれ地域付きの言語コードに正規化されます。キーがなければキー自身を返し、置換値を省くとプレースホルダーは文字列に残ります。アプリ固有のメッセージには別の辞書を用意してください。

| API | 用途 | 引数と既定値 | 結果 | 例 |
| --- | --- | --- | --- | --- |
| `core.i18n.setGlobalLocale(locale)`、`getGlobalLocale()` | 既定の言語を設定・取得 | 設定時に言語を指定。初期値は `zh-CN`。 | `void` / 言語コード | `core.i18n.setGlobalLocale('ja-JP')`、`core.i18n.getGlobalLocale()` |
| `core.i18n.runWithLocale(locale, operation)` | Node の処理中だけ言語を指定 | 言語と関数 | 関数の戻り値 | `await core.i18n.runWithLocale('en-US', async () => core.i18n.coreM('core_errorNotFound'))` |
| `core.i18n.createMessageGetter(dictionaries)` | メッセージ取得関数を作成 | 言語ごとの辞書 | `(key, options?) => string` | `const message = core.i18n.createMessageGetter({ 'zh-CN': { welcome: 'ようこそ' } })` |
| `core.i18n.coreM(key, options?)` | 組み込みメッセージを取得 | キー、任意の言語と置換パラメーター | `string` | `core.i18n.coreM('core_errorNotFound', { locale: 'en-US' })` |
| `core.i18n.DEFAULT_LOCALE`、`DEFAULT_LOCALES` | 対応言語を参照 | 読み取り専用定数 | 言語と候補一覧 | `const choices = core.i18n.DEFAULT_LOCALES` |

<a id="validation-api"></a>

## 入力検証メッセージ

Zod v3/v4 の検証結果をフィールドごとのメッセージに変換します。配列の位置は `items.0.email` のように表し、フォーム全体には `_` を使います。独自メッセージはそのまま返されます。取得関数で共通メッセージのキーと自分の辞書を対応付けます。

| API | 用途 | 引数と既定値 | 結果 | 例 |
| --- | --- | --- | --- | --- |
| `core.zodValidation.createPrefixedZodMessageGetter(prefix, message)` | モジュールのメッセージキーに接頭辞を付ける | 接頭辞とメッセージ取得関数 | 取得関数 | `const translate = core.zodValidation.createPrefixedZodMessageGetter('core', message)` |
| `core.zodValidation.mapZodErrorToFormErrors(error, message)` | Zod の問題を入力項目に対応付ける | 検証エラーと調整済みの取得関数 | `{ field, message }[]` | `core.zodValidation.mapZodErrorToFormErrors(parsed.error, translate)` |

<a id="module-api"></a>

## モジュールの起動と終了

`core.module.createRuntime()` は起動・終了を管理するオブジェクトを返します。依存先を順番に初期化するには `start()`、終了時に逆順で解放するには `close()` を呼び出します。起動に失敗すると解放処理に進みます。解放に失敗した場合は、使用中の依存先を残し、次の終了または起動時に再試行します。同時に起動した場合は処理を共有します。どちらも `HaiResult` を確認してください。処理ごとに `enabled` で対象に含める条件を指定できます。

| API | 用途 | 引数と既定値 | 結果 | 例 |
| --- | --- | --- | --- | --- |
| `core.module.createRuntime(steps)` | 依存先の起動と終了を管理 | 名前、起動・終了関数、任意の有効化条件を持つ手順 | `ModuleRuntime`, each call returns `Promise<HaiResult<void>>` | `const runtime = core.module.createRuntime([{ name: 'cache', start: () => cache.init({ type: 'memory' }), close: () => cache.close() }])` |
| `core.module.createNotInitializedKit(error, message?)` | 初期化前のエラーと代理メソッドを用意 | エラー定義と任意のメッセージ取得関数。代理メソッドは既定で非同期。 | `error()`, `result()`, `proxy()` | `core.module.createNotInitializedKit(HaiCommonError.NOT_INITIALIZED, () => 'Initialize the module first')` |
| `core.module.requiresSharedState(environment)` | 共有バックエンドが必要か判定 | 環境値。本番設定での明示的な E2E 実行は除外できる。 | `boolean` | `core.module.requiresSharedState(process.env)` |

<a id="access-api"></a>

## Node のリクエストアクセス判定

HTTP サーバーから渡された接続元アドレスを使用し、信頼するプロキシだけをリストに含めてください。起動時にアドレスと時間帯のルールを読み込み、リクエストごとに判定関数を実行できます。許可・拒否、該当するルール、リクエスト暗号化の方針を取得できます。プロキシの既定値は `auto` です。転送ヘッダーを使う前にマネージド環境での扱いを確認してください。不正なポリシーは起動時に例外になります。別ファイルでポリシーを読み込んでいる場合は、更新後に再起動します。

| API | 用途 | 引数と既定値 | 結果 | 例 |
| --- | --- | --- | --- | --- |
| `core.access.normalizeClientIp(value?)` | IPv4 または IPv6 を正規化 | 任意のアドレス文字列 | `string` / `undefined` | `core.access.normalizeClientIp('::ffff:198.51.100.23')` |
| `core.access.createClientIpResolver(trustedProxies?)` | 接続元アドレスの取得関数を作成 | 信頼するプロキシの設定（既定は `auto`） | `(request, remoteAddress?) => string` or `undefined` | `const resolve = core.access.createClientIpResolver(['192.0.2.10'])` |
| `core.access.createConditionCheck(condition)` | アドレスと時間帯の条件を準備 | アドレスリストと時間帯を指定した条件 | `(ip?) => AccessDecision` | `core.access.createConditionCheck({ allowIps: [], denyIps: [], timezone: 'UTC', windows: [] })` |
| `core.access.createRequestCheck(input?)` | リクエストポリシーを準備 | ルール、ファイル参照、または `false`。省略時は無効。 | `RequestAccessCheck` | `core.access.createRequestCheck({ file: './config/security/request-access.yml' })` |
| `core.access.loadPolicy(input?, baseDirectory?)` | ポリシーを読み込んで検証 | ポリシーと基準ディレクトリ（既定は作業ディレクトリ） | `RequestAccessPolicy` / `false` | `core.access.loadPolicy({ file: './config/security/request-access.yml' })` |

[リクエストポリシーの設定](../configuration/core.ja.md#request-access)

<a id="id-api"></a>

## 識別子

識別子は記録の特定や操作の追跡に使います。認証情報には専用の生成機能を使用してください。安全な乱数が得られない場合、UUID の生成は例外になります。

| API | 引数・既定値と戻り値 | 例 |
| --- | --- | --- |
| `core.id.generate(size?)`, `short()` | ランダム ID。既定は 21 文字、短縮版は 10 文字。 | `generate(8)` |
| `core.id.withPrefix(prefix, size?)`, `trace()`, `request()` | 接頭辞とランダム ID。追跡とリクエストには `trace-` と `req-` を使う。 | `withPrefix('order_')` |
| `core.id.uuid()`, `isValidUUID(value)`, `isValidNanoId(value, size?)` | UUID v4 を作成するか、文字列が指定形式に合うかを返す。 | `isValidUUID(core.id.uuid())` |

<a id="type-api"></a>

## 型ガード

これらの判定関数で TypeScript の型を絞り込めます。業務データの検証にはスキーマを使います。

| API | 引数・既定値と戻り値 | 例 |
| --- | --- | --- |
| `core.typeUtils.isDefined(value)`, `isObject(value)` | 前者は null と undefined を除外。後者は配列と null を除外し、インスタンスは受け付ける。 | `isDefined(null)` → `false` |
| `core.typeUtils.isFunction(value)`, `isPromise(value)` | 関数または Promise であるかを返す。 | `isPromise(Promise.resolve())` → `true` |
| `core.typeUtils.isString(value)`, `isNumber(value)`, `isBoolean(value)`, `isArray(value)` | プリミティブ値または配列を判定。数値の判定では `NaN` を除外する。 | `isNumber(NaN)` → `false` |

<a id="object-api"></a>

## オブジェクト

`deepClone` は `structuredClone` を使い、日付、Map、Set、循環参照をコピーできます。関数などコピーできない値は例外になります。`deepMerge` が再帰的に結合するのはプレーンオブジェクトだけで、配列、日付、コレクション、インスタンスは後の値で置き換えます。

| API | 引数・既定値と戻り値 | 例 |
| --- | --- | --- |
| `core.object.deepClone(value)`, `deepMerge(target, ...sources)` | 元の値を変更せずにコピーまたは結合結果を返す。 | `deepMerge({ a: 1 }, { a: 2 })` → `{ a: 2 }` |
| `core.object.pick(value, keys)`, `omit(value, keys)` | 指定キーだけを持つオブジェクト、または指定キーを除いたオブジェクトを返す。 | `pick({ a: 1, b: 2 }, ['a'])` → `{ a: 1 }` |
| `core.object.keys(value)`, `values(value)`, `entries(value)`, `fromEntries(entries)` | 型付きのキー、値、キーと値の組の配列を取得するか、組からオブジェクトを作る。 | `fromEntries([['mode', 'local']])` → `{ mode: 'local' }` |

<a id="string-api"></a>

## 文字列

Node では長さが等しい UTF-16 のバイト列をネイティブ関数で定時間比較します。ブラウザーでは定時間性を保証できないため、認証情報の比較はサーバーで行ってください。

| API | 引数・既定値と戻り値 | 例 |
| --- | --- | --- |
| `core.string.capitalize()`, `kebabCase()`, `camelCase()`, `snakeCase()`, `pascalCase()` | 文字列の表記を変換。 | `kebabCase('helloWorld')` → `'hello-world'` |
| `core.string.truncate(value, length, suffix?)`, `trim(value)` | 接尾辞（既定は `'...'`）を付けて短縮するか前後の空白を除去。 | `truncate('abcdef', 3)` → `'abc...'` |
| `core.string.isBlank(value)`, `isNotBlank(value)` | 空白だけか、有効な文字を含むかを判定。 | `isBlank(' ')` → `true` |
| `core.string.padStart(value, length, char?)`, `padEnd(value, length, char?)` | 指定の長さまで埋める。既定の文字は空白。 | `padStart('5', 3, '0')` → `'005'` |
| `core.string.constantTimeEqual(left, right)` | 二つの文字列を比較。長さが異なる場合はすぐ false を返す。 | `constantTimeEqual('a', 'a')` → `true` |

<a id="array-api"></a>

## 配列

入力配列は変更されません。分割サイズは正の安全な整数を指定してください。不正なサイズには空配列を返します。グループキーには `constructor` なども指定できます。

| API | 引数・既定値と戻り値 | 例 |
| --- | --- | --- |
| `core.array.unique(items)`, `chunk(items, size)`, `groupBy(items, key)` | 重複を除く、配列に分割する、またはキー取得関数でグループ化する。 | `chunk([1, 2, 3], 2)` → `[[1, 2], [3]]` |
| `core.array.first(items)`, `last(items)` | 先頭または末尾を取得。空配列は `undefined`。 | `last([1, 2])` → `2` |
| `core.array.flatten(items)`, `compact(items)`, `shuffle(items)` | 一段だけ平坦化する、null と undefined を除く、または順序を無作為化したコピーを返す。 | `compact([0, null, 1])` → `[0, 1]` |
| `core.array.intersection(a, b)`, `difference(a, b)` | 両方にある要素、または一つ目にだけある要素を返す。 | `intersection([1, 2], [2, 3])` → `[2]` |

<a id="async-api"></a>

## 非同期処理

タイムアウトすると待機中の Promise が拒否されます。元の処理のキャンセルは呼び出し側で行います。再試行の対象は例外と拒否された Promise です。失敗した `HaiResult` は別途確認してください。並行処理の結果は入力順です。並行数の既定値は 5 です。一件が失敗しても他のワーカーはすぐには停止しません。

| API | 引数・既定値と戻り値 | 例 |
| --- | --- | --- |
| `core.async.delay(ms)`, `withTimeout(promise, ms)` | 指定時間だけ待つか、Promise の待機時間を制限する。 | `await core.async.delay(10)` |
| `core.async.retry(operation, options?)` | 初回を含め既定で最大 3 回、間隔は 1000 ミリ秒。 | `await core.async.retry(async () => 'ready', { maxRetries: 2, delay: 10 })` |
| `core.async.parallel(items, action, concurrency?)`, `serial(items, action)` | 上限付きの並行処理または逐次処理。不正な並行数は `RangeError`。 | `await core.async.parallel([1, 2], async n => n * 2, 2)` → `[2, 4]` |
| `core.async.debounce(callback, ms)`, `throttle(callback, ms)` | 引数の型を保つ関数を返す。デバウンスは呼び出しが止まってから実行し、スロットルは間隔中に一度だけ実行する。 | `core.async.debounce((term: string) => search(term), 100)` |

<a id="time-api"></a>

## 日付と時刻

暦の演算には実行環境のタイムゾーンを使います。夏時間の切り替えで実経過時間が変わることがあります。システム間ではオフセット付き ISO 日時を渡してください。

| API | 引数・既定値と戻り値 | 例 |
| --- | --- | --- |
| `core.time.formatDate(date, format?)`, `timeAgo(date)` | 現地時刻（既定は `YYYY-MM-DD`）または翻訳済み相対時刻を返す。 | `formatDate(new Date(2026, 0, 1))` → `'2026-01-01'` |
| `core.time.now()`, `nowSeconds()` | UNIX 時刻をミリ秒または秒の整数で取得。 | `core.time.nowSeconds()` |
| `core.time.parseDate(value)`, `isValidDate(date)` | Date を作成し、有効な日時か確認。 | `isValidDate(core.time.parseDate('2026-01-01T00:00:00Z'))` |
| `core.time.addDays(date, days)`, `addHours(date, hours)`, `startOfDay(date)`, `endOfDay(date)` | 現地時刻で加算した日時、または当日の開始・終了日時を返す。 | `startOfDay(new Date(2026, 0, 1, 12))` |

## エラー処理

業務操作から `HaiResult` が返ったら、先に `success` を確認します。例外を送出する同期関数や拒否される Promise は、それぞれの契約に従って処理してください。ログにはコードと追跡 ID を記録し、内部情報を応答に含めないでください。
