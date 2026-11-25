# @h-ai/payment データ構造

[简体中文](payment.md) · [English](payment.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/payment.ja.md) · [API リファレンス](../function/payment.ja.md)

決済事業者は、決済側の注文と取引状態を管理します。アプリは、業務注文、決済通知の処理済み記録、商品提供タスクを保存します。

<a id="provider-order-storage"></a>

## 決済手段ごとの注文照会

`payment.queryOrder(providerName, orderNo)` には、アプリが保存した注文番号を渡します。

- **WeChat Pay**。サーバーは注文作成時に、`orderNo` を加盟店注文番号 `out_trade_no` として WeChat Pay に送ります。その後、同じ注文番号と加盟店番号を使って WeChat Pay に直接照会できます。モジュール側で注文番号の対応を保存する必要はありません。[WeChat JSAPI 決済の流れ](../function/payment.ja.md#wechat-jsapi-flow)
- **Alipay**。`payment.createOrder()` はサーバーで署名済みの WAP フォームを作成します。ブラウザーがフォームをゲートウェイに送信すると、Alipay が注文を受け付ける処理が始まります。`alipay.trade.query` は加盟店注文番号 `out_trade_no` を直接受け取るため、モジュール側で注文番号の対応を保存する必要はありません。[Alipay WAP 決済の流れ](../function/payment.ja.md#alipay-wap-flow)
- **Stripe**。照会先は Stripe です。モジュールは Stripe アカウント、テストか本番かの区分、業務注文番号 `orderNo` を使って保存済みの Checkout Session ID を探し、その ID で Stripe に照会します。注文作成と返金では、複数のインスタンスが同じ冪等キーで安全に再試行できるよう、リクエストのダイジェストと結果も保存します。

<a id="database"></a>

## データベース

組み込みの Stripe を有効にすると、`payment.init()` が以下の 1 テーブルを作成します。WeChat Pay と Alipay のみを使う場合、モジュール側の決済テーブルは不要です。

| テーブル | 用途 |
| --- | --- |
| [`hai_payment_stripe_operations`](#table-hai-payment-stripe-operations) | 再試行リクエストを照合し、Stripe の確認済み結果を保存します。 |

<a id="table-hai-payment-stripe-operations"></a>

### `hai_payment_stripe_operations`

一つの業務操作につき一行を保持します。結果が未確定の場合は、同じキーとリクエストダイジェストを使い、DB 時刻で計算した 23 時間以内に再試行します。期限後は Stripe の結果を確認します。

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | 同じ業務操作で再利用するダイジェスト。主キー。 | `<operation-digest>` |
| `request_hash` | `TEXT` | 不可 | — | 再試行時に同じパラメーターか確認するリクエストのダイジェスト。 | `<request-digest>` |
| `result_json` | `JSON` | 可 | — | 決済手段の確認済み結果。NULL は結果がまだ不明。 | `null` |
| `payment_intent` | `TEXT` | 可 | — | Stripe から受け取った PaymentIntent ID。 | `null` |
| `created_at` | `BIGINT` | 不可 | — | 登録時のデータベース時刻。Unix 秒で、安全に再試行できる期限を判断します。 | `1794873600` |

<a id="example-data"></a>


#### 例 · Stripe 操作の結果を確認できたか

再試行や別ノードでも同じ操作を見つけ、新規支払いとして扱うのを防ぎます。

```json
{
  "id": "<operation-digest>",
  "request_hash": "<request-digest>",
  "result_json": null,
  "payment_intent": null,
  "created_at": 1794873600
}
```

結果が null なので未確認で、商品提供の根拠になりません。created_at は Unix 秒です。

#### 例 · 確認済みの Stripe セッション

確認済みの注文操作の `result_json` 列です。URL と決済事業者の ID は例示用に置き換えています。モジュールは `orderNo`、`currency`、`stripeAmount`、`session.id` を使って照会結果と通知を検証します。商品の提供はアプリ側で確定します。

```json
{
  "orderNo": "ORDER-ISK-01",
  "amount": 10000,
  "stripeAmount": 1000000,
  "currency": "ISK",
  "session": {
    "id": "cs_test_example",
    "url": "https://checkout.stripe.com/c/pay/example",
    "payment_intent": null
  }
}
```

`amount` は業務通貨の最小単位、`stripeAmount` は Stripe API の表現を使用します。作成時に PaymentIntent がない場合もあります。後から照会で確認できたらテーブルの `payment_intent` 列に記録します。保存済みのセッションと対応付けることで、再試行で別セッションが作成されるのを防ぎます。再開用 URL はセッションの現在の状態を確認して返します。期限切れの操作レコードも保持します。

## 実行時データと業務記録

WeChat の未払い注文の照会では、`orderNo` と `status: 'pending'` だけが返ることがあります。請求予定額はアプリの注文を参照します。Alipay と Stripe では事業者が確認した金額を返せます。WeChat の `refund_started` は返金手続きに入った状態です。金額と結果は事業者の個別返金レコードで確認します。

Stripe 通知の抜粋を示します。モジュールは、取引 ID と金額を保存済みのセッションと照合しています。アプリはチャネル、加盟店の範囲、`eventId` で重複を検出し、注文の更新と一意な履行タスクを同じトランザクションで確定します。タスク ID は後続の冪等キーとして使えます。処理済みの Alipay 通知にもプレーンテキストの `success` で応答します。

```json
{
  "orderNo": "ORDER-ISK-01",
  "transactionId": "cs_test_example",
  "eventId": "evt_example",
  "currency": "ISK",
  "amount": 10000,
  "status": "paid"
}
```

Redis キーはありません。同じ Stripe の構成で動くインスタンスは RelDB を共有し、同じ操作レコードを参照します。
