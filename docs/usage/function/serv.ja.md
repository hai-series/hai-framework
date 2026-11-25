# @h-ai/serv API リファレンス

<!-- translation: partial -->

[原文（中国語）](serv.md) · [設定](../configuration/serv.ja.md) · [データ構造](../data/serv.ja.md)

<a id="quick-start"></a>

## クイックスタート

<a id="module-dependencies"></a>

### 依存関係

| 依存先 | 用途 | 利用条件 | 初期化順序 |
| --- | --- | --- | --- |
| Node.js | ポートの待ち受けと WebSocket のアップグレードを実行 | `serv.listen()` を使う場合 | アプリ作成後に待ち受けを開始。Fetch 対応の実行環境では `serv.toFetch()` を使用可能 |
| `@h-ai/api-contract` | クライアントとサーバーが共有する HTTP 契約を定義 | Serv とともにインストール。`serv.createApp()` に契約が必要 | 契約とハンドラーを定義してから `serv.createApp()` に渡す |
| `zod` | 独自契約のリクエストとレスポンスのスキーマを定義 | Serv とともにインストール。独自契約を定義する場合は直接インポート | スキーマを定義してから契約を組み立てる。既存の契約はそのまま組み合わせ可能 |
| `@h-ai/core` | リクエストコンテキスト、ログ、結果型を提供 | Serv とともにインストール | Core から待ち受け設定を取得する場合は先に設定を読み込む |
| `@h-ai/audit` | Serv が捕捉した監査イベントを記録 | Serv とともにインストール。監査を有効にする場合に初期化 | リクエストの受付前に `capture` を指定して Audit を初期化 |
| `@h-ai/crypto` | HTTP リクエストとレスポンスを暗号化 | Serv とともにインストール。`transport` を有効にする場合に必要 | Crypto を初期化し、キーリングと共有の鍵登録ストアを用意してから `serv.createApp()` に渡す |
| `@h-ai/iam` | IAM ルート、トークン検証、セッション更新を提供 | 標準 IAM ルートまたは IAM による検証や更新を使う場合 | IAM を初期化してから `serv.createIamProcedures()` または `serv.createApp()` に渡す |
| `@h-ai/storage`、`@h-ai/ai`、`@h-ai/feedback` | 各機能の組み込みルートを提供。AI は音声処理も提供 | 公開する機能に応じて選択 | 選択したサービスを初期化してから各ルートのファクトリーに渡す。音声は `serv.createApp()` の `audio` オプションで有効にする |

### 利用例

```sh
pnpm add @h-ai/serv @h-ai/core @h-ai/api-contract @h-ai/iam @h-ai/storage @h-ai/ai
```

Serv は型付き HTTP 契約を独立した Node サーバーに配置します。待ち受けを始める前に、認証、通信暗号化、信頼できるリクエスト情報の取得を設定します。
ルートから読み込んだ `serv` で IAM、Storage、AI、Feedback の標準ハンドラーを作成できます。

```ts
import { ai } from '@h-ai/ai'
import { apiContract } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { type ServConfig, serv } from '@h-ai/serv'
import { storage } from '@h-ai/storage'

export function startApi(closeApp: () => Promise<void>) {
  // IAM、Storage、AI のルート契約をまとめます。
  const contract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

  // 初期化済みのサービスをルートに結び付け、Storage のキーごとに権限を確認します。
  const procedures = {
    iam: serv.createIamProcedures({ iam }),
    storage: serv.createStorageProcedures({
      storage,
      authorize: ({ context, keys }) => keys.every(key =>
        key.startsWith(`users/${encodeURIComponent(context.session.userId)}/`)),
    }),
    ai: serv.createAiProcedures({ ai }),
  }

  // HTTP アプリを組み立て、API とドキュメントのパスを設定します。
  const app = serv.createApp({
    contract,
    procedures,
    iam,
    http: {
      apiPrefix: '/api/v1',
      openapi: { path: '/openapi.json' },
      docs: { path: '/docs' },
    },
  })

  // 検証済みの待ち受け設定を使い、アドレスと close() を持つハンドルを返します。
  const { server } = core.config.getOrThrow<ServConfig>('serv')
  return serv.listen(app, {
    host: server.host,
    port: server.port,
    onListening: info => core.logger.info('API service listening', { port: info.port }),
    onClose: closeApp,
  })
}
```

<a id="api-reference"></a>

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

<a id="http-app"></a>

### 契約の実装と HTTP の起動：`serv`

