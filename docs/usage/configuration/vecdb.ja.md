# @h-ai/vecdb 設定

[原文（中国語）](vecdb.md) · [データ構造](../data/vecdb.ja.md) · [API リファレンス](../function/vecdb.ja.md)

`config/_vecdb.yml` を読み込み、指定した方式を初期化します。距離尺度はコレクション作成前に選びます。既存のコレクションは作成時の尺度を保持します。

```yaml schema=@h-ai/vecdb:VecdbConfigSchema
type: lancedb
path: ./data/vectors
```

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `type`, `metric` | Required, `cosine` | `lancedb`、`pgvector`、`qdrant`、`chroma` と既定の距離尺度を選択。 |
| `lancedb.path` | 必須 | LanceDB 使用時に `path` で渡すローカルディレクトリ。 |
| `pgvector.host`, `port`, `database` | `localhost`, `5432`, required database | 接続項目。`url`、`user`、`password` も任意で指定可能。 |
| `pgvector.indexType`, `tablePrefix` | `hnsw`, `vec_` | ベクトル索引の方式とテーブルの接頭辞。 |
| `qdrant.url`, `apiKey` | `http://localhost:6333`, optional key | 外部サービスの URL と認証情報。 |
| `chroma.host`, `port`, `serverCommand`, `startupTimeout` | `localhost`, `8000`, `chroma`, `30000` | Chroma の接続先とローカル起動設定。`path`、`url`、`apiKey` は任意。 |
| `operationLog.read`, `write`, `maxLength`, `level` | `false`, `false`, `1000`, `debug` | 操作ログの有効化、長さとレベル。 |

表のプロバイダー名は対象を示します。項目は選んだ設定オブジェクトに直接書きます。
