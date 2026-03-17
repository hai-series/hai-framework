---
name: hai-usage-ai
description: "Use when: using @h-ai/ai, LLM calls, chat completion, tool calling, function calling, MCP server, streaming, memory management, context compression, summarization, token estimation, RAG, knowledge base, AI client, embeddings. 使用 @h-ai/ai 进行 LLM 调用、工具定义、MCP 服务器、流式处理、记忆管理、上下文压缩与会话持久化。"
---

# hai-usage-ai — AI 能力指南

> `@h-ai/ai` 提供统一的 AI 能力：LLM 调用（OpenAI 兼容）、MCP 服务器、工具定义与注册、流式处理、记忆管理、上下文压缩与会话持久化。支持 Node.js 与浏览器双端。

---

## §1 配置与初始化

### 配置

```yaml
# config/_ai.yml
llm:
  apiKey: ${HAI_OPENAI_API_KEY:}
  baseUrl: ${HAI_OPENAI_BASE_URL:https://api.openai.com/v1}
  model: ${HAI_AI_MODEL:gpt-4o-mini}
  maxTokens: ${HAI_AI_MAX_TOKENS:4096}
  temperature: 0.7
  timeout: 60000

store:
  mode: memory  # memory | persistent（需 reldb + vecdb）

memory:
  maxEntries: 1000
  extractModel: gpt-4o-mini
  recencyDecay: 0.95
  embeddingEnabled: true
  defaultTopK: 10

token:
  tokenRatio: 0.25  # 4 字符 ≈ 1 token

compress:
  defaultStrategy: hybrid  # summary | sliding-window | hybrid
  defaultMaxTokens: 0      # 0 = 模型 maxTokens 的 80%
  preserveLastN: 4
```

### 初始化

```typescript
import { ai } from '@h-ai/ai'

// ai.init() 是异步方法，ai.close() 是同步方法
await ai.init(core.config.get('ai'))
ai.close()
```

> `ai.tools` 和 `ai.stream` 无需 init 即可使用。

---

## §2 LLM 调用 — `ai.llm`

| 方法 | 签名 | 说明 |
|------|------|------|
| `chat` | `(options) => Promise<Result<ChatCompletionResponse>>` | 非流式对话 |
| `chatStream` | `(options) => AsyncIterable<ChatCompletionChunk>` | 流式对话 |
| `listModels` | `() => Promise<Result<string[]>>` | 可用模型列表 |

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
| `extract` | `(messages, options?) => Promise<Result<MemoryEntry[]>>` | 自动提取记忆 |
| `add` | `(entry) => Promise<Result<MemoryEntry>>` | 手动添加 |
| `get` | `(memoryId) => Promise<Result<MemoryEntry>>` | 获取 |
| `recall` | `(query, options?) => Promise<Result<MemoryEntry[]>>` | 检索相关记忆 |
| `injectMemories` | `(messages, options?) => Promise<Result<ChatMessage[]>>` | 注入记忆到消息 |
| `remove` | `(memoryId) => Promise<Result<void>>` | 删除 |
| `list` | `(options?) => Promise<Result<MemoryEntry[]>>` | 列表 |
| `listPage` | `(options?) => Promise<Result<StorePage<MemoryEntry>>>` | 分页列表 |
| `clear` | `(options?) => Promise<Result<void>>` | 清空 |

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

## §7 Token 与摘要

### Token 估算 — `ai.token`

```typescript
const tokens = ai.token.estimateMessages(messages)  // Result<number>
const count = ai.token.estimateText('Hello world')   // number
```

### 消息摘要 — `ai.summary`

```typescript
const result = await ai.summary.summarize(messages, { /* options */ })
const textResult = await ai.summary.generate(text, { /* options */ })
```

---

## §8 上下文压缩 — `ai.compress`

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

## §9 上下文管理器 — `ai.context`

| 方法 | 签名 | 说明 |
|------|------|------|
| `createManager` | `(options?) => Result<ContextManager>` | 创建管理器 |
| `restoreManager` | `(scope, options?) => Promise<Result<ContextManager>>` | 恢复会话 |
| `listSessions` | `(objectId) => Promise<Result<SessionInfo[]>>` | 列出会话 |
| `renameSession` | `(sessionId, title) => Promise<Result<void>>` | 重命名 |
| `removeSession` | `(sessionId) => Promise<Result<void>>` | 删除 |

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

## §10 前端客户端

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

## §11 错误码 — `AIErrorCode`

| 错误码 | 说明 |
|--------|------|
| `INTERNAL_ERROR` (12000) | 内部错误 |
| `NOT_INITIALIZED` (12010) | 未初始化 |
| `CONFIGURATION_ERROR` (12011) | 配置错误 |
| `API_ERROR` (12100) | API 调用错误 |
| `INVALID_REQUEST` (12101) | 无效请求 |
| `RATE_LIMITED` (12102) | 速率限制 |
| `TIMEOUT` (12103) | 超时 |
| `MODEL_NOT_FOUND` (12104) | 模型未找到 |
| `CONTEXT_LENGTH_EXCEEDED` (12105) | 上下文超限 |
| `MCP_CONNECTION_ERROR` (12200) | MCP 连接错误 |
| `MCP_PROTOCOL_ERROR` (12201) | MCP 协议错误 |
| `MCP_TOOL_ERROR` (12202) | MCP 工具错误 |
| `MCP_RESOURCE_ERROR` (12203) | MCP 资源错误 |
| `MCP_SERVER_ERROR` (12204) | MCP 服务器错误 |
| `EMBEDDING_API_ERROR` (12300) | Embedding 错误 |
| `TOOL_NOT_FOUND` (12400) | 工具未找到 |
| `TOOL_VALIDATION_FAILED` (12401) | 工具验证失败 |
| `TOOL_EXECUTION_FAILED` (12402) | 工具执行失败 |
| `REASONING_FAILED` (12500) | 推理失败 |
| `RETRIEVAL_FAILED` (12600) | 检索失败 |
| `RAG_FAILED` (12700) | RAG 失败 |
| `KNOWLEDGE_SETUP_FAILED` (12800) | 知识库初始化失败 |
| `KNOWLEDGE_INGEST_FAILED` (12801) | 知识入库失败 |
| `KNOWLEDGE_RETRIEVE_FAILED` (12802) | 知识检索失败 |
| `MEMORY_EXTRACT_FAILED` (12900) | 记忆提取失败 |
| `MEMORY_STORE_FAILED` (12901) | 记忆存储失败 |
| `MEMORY_RECALL_FAILED` (12902) | 记忆召回失败 |
| `MEMORY_INJECT_FAILED` (12904) | 记忆注入失败 |
| `CONTEXT_COMPRESS_FAILED` (12950) | 压缩失败 |
| `CONTEXT_SUMMARIZE_FAILED` (12951) | 摘要失败 |
| `STORE_FAILED` (13000) | 存储失败 |
| `SESSION_NOT_FOUND` (13050) | 会话不存在 |

---

## §12 常见模式

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
