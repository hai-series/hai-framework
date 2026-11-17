# @h-ai/storage API reference

<!-- translation: partial -->

[Chinese source](storage.md) · [Configuration](../configuration/storage.en.md) · [Data structures](../data/storage.en.md)

<a id="quick-start"></a>

Initialize Storage and use the file API for object operations. Authorize the object key before issuing a signed URL. Use streaming for large downloads.

<a id="api-reference"></a>

| API | Input and result | Example |
| --- | --- | --- |
| `storage.file.put`, `get`, `getStream`, `head`, `exists` | Write an object, read bytes or a stream, inspect metadata, or check existence by key. | `await storage.file.head('reports/jan.pdf')` |
| `storage.file.copy`, `delete`, `deleteMany` | Copy between keys or remove one or several objects. | `await storage.file.delete('reports/jan.pdf')` |
| `storage.dir.list`, `delete` | List or remove objects under a prefix. Follow the returned cursor to read more entries. | `await storage.dir.list('reports/')` |
| `storage.presign.getUrl`, `putUrl`, `publicUrl` | Return a download or upload URL, or a configured public URL when supported. | `await storage.presign.getUrl('reports/jan.pdf')` |
| `storage.checksum.generate`, `verify` | Compute or compare a checksum for content integrity. | `await storage.checksum.generate(bytes)` |

Additional options and workflow examples are available in the [Chinese reference](storage.md).
