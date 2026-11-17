# @h-ai/serv API reference

<!-- translation: partial -->

[Chinese source](serv.md) · [Configuration](../configuration/serv.en.md) · [Data structures](../data/serv.en.md)

<a id="quick-start"></a>

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

## API list

Serv assembles an application; only listen starts a Node listener. Middleware, procedures and adapters have different error boundaries.

| API | Purpose | Inputs and defaults | Output | Example |
| --- | --- | --- | --- | --- |
| `serv.createApp` | Mount the contract and its procedures onto an HTTP application | `options` | `ServHttpApp` | `serv.createApp({ contract, procedures })` |
| `serv.listen` | Start Node listening. Defaults: 127.0.0.1:3000 | `app, options?` | `ServNodeServer` | `serv.listen(app, { port: 3001 })` |
| `serv.toFetch` | Adapt the app to a Fetch request handler | `app` | `ServFetchHandler` | `serv.toFetch(app)` |
| `serv.implement` | Build typed procedure implementations | `contract` | `ServImplementer` | `serv.implement(contract)` |
| `serv.parseRequestContext` | Read request metadata without authenticating a session | `input` | `ServContext` | `serv.parseRequestContext({ request, remoteAddress })` |
| `serv.buildAuthContextFactory` | Build a context factory using the supplied session verifier | `verifyToken` | `CreateServContext` | `serv.buildAuthContextFactory(verifyToken)` |
| `serv.resolveRequestLocale` | Choose the locale from request headers | `headers` | `string` | `serv.resolveRequestLocale(request.headers)` |
| `serv.cors` | Configure cross-origin request handling | `config?` | `ServMiddleware` | `serv.cors({ origin: 'https://app.example.com' })` |
| `serv.storageAssets` | Serve permitted public Storage objects | `config` | `ServMiddleware` | `serv.storageAssets(storageConfig)` |
| `serv.createRuntimeSecurityPolicy` | Resolve policy for the actual deployment mode | `input` | `ServRuntimeSecurityPolicy` | `serv.createRuntimeSecurityPolicy(runtimeInput)` |
| `serv.generateSpec` | Generate the OpenAPI specification | `contract, options?` | `OpenAPI.Document` | `await serv.generateSpec(contract)` |
| `serv.validateInputOrFail` | Validate inside a procedure and return a localized failure | `schema, input, locale?` | `HaiResult<T>` | `serv.validateInputOrFail(schema, input)` |
| `serv.m` | Read a message for the explicit or current locale | `key, options?` | `string` | `serv.m('serv_validationFailed')` |

Close the Node listener before releasing borrowed database or cache services. Keep request metadata separate from an authenticated session.

Still untranslated: the transport, streaming/audio and middleware integration examples. Read the [Chinese source section](serv.md#detailed-workflow).

<a id="host-options"></a>

## Factory arguments and runtime dependencies

This integration guide was moved from the configuration handbook because it describes code arguments. The complete walkthrough is currently available in [Chinese](serv.md#host-options); this subsection is partially translated.


<a id="audio-options"></a>

## Audio authorization and budgets

This integration guide was moved from the configuration handbook because it describes code arguments. The complete walkthrough is currently available in [Chinese](serv.md#audio-options); this subsection is partially translated.
