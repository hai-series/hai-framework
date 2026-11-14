# @h-ai/ai

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/api-contract](../api-contract/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/datapipe](../datapipe/README.md) · [@h-ai/reldb](../reldb/README.md) · [@h-ai/vecdb](../vecdb/README.md)

AI 能力模块，提供统一的 `ai` 服务对象，覆盖 LLM 对话、文生图、工具调用、MCP、Embedding、记忆、检索/RAG、知识库、上下文管理、文件解析、Rerank、语音（ASR/TTS）与 A2A。Node.js 侧通过 `ai.init()` 初始化，浏览器侧通过 API/client 代理访问。

## 快速开始

`ai.close()` 等待已开始的初始化完成并清理，合并并发关闭；重初始化先清理旧实例，关闭期间不接受新初始化。

### 开发 LLM-only（零数据库依赖）

```ts
import { ai } from '@h-ai/ai'

const init = await ai.init({
  llm: {
    model: 'gpt-4o-mini',
    apiKey: process.env.HAI_AI_LLM_APIKEY,
  },
})
if (!init.success)
  throw new Error(init.error.message)

try {
  const result = await ai.llm.chat({
    messages: [
      { role: 'user', content: '你好！' }
    ],
  })
  if (!result.success)
    throw new Error(result.error.message)
  const reply = result.data.choices[0]?.message.content ?? ''
}
finally {
  await ai.close()
}
```

开发/显式测试未初始化 reldb/vecdb 时，AI 使用进程内临时 Store；关闭、退出或切换实例后不保留。`NODE_ENV` 或 `HAI_CORE_ENV` 为 production 时，临时 Store、SQLite 或本地向量后端会使初始化失败。生产必须先初始化共享 RelDB 与网络 vecdb，或传入满足同等原子契约的共享 Provider。

## 功能

### 用途、输入与输出

除标明“direct”、AsyncIterable 或 Promise 直接结果的项目外，输出列均指 HaiResult 成功后的 data；先检查 success。表中 request/definition/options 等变量必须按该行真实输入类型在应用提供，不能把类型名当成运行时值。流和显式工具可能抛错，应在消费边界处理。

下表的调用片段复用本页已初始化的服务；命名变量代表应用已提供的请求、Schema、资源定义或配置。完整步骤和失败处理见对应功能示例。`HaiResult` 先判断 `success`，异步项按签名 `await`。

