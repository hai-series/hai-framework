# @h-ai/tools-runner 功能说明

[English](tools-runner.en.md) · [日本語](tools-runner.ja.md)

Tools Runner 将工具接入 Runner 的持久任务队列。应用提供已启动的 Runner、工具集合及授权规则，可按任务回执查询状态、续读事件和请求取消。直接执行函数时使用 [Tools](tools.md)。

[模块 README](../../../packages/tools-runner/README.md) · [配置](../configuration/tools-runner.md) · [数据归属](../data/tools-runner.md)

将原来从 `@h-ai/tools/server` 调用的 `createService()` 和 `createJobTools()` 改为从 `@h-ai/tools-runner` 导入 `toolsRunner` 后调用。相同的服务 ID、任务输入、幂等键和回执可继续查找 Runner 中的原记录。

<a id="module-dependencies"></a>

## 依赖

| 依赖 | 用途 | 何时需要 | 接入顺序 |
| --- | --- | --- | --- |
| Node.js | 运行工具服务及容器作业工厂 | 服务端进程 | 在 Node 应用中导入适配器 |
| `@h-ai/core`、`zod` | 统一结果、语言和输入校验 | 随适配器安装 | 应用直接导入时显式安装 |
| `@h-ai/tools` | 定义、校验和执行工具 | 所有服务 | 提供工具集合与授权规则 |
| `@h-ai/reldb`、`@h-ai/runner` | 持久化、领取和执行任务 | 所有服务 | 先由宿主启动 RelDB，再启动 Runner，最后创建服务 |
| 宿主文件接口和容器环境 | 访问授权文件并运行固定镜像 | 使用容器作业时 | 准备环境和文件回调，再创建作业工具 |

<a id="quick-start"></a>

## 最小接入

<a id="service-example"></a>

在 Node 项目中安装依赖，把下一段保存为 `sum-service.mts`。这里在一个进程里用 SQLite 内存库和 Runner 演示，无需容器。应用在代码里给出可信主体 `demo/alice`。正式服务应从会话或认证凭据取得该身份。

```sh
pnpm add --allow-build=better-sqlite3 @h-ai/core @h-ai/reldb @h-ai/runner @h-ai/tools @h-ai/tools-runner zod@^4
node sum-service.mts
node sum-service.mts --receipts
```

`--allow-build=better-sqlite3` 允许 pnpm 安装 SQLite 所需的原生绑定。已有项目若已允许安装该绑定，可以沿用项目的安装设置。

<!-- example: tools-service -->

