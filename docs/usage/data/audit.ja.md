# @h-ai/audit データ構造

[原文（中国語）](audit.md) · [設定](../configuration/audit.ja.md) · [API リファレンス](../function/audit.ja.md)

<a id="tables"></a>

## データベースのテーブル

`reldb.init()` の後に `audit.init()` を呼び出し、その接続先にテーブルを準備します。任意項目を省略すると NULL になり、特記のない値は書き込み側が設定します。

### `hai_audit_logs`

| フィールドまたはテーブル | 構造と意味 |
| --- | --- |
| `id` | 文字列の主キー。自動生成する ID は `audit_` で始まります。 |
| `action`, `resource` | 必須の文字列。操作名とリソースの種類です。 |
| `created_at` | データベースの時計で記録する日時です。MySQL ではミリ秒精度の `DATETIME(3)` を使用します。 |
| `user_id`, `resource_id`, `ip_address`, `user_agent` | 操作者、個別リソース、送信元 IP、ユーザーエージェント。NULL を許す文字列です。 |
| `category`, `outcome`, `severity` | イベントの分類、結果、重大度。NULL を許す文字列です。 |
| `request_id`, `trace_id`, `scope_id` | リクエスト、トレース、業務範囲を示す、NULL を許す文字列です。 |
| `details`, `actor_snapshot` | イベント詳細と発生時点の操作者情報。NULL を許す JSON です。 |

`created_at` には期間検索と保持処理用のインデックスがあります。アプリのトランザクション内で記録した監査ログは、そのトランザクションとともに確定またはロールバックされます。

<a id="policy"></a>

## 保持ポリシーとアラートの取得

| フィールドまたはテーブル | 構造と意味 |
| --- | --- |
| `hai_audit_policy` | 整数の主キーは `id=1`。必須の整数 `enabled`（最短保持を適用するか）と `min_days`（日数）の初期値は `0` と `90` です。 |
| `hai_audit_alert_claims` | ルール、通知先、時間枠から文字列主キー `id` を作ります。必須は文字列の `rule_id`、`target_id`、`status` と整数の `window_start`。任意の `queue_id` は Reach の処理、`error_code` は失敗理由を示します。 |

データベースは保護対象の監査ログの更新や、最短保持期間に達していないログの削除を防ぎます。通知の取得は取得テーブルで調整し、実際の送信記録は Reach が保存します。

<a id="backups"></a>

## キャッシュとバックアップ

Audit は Redis のキーを作りません。バックアップは非公開の Storage オブジェクト `hai-private/audit-backups/<id>.jsonl` です。先頭行に形式・版・対象期限、中間行に各イベント、末尾に件数と SHA-256 を記録します。保持期間はストレージ側で設定します。
