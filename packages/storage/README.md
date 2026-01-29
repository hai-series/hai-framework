# @hai/storage

hai Admin Framework 的对象存储模块，支持 S3 协议和本地文件存储。

## 特性

- ✅ **S3 协议支持** - 兼容 AWS S3、MinIO、阿里云 OSS 等
- ✅ **本地存储支持** - 支持本地文件系统存储
- ✅ **统一 API** - `storage.file` / `storage.dir` / `storage.presign` 分层 API
- ✅ **签名 URL** - 支持前端直接上传下载（临时授权）
- ✅ **前端客户端** - 提供前端上传下载辅助函数
- ✅ **类型安全** - 完整的 TypeScript 类型定义
- ✅ **Zod 校验** - 运行时配置校验

## 安装

```bash
pnpm add @hai/storage
```

## 快速开始

### 后端使用

```typescript
import { storage } from '@hai/storage'

// 1. 初始化存储（S3）
await storage.init({
    type: 's3',
    bucket: 'my-bucket',
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
})

// 或者使用本地存储
await storage.init({
    type: 'local',
    root: '/data/uploads',
})

// 2. 上传文件
await storage.file.put('uploads/image.png', imageBuffer, {
    contentType: 'image/png',
})

// 3. 下载文件
const result = await storage.file.get('uploads/image.png')
if (result.success) {
    const data = result.data
}

// 4. 列出文件
const list = await storage.dir.list({ prefix: 'uploads/' })

// 5. 生成签名 URL（前端直接下载）
const downloadUrl = await storage.presign.getUrl('uploads/image.png', {
    expiresIn: 3600  // 1小时有效期
})

// 6. 生成上传签名 URL（前端直接上传）
const uploadUrl = await storage.presign.putUrl('uploads/new-file.png', {
    contentType: 'image/png',
    expiresIn: 3600
})

// 7. 关闭连接
await storage.close()
```

### 前端使用

```typescript
import { uploadWithPresignedUrl, downloadAndSave } from '@hai/storage/client'

// 获取签名 URL（从后端 API）
const response = await fetch('/api/storage/presign', {
    method: 'POST',
    body: JSON.stringify({ key: 'uploads/image.png', contentType: 'image/png' })
})
const { uploadUrl, downloadUrl } = await response.json()

// 上传文件（支持进度回调）
const file = document.getElementById('fileInput').files[0]
const result = await uploadWithPresignedUrl(uploadUrl, file, {
    contentType: 'image/png',
    onProgress: (progress) => {
        // 在此更新进度条：progress.percent
    }
})

// 下载文件
await downloadAndSave(downloadUrl, {
    filename: 'downloaded-image.png'
})
```

## API 参考

### 初始化

```typescript
// S3 配置
await storage.init({
    type: 's3',
    bucket: 'my-bucket',
    region: 'us-east-1',
    accessKeyId: 'xxx',
    secretAccessKey: 'xxx',
    // 可选配置
    endpoint: 'http://localhost:9000',  // MinIO 等自定义端点
    forcePathStyle: true,               // 某些 S3 兼容服务需要
    prefix: 'app/',                     // 路径前缀
    publicUrl: 'https://cdn.example.com', // 公开访问 URL
})

// MinIO 配置示例
await storage.init({
    type: 's3',
    bucket: 'my-bucket',
    region: 'us-east-1',
    endpoint: 'http://localhost:9000',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
    forcePathStyle: true,
})

// 本地存储配置
await storage.init({
    type: 'local',
    root: '/data/uploads',
    directoryMode: 0o755,  // 目录权限
    fileMode: 0o644,       // 文件权限
})
```

### 文件操作 (storage.file)

| 方法                                 | 说明             |
| ------------------------------------ | ---------------- |
| `put(key, data, options?)`           | 上传文件         |
| `get(key, options?)`                 | 下载文件         |
| `head(key)`                          | 获取文件元数据   |
| `exists(key)`                        | 检查文件是否存在 |
| `delete(key)`                        | 删除文件         |
| `deleteMany(keys)`                   | 批量删除文件     |
| `copy(sourceKey, destKey, options?)` | 复制文件         |

### 目录操作 (storage.dir)

| 方法             | 说明                 |
| ---------------- | -------------------- |
| `list(options?)` | 列出目录内容         |
| `delete(prefix)` | 删除目录（所有文件） |

### 签名 URL (storage.presign)

| 方法                    | 说明             |
| ----------------------- | ---------------- |
| `getUrl(key, options?)` | 生成下载签名 URL |
| `putUrl(key, options?)` | 生成上传签名 URL |
| `publicUrl(key)`        | 获取公开访问 URL |

### 前端客户端

```typescript
import {
    uploadWithPresignedUrl,
    downloadWithPresignedUrl,
    downloadAndSave,
    getFileExtension,
    getMimeType,
    formatFileSize,
} from '@hai/storage/client'
```

## 错误处理

所有操作返回 `Result<T, StorageError>` 类型：

```typescript
const result = await storage.file.get('image.png')

if (result.success) {
    // result.data 是文件内容
    // 使用 result.data
} else {
    // result.error 是错误信息
    // 处理错误：根据 result.error.code / message 做兜底
}
```

### 错误码

| 错误码 | 名称              | 说明              |
| ------ | ----------------- | ----------------- |
| 5000   | CONNECTION_FAILED | 连接失败          |
| 5001   | OPERATION_FAILED  | 操作失败          |
| 5002   | NOT_FOUND         | 文件不存在        |
| 5003   | ALREADY_EXISTS    | 文件已存在        |
| 5004   | PERMISSION_DENIED | 权限拒绝          |
| 5005   | QUOTA_EXCEEDED    | 配额超限          |
| 5010   | NOT_INITIALIZED   | 存储未初始化      |
| 5013   | PRESIGN_FAILED    | 签名 URL 生成失败 |

## 类型定义

```typescript
import type {
    StorageConfig,
    S3Config,
    FileMetadata,
    ListResult,
    UploadOptions,
    DownloadOptions,
    PresignOptions,
    PresignUploadOptions,
    StorageService,
    StorageError,
} from '@hai/storage'
```

## 配置校验

使用 Zod 进行运行时配置校验：

```typescript
import { StorageConfigSchema } from '@hai/storage'

// 校验配置
const config = StorageConfigSchema.parse({
    type: 's3',
    bucket: 'my-bucket',
    region: 'us-east-1',
    accessKeyId: 'xxx',
    secretAccessKey: 'xxx',
})
```

## 许可证

Apache-2.0
