# @h-ai/api-contract 功能说明

[English](api-contract.en.md) · [日本語](api-contract.ja.md)

通过 `apiContract` 定义前后端共享的 HTTP 方法、路径和参数格式。服务端用这些定义校验请求，并绑定实际处理函数。客户端使用同一份定义获得 TypeScript 类型。

组合 HTTP 契约用 `apiContract.create()`。各领域单独导出的 Schema 用于检查特定输入、输出或类型，下面分别注明这些依赖。

[模块 README](../../../packages/api-contract/README.md) · [配置清单](../configuration/api-contract.md) · [数据结构](../data/api-contract.md) · [前后端接入](../development/frontend-backend.md)

<a id="quick-start"></a>

## 最小接入示例

```ts
import { apiContract } from '@h-ai/api-contract'

// Compose the built-in IAM and storage routers into contract. Passing false omits AI. This only defines the contract.
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
    // Describe POST /app/ping with operation ID app.ping and the app tag. This returns a route builder.
    .route({
      method: 'POST',
      path: '/app/ping',
      operationId: 'app.ping',
      tags: ['app']
    })
    // Use a boolean pong schema as the success data. The output builder also includes the HaiResult failure shape.
    .output(apiContract.haiResultSchema(z.object({
      pong: z.boolean()
    }))),
}
```

<a id="api-reference"></a>

## 功能说明

<a id="routes"></a>

### 定义与组合 HTTP 契约：`apiContract`

契约描述路径、输入和输出，不会发送请求；同一份契约交给服务端实现和客户端调用。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiContract.create(options)` | 组合应用接口 | `options: CreateApiContractOptions` 必填。对象键是业务域名称，值为契约 router；用 `false` 或 `undefined` 跳过该域。 见[契约与路由字段](#contract-route-options)。 | `{ iam: IamContract }` | `apiContract.create({ iam: apiContract.iam, payment: false })` |
| `apiContract.route(route)` | 声明 HTTP 接口 | `route: Route` 必填。声明 HTTP 接口时用 `method` 指定方法、`path` 指定以 `/` 开头的业务路径；可加 `summary`、`description`、`tags` 等 OpenAPI 元数据。 见[契约与路由字段](#contract-route-options)。 | `ContractProcedureBuilder` | `apiContract.route({ method: "GET", path: "/status" })` |
| `apiContract.pathOf(procedure)` | 取唯一业务路径 | `procedure: AnyContractProcedure` 必填，传入声明了 HTTP 路径的 procedure。 | `string: "/auth/login"` | `apiContract.pathOf(apiContract.iam.auth.login)` |

<a id="contract-route-options"></a>

##### 契约与路由字段

这些选项定义契约和 HTTP 映射。示例把 `{ status, iam: apiContract.iam, payment: false }` 组合成只含 `status` 与 `iam` 的对象，并读取路径 `/auth/login`。

| 字段 | 默认值或必填 | 作用与生效条件 |
| --- | --- | --- |
| `options[domain]` | 必填对象；域可省略 | 键是业务域名，值是契约 router 或 procedure。固定启用的具名领域为必填，固定禁用的领域被排除，条件启用的领域为可选。运行时仅包含已启用的领域。 |
| `route.method / route.path` | 可填；建议显式声明 HTTP 入口 | `method` 是 HTTP 方法，`path` 是以 `/` 开头的路径。`pathOf` 要求已声明路径。 |
| `route.operationId` | 默认由 router 路径段连接而成 | 覆盖 OpenAPI 操作标识。 |
| `route.summary / route.description / route.deprecated / route.tags` | 可省略 | OpenAPI 的摘要、说明、弃用标记和分类标签。 |
| `route.successStatus / route.successDescription` | `200` / `OK` | 成功响应的状态和说明，状态码范围 200–399。 |
| `route.inputStructure` | `compact` | `compact` 合并路径参数与查询或正文。`detailed` 分开提供 `params`、`query`、`headers`、`body`。 |
| `route.outputStructure` | `compact` | `compact` 将返回值直接当响应正文。`detailed` 支持 `status`、`headers`、`body`，省略 `status` 时使用 `successStatus`。 |
| `route.spec` | 可省略，默认自动生成 | 可传 OpenAPI Operation Object，或接收当前 operation 并返回新对象的函数。 |

#### 场景：定义与组合 HTTP 契约

契约对象本身不监听端口。下图按职责展示路由、Schema、服务端实现和 typed 客户端之间的关系。

![同一份契约怎样连接前后端](../images/function-api-contract-boundaries.svg)

修改同一份输入/输出定义后，服务端实现和客户端类型都据此检查。真正的身份验证、资源授权和业务副作用由服务端完成；构造契约或在浏览器通过 Schema 校验，都不能代替这些步骤。

```ts
import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'
// Create a route builder for GET /status. No handler runs while defining the route.
const status = apiContract.route({ method: 'GET', path: '/status' })
  // Set the output to HaiResult with a boolean ready field. Success data has ready and failures use the error shape.
  .output(apiContract.haiResultSchema(z.object({ ready: z.boolean() })))
