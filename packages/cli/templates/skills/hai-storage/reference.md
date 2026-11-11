# hai-storage 参考

> `@h-ai/storage` 提供统一文件存储接口，支持本地文件系统（LocalProvider）和 S3 兼容存储（S3Provider），通过 `storage.file`、`storage.dir`、`storage.presign` 访问存储，`storage.checksum` 提供 Node 端无需初始化的字节完整性工具。

## 运行环境

Local 的 key 路径拒绝文件符号链接和目录 junction；每个路径段都保留 `.meta.json` / `.upload.tmp` 后缀及 `.hai-storage-meta` 目录，不区分大小写。先在该内部目录准备文件身份对应的代际元数据（含显式空默认值），再原子发布内容；准备失败不改内容，发布后的历史记录清理失败只记录诊断，不回滚其他写入。代际记录是唯一格式，不读取旧 `<key>.meta.json`；缺少当前记录时明确失败，旧数据须离线迁移或重新 `file.put()`。备份与迁移包含内容和内部记录，不混用旧程序写入。copy 默认继承源元数据；S3 copy 接收原始 key，内部逐段编码 Unicode、空格和 URL 分隔字符。浏览器根入口仅导出 Schema、类型和客户端辅助能力。

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
# publicEndpoint: https://app.example.com/delivery/files # 可含代理目录，不含桶；网关去此前缀后直达 S3
# region: us-east-1
# accessKeyId: ''
# secretAccessKey: ''
# bucket: my-bucket
# createBucket: ${HAI_STORAGE_CREATEBUCKET:false}
# forcePathStyle: false
# prefix: "${HAI_STORAGE_PREFIX:}"
# publicUrl: ''
operationLog:
  read: false # file.get/head/exists, dir.list, presign.getUrl/publicUrl
  write: true # file.put/delete/deleteMany/copy, dir.delete, presign.putUrl
  maxLength: 1000
```

约定环境变量优先于 YAML，例如 `HAI_STORAGE_ROOT`、
`HAI_STORAGE_ACCESSKEYID`、`HAI_STORAGE_SECRETACCESSKEY`。注册了 `StorageConfigSchema` 的应用可直接设置 `HAI_STORAGE_PREFIX=my-app/uploads/`。调用方传相对 key，初始化探测与默认列表使用带尾斜杠的目录前缀，空前缀使用桶根。

限制应用凭据时，将对象操作授权到该前缀下的对象 ARN，并用 `s3:prefix` 条件限制 `s3:ListBucket`。使用预先创建的桶并关闭 `createBucket`，以便初始化只执行带前缀的列表探测。

MinIO、RustFS 使用同一个 S3 Provider：配置 `type: s3`、S3 API `endpoint`（通常为 9000 端口）和 `forcePathStyle: true`。`createBucket` 默认 false，需要预先创建 `bucket`；设为 true 后，`storage.init` 用 HeadBucket 检查，明确 404 时才创建，存在的桶及其中对象保留。权限、网络或创建失败均返回失败且不发布连接；凭据须有检查及创建桶的权限。不要新增 `type: minio` 或 `type: rustfs`。

使用 hai-deploy 的默认自建 S3 配置时，可通过 `hai.json` 的 `deploy.container.s3Engine`（`HAI_DEPLOY_CONTAINER_S3ENGINE`，`rustfs | minio`）选择实现，默认 RustFS。运行环境启用 `HAI_STORAGE_CREATEBUCKET=true` 后由应用初始化 storage 时建桶；部署不再生成独立初始化服务或脚本。自定义外部 S3 默认不建桶，可按凭据权限显式启用。

`operationLog` 默认记录写操作，读操作需显式开启。操作记录固定为 `debug`，由 Core 日志级别过滤。业务失败返回原错误并记录一次 `warn`，初始化、连接和关闭失败为 `error`。`maxLength` 限制安全摘要的字符数，0 省略摘要。签名直传助手在浏览器记录失败，日志不包含对象键、签名 URL 或文件内容。升级时移除 `operationLog.level` 与 `HAI_STORAGE_OPERATIONLOG_LEVEL`，通过 `HAI_CORE_LOGGING_LEVEL` 设置全局阈值。

### 2. 初始化与关闭

```typescript
import { core } from '@h-ai/core'
import { storage, StorageConfigSchema } from '@h-ai/storage'

