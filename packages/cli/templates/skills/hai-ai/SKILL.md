---
name: hai-ai
description: 使用 @h-ai/ai 进行 LLM 调用（OpenAI 兼容）、MCP 服务器创建、工具定义与注册、流式处理、记忆管理（objectId 隔离）、上下文压缩与会话持久化；当需求涉及 AI 对话、工具调用、MCP 协议、流式响应、记忆提取注入、上下文摘要压缩、会话管理或 AI 客户端时使用。
---

# hai-ai

> `@h-ai/ai` 提供统一的 AI 能力，支持 LLM 调用（OpenAI 兼容 API）、MCP 服务器、工具定义与注册、流式处理、记忆管理（objectId 隔离）、上下文压缩与会话持久化。支持 Node.js 与浏览器双端。

---

## 适用场景

- 调用 LLM 进行对话（非流式/流式）
- 定义和执行工具（Function Calling）
- 创建 MCP 服务器（Streamable HTTP/SSE/Stdio）
- 注册 MCP 资源与提示词
- 自动提取和管理对话记忆
- 上下文压缩与 Token 控制
- 会话持久化与恢复（配合 reldb/vecdb）
- 前端 AI 客户端集成（记忆/会话查询）

---

## 使用步骤

### 1. 配置

```yaml
# config/_ai.yml
llm:
  apiKey: ${AI_API_KEY:}
  baseUrl: ${AI_BASE_URL:https://api.openai.com/v1}
  model: ${AI_MODEL:gpt-4o-mini}
  maxTokens: ${AI_MAX_TOKENS:4096}
  temperature: 0.7
  timeout: 60000

# 存储配置（可选）
store:
  mode: memory               # memory | persistent（需 reldb + vecdb 已初始化）

# 记忆管理（可选）
memory:
  maxEntries: 1000          # 最大记忆条数
  extractModel: gpt-4o-mini # 提取用模型（默认用 LLM 配置模型）
  apiKey:                   # 可选，覆盖 LLM apiKey
  baseUrl:                  # 可选，覆盖 LLM baseUrl
  recencyDecay: 0.95        # 时间衰减系数
  embeddingEnabled: true    # 启用向量检索
  defaultTopK: 10           # 默认检索数量

# 上下文压缩（可选）
context:
  defaultStrategy: hybrid    # 压缩策略：summary | sliding-window | hybrid
  defaultMaxTokens: 0        # 0 = 取模型 maxTokens 的 80%
  preserveLastN: 4           # 保留最近 N 条消息
  summaryModel: gpt-4o-mini  # 摘要用模型
  apiKey:                    # 可选，覆盖 LLM apiKey
  baseUrl:                   # 可选，覆盖 LLM baseUrl
  tokenRatio: 0.25           # Token 估算系数
```

### 2. 初始化与关闭

```typescript
import { ai } from '@h-ai/ai'

// 注意：ai.init() 和 ai.close() 是同步方法
ai.init(core.config.get('ai'))
// 使用后
ai.close()
```

**特殊说明**：`ai.tools` 和 `ai.stream` 无需 init 即可使用；`ai.llm` 和 `ai.mcp` 操作需要先 init。

---

## 核心 API

### LLM 操作 — `ai.llm`

| 方法         | 签名                                                   | 说明             |
| ------------ | ------------------------------------------------------ | ---------------- |
| `chat`       | `(options) => Promise<Result<ChatCompletionResponse>>` | 对话（非流式）   |
| `chatStream` | `(options) => AsyncIterable<ChatCompletionChunk>`      | 对话（流式）     |
| `listModels` | `() => Promise<Result<string[]>>`                      | 获取可用模型列表 |

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
  if (delta)
    process.stdout.write(delta)
}
```

### 工具定义 — `ai.tools`

```typescript
import { ai } from '@h-ai/ai'
import { z } from 'zod'

// 定义工具（Zod Schema 自动转 JSON Schema）
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

// 注册表管理
const registry = ai.tools.createRegistry()
registry.register(weatherTool)

