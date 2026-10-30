---

name: hai-deploy
description: "构建并发布或交付已有镜像：完整离线包、按服务更新、SSH 密钥/密码与跨平台手工部署、失败恢复；也支持 Vercel prebuilt。"
---

# hai-deploy

交付角色统一为 `serv`（独立 API 后端）、`web`（静态或 SSR 浏览器站点）、`app`（Android/iOS 手机安装包）、`desktop`（桌面安装包）。Fullstack 容器为 serv + 可选 web，API 为 serv，admin/website/h5/mobile-app 的浏览器镜像为 web；原生 app/desktop 不作为服务器 Compose 服务。`--images` 与 `--services` 使用 serv/web，`--target app` 与 `--target desktop` 生成原生包。API workspace 的服务目录为 `apps/<项目>-serv`。镜像与容器共用工程根 `package.json.name` 的归一化身份（去 scope、转小写、非法字符合并为连字符）；名称缺失或无效时报错，不回退目录名。镜像为 `localhost/hai-<项目>-<角色>:<buildId>`，容器为 `hai-<项目>-<环境>-<角色>`，镜像可跨环境复用。

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 配置环境与中间件，交付完整离线包或发布选中服务 |
| 适用场景 | 一体化构建发布、独立打包、隔离网络手工部署、增量更新与故障排查 |
| 输入 | package.json、hai.json、运行依赖锁文件、目标环境、已有制品或明确构建要求 |
| 输出 | 含 tar、清单、配置和跨平台入口的单一交付目录与分步结果，或经过 HTTP 检查的部署结果 |
| 限制 | SDK 只消费产物；CLI --build 显式先构建。首次安装必须完整交付，packaged 不代表服务器 ready。云资源需要外网。 |

--plan 和 --inspect-remote 从 CLI 完整透传，只读失败不得退回部署。target.runtime 只表示远端配置。旧凭据用服务器本机 `hai deploy-secrets <directory> --import <private.json>` 预检，--apply 才导入；SDK importDeploymentSecrets 默认 dryRun:true，验证项目/卷/实际凭据、共享 flock、v2 状态特殊字符与原子 0600 写入，缺状态的普通部署仍拒绝。完整格式和恢复步骤见 [凭据导入](credentials.md)。

## 操作流程

全量与增量都须在变更前核对实际卷和后端家族。服务器 `persistent-backends` 在任何启动前保存绑定，服务移除、首次失败及恢复均保留；与 `managed-secrets.env`、数据卷成套保护和备份。不能删除或编辑账本强行认领，不把“移除 PostgreSQL 再加 MySQL”视为新环境。旧 active 只有已知家族和唯一真实服务容器的 Mounts、Config.Image 同时吻合才能补证；未知 dormant 旧卷拒绝猜测，活动卷缺失拒绝空库自愈。新 release 的 `previous-state-backends` 仅供恢复前核验旧 tuple、账本与实际卷，不回退永久记录。此私有元数据没有新增公开配置 API。

受控导入 v2 可为未认领旧卷补证，但须项目/凭据组/精确卷绑定与唯一运行原容器的真实角色标签、Mounts、Image 家族完全一致；Docker/Podman namespace冲突拒绝，已知 ledger/context/daemon 冲突不覆盖。导入不创建 current，缺成功基线时必须当前 CLI 新 ID 完整全量包，完整成功后才可增量。详见[凭据导入](credentials.md)，不得把导入或接管称作数据库数据恢复。

身份限制只发生在 SSH 目标 Linux 服务器执行 `apply.sh`：固定 SSH uid、本地默认 Docker context 或实际本地 Podman，以及 daemon/store；远程连接、非默认 context、显式存储覆盖拒绝。生产显式 pin `remote.runtime`；auto 因新装 Podman 换引擎时，先恢复原 runtime/用户/store。Windows/macOS 操作机用 Docker Desktop/Podman VM 构建打包再 SSH 发布不受限。有意更换 daemon、服务器或恢复/替换数据时单独迁移，不能用 uid、路径或家族相同证明数据格式兼容；主版本和 Schema 兼容仍须单独确认。

