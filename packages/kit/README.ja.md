# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md) · [@h-ai/iam](../iam/README.ja.md)

`@h-ai/kit` は hai-framework の SvelteKit 統合モジュールで、共通のリクエストパイプラインと同一オリジンの endpoint ツールを提供します：

- `kit.createHandle()`：セッション解析、ルートガード、middleware チェーン、任意の通信・Cookie 暗号化。
- `kit.handler()`：API endpoint の例外処理境界。
- `kit.guard` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client` / `kit.crud`

> クロスプラットフォームの公開 HTTP contract は `@h-ai/api-contract` で定義し、`@h-ai/serv` にマウント、`@h-ai/api-client` の型付きクライアントで呼び出します。`@h-ai/kit` は業務 API contract を定義・提供しません。

## インストール

```bash
npm install @h-ai/kit
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/vite-plugin-svelte vite
```

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

## 依存関係

- `@h-ai/iam`：A2A 用の認証・認可（任意）。A2A 機能を使う前に初期化。
- `@h-ai/crypto`：通信・Cookie 暗号化（任意）。暗号化を使う前に初期化。

## クイックスタート

### プロジェクト設定

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
    // adapter: createAdapter(),
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
  ssr: { noExternal: [/@h-ai\//] },
})
```

### リクエストパイプラインの構築

**src/hooks.server.ts**：

```typescript
import type { Handle } from '@sveltejs/kit'
import { kit } from '@h-ai/kit'

const haiHandle = kit.createHandle({
  auth: {
    verifyToken: async (token) => {
      return token ? { userId: 'u_1', roles: ['admin'], permissions: ['user:read'] } : null
    },
    loginUrl: '/auth/login',
    protectedPaths: ['/admin/*', '/api/*'],
    publicPaths: ['/api/auth/*', '/api/public/*'],
  },
  rateLimit: { windowMs: 60_000, maxRequests: 100 },
  logging: true,
})

export const handle: Handle = haiHandle
```

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
import { apiFetch } from '$lib/utils/api'

const response = await apiFetch('/api/users', { method: 'GET' })
```

> CSRF Header は `apiFetch` が自動付与します。`@h-ai/kit` は独立した CSRF middleware ファクトリーを提供しません。
>
> 認証：同一オリジンの SvelteKit endpoint は httpOnly Cookie を優先し、サーバーで Cookie を読んで認証します。機密 Token を `localStorage` に保存する必要はありません。Bearer Header が必要なら独自の `BrowserTokenStore`、または `kit.auth.setBrowserToken()` でページ内メモリーに保存してから `kit.client.create({ auth: true })` を使います。

### 同一オリジンの通信暗号化

kit の通信暗号化は `@h-ai/crypto` に委譲します。サーバーは `crypto.transport.createServer()` で管理器を作成し、ブラウザーは `kit.client.installBrowserTransport(kitConfig, { crypto })` の 1 行で同一オリジンの fetch ラッパーを導入します。アプリ側はトップレベルの `crypto` のみを設定します。

**src/hooks.server.ts**：

```ts
import { cache } from '@h-ai/cache'
import { createRedisTransportKeyStore, crypto } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

await crypto.init()
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
      requireEncryption: true,
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

ノード間でクライアント公開鍵を共有するには、実行時に `kit.createHandle({ crypto: { transport: { keyStore } } })` へ `createRedisTransportKeyStore()` または `createReldbTransportKeyStore()` を渡します。このようなオブジェクト依存を `_kit.yml` に**書いてはいけません**。設定ファイルは公開パスとスイッチのみを保持します。

transport は既定で同一オリジンの `/api/*`、SvelteKit の `__data.json`、鍵交換 endpoint に適用します。ページ文書・静的ファイルは平文で `X-Client-Id` は不要です。アップロードなどの `multipart/form-data` はそのまま送信し、サーバーの `excludePaths` で明示的に許可してください。

既定の安全方針は fail-closed です。`requireEncryption: true` で保護パスに `X-Client-Id` がなければ 400 を返します。管理器の利用不可、応答の暗号化失敗、暗号化サイズ上限超過はエラーになり、平文の業務応答は渡しません。`requireEncryption: false` は段階的移行用で、本番では推奨しません。

### `_kit.yml` による共通 transport 設定

`@h-ai/kit` は `KitConfigSchema` / `resolveKitConfig()` を提供し、同じ `_kit.yml` から
`hooks.server.ts` とブラウザーの `kit.client.installBrowserTransport()` の両方を設定できます：

```yml
server:
  host: 127.0.0.1
  port: 3000

transport:
  keyExchangePath: /api/_hai/key-exchange
  requireEncryption: true
  encryptResponse: true
  excludePaths:
    - /api/storage
    - /api/public
    - /api/auth/profile/avatar
  maxClients: 10000
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

## 設定

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

## エクスポートパス

- `@h-ai/kit`：主入口。`kit` 名前空間と型を提供。
- `@h-ai/kit/client`：ブラウザークライアント。
- `@h-ai/kit/adapter`：2 モードのビルド adapter（`createAdapter()`）。
- `@h-ai/kit/vite`：Vite プラグイン。
- `@h-ai/kit/a2a`：A2A 統合。
- `@h-ai/kit/crypto`：暗号モジュール統合。

## 設定による認証画面

規約は設定の userAgreementMarkdown/privacyPolicyMarkdown または URL を使用できます。同じ規約は Markdown 本文を優先して安全な Modal で描画します。

kit.auth.createApi(iam) の標準 handler と kit.auth.publicPaths を使用し、AuthPanel には kit.client.createAuthActions({ apiFetch }) を接続します。検証、Cookie、HaiResult 変換を共通化し、ユーザー情報と改密の保護を維持します。

[完整 IAM 配置 / IAM configuration](../iam/README.ja.md)

## エラー処理

- API endpoint は `kit.handler()` でラップすることを推奨。
- `kit.validate.body` / `kit.guard.require` は SvelteKit の制御フローとして `Response` を throw。
- 制御フロー以外の例外は `kit.handler()` が `500 INTERNAL_ERROR` 応答に変換。

## テスト

```bash
pnpm --filter @h-ai/kit test
```

## License

Apache-2.0
