# hai Admin Console

## 简介

一个可运行的 SvelteKit 管理后台示例，包含用户、角色、权限、审计和个人设置。也可以在组件展览和模块演示中试用框架能力。

## 核心功能清单

- 宽屏下工作区随窗口扩展，列表在自身区域内滚动；手机端自动收拢，登录框和长篇正文保留阅读宽度。

### 后台能力

- 🎨 **现代化 UI** — Svelte 5 Runes + TailwindCSS v4 + DaisyUI，主题切换
- 🔒 **API 传输加密** — 浏览器与 `/api/*` 默认通过 `@h-ai/crypto` 做密钥协商与请求/响应加解密
- 🔐 **完整认证流** — 登录 / 注册 / 忘记密码 / 重置密码，均基于 @h-ai/ui 场景组件
- 👥 **IAM 管理** — 用户、角色、权限 CRUD，操作审计日志；用户按角色 code 在数据库分页前筛选，总数与结果一致
- 💬 **问题反馈** — 默认开启，普通用户可提交，管理员分页查看、处理/撤销并导出离线诊断包
- 🧩 **UI Gallery** — @h-ai/ui 组件的交互式展览（4 分类标签页）
- 🔧 **模块演示** — Core、DB、Cache、Storage、AI（含多厂商文生图）、Crypto 交互式示例
- 🌍 **国际化** — Paraglide 集成，中英日文消息，中英日文实时切换
- 📱 **响应式布局** — Sidebar + TopBar 自适应，移动端友好
- 🧩 **组件自动导入** — 页面中使用 @h-ai/ui 组件无需显式 import

### 页面入口

- 🔐 登录：用户名密码登录（`/auth/login`）
- 📝 注册：新用户注册（`/auth/register`）
- 🔑 忘记密码：邮箱验证找回密码（`/auth/forgot-password`）
- 🔄 重置密码：Token 验证重置密码（`/auth/reset-password`）
- 🏠 仪表盘：统计卡片、近期活动、快捷操作（`/admin`）
- 👥 用户管理：用户 CRUD、角色分配（`/admin/iam/users`）
- 🎭 角色管理：角色 CRUD、权限绑定（`/admin/iam/roles`）
- 🛡️ 权限管理：权限 CRUD、审计日志（`/admin/iam/permissions`）
- 🧩 UI Gallery：组件交互式展示（4 标签页）（`/admin/ui-gallery`）
- 🔧 模块演示：Core / DB / Cache / Storage / AI（LLM、Audio、Image）/ Crypto 演示（`/admin/modules`）
- 💬 问题反馈：顶栏收集入口与管理员处理（`/admin/feedback`）
- ⚙️ 设置：主题切换、语言切换（`/admin/settings`）

#### 角色与演示行为

角色使用独立 code，改名不改变标识。角色资料与权限集合在同一事务保存；权限列表传空数组会清空，省略则保持原值。

角色列表通过 `iam.authz.getRoleUserCounts(roleIds)` 一次聚合当前页角色的真实成员数，返回 `HaiResult<Map<string, number>>`。无关联为 0；查询失败显示加载错误，不生成零统计。

管理端在线加密演示直接调用 Crypto SM3/SM4 API，SM4 使用随机临时密钥和 IV，并在显示成功前解密校验；密钥不保存。输入改变即清空旧结果，禁止用随机摘要或 Base64 伪装算法结果。

## 默认问题反馈

管理台提交的 config/_feedback.yml 默认启用问题反馈。启动时复用数据库、存储和 Reach，管理员通知使用配置的 email Provider；生产配置私有 S3、真实 SMTP 和通知地址。

普通 user 角色获得 feedback:create，可从顶栏直接提交空说明或附带图片；窄屏仍保留带可访问名称的入口。admin 角色获得 feedback:create/read/process/reopen/export，可打开 /admin/feedback，分页筛选、查看材料、处理或撤销并导出诊断包。创建者可读取自己的报告/续传材料；普通用户不能列出管理记录或执行管理操作。无角色且未授权的用户不显示提交入口，服务端仍拒绝请求。

采集失败可再次点击入口；提交失败保留说明、附件与现场，可重试或保存本地包。受理回执分别提示采集状态，受理不代表邮件已投递。权限沿用 IAM 默认 user/admin 角色，不新增角色体系。

## 使用入门

### 新手引导与帮助中心

