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
| `kit.createHandle` | 请求管道 | `HandleConfig: auth/guards/logging/rateLimit/crypto/access` | `SvelteKit Handle` | `kit.createHandle({ logging: true })` |
| `kit.sequence` | 组合 Hook | `...Handle` | `Handle preserving resolve options` | `kit.sequence(i18nHandle, authHandle)` |
| `kit.handler` | 端点异常边界 | `(RequestEvent) => Response \| Promise<Response>` | `SvelteKit request handler` | `kit.handler(async () => kit.response.ok({ ready: true }))` |
| `kit.middleware.rateLimit` | 固定窗口限流 | `{ windowMs, maxRequests, store, ...options }` | `Middleware; 429 on quota and 503 on store failure` | `kit.middleware.rateLimit({ windowMs: 60000, maxRequests: 100, store })` |
| `kit.middleware.createCacheRateLimitStore` | 共享计数器 | `initialized shared cache, { namespace, allowMemory? }` | `RateLimitStore` | `kit.middleware.createCacheRateLimitStore(cache, { namespace: "orders" })` |
| `kit.middleware.createMemoryRateLimitStore` | 开发计数器 | `none; development or explicit test only` | `MemoryRateLimitStore` | `kit.middleware.createMemoryRateLimitStore()` |
| `kit.i18n.setLocale` | 启动默认语言 | `locale string` | `void; do not change process default per request` | `kit.i18n.setLocale("zh-CN")` |
| `kit.i18n.runWithLocale` | 请求语言隔离 | `locale, callback; Node server only` | `same callback return value` | `kit.i18n.runWithLocale("en-US", () => resolve(event))` |

#### 利用例：SvelteKit の要求処理

createHandle と sequence から始め、初期化済み Cache を制限の保存先にします。制限超過は 429、保存障害は 503 です。要求ごとにグローバル言語を変えません。

