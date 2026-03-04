# hai H5 App

> 基于 hai-framework 构建的 SvelteKit 移动端 H5 示例应用，展示拍照识别、用户认证、购物车等移动场景。

## ✨ 特性

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

## 🚀 快速开始

### 前置要求

- Node.js ≥ 20
- pnpm ≥ 9

### 安装与启动

```bash
# 在 hai-framework monorepo 根目录
pnpm install

# 复制环境变量（按需修改）
cp apps/h5-app/.env.example apps/h5-app/.env

# 启动开发服务器
pnpm --filter h5-app dev
```

浏览器打开 `http://localhost:5175` 即可访问。

### 构建

```bash
pnpm --filter h5-app build
pnpm --filter h5-app preview
```

## 📋 功能模块

- 🏠 首页：应用入口（`/`）
- 📷 发现/识别：拍照识别图片内容（`/discover`）
- 🔐 登录：用户登录（`/auth/login`）
- 📝 注册：用户注册（`/auth/register`）
- 🛒 购物车：购物车管理（`/cart`）
- 👤 个人中心：用户档案（`/profile`）

## ⚙️ 配置

### YAML 配置文件

- `config/_core.yml`：应用名称、版本、运行环境
- `config/_db.yml`：数据库连接（SQLite / PostgreSQL / MySQL）
- `config/_cache.yml`：缓存类型及连接参数（memory / Redis）
- `config/_iam.yml`：认证策略、密码策略、JWT
- `config/_storage.yml`：存储类型及参数（local / S3）
- `config/_ai.yml`：AI 模型配置（多模态识别）

配置值支持 `${ENV_VAR:default}` 语法引用环境变量。

### 环境变量

| 变量名                | 说明                          | 默认值             |
| --------------------- | ----------------------------- | ------------------ |
| `HAI_DB_TYPE`         | 数据库类型                    | `sqlite`           |
| `HAI_DB_DATABASE`     | 数据库路径/地址               | `./data/h5-app.db` |
| `HAI_CACHE_TYPE`      | 缓存类型                      | `memory`           |
| `HAI_STORAGE_TYPE`    | 存储类型                      | `local`            |
| `HAI_OPENAI_API_KEY`  | OpenAI API Key（AI 识别必填） | —                  |
| `HAI_OPENAI_BASE_URL` | OpenAI API 基础 URL           | —                  |
| `HAI_AI_MODEL`        | AI 模型名称                   | —                  |
| `HAI_SESSION_SECRET`  | Session 密钥（≥32 字符）      | —                  |

## 🌍 国际化 (i18n)

本应用使用 [Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) 实现国际化。

- **翻译文件**：`messages/zh-CN.json` 和 `messages/en-US.json`
- **编译命令**：`pnpm paraglide:compile`
- **运行时切换**：页面可实时切换语言

添加新翻译：在 `messages/zh-CN.json` 和 `messages/en-US.json` 中同时添加对应 key 即可。

## 🧪 开发命令

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

## 📦 框架依赖

- `@h-ai/core`：配置管理、日志、Result 模式、错误处理
- `@h-ai/reldb`：数据库抽象（SQLite / PostgreSQL / MySQL）
- `@h-ai/iam`：用户认证（登录 / 注册 / Session）
- `@h-ai/cache`：缓存（Memory / Redis）
- `@h-ai/storage`：文件存储（Local / S3）
- `@h-ai/ai`：AI 集成（多模态识别）
- `@h-ai/kit`：SvelteKit hooks、guards、中间件、校验
- `@h-ai/ui`：UI 组件库（场景组件、自动导入）
