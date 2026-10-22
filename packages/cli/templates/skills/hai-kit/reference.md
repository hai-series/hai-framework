# hai-kit 参考

> `@h-ai/kit` 只负责 SvelteKit 集成：`handle` hook、guard、response、validate、client、auth、crud、A2A。公共跨端 HTTP API 契约统一使用 `@h-ai/api-contract` + `@h-ai/serv`，不要在 kit 中定义业务 API contract。

## 使用步骤

### 1. 请求管道

```ts
import type { Handle } from '@sveltejs/kit'
import { cache } from '@h-ai/cache'
import { kit } from '@h-ai/kit'

const haiHandle = kit.createHandle({
  auth: {
    verifyToken: async token => token ? { userId: 'u_1', roles: ['admin'], permissions: ['user:read'] } : null,
    loginUrl: '/auth/login',
    protectedPaths: ['/admin/*'],
  },
  rateLimit: { windowMs: 60_000, maxRequests: 100, store: kit.middleware.createCacheRateLimitStore(cache, { namespace: 'app' }) },
  logging: true,
})

export const handle: Handle = haiHandle
```

限流采用首次成功提交为起点的固定窗口，后续请求不延长 TTL。必须显式传 store；应用先检查共享 Redis 初始化结果，所有节点使用相同 namespace/windowMs/maxRequests。缓存读取/条件提交失败或冲突耗尽返回503，超限429；不会回退 get+set 或本地计数。createMemoryRateLimitStore 仅开发或显式 HAI_E2E/HAI_E2E_MOCK 测试使用，创建者在结束时 stopCleanup；生产不得设置测试开关。响应重置时间为节点时钟估算，实际窗口由 Redis TTL 决定，须同步时钟。默认键只读取可信 adapter 的 getClientAddress、规范化等价IPv6和IPv4映射地址，不采信原始转发头；代理信任通过部署adapter配置。

### 2. SvelteKit API endpoint

```ts
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const CreateUserSchema = z.object({ name: z.string().min(1) })

export const POST = kit.handler(async ({ request, locals }) => {
  kit.guard.require(locals.session, 'user:create')
  const payload = await kit.validate.body(request, CreateUserSchema)
  return kit.response.created(payload)
})
```

### 3. 浏览器同源请求

```ts
import { kit } from '@h-ai/kit'

const client = kit.client.create()
export const { apiFetch } = client
```

> 同源 endpoint 使用 httpOnly Cookie；`auth: true` 只读取 `kit.auth.setBrowserToken()` 写入的页面内存 Token。自定义 `BrowserTokenStore` 也须使用内存或平台安全存储，禁止把敏感凭据持久化到 Web Storage。

### 4. 同源传输加密

kit 不再维护本地传输加密实现；服务端和客户端都统一委托 `@h-ai/crypto` 的 `crypto.transport`。

```ts
// hooks.server.ts
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
    publicPaths: ['/api/_hai/*'],
  },
  crypto: {
    crypto,
    transport: {
      serverKeyRing,
      requireEncryption: true,
      keyStore: createRedisTransportKeyStore({ cache, ttlSeconds: 3600 }),
    },
  },
})
```

需要保护会话 Cookie 时配置 `crypto.encryptedCookies`，并通过 `crypto.cookieEncryptionKey` 或 `HAI_KIT_COOKIE_KEY` 提供密钥。缺少密钥会在 `createHandle()` 时失败；加解密错误不会回退到明文 Cookie。

```ts
// routes/+layout.svelte
<script lang='ts'>
  import { browser } from '$app/environment'
  import { crypto } from '@h-ai/crypto'
  import { kit } from '@h-ai/kit'
  import { appKitConfig } from '$lib/config/kit-config'

  // 一次性安装：内部按 appKitConfig.transport 是否启用决定行为，并预热 crypto
  if (browser) {
    kit.client.installBrowserTransport(appKitConfig, { crypto })
  }
</script>
```

```ts
// lib/utils/api.ts —— 业务层只看到 apiFetch
import { kit } from '@h-ai/kit'

export const { apiFetch } = kit.client.create()
```

默认协商端点：`/api/_hai/key-exchange`。如 `keyExchangePath` 自定义，浏览器端同步设置 `keyExchangeUrl`。

启用 transport 使用 `{ serverKeyRing, keyStore, ...公开路径配置 }`，两项必填，不再接受单独的 true。serverKeyRing 通过服务端 Secret/私有 `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` 安全解析，不放 `_kit.yml`、PUBLIC_/VITE_ 或日志；浏览器仅需公开 transport 配置和 crypto。各节点使用同一版本化 ring 与共享 Redis/数据库 registry；仅共享客户端公钥不够。请求带协商 serverKeyId，无需 sticky session；轮换先分发新旧 ring，再切 activeKeyId 重建 manager，删除旧 ID 后客户端 destroy 并重协商。开发/测试须显式选择内存 registry；原公开 maxClients 已删除。完整轮换步骤见 hai-crypto。

