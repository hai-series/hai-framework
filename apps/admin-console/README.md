# hai Admin Console

> 基于 hai-framework 构建的 SvelteKit 管理后台示例应用，展示框架全模块集成能力。

## ✨ 特性

- 🎨 **现代化 UI** — Svelte 5 Runes + TailwindCSS v4 + DaisyUI，32 套主题随时切换
- 🔐 **完整认证流** — 登录 / 注册 / 忘记密码 / 重置密码，均基于 @h-ai/ui 场景组件
- 👥 **IAM 管理** — 用户、角色、权限 CRUD，操作审计日志
- 🧩 **UI Gallery** — 69+ @h-ai/ui 组件的交互式展览（4 分类标签页）
- 🔧 **模块演示** — Core、DB、Cache、Storage、AI、Crypto 交互式示例
- 🌍 **国际化** — Paraglide 集成，189+ message keys，中英文实时切换
- 📱 **响应式布局** — Sidebar + TopBar 自适应，移动端友好
- 🧩 **组件自动导入** — 页面中使用 @h-ai/ui 组件无需显式 import

## 🚀 快速开始

### 前置要求

- Node.js ≥ 20
- pnpm ≥ 9

### 安装与启动

```bash
# 在 hai-framework monorepo 根目录
pnpm install

# 复制环境变量（按需修改）
cp apps/admin-console/.env.example apps/admin-console/.env

# 启动开发服务器
pnpm --filter admin-console dev
```

浏览器打开 `http://localhost:5173` 即可访问。

### 构建

```bash
pnpm --filter admin-console build
pnpm --filter admin-console preview
```

## 📋 功能模块

- 🔐 登录：用户名密码登录（`/auth/login`）
- 📝 注册：新用户注册（`/auth/register`）
- 🔑 忘记密码：邮箱验证找回密码（`/auth/forgot-password`）
- 🔄 重置密码：Token 验证重置密码（`/auth/reset-password`）
- 🏠 仪表盘：统计卡片、近期活动、快捷操作（`/admin`）
- 👥 用户管理：用户 CRUD、角色分配（`/admin/iam/users`）
- 🎭 角色管理：角色 CRUD、权限绑定（`/admin/iam/roles`）
- 🛡️ 权限管理：权限 CRUD、审计日志（`/admin/iam/permissions`）
- 🧩 UI Gallery：69+ 组件交互式展示（4 标签页）（`/admin/ui-gallery`）
- 🔧 模块演示：Core / DB / Cache / Storage / AI / Crypto 演示（`/admin/modules`）
- ⚙️ 设置：主题切换（32 套）、语言切换（`/admin/settings`）

## ⚙️ 配置

### 环境变量

复制 `.env.example` 到 `.env` 并按需修改：

```bash
# Application
HAI_ENV=development
HAI_DEBUG=false

# Database (sqlite | postgresql | mysql)
HAI_RELDB_TYPE=sqlite
HAI_RELDB_DATABASE=./data/admin.db

# Session (REQUIRED, min 32 chars)
HAI_IAM_SESSION_SECRET=change-me-to-a-strong-random-string-min-32-chars

# Cache (memory | redis)
HAI_CACHE_TYPE=memory

# Storage (local | s3)
HAI_STORAGE_TYPE=local
HAI_STORAGE_PATH=./data/uploads

# AI (uncomment to enable)
# HAI_AI_LLM_API_KEY=
```

完整列表见 `.env.example`。

### YAML 配置文件

- `config/_core.yml`：应用名称、版本、locale、功能开关
- `config/_db.yml`：数据库连接（SQLite / PostgreSQL / MySQL）
- `config/_cache.yml`：缓存类型与连接参数（memory / redis）
- `config/_iam.yml`：认证策略、密码策略、JWT、RBAC、种子数据
- `config/_storage.yml`：存储类型及参数（local / S3）

配置值支持 `${ENV_VAR:default}` 语法引用环境变量。

## 🌍 国际化 (i18n)

本应用使用 [Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) 实现国际化。

- **翻译文件**：`messages/zh-CN.json` 和 `messages/en-US.json`，包含 189+ message keys
- **编译命令**：`pnpm paraglide:compile` （编译后输出到 `src/lib/paraglide/`）
- **运行时切换**：Settings 页面可实时切换语言
- **服务端中间件**：`hooks.server.ts` 中的 `i18nHandle` 自动检测请求语言（跳过 `/api/*`）

添加新翻译：在 `messages/zh-CN.json` 和 `messages/en-US.json` 中同时添加对应 key 即可。

## 🧩 @h-ai/ui 组件自动导入

`svelte.config.js` 中启用了 `@h-ai/ui/auto-import` 预处理器：

- 所有 `.svelte` 文件中使用 @h-ai/ui 组件标签时，自动注入 import 语句
- 无需手动编写 `import { Button } from '@h-ai/ui'`

## 🔧 扩展指南

### 添加新页面

1. 在 `src/routes/admin/` 下创建目录和 `+page.svelte`
2. 页面可直接使用 @h-ai/ui 组件（自动导入）
3. 如需服务端数据，添加 `+page.server.ts` 配合 load 函数
4. 在 Sidebar 导航配置中添加菜单项
5. 在 `messages/` 下的两个语言文件中添加相关翻译 key

### 添加新 API 端点

1. 在 `src/routes/api/` 下创建 `+server.ts`
2. 使用 @h-ai/kit 的 response helper 返回标准格式
3. 如需认证保护，路由会自动走 `hooks.server.ts` 中的 guard 逻辑（`/api/auth/*` 和 `/api/public/*` 除外）

### 添加新业务服务

1. 在 `src/lib/server/services/` 下创建服务文件
2. 在 `src/lib/server/services/index.ts` 中聚合导出

## 🧪 开发命令

```bash
pnpm dev              # 启动开发服务器
pnpm build            # 构建生产版本
pnpm preview          # 预览生产版本
pnpm check            # Svelte + TypeScript 类型检查
pnpm lint             # ESLint 代码检查
pnpm test             # 运行单元测试（Vitest）
pnpm test:e2e         # 运行 E2E 测试（Playwright）
pnpm paraglide:compile # 编译 i18n 翻译文件
```

## 🛠️ 技术栈

- **前端框架**：SvelteKit 2 + Svelte 5 (Runes)
- **样式**：TailwindCSS v4 + DaisyUI
- **语言**：TypeScript 5.7+
- **构建工具**：Vite 6
- **i18n**：Paraglide
- **包管理**：pnpm

## 📦 框架依赖

- `@h-ai/core`：配置管理、日志、HaiResult 模式、错误处理
- `@h-ai/reldb`：数据库抽象（SQLite / PostgreSQL / MySQL）
- `@h-ai/iam`：用户、角色、权限、认证、RBAC
- `@h-ai/cache`：缓存（Memory / Redis）
- `@h-ai/storage`：文件存储（Local / S3）
- `@h-ai/crypto`：加密（SM2 / SM3 / SM4、Argon2）
- `@h-ai/ai`：AI 集成
- `@h-ai/kit`：SvelteKit hooks、guards、中间件、校验
- `@h-ai/ui`：UI 组件库（69+ 组件、场景组件、自动导入）

## 📄 许可证

Apache License 2.0
