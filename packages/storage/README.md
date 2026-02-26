# @h-ai/storage

对象存储模块，提供统一 `storage` 访问入口，支持 S3 兼容存储与本地文件系统。

## 支持的后端

- S3 协议（AWS S3 / MinIO / OSS 等）
- 本地文件系统

## 快速开始

### Node.js 服务端

```ts
import { storage } from '@h-ai/storage'

// 初始化（S3）
await storage.init({
  type: 's3',
  bucket: 'my-bucket',
  region: 'us-east-1',
  accessKeyId: process.env.HAI_STORAGE_S3_ACCESS_KEY!,
  secretAccessKey: process.env.HAI_STORAGE_S3_SECRET_KEY!,
})

// 或本地存储
await storage.init({ type: 'local', root: '/data/uploads' })

// 上传/下载
await storage.file.put('uploads/image.png', imageBuffer, { contentType: 'image/png' })
const file = await storage.file.get('uploads/image.png')

// 签名 URL
const url = await storage.presign.getUrl('uploads/image.png', { expiresIn: 3600 })

// 关闭连接
await storage.close()
```

### 浏览器客户端

浏览器环境下仅导出客户端能力（签名 URL 上传/下载），不包含 `storage` 服务对象。

```ts
import { downloadAndSave, uploadWithPresignedUrl } from '@h-ai/storage/client'

const { uploadUrl } = await fetch('/api/storage/presign').then(r => r.json())
await uploadWithPresignedUrl(uploadUrl, file)
```

## API 概览

- `storage.file`
  - `put/get/head/exists/delete/deleteMany/copy`
- `storage.dir`
  - `list/delete`
- `storage.presign`
  - `getUrl/putUrl/publicUrl`

> 注意：`publicUrl` 仅在 S3 配置了 `publicUrl` 时返回字符串；否则返回 `null`。

## 客户端辅助函数

`@h-ai/storage/client` 还提供以下浏览器侧工具：

- `uploadWithPresignedUrl(url, data, options)`
- `downloadWithPresignedUrl(url, options)`
- `downloadAndSave(url, { filename })`
- `getFileExtension(file)`
- `getMimeType(extension)`
- `formatFileSize(bytes)`

## 配置

- **S3**：`bucket / region / accessKeyId / secretAccessKey` 必填，可选 `endpoint / forcePathStyle / prefix / publicUrl`
- **Local**：`root` 必填，可选 `directoryMode / fileMode`

## 错误处理

```ts
import { storage, StorageErrorCode } from '@h-ai/storage'

const result = await storage.file.get('image.png')
if (!result.success && result.error.code === StorageErrorCode.NOT_INITIALIZED) {
  // 存储未初始化
}
```

常用错误码：

- `NOT_INITIALIZED`
- `CONNECTION_FAILED`
- `OPERATION_FAILED`
- `NOT_FOUND`
- `PERMISSION_DENIED`
- `PRESIGN_FAILED`
- `CONFIG_ERROR`

## 测试

```bash
pnpm --filter @h-ai/storage test
```

> MinIO/S3 相关测试需要 Docker 环境。

## License

Apache-2.0
