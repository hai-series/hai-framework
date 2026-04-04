# @h-ai/deploy

自动化部署模块，支持一键将 SvelteKit 应用部署到 Vercel，并自动开通所需的基础设施服务。

## 支持的服务

| 服务类型 | Provisioner   | 说明                  |
| -------- | ------------- | --------------------- |
| 部署     | Vercel        | SvelteKit 应用部署    |
| 数据库   | Neon          | PostgreSQL Serverless |
| 缓存     | Upstash       | Redis REST API        |
| 存储     | Cloudflare R2 | S3 兼容对象存储       |
| 邮件     | Resend        | 邮件发送 API          |
| 短信     | 阿里云        | 阿里云短信服务        |

## 快速开始

```typescript
import { deploy } from '@h-ai/deploy'

// 初始化
await deploy.init({
  provider: { type: 'vercel', token: 'vel_xxx' },
  services: {
    db: { provisioner: 'neon', apiKey: 'neon_xxx' },
    cache: { provisioner: 'upstash', email: 'a@b.com', apiKey: 'up_xxx' },
  },
})

// 扫描应用依赖
const scan = await deploy.scan('./apps/my-app')

// 开通基础设施
const provisions = await deploy.provisionAll('my-app')

// 完整部署
const result = await deploy.deployApp('./apps/my-app')

await deploy.close()
```

## 配置

通过 `config/_deploy.yml` 管理 git 安全的配置，密钥存放在 `~/.hai/credentials.yml`：

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
```

## 错误处理

```typescript
const result = await deploy.deployApp('./apps/my-app')
if (!result.success) {
  switch (result.error.code) {
    case HaiDeployError.PROVIDER_AUTH_FAILED.code:
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
| `HaiDeployError.BUILD_FAILED`     | `hai:deploy:002` | 构建失败     |
| `HaiDeployError.AUTH_FAILED`      | `hai:deploy:005` | 认证失败     |
| `HaiDeployError.PROVISION_FAILED` | `hai:deploy:006` | 资源开通失败 |
| `HaiDeployError.NOT_INITIALIZED`  | `hai:deploy:010` | 未初始化     |

## 测试

```bash
pnpm --filter @h-ai/deploy test
```

## License

Apache-2.0
