# @h-ai/storage

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

共通の `storage` 入口で S3 互換ストレージとローカルファイルシステムを操作するオブジェクトストレージモジュールです。

## クイックスタート

### Node.js サーバー

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

## 機能

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

### 操作と入出力

本節の完全な初期化手順を先に実行します。例の業務値はホストが検証・認可し、非同期領域結果は success を確認してから data を読みます。void はデータなし完了、null は不存在、同期ファクトリー/ツールは表の型を直接返します。

#### storage.file

元のキー・バイト/ストリーム・オプションで操作。put/copy/head はメタデータ、get は Buffer、getStream は非同期バイト列、exists は boolean、delete は void、deleteMany は項目別進捗。

| 入口                      | 入力引数                    | 成功結果                                     | 呼出し例                                                                      |
| ------------------------- | --------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| `storage.file.put`        | key, data, options          | `FileMetadata`                               | `await storage.file.put('report.txt', 'text', { contentType: 'text/plain' })` |
| `storage.file.get`        | key, options                | `Buffer<ArrayBufferLike>`                    | `await storage.file.get('report.txt')`                                        |
| `storage.file.getStream`  | key, options                | `AsyncIterable<Uint8Array<ArrayBufferLike>>` | `await storage.file.getStream('report.txt')`                                  |
| `storage.file.head`       | key                         | `FileMetadata`                               | `await storage.file.head('report.txt')`                                       |
| `storage.file.exists`     | key                         | `boolean`                                    | `await storage.file.exists('report.txt')`                                     |
| `storage.file.copy`       | sourceKey, destKey, options | `FileMetadata`                               | `await storage.file.copy('report.txt', 'archive/report.txt')`                 |
| `storage.file.delete`     | key                         | `void`                                       | `await storage.file.delete('report.txt')`                                     |
| `storage.file.deleteMany` | keys                        | `StorageDeleteResult`                        | `await storage.file.deleteMany(['report.txt', 'archive/report.txt'])`         |

#### storage.dir

接頭辞で一覧/削除。list は prefix とページ指定からファイル/継続情報、delete は prefix から void。同時追加は防がない。

| 入口                 | 入力引数 | 成功結果     | 呼出し例                                                      |
| -------------------- | -------- | ------------ | ------------------------------------------------------------- |
| `storage.dir.list`   | options  | `ListResult` | `await storage.dir.list({ prefix: 'reports/', maxKeys: 20 })` |
| `storage.dir.delete` | prefix   | `void`       | `await storage.dir.delete('reports/')`                        |

#### storage.presign

S3 直接転送。キーと期限/応答指定から URL HaiResult、publicUrl は同期 URL/null を返しアクセス権は付与しない。

| 入口                        | 入力引数     | 成功結果         | 呼出し例                                                                                    |
| --------------------------- | ------------ | ---------------- | ------------------------------------------------------------------------------------------- |
| `storage.presign.getUrl`    | key, options | `string`         | `await storage.presign.getUrl('report.txt', { expiresIn: 300 })`                            |
| `storage.presign.putUrl`    | key, options | `string`         | `await storage.presign.putUrl('report.txt', { expiresIn: 300, contentType: 'text/plain' })` |
| `storage.presign.publicUrl` | key          | `string \| null` | `storage.presign.publicUrl('report.txt')`                                                   |

#### storage.checksum

初期化不要の完全性確認。データとアルゴリズム/符号化から摘要、expected との比較は boolean。ストリームは一度消費。

| 入口                        | 入力引数                | 成功結果  | 呼出し例                                               |
| --------------------------- | ----------------------- | --------- | ------------------------------------------------------ |
| `storage.checksum.generate` | data, options           | `string`  | `await storage.checksum.generate('text')`              |
| `storage.checksum.verify`   | data, expected, options | `boolean` | `await storage.checksum.verify(bytes, expectedDigest)` |

- S3 プロトコル（AWS S3 / MinIO / RustFS / OSS など）
- ローカルファイルシステム

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

Local はファイル横の予約ディレクトリ `.hai-storage-meta/` に内容の識別情報と結び付いた世代メタデータを準備し、内容ファイルの原子的公開をコミット点にします。準備失敗時は内容を作成・上書きしません。既定値にも空の記録を保存し、古いオブジェクトの属性を継承しません。公開後の既知の旧世代の削除失敗は診断だけに記録します。並行書き込みやクラッシュで安全な回収を確認できない内部記録が残る場合があり、推測で削除しません。各パス要素で `.meta.json`、`.upload.tmp`、`.hai-storage-meta` を予約します。世代記録が唯一のメタデータ形式で、有効な記録がなければ明示的に失敗します。再構築時は信頼する内容と業務メタデータを `file.put()` で保存します。内容と内部記録を一緒にバックアップし、この形式を迂回した直接書込を混在させないでください。

