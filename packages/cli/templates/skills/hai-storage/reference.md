# hai-storage 参考

> `@h-ai/storage` 提供统一文件存储接口，支持本地文件系统（LocalProvider）和 S3 兼容存储（S3Provider），通过 `storage.file`、`storage.dir`、`storage.presign` 访问存储，`storage.checksum` 提供 Node 端无需初始化的字节完整性工具。

## 运行环境

> ⚠️ **服务端模块**。`storage.file` / `storage.dir` / `storage.presign` 均在 Node.js 端使用。浏览器端通过预签名 URL 或 API 端点间接访问存储（见下方「浏览器端文件上传」）。

## 适用场景

- 文件上传与下载
- 预签名 URL 生成（客户端直传）
- S3 兼容存储对接（AWS S3、MinIO、RustFS、阿里云 OSS 等）
- 本地开发文件存储
- 目录前缀清理与批量文件删除

## 使用步骤

### 1. 配置

```yaml
# config/_storage.yml
type: local # local | s3
# 本地存储
root: ./data/storage
# S3 存储（type=s3 时生效）
# endpoint: ''
# region: us-east-1
# accessKeyId: ''
# secretAccessKey: ''
# bucket: my-bucket
# forcePathStyle: false
# prefix: ''
# publicUrl: ''
operationLog:
  read: false # file.get/head/exists, dir.list, presign.getUrl/publicUrl
  write: false # file.put/delete/deleteMany/copy, dir.delete, presign.putUrl
  maxLength: 1000
  level: debug # info | debug | trace
```

约定环境变量优先于 YAML，例如 `HAI_STORAGE_ROOT`、
`HAI_STORAGE_ACCESSKEYID`、`HAI_STORAGE_SECRETACCESSKEY`。

MinIO、RustFS 使用同一个 S3 Provider：配置 `type: s3`、S3 API `endpoint`（通常为 9000 端口）和 `forcePathStyle: true`，并预先创建 `bucket`；不要新增 `type: minio` 或 `type: rustfs`。

使用 hai-deploy 的默认自建 S3 配置时，可通过 `container.s3Engine`（`HAI_DEPLOY_CONTAINER_S3ENGINE`，`rustfs | minio`）选择实现，默认 RustFS。部署流程复用应用镜像中的 S3 SDK 幂等初始化 bucket，不依赖单独的 mc 镜像；自定义外部 S3 服务仍需确认 bucket 已存在且凭据有相应权限。

`operationLog` 在 Local/S3 Provider 的真实 file/dir/presign 操作处输出日志，不要在 `storage-main.ts` 或调用方重复包装。文件内容不会写入日志，上传数据只记录字节长度；`maxLength` 用于截断序列化后的参数，`level` 默认 `debug`。

### 2. 初始化与关闭

```typescript
import { storage } from '@h-ai/storage'

await storage.init(core.config.get('storage'))
// 使用后关闭
const closeResult = await storage.close()
if (!closeResult.success) {
  throw new Error(closeResult.error.message)
}
```

> `storage.config` 返回的是**脱敏配置快照**；S3 的 `accessKeyId` / `secretAccessKey` 等敏感字段会被替换为 `[REDACTED]`。

## 核心 API

### 文件操作

`storage.file` 提供以下方法：

- `put(key, data, options?)`
- `get(key, options?)`
- `getStream(key, options?)`（字节流，迭代错误可抛出）
- `head(key)`
- `exists(key)`
- `delete(key)`
- `deleteMany(keys)`
- `copy(sourceKey, destKey, options?)`

```typescript
// 上传文件
const result = await storage.file.put('avatars/user-123.png', fileBuffer, {
  contentType: 'image/png',
  metadata: { userId: '123' },
})

// 下载文件
const file = await storage.file.get('avatars/user-123.png')

// 列出文件
const files = await storage.dir.list({ prefix: 'avatars/', maxKeys: 100 })
```

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

### 预签名 URL

`storage.presign` 提供以下方法：

- `getUrl(key, options?)`
- `putUrl(key, options?)`
- `publicUrl(key)`

```typescript
// 客户端直传模式
const uploadUrl = await storage.presign.putUrl('uploads/doc.pdf', {
  expiresIn: 3600, // 1 小时有效
  contentType: 'application/pdf',
})

// 临时下载链接
const downloadUrl = await storage.presign.getUrl('uploads/doc.pdf', {
  expiresIn: 300, // 5 分钟有效
})
```

> `storage.presign.putUrl()` 当前不支持 `maxSize` 约束参数；如需大小限制，请在应用层上传前校验，或在服务端落库/回调处二次校验。

## 错误码 — `HaiStorageError`

