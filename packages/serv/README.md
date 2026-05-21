# @h-ai/serv

> hai-framework 的 Hono + oRPC API 服务运行时，把 `@h-ai/api-contract` 的契约挂载为跨端可访问的 HTTP API。

## 能力概览

- 一行启动：`serv.createApp(...)` → `serv.listen(app, { port })`
- 扁平 API（最小知识）：`serv.listen / serv.toFetch / serv.requireAuth / serv.requirePermission / serv.generateSpec / ...`
- 默认 feature procedures：`createIamProcedures()`、`createStorageProcedures()`、`createAiProcedures()`
- 内置安全响应头、健康检查、可选 OpenAPI JSON、可选 Scalar 文档页、可选内部 RPC endpoint
- 可选传输加密：`serv.createApp({ transport: { crypto } })` 自动挂载密钥协商与请求/响应加解密

## 快速开始

```ts
import { aiContract, createApiContract, iamContract, storageContract } from '@h-ai/api-contract'
import { serv } from '@h-ai/serv'
import { createAiProcedures } from '@h-ai/serv/features/ai'
import { createIamProcedures } from '@h-ai/serv/features/iam'
import { createStorageProcedures } from '@h-ai/serv/features/storage'

// 1) 创建契约
const contract = createApiContract({ iam: iamContract, storage: storageContract, ai: aiContract })

// 2) 组装 procedures（注入 iam / storage / ai 已初始化的 functions）
const procedures = {
  iam: createIamProcedures({ iam }),
  storage: createStorageProcedures({ storage }),
  ai: createAiProcedures({ ai }),
}

// 3) 创建 app
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

### 传输加密（与 `@h-ai/crypto` 统一）

serv 不暴露本地传输加密工厂；统一从 `crypto.transport` 创建服务端管理器。使用方只需传入顶层 `crypto` 句柄：

```ts
import { crypto } from '@h-ai/crypto'
import { serv } from '@h-ai/serv'

await crypto.init()

const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
  transport: {
    crypto,
    // keyExchangePath 默认 '/_hai/key-exchange'，最终端点为 '/api/v1/_hai/key-exchange'
    // excludePaths: ['/health'],
    // maxClients: 10000,
  },
})
```

客户端使用 `@h-ai/api-client`：

```ts
import { api } from '@h-ai/api-client'

await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  transport: { crypto },
})
```

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
import { implement } from '@orpc/server'

const p = implement(myContract).$context<ServContext>()

const updateProfile = p.users.update.handler(
  serv.requirePermission('users.write', async ({ input, context }) => {
    return await userService.update(input.id, input)
  }),
)
```

### httpOnly Cookie 认证（推荐生产方案）

httpOnly cookie 模式将 refresh token 存储在服务端管理的 cookie 中（浏览器 JS 无法读取），避免 XSS 风险。

**工作原理：**

1. 浏览器登录 → 服务端在响应中 `Set-Cookie: hai_refresh_token=...;HttpOnly`
2. Access token 存储在客户端内存（不持久化）
3. Access token 过期时，浏览器自动携带 cookie 访问 `/auth/refresh`
4. 服务端读取 cookie → 调用 `onRefresh` → 返回新 token 对 + 更新 cookie

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
await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
})
```

> **Cookie 规格**：`HttpOnly; SameSite=Strict; Secure`（生产）；`Path` 限制为 `{apiPrefix}/auth/refresh`。

## API 概览

| API                                     | 作用                                                            |
| --------------------------------------- | --------------------------------------------------------------- |
| `serv.createApp(options)`               | 创建 Hono app，挂载健康检查、OpenAPI handler、可选文档与 RPC    |
| `serv.parseRequestContext({ request })` | 默认上下文解析（提取 Bearer token + requestId，不填充 session） |
| `serv.listen(app, options)`             | 在 Node.js 启动 HTTP 服务，返回 `{ server, address, close }`    |
| `serv.toFetch(app)`                     | 包装为标准 `fetch(Request)` handler                             |
| `serv.generateSpec(contract, options)`  | 由 contract 生成 OpenAPI 3.1 spec                               |
| `serv.createDocsPage(spec, options)`    | 生成 Scalar 文档页面 HTML                                       |
| `serv.requireAuth(handler)`             | procedure 认证包装器（`context.session` 为空 → UNAUTHORIZED）   |
| `serv.requirePermission(perm, handler)` | procedure 权限包装器（缺失权限 → FORBIDDEN）                    |
| `serv.requireRole(role, handler)`       | procedure 角色包装器（缺失角色 → FORBIDDEN）                    |
| `serv.mapHaiError(handler)`             | 统一异常 → `HaiResult` 的包装器                                 |
| `serv.securityHeaders()`                | Hono 中间件：HSTS / X-Content-Type-Options / Referrer-Policy    |
| `serv.requireInternalRPC(config)`       | Hono 中间件：保护 `/rpc` 仅 loopback/内网/允许列表访问          |

> 传输加密不作为 `serv.xxx` 扁平 API 暴露；它是 `createApp` 的配置能力，内部委托 `crypto.transport`。

## 配置

`ServHttpConfigInput`：

- `apiPrefix`：默认 `/api/v1`
- `health`：默认 `{ path: '/health', readyPath: '/ready' }`
- `openapi`：默认 `false`；启用：`{ path: '/openapi.json' }`
- `docs`：默认 `false`；启用：`{ path: '/docs' }`（依赖 `openapi`）；启用后自动挂载 `/_hai/scalar.js`，从 `@scalar/api-reference` 的 browser bundle 提供本地 Scalar UI 脚本，无需外网 CDN
- `rpc`：默认 `false`；启用：`{ prefix: '/rpc', access: 'loopback' | 'private' | { allowlist: [...] } }`
- `transport`：`createApp` 顶层配置，`{ crypto, keyExchangePath?, excludePaths?, maxClients? }`；默认密钥协商子路径 `/_hai/key-exchange`

## 错误处理

- Default procedures 全部返回 `HaiResult<T>`，客户端直接判断 `result.success`
- 认证失败 → `HaiCommonError.UNAUTHORIZED`
- 授权失败 → `HaiCommonError.FORBIDDEN`
- 未捕获异常 → `HaiCommonError.INTERNAL_ERROR`（自动记录到 `core.logger`）

## 测试

```bash
pnpm --filter @h-ai/serv test
pnpm --filter @h-ai/serv typecheck
pnpm --filter @h-ai/serv lint
```

## License

Apache-2.0
