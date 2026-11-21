# @h-ai/storage API リファレンス

<!-- translation: partial -->

[原文（中国語）](storage.md) · [設定](../configuration/storage.ja.md) · [データ構造](../data/storage.ja.md)

<a id="quick-start"></a>

## クイックスタート

Storage を初期化してファイル API でオブジェクトを操作します。署名付き URL の発行前にキーへのアクセスを確認します。大きなダウンロードにはストリームを使います。

```ts
import type { FileMetadata, StorageConfigInput } from '@h-ai/storage'
import type { Buffer } from 'node:buffer'
import { storage } from '@h-ai/storage'

export async function storeImage(config: StorageConfigInput, imageBuffer: Uint8Array) {
  // 选择一个后端，检查初始化结果。
  // 呼び出し元の設定で接続します。成功時は data がなく、失敗時は error を確認します。
  const initialized = await storage.init(config)
  if (!initialized.success)
    throw new Error(initialized.error.message)

  let result: { metadata: FileMetadata, bytes: Buffer, downloadUrl?: string }
  let closed
  try {
    const key = 'uploads/image.png'
    // 用对象 key 写入 PNG 字节，成功时返回对象元数据。
    // 指定キーに呼び出し元の PNG バイトを書きます。成功時はメタデータ、失敗時は error です。
    const uploaded = await storage.file.put(key, imageBuffer, { contentType: 'image/png' })
    if (!uploaded.success)
      throw new Error(uploaded.error.message)

    // 用同一 key 读取对象内容，成功时返回 Buffer。
    // 同じキーから PNG を読みます。成功時は Buffer、未検出や読取失敗はエラーです。
    const downloaded = await storage.file.get(key)
    if (!downloaded.success)
      throw new Error(downloaded.error.message)

    result = { metadata: uploaded.data, bytes: downloaded.data }
    if (config.type === 's3') {
      // S3 可签发有效期为 3600 秒的下载 URL。
      // 同じ S3 キーに 3600 秒のダウンロード URL を発行します。成功時は URL 文字列、失敗時は error です。
      const signed = await storage.presign.getUrl(key, { expiresIn: 3600 })
      if (!signed.success)
        throw new Error(signed.error.message)
      result.downloadUrl = signed.data
    }
  }
  finally {
    // 释放本次连接，失败时交由调用方处理。
    // 引数なしで接続を解放します。成功時の data は undefined、失敗は後続で判定します。
    closed = await storage.close()
  }
  if (!closed.success)
    throw new Error(closed.error.message)
  return result
}
```

```ts
import { apiClient } from '@h-ai/api-client'
import { storage } from '@h-ai/storage/client'

export async function uploadImage(key: string, file: File) {
  // 用相同的 Content-Type 请求签名和上传。
  const contentType = file.type || 'application/octet-stream'
  // 設定済み API にキーと MIME 型を送ります。成功時はアップロード URL と確定済みキー、失敗時は error です。
  const signed = await apiClient.storage.presignedUrls.createUpload({ key, contentType })
  if (!signed.success)
    throw new Error(signed.error.message)

  // 直接上传到对象存储，成功时返回服务端确认的对象 key。
  // 署名済み URL に元のファイルと署名時の MIME 型で送信します。成功は受付済み、失敗時は error です。
  const uploaded = await storage.client.uploadWithPresignedUrl(signed.data.url, file, { contentType })
  if (!uploaded.success)
    throw new Error(uploaded.error ?? 'Upload failed')
  return signed.data.key
}
```

<a id="api-reference"></a>

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

モジュールの import は入門例と同じです。サーバーのファイル、ディレクトリー、署名操作は初期化成功後、終了前に実行します。`storage.checksum` と `storage.client` は初期化不要です。HaiResult を返す呼び出しでは success を確認し、失敗時は元の結果を返して、成功時だけ data を読みます。関数宣言のない例はアプリの非同期業務関数内の断片です。独立したテストデータと明示した後片付けを使います。

<a id="connection"></a>

### 接続と終了：`storage`

