# @h-ai/api-contract

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

Public HTTP API contracts for hai-framework, with oRPC contract + Zod as the single source of truth.

## Quick Start

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
    .route({
      method: 'POST',
      path: '/app/ping',
      operationId: 'app.ping',
      tags: ['app']
    })
    .output(apiContract.haiResultSchema(z.object({
      pong: z.boolean()
    }))),
}
```

## Configuration Reference

Use `apiContract.create()` to compose the domain contracts your app exposes.

See the [configuration reference](../../docs/usage/configuration/api-contract.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/api-contract.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `create` / `route` / `pathOf` — Define contracts, routes and paths
- `haiResultSchema` / `voidResultSchema` / `paginatedSchema` — Validate result envelopes and paginated data
- `iam` / `storage` / `ai` / `payment` / `feedback` — Reuse domain HTTP contracts

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/api-contract.md) in Chinese for public HTTP payloads and persistence ownership.

## Development and Testing

```bash
pnpm --filter @h-ai/api-contract test
pnpm --filter @h-ai/api-contract typecheck
```

Schemas, inferred types and composition helpers include typechecked examples; see the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证). Schema samples use validated local data and do not prove provider execution.

## License

Apache-2.0
