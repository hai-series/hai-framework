# hai-serv — 详细用法

从 [SKILL.md](SKILL.md) 选择主题后读取对应小节。代码片段展示 API 用法；省略的业务变量、schema、依赖与 return 上下文需由应用补齐。

> `@h-ai/serv` 是 hai-framework 的 API Service 运行时，对外暴露最小 HTTP App 抽象，将 `@h-ai/api-contract` 的领域 contract 挂载成跨端可访问的 HTTP API；Hono 是内部实现细节，应用代码不要直接 import 或暴露 Hono。

命名空间的公开类型是根入口的 `ServFunctions`。上下文、工厂与泛型 contract 实现器均通过 `serv.xx` 使用；应用可导出方法或整个命名空间并生成声明，不要为类型推导改用私有构建路径或导入内部函数。

## 运行环境

> ⚠️ **服务端模块（Node.js 或满足同等 Node API 依赖的宿主）。** 浏览器端通过 `@h-ai/api-client` 调用由本模块暴露的 HTTP API。

> 生命周期说明：`@h-ai/serv` 是无状态 HTTP App 装配器，不提供 `init()` / `close()`；依赖模块（iam/storage/ai/crypto 等）由应用先初始化，并在 `serv.listen(..., { onClose })` 中反向释放。`serv.createApp()` 的启动期配置错误会 fail-fast 抛出。

返回的监听句柄允许立即 `close()` 取消未完成绑定，重复关闭复用结果；真实监听错误仍会拒绝。调用 `handle.close()` 不代替宿主的业务模块清理。

## 适用场景

- 将 `@h-ai/api-contract` contract 装配成最小 HTTP App 抽象
- 配置 `/health`、`/ready`、`/openapi.json`、`/docs` 等系统端点
- 在 procedure route 上添加 `.auth()`、`.permission()` 或 `.role()` guard
- 使用 Node listener，或在满足包 Node 依赖的宿主/测试中注入标准 fetch handler
- 自定义 `ServContext`（注入 session、tenant 等请求级数据）
- 生成 OpenAPI 3.1 文档供外部工具消费
- 通过 `config/_serv.yml` 管理 API 前缀、OpenAPI、docs、health 等 HTTP 挂载配置
- 通过 `serv.createRuntimeSecurityPolicy(...)` 对生产 CORS Origin、原生 WebView Origin、Secure Cookie 与 API 文档暴露执行 fail-closed 策略
- 启用传输加密：`serv.createApp({ transport: { crypto, serverKeyRing, keyStore } })`
- 高级场景通过 `createApp({ middlewares })` 自定义 HTTP middleware，通过 `createContext` 注入请求级业务字段
- 公开只读文件通过 `serv.storageAssets(...)` 统一处理安全 key、MIME 白名单、GET/HEAD、ETag 与缓存头
- 为 Audio WebSocket 配置一次性 ticket 校验、IAM/模型/配额授权与并发释放钩子

权限遵循 IAM/Kit 的精确值、全局 `*` 与冒号前缀 `users:*` 规则；声明多个权限时全部满足。返回的 listener `close()` 幂等并移除信号监听器，先关闭 Audio WebSocket，1 秒后终止未配合的音频连接；业务模块由宿主反序释放。

## 使用步骤

### 1. 安装依赖

```typescript
// @h-ai/serv 依赖 @h-ai/api-contract 提供 contract 定义
// 业务 procedure 依赖对应领域模块（iam/storage/ai）
```

### 2. 创建并启动 app

```typescript
import { ai } from '@h-ai/ai'
import { apiContract } from '@h-ai/api-contract'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { storage } from '@h-ai/storage'

// 组合三个内置领域，返回 HTTP 路由契约。
const contract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

// 装配 procedures（每个 feature 对应 contract 中的一个领域）
const procedures = {
  // 将已初始化 IAM 绑定到认证和管理过程，无权限的请求由过程拒绝。
  iam: serv.createIamProcedures({ iam }),
  // 将已初始化 storage 绑定到存储过程，拒绝任何不在当前用户键前缀下的请求。
  storage: serv.createStorageProcedures({
    storage,
    authorize: ({ context, keys }) => keys.every(key =>
      key.startsWith(`users/${encodeURIComponent(context.session.userId)}/`)),
  }),
  // 将已初始化 AI 服务绑定到匹配的 API 过程。
  ai: serv.createAiProcedures({ ai }),
}

// 创建 HTTP App 抽象；不要在应用导出类型里暴露 Hono
// 组装契约、过程和 IAM，挂载 /api/v1 及配置的文档和健康检查路径。
const app = serv.createApp({
  contract,
  procedures,
  iam,
  http: {
    apiPrefix: '/api/v1',
    openapi: { path: '/openapi.json' },
    docs: { path: '/docs' },
    health: { path: '/health', readyPath: '/ready' },
  },
})

// Node.js 启动（host/port 来自 _serv.yml 的 server；HOST/PORT 环境变量高于配置文件；onClose 自动监听 SIGINT/SIGTERM）
// 读取已加载的 Serv 监听配置。缺失时报错。
const { server } = core.config.getOrThrow<ServConfig>('serv')
// 用配置的地址与端口启动 HTTP 监听，关闭回调负责释放业务依赖。绑定失败时拒绝。
serv.listen(app, {
  host: server.host,
  port: server.port,
  // 监听成功后记录实际端口。
  onListening: info => logger.info('API service listening', { port: info.port }),
  onClose: closeApp, // 业务模块关闭函数（ai/storage/iam/reldb 等反向释放）
})
```

生产部署先从 `_core.yml.env` 与 `_serv.yml.cors` 创建安全策略；不要在业务应用重复实现 Origin 解析：

