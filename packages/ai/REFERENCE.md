# @h-ai/ai Reference

本文件提供 `@h-ai/ai` 的详细 API 速查。快速上手请先看 [README.md](./README.md)。

## 初始化与依赖

未初始化 reldb/vecdb 时，`ai.init()` 自动使用进程内临时 Store；两者均已初始化时使用持久化 DB Provider。Memory、Context、Persona、Knowledge 等需要跨进程持久化的生产场景必须使用 DB 或自定义 Provider。

- `ai.tools`：无需 `ai.init()`；无外部依赖。
- `ai.stream`：无需 `ai.init()`；无外部依赖。
- `ai.llm`：需要 `ai.init()`；依赖 OpenAI 兼容 LLM 配置。
- `ai.embedding`：需要 `ai.init()`；依赖 LLM/Embedding 模型配置。
- `ai.memory`：需要 `ai.init()`；依赖 Store，可选 Embedding。
- `ai.retrieval` / `ai.rag`：需要 `ai.init()`；依赖 Embedding + Store。
- `ai.knowledge`：需要 `ai.init()`；依赖 LLM + Embedding + Store + datapipe。
- `ai.context`：需要 `ai.init()`；依赖 LLM + Store，可选 Memory/RAG/Reasoning。
- `ai.audio`：需要 `ai.init()`；依赖 `audio.models` 及对应平台凭据（无需 Store）。
- `ai.a2a`：需要 `ai.init()`；依赖 A2A 配置 + executor。

关闭必须使用 `await ai.close()`，这样才能确定释放自定义 `AIStoreProvider.close()`。

## LLM

- `chat(options)`：非流式 Chat Completion。
- `chatStream(options)`：流式 Chat Completion。
- `ask(query, options?)`：返回纯文本的简易问答。
- `askStream(query, options?)`：流式纯文本问答。
- `generateObject({ schema, messages, model?, systemPrompt?, maxRepairs?, signal? })`：结构化输出。按 Zod schema 约束模型输出（json_schema response_format），解析/校验失败时自动带错误提示重试（默 1 次），多次仍失败返回 `INVALID_REQUEST`。
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
- `ai.tools.createRegistry({ authorize? })`：Registry 级授权在 Zod 校验后、handler 前执行
- `registry.register(tool)` / `registry.registerMany(tools)`：返回 `HaiResult<void>`，默认拒绝同名和隐式覆盖
- `registry.replace(tool)`：仅用于显式替换已存在工具
- `registry.unregister(name)`
- `registry.getDefinitions()`
- `registry.execute(toolCall, { signal, objectId, sessionId, deadline?, timeoutMs?, authorize? })` / `registry.executeAll(toolCalls, { parallel?, ...ctx })`；默认串行，只有显式 `parallel: true` 才并行；Registry 与单次授权必须全部通过；handler `(input, ctx)` 可响应取消/超时（默认 30s）

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

- `extract(messages, options?)`：从对话提取记忆并存储；`options.signal` 可取消事实抽取及 native 对账调用。
- `add(entry)`：手动添加记忆。
- `get(memoryId, accessScope?)` / `update(memoryId, updates, accessScope?)`：读取/更新。
- `recall(query, options?)`：检索相关记忆。
- `injectMemories(messages, options?)`：注入 system 记忆上下文。
- `remove(memoryId, accessScope?)` / `clear(options?)`：删除。
- `list(options?)` / `listPage(options?)`：列表/分页。

推荐所有记忆操作带 `objectId`，避免不同用户或 Agent 混写。按 ID 读写单条记忆（get/update/remove）处理不可信 memoryId 时，必须传 `accessScope: { objectId, scope? }`；归属不匹配统一返回 `MEMORY_NOT_FOUND`（避免通过错误差异枚举/越权访问其他主体的记忆）。

Memory 后端通过 `memory.provider` 选择：

- `native`（默认）：HAI 原生引擎，复用 vecdb/reldb/LLM/Embedding。`extract` 采用 Mem0 式批量合并（ADD/UPDATE/DELETE/NONE + `category`）；`maxEntriesPerObject`（单主体配额）/`maxEntriesGlobal`（全局上限）/`recencyDecay`/`embeddingEnabled`/`writebackRelatedTopK` 作用于此后端；淘汰按 `objectId` 分区。
- `mem0`：直接使用 `mem0ai/oss` 的 `Memory` 引擎（嵌入式）。LLM/Embedder 从 `llm` 配置提取（OpenAI 兼容，场景模型 `extraction` / `embedding`）；向量库从底层 vecdb 后端提取（`storeProvider.getVectorBackend()`），qdrant/pgvector 复用同一后端；无法映射 lancedb/chroma 等后端时**默认 fail-fast**（除非 `memory.allowEphemeralFallback: true` 才退回 mem0 in-memory）；历史默认禁用。
- 两者对外 API（extract/recall/injectMemories/add/update/get/remove/list/listPage/clear）完全一致；`objectId` 隔离不同主体的记忆，`scope`（key-value）用于业务作用域隔离（recall/list/listPage/clear 均严格过滤）。mem0 后端 `extract` 在框架层分类打分后以 `infer:false` 写入（保留 `hai_type`/`hai_importance`），`recall` 支持 `types`/`recencyWeight`，与 native 一致；mem0 后端 `update` 涉及 type/importance/metadata 时会重建记忆并重新分配 `id`。

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

