# @h-ai/datapipe

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

## 简介

数据处理管线模块，提供文本清洗（clean）、分块（chunk）和可组合管线（pipeline）功能。纯函数模块，无需初始化。

## 核心功能清单

| 功能     | 说明                                                        |
| -------- | ----------------------------------------------------------- |
| 文本清洗 | 移除 HTML 标签、URL、Email，标准化空白，自定义正则替换      |
| 文本分块 | 句子、段落、Markdown 标题、分页符、字数、字符、自定义分隔符 |
| 管线组合 | 链式组合清洗 → 转换 → 分块 → 分块后处理，一次执行           |

> 安全提示：`customReplacements` 与 `mode: 'custom'` 的 `separator` 会作为正则使用。仅传入受信任、已审查的模式；不要把用户输入直接拼进正则，避免 ReDoS 或意外大范围替换。

## 使用入门

### 快速开始

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

// 管线模式（链式组合多步操作）
const result = await datapipe.pipeline()
  .clean({ removeHtml: true, removeUrls: true })
  .transform(text => text.toLowerCase())
  .chunk({ mode: 'paragraph', maxSize: 1000, overlap: 100 })
  .chunkTransform(chunks => chunks.filter(c => c.content.length > 50))
  .run(rawText)
```

### 分块模式

| 模式      | 说明                             |
| --------- | -------------------------------- |
| sentence  | 按句子分块                       |
| paragraph | 按段落分块                       |
| markdown  | 按 Markdown 标题分块             |
| page      | 按分页符分块                     |
| word      | 按字数分块                       |
| character | 按字符数分块                     |
| custom    | 自定义分隔符（需提供 separator） |

### 错误处理

所有操作返回 `HaiResult<T>`，通过 `result.success` 判断成功或失败。错误码为字符串格式 `hai:datapipe:NNN`。

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

## 开发测试

```bash
pnpm --filter @h-ai/datapipe test
```

## 许可证

Apache-2.0

分块 `maxSize` 默认 1500，`overlap` 默认 0 且必须满足 `0 <= overlap < maxSize`。word 模式两者均按非空白词计量（连续中文可视为一个长词），其余模式均按 Unicode code point 计量，不是 UTF-16 length、字节或模型 token。上限包含重叠与分隔符；自然句/段/页/自定义边界只影响优先切点，超长段统一按 `maxSize-overlap` 滑窗。保留原始空白、标点、分页符及自定义分隔符，移除重叠后可还原全文；不再 split/join 或 trim 分块。Markdown section 之间不重叠，section 内使用相同硬上限，代码围栏内的标题保留为正文；仅 `markdownKeepTitle=false` 明确移除标题行。空/全空白的整体输入返回空数组。自定义正则须由可信配置提供，非法表达式返回 CHUNK_FAILED。
