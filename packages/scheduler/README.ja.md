# @h-ai/scheduler

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

## 概要

共通のタスクモデル、cron スケジュール、JS 関数文字列・HTTP API の実行、永続化、実行ログ検索、全体のライフサイクル Hook を提供するスケジューラーモジュールです。

## 主な機能

- cron による定期実行とアプリケーションからの手動実行。
- HTTP、信頼できる JavaScript、アプリ Hook に対応し、再試行とキャンセルを提供。
- 共有 DB による定義・実行状態・更新可能リースの永続化と結果不明の隔離。

## 使い始める

### 依存関係

- `@h-ai/reldb`：先に共有 DB を初期化し、タスク・journal・リースを保存します。`enableDb` は true のみです。

### クイックスタート

```ts
import { reldb } from '@h-ai/reldb'
import { scheduler } from '@h-ai/scheduler'

await reldb.init({ type: 'sqlite', database: './scheduler.db' })

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
  timezone?: string // IANA 时区，例如 Asia/Shanghai；省略时为 UTC，不读取节点 TZ
  enabled?: boolean
  deleteAfterRun?: boolean
  idempotent?: boolean
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
  maxResponseBytes?: number
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
  enableDb: true,
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
- `trigger(taskId, { source?, idempotencyKey? })`
- `getLogs(options?)`
- `execution.listLogFailures(options?)` / `execution.repairLog(occurrenceId)`
- `execution.get(occurrenceId)` / `execution.listUnknown(options?)` / `execution.resolveUnknown(occurrenceId, input)`
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
| `HaiSchedulerError.JS_COMPILE_FAILED`     | `hai:scheduler:030` | JS コンパイルに失敗  |
| `HaiSchedulerError.HOOK_EXECUTION_FAILED` | `hai:scheduler:031` | Hook 実行に失敗      |
| `HaiSchedulerError.LOG_PERSIST_FAILED`    | `hai:scheduler:032` | ログ保存未確認       |

### 実行時の動作と制約

各ノードは同じ共有 RelDB を先に初期化します。ホスト間の本番運用は PostgreSQL/MySQL、SQLite は同じファイルを正しく共有するローカルプロセス向けです。定義、実行 journal、タスク占有、リースを永続化し、`enableDb` は true のみです。キャッシュは不要です。`leaseMs` は既定 300000、範囲 1000～86400000 ミリ秒で実行中に更新します。cron、手動、次周期は同じタスク枠を使い、期限切れ owner は復活・コミットできません。`tasks` は最後に成功した定義スナップショットで、読取失敗や削除・無効化・変更は旧試行を中断します。外部副作用は自動で戻りません。

`context.occurrenceId` は永続化された発生 ID で、同じ cron 分と再試行で共通です。手動では 1～128 文字の `idempotencyKey` で元の記録を再利用し、省略時は別発生になります。`executionToken` は取得ごとに変わり、`sequence` / `attempt` が世代を示します。API は `Idempotency-Key`、`X-Scheduler-Sequence`、`X-Scheduler-Attempt`、`X-Scheduler-Task`（ID を percent-encoding）を上書きします。取得済みのライフサイクルイベントも `event.context` を提供し、副作用には同じキーによる排除が必要です。

`idempotent` の既定は false。受信側が排除台帳と全副作用をアトミックに永続化する場合だけ true にします。期限切れ実行は true のとき同 occurrenceId で引継ぎ、非冪等実行、または保存済み retry.maxAttempts（既定 1、範囲 1–100、初回と復旧を含む）の予算を使い切った場合は `unknown` となりタスク枠を保持します。停止中の旧プロセスが送った外部操作をリースで撤回できず、ヘッダーだけでは排除できません。再試行もこの宣言に従います。

正規状態は `scheduler.execution.get(occurrenceId)`、不明一覧は `listUnknown({ limit, offset })`（limit 1～100、offset 0～1000000）で確認します。信頼された担当者が外部効果を照合し旧 runner の終了を確認してから、`resolveUnknown(id, { status: 'success' | 'discarded', expectedUpdatedAt })` の CAS で枠を解放します。不明実行を直接再投入しないでください。`log.occurrenceId` が照会用受領記録で、`getLogs` は試行の観測ログです。ログ保持は journal と排除履歴を削除しません。

各試行のログ `id` は固定 UUID です。`persistence.status` は業務 `status` と独立し、`persisted` はログと確認記録の保存済み、`pending` は業務終態の確定後にログ補完待ち、`unconfirmed` は確定済み業務結果を前提にできない状態です。有効な owner とリースの条件で終態と全試行を保存してからログへ投影し、失効ノードは成功を投影できません。ログ失敗を理由に業務成功を失敗へ変更したり、業務を再実行したりしません。

補完後は pending 一覧が縮小するため、処理中に offset を進めず、offset=0 のバッチを繰り返し取得してください。

信頼されたサーバーは `execution.listLogFailures({ limit, offset })`（listUnknown と同じ上限）で pending を監視し、`execution.repairLog(occurrenceId)` で共有 journal から補完します。別ノード・再起動後・同時呼び出しも可能で、固定主キーと全内容の照合によりコミット後の応答消失を排除します。`LOG_PERSIST_FAILED`（032）は pending を維持して安全な警告を出します。終態の保存前に DB 全体が停止した場合は unknown の外部効果を照合し、復元可能な結果があると仮定しないでください。補完と保持処理は業務 Hook を呼ばず、保持失敗は警告のみです。`onTaskFinish` は未確定のローカル業務終了通知で、保存確認は trigger の戻り値と execution.get.logPersistence を使います。

取得前の競合・スキップの interrupted は観測ログで、補完できる確定終態はありません。応答が確認できなければ unconfirmed です。JSON 列で MySQL の 255 文字制限を避け、完全な結果と全再試行を保持します。対応する旧ログはモジュール移行で保存・コピーし、実行台帳は独立します。終了は補完処理を待つため、DB より先に scheduler を終了してください。

```ts
const result = await scheduler.trigger('cleanup', { idempotencyKey: 'cleanup-2026-10-23' })
if (!result.success)
  return result
