# @h-ai/runner 功能说明

[English](runner.en.md) · [日本語](runner.ja.md)

在 Node.js 服务端用 `runner` 提交、查询和取消任务。API 节点负责接收请求。启用了执行角色的节点从共享数据库领取任务，并按配置在容器中执行。

[模块 README](../../../packages/runner/README.md) · [配置清单](../configuration/runner.md) · [数据结构](../data/runner.md) · [Agent 与 Runner 接入](../development/agent.md)

<a id="quick-start"></a>

## 最小接入示例

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

<a id="api-reference"></a>

## 功能说明

`scope` 是应用根据可信身份建立的任务归属，`id` 来自已提交任务的执行记录。异步方法返回 `Promise`，下表描述等待完成后取得的结果。完整节点设置见 [Runner 配置](../configuration/runner.md)。

| API                                          | 用途                                   | 参数与默认值                                                        | 返回值                                                                          | 示例                                                                                                                        |
| -------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `runner.init(config)`                        | 为当前进程启动任务服务                 | `config.nodeId` 必填。`executor` 默认 `true`。先初始化 RelDB        | `HaiResult<void>`                                                               | `await runner.init({ nodeId: 'api-east', executor: false })`                                                                |
| `runner.close()`                             | 停止领取任务并核验本节点执行的清理     | 无参数                                                              | `HaiResult<void>`                                                               | `await runner.close()`                                                                                                      |
| `runner.isExecutor`                          | 查询当前实例是否已启动并负责执行       | 无参数                                                              | `boolean`                                                                       | `const canExecute = runner.isExecutor`                                                                                      |
| `runner.environment(id)`                     | 读已登记的执行环境                     | 执行环境 ID 必填                                                    | `HaiResult<RunnerEnvironment>`                                                  | `runner.environment('docs')`                                                                                                |
| `runner.register(kind, handler)`             | 登记一种任务及处理函数                 | 任务类型和异步处理函数必填                                          | `HaiResult<() => void>`，`data` 用于移除此登记                                  | `runner.register('reports.v1', async input => input)`                                                                       |
| `runner.registerWarmPool(pool)`              | 登记某类工具的预热目标和容量           | `pool` 必填，由应用给出环境、任务类型、预热数量和上限               | `HaiResult<() => void>`，`data` 用于移除此登记                                  | `runner.registerWarmPool({ key: 'docs', kind: 'docs.v1', environmentId: 'docs', minReady: 1, maxRunning: 2, maxTotal: 3 })` |
| `runner.submit(request)`                     | 保存任务，等待可用节点领取             | `scope`、`kind`、`input` 必填。排队和运行的超时都默认 `300000` 毫秒 | `HaiResult<RunnerExecution>`                                                    | `await runner.submit({ scope, kind: 'reports.v1', input: { page: 1 } })`                                                    |
| `runner.find(scope, kind, key)`              | 按任务类型和业务幂等键找现有执行       | 三个参数均必填                                                      | `HaiResult<RunnerExecution 或 undefined>`，成功但找不到时 `data` 为 `undefined` | `await runner.find(scope, 'reports.v1', 'monthly-2026-01')`                                                                 |
| `runner.get(scope, id)`                      | 按可信归属读取执行记录                 | `scope` 和 `id` 必填                                                | `HaiResult<RunnerExecution>`                                                    | `await runner.get(scope, id)`                                                                                               |
| `runner.cancel(scope, id)`                   | 保存取消请求                           | `scope` 和 `id` 必填                                                | `HaiResult<RunnerExecution>`。后续从记录查看当前状态                            | `await runner.cancel(scope, id)`                                                                                            |
| `runner.events(scope, id, after?, limit?)`   | 按序读取任务事件                       | `scope` 和 `id` 必填。`after` 默认 `0`，`limit` 默认 `100`          | `HaiResult<RunnerEvent[]>`                                                      | `await runner.events(scope, id, 0, 20)`                                                                                     |
| `runner.reconcileUnknown(scope, id, review)` | 在原执行节点记录对已停止资源的人工核验 | `scope`、`id` 和核验记录必填。无容器凭据时还须核对应用侧资源已停止  | `HaiResult<RunnerExecution>`，业务结果仍可能未知                                | `await runner.reconcileUnknown(scope, id, { operatorId: 'ops-1', reason: '核验记录 OPS-42', hostResourcesStopped: true })`  |

### 分配节点角色与读取环境

默认 PostgreSQL Store 可由多个节点同时初始化。空库创建表、旧库补列与索引、初始化门闩在同一事务中完成；失败回滚，修正权限或结构冲突后可在同一实例重试 `init`。

