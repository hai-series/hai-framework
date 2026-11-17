# @h-ai/cache Configuration

[Chinese source](cache.md) · [Data structures](../data/cache.en.md) · [API reference](../function/cache.en.md)

Load `config/_cache.yml` in Node and pass the result to `cache.init()`. Use Redis for state shared across processes. The memory provider is local to one process.

```yaml schema=@h-ai/cache:CacheConfigSchema
type: redis
host: redis.internal
keyPrefix: 'orders:'
```

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `type` | Required | Choose `memory` or `redis`. |
| `url`, `password` | Optional | Redis connection URL and credential. Keep credentials in server environment variables. |
| `host`, `port`, `db` | `localhost`, `6379`, `0` | Standalone address, port and logical database. |
| `cluster` | Optional | Cluster nodes, each with required `host` and `port`. |
| `sentinel` | Optional | Sentinel connection with required `name` and `sentinels` containing addresses and ports. |
| `connectTimeout`, `commandTimeout` | `10000`, `5000` | Connection and command deadlines in milliseconds. |
| `keyPrefix` | Optional | Namespace keys for this application. Scan by the application's key pattern. |
| `tls`, `readOnly` | `false`, `false` | Use TLS or request read-only behavior. |
| `maxRetries`, `retryDelay` | `3`, `50` | Retry budget and delay in milliseconds. |
