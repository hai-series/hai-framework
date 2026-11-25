# hai-api-contract 参考

> `@h-ai/api-contract` 是 hai-framework 的公共 HTTP API 契约包，使用 oRPC contract + Zod v4 作为唯一接口真相源。本包只描述接口边界，不包含任何 procedure 实现。

## 运行环境

独立 contract 包发布前验证实际声明构建。`ContractProcedureBuilderWithInputOutput`、`ContractProcedureBuilderWithOutput`、`Schema` 直接复用上游公共类型，由 `@h-ai/api-contract` 类型转出，供推导声明与显式 `import type` 使用；不手写仿造类型或导入 node_modules 内部路径。

> ✅ **契约定义包，无服务端业务依赖；Zod/oRPC schema 构造仍有运行时代码。** 可在客户端、服务端、测试环境直接引用。

## 适用场景

- 定义新领域的 oRPC contract（输入/输出 Schema + HTTP 路由元数据）
- 组合多个领域 contract 为应用级 contract
- 向 `@h-ai/serv` 提供 contract（装配为 HTTP API）
- 向 `@h-ai/api-client` 提供 contract（生成类型安全客户端）
- 复用内置领域 contract（iam/storage/ai/payment/feedback）
- 复用公共 Schema 工厂（`apiContract.haiResultSchema`、分页 Schema）

## 使用步骤

### 1. 组合应用级 contract

```typescript
import { apiContract } from '@h-ai/api-contract'

// 按需组合，传 false/undefined 的领域不会出现在 contract 或 OpenAPI spec 中
// 组合 IAM、Storage 和 AI 路由，得到应用契约。payment 为 false，因此不包含支付路由。
export const myContract = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  ai: apiContract.ai,
  payment: false, // 禁用领域
})

// myContract.iam.auth.login
// myContract.storage.presignedUrls.createUpload
// myContract.ai.chats.createCompletion
```

### 2. 组合自定义 contract

```typescript
import { apiContract } from '@h-ai/api-contract'

// 将启用的 IAM 和 Storage 路由组合为契约。构造阶段不调用服务。
export const myContract = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  payment: false, // 禁用领域（不会出现在 contract 或 OpenAPI spec 中）
})
```

### 3. 定义新领域 contract

```typescript
import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'

// 输入 Schema
const WidgetCreateInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
})

// 同一 contract 内两个接口复用，因此保留为文件私有常量，不从 schemas 导出。
// 声明成功数据中的 id、name、createdAt 字段和标准失败形状。
const WidgetOutputSchema = apiContract.haiResultSchema(z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
}))

// 领域 contract
export const widgetContract = {
  widget: {
    create: apiContract
      // 建立 POST /widgets 的路由定义并指定操作 ID 和分组。
      .route({
        method: 'POST',
        path: '/widgets',
        operationId: 'widget.create',
        summary: 'Create widget',
        tags: ['widget'],
      })
      // 为创建请求绑定已有的 name 和可选 description 校验。
      .input(WidgetCreateInputSchema)
      // 声明创建接口闭合在同一 HaiResult 输出形状。
      .output(WidgetOutputSchema),

    getById: apiContract
      .route({
        // 建立 GET /widgets/{id} 的路由定义。
        method: 'GET',
        path: '/widgets/{id}',
        operationId: 'widget.getById',
        summary: 'Get widget by id',
        tags: ['widget'],
      })
      // 将路径 id 绑定到输入的字符串字段。
      .input(z.object({ id: z.string() }))
      // 复用创建接口的同一成功及失败输出形状。
      .output(WidgetOutputSchema),
  },
}
```

### 4. 将新 contract 挂入应用级 contract

```typescript
import { apiContract } from '@h-ai/api-contract'
import { widgetContract } from './widget-contract.js'

// 组合内置 IAM 和本地 widgetContract，返回应用路由契约。
export const appContract = apiContract.create({
  iam: apiContract.iam,
  widget: widgetContract,
})
```

### 5. 传给 `@h-ai/serv`（服务端）

先初始化 IAM 和所需依赖。将同一个 IAM 实例传给 `serv.createIamProcedures` 和 `serv.createApp`，让业务处理函数和请求认证使用同一个会话来源。登录后，将访问令牌作为 Bearer 令牌发送到 `GET /api/v1/auth/me`，有效会话返回用户资料、角色和权限。

OpenAPI 为 IAM 公开配置、挑战、登录、注册、验证码、续密、找回密码和令牌刷新声明 `security: []`。这些操作可以在没有 Bearer 令牌的情况下启动，并由业务处理函数校验各自的输入和凭据。`currentUser` 等受保护接口沿用服务的 Bearer 要求。

