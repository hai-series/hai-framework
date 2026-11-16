# Storage 配置

[配置手册](README.md)

## 配置入口

生成项目使用 `config/_storage.yml`，配置注册名为 `storage`，环境覆盖前缀为 `HAI_STORAGE_`。覆盖顺序和无敏感值示例见[运行配置](runtime.md#配置从哪里来)。

`storage.init(config)` 按 `StorageConfigSchema` 选择本地目录或 S3 兼容后端。服务端读写地址、浏览器签名地址及静态公开地址各由对应字段配置。

## 配置示例

```yaml schema=@h-ai/storage:StorageConfigSchema
type: local
root: ./data/files
```

## 配置清单

表中的默认值适用于当前配置区块存在时。标为“必填”的字段在使用对应区块或后端时填写。“可省略”表示 Schema 不填充值；如有运行时回退，单独注明。`[]` 表示数组中每一项。

| 配置项                    | 适用条件     | 默认值/必填             | 说明                                                                                                                   |
| ------------------------- | ------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `type`                    | `type=s3`    | 必填                    | 存储类型。可填`"s3"`                                                                                                   |
| `bucket`                  | `type=s3`    | 必填                    | 存储桶名称。可填字符串，至少 1 个字符                                                                                  |
| `createBucket`            | `type=s3`    | `false`                 | 初始化时检查并创建缺失的桶                                                                                             |
| `region`                  | `type=s3`    | 必填                    | 区域。可填字符串，至少 1 个字符                                                                                        |
| `accessKeyId`             | `type=s3`    | 必填                    | Access Key ID。可填字符串，至少 1 个字符                                                                               |
| `secretAccessKey`         | `type=s3`    | 必填                    | Secret Access Key。可填字符串，至少 1 个字符                                                                           |
| `endpoint`                | `type=s3`    | 可省略                  | 自定义端点（用于 MinIO、RustFS、阿里云 OSS 等）。可填字符串，URL                                                       |
| `publicEndpoint`          | `type=s3`    | 可省略                  | 浏览器预签名端点，可含代理目录（如 /delivery/files），不含桶名、凭据或查询；代理须去除目录并保留 Host。可填字符串，URL |
| `forcePathStyle`          | `type=s3`    | `false`                 | 强制使用路径风格 URL（某些 S3 兼容服务需要）                                                                           |
| `prefix`                  | `type=s3`    | `""`                    | S3 桶内对象键前缀，例如 my-app/uploads/，留空使用桶根                                                                  |
| `publicUrl`               | `type=s3`    | 可省略                  | 公开访问基础 URL（用于生成公开 URL）。可填字符串，URL                                                                  |
| `multipart`               | `type=s3`    | `{}`                    | S3 服务端流式上传的分片设置                                                                                            |
| `multipart.partSizeBytes` | `type=s3`    | `5242880`               | 每片字节数，默认 5 MiB，范围 5 MiB 至 5 GiB。可填整数，5242880–5368709120                                              |
| `multipart.queueSize`     | `type=s3`    | `2`                     | 单次上传的最大并发片数，默认 2。至少 1 的整数                                                                          |
| `operationLog`            | `type=s3`    | `{}`                    | 文件、目录和签名操作的 debug 日志开关与安全摘要长度                                                                    |
| `operationLog.read`       | `type=s3`    | `false`                 | 以 debug 记录读取操作，默认关闭                                                                                        |
| `operationLog.write`      | `type=s3`    | `true`                  | 以 debug 记录写入操作，默认开启                                                                                        |
| `operationLog.maxLength`  | `type=s3`    | `1000`                  | 诊断摘要的字符上限，0 省略摘要。非负整数                                                                               |
| `type`                    | `type=local` | 必填                    | 存储类型。可填`"local"`                                                                                                |
| `root`                    | `type=local` | 必填                    | 根目录路径。可填字符串，至少 1 个字符                                                                                  |
| `directoryMode`           | `type=local` | `0o755`（十进制 `493`） | 目录创建权限，POSIX 模式                                                                                               |
| `fileMode`                | `type=local` | `0o644`（十进制 `420`） | 文件创建权限，POSIX 模式                                                                                               |
| `operationLog`            | `type=local` | `{}`                    | 文件、目录和签名操作的 debug 日志开关与安全摘要长度                                                                    |
| `operationLog.read`       | `type=local` | `false`                 | 以 debug 记录读取操作，默认关闭                                                                                        |
| `operationLog.write`      | `type=local` | `true`                  | 以 debug 记录写入操作，默认开启                                                                                        |
| `operationLog.maxLength`  | `type=local` | `1000`                  | 诊断摘要的字符上限，0 省略摘要。非负整数                                                                               |

## 生效与核对

本地服务的数据目录应具备读写权限。S3 存储使用真实私有凭据，通过真实部署路径核对私有文件权限、直连下载及签名有效时间。[文件存储与临时签名](data.md#文件存储与临时签名)
