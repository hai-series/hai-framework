---
name: hai-serv
description: 使用 @h-ai/serv 将 oRPC contract 挂载为最小 HTTP App 抽象；当需求涉及创建 API 服务、装配 procedure、挂载 OpenAPI 文档、配置健康检查、声明 route 认证授权或切换 Node/Fetch 运行时适配器时使用。
---

# hai-serv

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/serv 将 oRPC contract 挂载为最小 HTTP App 抽象；当需求涉及创建 API 服务、装配 procedure、挂载 OpenAPI 文档、配置健康检查、声明 route 认证授权或切换 Node/Fetch 运行时适配器时使用。 |
| 适用场景 | 当任务与 `hai-serv` 的能力描述匹配，并且需要遵循本 Skill 的流程和边界时 |
| 输入 | 模块配置、类型化业务参数、依赖初始化状态和目标运行环境 |
| 输出 | 符合模块公共 API 的实现或示例；业务结果使用 HaiResult，并同步必要测试与文档 |
| 限制 | 遵守 init → use → close 生命周期与运行环境边界；不绕过类型、授权、输入校验或敏感信息保护 |

> `@h-ai/serv` 是 hai-framework 的 API Service 运行时，对外暴露最小 HTTP App 抽象，将 `@h-ai/api-contract` 的领域 contract 挂载成跨端可访问的 HTTP API；Hono 是内部实现细节，应用代码不要直接 import 或暴露 Hono。

---

## 运行环境

> ⚠️ **服务端模块（Node.js / Fetch Runtime）。** 浏览器端通过 `@h-ai/api-client` 调用由本模块暴露的 HTTP API。

> 生命周期说明：`@h-ai/serv` 是无状态 HTTP App 装配器，不提供 `init()` / `close()`；依赖模块（iam/storage/ai/crypto 等）由应用先初始化，并在 `serv.listen(..., { onClose })` 中反向释放。`serv.createApp()` 的启动期配置错误会 fail-fast 抛出。

---

## 适用场景

- 将 `@h-ai/api-contract` contract 装配成最小 HTTP App 抽象
- 配置 `/health`、`/ready`、`/openapi.json`、`/docs` 等系统端点
- 在 procedure route 上添加 `.auth()`、`.permission()` 或 `.role()` guard
- 切换 Node.js (`@hono/node-server`) 或 Fetch Runtime（Cloudflare Workers / Deno）部署
- 自定义 `ServContext`（注入 session、tenant 等请求级数据）
- 生成 OpenAPI 3.1 文档供外部工具消费
- 通过 `config/_serv.yml` 管理 API 前缀、OpenAPI、docs、health、rpc 等 HTTP 挂载配置
- 通过 `serv.createRuntimeSecurityPolicy(...)` 对生产 CORS Origin、原生 WebView Origin、Secure Cookie 与 API 文档暴露执行 fail-closed 策略
- 启用传输加密：`serv.createApp({ transport: { crypto } })`
- 高级场景通过 `createApp({ middlewares })` 自定义 HTTP middleware，通过 `createContext` 注入请求级业务字段
- 公开只读文件通过 `serv.storageAssets(...)` 统一处理安全 key、MIME 白名单、GET/HEAD、ETag 与缓存头
- 为 Audio WebSocket 配置一次性 ticket 校验、IAM/模型/配额授权与并发释放钩子

---

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
import { createAiProcedures } from '@h-ai/serv/features/ai'
import { createIamProcedures } from '@h-ai/serv/features/iam'
import { createStorageProcedures } from '@h-ai/serv/features/storage'
import { storage } from '@h-ai/storage'

const contract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

// 装配 procedures（每个 feature 对应 contract 中的一个领域）
const procedures = {
  iam: createIamProcedures({ iam }),
  storage: createStorageProcedures({ storage }),
  ai: createAiProcedures({ ai }),
}

// 创建 HTTP App 抽象；不要在应用导出类型里暴露 Hono
const app = serv.createApp({
  contract,
  procedures,
  http: {
    apiPrefix: '/api/v1',
    openapi: { path: '/openapi.json' },
    docs: { path: '/docs' },
    health: { path: '/health', readyPath: '/ready' },
  },
})

// Node.js 启动（host/port 来自 _serv.yml 的 server；HOST/PORT 环境变量高于配置文件；onClose 自动监听 SIGINT/SIGTERM）
const { server } = core.config.getOrThrow<ServConfig>('serv')
serv.listen(app, {
  host: server.host,
  port: server.port,
  onListening: info => logger.info('API service listening', { port: info.port }),
  onClose: closeApp, // 业务模块关闭函数（ai/storage/iam/reldb 等反向释放）
})
```

生产部署先从 `_core.yml.env` 与 `_serv.yml.cors` 创建安全策略；不要在业务应用重复实现 Origin 解析：

```typescript
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

