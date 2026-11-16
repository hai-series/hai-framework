# ai 数据结构

[数据结构索引](README.md) · [模块配置](../configuration/ai.md) · [功能说明](../function/ai.md)

## 数据库

`ai.init` 依次选择调用方注入的 Store Provider、已就绪的 [reldb](reldb.md) 与 [vecdb](vecdb.md) 组合、开发进程内 Store。下表适用于内置关系数据库 Store。自定义 Provider 可以采用自己的结构。生产要求共享状态。

### 公共字段

| 字段                                          | 类型与默认值                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `id`                                          | 字符串主键，按各功能的业务标识生成                                                                          |
| `version`                                     | 必填版本标识，写入时生成，用于 CAS 防止覆盖旧代                                                             |
| `data`                                        | 必填业务记录。PostgreSQL 使用 JSONB，MySQL 使用 JSON，SQLite 使用存放 JSON 的 TEXT                          |
| `created_at`、`updated_at`                    | 必填 Unix 毫秒创建和更新时间，优先取记录中的业务时间，缺省时取写入时间                                      |
| `object_id`、`session_id`、`status`、`ref_id` | 下表列出的可选索引列分别表示主体、会话、状态或引用，省略值时为 NULL。组合了主体及会话的表还建二者的联合索引 |

### 会话、上下文和资源

| 表                         | 附加列                    | `data` 的内容                                                                                                                                                                                    |
| -------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hai_ai_chat_records`      | `object_id`、`session_id` | `id`、`objectId`、`sessionId` 定位调用。`request` 保存模型和消息，`response` 保存正文、工具调用、结束原因与用量，`createdAt`、`duration` 保存创建时间及调用耗时                                  |
| `hai_ai_sessions`          | `object_id`               | `sessionId`、`objectId` 标识会话和归属，`title`、`metadata` 是可空展示数据，`createdAt`、`updatedAt` 是时间，`deleted` 是阻止重建的删除标记                                                      |
| `hai_ai_context`           | `object_id`、`session_id` | `scope` 为会话作用域，`messages`、`summaries`、`turns` 保存消息、压缩摘要和轮次，初始为空数组。`epoch` 是代际，`active` 为可选生成或待提交轮次，`deleted` 是可选删除标记，`updatedAt` 是存储时间 |
| `hai_ai_persona`           | `object_id`               | `id`、`objectId` 定位角色及归属，`name`、`systemPrompt`、`traits` 保存显示名、系统提示和风格，`metadata` 为扩展属性，`createdAt`、`updatedAt` 记录时间                                           |
| `hai_ai_llm_models`        | 无                        | LLM 模型登记                                                                                                                                                                                     |
| `hai_ai_audio_models`      | 无                        | 音频模型登记                                                                                                                                                                                     |
| `hai_ai_image_models`      | 无                        | 图像模型登记                                                                                                                                                                                     |
| `hai_ai_mcp_servers`       | 无                        | 外部 MCP 服务登记                                                                                                                                                                                |
| `hai_ai_retrieval_sources` | 无                        | 检索信源登记                                                                                                                                                                                     |

五个资源表以各自配置 schema 的登记项为记录内容。运行时登记按 ID 覆盖初始清单，`__deleted` 屏蔽相应初始项。私密配置和会话内容按服务端数据管理。

### 记忆和知识

| 表                               | 附加列或索引                                                                                      | `data` 的内容                                                                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hai_ai_memory`                  | `object_id`；向量键索引，PostgreSQL 另有作用域 JSONB GIN。MySQL 用生成列 `memory_vector_key` 索引 | `id`、`content`、`type`、`importance` 为记忆标识、正文、类型和重要度。可选 `objectId`、`scope`、`metadata`、`vector`、`vectorId` 为所属主体、范围、扩展数据、向量和向量版本标识。`createdAt`、`lastAccessedAt`、`accessCount` 记录创建、最后访问时间与次数 |
| `hai_ai_memory_vector_outbox`    | `(updated_at, id)` 索引                                                                           | `memoryId`、`updatedAt`、`attempts` 记录待同步的记忆、调度时间和次数。`token`、`retireUntil`、`cooldown` 为可选领取令牌和延期/节流状态                                                                                                                     |
| `hai_ai_memory_vector_namespace` | 无                                                                                                | 以 `namespace` 为固定记录键保存集合命名空间、所有者、可选迁移游标与完成标记、更新时间                                                                                                                                                                      |
| `hai_ai_memory_vector_scan`      | 无                                                                                                | 以 `scan` 为固定记录键保存可选集合、游标和租约标记；`updatedAt` 表示下次领取时间或现有租约截止                                                                                                                                                             |
| `hai_ai_knowledge_documents`     | `object_id`、`session_id`                                                                         | `key` 是集合、代际和文档 ID 摘要。`collection`、`generation`、`documentId` 定位逻辑文档；可选 `current` 是已发布正文、分块和实体，`pending` 为待发布版本及截止，`garbage` 保存外部索引待清理版本                                                           |
| `hai_ai_knowledge_collections`   | 无                                                                                                | `collection`、`dimension` 为集合名和维度，`generation`、`deleted` 决定集合代际与可见性                                                                                                                                                                     |

