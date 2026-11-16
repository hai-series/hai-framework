# ai 数据结构

[数据结构索引](README.md) · [模块配置](../configuration/ai.md) · [功能说明](../function/ai.md)

## 数据库

调用 `ai.init(config, options)` 时传入 `options.storeProvider`，AI 就用该对象读写数据。省略该选项时，AI 尝试使用已初始化的 [reldb](reldb.md) 和 [vecdb](vecdb.md)，分别存记录和向量。开发和测试可用进程内存储，进程结束后其中的数据会消失。生产环境的应用实例需要共享同一份数据。下表描述 AI 内置的关系库表，自定义存储可使用自己的结构。

### 公共字段

| 字段                                          | 类型与默认值                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `id`                                          | 字符串主键，按各功能的业务标识生成                                                                          |
| `version`                                     | 每次写入都生成新的版本值。按版本更新时，如果其他进程已改过该记录，这次写入便不会覆盖它                      |
| `data`                                        | 必填业务记录。PostgreSQL 使用 JSONB，MySQL 使用 JSON，SQLite 使用存放 JSON 的 TEXT                          |
| `created_at`、`updated_at`                    | 必填 Unix 毫秒创建和更新时间，优先取记录中的业务时间，缺省时取写入时间                                      |
| `object_id`、`session_id`、`status`、`ref_id` | 下表列出的可选索引列分别表示主体、会话、状态或引用，省略值时为 NULL。组合了主体及会话的表还建二者的联合索引 |

### 会话、上下文和资源

| 表                         | 附加列                    | `data` 的内容                                                                                                                                                                                                            |
| -------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hai_ai_chat_records`      | `object_id`、`session_id` | `id`、`objectId`、`sessionId` 定位调用。`request` 保存模型和消息，`response` 保存正文、工具调用、结束原因与用量，`createdAt`、`duration` 保存创建时间及调用耗时                                                          |
| `hai_ai_sessions`          | `object_id`               | `sessionId`、`objectId` 标识会话和归属，`title`、`metadata` 是可空展示数据，`createdAt`、`updatedAt` 是时间，`deleted` 是阻止重建的删除标记                                                                              |
| `hai_ai_context`           | `object_id`、`session_id` | `scope` 记录用户与会话的范围，`messages`、`summaries`、`turns` 保存消息、压缩摘要和轮次，初始为空数组。`epoch` 标记当前会话代次，`active` 记录可选的生成中或待保存轮次，`deleted` 是可选删除标记，`updatedAt` 是存储时间 |
| `hai_ai_persona`           | `object_id`               | `id`、`objectId` 定位角色及归属，`name`、`systemPrompt`、`traits` 保存显示名、系统提示和风格，`metadata` 为扩展属性，`createdAt`、`updatedAt` 记录时间                                                                   |
| `hai_ai_llm_models`        | 无                        | LLM 模型登记                                                                                                                                                                                                             |
| `hai_ai_audio_models`      | 无                        | 音频模型登记                                                                                                                                                                                                             |
| `hai_ai_image_models`      | 无                        | 图像模型登记                                                                                                                                                                                                             |
| `hai_ai_mcp_servers`       | 无                        | 外部 MCP 服务登记                                                                                                                                                                                                        |
| `hai_ai_retrieval_sources` | 无                        | 检索信源登记                                                                                                                                                                                                             |

这五个表的 `data` 字段采用对应资源的配置结构。启动配置登记一个 ID 后，应用运行时写入相同 ID 的设置会优先使用。删除标记 `__deleted` 可以让启动配置中的同 ID 项不再生效。涉及账号、密钥和会话正文的记录只供服务端读取。

### 记忆和知识

| 表                               | 附加列或索引                                                                                      | `data` 的内容                                                                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hai_ai_memory`                  | `object_id`；向量键索引，PostgreSQL 另有作用域 JSONB GIN。MySQL 用生成列 `memory_vector_key` 索引 | `id`、`content`、`type`、`importance` 为记忆标识、正文、类型和重要度。可选 `objectId`、`scope`、`metadata`、`vector`、`vectorId` 为所属主体、范围、扩展数据、向量和向量版本标识。`createdAt`、`lastAccessedAt`、`accessCount` 记录创建、最后访问时间与次数 |
| `hai_ai_memory_vector_outbox`    | `(updated_at, id)` 索引                                                                           | `memoryId`、`updatedAt`、`attempts` 记录待同步的记忆、调度时间和次数。`token`、`retireUntil`、`cooldown` 为可选领取令牌和延期/节流状态                                                                                                                     |
| `hai_ai_memory_vector_namespace` | 无                                                                                                | 以 `namespace` 为固定记录键保存集合命名空间、所有者、可选迁移游标与完成标记、更新时间                                                                                                                                                                      |
| `hai_ai_memory_vector_scan`      | 无                                                                                                | 以 `scan` 为固定记录键保存可选集合、游标和租约标记；`updatedAt` 表示下次领取时间或现有租约截止                                                                                                                                                             |
| `hai_ai_knowledge_documents`     | `object_id`、`session_id`                                                                         | `key` 是集合、代际和文档 ID 摘要。`collection`、`generation`、`documentId` 定位逻辑文档；可选 `current` 是已发布正文、分块和实体，`pending` 为待发布版本及截止，`garbage` 保存外部索引待清理版本                                                           |
| `hai_ai_knowledge_collections`   | 无                                                                                                | `collection`、`dimension` 为集合名和维度，`generation`、`deleted` 决定集合代际与可见性                                                                                                                                                                     |

`hai_ai_memory_write_gate`、`hai_ai_memory_vector_namespace_write_gate`、`hai_ai_memory_vector_scan_write_gate` 的 `id` 为单行主键 1，`marker` 初始为 0。多个实例通过事务锁协调对这些状态的读写。查询某条记忆时，以关系表当前记录指向的向量版本为准，过时的向量即使尚未从索引清除也不用于返回结果。

AI 把知识向量写入 [vecdb](vecdb.md)。默认集合名为 `hai_ai_knowledge`，可通过配置修改。文档更新后，搜索使用已经发布的新版本。使用 AI 自带的记忆功能时，向量保存在独立集合，默认名为 `hai_ai_memory`。如果应用配置并绑定了记忆命名空间，则使用绑定生成的集合名。选择 Mem0 时，由 Mem0 和它连接的向量数据库存储记忆。

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

A2A 使用共享存储的时钟判断任务的时间限制。提交事件时会比较记录版本，避免某个进程覆盖其他进程刚写的内容。事件保存后，订阅者才能读到。完成消息的回执没有自动过期时间。ACP 运行任务和保存事件时使用的表见 [runner](runner.md)。

## 缓存

AI 内置存储不创建 Redis 键。模型连接、工具连接和当前执行所用的对象留在进程内，重启后需要重新建立。对话、A2A 回执和已发布知识可从配置的共享存储读取。浏览器连接实时音频时使用的票据由 [IAM](iam.md) 签发，并在使用时注销。
