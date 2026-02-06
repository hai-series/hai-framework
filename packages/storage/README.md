# @hai/storage

对象存储模块，提供统一 `storage` 访问入口，支持 S3 兼容存储与本地文件系统。

## 支持的存储

- S3 协议（AWS S3 / MinIO / OSS 等）
- 本地文件系统

## 安装

```bash
pnpm add @hai/storage
```

## 快速开始

```ts
import { storage } from '@hai/storage'

// 初始化（S3）
await storage.init({
  type: 's3',
  bucket: 'my-bucket',
  region: 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
})

// 或本地存储
await storage.init({ type: 'local', root: '/data/uploads' })

// 上传/下载
await storage.file.put('uploads/image.png', imageBuffer, { contentType: 'image/png' })
const file = await storage.file.get('uploads/image.png')

// 签名 URL
const downloadUrl = await storage.presign.getUrl('uploads/image.png', { expiresIn: 3600 })

// 关闭连接
await storage.close()
```

## 前端客户端

```ts
import { downloadAndSave, uploadWithPresignedUrl } from '@hai/storage/client'

const { uploadUrl } = await fetch('/api/storage/presign').then(r => r.json())
await uploadWithPresignedUrl(uploadUrl, file)
```

## 配置要点

- S3：`bucket/region/accessKeyId/secretAccessKey` 为必填，可选 `endpoint/forcePathStyle/prefix/publicUrl`
- Local：`root` 为必填，可选 `directoryMode/fileMode`

## 错误处理示例

```ts
import { storage, StorageErrorCode } from '@hai/storage'

const result = await storage.file.get('image.png')
if (!result.success && result.error.code === StorageErrorCode.NOT_INITIALIZED) {
  // 存储未初始化
}
```

## 测试

```bash
pnpm test
```

> 运行 S3 容器化测试需要 Docker。

## 许可证

Apache-2.0