```ts
import type { HaiResult } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { runner } from '@h-ai/runner'
import { tools } from '@h-ai/tools'
import { toolsRunner } from '@h-ai/tools-runner'
import { z } from 'zod'
import process from 'node:process'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(`${result.error.code} ${result.error.message}`)
  return result.data
}

const receiptsOnly = process.argv.includes('--receipts')
const context = { scope: { tenantId: 'demo', userId: 'alice' } }
const request = {
  name: 'sum',
  input: { a: 2, b: 3 },
  idempotencyKey: 'sum-2-plus-3',
}
const worker = runner.create()

// 在此进程中初始化演示数据库。
value(await reldb.init({ type: 'sqlite', database: ':memory:' }))
try {
  // 普通模式可领取任务。回执模式只受理，不领取。
  value(await worker.init({ nodeId: 'sum-demo', executor: !receiptsOnly }))
  try {
    const sum = tools.define({
      name: 'sum',
      description: 'Add two numbers',
      parameters: z.object({ a: z.number(), b: z.number() }),
      handler: ({ a, b }) => a + b,
    })
    // 注册求和处理器并显式启用，仅允许固定的演示主体。
    const service = value(toolsRunner.createService({
      id: 'sum-demo',
      runner: worker,
      createTools: () => ({ tools: [sum] }),
      enabled: { tools: ['sum'] },
      authorize: ({ context: { scope }, name }) =>
        scope.tenantId === 'demo' && scope.userId === 'alice' && name === 'sum',
    }))
    try {
      // 以 demo/alice 查询目录，得到 sum 的定义和空的 groups。上下文格式有误时返回失败。
      const catalog = value(await service.catalog(context))
      process.stdout.write(`catalog: ${catalog.tools.map(tool => tool.name).join(', ')}\n`)

      if (!receiptsOnly) {
        // 以 demo/alice 提交 sum(2, 3) 并等待终态，成功取出数字 5。授权拒绝或任务失败时返回错误。
        const total = value(await service.invoke(request, context))
        process.stdout.write(`sum: ${total}\n`)
      }
      else {
        // 提交同样的求和请求。受理后得到 queued 状态和包含 id、key 的回执，校验或授权失败则返回错误。
        const submitted = value(await service.submit(request, context))
        // 以同一主体和幂等键查回已有的 ToolRun，本例仍为 queued。找不到时成功返回 undefined。
        // 键格式无效或存储查询失败时返回失败结果，value() 会抛出错误。
        const recovered = value(await service.find(request.idempotencyKey, context))
        if (recovered?.receipt.id !== submitted.receipt.id)
          throw new Error('Expected the existing sum receipt')

        // 按完整回执从默认游标 0 读取，得到 status: 'queued'、events: []、next: 0。
        // 回执无效或在当前主体和服务下找不到任务时返回失败。
        const current = value(await service.inspect(recovered.receipt, context))
        // 用同一回执请求取消。此任务未被领取，返回 cancelled。运行中的任务可能先返回 cancelling。
        // 回执校验或 Runner 取消失败时返回错误。
        value(await service.cancel(recovered.receipt, context))
        // 从 current.next（0）续读，得到终态 cancelled、events: []、next: 0。查询失败时返回错误。
        const final = value(await service.inspect(recovered.receipt, context, { after: current.next }))
        process.stdout.write(`status: ${current.status} -> ${final.status}\n`)
        process.stdout.write(`next: ${final.next}\n`)
      }
    }
    finally {
      service.close()
    }
  }
  finally {
    value(await worker.close())
  }
}
finally {
  value(await reldb.close())
}
```

第一条运行命令显示 `catalog: sum` 和 `sum: 5`。`enabled` 让求和进入目录，`authorize` 在提交和执行时只放行该主体对 `sum` 的调用。将主体改为 `bob`，目录仍显示求和，`invoke()` 返回 `FORBIDDEN`，处理函数不会运行。

第二条运行命令只启用 API 节点角色，故意让同样的任务停在 `queued`。它按幂等键找回任务，再以完整回执请求取消，输出 `status: queued -> cancelled` 和 `next: 0`。本例的工具没有事件。真实执行中，`cancel()` 也可能先返回 `cancelling`，此时用 `inspect()` 等待终态。两个命令分别使用新的内存数据库。要在重启后继续查，请使用持久的 [Runner 数据库配置](../configuration/runner.md) 并保存相同的幂等键。

<a id="api-reference"></a>

## 功能说明

<a id="services"></a>

### 提交可恢复业务任务：`toolsRunner.createService`

工具服务是应用进程里的对象。它替应用完成目录、校验和授权，再把工作交给 Runner。Runner 将任务和结果保存在 RelDB 中。HTTP 路由或命令行是宿主自己提供的调用入口。

```text
应用 → service.submit()
  ↓ 校验输入并授权
Runner 保存任务，返回回执
  ↓ 执行节点复核授权
工具执行，Runner 保存终态
  ↓
service.inspect() 读取状态和结果
```

