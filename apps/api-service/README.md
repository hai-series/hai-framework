# hai API Service

> 基于 oRPC + `@h-ai/serv` 的 API Service 组合根，负责初始化模块并装配 iam/storage/ai 领域的 procedures（底层运行时由 serv 内部实现）。

## 能力概览

- 公共 API 由 `@h-ai/api-contract` 定义，运行时由 `@h-ai/serv` 挂载。
- 默认启用 IAM / Storage / AI HTTP API。
- 业务 `/api/v1/*` 默认启用 `@h-ai/crypto` 传输加密。
- 默认放行 `localhost` / `127.0.0.1` 任意端口，以及 Tauri / Capacitor WebView origin 的 CORS 预检与响应头，便于桌面端 / 移动端跨 origin 联调。
- transport 响应默认通过 `Access-Control-Expose-Headers` 暴露 `X-Encrypted` / `X-Request-Id`，保证浏览器端 client 可以读取并解密响应。
- 默认启用 httpOnly refresh-token Cookie：登录/注册响应只在 JSON 中返回 access token，refresh token 通过 `Set-Cookie` 管理。
- `/health`、`/ready`、`/openapi.json`、`/docs` 保持明文可访问，便于探针与联调。
- Node 部署入口为 `src/index.ts`，HTTP App 工厂为 `src/app.ts`。

## 快速开始

```bash
pnpm install
pnpm --filter api-service dev
```

生产构建与启动：

```bash
pnpm --filter api-service build
pnpm --filter api-service preview
```

## API 契约

本服务与桌面端共用的应用级 contract 已独立为 `@h-ai/api-service-contract`，禁止从 `apps/api-service/src` 跨应用导入。
该包组合了框架通用领域契约（iam/storage/ai）与服务自有契约（`app.info` / `app.echo`）：

```ts
import { apiServiceContract } from '@h-ai/api-service-contract'

apiServiceContract.iam.auth.login
apiServiceContract.storage.presignedUrls.createUpload
apiServiceContract.ai.chats.createCompletion
apiServiceContract.app.info
apiServiceContract.app.echo
```

自定义路由通过 `apiContract.route(...)` 定义在契约包中，`@h-ai/serv` 只负责运行时挂载与 procedure 实现：

```ts
import { apiContract } from '@h-ai/api-contract'
import { AppInfoOutputDataSchema } from './app-schemas.js'

export const appContract = {
  info: apiContract
    .route({ method: 'POST', path: '/app/info', operationId: 'app.info', tags: ['app'] })
    .output(apiContract.haiResultSchema(AppInfoOutputDataSchema)),
}
```

服务端实现位于 `src/server/procedures/app-procedures.ts`。公开过程直接注册 handler，
需要登录的过程在同一条 route 链上声明 `.auth()`：

```ts
import type { ServContext } from '@h-ai/serv'
import { appContract } from '@h-ai/api-service-contract'
import { ok } from '@h-ai/core'
import { serv } from '@h-ai/serv'

export const router = serv
  .implement(appContract)
  .context<ServContext>()
  .route('info', () => ok({ /* 服务元信息 */ }))
  .route('echo')
  .auth()
  .handle(({ input, context }) => ok({
    message: input.message,
    userId: context.session.userId,
    requestId: context.requestId,
    timestamp: new Date().toISOString(),
  }))
  .build()
```

客户端用同一个 `apiServiceContract` 构造类型安全 client：

```ts
import { apiClient } from '@h-ai/api-client'
import { apiServiceContract } from '@h-ai/api-service-contract'
import { crypto } from '@h-ai/crypto'

await crypto.init()
const client = apiClient.create(apiServiceContract)
await client.init({
  baseUrl: 'http://localhost:3000/api/v1',
  transport: { crypto },
  auth: {}, // 默认 httpOnly cookie 模式；Node/测试如无 Cookie Jar 可显式使用 memory storage
})

// 公开端点
const info = await client.app.info()

// 鉴权端点：需先登录
await client.iam.auth.register({ username: 'alice', password: 'Secret123!' })
const echoed = await client.app.echo({ message: 'hi' })

void info
void echoed

await client.close()
await crypto.close()
```

