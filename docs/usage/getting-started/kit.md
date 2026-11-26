# 用 Kit 搭建订单运营台

[English](kit.en.md) · [日本語](kit.ja.md) · [功能说明](../function/kit.md#api-reference) · [配置清单](../configuration/kit.md) · [数据结构](../data/kit.md)

订单运营台先要提供一个就绪接口。接下来在同一个 SvelteKit 应用里增加订单预览、人员权限、合作方访问、限流和传输加密。后一步保留前一步的文件和路由，只改明确指出的位置。

准备一个可运行的 Svelte 5 和 SvelteKit 工程。需要了解依赖和初始化顺序时，查阅 [Kit 的依赖](../function/kit.md#module-dependencies)。Serv 的教程从同一个业务需求开始。 [Serv 实现](serv.md#quick-start)

<a id="quick-start"></a>

## 第 1 步：启动订单运营台

订单运营团队先要一个就绪地址，好让部署系统确认服务可用。在已有的 Svelte 5 和 SvelteKit 项目中把应用命名为 `orders-console`。本页后续步骤都在这个应用上继续。先安装 Kit 和 Node SSR 所需的生产依赖，项目尚未安装 Node 适配器时一并添加。

```sh
pnpm add @h-ai/kit sm-crypto@0.5.8
pnpm add -D @sveltejs/adapter-node
```

在 `vite.config.ts` 的 SvelteKit 插件配置中指定 Node 适配器。将参数并入项目现有的 `sveltekit(...)` 调用，保留其他插件和构建选项。

```ts
import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

// Node 适配器负责生产监听。这个 Vite 配置把站点部署在域名根目录。
export default defineConfig({
  plugins: [sveltekit({ adapter: adapter(), paths: { base: '', relative: false } })],
})
```

在 `src/hooks.server.ts` 导出全局 Hook。默认启用请求日志，Hook 为响应写入 `X-Request-Id`。

```ts
import { kit } from '@h-ai/kit'

// 创建零配置的全局 Handle。SvelteKit 每次处理请求时调用它，添加 X-Request-Id 并记录请求日志。
export const handle = kit.createHandle()
```

在 `src/routes/api/v1/status/+server.ts` 导出 GET 处理器。

```ts
import { kit } from '@h-ai/kit'

// 返回 HTTP 200，正文的 data.status 为 ready。handler 将未处理的失败转换为安全的 HTTP 响应。
export const GET = kit.handler(() => kit.response.ok({ status: 'ready' }))
```

运行 `pnpm dev`，再请求 `/api/v1/status`，例如 `curl -i http://localhost:5173/api/v1/status`。应返回 HTTP 200、`X-Request-Id`，以及 `{"success":true,"data":{"status":"ready"}}`。需要认证、共享限流或传输加密时，再按下文装配服务端依赖。

<a id="orders-console-validation"></a>

## 第 2 步：让运营人员预览订单

运营人员要在保存前确认订单标题。安装 `zod`，在 `src/routes/api/v1/orders/preview/+server.ts` 新建下面的处理器。保留第 1 步的 `/api/v1/status` 和 Hook。

```sh
pnpm add zod
```

```ts
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const PreviewSchema = z.object({ title: z.string().trim().min(1) })

export const POST = kit.handler(async ({ request }) => {
  // 把校验后的标题装进 preview。缺少标题或去除空白后为空都会返回 HTTP 400。
  const preview = await kit.validate.body(request, PreviewSchema)
  return kit.response.ok({ preview })
})
```

```sh
curl -i http://localhost:5173/api/v1/orders/preview \
      -H 'Content-Type: application/json' \
      -d '{"title":"  Office supplies  "}'
```

返回 HTTP 200 和 `data.preview.title: "Office supplies"`。将请求正文改为 `{"title":" "}` 应得到 HTTP 400。预览仅返回待保存数据，下一步为它加身份和权限要求。 [Serv 的预览接口](serv.md#orders-console-validation) · [Kit 入参校验](../function/kit.md#kit-validate)

<a id="orders-console-auth"></a>

## 第 3 步：区分运营人员和审计员

现在只准有 `orders:write` 的运营人员预览订单。只有同时具备 `auditor` 角色及 `reports:read` 权限的用户能读取内部报告。先用本地演示身份验证这些规则，接入真实账号后在同一个 Hook 中改用 IAM。 [Serv 的权限场景](serv.md#orders-console-auth)

安装 `@h-ai/core`（`pnpm add @h-ai/core`），再在 `src/app.d.ts` 合并下列声明。已有 `App.Locals.session` 的项目保留现有声明。

```ts
import type { HttpSession } from '@h-ai/core'

declare global {
  namespace App {
    interface Locals {
      session?: HttpSession
    }
  }
}
```

把下面的验证器保存为 `src/lib/server/orders-session.ts`。仅在开发环境使用，令牌由两条启动环境变量提供。示例中的账号没有数据库记录。

```ts
import { core, HaiCommonError } from '@h-ai/core'

export async function verifyOrdersSession(token: string) {
  if (process.env.NODE_ENV !== 'development')
    return core.err(HaiCommonError.UNAUTHORIZED)
  if (token && token === process.env.KIT_ORDERS_EDITOR)
    return core.ok({ userId: 'editor-1', roles: ['operator'], permissions: ['orders:write'] })
  if (token && token === process.env.KIT_ORDERS_AUDITOR)
    return core.ok({ userId: 'auditor-1', roles: ['auditor'], permissions: ['reports:read'] })
  return core.err(HaiCommonError.UNAUTHORIZED)
}
```

用下面的代码替换第 1 步的 `src/hooks.server.ts`。通过 `base` 构造实际请求路径，即使将来部署在子目录，守卫仍能匹配。

```ts
import { resolve } from '$app/paths'
import { kit } from '@h-ai/kit'
import { verifyOrdersSession } from './lib/server/orders-session.js'

const base = resolve('/').replace(/\/$/, '')
const protectedPaths = [
  '/api/v1/orders/preview',
  '/api/v1/reports/current',
  '/api/auth/me',
].map(path => base + path)

// 认证 Hook 先恢复会话。路由负责核对角色、权限和业务资源。
export const handle = kit.createHandle({
  auth: { verifyToken: verifyOrdersSession, protectedPaths },
})
```

回到第 2 步的订单预览文件，把回调参数从 `{ request }` 改为 `{ request, locals }`，再将下行放到读取正文之前。

```ts
kit.guard.require(locals.session, 'orders:write')
```

新增 `src/routes/api/v1/reports/current/+server.ts` 供审计员查看报告。

```ts
import { kit } from '@h-ai/kit'

export const GET = kit.handler(({ locals }) => {
  // 身份由 Hook 填入。权限不足抛出 403，角色不符返回 403。
  kit.guard.require(locals.session, 'reports:read')
  const session = locals.session
  if (!session?.roles.includes('auditor'))
    return kit.response.forbidden()

  return kit.response.ok({ owner: session.userId, summary: 'Quarterly summary' })
})
```

在开发终端设置演示值并重启。下例的两个字符串只供本地验证。

```sh
export KIT_ORDERS_EDITOR=orders-editor-demo
export KIT_ORDERS_AUDITOR=orders-auditor-demo
pnpm dev
```

```sh
curl -i http://localhost:5173/api/v1/orders/preview \
  -H 'Authorization: Bearer orders-editor-demo' \
  -H 'Content-Type: application/json' \
  -d '{"title":"  Office supplies  "}'
curl -i http://localhost:5173/api/v1/reports/current \
  -H 'Authorization: Bearer orders-auditor-demo'
```

不带令牌访问两个接口应得到 401。运营人员的令牌可预览，但访问报告应得到 403。审计员令牌取得报告，`data.owner` 是 `auditor-1`。给只有权限但缺少角色的账号发放测试令牌，也应得到 403。

Kit 和 Serv 使用相同的 `HaiResult<HttpSession>` 验证结果。有效令牌的 `data` 会填入 `locals.session`。缺少令牌或验证明确返回 4xx 时，API 守卫返回 401。若验证器因依赖不可用返回 503，请求应返回 503，路由不会执行。

要用网站账号登录，先执行 `pnpm add @h-ai/iam`。将 `verifyOrdersSession` 的导入替换为 `import { iam } from '@h-ai/iam'`，先完成 [IAM 初始化](../function/iam.md#quick-start)，然后在 Hook 的 `auth` 中移除 `verifyToken`，加入下列字段并保留 `protectedPaths`。将 `kit.auth.createApi(iam)` 的 `login` 作为 `POST` 导出到 `src/routes/api/auth/login/+server.ts`。页面把同源客户端绑定到 `kit.client.createAuthActions()`，登录后请求 `/api/auth/me` 验证当前身份。 [登录与 Cookie 示例](../function/kit.md#authorization-example) · [当前账号接口](../function/kit.md#auth-current-account)

```ts
// 已验证的用户记录将填入 locals.session。未认证请求由 Hook 返回 401 或跳转。
iam,
publicPaths: kit.auth.publicPaths.map(path => base + path),
```

<a id="orders-console-access"></a>

## 第 4 步：只向合作方开放报告并限制请求速率

合作方要查看汇总报告。它走独立的路径，让第 3 步的内部报告继续使用账号权限。新建 `src/routes/api/v1/external/reports/+server.ts`。测试数据可以返回一段汇总文字，真正的合作方报表按业务要求另行查询和脱敏。 [Serv 的合作方入口](serv.md#orders-console-access)

```ts
import { kit } from '@h-ai/kit'

export const GET = kit.handler(() => kit.response.ok({ report: 'Quarterly summary' }))
```

下面以根目录部署为例。把规则写入 `config/_kit.yml`。Kit 先用连接对端识别可信代理，再读取该代理转发的客户端 IP。使用 adapter-node 时，为这套方案保持 `ADDRESS_HEADER` 未设置。生产替换样例 IP，并在网关禁止外部直接连后端。 [可信代理和规则](../configuration/kit.md#request-access)

```yaml schema=@h-ai/kit:KitConfigSchema
http:
  trustedProxies: [192.0.2.10]
  access:
    rules:
      - id: partner-api
        paths: [/api/v1/external/reports]
        allowIps: [203.0.113.0/24]
  rateLimit:
    windowMs: 10000
    maxRequests: 2
```

把下段保存为 `src/lib/server/orders-http.ts`，再在第 3 步的 Hook 从 `./lib/server/orders-http.js` 导入 `ordersHttp` 并在 `kit.createHandle({ ... })` 添加 `http: ordersHttp`。保留原来的 `auth`。

```ts
import { core } from '@h-ai/core'
import { KitConfigSchema, type HandleConfig } from '@h-ai/kit'

const loaded = core.config.load('kit', './config/_kit.yml', KitConfigSchema)
if (!loaded.success)
  throw new Error(loaded.error.message)

export const settings = loaded.data
const { http } = settings
export const ordersHttp: HandleConfig['http'] = {
  ...http,
  rateLimit: http.rateLimit && {
    ...http.rateLimit,
    store: core.access.createMemoryRateLimitStore(),
  },
}
```

通过已配置的代理测试 `GET /api/v1/external/reports`。客户端 `203.0.113.42` 得到 200 和 `data.report: "Quarterly summary"`。网段外得到 403。未受信的连接单独设置转发头不会获得访问权限。

在 10 秒窗口内，同一来源请求 `GET /api/v1/status` 三次应得到 200、200、429，剩余额度分别为 1、0、0。等待 `Retry-After` 后再次请求应得到 200。计数键是可信客户端地址，同一来源的其它允许请求也消耗配额。多副本启动前初始化 Redis，再把内存 store 换成 `core.access.createCacheRateLimitStore(cache, { namespace: "orders-console" })`。存储故障返回 503。 [限流的配置和替代方案](../function/kit.md#rate-limit-example)

<a id="orders-console-transport"></a>

## 第 5 步：加密同源请求，验证子目录部署

身份、报告和速率规则都可用后，给同一个运营台加请求与响应加密。先在已有 YAML 中增加下面的 `transport` 块，保留 `http`。生产使用 HTTPS、受管密钥环和共享缓存。服务公钥交换通过下面的完整 URL 路径完成。

第 4 步的两次额度只用于故障演练。现在把 `http.rateLimit.maxRequests` 改成 100 并重启，保留同一个窗口与计数配置。握手的 POST 和随后的业务请求会分别计数。保留低配额验证时，等到 `Retry-After` 所示窗口结束再测试。

```yaml schema=@h-ai/kit:KitConfigSchema
transport:
  keyExchangePath: /api/v1/_hai/key-exchange
  excludePaths: []
```

运行 `pnpm add @h-ai/cache @h-ai/crypto`，把下面的模块保存为 `src/lib/server/orders-transport.ts`。环境中的 `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` 从受保护的配置取得。示例用内存缓存登记密钥，部署时换成已经初始化的共享 Redis。 [准备密钥环](../function/crypto.md#transport-protocol) · [Serv 的加密接入](serv.md#orders-console-transport)

```ts
import { cache } from '@h-ai/cache'
import { crypto } from '@h-ai/crypto'
import { settings } from './orders-http.js'

export async function createOrdersTransport(basePath: string) {
  if (settings.transport === false)
    return false as const

  const ready = await crypto.init()
  if (!ready.success)
    throw new Error(ready.error.message)
  const cached = await cache.init({ type: 'memory' })
  if (!cached.success)
    throw new Error(cached.error.message)
  const ring = crypto.transport.parseServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
  if (!ring.success)
    throw new Error(ring.error.message)

  return {
    ...settings.transport,
    crypto,
    basePath,
    serverKeyRing: ring.data,
    keyStore: crypto.transport.createKeyStore({ cache }),
  }
}
```

在第 4 步的 Hook 从 `./lib/server/orders-transport.js` 导入 `createOrdersTransport`，给现有选项加 `transport: await createOrdersTransport(base)`。保留 `http` 和 `auth`。在 `src/routes/+layout.server.ts` 返回公开传输设置，密钥环和缓存留在服务端。

```ts
import { settings } from '../lib/server/orders-http.js'

export function load() {
  return { kitConfig: { transport: settings.transport } }
}
```

在根布局 `src/routes/+layout.svelte` 的现有 `<script>` 中加下面的代码。若原来已有 `data` 属性，沿用该变量。保留布局内容和 `children` 渲染。

```svelte
<script lang="ts">
  import type { LayoutProps } from './$types'
  import { browser } from '$app/env'
  import { resolve } from '$app/paths'
  import { crypto } from '@h-ai/crypto'
  import { kit } from '@h-ai/kit/client'
  import { untrack } from 'svelte'

  let { data, children }: LayoutProps = $props()
  if (browser) {
    kit.client.installBrowserTransport(untrack(() => data.kitConfig), {
      crypto,
      basePath: resolve('/').replace(/\/$/, ''),
    })
  }
</script>

{@render children()}
```

在 `src/routes/+page.svelte` 加一个按钮触发真实浏览器请求。使用 `resolve()` 让状态请求随根路径移动。

```svelte
<script lang="ts">
  import { resolve } from '$app/paths'

  let status = $state('')

  async function checkReadiness() {
    try {
      const response = await fetch(resolve('/api/v1/status'))
      if (!response.ok) {
        status = String(response.status)
        return
      }
      const result = await response.json()
      status = result.data.status
    }
    catch {
      status = '无法读取状态'
    }
  }
</script>

<button onclick={checkReadiness}>检查就绪状态</button>
<output>{status}</output>
```

先停掉上一次启动的开发服务。从项目根目录运行下面的命令，在本地启动运营台。它生成新的密钥环，只交给开发服务进程。每次重启都会换一套密钥。

```sh
node --input-type=module <<'JS'
import { spawnSync } from 'node:child_process'
import { crypto } from '@h-ai/crypto'

const ready = await crypto.init()
if (!ready.success)
  throw new Error(ready.error.message)
const pair = crypto.asymmetric.generateKeyPair()
await crypto.close()
if (!pair.success)
  throw new Error(pair.error.message)

const child = spawnSync('pnpm', ['dev'], {
  env: {
    ...process.env,
    HAI_CRYPTO_TRANSPORT_SERVERKEYRING: JSON.stringify({
      activeKeyId: 'local',
      keys: { local: pair.data },
    }),
  },
  stdio: 'inherit',
})
if (child.error)
  throw child.error
process.exitCode = child.status ?? 1
JS
```

Node 部署时沿用应用的关闭流程。等适配器触发 `sveltekit:shutdown` 后，先关闭本例初始化的 Cache，再关闭 Crypto。已有应用复用它自己的启动与清理入口。

打开页面后点击「检查就绪状态」。第一次调用可在 Network 看到 `POST /api/v1/_hai/key-exchange` 和带 `X-Encrypted: true` 的 `GET /api/v1/status`，页面显示 `ready`。短时间内重复验证先等限流窗口。启用加密后，直接用普通 curl 请求该接口会得到 HTTP 400。若部署平台仍需发出普通 HTTPS 探测，在受保护的 `/api` 范围之外单独提供一个探针路径。

部署到 `/console` 时，在第 1 步的 Vite 配置中把 `paths.base` 改为 `"/console"`，保留 `relative: false`。继续使用相同的路由文件。同时修改 YAML 中的两个完整路径，其他字段照旧。

```yaml
http:
  access:
    rules:
      - id: partner-api
        paths: [/console/api/v1/external/reports]
        allowIps: [203.0.113.0/24]
transport:
  keyExchangePath: /console/api/v1/_hai/key-exchange
```

重新构建并在 `/console/` 点击按钮。目标请求为 `/console/api/v1/status`，协商路径为 `/console/api/v1/_hai/key-exchange`。已有登录前端传给 `createAuthActions` 的 `basePath` 要与 Kit 登录路由一致，例如 `/console/api/auth`。部署时由 adapter-node 读取 `HOST` 和 `PORT`。 [运行时监听配置](../configuration/kit.md#apply-and-verify)

要让 Kit 同一站点提供 Serv 教程中的报表文件和事件流，把相同的契约、处理函数与 `transportRoutes` 交给 `serv.createContractHandler()`，再用 `kit.createHandle({ contract })` 挂载。验证已有页面仍正常渲染，审计员能下载附件，退出后重试得到 401。使用第 5 步的通信加密时，按实际方法与路径给文件和事件流配置 HTTPS 明文例外。 [挂载共享契约](../function/kit.md#kit-contract) · [浏览器使用事件流](../function/serv.md#ai-stream-example)

订单运营台还可以生成报告语音，或将上传的语音转成文字。沿用第 3 步的会话和报告权限，用普通 HTTP 请求发起对应操作。 [朗读与转写](serv.md#orders-console-audio)

<a id="orders-console-hook-options"></a>

## Hook 选项和接入步骤

每行标出在哪一步添加该能力。已配置的字段继续保留。

| 选项 | 在运营台的用法 | 查看示例 |
| --- | --- | --- |
| `http.trustedProxies / http.access` | 识别受信代理，只向合作方网段开放外部报告 | [合作方请求](#orders-console-access) |
| `http.rateLimit` | 给同一请求来源限制配额，再换成多副本共享计数 | [合作方与限流](#orders-console-access) |
| `auth` | 先登录再取内部报告，实际角色和权限由守卫检查 | [身份与权限](#orders-console-auth) |
| `transport` | 上传或读取业务 JSON 前完成同源密钥交换 | [通信加密](#orders-console-transport) |
| `crypto` | 在浏览器 Cookie 中保存列表显示偏好 | [偏好 Cookie](../function/kit.md#orders-console-cookie) |
| `logging / middleware / onError` | 对运营请求进行诊断并返回安全错误 | [订单诊断](../function/kit.md#orders-console-diagnostics) |
| `guards` | 为订单审批页面加应用级访问规则 | [审批守卫](../function/kit.md#orders-console-guards) |
| `cors` | 为独立来源的运营页面设置浏览器访问规则 | [跨源页面设置](../configuration/kit.md#cors) |
| `contract` | 在同一站点提供共享的报表、文件或事件流接口 | [共享契约](../function/kit.md#kit-contract) |
| `a2a` | 授权伙伴程序访问订单助手 | [订单助手](../function/kit.md#kit-a2a) |
