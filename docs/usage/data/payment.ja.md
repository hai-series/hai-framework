# @h-ai/payment データ構造

[原文（中国語）](payment.md) · [設定](../configuration/payment.ja.md) · [API リファレンス](../function/payment.ja.md)

注文、提供状況、コールバックの処理記録はアプリで管理します。組み込みの Stripe チャネルだけが操作テーブルを作成します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `hai_payment_stripe_operations` | `id` はアカウント、モード、操作、業務 ID から生成した主キー。`request_hash` は入力内容を固定。`result_json` と `payment_intent` は NULL 可で確定結果と Stripe ID を記録。`created_at` はデータベースの Unix 秒で、23 時間の安全な再試行期間の起点。 |

Redis キーはありません。同じ決済手段を扱うインスタンスでは RelDB を共有します。
