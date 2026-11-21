# @h-ai/reldb 設定

<!-- translation: partial -->

[原文（中国語）](reldb.md) · [データ構造](../data/reldb.ja.md) · [API リファレンス](../function/reldb.ja.md)

`reldb.init()` の前にデータベース設定を読み込みます。SQLite はローカル向けです。複数インスタンスでは共有の PostgreSQL または MySQL を選びます。

## 設定例

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: sqlite
database: ./data/orders.db
```

### 複数のサービスから同じ PostgreSQL に接続する

`config/_db.yml` に記述します。各サービスの接続数は最大 10、接続待ちは最大 5 秒です。パスワードはサーバーの非公開環境変数から読み込みます。同じデータを見るには、各サービスで接続先とデータベース名を揃えます。

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: postgresql
host: postgres.internal
port: 5432
database: orders
user: orders_app
password: ${HAI_DB_PASSWORD}
pool:
  max: 10
  acquireTimeout: 5000
```

### 既存の MySQL に接続する

データベースとアカウントは事前に作成します。`url` を指定していないため、host、port、database の各値が使われます。起動後にテスト用レコードを読み書きして権限を確認してください。接続できてもテーブル作成権限があるとは限りません。

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: mysql
host: mysql.internal
port: 3306
database: orders
user: orders_app
password: ${HAI_DB_PASSWORD}
```

### SQLite の処理をワーカースレッドで実行する

同期 SQLite 処理をメインスレッド以外で実行したい場合の例です。保存先は引き続きローカルファイルで、リモート DB にはなりません。ディレクトリへの読み書き権限が必要です。ワーカー接続の待機上限は 10 秒です。

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: sqlite
database: ./data/orders.db
sqlite:
  executor: worker
  workerConnectTimeoutMs: 10000
```

## 設定一覧


| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `type`, `database` | 必須 | `sqlite`、`postgresql`、`mysql` と、SQLite のファイルまたはデータベース名を指定。 |
| `sqlite.walMode`, `readonly`, `executor`, `workerConnectTimeoutMs` | バックエンドによる | 先行書き込みログ、接続権限、実行方式、ワーカーの起動期限を設定。 |
| `url`, `host`, `port`, `user`, `password` | バックエンドによる | 接続 URL または方式別の接続項目を使用。パスワードはサーバーに保持。 |
| `ssl` | バックエンドによる | ドライバーごとの TLS と証明書検証要件を設定。 |
| `pool.min`, `max`, `idleTimeout`, `acquireTimeout` | バックエンドによる | 接続プールのサイズ、アイドル期限、接続取得期限を設定。 |
| `operationLog.read`, `write`, `maxLength`, `level` | バックエンドによる | 記録する操作と出力の長さ・レベルを指定。 |

未翻訳：プロバイダーごとの TLS、接続プール、SQLite ワーカー、操作ログ。[中国語の該当節](reldb.md#configuration-fields)を参照してください。
