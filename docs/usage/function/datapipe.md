# @h-ai/datapipe 功能说明

[English](datapipe.en.md) · [日本語](datapipe.ja.md)

通过 `datapipe.clean()` 清理文本，通过 `datapipe.chunk()` 把长文本拆成小段。两者立即返回结果。使用 `datapipe.pipeline()` 创建一套可复用的处理步骤，再调用返回对象的 `run()` 执行。

[模块 README](../../../packages/datapipe/README.md) · [配置清单](../configuration/datapipe.md) · [数据结构](../data/datapipe.md) · [AI 与文档处理](../development/ai.md)

<a id="quick-start"></a>

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

<a id="api-reference"></a>

## 功能说明

HTML 清洗用于提取文本，不是安全消毒；结果用于 HTML 渲染时仍需使用 UI 的安全渲染机制。内置标签与邮箱清洗处理长异常输入时避免重复回溯；自定义正则来自可信配置，不直接接收外部用户提交的模式。

| API                              | 用途                                               | 参数与默认值                                                                    | 返回值                                                                          | 示例                                                    |
| -------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `datapipe.clean(text, options?)` | 移除 HTML 标签，按需清理 URL、邮件地址或自定义文本 | `text` 是字符串。默认移除标签、统一空白并去掉首尾空白，保留 URL 和邮件地址      | `HaiResult<string>`                                                             | `datapipe.clean('<p>Hello</p>')`                        |
| `datapipe.chunk(text, options)`  | 按句、段、标题等边界拆分文本                       | 必填 `text` 和 `options.mode`。每块的 `maxSize` 默认 `1500`，`overlap` 默认 `0` | `HaiResult<DataChunk[]>`。空白文本返回空数组                                    | `datapipe.chunk('One. Two.', { mode: 'sentence' })`     |
| `datapipe.pipeline()`            | 组合清洗、转换、分块和筛选步骤                     | 无参数。按需添加步骤，再给 `run(text)` 传入原文                                 | `PipelineBuilder`。调用它的 `run()` 后得到 `Promise<HaiResult<PipelineResult>>` | `await datapipe.pipeline().clean().run('<p>Hello</p>')` |

完整选项见 [Datapipe 配置](../configuration/datapipe.md)。

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

每块默认最多 1500 个单位，块与块默认没有重叠。用 `overlap` 保留上一个块末尾的一部分内容，比如 `maxSize: 100, overlap: 20` 时，下一个块最多从上一个块结束前 20 个单位开始。重叠量必须小于单块上限。

`word` 模式以空白字符分词，一串未用空白分隔的中文可能计为一个词。其他模式按 Unicode 码点计数，例如一个常见表情符号通常计为一个码点。单块上限包含分隔符和重叠内容。优先在句子、段落、分页符或指定的分隔位置切开。若一个自然段就已超过上限，则在段内逐步切分。

原始空白、标点和分隔符保留，可去掉重叠部分后拼回原文。Markdown 各节之间无重叠，代码块里的 `#` 仍是正文。设置 `markdownKeepTitle: false` 时会主动省掉标题。空文本或全空白返回空数组。使用 `custom` 模式时，将已经检查过的正则作为分隔符，非法正则返回 `CHUNK_FAILED`。

### 文本清洗与管线步骤

`datapipe.clean(text, options)` 返回 `HaiResult<string>`，`datapipe.chunk(text, options)` 返回 `HaiResult<DataChunk[]>`。初始化管线时调用 `datapipe.pipeline()`，返回独立的链式构造器。可在一次 `run(text)` 中使用以下步骤。

| 步骤                                                                       | 输入                           | 输出和要点                                                                |
| -------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `.clean({ removeHtml: true })`                                             | 当前文本与清洗选项             | 返回管线构造器，运行时移除 HTML 标签                                      |
| `.transform(value => value.toLowerCase())`                                 | 对当前文本执行的同步或异步转换 | 返回构造器，转换输出成为下一步的文本                                      |
| `.chunk({ mode: 'sentence', maxSize: 120 })`                               | 当前文本与分块选项             | 返回构造器，运行时生成分块数组                                            |
| `.chunkTransform(parts => parts.filter(part => part.content.length > 10))` | 对分块数组执行的同步或异步转换 | 返回构造器，下一步使用筛选后的数组                                        |
| `.run('A sample sentence.')`                                               | 原始文本                       | `Promise<HaiResult<PipelineResult>>`，成功时 `data` 为 `{ text, chunks }` |

处理步骤按添加顺序执行。可以先移除 HTML 标签、统一大小写，再拆成小块并过滤过短的结果。没有添加分块步骤时，`data.chunks` 是空数组，`data.text` 仍有清洗后的正文。页面显示结果时，仍按应用的安全渲染规则处理。

## 错误处理

收到 `HaiResult<T>` 时先检查 `result.success`。成功时读取 `result.data`，失败时查看 `result.error`。记录故障时保留错误码和追踪编号，便于从日志找到对应请求。

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
