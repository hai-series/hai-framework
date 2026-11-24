# @h-ai/datapipe File configuration

[Chinese](datapipe.md) · [日本語](datapipe.ja.md)

## Configuration entry

Datapipe has no standalone `_datapipe.yml`, `_clean.yml` or `_chunk.yml`. AI knowledge import reads `knowledge.cleanOptions` and `knowledge.chunkOptions` from `config/_ai.yml`; direct clean/chunk arguments are code options.

See arguments, defaults and examples in [Call arguments and integration options](../function/datapipe.en.md#call-options).

<a id="configuration-fields"></a>

## Configuration reference

AI reads these fields when it imports knowledge. See the [AI knowledge settings](ai.en.md#knowledge) for supported options and defaults.

| Setting | Purpose |
| --- | --- |
| `knowledge.cleanOptions` | How to clean text before adding it to the knowledge base. |
| `knowledge.chunkOptions` | How to split the cleaned text into chunks. |

## Configuration examples

```yaml schema=@h-ai/ai:AIConfigSchema
knowledge:
  cleanOptions:
    removeHtml: true
  chunkOptions:
    mode: paragraph
    maxSize: 1000
    overlap: 0
```
