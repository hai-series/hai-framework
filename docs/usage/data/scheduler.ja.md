# @h-ai/scheduler データ構造

<!-- translation: partial -->

[原文（中国語）](scheduler.md) · [設定](../configuration/scheduler.ja.md) · [API リファレンス](../function/scheduler.ja.md)

永続化が有効な場合、予定、所有権、ログは RelDB に保存されます。トリガーを一意の実行 ID で記録し、同じトリガーの重複取得を防ぎます。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `hai_scheduler_tasks` | 一意な `task_id`、名称、説明、cron、タイムゾーン、enabled（true）、idempotent と delete_after_run（false）。ハンドラー、再試行、引数は JSON。 |
| `hai_scheduler_executions` | 一意な `occurrence_id`、タスク、占有状態、結果、所有者、リース、試行上限、スナップショット、トリガーとログ。 |
| `hai_scheduler_logs` | ログ ID、NULL 可の実行 ID、タスク、トリガー元・種類、状態と JSON、開始・終了時刻と所要時間。 |

追加の設定項目や利用例は[中国語リファレンス](scheduler.md)に掲載しています。
