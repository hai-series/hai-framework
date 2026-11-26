# @h-ai/api-client API リファレンス

ブラウザーでログインして自分のプロフィールを表示する Web アプリでは、パッケージから `apiClient` を読み込み、ログインとプロフィールの取得に同じインスタンスを使います。アプリ独自の API や、SSR で利用者ごとに分ける接続には、別のインスタンスを作れます。

[ログインからログアウトまで](#browser-refresh) · [保存方法を選ぶ](#credentials) · [アプリ独自の API を呼ぶ](#custom-business-client)

[简体中文](api-client.md) · [English](api-client.en.md)

<a id="module-dependencies"></a>

## 依存関係

| 依存先 | 用途 | 利用条件 | 初期化順序 |
| --- | --- | --- | --- |
| Fetch API を備えたブラウザーまたは Node.js | HTTP 通信とリクエストの中断 | 常に必要。独自環境では互換 Fetch を注入 | クライアント初期化時に必要 |
| `@h-ai/api-contract` | ホストと共有する手続きを定義 | 独自の契約を使う場合に直接インポート | 独自のクライアントを作る前に契約を組み立てる |
| IAM の公開ルートを公開する HTTP ホスト | 認証設定を取得 | 以下の公開設定の例に必要 | 呼び出し前に [Serv](serv.ja.md) または [Kit](kit.ja.md) などのホストで公開 |
| `@h-ai/crypto` | アプリケーション層の通信暗号化 | `transport` を使用する場合のみ | crypto を先に初期化し、クライアントを先に終了 |

<a id="quick-start"></a>

## クイックスタート

### インストール

```bash
pnpm add @h-ai/api-client @h-ai/api-contract
```

### 公開ログイン設定を読み取る

動作確認用のスクリプトに下の関数を置き、ログイン前に利用できる認証方式を取得します。IAM をローカルのポート 3000 の `/api/v1` 以下に公開した場合は `loadAuthPolicy('http://localhost:3000/api/v1')` を呼び出します。配備先では実際の API ベース URL を使います。このスクリプト自身が既定インスタンスを初期化して終了します。アプリの起動時に初期化済みなら、`apiClient.iam.auth.publicConfig()` をそのまま呼び出します。

```ts
import { apiClient } from '@h-ai/api-client'

export async function loadAuthPolicy(baseUrl: string) {
  // 公開 API の動作確認なので、認証なしで既定のクライアントを起動します。
  const ready = await apiClient.init({ baseUrl })
  if (!ready.success)
    return ready

  try {
    // GET /auth/config を呼び、結果を画面や動作確認スクリプトに返します。
    return await apiClient.iam.auth.publicConfig()
  }
  finally {
    await apiClient.close()
  }
}
```

呼び出し元で `success` を確認し、`data` が利用できればログイン画面に現在の方式を表示します。設定に該当する認証フォームが必要なら [認証フォームの接続](#auth-actions)を参照してください。[公開設定の応答](../data/api-contract.ja.md#public-settings)で主要フィールドを確認できます。

<a id="api-reference"></a>

## 機能

<a id="client-lifecycle"></a>

### 既定の `apiClient` を使うか、別のインスタンスを作るか

- `apiClient` は `@h-ai/api-client` からインポートする既定のインスタンスです。標準の IAM、Storage、AI の契約が入っています。たとえば、`apiClient.iam.auth.currentUser()` は IAM の認証 API を通してログイン中の利用者を取得します。呼び出すには接続先サーバーがその API を公開している必要があります。
- `apiClient.create(contract)` は、共有契約から別のインスタンスを作ります。たとえば `const profileClient = apiClient.create({ iam: apiContract.iam })` と書いたとき、`profileClient` はアプリが付けた変数名です。作成後は `profileClient.init({ baseUrl })` と `profileClient.iam.auth.currentUser()` を使います。別のインスタンスからは、その設定やログイン状態を引き継ぎません。

このページの `apiClient.iam.*` は既定のインスタンスを使う例です。独立インスタンスを使う場合は、コード中で `create(...)` の戻り値を変数に入れてから呼び出します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiClient.create(contract)` | 独立したクライアントを作成 | `contract` はホストと共有するルーター。たとえば [`apiContract.create` の戻り値](api-contract.ja.md#use-with-client) | `ApiClient<TContract>`。ここでは接続を開始しない | `const profileClient = apiClient.create(contract)` |

#### 利用例：SSR のリクエスト専用にクライアントを作る

SSR では認証情報とストレージをリクエストごとに用意します。`create` が返す新しいインスタンスをその処理だけで使用し、完了時に解放します。[発行済みの資格情報で利用者を取得する例](#detailed-workflow)で、作成から解放まで確認できます。

<a id="client-integration"></a>

### 接続先を設定して使い始める：`apiClient.init(config)`

アプリの起動時に接続先を設定し、使い終えたときに終了します。以下では既定の `apiClient` を使います。独立インスタンスでは、`profileClient.init(config)` のように、そのインスタンスに設定します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiClient.init(config)` | 接続、認証、通信の設定を適用 | `config` は `ApiClientConfig`。下の表を参照 | `Promise<HaiResult<void>>`。成功後または終了中の再初期化は `CONFIG_ERROR` | `await apiClient.init({ baseUrl, auth: {} })` |
| `apiClient.close()` | 現在のインスタンスの通信セッションと購読を解放 | 引数なし | `Promise<void>`。完了後は再初期化可 | `await apiClient.close()` |
| `apiClient.isInitialized` | 初期化の成否を確認 | 読み取り専用 | `boolean` | `const active = apiClient.isInitialized` |
| `apiClient.config` | 適用された設定を確認 | 読み取り専用 | 機密項目を除いた設定。未初期化時は `null` | `const endpoint = apiClient.config?.baseUrl` |

<a id="call-options"></a>

##### 呼び出し引数と接続オプション

| `config` の項目 | 型と既定値 | 効果 |
| --- | --- | --- |
| `baseUrl` | 必須の `string` | API の接頭辞を含む HTTP(S) アドレス。ブラウザーでは `/api/v1` のような同一オリジンのルート相対パスも使用可 |
| `timeout` | `number`、既定 30,000 ミリ秒 | 送信後の応答ヘッダー、JSON 本文、非成功応答本文を待つ期限。カスタムストリーム本文は呼び出し側の `signal` で中断 |
| `clientName` | `string`、既定 `hai-api-client` | `x-request-client` ヘッダーに設定するアプリ識別名 |
| `headers` | `Record<string, string>` または同期・非同期関数、省略可 | リクエストごとの追加ヘッダー。アプリの言語は通常 `core.i18n` から `Accept-Language` に設定 |
| `fetch` | `typeof globalThis.fetch`、既定は実行環境の Fetch | テストやプラットフォームの通信アダプター。中断や Cookie を扱う場合も Fetch の動作を維持 |
| `auth` | `AuthConfig`、省略可 | トークンの付与と自動更新。公開 API のみの場合は省略できる |
| `transport` | `ApiClientTransportConfig`、省略可 | インスタンス単位で通信を暗号化。設定例は[暗号化通信](#encrypted-requests)を参照 |

##### 認証オプション

| `config.auth` の項目 | 型と既定値 | 効果 | 設定例と使いどころ |
| --- | --- | --- | --- |
| `storage` | `TokenStorage`、既定 `apiClient.tokenStorage.httpOnlyCookie()` | トークンの保存先。Node.js や SSR ではリクエストごとに選ぶ | `storage: apiClient.tokenStorage.memory()` で SSR リクエストの資格情報を分離する |
| `terminalType` | `'web' / 'app' / 'desktop' / 'api'`、既定 `web` | `x-hai-terminal` に送る IAM のセッション区分。許可する区分はホストの設定で決まる | `terminalType: 'app'` で Capacitor のセッションをアプリ用に分類する |
| `refreshPath` | `string`、既定 `/auth/refresh` | `baseUrl` の API 接頭辞の下にある更新エンドポイント | `refreshPath: '/auth/refresh'` と `baseUrl: '/api/v1'` で `/api/v1/auth/refresh` を呼ぶ |
| `refreshTimeoutMs` | `number`、既定 10,000 ミリ秒 | 更新の待機期限。期限超過時も資格情報を保持する | `refreshTimeoutMs: 8000` で更新待ちを 8 秒に制限する |
| `onTokenRefreshed` | `(tokens: TokenPair) => void`、省略可 | 新しいトークンを書き込んだ後に呼ぶ同期コールバック | `onTokenRefreshed: tokens => updateExpiry(tokens.expiresIn)` で有効期間の表示を更新する |
| `onRefreshFailed` | `() => void`、省略可 | `recoverSession` が未設定で、更新の明示的な失敗や資格情報の欠落を処理するときの通知 | `onRefreshFailed: showSignIn` でサインイン画面への切り替えをアプリに通知する |
| `recoverSession` | `() => Promise<boolean>`、省略可 | 同じ利用者で再ログインし、新しい資格情報を書き込んだ後に `true`。キャンセルや失敗では `false` | [同じ利用者での再ログイン](#recover-session)で中断した画面の操作を引き継ぐ |

<a id="terminal-type"></a>

##### ログイン元をサーバーに伝える `terminalType`

| 値 | 指定するアプリの例 |
| --- | --- |
| `web`（既定） | ブラウザーで動く Web アプリ |
| `app` | Capacitor などのモバイルアプリ |
| `desktop` | デスクトップアプリ |
| `api` | サーバーや CLI からの API 利用 |

クライアントは値を `x-hai-terminal` ヘッダーで送ります。IAM はログインしたセッションをこの区分で記録します。端末の実機確認、権限の付与、トークンの保存先は別の設定です。

サーバーの `session.terminalLimits` が空なら区分別の上限はありません。たとえば設定が `{ web: 2, app: 1 }` のとき、同じ利用者はブラウザーで 2 件、モバイルで 1 件まで同時にログインでき、新規デスクトップ/API ログインは拒否されます。ブラウザーから 3 件目を開始すると、既定の `session.terminalLimitMode: 'reject'` では新しいログインを拒否し、`'replace'` では古いブラウザーのセッションを失効させます。セッション全体の上限も適用されます。 [IAM のサーバー設定](../configuration/iam.ja.md)

##### 暗号化オプション

| `config.transport` の項目 | 型と既定値 | 効果 |
| --- | --- | --- |
| `crypto` | 初期化済みの `CryptoFunctions`、`transport` 使用時に必須 | クライアントの暗号化セッションを作成 |
| `keyExchangePath` | 省略可能。既定は `/api/v1/_hai/key-exchange` | `baseUrl` のオリジンを基準にした絶対パス。サーバーの鍵交換パスと揃える。 |
| `maxPlaintextBytes` | `number`、省略時はホストの上限を使用 | 平文 UTF-8 バイト数の上限。指定時はホストとローカルの小さい方を使用 |

##### クライアントのアドレス・期限・復旧

Node.js や SSR では絶対 URL を渡します。URL のユーザー情報、クエリ、フラグメントおよびスキームを省略した `//host` 形式は使用できません。ブラウザーの別オリジン通信では、ホストの CORS 設定を接続元に合わせます。

同じインスタンスで並行する初期化は同じ処理を待ちます。初期化の完了は設定が有効になったことを示します。接続の成否は、たとえば `apiClient.iam.auth.publicConfig()` の結果で確認します。設定を切り替えるときは、使用中のインスタンスの `close()` の完了を待ちます。独立インスタンスでは渡した契約に含まれる API を呼び出せます。条件付きで組み立てた `orderClient` に `payment` がない可能性があれば、`orderClient.payment?.orders` のように参照します。`then` は予約されています。

#### 利用例：クライアントの準備と分離

本番用の `apiClient` をアプリが使用していて、別の検証サーバーの設定も確認したいときは、検証用にもう一つ作ります。`baseUrl` には検証先の API ベース URL を渡します。以下は 15 秒の期限を設定して、そのインスタンスの設定を確認する例です。

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function checkApiAddress(baseUrl: string) {
  const contract = apiContract.create({ iam: apiContract.iam })
  const checkClient = apiClient.create(contract)
  // このインスタンスだけに URL と 15 秒の期限を適用します。
  const ready = await checkClient.init({ baseUrl, timeout: 15_000 })
  if (!ready.success)
    return ready

  try {
    return { active: checkClient.isInitialized, baseUrl: checkClient.config?.baseUrl }
  }
  finally {
    await checkClient.close()
  }
}
```

<a id="credentials"></a>
### ログインを維持する：`apiClient.auth` と `apiClient.tokenStorage`

アクセストークンは、現在の利用者として API を呼ぶために使います。リフレッシュトークンは、アクセストークンの期限が切れたときに新しいトークンを受け取るために使います。既定のインスタンスなら `apiClient.init({ baseUrl, auth: {} })` でブラウザー向けの Cookie 方式を選べます。両方のトークンをサーバーがレスポンス本文で発行する構成では、用途に合わせて `auth.storage` を指定します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiClient.auth.setTokens(tokens)` | 信頼できる認証結果を保存 | 認証応答の `TokenPair` | `Promise<void>`。認証未設定なら何もしない。書き込み失敗は拒否 | `await apiClient.auth.setTokens(login.data.tokens)` |
| `apiClient.auth.clear()` | ローカルの資格情報を消去し、旧世代の更新を無効化 | 引数なし | `Promise<void>`。認証未設定なら何もしない。保存先の消去失敗は拒否 | `await apiClient.auth.clear()` |
| `apiClient.auth.onTokenRefreshed(callback)` | 書き込み完了後の更新を購読 | `TokenPair` を受け取る同期関数 | 購読解除関数。認証を有効にしていなければ空の処理 | `const stop = apiClient.auth.onTokenRefreshed(updateExpiry)` |
| `apiClient.tokenStorage.httpOnlyCookie()` | ブラウザー向けアダプター | 引数なし。認証を有効にした場合の既定 | `TokenStorage`。アクセストークンはインスタンスのメモリーに保存 | `const storage = apiClient.tokenStorage.httpOnlyCookie()` |
| `apiClient.tokenStorage.memory()` | 独立したメモリーアダプター | 引数なし | `TokenStorage`。アダプターの存続中、両トークンを保存 | `const storage = apiClient.tokenStorage.memory()` |

<a id="storage-modes"></a>

##### Cookie とメモリーのどちらを選ぶか

| 設定 | アクセストークン | リフレッシュトークン | ページを再読み込みしたら |
| --- | --- | --- | --- |
| `apiClient.tokenStorage.httpOnlyCookie()` | アダプターのメモリー。取得後の API に `Authorization: Bearer …` として付く | ログイン時にサーバーが `Set-Cookie` で発行し、ブラウザーが HttpOnly Cookie を保存する。スクリプトから Cookie 内の値は読めない | メモリーのアクセストークンは消える。Cookie がまだ有効なら、保護された API が更新対象の 401 を返したときに更新してログインを継続できる |
| `apiClient.tokenStorage.memory()` | アダプターのメモリー | サーバーがレスポンス本文で発行した値を同じアダプターのメモリーに保存する。更新 API に JSON で送る | 両方が消える。Node.js のテストや、SSR で利用者ごとに独立したリクエストに向く |

`apiClient.close()` はクライアントの実行と購読を終わらせます。ブラウザーの Cookie の削除はログアウト API に依頼します。アプリがアダプターを作って参照を保持している場合、`close()` の後もその保存データはアプリの管理下にあります。ログアウトでは先にサーバーへ通知し、その後でまだ初期化済みの `apiClient.auth.clear()` を使ってローカルの値を消去します。[ログアウトボタンの例](#logout)

<a id="cookie-credentials"></a>

##### `credentials: 'include'` はブラウザーに何を頼むのか

Cookie 方式では、クライアントが Fetch に `credentials: 'include'` を指定します。ブラウザーは送信先に適用される Cookie をリクエストに付け、許可されている `Set-Cookie` をレスポンスから処理します。たとえば、ログインのレスポンスで保存した更新 Cookie を、次の `POST /api/v1/auth/refresh` でブラウザーが送ります。ログアウト時はサーバーからの指示でその Cookie を消去します。

画面が `https://app.example.com`、API が `https://api.example.com` なら別オリジンです。API 側の CORS で画面のオリジンを個別に許可し、資格情報付きリクエストも許可します。Cookie の送信には `Domain`、`Path`、`SameSite`、`Secure` とブラウザーの Cookie ポリシーも適用されます。サイト自体が異なる場合は通常 `SameSite=None; Secure` が必要です。 [Serv の Cookie と CORS 設定](../configuration/serv.ja.md)

##### `TokenPair` のフィールド

| フィールド | 型と条件 | 使いどころ |
| --- | --- | --- |
| `accessToken` | 必須の `string` | 認証結果の `login.data.tokens.accessToken` を保存すると、以降の操作で `Authorization: Bearer …` に付与される |
| `refreshToken` | 任意の `string` | 本文で発行する構成では `login.data.tokens.refreshToken` を安全なアダプターに保存する。Cookie 構成ではサーバーが Cookie を発行するため、応答本文から省略されることがある |
| `expiresIn` | 必須の `number`。単位は秒 | `login.data.tokens.expiresIn` が `900` ならアクセストークンの有効期間は 15 分。残り時間の表示に使える |
| `tokenType` | 固定の `'Bearer'` | 応答の `login.data.tokens.tokenType` が、リクエストに付ける認証スキームを示す |

<a id="token-storage-methods"></a>

##### `TokenStorage` の実装契約

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `storage.getAccessToken()` | アクセストークンを読み取り | 引数なし | `Promise<string \| null>` | `const token = await storage.getAccessToken()` |
| `storage.setAccessToken(token)` | アクセストークンを書き込み | 認証応答の `string` | `Promise<void>` | `await storage.setAccessToken(tokens.accessToken)` |
| `storage.getRefreshToken()` | 更新資格情報を読み取り | 引数なし | `Promise<string \| null>`。Cookie 方式では内部識別値 | `const token = await storage.getRefreshToken()` |
| `storage.setRefreshToken(token)` | 更新トークンを書き込み | 更新資格情報の `string` | `Promise<void>`。Cookie 方式の実装は何もしない | `await storage.setRefreshToken(refreshToken)` |
| `storage.clear()` | アダプターで管理する資格情報を消去 | 引数なし | `Promise<void>`。Cookie 方式で消去するのはメモリー内のアクセストークン | `await storage.clear()` |

`null` は資格情報の欠落を表します。読み書きの障害では Promise を拒否します。アダプターをクライアントに渡した後の書き込みと消去は、`apiClient.auth.setTokens()` と `apiClient.auth.clear()` から行います。ログイン状態を変えた後に、古い更新結果が戻っても上書きされません。

Node.js の Fetch は利用者のブラウザーの Cookie を引き継ぎません。SSR では現在のリクエストだけに許可された資格情報を、安全に受け取った経路から渡します。ネイティブアプリの永続化には [Capacitor の安全な保存先](capacitor.ja.md) などを使います。

#### 利用例：クライアントへの接続前に保存先を確認する

Node.js のテストで、応答本文から取得するアクセストークンと更新トークンの書き込み、読み取り、消去を確認します。`tokens` にはテスト用の認証応答を渡します。実際のトークンは画面やログに表示しません。接続後の更新と消去は `client.auth.setTokens()` と `client.auth.clear()` から行います。

```ts
import type { TokenPair } from '@h-ai/api-client'
import { apiClient } from '@h-ai/api-client'

export async function verifyStorage(tokens: TokenPair & { refreshToken: string }) {
  // クライアントに接続していない、試験専用のアダプターを使います。
  const storage = apiClient.tokenStorage.memory()
  let written = false
  try {
    await storage.setAccessToken(tokens.accessToken)
    await storage.setRefreshToken(tokens.refreshToken)
    const access = await storage.getAccessToken()
    const refresh = await storage.getRefreshToken()
    written = access === tokens.accessToken && refresh === tokens.refreshToken
  }
  finally {
    // 書き込みに失敗しても、残っている資格情報を消去します。
    await storage.clear()
  }
  const empty = await storage.getAccessToken() === null && await storage.getRefreshToken() === null
  return { written, empty }
}
```

両方の項目が `true` なら書き込みと消去を確認できました。保存の障害は Promise の拒否として扱います。

#### 有効期限が切れたあとに起きること

同じ利用者の保護された画面が、期限切れの資格情報でリクエストした場合の流れです。対象となる HTTP 401 または IAM の認証失敗を受けると、同じインスタンスで並行する呼び出しが一回の更新を共有します。更新に成功すると有効な同じ利用者の呼び出しだけが一度再試行されます。呼び出し側の中断は、その呼び出しの待機を終わらせます。

![認証エラーから資格情報の更新と同一利用者の復旧を経て、許可された元のリクエストを再試行する流れ](../images/function-api-client-recovery.ja.svg)

たとえば `apiClient.iam.auth.currentUser()` が更新対象の 401 を返し、更新 Cookie がまだ有効なら、更新したアクセストークンでプロフィールをもう一度取得します。サーバーが更新資格情報の無効を明示した場合、対応する保存データを消去して設定済みの `recoverSession` を呼びます。復旧のフォームでは対象の利用者 ID を `expectedUserId` に渡し、同じ利用者の新しい資格情報が保存できた場合に限って `true` を返します。ネットワーク障害、期限超過、レート制限などの一時失敗では資格情報を維持し、結果不明の操作は自動で再送しません。

ログイン、登録、パスワード更新・再設定、自動更新そのものの失敗は、通常の保護 API の更新と同じ扱いになりません。通常の[ログアウト](#logout)でセッションを閉じます。

<a id="detailed-workflow"></a>

#### 利用例：SSR の 1 リクエストにだけ資格情報を渡す

ログイン済み利用者のページをサーバーで描画する場合は、受け取ったリクエストごとにクライアントを作ります。`baseUrl` には IAM の絶対 URL を、`tokens` にはこの利用者に対してサーバーが発行し、SSR 側で使用を許可されたトークンを指定します。プロフィールを取得したらアダプターと独立インスタンスを解放します。

```ts
import type { TokenPair } from '@h-ai/api-client'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function readCurrentUser(baseUrl: string, tokens: TokenPair) {
  const storage = apiClient.tokenStorage.memory()
  const contract = apiContract.create({ iam: apiContract.iam })
  const requestClient = apiClient.create(contract)
  // サーバーから発行された、現在の SSR リクエスト専用の資格情報を使います。
  const ready = await requestClient.init({ baseUrl, auth: { storage } })
  if (!ready.success)
    return ready

  try {
    await requestClient.auth.setTokens(tokens)
    // 失効したアクセストークンは更新可能であれば自動で更新されます。
    const me = await requestClient.iam.auth.currentUser()
    if (!me.success)
      return me
    return me.data
  }
  finally {
    try {
      await requestClient.auth.clear()
    }
    finally {
      await requestClient.close()
    }
  }
}
```

<a id="browser-refresh"></a>
#### 利用例：ログイン画面 → プロフィール → ログアウト

ブラウザーの Web アプリで、ログイン画面、プロフィール画面、ログアウトボタンが同じセッションを扱う例です。別途サーバーを起動し、同一オリジンの `/api/v1` 以下に IAM のログイン・更新・現在の利用者・ログアウト API を公開してください。サーバーでは HttpOnly の更新 Cookie を使います。接続先が別オリジンなら、`baseUrl` を API の絶対 URL に変更し、[Cookie 付きリクエスト](#cookie-credentials)を許可します。

下のコードを Web アプリのブラウザー専用モジュール（例 `src/lib/account-session.ts`）に置きます。アプリ起動時に `startBrowserSession()` を一度呼び、その成功結果に入っている操作を各画面で共有します。

```ts
import type { IamAuthLoginInput } from '@h-ai/api-client'
import { apiClient } from '@h-ai/api-client'

export async function startBrowserSession(
  updateExpiry: (seconds: number) => void,
  showSignIn: () => void,
) {
  // 同一オリジンの API に接続。Cookie の方式を既定で使います。
  const initialized = await apiClient.init({
    baseUrl: '/api/v1',
    auth: {
      terminalType: 'web',
      refreshPath: '/auth/refresh',
      refreshTimeoutMs: 8_000,
      onRefreshFailed: showSignIn,
    },
  })
  if (!initialized.success)
    return initialized

  const defaultClient = apiClient
  const actions = apiClient.createAuthActions(defaultClient)
  const stop = apiClient.auth.onTokenRefreshed(({ expiresIn }) => updateExpiry(expiresIn))

  return {
    success: true as const,
    data: {
      async signIn(input: IamAuthLoginInput) {
        // フォームの入力を送信します。成功して戻った時点でトークンは保存済みです。
        const result = await actions.login(input)
        if (!result.success)
          return result
        updateExpiry(result.data.tokens.expiresIn)
        return { success: true as const, data: result.data.user }
      },
      readProfile() {
        // ログイン時と同じ apiClient が、保存済みの資格情報を使います。
        return apiClient.iam.auth.currentUser()
      },
      async signOut() {
        // 先にサーバーへ通知し、その後でクライアント側の値を消去します。
        const result = await apiClient.iam.auth.logout({}, { context: { autoRefresh: false } })
        await apiClient.auth.clear()
        return result
      },
      async close() {
        stop()
        await apiClient.close()
      },
    },
  }
}
```

1. **アプリの起動時**に `startBrowserSession(updateExpiry, showSignIn)` を呼びます。`updateExpiry` は受け取った秒数を画面に反映する関数、`showSignIn` は現在の利用者の表示を消してログイン画面を開く関数です。`success` が `false` なら接続設定を確認します。
2. **フォーム送信時**に `data.signIn({ identifier, password })` を呼びます。値はフォームから取得します。ログインが成功したらプロフィール画面へ進みます。成功した `data.readProfile()` の `data` には、現在の利用者名や権限が入ります。
3. **プロフィール表示中**にアクセストークンが期限切れになっても、更新 Cookie が有効なら、クライアントが自動で更新します。更新に成功すると `updateExpiry` が呼ばれ、更新対象の取得は一度再試行されます。セッションを更新できない場合は、この設定では `showSignIn` が呼ばれます。ネットワーク障害や更新を待つ期限超過では資格情報を保持します。
4. **ログアウトボタン**から `data.signOut()` を呼びます。成功ならサーバー側のセッションも終了しています。失敗ならローカル状態は消えますが、サーバーの失効は確認できていません。アプリ全体でこのクライアントを使い終えるときに `data.close()` を呼びます。

<a id="recover-session"></a>

#### 利用例：同じ利用者で再ログインして画面の操作を続ける

利用者が編集中の内容を保持したまま復旧フォームを表示する場合は、`onRefreshFailed` の代わりに `recoverSession` を指定します。`getCurrentUserId` は現在の画面が対象とする利用者 ID、`requestLogin` は組み込みの認証入力を返すアプリのフォーム処理です。フォームを取り消した場合は `undefined` を返します。

```ts
import type { IamAuthLoginInput } from '@h-ai/api-client'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function createRecoveringClient(
  baseUrl: string,
  getCurrentUserId: () => string | undefined,
  requestLogin: () => Promise<IamAuthLoginInput | undefined>,
) {
  const client = apiClient.create({ iam: apiContract.iam })
  const actions = apiClient.createAuthActions(client)
  const initialized = await client.init({
    baseUrl,
    auth: {
      async recoverSession() {
        const expectedUserId = getCurrentUserId()
        if (!expectedUserId)
          return false
        const input = await requestLogin()
        if (!input || getCurrentUserId() !== expectedUserId)
          return false
        // 同じ利用者でのログイン結果が保存された場合にだけ、元のリクエストを再試行できます。
        const restored = await actions.login({ ...input, expectedUserId })
        return restored.success
      },
    },
  })
  if (!initialized.success)
    return initialized
  return { success: true as const, data: client }
}
```

初期化に成功した場合、戻り値の `data` が復旧機能付きのインスタンスです。`const actions = apiClient.createAuthActions(result.data)` でフォーム用の操作を作り、通常どおり `actions.login()` を呼びます。その利用者 ID をアプリ側で保持します。サーバーが更新資格情報を無効と判定すると、保護リクエストの途中で復旧処理が始まります。`expectedUserId` を付けたログインに成功し、同じ利用者のために新しい資格情報が一度保存されたとクライアントが確認した場合に再試行できます。利用者が切り替わった場合や元のリクエストが中断された場合は、元の操作を再開しません。画面やアプリでインスタンスを破棄するときは `close()` を呼びます。

<a id="auth-actions"></a>

### フォーム用の認証操作

`apiClient.createAuthActions(apiClient)` は有効な呼び出しです。先頭の `apiClient` はファクトリーの呼び出し元で、引数の `apiClient` は認証操作に使う初期化済みインスタンスです。例では引数に `defaultClient` という名前を付けています。独立したインスタンスを使う場合は `apiClient.create(contract)` の戻り値を渡します。

| 呼び出し口 | 用途 | 資格情報の保存 |
| --- | --- | --- |
| `actions.login(form)`、`actions.register(form)` | フォームから標準のログイン・登録フローを使う。 | 認証操作が同じインスタンスに保存してから成功を返す。 |
| [`apiClient.iam.auth` の API](#iam-requests) | アプリで HTTP エンドポイントを指定して結果の扱いを決める。 | ログイン・登録の結果から取り出した `data.tokens` を呼び出し元が `apiClient.auth.setTokens()` に渡す。 |

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiClient.createAuthActions(client)` | フォーム操作をクライアントに結び付ける | 標準の IAM 契約を持ち、資格情報を保存する場合は `auth` を指定して初期化したインスタンス | インスタンスに対応する操作 | `apiClient.createAuthActions(defaultClient)` |
| `actions.login(input)` | ログイン方式を選び、成功時に資格情報を保存 | `identifier` と `password`。任意の `method` は既定の `password`、`ldap`、`email`、`sms`。OTP の場合は `password: ''` と `code`。必要時に `captcha`、同じ利用者のセッション復旧時に `expectedUserId` | 利用者とトークンを含む `HaiResult`。保存障害は Promise を拒否 | `await actions.login({ identifier, password })` |
| `actions.register(input)` | 利用者を登録し、成功時に資格情報を保存 | 必須の `username` と `password`。任意の `email`、`phone`、`displayName`、`metadata`、`captcha` | 利用者とトークンを含む `HaiResult`。保存障害は Promise を拒否 | `await actions.register({ username, password })` |
| `actions.bindPageExit(options?)` | ブラウザーが文書から離れるときにセッションの終了を依頼 | `options.enabled` は既定で `false`。公開設定の `session.endOnPageHide` を渡す | リスナーの解除関数 | `actions.bindPageExit({ enabled: policy.session.endOnPageHide })` |

同じオブジェクトから [IAM の各 API](#iam-requests) をフォーム用の引数で呼び出せます。`actions.publicConfig()` と `actions.createCaptcha(input)` は引数をそのまま渡します。`actions.sendOtp(identifier, { captcha })`、`actions.requestPasswordReset(identifier, { captcha })` はフォーム値を入力オブジェクトにまとめます。`actions.confirmPasswordReset(token, newPassword)` と `actions.renewPassword(input)` はパスワードの更新を送信し、`actions.reauthenticate(password, operation)` は[同じ再認証 API](#reauthentication)を呼びます。

#### 利用例：ログインフォームを送信する

[ログイン画面の例](#browser-refresh)から、パスワードフォームでは `signIn({ identifier, password })`、メールの OTP フォームでは `signIn({ identifier, password: '', method: 'email', code })` を呼び出します。公開設定で方式を選び、CAPTCHA が有効な場合は操作用のチャレンジを解いて得た証明を `captcha` に渡します。成功したら、保存済みの資格情報を使ってプロフィールを読み取れます。

<a id="page-exit"></a>

#### 利用例：アカウントページから画面を離れるときにセッションの終了を依頼する

[ブラウザーのログイン例](#browser-refresh)にこの関数を追加し、ログイン成功後にアカウント画面を含むレイアウトで一度呼びます。公開設定から有効・無効を決めます。取得に失敗した場合はリスナーを登録せずに失敗を返します。

```ts
import { apiClient } from '@h-ai/api-client'

export async function bindAccountPageExit() {
  const defaultClient = apiClient
  const actions = apiClient.createAuthActions(defaultClient)
  const policy = await actions.publicConfig()
  if (!policy.success)
    return policy

  const stop = actions.bindPageExit({
    enabled: policy.data?.session.endOnPageHide ?? false,
  })
  return { success: true as const, data: { stop } }
}
```

成功時の `data.stop` を保持し、ログアウト前とレイアウトの破棄時に呼びます。通常の `pagehide` では `keepalive: true`、`autoRefresh: false` で `iam.auth.closeSession({})` を送ります。ブラウザーの戻る・進む操作のためキャッシュに入るページは対象外です。送信完了はブラウザーの動作に依存します。ログアウトボタンでは[通常のログアウト](#logout)でサーバー側の失効とローカルの資格情報の消去を扱います。

<a id="request-options"></a>
### リクエストごとのオプション

ログイン中のプロフィールを読むだけなら `apiClient.iam.auth.currentUser()` を使います。ページを離れたときに応答待ちをやめたい場合は、同じ呼び出しの第 2 引数にオプションを渡します。

#### オプション項目

第 1 引数は API が受け取る業務データです。`currentUser()` はログイン中の利用者を取得するため、利用者 ID などの入力がありません。そのため、オプションだけを指定するときは `apiClient.iam.auth.currentUser(undefined, { signal })` のように第 1 引数を `undefined` にします。入力がある管理画面なら `apiClient.iam.users.list({ page: 1 }, { signal })` のように渡します。どちらも第 2 引数はその呼び出しだけに適用されます。

| 第 2 引数の項目 | 省略時 | 指定した場合 |
| --- | --- | --- |
| `signal` | 呼び出し元からの中断なし | `AbortController.signal` で応答待ちを終える。サーバーで開始済みの書き込みは完了することがある |
| `lastEventId` | イベント ID を送らない | SSE の再接続に使う文字列。続きのイベントを返すかはサーバーの実装で決まる |
| `context.autoRefresh` | クライアントの認証設定を使用 | `false` でこのリクエストの自動更新を停止。現在のアクセストークンは設定に従って送信 |
| `context.keepalive` | Fetch の既定値 | `true` でページ離脱後も通信を続けるよう Fetch に通知。実際の送信はブラウザーの制約を受ける |
| `context.reauthentication` | 再認証チケットを送らない | 操作用のチケット文字列を `X-Hai-Reauthentication` として送信 |
| `context.reauthorize` | 新しいチケットを取得しない | 許可された再試行で呼ぶコールバック。文字列で新しいチケット、`null` で再試行を中止、`undefined` でチケットなしの再試行を許可 |

#### 利用例：ページを閉じるときにプロフィールの読み込みを中断する

[ログインからログアウトまでの例](#browser-refresh)でログインしたプロフィール画面に次の関数を置きます。画面を開くときに `startProfileLoad()` を呼び、返った `result` を待ちます。成功なら利用者名を画面に表示し、表示前にページを離れた場合は `cancel()` を呼びます。

```ts
import { apiClient } from '@h-ai/api-client'

export function startProfileLoad() {
  const controller = new AbortController()
  return {
    result: apiClient.iam.auth.currentUser(undefined, { signal: controller.signal }),
    cancel: () => controller.abort(),
  }
}
```

`result` は通常の `HaiResult` を返す Promise です。画面が残っているときに `success` を確認し、成功結果の `data.username` や失敗結果の `error` を使います。

<a id="request-authorization"></a>

### ログインが必要か、操作の権限がないかを判断する

クライアントはアクセストークンを送信します。Serv または Kit はトークンからセッションを検証し、その利用者が操作や対象レコードにアクセスできるかを各リクエストで判定します。アプリは `apiClient.iam.auth.currentUser()` が成功したときの `data.roles` と `data.permissions` をナビゲーションやボタンの表示に使えます。権限の変更や画面が保持している情報の古さに備え、サーバーでは業務処理の前に権限を確認します。

| 最終結果 | サーバーの判定 | クライアントの対応 |
| --- | --- | --- |
| `success: false`、`error.httpStatus: 401` | 認証情報が不足または失効。操作によっては再認証チケットが必要 | 更新や再認証の対象であればクライアントが再試行を調整する。復旧後も 401 が返ればサインインや再認証へ案内する |
| `success: false`、`error.httpStatus: 403` | 利用者は認証できたが、この操作や対象へのアクセスは許可されない | 拒否の案内を表示する。この結果でトークン更新は始まらない |
| `success: true` | そのリクエストが許可され、サーバーが業務処理を完了または受理した | `data` で画面を更新する。受理後に処理が続く操作は、返された ID で進捗を確認する |

#### 利用例：権限を画面に反映し、保護 API の結果で操作を判断する

ログイン直後に `apiClient.iam.auth.currentUser()` で画面に表示するロールと権限を取得します。エクスポートボタンを押した後は、表示状態にかかわらず[レポートの作成リクエスト](#custom-business-client)の結果を確認します。機密操作に追加の本人確認が必要な場合は、[再認証チケットの例](#reauthentication)を参照してください。

保護ルートの設定手順は [Serv の認証](serv.ja.md#authentication)または [Kit のガード](kit.ja.md#auth)を参照してください。

<a id="iam-requests"></a>
### IAM の認証・セッション API

下の `apiClient.iam.auth` は、既定インスタンスに入っている IAM の認証 API です。プロフィールの取得、パスワードの変更、ログアウトでは表のメソッドを直接呼べます。`apiClient.create(...)` で IAM を含む別のインスタンスを作った場合は、`apiClient` の部分にその変数名を使います。各操作は `HaiResult` を返します。任意の第 2 引数は[呼び出しごとのオプション](#request-options)を参照してください。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiClient.iam.auth.publicConfig(input?, options?)` | 公開認証設定を取得 | 業務入力なし | 設定または `null` | `await apiClient.iam.auth.publicConfig()` |
| `apiClient.iam.auth.createCaptcha(input, options?)` | チャレンジを開始 | 必須の `operation`。[認証フォームの接続](#auth-actions)を参照 | CAPTCHA チャレンジ | `await apiClient.iam.auth.createCaptcha({ operation: 'login' })` |
| `apiClient.iam.auth.login(input, options?)` | パスワードでログイン | 必須の `identifier` と `password`。任意の `captcha`、`expectedUserId` | 利用者とトークン | `await apiClient.iam.auth.login({ identifier, password })` |
| `apiClient.iam.auth.loginWithLdap(input, options?)` | LDAP でログイン | 必須の `username` と `password`。任意の `captcha`、`expectedUserId` | 利用者とトークン | `await apiClient.iam.auth.loginWithLdap({ username, password })` |
| `apiClient.iam.auth.loginWithOtp(input, options?)` | OTP でログイン | 必須の `identifier` と `code`。任意の `captcha`、`expectedUserId` | 利用者とトークン | `await apiClient.iam.auth.loginWithOtp({ identifier, code })` |
| `apiClient.iam.auth.sendOtp(input, options?)` | OTP を要求 | 必須の `identifier`。任意の `captcha` | 有効期限 | `await apiClient.iam.auth.sendOtp({ identifier })` |
| `apiClient.iam.auth.register(input, options?)` | 新規登録 | 必須の `username` と `password`。任意の `email`、`phone`、`displayName`、`metadata`、`captcha` | 利用者とトークン | `await apiClient.iam.auth.register({ username, password })` |
| `apiClient.iam.auth.currentUser(input?, options?)` | 現在の利用者を取得 | 業務入力なし | プロフィール、ロール、権限 | `await apiClient.iam.auth.currentUser()` |
| `apiClient.iam.auth.updateCurrentUser(input, options?)` | 自分のプロフィールを変更 | 変更する `username`、`email`、`displayName`、`avatarUrl`、`phone`、`metadata` | 変更後のプロフィール | `await apiClient.iam.auth.updateCurrentUser({ displayName: 'Mina' })` |
| `apiClient.iam.auth.changePassword(input, options?)` | ログイン中にパスワードを変更 | 必須の `oldPassword` と `newPassword` | 業務データなし | `await apiClient.iam.auth.changePassword({ oldPassword, newPassword })` |
| `apiClient.iam.auth.renewPassword(input, options?)` | 初回・期限切れのパスワードを更新 | 必須の `identifier`、`password`、`newPassword`。任意の `captcha` | 業務データなし | `await apiClient.iam.auth.renewPassword({ identifier, password, newPassword })` |
| `apiClient.iam.auth.requestPasswordReset(input, options?)` | 再設定通知を要求 | 必須の `identifier`。任意の `captcha` | 業務データなし | `await apiClient.iam.auth.requestPasswordReset({ identifier })` |
| `apiClient.iam.auth.confirmPasswordReset(input, options?)` | 再設定を完了 | 必須の `token` と `newPassword` | 業務データなし | `await apiClient.iam.auth.confirmPasswordReset({ token, newPassword })` |
| `apiClient.iam.auth.reauthenticate(input, options?)` | 操作用チケットを取得 | 必須の `password` と `operation` | チケットと有効期限 | `await apiClient.iam.auth.reauthenticate({ password, operation: 'iam.users.delete' })` |
| `apiClient.iam.auth.refresh(input, options?)` | 資格情報を更新 | 契約の入力は `refreshToken: string`。通常はクライアントが更新処理を実行 | 新しいトークン | `await apiClient.iam.auth.refresh({ refreshToken })` |
| `apiClient.iam.auth.logout(input, options?)` | 通常のログアウト | 必須のオブジェクト。`{}` で現在の Bearer を使用、任意の `accessToken` で対象指定 | 業務データなし | `await apiClient.iam.auth.logout({})` |
| `apiClient.iam.auth.closeSession(input, options?)` | ページ離脱時などにセッションを失効 | 必須のオブジェクト。`{}` で現在の Bearer を使用、任意の `accessToken` で対象指定 | 業務データなし | `await apiClient.iam.auth.closeSession({})` |

ログインや登録の手続きを直接使った場合、呼び出し側が成功を確認し `apiClient.auth.setTokens(result.data.tokens)` で保存します。[認証フォームの接続](#auth-actions)の操作を経由すれば保存も行います。

<a id="logout"></a>

#### 利用例：現在のセッションからログアウトする

[ログインからログアウトまでの例](#browser-refresh)でログインした利用者のログアウトボタンから呼び出します。サーバー側のセッションを終了し、ローカルの資格情報を消去します。ホストから失敗が返る場合もローカル消去を行い、呼び出し元に失敗を伝えます。ストレージの消去が失敗した場合は Promise が拒否されます。

```ts
import { apiClient } from '@h-ai/api-client'

export async function signOut() {
  // 現在のセッションをサーバーで取り消し、ローカルの資格情報も消去します。
  const logout = await apiClient.iam.auth.logout({}, { context: { autoRefresh: false } })
  await apiClient.auth.clear()
  if (!logout.success)
    return logout
  return logout
}
```

<a id="http-contract-extensions"></a>

### アプリの契約からクライアントを作成：`apiClient.create(contract)`

基本操作と拡張操作をまとめる `project-api.ts` の例です。サーバーとクライアントでアプリの契約を共有し、公開済みの分岐を含めます。`roles`、`files`、`chats`、`memories`、`orders` はグループ内で展開して既存の操作を引き継ぎます。

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

const { extensions } = apiContract

export const projectContract = apiContract.create({
  iam: {
    ...apiContract.iam,
    apiKeys: extensions.iam.apiKeys,
    roles: { ...apiContract.iam.roles, ...extensions.iam.roles },
  },
  storage: {
    ...apiContract.storage,
    files: { ...apiContract.storage.files, ...extensions.storage.files },
  },
  ai: {
    ...apiContract.ai,
    ...extensions.ai,
    chats: { ...apiContract.ai.chats, ...extensions.ai.chats },
    memories: { ...apiContract.ai.memories, ...extensions.ai.memories },
  },
  audit: extensions.audit,
  payment: { orders: { ...apiContract.payment.orders, ...extensions.payment.orders } },
  feedback: apiContract.feedback,
})

export async function connectProjectClient(baseUrl: string, accessToken: string) {
  const client = apiClient.create(projectContract)
  const ready = await client.init({
    baseUrl,
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!ready.success)
    throw new Error(ready.error.message)
  return { client }
}

export type ProjectClient = Awaited<ReturnType<typeof connectProjectClient>>['client']
```

現在のアクセストークンと、サーバー側の接頭辞を含む API の URL を渡します。返された `client` を以下の例で使い、所有する画面やアプリの終了時に `client.close()` を呼びます。ストリームとファイルにはホストが許可した HTTPS ルートを使います。別のルートにフレームワークの伝送暗号化が必要なら、ポリシーごとにクライアントを用意します。拒否時は [認証・認可の結果](#request-authorization) に従います。

エンドポイントと登録方法： [API Contract](api-contract.ja.md#http-contract-extensions) · [Serv](serv.ja.md#http-contract-extensions)

<a id="iam-admin-inputs"></a>

### 管理画面から利用者、ロール、権限を扱う

下の操作は、既定の `apiClient` に含まれる IAM API です。サーバーはログインした利用者の管理権限を確認します。既存のレコードに対する操作では、一覧や以前の成功結果から利用者、ロール、権限の ID を取得します。[呼び出しごとのオプション](#request-options)を第 2 引数に指定できます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiClient.iam.users.list(input, options?)` | 利用者を一覧表示 | 必須のオブジェクト。`{}` で既定。絞り込みは[管理用項目](#iam-admin-inputs)を参照 | 利用者一覧のページ | `await apiClient.iam.users.list({ page: 1, pageSize: 20 })` |
| `apiClient.iam.users.get(input, options?)` | 利用者を取得 | 必須の `id` は既存の利用者 ID | 利用者または `null` | `await apiClient.iam.users.get({ id: userId })` |
| `apiClient.iam.users.create(input, options?)` | 利用者を作成 | 必須の `username` と `password`。[管理用項目](#iam-admin-inputs)を参照 | 作成された利用者 | `await apiClient.iam.users.create({ username, password })` |
| `apiClient.iam.users.invite(input, options?)` | 招待通知を送信 | 必須の `username` と通知先 `email` または `phone`。[管理用項目](#iam-admin-inputs)を参照 | 作成された利用者 | `await apiClient.iam.users.invite({ username, email })` |
| `apiClient.iam.users.update(input, options?)` | 利用者を更新 | 必須の `id` と変更項目。[管理用項目](#iam-admin-inputs)を参照 | 更新された利用者 | `await apiClient.iam.users.update({ id: userId, displayName: 'Mina' })` |
| `apiClient.iam.users.delete(input, options?)` | 利用者を削除 | 必須の `id` は対象の利用者 ID | 業務データなし | `await apiClient.iam.users.delete({ id: userId })` |
| `apiClient.iam.users.resetPassword(input, options?)` | 管理者としてパスワードを変更 | 必須の利用者 `id` と `newPassword` | 業務データなし | `await apiClient.iam.users.resetPassword({ id: userId, newPassword })` |
| `apiClient.iam.roles.list(input?, options?)` | ロールを一覧表示 | 業務入力なし | ロール一覧。結果はページ形式 | `await apiClient.iam.roles.list()` |
| `apiClient.iam.roles.get(input, options?)` | ロールを取得 | 必須の `id` は既存のロール ID | ロールまたは `null` | `await apiClient.iam.roles.get({ id: roleId })` |
| `apiClient.iam.roles.create(input, options?)` | ロールを作成 | 必須の `code` と `name`。任意の `description`、`isSystem` | 作成されたロール | `await apiClient.iam.roles.create({ code: 'reader', name: 'Reader' })` |
| `apiClient.iam.roles.update(input, options?)` | ロールを更新 | 必須の `id`。任意の `name`、`description` | 更新されたロール | `await apiClient.iam.roles.update({ id: roleId, name: 'Report reader' })` |
| `apiClient.iam.roles.delete(input, options?)` | ロールを削除 | 必須の `id` は対象のロール ID | 業務データなし | `await apiClient.iam.roles.delete({ id: roleId })` |
| `apiClient.iam.permissions.list(input, options?)` | 権限を一覧表示 | 必須のオブジェクト。`{}` で既定。絞り込みは[管理用項目](#iam-admin-inputs)を参照 | 権限一覧のページ | `await apiClient.iam.permissions.list({ type: 'api' })` |
| `apiClient.iam.permissions.get(input, options?)` | 権限を取得 | 必須の `id` は既存の権限 ID | 権限または `null` | `await apiClient.iam.permissions.get({ id: permissionId })` |
| `apiClient.iam.permissions.create(input, options?)` | 権限を作成 | 必須の `code` と `name`。[管理用項目](#iam-admin-inputs)を参照 | 作成された権限 | `await apiClient.iam.permissions.create({ code: 'reports:read', name: 'Read reports' })` |
| `apiClient.iam.permissions.setSensitiveOperations(input, options?)` | 再認証対象の操作を更新 | 必須の権限 `id` と `sensitiveOperations`。`[]` で解除 | 業務データなし | `await apiClient.iam.permissions.setSensitiveOperations({ id: permissionId, sensitiveOperations: ['iam.users.delete'] })` |
| `apiClient.iam.permissions.delete(input, options?)` | 権限を削除 | 必須の `id` は対象の権限 ID | 業務データなし | `await apiClient.iam.permissions.delete({ id: permissionId })` |

##### IAM 管理用項目

| 項目 | 用途と既定値 |
| --- | --- |
| `page`、`pageSize` | 利用者・権限一覧。ページ番号は 1 から、既定 1。件数は 1～100、既定 20 |
| `sortBy`、`sortDirection` | 利用者一覧の並び順。列は `username`、`email`、`displayName`、`accountStatus`、`createdAt`。方向は `asc` または `desc` |
| `search`、`roleCode`、`accountStatus` | `search` は利用者と権限の検索語。利用者一覧では 1～100 文字の `roleCode` および `active`、`dormant`、`closed` の状態を指定可 |
| `accountType`、`accountStatus`、`accountExpiresAt` | 作成、招待、更新に任意で指定。種類は `permanent` または `temporary`。招待時の状態は `active` のみ。期限は日付で、更新時の `null` は期限を解除 |
| `email`、`phone`、`displayName`、`avatarUrl`、`metadata`、`roleIds` | 利用者のプロフィールと割り当て。招待はホストが通知に使える連絡先を指定。`avatarUrl` は更新時に指定可。`roleIds` は既存ロールの ID 配列 |
| `type`、`resource`、`action`、`description`、`sensitiveOperations` | 権限作成の任意項目。`type` は `menu`、`api`、`button` で一覧の絞り込みにも使用。`sensitiveOperations` は 1～128 文字の操作 ID を最大 1,000 件 |

#### 利用例：認証と管理 API の呼び出し

既定の `apiClient` を初期化し、利用者一覧の閲覧権限がある管理者でログインした画面で使います。画面破棄時に中断するシグナルを渡します。

```ts
import { apiClient } from '@h-ai/api-client'

export async function loadUsers(signal: AbortSignal) {
  // 可視ユーザーの 1 ページ目を 20 件まで取得します。
  const users = await apiClient.iam.users.list({ page: 1, pageSize: 20 }, { signal })
  if (!users.success)
    return users
  return { items: users.data.items, total: users.data.total }
}
```

成功時は `items` に表示可能な利用者、`total` に該当件数を取得します。失敗時は元の `error` を返します。詳細や更新で必要な ID には、この一覧などで取得した対象の値を使用します。

<a id="iam-management-extensions"></a>

#### ロールの権限割り当てと API キー管理

[アプリのクライアント](#http-contract-extensions) で以下の 6 操作を呼び出します。Serv は `iam.roles.read` / `iam.roles.write` または `iam.apiKeys.read` / `iam.apiKeys.write` と対象アカウント／ロールへの権限を確認します。API キーの並べ替え項目は `name`、`createdAt`、`lastUsedAt`、`expiresAt` です。再認証の操作 ID は `iam.roles.replacePermissions`、`iam.apiKeys.create`、`iam.apiKeys.delete` です。対応するチケットを `options.context.reauthentication` に渡します。ロールの置換で競合した場合は、権限を再取得し、必要な新しいチケットを用意して再実行します。

| API | 用途 | 引数と既定値 | 戻り値とエラー | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `client.iam.roles.listPermissions(input, options?)` | ロールに直接割り当てた権限を一覧取得 | ロール一覧で取得した `id` が必須。 | `HaiResult` の `data` は権限レコードの配列。 | `await client.iam.roles.listPermissions({ id: roleId })` |
| `client.iam.roles.replacePermissions(input, options?)` | 直接付与された権限を一括置換 | ロールの `id`、変更後の全 `permissionIds` が必須。空配列で割り当てを解除。ポリシーに従い再認証チケットを渡す。 | `HaiResult<void>`。同時更新時は `error.httpStatus` が 409。 | `await client.iam.roles.replacePermissions({ id: roleId, permissionIds }, options)` |
| `client.iam.apiKeys.list(input, options?)` | 指定アカウントの API キー一覧 | `userId` が必須。`page`、`pageSize`、`search`、`enabled`、`sortBy`、`sortDirection` は任意。 | `HaiResult` は `items`、`total`、`page`、`pageSize` を返す。 | `await client.iam.apiKeys.list({ userId, page: 1, enabled: true })` |
| `client.iam.apiKeys.create(input, options?)` | アカウントの API キーを発行 | `userId`、`name` が必須。`scopes`、`expirationDays` は任意。有効日数の既定値は IAM 設定、`0` は無期限。 | `HaiResult` の `data.apiKey` がメタデータ、`data.rawKey` が今回限りのキー本体。 | `await client.iam.apiKeys.create({ userId, name, expirationDays: 30 }, options)` |
| `client.iam.apiKeys.get(input, options?)` | API キーのメタデータを取得 | 一覧の項目 ID または作成結果の `apiKey.id` を `id` に指定。 | `HaiResult` は接頭辞、状態、有効期限、スコープを返す。 | `await client.iam.apiKeys.get({ id: keyId })` |
| `client.iam.apiKeys.revoke(input, options?)` | API キーを失効 | キーのレコード `id` が必須。必要に応じ再認証チケットを渡す。 | `HaiResult<void>` | `await client.iam.apiKeys.revoke({ id: keyId }, options)` |

#### 利用例：レポート連携用のキーを発行する

対象の `userId` を選び、サーバーが `iam.apiKeys.create` を機密操作として設定している場合に現在のパスワードを入力します。成功時に今回だけ返る `rawKey` を連携先に渡します。後の一覧と詳細にはメタデータを表示し、キー本体はログに残さないでください。

```ts
import type { ProjectClient } from './project-api'

export async function issueReportKey(client: ProjectClient, userId: string, password: string) {
  const proof = await client.iam.auth.reauthenticate({ password, operation: 'iam.apiKeys.create' })
  if (!proof.success)
    return proof

  const issued = await client.iam.apiKeys.create({
    userId,
    name: 'Report reader',
    expirationDays: 30,
    scopes: ['reports:read'],
  }, { context: { reauthentication: proof.data.ticket } })
  if (!issued.success)
    return issued
  return { success: true as const, data: { id: issued.data.apiKey.id, rawKey: issued.data.rawKey } }
}
```

<a id="reauthentication"></a>

#### 利用例：再認証チケットを使って利用者を削除する

Serv で `iam.users.delete` が再認証を要求する場合の手順です。対象の `id` は管理画面の一覧から取得し、`password` は削除を実行する管理者に確認します。チケットの取得に失敗した時点では削除を送信しません。

```ts
import { apiClient } from '@h-ai/api-client'

export async function deleteUser(id: string, password: string) {
  // 現在の管理者のパスワードで、削除専用のチケットを取得します。
  const proof = await apiClient.iam.auth.reauthenticate({ password, operation: 'iam.users.delete' })
  if (!proof.success)
    return proof

  // 発行されたチケットを一度だけ使います。失敗時は元の結果を返します。
  const deleted = await apiClient.iam.users.delete({ id }, {
    context: { reauthentication: proof.data.ticket },
  })
  if (!deleted.success)
    return deleted
  return { success: true as const }
}
```

第 2 引数の `context.reauthentication` は再認証チケットの文字列です。API Client の OpenAPI リンクがこのリクエストの `X-Hai-Reauthentication` ヘッダーに移します。第 1 引数の `{ id }` は対象を指定する業務入力です。Serv の標準削除ルートは `iam.users.write` を確認し、ヘッダー、現在のアクセストークン、操作 ID `iam.users.delete` を `iam.auth.checkSensitiveOperation()` に渡します。IAM がチケットを一度だけ使用し、利用者、操作、セッションのバージョン、資格情報のバージョンを検証します。Kit ではアプリの権限と対象レコードをチェックしてから、書き込みの前に `kit.guard.requireSensitive(iam, event, operation)` を呼び出します。[Serv の認証](serv.ja.md#authentication) · [Kit のガード](kit.ja.md#auth)

ソースでは `packages/api-client/src/api-client-link.ts` の `buildRawClient()` にある `headers`、`packages/serv/src/features/serv-feature-iam.ts` の `users.delete` と `sensitive()`、`packages/iam/src/authn/iam-authn-functions.ts` の `checkSensitiveOperation()` の順に処理します。Kit では `packages/kit/src/guards/kit-sensitive.ts` の `requireSensitive()` がヘッダーを読み取ります。

<a id="custom-business-client"></a>

### アプリ独自の保護 API を呼び出す：`apiClient.create(contract)`

レポート画面で利用者が PDF または CSV の生成を依頼する例です。契約をクライアントとサーバーの共有モジュールに置きます。クライアントの呼び出し名は `reports.exports.create` で、HTTP では `POST /reports/{reportId}/exports` に対応します。アプリが直接使う `zod` を追加してください。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `client.reports.exports.create(input, options?)` | 対象レポートのエクスポートを依頼する | 一覧で選択した `reportId` と `format: 'pdf' \| 'csv'` が必須 | 成功した `data.exportId` は受理 ID。権限がなければ失敗結果 | `await client.reports.exports.create({ reportId: 'r-42', format: 'pdf' })` |

#### 利用例：選択したレポートのエクスポートを依頼する

Serv に登録する場合は [契約の登録](api-contract.ja.md#use-with-serv)に従い `reports.exports.create` のハンドラーを結び付けます。Kit の場合は [ファイルルートへの接続](api-contract.ja.md#use-with-kit)に従い、`reports/[reportId]/exports/+server.ts` の `POST` でパス引数と本文を共有 Schema で検証します。どちらの場合も、サーバーがセッション、アプリの権限 `reports:export`、対象レポートへのアクセスを確認します。Cookie を使う場合は同じホストに [IAM の認証ルート](#browser-refresh)も用意します。

```ts
import type { ApiClient } from '@h-ai/api-client'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'

export const ReportExportInputSchema = z.object({
  reportId: z.string().min(1),
  format: z.enum(['pdf', 'csv']),
})
export const ReportExportDataSchema = z.object({ exportId: z.string().min(1) })

// この契約はホストとクライアントが共有します。
export const reportContract = {
  iam: apiContract.iam,
  reports: {
    exports: {
      create: apiContract.route({
        method: 'POST',
        path: '/reports/{reportId}/exports',
        operationId: 'reports.exports.create',
      }).input(ReportExportInputSchema).output(apiContract.haiResultSchema(ReportExportDataSchema)),
    },
  },
}

export async function startReportClient(baseUrl: string) {
  const client = apiClient.create(reportContract)
  // 同一オリジンで /api/v1 に登録した場合はその値を渡し、Cookie 認証を有効にします。
  const ready = await client.init({ baseUrl, auth: {} })
  if (!ready.success)
    return ready
  return { success: true as const, data: client }
}

export async function requestReportExport(
  client: ApiClient<typeof reportContract>,
  input: z.input<typeof ReportExportInputSchema>,
) {
  // セッション確立後に、選択したレポート ID と出力形式を送信します。
  const result = await client.reports.exports.create(input)
  if (!result.success) {
    return {
      kind: result.error.httpStatus === 403 ? 'forbidden' as const : 'failed' as const,
      error: result.error,
    }
  }
  return { kind: 'accepted' as const, exportId: result.data.exportId }
}
```

`startReportClient('/api/v1')` に成功したら、そのインスタンスを `apiClient.createAuthActions(client)` に渡してログインします。たとえば `requestReportExport(client, { reportId: 'r-42', format: 'pdf' })` で選択したレポートを送信します。サーバーが受理すると `exportId` が得られるので、画面に受理済みと表示できます。認証済みの利用者にエクスポート権限がない場合は HTTP 403 が返り、画面には拒否理由を表示します。使い終えたら `client.close()` でインスタンスを解放します。

<a id="storage-requests"></a>
### オブジェクトストレージへのアクセス：`client.storage`

登録済みの Storage 操作でオブジェクトを管理します。署名付き URL を取得した場合、ブラウザーはストレージに直接アクセスします。アプリケーション経由で小さいファイルを転送するときは [アプリのクライアント](#http-contract-extensions) と対応する HTTPS ルートを使います。署名付き URL に対応しないローカルストレージでも利用できます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `client.storage.files.list(input, options?)` | 閲覧許可があるオブジェクトの一覧 | `input` 必須、`{}` 可。任意の `prefix`、`maxKeys`（1～1,000）、グループ化用の `delimiter`、前ページの `continuationToken` | オブジェクトと次ページの情報 | `await client.storage.files.list({ prefix: 'reports/', maxKeys: 20 })` |
| `client.storage.files.getMetadata(input, options?)` | オブジェクトのメタデータを取得 | 閲覧可能な `key` が必須 | キー、サイズ、コンテンツ型など | `await client.storage.files.getMetadata({ key })` |
| `client.storage.files.delete(input, options?)` | オブジェクトを削除 | 削除可能な `key` が必須 | 業務データなし | `await client.storage.files.delete({ key })` |
| `client.storage.files.deleteMany(input, options?)` | オブジェクトをまとめて削除 | `keys` は空でないキーの配列。ホストが各キーを確認 | 削除結果。部分失敗は `error.ext.deleteMany` に進捗が入る場合がある | `await client.storage.files.deleteMany({ keys: [key] })` |
| `client.storage.presignedUrls.createUpload(input, options?)` | 署名付きアップロード URL を発行 | `key` が必須。任意の `contentType` は既定 `application/octet-stream`、`expiresIn` は既定 900 秒 | 一時 URL とオブジェクトキー | `await client.storage.presignedUrls.createUpload({ key, contentType: 'application/pdf' })` |
| `client.storage.presignedUrls.createDownload(input, options?)` | 署名付きダウンロード URL を発行 | `key` が必須。任意の `expiresIn` は有効秒数、既定 900 | 一時 URL とオブジェクトキー | `await client.storage.presignedUrls.createDownload({ key, expiresIn: 60 })` |
| `client.storage.files.upload(input, options?)` | アプリケーション経由でアップロード | 認可されたオブジェクトの `key` と空でない `file: File` が必須。最大 5 MiB。 | `HaiResult` にメタデータが入る。同じキーに既存のオブジェクトがある場合は失敗。 | `await client.storage.files.upload({ key, file })` |
| `client.storage.files.download(input, options?)` | アプリケーション経由で添付ファイルをダウンロード | 読み取りが許可されたオブジェクトの `key` が必須。サーバーの上限は 5 MiB。 | 成功時は `File`、失敗時は `HaiResult<never>` の失敗分岐。 | `await client.storage.files.download({ key })` |

#### 利用例：PDF のアップロード URL を発行する

初期化済みでアップロードが許可されたクライアントを使用します。`key` はホストが利用者に割り当てた書き込み先、`file` はフォームで受け取った PDF です。署名取得後は、同じコンテンツ型でオブジェクトストレージの HTTPS URL に直接送信します。

```ts
import type { ApiClient } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'

export async function uploadReport(client: ApiClient<{ storage: typeof apiContract.storage }>, key: string, file: File) {
  const contentType = 'application/pdf'
  // 署名を取得します。権限やキーのエラーはそのまま返します。
  const signed = await client.storage.presignedUrls.createUpload({ key, contentType })
  if (!signed.success)
    return signed

  // 署名付きアドレスへ書き込み、ストレージからの成否を確認します。
  const uploaded = await fetch(signed.data.url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  })
  if (!uploaded.ok)
    throw new Error(`アップロードに失敗しました（HTTP ${uploaded.status}）`)
  return signed
}
```

#### 利用例：選択した PDF をアプリ経由で保存して読み直す

ファイル選択画面から `File` を受け取り、アプリは書き込みを許可したオブジェクトの `key` を割り当てます。成功時は結果のキーから同じファイルを取得します。成功時にプレビューや保存を提示し、どちらかが失敗したら結果のエラーを表示します。

```ts
import type { ProjectClient } from './project-api'

export async function verifyUploadedPdf(client: ProjectClient, key: string, file: File) {
  const uploaded = await client.storage.files.upload({ key, file })
  if (!uploaded.success)
    return uploaded

  const downloaded = await client.storage.files.download({ key: uploaded.data.key })
  if (!(downloaded instanceof File))
    return downloaded
  return { success: true as const, data: downloaded }
}
```

<a id="ai-requests"></a>

### チャット・記憶・セッションの API を呼ぶ：`client.ai`

サービスが AI ルートを登録すると、既定クライアントで JSON のチャット補完、メッセージ、履歴、記憶の取得、セッション一覧を利用できます。配信、記憶の書き込み、メディア操作には [アプリのクライアント](#http-contract-extensions) を使います。主体の既定値はログイン中の利用者で、指定した `objectId` はホストの認可に従います。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiClient.ai.chats.createCompletion(input, options?)` | メッセージから非ストリーミング補完を生成 | `messages` は必須の空でない配列。[チャット補完の要求項目](#ai-input-fields)を参照 | 応答候補、モデル、使用量、ツール呼び出し | `await apiClient.ai.chats.createCompletion({ messages: [{ role: 'user', content: 'Hello' }] })` |
| `apiClient.ai.chats.sendMessage(input, options?)` | セッションにメッセージを送信 | 必須の `message`。`sessionId` は既定 `default`。任意の `objectId`、`systemPrompt`、`model`、`temperature`（0～2） | 応答テキスト、モデル、任意の使用量 | `await apiClient.ai.chats.sendMessage({ message, sessionId })` |
| `apiClient.ai.chats.listHistory(input, options?)` | 履歴を取得 | 必須の `sessionId`。任意の `objectId`、`limit`（1～200）、`order`（`asc` または `desc`） | チャット履歴 | `await apiClient.ai.chats.listHistory({ sessionId, limit: 20 })` |
| `apiClient.ai.memories.list(input, options?)` | 記憶を一覧表示 | `input` は必須、`{}` 可。任意の `objectId`、`types` 配列、0 からの `offset`、`limit`（1～100） | 記憶の一覧 | `await apiClient.ai.memories.list({ objectId, limit: 20 })` |
| `apiClient.ai.memories.recall(input, options?)` | 内容で記憶を検索 | 必須の `query`。任意の `objectId`、`topK`（1 以上）、`types` 配列、`minImportance`（0～1） | 該当する記憶 | `await apiClient.ai.memories.recall({ query: 'preferred language', topK: 3 })` |
| `apiClient.ai.sessions.list(input, options?)` | セッションを一覧表示 | `input` 必須。`{}` は現在の認証主体、`objectId` は許可された主体 | セッションの一覧 | `await apiClient.ai.sessions.list({})` |
| `client.ai.chats.streamCompletion(input, options?)` | モデルの応答を順次受信 | `createCompletion` と同じ入力。単一呼び出しのオプションに `signal` を指定可能。 | 成功時は非同期イテレーター。開始前の失敗は結果、開始後は反復処理の例外。 | `await client.ai.chats.streamCompletion({ messages }, { signal })` |
| `client.ai.memories.add(input, options?)` | 記憶を一件保存 | `content`（1～5000 文字）、`type` が必須。`importance`（0～1）と認可された `objectId` は任意。 | `HaiResult`。記憶の `id`、`content`、`type` が `data` に入る。 | `await client.ai.memories.add({ content, type: 'preference' })` |
| `client.ai.memories.update(input, options?)` | 記憶を編集 | `id` と `content`、`type`、`importance` のいずれか一つ以上が必須。`objectId` は任意。 | `HaiResult`。記憶の `id`、`content`、`type` が `data` に入る。 | `await client.ai.memories.update({ id: memoryId, content })` |
| `client.ai.memories.remove(input, options?)` | 記憶を一件削除 | 記憶の `id` が必須。認可された `objectId` は任意。 | `HaiResult<void>` | `await client.ai.memories.remove({ id: memoryId })` |
| `client.ai.memories.clear(input, options?)` | 認可範囲の記憶を一括削除 | 既定の主体には `{}` を渡す。`objectId` と空でない `types` を指定可能。ホストによる明示的な認可が必要。 | `HaiResult<void>` | `await client.ai.memories.clear({ types: ['preference'] })` |
| `client.ai.audio.getCapabilities(input, options?)` | モデルの音声機能を確認 | `operation` に `transcribe` または `synthesize` を指定。`model` はホストの認可に従う。 | `HaiResult` はリアルタイム入力やストリーム出力など、操作別の機能を返す。 | `await client.ai.audio.getCapabilities({ operation: 'transcribe' })` |
| `client.ai.audio.issueTicket(input, options?)` | 音声 WebSocket チケットを取得 | `operation` は `transcribe` または `synthesize` が必須。`model` は任意。 | `HaiResult` に一回限りの `ticket` とミリ秒の `expiresAt` が入る。有効期間は 30 秒。 | `await client.ai.audio.issueTicket({ operation: 'synthesize' })` |
| `client.ai.audio.transcribe(input, options?)` | 録音を書き起こす | WAV または MP3 の `audio: File`（最大 8 MiB）が必須。`language`、`model` は任意。 | `HaiResult<{ text, language?, durationMs? }>` | `await client.ai.audio.transcribe({ audio })` |
| `client.ai.audio.synthesize(input, options?)` | テキストから音声を合成 | `text`（1～5000 文字）が必須。`voice`、`model`、`format`（既定 `wav`、または `mp3`）は任意。 | 成功時に音声 `File`、失敗時に失敗結果。 | `await client.ai.audio.synthesize({ text, format: 'mp3' })` |
| `client.ai.images.generate(input, options?)` | プロンプトと任意の参照画像から一枚生成 | `prompt`（1～5000 文字）が必須。`model`、`width` と `height` の組（各 1～2048）、最大 4 枚・合計 10 MiB の `referenceImages` は任意。 | 成功時に画像 `File`、失敗時に失敗結果。 | `await client.ai.images.generate({ prompt, referenceImages })` |

<a id="ai-input-fields"></a>

#### チャット補完の要求項目

| 項目 | 用途と既定値 |
| --- | --- |
| `messages` | 空でない配列。ロールは `system`、`user`、`assistant`、`tool`。本文は文字列または `{ type: 'text', text }` のパーツ。利用者メッセージでは `image_url` パーツに `url` と任意の `detail`（`auto`、`low`、`high`）を指定可 |
| `messages[].tool_calls`、`messages[].tool_call_id` | アシスタントのツール呼び出しは `id`、`type: 'function'`、`function.name` と JSON 文字列の `function.arguments` を指定。本文を省略する場合はツール呼び出しが必要。ツール結果には対応する `tool_call_id` を指定 |
| `objectId`、`sessionId`、`model` | 主体、セッション、モデルを指定可。省略時は認証主体、`default` セッション、ホストのモデル設定 |
| `temperature`、`top_p`、`max_tokens` | 任意の温度（0～2）、サンプリング確率（0～1）、最大生成トークン数（正整数） |
| `tools`、`tool_choice` | 任意の関数ツールの配列。`type: 'function'` と `function.name` が必須。説明、JSON Schema の引数、`strict` は任意。`tool_choice` には `auto`、`none`、`required`、または定義済みの関数を指定 |

#### 利用例：保存済みの会話を開き、メッセージを送る

チャット画面では、初期化済みの既定クライアントにログインしておきます。`listChatSessions()` の成功結果にある各項目の `sessionId` を会話選択欄に使います。利用者が会話を選んだら、`readChatHistory()` で履歴を読み込み、各レコードのメッセージと `response.content` を表示します。同じ `sessionId` と入力欄の文面を `sendChatMessage()` に渡し、`success` を確認してから `data.content` を応答として追加します。

```ts
import { apiClient } from '@h-ai/api-client'

export function listChatSessions(signal?: AbortSignal) {
  return apiClient.ai.sessions.list({}, { signal })
}

export function readChatHistory(sessionId: string, signal?: AbortSignal) {
  return apiClient.ai.chats.listHistory({ sessionId, limit: 20, order: 'asc' }, { signal })
}

export function sendChatMessage(sessionId: string, message: string, signal?: AbortSignal) {
  return apiClient.ai.chats.sendMessage({ sessionId, message }, { signal })
}
```

#### 利用例：問い合わせへの返信案を生成する

画面側でメッセージの並びを組み立てる場合は `createCompletion()` を使います。サポート画面が返信の指示を設定し、利用者が問い合わせ内容を入力します。SDK がそのメッセージをサーバーに送り、JSON の結果を受け取ります。関数は応答の最初のテキストと使用トークン数を返します。返信案は担当者が確認してから送信します。

```ts
import { apiClient } from '@h-ai/api-client'

export async function draftSupportReply(request: string, signal?: AbortSignal) {
  const result = await apiClient.ai.chats.createCompletion({
    messages: [
      { role: 'system', content: '簡潔なサポート返信案を作成してください。' },
      { role: 'user', content: request },
    ],
  }, { signal })
  if (!result.success)
    return result
  return {
    success: true as const,
    data: { text: result.data.choices[0]?.message.content ?? null, tokenCount: result.data.usage.total_tokens },
  }
}
```

#### 利用例：ログイン中の利用者の保存済み設定を一覧・検索する

アカウント画面のページ付き一覧では `listPreferences(offset)` を使います。`data.items` を表示し、`data.total` から次のページがあるか確認します。検索欄から `recallPreferences(query)` を呼び出します。例えば「希望言語」で検索し、`data.items` の一致結果を表示します。どちらも `objectId` を省略するとログイン中の利用者が対象になります。

```ts
import { apiClient } from '@h-ai/api-client'

export function listPreferences(offset: number) {
  return apiClient.ai.memories.list({ types: ['preference'], offset, limit: 20 })
}

export function recallPreferences(query: string) {
  return apiClient.ai.memories.recall({ query, topK: 5, types: ['preference'] })
}
```

#### 利用例：会話画面で最初の候補を順に表示する

質問の送信前に `AbortController` を作り、その `signal` を渡します。`onText` で回答に差分を追加し、`done` で完了します。中止や画面離脱でリクエストを取り消し、反復中の例外は画面側で処理します。

```ts
import type { ProjectClient } from './project-api'

export async function streamAnswer(
  client: ProjectClient,
  question: string,
  onText: (text: string) => void,
  signal: AbortSignal,
) {
  const events = await client.ai.chats.streamCompletion({
    messages: [{ role: 'user', content: question }],
  }, { signal })
  if (!(Symbol.asyncIterator in events))
    throw new Error(events.error.message)

  for await (const event of events) {
    if (event.type === 'done')
      return
    const text = event.choices.find(choice => choice.index === 0)?.delta.content
    if (text)
      onText(text)
  }
}
```

#### 利用例：録音を書き起こして試聴ファイルを作る

画面から WAV または MP3 を渡します。書き起こしにテキストがあれば MP3 を合成します。成功時は音声ファイルを返します。書き起こしが空なら `null` を返し、画面で合成できるテキストがないことを表示できます。

```ts
import type { ProjectClient } from './project-api'

export async function makeVoicePreview(client: ProjectClient, recording: File) {
  const transcript = await client.ai.audio.transcribe({ audio: recording })
  if (!transcript.success)
    return transcript
  if (!transcript.data.text.trim())
    return { success: true as const, data: null }

  const speech = await client.ai.audio.synthesize({ text: transcript.data.text, format: 'mp3' })
  if (!(speech instanceof File))
    return speech
  return { success: true as const, data: speech }
}
```

音声と参照画像のアップロードは multipart を使います。合成音声と生成画像は `File` として扱い、`URL.createObjectURL(file)` でプレビューした後に URL を解放します。リアルタイム音声は WebSocket を使います。`@h-ai/ai/client` の `getTicket` で接続のたびに `client.ai.audio.issueTicket(request)` を呼び出します。成功時は `data.ticket` を返し、失敗時は利用者に知らせて接続を中止します。

<a id="audit-requests"></a>

### 監査ログを照会・保存：`client.audit`

[アプリの契約](#http-contract-extensions) に `audit` があると、管理画面で照会、集計、アーカイブができます。Serv の権限は `audit:read` と `audit:backup` です。対象範囲と `audit.backup` の再認証はホストが決めます。受領情報の `key` は非公開ストレージのキーです。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値とエラー | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `client.audit.logs.list(input, options?)` | 監査ログをページ取得 | 既定のページには `{}` を渡す。ページ、分類、結果、重大度、利用者、範囲、リソース、操作、追跡 ID、ISO 日時の期間、並び順は任意。 | `HaiResult` の `data.items` にログ、`data.total` に総数が入る。 | `await client.audit.logs.list({ page: 1, outcome: 'denied' })` |
| `client.audit.logs.stats(input, options?)` | 操作ごとの件数を集計 | `days` は 0～365 日、既定 7 日。分類、結果、重大度、範囲、利用者、リソースで絞り込み可能。 | `HaiResult<{ action, count }[]>` | `await client.audit.logs.stats({ days: 7 })` |
| `client.audit.backup.run(input, options?)` | 監査ログを非公開アーカイブに保存 | 操作の UUID `id` が必須。同じ操作の再試行では再利用。再認証はホストの方針に従う。 | `HaiResult` にアーカイブの `key`、`recordCount`、`sha256` と日時が入る。 | `await client.audit.backup.run({ id: archiveId }, options)` |

#### 利用例：直近 1 週間の拒否された操作を確認する

監査画面を開いたら、ログのページと統計に同じ結果フィルターを適用します。ログの内容を表で、直近 7 日間の件数を操作別の集計で表示します。両方が成功してから画面を更新します。

```ts
import type { ProjectClient } from './project-api'

export async function loadDeniedAudit(client: ProjectClient) {
  const recent = await client.audit.logs.list({ page: 1, pageSize: 20, outcome: 'denied' })
  if (!recent.success)
    return recent

  const weekly = await client.audit.logs.stats({ days: 7, outcome: 'denied' })
  if (!weekly.success)
    return weekly
  return { success: true as const, data: { recent: recent.data, weekly: weekly.data } }
}
```

<a id="payment-requests"></a>

### 支払いと注文を操作：`client.payment.orders`

[アプリの注文ルート](#http-contract-extensions) で支払いの開始、状態の確認、返金、未払い注文の終了ができます。ホストが注文と操作者を認可し、金額は業務と決済サービスの取り決めに従います。決済サービスのコールバックはサーバーの通知ルートが受信します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値とエラー | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `client.payment.orders.create(input, options?)` | 注文の支払いパラメーターを取得 | `provider`、整数の `amount`、`description`、`tradeType` が必須。WeChat は `jsapi` とチャネルの `userId` が必要。Alipay と Stripe は `h5`。`metadata` は任意。 | `HaiResult` は `clientParams` と任意の `prepayId` を返す。 | `await client.payment.orders.create({ provider: 'stripe', tradeType: 'h5', amount, description })` |
| `client.payment.orders.get(input, options?)` | 注文の状態を確認 | 業務の注文レコードから得た `orderNo` が必須。 | `HaiResult`。成功時に `status` を確認できる。 | `await client.payment.orders.get({ orderNo })` |
| `client.payment.orders.refund(input, options?)` | 返金を依頼 | `provider`、`orderNo`、`refundNo`、整数の `amount` が必須。`reason` は任意。 | `HaiResult` に `refundNo`、`refundId` と返金状態が入る。 | `await client.payment.orders.refund({ provider, orderNo, refundNo, amount })` |
| `client.payment.orders.close(input, options?)` | 未払い注文を終了 | 対象注文の `provider` と `orderNo` が必須。ホストが注文への権限とチャネルを照合。 | `HaiResult<void>` | `await client.payment.orders.close({ provider, orderNo })` |

#### 利用例：未払い注文を終了して状態を再取得する

注文が `pending` のとき、権限のある操作者に終了を確認します。確認後に記録のチャネルと加盟店注文番号を渡し、成功後に状態を再取得します。失敗時は結果のエラーを表示します。

```ts
import type { PaymentCloseOrderInput } from '@h-ai/api-contract'
import type { ProjectClient } from './project-api'

export async function closeUnpaidOrder(client: ProjectClient, order: PaymentCloseOrderInput) {
  const closed = await client.payment.orders.close(order)
  if (!closed.success)
    return closed
  return client.payment.orders.get({ orderNo: order.orderNo })
}
```

<a id="feedback-requests"></a>

### フィードバックを送信・処理 `client.feedback`

アプリの契約に `apiContract.feedback` を登録すると、ログイン済みの `client.feedback` から提出、参照、返信を行えます。対象範囲、利用者、権限はサーバーで信頼できるセッションから決定します。

| API | 用途 | 呼び出し例 |
| --- | --- | --- |
| `client.feedback.reports.submit(input, options?)` | 本文と添付を提出 | `await client.feedback.reports.submit({ id, body, attachments })` |
| `client.feedback.reports.listMine(input, options?)` | 自分の問題票を一覧表示 | `await client.feedback.reports.listMine({})` |
| `client.feedback.reports.list(input, options?)` | 担当者が一覧を取得 | `await client.feedback.reports.list({ status: 'pending' })` |
| `client.feedback.reports.get(input, options?)` | 本文と最初の添付を取得 | `await client.feedback.reports.get({ id })` |
| `client.feedback.reports.listMessages(input, options?)` | 最新の返信をページで取得 | `await client.feedback.reports.listMessages({ id, page: 1 })` |
| `client.feedback.reports.addMessage(input, options?)` | 返信または追加情報を依頼 | `await client.feedback.reports.addMessage({ id, messageId, body, kind: 'reply' })` |
| `client.feedback.reports.setStatus(input, options?)` | 未処理または処理済みに変更 | `await client.feedback.reports.setStatus({ id, status: 'handled' })` |
| `client.feedback.attachments.get(input, options?)` | 選択した添付を取得 | `await client.feedback.attachments.get({ id, attachmentId })` |

#### 利用例：提出して詳細を開く

アプリの非同期関数でフィードバック契約のある `client` を使います。提出成功後に返された ID で詳細を開きます。

```ts
const submitted = await client.feedback.reports.submit({ id, body, attachments })
if (!submitted.success)
  return submitted
return client.feedback.reports.get({ id: submitted.data.id })
```

[@h-ai/feedback](feedback.ja.md#api-reference)

<a id="encrypted-requests"></a>

### HTTPS 上にアプリケーション層の暗号化を追加する：`client.init({ transport })`

暗号化はインスタンス単位です。ホストの暗号化を有効にし、鍵交換パスを一致させます。Serv の設定は API 接頭辞からの相対パス、Kit の設定ではマウント先を含むパスを使用します。クライアントは HTTPS でホストを確認して鍵交換を行い、サービスの秘密鍵はホストで管理します。GET や HEAD など本文がないリクエストも対象です。別オリジンの場合は CORS で `X-Hai-Transport` リクエストヘッダーを許可し、同名のレスポンスヘッダーを公開します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `client.init(config)` | インスタンスの暗号化を有効にする | `config.baseUrl` と `config.transport.crypto` は必須。鍵交換パスとサイズ上限は[暗号化オプション](#暗号化オプション)を参照 | 初期化の `HaiResult<void>`。暗号化セッションの確立は初回送信時 | `await client.init({ baseUrl, transport: { crypto } })` |

#### 利用例：トランスポート暗号化を有効にする

`pnpm add @h-ai/crypto` を実行します。[Serv のホスト設定](serv.ja.md#host-options)または [Kit の暗号化設定](kit.ja.md#transport)で IAM と暗号化した通信を公開してから、`baseUrl` に稼働中の HTTPS アドレスを渡します。この例は共有の crypto を初期化して終了するので、独立したプロセスで実行します。

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { crypto } from '@h-ai/crypto'

export async function loadEncryptedAuthPolicy(baseUrl: string) {
  // 暗号化に使う crypto を準備します。
  const started = await crypto.init()
  if (!started.success)
    return started

  const contract = apiContract.create({ iam: apiContract.iam })
  const client = apiClient.create(contract)
  try {
    // IAM までの接頭辞を含むアドレスと、初期化済みの暗号サービスを渡します。
    const ready = await client.init({ baseUrl, transport: { crypto } })
    if (!ready.success)
      return ready

    // 初回の呼び出しで鍵を交換し、公開設定を読み取ります。
    const policy = await client.iam.auth.publicConfig()
    if (!policy.success)
      return policy
    return policy.data
  }
  finally {
    try {
      await client.close()
    }
    finally {
      await crypto.close()
    }
  }
}
```

平文サイズや圧縮上限の設計は[暗号化通信の容量](crypto.ja.md#transport-capacity)を参照してください。暗号化後もサーバーが利用者と操作の権限を確認します。

<a id="plain-https-requests"></a>

### 通常の HTTPS を受け付けるルートを呼び出す：`client.init(config)` または `fetch`

サーバーの手続きで `encryption: 'disabled'` を指定するか、サーバーの `transport.excludePaths` に対象を設定します。クライアント側では `transport` を省略した別のインスタンスを作成するか、通常の `fetch` を使用します。`excludePaths` はサーバー側の設定です。

#### 利用例：通常の HTTPS を受け付けるルートを呼び出す

Serv のヘルスチェック `/health` が有効で、通常の HTTPS で呼び出せることを確認します。API ルーターとは別のこのパスへホストの原点を渡します。

```ts
export async function checkHealth(origin: string) {
  const response = await fetch(new URL('/health', origin))
  if (!response.ok)
    throw new Error(`稼働確認に失敗しました（HTTP ${response.status}）`)
  return response.json()
}
```

成功時、Serv の応答は `{ status: 'ok' }` です。

<a id="transport-observation"></a>
### リクエストの結果を記録する：`client.observeRequests(observer)`

購読先のインスタンスごとに、ひとまとまりの業務呼び出しにつき 1 件の記録が届きます。HTTP 200 の `HaiResult` でも `success: false` なら失敗になります。更新や鍵交換の内部通信は独立した記録にならず、業務リクエストの再試行は `attempts` に含まれます。ストリームでは確立時点の結果を記録します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `client.observeRequests(observer)` | 業務呼び出しの結果を購読 | `ApiRequestRecord` を受け取る同期関数 | 解除関数。コールバックの例外はリクエスト結果に影響しない | `const stop = client.observeRequests(record => collect(record))` |

| 記録の項目 | 観測できる内容 |
| --- | --- |
| `requestId`、`procedure` | 呼び出しの関連 ID と契約内の手続き名 |
| `timestamp`、`duration` | 開始時刻（Unix ミリ秒）と所要時間（ミリ秒） |
| `success`、`attempts`、`errorCode` | 最終成否、業務リクエストの試行数、失敗時のコード（取得可能な場合） |
| `method`、`url`、`status` | 取得できた場合の HTTP メソッド、URL、レスポンスステータス |

URL からクエリ、フラグメント、ユーザー情報が除去されますが、パスには利用者や業務レコードの ID が含まれることがあります。記録に送受信ヘッダーや本文は入りません。集計には `procedure` などを使い、コールバック内で扱うデータ量を制限します。購読の解除関数を呼ぶと観測が止まり、`client.close()` でも全解除されます。

#### 利用例：公開設定のリクエストを計測する

初期化済みのクライアントを使い、結果の成否と手続き名を集計処理に渡します。

```ts
import type { ApiClient, ApiRequestRecord } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'

export async function observePolicy(
  client: ApiClient<{ iam: typeof apiContract.iam }>,
  recordResult: (record: Pick<ApiRequestRecord, 'procedure' | 'success' | 'duration'>) => void,
) {
  const stop = client.observeRequests(({ procedure, success, duration }) => recordResult({ procedure, success, duration }))
  try {
    // 実際に公開設定を読み取ると、一度だけ購読のコールバックが呼ばれます。
    const policy = await client.iam.auth.publicConfig()
    if (!policy.success)
      return policy
    return policy.data
  }
  finally {
    stop()
  }
}
```

<a id="custom-response-results"></a>

### レポートのエクスポート進捗を SSE で取得する

[レポートのエクスポートを依頼](#custom-business-client)して受理されると `exportId` が返ります。画面でその ID を使って `GET /reports/exports/{exportId}/progress` を呼び出します。SSE（Server-Sent Events）では、サーバーが同じ HTTP レスポンスで進捗を複数回送ります。画面は完了件数と総件数を表示し、`ready` を受信したらダウンロードを有効にします。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `eventIterator(schema)` | 応答をイベントストリームとして宣言 | `@orpc/contract` から読み込み、1 件のイベントのスキーマを渡す | クライアントに非同期イテレーターが返る | `.output(eventIterator(ExportProgressSchema))` |
| `progressClient.reports.exports.watchProgress(input, options?)` | 1 件のエクスポートを購読 | 受付結果の `{ exportId }` と任意の中断シグナル `signal` を渡す | 開始時は失敗結果、成功時は非同期イテレーター | `await progressClient.reports.exports.watchProgress({ exportId }, { signal })` |

この API は下のアプリ契約で定義します。他のエンドポイントでは、数値などの JSON 値を直接返す契約も定義できます。成功時はその値、失敗時は失敗分岐が返ります。クライアントは JSON Schema に変換できる Zod の JSON 出力を検証し、ISO 日付文字列など通信上の表現を保持します。

#### 利用例：エクスポートの受付からダウンロードまでの進捗を確認する

実行には `@h-ai/api-client`、`@h-ai/api-contract`、`@orpc/contract`、`zod` を直接インストールします。Fetch のテスト用実装を使う `runReportProgressDemo()` を実行します。受付済みの `exp-42` を再現し、`0/3`、`2/3`、`3/3` の順にイベントを送ります。

```ts
import { apiClient, type ApiClientConfig } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { eventIterator } from '@orpc/contract'
import { z } from 'zod'

const ExportProgressSchema = z.object({
  completed: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  state: z.enum(['running', 'ready']),
})
type ExportProgress = z.infer<typeof ExportProgressSchema>

const progressContract = {
  reports: {
    exports: {
      watchProgress: apiContract.route({
        method: 'GET',
        path: '/reports/exports/{exportId}/progress',
      })
        .input(z.object({ exportId: z.string().min(1) }))
        .output(eventIterator(ExportProgressSchema)),
    },
  },
}

function demoEndpoint(request: Request): Response {
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.pathname !== '/api/v1/reports/exports/exp-42/progress')
    return new Response(null, { status: 404 })

  const events: ExportProgress[] = [
    { completed: 0, total: 3, state: 'running' },
    { completed: 2, total: 3, state: 'running' },
    { completed: 3, total: 3, state: 'ready' },
  ]
  const encoder = new TextEncoder()
  let canceled = false
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      await new Promise(resolve => setTimeout(resolve, 100))
      if (canceled)
        return
      const progress = events.shift()
      if (!progress) {
        controller.close()
        return
      }

      // oRPC クライアント向けに SSE フレームを送信し、最終イベントで終了します。
      controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(progress)}\n\n`))
      if (progress.state === 'ready')
        controller.close()
    },
    cancel() {
      canceled = true
    },
  })
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}

export async function watchReportExport(
  config: ApiClientConfig,
  exportId: string,
  signal: AbortSignal,
  render: (progress: ExportProgress) => void,
) {
  const progressClient = apiClient.create(progressContract)
  const ready = await progressClient.init(config)
  if (!ready.success)
    return ready

  try {
    const events = await progressClient.reports.exports.watchProgress({ exportId }, { signal })
    if (!(Symbol.asyncIterator in events))
      return events
    for await (const progress of events) {
      render(progress)
      if (progress.state === 'ready')
        return { success: true as const, data: progress }
    }
    throw new Error('The connection closed before the export was ready')
  }
  finally {
    await progressClient.close()
  }
}

export async function runReportProgressDemo() {
  const controller = new AbortController()
  const config: ApiClientConfig = {
    baseUrl: 'https://reports.example.test/api/v1',
    fetch: async (input, init) => demoEndpoint(new Request(input, init)),
  }
  const snapshots: string[] = []
  const result = await watchReportExport(config, 'exp-42', controller.signal, ({ completed, total }) => {
    snapshots.push(`${completed}/${total}`)
  })
  if (!result.success)
    return result
  return { success: true as const, data: { snapshots, downloadEnabled: result.data.state === 'ready' } }
}
```

成功時は `data.snapshots` が `['0/3', '2/3', '3/3']`、`downloadEnabled` が `true` になります。ID を `exp-99` に変更すると開始時の 404 を確認できます。実際のアプリでは GET ハンドラーがセッションとタスクの所有者を確認してから、同じフレーム形式で進捗を送ります。進捗手続きをレポート契約に加えると、ログイン済みクライアントを再利用できます。画面を破棄するときは `abort()` で読み取りを中断します。開始後の障害や中断は反復処理の例外になります。エクスポート自体はサーバー側で管理します。

<a id="errors"></a>
<a id="error-handling"></a>
### 呼び出しの失敗を処理する：`HaiApiClientError`

標準の手続きでは `success` を先に確認し、失敗時は `error.code` と、存在すれば `error.traceId` を参照します。サーバーの `HaiResult` の業務エラーや、認識できる非成功 HTTP 応答の業務エラーは、コードを保ったまま呼び出し側へ返ります。サーバーの 5xx に含まれる詳細はクライアント向けに伏せられることがあります。

#### インターフェース一覧

| `HaiApiClientError` | コード | 既定の HTTP ステータス | 用途 |
| --- | --- | --- | --- |
| `NETWORK_ERROR` | `hai:api-client:001` | 502 | サーバーへの到達や通信に失敗 |
| `TIMEOUT` | `hai:api-client:002` | 504 | リクエストの待機期限、または `AbortError` としての中断 |
| `SERVER_ERROR` | `hai:api-client:003` | 502 | 業務エラーとして解釈できない上流障害 |
| `UNAUTHORIZED` | `hai:api-client:004` | 401 | 認証に失敗、または開始時の認証状態が変更済み |
| `FORBIDDEN` | `hai:api-client:005` | 403 | 操作が許可されていない |
| `NOT_FOUND` | `hai:api-client:006` | 404 | 対象の HTTP リソースが見つからない |
| `VALIDATION_FAILED` | `hai:api-client:007` | 400 | 契約の検証や通信形式で失敗 |
| `TOKEN_REFRESH_FAILED` | `hai:api-client:008` | 401 | トークン更新失敗を表す定義。自動更新後も元のエラーが返ることがある |
| `NOT_INITIALIZED` | `hai:api-client:010` | 500 | `init` 完了前、または終了後に呼び出した |
| `CONFIG_ERROR` | `hai:api-client:011` | 500 | 初期化設定、またはインスタンスの状態に問題がある |
| `PAYLOAD_TOO_LARGE` | `hai:api-client:020` | 413 | 送信または受信データが上限を超えた |
| `UNKNOWN` | `hai:api-client:099` | 500 | 上の分類に当てはまらない失敗 |

暗号化通信の時刻エラーは `VALIDATION_FAILED` として返り、`error.cause.transportCode` と `serverTime`（Unix ミリ秒）が診断に使えます。サイズ超過時は `direction`、`stage`、`limitBytes`、`actualBytes` などを確認できます。ローカル資格情報の読み書きやストリームの反復処理は Promise を拒否する場合があります。アプリのログには関連 ID、手続き、コードを使い、資格情報、本文、署名付き URL は記録しないでください。

#### 利用例：待機期限とサービスからのエラーを扱う

初期化済みの IAM クライアントで、プロフィールの読み込みに失敗した理由を画面の処理に渡します。

```ts
import type { ApiClient } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'
import { HaiApiClientError } from '@h-ai/api-client'

export async function readProfile(client: ApiClient<{ iam: typeof apiContract.iam }>) {
  // プロフィールが取得できない場合は、コードと関連 ID を確認します。
  const profile = await client.iam.auth.currentUser()
  if (profile.success)
    return { user: profile.data }

  const { code, traceId } = profile.error
  return { timedOut: code === HaiApiClientError.TIMEOUT.code, code, traceId }
}
```

設定の所有者は[クライアント設定](../configuration/api-client.ja.md)、応答や保存データは[クライアントのデータ構造](../data/api-client.ja.md)を参照してください。
