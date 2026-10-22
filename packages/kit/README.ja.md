# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md) · [@h-ai/iam](../iam/README.ja.md)

## 概要

`@h-ai/kit` は hai-framework の SvelteKit 統合モジュールで、共通のリクエストパイプラインと同一オリジンの endpoint ツールを提供します：

- `kit.createHandle()`：セッション解析、ルートガード、middleware チェーン、任意の通信・Cookie 暗号化。
- `kit.handler()`：API endpoint の例外処理境界。
- `kit.guard` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client` / `kit.crud`

> クロスプラットフォームの公開 HTTP contract は `@h-ai/api-contract` で定義し、`@h-ai/serv` にマウント、`@h-ai/api-client` の型付きクライアントで呼び出します。`@h-ai/kit` は業務 API contract を定義・提供しません。

## 主な機能

- Handle Hook の合成（`createHandle` / `sequence`）
- 認証・ロール・権限ガード（`guard.require` / `guard.check`）
- 組み込み Logging / RateLimit / CORS middleware（`createHandle` 設定で有効化）
- 共通の API 応答とリクエスト検証（Zod）
- Bearer Token ツール（サーバー login/logout + ブラウザーの Token 保存）
- 自動 CSRF と通信暗号化に対応するブラウザークライアント
- 宣言的な CRUD リソース定義（`crud.define`）
- A2A 統合：既定の検出パスは `/.well-known/agent-card.json`。`authenticate` 設定時は null/undefined が 401 となり、認証未設定時のみ匿名を許可します。API Key の引数は完全な Agent Card の `securitySchemes.apiKey` から取得します。Hook と明示的 A2A ルートは JSON-RPC 解析エラー・SSE キャンセル時の解放処理を共有します。
- 2 種類のビルドモード（`createAdapter()`）

## 使い始める

### インストール

```bash
npm install @h-ai/kit @h-ai/core sm-crypto@0.5.7
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/vite-plugin-svelte vite
```

### 依存関係

- `@h-ai/iam`：A2A 用の認証・認可（任意）。A2A 機能を使う前に初期化。
- `@h-ai/crypto`：通信・Cookie 暗号化（任意）。暗号化を使う前に初期化。

### クイックスタート

#### プロジェクト設定

**svelte.config.js**：

```js
import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

const config = {
  preprocess: [vitePreprocess()],
  compilerOptions: { runes: true },
  kit: {
    adapter: adapter(),
    // 双构建模式：import { createAdapter } from '@h-ai/kit/adapter'
    // adapter: await createAdapter(),
  },
}

export default config
```

**vite.config.ts**：

```ts
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  optimizeDeps: { exclude: ['bits-ui'] },
  ssr: { noExternal: ['@h-ai/ui', '@h-ai/kit'], external: ['@h-ai/core', 'sm-crypto'] },
})
```

Crypto または Kit/IAM を使う場合、アプリの本番依存に `sm-crypto@0.5.7` を含めます。CLI 生成済みのプロジェクトでは設定済みです。手動導入は `pnpm add sm-crypto@0.5.7` を実行してください。adapter-node は直接の本番依存も参照するため、external 指定だけでは不十分です。

#### リクエストパイプラインの構築

**src/hooks.server.ts**：

```typescript
import type { Handle } from '@sveltejs/kit'
import { cache } from '@h-ai/cache'
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
  rateLimit: { windowMs: 60_000, maxRequests: 100, store: kit.middleware.createCacheRateLimitStore(cache, { namespace: 'app' }) },
  logging: true,
})

export const handle: Handle = haiHandle
```

最初の確定時点から固定ウィンドウを開始し、後続リクエストはTTLを延長しません。storeは必須です。共有Redisの初期化成功を確認し、全ノードのnamespace/windowMs/maxRequestsを一致させます。キャッシュ障害や競合上限は503、超過は429で、get+setやローカル計数へフォールバックしません。createMemoryRateLimitStoreは開発または明示HAI_E2E/HAI_E2E_MOCKテスト用で、常駐タイマーを使わず参照解放で回収されます。1リクエスト最大64項目を遅延走査し、上限10000ウィンドウです。満杯時は有効な計数を追い出さず新キーを503にし、外部storeのライフサイクルは作成者が管理します。本番でテスト変数を設定しません。ヘッダー時刻は推定、実際の期間はRedis TTLで制御するため時計を同期します。キーは信頼済みadapterのgetClientAddressのみ使い、等価IPv6/IPv4表記を正規化します。生の転送ヘッダーを信頼せず、代理信頼はadapterで設定します。

#### API endpoint

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

#### ブラウザークライアント

`kit.client.create()` は SvelteKit の同一オリジン endpoint 向けです。Web・アプリ・ミニプログラムからクロスオリジンで公開 API を使う場合は `@h-ai/api-client` を使用してください。

```typescript
// src/lib/utils/api.ts — 全应用共享
import { kit } from '@h-ai/kit'