每个应用进程通常直接使用 `runner`。API 节点只负责提交和查询，执行节点负责领取和执行，两者都连接同一 PostgreSQL 或 MySQL 数据库，并使用相同的环境定义和并发上限。每台执行节点使用不同且重启后不变的 ID。以下示例假定 RelDB 已启动，`imageId` 是每台执行节点上已经准备好的 OCI 镜像 ID 或带摘要的镜像引用。若测试时需要在同一进程比较多个节点，可用包级工厂 `createRunner()` 创建彼此独立的实例，再分别调用各自的 `init()` 和 `close()`。

```ts
import type { RunnerConfigInput } from '@h-ai/runner' // 用公开类型检查两类节点共用的设置。
import { runner } from '@h-ai/runner' // 在 API 进程中使用默认实例。

async function startApi(imageId: string) {
  const settings: RunnerConfigInput = {
    nodeId: 'api-east', // 节点 ID，执行节点改用独立 ID。
    executor: false, // API 节点提交任务、查询和取消。
    environments: [
      {
        id: 'docs', // 提交任务时使用的 environmentId。
        image: imageId, // 固定且已准备的镜像摘要。
        capabilities: ['documents.extract'], // 供上层按能力选环境。
        resources: {
          cpu: 1,
          memoryMiB: 256,
          pids: 64,
          scratchMiB: 64
        }, // 环境允许的上限。
      }
    ],
  }
  const started = await runner.init(settings) // 校验配置、补齐默认值。成功时没有业务数据。
  if (!started.success)
    throw new Error(started.error.message)
  const docs = runner.environment('docs') // 成功返回配置副本，data.image 等于 imageId。
  if (!docs.success)
    throw new Error(docs.error.message)
  return docs.data // 应用停止时先调用并检查 runner.close()，再关闭 RelDB。
}
```

执行节点用 `runner.init({ ...settings, executor: true })` 启动，再用 `runner.register(kind, handler)` 登记应用编写的处理函数。若同一段启动代码也在 API 节点运行，`runner.register()` 会返回一个空的注销函数。`runner.environment(id)` 读取当前执行环境，未知 ID 返回 `NOT_FOUND`。

### 恢复任务、读取事件和取消

同一主体、任务类型和幂等键重试相同的提交会取得原回执。改变原提交的内容会得到 `CONFLICT`。`reuseKey` 可让可信服务复用已有活跃执行，如同一用户的 Worker。幂等键可用于 `find`，复用键由服务端维护。以下函数接收已认证主体和已存在的 `report.v1` 回执对应的幂等键。

```ts
import type { RunnerScope } from '@h-ai/runner' // 主体包括 tenantId 和 userId。
import { runner } from '@h-ai/runner' // 此实例须已启动，并连接任务所在数据库。

async function cancelReport(scope: RunnerScope, key: string) {
  const found = await runner.find(scope, 'report.v1', key) // 命中返回原回执，未找到时成功且 data 为 undefined。
  if (!found.success || !found.data)
    return found // 保留查询错误或未命中结果。
  const id = found.data.id // 后续读取、取消和分页都使用同一任务 id。
  const page = await runner.events(scope, id, 0, 20) // 读取 sequence > 0 的前 20 个事件，空页为 []。
  if (!page.success)
    return page // 查询失败时保留原错误。
  const after = page.data.at(-1)?.sequence ?? 0 // 下一页以最后一个序号为游标。
  const next = await runner.events(scope, id, after, 20) // 按序读取游标之后的最多 20 项。
  if (!next.success)
    return next
  const cancelled = await runner.cancel(scope, id) // 排队任务直接 cancelled，运行中通常先变为 cancelling。
  if (!cancelled.success)
    return cancelled
  return runner.get(scope, id) // 重新读取当时状态，可继续轮询直至停止得到确认。
}
```

取消已结束的任务会返回其当前状态。`events` 的 `after` 默认 `0`，`limit` 默认 `100`，范围 `1–100`。提交、每条事件和输出分别有 512 KiB 的 JSON 大小上限。单个执行持久化事件总量上限为 16 MiB，条数另受 `maxEvents` 限制。大文件及密钥使用业务对象引用或执行节点的密钥管理。

执行节点按数据库时钟分批清理超过 `retentionMs` 的已结束任务、已核验未知任务和对应事件，默认保留七天。未核验的 `unknown` 及仍有关联子任务的父记录继续保留。清理后 `find` 返回空，`get` 和 `events` 返回 `NOT_FOUND`。相同幂等键此时可重新提交，调用方应在保留期内重试，并自行管理期限更长的外部幂等约束。

