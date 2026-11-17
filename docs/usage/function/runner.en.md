# @h-ai/runner API reference

[Chinese source](runner.md) · [Configuration](../configuration/runner.en.md) · [Data structures](../data/runner.en.md)

<a id="quick-start"></a>

## Quick start

Initialize the runner after the database. The API may submit work, but only a node configured as executor runs handlers. Use the same scope and idempotency key to recover an uncertain submission.

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

## API list

Check success before using the data shown below. environment, register and registerWarmPool return HaiResult synchronously.

| API | Purpose | Inputs and defaults | Output | Example |
| --- | --- | --- | --- | --- |
| `runner.init` | Start this process as an API node or worker | `{ nodeId, executor = true, ... }` | `void` | `await runner.init({ nodeId: 'api-east', executor: false })` |
| `runner.close` | Stop claims and check local execution cleanup | None | `void` | `await runner.close()` |
| `runner.isExecutor` | Check whether this ready node executes jobs | Read-only property | `boolean` | `runner.isExecutor` |
| `runner.environment` | Read a registered execution environment | `id` | `RunnerEnvironment` | `runner.environment('docs')` |
| `runner.register` | Register a local handler and get its deregistration function | `kind, handler` | `() => void` | `runner.register('example', handler)` |
| `runner.registerWarmPool` | Register a pool for reusing prepared containers | `pool` | `() => void` | `runner.registerWarmPool(pool)` |
| `runner.submit` | Queue a new job or reuse a matching execution | `request` | `RunnerExecution` | `await runner.submit(request)` |
| `runner.find` | Find an execution by authorized scope, kind and reuse key | `scope, kind, key` | `RunnerExecution or undefined` | `await runner.find(scope, 'example', 'request-1')` |
| `runner.get` | Read one execution in its authorized scope | `scope, id` | `RunnerExecution` | `await runner.get(scope, id)` |
| `runner.cancel` | Ask a queued or running execution to stop | `scope, id` | `RunnerExecution` | `await runner.cancel(scope, id)` |
| `runner.reconcileUnknown` | Record a verified outcome for an unknown execution | `scope, id, review` | `RunnerExecution` | `await runner.reconcileUnknown(scope, id, review)` |
| `runner.events` | Read events after a saved sequence | `scope, id, after = 0, limit = 100` | `RunnerEvent[]` | `await runner.events(scope, id, 0, 20)` |

Derive scope from the authenticated request. A cancellation request is not proof of stopped external work. Reconcile an unknown execution only after examining the original resources.
