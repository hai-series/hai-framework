# @h-ai/tools 功能说明

通过 `tools` 定义、注册和执行业务工具。同一份实现可由普通业务、界面或 AI 调用。

[模块 README](../../../packages/tools/README.md) · [配置](../configuration/tools.md) · [数据归属](../data/tools.md)

## 选择入口

| 入口 | 适用场景 | 执行与生命周期 |
| --- | --- | --- |
| `@h-ai/tools` | 短时业务函数、浏览器本地工具、模型协议适配前的中立定义 | `tools.define/createRegistry` 为纯定义与工厂，无 `init/close`，不加载 Runner 或模型 SDK |
| `@h-ai/tools/server` | 可恢复任务、进度与取消、文档及独立容器作业 | 保留轻量方法，增加 `tools.createService/createArtifactTools/createJobTools`；借用已初始化的 Runner |

浏览器可导入轻量入口，但服务端权限仍由可信服务端验证。不要把 `/server` 导入前端。

<a id="quick-start"></a>

## 最小接入

```sh
pnpm add @h-ai/tools zod
```

下面是独立业务调用。注册器只包含宿主显式注册的工具，身份由可信服务端传入。

```ts
import { tools } from '@h-ai/tools'
import { z } from 'zod'

export async function calculate(objectId: string) {
  const registry = tools.createRegistry({
    authorize: ({ context }) => context.objectId === objectId,
  })
  const registered = registry.register(tools.define({
    name: 'sum',
    title: '求和',
    description: 'Add two numbers',
    examples: [{ label: '2 + 3', input: { a: 2, b: 3 } }],
    parameters: z.object({ a: z.number(), b: z.number() }),
    handler: ({ a, b }) => ({ total: a + b }),
  }))
  if (!registered.success)
    return registered
  return registry.execute('sum', { a: 2, b: 3 }, { objectId })
}
```

成功结果的 `data` 为 `{ total: 5 }`。`title` 是界面名称，稳定的 `name` 用于协议和启用策略；`examples` 只提供表单预设，不会自动执行或授予权限。`tool.toDefinition()` 和注册器目录保留这些元数据。

已有业务服务返回 `HaiResult` 时，改用 `resultHandler` 转交结果；`handler` 用于返回普通数据。二者必须且只能提供一个，不能用 `handler` 把失败的 `HaiResult` 包成成功数据。

```ts
import type { HaiResult } from '@h-ai/core'
import { tools } from '@h-ai/tools'
import { z } from 'zod'

export function createLookup(read: (id: string) => Promise<HaiResult<string>>) {
  return tools.define({
    name: 'document_lookup',
    description: 'Read an authorized document',
    parameters: z.object({ id: z.string().min(1) }),
    resultHandler: ({ id }) => read(id),
  })
}
```

<a id="api-reference"></a>

## 功能说明

Tools 无模块级 init/close。轻量场景从根入口导入；服务端场景从 /server 导入并借用已经初始化的 Runner。`value` 先检查 `HaiResult.success`，失败保留原错误，成功返回 data；只用于读取结果。各场景使用独立测试数据，不能把相邻片段当成无需清理的生产脚本。

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="definitions"></a>

### 定义并执行单个工具：`tools.define`

把参数校验和业务函数绑定为中立工具；定义本身不执行，execute 才产生业务结果。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `tools.define` | 定义工具并约束输入。默认超时 `30000` 毫秒，定义无效时抛出 `TypeError` | `definition` | `Tool<TInput, TOutput>` | `const tool = tools.define(definition)` |
| `tool.execute` | 校验输入后执行；可另外传身份、授权、取消信号和期限 | 可另外传身份、授权、取消信号和期限；`input, options? = {}` | `Promise<HaiResult<TOutput>>` | `await tool.execute({ a: 2, b: 3 })` |
| `tool.toDefinition` | 把参数规则转为 JSON Schema。不能转换时会抛出异常 | 无 | `ToolDefinition` | `tool.toDefinition()` |

#### 场景：定义并执行单个工具

