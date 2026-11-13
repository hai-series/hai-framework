# @h-ai/ai

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/api-contract](../api-contract/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/datapipe](../datapipe/README.en.md) · [@h-ai/reldb](../reldb/README.en.md) · [@h-ai/vecdb](../vecdb/README.en.md)

AI capabilities through a unified `ai` service: LLM chat, image generation, tools, MCP, embeddings, memory, retrieval/RAG, knowledge bases, context management, file parsing, reranking, audio (ASR/TTS), and A2A. Initialize with `ai.init()` on Node.js; browsers access it through APIs/clients.

## Quick Start

`ai.close()` waits for an initialization already in progress and then cleans up; concurrent closes share one operation. Reinitialization first cleans up the previous instance, and new initialization is rejected while closing.

### Development LLM-only (no database dependencies)

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

Development/explicit tests without initialized reldb/vecdb use a temporary process store, lost on close, exit, or instance switching. When either `NODE_ENV` or `HAI_CORE_ENV` is production, temporary stores, SQLite and local vector backends fail initialization. Initialize shared RelDB and network vecdb first, or supply a shared provider with equivalent atomic guarantees.

## Features

### Purpose, inputs and outputs

Unless marked direct, AsyncIterable or a direct Promise value, the output column describes HaiResult.data after success has been checked. Provide named request/definition/options variables using the stated real input type. Streams and explicitly throwing helpers need error handling at the consumer boundary.

Call fragments reuse the initialized service from this page. Named variables stand for application-provided requests, schemas, resource definitions or options. Follow the corresponding examples for setup and failure handling. Check HaiResult.success and await asynchronous calls.

