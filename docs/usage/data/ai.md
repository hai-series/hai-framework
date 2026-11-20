# ai 数据结构

[English](ai.en.md) · [日本語](ai.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/ai.md) · [功能说明](../function/ai.md)

<a id="example-data"></a>

## 这些数据用来做什么

先看用途和例子，再按需查后面的字段与保存规则。例子中的编号和业务内容是虚构的，敏感值已隐藏。时间以 2026-11-17 00:00 UTC 为起点，具体单位在说明中标明。

数据库和文件示例只列说明所需字段，不能直接当成完整写入数据；未列出的字段不表示可省略。不同例子可以展示处理过程中的不同时间。

### 数据库怎样包住一份业务数据

对应结构：`SQL envelope`。

AI 的多种记录共用外层 id、version、data 和时间字段，具体正文放在 data 里。

```json
{
  "id": "session-42",
  "version": "version-42",
  "data": {
    "sessionId": "session-42",
    "objectId": "user-42",
    "title": "Shipping question",
    "createdAt": 1794873600000,
    "updatedAt": 1794873600000
  },
  "object_id": "user-42",
  "created_at": 1794873600000,
  "updated_at": 1794873600000
}
```

此例保存 user-42 的 session-42；version-42 用来检查更新前记录有没有被别人改过。JSON 对象在 SQLite 中实际存为文本。

### 一次模型调用的历史

对应结构：`hai_ai_chat_records`。

保存发给模型的请求和返回结果，供查询历史、用量与问题排查；它不是当前会话正在使用的上下文。

```json
{
  "id": "chat-42",
  "objectId": "user-42",
  "sessionId": "session-42",
  "createdAt": 1794873600000,
  "duration": 25
}
```

chat-42 属于 user-42 的 session-42，用时25毫秒。示例省略可能含敏感正文的 request/response。

### 用户的会话列表

对应结构：`hai_ai_sessions`。

保存会话归属、标题和时间，让用户下次能找到并重新打开已有对话。

```json
{
  "sessionId": "session-42",
  "objectId": "user-42",
  "title": "Shipping question",
  "createdAt": 1794873600000,
  "updatedAt": 1794873600000
}
```

session-42 属于 user-42，标题是 Shipping question；这里只列目录信息，不包含全部聊天正文。

### 下一次回复要带给模型的上下文

对应结构：`hai_ai_context`。

保存当前对话使用的消息、摘要和轮次，重启或切换节点后可以继续，并阻止已重置会话被旧写入恢复。

```json
{
  "messages": [],
  "summaries": [],
  "turns": [],
  "epoch": "epoch-42",
  "updatedAt": 1794873600000
}
```

三个空数组表示还没有保存对话内容，epoch-42 标识当前这次会话状态；它不是消息条数。

### 可反复选择的 AI 角色

对应结构：`hai_ai_persona`。

保存应用为某个主体配置的角色提示和风格，开始对话时按权限选用。

```json
{
  "id": "persona-42",
  "objectId": "user-42",
  "name": "Support",
  "systemPrompt": "Explain the shipping policy.",
  "createdAt": 1794873600000,
  "updatedAt": 1794873600000
}
```

persona-42 属于 user-42，名称 Support，提示要求解释配送政策；角色记录本身不会启动模型调用。

### 运行时登记的对话模型

对应结构：`hai_ai_llm_models`。

保存可选对话模型的连接和参数，让多个节点知道相同模型编号对应什么能力。

```json
{
  "id": "chat-model"
}
```

chat-model 是业务选择模型时使用的登记编号；下面省略连接、密钥等字段，不能只凭这个编号连接外部服务。

### 运行时登记的语音模型

对应结构：`hai_ai_audio_models`。

保存语音识别或合成模型的登记，应用再按操作选择能处理它的模型。

```json
{
  "id": "speech-model"
}
```

speech-model 是示例编号；记录还可包含支持的语音操作和连接参数，此处只展示编号。

