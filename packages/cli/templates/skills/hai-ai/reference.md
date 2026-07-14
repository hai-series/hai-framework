# @h-ai/ai reference

本文件承载 `SKILL.md` 中不常用但仍需要保留的 API 参考。优先读取 `SKILL.md`；只有当任务需要完整方法清单、错误码或长示例时再读取本文件。

## 初始化与依赖

| 能力 | 是否需要 `ai.init()` | 依赖 |
| --- | --- | --- |
| `ai.tools` | 否 | 无 |
| `ai.stream` | 否 | 无 |
| `ai.llm` | 是 | OpenAI 兼容 LLM 配置 |
| `ai.embedding` | 是 | LLM/Embedding 模型配置 |
| `ai.memory` | 是 | Store + 可选 Embedding |
| `ai.retrieval` / `ai.rag` | 是 | Embedding + Store |
| `ai.knowledge` | 是 | LLM + Embedding + Store + datapipe |
| `ai.context` | 是 | LLM + Store + 可选 Memory/RAG/Reasoning |
| `ai.a2a` | 是 | A2A 配置 + executor |

关闭必须使用 `await ai.close()`，这样才能确定释放自定义 `AIStoreProvider.close()`。

## LLM

| 方法 | 说明 |
| --- | --- |
| `chat(options)` | 非流式 Chat Completion |
| `chatStream(options)` | 流式 Chat Completion |
| `ask(query, options?)` | 返回纯文本的简易问答 |
| `askStream(query, options?)` | 流式纯文本问答 |
| `listModels()` | 查询可用模型 |
| `getHistory(scope, options?)` | 查询会话历史 |
| `listSessions(objectId)` | 查询主体会话 |

```ts
const result = await ai.llm.chat({
  model: 'fast',
  messages: [
    { role: 'system', content: '你是一个翻译助手' },
    { role: 'user', content: '你好世界' },
  ],
})
if (result.success) {
  const reply = result.data.choices[0]?.message.content ?? ''
}
```

## Tools

- `ai.tools.define({ name, description, parameters, handler })`
- `ai.tools.createRegistry()`
- `registry.register(tool)` / `registry.unregister(name)`
- `registry.getDefinitions()`：传给 LLM 的工具定义
- `registry.execute(toolCall)` / `registry.executeAll(toolCalls, { parallel })`

工具 handler 输入由 Zod schema 约束，外部输入不要绕过 schema。

## MCP

### 独立服务器

```ts
const mcp = createMcpServer({ name: 'my-server', version: '1.0.0' })
mcp.registerResource('config', 'config://app', { description: '应用配置' }, async uri => ({
  contents: [{ uri: uri.href, text: '{}' }],
}))
await mcp.connect(new StdioServerTransport())
```

### `ai.mcp`

| 方法 | 说明 |
| --- | --- |
| `registerTool(definition, handler)` | 注册内置工具 |
| `callTool(name, args, context?)` | 调用工具 |
| `registerResource(resource, handler)` | 注册资源 |
| `readResource(uri)` | 读取资源 |
| `registerPrompt(prompt, handler)` | 注册提示词 |
| `getPrompt(name, args)` | 生成提示词消息 |

## Embedding

Embedding OpenAI 客户端按 `apiKey + baseURL + timeout` 缓存；同一 key 指向不同网关时不会复用错误客户端。

| 方法 | 说明 |
| --- | --- |
| `embed(request)` | 支持单条/批量输入 |
| `embedText(text)` | 返回单条向量 |
| `embedBatch(texts)` | 返回向量数组 |

## Memory

| 方法 | 说明 |
| --- | --- |
| `extract(messages, options?)` | 从对话提取记忆并存储 |
| `add(entry)` | 手动添加记忆 |
| `get(memoryId, accessScope?)` / `update(memoryId, updates, accessScope?)` | 读取/更新（传 `accessScope: { objectId, scope? }` 做归属校验，不匹配→ `MEMORY_NOT_FOUND`） |
| `recall(query, options?)` | 检索相关记忆 |
| `injectMemories(messages, options?)` | 注入 system 记忆上下文 |
| `remove(memoryId, accessScope?)` / `clear(options?)` | 删除（`accessScope` 同上） |
| `list(options?)` / `listPage(options?)` | 列表/分页 |

