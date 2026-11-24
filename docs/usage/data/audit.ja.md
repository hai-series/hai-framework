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

`reldb.init()` で接続し、`audit.init()` で監査テーブルを準備します。

モジュールは 3 テーブルを使用します。

| テーブル | 用途 |
| --- | --- |
| [`hai_audit_logs`](#table-hai-audit-logs) | 誰がいつどの対象に何をしたか確認します。 |
| [`hai_audit_policy`](#table-hai-audit-policy) | データベースが最短保持期間を守るために使います。 |
| [`hai_audit_alert_claims`](#table-hai-audit-alert-claims) | 同じルール・宛先・時間枠を一つのインスタンスが取得します。 |

<a id="table-hai-audit-logs"></a>

#### `hai_audit_logs`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | イベントの主キー。Audit が発行する値は `audit_` で始まります。 | `audit_example-42` |
| `user_id` | `TEXT` | 可 | — | 操作した利用者の ID。 | `user-42` |
| `action` | `TEXT` | 不可 | — | 実行した操作。 | `read` |
| `resource` | `TEXT` | 不可 | — | 対象の種類。 | `orders` |
| `resource_id` | `TEXT` | 可 | — | 対象の ID。 | `order-42` |
| `details` | `JSON` | 可 | — | 調査に使う業務の詳細。 | `{"fields":["status"]}` |
| `ip_address` | `TEXT` | 可 | — | リクエスト元 IP アドレス。 | `192.0.2.10` |
| `user_agent` | `TEXT` | 可 | — | クライアントのユーザーエージェント。 | `Example Browser` |
| `category` | `TEXT` | 可 | — | 絞り込みに使うイベント分類。 | `security` |
| `outcome` | `TEXT` | 可 | — | 操作の成功、失敗、拒否の区別。 | `success` |
| `severity` | `TEXT` | 可 | — | イベントの重要度。 | `info` |
| `request_id` | `TEXT` | 可 | — | 関連するリクエスト ID。 | `req-42` |
| `trace_id` | `TEXT` | 可 | — | 関連するトレース ID。 | `trace-42` |
| `scope_id` | `TEXT` | 可 | — | イベントが属する業務範囲。 | `team-1` |
| `actor_snapshot` | `JSON` | 可 | — | 操作時点の実行者情報。 | `{"id":"user-42"}` |
| `created_at` | `TIMESTAMP` | 可 | — | Audit の書き込み時にデータベース時計から取得するイベント時刻。 | `2026-11-17T00:00:00.000Z` |

`created_at` のインデックスを期間検索と保持期限後の削除に使います。アプリのトランザクション内で作成したログは、そのトランザクションとともに確定またはロールバックされます。

<a id="table-hai-audit-policy"></a>

#### `hai_audit_policy`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | 不可 | — | 初期化時に挿入する一行の固定主キー。 | `1` |
| `enabled` | `INTEGER` | 不可 | — | `1` は最短保持を有効化、`0` は無効化。初期値として `0` を書き込みます。 | `1` |
| `min_days` | `INTEGER` | 不可 | — | 最短保持日数。初期値として `90` を書き込みます。 | `90` |

<a id="table-hai-audit-alert-claims"></a>

#### `hai_audit_alert_claims`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `VARCHAR(64)` | 不可 | — | ルール・宛先・時間枠から計算するダイジェスト。主キー。 | `<claim-digest>` |
| `rule_id` | `VARCHAR(64)` | 不可 | — | アラートルール ID。 | `failed-login` |
| `target_id` | `VARCHAR(64)` | 不可 | — | アラートの通知先 ID。 | `security` |
| `window_start` | `BIGINT` | 不可 | — | アラート時間枠の開始。Unix ミリ秒。 | `1794873600000` |
| `status` | `VARCHAR(16)` | 不可 | — | 取得後の処理状態。 | `claimed` |
| `queue_id` | `VARCHAR(64)` | 可 | — | キューに入った場合の Reach キュー ID。 | `notification-42` |
| `error_code` | `VARCHAR(128)` | 可 | — | 失敗時の調査用エラーコード。 | `NULL` |

<a id="policy"></a>

#### 保持ポリシーとアラートの取得

データベースは保護対象の監査ログの更新や、最短保持期間に達していないログの削除を防ぎます。通知の取得は取得テーブルで調整し、実際の送信記録は Reach が保存します。

<a id="backups"></a>

### キャッシュとバックアップ

Audit は Redis のキーを作りません。バックアップは非公開の Storage オブジェクト `hai-private/audit-backups/<id>.jsonl` です。先頭行に形式・版・対象期限、中間行に各イベント、末尾に件数と SHA-256 を記録します。保持期間はストレージ側で設定します。
