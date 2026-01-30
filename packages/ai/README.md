# @hai/ai

AI 能力模块，提供统一的 `ai` 对象访问大模型、MCP 服务和技能功能。

## 功能特性

| 功能   | 说明                                 |
| ------ | ------------------------------------ |
| LLM    | 大模型调用、流式响应、模型列表       |
| MCP    | 工具注册与调用、资源读取、提示词管理 |
| Skills | 技能注册与执行、技能查询             |
| Tools  | 工具定义、参数验证、批量执行         |
| Client | 前端轻量客户端（流式响应、SSE 解析） |

## 安装

```bash
pnpm add @hai/ai
```

## 快速开始

```ts
import { ai } from '@hai/ai'

// 1. 初始化 AI 服务
ai.init({
  llm: {
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY,
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

## API 参考

### 初始化

| 方法               | 说明             |
| ------------------ | ---------------- |
| `ai.init()`        | 初始化 AI 服务   |
| `ai.close()`       | 关闭 AI 服务     |
| `ai.config`        | 获取当前配置     |
| `ai.isInitialized` | 检查是否已初始化 |

### ai.llm - LLM 操作

| 方法                  | 说明               |
| --------------------- | ------------------ |
| `chat(request)`       | 聊天完成（非流式） |
| `chatStream(request)` | 流式聊天完成       |
| `listModels()`        | 获取模型列表       |

### ai.mcp - MCP 操作

| 方法                                  | 说明       |
| ------------------------------------- | ---------- |
| `registerTool(definition, handler)`   | 注册工具   |
| `registerResource(resource, handler)` | 注册资源   |
| `registerPrompt(prompt, handler)`     | 注册提示词 |
| `callTool(name, args, context?)`      | 调用工具   |
| `readResource(uri)`                   | 读取资源   |
| `getPrompt(name, args)`               | 获取提示词 |

### ai.skills - 技能操作

| 方法                             | 说明     |
| -------------------------------- | -------- |
| `register(skill)`                | 注册技能 |
| `unregister(name)`               | 注销技能 |
| `get(name)`                      | 获取技能 |
| `query(query)`                   | 查询技能 |
| `execute(name, input, context?)` | 执行技能 |

## 工具调用

```ts
import { createToolRegistry, defineTool } from '@hai/ai'
import { z } from 'zod'

// 定义工具
const weatherTool = defineTool({
  name: 'get_weather',
  description: '获取天气信息',
  parameters: z.object({
    city: z.string().describe('城市名称'),
  }),
  handler: async ({ city }) => ({ temperature: 20, city }),
})

// 创建注册表
const registry = createToolRegistry()
registry.register(weatherTool)

// 获取工具定义（传递给 LLM）
const definitions = registry.getDefinitions()

// 执行工具调用
const result = await registry.execute(toolCall)
```

## 前端客户端

```ts
import { createAIClient } from '@hai/ai/client'

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
import { collectStream, createStreamProcessor } from '@hai/ai'

// 使用流处理器
const processor = createStreamProcessor()
for await (const chunk of stream) {
  const delta = processor.process(chunk)
  if (delta?.content)
    console.log(delta.content)
}
const result = processor.getResult()

// 或直接收集
const result = await collectStream(stream)
```

## 错误处理

```ts
import { AIErrorCode } from '@hai/ai'

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
