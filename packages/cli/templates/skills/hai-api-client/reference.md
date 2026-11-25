# hai-api-client 参考

> `@h-ai/api-client` 是跨端 typed API client。公共 HTTP API 由 `@h-ai/api-contract` 定义，服务端由 `@h-ai/serv` 挂载，客户端直接调用 `apiClient.<domain>.<group>.<operation>()`。


认证协议仅支持 v2：独立随机 SM4-CBC 密钥和 HMAC-SM3 密钥由 SM2 封装，先验签、再验证 MAC，最后解密 CBC。请求由客户端私钥签名，响应由所选服务端版本签名。认证字段包括 version、direction、serverKeyId、clientId、128 位随机 requestId（兼 nonce）、issuedAt、HTTP method、pathname + 原始 search 的 SM3 pathHash，以及响应 status。请求默认有效期为 5 分钟，客户端时间最多可领先服务器 30 秒。服务端可用 `maxRequestAgeSeconds`（1～600）和 `maxFutureSkewSeconds`（0～300）调整，单位为整数秒。共享 registry 原子消费 (clientId, requestId)，nonce 保留到 issuedAt + 11 分钟，覆盖最长可配窗口及节点时钟差，存储故障拒绝请求。Redis 必须保留有效 nonce，使用 noeviction/可靠持久化策略；各节点时钟须同步。此能力防止同一传输消息重放，业务重试仍需自己的幂等键。

空 POST 也发送空明文的认证封装；GET/HEAD 将封装放在 X-Hai-Transport 头，204/205/304/HEAD 等无正文响应也使用同名头承载认证封装。其它请求/响应在 JSON 正文承载封装并带 X-Encrypted: true。客户端必须关联原请求上下文和 HTTP status，缺标记、旧格式或认证失败一律 reject。CORS 须允许并暴露 X-Hai-Transport。握手公钥的真实性依赖 TLS，资源访问仍由服务端检查 IAM 权限。

对服务端通过 `encryption: disabled` 或 `transport.excludePaths` 允许普通 HTTPS 的路径，用普通 `fetch`（如 GET `/health`），或为已声明契约的路由创建独立 typed client，并在 `init` 中省略 `transport`。开启 `transport` 的实例以加密方式发送它的全部请求。若使用 `kit.client`，可用其 `excludePaths` 与服务端匹配。

## 使用步骤

`client.close()` 结束当前客户端运行期并等待已开始的凭据写入。宿主保留注入的 `TokenStorage`，之后可重新 init。请求 timeout 覆盖响应头、完整 JSON 和所有失败响应正文（包括 HTML）。自定义流按需读取，以调用方 signal 取消正文。内置 Cookie 适配器的登录和刷新包含跨域凭据，服务端须配置明确 Origin。内存或原生存储沿用原请求凭据策略。

### 1. 初始化

浏览器默认使用 httpOnly cookie 存储（推荐）：

```ts
import { apiClient } from '@h-ai/api-client'

// 使用 HTTPS API 地址和默认浏览器认证配置初始化单例。成功后可发送请求，失败结果包含配置错误。
await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
})
```

启用传输加密时，只传顶层 `crypto` 句柄；api-client 内部自动调用 `crypto.transport.createClient()`：

```ts
import { apiClient } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'

// 按默认配置初始化传输密码学依赖。成功后才可交给客户端，失败结果包含错误。
await crypto.init()

// 将已初始化的 crypto 交给指定 HTTPS 客户端。初始化失败时应先处理返回的错误。
await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
  transport: { crypto }, // 默认协商路径：/api/v1/_hai/key-exchange
})
```

App/Capacitor 场景传入自定义 TokenStorage：

```ts
import { capacitor } from '@h-ai/capacitor'

// 用 HTTPS 地址和原生认证存储初始化客户端。失败返回错误。
await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  // 创建原生安全令牌适配器供认证模块读写。原生存储不可用时，后续读写会失败。
  auth: { storage: capacitor.createTokenStorage() },
})
```

> `capacitor.createTokenStorage()` 仅在 Android/iOS 原生环境 + `@aparajita/capacitor-secure-storage` 已安装时持久化 token；纯 Web 不会回退到 `localStorage`。

SSR / Node.js 测试场景请显式传入内存存储：

```ts
import { apiClient } from '@h-ai/api-client'

// 用 HTTPS 地址和内存认证存储初始化客户端。失败返回错误。
await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  // 为本客户端创建空的进程内凭据存储。
  auth: { storage: apiClient.tokenStorage.memory() },
})
```

### 2. 调用 typed API