ローカルと S3 は同じファイル API を使います。接続の開始・終了はアプリが管理します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `storage.init` | 指定のストレージを開く | `config`（必填） | `void` | `await storage.init(config)` |
| `storage.close` | 新規処理を止めてバックエンドを解放 | 已保存的文件仍由原后端持有；无 | `void` | `await storage.close()` |

#### 利用例：接続と終了

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// ./data/files-demo をローカル保存先にします。成功後にファイルを利用でき、失敗は 元の失敗結果を返します。
const initResult = await storage.init({ type: 'local', root: './data/files-demo' })
if (!initResult.success)
  return initResult
// 引数なしでローカル接続を解放します。成功時の data はなく、ファイルは残ります。失敗は 元の失敗結果を返します。
const closeResult = await storage.close()
if (!closeResult.success)
  return closeResult
// saved files remain on disk
```

開発用ディレクトリを入力します。close はインスタンスを解放しますがファイルを削除しません。続行前に再初期化してください。

別の結果型である場合を除き、出力は成功時の HaiResult.data です。publicUrl は同期です。

取得したストリームは読み切るか中止します。一括削除失敗時は再試行の前に error.ext.deleteMany を確認してください。結果が不明でも削除済みの場合があります。

未翻訳：ストリーム整合性、一括削除の復旧、外部アップロードの手順。[中国語の該当節](storage.md#api-reference)を参照してください。

<a id="download-authorization"></a>

[引数と手順の詳細](storage.md#connection)

<a id="files"></a>

### ファイルの読み書きとコピー：`storage.file`

オブジェクトキーでファイルを指定します。本文・メタデータ・ストリームを使い分け、一括削除では各項目の進捗を確認します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `storage.file.put` | 内容とメタデータを保存 | key, data, options | `FileMetadata` | `await storage.file.put('report.txt', 'Hello')` |
| `storage.file.get` | ファイル全体を取得 | key, options | `Buffer` | `await storage.file.get('report.txt')` |
| `storage.file.getStream` | ストリームで取得 | key, options | `AsyncIterable<Uint8Array>` | `await storage.file.getStream('report.txt')` |
| `storage.file.getStreamWithMetadata` | オブジェクト全体とメタデータを一度に開く | オブジェクトキー、任意の `{ signal }` | `StorageFileRead`、またはオープン時のエラー | `await storage.file.getStreamWithMetadata('report.txt')` |
| `storage.file.head` | メタデータを取得 | key | `FileMetadata` | `await storage.file.head('report.txt')` |
| `storage.file.exists` | ファイルの存在確認 | key | `boolean` | `await storage.file.exists('report.txt')` |
| `storage.file.copy` | 別キーにコピー | sourceKey, destKey, options | `FileMetadata` | `await storage.file.copy('report.txt', 'backup/report.txt')` |
| `storage.file.delete` | ファイルを削除 | key | `void` | `await storage.file.delete('report.txt')` |
| `storage.file.deleteMany` | 一括削除し個別の進捗を報告 | keys | `StorageDeleteResult` | `await storage.file.deleteMany(['a.txt', 'b.txt'])` |

#### 利用例：ファイルの読み書きとコピー

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// レポートキーに hello をテキストとして保存します。成功時のサイズは 5 バイト、失敗は 元の失敗結果を返します。
const savedResult = await storage.file.put('demo/report.txt', 'hello', { contentType: 'text/plain' })
if (!savedResult.success)
  return savedResult
const saved = savedResult.data
// saved のキーは demo/report.txt、サイズは 5 バイトです。
// 保存直後のレポートを確認します。結果は true、失敗は 元の失敗結果を返します。
const existsResult = await storage.file.exists('demo/report.txt')
if (!existsResult.success)
  return existsResult
existsResult.data // true
// レポートキーのメタデータを読み、同じキーと 5 バイトのサイズを得ます。失敗は 元の失敗結果を返します。
const metadataResult = await storage.file.head('demo/report.txt')
if (!metadataResult.success)
  return metadataResult
const metadata = metadataResult.data // same key and size
// レポートキーから全バイトを読み、UTF-8 の hello に変換します。失敗は 元の失敗結果を返します。
const getResult = await storage.file.get('demo/report.txt')
if (!getResult.success)
  return getResult
getResult.data.toString('utf8') // 'hello'
// レポートキーのバイトストリームを開きます。開始失敗時は元の失敗結果を返します。後続の I/O は反復時に例外になる場合があります。
const streamResult = await storage.file.getStream('demo/report.txt')
if (!streamResult.success)
  return streamResult
const stream = streamResult.data
let byteCount = 0
for await (const bytes of stream)
  byteCount += bytes.byteLength
// byteCount === 5; stream iteration can throw on later I/O failure
// レポートの本文と MIME タイプを一度に開きます。失敗は 元の失敗結果を返します。
const openedResult = await storage.file.getStreamWithMetadata('demo/report.txt')
if (!openedResult.success)
  return openedResult
const opened = openedResult.data
try {
  if (opened.metadata.contentType === 'text/plain') {
    // 合計 5 バイトを読み取ります。I/O の失敗は反復時に例外になります。
    for await (const bytes of opened.stream) void bytes.byteLength
  }
} finally {
  // MIME タイプの確認に失敗した場合も、ハンドルまたは接続を解放します。
  await opened.close()
}
// レポートを demo/copy.txt に複製し、新しいメタデータを返します。失敗は 元の失敗結果を返します。
const copyResult = await storage.file.copy('demo/report.txt', 'demo/copy.txt')
if (!copyResult.success)
  return copyResult
copyResult.data // metadata for the new key
// 元のレポートキーを削除します。成功時の data はなく、失敗は 元の失敗結果を返します。
const deleteResult = await storage.file.delete('demo/report.txt')
if (!deleteResult.success)
  return deleteResult
// コピーキーの配列を渡します。成功時は削除集計、部分失敗時は進捗付きエラーを 元の失敗結果を返します。
const deletedResult = await storage.file.deleteMany(['demo/copy.txt'])
if (!deletedResult.success)
  return deletedResult
const deleted = deletedResult.data // per-key deletion progress
// コピーキーの削除を確認します。再作成されていなければ false、失敗は 元の失敗結果を返します。
const existsResult2 = await storage.file.exists('demo/copy.txt')
if (!existsResult2.success)
  return existsResult2
existsResult2.data // false after confirmed deletion
```