| Entry                             | Use case                               | Input                                                                             | Output                                                                    | Call fragment                                                                             |
| --------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `ai.llm.chat`                     | Single answer                          | `ChatCompletionRequest: messages, model?, signal?, tools?`                        | `ChatCompletionResponse: choices, model, usage?`                          | `ai.llm.chat({ messages: [{ role: "user", content: "你好" }] })`                          |
| `ai.llm.chatStream`               | Stream completion                      | `same ChatCompletionRequest`                                                      | `AsyncIterable<ChatCompletionChunk>; iteration may throw`                 | `ai.llm.chatStream({ messages })`                                                         |
| `ai.llm.ask`                      | Text answer                            | `question: string, AskOptions?`                                                   | `string answer`                                                           | `ai.llm.ask("解释共享状态")`                                                              |
| `ai.llm.askStream`                | Text stream                            | `question: string, AskOptions?`                                                   | `AsyncIterable<string>`                                                   | `ai.llm.askStream("解释共享状态")`                                                        |
| `ai.llm.generateObject`           | Schema-constrained answer              | `Zod schema, messages, model?, responseFormat?, maxRepairs?, signal?`             | `schema-inferred T`                                                       | `ai.llm.generateObject({ schema: AnswerSchema, messages })`                               |
| `ai.llm.listModels`               | List models                            | `none`                                                                            | `string[] model IDs`                                                      | `ai.llm.listModels()`                                                                     |
| `ai.llm.getHistory`               | Read history                           | `{ objectId, sessionId }, { limit?, order? }?`                                    | `ChatRecord[]`                                                            | `ai.llm.getHistory({ objectId: "u1", sessionId: "s1" })`                                  |
| `ai.llm.listSessions`             | Subject sessions                       | `objectId: string`                                                                | `SessionInfo[]`                                                           | `ai.llm.listSessions("u1")`                                                               |
| `ai.tools.define`                 | Define a tool                          | `{ name, description, parameters: Zod schema, handler, timeoutMs? }`              | `direct Tool<TInput,TOutput>; no init required`                           | `ai.tools.define(toolDefinition)`                                                         |
| `ai.tools.createRegistry`         | Create tool registry                   | `{ authorize? }?`                                                                 | `direct ToolRegistryOperations; no init required`                         | `ai.tools.createRegistry({ authorize })`                                                  |
| `ai.stream.createProcessor`       | Accumulate chunks                      | `none`                                                                            | `direct StreamProcessor`                                                  | `ai.stream.createProcessor()`                                                             |
| `ai.stream.collect`               | Consume a chat stream                  | `AsyncIterable<ChatCompletionChunk>`                                              | `Promise<StreamResult>; stream failure rejects`                           | `ai.stream.collect(ai.llm.chatStream({ messages }))`                                      |
| `ai.stream.createSSEDecoder`      | Decode split SSE                       | `none`                                                                            | `direct SSEDecoder with decode/reset`                                     | `ai.stream.createSSEDecoder()`                                                            |
| `ai.stream.encodeSSE`             | Encode SSE                             | `SSEEvent: data, event?, id?, retry?`                                             | `direct string; invalid metadata throws`                                  | `ai.stream.encodeSSE({ data: "Hello" })`                                                  |
| `ai.embedding.embed`              | Embedding request                      | `EmbeddingRequest with input/model?`                                              | `EmbeddingResponse`                                                       | `ai.embedding.embed({ input: "产品说明" })`                                               |
| `ai.embedding.embedText`          | Embed one text                         | `text: string`                                                                    | `number[]`                                                                | `ai.embedding.embedText("产品说明")`                                                      |
| `ai.embedding.embedBatch`         | Embed many texts                       | `texts: string[]`                                                                 | `number[][] in input order`                                               | `ai.embedding.embedBatch(["简介", "部署"])`                                               |
| `ai.mcp.registerTool`             | Register local tool                    | `MCPToolDefinition, typed handler`                                                | `void`                                                                    | `ai.mcp.registerTool(mcpToolDefinition, toolHandler)`                                     |
| `ai.mcp.registerResource`         | Register resource                      | `MCPResource, async content handler`                                              | `void`                                                                    | `ai.mcp.registerResource(resourceDefinition, readContent)`                                |
| `ai.mcp.registerPrompt`           | Register prompt                        | `MCPPrompt, args => Promise<MCPPromptMessage[]>`                                  | `void`                                                                    | `ai.mcp.registerPrompt(promptDefinition, buildMessages)`                                  |
| `ai.mcp.callTool`                 | Call local tool                        | `name, arguments, MCPContext?`                                                    | `unknown tool result`                                                     | `ai.mcp.callTool("search", { query: "配置" })`                                            |
| `ai.mcp.readResource`             | Read resource                          | `resource URI`                                                                    | `MCPResourceContent with exactly text or blob`                            | `ai.mcp.readResource("docs://intro")`                                                     |
| `ai.mcp.getPrompt`                | Build prompt                           | `name, Record<string,string> arguments`                                           | `MCPPromptMessage[]`                                                      | `ai.mcp.getPrompt("review", { topic: "API" })`                                            |
| `ai.mcp.services.invoke`          | Call an authorized remote tool         | Request, authenticated principal, and authorization function                      | `HaiResult<CallToolResult>`                                               | `ai.mcp.services.invoke(request, authorization)`                                          |
| `ai.mcp.services.createBroker`    | Mount a tool endpoint for ACP sessions | Fixed URL and live authorization function                                         | `HaiResult<MCPServiceBroker>`                                             | `ai.mcp.services.createBroker(brokerOptions)`                                             |
| `ai.retrieval.addSource`          | Register source                        | `RetrievalSource: id, collection, optional metadata`                              | `void`                                                                    | `ai.retrieval.addSource({ id: "docs", collection: "manual" })`                            |
| `ai.retrieval.removeSource`       | Remove source                          | `sourceId: string`                                                                | `void`                                                                    | `ai.retrieval.removeSource("docs")`                                                       |
| `ai.retrieval.listSources`        | List sources                           | `none`                                                                            | `direct Promise<RetrievalSource[]>`                                       | `ai.retrieval.listSources()`                                                              |
| `ai.retrieval.retrieve`           | Retrieve candidates                    | `RetrievalRequest: query, sources?, topK?, minScore?, enableRerank?`              | `RetrievalResult`                                                         | `ai.retrieval.retrieve({ query: "部署" })`                                                |
| `ai.rag.query`                    | Grounded answer                        | `query: string, RagOptions?`                                                      | `RagResult: answer, context, citations, query, model`                     | `ai.rag.query("如何部署？", { sources: ["docs"] })`                                       |
| `ai.rag.queryStream`              | Grounded stream                        | `query: string, RagOptions?`                                                      | `AsyncIterable<RagStreamEvent>`                                           | `ai.rag.queryStream("如何部署？", { sources: ["docs"] })`                                 |
| `ai.knowledge.setup`              | Prepare collection                     | `KnowledgeSetupOptions?`                                                          | `void; collection ready for ingest`                                       | `ai.knowledge.setup()`                                                                    |
| `ai.knowledge.ingest`             | Publish document                       | `{ documentId, content, title?, collection?, ...metadata }`                       | `KnowledgeIngestResult with revision/cleanupPending`                      | `ai.knowledge.ingest({ documentId: "intro", content: "入门正文" })`                       |
| `ai.knowledge.ingestFile`         | Ingest a file                          | `KnowledgeIngestFileInput including file bytes and document identity`             | `KnowledgeIngestResult`                                                   | `ai.knowledge.ingestFile(fileInput)`                                                      |
| `ai.knowledge.ingestBatch`        | Ingest batch                           | `KnowledgeIngestInput[], onProgress?`                                             | `KnowledgeIngestBatchResult with per-document outcomes`                   | `ai.knowledge.ingestBatch(documentInputs, onProgress)`                                    |
| `ai.knowledge.retrieve`           | Retrieve published revision            | `query: string, KnowledgeRetrieveOptions?`                                        | `KnowledgeRetrieveResult`                                                 | `ai.knowledge.retrieve("部署说明")`                                                       |
| `ai.knowledge.ask`                | Answer from knowledge                  | `query: string, KnowledgeAskOptions?`                                             | `KnowledgeAskResult`                                                      | `ai.knowledge.ask("如何恢复备份？")`                                                      |
| `ai.knowledge.findByEntity`       | Find by entity                         | `entityName: string, EntityQueryOptions?`                                         | `EntityDocumentResult[]`                                                  | `ai.knowledge.findByEntity("订单")`                                                       |
| `ai.knowledge.listEntities`       | List entities                          | `EntityListOptions?`                                                              | `KnowledgeEntity[]`                                                       | `ai.knowledge.listEntities()`                                                             |
| `ai.knowledge.listDocuments`      | List documents                         | `KnowledgeDocumentListOptions?`                                                   | `KnowledgeDocumentInfo[]`                                                 | `ai.knowledge.listDocuments()`                                                            |
| `ai.knowledge.removeDocument`     | Remove document                        | `documentId, KnowledgeDocumentRemoveOptions?`                                     | `void; may fail after visibility revocation if cleanup fails`             | `ai.knowledge.removeDocument("intro")`                                                    |
| `ai.knowledge.repair`             | Repair cleanup                         | `{ collection?, offset?, limit? }`                                                | `KnowledgeRepairResult with progress`                                     | `ai.knowledge.repair({ offset: 0, limit: 100 })`                                          |
| `ai.knowledge.deleteCollection`   | Remove collection                      | `collection name?`                                                                | `void; cleanup tombstone remains`                                         | `ai.knowledge.deleteCollection("retired-manual")`                                         |
| `ai.memory.scoped`                | Bind trusted subject                   | `{ objectId: nonempty string, scope? }`                                           | `direct ScopedMemoryOperations; invalid binding throws TypeError`         | `ai.memory.scoped({ objectId: "u1", scope: { topicId: "orders" } })`                      |
| `ai.memory.extract`               | Extract memories                       | `ChatMessage[], { objectId, scope?, model?, signal?, ...options }`                | `MemoryEntry[]`                                                           | `ai.memory.extract(messages, { objectId: "u1" })`                                         |
| `ai.memory.add`                   | Store explicit memory                  | `MemoryEntryInput: objectId, content, type, scope?`                               | `MemoryEntry`                                                             | `ai.memory.add({ objectId: "u1", content: "偏好中文", type: "preference" })`              |
| `ai.memory.get`                   | Read owned memory                      | `memoryId, { objectId, scope? } for untrusted IDs`                                | `MemoryEntry`                                                             | `ai.memory.get(memoryId, { objectId: "u1" })`                                             |
| `ai.memory.update`                | Update memory                          | `memoryId, MemoryUpdateInput, trusted access scope`                               | `MemoryEntry`                                                             | `ai.memory.update(memoryId, { content: "偏好日文" }, { objectId: "u1" })`                 |
| `ai.memory.remove`                | Remove owned memory                    | `memoryId, trusted access scope`                                                  | `void`                                                                    | `ai.memory.remove(memoryId, { objectId: "u1" })`                                          |
| `ai.memory.recall`                | Recall memories                        | `query, { objectId, scope?, topK?, types?, ...options }`                          | `MemoryEntry[]`                                                           | `ai.memory.recall("语言偏好", { objectId: "u1" })`                                        |
| `ai.memory.injectMemories`        | Enrich messages                        | `ChatMessage[], { objectId, scope?, topK?, ...options }`                          | `ChatMessage[]`                                                           | `ai.memory.injectMemories(messages, { objectId: "u1" })`                                  |
| `ai.memory.list`                  | List memories                          | `MemoryListOptions with objectId/scope filters`                                   | `MemoryEntry[]; incomplete scan fails`                                    | `ai.memory.list({ objectId: "u1" })`                                                      |
| `ai.memory.listPage`              | Page memories                          | `MemoryListPageOptions with objectId/pagination`                                  | `StorePage<MemoryEntry>`                                                  | `ai.memory.listPage({ objectId: "u1", offset: 0, limit: 20 })`                            |
| `ai.memory.clear`                 | Clear selected scope                   | `nonempty MemoryClearOptions`                                                     | `void; empty filters are rejected`                                        | `ai.memory.clear({ objectId: "u1" })`                                                     |
| `ai.memory.admin.clearAll`        | Trusted administrator clear            | `{ confirm: true }; require host administrator authorization`                     | `void; destructive across subjects`                                       | `ai.memory.admin.clearAll({ confirm: true })`                                             |
| `ai.persona.save`                 | Save persona                           | `PersonaProfileInput: id, name, systemPrompt, objectId?, traits?`                 | `PersonaProfile`                                                          | `ai.persona.save(personaProfile)`                                                         |
| `ai.persona.get`                  | Get persona                            | `id, { objectId }?; omitted subject selects system profile`                       | `PersonaProfile`                                                          | `ai.persona.get("tutor", { objectId: "u1" })`                                             |
| `ai.persona.update`               | Update persona                         | `id, PersonaProfileUpdate, { objectId }?`                                         | `PersonaProfile`                                                          | `ai.persona.update("tutor", updates, { objectId: "u1" })`                                 |
| `ai.persona.remove`               | Remove persona                         | `id, { objectId }?`                                                               | `void`                                                                    | `ai.persona.remove("tutor", { objectId: "u1" })`                                          |
| `ai.persona.list`                 | List personas                          | `{ objectId }?`                                                                   | `PersonaProfile[]`                                                        | `ai.persona.list({ objectId: "u1" })`                                                     |
| `ai.persona.compose`              | Compose system prompt                  | `id, { objectId }?`                                                               | `string prompt`                                                           | `ai.persona.compose("tutor", { objectId: "u1" })`                                         |
| `ai.token.estimateText`           | Estimate text tokens                   | `text: string`                                                                    | `direct number; estimate, not billing usage`                              | `ai.token.estimateText("Hello 世界")`                                                     |
| `ai.token.estimateMessages`       | Estimate message tokens                | `ChatMessage[]`                                                                   | `direct number including protocol overhead`                               | `ai.token.estimateMessages(messages)`                                                     |
| `ai.summary.generate`             | Generate summary text                  | `ChatMessage[], SummaryOptions?`                                                  | `string`                                                                  | `ai.summary.generate(messages)`                                                           |
| `ai.summary.summarize`            | Summary metadata                       | `ChatMessage[], SummaryOptions?`                                                  | `{ summary, tokenCount, coveredMessages }`                                | `ai.summary.summarize(messages)`                                                          |
| `ai.compress.tryCompress`         | Compress to budget                     | `ChatMessage[], { strategy?, maxTokens?, preserveLastN?, ...options }`            | `CompressResult: messages and original/compressed token counts`           | `ai.compress.tryCompress(messages, { maxTokens: 4000 })`                                  |
| `ai.context.createManager`        | Create context                         | `ContextManagerOptions with scope { objectId, sessionId }`                        | `ContextManager`                                                          | `ai.context.createManager({ scope: { objectId: "u1", sessionId: "s1" } })`                |
| `ai.context.restoreManager`       | Restore context                        | `{ objectId, sessionId }, options?`                                               | `ContextManager`                                                          | `ai.context.restoreManager({ objectId: "u1", sessionId: "s1" })`                          |
| `ai.context.listSessions`         | List stored sessions                   | `objectId`                                                                        | `SessionInfo[]`                                                           | `ai.context.listSessions("u1")`                                                           |
| `ai.context.renameSession`        | Rename session                         | `scope, title`                                                                    | `void`                                                                    | `ai.context.renameSession({ objectId: "u1", sessionId: "s1" }, "订单讨论")`               |
| `ai.context.removeSession`        | Remove session                         | `scope`                                                                           | `void; tombstone prevents scope reuse`                                    | `ai.context.removeSession({ objectId: "u1", sessionId: "s1" })`                           |
| `ai.rerank.rerank`                | Rerank documents                       | `RerankRequest: query, documents, model?, topN?`                                  | `RerankResponse with model/results`                                       | `ai.rerank.rerank({ query: "部署", documents: ["配置说明"] })`                            |
| `ai.rerank.rerankTexts`           | Rerank texts                           | `query, string[] texts, topN?`                                                    | `RerankItem[] with index/relevanceScore`                                  | `ai.rerank.rerankTexts("部署", ["配置说明"], 1)`                                          |
| `ai.file.parse`                   | Parse a file                           | `FileParseRequest with content, filename, options?`                               | `FileParseResult; extraction is not HTML sanitization`                    | `ai.file.parse({ content: "<p>正文</p>", filename: "intro.html" })`                       |
| `ai.file.parseText`               | Extract plain text                     | `Buffer\|string content, filename?`                                               | `string`                                                                  | `ai.file.parseText("Hello", "intro.txt")`                                                 |
| `ai.reasoning.run`                | Multistep reasoning                    | `query, ReasoningOptions including strategy/tools?`                               | `ReasoningResult`                                                         | `ai.reasoning.run("审查方案", { strategy: "cot" })`                                       |
| `ai.reasoning.runStream`          | Observe reasoning stream               | `query, ReasoningOptions?`                                                        | `AsyncIterable<ReasoningStreamEvent>`                                     | `ai.reasoning.runStream("审查方案", { strategy: "react" })`                               |
| `ai.audio.transcribe`             | Transcribe audio                       | `TranscriptionRequest: audio, language?, model?, signal?`                         | `TranscriptionResult: text, language?, segments?`                         | `ai.audio.transcribe({ audio: { data: wavBytes, format: "wav" } })`                       |
| `ai.audio.transcribeStream`       | Stream transcription                   | `TranscriptionStreamRequest: chunks or complete audio`                            | `AsyncIterable<TranscriptionEvent>`                                       | `ai.audio.transcribeStream(transcriptionInput)`                                           |
| `ai.audio.synthesize`             | Synthesize audio                       | `SynthesisRequest: text, language?, model?, signal?`                              | `SynthesisResult: audio and duration metadata`                            | `ai.audio.synthesize({ text: "你好" })`                                                   |
| `ai.audio.synthesizeStream`       | Synthesize segments                    | `SynthesisStreamRequest: text segment or async segments`                          | `AsyncIterable<SynthesisEvent>`                                           | `ai.audio.synthesizeStream(synthesisInput)`                                               |
| `ai.audio.getCapabilities`        | Inspect capabilities                   | `{ operation: transcribe\|synthesize, model? }`                                   | `AudioModelCapabilities`                                                  | `ai.audio.getCapabilities({ operation: "synthesize" })`                                   |
| `ai.image.generate`               | Generate images                        | `{ prompt, referenceImages?, model?, size?, signal? }`                            | `{ images: GeneratedImage[] } with bytes/MIME`                            | `ai.image.generate({ prompt: "一座灯塔" })`                                               |
| `ai.a2a.registerExecutor`         | Register executor                      | `SDK AgentExecutor`                                                               | `void`                                                                    | `ai.a2a.registerExecutor(executor)`                                                       |
| `ai.a2a.getAgentCard`             | Agent discovery                        | `none; configured a2a card`                                                       | `A2AAgentCardDocument (A2A 1.0 ProtoJSON)`                                | `ai.a2a.getAgentCard()`                                                                   |
| `ai.a2a.handleRequest`            | Handle protocol request                | `unknown JSON-RPC body, trusted context.agentId?`                                 | `direct Promise<A2AHandleResult>; JSON-RPC/SSE outcome`                   | `ai.a2a.handleRequest(body, { agentId: trustedAgentId })`                                 |
| `ai.a2a.listMessages`             | Administrative message query           | `A2ATaskFilter: callerId?, contextId?, since?, pagination?`                       | `StorePage<A2AMessageRecord>`                                             | `ai.a2a.listMessages(messageFilter)`                                                      |
| `ai.a2a.callRemoteAgent`          | Call approved remote agent             | `allowlisted HTTPS URL, message, A2ACallOptions?`                                 | `A2ACallResult`                                                           | `ai.a2a.callRemoteAgent("https://agent.example.com/a2a", "请分析订单")`                   |
| `ai.init`                         | Initialize service                     | `AIConfigInput?, AIInitOptions?`                                                  | `HaiResult<void>; validate dependencies before use`                       | `ai.init({ llm: { apiKey: process.env.HAI_AI_LLM_APIKEY } })`                             |
| `ai.close`                        | Release service                        | `none`                                                                            | `Promise<void>; wait for cleanup`                                         | `ai.close()`                                                                              |
| `ai.config`                       | Read safe config                       | `none`                                                                            | `redacted AIConfig or null`                                               | `ai.config`                                                                               |
| `ai.isInitialized`                | Check lifecycle                        | `none`                                                                            | `boolean`                                                                 | `ai.isInitialized`                                                                        |
| `ai.llm.models.list`              | List merged definitions                | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.llm.models.list()`                                                                    |
| `ai.llm.models.get`               | Read source and version                | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.llm.models.get("coding")`                                                             |
| `ai.llm.models.register`          | Register database definition           | `ModelEntry input (id/model/protocol/credentials/capabilities)`                   | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.llm.models.register(modelDefinition)`                                                 |
| `ai.llm.models.update`            | Replace using a version                | `ModelEntry input (id/model/protocol/credentials/capabilities), expectedVersion?` | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.llm.models.update(modelDefinition, current.data.version)`                             |
| `ai.llm.models.remove`            | Remove database definition             | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.llm.models.remove("coding", current.data.version)`                                    |
| `ai.audio.models.list`            | List merged definitions                | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.audio.models.list()`                                                                  |
| `ai.audio.models.get`             | Read source and version                | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.audio.models.get("speech")`                                                           |
| `ai.audio.models.register`        | Register database definition           | `AudioModelEntry input (id/provider/model/operations)`                            | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.audio.models.register(audioModelDefinition)`                                          |
| `ai.audio.models.update`          | Replace using a version                | `AudioModelEntry input (id/provider/model/operations), expectedVersion?`          | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.audio.models.update(audioModelDefinition, current.data.version)`                      |
| `ai.audio.models.remove`          | Remove database definition             | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.audio.models.remove("speech", current.data.version)`                                  |
| `ai.image.models.list`            | List merged definitions                | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.image.models.list()`                                                                  |
| `ai.image.models.get`             | Read source and version                | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.image.models.get("poster")`                                                           |
| `ai.image.models.register`        | Register database definition           | `ImageModelEntry input (id/provider/model)`                                       | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.image.models.register(imageModelDefinition)`                                          |
| `ai.image.models.update`          | Replace using a version                | `ImageModelEntry input (id/provider/model), expectedVersion?`                     | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.image.models.update(imageModelDefinition, current.data.version)`                      |
| `ai.image.models.remove`          | Remove database definition             | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.image.models.remove("poster", current.data.version)`                                  |
| `ai.mcp.servers.list`             | List merged definitions                | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.mcp.servers.list()`                                                                   |
| `ai.mcp.servers.get`              | Read source and version                | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.mcp.servers.get("tools")`                                                             |
| `ai.mcp.servers.register`         | Register database definition           | `MCPExternalServer input (id/transport/url or command)`                           | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.mcp.servers.register(mcpServerDefinition)`                                            |
| `ai.mcp.servers.update`           | Replace using a version                | `MCPExternalServer input (id/transport/url or command), expectedVersion?`         | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.mcp.servers.update(mcpServerDefinition, current.data.version)`                        |
| `ai.mcp.servers.remove`           | Remove database definition             | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.mcp.servers.remove("tools", current.data.version)`                                    |
| `ai.retrieval.sources.list`       | List merged definitions                | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.retrieval.sources.list()`                                                             |
| `ai.retrieval.sources.get`        | Read source and version                | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.retrieval.sources.get("docs")`                                                        |
| `ai.retrieval.sources.register`   | Register database definition           | `RetrievalSource input (id/collection)`                                           | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.retrieval.sources.register(sourceDefinition)`                                         |
| `ai.retrieval.sources.update`     | Replace using a version                | `RetrievalSource input (id/collection), expectedVersion?`                         | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.retrieval.sources.update(sourceDefinition, current.data.version)`                     |
| `ai.retrieval.sources.remove`     | Remove database definition             | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.retrieval.sources.remove("docs", current.data.version)`                               |
| `ai.acp.agents.list`              | List merged definitions                | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.acp.agents.list()`                                                                    |
| `ai.acp.agents.get`               | Read source and version                | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.acp.agents.get("coder")`                                                              |
| `ai.acp.agents.register`          | Register database definition           | `ACPAgent input (id/mode/adapter/modelIds)`                                       | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.acp.agents.register(agentDefinition)`                                                 |
| `ai.acp.agents.update`            | Replace using a version                | `ACPAgent input (id/mode/adapter/modelIds), expectedVersion?`                     | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.acp.agents.update(agentDefinition, current.data.version)`                             |
| `ai.acp.agents.remove`            | Remove database definition             | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.acp.agents.remove("coder", current.data.version)`                                     |
| `ai.acp.workspaces.list`          | List merged definitions                | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.acp.workspaces.list()`                                                                |
| `ai.acp.workspaces.get`           | Read source and version                | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.acp.workspaces.get("project")`                                                        |
| `ai.acp.workspaces.register`      | Register database definition           | `ACPWorkspace input (id/storage/repositories)`                                    | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.acp.workspaces.register(workspaceDefinition)`                                         |
| `ai.acp.workspaces.update`        | Replace using a version                | `ACPWorkspace input (id/storage/repositories), expectedVersion?`                  | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.acp.workspaces.update(workspaceDefinition, current.data.version)`                     |
| `ai.acp.workspaces.remove`        | Remove database definition             | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.acp.workspaces.remove("project", current.data.version)`                               |
| `ai.acp.agents.initialize`        | Preflight agent                        | `agentId, modelId?`                                                               | `HaiResult<{ agentId, mode, modelIds }>; no credentials`                  | `ai.acp.agents.initialize("coder")`                                                       |
| `ai.acp.agents.check`             | Connect and handshake                  | `agentId, { workspaceId?, ...ACPClientOptions }`                                  | `HaiResult<native initialize response>; owned connection is closed`       | `ai.acp.agents.check("coder", { workspaceId: "project" })`                                |
| `ai.acp.workspaces.prepare`       | Prepare workspace                      | `workspaceId`                                                                     | `HaiResult<main absolute path>; dirty content is retained`                | `ai.acp.workspaces.prepare("project")`                                                    |
| `ai.acp.workspaces.importFiles`   | Import controlled files                | `workspaceId, { path: relative path, content: string\|Uint8Array }[]`             | `HaiResult<{ imported: string[] }>; no overwrite`                         | `ai.acp.workspaces.importFiles("project", [{ path: "notes.txt", content: "需求" }])`      |
| `ai.acp.sessions.create`          | Start managed session                  | `ACPCreateSessionOptions: agentId/workspaceId/newWorktree?`                       | `HaiResult<managed session handle>`                                       | `ai.acp.sessions.create({ agentId: "coder", workspaceId: "project", newWorktree: true })` |
| `ai.acp.sessions.get`             | Get session handle                     | `framework session id`                                                            | `HaiResult<managed session handle>; does not resume`                      | `ai.acp.sessions.get("task-1")`                                                           |
| `ai.acp.sessions.list`            | List managed sessions                  | `workspaceId?`                                                                    | `HaiResult<ACPSessionInfo[]>`                                             | `ai.acp.sessions.list("project")`                                                         |
| `ai.acp.sessions.resume`          | Resume native session                  | `framework session id, ACPClientOptions?`                                         | `HaiResult<managed session handle>; definition changes may reject`        | `ai.acp.sessions.resume("task-1")`                                                        |
| `ai.acp.sessions.close`           | Stop owned execution                   | `framework session id`                                                            | `HaiResult<void>; source and native history retained`                     | `ai.acp.sessions.close("task-1")`                                                         |
| `ai.acp.sessions.reclaimWorktree` | Reclaim clean worktree                 | `closed framework session id; preview stopped and changes saved`                  | `HaiResult<void>; branch and normal files retained`                       | `ai.acp.sessions.reclaimWorktree("task-1")`                                               |
| `ai.acp.sessions.remove`          | Remove session record                  | `closed or failed framework session id`                                           | `HaiResult<void>; worktree and native history retained`                   | `ai.acp.sessions.remove("task-1")`                                                        |
| `ai.acp.connect`                  | Connect native transport               | `ACPTransport: stdio/http/ws, ACPClientOptions?`                                  | `HaiResult<connection handle>`                                            | `ai.acp.connect({ type: "http", url: "https://agent.example.com/acp" })`                  |
| `ai.acp.close`                    | Close subsystem                        | `none; normally call ai.close()`                                                  | `Promise<void>; cleanup may throw`                                        | `ai.acp.close()`                                                                          |

- `ai.tools`: tool definitions, registries, and batch execution; no initialization required.
- `ai.stream`: ChatCompletion stream chunk processing; no initialization required.
- `ai.llm`: non-streaming/streaming chat, model lists, and history.
- `ai.mcp` / `createMcpServer`: an in-process MCP registry and a standalone MCP server.
- `ai.embedding`: individual/batch text embeddings.
- `ai.memory`: memory extraction, storage, recall, and injection.
- `ai.persona`: AI persona profiles (system prompts + traits) and prompt composition.
- `ai.retrieval` / `ai.rag`: multi-source vector retrieval and retrieval-augmented answers.
- `ai.knowledge`: document ingestion, entity-enhanced retrieval, and knowledge answers.
- `ai.context`: integrated sessions combining LLM + Memory + RAG + compression.
- `ai.file` / `ai.rerank`: file parsing/OCR and text reranking.
- `ai.audio`: ASR and TTS with full and streaming calls for OpenAI / MiMo / Qwen / Doubao.
- `ai.image`: OpenAI GPT Image, Google Gemini Image / Nano Banana, Qwen-Image 2.0/3.0, Seedream 4.x/5.x, and Pollinations free-quota models.
- `ai.a2a`: Agent-to-Agent request handling and remote calls.
- `@h-ai/ai/client`: standalone browser Audio WebSocket client.

`@h-ai/ai/client` exports only `createAudioClient({ url, getTicket })` and Audio client types. Use typed domain methods from `@h-ai/api-client` for HTTP. Default chat completions are non-streaming; bind application contracts for streaming and A2A. Redundant string-path clients and SSE helpers have been removed. The browser does not export the Node `ai` singleton.

- `AIStoreProvider`: storage abstraction. Production requires `stateScope: 'shared'`; the built-in provider needs initialized PostgreSQL/MySQL and a network vecdb. Development/explicit tests may use a temporary store.

For the full method list, error codes, and longer examples, see [REFERENCE.md (Chinese)](./REFERENCE.md).

### Persistent DB provider (reldb + vecdb)

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

Concurrent MySQL first startup accepts only the explicit mysql2 ER_DUP_KEYNAME/1061 error, then verifies the actual columns and order, non-unique full columns, ascending visible BTREE, and no expressions. An existing index with the wrong definition fails. The account needs table creation and INDEX privileges; metadata, permission, or other DDL failures return CONFIGURATION_ERROR from ai.init. All started DDL settles before return. MySQL DDL is not rolled back: repair privileges/schema before retrying partial initialization. Check each initialization result, reject business traffic on failure, and close AI, vecdb, and reldb in reverse order.

### Custom StoreProvider

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

### API contracts

- Public access uses the `ai` service and a few standalone factories such as `createMcpServer`.
- Lifecycle: `await ai.init(config, options?)` / `await ai.close()`; closure waits for custom `AIStoreProvider.close()`.
- Domain methods return `HaiResult<T>` or `Promise<HaiResult<T>>`, with failures expressed by `result.success === false` and `result.error.code`. Streaming `AsyncIterable`, client transports, and third-party callbacks can throw during establishment or iteration.
- `ai.tools` and `ai.stream` are pure-function subsystems usable without initialization.
- Development/tests without reldb/vecdb use temporary storage; both initialized selects DB storage. Production validates the real database/vector backend capability. Custom providers must accurately declare `stateScope`.

Inject stores through the public AIStoreProvider extension. Built-in LLM providers, factory dependencies and Context dependencies are internal. Configure model endpoints through configuration; history queries, AskOptions and ChatRecord remain public.

### API overview

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

SSE text decoding follows [WHATWG event-stream rules](https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation): split LF/CRLF/CR, multiline data, one optional space, inherited valid id/retry, default message events, and no dispatch of unfinished EOF data. encodeSSE normalizes data line endings and explicitly throws for invalid metadata. Anthropic/MiMo share an internal UTF-8 reader that cancels/releases the body on exit, cancellation, termination or failure, without reconnecting or replaying business operations. Anthropic deadlines cover the body; MiMo retains separate deadlines per HTTP request.

##### Structured output with `ai.llm.generateObject`

Choose `responseFormat` according to the model or gateway. The default, `json_schema`, sends a strict JSON Schema upstream. `schemaName` applies to that mode and defaults to `result`. Use `json_object` for Chat gateways that support generic JSON mode. The framework adds the schema to the prompt. Both modes validate locally with the same Zod schema and use `maxRepairs` for parse or validation failures, defaulting to one repair.

```ts
import { ai } from '@h-ai/ai'
import { z } from 'zod'

