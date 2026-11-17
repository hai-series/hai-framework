# @h-ai/api-contract 功能说明

[English](api-contract.en.md) · [日本語](api-contract.ja.md)

通过 `apiContract` 定义前后端共享的 HTTP 方法、路径和参数格式。服务端用这些定义校验请求，并绑定实际处理函数。客户端使用同一份定义获得 TypeScript 类型。

组合 HTTP 契约用 `apiContract.create()`。各领域单独导出的 Schema 用于检查特定输入、输出或类型，下面分别注明这些依赖。

[模块 README](../../../packages/api-contract/README.md) · [配置清单](../configuration/api-contract.md) · [数据结构](../data/api-contract.md) · [前后端接入](../development/frontend-backend.md)

<a id="quick-start"></a>

## 最小接入示例

```ts
import { apiContract } from '@h-ai/api-contract'

export const contract = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  ai: false,
})
```

自定义应用 contract 也从本包定义路由，不依赖 `@h-ai/serv`：

```ts
import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'

export const appContract = {
  ping: apiContract
    .route({
      method: 'POST',
      path: '/app/ping',
      operationId: 'app.ping',
      tags: ['app']
    })
    .output(apiContract.haiResultSchema(z.object({
      pong: z.boolean()
    }))),
}
```

## 功能说明

<a id="api-reference"></a>

### 用途、输入与输出

本包声明接口和校验结构，不发送请求，也没有 init/close。表中 Schema 是校验器本身；调用 safeParse 后检查其 success。业务响应中的 HaiResult.success 与校验器的 success 属于不同层，不能混用。路由的输入/输出 Schema 由应用挂载到 Serv 或客户端后实际使用。

| 入口                           | 使用场景             | 输入（`—` 表示无参数）                     | 返回值                                                                                  | 调用示例                                                                     |
| ------------------------------ | -------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `apiContract.create`           | 组合应用接口         | `{ iam: apiContract.iam, payment: false }` | `{ iam: IamContract }`                                                                  | `apiContract.create({ iam: apiContract.iam, payment: false })`               |
| `apiContract.route`            | 声明 HTTP 接口       | `{ method: "GET", path: "/status" }`       | `ContractProcedureBuilder`                                                              | `apiContract.route({ method: "GET", path: "/status" })`                      |
| `apiContract.pathOf`           | 取唯一业务路径       | `apiContract.iam.auth.login`               | `string: "/auth/login"`                                                                 | `apiContract.pathOf(apiContract.iam.auth.login)`                             |
| `apiContract.haiResultSchema`  | 校验成功或失败结果   | `z.string()`                               | `ZodSchema<HaiResult<string>>`                                                          | `apiContract.haiResultSchema(z.string())`                                    |
| `apiContract.voidResultSchema` | 校验无业务数据的结果 | `{ success: true, data: undefined }`       | `ZodSchema<HaiResult<void>>`                                                            | `apiContract.voidResultSchema.safeParse({ success: true, data: undefined })` |
| `apiContract.paginatedSchema`  | 校验分页列表         | `z.object({ id: z.string() })`             | `ZodSchema<{ items: { id: string }[], total: number, page: number, pageSize: number }>` | `apiContract.paginatedSchema(z.object({ id: z.string() }))`                  |
| `apiContract.iam`              | 认证与账号接口       | `—`                                        | `iam contract router`                                                                   | `apiContract.create({ iam: apiContract.iam })`                               |
| `apiContract.storage`          | 文件接口             | `—`                                        | `storage contract router`                                                               | `apiContract.create({ storage: apiContract.storage })`                       |
| `apiContract.ai`               | AI 接口              | `—`                                        | `ai contract router`                                                                    | `apiContract.create({ ai: apiContract.ai })`                                 |
| `apiContract.payment`          | 支付接口             | `—`                                        | `payment contract router`                                                               | `apiContract.create({ payment: apiContract.payment })`                       |
| `apiContract.feedback`         | 反馈接口             | `—`                                        | `feedback contract router`                                                              | `apiContract.create({ feedback: apiContract.feedback })`                     |

- 公共 DTO Schema：所有 HTTP 输出统一包装为 `HaiResult<T>`。
- IAM token DTO 兼容 httpOnly cookie 模式：响应体中 `refreshToken` 可能不存在，由服务端 `Set-Cookie` 管理。
- IAM `auth.currentUser` 返回用户资料以及服务端当前会话的 `roles` / `permissions`，客户端恢复会话时无需持久化权限快照。

