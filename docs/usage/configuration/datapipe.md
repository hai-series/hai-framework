# @h-ai/datapipe 配置

<a id="h-aidatapipe-文件配置"></a>

[English](datapipe.en.md) · [日本語](datapipe.ja.md)

## 配置入口

Datapipe 没有独立的 `_datapipe.yml`、`_clean.yml` 或 `_chunk.yml`。AI 知识导入通过 `config/_ai.yml` 的 `knowledge.cleanOptions` 和 `knowledge.chunkOptions` 读取文件设置；直接调用 clean/chunk 的参数写在代码中。

参数、默认值和调用示例见 [调用参数与接入选项](../function/datapipe.md#call-options)。

<a id="configuration-fields"></a>

## 配置清单

文件中的字段由 AI 知识导入读取。完整字段和默认值见 [AI 的 knowledge 清单](ai.md#knowledge)。

| 配置项 | 用途 |
| --- | --- |
| `knowledge.cleanOptions` | 文本进入知识库前如何清洗。 |
| `knowledge.chunkOptions` | 清洗后的文本如何切块。 |

## 配置示例

```yaml schema=@h-ai/ai:AIConfigSchema
knowledge:
  cleanOptions:
    removeHtml: true
  chunkOptions:
    mode: paragraph
    maxSize: 1000
    overlap: 0
```
