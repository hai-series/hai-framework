# @h-ai/datapipe 功能说明

直接调用 `datapipe.clean`、`datapipe.chunk` 或 `datapipe.pipeline`。清洗与分块返还同步领域结果，管线构造器逐步登记处理动作并异步执行。

[模块 README](../../../packages/datapipe/README.md) · [配置清单](../configuration/datapipe.md) · [数据结构](../data/datapipe.md) · [AI 与文档处理](../development/ai.md)

## 最小接入示例

```ts
import { datapipe, HaiDatapipeError } from '@h-ai/datapipe'

const rawText = '<p>Hello framework.</p>'
const text = '# Getting started\n\nHello framework.'

// 输入原始 HTML 与清洗选项，成功的 data 为纯文本。
const cleaned = datapipe.clean(rawText, { removeHtml: true })
if (!cleaned.success)
  throw new Error(cleaned.error.message)

// 输入 Markdown 和分块上限，成功的 data 为分块数组。
const chunks = datapipe.chunk(text, { mode: 'markdown', maxSize: 2000 })
if (!chunks.success)
  throw new Error(chunks.error.message)

// 配置链按顺序登记各步骤，run 读入原文并返回 { text, chunks }。
const result = await datapipe.pipeline()
  .clean({ removeHtml: true, removeUrls: true })
  .transform(text => text.toLowerCase())
  .chunk({ mode: 'paragraph', maxSize: 1000, overlap: 100 })
  .chunkTransform(chunks => chunks.filter(c => c.content.length > 50))
  .run(rawText)
if (!result.success)
  throw new Error(result.error.message)
```

## 功能说明

HTML 清洗用于提取文本，不是安全消毒；结果用于 HTML 渲染时仍需使用 UI 的安全渲染机制。内置标签与邮箱清洗处理长异常输入时避免重复回溯；自定义正则来自可信配置，不直接接收外部用户提交的模式。

| 功能     | 说明                                                        |
| -------- | ----------------------------------------------------------- |
| 文本清洗 | 移除 HTML 标签、URL、Email，标准化空白，自定义正则替换      |
| 文本分块 | 句子、段落、Markdown 标题、分页符、字数、字符、自定义分隔符 |
| 管线组合 | 链式组合清洗 → 转换 → 分块 → 分块后处理，一次执行           |

> 安全提示：`customReplacements` 与 `mode: 'custom'` 的 `separator` 会作为正则使用。仅传入受信任、已审查的模式；不要把用户输入直接拼进正则，避免 ReDoS 或意外大范围替换。

### 分块模式

| 模式      | 说明                             |
| --------- | -------------------------------- |
| sentence  | 按句子分块                       |
| paragraph | 按段落分块                       |
| markdown  | 按 Markdown 标题分块             |
| page      | 按分页符分块                     |
| word      | 按非空白词数分块                 |
| character | 按字符数分块                     |
| custom    | 自定义分隔符（需提供 separator） |

分块 `maxSize` 默认 1500，`overlap` 默认 0 且必须满足 `0 <= overlap < maxSize`。word 模式两者均按非空白词计量（连续中文可视为一个长词），其余模式均按 Unicode code point 计量，不是 UTF-16 length、字节或模型 token。上限包含重叠与分隔符；自然句/段/页/自定义边界只影响优先切点，超长段统一按 `maxSize-overlap` 滑窗。保留原始空白、标点、分页符及自定义分隔符，移除重叠后可还原全文；分块保留原始文本，不做 split/join 或 trim。Markdown section 之间不重叠，section 内使用相同硬上限，代码围栏内的标题保留为正文；仅 `markdownKeepTitle=false` 明确移除标题行。空/全空白的整体输入返回空数组。自定义正则须由可信配置提供，非法表达式返回 CHUNK_FAILED。

### 文本清洗与管线步骤

`datapipe.clean(text, options)` 返回 `HaiResult<string>`，`datapipe.chunk(text, options)` 返回 `HaiResult<DataChunk[]>`。初始化管线时调用 `datapipe.pipeline()`，返回独立的链式构造器。可在一次 `run(text)` 中使用以下步骤。

| 步骤                                                                       | 输入                           | 输出和要点                                                                |
| -------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `.clean({ removeHtml: true })`                                             | 当前文本与清洗选项             | 返回管线构造器，运行时移除 HTML 标签                                      |
| `.transform(value => value.toLowerCase())`                                 | 对当前文本执行的同步或异步转换 | 返回构造器，转换输出成为下一步的文本                                      |
| `.chunk({ mode: 'sentence', maxSize: 120 })`                               | 当前文本与分块选项             | 返回构造器，运行时生成分块数组                                            |
| `.chunkTransform(parts => parts.filter(part => part.content.length > 10))` | 对分块数组执行的同步或异步转换 | 返回构造器，下一步使用筛选后的数组                                        |
| `.run('A sample sentence.')`                                               | 原始文本                       | `Promise<HaiResult<PipelineResult>>`，成功时 `data` 为 `{ text, chunks }` |

管线按登记顺序运行。通常先清洗及转换文本，再分块及后处理。未登记分块步骤时 `data.chunks` 为空，`data.text` 仍包含处理后的全文。DOM 渲染仍须走应用的安全渲染流程。

## 错误处理

返回 `HaiResult<T>` 的操作通过 `result.success` 区分成功与失败。业务成功后读取 `data`，诊断失败时记录 `error.code` 和关联编号。

清洗、分块和管线执行返回领域结果，以 `result.success` 区分成功与失败。管线步骤构造器直接返回构造器本身。错误码为字符串格式 `hai:datapipe:NNN`。

```ts
const result = datapipe.chunk('A sample sentence.', { mode: 'custom' }) // 缺少分隔符，返回 MISSING_SEPARATOR。
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
