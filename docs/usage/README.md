# 从创建项目到发布应用

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

## 简介

这份指南面向使用 hai-framework 开发应用的团队，从第一次创建项目讲到开发、构建、交付和后续升级。下面以 `my-app` 为项目名、fullstack 的 Web + API 为主线；不同模板的目录和命令差异会在相应位置说明。

命令对应当前仓库的 CLI 与模板。使用已发布版本时，先用 `hai --version`、`hai build --help` 和 `hai deploy --help` 核对能力；尚未发布的源码能力不会自动出现在旧版 CLI 中。模块用法从[根 README](../../README.md)和各包 README 查找；维护框架源码请另读 [AGENTS.md](../../AGENTS.md)。

## 核心功能清单

- 创建应用与配置环境。
- 手工或 AI 辅助开发、编译、容器与原生打包。
- 完整离线交付、按服务更新与框架升级。

## 使用入门

### 1. 准备开发环境

| 工作 | 需要准备什么 |
| --- | --- |
| 创建、开发、编译、运行 CLI | Node.js `^22.23.4 \|\| ^24.22.1 \|\| ^26.12.1`，pnpm 12.11.2；以项目 `engines`、`packageManager` 为准 |
| 管理版本、AI 按文档实施 | Git；能读取项目文件并执行命令的 AI 编程助手 |
| 构建容器镜像 | 已安装且运行中的 Podman 或 Docker；Windows 上使用 Linux 容器环境 |
| 生成桌面安装包 | 对应系统上的 Rust、目标架构工具链、Tauri 所需系统 SDK 和打包工具 |
| 自动部署到 Linux | 本机 `tar`、`ssh`、`scp`；服务器容器引擎、Compose、`sh`、`tar`、`sha256sum`、`awk`、`curl`、util-linux `flock`、支持 flock 的文件系统和目录权限 |
| 只生成部署包 | 本机 `tar`、已安装的项目依赖和构建产物；导出中间件镜像需本机容器引擎，不要求 SSH |

本文用 `pnpm` 表示命令，Windows PowerShell 中替换为 `pnpm.cmd`。自动选择 Podman/Docker 只会探测可用引擎，不会安装或启动引擎。

下表中的默认值指未传参数时的行为；需要用户选择的内容会明确标注。

| 通用参数 | 含义 | 默认值 | 示例 |
| --- | --- | --- | --- |
| `-C, --cwd <path>` | 命令的工作目录 | 当前目录 | `pnpm exec hai build --cwd ../my-app` |
| `-v, --verbose` | 详细输出，具体内容由子命令决定 | `false` | `hai create my-app --verbose` |
| `-h, --help` | 当前命令帮助 | `false` | `pnpm exec hai build --help` |
| `-V, --version` | CLI 自身版本，不是应用版本 | `false` | `hai --version` |

### 2. 创建项目

先安装 CLI，再创建包含部署能力的 Web + API 工程：

```sh
pnpm add -g @h-ai/cli
hai --version
hai create my-app --type fullstack --frontends web --yes
cd my-app
pnpm dev
```

创建过程默认安装依赖并初始化 Git。想交互选择应用类型，可以运行 `hai create my-app`；默认带部署工具，可用 `--no-deploy` 关闭。如果使用 `--no-install`，进入项目后先运行 `pnpm install`。首次安装需要可用的 registry，离线条件见后文。

