# @h-ai/serv 功能说明

[English](serv.en.md) · [日本語](serv.ja.md)

在 Node.js 中用 `serv.createApp()` 把契约和处理函数组成 HTTP 应用。根入口提供监听、认证和中间件接口。各功能子路径提供 IAM、Storage、AI 和 Feedback 接口的处理函数。

[模块 README](../../../packages/serv/README.md) · [配置清单](../configuration/serv.md) · [数据结构](../data/serv.md) · [前后端接入](../development/frontend-backend.md)

<a id="quick-start"></a>

## 最小接入示例

在应用启动时初始化 `core`、`iam`、`storage` 和 `ai`，加载并校验 `serv` 配置，再调用 `startApi(closeApp)`。`closeApp` 是应用提供的异步回调，负责按初始化的逆序释放业务资源。函数返回 Node 监听句柄。传入回调后，`serv.listen` 会在收到退出信号时先关闭监听，再调用该回调。只提供健康检查时，可以用空契约和空 procedures 创建 App。

```ts
import type { ServConfig } from '@h-ai/serv'
import { ai } from '@h-ai/ai'
import { apiContract } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { createAiProcedures } from '@h-ai/serv/features/ai'
import { createIamProcedures } from '@h-ai/serv/features/iam'
import { createStorageProcedures } from '@h-ai/serv/features/storage'
import { storage } from '@h-ai/storage'

export function startApi(closeApp: () => Promise<void>) {
  // 用三个模块的契约生成 HTTP 路由契约。
  const contract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

  // 将已初始化的业务模块绑定为实现；存储检查所有 key 的归属。
  const procedures = {
    iam: createIamProcedures({ iam }),
    storage: createStorageProcedures({
      storage,
      authorize: ({ context, keys }) => keys.every(key =>
        key.startsWith(`users/${encodeURIComponent(context.session.userId)}/`)),
    }),
    ai: createAiProcedures({ ai }),
  }

  // 使用契约、实现和 HTTP 设置构建 App。
  const app = serv.createApp({
    contract,
    procedures,
    iam,
    http: {
      apiPrefix: '/api/v1',
      openapi: { path: '/openapi.json' },
      docs: { path: '/docs' },
    },
  })

  // 读取已加载的监听配置，返回包含地址和 close() 的句柄。
  const { server } = core.config.getOrThrow<ServConfig>('serv')
  return serv.listen(app, {
    host: server.host,
    port: server.port,
    onListening: info => core.logger.info('API service listening', { port: info.port }),
    onClose: closeApp,
  })
}
```

Storage 默认 procedures 必须注入 `authorize({ context, operation, keys })`；未提供策略时默认拒绝。策略从已认证 session 确定资源范围，并覆盖下载、上传、列表、元数据和删除。上例只允许 `users/<编码后的 userId>/` 下的 key，列表同样必须携带该用户前缀；批量中任何一个 key 未获授权时全部不执行。管理员访问须由应用显式授权。