### 传输加密说明

- 业务接口（默认 `/api/v1/*`）需要使用 `@h-ai/api-client`、`@h-ai/crypto` transport client 或等价的 transport-aware 客户端完成密钥协商。
- API 前缀、基础设施路径、明文排除路径和跨端 Header 统一由 `config/_serv.yml` 定义。
- 默认密钥协商端点为 `POST /api/v1/_hai/key-exchange`；修改配置时，客户端的完整 API Base 与密钥协商路径也需同步。
- 启用 `auth: {}` 与 `transport: { crypto }` 时，401 后的 `/auth/refresh` 也会复用同一 transport 会话，不会降级为明文刷新。
- 浏览器 / WebView 跨 origin 联调统一配置 `config/_serv.yml` 的 `cors.origin` 与 `cors.nativeOrigins`。生产环境禁止空值和 `*`，并按规范化后的完整 Origin 精确匹配；不要在 `src/app.ts` 维护业务侧白名单函数。
- `serv.createRuntimeSecurityPolicy(...)` 将配置收敛为运行时安全上限：生产环境启用 Secure refresh cookie，并关闭 OpenAPI/docs；具体路径与跨端 Header 仍完全由 `_serv.yml` 决定。

```yaml
# config/_serv.yml
http:
  apiPrefix: /api/v1
  health:
    path: /health
    readyPath: /ready

cors:
  origin: '*'
  nativeOrigins: http://localhost,https://tauri.localhost,tauri://localhost,capacitor://localhost
  allowedHeaders:
    - Authorization
    - X-Client-Id
  exposedHeaders:
    - X-Encrypted

transport:
  keyExchangePath: /_hai/key-exchange
  excludePaths:
    - /health
```

客户端默认调用方式：

```ts
import { apiClient } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'

await crypto.init()
await apiClient.init({
  baseUrl: 'http://localhost:3000/api/v1',
  transport: { crypto },
})
```

如果 `_serv.yml` 自定义了密钥协商路径，则客户端也要传同一路径：

```ts
await apiClient.init({
  baseUrl: 'http://localhost:3000/api/v1',
  transport: {
    crypto,
    keyExchangePath: '/custom/key-exchange',
  },
})
```

## API 概览

服务默认监听 `http://localhost:3000`。

| 路径                                      | 方法               | 说明                                                                 |
| ----------------------------------------- | ------------------ | -------------------------------------------------------------------- |
| `/health`                                 | GET                | 存活检查                                                             |
| `/ready`                                  | GET                | 就绪检查                                                             |
| `/openapi.json`                           | GET                | OpenAPI 3.1 规范（根路径）                                           |
| `/docs`                                   | GET                | Scalar 交互式文档（根路径）                                          |
| `/api/v1/auth/login`                      | POST               | 密码登录，返回 accessToken，并通过 httpOnly Cookie 设置 refreshToken |
| `/api/v1/auth/logout`                     | POST               | 登出                                                                 |
| `/api/v1/auth/refresh`                    | POST               | 从 httpOnly Cookie 刷新 Token                                        |
| `/api/v1/auth/register`                   | POST               | 注册并登录                                                           |
| `/api/v1/auth/send-otp`                   | POST               | 发送 OTP                                                             |
| `/api/v1/auth/change-password`            | POST               | 修改当前用户密码                                                     |
| `/api/v1/auth/me`                         | GET / PUT          | 获取当前用户及最新角色/权限 / 更新当前用户信息                       |
| `/api/v1/iam/users`                       | GET / POST         | 用户列表 / 创建用户（需权限）                                        |
| `/api/v1/iam/users/{id}`                  | GET / PUT / DELETE | 查询 / 更新 / 删除用户（需权限）                                     |
| `/api/v1/iam/roles`                       | GET / POST         | 角色列表 / 创建角色（需权限）                                        |
| `/api/v1/iam/permissions`                 | GET / POST         | 权限列表 / 创建权限（需权限）                                        |
| `/api/v1/storage/presigned-urls/upload`   | POST               | 获取上传预签名 URL                                                   |
| `/api/v1/storage/presigned-urls/download` | POST               | 获取下载预签名 URL                                                   |
| `/api/v1/storage/files`                   | GET / DELETE       | 文件列表 / 删除文件                                                  |
| `/api/v1/storage/files/metadata`          | POST               | 查询文件元信息                                                       |
| `/api/v1/ai/chats/completions`            | POST               | 聊天补全（OpenAI 兼容结构）                                          |
| `/api/v1/ai/chats/messages`               | POST               | 发送单条消息，直接返回文本                                           |
| `/api/v1/ai/chats/history`                | POST               | 查询对话历史                                                         |
| `/api/v1/ai/memories/recall`              | POST               | 召回相关记忆                                                         |
| `/api/v1/ai/memories/list`                | POST               | 列出记忆                                                             |
| `/api/v1/ai/sessions/list`                | POST               | 列出会话                                                             |
| `/api/v1/app/info`                        | POST               | 服务元信息（公开，无需登录）                                         |
| `/api/v1/app/echo`                        | POST               | 演示：回显消息 + 调用者上下文（需登录）                              |

