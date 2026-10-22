# @h-ai/scheduler

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/cache](../cache/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

## 概要

共通のタスクモデル、cron スケジュール、JS 関数文字列・HTTP API の実行、永続化、実行ログ検索、全体のライフサイクル Hook を提供するスケジューラーモジュールです。

## 主な機能

- cron による定期実行とアプリケーションからの手動実行。
- HTTP、信頼できる JavaScript、アプリ Hook に対応し、再試行とキャンセルを提供。
- タスク・ログの永続化と、共有キャッシュによるノード間の実行ロック。

## 使い始める

### 依存関係

- `@h-ai/reldb`：タスク定義と実行ログの永続化。`enableDb: true` の場合は先に初期化。
- `@h-ai/cache`：任意の分散ロック。初期化済みの場合、定時実行時のロック取得に自動参加。

### クイックスタート

```ts
import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { scheduler } from '@h-ai/scheduler'

await reldb.init({ type: 'sqlite', database: './scheduler.db' })
await cache.init({ type: 'memory' }) // 可选

await scheduler.init({
  enableDb: true,
  maxLogs: 1000,
  retentionDays: 30,
  hooks: {
    onTaskStart(event) {
      void event
    },
  },
})

await scheduler.register({
  id: 'health-check',
  name: '健康检查',
  description: '每 5 分钟执行一次系统健康检查',
  cron: '*/5 * * * *',
  params: { channel: 'ops' },
  retry: { maxAttempts: 3, backoffMs: [1000, 5000] },
  handler: {
    kind: 'api',
    url: 'https://api.example.com/health',
    method: 'GET',
    timeout: 10000,
  },
})

await scheduler.register({
  id: 'cleanup',
  name: '清理过期数据',
  description: '每日凌晨执行过期数据清理',
  cron: '0 2 * * *',
  deleteAfterRun: true,
  params: { source: 'nightly' },
  handler: {
    kind: 'js',
    code: '(context) => ({ taskId: context.taskId, params: context.params })',
  },
})

scheduler.start()

const manualResult = await scheduler.trigger('cleanup', { source: 'admin-console' })
const logs = await scheduler.getLogs({
  triggerType: 'manual',
  triggerSource: 'admin-console',
  startedAfter: Date.now() - 24 * 60 * 60 * 1000,
})

scheduler.stop()
await scheduler.close()
```

### 共通タスクモデル

```ts
interface TaskDefinition {
  id: string
  name: string
  description?: string
  cron: string
  timezone?: string // IANA 时区，例如 Asia/Shanghai；按该时区解释 cron 墙上时间
  enabled?: boolean
  deleteAfterRun?: boolean
  retry?: {
    maxAttempts: number
    backoffMs?: number[]
  }
  params?: Record<string, unknown>
  handler?: ApiTaskConfig | JsTaskConfig
}

interface ApiTaskConfig {
  kind: 'api'
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  body?: unknown
  timeout?: number
}

interface JsTaskConfig {
  kind: 'js'
  code: string // JS 函数字符串
  timeout?: number
}
```

補足：

- `kind: 'js'` を含むすべてのタスクを DB に永続化できます。
- JS タスクは実行時にコンパイルし、ソース単位でキャッシュして毎回の再コンパイルを避けます。
- `handler` は省略可能で、その場合は共通の `hooks.onTaskExecute` で実行します。

> ⚠️ **セキュリティ注意**：`kind: 'js'` は信頼できるサーバー側コード専用です。Node.js の `vm` による実行は**安全なサンドボックスではありません**。ユーザー、テナント、管理画面から任意の JS 文字列を直接受け付けないでください。設定可能なタスクには `kind: 'api'` または `hooks.onTaskExecute` を優先してください。

### タスクのライフサイクル Hook

初期化時に渡すか、実行時に `setHooks()` で設定します：

```ts
await scheduler.init({
  enableDb: false,
  hooks: {
    onTaskStart(event) {
      void event
    },
    async onTaskExecute(event) {
      return { via: 'hook', source: event.context.trigger.source }
    },
    onTaskInterrupted(event) {
      void event
    },
    onTaskFinish(event) {
      void event
    },
  },
})
```

### 実行ログ

実行元でログを絞り込めます：

```ts
const logs = await scheduler.getLogs({
  taskId: 'cleanup',
  triggerType: 'manual',
  triggerSource: 'admin-console',
  startedAfter: Date.now() - 24 * 60 * 60 * 1000,
  startedBefore: Date.now(),
  pagination: { page: 1, pageSize: 20 },
})
```

実行ログは初期化時に自動削除方針を設定できます：

- `maxLogs`：最大 N 件を保持。
- `retentionDays`：直近 N 日分のみを保持。

### API 一覧

- `init(config?)`
- `register(task)`
- `unregister(taskId)`
- `updateTask(taskId, updates)`
- `refreshTasks()`
- `start()` / `stop()`
- `trigger(taskId, { source? })`
- `getLogs(options?)`
- `setHooks(hooks)` / `clearHooks()`
- `tasks` / `hooks` / `config` / `isInitialized` / `isRunning`
- `close()`

### エラー処理

`close()` を除くすべての公開 API は `HaiResult<T>` を返します。

主なエラーコード：

| エラーコード                              | code                | 説明                 |
| ----------------------------------------- | ------------------- | -------------------- |
| `HaiSchedulerError.NOT_INITIALIZED`       | `hai:scheduler:010` | 未初期化             |
| `HaiSchedulerError.INIT_FAILED`           | `hai:scheduler:011` | 初期化に失敗         |
| `HaiSchedulerError.CONFIG_ERROR`          | `hai:scheduler:012` | 設定エラー           |
| `HaiSchedulerError.TASK_NOT_FOUND`        | `hai:scheduler:020` | タスクが存在しない   |
| `HaiSchedulerError.TASK_ALREADY_EXISTS`   | `hai:scheduler:021` | タスクが既に存在する |
| `HaiSchedulerError.INVALID_CRON`          | `hai:scheduler:022` | 無効な Cron 式       |
| `HaiSchedulerError.EXECUTION_FAILED`      | `hai:scheduler:023` | 実行に失敗           |
| `HaiSchedulerError.JS_EXECUTION_FAILED`   | `hai:scheduler:024` | JS 実行に失敗        |
| `HaiSchedulerError.API_EXECUTION_FAILED`  | `hai:scheduler:025` | API 実行に失敗       |
| `HaiSchedulerError.DB_SAVE_FAILED`        | `hai:scheduler:026` | DB 保存に失敗        |
| `HaiSchedulerError.ALREADY_RUNNING`       | `hai:scheduler:027` | 実行中               |
| `HaiSchedulerError.NOT_RUNNING`           | `hai:scheduler:028` | 実行していない       |
| `HaiSchedulerError.LOCK_ACQUIRE_FAILED`   | `hai:scheduler:029` | ロック取得に失敗     |
| `HaiSchedulerError.JS_COMPILE_FAILED`     | `hai:scheduler:030` | JS コンパイルに失敗  |
| `HaiSchedulerError.HOOK_EXECUTION_FAILED` | `hai:scheduler:031` | Hook 実行に失敗      |

### 実行時の動作と制約

DB を有効にすると、各ノードは `tickInterval`（既定 1000 ms）ごとに保存された定義を更新し、`tasks` は直近の成功したスナップショットになります。登録・更新・削除・手動実行、およびロック取得後の各試行で定義を再読します。削除・無効化・再スケジュールされた古いタスクは実行せず、読み取り失敗時は試行を中断します。開始済みの副作用は遠隔の変更で自動ロールバックしません。`init({ tasks })` はノード固有設定です。ノード間の動的タスクには永続化する `register()`、重複防止には共有 Redis を使います。メモリーキャッシュは単一プロセスのみです。

`await scheduler.refreshTasks()` でタスクを実行せず定義を更新できます。同じスナップショットの並行更新は 1 回の読み取りを共有します。登録・更新・削除は永続化成功後にメモリーへ反映し、全体更新の検証失敗では cron を変更しません。再試行や組み込み handler の解除には `retry: null`、`handler: null` を渡します。

Hook が投げる業務エラーは `failed` として記録し `retry` を適用します。handler の不足、キャンセル、ホストが投げる `SchedulerTaskSkippedError` は `interrupted` です。`event.context.occurrenceId` は 1 回の発生を識別し、同じスケジュール分ではノード間で共通、手動実行では毎回独立、再試行では元の ID を共有します。ホストはこの ID で冪等性の受領記録を保存できます。周期をまたぐ長時間タスクの排他制御にはホスト側の継続リースが必要です。`deleteAfterRun` は成功時のみ削除します。再試行前と成功後の削除前に現在の定義を確認し、DB の削除は 1 つの DELETE 内で実行定義をアトミックに照合して並行更新を保持します。

複数ノードの回帰テストは現在のソースをビルドし、SQLite と Testcontainers Redis を共有する実際の Node プロセスを 2 つ起動して、定義の収束と同じ分のロック競合を検証します。`pnpm --filter @h-ai/scheduler test` の前に、利用可能な Docker/Podman サービスが必要です。

`await scheduler.close()` は受付を止め、HTTP、JS Worker、再試行待機をキャンセルし、実行チェーンの終了後に状態を解放します。再初期化は終了完了を待ちます。すべてのイベントが `signal` を提供し、Hook はキャンセルを監視して外部への副作用を停止する必要があります。同じスレッドの業務コードは強制終了できないため、Hook でイベントループをブロックしないでください。キャンセルされた旧実行は再試行・自動削除・新インスタンスの Hook 呼び出しを行いません。scheduler の終了完了まで DB とキャッシュを維持し、その後に依存モジュールを終了します。

JS 文字列は呼び出しごとの独立 Worker で実行します。`timeout` は起動を含めて既定 30000 ms です。時間超過時はスレッドを終了し、終了を待ってから失敗記録・再試行を行います。同期の無限ループでもメインイベントループをブロックしません。コンテキストと戻り値は構造化クローンに対応する必要があります。Worker 内の `vm` も安全なサンドボックスではなく、信頼できるサーバー側コードのみを使用します。

API タスクの `timeout`（既定 30000 ms）はリクエストと応答本文全体の読み取りを含みます。`ApiTaskConfig.maxResponseBytes` は受信バイト上限で、正の安全な整数、既定は 1048576（1 MiB）です。`maxResponseBytes: 10 * 1024 * 1024` なら最大 10 MiB を許可し、不正値は送信前に失敗します。タイムアウト・上限超過・非成功 HTTP 応答は失敗として記録し、タスクの再試行方針を適用します。

`init()` は全タスクの読み込み完了後にのみ成功します。空 ID、重複 ID（保存済みタスクとの重複を含む）、不正な cron、DB 読み取り失敗、保存タスクの解析失敗では失敗を返し、初期化状態を消去します。設定・データを修正してから再初期化し、既存の DB タスクを `tasks` に重複宣言しないでください。

### 任意の連携

スケジュールループは分単位で cron を照合し、同じ分から分散ロックのキーを生成します。起動や tick が 0 秒を過ぎても現在の分を確認し、同じ実行中に毎 tick 重複してスケジュールしません。

Reach 通知を実行するタスクでは、調度ロックやタスク完了だけで外部配信の一意性は保証できません。[Reach キューの意味](../reach/README.ja.md) に従い、永続化された queueId を使ってください。HTTP 受信側は副作用と重複排除を原子的に保存し、SMTP/SMS の配信中の結果不明は手動照合します。スケジューラーの再試行で無条件に再送しないでください。

## 開発とテスト

```bash
pnpm --filter @h-ai/scheduler test
```

## ライセンス

Apache-2.0
