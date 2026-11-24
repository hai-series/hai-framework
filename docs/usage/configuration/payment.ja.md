# @h-ai/payment 設定

[原文（中国語）](payment.md) · [データ構造](../data/payment.ja.md) · [API リファレンス](../function/payment.ja.md)

## 設定の読み込み

`config/_payment.yml` で使用する決済手段を有効にします。アプリの起動コードで `core.config.get('payment')` から設定を取り出し、`payment.init()` に渡します。生成したプロジェクトでは決済の組み込み時にこの処理を追加します。`HAI_PAYMENT_WECHAT_APIV3KEY` などの `HAI_PAYMENT_` で始まる環境変数で上書きできます。変更を適用するには設定を読み直し、再初期化します。署名鍵と Webhook の認証情報は非公開の環境変数に置き、Stripe の起動前に共有 DB を初期化します。

## 設定一覧

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `wechat` | 省略可 | WeChat Pay JSAPI を有効にします。 |
| `wechat.mchId` | 有効時に必須 | WeChat の加盟店 ID。 |
| `wechat.appId` | 有効時に必須 | 支払者の OpenID が属するアプリ ID。 |
| `wechat.apiV3Key` | 有効時に必須 | 通知を復号する、ASCII 英数字ちょうど 32 文字の鍵。 |
| `wechat.serialNo` | 有効時に必須 | リクエストの署名に使う加盟店 API 証明書のシリアル番号。 |
| `wechat.privateKey` | 有効時に必須 | PEM 形式の加盟店署名秘密鍵。 |
| `wechat.platformKeys` | 有効時に必須、空不可 | API 応答と通知の検証に使う、信頼済みの PEM 証明書または公開鍵。 |
| `wechat.platformKeys.<id>` | 信頼する署名鍵ごとに必須 | プラットフォーム証明書のシリアル番号または `PUB_KEY_ID_` で始まる公開鍵 ID を PEM に対応付けます。応答と通知の `Wechatpay-Serial` から選択します。 |
| `alipay` | 省略可 | Alipay のモバイル Web 決済を有効にします。 |
| `alipay.appId` | 有効時に必須 | 加盟店アプリ ID。 |
| `alipay.sellerId` | 有効時に必須 | 通知の `seller_id` と照合する販売者 ID。 |
| `alipay.privateKey` | 有効時に必須 | PEM 形式の加盟店署名秘密鍵。 |
| `alipay.alipayPublicKey` | 有効時に必須 | API 応答と通知の署名検証に使う Alipay の PEM 公開鍵。 |
| `alipay.returnUrl` | 必須の HTTPS URL | Alipay の決済画面から戻るブラウザーの遷移先。 |
| `alipay.signType` | `RSA2` | リクエスト、API 応答、通知の署名方式。 `RSA2` または `RSA`。 |
| `alipay.sandbox` | `false` | true でサンドボックスのゲートウェイを使用します。 |
| `stripe` | 省略可 | ホスト型 Checkout を有効にします。共有 DB の初期化が必要です。 |
| `stripe.secretKey` | 有効時に必須 | テストまたは本番のサーバー用シークレットキーまたは制限付きキー。制限付きキーにはアカウントの読み取り権限が必要です。 |
| `stripe.webhookSecret` | 有効時に必須 | アカウントとモードに対応する Webhook エンドポイントの署名シークレット。 |
| `stripe.successUrl` | 必須の HTTP(S) URL | Checkout 完了時のブラウザー遷移先。`{CHECKOUT_SESSION_ID}` を指定できます。 |
| `stripe.cancelUrl` | 任意の HTTP(S) URL | 顧客が戻る操作を選んだ場合のブラウザー遷移先。 |
| `stripe.webhookToleranceSeconds` | `300` | Webhook 署名時刻に許容する差を秒単位の正の整数で指定します。 |

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

`config/_payment.yml` に記述し、各値はサーバーの非公開環境変数から読み込みます。加盟店 ID、アプリ ID、加盟店 API 証明書のシリアル番号、署名秘密鍵は、決済を有効にした同じ加盟店の設定を使います。通知を復号する API v3 キーは ASCII 英数字ちょうど 32 文字です。長さが違う場合や空白を含む場合は初期化に失敗します。秘密鍵とプラットフォーム証明書または公開鍵は、パスではなく完全な PEM 内容を渡します。

`YOUR_WECHATPAY_SERIAL` を信頼済みプラットフォーム証明書のシリアル番号または公開鍵 ID に置き換え、API 応答または通知の `Wechatpay-Serial` と完全に一致させます。加盟店証明書の `serialNo` とは別です。この YAML キーは直接書き換えます。キー名は `${…}` では展開されません。鍵の更新中はすべてのノードに信頼済みの新旧の項目を残します。`PUB_KEY_ID_` で始まる設定済み ID が一つだけある場合は、リクエストの `Wechatpay-Serial` にその ID を指定します。それ以外の場合は WeChat が既定の署名鍵を選ぶので、その鍵も信頼済みの設定に含めます。

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

## 設定の動作確認

テスト環境で注文を作成・照会・クローズします。有効な署名付き通知を送り、業務状態と応答を確認します。事業者ごとの応答と Stripe セッションの照合は[通知の連携](../function/payment.ja.md#notifications)を参照してください。
