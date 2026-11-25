# @h-ai/api-client API リファレンス

共有 API 契約から型付き HTTP クライアントを作成し、IAM やアプリの手続きを呼び出します。ブラウザーのログイン状態を維持する場合は認証を有効にし、リクエスト時に資格情報を補います。

[简体中文](api-client.md) · [English](api-client.en.md)

<a id="quick-start"></a>

## クイックスタート

<a id="module-dependencies"></a>

### 依存関係

| 依存先 | 用途 | 利用条件 | 初期化順序 |
| --- | --- | --- | --- |
| Fetch API を備えたブラウザーまたは Node.js | HTTP 通信とリクエストの中断 | 常に必要。独自環境では互換 Fetch を注入 | クライアント初期化時に必要 |
| `@h-ai/api-contract` | ホストと共有する手続きを定義 | この例ではアプリから直接インポート | クライアントの作成前に契約を組み立てる |
| IAM の公開ルートを公開する HTTP ホスト | 認証設定を取得 | 以下の公開設定の例に必要 | 呼び出し前に [Serv](serv.ja.md) または [Kit](kit.ja.md) などのホストで公開 |
| `@h-ai/crypto` | アプリケーション層の通信暗号化 | `transport` を使用する場合のみ | crypto を先に初期化し、クライアントを先に終了 |

### インストール

```bash
pnpm add @h-ai/api-client @h-ai/api-contract
```

<a id="利用例"></a>

### 公開ログイン設定を読み取る

