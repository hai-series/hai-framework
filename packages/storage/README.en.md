# @h-ai/storage

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

An object storage module with a unified `storage` entry point for S3-compatible storage and local filesystems.

## Quick Start

### Node.js server

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

## Features

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

### Operations and results

Use the complete initialization flow in this section first. The host validates and authorizes example business values; check success before reading data from asynchronous domain results. Here void means completion without data, null means absent; synchronous factories/tools return the listed type directly.

#### storage.file

Object lifecycle uses raw keys, bytes/streams and options: put/copy/head yield metadata, get Buffer, getStream an async byte stream, exists boolean, delete void; deleteMany reports per-key confirmed progress.

| Entry                     | Input parameters            | Successful result                            | Call example                                                                  |
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

Browse/clean by prefix: list takes prefix/pagination and returns files with continuation; delete takes a prefix and yields void without preventing concurrent new objects.

| Entry                | Input parameters | Successful result | Call example                                                  |
| -------------------- | ---------------- | ----------------- | ------------------------------------------------------------- |
| `storage.dir.list`   | options          | `ListResult`      | `await storage.dir.list({ prefix: 'reports/', maxKeys: 20 })` |
| `storage.dir.delete` | prefix           | `void`            | `await storage.dir.delete('reports/')`                        |

#### storage.presign

Direct S3 upload/download: key plus expiry/response options yield a URL HaiResult; publicUrl synchronously yields a URL/null and grants no authorization.

| Entry                       | Input parameters | Successful result | Call example                                                                                |
| --------------------------- | ---------------- | ----------------- | ------------------------------------------------------------------------------------------- |
| `storage.presign.getUrl`    | key, options     | `string`          | `await storage.presign.getUrl('report.txt', { expiresIn: 300 })`                            |
| `storage.presign.putUrl`    | key, options     | `string`          | `await storage.presign.putUrl('report.txt', { expiresIn: 300, contentType: 'text/plain' })` |
| `storage.presign.publicUrl` | key              | `string \| null`  | `storage.presign.publicUrl('report.txt')`                                                   |

#### storage.checksum

Stateless integrity: data plus algorithm/encoding yields a digest, expected digest yields matching boolean; a stream is consumed once.

| Entry                       | Input parameters        | Successful result | Call example                                           |
| --------------------------- | ----------------------- | ----------------- | ------------------------------------------------------ |
| `storage.checksum.generate` | data, options           | `string`          | `await storage.checksum.generate('text')`              |
| `storage.checksum.verify`   | data, expected, options | `boolean`         | `await storage.checksum.verify(bytes, expectedDigest)` |

- S3 protocol (AWS S3 / MinIO / RustFS / OSS, etc.)
- Local filesystem

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

Local prepares metadata bound to the content file identity in the reserved `.hai-storage-meta/` directory beside the file, then atomically publishes the content as the commit point. Metadata preparation failure cannot create or overwrite content. Default metadata has an explicit empty record and never inherits old object fields. Failure to clean a known old generation after publication is diagnostic only; concurrent writes or crashes may leave internal records that cannot safely be reclaimed, which are not deleted speculatively. Every path segment reserves `.meta.json`, `.upload.tmp` and `.hai-storage-meta`. Generation records are the only metadata format; a missing valid record returns an explicit error. Rebuild objects through `file.put()` with trusted content and business metadata. Back up content together with internal records and prohibit direct writes that bypass this format.

S3 `file.copy()` encodes each source path segment, preserving Unicode, spaces and URL delimiters as part of the object key. Pass raw keys without pre-encoding.

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

### Production shared state

Production requires shared S3 or a compatible service; local is for development/explicit tests. Applications own object authorization and conditional read-modify-write commits. Initialization checks apply when NODE_ENV or HAI_CORE_ENV is production; only explicit HAI_E2E=1/HAI_E2E_MOCK=1 tests are exempt. [State, concurrency and recovery (Chinese)](../../.agents/instructions/distributed-state.md).

### Input limits and HTTP capabilities

