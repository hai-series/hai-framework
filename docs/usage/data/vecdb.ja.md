# @h-ai/vecdb データ構造

[原文（中国語）](vecdb.md) · [設定](../configuration/vecdb.ja.md) · [API リファレンス](../function/vecdb.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

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

### データベースとコレクション

コレクション作成時に名前と次元を指定します。既定はコサイン類似度です。既存のコレクションは作成時の尺度を維持します。保存先ごとの構造は次のとおりです。

| 保存先 | 構造 | 件数と用途 |
| --- | --- | --- |
| [pgvector](#pgvector) | `<tablePrefix><collection>` | コレクションごとに 1 テーブル。既定の接頭辞は `vec_`。 |
| [qdrant](#qdrant) | `point` | 各文書をコレクションの一つのポイントとして保存します。 |
| [lancedb](#lancedb) | `Arrow` | コレクションごとに同名の Arrow テーブルを作ります。 |
| [chroma](#chroma) | `collection` | 各コレクションに文書、ベクトル、属性を保存します。 |

#### pgvector

| 項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | — | コレクション内の主キー。 | `doc-42` |
| `vector` | `vector(dimension)` | — | 類似度に使うベクトル。テーブルの次元と長さを揃えます。 | `[0.1,0.2,0.3]` |
| `content` | `TEXT` | — | 文書本文。書き込み API で省略した場合は空文字列を保存します。 | `Example shipping policy` |
| `metadata` | `JSONB` | `{}` | アプリ独自の属性。省略時は空オブジェクト。 | `{"source":"policy.txt"}` |

`id` だけが NULL 不可で、`metadata` の SQL 既定値は `{}` です。既定のベクトル索引は HNSW です。IVFFlat を選ぶ場合、`lists` の既定値は 100 です。`vector` 列のコメントに `hai.vecdb.metric=<metric>` を記録します。

#### qdrant

| 項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | — | 文書 ID から計算する安定した ID。 | `<point-uuid>` |
| `vector` | `number[]` | — | コレクションと同じ次元の文書ベクトル。 | `[0.1,0.2,0.3]` |
| `payload._id` | `string` | — | 呼び出し元が渡した元の文書 ID。 | `doc-42` |
| `payload._content` | `string` | `""` | 検索で取得する元の文書本文。 | `Example shipping policy` |
| `payload.*` | `JSON` | `{}` | アプリの属性を payload に追加します。上の予約項目が優先です。 | `{"source":"policy.txt"}` |

次元と距離尺度はコレクション設定に保存します。既存 ID を `insert` すると対応するポイントを上書きします。

#### lancedb

| 項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `id` | `string` | — | 新しいテーブルの NULL 不可の主キー。 | `doc-42` |
| `vector` | `fixed-size list` | — | 固定長の文書ベクトル。 | `[0.1,0.2,0.3]` |
| `content` | `string` | `""` | 文書本文。 | `Example shipping policy` |
| `metadata` | `JSON` | `{}` | アプリの属性。新しいテーブルでは NULL 不可の Arrow JSON 項目です。 | `{"source":"policy.txt"}` |

次元はベクトル列の長さで決まります。距離尺度は Arrow スキーマのメタデータ `hai.vecdb.metric` に保存します。

#### chroma

| 項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `ids` | `string[]` | — | 書き込みバッチの文書 ID。 | `["doc-42"]` |
| `embeddings` | `number[][]` | — | ID と同じ順序のベクトル。それぞれ次元を揃えます。 | `[[0.1,0.2,0.3]]` |
| `documents` | `string[]` | `[""]` | ID に対応する文書本文。既定で各項目は空文字列。 | `["Example shipping policy"]` |
| `metadatas` | `object[]` | — | アプリの属性と予約項目 `_content`。値は Chroma SDK の検証に従います。 | `[{"source":"policy.txt","_content":"Example shipping policy"}]` |

コレクションメタデータ `hai_dimension` と `hnsw:space` に次元と距離尺度を記録します。

### キャッシュ

VecDB は Redis キーを作りません。検索は接続先から読みます。次のページを読むときは同じ保存先とコレクションに前回のカーソルを渡します。
