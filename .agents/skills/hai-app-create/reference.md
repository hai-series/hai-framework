# hai-app-create — 详细用法

从 [SKILL.md](SKILL.md) 选择主题后读取对应小节。代码片段展示 API 用法；省略的业务变量、schema、依赖与 return 上下文需由应用补齐。

> 面向 AI 助手的应用开发指南。适用于 `apps/` 下的 SvelteKit 应用、纯 Svelte/Vite 客户端与 API service workspace。

所有架构共同遵循 [能力选择与安全质量规则](../../../packages/cli/templates/skills/hai-app-create/development.md)。下列 hooks、load、kit、`$env` 与文件路由范本只适用于 SvelteKit；API workspace/SPA 按现有 contract、serv 和 typed client 扩展。

## §1 应用类型与选型

### 已有应用类型

| 应用 | 用途 | 特点 |
|------|------|------|
| `admin-console` | 管理后台 | TailwindCSS + DaisyUI，IAM 权限控制，服务端渲染 |
| `h5-app` | 移动端 H5 | 触屏优化，PullRefresh/InfiniteScroll，简化认证 |
| `mobile-app` | 移动端原生壳 | Capacitor + Svelte 5 + Vite，支持 Android/iOS |
| `desktop-app` | 桌面应用 | Tauri 封装，本地文件系统访问 |
| `api-service` | API 服务 | 纯后端，无页面渲染 |
| `corporate-website` | 企业官网 | SSG 为主，SEO 优化 |

### 新应用决策

1. 首先确认是否能复用已有应用（加路由 vs 新建应用）
2. 确认渲染模式（SSR / CSR / SSG）
3. 确认目标端（Web / Mobile / Desktop / API）
4. 确认需要集成的 @h-ai 模块

## §2 目录结构

### 标准应用目录

```
apps/{app-name}/
├── config/                    # 运行时配置（YAML）
│   ├── _core.yml
│   ├── _db.yml
│   ├── _cache.yml
│   ├── _iam.yml
│   └── ...
├── messages/                  # i18n 翻译文件
│   ├── zh-CN.json
│   ├── en-US.json
│   └── ja-JP.json
├── project.inlang/            # Paraglide 配置
│   └── settings.json
├── src/
│   ├── app.css                # 全局样式（TailwindCSS + DaisyUI）
│   ├── app.d.ts               # 全局类型声明（App.Locals 等）
│   ├── app.html               # HTML 模板
│   ├── hooks.server.ts        # 服务端钩子（初始化、会话、i18n）
│   ├── lib/
│   │   ├── paraglide/         # ⚠️ 自动生成，禁止手动修改
│   │   ├── server/
│   │   │   ├── init.ts        # 应用初始化（模块 init 编排）
│   │   │   ├── schemas/       # Zod 校验 Schema
│   │   │   └── services/      # 应用业务服务层
│   │   ├── utils/             # 客户端工具（apiFetch 等）
│   │   └── components/        # 应用专属组件（非复用）
│   └── routes/
│       ├── +layout.svelte     # 根布局
│       ├── +page.svelte       # 首页
│       ├── (auth)/            # 认证分组（登录/注册/忘记密码）
│       ├── admin/             # 后台管理（需认证）
│       └── api/               # API 端点
├── static/                    # 静态资源
├── svelte.config.js
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
└── package.json
```

## §3 核心文件模板

### hooks.server.ts — 服务端入口

