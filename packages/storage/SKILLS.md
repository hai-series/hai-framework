# @hai/storage 技术指南

> 本文档供 AI 助手参考，描述 storage 模块的架构、API 模式和使用方式。

## 模块概述

`@hai/storage` 是 hai Admin Framework 的对象存储模块，以 `storage` 为统一入口，支持 S3 协议对象存储服务。

## 架构设计

### 目录结构

```
packages/storage/
├── src/
│   ├── index.ts                    # 统一导出
│   ├── storage-config.ts           # 错误码和配置 schema
│   ├── storage-types.ts            # 类型定义
│   ├── storage-main.ts             # 主入口（storage 对象）
│   ├── storage-client.ts           # 前端客户端工具
│   └── provider/
│       ├── storage-provider-s3.ts      # S3 协议实现
│       └── storage-provider-memory.ts  # 内存实现（测试用）
└── tests/
    └── memory.test.ts              # 单元测试
```

### API 分层

```typescript
// 统一入口
storage.file.*      // 文件操作
storage.dir.*       // 目录操作
storage.presign.*   // 签名 URL 操作

// 生命周期
initStorage(config) // 初始化
closeStorage()      // 关闭
```

### 错误码规范

storage 模块使用 5000-5999 范围的错误码：

| 码值 | 名称              | 用途         |
| ---- | ----------------- | ------------ |
| 5000 | CONNECTION_FAILED | 连接失败     |
| 5001 | OPERATION_FAILED  | 操作失败     |
| 5002 | NOT_FOUND         | 文件不存在   |
| 5003 | ALREADY_EXISTS    | 文件已存在   |
| 5004 | PERMISSION_DENIED | 权限拒绝     |
| 5005 | QUOTA_EXCEEDED    | 配额超限     |
| 5010 | NOT_INITIALIZED   | 存储未初始化 |
| 5011 | INVALID_CONFIG    | 配置无效     |
| 5012 | PROVIDER_ERROR    | 提供者错误   |
| 5013 | PRESIGN_FAILED    | 签名失败     |

## 核心类型

### 配置类型

```typescript
// S3 配置
interface S3Config {
    type: 's3'
    bucket: string
    region: string
    accessKeyId: string
    secretAccessKey: string
    endpoint?: string           // MinIO 等自定义端点
    forcePathStyle?: boolean    // 路径风格
    prefix?: string             // 路径前缀
    publicUrl?: string          // 公开访问基础 URL
}

// 本地存储配置（未来实现）
interface LocalConfig {
    type: 'local'
    basePath: string
    publicUrl?: string
}

// 内存存储配置（测试用）
interface MemoryConfig {
    type: 'memory'
    publicUrl?: string
}
```

### 文件元数据

```typescript
interface FileMetadata {
    key: string
    size: number
    contentType?: string
    etag?: string
    lastModified?: Date
    metadata?: Record<string, string>
}
```

### 操作结果

所有操作返回 `Result<T, StorageError>` 类型：

```typescript
interface StorageError {
    code: StorageErrorCode
    message: string
    cause?: unknown
}

// 使用方式
const result = await storage.file.get(key)
if (result.success) {
    // result.data 是 Buffer
} else {
    // result.error 是 StorageError
}
```

## 代码模式

### 后端初始化模式

```typescript
import { storage, initStorage, closeStorage } from '@hai/storage'

// 初始化
await initStorage({
    type: 's3',
    bucket: 'my-bucket',
    region: 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
})

// 使用
const result = await storage.file.put('path/file.txt', buffer)
```

### 文件上传模式

```typescript
// 简单上传
await storage.file.put('path/file.txt', Buffer.from('content'))

// 带选项上传
await storage.file.put('path/image.png', imageBuffer, {
    contentType: 'image/png',
    metadata: { 'x-custom': 'value' },
    acl: 'public-read',
})
```

### 文件下载模式

