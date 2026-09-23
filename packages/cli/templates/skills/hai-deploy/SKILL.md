---
name: hai-deploy
description: "使用 @h-ai/deploy 部署应用：Vercel 云平台或 docker-ssh 容器化部署到任意 Linux 主机，并按需开通/生成基础设施。"
---

# hai-deploy

## 能力契约

`hai deploy` 在模块/配置缺失或凭证、扫描、初始化、部署、关闭失败时返回非零退出码。自动化流程必须以退出码判断成功，不要只判断命令是否完成或是否输出日志。

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/deploy 部署应用：Vercel 云平台或 docker-ssh 容器化部署到任意 Linux 主机 |
| 适用场景 | 部署目标配置、云资源开通、SSH 主机容器部署或部署故障排查 |
| 输入 | 项目构建产物、部署目标（vercel / docker-ssh）、环境配置与凭据引用 |
| 输出 | 部署/资源操作结果和可验证的目标状态（含访问 URL 与健康检查） |
| 限制 | 核对实际 provider 与应用运行时；开通收费资源、发布或删除必须在用户授权范围内，凭据不写入仓库。 |

> `@h-ai/deploy` 提供两种部署方式：
> 1. **vercel** — 将 SvelteKit（adapter-vercel）应用部署到 Vercel，并自动开通 Neon/Upstash/R2/Resend/阿里云等云基础设施；
> 2. **docker-ssh** — 将 SvelteKit（adapter-node）应用容器化后经 SSH 部署到任意具备 docker/podman + compose 的 Linux 主机，按所选功能自动生成 compose sidecar。

## 运行环境

> ⚠️ **Node.js CLI / 服务端模块。** 通过 `hai deploy` CLI 命令或在 Node.js 脚本中使用。
> docker-ssh 方式要求本地安装 docker 或 podman（`auto` 优先 podman）。

## 适用场景

- 一键部署 SvelteKit 应用到 Vercel
- 容器化后经 SSH 部署到自有服务器 / 云主机 / 内网虚拟机（docker-ssh）
- 自动开通 PostgreSQL、Redis、S3 等云服务，或按功能生成自建 sidecar
- 管理部署凭证（~/.hai/credentials.yml）
- 扫描应用依赖，自动检测所需服务
- CLI 部署流程（`hai deploy`）

## 使用步骤

### 1. 配置

```yaml
# config/_deploy.yml
provider:
  type: vercel
  token: ${HAI_DEPLOY_VERCEL_TOKEN}

services:
  db:
    provisioner: neon
    apiKey: ${HAI_DEPLOY_NEON_API_KEY}
  cache:
    provisioner: upstash
    email: ${HAI_DEPLOY_UPSTASH_EMAIL}
    apiKey: ${HAI_DEPLOY_UPSTASH_API_KEY}
  storage:
    provisioner: cloudflare-r2
    accountId: ${HAI_DEPLOY_CF_ACCOUNT_ID}
    apiToken: ${HAI_DEPLOY_CF_API_TOKEN}
    accessKeyId: ${HAI_DEPLOY_R2_ACCESS_KEY_ID}
    secretAccessKey: ${HAI_DEPLOY_R2_SECRET_ACCESS_KEY}
  email:
    provisioner: resend
    apiKey: ${HAI_DEPLOY_RESEND_API_KEY}
    from: ${HAI_DEPLOY_RESEND_FROM}
  sms:
    provisioner: aliyun
    accessKeyId: ${HAI_DEPLOY_ALIYUN_ACCESS_KEY_ID}
    accessKeySecret: ${HAI_DEPLOY_ALIYUN_ACCESS_KEY_SECRET}
    signName: ${HAI_DEPLOY_ALIYUN_SIGN_NAME}
```

这些凭证名由 `deploy.credentials` 管理，属于显式特殊映射；若同时设置
`HAI_DEPLOY_PROVIDER_TOKEN` 等约定变量，约定变量仍拥有最高优先级。

#### docker-ssh 配置

将上面的 `provider` 替换为 docker-ssh（远程主机需 SSH + docker/podman + compose）：

```yaml
# config/_deploy.yml
provider:
  type: docker-ssh
  ssh:
    host: ${HAI_DEPLOY_SSH_HOST}
    port: 22
    username: deploy
    identityFile: ${HAI_DEPLOY_SSH_KEY} # 私钥文件路径，省略则用 ssh-agent
  remote:
    baseDir: /opt/hai/apps
    runtime: auto # auto 优先 podman，其次 docker
  expose:
    type: port
    containerPort: 3000
    hostPort: 18080 # 访问地址 http://<host>:18080

container:
  runtime: auto # 本地构建运行时，可选

services:
  # 启用的服务会被加入远程 compose sidecar（postgres/redis/minio）
  # 若配置了云 Provisioner（如 neon），则优先用云资源，不再自建 sidecar
  db:
    provisioner: neon
    apiKey: ${HAI_DEPLOY_NEON_API_KEY}
```

