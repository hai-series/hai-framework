# 部署环境与中间件

## 环境先行

默认部署名取工程根（最近的 `hai.json` 或锁文件所在目录）的 `package.json.name`，缺失时取工程根目录名，再附加显式环境后缀。例如 fullstack 工程 `hai-delivery` 扫描 `packages/hai-delivery-serv`，`--env test` 生成 `/opt/hai/apps/hai-delivery-test` 和 `bundle-hai-delivery-test-<部署ID>-<版本>.tar`。远端目录、交付包、Compose 项目、API/Web/中间件容器、数据卷、凭据缓存文件名及增量基线统一使用该名称；不会按字符串删除真实项目名中的 `-serv`。

部署名属于资源身份。旧版已部署项目若需沿用原目录、数据卷、凭据和增量基线，在项目 deploy 脚本保留 `--project-name hai-delivery-serv`，环境仍由 `--env test` 追加，并保留原凭据缓存。只修改 `deploy-target.json.directory` 不能迁移 Compose 资源；更名需另行迁移数据及建立新基线，工具不自动搬移或删除旧资源。已有离线包须重新生成。

`hai deploy` 首先输入部署环境，或用 `hai deploy --env test` 指定。`.env.test` / `.env.prod` 必须由用户先创建；缺失时停止，不代替用户创建一个空文件继续部署。指定要部署的目录，例如 `hai deploy packages/my-app-serv --env test`，该目录必须对应 lockfile 的一个 importer；不遍历 apps/packages 或猜测 fullstack 布局。环境文件默认取当前目录（有 `.env` 时）或 lockfile 根目录，必要时传 `--env-dir`。

构建与部署配置统一在项目根 `hai.json`：`build` 保存 images/desktop，`deploy` 保存 provider/container/services 等项目级配置。服务目录只扫描运行依赖与模块 YAML。`deploy` 支持 `${变量:回退值}` 和 `HAI_DEPLOY_*` 分层覆盖；父对象可用 JSON 整体覆盖，缺省 SSH 节点可由 Schema 已知字段补齐，不接受未知字段。高层来源父对象覆盖低层叶字段，同一来源叶字段优先。凭据不要直接写入 hai.json。构建不读取部署环境或密钥。

公共文件沿用 `.env.example` 清单、`.env` 基础和 `.env.dev/test/prod` 环境覆盖。部署 SDK 新保存的 SSH 连接、密码、API Key 和含认证 URL 写忽略 Git 的 `.env.<mode>.local`；公共后端和地址写目标环境文件。旧 `.env.local` 保留为共享兼容回退，不猜测其环境归属、不强制迁移、不删除旧值。CLI 不打印秘密值。调用 deploy API 时显式传 `{ environment: 'test', envDir: '/workspace/app' }`，不要用调用者的 `NODE_ENV` 猜测部署目标。

部署 SDK 的来源优先级从高到低为：

- `HAI_DEPLOY_*`：进程 > `.env.<mode>.local` > `.env.<mode>` > 旧 `.env.local` > `.env`，所选环境明确目标胜过旧全局目标。
- 普通模块：进程 > `.env.<mode>.local` > 旧 `.env.local` > `.env.<mode>` > `.env`，保留旧私有凭据优先级。

`.env.<mode>.local` 仅属于部署 SDK 的配置读取和记忆；Core 的普通应用加载规则不变，不能据此宣称 dev/start 会读取这个文件。

交付 tar 内的 `.env.runtime` 是按上述配置生成的 Compose 运行文件，不是下次部署的配置源。`NODE_ENV` 默认按目标模式选择：test 为 test，dev/development 为 development，其余为 production；显式应用配置仍可覆盖。构建保持正式优化模式，旧包需重新生成。完整配置使用 `--env test --yes` 复用；需要保持中间件时追加 `--skip-middleware`。自建随机凭据缓存位于扫描服务目录的 `.hai/deploy/runtime/<项目>-<环境>.secrets.json`，复用已有卷时应保留。

