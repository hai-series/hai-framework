---
name: hai-storage
description: 使用 @h-ai/storage 进行文件存储操作（本地/S3），包括上传、下载、删除、预签名 URL 与存储桶管理；当需求涉及文件上传、文件存储、S3 对接或预签名 URL 时使用。
---

# hai-storage

> `@h-ai/storage` 提供统一的文件存储接口，支持本地文件系统（LocalProvider）和 S3 兼容存储（S3Provider），包含文件上传/下载/删除、预签名 URL 和存储桶管理。

---

## 适用场景

- 文件上传与下载
- 预签名 URL 生成（客户端直传）
- S3 兼容存储对接（AWS S3、MinIO、阿里云 OSS 等）
- 本地开发文件存储
- 存储桶创建与管理

---

## 使用步骤

### 1. 配置

```yaml
# config/_storage.yml
type: ${STORAGE_TYPE:local} # local | s3
# 本地存储
basePath: ${STORAGE_PATH:./data/storage}
# S3 存储（type=s3 时生效）
# endPoint: ${S3_ENDPOINT:s3.amazonaws.com}
# region: ${S3_REGION:us-east-1}
# accessKey: ${S3_ACCESS_KEY:}
# secretKey: ${S3_SECRET_KEY:}
# bucket: ${S3_BUCKET:my-bucket}
# useSSL: true
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

| 方法          | 签名                                                                | 说明             |
| ------------- | ------------------------------------------------------------------- | ---------------- |
| `upload`      | `(bucket, key, data, options?) => Promise<Result<UploadResult>>`    | 上传文件         |
| `download`    | `(bucket, key) => Promise<Result<Buffer>>`                          | 下载文件         |
| `delete`      | `(bucket, key) => Promise<Result<void>>`                            | 删除文件         |
| `exists`      | `(bucket, key) => Promise<Result<boolean>>`                         | 检查文件是否存在 |
| `getMetadata` | `(bucket, key) => Promise<Result<FileMetadata>>`                    | 获取文件元数据   |
| `list`        | `(bucket, options?) => Promise<Result<FileInfo[]>>`                 | 列出文件         |
| `copy`        | `(srcBucket, srcKey, destBucket, destKey) => Promise<Result<void>>` | 复制文件         |
| `move`        | `(srcBucket, srcKey, destBucket, destKey) => Promise<Result<void>>` | 移动文件         |

```typescript
// 上传文件
const result = await storage.upload('avatars', 'user-123.png', fileBuffer, {
  contentType: 'image/png',
  metadata: { userId: '123' },
})

// 下载文件
const file = await storage.download('avatars', 'user-123.png')

// 列出文件
const files = await storage.list('avatars', { prefix: 'user-', maxResults: 100 })
```

### 预签名 URL

| 方法                      | 签名                                                 | 说明           |
| ------------------------- | ---------------------------------------------------- | -------------- |
| `getPresignedUploadUrl`   | `(bucket, key, options?) => Promise<Result<string>>` | 上传预签名 URL |
| `getPresignedDownloadUrl` | `(bucket, key, options?) => Promise<Result<string>>` | 下载预签名 URL |

```typescript
// 客户端直传模式
const uploadUrl = await storage.getPresignedUploadUrl('uploads', 'doc.pdf', {
  expiresIn: 3600, // 1 小时有效
  contentType: 'application/pdf',
})

// 临时下载链接
const downloadUrl = await storage.getPresignedDownloadUrl('uploads', 'doc.pdf', {
  expiresIn: 300, // 5 分钟有效
})
```

### 存储桶管理

| 方法           | 签名                                 | 说明               |
| -------------- | ------------------------------------ | ------------------ |
| `createBucket` | `(name) => Promise<Result<void>>`    | 创建存储桶         |
| `deleteBucket` | `(name) => Promise<Result<void>>`    | 删除存储桶         |
| `bucketExists` | `(name) => Promise<Result<boolean>>` | 检查存储桶是否存在 |
| `listBuckets`  | `() => Promise<Result<string[]>>`    | 列出所有存储桶     |

---

## 错误码 — `StorageErrorCode`

| 错误码            | 说明                |
| ----------------- | ------------------- |
| `NOT_INITIALIZED` | 未初始化            |
| `UPLOAD_ERROR`    | 上传失败            |
| `DOWNLOAD_ERROR`  | 下载失败            |
| `DELETE_ERROR`    | 删除失败            |
| `NOT_FOUND`       | 文件不存在          |
| `BUCKET_ERROR`    | 存储桶操作失败      |
| `PRESIGN_ERROR`   | 预签名 URL 生成失败 |
| `CONFIG_ERROR`    | 配置错误            |

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
const result = await storage.upload('users', key, avatarBuffer, {
  contentType: 'image/png',
})
if (result.success) {
  await iam.user.updateUser(userId, { avatarUrl: result.data.url })
}
```

---

## 相关 Skills

- `hai-build`：模块初始化顺序
- `hai-core`：配置与 Result 模型
- `hai-kit`：`kit.storage.createEndpoint` 快速创建上传 API
- `hai-ui`：Storage 场景组件（FileUpload/ImageUpload/AvatarUpload）
