# Tools 与 Agent 成果工作台

本文解释工具平台的用途、模块边界和接入方法。最初的能力调研见[能力清单与建设建议](codex-capabilities-and-tools-plan.md)；当前实现以本文和模块手册为准，验收进度见[实施清单](tools-platform-tasks.md)。

## 用户可以做什么

Agent 的“工具工作台”负责选择工具、填写参数、查看进度和打开结果；“成果”负责查看、编辑、保存和再次使用这些结果。智能体与用户手动操作使用同一批工具和同一套权限检查。

| 能力 | 用户操作与结果 | 复用的框架能力 |
| --- | --- | --- |
| Markdown 文档 | 创建文档，可视化或源码编辑，选择文字让 AI 提出修改，确认后保存；查看历史、恢复草稿 | UI 的 AiDocumentEditor，AI 的 LLM，应用版本服务 |
| 表格和图表 | 编辑单元格；根据结构化数据生成汇总、表格与图表 | AiTableEditor、Chart、Tools 数据分析 |
| 网页预览 | 创建 HTML，直接操作隔离预览；将受支持的多文件网页项目构建为预览 | ArtifactWorkspace、可选的 preview_build 作业 |
| 图片 | 用文字生成图片，或选择已有图片作为参考继续生成 | AI 已有图片 Provider；成果库保存真实图片 |
| 语音 | 文字生成可播放音频；选择音频转写成文字文档 | AI 已有语音合成、转写 Provider |
| 网页采集和搜索 | 采集正文、来源、截图和素材；通过已配置 MCP 服务搜索 | 可选的网页镜像、受控出口代理、现有 MCP |
| 网址介绍视频 | 网址 → 脚本、分镜、配音、字幕、工程文件、封面和 MP4；复用已有阶段重新制作 | AI 的 LLM/Audio，Tools 作业，Runner |
| 原生 Office 文件 | 用标题、段落、表格或幻灯片资料生成真实 DOCX/XLSX/PPTX | 可选的 documents 镜像 |
| 既有文件工具 | 提取文字、Office 转换与重算、OCR、网页截图 | 从 AI 迁入 Tools 的既有独立作业 |
| 外部业务工具 | 接入成熟的搜索或业务 MCP 服务，按白名单调用 | 现有 ai.mcp 服务目录和授权 Broker |

图片、语音、外部搜索和容器作业需要对应模型、服务或镜像。启用某个工具组不会自动部署这些依赖；没有配置作业环境时，该作业不会进入目录。真实外部服务的验收结果单独记录，不能由单元测试代替。

## 为什么把 Tools 单独拆出来

文档转换、网页构建和数据分析也会被普通业务调用，不应要求调用者初始化 AI 模型。Tools 因此拥有中立的工具定义和执行契约，AI 只负责模型协议和模型能力。

| 归属 | 负责什么 | 状态由谁保存 |
| --- | --- | --- |
| `@h-ai/tools` | 定义、注册、输入校验、授权、截止时间与取消信号 | 轻量注册器只在当前进程存在 |
| `@h-ai/tools/server` | 目录、启用选择、任务提交/恢复/取消，以及通用文件作业 | 复用 Runner，Tools 不建状态表或队列 |
| `@h-ai/ai` | 模型调用、Tools 协议适配、图片/语音/改写/视频编排、MCP 桥接 | 沿用 AI 和 MCP 的既有状态 |
| `@h-ai/runner` | 领取任务、执行归属、容量、容器、事件与清理 | Runner 的数据库和租约 |
| `@h-ai/ui` | 参数表单、资源选择、编辑器、预览、进度和恢复交互 | 草稿等短期界面状态 |
| 应用 | 当前用户身份、资源归属、内容版本、HTTP 接口与装配 | 既有资源表、版本表和 Storage |

依赖方向是 `AI → Tools → Core`。Tools 的根入口保持浏览器可用；只有服务端入口使用 Runner。Agent 不复制编辑器、工具执行器或任务调度器。

## 新增一个工具

普通同步或异步业务从 `tools.define` 开始。下面的工具可以直接调用，也可以登记到工具服务后供 UI 和模型使用。

```ts
import { tools } from '@h-ai/tools'
import { z } from 'zod'

// 定义 word_count 的参数 Schema 和执行逻辑，返回可执行的工具对象。
const wordCount = tools.define({
  name: 'word_count',
  description: 'Count the words in a text.',
  parameters: z.object({ text: z.string().max(10000) }),
  handler: ({ text }) => ({ words: text.trim().split(/\s+/u).filter(Boolean).length }),
})

// 传入 Hello Hai 进行校验和计词；成功 data.words 为 2，输入不合规时返回失败。
const result = await wordCount.execute({ text: 'Hello Hai' })
if (result.success) {
  // result.data.words 为 2。
}
```

处理器原本返回 `HaiResult` 时使用互斥的 `resultHandler`，以保留原业务错误。需要额外授权时，将可信的身份与授权函数交给注册器或工具服务，不从工具参数中接收用户身份。

