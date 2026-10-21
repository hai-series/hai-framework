# 从创建项目到发布应用

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

这份指南面向使用 hai-framework 开发应用的团队，从第一次创建项目讲到开发、构建、交付和后续升级。下面以 `my-app` 为项目名、fullstack 的 Web + API 为主线；不同模板的目录和命令差异会在相应位置说明。

命令对应当前仓库的 CLI 与模板。使用已发布版本时，先用 `hai --version`、`hai build --help` 和 `hai deploy --help` 核对能力；尚未发布的源码能力不会自动出现在旧版 CLI 中。模块用法从[根 README](../../README.md)和各包 README 查找；维护框架源码请另读 [AGENTS.md](../../AGENTS.md)。

## 1. 准备开发环境

| 工作 | 需要准备什么 |
| --- | --- |
| 创建、开发、编译、运行 CLI | Node.js `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`，pnpm 12.11.2；以项目 `engines`、`packageManager` 为准 |
| 管理版本、AI 按文档实施 | Git；能读取项目文件并执行命令的 AI 编程助手 |
| 构建容器镜像 | 已安装且运行中的 Podman 或 Docker；Windows 上使用 Linux 容器环境 |
| 生成桌面安装包 | 对应系统上的 Rust、目标架构工具链、Tauri 所需系统 SDK 和打包工具 |
| 自动部署到 Linux | 本机 `tar`、`ssh`、`scp`；服务器容器引擎、Compose、`sh`、`tar`、`sha256sum` 和目录权限 |
| 只生成部署包 | 本机 `tar`、已安装的项目依赖和完整构建产物；不要求 SSH 或本机容器引擎 |

本文用 `pnpm` 表示命令，Windows PowerShell 中替换为 `pnpm.cmd`。自动选择 Podman/Docker 只会探测可用引擎，不会安装或启动引擎。

## 2. 创建项目

先安装 CLI，再创建包含部署能力的 Web + API 工程：

```sh
pnpm add -g @h-ai/cli
hai --version
hai create my-app --type fullstack --frontends web --features deploy --yes
cd my-app
pnpm dev
```

创建过程默认安装依赖并初始化 Git。想交互选择应用类型，可以运行 `hai create my-app`；fullstack 的部署能力需要显式添加 `--features deploy`。如果使用 `--no-install`，进入项目后先运行 `pnpm install`。首次安装需要可用的 registry，离线条件见后文。

| 创建选项 | 如何选择 |
| --- | --- |
| `--type` | `fullstack`：独立 API 与多端客户端；`api`：contract + service；`admin`、`website`、`h5`：SvelteKit 应用；`mobile-app`：Capacitor + Vite 移动端 |
| `--frontends` | fullstack 可选 `web,app,desktop`，逗号分隔；默认三者都生成。`miniapp` 目前仅生成说明占位，不是可发布小程序 |
| `-t, --template` | `minimal`、`default`、`full`、`custom`。非 fullstack 的自选功能使用 `custom`；fullstack 的业务模块由模板确定 |
| `-f, --features` | 非 fullstack 可组合如 `iam,db,cache,storage,deploy`，完整列表见 [CLI 文档](../../packages/cli/README.md)。fullstack 用此参数启用可选 `deploy` |
| `--examples` / `--no-examples` | 是否生成示例代码 |
| `--no-install` / `--no-git` | 暂不安装依赖 / 不初始化 Git |
| `-p, --package-manager` | `pnpm`、`npm`、`yarn`；fullstack/API workspace 使用 pnpm |
| `--git-remote <url>` | 设置远程仓库地址 |
| `-y, --yes` | 按默认值创建，省略交互 |

需要桌面端时，创建命令改用 `--frontends web,desktop`。已有项目可用 `hai add <module>` 增量添加适用模块；例如 `hai add deploy`。fullstack 默认包含数据库、缓存、IAM、加密、存储和审计，没有 AI 运行依赖，不需要安装 CUDA。

