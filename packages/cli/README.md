# @h-ai/cli

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

[框架首页](../../README.md)

## 简介

生成项目默认启用 `zh-CN`、`en-US`、`ja-JP`。交互配置可选择日语为默认语言；fullstack 可通过 `fullstack.i18n.locales` 缩小启用语言列表。CLI 终端语言按 `HAI_CORE_DEFAULTLOCALE` → `LC_ALL` → `LC_MESSAGES` → `LANG` 选择，支持中英日文。

用 `hai` 创建应用、添加模块、生成基础代码，再构建和交付应用。支持 SvelteKit、独立 API 和前后端分离工程。第一次使用可按[完整使用指南](../../docs/usage/README.md)从创建走到部署。

## 核心功能清单

- 创建管理后台、企业官网、H5、API、移动应用或多端 fullstack 工程。
- 为已有项目添加模块、补齐配置和 AI 开发指引。
- 生成页面、组件、接口、模型和迁移骨架。
- 按镜像构建，完整离线交付，或只更新选中的服务。

## 使用入门

### 安装 CLI

需要符合项目 `engines` 的 Node.js（`^22.23.4 || ^24.22.1 || ^26.12.1`）与 pnpm 12.11.2。PowerShell 使用 `pnpm.cmd`。

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

`--template minimal|default|full|custom` 选择模块预设，`--features iam,db,...` 选择业务模块。Fullstack 始终保留默认管理界面所需的 IAM、数据库、缓存、加密、存储和审计；未指定 `--features` 时默认开启 feedback 并补齐 Reach。显式功能列表保留可选模块选择，其它应用类型仍需显式启用反馈。默认不安装 AI/ONNX/CUDA。

独立 `mobile-app` 选择 IAM 或 crypto 时会安装前端 crypto 并默认启用 typed client 加密传输；未选择 crypto 时可连接明确的明文 API。`PUBLIC_API_TRANSPORT=off` 只用于匹配的明文服务，`PUBLIC_API_KEY_EXCHANGE_PATH` 仅覆盖公开协商子路径。握手失败不会降级，服务端私钥不进入客户端。客户端先关闭 transport，再释放自身初始化的 crypto。

### Fullstack mini 管理后台

提供用户管理、角色、审计日志、头像和个人设置，以及主题、语言、引导和帮助中心。首次登录使用 `admin`，随机密码在根 `.env.local` 的 `HAI_ADMIN_DEFAULT_PASSWORD`；已有用户时不会重设密码。模板业务可按需求修改，权限检查始终在服务端执行。

### 应用配置与显示

