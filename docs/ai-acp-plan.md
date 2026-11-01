# AI 模块 ACP 子功能方案

状态：本轮实现、复审修正与相关验收已完成，未验证边界见文末。核对日期：2026-11-01。分支：`codex/ai-acp-plan`。

本版按三种运行模式、Responses 转换说明、LLM 能力配置以及简化后的 workspace/worktree 要求重写。本文保留设计取舍；已实现 API 与使用方式以 [接入指南](../packages/cli/templates/skills/hai-ai/acp.md) 和 [资源清单](../packages/cli/templates/skills/hai-ai/resources.md) 为准，落地差异与验证边界见文末。

## 一、这版建议做什么

在 `@h-ai/ai` 提供 `ai.acp`，包括智能体维护、原生配置生成、三种运行模式、workspace 准备、会话操作，以及显式的 Git 合并推送。

| 项目 | 本版决定 |
| --- | --- |
| Agent 运行 | 自定义服务、内置容器服务、内嵌本地进程三种模式 |
| 模型维护 | 内置/内嵌引用 Hai LLM 模型并生成原生配置；自定义服务首期不注入模型配置 |
| ACP transport | 提供 stdio/http/ws；按部署真实支持选择，不自动桥接 |
| LLM 配置 | 明确新增共同模型能力元数据，不在 Agent 中重复维护 |
| Workspace | 维护工程和文件、准备目录；取消通用 sync 和公开 checkout 生命周期 |
| Worktree | 创建 session 时选择是否创建；从各工程当前主分支的已提交版本建立 |
| 合并推送 | 提供确定性 API：合并主分支并 push，或将会话分支以相同名称 push 到各仓库 |
| Responses 反向服务 | 现有功能不能直接充当网关；本期先原生接入，反向网关列为独立扩展 |

公开分组建议为 `ai.acp.agents`、`ai.acp.workspaces`、`ai.acp.sessions`。保留 `ai.acp.connect()` 作为已有宿主自行管理资源时的低层协议入口。普通应用从创建 session 进入，不必自行操作连接和 checkout。

## 二、已核对的依据

已阅读引用的“规划微应用构建平台”聊天及两个评审插件。微应用平台需要多项目、容器工作目录、持续编码和独立验收；评审插件需要隔离配置、限定源码读取、严格输出和事实核验。这些是设计依据，不把它们的业务流程固化到框架。

本地源码：

- [AI 组装](../packages/ai/src/ai-functions.ts)、[生命周期](../packages/ai/src/ai-main.ts)、[模型配置](../packages/ai/src/ai-config.ts)、[共享存储](../packages/ai/src/store/ai-store-types.ts)。
- [Responses 客户端转换](../packages/ai/src/llm/providers/ai-llm-provider-openai-responses.ts)、[实际调用方向](../packages/ai/src/llm/providers/ai-llm-provider-openai.ts)、[相关测试](../packages/ai/tests/ai-llm-responses.test.ts)。
- [现有模型容器说明](../packages/ai/models/README.md)、[构建与运行工具](../packages/ai/models/build.mjs)、[npm 发布范围](../packages/ai/package.json)。
- [评审执行入口](../../hai-reivew/plugins/packages/hai-review-plugin-agent-codex/src/shared.ts)、[Codex 配置生成](../../hai-reivew/plugins/packages/hai-review-plugin-agent-codex/src/environment.ts)、[结果解析](../../hai-reivew/plugins/packages/hai-review-plugin-agent-codex/src/output.ts)、[公共契约](../../hai-reivew/plugins/packages/hai-review-plugin-agent-common/src/types.ts)。相邻仓库链接只用于本地核对，不复制进发布文档。

## 三、Agent 的三种运行模式

