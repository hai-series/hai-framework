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
const closeResult = await storage.close()
if (!closeResult.success) {
  throw new Error(closeResult.error.message)
}
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

## HTTP API 契约

公共 HTTP API 统一由 `@h-ai/api-contract` 提供，并由 `@h-ai/serv` 的 `createStorageProcedures({ storage })` 绑定到本模块能力。

```ts
import { apiClient } from '@h-ai/api-client'

const result = await apiClient.storage.presignedUrls.createUpload({ key: 'avatar.png' })
```

## API 概览

- `storage.file`
  - `put/get/head/exists/delete/deleteMany/copy`
- `storage.dir`
  - `list/delete`
- `storage.presign`
  - `getUrl/putUrl/publicUrl`

> 注意：`publicUrl` 仅在 S3 配置了 `publicUrl` 时返回字符串；否则返回 `null`。

> 注意：`storage.config` 返回的是**脱敏配置快照**；S3 密钥类字段会被替换为 `[REDACTED]`，不能用于重新初始化。

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

### 操作日志

可在存储配置中通过 `operationLog` 开启文件、目录和预签名 URL 操作日志。日志在 Local/S3 Provider 的真实操作处输出，不在 `storage-main.ts` 中做统一包装；文件内容不会写入日志，上传数据只记录字节长度。

```yaml
# config/_storage.yml
type: local
root: ./data/uploads
operationLog:
  read: false # file.get/head/exists, dir.list, presign.getUrl/publicUrl
  write: false # file.put/delete/deleteMany/copy, dir.delete, presign.putUrl
  maxLength: 1000 # 参数序列化后的最大输出长度，超出会截断
  level: debug # info | debug | trace，默认 debug
```

```ts
await storage.init({
  type: 'local',
  root: './data/uploads',
  operationLog: {
    read: true,
    write: true,
    maxLength: 500,
    level: 'debug',
  },
})
```

`storage.presign.putUrl()` 当前仅支持 `contentType` 与 `expiresIn` 等签名参数，不提供 `maxSize` 约束。

本地存储的 `storage.dir.list()` 会递归扫描匹配前缀下的文件，仅支持 `maxKeys` 截断，不支持 `continuationToken` 真分页；大目录场景建议优先使用更窄的 `prefix`，或改用 S3 Provider 获取原生分页能力。

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
