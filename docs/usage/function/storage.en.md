# @h-ai/storage API reference

<!-- translation: partial -->

[Chinese source](storage.md) · [Configuration](../configuration/storage.en.md) · [Data structures](../data/storage.en.md)

## Quick start

Initialize Storage and use the file API for object operations. Authorize the object key before issuing a signed URL. Use streaming for large downloads.

```ts
import type { FileMetadata, StorageConfigInput } from '@h-ai/storage'
import type { Buffer } from 'node:buffer'
import { storage } from '@h-ai/storage'

export async function storeImage(config: StorageConfigInput, imageBuffer: Uint8Array) {
  // 选择一个后端，检查初始化结果。
  // Use the caller's backend settings. Success opens the connection with no data. Read error on failure.
  const initialized = await storage.init(config)
  if (!initialized.success)
    throw new Error(initialized.error.message)

  let result: { metadata: FileMetadata, bytes: Buffer, downloadUrl?: string }
  let closed
  try {
    const key = 'uploads/image.png'
    // 用对象 key 写入 PNG 字节，成功时返回对象元数据。
    // Write the caller's PNG bytes at this key. Success returns metadata. Read error on failure.
    const uploaded = await storage.file.put(key, imageBuffer, { contentType: 'image/png' })
    if (!uploaded.success)
      throw new Error(uploaded.error.message)

    // 用同一 key 读取对象内容，成功时返回 Buffer。
    // Read the PNG at the same key. Success returns a Buffer; a missing object or read failure is an error.
    const downloaded = await storage.file.get(key)
    if (!downloaded.success)
      throw new Error(downloaded.error.message)

    result = { metadata: uploaded.data, bytes: downloaded.data }
    if (config.type === 's3') {
      // S3 可签发有效期为 3600 秒的下载 URL。
      // Sign a 3,600-second download URL for this S3 key. Success returns the URL string. Read error on failure.
      const signed = await storage.presign.getUrl(key, { expiresIn: 3600 })
      if (!signed.success)
        throw new Error(signed.error.message)
      result.downloadUrl = signed.data
    }
  }
  finally {
    // 释放本次连接，失败时交由调用方处理。
    // Release this connection without arguments. Success has no data. The check below handles failure.
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
  // Send the key and MIME type to the configured API. Success contains the upload URL and server-confirmed key. Read error on failure.
  const signed = await apiClient.storage.presignedUrls.createUpload({ key, contentType })
  if (!signed.success)
    throw new Error(signed.error.message)

  // 直接上传到对象存储，成功时返回服务端确认的对象 key。
  // Upload the original file to the signed URL with the signed MIME type. Success means the response accepted it. Read error on failure.
  const uploaded = await storage.client.uploadWithPresignedUrl(signed.data.url, file, { contentType })
  if (!uploaded.success)
    throw new Error(uploaded.error ?? 'Upload failed')
  return signed.data.key
}
```

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Import the module as in the quick start. Run server file, directory and presigning operations after initialization and before closure; `storage.checksum` and `storage.client` require no initialization. When a call returns HaiResult, check success before reading data and return the original failed result to the caller. Scenarios without a function declaration are fragments inside an async application function. Use isolated test data and explicit cleanup.

<a id="connection"></a>

### Connect and close: `storage`

Local directories and S3 use the same file API; the application owns startup and shutdown.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `storage.init(config)` | Open the selected backend | `config: StorageConfigInput` is required. Set `type` to `local` or `s3`. See [storage configuration](../configuration/storage.en.md) for backend fields and defaults | `void` | `await storage.init(config)` |
| `storage.close()` | Stop new operations and release the backend | None | `void` | `await storage.close()` |

#### Scenario: Connect and close

```ts
// Fragment inside an async application function; return failed results to its caller.
// Initialize local storage at ./data/files-demo. Success enables access to its files. Return the failed result on failure.
const initResult = await storage.init({ type: 'local', root: './data/files-demo' })
if (!initResult.success)
  return initResult
// Close the local backend without arguments. Success has no data and files stay on disk. Return the failed result on failure.
const closeResult = await storage.close()
if (!closeResult.success)
  return closeResult
// saved files remain on disk
```

