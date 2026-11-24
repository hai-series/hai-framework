# payment 数据结构

[English](payment.en.md) · [日本語](payment.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/payment.md) · [功能说明](../function/payment.md)

重复提交同一 Stripe 操作时，Payment 根据持久化的操作摘要找回已有记录并核对请求内容。商品交付状态与回调处理进度由应用单独保存。

<a id="database"></a>

## 数据库

启用内置 Stripe 渠道时，模块创建 `hai_payment_stripe_operations` 表，用来核对同一次操作的重试并记下已确认的渠道结果。业务订单、是否已交付商品，以及是否已处理某条回调，由应用自己的数据库记录。

内置 Stripe 渠道使用 1 张表。

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

微信、支付宝和模拟渠道不创建该表。应用可用 `payment.queryOrder()` 读取渠道状态，确认付款后再更新订单并交付商品。

<a id="example-data"></a>

<a id="stripe-操作有没有已确认的结果"></a>

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

<a id="stripe-legacy-amounts"></a>

#### 核对旧版 ISK/UGX 记录

旧版创建的 ISK/UGX 记录没有 `stripeAmount`。旧版用业务整数作为 Stripe API 金额，不能根据这类记录认定足额支付。发布前先停止旧节点接收这两个币种的新请求，再切换所有付款和回调节点。升级后，旧记录的下单重放、查单、通知和退款会返回失败，已知未支付的会话仍可按原金额核对后关单。旧版结果未知的下单或退款预留也会保留，其旧请求摘要不能用新金额重试。

用持久化的 Session ID 或业务订单号在 Stripe 商户后台核对实际金额与状态，再按业务情况处理关单、差额或退款。已确认关单的业务如需恢复付款，应创建可追踪的新业务支付编号。保留原操作记录与事件，便于核对已有资金和幂等历史。

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
