# @h-ai/serv

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/ai](../ai/README.ja.md) · [@h-ai/api-contract](../api-contract/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md) · [@h-ai/iam](../iam/README.ja.md) · [@h-ai/storage](../storage/README.ja.md)

## 概要

hai-framework の API サービスランタイム。公開 HTTP App 抽象を通じて `@h-ai/api-contract` を複数プラットフォームから使える HTTP API として提供します。Hono は内部実装です。

## 主な機能

- `serv.createApp(...)` → `serv.listen(app, { port })` で起動。アプリは Hono を import する必要がありません。
- フラットな API：`serv.createApp / serv.implement / serv.listen / serv.toFetch / serv.generateSpec / ...`。
- procedure のチェーン：`implement().context().route().auth/permission/role().handle().build()`。
- 独自パイプライン：`createApp({ middlewares })` で HTTP middleware を接続し、context ファクトリーでリクエストごとの値を注入。
- 読み取り専用 Storage：`serv.storageAssets(...)` で安全な key、MIME 許可リスト、GET/HEAD、ETag、キャッシュヘッダーを管理。
- 既定の機能 procedures：`createIamProcedures()`、`createStorageProcedures()`、`createAiProcedures()`。
- `build()` は通常の router を同期的に返すため、標準 feature のネストした procedures を直接選択できます。接続する contract と procedures を一致させ、未選択の入口は公開しません。
- 存在しないルートは翻訳された HaiResult JSON と HTTP 404 を返します。通信暗号化でも 404 を保ち、非 JSON 応答による 500 にしません。
- 安全な応答ヘッダー・ヘルスチェックを内蔵し、OpenAPI JSON・Scalar 文書・内部 RPC endpoint は任意。
- 任意の通信暗号化：`serv.createApp({ transport: { crypto, serverKeyRing, keyStore } })` で鍵交換とリクエスト・レスポンスの暗号化を自動接続。
- 任意の音声入口：`serv.createApp({ audio: { ai, verifyTicket, authorize } })` が共通 WebSocket を接続します。接続直後に単回 ticket で認証（`{ session, grant? }`、独立した事前認証 timeout）。各フレームを Zod と厳密な状態機械で検証し、入力・キュー・送信バッファの背圧と連鎖キャンセルを管理します。サーバーの認可処理で操作・モデル・声・割当量・同時使用数を確認します。

> ライフサイクル：`@h-ai/serv` は状態を持たない HTTP App の構成機能で、`init()` / `close()` は不要です。app 作成前に `iam` / `storage` / `ai` / `crypto` などを初期化し、`serv.listen(..., { onClose })` で逆順に解放します。`serv.createApp()` は transport 管理器の生成失敗など起動設定のエラーを即座に throw します。

## 使い始める

### クイックスタート

```ts
import { apiContract } from '@h-ai/api-contract'
import { serv } from '@h-ai/serv'
import { createAiProcedures } from '@h-ai/serv/features/ai'
import { createIamProcedures } from '@h-ai/serv/features/iam'
import { createStorageProcedures } from '@h-ai/serv/features/storage'

// 1) 创建契约
const contract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

// 2) 组装 procedures（注入 iam / storage / ai 已初始化的 functions）
const procedures = {
  iam: createIamProcedures({ iam }),
  storage: createStorageProcedures({
    storage,
    authorize: ({ context, keys }) => keys.every(key =>
      key.startsWith(`users/${encodeURIComponent(context.session.userId)}/`)),
  }),
  ai: createAiProcedures({ ai }),
}

// 3) 创建 HTTP App
const app = serv.createApp({
  contract,
  procedures,
  http: {
    apiPrefix: '/api/v1',
    openapi: { path: '/openapi.json' },
    docs: { path: '/docs' },
  },
})

// 4) 启动 Node 服务（host/port 来自 _serv.yml 的 server；HOST/PORT 环境变量高于配置文件）
const { server } = core.config.getOrThrow<ServConfig>('serv')
serv.listen(app, {
  host: server.host,
  port: server.port,
  onListening: info => logger.info('API service listening', { port: info.port }),
  onClose: closeApp,
})

// 5) 优雅关闭由 serv 托管，无需手动注册 process.once('SIGINT', ...)
```

Storage procedures には `authorize({ context, operation, keys })` が必須で、未設定の場合はアクセスを拒否します。認証済み session から所有者・テナントを判定し、ダウンロード、アップロード、一覧、メタデータ、削除に適用します。上記の例は `users/<エンコードした userId>/` 配下だけを許可し、一覧にもその prefix が必要です。一括処理はすべての key が許可された後に実行し、管理者アクセスはアプリ側で明示的に許可します。