```ts
import type { Handle } from '@sveltejs/kit'
import { paraglideMiddleware } from '$lib/paraglide/server.js'
import { initApp } from '$lib/server/init.js'
import { cache } from '@h-ai/cache'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

let appInitPromise: Promise<void> | null = null

async function ensureAppInitialized() {
  if (!appInitPromise) {
    appInitPromise = initApp().catch((err) => {
      appInitPromise = null
      throw err
    })
  }
  await appInitPromise
}

// i18n Handle — API 请求跳过 paraglideMiddleware
const i18nHandle: Handle = async ({ event, resolve }) => {
  await ensureAppInitialized()
  if (event.url.pathname.startsWith('/api/')) {
    const locale = event.cookies.get('PARAGLIDE_LOCALE') ?? 'zh-CN'
    event.locals.locale = locale
    return kit.i18n.runWithLocale(locale, () => resolve(event))
  }
  return paraglideMiddleware(event.request, async ({ locale }) => {
    event.locals.locale = locale
    return kit.i18n.runWithLocale(locale, () => resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%lang%', locale),
    }))
  })
}

// 组合 Handle — kit.createHandle 内置认证守卫、限流、加解密
const haiHandle = kit.createHandle({
  auth: {
    verifyToken: async (token) => {
      const result = await iam.auth.verifyToken(token)
      if (!result.success) return null
      const s = result.data
      return { userId: s.userId, username: s.username, displayName: s.displayName, avatarUrl: s.avatarUrl, roles: s.roles, permissions: s.permissions }
    },
    loginUrl: '/auth/login',
    protectedPaths: ['/admin/*', '/api/*'],
    publicPaths: ['/api/auth/*', '/api/public/*'],
    operations: () => iam.auth,
  },
  rateLimit: { windowMs: 60000, maxRequests: 100, store: kit.middleware.createCacheRateLimitStore(cache, { namespace: 'app' }) },
})

export const handle: Handle = kit.sequence(i18nHandle, haiHandle)
```

### init.ts — 应用初始化

```ts
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { cache } from '@h-ai/cache'
import { iam } from '@h-ai/iam'

let initialized = false

export async function initApp(): Promise<void> {
  if (initialized) return

  // 1. core.init 加载配置
  core.init({ configDir: './config' })

  // 2. 按依赖顺序初始化各模块（HaiResult 失败则 throw）
  const dbResult = await reldb.init(core.config.getOrThrow('db'))
  if (!dbResult.success) throw new Error(dbResult.error.message)

  const cacheResult = await cache.init(core.config.getOrThrow('cache'))
  if (!cacheResult.success) throw new Error(cacheResult.error.message)

  const iamResult = await iam.init(core.config.getOrThrow('iam'))
  if (!iamResult.success) throw new Error(iamResult.error.message)

  // 3. 业务建表（如有）
  // await ensureXxxTable()

  initialized = true
  core.logger.info('Application initialized.')
}
```

### app.d.ts — 类型声明

```ts
/// <reference types="@sveltejs/kit" />
import '@h-ai/ui/auto-import'

declare global {
  namespace App {
    interface Error {
      code?: string
      message: string
    }
    interface Locals {
      requestId: string
      accessToken?: string
      session?: {
        userId: string
        username: string
        displayName?: string
        avatarUrl?: string
        roles: string[]
        permissions: string[]
      }
      locale?: string
    }
    interface PageData {
      user?: {
        id: string
        username: string
        displayName?: string
        avatarUrl?: string
        roles: string[]
        permissions: string[]
      }
    }
  }
}
export {}
```

## §4 路由与页面

### 路由组织原则

- 认证页面用路由分组：`(auth)/auth/login`、`(auth)/auth/register`
- 需认证的页面放 `admin/` 或其他保护目录
- API 端点放 `api/`（与页面路由分离）
- `+layout.server.ts` 做认证守卫

### 页面文件(.svelte)

```svelte
<script lang="ts">
  import type { PageData } from './$types'
  import * as m from '$lib/paraglide/messages'
  import { Button } from '@h-ai/ui'

  interface Props {
    data: PageData
  }

  let { data }: Props = $props()
</script>

<svelte:head>
  <title>{m.page_title()}</title>
</svelte:head>

<!-- 页面内容 -->
```

### 服务端数据加载(+page.server.ts)

```ts
import type { PageServerLoad } from './$types'
import { kit } from '@h-ai/kit'
import { error } from '@sveltejs/kit'

export const load: PageServerLoad = async ({ locals }) => {
  // 权限检查
  if (!kit.guard.check(locals.session, 'resource:read')) {
    error(403, { message: 'Forbidden' })
  }

  // 并行加载无依赖数据
  const [dataA, dataB] = await Promise.all([
    fetchA(),
    fetchB(),
  ])

  return { dataA, dataB }
}
```

### 布局守卫(+layout.server.ts)

