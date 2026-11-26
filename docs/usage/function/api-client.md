# @h-ai/api-client 功能说明

[English](api-client.en.md) · [日本語](api-client.ja.md)

用 `apiClient` 从浏览器、原生应用或 Node.js 调用 HTTP 接口。直接导入的 `apiClient` 已经是一个客户端，带有 IAM、Storage、AI 三组方法，例如 `apiClient.iam.auth.currentUser()`。应用有自己的报表接口，或者需要在 Node.js 中隔离不同用户的请求时，再用 `apiClient.create(contract)` 创建一个独立客户端。

[模块 README](../../../packages/api-client/README.md) · [配置](../configuration/api-client.md) · [数据结构](../data/api-client.md)

<a id="module-dependencies"></a>

## 依赖

| 依赖 | 用途 | 何时需要 | 接入顺序 |
| --- | --- | --- | --- |
| 浏览器 Fetch | 发送请求并管理服务端发来的 Cookie。 | 本例。Node.js 需要自己的 Fetch 环境及服务地址。 | 浏览器提供。 |
| 已部署的 API 服务 | 验证表单、建立会话并返回当前用户。 | 所有调用。 | 先用 [Serv](api-contract.md#use-with-serv) 或 [Kit](api-contract.md#use-with-kit) 挂载服务。 |
| `@h-ai/api-client` | 提供默认客户端和工厂。 | 所有调用。 | 安装后再初始化。 |
| `@h-ai/api-contract`、`@h-ai/crypto`、`@h-ai/core` | 共享应用契约、启用应用层传输加密或访问 Core 的结果和诊断能力。 | 应用直接导入对应包时。 | 应用契约先由前后端共享。启用加密时先初始化 Crypto。 |

<a id="quick-start"></a>

## 最小接入示例

假设站点和 API 同源，服务端已在 `/api/v1` 挂载标准 IAM 路由，并启用了 HttpOnly 刷新 Cookie。这个页面要完成三件事：用户提交登录表单后进入账号页，账号页打开时显示当前用户，用户点击退出后返回登录页。整个流程使用同一个 `apiClient`。

### 安装

```sh
pnpm add @h-ai/api-client
```

### 浏览器账号页接入

把代码放在前端的 `src/lib/account-api.ts`。在浏览器根布局启动时调用 `startAccountApi()`，检查 `success` 后再打开账号页面。第一次访问登录页可以调用 `readSignInPolicy()` 查服务端开放了哪些登录方式。表单提交调用 `signIn(form)`。账号页从 `readMyProfile()` 的成功结果读取 `data.displayName` 或 `data.username`；退出按钮调用 `signOut()`。页面间导航沿用已启动的实例，应用销毁才调用 `stopAccountApi()`。

```ts
import { apiClient, type IamAuthLoginInput } from '@h-ai/api-client'

export function startAccountApi() {
  // 同源 API 前缀是 /api/v1。auth: {} 选用默认的浏览器 Cookie 存储。
  return apiClient.init({ baseUrl: '/api/v1', auth: {} })
}

export function readSignInPolicy() {
  // 登录前可调用。成功的 data 是公开策略，也可能为 null。
  return apiClient.iam.auth.publicConfig()
}

export async function signIn(form: IamAuthLoginInput) {
  // 把表单动作绑定到这个已初始化的 apiClient，登录成功时动作会先保存凭据。
  const actions = apiClient.createAuthActions(apiClient)
  const result = await actions.login(form)
  if (!result.success)
    return result
  // 页面凭 success 导航，凭据已经留在客户端。
  return { success: true as const }
}

export function readMyProfile() {
  // 由当前访问令牌识别用户，页面无需传用户 ID。
  return apiClient.iam.auth.currentUser()
}

export async function signOut() {
  // 先请服务端撤销当前会话，并在 Cookie 模式下让浏览器收到删除 Cookie 的响应。
  const result = await apiClient.iam.auth.logout({}, { context: { autoRefresh: false } })
  // 即使收到服务端业务失败，也结束本地登录状态。
  await apiClient.auth.clear()
  return result
}

export function stopAccountApi() {
  return apiClient.close()
}
```

`form` 来自实际表单。密码表单传 `{ identifier, password }`，其它方式见[表单认证接口](#auth-actions)。下列顺序方便核对页面行为。

1. 以测试账号提交表单。若 `signIn(form)` 成功，跳到账号页。失败时显示 `error.message`，留在登录页。
2. 账号页打开时调用 `readMyProfile()`。成功则显示资料。访问令牌过期且刷新 Cookie 仍有效时，客户端会尝试自动续期，再读取一次资料。若最终请求失败，由页面根据[错误结果](#request-authorization)决定显示重新登录或无权访问。
3. 点击退出并调用 `signOut()`，页面清空用户状态。若响应失败，提示服务端退出未确认。存储读写失败时，Promise 会拒绝，交给页面的异常处理。

<a id="api-reference"></a>

## 功能说明

<a id="client-lifecycle"></a>

### 默认客户端与独立实例

`import { apiClient } from '@h-ai/api-client'` 拿到的是包提供的默认客户端。前面的账号页直接调用它的 `apiClient.init()` 和 `apiClient.iam.auth.currentUser()`。

`apiClient.create(contract)` 返回另一个实例。应用自己决定变量名，例如 `const reportsClient = apiClient.create(reportsContract)`。从那一刻起，就在同一个 `reportsClient` 上调用 `init()`、业务方法和 `close()`。别的示例里叫 `client` 的变量也只是该实例的名字。自定义实例的业务方法由传入的契约决定，包含 `iam` 才会有 `reportsClient.iam`。见[完整报表客户端示例](#custom-business-client)。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiClient.create(contract)` | 创建独立实例 | 必填与服务端共享的契约路由树。传入某个领域或操作后，新实例才提供对应的方法。 | `ApiClient<TContract>`，由应用单独初始化。 | `const reportsClient = apiClient.create(reportsContract)` |

#### 场景：手机端连接另一套服务，或 SSR 按用户隔离

手机端可以把独立实例连到自己的 API 地址。SSR 为每个入站请求建实例，可以只选择 IAM 并注入该请求的凭据。两个请求各自使用自己的存储和关闭流程。见[按请求读取资料](#detailed-workflow)。契约中的如果应用条件性地启用某个领域，先判断该属性存在再调用。属性 `then` 由框架保留。

<a id="client-integration"></a>

### 客户端初始化与关闭

应用负责选择 API 地址，启动成功后再发请求。浏览器同源部署可选用带 API 前缀的根路径，例如 `/api/v1`。Node.js 或没有浏览器来源的设备传 HTTP(S) 绝对地址。默认客户端和独立实例使用同样的初始化选项。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiClient.init(config)` | 启动默认客户端 | 至少提供 `baseUrl`，其余见下表。 | `Promise<HaiResult<void>>`。非法地址、已经启动或正在关闭会返回初始化失败。 | `await apiClient.init({ baseUrl: '/api/v1', auth: {} })` |
| `apiClient.isInitialized` | 检查是否已启动 | 只读属性。 | `boolean`。 | `apiClient.isInitialized` |
| `apiClient.config` | 查看实际使用的地址等设置 | 只读属性。 | 脱敏快照，未启动时为 `null`。 | `apiClient.config?.baseUrl` |
| `apiClient.close()` | 应用卸载时释放客户端 | 无参数。 | `Promise<void>`。清理观察订阅和页面监听，等待已经开始的凭据写入。 | `await apiClient.close()` |

<a id="call-options"></a>

##### 初始化参数

| 字段 | 怎么填 |
| --- | --- |
| `baseUrl` | 必填字符串。传实际提供 API 的地址，包含宿主挂载前缀。配置 `/api/v1` 后，公开认证路径 `/auth/config` 最终请求 `/api/v1/auth/config`。省略 URL 中的用户信息、查询和片段。 |
| `timeout` | 默认 `30000` 毫秒，涵盖响应头、完整 JSON 及错误正文。已经建立的流用调用方的 `signal` 取消。 |
| `clientName` | 默认 `hai-api-client`，通过 `x-request-client` 发送，便于服务端区别请求来源。 |
| `headers` | 可传字符串键值对象，也可传返回该对象的同步或异步函数。省略时，客户端使用 Core 的当前语言。 |
| `fetch` | 默认平台的全局 Fetch。注入原生网络层或测试替身时，使其支持请求体、取消信号以及场景所需的 Cookie 行为。 |
| `auth` | 省略时，客户端未启用自动令牌管理。填 `{}` 启用默认浏览器 Cookie 模式，其他配置见[凭据存储和刷新](#credentials)。 |
| `transport` | 可选。服务端启用应用层加密后，按[加密示例](#encrypted-requests)传入初始化好的 Crypto。 |

#### 场景：核对账号页发往哪个服务

启动[账号页示例](#quick-start)后，从浏览器网络面板查 `/api/v1/auth/config`。若前端反向代理路径不同，把部署配置的地址交给 `init()`，从 `apiClient.config?.baseUrl` 确认最终地址。配置由谁读取见[配置清单](../configuration/api-client.md)。换地址或存储前先等待 `close()` 完成。并发启动同一实例会共用进行中的初始化。

<a id="credentials"></a>
<a id="storage-modes"></a>

### 凭据存储与会话刷新

访问令牌随业务请求发给服务端，通常寿命较短。刷新令牌用于取得新的访问令牌。两个适配器的差别在于**刷新令牌由谁保管，以及发给刷新接口时走哪里**。

| 问题 | `apiClient.tokenStorage.httpOnlyCookie()` | `apiClient.tokenStorage.memory()` |
| --- | --- | --- |
| 访问令牌在哪里？ | 当前适配器的内存。刷新页面后，旧页面的内存数据消失。 | 当前适配器的内存。 |
| 刷新令牌在哪里？ | 服务端用 `Set-Cookie` 交给浏览器保管。Cookie 有 `HttpOnly`，页面脚本读不到值。 | 和访问令牌一起放在这个适配器的内存。服务端需通过认证响应的 JSON 返回刷新令牌。 |
| 怎样请求刷新？ | 浏览器按 Cookie 规则向刷新端点发送 Cookie。客户端刷新请求正文不填这个令牌。 | 客户端把 `{ refreshToken }` 放进刷新请求的 JSON 正文。 |
| 刷新网页或重建适配器会怎样？ | 新页面的访问令牌内存为空。如果旧 Cookie 仍有效，受保护请求得到可刷新的认证失败后，浏览器可用 Cookie 续期。 | 两个令牌都随旧页面或适配器消失。新适配器从空值开始。 |
| 适合哪里？ | 同源网站或已配好跨源凭据的浏览器应用。`auth: {}` 默认选择它。 | 测试、短任务、Node.js/SSR 按请求隔离。原生应用需要跨重启保留登录时，使用平台的安全存储，例如 [Capacitor](capacitor.md)。 |

<a id="cookie-credentials"></a>

#### 浏览器 Cookie 请求选项

用站点实际的请求举例。登录请求 `POST /api/v1/auth/login` 收到 `Set-Cookie`，浏览器记下刷新 Cookie。随后大多数业务调用，例如 `GET /api/v1/auth/me`，是靠客户端放在 `Authorization` 头里的访问令牌识别身份。Serv 默认把刷新 Cookie 限定在 `/api/v1/auth/refresh`，浏览器只在路径等条件匹配时把它发给刷新接口。

`credentials: 'include'` 是 SDK 交给浏览器 Fetch 的选项，允许浏览器接纳 API 响应中的 `Set-Cookie`，并在发请求时附上符合规则的 Cookie。启用内置 Cookie 模式后，客户端发送的业务请求也允许携带匹配的 Cookie。浏览器会检查 Cookie 的域、路径、`Secure`、`SameSite` 和自身策略。页面与 API 跨源时，服务端还须允许页面的具体 Origin 并开启凭据支持。如果两者跨站，`SameSite` 等策略仍决定 Cookie 能否发送。详见 [Serv 的 Cookie 配置](serv.md#host-options)。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiClient.tokenStorage.httpOnlyCookie()` | 创建访问令牌内存、刷新 Cookie 模式的适配器 | 无参数。启用 `auth` 时的默认适配器。 | `TokenStorage`。 | `auth: { storage: apiClient.tokenStorage.httpOnlyCookie() }` |
| `apiClient.tokenStorage.memory()` | 创建两种令牌都放在内存的独立适配器 | 无参数，新对象为空。 | `TokenStorage`。 | `auth: { storage: apiClient.tokenStorage.memory() }` |
| `apiClient.auth.setTokens(tokens)` | 保存服务端颁发的整组凭据 | 传登录等成功响应的 `data.tokens`。用 `actions.login(form)` 时，动作已完成这一步。 | `Promise<void>`，存储失败时拒绝。 | `await apiClient.auth.setTokens(tokens)` |
| `apiClient.auth.clear()` | 退出或换账号时清理本地凭据 | 无参数。 | `Promise<void>`。Cookie 模式在这一步只清访问令牌的内存。 | `await apiClient.auth.clear()` |
| `apiClient.auth.onTokenRefreshed(callback)` | 在自动刷新成功后更新页面状态 | 接收 `TokenPair` 的同步回调。 | 取消订阅函数。 | `const stop = apiClient.auth.onTokenRefreshed(({ expiresIn }) => updateExpiry(expiresIn))` |

#### 凭据更新、退出与关闭

`setTokens()` 先清理旧凭据，再写入新的访问令牌和响应中实际提供的刷新令牌。存储失败时可清理可能已写入的部分。退出登录时服务端撤销会话并清理浏览器 Cookie，客户端再清理内存。应用销毁时使用 `close()` 释放客户端资源。只有页面重载或引用释放后，旧内存对象才会消失。若应用仍持有存储对象，`close()` 不会清空其中的凭据。

##### 认证配置

| 字段 | 怎么填 |
| --- | --- |
| `storage` | 选择上面的适配器。默认 Cookie；Node.js/SSR 每个实例单独创建内存，原生可注入平台适配器。 |
| `refreshPath` | 默认 `/auth/refresh`，加在 `baseUrl` 后。配置成服务端实际挂载的路径。 |
| `refreshTimeoutMs` | 默认 `10000` 毫秒。限制一次刷新等待时间。网络出错、限流或刷新超时会保留凭据，后续请求可再次尝试。 |
| `terminalType` | 默认 `web`。另有 `app`、`desktop`、`api`。见[会话分组](#terminal-type)。 |
| `onTokenRefreshed` | 适合应用启动时就确定的同步回调。在凭据刷新并写入成功后执行，例如更新界面的有效期。页面自己的订阅可以用 `apiClient.auth.onTokenRefreshed()`。 |
| `onRefreshFailed` | 未配置 `recoverSession` 时，可在刷新明确失败后提示重新登录，例如刷新返回 401、存储无刷新令牌或收到无法使用的刷新数据。 |
| `recoverSession` | 可接一个异步登录交互。仅在原会话明确无法刷新时使用。同一用户的登录成功并保存凭据后返回 `true`，取消或失败返回 `false`。见[原页面恢复实例](#recover-session)。 |

<a id="terminal-type"></a>

##### 终端类型与会话配额

这是登录会话的分组名称。网页用 `web`，手机 App 用 `app`，桌面应用用 `desktop`，服务间调用可用 `api`，以实际登录的应用为准。客户端通过 `X-Hai-Terminal` 把类别告诉服务端。刷新后仍沿用原会话类别。用哪个凭据适配器由 `auth.storage` 决定，服务端权限由当前会话及路由策略决定。

只有 IAM 配置了按终端限制时，这个类别才会影响能同时登录几次。例如服务端设 `session.terminalLimits: { web: 2, app: 1 }`，同一账号最多两个网页会话、一个手机会话。此时未列出的 `desktop` 和 `api` 不能新建会话。达到分组上限后，默认 `session.terminalLimitMode: reject` 拒绝新登录，`replace` 则替换同组最早的会话。服务端的全局上限和单设备模式仍适用。默认 `terminalLimits: {}` 不设置分组上限。见 [IAM 会话配置](../configuration/iam.md)。

##### `TokenPair` 的四个字段

| 字段 | 怎么用 |
| --- | --- |
| `accessToken` | 字符串。客户端把它放在业务请求的 Bearer 头。 |
| `refreshToken` | 可选字符串。内存或原生适配器用认证响应里的这一项续期；Cookie 模式由服务端与浏览器保管 Cookie。 |
| `expiresIn` | 数字，单位为秒。例如 `3600` 表示访问令牌的有效期为一小时。可以用它显示有效期；自动刷新在符合条件的认证失败后开始。 |
| `tokenType` | 固定为 `'Bearer'`，将服务端签发的整组数据交给 `setTokens()` 即可。 |

<a id="token-storage-methods"></a>

##### 自定义存储适配器

| 方法 | 调用结果 |
| --- | --- |
| `storage.getAccessToken()` | 读访问令牌，缺失时返回 `null`。 |
| `storage.setAccessToken(token)` | 保存访问令牌字符串。 |
| `storage.getRefreshToken()` | 读刷新令牌或 `null`。内置 Cookie 适配器在这里提供一个供 SDK 识别的标记，实际令牌由浏览器发送。 |
| `storage.setRefreshToken(token)` | 保存响应提供的刷新令牌。内置 Cookie 适配器由服务端设置 Cookie。 |
| `storage.clear()` | 删除该适配器管理的凭据。 |

存储读写失败时让 Promise 拒绝，这样页面能区分没有凭据和存储不可用。给适配器写单元测试时，可以按下面顺序验证这五个方法。传入测试服务签发的令牌，函数只返回是否成功读回及清空。适配器交给 SDK 后，应用通过 `client.auth` 更新或清除凭据。

```ts
import { apiClient, type TokenPair } from '@h-ai/api-client'

export async function checkMemoryStorage(tokens: TokenPair & { refreshToken: string }) {
  const storage = apiClient.tokenStorage.memory()
  let written = false
  try {
    await storage.setAccessToken(tokens.accessToken)
    await storage.setRefreshToken(tokens.refreshToken)
    written = await storage.getAccessToken() === tokens.accessToken
      && await storage.getRefreshToken() === tokens.refreshToken
  }
  finally {
    await storage.clear()
  }
  const cleared = await storage.getAccessToken() === null && await storage.getRefreshToken() === null
  return { written, cleared }
}
```

<a id="browser-refresh"></a>

#### 场景：账号页打开时显示刷新后的有效期

在[账号页示例](#quick-start)启动且已登录之后，页面用下面的 `watchSessionExpiry()` 监听刷新。然后照常调用 `readMyProfile()`。访问令牌过期时，两个并发的资料请求会共用一次刷新。刷新写入成功后，页面回调收到新的有效秒数；原请求在符合条件时重试一次。离开账号页调用返回的函数取消订阅。

```ts
import { apiClient } from '@h-ai/api-client'

export function watchSessionExpiry(showSeconds: (seconds: number) => void) {
  return apiClient.auth.onTokenRefreshed(({ expiresIn }) => showSeconds(expiresIn))
}
```

这项订阅用于**刷新**后的通知。首次登录如果也要显示有效期，可在 `actions.login(form)` 的成功结果中读取 `data.tokens.expiresIn`。希望应用统一监听时，在启动配置传 `auth: { onTokenRefreshed: ({ expiresIn }) => showSeconds(expiresIn) }`。同一个界面选一种注册方式即可。

<a id="recover-session"></a>

#### 场景：在填写资料时重新登录原账号

例如用户正在编辑资料，读取后台数据时旧会话已经无法续期。应用可以打开重新登录表单，保留当前页的输入。下例是为当前页面任务新建实例的写法。该页面必须知道之前成功登录的用户 ID（来自 `currentUser()`）。传入布局所有者创建的取消信号；退出、换账号或卸载时调用其 `abort()`。从表单取得登录输入和服务端所需的验证码证明后，再把值交给 `promptLogin` 的返回结果，用户取消则返回 `null`。

![访问令牌被拒绝后的刷新、同一用户恢复和请求重试流程](../images/function-api-client-recovery.svg)

```ts
import { apiClient, type IamAuthLoginInput } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function loadProfileWithRecovery(
  baseUrl: string,
  userId: string,
  signal: AbortSignal,
  promptLogin: (userId: string, signal: AbortSignal) => Promise<IamAuthLoginInput | null>,
) {
  // 这里的 profileClient 是这个页面自己创建的独立实例。
  const profileClient = apiClient.create({ iam: apiContract.iam })
  const ready = await profileClient.init({
    baseUrl,
    auth: {
      async recoverSession() {
        const form = await promptLogin(userId, signal)
        if (!form || signal.aborted)
          return false

        // 服务端只允许恢复原账号。动作成功时，令牌已保存到 profileClient。
        const actions = apiClient.createAuthActions(profileClient)
        const signedIn = await actions.login({ ...form, expectedUserId: userId })
        return signedIn.success
      },
    },
  })
  if (!ready.success)
    return ready

  try {
    // 刷新 Cookie 有效时先自动刷新，明确无法刷新后才显示重新登录表单。
    return await profileClient.iam.auth.currentUser(undefined, { signal })
  }
  finally {
    await profileClient.close()
  }
}
```

如果用户取消，或输入的账号不是原会话账号，页面收到原调用的失败结果，可保留正在编辑的内容。成功恢复时，客户端核对当前会话及取消状态，符合条件才重试原请求。一个长驻页面中有多个请求时，让它们共享一次恢复交互，例如使用 [UI 会话恢复助手](ui.md)。

<a id="detailed-workflow"></a>

#### 场景：Node.js 为一个请求读当前用户

SSR 已从本次入站请求的可信认证流程取得服务端颁发的令牌。把包含 API 前缀的绝对地址和这组 `tokens` 传给函数。下面名为 `requestClient` 的实例只属于这一个请求。希望该请求也能自动续期时，服务端必须对这个客户端在 JSON 中发出和轮换刷新令牌。

```ts
import { apiClient, type TokenPair } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function loadProfile(baseUrl: string, tokens: TokenPair) {
  const requestClient = apiClient.create({ iam: apiContract.iam })
  const ready = await requestClient.init({
    baseUrl,
    auth: { storage: apiClient.tokenStorage.memory(), terminalType: 'api' },
  })
  if (!ready.success)
    return ready

  try {
    // 先把该请求的令牌组交给它，再请求当前用户。
    await requestClient.auth.setTokens(tokens)
    return await requestClient.iam.auth.currentUser()
  }
  finally {
    try {
      await requestClient.auth.clear()
    }
    finally {
      await requestClient.close()
    }
  }
}
```

在 `success` 时用 `data` 生成页面，失败时按服务端状态处理。若服务端是启用 Cookie 刷新的 Serv，同时还要接收内存或原生客户端的 JSON 刷新令牌，须让服务端为该客户端选择 [原生令牌传输策略](serv.md#host-options)。

<a id="request-options"></a>

### 单次请求选项

账号页已经按[快速示例](#quick-start)启动并登录。直接读取资料时写 `apiClient.iam.auth.currentUser()`。如果用户切到别的页面，可以在这一次请求上加取消信号。业务输入仍由具体方法决定，例如 `apiClient.iam.users.get({ id: userId })` 需要用户 ID，而 `currentUser()` 根据登录会话识别用户。

#### 选项字段

| 字段 | 怎么用 |
| --- | --- |
| `signal` | 传 `AbortController.signal`，在页面离开时用 `abort()` 停止该次请求的等待和读取。服务端已经执行的写入可能完成。 |
| `context.autoRefresh` | 默认允许自动刷新。比如点击退出时传 `false`，仍发送已有的访问令牌，但这一次请求不会触发续期。 |
| `context.keepalive` | 传 `true` 给浏览器一个页面离开后尽量继续发送的提示，仍受浏览器大小和时机限制。 |
| `context.reauthentication` | 传本次敏感操作的票据字符串。使用 `actions.reauthenticate(password, operation)` 成功返回的 `data.ticket`。见[票据处理链](#reauthentication)。 |
| `context.reauthorize` | 可用异步函数在允许重试时提供新的敏感操作票据。返回票据时用新票据，返回 `null` 时取消重试，返回 `undefined` 时可不带票据重试。 |

#### 场景：导航后忽略旧页面的查询

账号页挂载时调用 `startProfileRead()`，等待 `result` 并检查 `success`，成功后显示用户资料。组件卸载时先调用 `cancel()`，并忽略已离开页面的结果。

```ts
import { apiClient } from '@h-ai/api-client'

export function startProfileRead() {
  const controller = new AbortController()
  const result = apiClient.iam.auth.currentUser(undefined, { signal: controller.signal })
  return { result, cancel: () => controller.abort() }
}
```

<a id="auth-actions"></a>

### 表单认证动作

`apiClient.createAuthActions(targetClient)` 接收一个已初始化且启用 `auth` 的客户端。使用默认客户端时，写 `const actions = apiClient.createAuthActions(apiClient)`。括号外的 `apiClient` 提供工厂，括号里的 `apiClient` 是交给工厂使用的目标实例。使用独立实例时，把它传进去，例如 `apiClient.createAuthActions(reportsClient)`。

表单动作调用底层 `apiClient.iam.auth` 对应的 HTTP 接口。它为 `AuthPanel` 等表单统一登录输入，按登录方式选择密码、LDAP 或验证码接口，并在登录和注册成功后保存令牌。直接调用 IAM 接口时，应用选择具体端点、自行保存凭据，也可以传[单次请求选项](#request-options)。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiClient.createAuthActions(targetClient)` | 将表单动作绑定到指定实例 | 传入已启动的 `apiClient`。独立实例也可传入，须包含标准 IAM 认证路由。 | 绑定到指定客户端的动作对象。 | `apiClient.createAuthActions(apiClient)` |
| `actions.publicConfig()` | 读取认证策略。对应 `apiClient.iam.auth.publicConfig()`。 | 无参数 | `HaiResult`，成功数据为公开策略或 `null`。 | `await actions.publicConfig()` |
| `actions.createCaptcha(input)` | 为指定用途请求交互挑战。对应 `apiClient.iam.auth.createCaptcha(input)`。 | `input.operation` 必填。见下表。 | 挑战数据或失败结果。 | `await actions.createCaptcha({ operation: 'login' })` |
| `actions.login(input)` | 提交密码、LDAP 或验证码登录。按方式转发到 `apiClient.iam.auth.login(input)`、`loginWithLdap({ username, password, captcha?, expectedUserId? })` 或 `loginWithOtp({ identifier, code, captcha?, expectedUserId? })`。LDAP 使用 `username`，验证码登录需要 `code`。 | `input` 是表单整理后的 `IamAuthLoginInput`，见下表。 | 成功时返回用户和凭据，并已完成本地写入。 | `await actions.login({ identifier, password })` |
| `actions.register(input)` | 注册并接入本地凭据。对应 `apiClient.iam.auth.register(input)`。 | 必填注册用户名 `username` 和密码 `password`；可选 `email`、`phone`、`displayName`、`metadata` 和挑战证明 `captcha`。 | 新用户和凭据，成功时已完成本地写入。 | `await actions.register({ username, password })` |
| `actions.sendOtp(identifier, options?)` | 请求验证码。对应 `apiClient.iam.auth.sendOtp({ identifier, captcha })`。 | `identifier` 是用户填入的邮箱或手机；如启用挑战，传 `options.captcha`。 | 验证码有效期 `expiresAt` 或失败结果。 | `await actions.sendOtp(identifier, { captcha })` |
| `actions.requestPasswordReset(identifier, options?)` | 请求密码重置通知。对应 `apiClient.iam.auth.requestPasswordReset({ identifier, captcha })`。 | `identifier` 是待重置账号的标识；如启用挑战，传 `options.captcha`。 | 成功时无业务数据。 | `await actions.requestPasswordReset(identifier)` |
| `actions.confirmPasswordReset(token, newPassword)` | 使用重置链接修改密码。对应 `apiClient.iam.auth.confirmPasswordReset({ token, newPassword })`。 | `token` 为服务端发送的一次性重置凭据，`newPassword` 为用户填写的新密码。均为必填字符串。 | 成功时无业务数据。 | `await actions.confirmPasswordReset(resetToken, newPassword)` |
| `actions.renewPassword(input)` | 续期已到期密码或替换初始密码。对应 `apiClient.iam.auth.renewPassword(input)`。 | 必填账号 `identifier`、原密码 `password` 和 `newPassword`；按策略传 `captcha`。 | 成功时无业务数据。 | `await actions.renewPassword({ identifier, password, newPassword })` |
| `actions.reauthenticate(password, operation)` | 取得单次敏感操作票据。对应 `apiClient.iam.auth.reauthenticate({ password, operation })`。见[票据处理链](#reauthentication)。 | 必填当前密码与服务端登记的敏感操作标识，长度 1–128。 | 票据 `ticket` 和到期时间 `expiresAt`。 | `await actions.reauthenticate(password, operation)` |
| `actions.bindPageExit(options?)` | 在浏览器离开文档时尝试结束会话 | `options.enabled` 默认 `false`。设为 `true` 才监听 `pagehide`。 | 取消绑定函数。 | `actions.bindPageExit({ enabled: true })` |

##### 登录和交互挑战的输入

| 字段 | 来源与要求 |
| --- | --- |
| `identifier` | 用户输入的账号字符串，必填。LDAP 时成为 `username`；验证码登录时填申请验证码的邮箱或手机号。 |
| `method`、`password`、`code` | `method` 默认为 `password`，也可用 `ldap`、`email` 或 `sms`。密码和 LDAP 使用 `password`；验证码使用 `code`，类型要求仍传 `password: ''`。 |
| `expectedUserId` | 恢复同一个会话时传当前会话的用户 ID，普通登录省略。 |
| `operation`、`captcha` | 公开策略要求验证时，按用途 `login`、`register`、`sendOtp`、`passwordReset` 或 `renewPassword` 请求挑战。由 `AuthPanel` 或自定义表单求解，并把一次性证明传给对应动作。 |

认证策略来自 [IAM 公开配置](../data/api-contract.md#public-settings)。认证结果失败时不写入凭据。存储写入本身失败会拒绝 Promise，交给应用清理并报告本地存储错误。服务端控制会话期限和可用登录方式。

#### 场景：根据当前站点的登录策略打开表单

打开[账号页示例](#quick-start)的登录页，先用 `readSignInPolicy()` 判断提供哪些登录方式。站点仅启用密码登录时，页面提交 `signIn({ identifier, password })`。如果页面使用邮箱验证码，就按策略取得挑战证明并用 `actions.sendOtp(email, { captcha })` 发送验证码。用户填好验证码后提交 `signIn({ identifier: email, password: '', method: 'email', code, captcha })`，其中验证码和证明来自当前登录过程。失败保留表单并显示错误，成功才进入账号页。

<a id="page-exit"></a>

#### 场景：按服务端策略在离页时结束会话

适用于共享终端等离开页面后应结束登录的场景。运维在 IAM 配置 `session.endOnPageHide: true`。应用在**已登录浏览器根布局**调用下面的 `bindAccountPageExit()` 一次。先完成登录或恢复访问令牌，再绑定。布局销毁时调用返回的 `unbind()`；应用可在退出成功后提前解除绑定。

```ts
import { apiClient } from '@h-ai/api-client'

export async function bindAccountPageExit() {
  const actions = apiClient.createAuthActions(apiClient)
  const policy = await actions.publicConfig()
  if (!policy.success)
    return policy

  // 配置为空或策略未开启时，返回的解绑函数仍可安全调用。
  const unbind = actions.bindPageExit({ enabled: policy.data?.session.endOnPageHide ?? false })
  return { success: true as const, data: { unbind } }
}
```

关闭标签页或离开当前文档时，SDK 在 `pagehide` 上带当前访问令牌调用 `apiClient.iam.auth.closeSession({})`，并设置 `keepalive: true`、`autoRefresh: false`。进入浏览器往返缓存时跳过，同一个绑定最多发送一次。浏览器可能来不及发送，服务端仍须设置会话超时。离页请求仅撤销该会话，保留 Cookie 写入状态以免迟到的响应影响下一页登录。用户点击退出时仍使用[主动退出](#logout)。

<a id="iam-requests"></a>

### IAM 账号与会话接口

这里的 `iam` 表示账号领域，`auth` 表示登录和会话这组 HTTP 接口。它与 `apiClient.auth` 的职责不同。比如退出时，`apiClient.iam.auth.logout({})` 请求服务器结束会话，随后 `apiClient.auth.clear()` 清除本地凭据。应用需要自行保存登录凭据时，使用本节的[密码登录示例](#password-sign-in)。与表单动作对应的登录、注册、验证码等方法已在[表单认证清单](#auth-actions)中列出。下表收录账号资料、改密、刷新和退出等由调用方直接使用的接口。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiClient.iam.auth.currentUser(input?, options?)` | 读取当前账号 | 无业务参数，`input` 可省略。传第二个参数时使用 `undefined` 占位。 | 当前用户以及角色和权限 | `await apiClient.iam.auth.currentUser()` |
| `apiClient.iam.auth.updateCurrentUser(input, options?)` | 更新本人资料 | `input` 为对象。可按需传 `username`、`email`、`displayName`、`avatarUrl`、`phone`、`metadata`。只提交要更新的字段。 | 更新后的用户资料 | `await apiClient.iam.auth.updateCurrentUser({ displayName: 'Mina' })` |
| `apiClient.iam.auth.changePassword(input, options?)` | 已登录用户修改密码 | `input` 为对象。必填当前密码 `oldPassword` 和新密码 `newPassword`。 | 无业务数据 | `await apiClient.iam.auth.changePassword({ oldPassword, newPassword })` |
| `apiClient.iam.auth.refresh(input, options?)` | 刷新凭据 | `input` 为对象。必填 `refreshToken` 字符串。由客户端持有刷新令牌时使用。 | 新 Token；通常由客户端刷新流程调用 | `await apiClient.iam.auth.refresh({ refreshToken })` |
| `apiClient.iam.auth.logout(input, options?)` | 主动退出 | `input` 对象必填。传 `{}` 时使用当前 Bearer 访问令牌，也可传 `{ accessToken }` 指定要撤销的令牌。 | 无业务数据 | `await apiClient.iam.auth.logout({})` |
| `apiClient.iam.auth.closeSession(input, options?)` | 请求结束当前会话 | `input` 对象必填。传 `{}` 时使用当前 Bearer 访问令牌，也可传 `{ accessToken }` 指定要撤销的令牌。 | 无业务数据 | `await apiClient.iam.auth.closeSession({})` |

<a id="password-sign-in"></a>

#### 场景：手动保存密码登录凭据

[账号页示例](#quick-start)使用 `actions.login(form)`，因此成功后已经保存。若应用要先检查登录结果再决定何时写入，则在同一个已启动的 `apiClient` 上直接调用 `apiClient.iam.auth.login(input)`。下面的 `identifier` 和 `password` 来自登录表单，`captcha` 只在服务端要求时传入。返回成功后页面可调用 `readMyProfile()` 显示资料。

```ts
import { apiClient } from '@h-ai/api-client'

export async function savePasswordSignIn(identifier: string, password: string, captcha?: string) {
  const result = await apiClient.iam.auth.login({ identifier, password, captcha })
  if (!result.success)
    return result

  await apiClient.auth.setTokens(result.data.tokens)
  return { success: true as const }
}
```

<a id="logout"></a>

#### 场景：退出登录与关闭页面

用户点击退出时，调用[账号页代码](#quick-start)里的 `signOut()`。它先用当前访问令牌让服务端撤销会话，再用 `apiClient.auth.clear()` 清理本地。成功结果才确认服务端已撤销。重新打开网页时，先用 `readMyProfile()` 取回当前会话，随后即可用已有访问令牌退出。应用销毁才调用 `stopAccountApi()` 关闭 SDK。普通的应用关闭不会撤销服务端会话。

<a id="request-authorization"></a>

### 身份验证与权限拒绝

认证让服务端确认请求属于哪个会话，鉴权由服务端用该身份判断能否执行指定操作、访问指定资源。客户端可以读取 `roles`、`permissions` 控制菜单和按钮的显示；每次请求仍由 Serv 或 Kit 检查路由权限及资源归属。鉴权接法见 [Serv 认证与守卫](serv.md#authentication)和 [Kit 认证与守卫](kit.md#auth)。

#### 场景：渲染登录用户的角色与权限

在[账号页示例](#quick-start)成功登录后，从页面调用下面的 `readAccessForUi()`。下面函数只把资料和权限快照交给 UI。例如页面可据此展示管理入口，再向服务端请求实际操作。若操作需要再次验证，按[敏感操作票据示例](#reauthentication)取得用途票据。

```ts
import { apiClient } from '@h-ai/api-client'

export async function readAccessForUi() {
  // 无业务输入。失败保留服务端错误，由调用页面处理。
  const profile = await apiClient.iam.auth.currentUser()
  if (!profile.success)
    return profile
  return {
    success: true as const,
    data: { userId: profile.data.id, roles: profile.data.roles, permissions: profile.data.permissions },
  }
}
```

业务接口最终返回 401 时，页面按错误码处理失效会话、拒绝登录或需要再次验证等情况。服务端确认当前身份无权访问时，返回 403，页面提示无权操作并保留当前登录。下面的[自定义业务客户端](#custom-business-client)展示同一账号对不同报告得到的结果。

<a id="custom-business-client"></a>

### 自定义业务客户端

应用在共享文件定义路由树。下面的 `reportsClient` 就是 `apiClient.create(reportsContract)` 返回的对象。契约确定 HTTP 方法、路径、输入和结果，服务端负责挂载处理函数并验证 `reports:export` 权限和报告的访问范围。使用 [Serv 挂载](api-contract.md#use-with-serv)或 [Kit 路由](api-contract.md#use-with-kit)，将处理函数配置为成功时返回导出任务编号，报告可见范围不符时返回 HTTP 403 的失败 `HaiResult`。此示例的宿主同时提供 IAM 和自定义报告路由。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `reportsClient.reports.exports.create(input, options?)` | 为指定的报告创建导出任务 | `input.reportId` 从报告列表所选记录取得，填入路径。必填 `format` 由表单选为 `pdf` 或 `csv`，随请求体发送。 | 成功数据为 `{ exportId: string }`。缺少权限时返回 403 对应的失败分支。 | `await reportsClient.reports.exports.create({ reportId, format: 'pdf' })` |

#### 场景：登录后导出有权限的报告

下例直接导入 `@h-ai/api-client`、`@h-ai/api-contract` 和 `zod`，在应用中声明这三个依赖。把 `reportsContract` 放在客户端和宿主都可导入的共享源码中，其余调用代码放在浏览器业务模块。向函数传入真实的服务基址、登录表单输入和所选报告 ID。应用可把保留登录后的客户端交给布局复用。下例的独立实例只负责本次流程，`finally` 释放实例。

```ts
import { apiClient, type IamAuthLoginInput } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'

export const reportsContract = {
  iam: apiContract.iam,
  reports: {
    exports: {
      create: apiContract.route({
        method: 'POST',
        path: '/reports/{reportId}/exports',
        operationId: 'reports.exports.create',
      })
        .input(z.object({ reportId: z.string().min(1), format: z.enum(['pdf', 'csv']) }))
        .output(apiContract.haiResultSchema(z.object({ exportId: z.string() }))),
    },
  },
}

export async function loginAndExportReport(baseUrl: string, form: IamAuthLoginInput, reportId: string) {
  const reportsClient = apiClient.create(reportsContract)
  // 示例宿主已启用浏览器 Cookie 认证；初始化失败由页面处理。
  const ready = await reportsClient.init({ baseUrl, auth: {} })
  if (!ready.success)
    return ready

  try {
    const actions = apiClient.createAuthActions(reportsClient)
    const login = await actions.login(form)
    if (!login.success)
      return login

    // 调用时使用上一步保存的访问令牌。报告 ID 用于路由，格式随请求体提交。
    const result = await reportsClient.reports.exports.create({ reportId, format: 'pdf' })
    if (!result.success) {
      // 403 是宿主拒绝授权，保留业务码及可用的追踪编号。
      return {
        ...result,
        denied: result.error.httpStatus === 403,
      }
    }
    return result
  }
  finally {
    await reportsClient.close()
  }
}
```

以同一测试用户提交两条记录。对有权限的 `r-42`，用 `data.exportId` 查询导出任务进度。对超出该用户访问范围的 `r-99`，收到 `success: false` 和 `denied: true`，可显示当前报告不可导出。若超时，先通过宿主的任务记录确认是否已受理，再决定是否重新提交。

<a id="http-contract-extensions"></a>

### 用应用契约创建客户端 `apiClient.create(contract)`

下例将基础操作和扩展操作组合成 `project-api.ts`。服务端、客户端共享应用的契约，按已部署的接口保留相应分支。合并 `roles`、`files`、`chats`、`memories` 和 `orders` 时展开组内操作，避免覆盖原来的方法。

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

const { extensions } = apiContract

export const projectContract = apiContract.create({
  iam: {
    ...apiContract.iam,
    apiKeys: extensions.iam.apiKeys,
    roles: { ...apiContract.iam.roles, ...extensions.iam.roles },
  },
  storage: {
    ...apiContract.storage,
    files: { ...apiContract.storage.files, ...extensions.storage.files },
  },
  ai: {
    ...apiContract.ai,
    ...extensions.ai,
    chats: { ...apiContract.ai.chats, ...extensions.ai.chats },
    memories: { ...apiContract.ai.memories, ...extensions.ai.memories },
  },
  audit: extensions.audit,
  payment: { orders: { ...apiContract.payment.orders, ...extensions.payment.orders } },
  feedback: apiContract.feedback,
})

export async function connectProjectClient(baseUrl: string, accessToken: string) {
  const client = apiClient.create(projectContract)
  const ready = await client.init({
    baseUrl,
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!ready.success)
    throw new Error(ready.error.message)
  return { client }
}

export type ProjectClient = Awaited<ReturnType<typeof connectProjectClient>>['client']
```

示例由页面传入当前访问令牌和 API 地址（包括服务端前缀），从返回对象取出 `client` 交给下面各场景。页面或应用退出时由实例所有者调用 `client.close()`。流式和文件传输使用宿主允许的 HTTPS 路由。如果部署同时要求其他接口使用框架传输加密，为两类路由分别创建匹配策略的实例。授权失败时按[调用结果](#request-authorization)处理。

具体端点和服务端挂载方式见 [API Contract](api-contract.md#http-contract-extensions) · [Serv](serv.md#http-contract-extensions)。

<a id="iam-admin-inputs"></a>

### 管理用户、角色与权限 `apiClient.iam.users`、`apiClient.iam.roles`、`apiClient.iam.permissions`

管理员登录后打开用户管理页时使用这组方法，服务端必须授权当前账号。详情、更新与删除的 `id` 是对应列表或创建结果返回的记录 ID。按 IAM 处理函数注册的操作名取得敏感操作票据。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiClient.iam.users.list(input, options?)` | 分页查询用户 | `input` 必填，可传 `{}`。分页、排序和过滤见 [IAM 管理字段](#iam-admin-inputs)。 | 用户分页 | `await apiClient.iam.users.list({ page: 1, pageSize: 20 })` |
| `apiClient.iam.users.get(input, options?)` | 读取用户 | `input.id` 必填，为前一步取得的用户编号字符串。 | 用户资料，或 `null` | `await apiClient.iam.users.get({ id: userId })` |
| `apiClient.iam.users.create(input, options?)` | 创建用户 | 必填 `input.username` 和 `input.password`，账号类型、期限及资料见 [IAM 管理字段](#iam-admin-inputs)。 | 新用户资料 | `await apiClient.iam.users.create({ username, password })` |
| `apiClient.iam.users.invite(input, options?)` | 发出邀请 | 必填 `input.username`，按通知渠道提供 `email` 或 `phone`。`accountStatus` 只允许 `active`。其他字段见 [IAM 管理字段](#iam-admin-inputs)。 | 已创建的待激活用户资料 | `await apiClient.iam.users.invite({ username, email })` |
| `apiClient.iam.users.update(input, options?)` | 修改用户 | `input.id` 必填。其他字段按需提交，`accountExpiresAt: null` 清除期限。见 [IAM 管理字段](#iam-admin-inputs)。 | 更新后的用户资料 | `await apiClient.iam.users.update({ id: userId, displayName: 'Mina' })` |
| `apiClient.iam.users.delete(input, options?)` | 删除用户 | `input.id` 必填，为前一步取得的用户编号字符串。 | 无业务数据 | `await apiClient.iam.users.delete({ id: userId })` |
| `apiClient.iam.users.resetPassword(input, options?)` | 管理员重置密码 | 必填 `input.id` 用户编号与 `input.newPassword`，均为非空字符串。 | 无业务数据 | `await apiClient.iam.users.resetPassword({ id: userId, newPassword })` |
| `apiClient.iam.roles.list(input?, options?)` | 查询角色 | 无业务参数，`input` 可省略。传第二个参数时使用 `undefined` 占位。 | 角色分页 | `await apiClient.iam.roles.list()` |
| `apiClient.iam.roles.get(input, options?)` | 读取角色 | `input.id` 必填，为前一步取得的角色编号字符串。 | 角色记录，或 `null` | `await apiClient.iam.roles.get({ id: roleId })` |
| `apiClient.iam.roles.create(input, options?)` | 创建角色 | 必填 `input.code` 角色代码和 `input.name` 显示名。可选 `description` 及 `isSystem`。 | 新角色 | `await apiClient.iam.roles.create({ code: 'reader', name: 'Reader' })` |
| `apiClient.iam.roles.update(input, options?)` | 更新角色 | 必填 `input.id`，可选新的 `name` 和 `description`。 | 更新后的角色 | `await apiClient.iam.roles.update({ id: roleId, name: 'Report reader' })` |
| `apiClient.iam.roles.delete(input, options?)` | 删除角色 | `input.id` 必填，为前一步取得的角色编号字符串。 | 无业务数据 | `await apiClient.iam.roles.delete({ id: roleId })` |
| `apiClient.iam.permissions.list(input, options?)` | 分页查询权限 | `input` 必填，可用 `{}`。分页与 `type`、`search` 过滤见 [IAM 管理字段](#iam-admin-inputs)。 | 权限分页 | `await apiClient.iam.permissions.list({ page: 1, type: 'api' })` |
| `apiClient.iam.permissions.get(input, options?)` | 读取权限 | `input.id` 必填，为前一步取得的权限编号字符串。 | 权限记录，或 `null` | `await apiClient.iam.permissions.get({ id: permissionId })` |
| `apiClient.iam.permissions.create(input, options?)` | 创建权限 | 必填 `input.code` 与 `input.name`。可选 `description`、`resource`、`action`、`type` 和 `sensitiveOperations`，见 [IAM 管理字段](#iam-admin-inputs)。 | 新权限 | `await apiClient.iam.permissions.create({ code: 'reports:read', name: 'Read reports' })` |
| `apiClient.iam.permissions.setSensitiveOperations(input, options?)` | 配置敏感操作 | `input.id` 为必填权限编号。`sensitiveOperations` 传最多 1000 个操作标识，每个 1–128 字符，`[]` 清除。 | 无业务数据 | `await apiClient.iam.permissions.setSensitiveOperations({ id: permissionId, sensitiveOperations: ['iam.users.delete'] })` |
| `apiClient.iam.permissions.delete(input, options?)` | 删除权限 | `input.id` 必填，为前一步取得的权限编号字符串。 | 无业务数据 | `await apiClient.iam.permissions.delete({ id: permissionId })` |

##### 管理字段

| 字段 | 来源与缺省行为 |
| --- | --- |
| `page`、`pageSize` | 用户和权限列表使用。页号从 1 起，默认 1；每页 1–100 条，默认 20。角色列表无业务参数，返回结构仍为分页对象。 |
| `sortBy`、`sortDirection` | 用户列表可按 `username`、`email`、`displayName`、`accountStatus` 或 `createdAt` 排序，方向为 `asc` 或 `desc`。 |
| `search`、`roleCode`、`accountStatus` | 用户列表接受搜索词、角色代码和账号状态 `active`、`dormant`、`closed`。权限列表接受搜索词。省略对应字段时按服务端默认条件查询。 |
| `accountType`、`accountStatus`、`accountExpiresAt` | 创建或更新用户时可设置永久 `permanent` 或临时 `temporary` 账号、状态和期限；更新时 `null` 清除期限。邀请账号状态仅可为 `active`。 |
| `email`、`phone`、`displayName`、`avatarUrl`、`metadata`、`roleIds` | 用户资料与角色分配字段。更新时可设置头像；`metadata` 是应用扩展对象，`roleIds` 来自角色操作的记录 ID。 |
| `type`、`sensitiveOperations` | 权限类型可为 `menu`、`api` 或 `button`。敏感操作列表最多 1000 项，每项 1–128 字符；传 `[]` 清除。 |

<a id="iam-management-extensions"></a>

#### 角色权限关联与 API Key 管理

用[应用契约创建的 `client`](#http-contract-extensions) 调用以下六个管理操作。Serv 检查 `iam.roles.read` / `iam.roles.write` 或 `iam.apiKeys.read` / `iam.apiKeys.write` 以及目标账号或角色。API Key 列表的 `sortBy` 支持 `name`、`createdAt`、`lastUsedAt`、`expiresAt`。再认证策略可使用 `iam.roles.replacePermissions`、`iam.apiKeys.create`、`iam.apiKeys.delete`，通过 `options.context.reauthentication` 传入对应票据。角色替换发生冲突时，重新读取该角色权限并按策略取得新票据后再提交。

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `client.iam.roles.listPermissions(input, options?)` | 查看角色的直接权限 | 必填 `id`，来自角色列表。 | `HaiResult` 的 `data` 是权限记录数组。 | `await client.iam.roles.listPermissions({ id: roleId })` |
| `client.iam.roles.replacePermissions(input, options?)` | 整组替换角色的直接权限 | 必填角色 `id` 和完整 `permissionIds`；`[]` 清空关联。按策略传再认证票据。 | `HaiResult<void>`。并发修改时 `error.httpStatus` 为 409。 | `await client.iam.roles.replacePermissions({ id: roleId, permissionIds }, options)` |
| `client.iam.apiKeys.list(input, options?)` | 查看指定账号的 API Key | 必填 `userId`。可选 `page`、`pageSize`、`search`、`enabled`、`sortBy`、`sortDirection`。 | `HaiResult`，包含 `items`、`total`、`page`、`pageSize`。 | `await client.iam.apiKeys.list({ userId, page: 1, enabled: true })` |
| `client.iam.apiKeys.create(input, options?)` | 为账号签发 API Key | 必填 `userId` 和 `name`。可选 `scopes` 和 `expirationDays`，到期天数省略时用 IAM 配置，`0` 表示无期限。 | `HaiResult` 的 `data.apiKey` 是元数据，`data.rawKey` 仅在本次返回。 | `await client.iam.apiKeys.create({ userId, name, expirationDays: 30 }, options)` |
| `client.iam.apiKeys.get(input, options?)` | 读取 API Key 元数据 | 必填 `id`，取列表项的 `id` 或创建响应的 `apiKey.id`。 | `HaiResult`，元数据含前缀、状态、有效期和权限范围。 | `await client.iam.apiKeys.get({ id: keyId })` |
| `client.iam.apiKeys.revoke(input, options?)` | 吊销 API Key | 必填密钥记录 `id`。按策略传再认证票据。 | `HaiResult<void>` | `await client.iam.apiKeys.revoke({ id: keyId }, options)` |

#### 场景：为报表集成签发一把密钥

管理页选择目标账号的 `userId`，并在服务端已将 `iam.apiKeys.create` 配为敏感操作的情况下向管理员询问当前密码。成功后把 `rawKey` 在本次页面操作中交给集成方。后续列表和详情只显示密钥元数据，别把明文写进日志。

```ts
import type { ProjectClient } from './project-api'

export async function issueReportKey(client: ProjectClient, userId: string, password: string) {
  const proof = await client.iam.auth.reauthenticate({ password, operation: 'iam.apiKeys.create' })
  if (!proof.success)
    return proof

  const issued = await client.iam.apiKeys.create({
    userId,
    name: 'Report reader',
    expirationDays: 30,
    scopes: ['reports:read'],
  }, { context: { reauthentication: proof.data.ticket } })
  if (!issued.success)
    return issued
  return { success: true as const, data: { id: issued.data.apiKey.id, rawKey: issued.data.rawKey } }
}
```

<a id="reauthentication"></a>

#### 场景：用再认证票据删除用户

管理页面先从用户列表选择记录，取得 `id`，再让管理员输入本人的当前密码。服务端把 `iam.users.delete` 配置为敏感操作。示例失败时保留对应步骤的业务错误；成功后管理页面重新读取列表。

```ts
import { apiClient } from '@h-ai/api-client'

export async function deleteSelectedUser(id: string, administratorPassword: string) {
  const actions = apiClient.createAuthActions(apiClient)
  // 用管理员当前密码为这项操作申请票据。
  const proof = await actions.reauthenticate(administratorPassword, 'iam.users.delete')
  if (!proof.success)
    return proof

  // id 来自列表所选记录；票据只提交给已确认的敏感操作。
  const deleted = await apiClient.iam.users.delete({ id }, {
    context: { reauthentication: proof.data.ticket },
  })
  if (!deleted.success)
    return deleted
  return deleted
}
```

##### 再认证票据的处理链

1. `actions.reauthenticate(password, 'iam.users.delete')` 向 IAM 提交当前密码和操作标识。成功结果的 `data.ticket` 是本次操作的短期单次票据。
2. `delete({ id }, { context: { reauthentication: proof.data.ticket } })` 的首参是要删除的用户 ID。第二个参数的 `context` 是本次客户端调用的选项，API Client 的 HTTP Link 读出 `reauthentication` 字符串，并写进 `X-Hai-Reauthentication` 请求头。业务请求的输入仍为 `{ id }`。
3. Serv 的删除路由先检查 `iam.users.write`，进入处理函数后读取这个请求头，并把票据、当前访问令牌及服务端确定的 `iam.users.delete` 传给 `iam.auth.checkSensitiveOperation()`。IAM 检查票据用途和当前会话，满足条件才执行删除。Kit 自定义路由在已有权限及资源检查后调用 `kit.guard.requireSensitive(iam, event, operation)`，由该守卫读取同一个请求头。

源码入口依次是 `packages/api-client/src/api-client-link.ts` 的 `buildRawClient()` 中的 `headers` 回调、`packages/serv/src/features/serv-feature-iam.ts` 的 `users.delete` 和 `sensitive()`、`packages/iam/src/authn/iam-authn-functions.ts` 的 `checkSensitiveOperation()`。如果应用使用 Kit，读请求头的是 `packages/kit/src/guards/kit-sensitive.ts` 中的 `requireSensitive()`。

<a id="storage-requests"></a>

### 访问对象存储 `client.storage`

使用已挂载的 Storage 路由管理对象。预签名 URL 由业务端点签发，浏览器拿到地址后直接访问对象存储。小文件中转由应用服务收发文件，需用[应用契约创建的 `client`](#http-contract-extensions) 并启用对应的 HTTPS 路由。中转可用于不支持预签名的本地存储。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiClient.storage.files.list(input, options?)` | 列出当前用户有权查看的对象 | `input` 必填，可传 `{}`。`prefix` 选前缀，`maxKeys` 为 1–1000，`delimiter` 按分隔符分组，`continuationToken` 来自上一页。 | 文件列表和继续分页所需的信息 | `await apiClient.storage.files.list({ prefix: 'reports/', maxKeys: 20 })` |
| `apiClient.storage.files.getMetadata(input, options?)` | 读对象元数据 | 必填 `input.key`，为当前调用方有权读取的对象键。 | 键、大小、类型等 | `await apiClient.storage.files.getMetadata({ key })` |
| `apiClient.storage.files.delete(input, options?)` | 删除单个对象 | 必填 `input.key`，为当前调用方有权删除的对象键。 | 无业务数据 | `await apiClient.storage.files.delete({ key })` |
| `apiClient.storage.files.deleteMany(input, options?)` | 批量删除对象 | 必填 `input.keys` 为非空对象键数组，服务端检查每个键的删除权限。 | 删除结果，或带部分处理进度的失败 | `await apiClient.storage.files.deleteMany({ keys: [key] })` |
| `apiClient.storage.presignedUrls.createUpload(input, options?)` | 签发上传地址 | 必填 `input.key`。可选 `contentType` 默认 `application/octet-stream`，`expiresIn` 默认 900 秒。 | 临时上传 URL 和对象键 | `await apiClient.storage.presignedUrls.createUpload({ key, contentType: 'application/pdf' })` |
| `apiClient.storage.presignedUrls.createDownload(input, options?)` | 签发下载地址 | 必填 `input.key`。可选 `expiresIn` 为签名 URL 有效秒数，默认 900。 | 临时下载 URL 和对象键 | `await apiClient.storage.presignedUrls.createDownload({ key, expiresIn: 60 })` |
| `client.storage.files.upload(input, options?)` | 通过应用服务上传 | 必填授权对象 `key` 和浏览器 `file: File`。非空文件最大 5 MiB。 | `HaiResult`。成功时返回对象元数据。已有同名对象时失败。 | `await client.storage.files.upload({ key, file })` |
| `client.storage.files.download(input, options?)` | 通过应用服务下载附件 | 必填有读取权限的对象 `key`，服务端限制为 5 MiB。 | 成功为 `File`，失败为 `HaiResult<never>` 的失败分支。 | `await client.storage.files.download({ key })` |

如果批量删除只完成一部分，失败结果可能在 `error.ext.deleteMany` 提供已完成和失败的键。按这份结果更新列表并决定哪些对象需要重新处理。

#### 场景：申请 PDF 上传地址

用户准备上传报告附件。后端已限定当前用户可写的对象键，应用从分配结果取得 `key`。服务端使用支持预签名的对象存储，跨源浏览器还需要对象存储允许页面 Origin 和 PUT。先为签名键申请地址，再用相同内容类型执行上传。

```ts
import { apiClient } from '@h-ai/api-client'

export async function uploadReport(key: string, file: File) {
  const contentType = 'application/pdf'
  // key 是后端分配的上传位置。成功后 data.url 是临时地址。
  const signed = await apiClient.storage.presignedUrls.createUpload({ key, contentType })
  if (!signed.success)
    return signed

  // 直接向对象存储写入，检查对象存储的实际结果。
  const uploaded = await fetch(signed.data.url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  })
  if (!uploaded.ok)
    throw new Error(`Upload failed (${uploaded.status})`)
  return signed
}
```

#### 场景：选择 PDF 后通过应用上传并回读

文件选择器提供 `File`，应用为本次上传分配有写权限的对象 `key`。上传成功后使用回执里的键读取同一份文件。读取成功可下载或预览，任一步失败时用返回的错误提示用户。

```ts
import type { ProjectClient } from './project-api'

export async function verifyUploadedPdf(client: ProjectClient, key: string, file: File) {
  const uploaded = await client.storage.files.upload({ key, file })
  if (!uploaded.success)
    return uploaded

  const downloaded = await client.storage.files.download({ key: uploaded.data.key })
  if (!(downloaded instanceof File))
    return downloaded
  return { success: true as const, data: downloaded }
}
```

<a id="ai-requests"></a>

### 调用聊天、记忆和会话接口 `client.ai`

服务端挂载 AI 路由后，默认实例可调用 JSON 聊天补全、消息、历史、记忆查询和会话列表。用[应用契约创建的 `client`](#http-contract-extensions) 调用流式聊天、记忆写入和媒体操作。提交 `objectId` 只在宿主允许操作目标主体时生效，省略时使用当前认证主体。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiClient.ai.chats.createCompletion(input, options?)` | 提交消息列表并取得非流式补全 | `input.messages` 非空数组必填，其他生成、工具和会话字段见 [AI 请求字段](#ai-input-fields)。 | `data.choices` 为候选回答，另有模型、用量和工具调用 | `await apiClient.ai.chats.createCompletion({ messages: [{ role: 'user', content: '为报告拟一个标题' }] })` |
| `apiClient.ai.chats.sendMessage(input, options?)` | 发送会话消息 | 必填 `input.message`。`sessionId` 默认 `default`，可选 `objectId`、`systemPrompt`、`model`、`temperature`（0–2）。 | 回复文本、模型和可选用量 | `await apiClient.ai.chats.sendMessage({ message, sessionId })` |
| `apiClient.ai.chats.listHistory(input, options?)` | 查询历史 | 必填 `input.sessionId`。可选主体 `objectId`、条数 `limit`（1–200）及 `order`（`asc` 或 `desc`）。 | `data.items` 为聊天记录列表，每条含 `request.messages` 和 `response.content` | `await apiClient.ai.chats.listHistory({ sessionId, limit: 20, order: 'asc' })` |
| `apiClient.ai.memories.list(input, options?)` | 查询记忆 | `input` 必填，可传 `{}`。可选 `objectId`、`types` 数组、从 0 起的 `offset` 与 `limit`（1–100）。 | `data.items` 为本页条目，`data.total` 为匹配总数。 | `await apiClient.ai.memories.list({ offset: 0, limit: 20, types: ['preference'] })` |
| `apiClient.ai.memories.recall(input, options?)` | 按内容检索记忆 | 必填 `input.query`。可选主体 `objectId`、结果数 `topK`（至少 1）、`types` 数组与 `minImportance`（0–1）。 | `data.items` 为命中的记忆条目，可为空 | `await apiClient.ai.memories.recall({ query: '报告用什么格式', topK: 3 })` |
| `apiClient.ai.sessions.list(input, options?)` | 查询对象的会话 | `input` 必填，可传 `{}` 使用当前认证主体。`objectId` 可指定经授权的主体。 | `data.items` 为会话列表，包含 `sessionId` 和更新时间。 | `await apiClient.ai.sessions.list({})` |
| `client.ai.chats.streamCompletion(input, options?)` | 逐段接收模型回复 | 与 `createCompletion` 使用相同输入；第二参数可传 `signal`。 | 成功为异步事件迭代器；建立前返回失败结果，建立后错误由迭代抛出。 | `await client.ai.chats.streamCompletion({ messages }, { signal })` |
| `client.ai.memories.add(input, options?)` | 保存一条记忆 | 必填 `content`（1–5000 字符）和 `type`。可选 `importance`（0–1）及经授权的 `objectId`。 | `HaiResult`，`data` 为记忆条目，含 `id`、`content` 和 `type`。 | `await client.ai.memories.add({ content, type: 'preference' })` |
| `client.ai.memories.update(input, options?)` | 编辑记忆 | 必填 `id`，并至少提交一个 `content`、`type` 或 `importance`。可选 `objectId`。 | `HaiResult`，`data` 为记忆条目，含 `id`、`content` 和 `type`。 | `await client.ai.memories.update({ id: memoryId, content })` |
| `client.ai.memories.remove(input, options?)` | 删除一条记忆 | 必填记忆 `id`。可选经授权的 `objectId`。 | `HaiResult<void>` | `await client.ai.memories.remove({ id: memoryId })` |
| `client.ai.memories.clear(input, options?)` | 清空已授权范围的记忆 | 传 `{}` 使用默认主体，也可传 `objectId` 和非空 `types`；宿主须明确批准清空。 | `HaiResult<void>` | `await client.ai.memories.clear({ types: ['preference'] })` |
| `client.ai.audio.getCapabilities(input, options?)` | 查询模型的语音能力 | 必填 `operation` 为 `transcribe` 或 `synthesize`；可选经宿主授权的 `model`。 | `HaiResult`。按操作返回实时输入、流式输出等能力字段。 | `await client.ai.audio.getCapabilities({ operation: 'transcribe' })` |
| `client.ai.audio.issueTicket(input, options?)` | 为语音 WebSocket 申请票据 | 必填 `operation` 为 `transcribe` 或 `synthesize`；可选 `model`。 | `HaiResult`。返回一次性 `ticket` 和毫秒级 `expiresAt`，票据有效 30 秒。 | `await client.ai.audio.issueTicket({ operation: 'synthesize' })` |
| `client.ai.audio.transcribe(input, options?)` | 将录音转为文本 | 必填 WAV 或 MP3 `audio: File`，最大 8 MiB；可选 `language`、`model`。 | `HaiResult<{ text, language?, durationMs? }>` | `await client.ai.audio.transcribe({ audio })` |
| `client.ai.audio.synthesize(input, options?)` | 把文本合成为语音 | 必填 `text`（1–5000 字符）；可选 `voice`、`model`、`format`（默认 `wav`，也可用 `mp3`）。 | 成功为音频 `File`，失败为 `HaiResult<never>` 的失败分支。 | `await client.ai.audio.synthesize({ text, format: 'mp3' })` |
| `client.ai.images.generate(input, options?)` | 从提示词和可选参考图生成一张图片 | 必填 `prompt`（1–5000 字符）。可选 `model`、成对的 `width`／`height`（各 1–2048）、最多 4 张 `referenceImages`（合计不超过 10 MiB）。 | 成功为图片 `File`，失败为 `HaiResult<never>` 的失败分支。 | `await client.ai.images.generate({ prompt, referenceImages })` |

<a id="ai-input-fields"></a>

##### 聊天补全请求字段

| 字段 | 来源与要求 |
| --- | --- |
| `messages` | 必填且非空。传本次补全需要的消息，包括用户消息，以及按需传入的对话上下文和工具结果。 |
| `objectId`、`sessionId` | 可选。主体默认绑定认证用户，会话 ID 默认为 `default`。 |
| `model`、`temperature`、`top_p`、`max_tokens` | 可选模型和生成设置。温度为 0–2，`top_p` 为 0–1，`max_tokens` 为正整数。 |
| `tools`、`tool_choice` | 可选非空工具定义数组；可用 `auto`、`none`、`required` 或指定已声明的函数。由应用授权执行返回的 `tool_calls`，再将结果和对应 `tool_call_id` 发给模型。 |

#### 场景：打开已有会话并继续提问

聊天页打开时调用 `listMySessions()`，成功后用 `data.items` 显示侧栏。用户选择某一项，用它的 `sessionId` 调用 `loadChatHistory()`。提交消息时把同一个 ID 和输入框文本传给 `sendChatMessage()`。只在发送成功后把 `data.content` 追加到对话，失败时保留用户输入。没有既有会话时，应用可先为新对话生成并保存一个会话 ID。

```ts
import { apiClient } from '@h-ai/api-client'

export function listMySessions() {
  // 省略 objectId，服务端从登录会话确定用户。成功时读取 data.items。
  return apiClient.ai.sessions.list({})
}

export function loadChatHistory(sessionId: string) {
  // 读取已选会话的问答。成功时读取 data.items。
  return apiClient.ai.chats.listHistory({ sessionId, limit: 20, order: 'asc' })
}

export function sendChatMessage(sessionId: string, message: string) {
  // 继续在同一个会话提问。成功时从 data.content 取得回复。
  return apiClient.ai.chats.sendMessage({ sessionId, message })
}
```

#### 场景：为报告生成标题建议

报告编辑页把当前报告的摘要传给 `suggestReportTitle()`。补全请求由调用方提供本次所需的完整消息。成功时从第一个候选里取标题文本，用户确认后可以填入表单。候选没有可用文本时，保留原有标题。

```ts
import { apiClient } from '@h-ai/api-client'

export async function suggestReportTitle(summary: string) {
  const result = await apiClient.ai.chats.createCompletion({
    messages: [
      { role: 'system', content: '根据摘要给出一个简短的报告标题。' },
      { role: 'user', content: summary },
    ],
    max_tokens: 80,
    tool_choice: 'none',
  })
  if (!result.success)
    return result
  const title = result.data.choices[0]?.message.content
  return { success: true as const, data: { title: title?.trim() || null } }
}
```

#### 场景：分页浏览或按问题查找自己的记忆

记忆设置页打开时，用 `listPreferences(0)` 显示第一批偏好。按每页 20 条将 `offset` 增到 20、40，依据返回的 `data.total` 判断是否还有下一页。用户输入搜索问题时调用 `findPreferences(query)`，从 `data.items` 显示最多三个相关条目。成功但返回空数组时，提示无匹配项。请求失败时显示错误并保留当前列表。

```ts
import { apiClient } from '@h-ai/api-client'

export function listPreferences(offset: number) {
  return apiClient.ai.memories.list({ offset, limit: 20, types: ['preference'] })
}

export function findPreferences(query: string) {
  return apiClient.ai.memories.recall({ query, topK: 3, types: ['preference'] })
}
```

#### 场景：在对话页面逐段显示第一条候选回复

发送问题前由页面建立一个 `AbortController`，传入 `signal`。收到增量时通过 `onText` 更新本次回复，收到 `done` 时结束。取消或离页时中止请求。调用方捕获迭代异常并在页面显示失败。

```ts
import type { ProjectClient } from './project-api'

export async function streamAnswer(
  client: ProjectClient,
  question: string,
  onText: (text: string) => void,
  signal: AbortSignal,
) {
  const events = await client.ai.chats.streamCompletion({
    messages: [{ role: 'user', content: question }],
  }, { signal })
  if (!(Symbol.asyncIterator in events))
    throw new Error(events.error.message)

  for await (const event of events) {
    if (event.type === 'done')
      return
    const text = event.choices.find(choice => choice.index === 0)?.delta.content
    if (text)
      onText(text)
  }
}
```

#### 场景：转写录音并生成试听文件

录音页传入 WAV 或 MP3 文件。转写成功且内容非空时，用取得的文本生成 MP3。成功结果为音频文件。空转写结果返回 `null`，页面可提示没有可合成的文本。

```ts
import type { ProjectClient } from './project-api'

export async function makeVoicePreview(client: ProjectClient, recording: File) {
  const transcript = await client.ai.audio.transcribe({ audio: recording })
  if (!transcript.success)
    return transcript
  if (!transcript.data.text.trim())
    return { success: true as const, data: null }

  const speech = await client.ai.audio.synthesize({ text: transcript.data.text, format: 'mp3' })
  if (!(speech instanceof File))
    return speech
  return { success: true as const, data: speech }
}
```

录音文件和参考图通过 multipart 上传，语音合成和图像生成的返回值直接作为 `File` 使用。浏览器用 `URL.createObjectURL(file)` 预览，用完释放。实时语音仍通过 WebSocket，`@h-ai/ai/client` 的 `getTicket` 回调在每次建立连接前调用 `client.ai.audio.issueTicket(request)`。成功时返回 `data.ticket` 给回调，失败时提示用户并终止这次连接。

<a id="audit-requests"></a>

### 查询和归档审计日志 `client.audit`

在[应用契约](#http-contract-extensions)中挂载 `audit` 后，管理台可分页查询、汇总及归档。Serv 的读取权限为 `audit:read`，归档权限为 `audit:backup`。宿主决定可查询的数据范围以及是否为 `audit.backup` 检查再认证票据。归档回执中的 `key` 是私有存储键。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `client.audit.logs.list(input, options?)` | 分页查询日志 | 传 `{}` 使用默认分页。可选分页、分类、结果、级别、用户、范围、资源、操作、追踪编号、ISO 起止时间与排序。 | `HaiResult`，`data.items` 为日志，`data.total` 为总数。 | `await client.audit.logs.list({ page: 1, outcome: 'denied' })` |
| `client.audit.logs.stats(input, options?)` | 按操作统计日志数量 | 可选 `days`（0–365 天，默认 7）。可按 `category`、`outcome`、`severity`、`scopeId`、`userId`、`resource` 过滤。 | `HaiResult<{ action, count }[]>` | `await client.audit.logs.stats({ days: 7 })` |
| `client.audit.backup.run(input, options?)` | 将日志写入私有归档 | 必填本次归档的 UUID `id`；同一次操作重试时复用它。再认证按宿主策略。 | `HaiResult`，含归档 `key`、`recordCount`、`sha256` 和时间。 | `await client.audit.backup.run({ id: archiveId }, options)` |

#### 场景：查看最近一周被拒绝的操作

打开审计页时，使用相同结果筛选条件查询日志和统计。页面用日志分页展示详情，用统计绘制近七天按操作分组的计数。两次都成功后再更新这组视图数据。

```ts
import type { ProjectClient } from './project-api'

export async function loadDeniedAudit(client: ProjectClient) {
  const recent = await client.audit.logs.list({ page: 1, pageSize: 20, outcome: 'denied' })
  if (!recent.success)
    return recent

  const weekly = await client.audit.logs.stats({ days: 7, outcome: 'denied' })
  if (!weekly.success)
    return weekly
  return { success: true as const, data: { recent: recent.data, weekly: weekly.data } }
}
```

<a id="payment-requests"></a>

### 发起支付与处理订单 `client.payment.orders`

订单页面用[应用契约中的订单操作](#http-contract-extensions)发起支付、查询状态、退款或关闭待支付订单。服务端校验订单和操作者，金额按业务和支付渠道约定提交。支付渠道的回调由服务端的 Payment 通知路由接收。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `client.payment.orders.create(input, options?)` | 发起支付并取得收银参数 | 必填 `provider`、整数 `amount`、`description`、`tradeType`。微信用 `jsapi` 且须传渠道用户标识 `userId`，支付宝和 Stripe 用 `h5`。可选 `metadata`。 | `HaiResult`，含 `clientParams` 和可选 `prepayId`。 | `await client.payment.orders.create({ provider: 'stripe', tradeType: 'h5', amount, description })` |
| `client.payment.orders.get(input, options?)` | 查询订单状态 | 必填 `orderNo`，由业务订单记录提供。 | `HaiResult`。成功时可读 `status`。 | `await client.payment.orders.get({ orderNo })` |
| `client.payment.orders.refund(input, options?)` | 发起退款 | 必填 `provider`、`orderNo`、`refundNo`、整数 `amount`。可选 `reason`。 | `HaiResult`，含 `refundNo`、`refundId` 和退款状态。 | `await client.payment.orders.refund({ provider, orderNo, refundNo, amount })` |
| `client.payment.orders.close(input, options?)` | 关闭待支付订单 | 必填 `provider` 和 `orderNo`，取自待关闭业务订单。宿主核对订单归属及渠道。 | `HaiResult<void>` | `await client.payment.orders.close({ provider, orderNo })` |

#### 场景：关闭待支付订单后重新读取状态

订单详情中的状态为 `pending` 时，界面允许有权限的操作者确认关单。把业务记录中的渠道和商户订单号传给示例。关闭成功后重新查询状态再更新界面。失败时显示返回错误。

```ts
import type { PaymentCloseOrderInput } from '@h-ai/api-contract'
import type { ProjectClient } from './project-api'

export async function closeUnpaidOrder(client: ProjectClient, order: PaymentCloseOrderInput) {
  const closed = await client.payment.orders.close(order)
  if (!closed.success)
    return closed
  return client.payment.orders.get({ orderNo: order.orderNo })
}
```

<a id="feedback-requests"></a>

### 提交和处理反馈 `client.feedback`

服务端在应用契约中挂载 `apiContract.feedback` 后，从 `client.feedback` 调用相同的提交、查询和回复接口。服务端从可信会话确定业务范围、作者和权限。

| API | 用途 | 调用示例 |
| --- | --- | --- |
| `client.feedback.reports.submit(input, options?)` | 提交正文和附件 | `await client.feedback.reports.submit({ id, body, attachments })` |
| `client.feedback.reports.listMine(input, options?)` | 查看自己的反馈 | `await client.feedback.reports.listMine({})` |
| `client.feedback.reports.list(input, options?)` | 在管理端查询反馈 | `await client.feedback.reports.list({ status: 'pending' })` |
| `client.feedback.reports.get(input, options?)` | 打开正文和首帖附件 | `await client.feedback.reports.get({ id })` |
| `client.feedback.reports.listMessages(input, options?)` | 分页读取最新回复 | `await client.feedback.reports.listMessages({ id, page: 1 })` |
| `client.feedback.reports.addMessage(input, options?)` | 发送回复或请求补充 | `await client.feedback.reports.addMessage({ id, messageId, body, kind: 'reply' })` |
| `client.feedback.reports.setStatus(input, options?)` | 标记待处理或已处理 | `await client.feedback.reports.setStatus({ id, status: 'handled' })` |
| `client.feedback.attachments.get(input, options?)` | 获取附件内容 | `await client.feedback.attachments.get({ id, attachmentId })` |

#### 场景：提交后查看自己的反馈

下例在异步函数中使用带反馈子契约的 `client`。提交成功后，使用服务端返回的 ID 打开详情。

```ts
const submitted = await client.feedback.reports.submit({ id, body, attachments })
if (!submitted.success)
  return submitted
return client.feedback.reports.get({ id: submitted.data.id })
```

[@h-ai/feedback](feedback.md#api-reference)

<a id="encrypted-requests"></a>

### 接入启用应用层加密的服务

加密客户端通过服务端协商路径建立传输会话。应用先在 Serv 或 Kit 配置密钥交换和目标路由，再将已初始化的 Crypto 传给客户端。下例用 `apiClient.create({ iam: apiContract.iam })` 创建 `encryptedClient`。通过这个实例发送的业务请求和令牌刷新都经过加密传输。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `encryptedClient.init(config)` | 为实例启用加密传输 | 提供 `baseUrl` 和 `transport`。其中 `crypto` 必填，其余见下表。 | `HaiResult<void>`。握手和响应校验失败通过实际请求返回。 | `await encryptedClient.init({ baseUrl, transport: { crypto } })` |

##### 传输参数

| 字段 | 类型、默认值与生效条件 |
| --- | --- |
| `transport.crypto` | 已初始化的 `@h-ai/crypto` 运行实例。服务端密钥环和私钥由服务端保管。 |
| `transport.keyExchangePath` | 默认 `/_hai/key-exchange`，相对于 `baseUrl`。例如 `/api/v1/_hai/key-exchange`。 |
| `transport.maxPlaintextBytes` | 可选的正整数，单位字节。省略时采用握手公布的上限，指定时取客户端与服务端较小值。 |

跨域时按服务端配置允许和公开 `X-Hai-Transport`。加密协议、密钥注册与 CORS 设置见 [Crypto 加密传输](crypto.md#transport) 和 [客户端配置入口](../configuration/api-client.md)。

#### 场景：读取已启用加密的认证策略

服务端已启用加密、挂载同一个 IAM 契约并允许客户端握手。在独立进程中执行以下示例，传入该服务的实际 HTTPS 地址。当前函数负责 Crypto 生命周期，先关闭客户端，再关闭 Crypto。长驻应用复用已有 Crypto 时由它的所有者负责关闭。

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { crypto } from '@h-ai/crypto'

export async function loadEncryptedPolicy(baseUrl: string) {
  // 由当前进程为示例启动 Crypto。
  const cryptoReady = await crypto.init()
  if (!cryptoReady.success)
    return cryptoReady

  const encryptedClient = apiClient.create({ iam: apiContract.iam })
  try {
    // 用默认握手子路径初始化。无效配置通过 ready.error 返回。
    const ready = await encryptedClient.init({ baseUrl, transport: { crypto } })
    if (!ready.success)
      return ready
    // 首次请求建立加密会话。成功时数据仍是 IAM 公开策略或 null。
    const policy = await encryptedClient.iam.auth.publicConfig()
    if (!policy.success)
      return policy
    return policy
  }
  finally {
    try {
      await encryptedClient.close()
    }
    finally {
      await crypto.close()
    }
  }
}
```

<a id="plain-https-requests"></a>

#### 场景：调用服务端允许普通 HTTPS 的路由

给普通业务路由设置 `encryption: 'disabled'`，或将可排除的路由加入服务端 `transport.excludePaths`。示例在 Serv 启用 `/health`，并允许以普通 HTTPS 访问。向函数传入服务的 Origin，例如 `https://api.example.com`，不包含 API 挂载前缀。成功时收到 `{ status: 'ok' }`。

```ts
export async function checkHealth(origin: string) {
  // 读取明确允许普通 HTTPS 的健康检查路径。
  const response = await fetch(new URL('/health', origin))
  if (!response.ok)
    throw new Error(`Health check failed (${response.status})`)
  return response.json()
}
```

如果应用契约已经包含这些路由，也可用独立客户端调用，并在初始化时省略 `transport`。启用传输加密的客户端遇到握手错误时返回失败，由调用方处理。SvelteKit 浏览器工具的路径例外见 [Kit](kit.md#browser-client)。

<a id="transport-observation"></a>

### 观察逻辑请求 `apiClient.observeRequests(observer)`

观察器每次逻辑调用收到一条摘要。刷新后重试依然属于原调用，`attempts` 统计实际发出的业务请求。对于 SSE，摘要描述流是否成功建立。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiClient.observeRequests(observer)` | 订阅请求摘要 | 必填同步回调，接收一个 `ApiRequestRecord`。字段和单位见[数据结构](../data/api-client.md)。 | 取消订阅函数，关闭实例也会清理订阅。 | `apiClient.observeRequests(record => report(record.duration))` |

#### 场景：汇总认证页面的请求失败数

[账号页示例](#quick-start)完成启动后，打开登录页时调用 `measurePolicyRequest()`，测量读取公开策略这一步。观察回调只更新内存计数；`finally` 清理订阅。需要关联服务端日志时取 `requestId`，业务路径可能包含对象 ID，应先按应用的日志要求处理再输出。

```ts
import { apiClient } from '@h-ai/api-client'

export async function measurePolicyRequest() {
  let failures = 0
  const unsubscribe = apiClient.observeRequests((record) => {
    if (record.procedure === 'iam.auth.publicConfig' && !record.success)
      failures += 1
  })
  try {
    // HTTP 200 的业务失败也会进入回调的失败分支。
    const policy = await apiClient.iam.auth.publicConfig()
    if (!policy.success)
      return { failures, error: policy.error }
    return { failures, settings: policy.data }
  }
  finally {
    unsubscribe()
  }
}
```

<a id="custom-response-results"></a>

### 订阅报表导出任务的进度事件

[提交报表导出](#custom-business-client)成功时返回 `exportId`，表示任务已受理。页面拿到这个 ID 后，可再请求一次 `GET /reports/exports/{exportId}/progress`。SSE（Server-Sent Events）让服务端通过同一个 HTTP 响应连续发送进度。页面按事件更新「已完成／总数」，收到 `ready` 时结束读取并开放下载入口。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `eventIterator(schema)` | 声明接口返回事件流 | 从 `@orpc/contract` 导入，传每条事件的 Schema。 | 客户端成功时取得异步迭代器。 | `.output(eventIterator(ExportProgressSchema))` |
| `progressClient.reports.exports.watchProgress(input, options?)` | 订阅指定报表导出任务 | 传导出接口返回的 `{ exportId }`。通过 `options.signal` 取消等待或读取。下例由应用契约生成此方法。 | 建立失败返回 `HaiResult` 的失败分支。建立成功后可逐条读取事件，流中途失败或取消通过迭代器抛出。 | `await progressClient.reports.exports.watchProgress({ exportId }, { signal })` |

如果另一个自定义路由声明返回裸数字等 JSON 值，成功时客户端直接得到该值，失败时仍返回失败分支。可转换为 JSON Schema 的 Zod 输出按线上 JSON 校验，并保留原有表示，例如 ISO 日期字符串。

#### 场景：验证导出页从开始生成到可以下载

以下 TypeScript 示例用 `fetch` 替身模拟已受理的导出任务 `exp-42`，服务端按次序发送 `0/3`、`2/3`、`3/3`。执行 `runReportProgressDemo()` 即可看到页面应如何更新，无需部署服务或生成文件。应用需直接安装 `@h-ai/api-client`、`@h-ai/api-contract`、`@orpc/contract` 和 `zod`。

```ts
import { apiClient, type ApiClientConfig } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { eventIterator } from '@orpc/contract'
import { z } from 'zod'

const ExportProgressSchema = z.object({
  completed: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  state: z.enum(['running', 'ready']),
})
type ExportProgress = z.infer<typeof ExportProgressSchema>

const progressContract = {
  reports: {
    exports: {
      watchProgress: apiContract.route({
        method: 'GET',
        path: '/reports/exports/{exportId}/progress',
      })
        .input(z.object({ exportId: z.string().min(1) }))
        .output(eventIterator(ExportProgressSchema)),
    },
  },
}

function demoEndpoint(request: Request): Response {
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.pathname !== '/api/v1/reports/exports/exp-42/progress')
    return new Response(null, { status: 404 })

  const events: ExportProgress[] = [
    { completed: 0, total: 3, state: 'running' },
    { completed: 2, total: 3, state: 'running' },
    { completed: 3, total: 3, state: 'ready' },
  ]
  const encoder = new TextEncoder()
  let canceled = false
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      await new Promise(resolve => setTimeout(resolve, 100))
      if (canceled)
        return
      const progress = events.shift()
      if (!progress) {
        controller.close()
        return
      }

      // 发送 oRPC 客户端读取的 SSE message 帧，生成完成后结束响应。
      controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(progress)}\n\n`))
      if (progress.state === 'ready')
        controller.close()
    },
    cancel() {
      canceled = true
    },
  })
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}

export async function watchReportExport(
  config: ApiClientConfig,
  exportId: string,
  signal: AbortSignal,
  render: (progress: ExportProgress) => void,
) {
  const progressClient = apiClient.create(progressContract)
  const ready = await progressClient.init(config)
  if (!ready.success)
    return ready

  try {
    const events = await progressClient.reports.exports.watchProgress({ exportId }, { signal })
    if (!(Symbol.asyncIterator in events))
      return events
    for await (const progress of events) {
      render(progress)
      if (progress.state === 'ready')
        return { success: true as const, data: progress }
    }
    throw new Error('The connection closed before the export was ready')
  }
  finally {
    await progressClient.close()
  }
}

export async function runReportProgressDemo() {
  const controller = new AbortController()
  const config: ApiClientConfig = {
    baseUrl: 'https://reports.example.test/api/v1',
    fetch: async (input, init) => demoEndpoint(new Request(input, init)),
  }
  const snapshots: string[] = []
  const result = await watchReportExport(config, 'exp-42', controller.signal, ({ completed, total }) => {
    snapshots.push(`${completed}/${total}`)
  })
  if (!result.success)
    return result
  return { success: true as const, data: { snapshots, downloadEnabled: result.data.state === 'ready' } }
}
```

成功时 `data.snapshots` 为 `['0/3', '2/3', '3/3']`，`downloadEnabled` 为 `true`。把演示中的 `exp-42` 改为 `exp-99` 可验证建立连接时的 404。接入实际页面时，服务端的 GET 路由先验证登录会话和任务归属，再把实际进度按相同帧格式写入响应。客户端使用真实 API 地址及认证配置，应用可将此进度操作加到原报表契约以复用已登录的报表客户端。页面卸载时让该次订阅的 `AbortController` 执行 `abort()`。此操作关闭进度订阅，后台导出任务由服务端继续管理。

<a id="error-handling"></a>
<a id="errors"></a>

### 处理调用失败 `HaiApiClientError`

标准业务调用通过 `success` 返回失败。若非 2xx 响应中包含有效的失败 `HaiResult`，保留该响应的错误码、公开消息和可用的追踪编号，并根据实际 HTTP 状态执行公开化处理。安装代理或网关时，未包含框架错误结构的失败响应由客户端分类。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `HaiApiClientError.<NAME>` | 识别客户端提供的错误 | 公开错误定义，按场景选用下表中的名称。 | 包含 `code`、`httpStatus` 和构造错误的方法。 | `error.code === HaiApiClientError.TIMEOUT.code` |

| 名称 | 编号后缀 | HTTP 状态 | 含义 |
| --- | --- | --- | --- |
| `NETWORK_ERROR` | `001` | 502 | 网络失败。 |
| `TIMEOUT` | `002` | 504 | 请求超时。 |
| `SERVER_ERROR` | `003` | 502 | 响应为通用服务端错误。 |
| `UNAUTHORIZED` | `004` | 401 | 请求缺少有效身份或认证操作所属的会话已经变更。 |
| `FORBIDDEN` | `005` | 403 | 服务端拒绝访问。 |
| `NOT_FOUND` | `006` | 404 | 服务端未找到匹配资源或路由。 |
| `VALIDATION_FAILED` | `007` | 400 | 参数或可校验的响应与契约不符，也用于加密请求时钟校验失败。 |
| `TOKEN_REFRESH_FAILED` | `008` | 401 | 公开的刷新错误定义。处理最终结果时也要考虑服务端自己的认证错误码。 |
| `NOT_INITIALIZED` | `010` | 500 | 调用时客户端还未就绪。 |
| `CONFIG_ERROR` | `011` | 500 | 配置非法，或当前运行期拒绝重新初始化。 |
| `PAYLOAD_TOO_LARGE` | `020` | 413 | 超出加密传输限制。 |
| `UNKNOWN` | `099` | 500 | 其余无法分类的客户端错误。 |

这些错误码使用 `hai:api-client:` 前缀。加密时钟错误的 `cause.transportCode` 和 `cause.serverTime` 分别记录底层错误编号和服务端 Unix 毫秒。容量错误可在 `cause` 中带有 `direction`、`stage`、`limitBytes` 和 `actualBytes`。

#### 场景：在资料页区分超时和服务端拒绝

用户已登录。适配器向页面提供超时标记、公开消息和可能存在的 `traceId`。对排查请求使用编号；若超时发生在写入操作，先按业务记录检查服务端结果再决定是否重试。

```ts
import { apiClient, HaiApiClientError } from '@h-ai/api-client'

export async function loadProfileForDisplay() {
  const result = await apiClient.iam.auth.currentUser()
  if (!result.success) {
    const { code, message, traceId } = result.error
    return { failed: true, timedOut: code === HaiApiClientError.TIMEOUT.code, message, traceId }
  }
  return { failed: false, user: result.data }
}
```

客户端对可关联服务端的结构化错误和 4xx 使用 `debug`，对网络、协议和未关联的 5xx 故障使用 `error`。记录诊断时保留追踪编号，应用界面显示当前语言的公开消息。更多见 [Core 错误](core.md)。
