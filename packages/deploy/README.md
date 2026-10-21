# @h-ai/deploy

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · [CLI](../cli/README.md) · [环境与中间件配置](../cli/templates/skills/hai-deploy/middleware.md)

部署 SDK，供 `@h-ai/cli` 的 `hai deploy` 命令调用，也可在 Node.js 脚本中独立使用。

## 功能与范围

| 部署目标     | 应用                                                | 执行内容                                                                |
| ------------ | --------------------------------------------------- | ----------------------------------------------------------------------- |
| `docker-ssh` | 原生 Node 服务、使用 adapter-node 的 SvelteKit 应用 | 本地构建镜像，经 SSH 上传，在 Linux 上运行 Compose 并检查 HTTP 健康状态 |
| `vercel`     | 使用 adapter-vercel 的 SvelteKit 应用               | 构建、上传、设置环境变量、等待平台部署结果；需要互联网                  |

- 从目标目录对应的 `pnpm-lock.yaml` importer 遍历实际运行依赖及 workspace link，排除开发依赖和 peer；结合应用配置识别中间件。不会因为可选 AI peer 部署 AI/CUDA。
- 先选择环境并检查 `.env.<mode>`，再逐项选择默认配置、自定义连接或保持不变。环境已配置完整时可跳过全部中间件处理。
- Compose 支持 PostgreSQL、MySQL、Redis、RustFS/MinIO、Qdrant、pgvector、Chroma、OpenLDAP、Mailpit；SQLite、memory、local、LanceDB 按各自本地存储方式处理。Mailpit 只捕获测试邮件。
- 云开通支持 Neon、Upstash、Cloudflare R2、Resend、阿里云短信。R2 需要已有 S3 密钥，Resend 需要已验证发件域名，短信需要已审核签名与模板；其他后端使用自定义连接。

**fullstack 的 API 与 Web 分开部署。** `hai deploy packages/my-app-serv` 只部署 API，不会自动部署 `apps/my-app-web`。模板根 Dockerfile 的 `runtime` 和 `web` target 分别构建 API 与静态 Web 镜像；Web 需另行上传并运行，配置 `PUBLIC_API_BASE` 和 API 的 CORS。当前没有同时发布两者的命令，也不自动配置域名、TLS 或反向代理。

## 命令行使用

### 1. 安装与准备

当前 Node 要求为 `^22.22.2 || ^24.15.0 || >=26.0.0`，生成工程固定 `pnpm@12.11.2`。Node 20 / pnpm 9.5.0 不受支持。Windows 使用 `pnpm.cmd`。

在生成工程根目录安装与应用框架版本匹配的 CLI 和 SDK，并保留 lockfile（此步骤需要包源或完整离线依赖）：

```powershell
pnpm.cmd add -Dw @h-ai/cli @h-ai/deploy
pnpm.cmd exec hai --help
```

创建项目时选择 `--features deploy` 已包含项目本地 SDK，但不代表安装了全局 `hai`。已全局安装 CLI 时可直接运行 `hai deploy`。模板的 `pnpm run deploy` 是打包脚本，不等于执行 `hai deploy`。

docker-ssh 还需要：

- 本地 Docker 或 Podman 引擎已启动，能够构建目标架构的 Linux 镜像；Windows 需准备对应虚拟化/WSL2/虚拟机环境。仅安装容器客户端不够。`auto` 优先 Podman，可显式选择 Docker。
- 本地有 `ssh`、`scp`，密钥或 ssh-agent 可非交互登录服务器；准备主机指纹。
- Linux 有 Docker/Podman 和对应的 `compose` 命令。SSH 用户能直接运行容器、写入部署目录；Windows 能访问 SSH 端口与应用映射端口。
- 目标包有 `config/_deploy.yml`；环境目录有 `.env.prod` 或 `.env.test`。缺文件时停止，要求先创建。

### 2. 配置目标与环境

`config/_deploy.yml` 的最小 Docker 配置如下。实际主机参数从 `.env.local` 的整体 `HAI_DEPLOY_PROVIDER` 覆盖，避免每次输入，也避免提交机器信息：

```yaml
provider:
  type: docker-ssh
container:
  runtime: docker
  s3Engine: rustfs
services: {}
```