```ts
import { z } from 'zod'
const tool = tools.define({
  name: 'sum', description: 'Add two numbers',
  parameters: z.object({ a: z.number(), b: z.number() }),
  handler: ({ a, b }) => ({ total: a + b }),
})
tool.toDefinition().name // 'sum'; parameters are JSON Schema
value(await tool.execute({ a: 2, b: 3 })) // { total: 5 }
const invalid = await tool.execute({ a: 'wrong', b: 3 }) // success false: VALIDATION_FAILED
```

输入是两个数字，成功输出 total=5，非法 a 不进入业务处理。已有 HaiResult 服务使用 resultHandler；定义错误抛 TypeError，业务执行失败返回 HaiResult。

#### 工具定义与执行边界

`tool` 和 `registry` 是工厂返回的实例，不是包级独立函数。注册器不隐式发现其他工具，只接受 `tools.define` 创建的实例，拒绝手写或复制的对象。

工具名使用 1～64 个 ASCII 字符，以字母开头，其余为字母、数字、下划线或连字符。无效名称、默认超时或处理函数组合属于开发配置错误，定义时抛出 `TypeError`。供模型使用的参数须能转换成 JSON Schema，通常使用对象 Schema；`z.date()` 等不可表达类型不能直接用作模型参数。

错误常量 `HaiToolsError` 包含 NOT_FOUND、ALREADY_REGISTERED、VALIDATION_FAILED、EXECUTION_FAILED、FORBIDDEN、TIMEOUT、CANCELLED，使用 `hai:tools` 命名空间。参数、授权、超时和取消返回失败 `HaiResult`；`resultHandler` 保留已有业务错误，模型 JSON 解析错误仍由 AI 适配层处理。

固定作业返回 `TIMEOUT` 时映射为 `HaiToolsError.TIMEOUT`；不安全的 Office 文档、项目或其他已知输入拒绝映射为 `VALIDATION_FAILED`。沙箱/依赖缺失、无效的作业输出和未知工作进程错误仍是 `EXECUTION_FAILED`，不能归咎于用户参数。公开提示使用本地化消息，不直接显示工作进程原文。作业和容器清理同时失败时，保留清理失败主错误，并在 `error.ext.operationError` 保留脱敏后的首次作业错误；仅有一次失败时不增加这份扩展。

#### 验证方式

`pnpm --filter @h-ai/tools test` 验证内核与服务，`pnpm --filter @h-ai/tools test:jobs` 验证独立作业协议。真实镜像和浏览器验收另按作业说明准备环境；单元测试不代表镜像已验收。

<a id="call-options"></a>

#### 调用参数

`tools.define/createRegistry` 是纯定义与工厂，无模块级 YAML、环境变量或 `init/close`。服务端工厂从 `@h-ai/tools/server` 导入，借用宿主已初始化的 Runner。

#### 定义与执行选项

| 配置位置 | 字段 | 默认和作用 |
| --- | --- | --- |
| 工具定义 | `name/description/parameters` | 必填；名称为 1～64 个 ASCII 字符，以字母开头，其余为字母、数字、下划线或连字符；参数使用 Zod 校验 |
| 工具定义 | `handler` 或 `resultHandler` | 必须且只能选一个；前者返回普通数据，后者返回已有 `HaiResult` |
| 工具定义 | `title/examples` | 可选界面名称和 `{ label, input }[]` 表单预设；不影响权限 |
| 工具定义 | `timeoutMs` | 整数 0～2147483647 毫秒；省略为 30 秒；0 立即超时 |
| 注册器 | `authorize` | 可选；配置后每次注册器调用都需通过 |
| 执行选项 | `signal` | 取消信号，继续透传给处理函数 |
| 执行选项 | `objectId/sessionId` | 可信主体和会话，不能取自未经认证的模型输入 |
| 执行选项 | `deadline/timeoutMs` | 绝对截止时间优先，之后为单次超时、工具超时、30 秒；覆盖校验、授权和处理函数 |
| 执行选项 | `authorize` | 单次额外授权，与注册器授权共同生效 |
| 批量执行 | `parallel` | 默认 false；只对可并行的调用启用 |

无效名称、默认超时或处理函数组合在定义时抛出 `TypeError`；执行失败返回 `HaiResult`。注册器只接受 `tools.define` 创建的工具。供模型使用的参数须能转换成 JSON Schema，通常使用对象参数。