```typescript
// 按当前环境及配置的 Web 和原生来源生成安全策略，结果供 CORS、文档和 Cookie 使用。
const security = serv.createRuntimeSecurityPolicy({
  environment: coreConfig.env,
  corsOrigin: servConfig.cors.origin,
  nativeOrigins: servConfig.cors.nativeOrigins,
})

// 组装应用，按策略决定是否开放文档与是否设置安全刷新 Cookie。
const app = serv.createApp({
  contract,
  procedures,
  http: {
    ...servConfig.http,
    openapi: security.exposeApiDocs ? servConfig.http.openapi : false,
    docs: security.exposeApiDocs ? servConfig.http.docs : false,
  },
  iam,
  refreshCookie: { secure: security.secureRefreshCookie },
  middlewares: [{
    // 使用允许来源和配置的请求头、响应头生成 CORS 中间件，不匹配的来源不取得跨域授权。
    middleware: serv.cors({
      origin: security.allowOrigin,
      credentials: servConfig.cors.credentials,
      allowedHeaders: [...servConfig.cors.allowedHeaders],
      exposedHeaders: [...servConfig.cors.exposedHeaders],
    }),
  }],
})
```

- 生产环境 `cors.origin` 禁止为空或 `*`，启动时 fail-fast。
- 普通 Web Origin 仅接受 HTTP(S)；原生 Origin 通过 `cors.nativeOrigins` 显式允许 HTTP(S)、Capacitor 或 Tauri。
- Origin 按完整规范化值精确匹配，不使用前缀/后缀匹配。
- 生产环境默认给刷新 Cookie 加 `Secure`，并关闭 OpenAPI 和 docs。受控内网或 VPN 的 HTTP 入口可在后端进程设置 `HAI_SERV_REFRESH_COOKIE_SECURE=false`，重启并重新登录。HTTP 会明文传输刷新凭据，生产 CORS 仍须配置完整的实际 Origin。

### 2.1 Audio WebSocket 安全接入

```typescript
// 在已装配的 App 中挂载 AI 音频能力，使用应用提供的票据、授权与会话关闭回调。无效或未获授权的请求不能开启会话。
const app = serv.createApp({
  contract,
  procedures,
  iam,
  audio: {
    ai,
    verifyTicket: consumeAudioTicket, // 校验用途/时效并原子消费，返回 { session, grant? }（推荐 iam.ticket.consume）
    authorize: (session, request, grant) => authorizeAudioRequest(session, request, grant),
    onSessionEnd: (session, request) => releaseAudioConcurrency(session.userId, request.operation),
  },
})
```

- ticket 由已登录 HTTP 请求签发（推荐 `iam.ticket.issue`），短期有效且只能消费一次；连接建立即鉴权（独立预鉴权超时，默认 5s），未鉴权不处理任何业务帧；普通 IAM access token 禁止进入 WebSocket URL。
- `verifyTicket` 返回 `HaiResult<AudioTicketVerification>`（`{ session, grant? }`）；`grant` 承载票据绑定的操作/模型/会话，供 `authorize` 交叉校验 `start` 未越权。
- 每帧经运行时 Zod 校验并按严格状态机接受（识别只收音频、合成只收文本、`start`/`done` 各一次、`segmentId` 会话内唯一）；输入队列、消息积压、发送缓冲均有上限（`preAuthTimeoutMs`/`maxPendingMessages`/`maxSendBufferBytes` 等可调），超限或取消时以领域错误关闭并级联中止上游。
- `authorize` 返回的 `AuthorizedAudioRequest` 是唯一会传给 `ai.audio` 的模型、音色与格式配置；未提供时客户端的付费参数会被忽略（若票据 `grant.model` 存在则采用之）。
- IAM 权限、Persona、套餐配额和并发计数属于应用策略；框架提供校验与结束钩子，不硬编码业务权限名或存储。

### 3. 扩展应用自有 contract + procedures

