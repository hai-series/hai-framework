# ACP 智能体、工作区和会话

ACP 把宿主应用接到能操作工程的智能体。`ai.llm` 负责模型调用，`ai.acp` 负责智能体进程、协议、工程目录和会话；SDD、代码评审规则、预览页面、验收和业务部署仍由应用实现。仅在 Node 服务端使用，浏览器经应用自己鉴权的 API 接收事件。

## 选择接入方式

| mode | 用途 | 模型和文件 |
| --- | --- | --- |
| `embedded` | 启动本机安装的原生 ACP 程序 | 引用 Hai `llm.models`；使用 directory 工作区 |
| `builtin-service` | 使用已构建镜像启动专属容器 | 引用 Hai 模型；workspace volume 挂 `/workspace`，状态卷挂 `/state` |
| `custom-service` | 已有原生 HTTP/WS ACP 服务 | 远端自行维护模型；传远端可见的 cwd；框架不操作远端 Git |

Codex 用 `adapter: 'codex'`，DeepSeek Harness 用 `adapter: 'deepseek-harness'`，Goose 用 `adapter: 'goose'`。其他已配置模型的 ACP 程序用 `adapter: 'generic'` 和 `command/args`。需生成其他原生配置时，向 `ai.init(config, { acpAdapters })` 提供可信服务端适配器。适配器返回 command、args、env 和写到隔离状态目录的可选 files。`environmentRefs` 保存目标变量名到宿主环境变量名的映射。

内置 Codex、DSH 和 Goose 通过原生 stdio 接入。HTTP/WS 是锁定 SDK 2.2.0 的官方实验传输，服务必须实现相同的 ACP 传输版本。自定义服务必须声明 `supportedTransports`，协议不匹配返回错误。

Agent 镜像按任务选择 `minimal`、`documents`、`office`、`browser` 或 `developer`。将构建后的镜像 ID 或仓库清单 digest 登记到 Runner 环境。无需在任务内安装工具链。需要直接处理文件时，也可使用具备相应权限的独立工具作业。

