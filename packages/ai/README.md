# @h-ai/ai

AI 能力模块，提供统一的 `ai` 对象访问大模型、MCP 服务和工具调用功能。

## 功能特性

| 功能       | 说明                                 |
| ---------- | ------------------------------------ |
| LLM        | 大模型调用、流式响应、模型列表       |
| MCP        | 工具注册与调用、资源读取、提示词管理 |
| MCP Server | MCP HTTP 服务器、传输层支持          |
| Tools      | 工具定义、参数验证、批量执行         |
| Client     | 前端轻量客户端（流式响应、SSE 解析） |

## 安装

```bash
pnpm add @h-ai/ai
```

## 快速开始

```ts
import { ai } from '@h-ai/ai'

// 1. 初始化 AI 服务
ai.init({
  llm: {
    model: 'gpt-4o-mini',
    apiKey: process.env.HAI_OPENAI_API_KEY,
  },
})

// 2. LLM 调用
const result = await ai.llm.chat({
  messages: [
    { role: 'system', content: '你是一个有帮助的助手' },
    { role: 'user', content: '你好！' },
  ],
})
if (result.success) {
  console.log(result.data.choices[0].message.content)
}

// 3. 流式调用
for await (const chunk of ai.llm.chatStream({ messages })) {
  const delta = chunk.choices[0]?.delta?.content
  if (delta)
    process.stdout.write(delta)
}

// 4. 关闭服务
ai.close()
```

## MCP Server

```ts
import { randomUUID } from 'node:crypto'
import { createMcpServer, StreamableHTTPServerTransport } from '@h-ai/ai'
import { z } from 'zod'

// 创建 MCP 服务器
const mcp = createMcpServer({ name: 'my-app' })

// 注册工具
mcp.registerTool('search', {
  description: '搜索',
  inputSchema: { query: z.string() },
}, async ({ query }) => ({
  content: [{ type: 'text', text: `Results for ${query}` }]
}))

// 连接 HTTP 传输层（以 Express 为例）
app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  })
  await mcp.connect(transport)
  await transport.handleRequest(req, res, req.body)
})
```

## 工具调用

```ts
import { ai } from '@h-ai/ai'
import { z } from 'zod'

// 定义工具（Zod Schema 自动转 JSON Schema + 参数校验）
const weatherTool = ai.tools.define({
  name: 'get_weather',
  description: '获取天气信息',
  parameters: z.object({
    city: z.string().describe('城市名称'),
  }),
  handler: async ({ city }) => ({ temperature: 20, city }),
})

// 注册表管理
const registry = ai.tools.createRegistry()
registry.register(weatherTool)

// 获取工具定义（传递给 LLM）
const definitions = registry.getDefinitions()

// 执行工具调用
const result = await registry.execute(toolCall)
```

## 前端客户端

```ts
import { createAIClient } from '@h-ai/ai/client'

const client = createAIClient({
  baseUrl: '/api/ai',
})

// 流式聊天
for await (const chunk of client.chatStream({ messages })) {
  const delta = chunk.choices[0]?.delta?.content
  if (delta)
    console.log(delta)
}

// 便捷方法
const reply = await client.sendMessage('你好', '你是一个助手')
```

## 流处理工具

```ts
import { ai } from '@h-ai/ai'

// 逐块处理流
const processor = ai.stream.createProcessor()
for await (const chunk of stream) {
  const delta = processor.process(chunk)
  if (delta?.content)
    console.log(delta.content)
}
const result = processor.getResult()

// 快捷收集完整内容
const collected = await ai.stream.collect(stream)
```

## 错误处理

```ts
import { AIErrorCode } from '@h-ai/ai'

const result = await ai.llm.chat({ messages })
if (!result.success) {
  switch (result.error.code) {
    case AIErrorCode.NOT_INITIALIZED:
      console.error('请先调用 ai.init()')
      break
    case AIErrorCode.RATE_LIMITED:
      console.error('请求过于频繁')
      break
    case AIErrorCode.TIMEOUT:
      console.error('请求超时')
      break
    default:
      console.error(result.error.message)
  }
}
```