<a id="registry"></a>

### 登记、查找与批量执行：`tools.createRegistry`

注册器只包含宿主显式登记的工具；通过 authorize 控制调用，而非让模型自行决定可执行范围。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `tools.createRegistry` | 创建空的工具注册器。未提供 `authorize` 时注册器不额外检查权限 | `options? = {}` | `ToolRegistryOperations` | `const registry = tools.createRegistry()` |
| `registry.register` | 登记一个工具实例 | `tool` | `HaiResult<void>` | `registry.register(tool)` |
| `registry.registerMany` | 批量登记。任一项无效或重名，整批都不添加 | `tools: Tool[]` | `HaiResult<void>` | `registry.registerMany([tool])` |
| `registry.replace` | 用新定义替换同名工具。该名称必须已存在 | `tool` | `HaiResult<void>` | `registry.replace(updatedTool)` |
| `registry.unregister` | 移除指定名称。只有原来存在才返回 `true` | `name` | `boolean` | `registry.unregister('sum')` |
| `registry.get` | 按工具名取得实例 | `name` | `Tool / undefined` | `registry.get('sum')` |
| `registry.has` | 检查指定名称是否已注册 | `name` | `boolean` | `registry.has('sum')` |
| `registry.getNames` | 读取所有已注册工具的名称 | 无 | `string[]` | `registry.getNames()` |
| `registry.getDefinitions` | 读取所有已注册工具的定义。参数规则无法转换时会抛出异常 | 无 | `ToolDefinition[]` | `registry.getDefinitions()` |
| `registry.execute` | 执行已注册工具。注册器和单次调用都设置授权时，两者都要通过 | `name, input, options? = {}` | `Promise<HaiResult<unknown>>` | `await registry.execute('sum', { a: 2, b: 3 })` |
| `registry.executeAll` | 默认顺序执行，遇到失败即停。设置 `parallel: true` 时已启动的调用不会因此回退 | `calls: ToolInvocation[], options?` | `Promise<HaiResult<unknown[]>>` | `await registry.executeAll([{ name: 'sum', input: { a: 2, b: 3 } }])` |
| `registry.clear` | 清空登记，之后不能按名称执行。已开始的调用不会取消 | 无 | `void` | `registry.clear()` |
| `registry.size` | 读取已注册的工具数（属性） | 无 | `number` | `registry.size` |

#### 场景：登记、查找与批量执行

```ts
// Continue with the sum tool from the preceding scenario.
const registry = tools.createRegistry({ authorize: ({ context }) => context.objectId === 'demo-user' })
value(registry.register(tool)) // undefined
value(registry.registerMany([])) // undefined; no tools added
registry.size // 1
registry.has('sum') // true
registry.get('sum')?.toDefinition().name // 'sum'
registry.getNames() // ['sum']
registry.getDefinitions().map(definition => definition.name) // ['sum']
value(await registry.execute('sum', { a: 2, b: 3 }, { objectId: 'demo-user' })) // { total: 5 }
value(await registry.executeAll([{ name: 'sum', input: { a: 4, b: 1 } }], { objectId: 'demo-user' })) // [{ total: 5 }]
value(registry.replace(tool)) // undefined; same registered name
registry.unregister('sum') // true
value(registry.registerMany([tool])) // undefined
registry.clear() // undefined
registry.size // 0
```

示例只允许可信 demo-user；真实身份由服务端提供。注册结果为 void，查询返回实例、定义、名称或数量；unregister 表示是否存在。clear 不取消已启动调用。

#### 多节点部署与关闭