| 入口                              | 场景                    | 输入                                                                              | 输出                                                                      | 调用片段                                                                                  |
| --------------------------------- | ----------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `ai.llm.chat`                     | 单次回答                | `ChatCompletionRequest: messages, model?, signal?, tools?`                        | `ChatCompletionResponse: choices, model, usage?`                          | `ai.llm.chat({ messages: [{ role: "user", content: "你好" }] })`                          |
| `ai.llm.chatStream`               | 逐块回答                | `same ChatCompletionRequest`                                                      | `AsyncIterable<ChatCompletionChunk>; iteration may throw`                 | `ai.llm.chatStream({ messages })`                                                         |
| `ai.llm.ask`                      | 纯文本问答              | `question: string, AskOptions?`                                                   | `string answer`                                                           | `ai.llm.ask("解释共享状态")`                                                              |
| `ai.llm.askStream`                | 纯文本流                | `question: string, AskOptions?`                                                   | `AsyncIterable<string>`                                                   | `ai.llm.askStream("解释共享状态")`                                                        |
| `ai.llm.generateObject`           | 受 Schema 约束的答案    | `Zod schema, messages, model?, responseFormat?, maxRepairs?, signal?`             | `schema-inferred T`                                                       | `ai.llm.generateObject({ schema: AnswerSchema, messages })`                               |
| `ai.llm.listModels`               | 查询模型                | `none`                                                                            | `string[] model IDs`                                                      | `ai.llm.listModels()`                                                                     |
| `ai.llm.getHistory`               | 读取对话历史            | `{ objectId, sessionId }, { limit?, order? }?`                                    | `ChatRecord[]`                                                            | `ai.llm.getHistory({ objectId: "u1", sessionId: "s1" })`                                  |
| `ai.llm.listSessions`             | 列出主体会话            | `objectId: string`                                                                | `SessionInfo[]`                                                           | `ai.llm.listSessions("u1")`                                                               |
| `ai.tools.define`                 | 定义可授权工具          | `{ name, description, parameters: Zod schema, handler, timeoutMs? }`              | `direct Tool<TInput,TOutput>; no init required`                           | `ai.tools.define(toolDefinition)`                                                         |
| `ai.tools.createRegistry`         | 管理工具集合            | `{ authorize? }?`                                                                 | `direct ToolRegistryOperations; no init required`                         | `ai.tools.createRegistry({ authorize })`                                                  |
| `ai.stream.createProcessor`       | 积累增量文本            | `none`                                                                            | `direct StreamProcessor`                                                  | `ai.stream.createProcessor()`                                                             |
| `ai.stream.collect`               | 完整消费聊天流          | `AsyncIterable<ChatCompletionChunk>`                                              | `Promise<StreamResult>; stream failure rejects`                           | `ai.stream.collect(ai.llm.chatStream({ messages }))`                                      |
| `ai.stream.createSSEDecoder`      | 跨片段解码 SSE          | `none`                                                                            | `direct SSEDecoder with decode/reset`                                     | `ai.stream.createSSEDecoder()`                                                            |
| `ai.stream.encodeSSE`             | 编码事件流              | `SSEEvent: data, event?, id?, retry?`                                             | `direct string; invalid metadata throws`                                  | `ai.stream.encodeSSE({ data: "Hello" })`                                                  |
| `ai.embedding.embed`              | 通用向量请求            | `EmbeddingRequest with input/model?`                                              | `EmbeddingResponse`                                                       | `ai.embedding.embed({ input: "产品说明" })`                                               |
| `ai.embedding.embedText`          | 单段向量                | `text: string`                                                                    | `number[]`                                                                | `ai.embedding.embedText("产品说明")`                                                      |
| `ai.embedding.embedBatch`         | 批量向量                | `texts: string[]`                                                                 | `number[][] in input order`                                               | `ai.embedding.embedBatch(["简介", "部署"])`                                               |
| `ai.mcp.registerTool`             | 注册本进程工具          | `MCPToolDefinition, typed handler`                                                | `void`                                                                    | `ai.mcp.registerTool(mcpToolDefinition, toolHandler)`                                     |
| `ai.mcp.registerResource`         | 注册资源                | `MCPResource, async content handler`                                              | `void`                                                                    | `ai.mcp.registerResource(resourceDefinition, readContent)`                                |
| `ai.mcp.registerPrompt`           | 注册提示词              | `MCPPrompt, args => Promise<MCPPromptMessage[]>`                                  | `void`                                                                    | `ai.mcp.registerPrompt(promptDefinition, buildMessages)`                                  |
| `ai.mcp.callTool`                 | 调用已注册工具          | `name, arguments, MCPContext?`                                                    | `unknown tool result`                                                     | `ai.mcp.callTool("search", { query: "配置" })`                                            |
| `ai.mcp.readResource`             | 读取资源                | `resource URI`                                                                    | `MCPResourceContent with exactly text or blob`                            | `ai.mcp.readResource("docs://intro")`                                                     |
| `ai.mcp.getPrompt`                | 构建提示词              | `name, Record<string,string> arguments`                                           | `MCPPromptMessage[]`                                                      | `ai.mcp.getPrompt("review", { topic: "API" })`                                            |
| `ai.mcp.services.invoke`          | 调用授权的远程工具      | 请求、认证主体和授权函数                                                          | `HaiResult<CallToolResult>`                                               | `ai.mcp.services.invoke(request, authorization)`                                          |
| `ai.mcp.services.createBroker`    | 为 ACP 会话挂载工具入口 | 固定 URL 和实时授权函数                                                           | `HaiResult<MCPServiceBroker>`                                             | `ai.mcp.services.createBroker(brokerOptions)`                                             |
| `ai.retrieval.addSource`          | 登记检索源              | `RetrievalSource: id, collection, optional metadata`                              | `void`                                                                    | `ai.retrieval.addSource({ id: "docs", collection: "manual" })`                            |
| `ai.retrieval.removeSource`       | 撤销检索源              | `sourceId: string`                                                                | `void`                                                                    | `ai.retrieval.removeSource("docs")`                                                       |
| `ai.retrieval.listSources`        | 列出可用检索源          | `none`                                                                            | `direct Promise<RetrievalSource[]>`                                       | `ai.retrieval.listSources()`                                                              |
| `ai.retrieval.retrieve`           | 向量检索                | `RetrievalRequest: query, sources?, topK?, minScore?, enableRerank?`              | `RetrievalResult`                                                         | `ai.retrieval.retrieve({ query: "部署" })`                                                |
| `ai.rag.query`                    | 带引用回答              | `query: string, RagOptions?`                                                      | `RagResult: answer, context, citations, query, model`                     | `ai.rag.query("如何部署？", { sources: ["docs"] })`                                       |
| `ai.rag.queryStream`              | 带引用流式回答          | `query: string, RagOptions?`                                                      | `AsyncIterable<RagStreamEvent>`                                           | `ai.rag.queryStream("如何部署？", { sources: ["docs"] })`                                 |
| `ai.knowledge.setup`              | 准备集合                | `KnowledgeSetupOptions?`                                                          | `void; collection ready for ingest`                                       | `ai.knowledge.setup()`                                                                    |
| `ai.knowledge.ingest`             | 发布文本资料            | `{ documentId, content, title?, collection?, ...metadata }`                       | `KnowledgeIngestResult with revision/cleanupPending`                      | `ai.knowledge.ingest({ documentId: "intro", content: "入门正文" })`                       |
| `ai.knowledge.ingestFile`         | 导入文件                | `KnowledgeIngestFileInput including file bytes and document identity`             | `KnowledgeIngestResult`                                                   | `ai.knowledge.ingestFile(fileInput)`                                                      |
| `ai.knowledge.ingestBatch`        | 批量导入                | `KnowledgeIngestInput[], onProgress?`                                             | `KnowledgeIngestBatchResult with per-document outcomes`                   | `ai.knowledge.ingestBatch(documentInputs, onProgress)`                                    |
| `ai.knowledge.retrieve`           | 检索发布版本            | `query: string, KnowledgeRetrieveOptions?`                                        | `KnowledgeRetrieveResult`                                                 | `ai.knowledge.retrieve("部署说明")`                                                       |
| `ai.knowledge.ask`                | 基于知识回答            | `query: string, KnowledgeAskOptions?`                                             | `KnowledgeAskResult`                                                      | `ai.knowledge.ask("如何恢复备份？")`                                                      |
| `ai.knowledge.findByEntity`       | 按实体找资料            | `entityName: string, EntityQueryOptions?`                                         | `EntityDocumentResult[]`                                                  | `ai.knowledge.findByEntity("订单")`                                                       |
| `ai.knowledge.listEntities`       | 实体清单                | `EntityListOptions?`                                                              | `KnowledgeEntity[]`                                                       | `ai.knowledge.listEntities()`                                                             |
| `ai.knowledge.listDocuments`      | 文档清单                | `KnowledgeDocumentListOptions?`                                                   | `KnowledgeDocumentInfo[]`                                                 | `ai.knowledge.listDocuments()`                                                            |
| `ai.knowledge.removeDocument`     | 撤销文档                | `documentId, KnowledgeDocumentRemoveOptions?`                                     | `void; may fail after visibility revocation if cleanup fails`             | `ai.knowledge.removeDocument("intro")`                                                    |
| `ai.knowledge.repair`             | 补偿残留向量            | `{ collection?, offset?, limit? }`                                                | `KnowledgeRepairResult with progress`                                     | `ai.knowledge.repair({ offset: 0, limit: 100 })`                                          |
| `ai.knowledge.deleteCollection`   | 撤销整个集合            | `collection name?`                                                                | `void; cleanup tombstone remains`                                         | `ai.knowledge.deleteCollection("retired-manual")`                                         |
| `ai.memory.scoped`                | 绑定可信主体            | `{ objectId: nonempty string, scope? }`                                           | `direct ScopedMemoryOperations; invalid binding throws TypeError`         | `ai.memory.scoped({ objectId: "u1", scope: { topicId: "orders" } })`                      |
| `ai.memory.extract`               | 提取事实记忆            | `ChatMessage[], { objectId, scope?, model?, signal?, ...options }`                | `MemoryEntry[]`                                                           | `ai.memory.extract(messages, { objectId: "u1" })`                                         |
| `ai.memory.add`                   | 保存明确事实            | `MemoryEntryInput: objectId, content, type, scope?`                               | `MemoryEntry`                                                             | `ai.memory.add({ objectId: "u1", content: "偏好中文", type: "preference" })`              |
| `ai.memory.get`                   | 授权读取记忆            | `memoryId, { objectId, scope? } for untrusted IDs`                                | `MemoryEntry`                                                             | `ai.memory.get(memoryId, { objectId: "u1" })`                                             |
| `ai.memory.update`                | 更新已有事实            | `memoryId, MemoryUpdateInput, trusted access scope`                               | `MemoryEntry`                                                             | `ai.memory.update(memoryId, { content: "偏好日文" }, { objectId: "u1" })`                 |
| `ai.memory.remove`                | 删除授权记忆            | `memoryId, trusted access scope`                                                  | `void`                                                                    | `ai.memory.remove(memoryId, { objectId: "u1" })`                                          |
| `ai.memory.recall`                | 召回相关事实            | `query, { objectId, scope?, topK?, types?, ...options }`                          | `MemoryEntry[]`                                                           | `ai.memory.recall("语言偏好", { objectId: "u1" })`                                        |
| `ai.memory.injectMemories`        | 补充对话上下文          | `ChatMessage[], { objectId, scope?, topK?, ...options }`                          | `ChatMessage[]`                                                           | `ai.memory.injectMemories(messages, { objectId: "u1" })`                                  |
| `ai.memory.list`                  | 读取完整列表            | `MemoryListOptions with objectId/scope filters`                                   | `MemoryEntry[]; incomplete scan fails`                                    | `ai.memory.list({ objectId: "u1" })`                                                      |
| `ai.memory.listPage`              | 分页浏览记忆            | `MemoryListPageOptions with objectId/pagination`                                  | `StorePage<MemoryEntry>`                                                  | `ai.memory.listPage({ objectId: "u1", offset: 0, limit: 20 })`                            |
| `ai.memory.clear`                 | 清理指定范围            | `nonempty MemoryClearOptions`                                                     | `void; empty filters are rejected`                                        | `ai.memory.clear({ objectId: "u1" })`                                                     |
| `ai.memory.admin.clearAll`        | 可信管理员全清          | `{ confirm: true }; require host administrator authorization`                     | `void; destructive across subjects`                                       | `ai.memory.admin.clearAll({ confirm: true })`                                             |
| `ai.persona.save`                 | 保存角色                | `PersonaProfileInput: id, name, systemPrompt, objectId?, traits?`                 | `PersonaProfile`                                                          | `ai.persona.save(personaProfile)`                                                         |
| `ai.persona.get`                  | 读取角色                | `id, { objectId }?; omitted subject selects system profile`                       | `PersonaProfile`                                                          | `ai.persona.get("tutor", { objectId: "u1" })`                                             |
| `ai.persona.update`               | 更新角色                | `id, PersonaProfileUpdate, { objectId }?`                                         | `PersonaProfile`                                                          | `ai.persona.update("tutor", updates, { objectId: "u1" })`                                 |
| `ai.persona.remove`               | 删除角色                | `id, { objectId }?`                                                               | `void`                                                                    | `ai.persona.remove("tutor", { objectId: "u1" })`                                          |
| `ai.persona.list`                 | 列出主体角色            | `{ objectId }?`                                                                   | `PersonaProfile[]`                                                        | `ai.persona.list({ objectId: "u1" })`                                                     |
| `ai.persona.compose`              | 生成系统提示词          | `id, { objectId }?`                                                               | `string prompt`                                                           | `ai.persona.compose("tutor", { objectId: "u1" })`                                         |
| `ai.token.estimateText`           | 估算单段 Token          | `text: string`                                                                    | `direct number; estimate, not billing usage`                              | `ai.token.estimateText("Hello 世界")`                                                     |
| `ai.token.estimateMessages`       | 估算消息 Token          | `ChatMessage[]`                                                                   | `direct number including protocol overhead`                               | `ai.token.estimateMessages(messages)`                                                     |
| `ai.summary.generate`             | 生成摘要文本            | `ChatMessage[], SummaryOptions?`                                                  | `string`                                                                  | `ai.summary.generate(messages)`                                                           |
| `ai.summary.summarize`            | 生成摘要及覆盖信息      | `ChatMessage[], SummaryOptions?`                                                  | `{ summary, tokenCount, coveredMessages }`                                | `ai.summary.summarize(messages)`                                                          |
| `ai.compress.tryCompress`         | 按预算压缩              | `ChatMessage[], { strategy?, maxTokens?, preserveLastN?, ...options }`            | `CompressResult: messages and original/compressed token counts`           | `ai.compress.tryCompress(messages, { maxTokens: 4000 })`                                  |
| `ai.context.createManager`        | 开始多轮对话            | `ContextManagerOptions with scope { objectId, sessionId }`                        | `ContextManager`                                                          | `ai.context.createManager({ scope: { objectId: "u1", sessionId: "s1" } })`                |
| `ai.context.restoreManager`       | 恢复对话                | `{ objectId, sessionId }, options?`                                               | `ContextManager`                                                          | `ai.context.restoreManager({ objectId: "u1", sessionId: "s1" })`                          |
| `ai.context.listSessions`         | 列出可恢复会话          | `objectId`                                                                        | `SessionInfo[]`                                                           | `ai.context.listSessions("u1")`                                                           |
| `ai.context.renameSession`        | 修改会话标题            | `scope, title`                                                                    | `void`                                                                    | `ai.context.renameSession({ objectId: "u1", sessionId: "s1" }, "订单讨论")`               |
| `ai.context.removeSession`        | 删除指定会话            | `scope`                                                                           | `void; tombstone prevents scope reuse`                                    | `ai.context.removeSession({ objectId: "u1", sessionId: "s1" })`                           |
| `ai.rerank.rerank`                | 重排文档对象            | `RerankRequest: query, documents, model?, topN?`                                  | `RerankResponse with model/results`                                       | `ai.rerank.rerank({ query: "部署", documents: ["配置说明"] })`                            |
| `ai.rerank.rerankTexts`           | 重排文本候选            | `query, string[] texts, topN?`                                                    | `RerankItem[] with index/relevanceScore`                                  | `ai.rerank.rerankTexts("部署", ["配置说明"], 1)`                                          |
| `ai.file.parse`                   | 识别文件并提取          | `FileParseRequest with content, filename, options?`                               | `FileParseResult; extraction is not HTML sanitization`                    | `ai.file.parse({ content: "<p>正文</p>", filename: "intro.html" })`                       |
| `ai.file.parseText`               | 直接提取文本            | `Buffer\|string content, filename?`                                               | `string`                                                                  | `ai.file.parseText("Hello", "intro.txt")`                                                 |
| `ai.reasoning.run`                | 多步骤求解              | `query, ReasoningOptions including strategy/tools?`                               | `ReasoningResult`                                                         | `ai.reasoning.run("审查方案", { strategy: "cot" })`                                       |
| `ai.reasoning.runStream`          | 观察推理过程            | `query, ReasoningOptions?`                                                        | `AsyncIterable<ReasoningStreamEvent>`                                     | `ai.reasoning.runStream("审查方案", { strategy: "react" })`                               |
| `ai.audio.transcribe`             | 识别完整音频            | `TranscriptionRequest: audio, language?, model?, signal?`                         | `TranscriptionResult: text, language?, segments?`                         | `ai.audio.transcribe({ audio: { data: wavBytes, format: "wav" } })`                       |
| `ai.audio.transcribeStream`       | 持续语音识别            | `TranscriptionStreamRequest: chunks or complete audio`                            | `AsyncIterable<TranscriptionEvent>`                                       | `ai.audio.transcribeStream(transcriptionInput)`                                           |
| `ai.audio.synthesize`             | 合成完整语音            | `SynthesisRequest: text, language?, model?, signal?`                              | `SynthesisResult: audio and duration metadata`                            | `ai.audio.synthesize({ text: "你好" })`                                                   |
| `ai.audio.synthesizeStream`       | 按段合成                | `SynthesisStreamRequest: text segment or async segments`                          | `AsyncIterable<SynthesisEvent>`                                           | `ai.audio.synthesizeStream(synthesisInput)`                                               |
| `ai.audio.getCapabilities`        | 先检查模型能力          | `{ operation: transcribe\|synthesize, model? }`                                   | `AudioModelCapabilities`                                                  | `ai.audio.getCapabilities({ operation: "synthesize" })`                                   |
| `ai.image.generate`               | 生成或参考图片          | `{ prompt, referenceImages?, model?, size?, signal? }`                            | `{ images: GeneratedImage[] } with bytes/MIME`                            | `ai.image.generate({ prompt: "一座灯塔" })`                                               |
| `ai.a2a.registerExecutor`         | 注册任务执行器          | `SDK AgentExecutor`                                                               | `void`                                                                    | `ai.a2a.registerExecutor(executor)`                                                       |
| `ai.a2a.getAgentCard`             | 提供标准发现文档        | `none; configured a2a card`                                                       | `A2AAgentCardDocument (A2A 1.0 ProtoJSON)`                                | `ai.a2a.getAgentCard()`                                                                   |
| `ai.a2a.handleRequest`            | 处理认证的协议请求      | `unknown JSON-RPC body, trusted context.agentId?`                                 | `direct Promise<A2AHandleResult>; JSON-RPC/SSE outcome`                   | `ai.a2a.handleRequest(body, { agentId: trustedAgentId })`                                 |
| `ai.a2a.listMessages`             | 可信管理查询            | `A2ATaskFilter: callerId?, contextId?, since?, pagination?`                       | `StorePage<A2AMessageRecord>`                                             | `ai.a2a.listMessages(messageFilter)`                                                      |
| `ai.a2a.callRemoteAgent`          | 调用获准远端            | `allowlisted HTTPS URL, message, A2ACallOptions?`                                 | `A2ACallResult`                                                           | `ai.a2a.callRemoteAgent("https://agent.example.com/a2a", "请分析订单")`                   |
| `ai.init`                         | 准备服务                | `AIConfigInput?, AIInitOptions?`                                                  | `HaiResult<void>; validate dependencies before use`                       | `ai.init({ llm: { apiKey: process.env.HAI_AI_LLM_APIKEY } })`                             |
| `ai.close`                        | 反序释放服务            | `none`                                                                            | `Promise<void>; wait for cleanup`                                         | `ai.close()`                                                                              |
| `ai.config`                       | 诊断当前配置            | `none`                                                                            | `redacted AIConfig or null`                                               | `ai.config`                                                                               |
| `ai.isInitialized`                | 检查生命周期状态        | `none`                                                                            | `boolean`                                                                 | `ai.isInitialized`                                                                        |
| `ai.llm.models.list`              | 列出合并清单            | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.llm.models.list()`                                                                    |
| `ai.llm.models.get`               | 读取来源和版本          | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.llm.models.get("coding")`                                                             |
| `ai.llm.models.register`          | 登记数据库定义          | `ModelEntry input (id/model/protocol/credentials/capabilities)`                   | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.llm.models.register(modelDefinition)`                                                 |
| `ai.llm.models.update`            | 按版本替换定义          | `ModelEntry input (id/model/protocol/credentials/capabilities), expectedVersion?` | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.llm.models.update(modelDefinition, current.data.version)`                             |
| `ai.llm.models.remove`            | 删除数据库定义          | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.llm.models.remove("coding", current.data.version)`                                    |
| `ai.audio.models.list`            | 列出合并清单            | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.audio.models.list()`                                                                  |
| `ai.audio.models.get`             | 读取来源和版本          | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.audio.models.get("speech")`                                                           |
| `ai.audio.models.register`        | 登记数据库定义          | `AudioModelEntry input (id/provider/model/operations)`                            | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.audio.models.register(audioModelDefinition)`                                          |
| `ai.audio.models.update`          | 按版本替换定义          | `AudioModelEntry input (id/provider/model/operations), expectedVersion?`          | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.audio.models.update(audioModelDefinition, current.data.version)`                      |
| `ai.audio.models.remove`          | 删除数据库定义          | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.audio.models.remove("speech", current.data.version)`                                  |
| `ai.image.models.list`            | 列出合并清单            | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.image.models.list()`                                                                  |
| `ai.image.models.get`             | 读取来源和版本          | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.image.models.get("poster")`                                                           |
| `ai.image.models.register`        | 登记数据库定义          | `ImageModelEntry input (id/provider/model)`                                       | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.image.models.register(imageModelDefinition)`                                          |
| `ai.image.models.update`          | 按版本替换定义          | `ImageModelEntry input (id/provider/model), expectedVersion?`                     | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.image.models.update(imageModelDefinition, current.data.version)`                      |
| `ai.image.models.remove`          | 删除数据库定义          | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.image.models.remove("poster", current.data.version)`                                  |
| `ai.mcp.servers.list`             | 列出合并清单            | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.mcp.servers.list()`                                                                   |
| `ai.mcp.servers.get`              | 读取来源和版本          | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.mcp.servers.get("tools")`                                                             |
| `ai.mcp.servers.register`         | 登记数据库定义          | `MCPExternalServer input (id/transport/url or command)`                           | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.mcp.servers.register(mcpServerDefinition)`                                            |
| `ai.mcp.servers.update`           | 按版本替换定义          | `MCPExternalServer input (id/transport/url or command), expectedVersion?`         | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.mcp.servers.update(mcpServerDefinition, current.data.version)`                        |
| `ai.mcp.servers.remove`           | 删除数据库定义          | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.mcp.servers.remove("tools", current.data.version)`                                    |
| `ai.retrieval.sources.list`       | 列出合并清单            | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.retrieval.sources.list()`                                                             |
| `ai.retrieval.sources.get`        | 读取来源和版本          | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.retrieval.sources.get("docs")`                                                        |
| `ai.retrieval.sources.register`   | 登记数据库定义          | `RetrievalSource input (id/collection)`                                           | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.retrieval.sources.register(sourceDefinition)`                                         |
| `ai.retrieval.sources.update`     | 按版本替换定义          | `RetrievalSource input (id/collection), expectedVersion?`                         | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.retrieval.sources.update(sourceDefinition, current.data.version)`                     |
| `ai.retrieval.sources.remove`     | 删除数据库定义          | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.retrieval.sources.remove("docs", current.data.version)`                               |
| `ai.acp.agents.list`              | 列出合并清单            | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.acp.agents.list()`                                                                    |
| `ai.acp.agents.get`               | 读取来源和版本          | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.acp.agents.get("coder")`                                                              |
| `ai.acp.agents.register`          | 登记数据库定义          | `ACPAgent input (id/mode/adapter/modelIds)`                                       | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.acp.agents.register(agentDefinition)`                                                 |
| `ai.acp.agents.update`            | 按版本替换定义          | `ACPAgent input (id/mode/adapter/modelIds), expectedVersion?`                     | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.acp.agents.update(agentDefinition, current.data.version)`                             |
| `ai.acp.agents.remove`            | 删除数据库定义          | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.acp.agents.remove("coder", current.data.version)`                                     |
| `ai.acp.workspaces.list`          | 列出合并清单            | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.acp.workspaces.list()`                                                                |
| `ai.acp.workspaces.get`           | 读取来源和版本          | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.acp.workspaces.get("project")`                                                        |
| `ai.acp.workspaces.register`      | 登记数据库定义          | `ACPWorkspace input (id/storage/repositories)`                                    | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.acp.workspaces.register(workspaceDefinition)`                                         |
| `ai.acp.workspaces.update`        | 按版本替换定义          | `ACPWorkspace input (id/storage/repositories), expectedVersion?`                  | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.acp.workspaces.update(workspaceDefinition, current.data.version)`                     |
| `ai.acp.workspaces.remove`        | 删除数据库定义          | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.acp.workspaces.remove("project", current.data.version)`                               |
| `ai.acp.agents.initialize`        | 预检适配器配置          | `agentId, modelId?`                                                               | `HaiResult<{ agentId, mode, modelIds }>; no credentials`                  | `ai.acp.agents.initialize("coder")`                                                       |
| `ai.acp.agents.check`             | 实际连接并握手          | `agentId, { workspaceId?, ...ACPClientOptions }`                                  | `HaiResult<native initialize response>; owned connection is closed`       | `ai.acp.agents.check("coder", { workspaceId: "project" })`                                |
| `ai.acp.workspaces.prepare`       | 准备工作目录            | `workspaceId`                                                                     | `HaiResult<main absolute path>; dirty content is retained`                | `ai.acp.workspaces.prepare("project")`                                                    |
| `ai.acp.workspaces.importFiles`   | 导入受控文件            | `workspaceId, { path: relative path, content: string\|Uint8Array }[]`             | `HaiResult<{ imported: string[] }>; no overwrite`                         | `ai.acp.workspaces.importFiles("project", [{ path: "notes.txt", content: "需求" }])`      |
| `ai.acp.sessions.create`          | 启动受管开发会话        | `ACPCreateSessionOptions: agentId/workspaceId/newWorktree?`                       | `HaiResult<managed session handle>`                                       | `ai.acp.sessions.create({ agentId: "coder", workspaceId: "project", newWorktree: true })` |
| `ai.acp.sessions.get`             | 读取会话句柄            | `framework session id`                                                            | `HaiResult<managed session handle>; does not resume`                      | `ai.acp.sessions.get("task-1")`                                                           |
| `ai.acp.sessions.list`            | 查询受管会话            | `workspaceId?`                                                                    | `HaiResult<ACPSessionInfo[]>`                                             | `ai.acp.sessions.list("project")`                                                         |
| `ai.acp.sessions.resume`          | 恢复原生会话            | `framework session id, ACPClientOptions?`                                         | `HaiResult<managed session handle>; definition changes may reject`        | `ai.acp.sessions.resume("task-1")`                                                        |
| `ai.acp.sessions.close`           | 停止拥有的执行环境      | `framework session id`                                                            | `HaiResult<void>; source and native history retained`                     | `ai.acp.sessions.close("task-1")`                                                         |
| `ai.acp.sessions.reclaimWorktree` | 回收干净检出目录        | `closed framework session id; preview stopped and changes saved`                  | `HaiResult<void>; branch and normal files retained`                       | `ai.acp.sessions.reclaimWorktree("task-1")`                                               |
| `ai.acp.sessions.remove`          | 移除会话记录            | `closed or failed framework session id`                                           | `HaiResult<void>; worktree and native history retained`                   | `ai.acp.sessions.remove("task-1")`                                                        |
| `ai.acp.connect`                  | 接入原生传输            | `ACPTransport: stdio/http/ws, ACPClientOptions?`                                  | `HaiResult<connection handle>`                                            | `ai.acp.connect({ type: "http", url: "https://agent.example.com/acp" })`                  |
| `ai.acp.close`                    | 关闭子系统              | `none; normally call ai.close()`                                                  | `Promise<void>; cleanup may throw`                                        | `ai.acp.close()`                                                                          |

- `ai.tools`：工具定义、注册表、批量执行；无需初始化。
- `ai.stream`：ChatCompletion 流式 chunk 处理；无需初始化。
- `ai.llm`：非流式/流式对话、模型列表、历史记录。
- `ai.mcp` / `createMcpServer`：内置 MCP 注册表与独立 MCP Server。
- `ai.embedding`：单条/批量文本向量化。
- `ai.memory`：记忆提取、存储、召回、注入。
- `ai.persona`：AI 角色人格档案（系统提示词 + 特征）与系统提示词组合。
- `ai.retrieval` / `ai.rag`：多源向量检索与检索增强问答。
- `ai.knowledge`：文档入库、实体增强检索、知识问答。
- `ai.context`：LLM + Memory + RAG + 压缩的一体化会话管理。
- `ai.file` / `ai.rerank`：文件解析/OCR 与文本重排序。
- `ai.audio`：语音识别（ASR）与语音合成（TTS），支持完整与流式调用，覆盖 OpenAI / MiMo / Qwen / 豆包平台。
- `ai.image`：文生图，覆盖 OpenAI GPT Image、Google Gemini Image / Nano Banana、Qwen-Image 2.0/3.0、Seedream 4.x/5.x 与 Pollinations 免费额度模型。
- `ai.a2a`：Agent-to-Agent 请求处理与远端调用。
- `@h-ai/ai/client`：独立浏览器 Audio WebSocket 客户端。

`@h-ai/ai/client` 仅提供 `createAudioClient({ url, getTicket })` 与 Audio 客户端类型。HTTP 使用 `@h-ai/api-client` 的 typed 领域方法；默认聊天补全非流式，流与 A2A 使用应用自行绑定的 contract。浏览器不导出 Node 单例 `ai`。

```ts
import { apiClient } from '@h-ai/api-client'

