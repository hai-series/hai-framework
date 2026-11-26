# hai-kit 参考

HTTP/UI 边界只对明确的有效 4xx 状态公开业务提示；错误缺少 `httpStatus` 或状态非法时按 500 返回安全提示。手写业务错误须提供完整错误定义或显式状态，不能依赖缺省状态展示原文。

> `@h-ai/kit` 只负责 SvelteKit 集成：`handle` hook、guard、response、validate、client、auth、crud、A2A。公共跨端 HTTP API 契约统一使用 `@h-ai/api-contract` + `@h-ai/serv`，不要在 kit 中定义业务 API contract。

命名空间公开类型为 `KitFunctions`（服务端）与 `BrowserKitFunctions`（浏览器）。浏览器条件入口包含同源客户端、CRUD、菜单权限匹配、页面 Token 与默认语言操作。服务端从 `@h-ai/kit` 根入口使用 `kit.crypto` 和路由守卫；用 `kit.createHandle({ a2a })` 挂载 AI 生成的 A2A HTTP 处理器，服务端认证 Cookie 的写入边界为 `AuthCookieWriter`。SvelteKit 浏览器入口 `@h-ai/kit/client` 还提供导航适配器，构建阶段从 `@h-ai/kit/adapter` 选择适配器。

认证协议仅支持 v2：独立随机 SM4-CBC 密钥和 HMAC-SM3 密钥由 SM2 封装，先验签、再验证 MAC，最后解密 CBC。请求由客户端私钥签名，响应由所选服务端版本签名。认证字段包括 version、direction、serverKeyId、clientId、128 位随机 requestId（兼 nonce）、issuedAt、HTTP method、pathname + 原始 search 的 SM3 pathHash，以及响应 status。请求默认有效期为 5 分钟，客户端时间最多可领先服务器 30 秒。服务端可用 `maxRequestAgeSeconds`（1～3600）和 `maxFutureSkewSeconds`（0～1800）调整，单位为整数秒。共享 registry 原子消费 (clientId, requestId)，nonce 保留到 issuedAt + 61 分钟，写入后最长保留 91 分钟，覆盖最长可配窗口及节点时钟差，存储故障拒绝请求。Redis 必须保留有效 nonce，使用 noeviction/可靠持久化策略；各节点时钟须同步。此能力防止同一传输消息重放，业务重试仍需自己的幂等键。

在 `_kit.yml` 的 `transport` 块配置时间窗口，将字段传给服务端 transport 装配。校时提示与 `TransportTimeError.serverTime` 见 [Crypto 参考](../hai-crypto/reference.md)。`kit.client.createAuthActions()` 将已认证校时错误转为 `HaiResult`，供 AuthPanel 展示。

空 POST 也发送空明文的认证封装；GET/HEAD 将封装放在 X-Hai-Transport 头，204/205/304/HEAD 等无正文响应也使用同名头承载认证封装。其它请求/响应在 JSON 正文承载封装并带 X-Encrypted: true。客户端必须关联原请求上下文和 HTTP status，缺标记、旧格式或认证失败一律 reject；明文接口由 Serv/Kit 路径规则 `encryption: disabled` 或宿主 `excludePaths` 显式允许；调用方同步选择普通请求，API Client/Kit 包装器使用自己的 `excludePaths`。CORS 须允许并暴露 X-Hai-Transport。握手公钥的真实性依赖 TLS，不替代 IAM 业务授权。

## 使用步骤

错误响应与 Serv 共用 `HaiCommonError`：未认证用 `UNAUTHORIZED.code`、无权限用 `FORBIDDEN.code`、限流用 `RATE_LIMIT_EXCEEDED.code`（429）；不要匹配旧的无命名空间字符串。`fromError/fromResult` 保留安全字段校验、`httpStatus` 和追踪编号，内部异常只记录日志。前端使用已本地化的安全消息，排查按 `traceId` 关联服务端原因。

`kit.response.validationError(errors)` 同样经 `fromError` 过滤，响应 `error.cause` 只含本地化的 `field` 和 `message`，会过滤 `rejectedValue`、SQL 和其他字段。

