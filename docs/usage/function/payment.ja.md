# @h-ai/payment API リファレンス

<!-- translation: partial -->

[原文（中国語）](payment.md) · [設定](../configuration/payment.ja.md) · [データ構造](../data/payment.ja.md)

<a id="quick-start"></a>

注文作成前に Payment を初期化します。金額の検証と操作の認可はアプリ側で行います。決済サービスの通知と照会結果はアプリ独自の注文状態の入力として扱います。

<a id="api-reference"></a>

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `payment.createOrder`, `queryOrder` | 決済に必要なパラメーターを作成、または現在の状態を照会。 | `await payment.queryOrder(provider, orderNo)` |
| `payment.refund`, `closeOrder` | 返金を依頼、または未完了の注文を終了。結果を確認。 | `await payment.refund(provider, refundRequest)` |
| `payment.handleNotify` | 元のボディーとヘッダーを使って通知を検証・解析。 | `await payment.handleNotify(provider, body, headers)` |
| `payment.getProvider`, `registerProvider` | 利用可能なプロバイダーを取得、または利用前に登録。 | `payment.getProvider(provider)` |

追加の設定項目や利用例は[中国語リファレンス](payment.md)に掲載しています。
