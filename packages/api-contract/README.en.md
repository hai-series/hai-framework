# @h-ai/api-contract

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

## Introduction

Public HTTP API contracts for hai-framework, with oRPC contract + Zod as the single source of truth.

## Core features

- `apiContract.iam`, `apiContract.storage`, `apiContract.ai`, `apiContract.payment`: domain contracts.
- `apiContract.create()`: compose enabled domain contracts for an application.
- `apiContract.route()`: define custom HTTP route metadata for reuse in application contracts.
- `apiContract.pathOf()`: read the authoritative business path from a contract procedure for middleware/client reuse.
- `apiContract.haiResultSchema()` / `apiContract.voidResultSchema` / `apiContract.paginatedSchema()`: shared DTO schema factories.
- Shared DTO schemas: every HTTP output is wrapped in `HaiResult<T>`.
- IAM token DTOs support httpOnly cookies: `refreshToken` may be absent from the response body and managed by the server through `Set-Cookie`.
- IAM `auth.currentUser` returns the user profile and the current server session's `roles` / `permissions`; clients need not persist a permission snapshot to restore a session.

## Getting started

### Quick start

```ts
import { apiContract } from '@h-ai/api-contract'

export const contract = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  ai: false,
})
```

Custom application contracts also define routes through this package, without depending on `@h-ai/serv`:

```ts
import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'

export const appContract = {
  ping: apiContract
    .route({ method: 'POST', path: '/app/ping', operationId: 'app.ping', tags: ['app'] })
    .output(apiContract.haiResultSchema(z.object({ pong: z.boolean() }))),
}
```

### API contracts

```ts
import { apiContract } from '@h-ai/api-contract'

const myContract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

myContract.iam.auth.login
myContract.storage.presignedUrls.createUpload
myContract.ai.chats.createCompletion
```

Clients call nested methods directly through `@h-ai/api-client`:

```ts
import { apiClient } from '@h-ai/api-client'

await apiClient.init({ baseUrl: 'https://api.example.com/api/v1' })
const login = await apiClient.iam.auth.login({ identifier: 'alice', password: 'secret' })
await apiClient.close()
```

Servers mount contracts through `@h-ai/serv`:

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

### API overview

- `apiContract.create(options)`: omit domains set to `false` / `undefined` and compose the application contract.
- `apiContract.route(routeConfig)`: define method/path/operationId/tags and other route metadata for a custom endpoint.
- `apiContract.pathOf(procedure)`: read the business path declared in `*-contract.ts`, without maintaining separate route constants.
- `apiContract.haiResultSchema(dataSchema)` / `apiContract.voidResultSchema` / `apiContract.paginatedSchema(itemSchema)`: shared DTO schema factories.
- `Iam*Schema` / `Storage*Schema` / `Ai*Schema` / `Payment*Schema`: inputs and data structures reused across APIs and layers.

Batch deletion via `storage.files.deleteMany` returns `{ deletedKeys, failures: [] }` on success. Failures preserve progress in `error.ext.deleteMany` (`failed / unknown / notAttempted`); HTTP 200 alone does not mean completion. See [Storage batch deletion](../storage/README.en.md#api-overview).


Write each business path directly in its `*-contract.ts` file. Inline output schemas used only once in `.output(...)`; schemas reused within the same contract file may be private constants, but must not be exported from schemas.

### Configuration

This package has no runtime configuration and does not read environment variables.

### Configuration driven authentication

Agreements support configuration-loaded userAgreementMarkdown/privacyPolicyMarkdown and URLs. Markdown takes priority for the same agreement and is safely rendered in a modal.

IAM adds GET /auth/config and POST /auth/login/ldap, /auth/password-reset/request and /auth/password-reset/confirm. Public config is a schema whitelist; IamLdapLoginInput and IamPublicConfig are exported. Password lengths follow the configured IAM policy.

[完整 IAM 配置 / IAM configuration](../iam/README.en.md)

### Error handling

Contracts describe input and output structures only. Procedures express business errors with `HaiResult<T>`, so clients need not catch business exceptions.

## Development and testing

```bash
pnpm --filter @h-ai/api-contract test
pnpm --filter @h-ai/api-contract typecheck
```

## License

Apache-2.0
