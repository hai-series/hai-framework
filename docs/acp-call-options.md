# ai.acp 调用方式与可配置参数

日期：2026-11-13。**这是拟新增的接口设计，当前版本不能直接运行以下示例。** 配套[总方案](acp-multi-user-platform-plan.md)与[运行设计](acp-platform-runtime-design.md)。目标是普通调用短、高级调用可控，Codex、DeepSeek Harness、Goose 共用一套入口。

## 1. 普通任务只传智能体和消息

应用启动时初始化基础依赖、runner 和 ai，向 ai 注入 runner；请求中不重复初始化。身份来自服务端认证，不从模型输出或客户端传来的 userId 直接采信。

```ts
const scoped = ai.acp.scoped({ tenantId: auth.tenantId, userId: auth.userId })
const result = await scoped.run({
  agentId: 'office-assistant',
  prompt: '总结已授权的项目资料',
})
if (!result.success) return result
return result.data
```

Agent 定义提供默认模型、上下文、工具和环境。默认 `auto / workspace / on-request`；服务端先按用户权限过滤可选范围，再选择合规环境。调用方不需要知道镜像名、执行节点和容器 ID。

`run` 管理一次任务的临时 session、生成和清理。成功结果包含 taskId、turnId、文本、引用、产物和脱敏的实际配置；它复用 sessions 的执行流程，不另建一套调度器。返回产物 ID，下载仍验证当前用户权限。

## 2. 需要时再加参数

下面是“用指定模型总结附件，并输出 JSON”的示意。agentId、模型、文件和知识库 ID 都是应用预先登记或授权取得的值；businessRequestId 来自已持久化的业务请求，同一请求重试继续使用它。

```ts
const result = await scoped.run({
  agentId: 'office-assistant',
  prompt: '结合项目资料总结附件，给出摘要和待办',
  model: { id: 'company-fast' },
  execution: { mode: 'auto' },
  context: {
    fileIds: ['file-report'],
    knowledgeBaseIds: ['kb-project'],
    memory: { scope: 'user', write: 'none' },
  },
  permissions: { profile: 'read-only', approval: 'on-request' },
  limits: { queueTimeoutMs: 30000, runTimeoutMs: 120000 },
  output: {
    format: 'json',
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        todos: { type: 'array', items: { type: 'string' } },
      },
      required: ['summary', 'todos'],
      additionalProperties: false,
    },
  },
  idempotencyKey: businessRequestId,
  metadata: { source: 'project-report' },
})
if (!result.success) return result
return result.data
```

参数是可选覆盖项，不要求业务每次填完整对象：

| 参数 | 可以控制什么 | 边界 |
| --- | --- | --- |
| `agentId`、`prompt` | 选择登记的 Agent；消息为文本或 ACP 内容块 | 复用协议内容类型；图片等需 Agent/模型支持，不能默默丢弃 |
| `model` | `id`、`reasoningEffort`、`temperature`、`maxOutputTokens` | 模型 ID 引用服务端配置；可选项按适配器和模型 Schema 验证，不接受密钥或任意网关 URL |
| `execution` | `mode`、`environmentId`、`resources` | mode 为 auto/shared/user/task；可请求允许范围内的 cpu/memoryMiB，其他限额继承环境；不接受镜像 URL、宿主挂载和引擎参数 |
| `workspaceId` | 指定已授权项目/工作区 | 与知识库、附件分开；影响资料位置、复用和单写者约束，不能传任意宿主目录 |
| `context` | `fileIds`、`knowledgeBaseIds`、`skillIds`、`memory` | 全部按主体验证；memory 指定 scope 为 none/user/space，space 需 spaceId；write 为 none/confirm/on-success |
| `tools.allow` | 允许使用的逻辑工具 ID 列表，如 `documents.extract`、`office.convert` | 由目录解析到 MCP/工具服务；平台知识、记忆工具也计入最终清单；安装或列出工具不代表得到数据授权 |
| `capabilities` | 此任务必须具备的能力，如 `office.recalculate` | 用于检查和选择环境/工具；它不授予权限，也不要求每轮实际调用该工具 |
| `permissions` | `profile`、`approval`、`ruleIds` | profile 为 read-only/workspace/full-access；approval 为 on-request/never；ruleIds 只引用该主体可使用且未失效的规则 |
| `limits` | `queueTimeoutMs`、`runTimeoutMs`、`approvalTimeoutMs`、`maxOutputBytes` | 有正数范围与组织上限；不以无限等待作为默认值 |
| `output` | text 或 json；JSON 可附 Schema | 平台验证最终结果；原生约束生成只有支持的 Agent 才启用；校验失败不自动重跑有副作用的任务 |
| `idempotencyKey`、`metadata` | 请求去重和有限业务标签 | 主体内作用域、字段/总大小上限；标签不参与认证，不接受 owner/tenant 等保留安全字段 |
| `native` | Agent 确实特有且已声明的参数 | 带 adapter 标识和版本化 Schema；不能成为透传任意原生命令、环境变量或安全配置的后门 |