if (result.data.persistence.status === 'pending' && result.data.occurrenceId) {
  const repaired = await scheduler.execution.repairLog(result.data.occurrenceId)
  if (!repaired.success)
    return repaired
}
// 不用日志补写失败重新 trigger 业务；定期按页扫描 listLogFailures。
```

`await scheduler.close()` は受付を止め、HTTP、JS Worker、再試行待機をキャンセルし、実行チェーンの終了後に状態を解放します。再初期化は終了完了を待ちます。すべてのイベントが `signal` を提供し、Hook はキャンセルを監視して外部への副作用を停止する必要があります。同じスレッドの業務コードは強制終了できないため、Hook でイベントループをブロックしないでください。キャンセルされた旧実行は再試行・自動削除・新インスタンスの Hook 呼び出しを行いません。scheduler の終了完了まで DB を維持し、その後に依存モジュールを終了します。

JS 文字列は呼び出しごとの独立 Worker で実行します。`timeout` は起動を含めて既定 30000 ms です。時間超過時はスレッドを終了し、終了を待ってから失敗記録・再試行を行います。同期の無限ループでもメインイベントループをブロックしません。コンテキストと戻り値は構造化クローンに対応する必要があります。Worker 内の `vm` も安全なサンドボックスではなく、信頼できるサーバー側コードのみを使用します。

API タスクの `timeout`（既定 30000 ms）はリクエストと応答本文全体の読み取りを含みます。`ApiTaskConfig.maxResponseBytes` は受信バイト上限で、正の安全な整数、既定は 1048576（1 MiB）です。`maxResponseBytes: 10 * 1024 * 1024` なら最大 10 MiB を許可し、不正値は送信前に失敗します。タイムアウト・上限超過・非成功 HTTP 応答は既定では unknown となり、冪等性を宣言した場合だけ有限回再試行します。

`init()` は全タスクの読み込み完了後にのみ成功します。空 ID、重複 ID（保存済みタスクとの重複を含む）、不正な cron、DB 読み取り失敗、保存タスクの解析失敗では失敗を返し、初期化状態を消去します。設定・データを修正してから再初期化し、既存の DB タスクを `tasks` に重複宣言しないでください。

cron は分単位で照合し、同じ分から永続 occurrenceId を生成します。遅延 tick でも現在の分を実行中に一度確認します。

取得・開始・更新・完了・期限切れ検索・隔離の期限は、同じ SQL 文内でデータベース時刻から計算・検証します。PostgreSQL は clock_timestamp、MySQL は SYSDATE(3)、SQLite はストレージ側 now を使用し、先に時刻を読むだけでは最終条件を代替できません。cron の分 occurrence と式の照合も DB 時刻を使用します。timezone の省略時は UTC、明示した IANA 時区は壁時計の解釈だけを変更し、ノードの TZ は識別子や照合を変えません。Node の Date.now は診断専用です。ノード間で数時間の差があっても早期引継ぎや失効 owner の復活を許可せず、行ロック待機後も期限を検証します。DB 自体の時刻は運用側で信頼性を保ち、外部効果が不明な場合は自動再実行せず照合してください。

### 任意の連携

Reach 通知を実行するタスクでは、調度ロックやタスク完了だけで外部配信の一意性は保証できません。[Reach キューの意味](../reach/README.ja.md) に従い、永続化された queueId を使ってください。HTTP 受信側は副作用と重複排除を原子的に保存し、SMTP/SMS の配信中の結果不明は手動照合します。スケジューラーの再試行で無条件に再送しないでください。

## 旧データベースの更新

RelDB 初期化後に `migrateScheduler({ dryRun: true })` で確認し、scheduler.init がリポジトリー前に対応する移行を実行します。旧タスクを保持し idempotent=false を追加します。旧ログを hai_scheduler_logs_alpha65 に保存し、安定した legacy:<id> で完全なスナップショットを冪等コピーします。中断後も履歴を重複せず旧タスクを実行しません。SQLite/PostgreSQL はロールバック、MySQL は旧書込停止下で実構造から再開します。事前バックアップと互換 DB/コードによる復旧が必要です。

## 開発とテスト

```bash
pnpm --filter @h-ai/scheduler test
```

宣言の JSDoc 例は実在する公開入口から import します。内部リポジトリ、runner、コンパイラ、cron ツールは「模块内部上下文」と明記し、パッケージルートの公開 API を意味しません。HaiResult、明示的な取消しの reject、close の Promise<void> を区別し、業務 status とログ persistence も別に確認します。ログ修復で業務を再実行しません。保守時は `node scripts/check-module-jsdoc.mjs --package scheduler` で宣言網羅性と実際の型を検証します。例のコンパイルは共有 DB・独立プロセス検証を代替しません。

## ライセンス

Apache-2.0
