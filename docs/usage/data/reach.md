# reach 数据结构

[English](reach.en.md) · [日本語](reach.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/reach.md) · [功能说明](../function/reach.md)

<a id="example-data"></a>

## 这些数据用来做什么

先看用途和例子，再按需查后面的字段与保存规则。例子中的编号和业务内容是虚构的，敏感值已隐藏。时间以 2026-11-17 00:00 UTC 为起点，具体单位在说明中标明。

数据库和文件示例只列说明所需字段，不能直接当成完整写入数据；未列出的字段不表示可省略。不同例子可以展示处理过程中的不同时间。

### 一条消息的等待、发送和结果

对应结构：`hai_reach_send_log`。

这是消息待办单，也是发送记录；工作进程领取后发送，再把成功、失败或未知结果写回来。

```json
{
  "id": 42,
  "queue_id": "queue-42",
  "provider": "email",
  "to_addr": "example@example.invalid",
  "subject": "Order received",
  "body": "Order order-42 was received.",
  "status": "pending",
  "attempt_count": 0,
  "max_attempts": 5,
  "retry_delay_ms": 60000,
  "next_attempt_at": 1794873600000,
  "retry_safe": false,
  "processing_owner": null,
  "locked_until": null
}
```

队列 queue-42 尚在 pending，尝试0次且未被领取。next_attempt_at 是最早可尝试的 Unix 毫秒时间；不能把可靠入队等同于对方已收到。

### 重复通知共用的文案模板

对应结构：`hai_reach_template`。

把主题和正文模板单独保存，业务只需提供订单号等变量就能生成消息。

```json
{
  "id": 1,
  "name": "order-received",
  "provider": "email",
  "subject": "Order received",
  "body": "Order {{orderId}} was received."
}
```

order-received 模板中的 orderId 会替换为实际订单号；这条模板本身不会触发发送。

### 减少多个节点重复扫描消息

对应结构：`__lock:hai:reach:flush-pending`。

扫描前短暂取得锁，让其他节点暂时少做同一批扫描，减轻数据库压力。

```json
"<lock-token:redacted>"
```

值是已脱敏的持锁凭据，默认300秒。真正谁能发送某条消息仍由数据库的领取记录决定，不能只凭这把锁。

## 字段、存储与清理参考

### 数据库

发送日志也保存待发送消息。多个进程从同一张表领取消息，并记录谁可以处理、处理权何时到期。延时发送先将消息写进数据库，写入成功后才返回。未注明默认值的字段由写入代码提供，选填字段省略后保存 NULL。

| 表                                   | 字段与约束                                                                                                                                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hai_reach_send_log`                 | `id` 为自增主键；可空 `queue_id` 为唯一队列标识。内容字段为 `provider`（渠道）、`to_addr`（收件地址）、`subject`（主题）、`body`（正文）、`template`（模板名）、`vars_json`（模板变量）、`extra_json`（渠道附加参数）                                                 |
| `hai_reach_send_log`（结果与租约列） | `status` 为投递状态，`message_id` 记录渠道消息标识；`processing_owner` 是领取该消息的工作进程所用的令牌，`locked_until` 是其处理权到期时间；`last_failure` 为上次失败原因，`retry_safe` 为是否允许安全重试，默认 false。`created_at`、`updated_at` 保存登记与更新时间 |
| `hai_reach_send_log`（重试列）       | `attempt_count` 已尝试次数（默认 0），`max_attempts` 最大尝试次数（默认 5），`retry_delay_ms` 基础重试间隔（默认 60000），`max_retry_delay_ms` 最大间隔（默认 3600000），`next_attempt_at` 最早允许尝试的时间（默认 0）                                               |
| `hai_reach_template`                 | `id` 为自增主键，`name` 为唯一模板名；`provider` 为渠道限制，`subject` 为模板主题，`body` 为模板正文，`created_at`、`updated_at` 保存创建与更新时间                                                                                                                   |

模板可以通过代码提供，也可以保存到数据库。向发送渠道提交后如果无法确定结果，先核对是否已经发送。只有当前状态允许且渠道能识别同一请求时，才可自动重试。

### 缓存

当 [cache](cache.md) 已初始化时，扫描器尝试获取逻辑锁键 `hai:reach:flush-pending`。缓存锁使用 `__lock:hai:reach:flush-pending` 存储所有者令牌，有效期 300 秒；Redis 可另加 `keyPrefix`。这个锁可减少多个进程同时扫描同一批记录。哪一个进程有权发送某条消息、写回结果，仍由该消息在数据库中的领取人和截止时间决定。