// 获取 OpenAI 工具定义（传递给 LLM）
const definitions = registry.getDefinitions()

// 执行 LLM 返回的工具调用
const toolMessage = await registry.execute(toolCall)
const toolMessages = await registry.executeAll(toolCalls, { parallel: true })
```

> `ai.tools.define` 和 `ai.tools.createRegistry` 也可通过 `defineTool` / `createToolRegistry` 直接导入，两者等价。

### 流处理 — `ai.stream`

```typescript
import { ai } from '@h-ai/ai'

const processor = ai.stream.createProcessor()
for await (const chunk of ai.llm.chatStream({ messages })) {
  const delta = processor.process(chunk)
  if (delta?.content) { /* 实时显示 */ }
}

const result = processor.getResult()
// { content: string, toolCalls: ToolCall[], finishReason: string | null }
const message = processor.toAssistantMessage()
// { role: 'assistant', content: '...', tool_calls?: [...] }

// 快捷收集全部内容
const collected = await ai.stream.collect(stream)
```

> `ai.stream.createProcessor` / `ai.stream.collect` 也可通过 `createStreamProcessor` / `collectStream` 直接导入。

### MCP 服务器 — `createMcpServer`

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

**传输层选项**：`StreamableHTTPServerTransport`（推荐，Web 场景）、`SSEServerTransport`、`StdioServerTransport`

### MCP 操作 — `ai.mcp`

| 方法               | 签名                               | 说明       |
| ------------------ | ---------------------------------- | ---------- |
| `registerTool`     | `(def, handler) => void`           | 注册工具   |
| `callTool`         | `(name, input) => Promise<Result>` | 调用工具   |
| `registerResource` | `(def, reader) => void`            | 注册资源   |
| `readResource`     | `(uri) => Promise<Result>`         | 读取资源   |
| `registerPrompt`   | `(def, generator) => void`         | 注册提示词 |
| `getPrompt`        | `(name, args) => Promise<Result>`  | 获取提示词 |

### 前端客户端

```typescript
import { api } from '@h-ai/api-client'
import { createAIClient } from '@h-ai/ai/client'

await api.init({ baseUrl: '/api', auth: { ... } })
const client = createAIClient({ api })

// 非流式
const response = await client.chat({ messages })

// 流式
for await (const chunk of client.chatStream({ messages }, {
  onProgress: (p) => { /* 处理进度 */ },
})) { /* ... */ }

// 便捷方法
const reply = await client.sendMessage('你好', '系统提示')

// 记忆与会话查询
const memories = await client.recallMemories('用户偏好', { topK: 5, objectId: 'user-001' })
const page = await client.listMemories({ objectId: 'user-001', offset: 0, limit: 20 })
const sessions = await client.listSessions('user-001')
```

### 记忆管理 — `ai.memory`

| 方法              | 签名                                                          | 说明                               |
| ----------------- | ------------------------------------------------------------- | ---------------------------------- |
| `extract`         | `(messages, options?) => Promise<Result<MemoryEntry[]>>`      | 从对话中自动提取记忆（LLM 驱动）  |
| `add`             | `(entry) => Promise<Result<MemoryEntry>>`                     | 手动添加一条记忆                   |
| `get`             | `(memoryId) => Promise<Result<MemoryEntry>>`                  | 获取指定记忆                       |
| `recall`          | `(query, options?) => Promise<Result<MemoryEntry[]>>`         | 按查询检索最相关的记忆             |
| `injectMemories`  | `(messages, options?) => Promise<Result<ChatMessage[]>>`      | 将相关记忆自动注入消息列表         |
| `remove`          | `(memoryId) => Promise<Result<void>>`                         | 删除指定记忆                       |
| `list`            | `(options?) => Promise<Result<MemoryEntry[]>>`                | 列出记忆（支持类型/objectId 过滤） |
| `listPage`        | `(options?) => Promise<Result<StorePage<MemoryEntry>>>`       | 分页列出记忆                       |
| `clear`           | `(options?) => Promise<Result<void>>`                         | 清空记忆（支持按类型/objectId 清空）|

```typescript
// 从对话中自动提取记忆
const extracted = await ai.memory.extract(messages, { objectId: 'user-001' })
if (extracted.success) {
  // extracted.data: MemoryEntry[]（已自动存储）
}

