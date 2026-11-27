# @h-ai/iam

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/audit](../audit/README.en.md) · [@h-ai/cache](../cache/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md) · [@h-ai/reldb](../reldb/README.en.md) · [@h-ai/reach](../reach/README.en.md)

Identity and access management through a unified `iam` object for authentication, sessions, authorization, and user management.

## Quick Start

Install with pnpm: `pnpm add @h-ai/iam @h-ai/reldb @h-ai/cache @h-ai/core`.

[Open the quick-start guide](../../docs/usage/function/iam.en.md#quick-start).

[Dependencies and setup order](../../docs/usage/function/iam.en.md#module-dependencies).

## Configuration Reference

Generated projects define allowed sign-in methods, password rules, and session lifetimes in `config/_iam.yml`. At startup, the application reads the file and passes the settings object to `iam.init(config)`.

See the [configuration reference](../../docs/usage/configuration/iam.en.md) for configuration entry points, defaults, accepted values and when changes take effect.

Initialize the authorization cache revision in shared Redis before the first production start. For a stuck writer registration, verify database transactions and replace the generation during maintenance. [Initialization and recovery](../../docs/usage/data/iam.en.md#iam-read-cache-recovery)

## Features

IAM sends built-in verification codes, password reset notices and initial password setup invitations through Reach during quiet hours. Applications can supply their own send callbacks. [Quiet-hours examples](../../docs/usage/function/reach.en.md#reach-quiet-hours)

Passwords and API keys share the Crypto worker pool for SM3. Stored hashes are still valid. A full queue returns `SECURITY_BUSY` (HTTP 429) without recording a failed sign-in attempt.

[Browse the API list](../../docs/usage/function/iam.en.md#api-reference) for entry points, inputs, results and examples.

Account creation and role assignment commit together. Administrators can specify roles in `iam.user.createUser` and `iam.user.inviteUser`. Invitations are sent after commit. `iam.user.updateUserWithRoles` commits profile changes and role assignments together. One-time ticket keys use digests, and tickets are consumed after checking their purpose.

For an LDAP upgrade, follow [Migrate existing LDAP identity bindings](../../docs/usage/function/iam.en.md#ldap-identity-migration).

- Manage API keys and role permissions through shared HTTP contracts. [Optional HTTP contracts](../../docs/usage/function/iam.en.md#http-contract-extensions)

## Data Structures

RelDB stores accounts, roles, permissions and the lockout version. Shared Redis stores sessions, sign-in failure counts and one-time credentials. [See the data reference](../../docs/usage/data/iam.en.md)

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
