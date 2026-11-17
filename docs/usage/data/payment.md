# payment 数据结构

[English](payment.en.md) · [日本語](payment.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/payment.md) · [功能说明](../function/payment.md)

<a id="example-data"></a>

## 这些数据用来做什么

先看用途和例子，再按需查后面的字段与保存规则。例子中的编号和业务内容是虚构的，敏感值已隐藏。时间以 2026-11-17 00:00 UTC 为起点，具体单位在说明中标明。

数据库和文件示例只列说明所需字段，不能直接当成完整写入数据；未列出的字段不表示可省略。不同例子可以展示处理过程中的不同时间。

### Stripe 操作有没有已确认的结果

对应结构：`hai_payment_stripe_operations`。

多个服务或重试提交同一操作时，用相同业务摘要找到原记录，避免把同一次付款当成新操作。

```json
{
  "id": "<operation-digest>",
  "request_hash": "<request-digest>",
  "result_json": null,
  "payment_intent": null,
  "created_at": 1794873600
}
```

result_json 与 payment_intent 都为 null，表示尚未取得已确认结果，不能据此交付商品。created_at 是 Unix 秒，其他摘要只是示例占位。

## 字段、存储与清理参考

### 数据库

启用内置 Stripe 渠道时，模块创建 `hai_payment_stripe_operations` 表，用来核对同一次操作的重试并记下已确认的渠道结果。业务订单、是否已交付商品，以及是否已处理某条回调，由应用自己的数据库记录。

| 字段             | 含义、默认值或约束                                                             |
| ---------------- | ------------------------------------------------------------------------------ |
| `id`             | 主键。Stripe 账户、模式、操作类型和业务标识都相同时，生成相同的摘要            |
| `request_hash`   | 必填，请求内容摘要。同一操作 ID 必须对应相同内容                               |
| `result_json`    | 可空，确认后的渠道结果。NULL 表示结果未知                                      |
| `payment_intent` | 可空，已获取的 Stripe PaymentIntent 标识，用于后续查询                         |
| `created_at`     | 必填，首次持久记录的数据库 Unix 秒时间，用于判断是否处于 23 小时的安全重试窗口 |

微信、支付宝和模拟渠道不创建该表。应用可用 `payment.queryOrder()` 读取渠道状态，确认付款后再更新订单并交付商品。

### 缓存

模块不创建 Redis 键，也没有自动过期的结果缓存。多个实例通过连接同一个 [reldb](reldb.md) 数据库读取同一份 Stripe 操作记录。
