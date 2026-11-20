# @h-ai/storage 功能说明

[English](storage.en.md) · [日本語](storage.ja.md)

在 Node.js 服务端用 `storage` 读写本地文件或 S3 兼容对象存储。浏览器要直接上传或下载 S3 对象时，先向应用服务端取得为指定对象和操作签名的临时 URL。

Node.js 进程中的文件操作从 `storage` 调用。浏览器用 `apiClient.storage` 向应用服务端申请签名地址，再选用 `@h-ai/storage/client` 的上传、下载工具直接访问存储服务。

[模块 README](../../../packages/storage/README.md) · [配置清单](../configuration/storage.md) · [数据结构](../data/storage.md) · [存储接入](../development/data.md)

<a id="quick-start"></a>

## 最小接入示例

### Node.js 服务端

将已校验的 S3 或 local 配置和 PNG 字节传给 `storeImage`。本例管理一次完整的连接生命周期。常驻服务应在应用启动时初始化，并在停机时关闭。

```ts
import type { FileMetadata, StorageConfigInput } from '@h-ai/storage'
import type { Buffer } from 'node:buffer'
import { storage } from '@h-ai/storage'

export async function storeImage(config: StorageConfigInput, imageBuffer: Uint8Array) {
  // 选择一个后端，检查初始化结果。
  // 使用调用方传入的后端配置。成功建立连接且无 data，连接失败读取 error。
  const initialized = await storage.init(config)
  if (!initialized.success)
    throw new Error(initialized.error.message)

  let result: { metadata: FileMetadata, bytes: Buffer, downloadUrl?: string }
  let closed
  try {
    const key = 'uploads/image.png'
    // 用对象 key 写入 PNG 字节，成功时返回对象元数据。
    // 将调用方 PNG 字节写到本例对象键，data 为元数据，写入失败读取 error。
    const uploaded = await storage.file.put(key, imageBuffer, { contentType: 'image/png' })
    if (!uploaded.success)
      throw new Error(uploaded.error.message)

    // 用同一 key 读取对象内容，成功时返回 Buffer。
    // 用刚写入的 key 读取 PNG，成功 data 为 Buffer，缺失或读取失败返回错误。
    const downloaded = await storage.file.get(key)
    if (!downloaded.success)
      throw new Error(downloaded.error.message)

    result = { metadata: uploaded.data, bytes: downloaded.data }
    if (config.type === 's3') {
      // S3 可签发有效期为 3600 秒的下载 URL。
      // 为同一 S3 键签发 3600 秒下载地址，data 为 URL 字符串，签发失败读取 error。
      const signed = await storage.presign.getUrl(key, { expiresIn: 3600 })
      if (!signed.success)
        throw new Error(signed.error.message)
      result.downloadUrl = signed.data
    }
  }
  finally {
    // 释放本次连接，失败时交由调用方处理。
    // 不传参数，释放本次连接。成功 data 为 undefined，失败由下方检测。
    closed = await storage.close()
  }
  if (!closed.success)
    throw new Error(closed.error.message)
  return result
}
```

### 浏览器客户端

浏览器通过已初始化的 `apiClient` 获取 S3 上传地址。将应用授权的对象 key 和用户选择的 `File` 传给 `uploadImage`。

```ts
import { apiClient } from '@h-ai/api-client'
import { uploadWithPresignedUrl } from '@h-ai/storage/client'

export async function uploadImage(key: string, file: File) {
  // 用相同的 Content-Type 请求签名和上传。
  const contentType = file.type || 'application/octet-stream'
  // 向已绑定的 API 提交对象键及 MIME 类型，成功 data 含上传地址和服务端确认的键，失败读取 error。
  const signed = await apiClient.storage.presignedUrls.createUpload({ key, contentType })
  if (!signed.success)
    throw new Error(signed.error.message)

  // 直接上传到对象存储，成功时返回服务端确认的对象 key。
  // 使用已签名 URL、原文件及签名时的 MIME 类型直传。成功表示响应已接受，失败读取 error。
  const uploaded = await uploadWithPresignedUrl(signed.data.url, file, { contentType })
  if (!uploaded.success)
    throw new Error(uploaded.error ?? 'Upload failed')
  return signed.data.key
}
```