新建 session 使用相同的持久配置字段；每轮只允许其中安全可变的子集。`tools.allow: []` 禁用所有可选工具，`context.fileIds: []` 清空该层默认附件；不要求检索时可将知识库列表设为空。不满足必需能力、技能依赖或输出要求时返回冲突，不能一边禁用工具一边假装任务条件完整。

模型输出 token 上限仅在原生路径可落实时开放。它不是整个任务的费用上限，也不含所有工具回合。工具调用次数、总 token/费用硬限制等只在所有执行路径都能准确计量和拦截后加入，首版不提供名义上可配、实际无法保证的选项。

`runTimeoutMs` 是本轮执行上限，从领取后开始，包括启动、模型、工具及审批等待；排队单独计时。approvalTimeoutMs 只限制单次等待，不能突破本轮和任务总时限；超时触发取消并核验，不把发出取消请求当作已经停止。持续 session 的最长存活及空闲回收时间由部署策略设置；空闲时间按最近活动计算，最长存活不因新一轮而重置。maxOutputBytes 限制本次消息输出，文件产物和临时盘另受工具/环境限额控制。

## 3. 默认值和覆盖规则固定下来

配置来源从低到高为：**框架默认 → 登记的环境/Agent 默认 → session 选项 → 本轮允许覆盖的选项**。环境固定的镜像、网络边界及组织配额是约束，不因后层同名字段而被覆盖。

- 普通对象按已定义字段合并；数组整体替换，不自动把旧工具、旧附件和新列表取并集。未传字段继承；null 只有字段明确定义“清空”时才允许。
- 未知字段、拼写错误、不支持的原生参数、冲突的模式/能力在启动前报错。明确选择的环境缺能力就失败，不偷偷换镜像；超上限的显式资源请求也不静默降低。
- 默认可选资料/工具先取授权子集；用户显式指定的文件、知识库、技能或工具无权使用时失败，不能静默去掉它们生成不完整结果。必需依赖被过滤也须失败。
- 权限范围同时受组织策略、用户权限、Agent/环境能力和任务授权限制；传入 profile 或 ruleIds 是请求，不是授权证据。Full Access 需要可信的人为选择或已批准的服务策略，不能由模型自行勾选。
- `resources` 改的是 Worker 的受控限额，shared/user 下不是独立每任务硬配额；请求与已有 Worker 不兼容时只能新建合规实例，不能修改其他用户正在共用的进程限额。需要独立 CPU/内存保证的任务选择 task。
- 执行前保存实际配置和对应版本；安全策略撤销时重新验证。客户端可看到选用的 Agent/模型/模式/环境、能力和选择原因，凭据及宿主内部路径保持脱敏。