```typescript
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { appContract } from './app-contract.js'
import { createMyProcedures } from './procedures/widget.js'

// 将应用契约及领域实现挂到 /api/v1，返回组装好的 HTTP App。
const app = serv.createApp({
  contract: appContract,
  procedures: {
    // 用已初始化的 IAM 服务创建认证和管理路由的处理器。
    iam: serv.createIamProcedures({ iam }),
    widget: createMyProcedures(),
  },
  iam, // Serv 验证 Bearer 令牌并填充守卫使用的会话。
  http: { apiPrefix: '/api/v1' },
})
```

## 核心 API

### `apiContract.create(options)` — 组合领域 contract

```typescript
import { apiContract } from '@h-ai/api-contract'

// 组合内置 IAM 和自定义领域，false 排除 Storage。
const contract = apiContract.create({
  iam: apiContract.iam,      // 启用：纳入 contract
  storage: false,            // 禁用：不出现在 OpenAPI spec 中
  custom: myContract,        // 自定义领域
})
// 固定禁用的 storage 从类型和运行时对象中移除。
```

开关来自运行时配置时，使用 `satisfies CreateApiContractOptions` 保留具体键名。条件启用的领域为可选，用 `?.` 读取它。

```typescript
import { type CreateApiContractOptions, apiContract } from '@h-ai/api-contract'

function readPaymentRoute(enablePayment: boolean) {
  const domains = {
    iam: apiContract.iam,
    payment: enablePayment ? apiContract.payment : false,
  } satisfies CreateApiContractOptions
  // 固定启用 IAM；开关关闭时 payment 为 undefined。
  const contract = apiContract.create(domains)
  const get = contract.payment?.orders.get
  return get ? apiContract.pathOf(get) : undefined
}
```

### 内置领域 contract

| 访问路径 | 领域 | 功能概述 |
| --- | --- | --- |
| `apiContract.iam` | IAM | auth（登录/登出/OTP/刷新/注册/改密码）、users、roles、permissions Admin CRUD |
| `apiContract.storage` | Storage | presignedUrls（上传/下载/批量）、files（元数据查询/删除） |
| `apiContract.ai` | AI | chats（非流式补全/消息/历史）、memories（召回/列表）、sessions（列表） |
| `apiContract.payment` | Payment | orders、notifications |
| `apiContract.feedback` | Feedback | reports、attachments；`reports.policy` 提供有效容量，`reports.listMine` 查询本人报告 |

### 内置 contract 路径示例

```typescript
// 组合三个内置领域，得到下面用于查找命名路由的契约。
const myContract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

// IAM
myContract.iam.auth.login        // POST /auth/login
myContract.iam.auth.logout       // POST /auth/logout
myContract.iam.users.list        // GET  /iam/users
myContract.iam.roles.create      // POST /iam/roles

// Storage
myContract.storage.presignedUrls.createUpload   // POST /storage/presigned-urls/upload

// AI
myContract.ai.chats.createCompletion  // POST /ai/chats/completions，非流式 JSON
```

### `apiContract.haiResultSchema(dataSchema)` — 标准输出包装

普通 JSON 业务接口通过 `apiContract.haiResultSchema` 包装为 `HaiResult<T>`，与 `@h-ai/core` 的 `core.ok()/err()` 返回结构一致。支付渠道的通知按对应协议响应，例如支付宝异步通知使用 HTTP 200 和纯文本 `success`。

```typescript
import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'

const getWidget = apiContract
  // 定义 GET /widgets/{id} 的路径及方法。
  .route({ method: 'GET', path: '/widgets/{id}' })
  // 用 Widget 的 id 和 name 声明成功数据，HaiResult 同时包含失败形状。
  .output(apiContract.haiResultSchema(z.object({
    id: z.string(),
    name: z.string(),
  })))

// 等价于:
// { success: true, data: { id: string, name: string } }
// | { success: false, error: HaiError }
```

### `apiContract.pathOf(procedure)` — 读取业务路径

```typescript
// 获取内置刷新操作的相对路径，结果为 /auth/refresh。
const refreshPath = apiContract.pathOf(apiContract.iam.auth.refresh)
// '/auth/refresh'
```

middleware、client 与 E2E 需要业务路径时从 contract 元数据读取，不维护第二份 route 常量。服务端挂载时再与 `_serv.yml` 的 `http.apiPrefix` 拼接。

### 公共 Schema 工具

