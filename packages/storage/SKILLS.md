# @hai/storage - AI 助手参考

## 模块概述

`@hai/storage` 提供统一的对象存储访问能力，支持 S3 兼容存储与本地文件系统，统一异步 API 与错误码。

## 入口与初始化

- 入口：`import { storage } from '@hai/storage'`
- 初始化：`storage.init(config)` → `Result<void, StorageError>`
- 关闭：`storage.close()` → `Promise<void>`
- 状态：`storage.isInitialized` / `storage.config`

```ts
await storage.init({ type: 'local', root: '/data/uploads' })
await storage.close()
```

## 目录结构

```
packages/storage/
├── src/
│   ├── index.ts
│   ├── storage-config.ts
│   ├── storage-i18n.ts
│   ├── storage-main.ts
│   ├── storage-types.ts
│   ├── storage-client.ts
│   └── provider/
│       ├── storage-provider-s3.ts
│       └── storage-provider-local.ts
└── tests/
```

## 配置说明（StorageConfigInput）

### S3 配置

- `type`: `'s3'`
- `bucket`: 存储桶名称
- `region`: 区域
- `accessKeyId`: Access Key
- `secretAccessKey`: Secret Key
- `endpoint?`: 自定义端点（MinIO/OSS 等）
- `forcePathStyle?`: 是否使用路径风格
- `prefix?`: 路径前缀
- `publicUrl?`: 公开访问基础 URL

### Local 配置

- `type`: `'local'`
- `root`: 根目录
- `directoryMode?`: 目录权限（默认 `0o755`）
- `fileMode?`: 文件权限（默认 `0o644`）

## 文件/目录/签名操作

### storage.file

- `put(key, data, options?)` → `Result<FileMetadata, StorageError>`
- `get(key, options?)` → `Result<Buffer, StorageError>`
- `head(key)` → `Result<FileMetadata, StorageError>`
- `exists(key)` → `Result<boolean, StorageError>`
- `delete(key)` → `Result<void, StorageError>`
- `deleteMany(keys)` → `Result<void, StorageError>`
- `copy(sourceKey, destKey, options?)` → `Result<FileMetadata, StorageError>`

### storage.dir

- `list(options?)` → `Result<ListResult, StorageError>`
- `delete(prefix)` → `Result<void, StorageError>`

### storage.presign

- `getUrl(key, options?)` → `Result<string, StorageError>`
- `putUrl(key, options?)` → `Result<string, StorageError>`
- `publicUrl(key)` → `string | null`

## 前端客户端（@hai/storage/client）

- `uploadWithPresignedUrl(url, data, options?)`
- `downloadWithPresignedUrl(url, options?)`
- `downloadAndSave(url, options?)`
- `getFileExtension(file)` / `getMimeType(extension)` / `formatFileSize(bytes)`

## 返回值与错误码

### Result 与 StorageError

- `Result<T, StorageError>`：`success` / `data` / `error`
- `StorageError`: `{ code, message, key?, cause? }`

### StorageErrorCode

- `CONNECTION_FAILED` 5000
- `OPERATION_FAILED` 5001
- `NOT_FOUND` 5002
- `ALREADY_EXISTS` 5003
- `PERMISSION_DENIED` 5004
- `QUOTA_EXCEEDED` 5005
- `INVALID_PATH` 5006
- `IO_ERROR` 5007
- `NETWORK_ERROR` 5008
- `NOT_INITIALIZED` 5010
- `UNSUPPORTED_TYPE` 5011
- `CONFIG_ERROR` 5012
- `PRESIGN_FAILED` 5013
- `UPLOAD_FAILED` 5014
- `DOWNLOAD_FAILED` 5015

## 注意事项

- 所有操作均为异步，需要 `await`
- 退出前调用 `storage.close()` 释放资源
- S3 容器化测试需要 Docker