Tools 无全局启用开关；应用将自己的配置转换为工厂与 `enabled`。Hai Agent 使用 `workbench.selection` 复用 groups/tools/exclude：完全省略时选择默认内置组，显式 `{}` 全部停用。其工作台开关和环境映射见 [Agent 使用说明](../../../apps/agent/README.md#配置)。AI 图像和语音模型仍使用 [AI 配置](../configuration/ai.md)。

同一服务各节点共享原有 Runner 数据库和 Storage，保持服务 ID、工具定义及环境配置一致；框架不创建新队列或状态表。API 节点可配置 Runner `executor: false`，执行节点配置唯一且重启稳定的 `nodeId`。执行节点会重新检查当前启用策略与授权；停用不能只改前端目录。

服务 `close()` 仅注销本服务处理器，不关闭借入的 Runner。取消后继续读取实际状态到终态，不能把停止等待当成进程已停止。

参数、单事件和输出还受 Runner 各 512 KiB JSON 上限；文件字节的 50 MiB 与 scratchMiB 是另一组约束，见 [数据边界](../data/tools.md#大小与保留期)。

<a id="services"></a>

### 提交可恢复业务任务：`tools.createService`

服务端工厂借用 Runner，把目录、提交、回执、查询和取消串成一个可恢复流程。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `tools.createService` | 创建借用 Runner 的工具服务 | `ToolServiceOptions`；id、runner、createTools、enabled、authorize 必填 | `HaiResult<ToolService>` | `tools.createService(options)` |
| `service.catalog` | 列出当前可用工具 | 可信上下文 | `Promise<HaiResult<ToolCatalog>>` | `await service.catalog(context)` |
| `service.submit` | 提交持久任务 | `{ name, input, idempotencyKey? }`、上下文 | `Promise<HaiResult<ToolRun>>` | `await service.submit(request, context)` |
| `service.find` | 按业务幂等键查任务 | 幂等键、可信上下文 | `Promise<HaiResult<ToolRun \| undefined>>` | `await service.find(key, context)` |
| `service.inspect` | 读取任务状态与结果 | 完整回执、上下文、可选 `{ after }` | `Promise<HaiResult<ToolRun>>` | `await service.inspect(receipt, context)` |
| `service.cancel` | 请求取消任务 | 完整回执、上下文 | `Promise<HaiResult<ToolRun>>` | `await service.cancel(receipt, context)` |
| `service.invoke` | 同步等待工具调用结果 | 与 submit 相同 | `Promise<HaiResult<RunnerJson>>` | `await service.invoke(request, context)` |
| `service.close` | 停止服务并清理自有资源 | 无 | `void` | `service.close()` |

#### 场景：提交可恢复业务任务

下面先构造 service，再从 catalog 选工具，以同一幂等键 submit/find，保存完整 receipt 后 inspect/cancel；invoke 用于等待终态。close 只移除本服务处理器，不关闭借入 Runner。

#### 场景：把已授权的产物存取接入 Runner

安装并初始化 [Runner](runner.md)，从 `/server` 导入。宿主提供可信身份、启用策略、授权及产物访问；服务不初始化或关闭借入的 Runner。

```ts
import type { RunnerFunctions } from '@h-ai/runner'
import type { ToolArtifactAccess } from '@h-ai/tools/server'
import { tools } from '@h-ai/tools/server'

export function createDocumentService(runner: RunnerFunctions, files: ToolArtifactAccess) {
  return tools.createService({
    id: 'documents',
    runner,
    createTools: context => tools.createArtifactTools({ context, files }),
    enabled: { groups: ['documents', 'analysis'] },
    authorize: ({ context }) => context.scope.userId.length > 0,
  })
}
```

示例授权仅检查可信用户是否存在；`files.read/publish/save` 仍需按主体、资源和最终提交条件复核权限。身份通过 `ToolServiceContext.scope` 传入，不放进模型参数。

每次返回业务结果都先判断 `success`。`invoke` 适合需要最终结果的业务调用；长任务界面通常使用 `submit/inspect`，保存完整回执并显示 `queued/running/cancelling` 等实际状态。取消回执不等于进程已退出。

`enabled` 必填：组与独立工具取并集，再应用 `exclude`；空对象表示全部停用。`catalog` 按当前工厂和启用策略生成，不调用逐工具 `authorize`，如需按用户隐藏目录，使用上下文相关的 `createTools/enabled`。提交和执行节点都会重建启用集合并授权，工具被禁用后不能靠旧目录继续执行。

#### 执行期限、取消与多节点

轻量注册器可通过 `ai.tools.adapt(registry)` 接入模型：`getDefinitions()` 用于模型请求，`execute(toolCall)` 转为同一注册器的业务调用。服务端界面与智能体也应共用同一个工具服务，避免授权和工具实现分叉。

轻量执行的期限依次为绝对 `deadline`、单次 `timeoutMs`、工具超时、默认 30 秒；覆盖异步参数校验、授权和处理函数。取消或超时能停止等待并透传信号，不响应信号的函数仍可能继续执行。进程停止与资源回收由 Runner 确认。

服务注册 Runner 任务类型 `hai.tools.<id>.v1`，沿用 Runner 的任务、租约和事件，不新建队列或 Tools 状态表。各节点使用一致的服务 ID、工具配置和共享 Runner 数据库及 Storage；API 节点可设 `executor: false`，执行节点提供镜像和唯一稳定的节点 ID。完整回执同时核对任务、服务和主体归属，不能只接受一个任务 ID。

大文件只返回授权产物引用，文件读取和发布仍由宿主验证。日志及事件不写入密钥或图片、音视频正文。

#### 服务工厂参数

| 字段 | 必填或默认值 | 作用 |
| --- | --- | --- |
| `id` | 必填，1～60 个字母、数字、下划线、点或连字符 | 形成 Runner 类型 `hai.tools.<id>.v1`；同一服务各节点保持一致 |
| `runner` | 必填 | 已初始化的 Runner；服务不负责其生命周期 |
| `createTools` | 必填 | 接收可信 `ToolServiceContext`，返回 `ToolSet` 或 Promise；执行节点再次构造 |
| `enabled` | 必填 | `ToolSelection` 或上下文函数；组与工具取并集，再排除 `exclude`；`{}` 全部停用 |
| `authorize` | 必填 | 接收 `{ context, name, input, phase }`；`phase` 为 `submit` 或 `execute`，两个阶段均须允许 |
| `runTimeoutMs` | 300000 毫秒 | 执行时限，整数 1～86400000 |
| `queueTimeoutMs` | 300000 毫秒 | 排队时限，整数 1～86400000 |

`ToolServiceContext` 包括 `scope: { tenantId, userId }`、可选 `sessionId/signal`；真实 `execution` 由 Runner 执行节点补入。不要接受客户端自报的身份或执行上下文。

`ToolSet` 包括 `tools`、可选 `groups: { id, title, tools }[]` 及 `environments: Record<toolName, environmentId>`。环境映射将任务绑定到 Runner 环境，并在执行节点复核。`ToolSelection` 的字段为 `groups/tools/exclude`，值均为名称数组。

目录不逐项调用 `authorize`；需要按用户限制可见工具时，在 `createTools/enabled` 中筛选。授权、最终文件读取和提交仍在服务端检查，隐藏按钮不能替代停用。

调用 `service.submit/invoke` 时为同一用户意图保留稳定 idempotencyKey；响应未知时用 `service.find(key, context)` 找回，不生成新键重复提交。find 不受目录停用影响，仍按主体与服务核验旧任务。

#### 场景：提交后找回任务、查询与取消

service 来自上方 createDocumentService 的成功 data；context 由服务端认证后提供；request 是从 catalog 选择工具并校验后的请求。提交与 find 使用相同幂等键，取消后仍应按 inspect 返回的实际状态显示；invoke 用同一请求等待结果，不重复创建业务意图。

```ts
import type { ToolService, ToolServiceContext, ToolSubmitRequest } from '@h-ai/tools/server'

async function followJob(service: ToolService, context: ToolServiceContext, request: ToolSubmitRequest) {
  const catalog = value(await service.catalog(context))
  // catalog.tools describes what this context can submit.
  const keyed = { ...request, idempotencyKey: 'demo-operation-42' }
  const submitted = value(await service.submit(keyed, context))
  const recovered = value(await service.find(keyed.idempotencyKey, context))
  // recovered is the same logical run, or undefined if none was accepted.
  const current = value(await service.inspect(submitted.receipt, context))
  const cancelling = value(await service.cancel(submitted.receipt, context))
  // current/cancelling are ToolRun values; cancellation may still be in progress.
  return service.invoke(keyed, context)
}
// At application shutdown, after all users of the service finish:
// service.close() returns void and leaves Runner open.
```

<a id="artifact-jobs"></a>

### 复用产物、网页与文档作业：工具工厂

宿主提供授权文件访问与环境映射，工厂只返回可执行工具；有目录不代表已启动容器。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `tools.createArtifactTools` | 创建产物读写与数据分析工具 | `ArtifactToolOptions`：`context, files` | `ToolSet` | `tools.createArtifactTools({ context, files })` |
| `tools.createJobTools` | 创建已绑定环境的后台作业工具 | `JobToolOptions`：`context, files, runner, environments`；`browserProxy?` | `ToolSet` | `tools.createJobTools({ context, files, runner, environments })` |

#### 场景：复用产物、网页与文档作业

宿主将认证后的 context、受授权约束的文件访问 files、已初始化的 Runner 及可信环境映射作为输入。下面返回 ToolSet，可由 createService.createTools 返回；工厂本身不提交任务，也没有关闭方法。

```ts
import type { JobToolOptions, ToolSet } from '@h-ai/tools/server'
import { tools } from '@h-ai/tools/server'

function createWorkTools(options: JobToolOptions): ToolSet {
  const artifacts = tools.createArtifactTools({ context: options.context, files: options.files })
  const jobs = tools.createJobTools(options)
  return {
    tools: [...artifacts.tools, ...jobs.tools],
    groups: [...(artifacts.groups ?? []), ...(jobs.groups ?? [])],
    environments: { ...artifacts.environments, ...jobs.environments },
  }
}
// The result includes artifact_create/read/save and data_analyze.
// Job tools appear only for the environments present in options.environments.
```


#### 作业工具与环境要求

`artifact_create` 创建 Markdown、HTML、表格或图表；表格和图表内容须是 JSON 对象。`artifact_save` 携带 `baseVersion`，冲突和最终写入由宿主处理。`data_analyze` 对结构化行计算数量、总和、均值、最小值和最大值，并发布表格、图表引用，不执行任意代码。

独立作业按环境绑定才加入目录：`documents` 对应 `documents_extract/documents_generate`，`office` 对应 `office_convert/office_recalculate`，`ocr` 对应 `ocr_recognize`，`browser` 对应 `browser_navigate`，`web` 对应 `web_capture`，`preview` 对应 `preview_build`，`video` 对应 `video_render`。具体输入、固定镜像、能力和网络要求见 [作业说明](../../../packages/tools/jobs/README.md)。缺少环境的工具不会出现；`browser/web` 还需可信宿主提供 `browserProxy`。代理格式为 `http://非 loopback IPv4:port`，可复用已有模型出口代理，经 `HAI_TOOL_BROWSER_PROXY` 交给作业而不是模型参数。有环境仍需通过 Runner 能力和网络策略检查。

图像、语音和文档改写使用 [AI](ai.md) 的 `ai.tools.createBuiltinTools`，与上述工厂组成同一个 `ToolSet`；Tools 不反向依赖 AI。`video_render` 接收已准备的项目包；完整「网址到介绍视频」使用下面的 AI 编排流程。

`documents_generate` 接收 `format: docx/xlsx/pptx`、标题及可选段落、表格或幻灯片，生成固定格式的 Office 文件。UTF-8 JSON 资料最多 256 KiB；段落与表格按格式校验，PPTX 每页最多 6 段、每段 160 字且合计 800 字，表格最多 6 列、6 行数据、单元格 32 字；有表格时正文限一段 120 字。`slides` 仅用于 PPTX，不能与顶层段落或表格并用。内置预设可直接填入工作台，再修改标题和内容。

`artifact_create` 和 `data_analyze` 在受管执行中为各个逻辑输出分配稳定 ID，宿主继续核对重试产物的内容一致性。分析表格保留原始列标签；来源包含编辑器保留的 `row_id` 列时，会为该来源列分配其他字段名，避免覆盖数据。内部行标识按行序确定，生成文件名保留后缀并限制在 160 字符内。

工具组与环境键分开：office/ocr 作业属于 documents 组，browser/preview 作业属于 web 组；启用相应组后再绑定这些环境键，无需虚构同名组。

工具服务沿用 Runner 的大小限制：提交参数、单条事件和最终输出各最多 512 KiB JSON。文件/产物的 50 MiB 上限是字节限制，不表示可把同等大小内容塞进 JSON；容器输入还受 50 MiB 与环境 scratchMiB 中较小值约束。即使工具 Schema 允许更长文本或更多行，也须满足整个任务的 JSON 预算；大内容使用授权文件引用。详见 [Runner 任务与输入边界](runner.md#恢复任务读取事件和取消)。

<a id="从项目构建网页预览"></a>

#### 场景：从项目构建网页预览

`preview_build({ fileId })` 读取授权的项目 ZIP，用可选 `environments.preview` 环境中的固定 `preview.build` 作业，生成一个 `text/html`、`kind: html` 产物。工具属于 `web` 组；仅构建本地项目时不需要 browserProxy。构建完成后可直接在现有产物工作台预览，没有常驻预览网关或新增状态表。关闭预览会卸载 iframe，构建容器已随作业结束销毁。

归档根目录必须有 `index.html`。支持本地 HTML、JS/TS、CSS、受支持的本地资源和纯浏览器 Svelte 组件，由镜像内固定的 esbuild/Svelte 工具链打包为自包含 HTML；支持这类 Vite 项目的根路径资源布局。只对 import.meta.env 提供固定 production 字段，不支持 import.meta.url 或运行期 computed import。不会执行项目 package scripts、构建配置或安装依赖，配置文件只忽略；不支持 SvelteKit、任意 npm 包或任意 Vite 插件。归档内不能包含 node_modules。仅支持一个 module 入口，入口内可导入多个本地模块；暂不支持 srcset、async/defer 脚本和嵌套 iframe 等文档。图片、字体和音视频内嵌为 data URL，本地 SVG 不能包含脚本或外部引用。项目展开最多 8 MiB，单源码与最终 HTML 各最多 1 MiB，构建命令最多 60 秒；仍受 Runner 外层限额。构建失败不发布先前的 HTML。预览继续使用无 same-origin 的隔离 iframe 和宿主父页面 `frame-src` 策略，不能把项目编译当作开放网络执行。

<a id="从网址生成可编辑介绍视频"></a>

#### 场景：从网址生成可编辑介绍视频

AI 层的 `ai.tools.createBuiltinTools({ context, files, executeJob? })` 可把 `website_video` 加入 `video` 组；只有提供 `executeJob` 才登记。宿主将该回调限定为同一工具服务的 `web_capture/video_render` 调用，沿用授权、Runner 及产物访问，不在应用重新写视频生成逻辑。

输入 HTTPS `url`，可选目标 `goal`、6～30 秒的 `durationSeconds`（默认 15）、画布 `width/height`（默认 1280×720，偶数、16:9/9:16/1:1，最多 1920×1080 总像素）、`language`（默认 zh-CN）、`voice/model/brandColor`。模型负责根据实际网页内容生成脚本和分镜，TTS 为每镜生成 WAV，再组装工程并调用视频作业渲染。

流程保留 SCRIPT.md、DESIGN.md、STORYBOARD.json、可编辑 STORYBOARD.md、每镜 WAV、SRT、网页截图封面、工程 ZIP、video-workflow.json 和 MP4。返回 `sourceUrl/captureId/scriptId/storyboardId/audioIds/projectId/subtitlesId/coverId/videoId/durationSeconds/artifacts`；封面来源为网页采集，不用生成图片冒充网站画面。

重试可传 `captureId` 复用采集。修改分镜 Markdown 后传 `storyboardId`，并用 `audioIds` 复用未改的配音：audioText 与 narration 相同的镜头沿用原音频，只重做有变化的部分。工程 ZIP 也可直接交 `video_render` 重渲染。字幕按句分段，不承诺逐词对齐；配音总时长放不进目标时长时明确失败，不截掉语音。

宿主还需确保 `web_capture` 与 `video_render` 按全局选择实际启用。Hai Agent 按 `workbench.selection` 的 groups/tools 并集再应用 exclude，只有两个依赖都可用时才登记 `website_video`；只选 video 组或只选 website_video 工具不足以启用完整流程。可选择 web/video 两组，或同时明确选择 website_video/web_capture/video_render。任务设置的依赖授权不会覆盖全局停用。

需要实际 LLM、默认 WAV TTS、web/video 环境和 browserProxy。较长流程可将服务 `runTimeoutMs` 设为 1200000；协调任务使用普通容量，嵌套作业使用已绑定的工具环境，避免互相占满工具槽位。真实模型和 HyperFrames 渲染需按部署另行验收。

#### 工厂参数

`tools.createArtifactTools({ context, files })` 需要 `ToolArtifactAccess.read/publish`，可选 `save`。未提供 `save` 时不包含 `artifact_save`。宿主负责版本、冲突、资源权限和字节存储。

`tools.createJobTools({ context, files, runner, environments, browserProxy? })` 的 `environments` 可配置以下键；省略的环境不生成对应工具。

| 环境键 | 工具 | 能力和出口要求 |
| --- | --- | --- |
| `documents` | `documents_extract/documents_generate` | 文档固定镜像；离线 |
| `office` | `office_convert/office_recalculate` | Office 固定镜像；离线 |
| `ocr` | `ocr_recognize` | OCR 固定镜像；离线 |
| `browser` | `browser_navigate` | 浏览器能力；内部网络与受控代理 |
| `web` | `web_capture` | 网页采集能力；内部网络与受控代理 |
| `preview` | `preview_build` | `preview.build` 固定构建镜像；离线 |
| `video` | `video_render` | 视频固定镜像；离线 |

`browser/web` 需要同时配置环境和 `browserProxy` 才进入目录。`browserProxy` 是可信宿主提供的 `http://非 loopback IPv4:port`，通过 `RunnerLaunch.env.HAI_TOOL_BROWSER_PROXY` 交给容器；模型不能指定或覆盖。可以复用已有模型出口代理，不要求另建一个代理服务。

browserProxy 必须是完整 IPv4 和显式端口组成的 HTTP 根地址（`http://<IPv4>:<port>`，可带结尾 /），端口为 1～65535；不支持主机名、IPv6、凭据、其他路径、query 或 fragment。拒绝 0.0.0.0、127.0.0.0/8、169.254.0.0/16、224.0.0.0/4。无效代理不会加入 browser/web 工具，宿主应先核对部署配置。

office/ocr 是环境键，其作业归 documents 组；browser/preview 环境的作业归 web 组。启用 documents/web 组并配置对应环境即可。

web/video 环境可从 resources.pids: 512 起测，并同步配置能容纳并发资源总量的 Runner toolCapacity；自定义资源对象须完整提供四项。实测浏览器在 128 的进程/线程额度下出现过 EAGAIN，512 是本次镜像的验收起点，不是适用于所有镜像和并发的保证。内存、CPU 与临时盘也需按负载测量。

视频环境本轮配置 `resources.scratchMiB: 6144`，节点配置 `toolCapacity.scratchMiB: 8192`；这些字段属于 Runner，不是 Tools 的新配置项。HyperFrames 0.9.56 在渲染前硬性要求临时目录与输出目录各至少有 1024 MiB 可用空间。含输入文件时 Runner 的 tmp 只分到总 scratchMiB 的四分之一，6144 MiB 为 tmp 留 1536 MiB；总量 512 MiB 无法满足该检查。配额不是已占用内存，不能绕过磁盘检查。节点物理预算还需覆盖视频、并发作业及 host 编排的 default 容量；6144/8192 是本轮起测值，不代表所有负载或完整流程已验收。详见 [作业资源说明](../../../packages/tools/jobs/README.md#配置)。

映射值是 Runner 环境 ID，而不是镜像名称。每个环境还须登记匹配的 capability、固定镜像及资源/网络配额，见 [作业说明](../../../packages/tools/jobs/README.md) 和 [Runner 配置](../configuration/runner.md)。安装 Tools 不会下载镜像或启动容器。

AI 层的 website_video 仅在 `ai.tools.createBuiltinTools` 提供 `executeJob` 时登记，宿主仅转发同服务 web_capture/video_render。需要实际 LLM、默认 WAV TTS、web/video 环境及 browserProxy；长流程可显式设置服务 runTimeoutMs: 1200000，见 [功能流程](tools.md#从网址生成可编辑介绍视频)。