真实对话状态：`turnCommit: 'manual'` 时 `chat` / `chatStream` 不自动写入生成文本，返回 `turnId`，由 `commitTurn` / `interruptTurn` 提交真实内容。`chatStream` 事件序列 `turn_started → delta* → done`，中途 `AbortSignal` 取消为 `turn_started → delta* → cancelled`；若轮次在流完成前已被 `interruptTurn` 打断进入终态，则**不再产出 `done`**（避免误判为正常完成）。

## File / Rerank / Reasoning

- `ai.file.parse({ content, filename, options })`：text/html/pdf/docx/ocr 解析。
- `ai.file.parseText(content, filename?)`：直接返回文本。
- `ai.rerank.rerank(request)` / `rerankTexts(query, texts, topN?)`：相关性重排。
- `ai.reasoning.run(query, options?)` / `runStream(query, options?)`：`react`、`cot`、`plan-execute`。

## Audio

- `transcribe(request)`：完整音频 → `HaiResult<{ text }>`。
- `transcribeStream(request)`：完整音频或 `AudioInputStream` → `AsyncIterable<TranscriptionEvent>`。事件为 `speech_started` / `{ type: 'transcript', text, final }` / `speech_stopped`（支持服务端 VAD 的平台产出语音起止事件，可据此即时反应）。
- `synthesize(request)`：完整文本 → `HaiResult<AudioContent>`。
- `synthesizeStream(request)`：`SynthesisTextSegment` 或 `AsyncIterable<SynthesisTextSegment>` → `AsyncIterable<SynthesisEvent>`；每段严格产出 `segment_started → audio* → segment_done`，音频事件携带 `segmentId`。`segment_started` 额外携带服务端解析 Provider 后的真实输出参数 `format` / `sampleRate?` / `channels?`，调用方据此正确解码，不按请求参数猜测。
- `getCapabilities({ operation, model? })`：按操作查询默认或指定模型，只返回 `transcribe` / `synthesize` 对应能力分支；模型操作不匹配时在厂商调用前返回 `AUDIO_UNSUPPORTED_INPUT`。

请求可选字段：识别 `contextHints?: string[]`（热词/提示，按平台能力映射）；合成 `instruction?: string`（自然语言风格指令）。配置 `audio.models: [{ id, provider, model, operations: ['transcribe'] | ['synthesize'] | ['transcribe','synthesize'], ...credentials }]` + `transcribeModel` / `synthesizeModel`；`maxAudioBytes`（默 10 MiB）/`maxStreamDurationMs`（默 5 分钟，流式连接硬上限）。

错误语义：`AbortSignal` 取消 → `AUDIO_CANCELLED`（超时 → `AUDIO_TIMEOUT`），连接失败或 `end` 前异常断连 → `AUDIO_CONNECTION_FAILED`，厂商错误 → `AUDIO_UPSTREAM_ERROR`。平台不支持的输入方式 → `AUDIO_UNSUPPORTED_INPUT`（不伪装实时）。浏览器客户端严格区分正常结束、取消与异常断连：取消抛 `AUDIO_CANCELLED`、`end` 前断连抛 `AUDIO_CONNECTION_FAILED`、服务端 error 帧保留其领域错误码，`synthesize` 不返回未完成的部分音频。Provider 为内部实现，不从根入口导出。

## A2A

- `registerExecutor(executor)`：注册 Agent executor。
- `getAgentCard()`：获取 Agent Card。
- `handleRequest(body, context?)`：处理 A2A JSON-RPC 请求。
- `listMessages(filter)`：查询 A2A 消息记录。
- `callRemoteAgent(remoteUrl, message, options?)`：调用远端 Agent；只依赖 `ai.init()`，不要求本地 executor。

## 错误码速查

- `hai:ai:000`：`INTERNAL_ERROR`。
- `hai:ai:010-012`：初始化，含 `NOT_INITIALIZED` / `CONFIGURATION_ERROR` / `INIT_IN_PROGRESS`。
- `hai:ai:020-033`：Rerank / File。
- `hai:ai:050-059`：Audio（`AUDIO_INVALID_REQUEST` / `MODEL_NOT_FOUND` / `PROVIDER_NOT_FOUND` / `UNSUPPORTED_INPUT` / `UPSTREAM_ERROR` / `PROTOCOL_ERROR` / `CONNECTION_FAILED` / `TIMEOUT` / `INPUT_TOO_LARGE` / `CANCELLED`）。
- `hai:ai:100-107`：LLM / 历史记录。
- `hai:ai:200-204`：MCP。
- `hai:ai:300-302`：Embedding。
- `hai:ai:400-405`：Tool（含重复注册与授权拒绝）。
- `hai:ai:500-502`：Reasoning。
- `hai:ai:600-701`：Retrieval / RAG。
- `hai:ai:800-805`：Knowledge。
- `hai:ai:900-905`：Memory。
- `hai:ai:950-971`：Context / Store / Session。
- `hai:ai:980-984`：A2A。

## 浏览器端

浏览器端通过 `@h-ai/api-client` 或自定义 endpoint 访问服务端 AI 能力。`ai.stream` 可在浏览器直接用于解析服务端流式 chunk。

```ts
const response = await apiClient.ai.chats.createCompletion({ messages })
const memories = await apiClient.ai.memories.recall({ query: '偏好', objectId: 'user-001', topK: 5 })
```
