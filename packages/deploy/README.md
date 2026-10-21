# @h-ai/deploy

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

自动化部署模块，支持两种部署方式：一键将 SvelteKit 应用部署到 Vercel（并自动开通云基础设施），或将应用容器化后通过 SSH 部署到任意 Linux 主机（docker-ssh）。

## 支持的部署方式

| Provider     | 目标            | 说明                                                   |
| ------------ | --------------- | ------------------------------------------------------ |
| `vercel`     | Vercel 平台     | SvelteKit + adapter-vercel，配合云 Provisioner         |
| `docker-ssh` | 任意 Linux 主机 | SvelteKit + adapter-node / 原生 Node 服务，经 SSH 部署 |

## 支持的云服务（Provisioner）

| 服务类型 | Provisioner   | 说明                   |
| -------- | ------------- | ---------------------- |
| 数据库   | Neon          | PostgreSQL Serverless  |
| 缓存     | Upstash       | Redis TCP + TLS        |
| 存储     | Cloudflare R2 | S3 兼容对象存储        |
| 邮件     | Resend        | SMTP（已有已验证域名） |
| 短信     | 阿里云        | 阿里云短信服务         |

## 快速开始

```typescript
import { deploy } from '@h-ai/deploy'

// 可选：从 ~/.hai/credentials.yml 注入 HAI_DEPLOY_* 环境变量
deploy.credentials.load()

// 初始化
await deploy.init({
  provider: { type: 'vercel', token: 'vel_xxx' },
  services: {
    db: { provisioner: 'neon', apiKey: 'neon_xxx' },
    cache: { provisioner: 'upstash', email: 'a@b.com', apiKey: 'up_xxx' },
  },
})

// 扫描应用依赖
const scan = await deploy.scan('./apps/my-app', { environment: 'test' })

// 开通基础设施
const provisions = await deploy.provisionAll('my-app')

// 完整部署
const result = await deploy.deployApp('./apps/my-app', { environment: 'test' })

await deploy.close()
```

## 环境与中间件

先运行 `hai deploy --env test`（交互调用也可先输入环境）。必须存在对应 `.env.test`；缺失时要求用户创建并停止部署。扫描会解析环境变量及模块依赖，显示当前后端、用途和来源，再逐项选择默认配置、自定义连接或保持不变。保持不变仅在目标环境文件已有完整配置时出现，跳过该项的写入、认证与开通。`--yes` 复用完整的目标配置，其余采用当前后端默认值；`--env-dir` 指定环境文件目录。

环境配置已完备时，选择向导中的“直接部署”或执行 `hai deploy packages/my-app-serv --env prod --yes --skip-middleware`，跳过全部中间件提示、变量写入和资源开通，保留已有服务。部署目标缺失时引导填写 SSH/Vercel 参数；主机、端口、密钥路径、远程目录及 Token 仅保存 `.env.local` 的 `HAI_DEPLOY_PROVIDER`，下次自动复用。SDK 可用 `saveDeploymentEnvironment(snapshot, values, { private: true })` 保存本机参数；私钥只保存文件路径。

默认配置在 Compose 中生成匹配服务/卷，在云平台调用已支持的 Provisioner；无云开通器的后端应使用自定义连接。SQLite/memory/local/disabled 不会被自动替换成 PostgreSQL/Redis/S3/LDAP。自定义逐项校验并写入连接配置。公共值写目标环境文件，凭据和含认证信息的 JSON/URL 写 `.env.local`；输出脱敏。配置字段、后端表、可选依赖与云能力边界见 [部署环境与中间件](../cli/templates/skills/hai-deploy/middleware.md)。

## 配置

通过 `config/_deploy.yml` 管理 git 安全的配置，密钥存放在 `~/.hai/credentials.yml`：

