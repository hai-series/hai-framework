# @h-ai/payment データ構造

[简体中文](payment.md) · [English](payment.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/payment.ja.md) · [API リファレンス](../function/payment.ja.md)

同じ Stripe 操作を再送すると、Payment は保存済みの操作ダイジェストで記録を探し、リクエスト内容を照合します。商品提供とコールバックの処理状況はアプリが別途管理します。

<a id="database"></a>

## データベース

注文、提供状況、コールバックの処理記録はアプリで管理します。組み込みの Stripe チャネルだけが操作テーブルを作成します。

組み込みの Stripe チャネルは 1 テーブルを使用します。

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

<a id="stripe-操作の結果を確認できたか"></a>

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

Redis キーはありません。同じ決済手段を扱うインスタンスでは RelDB を共有します。
