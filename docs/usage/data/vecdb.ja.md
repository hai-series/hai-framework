# @h-ai/vecdb データ構造

[简体中文](vecdb.md) · [English](vecdb.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/vecdb.ja.md) · [API リファレンス](../function/vecdb.ja.md)

検索対象の文書を登録する際、アプリは文書 ID、埋め込み、本文、属性を VecDB に渡します。バックエンドは指定コレクションをベクトル距離で検索し、該当項目を返します。

<a id="document-field-mapping"></a>

## 文書フィールドの対応

アプリが VecDB に文書を書き込むときは、どのバックエンドでも共通の `VectorDocument` フィールドを使います。[文書の例](#example-data)の各項目がバックエンドのどのフィールドに保存されるかを示します。

| アプリのフィールド | [pgvector](#pgvector) | [Qdrant](#qdrant) | [LanceDB](#lancedb) | [Chroma](#chroma) |
| --- | --- | --- | --- | --- |
| `id` | `id` | `payload._id` | `id` | `ids[i]` |
| `vector` | `vector` | `vector` | `vector` | `embeddings[i]` |
| `content` | `content` | `payload._content` | `content` | `documents[i]` |
| `metadata` | `metadata` | `payload` 内のアプリの属性 | `metadata` | `metadatas[i]` 内のアプリの属性 |

pgvector、LanceDB、Chroma は元の文字列 `id` をそのまま保存します。Qdrant のポイント ID には符号なし 64 ビット整数か UUID を指定します。VecDB は元の `id` から決定的にポイントの UUID を生成するため、同じ文書 ID で書き込み、更新、削除すると同じポイントが対象になります。予約フィールド `payload._id` に元の文書 ID を保存し、VecDB の検索や走査で返します。[Qdrant のポイント ID](https://qdrant.tech/documentation/manage-data/points/#point-ids)を参照してください。

Chroma の書き込みバッチでは、同じインデックス `i` の配列要素が同じ文書に属します。検索結果で本文を返すため、VecDB は `metadatas[i]._content` にも本文を書き込みます。絞り込みでは `filter: { source: 'policy.txt' }` のようにアプリの属性を指定します。Qdrant は `payload` の `source` を、他のバックエンドは対応するメタデータの項目を比較します。

<a id="vector-collections"></a>

## ベクトルコレクション

コレクション作成時に名前と次元を指定します。既定はコサイン類似度です。既存のコレクションは作成時の尺度を維持します。保存先ごとの構造は次のとおりです。

| 保存先 | 構造 | 件数と用途 |
| --- | --- | --- |
| [pgvector](#pgvector) | `<schema>.<tablePrefix><collection>` | コレクションごとに 1 テーブル。既定の接頭辞は `vec_`。 |
| [qdrant](#qdrant) | `point` | 各文書をコレクションの一つのポイントとして保存します。 |
| [lancedb](#lancedb) | `Arrow` | コレクションごとに同名の Arrow テーブルを作ります。 |
| [chroma](#chroma) | `collection` | 各コレクションに文書、ベクトル、属性を保存します。 |

### pgvector

| 項目 | 型 | NULL 可 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | コレクション内の主キー。 | `doc-42` |
| `vector` | `vector(dimension)` | 可 | — | 類似度に使うベクトル。テーブルの次元と長さを揃えます。 | `[0.1,0.2,0.3]` |
| `content` | `TEXT` | 可 | — | 文書本文。書き込み API で省略した場合は空文字列を保存します。 | `Example shipping policy` |
| `metadata` | `JSONB` | 可 | `{}` | アプリ独自の属性。省略時は空オブジェクト。 | `{"source":"policy.txt"}` |

`id` だけが NULL 不可で、`metadata` の SQL 既定値は `{}` です。既定のベクトル索引は HNSW です。IVFFlat を選ぶ場合、`lists` の既定値は 100 です。`vector` 列のコメントに `hai.vecdb.metric=<metric>` を記録します。

pgvector はテーブル作成、索引作成、距離尺度の記録を 1 つのトランザクションで行います。コミット時にまとめて反映し、索引作成に失敗した場合はテーブル作成もロールバックします。新しいテーブルは PostgreSQL の現在のスキーマに置かれます。既存のテーブル名は `search_path` の順に解決します。[接続の設定と確認方法](../configuration/vecdb.ja.md#pgvector-schema)を参照してください。

### qdrant

| 項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | — | 文書 ID から計算する安定した ID。 | `<point-uuid>` |
| `vector` | `number[]` | — | コレクションと同じ次元の文書ベクトル。 | `[0.1,0.2,0.3]` |
| `payload._id` | `string` | — | 呼び出し元が渡した元の文書 ID。 | `doc-42` |
| `payload._content` | `string` | `""` | 検索で取得する元の文書本文。 | `Example shipping policy` |
| `payload.*` | `JSON` | `{}` | アプリの属性を payload に追加します。上の予約項目が優先です。 | `{"source":"policy.txt"}` |

次元と距離尺度はコレクション設定に保存します。既存 ID を `insert` すると対応するポイントを上書きします。VecDB の文書には文字列の `payload._id` があり、ポイントの UUID はその ID のフレームワーク上の対応付けと一致します。Qdrant のネイティブ API で書き込んだポイントのうち、VecDB の文書 ID に対応付けられないものも、コレクションに残ります。`vector.count()` の件数には含まれますが、VecDB の検索や ID の走査には現れません。[両方を含むコレクションの例](../function/vecdb.ja.md#qdrant-document-visibility)を参照してください。

### lancedb

| 項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `id` | `string` | — | NULL 不可の列。Lance の非強制主キーとして宣言します。 | `doc-42` |
| `vector` | `fixed-size list` | — | 固定長の文書ベクトル。 | `[0.1,0.2,0.3]` |
| `content` | `string` | `""` | 文書本文。 | `Example shipping policy` |
| `metadata` | `JSON` | `{}` | NULL 不可の Arrow JSON 項目に保存するアプリの属性。 | `{"source":"policy.txt"}` |

次元はベクトル列の長さで決まります。距離尺度は Arrow スキーマのメタデータ `hai.vecdb.metric` に保存します。フレームワークの `insert` と `upsert` は LanceDB の merge を使って ID の競合を処理します。ネイティブの `add` で直接追加すると ID が重複することがあります。

<a id="lancedb-upgrade"></a>

<a id="既存の-lancedb-コレクションを更新する"></a>

<a id="lancedb-import-documents"></a>

#### 既存の文書を LanceDB コレクションに取り込む

コレクションには固定長ベクトル列と、保存された距離尺度が必要です。どちらかが欠けていると、コレクション情報の取得、検索、書き込みは `CONFIG_ERROR` を返します。VecDB での書き込みには、主キーとして宣言された NULL 不可の `id` と、Arrow JSON メタデータ列も必要です。メタデータで絞り込む場合も Arrow JSON 列を使います。

取り込み元がこれらの要件を満たさない場合は、VecDB でコレクションを作成し、そこへ文書を取り込みます。

1. 取り込み元への書き込みを一時停止し、LanceDB ディレクトリ全体をバックアップします。元の文書データ、または取り込み元の形式を読み取れるツールからレコードを取得し、埋め込みモデル、ベクトルの次元、距離尺度を記録します。
2. `vecdb.collection.create()` で `policy_search` などの取り込み先を作成します。既存のベクトルを再利用する場合は、取り込み元と同じ次元と距離尺度を指定します。
3. 重複 ID を整理した後、安定した ID、ベクトル、本文、メタデータオブジェクトを小さなバッチに分け、`vecdb.vector.upsert()` で書き込みます。各バッチの `success` を確認し、失敗した場合は原因に対処してから続けます。
4. `vecdb.collection.info()` と `vecdb.vector.count()` で取り込み先の定義と文書数を確認します。既知の文書で検索とメタデータによる絞り込みを検証したら、アプリの読み書き先を切り替えて書き込みを再開します。アプリの切り戻し期間中はバックアップと取り込み元を保持します。

### chroma

| 項目 | 型 | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- |
| `ids` | `string[]` | — | 書き込みバッチの文書 ID。 | `["doc-42"]` |
| `embeddings` | `number[][]` | — | ID と同じ順序のベクトル。それぞれ次元を揃えます。 | `[[0.1,0.2,0.3]]` |
| `documents` | `string[]` | `[""]` | ID に対応する文書本文。既定で各項目は空文字列。 | `["Example shipping policy"]` |
| `metadatas` | `object[]` | — | アプリの属性、予約項目 `_content`、有効なキーの一覧。値は Chroma SDK の検証に従います。 | `[{"source":"policy.txt","_content":"Example shipping policy"}]` |

VecDB で作成したコレクションにはフレームワークの次元と距離尺度の定義が保存されます。Chroma のネイティブ API で作成されたコレクションはサーバーの索引に設定されている距離尺度を使います。最初にベクトルが書き込まれたときに Chroma が次元を記録し、レコードがすべて削除されても保持します。

VecDB は同じ `upsert` リクエストで、有効なキーの一覧を予約項目 `_hai_vecdb_metadata_keys` に保存します。検索結果と絞り込みはこの一覧を参照します。有効なキーの一覧がないレコードでは、保存されている業務メタデータをそのまま読み取ります。Chroma から直接読み取ると、VecDB で削除したキーの値が残って見えることがあります。[メタデータの置き換え例](../function/vecdb.ja.md#chroma-metadata-replacement)を参照してください。

VecDB は Redis キーを作りません。検索は接続先から読みます。次のページを読むときは同じ保存先とコレクションに前回のカーソルを渡します。

<a id="example-data"></a>

### 意味で検索する文書

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
