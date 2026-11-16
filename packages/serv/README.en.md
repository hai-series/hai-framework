# @h-ai/serv

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/ai](../ai/README.en.md) · [@h-ai/api-contract](../api-contract/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md) · [@h-ai/iam](../iam/README.en.md) · [@h-ai/storage](../storage/README.en.md)

hai-framework's API service runtime: a stable public HTTP App abstraction that mounts `@h-ai/api-contract` contracts as cross-platform HTTP APIs. Hono is an internal implementation detail.

Use runtime operations through `serv.xx`. Import `ServFunctions` from the root entry when annotating or re-exporting the namespace. Context factories and generic `implement` signatures support downstream declaration emission through public entries; no internal build paths or standalone helpers are needed.

## Quick Start

At application startup, initialize `core`, `iam`, `storage`, and `ai`, and load and validate the `serv` configuration. Then call `startApi(closeApp)` with an async callback that releases business resources in reverse initialization order. The function returns the Node listener handle. With that callback supplied, `serv.listen` stops the listener before calling it when the process receives a shutdown signal. For a health-only app, use an empty contract and empty procedures.

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
  // Build the HTTP contract from the three module contracts.
  const contract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

  // Bind the initialized modules to procedures and check ownership of every storage key.
  const procedures = {
    iam: createIamProcedures({ iam }),
    storage: createStorageProcedures({
      storage,
      authorize: ({ context, keys }) => keys.every(key =>
        key.startsWith(`users/${encodeURIComponent(context.session.userId)}/`)),
    }),
    ai: createAiProcedures({ ai }),
  }

  // Build the app from the contract, procedures, and HTTP settings.
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

  // Read the loaded listener settings and return a handle with the address and close().
  const { server } = core.config.getOrThrow<ServConfig>('serv')
  return serv.listen(app, {
    host: server.host,
    port: server.port,
    onListening: info => core.logger.info('API service listening', { port: info.port }),
    onClose: closeApp,
  })
}
```

Storage procedures require `authorize({ context, operation, keys })` and deny access if the policy is missing. Derive resource ownership from the authenticated session for downloads, uploads, listing, metadata and deletion. The example only permits keys under `users/<encoded userId>/`; list requests must include that prefix. A batch is executed only after every key is authorized. Grant administrative access explicitly in the application policy.

Batch deletion via `storage.files.deleteMany` returns `{ deletedKeys, failures: [] }` on success. Failures preserve progress in `error.ext.deleteMany` (`failed / unknown / notAttempted`); HTTP 200 alone does not mean completion. See [Storage batch deletion](../../docs/usage/function/storage.md#api-概览).

AI procedures bind `objectId` to the trusted `context.session.userId` when the client omits it. Chat/message writes, history, session lists and memory recall/list all use the authorized owner. Sessions are scoped by `objectId + sessionId`; writes default to session `default`. A different objectId is forbidden unless an explicit `authorizeObject` policy grants access using trusted permissions and tenant ownership, including for administrators.

`chats.createCompletion` (`POST /ai/chats/completions`) returns one non-streaming `HaiResult<AiChatCompletionData>`. Function `tools` retain their complete nested JSON Schema and `strict`, and `tool_choice` supports `auto`, `none`, `required`, or a provided function name. Messages preserve roles, `name`, user images, and tool calls. Tool results require `role: 'tool'` and a nonempty `tool_call_id`; named choices must reference a supplied tool. The procedure does not execute tools: the application authorizes and executes them, then sends the assistant's `tool_calls` with their tool results. The input has no `stream` field; either boolean value is rejected with HTTP 400 before the provider runs. For streaming, define a separate endpoint with a matching stream output using `ai.llm.chatStream()`.

## Configuration Reference

Generated projects use `config/_serv.yml`, with `serv.createApp(options)` as the application configuration entry point.

See the [configuration reference](../../docs/usage/configuration/serv.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/serv.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `createApp` / `listen` / `toFetch` / `cors` / `storageAssets` — Build HTTP apps, adapt runtimes and serve static assets
- `implement` / `validateInputOrFail` / `generateSpec` / `m` — Implement typed endpoints, validate inputs and generate OpenAPI
- `parseRequestContext` / `buildAuthContextFactory` / `resolveRequestLocale` / `createRuntimeSecurityPolicy` — Resolve request metadata, authentication, locale and access policy
- `@h-ai/serv/features/*` — Mount IAM, storage, AI and feedback endpoints

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/serv.md) in Chinese for HTTP context, sessions, static assets and persistence ownership.

## Development and Testing

```bash
pnpm --filter @h-ai/serv test
pnpm --filter @h-ai/serv typecheck
pnpm --filter @h-ai/serv lint
```

Declaration JSDoc examples import actual `@h-ai/serv` entries or published feature subpaths. Internal Hono, guard, router and transport examples are marked as internal module context and are not root APIs. Examples distinguish startup configuration exceptions, domain HaiResult, HTTP middleware statuses, and listener shutdown returning Promise<void>; default AI completion still returns non-streaming JSON only. Maintainers can run `node scripts/check-module-jsdoc.mjs --package serv` against actual declarations and internal lexical bindings. Compilation does not replace real HTTP, authorization or distributed replay-protection validation.

## License

Apache-2.0
