# payment 数据结构

[数据结构索引](README.md) · [模块配置](../configuration/payment.md) · [功能说明](../function/payment.md)

## 数据库

只有内置 Stripe Provider 创建 `hai_payment_stripe_operations`。业务订单、履约进度和回调事件的去重记录由应用持久化。

| 字段             | 含义、默认值或约束                                                             |
| ---------------- | ------------------------------------------------------------------------------ |
| `id`             | 主键，由账户、模式、操作类型及业务标识派生的稳定摘要                           |
| `request_hash`   | 必填，请求内容摘要。同一操作 ID 必须对应相同内容                               |
| `result_json`    | 可空，确认后的渠道结果。NULL 表示结果未知                                      |
| `payment_intent` | 可空，已获取的 Stripe PaymentIntent 标识，用于后续查询                         |
| `created_at`     | 必填，首次持久记录的数据库 Unix 秒时间，用于判断是否处于 23 小时的安全重试窗口 |

Stripe 操作记录保存幂等请求及已知结果。微信、支付宝及模拟 Provider 无模块级表，渠道订单状态通过相应 Provider 查询。业务层核实渠道结果后再推进订单。

## 缓存

模块不创建 Redis 键，也没有自动过期的结果缓存。操作记录的保存和核对依赖共享 [reldb](reldb.md)。
