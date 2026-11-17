# @h-ai/scheduler データ構造

<!-- translation: partial -->

[原文（中国語）](scheduler.md) · [設定](../configuration/scheduler.ja.md) · [API リファレンス](../function/scheduler.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

まず用途と例を読み、必要に応じて後半の項目・保存規則を確認してください。ID と業務内容は架空で、秘密は隠しています。時刻は 2026-11-17 00:00 UTC を起点とし、単位は各説明に記します。

DB・ファイルの例は関連項目の抜粋で、そのまま完全な書き込みデータには使えません。省略項目が任意とは限らず、例ごとに異なる段階を示す場合があります。

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
  "occurrence_id": "occurrence-42",
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
  "occurrence_id": "occurrence-42",
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

永続化が有効な場合、Scheduler は RelDB にタスクと実行状態を保存します。記載のない値は書き込み側が設定し、省略した任意項目は NULL になります。

| フィールドまたはテーブル | 構造と意味 |
| --- | --- |
| `hai_scheduler_tasks` | 自動採番 `id`、一意の業務 `task_id`、表示名 `task_name`、任意の `description`、`cron`、任意の IANA `timezone`（省略時 UTC）。真偽値の既定は `enabled=true`、`idempotent=false`、`delete_after_run=false`。NULL 可の JSON は `retry`、`params`、`handler`。日時は `created_at` と `updated_at`。 |
| `hai_scheduler_executions` | 自動採番 `sequence`、一意の `occurrence_id`、`task_id`、NULL 可で一意の `active_task`、`status`、リースの `owner`。`snapshot`、`trigger_json`、`log_json`、`logs_json` にタスク・起動情報・現在と過去試行のログを保存します。`log_persistence` は保存状態、`leased_until` は期限、`attempt_count` と `max_attempts` は試行回数と上限、`created_at` と `updated_at` は日時です。 |
| `hai_scheduler_logs` | 文字列の主キー `id`、NULL 可の `occurrence_id`、`task_id`、`task_name`、`task_type`、`trigger_type`、NULL 可の `trigger_source`、`status`、JSON `payload`、整数の `started_at`、`finished_at`、`duration`。 |

定期実行と手動実行は同じ一意の `active_task` で排他を取ります。リースが切れ、外部処理の完了が不明なら、照合まで占有を保ちます。ログを削除しても解除されません。Redis キーは作らず、ローカルタイマーは確認を起動するだけで、担当と期限はデータベースで判断します。

未翻訳のデータベース型と制約は、[中国語の原文](scheduler.md)および[タスク](../../../packages/scheduler/src/repositories/scheduler-repository-task.ts)、[実行](../../../packages/scheduler/src/repositories/scheduler-repository-execution.ts)、[ログ](../../../packages/scheduler/src/repositories/scheduler-repository-log.ts)のテーブル定義を参照してください。