> 注意：`@h-ai/storage` 不内置 HTTP 路由；请在应用层自行实现签名 URL API。

<a id="api-reference"></a>

## 功能说明

下面的场景代码从本页最小接入中导入模块；除连接/关闭场景外，均在初始化成功后、关闭前运行。`value` 先检查 `HaiResult.success`，失败保留原错误，成功返回 data；只用于读取结果。各场景使用独立测试数据，不能把相邻片段当成无需清理的生产脚本。

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="connection"></a>

### 连接与关闭：`storage`

本地目录和 S3 对象使用同一文件 API；应用负责初始化与关闭连接。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `storage.init` | 准备本地路径或 S3 存储客户端 | `config`（必填） | `Promise<HaiResult<void>>` | `await storage.init({ type: 'local', root: './data/files' })` |
| `storage.close` | 释放存储客户端；已保存的文件仍由原后端持有 | 已保存的文件仍由原后端持有；无 | `Promise<HaiResult<void>>` | `await storage.close()` |

#### 场景：连接与关闭

```ts
// 用 ./data/files-demo 目录初始化本地存储，成功可访问其对象文件，失败由 value 抛出。
value(await storage.init({ type: 'local', root: './data/files-demo' }))
// 不传参数释放本地后端，成功无 data 且文件留在磁盘，失败由 value 抛出。
value(await storage.close()) // undefined; saved files remain on disk
```

输入为开发环境目录。close 释放实例但不会删除目录内文件，下一场景先重新初始化。

模块在健康检查通过后才允许业务读写。如果初始化失败，会尝试释放已经打开的资源。释放也失败时，返回的 `error.ext.cleanupPending` 为 `true`。

关闭会等待正在进行的初始化，多次同时关闭只执行一次清理。关闭期间 `isInitialized` 为 `false`，配置与读写操作暂停。关闭失败时，下次调用 `close()` 或 `init()` 会先重试释放原连接。检查 `await storage.close()` 的结果，再停止本模块依赖的其他服务。

```ts
// 无参数尝试关闭当前后端，成功释放资源，失败进入下方重试分支。
const closed = await storage.close()
if (!closed.success) {
  // 处理清理故障后有限重试；再次失败应向应用报告。
  // 无参数重试同一资源的清理，成功无 data，再次失败向调用方抛出。
  const retried = await storage.close()
  if (!retried.success)
    throw new Error(retried.error.message)
}
```

S3 普通请求客户端与禁用请求重试的批量删除客户端分别释放；一个失败不阻止另一个清理，已释放的客户端不会重复释放。

初始化成功后才能调用业务方法。应用代码在调用前准备实际的业务参数，校验输入和权限。收到 `HaiResult` 时先检查 `success`，成功时读 `data`，失败时读 `error`。成功结果为 `void` 时没有业务数据。返回 `null` 时表示没有找到值。

#### 生产后端要求

生产使用共享 S3 或兼容服务；local 只用于开发/明确测试。对象业务授权和读改写的条件提交由应用负责。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化发布成功前校验；仅 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试可豁免。 [状态、并发和恢复边界](../../../.agents/instructions/distributed-state.md).

> 注意：`storage.config` 返回的是**脱敏配置快照**；S3 密钥类字段会被替换为 `[REDACTED]`，不能用于重新初始化。

<a id="files"></a>

<a id="api-概览"></a>

### 读写与复制文件：`storage.file`

