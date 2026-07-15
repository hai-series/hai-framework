---
name: hai-storage
description: 使用 @h-ai/storage 进行文件存储操作（本地/S3），包括 file/dir/presign 三组能力；当需求涉及文件上传下载、目录批量删除、S3 预签名 URL 或客户端直传时使用。
---

# hai-storage

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/storage 进行文件存储操作（本地/S3），包括 file/dir/presign 三组能力；当需求涉及文件上传下载、目录批量删除、S3 预签名 URL 或客户端直传时使用。 |
| 适用场景 | 当任务与 `hai-storage` 的能力描述匹配，并且需要遵循本 Skill 的流程和边界时 |
| 输入 | 模块配置、类型化业务参数、依赖初始化状态和目标运行环境 |
| 输出 | 符合模块公共 API 的实现或示例；业务结果使用 HaiResult，并同步必要测试与文档 |
| 限制 | 遵守 init → use → close 生命周期与运行环境边界；不绕过类型、授权、输入校验或敏感信息保护 |

> `@h-ai/storage` 提供统一文件存储接口，支持本地文件系统（LocalProvider）和 S3 兼容存储（S3Provider），通过 `storage.file`、`storage.dir`、`storage.presign` 三组接口访问能力。

---

## 运行环境

> ⚠️ **服务端模块**。`storage.file` / `storage.dir` / `storage.presign` 均在 Node.js 端使用。浏览器端通过预签名 URL 或 API 端点间接访问存储（见下方「浏览器端文件上传」）。

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
operationLog:
  read: false # file.get/head/exists, dir.list, presign.getUrl/publicUrl
  write: false # file.put/delete/deleteMany/copy, dir.delete, presign.putUrl
  maxLength: 1000
  level: debug # info | debug | trace
```

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

> `storage.presign.putUrl()` 当前不支持 `maxSize` 约束参数；如需大小限制，请在应用层上传前校验，或在服务端落库/回调处二次校验。

---

## 错误码 — `HaiStorageError`

| 错误码 | code | 说明 |
|--------|------|------|
| `HaiStorageError.CONNECTION_FAILED` | `hai:storage:001` | 连接失败 |
| `HaiStorageError.OPERATION_FAILED` | `hai:storage:002` | 操作失败 |
| `HaiStorageError.NOT_FOUND` | `hai:storage:003` | 文件不存在 |
| `HaiStorageError.ALREADY_EXISTS` | `hai:storage:004` | 文件已存在 |
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

---

## HTTP API 契约

公共 HTTP API 统一由 `@h-ai/api-contract` 提供，并由 `@h-ai/serv/features/storage` 绑定到本模块。

```typescript
import { apiClient } from '@h-ai/api-client'

const result = await apiClient.storage.presignedUrls.createUpload({ key: 'avatar.png' })
```

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

---

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

---

## 相关 Skills

- `hai-build`：模块初始化顺序
- `hai-core`：配置与 HaiResult 模型
- `hai-kit`：SvelteKit API 端点集成（`kit.handler` + `kit.guard`）
- `hai-ui`：Storage 场景组件（FileUpload/ImageUpload/AvatarUpload）
