# Hai Agent

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

Hai Agent 是一个网页版多用户工作台。登录后可以和真实智能体协作、引用资料、审批工具操作、查看代码差异及取回产物。任务、知识、附件、记忆和个人偏好按登录账号分开。

## 快速开始

需要仓库锁定的 Node.js 与 pnpm。启动真实智能体还需要 Linux cgroup v2、Docker 或 Podman、可访问的模型网关，以及预建的 Agent 镜像。开发默认使用 SQLite、LanceDB、本地文件和内存缓存，可先打开页面验证登录及资料管理。

```sh
pnpm install --frozen-lockfile               # 输入已提交锁文件，安装应用和工作区包。
pnpm exec turbo run build --filter=agent^... # 输入应用名，构建所依赖的框架包。
pnpm --filter agent build                    # 使用仓库配置生成可运行的 Web 应用。
NODE_ENV=development pnpm --filter agent preview --mode dev # 用开发配置运行构建产物并打印访问地址。
```

在 `apps/agent/.env.local` 设置 `HAI_IAM_REGISTER_ENABLED=true` 允许本地创建账号。按下面的配置登记至少一个后端和 Runner 环境。纯浏览器测试会初始化独立账号与数据目录。

## 使用方式

登录后可从工作区顶栏选择液态玻璃主题，刷新时会恢复已保存的选择。

任务搜索会在服务端查询当前主体的活动或归档任务，包括较早的记录。「加载更多」会继续读取任务、文件及产物，知识库选文件和手动工具选资源也支持继续加载。

| 功能           | 操作                                                                                             | 可观察结果                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 对话和任务     | 新建任务、选择后端、输入问题并发送                                                               | 返回任务、消息流和终态。可搜索任务、加载旧消息、改名、归档或恢复。刷新或切换 API 节点后继续看进度                        |
| 执行与权限     | 「任务设置」选择自动、共享、个人或独占。设置权限、审批、模型、时限和输出格式，点「预览执行计划」 | 显示实际模式和理由。排队和执行中可停止。用户可仅允许一次、允许本会话、保存相同操作规则或拒绝。规则可以复用和撤销         |
| 文件及工程     | 上传文本附件，或选择管理员分配的 Git 项目分支                                                    | 会话只访问已授权对象。工程任务在私有工作区运行，回合成功后在「产物」和「改动」查看补丁，可下载或经确认推送到独立任务分支 |
| 工具与技能     | 在「工具」选择操作和预设直接运行，或在任务设置勾选同一目录中的工具，在输入框选择已发布的技能     | 对话和右侧面板显示工具状态及已脱敏的输入输出。文档、Office、OCR 和浏览器可单独配置工具镜像                               |
| 知识库         | 创建个人知识库，输入文本或选已上传文件，完成索引后在消息中引用                                   | 右侧显示实际检索到的标题与片段。失败时可重试；删除文档后不再参与检索                                                     |
| 记忆及个人偏好 | 添加、搜索、编辑或删除记忆；在个性化中配置默认模式、回答偏好、朗读音色与记忆策略                 | 应用只读取当前主体的偏好和记忆。单个任务可以关闭记忆，新增建议默认先确认                                                 |
| 语音           | 录麦克风或上传 WAV/MP3；对完成的回复点「朗读」                                                   | 转写文本先进入输入框，可编辑后发出。朗读可停止。录音需要 HTTPS 或 localhost                                              |
| Token 和上下文 | 长对话或切换后端时允许带上历史摘要                                                               | 对话展示估算，后端回报用量时右侧另显示实测值。过长的历史会在新原生会话中压缩为摘要                                       |

对话提交响应丢失时，重新打开原任务以核对同一轮次。核对期间显示提交确认状态。取得回执后继续显示进度并可取消。缓存故障导致退出未确认时按提示重试，原 Cookie 用于完成同一会话的撤销。

### 各执行模式

