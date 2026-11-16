# reach 数据结构

[数据结构索引](README.md) · [模块配置](../configuration/reach.md) · [功能说明](../function/reach.md)

## 数据库

发送日志同时承担共享队列，通过数据库事务和租约领取。延时发送只有持久入队成功后才返回。以下字段没有注明默认值时由写入时提供，可选内容省略后为 NULL。

| 表                                   | 字段与约束                                                                                                                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hai_reach_send_log`                 | `id` 为自增主键；可空 `queue_id` 为唯一队列标识。内容字段为 `provider`（渠道）、`to_addr`（收件地址）、`subject`（主题）、`body`（正文）、`template`（模板名）、`vars_json`（模板变量）、`extra_json`（渠道附加参数）                             |
| `hai_reach_send_log`（结果与租约列） | `status` 为投递状态，`message_id` 记录渠道消息标识；`processing_owner` 为领取所有者令牌、`locked_until` 为租约到期时间；`last_failure` 为上次失败原因，`retry_safe` 为是否允许安全重试，默认 false。`created_at`、`updated_at` 保存登记与更新时间 |
| `hai_reach_send_log`（重试列）       | `attempt_count` 已尝试次数（默认 0），`max_attempts` 最大尝试次数（默认 5），`retry_delay_ms` 基础重试间隔（默认 60000），`max_retry_delay_ms` 最大间隔（默认 3600000），`next_attempt_at` 最早允许尝试的时间（默认 0）                           |
| `hai_reach_template`                 | `id` 为自增主键，`name` 为唯一模板名；`provider` 为渠道限制，`subject` 为模板主题，`body` 为模板正文，`created_at`、`updated_at` 保存创建与更新时间                                                                                               |

模板可来自代码或数据库。未知渠道结果留待核对，是否能够自动重试取决于已配置的幂等能力和当前状态。

## 缓存

当 [cache](cache.md) 已初始化时，扫描器尝试获取逻辑锁键 `hai:reach:flush-pending`。缓存锁使用 `__lock:hai:reach:flush-pending` 存储所有者令牌，有效期 300 秒；Redis 可另加 `keyPrefix`。扫描锁用于减少重复扫描，数据库行租约决定领取和回写权限。
