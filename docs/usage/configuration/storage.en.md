# @h-ai/storage Configuration

[Chinese source](storage.md) · [Data structures](../data/storage.en.md) · [API reference](../function/storage.en.md)

Load `config/_storage.yml` before calling `storage.init()`. Use S3 or a compatible service for shared storage. Local storage is intended for a single node or development.

```yaml schema=@h-ai/storage:StorageConfigSchema
type: local
root: ./data/files
```

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `type` | Required | Choose `s3` or `local`. |
| `bucket`, `region`, `accessKeyId`, `secretAccessKey` | Required | S3 bucket, region and credentials. |
| `createBucket`, `forcePathStyle` | `false`, `false` | Allow bucket creation and opt into path-style addressing. |
| `endpoint`, `publicEndpoint`, `publicUrl` | Optional | Configure provider endpoint, client-accessible endpoint and public URL. |
| `prefix` | `""` | Prefix of all object keys. |
| `multipart.partSizeBytes`, `queueSize` | `5242880`, `2` | Part length in bytes and upload concurrency. |
| `root` | Required | Base directory for local mode. |
| `directoryMode`, `fileMode` | `0o755`, `0o644` | Permissions for local directories and files. |
| `operationLog.read`, `write`, `maxLength` | `false`, `true`, `1000` | Record reads or writes and limit log length. |
