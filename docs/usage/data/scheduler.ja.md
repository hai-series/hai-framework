# @h-ai/scheduler データ構造

[原文（中国語）](scheduler.md) · [設定](../configuration/scheduler.ja.md) · [API リファレンス](../function/scheduler.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

### どの作業をいつ実行するか

対応する構造：`hai_scheduler_tasks`。

再起動後も計画を復元するための定義です。

```json
{
  "id": 1,
  "task_id": "daily-report",
  "task_name": "Daily report",
  "cron": "0 0 * * *",
  "timezone": "UTC",
  "enabled": true,
  "idempotent": true,
  "delete_after_run": false,
  "params": {
    "reportId": "report-42"
  }
}
```

daily-report は UTC 毎日0時です。idempotent:true だけで外部副作用の一度限り実行を保証しません。

### 今回の起動が実行中か

対応する構造：`hai_scheduler_executions`。

定時・手動の各起動を記録し、重複実行を防ぎます。

```json
{
  "sequence": 42,
  "occurrence_id": "1aac2af840fe011ae7e489827dd6ea6de833cf24cd5c572ef913becb44294f22",
  "task_id": "daily-report",
  "active_task": "daily-report",
  "status": "running",
  "owner": "node-1",
  "leased_until": 1794873630000,
  "attempt_count": 1,
  "max_attempts": 1
}
```

node-1 が daily-report を実行中です。資格の期限切れは外部操作の未実行を意味しません。

### 人が確認する実行履歴

対応する構造：`hai_scheduler_logs`。

結果や所要時間を管理画面で確認する履歴です。

```json
{
  "id": "log-42",
  "occurrence_id": "1aac2af840fe011ae7e489827dd6ea6de833cf24cd5c572ef913becb44294f22",
  "task_id": "daily-report",
  "task_name": "Daily report",
  "status": "success",
  "duration": 125
}
```

前の実行中とは別時点で、後に125ミリ秒で成功した例です。ログ削除では実行占有は解除されません。

## 項目・保存・削除のリファレンス

<a id="tables"></a>

### データベースのテーブル

永続化を有効にすると、Scheduler は予定、実行の占有、結果を [RelDB](reldb.ja.md) に保存します。タスクの時刻は日時、実行とログの時刻は Unix ミリ秒で示します。

モジュールは 3 テーブルを使用します。

| テーブル | 用途 |
| --- | --- |
| [`hai_scheduler_tasks`](#table-hai-scheduler-tasks) | タスクの実行予定、ハンドラー、引数を確認します。 |
| [`hai_scheduler_executions`](#table-hai-scheduler-executions) | 起動ごとの取得、実行、照合をノード間で調整します。 |
| [`hai_scheduler_logs`](#table-hai-scheduler-logs) | 実行ごとの結果、所要時間、詳細を確認します。 |

<a id="table-hai-scheduler-tasks"></a>

#### `hai_scheduler_tasks`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | 不可 | — | タスク行の自動採番主キー。 | `1` |
| `task_id` | `TEXT` | 不可 | — | アプリがタスクを検索する一意の ID。 | `daily-report` |
| `task_name` | `TEXT` | 不可 | — | タスクの表示名。 | `Daily report` |
| `description` | `TEXT` | 可 | — | タスクの説明。 | `NULL` |
| `cron` | `TEXT` | 不可 | — | Cron の予定式。 | `0 0 * * *` |
| `timezone` | `TEXT` | 可 | — | IANA タイムゾーン。省略時は UTC で予定を計算します。 | `UTC` |
| `enabled` | `BOOLEAN` | 不可 | `true` | 定期実行が有効かどうか。 | `true` |
| `idempotent` | `BOOLEAN` | 不可 | `false` | タスクを安全に再実行できることを示すアプリの宣言。 | `true` |
| `delete_after_run` | `BOOLEAN` | 不可 | `false` | 実行後にタスクを削除するかどうか。 | `false` |
| `retry` | `JSON` | 可 | — | タスクの再試行設定。 | `NULL` |
| `params` | `JSON` | 可 | — | タスクのハンドラーに渡す引数。 | `{"reportId":"report-42"}` |
| `handler` | `JSON` | 可 | — | 永続化するハンドラーの記述。 | `NULL` |
| `created_at` | `TIMESTAMP` | 可 | — | タスクの登録時刻。 | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | 可 | — | タスクの最終更新時刻。 | `2026-11-17T00:00:00Z` |

<a id="table-hai-scheduler-executions"></a>

#### `hai_scheduler_executions`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `sequence` | `INTEGER` | 不可 | — | 実行行の自動採番主キー。 | `42` |
| `occurrence_id` | `TEXT` | 不可 | — | 同じ実行を検索する一意の起動 ID。 | `1aac2af840fe011ae7e489827dd6ea6de833cf24cd5c572ef913becb44294f22` |
| `task_id` | `TEXT` | 不可 | — | 対応するタスク ID。 | `daily-report` |
| `active_task` | `TEXT` | 可 | — | 実行が占有しているタスク ID。一つの行だけが同じ値を持てます。 | `daily-report` |
| `status` | `TEXT` | 不可 | — | 今回の実行状態。 | `running` |
| `owner` | `TEXT` | 可 | — | 実行を取得したノードの識別子。 | `node-1` |
| `snapshot` | `JSON` | 不可 | — | 起動時のタスク定義のスナップショット。例は抜粋。 | `{"id":"daily-report"}` |
| `trigger_json` | `JSON` | 不可 | — | 起動方法と出所。例は抜粋。 | `{"type":"scheduled"}` |
| `log_json` | `JSON` | 可 | — | 今回の実行の主なログ。 | `NULL` |
| `logs_json` | `JSON` | 可 | — | 試行ごとのログ履歴。 | `NULL` |
| `log_persistence` | `TEXT` | 不可 | — | 実行ログの永続化状態。 | `pending` |
| `leased_until` | `BIGINT` | 不可 | — | 現在の取得者が処理できる期限。 | `1794873630000` |
| `attempt_count` | `BIGINT` | 不可 | — | これまでの試行回数。 | `1` |
| `max_attempts` | `BIGINT` | 不可 | — | 今回の起動での試行回数上限。 | `1` |
| `updated_at` | `BIGINT` | 不可 | — | 実行状態の最終更新時刻。 | `1794873600000` |
| `created_at` | `BIGINT` | 不可 | — | 起動記録の登録時刻。 | `1794873600000` |
| `idempotent` | `BOOLEAN` | 不可 | — | 起動時点で安全に再実行できるとタスクが宣言していたかどうか。 | `true` |

<a id="table-hai-scheduler-logs"></a>

#### `hai_scheduler_logs`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | ログの主キー。 | `log-42` |
| `occurrence_id` | `TEXT` | 可 | — | ログに対応する起動 ID。 | `1aac2af840fe011ae7e489827dd6ea6de833cf24cd5c572ef913becb44294f22` |
| `task_id` | `TEXT` | 不可 | — | 実行したタスクの ID。 | `daily-report` |
| `task_name` | `TEXT` | 不可 | — | 実行時のタスク表示名。 | `Daily report` |
| `task_type` | `TEXT` | 不可 | — | タスクの種類。 | `hook` |
| `trigger_type` | `TEXT` | 不可 | — | 定期または手動の起動方法。 | `scheduled` |
| `trigger_source` | `TEXT` | 可 | — | 具体的な起動元。 | `NULL` |
| `status` | `TEXT` | 不可 | — | ログが記録する実行結果。 | `success` |
| `payload` | `JSON` | 不可 | — | 実行ログの詳細。例は抜粋。 | `{"status":"success"}` |
| `started_at` | `BIGINT` | 不可 | — | 今回の実行の開始時刻。 | `1794873600000` |
| `finished_at` | `BIGINT` | 不可 | — | 今回の実行の完了時刻。 | `1794873600125` |
| `duration` | `INTEGER` | 不可 | — | 実行時間。単位はミリ秒。 | `125` |

定期実行と手動実行は同じ一意の `active_task` で排他を取ります。リースが切れ、外部処理の完了が不明なら、照合まで占有を保ちます。ログを削除しても解除されません。Redis キーは作らず、ローカルタイマーは確認を起動するだけで、担当と期限はデータベースで判断します。

テーブル定義は [タスク](../../../packages/scheduler/src/repositories/scheduler-repository-task.ts)、[実行](../../../packages/scheduler/src/repositories/scheduler-repository-execution.ts)、[ログ](../../../packages/scheduler/src/repositories/scheduler-repository-log.ts)のテーブル定義を参照してください。