自建或云开通的整体 `HAI_*` 配置会清除被替换的旧叶字段，例如 Redis 覆盖后不再留下 `HAI_CACHE_TYPE=memory`。全局 `~/.hai/credentials.yml` 只补缺项，不能覆盖当前环境/进程的同名键或父配置。部署先启动选中中间件，等待 PostgreSQL/MySQL/Redis/S3 健康，再启动 app/Web；增量和失败恢复沿用此顺序，未选容器保持不变。

Podman 部署会主动执行容器已有的 healthcheck 并重新核对状态，不依赖 systemd 自动调度；当前探测失败时，即使旧状态为 `healthy` 也不能放行 app 启动。

分批启动仅在首批清理孤立容器，后续 app/Web 启动必须保留已经就绪的中间件。

生成的 fullstack 项目将初始管理员密码和开发传输密钥环保存在被忽略的 `.env.local`；部署环境可在 `.env.<mode>.local` 覆盖。启用 transport 的应用缺少/错误配置 `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` 时，部署在上传前指出配置来源；应从 Secret Manager 分发同一有效密钥环，不能为每个节点临时生成。CLI 完成部署后提示 `HAI_ADMIN_DEFAULT_PASSWORD` 的实际来源，不打印密码，不依赖日志级别；该密码仅在首次创建管理员时生效。 离线入口也会提示服务器私有 `.env.runtime` 中的密码变量位置。

## 识别与逐项选择

框架 `HAI_*` 连接配置与镜像原生变量分开：PostgreSQL/MySQL/RustFS/MinIO/LDAP 的原生键必须按镜像契约命名，只写私有 `middleware-runtime.env`、只让中间件加载。不得改成镜像不识别的 HAI 前缀，也不得写回工程 `.env.<mode>` / 私有覆盖或注入应用 `.env.runtime`。应用的增量覆盖文件 `middleware.env` 只含 `HAI_*`。旧工程原生字段不自动删除，新应用环境忽略框架曾生成的已知原生键；不要批量过滤其他业务变量。

数据库连接保存前复用所选后端的公开配置 Schema；MySQL `ssl` 仅 `false` 或严格对象，`{}` 默认验证证书链和 DNS 身份，`ca/cert/key` 为 PEM 内容且 `cert/key` 必须成对；私钥仅进入私有环境。PostgreSQL 保留其布尔值/字符串模式/对象契约。CLI 内联 `@h-ai/reldb/schemas` 与 Zod，无需为配置校验给目标应用额外安装数据库包或驱动；部署本身仍需已安装的 `@h-ai/deploy`，实际运行应用仍需其数据库依赖。

先用 `deploy.scan(appDir, { environment, envDir })` 核对实际依赖、配置与环境值。扫描从目标 workspace 的 `pnpm-lock.yaml` importer 出发，沿 dependencies/optionalDependencies 遍历，排除 devDependencies、peerDependencies 和其他应用未被引用的依赖；workspace link 只沿运行依赖继续。pnpm 12 的工具链 YAML 文档不能混入应用图。lockfile、目标 importer 或依赖节点缺失时先执行 `pnpm install` 修复；依赖图不读取 package.json、pnpm-workspace.yaml 或项目目录布局。配置文件决定已识别模块的后端，保留的旧配置不能自行启用未依赖的模块。

`ScanResult.haiModules` 列出所有实际运行依赖中的 Hai 模块；`ScanResult.middlewares` 提供服务、后端、来源、配置路径和变量前缀；连接配置可能含凭据，不能整体记入日志。`DEPLOY_MIDDLEWARE` 是后端和连接字段的公共目录，字段名称、类型与约束须与模块 Schema 同步。

