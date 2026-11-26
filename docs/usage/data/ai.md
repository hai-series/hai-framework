# @h-ai/ai 数据结构

<a id="ai-数据结构"></a>

[English](ai.en.md) · [日本語](ai.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/ai.md) · [功能说明](../function/ai.md)

用户重新打开一段对话时，AI 按用户和会话编号找回会话信息及历史，再组装下一次回复需要的上下文。启用关系库存储时，这些记录可以跨进程重启保留；记忆与知识的向量数据由各自的索引后端保存。

<a id="data-fields"></a>

<a id="database"></a>

## 数据库

使用内置 RelDB 存储时，AI 最多创建 30 张表。启用 A2A 才会创建对应的三张表。选择 Mem0 时，AI 不再创建内置记忆相关表。应用也可以通过 `ai.init(config, { storeProvider })` 接入自己的存储。在使用进程内存储的环境中，记录随应用停止而消失。

| 表名 | 用途 |
| --- | --- |
| [`hai_ai_chat_records`](#table-hai-ai-chat-records) | 查询模型调用的请求、回复和用量。 |
| [`hai_ai_sessions`](#table-hai-ai-sessions) | 列出用户的会话。 |
| [`hai_ai_context`](#table-hai-ai-context) | 为模型下一轮回复恢复上下文。 |
| [`hai_ai_persona`](#table-hai-ai-persona) | 读取用户可选的角色和提示语。 |
| [`hai_ai_llm_models`](#table-hai-ai-llm-models) | 运行时登记对话模型。 |
| [`hai_ai_audio_models`](#table-hai-ai-audio-models) | 运行时登记语音模型。 |
| [`hai_ai_image_models`](#table-hai-ai-image-models) | 运行时登记图片模型。 |
| [`hai_ai_mcp_servers`](#table-hai-ai-mcp-servers) | 查允许连接的外部工具服务。 |
| [`hai_ai_retrieval_sources`](#table-hai-ai-retrieval-sources) | 查可以从哪里检索资料。 |
| [`hai_ai_memory`](#table-hai-ai-memory) | 保存跨会话要记住的信息。 |
| [`hai_ai_memory_vector_outbox`](#table-hai-ai-memory-vector-outbox) | 找出需要补写或清理的记忆向量。 |
| [`hai_ai_memory_vector_namespace`](#table-hai-ai-memory-vector-namespace) | 保存当前应用的记忆向量集合归属。 |
| [`hai_ai_memory_vector_scan`](#table-hai-ai-memory-vector-scan) | 记住索引巡检上次的进度。 |
| [`hai_ai_knowledge_documents`](#table-hai-ai-knowledge-documents) | 找到知识文档的已发布版本。 |
| [`hai_ai_knowledge_collections`](#table-hai-ai-knowledge-collections) | 查知识集合的维度、代次和可见性。 |
| [`hai_ai_a2a_journal`](#table-hai-ai-a2a-journal) | 恢复智能体任务进度、事件和消息回执。 |
| [`hai_ai_a2a_contexts`](#table-hai-ai-a2a-contexts) | 根据对话编号核对归属。 |
| [`hai_ai_a2a_messages`](#table-hai-ai-a2a-messages) | 读取任务中提交的消息。 |
| [`hai_ai_acp_workspaces`](#table-hai-ai-acp-workspaces) | 查可以交给智能体处理的项目及仓库。 |
| [`hai_ai_acp_agents`](#table-hai-ai-acp-agents) | 查可启动的编码智能体和连接方式。 |
| [`hai_ai_acp_sessions`](#table-hai-ai-acp-sessions) | 按会话找项目、原生会话和运行资源。 |
| [`hai_ai_acp_locks`](#table-hai-ai-acp-locks) | 避免同时修改同一个会话资源。 |
| [`hai_ai_acp_managed_sessions`](#table-hai-ai-acp-managed-sessions) | 将应用会话关联到实际运行的会话。 |
| [`hai_ai_acp_managed_requests`](#table-hai-ai-acp-managed-requests) | 核对是不是同一次提交。 |
| [`hai_ai_acp_managed_approvals`](#table-hai-ai-acp-managed-approvals) | 找到仍需人工批准的操作。 |
| [`hai_ai_acp_managed_grants`](#table-hai-ai-acp-managed-grants) | 查可复用的授权范围和期限。 |
| [`hai_ai_acp_managed_receipts`](#table-hai-ai-acp-managed-receipts) | 恢复时核对原调用方和执行者的权限范围。 |
| [`hai_ai_memory_write_gate`](#table-hai-ai-memory-write-gate) | 协调多个节点改写记忆正文。 |
| [`hai_ai_memory_vector_namespace_write_gate`](#table-hai-ai-memory-vector-namespace-write-gate) | 协调向量集合归属的登记。 |
| [`hai_ai_memory_vector_scan_write_gate`](#table-hai-ai-memory-vector-scan-write-gate) | 协调索引巡检进度写入。 |

<a id="example-data"></a>

### 数据库中的记录编号、版本和正文

AI 的多种记录都有 `id`、`version`、`data` 和时间字段，具体业务内容放在 `data` 里。下面是会话记录的字段节选，创建和更新时间均为 Unix 毫秒。

```json
{
  "id": "session-42",
  "version": "6fdb3344-5197-490b-a36d-2d43ce7cc3ba",
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

此例保存 `user-42` 的 `session-42`。应用更新这条记录时可用 `version` 检查期间是否有人改过它。

<a id="table-hai-ai-chat-records"></a>

### `hai_ai_chat_records`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `chat-42` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `request` 保存发给模型的消息，`response` 保存回复、工具调用和用量。 | [业务数据示例](#一次模型调用的历史) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |
| `object_id` | `TEXT` | 是 | — | 所属主体，用于按主体查询。 | `user-42` |
| `session_id` | `TEXT` | 是 | — | 所属会话，用于按会话和主体查询。 | `session-42` |

<a id="一次模型调用的历史"></a>

#### 示例 · 一次模型调用的历史

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

<a id="table-hai-ai-sessions"></a>

### `hai_ai_sessions`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `<session-key>` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `sessionId` 和 `objectId` 关联会话与用户。`title`、`metadata` 用于展示，`deleted` 阻止删除的会话被旧写入恢复。 | [业务数据示例](#用户的会话列表) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |
| `object_id` | `TEXT` | 是 | — | 所属主体，用于按主体查询。 | `user-42` |

<a id="用户的会话列表"></a>

#### 示例 · 用户的会话列表

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

<a id="table-hai-ai-context"></a>

### `hai_ai_context`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `<session-key>` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `scope` 标记归属，`messages`、`summaries`、`turns` 保存对话，初始为空数组。`epoch` 标记重置代次，`active` 可记录生成中或待保存的轮次。 | [业务数据示例](#下一次回复要带给模型的上下文) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |
| `object_id` | `TEXT` | 是 | — | 所属主体，用于按主体查询。 | `user-42` |
| `session_id` | `TEXT` | 是 | — | 所属会话，用于按会话和主体查询。 | `session-42` |

<a id="下一次回复要带给模型的上下文"></a>

#### 示例 · 下一次回复要带给模型的上下文

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

<a id="table-hai-ai-persona"></a>

### `hai_ai_persona`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `persona-42` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `name`、`systemPrompt`、`traits` 保存名称、系统提示和风格，`metadata` 可保存扩展资料。 | [业务数据示例](#可反复选择的-ai-角色) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |
| `object_id` | `TEXT` | 是 | — | 所属主体，用于按主体查询。 | `user-42` |

<a id="可反复选择的-ai-角色"></a>

#### 示例 · 可反复选择的 AI 角色

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

<a id="table-hai-ai-llm-models"></a>

### `hai_ai_llm_models`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `chat-model` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `id` 标识模型，其他字段保存协议、模型名和连接参数。 | [业务数据示例](#运行时登记的对话模型) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

<a id="运行时登记的对话模型"></a>

#### 示例 · 运行时登记的对话模型

保存可选对话模型的连接和参数，让多个节点知道相同模型编号对应什么能力。

```json
{
  "id": "chat-model"
}
```

chat-model 是业务选择模型时使用的登记编号；下面省略连接、密钥等字段，不能只凭这个编号连接外部服务。

<a id="table-hai-ai-audio-models"></a>

### `hai_ai_audio_models`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `audio-model` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | 语音转文字或合成模型的配置，含模型 ID 和连接参数。 | [业务数据示例](#运行时登记的语音模型) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

<a id="运行时登记的语音模型"></a>

#### 示例 · 运行时登记的语音模型

保存语音识别或合成模型的登记，应用再按操作选择能处理它的模型。

```json
{
  "id": "speech-model"
}
```

speech-model 是示例编号；记录还可包含支持的语音操作和连接参数，此处只展示编号。

<a id="table-hai-ai-image-models"></a>

### `hai_ai_image_models`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `image-model` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | 图片模型 ID、服务连接和默认参数。 | [业务数据示例](#运行时登记的图像模型) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

<a id="运行时登记的图像模型"></a>

#### 示例 · 运行时登记的图像模型

保存图像生成或编辑模型的登记，应用用编号选择服务端允许的模型。

```json
{
  "id": "image-model"
}
```

image-model 是可引用的登记编号，不是已经生成的图片，也不保存图片字节。

<a id="table-hai-ai-mcp-servers"></a>

### `hai_ai_mcp_servers`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `tools-server` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | 外部 MCP 服务的连接方式、地址和调用设置。 | [业务数据示例](#允许连接的外部工具服务) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

<a id="允许连接的外部工具服务"></a>

#### 示例 · 允许连接的外部工具服务

保存 MCP 服务登记，连接时由服务端使用相应地址、传输方式和认证设置。

```json
{
  "id": "mcp-docs"
}
```

mcp-docs 是服务编号；这里只展示标识，真实凭据不能随工具列表发给客户端或模型。

<a id="table-hai-ai-retrieval-sources"></a>

### `hai_ai_retrieval_sources`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `support-source` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | 检索信源的 ID、类型和连接设置。 | [业务数据示例](#可以从哪里检索资料) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

同一 ID 同时出现在启动配置和数据库时，使用配置中的定义。数据库里的 `__deleted` 标记删除了某条运行时登记。认证信息只供服务端使用。

<a id="可以从哪里检索资料"></a>

#### 示例 · 可以从哪里检索资料

保存检索信源的登记，查询时按选择的信源获取外部资料。

```json
{
  "id": "docs-source"
}
```

docs-source 是一项信源编号，不是已经检索到的正文；实际地址和选项在该信源的完整记录中。

<a id="table-hai-ai-memory"></a>

### `hai_ai_memory`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `memory-42` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `content`、`type`、`importance` 保存记忆内容、类别和重要度。还可记录作用域、访问次数、向量和向量版本。 | [业务数据示例](#跨对话仍要记住的内容) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |
| `object_id` | `TEXT` | 是 | — | 所属主体，用于按主体查询。 | `user-42` |

记忆检索使用关系表当前版本指向的向量。PostgreSQL 用 JSONB GIN 加速作用域查询。MySQL 通过生成列 `memory_vector_key`（`VARCHAR(512)`，可能为空）给向量键建索引。此列从 `data.vectorId` 取值，未分配向量修订 ID 的记录使用记忆业务键 `id`。

<a id="跨对话仍要记住的内容"></a>

#### 示例 · 跨对话仍要记住的内容

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

<a id="table-hai-ai-memory-vector-outbox"></a>

### `hai_ai_memory_vector_outbox`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `memory-42` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `memoryId`、`updatedAt`、`attempts` 记录记忆、调度时间和次数，可选 `token`、`retireUntil`、`cooldown` 记录领取、延期及节流。 | [业务数据示例](#哪些记忆还需要同步到搜索索引) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

按 `(updated_at, id)` 建索引，供后台按时间翻页。

<a id="哪些记忆还需要同步到搜索索引"></a>

#### 示例 · 哪些记忆还需要同步到搜索索引

记忆正文已更新，但向量库可能暂时失败；这张待办表让节点以后补齐，不丢掉同步任务。

```json
{
  "memoryId": "memory-42",
  "updatedAt": 1794873600000,
  "attempts": 0
}
```

memory-42 正等待同步，attempts:0 表示还没尝试；完成后相应待办才会清理，不能把它当第二份记忆正文。

<a id="table-hai-ai-memory-vector-namespace"></a>

### `hai_ai_memory_vector_namespace`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `namespace` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `namespace` 和 `owner` 定位应用的专用向量集合。 | [业务数据示例](#这批记忆应写到哪个向量空间) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

<a id="这批记忆应写到哪个向量空间"></a>

#### 示例 · 这批记忆应写到哪个向量空间

每个关系库登记一份集合归属，供同一应用的所有服务节点复用。

```json
{
  "namespace": "orders",
  "owner": "688b8ef73cac470fbea1e0bfcbf0eed0"
}
```

此记录对应物理集合 `hai_m_orders_688b8ef73cac470fbea1e0bfcbf0eed0`。即使其他应用使用同名命名空间，其独立关系库也会登记不同的 `owner`。

<a id="table-hai-ai-memory-vector-scan"></a>

### `hai_ai_memory_vector_scan`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `scan` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | 保存集合、游标和领取状态。`updatedAt` 表示下次领取时间或本次领取期限。 | [业务数据示例](#索引巡检上次查到了哪里) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

<a id="索引巡检上次查到了哪里"></a>

#### 示例 · 索引巡检上次查到了哪里

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

<a id="table-hai-ai-knowledge-documents"></a>

### `hai_ai_knowledge_documents`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `<document-key>` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `current` 保存已发布正文、分块和实体，`pending` 保存待发布版本，`garbage` 保存外部索引中待清理的版本。 | [业务数据示例](#一篇知识文档当前发布到哪一版) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |
| `object_id` | `TEXT` | 是 | — | 所属知识集合，按集合查询。 | `hai_ai_knowledge` |
| `session_id` | `TEXT` | 是 | — | 所属集合代次，与集合名联合查询。 | `generation-42` |

<a id="一篇知识文档当前发布到哪一版"></a>

#### 示例 · 一篇知识文档当前发布到哪一版

登记文档正文、分块和向量的发布关系，让查询只使用完整发布的同一版本，失败的新版本不会混进结果。

```json
{
  "collection": "hai_ai_knowledge",
  "generation": "generation-42",
  "documentId": "doc-42"
}
```

示例定位 doc-42 在指定集合和 generation-42 中的记录；current/pending 等内容未展开，不能仅凭有这一行就认为文档已发布。

<a id="table-hai-ai-knowledge-collections"></a>

### `hai_ai_knowledge_collections`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `hai_ai_knowledge` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `collection` 和 `dimension` 记录名称与维度，`generation`、`deleted` 决定读取哪个代次。 | [业务数据示例](#一组知识文档属于哪个集合) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

<a id="一组知识文档属于哪个集合"></a>

#### 示例 · 一组知识文档属于哪个集合

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

<a id="table-hai-ai-a2a-journal"></a>

### `hai_ai_a2a_journal`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `task-42` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `owner`、`executionId`、`leasedUntil`、`deadline` 约束谁能继续处理及期限，`task`、`events`、`receipts`、`message`、`result` 保存过程与结果。 | [业务数据示例](#智能体任务已经处理到哪一步) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |
| `object_id` | `TEXT` | 是 | — | 所属主体，用于按主体查询。 | `user-42` |
| `ref_id` | `TEXT` | 是 | — | 关联的上下文编号，用于查询任务。 | `context-42` |

A2A 以共享存储的时钟判断任务期限，保存事件时会比较记录版本。完成消息的回执没有自动过期时间。

执行器通过 `ai.a2a.getCallerIdentity(context)` 读取该次请求的 Key ID、范围与有效权限。这些字段放在 SDK 请求上下文中。任务和消息按已核验的调用方 ID 关联。 [A2A 执行器鉴权](../function/ai.md#a2a-http-example)

<a id="智能体任务已经处理到哪一步"></a>

#### 示例 · 智能体任务已经处理到哪一步

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

<a id="table-hai-ai-a2a-contexts"></a>

### `hai_ai_a2a_contexts`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `context-42` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `owner` 是该 context 的可信主体。 | [业务数据示例](#这段智能体对话属于谁) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

<a id="这段智能体对话属于谁"></a>

#### 示例 · 这段智能体对话属于谁

把 context 绑定到可信主体，后续请求不能仅凭一个 context ID 读取别人的任务。

```json
{
  "owner": "user-42"
}
```

owner:user-42 表示这段上下文归属该主体；它不是聊天内容，也不表示其他用户有访问权。

<a id="table-hai-ai-a2a-messages"></a>

### `hai_ai_a2a_messages`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `message-42` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | 消息 ID、任务、可选上下文、发送角色、消息分段和创建时间。 | [业务数据示例](#智能体任务之间传递的消息) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |
| `object_id` | `TEXT` | 是 | — | 所属主体，用于按主体查询。 | `user-42` |
| `status` | `TEXT` | 是 | — | 消息所关联任务的状态，用于筛选。 | `completed` |

<a id="智能体任务之间传递的消息"></a>

#### 示例 · 智能体任务之间传递的消息

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

<a id="table-hai-ai-acp-workspaces"></a>

### `hai_ai_acp_workspaces`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `project` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | 工作区定义，含保存位置和可访问的仓库。 | [业务数据示例](#允许智能体工作的项目空间) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

<a id="允许智能体工作的项目空间"></a>

#### 示例 · 允许智能体工作的项目空间

登记宿主认可的工作区和仓库，任务从允许的项目中选择，不接受模型随意指定任意主机路径。

```json
{
  "id": "workspace-42"
}
```

workspace-42 是工作区编号，完整记录还包含项目相关设置；这不是会话或正在运行的进程。

<a id="table-hai-ai-acp-agents"></a>

### `hai_ai_acp_agents`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `coder` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | 智能体定义，含运行模式、适配器、模型和环境范围。 | [业务数据示例](#可以启动哪一种编码智能体) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

<a id="可以启动哪一种编码智能体"></a>

#### 示例 · 可以启动哪一种编码智能体

保存智能体的类型、启动或连接方式，由服务端在已授权任务中装配。

```json
{
  "id": "agent-42"
}
```

agent-42 是定义编号，具体命令和连接配置在完整记录中；登记定义不代表已启动一次执行。

<a id="table-hai-ai-acp-sessions"></a>

### `hai_ai_acp_sessions`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `session-42` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | 会话绑定的智能体、工作区、仓库、分支、模型、MCP 和当前容器。显式重开成功后更新 `nativeId`。 | [业务数据示例](#一次智能体会话绑定的项目和资源) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

<a id="一次智能体会话绑定的项目和资源"></a>

#### 示例 · 一次智能体会话绑定的项目和资源

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

<a id="table-hai-ai-acp-locks"></a>

### `hai_ai_acp_locks`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `session-42` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `owner` 是当前资源操作的领取者，可以为空。 | [业务数据示例](#避免同时改动同一会话资源) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

<a id="避免同时改动同一会话资源"></a>

#### 示例 · 避免同时改动同一会话资源

启动、恢复或释放会话资源时临时记录操作归属，避免两个节点同时操作同一份环境。

```json
{
  "owner": null
}
```

owner:null 表示当前没有登记的操作拥有者；不能把它当作用户权限或资源已删除的证明。

<a id="table-hai-ai-acp-managed-sessions"></a>

### `hai_ai_acp_managed_sessions`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `session-42` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `scope`、`workerScope`、`workerId` 保存调用范围和执行资源，`request`、`mode` 保存请求与执行方式，还可保留历史摘要和会话状态。 | [业务数据示例](#把应用会话接到实际执行会话) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

按 `(updated_at, id)` 建索引，供后台按时间翻页。

<a id="把应用会话接到实际执行会话"></a>

#### 示例 · 把应用会话接到实际执行会话

保存调用方与执行方的范围和引用，让页面继续操作时找到正确执行会话。

```json
{
  "workerId": "worker-42",
  "mode": "shared"
}
```

worker-42 是实际执行侧的编号，mode:shared 表示共享模式；完整记录还会核对双方 scope，不能只凭编号访问。

<a id="table-hai-ai-acp-managed-requests"></a>

### `hai_ai_acp_managed_requests`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `<request-key>` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `fingerprint` 用于核对同一请求登记的参数是否一致。 | [业务数据示例](#辨认是不是同一次提交) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

按 `(updated_at, id)` 建索引，供后台按时间翻页。

<a id="辨认是不是同一次提交"></a>

#### 示例 · 辨认是不是同一次提交

保存规范化请求的内容摘要，重试时比较输入，避免同一请求编号被拿来提交不同动作。

```json
{
  "fingerprint": "<request-digest>"
}
```

fingerprint 是请求摘要占位，不是用户文字或模型回复；内容不一致时不能当成原请求继续处理。

<a id="table-hai-ai-acp-managed-approvals"></a>

### `hai_ai_acp_managed_approvals`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `approval-42` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `scope`、`sessionId` 标记归属，`deadline` 是审批期限，`decision` 保存结论。 | [业务数据示例](#哪项操作还在等人批准) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

按 `(updated_at, id)` 建索引，供后台按时间翻页。

<a id="哪项操作还在等人批准"></a>

#### 示例 · 哪项操作还在等人批准

智能体遇到需要授权的操作时，把待批准事项和截止时间保存下来，另一节点也能查询或提交决定。

```json
{
  "sessionId": "acp-session-42",
  "deadline": 1794873660000
}
```

acp-session-42 的审批还没有 decision；deadline 到期后不能继续把它当有效批准，等待本身不等于同意。

<a id="table-hai-ai-acp-managed-grants"></a>

### `hai_ai_acp_managed_grants`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `grant-42` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `id`、`scopeKey`、`summary` 标识授权，`sessionId` 可限制会话，`expires` 和 `revoked` 影响有效性。 | [业务数据示例](#已经允许之后仍可复用的操作范围) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

按 `(updated_at, id)` 建索引，供后台按时间翻页。

<a id="已经允许之后仍可复用的操作范围"></a>

#### 示例 · 已经允许、之后仍可复用的操作范围

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

<a id="table-hai-ai-acp-managed-receipts"></a>

### `hai_ai_acp_managed_receipts`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 这条记录的主键。 | `<execution-key>` |
| `version` | `VARCHAR(36)` | 否 | — | 本次写入的版本，用于检查记录是否被别人改过。 | `6fdb3344-5197-490b-a36d-2d43ce7cc3ba` |
| `data` | `JSON` | 否 | — | `scope` 和 `workerScope` 记录原调用范围和执行范围。 | [业务数据示例](#恢复时核对原来的调用范围) |
| `created_at` | `BIGINT` | 否 | — | 创建时间，Unix 毫秒。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 更新时间，Unix 毫秒。 | `1794873600000` |

按 `(updated_at, id)` 建索引，供后台按时间翻页。

<a id="恢复时核对原来的调用范围"></a>

#### 示例 · 恢复时核对原来的调用范围

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

<a id="table-hai-ai-memory-write-gate"></a>

### `hai_ai_memory_write_gate`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | 否 | — | 固定单行主键，初始化插入。 | `1` |
| `marker` | `INTEGER` | 否 | — | 初始写入 `0`，后续在 `0` 和 `1` 之间切换来锁定该行。 | `0` |

<a id="协调记忆写入"></a>

#### 示例 · 协调记忆写入

各节点在事务中锁定同一行，再提交记忆写入。

```json
{
  "id": 1,
  "marker": 0
}
```

只有 id:1 一行，marker:0 是初始标记；它不保存记忆正文，也不是已处理记忆条数。

<a id="table-hai-ai-memory-vector-namespace-write-gate"></a>

### `hai_ai_memory_vector_namespace_write_gate`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | 否 | — | 固定单行主键，初始化插入。 | `1` |
| `marker` | `INTEGER` | 否 | — | 初始写入 `0`，后续在 `0` 和 `1` 之间切换来锁定该行。 | `0` |

<a id="协调索引归属登记"></a>

#### 示例 · 协调索引归属登记

多个节点首次启动时锁定这一行，确保它们复用同一份集合归属。

```json
{
  "id": 1,
  "marker": 0
}
```

只有 id:1 一行，marker:0 是初始标记；它不保存记忆正文，也不是已处理记忆条数。

<a id="table-hai-ai-memory-vector-scan-write-gate"></a>

### `hai_ai_memory_vector_scan_write_gate`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | 否 | — | 固定单行主键，初始化插入。 | `1` |
| `marker` | `INTEGER` | 否 | — | 初始写入 `0`，后续在 `0` 和 `1` 之间切换来锁定该行。 | `0` |

<a id="协调巡检进度写入"></a>

#### 示例 · 协调巡检进度写入

各节点通过锁定这一行协调巡检游标的写入。

```json
{
  "id": 1,
  "marker": 0
}
```

只有 id:1 一行，marker:0 是初始标记；它不保存记忆正文，也不是已处理记忆条数。

<a id="vector-collections"></a>

## 向量集合

知识向量默认写到 [VecDB](vecdb.md) 的 `hai_ai_knowledge` 集合，搜索只用已发布的文档版本。内置记忆默认使用 `hai_ai_memory`。配置并绑定记忆命名空间后会使用绑定的集合。选用 Mem0 时由 Mem0 管理其向量存储。ACP 执行和事件的表由 [Runner](runner.md) 管理。

AI 不创建 Redis 键。模型连接、工具连接和执行对象只留在本进程，重启后需重建。浏览器连接实时音频时用的票据由 [IAM](iam.md) 管理。
