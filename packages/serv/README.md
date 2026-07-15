# @h-ai/serv

> hai-framework 的 API 服务运行时：对外暴露稳定的 HTTP App 抽象，把 `@h-ai/api-contract` 契约挂载为跨端可访问的 HTTP API；Hono 仅作为内部运行时实现。

## 能力概览

- 一行启动：`serv.createApp(...)` → `serv.listen(app, { port })`，应用代码不需要 import Hono
- 扁平 API（最小知识）：`serv.listen / serv.toFetch / serv.requireAuth / serv.requirePermission / serv.generateSpec / ...`
- 自定义 pipeline：`createApp({ middlewares })` 挂 HTTP middleware；procedure wrapper 复用根入口导出的共享类型
- 默认 feature procedures：`createIamProcedures()`、`createStorageProcedures()`、`createAiProcedures()`
- 内置安全响应头、健康检查、可选 OpenAPI JSON、可选 Scalar 文档页、可选内部 RPC endpoint
- 可选传输加密：`serv.createApp({ transport: { crypto } })` 自动挂载密钥协商与请求/响应加解密
- 可选语音入口：`serv.createApp({ audio: { ai, verifyTicket, authorize } })` 挂载统一语音 WebSocket；连接建立即用一次性 ticket 鉴权（返回 `{ session, grant? }`，独立预鉴权超时），每帧运行时 Zod 校验 + 严格状态机，输入/积压/发送缓冲背压与级联取消；授权回调负责服务端确认操作、模型、音色、配额与并发占用

> 生命周期说明：`@h-ai/serv` 本身是无状态 HTTP App 装配器，不需要 `init()` / `close()`；请在创建 app 前初始化 `iam` / `storage` / `ai` / `crypto` 等依赖，并在 `serv.listen(..., { onClose })` 中反向释放它们。`serv.createApp()` 遇到启动期配置错误（例如 transport manager 创建失败）会 fail-fast 抛出，便于进程启动阶段暴露问题。

## 快速开始

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
  storage: createStorageProcedures({ storage }),
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

// 4) 启动 Node 服务（读取 PORT / HOST 环境变量，onClose 自动处理 SIGINT/SIGTERM）
serv.listen(app, {
  onListening: info => logger.info('API service listening', { port: info.port }),
  onClose: closeApp,
})

// 5) 优雅关闭由 serv 托管，无需手动注册 process.once('SIGINT', ...)
```

### 容器对外暴露

默认 `host` 为 `127.0.0.1`（仅本机可达）。容器或需对外提供服务时显式指定：

```ts
serv.listen(app, { host: '0.0.0.0', onClose: closeApp })
```

### Fetch Runtime（Workers / Bun / Deno）

```ts
const handler = serv.toFetch(app)
export default { fetch: handler }
```

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
- 浏览器 `createAIClient({ audio: { url, getTicket } })` 只把一次性 `ticket` 放入 WebSocket URL；`getTicket(request)` 接收本次操作摘要（`operation` / `model`），可签发与本次操作严格绑定的票据；禁止传普通 IAM access token。

### 传输加密（与 `@h-ai/crypto` 统一）

serv 不暴露本地传输加密工厂；统一从 `crypto.transport` 创建服务端管理器。使用方只需传入顶层 `crypto` 句柄：

```ts
import { cache } from '@h-ai/cache'
import { createRedisTransportKeyStore, crypto } from '@h-ai/crypto'
import { serv } from '@h-ai/serv'

await crypto.init()
await cache.init({ type: 'redis', host: '127.0.0.1', port: 6379 })

