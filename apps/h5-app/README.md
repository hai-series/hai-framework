# hai H5 App

## 简介

基于 hai-framework 构建的 SvelteKit 移动端 H5 示例应用，展示拍照识别、用户认证、购物车等移动场景。

## 核心功能清单

- 宽屏下工作区随窗口扩展，列表在自身区域内滚动；手机端自动收拢，登录框和长篇正文保留阅读宽度。

### ✨ 特性

- 📷 **拍照识别** — 拍照/相册选图，调用 @h-ai/ai 多模态模型识别图片内容
- 🔐 **用户认证** — 登录 / 注册流程（@h-ai/iam）
- 🛒 **购物车** — 移动端购物车功能
- 👤 **个人中心** — 用户档案管理
- 📂 **图片存储** — @h-ai/storage 存储原图
- 💾 **数据持久化** — @h-ai/reldb 保存识别历史
- ⚡ **缓存加速** — @h-ai/cache（memory / Redis）
- 🌍 **国际化** — Paraglide 集成，中英文实时切换
- 🎨 **主题切换** — 基于 @h-ai/ui 的 DaisyUI 多主题支持
- 📱 **移动优先** — 针对移动端优化的响应式布局
- 🧩 **组件自动导入** — @h-ai/ui 组件无需显式 import

### 📋 功能模块

- 🏠 首页：应用入口（`/`）
- 📷 发现/识别：拍照识别图片内容（`/discover`）
- 🔐 登录：用户登录（`/auth/login`）
- 📝 注册：用户注册（`/auth/register`）
- 🛒 购物车：购物车管理（`/cart`）
- 👤 个人中心：用户档案（`/profile`）

## 使用入门

### 🚀 快速开始

#### 前置要求

- Node.js 22.22.2+ / 24.15.0+ / 26+
- pnpm ≥ 12.11.2

#### 安装与启动

```bash
# 在 hai-framework monorepo 根目录
pnpm install

# 按 .env.example 的字段说明，在 .env.local 中仅填写需要覆盖的私有值

# 启动开发服务器
pnpm --filter h5-app dev
```

浏览器打开 `http://localhost:5173` 即可访问。

#### 构建

```bash
pnpm --filter h5-app build
pnpm --filter h5-app preview
```

### ⚙️ 配置