`storage.files.deleteMany` の成功データは `{ deletedKeys, failures: [] }` です。失敗進捗は `error.ext.deleteMany`（`failed / unknown / notAttempted`）にあり、HTTP 200 だけで完了と判断しません。[Storage の一括削除](../storage/README.ja.md#api-一覧)を参照してください。


AI procedures は省略された `objectId` を信頼できる `context.session.userId` に結び付けます。会話・メッセージの保存、履歴、会話一覧、記憶 recall/list は認可された主体で処理し、会話は `objectId + sessionId` で分離します。書き込み時の sessionId の既定値は `default` です。他の objectId へのアクセスは既定で拒否し、管理者も信頼できる権限とテナント関係を検証する明示的な `authorizeObject` ポリシーが必要です。

`chats.createCompletion`（`POST /ai/chats/completions`）は非ストリーミングの `HaiResult<AiChatCompletionData>` を一度返します。function `tools` のネストした JSON Schema と `strict`、`tool_choice`（`auto` / `none` / `required` / 提供した関数名）をモデルへ渡し、役割、`name`、ユーザー画像、ツール呼び出しを保持します。ツール結果には `role: 'tool'` と空でない `tool_call_id` が必須で、指定名は今回のツール定義に含まれる必要があります。procedure はツールを実行しません。アプリ側で認可・実行後、助手の `tool_calls` と対応する結果を送信します。入力に `stream` はなく、`true` / `false` とも Provider 呼び出し前に HTTP 400 で拒否します。ストリーミングには `ai.llm.chatStream()` と対応する出力型を使う専用 endpoint を定義します。

#### host / port 設定

host/port は `config/_serv.yml` の `server` で指定し、`HOST` / `PORT` 環境変数 > 設定ファイル > `127.0.0.1:3000` の順です。既定の `127.0.0.1` はローカル専用で、コンテナー外に公開する場合は `0.0.0.0` にします：

```yaml
# config/_serv.yml
server:
  host: 127.0.0.1
  port: 3000
```

解決済みの `server` を `serv.listen` に渡します。`host` / `port` の明示的な指定で上書きすることもできます。

#### Fetch Runtime（Workers / Bun / Deno）

```ts
const handler = serv.toFetch(app)
export default { fetch: handler }
```

Node `serv.listen()` は socket の接続元を自動で渡し、既定では転送ヘッダーを無視します。`http.trustedProxies` の IP/CIDR のみ信頼し、XFF を右から左へ調べ、最初の非信頼アドレスで停止します。その左側は無視します。信頼チェーンが不正・長すぎる場合は IP 未定義となり、代理をクライアントとして扱いません。代理は転送ヘッダーを清掃・追加してください。Fetch は `app.fetch(request, { remoteAddress: platformPeerAddress })` で信頼できる接続元を渡します。メタデータなしは IP 未定義です。任意のヘッダーをコピーしないでください。独自 `createContext(input)` は input 全体を再利用し、解決済み `input.ip` を保持します。内部 RPC は接続元で制限します。

#### Audio WebSocket：ticket とサーバー認可

音声接続には短期・単回 ticket が必要です。認証済み HTTP endpoint で発行（推奨：`iam.ticket.issue`）し、`verifyTicket` でアトミックに消費します（推奨：`iam.ticket.consume`）。接続直後に独立 timeout で認証し、認証前に業務フレームを処理しません。返された `ServSession` と任意の `grant` を保存してから `authorize` で有料パラメーターを確認します：

```ts
const app = serv.createApp({
  contract,
  procedures,
  iam,
  audio: {
    ai,
    verifyTicket: consumeAudioTicket, // → HaiResult<{ session, grant? }>
    authorize: async (session, request, grant) => authorizeAudioRequest(session, request, grant),
    onSessionEnd: async (session, request) => releaseAudioConcurrency(session.userId, request.operation),
  },
})
```

- `verifyTicket(ticket)` は用途・期限を確認し、1 回のみ成功させ、`HaiResult<AudioTicketVerification>`（`{ session, grant? }`）を返します。`grant` は ticket に固定した操作・モデル・セッションを保持。
- `authorize(session, request, grant)` で IAM 権限、モデル・声の許可リスト、Persona、割当量、同時実行枠を確認し、`grant` と `start` の整合性を検証します。返された `AuthorizedAudioRequest` のみを `ai.audio` に渡します。
- `authorize` がなければクライアントの `model`・`voice`・`instruction` は無視し、サーバー既定値（または `grant.model`）を使用します。`grant.operation` と異なる `start` は拒否。
- 各フレームを Zod と厳密な状態機械で検証します。認識は音声、合成はテキストのみ、`start`/`done` は各 1 回、`segmentId` はセッション内で一意です。入力・滞留メッセージ・送信バッファを制限し、超過・キャンセル時はドメインエラーで閉じて上流も中止します。
- 調整項目：`preAuthTimeoutMs`（既定 5000）、`maxPendingMessages`（256）、`maxSendBufferBytes`（8 MiB）、`maxMessageBytes` / `maxBufferedBytes` / `maxTextBytes` / `maxSessionMs`。
- `onSessionEnd` は成功・失敗・切断後に最大 1 回呼び、同時実行枠の解放に使用。
- ブラウザーの `createAIClient({ audio: { url, getTicket } })` は単回 `ticket` のみを URL に付けます。`getTicket(request)` は `operation` / `model` の概要から今回の操作専用 ticket を発行できます。通常の IAM access token は渡さないでください。

#### 通信暗号化（`@h-ai/crypto` と共通）

serv 独自の暗号化ファクトリーはなく、`crypto.transport` から管理器を作成します。利用側はトップレベルの `crypto` のみを渡します：

```ts
import { cache } from '@h-ai/cache'
import { createRedisTransportKeyStore, crypto, parseTransportServerKeyRing } from '@h-ai/crypto'
import { serv } from '@h-ai/serv'

await crypto.init()
const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
if (!ring.success)
  throw new Error(ring.error.message)
const serverKeyRing = ring.data
await cache.init({ type: 'redis', host: '127.0.0.1', port: 6379 })

const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
  transport: {
    crypto,
    serverKeyRing,
    // keyExchangePath 默认 '/_hai/key-exchange'，最终端点为 '/api/v1/_hai/key-exchange'
    // excludePaths: ['/health'],
    keyStore: createRedisTransportKeyStore({ cache, ttlSeconds: 3600 }),
  },
})
```

クライアントは `@h-ai/api-client` を使います：

```ts
import { apiClient } from '@h-ai/api-client'

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  transport: { crypto },
})
```

`@h-ai/core` で `config/_serv.yml` と `ServConfigSchema` を使う場合、transport もまとめて設定できます：

```yaml
# config/_serv.yml
http:
  trustedProxies: []
  apiPrefix: /api/v1

transport:
  keyExchangePath: /_hai/key-exchange
  excludePaths:
    - /health
    - /ready
    - /openapi.json
    - /docs
    - /_hai/scalar.js
```

```ts
const servConfig = core.config.getOrThrow<import('@h-ai/serv').ServConfig>('serv')

const app = serv.createApp({
  contract,
  procedures,
  http: servConfig.http,
  middlewares: [{
    middleware: serv.cors({
      origin: servConfig.cors.origin,
      credentials: servConfig.cors.credentials,
      allowedHeaders: [...servConfig.cors.allowedHeaders],
      exposedHeaders: [...servConfig.cors.exposedHeaders],
    }),
  }],
  transport: servConfig.transport === false
    ? undefined
    : {
        crypto,
        serverKeyRing,
        keyStore,
        keyExchangePath: servConfig.transport.keyExchangePath,
        excludePaths: [...servConfig.transport.excludePaths],
      },
})
```

> サーバーには同じ管理済み `serverKeyRing` と共有 `keyStore`（Redis または共有 DB）を明示的に渡します。クライアント公開鍵の共有だけではノード間で復号できません。暗黙のプロセス鍵・メモリー registry はなく、開発・テストでは `createInMemoryKeyStore(capacity)` を明示します。再起動後は同じ鍵環を読み込み、sticky session は不要です。

> **安全方針**：`transport` 有効時は `excludePaths` と鍵交換以外で有効な `X-Client-Id` が必要です。不足・未知の clientId は 400、暗号化不能・非 JSON 応答・上限超過はエラーになり、平文の業務データは渡しません。

認証済み v2 のみを受け付けます。独立したランダム SM4-CBC 鍵と HMAC-SM3 鍵を SM2 で包み、送信者署名、MAC の順に検証してから CBC を復号します。要求はクライアント秘密鍵、応答は選択されたサーバー鍵バージョンで署名します。version、direction、serverKeyId、clientId、nonce を兼ねるランダム 128 ビット requestId、issuedAt、HTTP method、pathname と元の search の SM3 pathHash、応答 status を認証します。要求の有効期限は 5 分、未来方向の時計差は最大 30 秒です。共有 registry が (clientId, requestId) を原子的に消費し、ノード間の時計差を含め issuedAt + 6 分まで保持します。保存障害では拒否します。時計同期と Redis の noeviction/永続化により有効な nonce を保持してください。業務の再試行には別の冪等キーが必要です。

空の POST も空平文の認証封装を送ります。GET/HEAD は X-Hai-Transport ヘッダー、204/304/HEAD など本文なし応答も同じヘッダーを使います。他の要求・応答は JSON 本文と X-Encrypted: true を使います。クライアントは元の要求コンテキストと HTTP status を照合し、マーカー欠落、旧形式、認証失敗では reject します。平文 endpoint は excludePaths で明示的に除外し、CORS では X-Hai-Transport を許可・公開してください。鍵交換の公開鍵認証は TLS に依存し、IAM の業務認可は別に必要です。

固定上限は `@h-ai/crypto` の `TRANSPORT_BODY_LIMITS` を共有し、鍵交換 JSON は 16 KiB、公開鍵は 1 個あたり 4 KiB、平文は 1 MiB、暗号文 JSON は 2 MiB + 32 KiB です。実際の UTF-8 バイトを元のストリームから逐次読み取り、超過・キャンセル時は停止・キャンセルして reader を解放します。clone して全量を読み取る処理は行いません。リクエスト超過は 413、応答超過は 500、不正な公開鍵は 400 です。再構築したリクエストは signal を維持して Hono の本文キャッシュを消去し、リクエスト・応答の古い Content-Length/Content-Encoding を削除します。上限はプロトコル定数であり、YAML・環境変数では設定しません。

#### Token 認証（`iam` / `refreshCookie`）

`serv.createApp` にトップレベルの `iam` を渡すと、次を自動構成します：

- **access token 検証**：各リクエストで `iam.auth.verifyToken` を呼び `context.session` を設定（キャッシュなし）。
- **refresh token の更新**：`refreshCookie` 有効時、`iam.session.refresh` を httpOnly cookie 更新処理に使用。

**context の優先順位**：明示的 `createContext` > `verifyToken` > `iam.auth.verifyToken` > メタデータのみの既定解析。

```ts
// 推荐：传入 iam，一行打开认证与 Cookie 刷新
const app = serv.createApp({
  contract,
  procedures,
  iam,
  refreshCookie: {}, // 可选：启用 httpOnly cookie 刷新路径
})

// 逃脱口 1：不使用 @h-ai/iam，自定义 verifyToken
const app = serv.createApp({
  contract,
  procedures,
  verifyToken: token => myAuthService.verify(token),
})

// 逃脱口 2（高级）：多租户等额外字段 — 完全接管上下文构造
const app = serv.createApp({
  contract,
  procedures,
  createContext: async ({ request }) => {
    const base = serv.parseRequestContext({ request })
    // 手动填充 session（serv 不再自动填充）
    const result = await iam.auth.verifyToken(base.accessToken ?? '')
    return {
      ...base,
      session: result.success ? result.data : undefined,
      tenantId: request.headers.get('x-tenant') ?? null,
    }
  },
})
```

#### 独自 procedure（認証 + 権限）

```ts
const procedures = serv
  .implement(myContract)
  .context<ServContext>()
  .route('users.update')
  .permission('users.write')
  .handle(async ({ input, context }) => {
    return await userService.update(input.id, input)
  })
  .build()
```

#### 高度なパイプライン（HTTP middleware + context + route guard）

`@h-ai/serv` のパイプラインは 3 層で、それぞれの拡張入口があります：

1. **HTTP middleware 層**：`serv.createApp({ middlewares })` で注入。
2. **context 層**：`verifyToken` / `createContext` / `serv.buildAuthContextFactory()` で拡張。
3. **route guard 層**：`.auth()` / `.permission()` / `.role()` で認証・認可を宣言。

##### 1) 独自 HTTP middleware

ログ・trace・レート制限・CORS・テナントヘッダーなどの **HTTP 共通処理**、または JSON/oRPC contract に適さない WebSocket・ファイル・バイナリー endpoint には `middlewares` を使います。一般的な CORS は `serv.cors(...)` を再利用できます：

```ts
import type { ServMiddleware } from '@h-ai/serv'
import { serv } from '@h-ai/serv'

const requestMetrics: ServMiddleware = async (c, next) => {
  const startedAt = Date.now()
  await next()
  c.header('x-response-time-ms', String(Date.now() - startedAt))
}

const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
  middlewares: [
    {
      middleware: serv.cors({
        origin: origin => origin === 'https://app.example.com',
        credentials: true,
        exposedHeaders: ['X-Encrypted', 'X-Request-Id'],
      }),
    },
    { middleware: requestMetrics }, // 默认挂到 '*'
    {
      path: '/api/v1/*',
      middleware: async (c, next) => {
        if (!c.req.header('x-tenant-id'))
          return c.text('Missing x-tenant-id', 400)
        await next()
      },
    },
    {
      path: '/assets/*',
      middleware: serv.storageAssets({
        storage,
        pathPrefix: '/assets/',
        keyPattern: /^public\/[\w-]+\.png$/,
        allowedContentTypes: ['image/png'],
        cacheControl: 'public, max-age=31536000, immutable',
        crossOriginResourcePolicy: 'cross-origin',
      }),
    },
  ],
})
```

実行順は固定です：

1. 組み込み `securityHeaders`。
2. 独自の `middlewares`。
3. 組み込み `transport`（有効時）。
4. health / refresh-cookie / OpenAPI / RPC / docs / oRPC routes

補足：

- `middlewares` は配列順に登録。
- `path` 省略時は `'*'`。
- middleware は transport より先なので、CORS preflight・バイナリー endpoint は途中で応答できます。安全ヘッダーは残りますが transport は通りません。
- 公開読み取り専用ファイルは `serv.storageAssets(...)` を優先。key/MIME 許可リスト・キャッシュ・CORS はアプリが指定し、アバターなどの業務概念は内蔵しません。
- 非公開リソース・Range ダウンロード・動的認可は独自 middleware/procedure を使い、公開 helper は使いません。
- 復号済みの業務 body を読む場合は context / procedure 層を拡張。
- ブラウザーが `X-Encrypted` などを読む場合は `serv.cors({ exposedHeaders: [...] })` で明示的に公開。
- この層は HTTP middleware context を操作し、`HaiResult` ではなく **HTTP Response** を返します。

##### 2) 独自 context パイプライン

`Bearer token -> session` を再利用し、テナント・workspace・送信元などの項目を追加する場合は、
`serv.buildAuthContextFactory()` で独自の `createContext` を構成してください：

```ts
const baseContext = serv.buildAuthContextFactory(token => iam.auth.verifyToken(token))

const app = serv.createApp({
  contract,
  procedures,
  createContext: async (input) => {
    const context = await baseContext(input)
    return {
      ...context,
      tenantId: input.request.headers.get('x-tenant-id') ?? null,
    }
  },
})
```

拡張方法の選び方：

- Token 検証のみを変更：`verifyToken`。
- 既定の認証 context に項目を追加：`buildAuthContextFactory(...) + createContext`。
- context 生成全体を置換：直接 `createContext`。

##### 3) Route guard

公開 procedure は `.route(path, handler)` を使い、ガードが必要な場合は次を使います：
`.route(path).auth/permission/role().handle(handler)`：

```ts
const procedures = serv
  .implement(widgetContract)
  .context<ServContext>()
  .route('widgets.list', ({ input }) => widgetService.list(input))
  .route('widgets.create')
  .permission('widgets.write')
  .role('editor')
  .handle(({ input, context }) => {
    // guard 通过后 session 在类型上已是非空，不需要 `!`。
    return widgetService.create(context.session.userId, input)
  })
  .build()
```

制約：

- `.permission()` と `.role()` は認証も要求します。失敗時の HaiResult の `error.httpStatus` は未認証で 401、権限不足で 403 ですが、通常の procedure の HTTP 応答は既定で 200 です。
- 同じルートの複数 permission/role はすべて満たす必要があります。`serv.WILDCARD_PERMISSION` / `serv.WILDCARD_ROLE` は各分類を許可。
- 未処理の handler 例外は INTERNAL_ERROR の HaiResult に変換。予期する業務失敗は直接 `err(...)` を返します。
- path・input・output は contract から推論。重複・未知のパスを拒否し、完全に実装するまで `.build()` は呼べません。

公開 API の境界：

- `src/pipelines/*` は内部の既定実装で、公開サブパス API ではありません。
- アプリ向けの安定した入口はルートの `@h-ai/serv`。
- `securityHeaders` / `requireInternalRPC` / `buildHaiErrorBody` などの内部 helper は独立サブパスとして公開しません。

#### httpOnly Cookie 認証（本番推奨）

httpOnly cookie モードは refresh token をサーバー管理の Cookie に保存し、ブラウザー JS から読めなくして XSS による漏洩を抑えます。

2 種類の Token の役割：

- `accessToken`：短期認証情報。クライアントのメモリーに保持し、`Authorization: Bearer <token>` で送信。
  `serv.parseRequestContext()` / `extractBearerToken()` が読み取り、`buildAuthContextFactory()` が検証します。
- `refreshToken`：長期認証情報。`refreshCookie` 有効時は JS に公開せず、httpOnly cookie にのみ保存。
  `extractBearerToken()` はこれを**読みません**。サーバーの `/auth/refresh` のみが読み、新しい access token を発行します。
  信頼されたネイティブクライアントは `nativeTokenTransport` で JSON body を使用でき、クライアント識別と Origin の両方を検証します。

**処理の流れ：**

1. ブラウザーログイン：サーバーが `Set-Cookie: hai_refresh_token=...;HttpOnly` を設定し、JSON から `refreshToken` を除去。
2. access token をクライアントのメモリーに保持し、永続化しません。
3. access token の期限切れで、ブラウザーが Cookie 付きで `/auth/refresh` を呼びます。
4. サーバーが Cookie を読み `onRefresh` を呼び、新 access token と更新 Cookie を返します。本文に refresh token は公開しません。

`nativeTokenTransport.isRequest` に一致するネイティブクライアントでは、ログイン・登録・更新の応答に更新後の
`refreshToken` を残します。更新リクエストは body の `{ refreshToken }` を読み、全体でブラウザー Cookie を使いません。

**サーバー設定：**

```ts
// 服务端：api-service/src/app.ts
const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
  iam, // 顶层 iam 同时驱动 verifyToken 与 refresh
  refreshCookie: {
    // cookieName: 'hai_refresh_token', // 默认
    // maxAge: 30 * 24 * 3600,          // 默认 30 天
    // secure: true,                    // 默认在 NODE_ENV=production 时开启
    // onRefresh: customFn,             // 可覆盖 iam.session.refresh。
    nativeTokenTransport: {
      // 必须 fail-closed：同时校验平台标识与允许的原生 Origin。
      isRequest: request =>
        request.headers.get('x-client-platform') === 'capacitor'
        && security.isNativeOrigin(request.headers.get('origin') ?? ''),
    },
  },
  // ✅ 无需再传 verifyToken，iam.auth.verifyToken 自动用于填充 context.session
})
```

**クライアント設定（`@h-ai/api-client` と連携）：**

```ts
// 默认存储即 httpOnly cookie，refreshPath 默认 /auth/refresh，无需额外配置。
await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
})
```

> **Cookie 属性**：本番は `HttpOnly; SameSite=Strict; Secure`。`Path` は `{apiPrefix}/auth/refresh` に限定。

### API 一覧

- `serv.createApp(options)`：独自 middleware、ヘルスチェック、OpenAPI、任意の文書・RPC を備えた HTTP App を作成。
- `serv.parseRequestContext({ request })`：Bearer token + requestId を抽出し、session は設定しません。
- `serv.listen(app, options)`：Node.js HTTP サービスを起動し、`{ server, address, close }` を返す。
- `serv.toFetch(app)`：標準の `fetch(Request)` handler に変換。
- `serv.generateSpec(contract, options)`：contract から OpenAPI 3.1 spec を生成。
- `serv.storageAssets(config)`：key/MIME 許可リスト、GET/HEAD、ETag 付きの読み取り専用 Storage middleware。
- `serv.implement(contract)`：チェーン形式の contract 実装器を作成。
- `.context<ServContext>()`：procedure のリクエスト context を宣言。
- `.route(path, handler)`：公開 procedure を登録。
- `.route(path).auth/permission/role().handle(handler)`：認証・認可付き procedure を登録。
- `.build()`：全 contract procedure の実装後に router を構築。
- `serv.validateInputOrFail(zodSchema, input, locale)`：procedure 内の追加 Zod 検証。失敗時はローカライズ済み `HaiResult` + `ValidationFormError[]`。
- `serv.resolveRequestLocale(headers)`：`x-hai-locale` / `Accept-Language` から locale を取得・正規化。
- `serv.m(key, options)`：本モジュールのメッセージを読み、`options.locale` で呼び出しごとにローカライズ。

その他のルート型・名前付きエクスポート：

- `ServConfigSchema`：`core.config.validate('serv', ServConfigSchema)` で `config/_serv.yml` を検証。
- HTTP App 抽象：`serv.createApp()` は公開 `fetch/request` 機能を持つオブジェクトを返し、内部の Hono 使用はアプリに影響しません。
- `ServMiddlewareMount`：`createApp({ middlewares })` の要素型（`{ path?, middleware }`）。
- `ServMiddleware` / `ServProcedureHandler`：独自パイプライン用の共通型。
- `NativeRefreshTokenTransportConfig` / `ServStorageAssetsConfig`：ネイティブ Token 経路・読み取り専用リソース設定。

> 通信暗号化は `createApp` の設定機能で、内部で `crypto.transport` に委譲します。`serv.xxx` の独立 API ではありません。

### 設定

`@h-ai/serv` 自体は YAML を走査しません。`@h-ai/core` で `config/_serv.yml` を読み、解析結果を `serv.createApp()` に渡してください。

```ts
import { core } from '@h-ai/core'
import { serv, ServConfigSchema } from '@h-ai/serv'

core.init({ configDir: './config' })

const validation = core.config.validate('serv', ServConfigSchema)
if (!validation.success)
  throw new Error(validation.error.message)

const servConfig = core.config.getOrThrow<import('@h-ai/serv').ServConfig>('serv')

const app = serv.createApp({
  contract,
  procedures,
  http: servConfig.http,
  transport: servConfig.transport === false
    ? undefined
    : {
        crypto,
        serverKeyRing,
        keyStore,
        keyExchangePath: servConfig.transport.keyExchangePath,
        excludePaths: [...servConfig.transport.excludePaths],
      },
})
```

`config/_serv.yml` の例：

```yaml
server:
  host: 127.0.0.1
  port: 3000

http:
  trustedProxies: []
  apiPrefix: /api/v1
  openapi:
    path: /openapi.json
  docs:
    path: /docs
  health:
    path: /health
    readyPath: /ready
  rpc: false

cors:
  origin: https://app.example.com
  nativeOrigins: capacitor://app.example.local,tauri://app.example.local
  credentials: true
  allowedHeaders:
    - Authorization
    - Content-Type
    - X-Client-Id
  exposedHeaders:
    - X-Encrypted

transport:
  keyExchangePath: /_hai/key-exchange
  excludePaths:
    - /health
    - /ready
    - /openapi.json
    - /docs
    - /_hai/scalar.js
```

`server`（host/port）：`HOST` / `PORT` 環境変数 > 設定ファイル > `127.0.0.1:3000`。アプリが `servConfig.server` を `serv.listen` に渡します。

`ServHttpConfigInput`：

- `apiPrefix`：既定 `/api/v1`。
- `health`：既定 `{ path: '/health', readyPath: '/ready' }`。
- `openapi`：既定 `false`。`{ path: '/openapi.json' }` で有効化。
- `docs`：既定 `false`。`{ path: '/docs' }` で有効化（`openapi` が必要）。`@scalar/api-reference` の browser bundle から `/_hai/scalar.js` を提供し、外部 CDN なしで Scalar UI を使えます。
- `rpc`：既定 `false`。`{ prefix: '/rpc', access: 'loopback' | 'private-network' | 'gateway-only', gatewayHeader?, gatewaySecret? }` で有効化。
- `cors`：origin・credentials・allowedHeaders・exposedHeaders を設定し、`serv.cors(...)` で接続。
- `transport`：`config/_serv.yml` のトップレベル設定。`servConfig.transport` を `createApp({ transport })` に渡し、既定の鍵交換サブパスは `/_hai/key-exchange`。

本番では `serv.createRuntimeSecurityPolicy(...)` で CORS・Cookie・文書の公開方針を制限してください：

```ts
const security = serv.createRuntimeSecurityPolicy({
  environment: coreConfig.env,
  corsOrigin: servConfig.cors.origin,
  nativeOrigins: servConfig.cors.nativeOrigins,
})

const app = serv.createApp({
  contract,
  procedures,
  http: {
    ...servConfig.http,
    openapi: security.exposeApiDocs ? servConfig.http.openapi : false,
    docs: security.exposeApiDocs ? servConfig.http.docs : false,
  },
  refreshCookie: { secure: security.secureRefreshCookie },
  middlewares: [{
    middleware: serv.cors({
      origin: security.allowOrigin,
      credentials: servConfig.cors.credentials,
      allowedHeaders: [...servConfig.cors.allowedHeaders],
      exposedHeaders: [...servConfig.cors.exposedHeaders],
    }),
  }],
})
```

本番では `_serv.yml` の `cors.origin` が空・`*` なら起動に失敗します。Web・Capacitor/Tauri は正規化済み Origin 全体を厳密照合し、末尾偽装を防ぎます。本番は Secure refresh cookie を強制し OpenAPI/docs を無効化します。非本番の endpoint は設定ファイルで決めます。

### 設定による認証画面

規約は設定の userAgreementMarkdown/privacyPolicyMarkdown または URL を使用できます。同じ規約は Markdown 本文を優先して安全な Modal で描画します。

createIamProcedures({ iam }) は公開設定、LDAP/OTP/パスワード、登録、復旧を直接実装します。LDAP も既存の Cookie/ネイティブ Token 方針を使用し、自助登録が無効でも管理者のユーザー作成は権限検証の下で利用できます。

[完整 IAM 配置 / IAM configuration](../iam/README.ja.md)

### エラー処理

通常の procedure は認証・認可・業務の失敗と捕捉した handler 例外を HaiResult として既定で HTTP 200 で返します。`error.httpStatus` はドメインエラーのメタデータで、HTTP 応答ステータスを変更しません。クライアントは `success` と `error.code` を確認してください。未認証では `error.httpStatus=401`、DB クエリー失敗や INTERNAL_ERROR では 500 です。

oRPC contract の入力検証は procedure の前に失敗すると HTTP 400 となり、ローカライズ済み body に `error.httpStatus=400` とフィールドエラーを含みます。procedure 内の `serv.validateInputOrFail` の失敗は HTTP 200 のままです。HTTP middleware、refresh-cookie、OpenAPI/RPC のアクセス確認、transport のプロトコルエラーは各自の HTTP 応答契約に従います。api-client は実際の HTTP 401、または HTTP 200 の有効な失敗 HaiResult（`success=false`、文字列の `error.code/message`、`error.httpStatus=401`）で自動更新し、成功後に一度だけ再試行します。組み込みのログイン・登録と設定された更新パスは対象外で、403/500 でも更新しません。transport 有効時は更新と再試行も同じ暗号化 fetch を使用します。

- 既定 procedures はすべて `HaiResult<T>` を返し、クライアントで `result.success` を確認。
- 認証失敗 → `HaiCommonError.UNAUTHORIZED`。`.auth()` が `context.locale` でローカライズ。
- 認可失敗 → `HaiCommonError.FORBIDDEN`。`.permission()` / `.role()` が `context.locale` でローカライズ。
- 未捕捉例外 → `HaiCommonError.INTERNAL_ERROR`。route 実装器が処理して `context.locale` でローカライズ。

通常の業務リクエストは 3 層で処理します：

1. **oRPC contract 入力検証**：procedure 前に実行。`serv.createApp()` が Zod の既定英語エラーを捕捉し、ローカライズ済み `errors[]` に変換。
2. **procedure 内の追加検証**：DB から読む値・複数フィールド制約など Zod で表せる規則は `serv.validateInputOrFail(zodSchema, input, context.locale)` を使います。単純な業務規則は `err(...)` を返し、統一のためだけの Schema は不要です。
3. **業務・ドメインエラー**：予期する失敗は throw せず `err(...)` を返します。**メッセージの生成層**で `serv.m(..., { locale: context.locale })` や `widgetM(..., { locale: context.locale })` など対応モジュールの getter を使います。

```ts
import { err, HaiCommonError } from '@h-ai/core'
import { serv } from '@h-ai/serv'
import { z } from 'zod'

const CreateWidgetSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(3),
})

const procedures = serv
  .implement(widgetContract)
  .context<ServContext>()
  .route('widgets.create')
  .permission('widgets.write')
  .handle(({ input, context }) => {
    const validated = serv.validateInputOrFail(CreateWidgetSchema, input, context.locale)
    if (!validated.success)
      return validated

    if (validated.data.slug === 'admin') {
      return err(
        HaiCommonError.FORBIDDEN,
        serv.m('serv_errorForbidden', { locale: context.locale }),
      )
    }

    return widgetService.create(validated.data)
  })
  .build()
```

> `iam.user.xxx()` など下流が直接 `HaiResult` を返す場合、serv は `error.message` をそのまま渡します。`HaiError` は最終 `message` のみで `messageKey/params` を持たないため、**serv の境界で任意の下流エラーを汎用的に再翻訳することはできません**。リクエストごとの i18n はエラーを生成するモジュールで locale を受け取る必要があります。


### リクエスト言語の分離

Node リクエストと SSR は `core.i18n.runWithLocale(locale, () => handleRequest())` で囲みます。SvelteKit は `kit.i18n.runWithLocale(locale, () => resolve(event))` を使えます。serv はリクエストヘッダーから自動設定します。非同期の子処理も言語を継承し、明示的な `MessageOptions.locale`、リクエスト言語、起動時の既定値の順で優先します。コンテキスト内の `setGlobalLocale` はそのリクエストだけを変更します。コンテキスト外の設定は起動時に限定し、リクエスト hook から呼びません。

ブラウザーはアプリ全体の `setGlobalLocale` / `createLocaleStore` を使います。SSR の UI store 初期化と setter は自身の状態のみ変更し、メッセージはリクエストコンテキストを参照します。`runWithLocale` は Node 入口専用です。

## 開発とテスト

```bash
pnpm --filter @h-ai/serv test
pnpm --filter @h-ai/serv typecheck
pnpm --filter @h-ai/serv lint
```

## ライセンス

Apache-2.0
