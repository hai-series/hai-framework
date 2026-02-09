# @hai/storage — AI 助手参考

## 模块概述

`@hai/storage` 提供统一的对象存储访问能力，支持 S3 兼容存储与本地文件系统。

## 入口与初始化

- Node.js 入口：`import { storage } from '@hai/storage'`
- 浏览器入口：`import { uploadWithPresignedUrl } from '@hai/storage'`（仅客户端能力）
- 客户端单独导入：`import { uploadWithPresignedUrl } from '@hai/storage/client'`

```ts
// 初始化
await storage.init({ type: 'local', root: '/data/uploads' })

// 状态
storage.isInitialized // boolean
storage.config // StorageConfig | null

// 关闭
await storage.close()
```

## 目录结构

```
packages/storage/
├── src/
│   ├── index.ts                          # Node.js 入口（re-export）
│   ├── storage-index.browser.ts          # 浏览器入口（re-export）
│   ├── storage-config.ts                 # 错误码 + Zod Schema
│   ├── storage-i18n.ts                   # i18n 消息获取
│   ├── storage-main.ts                   # 服务对象（storage）
│   ├── storage-types.ts                  # 公共类型定义
│   ├── client/
│   │   ├── index.ts                      # 客户端子入口
│   │   └── storage-client.ts             # 浏览器端上传/下载工具
│   └── providers/
│       ├── storage-provider-local.ts     # 本地文件系统 Provider
│       └── storage-provider-s3.ts        # S3 Provider
├── messages/
│   ├── zh-CN.json
│   └── en-US.json
└── tests/
```

## 配置说明

### S3 配置（StorageConfigInput）

| 字段              | 类型      | 必填 | 默认值  | 说明                    |
| ----------------- | --------- | ---- | ------- | ----------------------- |
| `type`            | `'s3'`    | 是   | —       | 存储类型                |
| `bucket`          | `string`  | 是   | —       | 存储桶名称              |
| `region`          | `string`  | 是   | —       | 区域                    |
| `accessKeyId`     | `string`  | 是   | —       | Access Key              |
| `secretAccessKey` | `string`  | 是   | —       | Secret Key              |
| `endpoint`        | `string`  | 否   | —       | 自定义端点（MinIO/OSS） |
| `forcePathStyle`  | `boolean` | 否   | `false` | 路径风格 URL            |
| `prefix`          | `string`  | 否   | `''`    | 路径前缀                |
| `publicUrl`       | `string`  | 否   | —       | 公开访问基础 URL        |

### Local 配置

| 字段            | 类型      | 必填 | 默认值  | 说明       |
| --------------- | --------- | ---- | ------- | ---------- |
| `type`          | `'local'` | 是   | —       | 存储类型   |
| `root`          | `string`  | 是   | —       | 根目录路径 |
| `directoryMode` | `number`  | 否   | `0o755` | 目录权限   |
| `fileMode`      | `number`  | 否   | `0o644` | 文件权限   |

## 操作接口

### storage.file（FileOperations）

| 方法         | 签名                                       | 返回值                               |
| ------------ | ------------------------------------------ | ------------------------------------ |
| `put`        | `(key, data, options?) → Promise`          | `Result<FileMetadata, StorageError>` |
| `get`        | `(key, options?) → Promise`                | `Result<Buffer, StorageError>`       |
| `head`       | `(key) → Promise`                          | `Result<FileMetadata, StorageError>` |
| `exists`     | `(key) → Promise`                          | `Result<boolean, StorageError>`      |
| `delete`     | `(key) → Promise`                          | `Result<void, StorageError>`         |
| `deleteMany` | `(keys) → Promise`                         | `Result<void, StorageError>`         |
| `copy`       | `(sourceKey, destKey, options?) → Promise` | `Result<FileMetadata, StorageError>` |