fullstack 中，`packages/my-app-contract` 定义接口，`packages/my-app-serv` 实现 API，`packages/my-app-shared` 放共享内容，`apps/my-app-web` 提供 Web。环境文件在工程根；API 模板的环境文件在 `apps/my-app-service`。生成后先读项目自己的 README 和 AGENTS.md。

## 3. 配置环境，再开始开发

配置文件表达模块结构，例如 `_db.yml` 中的 `type` 引用 `HAI_DB_TYPE`；地址、端口、Provider 和密钥等环境差异通过统一环境变量传入。不要为 test/prod 复制整套实现，也不要把服务端密钥写进 `PUBLIC_` 或 `VITE_` 变量。

| 文件 | 用途 | 提交 Git |
| --- | --- | --- |
| `.env.example` | 全部可用配置项的说明、示例与枚举；不是自动加载的运行配置 | 是 |
| `.env` | 所有环境共享的公共基础配置 | 是 |
| `.env.dev` | 开发环境的公共覆盖 | 是 |
| `.env.test` | 测试环境的公共覆盖 | 是 |
| `.env.prod` | 生产环境的公共覆盖 | 是 |
| `.env.local` | 当前机器的私有配置、连接凭据、SSH 路径等 | 否 |

同名变量优先级为：**已有进程变量 > `.env.local` > `.env.<环境>` > `.env`**。因此切换环境前也要检查本机覆盖，避免 `.env.local` 中的连接仍指向另一环境。复杂对象可用 JSON 整体覆盖，整体节点优先于子字段；变量含义和可用值以生成工程的 `.env.example` 为准，框架完整目录见[根 `.env.example`](../../.env.example)。提交的环境文件只放公共配置，真实凭据留在本机文件或部署进程中。

```sh
pnpm dev
pnpm dev:test
pnpm dev:prod
```

以上是开发服务器使用不同配置的方式；构建不按环境区分。Node 服务编译后用 `start:test` / `start:prod` 选择运行配置。fullstack 根 `start` 只启动 API，Web 的本地预览需在对应客户端运行 `preview`；正式容器发布会一起启动 Web 与 API。

### 传统手工编码

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

### AI first：先确认文档，再生成和演进实现

CLI 会把完整 skills 放入应用 `.agents/skills/`。下面的 skill 名称表示交给 AI 的任务入口，不是 Shell 命令；可以直接说“使用 hai-spec-review……”，或让助手读取对应 `SKILL.md`。具体工具是否提供快捷调用，以该工具支持为准。

1. **写下要实现的业务。** 在 `docs/` 放需求和必要设计，说明目标、角色、权限、页面/API、字段与枚举、状态变化、失败反馈、验收条件和明确排除项。文档可以从小范围开始，关键是让实现者不必猜业务规则。
2. **用 [hai-spec-review](../../packages/cli/templates/skills/hai-spec-review/SKILL.md) 检查文档。** 例如：“审查 docs/requirements.md 与 docs/design.md，检查是否足以实现，给出问题和具体修正文案，暂不编码。”解决问题后复审，固定通过的文档范围与版本。模板默认角色和流程可以按明确需求调整。
3. **用 [hai-spec-implement](../../packages/cli/templates/skills/hai-spec-implement/SKILL.md) 生成实现。** 先提交已确认的业务文档，再要求：“根据已审查文档规划并依次实施，完成验证和本地合并，不推送或发布。”它维护 `docs/task-list.md`、`docs/tasks/T001-….md`、需求覆盖和文档基线，按依赖逐项执行，而不是一次生成后只看构建结果。
4. **在每项任务里实现、测试、审查。** [hai-app-create](../../packages/cli/templates/skills/hai-app-create/SKILL.md) 负责功能开发和框架复用；[hai-app-tests](../../packages/cli/templates/skills/hai-app-tests/SKILL.md) 负责适用的单元、集成与浏览器测试；[hai-app-review](../../packages/cli/templates/skills/hai-app-review/SKILL.md) 检查安全、返回契约、代码与真实交互。普通小功能或修复也可以直接使用这三个入口。
5. **提交 PR 前用 [hai-pr-review](../../packages/cli/templates/skills/hai-pr-review/SKILL.md) 收尾。** 提供改动范围、diff、门禁结果和未验证项，请它检查风险及合并准备度。AI 审查不代表 CI 通过，也不会因此获得发布评论、推送、合并或部署授权。