```ts
import type { LayoutServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'

export const load: LayoutServerLoad = async ({ locals, url }) => {
  if (!locals.session) {
    const returnUrl = encodeURIComponent(url.pathname + url.search)
    redirect(302, `/auth/login?returnUrl=${returnUrl}`)
  }
  return { user: locals.session }
}
```

## §5 API 端点

### 标准 API 写法

使用 `kit.handler` + `kit.validate` + `kit.response`：

```ts
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const CreateSchema = z.object({
  name: z.string().min(1),
  // ...
})

export const POST = kit.handler(async ({ request, locals }) => {
  kit.guard.require(locals.session, 'resource:create')

  const data = await kit.validate.body(request, CreateSchema)

  const result = await someModule.create(data)
  if (!result.success) {
    return kit.response.fromError(result.error, ErrorHttpStatus)
  }

  return kit.response.ok(result.data)
})
```

### API 规范

- 所有输入用 Zod Schema 校验（`kit.validate.body` / `kit.validate.query` / `kit.validate.params`）
- 权限检查用 `kit.guard.require`（抛异常）或 `kit.guard.check`（返回布尔）
- 响应用 `kit.response.ok` / `kit.response.fromError` / `kit.response.badRequest` 等
- HaiResult 型错误用 `kit.response.fromError(error, HttpStatusMap)` 转换
- Schema 复用：通用 Schema 从 `@h-ai/kit` 导入（`IdParamSchema`、`PaginationQuerySchema`）

## §6 模块集成

### 初始化顺序

```
core → reldb → cache → storage → reach → iam → ai → 业务表
```

依赖规则：
- `iam` 依赖 `reldb` + `cache`
- `ai` 依赖 `reldb`（可选 `cache`）
- `storage` 独立
- `audit` 依赖 `reldb`

### 客户端集成

```svelte
<!-- routes/+layout.svelte — 浏览器端一次性安装同源 transport -->
<script lang="ts">
  import { browser } from '$app/environment'
  import { appKitConfig } from '$lib/config/kit-config'
  import { crypto } from '@h-ai/crypto'
  import { kit } from '@h-ai/kit'

  if (browser) {
    kit.client.installBrowserTransport(appKitConfig, { crypto })
  }
</script>
```

```ts
// lib/utils/api.ts — 统一 API 客户端，业务层只看到 apiFetch
import { kit } from '@h-ai/kit'

const client = kit.client.create({ auth: true })
export const { apiFetch } = client
```

### @h-ai/ui 组件使用

- 场景组件（LoginForm、RegisterForm 等）内置 i18n，不传页面翻译样板；仅用组件显式 props 覆盖少量文本
- 通用组件（Badge、Card、Input 等）直接使用
- 权限组件：`setPermissionContext()` + `usePermission()` 注入权限
- @h-ai/ui 已有组件不得重复实现
- 公共复用组件放 @h-ai/ui，应用专属组件放 `src/lib/components/`

## §7 i18n 规范

### 文件位置

- 应用翻译：`messages/{zh-CN,en-US,ja-JP}.json`
- UI 组件翻译：`packages/ui/src/lib/messages/`（由 @h-ai/ui 管理）
- 禁止直接修改 `src/lib/paraglide/` 生成文件

### 使用方法

```svelte
<script lang="ts">
  import * as m from '$lib/paraglide/messages'
</script>

<h1>{m.page_title()}</h1>
<p>{m.greeting({ name: 'Alice' })}</p>
```

### 翻译键命名

- 页面级：`{page}_{element}`，如 `login_title`、`dashboard_stats_users`
- 导航：`nav_{item}`，如 `nav_dashboard`、`nav_users`
- API 错误：`api_{module}_{action}_{error}`，如 `api_auth_password_too_short`
- 通用：`common_{action}`，如 `common_save`、`common_cancel`

### 注意事项

- 所有用户可见字符串必须走 i18n key（标题、Toast、Alert、按钮、校验提示、错误信息）
- 代码注释中文，日志消息英文
- @h-ai/ui 场景组件已内置翻译，应用层只管页面级文本

## §8 样式与 UI

### TailwindCSS + DaisyUI

