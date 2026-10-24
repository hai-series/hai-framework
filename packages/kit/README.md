# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md) · [@h-ai/iam](../iam/README.md)

## 简介

`@h-ai/kit` 是 hai-framework 的 SvelteKit 集成模块，提供统一的请求管道与同源 endpoint 工具：

- `kit.createHandle()`：会话解析、路由守卫、中间件链、可选传输加密与 Cookie 加密
- `kit.handler()`：API 端点异常边界
- `kit.guard` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client` / `kit.crud`

> 公共跨端 HTTP API contract 统一放在 `@h-ai/api-contract`，由 `@h-ai/serv` 挂载，客户端通过 `@h-ai/api-client` typed client 调用；`@h-ai/kit` 不定义也不承载业务 API contract。

## 核心功能清单

- Handle Hook 组合（`createHandle` / `sequence`）
- 认证/角色/权限守卫（`guard.require` / `guard.check`）
- 内置 Logging / RateLimit / CORS 中间件（通过 `createHandle` 配置启用）
- 统一 API 响应与请求验证（Zod）
- Bearer Token 工具（服务端 login/logout + 浏览器端 Token 存储）
- 浏览器端统一客户端（自动 CSRF，支持传输加密）
- 声明式 CRUD 资源定义（`crud.define`）
- A2A 协议集成：默认发现路径 `/.well-known/agent-card.json`；配置 `authenticate` 后 null/undefined 返回 401，仅未配置认证时允许匿名。API Key 参数从完整 Agent Card 的 `securitySchemes.apiKey` 读取。Hook 与显式 A2A 路由共享 JSON-RPC 解析错误和 SSE 取消清理逻辑。
- 双构建模式（`createAdapter()`）

## 使用入门

`sequence` 保留并组合 SvelteKit 的 `resolve` 选项：页面转换由内向外执行，`preload` 与序列化响应头过滤使用首个配置，确保 i18n 的 HTML 语言标记正确替换。

### 安装

```bash
npm install @h-ai/kit @h-ai/core sm-crypto@0.5.7
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/vite-plugin-svelte vite
```

### 依赖

- `@h-ai/iam` — 身份认证与授权（A2A 认证），可选；使用 A2A 功能时需在 kit 使用前初始化
- `@h-ai/crypto` — 加密（传输加密 / Cookie 加密），可选；启用加密时需在 kit 使用前初始化

### 快速开始

#### 项目配置

**svelte.config.js**：

```js
import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

const config = {
  preprocess: [vitePreprocess()],
  compilerOptions: { runes: true },
  kit: {
    adapter: adapter(),
    // 双构建模式：import { createAdapter } from '@h-ai/kit/adapter'
    // adapter: await createAdapter(),
  },
}

export default config
```

**vite.config.ts**：

```ts
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  optimizeDeps: { exclude: ['bits-ui'] },
  ssr: { noExternal: ['@h-ai/ui', '@h-ai/kit'], external: ['@h-ai/core', 'sm-crypto'] },
})
```

使用 Crypto 或依赖它的 Kit/IAM 时，应用生产依赖需包含 `sm-crypto@0.5.7`。CLI 已配好这一项；手工接入时运行 `pnpm add sm-crypto@0.5.7`。仅设置 external 不够，adapter-node 还需要这项直接依赖声明才能保留原包加载。

#### 搭建请求管道

**src/hooks.server.ts**：

```typescript
import type { Handle } from '@sveltejs/kit'
import { cache } from '@h-ai/cache'
import { kit } from '@h-ai/kit'

const haiHandle = kit.createHandle({
  auth: {
    verifyToken: async (token) => {
      const verified = await iam.auth.verifyToken(token)
      return verified.success ? verified.data : null
    },
    loginUrl: '/auth/login',
    protectedPaths: ['/admin/*', '/api/*'],
    publicPaths: ['/api/auth/*', '/api/public/*'],
  },
  rateLimit: { windowMs: 60_000, maxRequests: 100, store: kit.middleware.createCacheRateLimitStore(cache, { namespace: 'app' }) },
  logging: true,
})

