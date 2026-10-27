---
name: hai-deploy
description: "构建并发布或交付已有镜像：完整离线包、按服务更新、SSH 密钥/密码与跨平台手工部署、失败恢复；也支持 Vercel prebuilt。"
---

# hai-deploy

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

1. 读取项目 scripts、images/ 中的 Dockerfile、项目根 hai.json 的 build/deploy 与服务目录运行配置。构建与部署属于整个项目；服务目录只用于扫描运行依赖。创建默认带开发期部署工具；用户明确 --no-deploy 时不生成部署入口。构建细节见 [hai-build](../hai-build/SKILL.md)。
2. 选择环境，验证 .env.<mode> 存在，再处理部署目标与必要中间件。SSH 支持 key/agent 或 password，缺项按说明补齐，有效完整配置直接复用；--bundle-only 在构建和中间件配置后、打包前最后询问是否添加或修改 SSH 信息，保存并用于本次和后续 target；--yes 或跳过时复用已有配置。新私有参数写 .env.<mode>.local，旧 .env.local 保留兼容回退；私钥仅引用路径，密码隐藏输入并保留原值。该按环境私有层仅由部署 SDK 加载，不改变 Core 运行规则。优先级与认证边界见 [middleware.md](middleware.md)。
3. 先校验所选制品、版本、服务和 SHA-256。--build 只构建所选应用镜像；不带它时缺产物明确失败，不隐式补构建。格式版本 3 记录 appVersion、buildId、partial、hasWeb、镜像归档及显式配置的 appContainerPort/webContainerPort；部分构建也保留未选镜像端口，缺省使用部署默认值。同一应用版本可重建，镜像引用区分实际内容；禁止 latest 与无版本镜像。
4. 完整包自动导出实际自建中间件镜像并去重；只更新 Web 不重新打包 API/中间件。打包机需容器引擎导出中间件，服务器仅 load，禁止 pull/build。外部连接及云开通不能伪称为离线自包含服务。
5. --services 使用目标服务器最后成功状态为基线，检查端口/拓扑及未选依赖，保留未选配置、凭据、网络和卷。脚本先按项目/服务标签仅删除选中旧容器（保留卷），再 up -d --no-deps --no-build --pull never --no-recreate 创建新容器并保留其他容器；先等待选中中间件健康，再启动 app/Web，失败恢复同序，避免 Compose Provider 连带重建反向依赖，禁止整个项目 down。S3 可选 createBucket 在 storage.init 中检查并创建缺失桶，自建 S3 注入 HAI_STORAGE_CREATEBUCKET=true；仅更新 storage 无须应用镜像，新桶在下次应用初始化时创建。Compose 网络统一 hai-app，序列化不使用 YAML 锚点。
6. 每次交付只生成工程根 .hai/deploy/<环境>/bundle-<项目>-<部署ID>-<版本>/ 一个目录，外层仅含 tar、deploy.sh、deploy.ps1、deploy-target.json、read-target.awk、deploy-local.sh 和 README.txt；Compose、运行环境、web.conf 和 manifest 仅在 tar 内，README 记录部署 ID。--output release.tar 生成同目录的 release-<版本>/release-<版本>.tar，不能覆盖已有交付。--bundle-only 不连接 SSH，生成带逐项说明的 deploy-target.json，只引用 passwordEnv 而不含 SSH 密码值；修改 target 仅影响本包。Windows PowerShell 5+ deploy.ps1、Linux/macOS deploy.sh 读取该文件，上传并自动解包部署；隔离服务器复制整个目录后执行 sh deploy-local.sh，自动解包再执行 apply.sh。脚本不依赖源码、Node 或 pnpm；本机运行 deploy.sh 需 sh、awk、ssh、scp。manifest.partial/selectedServices 固化模式：完整构建且无 --services 为全量；部分构建或显式 --services 为增量，必须匹配服务器成功基线。
7. 工具预检、基线、上传、校验、镜像导入、服务更新和 HTTP 检查分别报告。失败返回非零退出码，结果文件保留失败阶段；只有检查成功才更新服务器 current。已有部署失败尝试恢复所选服务的旧容器和配置；数据卷保留，已写业务数据不回退，恢复后仍需验证健康。禁止把本地打包记录当服务器成功状态。
8. 部署及恢复全程用 Linux flock 持有固定 `.deploy.lock`；不得删除/替换文件或按时间抢锁。父进程强杀后，继承 FD 的活跃子命令仍持锁；所有持有进程退出或重启后自动释放。旧 `.deploy-lock` 目录保持原样，升级前结束旧版部署进程。强杀/断电不执行恢复 trap，缺结果文件须人工核对容器、镜像和 current 后用新包恢复，锁释放不代表副作用已回退。

## CLI

