# Payment 配置

[English](payment.en.md) · [日本語](payment.ja.md)

[配置手册](README.md)

## 配置入口

生成的项目把付款渠道的设置放在 `config/_payment.yml`。应用启动时从 `core.config.get('payment')` 读取并传给 `payment.init()`。用环境变量覆盖时使用 `HAI_PAYMENT_` 前缀。见[配置来源和覆盖顺序](runtime.md#配置从哪里来)。

应用按需配置微信支付、支付宝和 Stripe。收到渠道的支付通知时，服务端把原始通知交给 `payment.handleNotify()` 验签，确认成功后再更新业务订单。更新时检查订单号和已处理状态，避免渠道重复通知导致重复发货。

## 配置示例

```yaml schema=@h-ai/payment:PaymentConfigSchema
stripe:
  secretKey: ${STRIPE_SECRET_KEY}
  webhookSecret: ${STRIPE_WEBHOOK_SECRET}
  successUrl: https://app.example.com/orders/complete
```

## 配置清单

例如，只填写 `stripe` 时，微信支付和支付宝没有启用。启用 Stripe 时必须填写 `stripe.secretKey`、`stripe.webhookSecret` 及 `stripe.successUrl`。

| 配置项                           | 默认值/必填 | 说明                                                                                           |
| -------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `wechat`                         | 可省略      | 微信支付渠道的商户配置与验签参数                                                               |
| `wechat.mchId`                   | 必填        | wechat：微信支付商户号。可填字符串，至少 1 个字符                                              |
| `wechat.apiV3Key`                | 必填        | wechat：微信支付 API v3 密钥。可填字符串，至少 1 个字符                                        |
| `wechat.serialNo`                | 必填        | wechat：商户 API 证书序列号。可填字符串，至少 1 个字符                                         |
| `wechat.privateKey`              | 必填        | wechat：商户签名私钥（PEM）。可填字符串，至少 1 个字符                                         |
| `wechat.platformKeys`            | 必填        | 精确按 Wechatpay-Serial 选择平台证书/公钥，轮换期间同时配置新旧标识                            |
| `wechat.platformKeys.<名称>`     | 必填        | 精确按 Wechatpay-Serial 选择平台证书/公钥，轮换期间同时配置新旧标识。可填字符串，至少 1 个字符 |
| `wechat.appId`                   | 必填        | wechat：商户应用 ID。可填字符串，至少 1 个字符                                                 |
| `alipay`                         | 可省略      | 支付宝渠道的商户配置与验签参数                                                                 |
| `alipay.appId`                   | 必填        | alipay：商户应用 ID。可填字符串，至少 1 个字符                                                 |
| `alipay.sellerId`                | 必填        | alipay：支付宝卖家 ID，通知 seller_id 必须与之匹配。可填字符串，至少 1 个字符                  |
| `alipay.privateKey`              | 必填        | alipay：商户签名私钥（PEM）。可填字符串，至少 1 个字符                                         |
| `alipay.alipayPublicKey`         | 必填        | alipay：支付宝平台公钥，用于验签。可填字符串，至少 1 个字符                                    |
| `alipay.returnUrl`               | 必填        | 手机网站支付完成后返回的可信 HTTPS 地址；仅用于页面导航，不能证明付款。可填字符串，URL         |
| `alipay.signType`                | `"RSA2"`    | alipay：请求和通知允许的签名算法。可填 `"RSA2"`、`"RSA"`                                       |
| `alipay.sandbox`                 | `false`     | alipay：是否使用沙箱网关                                                                       |
| `stripe`                         | 可省略      | Stripe渠道的商户配置与验签参数                                                                 |
| `stripe.secretKey`               | 必填        | stripe：Stripe 服务端密钥                                                                      |
| `stripe.webhookSecret`           | 必填        | stripe：Stripe Webhook 验签密钥。可填字符串，至少 1 个字符                                     |
| `stripe.successUrl`              | 必填        | 托管 Checkout 完成后的可信跳转地址，可含 {CHECKOUT_SESSION_ID}。可填字符串，URL                |
| `stripe.cancelUrl`               | 可省略      | 托管 Checkout 取消按钮的可信跳转地址；省略时不显示返回按钮。可填字符串，URL                    |
| `stripe.webhookToleranceSeconds` | `300`       | stripe：Webhook 时间戳允许偏差，单位秒。正整数                                                 |

## 生效与核对

渠道密钥和回调密钥都由服务端保管。使用测试渠道验证下单，再使用签名正确的测试回调验证业务状态更新。渠道环境与支付例子见[支付渠道配置](experience.md#支付渠道配置)。
