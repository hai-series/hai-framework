# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

通常のリクエストとトークン更新は、現在の `core.i18n` 言語を `Accept-Language` に設定します。サーバーのエラーも画面の言語に従います。`headers` で明示的に上書きできます。

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/api-contract](../api-contract/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md)

## 概要

hai-framework のクロスプラットフォーム oRPC/OpenAPI 型付きクライアント。Web、アプリ、ミニプログラムに共通の API 呼び出しと Token 管理を提供します。

## 主な機能

- `apiClient`：iam/storage/ai ドメインに対応する既定の型付きクライアント。
- `apiClient.create(contract)`：独自の contract に対応する型付きクライアントを作成。
- `apiClient.tokenStorage.{memory,httpOnlyCookie}()`：Token ストレージのファクトリー。ブラウザーでは access token をメモリー、refresh token をサーバー管理の httpOnly Cookie に保持し、ネイティブではプラットフォームの安全なストレージを注入します。認証情報を Web Storage に保存しません。
- ブラウザー、Node、Capacitor、ミニプログラムのブリッジに対応する独自 `fetch` を指定可能。
- Bearer Token の自動付与と、401 応答後の更新および 1 回の再試行。
- ネットワークエラーを `HaiResult` のエラーに変換。
- 任意の通信暗号化：`apiClient.init({ transport: { crypto } })` が `crypto.transport.createClient()` を自動使用。
- 通信暗号化と自動更新を併用可能。401 後の `/auth/refresh` も暗号化された fetch を使用し、平文には切り替わりません。

## 使い始める

### クイックスタート

```ts
import { apiClient } from '@h-ai/api-client'

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {}, // 默认使用 httpOnly cookie 存储（推荐）；SSR 测试请显式传入 apiClient.tokenStorage.memory()
})

const login = await apiClient.iam.auth.login({
  identifier: 'alice',
  password: 'secret',
})

if (login.success) {
  // httpOnly cookie 模式下 refresh token 由服务端 Set-Cookie 管理，
  // api-client 默认存储只需要把 access token 写入内存。
  await apiClient.auth.setTokens(login.data.tokens)
}

const me = await apiClient.iam.auth.currentUser()
if (me.success) {
  // 身份资料与服务端重新校验后的访问范围一次返回，客户端无需持久化权限快照。
  const { roles, permissions, ...user } = me.data
}

await apiClient.close()
```

#### 通信暗号化の有効化

サーバーで先に `serv.createApp({ transport: { crypto, serverKeyRing, keyStore } })` を有効にします。クライアントには同じ `@h-ai/crypto` サービスのインスタンスを渡すだけで、鍵交換コードの実装は不要です。

サーバーには管理済み serverKeyRing と共有 registry を渡します。クライアントは serverKeyId と公開鍵だけを受け取り、暗号文リクエストに鍵の版を付けます。秘密鍵・鍵環をクライアント設定に含めません。版の失効後は transport セッションを破棄して再交渉し、非冪等処理を自動再送しません。

```ts
import { apiClient } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'

await crypto.init()

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
  transport: { crypto }, // 默认协商路径：/api/v1/_hai/key-exchange
})

await apiClient.close()
await crypto.close()
```

認証済み v2 のみを受け付けます。独立したランダム SM4-CBC 鍵と HMAC-SM3 鍵を SM2 で包み、送信者署名、MAC の順に検証してから CBC を復号します。要求はクライアント秘密鍵、応答は選択されたサーバー鍵バージョンで署名します。version、direction、serverKeyId、clientId、nonce を兼ねるランダム 128 ビット requestId、issuedAt、HTTP method、pathname と元の search の SM3 pathHash、応答 status を認証します。要求の有効期限は 5 分、未来方向の時計差は最大 30 秒です。共有 registry が (clientId, requestId) を原子的に消費し、ノード間の時計差を含め issuedAt + 6 分まで保持します。保存障害では拒否します。時計同期と Redis の noeviction/永続化により有効な nonce を保持してください。業務の再試行には別の冪等キーが必要です。