以业务对象键定位文件；内容、元数据和流分别读取，批量删除要检查每项进度。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `storage.file.put` | 写入文件内容与元数据 | key, data, options | `FileMetadata` | `await storage.file.put('report.txt', 'text', { contentType: 'text/plain' })` |
| `storage.file.get` | 读取完整文件字节 | key, options | `Buffer<ArrayBufferLike>` | `await storage.file.get('report.txt')` |
| `storage.file.getStream` | 取得逐块读取的文件流 | key, options | `AsyncIterable<Uint8Array<ArrayBufferLike>>` | `await storage.file.getStream('report.txt')` |
| `storage.file.head` | 读取文件元数据 | key | `FileMetadata` | `await storage.file.head('report.txt')` |
| `storage.file.exists` | 检查文件是否存在 | key | `boolean` | `await storage.file.exists('report.txt')` |
| `storage.file.copy` | 复制到另一个对象键 | sourceKey, destKey, options | `FileMetadata` | `await storage.file.copy('report.txt', 'archive/report.txt')` |
| `storage.file.delete` | 删除指定文件 | key | `void` | `await storage.file.delete('report.txt')` |
| `storage.file.deleteMany` | 批量删除并报告逐项进度 | keys | `StorageDeleteResult` | `await storage.file.deleteMany(['report.txt', 'archive/report.txt'])` |

#### 场景：读写与复制文件

```ts
// 以纯文本类型保存 hello 到报告键，成功元数据的大小为 5 字节，写入失败由 value 抛出。
const saved = value(await storage.file.put('demo/report.txt', 'hello', { contentType: 'text/plain' }))
// saved describes key demo/report.txt, size 5 and backend timestamps
// 检查刚写入的报告，data 为 true，后端查询失败由 value 抛出。
value(await storage.file.exists('demo/report.txt')) // true
// 传报告键读取元数据，返回同一键及 5 字节等属性，缺失或后端失败由 value 抛出。
const metadata = value(await storage.file.head('demo/report.txt')) // same key and size
// 传报告键获取完整字节，转 UTF-8 得 hello，读取失败由 value 抛出。
value(await storage.file.get('demo/report.txt')).toString('utf8') // 'hello'
// 按报告键打开字节流，打开失败由 value 抛出，打开成功后读取错误可在遍历时抛出。
const stream = value(await storage.file.getStream('demo/report.txt'))
let byteCount = 0
for await (const bytes of stream)
  byteCount += bytes.byteLength
// byteCount === 5; stream iteration can throw on later I/O failure
// 将报告复制到 demo/copy.txt，成功返回新键的元数据，复制失败由 value 抛出。
value(await storage.file.copy('demo/report.txt', 'demo/copy.txt')) // metadata for the new key
// 删除原报告键，成功无 data，删除失败由 value 抛出。
value(await storage.file.delete('demo/report.txt')) // undefined
// 传仅含复制键的列表，成功返回逐键删除汇总，部分失败带进度并由 value 抛出。
const deleted = value(await storage.file.deleteMany(['demo/copy.txt'])) // per-key deletion progress
// 核对删除后的复制键，未被重建时 data 为 false，查询失败由 value 抛出。
value(await storage.file.exists('demo/copy.txt')) // false after confirmed deletion
```

输入为 UTF-8 的 hello，共五个字节。流不能预设分几块返回，迭代中的 I/O 错误需要调用方处理；deleteMany 的成功结果仍要核对逐项确认，不能只判断 Promise 完成。

#### 文件流、条件写与批量删除的约束

`file.put()` 支持 Buffer、Uint8Array、字符串及 `AsyncIterable<Uint8Array>`（如 Node Readable）；流上传内部使用有界 S3 multipart。`getStream()` 返回字节流，支持 Range 与 `signal` 取消；初始失败返回 HaiResult，迭代期间的 I/O/取消错误由消费方处理。原 `get()` 仍返回完整 Buffer，适合小文件。

