# Storage 配置

[English](storage.en.md) · [日本語](storage.ja.md)

[配置手册](README.md)

## 配置入口

生成的项目把文件存储地址放在 `config/_storage.yml`。应用启动时从 `core.config.get('storage')` 读取并传给 `storage.init()`。用环境变量覆盖时使用 `HAI_STORAGE_` 前缀。见[配置来源和覆盖顺序](runtime.md#配置从哪里来)。

选 `type: local` 时，文件写进服务端磁盘。选 `type: s3` 时，服务端通过 `endpoint` 读写对象，客户端临时下载链接可通过 `publicEndpoint` 指向另一个浏览器能访问的地址。需要提供永久公开地址时配置 `publicUrl`，对象本身仍受桶的访问权限限制。

## 配置示例

### 本机开发：把文件保存到磁盘

相对路径从服务启动目录算起。例如应用上传 `reports/june.pdf` 后，文件保存在 `./data/files/reports/june.pdf`。服务账号需要该目录的读写权限；换一台服务器运行时，这个本地目录不会自动共享。

Windows 上的本地存储还要求文件系统支持硬链接，并允许服务账号在对象目录创建和删除临时文件。读取时会短暂创建链接，使已经打开的流不会阻止同一键被覆盖；详见[本地文件的保存方式](../data/storage.md)。

```yaml schema=@h-ai/storage:StorageConfigSchema
type: local
root: ./data/files
```

### 连接 S3 兼容服务

写入 `config/_storage.yml`。服务端通过内网地址访问 `orders-files` 桶，应用传入的 `reports/june.pdf` 会存成 `orders/reports/june.pdf`。先创建桶，凭据通过服务端私有环境变量提供；`${…}` 由 Core 读取配置时替换。

```yaml schema=@h-ai/storage:StorageConfigSchema
type: s3
bucket: orders-files
region: us-east-1
endpoint: https://s3.internal.example.com
forcePathStyle: true
prefix: orders/
accessKeyId: ${HAI_STORAGE_ACCESSKEYID}
secretAccessKey: ${HAI_STORAGE_SECRETACCESSKEY}
```

### 内网存文件，浏览器从公网下载

这一段同样可作为完整的 `_storage.yml`。服务端继续连接内网，预签名链接则使用 `publicEndpoint`。反向代理须把 `/files` 转发到 S3 服务，去掉该目录并保留签名所用的 Host；地址里不填桶名。先从浏览器打开一条实际签名链接验证代理。

```yaml schema=@h-ai/storage:StorageConfigSchema
type: s3
bucket: orders-files
region: us-east-1
endpoint: https://s3.internal.example.com
publicEndpoint: https://downloads.example.com/files
forcePathStyle: true
accessKeyId: ${HAI_STORAGE_ACCESSKEYID}
secretAccessKey: ${HAI_STORAGE_SECRETACCESSKEY}
```

### 上传大文件时限制分片并发

每片设为 8 MiB，每次上传最多同时发送两片。这个设置用于服务端流式上传，不是浏览器请求体的大小上限；HTTP 上传限制仍由接收请求的服务配置。

```yaml schema=@h-ai/storage:StorageConfigSchema
type: s3
bucket: orders-files
region: us-east-1
accessKeyId: ${HAI_STORAGE_ACCESSKEYID}
secretAccessKey: ${HAI_STORAGE_SECRETACCESSKEY}
multipart:
  partSizeBytes: 8388608
  queueSize: 2
```

## 配置清单

本地存储必须填 `root`，S3 存储必须填桶名、区域和凭据。省略 `operationLog` 时，Storage 仍会尝试以 debug 级别记录写入，读取不记录。要关闭写入日志，填写 `operationLog.write: false`。

| 配置项                    | 适用条件     | 默认值/必填             | 说明                                                                                                                   |
| ------------------------- | ------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `type`                    | `type=s3`    | 必填                    | 存储类型。可填 `"s3"`                                                                                                  |
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
| `type`                    | `type=local` | 必填                    | 存储类型。可填 `"local"`                                                                                               |
| `root`                    | `type=local` | 必填                    | 根目录路径。可填字符串，至少 1 个字符                                                                                  |
| `directoryMode`           | `type=local` | `0o755`（十进制 `493`） | 目录创建权限，POSIX 模式                                                                                               |
| `fileMode`                | `type=local` | `0o644`（十进制 `420`） | 文件创建权限，POSIX 模式                                                                                               |
| `operationLog`            | `type=local` | `{}`                    | 文件、目录和签名操作的 debug 日志开关与安全摘要长度                                                                    |
| `operationLog.read`       | `type=local` | `false`                 | 以 debug 记录读取操作，默认关闭                                                                                        |
| `operationLog.write`      | `type=local` | `true`                  | 以 debug 记录写入操作，默认开启                                                                                        |
| `operationLog.maxLength`  | `type=local` | `1000`                  | 诊断摘要的字符上限，0 省略摘要。非负整数                                                                               |

## 生效与核对

本地服务的数据目录应具备读写权限。S3 存储使用真实私有凭据，通过真实部署路径核对私有文件权限、直连下载及签名有效时间。[文件存储与临时签名](data.md#文件存储与临时签名)
