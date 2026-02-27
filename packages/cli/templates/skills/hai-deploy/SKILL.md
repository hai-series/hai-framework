---
name: hai-deploy
description: 使用 @h-ai/deploy 进行自动化部署：Vercel 部署 + 基础设施开通（Neon/Upstash/R2/Resend/Aliyun）；当需求涉及应用部署、环境配置、凭证管理或云服务开通时使用。
---

# hai-deploy

> `@h-ai/deploy` 提供自动化部署能力，将 SvelteKit 应用部署到 Vercel，并自动开通 PostgreSQL (Neon)、Redis (Upstash)、S3 (Cloudflare R2)、邮件 (Resend)、短信 (阿里云) 等基础设施服务。

---

## 适用场景

- 一键部署 SvelteKit 应用到 Vercel
- 自动开通 PostgreSQL、Redis、S3 等云服务
- 管理部署凭证（~/.hai/credentials.yml）
- 扫描应用依赖，自动检测所需服务
- CLI 部署流程（`hai deploy`）

---

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
  email:
    provisioner: resend
    apiKey: ${HAI_DEPLOY_RESEND_API_KEY}
  sms:
    provisioner: aliyun
    accessKeyId: ${HAI_DEPLOY_ALIYUN_ACCESS_KEY_ID}
    accessKeySecret: ${HAI_DEPLOY_ALIYUN_ACCESS_KEY_SECRET}
```

### 2. 初始化与关闭

```typescript
import { deploy } from '@h-ai/deploy'

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

---

## 核心 API

| 方法                   | 签名                                                                       | 说明         |
| ---------------------- | -------------------------------------------------------------------------- | ------------ |
| `deploy.init`          | `(config: DeployConfigInput) => Promise<Result<void, DeployError>>`        | 初始化模块   |
| `deploy.close`         | `() => Promise<void>`                                                      | 关闭模块     |
| `deploy.scan`          | `(appDir: string) => Promise<Result<ScanResult, DeployError>>`             | 扫描应用     |
| `deploy.provisionAll`  | `(projectName: string) => Promise<Result<ProvisionResult[], DeployError>>` | 开通所有服务 |
| `deploy.deployApp`     | `(appDir: string, options?) => Promise<Result<DeployResult, DeployError>>` | 完整部署     |
| `deploy.config`        | `DeployConfig \| null`                                                     | 当前配置     |
| `deploy.isInitialized` | `boolean`                                                                  | 初始化状态   |

---

## 凭证管理

| 函数                         | 说明                                       |
| ---------------------------- | ------------------------------------------ |
| `loadCredentials()`          | 加载 ~/.hai/credentials.yml 到 process.env |
| `saveCredential(key, value)` | 保存单个凭证                               |
| `saveCredentials(entries)`   | 批量保存凭证                               |
| `getCredentialsPath()`       | 获取凭证文件路径                           |

---

## 错误码

| 名称                  | 值   | 说明                     |
| --------------------- | ---- | ------------------------ |
| DEPLOY_FAILED         | 9000 | 部署失败（通用）         |
| PROJECT_CREATE_FAILED | 9001 | 平台项目创建失败         |
| BUILD_FAILED          | 9002 | 应用构建失败             |
| UPLOAD_FAILED         | 9003 | 构建产物上传失败         |
| AUTH_REQUIRED         | 9004 | 未认证                   |
| AUTH_FAILED           | 9005 | 认证失败                 |
| PROVISION_FAILED      | 9006 | 基础设施开通失败         |
| ADAPTER_MISSING       | 9007 | SvelteKit adapter 未安装 |
| SCAN_FAILED           | 9008 | 应用扫描失败             |
| ENV_VAR_FAILED        | 9009 | 环境变量设置失败         |
| NOT_INITIALIZED       | 9010 | 模块未初始化             |
| UNSUPPORTED_TYPE      | 9011 | 不支持的类型             |
| CONFIG_ERROR          | 9012 | 配置错误                 |
| CREDENTIAL_ERROR      | 9013 | 凭证读写失败             |

---

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

---

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

### 自定义 Provider

```typescript
import { createVercelProvider } from '@h-ai/deploy'

const provider = createVercelProvider()
await provider.authenticate('vel_xxx')
const projectId = await provider.createProject('my-app')
await provider.setEnvVars(projectId.data, { KEY: 'value' })
```