```dotenv
# .env.local：不提交 Git；地址、用户名、端口及路径按实际环境替换
HAI_DEPLOY_PROVIDER='{"type":"docker-ssh","ssh":{"host":"10.0.0.20","port":22,"username":"deploy","identityFile":"C:/Users/me/.ssh/hai_deploy"},"remote":{"baseDir":"/opt/hai/apps","runtime":"docker"},"expose":{"type":"port","containerPort":3000,"hostPort":18080}}'
```

也可让交互向导填写缺失的目标参数，保存 `.env.local` 后复用。私钥只记录路径。已有完整目标会直接复用，切换目标时修改 `HAI_DEPLOY_PROVIDER`。

覆盖顺序为 `.env` → `.env.<mode>` → `.env.local` → 当前进程变量；父节点 JSON（如 `HAI_DB`）优先于叶子变量。`.env.example` 记录完整字段、说明与枚举；`.env`、`.env.dev/test/prod` 提交 Git，真实凭据只放 `.env.local`。首次启动 fullstack 需在私有配置中设置符合 IAM 策略的 `HAI_ADMIN_DEFAULT_PASSWORD`。

fullstack 生产环境还必须在 `.env.prod` 设置明确的 Web Origin，例如 `HAI_SERV_CORS_ORIGIN=https://app.hai.internal`；默认 `*` 会使生产启动失败。生产 refresh Cookie 启用 Secure，Web/API 应通过已配置信任证书的 HTTPS 入口访问；只开放 HTTP 端口不足以验收完整登录与刷新会话。

### 3. 执行部署

从 fullstack 工程根目录运行，替换实际服务目录：

```powershell
pnpm.cmd exec hai deploy packages/my-app-serv --env prod --env-dir .
```

向导展示中间件当前后端与用途，再提供默认配置、自定义连接或保持不变。保持不变仅在目标环境文件明确声明完整配置时出现。默认配置在 Linux Compose 中生成服务/卷；自定义连接不生成该中间件。公共值写目标环境文件，凭据写 `.env.local`，输出脱敏。

已有数据库、缓存、存储连接全部配置完成时：

```powershell
pnpm.cmd exec hai deploy packages/my-app-serv --env prod --env-dir . --yes --skip-middleware
```

`--skip-middleware`（别名 `--skip-provision`）跳过中间件提示、配置改写与资源创建，仍构建并部署应用。它不会启动尚未运行的外部中间件。`--yes` 单独使用会复用完整配置，并为其余项采用当前后端默认值。

`--project-name <name>` 指定名称，选定环境后名称追加环境后缀。**`--skip-build` 当前仅跳过 Vercel 的应用构建；docker-ssh 始终构建镜像，不支持直接指定已有应用镜像。** 命令失败返回非零退出码。

## docker-ssh 的文件与执行流程

1. 本地选择目标包自己的 Dockerfile；不存在时生成兜底 Dockerfile，以 workspace 根为构建上下文。fullstack 服务包默认走兜底，不会使用根 Dockerfile 的 Web target。
2. 本地构建应用镜像，使用 `docker/podman save` 导出 tar。
3. SSH 检查远程容器引擎与 Compose；SCP 上传 tar，远程执行 `load`。
4. 本地生成 `compose.yml`、`.env.runtime`、`start-<mode>.sh`，分别上传至 `<baseDir>/<projectName>-<mode>/`。它们与镜像归档分开传输，不打成一个 Compose 压缩包，也不把源码上传后在 Linux 构建。
5. 远程脚本设置 `HAI_DEPLOY_ENVIRONMENT`、`HAI_CORE_ENV`，执行 `compose --env-file .env.runtime ... up -d`。SDK 从本地访问原生服务 `/health` 或 SvelteKit `/`，通过后才返回成功。

本地产物位于目标包 `.hai/deploy/<mode>/`，应忽略 Git；远程 `.env.runtime` 权限为 `600`。保留本地产物用于重复部署；“保持不变”保留本地上一份 Compose 中已有的服务/卷定义，不会自动读取服务器上任意现有 Compose。私有环境文件与部署归档不得复制进镜像。

## 完全离线部署

离线指不能访问互联网，但 Windows 与 Linux 仍可通过内网 SSH/HTTP 通信。Vercel 和云资源开通不适用。

### 提前带入的材料

