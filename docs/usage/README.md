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
| 创建、开发、编译、运行 CLI | Node.js `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`，pnpm 12.11.2；以项目 `engines`、`packageManager` 为准 |
| 管理版本、AI 按文档实施 | Git；能读取项目文件并执行命令的 AI 编程助手 |
| 构建容器镜像 | 已安装且运行中的 Podman 或 Docker；Windows 上使用 Linux 容器环境 |
| 生成桌面安装包 | 对应系统上的 Rust、目标架构工具链、Tauri 所需系统 SDK 和打包工具 |
| 自动部署到 Linux | 本机 `tar`、`ssh`、`scp`；服务器容器引擎、Compose、`sh`、`tar`、`sha256sum`、`awk`、`curl` 和目录权限 |
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

fullstack 中，`packages/my-app-contract` 定义接口，`packages/my-app-serv` 实现 API，`packages/my-app-shared` 放共享内容，`apps/my-app-web` 提供 Web。环境文件在工程根；API 模板的环境文件在 `apps/my-app-service`。生成后先读项目自己的 README 和 AGENTS.md。

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

同名变量优先级为：**已有进程变量 > `.env.local` > `.env.<环境>` > `.env`**。因此切换环境前也要检查本机覆盖，避免 `.env.local` 中的连接仍指向另一环境。复杂对象可用 JSON 整体覆盖，整体节点优先于子字段；变量含义和可用值以生成工程的 `.env.example` 为准，框架完整目录见[根 `.env.example`](../../.env.example)。提交的环境文件只放公共配置，真实凭据留在本机文件或部署进程中。

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

上面四个 `hai-app-create`、`hai-app-review`、`hai-app-tests`、`hai-pr-review` 均为实际分发的应用 skills。框架源码仓库中的 `hai-create-app` / `hai-review-app` 面向仓库维护，名称和使用场景不同。

### 4. 编译源码与打包产物

创建项目默认安装部署工具，可用 `hai create my-app --no-deploy` 关闭。部署 SDK 属于开发依赖，不进入应用运行镜像。

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
| `--images` | app、web 或 app,web；只构建导出所选镜像 |
| `--runtime` | auto（优先 Podman）、podman、docker |
| `--network` | 容器构建网络，默认引擎设置 |
| `--no-http-proxy` | Podman 构建不继承本机代理 |
| `--sqlite-prebuild-mirror` | SQLite 预编译包的可信 HTTP(S) 根地址 |
| `--platform` / `--arch` | 原生安装包的系统与架构 |

#### 用 hai.build.json 描述要打什么包

```json
{
  "images": [
    { "name": "app", "context": ".", "dockerfile": "images/app.Dockerfile", "containerPort": 3000 },
    { "name": "web", "context": ".", "dockerfile": "images/web.Dockerfile", "containerPort": 8080 }
  ],
  "desktop": ["apps/demo-desktop"]
}
```

每个镜像独立 Dockerfile；web 的 Nginx 配置与启动资源放 `images/web/`。Dockerfile 内保留编译/运行阶段，配置不再选择阶段。没有 Web 或 desktop 时删除相应项。

构建器将锁文件、包配置、本地归档和补丁准备为 `images/dependencies/` 输入，结合 pnpm store、SQLite 驱动缓存与 Docker 分层复用下载；下载、安装和整理生产依赖共用这些缓存。源码修改不应重新下载全部依赖；缓存为空仍能联网构建。Windows node_modules 不用于 Linux 镜像。完全离线构建还需预先准备基础镜像、工具链和匹配 ABI/架构/libc 的原生预编译包。

默认容器用于 CPU 运行或连接远程 AI 服务，不额外下载 GPU 运行库。需要使用部署机器上的 GPU 时，自行定制镜像和容器运行参数。

