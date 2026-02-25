# @h-ai/ai - AI 助手参考

## 模块概述

`@h-ai/ai` 是一个统一的 AI 能力模块，支持 LLM 调用、MCP 服务器和工具管理。

**核心对象**：通过 `ai` 对象访问所有功能，需先调用 `ai.init()` 初始化。

## 目录结构

```
packages/ai/
  package.json
  README.md
  SKILLS.md
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
  messages/
    en-US.json
    zh-CN.json
  src/
    index.ts                          # Node.js 入口（export * 聚合）
    ai-main.ts                        # AI 服务对象（export const ai）
    ai-types.ts                       # 公共类型
    ai-config.ts                      # 错误码 + Zod Schema + 配置类型
    ai-i18n.ts                        # i18n 消息获取器
    ai-index.browser.ts               # 浏览器入口
    llm/
      ai-llm-types.ts                 # LLM 类型定义
      ai-llm-functions.ts             # LLM 功能实现
      ai-llm-stream.ts                # 流式处理工具（createStreamProcessor、collectStream）
      ai-llm-tool.ts                  # 工具定义与注册（defineTool、createToolRegistry）
      providers/
        ai-llm-provider-openai.ts     # OpenAI 兼容 Provider
    mcp/
      ai-mcp-types.ts                 # MCP 类型定义
      ai-mcp-functions.ts             # MCP 功能实现
      ai-mcp-server.ts                # MCP 服务器工厂（createMcpServer）
    client/
      index.ts                        # 浏览器客户端入口
      ai-client.ts                    # HTTP 客户端（createAIClient）
  tests/
```

## 核心 API

```ts
import { ai, AIErrorCode, createMcpServer, createToolRegistry, defineTool } from '@h-ai/ai'
```

### 初始化与关闭

```ts
// 初始化（支持 OpenAI 兼容 API）
ai.init({
  llm: {
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: 'https://api.openai.com/v1', // 可选，默认 OpenAI
    maxTokens: 4096, // 可选
    temperature: 0.7, // 可选
    timeout: 60000, // 可选，毫秒
  },
})

// 检查状态
ai.isInitialized // boolean
ai.config // 当前配置或 null

// 关闭
ai.close()
```

### LLM 操作 (ai.llm)

```ts
// 聊天完成
const result = await ai.llm.chat({
  messages: [
    { role: 'system', content: '你是一个有帮助的助手' },
    { role: 'user', content: '你好' },
  ],
  model: 'gpt-4o-mini', // 可选，使用配置默认值
  temperature: 0.7, // 可选
  max_tokens: 1000, // 可选
  tools: definitions, // 可选，工具定义
})
if (result.success) {
  const message = result.data.choices[0].message
  console.log(message.content)
  console.log(result.data.usage) // Token 使用统计
}

// 流式聊天
for await (const chunk of ai.llm.chatStream({ messages })) {
  const delta = chunk.choices[0]?.delta?.content
  if (delta) {
    process.stdout.write(delta)
  }

  // 检查完成原因
  const finishReason = chunk.choices[0]?.finish_reason
  if (finishReason === 'tool_calls') {
    // 处理工具调用
  }
}

// 获取模型列表
const models = await ai.llm.listModels()
if (models.success) {
  console.log(models.data) // ['gpt-4o-mini', 'gpt-4o', ...]
}
```

### MCP 操作 (ai.mcp)

```ts
// 注册工具
ai.mcp.registerTool(
  { name: 'search', description: '搜索', inputSchema: { type: 'object' } },
  async (input, context) => {
    console.log('请求ID:', context.requestId)
    return { results: [] }
  }
)

// 调用工具
const result = await ai.mcp.callTool('search', { query: 'hello' })

// 注册资源
ai.mcp.registerResource(
  { uri: 'config://app', name: '应用配置', mimeType: 'application/json' },
  async () => ({ uri: 'config://app', text: '{}' })
)

// 读取资源
const resource = await ai.mcp.readResource('config://app')

// 注册提示词
ai.mcp.registerPrompt(
  { name: 'translate', arguments: [{ name: 'text', required: true }] },
  async args => [{ role: 'user', content: { type: 'text', text: args.text } }]
)

// 获取提示词
const prompt = await ai.mcp.getPrompt('translate', { text: 'hello' })
```

### MCP Server

基于 `@modelcontextprotocol/sdk` 封装，提供便捷的 MCP HTTP 服务器创建。

