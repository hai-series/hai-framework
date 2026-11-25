# @h-ai/datapipe 功能说明

[English](datapipe.en.md) · [日本語](datapipe.ja.md)

通过 `datapipe.clean()` 清理文本，通过 `datapipe.chunk()` 把长文本拆成小段。两者立即返回结果。使用 `datapipe.pipeline()` 创建一套可复用的处理步骤，再调用返回对象的 `run()` 执行。

[模块 README](../../../packages/datapipe/README.md) · [配置清单](../configuration/datapipe.md) · [数据结构](../data/datapipe.md) · [AI 与文档处理](../development/ai.md)

<a id="module-dependencies"></a>

## 依赖

| 依赖 | 用途 | 何时需要 | 接入顺序 |
| --- | --- | --- | --- |
| Node.js | 执行文本处理并支持管线使用工作线程。 | 所有 Datapipe 功能。 | 导入 `datapipe` 后可直接调用。模块按需运行工作线程。 |
| `@h-ai/core` | 提供结果、消息和管线的工作线程池。 | 随 Datapipe 安装。 | Datapipe 在内部使用。应用可按需配置 Core 的日志和语言。 |
| `zod` | 校验清洗、分块等处理选项。 | 随 Datapipe 安装。 | Datapipe 在接收选项时完成校验。 |

<a id="quick-start"></a>

## 最小接入示例

### 接入示例

```ts
import { HaiDatapipeError, datapipe } from '@h-ai/datapipe'

const rawText = '<p>Hello framework.</p>'
const text = '# Getting started\n\nHello framework.'

// 输入原始 HTML 与清洗选项，成功的 data 为纯文本。
// 清理 rawText 中的 HTML，成功 data 为 'Hello framework.'。配置或清洗失败读取 error。
const cleaned = datapipe.clean(rawText, { removeHtml: true })
if (!cleaned.success)
  throw new Error(cleaned.error.message)

// 输入 Markdown 和分块上限，成功的 data 为分块数组。
// 按 Markdown 边界及 2000 的上限拆分 text，成功 data 为 DataChunk 数组，失败读取 error。
const chunks = datapipe.chunk(text, { mode: 'markdown', maxSize: 2000 })
if (!chunks.success)
  throw new Error(chunks.error.message)

// 配置链按顺序登记各步骤，run 读入原文并返回 { text, chunks }。
// 无参数创建空的流水线构建器，下面的调用依次登记步骤。
const result = await datapipe.pipeline()
  // 登记去除标签和 URL 的清洗步骤，返回同一个构建器。
  .clean({ removeHtml: true, removeUrls: true })
  // 登记小写转换回调，接收清洗后的文本并交给下一步，返回构建器。
  .transform(text => text.toLowerCase())
  // 登记段落分块，限制为 1000 且相邻块重叠 100，返回构建器。
  .chunk({ mode: 'paragraph', maxSize: 1000, overlap: 100 })
  // 登记只保留内容长度大于 50 的块，返回构建器。
  .chunkTransform(chunks => chunks.filter(c => c.content.length > 50))
  // 用上方 HTML 原文执行已登记步骤，成功 data 含 text、chunks，任一步失败读取 error。
  .run(rawText)
if (!result.success)
  throw new Error(result.error.message)
```

<a id="api-reference"></a>

## 功能说明

<a id="call-options"></a>

<a id="cleaning"></a>

### 提取与清理文本：`datapipe.clean`

