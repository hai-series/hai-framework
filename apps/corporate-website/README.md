# hai Corporate Website

## 简介

基于 hai-framework 构建的 SvelteKit 企业官网示例应用，包含企业展示、合作登记、合作管理后台及 AI 客服等功能。

## 核心功能清单

- 宽屏下工作区随窗口扩展，列表在自身区域内滚动；手机端自动收拢，登录框和长篇正文保留阅读宽度。

### ✨ 特性

联系表单只有在接口明确返回 `data.sent: true` 时显示成功并清空输入。未配置邮件或发送失败时保留表单，用户可以重试或使用页面上的其他联系方式。

- 🏢 **企业展示** — 首页、关于我们、服务介绍、新闻资讯、联系我们
- 🤝 **合作登记** — 公开表单提交合作申请，管理后台审核记录
- 🤖 **AI 客服** — 在线智能客服对话（@h-ai/ai）
- 💾 **数据持久化** — @h-ai/reldb（SQLite / PostgreSQL / MySQL）
- ⚡ **缓存加速** — @h-ai/cache（memory / Redis）
- 📂 **文件归档** — @h-ai/storage（local / S3）
- 📧 **消息触达** — @h-ai/reach（邮件 / 短信 通知）
- 🌍 **国际化** — Paraglide 集成，中英日文实时切换
- 🎨 **主题切换** — 基于 @h-ai/ui 的 DaisyUI 多主题支持
- 🧩 **组件自动导入** — @h-ai/ui 组件无需显式 import

### 📋 功能模块

- 🏠 首页：企业概览与快捷入口（`/`）
- 📖 关于我们：企业介绍（`/about`）
- 🛠️ 服务介绍：业务与服务展示（`/services`）
- 📰 新闻资讯：新闻与动态（`/news`）
- 📞 联系我们：联系方式与留言（`/contact`）
- 🤝 合作登记：公开合作申请表单（`/partners`）
- 🔐 合作管理后台：登录后查看与管理登记记录（`/partners/admin`）

合作管理列表统一使用卡片内查询栏、独立滚动 DataTable 和底部分页；查询/Enter 提交条件，翻页和排序沿用已提交值。记录接口支持 sortBy（created_at/company_name/contact_name/cooperation_type/budget_range/status）及 sortDirection（asc/desc），排序字段通过白名单校验，缓存键包含排序条件。

#### 合作管理后台账号

用户名默认是 `partner-admin`，密码必须通过 `HAI_PARTNER_PASSWORD` 注入。应用不会提供默认密码，也不会把凭据写入日志；缺少密码时启动阶段会返回明确的配置错误。

## 使用入门

### 🚀 快速开始

#### 前置要求

- Node.js 22.23.4+ / 24.22.1+ / 26.12.1+
- pnpm ≥ 12.11.2

#### 安装与启动

```bash
# 在 hai-framework monorepo 根目录
pnpm install

# 按 .env.example 的字段说明，在 .env.local 中仅填写需要覆盖的私有值

# 启动开发服务器
pnpm --filter corporate-website dev
```

浏览器打开 `http://localhost:5174` 即可访问。

#### 构建

```bash
pnpm --filter corporate-website build
pnpm --filter corporate-website preview
```

### ⚙️ 配置

本目录 `.env.example` 完整说明字段用途、枚举和范围；`.env` 为公共基础，`.env.dev` / `.env.test` / `.env.prod` 为公共环境覆盖，均提交 Git。`.env.local` 保存本机私有覆盖，不提交。统一优先级为进程 > `.env.<mode>.local` > `.env.local` > `.env.<mode>` > `.env` > YAML。同源父 JSON 为基础、细项覆盖；高来源整段替换清掉低来源细项。模式私有文件不提交 Git。使用 `dev:test` / `dev:prod` 或 Node `start:test` / `start:prod` 切换，详见 [配置与环境变量](../../docs/usage/configuration/runtime.md)。

#### YAML 配置文件

- `config/_core.yml`：应用名称、版本、运行环境
- `config/_db.yml`：数据库连接（SQLite / PostgreSQL / MySQL）
- `config/_cache.yml`：缓存类型及连接参数（memory / Redis）
- `config/_storage.yml`：存储类型及参数（local / S3）
- `config/_vecdb.yml`：向量存储（开发 LanceDB，生产共享 Qdrant；URL/API Key 仅服务端）
- `config/_ai.yml`：AI 模型配置
- `config/_reach.yml`：消息通知配置
- `config/partner.yml`：合作管理后台管理员账号配置

每个 YAML 叶子项都可由 `HAI_<配置名>_<YAML 路径>` 环境变量覆盖，
且环境变量优先于 YAML 值；camelCase key 不拆词。

#### 环境变量

配置 `HAI_AI_LLM_APIKEY`（或模型条目的 API Key）才启用 AI；未配置时跳过 AI 与向量连接。启用后顺序为关系库 → 向量库 → AI，向量配置/连接或 AI 初始化失败会中止启动并逆序释放本次创建的资源，保留调用方已有实例；清理失败在下次启动前继续重试。生产 AI 要求共享 PostgreSQL/MySQL 与 Qdrant/pgvector/远端 Chroma，不能使用 SQLite/本地 LanceDB 或临时内存 Store。默认 `.env.prod` 使用 PostgreSQL、Redis 和 Qdrant；启动前配置服务端连接及私有 Key。