```ts
// 用示例账号口令登录。成功返回用户和令牌，认证失败时不进入下面的保存分支。
const login = await apiClient.iam.auth.login({ identifier: 'alice', password: 'secret' })
if (login.success) {
  // 默认 httpOnly cookie 模式下，refresh token 由服务端 Set-Cookie 管理。
  // 将登录返回的令牌交给当前认证存储。写入失败时 Promise 拒绝。
  await apiClient.auth.setTokens(login.data.tokens)
}

// 读取当前凭据对应的用户。成功返回用户、角色和权限，未登录等失败返回错误。
const me = await apiClient.iam.auth.currentUser()
if (me.success) {
  // currentUser 返回服务端最新角色/权限；不要把权限快照持久化到 localStorage。
  const { roles, permissions, ...user } = me.data
}
// 为 avatar.png 请求上传预签名 URL。成功返回上传信息，无权限或签名失败返回错误。
const upload = await apiClient.storage.presignedUrls.createUpload({ key: 'avatar.png' })
// 向聊天接口发送 hello。成功返回回答，接口或授权失败返回错误。
const answer = await apiClient.ai.chats.sendMessage({ message: 'hello' })
```

默认 `ai.chats.createCompletion({ messages, tools, tool_choice })` 只返回非流式 HaiResult JSON；不接受 stream 字段。完整 function 参数 JSON Schema、strict 与工具选择直接到模型。先检查 success，再读取助手 tool_calls；业务方授权执行工具后，以对应 tool_call_id 回传工具消息。流式接口须绑定应用自定义流契约。

### 3. 自定义 contract

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

// 只组合内置 IAM 路由，得到独立客户端使用的契约。
const contract = apiContract.create({ iam: apiContract.iam })
// 为该契约创建独立客户端，公开 IAM 调用。
const client = apiClient.create(contract)
// 配置此实例的 HTTPS API 地址。失败结果含初始化错误。
await client.init({ baseUrl: 'https://api.example.com/api/v1' })
```

`client.config` / `apiClient.config` 返回有效的绝对 `baseUrl` 和脱敏后的配置快照，`headers.authorization` 等敏感值会隐藏。

### 4. 关闭

```ts
// 关闭默认客户端，释放本地状态和观察者。完成后无业务数据。
await apiClient.close()
```

> 已初始化后再次 `init()` 会返回 `CONFIG_ERROR`，不会覆盖现有 client；切换 `baseUrl` / `fetch` / `transport` 前必须先 `close()`，避免旧 transport 会话泄漏。

## Token Storage 适配器

| 工厂调用 | 存储位置 | 适用场景 |
| --- | --- | --- |
| `apiClient.tokenStorage.httpOnlyCookie()` | httpOnly cookie（服务端管理） | **默认**；浏览器端推荐，refresh token 不暴露给 JS |
| `apiClient.tokenStorage.memory()` | 内存 | SSR / Node.js 单元测试（需显式传入） |

浏览器只使用内存 access token + 服务端 httpOnly refresh Cookie；原生端注入平台安全 TokenStorage。禁止将认证凭据持久化到 Web Storage。

### httpOnly Cookie 模式

Access token 存在内存中，refresh token 由服务端通过 `HttpOnly` cookie 管理，浏览器 JS 无法读取，可有效防止 XSS 窃取 token。

**前提**：服务端需配置 `serv.createApp({ iam, refreshCookie: {} })`，参见 `hai-serv` skill。

启用 `transport` 时，登录、业务请求以及 401 后的自动刷新都会复用同一个加密 fetch 链路；不要在业务代码中手写明文 `/auth/refresh` 请求。

一次逻辑请求绑定发起时的客户端运行期和身份。只有明确的认证拒绝可触发自动重试，例如真实 HTTP 401，或 HTTP 200 中具备 401 语义的有效失败 `HaiResult`。客户端进一步核对 IAM 会话错误码。内置认证入口及配置的 `auth.refreshPath` 排除在自动刷新之外。只有仍在运行且恢复到原身份的请求可重试一次，敏感操作按需重新取得用途票据。超时、取消和结果未知的写入交给调用方处理。

`auth.recoverSession` 用于明确的会话失效。配合 UI 的 `ui.createSessionRecovery` 时，把 `recovery.recover` 配到客户端，关闭恢复弹窗、退出或销毁布局时调用 `recovery.cancel()`。单个调用可通过 `AbortSignal` 停止等待和重试。

刷新端点报告 401 时清理凭据并通知。429、408、409 等其他失败、网络异常和超时保留原凭据。HTTP 200 的有效失败 HaiResult 使用 error.httpStatus 分类，后续业务请求可继续触发刷新。

```ts
import { apiClient } from '@h-ai/api-client'

// apiClient.tokenStorage.httpOnlyCookie() 是默认存储，无需显式指定
// 配置默认浏览器客户端的 HTTPS 地址和 Cookie 认证。初始化失败返回错误。
await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
})

