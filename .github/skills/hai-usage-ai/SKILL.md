---
name: hai-usage-ai
description: "Use when: using @h-ai/ai, LLM calls, chat completion, tool calling, function calling, MCP server, streaming, memory management, context compression, summarization, token estimation, RAG, knowledge base, AI client, embeddings, reasoning, rerank, file parsing, A2A agent-to-agent. 使用 @h-ai/ai 进行 LLM 调用、工具定义、MCP 服务器、流式处理、记忆管理、上下文压缩、知识库、推理引擎、Rerank、文件解析、A2A 与会话持久化。"
---

# hai-usage-ai — AI 能力指南

> `@h-ai/ai` 提供统一的 AI 能力：LLM 调用（OpenAI 兼容）、MCP 服务器、工具定义与注册、流式处理、记忆管理、上下文压缩与会话持久化。支持 Node.js 与浏览器双端。

---

## §1 配置与初始化

### 配置

```yaml
# config/_ai.yml
llm:
  apiKey: ${HAI_AI_LLM_API_KEY:}
  baseUrl: ${HAI_AI_LLM_BASE_URL:https://api.openai.com/v1}
  model: ${HAI_AI_LLM_MODEL:gpt-4o-mini}
  maxTokens: ${HAI_AI_LLM_MAX_TOKENS:4096}
  temperature: 0.7
  timeout: 60000
  # 多模型场景映射
  scenarios:
    default: fast
    chat: fast
    reasoning: strong
    embedding: embed
    summary: fast
    extraction: fast
    rerank: fast
    ocr: strong

memory:
  maxEntries: 1000
  recencyDecay: 0.95
  embeddingEnabled: true
  defaultTopK: 10

embedding:
  dimensions: 1536
  batchSize: 100

knowledge:
  collection: hai_ai_knowledge
  dimension: 1536
  enableEntityExtraction: true
  chunkMode: markdown  # sentence | paragraph | markdown | page
  chunkMaxSize: 1500
  chunkOverlap: 200

token:
  tokenRatio: 0.25  # 4 字符 ≈ 1 token

compress:
  defaultStrategy: hybrid  # summary | sliding-window | hybrid
  defaultMaxTokens: 0      # 0 = 模型 maxTokens 的 80%
  preserveLastN: 4

file:
  systemPrompt: ''  # 可选，覆盖内置解析提示词
```

### 初始化

```typescript
import { ai } from '@h-ai/ai'

// 方式一：默认 DB Provider（需要 reldb + vecdb 已初始化）
await ai.init(core.config.get('ai'))

// 方式二：自定义 StoreProvider（无需 reldb / vecdb）
await ai.init(core.config.get('ai'), { storeProvider: myProvider })

ai.close()
```

> `ai.tools` 和 `ai.stream` 无需 init 即可使用。
> 存储层通过 `AIStoreProvider` 接口抽象，默认使用 reldb+vecdb，也可注入自定义实现。

---

## §2 LLM 调用 — `ai.llm`

| 方法 | 签名 | 说明 |
|------|------|------|
| `chat` | `(options) => Promise<HaiResult<ChatCompletionResponse>>` | 非流式对话 |
| `chatStream` | `(options) => AsyncIterable<ChatCompletionChunk>` | 流式对话 |
| `ask` | `(query, options?) => Promise<HaiResult<string>>` | 简易问答（返回纯文本） |
| `askStream` | `(query, options?) => AsyncIterable<string>` | 流式简易问答 |
| `listModels` | `() => Promise<HaiResult<string[]>>` | 可用模型列表 |
| `getHistory` | `(scope: InteractionScope, options?) => Promise<HaiResult<ChatRecord[]>>` | 获取对话历史 |
| `listSessions` | `(objectId) => Promise<HaiResult<SessionInfo[]>>` | 列出对象的所有会话 |

```typescript
// 非流式
const result = await ai.llm.chat({
  messages: [
    { role: 'system', content: '你是一个有帮助的助手' },
    { role: 'user', content: '你好' },
  ],
  tools: registry.getDefinitions(), // 可选
})
if (result.success) {
  const message = result.data.choices[0].message
}

// 流式
for await (const chunk of ai.llm.chatStream({ messages })) {
  const delta = chunk.choices[0]?.delta?.content
  if (delta) process.stdout.write(delta)
}
```