- 生产环境 `cors.origin` 禁止为空或 `*`，启动时 fail-fast。
- 普通 Web Origin 仅接受 HTTP(S)；原生 Origin 通过 `cors.nativeOrigins` 显式允许 HTTP(S)、Capacitor 或 Tauri。
- Origin 按完整规范化值精确匹配，不使用前缀/后缀匹配。
- 生产环境自动要求 Secure refresh cookie，并把 OpenAPI/docs 作为安全上限关闭。

### 2.1 Audio WebSocket 安全接入

```typescript
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

`apiContract.create({...})` 接受任意 key——除了框架提供的 `iam/storage/ai`，应用可以挂入自己的领域 contract，
客户端通过 `client.<key>.<procedure>(...)` 调用，类型完全推导自同一份 contract。

```typescript
// apps/api-service-contract/src/app-contract.ts
import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'

const InfoOutput = apiContract.haiResultSchema(z.object({ name: z.string(), version: z.string() }))
const EchoInput = z.object({ message: z.string().min(1).max(2000) })
const EchoOutput = apiContract.haiResultSchema(z.object({ message: z.string(), userId: z.string() }))

export const appContract = {
  info: apiContract.route({ method: 'POST', path: '/app/info', operationId: 'app.info', tags: ['app'] })
    .output(InfoOutput),
  echo: apiContract.route({ method: 'POST', path: '/app/echo', operationId: 'app.echo', tags: ['app'] })
    .input(EchoInput).output(EchoOutput),
}
```

```typescript
// src/server/procedures/app-procedures.ts
import type { ServContext } from '@h-ai/serv'
import { appContract } from '@h-ai/api-service-contract'
import { ok } from '@h-ai/core'
import { serv } from '@h-ai/serv'

export function createAppProcedures(deps: { name: string; version: string }) {
  return serv
    .implement(appContract)
    .context<ServContext>()
    // 公开 procedure：route 名只出现一次，handler 直接返回 HaiResult。
    .route('info', () => ok({ name: deps.name, version: deps.version }))
    // 鉴权 procedure：guard 通过后 context.session 自动收窄为非空。
    .route('echo')
    .auth()
    .handle(({ input, context }) => ok({
      message: input.message,
      userId: context.session.userId,
    }))
    .build()
}
```

把自有 contract / procedures 与框架的 iam/storage/ai 平铺合并：

```typescript
const contract = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  ai: apiContract.ai,
  app: appContract, // ← 自有契约
})

const procedures = {
  iam: createIamProcedures({ iam }),
  storage: createStorageProcedures({ storage }),
  ai: createAiProcedures({ ai }),
  app: createAppProcedures({ name: 'demo', version: '1.0.0' }),
}

const app = serv.createApp({ contract, procedures, http, iam })
```

注意要点：

- **无 input 的 POST 过程**：默认不发送 body；transport 加密层会自动跳过空 body 请求，客户端可直接 `client.app.info()`。
- **认证授权写在 route 链上**：公开过程使用 `.route(path, handler)`；需要认证时使用 `.route(path).auth().handle(handler)`。
- **客户端导入相同 contract**：把服务端与客户端共享的 contract 独立成 package（如 `@h-ai/api-service-contract`），禁止从 app 源码目录跨应用 import。

### 5. Fetch Runtime（Cloudflare Workers / Deno / Bun）

```typescript
import { serv } from '@h-ai/serv'

// toFetch 返回标准 Fetch handler
const handler = serv.toFetch(app)

export default { fetch: handler }
```

### 6. 通过 `config/_serv.yml` 管理 HTTP 配置

`@h-ai/serv` 不自己扫描 YAML；推荐由 `@h-ai/core` 统一加载，再用 `ServConfigSchema` 校验：

```typescript
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

```yaml
# config/_serv.yml
server:
  host: 127.0.0.1
  port: 3000

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

---

## 核心 API

### `serv.createApp(options)` — 创建 HTTP App 抽象

```typescript
import type { CreateServAppOptions } from '@h-ai/serv'

