---
name: hai-api-contract
description: 使用 @h-ai/api-contract 定义或扩展 oRPC HTTP API 契约；当需求涉及定义新领域 contract、组合应用级 contract、使用内置 IAM/Storage/AI/Payment 契约、编写自定义 procedure 输入输出 Schema 或为 @h-ai/api-client/@h-ai/serv 提供接口真相源时使用。
---

# hai-api-contract

> `@h-ai/api-contract` 是 hai-framework 的公共 HTTP API 契约包，使用 oRPC contract + Zod v4 作为唯一接口真相源。本包只描述接口边界，不包含任何 procedure 实现。

---

## 运行环境

> ✅ **纯定义包，无运行时依赖。** 可在客户端、服务端、测试环境直接引用。

---

## 适用场景

- 定义新领域的 oRPC contract（输入/输出 Schema + HTTP 路由元数据）
- 组合多个领域 contract 为应用级 contract
- 向 `@h-ai/serv` 提供 contract（装配为 HTTP API）
- 向 `@h-ai/api-client` 提供 contract（生成类型安全客户端）
- 复用内置领域 contract（iam/storage/ai/payment）
- 复用公共 Schema 工厂（`haiResultSchema`、分页 Schema）

---

## 使用步骤

### 1. 组合应用级 contract

```typescript
import { createApiContract, iamContract, storageContract, aiContract } from '@h-ai/api-contract'

// 按需组合，传 false/undefined 的领域不会出现在 contract 或 OpenAPI spec 中
export const myContract = createApiContract({
  iam: iamContract,
  storage: storageContract,
  ai: aiContract,
  payment: false, // 禁用领域
})

// myContract.iam.auth.login
// myContract.storage.presignedUrls.createUpload
// myContract.ai.chats.createCompletion
```

### 2. 组合自定义 contract

```typescript
import { createApiContract, iamContract, storageContract } from '@h-ai/api-contract'

export const myContract = createApiContract({
  iam: iamContract,
  storage: storageContract,
  payment: false, // 禁用领域（不会出现在 contract 或 OpenAPI spec 中）
})
```

### 3. 定义新领域 contract

```typescript
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { haiResultSchema } from '@h-ai/api-contract'

// 输入 Schema
const WidgetCreateInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
})

// 输出 Schema（统一包装为 HaiResult<T>）
const WidgetOutputSchema = haiResultSchema(z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
}))

// 领域 contract
export const widgetContract = {
  widget: {
    create: oc
      .route({
        method: 'POST',
        path: '/widgets',
        operationId: 'widget.create',
        summary: 'Create widget',
        tags: ['widget'],
      })
      .input(WidgetCreateInputSchema)
      .output(WidgetOutputSchema),

    getById: oc
      .route({
        method: 'GET',
        path: '/widgets/{id}',
        operationId: 'widget.getById',
        summary: 'Get widget by id',
        tags: ['widget'],
      })
      .input(z.object({ id: z.string() }))
      .output(WidgetOutputSchema),
  },
}
```

### 4. 将新 contract 挂入应用级 contract

```typescript
import { createApiContract, iamContract } from '@h-ai/api-contract'
import { widgetContract } from './widget-contract.js'

export const appContract = createApiContract({
  iam: iamContract,
  widget: widgetContract,
})
```

### 5. 传给 `@h-ai/serv`（服务端）

```typescript
import { serv } from '@h-ai/serv'
import { appContract } from './app-contract.js'
import { createMyProcedures } from './procedures/widget.js'

const app = serv.createApp({
  contract: appContract,
  procedures: {
    iam: createIamProcedures({ iam }),
    widget: createMyProcedures(),
  },
  http: { apiPrefix: '/api/v1' },
})
```

---

## 核心 API

### `createApiContract(options)` — 组合领域 contract

```typescript
import { createApiContract } from '@h-ai/api-contract'

const contract = createApiContract({
  iam: iamContract,      // 启用：纳入 contract
  storage: false,        // 禁用：不出现在 OpenAPI spec 中
  custom: myContract,    // 自定义领域
})
// 类型自动收窄，被禁用的 key 不出现在 contract 类型中
```

### 内置领域 contract