UTF-8 の hello は 5 バイトです。ストリームの分割数は不定で、読み出し中に失敗することもあります。一括削除は完了した Promise だけでなく、各キーの確認結果を調べてください。

S3 の `file.put()` は、その書き込みのバイト数と指定したメタデータに加え、サービスが返した ETag を返します。コンテンツ型を省略した場合、結果は `application/octet-stream` です。`lastModified` はアプリが成功応答を受け取った時刻です。現在そのキーにあるオブジェクトとサービス上の更新日時は `file.head()` で取得します。

`file.getStreamWithMetadata()` はオブジェクト全体を開きます。S3 は一回の GET 応答からヘッダーと本文を取得します。Local は同じファイルハンドルから本文を読み、そのファイルに対応するメタデータを取得します。Local のオブジェクトには有効なレコードが必要です。未読や途中で停止したストリームは `close()` で解放できます。`signal` で読み取りを取り消すこともできます。

ダウンロードを中断する場合は、最初のチャンクを読み取る前でも、シグナルを中断するかイテレーターの `return()` を呼び出して接続を解放します。コピーで `contentType` または `metadata` の片方だけを指定すると、もう片方はコピー元から引き継がれます。S3 で上書き項目を指定すると、変更の適用前にコピー元の ETag を検証します。検証に失敗した場合は、コピー元を読み直してから再試行してください。

Local ストレージでは、`file.head()` と `file.copy()` がファイルの識別情報に対応するメタデータを必要とします。移行時はファイルの内容とメタデータを取得し、移行先に `file.put()` で書き込みます。[ローカルストレージのバックアップと復元](../data/storage.ja.md)

