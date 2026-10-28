# @h-ai/serv

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/ai](../ai/README.md) · [@h-ai/api-contract](../api-contract/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md) · [@h-ai/iam](../iam/README.md) · [@h-ai/storage](../storage/README.md)

## 简介

hai-framework 的 API 服务运行时：对外暴露稳定的 HTTP App 抽象，把 `@h-ai/api-contract` 契约挂载为跨端可访问的 HTTP API；Hono 仅作为内部运行时实现。

## 核心功能清单

- 一行启动：`serv.createApp(...)` → `serv.listen(app, { port })`，应用代码不需要 import Hono
- 扁平 API（最小知识）：`serv.createApp / serv.implement / serv.listen / serv.toFetch / serv.generateSpec / ...`
- 链式 procedure：`implement().context().route().auth/permission/role().handle().build()`
- 自定义 pipeline：`createApp({ middlewares })` 挂 HTTP middleware；请求级字段通过 context 工厂注入
- 只读 Storage 资源：`serv.storageAssets(...)` 统一处理安全 key、MIME 白名单、GET/HEAD、ETag 与缓存头
- 默认 feature procedures：`createIamProcedures()`、`createStorageProcedures()`、`createAiProcedures()`
- `build()` 同步返回普通 router，可按嵌套属性选取默认 feature procedures；挂载的 contract 与所选 procedures 保持一致，未选入口不开放。
- 缺失路由返回本地化的 HaiResult JSON 404，启用传输加密后保留 404，不误报为非 JSON 响应导致的 500。
- 内置安全响应头、健康检查、可选 OpenAPI JSON、可选 Scalar 文档页、可选内部 RPC endpoint
- 可选传输加密：`serv.createApp({ transport: { crypto, serverKeyRing, keyStore } })` 自动挂载密钥协商与请求/响应加解密
- 可选语音入口：`serv.createApp({ audio: { ai, verifyTicket, authorize } })` 挂载统一语音 WebSocket；连接建立即用一次性 ticket 鉴权（返回 `{ session, grant? }`，独立预鉴权超时），每帧运行时 Zod 校验 + 严格状态机，输入/积压/发送缓冲背压与级联取消；授权回调负责服务端确认操作、模型、音色、配额与并发占用

> 生命周期说明：`@h-ai/serv` 本身是无状态 HTTP App 装配器，不需要 `init()` / `close()`；请在创建 app 前初始化 `iam` / `storage` / `ai` / `crypto` 等依赖，并在 `serv.listen(..., { onClose })` 中反向释放它们。`serv.createApp()` 遇到启动期配置错误（例如 transport manager 创建失败）会 fail-fast 抛出，便于进程启动阶段暴露问题。 onClose 是 SIGINT/SIGTERM 的关闭回调；主动调用返回句柄的 close 仅关闭 HTTP，业务模块由宿主另行反序释放。

## 使用入门

### 快速开始

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

Storage 默认 procedures 必须注入 `authorize({ context, operation, keys })`；未提供策略时默认拒绝。策略从已认证 session 确定资源范围，并覆盖下载、上传、列表、元数据和删除。上例只允许 `users/<编码后的 userId>/` 下的 key，列表同样必须携带该用户前缀；批量中任何一个 key 未获授权时全部不执行。管理员访问须由应用显式授权。

