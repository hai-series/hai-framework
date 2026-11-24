# @h-ai/scheduler API リファレンス

[简体中文](scheduler.md) · [English](scheduler.en.md)

[設定](../configuration/scheduler.ja.md) · [データ構造](../data/scheduler.ja.md)

Scheduler は Node.js サービスでタスクを定期実行または手動実行します。タスクは HTTP API、信頼できる JavaScript、またはアプリの `onTaskExecute` を使って処理できます。複数のノードは RelDB のデータベースを共有します。

<a id="quick-start"></a>

## クイックスタート

`pnpm add @h-ai/core @h-ai/reldb @h-ai/scheduler` でインストールします。この例ではメモリ内 SQLite を使い、`init({ tasks, hooks })` で日次売上のタスクと 4 つのフックを用意します。手動実行すると純売上は 1000 セントです。本番環境では共有の PostgreSQL または MySQL に接続します。[設定の読み込み](../configuration/scheduler.ja.md)

```ts
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { scheduler } from '@h-ai/scheduler'

const database = await reldb.init({ type: 'sqlite', database: ':memory:' })
if (!database.success) throw new Error(database.error.message)

try {
  const initialized = await scheduler.init({
    tasks: [{
      id: 'daily-net-sales',
      name: 'Daily net sales',
      cron: '0 2 * * *',
      timezone: 'Asia/Shanghai',
      params: { grossCents: 1200, refundCents: 200 },
    }],
    hooks: {
      onTaskStart: ({ task }) => { core.logger.info('Task started', { taskId: task.id }) },
      onTaskExecute: ({ context, signal }) => {
        signal.throwIfAborted()
        const { grossCents, refundCents } = context.params
        if (context.taskId !== 'daily-net-sales' || typeof grossCents !== 'number' || typeof refundCents !== 'number')
          throw new Error('Unsupported task or invalid sales amounts')
        return { netCents: grossCents - refundCents }
      },
      onTaskInterrupted: ({ task, signal }) => {
        core.logger.warn('Task interrupted', { taskId: task.id, cancelled: signal.aborted })
      },
      onTaskFinish: ({ task, log }) => {
        core.logger.info('Task handler finished', { taskId: task.id, status: log.status })
      },
    },
  })
  if (!initialized.success) throw new Error(initialized.error.message)

  const run = await scheduler.trigger('daily-net-sales', { source: 'ops', idempotencyKey: 'net-sales-2026-11-24' })
  if (!run.success) throw new Error(run.error.message)
  if (run.data.status === 'success')
    core.logger.info('Daily summary is ready', { result: run.data.result, logStatus: run.data.persistence.status })
}
finally {
  await scheduler.close()
  const closed = await reldb.close()
  if (!closed.success) throw new Error(closed.error.message)
}
```

定期スキャンの開始前でも手動実行できます。常駐サービスは初期化後に `start()` を呼びます。終了時は `scheduler.close()` を待ってから RelDB を閉じます。

<a id="api-一覧"></a>
<a id="api-reference"></a>
<a id="task-definitions"></a>

## 機能

<a id="hooks"></a>

### サービスを開始してフックを設定する

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `scheduler.init(config?)` | テーブル、タスク、フックを準備 | `SchedulerInitInput` に[設定](../configuration/scheduler.ja.md)、任意の `tasks: TaskDefinition[]` と `hooks: SchedulerTaskHooks` を指定 | `Promise<HaiResult<void>>` | `await scheduler.init({ tasks, hooks })` |
| `scheduler.setHooks(hooks)` | プロセスのフックを差し替え | `SchedulerTaskHooks`。各コールバックは省略可 | `HaiResult<void>` | `scheduler.setHooks({ onTaskExecute })` |
| `scheduler.clearHooks()` | プロセスのフックを消去 | なし | `HaiResult<void>` | `scheduler.clearHooks()` |
| `scheduler.start()` | 定期スキャンを開始 | なし | `HaiResult<void>` | `scheduler.start()` |
| `scheduler.stop()` | 以降の定期スキャンを停止 | なし | `HaiResult<void>` | `scheduler.stop()` |
| `scheduler.close()` | 実行の取り消しとログ補完を待って状態を解放 | なし | `Promise<void>` | `await scheduler.close()` |
| `scheduler.config`、`scheduler.hooks`、`scheduler.isInitialized`、`scheduler.isRunning` | プロセスの状態を確認 | 読み取り専用 | `SchedulerConfig \| null`、`Readonly<SchedulerTaskHooks>`、`boolean`、`boolean` | `scheduler.isRunning` |