export function createServerApp() {
  return serv.createApp({
  contract,       // AnyContractRouter — 通过 apiContract.create() 组合的 contract
  procedures,     // Router<AnyContractRouter, ServContext> — procedure 实现
  http?,          // ServHttpConfigInput — HTTP 端点配置（见下方配置节）
  middlewares?,   // readonly ServMiddlewareMount[] — 自定义 HTTP middleware（日志/CORS/限流/租户头校验）
  iam?,           // ServIam — 顶层 IAM 句柄，同时驱动 access token 校验与 refresh cookie【推荐】
  refreshCookie?, // RefreshCookieConfig — 浏览器 cookie / 受信原生 body 的 refresh token 通道
  transport?,     // { crypto, keyExchangePath?, excludePaths?, maxClients? } — 统一传输加密
  verifyToken?,   // (token) => Promise<HaiResult<ServSession>> — 逃脱口：不使用 iam 时提供自定义校验
  createContext?, // CreateServContext — 高级：完全接管上下文构造（设置后 serv 不再自动填充 session）
  })
}
```

### `apiContract.route` / `serv.implement` — contract 与运行时分层

应用代码不要直接 `import { oc } from '@orpc/contract'` 或 `import { implement } from '@orpc/server'`。
contract 路由统一用 `@h-ai/api-contract` 定义，procedure 运行时统一用 `@h-ai/serv` 实现：

```typescript
import { apiContract } from '@h-ai/api-contract'
import { serv } from '@h-ai/serv'

// 等价于 oc.route(...)，但不让应用感知 @orpc/contract
const route = apiContract.route({ method: 'POST', path: '/x', operationId: 'x', tags: ['x'] })

const procedures = serv
  .implement(appContract)
  .context<ServContext>()
  .route('info', infoHandler)
  .route('echo')
  .auth()
  .handle(echoHandler)
  .build()
```

### 传输加密

serv 不暴露本地传输加密工厂；内部统一调用 `crypto.transport.createServer()`。客户端用 `@h-ai/api-client` 的 `transport` 配置自动协商。

```typescript
import { crypto } from '@h-ai/crypto'
import { serv } from '@h-ai/serv'

await crypto.init()

const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
  transport: {
    crypto,
    // keyExchangePath 默认 '/_hai/key-exchange'
    // maxClients: 10000,
    // keyStore: createRedisTransportKeyStore({ cache, ttlSeconds: 3600 }),
  },
})
```

客户端：

```typescript
await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  transport: { crypto },
})
```

若服务端通过 `config/_serv.yml` 自定义了 `transport.keyExchangePath`，客户端也必须传入同一路径：

```typescript
await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  transport: {
    crypto,
    keyExchangePath: '/custom/key-exchange',
  },
})
```

> 不要导入或暴露子目录内部 transport 工厂；公共装配点只有 `serv.createApp({ transport: { crypto } })`。

多节点部署时，直接在 `serv.createApp({ transport })` 的运行时对象里注入 `keyStore` 即可；推荐从 `@h-ai/crypto` 根入口导入 `createRedisTransportKeyStore()` / `createReldbTransportKeyStore()`。`keyStore` 不属于 `_serv.yml` 配置项，配置文件仍只保留静态路径和白名单。

**上下文工厂优先级**（`context.session` 填充来源）：

1. 显式 `createContext`（高级场景：多租户、额外字段）
2. `verifyToken`（逃脱口：使用非 @h-ai/iam 的认证服务）
3. `iam.session.verifyToken`（推荐：传入 `iam` 后自动启用）
4. 默认 `parseRequestContext`：仅解析请求元数据，`session` 为 `undefined`

> ⚠️ `verifyToken` 会在每次请求调用（不缓存）；verifyToken 失败或抛错统一收敛为 `session=undefined`，由 route 的 `.auth()` / `.permission()` / `.role()` 统一返回 401。

### 链式 procedure guard

| 链式调用 | 说明 |
| --- | --- |
| `.route(path, handler)` | 注册公开 procedure；path/input/output 从 contract 推导 |
| `.route(path).auth().handle(handler)` | 要求 session；通过后 `context.session` 自动收窄 |
| `.permission(permission)` | 隐含认证并检查权限，支持 `serv.WILDCARD_PERMISSION` |
| `.role(role)` | 隐含认证并检查角色，支持 `serv.WILDCARD_ROLE` |
| `.build()` | contract 全部 procedures 实现后构建 router |
| `serv.validateInputOrFail(zodSchema, input, locale)` | 在 procedure 内执行 Zod 二次校验，失败时返回本地化 `HaiResult` + `ValidationFormError[]` |
| `serv.resolveRequestLocale(headers)` | 从 `x-hai-locale` / `Accept-Language` 解析并规范化 locale |
| `serv.m(key, { locale, params })` | 读取 serv 自身 i18n 消息（请求级本地化） |

```typescript
import { serv } from '@h-ai/serv'

