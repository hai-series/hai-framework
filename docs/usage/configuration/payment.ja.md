# @h-ai/payment 設定

[原文（中国語）](payment.md) · [データ構造](../data/payment.ja.md) · [API リファレンス](../function/payment.ja.md)

## 設定の読み込み

`_payment.yml` では使用する決済手段を有効にし、Payment をサーバーで初期化します。署名鍵と Webhook の認証情報は非公開の環境変数に置きます。

## 設定一覧


| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `wechat` | 省略可 | `mchId`、`appId`、`apiV3Key`、`serialNo`、`privateKey`、`platformKeys` が必要。プラットフォーム鍵の名前と公開鍵を対応付ける。 |
| `alipay` | 省略可 | `appId`、`sellerId`、`privateKey`、`alipayPublicKey`、`returnUrl` が必要。`signType` は `RSA2`、`sandbox` は false が既定。 |
| `stripe` | 省略可 | `secretKey`、`webhookSecret`、`successUrl` が必要。`cancelUrl` は任意で、`webhookToleranceSeconds` の既定は 300。 |

## 設定例

```yaml schema=@h-ai/payment:PaymentConfigSchema
stripe:
  secretKey: ${STRIPE_SECRET_KEY}
  webhookSecret: ${STRIPE_WEBHOOK_SECRET}
  successUrl: https://app.example.com/orders/complete
```

### Stripe の決済ページを利用する

`config/_payment.yml` に記述し、2 つの秘密情報はサーバーの非公開環境変数で渡します。完了・キャンセル時は指定の画面へ戻ります。画面への遷移だけでは入金確認になりません。サーバーが検証した決済結果で注文状態を更新します。ドメインは実際のサイトに置き換えてください。

```yaml schema=@h-ai/payment:PaymentConfigSchema
stripe:
  secretKey: ${STRIPE_SECRET_KEY}
  webhookSecret: ${STRIPE_WEBHOOK_SECRET}
  successUrl: https://shop.example.com/payment/success
  cancelUrl: https://shop.example.com/payment/cancel
```

### まず Alipay のサンドボックスで確認する

サンドボックスの加盟店と鍵を使い、モバイル Web 決済を確認します。アプリ ID、販売者 ID、秘密鍵、Alipay 公開鍵は同じサンドボックスの設定を使います。本番決済の確認前に本番設定へ切り替え、`sandbox` を無効にします。`returnUrl` は画面への遷移先です。

```yaml schema=@h-ai/payment:PaymentConfigSchema
alipay:
  appId: ${ALIPAY_APP_ID}
  sellerId: ${ALIPAY_SELLER_ID}
  privateKey: ${ALIPAY_PRIVATE_KEY}
  alipayPublicKey: ${ALIPAY_PUBLIC_KEY}
  returnUrl: https://shop.example.com/payment/result
  sandbox: true
```

### WeChat Pay の JSAPI 決済を利用する

`config/_payment.yml` に記述し、各値はサーバーの非公開環境変数から読み込みます。加盟店 ID、アプリ ID、加盟店 API 証明書のシリアル番号、署名秘密鍵は、決済を有効にした同じ加盟店の設定を使います。API v3 キーは通知の復号に使います。秘密鍵とプラットフォーム証明書または公開鍵は、パスではなく完全な PEM 内容を渡します。

`YOUR_WECHATPAY_SERIAL` を信頼済みプラットフォーム証明書のシリアル番号または公開鍵 ID に置き換え、通知ヘッダーの `Wechatpay-Serial` と完全に一致させます。加盟店証明書の `serialNo` とは別です。この YAML キーは直接書き換えます。キー名は `${…}` では展開されません。鍵の更新中は新旧の項目を両方残せます。通知が示した未知の ID を自動で信頼することはありません。

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

`wechat` チャネルを有効にする設定で、注文作成や通知ルートの登録は行いません。注文作成時に対象ユーザーの OpenID と実際の通知 URL を渡します。通知の元の本文とプロトコルヘッダーを保持し、`payment.handleNotify()` で署名を確認します。成功後も業務側の注文、金額、処理済み状態を確認してから、注文を更新し商品を提供します。