排错与交付按[沟通与同步维护](../hai-app-create/collaboration.md)先说明实际影响、恢复步骤和验证边界，再附脱敏错误码/traceId/日志；配置、使用文档和截图随实际部署流程同步。

1. 读取项目 scripts、images/ 中的 Dockerfile、项目根 hai.json 的 build/deploy 与服务目录运行配置。构建与部署属于整个项目；服务目录只用于扫描运行依赖。创建默认带开发期部署工具；用户明确 --no-deploy 时不生成部署入口。构建细节见 [hai-build](../hai-build/SKILL.md)。
2. 选择环境，验证 .env.<mode> 存在，再处理部署目标与必要中间件。SSH 支持 key/agent 或 password，缺项按说明补齐，有效完整配置直接复用；--bundle-only 在构建和中间件配置后、打包前最后询问是否添加或修改 SSH 信息，保存并用于本次和后续 target；--yes 或跳过时复用已有配置。新私有参数写 .env.<mode>.local，旧 .env.local 保留兼容回退；私钥仅引用路径，密码隐藏输入并保留原值。该按环境私有层仅由部署 SDK 加载，不改变 Core 运行规则。优先级与认证边界见 [middleware.md](middleware.md)。
3. 先校验所选制品、版本、服务和SHA-256。--build只构建所选应用镜像；不带它时缺产物明确失败，不隐式补构建。根目录使用格式4，非根目录使用格式5及webBasePath；两者都记录appVersion、buildId、partial、hasWeb、镜像归档及显式配置的servContainerPort/webContainerPort，部分构建也保留未选镜像端口，缺省使用部署默认值。网站目录由构建进程PUBLIC_BASE_PATH确定，所有部分构建须保持一致；目录变化必须全量，健康与恢复按制品记录处理。具体步骤见[网站挂载目录](../hai-build/paths.md)。同一应用版本可重建，镜像引用区分实际内容；禁止latest与无版本镜像。
4. 完整包自动导出实际自建中间件镜像并去重；只更新 Web 不重新打包 API/中间件。打包机需容器引擎导出中间件，服务器仅 load，禁止 pull/build。外部连接及云开通不能伪称为离线自包含服务。
5. --services 使用目标服务器最后成功状态为基线，检查端口/拓扑及未选依赖，保留未选配置、凭据、网络和卷。脚本先按项目/服务标签仅删除选中旧容器（保留卷），再 up -d --no-deps --no-build --pull never --no-recreate 创建新容器并保留其他容器；先等待选中中间件健康，再启动 serv/Web，失败恢复同序，避免 Compose Provider 连带重建反向依赖，禁止整个项目 down。S3 可选 createBucket 在 storage.init 中检查并创建缺失桶，自建 S3 注入 HAI_STORAGE_CREATEBUCKET=true；仅更新 storage 无须应用镜像，新桶在下次应用初始化时创建。Compose 网络统一 hai-app，序列化不使用 YAML 锚点。
6. 每次交付只生成工程根 .hai/deploy/<环境>/bundle-<项目>-<部署ID>-<版本>/ 一个目录，外层仅含 tar、deploy.sh、deploy.ps1、deploy-target.json、read-target.awk、deploy-local.sh 和 README.txt；Compose、运行环境、web.conf 和 manifest 仅在 tar 内，README 记录部署 ID。--output release.tar 生成同目录的 release-<版本>/release-<版本>.tar，不能覆盖已有交付。--bundle-only 不连接 SSH，生成带逐项说明的 deploy-target.json，只引用 passwordEnv 而不含 SSH 密码值；修改 target 仅影响本包。Windows PowerShell 5+ deploy.ps1、Linux/macOS deploy.sh 读取该文件，上传并自动解包部署；隔离服务器复制整个目录后执行 sh deploy-local.sh，自动解包再执行 apply.sh。脚本不依赖源码、Node 或 pnpm；本机运行 deploy.sh 需 sh、awk、ssh、scp。manifest.partial/selectedServices 固化模式：完整构建且无 --services 为全量；部分构建或显式 --services 为增量，必须匹配服务器成功基线。
7. 工具预检、基线、上传、校验、镜像导入、服务更新和 HTTP 检查分别报告。失败返回非零退出码，结果文件保留失败阶段；只有检查成功才更新服务器 current。已有部署失败尝试恢复所选服务的旧容器和配置，并按旧发布端口/路径验证容器和 HTTP；result 的 recoveryStatus 为 not-needed/passed/failed/stopped。数据卷保留，已写业务数据和不兼容 Schema 迁移不回退。恢复验证失败不能表述为已回滚成功。禁止把本地打包记录当服务器成功状态。
8. 部署及恢复全程用 Linux flock 持有固定 `.deploy.lock`；不得删除/替换文件或按时间抢锁。父进程强杀后，继承 FD 的活跃子命令仍持锁；所有持有进程退出或重启后自动释放。旧 `.deploy-lock` 目录保持原样，升级前结束旧版部署进程。强杀/断电不执行恢复 trap，缺结果文件须人工核对容器、镜像和 current 后用新包恢复，锁释放不代表副作用已回退。

