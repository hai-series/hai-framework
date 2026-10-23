# @h-ai/api-service-contract

## 简介

api-service 与桌面端等客户端共享的应用级 HTTP API 契约包。

## 核心功能清单

- `apiServiceContract`：组合 `iam`、`storage`、`ai` 与 api-service 自有 `app` contract。
- `appContract`：api-service 自有端点，包含 `app.info` 与 `app.echo`。
- `App*Schema` / `App*` 类型：跨 procedure 与实现层复用的输入/数据 Schema 与类型。

## 使用入门

### 快速开始

```ts
import { apiClient } from '@h-ai/api-client'
import { apiServiceContract } from '@h-ai/api-service-contract'
import { crypto } from '@h-ai/crypto'

const initialized = await crypto.init()
if (!initialized.success)
  throw new Error(initialized.error.message)
const client = apiClient.create(apiServiceContract)
try {
  const ready = await client.init({
    baseUrl: 'http://localhost:3000/api/v1',
    transport: { crypto },
  })
  if (!ready.success)
    throw new Error(ready.error.message)
  const info = await client.app.info()
  if (!info.success)
    throw new Error(info.error.message)
}
finally {
  await client.close()
  await crypto.close()
}
```

先启动 api-service；它默认要求业务请求使用加密传输。`app.info` 可匿名访问，`app.echo` 需要先登录并设置 tokens，完整流程见 [API 服务](../api-service/README.md)。

### API 契约

```ts
import { apiServiceContract } from '@h-ai/api-service-contract'

apiServiceContract.iam.auth.login
apiServiceContract.storage.presignedUrls.createUpload
apiServiceContract.ai.chats.createCompletion
apiServiceContract.app.info
apiServiceContract.app.echo
```

### API 概览

- `apiServiceContract`：完整应用级 contract，供 `@h-ai/serv` 与 `@h-ai/api-client` 共同使用。
- `appContract.info`：`POST /app/info`，公开服务元信息。
- `appContract.echo`：`POST /app/echo`，需登录后回显消息与调用者上下文。

### 配置

本包无运行时配置，不读取环境变量。API 前缀、基础设施路径、CORS Header 与加密传输设置由服务端 `config/_serv.yml` 管理。

### 错误处理

Contract 只描述输入输出结构。业务错误由 api-service procedure 返回 `HaiResult<T>` 表达。

## 开发测试

```bash
pnpm --filter @h-ai/api-service-contract test
pnpm --filter @h-ai/api-service-contract typecheck
pnpm --filter @h-ai/api-service-contract lint
```

## 许可证

Apache-2.0
