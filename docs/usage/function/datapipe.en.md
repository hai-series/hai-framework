# Datapipe APIs

[Package README](../../../packages/datapipe/README.en.md) · [Options](../configuration/datapipe.en.md) · [Data](../data/datapipe.en.md)

Clean plain text, split it into chunks, or combine those steps in a reusable pipeline.

## Quick start

```ts
import { datapipe } from '@h-ai/datapipe'

const rawText = '<p>One. Two.</p>'

// The builder registers three steps and returns a result when run on the input.
const result = await datapipe.pipeline()
  .clean({ removeHtml: true }) // Pass options. The builder will strip tags from the text.
  .transform(text => text.toLowerCase()) // Pass a callback that returns the next text.
  .chunk({ mode: 'sentence', maxSize: 80 }) // Pass the splitting method and limit.
  .run(rawText) // Pass the source text. On success, data contains { text, chunks }.

if (!result.success)
  throw new Error(result.error.message)

const { text, chunks } = result.data // 'one. two.' and its sentence chunks.
```

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

<a id="call-options"></a>

<a id="cleaning"></a>

### Extract and clean text: `datapipe.clean`

Extract text from sources such as HTML and optionally remove URLs or extra whitespace. The result is not sanitized HTML.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `datapipe.clean(text, options?)` | Strip HTML tags and optionally remove other content | Pass a string. By default, remove tags, normalize whitespace, trim, and keep URLs and email addresses | `HaiResult<string>` | `datapipe.clean('<p>Hello</p>')` |

#### Scenario: Extract and clean text

```ts
const cleaned = datapipe.clean('<p>Hello   Ada</p>', { removeHtml: true })
if (!cleaned.success)
  throw new Error(cleaned.error.message)
cleaned.data // 'Hello Ada'
```

The input has tags and repeated spaces. The successful plain-text result is Hello Ada; whitespace normalization is enabled by default.

#### Cleaning arguments

| Option | Default | Effect |
| --- | --- | --- |
| `removeHtml` | `true` | Strip HTML tags. |
| `removeUrls` | `false` | Remove URLs. |
| `removeEmails` | `false` | Remove email addresses. |
| `normalizeWhitespace` | `true` | Collapse extra spaces and blank lines. |
| `trim` | `true` | Remove leading and trailing whitespace. |
| `customReplacements` | Optional | Apply the listed replacements in order. |
| `customReplacements[].pattern` | Required for an entry | A trusted regular expression or a string interpreted as a regular expression. |
| `customReplacements[].replacement` | Required for an entry | The replacement text. |

