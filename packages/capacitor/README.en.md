# @h-ai/capacitor

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/api-client](../api-client/README.en.md) · [@h-ai/core](../core/README.en.md)

A Capacitor native bridge for hai Framework mobile apps, with a unified API for secure token storage, device information, push notifications, camera, and status bar access.

## Quick Start

```ts
import { capacitor } from '@h-ai/capacitor'

const initialized = await capacitor.init()
if (!initialized.success)
  throw new Error(initialized.error.message)
const failures: unknown[] = []
try {
  const saved = await capacitor.preferences.set('theme', 'dark')
  if (!saved.success)
    throw new Error(saved.error.message)
  const theme = await capacitor.preferences.get('theme')
  if (!theme.success)
    throw new Error(theme.error.message)
  // theme.data is 'dark'; an absent key returns null.
}
catch (cause) {
  failures.push(cause)
}
finally {
  const closed = await capacitor.close()
  if (!closed.success)
    failures.push(closed.error)
}
if (failures.length)
  throw new AggregateError(failures, 'Native preference operation failed')
```

## Configuration Reference

Configure native plugins in the Capacitor project and initialize them through `capacitor.init()`.

See the [configuration reference](../../docs/usage/configuration/capacitor.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/capacitor.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `init` / `close` / `isInitialized` / `getPlatform` / `isNative` — Initialize plugins and detect the current platform
- `device` / `camera` / `push` / `statusBar` — Read device info, take photos, register push and manage the status bar
- `preferences` / `createCapacitorTokenStorage` — Store preferences and credentials in their designated stores

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/capacitor.md) in Chinese for native preferences, credentials, photos and push tokens.

## Development and Testing

```bash
pnpm --filter @h-ai/capacitor test
```

> Tests must mock `@capacitor/*` modules because they depend on native plugins.

Public operations, internal resource scopes and types include typechecked examples; see the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证). Typechecking does not prove device permissions or live FCM/APNs delivery.

## License

Apache-2.0
