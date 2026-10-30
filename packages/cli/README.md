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

以下使用目标 Beta 版；先核对实际发布渠道与 `1.0.0-beta.1` 是否可用，再安装。当前验收目标不代表已经发布；不带版本会选择 latest，不会自动选择 Beta。

```sh
pnpm view @h-ai/cli dist-tags
pnpm view @h-ai/cli@1.0.0-beta.1 version
pnpm add -g @h-ai/cli@1.0.0-beta.1
hai --version
hai --help
```

生成的框架依赖固定到 CLI 对应版本；安装失败会显示命令、退出码与输出，保留已生成文件供重试。未发布的源码功能请按下方本地开发方式验证。

### 创建项目

```sh
hai create my-app --type fullstack --frontends web --defaults
cd my-app
pnpm dev
```

省略选项时按向导选择，`--defaults` 使用默认值。默认安装依赖并初始化 Git，`--no-install` / `--no-git` 可关闭。部署工具默认作为开发依赖安装，不需要时加 `--no-deploy`。

### 项目模板

| 类型                       | 生成内容                                                          |
| -------------------------- | ----------------------------------------------------------------- |
| `admin` / `website` / `h5` | SvelteKit 管理后台、官网、移动网页                                |
| `api`                      | 共享 contract + API service 的 pnpm workspace                     |
| `mobile-app`               | Svelte + Vite + Capacitor                                         |
| `fullstack`                | contract、API、共享界面与所选 Web/App/Desktop；miniapp 仅预留说明 |

新建工程统一采用适用的完整模块和示例，服务端包含 AI、向量库、反馈等依赖；客户端仍按类型隔离服务端模块。安装体积相应增加，示例需按实际业务替换。`--template`、`--features`、`--examples/--no-examples` 已删除，`create --yes/-y` 改为 `--defaults`，旧参数明确报错；`deploy --yes` 保持原义。已有工程的模块选择不受影响。

独立 `mobile-app` 默认包含前端 crypto，并启用 typed client 加密传输。已有明文 API 可显式使用 `PUBLIC_API_TRANSPORT=off`；`PUBLIC_API_KEY_EXCHANGE_PATH` 只覆盖公开协商子路径。握手失败不会降级，服务端私钥不进入客户端。客户端先关闭 transport，再释放自身初始化的 crypto。

### 纯静态 website 与 GitHub Pages

新建 website 同样包含完整模块和示例，默认 Node SSR。静态发布前须在工程中移除服务端业务依赖及其初始化、API/actions，保留 Core/Kit/UI；没有轻量创建参数。已有不含这些动态能力的 website 仍可使用下述静态构建。

website默认Node SSR。仅构建时设置`HAI_BUILD_STATIC=1`与`PUBLIC_BASE_PATH=/docs-site`（docs-site替换为实际仓库名；各目录段仅ASCII字母、数字、_、.、-，无末尾/，根站留空）后执行`pnpm build`，输出build静态目录。静态标志只接受0/1，且仅用于compile；PUBLIC_BASE_PATH也可用于Docker网站构建，原生app/desktop目标不接受网站目录。静态拒绝服务端业务模块、自定义API/actions和未预渲染页面，不放宽生产守卫，不生成SPA回退；默认健康API不进入静态产物。

