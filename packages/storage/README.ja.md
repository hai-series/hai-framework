# @h-ai/storage

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

## 概要

共通の `storage` 入口で S3 互換ストレージとローカルファイルシステムを操作するオブジェクトストレージモジュールです。

## 主な機能

- S3 プロトコル（AWS S3 / MinIO / RustFS / OSS など）
- ローカルファイルシステム

## 使い始める

### クイックスタート

#### Node.js サーバー

```ts
import { storage } from '@h-ai/storage'

// 初始化（S3）
await storage.init({
  type: 's3',
  bucket: 'my-bucket',
  region: 'us-east-1',
  accessKeyId: process.env.HAI_STORAGE_ACCESSKEYID!,
  secretAccessKey: process.env.HAI_STORAGE_SECRETACCESSKEY!,
})

// 或本地存储
await storage.init({ type: 'local', root: '/data/uploads' })

// 上传/下载
await storage.file.put('uploads/image.png', imageBuffer, { contentType: 'image/png' })
const file = await storage.file.get('uploads/image.png')

// 签名 URL
const url = await storage.presign.getUrl('uploads/image.png', { expiresIn: 3600 })

// 关闭连接
const closeResult = await storage.close()
if (!closeResult.success) {
  throw new Error(closeResult.error.message)
}
```

#### ブラウザークライアント

ブラウザー環境ではクライアント機能（署名付き URL のアップロード・ダウンロード）のみをエクスポートし、`storage` サービスオブジェクトは含みません。

```ts
import { downloadAndSave, uploadWithPresignedUrl } from '@h-ai/storage/client'

// 业务端点路径由应用自行定义（例如 /api/files/presign-put）
const { uploadUrl } = await fetch('/api/files/presign-put').then(r => r.json())
await uploadWithPresignedUrl(uploadUrl, file)
```

> 注：`@h-ai/storage` に HTTP ルートは組み込まれていません。署名付き URL API はアプリケーション層で実装してください。

### HTTP API 契約

公開 HTTP API は `@h-ai/api-contract` で定義し、`@h-ai/serv` の `createStorageProcedures({ storage, authorize })` で本モジュールの機能に接続します。

```ts
import { apiClient } from '@h-ai/api-client'

const result = await apiClient.storage.presignedUrls.createUpload({ key: 'avatar.png' })
```

### API 一覧

- `storage.file`
  - `put/get/getStream/head/exists/delete/deleteMany/copy`
- `storage.dir`
  - `list/delete`
- `storage.presign`
  - `getUrl/putUrl/publicUrl`
- `storage.checksum`
  - `generate(data, options?) / verify(data, expected, options?)`

`file.put()` は Buffer、Uint8Array、文字列と `AsyncIterable<Uint8Array>`（Node Readable 等）を受け付け、ストリームはバッファ量を制限した S3 multipart で送信します。`getStream()` は Range と `signal` による中止に対応するバイトストリームを返します。初期エラーは HaiResult、反復中の I/O・中止エラーは呼び出し側で処理します。`get()` は従来どおり全体を Buffer に読み込み、小さいファイル向けです。

`{ ifNoneMatch: '*' }` は標準 S3 条件付き書き込み、またはローカルの原子的公開で上書きを拒否し、競合時に `ALREADY_EXISTS` を返します。非対応の S3 サービスではエラーとし、上書きに切り替えません。失敗・中止時は一時ファイルや未完了パートを削除しますが、公開済みオブジェクトは中止で取り消せません。

`file.deleteMany(keys)` は `StorageDeleteResult` を返します。成功時の data は `{ deletedKeys, failures: [] }`、削除未完了の項目がある場合は `OPERATION_FAILED` と `error.ext?.deleteMany` に進捗を返します（未初期化などの事前エラーには進捗がない場合があります）。重複入力は一度だけ処理し、返す key に設定 prefix を含めません。S3 は最大 1000 件ずつ送信し、すべての `Deleted` / `Errors` を照合します。HTTP 200 でも全件成功とは限らず、欠落・重複・不明な応答は `unknown` になります。ローカル削除の並行数は最大 32 件です。

明示的な `InternalError / ServiceUnavailable / SlowDown / RequestTimeout` の項目だけ最大 3 回試行し、成功済み・権限エラーは再送しません。`DeleteObjects` 専用クライアントは SDK のリクエスト再試行を無効化します。通信が中断した項目は直ちに `unknown`、後続の未送信バッチは `notAttempted` とし、不明な結果を再送しません。`retryable` は障害の分類であり、再試行前に不明な結果と並行書き込みを確認してください。`dir.delete()` は削除エラーを伝播しますが、並行して追加されるオブジェクトは防げません。S3 の削除は VersionId を指定しないため、バージョニングが有効な場合は削除マーカーを作成することがあり、過去のバージョンは消去しません。

`@h-ai/serv` / `@h-ai/api-client` の `storage.files.deleteMany` も同じ成功データと失敗進捗を返します。

```ts
const result = await storage.file.deleteMany(['a.txt', 'b.txt'])
if (!result.success) {
  const progress = result.error.ext?.deleteMany
  // 不明な結果と業務上の書き込みを確認してから補償する。
  const knownFailures = progress?.failures.filter(item => item.outcome === 'failed' && item.retryable) ?? []
}
```