export const handle: Handle = haiHandle
```

限流采用首次成功提交为起点的固定窗口，后续请求不延长 TTL。必须显式传 store；应用先检查共享 Redis 初始化结果，所有节点使用相同 namespace/windowMs/maxRequests。缓存读取/条件提交失败或冲突耗尽返回503，超限429；不会回退 get+set 或本地计数。createMemoryRateLimitStore 仅开发或显式 HAI_E2E/HAI_E2E_MOCK 测试使用，无常驻定时器，丢弃引用即可回收；每次请求最多惰性扫描 64 项，最多保存 10000 个窗口，容量满时对新 key 返回503且不驱逐有效计数，外部 store 生命周期由创建者管理；生产不得设置测试开关。响应重置时间为节点时钟估算，实际窗口由 Redis TTL 决定，须同步时钟。默认键只读取可信 adapter 的 getClientAddress、规范化等价IPv6和IPv4映射地址，不采信原始转发头；代理信任通过部署adapter配置。

#### API 端点

```typescript
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

export const POST = kit.handler(async ({ request, locals }) => {
  kit.guard.require(locals.session, 'user:create')
  const payload = await kit.validate.body(request, CreateUserSchema)
  return kit.response.created(payload)
})
```

#### 浏览器客户端

`kit.client.create()` 面向 SvelteKit 同源 endpoint；Web / App / 小程序跨域访问公共 API 时，请使用 `@h-ai/api-client`。

```typescript
// src/lib/utils/api.ts — 全应用共享
import { kit } from '@h-ai/kit'

const client = kit.client.create()
export const { apiFetch } = client
```

```typescript
// 使用
import { apiFetch } from '$lib/utils/api'

const response = await apiFetch('/api/users', { method: 'GET' })
```

> CSRF Header 注入由 `apiFetch` 自动处理；`@h-ai/kit` 不提供独立的 CSRF 中间件工厂。
> `apiFetch` 接受字符串、URL 或 Request；Request 自带的方法、请求头与正文会保留，写方法同样附加 CSRF。启用 transport 时仅加密可支持的正文，multipart 上传保持原始边界。
>
> 同源 SvelteKit endpoint 使用 httpOnly Cookie，由服务端读取 Cookie 完成鉴权。浏览器 Bearer Token 使用 `kit.auth.setBrowserToken()` 写入页面内存，再通过 `kit.client.create({ auth: true })` 注入。自定义 `BrowserTokenStore` 也必须使用内存或平台安全存储，禁止将敏感凭据写入 Web Storage。

#### 同源传输加密

kit 的传输加密也统一委托 `@h-ai/crypto`：服务端通过 `crypto.transport.createServer({ serverKeyRing, keyStore })` 创建管理器，浏览器端通过 `kit.client.installBrowserTransport(kitConfig, { crypto })` 一行安装同源 fetch 包装。服务端还须注入受管密钥环和共享 registry。

**src/hooks.server.ts**：

```ts
import { cache } from '@h-ai/cache'
import { createRedisTransportKeyStore, crypto, parseTransportServerKeyRing } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

await crypto.init()
const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
if (!ring.success)
  throw new Error(ring.error.message)
const serverKeyRing = ring.data
await cache.init({ type: 'redis', host: '127.0.0.1', port: 6379 })

export const handle = kit.createHandle({
  auth: {
    verifyToken,
    protectedPaths: ['/api/*'],
    publicPaths: ['/api/_hai/*'], // 默认密钥协商端点
  },
  crypto: {
    crypto,
    transport: {
      serverKeyRing,
      keyStore: createRedisTransportKeyStore({ cache, ttlSeconds: 3600 }),
    },
  },
})
```

**src/routes/+layout.svelte**（推荐入口：浏览器端只需一行）：

```svelte
<script lang='ts'>
  import { browser } from '$app/environment'
  import { appKitConfig } from '$lib/config/kit-config'
  import { crypto } from '@h-ai/crypto'
  import { kit } from '@h-ai/kit'

  // 一次性安装：内部按 _kit.yml 决定是否启用 transport，并预热 crypto
  if (browser) {
    kit.client.installBrowserTransport(appKitConfig, { crypto })
  }