---

## §3 工具定义 — `ai.tools`

```typescript
import { ai } from '@h-ai/ai'
import { z } from 'zod'

// 定义工具（Zod Schema → JSON Schema）
const weatherTool = ai.tools.define({
  name: 'get_weather',
  description: '获取天气信息',
  parameters: z.object({
    city: z.string().describe('城市名称'),
    unit: z.enum(['celsius', 'fahrenheit']).optional(),
  }),
  handler: async ({ city, unit }) => {
    return { temperature: 20, city, unit: unit ?? 'celsius' }
  },
})

// 注册表
const registry = ai.tools.createRegistry()
registry.register(weatherTool)

// 获取 OpenAI 工具定义
const definitions = registry.getDefinitions()

// 执行工具调用
const toolMessage = await registry.execute(toolCall)
const toolMessages = await registry.executeAll(toolCalls, { parallel: true })
```

> 也可通过 `defineTool` / `createToolRegistry` 直接导入。

---

## §4 流处理 — `ai.stream`

```typescript
const processor = ai.stream.createProcessor()
for await (const chunk of ai.llm.chatStream({ messages })) {
  const delta = processor.process(chunk)
  if (delta?.content) { /* 实时显示 */ }
}

const result = processor.getResult()
// { content, toolCalls, finishReason }
const message = processor.toAssistantMessage()

// 快捷收集
const collected = await ai.stream.collect(stream)
```

---

## §5 MCP 服务器

```typescript
import { createMcpServer, StreamableHTTPServerTransport } from '@h-ai/ai'
import { z } from 'zod'

const mcp = createMcpServer({ name: 'my-server', version: '1.0.0' })

// 注册工具
mcp.registerTool('search', {
  description: '搜索',
  inputSchema: { query: z.string() },
}, async ({ query }) => ({
  content: [{ type: 'text', text: `Results for ${query}` }],
}))

// 注册资源
mcp.registerResource('config', 'config://app', {
  description: '应用配置',
}, async uri => ({
  contents: [{ uri: uri.href, text: '{}' }],
}))

// 注册提示词
mcp.registerPrompt('summarize', {
  description: '总结文本',
  argsSchema: { text: z.string() },
}, async ({ text }) => ({
  messages: [{ role: 'user', content: { type: 'text', text } }],
}))

// 连接传输层
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
})
await mcp.connect(transport)
```

**MCP 操作 — `ai.mcp`**：`registerTool` / `callTool` / `registerResource` / `readResource` / `registerPrompt` / `getPrompt`

---

## §6 记忆管理 — `ai.memory`

| 方法 | 签名 | 说明 |
|------|------|------|
| `extract` | `(messages, options?) => Promise<HaiResult<MemoryEntry[]>>` | 自动提取记忆 |
| `add` | `(entry: MemoryEntryInput) => Promise<HaiResult<MemoryEntry>>` | 手动添加记忆 |
| `get` | `(memoryId: string) => Promise<HaiResult<MemoryEntry>>` | 按 ID 获取记忆 |
| `update` | `(memoryId, updates) => Promise<HaiResult<MemoryEntry>>` | 更新记忆条目 |
| `recall` | `(query, options?) => Promise<HaiResult<MemoryEntry[]>>` | 检索相关记忆 |
| `injectMemories` | `(messages, options?) => Promise<HaiResult<ChatMessage[]>>` | 注入记忆到消息 |
| `remove` | `(memoryId) => Promise<HaiResult<void>>` | 删除 |
| `list` | `(options?) => Promise<HaiResult<MemoryEntry[]>>` | 列表 |
| `listPage` | `(options?) => Promise<HaiResult<StorePage<MemoryEntry>>>` | 分页列表 |
| `clear` | `(options?) => Promise<HaiResult<void>>` | 清空 |

```typescript
// 自动提取
const extracted = await ai.memory.extract(messages, { objectId: 'user-001' })

// 手动添加
await ai.memory.add({
  content: '用户偏好使用中文',
  type: 'preference', // fact | preference | event | entity | instruction
  importance: 0.8,
  objectId: 'user-001',
})

// 检索
const memories = await ai.memory.recall('语言偏好', { topK: 5, objectId: 'user-001' })

// 注入到消息列表
const enriched = await ai.memory.injectMemories(messages, { topK: 5, position: 'system' })
if (enriched.success) {
  const response = await ai.llm.chat({ messages: enriched.data })
}
```