`checksum` は初期化不要の Node 専用ツールです。実際の入力バイトを生成・検証し、ストリームは一度だけ消費します。既定値は SHA-256、小文字 hex。`algorithm: 'sha256' | 'sha384' | 'sha512' | 'sha1' | 'md5'`、`encoding: 'hex' | 'base64'`、`signal` を指定できます。不一致は `ok(false)`、不正形式・アルゴリズムや読み取り失敗はエラーです。MD5/SHA-1 は互換性確認のみで、認証用ではありません。ETag と multipart の複合 checksum はファイル全体の摘要と異なり、AWS checksum 拡張の実装は強制しません。

checksum の中止時は次のチャンクを待つ処理を終了し、入力イテレーターの終了を要求します。ローカルの `getStream()` はディレクトリをストリームとして返さず、その場で `INVALID_PATH` を返します。

> 注：`publicUrl` は S3 の `publicUrl` を設定した場合のみ文字列を返し、それ以外は `null` を返します。

> 注：`storage.config` は**機密情報をマスクした設定スナップショット**を返します。S3 の秘密情報は `[REDACTED]` に置換され、再初期化には使用できません。

### クライアントヘルパー

`@h-ai/storage/client` は以下のブラウザー用ツールも提供します：

- `uploadWithPresignedUrl(url, data, options)`
- `downloadWithPresignedUrl(url, options)`
- `downloadAndSave(url, { filename })`
- `getFileExtension(file)`
- `getMimeType(extension)`
- `formatFileSize(bytes)`

### 設定

- **S3**：`bucket / region / accessKeyId / secretAccessKey` は必須。`endpoint / forcePathStyle / prefix / publicUrl` は任意。
- **Local**：`root` は必須。`directoryMode / fileMode` は任意。

MinIO と RustFS は S3 Provider を共有し、`type: 's3'` を使います。専用のストレージ種別は不要です。自前のインスタンスでは S3 API endpoint（通常ポート 9000）とパス形式を設定し、バケットは事前に作成してください。

```ts
const initResult = await storage.init({
  type: 's3',
  endpoint: 'http://localhost:9000',
  bucket: 'my-bucket',
  region: 'us-east-1',
  accessKeyId: process.env.HAI_STORAGE_ACCESSKEYID!,
  secretAccessKey: process.env.HAI_STORAGE_SECRETACCESSKEY!,
  forcePathStyle: true,
})
if (!initResult.success) {
  throw new Error(initResult.error.message)
}
```

#### 操作ログ

`operationLog` でファイル・ディレクトリー・署名付き URL の操作ログを有効にできます。Local/S3 Provider の実際の操作箇所で出力し、`storage-main.ts` で一括ラップしません。ファイル内容は記録せず、アップロードデータはバイト数のみを記録します。

```yaml
# config/_storage.yml
type: local
root: ./data/uploads
operationLog:
  read: false # file.get/head/exists, dir.list, presign.getUrl/publicUrl
  write: false # file.put/delete/deleteMany/copy, dir.delete, presign.putUrl
  maxLength: 1000 # 参数序列化后的最大输出长度，超出会截断
  level: debug # info | debug | trace，默认 debug
```

```ts
await storage.init({
  type: 'local',
  root: './data/uploads',
  operationLog: {
    read: true,
    write: true,
    maxLength: 500,
    level: 'debug',
  },
})
```

`storage.presign.putUrl()` は現在 `contentType` や `expiresIn` などの署名パラメーターに対応しますが、`maxSize` 制限は提供しません。

ローカルの `storage.dir.list()` は prefix に一致するファイルを再帰的に走査します。`maxKeys` による打ち切りのみ対応し、`continuationToken` による実際のページ分割はありません。大きなディレクトリーでは `prefix` を絞るか、S3 Provider のページ分割を使用してください。

### エラー処理

```ts
import { HaiStorageError, storage } from '@h-ai/storage'

const result = await storage.file.get('image.png')
if (!result.success && result.error.code === HaiStorageError.NOT_INITIALIZED.code) {
  // 存储未初始化
}
```

主なエラーコード：

| エラーコード                        | code              | 説明                      |
| ----------------------------------- | ----------------- | ------------------------- |
| `HaiStorageError.NOT_INITIALIZED`   | `hai:storage:010` | 未初期化                  |
| `HaiStorageError.CONNECTION_FAILED` | `hai:storage:001` | 接続に失敗                |
| `HaiStorageError.OPERATION_FAILED`  | `hai:storage:002` | 操作に失敗                |
| `HaiStorageError.NOT_FOUND`         | `hai:storage:003` | ファイルが存在しない      |
| `HaiStorageError.PERMISSION_DENIED` | `hai:storage:005` | 権限不足                  |
| `HaiStorageError.PRESIGN_FAILED`    | `hai:storage:013` | 署名付き URL の生成に失敗 |
| `HaiStorageError.CONFIG_ERROR`      | `hai:storage:012` | 設定エラー                |

## 開発とテスト

```bash
pnpm --filter @h-ai/storage test
```

S3 統合テストには Docker または互換ランタイムが必要です。初期化、ファイル、ディレクトリー、署名付き URL、実際の HTTP アップロード・ダウンロードの同じテストを MinIO と RustFS で実行し、コンテナー起動失敗をスキップしません。

- MinIO：[`ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z`](https://github.com/coollabsio/minio)。上流ソースからビルドしたコミュニティーイメージ。
- RustFS：[`ghcr.io/rustfs/rustfs:1.0.1`](https://github.com/rustfs/rustfs)。公式イメージ。

コンテナーは一時生成したテスト認証情報を使用します。サービスの準備完了後に S3 API でバケットを作成し、最後のリース解放時にコンテナーと匿名ボリュームを削除します。

## ライセンス

Apache-2.0
