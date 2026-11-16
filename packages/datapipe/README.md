# @h-ai/datapipe

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

数据处理管线模块，提供文本清洗（clean）、分块（chunk）和可组合管线（pipeline）功能。纯函数模块，无需初始化。

## 快速开始

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

## 配置清单

清洗与分块选项通过 `clean()`、`chunk()` 或 `pipeline()` 传入。

在[模块配置清单](../../docs/usage/configuration/datapipe.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/datapipe.md)中查看调用示例、输入输出、错误处理与使用要点。

- `clean` — 规范化和过滤文本
- `chunk` / `pipeline` — 将文本分块或连续执行清洗与分块

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/datapipe.md)，了解清洗结果、文本块与应用侧存储责任。

## 开发测试

```bash
pnpm --filter @h-ai/datapipe test
```

源码示例区分无需生命周期的纯函数、同步 HaiResult 与异步管线；类型检查方法见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## 许可证

Apache-2.0