// Compose the local status route with IAM. Passing false leaves payment out.
const contract = apiContract.create({ status, iam: apiContract.iam, payment: false })
// Read the relative path of the built-in login procedure. It yields /auth/login.
apiContract.pathOf(apiContract.iam.auth.login) // '/auth/login'
// contract includes status and iam; payment is omitted
```

输入为 GET /status 的构造器和要启用的模块。输出仍是契约对象，不是已监听的 HTTP 服务；服务接入见 Serv/Kit。

本包声明接口和校验结构，不发送请求，也没有 init/close。表中 Schema 是校验器本身；调用 safeParse 后检查其 success。业务响应中的 HaiResult.success 与校验器的 success 属于不同层，不能混用。路由的输入/输出 Schema 由应用挂载到 Serv 或客户端后实际使用。

- 普通 JSON 业务接口使用 `HaiResult<T>`。支付宝异步通知按渠道协议返回 HTTP 200 和纯文本 `success`，接入见[支付宝通知回执](./payment.md#alipay-notification-ack)。
- IAM token DTO 兼容 httpOnly cookie 模式：响应体中 `refreshToken` 可能不存在，由服务端 `Set-Cookie` 管理。
- IAM `auth.currentUser` 返回用户资料以及服务端当前会话的 `roles` / `permissions`，客户端恢复会话时无需持久化权限快照。

支付创建输入和输出仅接受微信 `jsapi`、支付宝 `h5`、Stripe `h5`；微信输入必填 `userId`（openid）。App、Native、小程序与其它组合会在输入校验时失败。支付宝输出是 `{ gateway, fields }` 页面参数，创建成功不代表支付完成；客户端处理见 [Payment](../../../packages/payment/README.md)。

用户列表支持 `sortBy`（username/email/displayName/accountStatus/createdAt）和 `sortDirection`（asc/desc），供列头排序在分页前执行。

<a id="conditional-domains"></a>

#### 场景：按配置启用可选领域

应用启动时从自己的配置读取支付开关。用 `satisfies` 保留具体域名与条件类型。支付关闭时 `contract.payment` 为 `undefined`，客户端同名域也为 `undefined`，可用 `?.` 访问。

```ts
import { type CreateApiContractOptions, apiContract } from '@h-ai/api-contract'

function buildContract(enablePayment: boolean) {
  const domains = {
    iam: apiContract.iam,
    payment: enablePayment ? apiContract.payment : false,
  } satisfies CreateApiContractOptions
  // 固定启用 IAM，按开关决定是否包含支付领域。
  const contract = apiContract.create(domains)
  const get = contract.payment?.orders.get
  // 启用时返回订单查询业务路径，关闭时返回 undefined。
  const queryPath = get ? apiContract.pathOf(get) : undefined
  return { contract, queryPath }
}
```

#### 场景：把同一份契约交给服务端与客户端

独立 contract 包构建声明文件时，`ContractProcedureBuilderWithInputOutput`、`ContractProcedureBuilderWithOutput` 和 `Schema` 由本包按上游真实类型公开转出，保持自定义路由的输入输出推导。需要显式类型时从 `@h-ai/api-contract` 使用 `import type`，不要引用依赖的内部安装路径。

```ts
import { apiContract } from '@h-ai/api-contract'

// Combine the selected built-in routers and return the app contract. This does not start their services.
const myContract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

