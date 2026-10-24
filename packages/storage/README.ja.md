# @h-ai/storage

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

## 概要

共通の `storage` 入口で S3 互換ストレージとローカルファイルシステムを操作するオブジェクトストレージモジュールです。

接続はヘルスチェック成功後に公開します。初期化失敗時は候補リソースを解放し、解放にも失敗した場合は初期化エラーの `error.ext.cleanupPending` が `true` になります。`storage.close()` は `Promise<HaiResult<void>>` を返し、初期化を待機して並行する終了処理をまとめます。解放開始後は `isInitialized` が `false` となり、設定と操作は利用できません。解放に失敗したリソースは保持され、次の `close()` または `init()` で再試行します。解放が成功するまで代替接続は作成しません。終了結果を必ず確認してください。

```ts
const closed = await storage.close()
if (!closed.success) {
  // 障害への対処後に一度再試行し、再失敗はアプリへ報告します。
  const retried = await storage.close()
  if (!retried.success)
    throw new Error(retried.error.message)
}
```

S3 の通常クライアントと、リクエスト再試行を無効化した一括削除クライアントは個別に解放します。一方の失敗でも他方は解放し、解放済みクライアントは再度破棄しません。

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
if (!url.success) {
  // local 不支持预签名；呈现错误或使用应用已有的鉴权文件接口。
  // 失败结果不包含上传/下载 URL。
}

// 关闭连接
const closeResult = await storage.close()
if (!closeResult.success) {
  throw new Error(closeResult.error.message)
}
```

#### ブラウザークライアント

ブラウザー環境ではクライアント機能（署名付き URL のアップロード・ダウンロード）のみをエクスポートし、`storage` サービスオブジェクトは含みません。

```ts
import { apiClient } from '@h-ai/api-client'
import { downloadAndSave, uploadWithPresignedUrl } from '@h-ai/storage/client'

// apiClient 已初始化，服务端使用 S3。
const signed = await apiClient.storage.presignedUrls.createUpload({ key: 'avatar.png' })
if (!signed.success)
  throw new Error(signed.error.message)
await uploadWithPresignedUrl(signed.data.url, file)
```

> 注：`@h-ai/storage` に HTTP ルートは組み込まれていません。署名付き URL API はアプリケーション層で実装してください。

### HTTP API 契約

公開 HTTP API は `@h-ai/api-contract` で定義し、`@h-ai/serv` の `createStorageProcedures({ storage, authorize })` で本モジュールの機能に接続します。

```ts
import { apiClient } from '@h-ai/api-client'

const result = await apiClient.storage.presignedUrls.createUpload({ key: 'avatar.png' })
if (!result.success)
  throw new Error(result.error.message)
