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

### 使用 Stripe 托管付款页

写入 `config/_payment.yml`，两个密钥由服务端私有环境提供。支付完成和取消时分别跳转到示例中的页面。页面跳转不代表已收款，订单状态仍应以服务端验签后的支付结果为准；示例域名需替换成自己的站点。

```yaml schema=@h-ai/payment:PaymentConfigSchema
stripe:
  secretKey: ${STRIPE_SECRET_KEY}
  webhookSecret: ${STRIPE_WEBHOOK_SECRET}
  successUrl: https://shop.example.com/payment/success
  cancelUrl: https://shop.example.com/payment/cancel
```

### 先接入支付宝沙箱

使用沙箱商户和密钥验证手机网站付款流程。应用 ID、卖家 ID、私钥和支付宝公钥必须属于同一套沙箱配置。验收真实支付前，换成生产配置并关闭 `sandbox`；`returnUrl` 仍只用于页面导航。

```yaml schema=@h-ai/payment:PaymentConfigSchema
alipay:
  appId: ${ALIPAY_APP_ID}
  sellerId: ${ALIPAY_SELLER_ID}
  privateKey: ${ALIPAY_PRIVATE_KEY}
  alipayPublicKey: ${ALIPAY_PUBLIC_KEY}
  returnUrl: https://shop.example.com/payment/result
  sandbox: true
```

### 接入微信公众号 JSAPI 支付

写入 `config/_payment.yml`，所有值都从服务端私有环境读取。商户号、应用 ID、商户 API 证书序列号和签名私钥必须属于已开通支付的同一套商户配置；API v3 密钥用于解密通知。私钥及平台证书或公钥要提供完整 PEM 内容，不能只填文件路径。

把 `YOUR_WECHATPAY_SERIAL` 替换成受信平台证书序列号或公钥 ID，必须与通知头 `Wechatpay-Serial` 完全一致；它不是商户证书的 `serialNo`。这处 YAML 键名需要直接替换，不会通过 `${…}` 展开。轮换期间可同时保留新旧两项，通知携带的未知标识不会自动获得信任。

```yaml schema=@h-ai/payment:PaymentConfigSchema
wechat:
  mchId: ${WECHATPAY_MERCHANT_ID}
  appId: ${WECHATPAY_APP_ID}
  apiV3Key: ${WECHATPAY_API_V3_KEY}
  serialNo: ${WECHATPAY_MERCHANT_SERIAL}
  privateKey: ${WECHATPAY_MERCHANT_PRIVATE_KEY}
  platformKeys:
    YOUR_WECHATPAY_SERIAL: ${WECHATPAY_PLATFORM_PUBLIC_KEY}
```

此配置启用 `wechat` 渠道，不会自动创建订单或注册通知路由。下单时由应用提供当前用户的 OpenID 和实际通知地址；通知处理保留原始请求体及协议头，交给 `payment.handleNotify()` 验签。成功后仍须核对业务订单、金额及处理状态，再更新订单或发货。

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