根.env不参与构建，Kit也不读取根私有文件。static是公开资产目录，图片、字体等正常资源会原样发布，不能放入任何私密内容；检测到.env/.env.*或符号链接时会停止构建。发布只上传build，显式include-hidden-files:true保留.nojekyll；实际验证子路径首页、每个深链刷新、资产和无敏感哨兵。详细命令见[静态网站配置](../../docs/usage/configuration/delivery.md#静态website与github-pages)。

website联系表单是界面示例，尚未接入留言服务。提交后通过Toast说明尚未开通并保留输入；投入使用前应连接实际服务并验证加载、成功和失败状态。

### 网站部署到子目录

SvelteKit的admin/h5/website通过构建进程`PUBLIC_BASE_PATH=/yyy`设置`kit.paths.base`，默认空字符串；改变目录需要重新构建，网关保留前缀。Vite Web默认`base: './'`，入口和runtime-config.js使用相对地址，hash路由可经剥离目录的网关挂载到`/yyy/`；显式设置PUBLIC_BASE_PATH时固定Vite基址。API地址独立配置，不能从网页目录推断。

Docker构建时同样显式设置PUBLIC_BASE_PATH；非根目录生成格式5制品，记录webBasePath，由部署SDK生成匹配代理、健康检查和访问URL，额外网关保留前缀。根目录继续使用格式4。全量和部分构建须保持相同目录，即使只构建serv；改变目录使用全量部署。格式5需匹配的CLI/Deploy，旧工具明确拒绝。操作、默认值、反代差异与实际截图见[网站子目录配置](../../docs/usage/configuration/delivery.md#网站部署在子目录)。

### Fullstack mini 管理后台

提供用户管理、角色、审计日志、头像和个人设置，以及主题、语言、引导和帮助中心。首次登录使用 `admin`，随机密码在当前环境 `.env.dev/.env.test/.env.prod` 的 `HAI_ADMIN_DEFAULT_PASSWORD`；已有用户时不会重设密码。模板业务可按需求修改，权限检查始终在服务端执行。

生成时为 `.env.dev/.env.test/.env.prod` 分别生成独立的初始管理员密码和传输密钥环；环境文件随项目提交，克隆后可共享，并可通过本机私有文件或进程环境覆盖。启用 transport 的应用缺少/错误配置 `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` 时，部署在上传前指出配置来源；同一环境的所有节点复用同一有效密钥环，可直接加载环境文件，也可通过 Secret Manager 覆盖；不为每个节点临时生成。CLI 完成部署后提示 `HAI_ADMIN_DEFAULT_PASSWORD` 的实际来源，不打印密码，不依赖日志级别；该密码仅在首次创建管理员时生效。 离线入口也会提示服务器私有 `.env.runtime` 中的密码变量位置。

### 应用配置与显示

模板默认使用 `pretty` 日志并安装运行依赖 `pino-pretty`；`HAI_CORE_LOGGING_FORMAT=json` 可切换为结构化输出。启动失败保留模块、错误码与缺失配置字段；端口冲突显示 `EADDRINUSE`、地址和端口。

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

### SvelteKit 接口安全配置

创建 admin、website 或 h5 时选择 crypto，可在 `_kit.yml` 中开启 transport；默认仍为 false。服务端从各环境独立生成的密钥环装配加密，根布局只向浏览器提供公开 transport 配置，私有 IP/时段规则不下发。选择 db 后使用数据库 registry；无 db 的内存 registry 仅限开发/测试。静态网站没有这些动态接口。

路径规则 `encryption: required / disabled` 可以让内部接口保持加密、外部接口接收普通 HTTPS 请求；模式冲突或缺少必需加密装配会拒绝创建宿主。Fullstack 管理模板固定要求 transport，使用路径规则设置明文例外。完整配置与验证见[接口访问和加密](../../docs/usage/configuration/request-access.md)。

### 可选 HTTPS 证书

`pnpm run deploy` 为所有容器模板统一提供“不启用 / 已有 PEM 证书和私钥路径 / Let’s Encrypt”。相对路径以工程根为基准，已有证书校验域名、有效期和密钥匹配后复制到私有发布包。Let’s Encrypt 使用固定版本官方 Certbot 镜像申请，每 12 小时检查续期，Nginx 自动重载。需要确认服务条款、真实邮箱、公网 DNS、80 端口和 CA 网络；隔离环境使用已有证书。证书状态保留在服务器，私钥不进入应用镜像。`--yes` 复用保存配置。

配置为 `hai.json.deploy.provider.expose.https`，也可用环境私有文件覆盖。默认 HTTPS 443、HTTP 跳转开启，未配置保持 HTTP；启停或更改模式、域名、端口、本地证书需全量部署。配置和续期边界见[HTTPS 手册](../../docs/usage/configuration/delivery.md#可选https证书)。`--plan` 的 `root` 表示工程根，`serviceDir` 表示部署服务源码与配置目录，仅显示公开证书元数据。

### 构建与部署

部署向导的默认/自定义模式保留同后端完整配置，包括未出现在表单中的 `publicEndpoint`、连接池及操作日志；自建或云开通只重新定稿连接与认证。旧版已保存的缺字段父 JSON 需先补回再打包，见[中间件配置说明](../deploy/README.md#按应用真正需要的中间件处理)。

Node 后端（Serv / SvelteKit SSR）默认在每次启动时重读发布目录的 `.env.runtime`，修改后 `docker restart <容器名>` 或 `podman restart <容器名>` 即可，无需重建镜像或额外 override。旧部署先用新版 CLI 发布一次。删除的字段不会从旧 Compose 注入中复活；服务器托管连接的 `middleware.env` 保持原有更高优先级，私有代理标记和 Node 启动参数仍由部署装配管理。静态 Web、中间件、端口/挂载、Nginx 路由与限额不在该重载范围；改变网关路径、端口或挂载时使用全量部署。手工修改需备份；下一次后端发布会从工程环境重新生成，需要长期保留的配置同步回源环境。

镜像默认最多并行两项，`--concurrency 1` 可降低资源占用。Dockerfile 在复制源码前安装依赖；前后端仅复制各自必要源码，复用安装层和驱动缓存。运行镜像移除应用自身的声明文件、源码映射和说明文件。打包按镜像内容 ID 复用并校验中间件归档，复制应用镜像时同时计算摘要。默认交付压缩为 `.tar.gz`，显式 `--output release.tar` 可保留未压缩格式；README 仅保留外层一份。成功部署后清理本次 incoming 上传和解包目录，release 保留恢复配置和状态，镜像由容器引擎保存。

数据库连接保存前使用所选后端的真实公开 Schema 校验：MySQL `ssl` 仅 `false` 或严格 TLS 对象，`{}` 默认校验证书链和 DNS 身份；PostgreSQL 保留其模式。CLI 已内联纯 Schema 和 Zod，配置校验不要求目标应用安装数据库包/驱动；实际运行应用仍需相应依赖。部署功能仍须能解析已安装的 `@h-ai/deploy`（生成工程将其作为开发依赖）。

`pnpm build` 只编译源码。镜像使用 `images/` 中独立 Dockerfile，由项目根 `hai.json` 的 `build.images` 指定文件，部署参数放在同文件的 `deploy`；`--images` 决定构建哪些镜像，`--services` 决定更新哪些服务。容器引擎 auto 优先 Podman，再尝试 Docker。下载、安装和整理生产依赖共用包缓存与 SQLite 驱动缓存，避免重复下载。

默认容器用于 CPU 运行或连接远程 AI 服务，不额外下载 GPU 运行库。需要使用部署机器上的 GPU 时，自行定制镜像和容器运行参数。

CLI 在过滤调用者的 `HAI_/PUBLIC_/VITE_` 后，只注入内部生成的 `HAI_BUILD_ID/HAI_BUILD_COMMIT`，Docker 将同一镜像批次标识传入实际编译。生成应用的反馈分别读取前后端自己的 `appVersion/buildId/commit`，版本来自各自 manifest，同次 SSR 共用构建 ID；无所属 Git 提交时明确 `unknown`。三字段 `build-metadata.json` 与代码内联值一致，用于与 API/ZIP 实际证据核对。

交付角色统一为 `serv`（独立 API 后端）、`web`（静态或 SSR 浏览器站点）、`app`（Android/iOS 手机安装包）、`desktop`（桌面安装包）。Fullstack 容器为 serv + 可选 web，API 为 serv，admin/website/h5/mobile-app 的浏览器镜像为 web；原生 app/desktop 不作为服务器 Compose 服务。`--images` 与 `--services` 使用 serv/web，`--target app` 与 `--target desktop` 生成原生包。API workspace 的服务目录为 `apps/<项目>-serv`。镜像与容器共用工程根 `package.json.name` 的归一化身份（去 scope、转小写、非法字符合并为连字符）；名称缺失或无效时报错，不回退目录名。镜像为 `localhost/hai-<项目>-<角色>:<buildId>`，容器为 `hai-<项目>-<环境>-<角色>`，镜像可跨环境复用。

```sh
pnpm build --target image
pnpm run deploy --env prod
pnpm run deploy --env prod --build --services web
# 多个服务共用一个 --services，用英文逗号分隔；加引号兼容 PowerShell
pnpm run deploy --env prod --build --services "serv,web"
pnpm run deploy --env prod --build --bundle-only
```

默认部署名取工程根（最近的 `hai.json` 或锁文件所在目录）的 `package.json.name`，缺失时报错，再附加显式环境后缀。例如 fullstack 工程 `hai-delivery` 扫描 `packages/hai-delivery-serv`，`--env test` 生成 `/opt/hai/apps/hai-delivery-test` 和 `bundle-hai-delivery-test-<部署ID>-<版本>.tar.gz`。远端目录、交付包、Compose 项目、API/Web/中间件容器、数据卷、服务器凭据状态及增量基线统一使用该名称；不会按字符串删除真实项目名中的 `-serv`。

制品格式4和5都记录 primaryService（serv/web），hasWeb 表示完整工程是否包含浏览器端；格式5另记录非根目录webBasePath。只有 serv + web 才生成同源 API 代理。格式1至3制品须重新构建。旧部署先备份并核对项目名、数据卷和受管凭据，再切换到新的完整部署基线；工具不自动跨项目迁移数据。完整部署仍会按 Compose 规则清理同项目的旧服务容器，不能仅修改 deploy-target.json.directory 完成迁移。

迁移已有工程时，先同步 hai.json 的 build.images 名称、Dockerfile 文件名与引用；API workspace 的服务目录、包名和依赖引用统一为 -serv，并重新安装依赖。随后重新构建完整制品；不要仅改归档文件名或手工修改 manifest 冒充新构建。

CLI 的 --project-name 与 SDK 的 DeployAppOptions.projectName 覆盖入口已移除；旧参数会明确报错，请在工程根 package.json.name 维护资源身份。

自建中间件的密码由服务器 `<remoteDir>/managed-secrets.env` 持久保存（权限 0600），应与数据卷一起备份。每次打包只生成首次初始化的随机候选，不依赖打包机缓存；在线 SDK、deploy.sh、deploy.ps1 和 deploy-local.sh 都在部署锁内复用服务器值，同时更新应用连接配置及中间件原生变量。交付 tar 保持不可变，只有服务器私有运行文件使用定稿值。若状态缺失而对应数据卷已存在，部署在变更服务前明确停止，须恢复服务器凭据备份；不会自动换密或删除数据。旧版本可通过下述显式预检和凭据导入流程迁移。

完整包包含应用和自建中间件镜像。部署缓存、tar 与操作目录默认放在工程根 `.hai/deploy/<环境>/`；`--output` 可显式指定相对命令执行目录的 tar 路径。交互式仅打包在构建和中间件配置后、打包前最后询问是否添加或修改 SSH 信息，保存到 `.env.<环境>.local` 并用于本次和后续 target；`--yes` 或跳过时复用已有连接。交付目录仅含 tar、deploy-local.sh、read-target.awk、README.txt、带逐项说明的 `deploy-target.json` 与 Windows PowerShell 5+ `deploy.ps1`、Linux/macOS `deploy.sh`。上传前核对 target 并补齐缺项，两个脚本均读取此文件，支持 key/agent 和 password，均无需 Node/pnpm。target 只引用 `passwordEnv`（默认 `HAI_DEPLOY_PROVIDER_SSH_PASSWORD`）；密码取自操作机环境，仅进入本次 SSH/SCP 子进程，不进入应用环境或包内。修改 target 仅影响本包，不回写工程。完全隔离的 Linux 服务器复制整个目录后运行 `sh deploy-local.sh`，自动解包部署。首次部署必须完整；部分更新保留未选服务和数据卷。每步报告结果，失败返回非零并尝试恢复。前置工具、缓存、版本和恢复流程见[部署说明](../deploy/README.md)。

直接部署首次补齐缺失的 SSH 连接和认证信息，完整有效配置（包括 `--yes`）直接复用；密码隐藏输入，保留前后空格和前导零。新连接和中间件秘密值写 `.env.<环境>.local`，旧 `.env.local` 保留为兼容回退。部署 SDK 的 `HAI_DEPLOY_*` 优先级为进程 > 环境私有 > 环境公共 > 旧全局私有 > 基础；其他模块为进程 > 环境私有 > 旧全局私有 > 环境公共 > 基础。此私有层仅用于部署 SDK，不改变 Core 的普通应用加载。目标环境完整中间件配置在 `--yes` 下保持，不重复询问或云开通；交互模式仍可选择本次范围。

部署失败时分别显示本地受管理进程终止确认、远端未知/脚本已完成状态和结果文件路径；本地 SSH 结束不证明远端停止。未知状态先核对服务器，CLI 不自动重跑发布或回滚。Windows 命令使用内嵌的系统 PowerShell/.NET Job，需允许 Add-Type，失败不会裸启动。

正常前台部署及同步失败恢复收尾、发布终态后显式释放 `.deploy.lock`，后台服务继续运行不阻塞后续发布。HUP/INT/TERM 中断或父 shell 被强杀时，继承描述符的活跃子命令仍持锁，全部 holder 退出或服务器重启后才释放；锁文件永久保留，不删除或替换。

桌面安装包用 `pnpm build --target desktop --platform windows|linux|macos --arch x64|arm64`，在对应系统准备工具链并验证。容器里的 Web 页面不代替原生安装包。

### 使用 AI 辅助开发

生成工程根的 `AGENTS.md` 导航到 `.agents/skills/`；Claude、Copilot、OpenCode 的入口引用同一套规则。普通功能用 [应用开发](templates/skills/hai-app-create/SKILL.md)，较大文档先[审查](templates/skills/hai-spec-review/SKILL.md)再[逐项实施](templates/skills/hai-spec-implement/SKILL.md)，框架升级用[升级与同步](templates/skills/hai-framework-sync/SKILL.md)。

Skill 入口保存任务边界，相邻参考按需读取。`hai init` / `hai add` 只补齐缺失内容，已有技能与自定义规则需合并；同步时复制完整目录。

## 技能工作流与前端指引

工作流统一使用 hai-spec-review、hai-spec-implement、hai-app-create、hai-app-tests、hai-app-review、hai-pr-review。需求、验收、发现与证据通过 [交接契约](templates/skills/hai-spec-implement/handoff.md) 连接，文档差异仍沿已有 Git 基线推进。

UI 模块成套交付 [hai-ui-design](templates/skills/hai-ui-design/SKILL.md)、hai-ui 与 [hai-ui-review](templates/skills/hai-ui-review/SKILL.md)；纯 API 模板排除这些前端技能。init/add 保留已有私有入口并补齐缺失参考资源。仓库同职责技能采用同名入口。

fullstack 示例按应用配置分离 `admin`、`audit_admin`、`config_admin`、`business_operator` 与基础 `user`，系统管理员不能接管其他职责账号。CLI 沿用 `.env.dev/.env.test/.env.prod` 的环境配置方式，为每个环境的四类账号分别生成独立随机初始密码；配置随项目共享，本机私有文件或进程变量可覆盖；已有账号不改密、不重新分配职责。`_iam.yml` 和 `_audit.yml` 按业务启用安全增强，详见生成项目 README。

fullstack 的逐项开关、默认值、启用前提与使用影响见[配置化安全使用指南模板](templates/apps/fullstack/docs/security-configuration.md.hbs)；新项目会生成 `docs/security-configuration.md`，工程 README 提供入口。

### 问题反馈与离线分析

使用 `hai create my-app --type fullstack --frontends web --defaults` 默认启用反馈；API 工程也默认包含反馈，无需额外参数。普通成员及业务操作员可提交反馈，`business_operator` 才显示管理菜单并能查看、处理、撤销和导出；自动补齐数据库、存储、触达与认证依赖。Fullstack 生成收集入口、分页管理页和服务端接口；API 工程生成服务端接口。生产使用共享 DB 和私有 S3；通知独立选择 `disabled`、`console` 或 `reach`，默认 `console` 只输出 `metadata`。需要摘要时显式设 `consoleContent: summary`，需要实际发送时再配置 Reach 通道与收件人。

业务扩展在 feedback.init(config, { collectEvidence }) 中 await 文本/ZIP 等材料；_feedback.yml 提供 businessCollectionTimeoutMs、webhookUrl/webhookSecret/webhookTimeoutMs。Webhook 独立持久重试，详情可查看状态并重试；密钥仅放服务端私有环境。见 [feedback 配置与示例](../feedback/README.md)。

离线工具：`hai feedback summary <包.zip>`、`inspect`、`evidence --request-id <ID> --page 1 --page-size 20`、`view`。查看器仅本机监听，Ctrl+C 关闭，无需生产连接。

## 发布预检与原生打包

upgrade 按消费者路径读取 ESM-only 包及 pnpm 链接的清单，不执行包入口；递归扫描 workspace 并尊重排除规则。实际消费的 Audit 发布制品公开导出迁移函数时，报告包含 `migrateAudit({ dryRun: true })`；报告不执行迁移。部署计划的 target.runtime 来自远端配置，和本地打包引擎独立。

旧目标在 Linux 服务器运行 `hai deploy-secrets <目录> --import <私有JSON> --runtime docker` 做只读认证，显式加 `--apply` 才导入。此工具要求服务器 Node，与普通离线部署的要求不同；凭据不放命令参数。输入格式、安全限制及恢复步骤见[凭据导入指南](../deploy/docs/credential-import.md)。

`hai upgrade 0.1.0-alpha.71` 只读检查全部消费框架包及 CLI/deploy 的精确版本、发布 tar 完整性、CLI/skills 文件、catalog/lock/安装漂移和业务 skill 定制；不安装、不覆盖本地修改，缺包退出非零。JSON 包含模块迁移预检入口、备份与旧会话边界。`hai deploy --env prod --plan` 校验本地制品并显示项目/环境身份、配置来源键名、选中/保留范围、基线要求与恢复目录，不构建、不生成凭据或连接目标；未读取的远端基线明确 not-inspected。

`hai build --target app --platform android|ios` 才生成并校验新 APK/IPA。先添加平台工程并安装 Android SDK/JDK 或 macOS/Xcode，配置原生签名。cap:sync 只是同步；没有工程、工具链或新产物均失败。发布过滤 CAPACITOR_SERVER_URL，并在同步后核验原生配置，拒绝开发热更新地址。build.app 指定 App 工程目录。

需要目标基线事实时使用 `--plan --inspect-remote`（SDK inspectRemote:true），仅通过 SSH 读取 current 及成功发布目录，报告 verified/missing/unavailable 和实际恢复发布 ID，不写目标。

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

## 许可证

Apache-2.0