docker-ssh 要点：

- 应用镜像使用工程自带的 `Dockerfile`（`@sveltejs/adapter-node`），缺少 adapter-node 会返回 `ADAPTER_MISSING`
- compose 按 `deploy.scan()` 识别的服务**及其后端类型**生成匹配 sidecar 并注入 `HAI_*` 覆盖变量：
  - `db`：`postgresql`→postgres、`mysql`→mysql、`sqlite`→数据卷（无 sidecar）→ `HAI_DB`
  - `cache`：`redis`→redis → `HAI_CACHE`；`storage`：`s3`→minio → `HAI_STORAGE`
  - `vecdb`：`qdrant`/`pgvector`/`chroma`→对应 sidecar、`lancedb`→数据卷 → `HAI_VECDB`
- 若同一服务已配置云 Provisioner（如 neon 提供 `HAI_DB`），优先用云资源，不再自建 sidecar
- sidecar 密码等敏感值只写入远程 `.env.runtime`（权限 600），不入 `compose.yml`
- `identityFile` 是私钥**路径**（非私钥内容）；禁止把私钥内容写进 `_deploy.yml`

### 2. 初始化与关闭

```typescript
import { deploy } from '@h-ai/deploy'

deploy.credentials.load()

await deploy.init({
  provider: { type: 'vercel', token: 'vel_xxx' },
  services: {
    db: { provisioner: 'neon', apiKey: 'neon_xxx' },
  },
})

// 使用后关闭
await deploy.close()
```

### 3. 扫描应用

```typescript
const scanResult = await deploy.scan('./apps/my-app')
if (scanResult.success) {
  const { appName, isSvelteKit, requiredServices } = scanResult.data
}
```

### 4. 开通基础设施

```typescript
const provResults = await deploy.provisionAll('my-project')
if (provResults.success) {
  for (const prov of provResults.data) {
    // prov.envVars 包含需要注入的环境变量
  }
}
```

### 5. 完整部署

```typescript
const result = await deploy.deployApp('./apps/my-app', {
  projectName: 'my-project',
  skipProvision: false,
  skipBuild: false,
})
if (result.success) {
  // result.data.url — 部署地址
  // result.data.deploymentId — 部署 ID
  // result.data.envVarsSet — 已设置的环境变量列表
}
```

## 核心 API

| 方法                   | 签名                                                                       | 说明         |
| ---------------------- | -------------------------------------------------------------------------- | ------------ |
| `deploy.credentials.load` | `() => HaiResult<string[]>`                                             | 加载凭证到 `process.env` |
| `deploy.credentials.save` | `(key: string, value: string) => HaiResult<void>`                        | 保存单个凭证 |
| `deploy.credentials.saveAll` | `(entries: Record<string, string>) => HaiResult<void>`                | 批量保存凭证 |
| `deploy.credentials.getPath` | `() => string`                                                         | 获取凭证文件路径 |
| `deploy.init`          | `(config: DeployConfigInput) => Promise<HaiResult<void>>`        | 初始化模块   |
| `deploy.close`         | `() => Promise<void>`                                                      | 关闭模块     |
| `deploy.scan`          | `(appDir: string) => Promise<HaiResult<ScanResult>>`             | 扫描应用（不依赖 init） |
| `deploy.provisionAll`  | `(projectName: string) => Promise<HaiResult<ProvisionResult[]>>` | 开通所有服务 |
| `deploy.deployApp`     | `(appDir: string, options?) => Promise<HaiResult<DeployResult>>` | 完整部署     |
| `deploy.config`        | `DeployConfig \| null`                                                     | 当前配置     |
| `deploy.isInitialized` | `boolean`                                                                  | 初始化状态   |

## 凭证管理

所有凭证操作都通过 `deploy.credentials.*` 访问，模块入口不再单独导出自由函数。

> `deploy.credentials.*()` 与 `deploy.scan()` 都不依赖 `deploy.init()`，可用于 CLI 在读取 `_deploy.yml` 之前准备环境。

## 错误码 — `HaiDeployError`

