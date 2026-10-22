# hai-api-client 参考

> `@h-ai/api-client` 是跨端 typed API client。公共 HTTP API 由 `@h-ai/api-contract` 定义，服务端由 `@h-ai/serv` 挂载，客户端直接调用 `apiClient.<domain>.<group>.<operation>()`。

## 使用步骤

### 1. 初始化

浏览器默认使用 httpOnly cookie 存储（推荐）：

```ts
import { apiClient } from '@h-ai/api-client'

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
})
```

启用传输加密时，只传顶层 `crypto` 句柄；api-client 内部自动调用 `crypto.transport.createClient()`：

```ts
import { apiClient } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'

await crypto.init()

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
  transport: { crypto }, // 默认协商路径：/api/v1/_hai/key-exchange
})
```

App/Capacitor 场景传入自定义 TokenStorage：

```ts
import { createCapacitorTokenStorage } from '@h-ai/capacitor'

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: { storage: createCapacitorTokenStorage() },
})
```

> `createCapacitorTokenStorage()` 仅在 Android/iOS 原生环境 + `@aparajita/capacitor-secure-storage` 已安装时持久化 token；纯 Web 不会回退到 `localStorage`。

SSR / Node.js 测试场景请显式传入内存存储：

```ts
import { apiClient } from '@h-ai/api-client'

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: { storage: apiClient.tokenStorage.memory() },
})
```

### 2. 调用 typed API

```ts
const login = await apiClient.iam.auth.login({ identifier: 'alice', password: 'secret' })
if (login.success) {
  // 默认 httpOnly cookie 模式下，refresh token 由服务端 Set-Cookie 管理。
  await apiClient.auth.setTokens(login.data.tokens)
}

const me = await apiClient.iam.auth.currentUser()
if (me.success) {
  // currentUser 返回服务端最新角色/权限；不要把权限快照持久化到 localStorage。
  const { roles, permissions, ...user } = me.data
}
const upload = await apiClient.storage.presignedUrls.createUpload({ key: 'avatar.png' })
const answer = await apiClient.ai.chats.sendMessage({ message: 'hello' })
```

### 3. 自定义 contract

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

const contract = apiContract.create({ iam: apiContract.iam })
const client = apiClient.create(contract)
await client.init({ baseUrl: 'https://api.example.com/api/v1' })
```

`client.config` / `apiClient.config` 返回的是脱敏后的运行配置快照；`baseUrl` 的内嵌凭证与 `headers.authorization` 等敏感值会自动隐藏。

### 4. 关闭

```ts
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

自动刷新识别真实 HTTP 401（`Response.status`），以及 HTTP 200 的有效失败 HaiResult（`success=false`、字符串 `error.code/message`、`error.httpStatus=401`），成功后只重试一次原请求。内置登录、注册与配置的 `auth.refreshPath` 排除自动刷新，403/500 等其它失败也不刷新。serv 普通 procedure 的 HTTP 状态仍为 200；调用方须检查最终 `success/error.code` 并处理刷新失败后的登录失效。

```ts
import { apiClient } from '@h-ai/api-client'

// apiClient.tokenStorage.httpOnlyCookie() 是默认存储，无需显式指定
await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
})

// 登录后设置 access token（refresh token 由服务端写入 cookie，前端无需操作）
const login = await apiClient.iam.auth.login({ identifier: 'alice', password: 'secret' })
if (login.success) {
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

退出/换账号使用 `auth.clear()` / `auth.setTokens()`，不直接写 storage。方法立即取消旧刷新，并按顺序提交异步存储操作；迟到的成功/401 不会恢复旧身份、覆盖新账号或触发旧回调。该保证针对同一个客户端的认证管理器，SSR 仍须按请求隔离实例。

### Transport 配置

| 字段 | 说明 |
| --- | --- |
| `transport.crypto` | 已初始化的 `@h-ai/crypto` 实例 |
| `transport.keyExchangePath` | 相对于 `baseUrl` 的协商子路径，默认 `/_hai/key-exchange` |

服务端必须对应启用 `serv.createApp({ transport: { crypto } })`。
自动刷新会沿用 `transport.encryptedFetch`，并在 httpOnly cookie 模式下发送空请求体 + `credentials: 'include'`，由服务端从 cookie 读取 refresh token。

## 常见模式

- `baseUrl` 通常包含服务端 `apiPrefix`，例如 `/api/v1`。
- 业务错误不 throw，统一判断 `HaiResult.success`。
- 客户端不导入服务端 `procedures` 或 `@h-ai/serv`。
- 客户端不导入 `@h-ai/crypto` 的内部 transport 工厂，只通过 `transport: { crypto }` 装配。
- 前端只依赖 `@h-ai/api-client` 和 contract 类型，不依赖业务模块实现。
- httpOnly cookie 模式需服务端与客户端同步配置，跨 Origin 请求需正确设置 CORS 与 credentials；`SameSite=Strict` 限制跨站 Cookie，跨域不等于跨站。


## 配置驱动认证页面

`apiClient.createAuthActions(client)` 为含标准 iam contract 的客户端提供 publicConfig、login、register、sendOtp、requestPasswordReset、confirmPasswordReset。login 输入使用 identifier/password/method/code，method 为 password、ldap、email、sms。成功认证自动调用既有安全 TokenStorage；应用只需把动作传给 AuthPanel，并在 onauthenticated 中刷新自己的用户状态或导航。