上传选项 `{ ifNoneMatch: '*' }` 通过标准 S3 条件写或本地原子发布拒绝覆盖，冲突返回 `ALREADY_EXISTS`；S3 服务不支持条件写时返回错误，不降级为覆盖。失败/取消会清理临时文件或未完成分片；取消不能撤销已经发布的对象。

Local 在内容文件旁的保留目录 `.hai-storage-meta/` 中准备与文件身份绑定的代际元数据，再以内容文件的原子发布作为提交点。元数据准备失败不会新增或覆盖内容；默认元数据也有空记录，不继承旧对象的类型或业务字段。发布后清理明确旧代际失败只记录诊断，不将已提交写入报告为失败；并发或崩溃可能留下尚未确认可回收的内部记录，不做推测性删除。`.meta.json`、`.upload.tmp` 后缀和 `.hai-storage-meta` 在每个路径段均保留，不能直接读写或删除。代际记录是唯一元数据格式，缺少有效记录时明确返回错误；重建对象使用可信内容及业务元数据，通过 `file.put()` 写入。备份同时保存内容与内部记录，禁止绕过此格式直接混写。

S3 `file.copy()` 对源键按路径段编码，中文、空格及 URL 分隔字符仍作为原始对象键处理；调用方传原始 key，不要提前编码。

`file.deleteMany(keys)` 返回 `StorageDeleteResult`：成功时 `data` 为 `{ deletedKeys, failures: [] }`；任一删除项未确认完成时返回 `OPERATION_FAILED`，进度在 `error.ext?.deleteMany`（初始化等前置错误可能不带进度）。重复输入只处理一次，输出 key 不含配置 prefix。S3 每批最多 1000 项，逐项检查 `Deleted` 与 `Errors`；HTTP 200 不代表全部成功，遗漏/重复/未知回执标为 `unknown`。本地删除最多并发 32 项。

只对明确的 `InternalError / ServiceUnavailable / SlowDown / RequestTimeout` 项最多尝试三次；成功及权限失败项不重发。`DeleteObjects` 专用客户端禁用 SDK 请求重试；网络中断立即标为 `unknown`，未发送的后续批次标为 `notAttempted`，不盲目重放未知结果。`retryable` 只表示故障类别，调用方重试前仍须核对未知结果及并发写入。`dir.delete()` 传播删除失败；它不能阻止并发新增对象。S3 使用不带 VersionId 的删除，开启版本控制的桶可能创建删除标记，不保证清除历史版本。

`@h-ai/serv` / `@h-ai/api-client` 的 `storage.files.deleteMany` 使用同一成功结构并透传失败进度。

```ts
// 请求删除两个键，成功返回删除汇总，部分失败从 error.ext.deleteMany 读取已知进度。
const result = await storage.file.deleteMany(['a.txt', 'b.txt'])
if (!result.success) {
  const progress = result.error.ext?.deleteMany
  // 结合 outcome 与业务写入状态决定补偿；未知结果不能当作未执行。
  const knownFailures = progress?.failures.filter(item => item.outcome === 'failed' && item.retryable) ?? []
}
```

#### 场景：通过已授权的 HTTP 接口申请上传地址

公共 HTTP API 统一由 `@h-ai/api-contract` 提供，并由 `@h-ai/serv` 的 `createStorageProcedures({ storage, authorize })` 绑定到本模块能力。

```ts
import { apiClient } from '@h-ai/api-client'

// 通过已授权的客户端为 avatar.png 申请直传地址，data 包含 URL 及对象键，失败读取 error。
const result = await apiClient.storage.presignedUrls.createUpload({ key: 'avatar.png' })
if (!result.success)
  throw new Error(result.error.message)
```

预签名只支持 S3。local 的 `getUrl()` / `putUrl()` 返回 `HaiStorageError.UNSUPPORTED_OPERATION`（`hai:storage:018`），`publicUrl()` 返回 `null`；不会返回虚拟 URL。serv 与 apiClient 保留该失败结果，调用方须先检查 `success` 再消费 URL。本地开发文件可由应用已有的鉴权上传/下载接口处理，本模块不内置 HTTP 文件路由或签名验证服务。