| 错误码 | code | 说明 |
|--------|------|------|
| `HaiStorageError.CONNECTION_FAILED` | `hai:storage:001` | 连接失败 |
| `HaiStorageError.OPERATION_FAILED` | `hai:storage:002` | 操作失败 |
| `HaiStorageError.NOT_FOUND` | `hai:storage:003` | 文件不存在 |
| `HaiStorageError.ALREADY_EXISTS` | `hai:storage:004` | 文件已存在 |
| `HaiStorageError.CHECKSUM_FAILED` | `hai:storage:016` | checksum 读取/计算失败 |
| `HaiStorageError.INVALID_CHECKSUM` | `hai:storage:017` | checksum 格式/算法非法 |
| `HaiStorageError.PERMISSION_DENIED` | `hai:storage:005` | 权限不足 |
| `HaiStorageError.QUOTA_EXCEEDED` | `hai:storage:006` | 配额超限 |
| `HaiStorageError.INVALID_PATH` | `hai:storage:007` | 路径无效 |
| `HaiStorageError.IO_ERROR` | `hai:storage:008` | IO 错误 |
| `HaiStorageError.NETWORK_ERROR` | `hai:storage:009` | 网络错误 |
| `HaiStorageError.NOT_INITIALIZED` | `hai:storage:010` | 未初始化 |
| `HaiStorageError.UNSUPPORTED_TYPE` | `hai:storage:011` | 不支持的存储类型 |
| `HaiStorageError.CONFIG_ERROR` | `hai:storage:012` | 配置错误 |
| `HaiStorageError.PRESIGN_FAILED` | `hai:storage:013` | 预签名 URL 生成失败 |
| `HaiStorageError.UPLOAD_FAILED` | `hai:storage:014` | 上传失败 |
| `HaiStorageError.DOWNLOAD_FAILED` | `hai:storage:015` | 下载失败 |

## HTTP API 契约

公共 HTTP API 统一由 `@h-ai/api-contract` 提供，并由 `@h-ai/serv/features/storage` 绑定到本模块。

```typescript
import { apiClient } from '@h-ai/api-client'

const result = await apiClient.storage.presignedUrls.createUpload({ key: 'avatar.png' })
```

## 常见模式

大文件上传用 `file.put(key, readableOrAsyncByteStream, { signal, ifNoneMatch: '*' })`，内部使用有界 S3 multipart；下载用 `file.getStream(key, { signal, rangeStart, rangeEnd })`，及时消费或关闭，迭代期间 I/O/取消可能抛错。本地读取目录直接返回 `INVALID_PATH`。checksum 的 signal 取消会停止等待下一块数据并请求关闭输入迭代器。`get()` 返回完整 Buffer，只用于容量可控的数据。仅创建写入采用 S3 标准条件或本地原子发布，冲突返回 `ALREADY_EXISTS`；后端不支持时失败，不退回覆盖。

`checksum.generate(data, options?)` / `checksum.verify(data, expected, options?)` 默认 SHA-256、小写 hex，可选 sha384/sha512/sha1/md5、base64 编码与 signal；流仅消费一次，读取失败返回 HaiResult 错误，不匹配返回 false。MD5/SHA-1 不作安全认证，ETag 和 multipart 复合 checksum 不当作完整文件摘要。浏览器不导入 Node checksum；离线增量摘要需使用适用的浏览器实现，不把 SubtleCrypto.digest 当流式 API。

### 与 kit 集成（文件上传 API）

```typescript
import { storage } from '$lib/server/init'
// src/routes/api/files/upload/+server.ts
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const UploadSchema = z.object({
  key: z.string().min(1),
})

export const POST = kit.handler(async ({ request, locals }) => {
  kit.guard.require(locals.session, 'storage:write')
  const formData = await request.formData()
  const file = formData.get('file') as File
  if (!file)
    return kit.response.badRequest('Missing file')

  const key = `uploads/${locals.session.userId}/${file.name}`
  const buffer = new Uint8Array(await file.arrayBuffer())
  const result = await storage.file.put(key, buffer, { contentType: file.type })
  if (!result.success)
    return kit.response.internalError()
  return kit.response.created({ key })
})
```

> 说明：`@h-ai/storage` 只提供存储能力，不强制要求 `/api/storage` 路由命名。应用可按业务语义自定义 API 路径。

> Local Provider 的 `storage.dir.list()` 会递归扫描匹配前缀下的文件，仅支持 `maxKeys` 截断，不支持 `continuationToken` 真分页；大目录建议缩小 `prefix` 或改用 S3 Provider。

### 头像上传

```typescript
const key = `avatars/${userId}/${Date.now()}.png`
const result = await storage.file.put(key, avatarBuffer, {
  contentType: 'image/png',
})
if (result.success) {
  const publicUrl = storage.presign.publicUrl(key)
  await iam.user.updateUser(userId, { avatarUrl: publicUrl ?? '' })
}
```

## 浏览器端文件上传（预签名 URL 模式）

浏览器端无法直接使用 `storage` 模块，应通过 API 获取预签名 URL 后直传：

```typescript
import { apiFetch } from '$lib/utils/api'

// 1. 向服务端请求预签名上传 URL
const res = await apiFetch('/api/storage/presign/upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: `uploads/${file.name}`, contentType: file.type }),
})
const { url } = await res.json()

// 2. 浏览器直传到存储（不经过服务端，大文件友好）
await fetch(url, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': file.type },
})
```

也可使用 typed client（需配合 `@h-ai/api-client`）：

```typescript
import { apiClient } from '@h-ai/api-client'

const result = await apiClient.storage.presignedUrls.createUpload({
  key: `avatars/${userId}.png`,
  contentType: 'image/png',
})
if (result.success) {
  await fetch(result.data.url, { method: 'PUT', body: file })
}
```

## 相关 Skills

- `hai-build`：模块初始化顺序
- `hai-core`：配置与 HaiResult 模型
- `hai-kit`：SvelteKit API 端点集成（`kit.handler` + `kit.guard`）
- `hai-ui`：Storage 场景组件（FileUpload/ImageUpload/AvatarUpload）
