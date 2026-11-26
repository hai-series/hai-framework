# hai API Service

## 简介

基于 oRPC + `@h-ai/serv` 的 API Service 组合根，负责初始化模块并装配 iam/storage/ai 领域的 procedures（底层运行时由 serv 内部实现）。

## 核心功能清单

- 公共 API 由 `@h-ai/api-contract` 定义，运行时由 `@h-ai/serv` 挂载。
- 默认启用 IAM / Storage / AI HTTP API。
- 业务 `/api/v1/*` 默认启用 `@h-ai/crypto` 传输加密。
- 默认放行 `localhost` / `127.0.0.1` 任意端口，以及 Tauri / Capacitor WebView origin 的 CORS 预检与响应头，便于桌面端 / 移动端跨 origin 联调。
- transport 响应默认通过 `Access-Control-Expose-Headers` 暴露 `X-Encrypted` / `X-Request-Id`，保证浏览器端 client 可以读取并解密响应。
- 浏览器默认使用 httpOnly refresh-token Cookie：JSON 只返回 access token；受信原生客户端通过正文接收刷新令牌，判定条件见下方认证说明。
- `/health`、`/ready`、`/openapi.json`、`/docs` 保持明文可访问，便于探针与联调。
- Node 部署入口为 `src/index.ts`，HTTP App 工厂为 `src/app.ts`。

## 使用入门

### 快速开始

传输加密默认启用，开发和测试从 `.env.dev`、`.env.test` 读取示例密钥环。生产通过 `.env.prod.local` 或 Secret Manager 注入独立的 `HAI_CRYPTO_TRANSPORT_SERVERKEYRING`，结构为 `{activeKeyId,keys:{id:{publicKey,privateKey}}}`。各生产实例使用同一个密钥环和共享 Redis 登记客户端公钥，客户端可在实例间继续使用已建立的加密会话。 [Crypto 传输说明](../../packages/crypto/README.md)

```bash
pnpm install
pnpm --filter api-service dev
```

生产构建与启动：

```bash
pnpm --filter api-service build
pnpm --filter api-service preview
```

`.env.prod` 使用共享 PostgreSQL、Redis、S3、Qdrant，默认服务地址对应 Compose 的 `db/cache/storage/vecdb`。容器外运行需私有覆盖地址，并注入数据库/缓存密码、S3/模型凭据、受保护向量库的 API Key 和真实 `HAI_REACH_PROVIDERS` JSON。公开空 Provider 数组会拒绝生产启动。数据库、向量库先于 AI 初始化；初始化或后续 transport/app 构造失败均等待逆序清理，关闭失败保留具体错误并允许重试，不能视为资源已释放。

### API 契约

本服务与桌面端共用的应用级 contract 已独立为 `@h-ai/api-service-contract`，禁止从 `apps/api-service/src` 跨应用导入。
该包用 `apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai, app: appContract })` 选择应用提供的领域。组合结果包含标准 IAM、Storage、AI 操作及本应用的 `app.info` 和 `app.echo`。

```ts
import { apiServiceContract } from '@h-ai/api-service-contract'

apiServiceContract.iam.auth.login
apiServiceContract.storage.presignedUrls.createUpload
apiServiceContract.ai.chats.createCompletion
apiServiceContract.app.info
apiServiceContract.app.echo
```

#### 声明单个 HTTP 操作

