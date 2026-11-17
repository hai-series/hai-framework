# @h-ai/scheduler データ構造

<!-- translation: partial -->

[原文（中国語）](scheduler.md) · [設定](../configuration/scheduler.ja.md) · [API リファレンス](../function/scheduler.ja.md)

<a id="tables"></a>

## データベースのテーブル

永続化が有効な場合、Scheduler は RelDB にタスクと実行状態を保存します。記載のない値は書き込み側が設定し、省略した任意項目は NULL になります。

| フィールドまたはテーブル | 構造と意味 |
| --- | --- |
| `hai_scheduler_tasks` | 自動採番 `id`、一意の業務 `task_id`、表示名 `task_name`、任意の `description`、`cron`、任意の IANA `timezone`（省略時 UTC）。真偽値の既定は `enabled=true`、`idempotent=false`、`delete_after_run=false`。NULL 可の JSON は `retry`、`params`、`handler`。日時は `created_at` と `updated_at`。 |
| `hai_scheduler_executions` | 自動採番 `sequence`、一意の `occurrence_id`、`task_id`、NULL 可で一意の `active_task`、`status`、リースの `owner`。`snapshot`、`trigger_json`、`log_json`、`logs_json` にタスク・起動情報・現在と過去試行のログを保存します。`log_persistence` は保存状態、`leased_until` は期限、`attempt_count` と `max_attempts` は試行回数と上限、`created_at` と `updated_at` は日時です。 |
| `hai_scheduler_logs` | 文字列の主キー `id`、NULL 可の `occurrence_id`、`task_id`、`task_name`、`task_type`、`trigger_type`、NULL 可の `trigger_source`、`status`、JSON `payload`、整数の `started_at`、`finished_at`、`duration`。 |

定期実行と手動実行は同じ一意の `active_task` で排他を取ります。リースが切れ、外部処理の完了が不明なら、照合まで占有を保ちます。ログを削除しても解除されません。Redis キーは作らず、ローカルタイマーは確認を起動するだけで、担当と期限はデータベースで判断します。

未翻訳のデータベース型と制約は、[中国語の原文](scheduler.md)および[タスク](../../../packages/scheduler/src/repositories/scheduler-repository-task.ts)、[実行](../../../packages/scheduler/src/repositories/scheduler-repository-execution.ts)、[ログ](../../../packages/scheduler/src/repositories/scheduler-repository-log.ts)のテーブル定義を参照してください。
