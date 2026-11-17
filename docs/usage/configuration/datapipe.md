# @h-ai/datapipe 文件配置

[English](datapipe.en.md) · [日本語](datapipe.ja.md)

<a id="configuration-fields"></a>

Datapipe 没有独立的 `_datapipe.yml`、`_clean.yml` 或 `_chunk.yml`。AI 知识导入通过 `config/_ai.yml` 的 `knowledge.cleanOptions` 和 `knowledge.chunkOptions` 读取文件设置；直接调用 clean/chunk 的参数写在代码中。

参数、默认值和调用示例见 [调用参数与接入选项](../function/datapipe.md#call-options)。

[AI knowledge file settings](ai.md#knowledge)

```yaml schema=@h-ai/ai:AIConfigSchema
knowledge:
  cleanOptions:
    removeHtml: true
  chunkOptions:
    mode: paragraph
    maxSize: 1000
    overlap: 0
```
