# @h-ai/core

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md)

`@h-ai/core` is the shared foundation of Hai Framework. It gives applications and framework modules consistent configuration, errors, logging, and internationalization. Utilities work directly; call `core.init()` when a Node application needs file configuration.

## Quick Start

Install with pnpm: `pnpm add @h-ai/core`.

[Open the quick-start guide](../../docs/usage/function/core.en.md#quick-start).

## Configuration Reference

Call `core.init({ configDir: './config' })` at Node startup to read application metadata and logging settings from `config/_core.yml`. [Serv](../../docs/usage/configuration/serv.en.md) or [Kit](../../docs/usage/configuration/kit.en.md) reads its request policy when it creates the HTTP service.

See the [configuration reference](../../docs/usage/configuration/core.en.md) for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Configuration API](../../docs/usage/function/core.en.md#config-api) · [All Core APIs](../../docs/usage/function/core.en.md#api-reference)

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/core.en.md) for ownership of application configuration, locale, logging and request context.

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