| 创建参数 | 含义与可选值 | 默认值 | 示例 |
| --- | --- | --- | --- |
| `[name]` | 项目名，只含小写字母、数字和连字符 | 交互输入，建议 `my-app`；`--yes` 时 `my-app` | `hai create orders-app` |
| `--type <type>` | `fullstack`：API 与客户端；`api`：contract + service；`admin`、`website`、`h5`：SvelteKit；`mobile-app`：Capacitor + Vite | 交互选择，初始 `admin`；`--yes` 时 `admin` | `--type fullstack` |
| `--frontends <targets>` | fullstack 的 `web,app,desktop`，逗号分隔；`miniapp` 仅说明占位 | fullstack 为 `web,app,desktop`；其他类型不使用 | `--frontends web,desktop` |
| `-t, --template <template>` | `minimal`、`default`、`full`、`custom` | fullstack 为 `custom`；其他类型交互选择，`--yes` 时 `default` | `--template custom` |
| `-f, --features <features>` | 业务模块 | 按类型与模板预设 | `--template custom --features iam,db` |
| `--examples` / `--no-examples` | 是否生成示例代码 | `true` | `--no-examples` |
| `--no-install` | 不立即安装依赖 | 安装依赖 | `--no-install` |
| `--no-git` | 不初始化 Git | 初始化 Git | `--no-git` |
| `-p, --package-manager <pm>` | `pnpm`、`npm`、`yarn` | fullstack/API 固定 pnpm；其他类型按当前项目探测或交互选择 | `--package-manager pnpm` |
| `--git-remote <url>` | 远程仓库地址 | 不设置 | `--git-remote https://git.example.com/team/my-app.git` |
| `-y, --yes` | 按默认值创建，省略交互 | `false` | `hai create my-app --yes` |

需要桌面端时，创建命令改用 `--frontends web,desktop`。已有项目可用 `hai add <module>` 增量添加适用模块；例如 `hai add deploy`。fullstack 默认包含数据库、缓存、IAM、加密、存储和审计，没有 AI 运行依赖，不需要安装 CUDA。

fullstack 中，`packages/my-app-contract` 定义接口，`packages/my-app-serv` 实现 API，`packages/my-app-shared` 放共享内容，`apps/my-app-web` 提供 Web。环境文件在工程根；API 模板的环境文件在 `apps/my-app-serv`。生成后先读项目自己的 README 和 AGENTS.md。

### 3. 配置环境，再开始开发

配置文件表达模块结构，例如 `_db.yml` 中的 `type` 引用 `HAI_DB_TYPE`；地址、端口、Provider 和密钥等环境差异通过统一环境变量传入。不要为 test/prod 复制整套实现，也不要把服务端密钥写进 `PUBLIC_` 或 `VITE_` 变量。

| 文件 | 用途 | 提交 Git |
| --- | --- | --- |
| `.env.example` | 全部可用配置项的说明、示例与枚举；不是自动加载的运行配置 | 是 |
| `.env` | 所有环境共享的公共基础配置 | 是 |
| `.env.dev` | 开发环境的公共覆盖 | 是 |
| `.env.test` | 测试环境的公共覆盖 | 是 |
| `.env.prod` | 生产环境的公共覆盖 | 是 |
| `.env.local` | 当前机器的私有配置、连接凭据、SSH 路径等 | 否 |

同名变量优先级为：**已有进程变量 > `.env.local` > `.env.<环境>` > `.env`**。因此切换环境前也要检查本机覆盖，避免 `.env.local` 中的连接仍指向另一环境。复杂对象可用 JSON 整体覆盖，整体节点优先于子字段；变量含义和可用值以生成工程的 `.env.example` 为准，框架完整目录见[根 `.env.example`](../../.env.example)。除 CLI 随机生成、按环境共享的初始管理员密码和传输密钥环外，其他真实凭据留在本机文件或部署进程中。

```sh
pnpm dev
pnpm dev:test
pnpm dev:prod
```

以上是开发服务器使用不同配置的方式；构建不按环境区分。Node 服务编译后用 `start:test` / `start:prod` 选择运行配置。fullstack 根 `start` 只启动 API，Web 的本地预览需在对应客户端运行 `preview`；正式容器发布会一起启动 Web 与 API。

#### 传统手工编码

先把功能的输入输出、权限、数据变化和验收场景写清楚，再从现有模块的公开入口实现。fullstack 通常先调整 contract，再补服务逻辑与客户端调用；SvelteKit 沿用文件路由和服务端加载。fullstack、移动端沿用模板的自动发现 hash 路由，新增页面不必手改中央路由表，刷新仍保留当前页面。页面继续使用共享 header/footer。