const ready = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1' })
if (!ready.success)
  throw new Error(ready.error.message)
try {
  const response = await apiClient.ai.chats.createCompletion({
    messages: [
      { role: 'user', content: '你好' }
    ]
  })
  if (!response.success)
    throw new Error(response.error.message)
  const reply = response.data.choices[0]?.message.content
}
finally {
  await apiClient.close()
}
```

- `AIStoreProvider`：统一存储抽象；生产要求 `stateScope: 'shared'`，内置实现须先初始化 PostgreSQL/MySQL 与网络 vecdb。开发/显式测试无数据库时使用临时 Store。

更完整的方法清单、错误码与长示例见 [REFERENCE.md](./REFERENCE.md)。

### 持久化 DB Provider（reldb + vecdb）

```ts
import { ai } from '@h-ai/ai'
import { reldb } from '@h-ai/reldb'
import { vecdb } from '@h-ai/vecdb'

// 开发/测试使用本地后端；生产改为共享 PostgreSQL/MySQL 与网络 vecdb。
const failures: unknown[] = []
try {
  const database = await reldb.init({ type: 'sqlite', database: './ai.db' })
  if (!database.success)
    throw new Error(database.error.message)
  const vectors = await vecdb.init({ type: 'lancedb', path: './ai-vec.db' })
  if (!vectors.success)
    throw new Error(vectors.error.message)
  const initialized = await ai.init({
    llm: { model: 'gpt-4o-mini', apiKey: process.env.HAI_AI_LLM_APIKEY },
  })
  if (!initialized.success)
    throw new Error(initialized.error.message)
  const result = await ai.llm.chat({
    messages: [
      { role: 'user', content: 'Hello!' }
    ]
  })
  if (!result.success)
    throw new Error(result.error.message)
  const reply = result.data.choices[0]?.message.content ?? ''
}
catch (error) {
  failures.push(error)
}
finally {
  await ai.close()
  for (const service of [vecdb, reldb]) {
    const closed = await service.close()
    if (!closed.success)
      failures.push(new Error(closed.error.message))
  }
}
if (failures.length)
  throw new AggregateError(failures, 'AI operation or cleanup failed')
```

MySQL 首次初始化允许多个节点并发建索引：仅接受 mysql2 明确的 ER_DUP_KEYNAME/1061，并重新核对列及顺序、非唯一完整列、升序可见 BTREE 和无表达式；已有同名错误结构仍失败。账户需要建表和 INDEX 权限，元数据读取、权限或其他 DDL 错误使 ai.init 返回 CONFIGURATION_ERROR。返回前等待全部已启动 DDL 结束；MySQL DDL 不回滚，失败保留已创建结构，修复权限/结构后再重试。逐步检查初始化结果，失败不接收业务请求，并逆序关闭 AI、vecdb、reldb。

### 自定义 StoreProvider

```ts
import type { AIStoreProvider } from '@h-ai/ai'
import { ai } from '@h-ai/ai'

const storeProvider: AIStoreProvider = createMyStoreProvider()

await ai.init(
  {
    llm: { model: 'gpt-4o-mini', apiKey: process.env.HAI_AI_LLM_APIKEY }
  },
  { storeProvider },
)

await ai.close()
```

### API 契约

- 对外只通过 `ai` 服务对象和少量独立工厂（如 `createMcpServer`）访问。
- 生命周期为 `await ai.init(config, options?)` / `await ai.close()`；关闭会等待自定义 `AIStoreProvider.close()`。
- 领域方法返回 `HaiResult<T>` 或 `Promise<HaiResult<T>>`；业务失败通过 `result.success === false` 和 `result.error.code` 表达。流式 `AsyncIterable`、客户端传输和第三方回调在建立或迭代期间可能抛异常。
- `ai.tools` 与 `ai.stream` 是纯函数子系统，无需初始化即可使用。
- 开发/测试缺少 reldb/vecdb 时使用临时 Store；两者均已初始化时自动使用 DB Provider。生产校验真实数据库与向量后端共享能力，自定义 Provider 必须如实声明 `stateScope`。

公共扩展通过 AIStoreProvider 注入 Store；内置 LLM Provider/工厂依赖与 Context 内部依赖不属于公开 API。模型接入使用配置，历史查询、AskOptions 和 ChatRecord 保持公开。

### API 概览

#### LLM

```ts
const result = await ai.llm.chat({ messages })
for await (const chunk of ai.llm.chatStream({ messages })) {
  const delta = chunk.choices[0]?.delta?.content
  if (delta) {
    process.stdout.write(delta)
  }
}

// 请求取消：传入 AbortSignal，主持人打断/用户切换时 abort() 立即停止上游生成与计费
const controller = new AbortController()
const cancellable = ai.llm.chat({ messages, signal: controller.signal })
// controller.abort()

// 多协议：模型的 protocol 决定底层走 Chat Completions / Responses / Anthropic，公共请求响应形状不变
// - chat（默认）：OpenAI Chat Completions（兼容绝大多数厂商）
// - responses：OpenAI Responses API（/v1/responses）
// - anthropic：Anthropic Messages API（Claude 原生协议，环境变量 ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL）
const claude = await ai.llm.chat({ messages, model: 'claude' }) // 该模型配置 protocol: anthropic