### 运行时登记的图像模型

对应结构：`hai_ai_image_models`。

保存图像生成或编辑模型的登记，应用用编号选择服务端允许的模型。

```json
{
  "id": "image-model"
}
```

image-model 是可引用的登记编号，不是已经生成的图片，也不保存图片字节。

### 允许连接的外部工具服务

对应结构：`hai_ai_mcp_servers`。

保存 MCP 服务登记，连接时由服务端使用相应地址、传输方式和认证设置。

```json
{
  "id": "mcp-docs"
}
```

mcp-docs 是服务编号；这里只展示标识，真实凭据不能随工具列表发给客户端或模型。

### 可以从哪里检索资料

对应结构：`hai_ai_retrieval_sources`。

保存检索信源的登记，查询时按选择的信源获取外部资料。

```json
{
  "id": "docs-source"
}
```

docs-source 是一项信源编号，不是已经检索到的正文；实际地址和选项在该信源的完整记录中。

### 跨对话仍要记住的内容

对应结构：`hai_ai_memory`。

保存经应用允许保留的事实或偏好，后续对话可按主体查回相关记忆。

```json
{
  "id": "memory-42",
  "objectId": "user-42",
  "content": "Prefers concise answers",
  "importance": 0.7,
  "createdAt": 1794873600000,
  "lastAccessedAt": 1794873600000,
  "accessCount": 0
}
```

memory-42 记录 user-42 偏好简短回答，重要度0.7、访问次数0；它不同于某次对话的完整消息历史。

### 哪些记忆还需要同步到搜索索引

对应结构：`hai_ai_memory_vector_outbox`。

记忆正文已更新，但向量库可能暂时失败；这张待办表让节点以后补齐，不丢掉同步任务。

```json
{
  "memoryId": "memory-42",
  "updatedAt": 1794873600000,
  "attempts": 0
}
```

memory-42 正等待同步，attempts:0 表示还没尝试；完成后相应待办才会清理，不能把它当第二份记忆正文。

### 这批记忆应写到哪个向量空间

对应结构：`hai_ai_memory_vector_namespace`。

记录记忆向量属于哪个应用空间，以及迁移已进行到哪里，避免不同部署误用同一批索引。

```json
{
  "updatedAt": 1794873600000,
  "namespace": "orders",
  "owner": "namespace-owner-42",
  "migrated": true
}
```

示例 namespace 是 orders，owner 标识这一批索引的归属，migrated:true 表示已完成迁移；updatedAt 是协调时间。

### 索引巡检上次查到了哪里

对应结构：`hai_ai_memory_vector_scan`。

后台分批检查索引，记录进度后下次继续，避免每个节点都从头全量扫描。

```json
{
  "updatedAt": 1794873600000,
  "collection": "hai_ai_memory",
  "cursor": "memory-42",
  "leased": true
}
```

collection 是正在检查的集合，cursor 指向继续位置；leased:true 时 updatedAt 是当前处理资格的截止，不是某条记忆的修改时间。

### 一篇知识文档当前发布到哪一版

对应结构：`hai_ai_knowledge_documents`。

登记文档正文、分块和向量的发布关系，让查询只使用完整发布的同一版本，失败的新版本不会混进结果。

```json
{
  "collection": "hai_ai_knowledge",
  "generation": "generation-42",
  "documentId": "doc-42"
}
```

示例定位 doc-42 在指定集合和 generation-42 中的记录；current/pending 等内容未展开，不能仅凭有这一行就认为文档已发布。

### 一组知识文档属于哪个集合

对应结构：`hai_ai_knowledge_collections`。

保存集合维度和当前代次，重建或删除后用新代次隔开旧写入、旧搜索结果。

```json
{
  "collection": "hai_ai_knowledge",
  "dimension": 3,
  "generation": "generation-42",
  "deleted": false
}
```