```

署名付き URL は S3 のみ対応します。local の `getUrl()` / `putUrl()` は `HaiStorageError.UNSUPPORTED_OPERATION`（`hai:storage:018`）、`publicUrl()` は `null` を返し、仮想 URL は返しません。serv と apiClient は失敗結果を保持するため、URL を使う前に `success` を確認してください。ローカル開発ではアプリの既存の認証付きファイル API を利用します。このモジュールに HTTP ファイルルートや署名検証サービスは含まれません。

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

- **S3**：`bucket / region / accessKeyId / secretAccessKey` は必須。`createBucket / endpoint / forcePathStyle / prefix / publicUrl` は任意。
- **Local**：`root` は必須。`directoryMode / fileMode` は任意。

MinIO と RustFS は S3 Provider を共有し、`type: 's3'` を使います。専用のストレージ種別は不要です。自前のインスタンスでは S3 API endpoint（通常ポート 9000）とパス形式を設定します。

`createBucket` の既定値は `false` で、既存バケットが必要です。`true` では `storage.init()` が HeadBucket を確認し、明示的な 404 の場合のみ作成します。既存バケットとオブジェクトは保持します。権限・ネットワーク・作成・後続の接続確認が失敗すると、失敗結果を返しクライアントを解放して未初期化状態を維持します。同時作成の `BucketAlreadyOwnedByYou` は再度アクセスを確認してから受け入れます。AWS `us-east-1` では LocationConstraint を省略し、他のリージョンでは設定値を渡します。標準の自前 S3 デプロイでは `HAI_STORAGE_CREATEBUCKET=true` を有効にし、外部 S3 は必要な権限に応じて明示的に設定します。

YAML では `createBucket: ${HAI_STORAGE_CREATEBUCKET:false}` で環境変数を参照し、`storage.init()` への直接入力は真偽値を使います。

```ts
const initResult = await storage.init({
  type: 's3',
  endpoint: 'http://localhost:9000',
  bucket: 'my-bucket',
  region: 'us-east-1',
  accessKeyId: process.env.HAI_STORAGE_ACCESSKEYID!,
  secretAccessKey: process.env.HAI_STORAGE_SECRETACCESSKEY!,
  forcePathStyle: true,
  createBucket: true,
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

ローカルの `storage.dir.list()` は `prefix` を key の文字列接頭辞（例：`reports/2026-`）として扱い、UTF-8 バイト順でページ分割します。`maxKeys` は 1–1000 の整数で既定値は 1000、`files` と `commonPrefixes` の合計件数に適用します。`delimiter` は prefix の後で最初に現れる区切りまでを一つの `commonPrefixes` 項目にまとめます。空文字列ではグループ化せず、空の物理ディレクトリーは項目になりません。グループ化と件数の規則は [S3 ListObjectsV2](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html) に基づきます。

後続項目がある場合にだけ `isTruncated: true` と `nextContinuationToken` を返します。ローカルカーソルはプロセス内キャッシュを使わず、正規化したルートディレクトリー、prefix、delimiter に結び付きます。同じルートを使用する別インスタンスや再起動後も継続でき、次ページの `maxKeys` は変更可能です。不正な形式、未対応バージョン、範囲が異なるカーソルは `INVALID_LIST_OPTIONS` になります。カーソルは認可情報でもスナップショットでもありません。prefix の認可は引き続き必要で、同時更新は後続ページに影響し、異なるマウントパスは同じ範囲として扱いません。各リクエストで対象ディレクトリーの走査と整列を行うため、大きな範囲では prefix を絞るか S3 を使用してください。

```ts
let continuationToken: string | undefined
do {
  const page = await storage.dir.list({ prefix: 'reports/2026-', maxKeys: 100, continuationToken })
  if (!page.success)
    return page
  // page.data.files と page.data.commonPrefixes を処理。
  continuationToken = page.data.nextContinuationToken
} while (continuationToken)
```

### エラー処理

```ts
import { HaiStorageError, storage } from '@h-ai/storage'

const result = await storage.file.get('image.png')
if (!result.success && result.error.code === HaiStorageError.NOT_INITIALIZED.code) {
  // 存储未初始化
}
```

主なエラーコード：

| エラーコード                            | code              | 説明                                                         |
| --------------------------------------- | ----------------- | ------------------------------------------------------------ |
| `HaiStorageError.NOT_INITIALIZED`       | `hai:storage:010` | 未初期化                                                     |
| `HaiStorageError.CONNECTION_FAILED`     | `hai:storage:001` | 接続に失敗                                                   |
| `HaiStorageError.OPERATION_FAILED`      | `hai:storage:002` | 操作に失敗                                                   |
| `HaiStorageError.NOT_FOUND`             | `hai:storage:003` | ファイルが存在しない                                         |
| `HaiStorageError.PERMISSION_DENIED`     | `hai:storage:005` | 権限不足                                                     |
| `HaiStorageError.PRESIGN_FAILED`        | `hai:storage:013` | 署名付き URL の生成に失敗                                    |
| `HaiStorageError.UNSUPPORTED_OPERATION` | `hai:storage:018` | Provider が操作をサポートしない（local の署名付き URL など） |
| `HaiStorageError.INVALID_LIST_OPTIONS`  | `hai:storage:019` | ローカル一覧の引数・カーソルが不正、または検索範囲が不一致   |
| `HaiStorageError.CONFIG_ERROR`          | `hai:storage:012` | 設定エラー                                                   |

## 本番の共有状態

本番は共有 S3 または互換サービスを使います。local は開発・明示的テスト用です。オブジェクト認可と読取後更新の条件付きコミットはアプリが担当します。 NODE_ENV または HAI_CORE_ENV が production の場合、初期化成功前に検証します。明示的な HAI_E2E=1/HAI_E2E_MOCK=1 テストのみ除外します。 [状態・並行制御・復旧範囲（中国語）](../../.agents/instructions/distributed-state.md)。

## 入力制約と HTTP 機能

キーは UTF-8 で最大 1024 バイトで、絶対パス、バックスラッシュ、制御文字、ドットセグメントを拒否します。公開 HTTP 一括削除は一度に 1–1000 件です。共通規則はブラウザー対応の `@h-ai/storage/schemas` から参照できます。署名有効期限は整数 1–604800 秒（Node 既定 3600、HTTP 既定 900）。アップロード署名の入力は key/contentType/expiresIn のみで、contentLength/maxSize/metadata/checksum は未対応です。不正入力は HTTP 400、typed client では VALIDATION_FAILED です。FileUpload の制限は選択時の補助であり、実際のオブジェクトはサーバーで検証してください。Node のストリーム/checksum/条件付き書き込みには既定の HTTP エンドポイントがありません。[機能と認可の対応表（中国語）](README.md#存储输入约束与跨端能力)を参照してください。

## ブラウザーアップロードのキャンセル

`uploadWithPresignedUrl(url, data, { onProgress, abortController })` は進捗通知にネイティブXHRを使用し、`onProgress` を省略するとfetchを使用します。事前にキャンセルされた場合は送信しません。準備中・送信中のキャンセル、外部からのXHR abort、通信・タイムアウト、進捗コールバックの例外は一度だけ失敗として確定し、この操作のリスナーを解除します。完了後のキャンセルは古いXHRを操作しません。キャンセルはローカル要求の停止であり、リモートに保存済みのオブジェクトを取り消せません。状態を確認してから、別途認可して削除してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/storage test
```

S3 統合テストには Docker または互換ランタイムが必要です。初期化、ファイル、ディレクトリー、署名付き URL、実際の HTTP アップロード・ダウンロードの同じテストを MinIO と RustFS で実行し、コンテナー起動失敗をスキップしません。

- MinIO：[`ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z`](https://github.com/coollabsio/minio)。上流ソースからビルドしたコミュニティーイメージ。
- RustFS：[`ghcr.io/rustfs/rustfs:1.0.1`](https://github.com/rustfs/rustfs)。公式イメージ。

コンテナーは一時生成したテスト認証情報を使用します。サービスの準備完了後に S3 API でバケットを作成し、最後のリース解放時にコンテナーと匿名ボリュームを削除します。

ソースの JSDoc は[共通規約](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)に従います。公開例は実際の公開入口、内部例は元のモジュールスコープで型検査します。ビルド後に `pnpm check:jsdoc --package storage` を実行してください。例の型検査は実バックエンドの動作検証の代わりにはなりません。

実Chromeの回帰ゲートはChromeを用意し、`HAI_STORAGE_RUN_BROWSER_GATES=1` を設定して `pnpm --filter @h-ai/storage exec vitest run tests/storage-client-browser.test.ts` を実行します。実際のHTTP PUTでネイティブキャンセルとリスナー解放を検証し、ブラウザーがなければ失敗します。

## ライセンス

Apache-2.0
