# @h-ai/payment Configuration

[Chinese source](payment.md) · [Data structures](../data/payment.en.md) · [API reference](../function/payment.en.md)

Enable only channels you use in `_payment.yml` and initialize Payment on the server. Keep signing keys and webhook credentials in private environment variables.

```yaml schema=@h-ai/payment:PaymentConfigSchema
stripe:
  secretKey: ${STRIPE_SECRET_KEY}
  webhookSecret: ${STRIPE_WEBHOOK_SECRET}
  successUrl: https://app.example.com/orders/complete
```

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `wechat` | Optional | Requires `mchId`, `appId`, `apiV3Key`, `serialNo`, `privateKey` and `platformKeys`. Map each platform key name to its real public key. |
| `alipay` | Optional | Requires `appId`, `sellerId`, `privateKey`, `alipayPublicKey` and `returnUrl`. `signType` defaults to `RSA2`, `sandbox` to false. |
| `stripe` | Optional | Requires `secretKey`, `webhookSecret` and `successUrl`. `cancelUrl` is optional, and `webhookToleranceSeconds` defaults to 300. |