| 模式     | 隔离和适用场景                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auto`   | 只读、无工具和外部资料且后端支持时可用共享模式。普通任务可以在同一账号内复用；工程和完全访问使用独占                                                         |
| `shared` | DeepSeek Harness 的固定 ACP 镜像可由管理员启用。仅运行无工具只读对话，同租户共用进程、各账号各自保留对话。附件、个人偏好、知识、记忆及技能进入个人或独占任务 |
| `user`   | 只在同一主体、启动配置一致时复用。每一会话仍单独授权与路由                                                                                                   |
| `task`   | 每个任务会话独占工作区和 Worker 限额。挂载项目和完全访问由此模式处理                                                                                         |

## 产物与手动工具

「产物」可直接新建 Markdown、HTML、表格和图表。Markdown 普通段落和标题支持可视编辑，代码、Mermaid、表格及复杂块保留源码；复杂内容也可在「源码」编辑。表格和图表复用框架现有组件，图片、音频和视频通过授权地址预览或下载。

「保存版本」以读取时的版本为条件写入。版本历史可只读查看并恢复为新草稿；遇到其他页面先保存，界面会保留本地草稿，可复制后读取最新版。这里的文档版本独立于工程的 Git revision。AI 选区改写先显示提议，用户应用后再保存。

HTML 预览允许脚本交互，使用没有 same-origin 权限的 iframe 和默认离线资源策略。服务端提供媒体授权，部署方还需维护预览来源和真实网络边界，不能把浏览器预览当成容器执行环境。

「工具」按名称搜索，优先使用表单和示例。文件及参考图片可按名称选择已上传文件或已有产物，仍提供手填 ID 兜底；复杂对象在高级参数中编辑。执行后显示实际排队、运行、取消中和完成状态，产物可直接打开。取消后会继续读取到真实终态；刷新状态可恢复一次中断的等待。

手动操作和智能体调用共用 `@h-ai/tools-runner` 服务，产物工具由 `@h-ai/tools/server` 提供。任务设置使用稳定的工具名，如 `artifact_create`。外部 MCP 工具按 `mcp_<配置 id>` 命名。两种入口使用同一目录和启用策略，执行节点会重新检查授权。MCP 工具经 Broker 和工具服务转发到 `ai.mcp.services.invoke`。 [工具服务接入](../../docs/usage/function/tools-runner.md#quick-start)

已启用组和已配置环境共同决定工具目录：文档产物及数据分析无需独立镜像；图像、语音和改写需要相应 AI 模型；文档、Office、OCR、网页采集、项目网页构建和视频渲染需要对应 Runner 环境。未绑定环境的作业不出目录。`video_render` 渲染准备好的项目包，完整「网址生成介绍视频」由 AI 工作流编排这些步骤，见下节。

离开产物前，菜单、切任务、新建、登出和 SPA 导航都会先确认未保存改动；取消时保留草稿。工具提交先在地址记录幂等键，取得回执后替换为不透明任务引用，离开工具或刷新可继续查询。响应丢失时锁定原工具和参数，重试沿用同一编号，避免重复付费任务；恢复查询期间也不会清除旧回执。开始另一操作需确认旧任务可能继续，再使用新编号。地址不保存身份或参数；硬刷新只恢复查询入口，内存参数需重新核对。

### 项目网页预览

上传根目录含 `index.html` 的项目 ZIP，在工具中选择 `preview_build` 并按名称选择文件。绑定 `environments.preview` 后，固定离线构建器将支持的本地 HTML、JS/TS、CSS 与纯浏览器 Svelte 组件打包为一个 HTML 产物，再在现有隔离预览中打开。它属于 `web` 组，本地构建不需 browserProxy。关闭预览即卸载 iframe，不保留常驻预览服务。

支持受限的 Vite 目录布局，不执行 package scripts、Vite/Svelte/TypeScript 配置或下载依赖，不支持 SvelteKit、任意 npm 包、node_modules 或插件。只允许一个 module 入口，暂不支持 srcset、async/defer 和嵌套文档；资源须为支持的本地文件。ZIP 展开最多 8 MiB、单源码和最终 HTML 各 1 MiB、构建命令最多 60 秒。构建失败不发布旧页面。 [项目预览支持范围](../../docs/usage/function/tools-runner.md#web-preview)

### 网址介绍视频

全局 `workbench.selection` 还须实际启用 `web_capture` 与 `video_render`。可选择 web/video 两组，或在 tools 中同时列出 website_video/web_capture/video_render；groups/tools 取并集后 exclude 优先。只选 video、只选 website_video 或排除任一依赖时，完整流程不会进入目录。任务设置不能覆盖全局停用。

配置 LLM、默认 WAV TTS、web/video 环境及 browserProxy 后，在工具中选择 website_video，输入 HTTPS 网址和目标，可设置 6～30 秒时长及横屏、竖屏或方形画布。流程采集真实网页、生成脚本分镜、逐镜配音、组装工程，再输出 MP4。

结果保留脚本、设计、可编辑分镜 Markdown、WAV、字幕、网页封面、工程 ZIP 和工作流清单。修改分镜后带 storyboardId 重跑，可用 captureId 复用采集、audioIds 复用未改配音；字幕按句分段，配音过长会明确失败，不裁掉语音。工程包可单独重渲染。 [视频流程参数与恢复步骤](../../docs/usage/function/tools-runner.md#website-video)

## 配置

本机私有值放在 `.env.local`，相同字段的进程环境覆盖文件。完整参数见 [.env.example](.env.example) 和 [ACP 配置](../../docs/usage/configuration/ai.md#acp-接入与模型能力)。

`config/_kit.yml` 设置可信代理、访问规则和固定窗口限流。默认每个可信客户端 IP 每 60 秒最多请求 360 次，生产计数使用共享 Redis。 [Kit 入口配置](../../docs/usage/configuration/kit.md)

| 配置                                              | 用途                                                                                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HAI_AI_LLM`                                      | 登记模型 ID、协议、基址、凭据和能力。Codex 使用上游的 Responses，DeepSeek Harness 可使用 Chat。模型用于附件检索时还需配置 `llm.scenarios.embedding` 和真实维度                                                      |
| `HAI_AI_ACP`                                      | 为 `agents` 登记 ID、适配器、模型 ID 和环境 ID。已验收的 DeepSeek Harness 共享配置才设 `sharedMode: true`，该设置使用镜像默认命令及环境                                                                             |
| `HAI_AI_IMAGE`                                    | 图像生成模型、场景默认 ID 和服务端凭据                                                                                                                                                                              |
| `HAI_AI_AUDIO`                                    | ASR/TTS 模型、对应场景默认 ID 和服务端凭据                                                                                                                                                                          |
| `HAI_RUNNER`                                      | 唯一且重启稳定的 `nodeId`、引擎、执行角色、固定镜像与资源配额。模型和工具出口用允许清单代理；容器只接入内部网络                                                                                                     |
| `HAI_AGENT`                                       | 当前部署的租户、workbench 开关与 selection 选择策略、作业环境和 browserProxy、外部工具映射、公开技能及项目清单。项目填写绝对可信 Git 目录、已登记 ref、可读用户名和可发布用户名。发布仅允许已登记远端和独立任务分支 |
| `HAI_AGENT_TOOLURL`、`HAI_AGENT_TOOLPORT`         | 执行节点自己的 MCP Broker 可达 URL 和监听端口。Web 节点可以执行查询及审批。外部服务和各工具输入 Schema 在模型进入运行前登记                                                                                         |
| `HAI_DB`、`HAI_CACHE`、`HAI_VECDB`、`HAI_STORAGE` | 多进程分别使用共享 PostgreSQL、Redis、Qdrant 及 S3。所有执行节点和 API 节点使用一致的配置和项目基线；Tools 复用原有 Runner 表、租约和事件，不新建队列或状态表                                                       |