const procedures = serv
  .implement(appContract)
  .context<ServContext>()
  .route('info', infoHandler)
  .route('users.update')
  .permission('user.write')
  .role('admin')
  .handle(updateUserHandler)
  .build()
```

- `.permission()` / `.role()` 隐含 `.auth()`；未登录返回 401，授权不足返回 403。
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

执行顺序固定为：`securityHeaders` → `middlewares` → `transport`（若启用）→ health/refresh-cookie/OpenAPI/RPC/docs/oRPC routes。

- `middlewares` 先于 `transport` 执行，因此 CORS preflight 或二进制端点可以直接短路；短路响应仍带内置安全头，但不会经过 transport。
- 公开只读文件优先使用 `serv.storageAssets(...)`；应用仍须显式提供 key/MIME 白名单、缓存与跨域策略，框架不内置头像等业务概念。
- 私有资源、Range 下载或动态授权继续使用自定义 middleware/procedure。
- 若需要读取解密后的业务 body，请改用 context / procedure 层扩展。
- 浏览器若需读取自定义响应头（例如 transport 的 `X-Encrypted`），记得通过 `serv.cors({ exposedHeaders: [...] })` 显式暴露。

#### Context pipeline

如果想复用“Bearer token → session”这段逻辑，再追加租户/工作区等字段，优先：

```typescript
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

选择建议：

- 只换 token 校验实现：`verifyToken`
- 在默认认证上下文之上追加字段：`buildAuthContextFactory(...) + createContext`
- 完全接管上下文构造：`createContext`

#### Route guard

认证、权限与角色约束直接写在目标 route 上，不嵌套高阶 handler：

```typescript
const procedures = serv
  .implement(widgetContract)
  .context<ServContext>()
  .route('widgets.list', ({ input }) => widgetService.list(input))
  .route('widgets.create')
  .permission('widgets.write')
  .handle(({ input, context }) =>
    widgetService.create(context.session.userId, input))
  .build()
```

HTTP 审计、限流、CORS、租户头校验等跨 route 能力继续放在
`createApp({ middlewares })`；请求级业务字段通过 `createContext` 注入。
不要为认证授权重新嵌套多层高阶 handler。

### 正常业务请求中的错误与 i18n

按三层处理：

1. **oRPC contract 输入校验**：进入 handler 前自动发生；`serv.createApp()` 会把默认英文 Zod 错误改写为本地化 `errors[]`。
2. **handler 内二次校验**：对跨字段规则、数据库回读对象等适合 Zod 表达的场景，使用 `serv.validateInputOrFail(zodSchema, input, context.locale)`；简单业务规则直接 `err(...)` 即可。
3. **业务/领域错误**：不要 throw 预期失败；直接返回 `err(...)`，并在**创建错误消息的那一层**用对应模块的 i18n getter 按 `context.locale` 出消息。

```typescript
import { z } from 'zod'
import { serv } from '@h-ai/serv'

const Schema = z.object({ title: z.string().min(1) })

const procedures = serv
  .implement(widgetContract)
  .context<ServContext>()
  .route('widgets.create')
  .auth()
  .handle(({ input, context }) => {
    const validated = serv.validateInputOrFail(Schema, input, context.locale)
    if (!validated.success)
      return validated

    return widgetService.create(context.session.userId, validated.data)
  })
  .build()
```

> 如果错误来自下游模块（如 `iam` / `storage`）并且该模块已经返回 `HaiResult`，serv 默认**透传**它的 `error.message`。由于 `HaiError` 目前不携带 `messageKey/params`，serv 边界不能对任意下游错误再做通用重翻译；要做请求级 i18n，必须在创建该错误的模块/feature 里就拿到 locale。

### `serv.parseRequestContext` — 默认 Context 解析器

从 HTTP 请求头自动解析：

| 字段 | 来源 |
| --- | --- |
| `accessToken` | `Authorization: Bearer <token>` |
| `requestId` | `x-request-id` 或自动生成 UUID |
| `ip` | `x-forwarded-for` / `x-real-ip` |
| `locale` | `accept-language` |
| `userAgent` | `user-agent` |

### `serv.generateSpec(contract, options)` — 生成 OpenAPI 文档

```typescript
const spec = await serv.generateSpec(contract, {
  title: 'My API',
  version: '1.0.0',
  apiPrefix: '/api/v1',
  description: '接口说明',
})
// spec 为 OpenAPI 3.1 Document 对象
```

---