// AI is initialized with a text model that supports generic JSON mode.
const result = await ai.llm.generateObject({
  schema: z.object({
    title: z.string()
  }), // Require an object with a string title.
  messages: [
    { role: 'user', content: 'Suggest a title for a release checklist.' }
  ], // Input for this request.
  responseFormat: 'json_object', // Request generic JSON while keeping local Zod validation.
  maxRepairs: 1, // Allow one repair after a parse or validation failure.
})
if (result.success)
  process.stdout.write(result.data.title) // For example, Release checklist.
```

#### Tool calls

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

#### ACP agents, workspaces and sessions

`ai.acp` runs on Node: `embedded` starts a local process, `builtin-service` starts a Podman/Docker container (ready Podman first), and `custom-service` connects to a native HTTP/WS ACP service. Codex/dsh use stdio; unsupported transports are not silently bridged.

Podman does not inherit proxy variables from its remote service. Configure proxies explicitly through agent/workspace `environmentRefs`, using addresses reachable from the container.

The Goose 1.57.0 image exposes its native `goose serve` HTTP/WS `/acp` service through custom-service with `X-Secret-Key`. Goose manages its models; deployment owns workspace/state volumes. Real remote E2E verifies native resume when advertised.

- `agents.register/get/list/update/remove/initialize/check` manage definitions. The `codex` and `deepseek-harness` adapters reference `llm.models`; use `generic` or trusted `AIInitOptions.acpAdapters` for other agents. External services own their models.
- `workspaces.register/prepare/importFiles` manage directories or persistent volumes, multiple Git repositories and plain files. Every repository requires `mainBranch`; prepare preserves dirty directories.
- Use workspace `gitEnvironmentRefs` for credentials scoped to remote Git operations and agent `environmentRefs` for agent-only values. The existing workspace `environmentRefs` remains shared.
- `sessions.create/resume/get/list/close` manage native sessions. `newWorktree: true` creates matching branches from each committed local main branch. Set `repositoryId` to start and resume at a registered repository root so the agent can discover its rules and skills. Prompt, stream, strict structured output, permission callbacks, MCP, configuration and cancellation use native ACP capabilities.
- A successful `session.info()` exposes `data.workspace` for local or same-node volume previews, including after the agent closes. Stop the preview and save changes before calling `sessions.reclaimWorktree(id)` to remove the session's clean worktrees. Branches, plain files, native history and volumes are retained.
- `session.updateMain()` fetches and fast-forwards configured main branches. `publish({ mode: 'merge-main' | 'push-branch', message, author })` publishes managed isolated sessions only, with per-repository partial-failure reports and no force push. Both stop execution first; resume explicitly to continue.

Declare verified capacity, modalities and reasoning in `llm.models[].capabilities`. Codex needs native Responses; the existing Hai adapter is not a reverse gateway. Code and state persist after close. CAS ownership is released only after owned processes stop; worktrees are not security sandboxes.

For DeepSeek Harness, set `protocol: 'chat'` and `baseUrl: 'https://api.deepseek.com'` to reach the official DeepSeek Chat endpoint. An internal relay can retain the official model ID `deepseek-flash` or `deepseek-v4-pro` to apply the same settings. Harness sends instructions as `system`, uses the DeepSeek output budget field, and preserves `reasoning_content` when sending tool results. [DeepSeek Chat API](https://api-docs.deepseek.com/api/create-chat-completion/)

Build an Agent image with `minimal`, `documents`, `office`, `browser`, or `developer`. The default includes Git, Node, and the native Agent. Codex also includes bubblewrap. Register a local image ID or remote manifest digest for the execution environment. [Agent images](models/agents/README.md)

ACP runs in the Node service. Ordinary methods return HaiResult and stream failures throw. [ACP guide](../cli/templates/skills/hai-ai/acp.md)

Managed Git rejects submodules and Git LFS attributes with ACP_UNSUPPORTED instead of reporting incomplete checkouts as ready.

##### Run managed ACP for an authenticated user

Start RelDB and [Runner](../runner/README.en.md), then pass the initialized instance to `ai.init(config, { runner, acpPolicy })`. Register agents in `acp.agents`. Set `environmentIds` to pinned Runner environments and `modelIds` to entries in `llm.models`. Codex needs a Responses gateway. API and executor nodes share the database and use the same environment definitions. On shutdown, close AI, Runner, and the database in that order.

`task` starts a dedicated worker for the session. `user` may reuse a worker when the principal and startup settings match. `auto` selects a mode using application policy. `shared` is available to adapters explicitly approved for sharing with a read-only profile and without private context, workspaces, or tools. The built-in Codex, DeepSeek Harness, and Goose adapters use dedicated modes. See the [ACP configuration example](../../docs/usage/configuration/ai.md#acp-接入与模型能力).

```ts
import type { RunnerScope } from '@h-ai/runner' // tenantId and userId come from an authenticated application session.
import { ai } from '@h-ai/ai' // Use the server instance initialized with Runner.

