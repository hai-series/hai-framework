# @h-ai/ai Reference

本文件提供 `@h-ai/ai` 的详细 API 速查。快速上手请先看 [README.md](./README.md)。

## 初始化与依赖

- `ai.tools`：无需 `ai.init()`；无外部依赖。
- `ai.stream`：无需 `ai.init()`；无外部依赖。
- `ai.llm`：需要 `ai.init()`；依赖 OpenAI 兼容 LLM 配置。
- `ai.embedding`：需要 `ai.init()`；依赖 LLM/Embedding 模型配置。
- `ai.memory`：需要 `ai.init()`；依赖 Store，可选 Embedding。
- `ai.retrieval` / `ai.rag`：需要 `ai.init()`；依赖 Embedding + Store。
- `ai.knowledge`：需要 `ai.init()`；依赖 LLM + Embedding + Store + datapipe。
- `ai.context`：需要 `ai.init()`；依赖 LLM + Store，可选 Memory/RAG/Reasoning。
- `ai.a2a`：需要 `ai.init()`；依赖 A2A 配置 + executor。

关闭必须使用 `await ai.close()`，这样才能确定释放自定义 `AIStoreProvider.close()`。

## LLM

- `chat(options)`：非流式 Chat Completion。
- `chatStream(options)`：流式 Chat Completion。
- `ask(query, options?)`：返回纯文本的简易问答。
- `askStream(query, options?)`：流式纯文本问答。
- `listModels()`：查询可用模型。
- `getHistory(scope, options?)`：查询会话历史。
- `listSessions(objectId)`：查询主体会话。

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
- `registry.getDefinitions()`
- `registry.execute(toolCall)` / `registry.executeAll(toolCalls, { parallel })`

工具 handler 输入由 Zod schema 约束，外部输入不要绕过 schema。

## MCP

独立服务器：`createMcpServer({ name, version })`，配合 `StreamableHTTPServerTransport`、`SSEServerTransport` 或 `StdioServerTransport`。

`ai.mcp` 方法：`registerTool`、`callTool`、`registerResource`、`readResource`、`registerPrompt`、`getPrompt`。

## Embedding

Embedding OpenAI 客户端按 `apiKey + baseURL + timeout` 缓存；同一 key 指向不同网关时不会复用错误客户端。

- `embed(request)`：支持单条/批量输入。
- `embedText(text)`：返回单条向量。
- `embedBatch(texts)`：返回向量数组。

## Memory

- `extract(messages, options?)`：从对话提取记忆并存储。
- `add(entry)`：手动添加记忆。
- `get(memoryId)` / `update(memoryId, updates)`：读取/更新。
- `recall(query, options?)`：检索相关记忆。
- `injectMemories(messages, options?)`：注入 system 记忆上下文。
- `remove(memoryId)` / `clear(options?)`：删除。
- `list(options?)` / `listPage(options?)`：列表/分页。

推荐所有记忆操作带 `objectId`，避免不同用户或 Agent 混写。

Memory 后端通过 `memory.provider` 选择：

- `native`（默认）：HAI 原生引擎，复用 vecdb/reldb/LLM/Embedding。`extract` 采用 Mem0 式批量合并（ADD/UPDATE/DELETE/NONE + `category`）；`maxEntries`/`recencyDecay`/`embeddingEnabled`/`writebackRelatedTopK` 作用于此后端。
- `mem0`：直接使用 `mem0ai/oss` 的 `Memory` 引擎（嵌入式）。LLM/Embedder 从 `llm` 配置提取（OpenAI 兼容，场景模型 `extraction` / `embedding`）；向量库从底层 vecdb 后端提取（`storeProvider.getVectorBackend()`），qdrant/pgvector 复用同一后端，lancedb/chroma 退回 mem0 自带 in-memory 存储；历史默认禁用。
- 两者对外 API（extract/recall/injectMemories/add/update/get/remove/list/listPage/clear）完全一致；`objectId` 隔离不同主体的记忆。

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

- `setup(options?)`：初始化 collection / 表 / 索引。
- `ingest(input)`：文档入库。
- `ingestFile(input)`：从文件导入（Node.js）。
- `ingestBatch(inputs, onProgress?)`：批量导入。
- `retrieve(query, options?)`：实体增强检索。
- `ask(query, options?)`：知识库问答。
- `findByEntity(entityName, options?)`：实体关联文档。
- `listEntities(options?)` / `listDocuments(options?)`：列表。
- `removeDocument(documentId, options?)`：删除文档和关联。

入库链路：parse/clean → chunk → embedding → vecdb upsert → reldb metadata/entity index。

## Context

`ai.context.createManager(options)` 返回有状态管理器，适合多轮对话。

常用选项：

- `scope: { objectId, sessionId }`
- `systemPrompt`
- `compress: { auto, strategy, maxTokens, preserveLastN }`
- `memory: { enable, enableExtract, topK }`
- `rag: { enable, sources, topK, minScore }`
- `tools`

常用方法：`addMessage`、`getMessages`、`getTokenUsage`、`chat`、`chatStream`、`save`、`reset`。

## File / Rerank / Reasoning

- `ai.file.parse({ content, filename, options })`：text/html/pdf/docx/ocr 解析。
- `ai.file.parseText(content, filename?)`：直接返回文本。
- `ai.rerank.rerank(request)` / `rerankTexts(query, texts, topN?)`：相关性重排。
- `ai.reasoning.run(query, options?)` / `runStream(query, options?)`：`react`、`cot`、`plan-execute`。

## A2A

- `registerExecutor(executor)`：注册 Agent executor。
- `getAgentCard()`：获取 Agent Card。
- `handleRequest(body, context?)`：处理 A2A JSON-RPC 请求。
- `listMessages(filter)`：查询 A2A 消息记录。
- `callRemoteAgent(remoteUrl, message, options?)`：调用远端 Agent。

## 错误码速查

- `hai:ai:000`：`INTERNAL_ERROR`。
- `hai:ai:010-012`：初始化，含 `NOT_INITIALIZED` / `CONFIGURATION_ERROR` / `INIT_IN_PROGRESS`。
- `hai:ai:020-033`：Rerank / File。
- `hai:ai:100-107`：LLM / 历史记录。
- `hai:ai:200-204`：MCP。
- `hai:ai:300-302`：Embedding。
- `hai:ai:400-403`：Tool。
- `hai:ai:500-502`：Reasoning。
- `hai:ai:600-701`：Retrieval / RAG。
- `hai:ai:800-805`：Knowledge。
- `hai:ai:900-904`：Memory。
- `hai:ai:950-971`：Context / Store / Session。
- `hai:ai:980-984`：A2A。

## 浏览器端

浏览器端通过 `@h-ai/api-client` 或自定义 endpoint 访问服务端 AI 能力。`ai.stream` 可在浏览器直接用于解析服务端流式 chunk。

```ts
const response = await apiClient.ai.chats.createCompletion({ messages })
const memories = await apiClient.ai.memories.recall({ query: '偏好', objectId: 'user-001', topK: 5 })
```