const client = kit.client.create()
export const { apiFetch } = client
```

```typescript
// 使用
import { apiFetch } from '$lib/utils/api'

const response = await apiFetch('/api/users', { method: 'GET' })
```

> CSRF Header は `apiFetch` が自動付与します。`@h-ai/kit` は独立した CSRF middleware ファクトリーを提供しません。
>
> 同一オリジンの SvelteKit endpoint は httpOnly Cookie を使い、サーバーで検証します。ブラウザーの Bearer Header が必要なら `kit.auth.setBrowserToken()` でページ内メモリーに保存してから `kit.client.create({ auth: true })` を使います。独自の `BrowserTokenStore` もメモリーまたはプラットフォームの安全なストレージを使用し、機密の認証情報を Web Storage に永続化しないでください。

#### 同一オリジンの通信暗号化

kit の通信暗号化は `@h-ai/crypto` に委譲します。サーバーは `crypto.transport.createServer({ serverKeyRing, keyStore })` で管理器を作成し、ブラウザーは `kit.client.installBrowserTransport(kitConfig, { crypto })` の 1 行で同一オリジンの fetch ラッパーを導入します。サーバーには管理済み鍵環と共有 registry も渡します。

**src/hooks.server.ts**：

```ts
import { cache } from '@h-ai/cache'
import { createRedisTransportKeyStore, crypto, parseTransportServerKeyRing } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

await crypto.init()
const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
if (!ring.success)
  throw new Error(ring.error.message)
const serverKeyRing = ring.data
await cache.init({ type: 'redis', host: '127.0.0.1', port: 6379 })

