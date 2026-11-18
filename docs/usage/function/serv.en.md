# @h-ai/serv API reference

<!-- translation: partial -->

[Chinese source](serv.md) · [Configuration](../configuration/serv.en.md) · [Data structures](../data/serv.en.md)

## Quick start

Use Serv to mount a typed HTTP contract in a standalone Node server. Configure authentication, transport encryption and trusted request parsing before listening.

```ts
import type { ServConfig } from '@h-ai/serv'
import { ai } from '@h-ai/ai'
import { apiContract } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { createAiProcedures } from '@h-ai/serv/features/ai'
import { createIamProcedures } from '@h-ai/serv/features/iam'
import { createStorageProcedures } from '@h-ai/serv/features/storage'
import { storage } from '@h-ai/storage'

export function startApi(closeApp: () => Promise<void>) {
  // 用三个模块的契约生成 HTTP 路由契约。
  const contract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

  // 将已初始化的业务模块绑定为实现；存储检查所有 key 的归属。
  const procedures = {
    iam: createIamProcedures({ iam }),
    storage: createStorageProcedures({
      storage,
      authorize: ({ context, keys }) => keys.every(key =>
        key.startsWith(`users/${encodeURIComponent(context.session.userId)}/`)),
    }),
    ai: createAiProcedures({ ai }),
  }

  // 使用契约、实现和 HTTP 设置构建 App。
  const app = serv.createApp({
    contract,
    procedures,
    iam,
    http: {
      apiPrefix: '/api/v1',
      openapi: { path: '/openapi.json' },
      docs: { path: '/docs' },
    },
  })

  // 读取已加载的监听配置，返回包含地址和 close() 的句柄。
  const { server } = core.config.getOrThrow<ServConfig>('serv')
  return serv.listen(app, {
    host: server.host,
    port: server.port,
    onListening: info => core.logger.info('API service listening', { port: info.port }),
    onClose: closeApp,
  })
}
```

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

<a id="http-app"></a>

### Implement contracts and serve HTTP: `serv`

Implement a shared contract and compose a Fetch application; release a Node listener using its returned server.close().

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.createApp(options)` | 组装 HTTP 应用 | 必填 `contract`、`procedures`。HTTP、IAM、中间件、传输加密和语音可按需配置，见[默认值](../configuration/serv.md) | `fetch`; `request`; `ServHttpApp` | `serv.createApp({ contract, procedures })` |
| `serv.listen(app, options?)` | 启动 Node 监听 | 必填 `app`。默认 `host: '127.0.0.1'`、`port: 3000`。可传 `onListening`、`onClose` | `ServNodeServer`; `server`; `address`; `close()` | `serv.listen(app, { port: 3001 })` |
| `serv.toFetch(app)` | 供支持 Fetch 的环境使用 | 由 `createApp()` 返回的应用 | `(request: Request) => Promise<Response>` | `const fetch = serv.toFetch(app)` |
| `serv.implement(contract)` | 实现契约中的路由 | 必填带类型的路由契约 | `ServImplementer` | `serv.implement(contract)` |

#### Scenario: Implement contracts and serve HTTP

The minimal status contract and handler produce an HTTP JSON success. toFetch returns a function without opening a port; listen opens the Node listener. Both modes and cleanup are described below.

Serv assembles an application; only listen starts a Node listener. Middleware, procedures and adapters have different error boundaries.

Close the Node listener before releasing borrowed database or cache services. Keep request metadata separate from an authenticated session.

<a id="host-options"></a>

#### Application factory arguments and dependencies

This integration guide was moved from the configuration handbook because it describes code arguments. The complete walkthrough is currently available in [Chinese](serv.md#host-options); this subsection is partially translated.

<a id="audio-options"></a>

[Detailed parameters and workflows](serv.md#http-app)

<a id="authentication"></a>

### Resolve identity and guard routes: `serv`

Parsing headers only extracts unverified credentials. Establish session after verification, then check permissions and roles.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.parseRequestContext(input)` | 读取追踪编号、语言与访问令牌 | `request` 必填，`platform` 可选 | `ServContext` | `serv.parseRequestContext({ request })` |
| `serv.buildAuthContextFactory(verifyToken)` | 构造验证访问令牌的上下文工厂 | 回调接收访问令牌，返回 `Promise<HaiResult<ServSession>>` | `CreateServContext`; `session` | `serv.buildAuthContextFactory(token => iam.auth.verifyToken(token))` |
| `serv.WILDCARD_PERMISSION` | 在可信策略中表示所有权限 | 只读常量 | `string` | `const allPermissions = [serv.WILDCARD_PERMISSION]` |
| `serv.WILDCARD_ROLE` | 在可信策略中表示所有角色 | 只读常量 | `string` | `const allRoles = [serv.WILDCARD_ROLE]` |

#### Scenario: Resolve identity and guard routes

Inputs are a real Request and trusted verifyToken. Output is ServContext; invalid credentials do not create authenticated sessions. Wildcard constants belong in trusted policies only.

#### Audio authorization and budgets

