# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

普通请求与 Token 刷新默认使用当前 `core.i18n` 语言作为 `Accept-Language`，服务端错误随界面语言切换。可通过 `headers` 显式覆盖该请求头。

[框架首页](../../README.md) · 相关模块：[@h-ai/api-contract](../api-contract/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md)

hai-framework 的跨端 oRPC/OpenAPI typed client，面向 Web、App、小程序等运行时提供统一 API 调用与 Token 管理。

## 快速开始

`close()` 会使旧刷新失效并等待已有凭据写入完成，保留外置 TokenStorage 当前值；关闭完成后可复用同一存储重新初始化。`timeout` 覆盖响应头、完整 JSON 正文及所有非成功响应正文（包括 HTML 错误页）；超时或取消后不再刷新凭据。内置 Cookie 适配器的登录和刷新使用 `credentials: include`，跨域服务须明确允许凭据与 Origin；内存和原生存储保留原请求的凭据策略。应用自定义流按需读取，其正文由调用方 signal 取消。

```ts
import type { IamAuthLoginInput } from '@h-ai/api-client'
import { apiClient } from '@h-ai/api-client'

async function loginAndLoadProfile(input: IamAuthLoginInput) {
  const initialized = await apiClient.init({ baseUrl: '/api/v1', auth: {} })
  if (!initialized.success)
    return initialized
  try {
    const actions = apiClient.createAuthActions(apiClient)
    const loggedIn = await actions.login(input)
    if (!loggedIn.success)
      return loggedIn
    const profile = await apiClient.iam.auth.currentUser()
    if (!profile.success)
      return profile
    return profile
  }
  catch (writeError) {
    try {
      await apiClient.auth.clear()
    }
    catch (cleanupError) {
      throw new AggregateError([writeError, cleanupError], 'Credential persistence and cleanup failed')
    }
    throw writeError
  }
  finally {
    await apiClient.close()
  }
}
```

## 功能

### 用途、输入与输出

调用前完成本页初始化。命名变量为经校验的宿主输入；HaiResult 先判 success。auth 和存储操作的 Promise<void> 失败会 reject，必须显示失败并处理清理故障，不能按业务 success 假报登录完成。

| 入口                                    | 输入                            | 输出                       | 用途与失败边界                                     | 示例                                                         |
| --------------------------------------- | ------------------------------- | -------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| `apiClient.init`                        | config: baseUrl、认证及传输选项 | `Promise<HaiResult<void>>` | 准备当前客户端，失败停止调用                       | `await apiClient.init({ baseUrl: '/api/v1', auth: {} })`     |
| `apiClient.close`                       | 无参数                          | `Promise<void>`            | 作废在途刷新并释放本实例；不等于服务端退出         | `await apiClient.close()`                                    |
| `apiClient.create`                      | contract: 应用共享契约          | `ApiClient<TContract>`     | 创建隔离实例，SSR 每个请求独立创建                 | `apiClient.create(contract)`                                 |
| `apiClient.auth.setTokens`              | TokenPair: 可信认证响应         | `Promise<void>`            | 串行保存并废弃旧刷新；存储故障 reject              | `await apiClient.auth.setTokens(tokens)`                     |
| `apiClient.auth.clear`                  | 无参数                          | `Promise<void>`            | 清理本地凭据；失败 reject，服务端仍须 logout       | `await apiClient.auth.clear()`                               |
| `apiClient.auth.onTokenRefreshed`       | callback(TokenPair)             | `() => void`               | 保存成功后观察刷新，返回取消函数；不输出 Token     | `apiClient.auth.onTokenRefreshed(() => refreshProfile())`    |
| `apiClient.tokenStorage.memory`         | 无参数                          | `TokenStorage`             | Node/SSR/测试的独立内存适配器                      | `apiClient.tokenStorage.memory()`                            |
| `apiClient.tokenStorage.httpOnlyCookie` | 无参数                          | `TokenStorage`             | 浏览器 access 在内存，refresh 由服务端 Cookie 管理 | `apiClient.tokenStorage.httpOnlyCookie()`                    |
| `apiClient.createAuthActions`           | client: 含标准 IAM 契约         | `Auth actions object`      | 连接认证表单；先 init 并启用 auth                  | `apiClient.createAuthActions(apiClient)`                     |
| `apiClient.observeRequests`             | observer(ApiRequestRecord)      | `() => void`               | 观察脱敏逻辑结果，返回取消函数                     | `apiClient.observeRequests(record => reportOutcome(record))` |