---

## §7 向量嵌入 — `ai.embedding`

| 方法 | 签名 | 说明 |
|------|------|------|
| `embed` | `(request: EmbeddingRequest) => Promise<HaiResult<EmbeddingResponse>>` | 通用嵌入（支持单条/批量） |
| `embedText` | `(text: string) => Promise<HaiResult<number[]>>` | 单文本嵌入（返回向量） |
| `embedBatch` | `(texts: string[]) => Promise<HaiResult<number[][]>>` | 批量文本嵌入 |

```typescript
const vector = await ai.embedding.embedText('你好世界')
if (vector.success) {
  // vector.data — number[] (1536 维)
}

const vectors = await ai.embedding.embedBatch(['文本1', '文本2'])
```

---

## §8 Token 与摘要

### Token 估算 — `ai.token`

```typescript
const tokens = ai.token.estimateMessages(messages)  // number
const count = ai.token.estimateText('Hello world')   // number
```

### 消息摘要 — `ai.summary`

```typescript
const result = await ai.summary.summarize(messages, { /* options */ })
const textResult = await ai.summary.generate(messages, { /* options */ })
```

---

## §9 上下文压缩 — `ai.compress`

```typescript
const result = await ai.compress.tryCompress(messages, {
  strategy: 'hybrid', // summary | sliding-window | hybrid
  maxTokens: 4000,
  preserveLastN: 4,
})
if (result.success) {
  // result.data.messages — 压缩后消息
  // result.data.originalTokens / compressedTokens
  // result.data.summary
}
```

---

## §10 检索与 RAG

### Retrieval — `ai.retrieval`

| 方法 | 签名 | 说明 |
|------|------|------|
| `addSource` | `(source: RetrievalSource) => HaiResult<void>` | 注册检索源（vecdb collection） |
| `removeSource` | `(sourceId: string) => HaiResult<void>` | 移除检索源 |
| `listSources` | `() => RetrievalSource[]` | 列出已注册检索源 |
| `retrieve` | `(request: RetrievalRequest) => Promise<HaiResult<RetrievalResult>>` | 多源检索 |

### RAG — `ai.rag`

| 方法 | 签名 | 说明 |
|------|------|------|
| `query` | `(query, options?) => Promise<HaiResult<RagResult>>` | RAG 问答（检索 + LLM 生成） |

```typescript
// 注册检索源
ai.retrieval.addSource({
  id: 'docs',
  collection: 'doc_vectors',
  name: '产品文档',
  topK: 5,
  minScore: 0.7,
})

// RAG 问答
const result = await ai.rag.query('核心架构是什么？', {
  sources: ['docs'],
  topK: 5,
})
if (result.success) {
  // result.data.answer — LLM 生成的回答
  // result.data.citations — 信源引用列表
}
```

---

## §11 知识库 — `ai.knowledge`

| 方法 | 签名 | 说明 |
|------|------|------|
| `setup` | `(options?) => Promise<HaiResult<void>>` | 初始化知识库（创建 vecdb 集合 + reldb 表） |
| `ingest` | `(input: KnowledgeIngestInput) => Promise<HaiResult<KnowledgeIngestResult>>` | 文档入库 |
| `ingestFile` | `(input: KnowledgeIngestFileInput) => Promise<HaiResult<KnowledgeIngestResult>>` | 从文件路径导入（Node.js） |
| `ingestBatch` | `(inputs, onProgress?) => Promise<HaiResult<KnowledgeIngestBatchResult>>` | 批量导入 |
| `retrieve` | `(query, options?) => Promise<HaiResult<KnowledgeRetrieveResult>>` | 知识检索（实体增强） |
| `ask` | `(query, options?) => Promise<HaiResult<KnowledgeAskResult>>` | 知识问答（RAG + 信源引用） |
| `findByEntity` | `(entityName, options?) => Promise<HaiResult<EntityDocumentResult[]>>` | 按实体查询关联文档 |
| `listEntities` | `(options?) => Promise<HaiResult<KnowledgeEntity[]>>` | 列出实体 |
| `listDocuments` | `(options?) => Promise<HaiResult<KnowledgeDocumentInfo[]>>` | 列出已导入文档 |
| `removeDocument` | `(documentId, options?) => Promise<HaiResult<void>>` | 删除文档 |

