# @h-ai/reach データ構造

[原文（中国語）](reach.md) · [設定](../configuration/reach.ja.md) · [API リファレンス](../function/reach.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

まず用途と例を読み、必要に応じて後半の項目・保存規則を確認してください。ID と業務内容は架空で、秘密は隠しています。時刻は 2026-11-17 00:00 UTC を起点とし、単位は各説明に記します。

DB・ファイルの例は関連項目の抜粋で、そのまま完全な書き込みデータには使えません。省略項目が任意とは限らず、例ごとに異なる段階を示す場合があります。

### 通知の待機・送信・結果

対応する構造：`hai_reach_send_log`。

送信待ち作業と結果記録を兼ね、取得した処理者が結果を書き戻します。

```json
{
  "id": 42,
  "queue_id": "queue-42",
  "provider": "email",
  "to_addr": "example@example.invalid",
  "subject": "Order received",
  "body": "Order order-42 was received.",
  "status": "pending",
  "attempt_count": 0,
  "max_attempts": 5,
  "retry_delay_ms": 60000,
  "next_attempt_at": 1794873600000,
  "retry_safe": false,
  "processing_owner": null,
  "locked_until": null
}
```

queue-42 は未送信・試行0回です。入隊済みは配達済みの意味ではありません。

### 繰り返し使う通知文面

対応する構造：`hai_reach_template`。

共通の件名・本文を保存し、注文番号などを埋め込みます。

```json
{
  "id": 1,
  "name": "order-received",
  "provider": "email",
  "subject": "Order received",
  "body": "Order {{orderId}} was received."
}
```

orderId を実際の番号に置換します。テンプレート登録だけでは送信しません。

### 重複した待ち行列の走査を減らす

対応する構造：`__lock:hai:reach:flush-pending`。

複数ノードの同じ走査を一時的に抑えます。

```json
"<lock-token:redacted>"
```

既定300秒のロックですが、各メッセージの送信資格は DB の取得記録で決まります。

## 項目・保存・削除のリファレンス

配送キューとテンプレートは RelDB に保存します。結果不明として終了した処理を戻す前に外部の結果を確認します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `hai_reach_send_log` | 自動採番 `id`、NULL 可で一意の `queue_id`。プロバイダー、宛先、件名・本文、テンプレート、JSON 変数と追加項目。状態、メッセージ ID、処理所有者、リース期限、最終失敗、安全な再試行の可否、日時。既定は試行 0、上限 5、基準間隔 60000 ミリ秒、最大 3600000 ミリ秒、次回時刻 0。 |
| `hai_reach_template` | 自動採番 ID、一意な名前、対象プロバイダー、件名・本文、作成・更新時刻。 |
| `__lock:hai:reach:flush-pending` | 任意の Cache リース（300 秒）。重複走査を減らし、送信の所有権は RelDB の行で管理。 |
