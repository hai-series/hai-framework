# 部署环境与中间件

## 环境先行

`hai deploy` 首先输入部署环境，或用 `hai deploy --env test` 指定。`.env.test` / `.env.prod` 必须由用户先创建；缺失时停止，不代替用户创建一个空文件继续部署。指定要部署的目录，例如 `hai deploy packages/my-app-serv --env test`，该目录必须对应 lockfile 的一个 importer；不遍历 apps/packages 或猜测 fullstack 布局。环境文件默认取当前目录（有 `.env` 时）或 lockfile 根目录，必要时传 `--env-dir`。

环境文件遵循项目的六文件规范：`.env.example` 为带说明/枚举/范围的完整清单，`.env` 为公共基础，`.env.dev/test/prod` 为公共环境覆盖，以上五类提交 Git；`.env.local` 为忽略 Git 的本机私有覆盖。加载顺序为进程 > `.env.local` > 目标环境 > `.env`。真实密码、API Key、含认证信息的连接 URL 写 `.env.local`，公共后端和地址写目标环境文件；日志展示脱敏值。调用 deploy API 时显式传 `{ environment: 'test', envDir: '/workspace/app' }`，不要用调用者的 `NODE_ENV` 猜测部署目标。

## 识别与逐项选择

先用 `deploy.scan(appDir, { environment, envDir })` 核对实际依赖、配置与环境值。扫描从目标 workspace 的 `pnpm-lock.yaml` importer 出发，沿 dependencies/optionalDependencies 遍历，排除 devDependencies、peerDependencies 和其他应用未被引用的依赖；workspace link 只沿运行依赖继续。pnpm 12 的工具链 YAML 文档不能混入应用图。lockfile、目标 importer 或依赖节点缺失时先执行 `pnpm install` 修复；依赖图不读取 package.json、pnpm-workspace.yaml 或项目目录布局。配置文件决定已识别模块的后端，保留的旧配置不能自行启用未依赖的模块。

`ScanResult.haiModules` 列出所有实际运行依赖中的 Hai 模块；`ScanResult.middlewares` 提供服务、后端、来源、配置路径和变量前缀；连接配置可能含凭据，不能整体记入日志。`DEPLOY_MIDDLEWARE` 是后端和连接字段的公共目录，字段名称、类型与约束须与模块 Schema 同步。

| 来源 | 后端选项 | 默认 Compose 行为 | 云自动开通 |
| --- | --- | --- | --- |
| reldb；IAM/audit；启用 DB 日志的 scheduler | SQLite / MySQL / PostgreSQL | SQLite 数据卷；mysql / postgres 服务 | PostgreSQL → Neon |
| cache；IAM；scheduler 可选分布式锁 | memory / Redis | memory 无服务；redis 服务 | Redis → Upstash |
| storage | local / S3 | 本地数据卷；RustFS（默认）/MinIO + bucket 初始化 | S3 → Cloudflare R2 |
| vecdb | LanceDB / pgvector / Qdrant / Chroma | 本地卷或对应容器 | 自定义已有服务 |
| IAM 可选目录认证 | disabled / LDAP | 禁用无服务；OpenLDAP | 自定义已有目录 |
| Reach Provider 数组 | console / SMTP / HTTP API；阿里云 SMS | console 无服务；SMTP 用 Mailpit 捕获测试邮件；HTTP/SMS 自定义 | SMTP → Resend；SMS → 阿里云凭据接入 |

`serv` 声明 AI peer 不代表应用启用了 AI，不应因此安装 AI/ONNX/CUDA 或开通向量服务。LDAP 需要在应用安装 IAM 的可选 peer `ldapts`，并显式设置 `login.ldap=true`；安装 IAM 不代表启用了 LDAP。Reach 保留 Provider 的数组索引及名称，不能把 HTTP 回调当作 SMTP。默认目录没有业务账号；Mailpit 不会对外投递生产邮件。生产应配置企业 LDAP/SMTP，或使用对应云服务。