// 临时模型：单次请求绕过配置注册模型，直接指定端点与凭据（chat/chatStream/ask/askStream 均支持）
// 临时客户端按 TTL 缓存（llm.tempModelCacheTtl，默认 10 分钟），与常驻模型客户端隔离
const temp = await ai.llm.chat({
  messages,
  tempModel: { model: 'claude-3-5-sonnet', protocol: 'anthropic', apiKey: process.env.TEMP_LLM_API_KEY },
})
```

SSE 文本解码遵循 [WHATWG 事件流规则](https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation)：LF/CRLF/CR 跨片、多行 data、仅去冒号后一个空格、继承有效 id/retry；空或缺省 event 按 message，EOF 不补空行派发残余事件。encodeSSE 规范化 data 换行，并对 id/event 换行、id 的 NUL 或无效 retry 显式抛错。Anthropic/MiMo 共用内部 UTF-8 流读取；消费方退出、取消、协议结束和失败均取消正文并释放 reader，不自动重连或重放业务。Anthropic timeout 覆盖正文，MiMo 保留每个 HTTP 请求的独立 timeout。

##### 结构化输出：`ai.llm.generateObject`

按模型或网关的响应能力选择 `responseFormat`。默认 `json_schema` 向上游发送严格 JSON Schema，`schemaName` 只用于此模式，默认 `result`。仅支持通用 JSON 的 Chat 网关使用 `json_object`，框架将 Schema 放入提示词。两种模式都在本地用同一个 Zod Schema 校验，解析或校验失败时可按 `maxRepairs` 修复，默认一次。

```ts
import { ai } from '@h-ai/ai'
import { z } from 'zod'

// 已初始化 AI，llm 使用支持通用 JSON 模式的文本模型。
const result = await ai.llm.generateObject({
  schema: z.object({
    title: z.string()
  }), // 要求返回含 title 字符串的对象。
  messages: [
    { role: 'user', content: '为发布检查表生成标题。' }
  ], // 本次输入。
  responseFormat: 'json_object', // 请求通用 JSON，仍会执行本地 Zod 校验。
  maxRepairs: 1, // 解析或校验失败时允许再请求一次。
})
if (result.success)
  process.stdout.write(result.data.title) // 例如：发布检查表。
```

#### 工具调用

```ts
import { z } from 'zod'

const registry = ai.tools.createRegistry({
  // 统一授权在 Zod 校验后、handler 前执行；false/异常均 fail-closed
  authorize: ({ toolName, context }) => canExecuteTool(context.objectId, toolName),
})
const registered = registry.register(ai.tools.define({
  name: 'get_weather',
  description: '获取天气',
  parameters: z.object({
    city: z.string()
  }),
  // handler 第二参为执行上下文：可响应取消（打断/超时）、感知截止时间与交互主体
  handler: async ({ city }, { signal }) => {
    const res = await fetch(`https://api.example.com/weather?city=${city}`, { signal })
    return res.json()
  },
  timeoutMs: 10_000, // 本工具默认超时（可被 execute 的 deadline / timeoutMs 覆盖）
}))
if (!registered.success)
  return registered

// 执行时可传入取消信号 / 超时 / 作用域；取消或超时返回 TOOL_TIMEOUT，且不再等待未响应的 handler
const result = await registry.execute(toolCall, { signal: controller.signal, objectId: 'user-001', timeoutMs: 30_000 })

// 批量调用默认串行，避免副作用工具并发启动；纯读取且确认安全时才显式并行
const batch = await registry.executeAll(toolCalls)

const chat = await ai.llm.chat({
  messages,
  tools: registry.getDefinitions()
})
```

#### ACP 智能体、工作区和会话

`ai.acp` 在 Node 服务端接入原生 ACP 智能体：`embedded` 本机进程、`builtin-service` Podman/Docker 容器（自动选择优先 Podman）、`custom-service` 已有 HTTP/WS 服务。Codex/dsh 当前使用 stdio；不自动转换不支持的传输。

Podman 关闭远程服务代理变量的自动继承；代理通过 Agent/workspace 的 `environmentRefs` 显式配置，并使用容器可达的地址。

Goose 1.57.0 镜像提供原生 `goose serve` HTTP/WS `/acp` 服务，通过 custom-service 和 `X-Secret-Key` 接入。模型由 Goose 服务维护，工作区与状态卷由部署方挂载；真实远程 E2E 按握手能力验收恢复。

- `agents.register/get/list/update/remove/initialize/check` 维护智能体。`codex`、`deepseek-harness` 适配器引用 `llm.models`；其他原生程序用 `generic` 或可信 `AIInitOptions.acpAdapters`。自定义服务自行管理模型。
- `workspaces.register/prepare/importFiles` 管理目录或持久 volume、多 Git 工程和普通文件；每个 Git 明确 `mainBranch`。prepare 不覆盖脏目录。
- 私有仓库用 workspace 的 `gitEnvironmentRefs` 将凭据仅提供给远程 Git；Agent 专用变量放在 agent 的 `environmentRefs`。旧 workspace 的 `environmentRefs` 仍共用。
- `sessions.create/resume/get/list/close` 管理会话；`newWorktree: true` 从各本地主分支建同名 worktree。可用 `repositoryId` 从指定仓库根目录启动与恢复，让 Agent 按该仓库发现规则和技能。prompt/stream/strict promptStructured、权限回调、MCP、模式配置、取消和能力检查沿用 ACP。
- `session.info().data.workspace` 在成功时提供本机或同节点卷的工作树位置，可在 Agent 关闭后用于预览。先停止预览并保存改动，再用 `sessions.reclaimWorktree(id)` 定向回收干净工作树，保留分支、普通文件、原生历史和卷。
- `session.updateMain()` 只 fetch/ff-only 更新明确主分支；`publish({ mode: 'merge-main' | 'push-branch', message, author })` 仅发布受管隔离 session，逐仓库报告部分失败，不强推。操作前停止执行环境，继续任务显式 resume。

模型容量、模态和推理能力填 `llm.models[].capabilities`，未知不猜。Codex 要求原生 Responses；Hai 现有转换不是反向服务网关。关闭后保留代码/状态卷，确认拥有的进程停止才释放 CAS 占用；worktree 不是安全沙箱。

DeepSeek Harness 直连官方 DeepSeek Chat 时，在模型条目中设置 `protocol: 'chat'` 和 `baseUrl: 'https://api.deepseek.com'`。内部中继可保留官方模型名 `deepseek-flash` 或 `deepseek-v4-pro` 以启用相同的兼容设置。Harness 用 `system` 发送指令，按 DeepSeek 格式发送输出上限，并在工具结果回传时保留 `reasoning_content`。 [DeepSeek Chat API](https://api-docs.deepseek.com/api/create-chat-completion/)

接入示例与限制见 [ACP 指南](../cli/templates/skills/hai-ai/acp.md)。构建 Agent 时可选 `minimal`、`documents`、`office`、`browser`、`developer`，默认精简镜像含 Git、Node 和原生 Agent，Codex 还含 bubblewrap。运行环境可登记镜像 ID 或远程清单 digest。[Agent 镜像](models/agents/README.md) 普通 API 返回 HaiResult，stream 失败抛出，ACP 运行入口位于 Node 服务端。

托管 Git 遇到子模块或 Git LFS 属性时明确返回 ACP_UNSUPPORTED，避免将不完整工程报告为就绪。

##### 按用户运行受管 ACP

服务启动时先初始化 RelDB 和 [Runner](../runner/README.md)，再将已启动的实例传给 `ai.init(config, { runner, acpPolicy })`。在 `acp.agents` 注册 Agent，并用 `environmentIds` 绑定 Runner 的固定镜像环境，用 `modelIds` 绑定 `llm.models` 的模型。Codex 需要 Responses 网关。API 和执行节点使用共享数据库与相同环境定义。关闭服务时先关闭 AI，再关闭 Runner 和数据库。

`task` 为本次会话启动独占 Worker，`user` 可在同一主体与启动配置下复用。`auto` 按策略选择。`shared` 只适用于明确支持共享的只读适配器，且会话不能申请私有上下文、工作区或工具，内置 Codex、DeepSeek Harness 和 Goose 仍使用独立模式。配置示例见 [ACP 配置](../../docs/usage/configuration/ai.md#acp-接入与模型能力)。

```ts
import type { RunnerScope } from '@h-ai/runner' // tenantId 和 userId 来自已认证的应用会话。
import { ai } from '@h-ai/ai' // 使用已注入 Runner 的服务端实例。

async function summarize(identity: RunnerScope, requestId: string) {
  const agent = ai.acp.scoped(identity) // 将后续任务、会话和权限访问绑定到此主体。
  const options = {
    agentId: 'assistant',
    execution: { mode: 'auto' as const }
  } // assistant 是已登记的 Agent。
  const plan = await agent.plan(options) // 返回实际模式、环境、模型和资源设置，不领取容器。
  if (!plan.success)
    return plan // 环境或权限不满足时不提交。
  const result = await agent.run({ ...options, prompt: '列出三条发布检查项', idempotencyKey: requestId }) // 返回 taskId、output 和生效选项。
  if (!result.success)
    return result // 提交、执行或清理失败时返回 HaiResult 错误。
  const events = await agent.tasks.events(result.data.taskId, 0, 20) // 读取前 20 个持久事件，空页为 []。
  if (!events.success)
    return events
  return { result: result.data, events: events.data } // 例如 output.text 是模型回答，events 含按序号排列的事件。
}
```

```ts
import type { RunnerScope } from '@h-ai/runner' // 服务端认证主体。
import { ai } from '@h-ai/ai' // assistant 已登记，并允许在同一用户内复用 Worker。

async function continueWork(identity: RunnerScope) {
  const agent = ai.acp.scoped(identity) // 成功访问只限当前主体的资源。
  const created = await agent.sessions.create({
    agentId: 'assistant',
    execution: { mode: 'user' }
  }) // 成功得到含 id 的会话句柄。
  if (!created.success)
    return created
  const session = created.data // 句柄提供 prompt、stream、changeExecution 和 close。
  const run = async () => {
    const first = await session.prompt('记下验收目标') // 返回这一轮的 taskId、output 与生效选项。
    if (!first.success)
      return first
    const switched = await session.changeExecution({ mode: 'task', acceptNewSession: true }) // 保留业务 id，建立新的原生会话。
    if (!switched.success)
      return switched
    return await session.prompt('给出独立验收清单') // 模型回答位于成功结果的 data.output。
  }
  return run().finally(async () => {
    const closed = await session.close() // 成功的 data 为 undefined，释放会话或独占任务环境。
    if (!closed.success)
      throw new Error(closed.error.message)
  })
}
```

使用 `agents.describe(agentId)` 查询内置适配器的能力，`sessions.get(id)` 由同一主体在其他 API 节点取得句柄，`session.stream(prompt, options)` 迭代持久事件并在失败时抛错。`tasks.get(taskId)` 返回执行回执，`tasks.cancel(taskId)` 接受取消并返回当前状态。可在 `run` 或 `prompt` 的 `onEvent` 中取得 `accepted` 事件的 `taskId`，然后用另一请求查看或取消。

`acpPolicy` 负责 `workspaceId` 快照、知识库、记忆、文件、Skills 和工具的业务授权。`allowTools` 与 `bindTools` 可接入下文的 MCP 入口。应用取得 `approval` 事件中的 `approvalId` 后，从同一主体调用 `approvals.respond(id, 'allow-once' | 'allow-session' | 'always-allow' | 'deny')`，成功返回 `undefined`。`approvals.rules(offset, limit)` 分页返回仍可用的规则和 `expiresAt`，`approvals.revoke(ruleId)` 撤销当前主体的规则。`full-access` 需要应用明确允许且使用 `task`。工作区提供只读快照，切换后可按需带入用户确认的 `historySummary`。更多示例见 [受管调用](../../docs/usage/development/ai-acp.md#多用户应用的受管调用)。

#### 配置与数据库资源清单

`llm.models`、`audio.models`、`image.models`、`mcp.servers`、`retrieval.sources`、`acp.agents/workspaces` 合并配置和数据库。配置同 ID 优先且只读，数据库支持 list/get/register/update/remove；条目返回 value/source/version，更新可检查版本。异步调用读取最新定义，音频同步能力查询使用最近刷新快照。资源错误为 090–094。管理定义可能含模型密钥，仅在可信服务端使用。

[Resource catalogs](../cli/templates/skills/hai-ai/resources.md) · [ACP](../cli/templates/skills/hai-ai/acp.md)

#### A2A 协议边界

远端调用的自定义请求头按名称大小写不敏感地覆盖。固定 JSON-RPC 地址拒绝 HTTP 重定向，认证头不会被转发到重定向目标。

`ai.a2a.getAgentCard()` 返回可直接用于 HTTP 发现响应的标准 A2A 1.0 ProtoJSON，含 `supportedInterfaces`、MIME 和 streaming 能力；Kit 默认发现路径为 `/.well-known/agent-card.json`。`handleRequest()` 始终返回 JSON-RPC/SSE 处理结果，未初始化返回 JSON-RPC 错误。可信 HTTP 认证上下文的 `agentId` 映射为 executor 的 `context.user.userName`。当前支持 JSON-RPC/SSE，不声明 push notifications、gRPC 或 REST 支持；业务资源授权仍由应用负责。

A2A 的 journal、context 归属与消息表在 `ai.init()` 阶段初始化。任务按可信 `agentId` 隔离（含获取、取消和续接）；匿名请求共享匿名主体，生产应在可信传输层认证。`listMessages` 是服务端管理接口，支持 `callerId`、`contextId`、`since`，不能向未授权客户端暴露。

Task 与事件使用同一共享 journal，不再装配独立的旧 TaskStore。push notification 配置和 authenticated extended card RPC 返回 SDK 标准“不支持/未配置”错误，不执行任务；executor 相关类型保留公开导出，内部 handler/Store 装配类型不属于公共契约。

入站消息必须持久化后才进入 executor，并在等待后重新校验共享执行代际与期限；agent 消息在同一有界事件队列内等待日志成功后才提交 journal。日志失败会产生 failed/interrupted Task，不会发布虚假的成功结果；同一消息重试不重新执行。日志与 journal 不是跨记录事务，已有日志不等于成功交付，最终以 Task 的 `requiresEffectReconciliation` 标记核对可能已发生的业务效果。消息查询失败返回 `A2A_LIST_MESSAGES_FAILED`（984），不暴露原始 SQL 或连接详情。

Task 与事件一次 CAS 持久化，任意节点可订阅；相同 message ID/内容重试仅返回同一轮结果，改变内容或重复旧轮消息失败。跨节点取消由真实执行 owner 调用 executor.cancelTask，取消未确认期间同一 Task 不接受新消息，避免迟到取消作用于新执行；input-required 可在节点重启后续接。DB 租约过期、绝对期限到达或执行器只返回 working 时标记 failed/interrupted，并设置 `metadata.haiExecution.requiresEffectReconciliation=true`；旧节点恢复不能写入，不自动重放未知外部效果。`a2a.execution` 默认 `leaseMs: 30000`、`pollIntervalMs: 250`、`maxExecutionMs: 300000`。单消息 1 MiB、journal 8 MiB、单轮 2048 事件、Task 256 回执、32 个 reference tasks，超限明确失败。外部副作用须使用稳定业务幂等键并核对未知结果；详细部署/验证边界见[共享状态能力表](../../.agents/instructions/distributed-state.md)。

#### MCP Server

`ai.mcp` 是进程内注册表，独立 `createMcpServer` 使用 SDK transport，两者不会自动互相注册。`ai.mcp` 在注册时编译工具 JSON Schema，调用时校验输入；资源输出必须恰好含 `text` / `blob` 之一；提示词参数与 SDK 消息输出均校验，支持图片和音频内容。HTTP 示例只展示 transport 连接，应用仍须挂载请求处理与认证，并在退出时关闭 server。

```ts
import { createMcpServer, StreamableHTTPServerTransport } from '@h-ai/ai'
import { z } from 'zod'

