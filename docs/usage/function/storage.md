# @h-ai/storage 功能说明

在 Node.js 服务端用 `storage` 读写本地文件或 S3 兼容对象存储。浏览器要直接上传或下载 S3 对象时，先向应用服务端取得为指定对象和操作签名的临时 URL。

Node.js 进程中的文件操作从 `storage` 调用。浏览器用 `apiClient.storage` 向应用服务端申请签名地址，再选用 `@h-ai/storage/client` 的上传、下载工具直接访问存储服务。

[模块 README](../../../packages/storage/README.md) · [配置清单](../configuration/storage.md) · [数据结构](../data/storage.md) · [存储接入](../development/data.md)

## 最小接入示例

### Node.js 服务端

将已校验的 S3 或 local 配置和 PNG 字节传给 `storeImage`。本例管理一次完整的连接生命周期。常驻服务应在应用启动时初始化，并在停机时关闭。

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

#### 浏览器客户端

浏览器通过已初始化的 `apiClient` 获取 S3 上传地址。将应用授权的对象 key 和用户选择的 `File` 传给 `uploadImage`。

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

> 注意：`@h-ai/storage` 不内置 HTTP 路由；请在应用层自行实现签名 URL API。

## 功能说明

模块在健康检查通过后才允许业务读写。如果初始化失败，会尝试释放已经打开的资源。释放也失败时，返回的 `error.ext.cleanupPending` 为 `true`。

关闭会等待正在进行的初始化，多次同时关闭只执行一次清理。关闭期间 `isInitialized` 为 `false`，配置与读写操作暂停。关闭失败时，下次调用 `close()` 或 `init()` 会先重试释放原连接。检查 `await storage.close()` 的结果，再停止本模块依赖的其他服务。

```ts
const closed = await storage.close()
if (!closed.success) {
  // 处理清理故障后有限重试；再次失败应向应用报告。
  const retried = await storage.close()
  if (!retried.success)
    throw new Error(retried.error.message)
}
```

S3 普通请求客户端与禁用请求重试的批量删除客户端分别释放；一个失败不阻止另一个清理，已释放的客户端不会重复释放。

<a id="api-reference"></a>

### 功能输入输出

下表中的调用假定模块已经初始化成功。应用代码提供实际的业务参数，并在调用前校验输入和权限。收到 `HaiResult` 时先检查 `success`，成功时读 `data`，失败时读 `error`。成功结果为 `void` 时没有业务数据。返回 `null` 时表示没有找到值。

#### storage.file

对象生命周期输入原始 key、字节/流和选项；put/copy/head 返回元数据，get 返回 Buffer，getStream 返回异步字节流，exists 返回 boolean，delete 返回 void；deleteMany 返回逐项确认进度。

| 入口                      | 输入参数                    | 成功结果                                     | 调用示例                                                                      |
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

按前缀浏览/清理；list 接收 prefix、分页选项返回文件列表/续页信息，delete 接收 prefix 返回 void，不能阻止并发新增。

| 入口                 | 输入参数 | 成功结果     | 调用示例                                                      |
| -------------------- | -------- | ------------ | ------------------------------------------------------------- |
| `storage.dir.list`   | options  | `ListResult` | `await storage.dir.list({ prefix: 'reports/', maxKeys: 20 })` |
| `storage.dir.delete` | prefix   | `void`       | `await storage.dir.delete('reports/')`                        |

#### storage.presign

S3 客户端直传/下载。key 和期限/响应选项生成 URL HaiResult；publicUrl 同步返回公开 URL 或 null，不代表获得访问授权。

| 入口                        | 输入参数     | 成功结果         | 调用示例                                                                                    |
| --------------------------- | ------------ | ---------------- | ------------------------------------------------------------------------------------------- |
| `storage.presign.getUrl`    | key, options | `string`         | `await storage.presign.getUrl('report.txt', { expiresIn: 300 })`                            |
| `storage.presign.putUrl`    | key, options | `string`         | `await storage.presign.putUrl('report.txt', { expiresIn: 300, contentType: 'text/plain' })` |
| `storage.presign.publicUrl` | key          | `string \| null` | `storage.presign.publicUrl('report.txt')`                                                   |