每项都展示当前生效后端和用途，例如 `HAI_DB_TYPE=postgresql` 显示 PostgreSQL，再选择：

1. **使用默认配置**：选择后端；Compose 生成匹配容器/卷，云平台调用已支持的 Provisioner，并保存实际连接配置。MySQL、LDAP、向量库等没有云自动开通器时，明确提示改用自定义连接；不能声称已经创建云资源。Resend 需要已验证的发件域名，R2 需要已有 S3 访问密钥，阿里云短信需要签名/模板与额度。
2. **使用自定义配置**：逐项输入所选后端的连接字段，展示变量名、字段用途与约束，校验必填项、端口、布尔和 URL；凭据用密码输入。保存配置后跳过该服务的开通与 sidecar。
3. **保持不变**：仅在目标 `.env.<mode>` 显式声明当前后端及完整连接配置时出现；私有凭据可来自 `.env.local`/进程。选择后不修改该项、不认证其 Provisioner、不创建或移除已有中间件容器，继续下一项。只有 `.env` 或其他环境有配置不满足此条件。

逐项配置前提供“环境配置已完备，直接部署”。选择后跳过全部中间件提示、变量改写、云资源与 sidecar 创建，保留已有服务；仍执行应用构建、部署及健康检查。命令行可用 `--skip-middleware`（或 `--skip-provision`）明确选择。不要因为缺少某项中间件的目标文件声明而阻止用户主动跳过。

`--yes` 用于已授权的自动化：目标环境已有完整配置时保持不变，否则使用当前后端默认配置；不支持的云后端或缺少必需凭据直接失败。自动化直接部署用 `hai deploy packages/my-app-serv --env prod --yes --skip-middleware`。跳过不作为配置完整性或连接成功的证明。

部署目标不完整时，先引导选择 SSH/Vercel。SSH 逐项输入主机、端口、用户名、私钥文件路径、known_hosts 路径、远程目录/运行时及容器/主机端口；端口范围 1–65535。密钥路径留空使用 ssh-agent/默认密钥，known_hosts 留空使用 OpenSSH 默认文件。完整目标自动复用；修改 `.env.local` 的 `HAI_DEPLOY_PROVIDER` 可切换连接。首次填写的整个目标对象（包括地址、端口、路径、Token）只保存 `.env.local` 并添加 Git 忽略，不把机器信息写公共环境文件。SDK 使用 `saveDeploymentEnvironment(snapshot, variables, { private: true })` 可显式保存本机参数。禁止读取、复制或打印私钥内容。

### Hai 模块与中间件的关系

识别依据是运行图中的所有节点，不按应用直接依赖硬编码消费者名单。下面按当前公开依赖和功能说明；新增模块/后端时同步此表、连接目录与真实运行测试。

| 模块 | 中间件来源或外部能力 |
| --- | --- |
| reldb / cache / storage / vecdb | 分别拥有关系库、缓存、对象存储、向量库连接契约 |
| iam / kit | IAM 运行依赖 audit/reldb/cache/crypto；kit 经 IAM 继承。LDAP 按 login.ldap 开关启用，Reach peer 只有另行实际依赖时进入运行图 |
| audit / payment | audit 经 reldb 持久化；payment 经 audit 继承数据库。微信、支付宝、Stripe 是已有商户 API，沿 payment 配置接入，不生成假云服务或容器 |
| scheduler / reach | 两者实际依赖 reldb/cache；Reach 另按启用的 SMTP/HTTP/短信渠道配置 |
| ai | 实际依赖 reldb/vecdb/datapipe。LLM、图像、音频端点及模型来自 AI 配置，不能仅凭包名选择模型镜像或 CUDA；不自动创建付费厂商账号 |
| crypto / serv | crypto 的可选运行依赖按 lockfile 解析，serv 经 crypto 继承；serv 的 IAM/storage/AI peer 不作为启用证据 |
| core / datapipe / api-contract / api-client / ui / capacitor / cli / deploy | 本身没有额外专用中间件；仍沿实际运行依赖继续遍历，例如 api-client/capacitor 的 crypto 分支。UI/设备能力、部署目标/Provisioner 凭据按各自配置处理 |