| 模式 | 应用配置 | 框架负责 | 首期边界 |
| --- | --- | --- | --- |
| 自定义服务 `custom-service` | 已有 ACP 地址、认证、transport、远端工作路径 | 连接、能力检查、会话、事件、取消 | 不接管部署，不向服务传入 Hai 模型凭据，不替远端准备目录 |
| 内置服务 `builtin-service` | Agent 类型/版本、Hai 模型 ID、Podman/Docker、workspace 挂载 | 生成配置、启动和管理所属容器、挂载持久目录、建立 ACP 连接 | 镜像预先构建或拉取；不自动转换 Agent 的 ACP transport |
| 内嵌 `embedded` | 本机 Agent 入口/版本、Hai 模型 ID、workspace 路径 | 生成隔离配置、启动本地子进程、使用 stdio、回收所属进程树 | “内嵌”指随应用托管本地进程，不把第三方 CLI 强行加载到 Node 进程内 |

自定义服务不做模型注入，原因是普通 ACP 的模型选择只能选择服务已有模型，没有通用的远程供应商配置接口。为所有外部服务发配置、发密钥还需要额外管理协议，当前收益不抵复杂度。仍可列出/选择对端已经提供的模型，选择 ID 与 Hai 本地模型 ID 分开；连接凭据与模型上游凭据也分开。

仅有自定义 ACP 地址时，`newWorktree: true`、框架 Git 发布等需要远端文件权限的操作明确返回不支持。该模式使用服务已有的 cwd；有额外受信执行器的集成留作扩展，不假装远端路径存在于本机。

智能体维护提供登记、查询、修改、启停用、删除、检查、初始化。记录类型、运行模式、版本、启动入口/地址、支持的 transport、允许的模型 ID、默认模型和状态。管理 UI 由应用使用这些 API 构建。

定义和实例分开：同一 Codex 定义可为多个项目/session 创建实例。模型、凭据作用域或配置版本不同，不能共享一个会被相互改写配置的实例。修改定义影响后续实例；停用阻止新建，已有实例的停止另行明确处理。

### 容器目录与发布方式

在用户指定的 `packages/ai/models/` 下增加 Agent 镜像资源，与现有模型镜像并列：

```text
packages/ai/models/
  images/                         现有模型镜像
  agents/
    codex-acp/
      Dockerfile
      agent.json
    deepseek-harness/
      Dockerfile
      agent.json
```

Agent 清单声明固定版本、镜像、入口、支持的 transport、状态目录和探测方式。复用已有 Podman/Docker 选择、构建、代理与挂载处理经验；Agent 不需要 GPU/权重下载，stdio 也没有 HTTP 健康地址，不把这些模型字段硬塞给 Agent。

运行支持显式 `podman`、`docker` 和与现有工具一致的 `auto`。代码异步执行容器命令，部署脚本里的同步进程操作不直接搬进服务请求热路径。stdout 只供 ACP，日志走 stderr；不分配 TTY。

Codex ACP/dsh 当前原生入口为 stdio，容器模式通过容器进程标准输入输出或 `exec -i` 连接。启动成容器不意味着它有 ACP HTTP/WS 服务。就绪检查使用进程状态和 ACP 握手，不能伪造 HTTP 健康检查。

现有 models 目录不进入 npm 发布物。因此部署资源继续由仓库/发布制品交付，运行时使用固定镜像引用；安装 `@h-ai/ai` 后不能假定存在 Dockerfile。交付必须包括可执行的镜像构建命令、固定镜像版本和运行说明；缺镜像时明确提示构建/拉取，不在 prompt 中临时下载最新版。

### Workspace 与 volume 绑定

内置模式建议一个 workspace 对应一个持久 named volume，也允许显式 bind mount；卷身份同时包含容器引擎/连接位置，不能只靠卷名跨机器复用。所有会话工作目录均在该卷内：

```text
volume: hai-acp-project-a   → 容器统一挂载到 /workspace
/workspace/
  main/
    repos/api/            主工作目录和 Git 元数据
    repos/web/
    files/                上传资料
  sessions/<sessionId>/
    repos/api/            该 session 的 Git worktree
    repos/web/
    files/                该 session 的资料副本
```