#### HTTP 输入约束

存储 key 按 UTF-8 最多 1024 字节，并拒绝绝对路径、反斜线、控制字符及点路径段；公开 HTTP 批量删除每次 1–1000 项。`@h-ai/storage/schemas` 提供浏览器安全的共同规则。预签名有效期为整数 1–604800 秒（Node 默认 3600，HTTP 默认 900）；HTTP 上传仅接受 key/contentType/expiresIn，不支持 contentLength/maxSize/metadata/checksum。无效输入返回 HTTP 400，typed client 映射 VALIDATION_FAILED。FileUpload 的大小/类型限制仅为前端体验，实际对象须由应用服务端复核。Node 流式读写/checksum/条件写等没有默认 HTTP 端点。完整映射与授权边界见 [存储 API 能力](#存储输入约束与跨端能力).

<a id="存储输入约束与跨端能力"></a>

#### 共享输入规则与授权边界

`@h-ai/storage/schemas` 是仅依赖 Zod 的浏览器安全入口；`api-contract` 与 `serv` 复用同一规则。Schema 只校验输入，服务端仍先认证、再按可信 session 授权每个资源，Local Provider 仍执行文件系统防逃逸。调用方不能把前缀校验或分页游标当成授权。

#### 对象键、分页与期限

- `StorageKeySchema`：非空、不是纯空白，UTF-8 最多 1024 **字节**；不允许开头 `/`、反斜线、控制字符，以及独立的 `.` / `..` 路径段。不截断、不归一化 key。
- `StoragePrefixSchema`：同样的路径和字节限制，另允许空字符串；允许部分文件名，`report` 不等于目录 `report/`。
- `StorageDeleteKeysSchema`：每个 HTTP 请求 1–1000 个键，按原始数组数量计数，重复项不能绕过上限。Node `file.deleteMany` 允许更大数组，S3 每批最多 1000、Local 并发最多 32；失败时检查 `error.ext.deleteMany` 的已完成/失败/未知/未尝试进度，不能盲目重放整个数组。
- 列表 `maxKeys`：整数 1–1000，`files` 与 `commonPrefixes` 共用预算。续页使用响应原样返回的 token，并保持相同 Provider/根目录/prefix/delimiter；不保证并发写入期间的快照。
- 签名有效期：整数 1–604800 秒，Node 默认 3600 秒，默认 HTTP procedures 使用 900 秒。HTTP 上传签名只接受 `key`、`contentType`、`expiresIn`；下载签名只接受 `key`、`expiresIn`。未知字段直接拒绝，包括未实现的 `contentLength` / `maxSize`，不静默丢弃或假装限制已生效。
- 输入校验在 HTTP 层返回 400；`apiClient` 返回 `HaiApiClientError.VALIDATION_FAILED`，`error.cause.status` 保留 400。合法输入的业务失败仍按 `HaiResult.success` 判断。

```ts
import { StorageDeleteFilesInputSchema } from '@h-ai/api-contract/storage'
import { StorageKeySchema } from '@h-ai/storage/schemas'

// 校验报告对象键，成功 data 为原字符串，无效键返回校验问题。
const key = StorageKeySchema.safeParse('users/u1/report.pdf')
if (key.success) {
  // 用上一步验证的键组装批量删除请求，成功返回校验后的输入，无效结构抛出校验错误。
  const input = StorageDeleteFilesInputSchema.parse({
    keys: [key.data]
  })
  // 把 input 交给已初始化的 client.storage.files.deleteMany；仍须检查返回值 success。
}
```

#### Node 与 HTTP 能力对应

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

<a id="directories"></a>

### 按前缀浏览与清理：`storage.dir`

目录表示对象键前缀；分页列出其中的文件，删除前缀时应先确认授权和范围。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `storage.dir.list` | 分页列出前缀内的对象 | options | `ListResult` | `await storage.dir.list({ prefix: 'reports/', maxKeys: 20 })` |
| `storage.dir.delete` | 删除指定前缀内的对象 | prefix | `void` | `await storage.dir.delete('reports/')` |

`storage.dir.delete(prefix)` 按对象键的字符串前缀逐页删除。例如 `reports/draft-` 匹配 `reports/draft-1.txt`，`reports/` 匹配该目录样式的键。空前缀清空容器中的对象。

#### 场景：按前缀浏览与清理

```ts
// 在示例前缀下写入 1 字节内容，成功返回元数据，失败由 value 抛出。
value(await storage.file.put('demo-prefix/a.txt', 'a'))
// 按 demo-prefix/ 筛选最多 20 个对象，返回包含 a.txt 的分页结果，失败由 value 抛出。
const page = value(await storage.dir.list({ prefix: 'demo-prefix/', maxKeys: 20 }))
// page contains metadata for demo-prefix/a.txt and backend pagination information
// 删除此前缀下对象，成功无 data，部分失败由 value 抛出。
value(await storage.dir.delete('demo-prefix/')) // undefined
// 按原键核对清理，未发生重建时 data 为 false，查询失败由 value 抛出。
value(await storage.file.exists('demo-prefix/a.txt')) // false when no concurrent writer recreates it
```

输入限定 demo-prefix/。实际返回页包含文件元数据及续页信息；删除与并发写入不是同一个事务，其他请求仍可能重新创建对象。

<a id="signed-urls"></a>

### 授权直传与下载：`storage.presign`

仅 S3 支持指定对象的短期签名 URL；应用先核验用户对该对象和操作的权限，再签发。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `storage.presign.getUrl` | 签发短期下载地址 | key, options | `string` | `await storage.presign.getUrl('report.txt', { expiresIn: 300 })` |
| `storage.presign.putUrl` | 签发短期上传地址 | key, options | `string` | `await storage.presign.putUrl('report.txt', { expiresIn: 300, contentType: 'text/plain' })` |
| `storage.presign.publicUrl` | 读取公开地址规则 | key | `string \| null` | `storage.presign.publicUrl('report.txt')` |

#### 场景：授权直传与下载

签名 URL 把授权请求与文件内容传输分开。以下流程适用于已初始化的 S3 后端，应用先确定用户可操作的对象键。

![私有文件：先授权，再直传或下载](../images/function-storage-presign.svg)

API 返回 URL 仅表示已经签发访问凭据，文件尚未上传或下载。浏览器随后直连对象存储，校验签名和期限后才传输字节；上传的 Content-Type 要与签发时一致。publicUrl 只计算公开地址规则，不做授权，也不会把私有文件改成公开。

```ts
// Requires initialized S3 storage and prior application authorization.
// 用报告键和 text/plain 签发 300 秒的上传 URL，data 是地址字符串，签发失败由 value 抛出。
const uploadUrl = value(await storage.presign.putUrl('reports/demo.txt', { expiresIn: 300, contentType: 'text/plain' }))
// 给相同报告键签发 300 秒下载 URL，data 是地址字符串，签发失败由 value 抛出。
const downloadUrl = value(await storage.presign.getUrl('reports/demo.txt', { expiresIn: 300 }))
// 按报告键与公开地址配置求 URL。无公开访问地址时返回 null。
const publicUrl = storage.presign.publicUrl('reports/demo.txt') // string or null
```

输入为相同对象键、300 秒期限。输出 URL 的签名和主机取决于后端；上传时 Content-Type 必须与签发参数一致。publicUrl 只读取公开地址规则，不检查权限，也不会使私有文件变公开。

#### 取消上传的结果

`uploadWithPresignedUrl(url, data, { onProgress, abortController })` 使用原生 XHR 报告进度；不传 `onProgress` 时使用 fetch。预先取消不发送请求，准备阶段和进行中取消、外部 XHR abort、网络/超时及进度回调异常都只结算一次失败，并移除本次监听。完成后再取消不会操作旧 XHR。取消只终止本地请求，不能回滚远端已写入的对象；应用须先核对对象状态，再授权删除。

#### 场景：校验对象键与目录前缀

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

<a id="download-authorization"></a>

#### 场景：在应用中授权下载

由框架部署自建存储时，没填 `bucket` 和 `region` 就分别使用 `hai` 和 `us-east-1`。应用直接调用 `storage.init()` 连接 S3 时，仍需提供这两项。`publicEndpoint` 没有自动猜测值，SSH Host 别名、HTTP 端口与用户实际访问的 HTTPS 地址可能不同，部署前应明确填写。

1. 先调用 `storage.init()` 并检查成功。应用的签名 API 应先核对登录身份、下载权限和文件归属，再生成地址。
2. 调用 `apiClient.storage.presignedUrls.createDownload({ key, expiresIn: 300 })`，确认 `result.success` 后使用 `result.data.url`。下载时浏览器直接请求这条 URL；下载字节不经过生成签名的 Serv 请求。
3. 需要浏览器保存大文件时，可把 URL 用作正常下载链接，并由 `responseContentDisposition` 声明文件名；不要为了下载再让应用 API 读取整个对象。现有 `downloadWithPresignedUrl` 也直连存储，但它为了进度/Blob 保存会占用客户端内存，应按文件规模选择。
4. 失败时重新经过授权获取新链接。返回 URL 已含配置的代理目录，调用方不能再加网站目录、改域名、改桶名或删查询；GET 的签名也不能拿来发送 HEAD 请求。客户端取消只结束本次传输，不撤销已经授予的 URL 或远端上传。

签名默认值仍分入口：Node 省略有效期为 3600 秒，HTTP 为 900 秒，允许整数 1–604800 秒；300 秒是上例建议值。下载签名可以设置响应 `Content-Type`、`Content-Disposition`；上传签名默认 `Content-Type` 为 `application/octet-stream`。上传 URL 只授权 PUT，不保证文件大小或内容符合业务要求，应用须在存储完成后核验实际对象。

<a id="checksums"></a>

### 检查字节是否一致：`storage.checksum`

Node 将大块内存输入的摘要交给有界 Worker 池。流式输入继续逐块读取，并遵循调用方的取消信号。

校验工具不要求初始化存储；发送方与接收方必须使用相同算法和编码。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `storage.checksum.generate` | 计算内容校验和 | data, options | `string` | `await storage.checksum.generate('text')` |
| `storage.checksum.verify` | 核对内容校验和 | data, expected, options | `boolean` | `await storage.checksum.verify(bytes, expectedDigest)` |

#### 场景：检查字节是否一致

```ts
// 对 hello 的字节生成默认 SHA-256 摘要字符串，失败由 value 抛出。
const digest = value(await storage.checksum.generate('hello'))
// 用同一字节及刚生成的摘要核对，成功 data 为 true，计算失败由 value 抛出。
value(await storage.checksum.verify('hello', digest)) // true
// 将修改后的字节与原摘要比对，成功 data 为 false，计算失败由 value 抛出。
value(await storage.checksum.verify('changed', digest)) // false
```

同一份 hello 字节与摘要匹配，修改内容后为 false。摘要不是访问凭据，S3 的 ETag 也不等于这里的内容摘要。

#### 摘要算法与取消规则

`checksum` 是 Node 端无状态工具，无需初始化，按实际输入字节生成/校验，流输入仅消费一次。默认 SHA-256、小写 hex；可选 `algorithm: 'sha256' | 'sha384' | 'sha512' | 'sha1' | 'md5'`、`encoding: 'hex' | 'base64'` 和 `signal`。不匹配返回 `ok(false)`，非法格式/算法及读取失败返回错误。MD5/SHA-1 只用于兼容性完整性校验，不用于安全认证；ETag、S3 multipart 复合 checksum 不等同于完整文件摘要。此工具不强制 S3 兼容服务支持 AWS checksum 扩展。

取消计算会结束对下一块数据的等待，并请求关闭输入迭代器。本地 `getStream()` 读取目录时直接返回 `INVALID_PATH`，不将目录报告为可消费的文件流。

<a id="browser-files"></a>

### 在浏览器上传、下载与保存：客户端工具

这些工具接收服务端已经授权的 URL 或用户选择的文件；不初始化服务端 Storage，也不会自行申请业务权限。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `uploadWithPresignedUrl` | 直传文件 | `url, File/Blob/ArrayBuffer/string, options?` | `Promise<{ success: boolean; error?: string }>` | `await uploadWithPresignedUrl(url, file, { contentType: file.type })` |
| `downloadWithPresignedUrl` | 读取下载内容 | `url, options?` | `Promise<{ success: boolean; data?: Blob; error?: string }>` | `await downloadWithPresignedUrl(url)` |
| `downloadAndSave` | 下载并触发保存 | `url, { filename?, ...options }?` | `Promise<{ success: boolean; data?: Blob; error?: string }>` | `await downloadAndSave(url, { filename: "report.txt" })` |
| `getFileExtension` | 读取扩展名 | `File` | `string` | `getFileExtension(file)` |
| `getMimeType` | 按扩展名查类型 | `extension: string` | `string` | `getMimeType("txt")` |
| `formatFileSize` | 显示字节大小 | `bytes: number` | `string` | `formatFileSize(1024)` |

#### 场景：上传用户文件后下载保存

input 的两个 URL 来自上方签名接口的成功响应，file 来自文件选择器；该函数由用户操作触发。上传和下载工具返回自己的 success/error 结构，不是 HaiResult。

```ts
import { downloadAndSave, downloadWithPresignedUrl, formatFileSize, getFileExtension, getMimeType, uploadWithPresignedUrl } from '@h-ai/storage/client'

async function transfer(file: File, uploadUrl: string, downloadUrl: string) {
  // 根据调用方文件名取扩展名，无扩展名时为空字符串。
  const extension = getFileExtension(file)
  // file.type 缺失时用上一步扩展名取得 MIME 类型，未识别时退回 application/octet-stream。
  const contentType = file.type || getMimeType(extension)
  // 传文件字节数生成可读字符串，例如 1024 字节显示为 1 KB。
  const displayedSize = formatFileSize(file.size) // 1024 bytes displays as 1 KB
  // 用调用方传的直传 URL、原文件及 MIME 类型上传，成功表示上传完成，失败读取 error。
  const uploaded = await uploadWithPresignedUrl(uploadUrl, file, { contentType })
  if (!uploaded.success)
    throw new Error(uploaded.error ?? 'Upload failed')
  // 用已签名下载地址取回内容，成功 data 为 Blob，失败读取 error。
  const downloaded = await downloadWithPresignedUrl(downloadUrl)
  if (!downloaded.success || !downloaded.data)
    throw new Error(downloaded.error ?? 'Download failed')
  // 用同一下载地址和原文件名触发浏览器保存，成功表示已触发保存，失败读取 error。
  const saved = await downloadAndSave(downloadUrl, { filename: file.name })
  if (!saved.success)
    throw new Error(saved.error ?? 'Save failed')
  return { extension, displayedSize, blob: downloaded.data }
}
```


## 错误处理

收到 `HaiResult<T>` 时先检查 `result.success`。成功时读取 `result.data`，失败时查看 `result.error`。记录故障时保留错误码和追踪编号，便于从日志找到对应请求。

```ts
import { HaiStorageError, storage } from '@h-ai/storage'

// 读取 image.png 的字节，成功 data 为 Buffer，模块未初始化时下方分支处理 NOT_INITIALIZED。
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