#### 认证表单动作

`const actions = apiClient.createAuthActions(apiClient)`

| 入口                           | 输入                                            | 输出                                          | 用途与失败边界                                           | 示例                                                                 |
| ------------------------------ | ----------------------------------------------- | --------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| `actions.publicConfig`         | —                                               | `Promise<HaiResult<T>>` → IamPublicConfig     | 读取公开登录/注册策略                                    | `await actions.publicConfig()`                                       |
| `actions.createCaptcha`        | { operation }                                   | `Promise<HaiResult<T>>` → IamCaptchaChallenge | 获取所选操作的挑战                                       | `await actions.createCaptcha({ operation: 'login' })`                |
| `actions.login`                | IamAuthLoginInput                               | `Promise<HaiResult<T>>` → 认证结果与 Token    | 映射 password/ldap/email/sms 并等待存储成功              | `await actions.login({ identifier, password })`                      |
| `actions.register`             | IamRegisterInput                                | `Promise<HaiResult<T>>` → 注册认证结果        | 按服务端注册策略创建身份并保存凭据                       | `await actions.register({ username, password })`                     |
| `actions.sendOtp`              | identifier, { captcha? }?                       | `Promise<HaiResult<T>>` → { expiresAt }       | 发送邮箱/手机验证码，不等于完成登录                      | `await actions.sendOtp(identifier)`                                  |
| `actions.requestPasswordReset` | identifier, { captcha? }?                       | `Promise<HaiResult<T>>` → void                | 申请重置，按服务端策略隐藏账户存在性                     | `await actions.requestPasswordReset(identifier)`                     |
| `actions.confirmPasswordReset` | token, newPassword                              | `Promise<HaiResult<T>>` → void                | 消费专用重置 Token 修改密码                              | `await actions.confirmPasswordReset(resetToken, newPassword)`        |
| `actions.renewPassword`        | { identifier, password, newPassword, captcha? } | `Promise<HaiResult<T>>` → void                | 完成密码到期续密流程                                     | `await actions.renewPassword({ identifier, password, newPassword })` |
| `actions.reauthenticate`       | password, operation                             | `Promise<HaiResult<T>>` → 用途票据            | 为本次敏感操作取得短期用途凭据                           | `await actions.reauthenticate(password, 'users:delete')`             |
| `actions.bindPageExit`         | { enabled? }                                    | `() => void`                                  | 安装页面退出监听并返回清理函数；尽力撤销而非可靠离线通知 | `actions.bindPageExit({ enabled: endOnPageHide })`                   |

#### 安全存储实例

`const storage = apiClient.tokenStorage.memory()`

| 入口                      | 输入  | 输出                      | 用途与失败边界                                     | 示例                                          |
| ------------------------- | ----- | ------------------------- | -------------------------------------------------- | --------------------------------------------- |
| `storage.getAccessToken`  | —     | `Promise<string \| null>` | 读取 access；null 仅为不存在                       | `await storage.getAccessToken()`              |
| `storage.setAccessToken`  | token | `Promise<void>`           | 保存 access，已绑定客户端改用 auth.setTokens       | `await storage.setAccessToken(accessToken)`   |
| `storage.getRefreshToken` | —     | `Promise<string \| null>` | Cookie 模式是内部哨兵，不读取 httpOnly Cookie 原文 | `await storage.getRefreshToken()`             |
| `storage.setRefreshToken` | token | `Promise<void>`           | 内存适配器保存；Cookie 适配器不改服务端 Cookie     | `await storage.setRefreshToken(refreshToken)` |
| `storage.clear`           | —     | `Promise<void>`           | 清本适配器凭据，失败 reject；不撤销服务端会话      | `await storage.clear()`                       |

