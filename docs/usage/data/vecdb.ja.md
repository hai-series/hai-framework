# @h-ai/vecdb データ構造

[原文（中国語）](vecdb.md) · [設定](../configuration/vecdb.ja.md) · [API リファレンス](../function/vecdb.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

まず用途と例を読み、必要に応じて後半の項目・保存規則を確認してください。ID と業務内容は架空で、秘密は隠しています。時刻は 2026-11-17 00:00 UTC を起点とし、単位は各説明に記します。

### 意味で検索する文書

対応する構造：`VectorDocument`。

本文と意味を表すベクトルを保存し、近い意味の文書を検索します。

```json
{
  "id": "doc-42",
  "vector": [
    0.1,
    0.2,
    0.3
  ],
  "content": "Example shipping policy",
  "metadata": {
    "source": "policy.txt"
  }
}
```

数値が3個なので集合も3次元です。metadata は policy.txt が出典だと示します。

## 項目・保存・削除のリファレンス

文書はコレクション内の `id`、固定次元の `vector`、任意の `content` と `metadata` で構成します。Redis キーは作成しません。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| pgvector | コレクションごとに `<tablePrefix><collection>`。`id TEXT` が主キー、`vector vector(dimension)`、空文字で書き込む `content TEXT`、既定値 `{}` の `metadata JSONB`。HNSW が既定、IVFFlat のリストは 100。列コメントに `hai.vecdb.metric`。 |
| Qdrant | 文書ごとに一点。payload に `_id`、`_content` とメタデータ、コレクション設定に次元と距離尺度。 |
| LanceDB | コレクション名の Arrow テーブルに固定長ベクトルとスキーマの距離尺度を保持。 |
| Chroma | ID、埋め込み、本文、メタデータ。`hai_dimension` と `hnsw:space` は次元と距離尺度。 |