需求变更时，先修改并提交受影响的业务文档，复审变化，再说：“使用 hai-spec-implement，根据已验收文档基线到本次文档提交的差异更新实现，复用原任务并完成集成验收。”流程会固定旧/新文档快照，核对关联规则，更新任务、代码、测试和文档；全部验收后才推进基线。不要直接把当前 HEAD 当作旧基线，也不要把未合并分支标成已完成。中断后可要求从任务清单继续。

上面四个 `hai-app-create`、`hai-app-review`、`hai-app-tests`、`hai-pr-review` 均为实际分发的应用 skills。框架源码仓库中的 `hai-create-app` / `hai-review-app` 面向仓库维护，名称和使用场景不同。

## 4. 编译源码与打包产物

**构建一次，在部署时选择环境。** 生成工程的 `pnpm build` 默认调用源码编译；镜像或桌面安装包通过 `--target` 明确选择。构建不读取部署环境覆盖，也不注入运行期密钥，没有 `build:prod` 或 `--env prod` 的构建分支。

```sh
pnpm build
pnpm build --target compile
pnpm build --target docker
pnpm build --target docker --runtime podman --no-http-proxy
pnpm build --target docker --runtime docker
pnpm build --target desktop --platform windows --arch x64
```

`compile` 是项目内部的实际编译脚本；不要让它、Dockerfile 或 Tauri 的 `beforeBuildCommand` 再调用同一个镜像/原生构建入口，造成递归。源码输出目录按模板而定，例如 Vite 的 `dist`、SvelteKit 的 `build`，以及 contract/service 各自的构建目录。

### build 的可选参数

| 参数 | 可用值、默认值与用途 |
| --- | --- |
| `--target <target>` | `compile`（默认）、`docker`、`desktop` |
| `--runtime <runtime>` | 镜像构建用 `auto`（默认，优先可达 Podman，再尝试 Docker）、`podman`、`docker` |
| `--platform <platform>` | 桌面用 `windows`、`linux`、`macos`，默认当前系统，必须在对应系统上构建 |
| `--arch <arch>` | 桌面用 `x64`、`arm64`，默认当前架构；需对应 Rust target/SDK |
| `--sqlite-prebuild-mirror <url>` | Dockerfile 支持的 SQLite 预编译包镜像根地址，例如 `http://mirror.internal/better-sqlite3`；只接受 HTTP(S)，不含账号、密码、查询串或片段 |
| `--no-http-proxy` | Podman 构建不继承本机代理 |
| `-C, --cwd <path>` | CLI 全局工作目录；例如 `pnpm exec hai build --cwd ../my-app --target docker` |
| `-v, --verbose` | CLI 全局详细输出开关；实际明细取决于子命令 |

这些参数传给 `hai build`；检查帮助可用 `pnpm exec hai build --help`。镜像架构由容器引擎和 Dockerfile 决定，桌面 `--arch` 不是 Docker 跨架构开关。

### 用 hai.build.json 描述要打什么包

文件放在应用工程根目录，描述构建结构，不保存环境、服务器地址或密钥。以下是包含 Web 和桌面端的 fullstack 示例；只有 Web 时删去 `desktop`：

```json
{
  "images": [
    { "name": "app", "context": ".", "dockerfile": "Dockerfile", "target": "runtime", "containerPort": 3000 },
    { "name": "web", "context": ".", "dockerfile": "Dockerfile", "target": "web", "containerPort": 8080 }
  ],
  "desktop": ["apps/my-app-desktop"]
}
```

