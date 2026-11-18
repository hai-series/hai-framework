# @h-ai/api-client API reference

<!-- translation: partial -->

[Chinese source](api-client.md) · [Configuration](../configuration/api-client.en.md) · [Data structures](../data/api-client.en.md)

## Quick start

Create one typed client from the same contract used by Serv or Kit. Initialize it before requests, handle each `HaiResult`, and close it when the owner releases it.

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

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Import the module as in the quick start. Except for lifecycle examples, run scenarios after initialization and before closure. The value helper checks HaiResult.success and preserves the original error. Use isolated test data and explicit cleanup.

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="client-lifecycle"></a>

### Prepare isolated clients: `apiClient`

Browsers may use the default client; SSR creates an isolated client per request to prevent identity leakage.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `apiClient.init` | Prepare the default client | config: baseUrl、认证及传输选项 | `Promise<HaiResult<void>>` | `await apiClient.init({ baseUrl: '/api/v1', auth: {} })` |
| `apiClient.close` | Close the default client | 无参数 | `Promise<void>` | `await apiClient.close()` |
| `apiClient.create` | Create an isolated client | contract: 应用共享契约 | `ApiClient<TContract>` | `apiClient.create(contract)` |
| `apiClient.config` | Read the current redacted client config | Read-only property; no arguments | `ApiClientConfig \| null` | `apiClient.config` |
| `apiClient.isInitialized` | Check whether the default client is ready | Read-only property; no arguments | `boolean` | `apiClient.isInitialized` |

#### Scenario: Prepare isolated clients

```ts
import { apiContract } from '@h-ai/api-contract'
apiClient.isInitialized // default client readiness
const settings = apiClient.config // redacted config or null
const client = apiClient.create(apiContract.create({ iam: apiContract.iam }))
value(await client.init({ baseUrl: 'https://api.example.com/api/v1', auth: {} }))
try {
  const policy = value(await client.iam.auth.publicConfig()) // IamPublicConfig from this server
}
finally {
  await client.close() // undefined; local resources released
}
```

Replace the address with a deployed test service. create sends nothing; initialize before calls. Closing only releases the client and does not log out server-side.

Refresh credentials are distinct from server logout. Use the IAM logout endpoint to invalidate the server session. Recovery after refresh failure must restore the same user.

<a id="call-options"></a>

#### Call arguments and integration options

Call `apiClient.init(config)` to configure the default client. If your application defines its own contract, call `apiClient.create(contract)` and pass the settings to that instance's `init(config)`. The browser sends and stores cookies through Fetch and the server's responses. For SSR, create a separate client and token store per request.

Initialization resolves a root path against the browser origin, including its scheme, host, and port. API calls, token refresh, and the encryption handshake share the resolved URL. Omit user information, query parameters, and fragments. Protocol-relative URLs such as `//example.com` are rejected at initialization.

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `baseUrl` | Required | An absolute HTTP(S) API URL or a same-origin root path such as `/api/v1` in the browser. |
| `timeout` | `30000` ms | Deadline for headers and JSON. Streaming reads use the caller's abort signal. |
| `clientName` | `hai-api-client` | Value of `x-request-client` for diagnostics. |
| `headers` | No additional headers | Static object or a sync or async function returning headers. |
| `fetch` | Global `fetch` | Fetch-compatible function; preserve cancellation and cookie handling when providing one. |
| `auth` | `undefined` | Pass `{}` to enable default authentication and refresh. |
| `auth.storage` | `apiClient.tokenStorage.httpOnlyCookie()` | Access token in browser memory. Refresh cookie remains server-managed. |
| `auth.refreshPath` | `/auth/refresh` | Endpoint relative to the base URL. |
| `auth.refreshTimeoutMs` | `10000` | Refresh deadline in milliseconds. Keep existing credentials on timeout. |
| `auth.terminalType` | `web` | Allowed IAM terminal type: `web`, `app`, `desktop`, or `api`. |
| `auth.recoverSession` | Optional | Restore the same session after a definitive refresh failure. Returning true retries the original request once. |
| `auth.onTokenRefreshed` | May be omitted | Called after a successful refresh. Use it to update signed-in state. |
| `auth.onRefreshFailed` | May be omitted | Called after a definitive failure. Use it to prompt the user to sign in. |
| `transport` | `undefined` | Pass an object to enable application-level request encryption. |
| `transport.crypto` | Required | Initialized `@h-ai/crypto` instance when transport encryption is used. |
| `transport.keyExchangePath` | `/_hai/key-exchange` | Key exchange path relative to the base URL. |
| `transport.maxPlaintextBytes` | Optional | Uses the server limit unless the caller sets a smaller limit. |

