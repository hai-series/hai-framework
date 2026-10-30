# @h-ai/deploy

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

## 简介

部署已有镜像与 Vercel prebuilt 产物。支持完整离线交付、选择服务更新、SSH 自动发布和跨平台人工部署脚本。SDK 不构建源码，CLI 的 --build 明确编排先构建后发布。

## 核心功能清单

- 一条命令完成构建、打包、SSH 上传、启动和访问检查。
- 完整包包含应用与自建中间件镜像；支持只更新选中的服务。
- 离线交付生成 tar 和 Windows/Linux/macOS 操作脚本，记录步骤结果并在失败时尝试恢复。

## 使用入门

### 准备构建产物

创建项目默认安装部署工具，可用 `hai create my-app --no-deploy` 关闭。部署 SDK 属于开发依赖，不进入应用运行镜像。

交付角色统一为 `serv`（独立 API 后端）、`web`（静态或 SSR 浏览器站点）、`app`（Android/iOS 手机安装包）、`desktop`（桌面安装包）。Fullstack 容器为 serv + 可选 web，API 为 serv，admin/website/h5/mobile-app 的浏览器镜像为 web；原生 app/desktop 不作为服务器 Compose 服务。`--images` 与 `--services` 使用 serv/web，`--target app` 与 `--target desktop` 生成原生包。API workspace 的服务目录为 `apps/<项目>-serv`。镜像与容器共用工程根 `package.json.name` 的归一化身份（去 scope、转小写、非法字符合并为连字符）；名称缺失或无效时报错，不回退目录名。镜像为 `localhost/hai-<项目>-<角色>:<buildId>`，容器为 `hai-<项目>-<环境>-<角色>`，镜像可跨环境复用。

```sh
pnpm build
pnpm build --target image
pnpm build --target image --images web
pnpm build --target desktop --platform windows --arch x64
```

源码编译、镜像构建、桌面打包分别对应 compile/image/desktop。构建不选择部署环境、不注入运行期密钥。原生安装包在对应操作系统准备 SDK 与 Rust 工具链后构建。

#### build 的可选参数

| 参数                       | 用途                                      |
| -------------------------- | ----------------------------------------- |
| `--target`                 | compile（默认）、image、app、desktop      |
| `--images`                 | serv、web 或 serv,web；只构建导出所选镜像 |
| `--runtime`                | auto（优先 Podman）、podman、docker       |
| `--network`                | 容器构建网络，默认引擎设置                |
| `--no-http-proxy`          | Podman 构建不继承本机代理                 |
| `--sqlite-prebuild-mirror` | SQLite 预编译包的可信 HTTP(S) 根地址      |
| `--platform` / `--arch`    | 原生安装包的系统与架构                    |

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

业务容量通过 `transport.maxPlaintextBytes` 统一配置：默认 1 MiB，整数范围 1 KiB～64 MiB，请求和响应共用 UTF-8 明文字节预算。客户端从握手自动获取上限，密文与部署代理预算由 `resolveTransportBodyLimits()` 推导（两倍明文 + 32 KiB）。握手、公钥、认证头和防重放约束独立；超限取消原流并释放 reader，请求 413、响应为加密的 500 容量错误，客户端识别 `TransportBodyTooLargeError` / `hai:crypto:070`。 全量和 app 增量部署都从解析后的 `_serv.yml` 推导代理上限；容量变化会复用现有 Web 镜像重建代理，健康失败恢复旧配置。SvelteKit 的 adapter-node `BODY_SIZE_LIMIT` 从 `_kit.yml` 同步推导。 [Transport capacity and upgrade](../crypto/TRANSPORT-CAPACITY.md)。

无正文认证封装通过 X-Hai-Transport 头传输，生成配置使用 large_client_header_buffers 4 32k 与 proxy_buffer_size 32k 容纳头字段；自有代理也须允许并保留该头。

构建器将锁文件、包配置、本地归档和补丁准备为 `images/dependencies/` 输入，结合 pnpm store 缓存与 Docker 分层复用下载。源码修改不应重新下载全部依赖；缓存为空仍能联网构建。Windows node_modules 不用于 Linux 镜像。完全离线构建还需预先准备基础镜像、工具链和匹配 ABI/架构/libc 的原生预编译包。

版本来自应用根 package.json.version。制品位于 `.hai/build/docker/<buildId>/`，包括manifest.json、所选镜像tar和SHA-256；根目录使用格式4，非根目录使用格式5及webBasePath。partial 标识部分构建，hasWeb 保留工程拓扑。清单还会记住配置中填写的 serv/web 容器端口（servContainerPort、webContainerPort），只打包一个镜像也不会丢掉另一个的端口；没填写则沿用部署默认值。相同应用版本允许重建，构建编号和镜像引用区分实际内容；全部导出成功才更新本机构建入口。基础镜像、中间件及工具使用明确版本，不使用 latest。

#### 网站挂载目录

默认网站位于根目录。需要`https://example.com/yyy/`时，在应用构建进程显式设置`PUBLIC_BASE_PATH=/yyy`，由CLI生成格式5制品；webBasePath是构建结果，不是部署环境的可覆盖参数。各目录段仅ASCII字母、数字、`_`、`.`、`-`，无末尾斜杠或单独的`.`/`..`段。使用支持格式5的CLI/Deploy，旧工具拒绝该格式；不能手改编号绕过。

