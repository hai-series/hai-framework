# @h-ai/cache Configuration

[Chinese source](cache.md) · [Data structures](../data/cache.en.md) · [API reference](../function/cache.en.md)

## Configuration entry

Load `config/_cache.yml` through Core and pass the cache configuration to `cache.init()`. The template uses `memory` when no backend is selected and sets `keyPrefix: 'hai:'`. The generated `.env.prod` selects Redis. Use `HAI_CACHE_` environment overrides such as `HAI_CACHE_TYPE` or `HAI_CACHE_KEYPREFIX`. Use Redis for state shared across processes. The memory provider is local to one process.

## Configuration examples

Each YAML example can serve as `config/_cache.yml`. Choose the one that matches your deployment.

### Use Memory for local development

For single-process development or testing, store data in the application process and start it without a Redis service.

```yaml schema=@h-ai/cache:CacheConfigSchema
type: memory
```

### Connect to managed Redis by URL

When a managed service provides a connection URL, set `url` to that address. Here `rediss://` enables TLS and `/2` selects database 2. If authentication is required, set `HAI_CACHE_URL` privately in the server environment to the full URL with the service credentials.

```yaml schema=@h-ai/cache:CacheConfigSchema
type: redis
url: 'rediss://redis.example.com:6380/2'
```

### Connect to standalone Redis with a key prefix

Use `host` and `port` to connect to standalone Redis. This example takes the password from the server environment and uses `keyPrefix` to store the application's `total` key as `orders:total`.

```yaml schema=@h-ai/cache:CacheConfigSchema
type: redis
host: redis.internal
port: 6379
password: '${HAI_CACHE_PASSWORD}'
keyPrefix: 'orders:'
```

If staging uses a different endpoint, override the connection settings in that environment. Set `HAI_CACHE_PASSWORD` through the environment's secret configuration.

```dotenv
HAI_CACHE_HOST=redis.staging.internal
HAI_CACHE_PORT=6380
```

### Connect to Redis Cluster

List the startup nodes of an existing cluster under `cluster`. The client discovers the shards through these addresses and stores data in database 0. This example connects to an authenticated cluster.

```yaml schema=@h-ai/cache:CacheConfigSchema
type: redis
cluster:
  - host: redis-1.internal
    port: 6379
  - host: redis-2.internal
    port: 6379
  - host: redis-3.internal
    port: 6379
password: '${HAI_CACHE_PASSWORD}'
```

### Discover the primary through Sentinel

Set `sentinel.name` to the primary name monitored by Sentinel. The application contacts the addresses in `sentinels` to look up the current primary, then authenticates to the data node using `password`. This example selects database 1.

```yaml schema=@h-ai/cache:CacheConfigSchema
type: redis
sentinel:
  name: orders-primary
  sentinels:
    - host: sentinel-1.internal
      port: 26379
    - host: sentinel-2.internal
      port: 26379
db: 1
password: '${HAI_CACHE_PASSWORD}'
```

## Configuration reference

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `type` | Required | Choose `memory` or `redis`. |
| `url` | Optional | A `redis://` or `rediss://` URL containing any credentials and logical database number. |
| `password` | Optional | Password for standalone, Cluster, or Sentinel-discovered data nodes. Keep it in the server environment. |
| `host`, `port` | `localhost`, `6379` | Standalone address and integer port (1–65535). |
| `db` | `0` | Logical database (integer 0–15) for standalone host/port and Sentinel. URL mode uses the database from the URL and Cluster uses database 0. |
| `cluster` | Optional | A non-empty list enables Cluster. Each node requires `host` and `port` (1–65535). |
| `sentinel` | Optional | Requires the monitored service `name` and a `sentinels` list with at least one node. Each node requires `host` and `port` (1–65535). |
| `connectTimeout` | `10000` | Connection timeout in milliseconds. |
| `commandTimeout` | `5000` | Ordinary command timeout in milliseconds. The call's `timeout` controls how long Redis waits for `blpop` or `brpop`. |
| `keyPrefix` | Optional | Namespace keys for this application. Scan by the application's key pattern. |
| `tls` | `false` | Enable TLS. |
| `readOnly` | `false` | Send Redis `READONLY` when connecting to a standalone or Sentinel-discovered data node. Redis ACLs control write access. Cluster manages this option by node role and reads from primaries by default. |
| `maxRetries`, `retryDelay` | `3`, `50` | Non-negative retry limit and delay base in milliseconds. The connection retry delay multiplies this base by the retry number. |

## Apply and verify

Choose the connection using this priority order: non-empty `url`, non-empty `cluster`, `sentinel`, then `host`/`port`. URL mode uses the credentials in the URL. Reinitialize Cache after changing the connection or key prefix, then verify that a read or write reaches the intended backend.
