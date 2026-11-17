# @h-ai/cache 設定

[原文（中国語）](cache.md) · [データ構造](../data/cache.ja.md) · [API リファレンス](../function/cache.ja.md)

Node で `config/_cache.yml` を読み込み、`cache.init()` に渡します。プロセス間で共有する状態には Redis を使います。メモリー方式の状態は一つのプロセスに限られます。

```yaml schema=@h-ai/cache:CacheConfigSchema
type: redis
host: redis.internal
keyPrefix: 'orders:'
```

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `type` | 必須 | `memory` または `redis` を選択。 |
| `url`, `password` | 省略可 | Redis の接続 URL と認証情報。認証情報はサーバーの環境変数に保持。 |
| `host`, `port`, `db` | `localhost`, `6379`, `0` | 単体 Redis のアドレス、ポート、論理データベース。 |
| `cluster` | 省略可 | クラスターのノード一覧。各ノードの `host` と `port` は必須。 |
| `sentinel` | 省略可 | Sentinel 接続。`name` とアドレス・ポートの一覧 `sentinels` は必須。 |
| `connectTimeout`, `commandTimeout` | `10000`, `5000` | 接続とコマンドの期限（ミリ秒）。 |
| `keyPrefix` | 省略可 | アプリのキーを区分する接頭辞。検索パターンはアプリのキーを指定。 |
| `tls`, `readOnly` | `false`, `false` | TLS または読み取り専用動作を使用。 |
| `maxRetries`, `retryDelay` | `3`, `50` | 再試行回数と待ち時間（ミリ秒）。 |