```css
/* app.css */
@import 'tailwindcss';
@source "../../../packages/ui/src/lib/**/*.svelte";

@plugin "daisyui" { themes: light --default, dark --prefersdark; }
@plugin "@iconify/tailwind4" { prefixes: tabler; }
```

### 主题

- `data-theme` 属性控制主题切换
- app.html 中内联脚本防闪烁：从 localStorage 读取主题
- 使用 DaisyUI 语义色（`bg-base-100`、`text-base-content`、`btn-primary` 等）

### 移动端适配（H5）

- 额外引入 `@h-ai/ui` 的 `design-tokens.css` 和 `mobile.css`
- 使用移动端组件：`PullRefresh`、`InfiniteScroll`、`BottomNav`、`AppBar`
- H5 认证路由独立显示；业务页的 `BottomNav` 与移动端壳同宽，使用 `centered`、`maxWidth` 和 `safeArea`。

## §9 安全规范

### 认证与授权

- Web 沿实际 Cookie/内存 access token 与刷新流程；移动/桌面沿当前平台的安全 TokenStorage，不套用另一种认证模式
- 禁止 localStorage 存储敏感 token
- 页面守卫与服务端身份/租户/资源权限分别验证；SvelteKit 布局或 serv procedures 按当前架构使用
- 重定向只允许站内路径（防 Open Redirect）

### 输入校验

- API 边界用 Zod Schema 校验
- 前端表单也做基本校验（UX 级别）
- 文件上传校验：类型白名单 + 大小限制

### XSS 防护

- 禁止 `{@html}` 渲染未消毒的用户输入
- `{@html}` 仅用于受控 HTML（已 sanitize 的 Markdown 等）

### 环境变量

- `PUBLIC_` 前缀仅用于客户端安全变量
- 服务端密钥走当前配置/环境入口；SvelteKit 可用 `$env/static/private` 或 `$env/dynamic/private`，serv 不导入 SvelteKit 的 `$env`
- 禁止硬编码密钥

### CSRF

- Cookie 写操作验证当前请求管道的 CSRF 保护；SvelteKit 可复用 `kit.client.create`，其它架构按实际 transport/client 契约接入

## §10 容器交付

