# @h-ai/iam

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/audit](../audit/README.en.md) · [@h-ai/cache](../cache/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md) · [@h-ai/reldb](../reldb/README.en.md) · [@h-ai/reach](../reach/README.en.md)

Identity and access management through a unified `iam` object for authentication, sessions, authorization, and user management.

## Quick Start

### Installation

```bash
pnpm add @h-ai/iam
```

### Dependencies

- `@h-ai/reldb`: persistence for users/roles/permissions; **initialize before iam.init()**.
- `@h-ai/cache`: sessions/OTP/one-time tickets; **initialize before iam.init()**.
- `@h-ai/crypto`: password hashing, used internally and initialized automatically.
- `@h-ai/audit`: automatic IAM security events after host initialization. An unused collector is not called; enabled audit failures remain observable and caller-owned transactions must roll back.

- `@h-ai/reach`: **optional**, installed, initialized and injected by the application for standard notifications; custom callbacks do not require Reach.
- `ldapts`: **optional**, loaded only when LDAP is explicitly enabled without an injected `ldapClientFactory`.

```ts
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'

// 基础密码认证不需要安装 Reach 或 ldapts。
async function example() {
  try {
    const db = await reldb.init({ type: 'sqlite', database: './data.db' })
    if (!db.success)
      return db
    const cached = await cache.init({ type: 'memory' })
    if (!cached.success)
      return cached
    const initialized = await iam.init({})
    if (!initialized.success)
      return initialized
    const registered = await iam.user.register({ username: 'demo', password: 'Password123' })
    if (!registered.success)
      return registered
    const login = await iam.auth.login({ identifier: 'demo', password: 'Password123' })
    if (!login.success)
      return login
    return await iam.auth.verifyToken(login.data.tokens.accessToken)
  }
  finally {
    // 应用关闭时按依赖的反向顺序释放。
    await iam.close()
    await cache.close()
    await reldb.close()
  }
}

const result = await example()
if (!result.success)
  core.logger.error('Authentication example failed', { code: result.error.code })
```

LDAP is disabled by default. Public OTP methods require `otp` settings and send callbacks; password reset requires a notification callback.

`iam.config` returns a **redacted configuration snapshot**. Sensitive LDAP `url` / `bindPassword` and similar fields are hidden automatically. Use it to inspect state, not as the original configuration source.

## Configuration Reference

Generated projects use `config/_iam.yml`, with `iam.init(config)` as the application configuration entry point.

See the [configuration reference](../../docs/usage/configuration/iam.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/iam.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `init` / `close` / `config` / `isInitialized` / `publicConfig` / `getPublicConfig` / `isRegisterEnabled` — Initialize identity services and expose safe configuration and registration details
- `auth` / `user` / `session` — Authenticate users and manage accounts and sessions
- `authz` / `apiKey` / `ticket` — Evaluate permissions and manage API keys and one-time tickets

## Data Structures

See the [data reference](../../docs/usage/data/iam.md) in Chinese for accounts, roles, permissions, sessions and one-time credentials.

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
