# @h-ai/runner API リファレンス

[原文（中国語）](runner.md) · [設定](../configuration/runner.ja.md) · [データ構造](../data/runner.ja.md)

<a id="quick-start"></a>

## クイックスタート

データベースの後に Runner を初期化します。API からジョブを登録できますが、ハンドラーを実行するのは実行ノードだけです。登録の結果が不明なら、同じスコープと冪等キーで既存ジョブを調べます。

```sh
pnpm add @h-ai/runner @h-ai/reldb
```

```ts
import { setTimeout as delay } from 'node:timers/promises' // 用于演示有界轮询。
import { reldb } from '@h-ai/reldb' // 提供 Runner 使用的关系数据库。
import { runner } from '@h-ai/runner' // 同一进程内共享的 Runner 实例。

const database = await reldb.init({ type: 'sqlite', database: ':memory:' }) // 成功为 { success: true, data: undefined }。
if (!database.success)
  throw new Error(database.error.message) // 数据库不可用时中止启动。

try {
  const started = await runner.init({ nodeId: 'worker-east' }) // 默认承担执行角色，成功后 isExecutor 为 true。
  if (!started.success)
    throw new Error(started.error.message) // 停止启动，不提交任务。

  const registration = runner.register('report.v1', async (input, context) => { // 成功返回注销函数。
    if (typeof input !== 'string')
      throw new TypeError('Expected report title') // 处理器校验业务输入。
    const event = await context.emit({ phase: 'ready' }) // 成功后事件序号为 1，可从另一节点读取。
    if (!event.success)
      throw new Error(event.error.message) // 写事件失败时结束处理器。
    return { title: input } // 作为任务成功时的 output。
  })
  if (!registration.success)
    throw new Error(registration.error.message) // 重复注册会失败。

  const scope = { tenantId: 'studio', userId: 'alice' } // 示例主体，生产来自服务端认证。
  const accepted = await runner.submit({
    scope,
    kind: 'report.v1',
    idempotencyKey: 'report-nov',
    input: 'Monthly report'
  }) // 返回 queued 回执和任务 id。
  if (!accepted.success)
    throw new Error(accepted.error.message) // 返回失败时没有可用回执。

  const deadline = Date.now() + 5_000 // 本示例最多等待五秒。
  let completed = false // 仅在读取到成功终态时设为 true。
  while (Date.now() < deadline) {
    const task = await runner.get(scope, accepted.data.id) // 同一主体下读取当前状态与结果。
    if (!task.success)
      throw new Error(task.error.message) // 找不到或读取失败时终止示例。
    if (task.data.status === 'succeeded') {
      process.stdout.write(`${JSON.stringify(task.data.output)}\n`) // 输出 {"title":"Monthly report"}。
      completed = true
      break
    }
    if (task.data.status !== 'queued' && task.data.status !== 'running')
      throw new Error(task.data.failure ?? task.data.status) // 任务失败与查询失败是两个独立状态。
    await delay(100) // 100 ms 后继续查询，返回 undefined。
  }
  if (!completed)
    throw new Error('Timed out waiting for the report') // 等待超时由示例报告，Runner 会在退出阶段尝试取消本节点任务。
  registration.data() // 注销当前处理器，返回 undefined。
}
finally {
  try {
    const closed = await runner.close() // 停止领取，取消本节点任务并等待清理确认。
    if (!closed.success) {
      process.stderr.write(`${closed.error.message}\n`) // 清理未确认时上报并保留连接供核对。
      process.exitCode = 1
    }
    else {
      const released = await reldb.close() // 释放数据库连接，成功为 { success: true, data: undefined }。
      if (!released.success) {
        process.stderr.write(`${released.error.message}\n`)
        process.exitCode = 1
      }
    }
  }
  catch (cause) {
    process.stderr.write(`${String(cause)}\n`) // 保留示例原任务的异常。
    process.exitCode = 1
  }
}
```

<a id="api-reference"></a>

## API 一覧

表の成功データを使う前に success を確認します。environment、register と registerWarmPool は同期で HaiResult を返します。

| API | 用途 | 入力と既定値 | 出力 | 例 |
| --- | --- | --- | --- | --- |
| `runner.init` | API ノードまたはワーカーとして起動 | `{ nodeId, executor = true, ... }` | `void` | `await runner.init({ nodeId: 'api-east', executor: false })` |
| `runner.close` | 取得を止め、実行中の処理を確認して終了 | なし | `void` | `await runner.close()` |
| `runner.isExecutor` | このノードが実行を担当するか確認 | 読み取り専用プロパティ | `boolean` | `runner.isExecutor` |
| `runner.environment` | 登録済みの実行環境を取得 | `id` | `RunnerEnvironment` | `runner.environment('docs')` |
| `runner.register` | ローカル処理を登録し、解除関数を取得 | `kind, handler` | `() => void` | `runner.register('example', handler)` |
| `runner.registerWarmPool` | 準備済みコンテナを再利用するプールを登録 | `pool` | `() => void` | `runner.registerWarmPool(pool)` |
| `runner.submit` | 新規ジョブを待機させるか、条件に合う既存実行を返す | `request` | `RunnerExecution` | `await runner.submit(request)` |
| `runner.find` | 認可済み範囲、種別、再利用キーから実行を検索 | `scope, kind, key` | `RunnerExecution or undefined` | `await runner.find(scope, 'example', 'request-1')` |
| `runner.get` | 認可済みの範囲の実行結果を取得 | `scope, id` | `RunnerExecution` | `await runner.get(scope, id)` |
| `runner.cancel` | 待機中または実行中の処理に中止を要求 | `scope, id` | `RunnerExecution` | `await runner.cancel(scope, id)` |
| `runner.reconcileUnknown` | 結果不明の実行について確認済みの結論を記録 | `scope, id, review` | `RunnerExecution` | `await runner.reconcileUnknown(scope, id, review)` |
| `runner.events` | 保存した連番の続きからイベントを取得 | `scope, id, after = 0, limit = 100` | `RunnerEvent[]` | `await runner.events(scope, id, 0, 20)` |

認証済みリクエストから範囲を決めます。中止要求は外部作業が停止した証拠ではありません。元のリソースを確認してから結果不明の実行を照合します。