const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
  transport: {
    crypto,
    // keyExchangePath 默认 '/_hai/key-exchange'，最终端点为 '/api/v1/_hai/key-exchange'
    // excludePaths: ['/health'],
    // maxClients: 10000,
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
  apiPrefix: /api/v1

transport:
  keyExchangePath: /_hai/key-exchange
  excludePaths:
    - /health
    - /ready
    - /openapi.json
    - /docs
    - /_hai/scalar.js
  maxClients: 10000
```

```ts
const servConfig = core.config.getOrThrow<import('@h-ai/serv').ServConfig>('serv')

const app = serv.createApp({
  contract,
  procedures,
  http: servConfig.http,
  transport: servConfig.transport === false
    ? undefined
    : {
        crypto,
        keyExchangePath: servConfig.transport.keyExchangePath,
        excludePaths: [...servConfig.transport.excludePaths],
        maxClients: servConfig.transport.maxClients,
      },
})
```

> **多节点部署提示**：传输加密的会话密钥默认保存在 **服务端进程内**，多副本部署时必须满足下列条件之一才能正常工作：
>
> - 在负载均衡层启用**会话粘性（sticky session）**，确保同一客户端命中同一节点；
> - 或为每个客户端在每个节点首次访问时分别完成一次密钥协商；
> - 或注入共享 `keyStore`（如 `createRedisTransportKeyStore()` / `createReldbTransportKeyStore()`）。
>
> `keyStore` 属于运行时对象依赖，不应写入 `config/_serv.yml`；配置文件仍只保存路径、白名单和容量等静态项。

> **安全策略**：启用 `transport` 后，除 `excludePaths` 与密钥协商端点外，业务请求必须携带有效 `X-Client-Id`。缺失或未知 clientId 会返回 400；响应体无法加密、非 JSON 业务响应或超过单次加密上限时返回错误，不会明文透传业务数据。

### Token 认证（`iam` / `refreshCookie`）

`serv.createApp` 推荐直接传入顶层 `iam` 句柄，自动派生两件事：

- **access token 校验**：每个请求调用 `iam.session.verifyToken` 填充 `context.session`（不缓存）。
- **refresh token 轮换**：启用 `refreshCookie` 后，自动使用 `iam.session.refresh` 作为 httpOnly cookie 刷新回调。

**上下文工厂优先级**：显式 `createContext` > `verifyToken` > `iam.session.verifyToken` > 默认仅解析元数据。

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
    const result = await iam.session.verifyToken(base.accessToken ?? '')
    return {
      ...base,
      session: result.success ? result.data : undefined,
      tenantId: request.headers.get('x-tenant') ?? null,
    }
  },
})
```

### 自定义 procedure（认证 + 权限）

```ts
const p = serv.implement(myContract).$context<ServContext>()

const updateProfile = p.users.update.handler(
  serv.requirePermission('users.write', async ({ input, context }) => {
    return await userService.update(input.id, input)
  }),
)
```

### 高级：自定义 pipeline（HTTP middleware + context + procedure wrapper）

`@h-ai/serv` 的“pipeline”分三层，分别对应三种扩展方式：

1. **HTTP middleware 层**：通过 `serv.createApp({ middlewares })` 注入 HTTP middleware。
2. **context 层**：通过 `verifyToken` / `createContext` / `serv.buildAuthContextFactory()` 定制请求上下文。
3. **procedure wrapper 层**：通过 `ServProcedureWrapper` / `ServGuardedProcedureWrapper` 组合认证、审计、租户校验等业务包装。

#### 1) 自定义 HTTP middleware

当你需要加请求日志、trace、限流、CORS、租户头校验等 **HTTP 层横切逻辑** 时，使用 `middlewares`。常见 CORS 场景可直接复用 `serv.cors(...)`：

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
- 由于 `middlewares` 先于 `transport` 执行，CORS 这类 preflight middleware 可以直接短路；若需要读取解密后的业务 body，请改用 context / procedure 层扩展
- 浏览器若需读取自定义响应头（例如 transport 的 `X-Encrypted`），请通过 `serv.cors({ exposedHeaders: [...] })` 显式暴露
- 这一层直接操作 HTTP middleware context，返回的是 **HTTP Response**，不是 `HaiResult`

#### 2) 自定义 context pipeline

如果你只想复用 `Bearer token -> session` 这一段逻辑，再额外补充租户、工作区、来源系统等字段，
优先用 `serv.buildAuthContextFactory()` 组装自定义 `createContext`：

```ts
const baseContext = serv.buildAuthContextFactory(token => iam.session.verifyToken(token))

const app = serv.createApp({
  contract,
  procedures,
  createContext: async ({ request }) => {
    const context = await baseContext({ request })
    return {
      ...context,
      tenantId: request.headers.get('x-tenant-id') ?? null,
    }
  },
})
```

什么时候用哪个：

- 只想换 token 校验实现：用 `verifyToken`
- 想在默认认证上下文之上追加字段：用 `buildAuthContextFactory(...) + createContext`
- 想完全接管上下文构造：直接用 `createContext`

#### 3) 自定义 procedure wrapper

当逻辑已经进入 oRPC procedure，需要统一做审计、租户约束、业务 guard 时，使用 procedure wrapper：

```ts
import type { ServGuardedProcedureWrapper, ServProcedureWrapper } from '@h-ai/serv'
import { err, HaiCommonError } from '@h-ai/core'
import { serv } from '@h-ai/serv'

const withAudit: ServProcedureWrapper = handler => async (options) => {
  options.context.logger.info('procedure.start', { requestId: options.context.requestId })
  return await handler(options)
}

const requireTenant: ServGuardedProcedureWrapper<string> = (tenantId, handler) => async (options) => {
  if (options.context.request.headers.get('x-tenant-id') !== tenantId) {
    return err(
      HaiCommonError.FORBIDDEN,
      serv.m('serv_errorForbidden', { locale: options.context.locale }),
    )
  }
  return await handler(options)
}

const createWidget = serv.mapHaiError(
  serv.requireAuth(
    withAudit(
      requireTenant('tenant-a', async ({ input }) => widgetService.create(input)),
    ),
  ),
)
```

说明：

- `ServProcedureWrapper`：单参数 wrapper，适合 `withAudit(handler)` 这种模式
- `ServGuardedProcedureWrapper<T>`：带配置参数的 wrapper，适合 `requireTenant('t1', handler)` 这种模式
- procedure wrapper 返回的是 `HaiResult<T>`，和 `serv.requireAuth` / `serv.requirePermission` 保持一致
- 常规场景优先继续用 `serv.requireAuth / requirePermission / requireRole / mapHaiError`

边界约束：

- `src/pipelines/*` 是 `@h-ai/serv` 的内部默认实现目录，不作为公开子路径 API 承诺
- 对应用层公开的稳定入口仍然是根入口 `@h-ai/serv`
- `securityHeaders` / `requireInternalRPC` / `buildHaiErrorBody` 等内部 helper/middleware 不作为单独子路径文档暴露

### httpOnly Cookie 认证（推荐生产方案）

httpOnly cookie 模式将 refresh token 存储在服务端管理的 cookie 中（浏览器 JS 无法读取），避免 XSS 风险。

先把两个 token 的职责分清：

- `accessToken`：短期凭证。客户端把它放在内存中，并通过 `Authorization: Bearer <token>` 发送。
  `serv.parseRequestContext()` / `extractBearerToken()` 解析的就是它；`buildAuthContextFactory()` 校验的也是它。
- `refreshToken`：长期凭证。启用 `refreshCookie` 后，它不会再暴露给前端 JS，而是只保存在浏览器的 httpOnly cookie 中。
  它**不会**被 `extractBearerToken()` 读取，只会在 `/auth/refresh` 被服务端取出，用来换发新的 access token。

**工作原理：**

1. 浏览器登录 → 服务端在响应中 `Set-Cookie: hai_refresh_token=...;HttpOnly`，并从 JSON 响应体擦除 `refreshToken`
2. Access token 存储在客户端内存（不持久化）
3. Access token 过期时，浏览器自动携带 cookie 访问 `/auth/refresh`
4. 服务端读取 cookie → 调用 `onRefresh` → 返回新 access token + 更新 cookie（响应体不暴露 refresh token）

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
    // secure: true,                    // 默认在 NODE_ENV=production 时开启
    // onRefresh: customFn,             // 可覆盖 iam.session.refresh。
  },
  // ✅ 无需再传 verifyToken，iam.session.verifyToken 自动用于填充 context.session
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