myContract.iam.auth.login
myContract.storage.presignedUrls.createUpload
myContract.ai.chats.createCompletion
```

`ai.chats.createCompletion` 为 `POST /ai/chats/completions`，只返回非流式 `HaiResult<AiChatCompletionData>`；输入严格拒绝 `stream` 等未声明字段。function 工具保留完整嵌套 JSON Schema 和 `strict`，工具选择支持 `auto` / `none` / `required` / 已提供的函数名。消息按角色校验：system/assistant/tool 接收文本，user 另支持图片；工具结果必填非空 `tool_call_id`，助手必须包含内容或 `tool_calls`。默认工具调用由业务方授权与执行，流式能力由应用定义独立契约。

客户端通过 [API Client](api-client.md#quick-start) 调用同一份契约推导出的嵌套方法。

服务端为每个公开路由实现处理函数，再将契约和实现一起交给 `@h-ai/serv`。下面不启动监听，用 `app.request()` 请求本地应用验证结果：

```ts

import { apiContract } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { type ServContext, serv } from '@h-ai/serv'
import { z } from 'zod'

const contract = {
  // Identify the app's GET /ping route. This only prepares the route definition.
  ping: apiContract.route({ method: 'GET', path: '/ping' })
    // Describe its output as HaiResult containing a boolean ready. The failure variant remains available.
    .output(apiContract.haiResultSchema(z.object({ ready: z.boolean() }))),
}
// Start mapping the local contract and type each handler's context as ServContext.
const procedures = serv.implement(contract).context<ServContext>()
  // Map ping to a handler that returns success data { ready: true }.
  .route('ping', () => core.ok({ ready: true }))
  // Finish the procedure map so createApp can bind it to the contract.
  .build()
// Assemble contract and procedures under /api/v1. Incompatible app setup can fail.
const app = serv.createApp({ contract, procedures, http: { apiPrefix: '/api/v1' } })
// Send GET /api/v1/ping through the app and expect its successful HTTP response with ready data.
const response = await app.request('/api/v1/ping')
const body = await response.json() // { success: true, data: { ready: true } }
```

<a id="serv-iam-wiring"></a>

#### 场景：把 IAM 契约接入 Serv

宿主初始化 IAM 和所需依赖后，使用同一个 IAM 实例创建 procedure 并配置 `serv.createApp`。前一处提供业务处理函数，后一处让 Serv 验证 Bearer 令牌并为认证守卫填充会话。

```ts
import type { IamFunctions } from '@h-ai/iam'
import { apiContract } from '@h-ai/api-contract'
import { serv } from '@h-ai/serv'

function mountIamApi(iam: IamFunctions) {
  const contract = apiContract.create({ iam: apiContract.iam })
  const procedures = { iam: serv.createIamProcedures({ iam }) }
  // 使用初始化后的 IAM 装配 /api/v1 下的接口，返回可处理请求的 HTTP 应用。
  return serv.createApp({ contract, procedures, iam, http: { apiPrefix: '/api/v1' } })
}
```

用测试账号登录后，把返回的访问令牌以 `Authorization: Bearer <accessToken>` 发送到 `GET /api/v1/auth/me`。有效会话得到 `success: true` 及用户资料、角色和权限。省略令牌时，该接口返回未认证的失败结果。

OpenAPI 为公开 IAM 入口声明 `security: []`。这些入口包括 `createCaptcha`、`publicConfig`、`renewPassword`、`loginWithLdap`、`requestPasswordReset`、`confirmPasswordReset`、`login`、`loginWithOtp`、`refresh`、`sendOtp` 和 `register`。它们可在没有 Bearer 令牌的情况下调用，各自按服务端的策略校验输入或凭据。`currentUser` 等受保护的操作沿用服务的 Bearer 要求。

<a id="response-schemas"></a>

### 校验结果与分页：`apiContract.*Schema`

区分结构校验是否成功与业务结果是否成功；Schema 的 safeParse.success 不代表业务成功。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiContract.haiResultSchema(dataSchema)` | 校验成功或失败结果 | `dataSchema` 必填，传成功分支 `data` 的 Zod Schema。 | `ZodSchema<HaiResult<string>>` | `apiContract.haiResultSchema(z.string())` |
| `apiContract.voidResultSchema` | 校验无业务数据的结果 | Schema 常量。示例用 `safeParse(input)` 校验无业务数据的结果。 | `ZodSchema<HaiResult<void>>` | `apiContract.voidResultSchema.safeParse({ success: true, data: undefined })` |
| `apiContract.paginatedSchema(itemSchema)` | 校验分页列表 | `itemSchema` 必填，传分页 `items` 数组中单条记录的 Zod Schema。 | `ZodSchema<{ items: { id: string }[], total: number, page: number, pageSize: number }>` | `apiContract.paginatedSchema(z.object({ id: z.string() }))` |

