# AI 工具包装与统一服务

工具定义、Schema 校验、授权及执行使用 `@h-ai/tools`；长任务使用 `@h-ai/tools/server` 的同一个 `tools.createService`。AI 只增加模型协议、既有 AI 能力包装与 MCP 桥接，不拥有第二个注册器或任务队列。业务结果先检查 `success`，已有 `HaiResult` 的工具用 `resultHandler`，不能把失败对象作为普通成功数据返回。

## 公开入口

| 入口 | 输入 | 结果与用途 |
| --- | --- | --- |
| `ai.tools.adapt(registry)` | 已登记的中立注册器 | `getDefinitions/execute/executeAll` 模型协议适配，不提供注册管理 |
| `ai.tools.createBuiltinTools(options)` | 可信 context、资源 files、可选 executeJob | 直接返回 `ToolSet`，不立即请求模型 |
| `ai.tools.createMcpTools(options)` | context、管理员登记的 definitions、实时 authorize | `HaiResult<ToolSet>`，复用 `ai.mcp.services.invoke` 连接成熟服务 |
| `ai.tools.createBroker({ service, url })` | 已创建的工具服务及固定 HTTP 地址 | `HaiResult<BuiltinToolBroker>`，把同一目录开放给原生 Agent |

这些工厂不需要单独初始化；实际图片、语音和 LLM 调用前仍须按 AI 的配置与生产存储约束初始化 `ai`。`/server` 和这些服务端包装不导入浏览器。浏览器工作台通过已授权的应用 HTTP 接口调用。

## 图片、语音与文档

`BuiltinToolOptions.context` 使用服务传入的 `ToolServiceContext`，包括可信 scope、可选 sessionId/signal 和 Runner 补充的 execution。不得由模型提供身份。`files` 复用 `ToolArtifactAccess`：`read` 重新验证归属后返回字节，`publish` 保存字节并返回 `{id,title,kind,version,mediaType}`。宿主负责存储与版本事务，模型、Runner 结果和事件只传引用。

| 稳定工具名 | 主要参数 | 输出与行为 | 组 |
| --- | --- | --- | --- |
| `image_generate` | prompt、可选 model/referenceIds/size | 调用既有图片能力并保存产物；参考图片逐项授权 | image |
| `audio_synthesize` | text、可选 model/voice/language/speed/format | 保存可播放 MP3/WAV；复用既有音频转换与时长约束 | audio |
| `audio_transcribe` | fileId、可选 model/language/timestampGranularities | 保存 transcript.md，同时返回文本和 Provider 实际提供的时间段 | audio |
| `document_rewrite` | id、instruction，可选 content/selectedText/baseVersion/model | 返回 `{content,baseVersion,proposal:true}` 提议，不自动保存 | documents |

工作区改写传入当前草稿及 baseVersion。选区必须在草稿中恰好出现一次；版本过期或选区歧义时失败。手动工具调用省略 content/baseVersion 时使用刚授权读取的当前文档。最终保存仍由资源服务按 baseVersion 做冲突检查。

Schema 自带本地化 title/description 和示例。`format:'artifact-id'`、`format:'artifact-ids'` 标记资源选择字段，通用 UI 可据此生成表单；选择值仍需服务端授权。

```ts
import type { BuiltinToolOptions } from '@h-ai/ai'
import { ai } from '@h-ai/ai'
import { ok } from '@h-ai/core'
import { tools } from '@h-ai/tools'

export function registerBuiltinTools(options: BuiltinToolOptions) {
  const set = ai.tools.createBuiltinTools(options)
  const registry = tools.createRegistry()
  const registered = registry.registerMany(set.tools)
  if (!registered.success)
    return registered
  return ok({ set, registry, modelTools: ai.tools.adapt(registry) })
}
```

可恢复任务把该 ToolSet 与 `tools.createArtifactTools/createJobTools` 的结果合并，交给同一个服务。创建工具不等于启用；`enabled` 仍需显式选择，submit 和真正执行时都重新检查启用状态与授权。服务端装配见 [Tools 服务指南](../hai-tools/server-guide.md)。

## 网址转介绍视频

只有向 `createBuiltinTools` 注入 `executeJob(request, context)` 时才登记 `website_video`（video 组）。宿主回调只允许同一可信 scope/session 下的固定 `web_capture`、`video_render`，通过同一个工具服务的 `invoke` 调用；不能允许模型借此运行任意命令。

