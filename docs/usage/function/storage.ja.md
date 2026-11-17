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
  const initialized = await storage.init(config)
  if (!initialized.success)
    throw new Error(initialized.error.message)

  let result: { metadata: FileMetadata, bytes: Buffer, downloadUrl?: string }
  let closed
  try {
    const key = 'uploads/image.png'
    // 用对象 key 写入 PNG 字节，成功时返回对象元数据。
    const uploaded = await storage.file.put(key, imageBuffer, { contentType: 'image/png' })
    if (!uploaded.success)
      throw new Error(uploaded.error.message)

    // 用同一 key 读取对象内容，成功时返回 Buffer。
    const downloaded = await storage.file.get(key)
    if (!downloaded.success)
      throw new Error(downloaded.error.message)

    result = { metadata: uploaded.data, bytes: downloaded.data }
    if (config.type === 's3') {
      // S3 可签发有效期为 3600 秒的下载 URL。
      const signed = await storage.presign.getUrl(key, { expiresIn: 3600 })
      if (!signed.success)
        throw new Error(signed.error.message)
      result.downloadUrl = signed.data
    }
  }
  finally {
    // 释放本次连接，失败时交由调用方处理。
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
  const signed = await apiClient.storage.presignedUrls.createUpload({ key, contentType })
  if (!signed.success)
    throw new Error(signed.error.message)

  // 直接上传到对象存储，成功时返回服务端确认的对象 key。
  const uploaded = await uploadWithPresignedUrl(signed.data.url, file, { contentType })
  if (!uploaded.success)
    throw new Error(uploaded.error ?? 'Upload failed')
  return signed.data.key
}
```

<a id="api-reference"></a>

## API 一覧

別の結果型である場合を除き、出力は成功時の HaiResult.data です。publicUrl は同期です。

| API | 用途 | 入力と既定値 | 出力 | 例 |
| --- | --- | --- | --- | --- |
| `storage.init` | 指定のストレージを開く | `config` | `void` | `await storage.init(config)` |
| `storage.close` | 新規処理を止めてバックエンドを解放 | なし | `void` | `await storage.close()` |
| `storage.file.put` | バイト列と任意のメタデータを保存 | `key, data, options?` | `FileMetadata` | `await storage.file.put('report.txt', 'Hello')` |
| `storage.file.get` | オブジェクトのバイト列をバッファで取得 | `key, options?` | `Buffer` | `await storage.file.get('report.txt')` |
| `storage.file.getStream` | バイト列をストリームで読む。取得後の反復中にも失敗することがある | `key, options?` | `AsyncIterable<Uint8Array>` | `await storage.file.getStream('report.txt')` |
| `storage.file.head` | 本文をダウンロードせずメタデータを取得 | `key` | `FileMetadata` | `await storage.file.head('report.txt')` |
| `storage.file.exists` | キーの存在を確認 | `key` | `boolean` | `await storage.file.exists('report.txt')` |
| `storage.file.delete` | 指定のオブジェクトを一件削除 | `key` | `void` | `await storage.file.delete('report.txt')` |
| `storage.file.deleteMany` | 複数キーを削除し、失敗時も進捗を保持 | `keys` | `StorageDeleteResult` | `await storage.file.deleteMany(['a.txt', 'b.txt'])` |
| `storage.file.copy` | 元のオブジェクトを別のキーにコピー | `sourceKey, destKey, options?` | `FileMetadata` | `await storage.file.copy('report.txt', 'backup/report.txt')` |
| `storage.dir.list` | 必要に応じてプレフィックスで絞り、オブジェクトをページ取得 | `options?` | `ListResult` | `await storage.dir.list({ prefix: 'backup/' })` |
| `storage.dir.delete` | 指定プレフィックス下のオブジェクトを削除 | `prefix` | `void` | `await storage.dir.delete('backup/')` |
| `storage.presign.getUrl` | S3 で一時ダウンロード URL を発行 | `key, options?`（有効期間は既定で 3600 秒、1～604800 秒を指定可） | `string` | `await storage.presign.getUrl('report.txt')` |
| `storage.presign.putUrl` | S3 で一時アップロード URL を発行 | `key, options?`（有効期間は既定で 3600 秒。MIME 型は既定で `application/octet-stream`） | `string` | `await storage.presign.putUrl('report.txt')` |
| `storage.presign.publicUrl` | 公開 URL 設定があれば URL を組み立てる | `key` | `string or null` | `storage.presign.publicUrl('report.txt')` |
| `storage.checksum.generate` | 内容のダイジェストを計算 | `data, options?` | `string` | `await storage.checksum.generate('Hello')` |
| `storage.checksum.verify` | 内容と期待するダイジェストを照合 | `data, expected, options?` | `boolean` | `await storage.checksum.verify('Hello', expected)` |

取得したストリームは読み切るか中止します。一括削除失敗時は再試行の前に error.ext.deleteMany を確認してください。結果が不明でも削除済みの場合があります。

未翻訳：ストリーム整合性、一括削除の復旧、外部アップロードの手順。[中国語の該当節](storage.md#api-reference)を参照してください。

<a id="download-authorization"></a>

## 認可後のダウンロード URL 発行

コード引数を扱うため設定手冊から移動しました。完全な手順は現在[中国語](storage.md#download-authorization)にあり、この節は部分翻訳です。
