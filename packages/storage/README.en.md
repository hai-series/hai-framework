# @h-ai/storage

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

## Introduction

An object storage module with a unified `storage` entry point for S3-compatible storage and local filesystems.

Connections become available only after a successful health check. Failed initialization disposes its candidate; `error.ext.cleanupPending === true` identifies cleanup that still needs retry. `storage.close()` returns `Promise<HaiResult<void>>`, waits for initialization, and coalesces concurrent close calls. Once cleanup starts, `isInitialized` is false and configuration/operations are unavailable. A failed cleanup retains the resource: the next `close()` or `init()` retries disposal before allocating a replacement. Always inspect the close result.

```ts
const closed = await storage.close()
if (!closed.success) {
  // Retry once after addressing the cleanup failure; report another failure.
  const retried = await storage.close()
  if (!retried.success)
    throw new Error(retried.error.message)
}
```

S3 disposes its normal client and its separate batch-delete client (SDK request retries disabled) independently. One failure does not prevent the other cleanup; successfully disposed clients are not destroyed again.

## Core features

- S3 protocol (AWS S3 / MinIO / RustFS / OSS, etc.)
- Local filesystem

## Getting started

### Quick start

#### Node.js server

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

#### Browser client

The browser entry exports only client capabilities (signed URL uploads/downloads), without the `storage` service object.

```ts
import { apiClient } from '@h-ai/api-client'
import { downloadAndSave, uploadWithPresignedUrl } from '@h-ai/storage/client'

// apiClient 已初始化，服务端使用 S3。
const signed = await apiClient.storage.presignedUrls.createUpload({ key: 'avatar.png' })
if (!signed.success)
  throw new Error(signed.error.message)
await uploadWithPresignedUrl(signed.data.url, file)
```

> Note: `@h-ai/storage` does not include HTTP routes. Implement the signed URL API in the application layer.

### HTTP API contracts

Public HTTP contracts come from `@h-ai/api-contract`; `createStorageProcedures({ storage, authorize })` in `@h-ai/serv` binds them to this module.

```ts
import { apiClient } from '@h-ai/api-client'

const result = await apiClient.storage.presignedUrls.createUpload({ key: 'avatar.png' })
if (!result.success)
  throw new Error(result.error.message)
```

Presigning requires S3. Local `getUrl()` / `putUrl()` return `HaiStorageError.UNSUPPORTED_OPERATION` (`hai:storage:018`), and `publicUrl()` returns `null`; no virtual URL is returned. serv and apiClient preserve the failure, so check `success` before consuming a URL. Use the application's existing authenticated file endpoints for local development; this module includes no HTTP file route or signature-verification service.

### API overview

- `storage.file`
  - `put/get/getStream/head/exists/delete/deleteMany/copy`
- `storage.dir`
  - `list/delete`
- `storage.presign`
  - `getUrl/putUrl/publicUrl`
- `storage.checksum`
  - `generate(data, options?) / verify(data, expected, options?)`

`file.put()` accepts Buffer, Uint8Array, strings and `AsyncIterable<Uint8Array>` (including Node Readable), with bounded S3 multipart uploads for streams. `getStream()` returns a byte stream with Range and `signal` cancellation. Initial failures return HaiResult; consumers handle I/O/cancellation errors during iteration. `get()` still buffers the complete file and is intended for small files.

`{ ifNoneMatch: '*' }` uses standard S3 conditional writes or atomic local publication to reject overwrites with `ALREADY_EXISTS`. Unsupported S3 conditions fail without falling back to an overwrite. Failed/cancelled uploads clean temporary files or unfinished parts; cancellation cannot undo an already published object.

`file.deleteMany(keys)` returns `StorageDeleteResult`. Success data is `{ deletedKeys, failures: [] }`; any unconfirmed deletion returns `OPERATION_FAILED` with progress in `error.ext?.deleteMany` (precondition errors such as uninitialized storage may omit progress). Duplicate inputs are processed once, and returned keys exclude the configured prefix. S3 batches contain at most 1000 keys and verify every `Deleted`/`Errors` receipt. HTTP 200 alone is insufficient; missing, duplicate or unknown receipts produce `unknown` outcomes. Local deletion uses at most 32 concurrent operations.

