# Datapipe options

[Configuration reference](README.en.md) · [Datapipe APIs](../function/datapipe.en.md)

Pass options with the text to `datapipe.clean(text, options)` or `datapipe.chunk(text, options)`. Each call uses its own options. When importing documents into an AI knowledge base, use [`knowledge.cleanOptions` and `knowledge.chunkOptions`](ai.md#knowledge) to set the options that the knowledge base passes to Datapipe.

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

## Cleaning

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

## Chunking

| Option | Default | Effect |
| --- | --- | --- |
| `mode` | Required | Choose `sentence`, `paragraph`, `markdown`, `page`, `word`, `character`, or `custom`. |
| `maxSize` | `1500` | Positive integer. Maximum units per chunk, including separators and overlapping text. Word mode counts whitespace-separated words. Other modes count Unicode code points. |
| `overlap` | `0` | Number of units to carry into the next chunk. Use a nonnegative integer smaller than `maxSize`. |
| `separator` | Required for `custom` | A regular expression supplied by the application. |
| `markdownMinLevel` | `2` | Split at level 1 and 2 headings by default. Set to 3 to include level 3. Range 1–6. |
| `markdownKeepTitle` | `true` | Keep the heading in the returned chunk. |

For example, `datapipe.chunk(text, { mode: 'paragraph' })` uses no overlap. The AI knowledge base has its own chunking defaults. Changing the chunk limit, overlap, or heading behavior changes index contents. Reprocess the original text before replacing the existing chunks in the index.
