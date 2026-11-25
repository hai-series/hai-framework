# @h-ai/reldb 設定

[简体中文](reldb.md) · [English](reldb.en.md)

[設定一覧](README.ja.md) · [データ構造](../data/reldb.ja.md) · [API リファレンス](../function/reldb.ja.md)

## 設定の読み込み

生成したプロジェクトは `config/_db.yml` を使用します。アプリの起動時に `core.config` で `db` を読み込んで検証し、`reldb.init()` に渡します。サーバーの環境変数 `HAI_DB_*` で YAML の指定を上書きできます。たとえば `HAI_DB_POOL_MAX` は `pool.max` を上書きします。[設定の取得元と優先順位（中国語）](runtime.md#配置从哪里来)

データベースに接続してから、IAM や Audit などのモジュールを起動します。SQLite の `database: ":memory:"` は、接続を閉じるまで使用できるテスト用データベースを作成します。本番環境では PostgreSQL または MySQL を使用します。複数のプロセスで業務データを共有する場合は、同じデータベースに接続します。

<a id="configuration-fields"></a>

## 設定一覧

必須の文字列 `type` には `sqlite`、`postgresql`、`mysql` のいずれかを指定します。選んだデータベースの項目を使います。操作ログはどのデータベースにも適用できます。

### SQLite

| 項目 | 型 | 必須条件または既定値 | 用途 |
| --- | --- | --- | --- |
| `database` | 空でない文字列 | 必須 | データベースファイルのパス、または `:memory:`。相対パスの基準はアプリの作業ディレクトリです。 |
| `sqlite` | オブジェクト | 任意 | ファイルの開き方と処理を実行するスレッドを設定します。省略時も以下の既定値が適用されます。 |
| `sqlite.walMode` | 真偽値 | `true` | 起動時に WAL の有効化を試みます。ローカルファイルの読み取りと書き込みを並行して処理しやすくします。 |
| `sqlite.readonly` | 真偽値 | `false` | 既存のデータベースファイルを読み取り専用で開きます。 |
| `sqlite.executor` | `"sync"` または `"worker"` | `"sync"` | `sync` はメインスレッドで同期実行し、`worker` は専用スレッドで接続を保持して処理します。 |
| `sqlite.workerConnectTimeoutMs` | 正の整数 | `10000` | `worker` が起動して接続を開くまでの待機上限。単位はミリ秒です。 |

### PostgreSQL

| 項目 | 型 | 必須条件または既定値 | 用途 |
| --- | --- | --- | --- |
| `database` | 文字列 | 必須 | データベース名。`url` を指定する場合もスキーマの検証に必要です。 |
| `url` | 文字列 | 任意 | PostgreSQL 接続文字列。`pg` が URL から読み取った設定を、個別項目より優先します。 |
| `host` | 文字列 | `"localhost"` | ホスト名またはアドレス。 |
| `port` | 1〜65535 の整数 | 任意 | ドライバーは `PGPORT`、または既定の `5432` を使います。 |
| `user` | 文字列 | 任意 | データベースのユーザー名。 |
| `password` | 文字列 | 任意 | データベースのパスワード。サーバーの非公開環境変数から渡します。 |
| `ssl` | 真偽値、`"require"`、`"prefer"`、`"allow"`、`"disable"`、またはオブジェクト | 任意 | `pg` に渡す TLS 設定。URL の TLS パラメーターで上書きされる場合があります。 |
| `pool` | オブジェクト | 任意 | 指定すると、RelDB が以下の既定値を補います。省略時は最大 10 接続、最小保持数 0、アイドル接続の回収は 10 秒後で、プールでの接続取得に制限時間はありません。 |
| `pool.min` | 0 以上の整数 | `1` | 確立済みの接続の最小保持数。接続は必要に応じて開きます。 |
| `pool.max` | 正の整数 | `10` | プール当たりの最大接続数。 |
| `pool.idleTimeout` | 0 以上の整数 | `30000` | アイドル接続を回収するまでの時間。単位はミリ秒で、`0` は回収を無効にします。 |
| `pool.acquireTimeout` | 0 以上の整数 | `10000` | 接続取得の制限時間。単位はミリ秒で、`0` はプールの取得タイムアウトを無効にします。 |

### MySQL

| 項目 | 型 | 必須条件または既定値 | 用途 |
| --- | --- | --- | --- |
| `url` | 文字列 | 任意 | 空でない場合は `mysql://` 形式を使用します。クエリーやフラグメントは使用できません。ホスト、ポート、データベース名、認証情報は URL から読み取ります。空文字列は省略として扱います。 |
| `database` | 空でない文字列 | URL を使わない場合に必須 | データベース名。目的のデータベースを URL で指定するときは省略できます。 |
| `host` | 文字列 | `"localhost"` | 個別項目で設定する場合のホスト名またはアドレス。 |
| `port` | 1〜65535 の整数 | `3306`（ドライバーの既定値） | 個別項目で設定する場合のポート。 |
| `user` | 文字列 | 任意 | 個別項目で設定する場合のユーザー名。 |
| `password` | 文字列 | 任意 | 個別項目で設定する場合のパスワード。サーバーの非公開環境変数から渡します。 |
| `ssl` | `false` またはオブジェクト | 任意 | 省略または `false` で TLS は無効です。`{}` は TLS を有効にし、証明書チェーンと DNS ホスト名を検証します。両方を検証する場合、接続先に DNS ホスト名を指定します。 |
| `ssl.rejectUnauthorized` | 真偽値 | `true` | `ssl` がオブジェクトの場合に証明書チェーンを検証します。 |
| `ssl.verifyIdentity` | 真偽値 | `true` | 証明書チェーンを検証する場合に DNS ホスト名も検証します。 |
| `ssl.ca` | 空でない文字列 | 任意 | 信頼する CA の PEM 内容。省略時は Node.js の信頼ストアを使用します。 |
| `ssl.cert` | 空でない文字列 | 任意 | クライアント証明書の PEM 内容。`ssl.key` と併せて指定します。 |
| `ssl.key` | 空でない文字列 | 任意 | クライアント秘密鍵の PEM 内容。`ssl.cert` と併せて指定します。 |
| `pool` | オブジェクト | 任意 | 以下の 3 項目を指定できます。オブジェクトの省略時も既定値が適用されます。 |
| `pool.max` | 正の整数 | `10` | プール当たりの最大接続数。 |
| `pool.acquireTimeout` | 1〜2147483647 の整数 | `10000` | 待ち行列に入ってから接続取得までの制限時間。単位はミリ秒です。SQL は接続取得後に実行されます。 |
| `pool.queueLimit` | 正の整数 | `1000` | 接続を待機できる要求数の上限。 |
| `mysql` | オブジェクト | 任意 | MySQL ドライバーの設定。 |
| `mysql.charset` | 文字列 | `"utf8mb4"` | 接続の文字セット。 |

<a id="connection-tls"></a>

### TLS で接続を暗号化する

PostgreSQL と MySQL はどちらも TLS を利用できます。SQLite はローカルファイルやメモリに直接アクセスします。

PostgreSQL では、`pg` が `ssl` オプションを Node.js の TLS に渡します。サーバーでプライベート CA を利用する場合は `ssl.ca` に PEM の内容を指定します。`url` に `sslmode`、`sslcert`、`sslkey`、`sslrootcert` のいずれかを設定すると、ドライバーは個別の `ssl` オブジェクトを URL の設定で置き換えます。[node-postgres の TLS 設定](https://node-postgres.com/features/ssl#usage-with-connectionstring)を参照してください。

MySQL では専用の `ssl` オブジェクトを指定します。`{}` で TLS が有効になり、証明書チェーンと DNS ホスト名を検証します。プライベート CA は `ssl.ca` で指定します。TLS 設定は MySQL の URL と別に指定します。

<a id="operation-logging"></a>

### 操作ログ

すべてのバックエンドに共通の設定です。有効にした操作の要約は `debug` レベルで出力し、[Core のログレベル](core.ja.md#アプリのログ出力)でフィルターします。

| 項目 | 型 | 必須条件または既定値 | 用途 |
| --- | --- | --- | --- |
| `operationLog` | オブジェクト | 任意 | 省略時は以下の通常操作の要約を記録しません。 |
| `operationLog.read` | 真偽値 | `false` | 複数行、単一行、ページ単位のクエリーを要約して記録します。 |
| `operationLog.write` | 真偽値 | `false` | スキーマ変更、書き込み、一括処理、トランザクション操作を要約して記録します。 |
| `operationLog.maxLength` | 0 以上の整数 | `1000` | 件数要約の最大文字数。`0` は要約を省略します。SQL 原文とバインド値は含みません。 |

## 設定例

各例は `config/_db.yml` に記入します。ローカルで注文を保存する場合、書き込み可能な `data` ディレクトリに SQLite ファイルを置きます。起動したらテスト注文を書き込んで読み戻し、目的のファイルに保存されたことを確認します。

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: sqlite
database: ./data/orders.db
```

### 複数のサービスから同じ PostgreSQL に接続する

各サービスを `postgres.internal` の `orders` データベースに接続し、サーバーの非公開環境変数 `HAI_DB_PASSWORD` にパスワードを設定します。1 プロセス当たりの接続数は最大 10、取得待ち時間は最大 5 秒です。同じデータベースを共有していることを確認するには、一方のサービスでテスト注文を書き込み、もう一方から読み取ります。 サーバー側では TLS を有効にし、プライベート CA の PEM 内容を `HAI_DB_SSL_CA` に設定します。証明書と一致するホスト名を使います。

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: postgresql
host: postgres.internal
port: 5432
database: orders
user: orders_app
password: ${HAI_DB_PASSWORD}
ssl:
  ca: ${HAI_DB_SSL_CA}
  rejectUnauthorized: true
pool:
  max: 10
  acquireTimeout: 5000
```

アプリケーションが使用する接続で `SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()` を実行します。`true` ならその接続で TLS が有効です。

### 既存の MySQL に接続する

管理者が事前に `orders` データベースとアカウントを作成します。この例は個別項目で接続先を指定し、サーバーの非公開環境変数からパスワードを読み込みます。 信頼する CA の PEM 内容を `HAI_DB_SSL_CA` に設定します。

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: mysql
host: mysql.internal
port: 3306
database: orders
user: orders_app
password: ${HAI_DB_PASSWORD}
ssl:
  ca: ${HAI_DB_SSL_CA}
```

アプリケーションが使用する接続で `SHOW SESSION STATUS LIKE 'Ssl_cipher'` を実行します。`Value` が空でなければ暗号スイートが確立されています。

デプロイ環境から接続文字列を渡す場合は、次の形式を使用できます。例の URL はホスト、ポート、データベース、ユーザー名だけを示します。パスワードが必要な場合は、認証情報を含む完全な URL を非公開環境変数 `HAI_DB_URL` で渡します。TLS を利用するサーバーには、上の `ssl` オブジェクトも別途指定します。起動後、目的のデータベースでテストレコードを読み書きし、アプリに必要な権限を確認します。

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: mysql
url: mysql://orders_app@mysql.internal:3306/orders
```

### SQLite の処理をワーカースレッドで実行する

ローカルのクエリー処理に時間がかかる場合は、同期処理を専用スレッドに移します。データベースは同じパスにあり、アプリにはディレクトリの読み書き権限が必要です。この例ではワーカーの起動と接続に最大 10 秒待ちます。起動ログで `executor: worker` を確認し、既存レコードを読み戻します。

```yaml schema=@h-ai/reldb:ReldbConfigSchema
type: sqlite
database: ./data/orders.db
sqlite:
  executor: worker
  workerConnectTimeoutMs: 10000
```

### 反映と確認

YAML や環境変数を変更したらアプリを再起動し、`reldb.init()` に新しい設定を渡します。初期化結果を確認した後、接続先、アカウント権限、TLS の設定を確認します。接続先を切り替えても、レコードは元のデータベースに残ります。必要に応じてデータを個別に移行します。[データベースの種類とアドレス（中国語）](data.md#数据库类型与地址)