同一 shared Worker 上不得通过修改全局配置来满足某个用户的临时需求。模型或选项仅能全局生效时，它们必须进入 Worker 复用条件，并在独立环境生效。

## 4. 持续对话、逐轮修改和模式切换

持续对话使用 `scoped.sessions.create({ agentId, ...选项 })`，取得 session 后调用 `prompt(content, turnOptions)` 或 `stream(content, turnOptions)`，不用为每个 Agent 更换接口。task 模式下该业务任务/session 可以包含多轮，Worker 不因一次模型回答完成就必然重建；`close` 结束该业务 session 并释放其独占环境。shared/user Worker 是否回收由空闲策略决定，不顺带关闭别人的 session；任务总时限和空闲回收仍受部署策略约束。

| 改动 | 生效方式 |
| --- | --- |
| 消息、输出格式、允许范围内的单轮时限 | 本轮生效；同一 session 仍只允许一轮执行 |
| 模型/推理等选项 | 只有适配器支持安全的 session/turn 设置时才可逐轮改变；否则提示需要重建 |
| 下一轮的知识库、附件、工具、记忆范围 | 重新鉴权和核验能力；工具/附件变化需要原生重新配置时，在安全空闲点处理 |
| mode、environmentId、工作区挂载、资源或启动时 skills/native 选项 | 通过显式执行变更操作；先结束在途操作、重新计划，再重建或恢复，不在 prompt 中偷偷切进程 |
| 权限缩小/撤销 | 立即阻止新操作；原进程已持有文件/连接时按策略终止，不能等待下一轮才生效 |
| 主体、agentId | 新建 session；不修改已有会话的所有者，也不宣称不同 Agent 的原生状态可直接互换 |

不同 Agent 的 skill 机制有差异。参数 Schema 标明选项在启动/session/turn 哪一级生效，SDK 只暴露该层允许的子集；不支持动态变更时返回需重建，并由调用方决定。权限扩大不能靠修改普通参数绕过授权卡片。