const server = createMcpServer({ name: 'my-server', version: '1.0.0' })
server.registerTool('search', {
  description: '搜索',
  inputSchema: {
    query: z.string()
  },
}, async ({ query }) => ({
  content: [
    { type: 'text', text: `Results for ${query}` }
  ],
}))
await server.connect(new StreamableHTTPServerTransport({
  sessionIdGenerator: () => globalThis.crypto.randomUUID()
}))
```

##### 调用远程 MCP 和独立工具作业

在 `mcp.servers` 的 `transport: http` 条目中登记第三方 Streamable HTTP 地址和 `allowedTools`。需要认证时用 `headerEnv` 引用服务器环境变量。`transport: job` 可用同一套调用接口运行离线文档、Office 和 OCR 工具。为作业配置 `environmentId`、允许操作和可选 `pool`，将 Runner 与 `mcpJobFiles` 传给 `ai.init`。作业请求只传已授权的 `fileId`，执行节点再次检查文件权限，产物以对象 ID 返回。浏览器镜像由部署方单独运行。详见 [MCP 配置](../../docs/usage/configuration/ai.md#mcp和a2a) 与 [工具镜像](tools/README.md)。

```ts
import type { MCPServiceAuthorization } from '@h-ai/ai' // 应用从 IAM 构造主体和按实际参数复核权限的回调。
import { ai } from '@h-ai/ai' // 服务端已初始化，并登记了 manual 与 office 服务。

async function searchManual(access: MCPServiceAuthorization, query: string) {
  const result = await ai.mcp.services.invoke({
    serviceId: 'manual',
    tool: 'search_manual',
    arguments: { query }
  }, access) // 目录和授权通过后得到标准 MCP 工具结果。
  if (!result.success)
    return result // 权限拒绝或上游失败时保留错误。
  return result.data.content // 例如 [{ type: 'text', text: '...' }]。
}

async function convertDocument(access: MCPServiceAuthorization, fileId: string) {
  const result = await ai.mcp.services.invoke({
    serviceId: 'office',
    tool: 'office.convert',
    arguments: { fileId }
  }, access) // 用授权对象 ID 提交离线转换。
  if (!result.success)
    return result
  return result.data.structuredContent // 成功示例 { fileId: 'pdf-123', name: 'result.pdf' }，下载需再次验权。
}
```

```ts
import type { MCPServiceAuthorization, MCPServiceBrokerOptions } from '@h-ai/ai' // url 由部署方指定，authorize 每次检查当前主体、任务和参数。
import { createServer } from 'node:http' // 提供示例 HTTP 请求入口。
import { ai } from '@h-ai/ai' // 服务端已初始化，并登记了 manual 服务。

function mountTools(options: MCPServiceBrokerOptions) {
  const result = ai.mcp.services.createBroker(options) // 成功返回 bind、handleRequest 和 close。
  if (!result.success)
    throw new Error(result.error.message)
  const broker = result.data // 每个执行节点创建自己的入口。
  const server = createServer((req, res) => {
    void broker.handleRequest(req, res)
  }) // 处理绑定地址上的 MCP 请求。
  return { broker, server } // 宿主监听固定地址并负责传输保护，关闭时调用 broker.close() 和 server.close()。
}

async function bindManual(broker: ReturnType<typeof mountTools>['broker'], principal: MCPServiceAuthorization['principal'], sessionId: string, signal: AbortSignal) {
  const result = await broker.bind({
    principal,
    taskId: sessionId,
    signal,
    tools: [
      {
        id: 'manual_search',
        serviceId: 'manual',
        tool: 'search_manual', // 模型可见名称与清单名称分开配置。
        description: 'Search authorized manuals', // 提供给模型的说明。
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query'],
          additionalProperties: false
        }, // 调用时校验工具参数。
      }
    ]
  }) // 成功为 { servers, revoke }，servers 含当前会话的短期 Bearer。
  if (!result.success)
    throw new Error(result.error.message)
  return result.data // 可从 ACPPlatformPolicy.bindTools 返回；会话结束时撤销凭据。
}
```

#### Memory / RAG / Knowledge

默认数据库 Store 在同一事务提交原生记忆和待同步向量操作。新增、更新、删除及清理成功表示关系数据已经生效，向量索引可稍后追平。向量库故障时读取仍以关系记录为准。任一共享同一关系库和向量库的节点都可以分批重试，进程重启后接续。

在 `ai.init({ memory: { vectorNamespace: 'orders-prod' } })` 中设置原生记忆向量命名空间，默认 `default`。独立关系库在共用 Qdrant 时仍会得到不同的物理集合。同一应用各节点使用同一个关系库、命名空间和向量后端。首次升级从关系库保存的向量后台重建索引，既有记忆可继续检索。旧共享集合保持原样。巡检只清理专用集合中的过时向量，每页保存共享进度，迟到写入和重启后可继续回收。 [升级步骤](../../docs/usage/configuration/ai.md#从旧共享集合升级)

`ai.memory.scoped({ objectId })` 要求非空且非纯空白的主体 ID，否则工厂立即抛 `TypeError`，不会创建未绑定实例。公共 `clear({ scope: {} })` 等空范围返回失败；跨主体全清必须调用显式管理员入口。原生记忆的访问统计与更新使用版本 CAS，迟到读取不会复活已删除记录；关系事务失败通过 HaiResult 返回。向量同步会自动重试，调用方无需重新提交业务操作。

Knowledge 每次导入生成唯一 `revision` 和分块 ID，先完整准备分块、向量及实体，再持久化暂存清单、写入向量，最后通过共享 Store CAS 一次发布正文、实体和元数据。相同文档并发重建只允许一个写入者；失败时保留完整旧版，缩短文档不会留下可见旧尾块。检索只接受当前发布版本，并在发布穿插时重试，持续冲突返回错误供调用方重试。向量候选可能按需扩大，清理积压会增加查询成本。

`ingest` 成功结果包含 `revision` 与 `cleanupPending`：后者为 true 表示新版本已经发布，但旧向量删除仍待补偿。调用 `repair({ collection, offset, limit })` 分页重试；`setup` 自动检查前 100 份清单，生产环境应定期扫描全部页。暂存期限为存储端时钟的 5 分钟，超时写入者不能发布；故障暂存的永久墓碑用于反复删除迟到的外部写入，不能随日志保留期删除。SQL 与 vecdb 不组成跨库事务，恢复依赖持久清单和持续补偿。`removeDocument` / `deleteCollection` 先撤销可见性，清理失败返回错误；集合删除保留空向量集合及代际墓碑以支持补偿，重新 setup 不显示上一代内容。

默认 DB Store 传播集合查询/创建及向量写入失败。LanceDB 使用持久主键原子 merge；Qdrant 写入/删除等待应用完成，计数使用精确计数。多节点必须共享关系存储和服务端向量后端；自定义 `KnowledgeStore` 须实现相同的版本发布与补偿契约。

使用 LanceDB 时，集合维度与 metric 随 Arrow schema 持久化；连接 metric 只影响新集合。重启后复用同一持久目录，embedding 维数改变时重建匹配集合；多个节点各自的本地路径不会自动共享，分布式 Knowledge 推荐服务端向量后端。

Knowledge 的 `retrieve/ask` 及默认 DB Store 会将 `filter` 传给向量 Provider，过滤校验/查询失败会向上传播；Knowledge 返回 `KNOWLEDGE_RETRIEVE_FAILED`（ask 包装为 `RAG_FAILED`），不会伪装成空结果。LanceDB 的过滤只支持顶层键的 string/有限 number/boolean/null AND 精确匹配，例如 `{ tenant: 'acme', active: true }`；null 不匹配缺失字段，不支持对象/数组/undefined。条件在向量 topK 前执行；其它后端的 null/复杂值语义须单独核对。LanceDB 元数据改用原生 JSON 字段，仍可保存嵌套 JSON；旧字符串元数据集合须重建后才能写入或过滤。

```ts
const enriched = await ai.memory.injectMemories(messages, { objectId: 'user-001', topK: 5 })
if (!enriched.success) {
  return enriched
}

// 多租户推荐入口：scoped() 绑定主体与作用域，所有操作自动携带 objectId / scope（含归属校验），杜绝「忘记传 objectId」越权
const memory = ai.memory.scoped({
  objectId: 'user-001',
  scope: { topicId: 't-1', personaId: 'p-1' }
})
await memory.add({ content: '用户偏好中文', type: 'preference' })
const recalled = await memory.recall('语言偏好')

// clear 拒绝空过滤（防误清全局）；全局清空只能显式走管理接口
await memory.clear({
  types: ['event']
}) // 仅清该作用域内的 event
await ai.memory.admin.clearAll({ confirm: true }) // 危险：清空整个记忆后端，需显式确认

const rag = await ai.rag.query('核心架构是什么？', {
  sources: ['docs'],
  topK: 5
})

const setup = await ai.knowledge.setup()
if (setup.success) {
  const ingested = await ai.knowledge.ingest({ documentId: 'doc-001', content: markdownText, title: '产品手册' })
  if (!ingested.success)
    return ingested
  if (ingested.data.cleanupPending) {
    const repaired = await ai.knowledge.repair({ offset: 0, limit: 100 })
    if (!repaired.success)
      return repaired
  }
}
```

Knowledge 分块直接遵循 datapipe 的单位与硬上限：word 为词，其他为 Unicode code point，保留清洗后文本的分隔符；AI 默认 chunkOptions 仍为 markdown/maxSize=1500/overlap=200，覆盖较小 maxSize 时须同时保证继承的 overlap 小于它。分块配置/表达式失败返回 KNOWLEDGE_INGEST_FAILED，embedding 与版本发布均不会执行，不退回整篇文本绕过预算。

#### 语音（Audio）

先在 `ai.init()` 中注册语音模型并映射默认识别/合成模型。凭据默认回退到平台环境变量；只有 LLM 与语音模型确认使用同一凭据时，才显式启用 `inheritLlmApiKey`：

平台（`provider`）表示调用协议而非部署位置：`openai` / `mimo` / `qwen` / `doubao` 为云服务；`whisper`（ASR）/ `indextts`（TTS）为可自托管协议，无 canonical 端点，必须显式配置 `baseUrl`，同一协议可切换多个 Endpoint（云 / 内网 / 本地）而不改业务代码。云平台缺少凭据返回 `CONFIGURATION_ERROR`；自托管平台可无凭据（配置 `apiKey` 后按 `Authorization: Bearer` 发送）。

```ts
await ai.init({
  llm: {
    apiKey: process.env.HAI_AI_LLM_APIKEY,
  },
  audio: {
    inheritLlmApiKey: true,
    models: [
      {
        id: 'asr',
        provider: 'qwen',
        model: 'qwen3-asr-flash-realtime',
        operations: ['transcribe']
      },
      {
        id: 'tts',
        provider: 'qwen',
        model: 'qwen3-tts-flash-realtime',
        operations: ['synthesize']
      },
      // 自托管：whisper / indextts 必须显式配置 baseUrl
      {
        id: 'whisper',
        provider: 'whisper',
        model: 'faster-whisper-large-v3',
        operations: ['transcribe'],
        baseUrl: 'http://127.0.0.1:8101/v1'
      },
      {
        id: 'indextts',
        provider: 'indextts',
        model: 'indextts-2.5',
        operations: ['synthesize'],
        baseUrl: 'http://127.0.0.1:8102/v1'
      },
    ],
    transcribeModel: 'asr',
    synthesizeModel: 'tts',
  },
})

