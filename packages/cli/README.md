# @h-ai/cli

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

[框架首页](../../README.md)

## 简介

用 `hai` 创建应用、添加模块、生成基础代码，再构建和交付应用。支持 SvelteKit、独立 API 和前后端分离工程。第一次使用可按[完整使用指南](../../docs/usage/README.md)从创建走到部署。

## 核心功能清单

- 创建管理后台、企业官网、H5、API、移动应用或多端 fullstack 工程。
- 为已有项目添加模块、补齐配置和 AI 开发指引。
- 生成页面、组件、接口、模型和迁移骨架。
- 按镜像构建，完整离线交付，或只更新选中的服务。

## 使用入门

### 安装 CLI

需要符合项目 `engines` 的 Node.js（`^22.22.2 || ^24.15.0 || >=26.0.0`）与 pnpm 12.11.2。PowerShell 使用 `pnpm.cmd`。

```sh
pnpm add -g @h-ai/cli
hai --version
hai --help
```

生成的框架依赖固定到 CLI 对应版本；安装失败会显示命令、退出码与输出，保留已生成文件供重试。未发布的源码功能请按下方本地开发方式验证。

### 创建项目

```sh
hai create my-app --type fullstack --frontends web --yes
cd my-app
pnpm dev
```

省略选项时按向导选择，`--yes` 使用默认值。默认安装依赖并初始化 Git，`--no-install` / `--no-git` 可关闭。部署工具默认作为开发依赖安装，不需要时加 `--no-deploy`。

### 项目模板

| 类型                       | 生成内容                                                          |
| -------------------------- | ----------------------------------------------------------------- |
| `admin` / `website` / `h5` | SvelteKit 管理后台、官网、移动网页                                |
| `api`                      | 共享 contract + API service 的 pnpm workspace                     |
| `mobile-app`               | Svelte + Vite + Capacitor                                         |
| `fullstack`                | contract、API、共享界面与所选 Web/App/Desktop；miniapp 仅预留说明 |

`--template minimal|default|full|custom` 选择模块预设，`--features iam,db,...` 选择业务模块。Fullstack 始终保留默认管理界面所需的 IAM、数据库、缓存、加密、存储和审计；默认不安装 AI/ONNX/CUDA。

### Fullstack mini 管理后台

提供用户管理、角色、审计日志、头像和个人设置，以及主题、语言、引导和帮助中心。首次登录使用 `admin`，随机密码在根 `.env.local` 的 `HAI_ADMIN_DEFAULT_PASSWORD`；已有用户时不会重设密码。模板业务可按需求修改，权限检查始终在服务端执行。

### 应用配置与显示