成功后手工回退使用**当前 CLI**、旧应用 build 制品和匹配配置，省略 `--build`、`--services` 生成新全量 ID；离线也须重新打包，不能运行旧 bundle 或旧工具绕过账本。旧制品通常只保留 serv/web 镜像，中间件仍按当前 CLI 固定版本规划，不承诺精确回退全部中间件版本、DDL 或业务数据。确认主版本、Schema、拓扑和数据兼容并准备备份，再发布和验证。

## 可选 HTTPS

所有容器模板共用deploy.provider.expose.https，省略时HTTP。files指定domain、certificateFile、privateKeyFile（相对工程根），校验域名/期限/密钥并复制到私有包。letsencrypt指定domain、email、acceptTerms:true，HTTP hostPort必须80，公网DNS、80入站及CA出站须可达。固定版本官方Certbot申请并每12小时检查续期，Nginx自动重载。仅单域名HTTP-01，无DNS/通配符。HTTPS默认443、redirectHttp默认true；--yes复用配置。启停或改模式/域名/端口/本地证书需全量。状态在服务器https/acme及按域名隔离的https/certificates目录，需备份；续期失败保留旧证书并须及时处理，隔离目标用已有证书。打包/plan不申请证书。

默认.tar.gz，显式--output release.tar为未压缩，README仅外层。镜像从解包目录导入，release只留配置/恢复状态；成功后清理本次incoming，失败保留诊断。中间件归档按镜像内容ID缓存且复用前验摘要。

## 后端运行配置重载

Node 后端（Serv / SvelteKit SSR）默认在每次启动时重读发布目录的 `.env.runtime`，修改后 `docker restart <容器名>` 或 `podman restart <容器名>` 即可，无需重建镜像或额外 override。旧部署先用新版 CLI 发布一次。删除的字段不会从旧 Compose 注入中复活；服务器托管连接的 `middleware.env` 保持原有更高优先级，私有代理标记和 Node 启动参数仍由部署装配管理。静态 Web、中间件、端口/挂载、Nginx 路由与限额不在该重载范围；改变网关路径、端口或挂载时使用全量部署。手工修改需备份；下一次后端发布会从工程环境重新生成，需要长期保留的配置同步回源环境。

运行文件在后端实际挂载的releases/<后端发布ID>/.env.runtime；仅更新Web/中间件后current可能指向新记录，不能据此猜测后端文件，按容器Mounts中/run/hai/.env.runtime的Source确认。只读文件挂载，上级目录0700，容器非root可读，宿主所有者可修改。dotenv字面解析不执行shell；双引号支持JSON转义。单文件≤1MiB，缺失/不可读/超限在应用导入前失败。父HAI_SERV/HAI_KIT仍优先于叶字段。重启后验健康与配置影响的业务，失败恢复文件再重启。