</script>
```

**src/lib/utils/api.ts**（业务层只看到 `apiFetch`）：

```ts
import { kit } from '@h-ai/kit'

export const { apiFetch } = kit.client.create()
```

> 不再需要 `src/hooks.client.ts`：默认 `handleFetch` 行为已经够用，SvelteKit 内部 `__data.json` 请求会自动走上面安装的全局 fetch 包装。若确需同源 Authorization Header，使用显式 `BrowserTokenStore` 或 `kit.auth.setBrowserToken()` + `kit.client.create({ auth: true })`；不要把敏感 Token 存入 `localStorage`。

默认密钥协商路径为 `/api/_hai/key-exchange`。如服务端自定义 `transport.keyExchangePath`，客户端需同步配置 `transport.keyExchangeUrl`。

服务端必须显式注入相同的受管 `serverKeyRing` 和共享 `keyStore`（Redis 或共享数据库）。仅共享客户端公钥不足以跨节点解密。没有隐式进程私钥或内存 registry 回退；开发/测试显式用 `createInMemoryKeyStore(capacity)`。服务端重启后重新加载同一密钥环即可，无需 sticky session。

transport 默认作用于同源 `/api/*` endpoint 与 SvelteKit `__data.json` 页面数据请求（以及密钥协商端点本身）；页面文档与静态资源仍保持明文，不要求携带 `X-Client-Id`。文件上传等 `multipart/form-data` 请求会保持原样发送，需在服务端 `excludePaths` 中显式放行对应上传路径。

认证协议仅支持 v2：独立随机 SM4-CBC 密钥和 HMAC-SM3 密钥由 SM2 封装，先验签、再验证 MAC，最后解密 CBC。请求由客户端私钥签名，响应由所选服务端版本签名。认证字段包括 version、direction、serverKeyId、clientId、128 位随机 requestId（兼 nonce）、issuedAt、HTTP method、pathname + 原始 search 的 SM3 pathHash，以及响应 status。请求有效期 5 分钟，未来时钟偏差最多 30 秒；共享 registry 原子消费 (clientId, requestId)，nonce 至少保留到 issuedAt + 6 分钟以覆盖节点偏差，存储故障拒绝请求。Redis 必须保留有效 nonce，使用 noeviction/可靠持久化策略；各节点时钟须同步。此能力防止同一传输消息重放，业务重试仍需自己的幂等键。

空 POST 也发送空明文的认证封装；GET/HEAD 将封装放在 X-Hai-Transport 头，204/304/HEAD 等无正文响应也使用同名头承载认证封装。其它请求/响应在 JSON 正文承载封装并带 X-Encrypted: true。客户端必须关联原请求上下文和 HTTP status，缺标记、旧格式或认证失败一律 reject；明文接口只能经 excludePaths 显式排除。CORS 须允许并暴露 X-Hai-Transport。握手公钥的真实性依赖 TLS，不替代 IAM 业务授权。

业务容量通过 `transport.maxPlaintextBytes` 统一配置：默认 1 MiB，整数范围 1 KiB～64 MiB，请求和响应共用 UTF-8 明文字节预算。客户端从握手自动获取上限，密文与部署代理预算由 `resolveTransportBodyLimits()` 推导（两倍明文 + 32 KiB）。握手、公钥、认证头和防重放约束独立；超限取消原流并释放 reader，请求 413、响应为加密的 500 容量错误，客户端识别 `TransportBodyTooLargeError` / `hai:crypto:070`。 [Transport capacity and upgrade](../crypto/TRANSPORT-CAPACITY.md)。

serv/kit 对通过请求绑定、签名和 MAC 校验但超出时间窗口的报文返回加密的 HTTP 400 时间错误；客户端抛 `TransportTimeError`（`hai:crypto:071`），提示同步设备和服务器时间后刷新重试。`api-client` 映射为 `VALIDATION_FAILED`，在 `cause.transportCode` 保留该原因。不会自动重放请求或放宽防重放窗口；篡改或未认证报文仍返回通用认证失败。

#### 使用 `_kit.yml` 统一 transport 配置

`@h-ai/kit` 提供 `KitConfigSchema` / `resolveKitConfig()`，方便应用用同一份 `_kit.yml`
同时驱动 `hooks.server.ts` 与浏览器端 `kit.client.installBrowserTransport()`：

```yml
server:
  host: 127.0.0.1
  port: 3000

transport:
  keyExchangePath: /api/_hai/key-exchange
  excludePaths:
    - /api/storage
    - /api/public
    - /api/auth/profile/avatar
```

```ts
import { resolveKitConfig } from '@h-ai/kit'
import { parse } from 'yaml'
import rawKitConfig from '../config/_kit.yml?raw'

export const appKitConfig = resolveKitConfig(parse(rawKitConfig) ?? {})
```

`resolveKitConfig()` 同时解析 `server` （host/port）与 `transport`；host/port 优先级为 `HOST` / `PORT` 环境变量 > `_kit.yml` 的 `server` > 默认 `127.0.0.1:3000`，供 SvelteKit 服务器入口统一消费（与 `@h-ai/serv` 同构）。
如只在服务端读取配置，也可配合 `core.config.validate('kit', KitConfigSchema)` 使用。
由于浏览器端也可能读取这份配置，`_kit.yml` 只应放公开的 server/transport 路径与开关，不要写入密钥。

### 配置

`kit.createHandle()` 配置项：

| 字段         | 类型                                     | 说明                                                              |
| ------------ | ---------------------------------------- | ----------------------------------------------------------------- |
| `auth`       | `HandleAuthConfig`                       | 认证配置（verifyToken / protectedPaths / publicPaths / loginUrl） |
| `rateLimit`  | `object \| false`                        | 速率限制（windowMs / maxRequests）                                |
| `logging`    | `boolean \| object`                      | 请求日志（默认 `true`，`{ logBody: true }` 记录请求体）           |
| `crypto`     | `HookCryptoConfig`                       | 传输加密 + Cookie 加密                                            |
| `guards`     | `GuardConfig[]`                          | 自定义守卫（在 auth 自动守卫之后执行）                            |
| `middleware` | `Middleware[]`                           | 自定义中间件（在内置中间件之后执行）                              |
| `a2a`        | `HandleA2AOperations \| HandleA2AConfig` | A2A 协议集成（Agent Card + JSON-RPC）                             |
| `onError`    | `function`                               | 自定义错误处理                                                    |

配置 `crypto.encryptedCookies` 时必须同时提供 `crypto.cookieEncryptionKey`，或设置 `HAI_KIT_COOKIE_KEY`。缺少密钥会在 `createHandle()` 时立即报错；受保护 Cookie 的明文、损坏密文或解密失败都按不存在处理，加密失败也不会回退写入明文。

认证 Cookie 的 `Secure` 默认值在 `NODE_ENV` 或 `HAI_CORE_ENV` 为 `production` 时开启，`HAI_E2E` / `HAI_E2E_MOCK` 不降低 Cookie 安全要求。生产限流同样识别这两个环境标志；仅显式测试开关可放宽内存计数器限制。

### 导出路径

子模块运行时方法通过 `kit` 命名空间或明确子路径使用，类型单独导出；浏览器声明不暴露服务端工厂。Vite 配置使用 `@sveltejs/kit/vite`，不存在 `@h-ai/kit/vite` 插件。

- `@h-ai/kit`：主入口，提供 `kit` 命名空间与类型。
- `@h-ai/kit/client`：浏览器端客户端。
- `@h-ai/kit/adapter`：双构建 adapter（`createAdapter()`）。
- `@h-ai/kit/a2a`：A2A 协议集成。
- `@h-ai/kit/crypto`：加密模块集成。

### 配置驱动认证页面

密码登录只提交 `identifier` 和 `password`；`AuthPanel` 将 `LoginForm` 的 `username` 映射为 `identifier`。会话有效期由服务端 `session.maxAge` / `session.refreshTokenMaxAge` 配置决定，登录表单不提供按次登录的持久会话选项。

协议支持配置中的 userAgreementMarkdown/privacyPolicyMarkdown 正文及 URL；同主题优先 Markdown，由安全渲染器在弹窗显示。

路由直接导出 `kit.auth.createApi(iam)` 的 login、loginWithOtp、loginWithLdap、register、publicConfig、sendOtp、requestPasswordReset、confirmPasswordReset handler；自动执行 schema 验证、Cookie 设置和 HaiResult 映射。匿名白名单使用 `kit.auth.publicPaths`，不会放开 /me 和改密端点。浏览器用 `kit.client.createAuthActions({ apiFetch })` 直接连接 AuthPanel，复用 CSRF/transport。

[完整 IAM 配置 / IAM configuration](../iam/README.md)

`kit.auth.logout(cookies, accessToken)` 返回 `Promise<HaiResult<void>>`。无令牌时仅清除 Cookie 并成功；有令牌但未配置认证操作时返回失败。无论服务端结果如何都清除本地 Cookie，调用方仍必须把失败转换为错误响应或提示；仅成功结果代表服务端撤销已经确认。底层控制流异常继续传播。

### 错误处理

- 推荐使用 `kit.handler()` 包装 API 端点。
- `kit.validate.body` / `kit.guard.require` 会抛出 `Response`（SvelteKit 控制流）。
- 非控制流异常会由 `kit.handler()` 统一转换为 `500 INTERNAL_ERROR` 响应。

### CRUD fields

声明式 CRUD 字段支持 `colSpan: 'auto' | 1 | 2`，供 UI 双列表单决定字段宽度；`validation.message` 支持字符串或 `() => string`，便于随当前语言显示校验错误。UI 布局在 `CrudPage.form` 上配置，服务端仍须独立校验。

### 请求语言隔离

Node 请求与 SSR 使用 `core.i18n.runWithLocale(locale, () => handleRequest())`；SvelteKit 可使用 `kit.i18n.runWithLocale(locale, () => resolve(event))`，serv 自动按请求头建立上下文。异步子任务继承请求语言，优先级为显式 `MessageOptions.locale`、请求语言、进程启动默认语言。`setGlobalLocale` 在请求上下文中只更新当前请求；上下文外仅用于启动默认值，不能在请求 hook 中调用它修改默认值。

浏览器继续使用应用级 `setGlobalLocale` / `createLocaleStore`。SSR 的 UI store 初始化和 setter 只修改自身状态，不写全局语言；UI 消息从请求上下文读取。`runWithLocale` 仅支持 Node 入口，浏览器通过显式 locale 或应用状态翻译。

## 开发测试

```bash
pnpm --filter @h-ai/kit test
```

模块无统一 init/close；共享缓存、IAM 与 crypto 由应用启动时初始化并统一关闭。示例使用真实公开入口并作类型检查，见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)。请求认证必须调用 iam.auth.verifyToken，不能把非空 token 视为有效身份。

## 反馈接口与普通请求关联

`kit.createFeedbackHandler` 可作为 `/api/feedback/[...path]/+server.ts` 的 GET/POST/PATCH handler，复用 api-contract schema，与 serv 使用同一数据契约；输入流受大小上限约束，客户端身份/租户字段被拒绝。宿主通过 resolveContext 从已经验证的 locals.session 映射范围和权限，null 拒绝访问，并保留现有 createHandle 的 CSRF、认证与传输加密。

createHandle 保留有效且有界的入站 X-Request-Id，补写响应头，并为异步业务传递请求 ID 和已验证用户。需要收集普通业务后端日志时，在宿主 middleware 中以 `core.context.run({ scopeId: 'configured-product' }, next)` 包住实际业务；该可信范围应与反馈接口一致，不能从客户端头推导。

```ts
import type { SessionData } from '@h-ai/kit'
import { feedback } from '@h-ai/feedback'
import { kit } from '@h-ai/kit'

const handler = kit.createFeedbackHandler({
  feedback,
  resolveContext: (event) => {
    const session = (event.locals as { session?: SessionData }).session
    return session
      ? { scopeId: 'configured-product', userId: session.userId, permissions: session.permissions }
      : null
  },
})
export const GET = handler
export const POST = handler
export const PATCH = handler
```

## 许可证

Apache-2.0
