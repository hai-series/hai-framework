# Datapipe APIs

<!-- translation: partial -->

[Package README](../../../packages/datapipe/README.en.md) · [Options](../configuration/datapipe.en.md) · [Data](../data/datapipe.en.md)

Clean plain text, split it into chunks, or combine those steps in a reusable pipeline.

<a id="quick-start"></a>

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

## API reference

| API | Purpose | Inputs and defaults | Return | Example |
| --- | --- | --- | --- | --- |
| `datapipe.clean(text, options?)` | Strip HTML tags and optionally remove other content | Pass a string. By default, remove tags, normalize whitespace, trim, and keep URLs and email addresses | `HaiResult<string>` | `datapipe.clean('<p>Hello</p>')` |
| `datapipe.chunk(text, options)` | Split by sentence, paragraph, heading, or another boundary | Pass a string and `mode`. `maxSize` defaults to `1500`, `overlap` to `0` | `HaiResult<DataChunk[]>`. Blank input returns an empty array | `datapipe.chunk('One. Two.', { mode: 'sentence' })` |
| `datapipe.pipeline()` | Create a reusable sequence of steps | No arguments | `PipelineBuilder` | `const pipeline = datapipe.pipeline().clean()` |

### Pipeline builder

| Method | Purpose | Inputs and defaults | Return | Example |
| --- | --- | --- | --- | --- |
| `pipeline.clean(options?)` | Clean the current text | Same defaults as `datapipe.clean()` | Builder | `pipeline.clean({ removeUrls: true })` |
| `pipeline.transform(callback)` | Replace text before chunking | Current text enters the callback. Return a string or promise | Builder | `pipeline.transform(text => text.toLowerCase())` |
| `pipeline.chunk(options)` | Split the text | Chunk options including `mode` | Builder | `pipeline.chunk({ mode: 'paragraph' })` |
| `pipeline.chunkTransform(callback)` | Filter or change chunks | Current chunks enter the callback. Return chunks or a promise | Builder | `pipeline.chunkTransform(parts => parts.filter(part => part.content.length > 10))` |
| `pipeline.run(text)` | Run the steps in order | Source text | `Promise<HaiResult<PipelineResult>>` with `{ text, chunks }` on success | `await pipeline.run('<p>Hello</p>')` |

A pipeline without a split step returns the processed text and an empty chunk array.

### Splitting and rendering details

`sentence`, `paragraph`, `markdown`, and `page` use the corresponding document boundaries. `custom` uses the supplied regular expression. `word` counts whitespace-separated words, so a span of Chinese text with no spaces may count as one word. Other modes use Unicode code points. The splitter preserves whitespace, punctuation, and separators. If a natural segment exceeds the limit, the splitter divides it further. Configure overlap smaller than the limit to repeat a short suffix in the next chunk.

Markdown sections do not overlap. A `#` inside a code block is content. Use `markdownKeepTitle: false` to omit headings. See [chunk settings](../configuration/datapipe.en.md).

For HTML display, use the UI's safe rendering features after cleaning. Supply only reviewed regular expressions for custom replacements or separators. Building a regular expression from arbitrary input can make processing take much longer than expected.

## Errors

Check `success` before reading `data`. In `mode: 'custom'`, a missing separator returns `MISSING_SEPARATOR` and an invalid regular expression returns `CHUNK_FAILED`. An invalid configuration may return `CONFIG_ERROR`. Import `HaiDatapipeError` from `@h-ai/datapipe` to compare codes, such as `result.error.code === HaiDatapipeError.MISSING_SEPARATOR.code`.

<a id="call-options"></a>

## Call arguments and integration options

Pass options with the text to `datapipe.clean(text, options)` or `datapipe.chunk(text, options)`. Each call uses its own options. When importing documents into an AI knowledge base, use [`knowledge.cleanOptions` and `knowledge.chunkOptions`](../configuration/ai.md#knowledge) to set the options that the knowledge base passes to Datapipe.

```yaml schema=@h-ai/datapipe:ChunkOptionsSchema
mode: paragraph
maxSize: 1000
overlap: 0
```

Try a short input to see how the word limit works:

```ts
import { datapipe } from '@h-ai/datapipe'

// Give the chunker three words and a limit of one word per chunk.
const result = datapipe.chunk('alpha beta gamma', { mode: 'word', maxSize: 1 })
if (!result.success)
  throw new Error(result.error.message)

// The spaces in the source remain in the returned chunks.
const contents = result.data.map(chunk => chunk.content)
// ['alpha ', 'beta ', 'gamma']
```

### Cleaning

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

### Chunking

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

## Text cleaning and chunking

This integration guide was moved from the configuration handbook because it describes code arguments. The complete walkthrough is currently available in [Chinese](datapipe.md#text-import-guide); this subsection is partially translated.