版本来自应用根 package.json.version。制品位于 `.hai/build/docker/<buildId>/`，包括格式版本 3 的 manifest.json、所选镜像 tar 和 SHA-256；partial 标识部分构建，hasWeb 保留工程拓扑。相同应用版本允许重建，构建编号和镜像引用区分实际内容；全部导出成功才更新本机构建入口。基础镜像、中间件及工具使用明确版本，不使用 latest。

### 5. 把构建产物部署到环境

#### 先准备环境与部署目标

准备 `.env.<环境>`，例如 `.env.prod`，以及服务目录的 `config/_deploy.yml`。fullstack 的根 deploy 脚本指向 `packages/<项目>-serv`，API workspace 指向 `apps/<项目>-service`；这是配置扫描入口，镜像清单仍在工程根。

```yaml
provider:
  type: docker-ssh
  expose:
    hostPort: 18080
container:
  s3Engine: rustfs
```

向导按“服务器地址、SSH 登录用户、私钥文件、访问端口”等说明提问，复用有效配置。SSH 参数仅写本机 `.env.local`；私钥只保存路径。仅打包不要求 SSH。

#### 按应用真正需要的中间件处理

根据锁文件运行依赖和模块配置识别数据库、缓存、文件存储、向量库、LDAP、邮件等。逐项选择默认、自定义或保持。配置完备可用 `--skip-middleware` 跳过向导和开通。SQLite、Memory cache、本地存储不产生外部镜像；Compose 自建服务的镜像自动加入完整交付包。外部服务仍需目标网络可达，云开通不属于完全离线部署。

#### deploy 的可选参数

| 参数 | 用途 |
| --- | --- |
| `--env` / `--env-dir` | 环境和环境文件目录 |
| `--build` | 先构建选中应用镜像，再打包部署；可结合 bundle-only |
| `--services` | 只更新指定 Compose 服务，例如 web、app、app,web、storage |
| `--artifact-dir` | 精确选择已构建制品 |
| `--bundle-only` | 只生成 tar 和跨平台脚本，不连接服务器 |
| `--runtime` | 本地构建及中间件镜像导出引擎 |
| `--output` | 部署 tar 路径，自动补应用版本后缀 |
| `--skip-middleware` | 跳过中间件配置与开通 |
| `--yes` | 无交互使用有效配置；缺必要值明确报错 |

#### 两机连通：直接部署

```sh
pnpm run deploy --env prod --build
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<buildId>
pnpm run deploy --env prod --build --services web
```

部分更新需要服务器已有成功的完整安装，并且端口、应用布局相同。以服务器成功状态为基线，只替换选中的镜像和配置，保留其他服务、连接与卷。部署脚本先按项目和服务名移除选中的旧容器（保留数据卷），再执行 `compose up -d --no-deps --no-build --pull never --no-recreate web` 创建新容器；其他容器保持运行，不执行整个项目 down。首次安装使用完整包。storage-init 是创建 S3 桶的一次性任务，只在涉及存储初始化时执行，成功后再启动应用。

命令中的 `-d` 表示后台启动，`--no-deps` 不连带启动或重启依赖，`--no-build` 不在服务器编译，`--pull never` 禁止拉取镜像，`--no-recreate` 保留仍存在的容器；选中的旧容器已由脚本移除，因此会创建新容器，末尾 `web` 是 Compose 服务名（不是镜像标签）。多个服务用空格分隔。

`storage-init` 复用应用镜像内的 S3 SDK，等待存储服务就绪并检查桶；桶存在就跳过，不删除数据。脚本先启动 storage，再执行 `compose up --no-deps --no-build --pull never --force-recreate --exit-code-from storage-init storage-init`；初始化退出码为 0 后才启动选中应用。 部分更新时，脚本先移除旧的 storage-init 容器，并将该命令的 `--force-recreate` 改为 `--no-recreate`，避免连带重建应用。只更新 `storage` 时，初始化仍需包含 `app` 镜像的制品；若最近只构建了 Web，用 `--artifact-dir` 选择原完整制品，或先执行 `pnpm build --target docker --images app`。该镜像用于初始化，不会更新正在运行的 `app` 服务。


