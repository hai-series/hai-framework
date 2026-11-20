# @h-ai/ai API reference

<!-- translation: partial -->

[Chinese source](ai.md) · [Configuration](../configuration/ai.en.md) · [Data structures](../data/ai.en.md)

## Quick start

Initialize the configured provider before invoking AI. Start with chat or embeddings, then add tools, retrieval and durable sessions as needed. Assign the authenticated scope on the server and apply tool authorization there.

```ts
import { ai } from '@h-ai/ai'

// Initialize gpt-4o-mini with the key from the environment. Success enables LLM access; setup failure stops the request.
const init = await ai.init({
  llm: {
    model: 'gpt-4o-mini',
    apiKey: process.env.HAI_AI_LLM_APIKEY,
  },
})
if (!init.success)
  throw new Error(init.error.message)

try {
  // Send the user message below to the configured model. Success exposes the response in choices; provider failure enters the error branch.
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
  // Release AI-owned resources without arguments. There is no business data; the host closes any dependencies it supplied.
  await ai.close()
}
```

<a id="api-list"></a>

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Import the module as in the quick start. Except for lifecycle examples, run scenarios after initialization and before closure. The value helper checks HaiResult.success and preserves the original error. Use isolated test data and explicit cleanup.

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="lifecycle"></a>

### Prepare models and stores: `ai`

Choose models and state storage before starting in dependency order. Temporary development stores differ from shared production stores.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.init` | 准备服务 | `AIConfigInput?, AIInitOptions?` | `HaiResult<void>; validate dependencies before use` | `ai.init({ llm: { apiKey: process.env.HAI_AI_LLM_APIKEY } })` |
| `ai.close` | 反序释放服务 | `none` | `Promise<void>; wait for cleanup` | `ai.close()` |
| `ai.config` | 诊断当前配置 | `none` | `redacted AIConfig or null` | `ai.config` |
| `ai.isInitialized` | 检查生命周期状态 | `none` | `boolean` | `ai.isInitialized` |
| `resolveModelEntry` | Resolve a model entry by identifier | `resolveModelEntry(llmConfig, 'summary')` → `HaiResult<ResolvedModelEntry>` | `HaiResult<ResolvedModelEntry>` | `resolveModelEntry(llmConfig, 'summary')` |
| `resolveModelApi` | Resolve model API capabilities | `resolveModelApi(llmConfig, 'claude')` → 当前模型协议（`chat`、`responses` 或 `anthropic`） | `ApiType` (`'chat'`, `'responses'`, `'anthropic'`) | `resolveModelApi(llmConfig, 'claude')` |
| `resolveImageModel` | Resolve an image model | `resolveImageModel(imageConfig)` → `HaiResult<ResolvedImageModel>` | `HaiResult<ResolvedImageModel>` | `resolveImageModel(imageConfig)` |
| `resolveAudioModel` | Resolve an audio model | `resolveAudioModel(audioConfig, 'transcribe')` → `HaiResult<ResolvedAudioModel>` | `HaiResult<ResolvedAudioModel>` | `resolveAudioModel(audioConfig, 'transcribe')` |
| `ensureAudioCredential` | Check audio model credentials | 在解析成功的分支调用 `ensureAudioCredential(model.data)`，返回凭据缺失错误或 `null` | `HaiError or null` | `ensureAudioCredential(model)` |

#### Scenario: Prepare models and stores

The quick start covers init/close. config is a sanitized snapshot and isInitialized a boolean. Resolvers take validated settings and return resolved models or failures; ensureAudioCredential returns an error or null without calling a model.

[Detailed parameters and workflows](ai.md#lifecycle)

<a id="chat"></a>

### Chat, structured output and models: `ai.llm`

Chat returns a complete response while streams yield chunks. Model management and history queries follow current identity and storage capabilities.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.llm.chat` | 单次回答 | `ChatCompletionRequest: messages, model?, signal?, tools?` | `ChatCompletionResponse: choices, model, usage?` | `ai.llm.chat({ messages: [{ role: "user", content: "你好" }] })` |
| `ai.llm.chatStream` | 逐块回答 | `same ChatCompletionRequest` | `AsyncIterable<ChatCompletionChunk>; iteration may throw` | `ai.llm.chatStream({ messages })` |
| `ai.llm.ask` | 纯文本问答 | `question: string, AskOptions?` | `string answer` | `ai.llm.ask("解释共享状态")` |
| `ai.llm.askStream` | 纯文本流 | `question: string, AskOptions?` | `AsyncIterable<string>` | `ai.llm.askStream("解释共享状态")` |
| `ai.llm.generateObject` | 受 Schema 约束的答案 | `Zod schema, messages, model?, responseFormat?, maxRepairs?, signal?` | `schema-inferred T` | `ai.llm.generateObject({ schema: AnswerSchema, messages })` |
| `ai.llm.listModels` | 查询模型 | `none` | `string[] model IDs` | `ai.llm.listModels()` |
| `ai.llm.getHistory` | 读取对话历史 | `{ objectId, sessionId }, { limit?, order? }?` | `ChatRecord[]` | `ai.llm.getHistory({ objectId: "u1", sessionId: "s1" })` |
| `ai.llm.listSessions` | 列出主体会话 | `objectId: string` | `SessionInfo[]` | `ai.llm.listSessions("u1")` |
| `ai.llm.models.list` | 列出合并清单 | `none` | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.llm.models.list()` |
| `ai.llm.models.get` | 读取来源和版本 | `id: string` | `HaiResult<AIResourceEntry> with value/source/version?` | `ai.llm.models.get("coding")` |
| `ai.llm.models.register` | 登记数据库定义 | `ModelEntry input (id/model/protocol/credentials/capabilities)` | `HaiResult<AIResourceEntry>; config entries are read-only` | `ai.llm.models.register(modelDefinition)` |
| `ai.llm.models.update` | 按版本替换定义 | `ModelEntry input (id/model/protocol/credentials/capabilities), expectedVersion?` | `HaiResult<AIResourceEntry>; full replacement, conflict fails` | `ai.llm.models.update(modelDefinition, current.version)` |
| `ai.llm.models.remove` | 删除数据库定义 | `id, expectedVersion?; ACP definitions must have no session references` | `HaiResult<void>; external files/services are retained` | `ai.llm.models.remove("coding", current.version)` |

#### Scenario: Chat, structured output and models

```ts
// Send the order status question to the default model. The completion contains text in choices; value throws on provider failure.
const reply = value(await ai.llm.chat({ messages: [{ role: 'user', content: 'Explain order status in one sentence.' }] }))
const text = reply.choices[0]?.message.content // model-generated text, not a fixed literal
// Ask the default model what pending means. Success yields answer text; value throws on a provider failure.
const answer = value(await ai.llm.ask('What does pending mean?')) // string answer
// Stream Hello to the default model and iterate completion chunks. Connection or generation failure throws from the stream.
for await (const chunk of ai.llm.chatStream({ messages: [{ role: 'user', content: 'Hello' }] })) {
  const delta = chunk.choices[0]?.delta?.content // incremental text when present
}
// Ask Hello as plain text and consume answer deltas. Provider errors end iteration by throwing.
for await (const delta of ai.llm.askStream('Hello')) {
  // consume each returned text fragment; handle stream errors outside the loop
}
// List available models with no arguments. value throws if the catalog cannot be read.
const models = value(await ai.llm.listModels()) // configured model summaries
```

Questions are concrete, but model text varies. Structured generation validates against a local schema below. Resource CRUD uses one stable model name; history uses server-verified identities and sessions.

[Detailed parameters and workflows](ai.md#chat)


#### Scenario: Maintain a stored definition

Supply a validated complete definition with an unused demo ID. File-backed entries are read-only. get supplies the version, update replaces the full definition, and remove retains external resources.

```ts
async function maintain_llm_models(definition: Parameters<typeof ai.llm.models.register>[0]) {
  // Persist the supplied language model definition and get its database version. Duplicate or configuration-owned IDs fail.
  const created = value(await ai.llm.models.register(definition))
  // List configured and database language model entries without arguments. Configuration takes precedence for duplicate IDs; the newly registered entry appears here.
  const listed = value(await ai.llm.models.list())
  // Look up the saved language model ID and its database version. A missing ID fails.
  const current = value(await ai.llm.models.get(definition.id))
  // Replace this language model definition using the observed version and get the new version. Stale versions and configuration-owned entries fail.
  const updated = value(await ai.llm.models.update(definition, current.version))
  // Delete the example language model entry against its latest version. Success has no data; a conflict or config-owned entry fails.
  value(await ai.llm.models.remove(definition.id, updated.version))
  return { created, listed, updated } // entries include value/source and database version
}
```

<a id="model-tools"></a>

### Give models business tools: `ai.tools`

Adapt Tools definitions to model protocols and combine built-in or remote tools under host authorization.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.tools.adapt` | 将中立工具适配给模型 | `registry: @h-ai/tools ToolRegistryOperations` | `ToolRegistryOperations; no init required` | `ai.tools.adapt(registry)` |
| `ai.tools.createBuiltinTools` | 组合图片、语音、文档改写与可选网址视频 | `BuiltinToolOptions: context, files, executeJob?` | `direct ToolSet; model calls run only during execution` | `ai.tools.createBuiltinTools(options)` |
| `ai.tools.createMcpTools` | 将已登记 MCP 纳入统一执行 | `McpToolOptions: context, definitions, authorize` | `HaiResult<ToolSet>` | `ai.tools.createMcpTools(options)` |
| `ai.tools.createBroker` | 向原生 Agent 开放同一工具服务 | `BuiltinToolBrokerOptions: service, url` | `HaiResult<BuiltinToolBroker>` | `ai.tools.createBroker({ service, url })` |
| `modelTools.getDefinitions` | 传给模型的定义 | 无 | `ToolDefinition[]` | `modelTools.getDefinitions()` |
| `modelTools.execute` | 执行模型工具调用 | `ToolCall, ToolExecutionOptions?` | `Promise<HaiResult<ToolMessage>>` | `modelTools.execute(toolCall, { objectId: "u1" })` |
| `modelTools.executeAll` | 批量执行模型工具调用 | `ToolCall[], { parallel?, ...executionOptions }` | `Promise<HaiResult<ToolMessage[]>>` | `modelTools.executeAll(toolCalls)` |

