# @h-ai/payment 設定

[原文（中国語）](payment.md) · [データ構造](../data/payment.ja.md) · [API リファレンス](../function/payment.ja.md)

`_payment.yml` では使用する決済手段を有効にし、Payment をサーバーで初期化します。署名鍵と Webhook の認証情報は非公開の環境変数に置きます。

```yaml schema=@h-ai/payment:PaymentConfigSchema
stripe:
  secretKey: ${STRIPE_SECRET_KEY}
  webhookSecret: ${STRIPE_WEBHOOK_SECRET}
  successUrl: https://app.example.com/orders/complete
```

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `wechat` | 省略可 | `mchId`、`appId`、`apiV3Key`、`serialNo`、`privateKey`、`platformKeys` が必要。プラットフォーム鍵の名前と公開鍵を対応付ける。 |
| `alipay` | 省略可 | `appId`、`sellerId`、`privateKey`、`alipayPublicKey`、`returnUrl` が必要。`signType` は `RSA2`、`sandbox` は false が既定。 |
| `stripe` | 省略可 | `secretKey`、`webhookSecret`、`successUrl` が必要。`cancelUrl` は任意で、`webhookToleranceSeconds` の既定は 300。 |