## 调用示例

> 完整交互式文档见 `http://localhost:3000/docs`。以下示例假设服务已启动在 `localhost:3000`。

### 健康检查

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

### 业务 API（默认需要传输加密）

业务 `/api/v1/*` 端点默认要求先完成 `/_hai/key-exchange` 密钥协商，因此不再建议用明文 `curl` 直接 POST 登录/注册。
推荐统一使用 `@h-ai/api-client` + `@h-ai/crypto`：

```ts
import { apiClient } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'

await crypto.init()

await apiClient.init({
  baseUrl: 'http://localhost:3000/api/v1',
  transport: { crypto },
  auth: {},
})

const register = await apiClient.iam.auth.register({
  username: 'admin',
  password: 'Admin123!',
  email: 'admin@example.com',
})

const login = await apiClient.iam.auth.login({
  identifier: 'admin',
  password: 'Admin123!',
})
if (login.success)
  await apiClient.auth.setTokens(login.data.tokens)

const storage = await apiClient.storage.file.getUploadUrl({
  key: 'uploads/demo.png',
  contentType: 'image/png',
})

void register
void login
void storage

await apiClient.close()
await crypto.close()
```

如果修改了 `_serv.yml.transport.keyExchangePath`，记得同步客户端的 `transport.keyExchangePath`。

## 配置

配置文件位于 `config/`：

- `_core.yml`：应用名称、版本、运行环境。
- `_serv.yml`：`@h-ai/serv` 的 HTTP、CORS 与加密 transport 配置；配置文件是生产传输约定的权威来源。
- `_db.yml`：关系数据库配置。
- `_cache.yml`：缓存配置。
- `_iam.yml`：认证与 RBAC 配置。
- `_storage.yml`：对象存储配置。
- `_vecdb.yml`：向量数据库配置。
- `_ai.yml`：AI 与 A2A 配置。

常用环境变量：

- `PORT`：默认 `3000`，HTTP 服务端口。
- `HAI_DB_DATABASE`：默认 `./data/api-service.db`，SQLite 数据库路径。
- `HAI_CACHE_TYPE`：默认 `memory`，缓存类型。
- `HAI_STORAGE_ROOT`：默认 `./data/storage`，本地存储目录。
- `HAI_SERV_CORS_ORIGIN`：覆盖 `_serv.yml` 的 `cors.origin`。

配置环境变量统一按 `HAI_<配置名>_<YAML 路径>` 生成，优先级高于 YAML；
camelCase key 不拆词，例如 `cors.nativeOrigins` 对应
`HAI_SERV_CORS_NATIVEORIGINS`。

## 错误处理

业务错误通过 `HaiResult<T>` 返回，客户端统一判断 `result.success`。API 文档和 OpenAPI JSON 可用于生成跨端 SDK 或联调。

## 测试

```bash
pnpm --filter api-service check
pnpm --filter api-service lint
pnpm --filter api-service test
```

## License

Apache-2.0
