# Cache 配置

[English](cache.en.md) · [日本語](cache.ja.md)

[配置手册](README.md)

## 配置入口

生成的项目将缓存设置写在 `config/_cache.yml`。应用启动时通过 Core 读取缓存配置并传给 `cache.init()`。模板在未指定后端时采用 `memory`，并填写 `keyPrefix: 'hai:'`。生成的 `.env.prod` 将后端设为 Redis。用环境变量覆盖时使用 `HAI_CACHE_` 前缀，例如 `HAI_CACHE_TYPE` 或 `HAI_CACHE_KEYPREFIX`。见[配置来源和覆盖顺序](runtime.md#配置从哪里来)。

`type: memory` 把缓存放在当前进程，服务重启后数据消失。多台服务需要共用登录会话、任务锁或限流计数时，给它们配置同一套 Redis 和相同的业务键前缀。

## 配置清单

用 `type` 选择 `memory` 或 `redis`。下表默认值来自模块 Schema。连接普通 Redis 时可只填 `host`，端口会使用表中的默认值。

| 配置项                      | 适用条件      | 默认值/必填   | 说明                                                                  |
| --------------------------- | ------------- | ------------- | --------------------------------------------------------------------- |
| `type`                      | `type=memory` | 必填          | 此处填写 `"memory"`                                                   |
| `type`                      | `type=redis`  | 必填          | 此处填写 `"redis"`                                                    |
| `url`                       | `type=redis`  | 可省略        | 完整 `redis://` 或 `rediss://` 连接地址，在 URL 中指定凭据与库编号    |
| `host`                      | `type=redis`  | `"localhost"` | 主机地址                                                              |
| `port`                      | `type=redis`  | `6379`        | 端口号。可填整数，1–65535                                             |
| `password`                  | `type=redis`  | 可省略        | 单机、Cluster 和 Sentinel 数据节点的认证密码；url 模式使用 URL 内凭据 |
| `db`                        | 单机 host/port、Sentinel | `0` | 数据库编号，整数 0–15。URL 模式从 URL 读取，Cluster 固定使用 0 |
| `cluster`                   | `type=redis`  | 可省略        | 使用非空集群节点列表启用 Cluster                                      |
| `cluster[].host`            | 配置 `cluster` 时 | 必填     | 集群节点主机地址                                                      |
| `cluster[].port`            | 配置 `cluster` 时 | 必填     | 集群节点端口，范围 1–65535                                            |
| `sentinel`                  | `type=redis`  | 可省略        | 哨兵配置；配置后以哨兵模式连接                                        |
| `sentinel.sentinels`        | 配置 `sentinel` 时 | 必填    | 哨兵节点列表，至少 1 项                                               |
| `sentinel.sentinels[].host` | 配置 `sentinel` 时 | 必填    | 哨兵节点主机地址                                                      |
| `sentinel.sentinels[].port` | 配置 `sentinel` 时 | 必填    | 哨兵节点端口，范围 1–65535                                            |
| `sentinel.name`             | 配置 `sentinel` 时 | 必填    | 哨兵监控的主节点名称                                                  |
| `connectTimeout`            | `type=redis`  | `10000`       | 连接超时时间（毫秒）。非负整数                                        |
| `commandTimeout`            | `type=redis`  | `5000`        | 普通命令的超时毫秒数，非负整数。`blpop` 和 `brpop` 的服务端等待由调用的 `timeout` 单独控制 |
| `keyPrefix`                 | `type=redis`  | 可省略        | 键前缀（自动加在所有键前）                                            |
| `tls`                       | `type=redis`  | `false`       | 是否开启 TLS                                                          |
| `maxRetries`                | `type=redis`  | `3`           | 最大重试次数。非负整数                                                |
| `retryDelay`                | `type=redis`  | `50`          | 重试间隔基数（毫秒）；实际间隔 = retryDelay × 重试次数。非负整数      |
| `readOnly`                  | 单机、Sentinel | `false`       | 连接数据节点时发送 Redis `READONLY`。写权限由 Redis ACL 决定。Cluster 按节点角色管理此选项，默认从主节点读取 |

## 配置示例

以下每段 YAML 都可单独作为 `config/_cache.yml`。按应用使用的部署方式选择一段。

### 本机开发使用 Memory

单进程开发或测试可以将数据保存在应用进程内，启动时无需先启动 Redis。

```yaml schema=@h-ai/cache:CacheConfigSchema
type: memory
```

### 通过 URL 连接托管 Redis

托管服务提供完整连接地址时，将地址填入 `url`。这里的 `rediss://` 启用 TLS，路径 `/2` 选择 2 号库。需要认证时，通过服务端私有环境注入 `HAI_CACHE_URL`，并使用包含服务凭据的完整 URL。

```yaml schema=@h-ai/cache:CacheConfigSchema
type: redis
url: 'rediss://redis.example.com:6380/2'
```

### 连接单机 Redis 并区分业务键

使用 `host` 和 `port` 连接单机 Redis。此例从服务端环境取密码，`keyPrefix` 让应用传入的 `total` 在 Redis 中存为 `orders:total`。

```yaml schema=@h-ai/cache:CacheConfigSchema
type: redis
host: redis.internal
port: 6379
password: '${HAI_CACHE_PASSWORD}'
keyPrefix: 'orders:'
```

预发布环境使用不同地址时，可以在该环境覆盖连接参数。`HAI_CACHE_PASSWORD` 由环境的密钥配置提供。

```dotenv
HAI_CACHE_HOST=redis.staging.internal
HAI_CACHE_PORT=6380
```

### 连接 Redis Cluster

在 `cluster` 中填写现有集群的启动节点。客户端通过这些地址发现各分片，数据存放在 0 号库。此例使用启用了数据节点认证的集群。

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

### 通过 Sentinel 发现主节点

`sentinel.name` 填写 Sentinel 监控的主节点名称。应用联系 `sentinels` 里的地址取得当前主节点，再用 `password` 认证到数据节点的连接。此例选择 1 号库。

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

### 生效与核对

Redis 连接地址的优先级为非空 `url` → 非空 `cluster` → `sentinel` → `host`/`port`。URL 模式使用 URL 自带的认证与库编号。Sentinel 模式的 `password` 用来连接发现的数据节点。修改地址或前缀后重新初始化模块，并使用读写或共享状态场景核对实际目标。
