# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

普通请求与 Token 刷新默认使用当前 `core.i18n` 语言作为 `Accept-Language`，服务端错误随界面语言切换。可通过 `headers` 显式覆盖该请求头。

[框架首页](../../README.md) · 相关模块：[@h-ai/api-contract](../api-contract/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md)

## 简介

hai-framework 的跨端 oRPC/OpenAPI typed client，面向 Web、App、小程序等运行时提供统一 API 调用与 Token 管理。

## 核心功能清单

- `apiClient`：默认绑定 iam/storage/ai 领域的统一 typed client 入口。
- `apiClient.create(contract)`：为自定义 contract 创建 typed client。
- `apiClient.tokenStorage.{memory,httpOnlyCookie}()`：Token 存储工厂。浏览器使用内存 access token + 服务端 httpOnly refresh Cookie；原生端注入平台安全存储，不将凭据写入 Web Storage。
- 支持自定义 `fetch`，适配浏览器、Node、Capacitor、小程序桥接层。
- 支持 Bearer Token 自动注入、401 后刷新并重试一次。
- 网络错误统一转换为 `HaiResult` 错误。
- 可选传输加密：`apiClient.init({ transport: { crypto } })` 自动使用 `crypto.transport.createClient()`。
- 传输加密与自动刷新可同时启用：401 后的 `/auth/refresh` 会继续走 encrypted fetch，不降级明文。

## 使用入门

### 快速开始

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

#### 启用传输加密

服务端需先启用 `serv.createApp({ transport: { crypto, serverKeyRing, keyStore } })`；客户端只注入同一个 `@h-ai/crypto` 服务实例，无需手写密钥协商代码。

服务端必须注入受管 serverKeyRing 和共享 registry；客户端只接收 serverKeyId/公钥，并在密文请求带回版本。密钥环/私钥不进入客户端配置。旧版本撤销后，销毁 transport 会话并重新协商；不要自动重放非幂等业务。

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

认证协议仅支持 v2：独立随机 SM4-CBC 密钥和 HMAC-SM3 密钥由 SM2 封装，先验签、再验证 MAC，最后解密 CBC。请求由客户端私钥签名，响应由所选服务端版本签名。认证字段包括 version、direction、serverKeyId、clientId、128 位随机 requestId（兼 nonce）、issuedAt、HTTP method、pathname + 原始 search 的 SM3 pathHash，以及响应 status。请求有效期 5 分钟，未来时钟偏差最多 30 秒；共享 registry 原子消费 (clientId, requestId)，nonce 至少保留到 issuedAt + 6 分钟以覆盖节点偏差，存储故障拒绝请求。Redis 必须保留有效 nonce，使用 noeviction/可靠持久化策略；各节点时钟须同步。此能力防止同一传输消息重放，业务重试仍需自己的幂等键。

空 POST 也发送空明文的认证封装；GET/HEAD 将封装放在 X-Hai-Transport 头，204/304/HEAD 等无正文响应也使用同名头承载认证封装。其它请求/响应在 JSON 正文承载封装并带 X-Encrypted: true。客户端必须关联原请求上下文和 HTTP status，缺标记、旧格式或认证失败一律 reject；明文接口只能经 excludePaths 显式排除。CORS 须允许并暴露 X-Hai-Transport。握手公钥的真实性依赖 TLS，不替代 IAM 业务授权。

### API 契约

默认 `apiClient.ai.chats.createCompletion({ messages, tools, tool_choice })` 使用非流式 JSON 契约，完整传递 function 工具的嵌套 JSON Schema 与 `strict`。先判断 `success`，再读取 `data.choices[].message.tool_calls`；业务方授权执行后，把助手工具调用和带对应 `tool_call_id` 的工具结果放入下一次 `messages`。输入不支持 `stream`，即使绕过 TypeScript 传入也会被服务端拒绝；流式接口须绑定应用自己的流契约。

自定义应用可以绑定自己的 oRPC contract：

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

const contract = apiContract.create({ iam: apiContract.iam })
const client = apiClient.create(contract)

