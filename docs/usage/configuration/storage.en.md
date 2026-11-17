# @h-ai/storage Configuration

[Chinese source](storage.md) · [Data structures](../data/storage.en.md) · [API reference](../function/storage.en.md)

At startup, the generated app reads `config/_storage.yml` with `core.config.get('storage')` and passes the result to `storage.init()`. To override a field with an environment variable, use the `HAI_STORAGE_` prefix. Local mode writes files to disk on the server. For several servers that must see the same files, use an S3-compatible service.

```yaml schema=@h-ai/storage:StorageConfigSchema
type: local
root: ./data/files
```

| Field | Applies to | Default or requirement | Meaning |
| --- | --- | --- | --- |
| `type` | Both | Required | Choose `s3` or `local`. The provider fields below are top-level unless a dotted path is shown. |
| `bucket` | S3 | Required | Bucket in which to store the objects. |
| `region` | S3 | Required | S3 region used by the client and the signer. |
| `accessKeyId` | S3 | Required | Access key ID. Load credentials from server environment variables. |
| `secretAccessKey` | S3 | Required | Secret paired with the access key ID. |
| `createBucket` | S3 | `false` | Create a missing bucket at startup. The credentials must permit bucket creation. |
| `forcePathStyle` | S3 | `false` | Put the bucket name in the URL path. Some S3-compatible services need this. |
| `endpoint` | S3 | May be omitted | Service URL that the backend uses to read or write objects. Omit to use the SDK's regional endpoint. |
| `publicEndpoint` | S3 | May be omitted | Browser-facing endpoint for presigned URLs. A proxy prefix such as `/delivery/files` is allowed; remove it when forwarding and preserve the signed Host. Leave out the bucket name, credentials, query and fragment. |
| `publicUrl` | S3 | May be omitted | Base URL for permanent links from `storage.presign.publicUrl()`. It does not grant public access to the bucket. |
| `prefix` | S3 | `""` | Prefix of all keys in the bucket. An empty string uses the bucket root. |
| `multipart.partSizeBytes` | S3 | `5242880` | Bytes per server-side upload part, from 5 MiB to 5 GiB. |
| `multipart.queueSize` | S3 | `2` | Maximum concurrent parts per upload, at least one. |
| `root` | Local | Required | Directory for files. The server process needs read and write access. |
| `directoryMode` | Local | `0o755` (`493`) | POSIX mode for new directories. |
| `fileMode` | Local | `0o644` (`420`) | POSIX mode for new files. |
| `operationLog.read` | Both | `false` | Log read operations at debug level. |
| `operationLog.write` | Both | `true` | Log write operations at debug level. |
| `operationLog.maxLength` | Both | `1000` | Maximum characters in a diagnostic summary. Use `0` to omit the summary. |

After restarting the backend with new settings, try writing and reading an object. Verify a presigned link from the browser's actual entry point as well, especially when using a proxy.