Only explicit `InternalError / ServiceUnavailable / SlowDown / RequestTimeout` items receive up to three attempts. Confirmed successes and permission failures are not resent. A dedicated `DeleteObjects` client disables SDK request retries. Network interruption immediately produces `unknown`; later unsent batches are `notAttempted`, without replaying unknown outcomes. `retryable` describes the fault category; callers must reconcile unknown results and concurrent writes before retrying. `dir.delete()` propagates failures but cannot prevent concurrent new objects. S3 deletes omit VersionId and may create delete markers in versioned buckets; historical versions are not purged.

`@h-ai/serv` / `@h-ai/api-client` expose the same success data and failure progress through `storage.files.deleteMany`.

```ts
const result = await storage.file.deleteMany(['a.txt', 'b.txt'])
if (!result.success) {
  const progress = result.error.ext?.deleteMany
  // Reconcile unknown outcomes with application writes before compensating.
  const knownFailures = progress?.failures.filter(item => item.outcome === 'failed' && item.retryable) ?? []
}
```

`checksum` is a stateless Node tool requiring no initialization. It generates/verifies the actual input bytes and consumes streams once. Defaults: SHA-256, lowercase hex. Options: `algorithm: 'sha256' | 'sha384' | 'sha512' | 'sha1' | 'md5'`, `encoding: 'hex' | 'base64'`, and `signal`. Mismatches return `ok(false)`; invalid format/algorithm and read failures return errors. MD5/SHA-1 are for compatibility integrity checks, not security authentication. ETags and S3 multipart composite checksums are not whole-file digests. The tool does not require compatible services to implement AWS checksum extensions.

Cancelling a checksum stops waiting for the next chunk and requests closure of the input iterator. Local `getStream()` rejects directories with `INVALID_PATH` before returning a stream.

> Note: `publicUrl` returns a string only when S3's `publicUrl` is configured; otherwise it returns `null`.

> Note: `storage.config` returns a **redacted configuration snapshot**. S3 secret fields are replaced with `[REDACTED]`, so it cannot be used for reinitialization.

### Client helpers

`@h-ai/storage/client` also provides these browser utilities:

- `uploadWithPresignedUrl(url, data, options)`
- `downloadWithPresignedUrl(url, options)`
- `downloadAndSave(url, { filename })`
- `getFileExtension(file)`
- `getMimeType(extension)`
- `formatFileSize(bytes)`

### Configuration

- **S3**: requires `bucket / region / accessKeyId / secretAccessKey`; optional `endpoint / forcePathStyle / prefix / publicUrl`.
- **Local**: requires `root`; optional `directoryMode / fileMode`.

MinIO and RustFS share the S3 provider with `type: 's3'`; no separate storage type is needed. For self-hosted instances, set the S3 API endpoint (usually port 9000) and enable path-style access. Create the bucket beforehand.

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

#### Operation logging

Enable file, directory, and presigned URL operation logs with `operationLog`. Logs are emitted at the actual Local/S3 provider operations, without a shared wrapper in `storage-main.ts`. File contents are never logged; uploads log only the byte length.

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

`storage.presign.putUrl()` currently supports signing options such as `contentType` and `expiresIn`, but no `maxSize` constraint.

Local `storage.dir.list()` treats `prefix` as a key string prefix (for example, `reports/2026-`) and paginates in UTF-8 byte order. `maxKeys` is an integer from 1 to 1000, default 1000; files and common prefixes share that budget. `delimiter` folds keys at its first occurrence after the prefix into one `commonPrefixes` entry. An empty delimiter disables grouping; empty physical directories produce no entries. The grouping and counting rules follow [S3 ListObjectsV2](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html).

`isTruncated: true` and `nextContinuationToken` appear only when another entry exists. Local cursors use no process cache and bind the canonical root directory, prefix and delimiter. Independent instances or restarted processes using the same root can continue a page, with a different `maxKeys` if needed. Malformed, unsupported-version or mismatched-scope cursors return `INVALID_LIST_OPTIONS`. Cursors grant no authorization and provide no snapshot: authorize the prefix, expect concurrent changes to affect later pages, and use the same canonical mount path. Each local request still scans and sorts matching directories; narrow the prefix or use S3 for large directories.

```ts
let continuationToken: string | undefined
do {
  const page = await storage.dir.list({ prefix: 'reports/2026-', maxKeys: 100, continuationToken })
  if (!page.success)
    return page
  // Consume page.data.files and page.data.commonPrefixes.
  continuationToken = page.data.nextContinuationToken
} while (continuationToken)
```

