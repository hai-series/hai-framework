# hai-api-contract 参考

`@h-ai/api-contract` 定义 HTTP 操作的路径、方法及 Zod 输入输出。应用使用同一份定义装配服务或创建客户端。

## 运行环境

服务端、浏览器和测试可从 `@h-ai/api-contract` 导入契约和 Schema。只消费内置契约时安装此包即可。应用使用 `z` 声明自己的输入输出时，在共享契约包同时安装 `zod` v4。契约在导入时构造，无需调用 `init` 或 `close`。

独立契约包发布前验证实际声明构建。从公开入口导入 `ContractProcedureBuilderWithInputOutput`、`ContractProcedureBuilderWithOutput` 与 `Schema` 等推导所需的类型。

## 适用场景

| 任务 | 入口 | 交付给谁 |
| --- | --- | --- |
| 声明一个 HTTP 操作 | [`apiContract.route(route)`](#declare-routes) | 应用开发者将操作放到领域对象里 |
| 选择应用要提供的领域 | [`apiContract.create(options)`](#compose-domains) | Serv 服务或 typed client |
| 获取已声明操作的业务路径 | [`apiContract.pathOf(procedure)`](#read-route-path) | 客户端、路由规则或测试 |
| 提供统一的成功与失败形状 | [响应 Schema](#response-schemas) | 服务端输出与客户端结果判断 |

## 使用步骤

1. 复用已有领域操作，或在应用共享契约包用 `route` 声明新操作。
2. 把操作分组，再用 `create` 选择要装配的领域。
3. [用 Serv](#use-with-serv) 注册处理器，或[用 Kit](#use-with-kit) 在 SvelteKit 文件路由复用 Schema。需要调用生成的 HTTP API 时，[把同一份应用契约传给 API Client](#use-with-client)。
4. 从 `pathOf` 取得已声明操作的业务路径。只在使用方拼上实际的 API 前缀。

## 核心 API

<a id="declare-routes"></a>

### 声明单个操作：`apiContract.route(route)`

传入一个操作的 HTTP 元数据，返回可继续调用 `.input(schema)` 和 `.output(schema)` 的构造器。声明结果可放进领域对象。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiContract.route(route)` | 声明单个 HTTP 操作 | `route` 是 oRPC 的 HTTP 元数据对象。应用的公共接口应显式填写下表中的 `method`、`path`。 | oRPC 路由构造器，可绑定输入和输出 Schema。 | `apiContract.route({ method: 'POST', path: '/widgets/preview' })` |

##### 路由元数据

| 字段 | 参数与默认值 | 用途 |
| --- | --- | --- |
| `method` | `GET`、`HEAD`、`POST`、`PUT`、`PATCH`、`DELETE` | HTTP 方法。 |
| `path` | 以 `/` 开头，无宿主前缀 | 路由路径，路径参数写成 `{id}` 并由输入 Schema 描述。 |
| `operationId` | 可省略，OpenAPI 按路由键推导 | OpenAPI 操作标识。显式指定时应全局唯一。 |
| `summary`、`description`、`deprecated`、`tags` | 均可省略 | OpenAPI 的说明、弃用标记和分组。 |
| `successStatus`、`successDescription` | 成功状态默认 `200`，说明默认 `OK` | 描述成功 HTTP 响应。 |
| `inputStructure` | `compact` 默认，或 `detailed` | 默认合并路径参数和查询参数或正文。详细模式分别声明 `params`、`query`、`headers`、`body`。 |
| `outputStructure` | `compact` 默认，或 `detailed` | 默认直接返回正文。详细模式使用 `status`、`headers`、`body`。 |
| `spec` | 可省略，接受 OpenAPI 操作对象或变换函数 | 调整生成的 OpenAPI 操作；例如公开接口使用 `spec: operation => ({ ...operation, security: [] })`。 |

#### 场景：声明预览组件名称的 HTTP 操作

将下列代码放在共享契约包的 `widget-contract.ts`。这个操作读取 `name`，返回去除首尾空白后的名称。预览本身无持久化。

```ts
import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'

// 契约和 Kit 文件路由共用这个输入 Schema。空名称校验失败。
export const WidgetPreviewInputSchema = z.object({ name: z.string().trim().min(1) })

// 此操作的路由对象将供服务端实现和客户端推导使用。
export const widgetContract = {
  preview: apiContract.route({
    method: 'POST',
    path: '/widgets/preview',
    operationId: 'widgets.preview',
    tags: ['widgets'],
  })
    .input(WidgetPreviewInputSchema)
    .output(apiContract.haiResultSchema(z.object({ name: z.string() }))),
}
```

<a id="compose-domains"></a>

### 组合应用领域：`apiContract.create(options)`

`options` 的键是应用领域名称，值是一个已声明的操作或包含操作的路由对象。组合键供代码访问，并不会自动拼到已声明的 HTTP 路径前面。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiContract.create(options)` | 组合要提供的领域 | 必填 `options`。键名由应用选择。某个值为 `false` 或 `undefined` 时，省略该领域。 | 应用契约对象。条件启用的具名领域在类型上可为空。 | `apiContract.create({ iam: apiContract.iam, storage: false })` |

#### 场景：组合自定义操作和条件领域

在共享包的 `app-contract.ts` 固定启用 Widgets。由应用配置传入是否启用支付；固定禁用的存储领域从结果中省略。用 `satisfies` 保留具体键名。

```ts
import { type CreateApiContractOptions, apiContract } from '@h-ai/api-contract'
import { widgetContract } from './widget-contract.js'

export function makeAppContract(enablePayment: boolean) {
  const domains = {
    widgets: widgetContract,
    payment: enablePayment ? apiContract.payment : false,
    storage: false,
  } satisfies CreateApiContractOptions

  // 返回可交给 Serv 或 API Client 的路由对象。
  return apiContract.create(domains)
}
```

开关关闭时，`makeAppContract(false).payment?.orders.get` 得到 `undefined`。挂载服务时，按同一个开关选择契约和处理器；可先在各领域实现该领域的操作，再合并已启用的实现。

<a id="read-route-path"></a>

### 读取已声明的路径：`apiContract.pathOf(procedure)`

`procedure` 是一个声明了 HTTP 路径的操作节点。它可以是 `apiContract.route(...).input(...).output(...)` 链式调用的结果，也可以是 `apiContract.iam.auth.login` 或 `widgetContract.preview`。业务处理函数、路径字符串、领域对象与应用契约对象不属于这个参数的类型。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiContract.pathOf(procedure)` | 读取操作的业务路径 | 必填一个已显式设置 `path` 的 oRPC `AnyContractProcedure` 节点。 | 以 `/` 开头的原始路径模板。未声明 `path` 时抛错。 | `apiContract.pathOf(apiContract.iam.auth.login)` |

#### 场景：为请求规则或测试读取实际路径

```ts
import { apiContract } from '@h-ai/api-contract'
import { widgetContract } from './widget-contract.js'

// 读取内置登录操作的模板，得到 /auth/login。
const loginPath = apiContract.pathOf(apiContract.iam.auth.login)
// 读取自定义操作的模板。已知 Serv 前缀为 /api/v1，最终路径为 /api/v1/widgets/preview。
const previewPath = '/api/v1' + apiContract.pathOf(widgetContract.preview)
```

返回值保留 `{id}` 等占位符。手工构造某次请求的 URL 时，替换占位符并编码该路径段；typed client 可从输入对象自动填入。宿主前缀由实际 Serv 或 SvelteKit 路由提供。

### 内置领域契约

| 访问路径 | 功能概述 |
| --- | --- |
| `apiContract.iam` | 认证、会话、用户、角色和权限。 |
| `apiContract.storage` | 上传与下载预签名 URL、文件查询、删除和批量删除。 |
| `apiContract.ai` | 非流式聊天补全、消息与历史、记忆召回和会话列表。 |
| `apiContract.payment` | 订单和支付通知。 |
| `apiContract.feedback` | 反馈报告、对话和附件。 `reports.listMine` 查询本人报告，`apiContract.feedbackTransportRoutes` 提供固定的路由容量。 |

<a id="response-schemas"></a>

### 选用 HTTP 扩展契约

由宿主从 `apiContract.extensions` 选择端点，挂载相同形状的 Serv procedures，客户端通过 `apiClient.create(contract)` 生成调用入口。若同时选用基础与扩展端点，逐组展开 `chats`、`memories`、`roles`、`files` 或 `orders`，再将结果传给 `apiContract.create()`。

| 领域 | 扩展操作 |
| --- | --- |
| AI | `chats.streamCompletion`、`memories.add/update/remove/clear`、`audio.getCapabilities/issueTicket/transcribe/synthesize`、`images.generate` |
| IAM | `apiKeys.list/create/get/revoke`、`roles.listPermissions/replacePermissions` |
| Storage | `files.upload/download` |
| Audit | `logs.list/stats`、`backup.run` |
| Payment | `orders.close` |

### 描述响应和分页

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `apiContract.haiResultSchema(dataSchema)` | 描述业务成功与失败 | 必填成功数据的 Zod `dataSchema` | 含 `success` 判别字段的响应 Schema。 | `apiContract.haiResultSchema(z.string())` |
| `apiContract.voidResultSchema` | 描述成功时无业务数据 | 无参数 | 可用于 `.output(...)` 的 Schema。 | `.output(apiContract.voidResultSchema)` |
| `apiContract.paginatedSchema(itemSchema)` | 描述分页数据 | 必填每条结果的 `itemSchema` | 含 `items`、`total`、`page`、`pageSize` 的 Schema。 | `apiContract.paginatedSchema(z.string())` |
| `HaiErrorSchema` | 描述公共错误 | 从包根导入 | 可校验错误的 Schema。 | `HaiErrorSchema.safeParse(value)` |
| `PaginationQuerySchema` | 校验分页查询 | `page`、`pageSize` 可省略，最小 1，`pageSize` 最大 100。默认页码和页大小由应用服务选择。 | 支持将查询字符串解析为数字。 | `PaginationQuerySchema.parse({ page: '2' })` |

普通业务响应按 `success` 区分结果。渠道回调按自身协议响应，例如支付宝异步通知成功返回 HTTP 200 和纯文本 `success`。IAM 用户、角色、权限的必填 `createdAt` / `updatedAt` 和 OTP 的 `expiresAt` 接受有效 `Date` 或带时区的 ISO 日期时间字符串。`null` 校验失败。HTTP JSON 中保留线上 ISO 字符串。

#### 场景：为列表接口复用分页约定

创建组件列表操作时，从 `PaginationQuerySchema` 读取分页参数，用 `paginatedSchema` 描述成功数据。处理器可在省略页码或页大小时自行选择默认值。

```ts
import { PaginationQuerySchema, apiContract } from '@h-ai/api-contract'
import { z } from 'zod'

const WidgetSchema = z.object({ id: z.string(), name: z.string() })
const list = apiContract.route({ method: 'GET', path: '/widgets' })
  .input(PaginationQuerySchema)
  .output(apiContract.haiResultSchema(apiContract.paginatedSchema(WidgetSchema)))

// 字符串页码可用于 GET 查询，校验后得到数字。页大小仍未指定。
const query = PaginationQuerySchema.parse({ page: '2' })
const rejected = PaginationQuerySchema.safeParse({ pageSize: '101' })
```

将 `list` 放入领域对象后再装配。示例中的 `query.page` 为 `2`，`rejected.success` 为 `false`。

## 常见模式

<a id="use-with-serv"></a>

### 用 Serv 挂载业务操作

将以下代码放在 Serv 应用中。示例只启用 Widgets，因此无需初始化 IAM、DB 或缓存。请求正文由契约验证，处理器实现预览。

```ts
import { apiContract } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { type ServContext, serv } from '@h-ai/serv'
import { widgetContract } from './widget-contract.js'

// 装配阶段所使用的领域组合。
const contract = apiContract.create({ widgets: widgetContract })
// 按操作键 preview 注册实现。input.name 已去除首尾空白。
const widgets = serv.implement(widgetContract)
  .context<ServContext>()
  .route('preview', ({ input }) => core.ok({ name: input.name }))
  .build()

// API 前缀加到已经声明的业务路径上。
const app = serv.createApp({ contract, procedures: { widgets }, http: { apiPrefix: '/api/v1' } })
const response = await app.request('/api/v1/widgets/preview', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: '  demo  ' }),
})
// 预期 HTTP 200，JSON 为 { success: true, data: { name: 'demo' } }。
```

使用内置 IAM 时，先初始化 IAM 和所需依赖。将同一实例同时传给 `serv.createIamProcedures({ iam })` 和 `serv.createApp({ ..., iam })`，使认证守卫能取得经校验的会话。公开 IAM 配置、登录、注册、验证码、找回密码和刷新等操作在 OpenAPI 中声明 `security: []`。实际凭据和访问权限仍由请求处理器校验。

<a id="use-with-kit"></a>

### 用 Kit 在 SvelteKit 文件路由复用 Schema

在 SvelteKit 应用创建 `src/routes/api/widgets/preview/+server.ts`，并将示例共享契约放在 `src/lib/contracts/widget-contract.ts`。文件位置决定 URL，命名导出的 `POST` 决定方法。Kit 在 handler 中复用同一份请求 Schema。

```ts
import { kit } from '@h-ai/kit'
import { WidgetPreviewInputSchema } from '$lib/contracts/widget-contract.js'

export const POST = kit.handler(async ({ request }) => {
  // 读取 JSON 或表单正文。无效名称返回 HTTP 400，后续处理不执行。
  const { name } = await kit.validate.body(request, WidgetPreviewInputSchema)
  // 有效名称返回 HTTP 200 和 HaiResult<{ name: string }>。
  return kit.response.ok({ name })
})
```

若客户端和服务端位于不同应用，改从共享契约包的公开入口导入 Schema。根目录部署时浏览器可用 `@h-ai/kit/client` 的 `kit.client.create()` 创建同源客户端，再调用 `client.apiFetch('/api/widgets/preview', requestInit)`。它返回 Fetch `Response`，需要检查 HTTP 状态并读取 JSON。页面卸载时调用 `client.destroy()`。如需从应用契约推导方法与返回类型，参照下一节。

<a id="use-with-client"></a>

### 用 API Client 调用已部署的契约

部署上面的 Serv 示例后，用同一份共享契约创建 typed client。API 地址包含 Serv 前缀。域名替换成实际测试服务。

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { widgetContract } from './widget-contract.js'

// 选择服务实际提供的领域，然后创建独立的客户端。
const contract = apiContract.create({ widgets: widgetContract })
const client = apiClient.create(contract)
const ready = await client.init({ baseUrl: 'https://api.example.com/api/v1' })
if (!ready.success)
  throw new Error(ready.error.message)

try {
  // 传入待预览的名称。先判断 success，再读取返回的名称。
  const result = await client.widgets.preview({ name: '  demo  ' })
  if (!result.success)
    throw new Error(result.error.message)
  const name = result.data.name // 'demo'
}
finally {
  await client.close()
}
```

若同一契约描述的是 Kit 端点，客户端地址应使用对应的挂载前缀，例如 `/api`，且文件路由的 HTTP 方法、业务路径和响应需与契约匹配。自定义裸值和 SSE 还需处理建立调用时的失败分支。

## Contract 定义规范

- `*-contract.ts` 持有路由的方法、业务路径及输入输出。业务处理器在宿主项目注册。
- 跨接口或跨层复用的 Schema 可放到 `*-schemas.ts`。只被一处使用的输出可以直接在 `.output(...)` 里定义。
- 公共传输配置归宿主。Serv 的 HTTP 前缀和传输选项由应用读取并传入；Kit 的文件路由与 SvelteKit 部署前缀由其应用确定。
- 定义与测试使用各包公开入口。同一 HTTP 方法与路径只注册一次，Web 与服务端共享同一份定义和版本。

## 测试

```bash
pnpm --filter @h-ai/api-contract typecheck
pnpm --filter @h-ai/api-contract lint
pnpm --filter @h-ai/api-contract test
```

在项目中用同一份预览输入验证两个分支。发送带空白的 `name` 后应读到规范化的名称，发送空字符串后应看到校验失败。构建应用的共享契约包后，从真实公开入口检查服务端装配和客户端推导。