#### 两机不通：生成包，手工复制

```sh
pnpm run deploy --env prod --build --bundle-only --output release-prod.tar
```

以应用版本 1.2.3 为例，得到 `release-prod-1.2.3.tar` 和同名 `-deploy/` 操作目录。包包含所选应用/中间件镜像、服务配置、私有环境、校验和、README 和 apply.sh。Windows 运行操作目录的 deploy.ps1，Linux/macOS 运行 deploy.sh；脚本复用目标配置，通过 SSH 上传后执行同一服务器流程。Windows 可在 deploy-target.json 修改目标信息，或给 deploy.ps1 传入 -IdentityFile；Linux/macOS 可用 sh deploy.sh 主机 [端口] [用户] 覆盖连接地址，用 HAI_DEPLOY_IDENTITY_FILE 指定私钥、HAI_DEPLOY_KNOWN_HOSTS_FILE 指定服务器指纹文件。换电脑或操作系统后，这两个文件路径都要指向当前电脑上的实际文件；Windows 在 deploy-target.json 中修改。

完全隔离的 Linux 服务器上，将 tar 解到独立目录，运行 `sh apply.sh`，也可传入部署根目录覆盖默认值。每步检查结果，任何失败返回非零退出码；镜像导入、服务启动和 HTTP 检查分别报告。结果写到服务器部署目录 `result-<部署ID>.json`，只有检查通过才更新 current 成功状态。重复应用同一部署包会明确停止；相同版本重新生成的新包允许发布。已有版本失败时尝试恢复选中的旧容器和配置，保留数据卷及诊断材料；不会回退已写入的业务数据。

#### 完全离线前再核对一次

- 完整 tar 已含自建中间件归档，镜像架构与服务器一致；服务器启动不访问 registry。
- Linux 已安装 Docker/Podman、可执行的 Compose、sh、tar、sha256sum、awk、curl；用户有目录与容器权限。
- 包含私有配置，安全搬运，不提交 Git；持久化卷身份跨版本稳定。
- 实际断外网验证启动、登录、页面刷新、重启与数据持久化。生产 HTTPS、证书、DNS 和外部服务需另行准备。

### 6. 更新框架，保留自己的应用

在应用目录让 AI 使用 [hai-framework-sync](../../packages/cli/templates/skills/hai-framework-sync/SKILL.md)：

> 升级 hai-framework 到最新已发布版本。先核对当前依赖和目标发布版本，说明差异及需要我选择的事项，然后迁移依赖、调用、配置和 skills，保留项目私有规则并完成验证。不发布或部署应用。

也可以指定精确目标版本，或只要求比较、不修改。它会查询实际 registry/dist-tag，核对所有已用包的目标版本与引擎要求，比较累计差异，更新精确版本和 lockfile，并迁移公开 API、配置、scripts 及完整 skill 资源。升级有网络或版本发布不齐等阻塞时会说明处理办法，不能把本地缓存称为“最新”。

`hai init` 可为旧项目补齐缺失的 AI 入口和 skills，但会保留已有文件；它不是框架升级命令，也不会覆盖旧规则。更新已有 skills 时按旧模板、应用自定义、新模板合并。框架源码的 `main` 也不等于 npm 已发布版本。

升级后按项目 scripts 执行 typecheck、lint、build、test 和受影响 E2E，实际验证认证、数据与关键流程。重新生成需要交付的镜像或安装包，随后按第 5 节部署。只改版本号或只通过构建，还不能代表升级完成。

## 开发测试

在生成工程根按实际 scripts 执行 `pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm test` 和 `pnpm test:e2e`。容器交付还应验证目标平台的镜像、部署脚本、健康检查与失败恢复；浏览器通过不能代替原生验收。

## 许可证

Apache-2.0
