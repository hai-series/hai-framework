# @h-ai/storage 設定

[原文（中国語）](storage.md) · [データ構造](../data/storage.ja.md) · [API リファレンス](../function/storage.ja.md)

## 設定の読み込み

生成されたアプリは、起動時に `core.config.get('storage')` で `config/_storage.yml` を読み込み、`storage.init()` に渡します。環境変数で上書きする場合は `HAI_STORAGE_` を使います。ローカル方式ではファイルをサーバーのディスクに保存します。複数のサーバーが同じファイルを参照する必要がある場合は、S3 互換サービスを使います。

## 設定一覧


| 項目 | 適用先 | 既定値・必須条件 | 用途 |
| --- | --- | --- | --- |
| `type` | 両方 | 必須 | `s3` または `local`。ドットが付いていない項目は YAML の最上位に書く。 |
| `bucket` | S3 | 必須 | オブジェクトを保存するバケット名。 |
| `region` | S3 | 必須 | 接続と署名に使うリージョン。 |
| `accessKeyId` | S3 | 必須 | アクセスキー ID。認証情報はサーバーの環境変数から読み込む。 |
| `secretAccessKey` | S3 | 必須 | アクセスキー ID と組みになる秘密鍵。 |
| `createBucket` | S3 | `false` | 起動時にバケットがなければ作成。認証情報に作成権限が必要。 |
| `forcePathStyle` | S3 | `false` | バケット名を URL パスに入れる。一部の S3 互換サービスで必要。 |
| `endpoint` | S3 | 省略可 | バックエンドが読み書きするサービス URL。省略時は SDK のリージョン別接続先を使う。 |
| `publicEndpoint` | S3 | 省略可 | 署名付き URL のブラウザー向け接続先。`/delivery/files` のような接頭辞を付ける場合は、プロキシが転送時に取り除き、署名対象の Host を保持する。バケット名、認証情報、クエリ、フラグメントは含めない。 |
| `publicUrl` | S3 | 省略可 | `storage.presign.publicUrl()` が返す恒久リンクの基準 URL。バケットの公開権限は変わらない。 |
| `prefix` | S3 | `""` | バケット内のキーの接頭辞。空文字列ではバケットのルートを使う。 |
| `multipart.partSizeBytes` | S3 | `5242880` | サーバーからのアップロードで、各パートのサイズ（5 MiB～5 GiB）。 |
| `multipart.queueSize` | S3 | `2` | アップロード 1 件あたりの最大同時パート数（1 以上）。 |
| `root` | ローカル | 必須 | ファイルの保存先。サーバープロセスに読み書き権限が必要。 |
| `directoryMode` | ローカル | `0o755` (`493`) | 作成するディレクトリの POSIX モード。括弧内は十進数。 |
| `fileMode` | ローカル | `0o644` (`420`) | 作成するファイルの POSIX モード。括弧内は十進数。 |

設定を変えてバックエンドを再起動したら、オブジェクトを書き込み、読み出せることを確認します。とくにプロキシを使う場合は、利用者がアクセスする URL から署名付きリンクも試してください。

<a id="operation-logging"></a>

### 操作ログ

ローカルストレージと S3 は同じログ設定を使用します。`operationLog` を省略しても、Storage は書き込み操作を `debug` レベルで記録します。このログを表示するには [Core のログ出力レベル](core.ja.md#アプリのログ出力)を `debug` または `trace` にします。書き込み操作のログを無効にするには `operationLog.write: false` を指定します。

| 項目 | 型 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `operationLog` | オブジェクト | `{}` | ファイル、ディレクトリ、署名の操作ログ設定。省略時も以下の既定値を適用します。 |
| `operationLog.read` | 真偽値 | `false` | 読み取り操作を記録します。 |
| `operationLog.write` | 真偽値 | `true` | 書き込み操作を記録します。 |
| `operationLog.maxLength` | 0 以上の整数 | `1000` | 診断の要約の文字数上限です。`0` で要約を省略します。 |

## 設定例

### ローカルディスクにファイルを保存する

相対パスの起点はサービスの作業ディレクトリです。`reports/june.pdf` をアップロードすると `./data/files/reports/june.pdf` に保存されます。サービスのアカウントには読み書き権限が必要です。このローカルディレクトリは別のサーバーと自動では共有されません。

Windows のローカルストレージでは、ハードリンクに対応したファイルシステムと、オブジェクトのディレクトリで一時ファイルを作成・削除する権限も必要です。読み取り時に一時的なリンクを使うため、開いたストリームが同じキーの上書きを妨げません。[ローカルファイルの保存方法](../data/storage.ja.md)も参照してください。

```yaml schema=@h-ai/storage:StorageConfigSchema
type: local
root: ./data/files
```

### S3 互換サービスに保存する

`config/_storage.yml` に記述します。サーバーは内部 URL で `orders-files` バケットへ接続し、`reports/june.pdf` を `orders/reports/june.pdf` として保存します。バケットを先に作成し、認証情報はサーバーの非公開環境変数から渡します。`${…}` は Core が設定を読む際に置換します。

```yaml schema=@h-ai/storage:StorageConfigSchema
type: s3
bucket: orders-files
region: us-east-1
endpoint: https://s3.internal.example.com
forcePathStyle: true
prefix: orders/
accessKeyId: ${HAI_STORAGE_ACCESSKEYID}
secretAccessKey: ${HAI_STORAGE_SECRETACCESSKEY}
```

### 保存は内部 URL、ダウンロードは公開 URL を使う

これも完全な `_storage.yml` の例です。保存は内部 URL を使い、署名付きリンクは `publicEndpoint` を使います。プロキシは `/files` を除いて S3 へ転送し、署名に使用する Host を維持します。URL にバケット名は含めません。実際の署名付きリンクをブラウザで確認してください。

```yaml schema=@h-ai/storage:StorageConfigSchema
type: s3
bucket: orders-files
region: us-east-1
endpoint: https://s3.internal.example.com
publicEndpoint: https://downloads.example.com/files
forcePathStyle: true
accessKeyId: ${HAI_STORAGE_ACCESSKEYID}
secretAccessKey: ${HAI_STORAGE_SECRETACCESSKEY}
```

### 大きなファイルの分割アップロードを調整する

1 パートを 8 MiB、1 回のアップロードで同時に送るパートを 2 個にします。サーバーのストリームアップロード向けの設定です。ブラウザから受け取る HTTP リクエストの上限は、HTTP サービス側で設定します。

```yaml schema=@h-ai/storage:StorageConfigSchema
type: s3
bucket: orders-files
region: us-east-1
accessKeyId: ${HAI_STORAGE_ACCESSKEYID}
secretAccessKey: ${HAI_STORAGE_SECRETACCESSKEY}
multipart:
  partSizeBytes: 8388608
  queueSize: 2
```
