---
name: hai-create-app
description: "Use when: creating or extending apps in hai-framework, adding routes, pages, API endpoints, service workspaces, mobile app, H5 app, admin console. 在 hai-framework 中创建或扩展应用或 API service workspace，包含路由、API 端点、typed contract、服务层与 UI 脚手架代码。"
---

# hai-create-app — 应用创建与扩展规范

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | Use when: creating or extending apps in hai-framework, adding routes, pages, API endpoints, service workspaces, mobile app, H5 app, admin console. 在 hai-framework 中创建或扩展应用或 API service workspace，包含路由、API 端点、typed contract、服务层与 UI 脚手架代码。 |
| 适用场景 | 当任务与 `hai-create-app` 的能力描述匹配，并且需要遵循本 Skill 的流程和边界时 |
| 输入 | 明确的功能需求、目标路径、现有实现、仓库规范与验收条件 |
| 输出 | 最小必要的代码、类型、测试和同步文档，以及实际验证结果 |
| 限制 | 不为假设需求增加抽象，不绕过生命周期/HaiResult/i18n 约定，不覆盖用户已有改动 |

> 面向 AI 助手的应用开发指南。适用于 `apps/` 下的 SvelteKit 应用、纯 Svelte/Vite 客户端与 API service workspace。

## §0 如何使用本文档

> 本文档全面但较长（~500 行）。**不要整文加载**，按任务主题只读对应小节。动手前必读：§1（选型）+ §2（结构）。添加路由/API/i18n 时只读对应小节。

---

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

---

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
│   └── en-US.json
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

---

## §3 核心文件模板

### hooks.server.ts — 服务端入口

```ts
import type { Handle } from '@sveltejs/kit'
import { paraglideMiddleware } from '$lib/paraglide/server.js'
import { initApp } from '$lib/server/init.js'
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
    kit.i18n.setLocale(locale)
    return resolve(event)
  }
  return paraglideMiddleware(event.request, async ({ locale }) => {
    event.locals.locale = locale
    kit.i18n.setLocale(locale)
    return resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%lang%', locale),
    })
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
    operations: iam.auth,
  },
  rateLimit: { windowMs: 60000, maxRequests: 100 },
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

  const iamResult = await iam.init({ db: reldb, cache, ...core.config.getOrThrow('iam') })
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

---

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
  import { ComponentName } from '@h-ai/ui'

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

---

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

---

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

---

## §7 i18n 规范

### 文件位置

- 应用翻译：`messages/{zh-CN,en-US}.json`
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

---

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

---

## §9 安全规范

### 认证与授权

- Web token 使用 httpOnly cookie（管理后台）；移动/桌面使用安全 TokenStore
- 禁止 localStorage 存储敏感 token
- 布局级认证守卫 + API 级权限检查（双重保护）
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
- 服务端密钥用 `$env/static/private` 或 `$env/dynamic/private`
- 禁止硬编码密钥

### CSRF

- 写方法自动附加 CSRF token（通过 `kit.client.create`）

---

## §10 容器交付

- 新应用模板必须提供根目录 `Dockerfile`、`.dockerignore` 与 `pnpm docker:build` / `pnpm podman:build`，镜像构建必须使用仓库锁文件。
- Podman 多阶段构建命令使用 `--format docker --jobs=1`：保留 Dockerfile `HEALTHCHECK`，并避免 Buildah 并行 stage 在部分 Podman 5.8 环境触发内部 semaphore panic。
- SvelteKit 服务使用 Node adapter；纯 Vite/Capacitor Web 产物使用带 SPA fallback 的静态服务器。
- Dockerfile 必须先复制 lockfile 与 workspace 配置并执行 `pnpm fetch`，再复制源码并离线安装、构建；这样源码变化不重复下载依赖，也能兼容脚手架生成后新增的 workspace。
- API/fullstack 使用 `pnpm deploy --prod` 收敛生产依赖；fullstack 的默认镜像由 Service 直接监听，Web 通过独立静态镜像交付，不增加转发进程。
- 纯 Vite Web 的 `PUBLIC_*` 部署配置必须在容器启动时生成静态运行时配置，不得作为 Docker build arg 烘焙，以支持一次构建、多环境部署。
- `config/` 必须随默认镜像提供，并允许只读 bind mount 覆盖；敏感配置使用 YAML 环境变量占位符和 `--env-file`，禁止烘焙密钥。
- `data/` 默认排除在普通 Docker context 之外；需要预置 SQLite/本地存储时，通过显式 named build context 生成带初始数据的 target，运行时写入仍挂载 volume。
- 容器以非 root 用户运行，提供健康检查；验收至少覆盖镜像构建、启动、健康端点、环境变量覆盖、配置挂载与嵌入式数据库读取。

---

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

---

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

---

## 示例触发语句

- "创建新的 H5 页面"
- "添加用户管理 API 端点"
- "创建新的 SvelteKit 应用"
- "为 admin-console 添加新功能模块"
