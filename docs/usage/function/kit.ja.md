# @h-ai/kit API リファレンス

<!-- translation: partial -->

[原文（中国語）](kit.md) · [設定](../configuration/kit.ja.md) · [データ構造](../data/kit.ja.md)

<a id="quick-start"></a>

## クイックスタート

Kit は SvelteKit のフック、ルートハンドラー、ブラウザークライアントで使います。サーバーコードはルートを保護し、入力を検証し、業務結果を HTTP レスポンスに変換します。

```bash
npm install @h-ai/kit @h-ai/core sm-crypto@0.5.8
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/vite-plugin-svelte vite
```

```ts
import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter(),
      preprocess: [
        vitePreprocess()
      ],
      compilerOptions: { runes: true },
      // 绝对路径保持 SSR 与浏览器端认证、加密路径一致。
      paths: { base: '', relative: false },
    }),
    tailwindcss(),
  ],
  optimizeDeps: {
    exclude: ['bits-ui']
  },
  ssr: {
    noExternal: ['@h-ai/ui', '@h-ai/kit'],
    external: ['@h-ai/core', 'sm-crypto']
  },
})
```

<a id="api-reference"></a>

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

<a id="hooks"></a>

### SvelteKit の要求処理：`kit`

認証・アクセス・流量制限・言語を Hook に組み込み、handler の境界で安全な HTTP 応答に変換します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `kit.createHandle(config?)` | 请求管道 | 認証、ログ、ミドルウェア、アクセスを指定する任意の `config`。[Hook 設定](#host-options)を参照。 | `SvelteKit Handle` | `kit.createHandle({ logging: true })` |
| `kit.sequence(...handles)` | 组合 Hook | `handles` は実行順の SvelteKit `Handle`。0 個以上を渡す。 | `Handle preserving resolve options` | `kit.sequence(i18nHandle, authHandle)` |
| `kit.handler(fn)` | 端点异常边界 | SvelteKit のイベントを受け取り、`Response` またはその Promise を返す `fn(event)` が必須。 | `SvelteKit request handler` | `kit.handler(async () => kit.response.ok({ ready: true }))` |
| `kit.middleware.rateLimit(config)` | 固定時間枠でリクエストを制限 | `config` が必須。`windowMs` は 1～2147483647 ミリ秒、`maxRequests` は正の安全な整数、`store` はアトミックなカウンター。任意の `keyGenerator(event)` は既定で信頼済み接続元、`onLimitReached(event)` は既定で 429。 | ミドルウェア。ストア障害時は 503。 | `kit.middleware.rateLimit({ windowMs: 60000, maxRequests: 100, store })` |
| `kit.middleware.createCacheRateLimitStore(backend, options)` | 共享计数器 | 初期化済み Redis `backend` と 1～128 文字の `options.namespace` が必須。`allowMemory` は既定で無効。開発またはテストでのみ有効化可。 | `RateLimitStore` | `kit.middleware.createCacheRateLimitStore(cache, { namespace: "orders" })` |
| `kit.middleware.createMemoryRateLimitStore()` | 开发计数器 | `none; development or explicit test only` | `MemoryRateLimitStore` | `kit.middleware.createMemoryRateLimitStore()` |
| `kit.i18n.setLocale(locale)` | 启动默认语言 | 必須の `locale` は起動時の既定言語。例は `ja-JP`。 | `void; do not change process default per request` | `kit.i18n.setLocale("zh-CN")` |
| `kit.i18n.runWithLocale(locale, operation)` | 请求语言隔离 | リクエストの `locale` と結果をそのまま返す `operation` が必須。Node サーバー専用。 | `same callback return value` | `kit.i18n.runWithLocale("en-US", () => resolve(event))` |

#### 利用例：SvelteKit の要求処理

createHandle と sequence から始め、初期化済み Cache を制限の保存先にします。制限超過は 429、保存障害は 503 です。要求ごとにグローバル言語を変えません。

未翻訳：SvelteKit フック、セッションガード、暗号化 Fetch の接続手順。[中国語の該当節](kit.md#detailed-workflow)を参照してください。

<a id="host-options"></a>

#### フック引数と実行時の依存

| 項目 | 既定値と条件 | 用途と結果 |
| --- | --- | --- |
| `trustedProxies` / `access` | 既定は `auto` / `false` | 接続元アドレスとアクセス規則を決める。 |
| `auth.verifyToken` / `operations` | `auth` を設定したら検証関数は必須 | Bearer 認証または Cookie からセッションを読み込む。operations は初期化済み IAM を遅延取得する関数でもよい。 |
| `auth.cookieName` / `protectedPaths` / `publicPaths` / `loginUrl` | Cookie の既定は `hai_access_token` | 公開・保護ルートは配置後の実パスで指定。公開ルートが優先。 |
| `guards` / `middleware` / `onError` | 任意。既定の処理は安全な 500 応答を返す。 | 認証後に業務ガード、組み込みログと回数制限の後にカスタムミドルウェアを実行。 |
| `rateLimit.store` / `windowMs` / `maxRequests` / `keyGenerator` / `onLimitReached` | 省略または `false` で無効。有効時はアトミックなストアが必要。既定は 60,000 ms と 100 回。 | 集計キーと超過応答を指定できる。超過時は既定で 429。 |
| `logging` / `logging.logBody` | 既定でログ有効、本文ログ無効 | 要求診断を記録。必要に応じて機密情報を除く。 |
| `crypto.transport` / `encryptedCookies` / `cookieEncryptionKey` | 未指定時は暗号化無効。Cookie 鍵は `HAI_KIT_COOKIE_KEY` からも読み込める。 | 指定の Cookie を認証付きで暗号化。通信暗号化には実行時の鍵リングと登録ストアを渡す。 |
| `a2a.operations` / `cardPath` / `rpcPath` / `authenticate` | 有効化には操作が必要。パスの既定は `/.well-known/agent-card.json` と `/a2a`。 | 発見・プロトコル用のエンドポイントを追加し、認証も設定できる。 |

たとえば `kit.createHandle({ logging: true, auth: { verifyToken, protectedPaths: ["/admin/**"] } })` は、該当ルートにセッションを要求します。

<a id="responses"></a>

### 入力検証と応答：`kit.validate`・`kit.response`

エンドポイントで入力を解析し、成功・本文なし・項目エラー・業務エラーを返します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `kit.response.ok(data, requestId?)` | 成功响应 | 成功データ `data` が必須。任意の `requestId` でリクエストと関連付ける。 | `Response with HTTP 200 and success data` | `kit.response.ok({ id: "o1" })` |
| `kit.response.created(data, requestId?)` | 创建响应 | 作成したリソースの `data` が必須。任意の `requestId` でリクエストと関連付ける。 | `Response with HTTP 201 and success data` | `kit.response.created({ id: "o1" })` |
| `kit.response.noContent()` | 无正文 | `none` | `Response with HTTP 204` | `kit.response.noContent()` |
| `kit.response.error(code, message, status?, requestId?, details?)` | 指定失败 | エラーコード `code` と公開メッセージ `message` が必須。`status` の既定値は 400。`requestId` と公開可能な `details` は省略可。5xx では詳細を返さない。 | `safe failure Response` | `kit.response.error("app:orders:001", "请求无效", 400)` |
| `kit.response.badRequest(message, requestId?, details?)` | 无效请求 | 公開する検証メッセージ `message` が必須。`requestId` と公開可能な `details` は省略可。 | `HTTP 400 Response` | `kit.response.badRequest("Invalid request")` |
| `kit.response.unauthorized(message?, requestId?)` | 未认证 | 任意の公開 `message` は省略時にフレームワーク文言を使用。任意の `requestId` で要求と関連付ける。 | `HTTP 401 Response` | `kit.response.unauthorized()` |
| `kit.response.forbidden(message?, requestId?)` | 无权限 | 任意の公開 `message` は省略時にフレームワーク文言を使用。任意の `requestId` で要求と関連付ける。 | `HTTP 403 Response` | `kit.response.forbidden()` |
| `kit.response.notFound(message?, requestId?)` | 未找到 | 任意の公開 `message` は省略時にフレームワーク文言を使用。任意の `requestId` で要求と関連付ける。 | `HTTP 404 Response` | `kit.response.notFound()` |
| `kit.response.conflict(message, requestId?)` | 版本冲突 | 必須の公開 `message` で競合を説明。任意の `requestId` で要求と関連付ける。 | `HTTP 409 Response` | `kit.response.conflict("Data changed")` |
| `kit.response.validationError(errors, requestId?)` | 字段校验 | `errors` が必須。各要素にフィールド名 `field` と公開検証メッセージ `message`。`requestId` は省略可。 | `HTTP 422 Response; errors in safe error.cause` | `kit.response.validationError([{ field: "title", message: "请输入标题" }])` |
| `kit.response.internalError(message?, requestId?)` | 内部失败 | 任意の公開用 `message` は省略時に 500 の既定文言。任意の `requestId` で要求と関連付ける。 | `HTTP 500 Response with safe message` | `kit.response.internalError()` |
| `kit.response.redirect(url, status?)` | 重定向 | 移動先の URL 文字列 `url` が必須。リダイレクトの `status` の既定値は 302。 | `redirect Response` | `kit.response.redirect("/auth/login")` |
| `kit.response.fromResult(result, httpStatusMap?, requestId?)` | 映射领域结果 | 業務 `result` が必須。`httpStatusMap` はコード別の状態上書き、`requestId` は関連 ID。どちらも省略可。 | `HTTP Response; preserves safe code/status/traceId` | `kit.response.fromResult(result)` |
| `kit.response.fromError(haiError, requestId?)` | 映射领域错误 | `haiError` が必須。任意の `requestId` は省略時に現在のリクエストから取得。 | `safe HTTP failure Response` | `kit.response.fromError(result.error)` |
| `kit.validate.body(request, schema)` | JSON/表单校验 | HTTP `request` と JSON またはフォームを検証する Zod `schema` が必須。 | `Promise<schema data>; invalid input throws Response` | `kit.validate.body(request, InputSchema)` |
| `kit.validate.query(url, schema)` | 查询校验 | `url: URL` と検索パラメータを検証する Zod `schema` が必須。 | `schema data; invalid input throws Response` | `kit.validate.query(url, QuerySchema)` |
| `kit.validate.params(params, schema)` | 路径参数校验 | ルート引数の文字列マップ `params` と Zod `schema` が必須。 | `schema data; invalid input throws Response` | `kit.validate.params(params, IdSchema)` |
| `kit.validate.IdParamSchema` | 通用资源编号 | `{ id: string }` | `Zod parsed ID object` | `kit.validate.IdParamSchema.parse({ id: "o1" })` |
| `kit.validate.PaginationQuerySchema` | 分页输入 | `page/pageSize/search query` | `normalized pagination object` | `kit.validate.PaginationQuerySchema.parse({ page: "1" })` |

#### 利用例：入力検証と応答

```ts
import { ok } from '@h-ai/core'
import { z } from 'zod'
const schema = z.object({ title: z.string().min(1) })
const request = new Request('https://app.example.com/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Order' }) })
// Validate the sample JSON POST body with the title schema. On success body is { title: 'Order' }. Invalid JSON or fields fail validation.
const body = await kit.validate.body(request, schema) // { title: 'Order' }
// Parse page=1 from this URL and normalize it with pagination defaults. Invalid query values fail validation.
kit.validate.query(new URL('https://app.example.com/?page=1'), kit.validate.PaginationQuerySchema) // normalized page
// Validate the sample route parameters. id remains o1 and invalid values fail validation.
kit.validate.params({ id: 'o1' }, kit.validate.IdParamSchema) // { id: 'o1' }
// Validate the same id with the schema directly. Returns { id: 'o1' } or throws a Zod error.
kit.validate.IdParamSchema.parse({ id: 'o1' }) // { id: 'o1' }
// Convert the query string page to a numeric page and fill its defaults. An invalid page throws a Zod error.
kit.validate.PaginationQuerySchema.parse({ page: '1' }) // normalized page defaults
// Wrap the validated order body as a successful JSON response with status 200.
kit.response.ok(body).status // 200
// Return a success envelope for the new order o1 with status 201.
kit.response.created({ id: 'o1' }).status // 201
// Return an empty response with status 204.
kit.response.noContent().status // 204
// Return HTTP 400 with the supplied Invalid request message.
kit.response.badRequest('Invalid request').status // 400
// Return the default authentication error envelope with HTTP 401.
kit.response.unauthorized().status // 401
// Return the default permission-denied error envelope with HTTP 403.
kit.response.forbidden().status // 403
// Return the default missing-resource error envelope with HTTP 404.
kit.response.notFound().status // 404
// Use the supplied Data changed message for HTTP 409.
kit.response.conflict('Data changed').status // 409
// Include the supplied title field issue in the HTTP 422 response.
kit.response.validationError([{ field: 'title', message: 'Required' }]).status // 422
// Return the default internal-error envelope with HTTP 500.
kit.response.internalError().status // 500
// Create a redirect response whose Location is /auth/login.
kit.response.redirect('/auth/login').headers.get('location') // '/auth/login'
// Return the supplied app error code and message with HTTP 400.
kit.response.error('app:orders:001', 'Invalid request', 400).status // 400
// Wrap { id: 'o1' } in a successful HaiResult and convert it to HTTP 200. Failed results use their recorded error status.
kit.response.fromResult(ok({ id: 'o1' })).status // 200
```

JSON・検索・パスの入力から各値と HTTP 状態を得ます。不正な validate は Response を投げるため handler の境界内で使います。fromError に失敗 HaiResult.error を渡し、内部例外を公開しません。

[引数と手順の詳細](kit.md#responses)

<a id="auth"></a>

### 認証 Cookie とガード：`kit.auth`・`kit.guard`

現在のセッションをサーバーで確認し、認証 API で Cookie を管理します。表示用の権限一致だけでは許可しません。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `kit.guard.check(session, permission)` | 检查权限 | 現在の `session` は必須で、`null` も指定可能。 `permission` は必須で確認する権限名。 | `boolean` | `kit.guard.check(session, "orders.read")` |
| `kit.guard.require(session, permission)` | 要求权限 | 現在の `session` は必須で、`null` も指定可能。 `permission` は必須で確認する権限名。 | `void; denied access throws Response` | `kit.guard.require(session, "orders.write")` |
| `kit.guard.requireSensitive(iam, event, operation)` | 确认操作用途 | 初期化済み `iam`、現在の `event`、登録済みの `operation` が必須。 | `Promise<void>; invalid proof throws Response` | `kit.guard.requireSensitive(iam, event, "orders.approve")` |
| `kit.auth.publicPaths` | 匿名端点名单 | `none` | `string[]; prepend the host base path when needed` | `kit.auth.publicPaths` |
| `kit.auth.createApi(iam)` | 认证 handler 集合 | 認証操作を提供する初期化済み `iam` が必須。 | `RequestHandler map for login/OTP/reset/config/etc.` | `kit.auth.createApi(iam)` |
| `kit.auth.login(cookies, credentials, context?)` | 密码登录 | `cookies` と `identifier` と `password` を含む `credentials` が必須。 `captcha` は IAM 方針に従い、`expectedUserId` は同じ利用者の復旧用。 任意の `context` は[認証の引数](#kit-auth-context)を参照。 | `Promise<HaiResult<AuthResult>>; writes token cookies on success` | `kit.auth.login(cookies, { identifier: "alice", password })` |
| `kit.auth.loginWithOtp(cookies, credentials, context?)` | 验证码登录 | `cookies` と `identifier` と `code` を含む `credentials` が必須。 `captcha` は IAM 方針に従い、`expectedUserId` は同じ利用者の復旧用。 任意の `context` は[認証の引数](#kit-auth-context)を参照。 | `Promise<HaiResult<AuthResult>>` | `kit.auth.loginWithOtp(cookies, otpCredentials)` |
| `kit.auth.loginWithLdap(cookies, credentials, context?)` | LDAP 登录 | `cookies` と `username` と `password` を含む `credentials` が必須。 `captcha` は IAM 方針に従い、`expectedUserId` は同じ利用者の復旧用。 任意の `context` は[認証の引数](#kit-auth-context)を参照。 | `Promise<HaiResult<AuthResult>>` | `kit.auth.loginWithLdap(cookies, ldapCredentials)` |
| `kit.auth.loginWithApiKey(cookies, credentials, context?)` | API Key 登录 | `cookies` と `key` を含む `credentials` が必須。 任意の `context` は[認証の引数](#kit-auth-context)を参照。 | `Promise<HaiResult<AuthResult>>` | `kit.auth.loginWithApiKey(cookies, apiKeyCredentials)` |
| `kit.auth.registerAndLogin(cookies, options, context?)` | 注册并登录 | `cookies`、`options.username`、`options.password` が必須。任意の `context` と登録項目は[認証の引数](#kit-auth-context)を参照。 | `Promise<HaiResult<AuthResult>>` | `kit.auth.registerAndLogin(cookies, registration)` |
| `kit.auth.logout(cookies, accessToken?)` | 显式退出 | 現在の SvelteKit Cookie ライター `cookies` が必須。`accessToken` を渡すとサーバーで無効化し、省略時も Cookie は削除。 | `Promise<HaiResult<void>>` | `kit.auth.logout(cookies, accessToken)` |
| `kit.auth.setBrowserToken(token)` | 页面内存凭据 | 必須の `token` はページメモリーに保持するアクセストークン文字列。 | `void; no Web Storage persistence` | `kit.auth.setBrowserToken(accessToken)` |
| `kit.auth.clearBrowserToken()` | 清理页面凭据 | `none` | `void` | `kit.auth.clearBrowserToken()` |
| `@h-ai/kit` 的 `matchPermission(required, userPermissions)` | 表示用の権限をパターン照合 | 権限コード `required` と信頼済みセッションの `userPermissions` 配列が必須。 | `boolean` | `matchPermission('reports:read', ['reports:read'])` |

<a id="kit-auth-context"></a>

#### 認証 context と登録 options

| 項目 | 既定値と条件 | 用途と結果 |
| --- | --- | --- |
| `context.terminalType` | 既定は `web` | `web`、`app`、`desktop`、`api` でセッションを分類。 |
| `context.ip` / `userAgent` / `requestId` | いずれも任意 | 信頼できるホスト要求の接続元、利用環境、追跡 ID を IAM に渡す。 |
| `options.username` / `password` | 必須。IAM ポリシーで検証 | 登録する利用者名とパスワード。 |
| `options.email` / `phone` / `displayName` / `metadata` / `captcha` | 登録フォームと IAM ポリシーに応じて指定 | 連絡先、表示名、追加情報、CAPTCHA を渡す。公開登録 API のスキーマで項目を選ぶ。 |

たとえば、ログイン時に `{ terminalType: "desktop", requestId: "req-1" }` を渡すと、成功時のセッションはデスクトップに分類され、要求 ID で追跡できます。

#### 利用例：認証 Cookie とガード

認証例は cookies・フォーム・信頼する要求情報から結果と Cookie の変更を作ります。check は false を返せますが require は拒否時に Response を投げます。機密操作には用途付き証明も必要です。

[引数と手順の詳細](kit.md#auth)

<a id="browser-client"></a>

### 同一オリジンのブラウザ接続：`kit.client`

クライアントに同一オリジンの Cookie・CSRF・通信を任せ、画面は操作と結果を扱います。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `kit.client.create(config?)` | 同一オリジンのクライアントを作成 | 省略できる `config`。項目は下表を参照。 | `KitClient { apiFetch, init, destroy, ready }` | `kit.client.create()` |
| `kit.client.createAuthActions(options?)` | 標準の認証操作を作成 | `options` は省略可。`apiFetch` は新規の既定クライアント、`basePath` は `/api/auth` が既定。 | AuthPanel と互換性のある操作 | `kit.client.createAuthActions({ basePath: "/api/auth" })` |
| `kit.client.installBrowserTransport(config, deps)` | 按公共配置安装加密 | 公開 `config` と `deps.crypto` が必須。任意の `deps.basePath` の既定はルートを示す空文字列。 | `void; installs same-origin global fetch wrapper when enabled` | `kit.client.installBrowserTransport(publicKitConfig, { crypto })` |
| `kit.client.installBrowserTransportFetch(transportConfig?)` | 自定义传输安装 | ブラウザーでは下表の `transport` と同じ `transportConfig` を指定。省略時やサーバーからの呼び出しでは Fetch を置き換えない。 | `void; installs browser global fetch wrapper` | `kit.client.installBrowserTransportFetch(transportOptions)` |
| `@h-ai/kit/client` の `createKitClient(config?)` | 同一オリジンのクライアントを作成 | `config` は省略可。項目は `kit.client.create()` と同じ。 | `KitClient` | `createKitClient({})` |
| `@h-ai/kit/client` の `createKitAuthActions(options?)` | 同一オリジンの認証操作を作成 | `options` は省略可。`kit.client.createAuthActions()` と同じ `apiFetch`、`basePath`。 | `AuthActions` | `createKitAuthActions({ apiFetch: client.apiFetch })` |
| `@h-ai/kit/client` 的 `createSvelteKitNavAdapter()` | SvelteKit の移動を CRUD に接続 | `createSvelteKitNavAdapter()` | `CrudNavAdapter` | `createSvelteKitNavAdapter()` |

#### 利用例：同一オリジンのブラウザ接続

ブラウザで実装済み /api/ping に接続します。既定設定でクライアントを作成し、Response を取得します。所有者の終了時に destroy します。authActions/nav は UI 用オブジェクトです。

| クライアントの項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `auth` | 省略または `false` でアクセストークンを付けない | `true` は現在のページのメモリー内トークンを使用します。認証処理と共用する `BrowserTokenStore` も指定できます。 |
| `terminalType` | `'web'` | `'app'`、`'desktop'`、`'api'` も指定可能。サーバーは `X-Hai-Terminal` でセッションの端末グループを判断します。 |
| `recoverSession` | 省略時は復旧しない | 同じ利用者のセッションを復元したときに限り `true` を返す非同期関数。対象となる認証失敗のあと、最大 1 回再試行します。 |
| `csrfCookieName`、`csrfHeaderName` | `hai_csrf`、`X-CSRF-Token` | 書き込みリクエストではこの Cookie の値を指定ヘッダーに設定します。両方ともサーバーの設定と合わせます。 |
| `transport` | 省略時は無効 | 初期化済みの `crypto` を渡すと有効になります。`basePath` の既定値は空文字列、`keyExchangeUrl` は `/api/_hai/key-exchange`。`excludePaths` はサーバーの平文パスと合わせます。`maxPlaintextBytes` はバイト単位の平文上限で、省略時はサーバーと交渉した値です。 |

`client.apiFetch(input, init?, options?)` にリクエスト、URL、パスのいずれかを渡します。`init` は `method`、`body`、`signal` などの標準 Fetch 設定です。第 3 引数に `recoverSession: false` を指定すると、その呼び出しの通常のセッション復旧を無効にします。たとえば復旧処理自身が認証 API を呼ぶ場合に使います。`reauthorize` は再試行前に新しい操作証明を取得する任意の関数です。証明文字列は古いヘッダーを置換し、`null` は再試行を取り消し、`undefined` は証明なしで続行します。

```ts
import { createKitAuthActions, createKitClient, createSvelteKitNavAdapter } from '@h-ai/kit/client'

// Create a browser client with defaults. The returned object has its own request and transport methods.
const client = createKitClient({}) // same factory as kit.client.create
// このクライアントの apiFetch で /api/auth 配下を呼び出すフォーム操作を返します。
const actions = createKitAuthActions({ apiFetch: client.apiFetch, basePath: '/api/auth' })
// Create a navigation adapter for the current SvelteKit runtime.
const nav = createSvelteKitNavAdapter()
// Initialize this client's transport if enabled. A failed enabled handshake rejects.
await client.init()
try {
  // Fetch /api/ping through the configured client. Inspect the returned HTTP status and handle network rejection as for fetch.
  const response = await client.apiFetch('/api/ping')
  const body: unknown = await response.json() // the application endpoint's JSON
  client.ready // whether an enabled transport session is ready
}
finally {
  // Destroy this client's transport state without changing other clients.
  client.destroy()
}
```

工場は client・actions・navAdapter を返します。apiFetch の前に初期化し、destroy で解放します。名前付き出力も同じ契約と公開入口に従います。

[引数と手順の詳細](kit.md#browser-client)

<a id="crud"></a>

### 資源とフォーム項目の定義：`kit.crud`

項目と操作を定義し、サーバーの各操作で主体と資源の所有を確認します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `kit.crud.define(resource)` | 声明 CRUD 资源 | 操作、ルート、フィールドを含む CRUD の `resource` 定義が必須。 | `resource operation object` | `kit.crud.define(resourceDefinition)` |
| `@h-ai/kit` 的 `defineCrud(resource)` | リソースとフォーム項目を定義 | `kit.crud.define()` と同じ。`resource` 定義が必須。 | `CrudOperations<T>` | `defineCrud(resource)` |
| `@h-ai/kit` 的 `resolveText(text)` | 静的・遅延翻訳テキストを取得 | 文字列または文字列を返す引数なしの関数 `text` が必須。 | `string` | `resolveText('Name')` |
| `@h-ai/kit` 的 `resolveOptions(options)` | 静的・遅延生成した選択肢を取得 | `options` 配列またはその配列を返す引数なしの関数が必須。各要素には `label` と `value`。 | `CrudOption[]` | `resolveOptions([{ label: 'Active', value: true }])` |

#### 利用例：資源とフォーム項目の定義

resource は CrudResource 型のフィールドと認可済みコールバックです。両入口は書き込みをせず操作オブジェクトを返します。true は選択肢の値です。

```ts
import { defineCrud, kit, resolveOptions, resolveText } from '@h-ai/kit'

function buildResource(resource: Parameters<typeof defineCrud>[0]) {
  // Build the operations for the supplied resource declaration.
  const operations = defineCrud(resource)
  // Build the equivalent operations through kit.crud using the same declaration.
  const equivalent = kit.crud.define(resource)
  // Evaluate the supplied label function. The resolved label is Name.
  const label = resolveText(() => 'Name') // 'Name'
  // Resolve the supplied Active option with boolean true. This array is returned as the available choices.
  const choices = resolveOptions([{ label: 'Active', value: true }]) // same option array
  return { operations, equivalent, label, choices }
}
```

資源定義から CrudOperations を得ます。resolveText は文字列や関数から文字、resolveOptions は選択肢配列を返します。定義だけで更新権限は与えません。

[引数と手順の詳細](kit.md#crud)

<a id="transport"></a>

### 通信暗号化の組み立て：クライアントとミドルウェア

Crypto と共有 Cache を準備し、公開方針をクライアント、信頼する manager をサーバーに渡します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `@h-ai/kit` 的 `resolveKitTransportConfig(input?)` | Kit の転送引数を統合 | `input` は `false` またはデプロイの通信設定。[通信の引数](#kit-transport-arguments)を参照。 | `false \| KitTransportConfig` | `resolveKitTransportConfig(false)` |
| `@h-ai/kit/crypto` 的 `transportEncryptionMiddleware(config, encryption?)` | 転送認証ミドルウェアを作成 | 実行時 `config` が必須。任意の `encryption(pathname, method)` でパスとメソッドの暗号化方針を取得。[通信の引数](#kit-transport-arguments)を参照。 | `Middleware` | `transportEncryptionMiddleware(transportConfig)` |

<a id="kit-transport-arguments"></a>

#### 公開 transport 設定とミドルウェア引数

| 項目 | 既定値と条件 | 用途と結果 |
| --- | --- | --- |
| `input` | 省略または `false` で無効 | `resolveKitTransportConfig` は公開設定を解析する。オブジェクトに鍵交換パスと除外リストの既定値を補い、容量と時間の既定値は実行時に適用する。 |
| `enabled` / `crypto` / `serverKeyRing` / `keyStore` | 直接ミドルウェアを作る場合は必須 | 有効フラグ、初期化済み Crypto、サーバー鍵リング、登録ストアをホストから渡す。本番では共有ストアを使う。 |
| `keyExchangePath` / `excludePaths` / `basePath` | 既定は `/api/_hai/key-exchange`、`[]`、空文字列 | 鍵交換ルート、除外する要求パス、ビルドのマウント先。 `basePath` は実行時にのみ渡す。 |
| `maxPlaintextBytes` / `routePlaintextBytes` | 既定は 1 MiB、ルートの上書きなし。上限は 1 KiB～64 MiB の整数。 | 平文の UTF-8 バイト数を制限。経路の `*` は完全な 1 セグメントに一致。公開設定は `"auto"` を許可し、ミドルウェアには数値を渡す。 |
| `maxFutureSkewSeconds` / `maxRequestAgeSeconds` | 既定は 30 秒（0–300）と 300 秒（1–600） | クライアント時計の進みの許容秒数と、発行からの要求の有効秒数。 |

`resolveKitTransportConfig({ excludePaths: ["/api/health"] })` は指定の除外リストと既定の `keyExchangePath` を返します。

#### 利用例：通信暗号化の組み立て

transport を有効にした通常の業務ルートです。協商、A2A、プリフライト、明文指定は専用分岐です。アクセス判定を先に計算し、通常業務の拒否は伝送認証の内側で行います。

![Kit：暗号化した業務要求と Handle](../images/function-kit-request.ja.svg)

アクセス・会話・守衛の拒否では resolve を呼びません。伝送層内の応答・エラーを暗号化した後、監査と関連・安全ヘッダーを完成させます。暗号文を業務本文として読まず、入力検証は各エンドポイントや load／action で行います。

resolveKitTransportConfig は false か完全な設定、中間層は SvelteKit 処理関数を返します。超過・鍵交換失敗の HTTP 結果を保ち、依存のライフサイクルはアプリで管理します。

[引数と手順の詳細](kit.md#transport)

<a id="protocol-integrations"></a>

### フィードバックと A2A のルート：`kit`

明確なパスで接続し、文脈と認可はホストで解決します。ルート工場だけで所有権を決めません。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `kit.createFeedbackHandler(options)` | 受控反馈入口 | 初期化済み `options.feedback` と、信頼済みセッションから主体を取得する `options.resolveContext(event)` が必須。`null` は拒否。`options.basePath` の既定は `/api/feedback`。 | `catch-all RequestHandler` | `kit.createFeedbackHandler({ feedback, resolveContext })` |
| `createA2AApiKeyAuthenticator(config)` | A2A の API キー検証を作成 | `config.in`（`header` または `query`）とパラメータ名 `config.name` が必須。 | `A2AAuthenticator` | `createA2AApiKeyAuthenticator({ in: 'header', name: 'x-api-key' })` |
| `createAgentCardHandler(getAgentCard)` | エージェントカードの処理を作成 | 現在の Agent Card またはその Promise を返す `getAgentCard()` が必須。 | `RequestHandler` | `createAgentCardHandler(() => card)` |
| `createA2AHandler(handleRequest, config?)` | A2A リクエスト処理を作成 | JSON-RPC の `handleRequest` が必須。任意の `config.authenticate` に `apiKey` または独自コールバックを設定。`null`、`undefined` を返すと拒否。 | `RequestHandler` | `createA2AHandler(handleRequest, { authenticate })` |
| `resolveA2AConfig(input)` | A2A の引数を解決 | `input` は操作オブジェクトまたは `{ operations, cardPath?, rpcPath?, authenticate? }`。`undefined` は `null` を返す。 | `ResolvedA2AConfig \| null` | `resolveA2AConfig({ operations, rpcPath: '/a2a' })` |
| `handleA2ARequest(event, requestId, config)` | 構成済み A2A リクエストを処理 | 現在の `event`、追跡 `requestId`、解決済み A2A `config` が必須。 | `Promise<Response \| null>` | `await handleA2ARequest(event, requestId, config)` |

#### 利用例：フィードバックと A2A のルート

以下の feedback・Agent Card GET・A2A POST は処理と認証を受け取り JSON/SSE を返します。A2A の未一致パスは null で後続に渡します。

[引数と手順の詳細](kit.md#protocol-integrations)
