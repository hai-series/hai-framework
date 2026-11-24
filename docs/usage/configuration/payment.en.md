# @h-ai/payment Configuration

[Chinese source](payment.md) · [Data structures](../data/payment.en.md) · [API reference](../function/payment.en.md)

## Configuration entry

Enable only channels you use in `_payment.yml` and initialize Payment on the server. Keep signing keys and webhook credentials in private environment variables.

## Configuration reference


| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `wechat` | Optional | Requires `mchId`, `appId`, `apiV3Key`, `serialNo`, `privateKey` and `platformKeys`. Map each platform key name to its real public key. |
| `alipay` | Optional | Requires `appId`, `sellerId`, `privateKey`, `alipayPublicKey` and `returnUrl`. `signType` defaults to `RSA2`, `sandbox` to false. |
| `stripe` | Optional | Requires `secretKey`, `webhookSecret` and `successUrl`. `cancelUrl` is optional, and `webhookToleranceSeconds` defaults to 300. |

## Configuration examples

```yaml schema=@h-ai/payment:PaymentConfigSchema
stripe:
  secretKey: ${STRIPE_SECRET_KEY}
  webhookSecret: ${STRIPE_WEBHOOK_SECRET}
  successUrl: https://app.example.com/orders/complete
```

### Use Stripe Checkout

Put this in `config/_payment.yml` and supply both secrets through the private server environment. Completion and cancellation navigate to the URLs shown. A redirect is not proof of payment: update orders only after the backend verifies the payment result. Replace the example domain with your site.

```yaml schema=@h-ai/payment:PaymentConfigSchema
stripe:
  secretKey: ${STRIPE_SECRET_KEY}
  webhookSecret: ${STRIPE_WEBHOOK_SECRET}
  successUrl: https://shop.example.com/payment/success
  cancelUrl: https://shop.example.com/payment/cancel
```

### Start with the Alipay sandbox

Use a sandbox merchant and keys to check the mobile website flow. The app ID, seller ID and key pair must all belong to that sandbox setup. Before real payments, switch to production credentials and disable `sandbox`. `returnUrl` is still navigation only.

```yaml schema=@h-ai/payment:PaymentConfigSchema
alipay:
  appId: ${ALIPAY_APP_ID}
  sellerId: ${ALIPAY_SELLER_ID}
  privateKey: ${ALIPAY_PRIVATE_KEY}
  alipayPublicKey: ${ALIPAY_PUBLIC_KEY}
  returnUrl: https://shop.example.com/payment/result
  sandbox: true
```

### Use WeChat Pay JSAPI

Put this in `config/_payment.yml`, loading every value from private server environment variables. The merchant ID, app ID, merchant API certificate serial and signing key must belong to the same payment-enabled merchant setup. The API v3 key decrypts notifications. Supply the complete PEM text for the private key and platform certificate or public key, rather than a file path.

Replace `YOUR_WECHATPAY_SERIAL` with a trusted platform certificate serial or public key ID, matching the notification's `Wechatpay-Serial` header exactly. This is separate from the merchant certificate's `serialNo`. Replace this YAML key directly; `${…}` does not expand map keys. Keep both trusted entries during rotation. An unknown identifier supplied by a notification is not automatically trusted.

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

This enables the `wechat` channel; it does not create an order or register a notification route. Supply the current user's OpenID and the actual notification URL when creating an order. Preserve the raw notification body and protocol headers for `payment.handleNotify()` to verify. After success, check the business order, amount and handling state before updating the order or delivering goods.