S3 是协议，不是某个容器产品。默认配置时另选 RustFS/MinIO，保存到 HAI_DEPLOY_CONTAINER_S3ENGINE（rustfs | minio，默认 rustfs），应用始终写 HAI_STORAGE_TYPE=s3 或 HAI_STORAGE。自定义 AWS S3、OSS、R2 等端点不生成 sidecar。镜像使用与 storage 集成测试一致的 RustFS 官方版本和 MinIO 社区版本；存储桶初始化复用应用镜像里的 S3 SDK，无需额外 mc 镜像，必须幂等且不能吞掉失败。

## 连接字段

以下是自定义向导的连接字段；完整可用项、枚举与范围仍以项目 `.env.example` 和公开 Schema 为准。变量前缀为 `HAI_DB`、`HAI_CACHE`、`HAI_STORAGE`、`HAI_VECDB`、`HAI_IAM_LDAP`；Reach 使用实际索引 `HAI_REACH_PROVIDERS_<index>`。camelCase 不拆词，例如 `bindPassword` → `BINDPASSWORD`。

| 后端 | 连接字段 |
| --- | --- |
| SQLite | database（文件路径或 `:memory:`） |
| MySQL / PostgreSQL | url（优先）、host、port（1–65535）、database、user、password、ssl |
| Redis | url（优先）、host、port、password、db、tls、keyPrefix、connectTimeout、commandTimeout |
| local / LanceDB | root / path |
| S3 | endpoint、bucket、region、accessKeyId、secretAccessKey、forcePathStyle |
| Qdrant / Chroma | url；Qdrant 可选 apiKey |
| pgvector | url（优先）或 host/port/user/password，以及 database |
| LDAP | url、bindDn、bindPassword、searchBase、searchFilter、usernameAttribute、emailAttribute、displayNameAttribute、useTls、connectTimeout |
| SMTP | host、port、secure、user、pass、from |
| HTTP API | url、method（POST / PUT）、headers（JSON）、timeout |
| 阿里云 SMS | accessKeyId、accessKeySecret、signName、endpoint |

## 离线准备与验收

先核对 Node、pnpm 与目标 Linux 架构。当前要求 Node `^22.22.2 || ^24.15.0 || >=26.0.0`，生成工程固定 pnpm 12.11.2。Windows 本地需已初始化的 Linux 容器引擎、OpenSSH、完整项目及已安装的 CLI/SDK 依赖；Linux 需容器引擎和 Compose、SSH 授权与权限。无互联网仍需 Windows 到 Linux 的 SSH 和应用端口可达。

有 PostgreSQL/Redis/RustFS 镜像不代表有可用服务。默认配置要求 Compose 中镜像名称、tag、架构准确匹配，SDK 不传输中间件镜像；自定义连接要求服务已启动、地址从应用容器可达并提供数据库/账号、密码、S3 密钥/桶。不要用容器内 localhost 指代宿主机服务。

默认 Dockerfile 会下载 Node 基础镜像、pnpm、依赖和 SQLite 预编译包，不能直接称为离线可用。源码离线构建要准备 Linux 构建环境的完整缓存和构建 frontend，调整下载步骤并断开外网演练；Windows node_modules/pnpm store 不代表 Linux 的原生依赖可用。云 Provider/Provisioner 需要外网，不用于完全离线部署。

docker-ssh 始终执行本地镜像构建，`--skip-build` 仅对 Vercel 生效。预构建离线交付可在准备环境导出 API/Web 镜像，在 Windows 引擎加载 API 镜像后，为目标服务包提供仅含 `FROM <已加载的API镜像>` 的 Dockerfile 和内容 `*` 的 `.dockerignore`，让 SDK 复用成品并上传。Web 同样预加载成品，在 context 中提供 `FROM <已加载Web镜像> AS web` 的专用 Dockerfile（伴随忽略文件内容 `*`），通过 HAI_DEPLOY_CONTAINER_WEB_DOCKERFILE 选择，SDK 自动转移两份镜像。业务代码变更后必须重制成品镜像；无匹配本地镜像时不能继续假定构建无网络。