批量删除 `storage.files.deleteMany` 成功时返回 `{ deletedKeys, failures: [] }`；失败进度位于 `error.ext.deleteMany`（`failed / unknown / notAttempted`），不能只根据 HTTP 200 判断完成。详见 [Storage 批量删除](storage.md#api-概览)。

AI 默认 procedures 从可信 `context.session.userId` 绑定 `objectId`，客户端可省略该字段。聊天与消息写入、历史、会话列表和记忆 recall/list 均使用该主体；会话按 `objectId + sessionId` 隔离，写入未指定 sessionId 时使用 `default`。传入其它 objectId 默认返回 FORBIDDEN，管理员跨主体访问也必须显式传入 `authorizeObject` 并根据可信权限及租户关系授权。

`chats.createCompletion`（`POST /ai/chats/completions`）只返回一次非流式 `HaiResult<AiChatCompletionData>`。完整 function `tools`（含嵌套 JSON Schema、`strict`）和 `tool_choice`（`auto` / `none` / `required` / 指定名称）传递到模型；消息保留角色、`name`、用户图片和工具调用。工具结果必须使用 `role: 'tool'` 与非空 `tool_call_id`，指定工具选择须引用本次提供的工具。默认 procedure 不自动执行工具，应用授权并执行后，将助手的 `tool_calls` 与对应工具结果一并回传。输入不提供 `stream` 字段，传入 `true` 或 `false` 均在 HTTP 边界返回 400；需要流式时由应用使用 `ai.llm.chatStream()` 定义匹配流输出的独立 endpoint。

## 功能说明

<a id="api-reference"></a>

### 用途、输入与输出

表中的调用片段使用各节示例已经打开的服务或建立的对象。示例变量由应用提供，例如当前 HTTP 请求、用于校验输入的 Schema、资源定义或配置。返回 Promise 时用 `await` 等待。返回 `HaiResult` 时先判断 `success`，再读取数据或错误。

| API | 用途 | 参数与默认值 | 返回值 | 示例 |
| --- | --- | --- | --- | --- |
| `serv.createApp(options)` | 组装 HTTP 应用 | 必填 `contract`、`procedures`。HTTP、IAM、中间件、传输加密和语音可按需配置，见[默认值](../configuration/serv.md) | 提供 `fetch` 和 `request` 的 `ServHttpApp` | `serv.createApp({ contract, procedures })` |
| `serv.listen(app, options?)` | 启动 Node 监听 | 必填 `app`。默认 `host: '127.0.0.1'`、`port: 3000`。可传 `onListening`、`onClose` | `ServNodeServer`，含 `server`、`address` 和异步 `close()` | `serv.listen(app, { port: 3001 })` |
| `serv.toFetch(app)` | 供支持 Fetch 的环境使用 | 由 `createApp()` 返回的应用 | `(request: Request) => Promise<Response>` | `const fetch = serv.toFetch(app)` |
| `serv.implement(contract)` | 实现契约中的路由 | 必填带类型的路由契约 | `ServImplementer`，可继续设置上下文和各路由的鉴权、权限、角色及处理函数 | `serv.implement(contract)` |
| `serv.parseRequestContext(input)` | 读取追踪编号、语言与访问令牌 | `request` 必填，`platform` 可选 | `ServContext`，其中令牌尚未验证 | `serv.parseRequestContext({ request })` |
| `serv.buildAuthContextFactory(verifyToken)` | 构造验证访问令牌的上下文工厂 | 回调接收访问令牌，返回 `Promise<HaiResult<ServSession>>` | `CreateServContext`，无效令牌时不填 `session` | `serv.buildAuthContextFactory(token => iam.auth.verifyToken(token))` |
| `serv.cors(config?)` | 处理跨域预检和响应头 | 默认来源 `'*'`，`credentials: false`、`maxAge: 86400` 秒。可指定方法、允许和暴露的头 | `ServMiddleware` | `serv.cors({ origin: 'https://app.example.com', credentials: true })` |
| `serv.createRuntimeSecurityPolicy(input)` | 根据环境确定跨域、Cookie 和接口文档策略 | `environment` 省略时按非生产处理，来源默认 `'*'`。生产须提供明确的 Web 来源，可加 `nativeOrigins` | 含 `allowOrigin`、`secureRefreshCookie`、`exposeApiDocs` 的策略 | `serv.createRuntimeSecurityPolicy({ environment: 'production', corsOrigin: 'https://app.example.com' })` |
| `serv.storageAssets(config)` | 用 Storage 提供授权后的只读资源 | 传入读取函数、键规则和 MIME 检查，按需配置缓存 | 支持 GET、HEAD 和 ETag 的 `ServMiddleware` | `serv.storageAssets(assetOptions)` |
| `serv.generateSpec(contract, options?)` | 生成 OpenAPI 描述 | 契约必填，标题默认 `hai-framework API`，版本默认 `0.1.0`；描述和前缀可省略 | `Promise<OpenAPI.Document>`，转换失败时拒绝 | `await serv.generateSpec(contract, { title: 'Orders', version: '1.0.0' })` |
| `serv.validateInputOrFail(schema, input, locale?)` | 校验业务输入并生成字段错误 | Zod Schema 和待校验值必填，语言默认 `zh-CN`，可传当前请求语言 | `HaiResult<z.infer<Schema>>`，失败中含可公开的字段错误 | `serv.validateInputOrFail(InputSchema, input, context.locale)` |
| `serv.resolveRequestLocale(headers)` | 根据 HTTP 请求头选择语言 | 传入 `Headers` 或头字段对象。先读 `x-hai-locale`，再读 `Accept-Language`，默认 `zh-CN` | 规范化的语言标识 | `serv.resolveRequestLocale(request.headers)` |
| `serv.m(key, options?)` | 读取本地化提示 | 消息键必填，可传 `locale` 和插值参数 | `string` | `serv.m('serv_errorForbidden', { locale: 'zh-CN' })` |
| `serv.WILDCARD_PERMISSION` | 在可信策略中表示所有权限 | 只读常量 | `string` | `const allPermissions = [serv.WILDCARD_PERMISSION]` |
| `serv.WILDCARD_ROLE` | 在可信策略中表示所有角色 | 只读常量 | `string` | `const allRoles = [serv.WILDCARD_ROLE]` |

- 链式 procedure：`implement().context().route().auth/permission/role().handle().build()`
- 自定义 pipeline：`createApp({ middlewares })` 挂 HTTP middleware；请求级字段通过 context 工厂注入
- 只读 Storage 资源：`serv.storageAssets(...)` 统一处理安全 key、MIME 白名单、GET/HEAD、ETag 与缓存头
- 默认 feature procedures：`createIamProcedures()`、`createStorageProcedures()`、`createAiProcedures()`
- `build()` 同步返回普通 router，可按嵌套属性选取默认 feature procedures；挂载的 contract 与所选 procedures 保持一致，未选入口不开放。
- 缺失路由返回本地化的 HaiResult JSON 404，启用传输加密后保留 404，不误报为非 JSON 响应导致的 500。
- 内置安全响应头、健康检查、可选 OpenAPI JSON、可选 Scalar 文档页
- 可选传输加密：`serv.createApp({ transport: { crypto, serverKeyRing, keyStore } })` 自动挂载密钥协商与请求/响应加解密
- 可选语音入口：`serv.createApp({ audio: { ai, verifyTicket, authorize } })` 挂载统一语音 WebSocket；连接建立即用一次性 ticket 鉴权（返回 `{ session, grant? }`，独立预鉴权超时），每帧运行时 Zod 校验 + 严格状态机，输入/积压/发送缓冲背压与级联取消；授权回调负责服务端确认操作、模型、音色、配额与并发占用

> `serv.createApp()` 根据传入的路由和依赖创建应用。先初始化所用的 `iam`、`storage`、`ai` 或 `crypto`。如果创建传输加密管理器等启动步骤出错，工厂会立即抛出错误。通过 `serv.listen(app, { onClose })` 注册退出信号回调，可以在服务器停止后关闭这些依赖。主动调用监听句柄的 `close()` 时，它只关闭监听、连接和信号处理，依赖模块由调用方关闭。

监听句柄可在启动后立即关闭，以取消尚未完成的绑定；重复关闭复用同一结果。地址占用等真实监听失败仍会拒绝关闭结果，不会当作正常退出。

### host / port 配置

host/port 统一由 `config/_serv.yml` 的 `server` 提供，优先级：`HOST` / `PORT` 环境变量 > 配置文件 > 默认 `127.0.0.1:3000`。默认 `127.0.0.1` 仅本机可达，容器对外暴露时改为 `0.0.0.0`：

```yaml
# config/_serv.yml
server:
  host: 127.0.0.1
  port: 3000
```

应用把解析后的 `server` 传给 `serv.listen`（`serv.listen` 也可直接传 `host` / `port` 显式覆盖）。

### 标准 fetch 签名适配

`serv.toFetch(app)` 返回接受 `Request`、异步返回 `Response` 的函数。测试可以直接传入构造好的请求，其他 Node.js 服务器也可以把自己的 Fetch 请求交给它。根入口依赖 Node.js API。

```ts
const handler = serv.toFetch(app)
export default { fetch: handler }
```

Node `serv.listen()` 自动提供 socket 对端地址；默认忽略 `X-Forwarded-For` / `X-Real-IP`。只有 `http.trustedProxies` 中列出的代理 IP/CIDR 才能提供转发头，XFF 从右向左停在首个不可信地址，忽略其左侧内容；可信链无法解析或过长时 IP 为 undefined，不能回退为代理身份。代理必须清洗或追加转发头。Fetch 平台通过 `app.fetch(request, { remoteAddress: platformPeerAddress })` 显式提供可信对端，缺失时 IP 为 undefined，不能从任意请求头复制。自定义 `createContext(input)` 复用完整 input，保留框架已解析的 `input.ip`。

toFetch 对 Request、URL、字符串统一调用标准 Request(input, init)，RequestInit 可覆盖 method、headers、body、signal 等字段；不修改原 Request 的字段，正文已消费/锁定或非法正文组合会以 Promise 拒绝。预取消和派发前取消不进入 handler，进行中取消结束调用方等待并把有效 signal 传给应用；监听器在完成/失败/取消后释放，取消后的迟到响应会取消未消费正文。取消不能回滚已经开始的外部副作用；Response 交付后的流由应用监听 request.signal 并自行关闭。

### Audio WebSocket：ticket 与服务端授权

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

<a id="detailed-workflow"></a>

### 传输加密（与 `@h-ai/crypto` 统一）

serv 不暴露本地传输加密工厂；统一从 `crypto.transport` 创建服务端管理器。服务端显式注入顶层 `crypto`、受管密钥环和共享 registry：

```ts
import type { ServContext } from '@h-ai/serv'
import { apiContract } from '@h-ai/api-contract'
import { cache } from '@h-ai/cache'
import { ok } from '@h-ai/core'
import { createRedisTransportKeyStore, crypto, parseTransportServerKeyRing } from '@h-ai/crypto'
import { serv } from '@h-ai/serv'
import { z } from 'zod'

const ready = await crypto.init()
if (!ready.success)
  throw new Error(ready.error.message)
const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
if (!ring.success)
  throw new Error(ring.error.message)
const connected = await cache.init({ type: 'redis', host: '127.0.0.1', port: 6379 })
if (!connected.success)
  throw new Error(connected.error.message)

const contract = {
  ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.string())),
}
const procedures = serv.implement(contract).context<ServContext>()
  .route('ping', () => ok('pong'))
  .build()

const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
  transport: {
    crypto,
    serverKeyRing: ring.data,
    // 默认密钥交换端点为 /api/v1/_hai/key-exchange。
    keyStore: createRedisTransportKeyStore({ cache, ttlSeconds: 3600 }),
  },
})
```

此处 `app` 已装配 `GET /api/v1/ping`；交给 `serv.listen(app)` 后才会监听端口。启动流程出错或关闭服务时负责清理 Cache 和 Crypto。

客户端通过公开地址配置 `@h-ai/api-client`，不传服务端密钥：

```ts
import { apiClient } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'

const ready = await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  transport: { crypto },
})
if (!ready.success)
  throw new Error(ready.error.message)
```

如果应用通过 `@h-ai/core` 从 `config/_serv.yml` 驱动 `ServConfigSchema`，transport 也可以一起配置：

```yaml
# config/_serv.yml
http:
  trustedProxies: auto
  access: false
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
  middlewares: [
    {
      middleware: serv.cors({
        origin: servConfig.cors.origin,
        credentials: servConfig.cors.credentials,
        allowedHeaders: [...servConfig.cors.allowedHeaders],
        exposedHeaders: [...servConfig.cors.exposedHeaders],
      }),
    }
  ],
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

加密传输使用 v2 格式。服务端先核对签名、消息认证码（MAC）、请求方法、路径和时间，再解密。客户端还会校验响应状态。服务节点共用同一处 Redis 或数据库，每个请求编号只准登记一次，以拒绝重复发送的加密报文。应用仍需使用 HTTPS、配置接受转发头的代理、检查当前用户权限，并防止重试导致业务重复执行。跨域接入时，CORS 需允许请求携带 `X-Hai-Transport`，并让前端读取同名响应头。完整规则见 [Transport 协议](../../../packages/crypto/TRANSPORT-PROTOCOL.md)。

业务容量通过 `transport.maxPlaintextBytes` 统一配置：默认 1 MiB，整数范围 1 KiB～64 MiB，请求和响应共用 UTF-8 明文字节预算。客户端从握手自动获取上限，密文与部署代理预算由 `resolveTransportBodyLimits()` 推导（两倍明文 + 32 KiB）。握手、公钥、认证头和防重放约束独立；超限取消原流并释放 reader，请求 413、响应为加密的 500 容量错误，客户端识别 `TransportBodyTooLargeError` / `hai:crypto:070`。 [Transport capacity and upgrade](../../../packages/crypto/TRANSPORT-CAPACITY.md)。

普通接口沿用 `transport.maxPlaintextBytes`，设为 `auto` 或省略时上限为 1 MiB。反馈上报、证据、附件和 ZIP 下载通常需要更大正文。给这些路由单独设置 `routePlaintextBytes`，取值可用 `feedback.budget.maxTransportBytes`。路径中的 `*` 只匹配一个路径段。若应用已为某条路由配置额度，以该值为准。

握手、Node HTTP 适配器和反向代理按各路由的最大值预留空间。HTTP 适配器为显式配置且超过 1 MiB 的路由最多同时处理 2 个请求，普通路由另有 16 个名额。响应发送完毕或请求失败时释放名额。忙碌时返回 HTTP 503（`hai:crypto:072`），应用决定是否重试。

Serv/Kit 对通过请求绑定、签名和 MAC 校验但超出时间窗口的请求返回加密的 HTTP 400 错误。客户端抛出 `TransportTimeError`（`hai:crypto:071`），显示校验时的服务器 UTC 时间，提示开启设备的自动校时或手工修改时间后刷新。`serverTime` 为 Unix 毫秒。`api-client` 映射为 `VALIDATION_FAILED`，在 `cause.transportCode` 和 `cause.serverTime` 保留诊断信息。

### Token 认证（`iam` / `refreshCookie`）

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

### 自定义 procedure（认证 + 权限）

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

### 高级：自定义 pipeline（HTTP middleware + context + route guard）

`@h-ai/serv` 的“pipeline”分三层，分别对应三种扩展方式：

1. **HTTP middleware 层**：通过 `serv.createApp({ middlewares })` 注入 HTTP middleware。
2. **context 层**：通过 `verifyToken` / `createContext` / `serv.buildAuthContextFactory()` 定制请求上下文。
3. **route guard 层**：通过 `.auth()` / `.permission()` / `.role()` 声明认证授权。

#### 1) 自定义 HTTP middleware

当你需要加请求日志、trace、限流、CORS、租户头校验等 **HTTP 层横切逻辑**，或挂载不适合进入 JSON/oRPC contract 的 WebSocket、文件和二进制端点时，使用 `middlewares`。常见 CORS 场景可直接复用 `serv.cors(...)`。下例挂载资产路由前，应用需先初始化 Storage 并检查结果；请求会返回耗时响应头。示例的租户请求头检查仅要求存在，不能替代对当前用户的租户归属校验。

```ts
import type { ServContext, ServMiddleware } from '@h-ai/serv'
import { apiContract } from '@h-ai/api-contract'
import { ok } from '@h-ai/core'
import { serv } from '@h-ai/serv'
import { storage } from '@h-ai/storage'
import { z } from 'zod'

const contract = {
  ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.string())),
}
const procedures = serv.implement(contract).context<ServContext>()
  .route('ping', () => ok('pong'))
  .build()

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
2. 内置 CORS 响应包装；密钥交换和预检先检查访问策略
3. 内置 `transport`（若启用）及每次请求访问策略
4. 你的 `middlewares`
5. health / refresh-cookie / OpenAPI / docs / oRPC routes