| 错误码                                  | code               | 说明                     |
| --------------------------------------- | ------------------ | ------------------------ |
| `HaiDeployError.DEPLOY_FAILED`         | `hai:deploy:001`   | 部署失败（通用）         |
| `HaiDeployError.PROJECT_CREATE_FAILED` | `hai:deploy:002`   | 平台项目创建失败         |
| `HaiDeployError.BUILD_FAILED`          | `hai:deploy:003`   | 应用构建失败             |
| `HaiDeployError.UPLOAD_FAILED`         | `hai:deploy:004`   | 构建产物上传失败         |
| `HaiDeployError.AUTH_REQUIRED`         | `hai:deploy:005`   | 未认证                   |
| `HaiDeployError.AUTH_FAILED`           | `hai:deploy:006`   | 认证失败                 |
| `HaiDeployError.PROVISION_FAILED`      | `hai:deploy:007`   | 基础设施开通失败         |
| `HaiDeployError.ADAPTER_MISSING`       | `hai:deploy:008`   | SvelteKit adapter 未安装 |
| `HaiDeployError.SCAN_FAILED`           | `hai:deploy:009`   | 应用扫描失败             |
| `HaiDeployError.NOT_INITIALIZED`       | `hai:deploy:010`   | 模块未初始化             |
| `HaiDeployError.ENV_VAR_FAILED`        | `hai:deploy:011`   | 环境变量设置失败         |
| `HaiDeployError.UNSUPPORTED_TYPE`      | `hai:deploy:012`   | 不支持的类型             |
| `HaiDeployError.CONFIG_ERROR`          | `hai:deploy:013`   | 配置错误                 |
| `HaiDeployError.CREDENTIAL_ERROR`      | `hai:deploy:014`   | 凭证读写失败             |
| `HaiDeployError.CONTAINER_RUNTIME_NOT_FOUND` | `hai:deploy:015` | 未找到容器运行时     |
| `HaiDeployError.CONTAINER_BUILD_FAILED` | `hai:deploy:016`  | 镜像构建失败             |
| `HaiDeployError.REMOTE_CONNECT_FAILED` | `hai:deploy:017`   | 远程连接失败             |
| `HaiDeployError.REMOTE_COMMAND_FAILED` | `hai:deploy:018`   | 远程命令失败             |
| `HaiDeployError.IMAGE_TRANSFER_FAILED` | `hai:deploy:019`   | 镜像传输失败             |
| `HaiDeployError.HEALTH_CHECK_FAILED`   | `hai:deploy:020`   | 健康检查未通过           |

## CLI 命令

```bash
# 部署当前目录
hai deploy

# 部署指定应用
hai deploy ./apps/admin-console

# 跳过基础设施开通
hai deploy --skip-provision

# 跳过构建
hai deploy --skip-build

# 自定义项目名
hai deploy --project-name my-custom-name
```

> 部署方式由 `config/_deploy.yml` 的 `provider.type` 决定（vercel / docker-ssh），
> CLI 命令相同。docker-ssh 成功后输出的访问地址为 `http://<host>:<hostPort>`。

## 常见模式

### 仅部署（跳过基础设施）

```typescript
await deploy.deployApp('./apps/my-app', { skipProvision: true })
```

### 仅开通基础设施

```typescript
await deploy.init(config)
const result = await deploy.provisionAll('my-project')
// 手动使用 result.data 中的环境变量
await deploy.close()
```

### 自定义部署流程

```typescript
import { deploy } from '@h-ai/deploy'

// Provider 通过 init 配置自动创建，不需要手动导入
await deploy.init({
  provider: { type: 'vercel', token: 'vel_xxx' },
})

// 使用 deploy API 部署
const result = await deploy.deployApp('./apps/my-app')
```

## 相关 Skills

- **hai-core** — 配置加载、日志、HaiResult 类型
- **hai-reldb** — 数据库（Neon PostgreSQL）
- **hai-cache** — 缓存（Upstash Redis）

失败与降级提示也必须国际化：官网 API 按请求 locale 生成 AI 降级/邮件送达状态；未送达不能称为已接收。CLI 部署状态使用 cliM，Gallery 加密能力限制使用双语消息。中文与英文分别验证未配置、失败和成功路径，无需调用付费服务。

云资源配置消费：Neon 输出 HAI_DB（PostgreSQL JSON），Upstash 输出 HAI_CACHE（Redis rediss URL JSON），R2 输出 HAI_STORAGE（扁平 S3 JSON）。邮件/短信输出 HAI_REACH_PROVIDERS 数组，deployApp 合并两个渠道并保留 YAML 中的消息模板；此覆盖替换原 providers 数组。Core 支持整体对象/数组覆盖，父节点优先于叶子变量，仍执行 Schema 校验；构建子进程与目标运行环境使用相同开通结果。R2 必须提供已有 S3 accessKeyId/secretAccessKey；Resend 必须提供已验证域名的 from；阿里云必须提供已审核 signName/模板。应用须已有相应 _db/_cache/_storage/_reach.yml 并在启动时加载，网络客户端需要 Node 运行时。

部署失败恢复：`ProvisionResult.resourceStatus` 标记 created/reused；`getDeployRecovery(result.error)` 读取 projectName、stage、platformProjectId 和资源清单，unknown 表示请求结果不确定，必须先在服务商控制台核对。失败资源已返回 ID 时保留该 ID。恢复结果不含 envVars、原始异常或连接凭证，CLI 会展示清单和建议。同名重试复用现有资源；不自动删除复用资源，新建资源仅在人工确认未被使用后清理。
