# @h-ai/vecdb 設定

[原文（中国語）](vecdb.md) · [データ構造](../data/vecdb.ja.md) · [API リファレンス](../function/vecdb.ja.md)

## 設定の読み込み

`config/_vecdb.yml` を読み込み、指定した方式を初期化します。距離尺度はコレクション作成前に選びます。既存のコレクションは作成時の尺度を保持します。

## 設定一覧


| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `type`, `metric` | Required, `cosine` | `lancedb`、`pgvector`、`qdrant`、`chroma` と既定の距離尺度を選択。 |
| `lancedb.path` | 必須 | LanceDB 使用時に `path` で渡すローカルディレクトリ。 |
| `pgvector.host`, `port`, `database` | `localhost`, `5432`, required database | 接続項目。`url`、`user`、`password` も任意で指定可能。 |
| `pgvector.indexType`, `tablePrefix` | `hnsw`, `vec_` | ベクトル索引の方式とテーブルの接頭辞。 |
| `qdrant.url`, `apiKey` | `http://localhost:6333`, optional key | 外部サービスの URL と認証情報。 |
| `chroma.host`, `port`, `serverCommand`, `startupTimeout` | `localhost`, `8000`, `chroma`, `30000` | Chroma の接続先とローカル起動設定。`path`、`url`、`apiKey` は任意。 |

表のプロバイダー名は対象を示します。項目は選んだ設定オブジェクトに直接書きます。

<a id="operation-logging"></a>

### 操作ログ

すべてのバックエンドに共通の設定です。有効にした操作の要約は `debug` レベルで出力し、[Core のログレベル](core.ja.md#アプリのログ出力)でフィルターします。

| 設定項目 | 型 | 必須または既定値 | 用途 |
| --- | --- | --- | --- |
| `operationLog` | オブジェクト | 省略可 | 省略すると通常操作の要約を出力しません。 |
| `operationLog.read` | 真偽値 | `false` | コレクションの照会やベクトル検索などの読み取りを記録します。 |
| `operationLog.write` | 真偽値 | `false` | コレクションの変更やベクトルの書き込み・削除を記録します。 |
| `operationLog.maxLength` | 非負整数 | `1000` | 安全な要約の最大文字数です。`0` で要約を省略します。 |

旧設定から `operationLog` 配下の `level` を削除してください。環境変数を参照する場合は YAML 側の参照を先に削除し、その後で古い環境変数を削除します。

## 設定例

```yaml schema=@h-ai/vecdb:VecdbConfigSchema
type: lancedb
path: ./data/vectors
```

### 複数の API から Qdrant を共有する

`config/_vecdb.yml` に記述します。同じベクトルを検索する各インスタンスは同じサービスへ接続します。API キーはサーバーの非公開環境変数で渡します。コレクション名、次元数、距離の種類は作成時に指定します。

```yaml schema=@h-ai/vecdb:VecdbConfigSchema
type: qdrant
url: https://vectors.example.com
apiKey: ${HAI_VECDB_APIKEY}
```

### pgvector を導入済みの PostgreSQL を使う

DB 管理者が pgvector 拡張を導入した後、`knowledge` データベースへ接続します。この例では HNSW を使います。設定を変えても既存コレクションのインデックスは自動で再作成されません。

```yaml schema=@h-ai/vecdb:VecdbConfigSchema
type: pgvector
host: postgres.internal
port: 5432
database: knowledge
user: knowledge_app
password: ${HAI_VECDB_PASSWORD}
indexType: hnsw
```

<a id="pgvector-schema"></a>

#### コレクションを配置する PostgreSQL スキーマを選ぶ

pgvector は PostgreSQL の現在のスキーマにコレクションのテーブルを作成します。読み取り、書き込み、削除は `search_path` の順にテーブル名を解決します。一覧には、このパスで参照でき、現在のロールにアクセス権があるテーブルが表示されます。コレクションを共有するインスタンスでは同じ `search_path` を使います。アプリのロールで `SHOW search_path` を実行して順序を確認し、`vecdb.collection.list()` で想定したコレクションが表示されることを確認します。[PostgreSQL のスキーマ検索パス](https://www.postgresql.org/docs/17/ddl-schemas.html#DDL-SCHEMAS-PATH)を参照してください。

`tablePrefix` はテーブル名の接頭辞です。アンダースコアとパーセント記号は通常の文字として扱います。連結したテーブル名は データベースの文字エンコーディングでバイト数を検証します。サーバー設定の `max_identifier_length`（通常は 63 バイト）を超えると `CONFIG_ERROR` が返ります。[PostgreSQL の識別子](https://www.postgresql.org/docs/17/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS)を参照してください。

<a id="chroma-server"></a>

### Chroma サーバーへ接続する

別途稼働する Chroma サービスに接続します。VecDB は `upsert` で有効なメタデータのキーを保存します。サーバーには配列型のメタデータと、`$contains` および `$not_contains` による絞り込みが必要です。Chroma 1.5.5 で検証済みです。接続後、[メタデータの置き換え例](../function/vecdb.ja.md#chroma-metadata-replacement)に沿ってテスト用文書を書き込み、更新して検索します。削除したキーを古い値で絞り込んでも一致しないことを確認します。

```yaml schema=@h-ai/vecdb:VecdbConfigSchema
type: chroma
url: http://chroma.internal:8000
```
