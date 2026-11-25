# @h-ai/payment 数据结构

<a id="payment-数据结构"></a>

[English](payment.en.md) · [日本語](payment.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/payment.md) · [功能说明](../function/payment.md)

支付渠道保存渠道订单和交易状态。应用保存自己的业务订单、支付通知去重记录和履约任务。

<a id="provider-order-storage"></a>

## 各渠道如何查单

`payment.queryOrder(providerName, orderNo)` 接收应用保存的订单号。

- **微信支付**。服务端下单时把 `orderNo` 作为商户订单号 `out_trade_no` 发送给微信，后续用同一订单号和商户号直接查微信支付。微信渠道在模块内无需保存订单映射。[微信 JSAPI 支付流程](../function/payment.md#wechat-jsapi-flow)
- **支付宝**。`payment.createOrder()` 在服务端生成已签名的 WAP 表单。浏览器提交到支付宝网关后，支付宝才有机会受理订单。后续 `alipay.trade.query` 直接按商户订单号 `out_trade_no` 查询。支付宝渠道在模块内也无需保存订单映射。[支付宝 WAP 支付流程](../function/payment.md#alipay-wap-flow)
- **Stripe**。查单同样请求渠道。模块先按 Stripe 账户、测试或正式模式和业务订单号 `orderNo` 找到持久化的 Checkout Session ID，再用该 ID 向 Stripe 查询。模块还保存创建订单和退款的请求摘要及结果，供不同节点用同一个幂等键安全重试。

<a id="database"></a>

## 数据库

启用内置 Stripe 渠道时，`payment.init()` 创建下列 1 张表。仅启用微信支付或支付宝时，模块无需创建渠道表。

| 表名 | 用途 |
| --- | --- |
| [`hai_payment_stripe_operations`](#table-hai-payment-stripe-operations) | 核对重试请求，保存已经取得的渠道结果。 |

<a id="table-hai-payment-stripe-operations"></a>

### `hai_payment_stripe_operations`

同一个业务操作只保留一行。结果为空时，重试只能沿用原键及请求摘要，并受数据库时间计算的 23 小时安全窗口限制。超过窗口须先核对 Stripe 的实际结果。

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 操作摘要主键，同一业务操作复用。 | `<operation-digest>` |
| `request_hash` | `TEXT` | 否 | — | 请求内容摘要，用于检查重试是否带了相同参数。 | `<request-digest>` |
| `result_json` | `JSON` | 是 | — | 已确认的渠道返回值。为空表示尚未取得结果。 | `null` |
| `payment_intent` | `TEXT` | 是 | — | Stripe PaymentIntent ID，渠道返回后记录。 | `null` |
| `created_at` | `BIGINT` | 否 | — | 登记时间，由数据库给出。单位是 Unix 秒，用于判断安全重试窗口。 | `1794873600` |

<a id="example-data"></a>


#### 示例 · Stripe 操作有没有已确认的结果

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

#### 示例 · 已确认的 Stripe 会话

下例仅展示同一张表的 `result_json` 列，Checkout 链接和渠道 ID 已替换。模块用 `orderNo`、`currency`、`stripeAmount` 及 `session.id` 核对查单和通知。充值、发货等业务动作以业务事务为准。

```json
{
  "orderNo": "ORDER-ISK-01",
  "amount": 10000,
  "stripeAmount": 1000000,
  "currency": "ISK",
  "session": {
    "id": "cs_test_example",
    "url": "https://checkout.stripe.com/c/pay/example",
    "payment_intent": null
  }
}
```

`amount` 是业务端使用的最小单位，`stripeAmount` 是 Stripe API 编码。初次创建时 `payment_intent` 可以为空，会话查询确认后补全表的 `payment_intent` 列。保留会话映射可避免重试重复创建。重新调起支付前，模块还会读取会话的最新状态和链接。过期会话的行继续保留。

## 运行时数据与业务记录

微信未支付的查单结果可能只包含 `orderNo` 和 `status: 'pending'`，金额从应用已保存的订单读取。支付宝和 Stripe 的查单可返回渠道确认的金额。微信 `refund_started` 记录订单进入退款流程，单笔退款的金额与到账状态由渠道的退款记录确认。

下面是 Stripe 支付通知的字段节选。模块已用持久会话映射核对 `transactionId` 和金额，应用以渠道、商户命名空间及 `eventId` 保存去重记录，并在同一事务中保存订单状态和履约任务。唯一履约任务的编号可交给下游作幂等键。支付宝收到已处理事件时仍返回纯文本 `success`。

```json
{
  "orderNo": "ORDER-ISK-01",
  "transactionId": "cs_test_example",
  "eventId": "evt_example",
  "currency": "ISK",
  "amount": 10000,
  "status": "paid"
}
```

模块不创建 Redis 键，也没有自动过期的结果缓存。多个实例通过连接同一个 [reldb](reldb.md) 数据库读取同一份 Stripe 操作记录。
