# hai API Service

> 基于 Hono + oRPC + `@h-ai/serv` 的 API Service 组合根，负责初始化模块并装配 iam/storage/ai 领域的 procedures。

## 能力概览

- 公共 API 由 `@h-ai/api-contract` 定义，运行时由 `@h-ai/serv` 挂载。
- 默认启用 IAM / Storage / AI HTTP API。
- 业务 `/api/v1/*` 默认启用 `@h-ai/crypto` 传输加密。
- `/health`、`/ready`、`/openapi.json`、`/docs` 保持明文可访问，便于探针与联调。
- Node 部署入口为 `src/index.ts`，Hono app 工厂为 `src/app.ts`。

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

本应用在 `src/app.ts` 中组合应用级 contract：

```ts
import { aiContract, createApiContract, iamContract, storageContract } from '@h-ai/api-contract'

const contract = createApiContract({ iam: iamContract, storage: storageContract, ai: aiContract })
```

客户端调用示例：

```ts
import { api } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'

await crypto.init()
await api.init({
  baseUrl: 'http://localhost:3000/api/v1',
  transport: { crypto },
})
const login = await api.iam.auth.login({ identifier: 'alice', password: 'secret' })
await api.close()
await crypto.close()
```

### 传输加密说明

- 业务接口（默认 `/api/v1/*`）需要使用 `@h-ai/api-client`、`@h-ai/crypto` transport client 或等价的 transport-aware 客户端完成密钥协商。
- 明文可直接访问哪些路径，也由 `_serv.yml` 的 `transport.excludePaths` 决定；默认保留 `/health`、`/ready`、`/openapi.json`、`/docs`、`/_hai/scalar.js`。
- 默认密钥协商端点为 `POST /api/v1/_hai/key-exchange`；若你修改了 `http.apiPrefix` 或 `transport.keyExchangePath`，客户端也必须同步调整。

```yaml
# config/_serv.yml
http:
  apiPrefix: /api/v1

transport:
  keyExchangePath: /_hai/key-exchange
  excludePaths:
    - /health
    - /ready
    - /openapi.json
    - /docs
    - /_hai/scalar.js
  maxClients: 10000
```

客户端默认调用方式：

```ts
import { api } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'

await crypto.init()
await api.init({
  baseUrl: 'http://localhost:3000/api/v1',
  transport: { crypto },
})
```

如果 `_serv.yml` 自定义了密钥协商路径，则客户端也要传同一路径：

```ts
await api.init({
  baseUrl: 'http://localhost:3000/api/v1',
  transport: {
    crypto,
    keyExchangePath: '/custom/key-exchange',
  },
})
```

## API 概览

服务默认监听 `http://localhost:3000`。

| 路径                                      | 方法               | 说明                                      |
| ----------------------------------------- | ------------------ | ----------------------------------------- |
| `/health`                                 | GET                | 存活检查                                  |
| `/ready`                                  | GET                | 就绪检查                                  |
| `/openapi.json`                           | GET                | OpenAPI 3.1 规范（根路径）                |
| `/docs`                                   | GET                | Scalar 交互式文档（根路径）               |
| `/api/v1/auth/login`                      | POST               | 密码登录，返回 accessToken / refreshToken |
| `/api/v1/auth/logout`                     | POST               | 登出                                      |
| `/api/v1/auth/refresh`                    | POST               | 刷新 Token                                |
| `/api/v1/auth/register`                   | POST               | 注册并登录                                |
| `/api/v1/auth/send-otp`                   | POST               | 发送 OTP                                  |
| `/api/v1/auth/change-password`            | POST               | 修改当前用户密码                          |
| `/api/v1/auth/me`                         | PUT                | 更新当前用户信息                          |
| `/api/v1/iam/users`                       | GET / POST         | 用户列表 / 创建用户（需权限）             |
| `/api/v1/iam/users/{id}`                  | GET / PUT / DELETE | 查询 / 更新 / 删除用户（需权限）          |
| `/api/v1/iam/roles`                       | GET / POST         | 角色列表 / 创建角色（需权限）             |
| `/api/v1/iam/permissions`                 | GET / POST         | 权限列表 / 创建权限（需权限）             |
| `/api/v1/storage/presigned-urls/upload`   | POST               | 获取上传预签名 URL                        |
| `/api/v1/storage/presigned-urls/download` | POST               | 获取下载预签名 URL                        |
| `/api/v1/storage/files`                   | GET / DELETE       | 文件列表 / 删除文件                       |
| `/api/v1/storage/files/metadata`          | POST               | 查询文件元信息                            |
| `/api/v1/ai/chats/completions`            | POST               | 聊天补全（OpenAI 兼容结构）               |
| `/api/v1/ai/chats/messages`               | POST               | 发送单条消息，直接返回文本                |
| `/api/v1/ai/chats/history`                | POST               | 查询对话历史                              |
| `/api/v1/ai/memories/recall`              | POST               | 召回相关记忆                              |
| `/api/v1/ai/memories/list`                | POST               | 列出记忆                                  |
| `/api/v1/ai/sessions/list`                | POST               | 列出会话                                  |

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
import { api } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'

await crypto.init()

await api.init({
  baseUrl: 'http://localhost:3000/api/v1',
  transport: { crypto },
})

const register = await api.iam.auth.register({
  username: 'admin',
  password: 'Admin123!',
  email: 'admin@example.com',
})

const login = await api.iam.auth.login({
  identifier: 'admin',
  password: 'Admin123!',
})

const storage = await api.storage.file.getUploadUrl({
  key: 'uploads/demo.png',
  contentType: 'image/png',
})

void register
void login
void storage

await api.close()
await crypto.close()
```

如果你把 `config/_serv.yml` 中的 `transport.keyExchangePath` 改成了非默认值，记得同步把 `transport.keyExchangePath` 传给 `api.init(...)`。

## 配置

配置文件位于 `config/`：

- `_core.yml`：应用名称、版本、运行环境。
- `_serv.yml`：`@h-ai/serv` HTTP 入口 + transport 配置（`apiPrefix`、`openapi`、`docs`、`health`、`rpc`、`transport`）。
- `_db.yml`：关系数据库配置。
- `_cache.yml`：缓存配置。
- `_iam.yml`：认证与 RBAC 配置。
- `_storage.yml`：对象存储配置。
- `_vecdb.yml`：向量数据库配置。
- `_ai.yml`：AI 与 A2A 配置。

常用环境变量：

- `PORT`：默认 `3000`，Hono 服务端口。
- `HAI_RELDB_DATABASE`：默认 `./data/api-service.db`，SQLite 数据库路径。
- `HAI_CACHE_TYPE`：默认 `memory`，缓存类型。
- `HAI_STORAGE_ROOT`：默认 `./data/storage`，本地存储目录。

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
