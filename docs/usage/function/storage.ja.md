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
import { uploadWithPresignedUrl } from '@h-ai/storage/client'

export async function uploadImage(key: string, file: File) {
  // 用相同的 Content-Type 请求签名和上传。
  const contentType = file.type || 'application/octet-stream'
  // 設定済み API にキーと MIME 型を送ります。成功時はアップロード URL と確定済みキー、失敗時は error です。
  const signed = await apiClient.storage.presignedUrls.createUpload({ key, contentType })
  if (!signed.success)
    throw new Error(signed.error.message)

  // 直接上传到对象存储，成功时返回服务端确认的对象 key。
  // 署名済み URL に元のファイルと署名時の MIME 型で送信します。成功は受付済み、失敗時は error です。
  const uploaded = await uploadWithPresignedUrl(signed.data.url, file, { contentType })
  if (!uploaded.success)
    throw new Error(uploaded.error ?? 'Upload failed')
  return signed.data.key
}
```

<a id="api-reference"></a>

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

モジュールの import は入門例と同じです。開始・終了の例以外は初期化成功後、終了前に実行します。value は HaiResult.success を確認し元エラーを保持します。独立したテストデータと明示した後片付けを使います。

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

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
// ./data/files-demo をローカル保存先にします。成功後にファイルを利用でき、失敗は value が例外にします。
value(await storage.init({ type: 'local', root: './data/files-demo' }))
// 引数なしでローカル接続を解放します。成功時の data はなく、ファイルは残ります。失敗は value が例外にします。
value(await storage.close()) // undefined; saved files remain on disk
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
| `storage.file.head` | メタデータを取得 | key | `FileMetadata` | `await storage.file.head('report.txt')` |
| `storage.file.exists` | ファイルの存在確認 | key | `boolean` | `await storage.file.exists('report.txt')` |
| `storage.file.copy` | 別キーにコピー | sourceKey, destKey, options | `FileMetadata` | `await storage.file.copy('report.txt', 'backup/report.txt')` |
| `storage.file.delete` | ファイルを削除 | key | `void` | `await storage.file.delete('report.txt')` |
| `storage.file.deleteMany` | 一括削除し個別の進捗を報告 | keys | `StorageDeleteResult` | `await storage.file.deleteMany(['a.txt', 'b.txt'])` |

#### 利用例：ファイルの読み書きとコピー

```ts
// レポートキーに hello をテキストとして保存します。成功時のサイズは 5 バイト、失敗は value が例外にします。
const saved = value(await storage.file.put('demo/report.txt', 'hello', { contentType: 'text/plain' }))
// saved describes key demo/report.txt, size 5 and backend timestamps
// 保存直後のレポートを確認します。結果は true、失敗は value が例外にします。
value(await storage.file.exists('demo/report.txt')) // true
// レポートキーのメタデータを読み、同じキーと 5 バイトのサイズを得ます。失敗は value が例外にします。
const metadata = value(await storage.file.head('demo/report.txt')) // same key and size
// レポートキーから全バイトを読み、UTF-8 の hello に変換します。失敗は value が例外にします。
value(await storage.file.get('demo/report.txt')).toString('utf8') // 'hello'
// レポートキーのバイトストリームを開きます。開始失敗は value が例外にし、後続の I/O は反復時に例外になる場合があります。
const stream = value(await storage.file.getStream('demo/report.txt'))
let byteCount = 0
for await (const bytes of stream)
  byteCount += bytes.byteLength
