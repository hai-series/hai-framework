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

协议支持配置中的 userAgreementMarkdown/privacyPolicyMarkdown 正文及 URL；同主题优先 Markdown，由安全渲染器在弹窗显示。

标准 IAM contract 新增 GET /auth/config、POST /auth/login/ldap、POST /auth/password-reset/request、POST /auth/password-reset/confirm。公开配置 Schema 是安全白名单。IamLdapLoginInput、IamPublicConfig 对调用方提供真实类型。密码长度以 IAM 运行时策略为准，contract 不固定注册密码最小长度。

[完整 IAM 配置 / IAM configuration](../iam/README.md)

### 错误处理

Contract 只描述输入输出结构。业务错误由 procedure 返回 `HaiResult<T>` 表达，客户端不需要捕获业务异常。

## 开发测试

```bash
pnpm --filter @h-ai/api-contract test
pnpm --filter @h-ai/api-contract typecheck
```

## 许可证

Apache-2.0

## 输入约束与 HTTP 能力

存储 key 按 UTF-8 最多 1024 字节，并拒绝绝对路径、反斜线、控制字符及点路径段；公开 HTTP 批量删除每次 1–1000 项。`@h-ai/storage/schemas` 提供浏览器安全的共同规则。预签名有效期为整数 1–604800 秒（Node 默认 3600，HTTP 默认 900）；HTTP 上传仅接受 key/contentType/expiresIn，不支持 contentLength/maxSize/metadata/checksum。无效输入返回 HTTP 400，typed client 映射 VALIDATION_FAILED。FileUpload 的大小/类型限制仅为前端体验，实际对象须由应用服务端复核。Node 流式读写/checksum/条件写等没有默认 HTTP 端点。完整映射与授权边界见 [存储 API 能力](../../docs/storage-api-capabilities.md)。
