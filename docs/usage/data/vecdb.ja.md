# @h-ai/vecdb データ構造

[原文（中国語）](vecdb.md) · [設定](../configuration/vecdb.ja.md) · [API リファレンス](../function/vecdb.ja.md)

文書はコレクション内の `id`、固定次元の `vector`、任意の `content` と `metadata` で構成します。Redis キーは作成しません。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| pgvector | コレクションごとに `<tablePrefix><collection>`。`id TEXT` が主キー、`vector vector(dimension)`、空文字で書き込む `content TEXT`、既定値 `{}` の `metadata JSONB`。HNSW が既定、IVFFlat のリストは 100。列コメントに `hai.vecdb.metric`。 |
| Qdrant | 文書ごとに一点。payload に `_id`、`_content` とメタデータ、コレクション設定に次元と距離尺度。 |
| LanceDB | コレクション名の Arrow テーブルに固定長ベクトルとスキーマの距離尺度を保持。 |
| Chroma | ID、埋め込み、本文、メタデータ。`hai_dimension` と `hnsw:space` は次元と距離尺度。 |