### 运行隔离容器、传入文件并取回产物

执行节点需要 Linux cgroup v2、支持 CPU/内存/PID 限额的 Podman 或 Docker，以及预先准备的固定镜像。镜像需要 `/bin/sh`，以 UID/GID 1000 运行，且不能声明额外的镜像卷。默认离线、根文件系统只读，`/state`、`/workspace` 和 `/tmp` 使用限额临时文件系统。联网环境使用 `networkPolicy: 'internal'` 和通过引擎检查的命名内部网络；部署方负责信任域与出口限制。

以下例子假定 `docs` 环境已登记，镜像另外提供 `cat` 和 `/usr/bin/python3`。处理器的示例输入是可信固定夹具。应用处理真实文件时，应在执行节点按 `context.scope` 复核授权文件 ID，并在发布产物后只返回业务产物 ID。

```ts
import { Buffer } from 'node:buffer' // 编码输入并核对返回的文件字节。
import { once } from 'node:events' // 等待标准输出通知产物已就绪。
import { core } from '@h-ai/core' // 记录未确认的清理结果。
import { runner } from '@h-ai/runner' // 需在实际执行节点上运行。

const registration = runner.register('copy.v1', async (_input, context) => { // 返回注销函数，处理器只运行在拥有任务租约的节点。
  const launched = await context.start({
    command: '/bin/sh', // 固定镜像内的可信入口。
    args: ['-ec', 'cat /input/source.txt > /output/result.txt; printf ready; read -r done || true'], // 文件就绪后等待 stdin 关闭。
    inputs: {
      'source.txt': Buffer.from('hello').toString('base64')
    }, // 只读 /input/source.txt，内容为 hello。
  }) // 成功返回含 stdin、stdout、stderr、wait、artifact 和 close 的容器句柄。
  if (!launched.success)
    throw new Error(launched.error.message)
  const process = launched.data // 在容器退出前读取产物。
  try {
    process.stderr.resume() // 消费错误流，避免写满后阻塞子进程。
    await once(process.stdout, 'data', { signal: context.signal }) // 首次输出来自固定命令的 ready 通知。
    const artifact = await process.artifact('result.txt', 64) // 成功为 { success: true, data: 'aGVsbG8=' }。
    if (!artifact.success)
      throw new Error(artifact.error.message)
    process.stdin.end() // 关闭输入流，使示例命令退出。
    const exit = await process.wait() // 本例正常退出为 { code: 0, signal: null }。
    if (exit.code !== 0)
      throw new Error('Copy failed')
    return {
      text: Buffer.from(artifact.data, 'base64').toString('utf8')
    } // 示例输出 { text: 'hello' }。
  }
  finally {
    const stopped = await process.close() // 成功时确认容器已移除，data 为 undefined。
    if (!stopped.success)
      core.logger.error('Container cleanup unconfirmed', { code: stopped.error.code }) // Runner 在处理器结束后再次核对清理结果。
  }
})
if (!registration.success)
  throw new Error(registration.error.message)
```

提交 `{ scope, kind: 'copy.v1', input: null, environmentId: 'docs' }` 即可排队运行。`context.start` 每个任务至多调用一次。`files` 将启动文本文件放入 `/state`，`env` 只交给容器进程，`cwd` 默认 `/workspace`。`inputs` 最多 8 个平铺文件，输入合计不超过 50 MiB 与 `scratchMiB` 中的较小值。`artifact` 读取仍在运行的容器中 `/output` 的普通文件，并受传入的 `maxBytes` 与 50 MiB 硬上限约束。应用要检查产物归属后再提供下载。

### 私有项目工作区

`context.start({ command, workspace })` 接收规范 Base64 普通文件树，可用 `src/main.ts` 这样的相对路径。执行器把初始文件复制到容器私有的 `/workspace`，容量受临时盘限制。项目最多 512 个文件，最多 50 MiB，拒绝路径逃逸和 Git 元数据。工作区与预热单次工具分别使用独立入口。

```ts
// 输入已有任务处理器 context；启动命令在私有目录编辑，返回容器句柄。
const launched = await context.start({
  command: '/bin/sh',
  args: ['-c', 'read -r done'],
  workspace: { 'src/readme.txt': 'aGk=' }
})
if (!launched.success)
  throw new Error(launched.error.message)
// 输入允许读取的最大字节数，得到当前普通文件的 Base64 映射。
const files = await launched.data.snapshot(1024 * 1024)
if (!files.success)
  throw new Error(files.error.message)
```