### 工作台按需启用

在 `config/_agent.yml` 的现有配置中追加，或用 `HAI_AGENT` JSON 覆盖；环境 ID 对应已经登记的 Runner 环境，不是镜像名称。

```yaml
workbench:
  artifacts: true
  tools: true
  selection:
    groups: [documents, image, audio, web, video, analysis, mcp]
  environments:
    documents: document-tools
    web: website-capture
    preview: website-preview
    video: video-render
  browserProxy: http://172.28.0.1:4318
```

`artifacts/tools` 默认均为 true；完全省略 `selection` 时默认选择示例中的内置组，显式 `selection: {}` 则全部停用。`selection.groups/tools` 取并集后应用 `selection.exclude`，可单独启用或排除工具，名称与 Tools 的 ToolSelection 一致。`environments` 默认空。按需添加 `environments.office/ocr/browser/preview` 环境映射；Office 和 OCR 工具归 `documents` 组，浏览器截图和项目预览归 `web` 组，不存在同名的 office/ocr/browser 工具组。默认选择已包含 documents/web，绑定环境后即可按这些组或具体工具名选择。`mcp` 组只包含服务器 `tools` 白名单中有明确 inputSchema 的成熟外部服务。环境及模型需单独配置，开关不会下载镜像或启动外部服务。