运行参数见 `.env.example`。公共基础 `.env` 与 `.env.dev/.env.test/.env.prod` 提交 Git，私有值放 `.env.local`。覆盖顺序为进程环境 > 本机私有文件 > 所选环境 > 公共基础。API 模板在服务目录放环境文件，fullstack 在工程根。模块 YAML、环境覆盖和显示信息说明见[使用指南](../../docs/usage/README.md#3-配置环境再开始开发)。

### 已有项目与代码生成

创建或添加 AI 会同时安装 reldb 与 vecdb；生成的启动代码按数据库 → 向量库 → AI 初始化，失败检查关闭结果并逆序清理。`.env.prod` 按启用模块选择 PostgreSQL（已选 MySQL 则保留）、Redis、S3、Qdrant，默认使用 Compose 的 `db/cache/storage/vecdb` 服务名。数据库/缓存密码、S3 凭据、模型密钥和受保护 Qdrant 的密钥必须由私有环境注入；容器外运行需覆盖这些内部地址。生产 Reach 的空 Provider 数组有意拒绝启动，须私有注入真实 `HAI_REACH_PROVIDERS` JSON。`hai add` 保留已有生产参数，只补新增字段；随后在现有业务入口接入新增模块。

```sh
hai add storage
hai init
hai generate
hai generate page dashboard
hai generate component UserCard
hai generate api orders
hai generate model order
hai generate migration add-orders
```

`hai add` 解析模块依赖并补充配置。`hai init` 补齐缺失配置和 AI 文件，保留已有自定义内容；`--force` 可重建模块配置，使用前检查差异。

page 只支持 SvelteKit 文件路由；api 会按目标应用选择 SvelteKit 文件路由或 serv 的共享 contract/procedure。API/fullstack 根目录可自动选择唯一后端；多应用用 `--workspace <包名或相对路径>`，也可进入目标 workspace。纯 Vite 的 page/api 组合明确拒绝；serv 不接受 `--output`，SvelteKit 路由输出须位于 `src/routes` 内，定制 `kit.files` 时明确拒绝猜测；API 目标须已安装 `@h-ai/kit` 与 `zod`。serv 只改写带 `@hai-generator` 标记的既有聚合入口，未知结构要求手动扩展，不创建平行路由。名称不能包含路径；默认拒绝覆盖，`--force` 只替换生成文件，不覆盖已有业务领域注册。整批预检，写入失败回滚本次修改。迁移只生成 up/down 函数，不自动执行；运行前确认数据影响。

CLI 消息支持中文、英文和日文，优先使用 `HAI_CORE_DEFAULTLOCALE`，再按 `LC_ALL` → `LC_MESSAGES` → `LANG` 选择非空终端语言；`en`/`zh`/`ja` 地区变体映射到现有字典，`C`/`POSIX` 使用英文。未知语言保留 core 当前语言（默认中文）。例如 PowerShell 先执行 `$env:HAI_CORE_DEFAULTLOCALE='en-US'`，再执行 `hai generate`。CLI 内部命令也响应 `core.i18n.setGlobalLocale('en-US')` 的同进程语言切换；省略类型或名称会交互，取消后不写文件。生成源码的中文注释和用户指定名称保留原样。

`create`、`add`、`init` 与 `generate` 的提示、校验、模块/模板名称、描述和完成信息均使用当前 CLI 语言。静态选择目录在读取时翻译，同一进程切换 locale 也会生效。CLI 语言与生成应用的 `core.defaultLocale` 分开配置；生成的中文 README、配置/源码注释、用户输入和外部工具原始诊断保留原样。

### 构建与部署

数据库连接保存前使用所选后端的真实公开 Schema 校验：MySQL `ssl` 仅 `false` 或严格 TLS 对象，`{}` 默认校验证书链和 DNS 身份；PostgreSQL 保留其模式。CLI 已内联纯 Schema 和 Zod，配置校验不要求目标应用安装数据库包/驱动；实际运行应用仍需相应依赖。部署功能仍须能解析已安装的 `@h-ai/deploy`（生成工程将其作为开发依赖）。

`pnpm build` 只编译源码。镜像使用 `images/` 中独立 Dockerfile，由项目根 `hai.json` 的 `build.images` 指定文件，部署参数放在同文件的 `deploy`；`--images` 决定构建哪些镜像，`--services` 决定更新哪些服务。容器引擎 auto 优先 Podman，再尝试 Docker。下载、安装和整理生产依赖共用包缓存与 SQLite 驱动缓存，避免重复下载。

默认容器用于 CPU 运行或连接远程 AI 服务，不额外下载 GPU 运行库。需要使用部署机器上的 GPU 时，自行定制镜像和容器运行参数。

CLI 在过滤调用者的 `HAI_/PUBLIC_/VITE_` 后，只注入内部生成的 `HAI_BUILD_ID/HAI_BUILD_COMMIT`，Docker 将同一镜像批次标识传入实际编译。生成应用的反馈分别读取前后端自己的 `appVersion/buildId/commit`，版本来自各自 manifest，同次 SSR 共用构建 ID；无所属 Git 提交时明确 `unknown`。三字段 `build-metadata.json` 与代码内联值一致，用于与 API/ZIP 实际证据核对。

```sh
pnpm build --target docker
pnpm run deploy --env prod
pnpm run deploy --env prod --build --services web
pnpm run deploy --env prod --build --bundle-only
```

完整包包含应用和自建中间件镜像。部署缓存、tar 与操作目录默认放在工程根 `.hai/deploy/<环境>/`；`--output` 可显式指定相对命令执行目录的 tar 路径。仅打包不询问 SSH，会复用已有连接并生成 tar、带逐项说明的 `deploy-target.json` 与 Windows PowerShell 5+ `deploy.ps1`、Linux/macOS `deploy.sh`。上传前核对 target 并补齐缺项，两个脚本均读取此文件，支持 key/agent 和 password，均无需 Node/pnpm。target 只引用 `passwordEnv`（默认 `HAI_DEPLOY_PROVIDER_SSH_PASSWORD`）；密码取自操作机环境，仅进入本次 SSH/SCP 子进程，不进入应用环境或包内。修改 target 仅影响本包，不回写工程。完全隔离的 Linux 服务器复制整个目录后运行 `sh deploy-local.sh`，自动解包部署。首次部署必须完整；部分更新保留未选服务和数据卷。每步报告结果，失败返回非零并尝试恢复。前置工具、缓存、版本和恢复流程见[部署说明](../deploy/README.md)。

直接部署首次补齐缺失的 SSH 连接和认证信息，完整有效配置（包括 `--yes`）直接复用；密码隐藏输入，保留前后空格和前导零。新连接和中间件秘密值写 `.env.<环境>.local`，旧 `.env.local` 保留为兼容回退。部署 SDK 的 `HAI_DEPLOY_*` 优先级为进程 > 环境私有 > 环境公共 > 旧全局私有 > 基础；其他模块为进程 > 环境私有 > 旧全局私有 > 环境公共 > 基础。此私有层仅用于部署 SDK，不改变 Core 的普通应用加载。目标环境完整中间件配置在 `--yes` 下保持，不重复询问或云开通；交互模式仍可选择本次范围。

部署失败时分别显示本地受管理进程终止确认、远端未知/脚本已完成状态和结果文件路径；本地 SSH 结束不证明远端停止。未知状态先核对服务器，CLI 不自动重跑发布或回滚。Windows 命令使用内嵌的系统 PowerShell/.NET Job，需允许 Add-Type，失败不会裸启动。

正常前台部署及同步失败恢复收尾、发布终态后显式释放 `.deploy.lock`，后台服务继续运行不阻塞后续发布。HUP/INT/TERM 中断或父 shell 被强杀时，继承描述符的活跃子命令仍持锁，全部 holder 退出或服务器重启后才释放；锁文件永久保留，不删除或替换。

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
pnpm --filter @h-ai/cli test:scaffold-gates --list --json
pnpm --filter @h-ai/cli test:deploy-gates
```

生成门禁保留十一个场景，逐应用类型执行真实安装、编译及 HTTP/浏览器验收。scaffold 与生成路由 runtime 两个重型文件分批顺序执行，避免实测的构建和安装资源争用；三个语言、CLI 进程和环境消费文件可与 runtime 在最多两个 worker 内并行。各场景复用 E2E 入口自带的完整构建，原有生产构建隔离检查在 E2E 后验证非空的真实产物。真实容器部署按运行形态选取 API、SSR（admin 代表 website/h5 共用的 Dockerfile 与部署分支）、静态移动前端和 fullstack；资源拥有权、认证/传输、增量更新、损坏制品与回滚验收保留。部署夹具启用 init 并验证孤儿进程实际回收；快速 Nginx 门禁用生产同版本镜像对部署包执行 `nginx -t`，普通单测不探测引擎。workspace 的 compile 通过真实依赖图构建 contract，fullstack 先准备共享 i18n，避免重复编译 contract。

脚手架门禁生成真实项目，执行安装、typecheck、lint、build、test 和浏览器测试，同时覆盖生成路由的实际 HTTP 入口、CLI 进程语言选择和环境文件消费；`--generate`、`--i18n` 可分别定向复测。部署门禁覆盖实际资源拥有权、动态宿主端口隔离，以及离线包、SSH/人工发布、增量更新和回滚。只回收本轮已记录的容器 ID 和私有镜像 tag；安全元数据报告保留在 ignored `tmp/validation/module-review/VERIFY-05/`。已生成的浏览器截图、trace 和报告默认保留在 ignored `tmp/validation/module-review/scaffold-browser/` 或 `deploy-browser/`；也可显式指定证据、HTML 报告和输出目录。临时工程、密钥、数据及进程仍自动回收。原生壳和真实云服务单独验收。

可选 Windows 安装包验收需准备 Rust 的 `x86_64-pc-windows-msvc` 目标和 MSVC 构建工具。设置 `HAI_CLI_NATIVE_BUILD=1` 后运行 `pnpm --filter @h-ai/cli test:scaffold-gates`，现有 fullstack 场景会构建 NSIS 安装包并核对应用根版本与产物文件名。可用 `CARGO_BUILD_JOBS=2` 限制 Rust 编译并发。原生 UI 交互与设备能力另行验收。

部署夹具先检查固定公开基础镜像，仅明确缺失时拉取，可沿用 HAI_DEPLOY_E2E_MIRROR；公共缓存不进入清理账本。成功 create 后先登记容器 ID，再在其私有 PID namespace 内异步安装 APT/pip 并启动 sshd。准备失败、超时或合作式取消会等待本地客户端退出，按已登记 ID 回收并确认消失；仅重型嵌套 Podman 夹具使用特权。HAI_DEPLOY_E2E_APT_MIRROR 只接受镜像站主机名并保留 HTTPS。拥有权测试用固定公开镜像的本轮私有 tag，保留同内容外部 tag、重指向保护、动态端口和外部 sentinel 检查。create 回执丢失且未获得可信 ID、测试进程被强制终止等情况仍需记录未知状态，不能按名称或 label 认领清理。

`--generate` 是定向路由门禁：复用仓库已安装依赖，实际生成、构建并访问 SvelteKit、serv API、fullstack 后端的新路由（含 transport）。它不替代上面的完整安装与浏览器矩阵。

`test:e2e` 为本轮服务显式选择隔离的测试后端及绝对数据目录，服务子进程不继承外部 `HAI_*` / `PUBLIC_*` / `VITE_*` 配置或读取用户 `.env.local`。测试专用 `HAI_E2E=1` 不改变普通开发、生产 dotenv 或共享后端要求；启用 transport 的场景使用新建可信 SM2 ring 与实际 registry。样板浏览器阶段另用独立 TCP 计数进程核验外部数据库配置未被触达。完整部署验收仍保留 fullstack 的真实 Redis/S3、增量发布与回滚。

`--i18n` 定向门禁构建 CLI 后，在独立进程中验证语言优先级、help、生成成功与失败，并重放中英日文选择/名称校验/取消交互。

## 技能工作流与前端指引

工作流统一使用 hai-spec-review、hai-spec-implement、hai-app-create、hai-app-tests、hai-app-review、hai-pr-review。需求、验收、发现与证据通过 [交接契约](templates/skills/hai-spec-implement/handoff.md) 连接，文档差异仍沿已有 Git 基线推进。

UI 模块成套交付 [hai-ui-design](templates/skills/hai-ui-design/SKILL.md)、hai-ui 与 [hai-ui-review](templates/skills/hai-ui-review/SKILL.md)；纯 API 模板排除这些前端技能。init/add 保留已有私有入口并补齐缺失参考资源。仓库同职责技能采用同名入口。

### 问题反馈与离线分析

使用 `hai create my-app --type fullstack --frontends web --yes` 默认启用反馈；API 工程需显式选择 `--features feedback`。登录用户可提交反馈，管理员才显示管理菜单并能查看、处理、撤销和导出；自动补齐数据库、存储、触达与认证依赖。生成收集入口、分页管理页和服务端接口，`config/_feedback.yml` 配置管理员收件人及后台地址。开发 Console 不代表真实邮件；生产设置共享 DB、S3 私有桶和真实 SMTP。

离线工具：`hai feedback summary <包.zip>`、`inspect`、`evidence --request-id <ID> --page 1 --page-size 20`、`view`。查看器仅本机监听，Ctrl+C 关闭，无需生产连接。

## 许可证

Apache-2.0