共有契約を実装して Fetch アプリを組み立てます。Node の待受は戻された server.close() で閉じます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.createApp(options)` | HTTP アプリを組み立てる | `options`、`contract`、`procedures` が必須。任意項目は[アプリ設定](#host-options)を参照。 | `fetch` と `request` を備えた `ServHttpApp` | `serv.createApp({ contract, procedures })` |
| `serv.listen(app, options?)` | Node の待ち受けを開始 | `app` が必須。[待ち受け設定](#listen-options)は省略可。 | `server`、`address`、非同期 `close()` を備えた `ServNodeServer` | `serv.listen(app, { port: 3001 })` |
| `serv.toFetch(app)` | 供支持 Fetch 的环境使用 | `serv.createApp()` が返す `app` が必須。 | `(request: Request) => Promise<Response>` | `const fetch = serv.toFetch(app)` |
| `serv.implement(contract)` | 实现契约中的路由 | クライアントと共有する型付きルート `contract` が必須。 | `ServImplementer` | `serv.implement(contract)` |

<a id="host-options"></a>

##### アプリ工場の引数と実行時依存

| `options` の項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `contract`、`procedures` | 両方必須。契約と実装のルート構成を一致させる。 | 契約で入出力を定義し、プロシージャーが各ルートを実装する。 |
| `http` | [HTTP の既定値](../configuration/serv.ja.md)を使用 | API、ヘルスチェック、文書のパスとリクエスト方針を設定する。 |
| `middlewares` | 追加のミドルウェアなし | `{ middleware, path? }` の配列。`path` を省略すると全ルートが対象。 |
| `iam` | 初期化済み IAM を任意で指定 | Bearer アクセストークンを検証し、`refreshCookie` の使用時は更新も行う。 |
| `verifyToken` | IAM があればその検証を使用 | `Promise<HaiResult<ServSession>>` を返す独自のアクセストークン検証。 |
| `createContext` | Serv のコンテキストを使用 | リクエストごとのコンテキストと認証済みセッションを自分で構築する。コンテキストの生成時は `verifyToken` と `iam` より優先。 |
| `refreshCookie` | 無効 | ブラウザーの更新 Cookie や信頼済みネイティブのリクエスト方針を指定。IAM の更新機能か `onRefresh` が必要。 |
| `transport` | 無効 | 初期化済み crypto、管理された `serverKeyRing`、共有 `keyStore` を渡して送受信を暗号化する。 |
| `audio` | WebSocket ルートなし | 初期化済み AI と `verifyTicket` を渡して音声ルートを追加。Node の WebSocket アップグレードは `serv.listen()` が処理する。 |

[引数と手順の詳細](serv.md#http-app)

#### 利用例：契約の実装と HTTP の起動

status の契約と処理から JSON 成功応答を得ます。toFetch は関数を返すだけで、listen がポートを開きます。以下に両方と終了手順を示します。

Serv はアプリを組み立てます。Node の待ち受けは listen だけが開始します。ミドルウェア、処理、アダプターでエラーの扱いは異なります。

借りているデータベースやキャッシュを閉じる前に Node の待ち受けを終了します。認証済みセッションとリクエストのメタデータは分けて扱います。

未翻訳：暗号化通信、ストリーミング・音声、ミドルウェアの接続例。[中国語の該当節](serv.md#detailed-workflow)を参照してください。

<a id="listen-options"></a>

#### 利用例：解決済みの待ち受けアドレスを渡す

| `options` の項目 | 省略時 | 指定した場合 |
| --- | --- | --- |
| `host` | `'127.0.0.1'` | ループバックはローカル接続のみ受け付けます。`'0.0.0.0'` はすべての IPv4 インターフェース、特定の IP はそのインターフェースで待ち受けます。 |
| `port` | `3000` | Node の待ち受けポート。`0` では OS が割り当てます。実際の番号は `onListening` の `AddressInfo.port` を参照してください。 |
| `onListening` | 準備完了通知なし | 接続の受け付けを開始すると Node の `AddressInfo` を渡して呼び出します。 |
| `onClose` | 終了シグナルのコールバックなし | 非同期の解放関数を渡すと、`SIGINT` または `SIGTERM` で待ち受けと音声接続を閉じたあと 1 回呼び出します。`close()` を直接呼ぶ場合は呼び出し側で業務リソースを解放します。 |

アプリは環境変数 `HOST`、`PORT` や設定ファイルの `server` から値を解決して `serv.listen()` に明示的に渡せます。省略した項目には待ち受け側の既定値が適用されます。

<a id="authentication"></a>

### 主体の解決とルート保護：`serv`

ヘッダー解析で得た資格情報は未検証です。検証成功後に session を作り、権限やロールを確認します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.parseRequestContext(input)` | 读取追踪编号、语言与访问令牌 | `input.request: Request` が必須。任意の信頼済み `remoteAddress` と解決済み `ip` をリクエスト情報に反映。 | `ServContext` | `serv.parseRequestContext({ request })` |
| `serv.buildAuthContextFactory(verifyToken)` | 构造验证访问令牌的上下文工厂 | アクセストークンを検証し `HaiResult<ServSession>` を返す非同期 `verifyToken(token)` が必須。 | `CreateServContext`; `session` | `serv.buildAuthContextFactory(token => iam.auth.verifyToken(token))` |
| `serv.WILDCARD_PERMISSION` | 在可信策略中表示所有权限 | 読み取り専用定数 | `string` | `const allPermissions = [serv.WILDCARD_PERMISSION]` |
| `serv.WILDCARD_ROLE` | 在可信策略中表示所有角色 | 読み取り専用定数 | `string` | `const allRoles = [serv.WILDCARD_ROLE]` |

