# @h-ai/storage

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

对象存储模块，提供统一 `storage` 访问入口，支持 S3 兼容存储与本地文件系统。

## 快速开始

### Node.js 服务端

将已校验的 S3 或 local 配置和 PNG 字节传给 `storeImage`。本例管理一次完整的连接生命周期。常驻服务应在应用启动时初始化，并在停机时关闭。

```ts
import type { FileMetadata, StorageConfigInput } from '@h-ai/storage'
import type { Buffer } from 'node:buffer'
import { storage } from '@h-ai/storage'

export async function storeImage(config: StorageConfigInput, imageBuffer: Uint8Array) {
  // 选择一个后端，检查初始化结果。
  const initialized = await storage.init(config)
  if (!initialized.success)
    throw new Error(initialized.error.message)

  let result: { metadata: FileMetadata, bytes: Buffer, downloadUrl?: string }
  let closed
  try {
    const key = 'uploads/image.png'
    // 用对象 key 写入 PNG 字节，成功时返回对象元数据。
    const uploaded = await storage.file.put(key, imageBuffer, { contentType: 'image/png' })
    if (!uploaded.success)
      throw new Error(uploaded.error.message)

    // 用同一 key 读取对象内容，成功时返回 Buffer。
    const downloaded = await storage.file.get(key)
    if (!downloaded.success)
      throw new Error(downloaded.error.message)

    result = { metadata: uploaded.data, bytes: downloaded.data }
    if (config.type === 's3') {
      // S3 可签发有效期为 3600 秒的下载 URL。
      const signed = await storage.presign.getUrl(key, { expiresIn: 3600 })
      if (!signed.success)
        throw new Error(signed.error.message)
      result.downloadUrl = signed.data
    }
  }
  finally {
    // 释放本次连接，失败时交由调用方处理。
    closed = await storage.close()
  }
  if (!closed.success)
    throw new Error(closed.error.message)
  return result
}
```

### 浏览器客户端

浏览器通过已初始化的 `apiClient` 获取 S3 上传地址。将应用授权的对象 key 和用户选择的 `File` 传给 `uploadImage`。

```ts
import { apiClient } from '@h-ai/api-client'
import { uploadWithPresignedUrl } from '@h-ai/storage/client'

export async function uploadImage(key: string, file: File) {
  // 用相同的 Content-Type 请求签名和上传。
  const contentType = file.type || 'application/octet-stream'
  const signed = await apiClient.storage.presignedUrls.createUpload({ key, contentType })
  if (!signed.success)
    throw new Error(signed.error.message)

  // 直接上传到对象存储，成功时返回服务端确认的对象 key。
  const uploaded = await uploadWithPresignedUrl(signed.data.url, file, { contentType })
  if (!uploaded.success)
    throw new Error(uploaded.error ?? 'Upload failed')
  return signed.data.key
}
```

> 注意：`@h-ai/storage` 不内置 HTTP 路由；请在应用层自行实现签名 URL API。

## 配置清单

生成的项目在 `config/_storage.yml` 中设置本地目录或 S3 兼容存储的连接参数。应用启动代码读取该文件，把配置对象传给 `storage.init(config)`。

在[模块配置清单](../../docs/usage/configuration/storage.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/storage.md)中查看调用示例、输入输出、错误处理与使用要点。

- `storage.init` / `storage.close` / `storage.config` / `storage.isInitialized` — 选择本地目录或 S3 兼容存储，查看连接状态，关闭时释放连接
- `storage.file` / `storage.dir` / `storage.checksum` / `storage.presign` — 读写文件、列出目录、核对内容摘要，以及为 S3 对象生成限时访问链接
- `@h-ai/storage/client` / `@h-ai/storage/schemas` — 通过浏览器上传、下载和校验 key

<a id="api-概览"></a>

[API 概览](../../docs/usage/function/storage.md#api-概览)

<a id="存储输入约束与跨端能力"></a>

[存储输入约束与跨端能力](../../docs/usage/function/storage.md#存储输入约束与跨端能力)

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/storage.md)，了解本地文件和 S3 对象、键、元数据与生命周期。

## 开发测试

```bash
pnpm --filter @h-ai/storage test
```

S3 集成测试需要可用的 Docker 或兼容运行时；同一套初始化、文件、目录、预签名及真实 HTTP 上传下载用例分别在 MinIO 和 RustFS 上运行，不跳过容器启动失败。

- MinIO：[`ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z`](https://github.com/coollabsio/minio)，从上游源码构建的社区镜像。
- RustFS：[`ghcr.io/rustfs/rustfs:1.0.1`](https://github.com/rustfs/rustfs)，官方镜像。

容器使用临时生成的测试凭据，等待服务就绪后通过 S3 API 建桶；最后一个租约释放时移除容器及匿名卷。

源码 JSDoc 遵循[统一规范](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)：公开示例使用实际发布入口，内部示例在原模块作用域检查。构建后执行 `pnpm check:jsdoc --package storage`；示例编译不代替真实后端行为验证。

真实 Chrome 回归：先安装可用的 Chrome，设置 `HAI_STORAGE_RUN_BROWSER_GATES=1` 后执行 `pnpm --filter @h-ai/storage exec vitest run tests/storage-client-browser.test.ts`。该门禁实际发送 HTTP PUT 并检查原生取消和监听清理；缺少浏览器会失败。

## 许可证

Apache-2.0
