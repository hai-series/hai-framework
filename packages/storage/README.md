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

// 业务端点路径由应用自行定义（例如 /api/files/presign-put）
const { uploadUrl } = await fetch('/api/files/presign-put').then(r => r.json())
await uploadWithPresignedUrl(uploadUrl, file)
```

> 注意：`@h-ai/storage` 不内置 HTTP 路由；请在应用层自行实现签名 URL API。

## API 契约（`@h-ai/storage/api`）

独立子路径 `@h-ai/storage/api` 导出所有存储端点的 Zod Schema 和端点契约定义，客户端和服务端共享同一份类型定义，编译时保证 I/O 一致性。

```ts
import { PresignPutInputSchema, storageEndpoints } from '@h-ai/storage/api'

// 端点契约包含 6 个端点：
// presignDownload / presignUpload / fileInfo / listFiles / deleteFile / deleteFiles

// 客户端调用
const { url } = await api.call(storageEndpoints.presignUpload, { key: 'avatar.png' })

// 服务端路由
export const POST = kit.fromContract(storageEndpoints.presignUpload, async (input) => {
  const result = await storage.presign.putUrl(input.key, input)
  return result.success ? result.data : kit.response.internalError(result.error.message)
})

// 独立使用 Schema 做校验
const parsed = PresignPutInputSchema.safeParse(requestBody)
if (!parsed.success) { /* 校验失败 */ }
```

**导出的 Schema：**

- `FileMetadataSchema` — 文件元数据
- `PresignGetInputSchema` / `PresignPutInputSchema` — 签名 URL 入参
- `PresignUrlOutputSchema` — 签名 URL 出参
- `ListFilesOutputSchema` — 文件列表出参
- `DeleteFileInputSchema` / `DeleteFilesInputSchema` — 删除入参
- `FileInfoInputSchema` — 文件信息入参

**导出的类型（从 Schema 推导）：**

`PresignGetInput` / `PresignPutInput` / `PresignUrlOutput` / `ListFilesOutput` / `DeleteFileInput` / `DeleteFilesInput` / `FileInfoInput`

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
import { HaiStorageError, storage } from '@h-ai/storage'

const result = await storage.file.get('image.png')
if (!result.success && result.error.code === HaiStorageError.NOT_INITIALIZED.code) {
  // 存储未初始化
}
```

常用错误码：

| 错误码                              | code              | 说明                |
| ----------------------------------- | ----------------- | ------------------- |
| `HaiStorageError.NOT_INITIALIZED`   | `hai:storage:010` | 未初始化            |
| `HaiStorageError.CONNECTION_FAILED` | `hai:storage:001` | 连接失败            |
| `HaiStorageError.OPERATION_FAILED`  | `hai:storage:002` | 操作失败            |
| `HaiStorageError.NOT_FOUND`         | `hai:storage:003` | 文件不存在          |
| `HaiStorageError.PERMISSION_DENIED` | `hai:storage:005` | 权限不足            |
| `HaiStorageError.PRESIGN_FAILED`    | `hai:storage:013` | 预签名 URL 生成失败 |
| `HaiStorageError.CONFIG_ERROR`      | `hai:storage:012` | 配置错误            |

## 测试

```bash
pnpm --filter @h-ai/storage test
```

> MinIO/S3 相关测试需要 Docker 环境。

## License

Apache-2.0