SvelteKit 项目可用 `hai generate page dashboard`、`hai generate component UserCard` 等命令生成基础代码。目前 page/api 生成器输出的是 SvelteKit 文件路由，不会生成 fullstack/API workspace 的 contract、procedure 或 hash 页面；这些应沿现有目录实现。生成器也不会替你完成业务规则。按实际包类型使用 `init → use → close` 或工厂/纯函数契约，返回 `HaiResult` 时先判断 `success`。导出的函数、核心逻辑、表结构和数据结构写清 JSDoc，并给出使用或数据示例。

完成一个功能后，按项目现有 scripts 验证：

```sh
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

E2E 前准备 Playwright 配置所要求的浏览器及实际服务；只改文案等低影响内容时按影响范围选门禁，不必新增重复测试。UI 改动检查真实交互和截图。临时工程、容器、进程、日志、截图和报告在测试 teardown/finally 自动清理，失败或取消也清理；不要提交验收产物或清理用户既有资源。

#### AI first：先确认文档，再生成和演进实现

CLI 会把完整 skills 放入应用 `.agents/skills/`。下面的 skill 名称表示交给 AI 的任务入口，不是 Shell 命令；可以直接说“使用 hai-spec-review……”，或让助手读取对应 `SKILL.md`。具体工具是否提供快捷调用，以该工具支持为准。

1. **写下要实现的业务。** 在 `docs/` 放需求和必要设计，说明目标、角色、权限、页面/API、字段与枚举、状态变化、失败反馈、验收条件和明确排除项。文档可以从小范围开始，关键是让实现者不必猜业务规则。
2. **用 [hai-spec-review](../../packages/cli/templates/skills/hai-spec-review/SKILL.md) 检查文档。** 例如：“审查 docs/requirements.md 与 docs/design.md，检查是否足以实现，给出问题和具体修正文案，暂不编码。”解决问题后复审，固定通过的文档范围与版本。模板默认角色和流程可以按明确需求调整。
3. **用 [hai-spec-implement](../../packages/cli/templates/skills/hai-spec-implement/SKILL.md) 生成实现。** 先提交已确认的业务文档，再要求：“根据已审查文档规划并依次实施，完成验证和本地合并，不推送或发布。”它维护 `docs/task-list.md`、`docs/tasks/T001-….md`、需求覆盖和文档基线，按依赖逐项执行，而不是一次生成后只看构建结果。
4. **在每项任务里实现、测试、审查。** [hai-app-create](../../packages/cli/templates/skills/hai-app-create/SKILL.md) 负责功能开发和框架复用；[hai-app-tests](../../packages/cli/templates/skills/hai-app-tests/SKILL.md) 负责适用的单元、集成与浏览器测试；[hai-app-review](../../packages/cli/templates/skills/hai-app-review/SKILL.md) 检查安全、返回契约、代码与真实交互。普通小功能或修复也可以直接使用这三个入口。
5. **提交 PR 前用 [hai-pr-review](../../packages/cli/templates/skills/hai-pr-review/SKILL.md) 收尾。** 提供改动范围、diff、门禁结果和未验证项，请它检查风险及合并准备度。AI 审查不代表 CI 通过，也不会因此获得发布评论、推送、合并或部署授权。

需求变更时，先修改并提交受影响的业务文档，复审变化，再说：“使用 hai-spec-implement，根据已验收文档基线到本次文档提交的差异更新实现，复用原任务并完成集成验收。”流程会固定旧/新文档快照，核对关联规则，更新任务、代码、测试和文档；全部验收后才推进基线。不要直接把当前 HEAD 当作旧基线，也不要把未合并分支标成已完成。中断后可要求从任务清单继续。

上面四个 `hai-app-create`、`hai-app-review`、`hai-app-tests`、`hai-pr-review` 均为实际分发的应用 skills。框架源码仓库中的 `hai-app-create` / `hai-app-review` 面向仓库维护，名称和使用场景不同。

### 4. 编译源码与打包产物

创建项目默认安装部署工具，可用 `hai create my-app --no-deploy` 关闭。部署 SDK 属于开发依赖，不进入应用运行镜像。

交付角色统一为 `serv`（独立 API 后端）、`web`（静态或 SSR 浏览器站点）、`app`（Android/iOS 手机安装包）、`desktop`（桌面安装包）。Fullstack 容器为 serv + 可选 web，API 为 serv，admin/website/h5/mobile-app 的浏览器镜像为 web；原生 app/desktop 不作为服务器 Compose 服务。`--images` 与 `--services` 使用 serv/web，`--target app` 与 `--target desktop` 生成原生包。API workspace 的服务目录为 `apps/<项目>-serv`。镜像与容器共用工程根 `package.json.name` 的归一化身份（去 scope、转小写、非法字符合并为连字符）；名称缺失或无效时报错，不回退目录名。镜像为 `localhost/hai-<项目>-<角色>:<buildId>`，容器为 `hai-<项目>-<环境>-<角色>`，镜像可跨环境复用。

```sh
pnpm build
pnpm build --target docker
pnpm build --target docker --images web
pnpm build --target desktop --platform windows --arch x64
```

源码编译、镜像构建、桌面打包分别对应 compile/docker/desktop。构建不选择部署环境、不注入运行期密钥。原生安装包在对应操作系统准备 SDK 与 Rust 工具链后构建。

#### build 的可选参数

| 参数 | 用途 |
| --- | --- |
| `--target` | compile（默认）、docker、desktop |
| `--images` | serv、web 或 serv,web；只构建导出所选镜像 |
| `--runtime` | auto（优先 Podman）、podman、docker |
| `--network` | 容器构建网络，默认引擎设置 |
| `--no-http-proxy` | Podman 构建不继承本机代理 |
| `--sqlite-prebuild-mirror` | SQLite 预编译包的可信 HTTP(S) 根地址 |
| `--platform` / `--arch` | 原生安装包的系统与架构 |

#### 用 hai.json 描述要打什么包

```json
{
  "build": {
    "images": [
      {
        "name": "serv",
        "context": ".",
        "dockerfile": "images/serv.Dockerfile",
        "containerPort": 3000
      },
      {
        "name": "web",
        "context": ".",
        "dockerfile": "images/web.Dockerfile",
        "containerPort": 8080
      }
    ],
    "desktop": [
      "apps/demo-desktop"
    ]
  },
  "deploy": {
    "provider": {
      "type": "docker-ssh",
      "expose": {
        "hostPort": "${HAI_DEPLOY_PROVIDER_EXPOSE_HOSTPORT:18080}"
      }
    },
    "container": {
      "s3Engine": "rustfs"
    }
  }
}
```

每个镜像独立 Dockerfile；web 的 Nginx 配置与启动资源放 `images/web/`。Dockerfile 内保留编译/运行阶段，配置不再选择阶段。没有 Web 或 desktop 时删除相应项。

构建器将锁文件、包配置、本地归档和补丁准备为 `images/dependencies/` 输入，结合 pnpm store、SQLite 驱动缓存与 Docker 分层复用下载；下载、安装和整理生产依赖共用这些缓存。源码修改不应重新下载全部依赖；缓存为空仍能联网构建。Windows node_modules 不用于 Linux 镜像。完全离线构建还需预先准备基础镜像、工具链和匹配 ABI/架构/libc 的原生预编译包。

默认容器用于 CPU 运行或连接远程 AI 服务，不额外下载 GPU 运行库。需要使用部署机器上的 GPU 时，自行定制镜像和容器运行参数。

版本来自应用根 package.json.version。制品位于 `.hai/build/docker/<buildId>/`，包括格式版本 4 的 manifest.json、所选镜像 tar 和 SHA-256；partial 标识部分构建，hasWeb 保留工程拓扑。相同应用版本允许重建，构建编号和镜像引用区分实际内容；全部导出成功才更新本机构建入口。基础镜像、中间件及工具使用明确版本，不使用 latest。

### 5. 把构建产物部署到环境

#### 先准备环境与部署目标

默认部署名取工程根（最近的 `hai.json` 或锁文件所在目录）的 `package.json.name`，缺失或无效时报错，再附加显式环境后缀。例如 fullstack 工程 `hai-delivery` 扫描 `packages/hai-delivery-serv`，`--env test` 生成 `/opt/hai/apps/hai-delivery-test` 和 `bundle-hai-delivery-test-<部署ID>-<版本>.tar`。远端目录、交付包、Compose 项目、API/Web/中间件容器、数据卷、服务器凭据状态及增量基线统一使用该名称；不会按字符串删除真实项目名中的 `-serv`。

命名与拓扑契约使用制品格式 4，新增 primaryService（serv/web），hasWeb 表示完整工程是否包含浏览器端；只有 serv + web 才生成同源 API 代理。旧格式制品须重新构建。旧部署先备份并核对项目名、数据卷和受管凭据，再切换到新的完整部署基线；工具不自动跨项目迁移数据。完整部署仍会按 Compose 规则清理同项目的旧服务容器，不能仅修改 deploy-target.json.directory 完成迁移。

迁移已有工程时，先同步 hai.json 的 build.images 名称、Dockerfile 文件名与引用；API workspace 的服务目录、包名和依赖引用统一为 -serv，并重新安装依赖。随后重新构建完整制品；不要仅改归档文件名或手工修改 manifest 冒充新构建。

CLI 的 --project-name 与 SDK 的 DeployAppOptions.projectName 覆盖入口已移除；旧参数会明确报错，请在工程根 package.json.name 维护资源身份。

准备 `.env.<环境>`（例如 `.env.prod`）和项目根 `hai.json`，其中 `build` 描述镜像与桌面构建，`deploy` 描述整个应用的部署。fullstack 的 deploy 参数仍指向 `packages/<项目>-serv`，API workspace 指向 `apps/<项目>-serv`，仅用于扫描运行依赖和模块 YAML；前后端构建与部署配置统一在项目根。

`deploy` 支持 `${变量:回退值}` 与 `HAI_DEPLOY_*` 分层覆盖（例如 `HAI_DEPLOY_PROVIDER_EXPOSE_HOSTPORT`）；父对象可用 JSON 整体覆盖。部署变量优先级为进程环境 > `.env.<环境>.local` > `.env.<环境>` > 旧 `.env.local` > `.env`；其他模块保留进程 > 环境私有 > 旧全局私有 > 环境公共 > 基础的顺序。按环境私有层仅由部署 SDK 加载，不改变 Core 的普通运行规则。构建不加载部署环境和密钥。

已有项目需把原构建对象移入 `hai.json.build`，把原部署 YAML 转成 JSON 放入 `hai.json.deploy`，删除原文件并保留现有 `HAI_DEPLOY_*` 变量。已有自建 S3 的项目首次升级必须全量部署：旧成功基线仍含已退出的一次性初始化服务，直接使用新增量包会被依赖存活检查拒绝；全量部署同时刷新中间件环境中的 `createBucket`，之后即可继续增量更新。

直接部署首次补齐 SSH 连接和认证方式，支持私钥/agent 和密码；SSH 参数保存在 `.env.<环境>.local`，密码隐藏输入、私钥只保存路径。中间件公共配置写 `.env.<环境>`，秘密值写 `.env.<环境>.local`。完整配置后使用 `--yes` 无交互复用，需要保持中间件时追加 `--skip-middleware`。`--bundle-only` 不询问 SSH，已有连接会写入 `deploy-target.json`；修改该文件只影响当前包，不回写工程。离线密码从操作机的 `HAI_DEPLOY_PROVIDER_SSH_PASSWORD` 等 target 引用变量读取，不写入交付包。

每次交付仍生成 `.hai/deploy/<环境>/bundle-.../.env.runtime`。`--env test` 默认写 `NODE_ENV=test`，dev 为 development，prod 及其他模式为 production；显式环境配置可以覆盖。该文件是运行产物，下次配置来自工程环境文件。`--build` 的正式优化模式不改变此运行默认值；旧包需重新打包。

自建中间件的密码由服务器 `<remoteDir>/managed-secrets.env` 持久保存（权限 0600），应与数据卷一起备份。每次打包只生成首次初始化的随机候选，不依赖打包机缓存；在线 SDK、deploy.sh、deploy.ps1 和 deploy-local.sh 都在部署锁内复用服务器值，同时更新应用连接配置及中间件原生变量。交付 tar 保持不可变，只有服务器私有运行文件使用定稿值。若状态缺失而对应数据卷已存在，部署在变更服务前明确停止，须恢复服务器凭据备份；不会自动换密或删除数据。不提供旧版本密码状态迁移。

自建或云开通的整体 `HAI_*` 配置会清除被替换的旧叶字段，例如 Redis 覆盖后不再留下 `HAI_CACHE_TYPE=memory`。全局 `~/.hai/credentials.yml` 只补缺项，不能覆盖当前环境/进程的同名键或父配置。部署先启动选中中间件，等待 PostgreSQL/MySQL/Redis/S3 健康，再启动 serv/web；增量和失败恢复沿用此顺序，未选容器保持不变。

生成时为 `.env.dev/.env.test/.env.prod` 分别生成独立的初始管理员密码和传输密钥环；环境文件随项目提交，克隆后可共享，并可通过本机私有文件或进程环境覆盖。启用 transport 的应用缺少/错误配置 `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` 时，部署在上传前指出配置来源；同一环境的所有节点复用同一有效密钥环，可直接加载环境文件，也可通过 Secret Manager 覆盖；不为每个节点临时生成。CLI 完成部署后提示 `HAI_ADMIN_DEFAULT_PASSWORD` 的实际来源，不打印密码，不依赖日志级别；该密码仅在首次创建管理员时生效。 离线入口也会提示服务器私有 `.env.runtime` 中的密码变量位置。

#### 按应用真正需要的中间件处理

框架连接配置使用 `HAI_*`。镜像要求的 `POSTGRES_*`、`RUSTFS_*` 等原生变量保留原名，单独写入私有 `middleware-runtime.env`，仅中间件容器读取，不再混入工程环境配置或应用 `.env.runtime`；应用增量覆盖 `middleware.env` 只保留框架配置。旧工程原生字段不会自动删除，但新应用环境会忽略框架曾生成的已知原生键。

根据锁文件运行依赖和模块配置识别数据库、缓存、文件存储、向量库、LDAP、邮件等。逐项选择默认、自定义或保持。配置完备可用 `--skip-middleware` 跳过向导和开通。SQLite、Memory cache、本地存储不产生外部镜像；Compose 自建服务的镜像自动加入完整交付包。外部服务仍需目标网络可达，云开通不属于完全离线部署。

#### deploy 的可选参数

| 参数 | 用途 |
| --- | --- |
| `--env` / `--env-dir` | 环境和环境文件目录 |
| `--build` | 先构建选中应用镜像，再打包部署；可结合 bundle-only |
| `--services` | 只更新指定 Compose 服务，例如 web、serv、serv,web、storage |
| `--artifact-dir` | 精确选择已构建制品 |
| `--bundle-only` | 只生成 tar 和跨平台脚本，不连接服务器 |
| `--runtime` | 本地构建及中间件镜像导出引擎 |
| `--output` | 自定义部署 tar 路径，相对命令执行目录解析，自动补版本后缀 |
| `--skip-middleware` | 跳过中间件配置与开通 |
| `--yes` | 无交互使用有效配置；缺必要值明确报错 |

#### 两机连通：直接部署

```sh
pnpm run deploy --env prod --build
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<buildId>
pnpm run deploy --env prod --build --services web
# 多个服务共用一个 --services，用英文逗号分隔；加引号兼容 PowerShell
pnpm run deploy --env prod --build --services "serv,web"
```

部分更新需要服务器已有成功的完整安装，并且端口、应用布局相同。以服务器成功状态为基线，只替换选中的镜像和配置，保留其他服务、连接与卷。部署脚本先按项目和服务名移除选中的旧容器（保留数据卷），再执行 `compose up -d --no-deps --no-build --pull never --no-recreate web` 创建新容器；其他容器保持运行，不执行整个项目 down。首次安装使用完整包。自建 S3 的桶由应用的 `storage.init()` 按可选 `createBucket` 初始化。

命令中的 `-d` 表示后台启动，`--no-deps` 不连带启动或重启依赖，`--no-build` 不在服务器编译，`--pull never` 禁止拉取镜像，`--no-recreate` 保留仍存在的容器；选中的旧容器已由脚本移除，因此会创建新容器，末尾 `web` 是 Compose 服务名（不是镜像标签）。多个服务用空格分隔。

S3 的 `createBucket` 默认为 `false`；部署器为自建 S3 注入 `HAI_STORAGE_CREATEBUCKET=true`，应用初始化时检查并创建缺失的桶，已有桶保持不变。外部 S3 由用户决定是否启用。Compose 使用 `hai-app` 网络，不生成 YAML 锚点。只更新 `storage` 无须应用镜像；新的桶在下次应用初始化时创建。


#### 两机不通：生成包，手工复制

```sh
pnpm run deploy --env prod --build --bundle-only
```

每次交付只生成一个 `.hai/deploy/<环境>/bundle-<项目>-<部署ID>-<版本>/` 目录，tar、Compose、环境、web.conf、清单与跨平台脚本全部在其中，直接整体复制即可。显式 `--output release-prod.tar` 按命令执行目录生成 `release-prod-<版本>/release-prod-<版本>.tar`，其他文件仍在同一交付目录。包包含所选应用/中间件镜像、服务配置、私有环境、校验和、README 和 apply.sh。运行上传脚本前，先打开操作目录的 `deploy-target.json`，按其中逐项说明修改并核对服务器、SSH 用户和端口、私钥及指纹文件、远程目录等配置。Windows 运行 deploy.ps1，Linux/macOS 运行 deploy.sh；两个脚本均读取该 JSON，通过 SSH 上传后执行同一服务器流程。本机运行 deploy.sh 需 sh、awk、ssh、scp；可用 `sh deploy.sh 主机 [端口] [用户]` 覆盖连接地址，或给 deploy.ps1 传入 `-IdentityFile` 覆盖私钥。两个脚本均支持用 HAI_DEPLOY_IDENTITY_FILE、HAI_DEPLOY_KNOWN_HOSTS_FILE 覆盖私钥及指纹文件路径。换电脑或操作系统后，这些路径必须指向当前电脑上的实际文件。

完全隔离的 Linux 服务器上，复制整个交付目录后运行 `sh deploy-local.sh`；脚本自动校验和解包同目录 tar，再调用包内 apply.sh，也可传入部署根目录覆盖默认值。每步检查结果，任何失败返回非零退出码；镜像导入、服务启动和 HTTP 检查分别报告。结果写到服务器部署目录 `result-<部署ID>.json`，只有检查通过才更新 current 成功状态。重复应用同一部署包会明确停止；相同版本重新生成的新包允许发布。已有版本失败时尝试恢复选中的旧容器和配置，保留数据卷及诊断材料；不会回退已写入的业务数据。

离线包的 `manifest.json` 用 `partial` 与 `selectedServices` 明确记录模式和本次服务；执行脚本固化同一选择，不靠文件名猜测。不指定 `--services` 且使用完整构建时为全量；指定 `--services` 或使用部分构建时为增量。增量包必须匹配服务器 `current` 的成功基线，首次安装会拒绝。

#### 完全离线前再核对一次

- 完整 tar 已含自建中间件归档，镜像架构与服务器一致；服务器启动不访问 registry。
- Linux 已安装 Docker/Podman、可执行的 Compose、sh、tar、sha256sum、awk、curl、util-linux flock，部署文件系统支持 flock；用户有目录与容器权限。
- 包含私有配置，安全搬运，不提交 Git；持久化卷身份跨版本稳定。
- 实际断外网验证启动、登录、页面刷新、重启与数据持久化。生产 HTTPS、证书、DNS 和外部服务需另行准备。

部署与失败恢复全程使用固定 `.deploy.lock` 内核锁；禁止删除或替换文件、按时间抢锁。父进程强杀后活跃子命令可继续持锁，全部持有进程退出或重启后自动释放。强杀不执行恢复 trap，须核对结果、`current` 和实际容器状态后用新包恢复；详细说明见[部署锁与恢复](../../packages/deploy/README.md)。

失败输出区分本地受管理进程已确认退出/未确认和远端未知/脚本已完成；SDK 可用 `getDeployCommandState(error)` 读取部署 ID 与结果路径。仅新连接读到完整且 ID 匹配的原子结果才确认远端脚本及恢复结束，不能把本地 SSH 退出当作远端停止。未知状态不自动重跑发布或回滚。

### 6. 更新框架，保留自己的应用

在应用目录让 AI 使用 [hai-framework-sync](../../packages/cli/templates/skills/hai-framework-sync/SKILL.md)：

> 升级 hai-framework 到最新已发布版本。先核对当前依赖和目标发布版本，说明差异及需要我选择的事项，然后迁移依赖、调用、配置和 skills，保留项目私有规则并完成验证。不发布或部署应用。

也可以指定精确目标版本，或只要求比较、不修改。它会查询实际 registry/dist-tag，核对所有已用包的目标版本与引擎要求，比较累计差异，更新精确版本和 lockfile，并迁移公开 API、配置、scripts 及完整 skill 资源。升级有网络或版本发布不齐等阻塞时会说明处理办法，不能把本地缓存称为“最新”。

`hai init` 可为旧项目补齐缺失的 AI 入口和 skills，但会保留已有文件；它不是框架升级命令，也不会覆盖旧规则。更新已有 skills 时按旧模板、应用自定义、新模板合并。框架源码的 `main` 也不等于 npm 已发布版本。

升级后按项目 scripts 执行 typecheck、lint、build、test 和受影响 E2E，实际验证认证、数据与关键流程。重新生成需要交付的镜像或安装包，随后按第 5 节部署。只改版本号或只通过构建，还不能代表升级完成。

## 发布预检与原生打包

`hai upgrade 0.1.0-alpha.71` 只读检查全部消费框架包及 CLI/deploy 的精确版本、发布 tar 完整性、CLI/skills 文件、catalog/lock/安装漂移和业务 skill 定制；不安装、不覆盖本地修改，缺包退出非零。JSON 包含模块迁移预检入口、备份与旧会话边界。`hai deploy --env prod --plan` 校验本地制品并显示项目/环境身份、配置来源键名、选中/保留范围、基线要求与恢复目录，不构建、不生成凭据或连接目标；未读取的远端基线明确 not-inspected。

`hai build --target app --platform android|ios` 才生成并校验新 APK/IPA。先添加平台工程并安装 Android SDK/JDK 或 macOS/Xcode，配置原生签名。cap:sync 只是同步；没有工程、工具链或新产物均失败。发布过滤 CAPACITOR_SERVER_URL，并在同步后核验原生配置，拒绝开发热更新地址。build.app 指定 App 工程目录。

`schemaColumns(reldb, table, sql?)` 只读检查真实结构；`migrateSchema(reldb, module, steps, { dryRun: true })` 不创建账本。版本步骤由所属模块维护，业务不修改框架内部表。执行使用 `hai_schema_migrations`，SQLite/PostgreSQL 整体事务，MySQL DDL 隐式提交因此步骤必须可重入；失败不推进版本，重新检查真实结构后续做，拒绝向低版本降级。升级前停止所有旧写入并备份 DB/会话缓存；回退需恢复兼容数据库与旧代码，不能只换二进制。详见 [升级指南](../../docs/usage/README.md)。

## 开发测试

在生成工程根按实际 scripts 执行 `pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm test` 和 `pnpm test:e2e`。容器交付还应验证目标平台的镜像、部署脚本、健康检查与失败恢复；浏览器通过不能代替原生验收。

## 许可证

Apache-2.0
