# @h-ai/api-contract API Reference

<!-- translation: partial -->

[Chinese source](api-contract.md) · [Configuration](../configuration/api-contract.en.md) · [Data structures](../data/api-contract.en.md)

## Quick start

<a id="module-dependencies"></a>

### Dependencies

| Dependency | Purpose | When required | Setup order |
| --- | --- | --- | --- |
| `@h-ai/core` | Provides shared result and error shapes. | Installed with API Contract. | Import the contracts and schemas directly. |
| `@h-ai/storage/schemas` | Validates object keys, prefixes, and signature lifetimes for file APIs. | Provided by `@h-ai/storage`, which is installed with API Contract. | Import the storage contract to use its schemas. The application initializes Storage when it enables file routes that handle requests. |
| `@orpc/contract`, `zod` | Define route contracts and validate inputs and outputs. | Installed with API Contract. Declare packages such as Zod as direct dependencies if application code imports them. | Import the libraries, then define schemas and contracts. Pass the composed contract to the client and server as needed. |

### Example

Install `@h-ai/api-contract`. The custom contract example below also imports Zod directly.

```sh
pnpm add @h-ai/api-contract zod
```

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
| `apiContract.create(options)` | Compose domain contracts | Required `options: CreateApiContractOptions` maps domain names to contract routers. A value of `false` or `undefined` excludes that domain. See [contract and route fields](#contract-route-options). | `{ iam: IamContract }` | `apiContract.create({ iam: apiContract.iam, payment: false })` |
| `apiContract.route(route)` | Declare an HTTP endpoint | Required `route: Route`. Set the HTTP `method` and a `path` beginning with `/` for an HTTP endpoint. You can also supply OpenAPI metadata such as `summary`, `description`, and `tags`. See [contract and route fields](#contract-route-options). | `ContractProcedureBuilder` | `apiContract.route({ method: "GET", path: "/status" })` |
| `apiContract.pathOf(procedure)` | Read the declared HTTP path | Required `procedure: AnyContractProcedure` must declare an HTTP route path. | `string: "/auth/login"` | `apiContract.pathOf(apiContract.iam.auth.login)` |

<a id="contract-route-options"></a>

##### Contract and route fields

These fields define the contract and HTTP mapping. The example combines `{ status, iam: apiContract.iam, payment: false }` into a contract with just `status` and `iam`, then reads the path `/auth/login`.

| Field | Default or required | Effect and conditions |
| --- | --- | --- |
| `options[domain]` | Required object; domains may be omitted | Each key names a router or procedure. Always-enabled named domains are required, always-disabled domains are omitted, and conditionally enabled domains are optional. The runtime object contains the enabled domains. |
| `route.method / route.path` | Optional; set explicitly for HTTP endpoints | `method` is the HTTP method and `path` starts with `/`. `pathOf` requires a declared path. |
| `route.operationId` | Defaults to joining the router segments | Overrides the OpenAPI operation identifier. |
| `route.summary / route.description / route.deprecated / route.tags` | Optional | OpenAPI summary, description, deprecation flag, and grouping tags. |
| `route.successStatus / route.successDescription` | `200` / `OK` | Success status and description. The status must be in the 200–399 range. |
| `route.inputStructure` | `compact` | `compact` combines path parameters with query or body. `detailed` exposes separate `params`, `query`, `headers`, and `body` fields. |
| `route.outputStructure` | `compact` | `compact` sends the output as the body. `detailed` accepts `status`, `headers`, and `body`; omitted `status` uses `successStatus`. |
| `route.spec` | Optional; auto-generated by default | Supply an OpenAPI Operation Object or a function that receives the generated operation and returns its replacement. |

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

Ordinary JSON business endpoints use `HaiResult<T>`. Alipay notifications require HTTP 200 with the plain-text body `success`. See [Alipay notification acknowledgement](./payment.en.md#alipay-notification-ack).

[Detailed parameters and workflows](api-contract.md#routes)

<a id="conditional-domains"></a>

#### Scenario: Enable an optional domain from configuration

Read the payment switch from application configuration at startup. Use `satisfies` to preserve the named domains and their conditional types. With payment disabled, `contract.payment` and the client's `payment` domain are `undefined`. Use `?.` to access an optional domain.

```ts
import { type CreateApiContractOptions, apiContract } from '@h-ai/api-contract'

function buildContract(enablePayment: boolean) {
  const domains = {
    iam: apiContract.iam,
    payment: enablePayment ? apiContract.payment : false,
  } satisfies CreateApiContractOptions
  // Include IAM in all cases and payment when configured.
  const contract = apiContract.create(domains)
  const get = contract.payment?.orders.get
  // Return the order lookup path when enabled, or undefined when disabled.
  const queryPath = get ? apiContract.pathOf(get) : undefined
  return { contract, queryPath }
}
```

<a id="serv-iam-wiring"></a>

#### Scenario: Mount the IAM contract in Serv

After the host initializes IAM and its dependencies, pass the same IAM instance to the procedure builder and `serv.createApp`. The first call supplies the handlers. The app uses IAM to verify Bearer tokens and populate the session for route guards.

```ts
import type { IamFunctions } from '@h-ai/iam'
import { apiContract } from '@h-ai/api-contract'
import { serv } from '@h-ai/serv'

function mountIamApi(iam: IamFunctions) {
  const contract = apiContract.create({ iam: apiContract.iam })
  const procedures = { iam: serv.createIamProcedures({ iam }) }
  // Mount the initialized IAM service under /api/v1 and return the HTTP app.
  return serv.createApp({ contract, procedures, iam, http: { apiPrefix: '/api/v1' } })
}
```

Sign in with a test account, then send `Authorization: Bearer <accessToken>` to `GET /api/v1/auth/me`. A valid session produces `success: true` with the user profile, roles and permissions. Omitting the token produces an unauthenticated failure result.

OpenAPI declares `security: []` for the public IAM operations `createCaptcha`, `publicConfig`, `renewPassword`, `loginWithLdap`, `requestPasswordReset`, `confirmPasswordReset`, `login`, `loginWithOtp`, `refresh`, `sendOtp` and `register`. These calls can start without a Bearer token. Each operation applies its own server-side input and credential checks. Protected operations such as `currentUser` inherit the service's Bearer requirement.

<a id="response-schemas"></a>

### Validate results and pages: `apiContract.*Schema`

Distinguish schema validation success from business result success; safeParse.success checks structure only.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `apiContract.haiResultSchema(dataSchema)` | 校验成功或失败结果 | Required `dataSchema` is the Zod schema for `data` in the success branch. | `ZodSchema<HaiResult<string>>` | `apiContract.haiResultSchema(z.string())` |
| `apiContract.voidResultSchema` | 校验无业务数据的结果 | Schema constant. The example uses `safeParse(input)` to validate a result with no business data. | `ZodSchema<HaiResult<void>>` | `apiContract.voidResultSchema.safeParse({ success: true, data: undefined })` |
| `apiContract.paginatedSchema(itemSchema)` | 校验分页列表 | Required `itemSchema` is the Zod schema for one record in the paginated `items` array. | `ZodSchema<{ items: { id: string }[], total: number, page: number, pageSize: number }>` | `apiContract.paginatedSchema(z.object({ id: z.string() }))` |

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

The five routers form the app contract. For feedback, `reports.policy({})` returns the effective capacity, `reports.listMine({ page: 1 })` lists the signed-in author's reports, and `reports.list` serves the administrative list.

[Authentication settings, challenges, feedback schemas and page-exit behavior in Chinese](api-contract.md#domains)
