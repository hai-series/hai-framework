# hai H5 App

## 简介

基于 hai-framework 构建的 SvelteKit 移动端 H5 示例应用，展示拍照识别、用户认证、购物车等移动场景。

可从现有主题入口选择“护眼”（`eye-care`）：暖绿色背景、深色文字与清晰焦点，刷新后保留；原有默认主题不变。

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
- 🌍 **国际化** — Paraglide 集成，中英日文实时切换
- 🎨 **主题切换** — 基于 @h-ai/ui 的 DaisyUI 多主题支持
- 📱 **移动优先** — 针对移动端优化的响应式布局
- 🧩 **组件自动导入** — @h-ai/ui 组件无需显式 import

识图历史和图片按已登录用户隔离。新图片保存到用户专属的 `uploads/<用户>/` 或 `vision/<用户>/`，浏览器通过同源会话授权端点读取，响应不进入公共缓存。私有目录、其他用户图片以及旧版没有所有者的图片键均拒绝读取。升级为识图表补充可空 `user_id`，保留旧记录及文件，未知归属不自动分配给任何用户；确认归属和迁移旧文件由部署者在备份后单独处理。升级前停止旧版写入。

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

- Node.js 22.23.4+ / 24.22.1+ / 26.12.1+
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

本目录 `.env.example` 完整说明字段用途、枚举和范围；`.env` 为公共基础，`.env.dev` / `.env.test` / `.env.prod` 为公共环境覆盖，均提交 Git。`.env.local` 保存本机私有覆盖，不提交。统一优先级为进程 > `.env.<mode>.local` > `.env.local` > `.env.<mode>` > `.env` > YAML。同源父 JSON 为基础、细项覆盖；高来源整段替换清掉低来源细项。模式私有文件不提交 Git。使用 `dev:test` / `dev:prod` 或 Node `start:test` / `start:prod` 切换，详见 [配置与环境变量](../../docs/usage/configuration/runtime.md)。

#### YAML 配置文件

- `config/_core.yml`：应用名称、版本、运行环境
- `config/_db.yml`：数据库连接（SQLite / PostgreSQL / MySQL）
- `config/_cache.yml`：缓存类型及连接参数（memory / Redis）
- `config/_iam.yml`：认证策略、密码策略、JWT
- `config/_storage.yml`：存储类型及参数（local / S3）
- `config/_vecdb.yml`：向量存储（开发 LanceDB，生产共享 Qdrant；URL/API Key 仅服务端）
- `config/_ai.yml`：AI 模型配置（多模态识别）

每个 YAML 叶子项都可由 `HAI_<配置名>_<YAML 路径>` 环境变量覆盖，
且环境变量优先于 YAML 值；camelCase key 不拆词。

#### 环境变量

配置 `HAI_AI_LLM_APIKEY`（或模型条目的 API Key）才启用 AI；未配置时跳过 AI 与向量连接。启用后顺序为关系库 → 向量库 → AI，向量配置/连接或 AI 初始化失败会中止启动并逆序释放本次创建的资源，保留调用方已有实例；清理失败在下次启动前继续重试。生产 AI 要求共享 PostgreSQL/MySQL 与 Qdrant/pgvector/远端 Chroma，不能使用 SQLite/本地 LanceDB 或临时内存 Store。默认 `.env.prod` 使用 PostgreSQL、Redis 和 Qdrant；启动前配置服务端连接及私有 Key。

- `HAI_VECDB_TYPE`：开发默认 `lancedb`，生产默认 `qdrant`。
- `HAI_VECDB_PATH`：开发 LanceDB 目录，默认 `./data/vecdb`。
- `HAI_VECDB_URL`：共享向量服务地址（Qdrant 示例 `http://qdrant:6333`）。
- `HAI_VECDB_APIKEY`：向量服务私有凭据，不能使用 PUBLIC_/VITE_ 前缀。

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
pnpm --filter h5-app dev              # 启动开发服务器
pnpm --filter h5-app build            # 构建生产版本
pnpm --filter h5-app preview          # 预览生产版本
pnpm --filter h5-app check            # Svelte + TypeScript 类型检查
pnpm --filter h5-app lint             # ESLint 代码检查
pnpm --filter h5-app test             # 运行单元测试（Vitest）
pnpm --filter h5-app test:e2e         # 运行 E2E 测试（Playwright）
pnpm --filter h5-app paraglide:compile # 编译 i18n 翻译文件
```

## 框架能力导航

本应用的启动、页面和业务操作按上文执行；各框架模块的完整用途、输入输出、配置和错误处理见下表。不要从应用示例推断模块全部能力；服务端与浏览器入口按对应模块契约选择。

| 模块                                              | 本应用相关能力                 |
| ------------------------------------------------- | ------------------------------ |
| [@h-ai/ai](../../packages/ai/README.md)           | 模型、记忆与工具流程           |
| [@h-ai/cache](../../packages/cache/README.md)     | 共享缓存与会话状态             |
| [@h-ai/core](../../packages/core/README.md)       | 配置、日志、结果与国际化       |
| [@h-ai/iam](../../packages/iam/README.md)         | 身份、会话与权限               |
| [@h-ai/kit](../../packages/kit/README.md)         | SvelteKit 路由、请求与页面集成 |
| [@h-ai/reach](../../packages/reach/README.md)     | 邮件、短信与通知               |
| [@h-ai/reldb](../../packages/reldb/README.md)     | 关系型数据库与事务             |
| [@h-ai/storage](../../packages/storage/README.md) | 私有文件与对象存储             |
| [@h-ai/ui](../../packages/ui/README.md)           | 页面、表单和交互组件           |
| [@h-ai/vecdb](../../packages/vecdb/README.md)     | 向量集合与检索                 |

## 开发测试

浏览器验证通过 `pnpm --filter h5-app test:e2e` 分配本轮绝对数据目录。服务子进程显式选择隔离的 SQLite/Memory/Local，清除继承的模块变量并跳过用户 `.env.local`；普通开发和生产的 dotenv 与共享后端要求不变。

```sh
pnpm --filter h5-app typecheck
pnpm --filter h5-app lint
pnpm --filter h5-app build
pnpm --filter h5-app test
```

## 许可证

Apache-2.0