```typescript
await ai.knowledge.setup()

await ai.knowledge.ingest({
  documentId: 'doc-001',
  content: markdownText,
  title: '产品手册',
  enableEntityExtraction: true,
})

const answer = await ai.knowledge.ask('核心架构是什么？')
if (answer.success) {
  // answer.data.answer + answer.data.citations
}
```

---

## §12 推理 — `ai.reasoning`

| 方法 | 签名 | 说明 |
|------|------|------|
| `run` | `(query, options?) => Promise<HaiResult<ReasoningResult>>` | 执行推理 |
| `runStream` | `(query, options?) => AsyncIterable<ReasoningStreamEvent>` | 流式推理 |

**策略**：`react`（默认，ReAct 循环）、`cot`（Chain-of-Thought）、`plan-execute`（规划执行）

```typescript
const result = await ai.reasoning.run('分析竞争对手定价策略', {
  strategy: 'react',
  tools: registry,
  maxRounds: 10,
})
if (result.success) {
  // result.data.answer — 最终答案
  // result.data.steps — 推理步骤（thought/action/observation/answer）
  // result.data.rounds — 实际轮次
}

// 流式
for await (const event of ai.reasoning.runStream('任务', { strategy: 'cot' })) {
  if (event.type === 'step') console.log(event.step)
  if (event.type === 'delta') process.stdout.write(event.text)
}
```

---

## §13 Rerank 与 File

### Rerank — `ai.rerank`

| 方法 | 签名 | 说明 |
|------|------|------|
| `rerank` | `(request: RerankRequest) => Promise<HaiResult<RerankResponse>>` | 通用重排序 |
| `rerankTexts` | `(query, texts, topN?) => Promise<HaiResult<RerankItem[]>>` | 快捷文本重排序 |

```typescript
const result = await ai.rerank.rerankTexts('机器学习', [
  '深度学习是机器学习的子领域',
  '今天天气很好',
  'GPU 加速训练模型',
], 2)
// result.data — [{ index, relevanceScore, document? }]
```

### File — `ai.file`

| 方法 | 签名 | 说明 |
|------|------|------|
| `parse` | `(request: FileParseRequest) => Promise<HaiResult<FileParseResult>>` | 解析文件（支持 text/html/pdf/docx/ocr） |
| `parseText` | `(content, filename?) => Promise<HaiResult<string>>` | 快捷解析（直接返回文本） |

```typescript
const result = await ai.file.parse({
  content: pdfBuffer,
  filename: 'report.pdf',
  options: { useOcr: false, outputFormat: 'markdown' },
})
if (result.success) {
  // result.data.text — 解析后文本
  // result.data.method — 使用的解析方式（text/html/pdf/docx/ocr）
}
```

---

## §14 A2A（Agent-to-Agent）— `ai.a2a`

| 方法 | 签名 | 说明 |
|------|------|------|
| `registerExecutor` | `(executor: AgentExecutor) => HaiResult<void>` | 注册代理执行器 |
| `getAgentCard` | `() => HaiResult<A2AAgentCardConfig>` | 获取 Agent Card |
| `handleRequest` | `(body, context?) => Promise<A2AHandleResult>` | 处理 A2A 协议请求 |
| `listMessages` | `(filter) => Promise<HaiResult<StorePage<A2AMessageRecord>>>` | 查询消息记录 |
| `callRemoteAgent` | `(remoteUrl, message, options?) => Promise<HaiResult<A2ACallResult>>` | 调用远端代理 |

```typescript
// 注册执行器
ai.a2a.registerExecutor(myAgentExecutor)

// 在 SvelteKit API 端点处理请求
const result = await ai.a2a.handleRequest(requestBody)
if (result.streaming) {
  // result.stream — AsyncGenerator
} else {
  // result.body — JSON 响应
}

// 调用远端代理
const callResult = await ai.a2a.callRemoteAgent(
  'https://remote-agent.example.com',
  '帮我分析这份报告',
  { timeout: 30000 },
)
```

---

