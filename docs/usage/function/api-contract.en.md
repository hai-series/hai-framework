# @h-ai/api-contract API reference

[Chinese source](api-contract.md) · [Configuration](../configuration/api-contract.en.md) · [Data structures](../data/api-contract.en.md)

## Quick start

Import `apiContract` from `@h-ai/api-contract`. Assemble an application contract, then share it with the server procedures and the typed client.

```ts
import { apiContract } from '@h-ai/api-contract'

// Compose the built-in IAM and storage routers into contract. Passing false omits AI. This only defines the contract.
export const contract = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  ai: false,
})
```

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

<a id="api-list"></a>

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

<a id="routes"></a>

### Define and compose HTTP contracts: `apiContract`

Contracts describe paths, input and output without sending requests. Share them between server implementations and clients.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `apiContract.create` | 组合应用接口 | `{ iam: apiContract.iam, payment: false }` | `{ iam: IamContract }` | `apiContract.create({ iam: apiContract.iam, payment: false })` |
| `apiContract.route` | 声明 HTTP 接口 | `{ method: "GET", path: "/status" }` | `ContractProcedureBuilder` | `apiContract.route({ method: "GET", path: "/status" })` |
| `apiContract.pathOf` | 取唯一业务路径 | `apiContract.iam.auth.login` | `string: "/auth/login"` | `apiContract.pathOf(apiContract.iam.auth.login)` |

#### Scenario: Define and compose HTTP contracts

The contract object does not listen on a port. This map distinguishes route/schema declarations, server implementation and the typed client.

![How one contract connects client and server](../images/function-api-contract-boundaries.en.svg)

The same input/output definition guides both server implementation and client types. Authentication, resource authorization and business effects belong to the server; contract construction or browser validation cannot perform them.

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

Inputs are a GET /status builder and selected modules. The output is still a contract, not a listening HTTP server; use Serv or Kit to serve it.

[Detailed parameters and workflows](api-contract.md#routes)

<a id="response-schemas"></a>

### Validate results and pages: `apiContract.*Schema`

Distinguish schema validation success from business result success; safeParse.success checks structure only.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `apiContract.haiResultSchema` | 校验成功或失败结果 | `z.string()` | `ZodSchema<HaiResult<string>>` | `apiContract.haiResultSchema(z.string())` |
| `apiContract.voidResultSchema` | 校验无业务数据的结果 | `{ success: true, data: undefined }` | `ZodSchema<HaiResult<void>>` | `apiContract.voidResultSchema.safeParse({ success: true, data: undefined })` |
| `apiContract.paginatedSchema` | 校验分页列表 | `z.object({ id: z.string() })` | `ZodSchema<{ items: { id: string }[], total: number, page: number, pageSize: number }>` | `apiContract.paginatedSchema(z.object({ id: z.string() }))` |

#### Scenario: Validate results and pages

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

Inputs cover string, void and page results plus a wrong data type. Outputs are validation results; still inspect the nested HaiResult.success.

[Detailed parameters and workflows](api-contract.md#response-schemas)

<a id="domains"></a>

### Select standard domains: `apiContract`

Select the standard domains an application implements, then attach actual services, identity and resource authorization.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `apiContract.iam` | 认证与账号接口 | `—` | `iam contract router` | `apiContract.create({ iam: apiContract.iam })` |
| `apiContract.storage` | 文件接口 | `—` | `storage contract router` | `apiContract.create({ storage: apiContract.storage })` |
| `apiContract.ai` | AI 接口 | `—` | `ai contract router` | `apiContract.create({ ai: apiContract.ai })` |
| `apiContract.payment` | 支付接口 | `—` | `payment contract router` | `apiContract.create({ payment: apiContract.payment })` |
| `apiContract.feedback` | 反馈接口 | `—` | `feedback contract router` | `apiContract.create({ feedback: apiContract.feedback })` |

#### Scenario: Select standard domains

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

Five existing routers become a composed route tree without executing business work. Authentication, challenges, feedback and page-exit behavior follow below.

[Detailed parameters and workflows](api-contract.md#domains)