hai_ai_knowledge 当前为 generation-42、维度3且未删除；同名集合换了 generation 后不能沿用旧版本结果。

### 智能体任务已经处理到哪一步

对应结构：`hai_ai_a2a_journal`。

保存任务状态、已交付事件和消息回执，连接中断或换节点后可以继续核对，不盲目重做外部动作。

```json
{
  "owner": "user-42",
  "executionId": "execution-42",
  "leasedUntil": 1794873630000,
  "deadline": 1794873660000,
  "events": [],
  "finished": false
}
```

execution-42 还没 finished，当前处理资格和总期限分别由 leasedUntil/deadline 限制；events 为空表示示例尚无事件。

### 这段智能体对话属于谁

对应结构：`hai_ai_a2a_contexts`。

把 context 绑定到可信主体，后续请求不能仅凭一个 context ID 读取别人的任务。

```json
{
  "owner": "user-42"
}
```

owner:user-42 表示这段上下文归属该主体；它不是聊天内容，也不表示其他用户有访问权。

### 智能体任务之间传递的消息

对应结构：`hai_ai_a2a_messages`。

保存用户或智能体提交的消息，并关联任务和上下文，供任务继续处理与查询。

```json
{
  "id": "message-42",
  "taskId": "task-42",
  "role": "user",
  "parts": [
    {
      "kind": "text",
      "text": "Shipping policy?"
    }
  ],
  "createdAt": 1794873600000
}
```

message-42 属于 task-42，user 发送了一段询问配送政策的文字；createdAt 是写入时刻。

### 允许智能体工作的项目空间

对应结构：`hai_ai_acp_workspaces`。

登记宿主认可的工作区和仓库，任务从允许的项目中选择，不接受模型随意指定任意主机路径。

```json
{
  "id": "workspace-42"
}
```

workspace-42 是工作区编号，完整记录还包含项目相关设置；这不是会话或正在运行的进程。

### 可以启动哪一种编码智能体

对应结构：`hai_ai_acp_agents`。

保存智能体的类型、启动或连接方式，由服务端在已授权任务中装配。

```json
{
  "id": "agent-42"
}
```

agent-42 是定义编号，具体命令和连接配置在完整记录中；登记定义不代表已启动一次执行。

### 一次智能体会话绑定的项目和资源

对应结构：`hai_ai_acp_sessions`。

记录当前会话使用哪个智能体、工作区和资源，重连后能找到原来的工作环境。

```json
{
  "id": "acp-session-42",
  "agentId": "agent-42",
  "workspaceId": "workspace-42",
  "cwd": "/workspace/orders"
}
```

acp-session-42 使用 agent-42 和 workspace-42，在 /workspace/orders 工作；目录是受管环境内路径，不是可公开访问的文件地址。

### 避免同时改动同一会话资源

对应结构：`hai_ai_acp_locks`。

启动、恢复或释放会话资源时临时记录操作归属，避免两个节点同时操作同一份环境。

```json
{
  "owner": null
}
```

owner:null 表示当前没有登记的操作拥有者；不能把它当作用户权限或资源已删除的证明。

### 把应用会话接到实际执行会话

对应结构：`hai_ai_acp_managed_sessions`。

保存调用方与执行方的范围和引用，让页面继续操作时找到正确执行会话。

```json
{
  "workerId": "worker-42",
  "mode": "shared"
}
```

worker-42 是实际执行侧的编号，mode:shared 表示共享模式；完整记录还会核对双方 scope，不能只凭编号访问。

### 辨认是不是同一次提交

对应结构：`hai_ai_acp_managed_requests`。

保存规范化请求的内容摘要，重试时比较输入，避免同一请求编号被拿来提交不同动作。

```json
{
  "fingerprint": "<request-digest>"
}
```

fingerprint 是请求摘要占位，不是用户文字或模型回复；内容不一致时不能当成原请求继续处理。

### 哪项操作还在等人批准