| 配置项 | 含义与约束 |
| --- | --- |
| `images` | `docker` 目标必需；必须有且仅有一个 `app`，可额外有一个 `web`，角色不重复 |
| `images[].name` | 仅 `app` 或 `web`；决定归档角色，Web 存在时随 API 一起发布 |
| `images[].context` | 相对工程根的构建上下文，默认 `.` |
| `images[].dockerfile` | 相对 context 的 Dockerfile 路径，默认 `Dockerfile` |
| `images[].target` | 可选的 Dockerfile 多阶段目标，省略则使用 Dockerfile 默认最终阶段 |
| `images[].containerPort` | 可选的容器内监听端口，须与镜像实际服务一致；省略时部署器使用 API 端口配置、Web 默认 8080。服务器公开端口在部署时选择 |
| `desktop` | `desktop` 目标必需，值为相对工程根的 Tauri 工程目录数组，按顺序构建 |

仓库 `apps/*` 示例可能用 `context: "../.."` 和 `dockerfile: "apps/<name>/Dockerfile"` 引用 monorepo 根；独立生成工程通常直接用 `.`。新增 Dockerfile 阶段后同步这里的 `target`。

镜像成功后生成 `.hai/build/docker/<buildId>/manifest.json`、`app.tar`、可选 `web.tar`，清单记录镜像引用、端口和 SHA-256；所有镜像成功导出后才更新 `latest` 指针。交付时保留完整目录，不单独搬运某个 tar 或手改清单。

桌面打包实际调用 Tauri：Windows 生成 NSIS 安装程序，Linux 生成 deb/AppImage，macOS 生成 app/dmg；输出在对应工程 `src-tauri/target/<Rust target>/release/bundle/`。例如在 Linux/macOS 上分别使用 `--platform linux` / `--platform macos`。不同操作系统分别准备 runner，不承诺跨系统编译；移动端 Capacitor 的 Android/iOS 命令与 SDK 见生成项目 README，`desktop` 不会生成 APK/IPA。

静态客户端从运行期公开配置获取 API 地址；原生端可在启动进程前设置 `PUBLIC_API_BASE`。这类公开变量不放凭据，改变部署环境不需要重新打镜像。

## 5. 把构建产物部署到环境

`hai deploy` 是 CLI 入口，内部使用 `@h-ai/deploy`，只消费已经完成的产物。以下在生成应用根目录执行，使用 `pnpm run deploy` 明确调用项目脚本，避免与 pnpm 自身的同名命令混淆：

```sh
pnpm build --target docker
pnpm run deploy --env test
pnpm run deploy --env prod --skip-middleware
```

fullstack 的脚本会定位 `packages/my-app-serv`，同时读取根构建清单发布 API 与 Web；API 模板定位 `apps/my-app-service`；单包模板使用当前目录。也可显式调用：

```sh
pnpm exec hai deploy packages/my-app-serv --env prod --env-dir .
```

### 先准备环境与部署目标

部署第一步选择环境，随后检查 `.env.test` / `.env.prod` 等目标文件。缺少文件时先按 `.env.example` 创建，不会猜一个生产配置继续。`--env-dir` 可指定环境文件目录，路径相对命令工作目录。

服务的 `config/_deploy.yml` 选择 Provider 和公开端口，例如：

```yaml
provider:
  type: docker-ssh
  expose:
    hostPort: 18080
container:
  s3Engine: rustfs # rustfs | minio
```

首次自动部署时，向导询问 Linux 地址、SSH 用户/端口、私钥和 known_hosts 路径、远程目录、引擎与公开端口；保存到 `.env.local` 后可复用。私钥保存路径，不保存私钥内容。也可在该文件预先写整体配置：

```dotenv
HAI_DEPLOY_PROVIDER='{"type":"docker-ssh","ssh":{"host":"10.0.0.20","username":"deploy","port":22,"identityFile":"C:/Users/me/.ssh/hai_deploy"},"remote":{"baseDir":"/opt/hai/apps","runtime":"docker"},"expose":{"hostPort":18080,"containerPort":3000}}'
```

