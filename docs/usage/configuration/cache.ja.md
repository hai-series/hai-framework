# @h-ai/cache 設定

[原文（中国語）](cache.md) · [データ構造](../data/cache.ja.md) · [API リファレンス](../function/cache.ja.md)

## 設定の読み込み

Core で `config/_cache.yml` を読み込み、キャッシュ設定を `cache.init()` に渡します。バックエンドを指定しない場合、テンプレートは `memory` を選び、`keyPrefix: 'hai:'` を設定します。生成される `.env.prod` では Redis を選びます。環境変数で上書きする場合は `HAI_CACHE_TYPE` や `HAI_CACHE_KEYPREFIX` のように `HAI_CACHE_` を使います。プロセス間で共有する状態には Redis を使います。メモリー方式の状態は一つのプロセスに限られます。

## 設定一覧

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `type` | 必須 | `memory` または `redis` を選択。 |
| `url` | 省略可 | 認証情報と論理データベース番号を含められる `redis://` または `rediss://` の URL。 |
| `password` | 省略可 | 単体、Cluster、または Sentinel が検出したデータノードの認証パスワード。サーバーの環境変数に保持。 |
| `host`, `port` | `localhost`, `6379` | 単体 Redis のアドレスとポート（1–65535 の整数）。 |
| `db` | `0` | 単体の host/port 接続および Sentinel で使う論理データベース（0–15 の整数）。URL 接続では URL 内の番号、Cluster では 0 を使用。 |
| `cluster` | 省略可 | 空でないノード一覧で Cluster を有効化。各ノードの `host` と `port`（1–65535）は必須。 |
| `sentinel` | 省略可 | 監視対象の `name` と一つ以上のノードを含む `sentinels` が必須。各ノードで `host` と `port`（1–65535）を指定。 |
| `connectTimeout` | `10000` | 接続タイムアウト（ミリ秒）。 |
| `commandTimeout` | `5000` | 通常コマンドのタイムアウト（ミリ秒）。`blpop` と `brpop` の Redis 側の待機時間は呼び出し時の `timeout` で指定。 |
| `keyPrefix` | 省略可 | アプリのキーを区分する接頭辞。検索パターンはアプリのキーを指定。 |
| `tls` | `false` | TLS を有効化。 |
| `readOnly` | `false` | 単体または Sentinel が検出したデータノードへの接続時に Redis の `READONLY` を送信。書き込み権限は Redis ACL が管理。Cluster ではノードの役割に応じてこの設定を管理し、既定でプライマリから読み取る。 |
| `maxRetries`, `retryDelay` | `3`, `50` | 再試行上限と待機時間の基準値（ミリ秒）。いずれも非負の整数で、接続の再試行時は基準値に試行回数を掛ける。 |

## 設定例

各 YAML はそれぞれ `config/_cache.yml` として使えます。デプロイ先に合った例を選んでください。

### ローカル開発で Memory を使う

単一プロセスで開発やテストを行う場合は、アプリのプロセス内にデータを保存できます。Redis サービスを起動せずに開発を始められます。

```yaml schema=@h-ai/cache:CacheConfigSchema
type: memory
```

### URL でマネージド Redis に接続する

マネージドサービスから接続 URL が提供される場合は、その値を `url` に指定します。この例の `rediss://` は TLS を有効にし、末尾の `/2` はデータベース番号 2 を選択します。認証が必要な場合は、サービスの認証情報を含む完全な URL をサーバーの非公開環境変数 `HAI_CACHE_URL` に設定します。

```yaml schema=@h-ai/cache:CacheConfigSchema
type: redis
url: 'rediss://redis.example.com:6380/2'
```

### 単体 Redis に接続してキーに接頭辞を付ける

単体 Redis には `host` と `port` で接続します。この例ではパスワードをサーバーの環境から読み込み、`keyPrefix` によってアプリの `total` キーを Redis に `orders:total` として保存します。

```yaml schema=@h-ai/cache:CacheConfigSchema
type: redis
host: redis.internal
port: 6379
password: '${HAI_CACHE_PASSWORD}'
keyPrefix: 'orders:'
```

ステージングで別の接続先を使う場合は、その環境で接続設定を上書きします。`HAI_CACHE_PASSWORD` は環境のシークレット設定から渡します。

```dotenv
HAI_CACHE_HOST=redis.staging.internal
HAI_CACHE_PORT=6380
```

### Redis Cluster に接続する

`cluster` には既存クラスターの接続先ノードを指定します。クライアントは指定されたアドレスから各シャードを検出し、データベース番号 0 にデータを保存します。この例は認証が有効なクラスターに接続します。

```yaml schema=@h-ai/cache:CacheConfigSchema
type: redis
cluster:
  - host: redis-1.internal
    port: 6379
  - host: redis-2.internal
    port: 6379
  - host: redis-3.internal
    port: 6379
password: '${HAI_CACHE_PASSWORD}'
```

### Sentinel でプライマリを検出する

`sentinel.name` に Sentinel が監視するプライマリ名を指定します。アプリは `sentinels` のアドレスに現在のプライマリを問い合わせ、`password` を使ってデータノードへ認証します。この例ではデータベース番号 1 を選択します。

```yaml schema=@h-ai/cache:CacheConfigSchema
type: redis
sentinel:
  name: orders-primary
  sentinels:
    - host: sentinel-1.internal
      port: 26379
    - host: sentinel-2.internal
      port: 26379
db: 1
password: '${HAI_CACHE_PASSWORD}'
```

### 設定の反映と確認

接続先は空でない `url`、空でない `cluster`、`sentinel`、`host`/`port` の順に選びます。URL 接続では URL 内の認証情報を使います。接続先やキーの接頭辞を変更したら Cache を再初期化し、読み書きが意図したバックエンドに届くことを確認してください。
