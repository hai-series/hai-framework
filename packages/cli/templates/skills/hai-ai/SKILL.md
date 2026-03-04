---
name: hai-ai
description: 使用 @h-ai/ai 进行 LLM 调用（OpenAI 兼容）、MCP 服务器创建、工具定义与注册、流式处理；当需求涉及 AI 对话、工具调用、MCP 协议、流式响应或 AI 客户端时使用。
---

# hai-ai

> `@h-ai/ai` 提供统一的 AI 能力，支持 LLM 调用（OpenAI 兼容 API）、MCP 服务器、工具定义与注册、流式处理。支持 Node.js 与浏览器双端。

---

## 适用场景

- 调用 LLM 进行对话（非流式/流式）
- 定义和执行工具（Function Calling）
- 创建 MCP 服务器（Streamable HTTP/SSE/Stdio）
- 注册 MCP 资源与提示词
- 前端 AI 客户端集成

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
import { createApiClient } from '@h-ai/api-client'
import { createAIClient } from '@h-ai/ai/client'

const api = createApiClient({ baseUrl: '/api', auth: { ... } })
const client = createAIClient({ api })

// 非流式
const response = await client.chat({ messages })

// 流式
for await (const chunk of client.chatStream({ messages }, {
  onProgress: (p) => { /* 处理进度 */ },
})) { /* ... */ }

// 便捷方法
const reply = await client.sendMessage('你好', '系统提示')
```

---

## 错误码 — `AIErrorCode`

| 错误码                           | 说明           |
| -------------------------------- | -------------- |
| `INTERNAL_ERROR` (7000)          | 内部错误       |
| `NOT_INITIALIZED` (7010)         | 服务未初始化   |
| `CONFIGURATION_ERROR` (7011)     | 配置错误       |
| `API_ERROR` (7100)               | API 调用错误   |
| `INVALID_REQUEST` (7101)         | 无效请求       |
| `RATE_LIMITED` (7102)            | 速率限制       |
| `TIMEOUT` (7103)                 | 请求超时       |
| `MODEL_NOT_FOUND` (7104)         | 模型未找到     |
| `CONTEXT_LENGTH_EXCEEDED` (7105) | 上下文长度超限 |
| `MCP_CONNECTION_ERROR` (7200)    | MCP 连接错误   |
| `MCP_PROTOCOL_ERROR` (7201)      | MCP 协议错误   |
| `MCP_TOOL_ERROR` (7202)          | MCP 工具错误   |
| `MCP_RESOURCE_ERROR` (7203)      | MCP 资源错误   |
| `MCP_SERVER_ERROR` (7204)        | MCP 服务器错误 |
| `TOOL_NOT_FOUND` (7400)          | 工具未找到     |
| `TOOL_VALIDATION_FAILED` (7401)  | 工具验证失败   |
| `TOOL_EXECUTION_FAILED` (7402)   | 工具执行失败   |
| `TOOL_TIMEOUT` (7403)            | 工具执行超时   |

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

---

## 相关 Skills

- `hai-build`：模块初始化顺序
- `hai-core`：配置与 Result 模型
- `hai-kit`：SvelteKit API 端点集成
