# Payment 配置

[配置手册](README.md)

## 配置入口

生成项目使用 `config/_payment.yml`，配置注册名为 `payment`，环境覆盖前缀为 `HAI_PAYMENT_`。覆盖顺序和无敏感值示例见[运行配置](runtime.md#配置从哪里来)。

`payment.init(config)` 读取 `PaymentConfigSchema` 校验后的渠道配置；填入哪些渠道就接入哪些渠道。应用负责配置外部回调路由、核对回调签名并按业务订单幂等更新。

## 配置示例

```yaml schema=@h-ai/payment:PaymentConfigSchema
stripe:
  secretKey: ${STRIPE_SECRET_KEY}
  webhookSecret: ${STRIPE_WEBHOOK_SECRET}
  successUrl: https://app.example.com/orders/complete
```

## 配置清单

表中的默认值适用于当前配置区块存在时。标为“必填”的字段在使用对应区块或后端时填写。“可省略”表示 Schema 不填充值；如有运行时回退，单独注明。`[]` 表示数组中每一项。

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
| `alipay.signType`                | `"RSA2"`    | alipay：请求和通知允许的签名算法。可填`"RSA2"`、`"RSA"`                                        |
| `alipay.sandbox`                 | `false`     | alipay：是否使用沙箱网关                                                                       |
| `stripe`                         | 可省略      | Stripe渠道的商户配置与验签参数                                                                 |
| `stripe.secretKey`               | 必填        | stripe：Stripe 服务端密钥                                                                      |
| `stripe.webhookSecret`           | 必填        | stripe：Stripe Webhook 验签密钥。可填字符串，至少 1 个字符                                     |
| `stripe.successUrl`              | 必填        | 托管 Checkout 完成后的可信跳转地址，可含 {CHECKOUT_SESSION_ID}。可填字符串，URL                |
| `stripe.cancelUrl`               | 可省略      | 托管 Checkout 取消按钮的可信跳转地址；省略时不显示返回按钮。可填字符串，URL                    |
| `stripe.webhookToleranceSeconds` | `300`       | stripe：Webhook 时间戳允许偏差，单位秒。正整数                                                 |

## 生效与核对

渠道密钥和回调密钥都由服务端保管。使用测试渠道验证下单，再使用签名正确的测试回调验证业务状态更新。渠道环境与支付例子见[支付渠道配置](experience.md#支付渠道配置)。