| 位置         | 必备材料或状态                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows 工具 | 兼容的 Node（例如满足要求的 Node 24）、pnpm 12.11.2、已安装的 CLI/SDK 及传递依赖；OpenSSH；已初始化且可启动的 Linux 容器引擎                                  |
| 项目         | 完整工程、固定版本 lockfile、环境文件及私有凭据；能离线运行 `pnpm.cmd exec hai --help`。现场不要使用 `npx` / `pnpm dlx` 临时下载                              |
| Linux        | Docker CLI/Engine、Compose 插件（`docker compose version` 成功）、SSH 公钥授权、容器权限、可写目录、开放端口及足够镜像/卷空间；仅运行镜像不需要主机 Node/pnpm |
| 镜像         | 与 Linux CPU 架构一致的 API、Web 及中间件镜像；名称与 tag 和 Compose 完全一致；导入用 `docker load -i <archive.tar>`                                          |
| 业务配置     | PostgreSQL 数据库/账号、Redis 连接及密码、RustFS 密钥/桶、首次管理员密码；已有服务须已启动且可从应用容器访问，`localhost` 指应用容器自身                      |

默认 Compose 使用 `postgres:16-alpine`、`redis:7-alpine`、`ghcr.io/rustfs/rustfs:1.0.1`。已有其他 tag 不等于命中这些镜像；先核对并导入/正确标记已验证兼容的镜像，或使用自定义连接。中间件镜像不会由 SDK 自动打包上传。其他固定镜像见 [Compose 实现](src/container/deploy-container-compose.ts)。

**默认源码构建并非开箱即用的离线构建。** Dockerfile 会准备 pnpm、下载包和 SQLite 预编译驱动；fullstack 根 Dockerfile 还使用 `pnpm fetch` 与外部 Dockerfile frontend。Windows 的 `node_modules` 或 pnpm store 不能代替 Linux 构建依赖。若现场从源码构建，应带齐本地引擎中的 Node 基础镜像、构建 frontend、Corepack/pnpm、Linux 平台依赖和原生二进制缓存，并调整 Dockerfile 使用这些材料。在准备环境断开外网完整构建一次；`pnpm install --offline --frozen-lockfile` 仅解决包存储读取，不覆盖安装脚本的额外下载。

SQLite 预编译包须匹配 better-sqlite3 版本、Node ABI、CPU 架构和 libc。即使运行期选 PostgreSQL，当前依赖安装仍可能需要该包。可预置 Linux 构建环境的 prebuild-install 缓存，或通过 `container.sqlitePrebuildMirror` 指向内网镜像；两者都没有时需提前带入二进制或成品镜像。默认 fullstack 不需要 CUDA。

### 使用预构建镜像离线执行 SDK

较易交付的方式是提前构建镜像，现场让 SDK 复用它。以下以工程名 `my-app`、Web 前端和与服务器一致的构建架构为前提；在可提供依赖的材料准备环境执行，不是在离线现场下载：

```powershell
docker build --target runtime -t my-app-api:offline .
docker build --target web -t my-app-web:offline .
docker save -o my-app-images.tar my-app-api:offline my-app-web:offline
```

把归档带入离线 Windows 的本地 Linux 引擎，执行 `docker load -i my-app-images.tar`。在 `packages/my-app-serv/Dockerfile` 写入下列内容，使 SDK 的必经构建只复用成品镜像，无包安装步骤；业务代码变化后须重制成品镜像：

```dockerfile
FROM my-app-api:offline
```

为服务包添加 `.dockerignore`（内容 `*`），限制此专用构建上下文。配置部署目标后执行上面的 `hai deploy`：需 SDK 创建中间件容器时，先在 `.env.prod` 选择 `HAI_DB_TYPE=postgresql`、`HAI_CACHE_TYPE=redis`、`HAI_STORAGE_TYPE=s3`，再走向导默认配置；已有服务则填写自定义连接，配置完整后可用 `--skip-middleware`。API 镜像由 SDK 上传；提前在断外网条件下演练，确认构建器不会尝试联网。

Web 镜像需另外传输到 Linux 并运行。以下假设已另行准备 `https://app.hai.internal` 与 `https://api.hai.internal` 的内网 TLS 入口，分别代理 Web 的 18081 端口与 API 的 18080 端口；需带入代理配置/镜像、证书，并配置内网 DNS/hosts 和客户端信任。SSH 登录后执行：

