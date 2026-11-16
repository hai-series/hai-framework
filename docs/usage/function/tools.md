# @h-ai/tools 功能说明

通过 `tools` 定义、注册和执行业务工具。同一份实现可由普通业务、界面或 AI 调用。

[模块 README](../../../packages/tools/README.md) · [配置](../configuration/tools.md) · [数据归属](../data/tools.md)

## 选择入口

| 入口 | 适用场景 | 执行与生命周期 |
| --- | --- | --- |
| `@h-ai/tools` | 短时业务函数、浏览器本地工具、模型协议适配前的中立定义 | `tools.define/createRegistry` 为纯定义与工厂，无 `init/close`，不加载 Runner 或模型 SDK |
| `@h-ai/tools/server` | 可恢复任务、进度与取消、文档及独立容器作业 | 保留轻量方法，增加 `tools.createService/createArtifactTools/createJobTools`；借用已初始化的 Runner |

浏览器可导入轻量入口，但服务端权限仍由可信服务端验证。不要把 `/server` 导入前端。

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

## 轻量公开方法

| 方法 | 用途与返回值 |
| --- | --- |
| `tools.define` | 名称、描述、Zod Schema 和处理函数 → 工具实例，默认超时 30 秒 |
| `tools.createRegistry` | 可选 `authorize` → 注册器实例 |
| `tool.execute` | 业务输入、可选执行上下文 → `Promise<HaiResult<TOutput>>` |
| `tool.toDefinition` | 中立定义：名称、标题、描述、输入 JSON Schema、示例 |
| `registry.register/registerMany` | 登记工具 → `HaiResult<void>`；重名不覆盖，批量原子登记 |
| `registry.replace` | 显式替换已有名称 → `HaiResult<void>` |
| `registry.get/has/getNames/getDefinitions` | 查询当前集合和中立定义 |
| `registry.execute` | 名称、输入、可选上下文 → `Promise<HaiResult<unknown>>` |
| `registry.executeAll` | `{ name, input }[]` → `Promise<HaiResult<unknown[]>>`；默认串行 |
| `registry.unregister/clear/size` | 停用、清空和统计当前进程中的集合 |

`tool` 和 `registry` 是工厂返回的实例，不是包级独立函数。注册器不隐式发现其他工具，只接受 `tools.define` 创建的实例，拒绝手写或复制的对象。

工具名使用 1～64 个 ASCII 字符，以字母开头，其余为字母、数字、下划线或连字符。无效名称、默认超时或处理函数组合属于开发配置错误，定义时抛出 `TypeError`。供模型使用的参数须能转换成 JSON Schema，通常使用对象 Schema；`z.date()` 等不可表达类型不能直接用作模型参数。

错误常量 `HaiToolsError` 包含 NOT_FOUND、ALREADY_REGISTERED、VALIDATION_FAILED、EXECUTION_FAILED、FORBIDDEN、TIMEOUT、CANCELLED，使用 `hai:tools` 命名空间。参数、授权、超时和取消返回失败 `HaiResult`；`resultHandler` 保留已有业务错误，模型 JSON 解析错误仍由 AI 适配层处理。

固定作业返回 `TIMEOUT` 时映射为 `HaiToolsError.TIMEOUT`；不安全的 Office 文档、项目或其他已知输入拒绝映射为 `VALIDATION_FAILED`。沙箱/依赖缺失、无效的作业输出和未知工作进程错误仍是 `EXECUTION_FAILED`，不能归咎于用户参数。公开提示使用本地化消息，不直接显示工作进程原文。作业和容器清理同时失败时，保留清理失败主错误，并在 `error.ext.operationError` 保留脱敏后的首次作业错误；仅有一次失败时不增加这份扩展。

## 服务端任务接入

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

| 服务方法 | 输入 | 结果 |
| --- | --- | --- |
| `service.catalog` | 可信上下文 | 已启用的定义和分组 |
| `service.submit` | `{ name, input, idempotencyKey? }`、上下文 | Runner 状态、`receipt: { id, key }`、事件和可选输出 |
| `service.find` | 幂等键、可信上下文 | 找回同主体已受理的任务；不存在时 data 为 undefined，不代表原请求已取消 |
| `service.inspect` | 完整回执、上下文、可选 `{ after }` | 当前状态及增量事件，`next` 用于下次读取 |
| `service.cancel` | 完整回执、上下文 | 取消请求后的实际状态；继续读取到终态 |
| `service.invoke` | 与 submit 相同 | 提交并等待终态，返回 `HaiResult<RunnerJson>` |
| `service.close` | 无 | 移除本服务处理器；不关闭 Runner，也不代表活跃任务已停止 |

