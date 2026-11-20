# @h-ai/storage Data structures

[Chinese source](storage.md) · [Configuration](../configuration/storage.en.md) · [API reference](../function/storage.en.md)

<a id="example-data"></a>

## What these records are for

Start with the purpose and examples, then consult field and storage details below. IDs and business content are fictional; sensitive values are redacted. Times use 2026-11-17 00:00 UTC as the example start, with units explained for each record.

### Information about a file

Structure: `FileMetadata`.

Listings and file details describe location, size and type without downloading contents.

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

reports/order-42.txt is a 5-byte text file. lastModified is a Date in code and a UTC date string in JSON.

### Extra information beside a local file

Structure: `Local sidecar`.

Local files do not inherently retain uploaded MIME type and custom attributes, so Storage keeps a small sidecar file.

```json
{
  "contentType": "text/plain",
  "metadata": {
    "orderId": "order-42"
  }
}
```

This file is text/plain and relates to order-42. Only business attributes are shown; do not edit the internal versioned sidecar manually.

When restoring a filesystem snapshot, retain both the content and `.hai-storage-meta/`. Verify that the file's device ID, inode and creation time still match its record. A regular file copy can change those values even when the metadata directory is copied too, so `file.head()` may fail to find the record. To migrate between filesystems, pause writes on the source. Read the content type and custom metadata with `file.head()` and the bytes with `file.getStream()`. Write them with `file.put()` on the destination to recreate the record.

## Field, storage and cleanup reference

Objects live on the backend under caller-supplied keys. Storage creates no SQL tables or Redis keys.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `key` | Object path, at most 1024 UTF-8 bytes. |
| `size`, `contentType`, `lastModified` | Size in bytes, MIME type and provider-reported modification time. An S3 upload receipt records when the application received the successful response. |
| `etag` | Cache validator. Local storage builds it from size and modification time; S3 returns it. Use `storage.checksum` for content verification. |
| `metadata` | Optional string-to-string attributes on upload. |