Agent 的 cwd 指向 `/workspace/main` 或对应 session 子目录。Agent 状态另存隔离的持久目录/volume；生成配置与密钥不写入工程仓库或镜像。停止/重建容器保留 workspace 和状态卷，删除数据是单独操作。

主仓库、Git 公共元数据和 worktree 必须在所有相关容器中拥有一致路径。Git 准备/合并操作在同一执行环境执行，不在 Windows 路径创建 worktree 后直接改挂到另一 Linux 路径。权限、UID/GID、Podman VM 与 bind 路径按实际引擎验证；不把容器引擎 socket 交给 Agent。依据：[Docker volumes](https://docs.docker.com/engine/storage/volumes/)、[Podman 挂载说明](https://docs.podman.io/en/latest/markdown/podman-run.1.html)。

## 四、Responses 转换：现有能力是什么，缺的是什么

Hai 已有转换，这一点应保留，但要准确说明方向：

```text
已有：应用调用 ai.llm.chat/chatStream
      → 转为 Responses 请求 → 上游 /v1/responses
      → 把上游结果转回 Hai 统一的 Chat 形状

Codex 连接 Chat-only 模型需要：
      Codex 发 Responses 请求 → 一个 Responses 服务端入口
      → 转为 Chat Completions 调用 → 模型
      → 将结果编码为完整的 Responses 响应/事件
```

当前是客户端协议适配，仓库没有上述服务端入口。现有 Responses 流转换还只处理文本增量和完成事件，不能直接承担 Codex 所需的完整工具调用循环。

因此修正此前的表述为：**仅提供 Chat Completions 的模型不能直接配置给当前 Codex；接入经过验证的 Responses 网关后可以使用，但现有 Hai 转换函数不等同于该网关。** 原生 Responses 模型可以直接配置给 Codex；dsh 可使用其已支持的原生模型协议。

本版建议先保留原生模型接入，不把反向网关捆入 ACP。若确实要求 Codex 使用所有 Chat-only 模型，再作为 `ai.llm` 的独立扩展：复用模型解析和调用，新增 Responses 请求解析、流事件编码、工具调用/结果关联、连续对话、错误与取消。不能只把文本包成 SSE；是否支持图片、推理、状态引用等分别声明并验收。

若以后实现，首期可采用无状态 HTTP Responses 和完整历史重放，避免同时实现 WebSocket 增量状态管理；能力缺失明确报错。模型本身不具备工具/图片等能力时，转换服务也不能创造这些能力。依据：[Codex 网关要求](https://learn.chatgpt.com/docs/enterprise/gateway-compatibility)。

这与 ACP 的“不自动兼容”是独立边界：前者是模型调用协议，后者是客户端与 Agent 的通信协议。

## 五、明确补充 Hai LLM 能力配置

本次范围明确包含 `llm.models[]` 的可选能力元数据，继续只有一份模型配置。建议在共同 `capabilities` 下表达：

| 字段 | 表示什么 |
| --- | --- |
| `contextWindow` | 模型可用的上下文总容量 |
| `maxOutputTokens` | 单次输出的能力上限 |
| `inputModalities` | 已确认的输入类型，如 text/image/audio |
| `outputModalities` | 已确认的输出类型 |
| `toolCalling` | 是否支持所需函数工具调用 |
| `reasoning.supported` | 是否支持推理能力 |
| `reasoning.efforts` | 实际可选择的推理级别；未知时不凭空列出 |

现有 `maxTokens` 仍表示调用时的默认输出预算，不能拿它代替 `contextWindow` 或模型最大输出能力。能力描述也不等于 Provider 已实现该模态；生效能力取模型、Hai Provider/Agent 适配器、传输三者共同支持的范围。

旧配置继续可用，缺失能力表示未知，不是 false，也不自动猜成超大容量。Agent 原生目录已有可靠信息时可采用；自定义模型初始化必需的字段缺失时提示补齐。数值关系、枚举、显式参数范围及推理级别按已知信息校验。

模型能力与调用参数分开：声明支持推理不能冒充已经传递了推理参数。若增加默认 effort 等使用设置，要同时落实 Provider/Agent 的参数映射。需要同步 ModelEntry、ResolvedModelEntry、相关临时模型类型、解析器和实际消费者，不能只往 Schema 加字段。

内置/内嵌初始化严格解析 modelId、检查 Agent 能力、生成隔离配置，并返回生效模型/参数。Codex 生成 provider 和模型目录配置，dsh 生成 profile/provider/models；密钥通过受控环境或凭据引用提供。配置产物可重建，不能变成用户需要维护的第二份模型目录。模型 ID 未命中直接失败，不沿用 resolver 把未知字符串当作原始模型名的回退。

## 六、Workspace 简化：保留目录准备，去掉通用 sync

上一版把工作区做成多来源版本管理器，范围偏大。Git 分支、上传文件、Agent 修改各有不同更新规则，一个通用 sync 难以给出清晰行为。

本版不提供公开 `sync()`、checkout CRUD 或 workspace revision 切换。checkout 仅作为内部的实际目录概念。对外维护 workspace 的 ID、运行位置/volume、Git 工程列表、文件来源和准备状态。

`prepare()` 创建普通文件目录、克隆不存在的工程并校验已有工程，返回 main 的绝对路径。资料通过独立 importFiles 添加。已有工程保留，不执行 pull/reset/clean，也不覆盖已有文件。失败保留现场，重试只克隆缺失工程；准备失败时不启动 session。

后续代码由用户、Agent 或应用显式执行 Git 更新；资料通过 importFiles 导入，拒绝同名覆盖；修改或替换由应用负责。绑定外部目录不取得删除权，不建立自动版本同步或 revision 管理。

代价是：创建会话不保证远端最新代码；要最新内容，需要先显式更新主分支。已有独立 session 的文件不会跟着主目录或上传资料自动变化。这样能保留未提交成果，并降低配置、状态机和恢复复杂度。

内部 Git 操作覆盖 clone、分支/commit/status 检查、worktree、commit、merge、push 和 fetch；不额外公开 status/diff 包装或任意初始化脚本。子模块和 Git LFS 属性明确返回 ACP_UNSUPPORTED，避免不完整内容被报告为就绪。

## 七、Worktree 收敛到创建 session 的一个选项

拟议入口：`ai.acp.sessions.create({ agentId, workspaceId, newWorktree })`，默认 `newWorktree: false`。

- false：使用 workspace 现有目录，多个 session 可以共享；受管写任务串行。
- true：对 workspace 已登记的全部 Git 工程，分别从其当前本地主分支的已提交 commit 创建会话分支/worktree，统一放到 session 工作目录。

每个 Git 工程必须显式填写 `mainBranch`，remote 默认为 origin；不推测默认分支，不假定所有仓库都叫 main。范围是登记的工程列表，不递归扫描依赖目录或 Agent 临时新建的仓库。创建时不自动 pull；基于登记主分支当前 commit 创建；会话信息记录 cwd/branch，未提交修改不进入新 worktree，未提供额外的基线 commit 清单。

所有工程使用同一个会话分支名，默认 `acp/<sessionId>`，允许创建时指定；不能覆盖已有不属于本会话的分支。某个仓库没有可用主分支或创建失败，整个 session 暂不进入 ready，保留可重试/清理的记录。

普通上传文件复制到 session 目录，不使用可写硬链接。没有 Git 的项目可以获得独立文件副本，但没有可执行的 Git 合并推送。新 session 的资料默认以创建时内容为准。

无需另做复杂 worktree 调度、自动合并或多层 checkout 管理。Agent 即便自行创建其他 worktree，框架也只对登记给本 session 的目录/分支负责，不自动把未知目录纳入发布和清理。

共享目录仍需要最小写入互斥；独立 worktree 之间可并行。占用使用共享 Store CAS 且无自动 TTL；失联时不能仅凭租约到期就放行第二个写入者，须确认旧进程和相关后台写入已停止。工作树不是容器沙箱，也不隔离端口、数据库和后台服务。[Git worktree 文档](https://git-scm.com/docs/git-worktree)

## 八、增加显式的合并推送操作

统一为 `session.publish({ mode, message, author: { name, email } })`，应用可把它映射成按钮或斜杠指令。它是框架确定执行的 Git 操作，不要求模型自行理解“请帮我合并”并用自然语言报告结果。该功能不是 ACP 标准方法。

| mode | 执行效果 |
| --- | --- |
| `merge-main` | 提交会话工作树中的修改，合并回各工程配置的主分支，然后普通 push |
| `push-branch` | 提交会话修改，把相同会话分支名推送到各仓库，不改远端主分支 |

首期自动发布面向 `newWorktree: true` 的受管 session。共享目录的修改可能来自多个 session，不能可靠归属某一会话；因此共享模式不自动“只发布这个 session”，由应用/用户显式处理整个共享目录。自定义远程服务没有受管文件能力时也不提供此操作。

发布的必要规则：

1. 核验 session、目录、仓库、分支和 remote 的登记关系，确认 Agent/后台任务已停止写入。Git 凭据使用独立授权，不能把模型 API Key 当作仓库凭据。
2. 读取所有仓库的待发布变更。已有会话提交保留；未提交修改按显式发布请求生成 commit，使用指定提交说明与 Git 身份，遵守 gitignore。仓库外文件保留在会话 cwd 下的 files 目录，不进入逐仓发布报告。
3. 先对涉及仓库做前置检查。merge-main 必须取得主目录写入权、主目录干净且处于配置的主分支；fetch 并核对远端变化，能安全整合后正常 merge/push。不硬重置分支，不 force push。
4. 冲突、受保护分支、权限不足或非快进拒绝明确返回，保留现场。已生成 commit 或已完成 merge 但 push 失败，不能假装已回滚；重试核对真实 Git commit 与远端祖先关系，不另建发布任务状态表。
5. push-branch 使用 session 的同名分支；远端已存在时只接受正常可快进更新，不覆盖其他人的历史。没有变化的仓库按实际分支状态判断是否需要 push。
6. 返回每仓 repositoryId、success、phase、commit、error；目标分支由 mode 和登记分支确定。多仓库 push 不具备原子性，失败时明确部分成功。重试重新核对各仓当前状态，不重复创建无变化的 commit，普通 push 不改写远端历史。[Git push 文档](https://git-scm.com/docs/git-push)

主分支受保护时，用户可选择 push-branch，再交给现有 Git 平台走 PR；首期不增加 GitHub/GitLab 专属 PR 创建逻辑。推送结果不代表测试、审查或业务验收通过，平台可在调用前设置自己的验收流程。

发布不删除工作树或会话。sessions.remove 只删除关闭/失败的记录；工作树、代码、状态文件及 volume 始终保留，应用负责显式清理及未发布成果检查。

### 更新当前 session 的全部主分支

新增 `session.updateMain()`：逐仓库 fetch 配置的 remote，将本地主分支仅快进到对应远端主分支；返回各仓操作结束时的 commit、阶段和失败原因。独立 session 分支与工作树保持原状，不自动 merge/rebase 会话；主分支分歧、主工作树脏或正在使用时明确失败。更新失败允许部分成功并逐项报告。

任何 Git 操作前检查所处执行环境的 git 命令；不存在时返回专用 HaiResult 错误，不按空仓库或无改动处理。

所有内置镜像至少提供 Git、Node.js、Python；Java、Rust、Go 通过构建参数可选安装；本轮未构建这些可选组合。运行引擎同时支持 Podman/Docker，auto 优先就绪的 Podman，其次 Docker。

## 九、ACP 连接与会话保持通用

提供 stdio、Streamable HTTP、WebSocket 客户端。连接前按版本/部署声明检查 transport，连接后握手检查协议和功能。只支持 stdio 的 Agent 被要求使用 ws 时明确报错，不转换 Codex app-server、dsh Web UI 或 MCP HTTP 地址。

会话以稳定 ACP v1 为基线；HTTP/WS 对应官方 Active RFD 和 experimental SDK，锁定版本并标记状态，不自动混入 v2 draft。依据：[传输](https://agentclientprotocol.com/protocol/v1/transports)、[远程 RFD](https://agentclientprotocol.com/rfds/streamable-http-websocket-transport)、[官方 SDK](https://agentclientprotocol.com/libraries/typescript)。

远程用户仍可通过应用 HTTP/WS 使用 Worker 本地 stdio Agent，这是应用访问与 ACP 访问两段连接；不需要搭建 stdio-to-HTTP ACP 桥。

保留以下会话能力：

| 能力 | 边界 |
| --- | --- |
| 持续对话、流式事件 | 一个 session 同时一个 prompt；对端提供哪些进度就展示哪些 |
| 文本、资源、图片、音频 | 按 Agent、模型和接口实际能力检查，不支持不静默丢附件 |
| 权限、补问、文件、终端回调 | 有处理器才声明能力；未处理权限默认拒绝；校验会话归属和实际目录 |
| 模型/模式配置、MCP | 只使用对端已协商功能；MCP 服务从 Agent 环境可达 |
| 列表、恢复、关闭与扩展 | 依实际协议版本/能力，区分继续会话与历史回放 |
| 结构化结果 | promptStructured 接收调用方 Zod schema；只校验结构，业务继续核验事实 |
| 取消、超时、限额 | 有界等待、资源回收；取消不回滚文件，关闭连接不等于远端任务停止 |

事件处理器在握手和建会话前注册，覆盖提前事件、回放和空闲更新。保留原始事件与 `_meta`，本地序号不冒充跨重启全局序号；消费失败和超限不能静默丢事件。

结构化输出按消息边界收集，思考、工具、notice、stderr 不拼入最终结果；私有 phase 由明确策略解释。歧义、结构错误、取消或断线不能因收到合法 JSON 而成功，也不自动再次付费调用。

恢复须同时具备原状态、工作目录/分支、配置身份及对端能力，不能只保存 sessionId；未知外部效果不自动重放 prompt。Skill 可作为指令或文件交付，不臆造通用安装接口。

## 十、接入示例

以下示意假设 ai 已按现有契约完成初始化，Agent 与 workspace 已登记。内置/内嵌模式的 Agent 记录绑定 Hai 模型 ID，session 创建内部完成必要配置生成、目录准备和连接。

```ts
const created = await ai.acp.sessions.create({
  agentId: 'codex-builtin',
  workspaceId: 'project-a',
  modelId: 'coding',
  newWorktree: true,
  branchName: 'feature/task-123',
  handlers: taskHandlers,
  onEvent: publishTaskEvent,
})
if (!created.success) return created

const session = created.data
return await session.prompt({
  prompt: [{ type: 'text', text: taskText }],
  signal: taskAbortSignal,
})
```

应用完成自己的验收，并收到显式发布操作后，再从保存的 session 调用：

```ts
return await session.publish({
  mode: 'push-branch',
  message: commitMessage,
})
```

示例变量由应用提供。真实应用在 Worker 保存 session 并处理关闭结果；浏览器断线不自动取消任务。会话关闭、停止实例与删除代码分别处理，不因为 API 请求结束而删掉工作目录。

## 十一、实现边界与同步影响

| 框架负责 | 应用/部署负责 |
| --- | --- |
| Agent 维护、配置生成、所属容器/本地进程生命周期 | 引擎安装、镜像部署、账号授权与管理 UI |
| LLM 共同能力配置和原生映射 | 模型服务、真实凭据及能力信息维护 |
| workspace 准备、会话 worktree、显式 commit/merge/push | Git 托管、保护规则、PR 审批、业务发布流程 |
| ACP 协议、事件、交互、取消、结构校验 | SDD、任务拆分、验收、评分、源码证据与 partial 语义 |
| 卷/目录归属和回调范围检查 | 可信执行环境、网络/资源政策、预览进程和路由 |

沿用现有 AI 风格，在 `src/acp/` 按 types/functions/transports/adapters/runtime/workspace/git/result 拆分，以 `ai-acp-*` 命名。`ai-functions.ts` 装配，`ai-main.ts` 接 getter、未初始化代理、init/close；协议复用官方 SDK，不重复手写 JSON-RPC。

持久记录复用 AIStoreProvider，包含 Agent 定义、workspace/卷归属、session/工作树/分支关联和 Git 操作状态；不再保存复杂 workspace revision。源码留在 volume/目录，上传来源留在 Storage，原生会话留在状态目录；凭据与进程句柄不写普通记录。

普通 API 返回 HaiResult，流遵守 AsyncIterable 约定。启动参数来自可信服务端并用数组执行，不拼接 shell；Windows 后台隐藏窗口。close 幂等，只回收自己拥有的进程/容器，保留清理失败和持久数据。Node 提供运行能力，浏览器只拿安全类型和事件；保持当前 AI 生产共享存储前置。

内嵌进程不是沙箱，Agent 自带工具也可能不经过客户端回调；评审只读仍需运行权限/只读挂载和已验证的 Agent 设置。项目根卷可供同一可信项目的工作树使用，worktree 本身不提供跨租户隔离。

微应用平台据此完成准备工程、持续编码、事件展示和提交推送，仍自行做 SDD/验收/预览/部署。评审插件可复用配置、协议、取消和结构解析，保留原有证据/ID/范围校验；本次不直接修改相邻插件仓库。

## 十二、实施与验证

完整范围建议分四批：

1. ACP 三种 transport、Agent 三种模式的定义与维护、会话事件和生命周期。
2. LLM 能力配置、Codex/dsh 原生配置、本地进程与 Podman/Docker 镜像/运行链路。
3. Workspace 首次准备、volume 持久化、session 可选 worktree、两种 Git 发布和失败重试。
4. 结构化审查与持续编码场景、权限/取消/恢复、使用文档和全部公开契约同步。

关键验收：自定义服务不收到上游密钥；模式/transport 不支持准确失败；两种引擎真实启动并重建后保留文件；多工程主分支名不同；已有脏目录不被 prepare 覆盖；worktree 路径跨容器有效；普通文件副本独立；两个共享 session 写入互斥；发布冲突、保护分支、非快进和多仓库部分成功；取消后后台写入尚未停止；正确工具调用与严格结果终态。

Git 推送测试使用临时 bare remotes，不碰业务仓库。真实 Codex/dsh 验收固定版本和模型；HTTP/WS 用官方 SDK 对端与实际支持的服务分别验证，不能将模拟通过称为 Codex/dsh 原生支持远程。

按变更相关范围执行 typecheck → lint → build → test → 集成/E2E，不默认全仓。同步 AI 三语 README、models 使用说明、配置/环境清单、docs/usage、文档站实际来源、仓库与 CLI 模板 hai-ai skill、LLMS、API inventory、注释和例子；可见错误三语。执行 check:skills，涉及模板 skill 时执行 scaffold gates。

当前分支已实现上述 ACP 接入、原生适配器、受管进程/容器、工作区、多仓库 Git、可选 worktree、恢复和结果处理，并增加配置与数据库合并资源清单。配置同 ID 优先且只读；数据库提供 CRUD 和 CAS 版本检查。此规则覆盖 LLM/音频/图像模型、外部 MCP、检索源以及 ACP agents/workspaces。会话和聊天历史保持运行态数据库 API，不导入配置历史。

测试使用临时目录、bare remote 和专属 volume，不对业务工程执行发布。真实 Podman 的卷持久化、worktree、会话恢复和 Git 合并推送已通过；Codex/dsh 实际原生程序已对本地模型服务夹具完成接入验收，HTTP/WS 文件、终端、权限及 elicitation 回调已验证。Docker 客户端存在但 daemon 不可用，Docker 真实启动未验收；引擎兼容参数共用，不能据此声称 Docker 已通过。模型上游夹具只能证明接入协议与配置映射，不能代替真实模型质量验收。Responses 反向网关仍不在范围内。