#### 利用例：主体の解決とルート保護

実 Request と信頼できる verifyToken を入力し ServContext を得ます。不正な資格情報から認証済み session を作りません。ワイルドカードは信頼する方針用です。

[引数と手順の詳細](serv.md#authentication)

<a id="policies"></a>

### アクセス・CORS・資源の制御：`serv`

配置環境に合わせて許可元と Cookie 方針を決め、各要求と静的資源にも権限を確認します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.cors(config?)` | 处理跨域预检和响应头 | 任意の `config` でオリジン、メソッド、ヘッダー、キャッシュを設定。[HTTP ミドルウェア項目](#serv-middleware-options)を参照。 | `ServMiddleware` | `serv.cors({ origin: 'https://app.example.com', credentials: true })` |
| `serv.createRuntimeSecurityPolicy(input)` | 根据环境确定跨域、Cookie 和接口文档策略 | `input` オブジェクトが必須。本番は明示的な `corsOrigin` が必要。環境とオリジンは[HTTP ミドルウェア項目](#serv-middleware-options)を参照。 | `allowOrigin`; `secureRefreshCookie`; `exposeApiDocs` | `serv.createRuntimeSecurityPolicy({ environment: 'production', corsOrigin: 'https://app.example.com' })` |
| `serv.storageAssets(config)` | Storage の公開リソースを読み取り専用で配信する | Storage、パス、許可するキーと MIME の `config` が必須。[HTTP ミドルウェア項目](#serv-middleware-options)を参照。 | `ServMiddleware` | `serv.storageAssets(assetOptions)` |

<a id="serv-middleware-options"></a>

#### HTTP ミドルウェア項目

| 項目 | 既定値と条件 | 用途と結果 |
| --- | --- | --- |
| `cors.config.origin` | 既定は `"*"` | 単一オリジン、一覧、または `(origin) => boolean` を指定。本番のポリシーは明示した配信元から生成する。 |
| `cors.config.methods` / `allowedHeaders` | 既定は GET、HEAD、PUT、PATCH、POST、DELETE、OPTIONS と下記ヘッダー | 許可するメソッドと要求ヘッダー。プリフライトでは要求された一覧を優先して返す。 |
| `cors.config.exposedHeaders` / `credentials` / `maxAge` | 既定では追加の公開ヘッダーなし、資格情報は `false`、キャッシュは 86,400 秒 | ブラウザーに公開する応答ヘッダー、資格情報、キャッシュ時間。 `X-Request-Id` と `X-Trace-Id` は常に公開対象。 |
| `input.environment` / `corsOrigin` / `nativeOrigins` | `production` では HTTP(S) オリジンの明示が必須 | オリジンはカンマ区切り。本番では既定で更新 Cookie を Secure にし、API 文書を非公開にする。 |
| `storageAssets.config.storage` / `pathPrefix` | 両方必須 | 初期化済み Storage または同等のファイルアダプター。読取時に要求パスから `pathPrefix` を除く。マウントは別途設定。 |
| `storageAssets.config.keyPattern` / `allowedContentTypes` | 両方必須 | Storage キー全体を正規表現で許可し、許可する MIME を指定。 |
| `storageAssets.config.cacheControl` / `crossOriginResourcePolicy` | 既定は `no-store`。クロスオリジン資源ポリシーヘッダーは省略。 | 資源キャッシュを設定し、任意で `same-origin`、`same-site`、`cross-origin` を指定。 |

既定の要求ヘッダーは `Authorization`、`Content-Type`、`X-Requested-With`、`X-Hai-Reauthentication`、`X-Hai-Terminal`。明示的に許可した `https://app.example.com` からのプリフライトには HTTP 204 と一致する `Access-Control-Allow-Origin` が返ります。

#### 利用例：アクセス・CORS・資源の制御

```ts
// Resolve the production policy using this one web origin. The known origin is allowed and the refresh cookie defaults to secure.
const policy = serv.createRuntimeSecurityPolicy({ environment: 'production', corsOrigin: 'https://app.example.com' })
// policy.allowOrigin restricts requests to the explicit origin; secureRefreshCookie is enabled
// Create CORS middleware for the exact app origin with credentials enabled. A mismatched origin gets no allow-origin grant.
const cors = serv.cors({ origin: 'https://app.example.com', credentials: true }) // ServMiddleware
```

明示した本番の許可元から方針とミドルウェアを作ります。生成だけでは許可せず、組み込んだ後の OPTIONS/GET で確認します。資源読み取りと MIME 条件は後述します。

GET は Storage の一回の読み取りから MIME タイプ、ETag、本文を取得します。MIME タイプを拒否した場合や 304 を返す場合はストリームを閉じます。HEAD はメタデータだけを取得します。独自の Storage アダプターは `file.head()` と `file.getStreamWithMetadata()` を実装します。

[引数と手順の詳細](serv.md#policies)

<a id="validation-locales"></a>

### 入力の検証と API 記述：`serv`

要求の言語を選んで入力を検証し、同じ契約から OpenAPI を作ります。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.generateSpec(contract, options?)` | OpenAPI の記述を生成 | 共有 `contract` が必須。任意の `options` には `title`（既定 `hai-framework API`）、`version`（既定 `0.1.0`）、`description`、`apiPrefix`（`servers[0].url` を設定）。 | `Promise<OpenAPI.Document>` | `await serv.generateSpec(contract, { title: 'Orders', version: '1.0.0' })` |
| `serv.validateInputOrFail(schema, input, locale?)` | 校验业务输入并生成字段错误 | Zod `schema` と検証する `input` が必須。検証メッセージの `locale` は既定 `zh-CN`。 | `HaiResult<z.infer<Schema>>` | `serv.validateInputOrFail(InputSchema, input, context.locale)` |
| `serv.resolveRequestLocale(headers)` | 根据 HTTP 请求头选择语言 | `headers` は必須で Headers または文字列マップ。`x-hai-locale`、`Accept-Language` の順に読み、既定 `zh-CN`。 | 规范化的语言标识 | `serv.resolveRequestLocale(request.headers)` |
| `serv.m(key, options?)` | 读取本地化提示 | 登録済みメッセージ `key` が必須。任意の `options.locale` で言語を上書きし、`options.params` で埋め込み値を渡す。 | `string` | `serv.m('serv_errorForbidden', { locale: 'zh-CN' })` |

#### 利用例：入力の検証と API 記述

```ts
import { z } from 'zod'
// Read en-US from the locale header. An unavailable language uses the supported fallback.
const locale = serv.resolveRequestLocale(new Headers({ 'x-hai-locale': 'en-US' })) // 'en-US'
// Validate the supplied Order title under that locale. Success contains the object. Failure carries localized issues.
const checked = serv.validateInputOrFail(z.object({ title: z.string().min(1) }), { title: 'Order' }, locale)
if (!checked.success)
  throw new Error(checked.error.message)
checked.data // { title: 'Order' }
// Resolve the localized forbidden message using the selected request locale.
const denied = serv.m('serv_errorForbidden', { locale }) // localized safe text
// With the contract from quick start:
// 入門例の契約を使い、Orders とバージョン 1.0.0 の OpenAPI 文書を生成します。変換に失敗すると Promise が拒否されます。
const spec = await serv.generateSpec(contract, { title: 'Orders', version: '1.0.0', apiPrefix: '/api/v1' })
spec.servers?.[0]?.url // '/api/v1'。仕様上のサーバー URL。
```

英語ヘッダーと title=Order を入力し、言語と検証済みオブジェクトを得ます。仕様生成は Promise 拒否、入力検証は失敗 HaiResult です。

[引数と手順の詳細](serv.md#validation-locales)

<a id="integrations"></a>
<a id="audio-options"></a>

### 暗号・音声・フィードバックの接続：`serv.createApp`

これらは createApp の引数とアプリ側サービスで接続します。別のグローバル初期化ではありません。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `serv.createApp(options)` | 暗号化・音声・業務ルートを装配 | `options`、`contract`、`procedures` が必須。任意項目は[アプリ設定](#host-options)を参照。 | `ServApp` | `serv.createApp({ contract, procedures, transport })` |

##### 音声接続の認可と予算

コード引数を扱うため設定手冊から移動しました。完全な手順は現在[中国語](serv.md#audio-options)にあり、この節は部分翻訳です。

[引数と手順の詳細](serv.md#integrations)

#### 利用例：暗号・音声・フィードバックの接続

transport 有効時の通常 API 要求です。伝送認証はメッセージの送信元・完全性を確認し、IAM の本人と業務権限は後段で確認します。

![Serv：契約から業務応答まで](../images/function-serv-request.ja.svg)

本文を復元してから契約の検証と procedures に渡し、認可失敗では handler に入りません。通常のアクセス拒否も暗号化範囲内です。協商・プリフライトは専用確認があり、除外パスや静的ファイルには各設定が適用されます。

createApp を使い、transport manager・音声チケットと認可・フィードバックの文脈を渡します。HTTP/WS の結果、容量超過、解放まで説明します。