未翻訳：SvelteKit フック、セッションガード、暗号化 Fetch の接続手順。[中国語の該当節](kit.md#detailed-workflow)を参照してください。

<a id="host-options"></a>

#### フック引数と実行時の依存

コード引数を扱うため設定手冊から移動しました。完全な手順は現在[中国語](kit.md#host-options)にあり、この節は部分翻訳です。

[引数と手順の詳細](kit.md#hooks)

<a id="responses"></a>

### 入力検証と応答：`kit.validate`・`kit.response`

エンドポイントで入力を解析し、成功・本文なし・項目エラー・業務エラーを返します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `kit.response.ok` | 成功响应 | `data, requestId?` | `Response with HTTP 200 and success data` | `kit.response.ok({ id: "o1" })` |
| `kit.response.created` | 创建响应 | `data, requestId?` | `Response with HTTP 201 and success data` | `kit.response.created({ id: "o1" })` |
| `kit.response.noContent` | 无正文 | `none` | `Response with HTTP 204` | `kit.response.noContent()` |
| `kit.response.error` | 指定失败 | `code, message, status?, requestId?, public details?` | `safe failure Response` | `kit.response.error("app:orders:001", "请求无效", 400)` |
| `kit.response.badRequest` | 无效请求 | `message, requestId?` | `HTTP 400 Response` | `kit.response.badRequest("Invalid request")` |
| `kit.response.unauthorized` | 未认证 | `message?, requestId?` | `HTTP 401 Response` | `kit.response.unauthorized()` |
| `kit.response.forbidden` | 无权限 | `message?, requestId?` | `HTTP 403 Response` | `kit.response.forbidden()` |
| `kit.response.notFound` | 未找到 | `message?, requestId?` | `HTTP 404 Response` | `kit.response.notFound()` |
| `kit.response.conflict` | 版本冲突 | `message, requestId?` | `HTTP 409 Response` | `kit.response.conflict("Data changed")` |
| `kit.response.validationError` | 字段校验 | `{ field, message }[], requestId?` | `HTTP 422 Response; errors in safe error.cause` | `kit.response.validationError([{ field: "title", message: "请输入标题" }])` |
| `kit.response.internalError` | 内部失败 | `message?, requestId?` | `HTTP 500 Response with safe message` | `kit.response.internalError()` |
| `kit.response.redirect` | 重定向 | `location, status?` | `redirect Response` | `kit.response.redirect("/auth/login")` |
| `kit.response.fromResult` | 映射领域结果 | `HaiResult<T>, httpStatusMap?, requestId?` | `HTTP Response; preserves safe code/status/traceId` | `kit.response.fromResult(result)` |
| `kit.response.fromError` | 映射领域错误 | `HaiError, requestId?` | `safe HTTP failure Response` | `kit.response.fromError(result.error)` |
| `kit.validate.body` | JSON/表单校验 | `Request, Zod schema` | `Promise<schema data>; invalid input throws Response` | `kit.validate.body(request, InputSchema)` |
| `kit.validate.query` | 查询校验 | `URL, Zod schema` | `schema data; invalid input throws Response` | `kit.validate.query(url, QuerySchema)` |
| `kit.validate.params` | 路径参数校验 | `Record<string,string>, Zod schema` | `schema data; invalid input throws Response` | `kit.validate.params(params, IdSchema)` |
| `kit.validate.IdParamSchema` | 通用资源编号 | `{ id: string }` | `Zod parsed ID object` | `kit.validate.IdParamSchema.parse({ id: "o1" })` |
| `kit.validate.PaginationQuerySchema` | 分页输入 | `page/pageSize/search query` | `normalized pagination object` | `kit.validate.PaginationQuerySchema.parse({ page: "1" })` |

#### 利用例：入力検証と応答

```ts
import { ok } from '@h-ai/core'
import { z } from 'zod'
const schema = z.object({ title: z.string().min(1) })
const request = new Request('https://app.example.com/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Order' }) })
const body = await kit.validate.body(request, schema) // { title: 'Order' }
kit.validate.query(new URL('https://app.example.com/?page=1'), kit.validate.PaginationQuerySchema) // normalized page
kit.validate.params({ id: 'o1' }, kit.validate.IdParamSchema) // { id: 'o1' }
kit.validate.IdParamSchema.parse({ id: 'o1' }) // { id: 'o1' }
kit.validate.PaginationQuerySchema.parse({ page: '1' }) // normalized page defaults
kit.response.ok(body).status // 200
kit.response.created({ id: 'o1' }).status // 201
kit.response.noContent().status // 204
kit.response.badRequest('Invalid request').status // 400
kit.response.unauthorized().status // 401
kit.response.forbidden().status // 403
kit.response.notFound().status // 404
kit.response.conflict('Data changed').status // 409
kit.response.validationError([{ field: 'title', message: 'Required' }]).status // 422
kit.response.internalError().status // 500
kit.response.redirect('/auth/login').headers.get('location') // '/auth/login'
kit.response.error('app:orders:001', 'Invalid request', 400).status // 400
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
| `kit.guard.check` | 检查权限 | `session, permission` | `boolean` | `kit.guard.check(session, "orders.read")` |
| `kit.guard.require` | 要求权限 | `session, permission` | `void; denied access throws Response` | `kit.guard.require(session, "orders.write")` |
| `kit.guard.requireSensitive` | 确认操作用途 | `initialized IAM, current RequestEvent request/cookies, operation` | `Promise<void>; invalid proof throws Response` | `kit.guard.requireSensitive(iam, event, "orders.approve")` |
| `kit.auth.publicPaths` | 匿名端点名单 | `none` | `string[]; prepend the host base path when needed` | `kit.auth.publicPaths` |
| `kit.auth.createApi` | 认证 handler 集合 | `initialized IAM service` | `RequestHandler map for login/OTP/reset/config/etc.` | `kit.auth.createApi(iam)` |
| `kit.auth.login` | 密码登录 | `Cookie writer, PasswordCredentials, request context?` | `Promise<HaiResult<AuthResult>>; writes token cookies on success` | `kit.auth.login(cookies, { identifier: "alice", password })` |
| `kit.auth.loginWithOtp` | 验证码登录 | `Cookie writer, OtpCredentials, request context?` | `Promise<HaiResult<AuthResult>>` | `kit.auth.loginWithOtp(cookies, otpCredentials)` |
| `kit.auth.loginWithLdap` | LDAP 登录 | `Cookie writer, LdapCredentials, request context?` | `Promise<HaiResult<AuthResult>>` | `kit.auth.loginWithLdap(cookies, ldapCredentials)` |
| `kit.auth.loginWithApiKey` | API Key 登录 | `Cookie writer, ApiKeyCredentials, request context?` | `Promise<HaiResult<AuthResult>>` | `kit.auth.loginWithApiKey(cookies, apiKeyCredentials)` |
| `kit.auth.registerAndLogin` | 注册并登录 | `Cookie writer, RegisterOptions, request context?` | `Promise<HaiResult<AuthResult>>` | `kit.auth.registerAndLogin(cookies, registration)` |
| `kit.auth.logout` | 显式退出 | `Cookie writer, accessToken?` | `Promise<HaiResult<void>>` | `kit.auth.logout(cookies, accessToken)` |
| `kit.auth.setBrowserToken` | 页面内存凭据 | `access token string` | `void; no Web Storage persistence` | `kit.auth.setBrowserToken(accessToken)` |
| `kit.auth.clearBrowserToken` | 清理页面凭据 | `none` | `void` | `kit.auth.clearBrowserToken()` |
| `@h-ai/kit` 的 `matchPermission` | 表示用の権限をパターン照合 | `matchPermission('reports:read', ['reports:read'])` | `boolean` | `matchPermission('reports:read', ['reports:read'])` |

#### 利用例：認証 Cookie とガード

認証例は cookies・フォーム・信頼する要求情報から結果と Cookie の変更を作ります。check は false を返せますが require は拒否時に Response を投げます。機密操作には用途付き証明も必要です。

[引数と手順の詳細](kit.md#auth)

<a id="browser-client"></a>

### 同一オリジンのブラウザ接続：`kit.client`

クライアントに同一オリジンの Cookie・CSRF・通信を任せ、画面は操作と結果を扱います。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `kit.client.create` | 同源客户端 | `KitClientConfig: auth/transport/recoverSession?` | `KitClient { apiFetch, init, destroy, ready }` | `kit.client.create()` |
| `kit.client.createAuthActions` | 标准认证动作 | `{ basePath?, ...auth client options }?` | `AuthPanel-compatible actions` | `kit.client.createAuthActions({ basePath: "/api/auth" })` |
| `kit.client.installBrowserTransport` | 按公共配置安装加密 | `public KitConfig, { crypto, basePath? }` | `void; installs same-origin global fetch wrapper when enabled` | `kit.client.installBrowserTransport(publicKitConfig, { crypto })` |
| `kit.client.installBrowserTransportFetch` | 自定义传输安装 | `ClientTransportConfig` | `void; installs browser global fetch wrapper` | `kit.client.installBrowserTransportFetch(transportOptions)` |
| `@h-ai/kit/client` 的 `createKitClient` | 同一オリジンクライアントを作成 | `createKitClient({})`，可传 CSRF、base path 和加密等选项 | `KitClient` | `createKitClient({})` |
| `@h-ai/kit/client` 的 `createKitAuthActions` | 同一オリジンの認証操作を作成 | `createKitAuthActions({ apiFetch: client.apiFetch })`，指定已创建客户端的 fetch | `AuthActions` | `createKitAuthActions({ apiFetch: client.apiFetch })` |
| `@h-ai/kit/client` 的 `createSvelteKitNavAdapter` | SvelteKit の移動を CRUD に接続 | `createSvelteKitNavAdapter()` | `CrudNavAdapter` | `createSvelteKitNavAdapter()` |

#### 利用例：同一オリジンのブラウザ接続

ブラウザで実装済み /api/ping に接続します。既定設定でクライアントを作成し、Response を取得します。所有者の終了時に destroy します。authActions/nav は UI 用オブジェクトです。

```ts
import { createKitAuthActions, createKitClient, createSvelteKitNavAdapter } from '@h-ai/kit/client'

const client = createKitClient({}) // same factory as kit.client.create
const actions = createKitAuthActions({ apiFetch: client.apiFetch })
const nav = createSvelteKitNavAdapter()
await client.init()
try {
  const response = await client.apiFetch('/api/ping')
  const body: unknown = await response.json() // the application endpoint's JSON
  client.ready // whether an enabled transport session is ready
}
finally {
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
| `kit.crud.define` | 声明 CRUD 资源 | `CrudResourceConfig` | `resource operation object` | `kit.crud.define(resourceDefinition)` |
| `@h-ai/kit` 的 `defineCrud` | リソースとフォーム項目を定義 | `defineCrud(resource)`，用表单字段及资源操作定义 CRUD | `CrudOperations<T>` | `defineCrud(resource)` |
| `@h-ai/kit` 的 `resolveText` | 静的・遅延翻訳テキストを取得 | `resolveText('Name')`，或传返回本地化文案的函数 | `string` | `resolveText('Name')` |
| `@h-ai/kit` 的 `resolveOptions` | 静的・遅延生成した選択肢を取得 | `resolveOptions([{ label: 'Active', value: true }])`，也可传返回选项的函数 | `CrudOption[]` | `resolveOptions([{ label: 'Active', value: true }])` |

#### 利用例：資源とフォーム項目の定義

resource は CrudResource 型のフィールドと認可済みコールバックです。両入口は書き込みをせず操作オブジェクトを返します。true は選択肢の値です。

```ts
import { defineCrud, kit, resolveOptions, resolveText } from '@h-ai/kit'

function buildResource(resource: Parameters<typeof defineCrud>[0]) {
  const operations = defineCrud(resource)
  const equivalent = kit.crud.define(resource)
  const label = resolveText(() => 'Name') // 'Name'
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
| `@h-ai/kit` 的 `resolveKitTransportConfig` | Kit の転送引数を統合 | `resolveKitTransportConfig(false)`，或传传输部分配置 | `false \| KitTransportConfig` | `resolveKitTransportConfig(false)` |
| `@h-ai/kit/crypto` 的 `transportEncryptionMiddleware` | 転送認証ミドルウェアを作成 | `transportEncryptionMiddleware(transportConfig)`，可传按路径、方法判定加密模式的函数 | `Middleware` | `transportEncryptionMiddleware(transportConfig)` |

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
| `kit.createFeedbackHandler` | 受控反馈入口 | `{ feedback, resolveContext, ...options }` | `catch-all RequestHandler` | `kit.createFeedbackHandler({ feedback, resolveContext })` |
| `createA2AApiKeyAuthenticator` | A2A の API キー検証を作成 | `createA2AApiKeyAuthenticator({ in: 'header', name: 'x-api-key' })`，指定请求头中的凭据名称 | `A2AAuthenticator` | `createA2AApiKeyAuthenticator({ in: 'header', name: 'x-api-key' })` |
| `createAgentCardHandler` | エージェントカードの処理を作成 | `createAgentCardHandler(() => card)`，传入返回 Agent Card 文档的回调 | `RequestHandler` | `createAgentCardHandler(() => card)` |
| `createA2AHandler` | A2A リクエスト処理を作成 | `createA2AHandler(handleRequest, { authenticate })`，传入协议处理函数与认证函数 | `RequestHandler` | `createA2AHandler(handleRequest, { authenticate })` |
| `resolveA2AConfig` | A2A の引数を解決 | `resolveA2AConfig({ operations, rpcPath: '/a2a' })`，传入 `ai.a2a` 操作集或带路径与认证的配置 | `ResolvedA2AConfig \| null` | `resolveA2AConfig({ operations, rpcPath: '/a2a' })` |
| `handleA2ARequest` | 構成済み A2A リクエストを処理 | `await handleA2ARequest(event, requestId, config)`，输入当前事件、关联编号及已解析配置 | `Promise<Response \| null>` | `await handleA2ARequest(event, requestId, config)` |

#### 利用例：フィードバックと A2A のルート

以下の feedback・Agent Card GET・A2A POST は処理と認証を受け取り JSON/SSE を返します。A2A の未一致パスは null で後続に渡します。

[引数と手順の詳細](kit.md#protocol-integrations)