The refresh response determines how stored credentials are handled. A `401` clears the credentials and reports session expiry. Other failures such as `429`, `408` and `409`, or a timeout, keep the existing credentials. For a valid failed `HaiResult` inside HTTP 200, use `error.httpStatus`. A later business request can trigger refresh again.

<a id="client-integration"></a>

#### Client addresses, deadlines and recovery

This integration guide was moved from the configuration handbook because it describes code arguments. The complete walkthrough is currently available in [Chinese](api-client.md#client-integration); this subsection is partially translated.

[Detailed parameters and workflows](api-client.md#client-lifecycle)

<a id="credentials"></a>

### Store and refresh credentials: `apiClient.auth`, `tokenStorage`

Let the client coordinate persistence and refresh. Use isolated memory for SSR/tests and httpOnly cookies for browser refresh.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `apiClient.auth.setTokens` | Store current credentials | TokenPair: 可信认证响应 | `Promise<void>` | `await apiClient.auth.setTokens(tokens)` |
| `apiClient.auth.clear` | Clear current credentials | 无参数 | `Promise<void>` | `await apiClient.auth.clear()` |
| `apiClient.auth.onTokenRefreshed` | Subscribe to token rotation | callback(TokenPair) | `() => void` | `apiClient.auth.onTokenRefreshed(() => refreshProfile())` |
| `apiClient.tokenStorage.memory` | Create in-memory credential storage | 无参数 | `TokenStorage` | `apiClient.tokenStorage.memory()` |
| `apiClient.tokenStorage.httpOnlyCookie` | Use server-managed refresh cookies | 无参数 | `TokenStorage` | `apiClient.tokenStorage.httpOnlyCookie()` |
| `storage.getAccessToken` | Read the access token | — | `Promise<string \| null>` | `await storage.getAccessToken()` |
| `storage.setAccessToken` | Store the access token | token | `Promise<void>` | `await storage.setAccessToken(accessToken)` |
| `storage.getRefreshToken` | Read the refresh token | — | `Promise<string \| null>` | `await storage.getRefreshToken()` |
| `storage.setRefreshToken` | Store the refresh token | token | `Promise<void>` | `await storage.setRefreshToken(refreshToken)` |
| `storage.clear` | Clear stored credentials | — | `Promise<void>` | `await storage.clear()` |

#### Scenario: Store and refresh credentials

This expands the session-expiry branch for business requests. Login, registration and refresh endpoints are excluded from this recovery loop.

![When an authenticated request may retry](../images/function-api-client-recovery.en.svg)

Concurrent refreshes share one attempt. A single retry requires new credentials, an active request and unchanged identity; sensitive operations require a new authorization ticket. Network failures are not proof of an invalid session. Failed recovery or a failed retry is returned to the caller.

Input is a trusted login token pair. Storage failures reject; finally removes the observer and clears local credentials. Server logout is a separate operation.

```ts
async function useIssuedTokens(tokens: Parameters<typeof apiClient.auth.setTokens>[0]) {
  const storage = apiClient.tokenStorage.memory()
  await storage.setAccessToken(tokens.accessToken)
  if (tokens.refreshToken)
    await storage.setRefreshToken(tokens.refreshToken)
  const stored = { access: await storage.getAccessToken(), refresh: await storage.getRefreshToken() }
  await storage.clear()
  const afterClear = await storage.getAccessToken() // null
  const browserStorage = apiClient.tokenStorage.httpOnlyCookie() // refresh cookie is not readable
  let refreshCount = 0
  const stop = apiClient.auth.onTokenRefreshed(() => { refreshCount += 1 })
  try {
    await apiClient.auth.setTokens(tokens)
    return { stored, afterClear, refreshCount }
  }
  finally {
    stop()
    await apiClient.auth.clear()
  }
}
```

<a id="auth-actions"></a>

### Drive authentication forms: `apiClient.createAuthActions`

Give UI the public policy and invoke login, registration, OTP, password recovery or reauthentication according to the user flow.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `apiClient.createAuthActions` | Build authentication form actions | client: 含标准 IAM 契约 | `Auth actions object` | `apiClient.createAuthActions(apiClient)` |
| `actions.publicConfig` | Read public authentication policy | — | `Promise<HaiResult<T>>` → IamPublicConfig | `await actions.publicConfig()` |
| `actions.createCaptcha` | Create an operation challenge | { operation } | `Promise<HaiResult<T>>` → IamCaptchaChallenge | `await actions.createCaptcha({ operation: 'login' })` |
| `actions.login` | Submit login credentials | IamAuthLoginInput | `Promise<HaiResult<T>>` | `await actions.login({ identifier, password })` |
| `actions.register` | Submit registration | IamRegisterInput | `Promise<HaiResult<T>>` | `await actions.register({ username, password })` |
| `actions.sendOtp` | Request a one-time code | identifier, { captcha? }? | `Promise<HaiResult<T>>` → { expiresAt } | `await actions.sendOtp(identifier)` |
| `actions.requestPasswordReset` | Request password reset delivery | identifier, { captcha? }? | `Promise<HaiResult<T>>` → void | `await actions.requestPasswordReset(identifier)` |
| `actions.confirmPasswordReset` | Submit reset credentials and a new password | token, newPassword | `Promise<HaiResult<T>>` → void | `await actions.confirmPasswordReset(resetToken, newPassword)` |
| `actions.renewPassword` | Replace an expired or initial password | { identifier, password, newPassword, captcha? } | `Promise<HaiResult<T>>` → void | `await actions.renewPassword({ identifier, password, newPassword })` |
| `actions.reauthenticate` | Reauthenticate for a sensitive operation | password, operation | `Promise<HaiResult<T>>` | `await actions.reauthenticate(password, 'users:delete')` |
| `actions.bindPageExit` | Bind page-exit session behavior | { enabled? } | `() => void` | `actions.bindPageExit({ enabled: endOnPageHide })` |

#### Scenario: Drive authentication forms

The form supplies inputs and actions await credential persistence. Each handler below belongs to a separate user flow; do not invoke them in sequence against a live account. AuthPanel supplies captcha when required.

```ts
const actions = apiClient.createAuthActions(apiClient)
const config = value(await actions.publicConfig()) // IamPublicConfig | null
if (!config)
  throw new Error('Public authentication settings are unavailable')
const unbind = actions.bindPageExit({ enabled: config.session.endOnPageHide })
async function login(input: Parameters<typeof actions.login>[0]) {
  return value(await actions.login(input)) // authenticated user and tokens, or throws preserved failure
}
async function register(input: Parameters<typeof actions.register>[0]) {
  return value(await actions.register(input)) // registration/authentication result
}
async function sendCode(identifier: string) {
  return value(await actions.sendOtp(identifier)) // expiresAt
}
async function requestReset(identifier: string) {
  value(await actions.requestPasswordReset(identifier)) // undefined
}
async function resetPassword(token: string, newPassword: string) {
  value(await actions.confirmPasswordReset(token, newPassword)) // undefined
}
async function renew(input: Parameters<typeof actions.renewPassword>[0]) {
  value(await actions.renewPassword(input)) // undefined
}
async function confirmSensitive(password: string) {
  return value(await actions.reauthenticate(password, 'users:delete')) // one-operation credential
}
const challenge = await actions.createCaptcha({ operation: 'login' }) // check success; solve through AuthPanel
unbind() // call when this page is destroyed
```

<a id="iam-requests"></a>

### Call identity and administration APIs: `apiClient.iam`

Use standard HTTP contracts for accounts, users, roles and permissions. The server checks each operation and resource scope.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `apiClient.iam.auth.publicConfig` | 读取公开认证配置 | 无必填参数 | 当前登录注册、密码、协议等公开策略 | `await apiClient.iam.auth.publicConfig()` |
| `apiClient.iam.auth.createCaptcha` | 生成挑战 | `{ operation: 'login' }` | 登录挑战与凭证 | `await apiClient.iam.auth.createCaptcha({ operation: 'login' })` |
| `apiClient.iam.auth.login` | 密码登录 | `{ identifier, password }` | 已认证用户与 Token | `await apiClient.iam.auth.login({ identifier, password })` |
| `apiClient.iam.auth.loginWithLdap` | LDAP 登录 | `{ username, password }` | 已认证用户与 Token | `await apiClient.iam.auth.loginWithLdap({ username, password })` |
| `apiClient.iam.auth.sendOtp` | 发送一次性验证码 | `{ identifier }` | 验证码失效时间 | `await apiClient.iam.auth.sendOtp({ identifier })` |
| `apiClient.iam.auth.loginWithOtp` | 验证码登录 | `{ identifier, code }` | 已认证用户与 Token | `await apiClient.iam.auth.loginWithOtp({ identifier, code })` |
| `apiClient.iam.auth.register` | 注册 | `{ username, password }` | 新用户与 Token | `await apiClient.iam.auth.register({ username, password })` |
| `apiClient.iam.auth.currentUser` | 读取当前账号 | 无必填参数 | 当前用户以及角色和权限 | `await apiClient.iam.auth.currentUser()` |
| `apiClient.iam.auth.updateCurrentUser` | 更新本人资料 | `{ displayName: 'Mina' }` | 更新后的用户资料 | `await apiClient.iam.auth.updateCurrentUser({ displayName: 'Mina' })` |
| `apiClient.iam.auth.changePassword` | 已登录用户修改密码 | `{ oldPassword, newPassword }` | 无业务数据 | `await apiClient.iam.auth.changePassword({ oldPassword, newPassword })` |
| `apiClient.iam.auth.renewPassword` | 密码到期后续密 | `{ identifier, password, newPassword }` | 无业务数据 | `await apiClient.iam.auth.renewPassword({ identifier, password, newPassword })` |
| `apiClient.iam.auth.requestPasswordReset` | 申请密码重置 | `{ identifier }` | 无业务数据 | `await apiClient.iam.auth.requestPasswordReset({ identifier })` |
| `apiClient.iam.auth.confirmPasswordReset` | 使用重置凭证 | `{ token, newPassword }` | 无业务数据 | `await apiClient.iam.auth.confirmPasswordReset({ token, newPassword })` |
| `apiClient.iam.auth.reauthenticate` | 申请敏感操作票据 | `{ password, operation: 'users:delete' }` | 票据和到期时间 | `await apiClient.iam.auth.reauthenticate({ password, operation: 'users:delete' })` |
| `apiClient.iam.auth.refresh` | 刷新凭据 | `{ refreshToken }` | 新 Token；通常由客户端刷新流程调用 | `await apiClient.iam.auth.refresh({ refreshToken })` |
| `apiClient.iam.auth.logout` | 主动退出 | 无必填参数 | 无业务数据 | `await apiClient.iam.auth.logout()` |
| `apiClient.iam.auth.closeSession` | 请求结束当前会话 | 无必填参数 | 无业务数据 | `await apiClient.iam.auth.closeSession()` |
| `apiClient.iam.users.list` | 分页查询用户 | `{ page: 1, pageSize: 20 }` | 用户分页 | `await apiClient.iam.users.list({ page: 1, pageSize: 20 })` |
| `apiClient.iam.users.get` | Get a user | `{ id: userId }` | User details, or `null` when absent | `await apiClient.iam.users.get({ id: userId })` |
| `apiClient.iam.users.create` | 创建用户 | `{ username, password }` | 新用户资料 | `await apiClient.iam.users.create({ username, password })` |
| `apiClient.iam.users.invite` | 发出邀请 | `{ username, email }` | 已创建的待激活用户资料 | `await apiClient.iam.users.invite({ username, email })` |
| `apiClient.iam.users.update` | 修改用户 | `{ id: userId, displayName: 'Mina' }` | 更新后的用户资料 | `await apiClient.iam.users.update({ id: userId, displayName: 'Mina' })` |
| `apiClient.iam.users.delete` | 删除用户 | `{ id: userId }` | 无业务数据 | `await apiClient.iam.users.delete({ id: userId })` |
| `apiClient.iam.users.resetPassword` | 管理员重置密码 | `{ id: userId, newPassword }` | 无业务数据 | `await apiClient.iam.users.resetPassword({ id: userId, newPassword })` |
| `apiClient.iam.roles.list` | 查询角色 | 无必填参数 | 角色分页 | `await apiClient.iam.roles.list({})` |
| `apiClient.iam.roles.get` | Get a role | `{ id: roleId }` | Role record, or `null` when absent | `await apiClient.iam.roles.get({ id: roleId })` |
| `apiClient.iam.roles.create` | 创建角色 | `{ code: 'reader', name: 'Reader' }` | 新角色 | `await apiClient.iam.roles.create({ code: 'reader', name: 'Reader' })` |
| `apiClient.iam.roles.update` | 更新角色 | `{ id: roleId, name: 'Report reader' }` | 更新后的角色 | `await apiClient.iam.roles.update({ id: roleId, name: 'Report reader' })` |
| `apiClient.iam.roles.delete` | 删除角色 | `{ id: roleId }` | 无业务数据 | `await apiClient.iam.roles.delete({ id: roleId })` |
| `apiClient.iam.permissions.list` | 分页查询权限 | `{ page: 1, type: 'api' }` | 权限分页 | `await apiClient.iam.permissions.list({ page: 1, type: 'api' })` |
| `apiClient.iam.permissions.get` | 读取权限 | `{ id: permissionId }` | `null` | `await apiClient.iam.permissions.get({ id: permissionId })` |
| `apiClient.iam.permissions.create` | 创建权限 | `{ code: 'reports:read', name: 'Read reports' }` | 新权限 | `await apiClient.iam.permissions.create({ code: 'reports:read', name: 'Read reports' })` |
| `apiClient.iam.permissions.setSensitiveOperations` | 配置敏感操作 | `{ id: permissionId, sensitiveOperations: ['users:delete'] }` | 无业务数据 | `await apiClient.iam.permissions.setSensitiveOperations({ id: permissionId, sensitiveOperations: ['users:delete'] })` |
| `apiClient.iam.permissions.delete` | 删除权限 | `{ id: permissionId }` | 无业务数据 | `await apiClient.iam.permissions.delete({ id: permissionId })` |

#### Scenario: Call identity and administration APIs

```ts
const current = await apiClient.iam.auth.currentUser()
if (!current.success)
  throw new Error(current.error.message)
const users = value(await apiClient.iam.users.list({ page: 1, pageSize: 20 }))
// users.items is the authorized user page, not every user in the database
const roles = value(await apiClient.iam.roles.list({})) // configured roles visible to this caller
const permissions = value(await apiClient.iam.permissions.list({})) // permitted permission records
```

The list gives per-method inputs and success data. Use IDs from prior successful responses. Results depend on server state and authorization; a signed-in browser does not automatically have administration rights.

[Detailed parameters and workflows](api-client.md#iam-requests)

<a id="business-requests"></a>

### Call file and AI APIs: `apiClient.storage`, `apiClient.ai`

Use signed URLs for direct object transfers and the declared AI routes for chats, memory and sessions. Internal server methods are separate.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `apiClient.storage.files.list` | 必须传对象，可填 `prefix`、`maxKeys`、`continuationToken`、`delimiter` | `maxKeys` 范围 1–1000 | 文件列表和继续分页所需的信息 | `await apiClient.storage.files.list({ prefix: 'reports/', maxKeys: 20 })` |
| `apiClient.storage.files.getMetadata` | 读对象元数据 | `{ key }` | 键、大小、类型等 | `await apiClient.storage.files.getMetadata({ key })` |
| `apiClient.storage.files.delete` | 删除单个对象 | `{ key }` | 无业务数据 | `await apiClient.storage.files.delete({ key })` |
| `apiClient.storage.files.deleteMany` | 批量删除对象 | `{ keys: [key] }` | 已确认删除的键与空失败列表 | `await apiClient.storage.files.deleteMany({ keys: [key] })` |
| `apiClient.storage.presignedUrls.createUpload` | 签发上传地址 | `{ key, contentType: 'application/pdf' }` | 临时上传 URL 和对象键 | `await apiClient.storage.presignedUrls.createUpload({ key, contentType: 'application/pdf' })` |
| `apiClient.storage.presignedUrls.createDownload` | 签发下载地址 | `{ key, expiresIn: 60 }` | 临时下载 URL 和对象键 | `await apiClient.storage.presignedUrls.createDownload({ key, expiresIn: 60 })` |
| `apiClient.ai.chats.createCompletion` | `messages` 必填 | 可选模型和生成设置 | 补全文本及响应元信息 | `await apiClient.ai.chats.createCompletion({ messages: [{ role: 'user', content: 'Hello' }] })` |
| `apiClient.ai.chats.sendMessage` | 发送会话消息 | `{ message, sessionId }` | 回复与当前会话信息 | `await apiClient.ai.chats.sendMessage({ message, sessionId })` |
| `apiClient.ai.chats.listHistory` | 查询历史 | `{ sessionId, limit: 20 }` | 聊天记录列表 | `await apiClient.ai.chats.listHistory({ sessionId, limit: 20 })` |
| `apiClient.ai.memories.list` | 查询记忆 | `{ objectId, limit: 20 }` | 记忆列表 | `await apiClient.ai.memories.list({ objectId, limit: 20 })` |
| `apiClient.ai.memories.recall` | 按内容检索记忆 | `{ query: 'preferred language', topK: 3 }` | 召回的记忆项 | `await apiClient.ai.memories.recall({ query: 'preferred language', topK: 3 })` |
| `apiClient.ai.sessions.list` | 查询对象的会话 | `{ objectId }` | 会话列表 | `await apiClient.ai.sessions.list({ objectId })` |

#### Scenario: Call file and AI APIs

```ts
const files = value(await apiClient.storage.files.list({ prefix: 'reports/', maxKeys: 20 }))
// files contains metadata and pagination for this authorized prefix
const sessions = value(await apiClient.ai.sessions.list({})) // visible AI sessions
```

Per-method examples use reports/ objects and session IDs from successful responses. Deletion changes real state; signatures return URLs, keys and expiry. AI wording is model-dependent.

[Detailed parameters and workflows](api-client.md#business-requests)

<a id="transport-observation"></a>

### Encrypt transport and observe outcomes: `apiClient`

Inject transport during initialization. Logical request observers receive sanitized outcomes for the overall business call.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `apiClient.observeRequests` | Observe final logical request results | observer(ApiRequestRecord) | `() => void` | `apiClient.observeRequests(record => reportOutcome(record))` |

#### Scenario: Encrypt transport and observe outcomes

```ts
const outcomes: string[] = []
const stop = apiClient.observeRequests(record => { outcomes.push(JSON.stringify(record)) })
try {
  const result = await apiClient.iam.auth.publicConfig()
  if (!result.success)
    throw new Error(result.error.message)
  // outcomes now contains the sanitized logical request record for this call
}
finally {
  stop()
}
```

Input is an observer; output is its unsubscribe function. Records omit raw tokens; refresh or retry internals do not imply multiple business successes. HTTP and capacity boundaries follow.

[Detailed parameters and workflows](api-client.md#transport-observation)
