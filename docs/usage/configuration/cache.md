# Cache 配置

[配置手册](README.md)

## 配置入口

生成的项目将缓存设置写在 `config/_cache.yml`。应用启动时从 `core.config.get('cache')` 读取并传给 `cache.init()`。用环境变量覆盖时使用 `HAI_CACHE_` 前缀。见[配置来源和覆盖顺序](runtime.md#配置从哪里来)。

`type: memory` 把缓存放在当前进程，服务重启后数据消失。多台服务需要共用登录会话、任务锁或限流计数时，给它们配置同一套 Redis 和相同的业务键前缀。

## 配置示例

```yaml schema=@h-ai/cache:CacheConfigSchema
type: redis
host: redis.internal
keyPrefix: 'orders:'
```

## 配置清单

用 `type` 选择 `memory` 或 `redis`。Redis 的三个 `sentinel.*` 字段中，只有选择 Sentinel 时才需要填 `name` 和 `sentinels`。例如，普通 Redis 可只填 `host`，端口会使用表中的默认值。

| 配置项                      | 适用条件      | 默认值/必填   | 说明                                                                  |
| --------------------------- | ------------- | ------------- | --------------------------------------------------------------------- |
| `type`                      | `type=memory` | 必填          | 此处填写 `"memory"`                                                   |
| `type`                      | `type=redis`  | 必填          | 此处填写 `"redis"`                                                    |
| `url`                       | `type=redis`  | 可省略        | 完整 `redis://` 或 `rediss://` 连接地址，在 URL 中指定凭据与库编号    |
| `host`                      | `type=redis`  | `"localhost"` | 主机地址                                                              |
| `port`                      | `type=redis`  | `6379`        | 端口号。可填整数，1–65535                                             |
| `password`                  | `type=redis`  | 可省略        | 单机、Cluster 和 Sentinel 数据节点的认证密码；url 模式使用 URL 内凭据 |
| `db`                        | `type=redis`  | `0`           | 数据库编号（0~15）。可填整数，0–15                                    |
| `cluster`                   | `type=redis`  | 可省略        | 集群节点列表；配置后以集群模式连接                                    |
| `cluster[].host`            | `type=redis`  | 必填          | 集群节点主机地址                                                      |
| `cluster[].port`            | `type=redis`  | 必填          | 集群节点端口，范围 1–65535                                            |
| `sentinel`                  | `type=redis`  | 可省略        | 哨兵配置；配置后以哨兵模式连接                                        |
| `sentinel.sentinels`        | `type=redis`  | 必填          | 哨兵节点列表（至少 1 个）。可填数组，至少 1 项                        |
| `sentinel.sentinels[].host` | `type=redis`  | 必填          | 哨兵节点主机地址                                                      |
| `sentinel.sentinels[].port` | `type=redis`  | 必填          | 哨兵节点端口，范围 1–65535                                            |
| `sentinel.name`             | `type=redis`  | 必填          | 哨兵监控的主节点名称                                                  |
| `connectTimeout`            | `type=redis`  | `10000`       | 连接超时时间（毫秒）。非负整数                                        |
| `commandTimeout`            | `type=redis`  | `5000`        | 命令执行超时（毫秒）。非负整数                                        |
| `keyPrefix`                 | `type=redis`  | 可省略        | 键前缀（自动加在所有键前）                                            |
| `tls`                       | `type=redis`  | `false`       | 是否开启 TLS                                                          |
| `maxRetries`                | `type=redis`  | `3`           | 最大重试次数。非负整数                                                |
| `retryDelay`                | `type=redis`  | `50`          | 重试间隔基数（毫秒）；实际间隔 = retryDelay × 重试次数。非负整数      |
| `readOnly`                  | `type=redis`  | `false`       | 是否只读模式                                                          |

## 生效与核对

Redis 连接地址的优先级为 `url` → `cluster` → `sentinel` → `host`/`port`。URL 模式使用 URL 自带的认证与库编号；Sentinel 模式的 `password` 用来连接发现的数据节点。修改地址或前缀后重建模块实例，并使用读写或共享状态场景核对实际目标。