| 来源                                       | 后端选项                              | 默认 Compose 行为                                             | 云自动开通                          |
| ------------------------------------------ | ------------------------------------- | ------------------------------------------------------------- | ----------------------------------- |
| reldb；IAM/audit；启用 DB 日志的 scheduler | SQLite / MySQL / PostgreSQL           | SQLite 数据卷；mysql / postgres 服务                          | PostgreSQL → Neon                   |
| cache；IAM；scheduler 可选分布式锁         | memory / Redis                        | memory 无服务；redis 服务                                     | Redis → Upstash                     |
| storage                                    | local / S3                            | 本地数据卷；RustFS（默认）/MinIO + bucket 初始化              | S3 → Cloudflare R2                  |
| vecdb                                      | LanceDB / pgvector / Qdrant / Chroma  | 本地卷或对应容器                                              | 自定义已有服务                      |
| IAM 可选目录认证                           | disabled / LDAP                       | 禁用无服务；OpenLDAP                                          | 自定义已有目录                      |
| Reach Provider 数组                        | console / SMTP / HTTP API；阿里云 SMS | console 无服务；SMTP 用 Mailpit 捕获测试邮件；HTTP/SMS 自定义 | SMTP → Resend；SMS → 阿里云凭据接入 |

`serv` 声明 AI peer 不代表应用启用了 AI，不应因此安装 AI/ONNX/CUDA 或开通向量服务。LDAP 需要在应用安装 IAM 的可选 peer `ldapts`，并显式设置 `login.ldap=true`；安装 IAM 不代表启用了 LDAP。Reach 每个 Provider 保留独立数组索引及名称；通用 Console/HTTP API 按应用模板约定将 `name: sms` 归为短信，其他名称归为邮件服务，SMTP 和 aliyun-sms 按实际 type 分类，不能把 HTTP 回调当作 SMTP。email/sms 的 Console 均只输出日志，不实际投递。默认目录没有业务账号；Mailpit 不会对外投递生产邮件。生产应配置企业 LDAP/SMTP，或使用对应云服务。

每项都展示当前生效后端和用途，例如 PostgreSQL，再选择：

1. **使用默认配置**：选择后端；Compose 生成匹配容器/卷，云平台调用已支持的 Provisioner，并保存实际连接配置。MySQL、LDAP、向量库等没有云自动开通器时，明确提示改用自定义连接；不能声称已经创建云资源。Resend 需要已验证的发件域名，R2 需要已有 S3 访问密钥，阿里云短信需要签名/模板与额度。
2. **使用自定义配置**：逐项输入所选后端的连接字段，展示字段用途与约束，校验必填项、端口、布尔和 URL；凭据用密码输入。保存配置后跳过该服务的开通与 sidecar。
3. **保持不变**：仅在目标 `.env.<mode>` 显式声明当前后端及完整连接配置时出现；私有凭据可来自 `.env.<mode>.local`、兼容 `.env.local` 或进程。选择后不修改该项、不认证其 Provisioner、不创建或移除已有中间件容器，继续下一项。只有 `.env` 或其他环境有配置不满足此条件。

逐项配置前提供“环境配置已完备，直接部署”。选择后跳过全部中间件提示、变量改写、云资源与 sidecar 创建，保留已有服务；仍校验已有构建产物并执行部署及健康检查。命令行使用唯一的 `--skip-middleware`，SDK 使用 `skipMiddleware`。不要因为缺少某项中间件的目标文件声明而阻止用户主动跳过。

`--yes` 用于已授权的自动化：目标环境已有完整配置时保持不变，否则使用当前后端默认配置；不支持的云后端或缺少必需凭据直接失败。自动化直接部署用 `hai deploy packages/my-app-serv --env prod --yes --skip-middleware`。跳过不作为配置完整性或连接成功的证明。

直接部署的目标不完整时，先引导选择 SSH/Vercel。SSH 补齐主机、端口、用户名、认证方式、对应凭据、known_hosts 路径、远程目录/运行时及容器/主机端口；端口范围 1–65535。`auth: key` 使用私钥/agent，密钥路径留空使用 ssh-agent/默认密钥；`auth: password` 使用隐藏输入的密码。省略 auth 时，仅非空 password 启用密码方式，否则保持 key/agent；显式 key 忽略残留密码。密码原样保留空格、前导零，不经 YAML 类型转换；有效密码拒绝 CR/LF/NUL，UTF-8 最多 1023 字节。known_hosts 留空使用 OpenSSH 默认文件，不关闭主机键校验。