对应结构：`hai_ai_acp_managed_approvals`。

智能体遇到需要授权的操作时，把待批准事项和截止时间保存下来，另一节点也能查询或提交决定。

```json
{
  "sessionId": "acp-session-42",
  "deadline": 1794873660000
}
```

acp-session-42 的审批还没有 decision；deadline 到期后不能继续把它当有效批准，等待本身不等于同意。

### 已经允许、之后仍可复用的操作范围

对应结构：`hai_ai_acp_managed_grants`。

用户选择持续允许后保存有限范围的授权，后续仍按主体、会话和到期时间核对。

```json
{
  "id": "grant-42",
  "scopeKey": "scope-42",
  "summary": "Read project files",
  "expires": 1794873660000
}
```

grant-42 允许摘要所述的读取项目文件操作，expires 后不再使用；它不是对任意目录或命令的永久授权。

### 恢复时核对原来的调用范围

对应结构：`hai_ai_acp_managed_receipts`。

保存应用一侧与执行一侧的关联依据，恢复后仍要确认当前请求属于原来那位调用者。

```json
{
  "scope": {
    "tenantId": "team-1",
    "userId": "user-42"
  },
  "workerScope": {
    "tenantId": "team-1",
    "userId": "user-42"
  }
}
```

两个 scope 都是 team-1 的 user-42。即使知道任务编号，其他主体也不能借这份回执读取结果。

### 协调记忆写入

对应结构：`hai_ai_memory_write_gate`。

多个节点要修改同一类记忆状态时，围绕这条固定记录协调事务，避免各自覆盖别人的新结果。

```json
{
  "id": 1,
  "marker": 0
}
```

只有 id:1 一行，marker:0 是初始标记；它不保存记忆正文，也不是已处理记忆条数。

### 协调索引归属和迁移写入

对应结构：`hai_ai_memory_vector_namespace_write_gate`。

多个节点要修改同一类记忆状态时，围绕这条固定记录协调事务，避免各自覆盖别人的新结果。

```json
{
  "id": 1,
  "marker": 0
}
```

只有 id:1 一行，marker:0 是初始标记；它不保存记忆正文，也不是已处理记忆条数。

### 协调巡检进度写入

对应结构：`hai_ai_memory_vector_scan_write_gate`。

多个节点要修改同一类记忆状态时，围绕这条固定记录协调事务，避免各自覆盖别人的新结果。

```json
{
  "id": 1,
  "marker": 0
}
```

只有 id:1 一行，marker:0 是初始标记；它不保存记忆正文，也不是已处理记忆条数。

## 字段、存储与清理参考

<a id="data-fields"></a>

### 数据库

调用 `ai.init(config, options)` 时传入 `options.storeProvider`，AI 就用该对象读写数据。省略该选项时，AI 尝试使用已初始化的 [reldb](reldb.md) 和 [vecdb](vecdb.md)，分别存记录和向量。开发和测试可用进程内存储，进程结束后其中的数据会消失。生产环境的应用实例需要共享同一份数据。下表描述 AI 内置的关系库表，自定义存储可使用自己的结构。

#### 公共字段

| 字段                                          | 类型与默认值                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `id`                                          | 字符串主键，按各功能的业务标识生成                                                                          |
| `version`                                     | 每次写入都生成新的版本值。按版本更新时，如果其他进程已改过该记录，这次写入便不会覆盖它                      |
| `data`                                        | 必填业务记录。PostgreSQL 使用 JSONB，MySQL 使用 JSON，SQLite 使用存放 JSON 的 TEXT                          |
| `created_at`、`updated_at`                    | 必填 Unix 毫秒创建和更新时间，优先取记录中的业务时间，缺省时取写入时间                                      |
| `object_id`、`session_id`、`status`、`ref_id` | 下表列出的可选索引列分别表示主体、会话、状态或引用，省略值时为 NULL。组合了主体及会话的表还建二者的联合索引 |

