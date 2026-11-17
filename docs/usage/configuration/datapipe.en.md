# @h-ai/datapipe File configuration

[Chinese](datapipe.md) · [日本語](datapipe.ja.md)

<a id="configuration-fields"></a>

Datapipe has no standalone `_datapipe.yml`, `_clean.yml` or `_chunk.yml`. AI knowledge import reads `knowledge.cleanOptions` and `knowledge.chunkOptions` from `config/_ai.yml`; direct clean/chunk arguments are code options.

See arguments, defaults and examples in [Call arguments and integration options](../function/datapipe.en.md#call-options).

[AI knowledge file settings](ai.en.md#knowledge)

```yaml schema=@h-ai/ai:AIConfigSchema
knowledge:
  cleanOptions:
    removeHtml: true
  chunkOptions:
    mode: paragraph
    maxSize: 1000
    overlap: 0
```