起動時の `tasks` は現在のプロセスだけに読み込まれ、実行記録は共有データベースに保存されます。`hooks` はノードごとに設定し、省略時は `{}` です。[起動の実例](#quick-start)

| `hooks` の項目 | 呼び出しのタイミングと引数 |
| --- | --- |
| `onTaskStart` | 試行開始前。タスク、起動情報、開始時刻、取得済みの実行コンテキストを受け取る |
| `onTaskExecute` | `handler` のないタスクを処理。`context.taskId` で処理を選び、`context.params` で入力を取得し、業務失敗時は例外を送出 |
| `onTaskInterrupted` | 取り消しまたはスキップ時に理由とシグナルを受け取る。サービスの終了時にも通知され、非同期の観測処理は独立して完了できる |
| `onTaskFinish` | 試行の結果が出た後、読み取り専用の `log` を受け取る。確定結果は台帳または受領情報で確認する |

すべてのコールバックに `signal` が渡されます。取り消しに対応する外部処理へこのシグナルを渡してください。開始済みの外部処理はそのまま完了する場合があります。

<a id="scheduler-task-fields"></a>

### 定期タスクの登録と更新

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `scheduler.register(task)` | 共有タスク定義を登録 | 五つのフィールドの `cron` と任意の `handler` を含む `TaskDefinition` | `Promise<HaiResult<void>>`。ID 重複時は `TASK_ALREADY_EXISTS` | `await scheduler.register(task)` |
| `scheduler.updateTask(taskId, updates)` | 登録済みタスクを更新 | タスク ID と `TaskUpdateInput`。省略項目は現在値を保持 | `Promise<HaiResult<void>>` | `await scheduler.updateTask('carrier-health', { enabled: false })` |
| `scheduler.unregister(taskId)` | タスク定義を削除 | タスク ID | `Promise<HaiResult<void>>` | `await scheduler.unregister('carrier-health')` |
| `scheduler.refreshTasks()` | DB からこのノードへ定義を再読み込み | なし | `Promise<HaiResult<void>>` | `await scheduler.refreshTasks()` |
| `scheduler.tasks` | 読み込んだ定義を参照 | 読み取り専用マップ | `ReadonlyMap<string, TaskDefinition>` | `scheduler.tasks.get('carrier-health')` |

| タスク項目 | 既定値と動作 |
| --- | --- |
| `id`、`name`、`cron` | 必須。Cron の順序は分、時、日、月、曜日 |
| `timezone`、`description` | UTC、説明なし。IANA タイムゾーンを指定。更新時に `timezone: null` で UTC に戻る |
| `handler`、`params` | HTTP または JS を指定。省略、または更新で `handler: null` にすると `onTaskExecute` を使用。JS とフックは `context.params` で入力を受け取る |
| `enabled`、`deleteAfterRun` | 既定値は `true`、`false`。無効なタスクは実行をスキップし、単発タスクの定義は成功時に失効 |
| `idempotent`、`retry` | 既定値は `false`、再試行なし。実行 ID による永続的な重複排除が必要。初回を含む `maxAttempts` は 1〜100、二回目以降の `backoffMs` は 0〜2147483647 ミリ秒。指定した値を使い切ると末尾を再利用 |

##### `handler` の項目

| 種類 | 必須 | 任意の項目と既定値 |
| --- | --- | --- |
| `kind: 'api'` | `url` | `method` は既定で GET。GET、POST、PUT、DELETE、PATCH に対応。`headers`、JSON の `body` を指定可。応答本文まで含む `timeout` は既定で 30000 ミリ秒、`maxResponseBytes` は 1048576 バイト |
| `kind: 'js'` | `code`。例は `(context) => …` | Worker の起動を含む `timeout` は既定で 30000 ミリ秒。コンテキストと戻り値は構造化クローンに対応する必要がある |

`timeout` は 1〜2147483647 ミリ秒です。JS とフックの結果は `result` に JSON で記録し、表現できない値は `null` にします。Worker には信頼できるサーバーコードを渡してください。`vm` はユーザーが入力したコードを安全に隔離する環境ではありません。

#### 利用例：配送事業者の API を 5 分ごとに確認する

初期化済みのプロセスで最初にタスクを登録し、デプロイ設定のヘルスチェック URL を `CARRIER_HEALTH_URL` に設定します。登録後にスキャンを開始すると 5 分ごとに GET が送信され、成功時の応答本文が `result` に入ります。

```ts
import { scheduler } from '@h-ai/scheduler'

const healthUrl = process.env.CARRIER_HEALTH_URL
if (!healthUrl) throw new Error('CARRIER_HEALTH_URL is required')
const registered = await scheduler.register({
  id: 'carrier-health', name: 'Carrier health', cron: '*/5 * * * *',
  handler: { kind: 'api', url: healthUrl, timeout: 5000, maxResponseBytes: 4096 },
})
if (!registered.success) throw new Error(registered.error.message)
const started = scheduler.start()
if (!started.success) throw new Error(started.error.message)
```

副作用のある API を再試行するには、受信側で業務処理と重複排除を原子的に確定する必要があります。実行 ID は `Idempotency-Key`、実行順序、試行回数、タスク ID はそれぞれ `X-Scheduler-Sequence`、`X-Scheduler-Attempt`、`X-Scheduler-Task` に入ります。

#### 利用例：JS でバッチ数を計算する

初期化済みのプロセスで信頼できる集計スクリプトを登録します。手動実行に成功すると `result` は `'{"batches":3}'` です。

```ts
import { scheduler } from '@h-ai/scheduler'

const registered = await scheduler.register({
  id: 'batch-count', name: 'Batch count', cron: '0 3 * * *',
  params: { items: 125, batchSize: 50 },
  handler: { kind: 'js', code: '({ params }) => ({ batches: Math.ceil(params.items / params.batchSize) })', timeout: 1000 },
})
if (!registered.success) throw new Error(registered.error.message)
const run = await scheduler.trigger('batch-count', { source: 'ops', idempotencyKey: 'batch-count-2026-11-24' })
if (!run.success) throw new Error(run.error.message)
const result = run.data.result
```

<a id="execution"></a>

### 手動実行と履歴の確認

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `scheduler.trigger(taskId, options?)` | 手動実行または既存の受領情報の取得 | タスク ID と任意の `source`、1〜128 文字の `idempotencyKey` | `Promise<HaiResult<TaskExecutionLog>>` | `await scheduler.trigger('carrier-health', { idempotencyKey: 'verify-42' })` |
| `scheduler.getLogs(options?)` | 履歴をページ単位で取得 | タスク、状態、起動種別、起動元、Unix ミリ秒の範囲で絞り込み。既定は 1 ページ目、20 件 | `Promise<HaiResult<PaginatedResult<TaskExecutionLog>>>` | `await scheduler.getLogs({ taskId: 'carrier-health' })` |

<a id="scheduler-trigger-query-fields"></a>

#### 利用例：手動のヘルスチェック結果を確認する

同じ操作の再送には同じキーを使います。タスクが削除された後でも、確定済みの受領情報を取得できます。`status` で結果、`persistence.status` でログの保存状態を確認します。

```ts
import { scheduler } from '@h-ai/scheduler'

const run = await scheduler.trigger('carrier-health', { source: 'ops', idempotencyKey: 'verify-42' })
if (!run.success) throw new Error(run.error.message)
const history = await scheduler.getLogs({ taskId: 'carrier-health', triggerType: 'manual', triggerSource: 'ops' })
if (!history.success) throw new Error(history.error.message)
const { status, persistence } = run.data
const attempts = history.data.items
```

<a id="recovery"></a>

### 不明な結果の確認とログ補完

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `scheduler.execution.get(occurrenceId)` | 台帳の実行と現在の状態バージョンを参照 | 受領情報の `occurrenceId` | `Promise<HaiResult<SchedulerExecutionEntry \| null>>` | `await scheduler.execution.get(occurrenceId)` |
| `scheduler.execution.listUnknown(options?)` | 結果確認が必要な実行を検索 | `limit` は既定 50、範囲 1〜100。`offset` は既定 0 | `Promise<HaiResult<SchedulerExecutionEntry[]>>` | `await scheduler.execution.listUnknown({ limit: 20 })` |
| `scheduler.execution.listLogFailures(options?)` | 補完待ちのログを検索 | ページ指定は上と同じ | `Promise<HaiResult<SchedulerExecutionEntry[]>>` | `await scheduler.execution.listLogFailures({ limit: 20 })` |
| `scheduler.execution.repairLog(occurrenceId)` | 台帳からログを補完 | 元の実行 ID | `Promise<HaiResult<void>>`。失敗時は `LOG_PERSIST_FAILED` | `await scheduler.execution.repairLog(occurrenceId)` |
| `scheduler.execution.resolveUnknown(occurrenceId, resolution)` | 確認した結果を記録 | `status: 'success' \| 'discarded'` と、取得したばかりの `expectedUpdatedAt` | `Promise<HaiResult<void>>` | `await scheduler.execution.resolveUnknown(occurrenceId, resolution)` |

<a id="scheduler-execution-options"></a>

![実行リース失効後の引き継ぎ](../images/function-scheduler-timeout.ja.svg)

#### 利用例：再起動後に実行結果を照合する

`unknown` の実行は以前の実行者を停止し、外部での結果を確認します。日次レポートが配信済みなら `recordVerifiedDelivery` で成功を記録します。結果が確定済みでログが `pending` の場合はログを補完します。次の補完バッチも `offset: 0` から取得します。

```ts
import { scheduler } from '@h-ai/scheduler'

export async function recordVerifiedDelivery(occurrenceId: string) {
  const entry = await scheduler.execution.get(occurrenceId)
  if (!entry.success || entry.data?.status !== 'unknown') return entry
  return scheduler.execution.resolveUnknown(occurrenceId, {
    status: 'success', expectedUpdatedAt: entry.data.updatedAt,
  })
}

export async function repairLogBatch() {
  const pending = await scheduler.execution.listLogFailures({ limit: 20, offset: 0 })
  if (!pending.success) return pending
  for (const entry of pending.data) {
    const repaired = await scheduler.execution.repairLog(entry.occurrenceId)
    if (!repaired.success) return repaired
  }
  return pending
}
```

実行者がリースを更新できなくなった場合、開始済みの処理は冪等性が宣言され、試行回数が残っていれば引き継げます。元の受領情報、試行履歴、再試行時刻が使われます。[実行リース](../configuration/scheduler.ja.md#execution-lease) · [台帳とログのテーブル](../data/scheduler.ja.md)
