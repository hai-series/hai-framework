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
- `@h-ai/audit` — Optional. IAM records security events automatically after the application calls `audit.init()`. If an audit write fails, check the error log and roll back any affected transaction managed by the application.

- `@h-ai/reach` — Optional. To use standard email or SMS templates, install and initialize Reach and connect it to IAM as shown in the [notification example](../../docs/usage/function/iam.md#使用可选-reach-自动发送) (Chinese). You can also provide your own delivery function.
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

LDAP is off by default. `iam.publicConfig` lists a one-time code sign-in method as available only when you configure `otp` and supply a delivery function for that method. To offer a password reset option on the sign-in page, also provide a working reset notification function.

`iam.config` returns a **redacted configuration snapshot**. Sensitive LDAP `url` / `bindPassword` and similar fields are hidden automatically. Use it to inspect state, not as the original configuration source.

## Configuration Reference

Generated projects define allowed sign-in methods, password rules, and session lifetimes in `config/_iam.yml`. At startup, the application reads the file and passes the settings object to `iam.init(config)`.

See the [configuration reference](../../docs/usage/configuration/iam.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/iam.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `iam.init` / `iam.close` / `iam.config` / `iam.isInitialized` / `iam.publicConfig` / `iam.getPublicConfig` / `iam.isRegisterEnabled` — Start or stop the identity service. Read public settings to decide which sign-in methods and registration links to show
- `iam.auth` / `iam.user` / `iam.session` — Authenticate users and manage accounts and sessions
- `iam.authz` / `iam.apiKey` / `iam.ticket` — Check roles and permissions, manage API keys, and issue and redeem one-time tickets

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
