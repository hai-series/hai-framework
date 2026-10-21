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
> 2. **docker-ssh** — 将原生 fullstack API 或 SvelteKit（adapter-node）应用容器化后经 SSH 部署到任意具备 docker/podman + compose 的 Linux 主机，按所选功能自动生成 compose sidecar。

## 运行环境

> ⚠️ **Node.js CLI / 服务端模块。** 通过 `hai deploy` CLI 命令或在 Node.js 脚本中使用。
> docker-ssh 方式要求本地安装 docker 或 podman（`auto` 优先 podman）。

当前 Node 要求 `^22.22.2 || ^24.15.0 || >=26.0.0`，生成工程固定 pnpm 12.11.2；Node 20 / pnpm 9.5.0 不受支持。Windows 必须有已启动、能构建目标 Linux 架构的容器引擎，不能把仅安装客户端或远程有 Docker 当作本地可构建。

## 适用场景

- 一键部署 SvelteKit 应用到 Vercel
- 容器化后经 SSH 部署到自有服务器 / 云主机 / 内网虚拟机（docker-ssh）
- 自动开通 PostgreSQL、Redis、S3 等云服务，或按功能生成自建 sidecar
- 管理部署凭证（~/.hai/credentials.yml）
- 扫描应用依赖，自动检测所需服务
- CLI 部署流程（`hai deploy`）

## 使用步骤

部署前按 [环境与中间件向导](middleware.md) 先选择环境并检查对应文件，再逐项选择默认配置、自定义连接或保持不变。用户确认配置已完备时，可选择直接部署或传 `--skip-middleware` 跳过全部中间件处理。SSH 地址、端口、密钥路径及平台 Token 首次填写后仅保存 `.env.local`，后续自动复用。该文档列出模块依赖、后端、连接字段、云开通边界和启动验证要求。

### 1. 配置

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
  storage:
    provisioner: cloudflare-r2
    accountId: ${HAI_DEPLOY_SERVICES_STORAGE_ACCOUNTID}
    apiToken: ${HAI_DEPLOY_SERVICES_STORAGE_APITOKEN}
    accessKeyId: ${HAI_DEPLOY_SERVICES_STORAGE_ACCESSKEYID}
    secretAccessKey: ${HAI_DEPLOY_SERVICES_STORAGE_SECRETACCESSKEY}
  email:
    provisioner: resend
    apiKey: ${HAI_DEPLOY_SERVICES_EMAIL_APIKEY}
    from: ${HAI_DEPLOY_SERVICES_EMAIL_FROM}
  sms:
    provisioner: aliyun
    accessKeyId: ${HAI_DEPLOY_SERVICES_SMS_ACCESSKEYID}
    accessKeySecret: ${HAI_DEPLOY_SERVICES_SMS_ACCESSKEYSECRET}
    signName: ${HAI_DEPLOY_SERVICES_SMS_SIGNNAME}
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
    host: ${HAI_DEPLOY_PROVIDER_SSH_HOST}
    port: 22
    username: deploy
    identityFile: ${HAI_DEPLOY_PROVIDER_SSH_IDENTITYFILE} # 私钥文件路径，省略则用 ssh-agent
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
  # 启用的服务会被加入远程 compose sidecar（postgres/redis/rustfs 或 minio）
  # 若配置了云 Provisioner（如 neon），则优先用云资源，不再自建 sidecar
  db:
    provisioner: neon
    apiKey: ${HAI_DEPLOY_SERVICES_DB_APIKEY}
