# @h-ai/storage

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

对象存储模块，提供统一 `storage` 访问入口，支持 S3 兼容存储与本地文件系统。

## 快速开始

### Node.js 服务端

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
  // local 不支持预签名；向用户呈现错误，或使用应用已有的鉴权文件接口。
  // 失败结果不含可上传/下载的 URL。
}

// 关闭连接
const closeResult = await storage.close()
if (!closeResult.success) {
  throw new Error(closeResult.error.message)
}
```

#### 浏览器客户端

浏览器环境下仅导出客户端能力（签名 URL 上传/下载），不包含 `storage` 服务对象。

```ts
import { apiClient } from '@h-ai/api-client'
import { downloadAndSave, uploadWithPresignedUrl } from '@h-ai/storage/client'

// apiClient 已初始化，服务端使用 S3。
const signed = await apiClient.storage.presignedUrls.createUpload({ key: 'avatar.png' })
if (!signed.success)
  throw new Error(signed.error.message)
await uploadWithPresignedUrl(signed.data.url, file)
```

> 注意：`@h-ai/storage` 不内置 HTTP 路由；请在应用层自行实现签名 URL API。

## 功能

初始化只在健康检查成功后发布连接；失败时释放候选资源。若清理仍失败，初始化错误的 `error.ext.cleanupPending` 为 `true`。`storage.close()` 返回 `Promise<HaiResult<void>>`，等待正在进行的初始化，并合并并发关闭。开始清理后 `isInitialized` 为 `false`，配置与业务操作不再可用；清理失败仍保留资源，后续 `close()` 或 `init()` 先重试释放，成功前不会创建替代连接。调用方必须检查关闭结果。

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

### 功能输入输出

以下片段依赖本节完整初始化流程。示例中的业务值由宿主校验和授权后传入；异步领域结果先判断 success，再读取 data。表中 void 表示操作已完成且没有返回数据，null 表示不存在；同步工厂/工具直接返回表中类型。

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

生产使用共享 S3 或兼容服务；local 只用于开发/明确测试。对象业务授权和读改写的条件提交由应用负责。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化发布成功前校验；仅 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试可豁免。 [状态、并发和恢复边界](../../.agents/instructions/distributed-state.md).

### 输入约束与 HTTP 能力

存储 key 按 UTF-8 最多 1024 字节，并拒绝绝对路径、反斜线、控制字符及点路径段；公开 HTTP 批量删除每次 1–1000 项。`@h-ai/storage/schemas` 提供浏览器安全的共同规则。预签名有效期为整数 1–604800 秒（Node 默认 3600，HTTP 默认 900）；HTTP 上传仅接受 key/contentType/expiresIn，不支持 contentLength/maxSize/metadata/checksum。无效输入返回 HTTP 400，typed client 映射 VALIDATION_FAILED。FileUpload 的大小/类型限制仅为前端体验，实际对象须由应用服务端复核。Node 流式读写/checksum/条件写等没有默认 HTTP 端点。完整映射与授权边界见 [存储 API 能力](README.md#存储输入约束与跨端能力).

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

## 配置

生命周期：init 输入后端/业务配置，成功后才能使用；close 在释放借用依赖前等待完成。返回值以快速开始示例和公开签名为准。

Local 后端拒绝 key 路径中的文件符号链接和目录 junction，保留后缀 `.meta.json` / `.upload.tmp` 的保护不区分大小写。覆盖 put 会替换旧元数据，copy 默认继承源元数据；浏览器根入口仅提供 Schema、类型和客户端工具，不包含服务端 storage 单例。

- **S3**：`bucket / region / accessKeyId / secretAccessKey` 必填，可选 `createBucket / endpoint / publicEndpoint / forcePathStyle / prefix / publicUrl`
- **Local**：`root` 必填，可选 `directoryMode / fileMode`

MinIO、RustFS 共用 S3 Provider，使用 `type: 's3'`，无需单独的存储类型。连接自建实例时指定 S3 API 端点（通常为 9000 端口）并启用路径风格。

`createBucket` 默认 `false`，桶须预先存在。设为 `true` 后，`storage.init()` 先用 `HeadBucket` 检查，仅在明确返回 404 时创建缺失的桶；已有桶及对象保持不变。权限、网络、建桶或后续连接检查失败均返回失败，清理客户端且不发布就绪状态。并发创建只接受 `BucketAlreadyOwnedByYou`，并再次确认可访问。AWS `us-east-1` 创建时省略 LocationConstraint，其他区域按配置传入；默认自建 S3 部署通过 `HAI_STORAGE_CREATEBUCKET=true` 启用，外部 S3 按需授权。

YAML 显式引用 `createBucket: ${HAI_STORAGE_CREATEBUCKET:false}` 后可由环境变量控制；直接传入 `storage.init()` 时使用布尔值。

在 `config/_storage.yml` 中设置 `prefix: my-app/uploads/`，或在注册了 `StorageConfigSchema` 的 Hai 应用中设置 `HAI_STORAGE_PREFIX=my-app/uploads/`。上传 `report.pdf` 时，桶内对象键为 `my-app/uploads/report.pdf`。初始化探测和默认列表均查询 `my-app/uploads/`，配置值可省略末尾的斜杠。空前缀使用桶根，修改前缀不会搬迁已有对象。

要限制应用凭据的访问范围，将对象权限限定到 `arn:aws:s3:::my-bucket/my-app/uploads/*`，并对 `s3:ListBucket` 设置 `s3:prefix` 条件 `my-app/uploads/*`。使用预先创建的桶并保持 `createBucket: false`，避免建桶模式触发桶级 `HeadBucket` 检查。

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

### 内部连接与浏览器直连

`endpoint` 用于服务端读写、建桶和连接检查；`publicEndpoint` 用于 `presign.getUrl/putUrl` 的外部地址，无默认值，省略时继续使用 endpoint。可填写 `https://app.example.com/delivery/files`；目录段支持字母、数字、下划线、点和连字符，拒绝 `.`/`..`、重复斜杠及编码的分隔符，不能包含桶名、凭据、查询或片段。`publicUrl` 只拼接公开资源地址，不会为私有对象授权。

自建 Compose 内部地址为 `http://storage:9000`。上例生成 `/delivery/files/hai/private/report.zip?...`；不带目录时生成 `/hai/private/report.zip?...`。含目录的外部预签名固定使用桶路径风格，内部操作仍按 `forcePathStyle` 配置。Nginx 去除入口目录，保留真正的 S3 签名路径、查询和 Host，直接转发 Storage，大文件和 Range 不经过 Serv。Fullstack 复用 Web Nginx，SvelteKit SSR/独立 API 使用 gateway。入口可位于网站目录内，不能覆盖 API、资源或健康路径。增加网关、改变桶或公开地址须建立全量基线；增量与回滚保留已安装配置。

外部 AWS S3、R2 或已有独立网关使用自身可访问端点；保持/外部存储不生成到本地 sidecar 的路由。外部 HTTPS 入口必须保留签名 Host、原始路径和查询。跨源浏览器访问须在实际 S3 服务配置精确 CORS；当前网关不代替桶授权或 CORS 策略。签名 URL 是短期访问凭据，应控制有效期并避免写入日志；GET 签名不能当作 HEAD 签名使用。Local 不支持签名，不会把私有文件目录开放给 Nginx。

默认自建桶/区域为空时部署注入 hai/us-east-1；Storage Schema 没有这两个默认值。对象代理使用 CSP sandbox、nosniff、no-referrer 及 private,no-store 隔离不可信附件，避免同源 HTML 获得应用权限。该路由用于文件交付，不托管可执行网站脚本；外部 S3/CDN 由部署者设置等价策略。

#### 操作日志

Local 和 S3 默认记录写操作，读操作可通过 `operationLog.read` 开启。操作记录固定为 `debug`，由 Core 日志级别过滤。业务操作失败返回原错误并记录 `warn`，包括消费下载流时的失败。初始化、连接和关闭失败记录 `error`。操作日志只包含操作名、已知字节数或数量等安全摘要。浏览器签名上传和下载助手在浏览器记录失败。

```yaml
# config/_storage.yml
type: local
root: ./data/uploads
operationLog:
  read: false # file.get/head/exists, dir.list, presign.getUrl/publicUrl
  write: true # file.put/delete/deleteMany/copy, dir.delete, presign.putUrl
  maxLength: 1000 # 摘要字符上限，0 省略摘要
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

设置 `HAI_STORAGE_OPERATIONLOG_WRITE=false` 可关闭写操作的 `debug` 记录。升级时移除原有的 `operationLog.level` 和 `HAI_STORAGE_OPERATIONLOG_LEVEL`，通过 `HAI_CORE_LOGGING_LEVEL` 调整全局阈值。

`storage.file.put()` 失败时通过 `error.code` 和 `error.message` 区分场景，底层原因可用时保留在 `error.cause`。`ifNoneMatch: '*'` 的目标冲突返回 `ALREADY_EXISTS`，读取 `createReadStream()` 等上传源失败返回 `UPLOAD_FAILED`。主动取消保留 `AbortSignal.reason`。对应告警包含原因摘要及可用的底层错误码和 HTTP 状态。

S3 流式上传的错误可通过 `error.ext?.s3Operation` 查看失败操作。分片写入失败后若清理也失败，`error.cause` 保留原始失败，`error.ext?.cleanupError` 记录清理失败。告警记录两个失败的错误码及可用的服务端请求编号。

`storage.presign.putUrl()` 当前仅支持 `contentType` 与 `expiresIn` 等签名参数，不提供 `maxSize` 约束。

本地 `storage.dir.list()` 将 `prefix` 作为 key 字符串前缀（如 `reports/2026-`），按 UTF-8 字节序分页。`maxKeys` 为 1–1000 的整数，默认 1000，`files` 与 `commonPrefixes` 共用该预算。`delimiter` 将前缀之后首次出现的分隔符及其后内容折叠为一个 `commonPrefixes` 条目；空字符串不折叠，空物理目录不生成条目。这些分组与计数规则参照 [S3 ListObjectsV2](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html).

仅当还有条目时返回 `isTruncated: true` 与 `nextContinuationToken`。本地游标无需进程内缓存，绑定规范根目录、`prefix` 和 `delimiter`；相同根目录的独立实例或重启后可续页，也可调整下一页的 `maxKeys`。跨范围、格式非法或版本不支持的游标返回 `INVALID_LIST_OPTIONS`。游标不是授权凭据或目录快照：调用方仍须授权前缀，并发增删可能改变后续页；不支持将不同挂载路径的根目录视为同一范围。本地每次请求仍扫描、排序匹配目录，大目录应缩小前缀或使用 S3。

```ts
let continuationToken: string | undefined
do {
  const page = await storage.dir.list({ prefix: 'reports/2026-', maxKeys: 100, continuationToken })
  if (!page.success)
    return page
  // 消费 page.data.files 与 page.data.commonPrefixes。
  continuationToken = page.data.nextContinuationToken
} while (continuationToken)
```

配置由宿主加载和校验，再传入本模块；私密值放服务端私有环境，不传到浏览器。按实际使用场景逐项选择后端、容量、期限和日志策略，修改后重新初始化并核验成功结果。

[逐项配置说明、适用场景和示例](../../docs/usage/configuration/data.md).

## 错误处理

领域操作先判断 `result.success`，失败按本模块错误定义与安全提示处理，服务端保留错误码、关联编号和脱敏原因。同步工具、工厂、流迭代及生命周期按各自签名处理，不把 Promise 完成视为业务成功。具体失败与恢复边界见对应功能。

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

## 开发测试

```bash
pnpm --filter @h-ai/storage test
```

S3 集成测试需要可用的 Docker 或兼容运行时；同一套初始化、文件、目录、预签名及真实 HTTP 上传下载用例分别在 MinIO 和 RustFS 上运行，不跳过容器启动失败。

- MinIO：[`ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z`](https://github.com/coollabsio/minio)，从上游源码构建的社区镜像。
- RustFS：[`ghcr.io/rustfs/rustfs:1.0.1`](https://github.com/rustfs/rustfs)，官方镜像。

容器使用临时生成的测试凭据，等待服务就绪后通过 S3 API 建桶；最后一个租约释放时移除容器及匿名卷。

源码 JSDoc 遵循[统一规范](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)：公开示例使用实际发布入口，内部示例在原模块作用域检查。构建后执行 `pnpm check:jsdoc --package storage`；示例编译不代替真实后端行为验证。

真实 Chrome 回归：先安装可用的 Chrome，设置 `HAI_STORAGE_RUN_BROWSER_GATES=1` 后执行 `pnpm --filter @h-ai/storage exec vitest run tests/storage-client-browser.test.ts`。该门禁实际发送 HTTP PUT 并检查原生取消和监听清理；缺少浏览器会失败。

## 许可证

Apache-2.0
