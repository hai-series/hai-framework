# @h-ai/deploy

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

部署 SDK，也是 `@h-ai/cli` 的 `hai deploy` 后端。**只部署已有产物，不编译源码、不构建镜像。**

完整的创建、开发、构建与部署流程见[使用指南](../../docs/usage/README.md)；下文侧重部署准备、SDK 与二次开发。

## 功能

- `docker-ssh`：读取镜像清单，选择环境和中间件，生成一个 Compose tar；上传到 Linux 后解包、导入镜像、启动并检查健康状态。
- `--bundle-only`：只生成同样的 tar 和操作说明，不连接 SSH；支持 U 盘或其他手工搬运方式。
- fullstack 的构建清单含 app/web 两个镜像时一起部署。公开端口提供 Web 和同源 API；Web 不接收 API 的私有变量，支持 hash 页面刷新。
- `vercel`：上传已有 `.vercel/output` 并设置运行变量；需要网络，按 [Build Output API](https://vercel.com/docs/build-output-api/primitives) 的 prebuilt 协议部署，不执行本地或平台源码构建。
- 只从目标 importer 的 `pnpm-lock.yaml` 遍历运行依赖（含 workspace link），排除 dev/peer，识别数据库、cache、storage、vecdb、LDAP、邮件和短信等中间件。
- 中间件逐项选择默认、自定义或保持不变；配置完整时用 `--skip-middleware` 跳过全部处理。Compose 默认支持 PostgreSQL、MySQL、Redis、RustFS/MinIO、Qdrant、pgvector、Chroma、OpenLDAP、Mailpit；云开通支持 Neon、Upstash、R2、Resend、阿里云短信。详细字段见 [环境与中间件](../cli/templates/skills/hai-deploy/middleware.md)。

## 构建与部署

当前工程要求 Node `^22.22.2 || ^24.15.0 || >=26.0.0`、pnpm 12.11.2。Windows 用 `pnpm.cmd`；Node 20 / pnpm 9.5.0 不受支持。

生成工程的 `pnpm build` 调用 `hai build`，默认只编译源码。镜像和原生安装包按目标显式构建，**不选择 dev/test/prod，不读部署文件，也不注入运行期凭据**：

```powershell
pnpm.cmd build
pnpm.cmd build --target docker
# 自动选择可用的 Podman，失败后尝试 Docker；也可显式指定
pnpm.cmd build --target docker --runtime docker
# 启用 desktop 的 fullstack；需在对应系统上安装 Rust target/系统 SDK/打包工具
pnpm.cmd build --target desktop --platform windows --arch x64
```

`hai.build.json` 指定 Dockerfile target、context 和 Tauri 工程目录。镜像构建把 API/Web 导出到 `.hai/build/docker/<buildId>/`，含 `manifest.json`、`app.tar`、可选 `web.tar` 和 SHA-256；全部成功才更新 `latest`。Tauri 安装包位于对应工程 `src-tauri/target/<Rust target>/release/bundle/`。Windows/Linux/macOS 分别在对应主机或 CI runner 构建；不会自动安装 SDK，也不承诺跨系统编译。

fullstack 在工程根执行：

```powershell
pnpm.cmd run deploy --env test
pnpm.cmd run deploy --env prod --skip-middleware
# 精确复用一次构建，绝不重新构建
pnpm.cmd run deploy --env prod --artifact-dir .hai/build/docker/<buildId>
# 服务器网络不通，只交付包
pnpm.cmd run deploy --env prod --bundle-only --output release-prod.tar
```

等价命令为 `pnpm exec hai deploy packages/my-app-serv --env prod --env-dir .`。API workspace 的服务目录为 `apps/my-app-service`。模板已安装项目 CLI；选择 deploy 功能时安装对应 SDK。旧工程需自行安装与框架版本匹配的 `@h-ai/cli`、`@h-ai/deploy`，并提供构建配置和 `_deploy.yml`。

先检查 `.env.<mode>`；缺少则停止并提示创建。`.env` 公共基础、`.env.dev/test/prod` 环境覆盖和完整说明 `.env.example` 提交 Git；`.env.local` 保存私有值并忽略。优先级：进程 > `.env.local` > 环境文件 > `.env`，整体 JSON 节点优先于子字段。

```yaml
# packages/my-app-serv/config/_deploy.yml
provider:
  type: docker-ssh
  expose:
    hostPort: 18080
container:
  s3Engine: rustfs # rustfs | minio
```

自动 SSH 部署首次向导填写目标，写入 `.env.local` 后复用；也可直接配置：

```dotenv
HAI_DEPLOY_PROVIDER='{"type":"docker-ssh","ssh":{"host":"10.0.0.20","username":"deploy","port":22,"identityFile":"C:/Users/me/.ssh/hai_deploy"},"remote":{"baseDir":"/opt/hai/apps","runtime":"docker"},"expose":{"hostPort":18080,"containerPort":3000}}'
```

仅打包不要求 SSH 参数。本地部署工具只需要已安装依赖、`tar` 和构建产物；**不需要本地 Docker/Podman**。自动部署另外需要 `ssh/scp`、服务器指纹与非交互登录权限、可写部署目录、SSH 及应用端口可达。

## tar 内容与手工启动

部署 tar 包含 `compose.yml`、`.env.runtime`、可选 `web.conf`、镜像归档、`SHA256SUMS`、`start-<mode>.sh` 和 `README.txt`。它含私有凭据，权限设为 600，不提交 Git。打包结果是 `packaged`，不代表服务器已运行。自动部署上传这一个 tar，在远程解包启动；远端不接收源码、不构建镜像。

将包搬到 Linux 后，按包内 README 操作：

```sh
mkdir -p release && chmod 700 release
tar -xf release-prod.tar -C release
cd release
HAI_DEPLOY_PROVIDER_REMOTE_RUNTIME=docker sh start-prod.sh
```

启动脚本选择 Docker/Podman，校验文件、导入 app/web 镜像，检查全部镜像标签，导出所选环境标识后启动 Compose。中间件镜像缺少时明确停止，不尝试联网下载；数据卷按项目和环境隔离，重复部署保留数据。启动后用 compose ps/logs、Web、`/health` 验证。生产登录/刷新需要 HTTPS 入口、正确 CORS、DNS/hosts 和受信证书；本模块不配置 TLS。

## 完全离线准备（Windows → Linux）

已有 PostgreSQL、Redis、RustFS 镜像还不够，准备以下内容：

1. Windows 上受支持的 Node/pnpm、完整项目、锁文件和已安装 CLI/SDK 依赖；验证断网后命令可启动。本机无容器引擎时，从构建机复制完整 `.hai/build/docker/<buildId>`。
2. 在构建机预先执行 `pnpm build --target docker`，确认镜像架构与服务器一致。离线部署只消费这些 tar，不需要 Node 基础镜像、pnpm store、CUDA、编译器或 SQLite 下载。无 AI 运行依赖的 fullstack 不安装 AI/CUDA。
3. 若连构建也要离线，则构建机另需 Linux 容器引擎、所有基础镜像、pnpm/Corepack、完整 Linux 依赖缓存、SQLite 对应驱动版本/Node ABI/架构/libc 的预编译包。Windows node_modules 不能替代 Linux 原生依赖。镜像构建可用 `--sqlite-prebuild-mirror http://<可信地址>/better-sqlite3`；下载失败应修复缓存/网络，不在 deploy 安装编译环境。
4. Linux 上安装对应架构 Docker/Podman、可执行的 Compose 命令、`sh`、`tar`、`sha256sum`；运行用户有容器/目录/卷权限。中间件镜像**名称和标签**须与生成 README 一致，先用 `docker load` 导入；SDK 不自动捆绑中间件镜像。自定义连接则要准备已运行的服务、账号、数据库/桶、容器可达地址。
5. `.env.prod`、私有管理员密码/连接密钥、部署公开端口、持久化磁盘和必要证书。切勿把容器内 localhost 当服务器宿主机。
6. 无任何两机网络时，用 `--bundle-only`，手工复制包；有内网但无互联网时也可 SSH 自动部署。云 Provider/Provisioner 不适用于完全离线，应选 Compose 或自定义已有服务。

离线验收须实际断开外网后打包/搬运/启动、登录、页面刷新、重启和数据持久化；联网通过不等于断网通过。

## Node API

```ts
import { deploy } from '@h-ai/deploy'

const initialized = await deploy.init({
  provider: { type: 'docker-ssh', expose: { hostPort: 18080 } },
})
if (!initialized.success)
  throw new Error(initialized.error.message)
try {
  const result = await deploy.deployApp('./packages/my-app-serv', {
    environment: 'prod',
    envDir: '.',
    bundleOnly: true,
    artifactDir: './.hai/build/docker/<buildId>',
    skipProvision: true,
  })
  if (!result.success)
    throw new Error(result.error.message)
  // result.data.bundlePath / instructions；packaged 不代表服务器 ready。
}
finally {
  await deploy.close()
}
```

`deploy.scan` 与 `deploy.credentials` 不依赖 init；业务 API 返回 HaiResult，先检查 success。资源开通失败保留恢复信息，不自动删除已创建资源。

## 二次开发与验证

```powershell
pnpm.cmd --filter @h-ai/deploy typecheck
pnpm.cmd --filter @h-ai/deploy lint
pnpm.cmd --filter @h-ai/deploy build
pnpm.cmd --filter @h-ai/deploy test
pnpm.cmd --filter @h-ai/cli test
pnpm.cmd --filter @h-ai/cli test:scaffold-gates
pnpm.cmd --filter @h-ai/cli test:deploy-gates
```

最后一项使用当前源码打包生成 fullstack，显式构建一次 API/Web，再验证 SSH 上传和手工 tar 启动、真实 Web 登录/刷新。需要运行的 Podman/Docker 和 OpenSSH。测试用 finally/teardown 清理临时工程、镜像、容器、报告、截图和辅助进程，失败同样清理；验收材料不提交 Git。原生安装包需在相应系统另做真实构建及安装验收。
