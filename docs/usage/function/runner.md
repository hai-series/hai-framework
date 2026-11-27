# @h-ai/runner 功能说明

[English](runner.en.md) · [日本語](runner.ja.md)

Runner 为 Node.js 服务提供持久任务队列。提交任务时得到执行编号，处理器在后台领取任务并写入进度和结果。调用方可以断开连接，稍后拿着原编号或幂等键继续查询。单进程程序可直接执行可信的 TypeScript 或 JavaScript 处理器。需要隔离进程时，再为选定任务配置容器环境。

首次接入可以先在[一个进程提交并执行月报](#quick-start)，再用相同的处理器[拆成 API 节点和执行节点](#two-node-example)。已有任务类型但不确定该怎么提交，可以先看[普通任务、控制任务和工具任务](#task-kinds)。

[模块 README](../../../packages/runner/README.md) · [配置](../configuration/runner.md) · [数据结构](../data/runner.md)

<a id="module-dependencies"></a>

## 依赖

| 依赖 | 用途 | 何时需要 | 接入顺序 |
| --- | --- | --- | --- |
| Node.js | 运行服务端 API、处理器和容器标准流 | 所有节点。支持从 22.23.4、24.22.1、26.12.1 开始的各自大版本 | 在 Node.js 应用中安装并导入 Runner |
| `@h-ai/reldb` | 保存任务、事件和执行归属 | 所有节点。单进程可用 SQLite，分进程部署连接同一个 PostgreSQL 或 MySQL 库 | 先初始化 RelDB，再初始化 Runner。确认 Runner 已关闭后再关闭 RelDB |
| Podman 或 Docker | 启动并限制容器进程 | 只有运行容器的执行节点需要。宿主须支持 Linux cgroup v2 和 CPU、内存、进程数限额 | 先准备引擎和固定镜像，再在配置中登记执行环境 |

Runner 随包安装 `@h-ai/core`，直接传配置对象即可接入。宿主若要使用 Core 配置中心读取 YAML，按[配置入口](../configuration/runner.md#configuration-entry)显式接入。任务主体由宿主认证并授权。

<a id="quick-start"></a>

## 最小接入示例

这个示例用一个 Node.js 进程提交并执行月报。你会看到两次输出，第一次确认任务已入队，第二次给出月报结果和一条进度事件。示例用内存 SQLite，无需先启动数据库服务。

#### 1. 安装依赖

在 Node.js 项目目录安装两个包，后续文件也都保存到这个目录。

```sh
pnpm add @h-ai/runner @h-ai/reldb
```

#### 2. 编写月报处理器

保存为 `report.mjs`。提交端用 `reportKind` 给任务标明类型，执行端用同一个值登记 `buildReport`。示例用固定行数代替实际报表查询。

```js
export const reportKind = 'report.v1'

/** @type {import('@h-ai/runner').RunnerHandler} */
export const buildReport = async (input, context) => {
  // input 来自 runner.submit 的 input 字段。校验失败会使任务进入 failed。
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.month !== 'string')
    throw new TypeError('Expected a report month')

  // 将进度写入当前任务的持久事件。提交端之后用 runner.events 读取。
  const recorded = await context.emit({ phase: 'reading' })
  if (!recorded.success)
    throw new Error(recorded.error.message)

  // 返回的 JSON 成为任务的 output，可在任务成功后用 runner.get 读取。
  return { month: input.month, rows: 120 }
}
```

#### 3. 提交任务并读取结果

保存为 `report-demo.mjs`。它把两个角色放在同一进程里，先登记处理器，再提交一份 2026 年 11 月的月报。

```js
import { setTimeout as delay } from 'node:timers/promises'
import { reldb } from '@h-ai/reldb'
import { runner } from '@h-ai/runner'
import { buildReport, reportKind } from './report.mjs'

// Runner 的任务和事件由 RelDB 保存。先打开本进程专用的内存数据库。
const database = await reldb.init({ type: 'sqlite', database: ':memory:' })
if (!database.success)
  throw new Error(database.error.message)

try {
  // 启动 Runner 并准备存储表。executor 默认为 true，本进程可以领取任务。
  const started = await runner.init({ nodeId: 'report-local' })
  if (!started.success)
    throw new Error(started.error.message)

  // 用提交时的同一个 kind 登记处理器。只有登记成功后才提交该类型的任务。
  const registered = runner.register(reportKind, buildReport)
  if (!registered.success)
    throw new Error(registered.error.message)

  // 这里模拟已认证的用户。实际服务从可信的登录身份取得这两个字段。
  const scope = { tenantId: 'demo', userId: 'alice' }
  // idempotencyKey 标识这份月报请求。以同一主体、类型和参数重试可取回同一个 ID。
  const submitted = await runner.submit({
    scope,
    kind: reportKind,
    idempotencyKey: 'report-2026-11',
    input: { month: '2026-11' },
  })
  if (!submitted.success)
    throw new Error(submitted.error.message)

  // 回执中的 id 用来继续查询。queued 表示已保存、等待领取。
  const { id, status } = submitted.data
  process.stdout.write(JSON.stringify({ id, status }) + '\n')

  const deadline = Date.now() + 5_000
  for (;;) {
    // 用原主体和回执 ID 查状态。success 表示查到了记录，status 才描述任务结果。
    const task = await runner.get(scope, id)
    if (!task.success)
      throw new Error(task.error.message)

    if (task.data.status === 'succeeded') {
      // 从序号 0 之后读取第一页。示例只发送一条事件，sequence 为 1。
      const events = await runner.events(scope, id, 0, 20)
      if (!events.success)
        throw new Error(events.error.message)
      process.stdout.write(JSON.stringify({
        id,
        status: task.data.status,
        output: task.data.output,
        events: events.data.map(({ sequence, data }) => ({ sequence, data })),
      }) + '\n')
      break
    }

    // queued 和 running 会继续等。其他状态结束本次查询并显示失败原因或状态。
    if (task.data.status !== 'queued' && task.data.status !== 'running')
      throw new Error(task.data.failure ?? task.data.status)
    if (Date.now() >= deadline)
      throw new Error('Timed out waiting for the report')
    await delay(50)
  }
}
finally {
  // Runner 关闭时停止领取、注销处理器并清理本地执行。清理确认后才关闭数据库。
  const closed = await runner.close()
  if (!closed.success) {
    process.stderr.write(closed.error.message + '\n')
    process.exitCode = 1
  }
  else {
    const released = await reldb.close()
    if (!released.success) {
      process.stderr.write(released.error.message + '\n')
      process.exitCode = 1
    }
  }
}
```

#### 4. 运行并核对输出

```sh
node report-demo.mjs
```

在启动日志之外会看到下面两行。两行的 `<ID>` 是同一个 64 位十六进制编号。第二行的 `output` 来自处理器的返回值，序号 1 的事件来自 `context.emit`。

```text
{"id":"<ID>","status":"queued"}
{"id":"<ID>","status":"succeeded","output":{"month":"2026-11","rows":120},"events":[{"sequence":1,"data":{"phase":"reading"}}]}
```

内存数据库随示例退出释放。要让另一个进程接手执行，或者在 API 重启后继续查询，按[两个节点的示例](#two-node-example)使用共享数据库。

<a id="api-reference"></a>

## 功能说明

<a id="nodes"></a>

### 启动节点和登记处理器

一个进程可同时提交和执行。需要独立扩缩容时，接收请求的进程设置 `executor: false`，执行进程登记处理器并领取任务。每个执行节点需要唯一且重启后稳定的 `nodeId`。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `runner.create()` | 建立独立生命周期的实例 | 无参数。实例共用进程内的 RelDB | `RunnerFunctions`，仍需调用 `init` | `const api = runner.create()` |
| `RunnerConfigSchema.safeParse(input)` | 校验宿主读取的配置 | 从 YAML 或程序取得的配置对象 | Zod 校验结果。成功的 `data` 含默认值，失败的 `error.issues` 指向字段 | `RunnerConfigSchema.safeParse({ nodeId: 'reports-api' })` |
| `runner.init(config)` | 初始化持久表和任务节点 | `config: RunnerConfigInput`。`nodeId` 必填，`executor` 默认为 `true`。完整字段见[配置清单](../configuration/runner.md#configuration-fields) | `Promise<HaiResult<void>>`。配置、数据库或重复启动错误时中止启动 | `await runner.init({ nodeId: 'reports-api', executor: false })` |
| `runner.isExecutor` | 确定本实例是否正在承担执行角色 | 只读属性 | `boolean`。未初始化、关闭中或仅提交时为 `false` | `const canExecute = runner.isExecutor` |
| `runner.register(kind, handler)` | 绑定一种任务与可信处理器 | `kind` 为 1–100 字符的任务类型。`handler(input, context)` 校验输入并异步返回 JSON | `HaiResult<() => void>`。执行节点遇到重复类型时返回 `CONFLICT`。成功的回调用于注销此次登记 | `runner.register('report.v1', async input => input)` |
| `runner.environment(id)` | 检查已配置的容器环境 | `id` 是配置中的环境 ID | `HaiResult<RunnerEnvironment>`。未登记时返回 `NOT_FOUND` | `runner.environment('alpine-offline')` |
| `context.emit(data)` | 在处理器中写入当前任务的进度 | `data: RunnerJson`。单条最多 512 KiB，且受事件条数和单任务累计 16 MiB 持久载荷限制 | `Promise<HaiResult<void>>`。成功后可按序列读取，失租、超期或超额时失败 | `await context.emit({ phase: 'reading' })` |
| `runner.close()` | 停止领取并等待本地任务释放资源 | 无参数。关闭期限由 `closeTimeoutMs` 控制 | `Promise<HaiResult<void>>`。清理无法确认时返回 `CLEANUP_UNCONFIRMED` | `await runner.close()` |

执行节点调用处理器时，`context.id` 是执行编号，`scope` 是原请求主体，`owner` 包含节点 ID 和进程启动代次，`parentId` 与 `locale` 来自提交记录。耗时查询或 I/O 应响应 `context.signal`。仅提交节点可以通过 `register` 完成相同的服务装配，但处理器只在执行节点生效。

<a id="two-node-example"></a>

#### 场景：把提交和执行分给两个节点

下面用两个终端模拟独立部署。API 节点接收请求并写入、查询共享 PostgreSQL。执行节点轮询同一个库，领取 `report.v1` 后调用月报处理器，再把结果和事件写回。两个进程通过数据库交换任务，无需互调 HTTP。

| 节点 | 启动方式 | 负责的操作 |
| --- | --- | --- |
| API 节点 `report-api` | 按请求运行的命令行程序，`executor: false` | `submit` 保存任务并拿到执行编号。另一次 `status` 命令用同一主体和编号调用 `get`、`events` |
| 执行节点 `report-worker` | 常驻进程，`executor: true` | 用 `register` 登记 `report.v1`，从同一库领取任务并执行处理器 |

本例里一次任务经过以下三步。箭头表示读写共享库的方向。

```text
API submit → PostgreSQL   保存报表请求，返回 ID
Worker     ↔ PostgreSQL   领取该 ID，写入进度和结果
API status ← PostgreSQL   按原主体和 ID 读取进度和结果
```

**1. 准备共享库。** 两个终端进入最小示例的项目目录，沿用已经安装的包和 `report.mjs`。准备一个可访问的 PostgreSQL 数据库，给连接账号授予在目标 schema 创建表和索引、读写记录的权限。把实际连接参数写进本地的 `.env.local`，并将这个文件排除在版本控制之外。若部署在不同机器，两边都要使用可达的数据库地址，以及同一数据库和 schema。

```dotenv
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=runner_demo
PGUSER=runner_demo
PGPASSWORD=填入数据库密码
```

保存 `report-db.mjs`。两个脚本从这里打开同一份数据库配置。关闭时先等 Runner 停止领取并完成本地清理，成功后再释放数据库连接。

```js
import { reldb } from '@h-ai/reldb'
import { runner } from '@h-ai/runner'

export async function openReportDatabase() {
  // 从两个进程共用的环境文件读取连接参数。
  const { PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } = process.env
  if (!PGHOST || !PGDATABASE || !PGUSER)
    throw new Error('Set PGHOST, PGDATABASE and PGUSER before starting')

  // RelDB 验证连接。连接失败时两个脚本都不会调用 runner.init。
  const opened = await reldb.init({
    type: 'postgresql',
    host: PGHOST,
    port: Number(PGPORT ?? '5432'),
    database: PGDATABASE,
    user: PGUSER,
    password: PGPASSWORD,
  })
  if (!opened.success)
    throw new Error(opened.error.message)
}

export async function closeReportNode() {
  // close 可能返回清理未确认。此时保留 RelDB，交由调用方报告并决定何时重试。
  const stopped = await runner.close()
  if (!stopped.success)
    return stopped

  // Runner 已停止使用数据库。数据库关闭失败时报告该错误。
  const released = await reldb.close()
  if (!released.success)
    throw new Error(released.error.message)
  return stopped
}
```

**2. 保存执行端 `report-worker.mjs`。** 它只需要知道任务类型和处理器。命令启动后，看到 `report-worker ready for report.v1` 就可以在另一个终端提交。

```js
import { setTimeout as delay } from 'node:timers/promises'
import { runner } from '@h-ai/runner'
import { closeReportNode, openReportDatabase } from './report-db.mjs'
import { buildReport, reportKind } from './report.mjs'

await openReportDatabase()
let stopping = false
const requestStop = () => { stopping = true }
process.on('SIGINT', requestStop)
process.on('SIGTERM', requestStop)

try {
  // 为这个执行节点指定稳定 ID。启动失败时不登记处理器，也不显示 ready。
  const started = await runner.init({ nodeId: 'report-worker', executor: true })
  if (!started.success)
    throw new Error(started.error.message)

  // 只有 kind 匹配 report.v1 的任务才会交给这个处理器。
  const registered = runner.register(reportKind, buildReport)
  if (!registered.success)
    throw new Error(registered.error.message)
  process.stdout.write('report-worker ready for report.v1\n')

  for (;;) {
    // Runner 的轮询定时器本身不会让 Node.js 常驻。这里用普通定时器维持独立进程。
    while (!stopping)
      await delay(100)

    // Ctrl+C 或 SIGTERM 请求关闭。清理未确认时保留进程和连接，等待再次发信号。
    stopping = false
    const closed = await closeReportNode()
    if (closed.success)
      break
    process.stderr.write(closed.error.message + '\n')
  }
}
catch (error) {
  // 启动或运行失败也会尝试释放资源，然后把原错误交给 Node.js。
  const closed = await closeReportNode()
  if (!closed.success)
    process.stderr.write(closed.error.message + '\n')
  throw error
}
finally {
  process.off('SIGINT', requestStop)
  process.off('SIGTERM', requestStop)
}
```

**3. 保存提交端 `report-api.mjs`。** `submit` 将一份月报写入共享库后退出。之后用 `status <ID>` 从新的进程查询。示例里的 `scope` 是固定测试身份，两个命令都用这份身份读写任务。

```js
import { runner } from '@h-ai/runner'
import { closeReportNode, openReportDatabase } from './report-db.mjs'
import { reportKind } from './report.mjs'

const [command, id = ''] = process.argv.slice(2)
if (command !== 'submit' && (command !== 'status' || !id))
  throw new Error('Usage: report-api.mjs submit | status <ID>')

await openReportDatabase()
try {
  // 只开启提交、查询等 API。即使队列中有任务，这个进程也不会领取。
  const started = await runner.init({ nodeId: 'report-api', executor: false })
  if (!started.success)
    throw new Error(started.error.message)

  const scope = { tenantId: 'demo', userId: 'alice' }
  if (command === 'submit') {
    // kind 由 reportKind 传给执行端匹配。重复执行此命令可取回同一个 ID。
    const submitted = await runner.submit({
      scope,
      kind: reportKind,
      idempotencyKey: 'report-2026-11',
      input: { month: '2026-11' },
    })
    if (!submitted.success)
      throw new Error(submitted.error.message)
    process.stdout.write(JSON.stringify({ id: submitted.data.id, status: submitted.data.status }) + '\n')
  }
  else {
    // 用原主体和命令行的 ID 查当前状态。成功读到记录后，仍需根据 status 判断结果。
    const task = await runner.get(scope, id)
    if (!task.success)
      throw new Error(task.error.message)

    // 读取任务持久事件。任务还在排队时，这里是空列表。
    const events = await runner.events(scope, id, 0, 20)
    if (!events.success)
      throw new Error(events.error.message)
    process.stdout.write(JSON.stringify({
      id,
      status: task.data.status,
      owner: task.data.owner?.nodeId,
      output: task.data.output,
      failure: task.data.failure,
      events: events.data.map(({ sequence, data }) => ({ sequence, data })),
    }) + '\n')
  }
}
finally {
  // 关闭这个 API 进程的 Runner 和 RelDB。已提交的任务仍留在共享库里。
  const closed = await closeReportNode()
  if (!closed.success)
    throw new Error(closed.error.message)
}
```

**4. 从提交到结果走一遍。** 在新准备的库里，先不启动执行节点。在终端 A 提交任务并复制回执里的 `id`。以下命令里的 `<ID>` 都替换为这个值。

```sh
node --env-file=.env.local report-api.mjs submit
node --env-file=.env.local report-api.mjs status "<ID>"
```

提交命令输出 `{"id":"<ID>","status":"queued"}`。它退出后，查询命令仍能读到 `queued` 和 `events: []`，表示任务已在 PostgreSQL 中等待领取。

在终端 B 启动执行节点，并让它保持运行。

```sh
node --env-file=.env.local report-worker.mjs
```

看到 `report-worker ready for report.v1` 后，回到终端 A 查同一个 ID。若看到 `queued` 或 `running`，稍后再执行一次查询。

```sh
node --env-file=.env.local report-api.mjs status "<ID>"
```

```text
{"id":"<ID>","status":"succeeded","owner":"report-worker","output":{"month":"2026-11","rows":120},"events":[{"sequence":1,"data":{"phase":"reading"}}]}
```

`owner` 确认是终端 B 的节点执行了报表。再次运行 `submit` 会返回原 ID 和当前状态。等任务成功后，按 Ctrl+C 停止终端 B，再在终端 A 执行同一条查询，结果仍在。关闭执行端时，Runner 会通知该节点上仍在运行的处理器取消。若任务持续排队，先核对两个进程是否连接同一个库和 schema，再核对执行端是否已就绪、登记的 `kind` 是否与提交一致。

接到 Web API 时，可以把这两个命令映射到 `POST /reports` 和 `GET /reports/{id}`。创建接口从已认证身份取得 `scope`，将请求中的报表月份放入 `input`，成功提交后返回 HTTP 202 和 `{ id, status }`。查询接口从当前认证身份重新取得 `scope`，用路径中的 `id` 查询状态和事件。执行端沿用同样的常驻脚本，通过 PostgreSQL 领取任务。

<a id="tasks"></a>
<a id="恢复任务读取事件和取消"></a>

### 提交任务、续读进度与取消

把回执中的执行编号随业务记录保存。客户端断开后，服务端可用业务幂等键找回原编号，再按同一主体读取状态和事件。

<a id="task-kinds"></a>

#### 先分清任务类型和任务用途

首次受理时，`submit` 为任务创建执行记录。先选 `kind`，它决定哪个处理器运行，例如 `report.v1` 对应生成月报。再看这份工作需要使用哪份并发额度，或是否必须回到一个仍在运行的进程。

| 文档里的说法 | 提交时怎么写 | 什么时候用 |
| --- | --- | --- |
| 普通任务 | 省略 `capacityClass` 和 `parentId` | 独立生成报表、导出文件等。匹配的执行节点使用普通额度领取 |
| 父任务 | 按原用途提交，保留回执的 `id` | 它持有一个仍在运行的连接或进程。另一条任务用它的 `id` 当 `parentId` 时，它就是父任务 |
| 控制子任务 | 传入同一主体下正在运行的 `parentId`，沿用默认 `capacityClass` | 给原进程里的活动会话发消息。由父任务的同一节点、同一次进程启动来执行，有独立回执，受 `maxControlRunning` 限制 |
| 工具任务 | 可信服务传 `capacityClass: 'tool'` | 给频繁执行的工具单独预留并发和资源，避免报表等普通任务占满它的额度。使用 `toolMaxRunning` 和 `toolCapacity` |

容器是另外一项选择。需要隔离进程时传 `environmentId`，普通任务也可以使用容器。只想查进度或取消整条执行时，用 `get`、`events` 或 `cancel`，见下表。

如果业务入口已经使用 Tools 的目录和授权，可用 [Tools Runner](tools-runner.md) 提交持久任务，并继续使用 Runner 的队列、容器与额度。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `runner.submit(request)` | 持久接收工作 | `request: RunnerSubmit`。必填 `scope`、`kind`、`input`，其他字段见下表 | `Promise<HaiResult<RunnerExecution>>`。新任务为 `queued`，同键重试可返回原任务状态 | `await runner.submit({ scope, kind: 'report.v1', input: { month: '2026-11' } })` |
| `runner.find(scope, kind, key)` | 用业务幂等键找回执行编号 | `scope: RunnerScope`、`kind: string` 和首次提交的 `idempotencyKey` | `Promise<HaiResult<RunnerExecution \| undefined>>`。空结果可能是记录尚未建立或已经清理 | `await runner.find(scope, 'report.v1', 'report-2026-11')` |
| `runner.get(scope, id)` | 查当前状态与输出 | 原任务主体及回执里的 64 位十六进制执行编号 | `Promise<HaiResult<RunnerExecution>>`。查不到属于当前主体的记录时返回 `NOT_FOUND` | `await runner.get(scope, id)` |
| `runner.events(scope, id, after?, limit?)` | 续读任务的持久事件 | 主体和执行编号。`after` 是默认 0 的非负安全整数，只读其后的事件。`limit` 默认为 100，范围 1–100 | `Promise<HaiResult<RunnerEvent[]>>`。成功的空页表示目前没有更多事件 | `await runner.events(scope, id, 1, 20)` |
| `runner.cancel(scope, id)` | 持久记录取消请求 | 原主体和执行编号 | `Promise<HaiResult<RunnerExecution>>`。排队可直接变为 `cancelled`，已在运行通常先返回 `cancelling` | `await runner.cancel(scope, id)` |

##### 提交字段

| 字段 | 必填、默认值及作用 |
| --- | --- |
| `scope` | 必填 `{ tenantId, userId }`。两个 ID 均为 1–200 字符，由服务端从可信身份取得，每次查询和取消都要复核权限 |
| `kind` | 必填，1–100 字符，可使用英数字、下划线、点和连字符。执行节点按该字符串匹配处理器 |
| `input` | 必填 JSON。无业务输入时传 `null`。整份提交参数最多 512 KiB，成功的业务输出也最多 512 KiB |
| `idempotencyKey` | 可选，1–200 字符。同主体、类型和键重复提交同一请求时返回同一执行编号，变更业务输入等身份字段时返回 `CONFLICT` |
| `reuseKey` | 可选，1–200 字符。可信服务可用它复用已有占位。提交成功时也会记录同时提供的新幂等键。未核验的 `unknown` 可继续占用复用键 |
| `locale` | 可选语言标签，1–64 字符，首段为英文字母，后续段用连字符分隔，可含英数字。处理器通过 `context.locale` 读取。重试沿用首次记录的语言 |
| `environmentId` | 可选容器环境 ID。省略时只运行宿主处理器。指定时须在 API 和执行节点登记相同的环境 |
| `resources` | 可选，覆盖 `cpu`、`memoryMiB`、`pids`、`scratchMiB` 中的指定项。有容器环境时以该环境为基准，覆盖不能超过环境上限，PID 至少为 2。宿主任务的资源用于调度核算，传此项时未填项使用 1 CPU、64 MiB 内存、16 PID 和 16 MiB 临时空间 |
| `nodeId` | 可选，要求指定节点领取。省略时任何匹配条件的节点都可领取 |
| `parentId` | 可选，用同主体下运行中的执行编号提交控制子任务，固定由父任务的节点和代次处理。此时容量类别用 `default`，省略 `nodeId`、`environmentId`、`resources`、`reuseKey` 和 `concurrency` |
| `capacityClass` | 可选，默认为 `default`。可信服务可用 `tool`，使用单独的执行并发和资源额度 |
| `concurrency` | 可选 `{ key, limit }`。同任务类型和键共享跨节点并发限额，`limit` 为 1–1000 整数，运行中有不同上限时取更小者 |
| `warmPool` | 可选，只接受 `true`。须使用 `tool`，并匹配已登记池的环境、任务类型和并发设置。省略单任务资源覆盖 |
| `queueTimeoutMs`、`runTimeoutMs` | 可选，分别从持久入队和领取开始计算。单位毫秒，范围 1–86400000，各默认 300000 |

#### 场景：请求重连后续读同一份月报

假设调用方保存了月报请求的幂等键，上次连接断开前还没有读到事件。提交过示例月报后，在连接同一数据库的已初始化 API 节点上运行下面的代码。实际服务从已认证身份取得 `scope`，把最后收到的事件序号保存在调用方；示例使用固定测试身份。

```ts
import { runner, type RunnerScope } from '@h-ai/runner'

async function resumeReport(scope: RunnerScope, after = 0) {
  // 按首次提交的 scope、kind 和幂等键找回 ID。data 为空表示当前没有可恢复的记录。
  const found = await runner.find(scope, 'report.v1', 'report-2026-11')
  if (!found.success)
    throw new Error(found.error.message)
  if (!found.data)
    return undefined

  // 只读 after 之后的事件，每页最多 20 条。空页时沿用原游标。
  const latest = await runner.events(scope, found.data.id, after, 20)
  if (!latest.success)
    throw new Error(latest.error.message)
  return {
    id: found.data.id,
    status: found.data.status,
    output: found.data.output,
    events: latest.data.map(({ sequence, data }) => ({ sequence, data })),
    after: latest.data.at(-1)?.sequence ?? after,
  }
}

const scope = { tenantId: 'demo', userId: 'alice' }
// 首次读取传 0。若示例月报已完成，本页含 reading 事件和月报输出。
const firstPage = await resumeReport(scope, 0)
if (firstPage) {
  process.stdout.write(JSON.stringify(firstPage) + '\n')
  // 重连时传上一页的 after。示例只发送了一条事件，因此第二页为空。
  const nextPage = await resumeReport(scope, firstPage.after)
  process.stdout.write(JSON.stringify(nextPage) + '\n')
}
```

例子中 `firstPage.after` 为 `1`，`events` 包含 `{"sequence":1,"data":{"phase":"reading"}}`。第二次查询返回 `events: []`，游标仍是 `1`。找不到记录时，可先核对是否用了原身份、类型和键，再检查记录是否已过保留期。已清理的键可重新受理，更长的业务去重周期由应用保存。

如果报表请求必须先保存业务记录，先提交业务事务，再以该记录的稳定 ID 作为 `idempotencyKey` 调用 Runner。投递中断时，应用可以扫描已保存但未关联执行编号的记录，用同一键补投。发布报表时仍由业务系统校验归属和重复写入。

#### 场景：撤回尚未处理的报表预览

在已初始化的 API 节点上运行下面的代码。示例的执行节点只登记了 `report.v1`，因此没有节点会领取 `report.preview.v1`。生产中可用相同的取消接口撤回正在排队或运行的任务。

```ts
import { runner, type RunnerScope } from '@h-ai/runner'

async function cancelPreview(scope: RunnerScope) {
  // 保存一个当前没有处理器领取的预览任务。失败时没有用于取消的回执。
  const preview = await runner.submit({
    scope,
    kind: 'report.preview.v1',
    input: { month: '2026-11' },
  })
  if (!preview.success)
    return preview
  // 用原主体及回执编号取消。此示例预期得到 cancelled。
  const requested = await runner.cancel(scope, preview.data.id)
  if (!requested.success)
    return requested
  // 读取数据库当前状态。若实际已开始执行，继续查询至终态。
  return await runner.get(scope, preview.data.id)
}

const scope = { tenantId: 'demo', userId: 'alice' }
const result = await cancelPreview(scope)
if (!result.success)
  throw new Error(result.error.message)
process.stdout.write(JSON.stringify({ id: result.data.id, status: result.data.status }) + '\n')
```

下图描述同一任务在共享数据库中的状态。`queued` 只确认已受理。`cancelling` 表示执行者还在处理停止请求。任务可能因失租或清理无法确认进入 `unknown`，此时外部结果和占用都需要核对。

![Runner 任务从持久排队到领取、停止和人工核验的状态流程](../images/function-runner-states.svg)

报表预览沿 `queued → cancelled` 结束。对正在运行的任务，收到 `cancelling` 后再次调用查询接口，直到获得 `cancelled`、其他终态或 `unknown`。字段、终态含义及保留期见[执行记录](../data/runner.md#table-hai-runner-executions)。

<a id="场景把控制请求交给父任务的执行节点"></a>
<a id="把控制请求交给父任务的执行节点"></a>
<a id="parent-control"></a>

#### 场景：给正在运行的会话发送下一条消息

用户发来下一条消息时，接收请求的 API 进程可能变了。原来与智能体或其他交互程序建立的连接，仍只存在于启动它的执行进程。Runner 使用 `parentId` 把消息送到手里有这条连接的进程。即使节点名相同，重启后的进程也不能接手旧连接。Hai 的托管 ACP 就这样把提示词和会话关闭请求送到原会话进程。 [受管 ACP 的会话接入](../development/ai-acp.md)

| 谁做 | 具体操作 |
| --- | --- |
| 原执行进程 | 父任务打开会话连接，在进程内用 `context.id` 登记，并在父任务结束时移除。每条发给该连接的消息由相同执行进程处理 |
| API 进程 | 从业务会话记录找到父任务回执的 `id`，使用与父任务相同的授权主体，提交消息任务。保存新回执的 `id` 用于查询这一条消息的结果 |

下面演示已经有会话连接的应用如何接入。执行进程先在 `runner.init` 后调用 `registerSessionMessages(connections)`。父任务握手成功后用 `connections.set(context.id, connection)` 保存连接，再用一条进度事件通知 API 可以接收消息，在 `finally` 删除连接。这里的 `connection.send` 由应用的会话协议实现，接收消息并返回答复。

```ts
import { runner } from '@h-ai/runner'

type SessionConnection = { send: (message: string, signal: AbortSignal) => Promise<string> }

function registerSessionMessages(connections: ReadonlyMap<string, SessionConnection>) {
  // 登记接收消息的处理器。只在父任务所在的执行进程取出连接。
  const registered = runner.register('session.message.v1', async (input, context) => {
    if (typeof input !== 'string' || !context.parentId)
      throw new Error('Expected a message and a parent execution')
    const connection = connections.get(context.parentId)
    if (!connection)
      throw new Error('Session connection is closed')

    // 让会话协议处理好取消。返回的回复成为这个子任务的输出。
    const reply = await connection.send(input, context.signal)
    return { reply }
  })
  if (!registered.success)
    throw new Error(registered.error.message)
  return registered.data
}
```

API 进程调用下面的提交函数。它使用业务会话记录中的父任务 ID，而后续查询使用这次提交返回的新 ID。

```ts
import { runner, type RunnerScope } from '@h-ai/runner'

async function submitSessionMessage(scope: RunnerScope, parentId: string, message: string) {
  // 把消息交给正在运行的原进程。父任务已经结束时，返回 CONFLICT。
  const submitted = await runner.submit({ scope, parentId, kind: 'session.message.v1', input: message })
  if (!submitted.success)
    throw new Error(submitted.error.message)

  // 回执中的 ID 属于这一条消息。父任务 ID 继续标识原会话。
  return submitted.data.id
}
```

例如发送 `next`，如果会话回复 `ready`，用新回执的 ID 调用 `runner.get` 会在子任务成功后得到 `output: { reply: 'ready' }`。父任务已结束时，提交会返回 `CONFLICT`。如果它在子任务排队期间结束，子任务会被取消，`failure` 为 `parent-ended`。只需要显示数据库里的进度时，直接调用 `events`。需要停止整个父任务时，直接取消父任务 ID。

<a id="containers"></a>

### 在隔离容器中运行任务

提交端在 `runner.submit` 中通过 `environmentId` 选择配置好的环境。执行端的处理器用 `context.start({ command, args })` 启动命令，得到一个可以读写的 `child` 句柄。命令由可信处理器选择。容器默认离线，根文件系统只读，以 UID/GID 1000 运行。[容器配置示例](../configuration/runner.md#container-example)

| 想取得什么 | 在执行端调用什么 | 提交端怎么看结果 |
| --- | --- | --- |
| 命令打印的一段文字 | 读 `child.stdout`，检查退出码，然后返回 JSON | 用 `runner.get` 读 `output` |
| 程序生成的一份文件 | 让程序写到 `/output`，退出前用 `child.artifact` 取文件 | 可以返回短文本，或把大文件存到授权存储并返回引用 |
| 脚本修改的多个文件 | 用 `workspace` 初始化，再在程序退出前用 `child.snapshot` 抓取工作区 | 只读到处理器最终返回的内容或引用 |

`child.wait()` 告诉你程序怎样退出。`child.close()` 停止容器并清理暂存，所以示例在 `finally` 调用它。标准流和文件由处理器显式读取。需要断线后续读的进度点，再用 `context.emit` 保存。[流式数据如何保存](../data/runner.md#ai-sse)

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `context.start(launch)` | 启动已分配环境的单个进程 | `launch: RunnerLaunch`，每个任务最多启动一次。字段见下表 | `Promise<HaiResult<RunnerProcess>>`。未分配环境、参数错误、失租或引擎启动失败时返回失败 | `await context.start({ command: '/bin/sh', args: ['-c', 'printf ready'] })` |
| `child.stdin`、`child.stdout`、`child.stderr` | 读写容器标准流 | 返回的句柄提供 Node.js 流 | `Writable`、`Readable` 和 `Readable` | `child.stdin.end()`、`child.stderr.resume()` |
| `child.wait()` | 等待附着的进程退出 | 无参数 | `Promise<{ code, signal }>`。检查退出码，`0` 表示正常退出 | `const exit = await child.wait()` |
| `child.artifact(name, maxBytes)` | 读取运行中容器里的一份产物 | `name` 为 `/output` 中的平铺文件名，`maxBytes` 为 1 字节到 50 MiB 的整数 | `Promise<HaiResult<string>>`。成功返回 Base64。容器退出、文件非普通文件或超限时失败 | `await child.artifact('report.txt', 64)` |
| `child.snapshot(maxBytes)` | 捕获运行中容器的可写工作区 | `maxBytes` 为大于 0 且在工作区预算内的整数。启动时须提供 `workspace`，镜像须有 Node.js | `Promise<HaiResult<Record<string, string>>>`。成功返回相对路径到 Base64 内容的映射 | `await child.snapshot(1024 * 1024)` |
| `child.close()` | 移除容器并清理本地暂存 | 无参数 | `Promise<HaiResult<void>>`。释放未确认时返回 `CLEANUP_UNCONFIRMED`，可以重试 | `await child.close()` |

<a id="启动和预热字段"></a>

##### 容器启动字段

| 字段 | 必填、默认值及作用 |
| --- | --- |
| `command`、`args` | `command` 必填，不能为空或以连字符起始。`args` 默认空数组，最多 128 项。不需要 shell 时直接传命令和参数 |
| `cwd` | 默认为 `/workspace`。可设置为其规范子目录 |
| `env`、`files` | 默认为空对象。`env` 最多 128 个条目并只传给容器进程。`files` 最多 32 个平铺文本文件，启动时复制到 `/state` |
| `inputs` | 可选，最多 8 个平铺 Base64 文件，在 `/input` 中只读。指定空对象也会分配 `/input` 和 `/output`。输入总字节不能超过 50 MiB 与 `scratchMiB` 换算字节数的较小值。带输入的启动和预热需要至少 4 MiB 临时空间 |
| `workspace`、`workspaceExecutables` | 可选冷启动设置。普通文件按相对 POSIX 路径和 Base64 内容初始化私有工作区，最多 512 个文件和 50 MiB，且受工作区配额限制。可执行路径须唯一且存在于该映射。快照返回文件内容 |

##### 场景准备

先按[容器配置示例](../configuration/runner.md#container-example)设置容器引擎及环境 ID，再用该配置初始化 Runner。将下面的处理器登记代码放在执行节点的 `runner.init` 成功之后。用同一进程测试时可以紧接着提交任务。分开部署时，提交代码放在 API 节点，并在两个节点配置相同的任务环境。

`alpine-offline` 用于标准流例子，`python-offline` 的镜像须包含 `/usr/bin/python3` 供产物读取和预热使用，`node-offline` 的镜像须包含 `node` 供快照使用。真实文件由宿主授权，处理器按 `context.scope` 复核，再将产物存到宿主选定的存储。

<a id="container-command-example"></a>

#### 场景：运行固定命令并读取标准输出

执行端先登记 `alpine-offline` 环境和下面的处理器。它把命令的标准输出整理成 `{ text }`，提交端用回执读这段 JSON。

```ts
import { runner } from '@h-ai/runner'

function registerContainerReport() {
  // 连接启动配置与任务类型。环境未登记时返回失败。
  const environment = runner.environment('alpine-offline')
  if (!environment.success)
    return environment

  // 注册固定命令的处理器。成功返回注销函数。
  return runner.register('report.banner.v1', async (_input, context) => {
    // 在此任务分配的镜像里输出一行文字。启动失败时没有标准流可读。
    const launched = await context.start({ command: '/bin/sh', args: ['-c', 'printf report-ready'] })
    if (!launched.success)
      throw new Error(launched.error.message)
    const child = launched.data
    child.stdin.end()
    child.stderr.resume()
    try {
      let text = ''
      for await (const chunk of child.stdout)
        text += String(chunk)
      // 结合标准输出和退出码判断命令是否完成。
      const exit = await child.wait()
      if (exit.code !== 0)
        throw new Error('Report command failed')
      return { text }
    }
    finally {
      // 核验容器及暂存清理。无法确认时保留错误，Runner 会再次检查。
      const stopped = await child.close()
      if (!stopped.success)
        throw new Error(stopped.error.message)
    }
  })
}

const registered = registerContainerReport()
if (!registered.success)
  throw new Error(registered.error.message)
```

在已初始化的提交端提交任务。这里使用最小示例的主体；在同一进程测试时，若前面已声明 `scope`，直接沿用它。

```ts
import { runner } from '@h-ai/runner'

const scope = { tenantId: 'demo', userId: 'alice' }
// 选择已登记的环境和任务类型；拿到 ID 后可用 status 示例查询执行结果。
const submitted = await runner.submit({
  scope,
  kind: 'report.banner.v1',
  environmentId: 'alpine-offline',
  input: null,
})
if (!submitted.success)
  throw new Error(submitted.error.message)
process.stdout.write(JSON.stringify({ id: submitted.data.id, status: submitted.data.status }) + '\n')
```

用回执 ID 和原主体查询。成功输出为 `{"text":"report-ready"}`。没有符合任务类型、环境配置或资源要求的节点时，任务会保持排队。符合配置的节点领取后，若本地镜像缺失，处理器会在 `context.start` 处遇到启动失败。

<a id="artifact-example"></a>

#### 场景：从容器取回一份报表产物

提交端选 `python-offline`。执行端把源文件放入 `/input`，让命令生成 `/output/report.txt`。命令输出 `ready` 后停在 `read`，处理器趁容器还在运行时读文件，再关掉输入流让命令退出。下面的代码登记在执行端。

```ts
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { runner } from '@h-ai/runner'

// 为演示登记固定的文件复制任务。实际服务应在这里按主体解析授权文件。
const copy = runner.register('report.copy.v1', async (_input, context) => {
  // 将脱敏样例作为只读输入，复制后发出就绪信号，再等待输入流关闭。
  const launched = await context.start({
    command: '/bin/sh',
    args: ['-ec', 'cat /input/source.txt > /output/report.txt\nprintf ready\nread -r done || true'],
    inputs: { 'source.txt': Buffer.from('example report').toString('base64') },
  })
  if (!launched.success)
    throw new Error(launched.error.message)
  const child = launched.data
  child.stderr.resume()
  try {
    const ready = once(child.stdout, 'data', { signal: context.signal })
    child.stdout.resume()
    // 等待就绪或提前退出。命令若还没生成文件就退出，立即报告退出状态。
    await Promise.race([
      ready,
      child.wait().then(({ code, signal }) => { throw new Error(`Copy exited before ready: ${code ?? signal}`) }),
    ])
    // 在进程退出前读取已生成的文件，最多 64 字节。
    const file = await child.artifact('report.txt', 64)
    if (!file.success)
      throw new Error(file.error.message)
    child.stdin.end()
    // 等待命令结束。非零退出码作为处理器失败报告。
    const exit = await child.wait()
    if (exit.code !== 0)
      throw new Error('Copy failed')
    return { text: Buffer.from(file.data, 'base64').toString('utf8') }
  }
  finally {
    // 停止容器并删除暂存，清理失败时保留核验证据。
    const stopped = await child.close()
    if (!stopped.success)
      throw new Error(stopped.error.message)
  }
})
if (!copy.success)
  throw new Error(copy.error.message)
```

沿用上一个场景的提交代码，把 `kind` 改为 `report.copy.v1`、`environmentId` 改为 `python-offline`，并保留 `input: null`。拿到回执后按编号查询。成功输出 `{"text":"example report"}`。生产中通常只返回已获授权的产物引用。

<a id="snapshot-example"></a>

#### 场景：运行项目脚本并检查工作区

提交端选 `node-offline`。执行端把脚本放进私有 `/workspace` 并运行。脚本结束后，容器内的 shell 仍在 `read` 等待，处理器此时才能抓取工作区快照。先在执行端登记下面的处理器。

```ts
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { runner } from '@h-ai/runner'

// 登记冷容器检查。由宿主选择要执行的脚本，注册失败则不上线该任务类型。
const registered = runner.register('report.inspect.v1', async (_input, context) => {
  // 用工作区种子启动脚本，生成 report.txt 后保持进程存活供快照。
  const launched = await context.start({
    command: '/bin/sh',
    args: ['-ec', './scripts/check.sh\nread -r done || true'],
    workspace: {
      'scripts/check.sh': Buffer.from('#!/bin/sh\nprintf checked > report.txt\nprintf ready\n').toString('base64'),
    },
    workspaceExecutables: ['scripts/check.sh'],
  })
  if (!launched.success)
    throw new Error(launched.error.message)
  const child = launched.data
  child.stderr.resume()
  try {
    const ready = once(child.stdout, 'data', { signal: context.signal })
    child.stdout.resume()
    // 等待脚本就绪，同时处理未输出就绪信号便退出的情况。
    await Promise.race([
      ready,
      child.wait().then(({ code, signal }) => { throw new Error(`Workspace check exited before ready: ${code ?? signal}`) }),
    ])
    // 从正运行的 Node 镜像抓取限额内的相对文件路径和 Base64 内容。
    const files = await child.snapshot(1024 * 1024)
    if (!files.success)
      throw new Error(files.error.message)
    const report = files.data['report.txt']
    if (!report)
      throw new Error('Missing report.txt')
    child.stdin.end()
    // 核对容器正常退出后再返回从快照读取的文本。
    const exit = await child.wait()
    if (exit.code !== 0)
      throw new Error('Workspace check failed')
    return { text: Buffer.from(report, 'base64').toString('utf8') }
  }
  finally {
    // 清理本次运行使用的容器和暂存目录。
    const stopped = await child.close()
    if (!stopped.success)
      throw new Error(stopped.error.message)
  }
})
if (!registered.success)
  throw new Error(registered.error.message)
```

沿用[固定命令场景](#container-command-example)的提交代码，把 `kind` 改为 `report.inspect.v1`、`environmentId` 改为 `node-offline`，并保留 `input: null`。按回执编号查询。成功输出 `{"text":"checked"}`。工作区文件随容器移除，快照中只保留调用方已读取的文件内容。

<a id="warm-pool"></a>

### 给频繁运行的工具预先启动容器

报表复制工具频繁提交时，可以提前启动一个空容器。匹配的任务到来后，执行节点才写入这一次的输入并把容器交给处理器。每个预热容器只分给一个任务，随后回收。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `runner.registerWarmPool(pool)` | 登记一次性预热容器池 | `pool: RunnerWarmPool`。执行节点先登记处理器，环境须为离线且配额能分配输入输出 | `HaiResult<() => void>`。成功返回注销函数，注销回收未转交的本地容器 | `runner.registerWarmPool({ key: 'report-copy', kind: 'report.copy.v1', environmentId: 'python-offline', minReady: 1, maxRunning: 2, maxTotal: 3 })` |

##### 预热池字段

| 字段 | 必填、默认值及作用 |
| --- | --- |
| `pool.key`、`pool.kind`、`pool.environmentId` | 必填池键、任务类型和离线环境 ID。API 与执行节点登记同一环境及容量边界 |
| `pool.minReady`、`pool.maxRunning`、`pool.maxTotal` | 必填整数。就绪目标范围 0–1000，运行上限和总上限范围 1–1000，前两者不能超过总上限。总数包括启动、就绪、运行、清理中和未核验的占用 |

#### 场景：为重复运行的复制任务准备预热池

继续使用[读取报表产物的处理器](#artifact-example)。执行端须先登记 `report.copy.v1`。执行端和提交端都登记下面的池，使用相同的池键、任务种类、环境和并发边界。只有执行端会准备和领取容器。复制处理器仍使用 `inputs`、默认工作目录、空的 `env` 和 `files`，且不传工作区种子。[工具额度配置](../configuration/runner.md#tool-capacity-example)

```ts
import { runner } from '@h-ai/runner'

// 登记 Python 环境的一次性预热目标。失败时不提交带 warmPool 的任务。
const pool = runner.registerWarmPool({
  key: 'report-copy',
  kind: 'report.copy.v1',
  environmentId: 'python-offline',
  minReady: 1,
  maxRunning: 2,
  maxTotal: 3,
})
if (!pool.success)
  throw new Error(pool.error.message)
```

执行端到登记池为止。提交端接着用工具类别和同一个池键提交，`concurrency.limit` 要与池的 `maxRunning` 对齐。

```ts
import { runner, type RunnerScope } from '@h-ai/runner'

async function queueCopy(scope: RunnerScope) {
  // 使用与池匹配的并发键和上限。受理后得到回执，由执行节点调度容器。
  return await runner.submit({
    scope,
    kind: 'report.copy.v1',
    environmentId: 'python-offline',
    capacityClass: 'tool',
    concurrency: { key: 'report-copy', limit: 2 },
    warmPool: true,
    input: null,
  })
}

const submitted = await queueCopy({ tenantId: 'demo', userId: 'alice' })
if (!submitted.success)
  throw new Error(submitted.error.message)
process.stdout.write(JSON.stringify({ id: submitted.data.id, status: submitted.data.status }) + '\n')
```

用回执编号查询复制任务。成功输出为 `{"text":"example report"}`。此池的就绪目标为 1，活动任务最多 2 个，总占用不超过 3。没有兼容的预热容器时，调度器可在额度允许的情况下冷启动，并产生相同结果。`minReady` 只控制就绪数量，调整它后旧任务仍可领取。停止接受这类任务时调用登记结果的 `pool.data()`，回收本节点未转交的预热容器。已经交给处理器的任务继续结算。

<a id="reconciliation"></a>

### 在原执行节点核验未知任务

任务显示 `unknown` 时，运维要查两件事。先确认业务系统是否已写入或发布报表，以决定要不要补跑。再确认原节点的进程和暂存是否已清理，以决定能不能释放 Runner 额度。`reconcileUnknown` 负责第二件事。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `runner.reconcileUnknown(scope, id, review)` | 原执行节点记录资源清理核验 | 原任务主体和执行编号，`review: RunnerReconciliation` 包含可信操作员和工单原因 | `Promise<HaiResult<RunnerExecution>>`。成功后仍为 `unknown`，写入 `reconciledAt` 并释放占用。证据不足或仍在清理时失败 | `await runner.reconcileUnknown(scope, id, { operatorId: 'ops-1', reason: 'INC-47 container removed' })` |

##### 核验字段与实际依据

| 字段 | 作用 |
| --- | --- |
| `operatorId` | 必填，来自已授权的运维入口。使用 1–100 字符的标识符 |
| `reason` | 必填，去首尾空白后须非空，最多 300 字符。写明工单和核对依据，不含换行或空字符 |
| `hostResourcesStopped` | 可选，只接受 `true`。用于确认宿主处理器已停止其资源，或在缺完整容器 ID 时确认原引擎的创建尝试已经收尾 |

- 有可信完整容器 ID 时，在原节点先确认容器已停止并移除。Runner 复核原引擎和容器身份，再检查并清理暂存。
- 缺完整 ID 时，Runner 查已登记的创建尝试及可信暂存回执。如果仍没有 ID，运维确认原引擎的创建请求已经收尾后才可传 `hostResourcesStopped: true`，Runner 还会核对该尝试和暂存身份。
- 宿主任务需要应用资源已停止的确认，Runner 也会验证原 Linux 宿主进程身份及其退出。控制子任务还要求父任务已结算或已核验。缺少可验证证据时继续保留预留。

#### 场景：记录原容器已移除

1. 用最初提交时的主体和回执 ID 调用 `runner.get(scope, id)`。确认状态为 `unknown`，从 `owner.nodeId` 找到原执行节点。
2. 获授权的运维人员从执行记录的 `container_json.id` 取得完整容器 ID，在原节点核对原引擎已停止并移除该容器。[执行记录](../data/runner.md#table-hai-runner-executions)
3. 在原节点调用下面的函数，传入步骤 1 的主体和 ID、运维认证取得的操作员 ID，并把原因换成真实工单和证据。缺完整 ID 时，先按上面的核验说明补齐证据。

```ts
import { runner, type RunnerScope } from '@h-ai/runner'

async function recordContainerCleanup(scope: RunnerScope, id: string, operatorId: string) {
  // 记录 INC-47 已核实的容器清理。成功返回 unknown 回执和 reconciledAt。
  const verified = await runner.reconcileUnknown(scope, id, {
    operatorId,
    reason: 'INC-47 container removed',
  })
  if (!verified.success)
    return verified
  return { status: verified.data.status, reconciledAt: verified.data.reconciledAt }
}
```

成功时回执为 `status: 'unknown'` 且有 `reconciledAt`，意味着该任务占用的额度可以复用。核验失败时保留占用，按错误继续核对原节点和清理证据。是否补跑报表取决于业务系统是否已写入或发布原结果，按业务幂等规则决定。

## 错误处理

`HaiResult.success` 表示本次 API 调用有没有成功。`get()` 可以成功读到一个 `failed` 任务，`cancel()` 也可以成功记录一个仍在 `cancelling` 的任务。失败码由公开的 `HaiRunnerError` 导出。

| 错误 | 常见场景与处理 |
| --- | --- |
| `NOT_INITIALIZED` | 尚未启动实例，或该操作在关闭期间不可用 |
| `ALREADY_INITIALIZED` | 实例已启动，或初始化、关闭正在进行 |
| `INVALID` | 参数、文件路径、配额组合或启动方式无效。按对应清单修正 |
| `NOT_FOUND` | 环境未登记，或该主体读不到指定执行 |
| `CONFLICT` | 同幂等键用于不同请求、重复登记、父任务不可用，或核验条件已变化 |
| `UNAVAILABLE` | 依赖、执行引擎或持久存储不可用。排查原因后按原幂等键恢复 |
| `CAPACITY` | 队列已满或请求资源超出允许上限 |
| `LEASE_LOST` | 执行权失效，或事件写入超过任务的条数或字节限制。检查任务状态和事件额度，执行权失效时停止提交外部结果 |
| `CLEANUP_UNCONFIRMED` | 清理期限已到或无法确认资源停止。查任务状态，必要时在原节点核验 |
