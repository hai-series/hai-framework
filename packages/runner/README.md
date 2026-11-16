# @h-ai/runner

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · [关系数据库](../reldb/README.md) · [AI 智能体](../ai/README.md)

Runner 在 Node.js 服务端运行受管的 Agent Worker 和工具作业。API 节点提交任务、查询状态和发送取消请求，执行节点领取任务并持有实际容器。任务、租约、事件和执行结果通过关系数据库共享。

## 快速开始

```sh
pnpm add @h-ai/runner @h-ai/reldb
```

先启动 RelDB，再启动 Runner。下面用 SQLite 运行一个可信的服务端处理器，无需容器引擎。把示例放在 Node.js 应用的启动脚本中运行。业务接口应从已认证身份取得 `tenantId` 和 `userId`，并在调用 Runner 前检查业务权限。

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

## 配置清单

<a id="配置"></a>

应用在 `runner.init()` 中指定节点角色、执行器设置和任务保留策略。

在[模块配置清单](../../docs/usage/configuration/runner.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/runner.md)中查看调用示例、输入输出、错误处理与使用要点。

- `init` / `close` / `environment` / `isExecutor` — 装配节点角色与执行环境
- `register` / `registerWarmPool` / `submit` — 注册执行器和预热池，提交任务
- `find` / `get` / `events` / `cancel` / `reconcileUnknown` — 查找任务、读取事件、取消或核实未知结果

## 数据结构

查看[数据结构](../../docs/usage/data/runner.md)，了解持久任务、执行租约、事件、工作区和容器产物。

## 开发测试

在仓库根目录执行（PowerShell 使用 `pnpm.cmd`）。SQLite 验证任务流程，PostgreSQL/MySQL 验证跨节点归属，Podman/Docker 验证真实容器限制、取消和产物。`HAI_TEST_CONTAINER_ENGINE` 可选择容器引擎；数据库测试还需可用的 Docker 兼容 Testcontainers 接口。`HAI_TEST_RUNNER_ARTIFACT_IMAGE` 指定预先构建的测试工具镜像，启用产物和跨节点预热测试。

```sh
pnpm --filter @h-ai/runner typecheck
pnpm --filter @h-ai/runner lint
pnpm --filter @h-ai/runner build
pnpm --filter @h-ai/runner test
```

## 许可证

Apache-2.0
