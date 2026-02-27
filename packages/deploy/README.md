# @h-ai/deploy

自动化部署模块，支持一键将 SvelteKit 应用部署到 Vercel，并自动开通所需的基础设施服务。

## 功能

- **Vercel 部署** — 自动创建项目、上传构建产物、设置环境变量
- **基础设施开通** — 自动开通 PostgreSQL (Neon)、Redis (Upstash)、S3 (Cloudflare R2)
- **凭证验证** — 验证邮件 (Resend) 和短信 (阿里云) 服务凭证
- **应用扫描** — 自动检测项目依赖和所需服务
- **双层配置** — `config/_deploy.yml` (git 安全) + `~/.hai/credentials.yml` (密钥)

## 快速开始

### 1. 安装

```bash
pnpm add @h-ai/deploy
```

### 2. 配置

通过 CLI 添加 deploy 模块：

```bash
hai add deploy
```

会在 `config/_deploy.yml` 生成配置模板。

### 3. 设置凭证

```bash
# 手动编辑 ~/.hai/credentials.yml
# 或通过环境变量设置
export HAI_DEPLOY_VERCEL_TOKEN=vel_xxx
```

### 4. 部署

```bash
hai deploy
```

## 使用示例

### 编程使用

```ts
import { deploy } from '@h-ai/deploy'

// 初始化
await deploy.init({
  provider: { type: 'vercel', token: 'vel_xxx' },
  services: {
    db: { provisioner: 'neon', apiKey: 'neon_xxx' },
    cache: { provisioner: 'upstash', email: 'a@b.com', apiKey: 'up_xxx' },
  },
})

// 扫描应用
const scan = await deploy.scan('./apps/my-app')

// 开通基础设施
const provisions = await deploy.provisionAll('my-app')

// 完整部署
const result = await deploy.deployApp('./apps/my-app')
if (result.success) {
  console.log(`Deployed: ${result.data.url}`)
}

await deploy.close()
```

### CLI 使用

```bash
# 部署当前目录
hai deploy

# 部署指定应用
hai deploy ./apps/admin-console

# 跳过基础设施开通
hai deploy --skip-provision

# 自定义项目名
hai deploy --project-name my-custom-name
```

## 支持的服务

| 服务类型 | Provisioner   | 说明                  |
| -------- | ------------- | --------------------- |
| 数据库   | Neon          | PostgreSQL Serverless |
| 缓存     | Upstash       | Redis REST API        |
| 存储     | Cloudflare R2 | S3 兼容对象存储       |
| 邮件     | Resend        | 邮件发送 API          |
| 短信     | 阿里云        | 阿里云短信服务        |

## 配置文件

### config/\_deploy.yml

```yaml
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
```

### ~/.hai/credentials.yml

```yaml
HAI_DEPLOY_VERCEL_TOKEN: vel_xxx
HAI_DEPLOY_NEON_API_KEY: neon_xxx
HAI_DEPLOY_UPSTASH_EMAIL: user@example.com
HAI_DEPLOY_UPSTASH_API_KEY: up_xxx
```
