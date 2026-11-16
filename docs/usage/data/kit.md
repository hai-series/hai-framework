# kit 数据结构

[数据结构索引](README.md) · [模块配置](../configuration/kit.md) · [功能说明](../function/kit.md)

## 数据库与缓存

模块没有自己的 SQL 表。会话、审计和对象结构由 [IAM](iam.md)、[audit](audit.md) 和 [storage](storage.md) 管理。

## 缓存与 Cookie

| 逻辑键                         | 值                                                                                                                 | 默认值与有效期                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `hai:kit:ratelimit:{<digest>}` | `count` 是已提交的请求计数，`resetAt` 是响应使用的毫秒时间戳。digest 是命名空间、窗口长度和限流身份的 SHA-256 摘要 | 首次计数为 1，服务端 TTL 为 `windowMs`，原子递增保留 TTL。物理键受 cache 的 `keyPrefix` 影响                                 |
| `hai_access_token`             | kit 认证 Cookie，值为 access token，可配置键名                                                                     | Path 为 `/`，带 HttpOnly、SameSite=Lax，生产标记下启用 Secure。Max-Age 取登录返回的有效期，读取优先使用 Authorization Bearer |
| 加密代理处理的配置键           | 被代理的指定 Cookie 值带 `enc:v2:` 前缀                                                                            | 有效期沿用对应 Cookie，密钥和防重放记录见 [crypto](crypto.md)                                                                |

共享限流使用 Redis 的单键比较并交换。本机限流仅用于显式开发或测试。