## §15 上下文管理器 — `ai.context`

| 方法 | 签名 | 说明 |
|------|------|------|
| `createManager` | `(options?) => HaiResult<ContextManager>` | 创建管理器 |
| `restoreManager` | `(scope, options?) => Promise<HaiResult<ContextManager>>` | 恢复会话 |
| `listSessions` | `(objectId) => Promise<HaiResult<SessionInfo[]>>` | 列出会话 |
| `renameSession` | `(sessionId, title) => Promise<HaiResult<void>>` | 重命名 |
| `removeSession` | `(sessionId) => Promise<HaiResult<void>>` | 删除 |

**ContextManager 选项**：
- `scope` — 交互作用域（objectId + sessionId）
- `systemPrompt` — 系统提示词
- `compress` — 压缩配置（auto/maxTokens/strategy/preserveLastN）
- `memory` — 记忆配置（enable/enableExtract/topK）
- `rag` — RAG 配置（enable/sources/topK/minScore）
- `tools` — 工具注册表

**ContextManager 方法**：`addMessage` / `getMessages` / `getTokenUsage` / `chat` / `chatStream` / `save` / `reset`

```typescript
// 创建 + 对话
const managerResult = ai.context.createManager({
  scope: { objectId: 'user-001', sessionId: 'sess-001' },
  systemPrompt: '你是一个友好的助手。',
  compress: { maxTokens: 8000, strategy: 'hybrid', auto: true },
  memory: { enable: true, enableExtract: true },
})
if (managerResult.success) {
  const manager = managerResult.data
  const result = await manager.chat('你好')
  await manager.save()
}

// 流式
for await (const event of manager.chatStream('讲个故事')) {
  if (event.type === 'delta') process.stdout.write(event.text)
}

// 恢复会话
const restored = await ai.context.restoreManager(
  { objectId: 'user-001', sessionId: 'sess-001' },
  { compress: { maxTokens: 8000 }, memory: { enable: true } },
)
```

---

## §16 前端客户端

```typescript
import { api } from '@h-ai/api-client'
import { createAIClient } from '@h-ai/ai/client'

const client = createAIClient({ api })

// 非流式 / 流式
const response = await client.chat({ messages })
for await (const chunk of client.chatStream({ messages })) { /* ... */ }

// 便捷方法
const reply = await client.sendMessage('你好', '系统提示')

// 记忆与会话
const memories = await client.recallMemories('用户偏好', { topK: 5, objectId: 'user-001' })
const sessions = await client.listSessions('user-001')
```

---

## §17 错误码 — `HaiAIError`