```sh
docker load -i /path/to/my-app-images.tar
docker run -d --name my-app-web-prod --restart unless-stopped -p 18081:8080 -e PUBLIC_API_BASE=https://api.hai.internal my-app-web:offline
```

API 地址须能被用户浏览器访问，API 设置 `HAI_SERV_CORS_ORIGIN=https://app.hai.internal`。验收 API `/health`、Web 登录/业务请求、hash 页面刷新、会话刷新、服务重启及持久化。这里是离线材料与适配方式说明，联网部署测试不能替代实际断网验收。

镜像归档见 Docker 官方 [save](https://docs.docker.com/reference/cli/docker/image/save/) / [load](https://docs.docker.com/reference/cli/docker/image/load/)，离线包安装见 [pnpm install](https://pnpm.io/cli/install)，Compose 插件见 [安装说明](https://docs.docker.com/compose/install/linux/)。

## SDK 与错误处理

脚本调用无需 CLI。`config` 是已解析的部署配置；需要相同环境解析时使用公开的 `loadDeploymentEnvironment` / `loadDeploymentConfig`。最小生命周期：

```typescript
import type { DeployConfigInput } from '@h-ai/deploy'
import { deploy } from '@h-ai/deploy'

/**
 * 使用现有中间件发布生产 API，并释放部署模块。
 * @param config - 从部署环境解析得到的配置
 * @returns 初始化或部署的 HaiResult，由调用者检查 success
 * @example `const result = await publish(config)`
 */
export async function publish(config: DeployConfigInput) {
  const initialized = await deploy.init(config)
  if (!initialized.success)
    return initialized
  try {
    return await deploy.deployApp('./packages/my-app-serv', {
      environment: 'prod',
      envDir: '.',
      skipProvision: true,
    })
  }
  finally {
    await deploy.close()
  }
}
```

调用者先判断 `result.success`，失败读取 `result.error.code/message`，成功读取 `result.data.url/healthCheck`。`deploy.scan()` 与 `deploy.credentials.*()` 不依赖初始化；`deployApp()` 已包含开通流程，无须预先 `provisionAll()`。手动开通同样检查结果。SDK 的 `skipProvision` 与 CLI 跳过中间件语义一致。

云资源返回 `HAI_DB`、`HAI_CACHE`、`HAI_STORAGE` 或 `HAI_REACH_PROVIDERS` 整体配置；应用须加载对应 YAML 并初始化模块。失败时 `getDeployRecovery(result.error)` 返回阶段及资源 ID；`unknown` 表示结果不确定，应先在平台核对，同名重试复用资源，不自动删除。完整类型、配置及错误码见 [公开入口](src/index.ts)。

## 测试与二次开发

框架仓库根目录安装依赖后执行（Windows 使用 `pnpm.cmd`）：

```powershell
pnpm.cmd --filter @h-ai/deploy typecheck
pnpm.cmd --filter @h-ai/deploy lint
pnpm.cmd --filter @h-ai/deploy build
pnpm.cmd --filter @h-ai/deploy test
pnpm.cmd check:skills
```

`src/deploy-scanner.ts` 处理 lockfile 依赖图，`deploy-middleware.ts` 定义连接字段，`container/` 负责引擎、SSH 与 Compose，`providers/` 实现部署目标，`provisioners/` 实现云开通；CLI 向导位于 `../cli/src/commands/cli-deploy*.ts`。新增后端/配置时同步这些消费者、环境示例、测试和 [部署 skill](../cli/templates/skills/hai-deploy/SKILL.md)。

修改链路后运行 CLI 的 typecheck/lint/build/test，再执行 `pnpm.cmd --filter @h-ai/cli test:deploy-gates`：使用当前包归档生成 fullstack，经过 Podman/SSH 验证健康状态、环境、登录和重复部署。门禁需要本地引擎、OpenSSH；首次准备夹具会下载镜像和系统/Node 依赖，并非离线验收。模板变更另运行 `pnpm.cmd --filter @h-ai/cli test:scaffold-gates`。单元测试不证明云资源已开通，付费云服务另行验收。日志、截图和验收报告保留在 Git 忽略的 `tmp/` / `test-results/`。

## License

Apache-2.0