// 手动添加记忆
await ai.memory.add({
  content: '用户偏好使用中文',
  type: 'preference', // fact | preference | event | entity | instruction
  importance: 0.8,
  objectId: 'user-001', // 可选，不传为全局
})

// 检索相关记忆
const memories = await ai.memory.recall('语言偏好', { topK: 5, objectId: 'user-001' })

// 将记忆注入消息列表（自动检索 + 格式化 + 插入 system prompt）
const enriched = await ai.memory.injectMemories(messages, { topK: 5, position: 'system' })
if (enriched.success) {
  const response = await ai.llm.chat({ messages: enriched.data })
}
```

### 上下文管理 — `ai.context`

| 方法             | 签名                                                              | 说明                                      |
| ---------------- | ----------------------------------------------------------------- | ----------------------------------------- |
| `tryCompress`    | `(messages, options?) => Promise<Result<ContextCompressResult>>`   | 压缩消息列表至指定 Token 预算             |
| `summarize`      | `(messages, options?) => Promise<Result<ContextSummary>>`         | 对消息生成摘要                            |
| `estimateTokens` | `(messages) => Result<number>`                                    | 估算消息列表的 Token 数                   |
| `createManager`  | `(options?) => Result<ContextManager>`                            | 创建有状态上下文管理器（自动压缩）        |
| `restoreManager` | `(scope, options?) => Promise<Result<ContextManager>>`            | 从持久化存储恢复上下文管理器              |
| `listSessions`   | `(objectId) => Promise<Result<SessionInfo[]>>`                    | 列出指定对象的所有会话                    |

```typescript
// 压缩超长对话
const result = await ai.context.tryCompress(messages, {
  strategy: 'hybrid', // summary | sliding-window | hybrid
  maxTokens: 4000,
  preserveLastN: 4,
})
if (result.success) {
  // result.data.messages — 压缩后的消息列表
  // result.data.originalTokens / compressedTokens — 压缩前后 Token 数
  // result.data.summary — 生成的摘要文本
}

// Token 估算
const tokens = ai.context.estimateTokens(messages)
if (tokens.success) {
  // tokens.data — 估算的 Token 数
}

// 有状态管理器（多轮对话场景）
const managerResult = ai.context.createManager({
  scope: { objectId: 'user-001', sessionId: 'sess-001' }, // 可选
  maxTokens: 8000,
})
if (managerResult.success) {
  const manager = managerResult.data
  await manager.addMessage({ role: 'user', content: userInput })
  const msgs = manager.getMessages() // 超限时自动压缩
  const response = await ai.llm.chat({ messages: msgs.data })
  await manager.addMessage(response.data.choices[0].message)
  await manager.save() // 持久化（persistent 模式下）
}

// 恢复已有会话
const restored = await ai.context.restoreManager(
  { objectId: 'user-001', sessionId: 'sess-001' },
)

