# @h-ai/reldb 設定

<!-- translation: partial -->

[原文（中国語）](reldb.md) · [データ構造](../data/reldb.ja.md) · [API リファレンス](../function/reldb.ja.md)

`reldb.init()` の前にデータベース設定を読み込みます。SQLite はローカル向けです。複数インスタンスでは共有の PostgreSQL または MySQL を選びます。

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: sqlite
database: ./data/orders.db
```

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `type`, `database` | 必須 | `sqlite`、`postgresql`、`mysql` と、SQLite のファイルまたはデータベース名を指定。 |
| `sqlite.walMode`, `readonly`, `executor`, `workerConnectTimeoutMs` | バックエンドによる | 先行書き込みログ、接続権限、実行方式、ワーカーの起動期限を設定。 |
| `url`, `host`, `port`, `user`, `password` | バックエンドによる | 接続 URL または方式別の接続項目を使用。パスワードはサーバーに保持。 |
| `ssl` | バックエンドによる | ドライバーごとの TLS と証明書検証要件を設定。 |
| `pool.min`, `max`, `idleTimeout`, `acquireTimeout` | バックエンドによる | 接続プールのサイズ、アイドル期限、接続取得期限を設定。 |
| `operationLog.read`, `write`, `maxLength`, `level` | バックエンドによる | 記録する操作と出力の長さ・レベルを指定。 |

追加の設定項目や利用例は[中国語リファレンス](reldb.md)に掲載しています。