## API 概览

- `serv.createApp(options)`：创建 HTTP App 抽象，挂载自定义 `middlewares`、健康检查、OpenAPI handler、可选文档与 RPC
- `serv.parseRequestContext({ request })`：默认上下文解析（提取 Bearer token + requestId，不填充 session）
- `serv.listen(app, options)`：在 Node.js 启动 HTTP 服务，返回 `{ server, address, close }`
- `serv.toFetch(app)`：包装为标准 `fetch(Request)` handler
- `serv.generateSpec(contract, options)`：由 contract 生成 OpenAPI 3.1 spec
- `serv.requireAuth(handler)`：procedure 认证包装器（`context.session` 为空 → UNAUTHORIZED）
- `serv.requirePermission(perm, handler)`：procedure 权限包装器（缺失权限 → FORBIDDEN）
- `serv.requireRole(role, handler)`：procedure 角色包装器（缺失角色 → FORBIDDEN）
- `serv.mapHaiError(handler)`：统一异常 → `HaiResult` 的包装器
- `serv.validateInputOrFail(zodSchema, input, locale)`：在 procedure 内做 Zod 二次校验，失败时返回本地化 `HaiResult` + `ValidationFormError[]`
- `serv.resolveRequestLocale(headers)`：从 `x-hai-locale` / `Accept-Language` 解析并规范化请求 locale
- `serv.m(key, options)`：读取 `@h-ai/serv` 自身消息，支持 `options.locale` 单次调用本地化