登录后首次显示简短邀请，可开始、稍后或不再提醒。顶栏帮助按钮可搜索使用说明，随时重看后台导览或进入个人资料页进行操作导览。引导不会自动提交表单；完成状态通过 Cookie 按当前用户和引导版本保存。

内容定义在 `src/lib/guide/admin-guide.ts`，中英日文文案在应用 messages；为目标元素添加 data-guide 属性即可扩展步骤。交互、主题适配和安全 Markdown 渲染由 `@h-ai/ui/guide` 提供，根后台布局负责装配已有导航和 locale。浏览器用例覆盖首次完成、刷新、帮助搜索、跳转重看和手机暗色主题。

### 🚀 快速开始

#### 前置要求

- Node.js 22.23.4+ / 24.22.1+ / 26.12.1+
- pnpm ≥ 12.11.2

#### 安装与启动

默认 transport 必须从服务端私有环境或 `apps/admin-console/.env.local` 注入 `HAI_CRYPTO_TRANSPORT_SERVERKEYRING`，结构为 `{activeKeyId,keys:{id:{publicKey,privateKey}}}`；运行时不隐式生成。客户端公钥 registry 复用 reldb，多节点使用相同受管 ring 和共享数据库，不需要粘性路由。私钥不放公开 `_kit.yml`、PUBLIC_/VITE_、日志或浏览器配置。密钥由 Secret Manager/受管配置提供，轮换与撤销步骤见 [Crypto 传输说明](../../packages/crypto/README.md)。

```bash
# 在 hai-framework monorepo 根目录
pnpm install

# 按 .env.example 的字段说明，在 .env.local 中仅填写需要覆盖的私有值

# 启动开发服务器
pnpm --filter admin-console dev
```

浏览器打开 `http://localhost:5173` 即可访问。

首次启动且用户表为空时，只有配置 `HAI_ADMIN_DEFAULT_PASSWORD` 才会自动创建管理员：

| 项目   | 值                                |
| ------ | --------------------------------- |
| 用户名 | `admin`                           |
| 密码   | 来自 `HAI_ADMIN_DEFAULT_PASSWORD` |

请通过本地 `.env.local` 或密钥管理注入强密码；启动日志只显示用户名与密码来源，不输出明文密码。

#### 构建

```bash
pnpm --filter admin-console build
pnpm --filter admin-console preview
```

### ⚙️ 配置