#### 场景：校验结果与分页

```ts
import { z } from 'zod'

// Build a result schema whose success data is a string. Its failure variant carries HaiError.
const stringResult = apiContract.haiResultSchema(z.string())
// Validate a ready success envelope. checked.success is true and checked.data contains that envelope.
const checked = stringResult.safeParse({ success: true, data: 'ready' })
// checked.success === true; checked.data is HaiResult<string>
// Validate success with undefined data. This is valid for the void result schema.
apiContract.voidResultSchema.safeParse({ success: true, data: undefined }).success // true
// Build a paginated schema whose items each have a string id.
const pageSchema = apiContract.paginatedSchema(z.object({ id: z.string() }))
// Validate page 1 of one order at page size 20. The record fits the schema, so success is true.
pageSchema.safeParse({ items: [{ id: 'o1' }], total: 1, page: 1, pageSize: 20 }).success // true
// A numeric success value is invalid for the string schema, so success is false.
stringResult.safeParse({ success: true, data: 42 }).success // false
```

输入分别是字符串结果、无数据结果、订单页和错误类型的成功数据；输出是校验层的成功/失败，不能跳过内层业务 HaiResult.success。

<a id="domains"></a>

### 选择标准业务接口：`apiContract`

按应用实际能力组合标准业务领域；启用声明后仍需接入服务、身份和资源权限检查。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiContract.iam` | 认证与账号接口 | `—` | `iam contract router` | `apiContract.create({ iam: apiContract.iam })` |
| `apiContract.storage` | 文件接口 | `—` | `storage contract router` | `apiContract.create({ storage: apiContract.storage })` |
| `apiContract.ai` | AI 接口 | `—` | `ai contract router` | `apiContract.create({ ai: apiContract.ai })` |
| `apiContract.payment` | 支付接口 | `—` | `payment contract router` | `apiContract.create({ payment: apiContract.payment })` |
| `apiContract.feedback` | 反馈接口 | `—` | `feedback contract router` | `apiContract.create({ feedback: apiContract.feedback })` |

##### 存储接口的输入约束

对象键、上传能力、批量删除及预签名地址的共同规则见[存储 API 能力](./storage.md#存储输入约束与跨端能力)。

#### 场景：选择标准业务接口

```ts
// Compose the five supplied module routers into a new standard contract. No routes execute during assembly.
const standard = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  ai: apiContract.ai,
  payment: apiContract.payment,
  feedback: apiContract.feedback,
})
// standard has these five routers; no business operation runs during composition
```

输入为五个已有路由定义，输出为包含这些领域的路由树。下面按认证、挑战、反馈和页面离开场景说明真实 HTTP 边界。

#### 场景：由公开策略组织认证页面

密码登录只提交 `identifier` 和 `password`；`AuthPanel` 将 `LoginForm` 的 `username` 映射为 `identifier`。会话有效期由服务端 `session.maxAge` / `session.refreshTokenMaxAge` 配置决定，登录表单不提供按次登录的持久会话选项。

服务端可在认证配置中提供用户协议和隐私政策的 Markdown 正文或 URL。如果正文和 URL 同时存在，登录页面的弹窗优先显示经过安全处理的 Markdown。

标准 IAM contract 新增 GET /auth/config、POST /auth/login/ldap、POST /auth/password-reset/request、POST /auth/password-reset/confirm。公开配置 Schema 是安全白名单。IamLdapLoginInput、IamPublicConfig 对调用方提供真实类型。密码长度以 IAM 运行时策略为准，contract 不固定注册密码最小长度。

[IAM 配置清单](../configuration/iam.md)

#### 场景：接入反馈路由与校验输入

`FeedbackJob.type` 与 `FeedbackRetryInput.target` 支持独立 `webhook` 任务；状态、尝试次数和安全错误码见详情 jobs。业务采集函数与回调配置仅在可信服务端注册，不接受 HTTP 输入指定。正文与 ZIP/GZIP 通过既有证据/附件接口取得，接入见 [feedback](../../../packages/feedback/README.md)。

`apiContract.feedback` 包含 `reports.policy/submit/list/listMine/get/getEvidence/setStatus/retry/export/getExport/appendEvidence/completeCollection` 与 `attachments.upload/get`。客户端通过 `reports.policy({})` 读取有效容量，普通用户通过 `reports.listMine({ page: 1 })` 查询自己的报告，管理列表使用 `reports.list`。最小提交仅需 submissionId/appId，不要求描述或异常；身份、权限、S3 key 与邮件收件人不接受客户端输入。按需通过 `@h-ai/api-contract/feedback` 导入同一组 schema 与类型。

追加证据返回 acknowledged/evidenceRevision，客户端只释放已确认的块。setStatus 需要 expectedVersion；export 固定证据修订，getExport 读取已完成问题包。附件 base64 输入限制原始 5 MiB，服务端仍须验证实际字节、类型与 SHA-256。Report.appVersion 是应用版本，Report.version 是乐观锁计数。

```ts
import { FeedbackSubmitInputSchema, apiContract } from '@h-ai/api-contract'