async function summarize(identity: RunnerScope, requestId: string) {
  const agent = ai.acp.scoped(identity) // Bind task, session, and approval access to this principal.
  const options = {
    agentId: 'assistant',
    execution: { mode: 'auto' as const }
  } // assistant is a registered agent.
  const plan = await agent.plan(options) // Returns the effective mode, environment, model, and resources without claiming a container.
  if (!plan.success)
    return plan // Stop before submission when the environment or permissions do not match.
  const result = await agent.run({ ...options, prompt: 'List three release checks', idempotencyKey: requestId }) // Returns taskId, output, and effective options.
  if (!result.success)
    return result // Preserve the HaiResult error on submission, execution, or cleanup failure.
  const events = await agent.tasks.events(result.data.taskId, 0, 20) // Read the first 20 durable events, or [] when empty.
  if (!events.success)
    return events
  return { result: result.data, events: events.data } // For example, output.text contains the answer and events are ordered by sequence.
}
```

```ts
import type { RunnerScope } from '@h-ai/runner' // The server-authenticated principal.
import { ai } from '@h-ai/ai' // assistant is registered and supports worker reuse within a user.

async function continueWork(identity: RunnerScope) {
  const agent = ai.acp.scoped(identity) // Access is bound to this principal.
  const created = await agent.sessions.create({
    agentId: 'assistant',
    execution: { mode: 'user' }
  }) // Success yields a session handle with an id.
  if (!created.success)
    return created
  const session = created.data // The handle exposes prompt, stream, changeExecution, and close.
  const run = async () => {
    const first = await session.prompt('Record the acceptance criteria') // Returns this turn's taskId, output, and effective options.
    if (!first.success)
      return first
    const switched = await session.changeExecution({ mode: 'task', acceptNewSession: true }) // Keeps the business id and opens a fresh native session.
    if (!switched.success)
      return switched
    return await session.prompt('Give me an independent acceptance checklist') // The answer is in data.output on success.
  }
  return run().finally(async () => {
    const closed = await session.close() // Success returns data: undefined and releases the session or dedicated environment.
    if (!closed.success)
      throw new Error(closed.error.message)
  })
}
```

`agents.describe(agentId)` reports built-in adapter capabilities. `sessions.get(id)` obtains a handle from another API node for the same principal. `session.stream(prompt, options)` yields durable events and throws on failure. `tasks.get(taskId)` returns the execution receipt. `tasks.cancel(taskId)` acknowledges cancellation and returns current status. Read the `taskId` from the `accepted` event in a `run` or `prompt` observer to query or cancel from another request.

The application supplies `acpPolicy` to authorize `workspaceId` snapshots, knowledge, memory, files, skills, and tools. Use `allowTools` and `bindTools` for the MCP broker below. After receiving an `approval` event, the same principal calls `approvals.respond(id, 'allow-once' | 'allow-session' | 'always-allow' | 'deny')` with its `approvalId`. Success returns `undefined`. `approvals.rules(offset, limit)` pages through valid rules with `expiresAt`, and `approvals.revoke(ruleId)` revokes a rule owned by the principal. `full-access` requires explicit application approval and `task` mode. A workspace provides a read-only snapshot. Mode changes can carry a user-approved `historySummary`. See [managed ACP usage](../../docs/usage/development/ai-acp.md#多用户应用的受管调用) for additional examples.

#### Configuration and database resource catalogs

`llm.models`, `audio.models`, `image.models`, `mcp.servers`, `retrieval.sources`, and `acp.agents/workspaces` merge configuration and database entries. Configuration wins duplicate IDs and is read-only. Database entries support list/get/register/update/remove with value/source/version metadata and optional version checks. Async calls read current definitions; synchronous audio capability checks use the latest local snapshot. Catalog errors use 090–094. Definitions may contain model credentials; expose only authorized, selected fields.

[Resource catalogs](../cli/templates/skills/hai-ai/resources.md) · [ACP](../cli/templates/skills/hai-ai/acp.md)

#### A2A protocol boundaries

Remote-call headers override existing fields case-insensitively. Fixed JSON-RPC endpoints reject HTTP redirects, preventing authentication headers from reaching redirect targets.

`ai.a2a.getAgentCard()` returns standard A2A 1.0 ProtoJSON ready for an HTTP discovery response, with `supportedInterfaces`, MIME, and streaming capabilities. Kit discovery defaults to `/.well-known/agent-card.json`. `handleRequest()` always returns JSON-RPC/SSE results; uninitialized calls return JSON-RPC errors. Trusted HTTP `agentId` maps to executor `context.user.userName`. JSON-RPC/SSE are supported; push notifications, gRPC, and REST are not claimed. Applications remain responsible for business resource authorization.

A2A journal, context ownership and message tables initialize during `ai.init()`. Tasks use trusted `agentId` scopes for get/cancel/continuation. Anonymous requests share one principal; authenticate at the trusted transport boundary in production. `listMessages` is a server administration API with `callerId`, `contextId`, and `since`; never expose it to unauthorized clients.

Tasks and events use one shared journal, without a separate legacy TaskStore. Push notification configuration and authenticated extended card RPCs return standard SDK unsupported/unconfigured errors without executing tasks. Executor types remain public; internal handler/Store assembly types are outside the public contract.

Inbound messages must persist before the executor starts, with shared generation/deadline checks repeated after that wait. Agent messages await logging inside the existing bounded event queue before journal publication. Logging failure produces a failed/interrupted Task rather than a false success; retrying the same message does not rerun business effects. Logs and the journal are separate records: a log is not proof of delivery. Reconcile possible effects using the Task's `requiresEffectReconciliation` marker. Query failures return `A2A_LIST_MESSAGES_FAILED` (984) without raw SQL or connection details.

Task and events publish in one CAS, so any node can subscribe. A retry with identical message ID/content reuses the current result; changed content or an older round fails. Cross-node cancellation invokes the real execution owner's executor.cancelTask. Pending cancellation blocks new messages on the same Task so a late callback cannot affect a later execution. Input-required tasks can continue after node restart. Expired leases, absolute deadlines, or an executor returning only working become failed/interrupted with `metadata.haiExecution.requiresEffectReconciliation=true`; late owners cannot write and unknown external effects are never replayed automatically. `a2a.execution` defaults to `leaseMs: 30000`, `pollIntervalMs: 250`, `maxExecutionMs: 300000`. Limits are 1 MiB/message, 8 MiB/journal, 2048 events/round, 256 receipts/Task and 32 reference tasks. Use stable business idempotency keys and reconcile unknown effects. See the [state/deployment matrix (Chinese)](../../.agents/instructions/distributed-state.md) for guarantees and validation boundaries.

#### MCP Server

`ai.mcp` is an in-process registry; standalone `createMcpServer` uses SDK transports, with no automatic registration between them. `ai.mcp` compiles tool JSON schemas at registration and validates call inputs. Resources must contain exactly one of `text` / `blob`. Prompt arguments and SDK message outputs are validated, with image/audio support. HTTP examples show transport connection only; applications must mount request handling/authentication and close the server on exit.

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

##### Call remote MCP services and isolated tool jobs

Register a third-party Streamable HTTP URL and `allowedTools` under `mcp.servers` with `transport: http`. Use `headerEnv` to reference server-side credentials. With `transport: job`, the same API can run offline document, Office, and OCR tools. Set `environmentId`, allowed operations, and an optional `pool`, and pass Runner and `mcpJobFiles` to `ai.init`. Jobs take an authorized `fileId`. Executors recheck file access and return an object ID for any artifact. Deploy the browser image independently. See [MCP configuration](../../docs/usage/configuration/ai.md#mcp和a2a) and [tool images](tools/README.md).

```ts
import type { MCPServiceAuthorization } from '@h-ai/ai' // Build the principal and the parameter-aware authorization callback from IAM.
import { ai } from '@h-ai/ai' // The initialized server has registered manual and office services.

