# @h-ai/payment Configuration

[Chinese source](payment.md) · [Data structures](../data/payment.en.md) · [API reference](../function/payment.en.md)

## Configuration entry

Enable the channels you use in `config/_payment.yml`. In the application startup code, read `core.config.get('payment')` and pass the result to `payment.init()`. Add this step when wiring payments into a generated project. Use `HAI_PAYMENT_` overrides such as `HAI_PAYMENT_WECHAT_APIV3KEY`. Reload configuration and initialize Payment again to apply changes. Keep signing keys and webhook credentials in private environment variables. Initialize the shared database before starting Stripe.

## Configuration reference

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `wechat` | Optional | Enables WeChat Pay JSAPI. |
| `wechat.mchId` | Required when enabled | WeChat merchant ID. |
| `wechat.appId` | Required when enabled | App ID to which the payer's OpenID belongs. |
| `wechat.apiV3Key` | Required when enabled | Exactly 32 ASCII letters or digits. Decrypts notifications. |
| `wechat.serialNo` | Required when enabled | Serial of the merchant API certificate used to sign requests. |
| `wechat.privateKey` | Required when enabled | Merchant signing private key in PEM format. |
| `wechat.platformKeys` | Required and non-empty | Trusted PEM certificates or public keys for verifying API responses and notifications. |
| `wechat.platformKeys.<id>` | Required for every trusted signing key | A platform certificate serial or public-key ID beginning with `PUB_KEY_ID_` mapped to its PEM. The response's or notification's `Wechatpay-Serial` selects the entry. |
| `alipay` | Optional | Enables Alipay mobile web payment. |
| `alipay.appId` | Required when enabled | Merchant application ID. |
| `alipay.sellerId` | Required when enabled | Seller ID checked against the notification's `seller_id`. |
| `alipay.privateKey` | Required when enabled | Merchant signing private key in PEM format. |
| `alipay.alipayPublicKey` | Required when enabled | Alipay public key in PEM format, used for API response and notification signatures. |
| `alipay.returnUrl` | Required HTTPS URL | Browser destination after the Alipay flow. |
| `alipay.signType` | `RSA2` | Signature algorithm for requests, API responses, and notifications. Accepts `RSA2` or `RSA`. |
| `alipay.sandbox` | `false` | Selects the sandbox gateway when true. |
| `stripe` | Optional | Enables hosted Checkout. Requires an initialized shared database. |
| `stripe.secretKey` | Required when enabled | Server-side test or live secret or restricted key. Restricted keys need permission to read the account. |
| `stripe.webhookSecret` | Required when enabled | Signing secret for the respective account and mode's webhook endpoint. |
| `stripe.successUrl` | Required HTTP(S) URL | Browser destination on Checkout completion. May contain `{CHECKOUT_SESSION_ID}`. |
| `stripe.cancelUrl` | Optional HTTP(S) URL | Browser destination when the customer chooses to return. |
| `stripe.webhookToleranceSeconds` | `300` | Positive integer. Maximum webhook signature clock skew in seconds. |

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

Put this in `config/_payment.yml`, loading every value from private server environment variables. The merchant ID, app ID, merchant API certificate serial and signing key must belong to the same payment-enabled merchant setup. The API v3 key decrypts notifications and must contain exactly 32 ASCII letters or digits. A wrong length or whitespace causes initialization to fail. Supply the complete PEM text for the private key and platform certificate or public key, rather than a file path.

Replace `YOUR_WECHATPAY_SERIAL` with a trusted platform certificate serial or public key ID, matching the response or notification's `Wechatpay-Serial` header exactly. This is separate from the merchant certificate's `serialNo`. Replace this YAML key directly; `${…}` does not expand map keys. Keep both trusted entries on every node during rotation. The module sends a `Wechatpay-Serial` request header when exactly one configured ID starts with `PUB_KEY_ID_`. Otherwise WeChat selects its default signing key, which must still be in the trusted map.

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

## Verify your configuration

Use test channels to create, query, and close an order. Send a valid signed notification and check the business state and acknowledgement. See [notification integration](../function/payment.en.md#notifications) for each channel’s acknowledgement and Stripe Session matching.
