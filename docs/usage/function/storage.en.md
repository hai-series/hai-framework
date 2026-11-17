# @h-ai/storage API reference

<!-- translation: partial -->

[Chinese source](storage.md) · [Configuration](../configuration/storage.en.md) · [Data structures](../data/storage.en.md)

<a id="quick-start"></a>

## Quick start

Initialize Storage and use the file API for object operations. Authorize the object key before issuing a signed URL. Use streaming for large downloads.

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

## API list

The output is successful HaiResult.data unless shown as a distinct result. publicUrl returns synchronously.

| API | Purpose | Inputs and defaults | Output | Example |
| --- | --- | --- | --- | --- |
| `storage.init` | Open the selected backend | `config` | `void` | `await storage.init(config)` |
| `storage.close` | Stop new operations and release the backend | None | `void` | `await storage.close()` |
| `storage.file.put` | Write bytes and optional metadata | `key, data, options?` | `FileMetadata` | `await storage.file.put('report.txt', 'Hello')` |
| `storage.file.get` | Read object bytes into a buffer | `key, options?` | `Buffer` | `await storage.file.get('report.txt')` |
| `storage.file.getStream` | Stream object bytes. Iteration can fail after acquisition | `key, options?` | `AsyncIterable<Uint8Array>` | `await storage.file.getStream('report.txt')` |
| `storage.file.head` | Read metadata without downloading content | `key` | `FileMetadata` | `await storage.file.head('report.txt')` |
| `storage.file.exists` | Check whether a key exists | `key` | `boolean` | `await storage.file.exists('report.txt')` |
| `storage.file.delete` | Remove one object | `key` | `void` | `await storage.file.delete('report.txt')` |
| `storage.file.deleteMany` | Delete several keys, retaining progress details on error | `keys` | `StorageDeleteResult` | `await storage.file.deleteMany(['a.txt', 'b.txt'])` |
| `storage.file.copy` | Copy the source object to another key | `sourceKey, destKey, options?` | `FileMetadata` | `await storage.file.copy('report.txt', 'backup/report.txt')` |
| `storage.dir.list` | Page through objects, optionally filtered by prefix | `options?` | `ListResult` | `await storage.dir.list({ prefix: 'backup/' })` |
| `storage.dir.delete` | Delete objects under a prefix | `prefix` | `void` | `await storage.dir.delete('backup/')` |
| `storage.presign.getUrl` | Create a temporary download URL on S3 | `key, options?` (expires in 3600 seconds by default, range 1–604800) | `string` | `await storage.presign.getUrl('report.txt')` |
| `storage.presign.putUrl` | Create a temporary upload URL on S3 | `key, options?` (expires in 3600 seconds by default; MIME type defaults to `application/octet-stream`) | `string` | `await storage.presign.putUrl('report.txt')` |
| `storage.presign.publicUrl` | Build the configured public URL if available | `key` | `string or null` | `storage.presign.publicUrl('report.txt')` |
| `storage.checksum.generate` | Calculate a content digest | `data, options?` | `string` | `await storage.checksum.generate('Hello')` |
| `storage.checksum.verify` | Compare the content with the expected digest | `data, expected, options?` | `boolean` | `await storage.checksum.verify('Hello', expected)` |

Consume or cancel opened streams. After a failed bulk delete, inspect error.ext.deleteMany before retrying: a key with an unknown outcome may already be deleted.

Still untranslated: the streaming integrity, batch-delete recovery and external upload workflows. Read the [Chinese source section](storage.md#api-reference).

<a id="download-authorization"></a>

## Authorized download links

This integration guide was moved from the configuration handbook because it describes code arguments. The complete walkthrough is currently available in [Chinese](storage.md#download-authorization); this subsection is partially translated.