空の POST も空平文の認証封装を送ります。GET/HEAD は X-Hai-Transport ヘッダー、204/304/HEAD など本文なし応答も同じヘッダーを使います。他の要求・応答は JSON 本文と X-Encrypted: true を使います。クライアントは元の要求コンテキストと HTTP status を照合し、マーカー欠落、旧形式、認証失敗では reject します。平文 endpoint は excludePaths で明示的に除外し、CORS では X-Hai-Transport を許可・公開してください。鍵交換の公開鍵認証は TLS に依存し、IAM の業務認可は別に必要です。

### API 契約

既定の `apiClient.ai.chats.createCompletion({ messages, tools, tool_choice })` は非ストリーミング JSON 契約で、function のネストした JSON Schema と `strict` を保持します。`success` を確認してから `data.choices[].message.tool_calls` を読み、アプリで認可・実行した後、助手の呼び出しと対応する `tool_call_id` 付きツール結果を次の `messages` に含めます。`stream` は未対応で、TypeScript を回避してもサーバーが拒否します。ストリーミングにはアプリ独自の対応契約を利用します。

独自のアプリケーションでは、専用の oRPC contract を指定できます：

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

const contract = apiContract.create({ iam: apiContract.iam })
const client = apiClient.create(contract)

await client.init({ baseUrl: 'https://api.example.com/api/v1' })
const result = await client.iam.auth.login({ identifier: 'alice', password: 'secret' })
```

### API 一覧

- `apiClient.init(config)`：既定のクライアントを初期化。
- `apiClient.close()`：クライアントの状態を解放。
- `apiClient.auth.setTokens(tokens)`：認証情報を置き換えて access token を保存。httpOnly 以外では指定された refresh token も保存し、省略時は古い値を削除します。
- `apiClient.auth.clear()`：Token を削除。
- `apiClient.create(contract)`：独自の型付きクライアントを作成。

`auth.clear()` と `auth.setTokens()` は、このクライアントの既存の更新リクエストを直ちにキャンセルして無効化します。遅れて届いた成功応答や 401 は、ログアウト済みの認証状態を復元したり、新しいアカウントを上書きしたり、古い更新コールバックを通知したりしません。ストレージへの書き込みは直列化され、メソッド完了後に以前の非同期書き込みが認証情報を上書きすることはありません。ログアウトとアカウント切り替えには、ストレージを直接変更せずこれらのメソッドを使ってください。httpOnly Cookie とサーバーセッションは、引き続きサーバーのログアウトエンドポイントで失効させる必要があります。

初期化済みのクライアントで `init()` を再度呼ぶと `CONFIG_ERROR` が返り、既存のクライアントは維持されます。`baseUrl` / `fetch` / `transport` を変更する場合は、先に `await apiClient.close()` を呼んでから再初期化してください。

### 設定

- `baseUrl`：API のベース URL。通常は `/api/v1` を含みます。
- `auth.storage`：Token ストレージアダプター。既定は `apiClient.tokenStorage.httpOnlyCookie()`（ブラウザー推奨）。SSR / テストでは `apiClient.tokenStorage.memory()` を明示してください。
- `auth.refreshPath`：Token 更新パス。既定は `/auth/refresh`。
- `timeout`：リクエストのタイムアウト。既定は 30000 ms。
- `headers`：静的または動的な共通リクエストヘッダー。
- `fetch`：独自の fetch 実装。
- `transport.crypto`：透過的なリクエスト/レスポンス暗号化・復号。初期化済みの `@h-ai/crypto` インスタンスが必要です。
- `transport.keyExchangePath`：鍵交換のサブパス。既定は `/_hai/key-exchange` で、`baseUrl` に自動的に連結されます。
- `apiClient.config`：**機密情報をマスクした実行時設定のスナップショット**。`baseUrl` 内の認証情報や `headers.authorization` などの機密値は自動的に非表示になります。

### 設定による認証画面

パスワードログインの送信項目は `identifier` と `password` のみです。`AuthPanel` は `LoginForm` の `username` を `identifier` に変換します。有効期間はサーバーの `session.maxAge` / `session.refreshTokenMaxAge` で設定し、フォームにログインごとの永続セッション選択肢はありません。

規約は設定の userAgreementMarkdown/privacyPolicyMarkdown または URL を使用できます。同じ規約は Markdown 本文を優先して安全な Modal で描画します。

標準 IAM contract のクライアントには apiClient.createAuthActions(client) を使用します。複数方式、登録、OTP、復旧を統一し、認証成功時に設定済み TokenStorage に保存します。アプリ側は認証後の状態更新と遷移だけを担当します。

[完整 IAM 配置 / IAM configuration](../iam/README.ja.md)

### エラー処理

業務 API は `HaiResult<T>` を返します：

```ts
const result = await apiClient.iam.auth.currentUser()
if (!result.success) {
  // result.error.code / result.error.message
}
else {
  // result.data = User & { roles: string[], permissions: string[] }
}
```

未初期化、ネットワークエラー、タイムアウト、401/403/404 などのクライアント側の問題も、失敗の `HaiResult` に変換されます。

非 2xx の HTTP 応答に有効な失敗 `HaiResult` が含まれる場合、業務エラーコード、メッセージ、`traceId` を保持します。409 の競合では再読み込みなどの対処方法を表示できます。`httpStatus` は実際の HTTP 応答を優先し、本文が 400 を指定しても 5xx の内部情報は公開しません。それ以外の応答形式はクライアント側のエラーに変換します。

自動更新は実際の HTTP 401（`Response.status`）、または HTTP 200 の有効な失敗 HaiResult（`success=false`、文字列の `error.code/message`、`error.httpStatus=401`）で動作します。更新が成功すると元のリクエストを一度だけ再試行します。組み込みのログイン・登録と設定された `auth.refreshPath` は自動更新の対象外で、403/500 など他の失敗でも更新しません。serv の通常の procedure は引き続き HTTP 200 を返します。呼び出し側は最終結果の `success` と `error.code` を確認し、更新失敗による認証失効を処理してください。

## 入力制約と HTTP 機能

キーは UTF-8 で最大 1024 バイトで、絶対パス、バックスラッシュ、制御文字、ドットセグメントを拒否します。公開 HTTP 一括削除は一度に 1–1000 件です。共通規則はブラウザー対応の `@h-ai/storage/schemas` から参照できます。署名有効期限は整数 1–604800 秒（Node 既定 3600、HTTP 既定 900）。アップロード署名の入力は key/contentType/expiresIn のみで、contentLength/maxSize/metadata/checksum は未対応です。不正入力は HTTP 400、typed client では VALIDATION_FAILED です。FileUpload の制限は選択時の補助であり、実際のオブジェクトはサーバーで検証してください。Node のストリーム/checksum/条件付き書き込みには既定の HTTP エンドポイントがありません。[機能と認可の対応表（中国語）](../storage/README.md#存储输入约束与跨端能力)を参照してください。

## 論理リクエストの監視

`client.observeRequests` は論理呼び出しごとに一度通知し、解除関数を返します。requestId、procedure、所要時間、HTTP 状態、最終 success/errorCode、業務リクエストの attempts を含みます。HTTP 200 の失敗 HaiResult も失敗として扱い、認証更新後の再試行も同じ requestId を保持します。本文・Token・URL クエリーは含みません。認証更新や鍵交換をユーザー操作としません。close は購読を解除するため、再初期化後は再購読してください。

```ts
import { apiClient } from '@h-ai/api-client'