本目录 `.env.example` 完整说明字段用途、枚举和范围；`.env` 为公共基础，`.env.dev` / `.env.test` / `.env.prod` 为公共环境覆盖，均提交 Git。`.env.local` 保存本机私有覆盖，不提交。优先级为进程环境 > `.env.local` > 环境文件 > `.env`。使用 `dev:test` / `dev:prod` 或 Node `start:test` / `start:prod` 切换，详见 [配置与环境变量](../../README.md#配置与环境变量)。

#### YAML 配置文件

- `config/_core.yml`：应用名称、版本、运行环境
- `config/_db.yml`：数据库连接（SQLite / PostgreSQL / MySQL）
- `config/_cache.yml`：缓存类型及连接参数（memory / Redis）
- `config/_iam.yml`：认证策略、密码策略、JWT
- `config/_storage.yml`：存储类型及参数（local / S3）
- `config/_ai.yml`：AI 模型配置（多模态识别）

每个 YAML 叶子项都可由 `HAI_<配置名>_<YAML 路径>` 环境变量覆盖，
且环境变量优先于 YAML 值；camelCase key 不拆词。

#### 环境变量

| 变量名               | 说明                          | 默认值                      |
| -------------------- | ----------------------------- | --------------------------- |
| `HAI_DB_TYPE`        | 数据库类型                    | `sqlite`                    |
| `HAI_DB_DATABASE`    | 数据库路径/地址               | `./data/h5-app.db`          |
| `HAI_CACHE_TYPE`     | 缓存类型                      | `memory`                    |
| `HAI_STORAGE_TYPE`   | 存储类型                      | `local`                     |
| `HAI_AI_LLM_APIKEY`  | OpenAI API Key（AI 识别必填） | —                           |
| `HAI_AI_LLM_BASEURL` | OpenAI API 基础 URL           | `https://api.openai.com/v1` |

#### 认证页面

协议支持配置中的 userAgreementMarkdown/privacyPolicyMarkdown 正文及 URL；同主题优先 Markdown，由安全渲染器在弹窗显示。

认证方式、注册、重置、协议和品牌由服务端 config/_iam.yml 控制。SvelteKit 页面消费 iam.publicConfig；移动/桌面页面从 API 服务读取公开配置。选用 Reach 时，初始化成功后传入 iam.init({ ...settings, reach })，使用标准通知模板。多节点共享 DB 与 Redis。UI 复用 AuthPanel/LoginForm 和框架认证动作，应用只负责业务导航与用户状态。

[完整配置与安全约束](../../packages/iam/README.md)

### 🌍 国际化 (i18n)

本应用使用 [Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) 实现国际化。

- **翻译文件**：`messages/zh-CN.json` 和 `messages/en-US.json`
- **编译命令**：`pnpm paraglide:compile`
- **运行时切换**：页面可实时切换语言

添加新翻译：在 `messages/zh-CN.json` 和 `messages/en-US.json` 中同时添加对应 key 即可。

### 镜像构建与部署

在本应用目录执行，镜像定义为 `images/app.Dockerfile`，`hai.build.json` 指定文件与仓库根构建上下文。Web 运行配置位于 `images/web/`（如有）。应用版本来自本目录的 `package.json.version`。

```sh
pnpm build:images                         # 只构建镜像并导出 tar
pnpm run deploy --env prod --build        # 构建、打包、上传、启动并检查访问
pnpm run deploy --env prod --build --bundle-only --output release-prod.tar
```

先准备 `.env.prod` 与 `config/_deploy.yml`；首次向导以说明文字收集服务器连接信息并保存到 `.env.local`。完整离线包包含应用和自建中间件镜像，目标 Linux 需预装容器引擎、Compose 与脚本要求的工具。把 tar 和同名 `-deploy/` 目录一起搬到操作机，Windows 执行 `deploy.ps1`，Linux/macOS 执行 `deploy.sh`；完全隔离的服务器解包后执行 `sh apply.sh`。

已有成功安装时，可用 `--services app` 只更新本应用；多个镜像的工程按服务名选择。局部发布保留其他容器和持久化卷，不执行整个项目 `down`，失败保留诊断并尝试恢复旧容器。相同版本允许重建，每次以独立构建 ID 区分内容。`images/dependencies/` 为忽略 Git 的依赖输入，配合引擎缓存和分层减少重复下载。

完整参数、缓存、版本与恢复说明见[使用指南](../../docs/usage/README.md#4-编译源码与打包产物)。移动端和桌面端的原生安装包仍需在对应系统另行构建；容器部署交付的是 Web 页面。

### 🧪 开发命令

```bash
pnpm --filter h5-app dev              # 启动开发服务器
pnpm --filter h5-app build            # 构建生产版本
pnpm --filter h5-app preview          # 预览生产版本
pnpm --filter h5-app check            # Svelte + TypeScript 类型检查
pnpm --filter h5-app lint             # ESLint 代码检查
pnpm --filter h5-app test             # 运行单元测试（Vitest）
pnpm --filter h5-app test:e2e         # 运行 E2E 测试（Playwright）
pnpm --filter h5-app paraglide:compile # 编译 i18n 翻译文件
```

### 📦 框架依赖

- `@h-ai/core`：配置管理、日志、HaiResult 模式、错误处理
- `@h-ai/reldb`：数据库抽象（SQLite / PostgreSQL / MySQL）
- `@h-ai/iam`：用户认证（登录 / 注册 / Session）
- `@h-ai/cache`：缓存（Memory / Redis）
- `@h-ai/storage`：文件存储（Local / S3）
- `@h-ai/ai`：AI 集成（多模态识别）
- `@h-ai/kit`：SvelteKit hooks、guards、中间件、校验
- `@h-ai/ui`：UI 组件库（场景组件、自动导入）

LDAP 与 Reach 为可选集成。需要默认 LDAP 客户端时，在负责 IAM 的服务端 workspace 安装 ldapts，设置 `login.ldap: true` 与 LDAP 连接配置；也可注入自定义工厂。邮件/短信可以选择 Reach 标准模板，或直接注入 `onOtpSendEmail/onOtpSendSms/onPasswordResetRequest` 回调，投递失败须拒绝 Promise；回调第三参数 context 提供 expiresAt/idempotencyKey，发送服务按稳定键持久化去重，异常/超时为结果未知且不自动重发。协议在弹窗内展示；LoginForm/RegisterForm 的 `header/extraFields/footer` 和 AuthPanel 的 `login*/register*` snippet 可用于应用扩展。完整配置与自定义发送示例见 [IAM 用法](../../packages/iam/README.md#可选-ldap-与通知接入)。

## 开发测试

```sh
pnpm --filter h5-app typecheck
pnpm --filter h5-app lint
pnpm --filter h5-app build
pnpm --filter h5-app test
```

## 许可证

Apache-2.0