### 1. 请求管道

在服务端启动流程初始化 IAM 和共享缓存并检查结果，再装配 `hooks.server.ts`。下例从根目录提供服务。子目录部署时给登录、保护和公开路径加上实际挂载前缀。

```ts
import type { HandleAuthConfig } from '@h-ai/kit'
import type { Handle } from '@sveltejs/kit/hooks'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

const auth: HandleAuthConfig = {
  iam,
  loginUrl: '/auth/login',
  protectedPaths: ['/admin/*', '/api/*'],
  publicPaths: [...kit.auth.publicPaths],
}

export const handle: Handle = kit.createHandle({
  auth,
  http: {
    rateLimit: {
      windowMs: 60_000,
      maxRequests: 100,
      store: core.access.createCacheRateLimitStore(cache, { namespace: 'app' }),
    },
  },
  logging: true,
})
```

将 `kit.auth.createApi(iam)` 的登录和注册处理器导出到应用路由。登录成功应设置会话 Cookie，匿名访问 `/api/auth/me` 应返回 401。

<a id="rate-limit-example"></a>

#### 验证固定窗口限流

上例的 `http.rateLimit` 是服务端 Hook 选项。它让同一个可信客户端 IP 在 60 秒内通过 100 次限流检查。同一 IP 请求不同路由或切换实例时共用额度。用已登录账户从同一个 IP 对正常返回 200 的 API 连续请求。窗口内第 101 次计数返回 429，`X-RateLimit-Remaining` 为 `0`。等待响应头 `Retry-After` 指示的秒数后再请求，应重新通过限流。后续请求保留首次成功计数设置的期限。默认响应头 `X-RateLimit-Reset` 为服务节点估算的 Unix 秒级时间戳，Redis 键的 TTL 决定实际过期时间。若提供 `onLimitReached(event)`，该回调负责超限响应及所需响应头。

必须显式提供原子 `store`。生产实例使用同一个已初始化的 Redis 和一致的 `namespace`、`windowMs`、`maxRequests`。存储读取、条件提交失败或冲突重试耗尽时返回 503。单进程开发或显式测试可将示例的 store 改为 `core.access.createMemoryRateLimitStore()`，将 `maxRequests` 改为 `2`、`windowMs` 改为 `10_000`。在 10 秒内连续请求三次，应得到 200、200、429，剩余额度分别为 1、0、0。内存最多保留 10000 个窗口，每次请求惰性扫描最多 64 项。容量耗尽时，新键的请求返回 503。存储由应用持有并统一清理。

默认限流键使用 Hook 按 `http.trustedProxies` 解析的可信客户端地址。默认限流在传输和会话验证前执行。需要按用户标识计数时，提供 `keyGenerator`，从会话解析及守卫通过后的 `event.locals.session` 读取用户 ID，并给匿名请求指定键。请求日志的 `logBody: true` 只记录正文流是否存在。

### 2. SvelteKit API endpoint

应用在 `+server.ts` 的命名导出里注册 HTTP 方法，文件位置决定 URL。项目已有共享契约时，从项目的契约包导入输入 Schema，在下例的 `kit.validate.body(request, schema)` 中使用。查询参数和路径参数分别传给 `kit.validate.query(url, schema)` 与 `kit.validate.params(params, schema)`。用 typed client 调用时，端点的 HTTP 方法、前缀、业务路径和响应均须与同一份契约一致。

业务失败用 `kit.response.fromResult/fromError`，保留安全字段错误、显式 `publicExt` 和 HTTP 状态。4xx 使用 `debug` 记录错误码、状态和追踪编号，5xx 使用 `error` 记录服务端异常诊断。请求日志仅记录查询参数数量。

```ts
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const CreateUserSchema = z.object({ name: z.string().min(1) })

// 将这个 POST 回调包装为 SvelteKit 请求处理器，并将适用的失败转换为 HTTP 响应。
export const POST = kit.handler(async ({ request, locals }) => {
  // 检查当前会话能否创建用户。缺少身份或权限时拒绝继续。
  kit.guard.require(locals.session, 'user:create')
  // 按 CreateUserSchema 解析请求正文。校验失败时不返回已创建结果。
  const payload = await kit.validate.body(request, CreateUserSchema)
  // 用已校验数据生成 HTTP 201 成功响应。
  return kit.response.created(payload)
})
```

