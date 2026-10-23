# @h-ai/datapipe

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

## Introduction

A data processing pipeline module for text cleaning (`clean`), chunking (`chunk`), and composable pipelines (`pipeline`). Pure functions; no initialization required.

## Core features

| Feature              | Description                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| Text cleaning        | Remove HTML tags, URLs, and emails; normalize whitespace; apply custom regex replacements             |
| Text chunking        | Sentences, paragraphs, Markdown headings, page breaks, word counts, characters, and custom separators |
| Pipeline composition | Chain cleaning → transformation → chunking → postprocessing in a single execution                     |

> Security: `customReplacements` and `separator` in `mode: 'custom'` are used as regular expressions. Only provide trusted, reviewed patterns; do not interpolate user input directly into regexes, to avoid ReDoS or unintended broad replacements.

## Getting started

### Quick start

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

### Chunking modes

| Mode      | Description                           |
| --------- | ------------------------------------- |
| sentence  | Split by sentence                     |
| paragraph | Split by paragraph                    |
| markdown  | Split by Markdown heading             |
| page      | Split by page break                   |
| word      | Split by word count                   |
| character | Split by character count              |
| custom    | Custom separator (requires separator) |

Chunk `maxSize` defaults to 1500; `overlap` defaults to 0 and must satisfy `0 <= overlap < maxSize`. Both use non-whitespace words in word mode (continuous Chinese can be one long word), and Unicode code points in every other mode, rather than UTF-16 length, bytes or model tokens. The limit includes overlap and separators. Natural sentence/paragraph/page/custom boundaries only guide split positions; oversized segments use a `maxSize-overlap` sliding window. Original whitespace, punctuation, page markers and custom separators are preserved, so removing overlap reconstructs the source. Chunks are not trimmed or joined with added newlines. Markdown overlaps only within each section, uses the same hard limit and ignores headings inside fenced code. Only `markdownKeepTitle=false` explicitly removes heading lines. Empty or entirely whitespace input returns no chunks. Custom regular expressions must come from trusted configuration; invalid expressions return CHUNK_FAILED.

### Error handling

All operations return `HaiResult<T>`; check `result.success` for success or failure. Error codes use the string format `hai:datapipe:NNN`.

```ts
const result = datapipe.chunk(text, { mode: 'custom' })
if (!result.success) {
  switch (result.error.code) {
    case HaiDatapipeError.MISSING_SEPARATOR.code:
      // mode='custom' 时需要提供 separator
      break
    case HaiDatapipeError.CONFIG_ERROR.code:
      // 配置参数校验失败
      break
    case HaiDatapipeError.CHUNK_FAILED.code:
      // 输入或自定义正则导致处理失败；记录错误并回退到安全默认策略
      break
  }
}
```

## Development and testing

```bash
pnpm --filter @h-ai/datapipe test
```

Source examples distinguish pure functions, synchronous HaiResult and asynchronous pipelines; see the [JSDoc conventions (Chinese)](../../docs/module-jsdoc.md).

## License

Apache-2.0