S3 `file.copy()` はコピー元の各パス要素をエンコードし、日本語・空白・URL 区切り文字をオブジェクトキーの一部として保持します。呼び出し側では事前エンコードせず元の key を渡します。

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

### 本番の共有状態

本番は共有 S3 または互換サービスを使います。local は開発・明示的テスト用です。オブジェクト認可と読取後更新の条件付きコミットはアプリが担当します。 NODE_ENV または HAI_CORE_ENV が production の場合、初期化成功前に検証します。明示的な HAI_E2E=1/HAI_E2E_MOCK=1 テストのみ除外します。 [状態・並行制御・復旧範囲（中国語）](../../.agents/instructions/distributed-state.md).

### 入力制約と HTTP 機能

キーは UTF-8 で最大 1024 バイトで、絶対パス、バックスラッシュ、制御文字、ドットセグメントを拒否します。公開 HTTP 一括削除は一度に 1–1000 件です。共通規則はブラウザー対応の `@h-ai/storage/schemas` から参照できます。署名有効期限は整数 1–604800 秒（Node 既定 3600、HTTP 既定 900）。アップロード署名の入力は key/contentType/expiresIn のみで、contentLength/maxSize/metadata/checksum は未対応です。不正入力は HTTP 400、typed client では VALIDATION_FAILED です。FileUpload の制限は選択時の補助であり、実際のオブジェクトはサーバーで検証してください。Node のストリーム/checksum/条件付き書き込みには既定の HTTP エンドポイントがありません。[機能と認可の対応表（中国語）](README.md#存储输入约束与跨端能力)を参照してください。

### ブラウザーアップロードのキャンセル

`uploadWithPresignedUrl(url, data, { onProgress, abortController })` は進捗通知にネイティブXHRを使用し、`onProgress` を省略するとfetchを使用します。事前にキャンセルされた場合は送信しません。準備中・送信中のキャンセル、外部からのXHR abort、通信・タイムアウト、進捗コールバックの例外は一度だけ失敗として確定し、この操作のリスナーを解除します。完了後のキャンセルは古いXHRを操作しません。キャンセルはローカル要求の停止であり、リモートに保存済みのオブジェクトを取り消せません。状態を確認してから、別途認可して削除してください。

## 設定

ライフサイクル。init にバックエンド/業務設定を渡し成功後に使用します。借用依存先の解放前に close の完了を待ち、正確な戻り値は例と公開署名に従います。

Local は key 内のシンボリックリンクと junction を拒否し、予約拡張子 `.meta.json` / `.upload.tmp` は大文字小文字を区別せず保護します。put 上書きは旧メタデータを置換し、copy は既定で元を継承します。ブラウザー入口にサーバー単一インスタンスは含まれません。

- **S3**：`bucket / region / accessKeyId / secretAccessKey` は必須。`createBucket / endpoint / publicEndpoint / forcePathStyle / prefix / publicUrl` は任意。
- **Local**：`root` は必須。`directoryMode / fileMode` は任意。

MinIO と RustFS は S3 Provider を共有し、`type: 's3'` を使います。専用のストレージ種別は不要です。自前のインスタンスでは S3 API endpoint（通常ポート 9000）とパス形式を設定します。

`createBucket` の既定値は `false` で、既存バケットが必要です。`true` では `storage.init()` が HeadBucket を確認し、明示的な 404 の場合のみ作成します。既存バケットとオブジェクトは保持します。権限・ネットワーク・作成・後続の接続確認が失敗すると、失敗結果を返しクライアントを解放して未初期化状態を維持します。同時作成の `BucketAlreadyOwnedByYou` は再度アクセスを確認してから受け入れます。AWS `us-east-1` では LocationConstraint を省略し、他のリージョンでは設定値を渡します。標準の自前 S3 デプロイでは `HAI_STORAGE_CREATEBUCKET=true` を有効にし、外部 S3 は必要な権限に応じて明示的に設定します。

YAML では `createBucket: ${HAI_STORAGE_CREATEBUCKET:false}` で環境変数を参照し、`storage.init()` への直接入力は真偽値を使います。

`config/_storage.yml` に `prefix: my-app/uploads/` を設定します。`StorageConfigSchema` を登録した Hai アプリでは、`HAI_STORAGE_PREFIX=my-app/uploads/` でも指定できます。`report.pdf` をアップロードすると、オブジェクトキーは `my-app/uploads/report.pdf` になります。起動時の接続確認と既定の一覧取得は、設定値の末尾にスラッシュがなくても `my-app/uploads/` を検索します。空のプレフィックスはバケットのルートを使います。設定を変更しても既存オブジェクトのキーは変わりません。

アプリの認証情報を制限するには、オブジェクト操作の対象を `arn:aws:s3:::my-bucket/my-app/uploads/*` に絞り、`s3:ListBucket` には `s3:prefix` 条件で `my-app/uploads/*` を指定します。作成済みのバケットを使い、`createBucket: false` にすると、作成モードで行われるバケット単位の `HeadBucket` 確認を省けます。

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

### 内部接続とブラウザーからの直接アクセス

`endpoint` はサーバーの CRUD、バケット作成、接続確認に使います。`publicEndpoint` は `presign.getUrl/putUrl` の外部アドレスで既定値はなく、省略時は endpoint を使います。`https://app.example.com/delivery/files` のようなプロキシパスを指定できます。パスには英数字、アンダースコア、ドット、ハイフンを使用でき、`.`/`..`、連続スラッシュ、符号化された区切りは使用できません。バケット、認証情報、クエリ、フラグメントは含めません。`publicUrl` は公開 URL の組み立て用で、私有オブジェクトを認可しません。

自前 Compose の内部接続先は `http://storage:9000` です。上記の外部 URL は `/delivery/files/hai/private/report.zip?...`、パス省略時は `/hai/private/report.zip?...` になります。パス指定時の外部署名はパス形式を使い、内部操作は `forcePathStyle` に従います。Nginx は入口パスだけを除去し、本来の S3 署名パス、クエリ、Host を保持して Storage へ直接転送します。大容量と Range は Serv を経由しません。Fullstack は Web Nginx、SSR/API は gateway を使用します。サイト配下に置けますが API、資源、ヘルスパスとの競合は拒否します。公開設定変更には完全デプロイが必要で、部分更新と復旧は既存設定を保持します。

外部 S3/R2 や既存ゲートウェイには独自の到達可能な端点を使用し、外部/保持対象ストレージにローカル sidecar ルートは生成しません。HTTPS 入口では署名対象 Host、元の URI、クエリを保持します。クロスオリジンでは実際の S3 に適切な CORS を設定してください。ゲートウェイはバケット認可や CORS を代替しません。署名付き URL は短期認証情報として扱い、有効期間とログを管理します。GET 署名は HEAD には使えません。Local は署名 URL に非対応で、非公開ディレクトリを Nginx に公開しません。

自前バケット/リージョンが空の場合はデプロイが hai/us-east-1 を注入します。Storage Schema の既定値ではありません。オブジェクトプロキシは CSP sandbox、nosniff、no-referrer、private,no-store を設定し、同一オリジンの HTML を含む信頼できない添付ファイルを隔離します。ファイル配信用で、実行可能なサイトスクリプトは配信しません。外部 S3/CDN にも同等の分離を設定してください。

#### 操作ログ

Local と S3 は書き込み操作を既定で記録します。読み取りを記録するには `operationLog.read` を有効にします。操作ログは `debug` 固定で、Core のログレベルに従います。操作の失敗時は元のエラーを返し、`warn` を出力します。ダウンロードストリームの読み取り中の失敗も対象です。初期化、接続、終了時の失敗は `error` を出力します。操作名、既知のバイト数、件数などの安全な要約を記録します。署名付き URL のアップロードとダウンロードのヘルパーはブラウザーで失敗を記録します。

```yaml
# config/_storage.yml
type: local
root: ./data/uploads
operationLog:
  read: false # file.get/head/exists, dir.list, presign.getUrl/publicUrl
  write: true # file.put/delete/deleteMany/copy, dir.delete, presign.putUrl
  maxLength: 1000 # 要約の最大文字数、0 の場合は要約を省略
```

```ts
await storage.init({
  type: 'local',
  root: './data/uploads',
  operationLog: {
    read: true,
    write: true,
    maxLength: 500,
  },
})
```

`HAI_STORAGE_OPERATIONLOG_WRITE=false` で書き込み操作の `debug` ログを無効にできます。アップグレード時は `operationLog.level` と `HAI_STORAGE_OPERATIONLOG_LEVEL` を削除し、全体のログレベルを `HAI_CORE_LOGGING_LEVEL` で設定してください。

`storage.file.put()` が失敗した場合は `error.code` と `error.message` を確認します。元のエラーがある場合は `error.cause` に保持します。`ifNoneMatch: '*'` で保存先が既に存在する場合は `ALREADY_EXISTS`、`createReadStream()` などのアップロード元を読み取れない場合は `UPLOAD_FAILED` を返します。キャンセル時は `AbortSignal.reason` を保持します。警告には失敗理由の要約と、取得できるエラーコードや HTTP ステータスが含まれます。

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

設定はホストが読込・検証してから渡します。秘密はサーバーの非公開環境に保存し、利用場面に応じてバックエンド・容量・期限・ログを選びます。変更後は再初期化の結果を確認してください。

[項目別の用途・適用場面・例](../../docs/usage/configuration/data.md).

## エラー処理

領域操作は result.success を確認し、失敗時はモジュールのエラー定義と安全な説明を使います。コード・関連 ID・秘匿した原因をサーバーログに残します。同期ツール・ファクトリー・ストリーム反復・ライフサイクルは各署名に従い、Promise 完了だけで成功と判断しません。回復条件は各機能を参照してください。

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
