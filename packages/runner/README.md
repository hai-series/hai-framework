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

## 功能

| 能力         | 用途                                         | 公开入口                                                             |
| ------------ | -------------------------------------------- | -------------------------------------------------------------------- |
| 节点生命周期 | 启动 API 与执行角色，查询环境                | `init`、`close`、`isExecutor`、`environment`、`createRunner`         |
| 任务与事件   | 持久提交、幂等恢复、查询、取消及分页订阅     | `register`、`submit`、`find`、`get`、`events`、`cancel`              |
| 容器和文件   | 用固定镜像执行，读写标准流并取回授权产物     | `context.start`、`context.emit`、`process.wait`、`artifact`、`close` |
| 子任务与预热 | 将控制任务交给父任务节点，给工具保留容量     | `submit({ parentId })`、`registerWarmPool`                           |
| 未知状态核验 | 核对容器或宿主进程已停止，并记录操作员和工单 | `reconcileUnknown`                                                   |

### 分配节点角色与读取环境

单进程应用可使用 `runner`。`createRunner()` 返回独立实例，适用于分别注入节点角色或隔离测试。多节点生产部署使用共享 PostgreSQL 或 MySQL，同一部署使用一致的环境定义和并发上限。执行节点 ID 必须唯一，并在节点重启后保持稳定。以下示例假定 RelDB 已启动，`imageId` 由部署方提供，是每台执行节点本地已缓存的 OCI 镜像 ID 或清单 digest。

```ts
import type { RunnerConfigInput } from '@h-ai/runner' // 用公开类型检查两类节点共用的设置。
import { createRunner, RunnerConfigSchema } from '@h-ai/runner' // 工厂返回实例，Schema 校验配置与默认值。

function prepareApi(imageId: string) {
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
  return RunnerConfigSchema.safeParse(settings) // 成功后 data 包含 engine: 'podman' 和 offline 环境默认值。
}

async function startApi(imageId: string) {
  const settings = prepareApi(imageId) // 非法摘要或资源配置会得到 Zod 错误。
  if (!settings.success)
    throw new Error(settings.error.message)
  const api = createRunner() // 新实例，未启动时 isExecutor 为 false。
  const started = await api.init(settings.data) // 成功时 data 为 undefined。
  if (!started.success)
    throw new Error(started.error.message)
  const docs = api.environment('docs') // 成功返回配置副本，data.image 等于 imageId。
  if (!docs.success)
    throw new Error(docs.error.message)
  return api // 应用停止时先调用并检查 api.close()，再关闭 RelDB。
}
```

执行节点以 `executor: true` 启动，并通过 `register(kind, handler)` 登记可信处理器。API 节点也可以执行相同装配逻辑，其 `register` 返回空注销函数。`environment(id)` 可读当前环境，未知 ID 返回 `NOT_FOUND`。

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

没有容器的可信宿主任务在运维确认应用侧资源均已停止后传入 `hostResourcesStopped: true`。Runner 在同一 Linux 宿主、系统启动代次和 PID 命名空间中核验旧执行进程已退出。控制子任务还要求父执行已结束或已经核验。旧记录缺少进程证明，或者预定使用容器的任务缺少容器凭据时，继续保留占用。

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

## 配置

`runner.init(config)` 接收对象。由宿主读取部署配置并明确传入。`RunnerConfigSchema.safeParse(config)` 可提前验证输入。以下时间单位均为毫秒，节点常规和工具预算需要分别核算，宿主需要能承载两者之和。

| 字段                                                    | 默认值                                      | 用途                                                                                                            |
| ------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `nodeId`                                                | 必填                                        | 节点身份，重启后保持稳定                                                                                        |
| `executor`、`engine`                                    | `true`、`podman`                            | 执行角色与容器引擎，亦支持 `docker`                                                                             |
| `capacity`                                              | `4 CPU / 4096 MiB / 512 PID / 2048 MiB`     | 普通执行资源，依次为 CPU、内存、PID、临时盘                                                                     |
| `toolCapacity`、`toolMaxRunning`                        | `1 CPU / 1024 MiB / 128 PID / 512 MiB`、`4` | 工具的独立节点预算与并发                                                                                        |
| `maxRunning`、`maxRunningPerScope`、`maxControlRunning` | `8`、`4`、`8`                               | 节点普通并发、主体并发、节点控制子任务并发                                                                      |
| `maxQueued`、`maxEvents`                                | `5000`、`10000`                             | 常规和控制队列分别限长，每个执行限制持久事件条数                                                                |
| `retentionMs`                                           | `604800000`                                 | 终态记录和事件保留期，范围 1 小时至 365 天，同一部署的节点使用相同设置                                          |
| `leaseMs`、`pollMs`、`closeTimeoutMs`                   | `10000`、`50`、`20000`                      | 租约、轮询和等待关闭，`pollMs × 3` 必须小于 `leaseMs`                                                           |
| `environments`                                          | `[]`                                        | 环境 ID、固定镜像、资源、可选 `architecture` 和 `capabilities`。网络默认 `offline`，`internal` 需指定 `network` |

任务可用 `resources` 调低环境上限。`queueTimeoutMs` 和 `runTimeoutMs` 默认均为 `300000`。可信服务可用 `nodeId` 固定节点，或者用 `parentId` 绑定活动父任务。工具池使用登记环境的资源值。

## 错误处理

先检查 `result.success`，再读 `data` 或 `error`。初始化、无效配置、不存在、冲突、容量不足、失租和清理未确认的错误由 `HaiRunnerError` 定义。处理器失败则写入执行状态，可通过成功的 `get()` 读取 `status: 'failed'` 及 `failure`。`cancel()` 成功表示取消请求已受理，停止结果由状态确认。`close()` 返回清理未确认时，应保留数据库连接以便检查或重试关闭。

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