#### 会话、上下文和资源

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

#### 记忆和知识

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

#### A2A 与 ACP

| 表                             | 附加列或索引            | `data` 的内容                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hai_ai_a2a_journal`           | `object_id`、`ref_id`   | `owner`、`executionId`、`leasedUntil`、`deadline` 为拥有者、执行代际、租约和绝对期限；`task`、`events`、`receipts`、`message`、`result` 为任务、事件、稳定消息回执、当前消息和可选结果；`finished`、`cancelRequested`、`interrupted` 为运行状态                                                                                                 |
| `hai_ai_a2a_contexts`          | 无                      | `owner` 保存 context 主体归属                                                                                                                                                                                                                                                                                                                   |
| `hai_ai_a2a_messages`          | `object_id`、`status`   | `id`、`taskId`、可选 `contextId` 用于关联，`role` 是 user 或 agent，`parts` 为消息内容，可选 `caller` 为调用方，`createdAt` 为写入时间                                                                                                                                                                                                          |
| `hai_ai_acp_workspaces`        | 无                      | 工作区及仓库登记，可用 `__deleted` 屏蔽初始条目                                                                                                                                                                                                                                                                                                 |
| `hai_ai_acp_agents`            | 无                      | 智能体类型、运行和连接定义，可用 `__deleted` 屏蔽初始条目                                                                                                                                                                                                                                                                                       |
| `hai_ai_acp_sessions`          | 无                      | `id`、`agentId`、`workspaceId`、`repositoryId` 记录会话归属；`cwd`、`newWorktree`、`branch`、`workspace`、`worktreeStatus` 描述工作目录、分支和回收。`modelId`、`modelSignature` 保存模型约束，`nativeId` 保存当前原生会话 ID，显式重开成功后更新，`status` 为会话状态，`agent` 是智能体定义快照，`mcpServers`、`mcpServerIds` 记录 MCP 绑定，`resource` 是当前容器引用 |
| `hai_ai_acp_locks`             | 无                      | `owner` 为 ACP 资源操作的所有者，可为空                                                                                                                                                                                                                                                                                                         |
| `hai_ai_acp_managed_sessions`  | `(updated_at, id)` 索引 | `scope`、`workerScope`、`workerId` 绑定调用范围和执行资源，`request`、`mode` 保存请求和执行模式，`historySummary`、`closed`、`singleTurn` 为可选历史摘要和状态                                                                                                                                                                                  |
| `hai_ai_acp_managed_requests`  | 同上                    | `fingerprint` 比对同一请求登记是否一致                                                                                                                                                                                                                                                                                                          |
| `hai_ai_acp_managed_approvals` | 同上                    | `scope`、`sessionId` 标记归属，`deadline` 是审批截止，`decision` 是有结果后的审批决定                                                                                                                                                                                                                                                           |
| `hai_ai_acp_managed_grants`    | 同上                    | `id`、`scopeKey`、`summary` 为授权 ID、范围和摘要；`sessionId` 可选，`expires` 为到期时间，`revoked` 为可选撤销状态                                                                                                                                                                                                                             |
| `hai_ai_acp_managed_receipts`  | 同上                    | `scope` 与 `workerScope` 保留原调用方和执行范围，供恢复时核对                                                                                                                                                                                                                                                                                   |

A2A 使用共享存储的时钟判断任务的时间限制。提交事件时会比较记录版本，避免某个进程覆盖其他进程刚写的内容。事件保存后，订阅者才能读到。完成消息的回执没有自动过期时间。ACP 运行任务和保存事件时使用的表见 [runner](runner.md)。

### 缓存

AI 内置存储不创建 Redis 键。模型连接、工具连接和当前执行所用的对象留在进程内，重启后需要重新建立。对话、A2A 回执和已发布知识可从配置的共享存储读取。浏览器连接实时音频时使用的票据由 [IAM](iam.md) 签发，并在使用时注销。