const config = core.config.validate('storage', StorageConfigSchema)
if (!config.success) throw new Error(config.error.message)
const initialized = await storage.init(config.data)
if (!initialized.success) throw new Error(initialized.error.message)
// 使用后关闭
const closeResult = await storage.close()
if (!closeResult.success) {
  throw new Error(closeResult.error.message)
}
```


初始化只在健康检查成功后发布连接；失败时释放候选资源。若清理仍失败，初始化错误的 `error.ext.cleanupPending` 为 `true`。`storage.close()` 返回 `Promise<HaiResult<void>>`，等待正在进行的初始化，并合并并发关闭。开始清理后 `isInitialized` 为 `false`，配置与业务操作不再可用；清理失败仍保留资源，后续 `close()` 或 `init()` 先重试释放，成功前不会创建替代连接。调用方必须检查关闭结果。

```ts
const closed = await storage.close()
if (!closed.success) {
  // 处理清理故障后有限重试；再次失败应向应用报告。
  const retried = await storage.close()
  if (!retried.success) throw new Error(retried.error.message)
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

预签名仅支持 S3；local `getUrl` / `putUrl` 返回 `HaiStorageError.UNSUPPORTED_OPERATION`（hai:storage:018），`publicUrl` 返回 null，不生成虚拟 URL。serv 与 apiClient 保留失败，须先检查 success；本地文件由应用已有的鉴权接口上传/下载，不假定框架内置签名路由。

```typescript
// 客户端直传模式
const uploadUrl = await storage.presign.putUrl('uploads/doc.pdf', {
  expiresIn: 3600, // 1 小时有效
  contentType: 'application/pdf',
})
if (!uploadUrl.success) return uploadUrl

// 临时下载链接
const downloadUrl = await storage.presign.getUrl('uploads/doc.pdf', {
  expiresIn: 300, // 5 分钟有效
})
if (!downloadUrl.success) return downloadUrl
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
| `HaiStorageError.UNSUPPORTED_OPERATION` | `hai:storage:018` | 当前 Provider 不支持该操作（local 预签名） |
| `HaiStorageError.INVALID_LIST_OPTIONS` | `hai:storage:019` | 本地列表参数或游标无效、查询范围不匹配 |
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
if (!result.success) return result
```

## 常见模式

大文件上传用 `file.put(key, readableOrAsyncByteStream, { signal, ifNoneMatch: '*' })`，内部使用有界 S3 multipart；下载用 `file.getStream(key, { signal, rangeStart, rangeEnd })`，及时消费或关闭，迭代期间 I/O/取消可能抛错。本地读取目录直接返回 `INVALID_PATH`。checksum 的 signal 取消会停止等待下一块数据并请求关闭输入迭代器。`get()` 返回完整 Buffer，只用于容量可控的数据。仅创建写入采用 S3 标准条件或本地原子发布，冲突返回 `ALREADY_EXISTS`；后端不支持时失败，不退回覆盖。

`checksum.generate(data, options?)` / `checksum.verify(data, expected, options?)` 默认 SHA-256、小写 hex，可选 sha384/sha512/sha1/md5、base64 编码与 signal；流仅消费一次，读取失败返回 HaiResult 错误，不匹配返回 false。MD5/SHA-1 不作安全认证，ETag 和 multipart 复合 checksum 不当作完整文件摘要。浏览器不导入 Node checksum；离线增量摘要需使用适用的浏览器实现，不把 SubtleCrypto.digest 当流式 API。

### Serv / Fullstack 私有附件

Fullstack/API 项目先读取本工程已交付的 hai-serv/reference.md 中“扩展应用自有 contract + procedures”和“Feature Procedures”，结合 hai-api-contract、hai-api-client 扩展；保留其 contract/serv/shared 分层，不复制下方 SvelteKit 路由。

- 在 `packages/<name>-contract`（API 为 `apps/<name>-contract`）声明应用自己的附件 contract，在 serv 的 procedures 聚合入口挂载。当前生成的 Fullstack 客户端是共享 `managementApi`，需先将新领域纳入工程 contract；不能把文档中的默认 `apiClient.storage` 当作工程已经开放的接口。
- 自有 procedure 使用 `serv.implement(contract).context<ServContext>().route(...).auth().handle(...)`；owner 来自可信 `context.session.userId`，按 ID 操作还须查验业务记录归属、状态与租户。key 由服务端生成，列表也在服务端限定本人范围。
- 可复用 `createStorageProcedures({ storage, authorize })` 的已有签名/列表/元数据/删除操作，authorize 必须按可信 session 核对 operation 与全部 keys，拒绝空 prefix 与跨用户请求。只挂载实际需要的子路由，不能绕过应用附件记录、限额或审计；框架没有默认的 `attachments.*` 业务 API。
- FileUpload 注入应用 uploadHandler；S3 签名 URL 是短期访问凭据，不能当作持续会话授权。上传完成后仍验证大小、实际内容与对象状态；仍有效的 PUT URL 可以重写其目标，严格发布时使用 staging/final 对象隔离。需要 Local 或严格逐次鉴权的二进制流程时，通过 Serv 自有 middleware 接入 `storage.file.put/getStream`，显式认证并精确配置传输策略，不能把公开 `serv.storageAssets` 用于本人私有附件。

### 与 kit 集成（SvelteKit 文件上传 API）

```typescript
import { storage } from '#lib/server/init.js'
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

### 列表分页

Local 的 `prefix` 是 key 字符串前缀，可匹配 `reports/2026-` 这类不以斜杠结尾的前缀。按 UTF-8 字节序返回，`maxKeys` 为 1–1000 的整数、默认 1000，`files` 与 `commonPrefixes` 合计占用预算。`delimiter` 按 prefix 后首次出现的位置分组，空字符串不分组；空物理目录不产生条目。分组与计数参照 [S3 ListObjectsV2](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html)。

本地不透明游标绑定规范根目录、prefix 和 delimiter，不依赖进程缓存；同根目录的独立实例或重启后可以续页，下一页可调整 maxKeys。格式、版本或范围不匹配返回 `INVALID_LIST_OPTIONS`。只在确有下一条时返回 `isTruncated: true` 和 `nextContinuationToken`。游标不是授权凭据，HTTP 服务仍须授权 prefix；它不提供快照，并发增删可影响后续页。不同挂载路径不视为同一根目录。每次请求仍扫描排序匹配目录，大目录应缩小 prefix 或使用 S3。

```ts
let continuationToken: string | undefined
do {
  const page = await storage.dir.list({ prefix: 'reports/2026-', delimiter: '/', maxKeys: 100, continuationToken })
  if (!page.success) return page
  // 消费当前页的 files 和 commonPrefixes。
  continuationToken = page.data.nextContinuationToken
} while (continuationToken)
```

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

`uploadWithPresignedUrl` 传 `onProgress` 时使用 XHR，否则使用 fetch。`abortController` 预取消不发送；准备中/进行中取消、外部 XHR abort、网络/超时和进度回调异常一次结算失败并解绑本次监听，完成后取消不会触碰旧 XHR。取消不能撤销远端已发布的对象；应用先核对业务/对象状态，再授权清理，不把本地取消当作服务端回滚。实际 Chrome 门禁设置 `HAI_STORAGE_RUN_BROWSER_GATES=1`，执行 `pnpm --filter @h-ai/storage exec vitest run tests/storage-client-browser.test.ts`；浏览器缺失直接失败。

浏览器端无法直接使用 `storage` 模块。服务端使用 S3 时，通过 typed API 获取预签名 URL，检查失败后再直传：

```typescript
import { apiClient } from '@h-ai/api-client'
import { uploadWithPresignedUrl } from '@h-ai/storage/client'

// apiClient 已初始化；用户和资源范围由服务端授权策略决定。
const result = await apiClient.storage.presignedUrls.createUpload({
  key: `avatars/${userId}.png`,
  contentType: 'image/png',
})
if (!result.success) return result
return uploadWithPresignedUrl(result.data.url, file, { contentType: 'image/png' })
```

## 相关 Skills

- `hai-build`：模块初始化顺序
- `hai-core`：配置与 HaiResult 模型
- `hai-kit`：SvelteKit API 端点集成（`kit.handler` + `kit.guard`）
- `hai-ui`：Storage 场景组件（FileUpload/ImageUpload/AvatarUpload）

## 生产共享状态

生产使用共享 S3 或兼容服务；local 只用于开发/明确测试。对象业务授权和读改写的条件提交由应用负责。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化成功前检查，只有 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试豁免。不要将租约当作最终写入条件，外部未知效果须按稳定业务键核对。

## 跨端输入与能力约束

key 统一使用 `@h-ai/storage/schemas` 的 StorageKeySchema（UTF-8 最多1024字节，无绝对路径/反斜线/控制符/点路径段），prefix另允许空串与部分文件名。HTTP批量删除按原数组限制1–1000项，不能以去重绕过；Node仍按Provider分批。签名有效期整数1–604800秒，Node默认3600、HTTP默认900。HTTP上传只接受key/contentType/expiresIn，不接受contentLength/maxSize/metadata/checksum等file.put选项；未知字段返回400，typed client为VALIDATION_FAILED。Node流式读写、Range、checksum、条件写等无默认HTTP端点。FileUpload大小/类型仅为前端选择体验，服务端仍需验证实际对象与归属；不要编造上传代理端点。校验不替代session资源授权及Provider防逃逸。
