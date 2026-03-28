---
name: hai-storage
description: 使用 @h-ai/storage 进行文件存储操作（本地/S3），包括 file/dir/presign 三组能力；当需求涉及文件上传下载、目录批量删除、S3 预签名 URL 或客户端直传时使用。
---

# hai-storage

> `@h-ai/storage` 提供统一文件存储接口，支持本地文件系统（LocalProvider）和 S3 兼容存储（S3Provider），通过 `storage.file`、`storage.dir`、`storage.presign` 三组接口访问能力。

---

## 适用场景

- 文件上传与下载
- 预签名 URL 生成（客户端直传）
- S3 兼容存储对接（AWS S3、MinIO、阿里云 OSS 等）
- 本地开发文件存储
- 目录前缀清理与批量文件删除

---

## 使用步骤

### 1. 配置

```yaml
# config/_storage.yml
type: ${HAI_STORAGE_TYPE:local} # local | s3
# 本地存储
root: ${HAI_STORAGE_PATH:./data/storage}
# S3 存储（type=s3 时生效）
# endpoint: ${HAI_STORAGE_S3_ENDPOINT:}
# region: ${HAI_STORAGE_S3_REGION:us-east-1}
# accessKeyId: ${HAI_STORAGE_S3_ACCESS_KEY:}
# secretAccessKey: ${HAI_STORAGE_S3_SECRET_KEY:}
# bucket: ${HAI_STORAGE_S3_BUCKET:my-bucket}
# forcePathStyle: false
# prefix: ''
# publicUrl: ''
```

### 2. 初始化与关闭

```typescript
import { storage } from '@h-ai/storage'

await storage.init(core.config.get('storage'))
// 使用后关闭
await storage.close()
```

---

## 核心 API

### 文件操作

`storage.file` 提供以下方法：

- `put(key, data, options?)`
- `get(key, options?)`
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

---

## 错误码 — `StorageErrorCode`

| 错误码              | 说明                |
| ------------------- | ------------------- |
| `NOT_INITIALIZED`   | 未初始化            |
| `UPLOAD_FAILED`     | 上传失败            |
| `DOWNLOAD_FAILED`   | 下载失败            |
| `NOT_FOUND`         | 文件不存在          |
| `PRESIGN_FAILED`    | 预签名 URL 生成失败 |
| `CONNECTION_FAILED` | 连接失败            |
| `OPERATION_FAILED`  | 操作失败            |
| `PERMISSION_DENIED` | 权限不足            |
| `CONFIG_ERROR`      | 配置错误            |

---

## API 契约（`@h-ai/storage/api`）

`@h-ai/storage/api` 子路径导出所有存储端点的 Zod Schema 和端点契约定义，客户端与服务端共享同一份真相源，编译时保证 I/O 一致性。

### 端点定义 — `storageEndpoints`

| 端点名             | method | path                         | input Schema             | output Schema            |
| ------------------ | ------ | ---------------------------- | ------------------------ | ------------------------ |
| `presignDownload`  | POST   | `/storage/presign/download`  | `PresignGetInputSchema`  | `PresignUrlOutputSchema` |
| `presignUpload`    | POST   | `/storage/presign/upload`    | `PresignPutInputSchema`  | `PresignUrlOutputSchema` |
| `fileInfo`         | POST   | `/storage/file/info`         | `FileInfoInputSchema`    | `FileMetadataSchema`     |
| `listFiles`        | GET    | `/storage/files`             | inline（prefix/maxKeys） | `ListFilesOutputSchema`  |
| `deleteFile`       | POST   | `/storage/file/delete`       | `DeleteFileInputSchema`  | `z.void()`               |
| `deleteFiles`      | POST   | `/storage/files/delete`      | `DeleteFilesInputSchema` | `z.void()`               |

### 使用示例

```typescript
import { storageEndpoints, PresignPutInputSchema } from '@h-ai/storage/api'

// 客户端：通过 api-client 调用端点
const { url } = await api.call(storageEndpoints.presignUpload, { key: 'avatar.png' })

// 服务端：基于契约定义路由
export const POST = kit.fromContract(storageEndpoints.presignUpload, async (input) => {
  const result = await storage.presign.putUrl(input.key, input)
  return result.success ? result.data : kit.response.internalError(result.error.message)
})

// 独立 Schema 校验
const parsed = PresignPutInputSchema.safeParse(requestBody)
if (!parsed.success) { /* 校验失败 */ }
```

### 导出的 Schema

- `FileMetadataSchema` — 文件元数据（key / size / contentType / lastModified / etag? / metadata?）
- `PresignGetInputSchema` — 下载签名入参（key + expiresIn?）
- `PresignPutInputSchema` — 上传签名入参（key + contentType? + contentLength? + expiresIn?）
- `PresignUrlOutputSchema` — 签名 URL 出参（url + key + expiresAt?）
- `ListFilesOutputSchema` — 文件列表出参（files + commonPrefixes + isTruncated + nextContinuationToken?）
- `DeleteFileInputSchema` — 删除单文件入参（key）
- `DeleteFilesInputSchema` — 批量删除入参（keys[]）
- `FileInfoInputSchema` — 文件信息入参（key）

### 导出的推导类型

`PresignGetInput` / `PresignPutInput` / `PresignUrlOutput` / `ListFilesOutput` / `DeleteFileInput` / `DeleteFilesInput` / `FileInfoInput`

---

## 常见模式

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
  kit.guard.requirePermission(locals.session, 'storage:write')
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

---

## 相关 Skills

- `hai-build`：模块初始化顺序
- `hai-core`：配置与 HaiResult 模型
- `hai-kit`：SvelteKit API 端点集成（`kit.handler` + `kit.guard`）
- `hai-ui`：Storage 场景组件（FileUpload/ImageUpload/AvatarUpload）
