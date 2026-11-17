# @h-ai/iam

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/audit](../audit/README.en.md) · [@h-ai/cache](../cache/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md) · [@h-ai/reldb](../reldb/README.en.md) · [@h-ai/reach](../reach/README.en.md)

Identity and access management through a unified `iam` object for authentication, sessions, authorization, and user management.

## Quick Start

Install with pnpm: `pnpm add @h-ai/iam @h-ai/reldb @h-ai/cache`.

[Open the quick-start guide](../../docs/usage/function/iam.en.md#quick-start).

## Configuration Reference

Generated projects define allowed sign-in methods, password rules, and session lifetimes in `config/_iam.yml`. At startup, the application reads the file and passes the settings object to `iam.init(config)`.

See the [configuration reference](../../docs/usage/configuration/iam.en.md) for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/iam.en.md#api-reference) for entry points, inputs, results and examples.

## Data Structures

See the [data reference](../../docs/usage/data/iam.en.md) for accounts, roles, permissions, sessions and one-time credentials.

## Development and Testing

Public examples import from `@h-ai/iam` and distinguish defaultable `IamConfigInput` from parsed `IamConfig`. Initialize server dependencies, check `HaiResult.success`, update sessions with their observed `version`, and reuse persistent notification idempotency keys. Strategy/repository examples marked as internal context do not define application deep imports. The checker verifies types only; Redis/database, LDAP and delivery behavior still require their integration tests. See the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

```bash
pnpm --filter @h-ai/iam typecheck
pnpm --filter @h-ai/iam lint
pnpm --filter @h-ai/iam build
pnpm --filter @h-ai/iam test
node scripts/check-module-jsdoc.mjs --package iam
```

## License

Apache-2.0