先用 `apiContract.route(route)` 声明 HTTP 方法、业务路径和输入输出，再用 `apiContract.create(options)` 组合要挂载的领域。领域键用于代码访问，例如 `app.echo`，HTTP URL 来自显式声明的 `path` 和宿主的 `http.apiPrefix`。以下示例分开声明操作、绑定处理器和装配服务。契约入参见[声明单个操作](../hai-api-contract/reference.md#declare-routes)与[组合应用领域](../hai-api-contract/reference.md#compose-domains)。

```typescript
// apps/api-service-contract/src/app-contract.ts
import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'

// 定义名与版本组成的成功结果，以及标准失败输出。
const InfoOutput = apiContract.haiResultSchema(z.object({ name: z.string(), version: z.string() }))
const EchoInput = z.object({ message: z.string().min(1).max(2000) })
// 定义回显内容和已认证用户 ID 的成功结果。
const EchoOutput = apiContract.haiResultSchema(z.object({ message: z.string(), userId: z.string() }))

export const appContract = {
  // 描述 POST /app/info 的固定路由和操作 ID。
  info: apiContract.route({ method: 'POST', path: '/app/info', operationId: 'app.info', tags: ['app'] })
    // 将服务信息结果声明为该路由的输出。
    .output(InfoOutput),
  // 描述 POST /app/echo 的固定路由和操作 ID。
  echo: apiContract.route({ method: 'POST', path: '/app/echo', operationId: 'app.echo', tags: ['app'] })
    // 要求请求提供长度为 1 到 2000 的 message。
    .input(EchoInput)
    // 将回显结果声明为该路由的输出。
    .output(EchoOutput),
}
```

```typescript
// src/server/procedures/app-procedures.ts

import { appContract } from '@h-ai/api-service-contract'
import { core } from '@h-ai/core'
import { type ServContext, serv } from '@h-ai/serv'

export function createAppProcedures(deps: { name: string, version: string }) {
  return serv
    // 为传入的应用契约创建过程构造器。
    .implement(appContract)
    // 指定处理器使用 ServContext。
    .context<ServContext>()
    // 公开 procedure：route 名只出现一次，handler 直接返回 HaiResult。
    // 将 info 绑定到成功结果，数据取应用提供的名称和版本。
    .route('info', () => core.ok({ name: deps.name, version: deps.version }))
    // 鉴权 procedure：guard 通过后 context.session 自动收窄为非空。
    // 选中 echo 过程以绑定后面的守卫和回调。
    .route('echo')
    // 要求会话存在，认证失败时不运行回显回调。
    .auth()
    // 为当前请求回显已校验的消息，并将会话用户 ID 写入成功结果。
    .handle(({ input, context }) => core.ok({
      message: input.message,
      userId: context.session.userId,
    }))
    // 完成过程映射供 createApp 注册。
    .build()
}
```

把自有 contract / procedures 与框架的 iam/storage/ai 平铺合并：

```typescript
// 组合三个内置领域及自定义 app 契约，获取完整路由契约。
const contract = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  ai: apiContract.ai,
  app: appContract, // ← 自有契约
})

const procedures = {
  // 用已初始化的 IAM 创建对应的过程实现。
  iam: serv.createIamProcedures({ iam }),
  // 用已初始化的存储创建过程实现，传入的授权回调拒绝跨用户键。
  storage: serv.createStorageProcedures({
    storage,
    authorize: ({ context, keys }) => keys.every(key =>
      key.startsWith(`users/${encodeURIComponent(context.session.userId)}/`)),
  }),
  // 用已初始化的 AI 服务创建请求处理器。
  ai: serv.createAiProcedures({ ai }),
  app: createAppProcedures({ name: 'demo', version: '1.0.0' }),
}

// 将契约、过程及传入 HTTP/IAM 设置装配为 HTTP App。
const app = serv.createApp({ contract, procedures, http, iam })
```

注意要点：

- **无 input 的 POST 过程**：业务层无需 input，但 transport 仍发送空明文的认证封装。GET/HEAD 使用 X-Hai-Transport 头；空请求与响应不存在未认证旁路。
- **认证授权写在 route 链上**：公开过程使用 `.route(path, handler)`；需要认证时使用 `.route(path).auth().handle(handler)`。
- **客户端导入相同 contract**：把服务端与客户端共享的 contract 独立成 package（如 `@h-ai/api-service-contract`），禁止从 app 源码目录跨应用 import。

### 5. 标准 fetch 签名适配

toFetch 只适配调用签名；包根仍静态依赖 Node API，未经实际验证不能据此宣称 Workers/Deno/纯边缘部署兼容。

```typescript
import { serv } from '@h-ai/serv'

// toFetch 返回标准 Fetch handler
// 将已有 Serv App 转成宿主可直接调用的标准 Fetch 处理器。
const handler = serv.toFetch(app)

export default { fetch: handler }
```

### 6. 通过 `config/_serv.yml` 管理 HTTP 配置

`@h-ai/serv` 不自己扫描 YAML；推荐由 `@h-ai/core` 统一加载，再用 `ServConfigSchema` 校验：

```typescript
import { core } from '@h-ai/core'
import { ServConfigSchema, serv } from '@h-ai/serv'

// 启动时读取 ./config，并按 ServConfigSchema 注册和校验 serv 配置。
core.init({ configDir: './config', configSchemas: { serv: ServConfigSchema } })

// 按同一 Schema 验证已读取的 Serv 配置。失败时抛出返回的错误。
const validation = core.config.validate('serv', ServConfigSchema)
if (!validation.success)
  throw new Error(validation.error.message)

// 获取已校验的 Serv 配置。配置缺失时抛异常。
const servConfig = core.config.getOrThrow<import('@h-ai/serv').ServConfig>('serv')

// 用已加载的 HTTP 和传输设置构建应用，transport 为 false 时跳过传输初始化。
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

```yaml
# config/_serv.yml
server:
  host: 127.0.0.1
  port: 3000

http:
  trustedProxies: auto # 普通宿主忽略转发头，受管私有 Compose 自动采用容器网段
  access: false # 按路径/IP/时间限制见 hai-core/request-access.md
  apiPrefix: /api/v1
  openapi:
    path: /openapi.json
  docs:
    path: /docs
  health:
    path: /health
    readyPath: /ready

transport:
  keyExchangePath: /_hai/key-exchange
  excludePaths:
    - /health
    - /ready
    - /openapi.json
    - /docs
    - /_hai/scalar.js
```

认证协议仅支持 v2：独立随机 SM4-CBC 密钥和 HMAC-SM3 密钥由 SM2 封装，先验签、再验证 MAC，最后解密 CBC。请求由客户端私钥签名，响应由所选服务端版本签名。认证字段包括 version、direction、serverKeyId、clientId、128 位随机 requestId（兼 nonce）、issuedAt、HTTP method、pathname + 原始 search 的 SM3 pathHash，以及响应 status。请求默认有效期为 5 分钟，客户端时间最多可领先服务器 30 秒。服务端可用 `maxRequestAgeSeconds`（1～3600）和 `maxFutureSkewSeconds`（0～1800）调整，单位为整数秒。共享 registry 原子消费 (clientId, requestId)，nonce 保留到 issuedAt + 61 分钟，写入后最长保留 91 分钟，覆盖最长可配窗口及节点时钟差，存储故障拒绝请求。Redis 必须保留有效 nonce，使用 noeviction/可靠持久化策略；各节点时钟须同步。此能力防止同一传输消息重放，业务重试仍需自己的幂等键。

在 `_serv.yml` 的 `transport` 块配置时间窗口，将字段传给服务端 transport 装配。校时提示与 `TransportTimeError.serverTime` 见 [Crypto 参考](../hai-crypto/reference.md)。

空 POST 也发送空明文的认证封装；GET/HEAD 将封装放在 X-Hai-Transport 头，204/205/304/HEAD 等无正文响应也使用同名头承载认证封装。其它请求/响应在 JSON 正文承载封装并带 X-Encrypted: true。客户端必须关联原请求上下文和 HTTP status，缺标记、旧格式或认证失败一律 reject；明文接口由 Serv/Kit 路径规则 `encryption: disabled` 或宿主 `excludePaths` 显式允许；调用方同步选择普通请求，API Client/Kit 包装器使用自己的 `excludePaths`。CORS 须允许并暴露 X-Hai-Transport。握手公钥的真实性依赖 TLS，不替代 IAM 业务授权。

## 核心 API

### `serv.createApp(options)` — 创建 HTTP App 抽象

```ts

import { apiContract } from '@h-ai/api-contract'
import { type CreateServAppOptions, type ServContext, serv } from '@h-ai/serv'

// 最小服务使用默认健康检查；业务路由由真实 contract/procedures 扩展。
// 创建空的业务契约，用于只验证服务的基础入口。
const contract = apiContract.create({})
// 用 ServContext 组装该空契约的过程映射。
const procedures = serv.implement(contract).context<ServContext>().build()
const options: CreateServAppOptions<typeof contract, typeof procedures> = {
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
}
// 使用前面准备的选项组装 App，API 前缀为 /api/v1。
const app = serv.createApp(options)
```

<a id="apicontractroute--servimplement--contract-与运行时分层"></a>

### `serv.implement(contract)` — 给已声明的操作绑定处理器

传入含 `preview` 操作的 `widgetContract`。该对象来自[共享契约示例](../hai-api-contract/reference.md#declare-routes)。`serv.implement(...).route('preview', handler)` 的参数是对象内的操作键；它绑定处理函数，业务 URL 仍由先前的 `apiContract.route({ method, path })` 声明。

```ts
import { core } from '@h-ai/core'
import { type ServContext, serv } from '@h-ai/serv'
import { widgetContract } from './widget-contract.js'

// 绑定 preview 操作。请求先经过契约输入校验，再返回规范化后的名称。
const widgets = serv.implement(widgetContract)
  .context<ServContext>()
  .route('preview', ({ input }) => core.ok({ name: input.name }))
  .build()
```

把 `widgets` 传给 `serv.createApp` 的 `procedures.widgets`，并在应用契约中使用同名领域键。若需要中间件或测试所用的请求路径，调用 `apiContract.pathOf(widgetContract.preview)` 读取已声明的单个操作，随后添加宿主前缀。

### 传输加密

serv 不暴露本地传输加密工厂；内部统一调用 `crypto.transport.createServer({ serverKeyRing, keyStore })`。客户端用 `@h-ai/api-client` 的 `transport` 配置自动协商。

业务容量统一配置 transport.maxPlaintextBytes：UTF-8 JSON 明文字节，默认 1 MiB，有效整数范围 1 KiB～64 MiB，请求和响应共用。客户端从握手获取服务端预算，可选本地上限取较小值；crypto.transport.resolveBodyLimits(limit, { requiredPlaintextBytes }) 合并模块需求：保留显式上限，不足时报配置冲突；省略时按需要推导，无模块需要仍为 1 MiB。Serv/Kit 的 auto 规范化为 undefined。密文预算为两倍明文加 32 KiB。握手 JSON 16 KiB、公钥 4 KiB、认证头 16 KiB、路径 8 KiB、认证及防重放保持独立。原流超限/取消立即停止、取消并释放 reader；请求 413、响应返回加密的 500 容量错误，客户端识别 TransportBodyTooLargeError / hai:crypto:070。 通过 _serv.yml 的 transport.maxPlaintextBytes 或对应 HAI_*_TRANSPORT_MAXPLAINTEXTBYTES 配置并转发到服务端 transport；重建正文保留 signal 并删除旧长度/编码头。

```typescript
import { crypto } from '@h-ai/crypto'
import { serv } from '@h-ai/serv'

// 初始化传输依赖的密码学功能。失败结果含错误，需在装配应用前检查。
await crypto.init()

// 用现有密钥环和已连接仓库为 /api/v1 装配服务端传输。
const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
  transport: {
    crypto,
    serverKeyRing,
    // keyExchangePath 默认 '/_hai/key-exchange'
    keyStore, // 已连接的基于 @h-ai/cache 的 Redis registry。
  },
})
```

客户端：

```typescript
// 使用指定 HTTPS 地址和 crypto 传输配置初始化客户端。初始化失败返回结构化错误。
await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  transport: { crypto },
})
```

若服务端通过 `config/_serv.yml` 自定义了 `transport.keyExchangePath`，客户端也必须传入同一路径：

```typescript
// 初始化 HTTPS 客户端，并用显式协商路径覆盖默认路径。配置失败返回错误。
await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  transport: {
    crypto,
    keyExchangePath: '/custom/key-exchange',
  },
})
```

> 不要导入或暴露子目录内部 transport 工厂；公共装配点只有 `serv.createApp({ transport: { crypto, serverKeyRing, keyStore } })`。

启用 transport 必须显式注入 `serverKeyRing` 与 `keyStore`；多节点使用相同受管 ring 和基于 @h-ai/cache 的 Redis registry，仅共享客户端公钥不足以跨节点解密。通过根入口 `crypto.transport.parseServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)` 解析并检查 HaiResult，私钥不放 `_serv.yml`、PUBLIC_/VITE_、日志或响应。请求带协商 serverKeyId，未知/撤销 ID 拒绝。轮换先分发新旧 ring，再切 activeKeyId 并滚动重建；删除旧版本后客户端须 destroy 并重协商，不自动重放非幂等业务。开发和测试显式 `crypto.transport.createKeyStore({ cache })`（cache 显式使用 memory）。无需 sticky session，详见 hai-crypto 的密钥轮换说明。

**上下文工厂优先级**（`context.session` 填充来源）：

1. 显式 `createContext`（高级场景：多租户、额外字段）
2. `verifyToken`（逃脱口：使用非 @h-ai/iam 的认证服务）
3. `iam.auth.verifyToken`（推荐：传入 `iam` 后自动启用）
4. 默认 `parseRequestContext`：仅解析请求元数据，`session` 为 `undefined`

> ⚠️ `verifyToken` 会在每次请求调用（不缓存）；verifyToken 失败或抛错统一收敛为 `session=undefined`，由 route 的 `.auth()` / `.permission()` / `.role()` 返回失败 HaiResult，`error.httpStatus=401`；普通 procedure 的 HTTP 响应默认仍为 200。

### 链式 procedure guard

| 链式调用                                             | 说明                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `.route(path, handler)`                              | 注册公开 procedure；path/input/output 从 contract 推导                                   |
| `.route(path).auth().handle(handler)`                | 要求 session；通过后 `context.session` 自动收窄                                          |
| `.permission(permission)`                            | 隐含认证并检查权限，支持 `serv.WILDCARD_PERMISSION`                                      |
| `.role(role)`                                        | 隐含认证并检查角色，支持 `serv.WILDCARD_ROLE`                                            |
| `.build()`                                           | contract 全部 procedures 实现后构建 router                                               |
| `serv.validateInputOrFail(zodSchema, input, locale)` | 在 procedure 内执行 Zod 二次校验，失败时返回本地化 `HaiResult` + `ValidationFormError[]` |
| `serv.resolveRequestLocale(headers)`                 | 从 `x-hai-locale` / `Accept-Language` 解析并规范化 locale                                |
| `serv.m(key, { locale, params })`                    | 读取 serv 自身 i18n 消息（请求级本地化）                                                 |

```typescript
import { serv } from '@h-ai/serv'

