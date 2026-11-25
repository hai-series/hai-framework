# hai-api-client 参考

`@h-ai/api-client` 用共享 HTTP 契约提供带类型的调用。默认客户端包含 IAM、Storage 和 AI；应用可从与 Serv 或 Kit 共用的契约创建独立客户端。

## 使用步骤

### 1. 确定 API 地址和客户端所有者

`baseUrl` 包含部署时启用的 API 前缀。浏览器同源部署可用 `/api/v1`，Node.js 和没有浏览器来源的设备使用完整的 HTTP(S) 地址。业务、刷新和密钥交换路径都以这个地址为前缀。地址中省略凭据、查询和片段。应用通过 `init(config)` 传入公开设置。

浏览器布局可复用默认客户端。多用户 SSR 按请求使用 `apiClient.create(contract)`。在初始化成功后调用业务接口，所属请求、应用或布局结束时调用 `close()` 释放实例。并发初始化同一未就绪实例共享当前工作；已就绪或正在关闭时初始化返回 `CONFIG_ERROR`。 `client.config` 返回生效的绝对 `baseUrl` 和脱敏快照。

### 2. 从共享契约创建客户端

使用应用和服务端共用的契约，把已声明的路由传给工厂。完整的路由声明和挂载过程见 [共享契约](../hai-api-contract/reference.md#use-with-client)。

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function loadAuthPolicy(baseUrl: string) {
  // Serv 或 Kit 已在该地址下挂载标准 IAM 路由。得到单独的客户端后再初始化。
  const client = apiClient.create({ iam: apiContract.iam })
  const ready = await client.init({ baseUrl })
  if (!ready.success)
    return ready

  try {
    // 公开路由无输入。成功数据为认证策略或 null，失败返回公开错误。
    const policy = await client.iam.auth.publicConfig()
    if (!policy.success)
      return policy
    return policy
  }
  finally {
    await client.close()
  }
}
```

### 3. 控制单次请求并判断结果

操作的第一个参数按契约传业务输入。没有业务输入时，可用 `undefined` 占位后传 `options`。使用 `options.signal` 取消本次调用，`options.context.autoRefresh: false` 跳过本次调用的自动刷新。 `context.keepalive` 设置 Fetch 离页选项；浏览器仍可限制大小及发送时机。敏感操作传 `context.reauthentication`，允许重试时可用 `context.reauthorize` 提供新票据，返回 `null` 取消重试。

标准业务结果先判断 `success`。自定义裸 JSON 或 SSE 成功时返回值或异步迭代器，调用或建立流失败时返回 `HaiResult<never>` 的失败分支。数字用 `typeof result === 'number'` 区分，流用 `Symbol.asyncIterator in result` 判断。流建立后的错误通过迭代抛出。可转换为 JSON Schema 的 Zod 输出按线上 JSON 校验，失败返回 `VALIDATION_FAILED`。

`timeout` 默认 30000 毫秒，覆盖等待响应头、完整 JSON 和失败响应正文。用调用方的 `signal` 停止读取已经建立的流。超时发生在写入操作时，先查询服务端结果再决定是否重试。

### 调用按需发布的契约

服务端发布 `apiContract.extensions` 中的操作后，用对应的项目契约调用 `apiClient.create(contract)`。流式聊天 `client.ai.chats.streamCompletion({ messages }, { signal })` 成功返回异步可迭代对象，建立失败返回 `HaiResult`，收到 `type: 'done'` 表示完整结束。上传传入 `File`，图像生成、语音合成和文件下载成功返回 `File`。调用为 SSE 或文件明确配置的 HTTPS 端点时，使用对应的 HTTPS 客户端配置。

## Token Storage 适配器

| 工厂调用 | 存储位置 | 适用场景 |
| --- | --- | --- |
| `apiClient.tokenStorage.httpOnlyCookie()` | 实例内存保存访问令牌，浏览器保存服务端写入的刷新 Cookie | 启用 `auth` 且省略 `auth.storage` 时的默认值。服务端同步启用 Cookie 刷新。 |
| `apiClient.tokenStorage.memory()` | 新建的进程内存保存访问和刷新令牌 | SSR 或 Node.js 测试，按请求或用例隔离。 |
| `capacitor.createTokenStorage()` | Capacitor 的原生安全存储 | Android 或 iOS 应用显式注入。安装对应的原生插件。 |

浏览器 Cookie 模式自动发送 `credentials: 'include'`。跨域服务端允许指定的页面 Origin 和凭据，Cookie 属性应与部署域名匹配。 `serv.createApp({ iam, refreshCookie: {} })` 可开启 Serv 的 Cookie 模式，见 [Serv 参考](../hai-serv/reference.md)。原生实例在 `init({ baseUrl, auth: { storage, terminalType: 'app' } })` 中传入安全存储。Capacitor 公共工厂依赖 Android/iOS 原生安全存储插件。Node.js SSR 的全局 Fetch 不带浏览器的 Cookie jar，入站身份由应用按请求注入。持久凭据保存在对应的安全适配器中。

`client.auth.setTokens(tokens)` 和 `client.auth.clear()` 等待适配器完成，适配器失败时 Promise 拒绝。成功登录和注册可用认证动作自动提交。若直接调用 `client.iam.auth.login(input)`，应用先检查结果，再把 `data.tokens` 交给 `client.auth.setTokens(tokens)`。退出时先请求 IAM 撤销会话并清除 Cookie，再清理客户端的本地凭据。 `close()` 结束运行期、清理订阅和等待在途的凭据操作，宿主保存并按自身策略清理注入的适配器。

`TokenPair` 包含用于 Bearer 请求头的 `accessToken`、内存或原生存储使用的可选 `refreshToken`、以秒为单位的 `expiresIn`，以及固定的 `tokenType: 'Bearer'`。适配器实现 `getAccessToken()`、`setAccessToken(token)`、`getRefreshToken()`、`setRefreshToken(token)`、`clear()`。存储缺值时读取返回 `null`，读写故障拒绝 Promise。管理器可传空字符串废弃旧刷新值。内置 Cookie 适配器由服务端管理 Cookie。

`auth.refreshPath` 默认 `/auth/refresh`，刷新超时默认 10000 毫秒。只有明确的会话认证拒绝才触发刷新或恢复。刷新端点返回 401 时按失效处理，限流、暂时性失败和网络超时保留原凭据。设置 `auth.recoverSession` 时，在恢复期间记录当前用户 ID，用 `expectedUserId` 约束登录，并在新凭据提交后返回 `true`。客户端重新核对身份、取消状态与运行期，再决定是否重试原调用。配合 `ui.createSessionRecovery` 时，退出或卸载可用 `recovery.cancel()` 停止界面恢复流程。

会话明确失效时，可在未启用 `recoverSession` 的客户端配置 `onRefreshFailed` 显示重新登录入口。刷新成功后，用 `auth.onTokenRefreshed` 更新应用会话状态，或在已初始化的客户端上用 `client.auth.onTokenRefreshed(({ expiresIn }) => showLifetime(expiresIn))` 为页面订阅。销毁页面时调用返回的取消函数。应用状态只接收期限等展示字段。

## 核心 API

| API | 用途 |
| --- | --- |
| `apiClient.create(contract)` | 从应用契约创建独立实例。 |
| `client.init(config)`、`client.close()` | 管理该实例的运行期；初始化返回 `HaiResult`。 |
| `client.isInitialized`、`client.config` | 查看就绪状态和脱敏配置。 |
| `client.auth.setTokens(tokens)`、`client.auth.clear()` | 替换或清理当前实例的凭据。 |
| `client.auth.onTokenRefreshed(callback)` | 订阅已提交的刷新，返回取消订阅函数。 |
| `client.observeRequests(observer)` | 每次逻辑调用产生一条诊断摘要，返回取消订阅函数。 |
| `apiClient.createAuthActions(client)` | 为具有标准 IAM 认证契约的客户端生成表单动作。 |

### Transport 配置

| 字段 | 说明 |
| --- | --- |
| `transport.crypto` | 已初始化的 `@h-ai/crypto` 实例。 |
| `transport.keyExchangePath` | 相对于 `baseUrl` 的协商子路径，默认 `/_hai/key-exchange`。 |
| `transport.maxPlaintextBytes` | 可选的明文字节上限；省略时采用握手公布的值，传入后只能收紧。 |

服务端通过 Serv 或 Kit 启用密钥交换和加密路由。服务端密钥环及共享 registry 由服务端管理；客户端通过 HTTPS 获取握手公钥及版本。启用 `transport` 的实例对业务和刷新使用同一个加密链路。服务端允许普通 HTTPS 的路由可通过普通 `fetch` 或独立未配置 `transport` 的客户端调用。 `kit.client` 的路径例外见 [Kit 参考](../hai-kit/reference.md)。客户端关闭后，再由依赖所有者决定是否关闭 Crypto。

启用了 IAM 和 Crypto 的 CLI 独立移动模板默认使用加密。模板用 `PUBLIC_API_TRANSPORT=off` 对应允许普通 HTTPS 的部署，用 `PUBLIC_API_KEY_EXCHANGE_PATH` 覆盖公开的协商子路径。握手失败返回错误，由应用处理。加密时间错误映射为 `VALIDATION_FAILED`，`cause.transportCode` 和 `cause.serverTime` 记录底层编号与 Unix 毫秒。容量超限映射为 `PAYLOAD_TOO_LARGE`，原因可包含 `direction`、`stage`、`limitBytes` 和 `actualBytes`。

## 常见模式

- `client.observeRequests(observer)` 按逻辑操作计数，`attempts` 记录实际业务请求次数。请求摘要的路径可能含业务编号。同步观察器做有界收集，页面卸载时取消订阅。
- `ai.chats.createCompletion({ messages, tools, tool_choice })` 返回非流式 JSON。读取 `choices` 中的工具调用；应用自行授权并执行工具，再通过对应的 `tool_call_id` 提交结果。需要流时使用应用自己的流契约。
- 对服务端的有效失败 `HaiResult` 保留业务码和 `traceId`，按实际 HTTP 状态执行公开化处理。界面使用安全消息和可用的追踪编号。验证超时、取消、刷新与退出，并按业务结果确认写入是否完成。
- 动态领域可用 `client.payment?.orders` 访问。 `then` 是保留属性；客户端和领域对象可作为普通值传入 `Promise.resolve`。

## 配置驱动认证页面

初始化时提供 `auth: {}` 启用默认 Cookie 适配器，或显式选择安全适配器。 `apiClient.createAuthActions(client)` 绑定该实例的标准 IAM 路由，然后可把动作交给 `AuthPanel` 或自定义表单。页面先通过 `publicConfig()` 取得允许的登录方式，再发起登录或注册；成功时动作已提交本地凭据。登录输入使用 `identifier` 和 `password`，`method` 默认为 `password`，也可为 `ldap`、`email` 或 `sms`。验证码模式传 `code`，类型所需的 `password` 可填空字符串。需要交互挑战时先按用途调用 `createCaptcha({ operation })`，再提交求解所得的 `captcha`。敏感操作通过 `reauthenticate(password, operation)` 取得 `data.ticket`。

用 `client.iam.auth.currentUser()` 的 `roles` 和 `permissions` 控制页面显示。Serv 或 Kit 在每次请求按已验证的身份核对路由权限及目标资源。业务调用的 401 需要结合错误码判断会话或再次验证状态，403 提示权限不足并保留登录状态。对敏感操作把用途票据传给该次调用的 `context.reauthentication`。自定义业务继续使用与宿主共享的路由树，例如 `client.reports.exports.create({ reportId, format: 'pdf' })`。此名称和参数取决于应用的契约。