#### storage.checksum

无需初始化的字节完整性校验；数据及算法/编码得到摘要，expected 得到匹配 boolean；流输入消费一次。

| 入口                        | 输入参数                | 成功结果  | 调用示例                                               |
| --------------------------- | ----------------------- | --------- | ------------------------------------------------------ |
| `storage.checksum.generate` | data, options           | `string`  | `await storage.checksum.generate('text')`              |
| `storage.checksum.verify`   | data, expected, options | `boolean` | `await storage.checksum.verify(bytes, expectedDigest)` |

- S3 协议（AWS S3 / MinIO / RustFS / OSS 等）
- 本地文件系统

### HTTP API 契约

公共 HTTP API 统一由 `@h-ai/api-contract` 提供，并由 `@h-ai/serv` 的 `createStorageProcedures({ storage, authorize })` 绑定到本模块能力。

```ts
import { apiClient } from '@h-ai/api-client'

const result = await apiClient.storage.presignedUrls.createUpload({ key: 'avatar.png' })
if (!result.success)
  throw new Error(result.error.message)
```

预签名只支持 S3。local 的 `getUrl()` / `putUrl()` 返回 `HaiStorageError.UNSUPPORTED_OPERATION`（`hai:storage:018`），`publicUrl()` 返回 `null`；不会返回虚拟 URL。serv 与 apiClient 保留该失败结果，调用方须先检查 `success` 再消费 URL。本地开发文件可由应用已有的鉴权上传/下载接口处理，本模块不内置 HTTP 文件路由或签名验证服务。

### API 概览

- `storage.file`
  - `put/get/getStream/head/exists/delete/deleteMany/copy`
- `storage.dir`
  - `list/delete`
- `storage.presign`
  - `getUrl/putUrl/publicUrl`
- `storage.checksum`
  - `generate(data, options?) / verify(data, expected, options?)`

`file.put()` 支持 Buffer、Uint8Array、字符串及 `AsyncIterable<Uint8Array>`（如 Node Readable）；流上传内部使用有界 S3 multipart。`getStream()` 返回字节流，支持 Range 与 `signal` 取消；初始失败返回 HaiResult，迭代期间的 I/O/取消错误由消费方处理。原 `get()` 仍返回完整 Buffer，适合小文件。

上传选项 `{ ifNoneMatch: '*' }` 通过标准 S3 条件写或本地原子发布拒绝覆盖，冲突返回 `ALREADY_EXISTS`；S3 服务不支持条件写时返回错误，不降级为覆盖。失败/取消会清理临时文件或未完成分片；取消不能撤销已经发布的对象。

Local 在内容文件旁的保留目录 `.hai-storage-meta/` 中准备与文件身份绑定的代际元数据，再以内容文件的原子发布作为提交点。元数据准备失败不会新增或覆盖内容；默认元数据也有空记录，不继承旧对象的类型或业务字段。发布后清理明确旧代际失败只记录诊断，不将已提交写入报告为失败；并发或崩溃可能留下尚未确认可回收的内部记录，不做推测性删除。`.meta.json`、`.upload.tmp` 后缀和 `.hai-storage-meta` 在每个路径段均保留，不能直接读写或删除。代际记录是唯一元数据格式，缺少有效记录时明确返回错误；重建对象使用可信内容及业务元数据，通过 `file.put()` 写入。备份同时保存内容与内部记录，禁止绕过此格式直接混写。

S3 `file.copy()` 对源键按路径段编码，中文、空格及 URL 分隔字符仍作为原始对象键处理；调用方传原始 key，不要提前编码。