### 3. 浏览器同源请求

```ts
import { kit } from '@h-ai/kit/client'

// 以默认配置创建本应用的客户端，并导出它的 apiFetch。
const client = kit.client.create()
export const { apiFetch } = client
```

同源端点使用 HttpOnly Cookie。`auth: true` 启用页面内存令牌。客户端只向同源请求自动注入 Bearer 和 CSRF 头，自动注入后 Fetch 仍可跟随同源重定向，跨源重定向会失败。自定义令牌存储使用内存或平台安全存储。跨域 API 使用 `@h-ai/api-client`。

若启用 `session.endOnPageHide`，服务端布局从已验证的 `locals.accessToken` 调用 `kit.auth.sessionFingerprint(accessToken)`，只将 `sessionFingerprint` 返回页面。浏览器调用 `actions.bindPageExit({ enabled, sessionFingerprint })`，在布局卸载时执行返回的清理函数。只有指纹匹配当前 Cookie 时，页面离开的请求才关闭该 Cookie 对应的会话。显式 `accessToken` 或 Bearer 仍由服务端校验。

### 4. 同源传输加密

服务端和客户端都使用 `@h-ai/crypto` 的 `crypto.transport`。将下例的 `crypto` 选项合并到前面的 Hook，复用已初始化的缓存和 IAM 认证配置。

```ts
// hooks.server.ts
import { cache } from '@h-ai/cache'
import { crypto } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

const ready = await crypto.init()
if (!ready.success)
  throw new Error(ready.error.message)
// 解析环境变量中的服务端密钥环，失败时抛错退出。
const ring = crypto.transport.parseServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
if (!ring.success)
  throw new Error(ring.error.message)
const serverKeyRing = ring.data

// 根据下方认证策略、密钥环和共享密钥仓库生成服务端请求钩子。
export const handle = kit.createHandle({
  auth,
  crypto: {
    crypto,
    transport: {
      serverKeyRing,
      // 用已连接的缓存存放传输密钥，条目寿命为 3600 秒。
      keyStore: crypto.transport.createKeyStore({ cache, ttlSeconds: 3600 }),
    },
  },
})
```

需要保护会话 Cookie 时配置 `crypto.encryptedCookies`，并通过 `crypto.cookieEncryptionKey` 或 `HAI_KIT_COOKIE_KEY` 提供密钥。密钥必须为 32 位十六进制。Cookie 使用独立子密钥执行 SM4-CBC 和 HMAC-SHA256，验证版本、名称、IV 与密文后解密。`createHandle()` 会拒绝缺失或无效的密钥。

不再使用无运行入口的旧 Crypto Helpers 或其 `CryptoServiceLike`、`EncryptedCookieConfig`、`CryptoCsrfConfig`、`WebhookVerifyConfig` 类型；这些已删除。Cookie 通过上述 `kit.createHandle` 配置保护，其他加密能力使用 `@h-ai/crypto` 真实公开 API。

```svelte
<!-- src/routes/+layout.svelte -->
<script lang='ts'>
  import { browser } from '$app/env'
  import type { LayoutData } from './$types'
  import { crypto } from '@h-ai/crypto'
  import { kit } from '@h-ai/kit/client'
  import { untrack } from 'svelte'

  const { data }: { data: LayoutData } = $props()

  // 服务端 layout 只返回 kit 公共投影；初次加载安装，不下发完整策略。
  if (browser) {
    // 将服务端返回的 Kit 公共配置和 crypto 交给浏览器传输安装。仅在配置启用时启用包装。
    kit.client.installBrowserTransport(untrack(() => data.kit), { crypto })
  }
</script>
```

```ts
// lib/utils/api.ts —— 业务层只看到 apiFetch
import { kit } from '@h-ai/kit/client'

// 创建默认客户端，并为业务层导出其 apiFetch。
export const { apiFetch } = kit.client.create()
```

