# hai Admin Console

角色创建使用 `core.id.generate()` 生成独立 code；中文、表情及大小写相近的显示名称不会映射到同一个标识。修改名称不会改变角色 code。

角色资料与权限集合通过 IAM 的 `permissionIds` 在同一事务保存；失败保留原资料和权限。权限集合全量替换，空数组清空，未传保持不变。

> 基于 hai-framework 构建的 SvelteKit 管理后台示例应用，展示框架全模块集成能力。

## ✨ 特性

- 🎨 **现代化 UI** — Svelte 5 Runes + TailwindCSS v4 + DaisyUI，32 套主题随时切换
- 🔒 **API 传输加密** — 浏览器与 `/api/*` 默认通过 `@h-ai/crypto` 做密钥协商与请求/响应加解密
- 🔐 **完整认证流** — 登录 / 注册 / 忘记密码 / 重置密码，均基于 @h-ai/ui 场景组件
- 👥 **IAM 管理** — 用户、角色、权限 CRUD，操作审计日志；用户按角色 code 在数据库分页前筛选，总数与结果一致
- 🧩 **UI Gallery** — 69+ @h-ai/ui 组件的交互式展览（4 分类标签页）
- 🔧 **模块演示** — Core、DB、Cache、Storage、AI（含多厂商文生图）、Crypto 交互式示例
- 🌍 **国际化** — Paraglide 集成，189+ message keys，中英文实时切换
- 📱 **响应式布局** — Sidebar + TopBar 自适应，移动端友好
- 🧩 **组件自动导入** — 页面中使用 @h-ai/ui 组件无需显式 import

## 🚀 快速开始

### 前置要求

- Node.js 22.22.2+ / 24.15.0+ / 26+
- pnpm ≥ 12.11.2

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

首次启动且用户表为空时，只有配置 `HAI_ADMIN_DEFAULT_PASSWORD` 才会自动创建管理员：

| 项目   | 值                                |
| ------ | --------------------------------- |
| 用户名 | `admin`                           |
| 密码   | 来自 `HAI_ADMIN_DEFAULT_PASSWORD` |

请通过本地 `.env` 或密钥管理注入强密码；启动日志只显示用户名与密码来源，不输出明文密码。

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
- 🔧 模块演示：Core / DB / Cache / Storage / AI（LLM、Audio、Image）/ Crypto 演示（`/admin/modules`）
- ⚙️ 设置：主题切换（32 套）、语言切换（`/admin/settings`）

## ⚙️ 配置

### 环境变量

复制 `.env.example` 到 `.env` 并按需修改：

```bash
# Application
HAI_CORE_ENV=development
HAI_CORE_DEBUG=false

# Default admin is created only when the user table is empty and this variable is set.
HAI_ADMIN_DEFAULT_PASSWORD=<change-me-to-a-strong-local-password>

# Database (sqlite | postgresql | mysql)
HAI_DB_TYPE=sqlite
HAI_DB_DATABASE=./data/admin.db

# Cache (memory | redis)
HAI_CACHE_TYPE=memory

# Storage (local | s3)
HAI_STORAGE_TYPE=local
HAI_STORAGE_ROOT=./data/uploads

# AI (uncomment to enable)
# HAI_AI_LLM_APIKEY=
```

完整列表见 `.env.example`。

### YAML 配置文件

- `config/_core.yml`：应用名称、版本、locale、功能开关
- `config/_db.yml`：数据库连接（SQLite / PostgreSQL / MySQL）
- `config/_cache.yml`：缓存类型与连接参数（memory / redis）
- `config/_iam.yml`：认证策略、密码策略、JWT、RBAC、种子数据
- `config/_kit.yml`：同源 transport 加密（密钥协商路径、是否强制加密、明文例外路径）
- `config/_storage.yml`：存储类型及参数（local / S3）