SDK据制品生成Nginx目录、运行配置入口、SSR健康路径和返回URL，额外网关应保留此前缀。同源API仍由Serv的http.apiPrefix独立决定，CORS允许源只包含协议、域名和端口。独立Vite站点保留其运行配置中的外部API地址。完整及部分构建保持同一PUBLIC_BASE_PATH，即使只构建serv；增量在替换前拒绝目录不一致，目录变更使用全量部署。失败恢复按旧发布记录的健康路径验证。操作示例、两种框架差异与真实截图见[网站子目录配置](../../docs/usage/configuration/delivery.md#网站部署在子目录)。

### 部署到环境

#### 先准备环境与部署目标

默认部署名取工程根（最近的 `hai.json` 或锁文件所在目录）的 `package.json.name`，缺失时报错，再附加显式环境后缀。例如 fullstack 工程 `hai-delivery` 扫描 `packages/hai-delivery-serv`，`--env test` 生成 `/opt/hai/apps/hai-delivery-test` 和 `bundle-hai-delivery-test-<部署ID>-<版本>.tar.gz`。远端目录、交付包、Compose 项目、API/Web/中间件容器、数据卷、服务器凭据状态及增量基线统一使用该名称；不会按字符串删除真实项目名中的 `-serv`。

制品格式4和5都记录primaryService（serv/web），hasWeb表示完整工程是否包含浏览器端；格式5另记录非根目录webBasePath。只有serv + web才生成同源API代理。格式1至3制品须重新构建。旧部署先备份并核对项目名、数据卷和受管凭据，再切换到新的完整部署基线；工具不自动跨项目迁移数据。完整部署仍会按Compose规则清理同项目的旧服务容器，不能仅修改deploy-target.json.directory完成迁移。

迁移已有工程时，先同步 hai.json 的 build.images 名称、Dockerfile 文件名与引用；API workspace 的服务目录、包名和依赖引用统一为 -serv，并重新安装依赖。随后重新构建完整制品；不要仅改归档文件名或手工修改 manifest 冒充新构建。

CLI 的 --project-name 与 SDK 的 DeployAppOptions.projectName 覆盖入口已移除；旧参数会明确报错，请在工程根 package.json.name 维护资源身份。

准备 `.env.<环境>`（例如 `.env.prod`）和项目根 `hai.json`，其中 `build` 描述镜像与桌面构建，`deploy` 描述整个应用的部署。fullstack 的 deploy 参数仍指向 `packages/<项目>-serv`，API workspace 指向 `apps/<项目>-serv`，仅用于扫描运行依赖和模块 YAML；前后端构建与部署配置统一在项目根。

`deploy` 支持 `${变量:回退值}` 与 `HAI_DEPLOY_*` 分层覆盖（例如 `HAI_DEPLOY_PROVIDER_EXPOSE_HOSTPORT`）；父对象可用 JSON 整体覆盖，缺省的 SSH 节点也可由 Schema 已知的叶级变量补齐。高优先级来源的父对象覆盖低层叶字段，同一来源中叶字段优先。SSH 文本保留原值，不把数字密码或前后空格转换成其他类型。

部署 SDK 的环境优先级从高到低为：

- `HAI_DEPLOY_*`：进程 > `.env.<环境>.local` > `.env.<环境>` > 旧 `.env.local` > `.env`。
- 其他模块：进程 > `.env.<环境>.local` > 旧 `.env.local` > `.env.<环境>` > `.env`，保留原有私有凭据优先级。

新保存的连接和中间件凭据写入忽略 Git 的 `.env.<环境>.local`；公共后端和地址保留在 `.env.<环境>`。旧 `.env.local` 继续作为共享兼容回退，不自动迁移或删除；所选环境明确的部署目标优先。按环境私有文件仅由部署 SDK 加载，Core 的普通应用加载规则不变。构建不加载部署环境和密钥。

已有项目需把原构建对象移入 `hai.json.build`，把原部署 YAML 转成 JSON 放入 `hai.json.deploy`，删除原文件并保留现有 `HAI_DEPLOY_*` 变量。已有自建 S3 的项目首次升级必须全量部署：旧成功基线仍含已退出的一次性初始化服务，直接使用新增量包会被依赖存活检查拒绝；全量部署同时刷新中间件环境中的 `createBucket`，之后即可继续增量更新。

直接部署时，向导按说明补齐服务器、SSH 用户、认证方式和端口等缺失配置，完整有效配置直接复用；`--yes` 不重复询问。SSH 支持 `auth: key`（私钥/agent）或 `auth: password`。省略 `auth` 时，仅非空 `password` 启用密码方式，否则保留 key/agent；显式 `key` 忽略残留密码。密码输入不回显并保留前后空格、前导零；有效密码不得包含 CR/LF/NUL，UTF-8 最多 1023 字节。私钥只保存路径，不读取或复制私钥内容。

SSH 参数保存到选中环境的 `.env.<环境>.local`。`--bundle-only` 在构建和中间件配置后、打包前的最后一个交互步骤询问是否添加或修改 SSH 信息，保存到相同的私有文件，并用于本次及后续交付的 `deploy-target.json`；选择跳过则复用已有连接，缺项仍可在上传前补到 target。`--yes` 不询问，直接复用已有配置。修改某包的 target 只影响本包，不回写工程；新包仍从工程保存的环境配置生成。

#### 按应用真正需要的中间件处理

根据锁文件运行依赖和模块配置识别数据库、缓存、文件存储、向量库、LDAP、邮件等。逐项选择默认、自定义或保持。目标环境已有完整配置时，`--yes` 保持原值，不重新输入或重复云开通；交互模式仍可选择本次处理范围。配置完备可用 `--skip-middleware` 跳过向导和开通。SQLite、Memory cache、本地存储不产生外部镜像；Compose 自建服务的镜像自动加入完整交付包。外部服务仍需目标网络可达，云开通不属于完全离线部署。

默认和自定义模式均保留同后端的有效配置，包括表单未展示的连接池、操作日志、存储公开端点/前缀、Redis 重试和向量检索选项。自建与云开通仅重新定稿实际连接和认证；旧 URL、TLS/集群模式与凭据不能覆盖新服务，SMTP 发件人和 LDAP 属性映射继续保留。切换后端时清除不兼容字段。旧向导已保存的缺字段父 JSON 不会自动恢复：须从原配置或备份补回最高优先级 `HAI_STORAGE` 中的 `publicEndpoint` 等字段，再重新打包部署；只改被父 JSON 覆盖的 YAML/叶变量无效。

#### 私有对象存储直连

自建 S3 的 `endpoint` 使用 Compose 内部地址，浏览器地址用 `_storage.yml` 的 `publicEndpoint` 配置，例如 `https://app.example.com/delivery/files`。Nginx 对外开放 `/delivery/files/<bucket>/...`，去掉 `/delivery/files` 后将原始桶 URI、签名查询与 Host 直接转发 storage:9000，文件不经过 Serv；省略目录时继续使用根桶路径。入口可位于网站目录内，API/资源/健康路径冲突会在打包前失败。存储端口与控制台不公开，对象缓冲和签名日志关闭；S3 负责私有桶授权和跨源 CORS。外层代理须保留完整入口路径与 Host，只由 SDK 网关去掉前缀。

自建配置保留 bucket/region/prefix/publicEndpoint/publicUrl/operationLog，只替换内部连接与托管凭据。首次增加网关或改变这些访问设置须全量部署，增量预检按配置摘要拒绝不一致；普通应用/存储增量刷新保留代理的服务 DNS，失败恢复使用旧拓扑。外部/保持连接不生成本地存储路由，Local 不公开私有目录。详见[存储配置手册](../../docs/usage/configuration/data.md#配置人员区分三个访问地址)。

#### deploy 的可选参数

| 参数                  | 用途                                                       |
| --------------------- | ---------------------------------------------------------- |
| `--env` / `--env-dir` | 环境和环境文件目录                                         |
| `--build`             | 先构建选中应用镜像，再打包部署；可结合 bundle-only         |
| `--services`          | 只更新指定 Compose 服务，例如 web、serv、serv,web、storage |
| `--artifact-dir`      | 精确选择已构建制品                                         |
| `--bundle-only`       | 只生成 tar 和跨平台脚本，不连接服务器                      |
| `--runtime`           | 本地构建及中间件镜像导出引擎                               |
| `--output`            | 自定义部署 tar 路径，相对命令执行目录解析，自动补版本后缀  |
| `--skip-middleware`   | 跳过中间件配置与开通                                       |
| `--yes`               | 无交互使用有效配置；缺必要值明确报错                       |

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

每次交付只生成一个 `.hai/deploy/<环境>/bundle-<项目>-<部署ID>-<版本>/` 目录，外层仅保留 tar、deploy.sh、deploy.ps1、deploy-target.json、read-target.awk、deploy-local.sh 和 README.txt；Compose、运行环境、web.conf 和 manifest.json 仅保存在 tar 内，README 同时记录部署 ID，直接整体复制即可。显式 `--output release-prod.tar` 按命令执行目录生成 `release-prod-<版本>/release-prod-<版本>.tar.gz`，其他文件仍在同一交付目录。包包含所选应用/中间件镜像、服务配置、私有环境、校验和、README 和 apply.sh。运行上传脚本前，先打开操作目录的 `deploy-target.json`，按其中逐项说明修改并核对服务器、SSH 用户和端口、私钥及指纹文件、远程目录等配置。Windows 运行 deploy.ps1，Linux/macOS 运行 deploy.sh；两个脚本均读取该 JSON，通过 SSH 上传后执行同一服务器流程。本机运行 deploy.sh 需 sh、awk、ssh、scp；可用 `sh deploy.sh 主机 [端口] [用户]` 覆盖连接地址，或给 deploy.ps1 传入 `-IdentityFile` 覆盖私钥。两个脚本均支持用 HAI_DEPLOY_IDENTITY_FILE、HAI_DEPLOY_KNOWN_HOSTS_FILE 覆盖私钥及指纹文件路径。换电脑或操作系统后，这些路径必须指向当前电脑上的实际文件。

离线上传支持密钥和密码认证。`deploy-target.json` 只保存认证方式及 `passwordEnv` 名称（默认 `HAI_DEPLOY_PROVIDER_SSH_PASSWORD`），不保存密码值。密码由操作机环境提供，仅传给本次 SSH/SCP 子进程，不进入应用环境、tar 或 manifest；Windows 也可读取用户持久环境。Windows 入口要求 PowerShell 5+ 和 OpenSSH，Linux/macOS 使用 sh、awk、ssh、scp，两者均不需要 Node/pnpm。修改 target 只影响当前交付目录，不回写工程；新交付仍使用工程保存的环境配置。

上传优先复用操作机环境中的密码；未配置或为空时，`deploy.sh` / `deploy.ps1` 会直接要求隐藏输入，并继续本次部署。输入不保存到文件；非交互调用明确失败，不等待输入。Linux/macOS 交互输入需要终端和 `stty`。密码变量名、无效输入及取消均有明确提示。上传显示已接收字节、总字节和百分比，成功后才显示 100%；PowerShell 持续转发 SSH 的脱敏输出。增量发布遇到已停止或 Compose down 的服务时，先用已安装基线和本地镜像恢复，再检查依赖并更新所选服务；恢复失败不会推进 current。

完全隔离的 Linux 服务器上，复制整个交付目录后运行 `sh deploy-local.sh`；脚本自动校验和解包同目录 tar，再调用包内 apply.sh，也可传入部署根目录覆盖默认值。每步检查结果，任何失败返回非零退出码；镜像导入、服务启动和 HTTP 检查分别报告。结果写到服务器部署目录 `result-<部署ID>.json`，只有检查通过才更新 current 成功状态。重复应用同一部署包会明确停止；相同版本重新生成的新包允许发布。已有版本失败时尝试恢复选中的旧容器和配置，保留数据卷及诊断材料；不会回退已写入的业务数据。

离线包的 `manifest.json` 用 `partial` 与 `selectedServices` 明确记录模式和本次服务；执行脚本固化同一选择，不靠文件名猜测。不指定 `--services` 且使用完整构建时为全量；指定 `--services` 或使用部分构建时为增量。增量包必须匹配服务器 `current` 的成功基线，首次安装会拒绝。

服务器使用 util-linux `flock` 对部署根目录的 `.deploy.lock` 持有非阻塞内核锁，覆盖部署和失败恢复。正常前台部署及同步失败恢复收尾、发布终态后显式解锁，后台服务继续运行不阻塞后续部署。锁文件永久保留，禁止删除、替换或按经过时间抢锁；目录所在文件系统须支持 `flock`。HUP/INT/TERM 中断或父 shell 被强杀后，继承文件描述符的活跃子命令继续持锁，所有 holder 退出或服务器重启后才释放。旧 `.deploy-lock` 目录不再参与判锁，也不自动删除；升级前须结束旧版部署进程，勿混用旧包。强杀/断电不会运行恢复 trap，缺少结果文件时执行状态未知：先核对容器、镜像和 `current` 成功基线，再用新部署包恢复，不能把锁释放视为部署成功或副作用已回滚。

#### 失败恢复与发布后回滚

部署前核对自建 `db`、`storage`、`vecdb` 的实际卷与后端家族；禁止把 PostgreSQL 数据卷交给 MySQL、RustFS 数据卷交给 MinIO，或在向量库引擎之间复用原卷。服务器 `<remoteDir>/persistent-backends` 长期记录这些绑定，在任何服务启动前保存；全量移除服务、首次安装失败和自动恢复都不会清掉记录。因此“移除 PostgreSQL → 保留卷 → 再加 MySQL”也会被拒绝。该文件与 `managed-secrets.env`、数据卷成套保护和备份，不得删除或编辑账本强行认领旧卷；这些是部署私有元数据，没有新增公开配置项。

旧部署缺少完整绑定时，只有成功基线中的已知家族、唯一真实服务容器的命名卷挂载和镜像家族一致，才能补证接管。已移除服务留下的未知旧卷不会按名称或密码猜测；需要核实数据并制定独立迁移方案。当前成功基线的卷缺失时停止发布，不自动创建空库。新发布的 `previous-state-backends` 保存已确认的旧绑定，只用于恢复前再次核验；恢复还要求旧卷存在且账本一致，不回退永久账本。

另有明确的[受控凭据导入路径](docs/credential-import.md)：账本尚未认领该卷时，合法 v2 状态必须绑定准确项目、凭据组和卷，并由同项目/服务的唯一运行原容器，以一致的 Docker/Podman 标签、真实 Mounts 和 Config.Image 家族共同补证。缺任一证据仍拒绝，导入不能覆盖已知账本或引擎身份冲突。导入不建立成功基线；没有 `current` 时，首次接管必须用当前 CLI 生成**新 ID 的完整全量包**，成功后才可增量。

这些身份检查在 **SSH 目标 Linux 服务器**执行 `apply.sh` 时生效：使用固定 SSH 用户、固定本地 daemon/store，Docker 要求默认 context，Podman 要求实际本地模式；远程连接与显式存储覆盖环境会被拒绝。生产建议显式设置 `remote.runtime` 为已验收的 `docker` 或 `podman`。若 `auto` 因新装 Podman 换了引擎，应先恢复原 runtime、SSH 用户和存储，再重试；有意更换服务器、daemon 或数据存储则单独迁移，不能用相同 uid 或目录名证明数据兼容。Windows/macOS 操作机通过 Docker Desktop 或 Podman VM 构建、打包再 SSH 发布不受这一服务器限制。

此预检比较后端家族，不证明同一引擎跨主版本的数据目录兼容。中间件镜像目前由框架固定版本定义；升级框架前仍需核对引擎升级说明、迁移兼容性与备份。全量发布和以旧制品重新生成的全量回退会清理同项目不再声明的服务容器，保留数据卷；增量保留未选服务。需要保留新版新增服务时，应先评估完整拓扑，再决定回退范围。

自动恢复会按旧发布的配置、端口和健康检查路径启动服务并验证容器与 HTTP。`result-<部署ID>.json` 的 `recoveryStatus` 分别表示 `not-needed`（未执行恢复）、`passed`（旧服务健康通过）、`failed`（恢复或健康验证失败）、`stopped`（首次安装失败后已停止新服务）。失败部署仍返回非零退出码，`current` 保持最后成功发布。恢复失败时保留诊断文件，修复原因后使用新包恢复；不要把 Compose 返回成功当成回滚成功。

已经发布成功但业务验收发现问题时，准备保留的旧完整构建产物，以及匹配的配置、环境和私有参数备份；确认数据库结构与旧应用兼容，或先按业务恢复方案处理数据。恢复对应配置后执行：

```sh
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<previousBuildId>
```

使用当前 CLI，省略 `--build`、`--services`，以旧制品生成新的全量交付包和部署 ID，再执行锁、账本、校验、启动和健康检查。离线环境同样先生成新包再交付；不得用旧工具或重跑旧包绕过保护。旧 buildId 通常保留 serv/web 应用镜像，重新打包的中间件仍按当前 CLI 固定版本规划，不保证精确回退所有中间件版本。发布前应核实主版本、数据目录与 Schema 兼容，保留旧制品、匹配配置、账本、凭据和数据备份。不能仅修改 `current`、删除数据卷或手工覆盖镜像 tag；容器回滚不会撤销已写业务数据、不兼容迁移或外部通知等副作用。

SDK 在服务器本地健康通过并提交 `current` 后，还从操作机检查公开地址。若这一步因网络、防火墙或入口代理失败，返回失败并保留 `remoteStage: 'complete'`、`remoteExitCode: 0`，服务器上的发布可能已成功。先核对匹配结果与实际入口，不能直接重复部署或自动回滚。

#### 完全离线前再核对一次

- 完整 tar 已含自建中间件归档，镜像架构与服务器一致；服务器启动不访问 registry。
- Linux 已安装 Docker/Podman、可执行的 Compose、sh、tar、sha256sum、awk、curl、util-linux 的 flock；用户有目录与容器权限。
- 包含私有配置，安全搬运，不提交 Git；持久化卷身份跨版本稳定。
- 实际断外网验证启动、登录、页面刷新、重启与数据持久化。生产 HTTPS、证书、DNS 和外部服务需另行准备。

### 构建与交付优化

镜像默认最多并行两项，`--concurrency 1` 可降低资源占用。Dockerfile 在复制源码前安装依赖；前后端仅复制各自必要源码，复用安装层和驱动缓存。运行镜像移除应用自身的声明文件、源码映射和说明文件。打包按镜像内容 ID 复用并校验中间件归档，复制应用镜像时同时计算摘要。默认交付压缩为 `.tar.gz`，显式 `--output release.tar` 可保留未压缩格式；README 仅保留外层一份。成功部署后清理本次 incoming 上传和解包目录，release 保留恢复配置和状态，镜像由容器引擎保存。

### 可选 HTTPS 证书

`pnpm run deploy` 为所有容器模板统一提供“不启用 / 已有 PEM 证书和私钥路径 / Let’s Encrypt”。相对路径以工程根为基准，已有证书校验域名、有效期和密钥匹配后复制到私有发布包。Let’s Encrypt 使用固定版本官方 Certbot 镜像申请，每 12 小时检查续期，Nginx 自动重载。需要确认服务条款、真实邮箱、公网 DNS、80 端口和 CA 网络；隔离环境使用已有证书。证书状态保留在服务器，私钥不进入应用镜像。`--yes` 复用保存配置。

配置为 `hai.json.deploy.provider.expose.https`，也可用环境私有文件覆盖。默认 HTTPS 443、HTTP 跳转开启，未配置保持 HTTP；启停或更改模式、域名、端口、本地证书需全量部署。配置和续期边界见[HTTPS 手册](../../docs/usage/configuration/delivery.md#可选https证书)。`--plan` 的 `root` 表示工程根，`serviceDir` 表示部署服务源码与配置目录，仅显示公开证书元数据。

### SDK

```ts
import { deploy } from '@h-ai/deploy'

const initialized = await deploy.init({ provider: { type: 'docker-ssh', expose: { hostPort: 18080 } } })
if (!initialized.success)
  throw new Error(initialized.error.message)
try {
  const result = await deploy.deployApp('./packages/demo-serv', {
    environment: 'prod',
    envDir: '.',
    bundleOnly: true,
    artifactDir: './.hai/build/docker/<buildId>',
    runtime: 'auto',
  })
  if (!result.success)
    throw new Error(result.error.message)
  // result.data.bundlePath / instructions; packaged does not mean server ready.
}
finally {
  await deploy.close()
}
```

`selectedServices: ['web']` 选择局部更新，`onProgress` 返回打包与服务器执行阶段。`deploy.scan` 和 `deploy.credentials.*` 可在初始化前使用。先判断 HaiResult.success 再读取数据。Vercel 使用 prebuilt API 上传已有 .vercel/output，需要网络，不提供离线交付或 Compose 局部发布。

命令执行按正确解码的 UTF-8 逻辑流脱敏，已知秘密即使跨 stdout/stderr 数据块也不会原样释放；成功捕获结果、错误与进度回调遵循同一边界。调用内部命令工具时用 `secrets` 明确列出敏感字面量；编码、截取或转换后的值须单独列入。每条流默认仅捕获最后 1 Mi 字符，`maxCaptureChars` 可设 1～16 Mi 字符，结果用 `stdoutTruncated` / `stderrTruncated` 标记截断，解析结构化输出前必须检查。`onOutput` 可异步，按序等待并保留 pipe 背压，收到的是全部安全 stdout；部署进度仅解析每行前 512 字符。秘密总长度最多 1 Mi UTF-16 单元，超限或脱敏异常失败关闭；超时表示命令执行失败，远程进程终止仍需确认。

命令 deadline 包含 helper 启动和输出处理；超时、输入/输出或回调异常会终止受管理进程。POSIX 使用独立进程组，Windows 通过内嵌 PowerShell/.NET Job Object 先挂起创建、成功分配后恢复，禁止 breakaway；helper、编译或分配失败不会降级为裸进程。Windows 需要系统 PowerShell 和 Add-Type，调用隐藏窗口且不加载用户 profile，参数、环境与 UTF-8 管道保持原样。POSIX 命令须让后代继承进程组；已脱离组的系统守护进程及远端服务不在本地终止确认范围。

`terminationTimeoutMs` 是异常后的独立核验等待，默认 10000、最大 60000 毫秒。发送 kill 不等于确认；结果在受管理 Job/进程组归零后记录 `localTermination: 'confirmed'`，核验超时或失败为 `unknown`，尚未启动为 `not-started`。在 `if (!result.success)` 分支调用公开 `getDeployCommandState(result.error)` 读取原因和状态；不含原始异常或命令参数。已经进入的异步输出回调不能撤销，异常后不再交付新输出。

SSH 中断始终先记 `remoteExecution: 'unknown'`。docker-ssh SDK 用新连接只读核对 `result-<deploymentId>.json`，仅完整、未截断且 ID 匹配的终态记录可确认 `finished`，同时给出真实阶段及退出码；脚本结束不表示容器停止。即使终态退出码为 0，原 SSH/输出失败仍保留为失败，避免丢失回执被伪装成成功。CLI 分别显示本地和远端状态及结果路径；缺结果、旧 ID、损坏内容或重连失败均保持未知，不自动重跑发布或回滚。手工上传脚本在 SSH 失败时保守提示未知和核对目录，部署 ID 见包内 manifest。先核对步骤文件、`current`、真实服务与数据，再决定恢复。

### 运行环境文件与重复部署

Node 后端（Serv / SvelteKit SSR）默认在每次启动时重读发布目录的 `.env.runtime`，修改后 `docker restart <容器名>` 或 `podman restart <容器名>` 即可，无需重建镜像或额外 override。旧部署先用新版 CLI 发布一次。删除的字段不会从旧 Compose 注入中复活；服务器托管连接的 `middleware.env` 保持原有更高优先级，私有代理标记和 Node 启动参数仍由部署装配管理。静态 Web、中间件、端口/挂载、Nginx 路由与限额不在该重载范围；改变网关路径、端口或挂载时使用全量部署。手工修改需备份；下一次后端发布会从工程环境重新生成，需要长期保留的配置同步回源环境。

框架持久配置使用 `HAI_*` 命名。`POSTGRES_*`、`MYSQL_*`、`RUSTFS_*`、`MINIO_*`、`LDAP_*` 是中间件镜像的原生协议，必须保留原名，但只生成到私有的 `middleware-runtime.env` 并由中间件容器加载；不再写入工程环境文件或应用的 `.env.runtime`。应用增量部署沿用的 `middleware.env` 仅保存框架 `HAI_*` 配置。旧工程已保存的这些原生字段不会被自动删除，新应用环境会忽略它们；新包与旧成功基线可共存，旧服务仍读取其原交付文件。

自建或云开通的整体 `HAI_*` 配置会清除被替换的旧叶字段，例如 Redis 覆盖后不再留下 `HAI_CACHE_TYPE=memory`。全局 `~/.hai/credentials.yml` 只补缺项，不能覆盖当前环境/进程的同名键或父配置。部署先启动选中中间件，等待 PostgreSQL/MySQL/Redis/S3 健康，再启动 serv/Web；增量和失败恢复沿用此顺序，未选容器保持不变。

Podman 部署会主动执行容器已有的 healthcheck 并重新核对状态，不依赖 systemd 自动调度；当前探测失败时，即使旧状态为 `healthy` 也不能放行 app 启动。

分批启动仅在首批清理孤立容器，后续 serv/Web 启动保留已经就绪的中间件。

生成时为 `.env.dev/.env.test/.env.prod` 分别生成独立的初始管理员密码和传输密钥环；环境文件随项目提交，克隆后可共享，并可通过本机私有文件或进程环境覆盖。启用 transport 的应用缺少/错误配置 `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` 时，部署在上传前指出配置来源；同一环境的所有节点复用同一有效密钥环，可直接加载环境文件，也可通过 Secret Manager 覆盖；不为每个节点临时生成。CLI 完成部署后提示 `HAI_ADMIN_DEFAULT_PASSWORD` 的实际来源，不打印密码，不依赖日志级别；该密码仅在首次创建管理员时生效。 离线入口也会提示服务器私有 `.env.runtime` 中的密码变量位置。

每次交付仍生成 `.hai/deploy/<环境>/bundle-.../.env.runtime`，供后端启动预加载（静态 Web 仍用 Compose env_file）；它是生成产物，不是配置记忆源。`NODE_ENV` 默认随目标环境选择：`test` → `test`，`dev/development` → `development`，`prod/production` 及其他模式 → `production`。环境文件中显式设置的 `NODE_ENV` 仍优先于该默认值；`--build` 的构建优化模式不决定运行环境。旧交付包不会自动改写，需重新打包。

项目根 `hai.json.deploy` 保存部署结构，`.env.<环境>` 保存公共配置，`.env.<环境>.local` 保存 SSH 及中间件秘密值。环境文件默认来自项目/workspace 根，`--env-dir` 可指定目录。完整配置后可使用 `pnpm run deploy --env test --build --bundle-only --yes` 无交互复用；只想保留现有中间件配置时追加 `--skip-middleware`。交互式仅打包会在最后询问是否保存或修改 SSH 信息；修改交付目录的 `deploy-target.json` 不会回写工程。

自建中间件的密码由服务器 `<remoteDir>/managed-secrets.env` 持久保存（权限 0600），应与数据卷一起备份。每次打包只生成首次初始化的随机候选，不依赖打包机缓存；在线 SDK、deploy.sh、deploy.ps1 和 deploy-local.sh 都在部署锁内复用服务器值，同时更新应用连接配置及中间件原生变量。交付 tar 保持不可变，只有服务器私有运行文件使用定稿值。若状态缺失而对应数据卷已存在，部署在变更服务前明确停止，须恢复服务器凭据备份；不会自动换密或删除数据。旧版本可通过显式预检和凭据导入流程迁移，缺状态的普通部署仍拒绝。

## 请求策略文件与可信代理

Serv 的 `http.access`、SvelteKit 的 `access` 可引用独立 yml/yaml。部署读取应用实际生效配置，包括 `.env.<环境>` / 私有覆盖中的 `HAI_SERV`、`HAI_SERV_HTTP_ACCESS` 或 `HAI_KIT_ACCESS`，校验文件后把规范化快照放入交付包。运行环境改为 `/run/hai/request-access.yml`，Compose 只读挂载；工程的原始文件引用不会被容器路径覆盖。快照参加 SHA-256 校验，无效或缺失文件在上传前失败。待上传的归档和其中的策略快照参与完整性校验，不应手工修改；替换 SDK 策略快照时重新打包部署。已部署 Node 后端挂载的 `.env.runtime` 可以按“运行配置重载”修改并重启，改变内联规则不会重写策略快照或 Nginx 配置。

全量与包含后端的增量都交付自己的快照；仅更新前端时保留后端原挂载。失败恢复使用旧成功发布的 Compose 和策略文件。运行账号无需 root：发布目录私有，策略文件在受限目录内以只读权限供容器读取。回滚镜像和策略不撤销数据库迁移或已经产生的业务效果。

如需由运维独立改规则、重启后生效，可在交付之外管理只读文件，并用 Compose override 替换同一 `/run/hai/request-access.yml` 挂载。该外部文件不参与 SDK 自动回滚，首次附加挂载需要重新创建容器；后续文件修改后重启即可。自行维护且只用 Compose `env_file` 注入环境的容器，修改该文件仍需重新创建，通常无需重建镜像；这与 SDK 默认挂载读取的后端 `.env.runtime` 不同。步骤与验证边界见[独立文件重启配置](../../docs/usage/configuration/request-access.md#44-运维独立管理文件修改后重启生效)。

受管 Compose 只有存在 Web/gateway 代理且后端没有公开端口时，才设置 `HAI_DEPLOY_PRIVATE_PROXY=1`。Serv/Kit 默认 `trustedProxies: auto` 在此采用容器网段，其他宿主默认忽略转发头。生成 Nginx 用实际对端覆盖客户端提交的转发头；外层负载均衡需在 Docker SSH Provider 的 `trustedEdgeProxies` 显式配置真实 IP/CIDR，省略时不信任上游，`[]` 同样关闭信任。根本未传到 Nginx 的源 IP 无法恢复，Podman rootless 等环境应实际核验入口日志。完整示例和验证步骤见[请求访问控制手册](../../docs/usage/configuration/request-access.md)。

## 只读部署计划

`createDeploymentPlan(appDir, config, options)` 不初始化 Provider、不生成中间件凭据、不创建输出目录、不连接目标。复用实际扫描、环境解析、资源名称与制品 checksum 校验，返回工程根 `root`、部署服务目录 `serviceDir`、版本、构建 ID、范围、保留服务、配置文件与变量名、基线要求和恢复目录，省略所有变量值与 SSH 凭据。远端 current 未读取时明确 not-inspected；局部更新仍由执行端严格要求成功基线。Compose 恢复不会回退数据库数据或迁移。CLI 对应 `hai deploy --env prod --plan`。

需要目标基线事实时使用 `--plan --inspect-remote`（SDK inspectRemote:true），仅通过 SSH 读取 current 及成功发布目录，报告 verified/missing/unavailable 和实际恢复发布 ID，不写目标。

资源清单复用执行端的完整 sidecar 拓扑：`containers` 只列本次选中的显式容器名，LDAP/SMTP 等由 Compose 命名的服务列在 `composeManagedServices`；自建 S3 的 SSR/API gateway 也会列入实际更新或保留范围。`logicalVolumes` 是完整拓扑的 Compose 逻辑卷声明，包含保留服务和应用继续挂载的数据卷，不表示新建或重建这些卷；实际引擎卷名由 Compose 项目作用域决定。未选中间件的 action 为 keep，云开通仅按实际选择范围计算，不展示凭据值。

## 容量一致性与旧凭据导入

传输明文上限保留显式设置；反馈需求超过显式值时拒绝打包并说明冲突。缺省/auto 才按模块预算推导，Web 代理和 Kit BODY_SIZE_LIMIT 使用同一密文预算。计划的 target.runtime 表示远端 provider.remote.runtime，与本地镜像打包 options.runtime 分离；auto 不冒充已探测事实。

旧目标可用 `importDeploymentSecrets({ directory, inputFile, runtime })` 或在服务器执行 `hai deploy-secrets <directory> --import <private.json>` 只读核验；显式 `--apply` / dryRun:false 才导入。工具核验项目、容器、卷和实际服务凭据，不猜测旧包、不轮换密码、不重建服务。新 v2 状态支持特殊字符并与部署共用 flock，原子写入权限 0600。常规离线部署无需服务器 Node；一次性导入工具需要受支持的 Node 与已安装的 CLI/deploy。详见[导入与恢复流程](docs/credential-import.md)。

## 开发测试

```sh
pnpm --filter @h-ai/deploy typecheck
pnpm --filter @h-ai/deploy lint
pnpm --filter @h-ai/deploy build
pnpm --filter @h-ai/deploy test
pnpm --filter @h-ai/deploy test:e2e
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:deploy-gates
```

真实部署按 API、SSR、静态移动前端和 fullstack 选取代表：admin 覆盖 website/h5 共用的 SSR Dockerfile 与生产部署分支；各应用类型仍由八个 scaffold 场景分别安装、编译并执行 HTTP/浏览器验收。scaffold 与生成路由 runtime 按实测资源争用分批顺序执行，三个轻型 CLI 门禁可与 runtime 在最多两个 worker 内并行；生成场景复用 E2E 自带完整构建，保留生产构建隔离及真实产物检查。CLI 部署门禁保留认证/传输、增量更新、损坏制品和回滚，并用生产同版本 Nginx 对公开部署包执行 `nginx -t`。测试夹具通过 init 回收孤儿进程，并验证真实 PID 消失。

验证真实生成项目与 SSH/人工部署，覆盖禁止访问镜像仓库、局部更新、归档损坏、同版本发布和健康失败。finally/teardown 只清理本次测试创建的项目、镜像、容器、日志和进程。

`test:e2e` 构建当前包，并在子进程中启用、串行执行锁与进程两组真实 Linux 门禁，根 `pnpm e2e` 也包含此入口。需要可连接的 Podman（优先）或 Docker，运行公开 API 生成的 `apply.sh`，验证并发、父进程强杀后的子进程持锁、全部进程退出和重启恢复。Compose/HTTP 使用确定性夹具，不能替代真实容器服务部署验收。

进程门禁运行 `pnpm --filter @h-ai/deploy exec vitest run tests/deploy-command-process.test.ts tests/deploy-secret-masker.test.ts`。设置同一 `HAI_DEPLOY_E2E=1` 后运行 `tests/deploy-command-runtime.e2e.test.ts`，先构建 deploy；它使用真实 Linux、OpenSSH 和发布 dist，验证远端继续执行/完成回执以及本地进程组。该夹具需联网安装 sshd；Compose/HTTP 为确定性夹具，发布 deadline 缩短为 2500 毫秒，并注入暂停消费模拟丢失回执。

部署夹具先检查固定公开基础镜像，仅明确缺失时拉取，可沿用 HAI_DEPLOY_E2E_MIRROR；公共缓存不进入清理账本。成功 create 后先登记容器 ID，再在其私有 PID namespace 内异步安装 APT/pip 并启动 sshd。准备失败、超时或合作式取消会等待本地客户端退出，按已登记 ID 回收并确认消失；仅重型嵌套 Podman 夹具使用特权。HAI_DEPLOY_E2E_APT_MIRROR 只接受镜像站主机名并保留 HTTPS。拥有权测试用固定公开镜像的本轮私有 tag，保留同内容外部 tag、重指向保护、动态端口和外部 sentinel 检查。create 回执丢失且未获得可信 ID、测试进程被强制终止等情况仍需记录未知状态，不能按名称或 label 认领清理。

## 许可证

Apache-2.0