[Detailed parameters and workflows](datapipe.md#cleaning)

<a id="chunking"></a>

### Split documents by size: `datapipe.chunk`

Choose word, sentence, paragraph or Markdown boundaries, then limit chunk size. Separators from the source remain in the output.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `datapipe.chunk(text, options)` | Split by sentence, paragraph, heading, or another boundary | Pass a string and `mode`. `maxSize` defaults to `1500`, `overlap` to `0` | `HaiResult<DataChunk[]>`. Blank input returns an empty array | `datapipe.chunk('One. Two.', { mode: 'sentence' })` |

#### Scenario: Split documents by size

```ts
const chunks = datapipe.chunk('alpha beta gamma', { mode: 'word', maxSize: 1 })
if (!chunks.success)
  throw new Error(chunks.error.message)
chunks.data.map(part => part.content) // ['alpha ', 'beta ', 'gamma']
```

The input is three words with a one-word limit. Spaces remain so chunks can be traced to the source. See the data page for full DataChunk fields.

#### Chunk units and rendering

`sentence`, `paragraph`, `markdown`, and `page` use the corresponding document boundaries. `custom` uses the supplied regular expression. `word` counts whitespace-separated words, so a span of Chinese text with no spaces may count as one word. Other modes use Unicode code points. The splitter preserves whitespace, punctuation, and separators. If a natural segment exceeds the limit, the splitter divides it further. Configure overlap smaller than the limit to repeat a short suffix in the next chunk.

Markdown sections do not overlap. A `#` inside a code block is content. Use `markdownKeepTitle: false` to omit headings. See [chunk settings](../configuration/datapipe.en.md).

For HTML display, use the UI's safe rendering features after cleaning. Supply only reviewed regular expressions for custom replacements or separators. Building a regular expression from arbitrary input can make processing take much longer than expected.

#### Chunk arguments

| Option | Default | Effect |
| --- | --- | --- |
| `mode` | Required | Choose `sentence`, `paragraph`, `markdown`, `page`, `word`, `character`, or `custom`. |
| `maxSize` | `1500` | Positive integer. Maximum units per chunk, including separators and overlapping text. Word mode counts whitespace-separated words. Other modes count Unicode code points. |
| `overlap` | `0` | Number of units to carry into the next chunk. Use a nonnegative integer smaller than `maxSize`. |
| `separator` | Required for `custom` | A regular expression supplied by the application. |
| `markdownMinLevel` | `2` | Split at level 1 and 2 headings by default. Set to 3 to include level 3. Range 1–6. |
| `markdownKeepTitle` | `true` | Keep the heading in the returned chunk. |

For example, `datapipe.chunk(text, { mode: 'paragraph' })` uses no overlap. The AI knowledge base has its own chunking defaults. Changing the chunk limit, overlap, or heading behavior changes index contents. Reprocess the original text before replacing the existing chunks in the index.

<a id="text-import-guide"></a>

<a id="pipelines"></a>

### Compose reusable steps: `datapipe.pipeline`

On Node, `pipeline.run()` sends consecutive cleaning and chunking steps to a Worker when the text reaches 128 Ki UTF-16 code units. The caller runs custom `transform` and `chunkTransform` callbacks and processes short text directly. A full queue returns a pipeline failure.

Register cleaning, text transforms, chunking and chunk transforms, then run that sequence on each input. Registration itself processes nothing.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `datapipe.pipeline()` | Create an independent pipeline | None | PipelineBuilder | `const pipeline = datapipe.pipeline()` |
| `pipeline.clean(options?)` | Register cleaning | Optional cleaning arguments; same defaults as clean | Same builder | `pipeline.clean({ removeHtml: true })` |
| `pipeline.transform(fn)` | Register a text transform | Synchronous or asynchronous string transform | Same builder | `pipeline.transform(text => text.toLowerCase())` |
| `pipeline.chunk(options)` | Register chunking | mode required; same defaults as chunk | Same builder | `pipeline.chunk({ mode: "word", maxSize: 1 })` |
| `pipeline.chunkTransform(fn)` | Register a chunk transform | Synchronous or asynchronous chunk-array transform | Same builder | `pipeline.chunkTransform(parts => parts.filter(p => p.content.trim() !== "beta"))` |
| `pipeline.run(text)` | Run steps in order | Source string | Promise<HaiResult<PipelineResult>>; step failures return failure | `await pipeline.run("<p>ALPHA BETA GAMMA</p>")` |

#### Scenario: Compose reusable steps

Chained calls register steps; run(text) executes them. This example cleans, transforms the text, chunks it and then transforms the chunks.

![pipeline.run: process text and chunks in order](../images/function-datapipe-pipeline.en.svg)

Text and chunks are separate state: transform changes text, chunk snapshots that text into chunks, and chunkTransform changes existing chunks. A later text transform does not rebuild them. Failure stops later steps; without chunk, chunks remains empty.

```ts
const pipeline = datapipe.pipeline()
  .clean({ removeHtml: true })
  .transform(text => text.toLowerCase())
  .chunk({ mode: 'word', maxSize: 1 })
  .chunkTransform(parts => parts.filter(part => part.content.trim() !== 'beta'))
const result = await pipeline.run('<p>ALPHA BETA GAMMA</p>')
if (!result.success)
  throw new Error(result.error.message)
result.data.text // 'alpha beta gamma'
result.data.chunks.map(part => part.content) // ['alpha ', 'gamma']
```

Cleaning and lowercasing produce text. Filtering only changes chunks, so text still contains beta. The builder methods and run use the inputs and results shown here.

## Errors

Check `success` before reading `data`. In `mode: 'custom'`, a missing separator returns `MISSING_SEPARATOR` and an invalid regular expression returns `CHUNK_FAILED`. An invalid configuration may return `CONFIG_ERROR`. Import `HaiDatapipeError` from `@h-ai/datapipe` to compare codes, such as `result.error.code === HaiDatapipeError.MISSING_SEPARATOR.code`.
