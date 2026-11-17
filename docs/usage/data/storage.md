# storage 数据结构

[English](storage.en.md) · [日本語](storage.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/storage.md) · [功能说明](../function/storage.md)

<a id="example-data"></a>

## 这些数据用来做什么

先看用途和例子，再按需查后面的字段与保存规则。例子中的编号和业务内容是虚构的，敏感值已隐藏。时间以 2026-11-17 00:00 UTC 为起点，具体单位在说明中标明。

### 文件的基本信息

对应结构：`FileMetadata`。

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

### 本地文件旁保存的附加信息

对应结构：`Local sidecar`。

本地文件系统不会自动保留上传时的 MIME 类型和自定义属性，因此 Storage 另外保存小型元信息文件。

```json
{
  "contentType": "text/plain",
  "metadata": {
    "orderId": "order-42"
  }
}
```

此例记录文件是 text/plain，并关联 order-42。这里只展示业务属性；内部文件名按文件版本生成，不应由应用手工修改。

## 字段、存储与清理参考

### 数据库与缓存

模块没有 SQL 表或 Redis 键。文件内容和附加信息保存到所选的本地目录或 S3 兼容存储。业务表可以用对象键指向其中的文件，例如保存用户头像的对象键。

### 对象与元数据

| 字段           | 用途                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| `key`          | 调用方定义的对象标识，支持路径层级，UTF-8 长度上限 1024 字节                                                   |
| `size`         | 字节数                                                                                                         |
| `contentType`  | MIME 类型，上传时可指定                                                                                        |
| `lastModified` | 后端报告的修改时间                                                                                             |
| `etag`         | 用于校验缓存的标记。本地存储根据大小和修改时间生成，S3 由服务端返回。要校验文件内容，请使用 `storage.checksum` |
| `metadata`     | 自定义字符串键值映射，上传时可提供                                                                             |

使用 S3 时，文件和附加信息写入配置的桶，保存多久及是否保留旧版本由桶的设置决定。使用本地目录时，文件按对象键存到对应路径。同级的 `.hai-storage-meta/<文件代际>.meta.json` 保存该版本文件的 `contentType` 和 `metadata`。应用通过存储 API 访问对象，内部元数据和临时文件不会列为对象。S3 可按指定有效期生成访问链接。
