# @h-ai/storage 設定

[原文（中国語）](storage.md) · [データ構造](../data/storage.ja.md) · [API リファレンス](../function/storage.ja.md)

生成されたアプリは、起動時に `core.config.get('storage')` で `config/_storage.yml` を読み込み、`storage.init()` に渡します。環境変数で上書きする場合は `HAI_STORAGE_` を使います。ローカル方式ではファイルをサーバーのディスクに保存します。複数のサーバーが同じファイルを参照する必要がある場合は、S3 互換サービスを使います。

```yaml schema=@h-ai/storage:StorageConfigSchema
type: local
root: ./data/files
```

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
| `operationLog.read` | 両方 | `false` | 読み取りを debug レベルで記録。 |
| `operationLog.write` | 両方 | `true` | 書き込みを debug レベルで記録。 |
| `operationLog.maxLength` | 両方 | `1000` | 診断の要約に含める文字数の上限。`0` で要約を省略。 |

設定を変えてバックエンドを再起動したら、オブジェクトを書き込み、読み出せることを確認します。とくにプロキシを使う場合は、利用者がアクセスする URL から署名付きリンクも試してください。