```ts
import { randomUUID } from 'node:crypto'
import { createMcpServer, SSEServerTransport, StdioServerTransport, StreamableHTTPServerTransport } from '@h-ai/ai'
import { z } from 'zod'

// 创建 MCP 服务器
const mcp = createMcpServer({ name: 'my-app', version: '1.0.0' })

// 注册工具（使用 SDK 的 registerTool API）
mcp.registerTool('search', {
  description: '搜索',
  inputSchema: { query: z.string() },
}, async ({ query }) => ({
  content: [{ type: 'text', text: `Results for ${query}` }]
}))

// 注册资源
mcp.registerResource('config', 'config://app', {
  description: '应用配置',
}, async uri => ({
  contents: [{ uri: uri.href, text: '{}' }]
}))

// 注册提示词
mcp.registerPrompt('summarize', {
  description: '总结文本',
  argsSchema: { text: z.string() },
}, async ({ text }) => ({
  messages: [{ role: 'user', content: { type: 'text', text } }]
}))

// 连接 Streamable HTTP 传输（Express 示例）
app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  })
  await mcp.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

const transport = new StdioServerTransport()
await mcp.connect(transport)
```

可用传输层：

| 传输层                          | 说明                        |
| ------------------------------- | --------------------------- |
| `StreamableHTTPServerTransport` | HTTP POST（推荐，Web 场景） |
| `SSEServerTransport`            | SSE（兼容旧客户端）         |
| `StdioServerTransport`          | Stdio（CLI 工具）           |

### 工具定义与注册表

```ts
import { createToolRegistry, defineTool } from '@h-ai/ai'
import { z } from 'zod'

// 定义工具（Zod schema 自动转换为 JSON Schema）
const weatherTool = defineTool({
  name: 'get_weather',
  description: '获取天气信息',
  parameters: z.object({
    city: z.string().describe('城市名称'),
    unit: z.enum(['celsius', 'fahrenheit']).optional(),
  }),
  handler: async ({ city, unit }) => {
    // 自动参数验证
    return { temperature: 20, city, unit: unit ?? 'celsius' }
  },
})

// 手动执行
const result = await weatherTool.execute({ city: '北京' })
if (result.success) {
  console.log(result.data)
}

// 获取 OpenAI 工具定义
const definition = weatherTool.toDefinition()
// { type: 'function', function: { name, description, parameters } }

// 创建注册表
const registry = createToolRegistry()
registry.register(weatherTool)
registry.registerMany([tool1, tool2, tool3])

// 获取所有定义（传递给 LLM）
const definitions = registry.getDefinitions()

// 执行 LLM 返回的工具调用
const toolMessage = await registry.execute({
  id: 'call_xxx',
  type: 'function',
  function: { name: 'get_weather', arguments: '{"city":"北京"}' },
})

// 批量执行
const messages = await registry.executeAll(toolCalls, { parallel: true })
```

### 流处理工具

```ts
import { collectStream, createSSEDecoder, createStreamProcessor, encodeSSE } from '@h-ai/ai'

// 流处理器
const processor = createStreamProcessor()
for await (const chunk of ai.llm.chatStream({ messages })) {
  const delta = processor.process(chunk)
  if (delta?.content) {
    // 逐步显示
  }
}
const result = processor.getResult()
// { content: string, toolCalls: ToolCall[], finishReason: string | null }
const message = processor.toAssistantMessage()
// { role: 'assistant', content: '...', tool_calls?: [...] }

// 快捷收集
const result = await collectStream(stream)

// SSE 编解码
const decoder = createSSEDecoder()
for (const event of decoder.decode(text)) {
  console.log(event.data)
}

const encoded = encodeSSE({ data: '{"text":"hello"}' })
// => 'data: {"text":"hello"}\n\n'
```

### 前端客户端

```ts
import { collectStreamContent, createAIClient, parseSSE } from '@h-ai/ai/client'

const client = createAIClient({
  baseUrl: '/api/ai',
  timeout: 30000, // 可选
  headers: { Authorization: 'Bearer xxx' }, // 可选
})

// 非流式
const response = await client.chat({ messages })

// 流式
for await (const chunk of client.chatStream({ messages }, {
  onProgress: p => console.log(p.content, p.done),
  abortController: new AbortController(),
})) {
  // 处理 chunk
}

// 便捷方法
const reply = await client.sendMessage('你好', '你是一个助手')
const reply = await client.sendMessageStream('你好', { onProgress }, '系统提示')

// 收集流内容
const content = await collectStreamContent(client.chatStream({ messages }))
```

## 错误码

| 错误码                    | 数值 | 说明           |
| ------------------------- | ---- | -------------- |
| `INTERNAL_ERROR`          | 7000 | 内部错误       |
| `NOT_INITIALIZED`         | 7010 | 服务未初始化   |
| `CONFIGURATION_ERROR`     | 7011 | 配置错误       |
| `API_ERROR`               | 7100 | API 调用错误   |
| `INVALID_REQUEST`         | 7101 | 无效请求       |
| `RATE_LIMITED`            | 7102 | 速率限制       |
| `TIMEOUT`                 | 7103 | 请求超时       |
| `MODEL_NOT_FOUND`         | 7104 | 模型未找到     |
| `CONTEXT_LENGTH_EXCEEDED` | 7105 | 上下文长度超限 |
| `MCP_CONNECTION_ERROR`    | 7200 | MCP 连接错误   |
| `MCP_PROTOCOL_ERROR`      | 7201 | MCP 协议错误   |
| `MCP_TOOL_ERROR`          | 7202 | MCP 工具错误   |
| `MCP_RESOURCE_ERROR`      | 7203 | MCP 资源错误   |
| `MCP_SERVER_ERROR`        | 7204 | MCP 服务器错误 |
| `TOOL_NOT_FOUND`          | 7400 | 工具未找到     |
| `TOOL_VALIDATION_FAILED`  | 7401 | 工具验证失败   |
| `TOOL_EXECUTION_FAILED`   | 7402 | 工具执行失败   |
| `TOOL_TIMEOUT`            | 7403 | 工具超时       |