```yaml
# config/_deploy.yml
provider:
  type: vercel
  token: ${HAI_DEPLOY_PROVIDER_TOKEN}

services:
  db:
    provisioner: neon
    apiKey: ${HAI_DEPLOY_SERVICES_DB_APIKEY}
  cache:
    provisioner: upstash
    email: ${HAI_DEPLOY_SERVICES_CACHE_EMAIL}
    apiKey: ${HAI_DEPLOY_SERVICES_CACHE_APIKEY}
```

这里的变量由 `deploy.credentials` 管理，属于显式特殊映射；若同时设置
`HAI_DEPLOY_PROVIDER_TOKEN` 等按 YAML 路径生成的约定变量，约定变量优先。

如需在脚本或 CLI 中显式管理凭证文件，请通过 `deploy.credentials.*` 访问：

```typescript
deploy.credentials.load()
deploy.credentials.save('HAI_DEPLOY_PROVIDER_TOKEN', 'vel_xxx')
deploy.credentials.saveAll({
  HAI_DEPLOY_SERVICES_DB_APIKEY: 'neon_xxx',
})
```

> `deploy.scan()` 与 `deploy.credentials.*()` 都是本地文件系统能力，不依赖 `deploy.init()`。

扫描以目标 workspace 的 `pnpm-lock.yaml` importer 为入口，只遍历运行依赖和 workspace link；排除开发依赖、peer 及其他应用的未引用依赖。旧配置文件不自行启用模块。缺少 lockfile、importer 或节点时先运行 `pnpm install`；扫描器不读取 package.json、pnpm-workspace.yaml 或猜测项目布局。请明确指定部署目录。不会因 `serv` 的可选 AI peer 而安装或部署 AI/CUDA。

## docker-ssh 部署

将应用容器化后通过 SSH 部署到任意 Linux 主机，无需云平台账号。

### 前置条件

- **本地**：安装 docker 或 podman（`auto` 优先 podman）。
- **远程主机**：可 SSH 登录、已装 docker/podman 与 compose、登录用户可运行容器。
- **应用**：SvelteKit 使用 `@sveltejs/adapter-node`（工程自带的 `Dockerfile` 已满足）；缺少时返回 `ADAPTER_MISSING`。

### 使用步骤

1）把 SSH 私钥路径存入凭证文件（不进仓库）。编辑 `~/.hai/credentials.yml`，或用 API：

```typescript
deploy.credentials.save('HAI_DEPLOY_PROVIDER_SSH_IDENTITYFILE', '~/.ssh/hai_deploy')
```

2）在 `config/_deploy.yml` 声明目标主机：

```yaml
provider:
  type: docker-ssh
  ssh:
    host: 10.0.0.20 # 主机 IP 或 ~/.ssh/config 别名
    port: 22
    username: deploy
    identityFile: ${HAI_DEPLOY_PROVIDER_SSH_IDENTITYFILE} # 私钥文件路径，省略则用 ssh-agent
  remote:
    baseDir: /opt/hai/apps # 远程部署根目录
    runtime: auto # 远程运行时；auto 优先 podman，其次 docker
  expose:
    type: port
    containerPort: 3000 # 容器内端口（adapter-node 默认 3000）
    hostPort: 18080 # 宿主机端口 → 访问地址 http://10.0.0.20:18080

container:
  runtime: auto # 本地构建运行时（可选）

services: {} # 启用的服务会自动生成 compose sidecar，见下
```

3）部署并验证（CLI 或 API，二者等价）：

```bash
hai deploy --env test # 读取 config/_deploy.yml，输出访问地址
```

```typescript
import { deploy } from '@h-ai/deploy'

deploy.credentials.load() // 注入 HAI_DEPLOY_* 环境变量
await deploy.init(dockerSshConfig)
const result = await deploy.deployApp('./apps/my-app', { environment: 'test' })
if (result.success) {
  result.data.url // http://<host>:<hostPort>
  result.data.healthCheck // 'passed'（HTTP 探测成功）
}
await deploy.close()
```

### 实现逻辑

`deployApp()` 对 docker-ssh 依次执行：

