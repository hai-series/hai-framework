# @h-ai/datapipe

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

A data processing pipeline module for text cleaning (`clean`), chunking (`chunk`), and composable pipelines (`pipeline`). Pure functions; no initialization required.

## Quick Start

```ts
import { datapipe, HaiDatapipeError } from '@h-ai/datapipe'

const rawText = '<p>Hello framework.</p>'
const text = '# Getting started\n\nHello framework.'

// 直接清洗
const cleaned = datapipe.clean(rawText, { removeHtml: true })
if (!cleaned.success)
  throw new Error(cleaned.error.message)

// 按 Markdown 标题分块
const chunks = datapipe.chunk(text, { mode: 'markdown', maxSize: 2000 })
if (!chunks.success)
  throw new Error(chunks.error.message)

// 管线模式（链式组合多步操作）
const result = await datapipe.pipeline()
  .clean({ removeHtml: true, removeUrls: true })
  .transform(text => text.toLowerCase())
  .chunk({ mode: 'paragraph', maxSize: 1000, overlap: 100 })
  .chunkTransform(chunks => chunks.filter(c => c.content.length > 50))
  .run(rawText)
if (!result.success)
  throw new Error(result.error.message)
```

## Configuration Reference

Pass cleaning options to `datapipe.clean()` and options such as chunk size and overlap to `datapipe.chunk()`. Supply both sets of options when calling `datapipe.pipeline()`.

See the [configuration reference](../../docs/usage/configuration/datapipe.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/datapipe.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `datapipe.clean` — Normalize and filter text
- `datapipe.chunk` / `datapipe.pipeline` — Split text or run cleaning and splitting in sequence

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/datapipe.md) in Chinese for cleaning results, text chunks and application-owned storage.

## Development and Testing

```bash
pnpm --filter @h-ai/datapipe test
```

Source examples distinguish pure functions, synchronous HaiResult and asynchronous pipelines; see the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## License

Apache-2.0
