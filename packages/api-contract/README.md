# @h-ai/api-contract

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

## 简介

hai-framework 的公共 HTTP API 契约包，用 oRPC contract 和 Zod 让前后端共用接口路径、输入输出校验与类型。

## 核心功能清单

- `apiContract.iam`、`apiContract.storage`、`apiContract.ai`、`apiContract.payment`：领域级 contract。
- `apiContract.create()`：按应用场景组合启用的领域 contract。
- `apiContract.route()`：定义自定义 HTTP 路由元数据，供应用级 contract 复用。
- `apiContract.pathOf()`：从 contract procedure 读取唯一业务路径，供 middleware/client 复用。
- `apiContract.haiResultSchema()` / `apiContract.voidResultSchema` / `apiContract.paginatedSchema()`：公共 DTO Schema 工厂。
- 公共 DTO Schema：所有 HTTP 输出统一包装为 `HaiResult<T>`。
- IAM token DTO 兼容 httpOnly cookie 模式：响应体中 `refreshToken` 可能不存在，由服务端 `Set-Cookie` 管理。
- IAM `auth.currentUser` 返回用户资料以及服务端当前会话的 `roles` / `permissions`，客户端恢复会话时无需持久化权限快照。

支付创建输入和输出仅接受微信 `jsapi`、支付宝 `h5`、Stripe `h5`；微信输入必填 `userId`（openid）。App、Native、小程序与其它组合会在输入校验时失败。支付宝输出是 `{ gateway, fields }` 页面参数，创建成功不代表支付完成；客户端处理见 [Payment](../payment/README.md)。

用户列表支持 `sortBy`（username/email/displayName/enabled/createdAt）和 `sortDirection`（asc/desc），供列头排序在分页前执行。

## 使用入门

### 快速开始

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
    .route({ method: 'POST', path: '/app/ping', operationId: 'app.ping', tags: ['app'] })
    .output(apiContract.haiResultSchema(z.object({ pong: z.boolean() }))),
}
```

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

批量删除 `storage.files.deleteMany` 成功时返回 `{ deletedKeys, failures: [] }`；失败进度位于 `error.ext.deleteMany`（`failed / unknown / notAttempted`），不能只根据 HTTP 200 判断完成。详见 [Storage 批量删除](../storage/README.md#api-概览)。

业务 path 必须直接写在对应 `*-contract.ts`。只使用一次的输出 Schema 直接内联到 `.output(...)`；同一 contract 文件内重复使用时可保留私有常量，但不得从 schemas 导出。

### 配置

本包无运行时配置，不读取环境变量。

### 配置驱动认证页面

密码登录只提交 `identifier` 和 `password`；`AuthPanel` 将 `LoginForm` 的 `username` 映射为 `identifier`。会话有效期由服务端 `session.maxAge` / `session.refreshTokenMaxAge` 配置决定，登录表单不提供按次登录的持久会话选项。

协议支持配置中的 userAgreementMarkdown/privacyPolicyMarkdown 正文及 URL；同主题优先 Markdown，由安全渲染器在弹窗显示。

标准 IAM contract 新增 GET /auth/config、POST /auth/login/ldap、POST /auth/password-reset/request、POST /auth/password-reset/confirm。公开配置 Schema 是安全白名单。IamLdapLoginInput、IamPublicConfig 对调用方提供真实类型。密码长度以 IAM 运行时策略为准，contract 不固定注册密码最小长度。

[完整 IAM 配置 / IAM configuration](../iam/README.md)

### 错误处理

Contract 只描述输入输出结构。业务错误由 procedure 返回 `HaiResult<T>` 表达，客户端不需要捕获业务异常。

## 输入约束与 HTTP 能力

存储 key 按 UTF-8 最多 1024 字节，并拒绝绝对路径、反斜线、控制字符及点路径段；公开 HTTP 批量删除每次 1–1000 项。`@h-ai/storage/schemas` 提供浏览器安全的共同规则。预签名有效期为整数 1–604800 秒（Node 默认 3600，HTTP 默认 900）；HTTP 上传仅接受 key/contentType/expiresIn，不支持 contentLength/maxSize/metadata/checksum。无效输入返回 HTTP 400，typed client 映射 VALIDATION_FAILED。FileUpload 的大小/类型限制仅为前端体验，实际对象须由应用服务端复核。Node 流式读写/checksum/条件写等没有默认 HTTP 端点。完整映射与授权边界见 [存储 API 能力](../storage/README.md#存储输入约束与跨端能力)。

## 反馈领域契约

`FeedbackJob.type` 与 `FeedbackRetryInput.target` 支持独立 `webhook` 任务；状态、尝试次数和安全错误码见详情 jobs。业务采集函数与回调配置仅在可信服务端注册，不接受 HTTP 输入指定。正文与 ZIP/GZIP 通过既有证据/附件接口取得，接入见 [feedback](../feedback/README.md)。

`apiContract.feedback` 包含 reports.submit/list/get/getEvidence/setStatus/retry/export/getExport/appendEvidence/completeCollection 与 attachments.upload/get。最小提交仅需 submissionId/appId，不要求描述或异常；身份、权限、S3 key 与邮件收件人不接受客户端输入。按需通过 `@h-ai/api-contract/feedback` 导入同一组 schema 与类型。

追加证据返回 acknowledged/evidenceRevision，客户端只释放已确认的块。setStatus 需要 expectedVersion；export 固定证据修订，getExport 读取已完成问题包。附件 base64 输入限制原始 5 MiB，服务端仍须验证实际字节、类型与 SHA-256。Report.appVersion 是应用版本，Report.version 是乐观锁计数。

```ts
import { apiContract, FeedbackSubmitInputSchema } from '@h-ai/api-contract'

const input = FeedbackSubmitInputSchema.parse({ submissionId: 'operation-1', appId: 'orders' })
const contract = apiContract.create({ feedback: apiContract.feedback })
const path = apiContract.pathOf(contract.feedback.reports.submit)
```

## 可选交互挑战

IamCreateCaptchaInputSchema / IamCaptchaChallengeSchema 定义 POST /auth/captcha 的用途与可公开挑战，交互鉴别输入允许最多4096字符的可选 captcha。IamPublicConfigSchema.captcha 仅含 enabled，缺省关闭。Schema 校验结构，证明有效期、用途和单次消费由服务端 IAM 执行。

策略、默认值和恢复边界见 [IAM](../iam/README.md)。

## 页面离开会话策略

`session.endOnPageHide` 默认 `false`。启用后宿主调用 `actions.bindPageExit({ enabled: config.session.endOnPageHide })` 并在卸载时调用返回的清理函数；标准 admin/H5/fullstack 模板已经接入。非 BFCache 的 `pagehide`（也包括刷新、整页导航）通过 POST `/auth/session/close` 尽力撤销当前 access 及关联 refresh，沿用 CSRF/传输加密，使用 `keepalive` 且不自动刷新会话。该响应不清 Cookie/本地凭据，避免旧响应覆盖下一次登录。显式退出仍使用正常 logout，可靠撤销并清理当前凭据。浏览器可能不发送页面离开请求，因此必须按业务配合服务端 `idleTimeout`/`absoluteTimeout`；不能据此保证关闭即撤销。

## 开发测试

```bash
pnpm --filter @h-ai/api-contract test
pnpm --filter @h-ai/api-contract typecheck
```

Schema、推导类型与组合工具均提供可类型检查的示例；见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)。Schema 示例使用受约束的本地数据，不代表 provider 已执行。

## 许可证

Apache-2.0
