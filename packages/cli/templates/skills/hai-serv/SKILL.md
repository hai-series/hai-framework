---
name: hai-serv
description: 使用 @h-ai/serv 将 oRPC contract 挂载为 Hono HTTP API Service；当需求涉及创建 API 服务、装配 procedure、挂载 OpenAPI 文档、配置健康检查、添加认证/权限 pipeline 包装器或切换 Node/Fetch 运行时适配器时使用。
---

# hai-serv

> `@h-ai/serv` 是 hai-framework 的 API Service 运行时，基于 Hono + oRPC 将 `@h-ai/api-contract` 的领域 contract 挂载成跨端可访问的 HTTP API。

---

## 运行环境

> ⚠️ **服务端模块（Node.js / Fetch Runtime）。** 浏览器端通过 `@h-ai/api-client` 调用由本模块暴露的 HTTP API。

---

## 适用场景

- 将 `@h-ai/api-contract` contract 装配成 Hono HTTP app
- 配置 `/health`、`/ready`、`/openapi.json`、`/docs` 等系统端点
- 在 procedure 中添加认证（`requireAuth`）或权限（`requirePermission`）检查
- 切换 Node.js (`@hono/node-server`) 或 Fetch Runtime（Cloudflare Workers / Deno）部署
- 自定义 `ServContext`（注入 session、tenant 等请求级数据）
- 生成 OpenAPI 3.1 文档供外部工具消费
- 启用传输加密：`serv.createApp({ transport: { crypto } })`

---

## 使用步骤

### 1. 安装依赖

```typescript
// @h-ai/serv 依赖 @h-ai/api-contract 提供 contract 定义
// 业务 procedure 依赖对应领域模块（iam/storage/ai）
```

### 2. 创建并启动 app

```typescript
import { createApiContract, iamContract, storageContract, aiContract } from '@h-ai/api-contract'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { createAiProcedures } from '@h-ai/serv/features/ai'
import { createIamProcedures } from '@h-ai/serv/features/iam'
import { createStorageProcedures } from '@h-ai/serv/features/storage'
import { storage } from '@h-ai/storage'
import { ai } from '@h-ai/ai'

const contract = createApiContract({ iam: iamContract, storage: storageContract, ai: aiContract })

// 装配 procedures（每个 feature 对应 contract 中的一个领域）
const procedures = {
  iam: createIamProcedures({ iam }),
  storage: createStorageProcedures({ storage }),
  ai: createAiProcedures({ ai }),
}

// 创建 Hono app
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

// Node.js 启动（自动读取 PORT / HOST 环境变量；onClose 自动监听 SIGINT/SIGTERM）
serv.listen(app, {
  onListening: (info) => console.info(`Listening on port ${info.port}`),
  onClose: closeApp, // 业务模块关闭函数（ai/storage/iam/reldb 等反向释放）
})
```

### 3. Fetch Runtime（Cloudflare Workers / Deno / Bun）

```typescript
import { serv } from '@h-ai/serv'

// toFetch 返回标准 Fetch handler
const handler = serv.toFetch(app)

export default { fetch: handler }
```

---

## 核心 API

### `serv.createApp(options)` — 创建 Hono app

```typescript
import type { CreateServAppOptions } from '@h-ai/serv'

const app = serv.createApp({
  contract,       // AnyContractRouter — 通过 createApiContract() 组合的 contract
  procedures,     // Router<AnyContractRouter, ServContext> — procedure 实现
  http?,          // ServHttpConfigInput — HTTP 端点配置（见下方配置节）
  iam?,           // ServIam — 顶层 IAM 句柄，同时驱动 access token 校验与 refresh cookie【推荐】
  refreshCookie?, // RefreshCookieConfig — httpOnly refresh cookie 刷新路径（见下方 cookie 节）
  transport?,     // { crypto, keyExchangePath?, excludePaths?, maxClients? } — 统一传输加密
  verifyToken?,   // (token) => Promise<HaiResult<ServSession>> — 逃脱口：不使用 iam 时提供自定义校验
  createContext?, // CreateServContext — 高级：完全接管上下文构造（设置后 serv 不再自动填充 session）
})
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
  },
})
```

客户端：

```typescript
await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  transport: { crypto },
})
```

> 不要导入或暴露子目录内部 transport 工厂；公共装配点只有 `serv.createApp({ transport: { crypto } })`。

**上下文工厂优先级**（`context.session` 填充来源）：

1. 显式 `createContext`（高级场景：多租户、额外字段）
2. `verifyToken`（逃脱口：使用非 @h-ai/iam 的认证服务）
3. `iam.session.verifyToken`（推荐：传入 `iam` 后自动启用）
4. 默认 `parseRequestContext`：仅解析请求元数据，`session` 为 `undefined`

> ⚠️ `verifyToken` 会在每次请求调用（不缓存）；verifyToken 失败或抛错统一收敛为 `session=undefined`，由 `requireAuth` 统一返回 401。

### Procedure 包装器（所有导出为 `serv.xxx` 扁平 API）