// 列出对象的所有会话
const sessions = await ai.context.listSessions('user-001')
```

---

## 错误码 — `AIErrorCode`

| 错误码                                    | 说明               |
| ----------------------------------------- | ------------------ |
| `INTERNAL_ERROR` (12000)                  | 内部错误           |
| `NOT_INITIALIZED` (12010)                 | 服务未初始化       |
| `CONFIGURATION_ERROR` (12011)             | 配置错误           |
| `API_ERROR` (12100)                       | API 调用错误       |
| `INVALID_REQUEST` (12101)                 | 无效请求           |
| `RATE_LIMITED` (12102)                    | 速率限制           |
| `TIMEOUT` (12103)                         | 请求超时           |
| `MODEL_NOT_FOUND` (12104)                | 模型未找到         |
| `CONTEXT_LENGTH_EXCEEDED` (12105)         | 上下文长度超限     |
| `MCP_CONNECTION_ERROR` (12200)            | MCP 连接错误       |
| `MCP_PROTOCOL_ERROR` (12201)             | MCP 协议错误       |
| `MCP_TOOL_ERROR` (12202)                 | MCP 工具错误       |
| `MCP_RESOURCE_ERROR` (12203)             | MCP 资源错误       |
| `MCP_SERVER_ERROR` (12204)               | MCP 服务器错误     |
| `EMBEDDING_API_ERROR` (12300)            | Embedding 调用错误 |
| `EMBEDDING_MODEL_NOT_FOUND` (12301)      | Embedding 模型未找到 |
| `EMBEDDING_INPUT_TOO_LONG` (12302)       | Embedding 输入过长 |
| `TOOL_NOT_FOUND` (12400)                 | 工具未找到         |
| `TOOL_VALIDATION_FAILED` (12401)         | 工具验证失败       |
| `TOOL_EXECUTION_FAILED` (12402)          | 工具执行失败       |
| `TOOL_TIMEOUT` (12403)                   | 工具执行超时       |
| `REASONING_FAILED` (12500)               | 推理执行失败       |
| `REASONING_MAX_ROUNDS` (12501)           | 推理轮次超限       |
| `REASONING_STRATEGY_NOT_FOUND` (12502)   | 推理策略未找到     |
| `RETRIEVAL_FAILED` (12600)               | 检索执行失败       |
| `RETRIEVAL_SOURCE_NOT_FOUND` (12601)     | 检索源未配置       |
| `RAG_FAILED` (12700)                     | RAG 执行失败       |
| `RAG_CONTEXT_BUILD_FAILED` (12701)       | RAG 上下文构建失败 |
| `KNOWLEDGE_SETUP_FAILED` (12800)         | 知识库初始化失败   |
| `KNOWLEDGE_INGEST_FAILED` (12801)        | 知识入库失败       |
| `KNOWLEDGE_RETRIEVE_FAILED` (12802)      | 知识检索失败       |
| `KNOWLEDGE_ENTITY_EXTRACT_FAILED` (12803) | 实体提取失败       |
| `KNOWLEDGE_NOT_SETUP` (12804)            | 知识库未初始化     |
| `KNOWLEDGE_COLLECTION_NOT_FOUND` (12805) | 集合不存在         |
| `MEMORY_EXTRACT_FAILED` (12900)          | 记忆提取失败       |
| `MEMORY_STORE_FAILED` (12901)            | 记忆存储失败       |
| `MEMORY_RECALL_FAILED` (12902)           | 记忆召回失败       |
| `MEMORY_NOT_FOUND` (12903)               | 记忆条目不存在     |
| `MEMORY_INJECT_FAILED` (12904)           | 记忆注入失败       |
| `CONTEXT_COMPRESS_FAILED` (12950)        | 上下文压缩失败     |
| `CONTEXT_SUMMARIZE_FAILED` (12951)       | 上下文摘要失败     |
| `CONTEXT_TOKEN_ESTIMATE_FAILED` (12952)  | Token 估算失败     |
| `CONTEXT_BUDGET_EXCEEDED` (12953)        | Token 预算超限     |
| `STORE_FAILED` (13000)                   | 存储操作失败       |
| `STORE_NOT_AVAILABLE` (13001)            | 存储后端不可用     |
| `SESSION_NOT_FOUND` (13050)              | 会话不存在         |
| `SESSION_FAILED` (13051)                 | 会话操作失败       |

---

## 常见模式

### 带工具调用的对话循环

```typescript
const registry = ai.tools.createRegistry()
registry.register(weatherTool)

const messages: ChatMessage[] = [
  { role: 'user', content: '北京天气怎么样？' },
]

let result = await ai.llm.chat({
  messages,
  tools: registry.getDefinitions(),
})

while (result.success && result.data.choices[0].finish_reason === 'tool_calls') {
  const toolCalls = result.data.choices[0].message.tool_calls!
  messages.push(result.data.choices[0].message)

  const toolMessages = await registry.executeAll(toolCalls)
  if (toolMessages.success)
    messages.push(...toolMessages.data)

  result = await ai.llm.chat({ messages, tools: registry.getDefinitions() })
}
```

### 知识库完整流程（文档入库 → 问答）

```typescript
import { ai } from '@h-ai/ai'

