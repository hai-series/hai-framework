# 搭建多用户 Agent 工作台

[开发指南](README.md) · [ACP 接入](ai-acp.md) · [工作台示例](../../../apps/agent/README.md)

`apps/agent` 是一个登录后就能提问、查资料或改代码的完整示例。左侧管理自己的任务，中间继续对话及审批，右侧打开工具结果、引用和代码差异。

## 从登录到第一次对话

1. 按[快速开始](../../../apps/agent/README.md#快速开始)启动。先使用本地数据库和文件存储，接入 Codex 的 Responses 网关或 DeepSeek Harness 的 Chat 网关。
2. 创建账号和任务。在「任务设置」保持自动模式，或手动选择共享、个人和独占。预览可查看实际模式、环境和模型。
3. 发出第一条消息后刷新。已经提交的轮次可从原任务继续读取。点击停止才会取消执行；资源释放由执行器核验。

共享模式在固定 DeepSeek Harness 镜像中提供只读对话，资料、工具、技能和个人上下文用个人或独占模式。选择工作区、写文件或完全访问时使用独占 Worker。

## 接入资料和权限

- 知识库由 `ai.knowledge.setup` 建立，`ingest` 导入，`retrieve` 只取授权范围内的命中片段。答案旁边可以查看实际引用。
- ACP 用 `scoped.sessions.create` 开启会话，`session.submit` 取得持久回执，`tasks.events` 带事件序号重新读取。通过 `approvals.respond` 记录一次授权、会话授权、长期同类规则或拒绝。
- 文件、代码补丁和工具产物经过当前账号的授权才可下载。保存的任务分支发布显式确认，Git 目标由服务器登记。
- 转写和朗读复用 `ai.audio`。个人偏好通过 `ai.persona` 组装，记忆使用 `ai.memory.scoped`，长对话保留原历史并让新会话使用有界摘要。

扩容时分别运行 API 和领取任务的节点。各节点共用 PostgreSQL、Redis、Qdrant 和对象存储，并保留一致的环境定义。执行节点使用固定镜像与限域出口代理。 [应用配置和输入输出示例](../../../apps/agent/README.md#配置)

## 直接创建、编辑和交付产物

不启动代码任务也能使用「产物」：新建 Markdown、HTML、表格或图表，编辑后保存版本；图片、音频和视频可通过授权地址预览及下载。Markdown 的普通标题和段落复用可视编辑器，代码、Mermaid、表格及复杂块保持原文，必要时切到源码编辑。

版本历史只读展示，恢复操作创建新草稿。并发保存遇到版本冲突时保留当前草稿，让用户先复制或读取最新内容；最终版本条件由服务端处理。文档版本与项目 Git revision 独立。HTML 预览允许脚本交互，iframe 不授予 same-origin 权限，默认限制外部资源；部署端继续控制预览来源与实际出口。

这些交互位于 `@h-ai/ui` 的 `ArtifactWorkspace/ToolWorkspace`。应用仅提供列表、读写、历史、改写和工具回调，不另建编辑器或轮询状态机。参见 [UI 工作台](../function/ui.md#工具与产物工作台)。

## 手动工具和智能体使用同一实现

在「工具」搜索操作、点示例填表，选择已上传文件或已有产物后运行。简单参数直接表单化；复杂结构留在高级参数。任务显示真实排队、运行、取消中和终态，完成后直接打开生成产物。取消回执只是停止请求，组件继续查询到终态。

应用从 `@h-ai/tools/server` 创建服务，组合 `tools.createArtifactTools`、`tools.createJobTools` 和 `ai.tools.createBuiltinTools`。手动界面与智能体 Broker 共用同一目录、启用策略和授权。任务设置选择稳定工具名（例如 artifact_create），外部 MCP 使用 mcp_<配置 id>，继续经同一服务调用已有 `ai.mcp.services.invoke`。短期令牌和撤销机制复用现有 Broker。

管理员通过 `HAI_AGENT.workbench` 设置 artifacts/tools 开关、selection 选择策略和 environments 环境映射。默认产物、工具开关为 true，环境映射为空；selection 完全省略时选择默认内置组，显式 {} 全部停用，可用 groups/tools/exclude 按组或单工具选择；未绑定环境的容器作业不显示。浏览器/网页还需要可信宿主的 browserProxy，使用 `http://非 loopback IPv4:port`，可复用现有模型出口代理，并以 HAI_TOOL_BROWSER_PROXY 传入作业，模型不可修改。完整配置见 [应用说明](../../../apps/agent/README.md#工作台按需启用) 和 [Tools 配置](../configuration/tools.md)。

服务复用 Runner 原有表、租约与事件和 Storage，不新建队列或 Tools 状态表。API 节点可关闭 executor，执行节点重新检查工具是否仍启用，以及当前用户、任务和最终资源权限。文件读取、版本保存、媒体下载及 Range 请求均保持账号归属验证。

上传根目录有 index.html 的项目 ZIP，绑定 `environments.preview` 后可用 web 组 `preview_build` 生成自包含 HTML，再由现有隔离产物预览打开。固定离线构建器支持本地 HTML/JS/TS/CSS 和纯浏览器 Svelte 组件，不执行项目脚本或配置、不下载依赖，不支持 SvelteKit 和任意 npm 包；无需常驻预览服务或 browserProxy。限额及具体支持范围见 [项目预览](../function/tools.md#从项目构建网页预览)。

配置实际 LLM、默认 WAV TTS、web/video 环境和 browserProxy 后，website_video 可从 HTTPS 网址生成脚本、可编辑分镜、逐镜音频、字幕、工程和 MP4。失败或修改后通过 captureId/storyboardId/audioIds 复用采集及未改配音；工程包也可直接重渲染。详细参数及真实依赖见 [网址视频流程](../function/tools.md#从网址生成可编辑介绍视频)。

## 冷启动、回复速度和资源实测

使用真实 DeepSeek 网关运行 Codex Responses 和 DeepSeek Harness Chat。测试在同一台 i7-12700K 主机运行两个 API 节点、两个执行节点，使用真实 PostgreSQL、Redis、Qdrant 和 RustFS S3。镜像已预拉取，Worker 限额为 0.5 CPU、420 MiB 内存、128 PID、120 MiB 临时空间。每组以相同的中文短问答测试三次，每次先启动新 Worker，再在同一 Worker 发送下一轮。

| 后端与模式 | Worker 冷启动中位数 | 界面首字（冷／热） | 完整回复（冷／热） | Worker 空闲／峰值 |
| --- | ---: | ---: | ---: | ---: |
| Codex 个人 | 2.27 秒 | 3.30／0.84 秒 | 5.10／1.70 秒 | 85／91 MiB |
| DeepSeek 共享 | 5.83 秒 | 8.41／1.88 秒 | 8.42／1.89 秒 | 128／152 MiB |
| DeepSeek 个人 | 6.15 秒 | 8.18／1.85 秒 | 8.18／1.86 秒 | 147／167 MiB |
| DeepSeek 独占 | 6.13 秒 | 9.40／1.85 秒 | 9.40／1.85 秒 | 147／169 MiB |

首字和完整回复均从点击发送计时，包含网关推理及浏览器事件轮询。冷启动测量 Worker 创建至原生协议就绪。空闲取中位数，峰值取三次测试的最大 cgroup 内存。短问答的热轮次消耗约 0.09–0.11 CPU 秒。四个应用进程在基础服务已就绪后约 1.4 秒可响应 HTTP，测试结束时每个进程的 PSS 约 123–136 MiB。Codex 精简镜像约 0.94 GiB，DeepSeek 文档镜像约 1.36 GiB，均为本地展开体积。不同模型、项目尺寸和并发量会改变这些数字。
