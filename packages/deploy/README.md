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

```sh
pnpm build
pnpm build --target docker
pnpm build --target docker --images web
pnpm build --target desktop --platform windows --arch x64
```

源码编译、镜像构建、桌面打包分别对应 compile/docker/desktop。构建不选择部署环境、不注入运行期密钥。原生安装包在对应操作系统准备 SDK 与 Rust 工具链后构建。

#### build 的可选参数

| 参数                       | 用途                                    |
| -------------------------- | --------------------------------------- |
| `--target`                 | compile（默认）、docker、desktop        |
| `--images`                 | app、web 或 app,web；只构建导出所选镜像 |
| `--runtime`                | auto（优先 Podman）、podman、docker     |
| `--network`                | 容器构建网络，默认引擎设置              |
| `--no-http-proxy`          | Podman 构建不继承本机代理               |
| `--sqlite-prebuild-mirror` | SQLite 预编译包的可信 HTTP(S) 根地址    |
| `--platform` / `--arch`    | 原生安装包的系统与架构                  |

#### 用 hai.json 描述要打什么包

```json
{
  "build": {
    "images": [
      {
        "name": "app",
        "context": ".",
        "dockerfile": "images/app.Dockerfile",
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

版本来自应用根 package.json.version。制品位于 `.hai/build/docker/<buildId>/`，包括格式版本 3 的 manifest.json、所选镜像 tar 和 SHA-256；partial 标识部分构建，hasWeb 保留工程拓扑。清单还会记住配置中填写的 app/web 容器端口（appContainerPort、webContainerPort），只打包一个镜像也不会丢掉另一个的端口；没填写则沿用部署默认值。相同应用版本允许重建，构建编号和镜像引用区分实际内容；全部导出成功才更新本机构建入口。基础镜像、中间件及工具使用明确版本，不使用 latest。

### 部署到环境

#### 先准备环境与部署目标

准备 `.env.<环境>`（例如 `.env.prod`）和项目根 `hai.json`，其中 `build` 描述镜像与桌面构建，`deploy` 描述整个应用的部署。fullstack 的 deploy 参数仍指向 `packages/<项目>-serv`，API workspace 指向 `apps/<项目>-service`，仅用于扫描运行依赖和模块 YAML；前后端构建与部署配置统一在项目根。

`deploy` 支持 `${变量:回退值}` 与 `HAI_DEPLOY_*` 分层覆盖（例如 `HAI_DEPLOY_PROVIDER_EXPOSE_HOSTPORT`）；父对象可用 JSON 整体覆盖，缺省的 SSH 节点也可由 Schema 已知的叶级变量补齐。高优先级来源的父对象覆盖低层叶字段，同一来源中叶字段优先。SSH 文本保留原值，不把数字密码或前后空格转换成其他类型。

部署 SDK 的环境优先级从高到低为：

- `HAI_DEPLOY_*`：进程 > `.env.<环境>.local` > `.env.<环境>` > 旧 `.env.local` > `.env`。
- 其他模块：进程 > `.env.<环境>.local` > 旧 `.env.local` > `.env.<环境>` > `.env`，保留原有私有凭据优先级。

新保存的连接和中间件凭据写入忽略 Git 的 `.env.<环境>.local`；公共后端和地址保留在 `.env.<环境>`。旧 `.env.local` 继续作为共享兼容回退，不自动迁移或删除；所选环境明确的部署目标优先。按环境私有文件仅由部署 SDK 加载，Core 的普通应用加载规则不变。构建不加载部署环境和密钥。

已有项目需把原构建对象移入 `hai.json.build`，把原部署 YAML 转成 JSON 放入 `hai.json.deploy`，删除原文件并保留现有 `HAI_DEPLOY_*` 变量。已有自建 S3 的项目首次升级必须全量部署：旧成功基线仍含已退出的一次性初始化服务，直接使用新增量包会被依赖存活检查拒绝；全量部署同时刷新中间件环境中的 `createBucket`，之后即可继续增量更新。

直接部署时，向导按说明补齐服务器、SSH 用户、认证方式和端口等缺失配置，完整有效配置直接复用；`--yes` 不重复询问。SSH 支持 `auth: key`（私钥/agent）或 `auth: password`。省略 `auth` 时，仅非空 `password` 启用密码方式，否则保留 key/agent；显式 `key` 忽略残留密码。密码输入不回显并保留前后空格、前导零；有效密码不得包含 CR/LF/NUL，UTF-8 最多 1023 字节。私钥只保存路径，不读取或复制私钥内容。

SSH 参数保存到选中环境的 `.env.<环境>.local`。`--bundle-only` 不询问 SSH，已有连接会带入交付目录；缺少的参数可在上传前补到 `deploy-target.json`。修改某包的 target 只影响本包，不回写工程；新包仍从工程保存的环境配置生成。

#### 按应用真正需要的中间件处理

根据锁文件运行依赖和模块配置识别数据库、缓存、文件存储、向量库、LDAP、邮件等。逐项选择默认、自定义或保持。目标环境已有完整配置时，`--yes` 保持原值，不重新输入或重复云开通；交互模式仍可选择本次处理范围。配置完备可用 `--skip-middleware` 跳过向导和开通。SQLite、Memory cache、本地存储不产生外部镜像；Compose 自建服务的镜像自动加入完整交付包。外部服务仍需目标网络可达，云开通不属于完全离线部署。

#### deploy 的可选参数

| 参数                  | 用途                                                      |
| --------------------- | --------------------------------------------------------- |
| `--env` / `--env-dir` | 环境和环境文件目录                                        |
| `--build`             | 先构建选中应用镜像，再打包部署；可结合 bundle-only        |
| `--services`          | 只更新指定 Compose 服务，例如 web、app、app,web、storage  |
| `--artifact-dir`      | 精确选择已构建制品                                        |
| `--bundle-only`       | 只生成 tar 和跨平台脚本，不连接服务器                     |
| `--runtime`           | 本地构建及中间件镜像导出引擎                              |
| `--output`            | 自定义部署 tar 路径，相对命令执行目录解析，自动补版本后缀 |
| `--skip-middleware`   | 跳过中间件配置与开通                                      |
| `--yes`               | 无交互使用有效配置；缺必要值明确报错                      |

#### 两机连通：直接部署

```sh
pnpm run deploy --env prod --build
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<buildId>
pnpm run deploy --env prod --build --services web
```

部分更新需要服务器已有成功的完整安装，并且端口、应用布局相同。以服务器成功状态为基线，只替换选中的镜像和配置，保留其他服务、连接与卷。部署脚本先按项目和服务名移除选中的旧容器（保留数据卷），再执行 `compose up -d --no-deps --no-build --pull never --no-recreate web` 创建新容器；其他容器保持运行，不执行整个项目 down。首次安装使用完整包。自建 S3 的桶由应用的 `storage.init()` 按可选 `createBucket` 初始化。

命令中的 `-d` 表示后台启动，`--no-deps` 不连带启动或重启依赖，`--no-build` 不在服务器编译，`--pull never` 禁止拉取镜像，`--no-recreate` 保留仍存在的容器；选中的旧容器已由脚本移除，因此会创建新容器，末尾 `web` 是 Compose 服务名（不是镜像标签）。多个服务用空格分隔。

S3 的 `createBucket` 默认为 `false`；部署器为自建 S3 注入 `HAI_STORAGE_CREATEBUCKET=true`，应用初始化时检查并创建缺失的桶，已有桶保持不变。外部 S3 由用户决定是否启用。Compose 使用 `hai-app` 网络，不生成 YAML 锚点。只更新 `storage` 无须应用镜像；新的桶在下次应用初始化时创建。

#### 两机不通：生成包，手工复制

```sh
pnpm run deploy --env prod --build --bundle-only
```

每次交付只生成一个 `.hai/deploy/<环境>/bundle-<项目>-<部署ID>-<版本>/` 目录，tar、Compose、环境、web.conf、清单与跨平台脚本全部在其中，直接整体复制即可。显式 `--output release-prod.tar` 按命令执行目录生成 `release-prod-<版本>/release-prod-<版本>.tar`，其他文件仍在同一交付目录。包包含所选应用/中间件镜像、服务配置、私有环境、校验和、README 和 apply.sh。运行上传脚本前，先打开操作目录的 `deploy-target.json`，按其中逐项说明修改并核对服务器、SSH 用户和端口、私钥及指纹文件、远程目录等配置。Windows 运行 deploy.ps1，Linux/macOS 运行 deploy.sh；两个脚本均读取该 JSON，通过 SSH 上传后执行同一服务器流程。本机运行 deploy.sh 需 sh、awk、ssh、scp；可用 `sh deploy.sh 主机 [端口] [用户]` 覆盖连接地址，或给 deploy.ps1 传入 `-IdentityFile` 覆盖私钥。两个脚本均支持用 HAI_DEPLOY_IDENTITY_FILE、HAI_DEPLOY_KNOWN_HOSTS_FILE 覆盖私钥及指纹文件路径。换电脑或操作系统后，这些路径必须指向当前电脑上的实际文件。

离线上传支持密钥和密码认证。`deploy-target.json` 只保存认证方式及 `passwordEnv` 名称（默认 `HAI_DEPLOY_PROVIDER_SSH_PASSWORD`），不保存密码值。密码由操作机环境提供，仅传给本次 SSH/SCP 子进程，不进入应用环境、tar 或 manifest；Windows 也可读取用户持久环境。Windows 入口要求 PowerShell 5+ 和 OpenSSH，Linux/macOS 使用 sh、awk、ssh、scp，两者均不需要 Node/pnpm。修改 target 只影响当前交付目录，不回写工程；新交付仍使用工程保存的环境配置。

完全隔离的 Linux 服务器上，复制整个交付目录后运行 `sh deploy-local.sh`；脚本自动校验和解包同目录 tar，再调用包内 apply.sh，也可传入部署根目录覆盖默认值。每步检查结果，任何失败返回非零退出码；镜像导入、服务启动和 HTTP 检查分别报告。结果写到服务器部署目录 `result-<部署ID>.json`，只有检查通过才更新 current 成功状态。重复应用同一部署包会明确停止；相同版本重新生成的新包允许发布。已有版本失败时尝试恢复选中的旧容器和配置，保留数据卷及诊断材料；不会回退已写入的业务数据。

离线包的 `manifest.json` 用 `partial` 与 `selectedServices` 明确记录模式和本次服务；执行脚本固化同一选择，不靠文件名猜测。不指定 `--services` 且使用完整构建时为全量；指定 `--services` 或使用部分构建时为增量。增量包必须匹配服务器 `current` 的成功基线，首次安装会拒绝。

服务器使用 util-linux `flock` 对部署根目录的 `.deploy.lock` 持有非阻塞内核锁，覆盖部署和失败恢复。正常前台部署及同步失败恢复收尾、发布终态后显式解锁，后台服务继续运行不阻塞后续部署。锁文件永久保留，禁止删除、替换或按经过时间抢锁；目录所在文件系统须支持 `flock`。HUP/INT/TERM 中断或父 shell 被强杀后，继承文件描述符的活跃子命令继续持锁，所有 holder 退出或服务器重启后才释放。旧 `.deploy-lock` 目录不再参与判锁，也不自动删除；升级前须结束旧版部署进程，勿混用旧包。强杀/断电不会运行恢复 trap，缺少结果文件时执行状态未知：先核对容器、镜像和 `current` 成功基线，再用新部署包恢复，不能把锁释放视为部署成功或副作用已回滚。

#### 完全离线前再核对一次

- 完整 tar 已含自建中间件归档，镜像架构与服务器一致；服务器启动不访问 registry。
- Linux 已安装 Docker/Podman、可执行的 Compose、sh、tar、sha256sum、awk、curl、util-linux 的 flock；用户有目录与容器权限。
- 包含私有配置，安全搬运，不提交 Git；持久化卷身份跨版本稳定。
- 实际断外网验证启动、登录、页面刷新、重启与数据持久化。生产 HTTPS、证书、DNS 和外部服务需另行准备。

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

每次交付仍生成 `.hai/deploy/<环境>/bundle-.../.env.runtime`，供 Compose 加载运行配置；它是生成产物，不是配置记忆源。`NODE_ENV` 默认随目标环境选择：`test` → `test`，`dev/development` → `development`，`prod/production` 及其他模式 → `production`。环境文件中显式设置的 `NODE_ENV` 仍优先于该默认值；`--build` 的构建优化模式不决定运行环境。旧交付包不会自动改写，需重新打包。

项目根 `hai.json.deploy` 保存部署结构，`.env.<环境>` 保存公共配置，`.env.<环境>.local` 保存 SSH 及中间件秘密值；自建中间件的稳定随机凭据另缓存于服务扫描目录的 `.hai/deploy/runtime/<项目名>-<环境>.secrets.json`，不要删除该文件后直接复用旧数据卷。环境文件默认来自项目/workspace 根，`--env-dir` 可指定目录。完整配置后可使用 `pnpm run deploy --env test --build --bundle-only --yes` 无交互复用；只想保留现有中间件配置时追加 `--skip-middleware`。首次仅打包不会收集 SSH 信息，需先在工程配置连接；修改交付目录的 `deploy-target.json` 不会回写工程。

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