服务端改从 `import { tools } from '@h-ai/tools/server'` 导入，再通过 `tools.createService({ runner, createTools, enabled, authorize, ... })` 装配工具。`createService/createArtifactTools/createJobTools` 不在浏览器根入口。将新工具加入 `createTools` 返回的 `tools` 和相应 `groups` 即可；不需要为每个工具增加一套路由或前端组件。标题、Schema 字段说明和 `examples` 会进入通用表单；复杂参数仍可使用高级 JSON。

工厂不会初始化或关闭借入的 Runner。服务使用完毕调用 `service.close()`，应用再按自己的生命周期反序关闭基础模块。完整示例见 [Tools 功能手册](usage/function/tools.md)与[接入 skill](../packages/cli/templates/skills/hai-tools/server-guide.md)。

| 调用入口 | 用途 |
| --- | --- |
| `tools.createRegistry()` | 当前进程直接注册和执行工具，无数据库依赖 |
| `tools.createService()` | 创建借用 Runner 的服务，供业务、UI 和模型共用 |
| `service.catalog/submit/inspect/find/cancel/invoke` | 发现、提交、查询、按幂等键恢复、取消、等待结果 |
| `tools.createArtifactTools/createJobTools` | 复用文本成果、数据分析和固定容器作业 |
| `ai.tools.adapt` | 将中立工具转换成模型协议，复用原执行实现 |
| `ai.tools.createBuiltinTools/createMcpTools/createBroker` | 装配模型能力和现有 MCP，供 Agent 使用 |

旧的 `ai.tools.define/createRegistry` 已删除，同批调用方已迁移。

## 选择启用哪些能力

Agent 在 `HAI_AGENT` 或 `config/_agent.yml` 中配置：

```yaml
workbench:
  artifacts: true
  tools: true
  selection:
    groups: [documents, image, audio, web, video, analysis, mcp]
    exclude: [image_generate]
  environments:
    documents: documents-local
    preview: preview-local
    web: web-local
    video: video-local
```

`groups` 与单独指定的 `tools` 取并集，最后排除 `exclude`。完全省略 `selection` 时使用 Agent 默认组；显式 `selection: {}` 停用全部工具。Office/OCR 属于 `documents` 组，网页截图与项目预览属于 `web` 组。模型与外部服务继续使用各自原有配置。

环境 ID 必须指向 Runner 已登记的固定镜像、能力与资源预算。网页采集还需要可信宿主提供受限出口代理，并满足浏览器沙箱前置条件；离线文档、项目构建和视频渲染不开放外网。具体配置见 [Agent README](../apps/agent/README.md#配置)和[作业说明](../packages/tools/jobs/README.md)。

停用会同时影响目录和执行节点的重新校验，不能只隐藏按钮。旧任务仍可由原所有者查询、恢复或请求取消。

## 一台机器与多节点怎样部署

单机可以沿用 SQLite、本地 Storage 和现有应用配置；只运行轻量工具时，不需要容器镜像或新的基础服务。需要哪种作业才构建和登记哪种镜像。

多节点沿用应用已有的共享数据库、缓存和对象存储。API 节点可以设置 Runner `executor: false`；执行节点启用 executor、使用唯一稳定的 `nodeId`，并使用相同服务 ID、工具定义和环境配置。Tools 不增加第二份队列、租约或业务任务状态。智能体的短期 MCP Broker 绑定仍归签发进程所有；每个执行节点提供自己的可达地址，不能把同一个绑定随机转发到其他节点。

幂等键标识一次用户意图。响应未知时，先用同一键恢复查询；重试继续使用原参数和原键。数据库领取和产物提交不等于所有第三方服务都能“恰好一次”执行，自定义外部写操作仍须实现自己的幂等约束。

## 几个关键使用边界

- AI 改写先显示建议，再由用户应用；保存携带基础版本，并发冲突时保留本地草稿。
- 可视化编辑保留不支持回写的复杂 Markdown 块；源码入口处理复杂选区。历史恢复生成新版本，不覆盖历史。
- HTML 运行在无同源权限的 iframe 中，并限制联网；宿主同时设置 `frame-src 'self'`。关闭预览即卸载 iframe。
- 项目构建只处理固定工具链支持的浏览器源码；不执行项目脚本、配置文件或安装任意依赖。构建成功发布新 HTML，失败不发布旧结果。
- 网址视频保留脚本、分镜、配音、字幕与工程。修改后的分镜可以复用未变配音；实际语音超出目标时长时明确失败，不截断旁白。
- 取消回执表示请求已被受理；需要观察 Runner 终态与清理结果，不能据此承诺第三方已立即停止。
- 所有读取、保存、下载与任务查询都检查当前主体和资源归属。内置媒体和作业返回资源引用，大文件不放进模型上下文；外部 MCP 的内容仍按服务原协议返回，应在外部服务侧控制结果大小。

## 继续阅读

- [Tools 配置](usage/configuration/tools.md)、[功能](usage/function/tools.md)、[数据归属](usage/data/tools.md)
- [AI 模型与工具](usage/function/ai.md)、[UI 工作台](usage/function/ui.md)、[Agent 使用](usage/development/agent.md)
- [实施与验收清单](tools-platform-tasks.md)