The input is a development directory. Closing releases the instance but preserves files; reconnect before continuing.

The output is successful HaiResult.data unless shown as a distinct result. publicUrl returns synchronously.

Consume or cancel opened streams. After a failed bulk delete, inspect error.ext.deleteMany before retrying: a key with an unknown outcome may already be deleted.

<a id="download-authorization"></a>

[Detailed parameters and workflows](storage.md#connection)

<a id="files"></a>

### Read, write and copy files: `storage.file`

Identify files by object key. Read content, metadata or streams as needed; inspect per-item progress for batch deletion.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `storage.file.put(key, data, options?)` | Store file content and metadata | `key: string` and `data: StorageData` are required. Supply a string, Buffer, Uint8Array, or async byte stream. See [`UploadOptions`](#storage-file-options) for optional `options`. | `FileMetadata` | `await storage.file.put('report.txt', 'Hello')` |
| `storage.file.get(key, options?)` | Read the requested bytes into memory | `key: string` is required. See [`DownloadOptions`](#storage-file-options) for optional `options`. | `Buffer` | `await storage.file.get('report.txt')` |
| `storage.file.getStream(key, options?)` | Read a file as a stream | `key: string` is required. See [`DownloadOptions`](#storage-file-options) for optional `options`. | `AsyncIterable<Uint8Array>` | `await storage.file.getStream('report.txt')` |
| `storage.file.getStreamWithMetadata(key, options?)` | Open a full object and its metadata in one read | `key: string` is required. Pass an optional `options.signal` to cancel the read. | `StorageFileRead` or an open failure | `await storage.file.getStreamWithMetadata('report.txt')` |
| `storage.file.head(key)` | Read file metadata | `key: string`, required object key | `FileMetadata` | `await storage.file.head('report.txt')` |
| `storage.file.exists(key)` | Check file existence | `key: string`, required object key | `boolean` | `await storage.file.exists('report.txt')` |
| `storage.file.copy(sourceKey, destKey, options?)` | Copy to another object key | `sourceKey: string` and `destKey: string` are required source and destination keys. In `options?: CopyOptions`, `contentType` and `metadata` each replace the corresponding source field. Omitted fields are inherited · [`CopyOptions`](#storage-file-options) | `FileMetadata` | `await storage.file.copy('report.txt', 'backup/report.txt')` |
| `storage.file.delete(key)` | Delete a file | `key: string`, required object key | `void` | `await storage.file.delete('report.txt')` |
| `storage.file.deleteMany(keys)` | Delete files and report per-key progress | `keys: string[]`, required array of object keys to delete | `StorageDeleteResult` | `await storage.file.deleteMany(['a.txt', 'b.txt'])` |

<a id="storage-file-options"></a>

##### File options

`key` identifies the object, and `data` is the content to write. All option objects and their fields may be omitted. Read byte offsets start at zero.

`UploadOptions`

| Field | Type | Behavior |
| --- | --- | --- |
| `contentType` | `string` | Optional. Local storage infers it from the extension. The S3 service chooses it when omitted. |
| `metadata` | `Record<string, string>` | Custom string metadata returned by `storage.file.head(key)`. |
| `ifNoneMatch` | `"*"` | Write only if the key is absent. Use `{ ifNoneMatch: "*" }` to avoid overwriting an existing file. |
| `signal` | `AbortSignal` | Cancels the upload. |
| `cacheControl` | `string` | S3 only. Set `Cache-Control`, such as `max-age=3600`. |
| `contentDisposition` | `string` | S3 only. Set `Content-Disposition` to suggest a download file name. |

Read and copy options

| Field | Type | Behavior |
| --- | --- | --- |
| `DownloadOptions.rangeStart` | `number` | Inclusive start byte, from the beginning if omitted. |
| `DownloadOptions.rangeEnd` | `number` | Inclusive end byte, through the end of the file if omitted. |
| `DownloadOptions.signal` | `AbortSignal` | Cancels a read. It is the only option for `getStreamWithMetadata`. |
| `CopyOptions.contentType` | `string` | Destination content type. Inherits the source value when omitted. |
| `CopyOptions.metadata` | `Record<string, string>` | Destination metadata. Inherits the source value when omitted. |

`metadata` holds application-defined string values that `head` can read after upload. Local infers an omitted `contentType` from the file extension. S3 accepts `cacheControl: "max-age=3600"` for caching and `contentDisposition: 'attachment; filename="report.txt"'` for the downloaded filename.

#### Scenario: Read, write and copy files

```ts
// Fragment inside an async application function; return failed results to its caller.
// Write hello as text at the report key. Success metadata has size 5 bytes. Return the failed result on write failure.
const savedResult = await storage.file.put('demo/report.txt', 'hello', { contentType: 'text/plain' })
if (!savedResult.success)
  return savedResult
const saved = savedResult.data
// saved describes key demo/report.txt and size 5.
// Check the newly written report. Success returns true. Return the failed result on lookup failure.
const existsResult = await storage.file.exists('demo/report.txt')
if (!existsResult.success)
  return existsResult
existsResult.data // true
// Read metadata for the report key. Success returns the same key and size 5. Return the failed result if missing or unavailable.
const metadataResult = await storage.file.head('demo/report.txt')
if (!metadataResult.success)
  return metadataResult
const metadata = metadataResult.data // same key and size
// Read all bytes at the report key and decode to hello. Return the failed result on read failure.
const getResult = await storage.file.get('demo/report.txt')
if (!getResult.success)
  return getResult
getResult.data.toString('utf8') // 'hello'
// Read three bytes at zero-based offsets 1 through 3. They decode to ell. Return the failed result on read failure.
const sample = await storage.file.get('demo/report.txt', { rangeStart: 1, rangeEnd: 3 })
if (!sample.success)
  return sample
sample.data.toString('utf8') // 'ell'
// Open a byte stream for the report key. Return the failed result on open failure. Later I/O can throw during iteration.
const streamResult = await storage.file.getStream('demo/report.txt')
if (!streamResult.success)
  return streamResult
const stream = streamResult.data
let byteCount = 0
for await (const bytes of stream)
  byteCount += bytes.byteLength
// byteCount === 5; stream iteration can throw on later I/O failure
// Open the report and its MIME type in one read. Return the failed result if opening fails.
const openedResult = await storage.file.getStreamWithMetadata('demo/report.txt')
if (!openedResult.success)
  return openedResult
const opened = openedResult.data
try {
  if (opened.metadata.contentType === 'text/plain') {
    // The stream yields five bytes in total. Iteration can throw on I/O failure.
    for await (const bytes of opened.stream) void bytes.byteLength
  }
} finally {
  // Release the file handle or connection even if the MIME check fails.
  await opened.close()
}
// Copy the report to demo/copy.txt. Success returns the new object's metadata. Return the failed result on failure.
const copyResult = await storage.file.copy('demo/report.txt', 'demo/copy.txt')
if (!copyResult.success)
  return copyResult
copyResult.data // metadata for the new key
// Delete the original report key. Success has no data. Return the failed result on failure.
const deleteResult = await storage.file.delete('demo/report.txt')
if (!deleteResult.success)
  return deleteResult
// Pass the copied key in an array. Success returns a deletion summary. A partial failure includes progress and Return the failed result.
const deletedResult = await storage.file.deleteMany(['demo/copy.txt'])
if (!deletedResult.success)
  return deletedResult
const deleted = deletedResult.data // per-key deletion progress
// Check the copied key after deletion. The result is false if it was not recreated. Return the failed result on failure.
const existsResult2 = await storage.file.exists('demo/copy.txt')
if (!existsResult2.success)
  return existsResult2
existsResult2.data // false after confirmed deletion
```

UTF-8 hello is five bytes. Chunk boundaries vary, and stream iteration can fail after the initial result. Inspect confirmed batch deletions rather than assuming Promise completion means every key was removed.

For S3, `file.put()` returns the byte count and submitted metadata for that write, plus the ETag when the service supplies it. The receipt uses `application/octet-stream` when the request omits the content type. Its `lastModified` records when the application received the successful response. Use `file.head()` to query the object currently at that key and its service-reported timestamp.

`file.getStreamWithMetadata()` opens a full object. S3 takes the headers and body from one GET response. Local reads the bytes and the matching metadata record for the same open file. Local objects require a valid metadata record. Call `close()` to release an unread or partially read stream, or pass a `signal` to cancel.

To abandon a download, abort its signal or call `return()` on its iterator to release the connection, even before reading the first chunk. When copying, setting only `contentType` or `metadata` preserves the other field from the source. For an S3 copy with overrides, Storage checks the source ETag before applying the changes. If the check fails, read the source again before retrying.

With Local storage, `file.head()` and `file.copy()` require the metadata record tied to the file's identity. When moving objects, export their bytes and metadata and write them to the destination with `file.put()`. [Local backup and recovery](../data/storage.en.md)

[Detailed parameters and workflows](storage.md#files)

<a id="directories"></a>

### Browse and clean a prefix: `storage.dir`

Directories are object-key prefixes. List them in pages and authorize the full prefix before deletion.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `storage.dir.list(options?)` | Paginate objects under a prefix | Optional `options: ListOptions` selects key ranges and handles paging. See [list fields](#storage-list-options). | `ListResult` | `await storage.dir.list({ prefix: 'backup/' })` |
| `storage.dir.delete(prefix)` | Delete objects under a prefix | `prefix: string` is required. Matches the start of an object key. An empty string matches all keys | `void` | `await storage.dir.delete('backup/')` |

<a id="storage-list-options"></a>

**ListOptions**

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `prefix` | `string` | `""` | Select object keys starting with this literal prefix. |
| `delimiter` | `string` | No grouping when omitted | Group at the first delimiter after the prefix into commonPrefixes. An empty delimiter also disables grouping. |
| `maxKeys` | `number` | Default 1000 | Integer 1–1000. Counts objects and common prefixes together. |
| `continuationToken` | `string` | Omit on the first page | Pass the previous nextContinuationToken unchanged. Keep the backend, root, prefix, and delimiter. |

With `reports/summary.txt` and `reports/2026/jan.txt` present, `{ prefix: "reports/", delimiter: "/" }` puts the summary in `files` and `["reports/2026/"]` in `commonPrefixes`.

`storage.dir.delete(prefix)` deletes objects page by page based on the literal start of each key. For example, `reports/draft-` matches `reports/draft-1.txt`, and `reports/` matches keys under that path. An empty prefix clears the objects in the container.

#### Scenario: Browse and clean a prefix

```ts
// Fragment inside an async application function; return failed results to its caller.
// Write one byte under the example prefix. Success returns metadata. Return the failed result on failure.
const putResult = await storage.file.put('demo-prefix/a.txt', 'a')
if (!putResult.success)
  return putResult
putResult.data
// List up to 20 objects under demo-prefix/. The page includes a.txt. Return the failed result on failure.
const pageResult = await storage.dir.list({ prefix: 'demo-prefix/', maxKeys: 20 })
if (!pageResult.success)
  return pageResult
const page = pageResult.data
// page contains metadata for demo-prefix/a.txt and backend pagination information
// Delete objects under the prefix. Success has no data. Return the failed result on partial failure.
const deleteResult = await storage.dir.delete('demo-prefix/')
if (!deleteResult.success)
  return deleteResult
// Recheck the original key after cleanup. The result is false unless recreated. Return the failed result on failure.
const existsResult = await storage.file.exists('demo-prefix/a.txt')
if (!existsResult.success)
  return existsResult
existsResult.data // false when no concurrent writer recreates it
```

The input targets demo-prefix/. Pages include metadata and continuation details. Prefix deletion is not atomic with concurrent uploads, which can recreate objects.

[Detailed parameters and workflows](storage.md#directories)

<a id="signed-urls"></a>

### Authorize direct transfers: `storage.presign`

S3 supports short-lived URLs for a specific object and operation. Authorize the user and object before signing.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `storage.presign.getUrl(key, options?)` | Sign a temporary download URL | Required `key: string` is the object key. See [signing options](#storage-presign-options) for optional `options: PresignOptions`. | `string` | `await storage.presign.getUrl('report.txt')` |
| `storage.presign.putUrl(key, options?)` | Sign a temporary upload URL | Required `key: string` is the destination object key. See [signing options](#storage-presign-options) for optional `options: PresignUploadOptions`. | `string` | `await storage.presign.putUrl('report.txt')` |
| `storage.presign.publicUrl(key)` | Resolve a configured public URL | `key: string`, required object key | `string or null` | `storage.presign.publicUrl('report.txt')` |

<a id="storage-presign-options"></a>

**Signing options**

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `expiresIn` | `number` | Default 3600 seconds | Used for PUT and GET. Accepts integer seconds from 1 to 604800. |
| `responseContentType` | `string` | Optional | GET signing only. Overrides the download response Content-Type. |
| `responseContentDisposition` | `string` | Optional | GET signing only. Can request attachment and a suggested filename. |
| `contentType` | `string` | `application/octet-stream` | PUT signing only. The actual PUT must send the same Content-Type. |

`responseContentType` and `responseContentDisposition` only affect the download response signed by `getUrl`. In the example, `putUrl` signs `text/plain` for upload, so the client sends that value as Content-Type.

#### Scenario: Authorize direct transfers

A signed URL separates authorization from the byte transfer. This requires initialized S3 storage and an application-authorized object key.

![Private files: authorize before direct transfer](../images/function-storage-presign.en.svg)

After receiving the URL, the browser connects to object storage, which verifies the signature and expiry before transferring the file. The PUT signature binds the `Content-Type` header. Send the same value with the upload. If `contentType` was omitted when signing, send `application/octet-stream`. `publicUrl()` encodes each key segment and appends the result to the configured public address.

```ts
// Fragment inside an async application function; return failed results to its caller.
// Requires initialized S3 storage and prior application authorization.
// Sign a 300-second upload URL for the report key and text/plain. Success returns the URL. Return the failed result on failure.
const uploadUrlResult = await storage.presign.putUrl('reports/demo.txt', { expiresIn: 300, contentType: 'text/plain' })
if (!uploadUrlResult.success)
  return uploadUrlResult
const uploadUrl = uploadUrlResult.data
// Sign a 300-second download URL for the same report. Success returns the URL. Return the failed result on failure.
const downloadUrlResult = await storage.presign.getUrl('reports/demo.txt', { expiresIn: 300 })
if (!downloadUrlResult.success)
  return downloadUrlResult
const downloadUrl = downloadUrlResult.data
// Resolve the public URL from the report key and public base configuration. Returns null when unavailable.
const publicUrl = storage.presign.publicUrl('reports/demo.txt') // string or null
```

Inputs use one key and a 300-second lifetime. Hosts and signatures vary. Upload Content-Type must match the signed value. publicUrl only applies public-address rules; it neither checks permission nor makes an object public.

#### Scenario: Authorize a download

This integration guide was moved from the configuration handbook because it describes code arguments. The complete walkthrough is currently available in [Chinese](storage.md#download-authorization); this subsection is partially translated.

[Detailed parameters and workflows](storage.md#signed-urls)

<a id="cancel-upload"></a>

#### Cancelling an upload and reading its result

Pass `abortController` to `storage.client.uploadWithPresignedUrl()` and call its `abort()` method when the user cancels. Supplying `onProgress` selects native XHR; without it, the client uses fetch. Cancellation stops the local request and does not roll back an object already written remotely.

Here, `signed.url` comes from the application's authorization endpoint and `signed.contentType` matches the type used to sign it. `controls` contains the page's existing cancel button, progress bar and status element.

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
  controls.status.textContent = 'Uploading'
  controls.cancel.addEventListener('click', cancel)

  try {
    const result = await storage.client.uploadWithPresignedUrl(signed.url, file, {
      contentType: signed.contentType,
      abortController: controller,
      onProgress: ({ percent }) => { controls.progress.value = percent },
    })
    if (!result.success) {
      // Cancellation reaches this branch too; error is a localized failure message.
      controls.status.textContent = result.error ?? 'Upload failed'
      return result
    }
    controls.status.textContent = 'Upload complete'
    return result
  }
  finally {
    controls.cancel.removeEventListener('click', cancel)
    controls.cancel.disabled = true
  }
}
```

Cancelling an in-progress upload resolves with `success: false` and a localized cancellation message in `error`; a completed upload returns `success: true`. Network failures also return failure, so check `success` and display `error` rather than treating every failure as cancellation. The button listener is removed in every case. After cancellation, check the business service to determine whether the object was already written.

<a id="checksums"></a>

### Check byte integrity: `storage.checksum`

Node computes digests for large in-memory inputs in a bounded Worker pool. Streams are read in chunks and honor the caller’s cancellation signal.

Checksums do not require storage initialization. Both sides must use the same algorithm and encoding.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `storage.checksum.generate(data, options?)` | Compute a content checksum | Required `data: StorageData` is the content. See [checksum options](#storage-checksum-options) for `options?: ChecksumOptions`. | `string` | `await storage.checksum.generate('Hello')` |
| `storage.checksum.verify(data, expected, options?)` | Verify a content checksum | Required `data: StorageData` and `expected: string` supply the content and expected digest. Match its algorithm and encoding in [checksum options](#storage-checksum-options). | `boolean` | `await storage.checksum.verify('Hello', expected)` |

<a id="storage-checksum-options"></a>

**ChecksumOptions**

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `algorithm` | `'sha256' \| 'sha384' \| 'sha512' \| 'sha1' \| 'md5'` | `sha256` | Select the digest. SHA-1 and MD5 are for compatibility integrity checks only. |
| `encoding` | `'hex' \| 'base64'` | `hex` | Use the same encoding to generate and verify. Hex output is lowercase. |
| `signal` | `AbortSignal` | Optional | Cancel digest processing or the stream read. |

For the UTF-8 bytes of `abc`, `{ encoding: "base64" }` encodes the SHA-256 digest as `ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=`.

#### Scenario: Check byte integrity

```ts
// Fragment inside an async application function; return failed results to its caller.
// Generate the default SHA-256 digest string for the bytes of hello. Return the failed result on failure.
const digestResult = await storage.checksum.generate('hello')
if (!digestResult.success)
  return digestResult
const digest = digestResult.data
// Check the same bytes against the generated digest. Success returns true. Return the failed result on processing failure.
const verifyResult = await storage.checksum.verify('hello', digest)
if (!verifyResult.success)
  return verifyResult
verifyResult.data // true
// Compare changed bytes to the original digest. Success returns false. Return the failed result on processing failure.
const verifyResult2 = await storage.checksum.verify('changed', digest)
if (!verifyResult2.success)
  return verifyResult2
verifyResult2.data // false
```

The same hello bytes match; changed bytes return false. A digest is not an access credential, and an S3 ETag is not this content checksum.

[Detailed parameters and workflows](storage.md#checksums)

<a id="browser-files"></a>

### Upload, download and save in browsers: `storage.client`

`storage.client` consumes server-authorized URLs or user-selected files. It requires no `storage.init()` and grants no business permissions. The Node root, Browser conditional entry and `@h-ai/storage/client` all use the same `storage.client.xxx` calls. Browser entries provide no server file, directory, presigning or lifecycle operations.

`ClientOperations` describes the six methods below. Uploads use `ClientUploadOptions`, progress callbacks receive `UploadProgress`, and downloads and saving use `ClientDownloadOptions`. Import these types from `@h-ai/storage/client`.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `storage.client.uploadWithPresignedUrl(url, data, options?)` | Upload bytes | Required `url: string` is the authorized upload URL, and `data` is a File, Blob, ArrayBuffer, or string to send. See [browser transfer options](#storage-browser-transfer-options). | `Promise<{ success: boolean; error?: string }>` | `await storage.client.uploadWithPresignedUrl(url, file, { contentType: file.type })` |
| `storage.client.downloadWithPresignedUrl(url, options?)` | Download a Blob | Required `url: string` is the authorized download URL. See [browser transfer options](#storage-browser-transfer-options) for cancellation. | `Promise<{ success: boolean; data?: Blob; error?: string }>` | `await storage.client.downloadWithPresignedUrl(url)` |
| `storage.client.downloadAndSave(url, options?)` | Download and save | Required `url: string` is the authorized download URL. See [browser transfer options](#storage-browser-transfer-options) for the filename and cancellation. | `Promise<{ success: boolean; error?: string }>` | `await storage.client.downloadAndSave(url, { filename: "report.txt" })` |
| `storage.client.getFileExtension(file)` | Read an extension | Required `file: File`. Reads its `name` | `string` | `storage.client.getFileExtension(file)` |
| `storage.client.getMimeType(extension)` | Resolve a MIME type | `extension: string` File extension such as txt. Unknown values return application/octet-stream | `string` | `storage.client.getMimeType("txt")` |
| `storage.client.formatFileSize(bytes)` | Format a byte count | `bytes: number` Number of bytes to display, such as the file size | `string` | `storage.client.formatFileSize(1024)` |

<a id="storage-browser-transfer-options"></a>

**Browser transfer options**

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `ClientUploadOptions.contentType` | `string` | Optional | Set PUT Content-Type. If signed, send the same value explicitly. |
| `ClientUploadOptions.onProgress` | `(progress: UploadProgress) => void` | Optional | Uses XMLHttpRequest when supplied. Called only when the total is computable. loaded and total are bytes; percent is a percentage. |
| `ClientUploadOptions.abortController / ClientDownloadOptions.abortController` | `AbortController` | Optional | Cancel this transfer. A pre-aborted controller prevents the request. Upload cancellation does not roll back a stored object. |
| `ClientDownloadOptions.filename` | `string` | Localized download name | Only for downloadAndSave. Supplies the suggested browser filename. |

#### Scenario: Upload a selected file and save a download

Both URLs come from successful signing responses; file comes from the file picker. Invoke this function on user action. Upload/download results use their own success/error shape, rather than HaiResult.

```ts
import { storage } from '@h-ai/storage/client'

async function transfer(file: File, uploadUrl: string, downloadUrl: string) {
  // Read the extension from the caller's filename, or an empty string if absent.
  const extension = storage.client.getFileExtension(file)
  // If file.type is missing, use the extension to resolve the MIME type, falling back to application/octet-stream.
  const contentType = file.type || storage.client.getMimeType(extension)
  // Format the file's byte count. For example, 1024 bytes displays as 1.00 KB.
  const displayedSize = storage.client.formatFileSize(file.size)
  // Upload the original file to the supplied URL with the MIME type. Success signals completion. Read error on failure.
  const uploaded = await storage.client.uploadWithPresignedUrl(uploadUrl, file, { contentType })
  if (!uploaded.success)
    throw new Error(uploaded.error ?? 'Upload failed')
  // Retrieve bytes from the signed download URL. Success data is a Blob. Read error on failure.
  const downloaded = await storage.client.downloadWithPresignedUrl(downloadUrl)
  if (!downloaded.success || !downloaded.data)
    throw new Error(downloaded.error ?? 'Download failed')
  // Use the same URL and original filename to trigger a browser download. Success means it was triggered. Read error on failure.
  const saved = await storage.client.downloadAndSave(downloadUrl, { filename: file.name })
  if (!saved.success)
    throw new Error(saved.error ?? 'Save failed')
  return { extension, displayedSize, blob: downloaded.data }
}
```
