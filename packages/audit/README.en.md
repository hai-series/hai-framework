# @h-ai/audit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md) · [@h-ai/reldb](../reldb/README.en.md)

A unified audit logging module. The `audit` object records, queries, cleans up, and aggregates audit logs, with persistence provided by `@h-ai/reldb`.

## Quick Start

Install with pnpm: `pnpm add @h-ai/audit @h-ai/reldb`.

[Open the quick-start guide](../../docs/usage/function/audit.en.md#quick-start).

## Configuration Reference

Generated projects define capture, retention, backup, and alert settings in `config/_audit.yml`. At startup, the application reads the file and passes the settings object to `audit.init(config)`.

See the [configuration reference](../../docs/usage/configuration/audit.en.md) for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/audit.en.md#api-reference) for entry points, inputs, results and examples.

Use `audit.countByOutcome(filters)` to count successful, failed, and denied events in the filtered list. Use `getStats(7)` for the independent weekly activity trend.

## Data Structures

See the [data reference](../../docs/usage/data/audit.en.md) for audit rows, field mappings, archives and alert deduplication.

## Development and Testing

```bash
pnpm --filter @h-ai/audit test
```

Source examples initialize RelDB first, check audit results, and check cleanup in reverse dependency order; see the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## License

Apache-2.0