## CLI

```sh
pnpm run deploy --env prod --build
pnpm build --target image
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<buildId>
pnpm run deploy --env prod --bundle-only
pnpm build --target image --images web
pnpm run deploy --env prod --services web
```

制品格式4和5都记录primaryService（serv/web），hasWeb表示完整工程是否包含浏览器端；格式5另记录非根目录webBasePath。只有serv + web生成同源API代理；格式1至3须重新构建。CLI的--project-name与SDK的DeployAppOptions.projectName覆盖入口已移除，旧参数明确报错，请在工程根package.json.name维护身份。迁移旧工程先同步build.images、Dockerfile及API workspace的-serv包名与引用，重新安装依赖并重建完整制品。旧部署先备份、核对项目名、卷和受管凭据，再建立完整基线。工具不自动跨项目迁移数据；完整部署仍按Compose规则清理同项目旧服务，不能仅改deploy-target.json.directory完成迁移。

上传脚本先复用操作机密码；缺失或为空时直接隐藏输入并继续本次部署，输入不落盘；非交互调用明确失败且不等待。无效输入显示变量名和约束；SCP 上传期间通过 SSH 查询远端归档大小，显示已接收/总字节与百分比，成功后才显示 100%。增量部署先恢复已停止或 Compose down 的既有完整基线，复用本地镜像且不重建正在运行的容器，再检查依赖和更新选中服务；恢复失败须检查诊断，不能推进 current。

成功发布后需回退业务版本时，使用保留的旧完整制品和与其匹配的配置/私有环境备份，恢复配置后执行 `pnpm run deploy --env prod --artifact-dir .hai/build/docker/<previousBuildId>`。省略 --build 和 --services，以旧制品创建新的全量交付包和部署 ID，再经历锁、校验、健康验证。不要重跑已使用的旧包、手动覆盖 current 或只改镜像 tag。发布前验证数据库迁移向后兼容或准备匹配的数据备份；保留外部服务凭据与卷身份，未知状态先检查实际服务。此路径不是自动的数据恢复命令。

## 请求访问策略