// 初始化
await ai.knowledge.setup()

// 导入多篇文档
for (const doc of documents) {
  const result = await ai.knowledge.ingest({
    documentId: doc.id,
    content: doc.content,
    title: doc.title,
    enableEntityExtraction: true,
  })
  if (!result.success) {
    // 按错误码处理
    switch (result.error.code) {
      case AIErrorCode.KNOWLEDGE_INGEST_FAILED:
        // 入库失败
        break
      case AIErrorCode.EMBEDDING_API_ERROR:
        // 嵌入调用失败
        break
    }
  }
}

// 问答
const answer = await ai.knowledge.ask('项目核心架构是什么？')
if (answer.success) {
  // answer.data.answer — LLM 生成的回答
  // answer.data.citations — 信源引用列表
}
```

### SvelteKit API 端点

```typescript
// src/routes/api/ai/+server.ts
export async function POST(event) {
  const { valid, data } = await kit.validate.form(event.request, ChatSchema)
  if (!valid)
    return kit.response.badRequest('Invalid request')

  const result = await ai.llm.chat({ messages: data!.messages })
  if (!result.success)
    return kit.response.error(result.error.code, result.error.message)

  return kit.response.ok(result.data)
}
```

### 记忆增强的多轮对话

```typescript
import { ai } from '@h-ai/ai'

const messages: ChatMessage[] = [
  { role: 'system', content: '你是一个有帮助的助手' },
]

async function chat(userInput: string) {
  messages.push({ role: 'user', content: userInput })

  // 1. 注入相关记忆到消息列表
  const enriched = await ai.memory.injectMemories(messages, {
    topK: 5,
    position: 'system',
  })
  if (!enriched.success) return

  // 2. 压缩上下文以适应 Token 限制
  const compressed = await ai.context.tryCompress(enriched.data, {
    maxTokens: 4000,
    strategy: 'hybrid',
  })
  if (!compressed.success) return

  // 3. 调用 LLM
  const result = await ai.llm.chat({ messages: compressed.data.messages })
  if (!result.success) return

  const reply = result.data.choices[0].message
  messages.push(reply)

  // 4. 从新对话中提取记忆（异步，不阻塞响应）
  ai.memory.extract(messages.slice(-2))

  return reply.content
}
```

### 有状态上下文管理器

```typescript
import { ai } from '@h-ai/ai'

// 创建管理器（自动压缩）
const managerResult = ai.context.createManager({
  scope: { objectId: 'user-001', sessionId: 'sess-001' }, // 可选
  maxTokens: 8000,
  strategy: 'hybrid',
  preserveLastN: 4,
  autoCompress: true,
})
if (!managerResult.success) throw new Error(managerResult.error.message)
const manager = managerResult.data

// 多轮对话
async function chat(userInput: string) {
  await manager.addMessage({ role: 'user', content: userInput })

  const msgs = manager.getMessages()
  if (!msgs.success) return

  const result = await ai.llm.chat({ messages: msgs.data })
  if (!result.success) return

  await manager.addMessage(result.data.choices[0].message)
  await manager.save() // 持久化（persistent 模式下）

  // 查看 Token 使用量
  const usage = manager.getTokenUsage()
  if (usage.success) {
    console.log(`Token: ${usage.data.current}/${usage.data.budget}`)
  }

  return result.data.choices[0].message.content
}
```

---

## 相关 Skills

- `hai-build`：模块初始化顺序
- `hai-core`：配置与 Result 模型
- `hai-kit`：SvelteKit API 端点集成
- `hai-vecdb`：向量数据库（Retrieval / RAG / Knowledge 的存储层）
- `hai-reldb`：关系数据库（Knowledge 实体索引的存储层）
- `hai-datapipe`：数据清洗与分块（Knowledge 入库前的数据处理）