## 配置 Schema

```ts
interface AIConfig {
  llm?: {
    apiKey?: string
    baseUrl?: string // URL 格式
    model?: string // 默认 'gpt-4o-mini'
    maxTokens?: number // 默认 4096
    temperature?: number // 0-2，默认 0.7
    timeout?: number // 毫秒，默认 60000
  }
  mcp?: {
    server?: {
      name: string
      version?: string
      capabilities?: { tools?: boolean, resources?: boolean, prompts?: boolean }
    }
  }
}
```

## 类型定义

### 消息类型

```ts
type ChatMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage

interface SystemMessage {
  role: 'system'
  content: string
}

interface UserMessage {
  role: 'user'
  content: string | (TextContent | ImageContent)[]
}

interface AssistantMessage {
  role: 'assistant'
  content: string | null
  tool_calls?: ToolCall[]
}

interface ToolMessage {
  role: 'tool'
  content: string
  tool_call_id: string
}

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string, arguments: string }
}
```

### 响应类型

```ts
interface ChatCompletionResponse {
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: Array<{
    index: number
    message: AssistantMessage
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter'
  }>
  usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number }
}

interface ChatCompletionChunk {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: Array<{
    index: number
    delta: { role?: 'assistant', content?: string, tool_calls?: ToolCall[] }
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null
  }>
}
```

## 常见场景

### 带工具调用的对话

```ts
const registry = createToolRegistry()
registry.register(weatherTool)

const messages: ChatMessage[] = [
  { role: 'user', content: '北京天气怎么样？' }
]

// 第一次调用
let result = await ai.llm.chat({
  messages,
  tools: registry.getDefinitions(),
})

// 检查是否有工具调用
while (result.success && result.data.choices[0].finish_reason === 'tool_calls') {
  const toolCalls = result.data.choices[0].message.tool_calls!
  messages.push(result.data.choices[0].message)

  // 执行工具
  const toolMessages = await registry.executeAll(toolCalls)
  if (toolMessages.success) {
    messages.push(...toolMessages.data)
  }

  // 继续对话
  result = await ai.llm.chat({ messages, tools: registry.getDefinitions() })
}

console.log(result.data?.choices[0].message.content)
```

### MCP HTTP 服务器

```ts
import { randomUUID } from 'node:crypto'
import { createMcpServer, StreamableHTTPServerTransport } from '@h-ai/ai'
import express from 'express'
import { z } from 'zod'

const app = express()
app.use(express.json())

const mcp = createMcpServer({ name: 'my-mcp-server' })

// 注册工具
mcp.registerTool('echo', {
  description: '回声工具',
  inputSchema: { message: z.string() },
}, async ({ message }) => ({
  content: [{ type: 'text', text: message }]
}))

// HTTP 端点
app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  })
  await mcp.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

app.listen(3000)
```

### 流式响应处理

```ts
const processor = createStreamProcessor()

for await (const chunk of ai.llm.chatStream({ messages })) {
  const delta = processor.process(chunk)

  if (delta?.content) {
    // 实时显示文本
    process.stdout.write(delta.content)
  }

  if (delta?.tool_calls) {
    // 工具调用增量
  }
}

const result = processor.getResult()
if (result.toolCalls.length > 0) {
  // 处理工具调用
}
```

## 注意事项

- `ai.init()` 和 `ai.close()` 是**同步方法**（不返回 Promise），与其他模块不同。
- `ai.tools` 和 `ai.stream` 无需 init 即可使用（工具定义与流处理不依赖 LLM 连接）。
- LLM 操作（`ai.llm.chat`、`ai.llm.chatStream`、`ai.llm.listModels`）需先 init。
- `ai.init()` 返回 `Result<void, AIError>`，需检查 `success` 字段。
- MCP Server 通过 `createMcpServer()` 独立创建，不依赖 `ai.init()`。
- 浏览器端通过 `ai-index.browser.ts` 入口仅导出客户端（`createAIClient`）和流处理工具。
- 工具功能通过 `ai.tools` 访问器暴露（`ai.tools.define()`、`ai.tools.createRegistry()`），也可直接导入 `defineTool`、`createToolRegistry`。
- 流处理通过 `ai.stream` 访问器暴露（`ai.stream.createProcessor()`、`ai.stream.collect()` 等），也可直接导入。
- 所有 API Key 通过配置传入，禁止硬编码。
