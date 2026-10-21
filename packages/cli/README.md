# @h-ai/cli

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

> hai Agent Framework CLI — 交互式项目脚手架与代码生成工具。

## 支持的能力

`hai deploy` 的缺失模块/配置、凭证加载、扫描、初始化、部署和关闭失败均以非零退出码结束；脚本必须检查退出码。只有完整部署成功才可作为后续步骤的成功条件。

- **项目创建** — 交互式引导创建 SvelteKit 应用、Svelte 5 移动/桌面前端与 hai 后端项目
- **模块添加** — 向现有项目增量启用模块，自动解析依赖
- **配置初始化** — 校验项目配置完整性，补全缺失的配置文件
- **代码生成** — 快速生成页面、组件、API 端点、数据模型、数据库迁移
- **模板选择** — 最小 / 标准 / 完整 / 自定义四种项目模板
- **功能组合** — 按需启用 IAM、DB、AI、Storage、Crypto 等模块
- **API 服务脚手架** — API Service 模板使用 `@h-ai/api-contract` + `@h-ai/serv` 组合公共 contract / procedures，并通过 `@h-ai/api-client` typed client 消费
- **自动依赖解析** — 选择功能时自动补全依赖（如 IAM 自动引入 Crypto）

## AI 使用指南

CLI 从 `templates/skills/` 将所选 skill 的完整目录复制到生成项目 `.agents/skills/`。`SKILL.md` 提供能力边界和任务导航，`reference.md`/`guide.md` 保留按需范本；同步时不能只复制入口。AGENTS.md 保存应用约束，Claude/Copilot 桥接文件引用它；修改模板需同步相关仓库 skills。模板生成测试会核对参考文件的完整交付。

业务以用户当前明确要求及其指定的需求/设计文档为准。模板 AGENTS、README、skills、生成代码及测试中的角色/权限、流程、限额和架构是可调整的初始方案。审查将差异列为模板适配项，不因偏离模板判定需求错误；实施按授权同步修改冲突代码、测试和过期规则。框架 API 仍以安装版本公开契约为准，服务端授权、资源隔离、输入校验和凭据保护仍需落实。已有项目需显式合并这些规则，`hai init` 不覆盖现有文件。

所有应用类型均交付 `hai-spec-review`：生成前严格检查需求/设计文档的完备性、歧义、技术及框架使用错误、命名一致性，给出带位置和修正建议的问题清单；问题解决且证据充分后才判定可以进入 AI 生成。`hai init` / `hai add` 同时为已有项目补齐该工作流 skill，保留自定义文件。

审查后的文档实施使用独立的 `hai-spec-implement`，同样交付到所有应用并由 `hai init` / `hai add` 补齐。AI 按可独立验收的功能和实际依赖决定是否拆分，默认写入 `docs/task-list.md` 与 `docs/tasks/<编号>-<slug>.md`；每项在独立 Git 分支走 TDD、门禁、本地合并，记录真实合并提交后更新清单。返修复用原任务编号、文件和分支，追加轮次并关联此前证据。流程复用 Markdown、Git 和已有开发/测试 skills，无新增运行依赖或工作流引擎。可以请求“只根据 docs/需求.md 拆分任务”“根据该文档生成代码”“执行 T003”或“T002 返修后合并”；仅规划时不实施，指定任务先核验依赖，远端操作依实际授权。

需求/设计文档提交后，可以请求“我修改了 docs/需求.md、docs/设计.md，请帮我更新实现”。Skill 在原清单中区分已验收文档 SHA、固定目标文档 SHA 与已验收实现 SHA，比较完整文档集合的净差异（含增删、重命名及关联影响），更新原任务或新建任务，逐项在对应分支测试、合并。全部差异处理且整体验收通过后，才提交新的已验收基线；部分完成或中断保留旧基线。旧项目缺少可信基线时先追溯/核验，不猜测版本。详见 [文档差异与基线流程](templates/skills/hai-spec-implement/changes.md)。`hai init` / `hai add` 会补齐新增参考文件，已存在的入口、执行流程和任务范本仍须对照模板合并。

日常新增、修改、修复功能由 `AGENTS.md` 引导读取 `hai-app-create/SKILL.md` 与 `development.md`：先把需求映射到框架现成功能、配置和扩展点，再依据当前安装版本的 exports/类型实现。适用能力优先复用；能力不足时说明具体缺口，不为模块覆盖率安装无关依赖。Codex 使用 `.agents/skills/`，仍需遵循项目根 `AGENTS.md` 的常驻规则。

