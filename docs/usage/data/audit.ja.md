# @h-ai/audit データ構造

[原文（中国語）](audit.md) · [設定](../configuration/audit.ja.md) · [API リファレンス](../function/audit.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

### 誰が何をしたか後で確認

対応する構造：`hai_audit_logs`。

重要操作の主体・対象・結果を保存し、後で追跡します。

```json
{
  "id": "audit_example-42",
  "action": "read",
  "resource": "orders",
  "resource_id": "order-42",
  "user_id": "user-42",
  "details": {
    "fields": [
      "status"
    ]
  },
  "created_at": "2026-11-17T00:00:00.000Z"
}
```

user-42 が order-42 の status を読みました。時刻は DB が記録した UTC 表示です。

範囲とイベントを絞り込むと、`audit.countByOutcome` は集計を返します。`{ total: 4, success: 2, failure: 1, denied: 0, unclassified: 1 }` には結果が未分類の履歴が 1 件含まれます。既存の監査行を読み取り、ページ番号と並べ替えは集計に影響しません。

### まだ削除できない監査記録の方針

対応する構造：`hai_audit_policy`。

DB が守る最短保持期間を保存します。

```json
{
  "id": 1,
  "enabled": 1,
  "min_days": 90
}
```

唯一の id:1 方針で90日保護が有効です。日ごとに追加する履歴ではありません。

### 同じ警告を担当する処理を決める

対応する構造：`hai_audit_alert_claims`。

規則・通知先・期間ごとに担当を取得し、重複通知を減らします。

```json
{
  "id": "<claim-digest>",
  "rule_id": "failed-login",
  "target_id": "security",
  "window_start": 1794873600000
}
```

failed-login から security 宛の例です。取得済みでも人への配達完了ではありません。

### 監査バックアップが含む範囲

対応する構造：`backup JSONL`。

先頭行で形式と範囲を示し、その後にイベントと件数・検査値の末尾行が続きます。

```json
{
  "type": "header",
  "format": "hai-audit",
  "version": 1,
  "id": "backup-42",
  "createdAt": "2026-11-17T00:00:00.000Z",
  "cutoff": "2026-11-17T00:00:00.000Z",
  "from": null,
  "requestHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

頭行だけの例で、完全な復元用バックアップではありません。

## 項目・保存・削除のリファレンス

<a id="tables"></a>

### データベースのテーブル

`reldb.init()` の後に `audit.init()` を呼び出し、その接続先にテーブルを準備します。任意項目を省略すると NULL になり、特記のない値は書き込み側が設定します。

#### `hai_audit_logs`

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

### 保持ポリシーとアラートの取得

| フィールドまたはテーブル | 構造と意味 |
| --- | --- |
| `hai_audit_policy` | 整数の主キーは `id=1`。必須の整数 `enabled`（最短保持を適用するか）と `min_days`（日数）の初期値は `0` と `90` です。 |
| `hai_audit_alert_claims` | ルール、通知先、時間枠から文字列主キー `id` を作ります。必須は文字列の `rule_id`、`target_id`、`status` と整数の `window_start`。任意の `queue_id` は Reach の処理、`error_code` は失敗理由を示します。 |

データベースは保護対象の監査ログの更新や、最短保持期間に達していないログの削除を防ぎます。通知の取得は取得テーブルで調整し、実際の送信記録は Reach が保存します。

<a id="backups"></a>

### キャッシュとバックアップ

Audit は Redis のキーを作りません。バックアップは非公開の Storage オブジェクト `hai-private/audit-backups/<id>.jsonl` です。先頭行に形式・版・対象期限、中間行に各イベント、末尾に件数と SHA-256 を記録します。保持期間はストレージ側で設定します。