| 函数 | 说明 |
| --- | --- |
| `serv.mapHaiError(handler)` | 捕获未处理异常，转换为 `HaiResult` |
| `serv.requireAuth(handler)` | 验证 session（`context.session` 非空，即 token 已通过 `verifyToken` 校验） |
| `serv.requirePermission(permission, handler)` | 验证权限码，支持通配符 `serv.WILDCARD_PERMISSION`（`'*'`） |
| `serv.requireRole(role, handler)` | 验证角色，支持通配符 `serv.WILDCARD_ROLE`（`'*'`） |
| `serv.validateInputOrFail(zodSchema, input, locale)` | 在 procedure 内执行 Zod 二次校验，失败时返回本地化 `HaiResult` + `ValidationFormError[]` |
| `serv.resolveRequestLocale(headers)` | 从 `x-hai-locale` / `Accept-Language` 解析并规范化 locale |
| `serv.m(key, { locale, params })` | 读取 serv 自身 i18n 消息（请求级本地化） |

```typescript
import { serv } from '@h-ai/serv'

// 组合包装（从外到内：error → auth → permission/role → handler）
const handler = serv.mapHaiError(
  serv.requireAuth(
    serv.requirePermission('user.write', actualHandler)
  )
)

// 角色检查示例
const adminOnly = serv.requireAuth(
  serv.requireRole('admin', actualHandler)
)
```

### 正常业务请求中的错误与 i18n

按三层处理：

1. **oRPC contract 输入校验**：进入 handler 前自动发生；`serv.createApp()` 会把默认英文 Zod 错误改写为本地化 `errors[]`。
2. **handler 内二次校验**：对跨字段规则、数据库回读对象等适合 Zod 表达的场景，使用 `serv.validateInputOrFail(zodSchema, input, context.locale)`；简单业务规则直接 `err(...)` 即可。
3. **业务/领域错误**：不要 throw 预期失败；直接返回 `err(...)`，并在**创建错误消息的那一层**用对应模块的 i18n getter 按 `context.locale` 出消息。

```typescript
import { err, HaiCommonError } from '@h-ai/core'
import { z } from 'zod'
import { serv } from '@h-ai/serv'

const Schema = z.object({ title: z.string().min(1) })

const handler = serv.mapHaiError(async ({ input, context }) => {
  const validated = serv.validateInputOrFail(Schema, input, context.locale)
  if (!validated.success)
    return validated

  if (!context.session)
    return err(HaiCommonError.UNAUTHORIZED, serv.m('serv_errorUnauthorized', { locale: context.locale }))

  return widgetService.create(validated.data)
})
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

### `serv.createDocsPage(spec, options)` — 创建文档 HTML

```typescript
const html = serv.createDocsPage(spec, {
  title: 'My API Docs',
  specUrl: '/openapi.json', // 不传时内嵌 spec JSON
})
```

---

## HTTP 配置（`ServHttpConfigInput`）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `apiPrefix` | `'/api/v1'` | oRPC OpenAPI handler 挂载前缀 |
| `health` | `{ path: '/health', readyPath: '/ready' }` | 健康与就绪检查端点 |
| `openapi` | `false` | OpenAPI JSON endpoint，显式开启 |
| `docs` | `false` | Scalar 文档页，显式开启；启用后自动挂载 `/_hai/scalar.js` 本地脚本路由 |
| `rpc` | `false` | 内部 RPC endpoint，显式开启 |
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

const { requireAuth, requirePermission } = serv

export function createMyProcedures() {
  return {
    widget: {
      list: requireAuth(async ({ input, context }) => {
        // input 类型来自 contract 定义
        return ok(await widgetService.list(input))
      }),
      create: requirePermission('widget:write', async ({ input }) => {
        return ok(await widgetService.create(input))
      }),
    },
  }
}
```

### 自定义 contract 组合

```typescript
import { createApiContract, iamContract } from '@h-ai/api-contract'
import { widgetContract } from './widget-contract.js'

export const myAppContract = createApiContract({
  iam: iamContract,
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

procedure 包装器内置以下错误：

| 错误码 | 触发条件 |
| --- | --- |
| `HaiCommonError.UNAUTHORIZED` | `requireAuth`：无 accessToken |
| `HaiCommonError.FORBIDDEN` | `requirePermission`：无对应权限 |
| `HaiCommonError.INTERNAL_ERROR` | `mapHaiError`：procedure 抛出未处理异常 |

---

## httpOnly Cookie 认证

将 refresh token 存储在 `HttpOnly` cookie 中，避免 XSS 风险（浏览器 JS 无法读取）。

### 适用场景

- 浏览器端（Web / H5）使用 `@h-ai/api-client` 的 `createHttpOnlyCookieTokenStorage()`
- 对 refresh token 有更高安全要求，不希望存储在 localStorage

### 工作流程

1. 浏览器 POST `/auth/login` → serv 拦截 oRPC 成功响应 → `Set-Cookie: hai_refresh_token=...;HttpOnly;SameSite=Strict`
2. Access token 由客户端存内存（不持久化）
3. Access token 过期 → 客户端 POST `/auth/refresh`（浏览器自动携带 cookie）
4. serv 读取 cookie → 调用 `iam.session.refresh` → 返回新 token 对 + 更新 cookie
5. POST `/auth/logout` → serv 清除 cookie（`Max-Age=0`）

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