Object keys are limited to 1024 UTF-8 bytes and reject absolute paths, backslashes, control characters and dot segments. Each public HTTP batch delete accepts 1–1000 entries. `@h-ai/storage/schemas` exposes the shared browser-safe rules. Presign expiry is an integer from 1 to 604800 seconds (Node default 3600, HTTP default 900). Upload signing accepts only key/contentType/expiresIn; contentLength/maxSize/metadata/checksum are unsupported. Invalid input returns HTTP 400 and the typed client maps it to VALIDATION_FAILED. FileUpload limits guide file selection; applications must validate actual objects on the server. Node streaming/checksum/conditional-write options have no default HTTP endpoints. See the [capability and authorization matrix (Chinese)](README.md#存储输入约束与跨端能力).

### Browser upload cancellation

`uploadWithPresignedUrl(url, data, { onProgress, abortController })` uses native XHR for progress and fetch when `onProgress` is omitted. An already aborted controller sends no request. Cancellation during setup or upload, external XHR abort, network/timeout errors, and progress callback exceptions settle once with a failure and remove this operation's listeners. Aborting after completion does not touch the old XHR. Cancellation only stops the local request; it cannot roll back an object already written remotely. Check the object state and authorize deletion separately.

## Configuration

Lifecycle: init takes backend/business configuration; use the module only after success. Await close before releasing borrowed dependencies. Follow the quick-start example and public signatures for exact return values.

Local storage rejects file symlinks and directory junctions in key paths; reserved `.meta.json` / `.upload.tmp` suffixes are case insensitive. Overwrite put replaces old metadata, while copy inherits source metadata by default. The browser root exports schemas, types and client helpers, without the server singleton.

- **S3** requires `bucket / region / accessKeyId / secretAccessKey`. Optional settings include `createBucket / endpoint / publicEndpoint / forcePathStyle / prefix / publicUrl / multipart`.
- **Local**: requires `root`; optional `directoryMode / fileMode`.

Server-side S3 streaming uploads default to 5 MiB parts and two concurrent parts per upload. Set `multipart.partSizeBytes` and `multipart.queueSize` in `_storage.yml`, or use `HAI_STORAGE_MULTIPART_PARTSIZEBYTES=8388608` and `HAI_STORAGE_MULTIPART_QUEUESIZE=3` for 8 MiB and three concurrent parts. Part size accepts integer byte counts from 5 MiB to 5 GiB. Queue size accepts positive integers. Budget approximately part size times concurrency for each active upload. The settings take effect at initialization.

MinIO and RustFS share the S3 provider with `type: 's3'`; no separate storage type is needed. For self-hosted instances, set the S3 API endpoint (usually port 9000) and enable path-style access.

`createBucket` defaults to `false`, requiring an existing bucket. When enabled, `storage.init()` checks `HeadBucket` and creates the bucket only on an explicit 404. Existing buckets and objects are preserved. Permission, network, creation, and subsequent connection-check failures return failure, dispose clients, and leave storage uninitialized. A concurrent `BucketAlreadyOwnedByYou` is accepted only after another access check. Creation omits LocationConstraint for AWS `us-east-1` and uses the configured region elsewhere. Default self-hosted S3 deployments enable `HAI_STORAGE_CREATEBUCKET=true`; external S3 creation requires explicit permission.

Use `createBucket: ${HAI_STORAGE_CREATEBUCKET:false}` in YAML for environment control; direct `storage.init()` input requires a boolean.

Set `prefix: my-app/uploads/` in `config/_storage.yml`, or set `HAI_STORAGE_PREFIX=my-app/uploads/` in a Hai app that registers `StorageConfigSchema`. Uploading `report.pdf` stores it under `my-app/uploads/report.pdf`. The startup probe and default listing both query `my-app/uploads/`, with or without the trailing slash in the configuration. An empty prefix uses the bucket root. Changing the prefix leaves existing objects at their current keys.

To scope application credentials, limit object permissions to the object ARN pattern `arn:aws:s3:::my-bucket/my-app/uploads/*` and apply the `s3:prefix` condition `my-app/uploads/*` to `s3:ListBucket`. Use a pre-created bucket with `createBucket: false` to avoid the bucket-level `HeadBucket` check used in bucket creation mode.

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

### Internal connections and browser access

`endpoint` handles server-side CRUD, bucket creation and health checks. Optional `publicEndpoint` selects the external address for `presign.getUrl/putUrl`; omission preserves endpoint-based signing. It accepts a proxy directory such as `https://app.example.com/delivery/files`. Path segments allow letters, numbers, underscores, dots and hyphens, excluding dot segments, repeated slashes and encoded separators. Do not include the bucket, credentials, query or fragment. `publicUrl` constructs public-resource URLs without authorizing private objects.

Self-hosted Compose uses `http://storage:9000` internally. The example generates `/delivery/files/hai/private/report.zip?...`; an origin-only endpoint generates `/hai/private/report.zip?...`. A proxy directory selects path-style external signatures; internal operations still follow `forcePathStyle`. Nginx removes the directory and forwards the original S3 signature path, query and Host directly to Storage. Large downloads and Range bypass Serv. Fullstack reuses Web Nginx; SvelteKit SSR and independent APIs receive a gateway. Storage may sit under the website directory but cannot cover API, asset or health paths. Gateway/access changes require a new full baseline; partial updates and rollback retain installed settings.

External AWS S3, R2 and existing gateways use their own accessible endpoints; kept/external storage does not receive a local sidecar route. HTTPS ingress must preserve the signed Host, original URI and query. Cross-origin browsers require precise CORS at the actual S3 service. The gateway does not replace bucket authorization or CORS. Treat signed URLs as temporary credentials, limit expiry and exclude them from logs. A GET signature is not a HEAD signature. Local storage does not support presigning or expose private directories through Nginx.

For empty self-hosted bucket/region settings, deployment injects hai/us-east-1; these are not Storage Schema defaults. The object proxy applies CSP sandbox, nosniff, no-referrer and private,no-store to isolate untrusted attachments, including same-origin HTML. Use it for file delivery, not executable website scripts. Configure equivalent isolation at external S3/CDN endpoints.

#### Operation logging

Local and S3 log writes by default. Set `operationLog.read` to enable read logs. Operation records use `debug` and follow the Core log level. Failed operations return the original error and emit `warn`, including failures while consuming a download stream. Initialization, connection, and shutdown failures emit `error`. Operation logs contain safe summaries such as the operation name, byte length when known, or item count. The presigned upload and download helpers report failures in the browser.

```yaml
# config/_storage.yml
type: local
root: ./data/uploads
operationLog:
  read: false # file.get/head/exists, dir.list, presign.getUrl/publicUrl
  write: true # file.put/delete/deleteMany/copy, dir.delete, presign.putUrl
  maxLength: 1000 # maximum summary characters, 0 omits the summary
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

Set `HAI_STORAGE_OPERATIONLOG_WRITE=false` to disable debug records for writes. When upgrading, remove `operationLog.level` and `HAI_STORAGE_OPERATIONLOG_LEVEL`. Set the global threshold through `HAI_CORE_LOGGING_LEVEL`.

For a failed `storage.file.put()`, inspect `error.code` and `error.message`. When available, `error.cause` holds the original error. A destination conflict with `ifNoneMatch: '*'` returns `ALREADY_EXISTS`. A source read failure, including a failed `createReadStream()`, returns `UPLOAD_FAILED`. Cancellation preserves `AbortSignal.reason`. Warnings include a reason summary and the underlying error code or HTTP status when available.

For S3 streaming uploads, `error.ext?.s3Operation` identifies the failed request when available. If multipart cleanup also fails, `error.cause` keeps the original failure and `error.ext?.cleanupError` holds the cleanup failure. The warning records the error codes and available storage request IDs for both.

A successful part response with a missing `ETag` produces a `MissingETag` cause. The warning also includes the part number.

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

The host loads and validates configuration before passing it to this module. Keep secrets in private server environment files. Select the backend, capacity, deadlines and logging for the actual use case; reinitialize and check the result after changes.

[Per-option purpose, use cases and examples](../../docs/usage/configuration/data.md).

## Error Handling

Check result.success for domain operations. Handle failures with the module error definitions and safe messages; retain codes, correlation IDs and sanitized causes in server logs. Synchronous tools, factories, stream iteration and lifecycle calls follow their own signatures. A completed Promise alone is not business success. See each feature for recovery limits.

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

## Development

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
