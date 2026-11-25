# @h-ai/audit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md) · [@h-ai/reldb](../reldb/README.en.md)

Record, query, clean up and aggregate audit events in a Node.js service. Audit uses `@h-ai/reldb` for persistence and supports optional private archives and alerts.

## Quick Start

Install with pnpm: `pnpm add @h-ai/audit @h-ai/reldb`.

[Open the quick-start guide](../../docs/usage/function/audit.en.md#quick-start).

[Dependencies and setup order](../../docs/usage/function/audit.en.md#module-dependencies).

## Configuration Reference

Generated projects define capture, retention, backup and alert settings in `config/_audit.yml`. The application passes those settings to `audit.init(config)` at startup. Use the same retention settings on all instances that share a database and coordinate restarts after changes.

See the [configuration reference](../../docs/usage/configuration/audit.en.md) for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/audit.en.md#api-reference) for entry points, inputs, results and examples.

Use `audit.countByOutcome(filters)` to count successful, failed, and denied events in the filtered list. Use `getStats(7)` for the independent weekly activity trend.

## Data Structures

RelDB stores events and alert claims. Private Storage keeps archives. Database triggers enforce the configured minimum retention period. The database stores event times as Unix milliseconds and the API returns `Date`. See the [data reference](../../docs/usage/data/audit.en.md).

## Development and Testing

```bash
pnpm --filter @h-ai/audit test
```

Source examples initialize RelDB first, check audit results, and check cleanup in reverse dependency order; see the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## License

Apache-2.0