完整有效目标自动复用，`--yes` 不重新询问；修改选中环境 `.env.<mode>.local` 的 `HAI_DEPLOY_PROVIDER` 可切换连接。新填写的目标（含地址、端口、路径、Token、密码）只保存该环境私有文件并添加 Git 忽略。`--bundle-only` 在构建和中间件配置后、打包前最后询问是否添加或修改 SSH 信息，写入同一环境私有文件，并用于本次和后续 `deploy-target.json`；`--yes` 或跳过时复用已有参数，缺项仍可在上传前填写到 target。SDK 使用 `saveDeploymentEnvironment(snapshot, variables, { private: true })` 可显式保存本机参数。禁止读取、复制或打印私钥内容。

### Hai 模块与中间件的关系

识别依据是运行图中的所有节点，不按应用直接依赖硬编码消费者名单。下面按当前公开依赖和功能说明；新增模块/后端时同步此表、连接目录与真实运行测试。

| 模块                                                                        | 中间件来源或外部能力                                                                                                                                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| reldb / cache / storage / vecdb                                             | 分别拥有关系库、缓存、对象存储、向量库连接契约                                                                                                                                      |
| iam / kit                                                                   | IAM 运行依赖 audit/reldb/cache/crypto；kit 经 IAM 继承。LDAP 按 login.ldap 开关启用，Reach peer 只有另行实际依赖时进入运行图                                                        |
| audit / payment                                                             | audit 经 reldb 持久化；Stripe payment 直接依赖先初始化的共享 reldb 保存渠道映射和幂等结果，审计可选。微信、支付宝、Stripe 是已有商户 API，沿 payment 配置接入，不生成假云服务或容器 |
| scheduler / reach                                                           | 两者实际依赖 reldb/cache；Reach 另按启用的 SMTP/HTTP/短信渠道配置                                                                                                                   |
| ai                                                                          | 实际依赖 reldb/vecdb/datapipe。LLM、图像、音频端点及模型来自 AI 配置，不能仅凭包名选择模型镜像或 CUDA；不自动创建付费厂商账号                                                       |
| crypto / serv                                                               | crypto 的可选运行依赖按 lockfile 解析，serv 经 crypto 继承；serv 的 IAM/storage/AI peer 不作为启用证据                                                                              |
| core / datapipe / api-contract / api-client / ui / capacitor / cli / deploy | 本身没有额外专用中间件；仍沿实际运行依赖继续遍历，例如 api-client/capacitor 的 crypto 分支。UI/设备能力、部署目标/Provisioner 凭据按各自配置处理                                    |

S3 是协议，不是某个容器产品。默认配置时另选 RustFS/MinIO，保存到 HAI_DEPLOY_CONTAINER_S3ENGINE（rustfs | minio，默认 rustfs），应用始终写 HAI_STORAGE_TYPE=s3 或 HAI_STORAGE。自定义 AWS S3、OSS、R2 等端点不生成 sidecar。镜像使用与 storage 集成测试一致的 RustFS 官方版本和 MinIO 社区版本；存储桶初始化复用应用镜像里的 S3 SDK，无需额外 mc 镜像，必须幂等且不能吞掉失败。

AI 使用 MySQL 的首次建表需 CREATE 与 INDEX 权限，节点可并发初始化；仅明确重复索引且重查真实结构一致时继续，错误同名索引、权限和其他 DDL 故障必须阻止应用启动。DDL 不回滚，失败后检查初始化结果、逆序清理连接，再修复结构/权限重试，不能删库或吞错视为成功。

## 连接字段

以下是自定义向导的连接字段；完整可用项、枚举与范围仍以项目 `.env.example` 和公开 Schema 为准。变量前缀为 `HAI_DB`、`HAI_CACHE`、`HAI_STORAGE`、`HAI_VECDB`、`HAI_IAM_LDAP`；Reach 使用实际索引 `HAI_REACH_PROVIDERS_<index>`。camelCase 不拆词，例如 `bindPassword` → `BINDPASSWORD`。