transport 默认保护同源 `/api/*` endpoint 与 SvelteKit `__data.json` 页面数据请求；页面文档、静态资源与 `multipart/form-data` 上传请求保持明文透传。

安全策略默认 fail-closed：`requireEncryption: true` 时，受保护路径缺少 `X-Client-Id` 必须返回 400；服务端 transport 管理器不可用、响应体无法加密或超过单次加密上限时返回错误，禁止明文业务响应回退。`requireEncryption: false` 只适合迁移期灰度。

受保护请求按实际正文判空：省略 Content-Type/Content-Length、使用 chunked 或伪造 Content-Length=0 均不能让非空明文跳过加密标记验证。真正没有正文或实际零字节流的无 input POST 可以继续；响应是否为空也不信任 Content-Length=0，非空业务响应仍须加密。

与 serv/客户端共享 `@h-ai/crypto` 根入口的 `TRANSPORT_BODY_LIMITS` / `readTransportBody`：握手 JSON 16 KiB、公钥 4 KiB、明文 1 MiB、密文 JSON 2 MiB + 4 KiB，按 UTF-8 字节计数。原始流逐块检查，超限/取消停止并取消流、释放 reader，不 clone/tee 后完整缓冲。请求超限返回 413，响应超限返回 500，无效公钥返回 400；重建 Request 保留 signal，重建正文清除旧 Content-Length/Content-Encoding。固定协议预算不写入 `_kit.yml` 或环境变量。

### 5. 使用 `_kit.yml` 统一 transport 配置

`@h-ai/kit` 现在提供 `KitConfigSchema` / `resolveKitConfig()`，适合同一份 `_kit.yml`
同时驱动 `hooks.server.ts` 与浏览器端 `kit.client.installBrowserTransport()`：

```yml
server:
  host: 127.0.0.1
  port: 3000

transport:
  keyExchangePath: /api/_hai/key-exchange
  requireEncryption: true
  encryptResponse: true
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

`resolveKitConfig()` 同时解析 `server`（host/port）与 `transport`；host/port 优先级为 `HOST` / `PORT` 环境变量 > `_kit.yml` 的 `server` > 默认 `127.0.0.1:3000`（与 `@h-ai/serv` 同构）。
`_kit.yml` 只放公开的 server/transport 路径/开关，不放密钥；如自定义 `keyExchangePath`，浏览器端必须同步映射为 `keyExchangeUrl`。

## 核心 API

| API | 用途 |
| --- | --- |
| `kit.createHandle()` | 创建 SvelteKit Handle |
| `kit.sequence()` | 组合多个 Handle |
| `kit.handler()` | API endpoint 错误边界 |
| `kit.guard.require()` | 权限守卫 |
| `kit.response.*` | 统一响应工厂 |
| `kit.validate.*` | Zod 请求校验 |
| `kit.auth.*` | Cookie / Token 辅助 |
| `kit.client.create()` | 浏览器端同源 apiFetch |
| `kit.client.installBrowserTransport(config, { crypto })` | 推荐入口：按解析后的 `_kit.yml` 一键安装浏览器端传输加密 |
| `kit.client.installBrowserTransportFetch()` | 底层入口：直接传 transport 配置安装浏览器全局 fetch 包装 |
| `kit.crud.define()` | 声明式 CRUD 资源 |

## 常见模式

- SvelteKit 应用内同源请求用 `kit.client.create().apiFetch`。
- SvelteKit 应用启用 transport 时，在 `+layout.svelte` 的 `if (browser)` 分支调用一次 `kit.client.installBrowserTransport(appKitConfig, { crypto })`，无需重复连线 `keyExchangeUrl` / `excludePaths`。
- Web/App/小程序跨域访问公共 API 用 `@h-ai/api-client` typed client。
- 传输加密只通过 `crypto.transport` 间接装配，不在 kit 中新增本地加密工厂或鸭子类型。
- 服务端业务模块直接调用模块 API，不通过 HTTP 自环。
- API endpoint 必须用 Zod 校验用户输入，并设置认证/权限边界。

## 声明式 CRUD 表单字段

`kit.crud.define` 的字段支持 `colSpan: 'auto' | 1 | 2`，以及 `validation.message: string | (() => string)`。布局通过 UI 的 `CrudPage.form` 配置；客户端校验用于交互提示，服务端仍使用 Zod 验证和现有权限守卫。UI 公共契约见相邻 [hai-ui skill](../hai-ui/SKILL.md)。

Node 请求/SSR 必须用 `core.i18n.runWithLocale(locale, callback)`（kit 同名方法）包裹实际异步 resolve；serv 自动建立请求语言上下文。浏览器 setGlobalLocale/createLocaleStore 继续管理应用语言，SSR 的 UI setter/store 不写全局值。显式 MessageOptions.locale 优先；进程默认语言仅在启动时设置。