// 完整识别（可选热词、时间戳粒度与 VAD；strictCapabilities 要求模型真实支持所请求能力）
const result = await ai.audio.transcribe({
  audio: { data: wavBytes, format: 'wav' },
  language: 'zh',
  contextHints: ['专有名词'],
  timestampGranularities: ['segment', 'word'],
  vad: true,
  model: 'whisper',
})
if (result.success) {
  const text = result.data.text
  const language = result.data.language // 实际检测语言
  const words = result.data.segments?.[0]?.words // 词级时间轴（毫秒整数）
}

// 说话人 / 风格参考合成（IndexTTS）：speakerReference 表达“谁在说”，styleReference 表达“怎么说”
const cloned = await ai.audio.synthesize({
  text: '我们下午三点出发。',
  language: 'zh',
  model: 'indextts',
  speakerReference: { audio: speakerWav, language: 'ja' },
  styleReference: { audio: styleWav },
  styleStrength: 0.8,
  targetDurationMs: 3280, // 目标时长（与 speed 互斥），metadata.durationMatched 反馈是否达标
  durationToleranceMs: 120,
})

// 实时识别（持续音频输入 → 领域事件流：speech_started / transcript / speech_stopped）
for await (const event of ai.audio.transcribeStream({
  audio: { chunks: microphoneChunks, format: 'pcm16', sampleRate: 16000 },
})) {
  if (event.type === 'speech_started')
    onSpeechStart() // 支持服务端 VAD 的平台会在检测到说话时立即产出，可据此取消上游生成
  else if (event.type === 'transcript')
    updateTranscript(event.text, event.final)
}

// 流式合成：调用方为文本段分配稳定 ID，事件可精确关联文本与音频；signal 可随时打断
const controller = new AbortController()
for await (const event of ai.audio.synthesizeStream({
  text: { id: 'answer-1', text: '欢迎参加访谈。' },
  voice: 'Cherry',
  instruction: '用轻快的语气',
  signal: controller.signal,
})) {
  if (event.type === 'segment_started')
    prepareDecoder(event.format, event.sampleRate, event.channels) // 真实输出格式来自服务端解析后的 Provider 输出
  else if (event.type === 'audio')
    await player.write(event.data)
  else if (event.type === 'segment_done')
    markSegmentReadyToCommit(event.segmentId)
}

// 实时会话启动前按操作校验模型能力
const caps = ai.audio.getCapabilities({ operation: 'synthesize', model: 'tts' })
if (caps.success && caps.data.synthesize?.streamingAudioOutput) { /* 可实时 TTS */ }
```

`ai.audio.synthesize` 返回统一的 `AudioContent` 字节。需要通过 API 返回浏览器可播放的 Base64 负载时，使用 `serializePlayableAudio(result.data)`；该函数会将 `pcm16` 补齐为 WAV 容器，并透传 WAV/MP3：

```ts
import { serializePlayableAudio } from '@h-ai/ai'

const synthesized = await ai.audio.synthesize({ text: '欢迎参加访谈。', voice: 'Cherry' })
if (!synthesized.success)
  return synthesized

const playable = serializePlayableAudio(synthesized.data)
if (!playable.success)
  return playable

return playable.data
```

`OptionalSecretSchema` 统一用于 LLM、Audio 与 Image 的可选密钥字段：YAML `null`、空字符串和纯空白字符串都会规范化为 `undefined`。语音密钥优先级为模型条目 `apiKey` → 启用继承后的 LLM `apiKey` → 对应平台环境变量；`inheritLlmApiKey` 默认关闭，避免跨供应商误用密钥。

> `synthesizeStream` 严格按 `segment_started → audio* → segment_done` 产出事件。`segment_started` 携带服务端解析 Provider 后的**真实输出音频参数**（`format` / `sampleRate` / `channels`），播放器据此正确解码，不应按请求参数猜测格式。播放器只有在对应音频真正播放完成后才应把该段文本计入 `spokenText`；播放状态仍由应用管理。

取消/超时/连接错误统一为领域错误：`AbortSignal` 触发 → `AUDIO_CANCELLED`（超时 → `AUDIO_TIMEOUT`），连接失败或 `end` 前异常断连 → `AUDIO_CONNECTION_FAILED`。实时连接时长受 `audio.maxStreamDurationMs`（默认 5 分钟）限制。

浏览器 / 移动端通过 `@h-ai/serv` 暴露的统一语音 WebSocket 入口访问，`@h-ai/ai/client` 提供与 Node 端一致的 `audio.*` API（传输细节内部隐藏）。浏览器客户端严格区分正常结束、取消（`AUDIO_CANCELLED`）与异常断连（`AUDIO_CONNECTION_FAILED`）：取消或在 `end` 前断连会抛出对应领域错误码，`synthesize` 不会把未完成的部分音频当作成功结果返回。

IndexTTS 的 Node HTTP 请求使用同版本 Undici fetch/Agent 与 multipart 类型，避免混用 Node 内置 fetch 的调度器协议；模型 `timeout` 覆盖响应头与正文等待。主动取消返回 `AUDIO_CANCELLED`，超时返回 `AUDIO_TIMEOUT`，成功、失败和取消均关闭独立连接；按段流式降级仍在迭代时抛出领域错误。

> 自托管模型服务（faster-whisper / IndexTTS / Qwen3-4B 的 CPU/GPU Docker 镜像、权重下载与离线打包）见 [`models/`](./models/README.md)。镜像与权重下载优先使用 ModelScope，自动回退 HuggingFace 镜像。

#### 文生图（Image）

在 `ai.init()` 注册模型后，调用方只接收标准化图片字节，不感知厂商 Base64、内联数据或临时 URL：

```ts
await ai.init({
  image: {
    models: [
      { id: 'image', provider: 'openai', model: 'gpt-image-2' },
      { id: 'free', provider: 'pollinations', model: 'zimage' },
    ],
    generateModel: 'image',
  },
})

const result = await ai.image.generate({
  prompt: '一个正在构建开源框架的友好机器人',
  size: { width: 1024, height: 1024 },
  referenceImages: [
    { data: await readImage('character.png'), mimeType: 'image/png' },
  ],
})
if (result.success) {
  const { data, mimeType } = result.data.images[0]!
  await saveImage(data, mimeType)
}
```

`referenceImages` 可省略；公共层只接受图片字节与 MIME，multipart、`inlineData`、Data URL 等差异由 Provider 转换。凭据可在模型条目传入，或使用 `HAI_AI_IMAGE_<PROVIDER>_APIKEY` / 厂商环境变量。Qwen 与 Seedream 返回的临时 URL 会在 Provider 内立即下载，不会泄漏到公共返回值。完整接口差异与模型说明见 [REFERENCE.md](./REFERENCE.md#image)。

图片下载只允许无凭证、默认 443 端口的公网 HTTPS，每次 socket DNS 解析校验全部地址并直接使用该批地址；阻止 IPv4/IPv6 私网、回环、链路本地、映射/转换及保留地址，重定向最多 3 次且每跳重新校验。下载使用独立连接，不传递厂商认证头或应用 Cookie。`baseUrl` 是可信运维配置，厂商 API 请求拒绝重定向。

`image.maxImageBytes` 默认 20971520（20 MiB，最大 100 MiB），限制单张输出和参考图；`image.maxImages` 默认 4（最大 16），限制输出与参考图数量，临时 URL 串行下载。实际读取（含解压后）超过上限立即取消；JSON 响应最多 `max(64 KiB, 2 × maxImageBytes)`，错误正文最多 64 KiB。模型 `timeout` 默认 120000ms，覆盖厂商请求、重定向和全部下载；`signal` 可取消整个过程。输出仅支持 PNG/JPEG/GIF/WebP 的 MIME 与魔数匹配，拒绝 SVG；魔数校验不等于完整图片解码或尺寸核验。拒绝地址、超限、超时分别返回 `IMAGE_DOWNLOAD_BLOCKED`、`IMAGE_TOO_LARGE`、`IMAGE_TIMEOUT`，调用方须先检查 success。

#### 文件解析（File）

向 `ai.file.parse({ content, filename, options: { outputFormat: 'markdown' } })` 传入业务文件内容和名称；先检查 `success`，再读取 `data.text`，纯文本输出选择 `outputFormat: 'text'`。HTML 使用 parse5 解析结构并迭代提取，忽略 script/style，保留标题、列表、链接、图片、引用、代码和表格等常见 Markdown 结构，不以截断正常文档规避畸形标签的正则回溯。

结果是文本或 Markdown，不是可信 HTML；界面使用文本绑定或框架的 `MarkdownRenderer`，不要直接交给 `{@html}`。配置、调用参数和错误码保持原有契约。

#### Context 管理器

自动记忆提取在本节点后台运行；`pendingMemoryTasks=0` 不代表全部成功。`flush()` 等待本批任务，异常和失败 HaiResult 都返回 `MEMORY_EXTRACT_FAILED`（含失败数量），同轮并发观察者共享结果。返回即确认该批报告，后续只观察新任务，不自动重放可能部分完成的提取。`save()`、`reset({ waitForMemoryTasks: true })`、`consolidate()` 遇到该失败立即返回，不继续后续状态或记忆写入。进程崩溃后的外部效果仍须人工核对。

`scope: { objectId, sessionId }` 必填。相同 scope 的所有节点共用一条版本记录，原子保存消息、摘要、生成 owner、轮次及待提交状态；`addMessage`、每个对外流式 delta 和最终提交即时持久化，`save()` 只刷新共享快照、等待本节点记忆任务并同步会话目录。`getMessages/getTurns/getSummaries/getTokenUsage` 返回最近一次成功读写的独立快照；跨节点读取前调用 `await manager.reload()` 或 `restoreManager()`。

并发限制按共享 scope 生效；`reject` 立即返回忙，`queue` 可取消地轮询（不承诺 FIFO）。生成租约为存储端时钟 30 秒，每 10 秒续租，最终写入同时校验版本、owner 和期限。失联生成过期后由下一次操作标为 interrupted，保留生成记录，不自动重放 LLM、工具或记忆提取。manual 的 pending 不自动过期，可在另一节点/重启后按同一 turnId 提交；相同终态与文本重复提交幂等，不同内容拒绝。外部工具/LLM/后台记忆不与上下文跨系统原子提交，进程失联后须核对未知副作用，不能据此承诺外部恰好一次。`reset` 更换共享纪元；`removeSession` 清空正文并保留永久墓碑，同一 scope 不复用，旧节点不能重建。

自定义 `AIRelStore` 必须提供 `readVersioned`、`compareAndSwap` 和存储端 `currentTime`；普通 save/saveMany 也要更换不可复用版本。CAS 的 `expectedVersion: undefined` 仅创建，`notAfter` 在最终写入以存储时钟严格检查，冲突/截止返回 undefined，存储故障抛错。默认 PostgreSQL/MySQL/SQLite 实现均执行这些条件；SQLite 仅供开发/测试，生产使用 PostgreSQL/MySQL。新 schema 含 version 列，不提供旧表自动迁移。

```ts
const manager = ai.context.createManager({
  scope: { objectId: 'user-001', sessionId: 'sess-001' },
  compress: { auto: true, strategy: 'hybrid', maxTokens: 8000 },
  memory: { enable: true, enableExtract: true },
  concurrency: 'reject', // 单活动生成（默认）：活动生成期间的新 chat 返回 CONTEXT_BUSY；'queue' 则排队
})
if (manager.success) {
  const reply = await manager.data.chat('你好')
  const saved = await manager.data.save()
  if (!saved.success)
    return saved
  // reset 生命周期完整：终止活动生成、清空消息/摘要/轮次，默认保留系统提示词
  await manager.data.reset() // 可传 { preserveSystemPrompt, cancelActiveTurn, waitForMemoryTasks }
}
```

同一 scope 默认实行**跨节点单活动生成**，避免「上一轮 AI 尚未退出，下一轮 user 消息先写入」导致的消息乱序；`reset()` 现为异步并会终止活动生成、释放并发屏障、清空轮次并默认重新写入 Persona/System Prompt。

##### 真实对话状态（Conversation Commit Layer）

默认（`turnCommit: 'auto'`）下，`chat` / `chatStream` 会把**模型生成的完整文本**写入上下文。但在「模型生成 → TTS 合成 → 实际播放」链路中，AI 可能说到一半就被打断——此时进入下一轮所有参与者可见的对话状态，应当是**实际播放出去的部分**，而非模型本想说完的全文。

设置 `turnCommit: 'manual'` 后，生成结果不会自动写入上下文，而是返回一个 `turnId`；由调用方在确定「实际发生了什么」后显式提交真实文本。

`chatStream` 在**调用上游模型前**就登记轮次并产出 `turn_started`（事件序列 `turn_started → delta* → done`，中途取消时 `turn_started → delta* → cancelled`）。因此即使生成到一半被 `AbortSignal` 取消，也能拿到 `turnId` 与已生成文本，用真实内容提交：

```ts
const created = ai.context.createManager({
  scope: { objectId: 'user-001', sessionId: 'sess-001' },
  turnCommit: 'manual'
})
if (!created.success)
  return created
