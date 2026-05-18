# hai API Service

> 基于 Hono + oRPC + `@h-ai/serv` 的 API Service 组合根，负责初始化模块并装配 iam/storage/ai 领域的 procedures。

## 能力概览

- 公共 API 由 `@h-ai/api-contract` 定义，运行时由 `@h-ai/serv` 挂载。
- 默认启用 IAM / Storage / AI HTTP API。
- 提供 `/health`、`/ready`、`/openapi.json`、`/docs`。
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

await api.init({ baseUrl: 'http://localhost:3000/api/v1' })
const login = await api.iam.auth.login({ identifier: 'alice', password: 'secret' })
await api.close()
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

## curl 示例

> 完整交互式文档见 `http://localhost:3000/docs`。以下示例假设服务已启动在 `localhost:3000`。

### 健康检查

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

### 注册（首次测试请先注册用户）

服务没有内置默认账号，需先注册一个用户：

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin123!","email":"admin@example.com"}'
# 注册成功后直接返回 tokens，可跳过登录步骤直接使用
```

### 登录

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin","password":"Admin123!"}'
# 响应：{"success":true,"data":{"user":{...},"tokens":{"accessToken":"...","refreshToken":"...","expiresIn":3600,"tokenType":"Bearer"},...}}
```

### 刷新 Token

```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"your-refresh-token"}'
```

### 使用 Token 访问受保护端点

```bash
TOKEN="your-access-token"

# 文件列表（可选 prefix 过滤）
curl "http://localhost:3000/api/v1/storage/files?prefix=uploads/" \
  -H "Authorization: Bearer $TOKEN"

# 获取上传预签名 URL
curl -X POST http://localhost:3000/api/v1/storage/presigned-urls/upload \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"key":"uploads/demo.png","contentType":"image/png"}'

# 聊天补全
curl -X POST http://localhost:3000/api/v1/ai/chats/completions \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"messages":[{"role":"user","content":"你好"}]}'

# 简单消息（返回纯文本内容字段）
curl -X POST http://localhost:3000/api/v1/ai/chats/messages \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message":"帮我写一个 hello world"}'
```

## 配置

配置文件位于 `config/`：

- `_core.yml`：应用名称、版本、运行环境。
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
```

## License

Apache-2.0
