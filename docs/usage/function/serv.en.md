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

| API | Input and result | Example |
| --- | --- | --- |
| `serv.implement(contract)`, `createApp(options)` | Bind procedures to the contract and build the HTTP application. | `serv.implement(contract)` |
| `serv.listen(app, options?)`, `toFetch(app)` | Start the Node listener or adapt the application to a Fetch handler. | `serv.toFetch(app)` |
| `serv.parseRequestContext(input)`, `buildAuthContextFactory(verifyToken)` | Read trusted request metadata and create an authentication context with the given verifier. | `serv.buildAuthContextFactory(verifyToken)` |
| `serv.cors(config?)`, `createRuntimeSecurityPolicy(input)`, `storageAssets(config)` | Build origin handling, request rules and asset delivery behavior. | `serv.cors()` |
| `serv.generateSpec(contract, options?)` | Produce the OpenAPI specification from the contract. | `serv.generateSpec(contract)` |
| `serv.validateInputOrFail(schema, input, locale?)`, `resolveRequestLocale(headers)`, `m(key, options?)` | Resolve request language, validate input and format a localized message. | `serv.resolveRequestLocale(request.headers)` |

Additional options and workflow examples are available in the [Chinese reference](serv.md).
