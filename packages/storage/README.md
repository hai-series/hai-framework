# @h-ai/storage

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

## 简介

对象存储模块，提供统一 `storage` 访问入口，支持 S3 兼容存储与本地文件系统。

初始化只在健康检查成功后发布连接；失败时释放候选资源。若清理仍失败，初始化错误的 `error.ext.cleanupPending` 为 `true`。`storage.close()` 返回 `Promise<HaiResult<void>>`，等待正在进行的初始化，并合并并发关闭。开始清理后 `isInitialized` 为 `false`，配置与业务操作不再可用；清理失败仍保留资源，后续 `close()` 或 `init()` 先重试释放，成功前不会创建替代连接。调用方必须检查关闭结果。

```ts
const closed = await storage.close()
if (!closed.success) {
  // 处理清理故障后有限重试；再次失败应向应用报告。
  const retried = await storage.close()
  if (!retried.success) throw new Error(retried.error.message)
}
```

S3 普通请求客户端与禁用请求重试的批量删除客户端分别释放；一个失败不阻止另一个清理，已释放的客户端不会重复释放。

## 核心功能清单

- S3 协议（AWS S3 / MinIO / RustFS / OSS 等）
- 本地文件系统

## 使用入门

### 快速开始

#### Node.js 服务端

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
import { downloadAndSave, uploadWithPresignedUrl } from '@h-ai/storage/client'
import { apiClient } from '@h-ai/api-client'

// apiClient 已初始化，服务端使用 S3。
const signed = await apiClient.storage.presignedUrls.createUpload({ key: 'avatar.png' })
if (!signed.success) throw new Error(signed.error.message)
await uploadWithPresignedUrl(signed.data.url, file)
```

> 注意：`@h-ai/storage` 不内置 HTTP 路由；请在应用层自行实现签名 URL API。

### HTTP API 契约

公共 HTTP API 统一由 `@h-ai/api-contract` 提供，并由 `@h-ai/serv` 的 `createStorageProcedures({ storage, authorize })` 绑定到本模块能力。

```ts
import { apiClient } from '@h-ai/api-client'

const result = await apiClient.storage.presignedUrls.createUpload({ key: 'avatar.png' })
if (!result.success) throw new Error(result.error.message)
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

### 配置

- **S3**：`bucket / region / accessKeyId / secretAccessKey` 必填，可选 `endpoint / forcePathStyle / prefix / publicUrl`
- **Local**：`root` 必填，可选 `directoryMode / fileMode`

MinIO、RustFS 共用 S3 Provider，使用 `type: 's3'`，无需单独的存储类型。连接自建实例时指定 S3 API 端点（通常为 9000 端口）并启用路径风格；存储桶须预先创建。

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

#### 操作日志

可在存储配置中通过 `operationLog` 开启文件、目录和预签名 URL 操作日志。日志在 Local/S3 Provider 的真实操作处输出，不在 `storage-main.ts` 中做统一包装；文件内容不会写入日志，上传数据只记录字节长度。

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

`storage.presign.putUrl()` 当前仅支持 `contentType` 与 `expiresIn` 等签名参数，不提供 `maxSize` 约束。

本地存储的 `storage.dir.list()` 会递归扫描匹配前缀下的文件，仅支持 `maxKeys` 截断，不支持 `continuationToken` 真分页；大目录场景建议优先使用更窄的 `prefix`，或改用 S3 Provider 获取原生分页能力。

### 错误处理

```ts
import { HaiStorageError, storage } from '@h-ai/storage'

const result = await storage.file.get('image.png')
if (!result.success && result.error.code === HaiStorageError.NOT_INITIALIZED.code) {
  // 存储未初始化
}
```

常用错误码：

| 错误码                              | code              | 说明                |
| ----------------------------------- | ----------------- | ------------------- |
| `HaiStorageError.NOT_INITIALIZED`   | `hai:storage:010` | 未初始化            |
| `HaiStorageError.CONNECTION_FAILED` | `hai:storage:001` | 连接失败            |
| `HaiStorageError.OPERATION_FAILED`  | `hai:storage:002` | 操作失败            |
| `HaiStorageError.NOT_FOUND`         | `hai:storage:003` | 文件不存在          |
| `HaiStorageError.PERMISSION_DENIED` | `hai:storage:005` | 权限不足            |
| `HaiStorageError.PRESIGN_FAILED`    | `hai:storage:013` | 预签名 URL 生成失败 |
| `HaiStorageError.UNSUPPORTED_OPERATION` | `hai:storage:018` | 当前 Provider 不支持该操作（如 local 预签名） |
| `HaiStorageError.CONFIG_ERROR`      | `hai:storage:012` | 配置错误            |

## 开发测试

```bash
pnpm --filter @h-ai/storage test
```

S3 集成测试需要可用的 Docker 或兼容运行时；同一套初始化、文件、目录、预签名及真实 HTTP 上传下载用例分别在 MinIO 和 RustFS 上运行，不跳过容器启动失败。

- MinIO：[`ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z`](https://github.com/coollabsio/minio)，从上游源码构建的社区镜像。
- RustFS：[`ghcr.io/rustfs/rustfs:1.0.1`](https://github.com/rustfs/rustfs)，官方镜像。

容器使用临时生成的测试凭据，等待服务就绪后通过 S3 API 建桶；最后一个租约释放时移除容器及匿名卷。

## 生产共享状态

生产使用共享 S3 或兼容服务；local 只用于开发/明确测试。对象业务授权和读改写的条件提交由应用负责。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化发布成功前校验；仅 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试可豁免。 [状态、并发和恢复边界](../../docs/distributed-state.md)。

## 许可证

Apache-2.0