推荐所有记忆操作带 `objectId`，避免不同用户或 Agent 混写。

Memory 后端通过 `memory.provider` 选择：

- `native`（默认）：HAI 原生引擎，复用 vecdb/reldb/LLM/Embedding。`extract` 采用 Mem0 式批量合并（ADD/UPDATE/DELETE/NONE + `category`）；`maxEntriesPerObject`（单主体配额）/`maxEntriesGlobal`（全局上限）/`recencyDecay`/`embeddingEnabled`/`writebackRelatedTopK` 作用于此后端；淘汰按 `objectId` 分区。
- `mem0`：直接使用 `mem0ai/oss` 的 `Memory` 引擎（嵌入式）。LLM/Embedder 从 `llm` 配置提取（OpenAI 兼容，场景模型 `extraction` / `embedding`）；向量库从底层 vecdb 后端提取（`storeProvider.getVectorBackend()`），qdrant/pgvector 复用同一后端，lancedb/chroma 退回 mem0 自带 in-memory 存储；历史默认禁用。
- 两者对外 API（extract/recall/injectMemories/add/update/get/remove/list/listPage/clear）完全一致；`objectId` 隔离不同主体的记忆，`scope`（key-value）用于业务作用域隔离（recall/list/listPage/clear 均严格过滤）。mem0 后端 `update` 涉及 type/importance/metadata 时会重建记忆并重新分配 `id`。

## Retrieval / RAG

```ts
await ai.retrieval.addSource({
  id: 'docs',
  name: '产品文档',
  collection: 'doc_vectors',
  topK: 5,
  minScore: 0.7,
})

const result = await ai.rag.query('核心架构是什么？', {
  sources: ['docs'],
  topK: 5,
})
```

`retrieve` 会并发检索目标 source 并按 score 合并排序；无 source 时返回 `RETRIEVAL_SOURCE_NOT_FOUND`。

## Knowledge

| 方法 | 说明 |
| --- | --- |
| `setup(options?)` | 初始化 collection / 表 / 索引 |
| `ingest(input)` | 文档入库 |
| `ingestFile(input)` | 从文件导入（Node.js） |
| `ingestBatch(inputs, onProgress?)` | 批量导入 |
| `retrieve(query, options?)` | 实体增强检索 |
| `ask(query, options?)` | 知识库问答 |
| `findByEntity(entityName, options?)` | 实体关联文档 |
| `listEntities(options?)` / `listDocuments(options?)` | 列表 |
| `removeDocument(documentId, options?)` | 删除文档和关联 |

入库链路：parse/clean → chunk → embedding → vecdb upsert → reldb metadata/entity index。

## Context

`ai.context.createManager(options)` 返回有状态管理器，适合多轮对话。

常用选项：

- `scope: { objectId, sessionId }`
- `systemPrompt`
- `compress: { auto, strategy, maxTokens, preserveLastN }`
- `memory: { enable, enableExtract, scope, types, minImportance, topK, position, extractionModel, extractionSystemPrompt }`（scope/types 等完整透传给 Memory 的 recall/extract）
- `rag: { enable, sources, topK, minScore }`
- `tools`

常用方法：`addMessage`、`getMessages`、`getTokenUsage`、`chat`、`chatStream`、`save`、`reset`、`flush`（等待后台记忆提取完成，`save` 前自动调用）、`pendingMemoryTasks`（挂起提取任务数）。`chat/chatStream` 支持 `signal` 取消。

## File / Rerank / Reasoning

