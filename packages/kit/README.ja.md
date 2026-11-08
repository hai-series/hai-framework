# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md) · [@h-ai/iam](../iam/README.ja.md)

`@h-ai/kit` は hai-framework の SvelteKit 統合モジュールで、共通のリクエストパイプラインと同一オリジンの endpoint ツールを提供します：

実行時の操作は `kit.xx` を使います。公開名前空間の型はサーバー側の `KitFunctions` とブラウザー側の `BrowserKitFunctions` です。ブラウザー条件入口では client、CRUD、ページ内 Token、既定の言語操作だけを利用できます。`AuthCookieWriter` はサーバー認証が現在のリクエストの Cookie に書き込む最小契約です。内部 helper を import せずに、再エクスポートしたメソッドや名前空間の宣言を生成できます。

- `kit.createHandle()`：セッション解析、ルートガード、middleware チェーン、任意の通信・Cookie 暗号化。
- `kit.handler()`：API endpoint の例外処理境界。
- `kit.guard` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client` / `kit.crud`

> クロスプラットフォームの公開 HTTP contract は `@h-ai/api-contract` で定義し、`@h-ai/serv` にマウント、`@h-ai/api-client` の型付きクライアントで呼び出します。`@h-ai/kit` は業務 API contract を定義・提供しません。

## クイックスタート

`sequence` は SvelteKit の resolve オプションを保持します。ページ変換は内側から外側へ実行し、preload とシリアライズ対象ヘッダーのフィルターは最初の設定を優先します。

### インストール

```bash
npm install @h-ai/kit @h-ai/core sm-crypto@0.5.8
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/vite-plugin-svelte vite
```

### プロジェクト設定

**vite.config.ts**：

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

Crypto または Kit/IAM を使う場合、アプリの本番依存に `sm-crypto@0.5.8` を含めます。CLI 生成済みのプロジェクトでは設定済みです。手動導入は `pnpm add sm-crypto@0.5.8` を実行してください。adapter-node は直接の本番依存も参照するため、external 指定だけでは不十分です。

## 機能

### 用途・入力・出力

呼出し断片は本ページで初期化したサービスを使います。変数はアプリ側で用意する要求・Schema・リソース定義・設定を表します。初期化と失敗処理は各機能の例を参照し、HaiResult.success の確認と非同期処理の await を行ってください。

| 入口                                        | 用途                   | 入力                                                               | 出力                                                              | 呼出し断片                                                                  |
| ------------------------------------------- | ---------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `kit.createHandle`                          | 要求管線               | `HandleConfig: auth/guards/logging/rateLimit/crypto/access`        | `SvelteKit Handle`                                                | `kit.createHandle({ logging: true })`                                       |
| `kit.sequence`                              | Hook を合成            | `...Handle`                                                        | `Handle preserving resolve options`                               | `kit.sequence(i18nHandle, authHandle)`                                      |
| `kit.handler`                               | 端点境界               | `(RequestEvent) => Response \| Promise<Response>`                  | `SvelteKit request handler`                                       | `kit.handler(async () => kit.response.ok({ ready: true }))`                 |
| `kit.guard.check`                           | 権限確認               | `session, permission`                                              | `boolean`                                                         | `kit.guard.check(session, "orders.read")`                                   |
| `kit.guard.require`                         | 権限を要求             | `session, permission`                                              | `void; denied access throws Response`                             | `kit.guard.require(session, "orders.write")`                                |
| `kit.guard.requireSensitive`                | 操作用途を検証         | `initialized IAM, current RequestEvent request/cookies, operation` | `Promise<void>; invalid proof throws Response`                    | `kit.guard.requireSensitive(iam, event, "orders.approve")`                  |
| `kit.response.ok`                           | 成功応答               | `data, requestId?`                                                 | `Response with HTTP 200 and success data`                         | `kit.response.ok({ id: "o1" })`                                             |
| `kit.response.created`                      | 作成応答               | `data, requestId?`                                                 | `Response with HTTP 201 and success data`                         | `kit.response.created({ id: "o1" })`                                        |
| `kit.response.noContent`                    | 本文なし               | `none`                                                             | `Response with HTTP 204`                                          | `kit.response.noContent()`                                                  |
| `kit.response.error`                        | 指定エラー             | `code, message, status?, requestId?, public details?`              | `safe failure Response`                                           | `kit.response.error("app:orders:001", "请求无效", 400)`                     |
| `kit.response.badRequest`                   | 不正な要求             | `message?, requestId?`                                             | `HTTP 400 Response`                                               | `kit.response.badRequest("Invalid request")`                                |
| `kit.response.unauthorized`                 | 未認証                 | `message?, requestId?`                                             | `HTTP 401 Response`                                               | `kit.response.unauthorized()`                                               |
| `kit.response.forbidden`                    | 権限なし               | `message?, requestId?`                                             | `HTTP 403 Response`                                               | `kit.response.forbidden()`                                                  |
| `kit.response.notFound`                     | 見つからない           | `message?, requestId?`                                             | `HTTP 404 Response`                                               | `kit.response.notFound()`                                                   |
| `kit.response.conflict`                     | 競合                   | `message, requestId?`                                              | `HTTP 409 Response`                                               | `kit.response.conflict("Data changed")`                                     |
| `kit.response.validationError`              | 項目検証               | `{ field, message }[], requestId?`                                 | `HTTP 422 Response; errors in safe error.cause`                   | `kit.response.validationError([{ field: "title", message: "请输入标题" }])` |
| `kit.response.internalError`                | 内部エラー             | `message?, requestId?`                                             | `HTTP 500 Response with safe message`                             | `kit.response.internalError()`                                              |
| `kit.response.redirect`                     | リダイレクト           | `location, status?`                                                | `redirect Response`                                               | `kit.response.redirect("/auth/login")`                                      |
| `kit.response.fromResult`                   | 領域結果を変換         | `HaiResult<T>, httpStatusMap?, requestId?`                         | `HTTP Response; preserves safe code/status/traceId`               | `kit.response.fromResult(result)`                                           |
| `kit.response.fromError`                    | 領域エラーを変換       | `HaiError, requestId?`                                             | `safe HTTP failure Response`                                      | `kit.response.fromError(result.error)`                                      |
| `kit.validate.body`                         | 本文検証               | `Request, Zod schema`                                              | `Promise<schema data>; invalid input throws Response`             | `kit.validate.body(request, InputSchema)`                                   |
| `kit.validate.query`                        | クエリー検証           | `URL, Zod schema`                                                  | `schema data; invalid input throws Response`                      | `kit.validate.query(url, QuerySchema)`                                      |
| `kit.validate.params`                       | パス検証               | `Record<string,string>, Zod schema`                                | `schema data; invalid input throws Response`                      | `kit.validate.params(params, IdSchema)`                                     |
| `kit.validate.IdParamSchema`                | 資源 ID                | `{ id: string }`                                                   | `Zod parsed ID object`                                            | `kit.validate.IdParamSchema.parse({ id: "o1" })`                            |
| `kit.validate.PaginationQuerySchema`        | ページング入力         | `page/pageSize/search query`                                       | `normalized pagination object`                                    | `kit.validate.PaginationQuerySchema.parse({ page: "1" })`                   |
| `kit.client.create`                         | 同一オリジン顧客       | `KitClientConfig: auth/transport/recoverSession?`                  | `KitClient { apiFetch, init, destroy, ready }`                    | `kit.client.create()`                                                       |
| `kit.client.createAuthActions`              | 認証操作               | `{ basePath?, ...auth client options }?`                           | `AuthPanel-compatible actions`                                    | `kit.client.createAuthActions({ basePath: "/api/auth" })`                   |
| `kit.client.installBrowserTransport`        | 暗号転送を設定         | `public KitConfig, { crypto, basePath? }`                          | `void; installs same-origin global fetch wrapper when enabled`    | `kit.client.installBrowserTransport(publicKitConfig, { crypto })`           |
| `kit.client.installBrowserTransportFetch`   | 独自転送の設定         | `ClientTransportConfig`                                            | `void; installs browser global fetch wrapper`                     | `kit.client.installBrowserTransportFetch(transportOptions)`                 |
| `kit.auth.publicPaths`                      | 匿名端点一覧           | `none`                                                             | `string[]; prepend the host base path when needed`                | `kit.auth.publicPaths`                                                      |
| `kit.auth.createApi`                        | 認証 handler 群        | `initialized IAM service`                                          | `RequestHandler map for login/OTP/reset/config/etc.`              | `kit.auth.createApi(iam)`                                                   |
| `kit.auth.login`                            | パスワード認証         | `Cookie writer, PasswordCredentials, request context?`             | `Promise<HaiResult<AuthResult>>; writes token cookies on success` | `kit.auth.login(cookies, { identifier: "alice", password })`                |
| `kit.auth.loginWithOtp`                     | OTP 認証               | `Cookie writer, OtpCredentials, request context?`                  | `Promise<HaiResult<AuthResult>>`                                  | `kit.auth.loginWithOtp(cookies, otpCredentials)`                            |
| `kit.auth.loginWithLdap`                    | LDAP 認証              | `Cookie writer, LdapCredentials, request context?`                 | `Promise<HaiResult<AuthResult>>`                                  | `kit.auth.loginWithLdap(cookies, ldapCredentials)`                          |
| `kit.auth.loginWithApiKey`                  | API キー認証           | `Cookie writer, ApiKeyCredentials, request context?`               | `Promise<HaiResult<AuthResult>>`                                  | `kit.auth.loginWithApiKey(cookies, apiKeyCredentials)`                      |
| `kit.auth.registerAndLogin`                 | 登録と認証             | `Cookie writer, RegisterOptions, request context?`                 | `Promise<HaiResult<AuthResult>>`                                  | `kit.auth.registerAndLogin(cookies, registration)`                          |
| `kit.auth.logout`                           | ログアウト             | `Cookie writer, accessToken?`                                      | `Promise<HaiResult<void>>`                                        | `kit.auth.logout(cookies, accessToken)`                                     |
| `kit.auth.setBrowserToken`                  | ページ内 Token         | `access token string`                                              | `void; no Web Storage persistence`                                | `kit.auth.setBrowserToken(accessToken)`                                     |
| `kit.auth.clearBrowserToken`                | ページ Token を解除    | `none`                                                             | `void`                                                            | `kit.auth.clearBrowserToken()`                                              |
| `kit.crud.define`                           | CRUD 資源の宣言        | `CrudResourceConfig`                                               | `resource operation object`                                       | `kit.crud.define(resourceDefinition)`                                       |
| `kit.middleware.rateLimit`                  | 固定窓の制限           | `{ windowMs, maxRequests, store, ...options }`                     | `Middleware; 429 on quota and 503 on store failure`               | `kit.middleware.rateLimit({ windowMs: 60000, maxRequests: 100, store })`    |
| `kit.middleware.createCacheRateLimitStore`  | 共有カウンター         | `initialized shared cache, { namespace, allowMemory? }`            | `RateLimitStore`                                                  | `kit.middleware.createCacheRateLimitStore(cache, { namespace: "orders" })`  |
| `kit.middleware.createMemoryRateLimitStore` | 開発用カウンター       | `none; development or explicit test only`                          | `MemoryRateLimitStore`                                            | `kit.middleware.createMemoryRateLimitStore()`                               |
| `kit.createFeedbackHandler`                 | 管理された問題報告入口 | `{ feedback, resolveContext, ...options }`                         | `catch-all RequestHandler`                                        | `kit.createFeedbackHandler({ feedback, resolveContext })`                   |
| `kit.i18n.setLocale`                        | 起動時の言語           | `locale string`                                                    | `void; do not change process default per request`                 | `kit.i18n.setLocale("zh-CN")`                                               |
| `kit.i18n.runWithLocale`                    | 要求言語の分離         | `locale, callback; Node server only`                               | `same callback return value`                                      | `kit.i18n.runWithLocale("en-US", () => resolve(event))`                     |

- Handle Hook の合成（`createHandle` / `sequence`）
- 認証・ロール・権限ガード（`guard.require` / `guard.check`）
- 組み込み Logging / RateLimit / CORS middleware（`createHandle` 設定で有効化）
- 共通の API 応答とリクエスト検証（Zod）
- Bearer Token ツール（サーバー login/logout + ブラウザーの Token 保存）
- 自動 CSRF と通信暗号化に対応するブラウザークライアント
- 宣言的な CRUD リソース定義（`crud.define`）
- A2A 統合：既定の検出パスは `/.well-known/agent-card.json`。`authenticate` 設定時は null/undefined が 401 となり、認証未設定時のみ匿名を許可します。API Key の引数は完全な Agent Card の `securitySchemes.apiKey` から取得します。Hook と明示的 A2A ルートは JSON-RPC 解析エラー・SSE キャンセル時の解放処理を共有します。
- 2 種類のビルドモード（`createAdapter()`）

### リクエストパイプラインの構築

`/yyy/`などの配下に配置する場合、SvelteKitの`paths.base`とガードが参照する実際のURLを揃えます。`$app/paths`の`resolve('/').replace(/\/$/, '')`（`paths.relative: false`を設定）を`protectedPaths`、`publicPaths`、`loginUrl`に付け、`${base}/api/*`のように指定してください。認証画面は``kit.client.createAuthActions({ basePath: `${base}/api/auth` })``を使用します。Kitはルートグループや配置接頭辞を含むアプリ内`/api/*`を識別し、未認証APIは401、画面は設定したログイン先へ遷移します。生成テンプレートにはこの接続を含みます。

以下の Hook 例では、アプリがデータベース、共有キャッシュ、IAM を初期化し、各結果を確認済みとします。リソースの終了はアプリが管理し、リクエストごとに初期化しません。

**src/hooks.server.ts**：

```typescript
import type { Handle } from '@sveltejs/kit/hooks'
import { cache } from '@h-ai/cache'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

const haiHandle = kit.createHandle({
  auth: {
    verifyToken: async (token) => {
      const verified = await iam.auth.verifyToken(token)
      return verified.success ? verified.data : null
    },
    loginUrl: '/auth/login',
    protectedPaths: ['/admin/*', '/api/*'],
    publicPaths: ['/api/auth/*', '/api/public/*'],
  },
  rateLimit: {
    windowMs: 60_000,
    maxRequests: 100,
    store: kit.middleware.createCacheRateLimitStore(cache, { namespace: 'app' })
  },
  logging: true,
})

export const handle: Handle = haiHandle
```

最初の確定時点から固定ウィンドウを開始し、後続リクエストはTTLを延長しません。storeは必須です。共有Redisの初期化成功を確認し、全ノードのnamespace/windowMs/maxRequestsを一致させます。キャッシュ障害や競合上限は503、超過は429で、get+setやローカル計数へフォールバックしません。createMemoryRateLimitStoreは開発または明示HAI_E2E/HAI_E2E_MOCKテスト用で、常駐タイマーを使わず参照解放で回収されます。1リクエスト最大64項目を遅延走査し、上限10000ウィンドウです。満杯時は有効な計数を追い出さず新キーを503にし、外部storeのライフサイクルは作成者が管理します。本番でテスト変数を設定しません。ヘッダー時刻は推定、実際の期間はRedis TTLで制御するため時計を同期します。キーは信頼済みadapterのgetClientAddressのみ使い、等価IPv6/IPv4表記を正規化します。生の転送ヘッダーを信頼せず、代理信頼はadapterで設定します。

### API endpoint

```typescript
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

export const POST = kit.handler(async ({ request, locals }) => {
  kit.guard.require(locals.session, 'user:create')
  const payload = await kit.validate.body(request, CreateUserSchema)
  return kit.response.created(payload)
})
```

### ブラウザークライアント

`kit.client.create()` は SvelteKit の同一オリジン endpoint 向けです。Web・アプリ・ミニプログラムからクロスオリジンで公開 API を使う場合は `@h-ai/api-client` を使用してください。

```typescript
// src/lib/utils/api.ts — 全应用共享
import { kit } from '@h-ai/kit'

const client = kit.client.create()
export const { apiFetch } = client
```

```typescript
// 使用
import { apiFetch } from '#lib/utils/api.js'

const response = await apiFetch('/api/users', { method: 'GET' })
```

> CSRF Header は `apiFetch` が自動付与します。`@h-ai/kit` は独立した CSRF middleware ファクトリーを提供しません。
> `apiFetch` は文字列、URL、Request を受け付けます。Request のメソッド、ヘッダー、本文を保持し、書き込みには CSRF を付与します。transport 有効時は対応する本文のみ暗号化し、multipart の境界を保持します。
>
> 同一オリジンの SvelteKit endpoint は httpOnly Cookie を使い、サーバーで検証します。ブラウザーの Bearer Header が必要なら `kit.auth.setBrowserToken()` でページ内メモリーに保存してから `kit.client.create({ auth: true })` を使います。独自の `BrowserTokenStore` もメモリーまたはプラットフォームの安全なストレージを使用し、機密の認証情報を Web Storage に永続化しないでください。

### 同一オリジンの通信暗号化

kit の通信暗号化は `@h-ai/crypto` に委譲します。サーバーは `crypto.transport.createServer({ serverKeyRing, keyStore })` で管理器を作成し、ブラウザーは `kit.client.installBrowserTransport(kitConfig, { crypto })` の 1 行で同一オリジンの fetch ラッパーを導入します。サーバーには管理済み鍵環と共有 registry も渡します。

サブディレクトリでは `$app/paths` の `resolve('/').replace(/\/$/, '')`（`paths.relative: false` を設定） を使用します。サーバーの `crypto.transport` に `basePath: base`、ブラウザーには `installBrowserTransport(kitConfig, { crypto, basePath: base })` を渡し、独立した `kit.client.create` の `transport.basePath` も同じ値にします。既定の空文字列はドメイン直下です。ホストのビルド時ディレクトリを使う実行時引数であり、YAML に重複して設定したり、転送ヘッダーから推測したりしません。鍵交換・除外・容量のパスは引き続き完全なリクエストパスです。CLI の SSR テンプレートは両側を設定します。

**src/hooks.server.ts**：

```ts
import { resolve } from '$app/paths'
import { cache } from '@h-ai/cache'
import { createRedisTransportKeyStore, crypto, parseTransportServerKeyRing } from '@h-ai/crypto'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { appKitConfig } from '#lib/server/kit-config.js'

const base = resolve('/').replace(/\/$/, '')

const cryptoReady = await crypto.init()
if (!cryptoReady.success)
  throw new Error(cryptoReady.error.message)
const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
if (!ring.success)
  throw new Error(ring.error.message)
const serverKeyRing = ring.data
// Redis/IAM 由应用启动流程初始化并检查；此处复用同一实例。

export const handle = kit.createHandle({
  auth: {
    verifyToken: async (token) => {
      const verified = await iam.auth.verifyToken(token)
      return verified.success ? verified.data : null
    },
    protectedPaths: [`${base}/api/*`],
    publicPaths: [`${base}/api/_hai/*`], // 默认密钥协商端点
  },
  crypto: {
    crypto,
    transport: appKitConfig.transport === false
      ? false
      : {
          ...appKitConfig.transport,
          basePath: base,
          serverKeyRing,
          keyStore: createRedisTransportKeyStore({ cache, ttlSeconds: 3600 }),
        },
  },
})
```

**src/routes/+layout.svelte**（推奨入口：ブラウザー側は 1 行）：

```svelte
<script lang='ts'>
  import { browser } from '$app/env'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { crypto } from '@h-ai/crypto'
  import { kit } from '@h-ai/kit'
  import { untrack } from 'svelte'

  const base = resolve('/').replace(/\/$/, '')

  // 一次性安装：内部按 _kit.yml 决定是否启用 transport，并预热 crypto
  if (browser) {
    kit.client.installBrowserTransport(untrack(() => page.data.kitConfig), { crypto, basePath: base })
  }
</script>
```

**src/lib/utils/api.ts**（業務層では `apiFetch` のみを使用）：

```ts
import { kit } from '@h-ai/kit'

export const { apiFetch } = kit.client.create()
```

> `src/hooks.client.ts` は不要です。既定の `handleFetch` で十分で、SvelteKit 内部の `__data.json` も導入済みのグローバル fetch ラッパーを自動使用します。同一オリジンの Authorization Header には明示的な `BrowserTokenStore` または `kit.auth.setBrowserToken()` + `kit.client.create({ auth: true })` を使い、機密 Token を `localStorage` に保存しないでください。

既定の鍵交換パスは `/api/_hai/key-exchange` です。サーバーで `transport.keyExchangePath` を変更した場合、クライアントの `transport.keyExchangeUrl` も合わせて設定してください。

サーバーには同じ管理済み `serverKeyRing` と共有 `keyStore`（Redis または共有 DB）を明示的に渡します。クライアント公開鍵の共有だけではノード間で復号できません。暗黙のプロセス鍵・メモリー registry はなく、開発・テストでは `createInMemoryKeyStore(capacity)` を明示します。再起動後は同じ鍵環を読み込み、sticky session は不要です。

transport は既定で同一オリジンの `/api/*`、SvelteKit の `__data.json`、鍵交換 endpoint に適用します。ページ文書・静的ファイルは平文で `X-Client-Id` は不要です。アップロードなどの `multipart/form-data` はそのまま送信し、サーバーの `excludePaths` で明示的に許可してください。

転送は認証済み v2 封装を使い、署名と MAC を確認してから復号し、方法・パス・時刻・応答状態を束縛します。共有 registry が nonce を原子的に消費します。TLS・信頼する代理・業務認可・冪等性はホストの責任です。独自 CORS 入口は X-Hai-Transport を許可・公開してください。詳細は[転送プロトコル](../crypto/TRANSPORT-PROTOCOL.md)を参照してください。

`transport.maxPlaintextBytes` でリクエストとレスポンスの JSON 平文容量を共通設定します。単位は UTF-8 バイト、既定値は 1 MiB、有効範囲は 1 KiB～64 MiB の整数です。クライアントは鍵交換で上限を取得し、`resolveTransportBodyLimits()` が暗号文とプロキシ容量（平文の 2 倍 + 32 KiB）を算出します。鍵交換、公開鍵、認証ヘッダー、防リプレイ制約は独立です。超過時は元ストリームを停止して reader を解放します。要求は 413、応答は暗号化された 500 容量エラーとなり、`TransportBodyTooLargeError` / `hai:crypto:070` で識別できます。 [Transport capacity and upgrade](../crypto/TRANSPORT-CAPACITY.md)。

通常業務は `transport.maxPlaintextBytes`（auto/省略は 1 MiB）を維持します。Feedback の受理・証拠・添付・ZIP ダウンロードは `routePlaintextBytes` と `feedback.budget.maxTransportBytes` で別途宣言します。`*` は完全な1パス区間のみ一致し、ホストの明示値が優先です。ハンドシェイク、adapter-node、プロキシは経路の最大値を使用します。HTTP アダプターは個別宣言された 1 MiB 超の資料経路を最大2件、通常業務を別枠で16件まで許可し、応答完了・失敗時に解放します。混雑は503 / `hai:crypto:072` を返し、業務書込は自動再送しません。

Serv/Kit は要求の結合、署名、MAC を検証した後、時刻の許容範囲を超えた要求に暗号化した HTTP 400 を返します。クライアントは `TransportTimeError`（`hai:crypto:071`）をスローし、検証時のサーバー UTC 時刻を表示して、自動時刻同期を有効にするか手動で時刻を設定してから再読み込みするよう案内します。`serverTime` は Unix ミリ秒です。旧サーバーが値を返さない場合も時刻調整の案内を表示します。`api-client` は `VALIDATION_FAILED` に変換し、`cause.transportCode` と `cause.serverTime` を保持します。標準認証アクションは検証済みの通信時刻エラーを `HaiResult` に変換し、サーバー時刻と時刻調整の案内を AuthPanel に渡します。

### `_kit.yml` による共通 transport 設定

`@h-ai/kit` は `KitConfigSchema` / `resolveKitConfig()` を提供し、同じ `_kit.yml` から
`hooks.server.ts` とブラウザーの `kit.client.installBrowserTransport()` の両方を設定できます：

```yml
server:
  host: 127.0.0.1
  port: 3000

transport:
  keyExchangePath: /api/_hai/key-exchange
  excludePaths:
    - /api/storage
    - /api/public
    - /api/auth/profile/avatar
```

```ts
import { core } from '@h-ai/core'
import { KitConfigSchema } from '@h-ai/kit'

// 仅放在 src/lib/server 中；浏览器通过 layout data 接收公共投影。
const loaded = core.config.load('kit', './config/_kit.yml', KitConfigSchema)
if (!loaded.success)
  throw new Error(loaded.error.message)
export const appKitConfig = loaded.data
export const publicKitConfig = { transport: appKitConfig.transport }
```

`src/routes/+layout.server.ts` から上記ブラウザーレイアウトへ公開部分だけ渡します。ブラウザー側からサーバー設定をインポートしません。

```ts
import { publicKitConfig } from '#lib/server/kit-config.js'

export function load() {
  return { kitConfig: publicKitConfig }
}
```

`resolveKitConfig()` は `server`（host/port）と `transport` を解決します。host/port は `HOST` / `PORT` 環境変数 > `_kit.yml` の `server` > `127.0.0.1:3000` の順で、SvelteKit サーバー入口で共通利用します（`@h-ai/serv` と同じ構造）。
サーバーのみで設定を読む場合は `core.config.validate('kit', KitConfigSchema)` も利用できます。
完全な `_kit.yml` はサーバーだけで読みます。内部の代理ネットワークやポリシーファイルのパスを含むため、`+layout.server.ts` は `{ kitConfig: publicKitConfig }` のような公開投影だけを返し、ブラウザーは transport を使用します。`?raw` で設定全体やポリシーをブラウザーへ含めず、秘密鍵も記載しないでください。

### 依存関係

- `@h-ai/iam`：A2A 用の認証・認可（任意）。A2A 機能を使う前に初期化。
- `@h-ai/crypto`：通信・Cookie 暗号化（任意）。暗号化を使う前に初期化。

### エクスポートパス

実行時メソッドは `kit` 名前空間または明示したサブパスを使用し、型は個別に公開します。browser 宣言はサーバーファクトリを公開しません。Vite 設定には `@sveltejs/kit/vite` を使い、`@h-ai/kit/vite` プラグインはありません。

- `@h-ai/kit`：主入口。`kit` 名前空間と型を提供。
- `@h-ai/kit/client`：ブラウザークライアント。
- `@h-ai/kit/adapter`：2 モードのビルド adapter（`createAdapter()`）。
- `@h-ai/kit/a2a`：A2A 統合。
- `@h-ai/kit/crypto`：暗号モジュール統合。

### 設定による認証画面

パスワードログインの送信項目は `identifier` と `password` のみです。`AuthPanel` は `LoginForm` の `username` を `identifier` に変換します。有効期間はサーバーの `session.maxAge` / `session.refreshTokenMaxAge` で設定し、フォームにログインごとの永続セッション選択肢はありません。

規約は設定の userAgreementMarkdown/privacyPolicyMarkdown または URL を使用できます。同じ規約は Markdown 本文を優先して安全な Modal で描画します。

kit.auth.createApi(iam) の標準 handler と kit.auth.publicPaths を使用し、AuthPanel には kit.client.createAuthActions({ apiFetch }) を接続します。検証、Cookie、HaiResult 変換を共通化し、ユーザー情報と改密の保護を維持します。

[完整 IAM 配置 / IAM configuration](../iam/README.ja.md)

`kit.auth.logout(cookies, accessToken)` は `Promise<HaiResult<void>>` を返します。Token がなければ Cookie のみ消去して成功し、Token があるのに認証操作が未設定なら失敗します。サーバー結果にかかわらず Cookie は消去しますが、呼出側は失敗を HTTP 応答や UI に伝えます。ローカル消去はサーバー失効の確認ではありません。制御フロー例外は引き続き伝播します。

### CRUD fields

宣言型 CRUD 項目は UI フォームの幅を指定する `colSpan: 'auto' | 1 | 2` に対応します。`validation.message` は文字列または `() => string` を受け取り、現在の言語で表示できます。レイアウトは `CrudPage.form` で設定し、サーバーでも検証してください。

### リクエスト言語の分離

Node リクエストと SSR は `core.i18n.runWithLocale(locale, () => handleRequest())` で囲みます。SvelteKit は `kit.i18n.runWithLocale(locale, () => resolve(event))` を使えます。serv はリクエストヘッダーから自動設定します。非同期の子処理も言語を継承し、明示的な `MessageOptions.locale`、リクエスト言語、起動時の既定値の順で優先します。コンテキスト内の `setGlobalLocale` はそのリクエストだけを変更します。コンテキスト外の設定は起動時に限定し、リクエスト hook から呼びません。

ブラウザーはアプリ全体の `setGlobalLocale` / `createLocaleStore` を使います。SSR の UI store 初期化と setter は自身の状態のみ変更し、メッセージはリクエストコンテキストを参照します。`runWithLocale` は Node 入口専用です。

### フィードバック入口とリクエスト関連付け

`kit.createFeedbackHandler` は `/api/feedback/[...path]/+server.ts` の GET/POST/PATCH に使用できます。serv と同じ api-contract schema を再利用し、入力ストリームの容量とクライアント認証情報の混入を制限します。resolveContext は検証済み locals.session から範囲・権限を作り、null は拒否します。既存 createHandle の認証・CSRF・通信暗号化を維持してください。

createHandle は有効な上限付き X-Request-Id を保持して応答に付け、非同期業務にリクエストと検証済みユーザーを伝播します。通常の業務ログを収集する場合、ホストの middleware で `core.context.run({ scopeId: 'configured-product' }, next)` により業務を包みます。範囲は feedback と一致させ、クライアントのヘッダーから取得しません。

```ts
import type { SessionData } from '@h-ai/kit'
import { feedback } from '@h-ai/feedback'
import { kit } from '@h-ai/kit'

const handler = kit.createFeedbackHandler({
  feedback,
  resolveContext: (event) => {
    const session = (event.locals as { session?: SessionData }).session
    return session
      ? { scopeId: 'configured-product', userId: session.userId, permissions: session.permissions }
      : null
  },
})
export const GET = handler
export const POST = handler
export const PATCH = handler
```

### 任意の対話チャレンジ

kit.auth.createApi(iam).createCaptcha を POST /api/auth/captcha として公開します。kit.auth.publicPaths は対応済みです。kit.client.createAuthActions は captcha を保持し createCaptcha を提供し、AuthPanel が自動求解します。初回/期限切れ変更には /api/auth/password/renew も公開します。IAM がサーバーで証明を強制検証します。

方針・既定値・復旧範囲は次を参照： [IAM](../iam/README.ja.md)。

### 期限切れセッションの画面内復帰

`kit.client.create({ recoverSession })` によって現在の画面と入力を保持して再ログインできます。UI の `createSessionRecovery` / `SessionRecoveryDialog` を使い、ルートで公開方針と元の利用者を設定し、`recovery.recover` と標準認証 actions を渡して破棄時に cancel します。IAM は発行前に `expectedUserId` を確認し、通常の CAPTCHA・ロック・改密・アクセス規則を適用します。認証拒否が明確な要求だけ1回続行でき、取消・5xx・タイムアウト・結果不明の書込は再送しません。旧セッションの重要操作証明は再確認が必要な場合があります。標準認証 actions は自身の復帰再試行を無効にします。独自認証は apiFetch の第3引数 `{ recoverSession: false }` で再帰を防ぎます。terminalType（web/app/desktop/api、既定 web）は分類用で機器認証ではありません。

### ページ離脱時のセッション方針

`session.endOnPageHide` の既定値は `false` です。ホストは `actions.bindPageExit({ enabled: config.session.endOnPageHide })` を呼び、破棄時に戻り値の解除関数を実行します。標準 admin/H5/fullstack テンプレートは接続済みです。BFCache 以外の `pagehide`（再読み込み、文書全体の移動を含む）で POST `/auth/session/close` を最善努力で送信し、保持する access と関連 refresh を失効します。既存の CSRF/暗号化転送を使用し、`keepalive` を付け、自動更新しません。古い応答が新しいログインを上書きしないよう Cookie/ローカル資格情報を消去しません。明示的ログアウトは通常どおり失効と消去を行います。ブラウザーが離脱要求を送らない場合もあるため、業務に応じてサーバーの `idleTimeout`/`absoluteTimeout` を併用してください。閉じた瞬間の失効は保証できません。

### リクエストごとのアクセス制御

パスルールの `encryption` は required / disabled、省略時はホスト設定です。disabled でもアクセス条件と認証は検証し、フレームワークの暗号化信封は拒否します。required は独自 JSON エンドポイントにも適用でき、`excludePaths` より優先します。Crypto・管理鍵リング・registry が必要で、反対指定の重複は Handle 作成時に失敗します。crypto 対応 CLI テンプレートはサーバーとブラウザーを装配し、本番では db と共有 DB を使用します。非公開ポリシーと代理設定はブラウザーに渡さず、明文呼出側は公開の転送除外設定に従います。

サーバーの `_kit.yml` にある `trustedProxies` と `access` を `kit.createHandle` に明示的に渡します。例と生成テンプレートはアプリ初期化後に Handle を一度だけ生成します。`access` は既定 `false` です。`{ rules: [{ id: 'external', paths: ['/api/v1/external/**'], allowIps: ['192.0.2.0/24'] }] }` は一致する入口だけを、`global` はホストが扱う全要求を制限します。パスは配備プレフィックスを含みます。静的ホストが直接返す資源は Handle を通りません。

独立 YAML は `access: { file: './config/security/request-access.yml' }` と指定します。作業ディレクトリを基準に起動時だけ最大 1 MiB を読み、変更時は Handle を再生成します。全体条件と一致するすべてのルールを満たす必要があります。空のリストは対応する制限なし、時区は既定 UTC です。既存セッションも許可時間終了後は拒否します。preflight と鍵交換も判定し、通常の暗号化要求は HTTP 403 / `hai:common:104` の応答暗号化を保持します。

既定 `trustedProxies: auto` は通常のホストで転送ヘッダーを無視し、管理対象 Compose の非公開バックエンド構成だけでコンテナネットワークを採用します。独自の入口は実際の代理 IP/CIDR を指定し、`[]` で信頼を無効化します。解決後の `event.getClientAddress()`、ポリシー、IAM、監査は同じ接続元を使います。外側の代理・源 IP の喪失・環境変数と復旧は[リクエスト制御手引き](../../docs/usage/configuration/request-access.md)を参照してください。

## 設定

### 用途に応じた設定入口

| 設定入口                                  | 用途                 | 入力                                                             | 効果                                                          | 例                                              |
| ----------------------------------------- | -------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| `server.host / server.port`               | リスナー             | host string, port integer; HOST/PORT override                    | resolved Kit server config; default 127.0.0.1:3000            | `server: { host: 127.0.0.1, port: 3000 }`       |
| `transport`                               | 同一オリジン暗号転送 | false or keyExchangePath/excludePaths/byte/time/route budgets    | public transport config for hook and browser; no private keys | `transport: { maxPlaintextBytes: auto }`        |
| `trustedProxies`                          | 信頼する代理         | auto or explicit IP/CIDR list; [] disables forwarded headers     | normalized client address for access policy                   | `trustedProxies: []`                            |
| `access`                                  | 要求アクセス方針     | false or independent policy configuration                        | per-request IP/time/path checks; not business ownership       | `access: false`                                 |
| `createHandle.auth / guards / middleware` | ホストの認証管線     | verifyToken/operations, paths and guard/middleware callbacks     | RequestEvent locals/session and rejection Response            | `kit.createHandle({ auth: authOptions })`       |
| `createHandle.rateLimit`                  | 共有レート制限       | windowMs, maxRequests and explicit atomic store                  | fixed window; 429 over quota, 503 on unavailable storage      | `kit.createHandle({ rateLimit: limitOptions })` |
| `createHandle.crypto`                     | 非公開依存を注入     | initialized crypto, serverKeyRing/keyStore, encryptedCookies/key | authenticated payload/cookies; ring stays server-only         | `kit.createHandle({ crypto: cryptoOptions })`   |
| `client.create`                           | ブラウザー要求設定   | auth memory store, CSRF names, transport, recoverSession         | same-origin apiFetch plus init/destroy/ready                  | `kit.client.create({ auth: true })`             |

pnpm で Svelte アプリを構築する工程では、`patchedDependencies` に `deepmerge@4.3.1` の補丁を登録し、実際の patch ファイルも保持してください。DaisyUI を使う場合はスタイル補丁も必要です。CLI の生成工程には該当項目が含まれます。npm パッケージを導入しても、このリポジトリーの pnpm 補丁設定は自動伝播しません。手動接入では該当する[補丁ファイル](../../patches/)と登録を同期して依存を再インストールしてください。

`kit.createHandle()` の設定項目：

| フィールド   | 型                                       | 説明                                                            |
| ------------ | ---------------------------------------- | --------------------------------------------------------------- |
| `auth`       | `HandleAuthConfig`                       | 認証（verifyToken / protectedPaths / publicPaths / loginUrl）   |
| `rateLimit`  | `object \| false`                        | レート制限（windowMs / maxRequests）                            |
| `logging`    | `boolean \| object`                      | リクエストログ（既定 `true`、`{ logBody: true }` で本文も記録） |
| `crypto`     | `HookCryptoConfig`                       | 通信暗号化 + Cookie 暗号化                                      |
| `guards`     | `GuardConfig[]`                          | 独自ガード（自動認証ガードの後に実行）                          |
| `middleware` | `Middleware[]`                           | 独自 middleware（組み込み middleware の後に実行）               |
| `a2a`        | `HandleA2AOperations \| HandleA2AConfig` | A2A 統合（Agent Card + JSON-RPC）                               |
| `onError`    | `function`                               | 独自のエラー処理                                                |

リクエスト/レスポンス概要は `trace` レベルで記録します。ログは既定で有効、`logBody` は既定で無効です。クエリーは元の `request.url`、パスは SvelteKit の現在の `event.url.pathname` を使用します。追跡付き `event.url.search/searchParams` を読まないため、ログを有効にした静的ページも事前生成できます。クエリーと任意の JSON 本文ログでは password/token/secret、認証、API キーなどを秘匿します。本文は複製から読み、アプリ側で引き続き利用できます。

リクエストの自動監査は `audit.isInitialized` の場合だけ実行します。静的サイトや Audit を選択しないアプリは handle のために初期化する必要がありません。各リクエストで確認するため、handle 作成後のモジュール初期化にも対応します。Audit を選択したアプリは `audit.init()` の結果を確認し、失敗時は起動を止めます。明示的な `audit.log/capture` の未初期化エラーは維持し、初期化済みモジュールの実際の書込み失敗は `Request audit failed` として記録します。必須の業務監査では明示的な結果を確認し、業務トランザクションの規則を適用してください。

`crypto.encryptedCookies` を設定する場合、`crypto.cookieEncryptionKey` または `HAI_KIT_COOKIE_KEY` が必要です。鍵がなければ `createHandle()` ですぐエラーになります。保護対象 Cookie の平文・破損暗号文・復号失敗は未存在として扱い、暗号化失敗時も平文保存に切り替えません。

鍵は 32 桁の16進文字列です。SM4-CBC と HMAC-SHA256 の鍵を別々に導出し、バージョン・Cookie 名・IV・暗号文を認証してから復号するため、改ざんや名前間の置換を拒否します。認証できない Cookie は無効として扱います。

認証 Cookie は `NODE_ENV` または `HAI_CORE_ENV` が `production` の場合に `Secure` を既定で有効にします。`HAI_E2E` / `HAI_E2E_MOCK` は Cookie の安全要件を緩和しません。本番のレート制限も両方の環境変数を認識し、明示的なテストフラグだけがメモリカウンターを許可します。

### 転送容量とモジュール予算

設定 transport.maxPlaintextBytes は 1 KiB～64 MiB の明示整数または auto を受け付けます。auto/省略は undefined に正規化され、要件なしの既定は 1 MiB、フィードバックのホストでは resolveTransportBodyLimits の requiredPlaintextBytes で統合します。明示上限の不足は起動/梱包時の失敗とし、上書きしません。プロキシ・adapter-node・ハンドシェイク・実行時の予算を一致させ、添付・展開・行数の制限は独立して検証します。

重要操作では `reauthorize: () => sensitiveActions.authorize(operation)` を Kit apiFetch の第3引数、または typed client の options.context に渡します。セッション更新・復帰または明確な証明拒否の後、新しい用途証明で1回だけ続行します。取消時は追加の書込を送らず、コールバックがなければ旧証明を再送しません。

## エラー処理

- API endpoint は `kit.handler()` でラップすることを推奨。
- `kit.validate.body` / `kit.guard.require` の `Response` は `kit.handler` が API 制御フローとして処理します。ページ `load` では `kit.guard.check` と SvelteKit `error` を使い、検索条件は `safeParse` で検証してネイティブなページエラーに変換します。API Response をそのまま throw しません。
- 制御フロー以外の例外は `kit.handler()` が `500 INTERNAL_ERROR` 応答に変換。

### エラー表示とログの関連付け

`kit.response.fromError/fromResult` は安全なフィールド検証 `cause`、明示的な `publicExt`（`ext` に変換）、`httpStatus` を保持します。内部原因や拡張情報は公開せず、モジュール失敗ごとに関連ログを一度だけ記録します。

HTTP/UI 境界で業務メッセージを公開するのは、明示された有効な4xx状態のみです。`httpStatus` が未指定または不正な場合は500として安全なメッセージを返します。独自の業務エラーには完全なエラー定義または明示的な状態を指定してください。

`kit.response.validationError(errors)` も同じ許可リストを使い、`error.cause` に翻訳済みの `field/message` だけを返します。拒否された値、SQL、追加項目は公開せず、`details.errors` は使いません。
応答ヘルパー、認証ガード、レート制限は `HaiCommonError` と `httpStatus`・`traceId`・`X-Trace-Id` を共用します。未認証は `UNAUTHORIZED.code`、権限不足は `FORBIDDEN.code`、頻度超過は `RATE_LIMIT_EXCEEDED.code`（429）。制限ストアの障害は安全な503応答を返し、原因はサーバーログに保持します。

HTTP エラーには安全な翻訳文と追跡番号を含めます。ToastContainer は番号を既定で非表示にし、調査情報のアイコンから表示・コピーできます。同じ ID を error.traceId と X-Trace-Id に返します。requestId を traceId として共有し、ブラウザーとサーバーのログを関連付けます。脱機密化した例外・スタック・操作情報はログに残し、内部 cause/ext は公開しません。項目検証は翻訳済みの項目名とメッセージだけを返します。

HTTP/UI 境界には core.error.toPublic(error, traceId?)、再翻訳後の表示には core.error.formatMessage(error) を使い、ID を重複追加しません。ログには完全な Error を渡してください。DB ログにはドライバーコード、脱機密化したメッセージ・スタック、表・列を残し、SQL 本文、バインド値と接続認証情報を記録しません。

audit の初期化後、createHandle は検証済みセッションの身元/役割、プラットフォーム getClientAddress と要求 ID を業務 audit.log に関連付けます。request.execute はルート雛形・メソッド・状態・成功/失敗/拒否を記録し、守衛リダイレクトと SvelteKit HTTP 制御フローも含みます。要求本文・内部エラーは複製しません。capture.enabled で自動記録、capture.includeReads で成功読取を制御し、失敗した読取は既定で記録します。業務完了/失敗はアプリが明示的に記録し、自動記録を無効にしても業務 log は維持します。

## 開発とテスト

```bash
pnpm --filter @h-ai/kit test
```

Kit に共通の init/close はありません。共有 cache・IAM・crypto はアプリが初期化と終了を管理します。型検査できる例は [JSDoc 規約（中国語）](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) を参照してください。認証は iam.auth.verifyToken で検証し、空でない token だけでは許可しません。

## ライセンス

Apache-2.0