Serv/SvelteKit 后端的策略快照、只读挂载、环境覆盖、代理信任和增量保留见[请求访问配置手册](https://hai-series.github.io/hai-framework/docs/configuration/request-access/)，也可读取工程交付的 `hai-core/request-access.md`；纯客户端由实际后端管理这些设置。默认快照模式通过新包更新，恢复使用原成功发布文件，不覆盖旧发布目录。需要运维文件重启加载时，先按变更方案确认流程说明启动方式和优先级变化；独立外部文件需另行备份，SDK 回滚不恢复它。

## 自建对象存储直连

S3 的内部 endpoint 与预签名 publicEndpoint 分开；后者无默认，填用户可访问的 HTTP(S) origin，不含桶名或网站目录。全栈 Web Nginx 及 SSR/API gateway 将实际桶路径原样代理至 storage，不经过 Serv，保留签名 Host/URI/query，关闭对象缓冲和签名日志。桶与网站/API 路径不能重叠；外层反向代理也须转发桶路径，不能把网站 base 加到签名 URL。跨源 CORS 在 S3 配置，私有桶保持签名授权；外部 S3 不生成本地路由，Local 不开放目录。

自建保留 bucket/region/prefix/publicEndpoint/publicUrl/operationLog。增加 gateway 或改变这些访问配置需全量基线，增量摘要不一致在更新前拒绝；选中范围不改变完整拓扑规划。应用/Storage 增量刷新保留代理 DNS，恢复使用旧发布拓扑。验证真实 S3+Nginx 大文件、Range、PUT、匿名/篡改/过期拒绝，并核对外层日志和回滚；不能用只检查生成字符串代替网络验证。

## SDK

deploy.init 后检查 HaiResult.success，deploy.deployApp 接收 artifactDir、bundleOnly、selectedServices、runtime 与 onProgress；finally 中 deploy.close。deploy.scan 和 deploy.credentials.* 不依赖 init。Vercel 只消费已有 .vercel/output，不执行源码构建，也不支持 Compose 离线/部分更新。

内部命令工具须显式枚举 `secrets`（包括转换后的敏感字面量），成功/失败/回调均跨块脱敏；不得向日志附加原始异常 cause。捕获默认每流末尾 1 Mi 字符，结构化消费先检查截断标志；异步输出回调按序等待并保持 pipe 背压。进度每行最多解析 512 字符，超时后确认远程执行状态。详细边界见 [middleware.md](middleware.md#命令输出)。

超时或输入/输出失败会终止本地受管理 Job/进程组并等待核验；Windows 用系统 PowerShell/.NET 内嵌 Job，先挂起创建、分配成功才恢复，失败不降级裸进程；POSIX 后代须保留继承的进程组。`terminationTimeoutMs` 默认 10000、最大 60000 毫秒，核验失败返回 unknown。失败分支用 `getDeployCommandState(error)` 读取 localTermination 和 remoteExecution；CLI 分别显示。本地已退出不能证明 SSH 远端停止；仅新连接读到完整、ID 匹配的原子结果才确认 finished，给出结果路径/退出码。未知状态不自动重跑发布或回滚，先核对 current、步骤和实际服务。

终态包含 credentials/recover 等真实阶段。`remoteRecovery` 透传已匹配结果的恢复状态；passed 只证明旧容器和 HTTP 通过。服务器本地健康通过并提交 current 后，SDK 还从操作机检查公开地址；此时网络/防火墙造成失败会保留 remoteStage=complete、remoteExitCode=0，不自动撤销服务器成功部署，须核对结果和外部网络。

## 离线交付与验证

Linux 预备 Docker/Podman、支持 --pull never 的 Compose（Docker Compose v2 或 podman-compose 1.6.0 及以上）、sh、tar、sha256sum、awk、curl、util-linux flock 及目录/容器权限，部署目录文件系统须支持 flock。完整 tar 包含全部自建中间件归档；目标架构须匹配。包中有私有配置，安全搬运，不提交 Git。离线构建额外准备基础镜像、Linux 依赖缓存、工具链与原生预编译包；Windows node_modules 不能替代。

按 [分轮验证与集中修复](../hai-app-tests/validation.md) 收集适用的 typecheck、lint、build、test、scaffold gates 和 test:deploy-gates，汇总后集中修复、再验证。实际验证无 registry 网络的首次部署、登录刷新、同版本重发、只更新 Web/API、停止/down 后增量恢复、缺密码隐藏输入、上传进度、损坏归档、缺基线、健康失败与恢复。Windows/Linux/macOS 上传入口分别执行验收；原生安装包在对应 OS 验证。测试临时工程、容器、镜像、数据和进程在 finally/teardown 清理，只清理测试拥有的资源；日志、截图和报告保留到分析和交付结束再清理。

部署前可 hai deploy --env prod --plan，只读校验真实制品和执行范围，显示工程根root、服务源码/配置目录serviceDir、项目/环境、版本/构建、配置文件及键名、保留范围、基线要求和恢复目录；不构建、不创建凭据、不连接或改变目标。远端 current 未读取标 not-inspected；不得把计划或本地打包当真实基线成功。数据库与业务数据不随 Compose 恢复回退。

需要核对目标真实基线时加 --inspect-remote（必须配合 --plan），仅 SSH 读取 current/成功发布目录，按 verified/missing/unavailable 与真实发布 ID 报告，不写目标；不能把未检查当作成功。

资源名称取实际编排规则：containers 只列显式名称，LDAP/SMTP 等由 Compose 命名的服务见 composeManagedServices；logicalVolumes 是逻辑键，不能冒充引擎卷名。核对 keep 内部连接、跳过、局部更新与云开通配置；只读计划不创建或读取中间件凭据缓存文件。