| 访问路径 | 说明 |
| --- | --- |
| `apiContract.haiResultSchema(dataSchema)` | `HaiResult<T>` 输出包装 |
| `apiContract.voidResultSchema` | `HaiResult<void>` 空结果包装 |
| `apiContract.paginatedSchema(itemSchema)` | 分页列表输出 Schema |
| `HaiErrorSchema` | HaiError 公共字段 Schema |
| `PaginationQuerySchema` | 分页参数 Schema（可选 page/pageSize，pageSize 上限 100；默认值由服务端处理） |

IAM 用户、角色、权限的必填 `createdAt` / `updatedAt` 和 OTP 的 `expiresAt` 接受有效 `Date` 或带时区的 ISO 日期时间字符串。`null` 校验失败。HTTP JSON 中这些值为 ISO 字符串，API Client 校验后保留线上格式。

## Contract 定义规范

### 必须遵循

- **普通 JSON 业务输出使用 `apiContract.haiResultSchema` 或 `apiContract.voidResultSchema`**，客户端按 `success` 判断业务结果。支付通知等渠道回调按其协议定义响应。
- **业务 path 直接写在对应 `*-contract.ts`** — 禁止新增 `*-routes.ts` 或业务路径常量
- **一次性 `*OutputSchema` 直接内联** — 不在 schemas 文件声明或导出
- **同一 contract 内重复使用的输出可设私有常量** — 不得为复用扩大公共导出
- **公共 HTTP 传输配置以配置文件为准** — API 前缀、健康检查、OpenAPI/docs、密钥协商路径与跨端 Header 放在 service 的 `_serv.yml`，不放 contract 包
- **schemas 只保留真实复用结构** — 至少被多个接口或 contract/procedure 等不同层共同消费
- **`operationId` 全局唯一** — 格式为 `domain.resource.action`，如 `iam.auth.login`
- **`tags` 至少包含领域名** — 供 OpenAPI 文档分组
- **输入 Schema 用 Zod v4** — 与 `@orpc/zod/zod4` 的 `ZodToJsonSchemaConverter` 配套
- **Contract 不含业务逻辑** — 只有 Schema + 路由元数据，没有 `async function`

### 禁止

- ❌ Contract 文件中 `import` 任何业务模块（`@h-ai/iam`、`@h-ai/storage` 等）
- ❌ 在 contract 中使用 `z.any()` 或 `z.unknown()` 作为输出类型
- ❌ 重复定义已存在的领域 contract
- ❌ 导出只被单个 contract 接口使用的 `*OutputSchema`
- ❌ 用独立 `*-routes.ts` 维护业务接口路径

### 文件职责

| 文件 | 只负责 |
| --- | --- |
| `*-contract.ts` | 业务接口 path、method、输入与输出边界 |
| `*-schemas.ts` | 跨接口或跨层复用的输入、实体、数据结构 |
| service `config/_serv.yml` | API 前缀、基础设施端点、跨端 Header 与加密 transport 配置 |

## 常见模式

### 带分页的列表接口

```typescript
import { PaginationQuerySchema, apiContract } from '@h-ai/api-contract'
import { z } from 'zod'

const WidgetSchema = z.object({ id: z.string(), name: z.string() })

const listWidgets = apiContract
  // 定义 Widget 列表的 GET 路径、操作 ID 和 OpenAPI 标签。
  .route({ method: 'GET', path: '/widgets', operationId: 'widget.list', tags: ['widget'] })
  // 沿用分页校验并加入可选关键词，无效输入由运行时校验拒绝。
  .input(PaginationQuerySchema.extend({ keyword: z.string().optional() }))
  // 将 Widget 条目及分页元数据包装进 HaiResult 输出，也允许标准错误。
  .output(apiContract.haiResultSchema(apiContract.paginatedSchema(WidgetSchema)))
```

### 路径参数

```typescript
// 路径中的 {id} 对应 input 中的 id 字段
const getWidget = apiContract
  // 定义按 id 获取 Widget 的 GET 路由。
  .route({ method: 'GET', path: '/widgets/{id}', operationId: 'widget.getById', tags: ['widget'] })
  // 声明路径参数 id 是字符串。
  .input(z.object({ id: z.string() }))
  // 声明 Widget 成功数据及标准失败输出。
  .output(apiContract.haiResultSchema(WidgetSchema))
```

### 无输入的端点

```typescript
const versionContract = apiContract
  // 定义系统版本 GET 路由并指定操作 ID 和分组。
  .route({ method: 'GET', path: '/system/version', operationId: 'system.version', tags: ['system'] })
  // 声明版本字符串的成功数据及标准错误形状。
  .output(apiContract.haiResultSchema(z.object({ version: z.string() })))
```

## 测试

```bash
pnpm --filter @h-ai/api-contract test
pnpm --filter @h-ai/api-contract typecheck
pnpm --filter @h-ai/api-contract lint
```
