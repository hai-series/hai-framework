# @h-ai/kit 功能说明

[English](kit.en.md) · [日本語](kit.ja.md)

在 SvelteKit 中使用 `kit` 组合处理请求的 hooks、编写 API 路由和创建同源 HTTP 客户端。根入口会按服务端或浏览器选择可用功能。需要 Node 部署适配器、传输加密中间件或 A2A 接入时，见下文对应的导入路径。

SvelteKit 的服务端和浏览器代码都可以导入 `kit`。请求校验和访问控制由服务端执行。浏览器可以创建同源客户端和绑定登录表单的操作。

[模块 README](../../../packages/kit/README.md) · [配置清单](../configuration/kit.md) · [数据结构](../data/kit.md) · [前后端接入](../development/frontend-backend.md)

<a id="module-dependencies"></a>

## 依赖

| 依赖 | 用途 | 何时需要 | 接入顺序 |
| --- | --- | --- | --- |
| `svelte`、`@sveltejs/kit` | 提供组件和请求 Hook 宿主 | 接入 Kit 时必需 | 先准备 Svelte 5 项目，再注册 Hook 和路由 |
| `@sveltejs/adapter-node` 或 `@sveltejs/adapter-static` | 生成 Node 服务或静态站点 | 按部署方式选择 | 安装所选适配器后再构建。使用 Node SSR 时，在应用生产依赖中保留 `sm-crypto@0.5.8` |
| `vite`、`@sveltejs/vite-plugin-svelte` | 构建 SvelteKit 应用并预处理组件 | 使用下面的 Vite 接入示例时。应用使用 Tailwind 时引入 `@tailwindcss/vite` | 安装构建依赖后配置 Vite 和 SvelteKit，再构建应用 |
| `@h-ai/core`、`@h-ai/api-contract` | 提供请求工具、结果类型和接口契约 | 随 Kit 安装 | 契约可直接使用。由应用负责加载 Core 配置 |
| `zod` | 编写路由输入校验规则 | 随 Kit 安装。应用手动编写 Schema 时可直接导入 | 定义 Schema 后传给 `kit.validate` 的对应方法 |
| `@h-ai/iam` | 验证会话和 A2A API Key | 随 Kit 安装。使用 IAM 验证时需要初始化 | 先调用 `iam.init()`，再接入 IAM 会话验证器或 `kit.a2a.createApiKeyAuthenticator()` |
| `@h-ai/crypto` | 加密指定 Cookie 和 HTTP 正文 | 随 Kit 安装。启用加密时需要初始化 | 初始化 Crypto 并准备相应密钥，再调用 `kit.createHandle()`。传输加密还需密钥环和共享登记存储 |
| `@h-ai/audit` | 记录由 Hook 捕获的审计事件 | 随 Kit 安装。应用启用审计时需要初始化 | 开始处理请求前初始化 Audit 并设置 `capture` |
| `@h-ai/cache` 与 Redis | 提供共享的原子限流计数 | 使用内置 Redis 限流存储适配器时需要 | 先连接 Redis，再用 `kit.middleware.createCacheRateLimitStore()` 创建存储并传给 Hook |
| `@h-ai/feedback` | 处理反馈 REST 路由 | 使用 `kit.createFeedbackHandler()` 时需要 | 初始化 Feedback，再将服务和可信上下文解析函数传给处理器 |

<a id="quick-start"></a>

## 最小接入示例

### 安装

```bash
npm install @h-ai/kit @h-ai/core sm-crypto@0.5.8
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/adapter-node @sveltejs/vite-plugin-svelte vite tailwindcss @tailwindcss/vite
```

### 项目配置

`vite.config.ts` 注册插件：

```ts
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  ssr: { noExternal: ['@h-ai/ui', '@h-ai/kit'], external: ['@h-ai/core', 'sm-crypto'] },
})
```

`svelte.config.js` 配置 Node 适配器、预处理器和路径：

```js
import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
  preprocess: vitePreprocess(),
  compilerOptions: { runes: true },
  kit: { adapter: adapter(), paths: { base: '', relative: false } },
}
```

使用 Crypto 或依赖它的 Kit/IAM 时，应用生产依赖需包含 `sm-crypto@0.5.8`。CLI 已配好这一项；手工接入时运行 `pnpm add sm-crypto@0.5.8`。仅设置 external 不够，adapter-node 还需要这项直接依赖声明才能保留原包加载。

<a id="api-reference"></a>

## 功能说明

<a id="hooks"></a>

### 组装 SvelteKit 请求管道：`kit`

把认证、访问检查、限流和语言处理装进 Hook；业务失败在 handler 边界映射为安全 HTTP 响应。