所需能力为：真实 LLM、支持 WAV 的 TTS、已登记的 web/video Runner 环境、受控浏览器出口代理与资源存储。host 工具走 Runner default 容量，容器作业走 tool 容量；API 与执行节点保持相同工具配置。服务的 `runTimeoutMs` 需覆盖完整制作，例如 1,200,000ms，原子工具自身的超时仍生效。不另建任务队列或租约。

输入为 HTTPS url、可选 goal、durationSeconds（6～30，默认15）、width/height（默认1280×720）、language（默认zh-CN）、voice、model（仅脚本 LLM）、brandColor。宽高为偶数，支持16:9、9:16或正方形，总像素不超过1920×1080。模板使用逻辑画布缩放，并限制各场景的标题与正文密度。

固定流程依次执行网页采集、结构化脚本与分镜、逐镜配音、字幕及本地 HTML 工程组装、真实 MP4 渲染。模型仅生成经 Schema 校验的文案，不生成待执行的 HTML/Node/Python；模板会转义内容，不导入网站脚本。ZIP 在解压前检查条目、路径、链接、加密、目录与本地头一致性和大小，再限制真实展开量；截图限制解码像素。项目和视频仅引用本地素材。

保留 SCRIPT.md、DESIGN.md、STORYBOARD.json、可编辑 STORYBOARD.md、逐镜 WAV、SRT、封面、HTML 工程 ZIP、video-workflow.json 及 MP4。结果返回 sourceUrl、captureId、scriptId、storyboardId（Markdown）、audioIds、projectId、subtitlesId、coverId、videoId、durationSeconds 和 artifacts。`coverSource:'website-capture'` 表示封面来自网站截图。字幕为每句配音的时段，不承诺逐词时间戳。合成前读取当前语音模型的能力，仅声明 targetDuration 的模型才传入目标时长；其他模型不假定支持时长控制。时长按 WAV 实际数据计算，流式未知长度头会规范化；配音超过目标总时长时明确失败，不裁掉音频。

阶段重做直接使用已有产物：

- 传 captureId 跳过网页采集；可继续调整 goal 生成新脚本。
- 编辑 STORYBOARD.md 的 JSON，再传 storyboardId。narration 与 audioText 相同则复用原 audioId；改变某镜 narration 只重做该镜配音。
- 可传与场景数量一致的 audioIds，null 表示重新合成该镜；复用文件仍重新验证归属及 WAV 格式。
- 编辑工程 ZIP 后直接调用 video_render，无需再执行 LLM 或 TTS。

进度事件使用 capture/script/narration/render/complete 阶段。取消经信号传播到模型和固定作业，仍须读取 Runner 的真实取消终态。父进程意外退出后，不宣称所有独立容器作业已经停止；按 Runner 状态和各自期限核对。

## MCP 与 Agent

已有搜索、检索或外部服务通过 `ai.tools.createMcpTools` 加入同一个 ToolSet；definitions 附带 serviceId/tool，使用已登记服务的真实 inputSchema。上游凭据和连接仍由 AI MCP 服务管理，授权回调必须复核当前主体和任务。

`ai.tools.createBroker({service,url})` 复用已有 MCP Broker 的短期令牌、撤销和 HTTP 传输。`broker.bind({scope,sessionId,tools,ttlMs?,signal?})` 只接受当前目录里的精确工具名，返回 `MCPServiceBinding`：servers 传给当前 Agent，任务结束调用 revoke。ttlMs 复用既有 MCP 绑定契约，默认 900000 毫秒（15 分钟），可选整数 1..86400000；Hai Agent 明确传 1200000，与工具服务的 20 分钟执行窗口一致。较短父 signal、撤销和 Broker 关闭仍立即取消绑定，TTL 不延长工具本身或 Runner 的执行期限。Agent 的 ACP 任务设置仍限制 runTimeoutMs 最多 600000 毫秒（10 分钟）；20 分钟是 Tools 服务上限，不能据此承诺模型任务可执行 20 分钟。宿主把 `broker.handleRequest` 挂到固定 HTTP 路由；工具启停和提交/执行授权仍由同一服务负责，不能只隐藏界面。

`broker.close()` 只撤销自己的绑定，`service.close()` 只注销自己的 Runner 处理器，都不关闭借入的 Runner。多节点继续共用 Runner 与 Storage，稳定 service id、镜像和权限策略保持一致；短期 Broker 地址应能从对应 Agent 节点访问，并路由回签发绑定的进程；绑定不跨进程复制，不将同一令牌随机分发给其他节点。