每次返回业务结果都先判断 `success`。`invoke` 适合需要最终结果的业务调用；长任务界面通常使用 `submit/inspect`，保存完整回执并显示 `queued/running/cancelling` 等实际状态。取消回执不等于进程已退出。

`enabled` 必填：组与独立工具取并集，再应用 `exclude`；空对象表示全部停用。`catalog` 按当前工厂和启用策略生成，不调用逐工具 `authorize`，如需按用户隐藏目录，使用上下文相关的 `createTools/enabled`。提交和执行节点都会重建启用集合并授权，工具被禁用后不能靠旧目录继续执行。

## 复用产物与作业工具

| 工厂 | 已提供能力 | 宿主需提供 |
| --- | --- | --- |
| `tools.createArtifactTools` | `artifact_create/read/save`、`data_analyze` | `context`、`files`；只有提供 `files.save` 才包含保存工具 |
| `tools.createJobTools` | 文档提取与生成、Office 转换与重算、OCR、浏览器截图、网页采集、项目网页构建、视频渲染 | `context`、`files`、已初始化的 `runner`、`environments` 映射；浏览器类还需 `browserProxy` |

`artifact_create` 创建 Markdown、HTML、表格或图表；表格和图表内容须是 JSON 对象。`artifact_save` 携带 `baseVersion`，冲突和最终写入由宿主处理。`data_analyze` 对结构化行计算数量、总和、均值、最小值和最大值，并发布表格、图表引用，不执行任意代码。

独立作业按环境绑定才加入目录：`documents` 对应 `documents_extract/documents_generate`，`office` 对应 `office_convert/office_recalculate`，`ocr` 对应 `ocr_recognize`，`browser` 对应 `browser_navigate`，`web` 对应 `web_capture`，`preview` 对应 `preview_build`，`video` 对应 `video_render`。具体输入、固定镜像、能力和网络要求见 [作业说明](../../../packages/tools/jobs/README.md)。缺少环境的工具不会出现；`browser/web` 还需可信宿主提供 `browserProxy`。代理格式为 `http://非 loopback IPv4:port`，可复用已有模型出口代理，经 `HAI_TOOL_BROWSER_PROXY` 交给作业而不是模型参数。有环境仍需通过 Runner 能力和网络策略检查。

图像、语音和文档改写使用 [AI](ai.md) 的 `ai.tools.createBuiltinTools`，与上述工厂组成同一个 `ToolSet`；Tools 不反向依赖 AI。`video_render` 接收已准备的项目包；完整「网址到介绍视频」使用下面的 AI 编排流程。

`documents_generate` 接收 `format: docx/xlsx/pptx`、标题及可选段落、表格或幻灯片，生成固定格式的 Office 文件。UTF-8 JSON 资料最多 256 KiB；段落与表格按格式校验，PPTX 每页最多 6 段、每段 160 字且合计 800 字，表格最多 6 列、6 行数据、单元格 32 字；有表格时正文限一段 120 字。`slides` 仅用于 PPTX，不能与顶层段落或表格并用。内置预设可直接填入工作台，再修改标题和内容。

`artifact_create` 和 `data_analyze` 在受管执行中为各个逻辑输出分配稳定 ID，宿主继续核对重试产物的内容一致性。分析表格保留原始列标签；来源包含编辑器保留的 `row_id` 列时，会为该来源列分配其他字段名，避免覆盖数据。内部行标识按行序确定，生成文件名保留后缀并限制在 160 字符内。

工具组与环境键分开：office/ocr 作业属于 documents 组，browser/preview 作业属于 web 组；启用相应组后再绑定这些环境键，无需虚构同名组。

