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

// インメモリ SQLite を開く。成功時にデータはなく、DB の失敗でスケジューラーの初期化を止める。
dataOrThrow(await reldb.init({ type: 'sqlite', database: ':memory:' }))

try {
  // RelDB 上で調停用テーブルを準備し、タスク ID を返すフックを設定する。初期化失敗時は登録へ進まない。
  dataOrThrow(await scheduler.init({
    hooks: {
      onTaskExecute: ({ context }) => ({ taskId: context.taskId }),
    },
  }))
  try {
    // 日次レポート daily を毎日 02:00 に登録する。成功時にデータはなく、ID 重複や不正なスケジュールは失敗。
    dataOrThrow(await scheduler.register({ id: 'daily', name: 'Daily report', cron: '0 2 * * *' }))
    // daily を送信元 docs として手動実行する。実行ログを取得しても status で実行結果を確認する。
    const run = dataOrThrow(await scheduler.trigger('daily', { source: 'docs' }))
    if (run.status !== 'success')
      throw new Error(run.error ?? 'Task did not succeed')

    // 送信元 docs の daily のログを先頭から最大 20 件読む。この実行の記録は一件で、照会失敗は例外になる。
    const logs = dataOrThrow(await scheduler.getLogs({
      taskId: 'daily',
      triggerSource: 'docs',
      pagination: { page: 1, pageSize: 20 },
    }))
    if (logs.items.length !== 1)
      throw new Error('Expected one execution record')
  }
  finally {
    // 引数なしで調停を終了し、新規取得を止めて終了を待つ。業務データは返さない。
    await scheduler.close()
  }
}
finally {
  // 調停の終了後に DB を解放する。成功時データはなく、失敗は dataOrThrow が例外にする。
  dataOrThrow(await reldb.close())
}
```

<a id="api-一覧"></a>

<a id="api-reference"></a>

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

モジュールの import は入門例と同じです。開始・終了の例以外は初期化成功後、終了前に実行します。value は HaiResult.success を確認し元エラーを保持します。独立したテストデータと明示した後片付けを使います。

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="task-definitions"></a>

### タスク定義の準備と管理：`scheduler`

RelDB 接続後に定義を登録し、保存された定義とプロセスのスナップショットを区別します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `scheduler.init` | 接続済みの RelDB を使って必要な表を用意 | `config?`（省略时使用默认配置） | `Promise<HaiResult<void>>` | `await scheduler.init()` |
| `scheduler.close` | このインスタンスを終了し、後処理を待つ。RelDB はアプリが閉じる | 已发生的外部副作用无法撤销；无 | `Promise<void>` | `await scheduler.close()` |
| `scheduler.register` | タスク定義を登録 | task | `Promise<HaiResult<void>>` | `await scheduler.register(task)` |
| `scheduler.unregister` | タスク定義を削除 | taskId | `Promise<HaiResult<void>>` | `await scheduler.unregister('daily')` |
| `scheduler.updateTask` | タスク定義を更新 | taskId, updates | `Promise<HaiResult<void>>` | `await scheduler.updateTask('daily', { enabled: false })` |
| `scheduler.refreshTasks` | 現在のプロセスのタスクを取得 | 无参数 | `Promise<HaiResult<void>>` | `await scheduler.refreshTasks()` |

#### 利用例：タスク定義の準備と管理

```ts
// demo-daily を毎日 UTC 02:00 に登録する。成功時にデータはなく、設定不正は value が例外にする。
value(await scheduler.register({ id: 'demo-daily', name: 'Demo daily', cron: '0 2 * * *', timezone: 'UTC' }))
// 登録した demo-daily を無効化する。タスクは残り、更新失敗は value が例外にする。
value(await scheduler.updateTask('demo-daily', { enabled: false }))
// 引数なしで保存済み定義を読み直す。成功時データはなく、読み取りエラーは失敗。
value(await scheduler.refreshTasks())
// ID demo-daily の定義を削除する。成功時にデータはなく、保存エラーは value が例外にする。
value(await scheduler.unregister('demo-daily'))
// Each successful result has no business data; only the stored definition changes.
```

UTC 毎日 02:00 の定義です。登録だけでは実行を開始しません。init は HaiResult を確認し、close は Promise<void> です。

末尾の 4 項目は任意のコールバックです。`scheduler.init({ hooks })` または `scheduler.setHooks(hooks)` で登録すると Scheduler が呼びます。

未翻訳：タスク、再試行、ログ修復、手動照合の例。[中国語の該当節](scheduler.md#api-reference)を参照してください。

[引数と手順の詳細](scheduler.md#task-definitions)

<a id="execution"></a>

### 実行の開始とログ確認：`scheduler`

start は時刻に応じた実行、trigger は指定タスクの実行です。stop は以後の予定を止めますが外部の結果は戻しません。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `scheduler.start` | スケジュール実行を開始 | 无参数 | `HaiResult<void>` | `scheduler.start()` |
| `scheduler.stop` | 新規実行の受付を停止 | 无参数 | `HaiResult<void>` | `scheduler.stop()` |
| `scheduler.trigger` | タスクを手動実行 | taskId, options | `Promise<HaiResult<TaskExecutionLog>>` | `await scheduler.trigger('daily', { source: 'admin-console' })` |
| `scheduler.getLogs` | 実行ログをページ取得 | options | `Promise<HaiResult<PaginatedResult<TaskExecutionLog>>>` | `await scheduler.getLogs({ pagination: { page: 1, pageSize: 20 } })` |

#### 利用例：実行の開始とログ確認

cron と手動実行で occurrenceId を決定し、DB 上の実行資格を共有します。旧実行の期限が切れた場合を詳しく示します。

![共有スケジュール：期限後に引継ぎできる条件](../images/function-scheduler-timeout.ja.svg)

取得・延長・最終保存は DB 時刻と現在の実行 token を確認します。安全に再試行できる宣言と残り回数がある場合だけ同じ occurrenceId で引継ぎます。それ以外は unknown とし後続を止めて照合します。期限切れで外部処理は取り消されません。

初期化とタスク登録後に実行。start/stop は同期 HaiResult<void> で巡回を制御し、trigger の成功後も実行 status を確認します。

```ts
async function runAndRead(taskId: string) {
  // 引数なしで定期ポーリングを始める。成功時データはなく、未初期化時は value が例外にする。
  value(scheduler.start())
  try {
    // 指定タスクを送信元 docs-console で手動実行し、返った実行記録の status で結果を確認する。
    const run = value(await scheduler.trigger(taskId, { source: 'docs-console' }))
    // 指定タスクの docs-console のログを先頭から最大 20 件読む。items は空の場合があり、照会失敗は value が例外にする。
    const logs = value(await scheduler.getLogs({ taskId, triggerSource: 'docs-console', pagination: { page: 1, pageSize: 20 } }))
    return { status: run.status, logs: logs.items }
  }
  finally {
    // 引数なしで以降の定期取得を止める。成功時データはなく、開始済みの外部処理は取り消されない。
    value(scheduler.stop())
  }
}
```

<a id="hooks"></a>

### 業務処理とコールバック：`scheduler.setHooks`

業務処理と開始・中断・終了のコールバックを登録します。引数は今回の実行コンテキストです。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `scheduler.setHooks` | 実行関数とフックを設定 | hooks | `HaiResult<void>` | `scheduler.setHooks({ onTaskExecute })` |
| `scheduler.clearHooks` | 現在のフックを削除 | 无参数 | `HaiResult<void>` | `scheduler.clearHooks()` |

#### 利用例：業務処理とコールバック

onTask* は setHooks に渡すコールバックで、スケジューラーが呼び出します。handler のないタスクを実行すると start/finish と実行結果を確認できます。

```ts
const events: Array<{ stage: string, taskId: string }> = []
// 開始・中断・終了を記録する下記コールバックを設定する。成功するとフックが更新され、利用不能時は value が例外にする。
value(scheduler.setHooks({
  onTaskStart: event => { events.push({ stage: 'start', taskId: event.task.id }) },
  onTaskExecute: event => ({ taskId: event.context.taskId }),
  onTaskInterrupted: event => { events.push({ stage: 'interrupted', taskId: event.task.id }) },
  onTaskFinish: event => { events.push({ stage: 'finish', taskId: event.task.id }) },
}))
// フックを確認する demo-hook を毎日 02:00 に登録する。成功時にデータはなく、ID 重複は失敗。
value(await scheduler.register({ id: 'demo-hook', name: 'Hook demo', cron: '0 2 * * *' }))
// demo-hook を手動実行してフックのイベントを発生させる。実行ログの status で結果を確認する。
const run = value(await scheduler.trigger('demo-hook'))
// run.status === 'success'; events contains start and finish for demo-hook.
// 例の demo-hook 定義を削除する。成功時にデータはなく、失敗は value が例外にする。
value(await scheduler.unregister('demo-hook'))
// 引数なしで登録済みフックを解除する。成功時にデータはない。
value(scheduler.clearHooks()) // undefined; future tasks no longer use these callbacks
```

<a id="recovery"></a>

### 不明な結果の確認とログ修復：`scheduler.execution`

実行結果が不明なら外部の結果を調べます。ログだけの不具合で業務を再実行しません。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `scheduler.execution.get` | 実行 ID で取得 | occurrenceId | `Promise<HaiResult<SchedulerExecutionEntry \| null>>` | `await scheduler.execution.get(occurrenceId)` |
| `scheduler.execution.listUnknown` | 結果不明の実行をページ取得 | options | `Promise<HaiResult<SchedulerExecutionEntry[]>>` | `await scheduler.execution.listUnknown({ limit: 20 })` |
| `scheduler.execution.listLogFailures` | ログ記録失敗を取得 | options | `Promise<HaiResult<SchedulerExecutionEntry[]>>` | `await scheduler.execution.listLogFailures({ limit: 20 })` |
| `scheduler.execution.repairLog` | 確認済みの実行ログを修復 | occurrenceId | `Promise<HaiResult<void>>` | `await scheduler.execution.repairLog(occurrenceId)` |
| `scheduler.execution.resolveUnknown` | 実行結果を確認 | occurrenceId, resolution | `Promise<HaiResult<void>>` | `await scheduler.execution.resolveUnknown(occurrenceId, { status: 'success', expectedUpdatedAt })` |

#### 利用例：不明な結果の確認とログ修復

ログ補完は業務処理を再実行しません。別の判断関数は外部確認済みの結論と最新 updatedAt で更新します。

```ts
async function repairPendingLogs() {
  // ログ保存に失敗した実行を先頭から最大 20 件取得する。対象がなければ空配列。
  const pending = value(await scheduler.execution.listLogFailures({ limit: 20, offset: 0 }))
  for (const entry of pending)
    // この実行 ID の観測ログを修復する。成功時データはなく、タスクを再実行しない。
    value(await scheduler.execution.repairLog(entry.occurrenceId))
  return pending.length // at most 20; the next scan starts at offset 0 again
}
async function recordVerifiedOutcome(occurrenceId: string, status: 'success' | 'discarded') {
  // 結果の確認を待つ unknown の実行を先頭から最大 20 件読む。対象がなければ空配列。
  const unknown = value(await scheduler.execution.listUnknown({ limit: 20, offset: 0 }))
  // 確認対象の実行 ID から現在の状態と更新時刻を読む。存在しなければ null。
  const current = value(await scheduler.execution.get(occurrenceId))
  if (current?.status !== 'unknown')
    throw new Error('Expected an unknown execution')
  // 照会した更新時刻を条件に success または discarded の確認結果を保存する。成功時データはなく、状態が変わっていれば失敗。
  value(await scheduler.execution.resolveUnknown(occurrenceId, { status, expectedUpdatedAt: current.updatedAt }))
  // 同じ実行 ID を再読込して確定後の状態を見る。再読込失敗は value が例外にする。
  return { scanned: unknown.length, entry: value(await scheduler.execution.get(occurrenceId)) }
}
```