#### 默认业务领域

默认领域是 api-contract 的 HTTP 契约，不是服务端模块对象的完整镜像；自定义 client 仅包含传入 contract 的领域。

- `apiClient.iam`: IAM 登录/注册/用户/角色/权限 — [API Contract](../api-contract/README.md), [IAM](../iam/README.md).
- `apiClient.storage`: 存储列表、元数据、预签名和删除 — [API Contract](../api-contract/README.md), [Storage](../storage/README.md).
- `apiClient.ai`: AI 非流式聊天 — [API Contract](../api-contract/README.md), [AI](../ai/README.md).

数组型输入/输出、权限与业务错误按实际契约。服务端决定身份和资源授权，客户端配置不能授予权限。

```ts
const files = await apiClient.storage.files.list({ prefix: 'reports/', maxKeys: 20 })
if (!files.success)
  throw new Error(files.error.message)
const chat = await apiClient.ai.chats.createCompletion({
  messages: [
    { role: 'user', content: 'Summarize this public report.' }
  ],
})
if (!chat.success)
  throw new Error(chat.error.message)
```

`apiClient.config` 是脱敏运行快照（未初始化为 null），不能用于恢复真实密钥；`apiClient.isInitialized` 为就绪 boolean。它们是只读属性，不发起网络请求。

### 启用传输加密

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

认证协议仅支持 v2：独立随机 SM4-CBC 密钥和 HMAC-SM3 密钥由 SM2 封装，先验签、再验证 MAC，最后解密 CBC。请求由客户端私钥签名，响应由所选服务端版本签名。认证字段包括 version、direction、serverKeyId、clientId、128 位随机 requestId（兼 nonce）、issuedAt、HTTP method、pathname + 原始 search 的 SM3 pathHash，以及响应 status。请求默认有效期为 5 分钟，客户端时间最多可领先服务器 30 秒。服务端可用 `maxRequestAgeSeconds`（1～600）和 `maxFutureSkewSeconds`（0～300）调整，单位为整数秒。共享 registry 原子消费 (clientId, requestId)，nonce 保留到 issuedAt + 11 分钟，覆盖最长可配窗口及节点时钟差，存储故障拒绝请求。Redis 必须保留有效 nonce，使用 noeviction/可靠持久化策略；各节点时钟须同步。此能力防止同一传输消息重放，业务重试仍需自己的幂等键。

空 POST 也发送空明文的认证封装；GET/HEAD 将封装放在 X-Hai-Transport 头，204/304/HEAD 等无正文响应也使用同名头承载认证封装。其它请求/响应在 JSON 正文承载封装并带 X-Encrypted: true。客户端必须关联原请求上下文和 HTTP status，缺标记、旧格式或认证失败一律 reject；明文接口由 Serv/Kit 路径规则 `encryption: disabled` 或宿主 `excludePaths` 显式允许；调用方同步选择普通请求，API Client/Kit 包装器使用自己的 `excludePaths`。CORS 须允许并暴露 X-Hai-Transport。握手公钥的真实性依赖 TLS，不替代 IAM 业务授权。

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

### 凭据更新与关闭

`auth.clear()` 和 `auth.setTokens()` 会立即取消并作废当前客户端的旧刷新请求。迟到的成功或 401 响应不会恢复已退出会话、覆盖新账号或触发旧刷新回调；存储写入串行提交，方法完成后不会再被之前已开始的异步写入覆盖。退出和切换账号须通过这些方法更新凭据，不直接修改 storage。httpOnly Cookie 和服务端会话仍由服务端退出接口撤销。

已初始化后再次调用 `init()` 会返回 `CONFIG_ERROR`，不会覆盖现有 client；如需切换 `baseUrl` / `fetch` / `transport`，请先 `await apiClient.close()` 再重新初始化。

### 配置驱动认证页面