另有根级类型 / 命名导出：

- `ServConfigSchema`：用于 `core.config.validate('serv', ServConfigSchema)` 校验 `config/_serv.yml`
- HTTP App 抽象：`serv.createApp()` 返回具备 `fetch/request` 能力的公开应用对象；内部是否使用 Hono 不影响应用代码
- `ServMiddlewareMount`：`createApp({ middlewares })` 的挂载项类型（`{ path?, middleware }`）
- `ServMiddleware` / `ServProcedureWrapper` / `ServGuardedProcedureWrapper`：自定义 pipeline 时复用的共享类型

> 传输加密不作为 `serv.xxx` 扁平 API 暴露；它是 `createApp` 的配置能力，内部委托 `crypto.transport`。

## 配置

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
        keyExchangePath: servConfig.transport.keyExchangePath,
        excludePaths: [...servConfig.transport.excludePaths],
        maxClients: servConfig.transport.maxClients,
      },
})
```

`config/_serv.yml` 示例：

```yaml
http:
  apiPrefix: /api/v1
  openapi:
    path: /openapi.json
  docs:
    path: /docs
  health:
    path: /health
    readyPath: /ready
  rpc: false

transport:
  keyExchangePath: /_hai/key-exchange
  excludePaths:
    - /health
    - /ready
    - /openapi.json
    - /docs
    - /_hai/scalar.js
  maxClients: 10000
```

`ServHttpConfigInput`：

- `apiPrefix`：默认 `/api/v1`
- `health`：默认 `{ path: '/health', readyPath: '/ready' }`
- `openapi`：默认 `false`；启用：`{ path: '/openapi.json' }`
- `docs`：默认 `false`；启用：`{ path: '/docs' }`（依赖 `openapi`）；启用后自动挂载 `/_hai/scalar.js`，从 `@scalar/api-reference` 的 browser bundle 提供本地 Scalar UI 脚本，无需外网 CDN
- `rpc`：默认 `false`；启用：`{ prefix: '/rpc', access: 'loopback' | 'private-network' | 'gateway-only', gatewayHeader?, gatewaySecret? }`
- `transport`：`config/_serv.yml` 顶层配置；启用后可通过 `servConfig.transport` 装配到 `createApp({ transport })`，默认密钥协商子路径 `/_hai/key-exchange`

## 错误处理

- Default procedures 全部返回 `HaiResult<T>`，客户端直接判断 `result.success`
- 认证失败 → `HaiCommonError.UNAUTHORIZED`（由 `requireAuth` 按 `context.locale` 本地化）
- 授权失败 → `HaiCommonError.FORBIDDEN`（由 `requirePermission` / `requireRole` 按 `context.locale` 本地化）
- 未捕获异常 → `HaiCommonError.INTERNAL_ERROR`（由 `mapHaiError` 统一兜底并按 `context.locale` 本地化）

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

const createWidget = serv.mapHaiError(async ({ input, context }) => {
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
```

> 如果错误来自下游业务模块（如 `iam.user.xxx()`）且该模块已经直接返回 `HaiResult`，serv 会原样透传它的 `error.message`。当前 `HaiError` 只携带最终 `message`，不携带 `messageKey/params`，因此 **serv 边界无法对任意下游错误再做一次通用 i18n 重翻译**；要支持请求级 i18n，必须在创建该错误消息的模块里就拿到 locale。

## 测试

```bash
pnpm --filter @h-ai/serv test
pnpm --filter @h-ai/serv typecheck
pnpm --filter @h-ai/serv lint
```

## License

Apache-2.0
