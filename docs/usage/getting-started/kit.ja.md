# Kit で注文運用コンソールを作る

[中文](kit.md) · [English](kit.en.md) · [API リファレンス](../function/kit.ja.md#api-reference) · [設定](../configuration/kit.ja.md) · [データ構造](../data/kit.ja.md)

注文運用コンソールに稼働確認用の API を作ります。同じ SvelteKit アプリに注文のプレビュー、担当者の権限、取引先のアクセス制御、レート制限、通信暗号化を追加します。変更する箇所以外は、前のステップのファイルとルートを引き続き使用します。

動作する Svelte 5 と SvelteKit のプロジェクトを用意します。初期化順序と必要なサービスは [Kit の依存関係](../function/kit.ja.md#module-dependencies)を参照してください。Serv でも同じ業務要件を段階的に実装します。 [Serv の実装](serv.ja.md#quick-start)

<a id="quick-start"></a>

## ステップ 1：注文運用コンソールを起動する

注文運用チームは、デプロイ時にサービスが利用可能か確認できるエンドポイントを必要としています。既存の Svelte 5 と SvelteKit プロジェクトを `orders-console` とします。以降は同じアプリを拡張します。Kit と Node SSR の実行時依存関係を導入し、Node アダプターが未導入であれば追加します。

```sh
pnpm add @h-ai/kit sm-crypto@0.5.8
pnpm add -D @sveltejs/adapter-node
```

`vite.config.ts` の SvelteKit プラグインのオプションに Node アダプターを指定します。既存の `sveltekit(...)` にオプションを追加し、他のプラグインとビルド設定を維持します。

```ts
import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

// Node アダプターでサーバー用の成果物を生成する。空の base はオリジンのルートに対応する。
export default defineConfig({
  plugins: [sveltekit({ adapter: adapter(), paths: { base: '', relative: false } })],
})
```

`src/hooks.server.ts` から共通フックをエクスポートします。リクエストログは既定で有効になり、レスポンスには `X-Request-Id` が付きます。

```ts
import { kit } from '@h-ai/kit'

// 既定のグローバル Handle を生成する。リクエストを記録し、レスポンスに X-Request-Id を付ける。
export const handle = kit.createHandle()
```

`src/routes/api/v1/status/+server.ts` から GET ハンドラーをエクスポートします。

```ts
import { kit } from '@h-ai/kit'

// data.status が ready の HTTP 200 を返す。予期しない失敗は handler が安全な HTTP レスポンスに変換する。
export const GET = kit.handler(() => kit.response.ok({ status: 'ready' }))
```

`pnpm dev` を実行し、`curl -i http://localhost:5173/api/v1/status` などで `/api/v1/status` にアクセスします。HTTP 200、`X-Request-Id`、`{"success":true,"data":{"status":"ready"}}` が返ります。認証、共有レート制限、通信暗号化は対象ルートに必要なものを追加します。

<a id="orders-console-validation"></a>

## ステップ 2：運用担当者が注文をプレビューする

運用担当者が注文の保存前にタイトルを確認できるようにします。`zod` をインストールし、`src/routes/api/v1/orders/preview/+server.ts` にハンドラーを追加します。ステップ 1 のステータスルートとフックを使い続けます。

```sh
pnpm add zod
```

```ts
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const PreviewSchema = z.object({ title: z.string().trim().min(1) })

export const POST = kit.handler(async ({ request }) => {
  // 検証済みタイトルを preview に入れる。タイトルがない場合も、空白だけの場合も HTTP 400 を返す。
  const preview = await kit.validate.body(request, PreviewSchema)
  return kit.response.ok({ preview })
})
```

```sh
curl -i http://localhost:5173/api/v1/orders/preview \
      -H 'Content-Type: application/json' \
      -d '{"title":"  Office supplies  "}'
```

HTTP 200 と `data.preview.title: "Office supplies"` が返ります。本文を `{"title":" "}` に変えると HTTP 400 です。プレビューは保存予定の値を返します。次はアカウントと権限を確認します。 [Serv の注文プレビュー](serv.ja.md#orders-console-validation) · [Kit の入力検証](../function/kit.ja.md#kit-validate)

<a id="orders-console-auth"></a>

## ステップ 3：運用担当者と監査担当者の権限を分ける

`orders:write` を持つ運用担当者にプレビューを許可します。内部レポートには `auditor` ロールと `reports:read` 権限の両方が必要です。まずローカルのデモセッションで確認し、実アカウントの導入時に同じフックを IAM に接続します。 [Serv の権限設定](serv.ja.md#orders-console-auth)

`pnpm add @h-ai/core` を実行し、以下の宣言を `src/app.d.ts` に追加します。`App.Locals.session` がすでにある場合は現在の宣言を使います。

```ts
import type { HttpSession } from '@h-ai/core'

declare global {
  namespace App {
    interface Locals {
      session?: HttpSession
    }
  }
}
```

以下を `src/lib/server/orders-session.ts` に保存します。開発環境でのみ動かし、二つの起動時環境変数からトークンを取得します。デモアカウントはデータベースに登録する必要がありません。

```ts
import { core, HaiCommonError } from '@h-ai/core'

export async function verifyOrdersSession(token: string) {
  if (process.env.NODE_ENV !== 'development')
    return core.err(HaiCommonError.UNAUTHORIZED)
  if (token && token === process.env.KIT_ORDERS_EDITOR)
    return core.ok({ userId: 'editor-1', roles: ['operator'], permissions: ['orders:write'] })
  if (token && token === process.env.KIT_ORDERS_AUDITOR)
    return core.ok({ userId: 'auditor-1', roles: ['auditor'], permissions: ['reports:read'] })
  return core.err(HaiCommonError.UNAUTHORIZED)
}
```

ステップ 1 の `src/hooks.server.ts` を置き換えます。`base` からリクエストパスを組み立てるので、後でサブディレクトリーに移しても同じガードが使えます。

```ts
import { resolve } from '$app/paths'
import { kit } from '@h-ai/kit'
import { verifyOrdersSession } from './lib/server/orders-session.js'

const base = resolve('/').replace(/\/$/, '')
const protectedPaths = [
  '/api/v1/orders/preview',
  '/api/v1/reports/current',
  '/api/auth/me',
].map(path => base + path)

// 認証フックでセッションを復元する。ロール、権限、業務リソースの確認はそれぞれのルートで行う。
export const handle = kit.createHandle({
  auth: { verifyToken: verifyOrdersSession, protectedPaths },
})
```

ステップ 2 の注文プレビューの引数を `{ request }` から `{ request, locals }` に変更し、本文を読む前に以下の一行を追加します。

```ts
kit.guard.require(locals.session, 'orders:write')
```

監査担当者向けに `src/routes/api/v1/reports/current/+server.ts` を追加します。

```ts
import { kit } from '@h-ai/kit'

export const GET = kit.handler(({ locals }) => {
  // セッションはフックがセットする。権限または監査ロールが不足すると HTTP 403 を返す。
  kit.guard.require(locals.session, 'reports:read')
  const session = locals.session
  if (!session?.roles.includes('auditor'))
    return kit.response.forbidden()

  return kit.response.ok({ owner: session.userId, summary: 'Quarterly summary' })
})
```

開発端末で例の変数を設定し、アプリを再起動します。二つの文字列はローカル検証用です。

```sh
export KIT_ORDERS_EDITOR=orders-editor-demo
export KIT_ORDERS_AUDITOR=orders-auditor-demo
pnpm dev
```

```sh
curl -i http://localhost:5173/api/v1/orders/preview \
  -H 'Authorization: Bearer orders-editor-demo' \
  -H 'Content-Type: application/json' \
  -d '{"title":"  Office supplies  "}'
curl -i http://localhost:5173/api/v1/reports/current \
  -H 'Authorization: Bearer orders-auditor-demo'
```

トークンがなければどちらも HTTP 401 です。運用担当者はプレビューできますがレポートは HTTP 403 です。監査担当者は `data.owner` に `auditor-1` が設定されたレポートを取得できます。権限だけがあってロールがない場合も HTTP 403 です。

Kit と Serv は同じ `HaiResult<HttpSession>` を検証結果に使います。有効なトークンでは `data` が `locals.session` に入ります。トークンがない場合や検証で明示的に 4xx が返る場合、API ガードは 401 を返します。依存サービスの利用不可により検証が 503 を返すと、ハンドラーは実行されず、API は 503 を返します。

実アカウントでログインする場合は、`pnpm add @h-ai/iam` を実行します。`verifyOrdersSession` の import を `import { iam } from '@h-ai/iam'` に置き換え、先に [IAM の初期化](../function/iam.ja.md#quick-start)を完了します。フックの `auth` から `verifyToken` を外し、次の二つのフィールドを追加します。`protectedPaths` は残します。`kit.auth.createApi(iam)` の `login` を `src/routes/api/auth/login/+server.ts` の `POST` としてエクスポートします。`kit.client.createAuthActions()` と同一オリジンのクライアントをつなぎ、ログイン後に `/api/auth/me` で利用者を確認します。 [ログインと Cookie](../function/kit.ja.md#authorization-example) · [現在のアカウント API](../function/kit.ja.md#auth-current-account)

```ts
// 検証済みの利用者を locals.session に入れる。未認証はフックが 401 またはリダイレクトで扱う。
iam,
publicPaths: kit.auth.publicPaths.map(path => base + path),
```

<a id="orders-console-access"></a>

## ステップ 4：取引先向けレポートの公開範囲と頻度を制限する

取引先には集計だけを公開します。パスを分けると、ステップ 3 の内部レポートは引き続きアカウントで保護できます。`src/routes/api/v1/external/reports/+server.ts` を追加します。下記はサンプル集計を返します。実運用では業務ルールに従い、集計とマスキングを行います。 [Serv の取引先レポート](serv.ja.md#orders-console-access)

```ts
import { kit } from '@h-ai/kit'

export const GET = kit.handler(() => kit.response.ok({ report: 'Quarterly summary' }))
```

ルートにデプロイする場合の設定を `config/_kit.yml` に保存します。Kit は接続相手を確認し、信頼したプロキシから転送されたクライアント IP を使います。この構成で adapter-node の `ADDRESS_HEADER` は設定しません。実際の IP に置き換え、バックエンドに直接接続できないようにします。 [信頼するプロキシと規則](../configuration/kit.ja.md#request-access)

```yaml schema=@h-ai/kit:KitConfigSchema
http:
  trustedProxies: [192.0.2.10]
  access:
    rules:
      - id: partner-api
        paths: [/api/v1/external/reports]
        allowIps: [203.0.113.0/24]
  rateLimit:
    windowMs: 10000
    maxRequests: 2
```

以下を `src/lib/server/orders-http.ts` に保存し、ステップ 3 のフックで `./lib/server/orders-http.js` から `ordersHttp` をインポートして `kit.createHandle({ ... })` に `http: ordersHttp` を追加します。`auth` は現行の設定を使います。

```ts
import { core } from '@h-ai/core'
import { KitConfigSchema, type HandleConfig } from '@h-ai/kit'

const loaded = core.config.load('kit', './config/_kit.yml', KitConfigSchema)
if (!loaded.success)
  throw new Error(loaded.error.message)

export const settings = loaded.data
const { http } = settings
export const ordersHttp: HandleConfig['http'] = {
  ...http,
  rateLimit: http.rateLimit && {
    ...http.rateLimit,
    store: core.access.createMemoryRateLimitStore(),
  },
}
```

設定済みのプロキシを通して `GET /api/v1/external/reports` を呼びます。クライアント `203.0.113.42` は HTTP 200 と `data.report: "Quarterly summary"` を受け取ります。範囲外は 403 です。信頼していない接続の転送ヘッダーだけでアクセス権を得ることはできません。

同じ接続元が 10 秒以内に `GET /api/v1/status` を 3 回呼ぶと、200、200、429 となり、残り回数は 1、0、0 になります。`Retry-After` の秒数を待つと 200 に戻ります。カウンターのキーは信頼できるクライアント IP です。同じ IP のほかの許可済みリクエストと上限を共有します。複数インスタンスにする場合は Redis を初期化し、ストアを `core.access.createCacheRateLimitStore(cache, { namespace: "orders-console" })` に変更します。ストアの障害時は 503 です。 [レート制限の設定](../function/kit.ja.md#rate-limit-example)

<a id="orders-console-transport"></a>

## ステップ 5：同一オリジンの通信を暗号化し、サブディレクトリーを確認する

ログイン、レポート、レート制限が動作したら、同じ画面のリクエストとレスポンスを暗号化します。既存 YAML に `transport` を追加し、`http` は残します。本番で HTTPS、管理対象の鍵リング、共有キャッシュを使用します。鍵交換にはリクエストの完全なパスを使います。

ステップ 4 の上限 2 回は短い検証用です。`http.rateLimit.maxRequests` を 100 に変更して再起動し、時間枠とカウンターの構成を保ちます。鍵交換の POST と後続の API 呼び出しはそれぞれ計上されます。小さい上限で検証する場合は `Retry-After` が示す時間を待ちます。

```yaml schema=@h-ai/kit:KitConfigSchema
transport:
  keyExchangePath: /api/v1/_hai/key-exchange
  excludePaths: []
```

`pnpm add @h-ai/cache @h-ai/crypto` を実行し、以下を `src/lib/server/orders-transport.ts` に保存します。保護された設定から `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` を読み込みます。例はメモリで鍵を登録します。複数インスタンスでは初期化済みの共有 Redis を使います。 [鍵リングの準備](../function/crypto.ja.md#transport-protocol) · [Serv の通信暗号化](serv.ja.md#orders-console-transport)

```ts
import { cache } from '@h-ai/cache'
import { crypto } from '@h-ai/crypto'
import { settings } from './orders-http.js'

export async function createOrdersTransport(basePath: string) {
  if (settings.transport === false)
    return false as const

  const ready = await crypto.init()
  if (!ready.success)
    throw new Error(ready.error.message)
  const cached = await cache.init({ type: 'memory' })
  if (!cached.success)
    throw new Error(cached.error.message)
  const ring = crypto.transport.parseServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
  if (!ring.success)
    throw new Error(ring.error.message)

  return {
    ...settings.transport,
    crypto,
    basePath,
    serverKeyRing: ring.data,
    keyStore: crypto.transport.createKeyStore({ cache }),
  }
}
```

ステップ 4 のフックで `./lib/server/orders-transport.js` から `createOrdersTransport` をインポートし、`transport: await createOrdersTransport(base)` を追加します。`http` と `auth` を使い続けます。`src/routes/+layout.server.ts` から公開通信設定を返し、鍵リングとキャッシュはサーバーに置きます。

```ts
import { settings } from '../lib/server/orders-http.js'

export function load() {
  return { kitConfig: { transport: settings.transport } }
}
```

ルートレイアウト `src/routes/+layout.svelte` の既存の `<script>` に下のコードを追加します。`data` プロパティがある場合はその値を使います。画面と子コンテンツは引き続きレンダリングします。

```svelte
<script lang="ts">
  import type { LayoutProps } from './$types'
  import { browser } from '$app/env'
  import { resolve } from '$app/paths'
  import { crypto } from '@h-ai/crypto'
  import { kit } from '@h-ai/kit/client'
  import { untrack } from 'svelte'

  let { data, children }: LayoutProps = $props()
  if (browser) {
    kit.client.installBrowserTransport(untrack(() => data.kitConfig), {
      crypto,
      basePath: resolve('/').replace(/\/$/, ''),
    })
  }
</script>

{@render children()}
```

`src/routes/+page.svelte` にボタンを追加して、ブラウザーで確認します。`resolve()` でデプロイ先のパスに合わせます。

```svelte
<script lang="ts">
  import { resolve } from '$app/paths'

  let status = $state('')

  async function checkReadiness() {
    try {
      const response = await fetch(resolve('/api/v1/status'))
      if (!response.ok) {
        status = String(response.status)
        return
      }
      const result = await response.json()
      status = result.data.status
    }
    catch {
      status = '状態を読み取れません'
    }
  }
</script>

<button onclick={checkReadiness}>起動状態を確認</button>
<output>{status}</output>
```

前の開発サーバーを停止して、プロジェクトのルートで次のコマンドを実行します。ローカル動作用の鍵リングを作り、開発サーバープロセスだけに渡します。再起動すると新しい鍵リングが作られます。

```sh
node --input-type=module <<'JS'
import { spawnSync } from 'node:child_process'
import { crypto } from '@h-ai/crypto'

const ready = await crypto.init()
if (!ready.success)
  throw new Error(ready.error.message)
const pair = crypto.asymmetric.generateKeyPair()
await crypto.close()
if (!pair.success)
  throw new Error(pair.error.message)

const child = spawnSync('pnpm', ['dev'], {
  env: {
    ...process.env,
    HAI_CRYPTO_TRANSPORT_SERVERKEYRING: JSON.stringify({
      activeKeyId: 'local',
      keys: { local: pair.data },
    }),
  },
  stdio: 'inherit',
})
if (child.error)
  throw child.error
process.exitCode = child.status ?? 1
JS
```

Node にデプロイする場合はアプリの終了処理を使います。アダプターの `sveltekit:shutdown` を受けたら、この例で初期化した Cache を閉じ、次に Crypto を閉じます。既存アプリの初期化関数と終了関数を利用できます。

ページを開き「起動状態を確認」を押します。初回は Network に `POST /api/v1/_hai/key-exchange` と、`X-Encrypted: true` の `GET /api/v1/status` が並び、画面に `ready` と表示されます。再検証ではレート制限の時間枠を待ちます。保護された API に通常の curl を実行すると HTTP 400 です。デプロイ基盤が通常の HTTPS で稼働確認する場合は、保護対象の `/api` の外に専用の確認パスを用意します。

`/console` にデプロイする場合はステップ 1 の Vite 設定で `paths.base` を `"/console"` に変更し、`relative: false` を維持します。ルートファイルはそのままです。YAML の以下の二つの完全パスを変更し、他の設定を保ちます。

```yaml
http:
  access:
    rules:
      - id: partner-api
        paths: [/console/api/v1/external/reports]
        allowIps: [203.0.113.0/24]
transport:
  keyExchangePath: /console/api/v1/_hai/key-exchange
```

再ビルドし、`/console/` でボタンを押します。リクエスト先は `/console/api/v1/status`、鍵交換は `/console/api/v1/_hai/key-exchange` です。ブラウザーでログインする場合は `createAuthActions` の `basePath` に `/console/api/auth` のような実パスを渡します。デプロイ時は adapter-node が `HOST` と `PORT` を読み取ります。 [待ち受け設定](../configuration/kit.ja.md#apply-and-verify)

Serv チュートリアルと同じファイルやイベントストリームを Kit から提供する場合は、契約、処理、`transportRoutes` を `serv.createContractHandler()` に渡し、`kit.createHandle({ contract })` で登録します。既存ページが表示されること、監査担当者が添付をダウンロードできること、ログアウト後の再試行で HTTP 401 になることを確認します。ステップ 5 の通信暗号化を使う場合は、ファイルとイベントストリームの実際のメソッドとパスに HTTPS 平文の例外を指定します。 [共有の契約を組み込む](../function/kit.ja.md#kit-contract) · [ブラウザーでイベントを読む](../function/serv.ja.md#ai-stream-example)

コンソールでレポートの音声を生成し、アップロードした音声を文字に起こすこともできます。ステップ 3 のセッションとレポートの権限を使い、HTTP で処理を呼び出します。 [レポートの読み上げと文字起こし](serv.ja.md#orders-console-audio)

<a id="orders-console-hook-options"></a>

## フック設定を追加するステップ

各行からアプリにそのオプションを加えるステップを参照できます。既存の設定は引き続き使います。

| オプション | 注文運用コンソールでの用途 | 利用例 |
| --- | --- | --- |
| `http.trustedProxies / http.access` | 信頼できるプロキシを識別し、取引先レポートをサブネットで制限 | [取引先のリクエスト](#orders-console-access) |
| `http.rateLimit` | クライアントごとの回数制限を共有カウンターで実施 | [取引先とレート制限](#orders-console-access) |
| `auth` | 内部レポートのセッションと、利用者の権限を確認 | [認証と権限](#orders-console-auth) |
| `transport` | 同一オリジンの JSON 送受信に鍵交換を使う | [通信暗号化](#orders-console-transport) |
| `crypto` | ブラウザーの Cookie に注文一覧の表示設定を保存 | [表示設定 Cookie](../function/kit.ja.md#orders-console-cookie) |
| `logging / middleware / onError` | 運用画面の診断と安全なエラーレスポンス | [注文の診断](../function/kit.ja.md#orders-console-diagnostics) |
| `guards` | 注文承認ページにアプリのアクセス規則を追加 | [承認ガード](../function/kit.ja.md#orders-console-guards) |
| `cors` | 別オリジンにある画面からのブラウザーアクセスを許可 | [クロスオリジンの設定](../configuration/kit.ja.md#cors) |
| `contract` | 同じサイトからレポート、ファイル、イベントストリームの共通エンドポイントを提供 | [共有の契約](../function/kit.ja.md#kit-contract) |
| `a2a` | 取引先の自動処理から注文アシスタントへアクセス | [注文アシスタント](../function/kit.ja.md#kit-a2a) |
