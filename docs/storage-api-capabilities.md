# 存储输入约束与跨端能力

`@h-ai/storage/schemas` 是仅依赖 Zod 的浏览器安全入口；`api-contract` 与 `serv` 复用同一规则。Schema 只校验输入，服务端仍先认证、再按可信 session 授权每个资源，Local Provider 仍执行文件系统防逃逸。调用方不能把前缀校验或分页游标当成授权。

## 输入边界

- `StorageKeySchema`：非空、不是纯空白，UTF-8 最多 1024 **字节**；不允许开头 `/`、反斜线、控制字符，以及独立的 `.` / `..` 路径段。不截断、不归一化 key。
- `StoragePrefixSchema`：同样的路径和字节限制，另允许空字符串；允许部分文件名，`report` 不等于目录 `report/`。
- `StorageDeleteKeysSchema`：每个 HTTP 请求 1–1000 个键，按原始数组数量计数，重复项不能绕过上限。Node `file.deleteMany` 允许更大数组，S3 每批最多 1000、Local 并发最多 32；失败时检查 `error.ext.deleteMany` 的已完成/失败/未知/未尝试进度，不能盲目重放整个数组。
- 列表 `maxKeys`：整数 1–1000，`files` 与 `commonPrefixes` 共用预算。续页使用响应原样返回的 token，并保持相同 Provider/根目录/prefix/delimiter；不保证并发写入期间的快照。
- 签名有效期：整数 1–604800 秒，Node 默认 3600 秒，默认 HTTP procedures 使用 900 秒。HTTP 上传签名只接受 `key`、`contentType`、`expiresIn`；下载签名只接受 `key`、`expiresIn`。未知字段直接拒绝，包括未实现的 `contentLength` / `maxSize`，不静默丢弃或假装限制已生效。
- 输入校验在 HTTP 层返回 400；`apiClient` 返回 `HaiApiClientError.VALIDATION_FAILED`，`error.cause.status` 保留 400。合法输入的业务失败仍按 `HaiResult.success` 判断。

```ts
import { StorageDeleteFilesInputSchema } from '@h-ai/api-contract/storage'
import { StorageKeySchema } from '@h-ai/storage/schemas'

const key = StorageKeySchema.safeParse('users/u1/report.pdf')
if (key.success) {
  const input = StorageDeleteFilesInputSchema.parse({ keys: [key.data] })
  // 把 input 交给已初始化的 client.storage.files.deleteMany；仍须检查返回值 success。
}
```

## 能力映射

| Node storage 能力 | api-contract / serv 默认端点 | apiClient / 浏览器消费 | 边界 |
| --- | --- | --- | --- |
| `presign.getUrl` | `POST /storage/presigned-urls/download` | `storage.presignedUrls.createDownload` | 仅 S3；Local 返回 `hai:storage:018`，不返回虚拟 URL |
| `presign.putUrl` | `POST /storage/presigned-urls/upload` | `storage.presignedUrls.createUpload` 后直接 PUT 到 S3 | 仅内容类型与有效期；不是文件代理上传，也不提供上传大小/内容校验保证 |
| `dir.list` | `GET /storage/files` | `storage.files.list` | 共享前缀约束与分页预算；逐次授权 prefix |
| `file.head` | `POST /storage/files/metadata` | `storage.files.getMetadata` | 返回元数据，不能把 ETag 当内容 checksum |
| `file.delete` | `DELETE /storage/files` | `storage.files.delete` | 逐资源授权 |
| `file.deleteMany` | `POST /storage/files/delete-many` | `storage.files.deleteMany` | HTTP 总量上限 1000，返回可确认的删除进度 |
| `file.put/get/getStream/copy/exists`、`dir.delete` | 无默认端点 | 应用自行提供有界且鉴权的服务端流程 | 流、Range、AbortSignal、metadata、cacheControl、条件写等 Node 选项不能直接作为预签名 API 入参 |
| `checksum.generate/verify` | 无默认端点 | 应用选择明确的浏览器实现或服务端校验流程 | Node 无状态工具；不是上传接口自动校验 |
| `presign.publicUrl` | 无默认端点 | 应用按公开资源策略使用 | 仅配置公开 S3 地址时有 URL；不是鉴权链接，Local 为 null |

`FileUpload` / `ImageUpload` / `AvatarUpload` 的 `uploadHandler` 由应用实现。组件的 `maxSize`、`accept` 只负责前端选择体验，不能约束拿到签名后绕过组件的上传；服务端应在对象落库/回调或独立代理上传处验证实际大小、类型、内容和归属，再发布业务记录。不要把 Node `UploadOptions` 当成签名选项，也不要给组件编造不存在的框架上传端点。