### Error handling

```ts
import { HaiStorageError, storage } from '@h-ai/storage'

const result = await storage.file.get('image.png')
if (!result.success && result.error.code === HaiStorageError.NOT_INITIALIZED.code) {
  // 存储未初始化
}
```

Common error codes:

| Error code                              | code              | Description                                                            |
| --------------------------------------- | ----------------- | ---------------------------------------------------------------------- |
| `HaiStorageError.NOT_INITIALIZED`       | `hai:storage:010` | Not initialized                                                        |
| `HaiStorageError.CONNECTION_FAILED`     | `hai:storage:001` | Connection failed                                                      |
| `HaiStorageError.OPERATION_FAILED`      | `hai:storage:002` | Operation failed                                                       |
| `HaiStorageError.NOT_FOUND`             | `hai:storage:003` | File not found                                                         |
| `HaiStorageError.PERMISSION_DENIED`     | `hai:storage:005` | Permission denied                                                      |
| `HaiStorageError.PRESIGN_FAILED`        | `hai:storage:013` | Presigned URL generation failed                                        |
| `HaiStorageError.UNSUPPORTED_OPERATION` | `hai:storage:018` | Operation unsupported by the provider, including local presigning      |
| `HaiStorageError.INVALID_LIST_OPTIONS`  | `hai:storage:019` | Invalid local list options or cursor, including mismatched query scope |
| `HaiStorageError.CONFIG_ERROR`          | `hai:storage:012` | Invalid configuration                                                  |

## Production shared state

Production requires shared S3 or a compatible service; local is for development/explicit tests. Applications own object authorization and conditional read-modify-write commits. Initialization checks apply when NODE_ENV or HAI_CORE_ENV is production; only explicit HAI_E2E=1/HAI_E2E_MOCK=1 tests are exempt. [State, concurrency and recovery (Chinese)](../../.agents/instructions/distributed-state.md)。

## Input limits and HTTP capabilities

Object keys are limited to 1024 UTF-8 bytes and reject absolute paths, backslashes, control characters and dot segments. Each public HTTP batch delete accepts 1–1000 entries. `@h-ai/storage/schemas` exposes the shared browser-safe rules. Presign expiry is an integer from 1 to 604800 seconds (Node default 3600, HTTP default 900). Upload signing accepts only key/contentType/expiresIn; contentLength/maxSize/metadata/checksum are unsupported. Invalid input returns HTTP 400 and the typed client maps it to VALIDATION_FAILED. FileUpload limits guide file selection; applications must validate actual objects on the server. Node streaming/checksum/conditional-write options have no default HTTP endpoints. See the [capability and authorization matrix (Chinese)](README.md#存储输入约束与跨端能力).

## Browser upload cancellation

`uploadWithPresignedUrl(url, data, { onProgress, abortController })` uses native XHR for progress and fetch when `onProgress` is omitted. An already aborted controller sends no request. Cancellation during setup or upload, external XHR abort, network/timeout errors, and progress callback exceptions settle once with a failure and remove this operation's listeners. Aborting after completion does not touch the old XHR. Cancellation only stops the local request; it cannot roll back an object already written remotely. Check the object state and authorize deletion separately.

## Development and testing

```bash
pnpm --filter @h-ai/storage test
```

S3 integration tests require Docker or a compatible runtime. The same initialization, file, directory, presigning, and real HTTP upload/download cases run against both MinIO and RustFS; container startup failures are not skipped.

- MinIO: [`ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z`](https://github.com/coollabsio/minio), a community image built from upstream source.
- RustFS: [`ghcr.io/rustfs/rustfs:1.0.1`](https://github.com/rustfs/rustfs), the official image.

Containers use temporary test credentials. Buckets are created through the S3 API after service readiness; containers and anonymous volumes are removed when the final lease is released.

Source JSDoc follows the [shared conventions](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证): public examples use published entry points, and internal examples are checked in their module scope. After building, run `pnpm check:jsdoc --package storage`; compiling examples does not replace backend behavior tests.

For the real Chrome regression gate, install Chrome, set `HAI_STORAGE_RUN_BROWSER_GATES=1`, then run `pnpm --filter @h-ai/storage exec vitest run tests/storage-client-browser.test.ts`. It sends actual HTTP PUT requests and checks native cancellation and listener cleanup; a missing browser fails the gate.

## License

Apache-2.0