密钥交换使用从站点根开始的绝对路径，默认 `/api/v1/_hai/key-exchange`。自定义时，服务端与浏览器都使用 `transport.keyExchangePath`。

启用 Hook 传输加密时，传入 `kit.createHandle({ http, transport: { crypto, serverKeyRing, keyStore, ...路由设置 } })`。serverKeyRing 通过服务端 Secret/私有 `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` 安全解析，不放 `_kit.yml`、PUBLIC_/VITE_ 或日志；浏览器仅需公开 transport 配置和 crypto。各节点使用同一版本化 ring 与基于 @h-ai/cache 的 Redis registry；仅共享客户端公钥不够。请求带协商 serverKeyId，无需 sticky session；轮换先分发新旧 ring，再切 activeKeyId 重建 manager，删除旧 ID 后客户端 destroy 并重协商。开发/测试须显式将 memory cache 传入统一 registry。完整轮换步骤见 hai-crypto。

transport 默认保护配置的契约 API 前缀、`/api/*` endpoint 和 SvelteKit `__data.json` 页面数据请求。使用 `kit.createHandle({ contract })` 挂载共享契约后，显式 HEAD 操作返回自己的状态与响应头，正文为空。

跨源上传 `multipart/form-data` 时，在 `_kit.yml` 为上传路径配置 `cors`，将实际页面的完整 HTTPS Origin 也加入 SvelteKit 的 `csrf.trustedOrigins`，然后重新构建。SvelteKit 的生产表单检查在 Hook 前执行，验证时同时检查 OPTIONS 204 和已授权的 POST 成功。给已启用传输加密的上传端点配置 `http.access.rules[].encryption: disabled`，在契约处理器中设置请求体上限和文件归属权限。

受保护路径不允许协议降级；缺少认证、管理器不可用、响应加密失败均拒绝。明文接口通过请求规则 encryption:disabled 或宿主 excludePaths 显式配置，调用方同步选择协议；IP、时间和认证继续检查。规则 required 优先于宿主排除表，冲突或缺少加密装配会拒绝创建 Handle。

空 POST 也发送空明文的认证封装；GET/HEAD 将封装放在 X-Hai-Transport 头，204/205/304/HEAD 等无正文响应也使用同名头承载认证封装。其它请求/响应在 JSON 正文承载封装并带 X-Encrypted: true。客户端必须关联原请求上下文和 HTTP status，缺标记、旧格式或认证失败一律 reject；明文接口由 Serv/Kit 路径规则 `encryption: disabled` 或宿主 `excludePaths` 显式允许；调用方同步选择普通请求，API Client/Kit 包装器使用自己的 `excludePaths`。CORS 须允许并暴露 X-Hai-Transport。握手公钥的真实性依赖 TLS，不替代 IAM 业务授权。

业务容量统一配置 transport.maxPlaintextBytes：UTF-8 JSON 明文字节，默认 1 MiB，有效整数范围 1 KiB～64 MiB，请求和响应共用。客户端从握手获取服务端预算，可选本地上限取较小值；crypto.transport.resolveBodyLimits(limit, { requiredPlaintextBytes }) 合并模块需求：保留显式上限，不足时报配置冲突；省略时按需要推导，无模块需要仍为 1 MiB。Serv/Kit 的 auto 规范化为 undefined。密文预算为两倍明文加 32 KiB。握手 JSON 16 KiB、公钥 4 KiB、认证头 16 KiB、路径 8 KiB、认证及防重放保持独立。原流超限/取消立即停止、取消并释放 reader；请求 413、响应返回加密的 500 容量错误，客户端识别 TransportBodyTooLargeError / hai:crypto:070。 通过 _kit.yml 的 transport.maxPlaintextBytes 或对应 HAI_*_TRANSPORT_MAXPLAINTEXTBYTES 配置并转发到服务端 transport；重建正文保留 signal 并删除旧长度/编码头。

### 5. 使用 `_kit.yml` 统一 transport 配置