示例地址和路径需替换。先确认 SSH 主机指纹并准备非交互认证，运行用户能操作容器与部署目录；不要用关闭主机校验解决连接问题。整体 `HAI_DEPLOY_PROVIDER` 会覆盖 YAML 中的 provider，切换目标时注意更新本机配置。更完整字段见 [deploy 模块文档](../../packages/deploy/README.md)与[环境和中间件说明](../../packages/cli/templates/skills/hai-deploy/middleware.md)。

### 按应用真正需要的中间件处理

部署器从 `pnpm-lock.yaml` 中目标应用的运行依赖遍历所需模块，排除 dev/peer 引入的假需求，再结合配置判断数据库、缓存、S3、向量库、LDAP、邮件等后端。看到 `HAI_DB_TYPE=postgresql` 时，向导会说明当前默认是 PostgreSQL 及其用途。

每项可以选择默认配置、自定义连接；目标环境已有完整配置时还可保持不变。默认配置在 Compose 中增加相应服务，在支持的云平台中调用对应 Provisioner；自定义配置逐项输入连接字段。保持不变会跳过该项。公共配置与私有凭据分别写入环境文件和 `.env.local`，不要把密码提交到 Git。

已经准备好所有连接时，直接选择跳过，或使用 `--skip-middleware`，不会再改写连接或开通资源。已有镜像并不等于已有可用服务：使用自定义模式还需要服务已启动、账号/库/桶已准备且容器网络可达。

### deploy 的可选参数

| 参数 | 用途 |
| --- | --- |
| `[appDir]` | `hai deploy` 的可选应用目录，默认当前目录；生成项目脚本已填好服务路径 |
| `--env <environment>` | 如 `test`、`prod`，也可用对应 `.env.<name>` 的自定义名称；省略则交互输入 |
| `--env-dir <path>` | 环境文件目录，默认自动定位 |
| `-y, --yes` | 非交互使用当前默认值；完整的目标中间件配置保持不变，其余用当前后端默认配置。仍须提供环境、产物和完整部署目标 |
| `--project-name <name>` | 覆盖项目名；影响远程目录与 Compose/数据卷身份，后续更新保持一致 |
| `--skip-middleware` | 跳过全部中间件配置和资源开通 |
| `--skip-provision` | 同样跳过全部中间件处理；新命令建议用含义更直接的 `--skip-middleware` |
| `--artifact-dir <path>` | 指定含 `manifest.json` 的构建目录，或含 `latest` 的构建父目录；默认查找工程的 `.hai/build/docker` |
| `--bundle-only` | 仅适用 `docker-ssh`：生成 Compose tar，不连接 SSH |
| `--output <path>` | 指定部署 tar 输出路径；不填写时由部署器生成并报告路径 |
| `-C, --cwd <path>` / `-v, --verbose` | CLI 全局工作目录 / 详细输出 |

缺少产物时部署会失败，不会自动补构建。自动化示例：`pnpm run deploy --env prod --yes --skip-middleware --artifact-dir .hai/build/docker/<buildId>`，先把占位的 buildId 换成实际目录，并预配目标。云 Provisioner 可能创建付费资源，应在明确授权的账号和范围内执行。

### 两机连通：直接部署

本机生成 Compose、环境配置和启动脚本，再把它们与 app/web 镜像归档一起打成一个 tar，通过 SSH 上传；Linux 解包、导入镜像、启动 Compose 并检查 API/Web 健康状态。远程不接收源码，不构建镜像。本地部署机也不必安装容器引擎。

fullstack 的公开端口提供 Web 与同源 API 代理，API 私有环境变量不挂给 Web。部署成功后验证登录、页面刷新、关键操作和重启后的数据。外部 HTTPS、DNS、证书和必要 CORS 由实际入口配置，deploy 不自动配置 TLS。

### 两机不通：生成包，手工复制

```sh
pnpm run deploy --env prod --bundle-only --output release-prod.tar
```