```typescript
// 下载文件
const result = await storage.file.get('path/file.txt')
if (result.success) {
    const buffer = result.data
}

// 带范围下载
const result = await storage.file.get('path/video.mp4', {
    range: { start: 0, end: 1023 },
})
```

### 签名 URL 模式

```typescript
// 生成下载 URL
const url = await storage.presign.getUrl('path/file.txt', {
    expiresIn: 3600,  // 秒
})

// 生成上传 URL
const url = await storage.presign.putUrl('path/file.txt', {
    contentType: 'image/png',
    expiresIn: 3600,
    maxSize: 10 * 1024 * 1024,  // 10MB
})
```

### 目录操作模式

```typescript
// 列出目录
const result = await storage.dir.list({
    prefix: 'uploads/',
    maxKeys: 100,
    continuationToken: prevToken,
})

if (result.success) {
    for (const file of result.data.files) {
        // 使用 file.key / file.size
    }
    // 分页
    if (result.data.isTruncated) {
        nextToken = result.data.nextContinuationToken
    }
}

// 删除目录（所有文件）
await storage.dir.delete('uploads/temp/')
```

### 前端上传模式

```typescript
import { uploadWithPresignedUrl } from '@hai/storage/client'

// 从后端获取签名 URL
const { url } = await api.getUploadUrl({ key: 'file.png', contentType: 'image/png' })

// 上传文件
const result = await uploadWithPresignedUrl(url, file, {
    contentType: 'image/png',
    onProgress: ({ loaded, total, percent }) => {
        // 在此更新进度条：percent
    },
})
```

### 前端下载模式

```typescript
import { downloadAndSave } from '@hai/storage/client'

// 直接下载并保存
await downloadAndSave(signedUrl, { filename: 'download.png' })
```

## Provider 实现规范

实现新的 storage provider 需要遵循 `StorageProvider` 接口：

```typescript
interface StorageProvider {
    init(config: StorageConfig): Promise<void>
    close(): Promise<void>
    
    // 文件操作
    put(key: string, data: Buffer | Readable, options?: UploadOptions): Promise<Result<FileMetadata, StorageError>>
    get(key: string, options?: DownloadOptions): Promise<Result<Buffer, StorageError>>
    head(key: string): Promise<Result<FileMetadata, StorageError>>
    exists(key: string): Promise<Result<boolean, StorageError>>
    delete(key: string): Promise<Result<void, StorageError>>
    deleteMany(keys: string[]): Promise<Result<void, StorageError>>
    copy(sourceKey: string, destKey: string, options?: CopyOptions): Promise<Result<FileMetadata, StorageError>>
    
    // 目录操作
    list(options?: ListOptions): Promise<Result<ListResult, StorageError>>
    deleteDir(prefix: string): Promise<Result<void, StorageError>>
    
    // 签名 URL
    getPresignedUrl(key: string, options?: PresignOptions): Promise<Result<string, StorageError>>
    putPresignedUrl(key: string, options?: PresignUploadOptions): Promise<Result<string, StorageError>>
    getPublicUrl(key: string): Result<string, StorageError>
}
```

## 与其他模块的关系

- **@hai/core** - 使用 `Result` 类型和错误处理模式
- **@hai/config** - 配置管理（未来集成）
- **@hai/db** - 类似的 API 设计模式

## 测试策略

使用 MemoryProvider 进行单元测试：

```typescript
import { storage, initStorage, closeStorage } from '@hai/storage'

beforeEach(async () => {
    await initStorage({ type: 'memory' })
})

afterEach(async () => {
    await closeStorage()
})

test('should upload and download file', async () => {
    const result = await storage.file.put('test.txt', Buffer.from('hello'))
    expect(result.success).toBe(true)
    
    const getResult = await storage.file.get('test.txt')
    expect(getResult.success).toBe(true)
    expect(getResult.data?.toString()).toBe('hello')
})
```