// 登录后设置 access token（refresh token 由服务端写入 cookie，前端无需操作）
// 使用示例账号和口令登录。成功返回凭据，认证失败不写入。
const login = await apiClient.iam.auth.login({ identifier: 'alice', password: 'secret' })
if (login.success) {
  // 保存登录响应中的访问令牌。写入完成无业务数据，存储失败时拒绝。
  await apiClient.auth.setTokens(login.data.tokens)
}
```

## 核心 API

| API | 用途 |
| --- | --- |
| `apiClient.init(config)` | 初始化默认 API Service client；重复初始化返回 `CONFIG_ERROR` |
| `apiClient.close()` | 清理 client 状态 |
| `apiClient.auth.setTokens(tokens)` | 使旧刷新失效并替换凭据；非 httpOnly 存储保存提供的 refresh token，缺省时清除旧值 |
| `apiClient.auth.clear()` | 使旧刷新失效并清理本客户端 Token；服务端会话/Cookie 另由退出接口撤销 |
| `apiClient.auth.onTokenRefreshed(cb)` | 监听刷新结果 |
| `apiClient.create(contract)` | 创建自定义 typed client |
| `apiClient.tokenStorage.{memory,httpOnlyCookie}()` | TokenStorage 工厂 |

退出或换账号通过 `auth.clear()` / `auth.setTokens()` 更新本地凭据。方法使旧刷新失效，并按顺序提交本地存储操作。旧登录动作和刷新结果不能覆盖新的本地身份。Cookie 模式下先调用应用的退出接口撤销服务端会话并清除浏览器 Cookie，再清理本地凭据。SSR 按请求隔离含用户凭据的实例。

### Transport 配置

| 字段 | 说明 |
| --- | --- |
| `transport.crypto` | 已初始化的 `@h-ai/crypto` 实例 |
| `transport.keyExchangePath` | 相对于 `baseUrl` 的协商子路径，默认 `/_hai/key-exchange` |

服务端必须对应启用 `serv.createApp({ transport: { crypto, serverKeyRing, keyStore } })`。serverKeyRing 与 keyStore 仅服务端注入，生产各节点共用受管版本化 ring 和共享 registry；客户端只接收 serverKeyId/公钥并在请求密文带回版本，不得接收私钥。旧版本撤销后需销毁客户端会话并重协商，不自动重放非幂等请求。
自动刷新会沿用 `transport.encryptedFetch`，并在 httpOnly cookie 模式下发送空请求体 + `credentials: 'include'`，由服务端从 cookie 读取 refresh token。

CLI 独立 mobile 模板在选择 IAM/crypto 时安装前端 crypto 并默认启用该 transport，未选择 crypto 时保留明文 API 模式。`PUBLIC_API_TRANSPORT=off` 仅用于明确匹配的明文服务；`PUBLIC_API_KEY_EXCHANGE_PATH` 可调整公开协商子路径。配置先于 client 初始化，握手失败不会回退明文。关闭顺序为 client → 本客户端初始化的 crypto，不能关闭其他调用方已有的 crypto。

## 常见模式

- 浏览器可将同源根路径（如 `/api/v1`）作为 `baseUrl`。Node.js 和没有浏览器来源的设备使用 HTTP(S) 绝对地址。地址无效时，`init()` 返回 `CONFIG_ERROR`。初始化时将同源路径锚定到浏览器的来源（协议、主机和端口）。业务请求、刷新与加密握手都使用同一生效地址。地址中省略用户信息、查询参数和片段，协议相对地址（如 `//example.com`）会在初始化时报错。
- 标准业务错误通过 `HaiResult.success` 判断。自定义裸 JSON 值或 SSE 在调用失败时返回 `HaiResult<never>` 的失败分支。若成功值为数字，先用 `typeof result === 'number'` 确认识别成功值；对象可根据契约字段区分成功结果和 `success: false`。SSE 先检查 `Symbol.asyncIterator in result` 再迭代，流建立后沿用正常的迭代异常和取消行为。
- HTTP JSON 输出可转换为 Zod JSON Schema 时校验契约。响应不符返回 `VALIDATION_FAILED`，校验保留 ISO 字符串等线上数据。
- 动态领域可用 `client.payment?.orders` 访问。`then` 是保留属性，客户端及其领域对象可作为普通值通过 `await` 传递。
- 客户端不导入服务端 `procedures` 或 `@h-ai/serv`。
- 客户端不导入 `@h-ai/crypto` 的内部 transport 工厂，只通过 `transport: { crypto }` 装配。
- 前端只依赖 `@h-ai/api-client` 和 contract 类型，不依赖业务模块实现。
- httpOnly cookie 模式需服务端与客户端同步配置，跨 Origin 请求需正确设置 CORS 与 credentials；`SameSite=Strict` 限制跨站 Cookie，跨域不等于跨站。


## 配置驱动认证页面

`apiClient.createAuthActions(client)` 为含标准 iam contract 的客户端提供 publicConfig、login、register、sendOtp、requestPasswordReset、confirmPasswordReset。login 输入使用 identifier/password/method/code，method 为 password、ldap、email、sms。成功认证自动调用既有安全 TokenStorage；应用只需把动作传给 AuthPanel，并在 onauthenticated 中刷新自己的用户状态或导航。

传输容量默认从服务端握手获取 `maxPlaintextBytes`；可选客户端 `transport.maxPlaintextBytes` 只收紧上限。容量失败映射为 `HaiApiClientError.PAYLOAD_TOO_LARGE`（`hai:api-client:020`），cause 保留 direction/stage/limitBytes/actualBytes，应用可据此显示本地化提示。
