# @h-ai/datapipe ファイル設定

[中国語](datapipe.md) · [English](datapipe.en.md)

## 設定の読み込み

Datapipe に `_datapipe.yml`・`_clean.yml`・`_chunk.yml` はありません。AI 知識取り込みは `config/_ai.yml` の `knowledge.cleanOptions`・`knowledge.chunkOptions` を読み、直接の clean/chunk はコード引数を使います。

引数・既定値・使用例は次を参照 [呼び出し引数と接続オプション](../function/datapipe.ja.md#call-options)。

<a id="configuration-fields"></a>

## 設定一覧

AI のナレッジ取り込みが読み込む項目です。指定できる項目と既定値は [AI のナレッジ設定](ai.ja.md#knowledge)を参照してください。

| 設定項目 | 用途 |
| --- | --- |
| `knowledge.cleanOptions` | ナレッジベースへの追加前にテキストを整形する方法。 |
| `knowledge.chunkOptions` | 整形後のテキストを分割する方法。 |

## 設定例

```yaml schema=@h-ai/ai:AIConfigSchema
knowledge:
  cleanOptions:
    removeHtml: true
  chunkOptions:
    mode: paragraph
    maxSize: 1000
    overlap: 0
```