Kit 的 `_kit.yml` 和 Serv 的 `_serv.yml` 都以 `http.trustedProxies` 和 `http.access` 配置可信代理及访问控制。两者都用 `transport` 设置密钥交换路径、双向明文上限和请求时间窗口。SvelteKit 部署在 `/console` 时，显式填写 `/console/api/v1/_hai/key-exchange`。

`@h-ai/kit` 现在提供 `KitConfigSchema` / `kit.resolveConfig()`，适合同一份 `_kit.yml`
同时驱动 `hooks.server.ts` 与浏览器端 `kit.client.installBrowserTransport()`：

```yml
transport:
  keyExchangePath: /api/v1/_hai/key-exchange
  excludePaths:
    - /api/storage
    - /api/public
    - /api/auth/profile/avatar
```

```ts
import { core } from '@h-ai/core'
import { KitConfigSchema } from '@h-ai/kit'

// src/routes/+layout.server.ts；服务端已先完成应用配置初始化。
export function load() {
  // 读取并校验应用的 _kit.yml。成功返回配置，失败时抛错且不生成公开投影。
  const loaded = core.config.load('kit', './config/_kit.yml', KitConfigSchema)
  if (!loaded.success)
    throw new Error(loaded.error.message)
  return { kit: { transport: loaded.data.transport } }
}
```

生成项目用 adapter-node 运行时按 `HOST` 和 `PORT` 监听，默认 `0.0.0.0:3000`。自定义启动器可把 `kit.resolveConfig(input).server` 的解析结果传给 HTTP 监听函数。Kit 解析时按有效的 `HOST` / `PORT`、YAML 的 `server` 和 `127.0.0.1:3000` 的顺序取值。
`_kit.yml` 在服务端读取，可包含 `http.access` 和 `http.trustedProxies`；layout data 只投影公开 transport，不通过 ?raw 导入完整文件到浏览器，也不放密钥。服务端与浏览器使用同一个 `transport.keyExchangePath`。请求策略按[共享约定](../hai-core/request-access.md)装配与验证。

子目录部署在 Vite 的 sveltekit 配置设置 `paths.relative: false`，从 `$app/paths` 用 `resolve('/').replace(/\/$/, '')` 取构建挂载目录 `base`，服务端 `transport.basePath` 与客户端 `kit.client.installBrowserTransport(config, { crypto, basePath: base })` 同步；独立 client 的 `transport.basePath` 也用该值。默认空字符串为根目录，不能仅调整资源地址后把登录成功当作加密验证。交换/排除/容量路径保持完整请求路径，验证原始请求带加密标记、缺协议被拒绝、排除接口正常且不影响相邻目录。

运营台将报告契约挂在 `/console/reports` 时，`kit.createHandle({ contract, transport })` 直接读取 `contract.apiPrefix`，默认加密契约请求。给浏览器安装器的 `deps` 传 `{ contractApiPrefix: '/console/reports' }`，给独立客户端传 `transport.contractApiPrefix`。使用完整请求前缀，包含 SvelteKit 挂载目录。启用 CORS 时，只对匹配范围的浏览器预检免除传输和计数，仍执行访问策略。用 A2A 专用 HTTP 客户端发送 Agent Card GET 和 RPC POST。从同一页面调用 A2A 时使用安装全局包装前保存的原生 Fetch，宿主访问策略和可信 IP 限流仍会执行。

## 核心 API

| API                                                      | 用途                                                     |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `kit.createHandle()`                                     | 创建 SvelteKit Handle                                    |
| `kit.sequence()`                                         | 组合多个 Handle                                          |
| `kit.handler()`                                          | API endpoint 错误边界                                    |
| `kit.guard.require()`                                    | 权限守卫                                                 |
| `kit.guard.matchPermission()`                            | 可在浏览器匹配权限码，用于报告菜单等展示判断             |
| `kit.response.*`                                         | 统一响应工厂                                             |
| `kit.validate.*`                                         | Zod 请求校验                                             |
| `kit.auth.*`                                             | Cookie / Token 辅助                                      |
| `kit.client.create()`                                    | 浏览器端同源 apiFetch                                    |
| `kit.client.installBrowserTransport(config, { crypto })` | 接收 KitPublicConfig，只含 transport；不要求浏览器接收代理或访问策略 |
| `kit.client.installBrowserTransportFetch()`              | 底层入口：直接传 transport 配置安装浏览器全局 fetch 包装 |
| `kit.crud.define()`                                      | 声明式 CRUD 资源                                         |
| `kit.crud.resolveText()` / `kit.crud.resolveOptions()`     | 读取 CRUD 字段的即时值或延迟计算结果                     |