`hai_ai_memory_write_gate`、`hai_ai_memory_vector_namespace_write_gate`、`hai_ai_memory_vector_scan_write_gate` 的 `id` 为单行主键 1，`marker` 初始为 0。比较及写入使用数据库事务协调。同一记忆的当前关系记录决定向量的有效版本。

知识向量由 vecdb 保存，默认逻辑集合为 `hai_ai_knowledge`，可配置修改。检索以已发布的文档代际和版本为准。原生记忆使用自己的向量集合，代码从 `hai_ai_memory` 或持久化命名空间绑定取得集合。选择 Mem0 时原生记忆相关表不承担记忆持久化，具体数据由 Mem0 及其已配置的外部向量后端管理。

### A2A 与 ACP

| 表                             | 附加列或索引            | `data` 的内容                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hai_ai_a2a_journal`           | `object_id`、`ref_id`   | `owner`、`executionId`、`leasedUntil`、`deadline` 为拥有者、执行代际、租约和绝对期限；`task`、`events`、`receipts`、`message`、`result` 为任务、事件、稳定消息回执、当前消息和可选结果；`finished`、`cancelRequested`、`interrupted` 为运行状态                                                                                                 |
| `hai_ai_a2a_contexts`          | 无                      | `owner` 保存 context 主体归属                                                                                                                                                                                                                                                                                                                   |
| `hai_ai_a2a_messages`          | `object_id`、`status`   | `id`、`taskId`、可选 `contextId` 用于关联，`role` 是 user 或 agent，`parts` 为消息内容，可选 `caller` 为调用方，`createdAt` 为写入时间                                                                                                                                                                                                          |
| `hai_ai_acp_workspaces`        | 无                      | 工作区及仓库登记，可用 `__deleted` 屏蔽初始条目                                                                                                                                                                                                                                                                                                 |
| `hai_ai_acp_agents`            | 无                      | 智能体类型、运行和连接定义，可用 `__deleted` 屏蔽初始条目                                                                                                                                                                                                                                                                                       |
| `hai_ai_acp_sessions`          | 无                      | `id`、`agentId`、`workspaceId`、`repositoryId` 记录会话归属；`cwd`、`newWorktree`、`branch`、`workspace`、`worktreeStatus` 描述工作目录、分支和回收。`modelId`、`modelSignature` 保存模型约束，`nativeId` 保存原生会话 ID，`status` 为会话状态，`agent` 是智能体定义快照，`mcpServers`、`mcpServerIds` 记录 MCP 绑定，`resource` 是当前容器引用 |
| `hai_ai_acp_locks`             | 无                      | `owner` 为 ACP 资源操作的所有者，可为空                                                                                                                                                                                                                                                                                                         |
| `hai_ai_acp_managed_sessions`  | `(updated_at, id)` 索引 | `scope`、`workerScope`、`workerId` 绑定调用范围和执行资源，`request`、`mode` 保存请求和执行模式，`historySummary`、`closed`、`singleTurn` 为可选历史摘要和状态                                                                                                                                                                                  |
| `hai_ai_acp_managed_requests`  | 同上                    | `fingerprint` 比对同一请求登记是否一致                                                                                                                                                                                                                                                                                                          |
| `hai_ai_acp_managed_approvals` | 同上                    | `scope`、`sessionId` 标记归属，`deadline` 是审批截止，`decision` 是有结果后的审批决定                                                                                                                                                                                                                                                           |
| `hai_ai_acp_managed_grants`    | 同上                    | `id`、`scopeKey`、`summary` 为授权 ID、范围和摘要；`sessionId` 可选，`expires` 为到期时间，`revoked` 为可选撤销状态                                                                                                                                                                                                                             |
| `hai_ai_acp_managed_receipts`  | 同上                    | `scope` 与 `workerScope` 保留原调用方和执行范围，供恢复时核对                                                                                                                                                                                                                                                                                   |

A2A journal 用共享存储时间和 CAS 提交，事件持久化后对订阅者可见。已完成回执不自动过期。ACP 的运行执行和事件记录另见 [runner](runner.md)。

## 缓存

AI 内置 Store 不创建 Redis 键。模型和工具连接、执行句柄及部分临时操作状态在当前进程持有。对话、A2A 回执和知识发布以共享存储中的记录为准。浏览器实时音频使用的能力票据由 [IAM](iam.md) 签发及消费。