`sequence` 保留并组合 SvelteKit 的 `resolve` 选项：页面转换由内向外执行，`preload` 与序列化响应头过滤使用首个配置，确保 i18n 的 HTML 语言标记正确替换。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `kit.createHandle(config?)` | 请求管道 | 可省略的 `config`，包括认证、日志、中间件与访问策略。见 [Hook 参数](#host-options)。 | `SvelteKit Handle` | `kit.createHandle({ logging: true })` |
| `kit.sequence(...handles)` | 组合 Hook | `handles` 为按执行顺序传入的零个或多个 SvelteKit `Handle`。 | `Handle preserving resolve options` | `kit.sequence(i18nHandle, authHandle)` |
| `kit.handler(fn)` | 端点异常边界 | 必填 `fn(event)`，输入 SvelteKit 请求事件，返回同步或异步 `Response`。 | `SvelteKit request handler` | `kit.handler(async () => kit.response.ok({ ready: true }))` |
| `kit.middleware.rateLimit(config)` | 固定窗口限流 | `config` 必填。`windowMs` 为 1–2147483647 毫秒的整数，`maxRequests` 为正安全整数，`store` 提供原子计数。可选 `keyGenerator(event)` 默认按可信地址，`onLimitReached(event)` 默认 429。 | 中间件。存储故障返回 503 | `kit.middleware.rateLimit({ windowMs: 60000, maxRequests: 100, store })` |
| `kit.middleware.createCacheRateLimitStore(backend, options)` | 共享计数器 | 必填初始化后的 Redis `backend` 与 `options.namespace`（1–128 字符）。`allowMemory` 默认关闭，显式启用也仅在开发或测试生效。 | `RateLimitStore` | `kit.middleware.createCacheRateLimitStore(cache, { namespace: "orders" })` |
| `kit.middleware.createMemoryRateLimitStore()` | 开发计数器 | `none; development or explicit test only` | `MemoryRateLimitStore` | `kit.middleware.createMemoryRateLimitStore()` |
| `kit.i18n.setLocale(locale)` | 启动默认语言 | 必填 `locale` 设置启动阶段的默认语言，例如 `zh-CN`。 | `void; do not change process default per request` | `kit.i18n.setLocale("zh-CN")` |
| `kit.i18n.runWithLocale(locale, operation)` | 请求语言隔离 | 必填请求 `locale` 和保留返回值的 `operation` 回调，只用于 Node 服务端。 | `same callback return value` | `kit.i18n.runWithLocale("en-US", () => resolve(event))` |

##### 选择服务端与浏览器入口

子模块运行时方法通过 `kit` 命名空间或明确子路径使用，类型单独导出；浏览器声明不暴露服务端工厂。Vite 配置使用 `@sveltejs/kit/vite`，不存在 `@h-ai/kit/vite` 插件。

- `@h-ai/kit`：主入口，提供 `kit` 命名空间与类型。
- `@h-ai/kit/client`：浏览器端客户端。
- `@h-ai/kit/adapter`：双构建 adapter（`kit.adapter.create()`）。
- `@h-ai/kit/a2a`：A2A 协议集成。
- `@h-ai/kit/crypto`：加密模块集成。

<a id="host-options"></a>

##### Hook 参数与业务 Cookie 加密

在服务端代码中调用 `kit.createHandle()` 时传这些参数。地址等设置可以来自 `_kit.yml`，函数、私钥和已初始化的存储对象由服务端代码提供。

| 参数 | 默认与用途 | 输入改变后的结果和限制 |
| --- | --- | --- |
| `auth.verifyToken` / `operations` | auth 省略时不自动认证；提供 auth 时 verifyToken 必填 | 校验 Bearer/Cookie 并得到会话；operations 可用 `() => iam.auth` 延迟取已初始化实例 |
| `auth.cookieName` / `protectedPaths` / `publicPaths` / `loginUrl` | Cookie名 `hai_access_token`，路径由应用明确配置 | publicPaths 优先；匿名API返回401，页面按 loginUrl 跳转。路径含实际挂载目录 |
| `guards[].guard/paths/exclude` | 可省略，exclude 优先于 paths | auth 自动守卫之后检查业务权限；返回 allowed 不代替资源所有权校验 |
| `rateLimit` | 省略或 false 不启用；对象内 windowMs=60000、maxRequests=100 | 必须提供原子 `store`；超过每窗次数时拒绝。keyGenerator 选择稳定限流主体，onLimitReached 可返回安全响应 |
| `logging` / `logging.logBody` | 默认 true；logBody 默认不启用 | 请求日志用于关联诊断。正文可能有凭据和业务隐私，开启前明确脱敏与采集必要性 |
| `middleware` / `onError` | 可选；默认错误为安全500响应 | 自定义中间件在内置日志/限流之后；自定义异常响应同样不能泄露堆栈、SQL和密钥 |
| `crypto.encryptedCookies` / `cookieEncryptionKey` | 未列Cookie不加密；密钥可从 `HAI_KIT_COOKIE_KEY` 读取 | 指定Cookie保存为认证加密格式 `enc:v2`，读取时先验真；密钥必须为32个十六进制字符，缺失/非法时创建Handle失败 |
| `a2a.operations` / `cardPath` / `rpcPath` / `authenticate` | 显式接入；路径默认 `/.well-known/agent-card.json` 与 `/a2a` | 挂载Agent Card及协议入口；未提供authenticate即匿名，生产按实际需求提供apiKey或认证回调；不自动获得业务权限 |

例如只给业务偏好 Cookie 启用加密：

```ts
import { crypto } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

// Initialize crypto with defaults before building cookie middleware. Failure throws and stops hook setup.
const ready = await crypto.init()
if (!ready.success) throw new Error(ready.error.message)
// Build a request hook that uses the ready crypto instance to protect order_preferences. The installed hook uses the server cookie key.
const handle = kit.createHandle({
  crypto: { crypto, encryptedCookies: ['order_preferences'] },
})
// 从 hooks.server.ts 导出 handle，先在服务端环境设置 HAI_KIT_COOKIE_KEY。
```

应用向 `order_preferences` Cookie 写入文本后，浏览器保存密文，服务端读取时解密为原文本。验证时可修改 Cookie 的加密值，确认服务端拒绝读取。示例只开启 Cookie 加密，可把这段设置合并到已有的请求处理函数中。密钥留在服务端。

#### 场景：组装 SvelteKit 请求管道

下文从 createHandle 开始，用 sequence 组合，限流 store 由应用初始化的 Cache 提供。普通超限返回 429，存储故障返回 503；语言回调保留原返回值，不能为并发请求改全局默认语言。

表中的调用片段使用各节示例已经打开的服务或建立的对象。示例变量由应用提供，例如当前 HTTP 请求、用于校验输入的 Schema、资源定义或配置。返回 Promise 时用 `await` 等待。返回 `HaiResult` 时先判断 `success`，再读取数据或错误。

- Handle Hook 组合（`createHandle` / `sequence`）
- 认证/角色/权限守卫（`guard.require` / `guard.check`）
- 内置 Logging / RateLimit / CORS 中间件（通过 `createHandle` 配置启用）
- 统一 API 响应与请求验证（Zod）
- Bearer Token 工具（服务端 login/logout + 浏览器端 Token 存储）
- 浏览器端统一客户端（自动 CSRF，支持传输加密）
- 声明式 CRUD 资源定义（`crud.define`）
- A2A 协议集成：默认发现路径 `/.well-known/agent-card.json`；配置 `authenticate` 后 null/undefined 返回 401，仅未配置认证时允许匿名。API Key 参数从完整 Agent Card 的 `securitySchemes.apiKey` 读取。Hook 与显式 A2A 路由共享 JSON-RPC 解析错误和 SSE 取消清理逻辑。
- 双构建模式（`kit.adapter.create()`）

<a id="detailed-workflow"></a>

#### 场景：把认证与共享限流装入 Hook

应用部署在 `/yyy/` 等子目录时，SvelteKit 的 `paths.base` 与守卫使用的实际 URL 应保持一致：配置 `paths.relative: false`，从 `$app/paths` 的 `resolve('/').replace(/\/$/, '')` 得到挂载路径后拼接到 `protectedPaths`、`publicPaths` 和 `loginUrl`，例如 `${base}/api/*`。认证页面使用 ``kit.client.createAuthActions({ basePath: `${base}/api/auth` })``。Kit 根据应用路由识别 `/api/*`，包括路由分组和挂载前缀；未认证的 API 返回 401，页面按配置跳转登录。生成模板已处理这些路径。

以下 Hook 片段假设应用已完成数据库、共享缓存和 IAM 初始化，并检查每项初始化结果。关闭资源由应用统一负责；不在每个请求中初始化模块。

**src/hooks.server.ts**：

```typescript
import type { Handle } from '@sveltejs/kit/hooks'
import { cache } from '@h-ai/cache'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

// Build the SvelteKit request hook from the auth, rate limit, and logging settings below. Export the resulting Handle.
const haiHandle = kit.createHandle({
  auth: {
    verifyToken: async (token) => {
      // Verify the token received by the request hook. Success yields session claims. An invalid token maps to no session.
      const verified = await iam.auth.verifyToken(token)
      if (!verified.success)
        return null
      const { userId, username, roles, permissions } = verified.data
      return { userId, username, roles, permissions }
    },
    loginUrl: '/auth/login',
    protectedPaths: ['/admin/*', '/api/*'],
    publicPaths: ['/api/auth/*', '/api/public/*'],
  },
  rateLimit: {
    windowMs: 60_000,
    maxRequests: 100,
    // Use the active cache and app namespace for rate-limit counts. The returned store shares the counters across application nodes.
    store: kit.middleware.createCacheRateLimitStore(cache, { namespace: 'app' })
  },
  logging: true,
})

export const handle: Handle = haiHandle
```

限流采用首次成功提交为起点的固定窗口，后续请求不延长 TTL。必须显式传 store；应用先检查共享 Redis 初始化结果，所有节点使用相同 namespace/windowMs/maxRequests。缓存读取/条件提交失败或冲突耗尽返回503，超限429；不会回退 get+set 或本地计数。createMemoryRateLimitStore 仅开发或显式 HAI_E2E/HAI_E2E_MOCK 测试使用，无常驻定时器，丢弃引用即可回收；每次请求最多惰性扫描 64 项，最多保存 10000 个窗口，容量满时对新 key 返回503且不驱逐有效计数，外部 store 生命周期由创建者管理；生产不得设置测试开关。响应重置时间为节点时钟估算，实际窗口由 Redis TTL 决定，须同步时钟。默认键只读取可信 adapter 的 getClientAddress、规范化等价IPv6和IPv4映射地址，不采信原始转发头；代理信任通过部署adapter配置。

#### 场景：隔离同时到达请求的语言

多位用户的请求可能同时在一个 Node.js 进程里执行。用 `core.i18n.runWithLocale(locale, () => handleRequest())` 为本次请求和它启动的异步工作设定语言。SvelteKit 可以用 `kit.i18n.runWithLocale(locale, () => resolve(event))`，Serv 会按请求头自动设定。翻译优先使用显式传入的 `MessageOptions.locale`，其次使用本次请求的语言，最后使用进程启动时的默认语言。

设定请求语言后，`ui.setGlobalLocale()` 只改本次请求。启动时在请求之外调用它，可设置进程默认语言。服务端渲染时，UI 的语言状态对象只更新自己，翻译读取本次请求的语言。浏览器中从 `@h-ai/ui/i18n` 导入 `ui.createLocaleStore()` 管理当前页面语言，或在翻译时直接传入 `locale`。

#### 场景：按实际路径执行访问策略

路径规则的 `encryption` 可以填 `required` 或 `disabled`，省略时沿用应用的传输加密配置。设为 `disabled` 时，服务端按普通 HTTPS 正文处理，仍检查 IP、时段和身份，收到框架加密数据会拒绝。设为 `required` 时优先于 `excludePaths`，没有启用 Crypto、服务端密钥环和共享密钥登记存储就无法创建 Handle。相互冲突的路径规则也会使创建失败。CLI 的 Crypto 模板已配置两端。浏览器只需要知道哪些路由走普通请求，代理地址和完整访问规则保留在服务端。

将服务端 `_kit.yml` 的 `trustedProxies` 和 `access` 显式传给 `kit.createHandle`。示例和生成模板在应用初始化后只创建一次 Handle。`access` 默认为 `false`；内联 `{ rules: [{ id: 'external', paths: ['/api/v1/external/**'], allowIps: ['192.0.2.0/24'] }] }` 只限制匹配接口，`global` 则限制应用 Handle 处理的全部请求。实际路径包含部署前缀；静态服务器直接返回的资源不经过 Handle。

独立文件使用 `access: { file: './config/security/request-access.yml' }`，按工作目录解析，启动读取一次，最大 1 MiB，修改后重建 Handle。全局与所有匹配规则取交集，空列表不限对应维度，时区默认 UTC。时间窗口结束后，已有会话的后续请求同样被拒绝。预检和密钥交换也执行策略；普通 transport 请求的 HTTP 403 / `hai:common:104` 保留响应加密。

`trustedProxies: auto` 在未配置托管代理的应用中不使用转发头；受管 Compose 只有后端私有且存在入口代理时才采用容器网段。自管入口显式指定代理 IP/CIDR，`[]` 可关闭。解析后的 `event.getClientAddress()` 与策略、IAM、审计使用相同地址。外层代理、不可恢复的源地址丢失、环境变量与部署回滚见[请求访问控制手册](../configuration/request-access.md)。

<a id="responses"></a>

### 校验输入并返回响应：`kit.validate`、`kit.response`

共用 HTTP 契约时，在 SvelteKit 的 `+server.ts` 命名导出请求方法。文件路径决定 URL。把共享包导出的 Zod Schema 传给 `kit.validate.body`、`query` 或 `params`，再用 `kit.response` 返回与契约一致的数据。若由 typed client 调用，方法、路径及响应结构须与契约吻合。见[用 Kit 复用契约和 Schema](./api-contract.md#use-with-kit)。

在端点中先解析输入，再按成功、无内容、字段错误或领域失败构造 HTTP 响应。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `kit.response.ok(data, requestId?)` | 成功响应 | 必填成功数据 `data`。可传同一请求的 `requestId`。 | `Response with HTTP 200 and success data` | `kit.response.ok({ id: "o1" })` |
| `kit.response.created(data, requestId?)` | 创建响应 | 必填新建资源的 `data`。可传同一请求的 `requestId`。 | `Response with HTTP 201 and success data` | `kit.response.created({ id: "o1" })` |
| `kit.response.noContent()` | 无正文 | `none` | `Response with HTTP 204` | `kit.response.noContent()` |
| `kit.response.error(code, message, status?, requestId?, details?)` | 指定失败 | 必填错误码 `code` 和公开 `message`。`status` 默认 400。可传 `requestId` 和允许对外展示的 `details`，5xx 不返回详情。 | `safe failure Response` | `kit.response.error("app:orders:001", "请求无效", 400)` |
| `kit.response.badRequest(message, requestId?, details?)` | 无效请求 | 必填公开校验提示 `message`。可传 `requestId` 和允许对外展示的 `details`。 | `HTTP 400 Response` | `kit.response.badRequest("Invalid request")` |
| `kit.response.unauthorized(message?, requestId?)` | 未认证 | 可选公开 `message`，省略时使用框架默认文案。可选 `requestId` 用于关联请求。 | `HTTP 401 Response` | `kit.response.unauthorized()` |
| `kit.response.forbidden(message?, requestId?)` | 无权限 | 可选公开 `message`，省略时使用框架默认文案。可选 `requestId` 用于关联请求。 | `HTTP 403 Response` | `kit.response.forbidden()` |
| `kit.response.notFound(message?, requestId?)` | 未找到 | 可选公开 `message`，省略时使用框架默认文案。可选 `requestId` 用于关联请求。 | `HTTP 404 Response` | `kit.response.notFound()` |
| `kit.response.conflict(message, requestId?)` | 版本冲突 | 必填公开 `message` 说明冲突。可选 `requestId` 用于关联请求。 | `HTTP 409 Response` | `kit.response.conflict("Data changed")` |
| `kit.response.validationError(errors, requestId?)` | 字段校验 | 必填 `errors` 数组，每项 `field` 是字段名，`message` 是公开校验提示。可传 `requestId`。 | `HTTP 422 Response; errors in safe error.cause` | `kit.response.validationError([{ field: "title", message: "请输入标题" }])` |
| `kit.response.internalError(message?, requestId?)` | 内部失败 | 可选安全公开 `message`，省略使用默认 500 文案。可选 `requestId` 用于关联请求。 | `HTTP 500 Response with safe message` | `kit.response.internalError()` |
| `kit.response.redirect(url, status?)` | 重定向 | 必填目标地址字符串 `url`。重定向 `status` 默认 302。 | `redirect Response` | `kit.response.redirect("/auth/login")` |
| `kit.response.fromResult(result, httpStatusMap?, requestId?)` | 映射领域结果 | 必填领域 `result`。可传按错误码覆盖状态的 `httpStatusMap` 和当前 `requestId`。 | `HTTP Response; preserves safe code/status/traceId` | `kit.response.fromResult(result)` |
| `kit.response.fromError(haiError, requestId?)` | 映射领域错误 | 必填 `haiError`。`requestId` 省略时从当前请求关联。 | `safe HTTP failure Response` | `kit.response.fromError(result.error)` |
| `kit.validate.body(request, schema)` | JSON/表单校验 | 必填 HTTP `request` 与验证 JSON 或表单数据的 Zod `schema`。 | `Promise<schema data>; invalid input throws Response` | `kit.validate.body(request, InputSchema)` |
| `kit.validate.query(url, schema)` | 查询校验 | 必填 `url: URL` 与用于解析搜索参数的 Zod `schema`。 | `schema data; invalid input throws Response` | `kit.validate.query(url, QuerySchema)` |
| `kit.validate.params(params, schema)` | 路径参数校验 | 必填 `params`（路径参数字符串映射）与 Zod `schema`。 | `schema data; invalid input throws Response` | `kit.validate.params(params, IdSchema)` |
| `kit.validate.IdParamSchema` | 通用资源编号 | `{ id: string }` | `Zod parsed ID object` | `kit.validate.IdParamSchema.parse({ id: "o1" })` |
| `kit.validate.PaginationQuerySchema` | 分页输入 | `page/pageSize/search query` | `normalized pagination object` | `kit.validate.PaginationQuerySchema.parse({ page: "1" })` |

#### 场景：校验输入并返回响应

```ts
import { core } from '@h-ai/core'
import { z } from 'zod'
const schema = z.object({ title: z.string().min(1) })
const request = new Request('https://app.example.com/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Order' }) })
// Validate the sample JSON POST body with the title schema. On success body is { title: 'Order' }. Invalid JSON or fields fail validation.
const body = await kit.validate.body(request, schema) // { title: 'Order' }
// Parse page=1 from this URL and normalize it with pagination defaults. Invalid query values fail validation.
kit.validate.query(new URL('https://app.example.com/?page=1'), kit.validate.PaginationQuerySchema) // normalized page
// Validate the sample route parameters. id remains o1 and invalid values fail validation.
kit.validate.params({ id: 'o1' }, kit.validate.IdParamSchema) // { id: 'o1' }
// Validate the same id with the schema directly. Returns { id: 'o1' } or throws a Zod error.
kit.validate.IdParamSchema.parse({ id: 'o1' }) // { id: 'o1' }
// Convert the query string page to a numeric page and fill its defaults. An invalid page throws a Zod error.
kit.validate.PaginationQuerySchema.parse({ page: '1' }) // normalized page defaults
// Wrap the validated order body as a successful JSON response with status 200.
kit.response.ok(body).status // 200
// Return a success envelope for the new order o1 with status 201.
kit.response.created({ id: 'o1' }).status // 201
// Return an empty response with status 204.
kit.response.noContent().status // 204
// Return HTTP 400 with the supplied Invalid request message.
kit.response.badRequest('Invalid request').status // 400
// Return the default authentication error envelope with HTTP 401.
kit.response.unauthorized().status // 401
// Return the default permission-denied error envelope with HTTP 403.
kit.response.forbidden().status // 403
// Return the default missing-resource error envelope with HTTP 404.
kit.response.notFound().status // 404
// Use the supplied Data changed message for HTTP 409.
kit.response.conflict('Data changed').status // 409
// Include the supplied title field issue in the HTTP 422 response.
kit.response.validationError([{ field: 'title', message: 'Required' }]).status // 422
// Return the default internal-error envelope with HTTP 500.
kit.response.internalError().status // 500
// Create a redirect response whose Location is /auth/login.
kit.response.redirect('/auth/login').headers.get('location') // '/auth/login'
// Return the supplied app error code and message with HTTP 400.
kit.response.error('app:orders:001', 'Invalid request', 400).status // 400
// Wrap { id: 'o1' } in a successful HaiResult and convert it to HTTP 200. Failed results use their recorded error status.
kit.response.fromResult(core.ok({ id: 'o1' })).status // 200
```

输入为具体 JSON、查询串和路径参数；输出数据及 HTTP 状态写在调用后。validate 无效时抛 Response，应放在 handler 边界内；fromError 的输入使用失败 HaiResult.error，不把内部异常原文公开。

#### 场景：在端点校验输入与执行守卫

先在应用的 `src/app.d.ts` 中声明会话字段。如果生成模板已经声明了 `Locals.session`，沿用现有定义。

```ts
import type { SessionData } from '@h-ai/kit'

declare global {
  namespace App {
    interface Locals {
      session?: SessionData
    }
  }
}
```

请求经过上面的 Kit Hook 后，端点从 `locals.session` 读取已验证的会话。没有 `user:create` 权限时，处理函数不会读入请求正文。

```typescript
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

// Wrap this SvelteKit POST handler so the framework can translate handling errors into HTTP responses.
export const POST = kit.handler(async ({ request, locals }) => {
  // Require user:create in the current session before validation. Missing authentication or permission rejects the request.
  kit.guard.require(locals.session, 'user:create')
  // Validate the request JSON against the create-user fields. Invalid data stops before returning a 201 response.
  const payload = await kit.validate.body(request, CreateUserSchema)
  // Send the validated payload back as a created response with status 201.
  return kit.response.created(payload)
})
```

<a id="auth"></a>

### 认证 Cookie 与路由守卫：`kit.auth`、`kit.guard`

服务端用当前会话检查权限，认证 API 负责凭据与 Cookie；前端显示用的匹配不能替代服务端授权。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `kit.guard.check(session, permission)` | 检查权限 | 必填 `session` 为当前会话，可为 `null`。必填 `permission` 是所需权限标识。 | `boolean` | `kit.guard.check(session, "orders.read")` |
| `kit.guard.require(session, permission)` | 要求权限 | 必填 `session` 为当前会话，可为 `null`。必填 `permission` 是所需权限标识。 | `void; denied access throws Response` | `kit.guard.require(session, "orders.write")` |
| `kit.guard.requireSensitive(iam, event, operation)` | 确认操作用途 | 必填已初始化的 `iam`、当前请求事件 `event` 和服务端登记的操作标识 `operation`。 | `Promise<void>; invalid proof throws Response` | `kit.guard.requireSensitive(iam, event, "orders.approve")` |
| `kit.auth.publicPaths` | 匿名端点名单 | `none` | `string[]; prepend the host base path when needed` | `kit.auth.publicPaths` |
| `kit.auth.createApi(iam)` | 认证 handler 集合 | `iam` 必填，为已初始化并提供认证操作的 IAM 服务实例。 | `RequestHandler map for login/OTP/reset/config/etc.` | `kit.auth.createApi(iam)` |
| `kit.auth.login(cookies, credentials, context?)` | 密码登录 | 必填 `cookies` 与 `credentials`，其中必填 `identifier` 和 `password`。`captcha` 按策略传入，`expectedUserId` 用于恢复同一用户。 可选 `context` 见[认证参数](#kit-auth-context)。 | `Promise<HaiResult<AuthResult>>; writes token cookies on success` | `kit.auth.login(cookies, { identifier: "alice", password })` |
| `kit.auth.loginWithOtp(cookies, credentials, context?)` | 验证码登录 | 必填 `cookies` 与 `credentials`，其中必填 `identifier` 和 `code`。`captcha` 按策略传入，`expectedUserId` 用于恢复同一用户。 可选 `context` 见[认证参数](#kit-auth-context)。 | `Promise<HaiResult<AuthResult>>` | `kit.auth.loginWithOtp(cookies, otpCredentials)` |
| `kit.auth.loginWithLdap(cookies, credentials, context?)` | LDAP 登录 | 必填 `cookies` 与 `credentials`，其中必填 `username` 和 `password`。`captcha` 按策略传入，`expectedUserId` 用于恢复同一用户。 可选 `context` 见[认证参数](#kit-auth-context)。 | `Promise<HaiResult<AuthResult>>` | `kit.auth.loginWithLdap(cookies, ldapCredentials)` |
| `kit.auth.loginWithApiKey(cookies, credentials, context?)` | API Key 登录 | 必填 `cookies` 与 `credentials`，其中必填 `key`。 可选 `context` 见[认证参数](#kit-auth-context)。 | `Promise<HaiResult<AuthResult>>` | `kit.auth.loginWithApiKey(cookies, apiKeyCredentials)` |
| `kit.auth.registerAndLogin(cookies, options, context?)` | 注册并登录 | 必填 `cookies` 与 `options.username`、`options.password`。可选 `context` 和注册字段见[认证参数](#kit-auth-context)。 | `Promise<HaiResult<AuthResult>>` | `kit.auth.registerAndLogin(cookies, registration)` |
| `kit.auth.logout(cookies, accessToken?)` | 显式退出 | `cookies` 是当前 SvelteKit Cookie 写入器。可传本会话的 `accessToken` 让服务端撤销它，省略时仍清理 Cookie。 | `Promise<HaiResult<void>>` | `kit.auth.logout(cookies, accessToken)` |
| `kit.auth.setBrowserToken(token)` | 页面内存凭据 | 必填 `token` 是保存在页面内存的访问令牌字符串。 | `void; no Web Storage persistence` | `kit.auth.setBrowserToken(accessToken)` |
| `kit.auth.clearBrowserToken()` | 清理页面凭据 | `none` | `void` | `kit.auth.clearBrowserToken()` |
| `@h-ai/kit` 的 `kit.matchPermission(required, userPermissions)` | 按通配符匹配前端展示权限 | 必填 `required` 权限代码与可信会话的 `userPermissions` 代码数组。 | `boolean` | `kit.matchPermission('reports:read', ['reports:read'])` |

<a id="kit-auth-context"></a>

#### 认证 context 与注册 options

| 字段 | 默认与条件 | 用途或具体结果 |
| --- | --- | --- |
| `context.terminalType` | 默认 `web` | 按 `web`、`app`、`desktop`、`api` 对会话分类。 |
| `context.ip` / `userAgent` / `requestId` | 均可省略 | 从可信宿主请求取得地址、客户端信息和关联 ID，供 IAM 记录。 |
| `options.username` / `password` | 必填，按 IAM 策略校验 | 指定要注册的用户名和密码。 |
| `options.email` / `phone` / `displayName` / `metadata` / `captcha` | 按注册表单和 IAM 策略传入 | 传入联系方式、显示名、自定义资料或验证码。按公开注册端点的 Schema 选取字段。 |

例如登录传入 `{ terminalType: "desktop", requestId: "req-1" }` 时，成功的会话归类为桌面端，对应记录可使用请求 ID 关联。

#### 场景：认证 Cookie 与路由守卫

下面认证场景输入 cookies、用户表单和真实请求上下文，输出认证结果及 Cookie 变化；守卫 false 表示不足，require 拒绝时抛 HTTP Response。敏感操作还要求本次用途票据。

#### 场景：导出标准认证处理器

密码登录只提交 `identifier` 和 `password`；`AuthPanel` 将 `LoginForm` 的 `username` 映射为 `identifier`。会话有效期由服务端 `session.maxAge` / `session.refreshTokenMaxAge` 配置决定，登录表单不提供按次登录的持久会话选项。

服务端可在认证配置中提供用户协议和隐私政策的 Markdown 正文或 URL。如果正文和 URL 同时存在，登录页面的弹窗优先显示经过安全处理的 Markdown。

路由直接导出 `kit.auth.createApi(iam)` 的 login、loginWithOtp、loginWithLdap、register、publicConfig、sendOtp、requestPasswordReset、confirmPasswordReset handler；自动执行 schema 验证、Cookie 设置和 HaiResult 映射。匿名白名单使用 `kit.auth.publicPaths`，不会放开 /me 和改密端点。浏览器用 `kit.client.createAuthActions({ apiFetch })` 直接连接 AuthPanel，复用 CSRF/transport。

[IAM 配置清单](../configuration/iam.md)

`kit.auth.logout(cookies, accessToken)` 返回 `Promise<HaiResult<void>>`。无令牌时仅清除 Cookie 并成功；有令牌但未配置认证操作时返回失败。无论服务端结果如何都清除本地 Cookie，调用方仍必须把失败转换为错误响应或提示；仅成功结果代表服务端撤销已经确认。底层控制流异常继续传播。

#### 场景：挂载交互挑战入口

将 kit.auth.createApi(iam).createCaptcha 导出为 POST /api/auth/captcha；kit.auth.publicPaths 已包含它。kit.client.createAuthActions() 保留标准交互请求的 captcha 字段，并提供 createCaptcha；AuthPanel 提交时自动求解。匿名首次/过期改密仍须导出 /api/auth/password/renew。服务端 IAM 检查证明，开启策略不会只依赖界面。

何时要求验证、验证失败后如何处理，见 [IAM 配置](../configuration/iam.md)和 [IAM 功能说明](./iam.md)。

#### 场景：会话过期后保留页面输入

配置 `kit.client.create({ recoverSession })` 回调可在服务端明确拒绝会话时原地重新登录并保留页面输入。使用 `@h-ai/ui` 的 `ui.createSessionRecovery` / `SessionRecoveryDialog`：根布局绑定公开配置与原用户，回调设为 `recovery.recover`，弹窗使用标准认证 actions，销毁时 `cancel()`。登录的 `expectedUserId` 由 IAM 限定原主体；常规验证码、锁定、改密和登录限制照常执行。只对明确未认证拒绝的原请求续接一次；取消、5xx、超时和结果不明的网络写入不重放。敏感操作证明绑定旧会话时可能需要再次确认，不复用到新会话。标准认证动作显式禁用自身的恢复重试，避免错误密码递归打开弹窗。自定义认证请求应传第三个参数 `{ recoverSession: false }`。终端分组通过 terminalType（web/app/desktop/api，默认 web）传入；它不是硬件身份认证。

#### 场景：页面离开时尝试关闭会话

`session.endOnPageHide` 默认关闭。开启后，在浏览器页面加载时调用 `actions.bindPageExit({ enabled: config.session.endOnPageHide })`，卸载时执行它返回的函数，移除监听器。标准 admin、H5 和 fullstack 模板已接好此步骤。这里的 `actions` 来自 `apiClient.createAuthActions(...)` 或 SvelteKit 的 `kit.client.createAuthActions(...)`。配置从登录页使用的公开认证接口读取。

浏览器触发 `pagehide` 时会尝试调用 `POST /auth/session/close`。这包括刷新或整页导航，但页面进入往返缓存（BFCache）时会跳过。请求沿用 CSRF 防护和已启用的传输加密，并使用 `keepalive` 争取在页面关闭后完成。该请求不会刷新会话，响应也不会清除 Cookie 或本地凭据，以免较早的请求清掉新的登录状态。

浏览器可能根本没有发出请求。服务端仍需用 `idleTimeout` 或 `absoluteTimeout` 限制会话寿命。用户主动退出时，应正常调用应用的 logout 接口，让服务端撤销凭据，并清除客户端保存的登录状态。

<a id="browser-client"></a>

### 连接同源浏览器：`kit.client`

通过客户端处理同源 Cookie、CSRF 和传输；页面组件只消费动作和结果。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `kit.client.create(config?)` | 同源客户端 | 可省略的 `config`，字段见下表 | `KitClient { apiFetch, init, destroy, ready }` | `kit.client.create()` |
| `kit.client.createAuthActions(options?)` | 标准认证动作 | `options` 可省略。`apiFetch` 默认使用新建的默认客户端，`basePath` 默认 `/api/auth`。 | 与 AuthPanel 兼容的动作对象 | `kit.client.createAuthActions({ basePath: "/api/auth" })` |
| `kit.client.installBrowserTransport(config, deps)` | 按公共配置安装加密 | 必填公开 `config` 与 `deps.crypto`。可选 `deps.basePath` 默认空字符串，表示根目录挂载。 | `void; installs same-origin global fetch wrapper when enabled` | `kit.client.installBrowserTransport(publicKitConfig, { crypto })` |
| `kit.client.installBrowserTransportFetch(transportConfig?)` | 自定义传输安装 | 浏览器可传 `transportConfig`，字段见本节 `transport` 行。省略或在服务端调用时不安装全局 Fetch 包装。 | `void; installs browser global fetch wrapper` | `kit.client.installBrowserTransportFetch(transportOptions)` |
| `@h-ai/kit/client` 的 `kit.client.create(config?)` | 创建同源客户端 | `config` 可省略，字段与 `kit.client.create()` 相同。 | `KitClient` | `kit.client.create({})` |
| `@h-ai/kit/client` 的 `kit.client.createAuthActions(options?)` | 创建同源认证表单动作 | `options` 可省略，字段与 `kit.client.createAuthActions()` 的 `apiFetch`、`basePath` 相同。 | `AuthActions` | `kit.client.createAuthActions({ apiFetch: client.apiFetch })` |
| `@h-ai/kit/client` 的 `kit.client.createSvelteKitNavAdapter()` | 把路由导航连接到 CRUD | `kit.client.createSvelteKitNavAdapter()` | `CrudNavAdapter` | `kit.client.createSvelteKitNavAdapter()` |

#### 场景：连接同源浏览器

下面放在浏览器模块中；/api/ping 是应用已实现的同源接口。输入默认客户端选项，输出 Response；destroy 在使用方卸载时释放会话。authActions/nav 为返回的可供 UI 使用的对象。

| 客户端选项 | 默认或必填条件 | 用途 |
| --- | --- | --- |
| `auth` | 省略或 `false` 不注入访问令牌 | `true` 使用当前页面内存令牌，也可传入与认证动作共用的 `BrowserTokenStore`。 |
| `terminalType` | `'web'` | 可选 `'app'`、`'desktop'`、`'api'`。作为 `X-Hai-Terminal` 传给服务端判断该会话终端组。 |
| `recoverSession` | 省略时不恢复 | 应用提供异步函数，确认已恢复同一用户会话时返回 `true`。收到符合条件的认证失效响应后最多重试一次。 |
| `csrfCookieName`、`csrfHeaderName` | `hai_csrf`、`X-CSRF-Token` | 写请求从指定 Cookie 取值并写入指定请求头。两项均须与服务端约定一致。 |
| `transport` | 省略时不启用 | 启用时传已初始化的 `crypto`。`basePath` 默认空字符串，`keyExchangeUrl` 默认 `/api/_hai/key-exchange`。`excludePaths` 指定不加密的路径，应与服务端一致。`maxPlaintextBytes` 以字节限制本地明文大小，省略时使用服务端协商值。 |

`client.apiFetch(input, init?, options?)` 的 `input` 是请求、URL 或路径，`init` 使用原生 Fetch 的请求选项，包括 `method`、`body` 和 `signal`。第三个参数的 `recoverSession: false` 只关闭本次调用的标准会话恢复，避免认证操作回到自己的恢复回调。可选 `reauthorize` 在需要重新获得操作凭据后重试时调用。返回新凭据字符串可替换请求头中的旧值，`null` 取消重试，`undefined` 继续但不附带该凭据。

```ts
import { kit } from '@h-ai/kit/client'

// Create a browser client with defaults. The returned object has its own request and transport methods.
const client = kit.client.create({}) // same factory as kit.client.create
// 让认证动作使用这个客户端向 /api/auth 下的路由发请求，返回页面可绑定的动作对象。
const actions = kit.client.createAuthActions({ apiFetch: client.apiFetch, basePath: '/api/auth' })
// Create a navigation adapter for the current SvelteKit runtime.
const nav = kit.client.createSvelteKitNavAdapter()
// Initialize this client's transport if enabled. A failed enabled handshake rejects.
await client.init()
try {
  // Fetch /api/ping through the configured client. Inspect the returned HTTP status and handle network rejection as for fetch.
  const response = await client.apiFetch('/api/ping')
  const body: unknown = await response.json() // the application endpoint's JSON
  client.ready // whether an enabled transport session is ready
}
finally {
  // Destroy this client's transport state without changing other clients.
  client.destroy()
}
```

下文工厂返回 client/actions/navAdapter；客户端 init 后可 apiFetch，destroy 释放页面资源。命名导出和 kit.client 对应同一契约，导入路径以公开入口为准。

#### 场景：创建客户端并请求同源接口

`kit.client.create()` 面向 SvelteKit 同源 endpoint；Web / App / 小程序跨域访问公共 API 时，请使用 `@h-ai/api-client`。

```typescript
// src/lib/utils/api.ts — 全应用共享
import { kit } from '@h-ai/kit'

// Create the app's reusable client with defaults. Its apiFetch method is exported below.
const client = kit.client.create()
export const { apiFetch } = client
```

```typescript
// 使用
import { apiFetch } from '#lib/utils/api.js'

// Send GET /api/users using the shared browser client. The result is a Response, so check its status before reading the body.
const response = await apiFetch('/api/users', { method: 'GET' })
```

> CSRF Header 注入由 `apiFetch` 自动处理；`@h-ai/kit` 不提供独立的 CSRF 中间件工厂。
> `apiFetch` 接受字符串、URL 或 Request；Request 自带的方法、请求头与正文会保留，写方法同样附加 CSRF。启用 transport 时仅加密可支持的正文，multipart 上传保持原始边界。
>
> 同源 SvelteKit endpoint 使用 httpOnly Cookie，由服务端读取 Cookie 完成鉴权。浏览器 Bearer Token 使用 `kit.auth.setBrowserToken()` 写入页面内存，再通过 `kit.client.create({ auth: true })` 注入。自定义 `BrowserTokenStore` 也必须使用内存或平台安全存储，禁止将敏感凭据写入 Web Storage。

<a id="crud"></a>

### 声明资源与表单字段：`kit.crud`

用字段与资源操作定义 CRUD，再在每次服务端操作中核对身份和资源归属。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `kit.crud.define(resource)` | 声明 CRUD 资源 | 必填 CRUD `resource` 定义，包括可用操作、路由和字段。 | `resource operation object` | `kit.crud.define(resourceDefinition)` |
| `@h-ai/kit` 的 `kit.crud.define(resource)` | 声明资源与表单字段 | 同 `kit.crud.define()`，必填 `resource` 定义。 | `CrudOperations<T>` | `kit.crud.define(resource)` |
| `@h-ai/kit` 的 `kit.resolveText(text)` | 读取静态或延迟翻译的文案 | 必填 `text` 字符串或返回字符串的无参函数。 | `string` | `kit.resolveText('Name')` |
| `@h-ai/kit` 的 `kit.resolveOptions(options)` | 读取静态或延迟生成的选项 | 必填 `options` 数组或返回该数组的无参函数，每项至少有 `label` 和 `value`。 | `CrudOption[]` | `kit.resolveOptions([{ label: 'Active', value: true }])` |

##### 字段布局与校验文案

声明式 CRUD 字段支持 `colSpan: 'auto' | 1 | 2`，供 UI 双列表单决定字段宽度；`validation.message` 支持字符串或 `() => string`，便于随当前语言显示校验错误。UI 布局在 `CrudPage.form` 上配置，服务端仍须独立校验。

#### 场景：声明资源与表单字段

resource 是应用按 CrudResource 契约提供的字段和已授权 CRUD 回调；两个入口返回相同种类的资源操作对象，不执行数据库写入。下面的选项值 true 是业务值。

```ts
import { kit } from '@h-ai/kit'

function buildResource(resource: Parameters<typeof kit.crud.define>[0]) {
  // Build the operations for the supplied resource declaration.
  const operations = kit.crud.define(resource)
  // Build the equivalent operations through kit.crud using the same declaration.
  const equivalent = kit.crud.define(resource)
  // Evaluate the supplied label function. The resolved label is Name.
  const label = kit.resolveText(() => 'Name') // 'Name'
  // Resolve the supplied Active option with boolean true. This array is returned as the available choices.
  const choices = kit.resolveOptions([{ label: 'Active', value: true }]) // same option array
  return { operations, equivalent, label, choices }
}
```

下面资源定义是输入，输出为 CrudOperations；resolveText 把文字或函数解析为字符串，resolveOptions 得到选项数组。声明不自动授予写入权限。

<a id="transport"></a>

### 装配传输加密：`kit.client` 与中间件

应用先准备 Crypto 和共享 Cache，把相同公共策略交给客户端，把可信 manager 交给服务端。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `@h-ai/kit` 的 `kit.resolveTransportConfig(input?)` | 合并 Kit 传输调用参数 | `input` 为 `false` 或部署层的传输参数。对象字段见[传输参数](#kit-transport-arguments)。 | `false \| KitTransportConfig` | `kit.resolveTransportConfig(false)` |
| `@h-ai/kit/crypto` 的 `kit.crypto.transportEncryptionMiddleware(config, encryption?)` | 创建传输认证中间件 | 必填运行时 `config`。可选 `encryption(pathname, method)` 返回匹配路径的方法级加密策略。见[传输参数](#kit-transport-arguments)。 | `Middleware` | `kit.crypto.transportEncryptionMiddleware(transportConfig)` |

<a id="kit-transport-arguments"></a>

##### 公开 transport 配置与中间件参数

| 字段 | 默认与条件 | 用途或具体结果 |
| --- | --- | --- |
| `input` | 省略或传 `false` 表示关闭 | `kit.resolveTransportConfig` 只解析公开配置。对象形式至少补齐协商路径与排除列表，容量和时间限制交由运行时补齐。 |
| `enabled` / `crypto` / `serverKeyRing` / `keyStore` | 直接创建中间件时必填 | 从宿主传入启用状态、已初始化 Crypto、服务端密钥环与登记存储。生产应选共享存储。 |
| `keyExchangePath` / `excludePaths` / `basePath` | 默认 `/api/_hai/key-exchange`、`[]`、空字符串 | 分别指定协商路由、排除的请求路径和构建挂载目录。只在运行时提供 `basePath`。 |
| `maxPlaintextBytes` / `routePlaintextBytes` | 默认 1 MiB，无路由覆盖。上限值的整数范围为 1 KiB 至 64 MiB。 | 限制正文的 UTF-8 明文字节数，路由映射的 `*` 匹配一个完整路径段。公开设置允许 `"auto"`，运行时直接传数字。 |
| `maxFutureSkewSeconds` / `maxRequestAgeSeconds` | 默认 30 秒（0–1800）与 300 秒（1–3600） | 允许客户端时间领先服务端的秒数，以及从请求签发起的有效秒数。 |

`kit.resolveTransportConfig({ excludePaths: ["/api/health"] })` 返回该排除列表和默认 `keyExchangePath`。

#### 场景：装配传输加密

下面输入传输部分配置，resolveKitTransportConfig 输出 false 或完整选项；中间件输出 SvelteKit 请求处理函数。超限与握手失败保持真实 HTTP 结果，应用负责依赖的生命周期。

#### 场景：同时装配服务端与浏览器加密

下图针对启用 transport 的普通业务路由；握手、A2A、预检和显式明文路径各有专门分支。先计算访问判定，再在传输认证范围内执行普通业务拒绝。

![Kit：加密业务请求怎样经过 Handle](../images/function-kit-request.svg)

访问策略拒绝或会话/守卫不通过时，resolve 不执行。正常响应和传输内产生的错误经 transport 加密后，再完成审计、关联头和安全头。自定义中间件不应读取原始密文当作业务正文；页面参数校验仍由实际端点或 load/action 完成。

kit 的传输加密也统一委托 `@h-ai/crypto`：服务端通过 `crypto.transport.createServer({ serverKeyRing, keyStore })` 创建管理器，浏览器端通过 `kit.client.installBrowserTransport(kitConfig, { crypto })` 一行安装同源 fetch 包装。服务端还须注入受管密钥环和共享 registry。

`paths.relative: false` 使 SvelteKit 生成绝对的应用路径。例如部署到 `/console` 时，在应用中用 `resolve('/').replace(/\/$/, '')`（`resolve` 来自 `$app/paths`）得到 `'/console'`。将 `basePath: base` 同时交给服务端 `crypto.transport` 和浏览器的 `kit.client.installBrowserTransport(kitConfig, { crypto, basePath: base })`。若使用独立客户端，把相同值传给 `kit.client.create()` 的 `transport.basePath`。根目录使用空字符串。这个值由 SvelteKit 构建时设置，无需在 YAML 或请求头重复填写。密钥交换、排除规则和路由字节上限仍使用完整的请求路径。SSR 模板已配置这些值。

**服务端 Hook 装配**：在应用启动时将计算出的 `base` 传给 `createTransportHandle(base)`，再把返回的 Hook 交给 SvelteKit。

```ts
import { cache } from '@h-ai/cache'
import { crypto } from '@h-ai/crypto'
import { iam } from '@h-ai/iam'
import { core } from '@h-ai/core'
import { KitConfigSchema, type KitConfig, kit } from '@h-ai/kit'

export async function createTransportHandle(base: string) {
  // 启动时从应用指定的目录读取并校验 _kit.yml。
  // Load ./config with the supplied Kit schema registered under kit. Invalid configuration stops startup.
  core.init({ configDir: './config', configSchemas: { kit: KitConfigSchema } })
  // Read the parsed Kit config. This throws if the module configuration is missing.
  const appKitConfig = core.config.getOrThrow<KitConfig>('kit')

  // Initialize crypto for the transport hook. A failed result stops setup.
  const cryptoReady = await crypto.init()
  if (!cryptoReady.success)
    throw new Error(cryptoReady.error.message)
  // Parse the supplied server key ring from the environment. Success supplies the current and retained keys. Invalid data stops setup.
  const ring = crypto.transport.parseServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
  if (!ring.success)
    throw new Error(ring.error.message)
  const serverKeyRing = ring.data
  // Redis/IAM 由应用启动流程初始化并检查；此处复用同一实例。

  // Build the SvelteKit hook using app access settings, authentication, and optional transport. Return it for installation.
  return kit.createHandle({
    trustedProxies: appKitConfig.trustedProxies,
    access: appKitConfig.access,
    auth: {
      verifyToken: async (token) => {
        // Verify each incoming token with the initialized IAM module. Invalid claims become no session.
        const verified = await iam.auth.verifyToken(token)
        if (!verified.success)
          return null
        const { userId, username, roles, permissions } = verified.data
        return { userId, username, roles, permissions }
      },
      protectedPaths: [`${base}/api/*`],
      publicPaths: [`${base}/api/_hai/*`], // 默认密钥协商端点
    },
    crypto: {
      crypto,
      transport: appKitConfig.transport === false
        ? false
        : {
            ...appKitConfig.transport,
            basePath: base,
            serverKeyRing,
            // Create a transport key store backed by the initialized shared cache. Its entries expire after 3,600 seconds.
            keyStore: crypto.transport.createKeyStore({ cache, ttlSeconds: 3600 }),
          },
    },
  })
}
```

`verifyToken` 把 IAM 的验证结果投影为 Kit 所需的会话字段；验证失败返回 `null`，由守卫判断未登录。密钥环和缓存连接仅保留在服务器。

**src/routes/+layout.svelte**（安装浏览器端包装）：

```svelte
<script lang='ts'>
  import { browser } from '$app/environment'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { crypto } from '@h-ai/crypto'
  import { kit } from '@h-ai/kit'
  import { untrack } from 'svelte'

  const base = resolve('/').replace(/\/$/, '')

  // 一次性安装：内部按 _kit.yml 决定是否启用 transport，并预热 crypto
  if (browser) {
    // Use the browser's public Kit config, crypto instance, and app base path. Installs fetch transport only when enabled.
    kit.client.installBrowserTransport(untrack(() => page.data.kitConfig), { crypto, basePath: base })
  }
</script>
```

**src/lib/utils/api.ts**（业务层只看到 `apiFetch`）：

```ts
import { kit } from '@h-ai/kit'

// Create a default client for this app and export its apiFetch method.
export const { apiFetch } = kit.client.create()
```

> 不再需要 `src/hooks.client.ts`：默认 `handleFetch` 行为已经够用，SvelteKit 内部 `__data.json` 请求会自动走上面安装的全局 fetch 包装。若确需同源 Authorization Header，使用显式 `BrowserTokenStore` 或 `kit.auth.setBrowserToken()` + `kit.client.create({ auth: true })`；不要把敏感 Token 存入 `localStorage`。

默认密钥协商路径为 `/api/_hai/key-exchange`。如服务端自定义 `transport.keyExchangePath`，客户端需同步配置 `transport.keyExchangeUrl`。

服务端必须显式注入相同的受管 `serverKeyRing` 和共享 `keyStore`（@h-ai/cache 的 Redis 后端）。仅共享客户端公钥不足以跨节点解密。没有隐式进程私钥或内存 registry 回退；开发/测试显式用 `crypto.transport.createKeyStore({ cache })`，其中 cache 已显式连接开发用 memory 后端。服务端重启后重新加载同一密钥环即可，无需 sticky session。

transport 默认作用于同源 `/api/*` endpoint 与 SvelteKit `__data.json` 页面数据请求（以及密钥协商端点本身）；页面文档与静态资源仍保持明文，不要求携带 `X-Client-Id`。文件上传等 `multipart/form-data` 请求会保持原样发送，需在服务端 `excludePaths` 中显式放行对应上传路径。

加密传输使用 v2 格式。服务端先核对签名、消息认证码（MAC）、请求方法、路径和时间，再解密。客户端还会校验响应状态。服务节点共用同一套 @h-ai/cache 的共享 Redis 后端，每个请求编号只准登记一次，以拒绝重复发送的加密报文。应用仍需使用 HTTPS、配置接受转发头的代理、检查当前用户权限，并防止重试导致业务重复执行。跨域接入时，CORS 需允许请求携带 `X-Hai-Transport`，并让前端读取同名响应头。完整规则见 [Transport 协议](crypto.md#transport-protocol)。

业务容量通过 `transport.maxPlaintextBytes` 统一配置：默认 1 MiB，整数范围 1 KiB～64 MiB，请求和响应共用 UTF-8 明文字节预算。客户端从握手自动获取上限，密文与部署代理预算由 `crypto.transport.resolveBodyLimits()` 推导（两倍明文 + 32 KiB）。握手、公钥、认证头和防重放约束独立；超限取消原流并释放 reader，请求 413、响应为加密的 500 容量错误，客户端识别 `TransportBodyTooLargeError` / `hai:crypto:070`。 [Transport capacity and upgrade](crypto.md#transport-capacity)。

普通接口沿用全局 `transport.maxPlaintextBytes`。在 `routePlaintextBytes` 中合并 `feedbackTransportRoutes(apiPrefix)`，为反馈提交、消息与附件保留 16 MiB 的明文容量。

握手、Node HTTP 适配器和反向代理按各路由的最大值预留空间。HTTP 适配器为显式配置且超过 1 MiB 的路由最多同时处理 2 个请求，普通路由另有 16 个名额。响应发送完毕或请求失败时释放名额。忙碌时返回 HTTP 503（`hai:crypto:072`），应用决定是否重试。

Serv/Kit 对通过请求绑定、签名和 MAC 校验但超出时间窗口的请求返回加密的 HTTP 400 错误。客户端抛出 `TransportTimeError`（`hai:crypto:071`），显示校验时的服务器 UTC 时间，提示开启设备的自动校时或手工修改时间后刷新。`serverTime` 为 Unix 毫秒。`api-client` 映射为 `VALIDATION_FAILED`，在 `cause.transportCode` 和 `cause.serverTime` 保留诊断信息。标准认证动作将已认证的传输时间错误转为 `HaiResult`，保留校验时间和校时提示，AuthPanel 可直接展示。

#### 场景：从已校验配置读取传输选项

`@h-ai/kit` 提供 `KitConfigSchema` / `kit.resolveConfig()`，方便应用用同一份 `_kit.yml`
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
import { core } from '@h-ai/core'
import { KitConfigSchema } from '@h-ai/kit'

// 仅放在 src/lib/server 中；浏览器只收到 +layout.server.ts 返回的公开设置。
// Read the server-only _kit.yml and validate it with KitConfigSchema. A failed load stops before exposing public settings.
const loaded = core.config.load('kit', './config/_kit.yml', KitConfigSchema)
if (!loaded.success)
  throw new Error(loaded.error.message)
export const appKitConfig = loaded.data
export const publicKitConfig = { transport: appKitConfig.transport }
```

在 `src/routes/+layout.server.ts` 返回浏览器建立连接需要的值，由页面的布局数据读取。下面的示例只返回对客户端有用的 `kitConfig`。

```ts
import { publicKitConfig } from '#lib/server/kit-config.js'

export function load() {
  return { kitConfig: publicKitConfig }
}
```

读取 HTTP 监听设置时，服务端启动代码可从 `@h-ai/kit` 导入独立的 `kit.resolveConfig()`。它在服务器启动前解析 `server` 和 `transport`。监听地址和端口先用 `HOST` / `PORT` 环境变量，再读取 `_kit.yml` 的 `server`，最后才用 `127.0.0.1:3000`。
如只在服务端读取配置，也可配合 `core.config.validate('kit', KitConfigSchema)` 使用。
完整的 `_kit.yml` 在服务端读取，其中可以包含内部代理网段和访问规则的文件位置。通过 `+layout.server.ts` 传给浏览器的 `kitConfig` 只需包含浏览器会读取的字段，例如传输加密是否开启、密钥交换路径和不加密的路径。不要把代理地址、规则文件、私钥或完整配置发给浏览器，也不要用 `?raw` 导入服务端配置。

<a id="protocol-integrations"></a>

### 挂载反馈与 A2A 路由：`kit`

把业务服务挂到明确路径，可信上下文和授权由宿主解析；路由工厂不替应用决定资源访问权。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `kit.createFeedbackHandler(options)` | 受控反馈入口 | 必填 `options.feedback`（已初始化服务）与 `options.resolveContext(event)`（由可信会话得出的反馈主体，`null` 拒绝）。`options.basePath` 默认 `/api/feedback`。 | `catch-all RequestHandler` | `kit.createFeedbackHandler({ feedback, resolveContext })` |
| `kit.a2a.createApiKeyAuthenticator(config)` | 创建 A2A 程序凭据验证函数 | 必填 `config.in`（`header` 或 `query`）与 `config.name`（参数名）。 | `A2AAuthenticator` | `kit.a2a.createApiKeyAuthenticator({ in: 'header', name: 'x-api-key' })` |
| `kit.a2a.createAgentCardHandler(getAgentCard)` | 创建公开智能体描述处理器 | 必填 `getAgentCard()`，返回当前 Agent Card 或其 Promise。 | `RequestHandler` | `kit.a2a.createAgentCardHandler(() => card)` |
| `kit.a2a.createHandler(handleRequest, config?)` | 创建 A2A 请求处理器 | 必填处理 JSON-RPC 的 `handleRequest`。可选 `config.authenticate` 启用认证，接受 `apiKey` 或自定义回调，回调返回 `null` 或 `undefined` 时拒绝。 | `RequestHandler` | `kit.a2a.createHandler(handleRequest, { authenticate })` |
| `kit.a2a.resolveConfig(input)` | 解析 A2A 调用参数 | `input` 可以是操作对象或 `{ operations, cardPath?, rpcPath?, authenticate? }`。未配置传 `undefined`，返回 `null`。 | `ResolvedA2AConfig \| null` | `kit.a2a.resolveConfig({ operations, rpcPath: '/a2a' })` |
| `kit.a2a.handleRequest(event, requestId, config)` | 处理已装配的 A2A 请求 | 必填当前 `event`、关联 `requestId`、已解析的 A2A `config`。 | `Promise<Response \| null>` | `await kit.a2a.handleRequest(event, requestId, config)` |

#### 场景：挂载反馈与 A2A 路由

下面分别给出 feedback handler、Agent Card GET 和 A2A POST：输入业务处理器与认证函数，输出 JSON/SSE Response；路径不匹配的 A2A 分发返回 null，让后续 Hook 继续。

#### 场景：挂载反馈处理器

在 `/api/feedback/[...path]/+server.ts` 中，可以把 `kit.createFeedbackHandler()` 返回的函数导出为 GET、POST、PATCH。Kit 和 Serv 使用同一份 Feedback API 契约。服务端限制正文大小，也拒绝客户端声称自己的身份或租户。应用实现 `resolveContext`，从已经验证的 `locals.session` 取用户信息并决定反馈范围和权限。返回 `null` 表示拒绝。现有的 CSRF、认证和传输加密仍由 `kit.createHandle()` 中设置的中间件处理。

反馈业务范围由应用从已验证会话和部署配置解析。提交和回复的附件随正文在一次请求中发送。

```ts

import { feedback } from '@h-ai/feedback'
import { type SessionData, kit } from '@h-ai/kit'

// Bind the supplied feedback service to GET, POST, and PATCH. A request without a resolved session cannot access its scoped feedback.
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

#### 场景：挂载独立 A2A GET 与 POST

以下入口由 `@h-ai/kit/a2a` 公开，供需要独立处理器或自定义请求管道的 SvelteKit 应用使用。使用 API Key 认证时先初始化 IAM。

`handleRequest` 可包装 `ai.a2a.handleRequest`，`card` 取自成功的 `ai.a2a.getAgentCard()`。更多协议操作见 [AI 的 A2A 边界](./ai.md#a2a-协议边界)。

SvelteKit 部署在 `/yyy` 等目录时，在 Vite 的 sveltekit 配置设置 `paths.relative: false`，从 `$app/paths` 用 `resolve('/').replace(/\/$/, '')` 读取构建挂载目录 `base`，在服务端 `crypto.transport` 传入 `basePath: base`，浏览器使用 `kit.client.installBrowserTransport(公开配置, { crypto, basePath: base })`。独立 Kit client 的 `transport.basePath` 采用同一个值。默认空字符串表示根目录；它是宿主构建参数，不在 YAML 重复配置。这样 `/yyy/api/*` 的默认加密范围与页面目录保持一致，交换路径和排除列表仍填写完整请求路径。

## 错误处理

- 推荐使用 `kit.handler()` 包装 API 端点。
- `kit.validate.body` / `kit.guard.require` 抛出 `Response`，由 `kit.handler` 处理 API 控制流。页面 `load` 使用 `kit.guard.check` 和 SvelteKit `error`；校验查询参数用 `schema.safeParse` 后返回原生页面错误，不能直接抛 API Response。
- 非控制流异常会由 `kit.handler()` 统一转换为 `500 INTERNAL_ERROR` 响应。

### 错误提示与关联日志

`kit.response.fromError/fromResult` 保留安全的字段校验 `cause`、显式公开的 `publicExt`（映射为 `ext`）和 `httpStatus`。4xx 响应以 `debug` 记录错误码、状态和追踪编号。5xx 响应以 `error` 记录，并在服务端保留脱敏的异常诊断。

HTTP/UI 边界只对明确的有效 4xx 状态公开业务提示；错误缺少 `httpStatus` 或状态非法时按 500 返回安全提示。手写业务错误须提供完整错误定义或显式状态，不能依赖缺省状态展示原文。

`kit.response.validationError(errors)` 也沿用同一白名单：响应 `error.cause` 只含本地化的 `field/message`，不回显 rejectedValue、SQL 或其他额外字段，字段校验从 `error.cause` 读取。

快捷响应、认证守卫和限流均使用 `HaiCommonError` 标准错误码，附带 `httpStatus`、`traceId` 与 `X-Trace-Id`。未认证返回 `UNAUTHORIZED.code`，无权限返回 `FORBIDDEN.code`，限流返回 `RATE_LIMIT_EXCEEDED.code`（429）；限流存储故障返回安全的 503，原始原因只记服务端日志。

HTTP 错误向浏览器返回当前语言的提示和追踪编号。编号既在响应的 `error.traceId`，也在 `X-Trace-Id` 响应头，等于本次请求的 `requestId`。用户可在 Toast 的排查信息中展开并复制编号，开发人员可用它查找前后端日志。异常详情、堆栈和操作信息去除凭据后写入服务端日志。字段校验仅返回字段名和可显示的错误提示。

服务端把错误发给浏览器之前，可用 `core.error.toPublic(error, traceId)` 去除内部信息。界面需要重新显示错误时，可用 `core.error.formatMessage(error)` 格式化提示，重复调用也只附一次追踪编号。

写服务端日志时传入完整的 Error 对象，保留堆栈和错误原因。数据库操作失败时，可按驱动错误码、表和列定位问题。日志不记录 SQL 原文、参数值或数据库凭据。

audit 已初始化时，createHandle 为业务 audit.log 绑定已验证会话的身份/角色快照、平台 getClientAddress 地址和请求编号。自动入口事件 request.execute 包含路由模板、方法、状态和成功/失败/拒绝，包含守卫跳转及 SvelteKit HTTP 控制流；不复制请求体或错误详情。capture.enabled 可关闭自动采集，capture.includeReads 可开启成功读取；默认保留失败读取、跳过成功读取。业务含义仍在应用完成/失败边界显式记录，关闭自动采集不影响业务 log。