`file.deleteMany(keys)` 返回 `StorageDeleteResult`：成功时 `data` 为 `{ deletedKeys, failures: [] }`；任一删除项未确认完成时返回 `OPERATION_FAILED`，进度在 `error.ext?.deleteMany`（初始化等前置错误可能不带进度）。重复输入只处理一次，输出 key 不含配置 prefix。S3 每批最多 1000 项，逐项检查 `Deleted` 与 `Errors`；HTTP 200 不代表全部成功，遗漏/重复/未知回执标为 `unknown`。本地删除最多并发 32 项。

只对明确的 `InternalError / ServiceUnavailable / SlowDown / RequestTimeout` 项最多尝试三次；成功及权限失败项不重发。`DeleteObjects` 专用客户端禁用 SDK 请求重试；网络中断立即标为 `unknown`，未发送的后续批次标为 `notAttempted`，不盲目重放未知结果。`retryable` 只表示故障类别，调用方重试前仍须核对未知结果及并发写入。`dir.delete()` 传播删除失败；它不能阻止并发新增对象。S3 使用不带 VersionId 的删除，开启版本控制的桶可能创建删除标记，不保证清除历史版本。

`@h-ai/serv` / `@h-ai/api-client` 的 `storage.files.deleteMany` 使用同一成功结构并透传失败进度。

```ts
const result = await storage.file.deleteMany(['a.txt', 'b.txt'])
if (!result.success) {
  const progress = result.error.ext?.deleteMany
  // 结合 outcome 与业务写入状态决定补偿；未知结果不能当作未执行。
  const knownFailures = progress?.failures.filter(item => item.outcome === 'failed' && item.retryable) ?? []
}
```

`checksum` 是 Node 端无状态工具，无需初始化，按实际输入字节生成/校验，流输入仅消费一次。默认 SHA-256、小写 hex；可选 `algorithm: 'sha256' | 'sha384' | 'sha512' | 'sha1' | 'md5'`、`encoding: 'hex' | 'base64'` 和 `signal`。不匹配返回 `ok(false)`，非法格式/算法及读取失败返回错误。MD5/SHA-1 只用于兼容性完整性校验，不用于安全认证；ETag、S3 multipart 复合 checksum 不等同于完整文件摘要。此工具不强制 S3 兼容服务支持 AWS checksum 扩展。

取消计算会结束对下一块数据的等待，并请求关闭输入迭代器。本地 `getStream()` 读取目录时直接返回 `INVALID_PATH`，不将目录报告为可消费的文件流。

> 注意：`publicUrl` 仅在 S3 配置了 `publicUrl` 时返回字符串；否则返回 `null`。

> 注意：`storage.config` 返回的是**脱敏配置快照**；S3 密钥类字段会被替换为 `[REDACTED]`，不能用于重新初始化。

### 客户端辅助函数

`@h-ai/storage/client` 还提供以下浏览器侧工具：

- `uploadWithPresignedUrl(url, data, options)`
- `downloadWithPresignedUrl(url, options)`
- `downloadAndSave(url, { filename })`
- `getFileExtension(file)`
- `getMimeType(extension)`
- `formatFileSize(bytes)`

### 生产共享状态

生产使用共享 S3 或兼容服务；local 只用于开发/明确测试。对象业务授权和读改写的条件提交由应用负责。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化发布成功前校验；仅 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试可豁免。 [状态、并发和恢复边界](../../../.agents/instructions/distributed-state.md).

### 输入约束与 HTTP 能力