| 导出名称 | 领域 | 功能概述 |
| --- | --- | --- |
| `iamContract` | IAM | auth（登录/登出/OTP/刷新/注册/改密码）、users、roles、permissions Admin CRUD |
| `storageContract` | Storage | presignedUrls（上传/下载/批量）、files（元数据查询/删除） |
| `aiContract` | AI | chats（completion/流式）、knowledge（上传/查询） |
| `paymentContract` | Payment | orders、subscriptions |

### 内置 contract 路径示例

```typescript
const myContract = createApiContract({ iam: iamContract, storage: storageContract, ai: aiContract })

// IAM
myContract.iam.auth.login        // POST /auth/login
myContract.iam.auth.logout       // POST /auth/logout
myContract.iam.users.list        // GET  /iam/users
myContract.iam.roles.create      // POST /iam/roles

// Storage
myContract.storage.presignedUrls.createUpload   // POST /storage/presigned-urls/upload

// AI
myContract.ai.chats.createCompletion  // POST /ai/chats/completion
```

### `haiResultSchema(dataSchema)` — 标准输出包装

所有 HTTP 输出必须通过 `haiResultSchema` 包装为 `HaiResult<T>`，与 `@h-ai/core` 的 `ok()/err()` 返回结构一致：

```typescript
import { haiResultSchema } from '@h-ai/api-contract'
import { z } from 'zod'

const OutputSchema = haiResultSchema(z.object({
  id: z.string(),
  name: z.string(),
}))

// 等价于:
// { success: true, data: { id: string, name: string } }
// | { success: false, error: HaiError }
```

### 公共 Schema 工具

| 导出名称 | 说明 |
| --- | --- |
| `haiResultSchema(dataSchema)` | `HaiResult<T>` 输出包装 |
| `HaiErrorSchema` | HaiError 公共字段 Schema |
| `PaginationInputSchema` | 分页参数 Schema（page/limit） |
| `PaginationOutputSchema` | 分页元数据 Schema（total/page/limit） |
| `paginationResultSchema(itemSchema)` | 分页列表输出 Schema |

---

## Contract 定义规范

### 必须遵循

- **输出必须包装为 `haiResultSchema`** — 客户端依赖 `success` 判断成功/失败
- **`operationId` 全局唯一** — 格式为 `domain.resource.action`，如 `iam.auth.login`
- **`tags` 至少包含领域名** — 供 OpenAPI 文档分组
- **输入 Schema 用 Zod v4** — 与 `@orpc/zod/zod4` 的 `ZodToJsonSchemaConverter` 配套
- **Contract 不含业务逻辑** — 只有 Schema + 路由元数据，没有 `async function`

### 禁止

- ❌ Contract 文件中 `import` 任何业务模块（`@h-ai/iam`、`@h-ai/storage` 等）
- ❌ 在 contract 中使用 `z.any()` 或 `z.unknown()` 作为输出类型
- ❌ 重复定义已存在的领域 contract

---

## 常见模式

### 带分页的列表接口

```typescript
import { paginationResultSchema, PaginationInputSchema, haiResultSchema } from '@h-ai/api-contract'
import { z } from 'zod'

const WidgetSchema = z.object({ id: z.string(), name: z.string() })

const listWidgets = oc
  .route({ method: 'GET', path: '/widgets', operationId: 'widget.list', tags: ['widget'] })
  .input(PaginationInputSchema.extend({ keyword: z.string().optional() }))
  .output(haiResultSchema(paginationResultSchema(WidgetSchema)))
```

### 路径参数

```typescript
// 路径中的 {id} 对应 input 中的 id 字段
const getWidget = oc
  .route({ method: 'GET', path: '/widgets/{id}', operationId: 'widget.getById', tags: ['widget'] })
  .input(z.object({ id: z.string() }))
  .output(haiResultSchema(WidgetSchema))
```

### 无输入的端点

```typescript
const healthContract = oc
  .route({ method: 'GET', path: '/health', operationId: 'health.check', tags: ['system'] })
  .output(haiResultSchema(z.object({ status: z.string() })))
```

---

## 测试

```bash
pnpm --filter @h-ai/api-contract test
pnpm --filter @h-ai/api-contract typecheck
pnpm --filter @h-ai/api-contract lint
```