const procedures = serv
  // 为应用契约开始构造过程映射。
  .implement(appContract)
  // 指定处理器的请求上下文类型。
  .context<ServContext>()
  // 将 info 路由绑定到应用提供的处理器。
  .route('info', infoHandler)
  // 选中更新用户过程，为其定义守卫和处理器。
  .route('users.update')
  // 要求 user.write 权限，缺少权限时拒绝调用。
  .permission('user.write')
  // 同时要求 admin 角色。
  .role('admin')
  // 认证授权通过后将请求交给用户更新处理器。
  .handle(updateUserHandler)
  // 构造可注册的过程映射。
  .build()
```

- `.permission()` / `.role()` 隐含 `.auth()`；未登录返回 `error.httpStatus=401` 的失败 HaiResult，授权不足为 403。普通 procedure 的 HTTP 响应默认仍为 200，必须检查 `success` 与 `error.code`。
- 同一路由声明多个 permission/role 时必须全部满足。
- handler 的未处理异常由 router 统一转换成 INTERNAL_ERROR HaiResult。
- 重复/未知路径会被拒绝；遗漏 contract procedure 时 `.build()` 在类型上不可用，运行时也会校验。

### 高级：自定义 pipeline（HTTP middleware + context + route guard）

`@h-ai/serv` 的 pipeline 分三层：

1. **HTTP middleware 层**：通过 `serv.createApp({ middlewares })` 注入 HTTP middleware
2. **context 层**：通过 `verifyToken` / `createContext` / `serv.buildAuthContextFactory()` 自定义请求上下文
3. **route guard 层**：通过 `.auth()` / `.permission()` / `.role()` 声明认证授权

#### HTTP middleware

适用于请求日志、trace、限流、CORS、租户头校验等 **HTTP 层** 横切逻辑，也可挂载不适合进入 JSON/oRPC contract 的 WebSocket、文件和二进制端点。常见 CORS 场景可直接复用 `serv.cors(...)`：

```typescript