支付创建输入和输出仅接受微信 `jsapi`、支付宝 `h5`、Stripe `h5`；微信输入必填 `userId`（openid）。App、Native、小程序与其它组合会在输入校验时失败。支付宝输出是 `{ gateway, fields }` 页面参数，创建成功不代表支付完成；客户端处理见 [Payment](../../../packages/payment/README.md)。

用户列表支持 `sortBy`（username/email/displayName/accountStatus/createdAt）和 `sortDirection`（asc/desc），供列头排序在分页前执行。

### API 契约

独立 contract 包构建声明文件时，`ContractProcedureBuilderWithInputOutput`、`ContractProcedureBuilderWithOutput` 和 `Schema` 由本包按上游真实类型公开转出，保持自定义路由的输入输出推导。需要显式类型时从 `@h-ai/api-contract` 使用 `import type`，不要引用依赖的内部安装路径。

```ts
import { apiContract } from '@h-ai/api-contract'

const myContract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

myContract.iam.auth.login
myContract.storage.presignedUrls.createUpload
myContract.ai.chats.createCompletion
```

`ai.chats.createCompletion` 为 `POST /ai/chats/completions`，只返回非流式 `HaiResult<AiChatCompletionData>`；输入严格拒绝 `stream` 等未声明字段。function 工具保留完整嵌套 JSON Schema 和 `strict`，工具选择支持 `auto` / `none` / `required` / 已提供的函数名。消息按角色校验：system/assistant/tool 接收文本，user 另支持图片；工具结果必填非空 `tool_call_id`，助手必须包含内容或 `tool_calls`。默认工具调用由业务方授权与执行，流式能力由应用定义独立契约。

客户端通过 `@h-ai/api-client` 直接调用嵌套方法：

```ts
import { apiClient } from '@h-ai/api-client'

await apiClient.init({ baseUrl: 'https://api.example.com/api/v1' })
const login = await apiClient.iam.auth.login({ identifier: 'alice', password: 'secret' })
await apiClient.close()
```

服务端通过 `@h-ai/serv` 挂载：

```ts
import { apiContract } from '@h-ai/api-contract'
import { serv } from '@h-ai/serv'

const contract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
})
```

### API 概览

- `apiContract.create(options)`：过滤 `false` / `undefined` 领域并组合应用级 contract。
- `apiContract.route(routeConfig)`：定义自定义 endpoint 的 method/path/operationId/tags 等路由元数据。
- `apiContract.pathOf(procedure)`：读取 procedure 在 `*-contract.ts` 中声明的业务路径，不维护独立 routes 常量。
- `apiContract.haiResultSchema(dataSchema)` / `apiContract.voidResultSchema` / `apiContract.paginatedSchema(itemSchema)`：公共 DTO Schema 工厂。
- `Iam*Schema` / `Storage*Schema` / `Ai*Schema` / `Payment*Schema`：真正跨接口、跨层复用的输入与数据结构。