[引数と手順の詳細](storage.md#files)

<a id="directories"></a>

### 接頭辞による一覧と削除：`storage.dir`

ディレクトリはキーの接頭辞です。分割取得し、削除前に対象範囲全体の権限を確認します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `storage.dir.list` | プレフィックス内をページ取得 | options | `ListResult` | `await storage.dir.list({ prefix: 'backup/' })` |
| `storage.dir.delete` | プレフィックス内を削除 | prefix | `void` | `await storage.dir.delete('backup/')` |

`storage.dir.delete(prefix)` はキーの文字列プレフィックスに一致するオブジェクトをページ単位で削除します。たとえば `reports/draft-` は `reports/draft-1.txt` に、`reports/` はそのパス配下のキーに一致します。空のプレフィックスはコンテナ内の全オブジェクトに一致します。

#### 利用例：接頭辞による一覧と削除

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// 例のプレフィックスに 1 バイトを書きます。成功時はメタデータ、失敗は 元の失敗結果を返します。
const putResult = await storage.file.put('demo-prefix/a.txt', 'a')
if (!putResult.success)
  return putResult
putResult.data
// demo-prefix/ の最大 20 件を取得します。ページに a.txt が含まれ、失敗は 元の失敗結果を返します。
const pageResult = await storage.dir.list({ prefix: 'demo-prefix/', maxKeys: 20 })
if (!pageResult.success)
  return pageResult
const page = pageResult.data
// page contains metadata for demo-prefix/a.txt and backend pagination information
// このプレフィックス下のオブジェクトを削除します。成功時の data はなく、部分失敗は 元の失敗結果を返します。
const deleteResult = await storage.dir.delete('demo-prefix/')
if (!deleteResult.success)
  return deleteResult
// 元のキーで削除を確認します。再作成されていなければ false、照会失敗は 元の失敗結果を返します。
const existsResult = await storage.file.exists('demo-prefix/a.txt')
if (!existsResult.success)
  return existsResult
existsResult.data // false when no concurrent writer recreates it
```

demo-prefix/ に限定します。一覧はメタデータと継続情報を返します。並行アップロードとは同一トランザクションではないため、削除後に再作成される場合があります。

[引数と手順の詳細](storage.md#directories)

<a id="signed-urls"></a>

### 直接転送用 URL の発行：`storage.presign`

S3 の期限付き URL は特定のキーと操作に対応します。発行前に対象と操作の権限を確認します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `storage.presign.getUrl` | 期限付きダウンロード URL を発行 | key, options | `string` | `await storage.presign.getUrl('report.txt')` |
| `storage.presign.putUrl` | 期限付きアップロード URL を発行 | key, options | `string` | `await storage.presign.putUrl('report.txt')` |
| `storage.presign.publicUrl` | 設定済み公開 URL を取得 | key | `string or null` | `storage.presign.publicUrl('report.txt')` |

#### 利用例：直接転送用 URL の発行

署名付き URL では認可とファイル転送を分けます。初期化済み S3 と、アプリで認可したオブジェクトキーが必要です。

![非公開ファイル：認可後に直接転送](../images/function-storage-presign.ja.svg)

URL を受け取ったブラウザーがオブジェクトストレージに接続し、署名と期限の検証後にファイルを転送します。PUT 署名には `Content-Type` ヘッダーが含まれます。アップロード時に署名時の値を送信してください。署名時に `contentType` を省略した場合は `application/octet-stream` を送信します。`publicUrl()` はキーをパスの区切りごとにエンコードして、設定済みの公開アドレスに追加します。

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// Requires initialized S3 storage and prior application authorization.
// レポートキーと text/plain で 300 秒のアップロード URL を発行します。成功時は URL、失敗は 元の失敗結果を返します。
const uploadUrlResult = await storage.presign.putUrl('reports/demo.txt', { expiresIn: 300, contentType: 'text/plain' })
if (!uploadUrlResult.success)
  return uploadUrlResult
const uploadUrl = uploadUrlResult.data
// 同じレポートに 300 秒のダウンロード URL を発行します。成功時は URL、失敗は 元の失敗結果を返します。
const downloadUrlResult = await storage.presign.getUrl('reports/demo.txt', { expiresIn: 300 })
if (!downloadUrlResult.success)
  return downloadUrlResult
const downloadUrl = downloadUrlResult.data
// レポートキーと公開 URL 設定から URL を求めます。公開先がなければ null です。
const publicUrl = storage.presign.publicUrl('reports/demo.txt') // string or null
```

同じキーと 300 秒を入力します。ホスト名と署名は実環境によります。アップロードの Content-Type は署名時と合わせます。publicUrl は公開 URL の規則を適用するだけで、権限確認や公開設定の変更はしません。

#### 利用例：認可後のダウンロード URL 発行

コード引数を扱うため設定手冊から移動しました。完全な手順は現在[中国語](storage.md#download-authorization)にあり、この節は部分翻訳です。

[引数と手順の詳細](storage.md#signed-urls)

<a id="cancel-upload"></a>

#### アップロードのキャンセルと戻り値

`storage.client.uploadWithPresignedUrl()` に `abortController` を渡し、ユーザーがキャンセルしたら `abort()` を呼びます。`onProgress` を指定するとネイティブ XHR、省略すると fetch を使います。キャンセルはローカルのリクエストを止めますが、保存済みのリモートオブジェクトを取り消しません。

`signed.url` はアプリの認可 API から取得し、`signed.contentType` は署名時と同じ値にします。`controls` はページにあるキャンセルボタン、進捗バー、状態表示の要素です。

```ts
import { storage } from '@h-ai/storage/client'

export async function uploadFile(
  file: File,
  signed: { url: string, contentType: string },
  controls: { cancel: HTMLButtonElement, progress: HTMLProgressElement, status: HTMLElement },
) {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  controls.cancel.type = 'button'
  controls.cancel.disabled = false
  controls.progress.max = 100
  controls.progress.value = 0
  controls.status.textContent = 'アップロード中'
  controls.cancel.addEventListener('click', cancel)

  try {
    const result = await storage.client.uploadWithPresignedUrl(signed.url, file, {
      contentType: signed.contentType,
      abortController: controller,
      onProgress: ({ percent }) => { controls.progress.value = percent },
    })
    if (!result.success) {
      // キャンセルもこの分岐に入り、error は現在の言語で失敗理由を返します。
      controls.status.textContent = result.error ?? 'アップロードに失敗しました'
      return result
    }
    controls.status.textContent = 'アップロード完了'
    return result
  }
  finally {
    controls.cancel.removeEventListener('click', cancel)
    controls.cancel.disabled = true
  }
}
```

アップロード中にキャンセルすると `success: false` と、現在の言語のキャンセルメッセージを持つ `error` が返ります。完了時は `success: true` です。ネットワーク障害も失敗になるため、すべての失敗をキャンセルと判断せず、`success` を確認して `error` を表示します。どの結果でもボタンのリスナーを解除します。キャンセル後も、オブジェクトがすでに保存されたかを業務サービスで確認してください。

<a id="checksums"></a>

### バイト列の整合性確認：`storage.checksum`

Node は大きなメモリー入力のダイジェストを容量制限付き Worker プールで計算します。ストリームを分割して読み込み、呼び出し側のキャンセルシグナルに従います。

チェックサムはストレージの初期化なしで使えます。両側で同じアルゴリズムと文字列表現を選びます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `storage.checksum.generate` | 内容のチェックサムを計算 | data, options | `string` | `await storage.checksum.generate('Hello')` |
| `storage.checksum.verify` | チェックサムを検証 | data, expected, options | `boolean` | `await storage.checksum.verify('Hello', expected)` |

#### 利用例：バイト列の整合性確認

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// hello のバイト列から既定の SHA-256 ダイジェストを作ります。失敗は 元の失敗結果を返します。
const digestResult = await storage.checksum.generate('hello')
if (!digestResult.success)
  return digestResult
const digest = digestResult.data
// 同じバイト列と生成済みダイジェストを照合します。成功時は true、処理失敗は 元の失敗結果を返します。
const verifyResult = await storage.checksum.verify('hello', digest)
if (!verifyResult.success)
  return verifyResult
verifyResult.data // true
// 変更後のバイト列を元のダイジェストと照合します。成功時は false、処理失敗は 元の失敗結果を返します。
const verifyResult2 = await storage.checksum.verify('changed', digest)
if (!verifyResult2.success)
  return verifyResult2
verifyResult2.data // false
```

同じ hello のバイト列は true、変更後は false です。チェックサムは認証情報ではなく、S3 の ETag とも同一ではありません。

[引数と手順の詳細](storage.md#checksums)

<a id="browser-files"></a>

### ブラウザのアップロード・保存：`storage.client`

`storage.client` はサーバー認可済み URL や選択ファイルを扱い、`storage.init()` は不要です。業務上のアクセス権を付与する機能はありません。Node のルート入口、Browser 条件入口、`@h-ai/storage/client` は同じ `storage.client.xxx` で呼び出します。ブラウザー入口はサーバーのファイル、ディレクトリー、署名、ライフサイクル操作を提供しません。

`ClientOperations` は以下の六つのメソッドを定義します。アップロードは `ClientUploadOptions`、進捗コールバックは `UploadProgress`、ダウンロードと保存は `ClientDownloadOptions` を使います。これらの型は `@h-ai/storage/client` から import できます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `storage.client.uploadWithPresignedUrl` | バイトを送信 | `url, File/Blob/ArrayBuffer/string, options?` | `Promise<{ success: boolean; error?: string }>` | `await storage.client.uploadWithPresignedUrl(url, file, { contentType: file.type })` |
| `storage.client.downloadWithPresignedUrl` | Blob を取得 | `url, options?` | `Promise<{ success: boolean; data?: Blob; error?: string }>` | `await storage.client.downloadWithPresignedUrl(url)` |
| `storage.client.downloadAndSave` | ダウンロードして保存 | `url, { filename?, ...options }?` | `Promise<{ success: boolean; error?: string }>` | `await storage.client.downloadAndSave(url, { filename: "report.txt" })` |
| `storage.client.getFileExtension` | 拡張子を取得 | `File` | `string` | `storage.client.getFileExtension(file)` |
| `storage.client.getMimeType` | MIME 型を取得 | `extension: string` | `string` | `storage.client.getMimeType("txt")` |
| `storage.client.formatFileSize` | バイト数を整形 | `bytes: number` | `string` | `storage.client.formatFileSize(1024)` |

#### 利用例：選択ファイルの送信とダウンロード保存

二つの URL は署名 API の成功結果、file は選択されたファイルです。ユーザー操作で呼び出します。転送結果は HaiResult とは別の success/error 形式です。

```ts
import { storage } from '@h-ai/storage/client'

async function transfer(file: File, uploadUrl: string, downloadUrl: string) {
  // 呼び出し元のファイル名から拡張子を取得します。なければ空文字列です。
  const extension = storage.client.getFileExtension(file)
  // file.type が空なら拡張子から MIME 型を取得します。不明な場合は application/octet-stream です。
  const contentType = file.type || storage.client.getMimeType(extension)
  // バイト数を表示用文字列にします。例えば 1024 バイトは 1.00 KB です。
  const displayedSize = storage.client.formatFileSize(file.size)
  // 渡された URL に元のファイルと MIME 型でアップロードします。成功は完了、失敗時は error です。
  const uploaded = await storage.client.uploadWithPresignedUrl(uploadUrl, file, { contentType })
  if (!uploaded.success)
    throw new Error(uploaded.error ?? 'Upload failed')
  // 署名済みダウンロード URL から取得します。成功時の data は Blob、失敗時は error です。
  const downloaded = await storage.client.downloadWithPresignedUrl(downloadUrl)
  if (!downloaded.success || !downloaded.data)
    throw new Error(downloaded.error ?? 'Download failed')
  // 同じ URL と元のファイル名でブラウザーの保存を開始します。失敗時は error です。
  const saved = await storage.client.downloadAndSave(downloadUrl, { filename: file.name })
  if (!saved.success)
    throw new Error(saved.error ?? 'Save failed')
  return { extension, displayedSize, blob: downloaded.data }
}
```
