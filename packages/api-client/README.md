# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/api-contract](../api-contract/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md)

> hai-framework 的跨端 oRPC/OpenAPI typed client，面向 Web、App、小程序等运行时提供统一 API 调用与 Token 管理。

## 能力概览

- `apiClient`：默认绑定 iam/storage/ai 领域的统一 typed client 入口。
- `apiClient.create(contract)`：为自定义 contract 创建 typed client。
- `apiClient.tokenStorage.{memory,localStorage,httpOnlyCookie}()`：Token 存储工厂。
- 支持自定义 `fetch`，适配浏览器、Node、Capacitor、小程序桥接层。
- 支持 Bearer Token 自动注入、401 后刷新并重试一次。
- 网络错误统一转换为 `HaiResult` 错误。
- 可选传输加密：`apiClient.init({ transport: { crypto } })` 自动使用 `crypto.transport.createClient()`。
- 传输加密与自动刷新可同时启用：401 后的 `/auth/refresh` 会继续走 encrypted fetch，不降级明文。

## 快速开始

```ts
import { apiClient } from '@h-ai/api-client'

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {}, // 默认使用 httpOnly cookie 存储（推荐）；SSR 测试请显式传入 apiClient.tokenStorage.memory()
})

const login = await apiClient.iam.auth.login({
  identifier: 'alice',
  password: 'secret',
})

if (login.success) {
  // httpOnly cookie 模式下 refresh token 由服务端 Set-Cookie 管理，
  // api-client 默认存储只需要把 access token 写入内存。
  await apiClient.auth.setTokens(login.data.tokens)
}

const me = await apiClient.iam.auth.currentUser()
if (me.success) {
  // 身份资料与服务端重新校验后的访问范围一次返回，客户端无需持久化权限快照。
  const { roles, permissions, ...user } = me.data
}

await apiClient.close()
```

### 启用传输加密

服务端需先启用 `serv.createApp({ transport: { crypto } })`；客户端只注入同一个 `@h-ai/crypto` 服务实例，无需手写密钥协商代码。

```ts
import { apiClient } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'

await crypto.init()

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
  transport: { crypto }, // 默认协商路径：/api/v1/_hai/key-exchange
})

await apiClient.close()
await crypto.close()
```

## API 契约

自定义应用可以绑定自己的 oRPC contract：

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

const contract = apiContract.create({ iam: apiContract.iam })
const client = apiClient.create(contract)

await client.init({ baseUrl: 'https://api.example.com/api/v1' })
const result = await client.iam.auth.login({ identifier: 'alice', password: 'secret' })
```

## API 概览

- `apiClient.init(config)`：初始化默认 client。
- `apiClient.close()`：清理 client 状态。
- `apiClient.auth.setTokens(tokens)`：写入 access token；非 httpOnly 存储会同时写入 refresh token。
- `apiClient.auth.clear()`：清理 token。
- `apiClient.create(contract)`：创建自定义 typed client。

已初始化后再次调用 `init()` 会返回 `CONFIG_ERROR`，不会覆盖现有 client；如需切换 `baseUrl` / `fetch` / `transport`，请先 `await apiClient.close()` 再重新初始化。

## 配置

- `baseUrl`：API 基础地址，通常包含 `/api/v1`。
- `auth.storage`：Token 存储适配器；默认 `apiClient.tokenStorage.httpOnlyCookie()`（浏览器推荐）；SSR / 测试场景请显式传入 `apiClient.tokenStorage.memory()`。
- `auth.refreshPath`：刷新 token 路径，默认 `/auth/refresh`。
- `timeout`：请求超时，默认 30000ms。
- `headers`：静态或动态公共请求头。
- `fetch`：自定义 fetch 实现。
- `transport.crypto`：启用透明请求/响应加解密，必须传入已初始化的 `@h-ai/crypto` 实例。
- `transport.keyExchangePath`：密钥协商子路径，默认 `/_hai/key-exchange`；会自动拼接到 `baseUrl` 后。
- `apiClient.config`：返回**脱敏后的运行配置快照**；`baseUrl` 的内嵌凭证、`headers.authorization` 等敏感值会自动隐藏。

## 配置驱动认证页面

协议支持配置中的 userAgreementMarkdown/privacyPolicyMarkdown 正文及 URL；同主题优先 Markdown，由安全渲染器在弹窗显示。

`apiClient.createAuthActions(client)` 为含标准 iam contract 的客户端提供 publicConfig、login、register、sendOtp、requestPasswordReset、confirmPasswordReset。login 输入使用 identifier/password/method/code，method 为 password、ldap、email、sms。成功认证自动调用既有安全 TokenStorage；应用只需把动作传给 AuthPanel，并在 onauthenticated 中刷新自己的用户状态或导航。

[完整 IAM 配置 / IAM configuration](../iam/README.md)

## 错误处理

业务 API 返回 `HaiResult<T>`：

```ts
const result = await apiClient.iam.auth.currentUser()
if (!result.success) {
  // result.error.code / result.error.message
}
else {
  // result.data = User & { roles: string[], permissions: string[] }
}
```

未初始化、网络错误、超时、401/403/404 等客户端侧问题也会转换为失败的 `HaiResult`。

自动刷新在真实 HTTP 401（`Response.status`）或 HTTP 200 的有效失败 HaiResult（`success=false`、`error.code/message` 为字符串且 `error.httpStatus=401`）后触发，刷新成功后只重试一次原请求。内置登录、注册与配置的 `auth.refreshPath` 不触发自动刷新，403/500 等其它失败也不会触发。serv 普通 procedure 的 HTTP 状态仍为 200；调用方须检查最终结果的 `success` 与 `error.code`，并处理刷新失败后的登录失效。

## 测试

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

## License

Apache-2.0