说明：

- `middlewares` 按数组顺序注册
- `path` 省略时默认 `'*'`
- 普通 `middlewares` 在解密和访问策略之后执行；提前响应仍受策略约束并经过响应加密。二进制端点须显式列入 `transport.excludePaths`，该排除不会绕过访问策略
- 公开只读文件优先使用 `serv.storageAssets(...)`；应用仍须显式提供 key/MIME 白名单、缓存与跨域策略，框架不内置头像等业务概念
- 私有资源、Range 下载或动态授权继续使用自定义 middleware/procedure，不应套用公开资源 helper
- 此时 `c.req.json()` 读取解密后的正文；内置 `serv.cors(...)` 的预检仍检查访问策略
- 浏览器若需读取自定义响应头（例如 transport 的 `X-Encrypted`），请通过 `serv.cors({ exposedHeaders: [...] })` 显式暴露
- 这一层直接操作 HTTP middleware context，返回的是 **HTTP Response**，不是 `HaiResult`

#### 2) 自定义 context pipeline

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

#### 3) Route guard

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
- 权限还支持 IAM/Kit 一致的冒号前缀授权：`users:*` 匹配 `users:read`，不匹配 `users2:read` 或点号权限。
- handler 抛出的未处理异常统一转成 INTERNAL_ERROR HaiResult；预期业务失败仍应直接返回 `err(...)`。
- 路径、input、output 从 contract 推导；重复或未知路径会被拒绝，未实现完整 contract 时不能调用 `.build()`。