运行参数见 `.env.example`。公共基础 `.env` 与 `.env.dev/.env.test/.env.prod` 提交 Git，私有值放 `.env.local`。覆盖顺序为进程环境 > 本机私有文件 > 所选环境 > 公共基础。API 模板在服务目录放环境文件，fullstack 在工程根。模块 YAML、环境覆盖和显示信息说明见[使用指南](../../docs/usage/README.md#3-配置环境再开始开发)。

### 已有项目与代码生成

创建或添加 AI 会同时安装 reldb 与 vecdb；生成的启动代码按数据库 → 向量库 → AI 初始化，失败检查关闭结果并逆序清理。`.env.prod` 按启用模块选择 PostgreSQL（已选 MySQL 则保留）、Redis、S3、Qdrant，默认使用 Compose 的 `db/cache/storage/vecdb` 服务名。数据库/缓存密码、S3 凭据、模型密钥和受保护 Qdrant 的密钥必须由私有环境注入；容器外运行需覆盖这些内部地址。生产 Reach 的空 Provider 数组有意拒绝启动，须私有注入真实 `HAI_REACH_PROVIDERS` JSON。`hai add` 保留已有生产参数，只补新增字段；随后在现有业务入口接入新增模块。

```sh
hai add storage
hai init
hai generate page dashboard
hai generate component UserCard
hai generate api orders
hai generate model order
hai generate migration add-orders
```

`hai add` 解析模块依赖并补充配置。`hai init` 补齐缺失配置和 AI 文件，保留已有自定义内容；`--force` 可重建模块配置，使用前检查差异。

page 只支持 SvelteKit 文件路由；api 会按目标应用选择 SvelteKit 文件路由或 serv 的共享 contract/procedure。API/fullstack 根目录可自动选择唯一后端；多应用用 `--workspace <包名或相对路径>`，也可进入目标 workspace。纯 Vite 的 page/api 组合明确拒绝；serv 不接受 `--output`，SvelteKit 路由输出须位于 `src/routes` 内，定制 `kit.files` 时明确拒绝猜测；API 目标须已安装 `@h-ai/kit` 与 `zod`。serv 只改写带 `@hai-generator` 标记的既有聚合入口，未知结构要求手动扩展，不创建平行路由。名称不能包含路径；默认拒绝覆盖，`--force` 只替换生成文件，不覆盖已有业务领域注册。整批预检，写入失败回滚本次修改。迁移只生成 up/down 函数，不自动执行；运行前确认数据影响。

### 构建与部署

`pnpm build` 只编译源码。镜像使用 `images/` 中独立 Dockerfile，由 `hai.build.json` 指定文件；`--images` 决定构建哪些镜像，`--services` 决定更新哪些服务。容器引擎 auto 优先 Podman，再尝试 Docker。下载、安装和整理生产依赖共用包缓存与 SQLite 驱动缓存，避免重复下载。

默认容器用于 CPU 运行或连接远程 AI 服务，不额外下载 GPU 运行库。需要使用部署机器上的 GPU 时，自行定制镜像和容器运行参数。

```sh
pnpm build --target docker
pnpm run deploy --env prod
pnpm run deploy --env prod --build --services web
pnpm run deploy --env prod --build --bundle-only --output release-prod.tar
```

完整包包含应用和自建中间件镜像。仅打包会同时生成 tar 与 Windows `deploy.ps1`、Linux/macOS `deploy.sh`；完全隔离的 Linux 服务器解包后运行 `sh apply.sh`。首次部署必须完整；部分更新保留未选服务和数据卷。每步报告结果，失败返回非零并尝试恢复。前置工具、缓存、版本和恢复流程见[部署说明](../deploy/README.md)。

桌面安装包用 `pnpm build --target desktop --platform windows|linux|macos --arch x64|arm64`，在对应系统准备工具链并验证。容器里的 Web 页面不代替原生安装包。

### 使用 AI 辅助开发

生成工程根的 `AGENTS.md` 导航到 `.agents/skills/`；Claude、Copilot、OpenCode 的入口引用同一套规则。普通功能用 [应用开发](templates/skills/hai-app-create/SKILL.md)，较大文档先[审查](templates/skills/hai-spec-review/SKILL.md)再[逐项实施](templates/skills/hai-spec-implement/SKILL.md)，框架升级用[升级与同步](templates/skills/hai-framework-sync/SKILL.md)。

Skill 入口保存任务边界，相邻参考按需读取。`hai init` / `hai add` 只补齐缺失内容，已有技能与自定义规则需合并；同步时复制完整目录。

## 开发测试

### 开发阶段本地使用

在框架仓库根执行，用当前源码生成项目。完整测试命令如下，部署门禁另需可用 Podman/Docker。

```sh
pnpm --filter @h-ai/cli build
node packages/cli/dist/index.js create ../my-app
pnpm --filter @h-ai/cli typecheck
pnpm --filter @h-ai/cli lint
pnpm --filter @h-ai/cli test
pnpm check:skills
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:deploy-gates
```

脚手架门禁生成真实项目，执行安装、typecheck、lint、build、test 和浏览器测试。部署门禁验证离线包、SSH/人工发布及部分更新。测试自动清理本轮资源；按需保留的截图写入指定证据目录。原生壳和真实云服务单独验收。

`--generate` 是定向路由门禁：复用仓库已安装依赖，实际生成、构建并访问 SvelteKit、serv API、fullstack 后端的新路由（含 transport）。它不替代上面的完整安装与浏览器矩阵。

## 许可证

Apache-2.0