`appContract` 将多个操作放在同一领域。下例节选 `@h-ai/api-service-contract` 中的 `info` 操作。它声明 `POST /app/info`、OpenAPI 分组和成功数据。见[路由字段与 Schema](../../docs/usage/function/api-contract.md#declare-routes)。

```ts
import { apiContract } from '@h-ai/api-contract'
import { AppInfoOutputDataSchema } from '@h-ai/api-service-contract'

const info = apiContract.route({
  method: 'POST',
  path: '/app/info',
  operationId: 'app.info',
  tags: ['app'],
}).output(apiContract.haiResultSchema(AppInfoOutputDataSchema))

// 从已声明的单个操作对象取得原始路径。应用前缀为 /api/v1 时，实际路径为 /api/v1/app/info。
const infoPath = apiContract.pathOf(info)
```

#### 用 Serv 绑定实现

服务端实现位于 `src/server/procedures/app-procedures.ts`。传给 `serv.implement(appContract)` 的是包含 `info` 和 `echo` 的领域契约。`.route('info', handler)` 使用契约对象内的键。需要登录的 `echo` 使用 `.route('echo').auth().handle(handler)`。见[用 Serv 装配契约](../../docs/usage/function/api-contract.md#use-with-serv)。

```ts
import type { ServContext } from '@h-ai/serv'
import { appContract } from '@h-ai/api-service-contract'
import { core } from '@h-ai/core'
import { serv } from '@h-ai/serv'

const startedAt = Date.now()
export const router = serv.implement(appContract)
  .context<ServContext>()
  // 无需登录，返回服务信息。生产实现从应用配置读取 name、version 和 transportEnabled。
  .route('info', () => core.ok({
    name: 'demo',
    version: '1.0.0',
    uptimeMs: Math.max(0, Date.now() - startedAt),
    transportEnabled: true,
  }))
  .route('echo')
  .auth()
  // 认证后回显校验通过的消息和请求信息。未登录时不进入处理器。
  .handle(({ input, context }) => core.ok({
    message: input.message,
    userId: context.session.userId,
    requestId: context.requestId,
    timestamp: new Date().toISOString(),
  }))
  .build()
```

#### 用共享契约创建客户端

下面使用已启动的本机服务，并假定已有测试账号。把账号的登录输入传给 `callExampleService`。使用已由宿主管理的客户端时，由宿主统一初始化和关闭依赖。

```ts
import type { IamLoginInput } from '@h-ai/api-contract'
import { apiClient } from '@h-ai/api-client'
import { apiServiceContract } from '@h-ai/api-service-contract'
import { crypto } from '@h-ai/crypto'

export async function callExampleService(credentials: IamLoginInput) {
  // 先初始化加密依赖。失败时结束，避免发送未装配的请求。
  const cryptography = await crypto.init()
  if (!cryptography.success)
    throw new Error(cryptography.error.message)

  const client = apiClient.create(apiServiceContract)
  try {
    // 使用本机服务的 API 前缀与浏览器 Cookie 续期配置。
    const ready = await client.init({
      baseUrl: 'http://localhost:3000/api/v1',
      transport: { crypto },
      auth: {},
    })
    if (!ready.success)
      throw new Error(ready.error.message)

    const info = await client.app.info()
    if (!info.success)
      throw new Error(info.error.message)

    // 标准认证动作保存成功登录返回的凭据，后续调用可使用当前会话。
    const actions = apiClient.createAuthActions(client)
    const login = await actions.login(credentials)
    if (!login.success)
      throw new Error(login.error.message)

    const echoed = await client.app.echo({ message: 'hi' })
    if (!echoed.success)
      throw new Error(echoed.error.message)
    return { info: info.data, echoed: echoed.data }
  }
  finally {
    await client.close()
    await crypto.close()
  }
}
```

#### 原生与浏览器认证

浏览器将 access token 保存在内存，登录、注册和刷新请求使用跨域凭据接收/发送 httpOnly refresh Cookie；服务端必须配置真实的 CORS Origin 并允许凭据。Node 内置 fetch 不保存 Cookie，自动续期须由宿主提供带 Cookie Jar 的 fetch。

独立原生客户端使用 `hai-mobile-app` / `hai-desktop-app` 标识和 `x-hai-token-transport: body`。API 同时检查这两个字段及 `HAI_SERV_CORS_NATIVEORIGINS` 中的真实 Origin，符合时才在正文返回 refresh token。默认来源涵盖 Capacitor 的 `capacitor://localhost` / `https://localhost` 和 Tauri 的本地来源；live reload 或自定义 scheme/host/端口须显式配置其完整 Origin。原生端使用对应安全存储；桌面示例的原生内存模式重启后需重新登录。

#### 传输加密说明

- 业务接口（默认 `/api/v1/*`）需要使用 `@h-ai/api-client`、`@h-ai/crypto` transport client 或等价的 transport-aware 客户端完成密钥协商。
- API 前缀、基础设施路径、明文排除路径和跨端 Header 统一由 `config/_serv.yml` 定义。
- 默认密钥协商端点为 `POST /api/v1/_hai/key-exchange`；修改配置时，客户端的业务 API Base 与站点根绝对密钥交换路径也需同步。
- 启用 `auth: {}` 与 `transport: { crypto }` 时，401 后的 `/auth/refresh` 也会复用同一 transport 会话，不会降级为明文刷新。
- 浏览器 / WebView 跨 origin 联调统一配置 `config/_serv.yml` 的 `cors.origin` 与 `cors.nativeOrigins`。生产环境禁止空值和 `*`，并按规范化后的完整 Origin 精确匹配；不要在 `src/app.ts` 维护业务侧白名单函数。
- `serv.createRuntimeSecurityPolicy(...)` 在生产环境默认给刷新 Cookie 加 `Secure`，并关闭 OpenAPI 和 docs。路径、来源和凭据策略来自 `_serv.yml`，宿主额外允许 `x-request-client`、`x-hai-token-transport` 和 `x-hai-terminal` 协议头。

```yaml
# config/_serv.yml
http:
  apiPrefix: /api/v1
  health:
    path: /health
    readyPath: /ready

cors:
  origin: '*'
  nativeOrigins: http://localhost,https://localhost,http://tauri.localhost,https://tauri.localhost,tauri://localhost,capacitor://localhost
  allowedHeaders:
    - Authorization
    - X-Client-Id
  exposedHeaders:
    - X-Encrypted

transport:
  keyExchangePath: /api/v1/_hai/key-exchange
  maxFutureSkewSeconds: 30
  maxRequestAgeSeconds: 300
  excludePaths:
    - /health
```

加密请求允许领先服务器 0～1800 秒，默认 30 秒。请求有效期可设为 1～3600 秒，默认 300 秒。超限时客户端显示服务端校验时的 UTC 时间，提示用户自动校时或手工修改设备时间后刷新。

客户端默认调用方式：

```ts
import { apiClient } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'

// 无参数初始化加密模块；成功后客户端能使用其传输能力，失败结果应先处理。
await crypto.init()
// 配置本机 API 前缀和本段传输选项；成功后默认客户端可调用，失败返回配置错误。
await apiClient.init({
  baseUrl: 'http://localhost:3000/api/v1',
  transport: { crypto },
})
```

如果 `_serv.yml` 自定义了密钥协商路径，则客户端也要传同一路径：

```ts
// 配置本机 API 前缀和本段传输选项；成功后默认客户端可调用，失败返回配置错误。
await apiClient.init({
  baseUrl: 'http://localhost:3000/api/v1',
  transport: {
    crypto,
    keyExchangePath: '/custom/key-exchange',
  },
})
```

### API 概览

服务默认监听 `http://localhost:3000`。

| 路径                                      | 方法               | 说明                                                             |
| ----------------------------------------- | ------------------ | ---------------------------------------------------------------- |
| `/health`                                 | GET                | 存活检查                                                         |
| `/ready`                                  | GET                | 就绪检查                                                         |
| `/openapi.json`                           | GET                | OpenAPI 3.1 规范（根路径）                                       |
| `/docs`                                   | GET                | Scalar 交互式文档（根路径）                                      |
| `/api/v1/auth/login`                      | POST               | 浏览器返回 accessToken 并设置刷新 Cookie；受信原生返回 TokenPair |
| `/api/v1/auth/logout`                     | POST               | 登出                                                             |
| `/api/v1/auth/refresh`                    | POST               | 浏览器读取刷新 Cookie；受信原生读取正文 refreshToken             |
| `/api/v1/auth/register`                   | POST               | 注册并登录                                                       |
| `/api/v1/auth/send-otp`                   | POST               | 发送 OTP                                                         |
| `/api/v1/auth/change-password`            | POST               | 修改当前用户密码                                                 |
| `/api/v1/auth/me`                         | GET / PUT          | 获取当前用户及最新角色/权限 / 更新当前用户信息                   |
| `/api/v1/iam/users`                       | GET / POST         | 用户列表 / 创建用户（需权限）                                    |
| `/api/v1/iam/users/{id}`                  | GET / PUT / DELETE | 查询 / 更新 / 删除用户（需权限）                                 |
| `/api/v1/iam/roles`                       | GET / POST         | 角色列表 / 创建角色（需权限）                                    |
| `/api/v1/iam/permissions`                 | GET / POST         | 权限列表 / 创建权限（需权限）                                    |
| `/api/v1/storage/presigned-urls/upload`   | POST               | 获取上传预签名 URL                                               |
| `/api/v1/storage/presigned-urls/download` | POST               | 获取下载预签名 URL                                               |
| `/api/v1/storage/files`                   | GET / DELETE       | 文件列表 / 删除文件                                              |
| `/api/v1/storage/files/metadata`          | POST               | 查询文件元信息                                                   |
| `/api/v1/ai/chats/completions`            | POST               | 聊天补全（OpenAI 兼容结构）                                      |
| `/api/v1/ai/chats/messages`               | POST               | 发送单条消息，直接返回文本                                       |
| `/api/v1/ai/chats/history`                | POST               | 查询对话历史                                                     |
| `/api/v1/ai/memories/recall`              | POST               | 召回相关记忆                                                     |
| `/api/v1/ai/memories/list`                | POST               | 列出记忆                                                         |
| `/api/v1/ai/sessions/list`                | POST               | 列出会话                                                         |
| `/api/v1/app/info`                        | POST               | 服务元信息（公开，无需登录）                                     |
| `/api/v1/app/echo`                        | POST               | 演示：回显消息 + 调用者上下文（需登录）                          |

Storage procedures 使用显式 `authorize` 策略限制到已认证用户的 `users/<encodeURIComponent(userId)>/` 前缀。上传、下载、元数据、删除均传完整 key，列表也必须提供该前缀；空前缀、其它用户 key 和包含未授权 key 的批量请求都会被拒绝。需要管理员跨用户访问时，应在服务端策略中显式检查可信权限。

AI procedures 默认将 objectId 绑定为认证用户 ID，客户端无需传入。消息与聊天按 objectId/sessionId 保存和查询（写入 sessionId 默认为 `default`）；同名会话在不同用户间隔离。记忆 recall/list 不会跨主体查询。指定其它 objectId 时默认拒绝，管理操作必须在服务端显式配置 authorizeObject 并验证可信权限。

### 调用示例

> 完整交互式文档见 `http://localhost:3000/docs`。以下示例假设服务已启动在 `localhost:3000`。

#### 健康检查

```bash
# 请求存活探针，服务在线时返回健康信息。
curl http://localhost:3000/health
# 请求就绪探针，所需服务准备完成时返回就绪信息，否则返回非就绪状态。
curl http://localhost:3000/ready
```

#### 业务 API（默认需要传输加密）

业务 `/api/v1/*` 端点默认要求先完成 `/api/v1/_hai/key-exchange` 密钥协商，因此不再建议用明文 `curl` 直接 POST 登录/注册。
推荐统一使用 `@h-ai/api-client` + `@h-ai/crypto`：

```ts
import { apiClient } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'

// 无参数初始化加密模块；成功后客户端能使用其传输能力，失败结果应先处理。
await crypto.init()

// 配置本机 API 前缀和本段传输选项；成功后默认客户端可调用，失败返回配置错误。
await apiClient.init({
  baseUrl: 'http://localhost:3000/api/v1',
  transport: { crypto },
  auth: {},
})

// 提交示例账号、密码和邮箱；新建成功返回用户及 tokens，已有账号时可转用下方登录。
const register = await apiClient.iam.auth.register({
  username: 'admin',
  password: 'Admin123!',
  email: 'admin@example.com',
})

// 使用该账号的标识和密码登录；成功 data 包含用户及本次 tokens，失败不上传。
const login = await apiClient.iam.auth.login({
  identifier: 'admin',
  password: 'Admin123!',
})
if (!login.success)
  throw new Error(login.error.message)
// 使用登录返回的 tokens 更新默认客户端状态，后续预签名请求带认证信息。
await apiClient.auth.setTokens(login.data.tokens)

// 在当前用户路径下请求 PNG 上传凭据；对象存储后端成功时返回预签名信息。
const storage = await apiClient.storage.presignedUrls.createUpload({
  key: `users/${encodeURIComponent(login.data.user.id)}/demo.png`,
  contentType: 'image/png',
})
if (!storage.success) {
  // local provider 不支持预签名；S3 成功结果才包含可上传的 URL。
  throw new Error(storage.error.message)
}

void register
void login
void storage

// 无参数关闭客户端，释放认证及加密传输会话。
await apiClient.close()
// 无参数释放加密模块，等待 Promise 完成。成功时无返回数据。
await crypto.close()
```

如果修改了 `_serv.yml.transport.keyExchangePath`，记得同步客户端的 `transport.keyExchangePath`。

默认 local 存储不支持预签名，接口返回 `hai:storage:018`，不会生成可上传的 URL；S3 才支持直传。本应用未内置本地二进制上传/下载 HTTP 接口，如有需要由业务实现并鉴权，或切换到 S3。

### 配置

本目录 `.env.example` 完整说明字段用途、枚举和范围；`.env` 为公共基础，`.env.dev` / `.env.test` / `.env.prod` 为公共环境覆盖，均提交 Git。`.env.local` 保存本机私有覆盖，不提交。统一优先级为进程 > `.env.<mode>.local` > `.env.local` > `.env.<mode>` > `.env` > YAML。同源父 JSON 为基础、细项覆盖；高来源整段替换清掉低来源细项。模式私有文件不提交 Git。使用 `dev:test` / `dev:prod` 或 Node `start:test` / `start:prod` 切换，详见 [配置与环境变量](../../docs/usage/configuration/runtime.md)。

配置文件位于 `config/`：

- `_core.yml`：应用名称、版本、运行环境。
- `_serv.yml`：`@h-ai/serv` 的 HTTP、CORS 与加密 transport 配置；配置文件是生产传输约定的权威来源。
- `_db.yml`：关系数据库配置。
- `_cache.yml`：缓存配置。
- `_iam.yml`：认证与 RBAC 配置。
- `_storage.yml`：对象存储配置。
- `_vecdb.yml`：向量数据库配置。
- `_ai.yml`：AI 与 A2A 配置。在 `_serv.yml.a2a` 启用后，应用注册示例执行器并挂载 Agent Card 和 JSON-RPC。 [Serv 与 Kit 的接入区别](../../docs/usage/function/serv.md#host-capabilities)

`http.trustedProxies` 指定可信代理，`http.access` 设置访问规则。本应用默认关闭 `http.rateLimit`。为外部访问启用固定窗口时，可设置 `HAI_SERV_HTTP_RATELIMIT='{"windowMs":60000,"maxRequests":100}'`。生产实例通过共享 Redis 累计同一客户端的配额，超限返回 HTTP 429，计数存储失败返回 HTTP 503。 [Serv 限流配置](../../docs/usage/configuration/serv.md#rate-limit-config-example)

常用环境变量：

- `PORT`：默认 `3000`，HTTP 服务端口。
- `HAI_DB_DATABASE`：默认 `./data/api-service.db`，SQLite 数据库路径。
- `HAI_CACHE_TYPE`：默认 `memory`，缓存类型。
- `HAI_STORAGE_ROOT`：默认 `./data/storage`，本地存储目录。
- `HAI_SERV_CORS_ORIGIN`：覆盖 `_serv.yml` 的 `cors.origin`。

配置环境变量统一按 `HAI_<配置名>_<YAML 路径>` 生成，优先级高于 YAML；
camelCase key 不拆词，例如 `cors.nativeOrigins` 对应
`HAI_SERV_CORS_NATIVEORIGINS`。

独立的后端进程变量 `HAI_SERV_REFRESH_COOKIE_SECURE=false` 允许受控内网或 VPN 的生产 HTTP 入口使用刷新 Cookie。生产 `HAI_SERV_CORS_ORIGIN` 仍需配置实际入口的完整 Origin。修改后重启服务并重新登录。

#### 让合作方调用 A2A 示例

配置 `HAI_SERV_A2A='{"cardPath":"/.well-known/agent-card.json","rpcPath":"/a2a"}'` 和 `HAI_IAM_LOGIN_APIKEY=true`。`HAI_AI_A2A_AGENTCARD_URL` 填写合作方可访问的完整 JSON-RPC 地址。启动后读取 Agent Card，向公布的地址提交带 IAM API Key 的 `SendMessage`。示例执行器回显输入，用于确认合作方的连接与身份校验。业务执行器从 `ai.a2a.getCallerIdentity(context)` 读取该主体的有效权限，并据此决定可执行的操作。 [发现与调用示例](../../docs/usage/function/serv.md#shared-a2a-http) · [订单查询授权示例](../../docs/usage/function/ai.md#a2a-http-example)

#### 让有权限的员工使用实时语音

在 `_ai.yml` 配置语音模型，在 IAM 给员工角色授予 `ai:audio:use`，然后将 `HAI_SERV_AUDIO` 设为 `{"path":"/voice"}`。客户端用员工访问令牌调用 `POST /api/v1/ai/audio/tickets`，再用返回的一次性票据连接 `wss://<API 域名>/voice`。HTTPS 网关须转发 `Upgrade`。 [从签发到浏览器播放](../../docs/usage/function/serv.md#audio-ticket-example)

#### 认证页面

协议支持配置中的 userAgreementMarkdown/privacyPolicyMarkdown 正文及 URL；同主题优先 Markdown，由安全渲染器在弹窗显示。

认证方式、注册、重置、协议和品牌由服务端 config/_iam.yml 控制。SvelteKit 页面消费 iam.publicConfig；移动/桌面页面从 API 服务读取公开配置。选用 Reach 时，初始化成功后传入 iam.init({ ...settings, reach })，使用标准通知模板。多节点共享 DB 与 Redis。UI 复用 AuthPanel/LoginForm 和框架认证动作，应用只负责业务导航与用户状态。

[完整配置与安全约束](../../packages/iam/README.md)

### 错误处理

业务错误通过 `HaiResult<T>` 返回，客户端统一判断 `result.success`。API 文档和 OpenAPI JSON 可用于生成跨端 SDK 或联调。

### 镜像构建与部署

在本应用目录执行，镜像定义为 `images/serv.Dockerfile`，`hai.json` 的 `build.images` 指定文件与仓库根构建上下文。Web 运行配置位于 `images/web/`（如有）。容器角色为 serv，项目身份来自本目录的 package.json.name；应用版本来自本目录的 `package.json.version`。

```sh
pnpm build:images                         # 只构建镜像并导出 tar
pnpm run deploy --env prod --build        # 构建、打包、上传、启动并检查访问
pnpm run deploy --env prod --build --bundle-only --output release-prod.tar
```

先准备 `.env.prod` 与项目根 `hai.json` 的 `deploy`；首次向导以说明文字收集服务器连接信息并保存到 `.env.local`。完整离线包包含应用和自建中间件镜像，目标 Linux 需预装容器引擎、Compose 与脚本要求的工具。把本次 `.hai/deploy/<环境>/bundle-*/` 整个目录复制到操作机（tar、配置和脚本均在其中），Windows 执行 `deploy.ps1`，Linux/macOS 执行 `deploy.sh`；完全隔离的服务器复制整个交付目录后执行 `sh deploy-local.sh`，自动解包并部署。

已有成功安装时，可用 `--services serv` 只更新本应用；多个镜像的工程按服务名选择。局部发布保留其他容器和持久化卷，不执行整个项目 `down`，失败保留诊断并尝试恢复旧容器。相同版本允许重建，每次以独立构建 ID 区分内容。`images/dependencies/` 为忽略 Git 的依赖输入，配合引擎缓存和分层减少重复下载。

完整参数、缓存、版本与恢复说明见[构建指南](../../docs/usage/getting-started/build.md)。移动端和桌面端的原生安装包仍需在对应系统另行构建；容器部署交付的是 Web 页面。

### 可选集成

LDAP 与 Reach 为可选集成。需要默认 LDAP 客户端时，在负责 IAM 的服务端 workspace 安装 ldapts，设置 `login.ldap: true` 与 LDAP 连接配置；也可注入自定义工厂。邮件/短信可以选择 Reach 标准模板，或直接注入 `onOtpSendEmail/onOtpSendSms/onPasswordResetRequest` 回调，投递失败须拒绝 Promise；回调第三参数 context 提供 expiresAt/idempotencyKey，发送服务按稳定键持久化去重，异常/超时为结果未知且不自动重发。协议在弹窗内展示；LoginForm/RegisterForm 的 `header/extraFields/footer` 和 AuthPanel 的 `login*/register*` snippet 可用于应用扩展。完整配置与自定义发送示例见 [IAM 用法](../../packages/iam/README.md#可选-ldap-与通知接入)。

## 框架能力导航

本应用的启动、页面和业务操作按上文执行；各框架模块的完整用途、输入输出、配置和错误处理见下表。不要从应用示例推断模块全部能力；服务端与浏览器入口按对应模块契约选择。

| 模块                                                        | 本应用相关能力                       |
| ----------------------------------------------------------- | ------------------------------------ |
| [@h-ai/ai](../../packages/ai/README.md)                     | 模型、记忆与工具流程                 |
| [@h-ai/api-contract](../../packages/api-contract/README.md) | 共享接口与输入输出定义               |
| [API 服务契约](../api-service-contract/README.md)           | 本应用与独立 API 共用的业务 contract |
| [@h-ai/cache](../../packages/cache/README.md)               | 共享缓存与会话状态                   |
| [@h-ai/core](../../packages/core/README.md)                 | 配置、日志、结果与国际化             |
| [@h-ai/crypto](../../packages/crypto/README.md)             | 认证加密传输和密码能力               |
| [@h-ai/iam](../../packages/iam/README.md)                   | 身份、会话与权限                     |
| [@h-ai/reach](../../packages/reach/README.md)               | 邮件、短信与通知                     |
| [@h-ai/reldb](../../packages/reldb/README.md)               | 关系型数据库与事务                   |
| [@h-ai/serv](../../packages/serv/README.md)                 | 独立 API 服务装配                    |
| [@h-ai/storage](../../packages/storage/README.md)           | 私有文件与对象存储                   |
| [@h-ai/vecdb](../../packages/vecdb/README.md)               | 向量集合与检索                       |

## 开发测试

```bash
pnpm --filter api-service check
pnpm --filter api-service lint
pnpm --filter api-service test
```

## 许可证

Apache-2.0