边界约束：

- `src/pipelines/*` 是 `@h-ai/serv` 的内部默认实现目录，不作为公开子路径 API 承诺
- 对应用层公开的稳定入口仍然是根入口 `@h-ai/serv`
- `securityHeaders` / `buildHaiErrorBody` 等内部 helper/middleware 不作为单独子路径文档暴露

### httpOnly Cookie 认证（推荐生产方案）

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

> 刷新 Cookie 带有 `HttpOnly` 和 `SameSite=Strict`，路径限制为 `{apiPrefix}/auth/refresh`。生产默认还会设置 `Secure`。

刷新失败时，如果状态码为 5xx 或服务端无法识别状态码，客户端只收到可公开的提示和 `traceId`。实际错误原因写入服务端日志。只有 401 认证失效会清除刷新 Cookie；限流和后端故障保留凭据，允许稍后重试。自动审计使用同一归一化状态记录失败。

### API 概览

- `serv.createApp(options)`：创建 HTTP App 抽象，挂载自定义 `middlewares`、健康检查、OpenAPI handler 与可选文档
- `serv.parseRequestContext({ request })`：默认上下文解析（提取 Bearer token + requestId，不填充 session）
- `serv.listen(app, options)`：在 Node.js 启动 HTTP 服务，返回 `{ server, address, close }`
  返回句柄的 `close()` 可重复调用：停止接入并关闭 Audio WebSocket，1 秒后强制终止未配合的音频连接，随后等待 HTTP 关闭。主动关闭也移除进程信号监听器；应用仍需按依赖顺序关闭自己初始化的业务模块。
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