fullstack 的 `container.web` 显式描述相对服务包的构建 context、相对 context 的 Dockerfile、target 和容器端口；选择 Web/deploy 的模板自动生成，旧项目须补齐。SDK 同次构建并上传 API/Web，生成同一 Compose 和同源 web.conf，公开端口映射 Web；自动读取服务 API 前缀、补齐缺省 CORS，保留用户的明确 Origin。API/Web 都健康才报告成功，Web 不接收私有 .env.runtime。生产 refresh Cookie 启用 Secure，须准备 HTTPS 入口、内网证书/信任与 DNS/hosts；SDK 生成内部同源代理，不自动配置 TLS。离线验收须包含断外网构建/上传/启动、API 健康、真实 Web 登录、页面与会话刷新、重启和持久化；分别报告 API/Web 联合发布和断网证据，不能互相替代。

## 启动与验证

fullstack 创建时可通过 `--features deploy` 安装对应版本的本地部署工具。SQLite 在模板及兜底 Dockerfile 中先按驱动版本、Node ABI、架构和 libc 下载官方预编译包，最多尝试三次，加载验证后由生产依赖安装复用缓存；不预装 Python/make/C++，无匹配包或下载失败时停止构建。受限网络可预置 prebuild-install 缓存，或配置 container.sqlitePrebuildMirror（HAI_DEPLOY_CONTAINER_SQLITEPREBUILDMIRROR；自带 Dockerfile 使用 SQLITE_PREBUILD_MIRROR build arg）。镜像根地址后附 /v<驱动版本>/<匹配 ABI 的包名>，不得包含认证信息。不能把更换下载命令当成解决网络不可达，也不能用 CUDA 开关掩盖无关 AI 依赖。

Podman 构建默认继承运行时代理。代理地址在容器内不可达时，在 `_deploy.yml` 配置 `container.httpProxy: false`（已声明该节点时也可使用 `HAI_DEPLOY_CONTAINER_HTTPPROXY=false`），不要修改用户的系统代理。`loadDeploymentEnvironment`、`loadDeploymentConfig`、`saveDeploymentEnvironment` 可用于脚本显式读取、解析和保存同一份部署配置，均返回 HaiResult。

构建上下文必须排除 `.env.local`、`.env.*.local`、`.env.runtime` 和 `.hai/deploy`（含镜像归档与凭据）；公共环境文件仍可进入上下文。兜底 Dockerfile 使用伴随忽略文件，Podman 通过 `--ignorefile` 显式指定，避免使用 workspace 根规则后把上次部署的归档或运行配置重新打进构建层。

容器运行期设置 `NODE_ENV=production`，`HAI_DEPLOY_ENVIRONMENT` 保存文件模式，`HAI_CORE_ENV` 映射为 development/test/production/staging。显式环境部署的资源名追加环境后缀，避免 test/prod 复用同一数据卷。启动脚本位于服务包 `.hai/deploy/<mode>/start-<mode>.sh`，显式导出环境并执行 compose；私有 `.env.runtime` 权限为 600。自带 Dockerfile 可读取同名 build args；不得把私有环境文件或运行凭据复制进镜像。

修改此流程后执行 deploy/CLI 的 typecheck、lint、build、test，以及 `pnpm --filter @h-ai/cli test:deploy-gates`（当前源码 tarball → fullstack → Podman/SSH → 健康检查、环境标识、登录和重复部署）。模板变动另执行受影响的 scaffold gates。日志、截图、验收报告保存在 Git 忽略的临时目录，不提交仓库；付费云资源、原生客户端与远程生产部署须单独验证并说明边界。