- `HAI_VECDB_TYPE`：开发默认 `lancedb`，生产默认 `qdrant`。
- `HAI_VECDB_PATH`：开发 LanceDB 目录，默认 `./data/vecdb`。
- `HAI_VECDB_URL`：共享向量服务地址（Qdrant 示例 `http://qdrant:6333`）。
- `HAI_VECDB_APIKEY`：向量服务私有凭据，不能使用 PUBLIC_/VITE_ 前缀。

| 变量名                  | 说明                                     | 默认值                        |
| ----------------------- | ---------------------------------------- | ----------------------------- |
| `HAI_DB_TYPE`           | 数据库类型                               | `sqlite`                      |
| `HAI_DB_DATABASE`       | 数据库路径/地址                          | `./data/corporate-website.db` |
| `HAI_CACHE_TYPE`        | 缓存类型                                 | `memory`                      |
| `HAI_STORAGE_TYPE`      | 存储类型                                 | `local`                       |
| `HAI_PARTNER_USERNAME`  | 合作管理后台用户名                       | `partner-admin`               |
| `HAI_PARTNER_PASSWORD`  | 合作管理后台密码（必填）                 | _（无）_                      |
| `HAI_CONTACT_RECIPIENT` | 联系表单邮件接收地址（未配置则跳过发送） | _（无）_                      |

### 🌍 国际化 (i18n)

本应用使用 [Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) 实现国际化。

- **翻译文件**：`messages/zh-CN.json`、`messages/en-US.json`、`messages/ja-JP.json`
- **编译命令**：`pnpm paraglide:compile`
- **运行时切换**：页面可实时切换语言

添加新翻译：在 `messages/zh-CN.json`、`messages/en-US.json`、`messages/ja-JP.json` 中同时添加对应 key 即可。

### 镜像构建与部署

在本应用目录执行，镜像定义为 `images/web.Dockerfile`，`hai.json` 的 `build.images` 指定文件与仓库根构建上下文。Web 运行配置位于 `images/web/`（如有）。容器角色为 web，项目身份来自本目录的 package.json.name；应用版本来自本目录的 `package.json.version`。

```sh
pnpm build:images                         # 只构建镜像并导出 tar
pnpm run deploy --env prod --build        # 构建、打包、上传、启动并检查访问
pnpm run deploy --env prod --build --bundle-only --output release-prod.tar
```

先准备 `.env.prod` 与项目根 `hai.json` 的 `deploy`；首次向导以说明文字收集服务器连接信息并保存到 `.env.local`。完整离线包包含应用和自建中间件镜像，目标 Linux 需预装容器引擎、Compose 与脚本要求的工具。把本次 `.hai/deploy/<环境>/bundle-*/` 整个目录复制到操作机（tar、配置和脚本均在其中），Windows 执行 `deploy.ps1`，Linux/macOS 执行 `deploy.sh`；完全隔离的服务器复制整个交付目录后执行 `sh deploy-local.sh`，自动解包并部署。

已有成功安装时，可用 `--services web` 只更新本应用；多个镜像的工程按服务名选择。局部发布保留其他容器和持久化卷，不执行整个项目 `down`，失败保留诊断并尝试恢复旧容器。相同版本允许重建，每次以独立构建 ID 区分内容。`images/dependencies/` 为忽略 Git 的依赖输入，配合引擎缓存和分层减少重复下载。

完整参数、缓存、版本与恢复说明见[使用指南](../../docs/usage/README.md#4-编译源码与打包产物)。移动端和桌面端的原生安装包仍需在对应系统另行构建；容器部署交付的是 Web 页面。

### 🧪 开发命令

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

### 📦 框架依赖

- `@h-ai/core`：配置管理、日志、HaiResult 模式、错误处理
- `@h-ai/reldb`：数据库抽象（SQLite / PostgreSQL / MySQL）
- `@h-ai/cache`：缓存（Memory / Redis）
- `@h-ai/storage`：文件存储（Local / S3）
- `@h-ai/ai`：AI 集成（智能客服）
- `@h-ai/reach`：消息触达（邮件 / 短信）
- `@h-ai/kit`：SvelteKit hooks、guards、中间件、校验
- `@h-ai/ui`：UI 组件库（场景组件、自动导入）

失败与降级提示也必须国际化：官网 API 按请求 locale 生成 AI 降级/邮件送达状态；未送达不能称为已接收。CLI 部署状态使用 cliM，Gallery 加密能力限制使用三语消息。中文、英文与日语分别验证未配置、失败和成功路径，无需调用付费服务。

## 开发测试

浏览器验证通过 `pnpm --filter corporate-website test:e2e` 分配本轮绝对数据目录。服务子进程显式选择隔离的 SQLite/Memory/Local，清除继承的模块变量并跳过用户 `.env.local`；普通开发和生产的 dotenv 与共享后端要求不变。

```sh
pnpm --filter corporate-website typecheck
pnpm --filter corporate-website lint
pnpm --filter corporate-website build
pnpm --filter corporate-website test
```

## 许可证

Apache-2.0