| 后端               | 连接字段                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| SQLite             | database（文件路径或 `:memory:`）                                                                                                    |
| MySQL / PostgreSQL | url（优先）、host、port（1–65535）、database、user、password、ssl                                                                    |
| Redis              | url（优先）、host、port、password、db、tls、keyPrefix、connectTimeout、commandTimeout                                                |
| local / LanceDB    | root / path                                                                                                                          |
| S3                 | endpoint、bucket、region、accessKeyId、secretAccessKey、forcePathStyle                                                               |
| Qdrant / Chroma    | url；Qdrant 可选 apiKey；Chroma apiKey 用于 Bearer 自托管网关，URL 仅支持 HTTP(S) 根端点，不提供 Cloud 契约                          |
| pgvector           | url（优先）或 host/port/user/password，以及 database                                                                                 |
| LDAP               | url、bindDn、bindPassword、searchBase、searchFilter、usernameAttribute、emailAttribute、displayNameAttribute、useTls、connectTimeout |
| SMTP               | host、port、secure、user、pass、from                                                                                                 |
| HTTP API           | url、method（POST / PUT）、headers（JSON）、timeout                                                                                  |
| 阿里云 SMS         | accessKeyId、accessKeySecret、signName、endpoint                                                                                     |

## 离线准备与验收

构建与部署可分开，也可通过 pnpm run deploy --build 明确串联。构建保持环境无关；部署选择环境并只消费所选镜像。完整包自动包含 Compose 自建中间件镜像，因此导出阶段需要本地 Podman/Docker，缺镜像在打包阶段准备，不能留给隔离服务器下载。

每次离线交付都放在单一 .hai/deploy/<环境>/bundle-<项目>-<部署ID>-<版本>/ 目录，外层仅含 tar、deploy.sh、deploy.ps1、deploy-target.json、read-target.awk、deploy-local.sh 和 README.txt；Compose、运行环境、web.conf 和 manifest 仅保存在 tar 内，README 也记录部署 ID。--output release.tar 相对命令目录生成 release-<版本>/release-<版本>.tar，禁止覆盖已有交付目录。--bundle-only 只生成交付物，不连接服务器。操作目录含 Windows deploy.ps1、Linux/macOS deploy.sh 和带逐项配置说明的 deploy-target.json；运行上传脚本前先修改并核对该 JSON，两个脚本均读取此文件。本机运行 deploy.sh 需 sh、awk、ssh、scp；sh deploy.sh 主机 [端口] [用户] 可覆盖连接地址，HAI_DEPLOY_IDENTITY_FILE 和 HAI_DEPLOY_KNOWN_HOSTS_FILE 可覆盖两脚本的私钥及指纹文件路径。隔离服务器直接复制整个目录并运行 sh deploy-local.sh，由脚本自动解包并执行部署。每步失败返回非零，结果写 result-<部署ID>.json；只有 HTTP 检查通过才更新服务器 current。

离线 target 保存 auth 和 passwordEnv，不保存密码值；passwordEnv 默认 HAI_DEPLOY_PROVIDER_SSH_PASSWORD。操作机配置该环境变量后可重复上传，Windows 也可读取用户持久环境。密码仅进入本次 SSH/SCP 子进程环境，不进入参数、helper 源码、应用环境、tar、manifest 或公开 JSON。Windows 入口要求 PowerShell 5+ 和 OpenSSH，Linux/macOS 使用 sh、awk、ssh、scp，两者均不需要 Node/pnpm。target 的修改只影响本交付目录，不回写工程；新包仍从工程保存的选中环境配置生成。

manifest.json 的 partial 与 selectedServices、apply 脚本共同记录部署模式：完整构建且未指定 --services 为全量；显式 --services 或部分构建为增量。增量使用服务器成功基线保留未选服务和中间件凭据，首次安装拒绝增量包。S3 createBucket 默认 false，自建 S3 注入 HAI_STORAGE_CREATEBUCKET=true，由 storage.init 检查并创建缺失桶；仅更新 storage 不需要应用镜像，新桶在下次应用初始化时创建。Compose 网络统一 hai-app，不输出 YAML 锚点。失败恢复尝试还原容器和配置，保留数据卷，不回退已写业务数据。