存储 key 按 UTF-8 最多 1024 字节，并拒绝绝对路径、反斜线、控制字符及点路径段；公开 HTTP 批量删除每次 1–1000 项。`@h-ai/storage/schemas` 提供浏览器安全的共同规则。预签名有效期为整数 1–604800 秒（Node 默认 3600，HTTP 默认 900）；HTTP 上传仅接受 key/contentType/expiresIn，不支持 contentLength/maxSize/metadata/checksum。无效输入返回 HTTP 400，typed client 映射 VALIDATION_FAILED。FileUpload 的大小/类型限制仅为前端体验，实际对象须由应用服务端复核。Node 流式读写/checksum/条件写等没有默认 HTTP 端点。完整映射与授权边界见 [存储 API 能力](#存储输入约束与跨端能力).

### 浏览器上传取消

`uploadWithPresignedUrl(url, data, { onProgress, abortController })` 使用原生 XHR 报告进度；不传 `onProgress` 时使用 fetch。预先取消不发送请求，准备阶段和进行中取消、外部 XHR abort、网络/超时及进度回调异常都只结算一次失败，并移除本次监听。完成后再取消不会操作旧 XHR。取消只终止本地请求，不能回滚远端已写入的对象；应用须先核对对象状态，再授权删除。

### 存储输入约束与跨端能力

`@h-ai/storage/schemas` 是仅依赖 Zod 的浏览器安全入口；`api-contract` 与 `serv` 复用同一规则。Schema 只校验输入，服务端仍先认证、再按可信 session 授权每个资源，Local Provider 仍执行文件系统防逃逸。调用方不能把前缀校验或分页游标当成授权。

#### 输入边界

- `StorageKeySchema`：非空、不是纯空白，UTF-8 最多 1024 **字节**；不允许开头 `/`、反斜线、控制字符，以及独立的 `.` / `..` 路径段。不截断、不归一化 key。
- `StoragePrefixSchema`：同样的路径和字节限制，另允许空字符串；允许部分文件名，`report` 不等于目录 `report/`。
- `StorageDeleteKeysSchema`：每个 HTTP 请求 1–1000 个键，按原始数组数量计数，重复项不能绕过上限。Node `file.deleteMany` 允许更大数组，S3 每批最多 1000、Local 并发最多 32；失败时检查 `error.ext.deleteMany` 的已完成/失败/未知/未尝试进度，不能盲目重放整个数组。
- 列表 `maxKeys`：整数 1–1000，`files` 与 `commonPrefixes` 共用预算。续页使用响应原样返回的 token，并保持相同 Provider/根目录/prefix/delimiter；不保证并发写入期间的快照。
- 签名有效期：整数 1–604800 秒，Node 默认 3600 秒，默认 HTTP procedures 使用 900 秒。HTTP 上传签名只接受 `key`、`contentType`、`expiresIn`；下载签名只接受 `key`、`expiresIn`。未知字段直接拒绝，包括未实现的 `contentLength` / `maxSize`，不静默丢弃或假装限制已生效。
- 输入校验在 HTTP 层返回 400；`apiClient` 返回 `HaiApiClientError.VALIDATION_FAILED`，`error.cause.status` 保留 400。合法输入的业务失败仍按 `HaiResult.success` 判断。

```ts
import { StorageDeleteFilesInputSchema } from '@h-ai/api-contract/storage'
import { StorageKeySchema } from '@h-ai/storage/schemas'

const key = StorageKeySchema.safeParse('users/u1/report.pdf')
if (key.success) {
  const input = StorageDeleteFilesInputSchema.parse({
    keys: [key.data]
  })
  // 把 input 交给已初始化的 client.storage.files.deleteMany；仍须检查返回值 success。
}
```

#### 能力映射

| Node storage 能力                                  | api-contract / serv 默认端点            | apiClient / 浏览器消费                                | 边界                                                                                          |
| -------------------------------------------------- | --------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `presign.getUrl`                                   | `POST /storage/presigned-urls/download` | `storage.presignedUrls.createDownload`                | 仅 S3；Local 返回 `hai:storage:018`，不返回虚拟 URL                                           |
| `presign.putUrl`                                   | `POST /storage/presigned-urls/upload`   | `storage.presignedUrls.createUpload` 后直接 PUT 到 S3 | 仅内容类型与有效期；不是文件代理上传，也不提供上传大小/内容校验保证                           |
| `dir.list`                                         | `GET /storage/files`                    | `storage.files.list`                                  | 共享前缀约束与分页预算；逐次授权 prefix                                                       |
| `file.head`                                        | `POST /storage/files/metadata`          | `storage.files.getMetadata`                           | 返回元数据，不能把 ETag 当内容 checksum                                                       |
| `file.delete`                                      | `DELETE /storage/files`                 | `storage.files.delete`                                | 逐资源授权                                                                                    |
| `file.deleteMany`                                  | `POST /storage/files/delete-many`       | `storage.files.deleteMany`                            | HTTP 总量上限 1000，返回可确认的删除进度                                                      |
| `file.put/get/getStream/copy/exists`、`dir.delete` | 无默认端点                              | 应用自行提供有界且鉴权的服务端流程                    | 流、Range、AbortSignal、metadata、cacheControl、条件写等 Node 选项不能直接作为预签名 API 入参 |
| `checksum.generate/verify`                         | 无默认端点                              | 应用选择明确的浏览器实现或服务端校验流程              | Node 无状态工具；不是上传接口自动校验                                                         |
| `presign.publicUrl`                                | 无默认端点                              | 应用按公开资源策略使用                                | 仅配置公开 S3 地址时有 URL；不是鉴权链接，Local 为 null                                       |

`FileUpload` / `ImageUpload` / `AvatarUpload` 的 `uploadHandler` 由应用实现。组件的 `maxSize`、`accept` 只负责前端选择体验，不能约束拿到签名后绕过组件的上传；服务端应在对象落库/回调或独立代理上传处验证实际大小、类型、内容和归属，再发布业务记录。不要把 Node `UploadOptions` 当成签名选项，也不要给组件编造不存在的框架上传端点。

### 在表单和服务端共享对象键规则

从 `@h-ai/storage/schemas` 导入 `getStorageKeyIssue` 检查一个原始键，或使用两个 Schema 直接校验并得到 Zod 结果。

```ts
import { getStorageKeyIssue, StorageKeySchema, StoragePrefixSchema } from '@h-ai/storage/schemas'

const invalid = getStorageKeyIssue('../private.txt') // 点路径段，返回 'segments'。
const empty = getStorageKeyIssue('') // 空对象键，返回 'empty'。
const prefixIssue = getStorageKeyIssue('', true) // 允许用空前缀列出对象，返回 undefined。
const key = StorageKeySchema.safeParse('reports/february.pdf') // success 为 true，data 为原始键。
const prefix = StoragePrefixSchema.safeParse('reports/fe') // success 为 true，data 为部分前缀。
```

`undefined` 表示通过共享语法校验。应用仍需确认操作权限和目录边界，LocalProvider 还会拒绝内部保留名称。

## 错误处理

收到 `HaiResult<T>` 时先检查 `result.success`。成功时读取 `result.data`，失败时查看 `result.error`。记录故障时保留错误码和追踪编号，便于从日志找到对应请求。

```ts
import { HaiStorageError, storage } from '@h-ai/storage'

const result = await storage.file.get('image.png')
if (!result.success && result.error.code === HaiStorageError.NOT_INITIALIZED.code) {
  // 存储未初始化
}
```

常用错误码：

| 错误码                                  | code              | 说明                                          |
| --------------------------------------- | ----------------- | --------------------------------------------- |
| `HaiStorageError.NOT_INITIALIZED`       | `hai:storage:010` | 未初始化                                      |
| `HaiStorageError.CONNECTION_FAILED`     | `hai:storage:001` | 连接失败                                      |
| `HaiStorageError.OPERATION_FAILED`      | `hai:storage:002` | 操作失败                                      |
| `HaiStorageError.NOT_FOUND`             | `hai:storage:003` | 文件不存在                                    |
| `HaiStorageError.PERMISSION_DENIED`     | `hai:storage:005` | 权限不足                                      |
| `HaiStorageError.PRESIGN_FAILED`        | `hai:storage:013` | 预签名 URL 生成失败                           |
| `HaiStorageError.UNSUPPORTED_OPERATION` | `hai:storage:018` | 当前 Provider 不支持该操作（如 local 预签名） |
| `HaiStorageError.INVALID_LIST_OPTIONS`  | `hai:storage:019` | 本地列表参数或游标无效、游标查询范围不匹配    |
| `HaiStorageError.CONFIG_ERROR`          | `hai:storage:012` | 配置错误                                      |