`session.changeExecution({ mode: 'task' })` 在安全空闲点切换；`{ mode: 'auto' }` 表示重新计算。切换要遵守[原生恢复及单执行者规则](acp-platform-runtime-design.md#6-自动路由和模式切换的准确语义)。默认不把授权不足变成“自动 Full Access”，也不在运行中为了减少排队而降低隔离。

参数中移除知识库、附件或记忆，只能阻止后续读取，不能让模型忘记已经进入原生上下文的内容。需要严格收缩数据可见范围时重建原生 session，仅导入仍授权的摘要/产物；无法安全导出则新开会话，不能承诺仅换一组 ID 就已抹除上下文。

## 5. 查询能力、预览结果和报错

- `scoped.agents.describe(agentId)`：返回本用户可用模型、能力、环境、模式和参数 Schema，原生扩展还标注生效层级。部署只声明但未验收的模式不能显示成已支持。
- `scoped.plan(request)`：只读校验、计算模式/环境/能力及可能缺失的权限，不拉镜像、不启动 Worker、不调用收费模型。它不能预测模型稍后提出的所有工具操作，也不预留资源或保证届时排队长度。
- 实际运行：重新检查身份、策略、版本与容量，记录 effectiveOptions。计划过期不等于永久授权；新风险或不支持的选项返回明确原因。

错误至少区分：参数无效、能力不支持、数据未授权、需要审批、需要重建、配额/队列超时、模型或工具失败、输出不合格、执行状态未知。错误包含追踪编号、相关参数路径和可用选择，不泄露密钥、其他用户资源名或内部命令。

JSON 输出的第一版保证是“解析并校验后才标成功”，不保证每个 Agent 都支持原生 constrained decoding。不合格结果返回输出校验失败及已产生的授权产物，不悄悄重新运行整项任务；若以后加入文本修复，必须显式启用并单独计量，且不能重放工具。

## 6. 分布式调用、流式事件和授权

业务请求的模型、上下文和选项可以序列化并持久化；AbortSignal、函数、文件句柄、SDK 连接不能写进任务记录。JSON Schema 使用 JSON 数据，不传 Zod 实例或闭包。

`run(request, { signal, onEvent })` 的第二个参数只用于当前调用的观察和取消。事件回调在当前 API/调用进程执行，从持久事件订阅读取；它不是远端执行处理器，也不能修改授权。回调异常结束该订阅并返回错误，任务状态仍可查询，不直接拆掉共享 Agent 连接。

浏览器断开或观察者崩溃不自动取消任务；显式 signal.abort 或取消 API 会提交持久取消请求。失联时返回未确认状态，不能向用户宣称已停止。用 taskId/turnId 和事件游标从任意 API 实例重连，先鉴权再订阅；大文件走对象存储，不塞进事件流。

审批使用持久 approvalId 和受认证的应答接口，owner 收到经核验的决定才继续。没有在线用户也不会默认允许。run 等待任务终态或调用的明确中断：审批未完成前任务保留 waiting-approval，超时按限额取消；观察连接丢失可重新附着，不因临时会话便捷封装而误删尚在执行的任务。需要持续交互的产品优先使用 session + 事件订阅。

幂等键绑定主体、操作类型和请求正文摘要；相同键不同正文报冲突，同键同请求返回已有执行或结果。首次提交后只解析一次配置快照，重试复用该任务；重试不因默认配置更新而新开执行，当前授权撤销仍需处理。HTTP/后台任务适配层应使用持久业务请求 ID，不能每次重试随机生成新键。

SDK 的 run 是“提交并等待”便捷调用；首次提交成功即给出 taskId 接收事件，后续超时/断线错误携带已知 taskId。若接收回执也丢失，可按同一幂等键查询。显式 tasks 查询、订阅和取消是对同一任务状态的操作，不再建另一套执行类型。去重不能保证任意外部副作用 exactly-once；状态未知时按[分布式恢复规则](acp-platform-runtime-design.md#36-分布式负载和执行归属)核对。

## 7. 扩展只留必要入口

通用参数优先；确认三个 Agent 的真实差异后才增加 native 字段。形状为 `native: { adapter, options }`，adapter 与已选 Agent 一致，options 只接收该适配器已登记 Schema 中的选项；SDK 用可区分的类型提供提示，服务端再次校验。部署固定适配器版本，任务保存版本快照。可选项以 describe 返回值为准，不凭空维护一套所有 Agent 都未必支持的字段。

应用启动时复用并扩展已有 `acpAdapters` 注册入口，登记可信适配器、能力和参数 Schema；runner 注册受信执行处理器。所有可领取该任务的节点必须具备相同兼容版本，缺失节点不能领取；不得从请求传入的 URL 动态加载代码。

新增领域工具优先按已有 MCP 注册方式纳入 Tool Service 目录；权限决策和上下文装配使用少量服务端注入接口。可持久任务引用登记的处理器 ID/版本，不能携带函数。注入逻辑不能绕过最终身份、权限、限额和输出校验。

首版不提供任意 CLI 参数、原始配置文件、环境变量、宿主路径、容器 socket、可执行 hook 字符串或整套通用插件生命周期。这些是管理员的环境/适配器实现细节。确有新增能力时补一个明确字段、Schema、适配和真实验收，避免把安全责任推给一个无限制 options 对象。

## 8. 验收范围

三个 Agent 使用同一最简调用、session/stream、能力查询和错误路径；逐个验证模型选项、上下文、工具、JSON 校验、原生扩展及生效层级。测试必须覆盖数组替换、未知字段、越权规则、旧上下文收缩、共享全局配置污染、重复提交、重连、审批、超时和配置更新期间的任务恢复。

本文件仅补充目标方案，没有新增公开类型、配置字段或运行时代码；不能把示例当作已发布 SDK 文档。正式实施时同步 README、usage、skills、CLI 模板、调用方和真实 ACP/分布式验收。
