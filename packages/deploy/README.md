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

部署生成的 `web.conf` 在 API location 设置 `client_max_body_size 2129920`（2 MiB + 32 KiB），并关闭 `proxy_request_buffering` / `proxy_buffering`。这允许 transport 的 1 MiB 明文经编码形成密文后通过，应用仍逐块执行更细的握手 JSON 16 KiB、公钥 4 KiB、明文 1 MiB 预算。自有反向代理须允许该密文预算并传递取消，不能用增大代理上限代替 serv/kit 的有界读取；大文件上传走明确的独立路径和体积策略。

无正文认证封装通过 X-Hai-Transport 头传输，生成配置使用 large_client_header_buffers 4 32k 与 proxy_buffer_size 32k 容纳头字段；自有代理也须允许并保留该头。

构建器将锁文件、包配置、本地归档和补丁准备为 `images/dependencies/` 输入，结合 pnpm store 缓存与 Docker 分层复用下载。源码修改不应重新下载全部依赖；缓存为空仍能联网构建。Windows node_modules 不用于 Linux 镜像。完全离线构建还需预先准备基础镜像、工具链和匹配 ABI/架构/libc 的原生预编译包。

版本来自应用根 package.json.version。制品位于 `.hai/build/docker/<buildId>/`，包括格式版本 3 的 manifest.json、所选镜像 tar 和 SHA-256；partial 标识部分构建，hasWeb 保留工程拓扑。清单还会记住配置中填写的 app/web 容器端口（appContainerPort、webContainerPort），只打包一个镜像也不会丢掉另一个的端口；没填写则沿用部署默认值。相同应用版本允许重建，构建编号和镜像引用区分实际内容；全部导出成功才更新本机构建入口。基础镜像、中间件及工具使用明确版本，不使用 latest。

### 部署到环境

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

| 参数                  | 用途                                                     |
| --------------------- | -------------------------------------------------------- |
| `--env` / `--env-dir` | 环境和环境文件目录                                       |
| `--build`             | 先构建选中应用镜像，再打包部署；可结合 bundle-only       |
| `--services`          | 只更新指定 Compose 服务，例如 web、app、app,web、storage |
| `--artifact-dir`      | 精确选择已构建制品                                       |
| `--bundle-only`       | 只生成 tar 和跨平台脚本，不连接服务器                    |
| `--runtime`           | 本地构建及中间件镜像导出引擎                             |
| `--output`            | 部署 tar 路径，自动补应用版本后缀                        |
| `--skip-middleware`   | 跳过中间件配置与开通                                     |
| `--yes`               | 无交互使用有效配置；缺必要值明确报错                     |

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

## 开发测试

```sh
pnpm --filter @h-ai/deploy typecheck
pnpm --filter @h-ai/deploy lint
pnpm --filter @h-ai/deploy build
pnpm --filter @h-ai/deploy test
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:deploy-gates
```

验证真实生成项目与 SSH/人工部署，覆盖禁止访问镜像仓库、局部更新、归档损坏、同版本发布和健康失败。finally/teardown 只清理本次测试创建的项目、镜像、容器、日志和进程。

## 许可证

Apache-2.0