快照需要镜像提供 Node.js，只读取仍属于当前任务的工作区，跳过链接和特殊文件。授权用户确认接收或 Git 发布前，调用应用核对产物所有者。任务处理器退出会由 Runner 确认清理容器及暂存。

### 路由子任务、限制工具并发和预热

同一主体的运行中父任务可通过 `parentId` 接收子任务。子任务在同一节点及执行代次领取，适合转交已有连接的控制操作，使用 `maxControlRunning` 控制并发。`capacityClass: 'tool'` 使用独立工具资源。`concurrency: { key, limit }` 对相同任务类型和服务键设置跨节点活动上限。

```ts
import type { RunnerScope } from '@h-ai/runner' // 由服务端认证或可信父处理器提供。
import { runner } from '@h-ai/runner' // 连接共用数据库的实例。

async function sendControl(scope: RunnerScope, parentId: string) {
  return runner.submit({
    scope,
    parentId,
    kind: 'worker.control',
    input: { operation: 'status' }
  }) // 返回 queued 回执；父任务已结束或不匹配时返回冲突。
}

function registerCopyPool() {
  return runner.registerWarmPool({
    key: 'docs-copy',
    kind: 'copy.v1',
    environmentId: 'docs',
    minReady: 1,
    maxRunning: 2,
    maxTotal: 3
  }) // 成功返回注销函数，执行节点须先注册 copy.v1。
}

async function queuePrewarmedCopy(scope: RunnerScope) {
  return runner.submit({
    scope,
    kind: 'copy.v1',
    input: null,
    environmentId: 'docs',
    capacityClass: 'tool',
    warmPool: true,
    concurrency: { key: 'docs-copy', limit: 2 }
  }) // 返回 queued 回执，执行节点分配一次性容器。
}
```

`worker.control` 由应用在执行节点注册。启动时调用一次 `registerCopyPool()` 并检查 `success`，API 与执行节点使用相同值。预热容器只处理一次任务，领取后才传入用户文件。`maxTotal` 包含准备、待命、运行、清理及未核验实例，`maxRunning` 限制活动作业。预热需要 `/usr/bin/python3` 和离线环境，启动作业必须提供 `inputs`，工作目录使用 `/workspace`，且 `env`、`files` 为空。应用停止接受相应工具后，可调用登记回执中的注销函数，释放本节点未领取的预热容器。

### 核验未知执行

失租或清理失败可能将任务标为 `unknown`，并保留资源占用。运维先确认实际容器和外部副作用，再在原执行节点调用管理入口。Runner 校验引擎身份、实际容器已移除及本地暂存已清理，保留审计记录。

如果任务不使用容器，先由运维确认应用启动的所有资源都已停止，再传 `hostResourcesStopped: true`。Runner 还会核对是否在原执行进程所在的 Linux 主机、同一次系统启动和同一个 PID 命名空间，并确认旧进程已经停止。控制子任务还要求父任务已结束或已核实停止。旧记录无法证明进程身份，或原任务应在容器中却找不到容器记录时，容量不会释放。

```ts
import type { RunnerScope } from '@h-ai/runner' // 从任务归属和可信管理会话取得。
import { runner } from '@h-ai/runner' // 此处必须是原执行节点上的实例。

async function reconcile(scope: RunnerScope, id: string) {
  const checked = await runner.reconcileUnknown(scope, id, { operatorId: 'ops-1', reason: 'INC-47: container cleanup verified' }) // 核验成功返回 unknown 回执和 reconciledAt。
  if (!checked.success)
    return checked // 缺少可信容器回执、仍在运行或引擎不匹配时保留原错误与占用。
  return checked // 可释放执行预算和复用键，外部业务结果仍待业务侧核对。
}

async function reconcileHost(scope: RunnerScope, id: string) {
  const checked = await runner.reconcileUnknown(scope, id, { operatorId: 'ops-1', reason: 'INC-48: host resources verified', hostResourcesStopped: true }) // 输入可信操作员核对结论，成功返回带 reconciledAt 的 unknown 回执。
  if (!checked.success)
    return checked // 旧进程尚存、父任务未核验或缺少本机证明时保留占用。
  return checked // 仅确认资源释放，业务结果仍需核对。
}
```

## 错误处理

先检查 `result.success`，再读 `data` 或 `error`。初始化、无效配置、不存在、冲突、容量不足、失租和清理未确认的错误由 `HaiRunnerError` 定义。处理器失败则写入执行状态，可通过成功的 `get()` 读取 `status: 'failed'` 及 `failure`。`cancel()` 成功表示取消请求已受理，停止结果由状态确认。`close()` 返回清理未确认时，应保留数据库连接以便检查或重试关闭。