### 每次请求的访问控制

路径规则可设置 `encryption: required` 或 `disabled`，省略时使用应用的传输加密设置。disabled 接口接收普通 HTTPS 数据，仍检查 IP、时段和认证；带框架加密信封的请求返回 400。required 优先于应用的 `excludePaths`，如果未启用传输加密，`serv.createApp()` 会拒绝创建应用。重叠路径和方法的相反模式在装配时失败；不自动降级或按声明顺序覆盖。

`http.access` 默认 `false`。需要仅限制对外接口时，在 `_serv.yml` 配置 `http.access.rules`，例如 `{ id: 'external', paths: ['/api/v1/external/**'], allowIps: ['192.0.2.0/24'] }`；`http.access.global` 则约束该 HTTP 应用处理的全部请求，包含健康检查。全局与所有匹配规则同时生效，时间窗口默认 UTC，空列表不限对应维度。已有会话也会在每次请求时重新检查；IAM `loginAccess` 只负责登录。

较大策略使用 `http.access: { file: './config/security/request-access.yml' }`。文件按服务工作目录解析，仅在创建 App 时读取，最大 1 MiB；无效配置阻止启动，修改后重新创建 App。拒绝返回 HTTP 403、`hai:common:104`，启用 transport 的普通请求保留加密响应。日志用规则 ID、拒绝原因和请求编号定位，不记录策略正文。

