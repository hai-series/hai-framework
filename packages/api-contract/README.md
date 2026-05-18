# @h-ai/api-contract

> hai-framework 的公共 HTTP API 契约包，使用 oRPC contract + Zod 作为唯一真相源。

## 能力概览

- `iamContract`、`storageContract`、`aiContract`、`paymentContract`：领域级 contract。
- `createApiContract()`：按应用场景组合启用的领域 contract。
- 公共 DTO Schema：所有 HTTP 输出统一包装为 `HaiResult<T>`。

## 快速开始

```ts
import { createApiContract, iamContract, storageContract } from '@h-ai/api-contract'

export const contract = createApiContract({
  iam: iamContract,
  storage: storageContract,
  ai: false,
})
```

## API 契约

```ts
import { aiContract, createApiContract, iamContract, storageContract } from '@h-ai/api-contract'

const myContract = createApiContract({ iam: iamContract, storage: storageContract, ai: aiContract })

myContract.iam.auth.login
myContract.storage.presignedUrls.createUpload
myContract.ai.chats.createCompletion
```

客户端通过 `@h-ai/api-client` 直接调用嵌套方法：

```ts
import { api } from '@h-ai/api-client'

await api.init({ baseUrl: 'https://api.example.com/api/v1' })
const login = await api.iam.auth.login({ identifier: 'alice', password: 'secret' })
await api.close()
```

服务端通过 `@h-ai/serv` 挂载：

```ts
import { aiContract, createApiContract, iamContract, storageContract } from '@h-ai/api-contract'
import { serv } from '@h-ai/serv'

const contract = createApiContract({ iam: iamContract, storage: storageContract, ai: aiContract })

const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
})
```

## API 概览

- `createApiContract(options)`：过滤 `false` / `undefined` 领域并组合应用级 contract。
- `Iam*Schema` / `Storage*Schema` / `Ai*Schema` / `Payment*Schema`：公共 HTTP DTO Schema。

## 配置

本包无运行时配置，不读取环境变量。

## 错误处理

Contract 只描述输入输出结构。业务错误由 procedure 返回 `HaiResult<T>` 表达，客户端不需要捕获业务异常。

## 测试

```bash
pnpm --filter @h-ai/api-contract test
pnpm --filter @h-ai/api-contract typecheck
```

## License

Apache-2.0