import { type ServMiddleware, serv } from '@h-ai/serv'

const requestMetrics: ServMiddleware = async (c, next) => {
  const startedAt = Date.now()
  await next()
  c.header('x-response-time-ms', String(Date.now() - startedAt))
}

// 使用下面的 CORS、租户检查和静态资产中间设置组装 API App。
const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
  middlewares: [
    {
      // 为匹配的指定来源允许凭据，公开列出的传输和跟踪响应头。
      middleware: serv.cors({
        origin: origin => origin === 'https://app.example.com',
        credentials: true,
        exposedHeaders: ['X-Encrypted', 'X-Hai-Transport', 'X-Request-Id'],
      }),
    },
    { middleware: requestMetrics },
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
      // 从提供的存储实例读 /assets/ 的公开 PNG。路径或内容类型不在白名单中时拒绝。
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

执行顺序为：`securityHeaders` → 内置 CORS 响应包装/握手和预检策略 → `transport`（若启用）/请求策略 → 普通 `middlewares` → health/refresh-cookie/OpenAPI/docs/oRPC routes。

- 普通 `middlewares` 在解密和策略之后执行，提前响应仍受访问策略和响应加密约束。二进制端点显式加入 transport.excludePaths；内置 CORS 预检和密钥交换也执行策略。
- 公开只读文件优先使用 `serv.storageAssets(...)`；应用仍须显式提供 key/MIME 白名单、缓存与跨域策略，框架不内置头像等业务概念。
- 资源 GET 使用同一次读取中的 MIME、ETag 和正文，HEAD 只读元数据。需要定制 Storage 适配器时，提供 `file.head()` 和 `file.getStreamWithMetadata()`。
- 私有资源、Range 下载或动态授权继续使用自定义 middleware/procedure。
- 若需要读取解密后的业务 body，请改用 context / procedure 层扩展。
- 浏览器若需读取自定义响应头（例如 transport 的 `X-Encrypted` 和 `X-Hai-Transport`），记得通过 `serv.cors({ exposedHeaders: [...] })` 显式暴露。

#### Context pipeline

如果想复用“Bearer token → session”这段逻辑，再追加租户/工作区等字段，优先：

```typescript
// 以 IAM 验证函数构造基础上下文工厂，合法凭据产生会话。
const baseContext = serv.buildAuthContextFactory(token => iam.auth.verifyToken(token))

// 组装应用，让自定义上下文在基础认证结果上补充租户字段。
const app = serv.createApp({
  contract,
  procedures,
  createContext: async (input) => {
    // 对当前请求执行基础上下文工厂，得到会话及请求元数据。
    const context = await baseContext(input)
    return {
      ...context,
      tenantId: input.request.headers.get('x-tenant-id') ?? null,
    }
  },
})
```

选择建议：

- 只换 token 校验实现：`verifyToken`
- 在默认认证上下文之上追加字段：`buildAuthContextFactory(...) + createContext`
- 完全接管上下文构造：`createContext`

#### Route guard

认证、权限与角色约束直接写在目标 route 上，不嵌套高阶 handler：

```typescript
const procedures = serv
  // 按 Widget 契约构造过程映射。
  .implement(widgetContract)
  // 将处理器上下文定义为 ServContext。
  .context<ServContext>()
  // 将列表过程绑定到应用的查询服务，传递契约验证后的输入。
  .route('widgets.list', ({ input }) => widgetService.list(input))
  // 选中创建 Widget 过程。
  .route('widgets.create')
  // 只允许具有 widgets.write 的调用者进入创建处理器。
  .permission('widgets.write')
  // 将已认证用户及输入交给应用创建服务。
  .handle(({ input, context }) =>
    widgetService.create(context.session.userId, input))
  // 完成过程映射并返回。
  .build()
```

HTTP 审计、限流、CORS、租户头校验等跨 route 能力继续放在
`createApp({ middlewares })`；请求级业务字段通过 `createContext` 注入。
不要为认证授权重新嵌套多层高阶 handler。

### 正常业务请求中的错误与 i18n

先区分 HTTP 状态与 HaiResult 中的 `error.httpStatus`；普通 procedure 返回的领域错误元数据不会自动改写 HTTP 状态，当前默认装配如下（显式自定义响应状态或 middleware 按实际入口契约验证）：

| 失败来源                                           | HTTP 响应 | 结果判定                                                                  |
| -------------------------------------------------- | --------- | ------------------------------------------------------------------------- |
| procedure `.auth()` / `.permission()` / `.role()`  | 200       | `success=false`；`error.httpStatus` 为 401 / 403                          |
| handler 返回 `core.err(...)` 或下游模块失败 HaiResult   | 200       | 检查 `success`、`error.code`，例如数据库查询错误的 `error.httpStatus=500` |
| handler 未处理异常被 route 实现器捕获              | 200       | INTERNAL_ERROR 失败 HaiResult，`error.httpStatus=500`                     |
| oRPC contract 输入 schema 校验失败（handler 之前） | 400       | 本地化失败体，`error.httpStatus=400` 与字段错误                           |
| handler 内 `serv.validateInputOrFail(...)` 失败    | 200       | 失败 HaiResult，`error.httpStatus=400` 与字段错误                         |

HTTP middleware、自定义 Response、refresh-cookie、OpenAPI 入口权限和 transport 协议错误分别按自身响应契约处理，可返回真实 HTTP 4xx/5xx。`@h-ai/api-client` 在真实 HTTP 401 或 HTTP 200 的有效失败 HaiResult（`success=false`、字符串 `error.code/message`、`error.httpStatus=401`）后自动刷新，成功后只重试一次；内置登录、注册和配置的刷新路径除外，403/500 不刷新。启用 transport 时刷新和重试复用加密链路，不能手写明文刷新请求。

SvelteKit 的 `kit.response.fromError` 根据归一化后的 `error.httpStatus` 生成 HTTP Response；`kit.response.fromResult` 优先使用显式错误码映射，再使用错误自身的 `httpStatus`，缺失或非法状态统一为 500。这些响应转换规则不能套用到 serv 普通 procedure。

按三层处理：

1. **oRPC contract 输入校验**：进入 handler 前自动发生；`serv.createApp()` 会把默认英文 Zod 错误改写为本地化 `errors[]`。
2. **handler 内二次校验**：对跨字段规则、数据库回读对象等适合 Zod 表达的场景，使用 `serv.validateInputOrFail(zodSchema, input, context.locale)`；简单业务规则直接 `core.err(...)` 即可。
3. **业务/领域错误**：不要 throw 预期失败；直接返回 `core.err(...)`，并在**创建错误消息的那一层**用对应模块的 i18n getter 按 `context.locale` 出消息。

```typescript
import { serv } from '@h-ai/serv'
import { z } from 'zod'

const Schema = z.object({ title: z.string().min(1) })

const procedures = serv
  // 为 Widget 契约建立过程构造器。
  .implement(widgetContract)
  // 让处理器访问 ServContext 的会话与语言。
  .context<ServContext>()
  // 选中创建过程。
  .route('widgets.create')
  // 先要求有效会话，未登录时拒绝继续。
  .auth()
  // 为通过认证的请求绑定下方创建逻辑。
  .handle(({ input, context }) => {
    // 按 Schema 和当前请求语言校验输入。失败直接返回错误，成功传递已校验的数据。
    const validated = serv.validateInputOrFail(Schema, input, context.locale)
    if (!validated.success)
      return validated

    return widgetService.create(context.session.userId, validated.data)
  })
  // 完成过程映射供服务使用。
  .build()
```

> 下游 4xx 消息经脱敏后公开，5xx 和缺失或非法状态使用安全内部错误与 traceId，完整原因只记录服务端日志。`HaiError` 不携带 `messageKey/params`，领域消息的请求级 i18n 仍在创建消息的模块/feature 中接收 locale 后完成。自动审计使用同一归一化状态，失败不能按非法原始状态记为成功。

### `serv.parseRequestContext` — 默认 Context 解析器

默认忽略转发头，缺少运行时对端时 IP 为 undefined。XFF 从右向左停在首个不可信地址，忽略左侧；可信链无效/过长时保留 IP 未知，不能回退为代理身份。Fetch 使用 `app.fetch(request, { remoteAddress: platformPeerAddress })`，对端必须来自可信平台 API。自定义 context 传递完整 input，保留已解析的 ip。

从 HTTP 请求头自动解析：

| 字段          | 来源                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| `accessToken` | `Authorization: Bearer <token>`                                                                           |
| `requestId`   | `x-request-id` 或自动生成 UUID                                                                            |
| `ip`          | Node socket / Fetch 显式 remoteAddress；仅 http.trustedProxies 中的代理可提供 XFF（从右向左）或 X-Real-IP |
| `locale`      | `accept-language`                                                                                         |
| `userAgent`   | `user-agent`                                                                                              |

### `serv.generateSpec(contract, options)` — 生成 OpenAPI 文档

```typescript
// 使用给定契约、标题、版本和 API 前缀生成 OpenAPI 文档。
const spec = await serv.generateSpec(contract, {
  title: 'My API',
  version: '1.0.0',
  apiPrefix: '/api/v1',
  description: '接口说明',
})
// spec 为 OpenAPI 3.1 Document 对象
```

## HTTP 配置（`ServHttpConfigInput`）

| 字段        | 默认值                                     | 说明                                                                                                   |
| ----------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `apiPrefix` | `'/api/v1'`                                | oRPC OpenAPI handler 挂载前缀                                                                          |
| `health`    | `{ path: '/health', readyPath: '/ready' }` | 健康与就绪检查端点                                                                                     |
| `openapi`   | `false`                                    | OpenAPI JSON endpoint，显式开启                                                                        |
| `docs`      | `false`                                    | Scalar 文档页，显式开启；在文档目录下挂载 `_hai/scalar.js`，页面使用相对脚本和 spec 地址；认证仍在后端执行 |
| `transport` | `undefined`                                | 顶层配置；启用后默认挂载 `{apiPrefix}/_hai/key-exchange`                                               |

```ts
import type { ServHttpConfigInput } from '@h-ai/serv'

const http: ServHttpConfigInput = {
  apiPrefix: '/api/v1',
  openapi: { path: '/openapi.json' },
  docs: { path: '/docs' },
  health: { path: '/health', readyPath: '/ready' },
}
```

## Feature Procedures（默认实现）

`serv.implement(...).context().route(...).build()` 同步返回普通 router。预置工厂返回的 procedures 也可按嵌套属性选取。挂载 contract 只包含实际选用的路由；不要为复用当前用户或刷新功能而同时开放注册、OTP 或通用管理入口。

从 `@h-ai/serv` 导入一次 `serv`，按需调用以下工厂。

| 工厂函数 | 所需依赖 |
| --- | --- |
| `serv.createIamProcedures({ iam })` | 已初始化的 `iam` |
| `serv.createStorageProcedures({ storage, authorize })` | 已初始化的 `storage` 和资源授权策略 |
| `serv.createAiProcedures({ ai })` | 已初始化的 `ai` |
| `serv.createFeedbackProcedures({ feedback, resolveContext })` | 已初始化的 `feedback` 和可信范围解析函数 |

`authorize` 从可信 `context.session` 校验资源所有者/租户，不能只信任客户端前缀；缺失策略时默认拒绝。列表会把 prefix 交给策略，空 prefix 不应获准全桶列举；批量全部授权后才执行。示例用户根为 `users/<编码后的 userId>/`，管理员跨用户访问必须显式授权。

AI 默认 feature 把 objectId 绑定到可信 `context.session.userId`，客户端可省略；所有读写与记忆查询都使用授权后的主体。sessionId 与 objectId 组成复合会话，写入默认 sessionId 为 `default`。其它 objectId 默认被拒绝；跨用户管理需显式提供 `authorizeObject({ context, objectId, sessionId, operation })`，按可信权限及租户关系严格返回 true。

`chats.createCompletion` 只提供非流式 JSON 输出，stream 字段无论 true/false 都在 procedure 前以 HTTP 400 拒绝。完整 function tools（嵌套 JSON Schema/strict）、tool_choice（auto/none/required/已定义函数名）和角色消息直接传给模型，不自动执行工具。工具结果必填 tool_call_id，不能把未知字段静默裁剪为看似成功。流式调用使用应用自己的 endpoint 与 ai.llm.chatStream 输出契约。

```typescript
// 用初始化后的 AI 实例创建处理器。对象级操作还须通过本例中的 ai.manage 授权。
const aiProcedures = serv.createAiProcedures({
  ai,
  authorizeObject: ({ context }) => context.session.permissions.includes('ai.manage'),
})
```

### 文件与事件流端点

内置扩展工厂是 `serv.createAiExtensionProcedures`、`serv.createIamExtensionProcedures`、`serv.createStorageExtensionProcedures`、`serv.createAuditProcedures` 和 `serv.createPaymentExtensionProcedures`。将选择的 procedures 和 `apiContract.extensions` 中对应节点挂到相同路由树，并传入可信的业务鉴权回调。

自定义 multipart、文件和 SSE 端点通过 `route(...).auth().handleTransport(handler)` 实现。每项 `serv.createApp({ transportRoutes })` 包含 `procedure`（具体契约节点）和 `maxRequestBytes`（HTTP 请求体上限）。生产在 HTTPS 入口发布。若应用启用框架加密，为这些方法和路径显式配置 `encryption: 'disabled'`。其他 JSON 端点的加密策略继续由宿主配置。

## 常见模式

### 自定义领域 procedure

```typescript

import { type ServContext, serv } from '@h-ai/serv'
import { myContract } from './my-contract.js'

export function createMyProcedures() {
  return serv
    // 为自定义契约创建过程构造器。
    .implement(myContract)
    // 指定 ServContext 请求上下文。
    .context<ServContext>()
    // 选中 widget.list 过程。
    .route('widget.list')
    // 要求列表请求已登录，失败时拒绝。
    .auth()
    // 将已校验输入传给应用查询服务。
    .handle(({ input }) => widgetService.list(input))
    // 选中 widget.create 过程，重新配置其授权。
    .route('widget.create')
    // 要求 widget:write 权限，缺少时拒绝。
    .permission('widget:write')
    // 将已校验输入传给应用创建服务。
    .handle(({ input }) => widgetService.create(input))
    // 完成并返回过程映射。
    .build()
}
```

### 自定义 contract 组合

```typescript
import { apiContract } from '@h-ai/api-contract'
import { widgetContract } from './widget-contract.js'

// 组合内置 IAM 和应用 Widget 契约，供 App 挂载。
export const myAppContract = apiContract.create({
  iam: apiContract.iam,
  widget: widgetContract,
})

// 用组合契约、两组过程与 /api/v1 配置组装 HTTP App。
const app = serv.createApp({
  contract: myAppContract,
  procedures: {
    // 用已初始化的 IAM 服务组装域过程。
    iam: serv.createIamProcedures({ iam }),
    widget: createMyProcedures(),
  },
  // 应用从这个 IAM 服务派生请求认证上下文。
  iam,
  http: { apiPrefix: '/api/v1' },
})
```

## 错误码

route 实现器内置以下错误：

| 错误码                          | 触发条件                                                        |
| ------------------------------- | --------------------------------------------------------------- |
| `HaiCommonError.UNAUTHORIZED`   | `.auth()`：`context.session` 为空（无 token 或 token 校验失败） |
| `HaiCommonError.FORBIDDEN`      | `.permission()` / `.role()`：无对应权限或角色                   |
| `HaiCommonError.INTERNAL_ERROR` | route handler 抛出未处理异常                                    |

## httpOnly Cookie 认证

将 refresh token 存储在 `HttpOnly` cookie 中，避免 XSS 风险（浏览器 JS 无法读取）。

先区分两个 token：

- `accessToken`：短期凭证，客户端放在内存，通过 `Authorization: Bearer <token>` 发送；
  `serv.parseRequestContext()` / `extractBearerToken()` 解析、`buildAuthContextFactory()` 校验的就是它。
- `refreshToken`：长期凭证，启用 `refreshCookie` 后只保存在 httpOnly cookie；
  它不会走 `Authorization`，也不会被 `extractBearerToken()` 读取，只会在 `/auth/refresh` 被服务端取出。
  受信原生客户端可通过 `nativeTokenTransport` 改用 JSON body，但必须同时校验客户端标识与 Origin。

### 适用场景

- 浏览器端（Web / H5）使用 `@h-ai/api-client` 的 `apiClient.tokenStorage.httpOnlyCookie()`
- 对 refresh token 有更高安全要求，不希望存储在 localStorage

### 工作流程

1. 浏览器 POST `/auth/login` → serv 拦截 oRPC 成功响应 → `Set-Cookie: hai_refresh_token=...;HttpOnly;SameSite=Strict`，并从 JSON 响应体擦除 `refreshToken`
2. Access token 由客户端存内存（不持久化）
3. Access token 过期 → 客户端 POST `/auth/refresh`（浏览器自动携带 cookie）
4. serv 读取 cookie → 调用 `iam.session.refresh` → 返回新 access token + 更新 cookie（响应体不暴露 refresh token）
5. POST `/auth/logout` → serv 清除 cookie（`Max-Age=0`）

原生客户端匹配 `nativeTokenTransport.isRequest` 后，登录/注册/刷新响应保留轮换后的
`refreshToken`，刷新请求从 `{ refreshToken }` body 读取，且不读写浏览器 Cookie。

刷新失败经过同一公开错误投影，并记录英文关联日志；仅 401 认证失效会清除浏览器刷新 Cookie，限流、5xx 和缺失或非法状态保留凭据供稍后重试。未捕获的刷新异常返回安全的 HTTP 500 JSON，不公开内部 cause/ext。

若同时启用 `transport: { crypto, serverKeyRing, keyStore }`，`/auth/refresh` 也必须走加密链路；cookie-only 刷新请求允许空 body，服务端不要把 `Request.body === null` 误判为需要解密的请求体。

### 配置

```typescript
// 用已有契约、过程和 IAM 创建 HTTP App，按下方规则处理刷新凭据。
const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
  iam, // 顶层句柄：同时驱动 verifyToken 与 refresh
  refreshCookie: {
    // cookieName?: string              默认 'hai_refresh_token'
    // maxAge?: number                  默认 30 * 24 * 3600（30 天）
    // secure?: boolean                 显式值优先于后端变量 HAI_SERV_REFRESH_COOKIE_SECURE
    // onRefresh?: (token) => ...       可选：覆盖默认的 iam.session.refresh
    nativeTokenTransport: {
      // 必须 fail-closed：同时校验平台标识与允许的原生 Origin。
      isRequest: request =>
        request.headers.get('x-client-platform') === 'capacitor'
        // 验证请求来源属于允许的原生来源。缺失或不匹配时不启用原生令牌传输。
        && security.isNativeOrigin(request.headers.get('origin') ?? ''),
    },
  },
  // ✅ 顶层 iam 同时为 access token 校验提供默认实现，无需再传 verifyToken
})
```

> **逃脱口**：不使用 `@h-ai/iam` 时，可显式传入顶层 `verifyToken: token => myAuthService.verify(token)`。

### Cookie 规格

| 属性     | 值                                                   |
| -------- | ---------------------------------------------------- |
| Name     | `hai_refresh_token`（可配置）                        |
| Path     | `{apiPrefix}/auth/refresh`（最小范围）               |
| HttpOnly | ✓                                                    |
| SameSite | `Strict`                                             |
| Secure   | 显式 `secure` 优先，然后读取 `HAI_SERV_REFRESH_COOKIE_SECURE` 的 `true` 或 `false`，其余值按环境默认 |
| Max-Age  | 30 天（可配置）                                      |

直接调用 `serv.createApp` 时，环境默认根据 `NODE_ENV` 或 `HAI_CORE_ENV` 是否为 `production` 判断。通过 `serv.createRuntimeSecurityPolicy` 赋值时，策略的默认值来自传入的 `environment`。测试开关不参与该判断。

## 测试

```bash
pnpm --filter @h-ai/serv test
pnpm --filter @h-ai/serv typecheck
pnpm --filter @h-ai/serv lint
```

标准登出入口 `auth.logout` 从 input.accessToken 或 Authorization Bearer 取得要撤销的完整令牌，不要求 access 仍有效。它不接受 userId 授权或撤销目标；缺少令牌返回失败，未知令牌幂等成功。共享存储故障原样保留失败 HaiResult，Cookie middleware 只对成功结果清理 refresh Cookie。普通 procedure 继续使用既有 HTTP 200 / HaiResult 协议，客户端必须检查 success，不能只检查状态码。

声明 JSDoc 的公共例子只从实际根入口或 features 子路径导入，内部 Hono/guard/router/transport 例子标注“模块内部上下文”。应用使用所安装版本的公开类型，并通过本应用已有的类型检查验证使用示例。启动工厂可显式抛配置异常，领域 procedure 必须检查 HaiResult；HTTP middleware 与普通 procedure 的状态语义分别处理。监听句柄 close 返回 Promise<void>，并不提供 serv.init/close 或替宿主管理业务模块。默认 AI JSON procedure 不支持 stream。

toFetch 统一使用标准 Request(input, init)：Request 输入也应用 method/headers/body/signal 等覆盖；非法、已消费或锁定正文以 Promise 拒绝。取消在派发前阻止 handler，进行中终止响应等待并传递有效 request.signal；完成/失败/取消均移除 adapter 监听器，丢弃的迟到响应会取消其正文。取消不回滚外部效果，Response 交付后的流由应用自行监听 request.signal 清理。原 Request 可否继续使用其正文遵循标准 Request 的流所有权规则，不承诺重复消费正文。