- 新应用模板必须提供`images/*.Dockerfile`、`.dockerignore` 与 `pnpm build --target docker`（auto 优先 Podman，可用 --runtime 指定），镜像构建必须使用仓库锁文件。保留 `.gitattributes`，让 `.dockerignore`、Dockerfile 和 POSIX 脚本统一使用 LF，保持跨平台输入一致并确保 Linux 脚本可运行。
- Podman 多阶段构建命令使用 `--format docker --jobs=1`：保留 Dockerfile `HEALTHCHECK`，并避免 Buildah 并行 stage 在部分 Podman 5.8 环境触发内部 semaphore panic。
- SvelteKit 服务使用 Node adapter；纯 Vite/Capacitor Web 产物使用带 SPA fallback 的静态服务器。
- Dockerfile 必须先复制 lockfile、workspace 配置与构建器准备的 `images/dependencies/` 安装输入，再执行 `pnpm fetch --ignore-scripts`，再复制源码并离线安装、构建；这样源码变化不重复下载依赖，也能兼容脚手架生成后新增的 workspace。
- API/fullstack 使用 `pnpm pm deploy --filter <服务包名> --prod` 收敛生产依赖；fetch、安装和 deploy 阶段共用 pnpm store，安装和 deploy 阶段共用 SQLite 驱动缓存，避免收集生产依赖时重新下载。fullstack 的默认镜像由 Service 直接监听，Web 通过独立静态镜像交付，不增加转发进程。
- 默认容器面向 CPU 运行或远程 AI 服务，在 Dockerfile 的安装和生产依赖收集阶段设置 `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`，不额外下载 CUDA/TensorRT。容器使用宿主机 GPU 时需定制镜像与运行参数；该默认策略不修改本机 npm 配置或全局 AI/GPU 设置。
- 纯 Vite Web 的 `PUBLIC_*` 部署配置必须在容器启动时生成静态运行时配置，不得作为 Docker build arg 烘焙，以支持一次构建、多环境部署。
- `config/` 必须随默认镜像提供，并允许只读 bind mount 覆盖；敏感配置使用 YAML 环境变量占位符和 `--env-file`，禁止烘焙密钥。
- CLI 项目的 `.gitignore` 统一包含 `**/data/`，忽略任意层级的数据目录及 `.gitkeep`。Fullstack 保留 14 份服务端 YAML，包含 feedback；未启用模块、可选字段和替代 Provider 以注释展示；`.env.example` 同步注释凭据。按实际 Schema 安装/校验/初始化并反序关闭后再启用配置，文件存在不代表模块已接入；不为 crypto/datapipe 虚构 YAML。叶子环境变量只覆盖已有路径，注释键须先取消注释或通过整个对象覆盖。详见 [CLI 配置说明](../../../packages/cli/README.md#应用配置与显示)。
- `data/` 默认排除在普通 Docker context 之外；需要预置 SQLite/本地存储时，在 `images/` 提供独立 Dockerfile 并明确构建上下文，避免普通镜像意外包含本地数据；运行时写入仍挂载 volume。
- Fullstack 自动生成的 `.env` 只启用管理员初始密码和 `PUBLIC_API_BASE`，模块环境覆盖默认注释，避免旧默认值使 YAML 修改无效；有明确环境覆盖时编辑 YAML 要同步核对。
- 容器以非 root 用户运行，提供健康检查；验收至少覆盖镜像构建、启动、健康端点、环境变量覆盖、配置挂载与嵌入式数据库读取。

## §11 测试

### 单元测试（Vitest）

- 测试文件放 `tests/` 目录
- 服务层逻辑通过 mock 模块测试
- Schema 校验测试

### E2E 测试（Playwright）

- 测试文件放 `e2e/` 目录
- 配置文件：`playwright.config.ts`
- 覆盖关键用户流程（登录 → 操作 → 登出）
- 包含关键页面和 API 端点的测试
- 经 `test:e2e` 托管入口运行，服务子进程显式选择本轮 SQLite/Memory/Local 等测试后端与绝对数据目录，隔离 ambient 模块变量和用户 `.env.local`；普通生产配置与共享状态守卫保持生效。启用 transport 时传入本轮可信 ring，并保留真实客户端握手。

## §12 创建检查清单

### 新应用

- [ ] 目录结构符合 §2
- [ ] hooks.server.ts 包含初始化 + i18n + 会话验证
- [ ] app.d.ts 声明 App.Locals / App.Error
- [ ] init.ts 按依赖顺序初始化模块
- [ ] i18n 配置完整（messages/ + project.inlang/）
- [ ] @h-ai/ui 正确引入（auto-import + 样式 source）
- [ ] 环境变量无硬编码
- [ ] Docker 镜像可构建并以非 root 用户启动
- [ ] 配置挂载、环境变量覆盖和可选数据镜像已验证

### 新路由/页面

- [ ] 需认证页面有布局守卫
- [ ] 页面文本全部走 i18n
- [ ] 使用 @h-ai/ui 已有组件，不重复实现
- [ ] 权限检查通过 `kit.guard`

### 新 API 端点

- [ ] 输入用 Zod Schema 校验
- [ ] 权限用 `kit.guard.require`
- [ ] 响应用 `kit.response.*`
- [ ] HaiResult 错误用 `kit.response.fromError` 转换
- [ ] 无依赖数据用 `Promise.all` 并行加载

生产限流必须先初始化共享 Redis，并显式传入原子 store；createCacheRateLimitStore 以单键 CAS 和首次提交 TTL 实现固定窗口（非滑动窗口），不支持非原子 get+set 回退。缓存故障/冲突耗尽返回503，超限429。内存仅开发/显式端到端测试可选；代理须由可信 SvelteKit adapter 配置 getClientAddress，不在应用中直接信任 X-Forwarded-For。未选择 cache 的 CLI 应用默认不启用限流，启用前应新增共享后端。

认证 Cookie 在 NODE_ENV 或 HAI_CORE_ENV 为 production 时默认启用 Secure，HAI_E2E/HAI_E2E_MOCK 不降低 Cookie 安全；限流生产判断也识别这两个环境标志，测试开关仅放宽共享状态要求。