export const handle = kit.createHandle({
  auth: {
    verifyToken,
    protectedPaths: ['/api/*'],
    publicPaths: ['/api/_hai/*'], // 默认密钥协商端点
  },
  crypto: {
    crypto,
    transport: {
      serverKeyRing,
      keyStore: createRedisTransportKeyStore({ cache, ttlSeconds: 3600 }),
    },
  },
})
```

**src/routes/+layout.svelte**（推奨入口：ブラウザー側は 1 行）：

```svelte
<script lang='ts'>
  import { browser } from '$app/environment'
  import { appKitConfig } from '$lib/config/kit-config'
  import { crypto } from '@h-ai/crypto'
  import { kit } from '@h-ai/kit'

  // 一次性安装：内部按 _kit.yml 决定是否启用 transport，并预热 crypto
  if (browser) {
    kit.client.installBrowserTransport(appKitConfig, { crypto })
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

認証済み v2 のみを受け付けます。独立したランダム SM4-CBC 鍵と HMAC-SM3 鍵を SM2 で包み、送信者署名、MAC の順に検証してから CBC を復号します。要求はクライアント秘密鍵、応答は選択されたサーバー鍵バージョンで署名します。version、direction、serverKeyId、clientId、nonce を兼ねるランダム 128 ビット requestId、issuedAt、HTTP method、pathname と元の search の SM3 pathHash、応答 status を認証します。要求の有効期限は 5 分、未来方向の時計差は最大 30 秒です。共有 registry が (clientId, requestId) を原子的に消費し、ノード間の時計差を含め issuedAt + 6 分まで保持します。保存障害では拒否します。時計同期と Redis の noeviction/永続化により有効な nonce を保持してください。業務の再試行には別の冪等キーが必要です。

空の POST も空平文の認証封装を送ります。GET/HEAD は X-Hai-Transport ヘッダー、204/304/HEAD など本文なし応答も同じヘッダーを使います。他の要求・応答は JSON 本文と X-Encrypted: true を使います。クライアントは元の要求コンテキストと HTTP status を照合し、マーカー欠落、旧形式、認証失敗では reject します。平文 endpoint は excludePaths で明示的に除外し、CORS では X-Hai-Transport を許可・公開してください。鍵交換の公開鍵認証は TLS に依存し、IAM の業務認可は別に必要です。

固定上限は serv・クライアントと `@h-ai/crypto` の `TRANSPORT_BODY_LIMITS` を共有し、鍵交換 JSON は 16 KiB、公開鍵は 1 個あたり 4 KiB、平文は 1 MiB、暗号文 JSON は 2 MiB + 32 KiB です。実際の UTF-8 バイトを元のストリームから逐次読み取り、超過・キャンセル時は停止・キャンセルして reader を解放します。clone による全量読み取りは行いません。リクエスト超過は 413、応答超過は 500、不正な公開鍵は 400 です。再構築した Request は signal を維持し、リクエスト・応答の古い Content-Length/Content-Encoding を削除します。上限は `_kit.yml`・環境変数の設定ではありません。

#### `_kit.yml` による共通 transport 設定

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
import { resolveKitConfig } from '@h-ai/kit'
import { parse } from 'yaml'
import rawKitConfig from '../config/_kit.yml?raw'

export const appKitConfig = resolveKitConfig(parse(rawKitConfig) ?? {})
```

`resolveKitConfig()` は `server`（host/port）と `transport` を解決します。host/port は `HOST` / `PORT` 環境変数 > `_kit.yml` の `server` > `127.0.0.1:3000` の順で、SvelteKit サーバー入口で共通利用します（`@h-ai/serv` と同じ構造）。
サーバーのみで設定を読む場合は `core.config.validate('kit', KitConfigSchema)` も利用できます。
ブラウザーも読む可能性があるため、`_kit.yml` は公開 server/transport パスとスイッチのみを含め、秘密鍵などを書かないでください。

### 設定

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

`crypto.encryptedCookies` を設定する場合、`crypto.cookieEncryptionKey` または `HAI_KIT_COOKIE_KEY` が必要です。鍵がなければ `createHandle()` ですぐエラーになります。保護対象 Cookie の平文・破損暗号文・復号失敗は未存在として扱い、暗号化失敗時も平文保存に切り替えません。

### エクスポートパス

実行時メソッドは `kit` 名前空間または明示したサブパスを使用し、型は個別に公開します。browser 宣言はサーバーファクトリを公開しません。Vite 設定には `@sveltejs/kit/vite` を使い、`@h-ai/kit/vite` プラグインはありません。

- `@h-ai/kit`：主入口。`kit` 名前空間と型を提供。
- `@h-ai/kit/client`：ブラウザークライアント。
- `@h-ai/kit/adapter`：2 モードのビルド adapter（`createAdapter()`）。
- `@h-ai/kit/a2a`：A2A 統合。
- `@h-ai/kit/crypto`：暗号モジュール統合。

### 設定による認証画面

規約は設定の userAgreementMarkdown/privacyPolicyMarkdown または URL を使用できます。同じ規約は Markdown 本文を優先して安全な Modal で描画します。

kit.auth.createApi(iam) の標準 handler と kit.auth.publicPaths を使用し、AuthPanel には kit.client.createAuthActions({ apiFetch }) を接続します。検証、Cookie、HaiResult 変換を共通化し、ユーザー情報と改密の保護を維持します。

[完整 IAM 配置 / IAM configuration](../iam/README.ja.md)

### エラー処理

- API endpoint は `kit.handler()` でラップすることを推奨。
- `kit.validate.body` / `kit.guard.require` は SvelteKit の制御フローとして `Response` を throw。
- 制御フロー以外の例外は `kit.handler()` が `500 INTERNAL_ERROR` 応答に変換。

### CRUD fields

宣言型 CRUD 項目は UI フォームの幅を指定する `colSpan: 'auto' | 1 | 2` に対応します。`validation.message` は文字列または `() => string` を受け取り、現在の言語で表示できます。レイアウトは `CrudPage.form` で設定し、サーバーでも検証してください。

### リクエスト言語の分離

Node リクエストと SSR は `core.i18n.runWithLocale(locale, () => handleRequest())` で囲みます。SvelteKit は `kit.i18n.runWithLocale(locale, () => resolve(event))` を使えます。serv はリクエストヘッダーから自動設定します。非同期の子処理も言語を継承し、明示的な `MessageOptions.locale`、リクエスト言語、起動時の既定値の順で優先します。コンテキスト内の `setGlobalLocale` はそのリクエストだけを変更します。コンテキスト外の設定は起動時に限定し、リクエスト hook から呼びません。

ブラウザーはアプリ全体の `setGlobalLocale` / `createLocaleStore` を使います。SSR の UI store 初期化と setter は自身の状態のみ変更し、メッセージはリクエストコンテキストを参照します。`runWithLocale` は Node 入口専用です。

## 開発とテスト

```bash
pnpm --filter @h-ai/kit test
```

## ライセンス

Apache-2.0

認証 Cookie は `NODE_ENV` または `HAI_CORE_ENV` が `production` の場合に `Secure` を既定で有効にします。`HAI_E2E` / `HAI_E2E_MOCK` は Cookie の安全要件を緩和しません。本番のレート制限も両方の環境変数を認識し、明示的なテストフラグだけがメモリカウンターを許可します。

Kit に共通の init/close はありません。共有 cache・IAM・crypto はアプリが初期化と終了を管理します。型検査できる例は [JSDoc 規約（中国語）](../../docs/module-jsdoc.md) を参照してください。認証は iam.auth.verifyToken で検証し、空でない token だけでは許可しません。

`kit.auth.logout(cookies, accessToken)` は `Promise<HaiResult<void>>` を返します。Token がなければ Cookie のみ消去して成功し、Token があるのに認証操作が未設定なら失敗します。サーバー結果にかかわらず Cookie は消去しますが、呼出側は失敗を HTTP 応答や UI に伝えます。ローカル消去はサーバー失効の確認ではありません。制御フロー例外は引き続き伝播します。