本目录 `.env.example` 完整说明字段用途、枚举和范围；`.env` 为公共基础，`.env.dev` / `.env.test` / `.env.prod` 为公共环境覆盖，均提交 Git。`.env.local` 保存本机私有覆盖，不提交。优先级为进程环境 > `.env.local` > 环境文件 > `.env`。使用 `dev:test` / `dev:prod` 或 Node `start:test` / `start:prod` 切换，详见 [配置与环境变量](../../README.md#配置与环境变量)。

#### 环境变量

公共基础及环境文件已提交；将以下私有配置写入 `.env.local`，其他可选字段按 `.env.example` 启用：

```dotenv
# 用户表为空时创建 admin；仅在本机或目标部署环境注入。
HAI_ADMIN_DEFAULT_PASSWORD=<change-me-to-a-strong-local-password>
```

完整列表见 `.env.example`。

#### YAML 配置文件

- `config/_core.yml`：应用名称、版本、locale、功能开关
- `config/_db.yml`：数据库连接（SQLite / PostgreSQL / MySQL）
- `config/_cache.yml`：缓存类型与连接参数（memory / redis）
- `config/_iam.yml`：认证策略、密码策略、JWT、RBAC、种子数据
- `config/_kit.yml`：同源 transport 加密（密钥协商路径、是否强制加密、明文例外路径）
- `config/_storage.yml`：存储类型及参数（local / S3）

每个 YAML 叶子项都可由
`HAI_<配置名>_<YAML 路径>` 环境变量覆盖，且环境变量优先于 YAML 值。
例如 `_db.yml` 的 `database` 对应 `HAI_DB_DATABASE`，`_ai.yml` 的
`llm.apiKey` 对应 `HAI_AI_LLM_APIKEY`。camelCase key 不拆词。
`config/_kit.yml` 在服务启动时加载环境引用并校验，hooks 与 SSR 使用同一份 transport 配置。
SSR 只向浏览器传递公开的路径与开关，不包含 server 字段；修改环境后重启服务即可，无需重建。

#### 认证页面

协议支持配置中的 userAgreementMarkdown/privacyPolicyMarkdown 正文及 URL；同主题优先 Markdown，由安全渲染器在弹窗显示。

认证方式、注册、重置、协议和品牌由服务端 config/_iam.yml 控制。SvelteKit 页面消费 iam.publicConfig；移动/桌面页面从 API 服务读取公开配置。选用 Reach 时，初始化成功后传入 iam.init({ ...settings, reach })，使用标准通知模板。多节点共享 DB 与 Redis。UI 复用 AuthPanel/LoginForm 和框架认证动作，应用只负责业务导航与用户状态。

登录与注册页统一使用 `AuthPanel`，`ui` 可配置布局、标题、副标题、品牌、Logo 和配图。个人资料使用限宽布局与上下标签；用户名和邮箱规则通过 `UserProfile.fieldConstraints` 在失焦时显示，CRUD 新建/编辑也复用 UI 的失焦校验与错误修正。

[完整配置与安全约束](../../packages/iam/README.md)

LDAP 与 Reach 为可选集成。需要默认 LDAP 客户端时，在负责 IAM 的服务端 workspace 安装 ldapts，设置 `login.ldap: true` 与 LDAP 连接配置；也可注入自定义工厂。邮件/短信可以选择 Reach 标准模板，或直接注入 `onOtpSendEmail/onOtpSendSms/onPasswordResetRequest` 回调，投递失败须拒绝 Promise；回调第三参数 context 提供 expiresAt/idempotencyKey，发送服务按稳定键持久化去重，异常/超时为结果未知且不自动重发。协议在弹窗内展示；LoginForm/RegisterForm 的 `header/extraFields/footer` 和 AuthPanel 的 `login*/register*` snippet 可用于应用扩展。完整配置与自定义发送示例见 [IAM 用法](../../packages/iam/README.md#可选-ldap-与通知接入)。

### 🌍 国际化 (i18n)

本应用使用 [Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) 实现国际化。

- **翻译文件**：`messages/zh-CN.json`、`messages/en-US.json` 和 `messages/ja-JP.json`，包含 中英日文消息
- **编译命令**：`pnpm paraglide:compile` （编译后输出到 `src/lib/paraglide/`）
- **运行时切换**：Settings 页面可实时切换语言
- **服务端中间件**：`hooks.server.ts` 中的 `i18nHandle` 自动检测请求语言（跳过 `/api/*`）

添加新翻译：在 `messages/zh-CN.json`、`messages/en-US.json`、`messages/ja-JP.json` 中同时添加对应 key 即可。

### 🧩 @h-ai/ui 组件自动导入

`svelte.config.js` 中启用了 `@h-ai/ui/auto-import` 预处理器：

- 所有 `.svelte` 文件中使用 @h-ai/ui 组件标签时，自动注入 import 语句
- 无需手动编写 `import { Button } from '@h-ai/ui'`

### 🔧 扩展指南

#### 添加新页面

1. 在 `src/routes/admin/` 下创建目录和 `+page.svelte`
2. 页面可直接使用 @h-ai/ui 组件（自动导入）
3. 如需服务端数据，添加 `+page.server.ts` 配合 load 函数
4. 在 Sidebar 导航配置中添加菜单项
5. 在 `messages/` 下的两个语言文件中添加相关翻译 key

#### 添加新 API 端点

1. 在 `src/routes/api/` 下创建 `+server.ts`
2. 使用 @h-ai/kit 的 response helper 返回标准格式
3. 如需认证保护，路由会自动走 `hooks.server.ts` 中的 guard 逻辑（`/api/auth/*` 和 `/api/public/*` 除外）
4. 浏览器侧调用优先统一走 `$lib/utils/api.ts` 导出的 `apiFetch()`，以自动获得 CSRF + transport 加密
5. 若端点必须支持浏览器原生明文请求（如 `multipart/form-data` 上传、`<img src>` 公开文件、外部探活），需同步加入 `config/_kit.yml` 的 `transport.excludePaths`

#### 服务端错误处理

管理端数据读取在 HTTP 应用边界保留失败：查询异常返回 503 和可刷新错误页，分页任一页或权限关联失败均中止加载，禁止回退为空列表、零统计或空权限。未知权限代码返回 400，权限读取失败时不得继续写入。底层模块仍使用 HaiResult。

#### 添加新业务服务

1. 在 `src/lib/server/services/` 下创建服务文件
2. 在 `src/lib/server/services/index.ts` 中聚合导出

#### 表单布局

新增/编辑复用 `@h-ai/ui` 的 Form/FormLayout/FormField：可选一列或双列、标签独立成行或与控件同行，多行文本与多选自动跨列，窄容器自动收为一列。CRUD 使用 `form` 配置，字段可用 `colSpan` 覆盖。错误显示在字段附近并随 UI 语言更新。UI Gallery 的表单示例可切换四种布局；IAM 用户采用双列同行标签，角色采用双列顶部标签，个人资料与密码表单复用相同参数。

新建权限时资源和操作必填，权限名称留空时在提交阶段按 `resource:action` 生成；表单不会提前用名称必填校验阻止生成流程。

### 镜像构建与部署

在本应用目录执行，镜像定义为 `images/app.Dockerfile`，`hai.json` 的 `build.images` 指定文件与仓库根构建上下文。Web 运行配置位于 `images/web/`（如有）。应用版本来自本目录的 `package.json.version`。

```sh
pnpm build:images                         # 只构建镜像并导出 tar
pnpm run deploy --env prod --build        # 构建、打包、上传、启动并检查访问
pnpm run deploy --env prod --build --bundle-only --output release-prod.tar
```

先准备 `.env.prod` 与项目根 `hai.json` 的 `deploy`；首次向导以说明文字收集服务器连接信息并保存到 `.env.local`。完整离线包包含应用和自建中间件镜像，目标 Linux 需预装容器引擎、Compose 与脚本要求的工具。把本次 `.hai/deploy/<环境>/bundle-*/` 整个目录复制到操作机（tar、配置和脚本均在其中），Windows 执行 `deploy.ps1`，Linux/macOS 执行 `deploy.sh`；完全隔离的服务器复制整个交付目录后执行 `sh deploy-local.sh`，自动解包并部署。

已有成功安装时，可用 `--services app` 只更新本应用；多个镜像的工程按服务名选择。局部发布保留其他容器和持久化卷，不执行整个项目 `down`，失败保留诊断并尝试恢复旧容器。相同版本允许重建，每次以独立构建 ID 区分内容。`images/dependencies/` 为忽略 Git 的依赖输入，配合引擎缓存和分层减少重复下载。

完整参数、缓存、版本与恢复说明见[使用指南](../../docs/usage/README.md#4-编译源码与打包产物)。移动端和桌面端的原生安装包仍需在对应系统另行构建；容器部署交付的是 Web 页面。

### 🧪 开发命令

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

### 🛠️ 技术栈

- **前端框架**：SvelteKit 2 + Svelte 5 (Runes)
- **样式**：TailwindCSS v4 + DaisyUI
- **语言**：TypeScript 6 / 7
- **构建工具**：Vite 6
- **i18n**：Paraglide
- **包管理**：pnpm

### 📦 框架依赖

- `@h-ai/core`：配置管理、日志、HaiResult 模式、错误处理
- `@h-ai/reldb`：数据库抽象（SQLite / PostgreSQL / MySQL）
- `@h-ai/iam`：用户、角色、权限、认证、RBAC
- `@h-ai/cache`：缓存（Memory / Redis）
- `@h-ai/storage`：文件存储（Local / S3）
- `@h-ai/crypto`：加密（非对称 / 哈希 / 对称 / 密码哈希）
- `@h-ai/ai`：AI 集成
- `@h-ai/kit`：SvelteKit hooks、guards、中间件、校验
- `@h-ai/ui`：UI 组件库（组件、场景组件、自动导入）

### 📄 许可证

Apache License 2.0

## 开发测试

浏览器验证使用 `pnpm --filter admin-console test:e2e` 托管入口分配绝对数据目录，服务子进程显式选择隔离的 SQLite/Memory/Local，不继承外部模块变量或读取用户 `.env.local`。原有 transport 开启/关闭两组保持独立，开启组使用本轮可信 SM2 ring 与实际 registry；普通开发和生产配置规则不变。

```sh
pnpm --filter admin-console typecheck
pnpm --filter admin-console lint
pnpm --filter admin-console build
pnpm --filter admin-console test
```

## 界面设计与交互示例

`/admin/ui-gallery/compounds` 的列表状态示例展示加载、空态、错误恢复、筛选、排序、分页与键盘操作。页面沿 [共享设计约定](../../.agents/instructions/ui-design.md) 和 hai-ui-design → hai-ui → hai-ui-review 工作流维护；浏览器测试覆盖实际渲染与交互，外部服务和原生平台另行验收。

## 许可证

Apache-2.0
