# @h-ai/payment

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/audit](../audit/README.md) · [@h-ai/core](../core/README.md)

## 简介

统一支付模块，支持微信支付、支付宝和 Stripe，提供 Provider 模式的后端支付处理与多端客户端调起能力。

## 核心功能清单

| Provider | 支付场景                               |
| -------- | -------------------------------------- |
| 微信支付 | JSAPI / H5 / App / Native (扫码)       |
| 支付宝   | JSAPI / H5 / App / Native              |
| Stripe   | h5：托管 Checkout 页面跳转（国际支付） |

## 使用入门

### 依赖

- `@h-ai/audit` — 审计日志（支付操作自动审计），可选；已初始化时自动写入审计日志
- `@h-ai/reldb` — 启用 Stripe 时必需，先初始化共享数据库；持久化渠道映射和幂等结果。仅微信/支付宝时无此硬依赖。

### 快速开始

#### Node.js 服务端

```typescript
import { payment } from '@h-ai/payment'

// 初始化（会自动注册可用的 Provider）
await payment.init({
  wechat: { mchId: '...', apiV3Key: '...', serialNo: '...', privateKey: '...', appId: '...', platformKeys: { PUB_KEY_ID_123: '平台公钥 PEM' } },
  alipay: { appId: '...', sellerId: '...', privateKey: '...', alipayPublicKey: '...' },
})

// 创建订单
const result = await payment.createOrder('wechat', {
  orderNo: 'ORD001',
  amount: 100,
  description: '测试商品',
  tradeType: 'jsapi',
  userId: 'openid-xxx',
  notifyUrl: 'https://api.example.com/payment/notify/wechat',
})

// 查询订单
const query = await payment.queryOrder('wechat', 'ORD001')

await payment.close()
```

#### 浏览器客户端

```typescript
import { invokePayment } from '@h-ai/payment/client'

// 使用服务端返回的订单数据调起支付
await invokePayment(orderData)
```

### HTTP API 契约

支付 HTTP API 由 `@h-ai/api-contract` 的 `apiContract.payment` 定义。组合进应用 contract 后，可通过 typed client 调用：

```typescript
const order = await api.payment.orders.create({
  provider: 'wechat',
  amount: 100,
  description: '商品',
  tradeType: 'jsapi',
})
```

### 配置

```typescript
await payment.init({
  wechat: {
    mchId: '商户号',
    apiV3Key: 'API v3 密钥',
    serialNo: '证书序列号',
    privateKey: '私钥内容',
    appId: '应用 ID',
    platformKeys: { PUB_KEY_ID_123: '平台公钥 PEM', CERT_SERIAL: '平台证书 PEM' },
  },
  alipay: {
    appId: '应用 ID',
    sellerId: '卖家支付宝用户 ID',
    privateKey: '私钥',
    alipayPublicKey: '支付宝公钥',
    signType: 'RSA2', // 可选，默认 RSA2
    sandbox: false, // 可选，默认 false
  },
  stripe: {
    secretKey: 'sk_test_xxx',
    webhookSecret: 'whsec_xxx',
    successUrl: 'https://app.example/payment/success?session_id={CHECKOUT_SESSION_ID}', // 必填
    cancelUrl: 'https://app.example/payment/cancel', // 可选
    webhookToleranceSeconds: 300, // 可选，默认 300 秒
  },
})
```

只配置需要的 Provider 即可，未配置的 Provider 不会注册。

金额字段统一使用“分”为单位，且必须为正整数。模块会在调用具体 Provider 之前先校验 `amount` / `totalAmount`，避免把非法金额继续传给下游支付平台。

所有内置 Provider 的 HTTP 请求默认附带 15 秒超时，避免网络异常时长时间挂起。

### 通知身份、时钟与业务幂等

微信 `platformKeys` 必填，key 是受信平台证书序列号或公钥 ID，value 为对应 PEM；通知只按 `Wechatpay-Serial` 精确选取，未知标识不自动信任。证书会核对自身序列号及有效期。轮换时在所有节点部署新旧项，确认渠道停止使用旧项后移除；不存在从通知中下载密钥的逻辑。微信签名时间戳必须为严格整数且与节点时钟相差不超过 300 秒，节点须同步时钟。通知只接受 `TRANSACTION.SUCCESS` / transaction 资源，解密后继续核对 `appid/mchid`。

支付宝必填 `sellerId`，验签后核对 `app_id/seller_id`，只接受配置的 RSA2/RSA 算法，拒绝重复表单字段、未知状态和非法日历时间。请求使用明确 `Asia/Shanghai` 的北京时间，签名和订单内容仅在 POST form body 中传输，不进入 URL。`notify_time/gmt_payment` 按北京时间解析；允许渠道跨日重试，不把交易时间或通知原始时间当作五分钟签名窗口。Stripe 校验严格签名时间，支持轮换期多个 v1 签名，并核对 test/live 模式；本 Provider 不支持 Connect/组织上下文事件，应为当前账户配置对应 Webhook secret。