#### Scenario: Give models business tools

Create modelTools, pass getDefinitions to the model and execute its calls with trusted context. Results are business outputs; model arguments cannot claim identity. Media and documents use authorized artifact references.

[Detailed parameters and workflows](ai.md#model-tools)

<a id="streams"></a>

### Process streams and SSE: `ai.stream`

Process chunks, collect responses and encode/decode SSE without initializing AI.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.stream.createProcessor` | 积累增量文本 | `none` | `direct StreamProcessor` | `ai.stream.createProcessor()` |
| `ai.stream.collect` | 完整消费聊天流 | `AsyncIterable<ChatCompletionChunk>` | `Promise<StreamResult>; stream failure rejects` | `ai.stream.collect(ai.llm.chatStream({ messages }))` |
| `ai.stream.createSSEDecoder` | 跨片段解码 SSE | `none` | `direct SSEDecoder with decode/reset` | `ai.stream.createSSEDecoder()` |
| `ai.stream.encodeSSE` | 编码事件流 | `SSEEvent: data, event?, id?, retry?` | `direct string; invalid metadata throws` | `ai.stream.encodeSSE({ data: "Hello" })` |

#### Scenario: Process streams and SSE

Input is SSE text and a real chat stream. decode waits for the blank event delimiter; collect consumes a complete stream and rejects on failure.

```ts
// Encode ready as an SSE text frame with the default event.
const encoded = ai.stream.encodeSSE({ data: 'ready' })
// Create an SSE decoder without arguments. It retains incomplete frames between chunks.
const decoder = ai.stream.createSSEDecoder()
// Pass the first five characters. The partial frame yields no event.
const first = [...decoder.decode(encoded.slice(0, 5))] // []
// Supply the remaining characters to complete the default message event with data ready.
const second = [...decoder.decode(encoded.slice(5))] // [{ event: 'message', data: 'ready', ... }]
// Clear buffered decoder data without arguments before a fresh stream.
decoder.reset()
// Create an empty completion chunk accumulator with no arguments.
const processor = ai.stream.createProcessor()
// Process the simulated Hello chunk and record its text and stop finish reason.
processor.process({ id: 'demo', object: 'chat.completion.chunk', created: 0, model: 'configured-model', choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: 'stop' }] })
// Read accumulated Hello and any available usage or tool calls without arguments.
processor.getResult() // accumulated text and optional usage/tool calls
// Convert accumulated data to an assistant message with text Hello.
processor.toAssistantMessage() // assistant message containing Hello
// Reset accumulated text and calls without arguments for the next stream.
processor.reset()
// chatStream sends Hello to the default model. collect consumes it to completion and returns the aggregate; stream errors reject the promise.
const collected = await ai.stream.collect(ai.llm.chatStream({ messages: [{ role: 'user', content: 'Hello' }] }))
// collected contains the full stream result; text is produced by the model.
```

<a id="embeddings"></a>

### Generate text embeddings: `ai.embedding`

Use the same model and dimensions for documents and queries; batch outputs retain input indices.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.embedding.embed` | 通用向量请求 | `EmbeddingRequest with input/model?` | `EmbeddingResponse` | `ai.embedding.embed({ input: "产品说明" })` |
| `ai.embedding.embedText` | 单段向量 | `text: string` | `number[]` | `ai.embedding.embedText("产品说明")` |
| `ai.embedding.embedBatch` | 批量向量 | `texts: string[]` | `number[][] in input order` | `ai.embedding.embedBatch(["简介", "部署"])` |

#### Scenario: Generate text embeddings

```ts
// Embed the supplied installation-guide text as one numeric vector. value throws on a provider failure.
const one = value(await ai.embedding.embedText('Order installation guide')) // number[]
// Embed Install and Refund together and return the two corresponding vectors. Provider failure makes value throw.
const batch = value(await ai.embedding.embedBatch(['Install', 'Refund'])) // vectors in input order
// Read the full embedding response for the same inputs, including item vectors and indices. value throws on request failure.
const detailed = value(await ai.embedding.embed({ input: ['Install', 'Refund'] })) // model, data, usage
```

The inputs contain one or two texts. Values and dimensions depend on the model; index 0 identifies Install in the detailed response.