密码登录只提交 `identifier` 和 `password`；`AuthPanel` 将 `LoginForm` 的 `username` 映射为 `identifier`。会话有效期由服务端 `session.maxAge` / `session.refreshTokenMaxAge` 配置决定，登录表单不提供按次登录的持久会话选项。

协议支持配置中的 userAgreementMarkdown/privacyPolicyMarkdown 正文及 URL；同主题优先 Markdown，由安全渲染器在弹窗显示。

`apiClient.createAuthActions(client)` 为含标准 iam contract 的客户端提供 publicConfig、login、register、sendOtp、requestPasswordReset、confirmPasswordReset。login 输入使用 identifier/password/method/code，method 为 password、ldap、email、sms。成功认证自动调用既有安全 TokenStorage；应用只需把动作传给 AuthPanel，并在 onauthenticated 中刷新自己的用户状态或导航。

[完整 IAM 配置 / IAM configuration](../iam/README.md)

### 输入约束与 HTTP 能力

存储 key 按 UTF-8 最多 1024 字节，并拒绝绝对路径、反斜线、控制字符及点路径段；公开 HTTP 批量删除每次 1–1000 项。`@h-ai/storage/schemas` 提供浏览器安全的共同规则。预签名有效期为整数 1–604800 秒（Node 默认 3600，HTTP 默认 900）；HTTP 上传仅接受 key/contentType/expiresIn，不支持 contentLength/maxSize/metadata/checksum。无效输入返回 HTTP 400，typed client 映射 VALIDATION_FAILED。FileUpload 的大小/类型限制仅为前端体验，实际对象须由应用服务端复核。Node 流式读写/checksum/条件写等没有默认 HTTP 端点。完整映射与授权边界见 [存储 API 能力](../storage/README.md#存储输入约束与跨端能力)。

### 逻辑请求观察

`client.observeRequests` 返回可取消的逻辑请求观察：requestId、procedure、耗时、HTTP 状态、最终 success/errorCode 与实际业务请求 attempts。HTTP 200 的失败 HaiResult 也记为失败，自动刷新后的重试保留同一 requestId，整个逻辑调用只产生一次结果。记录不包含正文、Token 或 URL 查询参数。刷新/密钥协商不伪装成用户业务操作；close 清理本实例的订阅，重新 init 后需重新订阅。

```ts
import { apiClient } from '@h-ai/api-client'

const unsubscribe = apiClient.observeRequests((record) => {
  const failed = !record.success
  const requestId = record.requestId
})
unsubscribe()
```

### 可选交互挑战

createAuthActions(client) 提供 createCaptcha({operation})，所有登录映射与续期/注册会保留 captcha；sendOtp(identifier,{captcha})、requestPasswordReset(identifier,{captcha}) 接收可选第二参数。框架 AuthPanel 自动求解，自定义表单复用 ALTCHA 协议，证明不进入安全 TokenStorage。

策略、默认值和恢复边界见 [IAM](../iam/README.md)。

### 敏感请求再认证

客户端单次调用的 `options.context.reauthentication` 携带 `reauthenticate` 返回的用途凭据，由请求管线生成 `X-Hai-Reauthentication`。不要写入客户端全局 header、持久存储或日志。服务端同时检查当前权限、资源范围和凭据用途，并原子消费；并发普通请求不会继承该 header。跨域宿主须允许此 header，默认 Serv/Kit 已包含。

### 原地恢复过期会话

配置 `auth.recoverSession` 回调可在服务端明确拒绝会话时原地重新登录并保留页面输入。使用 `@h-ai/ui` 的 `createSessionRecovery` / `SessionRecoveryDialog`：根布局绑定公开配置与原用户，回调设为 `recovery.recover`，弹窗使用标准认证 actions，销毁时 `cancel()`。登录的 `expectedUserId` 由 IAM 限定原主体；常规验证码、锁定、改密和登录限制照常执行。只对明确未认证拒绝的原请求续接一次；取消、5xx、超时和结果不明的网络写入不重放。敏感操作证明绑定旧会话时可能需要再次确认，不复用到新会话。未传回调保持原处理方式；配置回调后由恢复流程处理，不再立即调用 onRefreshFailed 导航离开。终端分组通过 auth.terminalType（web/app/desktop/api，默认 web）传入；它不是硬件身份认证。

### 页面离开会话策略

`session.endOnPageHide` 默认 `false`。启用后宿主调用 `actions.bindPageExit({ enabled: config.session.endOnPageHide })` 并在卸载时调用返回的清理函数；标准 admin/H5/fullstack 模板已经接入。非 BFCache 的 `pagehide`（也包括刷新、整页导航）通过 POST `/auth/session/close` 尽力撤销当前 access 及关联 refresh，沿用 CSRF/传输加密，使用 `keepalive` 且不自动刷新会话。该响应不清 Cookie/本地凭据，避免旧响应覆盖下一次登录。显式退出仍使用正常 logout，可靠撤销并清理当前凭据。浏览器可能不发送页面离开请求，因此必须按业务配合服务端 `idleTimeout`/`absoluteTimeout`；不能据此保证关闭即撤销。

敏感调用通过本次 `reauthorize: () => sensitiveActions.authorize(operation)` 重新确认用途：Kit 放 apiFetch 第三参数，typed client 放 options.context。会话刷新/恢复或明确的再认证拒绝后仅续发一次；取消不写入，未提供回调不重放旧证明。

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

服务端以非 2xx HTTP 状态返回合法的失败 `HaiResult` 时，客户端保留业务错误码、消息和 `traceId`，例如 409 冲突仍可提示刷新后重试。`httpStatus` 以真实 HTTP 响应为准；5xx 的内部诊断仍被隐藏，正文不能通过声称 400 绕过脱敏。非框架响应继续使用客户端错误映射。

自动刷新在真实 HTTP 401（`Response.status`）或 HTTP 200 的有效失败 HaiResult（`success=false`、`error.code/message` 为字符串且 `error.httpStatus=401`）后触发，刷新成功后只重试一次原请求。内置登录、注册与配置的 `auth.refreshPath` 不触发自动刷新，403/500 等其它失败也不会触发。serv 普通 procedure 的 HTTP 状态仍为 200；调用方须检查最终结果的 `success` 与 `error.code`，并处理刷新失败后的登录失效。

### 错误提示与关联日志

HTTP 错误返回本地化安全文案及追踪编号；ToastContainer 默认隐藏编号，由排查信息图标展开和复制。响应同时包含 `error.traceId` 和 `X-Trace-Id`。框架复用本次 requestId 作为 traceId，前后端日志自动关联。底层异常、堆栈和操作上下文经凭据脱敏后写入日志，不通过 cause/ext 向用户公开。字段校验只返回本地化的字段名和错误。

`core.error.toPublic(error, traceId?)` 用于接口/UI 边界；`core.error.formatMessage(error)` 用于重新翻译后的提示，重复调用不会重复追加标识。日志传入完整 Error 对象，不能只记录通用标题或提前 String(error) 丢失上下文。数据库失败记录驱动错误码、消息、堆栈及表/列；SQL 原文、绑定值和连接凭据不进入日志。

## 开发测试

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

客户端默认从服务端握手获取 `transport.maxPlaintextBytes`；可显式设置本地同名字段取较小值。容量失败返回 `HaiApiClientError.PAYLOAD_TOO_LARGE`（`hai:api-client:020`），保留方向、阶段和字节诊断。见 [容量配置与升级](../crypto/TRANSPORT-CAPACITY.md)。

Serv/Kit 对通过请求绑定、签名和 MAC 校验但超出时间窗口的请求返回加密的 HTTP 400 错误。客户端抛出 `TransportTimeError`（`hai:crypto:071`），显示校验时的服务器 UTC 时间，提示开启设备的自动校时或手工修改时间后刷新。`serverTime` 为 Unix 毫秒，旧服务端未提供该值时仍显示校时提示。`api-client` 映射为 `VALIDATION_FAILED`，在 `cause.transportCode` 和 `cause.serverTime` 保留诊断信息。

## 许可证

Apache-2.0
