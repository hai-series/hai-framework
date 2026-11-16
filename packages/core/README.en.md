# @h-ai/core

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md)

`@h-ai/core` is the shared foundation of Hai Framework. It gives applications and framework modules consistent configuration, errors, logging, and internationalization. Utilities work directly; call `core.init()` when a Node application needs file configuration.

## Quick Start

```bash
pnpm add @h-ai/core
```

Import `core` from `@h-ai/core` to log events, read messages, or use the utilities right away. The same entry point exports `ok`, `err`, types, schemas, and error constants. Install Zod with `pnpm add zod` for the custom configuration and form validation examples.

### Initialization: `core.init`

Use `core.init()` to load YAML and configure logging at Node startup, or to set up logging on a web page. See [Application startup and shutdown](../../docs/usage/function/core.md#应用启动与关闭) for starting a database or cache.

#### Node.js

Create `config/_core.yml`:

```yaml
name: orders
version: 0.1.0
env: development
defaultLocale: en-US
logging:
  level: info
  format: pretty
```

```ts
import type { CoreConfig } from '@h-ai/core'
import { core } from '@h-ai/core'

// Read the config directory. A valid _core.yml is cached under core.
core.init({ configDir: './config' })
const settings = core.config.getOrThrow<CoreConfig>('core')

// Set the default language and log startup.
core.i18n.setGlobalLocale(settings.defaultLocale)
core.logger.info('Application ready', { app: settings.name }) // app: 'orders'
```

`core.init()` reads the directory synchronously. If a file fails to load or validate, Core logs its path and error code and continues with the remaining files. The example uses `getOrThrow()` to stop startup if the required `core` entry is missing. Directory scanning and logger setup can throw.

#### Browser

```ts
import { core } from '@h-ai/core'

// Set the log threshold and default language on page startup.
core.init({
  logging: { level: 'warn' }
})
core.i18n.setGlobalLocale('en-US')

// Log a request ID so related events can be correlated.
const requestId = core.id.request()
core.logger.warn('Request needs attention', { requestId })
```

The host supplies public configuration fields; never send complete server settings or secrets. Browser `core.config.get()` / `has()` / `keys()` return `undefined` / `false` / `[]`. `loadEnvFiles()`, `load()`, `validate()`, and `reload()` return `SERVICE_UNAVAILABLE`; `getOrThrow()` throws. `watch()` immediately calls back with the same unavailable error and returns a no-op unsubscribe function.

## Configuration Reference

Generated projects use `config/_core.yml`, with `core.init({ configDir })` as the application configuration entry point.

See the [configuration reference](../../docs/usage/configuration/core.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/core.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `init` / `config` / `module` — Load configuration, set up logging and orchestrate dependencies
- `logger` / `context` / `sanitize` — Correlate logs and sanitize diagnostic data
- `error` / `i18n` / `zodValidation` / `access` — Handle results and errors, localize validation and evaluate request policies
- `id` / `typeUtils` / `object` / `string` / `array` / `async` / `time` — Generate IDs and work with common data and asynchronous operations

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/core.md) in Chinese for ownership of application configuration, locale, logging and request context.

## Development and Testing

Run from the repository root (use `pnpm.cmd` in PowerShell):

```bash
pnpm --filter @h-ai/core typecheck
pnpm --filter @h-ai/core lint
pnpm --filter @h-ai/core build
pnpm --filter @h-ai/core test
```

See the [module JSDoc conventions](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) for declaration and example checks.

## License

Apache-2.0
