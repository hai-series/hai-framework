# @h-ai/api-client

> hai-framework 的跨端 oRPC/OpenAPI typed client，面向 Web、App、小程序等运行时提供统一 API 调用与 Token 管理。

## 能力概览

- `api`：默认绑定 iam/storage/ai 领域的单例 typed client。
- `createApiClient(contract)`：为自定义 contract 创建 typed client。
- 支持自定义 `fetch`，适配浏览器、Node、Capacitor、小程序桥接层。
- 支持 Bearer Token 自动注入、401 后刷新并重试一次。
- 网络错误统一转换为 `HaiResult` 错误。
- 可选传输加密：`api.init({ transport: { crypto } })` 自动使用 `crypto.transport.createClient()`。

## 快速开始

```ts
import { api } from '@h-ai/api-client'

await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {}, // 默认使用 httpOnly cookie 存储（推荐）；SSR 测试请显式传入 createMemoryTokenStorage()
})

const login = await api.iam.auth.login({
  identifier: 'alice',
  password: 'secret',
})

if (login.success) {
  // httpOnly cookie 模式下 refresh token 由服务端 Set-Cookie 管理，
  // api-client 默认存储只需要把 access token 写入内存。
  await api.auth.setTokens(login.data.tokens)
}

const me = await api.iam.auth.currentUser()

await api.close()
```

### 启用传输加密

服务端需先启用 `serv.createApp({ transport: { crypto } })`；客户端只注入同一个 `@h-ai/crypto` 服务实例，无需手写密钥协商代码。

```ts
import { api } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'

await crypto.init()

await api.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
  transport: { crypto }, // 默认协商路径：/api/v1/_hai/key-exchange
})

await api.close()
await crypto.close()
```

## API 契约

自定义应用可以绑定自己的 oRPC contract：

```ts
import { createApiClient } from '@h-ai/api-client'
import { createApiContract, iamContract } from '@h-ai/api-contract'

const contract = createApiContract({ iam: iamContract })
const client = createApiClient(contract)

await client.init({ baseUrl: 'https://api.example.com/api/v1' })
const result = await client.iam.auth.login({ identifier: 'alice', password: 'secret' })
```

## API 概览

- `api.init(config)`：初始化默认 client。
- `api.close()`：清理 client 状态。
- `api.auth.setTokens(tokens)`：写入 access token；非 httpOnly 存储会同时写入 refresh token。
- `api.auth.clear()`：清理 token。
- `createApiClient(contract)`：创建自定义 typed client。

## 配置

- `baseUrl`：API 基础地址，通常包含 `/api/v1`。
- `auth.storage`：Token 存储适配器；默认 `createHttpOnlyCookieTokenStorage()`（浏览器推荐）；SSR / 测试场景请显式传入 `createMemoryTokenStorage()`。
- `auth.refreshPath`：刷新 token 路径，默认 `/auth/refresh`。
- `timeout`：请求超时，默认 30000ms。
- `headers`：静态或动态公共请求头。
- `fetch`：自定义 fetch 实现。
- `transport.crypto`：启用透明请求/响应加解密，必须传入已初始化的 `@h-ai/crypto` 实例。
- `transport.keyExchangePath`：密钥协商子路径，默认 `/_hai/key-exchange`；会自动拼接到 `baseUrl` 后。

## 错误处理

业务 API 返回 `HaiResult<T>`：

```ts
const result = await api.iam.auth.currentUser()
if (!result.success) {
  // result.error.code / result.error.message
}
```

未初始化、网络错误、超时、401/403/404 等客户端侧问题也会转换为失败的 `HaiResult`。

## 测试

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

## License

Apache-2.0
