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

## 测试

```bash
pnpm test
```

## License

Apache-2.0