`guard.require` 和 `validate` 的 OrFail Response 仅由 `kit.handler` 处理 API 控制流。页面 load 用 guard.check 加 SvelteKit error，查询参数先 safeParse；不能把 API Response 直接抛给页面运行时。

## 常见模式

- SvelteKit 应用内同源请求用 `kit.client.create().apiFetch`。
- SvelteKit 应用启用 transport 时，服务端 layout 只投影 transport 为公共 data；`+layout.svelte` 的 `if (browser)` 分支调用一次安装器，可直接使用布局数据提供的 `keyExchangePath` 和 `excludePaths`，不下发完整配置。
- Web/App/小程序跨域访问公共 API 用 `@h-ai/api-client` typed client。
- 传输加密只通过 `crypto.transport` 间接装配，不在 kit 中新增本地加密工厂或鸭子类型。
- 服务端业务模块直接调用模块 API，不通过 HTTP 自环。
- API endpoint 必须用 Zod 校验用户输入，并设置认证/权限边界。
- 反馈 catch-all 路由在子目录部署时给 `kit.createFeedbackHandler()` 传入含挂载前缀的 `basePath`，例如 `/portal/api/feedback`。从 SvelteKit 的配置计算该路径，并从已验证会话中解析反馈身份。

## 声明式 CRUD 表单字段

`kit.crud.define` 的字段支持 `colSpan: 'auto' | 1 | 2`，以及 `validation.message: string | (() => string)`。布局通过 UI 的 `CrudPage.form` 配置；客户端校验用于交互提示，服务端仍使用 Zod 验证和现有权限守卫。UI 公共契约见相邻 [hai-ui skill](../hai-ui/SKILL.md)。

订单报告页由布局传入已验证会话的权限数组。页面判断是否显示报告链接，并在渲染表单时计算状态字段的文案和选项。读取报告时，服务端端点仍使用 `kit.guard.require(event, 'reports:read')` 核对当前会话。

```ts
import { kit } from '@h-ai/kit/client'

export function reportControls(permissions: string[]) {
  // reports:* 或 reports:read 使页面显示报告链接。
  const showReportLink = kit.guard.matchPermission('reports:read', permissions)
  // 字段在渲染时得到文案及可选状态，例如发布后只显示已发布的报告。
  const statusLabel = kit.crud.resolveText(() => '报告状态')
  const statusOptions = kit.crud.resolveOptions(() => [{ label: '已发布', value: true }])
  return { showReportLink, statusLabel, statusOptions }
}
```

Node 请求/SSR 必须用 `core.i18n.runWithLocale(locale, callback)`（kit 同名方法）包裹实际异步 resolve；serv 自动建立请求语言上下文。浏览器 setGlobalLocale/createLocaleStore 继续管理应用语言，SSR 的 UI setter/store 不写全局值。显式 MessageOptions.locale 优先；进程默认语言仅在启动时设置。

认证 Cookie 在 NODE_ENV 或 HAI_CORE_ENV 为 production 时默认启用 Secure，HAI_E2E/HAI_E2E_MOCK 不降低 Cookie 安全；限流生产判断也识别这两个环境标志，测试开关仅放宽共享状态要求。

`kit.auth.logout(cookies, accessToken)` 返回 `Promise<HaiResult<void>>`。无令牌时仅清除 Cookie 并成功；有令牌但未配置认证操作时返回失败。无论服务端结果如何都清除本地 Cookie，调用方仍必须把失败转换为错误响应或提示；仅成功结果代表服务端撤销已经确认。底层控制流异常继续传播。
