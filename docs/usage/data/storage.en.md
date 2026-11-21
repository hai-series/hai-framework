# @h-ai/storage Data structures

[Chinese source](storage.md) · [Configuration](../configuration/storage.en.md) · [API reference](../function/storage.en.md)

<a id="example-data"></a>

## What these records are for

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

### An opened object

A server-side `StorageFileRead` contains the result of a single read. For `reports/order-42.txt`, its `metadata` describes the five-byte text file above, and its `stream` yields that object's bytes. The application can use the metadata to validate the type or set response headers. Call `close()` when finished or when skipping the body to free the file handle or connection.

### A JSON file storing the file type and business attributes

Location: `.hai-storage-meta/<hash>.meta.json` inside the object's directory.

With the local root `./data/storage` and object key `reports/order-42.txt`, Storage writes the contents to `data/storage/reports/order-42.txt`. It writes the uploaded MIME type and custom attributes to `data/storage/reports/.hai-storage-meta/<hash>.meta.json`. `file.head()` and `file.getStreamWithMetadata()` read this metadata file to return those attributes. For example:

```json
{
  "contentType": "text/plain",
  "metadata": {
    "orderId": "order-42"
  }
}
```

This metadata file records `text/plain` and the custom attribute `orderId: order-42`, without file contents, size or modification time. When neither attribute is supplied on upload, the metadata JSON contains `{}`; the uploaded file's contents are unaffected. Its filename contains a 64-character hexadecimal SHA-256 hash of the file's device ID, inode, creation time, modification time and size. These values identify the matching metadata file; applications must not rename or edit it manually.

After replacing an object, Storage tries to delete the replaced file's metadata file. Deleting an object also tries to delete its metadata file. If content has already been written or deleted but metadata cleanup fails, the operation still succeeds and logs a warning; an old metadata file may remain. Storage does not remove the `.hai-storage-meta/` directory. Reading the file attributes fails if the current metadata file is missing or invalid, so these files are not disposable cache files.

When restoring a filesystem snapshot, retain both the contents and `.hai-storage-meta/`, preserving all five values above. A regular copy may change them even when the metadata directory is copied too, so `file.head()` may fail to find the matching file. To migrate between filesystems, pause source writes, read the type and custom attributes with `file.head()`, and read the contents with `file.getStream()`. Use `file.put()` on the destination to write the object and create a new metadata file.

On Windows, a local read briefly creates a hard link named `<random-id>.upload.tmp` in the same directory, opens it and immediately removes the link. The link is another name for the same file; it does not copy the contents. An opened stream keeps reading the original file while another request can replace the original key. The filesystem must support hard links, and the service account needs permission to create and delete temporary files in the object directory. Temporary links are excluded from object listings.

## Field, storage and cleanup reference

Objects live on the backend under caller-supplied keys. Storage creates no SQL tables or Redis keys.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `key` | Object path, at most 1024 UTF-8 bytes. |
| `size`, `contentType`, `lastModified` | Size in bytes, MIME type and provider-reported modification time. An S3 upload receipt records when the application received the successful response. |
| `etag` | Cache validator. Local storage builds it from size and modification time; S3 returns it. Use `storage.checksum` for content verification. |
| `metadata` | Optional string-to-string attributes on upload. |

With S3, file contents, MIME type and custom attributes are stored in the configured bucket. Bucket settings control retention and old versions. S3 can generate access links with a specified lifetime. The example above shows local file and metadata paths; internal metadata and temporary upload files are not listed as application objects.