const m = created.data
const controller = new AbortController()

for await (const ev of m.chatStream('请展开讲讲', { signal: controller.signal })) {
  if (ev.type === 'turn_started') {
    await m.markTurnSpeaking(ev.turnId) // 可选：标记进入播放
  }
  else if (ev.type === 'delta') {
    feedTts(ev.text) // 边生成边合成播放
  }
  else if (ev.type === 'done') {
    await m.commitTurn(ev.turnId) // 完整提交
  }
  else if (ev.type === 'cancelled') {
    // 生成被 controller.abort() 取消：轮次保留，只提交实际播放出去的部分
    await m.interruptTurn(ev.turnId, { text: actuallySpokenText })
  }
}

// 观测每一轮的 generated / committed / status
const turns = m.getTurns()
```

- `commitTurn(turnId, { text? })` — 提交真实文本（缺省用完整生成文本），状态转 `completed`。
- `interruptTurn(turnId, { text? })` — 只写入实际表达出去的部分（缺省视为未表达，不写入），状态转 `interrupted`。
- 只有 `committed` 的内容进入上下文与记忆提取；未提交/被打断丢弃的部分不会污染后续轮次。
- 若轮次在流完成前已被 `interruptTurn` 打断（如主持人抢话，同时上游模型恰好正常结束），`chatStream` **不会再产出 `done`**，避免业务层误判为正常完成后继续提交文本。

##### 会话固化（Memory 生命周期）

会话进行中，每轮对话按 `scope: { sessionId }` 提取**短期会话记忆**；会话结束时用 `consolidate()`
把「短期记忆 + 摘要」沉淀为**跨会话长期记忆**，形成 `Session Memory → Summary → Long-term Memory` 闭环：

```ts
// 会话结束时固化：整合摘要 → 提取长期记忆（写入不含 sessionId 的持久作用域）
const created = ai.context.createManager({
  scope: { objectId: 'user-001', sessionId: 'sess-001' }
})
if (!created.success)
  return created
const result = await created.data.consolidate({
  scope: { userId: 'user-001', personaId: 'xiaoq' }
})
if (result.success) {
  // result.data.summary  —— 本次会话整合摘要
  // result.data.memories —— 固化到长期记忆的条目
}
```

#### Persona（AI 角色人格）

Memory 用 `objectId` / `scope` 回答「谁的记忆」；Persona 回答「AI 是谁」——为每个 AI 角色定义
稳定的系统提示词与性格特征，并通过 `scope: { personaId }` 关联其长期记忆：

```ts
await ai.persona.save({
  id: 'xiaoq',
  name: '小Q',
  systemPrompt: '你是一位经济学家，善于从长期视角分析问题。',
  traits: ['数据驱动', '偏好引用真实案例'],
})

// 组合出可直接喂给 ContextManager 的系统提示词（systemPrompt + traits）
const composed = await ai.persona.compose('xiaoq')
if (!composed.success)
  return composed
const manager = ai.context.createManager({
  scope: { objectId: 'user-001', sessionId: 'persona-session' },
  systemPrompt: composed.data,
  memory: {
    enable: true,
    enableExtract: true,
    scope: { personaId: 'xiaoq' }
  },
})
```

`ai.persona` 提供 `save` / `get` / `update` / `remove` / `list` / `compose`，按 `[objectId, id]` 隔离角色。保存时传 `objectId`，其余操作传 `{ objectId }`；省略时访问 `system` 平台角色。租户业务应绑定可信认证主体，不能把客户端传入的角色 ID 当作授权。

### 安全边界

- Prompt、检索文档和模型输出都按不可信输入处理；不要把用户内容拼进不可覆盖的系统规则。
- Zod 只校验工具参数形状，不代表调用者有权限。高权限工具必须在 handler 内再次校验身份、租户、资源归属与配额，并只把允许自动执行的工具注册给模型。
- `callRemoteAgent()` 是独立客户端能力，只依赖 `ai.init()`，不要求配置 Agent Card 或注册本地 executor。它拒绝非 HTTP(S) 和 URL 内嵌凭据，但应用仍必须对远端 origin 配置白名单，并在出口代理处限制 DNS 重绑定、重定向到私网和云元数据地址。
- 不记录完整 Prompt、工具参数、A2A headers、临时模型凭据或带 query 的远端 URL；确需审计时仅保存脱敏摘要。

### 返回句柄的用法

`registry` 来自 `ai.tools.createRegistry()`；`manager` 来自 `ai.context.createManager/restoreManager` 成功后的 data；`session` 来自受管 ACP sessions.create/get/resume 的 data，`connection` 来自 `ai.acp.connect` 的 data。每种句柄只在自己的生命周期及授权范围内使用。scoped Memory 的十个方法与上表同名，主体/作用域已由工厂绑定，不再接受 objectId/scope 覆盖。

| 入口                       | 场景               | 输入                                                       | 输出                                                                   | 调用片段                                                 |
| -------------------------- | ------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| `registry.register`        | 登记单个工具       | `Tool`                                                     | `HaiResult<void>; duplicate rejected`                                  | `registry.register(tool)`                                |
| `registry.registerMany`    | 批量登记工具       | `Tool[]`                                                   | `HaiResult<void>`                                                      | `registry.registerMany(tools)`                           |
| `registry.replace`         | 显式替换工具       | `Tool with existing name`                                  | `HaiResult<void>`                                                      | `registry.replace(tool)`                                 |
| `registry.unregister`      | 移除工具           | `tool name`                                                | `boolean`                                                              | `registry.unregister("search")`                          |
| `registry.get`             | 读取工具定义       | `tool name`                                                | `Tool or undefined`                                                    | `registry.get("search")`                                 |
| `registry.has`             | 检查工具存在       | `tool name`                                                | `boolean`                                                              | `registry.has("search")`                                 |
| `registry.getNames`        | 工具名称           | `none`                                                     | `string[]`                                                             | `registry.getNames()`                                    |
| `registry.getDefinitions`  | 传给模型的定义     | `none`                                                     | `ToolDefinition[]`                                                     | `registry.getDefinitions()`                              |
| `registry.execute`         | 授权后执行工具     | `ToolCall, ToolExecutionOptions?`                          | `Promise<HaiResult<ToolMessage>>`                                      | `registry.execute(toolCall, { objectId: "u1" })`         |
| `registry.executeAll`      | 逐个或显式并行执行 | `ToolCall[], { parallel?, ...executionOptions }`           | `Promise<HaiResult<ToolMessage[]>>`                                    | `registry.executeAll(toolCalls)`                         |
| `registry.clear`           | 清理本地工具       | `none`                                                     | `void`                                                                 | `registry.clear()`                                       |
| `registry.size`            | 工具数量           | `none`                                                     | `number`                                                               | `registry.size`                                          |
| `manager.addMessage`       | 补充对话消息       | `ChatMessage`                                              | `Promise<HaiResult<void>>`                                             | `manager.addMessage({ role: "user", content: "你好" })`  |
| `manager.getMessages`      | 读取对话快照       | `none`                                                     | `HaiResult<ChatMessage[]>`                                             | `manager.getMessages()`                                  |
| `manager.reload`           | 刷新共享快照       | `none`                                                     | `Promise<HaiResult<void>>`                                             | `manager.reload()`                                       |
| `manager.getTokenUsage`    | 观察上下文预算     | `none`                                                     | `HaiResult<{ current, budget }>`                                       | `manager.getTokenUsage()`                                |
| `manager.getSummaries`     | 读取摘要           | `none`                                                     | `HaiResult<SummaryResult[]>`                                           | `manager.getSummaries()`                                 |
| `manager.save`             | 持久保存           | `none`                                                     | `Promise<HaiResult<void>>`                                             | `manager.save()`                                         |
| `manager.flush`            | 等待后台记忆写入   | `none`                                                     | `Promise<HaiResult<void>>`                                             | `manager.flush()`                                        |
| `manager.reset`            | 终止并重置对话     | `ContextResetOptions?`                                     | `Promise<HaiResult<void>>`                                             | `manager.reset({ preserveSystemPrompt: true })`          |
| `manager.getTurns`         | 读取真实轮次       | `none`                                                     | `HaiResult<ConversationTurn[]>`                                        | `manager.getTurns()`                                     |
| `manager.markTurnSpeaking` | 记录开始播放       | `turnId`                                                   | `Promise<HaiResult<void>>`                                             | `manager.markTurnSpeaking(turnId)`                       |
| `manager.commitTurn`       | 提交已表达内容     | `turnId, { text? }`                                        | `Promise<HaiResult<void>>`                                             | `manager.commitTurn(turnId, { text: spokenText })`       |
| `manager.interruptTurn`    | 提交打断前内容     | `turnId, { text? }`                                        | `Promise<HaiResult<void>>`                                             | `manager.interruptTurn(turnId, { text: spokenText })`    |
| `manager.consolidate`      | 固化长期记忆       | `ConsolidateOptions?`                                      | `Promise<HaiResult<{ summary, memories }>>`                            | `manager.consolidate({ scope: { personaId: "tutor" } })` |
| `manager.chat`             | 多轮回答           | `message: string, ContextChatOptions?`                     | `Promise<HaiResult<ContextChatResult>>`                                | `manager.chat("请继续")`                                 |
| `manager.chatStream`       | 多轮流式回答       | `message: string, ContextChatOptions?`                     | `AsyncIterable<ContextStreamEvent>`                                    | `manager.chatStream("请继续")`                           |
| `session.info`             | 读取受管会话       | `none`                                                     | `Promise<HaiResult<ACPSessionInfo>>`                                   | `session.info()`                                         |
| `session.prompt`           | 执行一轮开发       | `ContentBlock[], AbortSignal?`                             | `Promise<HaiResult<{ text, stopReason, events }>>`                     | `session.prompt([{ type: "text", text: "检查工程" }])`   |
| `session.promptStructured` | 校验一份 JSON      | `ContentBlock[], Zod schema, AbortSignal?`                 | `Promise<HaiResult<schema-inferred T>>`                                | `session.promptStructured(content, OutputSchema)`        |
| `session.stream`           | 观察原生事件       | `ContentBlock[], AbortSignal?`                             | `AsyncIterable<SessionNotification>; failure throws`                   | `session.stream([{ type: "text", text: "检查工程" }])`   |
| `session.cancel`           | 取消当前轮次       | `none`                                                     | `Promise<HaiResult<void>>`                                             | `session.cancel()`                                       |
| `session.setMode`          | 选择已公布模式     | `native mode ID`                                           | `Promise<HaiResult<native mode response>>`                             | `session.setMode("code")`                                |
| `session.setConfigOption`  | 设置已公布选项     | `native option key and allowed value`                      | `Promise<HaiResult<native config response>>`                           | `session.setConfigOption("model", "coding")`             |
| `session.updateMain`       | 仅快进更新主分支   | `none; execution and preview must be stopped`              | `Promise<HaiResult<ACPGitReport[]>>; partial failure reports in cause` | `session.updateMain()`                                   |
| `session.publish`          | 提交并推送         | `{ mode, message, author }; managed isolated session only` | `Promise<HaiResult<ACPGitReport[]>>`                                   | `session.publish(publishOptions)`                        |
| `session.close`            | 停止执行保留状态   | `none`                                                     | `Promise<HaiResult<void>>`                                             | `session.close()`                                        |
| `connection.authenticate`  | 原生认证           | `advertised authentication method ID`                      | `Promise<HaiResult<native auth response>>`                             | `connection.authenticate("api-key")`                     |
| `connection.createSession` | 创建低层原生会话   | `absolute remote cwd, McpServer[]?`                        | `Promise<HaiResult<{ id, prompt, cancel }>>`                           | `connection.createSession("/workspace/project", [])`     |
| `connection.listSessions`  | 原生分页会话       | `cursor?`                                                  | `Promise<HaiResult<native paginated response>>`                        | `connection.listSessions()`                              |
| `connection.deleteSession` | 删除原生会话       | `native session ID`                                        | `Promise<HaiResult<native delete response>>`                           | `connection.deleteSession(nativeId)`                     |
| `connection.close`         | 关闭低层连接       | `none`                                                     | `Promise<HaiResult<void>>`                                             | `connection.close()`                                     |

## 配置

### 按场景选择配置入口

| 配置入口    | 场景               | 输入                                                                       | 生效结果                                                             | 示例                                                                                                      |
| ----------- | ------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `llm`       | 模型连接与请求协议 | model, protocol, apiKey/baseUrl, timeout, models/scenarios                 | chat/Responses/Anthropic selection; normalized model requests        | `{ llm: { model: "gpt-4o-mini", timeout: 60000 } }`                                                       |
| `embedding` | 检索向量           | model?, dimensions?, batchSize?                                            | consistent vector dimensions for the target collection               | `{ embedding: { dimensions: 1536, batchSize: 100 } }`                                                     |
| `mcp`       | 外部工具服务       | servers with transport/endpoints or commands                               | registered server definitions; application authorizes tool execution | `{ mcp: { servers: [] } }`                                                                                |
| `retrieval` | 默认信源           | sources: { id, collection, topK?, minScore?, filter? }[]                   | queryable source definitions; does not import documents              | `{ retrieval: { sources: [{ id: "docs", collection: "manual", topK: 5 }] } }`                             |
| `knowledge` | 文档发布与分块     | collection, dimension, cleanOptions, chunkOptions                          | versioned document/vector publication and bounded chunks             | `{ knowledge: { collection: "manual", dimension: 1536, chunkOptions: { maxSize: 1500, overlap: 200 } } }` |
| `memory`    | 主体记忆后端和预算 | provider, quotas, recencyDecay, defaultTopK, candidateMultiplier           | native or Mem0-format behavior with explicit persistence limits      | `{ memory: { provider: "native", defaultTopK: 10 } }`                                                     |
| `token`     | Token 估算         | tokenRatio > 0; default 0.25                                               | local token budget estimates; not provider billing usage             | `{ token: { tokenRatio: 0.25 } }`                                                                         |
| `summary`   | 摘要规则           | systemPrompt?                                                              | prompt used by summary generation; model from llm.scenarios          | `{ summary: { systemPrompt: "保留已确认决策和待办" } }`                                                   |
| `compress`  | 上下文压缩预算     | defaultStrategy, defaultMaxTokens, preserveLastN                           | compression defaults; 0 budget derives from model limit              | `{ compress: { defaultStrategy: "hybrid", defaultMaxTokens: 4000, preserveLastN: 4 } }`                   |
| `file`      | OCR 提取规则       | systemPrompt?; model via llm.scenarios.ocr                                 | text extraction instructions; not HTML sanitization                  | `{ file: { systemPrompt: "只提取可见文字" } }`                                                            |
| `audio`     | 语音模型与容量     | models, transcribeModel/synthesizeModel, maxAudioBytes/maxStreamDurationMs | provider capability/operation selection and bounded input/stream     | `see Audio examples`                                                                                      |
| `image`     | 图像模型与下载预算 | models, generateModel, maxImageBytes, maxImages; timeout per model         | generated bytes with MIME; unsafe downloads rejected                 | `see Image examples`                                                                                      |
| `a2a`       | 代理发现与执行租约 | agentCard and execution lease/poll/deadline options                        | ProtoJSON discovery and shared task journal                          | `see A2A protocol section`                                                                                |
| `acp`       | 智能体执行约束     | agents/workspaces and execution content/event limits                       | validated definitions and managed native sessions                    | `see ACP guide`                                                                                           |

Rerank 继承全局 LLM timeout，模型条目可覆盖；同一预算覆盖请求及响应正文，超时返回 RERANK_API_ERROR。

模型请求协议通过 `llm.protocol`、`llm.models[].protocol` 或单次 `tempModel.protocol` 指定，支持 `chat | responses | anthropic`。环境变量为 `HAI_AI_LLM_PROTOCOL`、`HAI_AI_LLM_MODELS_0_PROTOCOL`（模型项按索引递增）；凭据通过 `apiKey` 或相应私有环境提供。

```yaml
llm:
  apiKey: ''
  baseUrl: https://api.openai.com/v1
  model: gpt-4o-mini
  protocol: chat # chat（默认）| responses | anthropic —— 底层 API 协议，对使用方透明
  timeout: 60000
  tempModelCacheTtl: 600000 # 临时模型客户端缓存 TTL（毫秒，默认 10 分钟）
  models: # 可为每个模型单独指定协议
    - {id: fast, model: gpt-4o-mini}
    - {id: strong, model: gpt-4.1, protocol: responses}
    - {id: claude, model: claude-3-5-sonnet-latest, protocol: anthropic}
  scenarios:
    chat: fast
    reasoning: strong
    embedding: embed