同步等待结果时使用 `service.invoke()`，它将提交和等待合在一次调用中。需要先返回、让调用方稍后来查时，用 `submit()` 保存完整回执。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `toolsRunner.createService(options)` | 创建借用 Runner 的工具服务 | `options: ToolServiceOptions`。`id`、`runner`、`createTools`、`enabled` 和 `authorize` 必填 | `HaiResult<ToolService>` | `toolsRunner.createService(options)` |
| `service.catalog(context)` | 列出当前可用工具 | `context: ToolServiceContext`。应用提供可信上下文 | `Promise<HaiResult<ToolCatalog>>` | `await service.catalog(context)` |
| `service.submit(request, context)` | 提交持久任务，重复提交同一任务时返回现有状态和可用的失败原因 | `request: ToolSubmitRequest, context: ToolServiceContext`。请求包含工具名称、输入及可选幂等键。上下文由应用提供 | `Promise<HaiResult<ToolRun>>` | `await service.submit(request, context)` |
| `service.find(idempotencyKey, context)` | 按业务幂等键查任务 | `idempotencyKey: string, context: ToolServiceContext` | `Promise<HaiResult<ToolRun \| undefined>>` | `await service.find(key, context)` |
| `service.inspect(receipt, context, options?)` | 读取任务状态与结果 | `receipt: ToolReceipt, context: ToolServiceContext, options?: { after?: number }`。传完整回执，可用 `after` 从指定事件序号后续读 | `Promise<HaiResult<ToolRun>>` | `await service.inspect(receipt, context)` |
| `service.cancel(receipt, context)` | 请求取消任务 | `receipt: ToolReceipt, context: ToolServiceContext`。传入任务的完整回执和可信上下文 | `Promise<HaiResult<ToolRun>>` | `await service.cancel(receipt, context)` |
| `service.invoke(request, context)` | 同步等待工具调用结果 | `request: ToolSubmitRequest, context: ToolServiceContext`。请求与 `submit` 使用同一结构 | `Promise<HaiResult<RunnerJson>>` | `await service.invoke(request, context)` |
| `service.close()` | 注销本服务的处理器。继续由宿主关闭 Runner | 无参数 | `void` | `service.close()` |

#### 服务请求、上下文与续读参数

| 对象 | 字段 | 条件和结果 |
| --- | --- | --- |
| `ToolServiceContext` | `scope`, `sessionId`, `signal` | 宿主只从已认证请求传入 `scope`、可选 `sessionId` 和 `signal`。两个主体 ID 和会话 ID 均为 1–200 字符。任务服务忽略调用方传入的 `execution`。 |
| `ToolSubmitRequest` | `name`、`input`、`idempotencyKey` | 前两项必填，工具名称须在已启用目录中，输入为符合该工具 Schema 的 JSON。可传 1–200 字符的幂等键。省略时生成 UUID；要支持断线找回同一操作，应自带稳定键 |
| `ToolReceipt` | `id`、`key` | 必填完整回执。ID 为 64 位十六进制执行号，键为 1–200 字符。`inspect/cancel` 接受这对值并核对当前主体与服务；`find` 只接收提交时的业务幂等键 |
| `inspect` 的 `options` | `after` | 可选整数 0–100000，默认 0。读取序号大于游标的一页，最多 100 条事件，同时返回任务当前状态和 `next` |
| `ToolServiceOptions.enabled` | `groups`、`tools`、`exclude` | 均为可选名称数组。组和工具取并集，再删除排除项。空对象停用全部工具；每次执行仍检查授权 |

