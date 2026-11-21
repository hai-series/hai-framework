# @h-ai/storage Configuration

[Chinese source](storage.md) · [Data structures](../data/storage.en.md) · [API reference](../function/storage.en.md)

At startup, the generated app reads `config/_storage.yml` with `core.config.get('storage')` and passes the result to `storage.init()`. To override a field with an environment variable, use the `HAI_STORAGE_` prefix. Local mode writes files to disk on the server. For several servers that must see the same files, use an S3-compatible service.

## Configuration examples

### Store files on the local disk

Relative paths start at the service working directory. Uploading `reports/june.pdf` stores it at `./data/files/reports/june.pdf`. The service account needs read and write access. This local directory is not automatically shared with another server.

On Windows, local storage also requires a filesystem that supports hard links and permission to create and delete temporary files in object directories. Reads briefly create a link so an opened stream does not block replacement of the same key. See [local file storage](../data/storage.en.md).

```yaml schema=@h-ai/storage:StorageConfigSchema
type: local
root: ./data/files
```

### Connect to an S3-compatible service

Put this in `config/_storage.yml`. The backend accesses the `orders-files` bucket through the internal endpoint. The application key `reports/june.pdf` becomes `orders/reports/june.pdf`. Create the bucket first and supply credentials through private server environment variables; Core resolves `${…}` when loading the configuration.

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

### Use a public download endpoint

This is another complete `_storage.yml`. Backend traffic stays internal, while presigned links use `publicEndpoint`. The reverse proxy must forward `/files` to S3, remove that prefix, and preserve the Host used for signing. Leave the bucket name out of the endpoint. Verify an actual signed link in the browser.

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

### Limit concurrent parts for large uploads

Use 8 MiB parts and at most two concurrent parts per upload. These settings apply to backend streaming uploads. They do not set the browser request-body limit, which belongs to the HTTP service.

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

## Configuration reference


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