- `data`: `Buffer | Uint8Array | string`
- `UploadOptions`: `contentType?`, `metadata?`, `cacheControl?`, `contentDisposition?`
- `DownloadOptions`: `rangeStart?`, `rangeEnd?`
- `CopyOptions`: `contentType?`, `metadata?`

### storage.dir（DirOperations）

| 方法     | 签名                   | 返回值                             |
| -------- | ---------------------- | ---------------------------------- |
| `list`   | `(options?) → Promise` | `Result<ListResult, StorageError>` |
| `delete` | `(prefix) → Promise`   | `Result<void, StorageError>`       |

- `ListOptions`: `prefix?`, `continuationToken?`, `maxKeys?`, `delimiter?`
- `ListResult`: `{ files, commonPrefixes, nextContinuationToken?, isTruncated }`

### storage.presign（PresignOperations）

| 方法        | 签名                        | 返回值                         |
| ----------- | --------------------------- | ------------------------------ |
| `getUrl`    | `(key, options?) → Promise` | `Result<string, StorageError>` |
| `putUrl`    | `(key, options?) → Promise` | `Result<string, StorageError>` |
| `publicUrl` | `(key) → string \| null`    | 同步返回                       |

- `PresignOptions`: `expiresIn?`（默认 3600，最长 604800）、`responseContentType?`、`responseContentDisposition?`
- `PresignUploadOptions`: 继承 PresignOptions + `contentType?`（默认 `application/octet-stream`）、`maxSize?`

## Client 接口（浏览器端）

从 `@hai/storage/client` 或 `@hai/storage`（浏览器构建）导入：

| 函数                       | 签名                                                          | 说明              |
| -------------------------- | ------------------------------------------------------------- | ----------------- |
| `uploadWithPresignedUrl`   | `(url, data, options?) → Promise<Result<void, StorageError>>` | 使用签名 URL 上传 |
| `downloadWithPresignedUrl` | `(url, options?) → Promise<Result<Blob, StorageError>>`       | 使用签名 URL 下载 |
| `downloadAndSave`          | `(url, options?) → Promise<Result<void, StorageError>>`       | 下载并保存到本地  |
| `getFileExtension`         | `(file: File) → string`                                       | 获取文件扩展名    |
| `getMimeType`              | `(extension: string) → string`                                | 获取 MIME 类型    |
| `formatFileSize`           | `(bytes: number) → string`                                    | 格式化文件大小    |

## 错误码（StorageErrorCode）

| 名称                | 数值 | 说明              |
| ------------------- | ---- | ----------------- |
| `CONNECTION_FAILED` | 5000 | 连接失败          |
| `OPERATION_FAILED`  | 5001 | 操作失败          |
| `NOT_FOUND`         | 5002 | 文件不存在        |
| `ALREADY_EXISTS`    | 5003 | 文件已存在        |
| `PERMISSION_DENIED` | 5004 | 权限拒绝          |
| `QUOTA_EXCEEDED`    | 5005 | 配额超限          |
| `INVALID_PATH`      | 5006 | 无效路径          |
| `IO_ERROR`          | 5007 | IO 错误           |
| `NETWORK_ERROR`     | 5008 | 网络错误          |
| `NOT_INITIALIZED`   | 5010 | 存储未初始化      |
| `UNSUPPORTED_TYPE`  | 5011 | 不支持的存储类型  |
| `CONFIG_ERROR`      | 5012 | 配置错误          |
| `PRESIGN_FAILED`    | 5013 | 签名 URL 生成失败 |
| `UPLOAD_FAILED`     | 5014 | 上传失败          |
| `DOWNLOAD_FAILED`   | 5015 | 下载失败          |

## 注意事项

- 所有操作均为异步，需要 `await`
- 退出前调用 `storage.close()` 释放资源
- `storage.init()` 会先自动 `close()` 再重新初始化
- 浏览器构建不包含 `storage` 服务对象，仅导出客户端工具函数
- S3 容器化测试需要 Docker
