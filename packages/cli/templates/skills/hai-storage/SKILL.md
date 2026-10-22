---
name: hai-storage
description: "实现本地/S3 文件与目录操作、流式读写、checksum 和预签名上传下载；处理冲突、校验与取消。"
---

# hai-storage

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/storage 访问本地/S3 文件、目录和预签名上传下载 |
| 适用场景 | 文件接口、目录操作或浏览器直传 |
| 输入 | StorageConfigInput、文件 key、内容、presign 选项 |
| 输出 | file/dir/presign 操作的 HaiResult；deleteMany 的成功 data/失败 error.ext.deleteMany 保留逐项进度；checksum 生成字符串或校验结果 |
| 限制 | 仅服务端；预签名仅 S3，local getUrl/putUrl 返回 UNSUPPORTED_OPERATION、publicUrl 为 null；浏览器先检查 API success 再直传。Local list 使用绑定根目录/prefix/delimiter 的无状态游标，files 与 commonPrefixes 共用 maxKeys（1–1000）；可跨实例续页，每次仍扫描排序且非快照，游标不代替前缀授权。putUrl 不提供 maxSize 强制约束，上传大小须服务端验证。 |

## 使用路径

1. Node 端配置 Local/S3，校验并检查 init；MinIO/RustFS 使用 s3 类型，确认桶和权限。
2. 从 file/dir/presign 选择操作，检查 HaiResult。流与 checksum 按真实签名处理，checksum 在 Node 无需 init。
3. 客户端经受保护 API 或预签名 URL，服务端校验路径、内容、大小及资源权限；putUrl 不强制 maxSize。
4. 不覆盖上传使用 ifNoneMatch；冲突/checksum 失败不能伪装成功。验证取消、流错误和文件清理，最后 close。
5. 批量删除核对逐项进度，S3 每批最多 1000 项；HTTP 200 不能代替成功判断。unknown 结果先核对业务状态，避免重删并发新对象；dir.delete 不保证隔离并发写入或清除 S3 历史版本。

## 按需参考

按本次操作读取对应小节；以已安装版本的公开类型核验签名，示例中的业务变量由应用提供。

- [运行环境](reference.md#运行环境)
- [适用场景](reference.md#适用场景)
- [使用步骤](reference.md#使用步骤)
- [核心 API](reference.md#核心-api)
- [错误码 — `HaiStorageError`](reference.md#错误码--haistorageerror)
- [HTTP API 契约](reference.md#http-api-契约)
- [常见模式](reference.md#常见模式)
- [浏览器端文件上传（预签名 URL 模式）](reference.md#浏览器端文件上传预签名-url-模式)
- [相关 Skills](reference.md#相关-skills)
