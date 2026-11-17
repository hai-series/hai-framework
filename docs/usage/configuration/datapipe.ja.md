# @h-ai/datapipe ファイル設定

[中国語](datapipe.md) · [English](datapipe.en.md)

<a id="configuration-fields"></a>

Datapipe に `_datapipe.yml`・`_clean.yml`・`_chunk.yml` はありません。AI 知識取り込みは `config/_ai.yml` の `knowledge.cleanOptions`・`knowledge.chunkOptions` を読み、直接の clean/chunk はコード引数を使います。

引数・既定値・使用例は次を参照 [呼び出し引数と接続オプション](../function/datapipe.ja.md#call-options)。

[AI knowledge file settings](ai.ja.md#knowledge)

```yaml schema=@h-ai/ai:AIConfigSchema
knowledge:
  cleanOptions:
    removeHtml: true
  chunkOptions:
    mode: paragraph
    maxSize: 1000
    overlap: 0
```
