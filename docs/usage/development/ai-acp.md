# ACP 智能体、工作区与工程会话

[AI 内容与模型](ai.md) · [ACP 配置](../configuration/ai.md#acp-接入与模型能力)

## 多用户应用的受管调用

服务端从登录态取得 `tenantId` 和 `userId`。启动时先初始化 RelDB 和 Runner，再把 Runner 注入 `ai.init(config, { runner })`。同一部署的 API 实例与执行节点使用共享数据库和相同的已登记环境。API 节点可设置 Runner `executor: false`，执行节点负责 Podman 或 Docker 容器。结束时依次关闭 ai、Runner 与基础模块。

```ts
import { ai } from '@h-ai/ai'

async function answer(identity: { tenantId: string, userId: string }, requestId: string) {
  const agent = ai.acp.scoped(identity)
  const plan = await agent.plan({ agentId: 'assistant' })
  if (!plan.success) return plan
  return agent.run({
    agentId: 'assistant',
    prompt: '把这次讨论整理成三条待办',
    idempotencyKey: requestId,
    execution: { mode: 'auto' },
  })
}
```

| 分配模式 | 适用任务 | 复用范围 |
| --- | --- | --- |
| `shared` | 只读、无私有上下文的受控问答 | 同租户复用通过共享验收的适配器进程，每个会话独立路由 |
| `user` | 同一用户的多项持续任务 | 同一用户且启动配置一致时复用，分别关闭原生会话 |
| `task` | 需要隔离文件、写入或完整权限的任务 | 一个业务会话使用一个容器 |
| `auto` | 业务方未指定隔离方式 | 应用策略允许个人复用时选 user，否则在经过验收的只读场景选 shared，其余使用 task |

Codex、DeepSeek Harness 和 Goose 使用固定版本的原生协议。内置适配器的共享模式仍需安全验收，当前默认走独立容器。持续对话使用 `scoped.sessions.create`、`session.prompt` 和 `session.close`。`session.changeExecution({ mode: 'task', acceptNewSession: true })` 保留业务会话 ID，结束旧原生会话并创建新会话。需要延续任务背景时，可传当前用户确认可带入的 `historySummary`，上限为 8 KiB UTF-8。摘要作为不可信历史文本随首次请求送入 `user` 或 `task` 会话，权限按新会话的规则重新检查。摘要发送失败后，由调用方决定是否重新提供。跨 Worker 可移交文本摘要，原生历史恢复和持久可写项目挂载仍待实现。

受管调用可用 `workspaceId` 读取项目快照。应用在 `acpPolicy.allowWorkspace(scope, workspaceId)` 检查权限，并在 `resolveWorkspace(scope, workspaceId, signal)` 从业务存储返回 `Record<string, Uint8Array>`。执行节点在启动前加载文件，最多 8 个平铺文件，总量取 16 MiB 与环境 `scratchMiB` 中的较小值。文件名由 ASCII 字母或数字开头，后接字母、数字、点、下划线或连字符，最长 128 字符。`auto` 选择独占任务。容器从 `/input` 只读快照，在 `/workspace` 保存临时副本。工作区权限在每轮重新核验，需要立即撤销挂载时关闭会话，已发送给模型的内容按应用数据策略处理。

可选参数包括已登记模型、环境、资源、权限、排队和执行时限、输出格式与原生适配器扩展。部署默认值作为起点，应用可以用 `plan` 查验实际选择。JSON 输出可带 JSON Schema，解析失败时返回输出错误。逐轮使用 `session.prompt` 或 `session.stream` 可调整输出格式、时限和事件观察器。用相同主体和幂等键重试同一单次任务时，会读取已有结果。任务 ID 也可用于 `scoped.tasks.get`、`scoped.tasks.events` 和 `scoped.tasks.cancel`。

应用可通过 `acpPolicy` 绑定上下文和工具。`allowContext` 验权后，`resolveContext` 提供允许进入模型的知识片段、记忆和附件，`resolveSkills` 提供授权的技能内容，`commitMemory` 用轮次 ID 提交记忆或登记待确认写入。`allowTools` 与 `bindTools` 按任务提供 HTTP MCP 入口，适合接入内置或第三方服务。任务内的审批事件通过 `scoped.approvals.respond` 回答，支持允许一次、本会话允许、保存匹配规则和拒绝。应用的 `resolvePermission` 负责把原生请求校验到具体文件、目标或操作，Runner 的网络和挂载边界始终生效。

使用 `scoped.approvals.rules(offset, limit)` 查看有效规则，使用 `revoke(id)` 撤销。可以在新会话通过 `permissions.ruleIds` 指定允许复用的持久规则。升级前保存的规则仍可查看和撤销，重新批准后才会复用。工具入口按工具隔离输入 Schema，且在每次调用时复核目录和应用权限。默认凭据有效期为 15 分钟。`bindTools` 返回 Broker 的 `signal` 时，到期或撤销会结束当前轮次，后续调用返回 `ACP_CLOSED`。应用可显式创建会话，重新检查权限并签发凭据。

执行节点使用标准 Store 按批清理到期审批和授权。受管会话、任务索引和幂等意图至少保留 7 天，关联执行已由 Runner 清理后才回收。自定义关系 Store 通过 `queryKeys` 和 `removeIfUnchanged` 接入后台清理。Runner 的 `retentionMs` 可调整执行记录的保留时间。

失联宿主和控制任务进入 `unknown`。运维用 `runner.reconcileUnknown(scope, id, { operatorId, reason, hostResourcesStopped: true })` 释放占用，需要从相同 Linux 宿主和 PID 命名空间核实原进程已退出，并确认自管资源停止。子任务须等待父任务完成或核验。需要长期展示业务历史时，由应用保存获准保留的结果。

`ai.acp` 将能操作工程的智能体接入 Node 服务端，提供智能体维护、项目目录、原生会话、事件交互和显式 Git 操作。可以用于代码协作、工程问答或应用构建；用户权限、任务规则、预览、验收和业务部署由应用负责。

## 选择运行模式和传输

| 模式 | 如何接入 | 模型与工作目录 |
| --- | --- | --- |
| `embedded` | 安装原生程序，登记 adapter，可覆盖 command/args | 引用 Hai 模型；使用宿主 directory 工作区 |
| `builtin-service` | 构建 Agent 镜像，登记 image 和容器工作区 | 引用 Hai 模型；workspace/state 持久卷分别挂到 `/workspace`、`/state` |
| `custom-service` | 登记已有原生 ACP 服务的地址、transport、认证变量引用 | 服务端自行维护模型；创建会话传远端可见的 cwd |

本机/内置容器模式使用原生 stdio。远程模式显式选择 HTTP 或 WS，并在 `supportedTransports` 声明该服务实际支持的类型；请求不支持的类型会报错，不自动转换。HTTP/WS 使用锁定 SDK 的官方实验传输，部署双方需兼容。ACP 地址与模型 API、MCP 或 Agent 自带 Web UI 地址各有用途。

使用 `pnpm --filter @h-ai/ai agent:build codex-acp --variant=documents` 构建带文档库的 Agent。可选 `minimal`、`documents`、`office`、`browser` 和 `developer`。默认 `minimal` 包含 Git、Node 和原生 Agent，Codex 还包含 bubblewrap。将脚本返回的本地 `imageId` 或推送后取得的清单 digest 登记到 Runner 环境。普通 `builtin-service` 使用匹配的 Agent 和工作区 `image`，`engine: 'auto'` 优先就绪的 Podman，其次为 Docker。[构建选项](../../../packages/ai/models/agents/README.md)

Podman 容器关闭远程服务的代理自动继承，避免把宿主 `127.0.0.1` 代理带进容器。需要代理时，通过 Agent 或 workspace 的 `environmentRefs` 显式引用容器能访问的代理地址；宿主回环地址不能直接当作容器的宿主地址。

## 登记模型、智能体和工作区

生产先初始化共享 RelDB/网络向量库，或注入满足要求的共享 AI Store；开发可使用临时 Store，但关闭后不保留登记与会话记录。AI 按 `ai.init → use → ai.close` 使用。生成模板默认没有接入 AI；安装依赖后去掉 `_ai.yml` 的一层外层注释，补充初始化、关闭及应用接口，配置文件存在不代表业务已经接通。

Codex 使用 `adapter: 'codex'`，DeepSeek Harness 使用 `adapter: 'deepseek-harness'`，通过 `modelIds` 选择已有 `llm.models`。同一份模型清单维护型号、协议、端点、凭据与能力，不在智能体中另维护一份模型。Codex 需要实际提供 Responses 的上游；Hai 现有协议转换是客户端调用能力，不提供供原生 Codex 使用的反向网关。DSH 自定义模型还需完整、已确认的容量、输入模态、工具与推理信息，见[配置说明](../configuration/ai.md#acp-接入与模型能力)。

DSH 直连官方 DeepSeek Chat 时，为模型设置 `protocol: 'chat'` 和 `baseUrl: 'https://api.deepseek.com'`。使用内部模型中继时，可保留 `deepseek-flash`、`deepseek-v4-pro` 等官方模型名以自动应用兼容设置。Harness 通过 `system` 角色传递指令，并在连续工具调用时保留推理字段。 [DeepSeek Chat API](https://api-docs.deepseek.com/api/create-chat-completion/)

`acp.agents/workspaces` 可在配置中定义，也可分别用 `ai.acp.agents/workspaces.register` 保存数据库。`agents.initialize(id)` 校验绑定并生成原生配置；`agents.check(id, { workspaceId })` 实际启动握手后关闭，用于确认运行环境和能力。Windows stdio 需要系统 PowerShell 可用；npm 的 `.cmd` 包装应改用 `command: 'node.exe'` 与 JS 入口参数数组。框架跟踪整个进程树，关闭时清理后台子进程；系统策略阻止启动时直接返回错误。

## 创建和恢复会话

以下例子假定配置中已有 `coder`、`project`，工作区登记了 `web` 仓库，且 AI 已成功初始化。`prepare` 只克隆缺失工程、检查已有目录，不自动 pull、reset 或覆盖未提交成果；普通文件通过 `workspaces.importFiles(id, [{ path, content }])` 导入，拒绝覆盖、路径逃逸和符号链接。

```ts
import { ai } from '@h-ai/ai'

async function inspectProject() {
  const prepared = await ai.acp.workspaces.prepare('project')
  if (!prepared.success) return prepared
  const created = await ai.acp.sessions.create({
    agentId: 'coder', workspaceId: 'project', repositoryId: 'web', newWorktree: true,
  })
  if (!created.success) return created
  const response = await created.data.prompt([{ type: 'text', text: '阅读工程，说明结构与改进建议。' }])
  const closed = await created.data.close()
  if (!closed.success) return closed
  return response
}
```

一个 workspace 可包含多个 Git 工程和上传资料；每个工程必须明确 `mainBranch`，remote 默认 origin。共享会话使用同一个 `main/` 目录，框架限制同时占用；`newWorktree: true` 从各工程当前已提交的本地主分支建立同名会话分支，普通文件独立复制。它不自动拉取远端，也不包含主目录未提交修改。

使用 `repositoryId` 时，Agent 进程和原生会话均从指定仓库的根目录启动，恢复使用同一目录。把适用于该工程的 `AGENTS.md` 和固定版本的技能放在所选仓库中，由原生执行器发现。省略时使用聚合目录。选择仅作用于工作目录，其他登记仓库仍参与 worktree 创建及 Git 发布。远程 `custom-service` 继续使用服务端可见的 `cwd`。

正常关闭保留工程和原生状态。继续任务用 `ai.acp.sessions.resume(id, callbacks)`，只使用智能体声明的 load/resume 能力；原生不支持或模型/智能体定义已不兼容时返回失败。`sessions.remove(id)` 只移除关闭/失败的记录，不删除目录、worktree 或卷。

## 将工作树交给预览

成功创建受管会话后，`session.info()` 的 `workspace` 包含会话目录、各登记仓库的绝对路径和存储位置。`info.cwd` 是 Agent 当前绑定的目录。目录模式可以直接使用本机路径。卷模式由可信的同节点执行器使用 `workspace.storage.engine`，将 `workspace.storage.name` 挂到 `workspace.storage.mountPath`，再进入对应仓库路径。Git 工作树的链接需要保持原挂载路径。用于读取的预览可挂只读卷，需要写缓存的开发服务器应单独安排可写目录。

预览可以读取未提交的改动，并在 `session.close()` 后继续运行。要释放工作树，先由应用停止预览，提交或另存所需改动，然后调用 `ai.acp.sessions.reclaimWorktree(id)`。它拒绝活动会话、有未提交改动或已被锁定的工作树，只删除登记在该任务下的干净工作树。Git 分支、普通文件、原生历史和卷都保留。已有会话若缺少归属记录，需沿用人工回收。

回收过程中断时，按同一 ID 重试。开始移除后的记录会显示 `reclaiming`，全部完成后为 `reclaimed`。两个状态下的路径仅供追溯，无法再用于恢复会话或发布；需要移除记录时，在回收完成后调用 `sessions.remove(id)`。

## 更新主分支与发布修改

登记的相对 Git 地址以工作区根目录为基准，准备、更新和发布使用同一远端。Agent 异常退出后仍可显式 close：协议取消失败不会阻止对所拥有进程/容器的退出核验；无法确认退出时继续保留占用。并发删除和同 ID 重建在创建记录前争用同一会话锁，忙碌失败不会留下 opening 记录。

- `session.updateMain()`：先停止本 session 执行环境，再逐仓 fetch 并 ff-only 更新登记的主分支；不把主分支合入 session 分支。
- `session.publish({ mode: 'push-branch', message, author: { name, email } })`：提交独立会话修改，以同名分支推送各工程。
- `session.publish({ mode: 'merge-main', message, author })`：提交后检查并更新各工程明确的主分支，再合并和普通 push。

发布只适用于框架管理的独立 worktree 会话，避免把共享目录修改错误归属给某个任务；应用可将其映射为确认后的按钮或指令。无 force push，脏主目录、分歧或占用会报错。多仓库不具备原子性；部分失败通过 `error.cause.reports` 返回各仓 success、phase、commit、error，已经完成的提交/推送保留。继续编码须显式 resume。

没有 Git 的项目可以使用普通文件；涉及 Git 而命令缺失会返回 `ACP_GIT_NOT_FOUND`。托管 Git 检测到子模块或 LFS 属性时返回 `ACP_UNSUPPORTED`，不将缺失内容报告为准备成功。自备执行环境可使用低层 `connect`，其 Git 生命周期由应用负责。

## 按用途配置凭据

工作区的 `gitEnvironmentRefs` 只提供给受管 Git 操作，Agent 自用变量放在 Agent 的 `environmentRefs`。例如 HTTPS Git Worker 可以配置以下引用，并由服务端为 `ACP_GIT_CONFIG_COUNT` 提供 `1`，为 `ACP_GIT_HEADER_KEY` 提供绑定到登记地址的 Git `http.<url>.extraHeader` 配置键。认证头的值由密钥服务注入 `ACP_GIT_HEADER_VALUE`。

```yaml
gitEnvironmentRefs:
  GIT_CONFIG_COUNT: ACP_GIT_CONFIG_COUNT
  GIT_CONFIG_KEY_0: ACP_GIT_HEADER_KEY
  GIT_CONFIG_VALUE_0: ACP_GIT_HEADER_VALUE
```

配置此映射后，远程 Git 操作在私有 Git 目录中读取凭据并使用登记地址。Agent、本地提交和工作树钩子不会继承这组变量。认证工具和 Git 配置路径须来自可信执行环境。平台仍需隔离运行不同信任级别的任务，并避免向浏览器公开卷或内部路径。

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
