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
type: ${STORAGE_TYPE:local} # local | s3
# 本地存储
root: ${STORAGE_ROOT:./data/storage}
# S3 存储（type=s3 时生效）
# endpoint: ${S3_ENDPOINT:}
# region: ${S3_REGION:us-east-1}
# accessKeyId: ${S3_ACCESS_KEY_ID:}
# secretAccessKey: ${S3_SECRET_ACCESS_KEY:}
# bucket: ${S3_BUCKET:my-bucket}
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

## 常见模式

### 与 kit 集成（文件上传 API）

```typescript
import { storage } from '$lib/server/init'
// src/routes/api/storage/+server.ts
import { kit } from '@h-ai/kit'

const endpoint = kit.storage.createEndpoint({
  storage,
  bucket: 'uploads',
  allowedTypes: ['image/*', 'application/pdf'],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  requireAuth: true,
})

export const GET = endpoint.get // 列表/下载
export const POST = endpoint.post // 上传
export const DELETE = endpoint.delete // 删除
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

---

## 相关 Skills

- `hai-build`：模块初始化顺序
- `hai-core`：配置与 Result 模型
- `hai-kit`：`kit.storage.createEndpoint` 快速创建上传 API
- `hai-ui`：Storage 场景组件（FileUpload/ImageUpload/AvatarUpload）