```sh
pnpm run deploy --env prod --build
pnpm build --target docker
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<buildId>
pnpm run deploy --env prod --bundle-only
pnpm build --target docker --images web
pnpm run deploy --env prod --services web
```

使用 pnpm run deploy，避免与 pnpm 自带 deploy 混淆。fullstack 指向 packages/<项目>-serv，API workspace 指向 apps/<项目>-service；这是扫描入口，不是镜像选择。默认资源名取工程根 package.json.name（缺失用工程根目录名）并附加显式环境，统一交付包、远端目录、容器、卷及基线；旧部署用 --project-name 保留原资源身份，不能只改 target.directory 迁移。--services 负责选择；--skip-middleware 只跳过配置及开通。--yes 复用有效配置，缺值时不盲目继续。

上传脚本先复用操作机密码；缺失或为空时直接隐藏输入并继续本次部署，输入不落盘；非交互调用明确失败且不等待。无效输入显示变量名和约束；SCP 上传期间通过 SSH 查询远端归档大小，显示已接收/总字节与百分比，成功后才显示 100%。增量部署先恢复已停止或 Compose down 的既有完整基线，复用本地镜像且不重建正在运行的容器，再检查依赖和更新选中服务；恢复失败须检查诊断，不能推进 current。

## SDK

deploy.init 后检查 HaiResult.success，deploy.deployApp 接收 artifactDir、bundleOnly、selectedServices、runtime 与 onProgress；finally 中 deploy.close。deploy.scan 和 deploy.credentials.* 不依赖 init。Vercel 只消费已有 .vercel/output，不执行源码构建，也不支持 Compose 离线/部分更新。

内部命令工具须显式枚举 `secrets`（包括转换后的敏感字面量），成功/失败/回调均跨块脱敏；不得向日志附加原始异常 cause。捕获默认每流末尾 1 Mi 字符，结构化消费先检查截断标志；异步输出回调按序等待并保持 pipe 背压。进度每行最多解析 512 字符，超时后确认远程执行状态。详细边界见 [middleware.md](middleware.md#命令输出)。

超时或输入/输出失败会终止本地受管理 Job/进程组并等待核验；Windows 用系统 PowerShell/.NET 内嵌 Job，先挂起创建、分配成功才恢复，失败不降级裸进程；POSIX 后代须保留继承的进程组。`terminationTimeoutMs` 默认 10000、最大 60000 毫秒，核验失败返回 unknown。失败分支用 `getDeployCommandState(error)` 读取 localTermination 和 remoteExecution；CLI 分别显示。本地已退出不能证明 SSH 远端停止；仅新连接读到完整、ID 匹配的原子结果才确认 finished，给出结果路径/退出码。未知状态不自动重跑发布或回滚，先核对 current、步骤和实际服务。

## 离线交付与验证

Linux 预备 Docker/Podman、支持 --pull never 的 Compose（Docker Compose v2 或 podman-compose 1.6.0 及以上）、sh、tar、sha256sum、awk、curl、util-linux flock 及目录/容器权限，部署目录文件系统须支持 flock。完整 tar 包含全部自建中间件归档；目标架构须匹配。包中有私有配置，安全搬运，不提交 Git。离线构建额外准备基础镜像、Linux 依赖缓存、工具链与原生预编译包；Windows node_modules 不能替代。

按 [分轮验证与集中修复](../hai-app-tests/validation.md) 收集适用的 typecheck、lint、build、test、scaffold gates 和 test:deploy-gates，汇总后集中修复、再验证。实际验证无 registry 网络的首次部署、登录刷新、同版本重发、只更新 Web/API、停止/down 后增量恢复、缺密码隐藏输入、上传进度、损坏归档、缺基线、健康失败与恢复。Windows/Linux/macOS 上传入口分别执行验收；原生安装包在对应 OS 验证。测试临时工程、容器、镜像、数据和进程在 finally/teardown 清理，只清理测试拥有的资源；日志、截图和报告保留到分析和交付结束再清理。

部署前可 hai deploy --env prod --plan，只读校验真实制品和执行范围，显示项目/环境、版本/构建、配置文件及键名、保留范围、基线要求和恢复目录；不构建、不创建凭据、不连接或改变目标。远端 current 未读取标 not-inspected；不得把计划或本地打包当真实基线成功。数据库与业务数据不随 Compose 恢复回退。

需要核对目标真实基线时加 --inspect-remote（必须配合 --plan），仅 SSH 读取 current/成功发布目录，按 verified/missing/unavailable 与真实发布 ID 报告，不写目标；不能把未检查当作成功。

资源名称取实际编排规则：containers 只列显式名称，LDAP/SMTP 等由 Compose 命名的服务见 composeManagedServices；logicalVolumes 是逻辑键，不能冒充引擎卷名。核对 keep 内部连接、跳过、局部更新与云开通配置；只读计划不创建或读取中间件凭据缓存文件。