`http.trustedProxies` 默认 `auto`：未配置托管代理的应用默认不使用转发头；受管 Compose 的私有代理拓扑才自动采用容器网段。自管代理指定真实 IP/CIDR，`[]` 显式关闭。代理必须清洗转发头，Node 监听器或 Fetch 平台必须提供可信对端元数据。独立文件、外层代理和部署回滚步骤见[请求访问控制手册](../configuration/request-access.md)。

### 配置驱动认证页面

服务端可在认证配置中提供用户协议和隐私政策的 Markdown 正文或 URL。如果正文和 URL 同时存在，登录页面的弹窗优先显示经过安全处理的 Markdown。

`createIamProcedures({ iam })` 直接实现公开配置、密码/LDAP/OTP、注册与密码重置，无需应用复制 procedure。LDAP 登录沿用现有浏览器 httpOnly refresh Cookie 和可信原生 Token 传输。管理端创建调用 iam.user.createUser，自助注册关闭时管理功能仍可用；授权仍由既有 permission guard 执行。

[IAM 配置清单](../configuration/iam.md)

### 请求语言隔离

多位用户的请求可能同时在一个 Node.js 进程里执行。用 `core.i18n.runWithLocale(locale, () => handleRequest())` 为本次请求和它启动的异步工作设定语言。SvelteKit 可以用 `kit.i18n.runWithLocale(locale, () => resolve(event))`，Serv 会按请求头自动设定。翻译优先使用显式传入的 `MessageOptions.locale`，其次使用本次请求的语言，最后使用进程启动时的默认语言。