embedding:
  dimensions: 1536
  batchSize: 100

knowledge:
  collection: hai_ai_knowledge
  dimension: 1536
  cleanOptions:
    removeHtml: true
    normalizeWhitespace: true
  chunkOptions:
    mode: markdown
    maxSize: 1500
    overlap: 200

memory:
  provider: native # native | mem0
  maxEntriesPerObject: 1000 # 单主体（objectId）最大记忆条数
  maxEntriesGlobal: 100000 # 跨所有主体的全局上限
  recencyDecay: 0.95
  embeddingEnabled: true
  defaultTopK: 10
  candidateMultiplier: 5 # 候选池倍数：先取回 topK×倍数 条候选，再按 scope/重要性过滤，最后截取 topK
  writebackRelatedTopK: 20
```

通过 `core.config.load('ai', ...)` 加载时，约定环境变量优先于 YAML；
例如 `HAI_AI_LLM_APIKEY`、`HAI_AI_LLM_BASEURL`、`HAI_AI_LLM_MODEL`。

启用 Mem0 数据格式适配：

```yaml
memory:
  provider: mem0
  defaultTopK: 10
```

- **`native`（默认，推荐）**：HAI 原生引擎，复用同一套 vecdb（向量库）、reldb（关系库）、LLM 与 Embedding。`extract` 采用 **Mem0 式批量合并**——一次 LLM 调用对整批抽取事实与相关既有记忆做 ADD / UPDATE / DELETE / NONE 决策，实现增量更新、跨条去重与矛盾删除，并支持 `category` 主题标签。`maxEntriesPerObject`、`maxEntriesGlobal`、`recencyDecay`、`embeddingEnabled`、`writebackRelatedTopK` 均作用于此后端；淘汰按 `objectId` 分区触发，不会因某一主体写入过多而淘汰其他主体的记忆。native 后端的 `scope` 过滤：候选集已被 `objectId` 索引收窄（≤ `maxEntriesPerObject`），PostgreSQL 上还会把 scope 下推为 `data @> '{"scope":...}'::jsonb` 包含查询并命中 JSONB **GIN 索引**（SQLite / MySQL 退回内存匹配，结果一致）。
- **`mem0`（数据格式适配）**：框架负责提取与 Embedding，通过原生 HTTP 读写 Qdrant 的 Mem0 UUID/payload 格式，可读取既有数据；不运行完整上游引擎、遥测或历史数据库。仅映射带完整连接参数的 Qdrant。生产（`NODE_ENV` 或 `HAI_CORE_ENV=production`）拒绝临时回退；开发或明确 E2E 可显式使用 `memory.allowEphemeralFallback: true`。其它持久化后端选择 `native`。

两个 Provider 对外 `ai.memory.*` API 完全一致（`extract` / `recall` / `injectMemories` / `add` / `update` / `get` / `remove` / `list` / `listPage` / `clear`），均支持 `objectId`（主体隔离）与 `scope`（业务作用域 key-value 过滤，如 `{ topicId, personaId }`）。`recall` / `list` / `listPage` / `clear` 均按 `scope` 严格过滤，`clear` 在传入 `types` / `scope` 时仅删除同时匹配项（避免误删）。mem0 后端的 `extract` 在框架层用统一提取器完成分类与打分（honor `types` / `model` / `minImportance` / `systemPrompt`）后直接写入格式存储，保留 `hai_type` / `hai_importance`；`recall` 同样支持 `types` 过滤与 `recencyWeight` 时间衰减——二者行为与 native 一致。Mem0 的 `update` 原地修改文本与元数据，保持 `id` 和创建时间。候选扫描有界：`list` / `listPage` / 条件 `clear` 最多支持每主体 1000 条原始候选（含过期条目），多取一条探测完整性；超限返回 `MEMORY_LIST_INCOMPLETE`（906），不会伪造 total 或执行部分条件删除。候选完整时按 UTC 日期剔除过期项，再按类型/scope 过滤和分页；仅 `objectId` 的清理使用后端过滤删除，不受列表上限限制。公共空条件清理被拒绝；跨主体全清仅限受信管理员显式 `admin.clearAll({ confirm: true })`。

Mem0 格式存储与 VecDB 的 Qdrant Provider 均使用原生 HTTP，无需额外 SDK。固定 REST 请求使用 `query`，路径段编码；30 秒超时覆盖完整响应体，响应超过 16 MiB 明确失败。写入和删除等待 `wait=true` 的实际完成回执。列表和条件清理最多核对每主体 1000 条原始候选（包括过期项），超限返回 `MEMORY_LIST_INCOMPLETE`，不执行部分条件删除；仅按主体清理不受此列表上限限制。

Qdrant 格式后端要求 1.19 或更新版本，并拒绝 HTTP 重定向。更新使用服务端 `update_only` 与主体/版本条件，同一次原子写入拒绝已删除或已被其它写入更新的条目；迟到更新不会复活删除记录。写后版本核对失败仍需按已有回执核对实际效果。

`add` / `extract` 的写入回执不含完整业务字段，框架写后读取权威记录再返回；并发提取等待全部在途写入结束。若写入或写后读失败，`error.ext.requiresEffectReconciliation=true`，`memoryIds` 保存已知写入 ID（回执丢失时可能为空）。应按主体核对实际记忆后决定恢复，不能盲目重做 add/extract；框架不自动重放。

**候选池与 scope 漏召回**：`scope` 过滤在内存中完成，若先按 `topK` 截断再过滤，同一主体下相关度较高的其它主题/角色记忆会把目标 scope 的记忆挤出候选池，导致「明明有却召回 0 条」。为此 `recall` / `injectMemories` 先取回 `topK × candidateMultiplier`（默认 5）条候选，过滤后再截取 `topK`。scope 隔离越细（如按 `topicId` + `personaId`），可将 `candidateMultiplier` 调大：

```ts
const memories = await ai.memory.recall('经济发展', {
  objectId: 'user-001',
  scope: { topicId: 'C' },
  topK: 10,
  candidateMultiplier: 8, // 覆盖配置默认值，扩大候选池
})
```

`ai.config` 返回脱敏后的配置快照；`apiKey`、`privateKey`、URL 内嵌凭证等敏感字段不会原样暴露。

原生记忆新增使用共享关系库事务串行检查主体与全局配额。淘汰每次最多读取最旧 64 条候选并按重要性和时效评分。旧库超过配额时，新写入会先回收一批，直到有余量。自定义共享 Store 可实现 `AIRelStore.withWriteLock` 提供同样的跨节点保证。

## 错误处理

```ts
const result = await ai.llm.chat({ messages })
if (!result.success) {
  switch (result.error.code) {
    case HaiAIError.NOT_INITIALIZED.code:
      // 先调用 ai.init()
      break
    case HaiAIError.API_ERROR.code:
      // 上游模型服务失败，可重试或降级
      break
  }
}
```

常见错误段位：

- `hai:ai:010-012`：初始化/配置。
- `hai:ai:100-107`：LLM 与历史记录。
- `hai:ai:300-302`：Embedding。
- `hai:ai:600-701`：Retrieval/RAG。
- `hai:ai:800-805`：Knowledge。
- `hai:ai:050-059`：Audio。
- `hai:ai:060-068`：Image，含下载地址拒绝、资源超限与总超时。
- `hai:ai:900-906`：Memory。
- `hai:ai:980-984`：A2A。

## 开发测试

```bash
pnpm --filter @h-ai/ai typecheck
pnpm --filter @h-ai/ai lint
pnpm --filter @h-ai/ai test
pnpm --filter @h-ai/ai build
```

源码 JSDoc 的公开示例从实际包入口导入，内部工厂示例标记“模块内部上下文”，分别按真实声明编译。根目录执行 `pnpm check:jsdoc --package ai` 核验覆盖与示例类型；普通业务方法检查 HaiResult，流式与浏览器 AudioClient 保留显式抛错契约。

## 许可证

Apache-2.0
