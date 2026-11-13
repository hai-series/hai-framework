# ACP、Runner 与 MCP 运行审查

审查基线为 `main` 的 `51074d87`（`1.0.0-beta.24`）。以下发现记录该基线行为，修复验收见本页末尾。P1 优先处理，P2 影响特定用法。

## 审查发现与验收条件

| 优先级 | 问题与证据 | 修复与回归验收 |
| --- | --- | --- |
| P1 | **运行数据持续增长。** Runner 保存完整请求、结果及事件，预热转移也留下独立执行记录。维护只变更状态。`maxEvents` 是单任务条数限制。受管 ACP 的会话、回执、幂等记录、过期和撤销的授权也没有清理策略。SQLite 实测 8 个成功任务各写 2 个事件，经过数轮维护及关闭后仍有 8 条执行、16 条事件。持久数据可能包括提示词、模型结果和内联媒体。 [Runner 存储](../packages/runner/src/runner-store.ts#L336) · [ACP 存储](../packages/ai/src/acp/ai-acp-platform.ts#L268) | 设定业务保留期与幂等窗口。按数据库时间限批清理已完成任务、事件和过期 ACP 数据，未核验的 `unknown` 单独保留。验证过期回收、窗口内重试、游标重连及旧数据迁移。 |
| P1 | **节点失联可长期占满控制槽。** 失租任务进入 `unknown`，计入原节点和主体的容量。核验要求容器凭据，而 ACP 子控制任务按设计不启动独立容器。使用相同节点 ID 重启也无法释放这类槽。 [容量计入](../packages/runner/src/runner-store.ts#L608) · [核验条件](../packages/runner/src/runner-store.ts#L744) · [子任务约束](../packages/runner/src/runner-config.ts#L149) | 为控制任务和可信宿主任务提供可验证的资源释放路径，仍保留未知业务结果。双进程验证失租、旧进程终止、同 ID 重启后可继续调度，以及未知操作不会自动重放。 |
| P1 | **第三方 MCP Schema 可能串用。** Broker 共用 Ajv，锁定版本的 SDK 按 `$id` 复用已编译校验器。可信注册方导入两个同 `$id`、约束不同的 Schema 时，后注册的绑定可能按另一份 Schema 判断输入。长寿命验证器也可能继续持有已撤销绑定的 Schema。 [绑定与编译](../packages/ai/src/mcp/ai-mcp-broker.ts#L99) · [调用校验](../packages/ai/src/mcp/ai-mcp-broker.ts#L190) | 在绑定时隔离各工具的编译结果，撤销时随授权释放。用同 `$id`、不同约束的独立绑定验证输入分别校验，并确保未通过的参数不会到达上游。 |
| P1 | **空闲执行节点也争抢同一数据库写锁。** 默认每 50 ms 轮询，三类领取都会开启更新同一 gate 行的事务，维护与预热也经过该行。本地 SQLite 单执行节点、零任务、无预热池，2.001 秒发生 125 次 gate 写入。ACP 事件轮询也会重复读取任务详情，其中包含完整请求 JSON。 [执行轮询](../packages/runner/src/runner-main.ts#L249) · [数据库门闩](../packages/runner/src/runner-store.ts#L201) · [ACP 轮询](../packages/ai/src/acp/ai-acp-platform.ts#L481) | 空队列先做轻量检查或退避，仅在实际领取时加锁。事件读取避免重复获取完整任务。验收多个空闲与繁忙节点的查询量、锁等待及领取延迟。 |
| P1 | **PostgreSQL 授权列表会假空。** JSONB 路径比较接收普通主体哈希，真实 PostgreSQL 16.15 返回 `22P02`，Store 将查询失败转为空结果。另一个独立问题是规则 ID 派生包含 Worker 快照，快照又包含 `permissions.ruleIds`。指定已保存规则会改变用来查找该规则的 ID。 [授权列表](../packages/ai/src/acp/ai-acp-platform.ts#L1231) · [规则派生](../packages/ai/src/acp/ai-acp-platform.ts#L648) · [数据库过滤](../packages/ai/src/store/providers/ai-store-provider-db.ts#L591) | 使用可索引的作用域字段或正确类型的 JSON 参数，分页前过滤撤销记录，查询失败返回错误。授权规则 ID 绑定稳定权限条件。用真实 PostgreSQL 和 MySQL 验证列表、撤销、过期以及跨会话按 ID 复用。 |
| P2 | **会话长于 MCP 凭据时限时会失去工具。** Broker 默认有效期 15 分钟，凭据在创建原生会话时绑定。策略撤销后原会话仍可保留，重新授权也不会替换旧绑定。 [凭据时限](../packages/ai/src/mcp/ai-mcp-broker.ts#L54) · [会话绑定](../packages/ai/src/acp/ai-acp-platform.ts#L790) | 让工具凭据可在会话内轮换，或明确结束到期会话并重建。验证到期、撤销和重新授权均有明确结果。 |
| P2 | **受管 DSH 的原生审批缺少判定资料。** 固定版本的请求只传 `toolCallId`，类型和参数在此前的工具通知中。平台把审批请求原样传给策略，后者可能因缺少操作与目标安全拒绝。现有审批夹具直接提供完整元数据，真实原生受管测试只验证了无工具的短回答。 [平台审批](../packages/ai/src/acp/ai-acp-platform.ts#L635) · [审批夹具](../packages/ai/tests/fixtures/acp-multiplex.mjs#L56) · [真实 Agent 测试](../packages/ai/tests/ai-acp-managed-native.e2e.test.ts#L138) | 按原生会话和调用 ID 关联必要的最新工具元数据。以真实 DSH 验证指定文件允许一次、错误目标拒绝、数据缺失拒绝，以及结果对应同一调用。 |

## 部署与证据边界

- 受管文档、Office 和 OCR 仅把文件 ID 放入队列，执行节点复核服务和应用文件 ACL，产物以对象 ID 返回。应用须验证任务状态、对象所有权、产物访问和回收。Office 调用重试可形成多个作业，业务有去重要求时还需稳定调用标识。 [作业代码](../packages/ai/src/mcp/ai-mcp-jobs.ts#L90) · [文件钩子](../packages/ai/src/mcp/ai-mcp-types.ts#L293)
- MCP 上游地址和认证引用属于可信管理配置。`internal` 只验证容器接入内部网络，目的地、代理和同网段服务访问由部署控制。浏览器独立镜像的本地代理验收仅覆盖该测试网络。 [MCP 上游调用](../packages/ai/src/mcp/ai-mcp-services.ts#L104) · [容器网络](../packages/runner/src/runner-container.ts#L320)
- API 与执行节点必须共享 Runner 数据库和 AI Store。默认 AI Store 需要 RelDB 与 VecDB 均已初始化，或由应用注入共享 Store。只初始化 RelDB 和 Runner 时，开发环境可能使用进程内 AI Store。内置 Agent 的共享 Worker、受管浏览器生产出网和混合负载 P95 仍待验证。 [AI 初始化](../packages/ai/src/ai-main.ts#L381) · [已验收范围](acp-platform-tasks.md)
- 本轮使用公开 Runner 入口和临时 SQLite 验证行数与空闲写入。PostgreSQL 使用独立的 16.15 容器验证 JSON 比较错误。其余发现来自静态调用链、锁定依赖和现有测试覆盖核对。未进行生产压测或外部目标安全测试。

## AI Playground 所调用的既有 AI 能力

- **P2 · 向量化和重排每次重载模型清单。** 每次调用读取合并清单并新建操作对象，Embedding 的 OpenAI 客户端缓存只在单次操作内部有效。Rerank 使用全局 `fetch`，这里确认的是清单读取和对象构造开销。将操作对象长驻并按实际模型配置复用客户端，同时保留目录更新的可见性。验证同配置多次请求复用以及换地址、密钥或超时时正确更新。 [调用入口](../packages/ai/src/ai-functions.ts#L344) · [客户端缓存](../packages/ai/src/embedding/ai-embedding-functions.ts#L46)
- **P1 · 原生记忆在配额附近整表读取，配额会被并发写入突破。** 全局配额默认 100,000 条。达到上限时读取全部候选后在 Node 端逐条评分，主体配额也会加载该主体的全部候选。统计、淘汰和写入分开执行，多节点可能基于同一计数或淘汰同一条。将并发配额检查和写入放入同一持久化约束，使用有界候选读取，并对向量删除或更新失败保留重试。验证多节点并发写入、读出行数上限及向量与关系数据一致性。 [配额默认值](../packages/ai/src/ai-config.ts#L771) · [淘汰与写入](../packages/ai/src/memory/providers/ai-memory-provider-native.ts#L212)

## 修复与验收

- Runner 默认保留已结束数据 7 天并按批删除，保留仍有子执行的父记录和未核验的未知结果。空闲检查不修改锁行。控制和宿主任务可在原进程确认退出、运维确认自管资源停止后释放占用，业务状态仍为 `unknown`。
- ACP 回收失效审批及授权，按期清理失去 Runner 记录的会话和回执。授权 ID 的匹配排除本轮授权选择，旧规则重新批准后才能按新条件复用。Broker 对每项工具独立校验输入，凭据撤销或到期会撤销访问。原生 DSH 审批按会话与调用 ID 补齐判定资料。
- 原生记忆的关系库写入配额通过事务串行处理，每次读取至多 64 条候选。向量服务和关系库各自提交，失败仍需业务核对。Embedding 复用客户端，默认场景的 Embedding 与 Rerank 只读取对应模型条目。
- 使用真实 PostgreSQL 和 MySQL、独立执行进程、真实 Podman 原生 Agent、真实 MCP SDK 验证对应边界。Playground 的真实 DeepSeek Chat 验收覆盖流式对话和 JSON 对象模式，MiMo 验收覆盖合成及文件与流式转写。其余 Playground 模型功能使用本地协议夹具。
