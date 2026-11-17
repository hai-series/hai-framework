# @h-ai/scheduler API リファレンス

<!-- translation: partial -->

[原文（中国語）](scheduler.md) · [設定](../configuration/scheduler.ja.md) · [データ構造](../data/scheduler.ja.md)

<a id="quick-start"></a>

スケジューラーの開始前にタスクを登録します。安定した ID を使い、再試行するハンドラーは冪等にします。外部処理の結果が不明なら、やり直す前に結果を確認します。

<a id="api-reference"></a>

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `scheduler.register`, `unregister`, `updateTask`, `refreshTasks` | タスクの登録・解除、定義の更新、保存済み予定の再読み込み。 | `await scheduler.register(task)` |
| `scheduler.start`, `stop`, `trigger` | 処理を開始・停止、または登録済みタスクを起動。 | `await scheduler.trigger('daily')` |
| `scheduler.getLogs`, `setHooks`, `clearHooks` | 実行履歴を取得し、ライフサイクルのフックを設定・解除。 | `scheduler.clearHooks()` |
| `scheduler.execution.get`, `listUnknown`, `listLogFailures`, `repairLog`, `resolveUnknown` | 保存済みの実行を確認し、結果を記録、またはログを修復。 | `await scheduler.execution.get(occurrenceId)` |

追加の設定項目や利用例は[中国語リファレンス](scheduler.md)に掲載しています。