// byteCount === 5; stream iteration can throw on later I/O failure
// レポートを demo/copy.txt に複製し、新しいメタデータを返します。失敗は value が例外にします。
value(await storage.file.copy('demo/report.txt', 'demo/copy.txt')) // metadata for the new key
// 元のレポートキーを削除します。成功時の data はなく、失敗は value が例外にします。
value(await storage.file.delete('demo/report.txt')) // undefined
// コピーキーの配列を渡します。成功時は削除集計、部分失敗時は進捗付きエラーを value が例外にします。
const deleted = value(await storage.file.deleteMany(['demo/copy.txt'])) // per-key deletion progress
// コピーキーの削除を確認します。再作成されていなければ false、失敗は value が例外にします。
value(await storage.file.exists('demo/copy.txt')) // false after confirmed deletion
```

UTF-8 の hello は 5 バイトです。ストリームの分割数は不定で、読み出し中に失敗することもあります。一括削除は完了した Promise だけでなく、各キーの確認結果を調べてください。

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
// 例のプレフィックスに 1 バイトを書きます。成功時はメタデータ、失敗は value が例外にします。
value(await storage.file.put('demo-prefix/a.txt', 'a'))
// demo-prefix/ の最大 20 件を取得します。ページに a.txt が含まれ、失敗は value が例外にします。
const page = value(await storage.dir.list({ prefix: 'demo-prefix/', maxKeys: 20 }))
// page contains metadata for demo-prefix/a.txt and backend pagination information
// このプレフィックス下のオブジェクトを削除します。成功時の data はなく、部分失敗は value が例外にします。
value(await storage.dir.delete('demo-prefix/')) // undefined
// 元のキーで削除を確認します。再作成されていなければ false、照会失敗は value が例外にします。
value(await storage.file.exists('demo-prefix/a.txt')) // false when no concurrent writer recreates it
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

URL の返却時点ではファイルは未転送です。ブラウザーが保存先に接続し、署名・期限の検証後に転送します。アップロードの Content-Type は署名時の値と一致させます。publicUrl は設定済みの公開アドレスを計算するだけです。

```ts
// Requires initialized S3 storage and prior application authorization.
// レポートキーと text/plain で 300 秒のアップロード URL を発行します。成功時は URL、失敗は value が例外にします。
const uploadUrl = value(await storage.presign.putUrl('reports/demo.txt', { expiresIn: 300, contentType: 'text/plain' }))
// 同じレポートに 300 秒のダウンロード URL を発行します。成功時は URL、失敗は value が例外にします。
const downloadUrl = value(await storage.presign.getUrl('reports/demo.txt', { expiresIn: 300 }))
// レポートキーと公開 URL 設定から URL を求めます。公開先がなければ null です。
const publicUrl = storage.presign.publicUrl('reports/demo.txt') // string or null
```

同じキーと 300 秒を入力します。ホスト名と署名は実環境によります。アップロードの Content-Type は署名時と合わせます。publicUrl は公開 URL の規則を適用するだけで、権限確認や公開設定の変更はしません。

#### 利用例：認可後のダウンロード URL 発行

コード引数を扱うため設定手冊から移動しました。完全な手順は現在[中国語](storage.md#download-authorization)にあり、この節は部分翻訳です。

[引数と手順の詳細](storage.md#signed-urls)

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
// hello のバイト列から既定の SHA-256 ダイジェストを作ります。失敗は value が例外にします。
const digest = value(await storage.checksum.generate('hello'))
// 同じバイト列と生成済みダイジェストを照合します。成功時は true、処理失敗は value が例外にします。
value(await storage.checksum.verify('hello', digest)) // true
// 変更後のバイト列を元のダイジェストと照合します。成功時は false、処理失敗は value が例外にします。
value(await storage.checksum.verify('changed', digest)) // false
```

同じ hello のバイト列は true、変更後は false です。チェックサムは認証情報ではなく、S3 の ETag とも同一ではありません。

[引数と手順の詳細](storage.md#checksums)

<a id="browser-files"></a>

### ブラウザのアップロード・保存：クライアント補助

サーバー認可済み URL や選択ファイルを扱います。Storage のサーバー初期化や業務認可は行いません。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `uploadWithPresignedUrl` | バイトを送信 | `url, File/Blob/ArrayBuffer/string, options?` | `Promise<{ success: boolean; error?: string }>` | `await uploadWithPresignedUrl(url, file, { contentType: file.type })` |
| `downloadWithPresignedUrl` | Blob を取得 | `url, options?` | `Promise<{ success: boolean; data?: Blob; error?: string }>` | `await downloadWithPresignedUrl(url)` |
| `downloadAndSave` | ダウンロードして保存 | `url, { filename?, ...options }?` | `Promise<{ success: boolean; data?: Blob; error?: string }>` | `await downloadAndSave(url, { filename: "report.txt" })` |
| `getFileExtension` | 拡張子を取得 | `File` | `string` | `getFileExtension(file)` |
| `getMimeType` | MIME 型を取得 | `extension: string` | `string` | `getMimeType("txt")` |
| `formatFileSize` | バイト数を整形 | `bytes: number` | `string` | `formatFileSize(1024)` |

#### 利用例：選択ファイルの送信とダウンロード保存

二つの URL は署名 API の成功結果、file は選択されたファイルです。ユーザー操作で呼び出します。転送結果は HaiResult とは別の success/error 形式です。

```ts
import { downloadAndSave, downloadWithPresignedUrl, formatFileSize, getFileExtension, getMimeType, uploadWithPresignedUrl } from '@h-ai/storage/client'

async function transfer(file: File, uploadUrl: string, downloadUrl: string) {
  // 呼び出し元のファイル名から拡張子を取得します。なければ空文字列です。
  const extension = getFileExtension(file)
  // file.type が空なら拡張子から MIME 型を取得します。不明な場合は application/octet-stream です。
  const contentType = file.type || getMimeType(extension)
  // バイト数を表示用文字列にします。例えば 1024 バイトは 1 KB です。
  const displayedSize = formatFileSize(file.size) // 1024 bytes displays as 1 KB
  // 渡された URL に元のファイルと MIME 型でアップロードします。成功は完了、失敗時は error です。
  const uploaded = await uploadWithPresignedUrl(uploadUrl, file, { contentType })
  if (!uploaded.success)
    throw new Error(uploaded.error ?? 'Upload failed')
  // 署名済みダウンロード URL から取得します。成功時の data は Blob、失敗時は error です。
  const downloaded = await downloadWithPresignedUrl(downloadUrl)
  if (!downloaded.success || !downloaded.data)
    throw new Error(downloaded.error ?? 'Download failed')
  // 同じ URL と元のファイル名でブラウザーの保存を開始します。失敗時は error です。
  const saved = await downloadAndSave(downloadUrl, { filename: file.name })
  if (!saved.success)
    throw new Error(saved.error ?? 'Save failed')
  return { extension, displayedSize, blob: downloaded.data }
}
```