const unsubscribe = apiClient.observeRequests((record) => {
  const failed = !record.success
  const requestId = record.requestId
})
unsubscribe()
```

## エラー表示とログの関連付け

HTTP エラーには安全な翻訳文と追跡番号を含めます。ToastContainer は番号を既定で非表示にし、調査情報のアイコンから表示・コピーできます。同じ ID を error.traceId と X-Trace-Id に返します。requestId を traceId として共有し、ブラウザーとサーバーのログを関連付けます。脱機密化した例外・スタック・操作情報はログに残し、内部 cause/ext は公開しません。項目検証は翻訳済みの項目名とメッセージだけを返します。

HTTP/UI 境界には core.error.toPublic(error, traceId?)、再翻訳後の表示には core.error.formatMessage(error) を使い、ID を重複追加しません。ログには完全な Error を渡してください。DB ログにはドライバーコード、脱機密化したメッセージ・スタック、表・列を残し、SQL 本文、バインド値と接続認証情報を記録しません。

## 任意の対話チャレンジ

createAuthActions(client) は createCaptcha({operation}) を提供し、ログイン・更新・登録で captcha を保持します。sendOtp(identifier,{captcha}) と requestPasswordReset(identifier,{captcha}) は任意の第2引数に対応します。AuthPanel は自動求解し、独自フォームも ALTCHA 手順を使い、証明を TokenStorage に保存しません。

方針・既定値・復旧範囲は次を参照： [IAM](../iam/README.ja.md)。

## 機密操作の再認証

`reauthenticate` が返す用途限定証明を、個別呼び出しの `options.context.reauthentication` に渡すと `X-Hai-Reauthentication` が付きます。グローバルヘッダー、永続保存、ログには入れません。サーバーは現在の権限、対象範囲、用途を確認して原子的に消費し、並行する通常リクエストには引き継ぎません。クロスオリジン環境ではヘッダーを許可してください。Serv/Kit の既定設定には含まれます。

## 期限切れセッションの画面内復帰

`auth.recoverSession` によって現在の画面と入力を保持して再ログインできます。UI の `createSessionRecovery` / `SessionRecoveryDialog` を使い、ルートで公開方針と元の利用者を設定し、`recovery.recover` と標準認証 actions を渡して破棄時に cancel します。IAM は発行前に `expectedUserId` を確認し、通常の CAPTCHA・ロック・改密・アクセス規則を適用します。認証拒否が明確な要求だけ1回続行でき、取消・5xx・タイムアウト・結果不明の書込は再送しません。旧セッションの重要操作証明は再確認が必要な場合があります。コールバックなしは従来動作で、有効時は即時の onRefreshFailed 遷移を復帰処理が置き換えます。auth.terminalType（web/app/desktop/api、既定 web）は分類用で機器認証ではありません。

## ページ離脱時のセッション方針

`session.endOnPageHide` の既定値は `false` です。ホストは `actions.bindPageExit({ enabled: config.session.endOnPageHide })` を呼び、破棄時に戻り値の解除関数を実行します。標準 admin/H5/fullstack テンプレートは接続済みです。BFCache 以外の `pagehide`（再読み込み、文書全体の移動を含む）で POST `/auth/session/close` を最善努力で送信し、保持する access と関連 refresh を失効します。既存の CSRF/暗号化転送を使用し、`keepalive` を付け、自動更新しません。古い応答が新しいログインを上書きしないよう Cookie/ローカル資格情報を消去しません。明示的ログアウトは通常どおり失効と消去を行います。ブラウザーが離脱要求を送らない場合もあるため、業務に応じてサーバーの `idleTimeout`/`absoluteTimeout` を併用してください。閉じた瞬間の失効は保証できません。

重要操作では `reauthorize: () => sensitiveActions.authorize(operation)` を Kit apiFetch の第3引数、または typed client の options.context に渡します。セッション更新・復帰または明確な証明拒否の後、新しい用途証明で1回だけ続行します。取消時は追加の書込を送らず、コールバックがなければ旧証明を再送しません。

## 開発とテスト

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

`transport.maxPlaintextBytes` は鍵交換で取得します。ローカル上限を明示した場合は小さい値を採用します。容量エラーは `HaiApiClientError.PAYLOAD_TOO_LARGE`（`hai:api-client:020`）と方向・段階・バイト診断を返します。[容量と移行](../crypto/TRANSPORT-CAPACITY.md)を参照してください。

serv/kit は要求の結合、署名、MAC を検証した後、時間窓を超えた報文に暗号化した HTTP 400 時刻エラーを返します。クライアントは `TransportTimeError`（`hai:crypto:071`）で端末とサーバーの時刻同期・再読み込みを案内します。`api-client` は `VALIDATION_FAILED` に変換し `cause.transportCode` に原因を保持します。自動再送やリプレイ時間窓の緩和は行わず、改ざん・未認証の要求は従来の認証エラーです。

## ライセンス

Apache-2.0