批量删除 `storage.files.deleteMany` 成功时返回 `{ deletedKeys, failures: [] }`；失败进度位于 `error.ext.deleteMany`（`failed / unknown / notAttempted`），不能只根据 HTTP 200 判断完成。详见 [Storage 批量删除](./storage.md#api-概览)。

业务 path 必须直接写在对应 `*-contract.ts`。只使用一次的输出 Schema 直接内联到 `.output(...)`；同一 contract 文件内重复使用时可保留私有常量，但不得从 schemas 导出。

### 配置驱动认证页面

密码登录只提交 `identifier` 和 `password`；`AuthPanel` 将 `LoginForm` 的 `username` 映射为 `identifier`。会话有效期由服务端 `session.maxAge` / `session.refreshTokenMaxAge` 配置决定，登录表单不提供按次登录的持久会话选项。

服务端可在认证配置中提供用户协议和隐私政策的 Markdown 正文或 URL。如果正文和 URL 同时存在，登录页面的弹窗优先显示经过安全处理的 Markdown。

标准 IAM contract 新增 GET /auth/config、POST /auth/login/ldap、POST /auth/password-reset/request、POST /auth/password-reset/confirm。公开配置 Schema 是安全白名单。IamLdapLoginInput、IamPublicConfig 对调用方提供真实类型。密码长度以 IAM 运行时策略为准，contract 不固定注册密码最小长度。

[IAM 配置清单](../configuration/iam.md)

### 输入约束与 HTTP 能力

对象键、上传能力、批量删除及预签名地址的共同规则见[存储 API 能力](./storage.md#存储输入约束与跨端能力)。

### 反馈领域契约

`FeedbackJob.type` 与 `FeedbackRetryInput.target` 支持独立 `webhook` 任务；状态、尝试次数和安全错误码见详情 jobs。业务采集函数与回调配置仅在可信服务端注册，不接受 HTTP 输入指定。正文与 ZIP/GZIP 通过既有证据/附件接口取得，接入见 [feedback](../../../packages/feedback/README.md)。

`apiContract.feedback` 包含 reports.submit/list/get/getEvidence/setStatus/retry/export/getExport/appendEvidence/completeCollection 与 attachments.upload/get。最小提交仅需 submissionId/appId，不要求描述或异常；身份、权限、S3 key 与邮件收件人不接受客户端输入。按需通过 `@h-ai/api-contract/feedback` 导入同一组 schema 与类型。

追加证据返回 acknowledged/evidenceRevision，客户端只释放已确认的块。setStatus 需要 expectedVersion；export 固定证据修订，getExport 读取已完成问题包。附件 base64 输入限制原始 5 MiB，服务端仍须验证实际字节、类型与 SHA-256。Report.appVersion 是应用版本，Report.version 是乐观锁计数。

```ts
import { apiContract, FeedbackSubmitInputSchema } from '@h-ai/api-contract'

const input = FeedbackSubmitInputSchema.parse({ submissionId: 'operation-1', appId: 'orders' })
const contract = apiContract.create({ feedback: apiContract.feedback })
const path = apiContract.pathOf(contract.feedback.reports.submit)
```

### 可选交互挑战

IamCreateCaptchaInputSchema / IamCaptchaChallengeSchema 定义 POST /auth/captcha 的用途与可公开挑战，交互鉴别输入允许最多4096字符的可选 captcha。IamPublicConfigSchema.captcha 仅含 enabled，缺省关闭。Schema 校验结构，证明有效期、用途和单次消费由服务端 IAM 执行。

何时要求验证、验证失败后如何处理，见 [IAM 配置](../configuration/iam.md)和 [IAM 功能说明](./iam.md)。

### 页面离开会话策略

`session.endOnPageHide` 默认关闭。开启后，在浏览器页面加载时调用 `actions.bindPageExit({ enabled: config.session.endOnPageHide })`，卸载时执行它返回的函数，移除监听器。标准 admin、H5 和 fullstack 模板已接好此步骤。这里的 `actions` 来自 `apiClient.createAuthActions(...)` 或 SvelteKit 的 `kit.client.createAuthActions(...)`。配置从登录页使用的公开认证接口读取。

浏览器触发 `pagehide` 时会尝试调用 `POST /auth/session/close`。这包括刷新或整页导航，但页面进入往返缓存（BFCache）时会跳过。请求沿用 CSRF 防护和已启用的传输加密，并使用 `keepalive` 争取在页面关闭后完成。该请求不会刷新会话，响应也不会清除 Cookie 或本地凭据，以免较早的请求清掉新的登录状态。

浏览器可能根本没有发出请求。服务端仍需用 `idleTimeout` 或 `absoluteTimeout` 限制会话寿命。用户主动退出时，应正常调用应用的 logout 接口，让服务端撤销凭据，并清除客户端保存的登录状态。

### 反馈传输预算

`apiContract.feedback` 声明反馈路由的请求和响应格式。要计算单个附件、证据、ZIP 和全量 HTTP 请求能容纳的字节数，可在服务端或浏览器单独从 `@h-ai/api-contract/feedback` 导入 `resolveFeedbackBudget()`，按同一组上限计算。

```ts
import { FeedbackBudgetSchema, resolveFeedbackBudget } from '@h-ai/api-contract/feedback'

const effective = resolveFeedbackBudget({ maxTotalBytes: 16 * 1024 * 1024 }) // 输入 16 MiB 总量，返回派生的 FeedbackBudget。
const validated = FeedbackBudgetSchema.safeParse(effective) // 校验结果结构，成功时 data 为预算对象。
const maxRouteBytes = effective.maxTransportBytes // 读取反馈路由的明文预算，用于配置单独的上传/导出路由。
```

详见[反馈配置](../configuration/feedback.md)和[补采及离线导出说明](./feedback.md)。

## 错误处理

Contract 只描述输入输出结构，业务错误由 procedure 返回 `HaiResult<T>` 表达。直接调用 Zod `parse()` 会在输入无效时抛校验异常；读取外部输入时可用 `safeParse()` 并检查其 `success`。这个校验结果与业务响应里的 `HaiResult.success` 分别处理。