批量删除 `storage.files.deleteMany` 成功时返回 `{ deletedKeys, failures: [] }`；失败进度位于 `error.ext.deleteMany`（`failed / unknown / notAttempted`），不能只根据 HTTP 200 判断完成。详见 [Storage 批量删除](../storage/README.md#api-概览)。

AI 默认 procedures 从可信 `context.session.userId` 绑定 `objectId`，客户端可省略该字段。聊天与消息写入、历史、会话列表和记忆 recall/list 均使用该主体；会话按 `objectId + sessionId` 隔离，写入未指定 sessionId 时使用 `default`。传入其它 objectId 默认返回 FORBIDDEN，管理员跨主体访问也必须显式传入 `authorizeObject` 并根据可信权限及租户关系授权。

`chats.createCompletion`（`POST /ai/chats/completions`）只返回一次非流式 `HaiResult<AiChatCompletionData>`。完整 function `tools`（含嵌套 JSON Schema、`strict`）和 `tool_choice`（`auto` / `none` / `required` / 指定名称）传递到模型；消息保留角色、`name`、用户图片和工具调用。工具结果必须使用 `role: 'tool'` 与非空 `tool_call_id`，指定工具选择须引用本次提供的工具。默认 procedure 不自动执行工具，应用授权并执行后，将助手的 `tool_calls` 与对应工具结果一并回传。输入不提供 `stream` 字段，传入 `true` 或 `false` 均在 HTTP 边界返回 400；需要流式时由应用使用 `ai.llm.chatStream()` 定义匹配流输出的独立 endpoint。

#### host / port 配置

host/port 统一由 `config/_serv.yml` 的 `server` 提供，优先级：`HOST` / `PORT` 环境变量 > 配置文件 > 默认 `127.0.0.1:3000`。默认 `127.0.0.1` 仅本机可达，容器对外暴露时改为 `0.0.0.0`：

```yaml
# config/_serv.yml
server:
  host: 127.0.0.1
  port: 3000
```

应用把解析后的 `server` 传给 `serv.listen`（`serv.listen` 也可直接传 `host` / `port` 显式覆盖）。

#### 标准 fetch 签名适配

toFetch 提供标准 fetch 调用签名，适合 Node 兼容宿主与测试注入；包根仍依赖 Node API，不能据此承诺无需 Node 能力的 Workers/Deno/边缘部署。

```ts
const handler = serv.toFetch(app)
export default { fetch: handler }
```

Node `serv.listen()` 自动提供 socket 对端地址；默认忽略 `X-Forwarded-For` / `X-Real-IP`。只有 `http.trustedProxies` 中列出的代理 IP/CIDR 才能提供转发头，XFF 从右向左停在首个不可信地址，忽略其左侧内容；可信链无法解析或过长时 IP 为 undefined，不能回退为代理身份。代理必须清洗或追加转发头。Fetch 平台通过 `app.fetch(request, { remoteAddress: platformPeerAddress })` 显式提供可信对端，缺失时 IP 为 undefined，不能从任意请求头复制。自定义 `createContext(input)` 复用完整 input，保留框架已解析的 `input.ip`。内部 RPC 仍按连接对端限制。

toFetch 对 Request、URL、字符串统一调用标准 Request(input, init)，RequestInit 可覆盖 method、headers、body、signal 等字段；不修改原 Request 的字段，正文已消费/锁定或非法正文组合会以 Promise 拒绝。预取消和派发前取消不进入 handler，进行中取消结束调用方等待并把有效 signal 传给应用；监听器在完成/失败/取消后释放，取消后的迟到响应会取消未消费正文。取消不能回滚已经开始的外部副作用；Response 交付后的流由应用监听 request.signal 并自行关闭。

#### Audio WebSocket：ticket 与服务端授权

语音入口必须使用短期、一次性 ticket。应用通过已登录 HTTP endpoint 签发 ticket（推荐 `iam.ticket.issue`），并在 `verifyTicket` 中原子消费（推荐 `iam.ticket.consume`）；连接建立即完成鉴权（独立预鉴权超时），未鉴权不处理任何业务帧。框架保存返回的 `ServSession` 与可选 `grant`，再调用 `authorize` 确认付费参数：

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

- `verifyTicket(ticket)` 必须校验用途、过期时间并保证同一 ticket 只能成功一次，返回 `HaiResult<AudioTicketVerification>`（`{ session, grant? }`）；`grant` 承载票据绑定的操作/模型/会话。
- `authorize(session, request, grant)` 适合检查 IAM 权限、模型/音色白名单、Persona、调用配额并占用并发名额，并用 `grant` 交叉校验 `start` 未越权；返回的 `AuthorizedAudioRequest` 才会传给 `ai.audio`。
- 未提供 `authorize` 时，框架会忽略客户端的 `model`、`voice` 与 `instruction`，只使用服务端默认模型（若票据 `grant.model` 存在则采用之），并拒绝与 `grant.operation` 不符的 `start`。
- 协议边界对每一帧做运行时 Zod 校验并按严格状态机接受（识别只收音频、合成只收文本、`start`/`done` 各一次、`segmentId` 会话内唯一）；输入队列、消息积压与发送缓冲均有上限，超限或取消时以领域错误关闭并级联中止上游。
- 可调参数：`preAuthTimeoutMs`（默认 5000）、`maxPendingMessages`（默认 256）、`maxSendBufferBytes`（默认 8 MiB）、`maxMessageBytes` / `maxBufferedBytes` / `maxTextBytes` / `maxSessionMs`。
- `onSessionEnd` 在成功、失败或断连后至多调用一次，供应用释放并发占用。
- 浏览器 `createAudioClient({ url, getTicket })` 只把一次性 `ticket` 放入 WebSocket URL；`getTicket(request)` 接收本次操作摘要（`operation` / `model`），可签发与本次操作严格绑定的票据；禁止传普通 IAM access token。

#### 传输加密（与 `@h-ai/crypto` 统一）

serv 不暴露本地传输加密工厂；统一从 `crypto.transport` 创建服务端管理器。服务端显式注入顶层 `crypto`、受管密钥环和共享 registry：

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

客户端使用 `@h-ai/api-client`：

```ts
import { apiClient } from '@h-ai/api-client'

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  transport: { crypto },
})
```

如果应用通过 `@h-ai/core` 从 `config/_serv.yml` 驱动 `ServConfigSchema`，transport 也可以一起配置：

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

> 服务端必须显式注入相同的受管 `serverKeyRing` 和共享 `keyStore`（Redis 或共享数据库）。仅共享客户端公钥不足以跨节点解密。没有隐式进程私钥或内存 registry 回退；开发/测试显式用 `createInMemoryKeyStore(capacity)`。服务端重启后重新加载同一密钥环即可，无需 sticky session。

> **安全策略**：启用 `transport` 后，除 `excludePaths` 与密钥协商端点外，业务请求必须携带有效 `X-Client-Id`。缺失或未知 clientId 会返回 400；响应体无法加密、非 JSON 业务响应或超过单次加密上限时返回错误，不会明文透传业务数据。

认证协议仅支持 v2：独立随机 SM4-CBC 密钥和 HMAC-SM3 密钥由 SM2 封装，先验签、再验证 MAC，最后解密 CBC。请求由客户端私钥签名，响应由所选服务端版本签名。认证字段包括 version、direction、serverKeyId、clientId、128 位随机 requestId（兼 nonce）、issuedAt、HTTP method、pathname + 原始 search 的 SM3 pathHash，以及响应 status。请求有效期 5 分钟，未来时钟偏差最多 30 秒；共享 registry 原子消费 (clientId, requestId)，nonce 至少保留到 issuedAt + 6 分钟以覆盖节点偏差，存储故障拒绝请求。Redis 必须保留有效 nonce，使用 noeviction/可靠持久化策略；各节点时钟须同步。此能力防止同一传输消息重放，业务重试仍需自己的幂等键。

空 POST 也发送空明文的认证封装；GET/HEAD 将封装放在 X-Hai-Transport 头，204/304/HEAD 等无正文响应也使用同名头承载认证封装。其它请求/响应在 JSON 正文承载封装并带 X-Encrypted: true。客户端必须关联原请求上下文和 HTTP status，缺标记、旧格式或认证失败一律 reject；明文接口只能经 excludePaths 显式排除。CORS 须允许并暴露 X-Hai-Transport。握手公钥的真实性依赖 TLS，不替代 IAM 业务授权。

业务容量通过 `transport.maxPlaintextBytes` 统一配置：默认 1 MiB，整数范围 1 KiB～64 MiB，请求和响应共用 UTF-8 明文字节预算。客户端从握手自动获取上限，密文与部署代理预算由 `resolveTransportBodyLimits()` 推导（两倍明文 + 32 KiB）。握手、公钥、认证头和防重放约束独立；超限取消原流并释放 reader，请求 413、响应为加密的 500 容量错误，客户端识别 `TransportBodyTooLargeError` / `hai:crypto:070`。 [Transport capacity and upgrade](../crypto/TRANSPORT-CAPACITY.md)。

普通业务仍使用 `transport.maxPlaintextBytes`（auto/省略为 1 MiB）；Feedback 的报告受理、证据、附件及 ZIP 下载路由通过 `routePlaintextBytes` 单独声明 `feedback.budget.maxTransportBytes`。路径中的 `*` 仅匹配一个完整路径段；宿主显式路由值优先。握手、adapter-node 与代理使用各路由最大容量，普通业务不会随材料预算扩大。HTTP 适配器为单独声明且大于 1 MiB 的材料路由保留最多 2 个槽，普通业务另有 16 个槽，完整响应/失败后释放；忙碌返回 503 / `hai:crypto:072`，不自动重放业务写入。

serv/kit 对通过请求绑定、签名和 MAC 校验但超出时间窗口的报文返回加密的 HTTP 400 时间错误；客户端抛 `TransportTimeError`（`hai:crypto:071`），提示同步设备和服务器时间后刷新重试。`api-client` 映射为 `VALIDATION_FAILED`，在 `cause.transportCode` 保留该原因。不会自动重放请求或放宽防重放窗口；篡改或未认证报文仍返回通用认证失败。

#### Token 认证（`iam` / `refreshCookie`）

`serv.createApp` 推荐直接传入顶层 `iam` 句柄，自动派生两件事：

- **access token 校验**：每个请求调用 `iam.auth.verifyToken` 填充 `context.session`（不缓存）。
- **refresh token 轮换**：启用 `refreshCookie` 后，自动使用 `iam.session.refresh` 作为 httpOnly cookie 刷新回调。

**上下文工厂优先级**：显式 `createContext` > `verifyToken` > `iam.auth.verifyToken` > 默认仅解析元数据。

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

标准登出入口 `auth.logout` 从 input.accessToken 或 Authorization Bearer 取得要撤销的完整令牌，不要求 access 仍有效。它不接受 userId 授权或撤销目标；缺少令牌返回失败，未知令牌幂等成功。共享存储故障原样保留失败 HaiResult，Cookie middleware 只对成功结果清理 refresh Cookie。普通 procedure 继续使用既有 HTTP 200 / HaiResult 协议，客户端必须检查 success，不能只检查状态码。

#### 自定义 procedure（认证 + 权限）

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

#### 高级：自定义 pipeline（HTTP middleware + context + route guard）

`@h-ai/serv` 的“pipeline”分三层，分别对应三种扩展方式：

1. **HTTP middleware 层**：通过 `serv.createApp({ middlewares })` 注入 HTTP middleware。
2. **context 层**：通过 `verifyToken` / `createContext` / `serv.buildAuthContextFactory()` 定制请求上下文。
3. **route guard 层**：通过 `.auth()` / `.permission()` / `.role()` 声明认证授权。

##### 1) 自定义 HTTP middleware

当你需要加请求日志、trace、限流、CORS、租户头校验等 **HTTP 层横切逻辑**，或挂载不适合进入 JSON/oRPC contract 的 WebSocket、文件和二进制端点时，使用 `middlewares`。常见 CORS 场景可直接复用 `serv.cors(...)`：

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

执行顺序固定为：

1. 内置 `securityHeaders`
2. 你的 `middlewares`
3. 内置 `transport`（若启用）
4. health / refresh-cookie / OpenAPI / RPC / docs / oRPC routes

说明：

- `middlewares` 按数组顺序注册
- `path` 省略时默认 `'*'`
- 由于 `middlewares` 先于 `transport` 执行，CORS preflight 或二进制端点可以直接短路；短路响应仍带内置安全头，但不会经过 transport
- 公开只读文件优先使用 `serv.storageAssets(...)`；应用仍须显式提供 key/MIME 白名单、缓存与跨域策略，框架不内置头像等业务概念
- 私有资源、Range 下载或动态授权继续使用自定义 middleware/procedure，不应套用公开资源 helper
- 若需要读取解密后的业务 body，请改用 context / procedure 层扩展
- 浏览器若需读取自定义响应头（例如 transport 的 `X-Encrypted`），请通过 `serv.cors({ exposedHeaders: [...] })` 显式暴露
- 这一层直接操作 HTTP middleware context，返回的是 **HTTP Response**，不是 `HaiResult`

##### 2) 自定义 context pipeline

如果你只想复用 `Bearer token -> session` 这一段逻辑，再额外补充租户、工作区、来源系统等字段，
优先用 `serv.buildAuthContextFactory()` 组装自定义 `createContext`：

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

什么时候用哪个：

- 只想换 token 校验实现：用 `verifyToken`
- 想在默认认证上下文之上追加字段：用 `buildAuthContextFactory(...) + createContext`
- 想完全接管上下文构造：直接用 `createContext`

##### 3) Route guard

公开 procedure 使用 `.route(path, handler)`；需要 guard 时使用
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

约束：

- `.permission()` 与 `.role()` 自动要求认证；未登录/授权不足返回失败 HaiResult，`error.httpStatus` 分别为 401/403；普通 procedure 的 HTTP 响应默认仍为 200。
- 同一路由声明多个 permission/role 时必须全部满足；`serv.WILDCARD_PERMISSION` / `serv.WILDCARD_ROLE` 可放行对应类别。
- handler 抛出的未处理异常统一转成 INTERNAL_ERROR HaiResult；预期业务失败仍应直接返回 `err(...)`。
- 路径、input、output 从 contract 推导；重复或未知路径会被拒绝，未实现完整 contract 时不能调用 `.build()`。

边界约束：

- `src/pipelines/*` 是 `@h-ai/serv` 的内部默认实现目录，不作为公开子路径 API 承诺
- 对应用层公开的稳定入口仍然是根入口 `@h-ai/serv`
- `securityHeaders` / `requireInternalRPC` / `buildHaiErrorBody` 等内部 helper/middleware 不作为单独子路径文档暴露

#### httpOnly Cookie 认证（推荐生产方案）

httpOnly cookie 模式将 refresh token 存储在服务端管理的 cookie 中（浏览器 JS 无法读取），避免 XSS 风险。

先把两个 token 的职责分清：

- `accessToken`：短期凭证。客户端把它放在内存中，并通过 `Authorization: Bearer <token>` 发送。
  `serv.parseRequestContext()` / `extractBearerToken()` 解析的就是它；`buildAuthContextFactory()` 校验的也是它。
- `refreshToken`：长期凭证。启用 `refreshCookie` 后，它不会再暴露给前端 JS，而是只保存在浏览器的 httpOnly cookie 中。
  它**不会**被 `extractBearerToken()` 读取，只会在 `/auth/refresh` 被服务端取出，用来换发新的 access token。
  受信原生客户端可通过 `nativeTokenTransport` 改用 JSON body，但必须同时校验客户端标识与 Origin。

**工作原理：**

1. 浏览器登录 → 服务端在响应中 `Set-Cookie: hai_refresh_token=...;HttpOnly`，并从 JSON 响应体擦除 `refreshToken`
2. Access token 存储在客户端内存（不持久化）
3. Access token 过期时，浏览器自动携带 cookie 访问 `/auth/refresh`
4. 服务端读取 cookie → 调用 `onRefresh` → 返回新 access token + 更新 cookie（响应体不暴露 refresh token）

原生客户端匹配 `nativeTokenTransport.isRequest` 后，登录/注册/刷新响应会保留轮换后的
`refreshToken`，刷新请求从 `{ refreshToken }` body 读取，且整个流程不读写浏览器 Cookie。

**服务端配置：**

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
    // secure: true,                    // NODE_ENV 或 HAI_CORE_ENV 为 production 时默认开启
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

**客户端配置（与 `@h-ai/api-client` 配合）：**

```ts
// 默认存储即 httpOnly cookie，refreshPath 默认 /auth/refresh，无需额外配置。
await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
})
```

> **Cookie 规格**：`HttpOnly; SameSite=Strict; Secure`（生产）；`Path` 限制为 `{apiPrefix}/auth/refresh`。

### API 概览

- `serv.createApp(options)`：创建 HTTP App 抽象，挂载自定义 `middlewares`、健康检查、OpenAPI handler、可选文档与 RPC
- `serv.parseRequestContext({ request })`：默认上下文解析（提取 Bearer token + requestId，不填充 session）
- `serv.listen(app, options)`：在 Node.js 启动 HTTP 服务，返回 `{ server, address, close }`
- `serv.toFetch(app)`：包装为标准 `fetch(Request)` handler
- `serv.generateSpec(contract, options)`：由 contract 生成 OpenAPI 3.1 spec
- `serv.storageAssets(config)`：创建只读 Storage 资源 middleware，内置 key/MIME 白名单、GET/HEAD 与 ETag
- `serv.implement(contract)`：创建链式 contract 实现器
- `.context<ServContext>()`：声明 procedure 请求上下文
- `.route(path, handler)`：注册公开 procedure
- `.route(path).auth/permission/role().handle(handler)`：注册带认证授权的 procedure
- `.build()`：所有 contract procedures 完整实现后构建 router
- `serv.validateInputOrFail(zodSchema, input, locale)`：在 procedure 内做 Zod 二次校验，失败时返回本地化 `HaiResult` + `ValidationFormError[]`
- `serv.resolveRequestLocale(headers)`：从 `x-hai-locale` / `Accept-Language` 解析并规范化请求 locale
- `serv.m(key, options)`：读取 `@h-ai/serv` 自身消息，支持 `options.locale` 单次调用本地化

另有根级类型 / 命名导出：

- `ServConfigSchema`：用于 `core.config.validate('serv', ServConfigSchema)` 校验 `config/_serv.yml`
- HTTP App 抽象：`serv.createApp()` 返回具备 `fetch/request` 能力的公开应用对象；内部是否使用 Hono 不影响应用代码
- `ServMiddlewareMount`：`createApp({ middlewares })` 的挂载项类型（`{ path?, middleware }`）
- `ServMiddleware` / `ServProcedureHandler`：自定义 pipeline 时复用的共享类型
- `NativeRefreshTokenTransportConfig` / `ServStorageAssetsConfig`：原生 Token 通道与只读资源 middleware 配置

> 传输加密不作为 `serv.xxx` 扁平 API 暴露；它是 `createApp` 的配置能力，内部委托 `crypto.transport`。

### 配置

`@h-ai/serv` 本身不主动扫描 YAML；推荐由 `@h-ai/core` 统一加载 `config/_serv.yml`，再把解析结果传给 `serv.createApp()`。

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

`config/_serv.yml` 示例：

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

`server`（host/port）：优先级 `HOST` / `PORT` 环境变量 > 配置文件 > 默认 `127.0.0.1:3000`；由应用把 `servConfig.server` 传给 `serv.listen`。

`ServHttpConfigInput`：

- `apiPrefix`：默认 `/api/v1`
- `health`：默认 `{ path: '/health', readyPath: '/ready' }`
- `openapi`：默认 `false`；启用：`{ path: '/openapi.json' }`
- `docs`：默认 `false`；启用：`{ path: '/docs' }`（依赖 `openapi`）；启用后自动挂载 `/_hai/scalar.js`，从 `@scalar/api-reference` 的 browser bundle 提供本地 Scalar UI 脚本，无需外网 CDN
- `rpc`：默认 `false`；启用：`{ prefix: '/rpc', access: 'loopback' | 'private-network' | 'gateway-only', gatewayHeader?, gatewaySecret? }`
- `cors`：配置文件中的跨端 origin、credentials、allowedHeaders 与 exposedHeaders；应用通过 `serv.cors(...)` 装配。
- `transport`：`config/_serv.yml` 顶层配置；启用后可通过 `servConfig.transport` 装配到 `createApp({ transport })`，默认密钥协商子路径 `/_hai/key-exchange`

生产环境应先通过 `serv.createRuntimeSecurityPolicy(...)` 收敛 CORS、Cookie 与文档暴露策略：

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

生产环境下 `_serv.yml` 的 `cors.origin` 为空或为 `*` 会在启动时失败；Web 与 Capacitor/Tauri Origin 均按规范化后的完整 Origin 精确匹配，避免后缀伪造。生产环境同时强制 Secure refresh cookie 并关闭 OpenAPI/docs，配置文件仍决定非生产环境具体挂载哪些端点。

### 配置驱动认证页面

协议支持配置中的 userAgreementMarkdown/privacyPolicyMarkdown 正文及 URL；同主题优先 Markdown，由安全渲染器在弹窗显示。

`createIamProcedures({ iam })` 直接实现公开配置、密码/LDAP/OTP、注册与密码重置，无需应用复制 procedure。LDAP 登录沿用现有浏览器 httpOnly refresh Cookie 和可信原生 Token 传输。管理端创建调用 iam.user.createUser，自助注册关闭时管理功能仍可用；授权仍由既有 permission guard 执行。

[完整 IAM 配置 / IAM configuration](../iam/README.md)

### 错误处理

普通 procedure 的认证、授权、业务失败和被捕获的 handler 异常都作为 `HaiResult` 输出，默认通过 HTTP 200 返回；`error.httpStatus` 是领域错误元数据，不会自动改写响应状态。客户端必须检查 `success` 与 `error.code`。例如未登录为 `error.httpStatus=401`，数据库查询失败或 INTERNAL_ERROR 为 500。

oRPC contract 输入校验在 procedure 之前失败时返回 HTTP 400，本地化失败体包含 `error.httpStatus=400` 和字段错误；procedure 内 `serv.validateInputOrFail` 返回的失败仍为 HTTP 200。HTTP middleware、refresh-cookie、OpenAPI/RPC 权限与 transport 协议错误另按自身契约返回真实 HTTP 状态。api-client 在真实 HTTP 401 或 HTTP 200 的有效失败 HaiResult（`success=false`、字符串 `error.code/message`、`error.httpStatus=401`）后自动刷新，成功后只重试一次；内置登录、注册和配置的刷新路径除外，403/500 不刷新。启用 transport 时刷新和重试复用加密链路。

- Default procedures 全部返回 `HaiResult<T>`，客户端直接判断 `result.success`
- 认证失败 → `HaiCommonError.UNAUTHORIZED`（由 `.auth()` 按 `context.locale` 本地化）
- 授权失败 → `HaiCommonError.FORBIDDEN`（由 `.permission()` / `.role()` 按 `context.locale` 本地化）
- 未捕获异常 → `HaiCommonError.INTERNAL_ERROR`（由 route 实现器统一兜底并按 `context.locale` 本地化）

正常业务请求建议按三层处理：

1. **oRPC contract 输入校验**：进入 procedure 前由 oRPC 执行；`serv.createApp()` 内部会自动拦截并把 Zod 默认英文错误重写为本地化 `errors[]`。
2. **procedure 内二次校验**：对数据库读回对象、跨字段约束等适合 Zod 表达的规则，使用 `serv.validateInputOrFail(zodSchema, input, context.locale)`；简单业务规则直接 `err(...)` 即可，不必为了统一额外造 schema。
3. **业务/领域错误**：不要 throw 预期业务失败；直接返回 `err(...)`，并在**创建错误消息的那一层**使用对应模块的 i18n getter，例如 `serv.m(..., { locale: context.locale })` 或 `widgetM(..., { locale: context.locale })`。

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

> 如果错误来自下游业务模块（如 `iam.user.xxx()`）且该模块已经直接返回 `HaiResult`，serv 会原样透传它的 `error.message`。当前 `HaiError` 只携带最终 `message`，不携带 `messageKey/params`，因此 **serv 边界无法对任意下游错误再做一次通用 i18n 重翻译**；要支持请求级 i18n，必须在创建该错误消息的模块里就拿到 locale。

### 请求语言隔离

Node 请求与 SSR 使用 `core.i18n.runWithLocale(locale, () => handleRequest())`；SvelteKit 可使用 `kit.i18n.runWithLocale(locale, () => resolve(event))`，serv 自动按请求头建立上下文。异步子任务继承请求语言，优先级为显式 `MessageOptions.locale`、请求语言、进程启动默认语言。`setGlobalLocale` 在请求上下文中只更新当前请求；上下文外仅用于启动默认值，不能在请求 hook 中调用它修改默认值。

浏览器继续使用应用级 `setGlobalLocale` / `createLocaleStore`。SSR 的 UI store 初始化和 setter 只修改自身状态，不写全局语言；UI 消息从请求上下文读取。`runWithLocale` 仅支持 Node 入口，浏览器通过显式 locale 或应用状态翻译。

## 输入约束与 HTTP 能力

存储 key 按 UTF-8 最多 1024 字节，并拒绝绝对路径、反斜线、控制字符及点路径段；公开 HTTP 批量删除每次 1–1000 项。`@h-ai/storage/schemas` 提供浏览器安全的共同规则。预签名有效期为整数 1–604800 秒（Node 默认 3600，HTTP 默认 900）；HTTP 上传仅接受 key/contentType/expiresIn，不支持 contentLength/maxSize/metadata/checksum。无效输入返回 HTTP 400，typed client 映射 VALIDATION_FAILED。FileUpload 的大小/类型限制仅为前端体验，实际对象须由应用服务端复核。Node 流式读写/checksum/条件写等没有默认 HTTP 端点。完整映射与授权边界见 [存储 API 能力](../storage/README.md#存储输入约束与跨端能力)。

## 可选的反馈服务与可信范围

通过 `@h-ai/serv/features/feedback` 的 `createFeedbackProcedures` 挂载 `apiContract.feedback`；只导入运行时根入口不会加载反馈服务。宿主先初始化 reldb/storage/reach/feedback，再从已验证的会话与部署策略映射反馈范围。resolveContext 返回 null 或用户不匹配时拒绝访问；领域模块再次校验范围与权限。

所有 HTTP 响应（包括探活、404、中间件短路）携带有界 X-Request-Id。普通业务日志需由已有 createContext 的可选 scopeId 建立可信范围，scopeId 从不读取客户端头。HTTP 入口清理旧身份，认证后的异步业务日志自动继承当前请求 ID 与用户。

```ts
import { apiContract } from '@h-ai/api-contract'
import { feedback } from '@h-ai/feedback'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { createFeedbackProcedures } from '@h-ai/serv/features/feedback'

const contract = apiContract.create({ feedback: apiContract.feedback })
const authenticate = serv.buildAuthContextFactory(token => iam.auth.verifyToken(token))
const procedures = {
  feedback: createFeedbackProcedures({
    feedback,
    resolveContext: context => context.scopeId
      ? { scopeId: context.scopeId, userId: context.session.userId, permissions: context.session.permissions }
      : null,
  }),
}
const app = serv.createApp({
  contract,
  procedures,
  createContext: async input => ({ ...await authenticate(input), scopeId: 'configured-product' }),
})
```

## 错误提示与关联日志

原生 Audio WebSocket 同样使用安全错误边界：内部 Provider/SDK 错误与堆栈只进入脱敏日志，客户端收到稳定错误码、安全提示和 traceId。自定义跨域配置需保留敏感操作使用的 X-Hai-Reauthentication；默认 Serv/Kit 已允许。

HTTP 错误返回本地化安全文案及追踪编号；ToastContainer 默认隐藏编号，由排查信息图标展开和复制。响应同时包含 `error.traceId` 和 `X-Trace-Id`。框架复用本次 requestId 作为 traceId，前后端日志自动关联。底层异常、堆栈和操作上下文经凭据脱敏后写入日志，不通过 cause/ext 向用户公开。字段校验只返回本地化的字段名和错误。

`core.error.toPublic(error, traceId?)` 用于接口/UI 边界；`core.error.formatMessage(error)` 用于重新翻译后的提示，重复调用不会重复追加标识。日志传入完整 Error 对象，不能只记录通用标题或提前 String(error) 丢失上下文。数据库失败记录驱动错误码、消息、堆栈及表/列；SQL 原文、绑定值和连接凭据不进入日志。

audit 已初始化时，procedure 自动绑定经过验证的身份、可信连接地址与请求/范围编号，业务 audit.log 继承此上下文。写操作及失败/拒绝记录 request.execute；契约校验、协议、中间件和缺失路由的 HTTP 拒绝记录 http.reject。入口只记录操作、方法、状态和原因码，不复制请求体、动态 URL、令牌或错误详情。capture.enabled 可关闭自动采集，capture.includeReads 可开启成功读取；显式业务 log 不受影响。业务语义仍须应用在完成/失败边界记录。

## 可选交互挑战

标准 IAM procedure 包含 POST /auth/captcha，输入 operation，返回可公开的 ALTCHA 挑战。开启 IAM captcha 时密码/OTP/LDAP、注册、通知请求及匿名原密码续期均由 IAM 强制检查单用证明；请求映射保留 captcha，不依赖菜单或客户端判断。

策略、默认值和恢复边界见 [IAM](../iam/README.md)。

## 页面离开会话策略

`session.endOnPageHide` 默认 `false`。启用后宿主调用 `actions.bindPageExit({ enabled: config.session.endOnPageHide })` 并在卸载时调用返回的清理函数；标准 admin/H5/fullstack 模板已经接入。非 BFCache 的 `pagehide`（也包括刷新、整页导航）通过 POST `/auth/session/close` 尽力撤销当前 access 及关联 refresh，沿用 CSRF/传输加密，使用 `keepalive` 且不自动刷新会话。该响应不清 Cookie/本地凭据，避免旧响应覆盖下一次登录。显式退出仍使用正常 logout，可靠撤销并清理当前凭据。浏览器可能不发送页面离开请求，因此必须按业务配合服务端 `idleTimeout`/`absoluteTimeout`；不能据此保证关闭即撤销。

## 传输容量与模块预算

配置 `transport.maxPlaintextBytes` 支持 1 KiB～64 MiB 的显式整数或 `auto`。auto/省略在解析后为 undefined：无模块需求时仍为 1 MiB，反馈宿主使用 crypto.resolveTransportBodyLimits 的 requiredPlaintextBytes 统一推导。显式上限不足时启动/打包失败，不能被反馈覆盖；代理、adapter-node、握手与运行时使用一致预算。业务附件、解压和数据行数上限继续独立校验。

## 开发测试

```bash
pnpm --filter @h-ai/serv test
pnpm --filter @h-ai/serv typecheck
pnpm --filter @h-ai/serv lint
```

声明旁的 JSDoc 示例从实际 `@h-ai/serv` 或已公开的 features 子路径导入；内部 Hono/guard/router/transport 示例明确标注“模块内部上下文”，不代表根 API。示例区分工厂的启动配置异常、领域 HaiResult、HTTP middleware 状态码和监听句柄的 Promise<void> 关闭；默认 AI completion 仍只返回非流式 JSON。框架维护运行 `node scripts/check-module-jsdoc.mjs --package serv` 对实际声明和内部词法绑定编译示例，编译不代替真实 HTTP、授权与分布式防重放验收。

## 许可证

Apache-2.0