```

docker-ssh 要点：

- 应用镜像优先使用工程自带的 Dockerfile；SvelteKit 需要 adapter-node，原生 fullstack 服务自动生成以 `dist/index.js` 启动的镜像。
- compose 按 `deploy.scan()` 识别的服务**及其后端类型**生成匹配 sidecar 并注入 `HAI_*` 覆盖变量：
  - `db`：`postgresql`→postgres、`mysql`→mysql、`sqlite`→数据卷（无 sidecar）→ `HAI_DB`
  - `cache`：`redis`→redis → `HAI_CACHE`；`storage`：`s3`→RustFS/MinIO（container.s3Engine） → `HAI_STORAGE`
  - `vecdb`：`qdrant`/`pgvector`/`chroma`→对应 sidecar、`lancedb`→数据卷 → `HAI_VECDB`
- 若同一服务已配置云 Provisioner（如 neon 提供 `HAI_DB`），优先用云资源，不再自建 sidecar
- sidecar 密码写被忽略的本机私有配置及远程 `.env.runtime`（权限 600），不入公共环境文件或 `compose.yml`
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
const scanResult = await deploy.scan('./apps/my-app', { environment: 'test' })
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
| `deploy.scan`          | `(appDir: string, options?: DeployScanOptions) => Promise<HaiResult<ScanResult>>` | 按环境扫描（不依赖 init） |
| `deploy.provisionAll`  | `(projectName: string, services?: ServiceType[]) => Promise<HaiResult<ProvisionResult[]>>` | 开通指定或全部已配置服务 |
| `deploy.deployApp`     | `(appDir: string, options?) => Promise<HaiResult<DeployResult>>` | 完整部署     |
| `deploy.config`        | `DeployConfig \| null`                                                     | 当前配置     |
| `deploy.isInitialized` | `boolean`                                                                  | 初始化状态   |

## 凭证管理

所有凭证操作都通过 `deploy.credentials.*` 访问，模块入口不再单独导出自由函数。

> `deploy.credentials.*()` 与 `deploy.scan()` 都不依赖 `deploy.init()`，可用于 CLI 在读取 `_deploy.yml` 之前准备环境。

## 配置消费与失败恢复

云资源配置消费：Neon 输出 HAI_DB（PostgreSQL JSON），Upstash 输出 HAI_CACHE（Redis rediss URL JSON），R2 输出 HAI_STORAGE（扁平 S3 JSON）。邮件/短信输出 HAI_REACH_PROVIDERS 数组，deployApp 合并两个渠道并保留 YAML 中的消息模板；此覆盖替换原 providers 数组。Core 支持整体对象/数组覆盖，父节点优先于叶子变量，仍执行 Schema 校验；构建子进程与目标运行环境使用相同开通结果。R2 必须提供已有 S3 accessKeyId/secretAccessKey；Resend 必须提供已验证域名的 from；阿里云必须提供已审核 signName/模板。应用须已有相应 _db/_cache/_storage/_reach.yml 并在启动时加载，网络客户端需要 Node 运行时。

部署失败恢复：`ProvisionResult.resourceStatus` 标记 created/reused；`getDeployRecovery(result.error)` 读取 projectName、stage、platformProjectId 和资源清单，unknown 表示请求结果不确定，必须先在服务商控制台核对。失败资源已返回 ID 时保留该 ID。恢复结果不含 envVars、原始异常或连接凭证，CLI 会展示清单和建议。同名重试复用现有资源；不自动删除复用资源，新建资源仅在人工确认未被使用后清理。

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

通过 CLI 部署前，先按 [CLI 安装与命令](../hai-app-create/development.md#cli-安装与命令) 全局安装 `@h-ai/cli`，确认 `hai --version` 可运行后再执行下列命令。在 Node.js 脚本中直接使用 `@h-ai/deploy` API 时无需安装 CLI。

```bash
# 部署当前目录
hai deploy

# 部署指定应用
hai deploy ./apps/admin-console --env test

# 跳过基础设施开通
hai deploy --env prod --skip-provision

# 仅 Vercel：跳过应用构建；docker-ssh 仍会构建镜像
hai deploy --env prod --skip-build

# 自定义项目名
hai deploy --project-name my-custom-name
```

> 部署方式由 `config/_deploy.yml` 的 `provider.type` 决定（vercel / docker-ssh），
> CLI 命令相同。docker-ssh 成功后输出的访问地址为 `http://<host>:<hostPort>`。

fullstack 选择 Web 和 deploy 时，服务配置包含 `container.web`，`hai deploy packages/my-app-serv --env prod` 一次构建并发布 API/Web；Web 公开 hostPort，同源代理内部 API，返回 URL 为 Web 入口。未配置 Web 时仍为单服务。Web 不挂载 API 私有环境；两个镜像共用部署 ID，全部构建成功才开始上传，API/Web 都通过健康检查才报告成功。模板 `pnpm run deploy` 是打包脚本，不等于 CLI 发布。

离线部署先按 [离线准备与验收](middleware.md#离线准备与验收) 检查材料。docker-ssh 在本地构建并导出镜像 tar，再分别上传镜像、Compose、运行环境和启动脚本，不在远程构建源码。当前无直接指定预构建镜像的参数；不得声称 `--skip-build` 能离线发布容器，也不得将联网部署测试作为断网证明。

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
