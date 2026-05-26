# @h-ai/api-service-contract

api-service 与桌面端等客户端共享的应用级 HTTP API 契约包。

## 能力概览

- `apiServiceContract`：组合 `iam`、`storage`、`ai` 与 api-service 自有 `app` contract。
- `appContract`：api-service 自有端点，包含 `app.info` 与 `app.echo`。
- `App*Schema` / `App*` 类型：自有端点的输入输出 Schema 与类型。

## 快速开始

```ts
import { apiClient } from '@h-ai/api-client'
import { apiServiceContract } from '@h-ai/api-service-contract'

const client = apiClient.create(apiServiceContract)
await client.init({ baseUrl: 'https://api.example.com/api/v1' })

const info = await client.app.info()
const echo = await client.app.echo({ message: 'hello' })

await client.close()

void info
void echo
```

## API 契约

```ts
import { apiServiceContract } from '@h-ai/api-service-contract'

apiServiceContract.iam.auth.login
apiServiceContract.storage.presignedUrls.createUpload
apiServiceContract.ai.chats.createCompletion
apiServiceContract.app.info
apiServiceContract.app.echo
```

## API 概览

- `apiServiceContract`：完整应用级 contract，供 `@h-ai/serv` 与 `@h-ai/api-client` 共同使用。
- `appContract.info`：`POST /app/info`，公开服务元信息。
- `appContract.echo`：`POST /app/echo`，需登录后回显消息与调用者上下文。

## 配置

本包无运行时配置，不读取环境变量。

## 错误处理

Contract 只描述输入输出结构。业务错误由 api-service procedure 返回 `HaiResult<T>` 表达。

## 测试

```bash
pnpm --filter @h-ai/api-service-contract test
pnpm --filter @h-ai/api-service-contract typecheck
pnpm --filter @h-ai/api-service-contract lint
```

## License

Apache-2.0
