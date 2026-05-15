# @h-ai/serv

> hai-framework 的 Hono + oRPC API 服务运行时，用于把 `@h-ai/api-contract` 的 contract 挂载成跨端可访问的 HTTP API。

## 能力概览

- `serv.createApp()`：按 `contract / procedures / http` 三段式创建 Hono app。
- `serv.openapi.generateSpec()`：由 oRPC contract 生成 OpenAPI 文档。
- `serv.adapters.node.listen()` / `serv.adapters.fetch.createFetchHandler()`：Node 与 Fetch Runtime 适配。
- 默认 feature procedures：`createIamProcedures()`、`createStorageProcedures()`、`createAiProcedures()`。
- 内置安全响应头、健康检查、可选 OpenAPI JSON、可选文档页面、可选内部 RPC。

## 快速开始

```ts
import { ai } from '@h-ai/ai'
import { apiServiceContract } from '@h-ai/api-contract/presets/api-service'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { createAiProcedures } from '@h-ai/serv/features/ai'
import { createIamProcedures } from '@h-ai/serv/features/iam'
import { createStorageProcedures } from '@h-ai/serv/features/storage'
import { storage } from '@h-ai/storage'

const procedures = {
  iam: createIamProcedures({ iam }),
  storage: createStorageProcedures({ storage }),
  ai: createAiProcedures({ ai }),
}

const app = serv.createApp({
  contract: apiServiceContract,
  procedures,
  http: {
    apiPrefix: '/api/v1',
    openapi: { path: '/openapi.json' },
    docs: { path: '/docs' },
  },
})

const server = serv.adapters.node.listen(app, { port: 3000 })
await server.close()
```

## API 概览

- `serv.createApp(options)`：创建 Hono app 并挂载 oRPC OpenAPI handler。
- `serv.createContext({ request })`：从请求中提取 `accessToken`、`requestId` 等上下文。
- `serv.pipeline.orpc.requireAuth()`：procedure 认证包装器。
- `serv.pipeline.orpc.requirePermission()`：procedure 权限包装器。
- `serv.openapi.generateSpec(contract, options)`：生成 OpenAPI 3.1 文档。
- `serv.adapters.node.listen(app, options)`：启动 Node HTTP 服务。

## 配置

`ServHttpConfigInput` 默认值：

- `apiPrefix`：默认 `/api/v1`，OpenAPI HTTP API 前缀。
- `health`：默认 `{ path: '/health', readyPath: '/ready' }`，健康检查。
- `openapi`：默认 `false`，OpenAPI JSON endpoint，显式开启。
- `docs`：默认 `false`，Scalar 文档页，显式开启。
- `rpc`：默认 `false`，内部 RPC endpoint，显式开启。

## 错误处理

Default procedures 保持模块层 `HaiResult<T>` 返回形态。认证、授权和上游模块错误会被转换为统一 `HaiResult`，客户端直接判断 `result.success`。

## 测试

```bash
pnpm --filter @h-ai/serv test
pnpm --filter @h-ai/serv typecheck
```

## License

Apache-2.0