`browser/web` 只有同时存在环境和有效的 `browserProxy` 才出目录。代理由可信宿主设置为 `http://完整点分十进制 IPv4:显式端口`，端口为 1～65535，仅允许空路径或根路径 `/`。不接受 HTTPS、域名、IPv6、缩写/十六进制 IP、用户名/密码、非根路径、query 或 fragment；拒绝 `0.0.0.0`、`127.0.0.0/8`、`169.254.0.0/16` 和 `224.0.0.0/4`。格式不符合时对应网页/浏览器工具不会登记。可复用已有模型出口代理；应用经 `HAI_TOOL_BROWSER_PROXY` 交给作业，模型参数无法指定或覆盖。文档、Office、OCR、项目预览和视频渲染使用离线环境。镜像、capability 和网络策略见 [Tools 作业说明](../../packages/tools/jobs/README.md)。

web/video 对应的 Runner 环境建议从 `resources.pids: 512` 起做真实验收；本轮在 128 PID 限制下观察到过 `EAGAIN`。节点的 `toolCapacity.pids` 也需覆盖该环境和预期并发。512 是起测建议，不保证所有网页、分辨率或并发均可运行；CPU、内存、临时盘和执行期限仍需按实测配置。

视频 Runner 环境使用 `resources.scratchMiB: 6144`，节点使用 `toolCapacity.scratchMiB: 8192` 作为本轮起测预算。HyperFrames 0.9.56 要求 tmp 和 output 各至少有 1024 MiB 可用空间；Runner 在含输入时仅给 tmp 分配总临时盘的四分之一，旧的 512 MiB 总额会在渲染前失败。临时盘额度不等于内存已占用，节点还须覆盖 host 编排和并发，不能跳过磁盘检查。具体限制见 [作业配置](../../packages/tools/jobs/README.md#配置)，实际视频与完整流程仍需单独验收。

浏览器和任务仅接触授权文件 ID，读取、最终发布和保存时复核当前账号。Broker 沿用短期令牌和撤销机制，媒体下载支持 Range 并保留归属验证。撤销启用组或任务工具权限后，执行节点不能凭旧目录继续调用。

真实共享环境采用 TLS 反向代理，并显式管理 IAM 注册和账号。API 节点配置 Runner `executor: false`，Web 镜像默认不领取作业，内置确认发布任务分支所需的 Git 和证书。执行进程使用相同应用构建产物和各自的 Runner ID，宿主须有 Podman 或 Docker；启用工程功能时须同时安装 Git。有多个执行端时，每个端点都使用自己的 MCP Broker 地址。线上代理清理外部提供的 `X-Forwarded-*` 后再设置真实值。如果应用后端需要根据受信代理还原方案，可设置适配器的 `PROTOCOL_HEADER=x-forwarded-proto`。文件上传需在 Web 端和代理上允许相应请求体大小，SvelteKit Node 可设置 `BODY_SIZE_LIMIT=12M`。使用完全访问的管理员仍受容器资源、挂载和出口范围约束。

工具授权及项目清单均从服务器配置读取。模型调用用限域中继凭据，真实上游密钥放在中继端；不要通过可执行任务的环境变量发放通用账户密钥。项目示例最多导入 512 个普通文件和 16 MiB 输入，具体容量还受 Runner 临时盘约束。模式和后端变化可以带文本摘要，但跨 Worker 的原生历史和当前工作目录独立；应先保存需要的补丁。

新任务使用个性化中的记忆默认值。切换任务时清空未发送草稿和临时引用，附件、知识库和技能可在当前任务重新选择，已发送内容保存在各自的任务历史。

上下文接近模型预算时，应用保留最新一轮消息的有界摘录，再压缩较早的历史。历史面板仍显示原文，新一轮会标记「已压缩历史上下文」。

在 Web 节点和执行节点为对应服务用户准备同一 Git 提交。Web 容器以 UID 1000 运行，可将该用户拥有的工程目录只读挂载。远端需允许部署方使用自己的认证材料推送 `agent/` 分支，SSH 私钥和 `known_hosts` 由部署方从宿主只读挂入 `/home/node/.ssh`。

### 调用示例

服务端从已验证 IAM 会话构造 `scope`，下例假定后端和环境已经登记。保持每次请求和消息的业务 ID 稳定可重复提交。

```ts
import { ai } from '@h-ai/ai'

// 用已认证用户和 agent 租户创建调用入口，后续操作限定在这个主体。
const scoped = ai.acp.scoped({ tenantId: 'agent', userId: 'authenticated-user' })
// 选择 coder 和自动执行模式，用 job-123 去重。成功 data 是可跨 API 节点访问的会话。
const created = await scoped.sessions.create({
  agentId: 'coder',
  execution: { mode: 'auto' }
}, { idempotencyKey: 'job-123' })
if (!created.success)
  throw new Error(created.error.message)
// 发送提示词和本轮可访问的 project-docs，用 turn-1 去重。受理后 data 返回 taskId 和状态。
const accepted = await created.data.submit({
  prompt: '阅读资料并总结',
  idempotencyKey: 'turn-1',
  context: {
    knowledgeBaseIds: ['project-docs']
  }
})
if (!accepted.success)
  throw new Error(accepted.error.message)
// 按刚受理的 taskId 读取序号 0 之后最多 100 条持久事件。读取失败由 error 提供原因。
const page = await scoped.tasks.events(accepted.data.taskId, 0, 100)
if (!page.success)
  throw new Error(page.error.message)
```

## 开发与测试

```sh
pnpm --filter agent typecheck # 检查服务端路由和页面契约。
pnpm --filter agent test      # 验证任务写入、归属和回滚。
pnpm --filter agent test:e2e  # 在 Chrome 中验证应用用户流程。
pnpm --filter agent test:e2e e2e/workbench.spec.ts # 产物编辑、历史、冲突与隔离预览。
pnpm --filter agent test:e2e e2e/tools-workbench.spec.ts # Runner 真实工具提交、产物与权限。
```

E2E 通过受管入口分配独立数据目录；工具专用配置启用 Runner executor，默认浏览器配置仍不领取作业。跨节点禁用用例另需同数据库与 Storage、`selection: {}` 的 API 节点，并将地址传为 `AGENT_E2E_DISABLED_TOOLS_URL`；缺少该前置时该项明确跳过。

真实模型验收需要另外登记网关、模型和容器环境。以两个账号、两个执行节点检查共享进程隔离、断线续看、审批、模型、文件与工具归属。浏览器证据放入测试输出目录。

## 许可证

[Apache-2.0](../../LICENSE)