// Validate the submission ID and orders app ID. Invalid input throws a Zod error.
const input = FeedbackSubmitInputSchema.parse({ submissionId: 'operation-1', appId: 'orders' })
// Create a contract containing only the built-in feedback router.
const contract = apiContract.create({ feedback: apiContract.feedback })
// Read the submission route's relative HTTP path from that contract.
const path = apiContract.pathOf(contract.feedback.reports.submit)
```

#### 场景：声明交互挑战

IamCreateCaptchaInputSchema / IamCaptchaChallengeSchema 定义 POST /auth/captcha 的用途与可公开挑战，交互鉴别输入允许最多4096字符的可选 captcha。IamPublicConfigSchema.captcha 仅含 enabled，缺省关闭。Schema 校验结构，证明有效期、用途和单次消费由服务端 IAM 执行。

何时要求验证、验证失败后如何处理，见 [IAM 配置](../configuration/iam.md)和 [IAM 功能说明](./iam.md)。

#### 场景：在页面离开时关闭会话

`session.endOnPageHide` 默认关闭。开启后，在浏览器页面加载时调用 `actions.bindPageExit({ enabled: config.session.endOnPageHide })`，卸载时执行它返回的函数，移除监听器。标准 admin、H5 和 fullstack 模板已接好此步骤。这里的 `actions` 来自 `apiClient.createAuthActions(...)` 或 SvelteKit 的 `kit.client.createAuthActions(...)`。配置从登录页使用的公开认证接口读取。

浏览器触发 `pagehide` 时会尝试调用 `POST /auth/session/close`。这包括刷新或整页导航，但页面进入往返缓存（BFCache）时会跳过。请求沿用 CSRF 防护和已启用的传输加密，并使用 `keepalive` 争取在页面关闭后完成。该请求不会刷新会话，响应也不会清除 Cookie 或本地凭据，以免较早的请求清掉新的登录状态。

浏览器可能根本没有发出请求。服务端仍需用 `idleTimeout` 或 `absoluteTimeout` 限制会话寿命。用户主动退出时，应正常调用应用的 logout 接口，让服务端撤销凭据，并清除客户端保存的登录状态。

#### 场景：计算反馈路由的传输预算

`apiContract.feedback` 声明反馈路由的请求和响应格式。要计算单个附件、证据、ZIP 和全量 HTTP 请求能容纳的字节数，可在服务端或浏览器单独从 `@h-ai/api-contract/feedback` 导入 `apiContract.resolveFeedbackBudget()`，按同一组上限计算。

```ts
import { FeedbackBudgetSchema, apiContract } from '@h-ai/api-contract/feedback'

// Use the 16 MiB total limit to derive the effective feedback budgets, including transport overhead.
const effective = apiContract.resolveFeedbackBudget({ maxTotalBytes: 16 * 1024 * 1024 }) // 输入 16 MiB 总量，返回派生的 FeedbackBudget。
// Validate the effective budget object. An inconsistent shape yields schema issues.
const validated = FeedbackBudgetSchema.safeParse(effective) // 校验结果结构，成功时 data 为预算对象。
const maxRouteBytes = effective.maxTransportBytes // 读取反馈路由的明文预算，用于配置单独的上传/导出路由。
```

详见[反馈配置](../configuration/feedback.md)和[补采及离线导出说明](./feedback.md)。

## 错误处理

Contract 只描述输入输出结构，业务错误由 procedure 返回 `HaiResult<T>` 表达。直接调用 Zod `parse()` 会在输入无效时抛校验异常；读取外部输入时可用 `safeParse()` 并检查其 `success`。这个校验结果与业务响应里的 `HaiResult.success` 分别处理。