这会生成包及操作说明，状态为 `packaged`，还没有让服务器运行。包中包含 `compose.yml`、`.env.runtime`、可选 `web.conf`、`images/`、`SHA256SUMS`、`start-prod.sh` 和 `README.txt`。它含私有配置，限制访问权限且不提交 Git。将 tar 用 U 盘等方式搬到 Linux，再按包内说明执行：

```sh
mkdir -p release && chmod 700 release
tar -xf release-prod.tar -C release
cd release
HAI_DEPLOY_PROVIDER_REMOTE_RUNTIME=docker sh start-prod.sh
```

使用 Podman 时改为 `podman` 并准备可用的 Compose 命令。脚本校验归档、加载 API/Web、检查全部镜像标签并导出所选环境标识后启动；缺少中间件镜像会停止，不会联网拉取。**中间件镜像不自动包含在 tar 中**，需要提前按包内 README 的准确名称和标签导入。

同一项目和环境重复部署会复用持久化卷。更新时先备份数据，再用新构建目录生成同环境包并执行同样流程；需要回退时保留旧构建清单和镜像，重新部署旧产物。镜像回退不会自动回退数据库迁移，迁移须单独制定备份和恢复方案。

### 完全离线前再核对一次

- Windows 部署机准备受支持的 Node/pnpm、完整工程、已安装依赖、CLI/SDK、tar 和完整 `.hai/build/docker/<buildId>`；自动 SSH 部署另需 ssh/scp，手工模式不需要。仅离线部署不需要本机 Docker、CUDA 或 Linux 编译器。
- 构建机提前生成与 Linux 服务器架构匹配的镜像。如果构建也必须离线，另准备 Linux 容器引擎、全部基础镜像、Corepack/pnpm、Linux 依赖缓存及匹配驱动版本、Node ABI、CPU 架构和 libc 的 SQLite 预编译包；Windows 的 node_modules 不能替代它们。
- Linux 准备 Docker/Podman、Compose、sh/tar/sha256sum、所需中间件镜像的准确标签、存储与权限；已有 PostgreSQL、Redis、RustFS 镜像时仍须核对名称/标签。外部服务采用容器可达地址，不能把容器内 localhost 当作宿主机。
- 先准备 `.env.prod` 和本机私有覆盖，确认端口、证书与数据目录；实际断网演练打包、搬运、启动、登录、刷新和持久化。

Vercel 是另一条发布路径：需要网络、平台账号与匹配适配器生成的 Build Output API v3 `.vercel/output`。deploy 只上传 prebuilt 产物并设置运行变量，不会替你把普通 Node 输出转成 Vercel 产物，也不在平台重新构建；`--bundle-only` 不用于 Vercel。

## 6. 更新框架，保留自己的应用

在应用目录让 AI 使用 [hai-framework-sync](../../packages/cli/templates/skills/hai-framework-sync/SKILL.md)：

> 升级 hai-framework 到最新已发布版本。先核对当前依赖和目标发布版本，说明差异及需要我选择的事项，然后迁移依赖、调用、配置和 skills，保留项目私有规则并完成验证。不发布或部署应用。

也可以指定精确目标版本，或只要求比较、不修改。它会查询实际 registry/dist-tag，核对所有已用包的目标版本与引擎要求，比较累计差异，更新精确版本和 lockfile，并迁移公开 API、配置、scripts 及完整 skill 资源。升级有网络或版本发布不齐等阻塞时会说明处理办法，不能把本地缓存称为“最新”。

`hai init` 可为旧项目补齐缺失的 AI 入口和 skills，但会保留已有文件；它不是框架升级命令，也不会覆盖旧规则。更新已有 skills 时按旧模板、应用自定义、新模板合并。框架源码的 `main` 也不等于 npm 已发布版本。

升级后按项目 scripts 执行 typecheck、lint、build、test 和受影响 E2E，实际验证认证、数据与关键流程。重新生成需要交付的镜像或安装包，随后按第 5 节部署。只改版本号或只通过构建，还不能代表升级完成。