三个内置 Provider 均返回必填 `eventId` 和大写 `currency`，自定义 Provider 也须提供。事件 ID 分别为微信 id、支付宝 notify_id、Stripe event.id。验签解析不创建业务订单、不持久去重，也不保证履约一次；接入层必须用共享数据库核对渠道、订单、金额和币种，以渠道/商户为命名空间去重，并防止乱序回退。业务订单号不能删除后复用。

[可运行消费者示例](examples/payment-notify-consumer.ts) 将业务订单 pending→paid 的条件更新、唯一通知记录和唯一履约 outbox 放进同一事务，SQL 失败必须抛错以回滚。重复 paid 和晚到 pending 不重复生成 outbox；不同金额、币种、渠道或交易号不能更新订单。只有数据库提交成功才向渠道确认成功。示例表属于应用，payment 不会自动创建它们；外部发货由 outbox 投递者携带稳定 ID 做幂等，数据库事务不能保证跨系统副作用恰好一次。定向双进程测试使用两个真实 Node 进程共享 SQLite，证明重复通知和重启后仍仅产生一条业务 outbox；多主机生产使用同一 PostgreSQL/MySQL。

依据：[微信证书与签名时钟](https://pay.wechatpay.cn/doc/v3/merchant/4013053420)、[微信公钥轮换](https://pay.wechatpay.cn/doc/v3/merchant/4012154180)、[支付宝通知核对与重试](https://developer.alibaba.com/docs/doc.htm?articleId=103296&docType=1&treeId=346)。

### 支付宝业务响应与退款状态

下单、查单、退款和关单均校验对应方法的响应 envelope、字符串 `code=10000`、关键字段及返回订单号。HTTP 200、缺失 envelope 或只有成功码均不能当作业务成功。交易不存在、权限/余额不足等业务错误返回对应 `CREATE_ORDER_FAILED` / `QUERY_ORDER_FAILED` / `REFUND_FAILED` / `CLOSE_ORDER_FAILED`；错误 cause 只保留有界的渠道错误标识，不透传原始响应和 `msg/sub_msg`。查单拒绝未知状态及非法金额，不能伪造 pending 或零金额。

退款返回 `success: true` 仍需检查 `data.status`：只有 `fund_change=Y` 为 `success`；`N` 或缺失为 `processing`，需通过支付宝退款查询核实（本模块尚未提供退款查询 API）。`refund_fee` 为累计退款额，不能与本次退款金额直接比较。支付宝 `refundId` 是原交易号，本次退款以 `refundNo` 区分，重试必须保留相同退款号和参数。

```typescript
const refund = await payment.refund('alipay', { orderNo: 'ORDER_1', refundNo: 'REFUND_1', amount: 100 })
if (refund.success && refund.data.status === 'success') {
  // 才可在共享业务数据库中幂等确认退款成功
}
const closed = await payment.closeOrder('alipay', 'ORDER_2')
if (closed.success) {
  // 已核对关单响应中的订单号，才可更新业务订单
}
```

依据：[支付宝退款接口与成功判定](https://aipay.alipay.com/docs/subscribe/api-list/other-basic-interfaces/alipay-trade-refund.html)。

### Stripe 托管 Checkout 与主动关单

只实现 `mode=payment`、`ui_mode=hosted_page` 和 `tradeType=h5`，API 请求固定 `Stripe-Version: 2026-09-30.endive`。不支持 embedded/elements、JSAPI、App、Native 或小程序模式；创建入口、HTTP schema 与浏览器调用均拒绝未实现的场景。服务端 `successUrl` 必填，`cancelUrl` 可选，均为 HTTP(S) 地址；可在成功地址中保留 `{CHECKOUT_SESSION_ID}` 让 Stripe 替换。跳转配置属于服务端，不接受客户端覆盖；同订单重试也不能改变这组创建参数。

`closeOrder('stripe', orderNo)` 按持久映射读取 Session：open/unpaid 调用 `/checkout/sessions/:id/expire`；已 expired 确认后幂等成功，complete/paid 返回失败。遇到并发关闭或响应丢失会重新查询，只有确认过期才成功。成功页/取消页跳转本身既不代表已支付，也不等于已关单。

依据：[创建 Checkout Session](https://docs.stripe.com/api/checkout/sessions/create)、[主动过期 Session](https://docs.stripe.com/api/checkout/sessions/expire)。

### Stripe 回调状态

Stripe Provider 只处理 `mode=payment` 的 `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired`。Webhook 端点只订阅这些事件；其它资源事件或不完整 Session 返回 `NOTIFY_PARSE_FAILED`，不会伪造 pending 订单。

`completed` 且 `payment_status=unpaid` 返回 `pending`，不得履约；`paid` / `no_payment_required` 才返回 `paid`。异步失败返回 `failed`，过期返回 `closed`。只有 `paid` 结果带 `paidAt`，时间取支付成功事件的 `created`，重复接收不会改变它。

结果包含 `eventId`、大写 `currency`，`transactionId` 是 Checkout Session ID。应用须在共享数据库中核对订单、金额、币种，持久去重并防止乱序通知把已支付/已退款订单回退；Provider 验签解析不代替业务事务。回调成功结果也可能为 pending，不能仅判断 `success` 就发货。

依据：[Stripe 事件类型](https://docs.stripe.com/api/events/types)、[Checkout Session 字段](https://docs.stripe.com/api/checkout/sessions/object)。

### Stripe 持久化与幂等

启用 Stripe 前须先 `await reldb.init(dbConfig)` 并检查 success，再初始化 payment；关闭时先 payment 后 reldb。初始化会等待 `hai_payment_stripe_operations` 建表，失败不会发布 Stripe Provider。多节点使用同一 PostgreSQL/MySQL 数据库；SQLite 仅适合开发/明确共享文件的单机进程，不能把不同主机的本地文件当作共享存储。

首次需要订单映射的操作会读取 `/v1/account`，结合密钥的 test/live 模式隔离记录；同账户轮换密钥仍复用原映射。密钥必须为 `sk_test_`、`sk_live_`、`rk_test_` 或 `rk_live_` 前缀，受限密钥还须允许读取账户。

创建订单按账户、模式和 orderNo 生成稳定 `Idempotency-Key`，数据库唯一记录绑定规范请求摘要与 Session ID；metadata.orderNo 禁止被调用方覆盖。查单/退款只按该 Session ID 读取并核对订单号、金额、币种，再保存 PaymentIntent，未知订单明确失败。退款按 refundNo 保留独立幂等结果，同一标识改参数会失败；自由文本 reason 保存在退款 metadata，渠道 reason 使用 requested_by_customer。

网络响应丢失或结果落库失败不会删除预留，也不会伪装成功。未知结果仅在数据库时间计算的 23 小时窗口内沿用同一幂等键重试；超出窗口必须先核对 Stripe 并修复记录，禁止删除记录后盲重试。已确认结果长期保留，不能按普通缓存 TTL 清理；退款返回的是该次受理结果，processing 不等于资金已退回。依据：[Stripe 幂等保留边界](https://docs.stripe.com/api/idempotent_requests)。

### 审计日志

关键支付操作执行成功后会自动写入审计日志（依赖 `@h-ai/audit`），无需额外配置。审计写入失败仅输出 warn 日志，不影响支付操作。

| 操作     | `action`         | 记录内容                                |
| -------- | ---------------- | --------------------------------------- |
| 创建订单 | `create_order`   | provider、amount、tradeType             |
| 支付回调 | `payment_notify` | provider、transactionId、status、amount |
| 退款     | `refund`         | provider、refundNo、amount              |
| 关闭订单 | `close_order`    | provider                                |

> 订单查询（`queryOrder`）为只读操作，不写审计日志。

### 错误处理

```typescript
const result = await payment.createOrder('wechat', orderInput)
if (!result.success) {
  switch (result.error.code) {
    case HaiPaymentError.INVALID_AMOUNT:
      // 金额不是正整数，或 refund.totalAmount < amount
      break
    case HaiPaymentError.PROVIDER_NOT_FOUND:
      // Provider 未注册
      break
    case HaiPaymentError.CREATE_ORDER_FAILED:
      // 创建订单失败
      break
  }
}
```

常用错误码：

| 错误码                                   | code              | 说明            |
| ---------------------------------------- | ----------------- | --------------- |
| `HaiPaymentError.CREATE_ORDER_FAILED`    | `hai:payment:001` | 创建订单失败    |
| `HaiPaymentError.NOT_INITIALIZED`        | `hai:payment:010` | 模块未初始化    |
| `HaiPaymentError.PROVIDER_NOT_FOUND`     | `hai:payment:030` | Provider 未注册 |
| `HaiPaymentError.INVALID_AMOUNT`         | `hai:payment:040` | 金额无效        |
| `HaiPaymentError.UNSUPPORTED_TRADE_TYPE` | `hai:payment:041` | 支付场景未实现  |
| `HaiPaymentError.NOTIFY_VERIFY_FAILED`   | `hai:payment:050` | 回调验签失败    |
| `HaiPaymentError.NOTIFY_PARSE_FAILED`    | `hai:payment:051` | 回调解析失败    |
| `HaiPaymentError.CONFIG_ERROR`           | `hai:payment:070` | 配置无效        |

## 开发测试

```bash
pnpm --filter @h-ai/payment test
```

## 许可证

Apache-2.0