工具入口共享同一份规则与技能：Codex/Cursor 使用 AGENTS 与 `.agents/skills/`；Copilot 的 `.github/copilot-instructions.md` 只引用共享 `AGENTS.md`，不另保存各应用类型规则；OpenCode 的 opencode.json 通过 `instructions: ["AGENTS.md"]` 直接引用共享规则。Claude Code 的根 CLAUDE.md 仅包含 `@AGENTS.md`，通过共享规则的任务导航按需读取 `.agents/skills/` 正文和参考文件。CLI 不创建 `.claude/`，无需重复技能或符号链接。此模式不提供 Claude 原生技能自动发现或 `/skill` 命令；项目已有的 Claude 设置与技能保留。依据：[Claude 项目指引](https://code.claude.com/docs/en/memory)、[Claude 原生 skills](https://code.claude.com/docs/en/skills)、[Copilot](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)、[OpenCode](https://docs.opencode.ai/docs/skills/)、[Cursor](https://cursor.com/docs/skills)。

Codex 原生发现 `.agents/skills/` 并按任务自动选择，也可显式输入 `$hai-app-create`、`$hai-app-review` 等名称调用；入口和参考文件保持按需读取。无需额外 `.codex/skills` 或 Copilot 设置。依据：[Codex skills](https://learn.chatgpt.com/docs/build-skills)、[AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)。

Claude Code v2.1.277 起也可直接读取根 `AGENTS.md`（没有更高优先级项目 CLAUDE 文件且相关内置插件启用时）。保留这一行导入可兼容旧版及未开启该能力的会话，官方说明导入不会重复加载规则；仍无须 `.claude/` 目录。参见 [AGENTS.md 支持](https://code.claude.com/docs/en/memory#agentsmd)。

生成项目共享 `eslint-rules.js`，lint 拦截显式 `any`、console、无理由抑制、双重 unknown 断言、框架内部源码导入及明确的 localStorage 敏感键写入；合理的第三方 workaround 需局部说明。静态规则不能证明权限隔离、输入安全、事务或日志脱敏，相关行为仍需测试与审查。

已有项目先更新 CLI，再运行 `hai init` 补齐缺失的流程 skill、参考资源和入口；该操作保留现有文件，即使 `--force` 也不覆盖 AI 规则。旧入口、已存在的 skills、ESLint 配置与脚本需要对照新生成项目合并，缺失的 .npmrc/.gitignore 也需补齐；只补文件不会自动升级旧规则。模板变更未发布前可通过本仓库构建的 CLI 生成对照项目，不要把未发布能力当作已安装包能力。

AI 文件写入前会解析已有文件和目录链接；共享技能与项目桥接文件均限制在当前项目内。链接指向项目外时停止写入。已有 `.claude/` 目录及其链接不参与生成，`hai init` / `hai add` 不修改或删除其中的内容。

交付验证同时检查发布归档和生成项目。`.npmrc` / `.gitignore` 在模板源中使用 `.hbs` 后缀，避免打包时被排除；生成时仍恢复正常文件名，保留依赖布局与敏感产物忽略规则。归档回归检查全部模板都进入 `.tgz`，不能仅验证源码目录中的 create。

## 快速开始

要求 Node.js 22.22.2+ / 24.15.0+ / 26+；生成的根项目和工作区包均声明相同最低版本。

### 安装 CLI

先全局安装 `@h-ai/cli`，它提供 `hai` 命令；以下快速开始示例均以完成安装为前提。

```bash
pnpm add -g @h-ai/cli
hai --version
```

PowerShell 中使用 `pnpm.cmd add -g @h-ai/cli`。已安装 CLI 时，执行相同安装命令可更新到当前发布版本；使用 `hai --help` 核对可用命令。仓库内未发布的模板按下方“开发阶段本地使用”构建并运行。

### 创建项目

生成项目的 `@h-ai/*` 依赖固定为 CLI 对应版本；pnpm 通过 `catalog:` 引用该精确版本。升级时统一更新框架包并验证 lockfile 中实际解析的版本。

在应用仓库对 AI 说“升级 Hai-framework 到最新版本”，项目入口会引导读取 [hai-framework-sync](templates/skills/hai-framework-sync/SKILL.md)：在线确认发布版本、比较累计差异与应用影响，需要用户选择或处理阻塞时提示，随后迁移依赖/代码/配置、合并 skills 与 AI 入口并验证。仅要求比较时不会修改应用。`hai init` / `hai add` 为旧项目补齐升级 skill、相邻资源及引用的 CI/PR 流程技能，即使无法识别原模板也会交付；已有文件保留，旧版 skill 及入口仍须合并。

创建提示直接输出到终端；安装失败会显示包管理器命令、退出码和 stdout/stderr，已生成文件保留，可进入目录重试安装。`prebuild-install@7.1.3` 的弃用警告来自 `better-sqlite3` 的上游安装依赖，单独的警告不会令安装失败；不要为隐藏警告覆盖或删除原生安装器。

```bash
# 交互式创建（推荐）
hai create my-admin-app

# 指定模板与功能
hai create my-app -t full
hai create my-app -t custom -f iam,db,ai
```

交互流程：

1. 输入项目名称
2. 选择模板（minimal / default / full / custom）
3. 选择功能模块（custom 模板下）
4. 是否添加示例代码
5. 选择包管理器（pnpm / npm / yarn）
6. 是否安装依赖
7. 是否初始化 Git

### 添加模块

```bash
# 交互式选择
hai add

# 指定模块
hai add iam
hai add storage
```

向现有项目增量添加模块。自动更新 `package.json`、生成配置文件、解析依赖。

### 初始化/校验配置

```bash
# 校验配置完整性，补全缺失配置
hai init

# 强制重新生成所有配置
hai init --force
```

### 代码生成

名称必须以字母开头，仅含字母、数字、短横线或下划线，不接受路径。默认先预检全部输出并拒绝覆盖；显式 `--force` 才替换文件。输出及符号链接目标必须留在工作目录内。

页面/API 生成器适用于 SvelteKit；组件使用 Svelte 5 children snippet。API 使用 `kit.handler` 与 Zod 输入校验。迁移输出显式 `up()` / `down()`，调用前初始化 `reldb`，调用后检查 HaiResult；它不是自动迁移运行器，`down()` 会删除表，需应用确认后执行。

```bash
# 交互式生成
hai generate

# 指定类型
hai generate page users
hai generate component UserCard
hai generate api users
hai generate model user
hai generate migration add-users

# 快捷命令
hai g:page dashboard
hai g:component StatusBadge
hai g:api orders
hai g:model order
```

## 项目模板

| 模板      | 说明     | 包含功能                                            |
| --------- | -------- | --------------------------------------------------- |
| `minimal` | 最小模板 | 基础 SvelteKit/hai 骨架（移动端为 Svelte 5 + Vite） |
| `default` | 标准模板 | IAM + DB + Cache + Crypto                           |
| `full`    | 完整模板 | 全量业务模块 + API Service / contract 机制          |
| `custom`  | 自定义   | 按需选择                                            |

## Fullstack mini 管理后台

默认管理界面启用 `@h-ai/ui/guide` 新手引导与帮助中心：首次邀请、页面逐步高亮、搜索使用说明、手动重看和个人设置导览。Web/App/Desktop 共用 guide-store 和业务翻译，Web 用 Cookie、原生 WebView 用 localStorage，按用户和引导版本记录。新增页面只需补共享内容与 data-guide 锚点，见 [引导 skill](templates/skills/hai-ui/guide.md)。

`--type fullstack` 默认生成包含 IAM、reldb、cache、audit、storage、crypto 的管理工程；即使选择 minimal，管理所需模块也会保留。`--frontends` 选择 Web、Capacitor App 和 Tauri Desktop；miniapp 仍是说明占位，不参与运行或构建。

```powershell
hai create mini-admin --type fullstack --frontends web,app,desktop
cd mini-admin
pnpm.cmd install
pnpm.cmd dev
```

需要自动部署时添加 `--features deploy`，在工程根安装对应版本的 `@h-ai/deploy` 开发依赖，部署命令会使用项目本地版本。fullstack 默认不安装 AI/ONNX/CUDA；SQLite 在镜像构建时下载匹配版本、Node ABI、架构和 libc 的官方预编译包，重试并加载校验后复用缓存；不预装编译工具链，缺包或网络失败时明确停止。

CLI 自动生成根目录 `.env.local`，其中 `HAI_ADMIN_DEFAULT_PASSWORD` 是每个项目独立的随机强密码；直接运行 `dev` / `start` 即可。首次登录使用 `admin` 和 `.env.local` 中的密码，同名环境变量可以覆盖它。密码遵循 `_iam.yml` 策略，默认至少 8 位；不符合策略时启动日志显示具体校验原因与错误码。已有用户后，该变量不会重设账号或密码。`.env.local` 被 Git 和容器构建忽略，`.env.example` 仅保留占位；部署时设置目标环境自己的密码。

- 管理员可搜索、分页、新增、编辑、启禁用、删除用户并上传头像；服务端保护当前管理员，管理写操作在锁内重新鉴权，防止并发操作使管理员全部失权。
- 初始角色为 `admin` / `user`，角色页显示人数并编辑说明，用户页分配角色。默认普通用户仅进入个人设置，直接请求管理接口也会被服务端拒绝；这些业务规则可按实际需求调整。
- 审计页按操作、资源与日期查询记录；成功登录、退出、密码变更和管理写操作写入审计，记录不含密码、token 或头像内容。
- 个人设置提供资料、头像、语言、主题和密码修改；偏好保存到 IAM 用户 metadata。头像接受 PNG/JPEG/WebP，最大 512 KiB，服务端验证图片内容并生成 storage key。

前端 typed api-client 与 serv 的 crypto transport 统一加解密 JSON 业务、登录与刷新。Web 使用内存 access token 和 HttpOnly refresh Cookie；App 原生端使用 Capacitor 安全 TokenStorage，Desktop 原生端仅在内存保存 token，重启后重新登录。原生刷新 body 通道校验客户端标识、显式传输头和受信 Origin；浏览器预览沿用 Cookie。公开头像是白名单内的二进制图片资源。

Web/App/Desktop 复用同一个 `AdminWorkspace`、management store 和 typed client。当前用户与刷新直接选用框架默认 IAM procedures，主题缓存与 DOM 更新复用 `@h-ai/ui/theme`；应用编排初始角色、自我保护、头像与审计等示例业务，这些规则可按实际需求调整。

默认 SQLite、本地 storage 与 memory cache 适用于单实例 mini 后台。管理写入仅支持单写实例；多实例读取需要共享数据库、存储、Redis cache 和传输会话粘性路由，管理写请求仍须路由至同一实例。仅更换 Redis 不能保证任意多写副本的最后管理员原子保护。生成后的根脚本提供 typecheck、lint、build、test、test:e2e；Capacitor/Tauri 交付另执行对应原生构建和打包。

## 应用配置与显示

配置字段使用显式 `HAI_<配置名>_<路径>` 引用。每个项目的 `.env.example` 包含已启用参数和可选字段的用途、枚举、范围；框架根 [`.env.example`](../../.env.example) 是完整总表。分环境加载和命令见 [环境配置](templates/skills/hai-app-create/development.md#环境配置)。

所有生成项目的 `.gitignore` 都包含 `**/data/`，忽略根目录及嵌套 workspace 的运行数据，包括 `.gitkeep`；运行时会创建需要的数据目录。

Fullstack 的 `packages/<project>-serv/config/` 始终保留 13 份配置：`_core`、`_serv`、`_db`、`_cache`、`_iam`、`_storage`、`_audit`、`_reach`、`_ai`、`_vecdb`、`_payment`、`_scheduler`、`_deploy`（均为 `.yml`）。已用模块保留有效默认值，未启用模块整份注释，各模块的可选字段和替代 Provider 也以注释保留。`.env.example` 同时提供未启用模块的注释凭据示例。创建时填写的模块选项会保留。

扩展时先在服务端 workspace 安装所需模块，在 `src/server/runtime.ts` 按公开 Schema 校验配置、初始化并反序关闭，再取消所需配置的注释。整份注释的文件先去掉一层外层注释，可选块继续按需开启；配置文件存在并不等于业务能力已接入。数据库、缓存和存储可通过环境变量切换 Provider 并填写连接字段；Reach Provider 使用标准配置数组，同名 Provider 只保留一个。`crypto.init()` 无配置参数，datapipe 是纯函数，不生成虚构的 YAML 配置。

所有模板从 `_core.yml` 统一读取 `name`、`version`、`env`、`defaultLocale` 和 `logging`，通过 `core.config` 获取元信息并使用 `core.logger`。单应用配置在 `config/`；API workspace 在 `apps/<project>-service/config/`；fullstack 在 `packages/<project>-serv/config/`。日志级别与格式由 YAML 决定，不在初始化时另写固定 `logging` 覆盖。

环境变量可按 core 约定覆盖，如 `HAI_CORE_NAME`、`HAI_CORE_VERSION`、`HAI_CORE_ENV`、`HAI_CORE_LOGGING_LEVEL`；整体 `HAI_CORE` 覆盖遵循父节点优先规则。服务端配置变更后重启服务，容器显式设置 `HAI_CORE_ENV=production`，由该值启用生产安全策略。

叶子环境变量只覆盖 YAML 中已有的路径；注释掉的键须先取消注释，或使用 `HAI_DB`、`HAI_CACHE` 等整体对象覆盖。camelCase 不拆词，例如 `connectTimeout` 对应 `HAI_CACHE_CONNECTTIMEOUT`。语言列表由各前端与 shared 的 `project.inlang/settings.json` 维护，`_core.yml` 只配置默认语言。

Fullstack 的 `.env` 启用当前模块的运行参数；YAML 引用同名变量并保留本地回退。未启用模块的变量和可选 Schema 字段保留注释。使用 `dev:test` / `dev:prod`、`build:prod` 与服务端 `start:test` / `start:prod` 加载环境覆盖。

SvelteKit 的服务端 layout 只下发名称、版本、环境和默认语言等公开白名单。独立 mobile-app 的 Vite 配置在 Node 构建阶段通过 core 解析 YAML，再注入公开值及浏览器日志级别/格式；修改 YAML 或覆盖变量后需要重新构建。Fullstack 前端通过加密的 `app.info` 获取服务端公开元信息。任何模板都不能把完整 core/模块配置、密钥或日志脱敏上下文注入浏览器。

## 全局选项

| 选项               | 说明         |
| ------------------ | ------------ |
| `-v, --verbose`    | 显示详细输出 |
| `-C, --cwd <path>` | 指定工作目录 |

## 开发阶段本地使用

> 适用于尚未发布到 npm、在 monorepo 中本地调试 CLI 的场景。

### 1. 构建

```bash
# 构建 CLI（生成 dist/）
pnpm --filter @h-ai/cli build

# 或启动 watch 模式（修改源码后自动重建）
pnpm --filter @h-ai/cli dev
```

### 2. 直接运行（无需安装）

构建完成后，可以用 `node` 直接调用 `dist/index.js`：

```bash
# 从仓库根目录运行
node packages/cli/dist/index.js create my-app
node packages/cli/dist/index.js create my-app --type admin --features iam,db
```

或者在任意目录通过绝对路径调用：

```bash
node /path/to/hai-framework/packages/cli/dist/index.js create my-app
```

### 3. 全局链接（`pnpm link`）

如果希望在终端里直接用 `hai` 命令，可以全局链接：

```bash
# 在 packages/cli 目录下执行
cd packages/cli
pnpm link --global

# 验证
hai --version
hai create my-app
```

> 使用完毕后可解除链接：`pnpm unlink --global @h-ai/cli`

### 4. 在 monorepo 内的其他 app 中使用

monorepo 内的 `apps/*` 项目已通过 `workspace:*` 协议引用本地包，可直接使用：

```bash
# 在仓库根目录执行，对任意 app 类型生成项目
node packages/cli/dist/index.js create ../my-new-project
```

## 分环境部署

运行 `hai deploy --env test`，先检查 `.env.test`，再逐项选择中间件默认配置、自定义连接或保持不变。`--yes` 保留目标环境的完整配置并为其余项采用当前后端默认值，`--env-dir` 指定环境文件目录。明确传入目标服务目录，如 `hai deploy packages/my-app-serv --env test`，不猜测 workspace 布局；容器启动脚本保留明确环境标识。公共连接项写目标环境文件，凭据写 `.env.local` 并脱敏显示。

配置已完备时可在向导中选择“直接部署”，或执行 `hai deploy packages/my-app-serv --env prod --yes --skip-middleware`，跳过全部中间件提示、配置写入和资源开通。部署目标缺失时引导填写 SSH/Vercel 参数；SSH 地址、端口、密钥路径、远程目录及 Token 只保存到被 Git 忽略的 `.env.local`，下次自动复用。可编辑其中的 `HAI_DEPLOY_PROVIDER` 更新目标；私钥只填写路径。

[Deployment and middleware reference](templates/skills/hai-deploy/middleware.md) · `pnpm --filter @h-ai/cli test:deploy-gates`

失败与降级提示也必须国际化：官网 API 按请求 locale 生成 AI 降级/邮件送达状态；未送达不能称为已接收。CLI 部署状态使用 cliM，Gallery 加密能力限制使用双语消息。中文与英文分别验证未配置、失败和成功路径，无需调用付费服务。

云资源配置消费：Neon 输出 HAI_DB（PostgreSQL JSON），Upstash 输出 HAI_CACHE（Redis rediss URL JSON），R2 输出 HAI_STORAGE（扁平 S3 JSON）。邮件/短信输出 HAI_REACH_PROVIDERS 数组，deployApp 合并两个渠道并保留 YAML 中的消息模板；此覆盖替换原 providers 数组。Core 支持整体对象/数组覆盖，父节点优先于叶子变量，仍执行 Schema 校验；构建子进程与目标运行环境使用相同开通结果。R2 必须提供已有 S3 accessKeyId/secretAccessKey；Resend 必须提供已验证域名的 from；阿里云必须提供已审核 signName/模板。应用须已有相应\_db/\_cache/\_storage/\_reach.yml 并在启动时加载，网络客户端需要 Node 运行时。

部署失败恢复：`ProvisionResult.resourceStatus` 标记 created/reused；`getDeployRecovery(result.error)` 读取 projectName、stage、platformProjectId 和资源清单，unknown 表示请求结果不确定，必须先在服务商控制台核对。失败资源已返回 ID 时保留该 ID。恢复结果不含 envVars、原始异常或连接凭证，CLI 会展示清单和建议。同名重试复用现有资源；不自动删除复用资源，新建资源仅在人工确认未被使用后清理。

## 配置驱动认证页面

协议支持配置中的 userAgreementMarkdown/privacyPolicyMarkdown 正文及 URL；同主题优先 Markdown，由安全渲染器在弹窗显示。

选用 IAM 的 admin/h5/website 模板提供 AuthPanel 和标准认证路由；mobile-app 与 fullstack Web/App/Desktop 使用 API 客户端共享动作。修改服务端 config/_iam.yml 控制登录方式、注册、重置、协议弹窗和品牌。LDAP/Reach 均可选：默认 LDAP 客户端需要应用安装 ldapts，再启用 login.ldap 并配置连接；短信/邮件可选择 Reach 模板或自定义发送回调。表单预留 header/extraFields/footer，AuthPanel 透传 login*/register* snippet。分布式部署使用共享数据库与 Redis。

[完整 IAM 配置 / IAM configuration](../iam/README.md)

### 6. 运行测试

```bash
# 单元测试 + E2E 模板生成测试
pnpm --filter @h-ai/cli test

# 真实脚手架 E2E 门禁（生成项目后执行 install/typecheck/lint/build/test/e2e）
pnpm --filter @h-ai/cli test:e2e

# watch 模式
pnpm --filter @h-ai/cli test:watch

# 覆盖率
pnpm --filter @h-ai/cli test:coverage
```

Admin 与 fullstack 门禁还用实际安装的本地 tarball 验证公开类型和运行行为：流式文件/checksum/拒覆盖、API Key scope 与撤销、当前授权、批量用户/角色分页、Reach 模板路由和 Audit 分页元数据；fullstack 同时验证可信对端 IP。

成功截图默认保存在 CLI 的 `test-results/scaffold-evidence/`，可通过 `HAI_AUTH_EVIDENCE_DIR` 指定独立目录，生成项目清理后仍保留。fullstack E2E 启动所有已选 Web/App/Desktop 浏览器预览，并验证各端的登录、导览、帮助与个人设置；小程序和原生壳仍需要对应平台验收。

## 生成项目的表单布局

website 联系页与 fullstack 管理界面复用 UI 的 FormLayout/FormField：支持一列/双列、标签独立成行/同行、自动跨列和窄容器回落。用户编辑、资料与密码表单使用同组参数，校验提示由 UI 内置中英文处理；完整配置随生成项目的 hai-ui skill 提供。

## License

Apache-2.0