除 `config/_kit.yml` 外，每个 YAML 叶子项都可由
`HAI_<配置名>_<YAML 路径>` 环境变量覆盖，且环境变量优先于 YAML 值。
例如 `_db.yml` 的 `database` 对应 `HAI_DB_DATABASE`，`_ai.yml` 的
`llm.apiKey` 对应 `HAI_AI_LLM_APIKEY`。camelCase key 不拆词。
`config/_kit.yml` 会同时被 `hooks.server.ts` 与浏览器端 `apiFetch` 静态导入，
因此只应放公开路径/开关配置，不要写入密钥；修改后需重启开发服务器。

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
4. 浏览器侧调用优先统一走 `$lib/utils/api.ts` 导出的 `apiFetch()`，以自动获得 CSRF + transport 加密
5. 若端点必须支持浏览器原生明文请求（如 `multipart/form-data` 上传、`<img src>` 公开文件、外部探活），需同步加入 `config/_kit.yml` 的 `transport.excludePaths`

## 配置驱动认证页面

协议支持配置中的 userAgreementMarkdown/privacyPolicyMarkdown 正文及 URL；同主题优先 Markdown，由安全渲染器在弹窗显示。

认证方式、注册、重置、协议和品牌由服务端 config/_iam.yml 控制。SvelteKit 页面消费 iam.publicConfig；移动/桌面页面从 API 服务读取公开配置。选用 Reach 时，初始化成功后传入 iam.init({ ...settings, reach })，使用标准通知模板。多节点共享 DB 与 Redis。UI 复用 AuthPanel/LoginForm 和框架认证动作，应用只负责业务导航与用户状态。

[完整配置与安全约束](../../packages/iam/README.md)

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
- **语言**：TypeScript 6 / 7
- **构建工具**：Vite 6
- **i18n**：Paraglide
- **包管理**：pnpm

## 📦 框架依赖

- `@h-ai/core`：配置管理、日志、HaiResult 模式、错误处理
- `@h-ai/reldb`：数据库抽象（SQLite / PostgreSQL / MySQL）
- `@h-ai/iam`：用户、角色、权限、认证、RBAC
- `@h-ai/cache`：缓存（Memory / Redis）
- `@h-ai/storage`：文件存储（Local / S3）
- `@h-ai/crypto`：加密（非对称 / 哈希 / 对称 / 密码哈希）
- `@h-ai/ai`：AI 集成
- `@h-ai/kit`：SvelteKit hooks、guards、中间件、校验
- `@h-ai/ui`：UI 组件库（69+ 组件、场景组件、自动导入）

## 📄 许可证

Apache License 2.0

角色列表通过 `iam.authz.getRoleUserCounts(roleIds)` 一次聚合当前页角色的真实成员数，返回 `HaiResult<Map<string, number>>`。无关联为 0；查询失败显示加载错误，不生成零统计。

管理端在线加密演示直接调用 Crypto SM3/SM4 API，SM4 使用随机临时密钥和 IV，并在显示成功前解密校验；密钥不保存。输入改变即清空旧结果，禁止用随机摘要或 Base64 伪装算法结果。

管理端数据读取在 HTTP 应用边界保留失败：查询异常返回 503 和可刷新错误页，分页任一页或权限关联失败均中止加载，禁止回退为空列表、零统计或空权限。未知权限代码返回 400，权限读取失败时不得继续写入。底层模块仍使用 HaiResult。

LDAP 与 Reach 为可选集成。需要默认 LDAP 客户端时，在负责 IAM 的服务端 workspace 安装 ldapts，设置 `login.ldap: true` 与 LDAP 连接配置；也可注入自定义工厂。邮件/短信可以选择 Reach 标准模板，或直接注入 `onOtpSendEmail/onOtpSendSms/onPasswordResetRequest` 回调，投递失败须拒绝 Promise。协议在弹窗内展示；LoginForm/RegisterForm 的 `header/extraFields/footer` 和 AuthPanel 的 `login*/register*` snippet 可用于应用扩展。完整配置与自定义发送示例见 [IAM 用法](../../packages/iam/README.md#可选-ldap-与通知接入)。