工具服务沿用 Runner 的大小限制：提交参数、单条事件和最终输出各最多 512 KiB JSON。文件/产物的 50 MiB 上限是字节限制，不表示可把同等大小内容塞进 JSON；容器输入还受 50 MiB 与环境 scratchMiB 中较小值约束。即使工具 Schema 允许更长文本或更多行，也须满足整个任务的 JSON 预算；大内容使用授权文件引用。详见 [Runner 任务与输入边界](runner.md#恢复任务读取事件和取消)。

## 从项目构建网页预览

`preview_build({ fileId })` 读取授权的项目 ZIP，用可选 `environments.preview` 环境中的固定 `preview.build` 作业，生成一个 `text/html`、`kind: html` 产物。工具属于 `web` 组；仅构建本地项目时不需要 browserProxy。构建完成后可直接在现有产物工作台预览，没有常驻预览网关或新增状态表。关闭预览会卸载 iframe，构建容器已随作业结束销毁。

归档根目录必须有 `index.html`。支持本地 HTML、JS/TS、CSS、受支持的本地资源和纯浏览器 Svelte 组件，由镜像内固定的 esbuild/Svelte 工具链打包为自包含 HTML；支持这类 Vite 项目的根路径资源布局。只对 import.meta.env 提供固定 production 字段，不支持 import.meta.url 或运行期 computed import。不会执行项目 package scripts、构建配置或安装依赖，配置文件只忽略；不支持 SvelteKit、任意 npm 包或任意 Vite 插件。归档内不能包含 node_modules。仅支持一个 module 入口，入口内可导入多个本地模块；暂不支持 srcset、async/defer 脚本和嵌套 iframe 等文档。图片、字体和音视频内嵌为 data URL，本地 SVG 不能包含脚本或外部引用。项目展开最多 8 MiB，单源码与最终 HTML 各最多 1 MiB，构建命令最多 60 秒；仍受 Runner 外层限额。构建失败不发布先前的 HTML。预览继续使用无 same-origin 的隔离 iframe 和宿主父页面 `frame-src` 策略，不能把项目编译当作开放网络执行。

## 从网址生成可编辑介绍视频

AI 层的 `ai.tools.createBuiltinTools({ context, files, executeJob? })` 可把 `website_video` 加入 `video` 组；只有提供 `executeJob` 才登记。宿主将该回调限定为同一工具服务的 `web_capture/video_render` 调用，沿用授权、Runner 及产物访问，不在应用重新写视频生成逻辑。

输入 HTTPS `url`，可选目标 `goal`、6～30 秒的 `durationSeconds`（默认 15）、画布 `width/height`（默认 1280×720，偶数、16:9/9:16/1:1，最多 1920×1080 总像素）、`language`（默认 zh-CN）、`voice/model/brandColor`。模型负责根据实际网页内容生成脚本和分镜，TTS 为每镜生成 WAV，再组装工程并调用视频作业渲染。

流程保留 SCRIPT.md、DESIGN.md、STORYBOARD.json、可编辑 STORYBOARD.md、每镜 WAV、SRT、网页截图封面、工程 ZIP、video-workflow.json 和 MP4。返回 `sourceUrl/captureId/scriptId/storyboardId/audioIds/projectId/subtitlesId/coverId/videoId/durationSeconds/artifacts`；封面来源为网页采集，不用生成图片冒充网站画面。

重试可传 `captureId` 复用采集。修改分镜 Markdown 后传 `storyboardId`，并用 `audioIds` 复用未改的配音：audioText 与 narration 相同的镜头沿用原音频，只重做有变化的部分。工程 ZIP 也可直接交 `video_render` 重渲染。字幕按句分段，不承诺逐词对齐；配音总时长放不进目标时长时明确失败，不截掉语音。

宿主还需确保 `web_capture` 与 `video_render` 按全局选择实际启用。Hai Agent 按 `workbench.selection` 的 groups/tools 并集再应用 exclude，只有两个依赖都可用时才登记 `website_video`；只选 video 组或只选 website_video 工具不足以启用完整流程。可选择 web/video 两组，或同时明确选择 website_video/web_capture/video_render。任务设置的依赖授权不会覆盖全局停用。

需要实际 LLM、默认 WAV TTS、web/video 环境和 browserProxy。较长流程可将服务 `runTimeoutMs` 设为 1200000；协调任务使用普通容量，嵌套作业使用已绑定的工具环境，避免互相占满工具槽位。真实模型和 HyperFrames 渲染需按部署另行验收。

## 模型接入、取消与多节点

轻量注册器可通过 `ai.tools.adapt(registry)` 接入模型：`getDefinitions()` 用于模型请求，`execute(toolCall)` 转为同一注册器的业务调用。服务端界面与智能体也应共用同一个工具服务，避免授权和工具实现分叉。

轻量执行的期限依次为绝对 `deadline`、单次 `timeoutMs`、工具超时、默认 30 秒；覆盖异步参数校验、授权和处理函数。取消或超时能停止等待并透传信号，不响应信号的函数仍可能继续执行。进程停止与资源回收由 Runner 确认。

服务注册 Runner 任务类型 `hai.tools.<id>.v1`，沿用 Runner 的任务、租约和事件，不新建队列或 Tools 状态表。各节点使用一致的服务 ID、工具配置和共享 Runner 数据库及 Storage；API 节点可设 `executor: false`，执行节点提供镜像和唯一稳定的节点 ID。完整回执同时核对任务、服务和主体归属，不能只接受一个任务 ID。

大文件只返回授权产物引用，文件读取和发布仍由宿主验证。日志及事件不写入密钥或图片、音视频正文。

## 开发测试

`pnpm --filter @h-ai/tools test` 验证内核与服务，`pnpm --filter @h-ai/tools test:jobs` 验证独立作业协议。真实镜像和浏览器验收另按作业说明准备环境；单元测试不代表镜像已验收。