`ToolServiceContext.execution` 向产物等工具提供执行 ID、进度写入和可选的 `maxResultBytes`。Runner 提供 JSON 结果字节预算，`artifact_read` 据此分页。容器工厂通过 `RunnerToolServiceContext` 取得完整执行句柄。 [产物分页](tools.md#artifact-byte-limit)

例如状态中包含事件 5、6、7，`inspect(receipt, context, { after: 5 })` 返回事件 6、7，下一次用结果中的 `next` 续读。以 `{ groups: ['docs'], exclude: ['docs_export'] }` 选择工具时，目录包含其余已登记的 docs 工具，提交仍需通过授权回调。

##### 服务工厂参数

| 字段 | 必填或默认值 | 作用 |
| --- | --- | --- |
| `id` | 必填，1～60 个字母、数字、下划线、点或连字符 | 形成 Runner 类型 `hai.tools.<id>.v1`；同一服务各节点保持一致 |
| `runner` | 必填 | 已初始化的 Runner；服务不负责其生命周期 |
| `createTools` | 必填 | 接收可信 `RunnerToolServiceContext`，返回 `RunnerToolSet` 或 Promise。执行节点用真实 Runner 上下文重新构造工具，可用 `execution.start` 启动容器 |
| `enabled` | 必填 | `ToolSelection` 或上下文函数；组与工具取并集，再排除 `exclude`；`{}` 全部停用 |
| `authorize` | 必填 | 接收 `{ context, name, input, phase }`；`phase` 为 `submit` 或 `execute`，两个阶段均须允许。执行阶段的 `context.signal` 包含该工具的截止时间。 |
| `runTimeoutMs` | 300000 毫秒 | 请求准备和 Runner 执行各用此时限，整数 1～86400000 |
| `queueTimeoutMs` | 300000 毫秒 | 排队时限，整数 1～86400000 |

`RunnerToolSet` 包括 `tools`、可选 `groups: { id, title, tools }[]` 及 `environments: Record<toolName, environmentId>`。环境映射将任务绑定到 Runner 环境，并在执行节点复核。`ToolSelection` 的字段为 `groups/tools/exclude`，值均为名称数组。

调用 `service.submit/invoke` 时为同一用户意图保留稳定 idempotencyKey；响应未知时用 `service.find(key, context)` 找回，不生成新键重复提交。find 不受目录停用影响，仍按主体与服务核验旧任务。

`submit()` 在开始持久化前遵守取消信号和请求时限。写入开始后等待 Runner 的实际结果，受理时返回回执。若信号在持久化期间触发且 Runner 已受理，`invoke()` 返回 `CANCELLED`，并在 `error.ext.receipt` 提供完整回执。Runner 拒绝受理时透传实际错误。使用服务生成的键时会尝试取消该任务。调用方提供键时，可以用回执检查任务并决定是否取消，因为同一个键可能对应已在运行的任务。

服务保存首次提交时框架支持的请求语言。执行节点用该语言生成错误事件，同键重试继续使用原语言。没有语言字段的旧任务在执行节点的默认语言下运行。部署时使用同批发布的 Tools 和 Runner，现有任务无需迁移。

##### 回执、状态和失败

`ToolCatalog` 返回 `tools: ToolDefinition[]` 和 `groups: ToolGroup[]`。目录根据 `createTools` 和 `enabled` 生成。需要按用户隐藏工具时，把可见性放进这两处筛选；两阶段授权继续在服务端执行。

`ToolRun` 包含完整 `receipt`、`status`、可选 `output` 和 `failure`，以及 `events`、`next`。把 `next` 传给下一次 `inspect(..., { after: next })` 续读。`submit` 返回状态快照，事件从 `inspect` 读取。

| 状态 | 调用方该怎么处理 |
| --- | --- |
| `queued`、`running`、`cancelling` | 保存回执并继续查询。正在取消时，执行节点可能仍在清理。 |
| `succeeded` | 读取 `output`。执行函数无返回值时，服务输出为 JSON `null`。 |
| `failed`、`cancelled`、`unknown` | 查看可用的 `failure` 和事件。`unknown` 表示 Runner 无法确认最终情况，重复写入前应核对业务结果。 |

`success: false` 表示 API 本身失败，例如参数无效、授权拒绝、冲突或超时。`submit/find/inspect/cancel` 可以成功返回状态为 `failed` 的任务。此时 `failure` 是 Runner 的原因类别；`tool-error` 事件提供工具错误码、安全消息、HTTP 状态和追踪编号。用 `invoke()` 等终态时，任务失败按失败的 `HaiResult` 返回。详见 [Runner 状态与查询](runner.md#tasks)。

同一服务的节点使用相同 ID、选择策略和环境映射，并共享 Runner 数据库。API 节点可设 `executor: false`，执行节点需要唯一且重启稳定的节点 ID。应用在停机时先关闭服务，再关闭 Runner 和 RelDB。

兼容升级时保留相同的服务 ID、环境定义和数据库，用已保存的回执继续查任务。采用滚动部署时，新旧执行节点使用不同节点 ID。停止旧节点前，先让它完成正在运行的工具及其子作业，因为关闭 Runner 会请求取消本地任务。

<a id="job-tools"></a>

### 在容器中处理文档与网页：`toolsRunner.createJobTools`

应用需要提取文档、转换 Office 文件或生成网页预览时，可以在工具服务的 `createTools(context)` 中构造受管作业工具集。应用传文件 ID，宿主读取文件，Runner 启动已登记的固定镜像。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `toolsRunner.createJobTools(options)` | 为已绑定的 Runner 环境创建容器作业工具 | `options: JobToolOptions`，必填 `context`、`files`、`runner` 和 `environments`。仅联网作业需要 `browserProxy` | `RunnerToolSet`。没有配置相应环境键或所需代理时，不加入相应工具 | `toolsRunner.createJobTools({ context, files, runner, environments: { documents: 'docs-offline' } })` |

##### 环境绑定

`environments` 左侧写作业类别，右侧写 Runner 环境 ID。例如 `{ documents: 'docs-offline' }` 将文档工具放到 Runner 的 `docs-offline` 环境。服务再通过 `enabled` 选择本次接入的工具。

| 环境键 | 工具名 | Runner 环境能力 | 网络策略 |
| --- | --- | --- | --- |
| `documents` | `documents_extract`、`documents_generate` | `documents.extract`、`documents.generate` | `offline` |
| `office` | `office_convert`、`office_recalculate` | `office.convert`、`office.recalculate` | `offline` |
| `ocr` | `ocr_recognize` | `ocr.recognize` | `offline` |
| `browser` | `browser_navigate` | `browser.navigate` | `internal`，通过受控代理 |
| `web` | `web_capture` | `web.capture` | `internal`，通过受控代理 |
| `preview` | `preview_build` | `preview.build` | `offline` |
| `video` | `video_render` | `video.render` | `offline` |

用组启用时，Office 和 OCR 归 `documents`，浏览器截图和预览构建归 `web`。联网工具还要传入部署控制的 HTTP IPv4 代理地址和端口。URL 最多 2048 个 Unicode 字符，须使用 HTTPS、ASCII DNS 域名和默认端口。 [Runner 环境配置](../configuration/runner.md#容器引擎与环境) · [镜像、代理、资源和输入限制](../../../packages/tools/jobs/README.md#配置)

<a id="managed-job-example"></a>

#### 场景：提交文件 ID，读回容器提取的文字

在 Node 26 示例项目中安装依赖，将下面的代码保存为 `managed-example.mts`。在框架仓库根目录构建 documents 镜像，再在示例项目中运行。已经有对应本机镜像时可直接取其 ID。 [独立作业镜像和准备步骤](../../../packages/tools/jobs/README.md#quick-start)

```sh
# 在示例项目安装依赖；SQLite 驱动需要允许安装原生绑定。
pnpm add --allow-build=better-sqlite3 @h-ai/core @h-ai/reldb @h-ai/runner @h-ai/tools @h-ai/tools-runner
```

```sh
# 在框架仓库根目录执行，得到本机 documents 镜像。
podman build -f packages/tools/jobs/documents/Dockerfile \
  -t localhost/hai-tools-documents:local packages/tools/jobs
```

```sh
# 回到示例项目，取本机镜像 ID 并传给脚本。
image_id=$(podman image inspect localhost/hai-tools-documents:local --format '{{.Id}}')
node managed-example.mts "sha256:${image_id#sha256:}"
```

<!-- example: tools-managed-job -->

```ts
import type { HaiResult } from '@h-ai/core'
import type { RunnerScope } from '@h-ai/runner'
import type { ToolArtifactAccess } from '@h-ai/tools/server'
import process from 'node:process'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { runner } from '@h-ai/runner'
import { HaiToolsError } from '@h-ai/tools'
import { toolsRunner } from '@h-ai/tools-runner'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.data
}

const image = process.argv[2]
if (!image)
  throw new Error('Pass the local documents image ID with its sha256: prefix.')

const jobRunner = runner.create()
const scope = { tenantId: 'demo', userId: 'alice' }
const file = {
  id: 'release-checklist',
  name: 'checklist.txt',
  mediaType: 'text/plain',
  data: new TextEncoder().encode('Release checklist'),
}
const canRead = (caller: RunnerScope) => caller.tenantId === scope.tenantId && caller.userId === scope.userId
const files: ToolArtifactAccess = {
  async read(context, { id }) {
    if (context.signal?.aborted)
      return core.err(HaiToolsError.CANCELLED, 'File read cancelled')
    return canRead(context.scope) && id === file.id
      ? core.ok(file)
      : core.err(HaiToolsError.FORBIDDEN, 'File access denied')
  },
  async publish() {
    return core.err(HaiToolsError.FORBIDDEN, 'This text-only example does not publish files')
  },
}

// SQLite 内存库保存本次运行的任务。初始化失败时 value 抛出对应错误。
value(await reldb.init({ type: 'sqlite', database: ':memory:' }))
try {
  // 启动可执行任务的 Podman Runner，并登记 docs-offline 环境。初始化失败会停止示例。
  value(await jobRunner.init({
    engine: 'podman',
    nodeId: 'documents-demo',
    environments: [{
      id: 'docs-offline',
      image,
      capabilities: ['documents.extract'],
      networkPolicy: 'offline',
      resources: { cpu: 0.5, memoryMiB: 192, pids: 32, scratchMiB: 24 },
    }],
  }))

  // 只启用 documents_extract。创建成功得到服务，配置或登记失败时 value 抛出错误。
  const service = value(toolsRunner.createService({
    id: 'checklist',
    runner: jobRunner,
    enabled: { tools: ['documents_extract'] },
    authorize: ({ context, name }) => name === 'documents_extract' && canRead(context.scope),
    // 将 documents 作业类别绑定到 docs-offline，返回不含运行记录的工具集。
    createTools: context => toolsRunner.createJobTools({
      context,
      files,
      runner: jobRunner,
      environments: { documents: 'docs-offline' },
    }),
  }))
  try {
    // 提交文件 ID 并等待结果。成功得到 { text: 'Release checklist' }，读权限或作业失败时抛出对应错误。
    const result = value(await service.invoke({
      name: 'documents_extract',
      input: { fileId: file.id },
    }, { scope }))
    process.stdout.write(JSON.stringify(result) + '\n')
  }
  finally {
    // 注销此服务的处理器，返回 void。
    service.close()
  }
}
finally {
  try {
    // 关闭 Runner 并等待资源回收。成功无业务数据，清理失败会抛出错误。
    value(await jobRunner.close())
  }
  finally {
    // 即使 Runner 关闭失败，也释放演示数据库。成功无业务数据。
    value(await reldb.close())
  }
}
```

结果为 `{"text":"Release checklist"}`。任务参数只包含 `fileId: 'release-checklist'`。执行时，`files.read()` 为 demo 租户的 alice 返回示例文本，Runner 将其提供给离线容器。因为这次执行只返回文本，`files.publish()` 不会被调用。换成需要生成文件的作业时，宿主应保存授权产物并返回引用。固定作业在确认容器清理成功后才调用发布回调。

要看失败分支，可以把请求的 `fileId` 改为 `missing-file`。宿主的读取回调会拒绝请求，`invoke()` 返回 `FORBIDDEN`，示例会打印错误并退出。

任务参数、单条事件和最终输出各受 512 KiB JSON 限制。文件和产物字节另有 50 MiB 上限，容器输入还受 `scratchMiB` 和作业自身限制。 [数据与保留期](../data/tools-runner.md#size-and-retention) · [单独运行各作业的输入、输出和错误示例](../../../packages/tools/jobs/README.md#job-operations)

<a id="从项目构建网页预览"></a>
<a id="web-preview"></a>

#### 场景：从项目构建网页预览

沿用[受管文档示例](#managed-job-example)的服务结构。先用下面的准备步骤把文档环境换成预览环境，再替换 `try` 中的工具请求。

| 需要准备 | 本例中的值 |
| --- | --- |
| Runner 容器环境 | ID 为 `preview-local`，能力为 `preview.build`，绑定预览镜像并使用 `offline` 网络 |
| 工厂环境映射 | `environments: { preview: 'preview-local' }` |
| 启用和授权 | `enabled: { tools: ['preview_build'] }`，授权回调允许可信主体执行该工具 |
| 文件与发布 | 宿主用 `uploaded-project` 指向已上传且通过授权的 ZIP，并用 `files.publish()` 保存生成的 HTML |

<!-- example: tools-web-preview -->

```ts
// service、scope 和 value 沿用上一个示例。
// 成功时 data.artifacts 含一个 kind 为 html 的引用。资源拒绝或构建失败时 value 抛出对应错误。
const preview = value(await service.invoke({
  name: 'preview_build',
  input: { fileId: 'uploaded-project' },
}, { scope }))
process.stdout.write(`${JSON.stringify(preview)}\n`)
```

可用返回的 `artifacts[0].id` 从宿主取回 `text/html` 产物。ZIP 根目录须有 `index.html`。可先按作业指南创建带本地模块的示例 ZIP，再上传到应用。它同时给出了直接运行容器的命令、文件清单、体积和耗时限制。 [准备 ZIP 并生成 HTML](../../../packages/tools/jobs/README.md#构建多文件网页预览)

<a id="从网址生成可编辑介绍视频"></a>
<a id="website-video"></a>

#### 场景：从网址生成可编辑介绍视频

AI 层的 `ai.tools.createBuiltinTools({ context, files, executeJob? })` 可把 `website_video` 加入 `video` 组；只有提供 `executeJob` 才登记。宿主将该回调限定为同一工具服务的 `web_capture/video_render` 调用，沿用授权、Runner 及产物访问，不在应用重新写视频生成逻辑。

输入 HTTPS `url`，可选目标 `goal`、6～30 秒的 `durationSeconds`（默认 15）、画布 `width/height`（默认 1280×720，偶数、16:9/9:16/1:1，最多 1920×1080 总像素）、`language`（默认 zh-CN）、`voice/model/brandColor`。模型负责根据实际网页内容生成脚本和分镜，TTS 为每镜生成 WAV，再组装工程并调用视频作业渲染。

流程保留 SCRIPT.md、DESIGN.md、STORYBOARD.json、可编辑 STORYBOARD.md、每镜 WAV、SRT、网页截图封面、工程 ZIP、video-workflow.json 和 MP4。返回 `sourceUrl/captureId/scriptId/storyboardId/audioIds/projectId/subtitlesId/coverId/videoId/durationSeconds/artifacts`；封面来源为网页采集，不用生成图片冒充网站画面。

重试可传 `captureId` 复用采集。修改分镜 Markdown 后传 `storyboardId`，并用 `audioIds` 复用未改的配音：audioText 与 narration 相同的镜头沿用原音频，只重做有变化的部分。工程 ZIP 也可直接交 `video_render` 重渲染。字幕按句分段，不承诺逐词对齐；配音总时长放不进目标时长时明确失败，不截掉语音。

宿主还需确保 `web_capture` 与 `video_render` 按全局选择实际启用。Hai Agent 按 `workbench.selection` 的 groups/tools 并集再应用 exclude，只有两个依赖都可用时才登记 `website_video`；只选 video 组或只选 website_video 工具不足以启用完整流程。可选择 web/video 两组，或同时明确选择 website_video/web_capture/video_render。任务设置的依赖授权不会覆盖全局停用。

需要实际 LLM、默认 WAV TTS、web/video 环境和 browserProxy。较长流程可将服务 `runTimeoutMs` 设为 1200000；协调任务使用普通容量，嵌套作业使用已绑定的工具环境，避免互相占满工具槽位。真实模型和 HyperFrames 渲染需按部署另行验收。