设定请求语言后，`setGlobalLocale()` 只改本次请求。启动时在请求之外调用它，可设置进程默认语言。服务端渲染时，UI 的语言状态对象只更新自己，翻译读取本次请求的语言。浏览器中从 `@h-ai/ui/i18n` 导入 `createLocaleStore()` 管理当前页面语言，或在翻译时直接传入 `locale`。

### 输入约束与 HTTP 能力

对象键、上传能力、批量删除及预签名地址的共同规则见[存储 API 能力](./storage.md#存储输入约束与跨端能力)。

### 可选的反馈服务与可信范围

通过 `@h-ai/serv/features/feedback` 的 `createFeedbackProcedures` 挂载 `apiContract.feedback`；只导入运行时根入口不会加载反馈服务。应用启动时先初始化 RelDB 和私有 Storage。使用 Reach 投递通知时，还应在 Feedback 之前初始化 Reach。收到请求后，从已验证会话和部署配置确定该用户可访问的反馈范围。resolveContext 返回 null 或用户不匹配时拒绝访问；领域模块再次校验范围与权限。

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
  createContext: async input => ({
    ...await authenticate(input),
    scopeId: 'configured-product'
  }),
})
```

### 可选交互挑战

标准 IAM procedure 包含 POST /auth/captcha，输入 operation，返回可公开的 ALTCHA 挑战。开启 IAM captcha 时密码/OTP/LDAP、注册、通知请求及匿名原密码续期均由 IAM 强制检查单用证明；请求映射保留 captcha，不依赖菜单或客户端判断。

何时要求验证、验证失败后如何处理，见 [IAM 配置](../configuration/iam.md)和 [IAM 功能说明](./iam.md)。

### 页面离开会话策略

`session.endOnPageHide` 默认关闭。开启后，在浏览器页面加载时调用 `actions.bindPageExit({ enabled: config.session.endOnPageHide })`，卸载时执行它返回的函数，移除监听器。标准 admin、H5 和 fullstack 模板已接好此步骤。这里的 `actions` 来自 `apiClient.createAuthActions(...)` 或 SvelteKit 的 `kit.client.createAuthActions(...)`。配置从登录页使用的公开认证接口读取。

浏览器触发 `pagehide` 时会尝试调用 `POST /auth/session/close`。这包括刷新或整页导航，但页面进入往返缓存（BFCache）时会跳过。请求沿用 CSRF 防护和已启用的传输加密，并使用 `keepalive` 争取在页面关闭后完成。该请求不会刷新会话，响应也不会清除 Cookie 或本地凭据，以免较早的请求清掉新的登录状态。

浏览器可能根本没有发出请求。服务端仍需用 `idleTimeout` 或 `absoluteTimeout` 限制会话寿命。用户主动退出时，应正常调用应用的 logout 接口，让服务端撤销凭据，并清除客户端保存的登录状态。

## 错误处理

普通 procedure 的认证、授权、业务失败和被捕获的 handler 异常都作为 `HaiResult` 输出，默认通过 HTTP 200 返回；`error.httpStatus` 是领域错误元数据，不会自动改写响应状态。客户端必须检查 `success` 与 `error.code`。例如未登录为 `error.httpStatus=401`，数据库查询失败或 INTERNAL_ERROR 为 500。

oRPC contract 输入校验在 procedure 之前失败时返回 HTTP 400，本地化失败体包含 `error.httpStatus=400` 和字段错误；procedure 内 `serv.validateInputOrFail` 返回的失败仍为 HTTP 200。HTTP middleware、refresh-cookie、OpenAPI 权限与 transport 协议错误另按自身契约返回真实 HTTP 状态。api-client 在真实 HTTP 401 或 HTTP 200 的有效失败 HaiResult（`success=false`、字符串 `error.code/message`、`error.httpStatus=401`）后自动刷新，成功后只重试一次；内置登录、注册和配置的刷新路径除外，403/500 不刷新。启用 transport 时刷新和重试复用加密链路。

- Default procedures 全部返回 `HaiResult<T>`，客户端直接判断 `result.success`
- 认证失败 → `HaiCommonError.UNAUTHORIZED`（由 `.auth()` 按 `context.locale` 本地化）
- 授权失败 → `HaiCommonError.FORBIDDEN`（由 `.permission()` / `.role()` 按 `context.locale` 本地化）
- 未捕获异常 → `HaiCommonError.INTERNAL_ERROR`（由 route 实现器统一兜底并按 `context.locale` 本地化）

正常业务请求建议按三层处理：

1. **oRPC contract 输入校验**：进入 procedure 前由 oRPC 执行；`serv.createApp()` 内部会自动拦截并把 Zod 默认英文错误重写为本地化 `errors[]`。
2. **procedure 内二次校验**：对数据库读回对象、跨字段约束等适合 Zod 表达的规则，使用 `serv.validateInputOrFail(zodSchema, input, context.locale)`；简单业务规则直接 `err(...)` 即可，不必为了统一额外造 schema。
3. **业务/领域错误**：不要 throw 预期业务失败；直接返回 `err(...)`，并在**创建错误消息的那一层**使用对应模块的 i18n getter，例如 `serv.m(..., { locale: context.locale })` 或 `widgetM(..., { locale: context.locale })`。

```ts
import type { ServContext } from '@h-ai/serv'
import { apiContract } from '@h-ai/api-contract'
import { err, HaiCommonError, ok } from '@h-ai/core'
import { serv } from '@h-ai/serv'
import { z } from 'zod'

const CreateWidgetSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(3),
})
const contract = {
  widgets: {
    create: apiContract.route({ method: 'POST', path: '/widgets' })
      .input(z.object({ title: z.string(), slug: z.string() }))
      .output(apiContract.haiResultSchema(CreateWidgetSchema)),
  },
}
const procedures = serv.implement(contract).context<ServContext>()
  .route('widgets.create')
  .permission('widgets.write')
  .handle(({ input, context }) => {
    const validated = serv.validateInputOrFail(CreateWidgetSchema, input, context.locale)
    if (!validated.success)
      return validated
    if (validated.data.slug === 'admin') {
      return err(HaiCommonError.FORBIDDEN, serv.m('serv_errorForbidden', { locale: context.locale }))
    }
    // 演示返回已验证的数据；真实应用在此调用 Widget 服务写入。
    return ok(validated.data)
  })
  .build()
```

> 下游 `HaiResult` 的 4xx 消息经脱敏后公开；5xx 和缺失或非法状态统一为安全内部错误，保留 traceId，完整原因只记录到服务端日志。`HaiError` 不携带 `messageKey/params`，领域消息的请求级 i18n 仍由创建消息的模块接收 locale 后完成。

### 错误提示与关联日志

原生 Audio WebSocket 同样使用安全错误边界：内部 Provider/SDK 错误与堆栈只进入脱敏日志，客户端收到稳定错误码、安全提示和 traceId。自定义跨域配置需保留敏感操作使用的 X-Hai-Reauthentication；默认 Serv/Kit 已允许。

HTTP 错误向浏览器返回当前语言的提示和追踪编号。编号既在响应的 `error.traceId`，也在 `X-Trace-Id` 响应头，等于本次请求的 `requestId`。用户可在 Toast 的排查信息中展开并复制编号，开发人员可用它查找前后端日志。异常详情、堆栈和操作信息去除凭据后写入服务端日志。字段校验仅返回字段名和可显示的错误提示。

服务端把错误发给浏览器之前，可用 `core.error.toPublic(error, traceId)` 去除内部信息。界面需要重新显示错误时，可用 `core.error.formatMessage(error)` 格式化提示，重复调用也只附一次追踪编号。

写服务端日志时传入完整的 Error 对象，保留堆栈和错误原因。数据库操作失败时，可按驱动错误码、表和列定位问题。日志不记录 SQL 原文、参数值或数据库凭据。

audit 已初始化时，procedure 自动绑定经过验证的身份、可信连接地址与请求/范围编号，业务 audit.log 继承此上下文。写操作及失败/拒绝记录 request.execute；契约校验、协议、中间件和缺失路由的 HTTP 拒绝记录 http.reject。入口只记录操作、方法、状态和原因码，不复制请求体、动态 URL、令牌或错误详情。capture.enabled 可关闭自动采集，capture.includeReads 可开启成功读取；显式业务 log 不受影响。业务语义仍须应用在完成/失败边界记录。
