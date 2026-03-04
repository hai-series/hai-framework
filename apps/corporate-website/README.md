# hai Corporate Website

> 基于 hai-framework 构建的 SvelteKit 企业官网示例应用，包含企业展示、合作登记、合作管理后台及 AI 客服等功能。

## ✨ 特性

- 🏢 **企业展示** — 首页、关于我们、服务介绍、新闻资讯、联系我们
- 🤝 **合作登记** — 公开表单提交合作申请，管理后台审核记录
- 🤖 **AI 客服** — 在线智能客服对话（@h-ai/ai）
- 💾 **数据持久化** — @h-ai/reldb（SQLite / PostgreSQL / MySQL）
- ⚡ **缓存加速** — @h-ai/cache（memory / Redis）
- 📂 **文件归档** — @h-ai/storage（local / S3）
- 📧 **消息触达** — @h-ai/reach（邮件 / 短信通知）
- 🌍 **国际化** — Paraglide 集成，中英文实时切换
- 🎨 **主题切换** — 基于 @h-ai/ui 的 DaisyUI 多主题支持
- 🧩 **组件自动导入** — @h-ai/ui 组件无需显式 import

## 🚀 快速开始

### 前置要求

- Node.js ≥ 20
- pnpm ≥ 9

### 安装与启动

```bash
# 在 hai-framework monorepo 根目录
pnpm install

# 启动开发服务器
pnpm --filter corporate-website dev
```

浏览器打开 `http://localhost:5174` 即可访问。

### 构建

```bash
pnpm --filter corporate-website build
pnpm --filter corporate-website preview
```

## 📋 功能模块

- 🏠 首页：企业概览与快捷入口（`/`）
- 📖 关于我们：企业介绍（`/about`）
- 🛠️ 服务介绍：业务与服务展示（`/services`）
- 📰 新闻资讯：新闻与动态（`/news`）
- 📞 联系我们：联系方式与留言（`/contact`）
- 🤝 合作登记：公开合作申请表单（`/partners`）
- 🔐 合作管理后台：登录后查看与管理登记记录（`/partners/admin`）

## ⚙️ 配置

### YAML 配置文件

- `config/_core.yml`：应用名称、版本、运行环境
- `config/_db.yml`：数据库连接（SQLite / PostgreSQL / MySQL）
- `config/_cache.yml`：缓存类型及连接参数（memory / Redis）
- `config/_storage.yml`：存储类型及参数（local / S3）
- `config/_ai.yml`：AI 模型配置
- `config/_reach.yml`：消息通知配置
- `config/partner.yml`：合作管理后台管理员账号配置

配置值支持 `${ENV_VAR:default}` 语法引用环境变量。

### 环境变量

| 变量名                       | 说明               | 默认值                |
| ---------------------------- | ------------------ | --------------------- |
| `HAI_DB_TYPE`                | 数据库类型         | `sqlite`              |
| `HAI_DB_DATABASE`            | 数据库路径/地址    | `./data/corporate.db` |
| `HAI_CACHE_TYPE`             | 缓存类型           | `memory`              |
| `HAI_STORAGE_TYPE`           | 存储类型           | `local`               |
| `HAI_PARTNER_ADMIN_USERNAME` | 合作管理后台用户名 | —                     |
| `HAI_PARTNER_ADMIN_PASSWORD` | 合作管理后台密码   | —                     |

## 🌍 国际化 (i18n)

本应用使用 [Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) 实现国际化。

- **翻译文件**：`messages/zh-CN.json` 和 `messages/en-US.json`
- **编译命令**：`pnpm paraglide:compile`
- **运行时切换**：页面可实时切换语言

添加新翻译：在 `messages/zh-CN.json` 和 `messages/en-US.json` 中同时添加对应 key 即可。

## 🧪 开发命令

```bash
pnpm --filter corporate-website dev              # 启动开发服务器
pnpm --filter corporate-website build            # 构建生产版本
pnpm --filter corporate-website preview          # 预览生产版本
pnpm --filter corporate-website check            # Svelte + TypeScript 类型检查
pnpm --filter corporate-website lint             # ESLint 代码检查
pnpm --filter corporate-website test             # 运行单元测试（Vitest）
pnpm --filter corporate-website test:e2e         # 运行 E2E 测试（Playwright）
pnpm --filter corporate-website paraglide:compile # 编译 i18n 翻译文件
```

## 📦 框架依赖

- `@h-ai/core`：配置管理、日志、Result 模式、错误处理
- `@h-ai/reldb`：数据库抽象（SQLite / PostgreSQL / MySQL）
- `@h-ai/cache`：缓存（Memory / Redis）
- `@h-ai/storage`：文件存储（Local / S3）
- `@h-ai/ai`：AI 集成（智能客服）
- `@h-ai/reach`：消息触达（邮件 / 短信）
- `@h-ai/kit`：SvelteKit hooks、guards、中间件、校验
- `@h-ai/ui`：UI 组件库（场景组件、自动导入）