IAM の `GET /auth/config` が `/api/v1` の下に登録され、ホストがポート 3000 で稼働している場合は `loadAuthPolicy('http://localhost:3000/api/v1')` を呼び出します。配備先では公開 HTTPS アドレスと実際の API 接頭辞を渡します。

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function loadAuthPolicy(baseUrl: string) {
  // ホストと共有する IAM 契約から独立したクライアントを作ります。
  const contract = apiContract.create({ iam: apiContract.iam })
  const client = apiClient.create(contract)
  // 公開ルートなので資格情報の設定は省略します。
  const ready = await client.init({ baseUrl })
  if (!ready.success)
    return ready

  try {
    // 入力なしで許可されたログイン方式などを読み取ります。サービスの失敗も呼び出し元へ返します。
    const policy = await client.iam.auth.publicConfig()
    if (!policy.success)
      return policy
    // data が null の場合は、公開設定を利用できません。
    return policy
  }
  finally {
    await client.close()
  }
}
```

呼び出し元で `success` を確認し、`data` が利用できればログイン画面に現在の方式を表示します。設定に該当する認証フォームが必要なら [認証フォームの接続](#auth-actions)を参照してください。[公開設定の応答](../data/api-contract.ja.md#public-settings)で主要フィールドを確認できます。

<a id="api-reference"></a>

## 機能

<a id="client-lifecycle"></a>

### クライアントの準備と分離：`apiClient`

`apiClient` 自体も既定のクライアントです。接続先、認証状態、試験用 Fetch のいずれかを分ける場合は、同じ契約から独立したクライアントを作ります。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiClient.create(contract)` | 独立したクライアントを作成 | `contract` はホストと共有するルーター。たとえば [`apiContract.create` の戻り値](api-contract.ja.md#use-with-client) | `ApiClient<TContract>`。ここでは接続を開始しない | `const client = apiClient.create(contract)` |

#### 利用例：SSR のリクエスト専用にクライアントを作る

SSR では認証情報とストレージをリクエストごとに用意します。`create` が返す新しいインスタンスをその処理だけで使用し、完了時に解放します。[発行済みの資格情報で利用者を取得する例](#detailed-workflow)で、作成から解放まで確認できます。

<a id="client-integration"></a>

### クライアントを初期化、確認、終了する：`client.init(config)`

接続先とオプションを設定し、使い終えたインスタンスを解放します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `client.init(config)` | 接続、認証、通信の設定を適用 | `config` は `ApiClientConfig`。下の表を参照 | `Promise<HaiResult<void>>`。成功後または終了中の再初期化は `CONFIG_ERROR` | `await client.init({ baseUrl, auth: {} })` |
| `client.close()` | 現在のインスタンスの通信セッションと購読を解放 | 引数なし | `Promise<void>`。完了後は再初期化可 | `await client.close()` |
| `client.isInitialized` | 初期化の成否を確認 | 読み取り専用 | `boolean` | `const active = client.isInitialized` |
| `client.config` | 適用された設定を確認 | 読み取り専用 | 機密項目を除いた設定。未初期化時は `null` | `const endpoint = client.config?.baseUrl` |

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

##### 暗号化オプション

| `config.transport` の項目 | 型と既定値 | 効果 |
| --- | --- | --- |
| `crypto` | 初期化済みの `CryptoFunctions`、`transport` 使用時に必須 | クライアントの暗号化セッションを作成 |
| `keyExchangePath` | `string`、既定 `/_hai/key-exchange` | API 接頭辞の下でホストと一致させる鍵交換パス |
| `maxPlaintextBytes` | `number`、省略時はホストの上限を使用 | 平文 UTF-8 バイト数の上限。指定時はホストとローカルの小さい方を使用 |

##### クライアントのアドレス・期限・復旧

Node.js や SSR では絶対 URL を渡します。URL のユーザー情報、クエリ、フラグメントおよびスキームを省略した `//host` 形式は使用できません。ブラウザーの別オリジン通信では、ホストの CORS 設定を接続元に合わせます。

同じインスタンスで並行する初期化は同じ処理を待ちます。初期化の完了は設定が有効になったことを示します。接続の成否は実際の手続きの結果で確認します。設定を切り替えるときは `close()` の完了を待ちます。組み立てた契約にある手続きだけが使用でき、条件付きドメインは `client.payment?.orders` のように参照できます。`then` は予約されています。

#### 利用例：クライアントの準備と分離

同じ IAM 契約で一時的に別のホストを確認します。`baseUrl` は IAM が稼働している環境から取得します。公開設定を実際に読み取るコードは[クイックスタート](#quick-start)を参照してください。

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function checkApiAddress(baseUrl: string) {
  const contract = apiContract.create({ iam: apiContract.iam })
  const client = apiClient.create(contract)
  // このインスタンスだけに URL と 15 秒の期限を適用します。
  const ready = await client.init({ baseUrl, timeout: 15_000 })
  if (!ready.success)
    return ready

  try {
    return { active: client.isInitialized, baseUrl: client.config?.baseUrl }
  }
  finally {
    await client.close()
  }
}
```

<a id="credentials"></a>
<a id="資格情報の保存と更新apiclientauthtokenstorage"></a>

### 資格情報の保存と更新：`client.auth`・`apiClient.tokenStorage`

認証を使うクライアントを `auth` 付きで初期化します。`TokenPair` は必須の `accessToken`、任意の `refreshToken`、有効期間を秒で表す `expiresIn`、固定値 `tokenType: 'Bearer'` を含みます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `client.auth.setTokens(tokens)` | 信頼できる認証結果を保存 | 認証応答の `TokenPair` | `Promise<void>`。認証未設定なら何もしない。書き込み失敗は拒否 | `await client.auth.setTokens(login.data.tokens)` |
| `client.auth.clear()` | ローカルの資格情報を消去し、旧世代の更新を無効化 | 引数なし | `Promise<void>`。認証未設定なら何もしない。保存先の消去失敗は拒否 | `await client.auth.clear()` |
| `client.auth.onTokenRefreshed(callback)` | 書き込み完了後の更新を購読 | `TokenPair` を受け取る同期関数 | 購読解除関数。認証を有効にしていなければ空の処理 | `const stop = client.auth.onTokenRefreshed(updateExpiry)` |
| `apiClient.tokenStorage.httpOnlyCookie()` | ブラウザー向けアダプター | 引数なし。認証を有効にした場合の既定 | `TokenStorage`。アクセストークンはインスタンスのメモリーに保存 | `const storage = apiClient.tokenStorage.httpOnlyCookie()` |
| `apiClient.tokenStorage.memory()` | 独立したメモリーアダプター | 引数なし | `TokenStorage`。アダプターの存続中、両トークンを保存 | `const storage = apiClient.tokenStorage.memory()` |

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

`null` は資格情報の欠落を表します。読み書きの障害では Promise を拒否します。クライアントに渡した後は、その `client.auth` を通して書き込むとログイン、更新、消去の世代が管理されます。

- ブラウザーではサーバーが `Set-Cookie` で `HttpOnly` の更新 Cookie を管理します。ページ再読み込み時にメモリーのアクセストークンは消えます。Cookie 方式のリクエストは `credentials: 'include'` を使います。JavaScript で扱うトークンを Web Storage に保存しないでください。
- Node.js の Fetch はブラウザーの Cookie を引き継ぎません。テストと SSR でメモリー方式を使用するときは、リクエストや利用者ごとにクライアントとストアを用意し、サーバーが発行する更新トークンを受け取れる構成にします。
- ネイティブアプリでは OS の安全な資格情報ストアを `TokenStorage` に接続し、書き込み途中の失敗も呼び出し元に伝えます。[Capacitor のアダプター](capacitor.ja.md)も使用できます。

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

<a id="detailed-workflow"></a>

#### 利用例：資格情報の保存と更新

同じ利用者の保護された画面が、期限切れの資格情報でリクエストした場合の流れです。対象となる HTTP 401 または IAM の認証失敗を受けると、同じインスタンスで並行する呼び出しが一回の更新を共有します。更新に成功すると有効な同じ利用者の呼び出しだけが一度再試行されます。呼び出し側の中断は、その呼び出しの待機を終わらせます。

![認証エラーから資格情報の更新と同一利用者の復旧を経て、許可された元のリクエストを再試行する流れ](../images/function-api-client-recovery.ja.svg)

たとえば `iam.auth.currentUser()` が更新可能な認証エラーを返し、更新 Cookie がまだ有効なら、ブラウザーから更新後に同じプロフィールを取り直します。サーバーが更新資格情報の無効を明示した場合、対応する保存データを消去して設定済みの `recoverSession` を呼びます。復旧のフォームでは対象の利用者 ID を `expectedUserId` に渡し、同じ利用者の新しい資格情報が保存できた場合に限って `true` を返します。ネットワーク障害、期限超過、レート制限などの一時失敗では資格情報を維持し、結果不明の操作は自動で再送しません。

ログイン、登録、パスワード更新・再設定、自動更新そのものの失敗は、通常の保護 API の更新と同じ扱いになりません。通常の[ログアウト](#logout)でセッションを閉じます。

SSR で以前にサーバーから発行された信頼できる `tokens` がある場合は、リクエスト専用のストレージに保存してからプロフィールを取得します。

```ts
import type { TokenPair } from '@h-ai/api-client'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function readCurrentUser(baseUrl: string, tokens: TokenPair) {
  const storage = apiClient.tokenStorage.memory()
  const contract = apiContract.create({ iam: apiContract.iam })
  const client = apiClient.create(contract)
  // サーバーから発行された、現在の SSR リクエスト専用の資格情報を使います。
  const ready = await client.init({ baseUrl, auth: { storage } })
  if (!ready.success)
    return ready

  try {
    await client.auth.setTokens(tokens)
    // 失効したアクセストークンは更新可能であれば自動で更新されます。
    const me = await client.iam.auth.currentUser()
    if (!me.success)
      return me
    return me.data
  }
  finally {
    try {
      await client.auth.clear()
    }
    finally {
      await client.close()
    }
  }
}
```

<a id="browser-refresh"></a>

#### 利用例：ブラウザーでログインし、期限切れの資格情報を更新する

IAM のログイン、更新、ログアウトを同じ API ベース URL で公開し、サーバーで HttpOnly の更新 Cookie を有効にします。同一オリジンなら例の `/api/v1` を使えます。別オリジンの場合はホストでアプリのオリジンと Cookie 付き CORS リクエストを許可します。

```ts
import type { IamAuthLoginInput } from '@h-ai/api-client'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function startBrowserSession(updateExpiry: (seconds: number) => void, showSignIn: () => void) {
  const client = apiClient.create({ iam: apiContract.iam })
  const initialized = await client.init({
    baseUrl: '/api/v1',
    auth: {
      terminalType: 'web',
      refreshPath: '/auth/refresh',
      refreshTimeoutMs: 8000,
      onRefreshFailed: showSignIn,
    },
  })
  if (!initialized.success)
    return initialized

  const actions = apiClient.createAuthActions(client)
  // 自動更新で保存が終わると、新しいアクセストークンの有効期間だけを画面に渡します。
  const stop = client.auth.onTokenRefreshed(tokens => updateExpiry(tokens.expiresIn))

  return {
    success: true as const,
    data: {
      async signIn(input: IamAuthLoginInput) {
        // input はログインフォームで入力した認証情報です。
        const result = await actions.login(input)
        if (!result.success)
          return result
        updateExpiry(result.data.tokens.expiresIn)
        return { success: true as const, data: result.data.user }
      },
      async readProfile() {
        // 保護された API の更新可能な 401 では、同じクライアントが Cookie で更新して再試行します。
        const profile = await client.iam.auth.currentUser()
        if (!profile.success)
          return profile
        return { success: true as const, data: profile.data }
      },
      async signOut() {
        // ホストにセッションの失効と Cookie の消去を依頼し、ローカルの資格情報も消去します。
        const result = await client.iam.auth.logout({}, { context: { autoRefresh: false } })
        await client.auth.clear()
        return result
      },
      async close() {
        stop()
        await client.close()
      },
    },
  }
}
```

初期化後に `data.signIn(input)` をフォームから呼び、成功時にプロフィールを表示します。アクセストークンが失効していて更新 Cookie が有効なら、`data.readProfile()` に伴って更新エンドポイントが呼ばれ、元の取得が一度再試行されます。認証の失敗や資格情報の欠落を確認した場合は、例の `showSignIn` が画面を切り替えます。ネットワーク障害や更新のタイムアウトでは資格情報を保持します。ログアウトの結果が失敗した場合、サーバー側の失効を確認できていない旨を画面に示します。インスタンスを使い終えたら `data.close()` を呼びます。

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

初期化したインスタンスで通常の `actions.login()` を行い、その利用者 ID をアプリで保持します。サーバーが更新資格情報を無効と判定すると、保護リクエストの途中で復旧処理が始まります。`expectedUserId` を付けたログインに成功し、同じ利用者のために新しい資格情報が一度保存されたとクライアントが確認した場合に再試行できます。利用者が切り替わった場合や元のリクエストが中断された場合は、元の操作を再開しません。画面やアプリでインスタンスを破棄するときは `close()` を呼びます。

<a id="auth-actions"></a>

### 認証フォームの接続：`apiClient.createAuthActions`

標準 IAM 契約がある初期化済みクライアントを画面の操作に接続します。ログインや登録で資格情報を保存するには、クライアントの初期化時に `auth` を指定します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiClient.createAuthActions(client)` | フォーム用の操作を作成 | 標準 `iam.auth` と `client.auth` を持つクライアント | 以下の `actions` | `const actions = apiClient.createAuthActions(client)` |
| `actions.publicConfig()` | 公開認証設定を取得 | 引数なし | 設定または `null` を含む `HaiResult` | `await actions.publicConfig()` |
| `actions.createCaptcha(input)` | 操作用の CAPTCHA を開始 | 必須の `operation` に `login`、`register`、`sendOtp`、`passwordReset`、`renewPassword` のいずれか | チャレンジを含む `HaiResult` | `await actions.createCaptcha({ operation: 'login' })` |
| `actions.login(input)` | パスワード、LDAP、OTP でログイン | 必須の `identifier` と `password`。任意の `method` は既定 `password`、ほかに `ldap`、`email`、`sms`。OTP は `code` を渡し、`password` は空文字にできる。任意の `captcha`、`expectedUserId` | 認証済み利用者とトークンを含む `HaiResult`。保存障害は Promise を拒否 | `await actions.login({ identifier, password })` |
| `actions.register(input)` | 利用者を登録してログイン | 必須の `username`、`password`。任意の `email`、`phone`、`displayName`、`metadata`、`captcha` | 利用者とトークンを含む `HaiResult`。保存障害は Promise を拒否 | `await actions.register({ username, password })` |
| `actions.sendOtp(identifier, options?)` | OTP を送信 | 対象の `identifier: string`、必要時に `options.captcha` | 期限 `expiresAt` を含む `HaiResult` | `await actions.sendOtp(identifier, { captcha })` |
| `actions.requestPasswordReset(identifier, options?)` | 再設定通知を要求 | 対象の `identifier: string`、必要時に `options.captcha` | `HaiResult<void>` | `await actions.requestPasswordReset(identifier)` |
| `actions.confirmPasswordReset(token, newPassword)` | 通知にある資格情報で再設定 | 一回限りの `token`、新しい `newPassword`、どちらも文字列 | `HaiResult<void>` | `await actions.confirmPasswordReset(token, newPassword)` |
| `actions.renewPassword(input)` | 初回または期限切れのパスワードを更新 | 必須の `identifier`、`password`、`newPassword`。任意の `captcha` | `HaiResult<void>` | `await actions.renewPassword({ identifier, password, newPassword })` |
| `actions.reauthenticate(password, operation)` | 機密操作用の再認証 | 現在の `password` とホストが指定する操作 ID `operation`。操作 ID は前後の空白を除いて 1～128 文字 | `ticket` と有効期限を含む `HaiResult` | `await actions.reauthenticate(password, 'iam.users.delete')` |
| `actions.bindPageExit(options?)` | ページを離れるときのセッション終了を登録 | `options.enabled` に公開設定の `session.endOnPageHide` を渡す。既定は無効 | リスナーの解除関数 | `const stop = actions.bindPageExit({ enabled: policy.session.endOnPageHide })` |

LDAP の `identifier` は LDAP 利用者名として送ります。メールと SMS の入力は OTP ルートを使用します。CAPTCHA が必要かどうかは公開設定と画面の操作で判断し、対象操作用に取得して利用者が解いた証明を送ります。OTP の受け付け期限は `expiresAt` の ISO 日時で確認できます。再認証で受け取った `ticket` は対象の呼び出しの `context.reauthentication` に渡します。

認証を有効にしたクライアントでは、ログイン・登録は書き込み完了を待ちます。その間にログアウト、アカウント変更、インスタンス終了が起きて開始時の認証状態が無効になると `UNAUTHORIZED` が返ります。ページ離脱時のリスナーは `pagehide` で `keepalive` を使用して自動更新を停止し、BFCache に保存される場合は何も送りません。ブラウザーが離脱後も送信を完了するとは限りません。この処理中は新しいページの資格情報を保つため、Cookie とローカルのストアを消去しません。画面破棄時に解除関数を呼べます。インスタンスの終了時にも解除されます。

#### 利用例：認証フォームの接続

以下の関数を標準 IAM 契約で初期化済みのブラウザークライアントとともに利用します。入力はログインフォームから渡します。

```ts
import type { ApiClient } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'
import { apiClient } from '@h-ai/api-client'

type IamClient = ApiClient<{ iam: typeof apiContract.iam }>

export async function prepareSignIn(client: IamClient) {
  const actions = apiClient.createAuthActions(client)
  // 公開設定が失敗、または利用不可ならフォームを表示する前に呼び出し元へ返します。
  const policy = await actions.publicConfig()
  if (!policy.success || !policy.data)
    return { policy }

  const stop = actions.bindPageExit({ enabled: policy.data.session.endOnPageHide })
  return {
    policy,
    stop,
    async submit(input: Parameters<typeof actions.login>[0]) {
      // フォームで選んだ方式を使用し、成功時は保存を待って利用者を返します。
      const login = await actions.login(input)
      if (!login.success)
        return login
      return login.data
    },
  }
}
```

画面を離れるときは `stop()` を呼びます。通常のログアウトには[ログアウトの例](#logout)を使用します。

<a id="request-options"></a>
<a id="呼び出しごとのオプション"></a>

### 呼び出しごとのオプション：`client.<domain>.<group>.<operation>(input, options?)`

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `client.iam.auth.currentUser(input?, options?)` | 入力なしの手続きに中断シグナルを渡す | `input` は `undefined`。任意の `options` を第 2 引数に指定 | 現在の利用者の `HaiResult` | `await client.iam.auth.currentUser(undefined, { signal })` |

##### 単一の呼び出しに適用する項目

第 1 引数は契約が定める業務入力です。入力のない手続きで第 2 引数を使う場合は `client.iam.auth.currentUser(undefined, { signal })` のように `undefined` を渡します。

| 第 2 引数の項目 | 省略時 | 指定した場合 |
| --- | --- | --- |
| `signal` | 呼び出し元からの中断なし | `AbortController.signal` で応答待ちを終える。サーバーで開始済みの書き込みは完了することがある |
| `lastEventId` | イベント ID を送らない | SSE の再接続に使う文字列。続きのイベントを返すかはサーバーの実装で決まる |
| `context.autoRefresh` | クライアントの認証設定を使用 | `false` でこのリクエストの自動更新を停止。現在のアクセストークンは設定に従って送信 |
| `context.keepalive` | Fetch の既定値 | `true` でページ離脱後も通信を続けるよう Fetch に通知。実際の送信はブラウザーの制約を受ける |
| `context.reauthentication` | 再認証チケットを送らない | 操作用のチケット文字列を `X-Hai-Reauthentication` として送信 |
| `context.reauthorize` | 新しいチケットを取得しない | 許可された再試行で呼ぶコールバック。文字列で新しいチケット、`null` で再試行を中止、`undefined` でチケットなしの再試行を許可 |

#### 利用例：ページを閉じるときにプロフィールの読み込みを中断する

認証済みの画面で、初期化済みのクライアントと `AbortController` の `signal` を渡します。ページ破棄時はコントローラーの `abort()` を呼びます。

```ts
import type { ApiClient } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'

export async function loadProfile(client: ApiClient<{ iam: typeof apiContract.iam }>, signal: AbortSignal) {
  // 現在のログイン利用者のプロフィールを読み取り、待機中は signal を監視します。
  const profile = await client.iam.auth.currentUser(undefined, { signal })
  if (!profile.success)
    return profile
  return profile.data
}
```

<a id="request-authorization"></a>

### 保護された API の認証と認可を扱う：`client.<domain>.<group>.<operation>()`

クライアントはアクセストークンを送信します。Serv または Kit はトークンからセッションを検証し、その利用者が操作や対象レコードにアクセスできるかを各リクエストで判定します。アプリは `currentUser()` が成功したときの `data.roles` と `data.permissions` をナビゲーションやボタンの表示に使えます。権限の変更や画面が保持している情報の古さに備え、サーバーでは業務処理の前に権限を確認します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `client.iam.auth.currentUser(input?, options?)` | 現在の利用者と表示用のロール・権限を取得 | 業務入力なし | `HaiResult`。成功した `data` に `roles` と `permissions` がある | `await client.iam.auth.currentUser()` |
| `actions.reauthenticate(password, operation)` | サーバーが指定した機密操作に使うチケットを取得 | 現在のパスワードと登録済み操作 ID | `HaiResult`。成功した `data.ticket` を該当する操作の `context.reauthentication` に渡す | `await actions.reauthenticate(password, 'iam.users.delete')` |

| 最終結果 | サーバーの判定 | クライアントの対応 |
| --- | --- | --- |
| `success: false`、`error.httpStatus: 401` | 認証情報が不足または失効。操作によっては再認証チケットが必要 | 更新や再認証の対象であればクライアントが再試行を調整する。復旧後も 401 が返ればサインインや再認証へ案内する |
| `success: false`、`error.httpStatus: 403` | 利用者は認証できたが、この操作や対象へのアクセスは許可されない | 拒否の案内を表示する。この結果でトークン更新は始まらない |
| `success: true` | そのリクエストが許可され、サーバーが業務処理を完了または受理した | `data` で画面を更新する。受理後に処理が続く操作は、返された ID で進捗を確認する |

#### 利用例：権限を画面に反映し、保護 API の結果で操作を判断する

ログイン直後に `currentUser()` で画面に表示するロールと権限を取得します。エクスポートボタンを押した後は、表示状態にかかわらず[レポートの作成リクエスト](#custom-business-client)の結果を確認します。機密操作のチケットはサーバーが指定した用途にだけ付けます。たとえば[利用者削除の例](#利用例再認証チケットを使って利用者を削除する)では `iam.users.delete` のチケットをその削除リクエストに渡します。

保護ルートの設定手順は [Serv の認証](serv.ja.md#authentication)または [Kit のガード](kit.ja.md#auth)を参照してください。

<a id="iam-requests"></a>
<a id="認証と管理-api-の呼び出しapiclientiam"></a>

### アカウントとセッションの呼び出し：`client.iam.auth`

本人のプロフィールの取得やログアウトでは、契約の手続きを直接使用できます。各操作は `HaiResult` を返し、任意の第 2 引数は[呼び出しごとのオプション](#request-options)に従います。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `client.iam.auth.publicConfig(input?, options?)` | 公開認証設定を取得 | 業務入力なし | 設定または `null` | `await client.iam.auth.publicConfig()` |
| `client.iam.auth.createCaptcha(input, options?)` | チャレンジを開始 | 必須の `operation`。[認証フォームの接続](#auth-actions)を参照 | CAPTCHA チャレンジ | `await client.iam.auth.createCaptcha({ operation: 'login' })` |
| `client.iam.auth.login(input, options?)` | パスワードでログイン | 必須の `identifier` と `password`。任意の `captcha`、`expectedUserId` | 利用者とトークン | `await client.iam.auth.login({ identifier, password })` |
| `client.iam.auth.loginWithLdap(input, options?)` | LDAP でログイン | 必須の `username` と `password`。任意の `captcha`、`expectedUserId` | 利用者とトークン | `await client.iam.auth.loginWithLdap({ username, password })` |
| `client.iam.auth.loginWithOtp(input, options?)` | OTP でログイン | 必須の `identifier` と `code`。任意の `captcha`、`expectedUserId` | 利用者とトークン | `await client.iam.auth.loginWithOtp({ identifier, code })` |
| `client.iam.auth.sendOtp(input, options?)` | OTP を要求 | 必須の `identifier`。任意の `captcha` | 有効期限 | `await client.iam.auth.sendOtp({ identifier })` |
| `client.iam.auth.register(input, options?)` | 新規登録 | 必須の `username` と `password`。任意の `email`、`phone`、`displayName`、`metadata`、`captcha` | 利用者とトークン | `await client.iam.auth.register({ username, password })` |
| `client.iam.auth.currentUser(input?, options?)` | 現在の利用者を取得 | 業務入力なし | プロフィール、ロール、権限 | `await client.iam.auth.currentUser()` |
| `client.iam.auth.updateCurrentUser(input, options?)` | 自分のプロフィールを変更 | 変更する `username`、`email`、`displayName`、`avatarUrl`、`phone`、`metadata` | 変更後のプロフィール | `await client.iam.auth.updateCurrentUser({ displayName: 'Mina' })` |
| `client.iam.auth.changePassword(input, options?)` | ログイン中にパスワードを変更 | 必須の `oldPassword` と `newPassword` | 業務データなし | `await client.iam.auth.changePassword({ oldPassword, newPassword })` |
| `client.iam.auth.renewPassword(input, options?)` | 初回・期限切れのパスワードを更新 | 必須の `identifier`、`password`、`newPassword`。任意の `captcha` | 業務データなし | `await client.iam.auth.renewPassword({ identifier, password, newPassword })` |
| `client.iam.auth.requestPasswordReset(input, options?)` | 再設定通知を要求 | 必須の `identifier`。任意の `captcha` | 業務データなし | `await client.iam.auth.requestPasswordReset({ identifier })` |
| `client.iam.auth.confirmPasswordReset(input, options?)` | 再設定を完了 | 必須の `token` と `newPassword` | 業務データなし | `await client.iam.auth.confirmPasswordReset({ token, newPassword })` |
| `client.iam.auth.reauthenticate(input, options?)` | 操作用チケットを取得 | 必須の `password` と `operation` | チケットと有効期限 | `await client.iam.auth.reauthenticate({ password, operation: 'iam.users.delete' })` |
| `client.iam.auth.refresh(input, options?)` | 資格情報を更新 | 契約の入力は `refreshToken: string`。通常はクライアントが更新処理を実行 | 新しいトークン | `await client.iam.auth.refresh({ refreshToken })` |
| `client.iam.auth.logout(input, options?)` | 通常のログアウト | 必須のオブジェクト。`{}` で現在の Bearer を使用、任意の `accessToken` で対象指定 | 業務データなし | `await client.iam.auth.logout({})` |
| `client.iam.auth.closeSession(input, options?)` | ページ離脱時などにセッションを失効 | 必須のオブジェクト。`{}` で現在の Bearer を使用、任意の `accessToken` で対象指定 | 業務データなし | `await client.iam.auth.closeSession({})` |

ログインや登録の手続きを直接使った場合、呼び出し側が成功を確認し `client.auth.setTokens(result.data.tokens)` で保存します。[認証フォームの接続](#auth-actions)の操作を経由すれば保存も行います。

<a id="logout"></a>

#### 利用例：現在のセッションからログアウトする

ログアウトボタンからホスト側のセッションを終了し、ローカルの資格情報を消去します。ホストから失敗が返る場合もローカル消去を行い、呼び出し元に失敗を伝えます。ストレージの消去が失敗した場合は Promise が拒否されます。

```ts
import type { ApiClient } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'

export async function signOut(client: ApiClient<{ iam: typeof apiContract.iam }>) {
  // 現在のセッションをサーバーで取り消し、ローカルの資格情報も消去します。
  const logout = await client.iam.auth.logout({}, { context: { autoRefresh: false } })
  await client.auth.clear()
  if (!logout.success)
    return logout
  return logout
}
```

<a id="iam-admin-inputs"></a>

### 利用者、ロール、権限を管理する：`client.iam.users`、`client.iam.roles`、`client.iam.permissions`

ホストが管理権限を確認します。既存のレコードに対する操作では、一覧や以前の成功結果から利用者、ロール、権限の ID を取得します。[呼び出しごとのオプション](#request-options)を第 2 引数に指定できます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `client.iam.users.list(input, options?)` | 利用者を一覧表示 | 必須のオブジェクト。`{}` で既定。絞り込みは[管理用項目](#iam-admin-inputs)を参照 | 利用者一覧のページ | `await client.iam.users.list({ page: 1, pageSize: 20 })` |
| `client.iam.users.get(input, options?)` | 利用者を取得 | 必須の `id` は既存の利用者 ID | 利用者または `null` | `await client.iam.users.get({ id: userId })` |
| `client.iam.users.create(input, options?)` | 利用者を作成 | 必須の `username` と `password`。[管理用項目](#iam-admin-inputs)を参照 | 作成された利用者 | `await client.iam.users.create({ username, password })` |
| `client.iam.users.invite(input, options?)` | 招待通知を送信 | 必須の `username` と通知先 `email` または `phone`。[管理用項目](#iam-admin-inputs)を参照 | 作成された利用者 | `await client.iam.users.invite({ username, email })` |
| `client.iam.users.update(input, options?)` | 利用者を更新 | 必須の `id` と変更項目。[管理用項目](#iam-admin-inputs)を参照 | 更新された利用者 | `await client.iam.users.update({ id: userId, displayName: 'Mina' })` |
| `client.iam.users.delete(input, options?)` | 利用者を削除 | 必須の `id` は対象の利用者 ID | 業務データなし | `await client.iam.users.delete({ id: userId })` |
| `client.iam.users.resetPassword(input, options?)` | 管理者としてパスワードを変更 | 必須の利用者 `id` と `newPassword` | 業務データなし | `await client.iam.users.resetPassword({ id: userId, newPassword })` |
| `client.iam.roles.list(input?, options?)` | ロールを一覧表示 | 業務入力なし | ロール一覧。結果はページ形式 | `await client.iam.roles.list()` |
| `client.iam.roles.get(input, options?)` | ロールを取得 | 必須の `id` は既存のロール ID | ロールまたは `null` | `await client.iam.roles.get({ id: roleId })` |
| `client.iam.roles.create(input, options?)` | ロールを作成 | 必須の `code` と `name`。任意の `description`、`isSystem` | 作成されたロール | `await client.iam.roles.create({ code: 'reader', name: 'Reader' })` |
| `client.iam.roles.update(input, options?)` | ロールを更新 | 必須の `id`。任意の `name`、`description` | 更新されたロール | `await client.iam.roles.update({ id: roleId, name: 'Report reader' })` |
| `client.iam.roles.delete(input, options?)` | ロールを削除 | 必須の `id` は対象のロール ID | 業務データなし | `await client.iam.roles.delete({ id: roleId })` |
| `client.iam.permissions.list(input, options?)` | 権限を一覧表示 | 必須のオブジェクト。`{}` で既定。絞り込みは[管理用項目](#iam-admin-inputs)を参照 | 権限一覧のページ | `await client.iam.permissions.list({ type: 'api' })` |
| `client.iam.permissions.get(input, options?)` | 権限を取得 | 必須の `id` は既存の権限 ID | 権限または `null` | `await client.iam.permissions.get({ id: permissionId })` |
| `client.iam.permissions.create(input, options?)` | 権限を作成 | 必須の `code` と `name`。[管理用項目](#iam-admin-inputs)を参照 | 作成された権限 | `await client.iam.permissions.create({ code: 'reports:read', name: 'Read reports' })` |
| `client.iam.permissions.setSensitiveOperations(input, options?)` | 再認証対象の操作を更新 | 必須の権限 `id` と `sensitiveOperations`。`[]` で解除 | 業務データなし | `await client.iam.permissions.setSensitiveOperations({ id: permissionId, sensitiveOperations: ['iam.users.delete'] })` |
| `client.iam.permissions.delete(input, options?)` | 権限を削除 | 必須の `id` は対象の権限 ID | 業務データなし | `await client.iam.permissions.delete({ id: permissionId })` |

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

利用者一覧の閲覧権限がある画面で、初期化済みのクライアントと画面破棄時に中断するシグナルを渡します。

```ts
import type { ApiClient } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'

export async function loadUsers(client: ApiClient<{ iam: typeof apiContract.iam }>, signal: AbortSignal) {
  // 可視ユーザーの 1 ページ目を 20 件まで取得します。
  const users = await client.iam.users.list({ page: 1, pageSize: 20 }, { signal })
  if (!users.success)
    return users
  return { items: users.data.items, total: users.data.total }
}
```

成功時は `items` に表示可能な利用者、`total` に該当件数を取得します。失敗時は元の `error` を返します。詳細や更新で必要な ID には、この一覧などで取得した対象の値を使用します。

#### 利用例：再認証チケットを使って利用者を削除する

Serv で `iam.users.delete` が再認証を要求する場合の手順です。対象の `id` は管理画面の一覧から取得し、`password` は削除を実行する管理者に確認します。チケットの取得に失敗した時点では削除を送信しません。

```ts
import type { ApiClient } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'

export async function deleteUser(client: ApiClient<{ iam: typeof apiContract.iam }>, id: string, password: string) {
  // 現在の管理者のパスワードで、削除専用のチケットを取得します。
  const proof = await client.iam.auth.reauthenticate({ password, operation: 'iam.users.delete' })
  if (!proof.success)
    return proof

  // 発行されたチケットを一度だけ使います。失敗時は元の結果を返します。
  const deleted = await client.iam.users.delete({ id }, {
    context: { reauthentication: proof.data.ticket },
  })
  if (!deleted.success)
    return deleted
  return { success: true as const }
}
```

<a id="custom-business-client"></a>

### アプリ独自の保護 API を呼び出す：`apiClient.create(contract)`

レポート画面で利用者が PDF または CSV の生成を依頼する例です。契約をクライアントとサーバーの共有モジュールに置きます。クライアントの呼び出し名は `reports.exports.create` で、HTTP では `POST /reports/{reportId}/exports` に対応します。アプリが直接使う `zod` を追加してください。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiClient.create(contract)` | IAM と業務操作を同じインスタンスに登録 | ホストと共有する契約ツリー | `ApiClient<typeof contract>`。利用前に `init()` を実行する | `const client = apiClient.create(reportContract)` |
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

<a id="business-requests"></a>
<a id="storage-requests"></a>
<a id="ファイルと-ai-apiapiclientstorageapiclientai"></a>

### オブジェクトストレージへのアクセス：`client.storage`

アプリに Storage と AI のルートが登録されている場合は、対応するドメインをクライアントから使用できます。既定の `apiClient` には IAM、Storage、AI が含まれます。Feedback、Payment、独自のドメインを呼び出す場合は、[ホストと共有する契約](api-contract.ja.md#use-with-client)からクライアントを作ります。以下の手続きは任意の[呼び出しオプション](#request-options)を受け取り、`HaiResult` を返します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `client.storage.files.list(input, options?)` | 閲覧許可があるオブジェクトの一覧 | `input` 必須、`{}` 可。任意の `prefix`、`maxKeys`（1～1,000）、グループ化用の `delimiter`、前ページの `continuationToken` | オブジェクトと次ページの情報 | `await client.storage.files.list({ prefix: 'reports/', maxKeys: 20 })` |
| `client.storage.files.getMetadata(input, options?)` | オブジェクトのメタデータを取得 | 閲覧可能な `key` が必須 | キー、サイズ、コンテンツ型など | `await client.storage.files.getMetadata({ key })` |
| `client.storage.files.delete(input, options?)` | オブジェクトを削除 | 削除可能な `key` が必須 | 業務データなし | `await client.storage.files.delete({ key })` |
| `client.storage.files.deleteMany(input, options?)` | オブジェクトをまとめて削除 | `keys` は空でないキーの配列。ホストが各キーを確認 | 削除結果。部分失敗は `error.ext.deleteMany` に進捗が入る場合がある | `await client.storage.files.deleteMany({ keys: [key] })` |
| `client.storage.presignedUrls.createUpload(input, options?)` | 署名付きアップロード URL を発行 | `key` が必須。任意の `contentType` は既定 `application/octet-stream`、`expiresIn` は既定 900 秒 | 一時 URL とオブジェクトキー | `await client.storage.presignedUrls.createUpload({ key, contentType: 'application/pdf' })` |
| `client.storage.presignedUrls.createDownload(input, options?)` | 署名付きダウンロード URL を発行 | `key` が必須。任意の `expiresIn` は有効秒数、既定 900 | 一時 URL とオブジェクトキー | `await client.storage.presignedUrls.createDownload({ key, expiresIn: 60 })` |

<a id="利用例ファイルと-ai-api"></a>

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

<a id="ai-requests"></a>

### チャット、記憶、セッションの呼び出し：`client.ai`

現在の認証主体を使用し、別の `objectId` で呼び出すときはホスト側で対象へのアクセス権を確認します。既定の呼び出しは JSON を返します。ストリーミングの例は[独自の戻り値と SSE](#custom-response-results)を参照してください。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `client.ai.chats.createCompletion(input, options?)` | メッセージから非ストリーミング補完を生成 | `messages` は必須の空でない配列。[チャット補完の要求項目](#ai-input-fields)を参照 | 応答候補、モデル、使用量、ツール呼び出し | `await client.ai.chats.createCompletion({ messages: [{ role: 'user', content: 'Hello' }] })` |
| `client.ai.chats.sendMessage(input, options?)` | セッションにメッセージを送信 | 必須の `message`。`sessionId` は既定 `default`。任意の `objectId`、`systemPrompt`、`model`、`temperature`（0～2） | 応答テキスト、モデル、任意の使用量 | `await client.ai.chats.sendMessage({ message, sessionId })` |
| `client.ai.chats.listHistory(input, options?)` | 履歴を取得 | 必須の `sessionId`。任意の `objectId`、`limit`（1～200）、`order`（`asc` または `desc`） | チャット履歴 | `await client.ai.chats.listHistory({ sessionId, limit: 20 })` |
| `client.ai.memories.list(input, options?)` | 記憶を一覧表示 | `input` は必須、`{}` 可。任意の `objectId`、`types` 配列、0 からの `offset`、`limit`（1～100） | 記憶の一覧 | `await client.ai.memories.list({ objectId, limit: 20 })` |
| `client.ai.memories.recall(input, options?)` | 内容で記憶を検索 | 必須の `query`。任意の `objectId`、`topK`（1 以上）、`types` 配列、`minImportance`（0～1） | 該当する記憶 | `await client.ai.memories.recall({ query: 'preferred language', topK: 3 })` |
| `client.ai.sessions.list(input, options?)` | セッションを一覧表示 | `input` 必須。`{}` は現在の認証主体、`objectId` は許可された主体 | セッションの一覧 | `await client.ai.sessions.list({})` |

<a id="ai-input-fields"></a>

#### チャット補完の要求項目

| 項目 | 用途と既定値 |
| --- | --- |
| `messages` | 空でない配列。ロールは `system`、`user`、`assistant`、`tool`。本文は文字列または `{ type: 'text', text }` のパーツ。利用者メッセージでは `image_url` パーツに `url` と任意の `detail`（`auto`、`low`、`high`）を指定可 |
| `messages[].tool_calls`、`messages[].tool_call_id` | アシスタントのツール呼び出しは `id`、`type: 'function'`、`function.name` と JSON 文字列の `function.arguments` を指定。本文を省略する場合はツール呼び出しが必要。ツール結果には対応する `tool_call_id` を指定 |
| `objectId`、`sessionId`、`model` | 主体、セッション、モデルを指定可。省略時は認証主体、`default` セッション、ホストのモデル設定 |
| `temperature`、`top_p`、`max_tokens` | 任意の温度（0～2）、サンプリング確率（0～1）、最大生成トークン数（正整数） |
| `tools`、`tool_choice` | 任意の関数ツールの配列。`type: 'function'` と `function.name` が必須。説明、JSON Schema の引数、`strict` は任意。`tool_choice` には `auto`、`none`、`required`、または定義済みの関数を指定 |

#### 利用例：現在のセッションへ新しいメッセージを送る

初期化済みの AI クライアントに、チャット画面の `sessionId` と利用者が入力した `message` を渡します。成功時は応答の `content` を画面に追加します。

```ts
import type { ApiClient } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'

export async function sendChatMessage(client: ApiClient<{ ai: typeof apiContract.ai }>, sessionId: string, message: string) {
  // 現在の認証主体のセッションへ送信し、サービスからの失敗はそのまま返します。
  const result = await client.ai.chats.sendMessage({ sessionId, message })
  if (!result.success)
    return result
  return { content: result.data.content, model: result.data.model }
}
```

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
<a id="通信の暗号化と結果の監視apiclient"></a>

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

<a id="利用例通信の暗号化と結果の監視"></a>

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

### 独自の戻り値とストリームを扱う：`client.<procedure>()`

独自ルートでは、成功時に契約で宣言した JSON 値、バイナリ、SSE の非同期イテレーターを受け取れます。リクエストやストリームの確立に失敗した場合は `HaiResult<never>` の失敗分岐が返ります。JSON Schema に変換できる Zod の HTTP JSON 出力は検証され、契約に合わなければ `VALIDATION_FAILED` が返ります。ISO 日付文字列など、受信した JSON 値はその型のまま利用します。ストリーム確立後に起きた障害は、反復処理の例外として扱います。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `client.count(input?, options?)` | 下の独自契約にある件数を取得 | 業務入力なし。任意の `signal` | 数値、または開始時の失敗分岐 | `await client.count(undefined, { signal })` |
| `client.events(input?, options?)` | 下の独自契約にある進捗を購読 | 業務入力なし。任意の `signal` | 非同期イテレーター、または開始時の失敗分岐 | `await client.events(undefined, { signal })` |

#### 利用例：独自の戻り値と SSE 応答を読み取る

`pnpm add @h-ai/api-client @h-ai/api-contract @orpc/contract zod` を実行します。ホストに同じ契約を登録し、`GET /status/count` は件数、`GET /status/events` は進捗イベントを返すようにします。画面破棄時の中断シグナルを渡します。

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { eventIterator } from '@orpc/contract'
import { z } from 'zod'

export const progressContract = {
  count: apiContract.route({ method: 'GET', path: '/status/count' }).output(z.number()),
  events: apiContract.route({ method: 'GET', path: '/status/events' })
    .output(eventIterator(z.object({ completed: z.number() }))),
}

export async function readProgress(baseUrl: string, signal: AbortSignal, update: (completed: number) => void) {
  const client = apiClient.create(progressContract)
  const ready = await client.init({ baseUrl })
  if (!ready.success)
    return ready

  try {
    // 数値を返すルートで、先に失敗分岐を外します。
    const count = await client.count(undefined, { signal })
    if (typeof count !== 'number')
      return count
    update(count)

    // 接続の失敗分岐を外してから、以降のイベントを画面に反映します。
    const events = await client.events(undefined, { signal })
    if (!(Symbol.asyncIterator in events))
      return events
    for await (const event of events)
      update(event.completed)
  }
  finally {
    await client.close()
  }
}
```

開始時の失敗は関数の戻り値で確認します。途中で通信が切れたときや `signal` で中断したときは、呼び出し元で反復処理の例外を扱います。

<a id="errors"></a>
<a id="error-handling"></a>
<a id="エラー処理"></a>

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
