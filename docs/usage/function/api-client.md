# @h-ai/api-client 功能说明

[English](api-client.en.md) · [日本語](api-client.ja.md)

在浏览器、原生应用或 Node.js 中，从共享 HTTP 契约取得带类型的调用方法。默认客户端提供 IAM、Storage 和 AI。调用应用自定义端点时，使用与服务端共享的契约创建独立实例。

[模块 README](../../../packages/api-client/README.md) · [配置](../configuration/api-client.md) · [数据结构](../data/api-client.md) · [前后端接入](../development/frontend-backend.md)

<a id="quick-start"></a>

## 最小接入示例

<a id="module-dependencies"></a>

### 依赖

| 依赖 | 用途 | 何时需要 | 接入顺序 |
| --- | --- | --- | --- |
| Fetch 运行环境 | 发出 HTTP 请求和读取结果。 | 所有调用。可通过 `config.fetch` 提供兼容实现。 | 初始化客户端之前准备。 |
| API 服务 | 接收契约定义的 HTTP 请求。 | 所有调用。 | 先用 [Serv](api-contract.md#use-with-serv) 或 [Kit](api-contract.md#use-with-kit) 挂载路由，再使用含 API 前缀的服务地址。 |
| `@h-ai/api-contract` | 提供默认契约和应用契约的组合入口。 | 随 API Client 安装。应用直接导入时也声明为直接依赖。 | 定义并共享应用契约之后创建客户端。 |
| `@h-ai/core` | 提供 `HaiResult` 和诊断能力。 | 随 API Client 安装。 | 应用有日志或语言设置时先配置 Core。 |
| `@h-ai/crypto` | 建立请求的应用层加密会话。 | 随 API Client 安装。应用启用传输加密并导入 Crypto 时也声明为直接依赖。 | 先配置服务端和初始化 Crypto，再创建加密客户端。 |

### 安装

```bash
pnpm add @h-ai/api-client @h-ai/api-contract
```

<a id="接入示例"></a>
### 读取已部署服务的认证策略

将函数放到 Web 应用或 Node.js 脚本。传入提供 IAM 公开配置路由的服务地址，例如同源浏览器中的 `/api/v1`，或 Node.js 中可访问的完整 HTTPS 地址。公开接口可在登录前调用。独立实例只在此次读取期间存活。

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function loadAuthPolicy(baseUrl: string) {
  // 复用默认 IAM 契约，取得仅由这次调用持有的实例。
  const contract = apiContract.create({ iam: apiContract.iam })
  const client = apiClient.create(contract)
  const initialized = await client.init({ baseUrl })
  if (!initialized.success)
    return initialized

  try {
    // 无输入，成功时 data 是服务端公开的认证策略，也可为 null。
    const policy = await client.iam.auth.publicConfig()
    if (!policy.success)
      return policy
    return policy
  }
  finally {
    // 释放这次创建的客户端。
    await client.close()
  }
}
```

调用方检查 `success` 后，用非空 `data` 中的登录方式渲染认证入口。成功但 `data` 为 `null` 表示没有公开策略，失败时读取 `error`。前端离线、服务前缀错误和服务端拒绝均可通过失败结果处理。字段见 [IAM 公开认证策略](../data/api-contract.md#public-settings)。

<a id="api-reference"></a>

## 功能说明

下文的 `client` 表示已初始化的默认或独立客户端。业务方法来自它持有的契约。需要访问受保护路由时，先配置认证并通过 [认证动作](#auth-actions) 登录，或用 [凭据接口](#credentials) 写入已有的合法令牌。标准请求先判断 `success` 再读取 `data`。

<a id="准备与隔离客户端apiclient"></a>
<a id="调用入口"></a>
<a id="client-lifecycle"></a>

### 创建独立客户端 `apiClient.create(contract)`

把应用和服务端共享的契约传给工厂。工厂返回一个新的实例，每个实例各自进行初始化、认证、关闭。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiClient.create(contract)` | 创建实例 | 必填契约对象。可传入 `apiContract.create(options)` 的结果，或由 oRPC procedure 组成的应用契约树。 | `ApiClient<TContract>` | `apiClient.create(contract)` |

`contract` 是应用源码中导出的路由定义。例如 `apiContract.iam` 是整个 IAM 领域，`apiContract.iam.auth.publicConfig` 是其中一条 procedure。客户端树的键决定调用名称，procedure 声明 HTTP 方法、路径和输入输出。共享契约的声明、组合和接入见 [API Contract 功能说明](api-contract.md#use-with-client)。

<a id="场景准备与隔离客户端"></a>
#### 场景：为一次 SSR 请求创建独立实例

[最小接入示例](#quick-start) 中的 `loadAuthPolicy(baseUrl)` 从 IAM 契约取得一个独立实例。SSR 可按相同方式为每个入站请求创建实例。若调用受保护端点，在创建当前实例时接入该次请求的身份或平台网络适配器。关闭本次实例前完成相关请求。条件领域开启后才有对应方法，TypeScript 调用方可用如 `client.payment?.orders` 的可选链检查。客户端和领域分组可作为普通值传给 `Promise.resolve`，契约键 `then` 留给框架。

<a id="api客户端地址期限和恢复"></a>
<a id="使用与核对"></a>
<a id="调用示例"></a>
<a id="client-integration"></a>

### 初始化、检查和关闭 `client.init(config)`

浏览器应用可在启动时初始化一次 `apiClient`，供同一用户的页面复用。SSR 或同时面向多个服务时使用独立实例。每次初始化并提交配置成功之后，才可发出业务请求。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `client.init(config)` | 初始化客户端 | 必填初始化对象，至少提供 `baseUrl`。其余字段见下表。 | `Promise<HaiResult<void>>`。重复初始化已就绪实例、关闭期间初始化或地址非法时返回失败。 | `await client.init({ baseUrl: '/api/v1' })` |
| `client.isInitialized` | 检查客户端是否就绪 | 只读属性 | `boolean` | `client.isInitialized` |
| `client.config` | 检查实际应用的配置 | 只读属性 | 脱敏的配置快照，未就绪时为 `null`。 | `client.config?.baseUrl` |
| `client.close()` | 结束当前客户端运行期 | 无参数 | `Promise<void>`。清理观察器和页面监听，等待已经开始的凭据操作。 | `await client.close()` |

<a id="参数清单"></a>
<a id="call-options"></a>

##### 初始化参数

| 字段 | 类型、默认值与生效条件 |
| --- | --- |
| `baseUrl` | 必填字符串。用含 API 前缀的 HTTP(S) 绝对地址。浏览器也可用同源根路径，如 `/api/v1`。地址须省略用户信息、查询和片段，协议相对地址无效。 |
| `timeout` | 请求期限，单位毫秒，默认 `30000`。覆盖响应头、完整 JSON 响应体和失败响应体。读取已建立的流时使用调用方的 `signal`。 |
| `clientName` | 请求来源标识字符串，默认 `hai-api-client`，通过 `x-request-client` 发送。 |
| `headers` | 可选的字符串键值对象，或返回该对象的同步或异步函数。由应用补充业务请求头，例如语言；默认语言来自 Core。 |
| `fetch` | 可选的 `typeof fetch`，默认使用全局 `fetch`。替换时实现请求体、取消和 Cookie 等所需的运行环境行为。 |
| `auth` | 可选对象。传入 `{}` 启用默认 Cookie 认证。字段见[凭据与刷新](#credentials)。 |
| `transport` | 可选对象。传入时启用应用层加密传输。字段见[加密请求](#encrypted-requests)。 |

业务请求、刷新和加密握手的地址以同一个生效的 `baseUrl` 为前缀。例如业务路径 `/auth/config` 和基址 `/api/v1` 组成 `/api/v1/auth/config`。配置由应用传入，来源和部署位置见 [配置](../configuration/api-client.md)。并发初始化同一个未就绪实例时共享先开始的初始化流程。快照用于排查生效地址等设置，保存应用自己的初始化选项供重新启动。

#### 场景：启动并释放浏览器客户端

在 Web 应用启动代码中调用 `startBrowserApi()`。同源部署已把 API 挂在 `/api/v1`，应用卸载时释放资源。用户主动退出登录时走 [退出流程](#logout)。

```ts
import { apiClient } from '@h-ai/api-client'

export async function startBrowserApi() {
  // 用默认 Cookie 模式启动；启动失败由应用入口显示或记录。
  const initialized = await apiClient.init({ baseUrl: '/api/v1', auth: {} })
  if (!initialized.success)
    return initialized

  return {
    // 这两项供启动页核对客户端状态和实际地址。
    ready: apiClient.isInitialized,
    endpoint: apiClient.config?.baseUrl,
    // 交给应用的卸载钩子。关闭后如需再次调用，重新初始化。
    dispose: () => apiClient.close(),
  }
}
```

<a id="保存与更新凭据apiclientauthtokenstorage"></a>
<a id="credentials"></a>

### 保存凭据和刷新会话 `client.auth` 与 `apiClient.tokenStorage`

带认证的客户端在业务请求中附加访问令牌。满足刷新条件时，同一实例协调并行请求的刷新，成功提交的新凭据可供后续请求使用。使用存储适配器前，在初始化时通过 `auth.storage` 选择它。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiClient.tokenStorage.httpOnlyCookie()` | 创建浏览器 Cookie 模式适配器 | 无参数。启用 `auth` 但省略 `storage` 时使用。 | `TokenStorage`，浏览器保存刷新 Cookie，实例内存保存访问令牌。 | `apiClient.tokenStorage.httpOnlyCookie()` |
| `apiClient.tokenStorage.memory()` | 创建独立的内存适配器 | 无参数。每次创建持有新的空存储。 | `TokenStorage`，暂存访问和刷新令牌。 | `apiClient.tokenStorage.memory()` |
| `client.auth.setTokens(tokens)` | 用本次登录或恢复得到的凭据更新当前实例 | `tokens` 为服务端实际颁发的 `TokenPair`，结构见[数据结构](../data/api-client.md)。 | `Promise<void>`，适配器写入失败时拒绝。 | `await client.auth.setTokens(tokens)` |
| `client.auth.onTokenRefreshed(callback)` | 订阅刷新成功事件 | 必填接收 `TokenPair` 的同步回调，在新凭据写入后执行。 | 取消订阅函数，未启用认证时为空操作。 | `client.auth.onTokenRefreshed(updateExpiry)` |
| `client.auth.clear()` | 清除当前实例的本地认证状态 | 无参数 | `Promise<void>`，适配器清除失败时拒绝。 | `await client.auth.clear()` |

##### 认证参数

| 字段 | 类型、默认值与生效条件 |
| --- | --- |
| `auth.storage` | `TokenStorage`，默认内置 Cookie 适配器。Node.js 的短生命周期任务可为每个实例创建内存适配器；原生应用可注入 `capacitor.createTokenStorage()`。 |
| `auth.refreshPath` | 默认 `/auth/refresh`，相对于 `baseUrl` 的刷新路径。设为服务端实际启用的路径。 |
| `auth.refreshTimeoutMs` | 单次刷新等待时间，单位毫秒，默认 `10000`。 |
| `auth.terminalType` | `web`（默认）、`app`、`desktop` 或 `api`。值需匹配服务端对该终端类别的会话设置。 |
| `auth.recoverSession` | 可选 `() => Promise<boolean>`。明确无法刷新现有会话时可尝试恢复同一用户；写入新凭据后返回 `true`，否则返回 `false`。 |
| `auth.onTokenRefreshed` | 可选 `(tokens: TokenPair) => void`。刷新并提交凭据成功时通知应用。 |
| `auth.onRefreshFailed` | 可选 `() => void`。未设置 `recoverSession` 时，用来处理明确失效或缺少可刷新凭据的情况。 |

启用内置 Cookie 模式时客户端使用 `credentials: 'include'`，刷新 Cookie 由服务端设置和清理。跨域部署须由服务端允许页面具体 Origin 和带凭据请求。内存和原生自定义适配器沿用原请求的 Cookie 设置。服务端渲染时传入由当前入站请求授权的凭据，或由应用配置请求级网络适配器。

##### 令牌字段

调用 `client.auth.setTokens(tokens)` 时，将登录或恢复响应的 `data.tokens` 整体传入。已绑定客户端的凭据更新和清理交给 `client.auth`，它会让旧刷新失效并按顺序写入。存储异常会拒绝 Promise，失败后可调用 `client.auth.clear()` 清理可能已部分写入的凭据。当前认证响应无法写入时，应用应保留写入与清理两步的故障信息。

| `TokenPair` 字段 | 怎么用 |
| --- | --- |
| `accessToken: string` | 服务端签发的短期访问令牌。传给 `setTokens` 后，客户端为请求组装 `Authorization: Bearer …`。 |
| `refreshToken?: string` | 内存或原生模式使用的刷新令牌。`setTokens` 收到省略此字段的令牌组时清除原有存储中的刷新值。浏览器 Cookie 模式由服务端通过 `Set-Cookie` 轮换刷新凭据。 |
| `expiresIn: number` | 访问令牌的有效秒数。例如 `3600` 可显示为 60 分钟；自动刷新由本次请求收到的认证失败触发。 |
| `tokenType: 'Bearer'` | 服务端签发的固定类型。将令牌组原样传给 `setTokens` 即可使用。 |

<a id="token-storage-methods"></a>

##### 自定义存储适配器的方法

| 方法 | 读写契约 | 调用示例 |
| --- | --- | --- |
| `storage.getAccessToken()` | 返回已有的访问令牌，空存储返回 `null`。 | `const access = await storage.getAccessToken()` |
| `storage.setAccessToken(token)` | 保存本次签发的访问令牌字符串，写入成功后完成。 | `await storage.setAccessToken(tokens.accessToken)` |
| `storage.getRefreshToken()` | 内存和原生适配器返回刷新令牌或 `null`。内置 Cookie 适配器返回框架内部的模式标记。 | `const refresh = await storage.getRefreshToken()` |
| `storage.setRefreshToken(token)` | 保存本次签发的刷新令牌。管理器传入空字符串时使原有刷新值失效。内存适配器用空字符串覆盖，调用 clear() 后恢复为 null。Cookie 模式的实际 Cookie 由服务端管理。 | `await storage.setRefreshToken(tokens.refreshToken ?? '')` |
| `storage.clear()` | 清空适配器能管理的字段。Cookie 模式释放内存中的访问令牌。 | `await storage.clear()` |

适配器应将底层读写失败作为 Promise 拒绝。以 `null` 表示真正的缺失。以下函数适用于适配器自身的单元测试，使用独立内存、测试签发结果和只含布尔值的断言。应用用适配器接入客户端后，通过 `client.auth` 更新登录身份。

```ts
import { apiClient, type TokenPair } from '@h-ai/api-client'

export async function checkMemoryStorage(tokens: TokenPair) {
  const storage = apiClient.tokenStorage.memory()
  const startedEmpty = await storage.getAccessToken() === null && await storage.getRefreshToken() === null
  try {
    await storage.setAccessToken(tokens.accessToken)
    if (tokens.refreshToken)
      await storage.setRefreshToken(tokens.refreshToken)
    const accessSaved = await storage.getAccessToken() === tokens.accessToken
    const refreshSaved = await storage.getRefreshToken() === (tokens.refreshToken ?? null)
    return { startedEmpty, accessSaved, refreshSaved }
  }
  finally {
    await storage.clear()
  }
}
```

<a id="凭据更新与关闭"></a>
<a id="原地恢复过期会话"></a>
<a id="场景保存与更新凭据"></a>
<a id="detailed-workflow"></a>

#### 场景：用已颁发的凭据查询当前用户

原生应用或 SSR 入口已经从自身认证流程取得当前用户的 `tokens`。把它与服务地址传给以下函数，随后按 `success` 处理结果。凭据读写错误交由外层生命周期处理；成功查询之后由 `finally` 清理临时内存凭据及实例。

```ts
import type { TokenPair } from '@h-ai/api-client'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function loadProfile(baseUrl: string, tokens: TokenPair) {
  const client = apiClient.create({ iam: apiContract.iam })
  const initialized = await client.init({
    baseUrl,
    auth: { storage: apiClient.tokenStorage.memory(), terminalType: 'api' },
  })
  if (!initialized.success)
    return initialized

  try {
    // 保存当前调用已获授权的凭据，再读取用户及权限。
    await client.auth.setTokens(tokens)
    const profile = await client.iam.auth.currentUser()
    if (!profile.success)
      return profile
    return profile
  }
  finally {
    try {
      await client.auth.clear()
    }
    finally {
      await client.close()
    }
  }
}
```

<a id="browser-refresh"></a>

#### 场景：浏览器登录并更新会话剩余时间

服务端已挂载标准 IAM 路由并启用 HttpOnly 刷新 Cookie。将登录表单经过校验的 `input`、含 API 前缀的 `baseUrl` 和页面回调传给下面的函数。采用默认路径时显式写出的 `refreshPath: '/auth/refresh'` 与 `baseUrl: '/api/v1'` 组成 `/api/v1/auth/refresh`。示例把一次刷新等待时间设为 8 秒，省略它会使用默认的 10 秒。

```ts
import { apiClient, type IamAuthLoginInput } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function openBrowserSession(
  baseUrl: string,
  input: IamAuthLoginInput,
  updateExpiry: (seconds: number) => void,
  showSessionExpired: () => void,
) {
  const client = apiClient.create({ iam: apiContract.iam })
  const initialized = await client.init({
    baseUrl,
    auth: {
      storage: apiClient.tokenStorage.httpOnlyCookie(),
      terminalType: 'web',
      refreshPath: '/auth/refresh',
      refreshTimeoutMs: 8_000,
      onRefreshFailed: showSessionExpired,
    },
  })
  if (!initialized.success)
    return initialized

  // 启用认证后注册刷新监听，刷新写入成功时只向 UI 传剩余秒数。
  const unsubscribe = client.auth.onTokenRefreshed(tokens => updateExpiry(tokens.expiresIn))
  const dispose = async () => {
    unsubscribe()
    await client.close()
  }
  try {
    const actions = apiClient.createAuthActions(client)
    // 成功后动作已写入客户端凭据。首次登录单独更新 UI。
    const login = await actions.login(input)
    if (!login.success) {
      await dispose()
      return login
    }
    updateExpiry(login.data.tokens.expiresIn)
    return { success: true as const, data: { client, dispose } }
  }
  catch (error) {
    // 安全存储等异常由调用方处理；关闭本次初始化的实例。
    try {
      await client.auth.clear()
    }
    finally {
      await dispose()
    }
    throw error
  }
}
```

页面使用返回的 `client` 调用受保护接口。会话明确失效且刷新 Cookie 仍有效时，多个调用共享一次刷新，刷新写入后更新剩余时间，满足重试条件的原请求只重试一次。布局销毁时调用 `dispose()`，用户主动离开账号时先走[退出](#logout)。如果状态回调在应用启动时就已确定，也可用 `auth.onTokenRefreshed: ({ expiresIn }) => updateExpiry(expiresIn)` 配在 `init`，生命周期内有效。只需要一次通知时选择其中一个入口。

`onRefreshFailed` 适合让用户回到登录页。刷新端点明确返回 401、解出的刷新结果不含可用凭据，或存储中没有刷新凭据时，客户端判定当前会话无法刷新。网络错误、超时和限流保留已有凭据，让之后的业务请求再决定是否触发刷新。业务端点返回 403 时由页面提示没有操作权限。

<a id="recover-session"></a>

#### 场景：会话失效后在原页面恢复同一用户

适用于需要保留未提交页面输入的应用。单次页面任务接收之前已验证的用户 ID `expectedUserId` 和布局的取消信号。退出、换账号或卸载时，让布局用同一个 `AbortController` 取消等待并关闭交互。将本例的 `recoverSession` 配在客户端初始化里，由它接手明确失效后的交互。需要验证码时，由 `promptLogin` 按公开策略取得表单及证明。

![访问令牌被拒绝后的刷新、同一用户恢复和请求重试流程](../images/function-api-client-recovery.svg)

```ts
import { apiClient, type IamAuthLoginInput } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

export async function loadProfileWithRecovery(
  baseUrl: string,
  expectedUserId: string,
  signal: AbortSignal,
  promptLogin: (userId: string, signal: AbortSignal) => Promise<IamAuthLoginInput | null>,
) {
  const client = apiClient.create({ iam: apiContract.iam })
  const actions = apiClient.createAuthActions(client)
  const ready = await client.init({
    baseUrl,
    auth: {
      async recoverSession() {
        const input = await promptLogin(expectedUserId, signal)
        if (!input || signal.aborted)
          return false

        // 把原会话的用户 ID 交给服务端验证。登录动作确认凭据已写入后才返回成功。
        const recovered = await actions.login({ ...input, expectedUserId })
        return recovered.success
      },
    },
  })
  if (!ready.success)
    return ready

  try {
    // 现有刷新 Cookie 有效时走自动刷新；明确失效时由 recoverSession 接手。
    const profile = await client.iam.auth.currentUser(undefined, { signal })
    if (!profile.success)
      return profile
    return profile
  }
  finally {
    await client.close()
  }
}
```

恢复成功后，客户端检查凭据代际、当前实例和取消状态，再决定是否重试原请求。取消交互或登录失败时返回 `false`。同一页面可能有多个请求同时需要恢复，应用应让它们共享一次交互和登录提交，例如通过 [UI 会话恢复助手](ui.md) 管理当前布局的表单。

<a id="驱动认证表单apiclientcreateauthactions"></a>
<a id="配置驱动认证页面"></a>
<a id="auth-actions"></a>

### 接入认证表单 `apiClient.createAuthActions(client)`

将服务端公开策略和 IAM 调用封装成表单动作。把动作传给 `AuthPanel`，或由应用自己的表单调用。先在客户端初始化中提供 `auth`，以便登录或注册成功后保存凭据。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiClient.createAuthActions(client)` | 绑定表单动作 | 必填已初始化且含标准 IAM 认证路由和 `auth.setTokens` 的客户端。 | 绑定到指定客户端的动作对象。 | `apiClient.createAuthActions(apiClient)` |
| `actions.publicConfig()` | 读取认证策略 | 无参数 | `HaiResult`，成功数据为公开策略或 `null`。 | `await actions.publicConfig()` |
| `actions.createCaptcha(input)` | 为指定用途请求交互挑战 | `input.operation` 必填。见下表。 | 挑战数据或失败结果。 | `await actions.createCaptcha({ operation: 'login' })` |
| `actions.login(input)` | 提交密码、LDAP 或验证码登录 | `input` 是表单整理后的 `IamAuthLoginInput`，见下表。 | 成功时返回用户和凭据，并已完成本地写入。 | `await actions.login({ identifier, password })` |
| `actions.register(input)` | 注册并接入本地凭据 | 必填注册用户名 `username` 和密码 `password`；可选 `email`、`phone`、`displayName`、`metadata` 和挑战证明 `captcha`。 | 新用户和凭据，成功时已完成本地写入。 | `await actions.register({ username, password })` |
| `actions.sendOtp(identifier, options?)` | 请求验证码 | `identifier` 是用户填入的邮箱或手机；如启用挑战，传 `options.captcha`。 | 验证码有效期 `expiresAt` 或失败结果。 | `await actions.sendOtp(identifier, { captcha })` |
| `actions.requestPasswordReset(identifier, options?)` | 请求密码重置通知 | `identifier` 是待重置账号的标识；如启用挑战，传 `options.captcha`。 | 成功时无业务数据。 | `await actions.requestPasswordReset(identifier)` |
| `actions.confirmPasswordReset(token, newPassword)` | 使用重置链接修改密码 | `token` 为服务端发送的一次性重置凭据，`newPassword` 为用户填写的新密码。均为必填字符串。 | 成功时无业务数据。 | `await actions.confirmPasswordReset(resetToken, newPassword)` |
| `actions.renewPassword(input)` | 续期已到期密码或替换初始密码 | 必填账号 `identifier`、原密码 `password` 和 `newPassword`；按策略传 `captcha`。 | 成功时无业务数据。 | `await actions.renewPassword({ identifier, password, newPassword })` |
| `actions.reauthenticate(password, operation)` | 取得单次敏感操作票据 | 必填当前密码与服务端登记的敏感操作标识，长度 1–128。 | 票据 `ticket` 和到期时间 `expiresAt`。 | `await actions.reauthenticate(password, operation)` |
| `actions.bindPageExit(options?)` | 在浏览器离开文档时尝试结束会话 | `options.enabled` 默认 `false`。设为 `true` 才监听 `pagehide`。 | 取消绑定函数。 | `actions.bindPageExit({ enabled: true })` |

<a id="可选交互挑战"></a>
##### 登录和交互挑战的输入

| 字段 | 来源与要求 |
| --- | --- |
| `identifier` | 用户输入的账号字符串，必填。LDAP 时成为 `username`；验证码登录时填申请验证码的邮箱或手机号。 |
| `method`、`password`、`code` | `method` 默认为 `password`，也可用 `ldap`、`email` 或 `sms`。密码和 LDAP 使用 `password`；验证码使用 `code`，类型要求仍传 `password: ''`。 |
| `expectedUserId` | 恢复同一个会话时传当前会话的用户 ID，普通登录省略。 |
| `operation`、`captcha` | 公开策略要求验证时，按用途 `login`、`register`、`sendOtp`、`passwordReset` 或 `renewPassword` 请求挑战。由 `AuthPanel` 或自定义表单求解，并把一次性证明传给对应动作。 |

认证策略来自 [IAM 公开配置](../data/api-contract.md#public-settings)。认证结果失败时不写入凭据。存储写入本身失败会拒绝 Promise，交给应用清理并报告本地存储错误。服务端控制会话期限和可用登录方式。

<a id="场景驱动认证表单"></a>
#### 场景：登录成功后读取个人资料

浏览器已按 [Cookie 配置](../configuration/api-client.md) 启动并完成上述表单校验。把用户提交的数据传给下面函数。应用只在成功时刷新页面的用户状态。

```ts
import { apiClient, type IamAuthLoginInput } from '@h-ai/api-client'

export async function signInAndReadProfile(input: IamAuthLoginInput) {
  const actions = apiClient.createAuthActions(apiClient)
  // 认证完成且凭据保存之后再读取资料。业务失败沿用服务端的公开错误。
  const signedIn = await actions.login(input)
  if (!signedIn.success)
    return signedIn
  const profile = await apiClient.iam.auth.currentUser()
  if (!profile.success)
    return profile
  return profile
}
```

<a id="页面离开会话策略"></a>
主动退出走下面的 [退出流程](#logout)。按标签页限制会话的应用可将 `actions.bindPageExit({ enabled: true })` 的返回函数保存到布局销毁钩子。进入浏览器往返缓存时跳过关闭；其它离页以 `keepalive` 尝试发送，发送可能因浏览器关闭而未完成。

<a id="标准-http-业务调用"></a>
<a id="request-options"></a>

### 控制单次请求 `client.<domain>.<group>.<operation>(input, options?)`

第一个参数由 operation 的契约决定。无业务输入的 operation 可以直接调用。需要同时传入请求选项时，用 `undefined` 占第一个参数的位置。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `client.<domain>.<group>.<operation>(input, options?)` | 调用一条已挂载的 HTTP 操作 | `input` 是所选操作的业务参数。可选 `options` 只作用于本次调用。 | 按契约返回业务结果，裸值和流见[自定义响应](#custom-response-results)。 | `await client.iam.auth.currentUser(undefined, { signal })` |

##### 单次调用选项

| 字段 | 作用与缺省行为 |
| --- | --- |
| `signal` | 可选 `AbortSignal`。页面卸载时可取消等待和传输。服务端已经处理的写入仍可能完成。 |
| `context.autoRefresh` | 默认允许符合条件的自动刷新。传 `false` 时仅本次请求跳过自动刷新，仍发送当前访问令牌。 |
| `context.keepalive` | 可选布尔值。传 `true` 时将请求标记为 Fetch `keepalive`；离页请求仍受浏览器大小和发送限制。 |
| `context.reauthentication` | 可选票据字符串。传入从认证动作 `data.ticket` 取得的本次敏感操作票据。 |
| `context.reauthorize` | 可选异步回调。请求收到明确认证拒绝、仍可重试时才调用。返回新票据，返回 `null` 取消重试，返回 `undefined` 允许不带票据重试。 |

#### 场景：页面卸载时取消资料读取

页面创建 `AbortController`，把 `controller.signal` 交给资料读取，并在卸载时调用 `controller.abort()`。资料请求挂起时的取消只影响当前调用。

```ts
import { apiClient } from '@h-ai/api-client'

export async function readProfileForPage(signal: AbortSignal) {
  // 用户已经登录。省略业务输入并传入该页面的取消信号。
  const result = await apiClient.iam.auth.currentUser(undefined, { signal })
  if (!result.success)
    return result
  // 资料包含角色和权限，页面可据此显示当前用户可操作的入口。
  return result
}
```

<a id="调用认证与用户管理-apiapiclientiam"></a>
<a id="iam-认证资料与会话"></a>
<a id="iam-requests"></a>

### 调用账号与会话接口 `client.iam.auth`

直接调用服务端 IAM 认证路由。用于应用需要自行控制原始请求、凭据提交时机或本次请求选项的情况。传输选项共用[单次请求](#request-options)的第二个参数。登录和注册成功后，由调用方提交返回的 `tokens`，或改用 [认证动作](#auth-actions) 完成写入。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `client.iam.auth.publicConfig(input?, options?)` | 读取公开认证配置 | 无业务参数，`input` 可省略。传第二个参数时使用 `undefined` 占位。 | 当前公开策略，或 `null` | `await client.iam.auth.publicConfig()` |
| `client.iam.auth.createCaptcha(input, options?)` | 生成挑战 | `input` 为对象。必填 `operation`，取值为 `login`、`register`、`sendOtp`、`passwordReset`、`renewPassword`。 | 指定用途的挑战 | `await client.iam.auth.createCaptcha({ operation: 'login' })` |
| `client.iam.auth.login(input, options?)` | 密码登录 | `input` 为对象。必填账号 `identifier` 和 `password`。可传用途证明 `captcha` 和用于恢复同一会话的 `expectedUserId`。 | 已认证用户与 Token | `await client.iam.auth.login({ identifier, password })` |
| `client.iam.auth.loginWithLdap(input, options?)` | LDAP 登录 | `input` 为对象。必填 LDAP `username` 和 `password`。可传用途证明 `captcha` 与同一会话恢复的 `expectedUserId`。 | 已认证用户与 Token | `await client.iam.auth.loginWithLdap({ username, password })` |
| `client.iam.auth.sendOtp(input, options?)` | 发送一次性验证码 | `input` 为对象。必填账号 `identifier`，可选本次用途的 `captcha`。 | 验证码失效时间 | `await client.iam.auth.sendOtp({ identifier })` |
| `client.iam.auth.loginWithOtp(input, options?)` | 验证码登录 | `input` 为对象。必填账号 `identifier` 与验证码字符串 `code`。可选用途证明 `captcha` 与会话恢复用户 `expectedUserId`。 | 已认证用户与 Token | `await client.iam.auth.loginWithOtp({ identifier, code })` |
| `client.iam.auth.register(input, options?)` | 注册 | `input` 为对象。必填 `username`、`password`，可选 `email`、`phone`、`displayName`、`metadata` 和 `captcha`。 | 新用户与 Token | `await client.iam.auth.register({ username, password })` |
| `client.iam.auth.currentUser(input?, options?)` | 读取当前账号 | 无业务参数，`input` 可省略。传第二个参数时使用 `undefined` 占位。 | 当前用户以及角色和权限 | `await client.iam.auth.currentUser()` |
| `client.iam.auth.updateCurrentUser(input, options?)` | 更新本人资料 | `input` 为对象。可按需传 `username`、`email`、`displayName`、`avatarUrl`、`phone`、`metadata`。只提交要更新的字段。 | 更新后的用户资料 | `await client.iam.auth.updateCurrentUser({ displayName: 'Mina' })` |
| `client.iam.auth.changePassword(input, options?)` | 已登录用户修改密码 | `input` 为对象。必填当前密码 `oldPassword` 和新密码 `newPassword`。 | 无业务数据 | `await client.iam.auth.changePassword({ oldPassword, newPassword })` |
| `client.iam.auth.renewPassword(input, options?)` | 密码到期后续密 | `input` 为对象。必填账号 `identifier`、原密码 `password` 和 `newPassword`，可选本次 `captcha`。 | 无业务数据 | `await client.iam.auth.renewPassword({ identifier, password, newPassword })` |
| `client.iam.auth.requestPasswordReset(input, options?)` | 申请密码重置 | `input` 为对象。必填账号 `identifier`，可选本次 `captcha`。 | 无业务数据 | `await client.iam.auth.requestPasswordReset({ identifier })` |
| `client.iam.auth.confirmPasswordReset(input, options?)` | 使用重置凭证 | `input` 为对象。必填通知中的一次性 `token` 和 `newPassword`。 | 无业务数据 | `await client.iam.auth.confirmPasswordReset({ token, newPassword })` |
| `client.iam.auth.reauthenticate(input, options?)` | 申请敏感操作票据 | `input` 为对象。必填当前 `password` 和操作标识 `operation`，后者裁剪空白后 1–128 字符。 | 票据和到期时间 | `await client.iam.auth.reauthenticate({ password, operation: 'iam.users.delete' })` |
| `client.iam.auth.refresh(input, options?)` | 刷新凭据 | `input` 为对象。必填 `refreshToken` 字符串。由客户端持有刷新令牌时使用。 | 新 Token；通常由客户端刷新流程调用 | `await client.iam.auth.refresh({ refreshToken })` |
| `client.iam.auth.logout(input, options?)` | 主动退出 | `input` 对象必填。传 `{}` 时使用当前 Bearer 访问令牌，也可传 `{ accessToken }` 指定要撤销的令牌。 | 无业务数据 | `await client.iam.auth.logout({})` |
| `client.iam.auth.closeSession(input, options?)` | 请求结束当前会话 | `input` 对象必填。传 `{}` 时使用当前 Bearer 访问令牌，也可传 `{ accessToken }` 指定要撤销的令牌。 | 无业务数据 | `await client.iam.auth.closeSession({})` |

<a id="logout"></a>

#### 场景：主动退出当前会话

用户点击退出时，先把请求交给 IAM，使服务端撤销当前会话。Cookie 模式由服务端响应清除浏览器刷新 Cookie。示例在收到服务端结果后清理本地凭据。若服务端返回失败，页面仍可结束本地登录状态，并提示服务端会话未确认撤销。适配器抛出本地存储异常时，由应用报告清理失败。

```ts
import { apiClient } from '@h-ai/api-client'

export async function signOut() {
  // {} 使用当前 Bearer 令牌；本次退出跳过自动刷新。
  const result = await apiClient.iam.auth.logout({}, { context: { autoRefresh: false } })
  // 清除本地凭据。存储适配器失败时交给应用的错误处理。
  await apiClient.auth.clear()
  if (!result.success)
    return result
  return result
}
```

<a id="iam-管理字段"></a>
<a id="场景调用认证与用户管理-api"></a>
<a id="iam-admin-inputs"></a>

### 管理用户、角色与权限 `client.iam.users`、`client.iam.roles`、`client.iam.permissions`

管理操作受服务端授权控制。详情、更新与删除的 `id` 是对应列表或创建结果返回的记录 ID。按 IAM 处理函数注册的操作名取得敏感操作票据。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `client.iam.users.list(input, options?)` | 分页查询用户 | `input` 必填，可传 `{}`。分页、排序和过滤见 [IAM 管理字段](#iam-admin-inputs)。 | 用户分页 | `await client.iam.users.list({ page: 1, pageSize: 20 })` |
| `client.iam.users.get(input, options?)` | 读取用户 | `input.id` 必填，为前一步取得的用户编号字符串。 | 用户资料，或 `null` | `await client.iam.users.get({ id: userId })` |
| `client.iam.users.create(input, options?)` | 创建用户 | 必填 `input.username` 和 `input.password`，账号类型、期限及资料见 [IAM 管理字段](#iam-admin-inputs)。 | 新用户资料 | `await client.iam.users.create({ username, password })` |
| `client.iam.users.invite(input, options?)` | 发出邀请 | 必填 `input.username`，按通知渠道提供 `email` 或 `phone`。`accountStatus` 只允许 `active`。其他字段见 [IAM 管理字段](#iam-admin-inputs)。 | 已创建的待激活用户资料 | `await client.iam.users.invite({ username, email })` |
| `client.iam.users.update(input, options?)` | 修改用户 | `input.id` 必填。其他字段按需提交，`accountExpiresAt: null` 清除期限。见 [IAM 管理字段](#iam-admin-inputs)。 | 更新后的用户资料 | `await client.iam.users.update({ id: userId, displayName: 'Mina' })` |
| `client.iam.users.delete(input, options?)` | 删除用户 | `input.id` 必填，为前一步取得的用户编号字符串。 | 无业务数据 | `await client.iam.users.delete({ id: userId })` |
| `client.iam.users.resetPassword(input, options?)` | 管理员重置密码 | 必填 `input.id` 用户编号与 `input.newPassword`，均为非空字符串。 | 无业务数据 | `await client.iam.users.resetPassword({ id: userId, newPassword })` |
| `client.iam.roles.list(input?, options?)` | 查询角色 | 无业务参数，`input` 可省略。传第二个参数时使用 `undefined` 占位。 | 角色分页 | `await client.iam.roles.list()` |
| `client.iam.roles.get(input, options?)` | 读取角色 | `input.id` 必填，为前一步取得的角色编号字符串。 | 角色记录，或 `null` | `await client.iam.roles.get({ id: roleId })` |
| `client.iam.roles.create(input, options?)` | 创建角色 | 必填 `input.code` 角色代码和 `input.name` 显示名。可选 `description` 及 `isSystem`。 | 新角色 | `await client.iam.roles.create({ code: 'reader', name: 'Reader' })` |
| `client.iam.roles.update(input, options?)` | 更新角色 | 必填 `input.id`，可选新的 `name` 和 `description`。 | 更新后的角色 | `await client.iam.roles.update({ id: roleId, name: 'Report reader' })` |
| `client.iam.roles.delete(input, options?)` | 删除角色 | `input.id` 必填，为前一步取得的角色编号字符串。 | 无业务数据 | `await client.iam.roles.delete({ id: roleId })` |
| `client.iam.permissions.list(input, options?)` | 分页查询权限 | `input` 必填，可用 `{}`。分页与 `type`、`search` 过滤见 [IAM 管理字段](#iam-admin-inputs)。 | 权限分页 | `await client.iam.permissions.list({ page: 1, type: 'api' })` |
| `client.iam.permissions.get(input, options?)` | 读取权限 | `input.id` 必填，为前一步取得的权限编号字符串。 | 权限记录，或 `null` | `await client.iam.permissions.get({ id: permissionId })` |
| `client.iam.permissions.create(input, options?)` | 创建权限 | 必填 `input.code` 与 `input.name`。可选 `description`、`resource`、`action`、`type` 和 `sensitiveOperations`，见 [IAM 管理字段](#iam-admin-inputs)。 | 新权限 | `await client.iam.permissions.create({ code: 'reports:read', name: 'Read reports' })` |
| `client.iam.permissions.setSensitiveOperations(input, options?)` | 配置敏感操作 | `input.id` 为必填权限编号。`sensitiveOperations` 传最多 1000 个操作标识，每个 1–128 字符，`[]` 清除。 | 无业务数据 | `await client.iam.permissions.setSensitiveOperations({ id: permissionId, sensitiveOperations: ['iam.users.delete'] })` |
| `client.iam.permissions.delete(input, options?)` | 删除权限 | `input.id` 必填，为前一步取得的权限编号字符串。 | 无业务数据 | `await client.iam.permissions.delete({ id: permissionId })` |

##### 管理字段

| 字段 | 来源与缺省行为 |
| --- | --- |
| `page`、`pageSize` | 用户和权限列表使用。页号从 1 起，默认 1；每页 1–100 条，默认 20。角色列表无业务参数，返回结构仍为分页对象。 |
| `sortBy`、`sortDirection` | 用户列表可按 `username`、`email`、`displayName`、`accountStatus` 或 `createdAt` 排序，方向为 `asc` 或 `desc`。 |
| `search`、`roleCode`、`accountStatus` | 用户列表接受搜索词、角色代码和账号状态 `active`、`dormant`、`closed`。权限列表接受搜索词。省略对应字段时按服务端默认条件查询。 |
| `accountType`、`accountStatus`、`accountExpiresAt` | 创建或更新用户时可设置永久 `permanent` 或临时 `temporary` 账号、状态和期限；更新时 `null` 清除期限。邀请账号状态仅可为 `active`。 |
| `email`、`phone`、`displayName`、`avatarUrl`、`metadata`、`roleIds` | 用户资料与角色分配字段。更新时可设置头像；`metadata` 是应用扩展对象，`roleIds` 来自角色操作的记录 ID。 |
| `type`、`sensitiveOperations` | 权限类型可为 `menu`、`api` 或 `button`。敏感操作列表最多 1000 项，每项 1–128 字符；传 `[]` 清除。 |

<a id="敏感请求再认证"></a>
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

<a id="request-authorization"></a>

### 处理身份和权限拒绝 `client.iam.auth.currentUser()` 与业务操作

认证让服务端确认请求属于哪个会话，鉴权由服务端用该身份判断能否执行指定操作、访问指定资源。客户端可以读取 `roles`、`permissions` 控制菜单和按钮的显示；每次请求仍由 Serv 或 Kit 检查路由权限及资源归属。鉴权接法见 [Serv 认证与守卫](serv.md#authentication)和 [Kit 认证与守卫](kit.md#auth)。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `client.iam.auth.currentUser(input?, options?)` | 读取当前用户的身份与权限快照 | 无业务输入，传选项时用 `undefined` 占位。 | 成功时用户资料带 `id`、`roles`、`permissions`。 | `await client.iam.auth.currentUser()` |
| `actions.reauthenticate(password, operation)` | 为服务端已登记的敏感操作取得票据 | 传当前密码和操作标识，例如 `iam.users.delete`。 | 成功后把 `data.ticket` 交给该操作的 `options.context.reauthentication`。 | `await actions.reauthenticate(password, 'iam.users.delete')` |

#### 场景：渲染登录用户的角色与权限

应用启动成功且用户已登录。下面函数只把资料和权限快照交给 UI。例如页面可据此展示管理入口，再向服务端请求实际操作。若操作需要再次验证，按[敏感操作票据示例](#敏感请求再认证)取得用途票据。

```ts
import type { ApiClient } from '@h-ai/api-client'
import type { apiContract } from '@h-ai/api-contract'

export async function readAccessForUi(client: ApiClient<{ iam: typeof apiContract.iam }>) {
  // 无业务输入。失败保留服务端错误，由调用页面处理。
  const profile = await client.iam.auth.currentUser()
  if (!profile.success)
    return profile
  return {
    success: true as const,
    data: { userId: profile.data.id, roles: profile.data.roles, permissions: profile.data.permissions },
  }
}
```

业务接口最终返回 401 时，页面按错误码处理失效会话、拒绝登录或需要再次验证等情况。服务端确认当前身份无权访问时，返回 403，页面提示无权操作并保留当前登录。下面的[自定义业务客户端](#custom-business-client)展示同一账号对不同报告得到的结果。

<a id="调用文件与-ai-apiapiclientstorageapiclientai"></a>
<a id="默认业务领域"></a>
<a id="场景调用文件与-ai-api"></a>
<a id="business-requests"></a>
<a id="storage-requests"></a>

### 访问对象存储 `client.storage`

在已挂载 Storage 路由的应用中，客户端请求授权后的列表、元数据、删除结果或临时上传和下载地址。完成预签名后，按服务端配置直接访问对象存储。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `client.storage.files.list(input, options?)` | 列出当前用户有权查看的对象 | `input` 必填，可传 `{}`。`prefix` 选前缀，`maxKeys` 为 1–1000，`delimiter` 按分隔符分组，`continuationToken` 来自上一页。 | 文件列表和继续分页所需的信息 | `await client.storage.files.list({ prefix: 'reports/', maxKeys: 20 })` |
| `client.storage.files.getMetadata(input, options?)` | 读对象元数据 | 必填 `input.key`，为当前调用方有权读取的对象键。 | 键、大小、类型等 | `await client.storage.files.getMetadata({ key })` |
| `client.storage.files.delete(input, options?)` | 删除单个对象 | 必填 `input.key`，为当前调用方有权删除的对象键。 | 无业务数据 | `await client.storage.files.delete({ key })` |
| `client.storage.files.deleteMany(input, options?)` | 批量删除对象 | 必填 `input.keys` 为非空对象键数组，服务端检查每个键的删除权限。 | 删除结果，或带部分处理进度的失败 | `await client.storage.files.deleteMany({ keys: [key] })` |
| `client.storage.presignedUrls.createUpload(input, options?)` | 签发上传地址 | 必填 `input.key`。可选 `contentType` 默认 `application/octet-stream`，`expiresIn` 默认 900 秒。 | 临时上传 URL 和对象键 | `await client.storage.presignedUrls.createUpload({ key, contentType: 'application/pdf' })` |
| `client.storage.presignedUrls.createDownload(input, options?)` | 签发下载地址 | 必填 `input.key`。可选 `expiresIn` 为签名 URL 有效秒数，默认 900。 | 临时下载 URL 和对象键 | `await client.storage.presignedUrls.createDownload({ key, expiresIn: 60 })` |

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

<a id="文件聊天记忆与会话"></a>
<a id="ai-requests"></a>

### 调用聊天、记忆和会话接口 `client.ai`

应用启用 AI 路由后，可发送会话消息、请求非流式补全、读取历史或检索记忆。应用根据用户身份使用对应的会话 ID。需要访问其他主体的数据时由服务端明确授权。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `client.ai.chats.createCompletion(input, options?)` | 提交消息列表并取得非流式补全 | `input.messages` 非空数组必填，其他生成、工具和会话字段见 [AI 请求字段](#ai-input-fields)。 | 候选回复、模型、用量和工具调用 | `await client.ai.chats.createCompletion({ messages: [{ role: 'user', content: 'Hello' }] })` |
| `client.ai.chats.sendMessage(input, options?)` | 发送会话消息 | 必填 `input.message`。`sessionId` 默认 `default`，可选 `objectId`、`systemPrompt`、`model`、`temperature`（0–2）。 | 回复文本、模型和可选用量 | `await client.ai.chats.sendMessage({ message, sessionId })` |
| `client.ai.chats.listHistory(input, options?)` | 查询历史 | 必填 `input.sessionId`。可选主体 `objectId`、条数 `limit`（1–200）及 `order`（`asc` 或 `desc`）。 | 聊天记录列表 | `await client.ai.chats.listHistory({ sessionId, limit: 20 })` |
| `client.ai.memories.list(input, options?)` | 查询记忆 | `input` 必填，可传 `{}`。可选 `objectId`、`types` 数组、从 0 起的 `offset` 与 `limit`（1–100）。 | 记忆列表 | `await client.ai.memories.list({ objectId, limit: 20 })` |
| `client.ai.memories.recall(input, options?)` | 按内容检索记忆 | 必填 `input.query`。可选主体 `objectId`、结果数 `topK`（至少 1）、`types` 数组与 `minImportance`（0–1）。 | 召回的记忆项 | `await client.ai.memories.recall({ query: 'preferred language', topK: 3 })` |
| `client.ai.sessions.list(input, options?)` | 查询对象的会话 | `input` 必填，可传 `{}` 使用当前认证主体。`objectId` 可指定经授权的主体。 | 会话列表 | `await client.ai.sessions.list({ objectId })` |

<a id="ai-input-fields"></a>

##### 聊天补全请求字段

| 字段 | 来源与要求 |
| --- | --- |
| `messages` | 必填且非空。传本次补全需要的消息，包括用户消息，以及按需传入的对话上下文和工具结果。 |
| `objectId`、`sessionId` | 可选。主体默认绑定认证用户，会话 ID 默认为 `default`。 |
| `model`、`temperature`、`top_p`、`max_tokens` | 可选模型和生成设置。温度为 0–2，`top_p` 为 0–1，`max_tokens` 为正整数。 |
| `tools`、`tool_choice` | 可选非空工具定义数组；可用 `auto`、`none`、`required` 或指定已声明的函数。由应用授权执行返回的 `tool_calls`，再将结果和对应 `tool_call_id` 发给模型。 |

默认 AI 客户端接口返回 JSON。流式会话参见[自定义流](#custom-response-results)。

#### 场景：发送当前会话的新消息

聊天页面从会话列表或应用创建的会话中取得 `sessionId`，从输入框取得 `message`。成功后把 `data.content` 追加到页面；失败时保留业务错误。

```ts
import { apiClient } from '@h-ai/api-client'

export async function sendChatMessage(sessionId: string, message: string) {
  // 使用本会话的 ID 和非空用户消息。data 包含回复文本、模型和可选用量。
  const result = await apiClient.ai.chats.sendMessage({ sessionId, message })
  if (!result.success)
    return result
  return { content: result.data.content, model: result.data.model }
}
```

<a id="输入约束与-http-能力"></a>
<a id="场景启用传输加密"></a>
<a id="encrypted-requests"></a>
<a id="启用传输加密"></a>

### 启用应用层加密 `client.init({ transport })`

加密客户端通过服务端协商路径建立传输会话。应用先在 Serv 或 Kit 配置密钥交换和目标路由，再将已初始化的 Crypto 传给客户端。启用后，通过同一客户端的业务请求和 Token 刷新都经过加密传输。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `client.init(config)` | 为实例启用加密传输 | 提供 `baseUrl` 和 `transport`。其中 `crypto` 必填，其余见下表。 | `HaiResult<void>`。握手和响应校验失败通过实际请求返回。 | `await client.init({ baseUrl, transport: { crypto } })` |

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

  const client = apiClient.create({ iam: apiContract.iam })
  try {
    // 用默认握手子路径初始化。无效配置通过 ready.error 返回。
    const ready = await client.init({ baseUrl, transport: { crypto } })
    if (!ready.success)
      return ready
    // 首次请求建立加密会话。成功时数据仍是 IAM 公开策略或 null。
    const policy = await client.iam.auth.publicConfig()
    if (!policy.success)
      return policy
    return policy
  }
  finally {
    try {
      await client.close()
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

<a id="传输加密与观察逻辑结果apiclient"></a>
<a id="场景传输加密与观察逻辑结果"></a>
<a id="逻辑请求观察"></a>
<a id="transport-observation"></a>

### 观察逻辑请求 `client.observeRequests(observer)`

观察器每次逻辑调用收到一条摘要。刷新后重试依然属于原调用，`attempts` 统计实际发出的业务请求。对于 SSE，摘要描述流是否成功建立。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `client.observeRequests(observer)` | 订阅请求摘要 | 必填同步回调，接收一个 `ApiRequestRecord`。字段和单位见[数据结构](../data/api-client.md)。 | 取消订阅函数，关闭实例也会清理订阅。 | `client.observeRequests(record => report(record.duration))` |

#### 场景：汇总认证页面的请求失败数

在已就绪的客户端上订阅并请求公开策略。观察回调只更新内存计数；`finally` 清理订阅。需要关联服务端日志时取 `requestId`，业务路径可能包含对象 ID，应先按应用的日志要求处理再输出。

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

<a id="custom-business-client"></a>

### 从共享契约调用受保护的自定义业务 `apiClient.create(contract)`

应用在共享文件定义路由树。契约确定 HTTP 方法、路径、输入和结果，服务端负责挂载处理函数并验证 `reports:export` 权限和报告的访问范围。使用 [Serv 挂载](api-contract.md#use-with-serv)或 [Kit 路由](api-contract.md#use-with-kit)，将处理函数配置为成功时返回导出任务编号，报告可见范围不符时返回 HTTP 403 的失败 `HaiResult`。此示例的宿主同时提供 IAM 和自定义报告路由。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiClient.create(contract)` | 根据应用与宿主共用的路由树创建独立实例 | 传下文的 `reportsContract`。顶层 `iam`、`reports` 成为客户端的调用分组。 | 带 IAM 和应用报告接口的 `ApiClient`。 | `apiClient.create(reportsContract)` |
| `client.reports.exports.create(input, options?)` | 为指定的报告创建导出任务 | `input.reportId` 从报告列表所选记录取得，填入路径。必填 `format` 由表单选为 `pdf` 或 `csv`，随请求体发送。 | 成功数据为 `{ exportId: string }`。缺少权限时返回 403 对应的失败分支。 | `await client.reports.exports.create({ reportId, format: 'pdf' })` |

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
  const client = apiClient.create(reportsContract)
  // 示例宿主已启用浏览器 Cookie 认证；初始化失败由页面处理。
  const ready = await client.init({ baseUrl, auth: {} })
  if (!ready.success)
    return ready

  try {
    const actions = apiClient.createAuthActions(client)
    const login = await actions.login(form)
    if (!login.success)
      return login

    // 调用时使用上一步保存的访问令牌。报告 ID 用于路由，格式随请求体提交。
    const result = await client.reports.exports.create({ reportId, format: 'pdf' })
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
    await client.close()
  }
}
```

以同一测试用户提交两条记录。对有权限的 `r-42`，用 `data.exportId` 查询导出任务进度。对超出该用户访问范围的 `r-99`，收到 `success: false` 和 `denied: true`，可显示当前报告不可导出。若超时，先通过宿主的任务记录确认是否已受理，再决定是否重新提交。

<a id="场景读取自定义裸值与-sse-响应"></a>
<a id="custom-response-results"></a>

### 读取自定义裸 JSON 或 SSE `client.<operation>(input, options?)`

自定义 operation 可在契约中声明裸 JSON 或 `eventIterator(schema)`。成功值保留其形态；发送请求或建立流失败时，API Client 返回 `HaiResult<never>` 的失败分支。可换算为 JSON Schema 的 Zod 输出用于验证线上 JSON。ISO 日期字符串等保留线上值。流成功建立后，用迭代器处理后续数据和异常。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `client.count(input?, options?)` | 读取应用的初始计数 | 示例路由无业务输入。可用 `undefined` 占位并传入取消信号。 | 成功为 `number`；HTTP、业务传输或输出校验失败时为失败分支。 | `await client.count(undefined, { signal })` |
| `client.events(input?, options?)` | 订阅应用的后续进度 | 示例路由无业务输入。传 `options.signal` 取消等待并结束读取。 | 成功为异步迭代器；建立失败返回失败分支。 | `await client.events(undefined, { signal })` |

#### 场景：显示进度快照与后续事件

Serv 或 Kit 已使用 [同一个应用契约](api-contract.md#declare-routes) 挂载两个路由。`/status/count` 返回当前计数，`/status/events` 发出形如 `{ completed: 3 }` 的进度。示例导入 `@orpc/contract` 和 `zod`，应用把它们声明为直接依赖。进度页传入 API 基址、页面的取消信号和更新函数，在离开时取消。流建立后，迭代失败会拒绝函数，由页面区分取消与读取失败。结束后释放此场景使用的实例。

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { eventIterator } from '@orpc/contract'
import { z } from 'zod'

export const progressContract = {
  count: apiContract.route({ method: 'GET', path: '/status/count' }).output(z.number()),
  events: apiContract.route({ method: 'GET', path: '/status/events' })
    .output(eventIterator(z.object({ completed: z.number() }))),
}

export async function readProgress(baseUrl: string, signal: AbortSignal, update: (completed: number) => void) {
  const client = apiClient.create(progressContract)
  const initialized = await client.init({ baseUrl })
  if (!initialized.success)
    return initialized

  try {
    // 成功值是裸数字，用它显示首次快照；其它结果带失败详情。
    const count = await client.count(undefined, { signal })
    if (typeof count !== 'number')
      return count
    update(count)

    // 先检查流是否已建立，再逐条更新。signal 控制当前流的读取。
    const events = await client.events(undefined, { signal })
    if (!(Symbol.asyncIterator in events))
      return events
    for await (const event of events)
      update(event.completed)
  }
  finally {
    await client.close()
  }
}
```

<a id="错误处理"></a>
<a id="错误提示与关联日志"></a>
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