1. **扫描**：读取目标 importer 的 `pnpm-lock.yaml` 依赖图与 `config/*.yml`，识别 `@sveltejs/adapter-node` 与所需服务及其后端类型。
2. **本地构建**：用工程自带的 `Dockerfile` 构建镜像 `hai-<app>:<部署ID>`（podman 追加 `--format docker --jobs=1`）。
3. **导出**：`docker/podman save` 导出为 tar。
4. **预检**：SSH 连通性 + 远程 `docker/podman version` 与 `compose version`。
5. **传输加载**：`scp` 上传 tar → 远程 `load` → 重打为 `localhost/` 本地标签（避免误从 registry 拉取）。
6. **生成运行描述**：按扫描结果生成 `compose.yml`（app + sidecar）与 `.env.runtime`（含 `HAI_*` 覆盖变量与凭据），上传到 `<baseDir>/<app>/`，`.env.runtime` 设为 `600`。
7. **启动**：`start-<mode>.sh` 显式导出 `HAI_DEPLOY_ENVIRONMENT`/`HAI_CORE_ENV` 并执行 compose；资源名含环境后缀，保持不变的已有容器与卷继续保留。
8. **健康检查**：SvelteKit 检查 `/`，原生 Node 服务检查 `/health`，返回成功才判定 ready。

> 镜像、`compose.yml`、`.env.runtime` 落在应用 `.hai/deploy/<mode>/`（已在模板 `.gitignore` 忽略）。

### compose 按功能生成 sidecar

`deploy.scan()` 会识别所需服务及其**实际后端类型**（读取 `_db.yml` / `_vecdb.yml` 等的 `type`），生成匹配的 sidecar 并注入对应 `HAI_*` 覆盖变量：

| 扫描到的服务 | 后端 (`type`) | 追加的 sidecar                 | 注入变量                      |
| ------------ | ------------- | ------------------------------ | ----------------------------- |
| `db`         | `postgresql`  | `postgres:16-alpine`           | `HAI_DB`                      |
| `db`         | `mysql`       | `mysql:8.4`                    | `HAI_DB`                      |
| `db`         | `sqlite`      | 无（挂载 `/app/data` 数据卷）  | —                             |
| `cache`      | `redis`       | `redis:7-alpine`               | `HAI_CACHE`                   |
| `storage`    | `s3`          | RustFS / MinIO + 初始化 bucket | `HAI_STORAGE`                 |
| `vecdb`      | `qdrant`      | `qdrant/qdrant`                | `HAI_VECDB`                   |
| `vecdb`      | `pgvector`    | `pgvector/pgvector`            | `HAI_VECDB`                   |
| `vecdb`      | `chroma`      | `chromadb/chroma`              | `HAI_VECDB`                   |
| `ldap`       | `ldap`        | OpenLDAP                       | `HAI_IAM_LDAP`                |
| `email`      | `smtp`        | Mailpit (test capture)         | `HAI_REACH_PROVIDERS_<index>` |
| `vecdb`      | `lancedb`     | 无（挂载 `/app/data` 数据卷）  | —                             |

- `cache=memory`、LDAP disabled、Reach console 不生成外部服务；storage local 使用数据卷。SMTP 默认容器仅捕获测试邮件，生产投递使用自定义 SMTP/Resend。
- 若同一服务已配置云 Provisioner（如 Neon 提供 `HAI_DB`），优先用云资源，不再自建 sidecar。
- sidecar 密码写入被忽略的本机私有配置与远程 `.env.runtime`（`600`），不会进入公共环境文件或 `compose.yml`。

> 安全：`identityFile` 为私钥**路径**（非私钥内容）；`strictHostKeyChecking: true`（默认）
> 采用 accept-new（首次信任、拒绝变更）。首次连接未知主机可先手动 `ssh` 一次。

## 错误处理

