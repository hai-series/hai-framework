# @h-ai/datapipe

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

A data processing pipeline module for text cleaning (`clean`), chunking (`chunk`), and composable pipelines (`pipeline`). Pure functions; no initialization required.

## Quick Start

Install with pnpm: `pnpm add @h-ai/datapipe`.

[Open the quick-start guide](../../docs/usage/function/datapipe.en.md#quick-start).

## Configuration Reference

Pass cleaning options to `datapipe.clean()` and options such as chunk size and overlap to `datapipe.chunk()`. Supply both sets of options when calling `datapipe.pipeline()`.

See the [configuration reference](../../docs/usage/configuration/datapipe.en.md) for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/datapipe.en.md#api-reference) for entry points, inputs, results and examples.

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/datapipe.en.md) for cleaning results, text chunks and application-owned storage.

## Development and Testing

```bash
pnpm --filter @h-ai/datapipe test
```

Source examples distinguish pure functions, synchronous HaiResult and asynchronous pipelines; see the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## License

Apache-2.0
