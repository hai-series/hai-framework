# Core の導入と設定 API

<!-- translation: partial -->

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

## その他の Core API

ログ、リクエストのコンテキスト、エラー、翻訳、モジュールの起動・停止、アクセス制御、汎用関数は [Core 完全版リファレンス](core.md#api-reference)（中国語）を参照してください。
