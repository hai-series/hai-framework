# @h-ai/vecdb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

A vector database module with a unified `vecdb` object for LanceDB, pgvector, Qdrant, and Chroma.

## Quick Start

[Open the quick-start guide](../../docs/usage/function/vecdb.en.md#quick-start).

## Configuration Reference

Generated projects define the vector database type and its connection settings in `config/_vecdb.yml`. At startup, the application reads the file and passes the settings object to `vecdb.init(config)`.

See the [configuration reference](../../docs/usage/configuration/vecdb.en.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/vecdb.en.md#api-reference) for entry points, inputs, results and examples (Chinese).

## Data Structures

See the [data reference](../../docs/usage/data/vecdb.en.md) in Chinese for collections, vectors, metadata, filters and provider storage layouts.

## Development and Testing

```bash
pnpm --filter @h-ai/vecdb test
```

> pgvector / Qdrant tests require Docker.

Source JSDoc follows the [shared conventions](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证): public examples use published entry points, and internal examples are checked in their module scope. After building, run `pnpm check:jsdoc --package vecdb`; compiling examples does not replace backend behavior tests.

## License

Apache-2.0