| 错误码 | code | 说明 |
|--------|------|------|
| **通用** | | |
| `HaiAIError.INTERNAL_ERROR` | `hai:ai:000` | 内部错误 |
| **初始化** | | |
| `HaiAIError.NOT_INITIALIZED` | `hai:ai:010` | 未初始化 |
| `HaiAIError.CONFIGURATION_ERROR` | `hai:ai:011` | 配置错误 |
| `HaiAIError.INIT_IN_PROGRESS` | `hai:ai:012` | 初始化正在进行中 |
| **Rerank** | | |
| `HaiAIError.RERANK_API_ERROR` | `hai:ai:020` | Rerank API 调用错误 |
| `HaiAIError.RERANK_INVALID_REQUEST` | `hai:ai:021` | Rerank 请求参数无效 |
| **File** | | |
| `HaiAIError.FILE_PARSE_FAILED` | `hai:ai:030` | 文件解析失败 |
| `HaiAIError.FILE_UNSUPPORTED_FORMAT` | `hai:ai:031` | 不支持的文件格式 |
| `HaiAIError.FILE_OCR_FAILED` | `hai:ai:032` | OCR 识别失败 |
| `HaiAIError.FILE_INVALID_CONTENT` | `hai:ai:033` | 文件内容无效 |
| **LLM** | | |
| `HaiAIError.API_ERROR` | `hai:ai:100` | API 调用错误 |
| `HaiAIError.INVALID_REQUEST` | `hai:ai:101` | 无效请求 |
| `HaiAIError.RATE_LIMITED` | `hai:ai:102` | 速率限制 |
| `HaiAIError.TIMEOUT` | `hai:ai:103` | 超时 |
| `HaiAIError.MODEL_NOT_FOUND` | `hai:ai:104` | 模型未找到 |
| `HaiAIError.CONTEXT_LENGTH_EXCEEDED` | `hai:ai:105` | 上下文超限 |
| `HaiAIError.LLM_RECORD_FAILED` | `hai:ai:106` | 对话记录保存失败 |
| `HaiAIError.LLM_HISTORY_FAILED` | `hai:ai:107` | 对话历史查询失败 |
| **MCP** | | |
| `HaiAIError.MCP_CONNECTION_ERROR` | `hai:ai:200` | MCP 连接错误 |
| `HaiAIError.MCP_PROTOCOL_ERROR` | `hai:ai:201` | MCP 协议错误 |
| `HaiAIError.MCP_TOOL_ERROR` | `hai:ai:202` | MCP 工具错误 |
| `HaiAIError.MCP_RESOURCE_ERROR` | `hai:ai:203` | MCP 资源错误 |
| `HaiAIError.MCP_SERVER_ERROR` | `hai:ai:204` | MCP 服务器错误 |
| **Embedding** | | |
| `HaiAIError.EMBEDDING_API_ERROR` | `hai:ai:300` | Embedding 调用错误 |
| `HaiAIError.EMBEDDING_MODEL_NOT_FOUND` | `hai:ai:301` | Embedding 模型未找到 |
| `HaiAIError.EMBEDDING_INPUT_TOO_LONG` | `hai:ai:302` | Embedding 输入过长 |
| **工具** | | |
| `HaiAIError.TOOL_NOT_FOUND` | `hai:ai:400` | 工具未找到 |
| `HaiAIError.TOOL_VALIDATION_FAILED` | `hai:ai:401` | 工具验证失败 |
| `HaiAIError.TOOL_EXECUTION_FAILED` | `hai:ai:402` | 工具执行失败 |
| `HaiAIError.TOOL_TIMEOUT` | `hai:ai:403` | 工具超时 |
| **Reasoning** | | |
| `HaiAIError.REASONING_FAILED` | `hai:ai:500` | 推理失败 |
| `HaiAIError.REASONING_MAX_ROUNDS` | `hai:ai:501` | 推理轮次超限 |
| `HaiAIError.REASONING_STRATEGY_NOT_FOUND` | `hai:ai:502` | 推理策略未找到 |
| **Retrieval** | | |
| `HaiAIError.RETRIEVAL_FAILED` | `hai:ai:600` | 检索失败 |
| `HaiAIError.RETRIEVAL_SOURCE_NOT_FOUND` | `hai:ai:601` | 检索源未配置 |
| **RAG** | | |
| `HaiAIError.RAG_FAILED` | `hai:ai:700` | RAG 失败 |
| `HaiAIError.RAG_CONTEXT_BUILD_FAILED` | `hai:ai:701` | RAG 上下文构建失败 |
| **Knowledge** | | |
| `HaiAIError.KNOWLEDGE_SETUP_FAILED` | `hai:ai:800` | 知识库初始化失败 |
| `HaiAIError.KNOWLEDGE_INGEST_FAILED` | `hai:ai:801` | 知识入库失败 |
| `HaiAIError.KNOWLEDGE_RETRIEVE_FAILED` | `hai:ai:802` | 知识检索失败 |
| `HaiAIError.KNOWLEDGE_ENTITY_EXTRACT_FAILED` | `hai:ai:803` | 实体提取失败 |
| `HaiAIError.KNOWLEDGE_NOT_SETUP` | `hai:ai:804` | 知识库未初始化 |
| `HaiAIError.KNOWLEDGE_COLLECTION_NOT_FOUND` | `hai:ai:805` | 集合不存在 |
| **Memory** | | |
| `HaiAIError.MEMORY_EXTRACT_FAILED` | `hai:ai:900` | 记忆提取失败 |
| `HaiAIError.MEMORY_STORE_FAILED` | `hai:ai:901` | 记忆存储失败 |
| `HaiAIError.MEMORY_RECALL_FAILED` | `hai:ai:902` | 记忆召回失败 |
| `HaiAIError.MEMORY_NOT_FOUND` | `hai:ai:903` | 记忆不存在 |
| `HaiAIError.MEMORY_ENRICH_FAILED` | `hai:ai:904` | 记忆注入失败 |
| **Context** | | |
| `HaiAIError.CONTEXT_COMPRESS_FAILED` | `hai:ai:950` | 压缩失败 |
| `HaiAIError.CONTEXT_SUMMARIZE_FAILED` | `hai:ai:951` | 摘要失败 |
| `HaiAIError.CONTEXT_TOKEN_ESTIMATE_FAILED` | `hai:ai:952` | Token 估算失败 |
| `HaiAIError.CONTEXT_BUDGET_EXCEEDED` | `hai:ai:953` | 超出 Token 预算 |
| **Store** | | |
| `HaiAIError.STORE_FAILED` | `hai:ai:960` | 存储操作失败 |
| `HaiAIError.STORE_NOT_AVAILABLE` | `hai:ai:961` | 存储后端不可用 |
| **Session** | | |
| `HaiAIError.SESSION_NOT_FOUND` | `hai:ai:970` | 会话未找到 |
| `HaiAIError.SESSION_FAILED` | `hai:ai:971` | 会话操作失败 |
| **A2A** | | |
| `HaiAIError.A2A_NOT_CONFIGURED` | `hai:ai:980` | A2A 服务未配置 |
| `HaiAIError.A2A_HANDLE_FAILED` | `hai:ai:981` | A2A 请求处理失败 |
| `HaiAIError.A2A_REMOTE_CALL_FAILED` | `hai:ai:982` | A2A 远端调用失败 |
| `HaiAIError.A2A_AUTH_FAILED` | `hai:ai:983` | A2A 认证失败 |
| `HaiAIError.A2A_LIST_MESSAGES_FAILED` | `hai:ai:984` | A2A 消息查询失败 |

