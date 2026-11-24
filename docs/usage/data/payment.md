# payment 数据结构

[English](payment.en.md) · [日本語](payment.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/payment.md) · [功能说明](../function/payment.md)

<a id="example-data"></a>

## 这些数据用来做什么

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

内置 Stripe 渠道使用 1 张表。

| 表名 | 用途 |
| --- | --- |
| [`hai_payment_stripe_operations`](#table-hai-payment-stripe-operations) | 核对重试请求，保存已经取得的渠道结果。 |

<a id="table-hai-payment-stripe-operations"></a>

#### `hai_payment_stripe_operations`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 操作摘要主键，同一业务操作复用。 | `<operation-digest>` |
| `request_hash` | `TEXT` | 否 | — | 请求内容摘要，用于检查重试是否带了相同参数。 | `<request-digest>` |
| `result_json` | `JSON` | 是 | — | 已确认的渠道返回值。为空表示尚未取得结果。 | `null` |
| `payment_intent` | `TEXT` | 是 | — | Stripe PaymentIntent ID，渠道返回后记录。 | `null` |
| `created_at` | `BIGINT` | 否 | — | 登记时间，由数据库给出。单位是 Unix 秒，用于判断安全重试窗口。 | `1794873600` |

微信、支付宝和模拟渠道不创建该表。应用可用 `payment.queryOrder()` 读取渠道状态，确认付款后再更新订单并交付商品。

### 缓存

模块不创建 Redis 键，也没有自动过期的结果缓存。多个实例通过连接同一个 [reldb](reldb.md) 数据库读取同一份 Stripe 操作记录。