This integration guide was moved from the configuration handbook because it describes code arguments. The complete walkthrough is currently available in [Chinese](serv.md#audio-options); this subsection is partially translated.

[Detailed parameters and workflows](serv.md#authentication)

<a id="policies"></a>

### Control access, CORS and assets: `serv`

Choose origins and cookie rules for the deployment; evaluate middleware on every request and authorize static objects too.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.cors(config?)` | 处理跨域预检和响应头 | 默认来源 `'*'`，`credentials: false`、`maxAge: 86400` 秒。可指定方法、允许和暴露的头 | `ServMiddleware` | `serv.cors({ origin: 'https://app.example.com', credentials: true })` |
| `serv.createRuntimeSecurityPolicy(input)` | 根据环境确定跨域、Cookie 和接口文档策略 | `environment` 省略时按非生产处理，来源默认 `'*'`。生产须提供明确的 Web 来源，可加 `nativeOrigins` | `allowOrigin`; `secureRefreshCookie`; `exposeApiDocs` | `serv.createRuntimeSecurityPolicy({ environment: 'production', corsOrigin: 'https://app.example.com' })` |
| `serv.storageAssets(config)` | 用 Storage 提供授权后的只读资源 | 传入读取函数、键规则和 MIME 检查，按需配置缓存 | `ServMiddleware` | `serv.storageAssets(assetOptions)` |

#### Scenario: Control access, CORS and assets

```ts
const policy = serv.createRuntimeSecurityPolicy({ environment: 'production', corsOrigin: 'https://app.example.com' })
// policy.allowOrigin restricts requests to the explicit origin; secureRefreshCookie is enabled
const cors = serv.cors({ origin: 'https://app.example.com', credentials: true }) // ServMiddleware
```

An explicit production origin returns policy and middleware. Creation itself grants no permissions; mount middleware and inspect actual OPTIONS/GET responses. Full storage reader and MIME options follow.

[Detailed parameters and workflows](serv.md#policies)

<a id="validation-locales"></a>

### Validate input and describe APIs: `serv`

Resolve the request locale before validating input, and generate OpenAPI from the same contract.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.generateSpec(contract, options?)` | 生成 OpenAPI 描述 | 契约必填，标题默认 `hai-framework API`，版本默认 `0.1.0`；描述和前缀可省略 | `Promise<OpenAPI.Document>` | `await serv.generateSpec(contract, { title: 'Orders', version: '1.0.0' })` |
| `serv.validateInputOrFail(schema, input, locale?)` | 校验业务输入并生成字段错误 | Zod Schema 和待校验值必填，语言默认 `zh-CN`，可传当前请求语言 | `HaiResult<z.infer<Schema>>` | `serv.validateInputOrFail(InputSchema, input, context.locale)` |
| `serv.resolveRequestLocale(headers)` | 根据 HTTP 请求头选择语言 | 传入 `Headers` 或头字段对象。先读 `x-hai-locale`，再读 `Accept-Language`，默认 `zh-CN` | 规范化的语言标识 | `serv.resolveRequestLocale(request.headers)` |
| `serv.m(key, options?)` | 读取本地化提示 | 消息键必填，可传 `locale` 和插值参数 | `string` | `serv.m('serv_errorForbidden', { locale: 'zh-CN' })` |

#### Scenario: Validate input and describe APIs

```ts
import { z } from 'zod'
const locale = serv.resolveRequestLocale(new Headers({ 'x-hai-locale': 'en-US' })) // 'en-US'
const checked = serv.validateInputOrFail(z.object({ title: z.string().min(1) }), { title: 'Order' }, locale)
if (!checked.success)
  throw new Error(checked.error.message)
checked.data // { title: 'Order' }
const denied = serv.m('serv_errorForbidden', { locale }) // localized safe text
// With the contract from quick start:
const spec = await serv.generateSpec(contract, { title: 'Orders', version: '1.0.0' }) // OpenAPI document
```

The inputs are an English header and title=Order. Outputs are normalized locale and validated data. Spec conversion rejects on failure; validation uses failed HaiResult instead.

[Detailed parameters and workflows](serv.md#validation-locales)

<a id="integrations"></a>

### Integrate encryption, audio and feedback: `serv.createApp`

These integrations use createApp parameters and application-owned services rather than another global lifecycle.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `serv.createApp` | Mount transport, audio and business routes | `contract, procedures; transport?, audio?, middlewares?` | `ServApp` | `serv.createApp({ contract, procedures, transport })` |

#### Scenario: Integrate encryption, audio and feedback

This follows an ordinary API request with transport enabled. Transport proves message origin and integrity; context and guards still verify IAM identity and business permissions.

![Serv: from contract to business response](../images/function-serv-request.en.svg)

Serv restores the business body before contract validation and procedures. Guard failure skips the handler. Ordinary access denials remain inside the encrypted boundary. Handshake/preflight have their own access checks, and excluded paths or static resources follow their configured routes.

This section uses createApp. The workflows supply a transport manager, audio tickets and authorization, and feedback context, then explain HTTP/WS outcomes, capacity failures and cleanup.

[Detailed parameters and workflows](serv.md#integrations)
