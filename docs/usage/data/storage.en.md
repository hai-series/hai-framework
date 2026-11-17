# @h-ai/storage Data structures

[Chinese source](storage.md) · [Configuration](../configuration/storage.en.md) · [API reference](../function/storage.en.md)

Objects live on the backend under caller-supplied keys. Storage creates no SQL tables or Redis keys.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `key` | Object path, at most 1024 UTF-8 bytes. |
| `size`, `contentType`, `lastModified` | Size in bytes, MIME type and provider-reported modification time. |
| `etag` | Cache validator. Local storage builds it from size and modification time; S3 returns it. Use `storage.checksum` for content verification. |
| `metadata` | Optional string-to-string attributes on upload. |
