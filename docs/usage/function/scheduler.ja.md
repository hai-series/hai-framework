# @h-ai/scheduler API リファレンス

<!-- translation: partial -->

[原文（中国語）](scheduler.md) · [設定](../configuration/scheduler.ja.md) · [データ構造](../data/scheduler.ja.md)

<a id="quick-start"></a>

## クイックスタート

スケジューラーの開始前にタスクを登録します。安定した ID を使い、再試行するハンドラーは冪等にします。外部処理の結果が不明なら、やり直す前に結果を確認します。

この例はメモリ上の SQLite を使い、タスクを手動で 1 回実行します。cron を待つことも、ネットワークへのリクエストもありません。`trigger()` が成功しても失敗した実行の記録を返すことがあるため、`run.status` も確認します。この例では `success` になり、`logs.items` に 1 件の実行記録が入ります。定期実行する場合は、タスクを登録してから `scheduler.start()` を呼びます。開発環境（例: `NODE_ENV=development`）で実行してください。本番モードではノード間で共有するデータベースが必要です。

```ts
import type { HaiResult } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { scheduler } from '@h-ai/scheduler'

function dataOrThrow<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

dataOrThrow(await reldb.init({ type: 'sqlite', database: ':memory:' }))

try {
  dataOrThrow(await scheduler.init({
    hooks: {
      onTaskExecute: ({ context }) => ({ taskId: context.taskId }),
    },
  }))
  try {
    dataOrThrow(await scheduler.register({ id: 'daily', name: 'Daily report', cron: '0 2 * * *' }))
    const run = dataOrThrow(await scheduler.trigger('daily', { source: 'docs' }))
    if (run.status !== 'success')
      throw new Error(run.error ?? 'Task did not succeed')

    const logs = dataOrThrow(await scheduler.getLogs({
      taskId: 'daily',
      triggerSource: 'docs',
      pagination: { page: 1, pageSize: 20 },
    }))
    if (logs.items.length !== 1)
      throw new Error('Expected one execution record')
  }
  finally {
    await scheduler.close()
  }
}
finally {
  dataOrThrow(await reldb.close())
}
```

<a id="api-reference"></a>

## API 一覧

| API | 用途 | 入力 | 出力 | 例 |
| --- | --- | --- | --- | --- |
| `scheduler.init` | 接続済みの RelDB を使って必要な表を用意 | `config? = {}` | `Promise<HaiResult<void>>` | `await scheduler.init()` |
| `scheduler.close` | このインスタンスを終了し、後処理を待つ。RelDB はアプリが閉じる | なし | `Promise<void>` | `await scheduler.close()` |
| `scheduler.register` | 固定 ID でタスクを登録。cron 式と処理を指定する。処理はフックでもよい | `task: TaskDefinition` | `Promise<HaiResult<void>>` | `await scheduler.register(task)` |
| `scheduler.unregister` | 登録済みのタスクを解除。保存済みの実行記録は別に管理する | `taskId` | `Promise<HaiResult<void>>` | `await scheduler.unregister('daily')` |
| `scheduler.updateTask` | 定義の一部を更新 | `taskId, updates` | `Promise<HaiResult<void>>` | `await scheduler.updateTask('daily', { enabled: false })` |
| `scheduler.refreshTasks` | データベースからタスク定義を再読み込み | なし | `Promise<HaiResult<void>>` | `await scheduler.refreshTasks()` |
| `scheduler.start` | 実行予定時刻になったタスクを定期的に確認する | なし | `HaiResult<void>` | `scheduler.start()` |
| `scheduler.stop` | スケジュールを停止。実行済みの処理の副作用は取り消さない | なし | `HaiResult<void>` | `scheduler.stop()` |
| `scheduler.trigger` | 登録したタスクをすぐに実行。success と data.status の両方を確認 | `taskId, { source?, idempotencyKey? }?` | `Promise<HaiResult<TaskExecutionLog>>` | `await scheduler.trigger('daily', { source: 'admin-console' })` |
| `scheduler.getLogs` | 実行ログをページ単位で取得。タスク ID や起動元などで絞り込める | `options?; pagination.page = 1, pageSize = 20` | `Promise<HaiResult<PaginatedResult<TaskExecutionLog>>>` | `await scheduler.getLogs({ pagination: { page: 1, pageSize: 20 } })` |
| `scheduler.setHooks` | このプロセスで使うアプリのコールバックを設定 | `hooks: SchedulerTaskHooks` | `HaiResult<void>` | `scheduler.setHooks({ onTaskExecute })` |
| `scheduler.clearHooks` | このプロセスのコールバックを解除 | なし | `HaiResult<void>` | `scheduler.clearHooks()` |
| `scheduler.execution.get` | 実行記録を読む。ID がなければ null | `occurrenceId` | `Promise<HaiResult<SchedulerExecutionEntry \| null>>` | `await scheduler.execution.get(occurrenceId)` |
| `scheduler.execution.listUnknown` | 再実行前に結果の照合が必要な記録を一覧する | `{ limit?, offset? }`（既定は 50、0） | `Promise<HaiResult<SchedulerExecutionEntry[]>>` | `await scheduler.execution.listUnknown({ limit: 20 })` |
| `scheduler.execution.listLogFailures` | ログの再保存が必要な記録を一覧する | `{ limit?, offset? }`（既定は 50、0） | `Promise<HaiResult<SchedulerExecutionEntry[]>>` | `await scheduler.execution.listLogFailures({ limit: 20 })` |
| `scheduler.execution.repairLog` | 保存済みの実行記録からログを補う。タスクは再実行しない | `occurrenceId` | `Promise<HaiResult<void>>` | `await scheduler.execution.repairLog(occurrenceId)` |
| `scheduler.execution.resolveUnknown` | 実際の結果を照合し、読み取った版を指定して success または discarded を記録 | `occurrenceId, { status, expectedUpdatedAt }` | `Promise<HaiResult<void>>` | `await scheduler.execution.resolveUnknown(occurrenceId, { status: 'success', expectedUpdatedAt })` |
| `scheduler.hooks.onTaskStart` | 試行の開始時に Scheduler が呼ぶ | `SchedulerTaskStartEvent` | `void \| Promise<void>` | `scheduler.setHooks({ onTaskStart })` |
| `scheduler.hooks.onTaskExecute` | 既定の処理がないタスクに対して呼ぶ。結果を返し、キャンセル信号に従う | `SchedulerTaskExecuteEvent` | `unknown \| Promise<unknown>` | `scheduler.setHooks({ onTaskExecute })` |
| `scheduler.hooks.onTaskInterrupted` | 実行の中断時に呼ぶ | `SchedulerTaskInterruptedEvent` | `void \| Promise<void>` | `scheduler.setHooks({ onTaskInterrupted })` |
| `scheduler.hooks.onTaskFinish` | 実行の終了時に呼ぶ | `SchedulerTaskFinishEvent` | `void \| Promise<void>` | `scheduler.setHooks({ onTaskFinish })` |

末尾の 4 項目は任意のコールバックです。`scheduler.init({ hooks })` または `scheduler.setHooks(hooks)` で登録すると Scheduler が呼びます。

未翻訳：タスク、再試行、ログ修復、手動照合の例。[中国語の該当節](scheduler.md#api-reference)を参照してください。