Linux 上运行 embedded Codex 前，按 [Codex 沙箱前置](https://learn.chatgpt.com/docs/sandboxing) 准备 bubblewrap 和所需的 AppArmor profile，并用 `codex sandbox` 在临时目录验证读写。沙箱初始化失败应先修复宿主环境，不能通过关闭沙箱或让模型猜测文件内容完成任务。

## Goose 的原生接入

受管 Goose 使用 `goose acp`，选择 `adapter: 'goose'`、`mode: 'embedded'` 或 `'builtin-service'`，绑定登记的 Hai 模型。适配器使用独立 Goose 状态目录和逐次工具审批，模型协议支持 Chat Completions、Responses 和 Anthropic。Goose 和 DSH 的每次受管启动只注入本次选中模型的凭据。

Goose 1.57.0 自身提供 `goose serve` 与 `/acp` HTTP/WS，使用 custom-service 接入。先由部署方启动服务、挂载工作区/状态卷，并在 Goose 端维护模型（例如 `GOOSE_PROVIDER=openrouter`、`GOOSE_MODEL`、`OPENROUTER_API_KEY`）；服务独立设置 `GOOSE_SERVER__SECRET_KEY`。Hai 只使用 `X-Secret-Key` 认证，不向服务注入 Hai 模型密钥。

```ts
import { ai } from '@h-ai/ai'

// ai 已初始化，Goose 已运行；HAI_GOOSE_SECRET 为服务端环境变量，值与远端服务密钥一致。
async function connectGoose() {
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

WebSocket 改为 `transport: 'ws'` 和 `ws://` 地址。`cwd` 是远端可见路径；应用负责远程服务和存储的启动、关闭、Git、归属检查及 TLS。缺少或错误服务密钥会被 Goose 拒绝；恢复按握手能力走原生 load/resume，不用历史 prompt 模拟。依据：[Goose 固定版本接入文档](https://github.com/aaif-goose/goose/blob/v1.57.0/documentation/docs/gdk/acp/index.md)。

## 配置和数据库共同维护

`acp.agents`、`acp.workspaces` 可以直接写在配置文件里，也可通过 register 保存到数据库。get/list 返回 `{ value, source, version? }`，配置同 ID 优先且不可修改；数据库支持完整 update 和 remove。模型、MCP 等清单也遵循此规则，见 [资源清单](resources.md)。创建会话可通过 `mcpServerIds` 绑定合并清单里的 MCP。

## 为受管会话绑定第三方工具

先在 `mcp.servers` 登记第三方 Streamable HTTP 服务，设置 `allowedTools` 和上游认证头引用。每个执行节点挂载自己的工具入口，并给 Worker 提供可达的地址。入口只把当前会话的短期 Bearer 传给 Agent，真实上游凭据由服务端解析。建议使用执行节点的内网服务地址和受保护的网络。

```ts
import { createServer } from 'node:http'
import { ai, type ACPPlatformPolicy, type MCPServiceBroker, type MCPServiceBrokerOptions } from '@h-ai/ai'

// 应用传入真实 IAM 检查。该函数复核任务归属、权限及实际工具参数。
function prepareTools(url: string, authorize: MCPServiceBrokerOptions['authorize']) {
  let broker: MCPServiceBroker | undefined
  const http = createServer((req, res) => {
    if (broker) return void broker.handleRequest(req, res)
    res.writeHead(503).end()
  })
  const policy: ACPPlatformPolicy = {
    // 示例只给 manuals 租户的 librarian 账号开放这一个工具。
    allowTools: (scope, _agentId, ids) =>
      scope.tenantId === 'manuals' && scope.userId === 'librarian' && ids.every(id => id === 'manual_search'),
    async bindTools(scope, sessionId, ids, signal) {
      if (!broker || ids.length !== 1 || ids[0] !== 'manual_search')
        throw new Error('Manual tool binding is unavailable')
      const bound = await broker.bind({
        principal: { tenantId: scope.tenantId, userId: scope.userId },
        taskId: sessionId,
        signal,
        tools: [{
          id: 'manual_search',
          serviceId: 'manual',
          tool: 'search_manual',
          description: 'Search authorized manuals',
          inputSchema: {
            type: 'object', properties: { query: { type: 'string', maxLength: 1000 } },
            required: ['query'], additionalProperties: false,
          },
        }],
      })
      if (!bound.success) throw new Error(bound.error.message)
      return bound.data
    },
  }
  return {
    http, policy,
    activate() {
      // ai.init(config, { runner, acpPolicy: policy }) 成功后，监听 HTTP 端口之前激活。
      const created = ai.mcp.services.createBroker({ url, authorize })
      if (created.success) broker = created.data
      return created
    },
    close() { broker?.close() },
  }
}
```

创建绑定时，工具入口为每项工具检查目录白名单和输入 Schema。每次调用重新检查业务权限和目录，网络重定向会失败。绑定默认有效 15 分钟。会话关闭、租约失效或服务停止时撤销绑定。多个执行节点分别挂载自己的入口，使 Agent 始终访问签发本次凭据的节点。

## 最小本机接入

下面的目录、Git 地址、模型和密钥由部署方提供。首次登记一次，后续用 get/list 读取；重复 register 返回冲突。普通 API 都先检查 `success`。

Windows stdio 需要系统 PowerShell 可用；npm 的 `.cmd` 包装应改用 `command: 'node.exe'` 和实际 JS 入口参数数组。框架跟踪整个进程树，关闭时清理后台子进程；系统策略阻止启动时直接返回错误。

```ts
import { ai } from '@h-ai/ai'

async function run() {
  const initialized = await ai.init({
    llm: { models: [{
      id: 'coding', model: 'your-responses-model', protocol: 'responses',
      apiKey: process.env.MODEL_API_KEY,
      baseUrl: 'https://models.example.com/v1',
      capabilities: { contextWindow: 128000, maxOutputTokens: 16384, inputModalities: ['text'], outputModalities: ['text'], toolCalling: true, reasoning: { supported: false } },
    }] },
  })
  if (!initialized.success) return initialized
  try {
    const agent = await ai.acp.agents.register({ id: 'coder', name: 'Codex', mode: 'embedded', adapter: 'codex', modelIds: ['coding'], defaultModelId: 'coding' })
    if (!agent.success) return agent
    const workspace = await ai.acp.workspaces.register({ id: 'project', storage: { type: 'directory', path: '/srv/projects/demo' }, repositories: [{ id: 'api', url: 'https://git.example.com/team/api.git', mainBranch: 'trunk' }] })
    if (!workspace.success) return workspace
    const ready = await ai.acp.workspaces.prepare('project')
    if (!ready.success) return ready
    const created = await ai.acp.sessions.create({ agentId: 'coder', workspaceId: 'project', repositoryId: 'api', newWorktree: true })
    if (!created.success) return created
    const session = created.data
    const response = await session.prompt([{ type: 'text', text: '阅读工程并说明结构' }])
    if (!response.success) return response
    return response.data.text
  }
  finally { await ai.close() }
}
```

`agents.initialize(id)` 检查模型绑定和原生配置能否生成；真正启动和握手用 `agents.check(id, { workspaceId })`。容器 Agent 的 `image` 必须与 workspace 的 image 一致。注册 volume 时固定实际选中的引擎；`auto` 优先就绪 Podman，再尝试 Docker，显式选定不可用引擎直接失败。

`repositoryId` 选择已登记仓库的根目录，原生 Agent 从该目录启动和恢复，可发现仓库内的 `AGENTS.md` 和技能。省略时使用聚合目录。选择只影响工作目录，worktree 和发布仍覆盖全部登记仓库。远程 `custom-service` 使用对端可见的 `cwd`。

生产环境先初始化共享数据库和网络向量库，或注入 shared AIStoreProvider。Agent/workspace/session 记录和 CAS 占用存入 AI Store，原生历史保存在隔离状态目录。不能把临时内存 Provider 当跨节点锁。

## 容器运行与模型复用

源码仓库提供 `packages/ai/models/agents` Dockerfile 和构建命令：

```sh
pnpm --filter @h-ai/ai agent:build codex-acp
pnpm --filter @h-ai/ai agent:build deepseek-harness --engine=docker --java --rust --go
```

Codex 镜像明确包含 `@agentclientprotocol/codex-acp@2.5.0` 和 `@openai/codex@0.165.0`。所有镜像包含 Git、Node、Python；Java/Rust/Go 按构建选项安装。镜像自行构建、推送和部署；框架启动时不偷偷构建镜像、不挂引擎 socket。Dockerfile 随 npm 包的 models/agents 一起提供。

Agent 改为 `mode: 'builtin-service', image: 'hai-ai/codex-acp:2.5.0', engine: 'auto'`；workspace 改为 `storage: { type: 'volume', name: 'project-code', image: 'hai-ai/codex-acp:2.5.0', engine: 'auto' }`。容器重建继续复用这两个命名卷，Git 和 Agent 在容器内始终看到 `/workspace`，不会混用宿主绝对 worktree 路径。工作区主目录为 `main/`，隔离 session 为 `sessions/<id>/`，上传文件放 `files/`。

Podman 不自动继承远程服务的代理变量。需要代理时，使用 Agent/workspace 的 `environmentRefs` 显式传入容器可达的地址；宿主的回环代理不能直接在容器内使用。

模型能力配置位于 `llm.models[].capabilities`：contextWindow、maxOutputTokens、inputModalities、outputModalities、toolCalling、reasoning.supported/efforts。未知就省略；不能用请求 `maxTokens` 预算推断真实容量。dsh 自定义模型需明确上下文、输出容量、输入模态、工具和推理能力，避免其内部默认值夸大模型能力。dsh 映射 Chat Completions、Responses、Anthropic；Codex 原生要求 Responses。现有 Hai 的 Responses 转换是客户端能力，不是对外反向网关。只有 Chat Completions 的服务不会因配置了 Codex 自动变成 Responses 服务。

模型密钥在启动时重新解析；恢复时模型名、协议、地址、能力发生变化会拒绝，密钥轮换可以继续。自定义 ACP 服务只接受 `headerEnv` 里的认证引用，不接收 Hai 模型配置。

## 工程和 Git

相对 Git 地址固定相对于工作区根目录解析，clone/fetch/push 使用相同目标。协议取消因断连失败后，close 仍尝试核验拥有的进程/容器已退出；无法确认退出时保留锁。删除与同 ID 重建争用同一会话锁，忙碌失败不会建立 opening 记录。

每个 Git 工程必须写明 `mainBranch`，remote 默认为 origin。`prepare` 只克隆缺失工程并校验既有工程；不自动 pull、不重置脏目录。`workspaces.importFiles(id, [{ path, content }])` 添加普通文件，拒绝路径逃逸、链接和覆盖；没有 Git 工程的工作区无需安装 Git。涉及 Git 而命令缺失返回 `ACP_GIT_NOT_FOUND`。

当前托管 Git 面向普通仓库；发现子模块或 Git LFS 属性时返回 `ACP_UNSUPPORTED`，不把未拉取的子模块或 LFS 指针当作完整工程。需要这些能力的应用可自行准备环境并使用低层 `connect`，其 Git 生命周期由应用负责。

创建 session 默认共享 `main/` 路径，框架会阻止另一个共享 session 同时占用它。`newWorktree: true` 从每个工程当前已提交的本地主分支创建同名分支和 worktree，普通文件单独复制；可以指定 `branch`，默认 `acp/<sessionId>`。它不会自动拉远端，也不会导入主目录未提交修改。

`session.info()` 返回的 `workspace` 提供聚合目录、各登记仓库的绝对路径和存储位置。可信预览进程可以直接使用本机目录。卷模式使用返回的实际引擎，把源码卷 `name` 挂到同一 `mountPath`，并以目标仓库的 `path` 为工作目录。关闭 Agent 后预览仍可继续读取。应用先停止预览并保存所需改动，再调用 `ai.acp.sessions.reclaimWorktree(id)`。它拒绝活动、脏或锁定的工作树，可按 ID 重试。开始回收后停止 resume/publish，完成后可删会话记录。分支、普通文件、状态及卷保留，旧记录缺少归属时由运维回收。完整卷和会话信息只交给已授权的可信执行器。

- `session.updateMain()`：停止本 session 的执行环境，再 fetch 各工程的明确主分支并 ff-only 更新本地主目录；不把主分支合入 session，不自动 rebase。共享主目录被其他会话占用时返回 busy。
- `session.publish({ mode: 'push-branch', message, author: { name, email } })`：提交隔离 session 修改并推送其同名分支。
- `session.publish({ mode: 'merge-main', message, author })`：提交后检查、更新登记的主分支，再合并并推送。无 force push，不静默处理冲突。

发布仅允许框架创建的隔离 session，避免将共享目录中别人的修改算入当前任务。操作前停止受管进程/容器，避免背景工具继续写入；要继续编码显式 `sessions.resume(id)`。原生 Agent 自己创建的 worktree 不自动纳入框架发布范围。

私有仓库把 Git 凭据引用写入 workspace 的 `gitEnvironmentRefs`，把 Agent 专用变量写入 agent 的 `environmentRefs`。启用 Git 隔离后，远程克隆、拉取、推送只使用登记的远端地址和可信环境注入，在独立 Git 目录运行；需要的网络代理或 CA 设置也随 Git 引用配置。认证脚本和全局 Git 配置应由可信执行器提供。任务之间的访问权限仍由应用和运行环境隔离。

多个工程不是原子事务。失败时返回 `ACP_PARTIAL_FAILURE`，`error.cause.reports` 列出每个工程 success、phase、commit 和 error；已完成工程不回滚，冲突保留现场。失败于 push 后，排除权限/网络问题可重试；远端结果不明时先核对实际分支。普通文件的修改留在 session 目录，不自动纳入 Git 发布。失败创建的 worktree 也保留，避免删除已有成果。

## 交互、事件和结果

`onEvent` 在创建会话前注册，接收原生 session/update（含 `_meta`）；`session.stream(content, signal)` 提供有界 AsyncIterable，提前退出会取消该轮。prompt 返回 stopReason、text、events；有 messageId 时 text 取最后一条消息，完整消息仍在 events。没有消息边界的 Agent 只能拼接其文本，不能猜测某段是最终答案。

`promptStructured(content, zodSchema, signal)` 只接受 end_turn、完整唯一 JSON（可为完整 JSON fenced block）和通过 Schema 的内容。不提取夹在说明中的任意对象，不自动重试付费请求。需要业务证据、ID 或范围判断时由应用进一步校验。

权限默认取消。通过 `handlers` 提供官方 SDK 类型的 permission/fs/terminal/elicitation 回调，并在 `capabilities` 声明实际实现；terminal 必须提供完整回调组。回调运行在可信服务端，应用需按用户、session 和路径授权。Agent 自带本机工具可能不经过回调，worktree 也不是安全沙箱；只读评审需要操作系统/容器权限隔离。

图片、音频、嵌入资源和远程 MCP 按初始化能力检查。mode/config 通过原生协议操作。取消、握手/任务超时、输出超限会返回明确错误；连接关闭后不会自动重放请求。`sessions.resume` 仅在 Agent 声明 load/resume 时使用原生 ID 和原状态，不用历史 prompt 伪造恢复。`connect` 提供底层连接、认证和原生会话枚举/删除，用于应用已经管理执行环境的情况。

`session.close()` / `ai.close()` 等待拥有的进程树或容器停止后释放占用，保留目录和卷。失联或清理失败不会按 TTL 直接抢占；管理员先检查记录里的容器资源和实际执行环境，确认停止后再恢复占用记录。生产部署需监控此类故障。应用仍需负责 API 鉴权、项目归属、外部 Git 凭据及预览/业务发布。

## 配置与错误

`acp` 可省略：requestTimeout=30000ms、promptTimeout=600000ms、cancelTimeout=5000ms、maxContentBytes=8388608、maxPendingEvents=1024。对应 `HAI_AI_ACP_REQUESTTIMEOUT`、`HAI_AI_ACP_PROMPTTIMEOUT` 等环境变量。CLI 的 `_ai.yml` 和 `.env.example` 由公共配置目录生成这些字段；仅取消需要的配置注释不会自动启动 Agent。

错误码：070 Git 缺失；071 普通操作失败；072 参数；073 未登记；074 占用；075 不支持；076 取消；077 超时；078 输出无效/超限；079 状态冲突；080 多工程部分失败；081 已关闭；082 运行环境不可用；083 模型不兼容；084 清理失败。统一前缀 `hai:ai:`。错误不包含原始 stderr、凭据或完整命令行。

## 事件与恢复边界

事件保留原生内容。智能体提供 messageId 时，prompt.text 使用最后一条消息；没有 messageId 时合并本轮收到的文本。HTTP 的 session/new 响应与会话事件是独立通道，早期事件可能稍晚到达；需要严格结果时使用 promptStructured，混入说明或不完整 JSON 会返回失败，不自动截取一个看似合法的对象。

DSH 模型需要容量、输入模态、工具能力与推理声明；reasoning.supported 为 true 时需明确 efforts，false 会映射为原生 reasoningEfforts: false。Codex 原生配置会选择 api-key 认证并使用 Hai Responses provider。

会话绑定、定义删除和工作区修改通过共享 CAS 临界区防止悬空引用；工作路径使用独立占用锁。进程或宿主异常中断后，不自动用 TTL 假定执行者已停止：需运维先核验/终止记录中的执行资源，再修复遗留占用；正常 close 后可直接 resume。框架不将 Git worktree 当成安全沙箱。
