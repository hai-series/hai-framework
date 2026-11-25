# @h-ai/storage 数据结构

<a id="storage-数据结构"></a>

[English](storage.en.md) · [日本語](storage.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/storage.md) · [功能说明](../function/storage.md)

上传发票后，应用用对象键重新读取文件，并可查字节数、内容类型或业务元数据。文件的实际位置与生命周期由所选后端管理。

<a id="object-storage"></a>

## 对象存储

模块没有 SQL 表或 Redis 键。文件内容、MIME 类型和自定义属性保存到所选的本地目录或 S3 兼容存储。业务表可以用对象键指向其中的文件，例如保存用户头像的对象键。

| 字段           | 用途                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| `key`          | 调用方定义的对象标识，支持路径层级，UTF-8 长度上限 1024 字节                                                   |
| `size`         | 字节数                                                                                                         |
| `contentType`  | MIME 类型，上传时可指定                                                                                        |
| `lastModified` | 后端报告的修改时间。S3 上传回执记录应用收到写入成功响应的时间                                                    |
| `etag`         | 用于校验缓存的标记。本地存储根据大小和修改时间生成，S3 由服务端返回。要校验文件内容，请使用 `storage.checksum` |
| `metadata`     | 自定义字符串键值映射，上传时可提供                                                                             |

使用 S3 时，文件内容、MIME 类型和自定义属性写入配置的桶，保存多久及是否保留旧版本由桶的设置决定。S3 可按指定有效期生成访问链接。本地文件及 metadata 的路径见下方示例；内部 metadata 文件和上传临时文件不会列为业务对象。

<a id="example-data"></a>

### 文件的基本信息

文件列表和文件详情用这份信息告诉应用文件在哪里、多大、是什么类型，不必下载正文。

```json
{
  "key": "reports/order-42.txt",
  "size": 5,
  "contentType": "text/plain",
  "lastModified": "2026-11-17T00:00:00.000Z",
  "metadata": {
    "orderId": "order-42"
  }
}
```

reports/order-42.txt 是一个5字节的文本文件；lastModified 在代码里是 Date，JSON 显示为 UTC 日期字符串。

### 一次读取打开的对象

`StorageFileRead` 是服务端在一次读取中拿到的对象。以 `reports/order-42.txt` 为例，`metadata` 包含上面的 5 字节和 MIME 类型，`stream` 逐块交付同一对象的字节。应用可据此校验类型或生成响应头。读完可调用 `close()`，决定跳过正文时也可立即调用它释放句柄或连接。

### 保存文件类型和业务属性的 JSON 文件

保存位置：对象所在目录下的 `.hai-storage-meta/<哈希>.meta.json`。

假设本地根目录是 `./data/storage`，对象键是 `reports/order-42.txt`：文件内容写入 `data/storage/reports/order-42.txt`，上传时指定的 MIME 类型和自定义属性写入 `data/storage/reports/.hai-storage-meta/<哈希>.meta.json`。`file.head()` 和 `file.getStreamWithMetadata()` 读取这个 metadata 文件，才能返回上传时的这些属性。例如：

```json
{
  "contentType": "text/plain",
  "metadata": {
    "orderId": "order-42"
  }
}
```

这个 metadata 文件记录 `text/plain` 和业务属性 `orderId: order-42`，不保存文件正文、大小或修改时间。上传时未提供这两项属性，metadata JSON 的内容就是 `{}`，不影响上传的文件正文。文件名中的哈希是文件设备标识、inode、创建时间、修改时间和大小共同计算出的 SHA-256，由 64 个十六进制字符组成，用来找到当前文件对应的 metadata 文件；应用不应手工改名或修改内容。

覆盖对象后，Storage 尝试删除被替换文件的 metadata 文件；删除对象时，也会尝试删除对应的 metadata 文件。若内容已写入或删除，但 metadata 文件清理失败，操作仍成功并记录警告，可能留下旧文件；`.hai-storage-meta/` 目录不会随之删除。当前文件缺少有效的 metadata 文件时，读取文件属性会报错，不能把它当作可随意清理的缓存。

用文件系统快照恢复时，请同时保留文件内容和 `.hai-storage-meta/`，并确保上述五项信息仍能匹配。普通文件复制即使带上 metadata 目录，也可能改变这些信息，导致 `file.head()` 无法找到对应文件。迁移到另一文件系统前，先暂停源端写入，再用 `file.head()` 读取类型和自定义属性，用 `file.getStream()` 读取内容。目标端用 `file.put()` 写入并重新生成 metadata 文件。

Windows 上，读取本地文件时会先在同一目录创建一个临时硬链接（`<随机编号>.upload.tmp`），打开后立即删除该链接。硬链接只是同一文件的另一个名称，不复制内容；已打开的流继续读取原文件，同时允许其他请求覆盖原键。文件系统必须支持硬链接，服务账号需要在对象目录创建和删除临时文件的权限。临时链接不作为业务文件列出。