[Detailed parameters and workflows](ai.md#embeddings)

<a id="mcp"></a>

### Publish and call MCP: `ai.mcp`

Distinguish local registrations from remote services and authorize each remote call using current identity.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.mcp.registerTool` | 注册本进程工具 | `MCPToolDefinition, typed handler` | `void` | `ai.mcp.registerTool(mcpToolDefinition, toolHandler)` |
| `ai.mcp.registerResource` | 注册资源 | `MCPResource, async content handler` | `void` | `ai.mcp.registerResource(resourceDefinition, readContent)` |
| `ai.mcp.registerPrompt` | 注册提示词 | `MCPPrompt, args => Promise<MCPPromptMessage[]>` | `void` | `ai.mcp.registerPrompt(promptDefinition, buildMessages)` |
| `ai.mcp.callTool` | 调用已注册工具 | `name, arguments, MCPContext?` | `unknown tool result` | `ai.mcp.callTool("search", { query: "配置" })` |
| `ai.mcp.readResource` | 读取资源 | `resource URI` | `MCPResourceContent with exactly text or blob` | `ai.mcp.readResource("docs://intro")` |
| `ai.mcp.getPrompt` | 构建提示词 | `name, Record<string,string> arguments` | `MCPPromptMessage[]` | `ai.mcp.getPrompt("review", { topic: "API" })` |
| `ai.mcp.services.invoke` | 调用授权的远程工具 | 请求、认证主体和授权函数 | `HaiResult<CallToolResult>` | `ai.mcp.services.invoke(request, authorization)` |
| `ai.mcp.services.createBroker` | 为 ACP 会话挂载工具入口 | 固定 URL 和实时授权函数 | `HaiResult<MCPServiceBroker>` | `ai.mcp.services.createBroker(brokerOptions)` |
| `ai.mcp.servers.list` | 列出合并清单 | `none` | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.mcp.servers.list()` |
| `ai.mcp.servers.get` | 读取来源和版本 | `id: string` | `HaiResult<AIResourceEntry> with value/source/version?` | `ai.mcp.servers.get("tools")` |
| `ai.mcp.servers.register` | 登记数据库定义 | `MCPExternalServer input (id/transport/url or command)` | `HaiResult<AIResourceEntry>; config entries are read-only` | `ai.mcp.servers.register(mcpServerDefinition)` |
| `ai.mcp.servers.update` | 按版本替换定义 | `MCPExternalServer input (id/transport/url or command), expectedVersion?` | `HaiResult<AIResourceEntry>; full replacement, conflict fails` | `ai.mcp.servers.update(mcpServerDefinition, current.version)` |
| `ai.mcp.servers.remove` | 删除数据库定义 | `id, expectedVersion?; ACP definitions must have no session references` | `HaiResult<void>; external files/services are retained` | `ai.mcp.servers.remove("tools", current.version)` |

#### Scenario: Publish and call MCP

Register tools/resources/prompts, then call or read them. Remote server CRUD and services.invoke/createBroker have distinct inputs and authorization. Use and close returned brokers.

[Detailed parameters and workflows](ai.md#mcp)


#### Scenario: Maintain a stored definition

Supply a validated complete definition with an unused demo ID. File-backed entries are read-only. get supplies the version, update replaces the full definition, and remove retains external resources.

```ts
async function maintain_mcp_servers(definition: Parameters<typeof ai.mcp.servers.register>[0]) {
  // Persist the supplied MCP server definition and get its database version. Duplicate or configuration-owned IDs fail.
  const created = value(await ai.mcp.servers.register(definition))
  // List configured and database MCP server entries without arguments. Configuration takes precedence for duplicate IDs; the newly registered entry appears here.
  const listed = value(await ai.mcp.servers.list())
  // Look up the saved MCP server ID and its database version. A missing ID fails.
  const current = value(await ai.mcp.servers.get(definition.id))
  // Replace this MCP server definition using the observed version and get the new version. Stale versions and configuration-owned entries fail.
  const updated = value(await ai.mcp.servers.update(definition, current.version))
  // Delete the example MCP server entry against its latest version. Success has no data; a conflict or config-owned entry fails.
  value(await ai.mcp.servers.remove(definition.id, updated.version))
  return { created, listed, updated } // entries include value/source and database version
}
```

<a id="retrieval"></a>

### Register sources and rerank: `ai.retrieval`, `ai.rerank`

Register source collections before retrieval and optionally rerank the candidates afterward.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.retrieval.addSource` | 登记检索源 | `RetrievalSource: id, collection, optional metadata` | `void` | `ai.retrieval.addSource({ id: "docs", collection: "manual" })` |
| `ai.retrieval.removeSource` | 撤销检索源 | `sourceId: string` | `void` | `ai.retrieval.removeSource("docs")` |
| `ai.retrieval.listSources` | 列出可用检索源 | `none` | `direct Promise<RetrievalSource[]>` | `ai.retrieval.listSources()` |
| `ai.retrieval.retrieve` | 向量检索 | `RetrievalRequest: query, sources?, topK?, minScore?, enableRerank?` | `RetrievalResult` | `ai.retrieval.retrieve({ query: "部署" })` |
| `ai.rerank.rerank` | 重排文档对象 | `RerankRequest: query, documents, model?, topN?` | `RerankResponse with model/results` | `ai.rerank.rerank({ query: "部署", documents: ["配置说明"] })` |
| `ai.rerank.rerankTexts` | 重排文本候选 | `query, string[] texts, topN?` | `RerankItem[] with index/relevanceScore` | `ai.rerank.rerankTexts("部署", ["配置说明"], 1)` |
| `ai.retrieval.sources.list` | 列出合并清单 | `none` | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.retrieval.sources.list()` |
| `ai.retrieval.sources.get` | 读取来源和版本 | `id: string` | `HaiResult<AIResourceEntry> with value/source/version?` | `ai.retrieval.sources.get("docs")` |
| `ai.retrieval.sources.register` | 登记数据库定义 | `RetrievalSource input (id/collection)` | `HaiResult<AIResourceEntry>; config entries are read-only` | `ai.retrieval.sources.register(sourceDefinition)` |
| `ai.retrieval.sources.update` | 按版本替换定义 | `RetrievalSource input (id/collection), expectedVersion?` | `HaiResult<AIResourceEntry>; full replacement, conflict fails` | `ai.retrieval.sources.update(sourceDefinition, current.version)` |
| `ai.retrieval.sources.remove` | 删除数据库定义 | `id, expectedVersion?; ACP definitions must have no session references` | `HaiResult<void>; external files/services are retained` | `ai.retrieval.sources.remove("docs", current.version)` |

#### Scenario: Register sources and rerank

Prepare a populated manual collection matching the embedding dimensions, then register docs. Scores depend on the backend; removing a source retains its documents.

```ts
// Register docs for the manual vector collection. Success has no data; a duplicate ID fails.
value(await ai.retrieval.addSource({ id: 'docs', collection: 'manual' }))
try {
  // List retrieval sources without arguments. The returned array now includes docs.
  const sources = await ai.retrieval.listSources() // direct RetrievalSource[]
  // Find up to five deployment matches in docs, with citations. value throws on missing sources or retrieval failures.
  const found = value(await ai.retrieval.retrieve({ query: 'deployment', sources: ['docs'], topK: 5 }))
  // Rerank the two supplied documents for deployment relevance. The result includes ranked items and scores; provider errors throw through value.
  const ranked = value(await ai.rerank.rerank({ query: 'deployment', documents: ['Deployment guide', 'Refund policy'] }))
  // Rerank the same texts and return only the top-ranked text.
  const texts = value(await ai.rerank.rerankTexts('deployment', ['Deployment guide', 'Refund policy'], 1))
  // found has source candidates; ranked/texts carry original indexes and relevance scores.
}
finally {
  // Remove the docs source registered for this example. Success has no data; a missing source fails.
  value(await ai.retrieval.removeSource('docs'))
}
```


#### Scenario: Maintain a stored definition

Supply a validated complete definition with an unused demo ID. File-backed entries are read-only. get supplies the version, update replaces the full definition, and remove retains external resources.

```ts
async function maintain_retrieval_sources(definition: Parameters<typeof ai.retrieval.sources.register>[0]) {
  // Persist the supplied retrieval source definition and get its database version. Duplicate or configuration-owned IDs fail.
  const created = value(await ai.retrieval.sources.register(definition))
  // List configured and database retrieval source entries without arguments. Configuration takes precedence for duplicate IDs; the newly registered entry appears here.
  const listed = value(await ai.retrieval.sources.list())
  // Look up the saved retrieval source ID and its database version. A missing ID fails.
  const current = value(await ai.retrieval.sources.get(definition.id))
  // Replace this retrieval source definition using the observed version and get the new version. Stale versions and configuration-owned entries fail.
  const updated = value(await ai.retrieval.sources.update(definition, current.version))
  // Delete the example retrieval source entry against its latest version. Success has no data; a conflict or config-owned entry fails.
  value(await ai.retrieval.sources.remove(definition.id, updated.version))
  return { created, listed, updated } // entries include value/source and database version
}
```

<a id="rag"></a>

### Answer with sources and citations: `ai.rag`

Pass the question and registered sources to RAG, retain citations with answers and consume stream events incrementally.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.rag.query` | 带引用回答 | `query: string, RagOptions?` | `RagResult: answer, context, citations, query, model` | `ai.rag.query("如何部署？", { sources: ["docs"] })` |
| `ai.rag.queryStream` | 带引用流式回答 | `query: string, RagOptions?` | `AsyncIterable<RagStreamEvent>` | `ai.rag.queryStream("如何部署？", { sources: ["docs"] })` |

#### Scenario: Answer with sources and citations

```ts
// Retrieve deployment context from docs and ask the model. Success includes answer, context, and citations; value throws on retrieval or generation failure.
const answer = value(await ai.rag.query('How do I deploy?', { sources: ['docs'] }))
// answer contains answer, context, citations, query and model
// Stream the same deployment question over docs and consume context, text deltas, and the completion event.
for await (const event of ai.rag.queryStream('How do I deploy?', { sources: ['docs'] })) {
  // Render only events applicable to the UI; preserve citation events as references.
}
```

docs must be registered and authorized. Text varies and citations refer to retrieved content. A failed stream must not become a complete successful answer.

[Detailed parameters and workflows](ai.md#rag)

<a id="knowledge"></a>

### Publish, search and revoke knowledge: `ai.knowledge`

Publish document revisions from text or files, then retrieve or ask questions. Revoke visibility before cleanup and repair residual vectors.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.knowledge.setup` | 准备集合 | `KnowledgeSetupOptions?` | `void; collection ready for ingest` | `ai.knowledge.setup()` |
| `ai.knowledge.ingest` | 发布文本资料 | `{ documentId, content, title?, collection?, ...metadata }` | `KnowledgeIngestResult with revision/cleanupPending` | `ai.knowledge.ingest({ documentId: "intro", content: "入门正文" })` |
| `ai.knowledge.ingestFile` | 导入文件 | `KnowledgeIngestFileInput including file bytes and document identity` | `KnowledgeIngestResult` | `ai.knowledge.ingestFile(fileInput)` |
| `ai.knowledge.ingestBatch` | 批量导入 | `KnowledgeIngestInput[], onProgress?` | `KnowledgeIngestBatchResult with per-document outcomes` | `ai.knowledge.ingestBatch(documentInputs, onProgress)` |
| `ai.knowledge.retrieve` | 检索发布版本 | `query: string, KnowledgeRetrieveOptions?` | `KnowledgeRetrieveResult` | `ai.knowledge.retrieve("部署说明")` |
| `ai.knowledge.ask` | 基于知识回答 | `query: string, KnowledgeAskOptions?` | `KnowledgeAskResult` | `ai.knowledge.ask("如何恢复备份？")` |
| `ai.knowledge.findByEntity` | 按实体找资料 | `entityName: string, EntityQueryOptions?` | `EntityDocumentResult[]` | `ai.knowledge.findByEntity("订单")` |
| `ai.knowledge.listEntities` | 实体清单 | `EntityListOptions?` | `KnowledgeEntity[]` | `ai.knowledge.listEntities()` |
| `ai.knowledge.listDocuments` | 文档清单 | `KnowledgeDocumentListOptions?` | `KnowledgeDocumentInfo[]` | `ai.knowledge.listDocuments()` |
| `ai.knowledge.removeDocument` | 撤销文档 | `documentId, KnowledgeDocumentRemoveOptions?` | `void; may fail after visibility revocation if cleanup fails` | `ai.knowledge.removeDocument("intro")` |
| `ai.knowledge.repair` | 补偿残留向量 | `{ collection?, offset?, limit? }` | `KnowledgeRepairResult with progress` | `ai.knowledge.repair({ offset: 0, limit: 100 })` |
| `ai.knowledge.deleteCollection` | 撤销整个集合 | `collection name?` | `void; cleanup tombstone remains` | `ai.knowledge.deleteCollection("retired-manual")` |

#### Scenario: Publish, search and revoke knowledge

Existing vectors do not make a revision visible. This distinguishes revision preparation, conditional publication and cleanup of old vectors.

![Knowledge ingestion: prepare, publish, clean up](../images/function-ai-knowledge-publication.en.svg)

Only a published revision becomes current for retrieval. Cleanup failure can leave cleanupPending for repair. Removal revokes visibility before cleanup. Retrieval must check the published revision rather than trusting any old chunk still in the vector store.

```ts
// Set up the default knowledge collection and revision records with no arguments. Success has no data; setup failure blocks ingestion.
value(await ai.knowledge.setup())
// Ingest the restart instruction as demo-intro. Success returns the published revision, chunk details, and cleanupPending.
const published = value(await ai.knowledge.ingest({ documentId: 'demo-intro', content: 'Restart the service after updating configuration.' }))
// Retrieve restart guidance from the default collection with citations. value throws on a retrieval failure.
const matches = value(await ai.knowledge.retrieve('When should the service restart?'))
// Answer the same restart question using retrieved evidence. Success includes the answer and references; value throws on failure.
const answer = value(await ai.knowledge.ask('When should the service restart?'))
// Read visible documents from the default collection; the list includes demo-intro.
const documents = value(await ai.knowledge.listDocuments())
// List entities with no arguments. Actual entries depend on extraction.
const entities = value(await ai.knowledge.listEntities())
// Find documents associated with entity service. With no match, the list is empty.
const related = value(await ai.knowledge.findByEntity('service'))
// Remove the visible revision for the ingested document ID. Success has no data; handle cleanup failure.
value(await ai.knowledge.removeDocument('demo-intro')) // no longer visible to retrieval
// Reconcile expired staging or old vectors for up to 100 records from offset 0. Success returns repair progress.
const repaired = value(await ai.knowledge.repair({ offset: 0, limit: 100 })) // cleanup progress
```

Use an isolated test collection. Revisions, retrieval and cleanup depend on storage and models. File/batch ingestion, progress callbacks, entity queries and collection deletion follow.

[Detailed parameters and workflows](ai.md#knowledge)

<a id="memory"></a>

### Save and recall scoped memory: `ai.memory`

Bind a trusted objectId and optional topic scope before memory access; keep administrative deletion separate.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.memory.scoped` | 绑定可信主体 | `{ objectId: nonempty string, scope? }` | `direct ScopedMemoryOperations; invalid binding throws TypeError` | `ai.memory.scoped({ objectId: "u1", scope: { topicId: "orders" } })` |
| `ai.memory.extract` | 提取事实记忆 | `ChatMessage[], { objectId, scope?, model?, signal?, ...options }` | `MemoryEntry[]` | `ai.memory.extract(messages, { objectId: "u1" })` |
| `ai.memory.add` | 保存明确事实 | `MemoryEntryInput: objectId, content, type, scope?` | `MemoryEntry` | `ai.memory.add({ objectId: "u1", content: "偏好中文", type: "preference" })` |
| `ai.memory.get` | 授权读取记忆 | `memoryId, { objectId, scope? } for untrusted IDs` | `MemoryEntry` | `ai.memory.get(memoryId, { objectId: "u1" })` |
| `ai.memory.update` | 更新已有事实 | `memoryId, MemoryUpdateInput, trusted access scope` | `MemoryEntry` | `ai.memory.update(memoryId, { content: "偏好日文" }, { objectId: "u1" })` |
| `ai.memory.remove` | 删除授权记忆 | `memoryId, trusted access scope` | `void` | `ai.memory.remove(memoryId, { objectId: "u1" })` |
| `ai.memory.recall` | 召回相关事实 | `query, { objectId, scope?, topK?, types?, ...options }` | `MemoryEntry[]` | `ai.memory.recall("语言偏好", { objectId: "u1" })` |
| `ai.memory.injectMemories` | 补充对话上下文 | `ChatMessage[], { objectId, scope?, topK?, ...options }` | `ChatMessage[]` | `ai.memory.injectMemories(messages, { objectId: "u1" })` |
| `ai.memory.list` | 读取完整列表 | `MemoryListOptions with objectId/scope filters` | `MemoryEntry[]; incomplete scan fails` | `ai.memory.list({ objectId: "u1" })` |
| `ai.memory.listPage` | 分页浏览记忆 | `MemoryListPageOptions with objectId/pagination` | `StorePage<MemoryEntry>` | `ai.memory.listPage({ objectId: "u1", offset: 0, limit: 20 })` |
| `ai.memory.clear` | 清理指定范围 | `nonempty MemoryClearOptions` | `void; empty filters are rejected` | `ai.memory.clear({ objectId: "u1" })` |
| `ai.memory.admin.clearAll` | 可信管理员全清 | `{ confirm: true }; require host administrator authorization` | `void; destructive across subjects` | `ai.memory.admin.clearAll({ confirm: true })` |

#### Scenario: Save and recall scoped memory

Use a trusted session subject throughout. Add, read, update, recall and remove only the demo entry; administrator-wide clearing is a separate operation.

```ts
async function rememberPreference(objectId: string) {
  // Bind the trusted subject and demo-preference topic to a memory instance for subsequent calls.
  const memory = ai.memory.scoped({ objectId, scope: { topicId: 'demo-preference' } })
  // Store the Chinese-reply preference in the bound scope. Success returns the entry and ID; persistence or embedding failure throws through value.
  const saved = value(await memory.add({ content: 'Prefers Chinese replies', type: 'preference' }))
  const access = { objectId, scope: { topicId: 'demo-preference' } }
  // Read the saved ID in the same subject and topic. Missing or out-of-scope entries fail.
  value(await ai.memory.get(saved.id, access))
  // Change this scoped entry to Japanese replies. Success returns the updated memory with a recalculated embedding; errors throw through value.
  value(await ai.memory.update(saved.id, { content: 'Prefers Japanese replies' }, access))
  // Find language preference memories in the bound scope. No match gives an empty array.
  const recalled = value(await memory.recall('language preference'))
  const messages = [{ role: 'user' as const, content: 'Hello' }]
  // Inject relevant scoped memories into a new list based on the Hello messages.
  const enriched = value(await ai.memory.injectMemories(messages, access))
  // Analyze the Hello message and persist any extracted memories in the same scope. The returned array can be empty.
  const extracted = value(await ai.memory.extract(messages, access))
  // List memories for the same subject and topic; value throws on read failure.
  const all = value(await ai.memory.list(access))
  // Read up to 20 scoped entries from offset 0 and their pagination information.
  const page = value(await ai.memory.listPage({ ...access, offset: 0, limit: 20 }))
  // Delete the original preference using its ID and scope. Success has no data; a scope mismatch fails.
  value(await ai.memory.remove(saved.id, access))
  // Clear the remaining preference entries only within the bound subject and topic. Success has no data.
  value(await memory.clear({ types: ['preference'] }))
  return { recalled, enriched, extracted, all, page }
}
```

<a id="personas"></a>

### Maintain personas and prompts: `ai.persona`

Personas define role and tone while memory stores facts. Identical persona names remain isolated by owner.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.persona.save` | 保存角色 | `PersonaProfileInput: id, name, systemPrompt, objectId?, traits?` | `PersonaProfile` | `ai.persona.save(personaProfile)` |
| `ai.persona.get` | 读取角色 | `id, { objectId }?; omitted subject selects system profile` | `PersonaProfile` | `ai.persona.get("tutor", { objectId: "u1" })` |
| `ai.persona.update` | 更新角色 | `id, PersonaProfileUpdate, { objectId }?` | `PersonaProfile` | `ai.persona.update("tutor", updates, { objectId: "u1" })` |
| `ai.persona.remove` | 删除角色 | `id, { objectId }?` | `void` | `ai.persona.remove("tutor", { objectId: "u1" })` |
| `ai.persona.list` | 列出主体角色 | `{ objectId }?` | `PersonaProfile[]` | `ai.persona.list({ objectId: "u1" })` |
| `ai.persona.compose` | 生成系统提示词 | `id, { objectId }?` | `string prompt` | `ai.persona.compose("tutor", { objectId: "u1" })` |

#### Scenario: Maintain personas and prompts

Use demo-tutor under one subject; compose returns prompt text without changing model permissions.

```ts
async function usePersona(objectId: string) {
  const access = { objectId }
  // Save demo-tutor with the stated prompt for this subject. Success returns the full profile; value throws on storage failure.
  value(await ai.persona.save({ id: 'demo-tutor', objectId, name: 'Tutor', systemPrompt: 'Explain terms clearly.' }))
  // Read the profile ID in the same subject scope. A missing profile makes value throw.
  value(await ai.persona.get('demo-tutor', access))
  // Rename this subject's demo-tutor to Order tutor and return the updated profile.
  value(await ai.persona.update('demo-tutor', { name: 'Order tutor' }, access))
  // List profiles for this subject, including the updated profile.
  const profiles = value(await ai.persona.list(access))
  // Compose the system prompt for this scoped persona ID. Success gives text; a missing profile fails.
  const prompt = value(await ai.persona.compose('demo-tutor', access))
  // Remove the example profile for this subject. Success has no data.
  value(await ai.persona.remove('demo-tutor', access))
  return { profiles, prompt }
}
```

<a id="token-summary"></a>

### Estimate and compress context: `ai.token`, `summary`, `compress`

Estimate message budgets before summarizing or compressing. Estimates are not exact provider billing counts.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.token.estimateText` | 估算单段 Token | `text: string` | `direct number; estimate, not billing usage` | `ai.token.estimateText("Hello 世界")` |
| `ai.token.estimateMessages` | 估算消息 Token | `ChatMessage[]` | `direct number including protocol overhead` | `ai.token.estimateMessages(messages)` |
| `ai.summary.generate` | 生成摘要文本 | `ChatMessage[], SummaryOptions?` | `string` | `ai.summary.generate(messages)` |
| `ai.summary.summarize` | 生成摘要及覆盖信息 | `ChatMessage[], SummaryOptions?` | `{ summary, tokenCount, coveredMessages }` | `ai.summary.summarize(messages)` |
| `ai.compress.tryCompress` | 按预算压缩 | `ChatMessage[], { strategy?, maxTokens?, preserveLastN?, ...options }` | `CompressResult: messages and original/compressed token counts` | `ai.compress.tryCompress(messages, { maxTokens: 4000 })` |

#### Scenario: Estimate and compress context

```ts
const messages = [{ role: 'user' as const, content: 'Order is pending.' }]
// Estimate tokens for the literal text locally. The result is approximate.
const textTokens = ai.token.estimateText('Order is pending.') // estimate number
// Estimate the one user message above, including message overhead.
const messageTokens = ai.token.estimateMessages(messages) // estimate including message overhead
```

Concrete text and messages produce nonnegative estimates. Summary and compression call real models; options determine summaries and preserved messages.

[Detailed parameters and workflows](ai.md#token-summary)

<a id="contexts"></a>

### Manage sessions and turns: `ai.context`

Create or restore a manager, add messages, chat and persist. Commit voice turns after confirmed delivery.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.context.createManager` | 开始多轮对话 | `ContextManagerOptions with scope { objectId, sessionId }` | `ContextManager` | `ai.context.createManager({ scope: { objectId: "u1", sessionId: "s1" } })` |
| `ai.context.restoreManager` | 恢复对话 | `{ objectId, sessionId }, options?` | `ContextManager` | `ai.context.restoreManager({ objectId: "u1", sessionId: "s1" })` |
| `ai.context.listSessions` | 列出可恢复会话 | `objectId` | `SessionInfo[]` | `ai.context.listSessions("u1")` |
| `ai.context.renameSession` | 修改会话标题 | `scope, title` | `void` | `ai.context.renameSession({ objectId: "u1", sessionId: "s1" }, "订单讨论")` |
| `ai.context.removeSession` | 删除指定会话 | `scope` | `void; tombstone prevents scope reuse` | `ai.context.removeSession({ objectId: "u1", sessionId: "s1" })` |
| `manager.addMessage` | 补充对话消息 | `ChatMessage` | `Promise<HaiResult<void>>` | `manager.addMessage({ role: "user", content: "你好" })` |
| `manager.getMessages` | 读取对话快照 | `none` | `HaiResult<ChatMessage[]>` | `manager.getMessages()` |
| `manager.reload` | 刷新共享快照 | `none` | `Promise<HaiResult<void>>` | `manager.reload()` |
| `manager.getTokenUsage` | 观察上下文预算 | `none` | `HaiResult<{ current, budget }>` | `manager.getTokenUsage()` |
| `manager.getSummaries` | 读取摘要 | `none` | `HaiResult<SummaryResult[]>` | `manager.getSummaries()` |
| `manager.save` | 持久保存 | `none` | `Promise<HaiResult<void>>` | `manager.save()` |
| `manager.flush` | 等待后台记忆写入 | `none` | `Promise<HaiResult<void>>` | `manager.flush()` |
| `manager.reset` | 终止并重置对话 | `ContextResetOptions?` | `Promise<HaiResult<void>>` | `manager.reset({ preserveSystemPrompt: true })` |
| `manager.getTurns` | 读取真实轮次 | `none` | `HaiResult<ConversationTurn[]>` | `manager.getTurns()` |
| `manager.markTurnSpeaking` | 记录开始播放 | `turnId` | `Promise<HaiResult<void>>` | `manager.markTurnSpeaking(turnId)` |
| `manager.commitTurn` | 提交已表达内容 | `turnId, { text? }` | `Promise<HaiResult<void>>` | `manager.commitTurn(turnId, { text: spokenText })` |
| `manager.interruptTurn` | 提交打断前内容 | `turnId, { text? }` | `Promise<HaiResult<void>>` | `manager.interruptTurn(turnId, { text: spokenText })` |
| `manager.consolidate` | 固化长期记忆 | `ConsolidateOptions?` | `Promise<HaiResult<{ summary, memories }>>` | `manager.consolidate({ scope: { personaId: "tutor" } })` |
| `manager.chat` | 多轮回答 | `message: string, ContextChatOptions?` | `Promise<HaiResult<ContextChatResult>>` | `manager.chat("请继续")` |
| `manager.chatStream` | 多轮流式回答 | `message: string, ContextChatOptions?` | `AsyncIterable<ContextStreamEvent>` | `manager.chatStream("请继续")` |

#### Scenario: Manage sessions and turns

Several requests or nodes may share one scope. This shows chat generation and persistence; streamed audio uses prepareTurn / commitTurn to retain what was actually played.

![Context manager: committing one turn](../images/function-ai-context-turn.en.svg)

Execution ownership precedes turn mutation, and final writes still verify version and deadline. reject returns busy; queue waits. Memory extraction may continue in the background. Check save/flush results: generation completion does not prove persistence or memory success.

Factories and manager methods below connect messages, budget, chat, save/flush, reload/reset and turn commits. Session listing, renaming and deletion address persisted data, not an automatically managed background service.

[Detailed parameters and workflows](ai.md#contexts)

<a id="files"></a>

### Parse text and files: `ai.file`

Node runs installed PDF and DOCX parsers in a Worker and offloads large HTML extraction. A local parser failure can fall back to OCR. The video tool validates and unpacks captures and compresses its render project in a Worker. The managed job renders the video.

Validate file type and size before extracting text; OCR formats require configured models.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.file.parse` | 识别文件并提取 | `FileParseRequest with content, filename, options?` | `FileParseResult; extraction is not HTML sanitization` | `ai.file.parse({ content: "<p>正文</p>", filename: "intro.html" })` |
| `ai.file.parseText` | 直接提取文本 | `Buffer\|string content, filename?` | `string` | `ai.file.parseText("Hello", "intro.txt")` |

#### Scenario: Parse text and files

```ts
// Parse the supplied order-status text into the common document result. value throws on a parse error.
const plain = value(await ai.file.parseText('Order status: pending.')) // parsed text result
```

parse takes a file input and parseText takes text. Outputs carry text and metadata for later chunking/indexing. Unsupported formats or read failures stop ingestion.

[Detailed parameters and workflows](ai.md#files)

<a id="reasoning"></a>

### Run multi-step reasoning: `ai.reasoning`

Use an explicit reasoning request for complex tasks and consume final results or stream events under host tool authorization.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.reasoning.run` | 多步骤求解 | `query, ReasoningOptions including strategy/tools?` | `ReasoningResult` | `ai.reasoning.run("审查方案", { strategy: "cot" })` |
| `ai.reasoning.runStream` | 观察推理过程 | `query, ReasoningOptions?` | `AsyncIterable<ReasoningStreamEvent>` | `ai.reasoning.runStream("审查方案", { strategy: "react" })` |

#### Scenario: Run multi-step reasoning

run takes a problem/options and returns a reasoning result. runStream yields events; text and order depend on the model and iteration failures must be reported.

[Detailed parameters and workflows](ai.md#reasoning)

<a id="audio"></a>

### Transcribe and synthesize audio: `ai.audio`

Inspect model capabilities before choosing complete or streaming audio. Browser WebSockets authenticate with server-issued short-lived tickets.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.audio.transcribe` | 识别完整音频 | `TranscriptionRequest: audio, language?, model?, signal?` | `TranscriptionResult: text, language?, segments?` | `ai.audio.transcribe({ audio: { data: wavBytes, format: "wav" } })` |
| `ai.audio.transcribeStream` | 持续语音识别 | `TranscriptionStreamRequest: chunks or complete audio` | `AsyncIterable<TranscriptionEvent>` | `ai.audio.transcribeStream(transcriptionInput)` |
| `ai.audio.synthesize` | 合成完整语音 | `SynthesisRequest: text, language?, model?, signal?` | `SynthesisResult: audio and duration metadata` | `ai.audio.synthesize({ text: "你好" })` |
| `ai.audio.synthesizeStream` | 按段合成 | `SynthesisStreamRequest: text segment or async segments` | `AsyncIterable<SynthesisEvent>` | `ai.audio.synthesizeStream(synthesisInput)` |
| `ai.audio.getCapabilities` | 先检查模型能力 | `{ operation: transcribe\|synthesize, model? }` | `AudioModelCapabilities` | `ai.audio.getCapabilities({ operation: "synthesize" })` |
| `ai.audio.models.list` | 列出合并清单 | `none` | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.audio.models.list()` |
| `ai.audio.models.get` | 读取来源和版本 | `id: string` | `HaiResult<AIResourceEntry> with value/source/version?` | `ai.audio.models.get("speech")` |
| `ai.audio.models.register` | 登记数据库定义 | `AudioModelEntry input (id/provider/model/operations)` | `HaiResult<AIResourceEntry>; config entries are read-only` | `ai.audio.models.register(audioModelDefinition)` |
| `ai.audio.models.update` | 按版本替换定义 | `AudioModelEntry input (id/provider/model/operations), expectedVersion?` | `HaiResult<AIResourceEntry>; full replacement, conflict fails` | `ai.audio.models.update(audioModelDefinition, current.version)` |
| `ai.audio.models.remove` | 删除数据库定义 | `id, expectedVersion?; ACP definitions must have no session references` | `HaiResult<void>; external files/services are retained` | `ai.audio.models.remove("speech", current.version)` |

#### Scenario: Transcribe and synthesize audio

ASR takes real audio bytes and TTS text, returning transcription or formatted audio. Stream methods yield events/bytes. Model CRUD uses stable names; credential checks are described in lifecycle.

[Detailed parameters and workflows](ai.md#audio)


#### Scenario: Maintain a stored definition

Supply a validated complete definition with an unused demo ID. File-backed entries are read-only. get supplies the version, update replaces the full definition, and remove retains external resources.

```ts
async function maintain_audio_models(definition: Parameters<typeof ai.audio.models.register>[0]) {
  // Persist the supplied audio model definition and get its database version. Duplicate or configuration-owned IDs fail.
  const created = value(await ai.audio.models.register(definition))
  // List configured and database audio model entries without arguments. Configuration takes precedence for duplicate IDs; the newly registered entry appears here.
  const listed = value(await ai.audio.models.list())
  // Look up the saved audio model ID and its database version. A missing ID fails.
  const current = value(await ai.audio.models.get(definition.id))
  // Replace this audio model definition using the observed version and get the new version. Stale versions and configuration-owned entries fail.
  const updated = value(await ai.audio.models.update(definition, current.version))
  // Delete the example audio model entry against its latest version. Success has no data; a conflict or config-owned entry fails.
  value(await ai.audio.models.remove(definition.id, updated.version))
  return { created, listed, updated } // entries include value/source and database version
}
```

<a id="images"></a>

### Generate images and manage models: `ai.image`

Generate images from prompts and configured models. Successful results contain image bytes and MIME types; the application stores and displays them.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.image.generate` | 生成或参考图片 | `{ prompt, referenceImages?, model?, size?, signal? }` | `{ images: GeneratedImage[] } with bytes/MIME` | `ai.image.generate({ prompt: "一座灯塔" })` |
| `ai.image.models.list` | 列出合并清单 | `none` | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.image.models.list()` |
| `ai.image.models.get` | 读取来源和版本 | `id: string` | `HaiResult<AIResourceEntry> with value/source/version?` | `ai.image.models.get("poster")` |
| `ai.image.models.register` | 登记数据库定义 | `ImageModelEntry input (id/provider/model)` | `HaiResult<AIResourceEntry>; config entries are read-only` | `ai.image.models.register(imageModelDefinition)` |
| `ai.image.models.update` | 按版本替换定义 | `ImageModelEntry input (id/provider/model), expectedVersion?` | `HaiResult<AIResourceEntry>; full replacement, conflict fails` | `ai.image.models.update(imageModelDefinition, current.version)` |
| `ai.image.models.remove` | 删除数据库定义 | `id, expectedVersion?; ACP definitions must have no session references` | `HaiResult<void>; external files/services are retained` | `ai.image.models.remove("poster", current.version)` |

#### Scenario: Generate images and manage models

generate takes a prompt and returns image data with model information. Format, size and storage prerequisites follow. Model management does not generate images.

[Detailed parameters and workflows](ai.md#images)


#### Scenario: Maintain a stored definition

Supply a validated complete definition with an unused demo ID. File-backed entries are read-only. get supplies the version, update replaces the full definition, and remove retains external resources.

```ts
async function maintain_image_models(definition: Parameters<typeof ai.image.models.register>[0]) {
  // Persist the supplied image model definition and get its database version. Duplicate or configuration-owned IDs fail.
  const created = value(await ai.image.models.register(definition))
  // List configured and database image model entries without arguments. Configuration takes precedence for duplicate IDs; the newly registered entry appears here.
  const listed = value(await ai.image.models.list())
  // Look up the saved image model ID and its database version. A missing ID fails.
  const current = value(await ai.image.models.get(definition.id))
  // Replace this image model definition using the observed version and get the new version. Stale versions and configuration-owned entries fail.
  const updated = value(await ai.image.models.update(definition, current.version))
  // Delete the example image model entry against its latest version. Success has no data; a conflict or config-owned entry fails.
  value(await ai.image.models.remove(definition.id, updated.version))
  return { created, listed, updated } // entries include value/source and database version
}
```

<a id="acp"></a>

### Manage agents, workspaces and ACP sessions: `ai.acp`

Bind trusted identity, register agents/workspaces and create sessions. Verify approved snapshots and patches before repository publication.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.acp.scoped` | 给当前工作区或用户创建限定范围的 Agent API | 由应用认证后提供 `RunnerScope` | `plan`; `sessions`; `tasks`; `approvals` | `const agent = ai.acp.scoped(identity)` |
| `scoped.tasks.findSubmission` | Recover an accepted turn receipt | Original session ID and submission idempotency key | `HaiResult<{ taskId, status }\|null>` with `null` when no execution is found | `await scoped.tasks.findSubmission(sessionId, turnKey)` |
| `ai.acp.agents.list` | 列出合并清单 | `none` | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.acp.agents.list()` |
| `ai.acp.agents.get` | 读取来源和版本 | `id: string` | `HaiResult<AIResourceEntry> with value/source/version?` | `ai.acp.agents.get("coder")` |
| `ai.acp.agents.register` | 登记数据库定义 | `ACPAgent input (id/mode/adapter/modelIds)` | `HaiResult<AIResourceEntry>; config entries are read-only` | `ai.acp.agents.register(agentDefinition)` |
| `ai.acp.agents.update` | 按版本替换定义 | `ACPAgent input (id/mode/adapter/modelIds), expectedVersion?` | `HaiResult<AIResourceEntry>; full replacement, conflict fails` | `ai.acp.agents.update(agentDefinition, current.version)` |
| `ai.acp.agents.remove` | 删除数据库定义 | `id, expectedVersion?; ACP definitions must have no session references` | `HaiResult<void>; external files/services are retained` | `ai.acp.agents.remove("coder", current.version)` |
| `ai.acp.workspaces.list` | 列出合并清单 | `none` | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.acp.workspaces.list()` |
| `ai.acp.workspaces.get` | 读取来源和版本 | `id: string` | `HaiResult<AIResourceEntry> with value/source/version?` | `ai.acp.workspaces.get("project")` |
| `ai.acp.workspaces.register` | 登记数据库定义 | `ACPWorkspace input (id/storage/repositories)` | `HaiResult<AIResourceEntry>; config entries are read-only` | `ai.acp.workspaces.register(workspaceDefinition)` |
| `ai.acp.workspaces.update` | 按版本替换定义 | `ACPWorkspace input (id/storage/repositories), expectedVersion?` | `HaiResult<AIResourceEntry>; full replacement, conflict fails` | `ai.acp.workspaces.update(workspaceDefinition, current.version)` |
| `ai.acp.workspaces.remove` | 删除数据库定义 | `id, expectedVersion?; ACP definitions must have no session references` | `HaiResult<void>; external files/services are retained` | `ai.acp.workspaces.remove("project", current.version)` |
| `ai.acp.agents.initialize` | 预检适配器配置 | `agentId, modelId?` | `HaiResult<{ agentId, mode, modelIds }>; no credentials` | `ai.acp.agents.initialize("coder")` |
| `ai.acp.agents.check` | 实际连接并握手 | `agentId, { workspaceId?, ...ACPClientOptions }` | `HaiResult<native initialize response>; owned connection is closed` | `ai.acp.agents.check("coder", { workspaceId: "project" })` |
| `ai.acp.workspaces.prepare` | 准备工作目录 | `workspaceId` | `HaiResult<main absolute path>; dirty content is retained` | `ai.acp.workspaces.prepare("project")` |
| `ai.acp.workspaces.importFiles` | 导入受控文件 | `workspaceId, { path: relative path, content: string\|Uint8Array }[]` | `HaiResult<{ imported: string[] }>; no overwrite` | `ai.acp.workspaces.importFiles("project", [{ path: "notes.txt", content: "需求" }])` |
| `ai.acp.sessions.create` | 启动受管开发会话 | `ACPCreateSessionOptions: agentId/workspaceId/newWorktree?` | `HaiResult<managed session handle>` | `ai.acp.sessions.create({ agentId: "coder", workspaceId: "project", newWorktree: true })` |
| `ai.acp.sessions.get` | 读取会话句柄 | `framework session id` | `HaiResult<managed session handle>; does not resume` | `ai.acp.sessions.get("task-1")` |
| `ai.acp.sessions.list` | 查询受管会话 | `workspaceId?` | `HaiResult<ACPSessionInfo[]>` | `ai.acp.sessions.list("project")` |
| `ai.acp.sessions.resume` | Resume or reopen the native session | Framework session ID, connection callbacks, optional `restartNative` (default `false`) | `HaiResult` with a session handle. Changed definitions, an invalid worktree or a busy session can prevent recovery | `ai.acp.sessions.resume("task-1")` |
| `ai.acp.sessions.close` | 停止拥有的执行环境 | `framework session id` | `HaiResult<void>; source and native history retained` | `ai.acp.sessions.close("task-1")` |
| `ai.acp.sessions.reclaimWorktree` | 回收干净检出目录 | `closed framework session id; preview stopped and changes saved` | `HaiResult<void>; branch and normal files retained` | `ai.acp.sessions.reclaimWorktree("task-1")` |
| `ai.acp.sessions.remove` | 移除会话记录 | `closed or failed framework session id` | `HaiResult<void>; worktree and native history retained` | `ai.acp.sessions.remove("task-1")` |
| `ai.acp.connect` | 接入原生传输 | `ACPTransport: stdio/http/ws, ACPClientOptions?` | `HaiResult<connection handle>` | `ai.acp.connect({ type: "http", url: "https://agent.example.com/acp" })` |
| `ai.acp.close` | 关闭子系统 | `none; normally call ai.close()` | `Promise<void>; cleanup may throw` | `ai.acp.close()` |
| `session.info` | 读取受管会话 | `none` | `Promise<HaiResult<ACPSessionInfo>>` | `session.info()` |
| `session.prompt` | 执行一轮开发 | `ContentBlock[], AbortSignal?` | `Promise<HaiResult<{ text, stopReason, events }>>` | `session.prompt([{ type: "text", text: "检查工程" }])` |
| `session.promptStructured` | 校验一份 JSON | `ContentBlock[], Zod schema, AbortSignal?` | `Promise<HaiResult<schema-inferred T>>` | `session.promptStructured(content, OutputSchema)` |
| `session.stream` | 观察原生事件 | `ContentBlock[], AbortSignal?` | `AsyncIterable<SessionNotification>; failure throws` | `session.stream([{ type: "text", text: "检查工程" }])` |
| `session.cancel` | 取消当前轮次 | `none` | `Promise<HaiResult<void>>` | `session.cancel()` |
| `session.setMode` | 选择已公布模式 | `native mode ID` | `Promise<HaiResult<native mode response>>` | `session.setMode("code")` |
| `session.setConfigOption` | 设置已公布选项 | `native option key and allowed value` | `Promise<HaiResult<native config response>>` | `session.setConfigOption("model", "coding")` |
| `session.updateMain` | 仅快进更新主分支 | `none; execution and preview must be stopped` | `Promise<HaiResult<ACPGitReport[]>>; partial failure reports in cause` | `session.updateMain()` |
| `session.publish` | 提交并推送 | `{ mode, message, author }; managed isolated session only` | `Promise<HaiResult<ACPGitReport[]>>` | `session.publish(publishOptions)` |
| `session.close` | 停止执行保留状态 | `none` | `Promise<HaiResult<void>>` | `session.close()` |
| `connection.authenticate` | 原生认证 | `advertised authentication method ID` | `Promise<HaiResult<native auth response>>` | `connection.authenticate("api-key")` |
| `connection.createSession` | 创建低层原生会话 | `absolute remote cwd, McpServer[]?` | `Promise<HaiResult<{ id, prompt, cancel }>>` | `connection.createSession("/workspace/project", [])` |
| `connection.listSessions` | 原生分页会话 | `cursor?` | `Promise<HaiResult<native paginated response>>` | `connection.listSessions()` |
| `connection.deleteSession` | 删除原生会话 | `native session ID` | `Promise<HaiResult<native delete response>>` | `connection.deleteSession(nativeId)` |
| `connection.close` | 关闭低层连接 | `none` | `Promise<HaiResult<void>>` | `connection.close()` |
| `ai.acp.registerManagedExecutors` | Register managed ACP executors with Runner | No arguments; called during normal initialization | `void` | `ai.acp.registerManagedExecutors()` |
| `ai.acp.workspaces.readGitSnapshot` | Read a workspace Git snapshot | `{ directory, revision, maxBytes? }`: authorized absolute repository path and revision; `maxBytes` defaults to 16 MiB; optional second argument `signal` cancels the operation | `Promise<HaiResult<ACPProjectSnapshot>>` | `await ai.acp.workspaces.readGitSnapshot({ directory, revision })` |
| `ai.acp.workspaces.diffSnapshot` | Compare workspace snapshots | `before, after: Record<string, string>`: relative paths mapped to Base64 file contents; optional third argument `signal` | `Promise<HaiResult<ACPProjectChanges>>` | `await ai.acp.workspaces.diffSnapshot(before, after)` |
| `ai.acp.workspaces.publishSnapshot` | Publish an approved workspace snapshot | `ACPPublishSnapshot`: source directory, remote, base revision, approved patch, task branch, date and author; optional second argument `signal` | `Promise<HaiResult<{ branch: string, commit: string }>>` | `await ai.acp.workspaces.publishSnapshot(approvedSnapshot)` |

#### Scenario: Manage agents, workspaces and ACP sessions

Managed ACP connects application identity, durable Runner tasks and the native agent. plan describes resources without allocating a container.

![Managed ACP: acceptance, execution and results](../images/function-ai-acp-task.en.svg)

submit returns a resumable receipt; run waits for its result. Acceptance is not completion. After disconnect, use the same identity and taskId for events/get. Cancellation requires checking execution and cleanup; publishing a patch requires renewed authorization and user approval.

If the submission response is lost, load the original session ID and idempotency key from durable storage and call `tasks.findSubmission`. It also restores the receipt index. Use the returned `taskId` to read events, check status or request cancellation. A `null` result means no execution record is currently available and the application can keep the turn pending verification.

The workflow covers resource CRUD, preparation, sessions and returned handles. Identity comes from the server. updateMain/publish mutate repositories; documentation checks do not publish anything.

Use `ai.acp.sessions.resume(id)` to recover the original native history. Agent definitions are compared by JSON content regardless of object key order. After a preparation interruption, a trusted server that holds the task execution lease can use `ai.acp.sessions.resume(id, { restartNative: true })` if durable task state proves the first turn was never sent. Once the old execution environment has stopped and the Git worktree has been verified, the new native session uses the original framework session ID, directory, branch and files. Use default recovery if the first turn was sent or its dispatch status is uncertain.

[Detailed parameters and workflows](ai.md#acp)

#### Scenario: Preview a Git change before publication

Run this on Node.js after authorizing the absolute repository directory and revision. The sample revision has no `notes.txt`. Reading and comparing snapshots produces a patch without changing or pushing the source repository.

```ts
import type { ACPPublishSnapshot } from '@h-ai/ai'
import { ai } from '@h-ai/ai'

async function previewChange(directory: string, revision: string) {
  // Read a snapshot for the supplied directory and Git revision, including the resolved revision. A read failure returns an error.
  const snapshot = await ai.acp.workspaces.readGitSnapshot({ directory, revision })
  if (!snapshot.success)
    return snapshot
  const before = snapshot.data.files
  const after = { ...before, 'notes.txt': 'aGVsbG8K' }
  // Compare the snapshot with the copy containing notes.txt. Success gives changed paths and a Git patch; diff failure returns an error.
  const changes = await ai.acp.workspaces.diffSnapshot(before, after)
  if (!changes.success)
    return changes
  return { revision: snapshot.data.revision, ...changes.data }
}

async function publishApprovedChange(approvedSnapshot: ACPPublishSnapshot) {
  // Publish the approved snapshot to its authorized branch. Success returns branch and commit IDs; publication failure returns an error.
  const result = await ai.acp.workspaces.publishSnapshot(approvedSnapshot)
  if (!result.success)
    return result
  return result.data
}
```

The Base64 value decodes to `hello` plus a newline. Preview returns the resolved revision, `paths: ['notes.txt']` and its Git patch. Call the second function only after rechecking authorization and obtaining approval for the exact remote, `agent/` branch and patch. Publication returns the branch and actual commit ID; on failure inspect the remote before retrying. Normal `ai.init(..., { runner })` already calls `ai.acp.registerManagedExecutors()`.


#### Scenario: Maintain a stored definition

Supply a validated complete definition with an unused demo ID. File-backed entries are read-only. get supplies the version, update replaces the full definition, and remove retains external resources.

```ts
async function maintain_acp_agents(definition: Parameters<typeof ai.acp.agents.register>[0]) {
  // Persist the supplied ACP agent definition and get its database version. Duplicate or configuration-owned IDs fail.
  const created = value(await ai.acp.agents.register(definition))
  // List configured and database ACP agent entries without arguments. Configuration takes precedence for duplicate IDs; the newly registered entry appears here.
  const listed = value(await ai.acp.agents.list())
  // Look up the saved ACP agent ID and its database version. A missing ID fails.
  const current = value(await ai.acp.agents.get(definition.id))
  // Replace this ACP agent definition using the observed version and get the new version. Stale versions and configuration-owned entries fail.
  const updated = value(await ai.acp.agents.update(definition, current.version))
  // Delete the example ACP agent entry against its latest version. Success has no data; a conflict or config-owned entry fails.
  value(await ai.acp.agents.remove(definition.id, updated.version))
  return { created, listed, updated } // entries include value/source and database version
}
```

<a id="a2a"></a>

### Publish and call remote agents: `ai.a2a`

Publish Agent Cards, register executors and handle A2A requests with host-validated addresses, identity and task ownership.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.a2a.registerExecutor` | 注册任务执行器 | `SDK AgentExecutor` | `void` | `ai.a2a.registerExecutor(executor)` |
| `ai.a2a.getAgentCard` | 提供标准发现文档 | `none; configured a2a card` | `A2AAgentCardDocument (A2A 1.0 ProtoJSON)` | `ai.a2a.getAgentCard()` |
| `ai.a2a.handleRequest` | 处理认证的协议请求 | `unknown JSON-RPC body, trusted context.agentId?` | `direct Promise<A2AHandleResult>; JSON-RPC/SSE outcome` | `ai.a2a.handleRequest(body, { agentId: trustedAgentId })` |
| `ai.a2a.listMessages` | 可信管理查询 | `A2ATaskFilter: callerId?, contextId?, since?, pagination?` | `StorePage<A2AMessageRecord>` | `ai.a2a.listMessages(messageFilter)` |
| `ai.a2a.callRemoteAgent` | 调用获准远端 | `allowlisted HTTPS URL, message, A2ACallOptions?` | `A2ACallResult` | `ai.a2a.callRemoteAgent("https://agent.example.com/a2a", "请分析订单")` |

#### Scenario: Publish and call remote agents

getAgentCard returns public capabilities; handleRequest maps protocol input to JSON/events, callRemoteAgent returns remote results and listMessages reads authorized task messages. Protocol construction grants no authorization.

[Detailed parameters and workflows](ai.md#a2a)