服务器需要 Linux、Docker/Podman、Compose、sh、tar、sha256sum、awk、curl、util-linux flock、支持 flock 的持久化文件系统和容器/目录权限。部署和恢复使用固定 `.deploy.lock` 内核锁，不可删除/替换或按时间抢锁；活跃子命令继承 FD，全部持有进程退出或重启后自动释放。强杀/断电后的执行状态需核对结果文件、current 和容器，不能将锁释放当作恢复成功。完整交付包含自建服务镜像；自定义外部连接仍需准备服务、账号和网络可达性。云 Provider/Provisioner 需要外网，不能用于完全离线。

生成 web.conf 时从目标环境解析后的 _serv.yml 读取 transport.maxPlaintextBytes，调用 crypto.resolveTransportBodyLimits 推导 client_max_body_size；默认 2129920 字节，8 MiB 明文对应 16809984 字节。请求/响应 buffering 关闭，认证头缓冲固定。SvelteKit 从 _kit.yml 自动推导 adapter-node BODY_SIZE_LIMIT。app 增量包携带代理配置；容量变化时复用现有 Web 镜像重建代理并纳入失败恢复，容量不变保留 Web 容器。容量变化须选择 app；路由/端口/其他代理策略改变仍要求全量部署。应用继续独立限制业务文件、解压和行数。自管代理调用 resolveTransportBodyLimits 获取同一预算。

完全离线构建另需基础镜像、Linux 依赖缓存、pnpm 和匹配驱动/Node ABI/架构/libc 的原生预编译包。构建可用 --sqlite-prebuild-mirror，Podman 代理不可达可用 --no-http-proxy；不要改系统代理或让 deploy 下载编译环境。生产 HTTPS、CORS、证书、DNS 另行准备。实际断网验收登录、刷新、重启和数据持久化。

## 命令输出

内部 `runCommand` / `SshExecutor.exec` 先 UTF-8 解码，再对每条逻辑流跨块精确脱敏；成功 stdout/stderr、错误、onOutput 均为安全结果。`secrets` 不推断全部进程环境，调用方列出秘密及可能输出的编码/转换值；总长不超过 1 Mi UTF-16 单元，脱敏异常失败关闭且不暴露原 cause。`maxCaptureChars` 默认 1048576、最大 16777216，捕获尾部并返回 stdoutTruncated/stderrTruncated，结构化解析先拒绝截断。onOutput 支持 Promise，顺序等待并保持 pipe 背压；异常回调使执行失败。异常终止不释放未完成的秘密尾部。部署进度仅解析每行前 512 字符。超时不能证明远端工作已终止。

deadline 包括 helper 启动和输出处理。异常后 `terminationTimeoutMs` 另等待本地终止核验，默认 10000、上限 60000 毫秒。POSIX 用独立继承进程组；Windows 用隐藏且不加载 profile 的 PowerShell/.NET Job，挂起创建 → 分配成功 → 恢复，禁止 breakaway，helper/编译/分配失败拒绝执行。已脱离组的系统 daemon、现有容器和远端服务不在本地确认范围。只有受管理 Job/组无活动成员才是 confirmed；未证明为 unknown，启动前为 not-started。输入、回调和流异常同样经过此路径，已经进入的回调不能撤销，但不再交付新块。

公开 `getDeployCommandState(result.error)` 在失败分支读取原因、本地状态、远端状态、deploymentId 和 resultFile。SSH 中断默认为远端 unknown；docker-ssh 新连接只读解析原子 `result-<ID>.json`，完整/未截断/ID 匹配才为 finished，并返回实际阶段、退出码。finished 指脚本及恢复结束，容器可以继续运行；即使终态为 0，原连接/输出失败仍保留。缺失、旧记录、损坏或重连失败保持 unknown，不自动重试写入。按 ID 核对步骤、current 和服务，再恢复。