从 HTML 等来源提取文本，按需求移除链接或多余空白；清洗结果仍不是可直接信任的 HTML。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `datapipe.clean(text, options?)` | 移除标签，按需清理 URL、邮箱或替换文本 | 必填 `text: string`，是需要去标签、整理空白或替换的原始正文。可省略 `options: CleanOptionsInput`；它决定执行哪些清洗步骤，字段见[清洗参数](#clean-options)。 | `HaiResult<string>`。选项或正则格式无效时返回 `CONFIG_ERROR` | `datapipe.clean('<p>Hello</p>')` |

<a id="clean-options"></a>

##### 清洗参数

可以省略整个 `options`，也可以只填要覆盖的字段。模块依次去 HTML 标签、去 URL、去邮箱、自定义替换、整理空白、去首尾空白，各步骤按选项执行。

| 字段 | 类型 | 默认值或必填条件 | 效果 |
| --- | --- | --- | --- |
| `removeHtml` | `boolean` | `true` | 移除 HTML 标签，保留标签内的文字。 |
| `removeUrls` | `boolean` | `false` | 移除匹配的 `http://` 和 `https://` 地址。 |
| `removeEmails` | `boolean` | `false` | 移除匹配的邮箱地址。 |
| `normalizeWhitespace` | `boolean` | `true` | 合并连续空格或 Tab，将连续三个及以上的 `\n` 压为两个。 |
| `trim` | `boolean` | `true` | 去掉整段文本首尾的空白。 |
| `customReplacements` | `{ pattern: string, replacement: string }[]` | 可省略 | 按数组顺序执行。省略或传空数组时跳过替换。 |
| `customReplacements[].pattern` | `string` | 每条规则必填 | 可信配置提供的正则字符串，模块用 `g` 标志匹配所有位置。 |
| `customReplacements[].replacement` | `string` | 每条规则必填 | 替换文本。`$1` 引用第一组捕获，`''` 删除匹配内容。 |

#### 场景：提取与清理文本

```ts
// 去除示例标签并合并空白，data 为 'Hello Ada'，清洗失败读取 error。
const cleaned = datapipe.clean('<p>Hello   Ada</p>', { removeHtml: true })
if (!cleaned.success)
  throw new Error(cleaned.error.message)
cleaned.data // 'Hello Ada'
```

输入为包含标签及连续空格的字符串；成功输出为普通文本 Hello Ada，默认同时统一空白。

HTML 清洗用于提取文本。标签属性中带引号的 `>` 会随标签一起移除，普通比较表达式 `x < 2 and y > 3` 保留。结果用于 HTML 渲染时仍需使用 UI 的安全渲染机制。自定义正则来自可信配置。

清洗选项见下表；这些是调用参数，不写入独立配置文件。

> 安全提示：`customReplacements` 与 `mode: 'custom'` 的 `separator` 会作为正则使用。仅传入受信任、已审查的模式；不要把用户输入直接拼进正则，避免 ReDoS 或意外大范围替换。

#### 场景：用 `customReplacements` 统一工单编号

把两处 `Ticket` 编号改写成 `Case #编号`，再删除末尾的 `[draft]`。正则写在 TypeScript 字符串中，因此 `\d` 写成 `\\d`，字面量方括号也要转义。

```ts
import { datapipe } from '@h-ai/datapipe'

// 输入工单编号和草稿标记。成功时 data 是替换后的正文，规则写错时读取 error.code。
const result = datapipe.clean('Ticket 120; Ticket 345 [draft]', {
  customReplacements: [
    { pattern: 'Ticket\\s+(\\d+)', replacement: 'Case #$1' },
    { pattern: '\\s*\\[draft\\]$', replacement: '' },
  ],
})
if (result.success) result.data // 'Case #120; Case #345'
else result.error.code // 正则格式错误时为 'hai:datapipe:005'
```

<a id="chunking"></a>

### 按大小拆分文档：`datapipe.chunk`

选择分词、句子、段落或 Markdown 等边界，再限制每块大小；输出保留来源中的分隔字符。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `datapipe.chunk(text, options)` | 按句、段、标题等边界拆分文本 | `text: string` 是将要分块的原始正文。`options: ChunkOptionsInput` 决定单位、边界和每块大小，两者必填，见[分块参数](#chunk-options)。 | `HaiResult<DataChunk[]>`。选项有效时，空白文本返回空数组 | `datapipe.chunk('One. Two.', { mode: 'sentence' })` |

##### 分块模式与计量单位

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

原始空白、标点和分隔符保留，可去掉重叠部分后拼回原文。Markdown 各节之间无重叠，代码块里的 `#` 仍是正文。`markdownKeepTitle: false` 只省掉标题行，支持 LF、CRLF 和 CR 换行。配置有效时，空文本或全空白返回空数组。`custom` 的分隔符也在空输入时校验，非法正则返回 `CHUNK_FAILED`。

一次分块最多返回 100,000 块。所有块正文和随块返回的 Markdown 标题合计最多 16,777,216 个 UTF-16 代码单元，重叠内容按每次出现计入。任一上限超出时返回 `CHUNK_LIMIT_EXCEEDED`，调用方可减小重叠或分批处理原文。`maxSize` 和 `overlap` 继续使用各模式的计量单位。

<a id="chunk-options"></a>

##### 分块参数

| 字段 | 类型 | 默认值或必填条件 | 效果 |
| --- | --- | --- | --- |
| `mode` | `ChunkMode` | 必填 | 选择 `sentence`、`paragraph`、`markdown`、`page`、`word`、`character` 或 `custom`。 |
| `maxSize` | 正整数 | `1500` | 单块上限，含重叠和分隔符。`word` 按非空白词数计，其余按 Unicode 码点计。 |
| `overlap` | 非负整数 | `0` | 将前一块末尾带入下一块。单位同 `maxSize`，且必须小于 `maxSize`。 |
| `separator` | `string` | `custom` 模式必填且不能为空 | 可信正则字符串。优先在匹配末尾切分，分隔符留在结果中。 |
| `markdownMinLevel` | `1` 至 `6` 的整数 | `2` | 仅用于 `markdown`。`2` 将 `#` 和 `##` 当作分节边界，`3` 还会按 `###` 分节。 |
| `markdownKeepTitle` | `boolean` | `true` | 仅用于 `markdown`。`false` 省去用作分节边界的标题行，`metadata.title` 仍保留标题名称。 |

#### 场景：按大小拆分文档

```ts
// 以每块最多一词拆分示例，data 含按原顺序保留分隔空格的三个块，失败读取 error。
const chunks = datapipe.chunk('alpha beta gamma', { mode: 'word', maxSize: 1 })
if (!chunks.success)
  throw new Error(chunks.error.message)
chunks.data.map(part => part.content) // ['alpha ', 'beta ', 'gamma']
```

输入为三个词、每块最多一个词。输出不是去掉空格的三个词；保留空格便于追溯原文。完整 DataChunk 字段见数据页。

#### 场景：用 `separator` 或 `overlap` 控制切分位置

```ts
import { datapipe } from '@h-ai/datapipe'

// 优先在字面量 || 后切分，每块最多 7 个码点。成功时分隔符还在块内，失败时读取 error.code。
const separated = datapipe.chunk('alpha||beta||gamma', {
  mode: 'custom', separator: '\\|\\|', maxSize: 7,
})
if (separated.success) separated.data.map(chunk => chunk.content) // ['alpha||', 'beta||', 'gamma']
else separated.error.code

// 每块最多 3 个码点，下一块带入 1 个码点。成功时两块共享“乙”，失败时读取 error.code。
const overlapping = datapipe.chunk('甲😀乙丙丁', { mode: 'character', maxSize: 3, overlap: 1 })
if (overlapping.success) overlapping.data.map(chunk => chunk.content) // ['甲😀乙', '乙丙丁']
else overlapping.error.code
```

#### 场景：选择 Markdown 标题深度和是否保留标题行

```ts
import { datapipe } from '@h-ai/datapipe'

const text = '# Guide\nIntro.\n### Details\nSteps.'
// 默认深度 2，只识别 Guide，省去该标题行。成功时 ### Details 留在正文，失败时读取 error.code。
const main = datapipe.chunk(text, { mode: 'markdown', markdownKeepTitle: false })
if (main.success) main.data.map(chunk => chunk.content) // ['Intro.\n### Details\nSteps.']
else main.error.code

// 深度设为 3。成功时得到两节正文，标题仍在 metadata.title 中，失败时读取 error.code。
const detailed = datapipe.chunk(text, { mode: 'markdown', markdownMinLevel: 3, markdownKeepTitle: false })
if (detailed.success) {
  detailed.data.map(chunk => chunk.content) // ['Intro.\n', 'Steps.']
  detailed.data.map(chunk => chunk.metadata?.title) // ['Guide', 'Details']
}
else detailed.error.code
```

<a id="text-import-guide"></a>

<a id="pipelines"></a>

### 组合可复用处理步骤：`datapipe.pipeline`

Node 的 `pipeline.run()` 会把达到 128 Ki 个 UTF-16 代码单元的正文交给 Worker 连续执行内置清洗和分块。自定义 `transform` 与 `chunkTransform` 仍由调用方执行，短文本直接计算。队列满时返回管线失败。

先登记清洗、文本转换、分块和分块筛选，再对每份输入执行 `run`。每次 `run` 在开始时固定步骤列表，期间登记的新步骤从下一次调用生效。长短文本使用相同的选项校验和错误顺序。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `datapipe.pipeline()` | 创建独立处理管线 | 无 | `PipelineBuilder` | `const pipeline = datapipe.pipeline()` |
| `pipeline.clean(options?)` | 登记清洗步骤 | `options: CleanOptionsInput` 控制此步骤怎样清洗当前正文，省略时按[清洗参数](#clean-options)的默认值执行。 | 同一构造器，校验失败由 `run` 返回 | `pipeline.clean({ removeHtml: true })` |
| `pipeline.transform(fn)` | 登记文本转换 | `fn` 必填。接收当前正文 `string`，返回新的 `string` 或 `Promise<string>` | 同一构造器。回调抛错或拒绝时，`run` 返回 `TRANSFORM_FAILED` | `pipeline.transform(text => text.toLowerCase())` |
| `pipeline.chunk(options)` | 登记分块步骤 | `options: ChunkOptionsInput` 必填，决定本步骤怎样拆分到达这一环节的正文。字段见[分块参数](#chunk-options)。 | 同一构造器，校验失败由 `run` 返回 | `pipeline.chunk({ mode: "word", maxSize: 1 })` |
| `pipeline.chunkTransform(fn)` | 登记分块转换 | `fn` 必填。接收现有 `DataChunk[]`，返回 `DataChunk[]` 或 `Promise<DataChunk[]>`。当前分块为空时跳过回调 | 同一构造器。回调抛错或拒绝时，`run` 返回 `PIPELINE_FAILED` | `pipeline.chunkTransform(parts => parts.filter(p => p.content.trim() !== "beta"))` |
| `pipeline.run(text)` | 依序执行已登记步骤 | `text: string` 必填，传入原始正文 | `Promise<HaiResult<PipelineResult>>`，步骤失败时返回错误 | `await pipeline.run("<p>ALPHA BETA GAMMA</p>")` |

#### 场景：组合可复用处理步骤

链式调用只登记步骤，run(text) 才开始执行。下面对应先清洗、再转换正文、分块、最后处理分块的常见顺序。

![pipeline.run：按声明顺序处理文本和分块](../images/function-datapipe-pipeline.svg)

正文与 chunks 是两份不同状态。`transform` 改正文，`chunk` 按当时的正文生成分块，`chunkTransform` 只改已有分块。成功时 `text` 含全部步骤执行后的正文。分块后再执行正文转换，已有分块仍来自原先的正文。任一步失败立即返回失败。没有 `chunk` 步骤时，`chunks` 为空。

```ts
// 无参数创建可复用构建器，下面的调用只登记步骤。
const pipeline = datapipe.pipeline()
  // 登记去除 HTML 标签，返回构建器。运行时清洗失败由 run 报告。
  .clean({ removeHtml: true })
  // 登记小写转换回调，接收清洗后的文本并交给下一步，返回构建器。
  .transform(text => text.toLowerCase())
  // 登记逐词拆分，单块最多 1 个词，返回构建器。
  .chunk({ mode: 'word', maxSize: 1 })
  // 登记过滤 beta 块的回调，返回构建器。
  .chunkTransform(parts => parts.filter(part => part.content.trim() !== 'beta'))
// 将此 HTML 交给上述构建器，成功 data 含小写正文和过滤后的 alpha、gamma 块，失败读取 error。
const result = await pipeline.run('<p>ALPHA BETA GAMMA</p>')
if (!result.success)
  throw new Error(result.error.message)
result.data.text // 'alpha beta gamma'
result.data.chunks.map(part => part.content) // ['alpha ', 'gamma']
```

输入经过清洗和小写转换后成为 text；分块筛选只修改 chunks，所以 text 仍包含 beta。登记步骤均返回同一个构造器；只有 run 执行处理并异步返回结果。不添加分块步骤时，chunks 是空数组。

## 错误处理

收到 `HaiResult<T>` 时先检查 `result.success`。成功时读取 `result.data`，失败时查看 `result.error`。记录故障时保留错误码和追踪编号，便于从日志找到对应请求。

清洗、分块和管线执行返回领域结果，以 `result.success` 区分成功与失败。管线步骤构造器直接返回构造器本身。错误码为字符串格式 `hai:datapipe:NNN`。

```ts
import { HaiDatapipeError, datapipe } from '@h-ai/datapipe'

// 对示例句选择 custom 模式但省略 separator，本次返回失败 MISSING_SEPARATOR，无分块数据。
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
      // 自定义正则等处理失败，记录错误并检查选项。
      break
    case HaiDatapipeError.CHUNK_LIMIT_EXCEEDED.code:
      // 分块总量超出预算，减小重叠或分批处理。
      break
  }
}
```
