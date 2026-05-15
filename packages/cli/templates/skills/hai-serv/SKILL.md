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

---

## 使用步骤

### 1. 安装依赖

```typescript
// @h-ai/serv 依赖 @h-ai/api-contract 提供 contract 定义
// 业务 procedure 依赖对应领域模块（iam/storage/ai）
```

### 2. 创建并启动 app

```typescript
import { apiServiceContract } from '@h-ai/api-contract/presets/api-service'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { createAiProcedures } from '@h-ai/serv/features/ai'
import { createIamProcedures } from '@h-ai/serv/features/iam'
import { createStorageProcedures } from '@h-ai/serv/features/storage'
import { storage } from '@h-ai/storage'
import { ai } from '@h-ai/ai'

// 装配 procedures（每个 feature 对应 contract 中的一个领域）
const procedures = {
  iam: createIamProcedures({ iam }),
  storage: createStorageProcedures({ storage }),
  ai: createAiProcedures({ ai }),
}

// 创建 Hono app
const app = serv.createApp({
  contract: apiServiceContract,
  procedures,
  http: {
    apiPrefix: '/api/v1',
    openapi: { path: '/openapi.json' },
    docs: { path: '/docs' },
    health: { path: '/health', readyPath: '/ready' },
  },
})

// Node.js 启动
const server = serv.adapters.node.listen(app, {
  port: 3000,
  onListening: (info) => console.info(`Listening on port ${info.port}`),
})

// 优雅关闭
process.on('SIGTERM', () => server.close())
```

### 3. Fetch Runtime（Cloudflare Workers / Deno）

```typescript
import { serv } from '@h-ai/serv'

// createFetchHandler 返回标准 Fetch handler
const handler = serv.adapters.fetch.createFetchHandler(app)

export default { fetch: handler }
```

---

## 核心 API

### `serv.createApp(options)` — 创建 Hono app

```typescript
import type { CreateServAppOptions } from '@h-ai/serv'

const app = serv.createApp({
  contract,       // AnyContractRouter — oRPC contract（如 apiServiceContract）
  procedures,     // Router<AnyContractRouter, ServContext> — procedure 实现
  http?,          // ServHttpConfigInput — HTTP 端点配置（见下方配置节）
  createContext?, // CreateServContext — 自定义 context 工厂
})
```

### `serv.pipeline.orpc` — Procedure 包装器

| 函数 | 说明 |
| --- | --- |
| `mapHaiError(handler)` | 捕获未处理异常，转换为 `HaiResult` |
| `requireAuth(handler)` | 验证 Bearer Token（`context.accessToken` 非空） |
| `requirePermission(permission, handler)` | 验证权限码，支持通配符 `'*'` |
| `audit(action, handler)` | 写入审计日志（需 `@h-ai/audit` 已初始化） |

```typescript
import { serv } from '@h-ai/serv'

const { mapHaiError, requireAuth, requirePermission, audit } = serv.pipeline.orpc

// 组合包装（从外到内：error → auth → permission → audit → handler）
const handler = mapHaiError(
  requireAuth(
    requirePermission('user:write',
      audit('user.create', actualHandler)
    )
  )
)
```

### `serv.createContext` — 默认 Context 工厂

从 HTTP 请求头自动解析：

| 字段 | 来源 |
| --- | --- |
| `accessToken` | `Authorization: Bearer <token>` |
| `requestId` | `x-request-id` 或自动生成 UUID |
| `ip` | `x-forwarded-for` / `x-real-ip` |
| `locale` | `accept-language` |
| `userAgent` | `user-agent` |

```typescript
// 自定义 context（注入 session）
const app = serv.createApp({
  contract,
  procedures,
  createContext: async (input) => {
    const base = await serv.createContext(input)
    const session = base.accessToken
      ? await iam.session.getByToken(base.accessToken)
      : undefined
    return { ...base, userId: session?.data?.userId }
  },
})
```

### `serv.openapi.generateSpec(contract, options)` — 生成 OpenAPI 文档

```typescript
const spec = await serv.openapi.generateSpec(apiServiceContract, {
  title: 'My API',
  version: '1.0.0',
  apiPrefix: '/api/v1',
  description: '接口说明',
})
// spec 为 OpenAPI 3.1 Document 对象
```

### `serv.openapi.createDocsPage(spec, options)` — 创建文档 HTML

```typescript
const html = serv.openapi.createDocsPage(spec, {
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
| `docs` | `false` | Scalar 文档页，显式开启 |
| `rpc` | `false` | 内部 RPC endpoint，显式开启 |

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

const { requireAuth, requirePermission } = serv.pipeline.orpc

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

## 测试

```bash
pnpm --filter @h-ai/serv test
pnpm --filter @h-ai/serv typecheck
pnpm --filter @h-ai/serv lint
```
