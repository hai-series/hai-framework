# ACP 智能体、工作区与工程会话

[AI 内容与模型](ai.md) · [ACP 配置](../configuration/ai.md#acp-接入与模型能力)

`ai.acp` 将能操作工程的智能体接入 Node 服务端，提供智能体维护、项目目录、原生会话、事件交互和显式 Git 操作。可以用于代码协作、工程问答或应用构建；用户权限、任务规则、预览、验收和业务部署由应用负责。

## 选择运行模式和传输

| 模式 | 如何接入 | 模型与工作目录 |
| --- | --- | --- |
| `embedded` | 安装原生程序，登记 adapter，可覆盖 command/args | 引用 Hai 模型；使用宿主 directory 工作区 |
| `builtin-service` | 构建 Agent 镜像，登记 image 和容器工作区 | 引用 Hai 模型；workspace/state 持久卷分别挂到 `/workspace`、`/state` |
| `custom-service` | 登记已有原生 ACP 服务的地址、transport、认证变量引用 | 服务端自行维护模型；创建会话传远端可见的 cwd |

本机/内置容器模式使用原生 stdio。远程模式显式选择 HTTP 或 WS，并在 `supportedTransports` 声明该服务实际支持的类型；请求不支持的类型会报错，不自动转换。HTTP/WS 使用锁定 SDK 的官方实验传输，部署双方需兼容。ACP 地址与模型 API、MCP 或 Agent 自带 Web UI 地址各有用途。

builtin-service 的 `engine: 'auto'` 优先就绪的 Podman，再尝试 Docker；显式选择不降级。镜像自行构建和部署，基础环境含 Git、Node、Python，可选 Java/Rust/Go。Codex 镜像同时安装 codex-acp 和原生 Codex CLI。工作区与智能体必须使用匹配的 image 和引擎。

## 登记模型、智能体和工作区

生产先初始化共享 RelDB/网络向量库，或注入满足要求的共享 AI Store；开发可使用临时 Store，但关闭后不保留登记与会话记录。AI 按 `ai.init → use → ai.close` 使用。生成模板默认没有接入 AI；安装依赖后去掉 `_ai.yml` 的一层外层注释，补充初始化、关闭及应用接口，配置文件存在不代表业务已经接通。

Codex 使用 `adapter: 'codex'`，DeepSeek Harness 使用 `adapter: 'deepseek-harness'`，通过 `modelIds` 选择已有 `llm.models`。同一份模型清单维护型号、协议、端点、凭据与能力，不在智能体中另维护一份模型。Codex 需要实际提供 Responses 的上游；Hai 现有协议转换是客户端调用能力，不提供供原生 Codex 使用的反向网关。DSH 自定义模型还需完整、已确认的容量、输入模态、工具与推理信息，见[配置说明](../configuration/ai.md#acp-接入与模型能力)。

`acp.agents/workspaces` 可在配置中定义，也可分别用 `ai.acp.agents/workspaces.register` 保存数据库。`agents.initialize(id)` 校验绑定并生成原生配置；`agents.check(id, { workspaceId })` 实际启动握手后关闭，用于确认运行环境和能力。Windows stdio 需要系统 PowerShell 可用；npm 的 `.cmd` 包装应改用 `command: 'node.exe'` 与 JS 入口参数数组。框架跟踪整个进程树，关闭时清理后台子进程；系统策略阻止启动时直接返回错误。

## 创建和恢复会话

以下例子假定配置中已有 `coder`、`project`，且 AI 已成功初始化。`prepare` 只克隆缺失工程、检查已有目录，不自动 pull、reset 或覆盖未提交成果；普通文件通过 `workspaces.importFiles(id, [{ path, content }])` 导入，拒绝覆盖、路径逃逸和符号链接。

```ts
import { ai } from '@h-ai/ai'

async function inspectProject() {
  const prepared = await ai.acp.workspaces.prepare('project')
  if (!prepared.success) return prepared
  const created = await ai.acp.sessions.create({
    agentId: 'coder', workspaceId: 'project', newWorktree: true,
  })
  if (!created.success) return created
  const response = await created.data.prompt([{ type: 'text', text: '阅读工程，说明结构与改进建议。' }])
  const closed = await created.data.close()
  if (!closed.success) return closed
  return response
}
```

一个 workspace 可包含多个 Git 工程和上传资料；每个工程必须明确 `mainBranch`，remote 默认 origin。共享会话使用同一个 `main/` 目录，框架限制同时占用；`newWorktree: true` 从各工程当前已提交的本地主分支建立同名会话分支，普通文件独立复制。它不自动拉取远端，也不包含主目录未提交修改。

正常关闭保留工程和原生状态。继续任务用 `ai.acp.sessions.resume(id, callbacks)`，只使用智能体声明的 load/resume 能力；原生不支持或模型/智能体定义已不兼容时返回失败。`sessions.remove(id)` 只移除关闭/失败的记录，不删除目录、worktree 或卷。

## 更新主分支与发布修改

- `session.updateMain()`：先停止本 session 执行环境，再逐仓 fetch 并 ff-only 更新登记的主分支；不把主分支合入 session 分支。
- `session.publish({ mode: 'push-branch', message, author: { name, email } })`：提交独立会话修改，以同名分支推送各工程。
- `session.publish({ mode: 'merge-main', message, author })`：提交后检查并更新各工程明确的主分支，再合并和普通 push。

发布只适用于框架管理的独立 worktree 会话，避免把共享目录修改错误归属给某个任务；应用可将其映射为确认后的按钮或指令。无 force push，脏主目录、分歧或占用会报错。多仓库不具备原子性；部分失败通过 `error.cause.reports` 返回各仓 success、phase、commit、error，已经完成的提交/推送保留。继续编码须显式 resume。

没有 Git 的项目可以使用普通文件；涉及 Git 而命令缺失会返回 `ACP_GIT_NOT_FOUND`。托管 Git 检测到子模块或 LFS 属性时返回 `ACP_UNSUPPORTED`，不将缺失内容报告为准备成功。自备执行环境可使用低层 `connect`，其 Git 生命周期由应用负责。

## Goose 原生 HTTP/WS 接入

框架提供 Goose 1.57.0 镜像。由部署方启动其原生 `goose serve`，挂载工作目录和状态卷，在 Goose 端配置模型（例如 `GOOSE_PROVIDER=openrouter`、`GOOSE_MODEL`、`OPENROUTER_API_KEY`），并单独设置 `GOOSE_SERVER__SECRET_KEY`。Hai 的 custom-service 不接收或注入这些模型配置。

```ts
import { ai } from '@h-ai/ai'

// ai 已初始化；服务已启动，HAI_GOOSE_SECRET 是宿主中的服务认证变量。
async function openRemoteProject() {
  const registered = await ai.acp.agents.register({
    id: 'goose', name: 'Goose', mode: 'custom-service',
    transport: 'http', url: 'http://127.0.0.1:3284/acp',
    supportedTransports: ['http', 'ws'],
    headerEnv: { 'X-Secret-Key': 'HAI_GOOSE_SECRET' },
  })
  if (!registered.success) return registered
  return ai.acp.sessions.create({ agentId: 'goose', cwd: '/workspace' })
}
```

WebSocket 使用 `transport: 'ws'` 和 `ws://.../acp`，同样支持 `X-Secret-Key`。缺少或错误凭据会被服务拒绝。工作目录是远端路径，不能传成本机 workspace ID；服务、卷、Git 和远程 TLS 由部署方维护。依据：[固定版本 Goose ACP 文档](https://github.com/aaif-goose/goose/blob/v1.57.0/documentation/docs/gdk/acp/index.md)。

## 交互、结果与应用边界

`onEvent` 接收原生事件，`session.stream` 逐项迭代，提前结束迭代会取消本轮。权限默认拒绝；需要文件、终端或 elicitation 时，提供可信 `handlers` 并声明实际能力，终端需要完整回调组。图片、音频和远程 MCP 按握手能力使用；`mcpServerIds` 可选择合并清单中的外部服务。

普通 API 先判断 `HaiResult.success`；stream 失败在迭代时抛错。有 messageId 时，prompt.text 采用最后一条消息；缺少边界时可能包含 commentary 和最终文本。严格结构化结果用 `promptStructured(content, zodSchema)`，只接受完整结束且通过 Schema 的唯一 JSON，不猜测或截取夹杂说明的内容。取消、超时、输出无效和不支持能力不会自动重试外部操作。

应用负责身份/项目归属、工具授权、外部 Git 凭据和业务副作用。worktree 是文件分支隔离，不是安全沙箱；只读或跨租户执行还需部署权限约束。关闭或清理失败须保留现场并检查拥有的进程/容器，异常失联不按 TTL 直接抢占目录。

配置与数据库清单的来源、只读规则及 CAS 更新统一见[配置手册](../configuration/ai.md#配置与数据库清单)。完整 API 示例、容器和错误码见[共享 ACP 指南](../../../packages/cli/templates/skills/hai-ai/acp.md)与[资源清单指南](../../../packages/cli/templates/skills/hai-ai/resources.md)，生成项目会复制到 `.agents/skills/hai-ai/`。
