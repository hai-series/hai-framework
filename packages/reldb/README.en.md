# @h-ai/reldb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

A relational database module with a unified `reldb` object for SQLite, PostgreSQL, and MySQL.

## Quick Start

[Open the quick-start guide](../../docs/usage/function/reldb.en.md#quick-start).

## Configuration Reference

Generated projects define the database type, address, and connection options in `config/_db.yml`. At startup, the application reads the file and passes the settings object to `reldb.init(config)`.

See the [configuration reference](../../docs/usage/configuration/reldb.en.md) for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/reldb.en.md#api-reference) for entry points, inputs, results and examples.

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/reldb.en.md) for connection pools, application tables, DDL conventions and transaction state.

## Development and Testing

```bash
pnpm --filter @h-ai/reldb test
```

> MySQL/PostgreSQL tests require Docker.

Source JSDoc follows the [shared conventions](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证): public examples use published entry points, and internal examples are checked in their module scope. After building, run `pnpm check:jsdoc --package reldb`; compiling examples does not replace backend behavior tests.

## License

Apache-2.0