## HTTP 配置（`ServHttpConfigInput`）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `apiPrefix` | `'/api/v1'` | oRPC OpenAPI handler 挂载前缀 |
| `health` | `{ path: '/health', readyPath: '/ready' }` | 健康与就绪检查端点 |
| `openapi` | `false` | OpenAPI JSON endpoint，显式开启 |
| `docs` | `false` | Scalar 文档页，显式开启；启用后自动挂载 `/_hai/scalar.js` 本地脚本路由 |
| `rpc` | `false` | 内部 RPC endpoint，显式开启；`loopback` / `private-network` 基于真实连接 IP，网关场景用 `gateway-only` |
| `transport` | `undefined` | 顶层配置；启用后默认挂载 `{apiPrefix}/_hai/key-exchange` |

```typescript
http: {
  apiPrefix: '/api/v1',
  openapi: { path: '/openapi.json' },
  docs: { path: '/docs' },
  health: { path: '/health', readyPath: '/ready' },
  rpc: false, // 关闭内部 RPC
}
```

---

## Feature Procedures（默认实现）

`@h-ai/serv` 内置了三个 feature 模块，开箱即用：

| 导入路径 | 工厂函数 | 所需依赖 |
| --- | --- | --- |
| `@h-ai/serv/features/iam` | `createIamProcedures({ iam })` | `@h-ai/iam` |
| `@h-ai/serv/features/storage` | `createStorageProcedures({ storage })` | `@h-ai/storage` |
| `@h-ai/serv/features/ai` | `createAiProcedures({ ai })` | `@h-ai/ai` |

---

## 常见模式

### 自定义领域 procedure

```typescript
import type { ServContext } from '@h-ai/serv'
import { serv } from '@h-ai/serv'
import { myContract } from './my-contract.js'

export function createMyProcedures() {
  return serv
    .implement(myContract)
    .context<ServContext>()
    .route('widget.list')
    .auth()
    .handle(({ input }) => widgetService.list(input))
    .route('widget.create')
    .permission('widget:write')
    .handle(({ input }) => widgetService.create(input))
    .build()
}
```

### 自定义 contract 组合

```typescript
import { apiContract } from '@h-ai/api-contract'
import { widgetContract } from './widget-contract.js'

export const myAppContract = apiContract.create({
  iam: apiContract.iam,
  widget: widgetContract,
})

const app = serv.createApp({
  contract: myAppContract,
  procedures: {
    iam: createIamProcedures({ iam }),
    widget: createMyProcedures(),
  },
  http: { apiPrefix: '/api/v1' },
})
```

---

## 错误码

route 实现器内置以下错误：

| 错误码 | 触发条件 |
| --- | --- |
| `HaiCommonError.UNAUTHORIZED` | `.auth()`：`context.session` 为空（无 token 或 token 校验失败） |
| `HaiCommonError.FORBIDDEN` | `.permission()` / `.role()`：无对应权限或角色 |
| `HaiCommonError.INTERNAL_ERROR` | route handler 抛出未处理异常 |

---

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

若同时启用 `transport: { crypto }`，`/auth/refresh` 也必须走加密链路；cookie-only 刷新请求允许空 body，服务端不要把 `Request.body === null` 误判为需要解密的请求体。

### 配置

```typescript
const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
  iam,                                  // 顶层句柄：同时驱动 verifyToken 与 refresh
  refreshCookie: {
    // cookieName?: string              默认 'hai_refresh_token'
    // maxAge?: number                  默认 30 * 24 * 3600（30 天）
    // secure?: boolean                 默认 NODE_ENV=production 时开启
    // onRefresh?: (token) => ...       可选：覆盖默认的 iam.session.refresh
    nativeTokenTransport: {
      // 必须 fail-closed：同时校验平台标识与允许的原生 Origin。
      isRequest: request =>
        request.headers.get('x-client-platform') === 'capacitor'
        && security.isNativeOrigin(request.headers.get('origin') ?? ''),
    },
  },
  // ✅ 顶层 iam 同时为 access token 校验提供默认实现，无需再传 verifyToken
})
```

> **逃脱口**：不使用 `@h-ai/iam` 时，可显式传入顶层 `verifyToken: token => myAuthService.verify(token)`。

### Cookie 规格

| 属性 | 值 |
| --- | --- |
| Name | `hai_refresh_token`（可配置） |
| Path | `{apiPrefix}/auth/refresh`（最小范围） |
| HttpOnly | ✓ |
| SameSite | `Strict` |
| Secure | 生产自动开启，`secure: false` 可在 HTTP 开发环境关闭 |
| Max-Age | 30 天（可配置） |

---

## 测试

```bash
pnpm --filter @h-ai/serv test
pnpm --filter @h-ai/serv typecheck
pnpm --filter @h-ai/serv lint
```