```typescript
import { HaiDeployError } from '@h-ai/deploy'

const result = await deploy.deployApp('./apps/my-app', { environment: 'test' })
if (!result.success) {
  switch (result.error.code) {
    case HaiDeployError.AUTH_FAILED.code:
      // Vercel Token 无效
      break
    case HaiDeployError.BUILD_FAILED.code:
      // 构建失败
      break
  }
}
```

常用错误码：

| 错误码                            | code             | 说明         |
| --------------------------------- | ---------------- | ------------ |
| `HaiDeployError.DEPLOY_FAILED`    | `hai:deploy:001` | 部署失败     |
| `HaiDeployError.BUILD_FAILED`     | `hai:deploy:003` | 构建失败     |
| `HaiDeployError.AUTH_FAILED`      | `hai:deploy:006` | 认证失败     |
| `HaiDeployError.PROVISION_FAILED` | `hai:deploy:007` | 资源开通失败 |
| `HaiDeployError.NOT_INITIALIZED`  | `hai:deploy:010` | 未初始化     |
| `HaiDeployError.ENV_VAR_FAILED`   | `hai:deploy:011` | 环境变量失败 |

docker-ssh 专属错误码：

| 错误码                                       | code             | 说明             |
| -------------------------------------------- | ---------------- | ---------------- |
| `HaiDeployError.CONTAINER_RUNTIME_NOT_FOUND` | `hai:deploy:015` | 未找到容器运行时 |
| `HaiDeployError.CONTAINER_BUILD_FAILED`      | `hai:deploy:016` | 镜像构建失败     |
| `HaiDeployError.REMOTE_CONNECT_FAILED`       | `hai:deploy:017` | 远程连接失败     |
| `HaiDeployError.REMOTE_COMMAND_FAILED`       | `hai:deploy:018` | 远程命令失败     |
| `HaiDeployError.IMAGE_TRANSFER_FAILED`       | `hai:deploy:019` | 镜像传输失败     |
| `HaiDeployError.HEALTH_CHECK_FAILED`         | `hai:deploy:020` | 健康检查未通过   |

## 测试

`pnpm --filter @h-ai/cli test:deploy-gates` validates current package archives with a generated fullstack project, Podman/SSH, the selected environment, login and repeat deployment. Logs and acceptance artifacts stay in ignored temporary directories.

```bash
pnpm --filter @h-ai/deploy test
```

## License

Apache-2.0

云资源配置消费：Neon 输出 HAI_DB（PostgreSQL JSON），Upstash 输出 HAI_CACHE（Redis rediss URL JSON），R2 输出 HAI_STORAGE（扁平 S3 JSON）。邮件/短信输出 HAI_REACH_PROVIDERS 数组，deployApp 合并两个渠道并保留 YAML 中的消息模板；此覆盖替换原 providers 数组。Core 支持整体对象/数组覆盖，父节点优先于叶子变量，仍执行 Schema 校验；构建子进程与目标运行环境使用相同开通结果。R2 必须提供已有 S3 accessKeyId/secretAccessKey；Resend 必须提供已验证域名的 from；阿里云必须提供已审核 signName/模板。应用须已有相应\_db/\_cache/\_storage/\_reach.yml 并在启动时加载，网络客户端需要 Node 运行时。

配置依据：[Upstash TLS](https://upstash.com/docs/redis/features/security)、[Resend SMTP](https://resend.com/docs/send-with-smtp)。确定性验收真实生成应用并通过 Core 和各模块 Schema；未创建云资源、未发送邮件/短信，不能据此声称云端写入读取已验收。

部署失败恢复：`ProvisionResult.resourceStatus` 标记 created/reused；`getDeployRecovery(result.error)` 读取 projectName、stage、platformProjectId 和资源清单，unknown 表示请求结果不确定，必须先在服务商控制台核对。失败资源已返回 ID 时保留该 ID。恢复结果不含 envVars、原始异常或连接凭证，CLI 会展示清单和建议。同名重试复用现有资源；不自动删除复用资源，新建资源仅在人工确认未被使用后清理。