async function searchManual(access: MCPServiceAuthorization, query: string) {
  const result = await ai.mcp.services.invoke({
    serviceId: 'manual',
    tool: 'search_manual',
    arguments: { query }
  }, access) // Returns a standard MCP tool result after catalog and authorization checks.
  if (!result.success)
    return result // Preserve the denial or upstream error.
  return result.data.content // For example, [{ type: 'text', text: '...' }].
}

async function convertDocument(access: MCPServiceAuthorization, fileId: string) {
  const result = await ai.mcp.services.invoke({
    serviceId: 'office',
    tool: 'office.convert',
    arguments: { fileId }
  }, access) // Submit an offline conversion with the authorized object id.
  if (!result.success)
    return result
  return result.data.structuredContent // Example: { fileId: 'pdf-123', name: 'result.pdf' }. Check authorization again on download.
}
```

```ts
import type { MCPServiceAuthorization, MCPServiceBrokerOptions } from '@h-ai/ai' // Supply a deployment URL and an authorize callback that rechecks the principal, task, and arguments.
import { createServer } from 'node:http' // Hosts the example endpoint.
import { ai } from '@h-ai/ai' // The initialized server has registered the manual service.

function mountTools(options: MCPServiceBrokerOptions) {
  const result = ai.mcp.services.createBroker(options) // On success the broker provides bind, handleRequest, and close.
  if (!result.success)
    throw new Error(result.error.message)
  const broker = result.data // Create a broker on each executor.
  const server = createServer((req, res) => {
    void broker.handleRequest(req, res)
  }) // Handle MCP requests on the bound endpoint.
  return { broker, server } // The host listens on its fixed address, protects the transport, and calls broker.close() and server.close() at shutdown.
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
        tool: 'search_manual', // Expose a model-facing name for the catalogued operation.
        description: 'Search authorized manuals', // Description presented to the model.
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query'],
          additionalProperties: false
        }, // Validate call arguments.
      }
    ]
  }) // Success returns { servers, revoke }. servers contains this session's short-lived Bearer credential.
  if (!result.success)
    throw new Error(result.error.message)
  return result.data // Return from ACPPlatformPolicy.bindTools. The credential is revoked when the session ends.
}
```

#### Memory / RAG / Knowledge

The default database Store commits native memory and its pending vector operation in the same transaction. Successful adds, updates, removals, and clears confirm the relational change. The vector index can catch up later. Reads use committed relational records during vector outages. Any node sharing both stores can retry pending operations in batches, including after a restart.

`ai.memory.scoped({ objectId })` requires a nonempty, non-whitespace subject ID; invalid input immediately throws `TypeError` from the factory instead of creating an unbound instance. Empty public clearing ranges such as `clear({ scope: {} })` fail; cross-subject clearing requires the explicit administrator API. Native memory access statistics and updates use version CAS, so delayed reads cannot resurrect deleted entries. Relational transaction failures return a failed HaiResult. Automatic vector retries require no resubmission from callers.

Each Knowledge ingestion creates a unique `revision` and chunk IDs. It prepares all chunks, embeddings and entities, persists a staging manifest, writes vectors, then publishes the complete document and entity snapshot with shared Store CAS. Only one writer can rebuild a document at a time. Failure preserves the complete old version; shorter replacements cannot expose old trailing chunks. Retrieval filters unpublished revisions and retries around publication; sustained contention returns an error. Candidate expansion and cleanup backlogs can increase query cost.

Successful ingestion returns `revision` and `cleanupPending`. A true flag means the new version is published but old vectors still require cleanup. Paginate `repair({ collection, offset, limit })` regularly across every manifest; setup checks the first 100. Staging expires after five minutes according to the storage clock and an expired writer cannot publish. Abandoned writes retain permanent cleanup tombstones so later scans can remove delayed external writes; do not prune these with logs. SQL and vector storage do not share a transaction. Removal hides data first and reports cleanup failures. Collection deletion retains the empty vector collection and generation tombstones for compensation; setup never revives the previous generation.

The DB Store propagates collection and vector failures. LanceDB uses persistent primary-key atomic merge. Qdrant writes/deletes wait until applied and counts are exact. Multiple nodes must share relational storage and a server vector backend. Custom KnowledgeStore implementations must provide the same publication and compensation contract.

With LanceDB, collection dimensions and metrics persist in the Arrow schema; connection metrics only affect new collections. Reuse the same persistent directory after restart and rebuild collections when embedding dimensions change. Local paths on separate nodes do not share data; distributed Knowledge should use a server vector backend.

Knowledge `retrieve/ask` and the default DB Store forward `filter` to the vector provider and propagate validation/query failures. Knowledge returns `KNOWLEDGE_RETRIEVE_FAILED` (`RAG_FAILED` from ask), without disguising failure as empty results. LanceDB supports AND equality on literal top-level keys with string, finite number, boolean, or null values, such as `{ tenant: 'acme', active: true }`. Null never matches missing keys; objects, arrays, and undefined are unsupported. Filtering precedes vector topK. Check null/complex-value semantics separately for other backends. LanceDB metadata now uses native JSON fields and retains nested JSON; rebuild legacy string-metadata collections before writing or filtering.

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

Knowledge chunks use datapipe units and hard bounds: words for word mode, Unicode code points otherwise, retaining separators from cleaned text. AI defaults remain markdown/maxSize=1500/overlap=200; a smaller maxSize override must also keep inherited overlap below it. Invalid chunk configuration or expressions return KNOWLEDGE_INGEST_FAILED before embedding and revision publication, without an unbounded whole-document fallback.

#### Audio

Register audio models in `ai.init()` and map the default transcription/synthesis models first. Credentials fall back to platform environment variables. Enable `inheritLlmApiKey` explicitly only when LLM and audio models are confirmed to share credentials:

`provider` identifies the protocol, not deployment location. `openai` / `mimo` / `qwen` / `doubao` are cloud platforms; `whisper` (ASR) / `indextts` (TTS) are self-hostable protocols with no canonical endpoint and require explicit `baseUrl`. One protocol can switch among cloud, intranet, and local endpoints without changing business code. Missing cloud credentials return `CONFIGURATION_ERROR`. Self-hosted services may omit credentials; configured `apiKey` is sent as `Authorization: Bearer`.

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

`ai.audio.synthesize` returns normalized `AudioContent` bytes. To return browser-playable Base64 over an API, use `serializePlayableAudio(result.data)`, which wraps `pcm16` in a WAV container and passes WAV/MP3 through:

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

`OptionalSecretSchema` covers optional LLM, Audio, and Image secrets: YAML `null`, empty strings, and whitespace-only strings normalize to `undefined`. Audio key precedence is model `apiKey` → inherited LLM `apiKey` when enabled → platform environment variables. `inheritLlmApiKey` is off by default to avoid using keys across vendors.

> `synthesizeStream` emits `segment_started → audio* → segment_done` strictly. `segment_started` carries **actual output audio parameters** (`format` / `sampleRate` / `channels`) resolved by the server/provider. Players must decode from these rather than guess from requested parameters, and add segment text to `spokenText` only after its audio has actually finished playing. Applications manage playback state.

Cancellation, timeout, and connection problems become domain errors: `AbortSignal` → `AUDIO_CANCELLED`, timeout → `AUDIO_TIMEOUT`, connection failure or abnormal disconnect before `end` → `AUDIO_CONNECTION_FAILED`. `audio.maxStreamDurationMs` limits real-time connections (default five minutes).

Browsers/mobile clients use the unified audio WebSocket exposed by `@h-ai/serv`. `@h-ai/ai/client` offers the same `audio.*` API as Node, hiding transport details. Browser clients distinguish completion, cancellation (`AUDIO_CANCELLED`), and abnormal disconnect (`AUDIO_CONNECTION_FAILED`); cancellation or disconnect before `end` throws the domain code. `synthesize` never treats incomplete audio as success.

IndexTTS pairs the same Undici version's fetch, Agent, and multipart types on Node. Model `timeout` covers response-header and body waits; user cancellation returns `AUDIO_CANCELLED`, and deadlines return `AUDIO_TIMEOUT`. Dedicated connections close after success, failure, or cancellation. Segmented streaming fallback retains errors during iteration.

> For self-hosted CPU/GPU model services (faster-whisper / IndexTTS / Qwen3-4B), weight downloads, and offline bundles, see [models/ (Chinese)](./models/README.md). Images and weights prefer ModelScope, with automatic HuggingFace mirror fallback.

#### Image generation

After model registration in `ai.init()`, callers receive normalized image bytes without vendor-specific Base64, inline data, or temporary URLs:

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

`referenceImages` is optional. Public APIs accept only image bytes and MIME; providers convert multipart, `inlineData`, and Data URLs. Set credentials on model entries or with `HAI_AI_IMAGE_<PROVIDER>_APIKEY` / vendor environment variables. Qwen and Seedream temporary URLs are downloaded immediately inside providers and never exposed publicly. See [REFERENCE.md (Chinese)](./REFERENCE.md#image) for model details and API differences.

Downloads require public HTTPS on default port 443 without URL credentials. Socket DNS lookup validates every returned address and connects using those same results. Private, loopback, link-local, mapped/translated, and reserved IPv4/IPv6 addresses are blocked. Each of at most three redirects is checked again. Downloads use isolated connections without vendor authentication or application cookies. `baseUrl` is trusted operator configuration; vendor API calls reject redirects.

`image.maxImageBytes` defaults to 20971520 (20 MiB; maximum 100 MiB) per output/reference image. `image.maxImages` defaults to 4 (maximum 16) for output/reference counts, with sequential URL downloads. Actual streamed bytes, including decompressed bytes, are bounded and excess responses are cancelled. JSON responses are limited to `max(64 KiB, 2 × maxImageBytes)` and error bodies to 64 KiB. Model `timeout` defaults to 120000ms for the entire vendor request, redirects, and downloads; `signal` cancels the whole process. Outputs require matching PNG/JPEG/GIF/WebP MIME and magic bytes; SVG is rejected. Magic checks do not decode complete images or verify dimensions. Address rejection, limits, and deadlines return `IMAGE_DOWNLOAD_BLOCKED`, `IMAGE_TOO_LARGE`, and `IMAGE_TIMEOUT`; check success before use.

#### File parsing

Pass the business file content and filename to `ai.file.parse({ content, filename, options: { outputFormat: 'markdown' } })`. Check `success` before reading `data.text`; use `outputFormat: 'text'` for plain text. HTML uses parse5 and iterative traversal, omits script/style content, and preserves common Markdown headings, lists, links, images, quotations, code and tables. Normal documents are not truncated to avoid malformed-tag regex backtracking.

The result is text or Markdown, not trusted HTML. Render it with text bindings or the framework's `MarkdownRenderer`. Configuration, parameters and error codes retain their existing contract.

#### Context manager

Automatic memory extraction runs locally in the background; `pendingMemoryTasks=0` does not imply success. `flush()` waits for the batch and returns `MEMORY_EXTRACT_FAILED` with a count for thrown errors or failed HaiResults. Concurrent observers share that result. Returning acknowledges the report; later flushes observe new tasks without replaying partially completed effects. `save()`, `reset({ waitForMemoryTasks: true })`, and `consolidate()` return that failure before subsequent writes. Reconcile external effects after a process crash.

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

A manager permits **one active generation** by default, preventing out-of-order messages when the next user message is written before the previous AI run exits. `reset()` is asynchronous: it stops active generation, releases concurrency barriers, clears turns, and rewrites Persona/System Prompt by default.

##### Actual conversation state (Conversation Commit Layer)

By default (`turnCommit: 'auto'`), `chat` / `chatStream` store the **full generated text** in context. In a generation → TTS → playback flow, however, speech can be interrupted halfway. The next turn's shared conversation state should contain **what was actually played**, rather than everything the model intended to say.

With `turnCommit: 'manual'`, results are not stored automatically. A `turnId` is returned so the caller can explicitly commit the text reflecting what actually happened.

`chatStream` registers a turn and emits `turn_started` **before calling the model** (`turn_started → delta* → done`, or `turn_started → delta* → cancelled` on cancellation). Even if `AbortSignal` cancels generation midway, the caller gets `turnId` and generated text for committing actual content:

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

- `commitTurn(turnId, { text? })`: commit actual text (defaults to full generated text), setting state to `completed`.
- `interruptTurn(turnId, { text? })`: store only what was actually expressed (omission means nothing was expressed, so nothing is stored), setting state to `interrupted`.
- Only `committed` content enters context and memory extraction. Uncommitted/discarded text does not affect future turns.
- If `interruptTurn` interrupts before stream completion (for example a host interrupts just as the model finishes), `chatStream` **does not emit `done`**, preventing accidental post-completion commits.

##### Session consolidation (Memory lifecycle)

During a session, each turn extracts **short-term session memory** with `scope: { sessionId }`. At session end, `consolidate()`
turns short-term memory + summaries into **cross-session long-term memory**, completing `Session Memory → Summary → Long-term Memory`:

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

#### Persona (AI character profiles)

Memory uses `objectId` / `scope` to identify whose memories they are; Persona defines who the AI is through
stable system prompts and character traits, linked to long-term memory through `scope: { personaId }`:

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

`ai.persona` exposes `save` / `get` / `update` / `remove` / `list` / `compose`, with profiles isolated by `[objectId, id]`. Supply `objectId` when saving and `{ objectId }` for other operations; omission selects the `system` platform profile. Bind tenant operations to a trusted authenticated subject; a client-provided profile ID does not authorize access.

### Security boundaries

- Treat prompts, retrieved documents, and model outputs as untrusted. Do not insert user content into non-overridable system rules.
- Zod validates tool argument shapes, not caller permissions. High-privilege handlers must verify identity, tenant, ownership, and quota, and expose only tools allowed to execute automatically.
- `callRemoteAgent()` is an independent client requiring only `ai.init()`, without Agent Card or local executors. It rejects non-HTTP(S) and embedded URL credentials; applications must still allowlist origins and enforce egress protection against DNS rebinding, private-network redirects, and cloud metadata access.
- Do not log full prompts, tool arguments, A2A headers, temporary model credentials, or remote URLs with queries. Audits should retain redacted summaries only.

### Using returned handles

`registry` comes from ai.tools.createRegistry(); `manager` is successful data from context.createManager/restoreManager; `session` is successful data from managed ACP sessions.create/get/resume; `connection` comes from acp.connect. Respect each handle's lifecycle and authorization. Scoped Memory exposes the same ten operations above with objectId/scope bound by the factory; per-call overrides are omitted.

| Entry                      | Use case                 | Input                                                      | Output                                                                 | Call fragment                                            |
| -------------------------- | ------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| `registry.register`        | Register one tool        | `Tool`                                                     | `HaiResult<void>; duplicate rejected`                                  | `registry.register(tool)`                                |
| `registry.registerMany`    | Register tools           | `Tool[]`                                                   | `HaiResult<void>`                                                      | `registry.registerMany(tools)`                           |
| `registry.replace`         | Explicitly replace tool  | `Tool with existing name`                                  | `HaiResult<void>`                                                      | `registry.replace(tool)`                                 |
| `registry.unregister`      | Unregister tool          | `tool name`                                                | `boolean`                                                              | `registry.unregister("search")`                          |
| `registry.get`             | Get tool                 | `tool name`                                                | `Tool or undefined`                                                    | `registry.get("search")`                                 |
| `registry.has`             | Check tool               | `tool name`                                                | `boolean`                                                              | `registry.has("search")`                                 |
| `registry.getNames`        | Tool names               | `none`                                                     | `string[]`                                                             | `registry.getNames()`                                    |
| `registry.getDefinitions`  | Model-facing definitions | `none`                                                     | `ToolDefinition[]`                                                     | `registry.getDefinitions()`                              |
| `registry.execute`         | Execute authorized tool  | `ToolCall, ToolExecutionOptions?`                          | `Promise<HaiResult<ToolMessage>>`                                      | `registry.execute(toolCall, { objectId: "u1" })`         |
| `registry.executeAll`      | Execute calls            | `ToolCall[], { parallel?, ...executionOptions }`           | `Promise<HaiResult<ToolMessage[]>>`                                    | `registry.executeAll(toolCalls)`                         |
| `registry.clear`           | Clear local tools        | `none`                                                     | `void`                                                                 | `registry.clear()`                                       |
| `registry.size`            | Tool count               | `none`                                                     | `number`                                                               | `registry.size`                                          |
| `manager.addMessage`       | Add message              | `ChatMessage`                                              | `Promise<HaiResult<void>>`                                             | `manager.addMessage({ role: "user", content: "你好" })`  |
| `manager.getMessages`      | Read message snapshot    | `none`                                                     | `HaiResult<ChatMessage[]>`                                             | `manager.getMessages()`                                  |
| `manager.reload`           | Reload shared state      | `none`                                                     | `Promise<HaiResult<void>>`                                             | `manager.reload()`                                       |
| `manager.getTokenUsage`    | Observe budget           | `none`                                                     | `HaiResult<{ current, budget }>`                                       | `manager.getTokenUsage()`                                |
| `manager.getSummaries`     | Read summaries           | `none`                                                     | `HaiResult<SummaryResult[]>`                                           | `manager.getSummaries()`                                 |
| `manager.save`             | Save context             | `none`                                                     | `Promise<HaiResult<void>>`                                             | `manager.save()`                                         |
| `manager.flush`            | Flush background memory  | `none`                                                     | `Promise<HaiResult<void>>`                                             | `manager.flush()`                                        |
| `manager.reset`            | Reset conversation       | `ContextResetOptions?`                                     | `Promise<HaiResult<void>>`                                             | `manager.reset({ preserveSystemPrompt: true })`          |
| `manager.getTurns`         | Read actual turns        | `none`                                                     | `HaiResult<ConversationTurn[]>`                                        | `manager.getTurns()`                                     |
| `manager.markTurnSpeaking` | Mark speaking            | `turnId`                                                   | `Promise<HaiResult<void>>`                                             | `manager.markTurnSpeaking(turnId)`                       |
| `manager.commitTurn`       | Commit actual content    | `turnId, { text? }`                                        | `Promise<HaiResult<void>>`                                             | `manager.commitTurn(turnId, { text: spokenText })`       |
| `manager.interruptTurn`    | Commit interruption      | `turnId, { text? }`                                        | `Promise<HaiResult<void>>`                                             | `manager.interruptTurn(turnId, { text: spokenText })`    |
| `manager.consolidate`      | Consolidate memory       | `ConsolidateOptions?`                                      | `Promise<HaiResult<{ summary, memories }>>`                            | `manager.consolidate({ scope: { personaId: "tutor" } })` |
| `manager.chat`             | Stateful answer          | `message: string, ContextChatOptions?`                     | `Promise<HaiResult<ContextChatResult>>`                                | `manager.chat("请继续")`                                 |
| `manager.chatStream`       | Stateful stream          | `message: string, ContextChatOptions?`                     | `AsyncIterable<ContextStreamEvent>`                                    | `manager.chatStream("请继续")`                           |
| `session.info`             | Read managed session     | `none`                                                     | `Promise<HaiResult<ACPSessionInfo>>`                                   | `session.info()`                                         |
| `session.prompt`           | Execute one turn         | `ContentBlock[], AbortSignal?`                             | `Promise<HaiResult<{ text, stopReason, events }>>`                     | `session.prompt([{ type: "text", text: "检查工程" }])`   |
| `session.promptStructured` | Validate JSON output     | `ContentBlock[], Zod schema, AbortSignal?`                 | `Promise<HaiResult<schema-inferred T>>`                                | `session.promptStructured(content, OutputSchema)`        |
| `session.stream`           | Observe native events    | `ContentBlock[], AbortSignal?`                             | `AsyncIterable<SessionNotification>; failure throws`                   | `session.stream([{ type: "text", text: "检查工程" }])`   |
| `session.cancel`           | Cancel turn              | `none`                                                     | `Promise<HaiResult<void>>`                                             | `session.cancel()`                                       |
| `session.setMode`          | Select advertised mode   | `native mode ID`                                           | `Promise<HaiResult<native mode response>>`                             | `session.setMode("code")`                                |
| `session.setConfigOption`  | Set native option        | `native option key and allowed value`                      | `Promise<HaiResult<native config response>>`                           | `session.setConfigOption("model", "coding")`             |
| `session.updateMain`       | Fast-forward main        | `none; execution and preview must be stopped`              | `Promise<HaiResult<ACPGitReport[]>>; partial failure reports in cause` | `session.updateMain()`                                   |
| `session.publish`          | Commit and push          | `{ mode, message, author }; managed isolated session only` | `Promise<HaiResult<ACPGitReport[]>>`                                   | `session.publish(publishOptions)`                        |
| `session.close`            | Stop and retain state    | `none`                                                     | `Promise<HaiResult<void>>`                                             | `session.close()`                                        |
| `connection.authenticate`  | Native authentication    | `advertised authentication method ID`                      | `Promise<HaiResult<native auth response>>`                             | `connection.authenticate("api-key")`                     |
| `connection.createSession` | Create native session    | `absolute remote cwd, McpServer[]?`                        | `Promise<HaiResult<{ id, prompt, cancel }>>`                           | `connection.createSession("/workspace/project", [])`     |
| `connection.listSessions`  | Native sessions          | `cursor?`                                                  | `Promise<HaiResult<native paginated response>>`                        | `connection.listSessions()`                              |
| `connection.deleteSession` | Delete native session    | `native session ID`                                        | `Promise<HaiResult<native delete response>>`                           | `connection.deleteSession(nativeId)`                     |
| `connection.close`         | Close native connection  | `none`                                                     | `Promise<HaiResult<void>>`                                             | `connection.close()`                                     |

## Configuration

### Choose configuration by task

| Configuration entry | Scenario                         | Input                                                                      | Effect                                                               | Example                                                                                                   |
| ------------------- | -------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `llm`               | Model connection and protocol    | model, protocol, apiKey/baseUrl, timeout, models/scenarios                 | chat/Responses/Anthropic selection; normalized model requests        | `{ llm: { model: "gpt-4o-mini", timeout: 60000 } }`                                                       |
| `embedding`         | Embedding vectors                | model?, dimensions?, batchSize?                                            | consistent vector dimensions for the target collection               | `{ embedding: { dimensions: 1536, batchSize: 100 } }`                                                     |
| `mcp`               | External tool servers            | servers with transport/endpoints or commands                               | registered server definitions; application authorizes tool execution | `{ mcp: { servers: [] } }`                                                                                |
| `retrieval`         | Default retrieval sources        | sources: { id, collection, topK?, minScore?, filter? }[]                   | queryable source definitions; does not import documents              | `{ retrieval: { sources: [{ id: "docs", collection: "manual", topK: 5 }] } }`                             |
| `knowledge`         | Publication and chunking         | collection, dimension, cleanOptions, chunkOptions                          | versioned document/vector publication and bounded chunks             | `{ knowledge: { collection: "manual", dimension: 1536, chunkOptions: { maxSize: 1500, overlap: 200 } } }` |
| `memory`            | Subject memory backend           | provider, quotas, recencyDecay, defaultTopK, candidateMultiplier           | native or Mem0-format behavior with explicit persistence limits      | `{ memory: { provider: "native", defaultTopK: 10 } }`                                                     |
| `token`             | Token estimate                   | tokenRatio > 0; default 0.25                                               | local token budget estimates; not provider billing usage             | `{ token: { tokenRatio: 0.25 } }`                                                                         |
| `summary`           | Summary policy                   | systemPrompt?                                                              | prompt used by summary generation; model from llm.scenarios          | `{ summary: { systemPrompt: "保留已确认决策和待办" } }`                                                   |
| `compress`          | Context compression              | defaultStrategy, defaultMaxTokens, preserveLastN                           | compression defaults; 0 budget derives from model limit              | `{ compress: { defaultStrategy: "hybrid", defaultMaxTokens: 4000, preserveLastN: 4 } }`                   |
| `file`              | OCR instructions                 | systemPrompt?; model via llm.scenarios.ocr                                 | text extraction instructions; not HTML sanitization                  | `{ file: { systemPrompt: "只提取可见文字" } }`                                                            |
| `audio`             | Audio models and limits          | models, transcribeModel/synthesizeModel, maxAudioBytes/maxStreamDurationMs | provider capability/operation selection and bounded input/stream     | `see Audio examples`                                                                                      |
| `image`             | Image models and download limits | models, generateModel, maxImageBytes, maxImages; timeout per model         | generated bytes with MIME; unsafe downloads rejected                 | `see Image examples`                                                                                      |
| `a2a`               | Agent discovery and leases       | agentCard and execution lease/poll/deadline options                        | ProtoJSON discovery and shared task journal                          | `see A2A protocol section`                                                                                |
| `acp`               | Agent execution limits           | agents/workspaces and execution content/event limits                       | validated definitions and managed native sessions                    | `see ACP guide`                                                                                           |

Rerank inherits the global LLM timeout with per-model overrides; the deadline covers the request and response body, returning RERANK_API_ERROR on timeout.

Set the request protocol with `llm.protocol`, `llm.models[].protocol` or per-call `tempModel.protocol`: `chat | responses | anthropic`. Environment names are `HAI_AI_LLM_PROTOCOL` and `HAI_AI_LLM_MODELS_0_PROTOCOL` (adjust the model index). Supply credentials with `apiKey` or private environment variables.

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

When loading through `core.config.load('ai', ...)`, convention-based environment variables override YAML:
for example `HAI_AI_LLM_APIKEY`, `HAI_AI_LLM_BASEURL`, and `HAI_AI_LLM_MODEL`.

Enable the Mem0 data-format adapter:

```yaml
memory:
  provider: mem0
  defaultTopK: 10
