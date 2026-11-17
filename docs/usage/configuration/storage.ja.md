# @h-ai/storage 設定

[原文（中国語）](storage.md) · [データ構造](../data/storage.ja.md) · [API リファレンス](../function/storage.ja.md)

`storage.init()` の前に `config/_storage.yml` を読み込みます。共有には S3 互換サービスを使います。ローカル方式は単一ノードや開発向けです。

```yaml schema=@h-ai/storage:StorageConfigSchema
type: local
root: ./data/files
```

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `type` | 必須 | `s3` または `local`。 |
| `bucket`, `region`, `accessKeyId`, `secretAccessKey` | 必須 | S3 のバケット、リージョン、認証情報。 |
| `createBucket`, `forcePathStyle` | `false`, `false` | バケット作成とパス形式のアドレスを許可。 |
| `endpoint`, `publicEndpoint`, `publicUrl` | 省略可 | プロバイダー接続先、クライアントから接続できる URL、公開 URL。 |
| `prefix` | `""` | オブジェクトキーの接頭辞。 |
| `multipart.partSizeBytes`, `queueSize` | `5242880`, `2` | パートの長さ（バイト）とアップロードの並行数。 |
| `root` | 必須 | ローカル方式の基準ディレクトリ。 |
| `directoryMode`, `fileMode` | `0o755`, `0o644` | ローカルのディレクトリとファイルの権限。 |
| `operationLog.read`, `write`, `maxLength` | `false`, `true`, `1000` | 読み取り・書き込みのログと長さの上限。 |