await client.init({ baseUrl: 'https://api.example.com/api/v1' })
const result = await client.iam.auth.login({ identifier: 'alice', password: 'secret' })
```

### API 概览

- `apiClient.init(config)`：初始化默认 client。
- `apiClient.close()`：清理 client 状态。
- `apiClient.auth.setTokens(tokens)`：替换凭据，写入 access token；非 httpOnly 存储写入提供的 refresh token，缺省时清除旧值。
- `apiClient.auth.clear()`：清理 token。
- `apiClient.create(contract)`：创建自定义 typed client。

`auth.clear()` 和 `auth.setTokens()` 会立即取消并作废当前客户端的旧刷新请求。迟到的成功或 401 响应不会恢复已退出会话、覆盖新账号或触发旧刷新回调；存储写入串行提交，方法完成后不会再被之前已开始的异步写入覆盖。退出和切换账号须通过这些方法更新凭据，不直接修改 storage。httpOnly Cookie 和服务端会话仍由服务端退出接口撤销。

已初始化后再次调用 `init()` 会返回 `CONFIG_ERROR`，不会覆盖现有 client；如需切换 `baseUrl` / `fetch` / `transport`，请先 `await apiClient.close()` 再重新初始化。

### 配置

- `baseUrl`：API 基础地址，通常包含 `/api/v1`。
- `auth.storage`：Token 存储适配器；默认 `apiClient.tokenStorage.httpOnlyCookie()`（浏览器推荐）；SSR / 测试场景请显式传入 `apiClient.tokenStorage.memory()`。
- `auth.refreshPath`：刷新 token 路径，默认 `/auth/refresh`。
- `timeout`：请求超时，默认 30000ms。
- `headers`：静态或动态公共请求头。
- `fetch`：自定义 fetch 实现。
- `transport.crypto`：启用透明请求/响应加解密，必须传入已初始化的 `@h-ai/crypto` 实例。
- `transport.keyExchangePath`：密钥协商子路径，默认 `/_hai/key-exchange`；会自动拼接到 `baseUrl` 后。
- `apiClient.config`：返回**脱敏后的运行配置快照**；`baseUrl` 的内嵌凭证、`headers.authorization` 等敏感值会自动隐藏。

### 配置驱动认证页面

密码登录只提交 `identifier` 和 `password`；`AuthPanel` 将 `LoginForm` 的 `username` 映射为 `identifier`。会话有效期由服务端 `session.maxAge` / `session.refreshTokenMaxAge` 配置决定，登录表单不提供按次登录的持久会话选项。

协议支持配置中的 userAgreementMarkdown/privacyPolicyMarkdown 正文及 URL；同主题优先 Markdown，由安全渲染器在弹窗显示。

`apiClient.createAuthActions(client)` 为含标准 iam contract 的客户端提供 publicConfig、login、register、sendOtp、requestPasswordReset、confirmPasswordReset。login 输入使用 identifier/password/method/code，method 为 password、ldap、email、sms。成功认证自动调用既有安全 TokenStorage；应用只需把动作传给 AuthPanel，并在 onauthenticated 中刷新自己的用户状态或导航。

[完整 IAM 配置 / IAM configuration](../iam/README.md)

### 错误处理

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

## 开发测试

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

## 输入约束与 HTTP 能力

存储 key 按 UTF-8 最多 1024 字节，并拒绝绝对路径、反斜线、控制字符及点路径段；公开 HTTP 批量删除每次 1–1000 项。`@h-ai/storage/schemas` 提供浏览器安全的共同规则。预签名有效期为整数 1–604800 秒（Node 默认 3600，HTTP 默认 900）；HTTP 上传仅接受 key/contentType/expiresIn，不支持 contentLength/maxSize/metadata/checksum。无效输入返回 HTTP 400，typed client 映射 VALIDATION_FAILED。FileUpload 的大小/类型限制仅为前端体验，实际对象须由应用服务端复核。Node 流式读写/checksum/条件写等没有默认 HTTP 端点。完整映射与授权边界见 [存储 API 能力](../../docs/storage-api-capabilities.md)。

## 许可证

Apache-2.0