- `ai.file.parse({ content, filename, options })`：text/html/pdf/docx/ocr 解析。
- `ai.file.parseText(content, filename?)`：直接返回文本。
- `ai.rerank.rerank(request)` / `rerankTexts(query, texts, topN?)`：相关性重排。
- `ai.reasoning.run(query, options?)` / `runStream(query, options?)`：`react`、`cot`、`plan-execute`。

## Audio

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `transcribe(request)` | `Promise<HaiResult<TranscriptionResult>>` | 完整音频 → 完整文本 |
| `transcribeStream(request)` | `AsyncIterable<TranscriptionEvent>` | 完整或持续音频 → 识别/VAD 领域事件 |
| `synthesize(request)` | `Promise<HaiResult<SynthesisResult>>` | 完整文本 → 完整音频 |
| `synthesizeStream(request)` | `AsyncIterable<SynthesisEvent>` | 带 ID 文本段 → `segment_started → audio* → segment_done` |
| `getCapabilities({ operation, model? })` | `HaiResult<AudioModelCapabilities>` | 按操作查询能力，并拒绝操作不匹配模型 |

- 模型配置必须包含 `operations: ['transcribe'] | ['synthesize'] | ['transcribe','synthesize']`。
- 浏览器端使用 `audio: { url, getTicket }`；ticket 由已登录 HTTP 请求签发且一次性消费，IAM access token 不进入 WebSocket URL。

## A2A

| 方法 | 说明 |
| --- | --- |
| `registerExecutor(executor)` | 注册 Agent executor |
| `getAgentCard()` | 获取 Agent Card |
| `handleRequest(body, context?)` | 处理 A2A JSON-RPC 请求 |
| `listMessages(filter)` | 查询 A2A 消息记录 |
| `callRemoteAgent(remoteUrl, message, options?)` | 调用远端 Agent；只依赖 `ai.init()`，不要求本地 executor |

A2A 服务端 SDK handler 在注册 executor 时延迟创建；远端客户端调用不依赖服务端配置。

`callRemoteAgent` 只接受 HTTP(S) 且拒绝 URL 内嵌凭据。该校验不是完整 SSRF 防护：remote URL 若来自外部输入，应用必须先按 origin 白名单过滤，并通过出口代理限制 DNS 重绑定、重定向到私网与云元数据地址。

## 错误码速查

| 分段 | 代表错误 |
| --- | --- |
| `hai:ai:000` | `INTERNAL_ERROR` |
| `hai:ai:010-012` | 初始化：`NOT_INITIALIZED` / `CONFIGURATION_ERROR` / `INIT_IN_PROGRESS` |
| `hai:ai:020-033` | Rerank / File |
| `hai:ai:050-059` | Audio：`AUDIO_INVALID_REQUEST` / `MODEL_NOT_FOUND` / `PROVIDER_NOT_FOUND` / `UNSUPPORTED_INPUT` / `UPSTREAM_ERROR` / `PROTOCOL_ERROR` / `CONNECTION_FAILED` / `TIMEOUT` / `INPUT_TOO_LARGE` / `CANCELLED` |
| `hai:ai:100-107` | LLM / 历史记录 |
| `hai:ai:200-204` | MCP |
| `hai:ai:300-302` | Embedding |
| `hai:ai:400-403` | Tool |
| `hai:ai:500-502` | Reasoning |
| `hai:ai:600-701` | Retrieval / RAG |
| `hai:ai:800-805` | Knowledge |
| `hai:ai:900-905` | Memory |
| `hai:ai:950-971` | Context / Store / Session |
| `hai:ai:980-984` | A2A |

## 浏览器端

浏览器端通过 `@h-ai/api-client` 或自定义 endpoint 访问服务端 AI 能力。`ai.stream` 可在浏览器直接用于解析服务端流式 chunk。

```ts
const response = await apiClient.ai.chats.createCompletion({ messages })
const memories = await apiClient.ai.memories.recall({ query: '偏好', objectId: 'user-001', topK: 5 })
```