```

- **`native` (default, recommended)**: HAI's native engine reuses vecdb, reldb, LLM, and Embedding. `extract` uses **Mem0-style batch merging**: one LLM call decides ADD / UPDATE / DELETE / NONE for extracted facts and related existing memories, providing incremental updates, deduplication, contradiction removal, and `category` labels. `maxEntriesPerObject`, `maxEntriesGlobal`, `recencyDecay`, `embeddingEnabled`, and `writebackRelatedTopK` apply. Eviction is partitioned by `objectId`, so heavy writes by one subject do not evict others' memories. `scope` candidates are narrowed by `objectId` (≤ `maxEntriesPerObject`); PostgreSQL also pushes scope into a JSONB containment query using a **GIN index**. SQLite/MySQL fall back to equivalent in-memory matching.
- **`mem0` (data-format adapter)**: Hai performs extraction and Embedding, then uses native HTTP to read and write the Mem0 UUID/payload format in Qdrant, including existing data. It does not run the full upstream engine, telemetry, or a history database. Only Qdrant with complete connection settings is supported. Production (`NODE_ENV` or `HAI_CORE_ENV=production`) rejects ephemeral fallback; development or explicit E2E may set `memory.allowEphemeralFallback: true`. Use `native` for other persistent backends.

Both providers share `ai.memory.*` (`extract` / `recall` / `injectMemories` / `add` / `update` / `get` / `remove` / `list` / `listPage` / `clear`) with `objectId` isolation and key-value `scope` filters such as `{ topicId, personaId }`. `recall` / `list` / `listPage` / `clear` strictly filter scope; `clear` with `types` / `scope` deletes only jointly matching entries. mem0 `extract` uses the shared extractor for classification/scoring (`types` / `model` / `minImportance` / `systemPrompt`), then writes directly, preserving `hai_type` / `hai_importance`. Its `recall` supports `types` and `recencyWeight` decay, matching native behavior. Mem0 updates text and metadata in place, preserving `id` and creation time. With bounded candidate scanning, `list`, `listPage`, and filtered `clear` support at most 1000 raw subject candidates, including expired records. One extra candidate detects truncation; exceeding the bound returns `MEMORY_LIST_INCOMPLETE` (906), without a fabricated total or partial filtered deletion. Complete candidates are filtered by UTC expiration date, type and scope before pagination. Whole-subject deletion is independent of this listing limit. Public empty-filter clear is rejected; only trusted administration may explicitly call `admin.clearAll({ confirm: true })`.

Mem0 storage and the VecDB Qdrant provider use native HTTP without an extra SDK. Fixed REST requests use `query` and encoded path segments. A 30-second timeout covers the complete response body; responses over 16 MiB fail explicitly. Writes and deletes await the completed `wait=true` receipt. Lists and filtered deletion validate at most 1000 raw candidates per subject, including expired rows; overflow returns `MEMORY_LIST_INCOMPLETE` and performs no partial filtered deletion. Whole-subject deletion is independent of this list limit.

The Qdrant format backend requires version 1.19 or newer and rejects HTTP redirects. Updates use server-side `update_only` with subject/revision conditions in one atomic write, rejecting deleted or concurrently changed rows. Late updates cannot recreate deleted records. Failed post-write revision verification still requires reconciliation of actual effects.

SDK add receipts omit full business fields, so `add` / `extract` read the stored record before returning. Extraction waits for all pending writes. A write or readback failure sets `error.ext.requiresEffectReconciliation=true` and retains known IDs in `memoryIds` (possibly empty if receipts were lost). Reconcile subject records before recovery; blindly repeating add/extract can duplicate committed writes. The framework does not replay automatically.

**Candidate pools and scope recall misses**: filtering scope after truncating to `topK` can let higher-ranked memories from other topics/personas displace the target scope. `recall` / `injectMemories` therefore fetch `topK × candidateMultiplier` candidates (default multiplier 5), filter, then take `topK`. Increase `candidateMultiplier` for finer isolation such as `topicId` + `personaId`:

```ts
const memories = await ai.memory.recall('经济发展', {
  objectId: 'user-001',
  scope: { topicId: 'C' },
  topK: 10,
  candidateMultiplier: 8, // 覆盖配置默认值，扩大候选池
})
```

`ai.config` returns a redacted snapshot without exposing original `apiKey`, `privateKey`, embedded URL credentials, or other secrets.

Native memory inserts check subject and global quotas inside a shared database transaction. Eviction scores up to 64 of the oldest candidates per batch by importance and recency. Existing data above quota is reduced in batches before new entries can be stored. Custom shared stores can implement `AIRelStore.withWriteLock` to provide the same cross-node guarantee.

## Error Handling

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

Common error ranges:

- `hai:ai:010-012`: initialization/configuration.
- `hai:ai:100-107`: LLM and history.
- `hai:ai:300-302`：Embedding。
- `hai:ai:600-701`：Retrieval/RAG。
- `hai:ai:800-805`：Knowledge。
- `hai:ai:050-059`：Audio。
- `hai:ai:060-068`: Image, including blocked downloads, resource limits, and total deadlines.
- `hai:ai:900-906`：Memory。
- `hai:ai:980-984`：A2A。

## Development

```bash
pnpm --filter @h-ai/ai typecheck
pnpm --filter @h-ai/ai lint
pnpm --filter @h-ai/ai test
pnpm --filter @h-ai/ai build
```

Public JSDoc examples import actual package entrypoints; internal factory examples are marked with their module context and compiled against real local declarations. Run `pnpm check:jsdoc --package ai` from the repository root to verify coverage and example types. Ordinary business calls check HaiResult; streams and the browser AudioClient retain their explicit throwing contracts.

## License

Apache-2.0