---

## §18 常见模式

### 带工具的对话循环

```typescript
const registry = ai.tools.createRegistry()
registry.register(weatherTool)

const messages: ChatMessage[] = [
  { role: 'user', content: '北京天气怎么样？' },
]

let result = await ai.llm.chat({ messages, tools: registry.getDefinitions() })

while (result.success && result.data.choices[0].finish_reason === 'tool_calls') {
  const toolCalls = result.data.choices[0].message.tool_calls!
  messages.push(result.data.choices[0].message)
  const toolMessages = await registry.executeAll(toolCalls)
  if (toolMessages.success) messages.push(...toolMessages.data)
  result = await ai.llm.chat({ messages, tools: registry.getDefinitions() })
}
```

### 记忆增强对话

```typescript
async function chat(userInput: string) {
  messages.push({ role: 'user', content: userInput })

  // 1. 注入记忆
  const enriched = await ai.memory.injectMemories(messages, { topK: 5 })
  if (!enriched.success) return

  // 2. 压缩上下文
  const compressed = await ai.compress.tryCompress(enriched.data, { maxTokens: 4000 })
  if (!compressed.success) return

  // 3. 调用 LLM
  const result = await ai.llm.chat({ messages: compressed.data.messages })
  if (!result.success) return

  const reply = result.data.choices[0].message
  messages.push(reply)

  // 4. 异步提取记忆
  ai.memory.extract(messages.slice(-2))
  return reply.content
}
```

### 知识库问答

```typescript
await ai.knowledge.setup()

// 入库
await ai.knowledge.ingest({
  documentId: doc.id,
  content: doc.content,
  title: doc.title,
  enableEntityExtraction: true,
})

// 问答
const answer = await ai.knowledge.ask('核心架构是什么？')
if (answer.success) {
  // answer.data.answer + answer.data.citations
}
```

### SvelteKit API 端点

```typescript
export const POST = kit.handler(async ({ request }) => {
  const data = await kit.validate.body(request, ChatSchema)
  const result = await ai.llm.chat({ messages: data.messages })
  if (!result.success) return kit.response.error(result.error.code, result.error.message)
  return kit.response.ok(result.data)
})
```

---

## 示例触发语句

- "调用 LLM 对话"
- "定义工具"
- "创建 MCP 服务器"
- "实现记忆增强对话"
- "使用上下文管理器"
- "流式输出"
- "知识库入库与问答"
- "实现 RAG 检索"
- "使用推理引擎"
- "Rerank 重排序"
- "解析文件"
- "接入 A2A 协议"
