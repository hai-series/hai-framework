# @h-ai/ai

AI 能力模块，提供统一的 `ai` 对象访问大模型、MCP 服务和工具调用功能。

## 功能特性

| 子系统     | 说明                                                                | 需要初始化 |
| ---------- | ------------------------------------------------------------------- | ---------- |
| LLM        | 大模型调用（非流式 / 流式）、模型列表                               | ✅         |
| MCP        | 工具注册与调用、资源读取、提示词管理                                | ✅         |
| MCP Server | MCP HTTP 服务器、多传输层支持                                       | ❌         |
| Tools      | 工具定义（Zod → JSON Schema）、注册表管理、批量执行                 | ❌         |
| Stream     | 流式块处理、SSE 编解码、流收集                                      | ❌         |
| Embedding  | 文本向量化、单条 / 批量嵌入                                         | ✅         |
| Reasoning  | 推理引擎（CoT / ReAct / Plan-Execute）                              | ✅         |
| Retrieval  | 多来源向量检索、分数过滤                                            | ✅         |
| RAG        | 检索增强问答（Retrieval + LLM）                                     | ✅         |
| Knowledge  | 知识库管理（入库、检索、问答、实体提取）                            | ✅         |
| Memory     | 对话记忆提取、存储、检索、注入（支持 objectId 隔离）                | ✅         |
| Token      | Token 估算（文本 / 消息列表）                                       | ✅         |
| Summary    | 消息摘要生成（支持增量摘要）                                        | ✅         |
| Compress   | 上下文压缩（sliding-window / summary / hybrid）                     | ✅         |
| Context    | 有状态上下文管理器（压缩 + LLM/Memory/RAG/Reasoning 编排 + 持久化） | ✅         |
| Store      | 统一存储抽象（持久化）                                              | 内部       |
| Client     | 前端轻量客户端（流式响应、SSE 解析、记忆/会话查询）                 | ❌         |

## 安装

```bash
pnpm add @h-ai/ai
```

## 快速开始

```ts
import { ai } from '@h-ai/ai'

// 1. 初始化
await ai.init({
  llm: {
    model: 'gpt-4o-mini',
    apiKey: process.env.HAI_OPENAI_API_KEY,
  },
})

// 2. 对话
const result = await ai.llm.chat({
  messages: [
    { role: 'system', content: '你是一个有帮助的助手' },
    { role: 'user', content: '你好！' },
  ],
})
if (result.success) {
  const reply = result.data.choices[0].message.content
}

// 3. 关闭
ai.close()
```

---

## 初始化与配置

### 完整配置

```ts
await ai.init({
  // LLM 配置
  llm: {
    apiKey: 'sk-xxx',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini', // 默认模型
    maxTokens: 4096,
    temperature: 0.7,
    timeout: 60000, // 请求超时（毫秒）
    // 多模型注册
    models: [
      { id: 'fast', model: 'gpt-4o-mini', temperature: 0.3 },
      { id: 'strong', model: 'gpt-4o', maxTokens: 8192 },
      { id: 'embed', model: 'text-embedding-3-small', baseUrl: 'https://...' },
    ],
    defaults: {
      chat: 'fast',
      reasoning: 'strong',
    },
  },

  // Embedding 配置
  embedding: {
    model: 'text-embedding-3-small',
    dimensions: 1536,
    batchSize: 100,
  },

  // Knowledge 配置
  knowledge: {
    collection: 'knowledge',
    dimension: 1536,
    model: 'gpt-4o', // 可选，ask/retrieve 使用的 LLM 模型
    apiKey: 'sk-knowledge-xxx', // 可选，覆盖 LLM apiKey
    baseUrl: 'https://knowledge.api.com', // 可选，覆盖 LLM baseUrl
    enableEntityExtraction: true,
    entityExtractionModel: 'gpt-4o-mini', // 可选，实体提取用模型
    chunkMode: 'markdown', // sentence | paragraph | markdown | page
    chunkMaxSize: 1500,
    chunkOverlap: 200,
  },

  // Memory 配置
  memory: {
    maxEntries: 1000,
    extractModel: 'gpt-4o-mini', // 可选，记忆提取用模型
    apiKey: 'sk-memory-xxx', // 可选，覆盖 LLM apiKey
    baseUrl: 'https://memory.api.com', // 可选，覆盖 LLM baseUrl
    embeddingEnabled: true, // 启用向量检索（关闭则仅关键词匹配）
    recencyDecay: 0.95, // 时间衰减系数
    defaultTopK: 10,
  },

  // Token 配置
  token: {
    tokenRatio: 0.25, // Token 估算系数（4 字符 ≈ 1 token）
  },

  // Summary 配置
  summary: {
    systemPrompt: '...', // 可选，覆盖内置摘要提示词
  },

  // Compress 配置
  compress: {
    defaultStrategy: 'hybrid', // summary | sliding-window | hybrid
    defaultMaxTokens: 0, // 0 = 模型 maxTokens × 80%
    preserveLastN: 4, // 保留最近 N 条不压缩
  },

  // MCP 配置
  mcp: {
    server: {
      name: 'my-app',
      version: '1.0.0',
    },
  },
})
```

### 配合 core 配置文件使用

```ts
import { ai } from '@h-ai/ai'
import { core } from '@h-ai/core'

await core.init({ configDir: './config' })
await ai.init(core.config.get('ai'))
// ...
ai.close()
await core.close()
```

### 初始化状态检测

```ts
ai.isInitialized // boolean
ai.config // 当前配置对象，未初始化时为 null
```

---

## LLM 对话 — `ai.llm`

### 非流式对话

```ts
const result = await ai.llm.chat({
  messages: [
    { role: 'system', content: '你是一个翻译助手' },
    { role: 'user', content: '将以下内容翻译为英文：你好世界' },
  ],
  temperature: 0.3,
  max_tokens: 1000,
})

if (result.success) {
  const response = result.data
  const content = response.choices[0].message.content
  const usage = response.usage // { prompt_tokens, completion_tokens, total_tokens }
}
```

### 指定模型

```ts
// 使用 init 时注册的模型 ID 或直接传模型名
const result = await ai.llm.chat({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: '复杂推理问题' }],
})
```

### 流式对话

```ts
const messages = [{ role: 'user' as const, content: '写一首关于编程的诗' }]

for await (const chunk of ai.llm.chatStream({ messages })) {
  const delta = chunk.choices[0]?.delta?.content
  if (delta) {
    process.stdout.write(delta) // 逐字输出
  }
}
```

### 多模态输入（图片）

```ts
const result = await ai.llm.chat({
  model: 'gpt-4o',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: '描述这张图片' },
      { type: 'image_url', image_url: { url: 'https://example.com/photo.jpg', detail: 'high' } },
    ],
  }],
})
```

### 获取可用模型列表

```ts
const models = await ai.llm.listModels()
if (models.success) {
  // models.data: string[]
}
```

---

## 工具调用 — `ai.tools`

> `ai.tools` 为纯函数操作，**不需要初始化**即可使用。

### 定义工具

```ts
import { ai } from '@h-ai/ai'
import { z } from 'zod'

const weatherTool = ai.tools.define({
  name: 'get_weather',
  description: '获取指定城市的天气信息',
  parameters: z.object({
    city: z.string().describe('城市名称'),
    unit: z.enum(['celsius', 'fahrenheit']).optional().describe('温度单位'),
  }),
  handler: async ({ city, unit }) => {
    // 调用天气 API
    return { temperature: 20, city, unit: unit ?? 'celsius' }
  },
})
```

### 注册表管理

```ts
const registry = ai.tools.createRegistry()

// 注册单个 / 批量注册
registry.register(weatherTool)
registry.registerMany([tool1, tool2, tool3])

// 查询
registry.has('get_weather') // true
registry.get('get_weather') // Tool 对象
registry.getNames() // ['get_weather', ...]
registry.size // 注册数量

// 获取 OpenAI 工具定义（传递给 LLM）
const definitions = registry.getDefinitions() // ToolDefinition[]

// 执行工具调用
const toolMessage = await registry.execute(toolCall) // Result<ToolMessage>

// 批量执行（支持并行）
const toolMessages = await registry.executeAll(toolCalls, { parallel: true })

// 取消注册 / 清空
registry.unregister('get_weather')
registry.clear()
```

### 工具集成 LLM 调用

```ts
const result = await ai.llm.chat({
  messages,
  tools: registry.getDefinitions(),
  tool_choice: 'auto', // 'auto' | 'none' | { type: 'function', function: { name: '...' } }
})

if (result.success) {
  const choice = result.data.choices[0]

  // 检查是否有工具调用
  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
    // 执行所有工具调用并获得 ToolMessage[]
    const toolResults = await registry.executeAll(choice.message.tool_calls, { parallel: true })
    if (toolResults.success) {
      // 将工具结果追加到消息继续对话
      messages.push(choice.message) // assistant 消息（含 tool_calls）
      messages.push(...toolResults.data) // tool 结果消息
    }
  }
}
```

---

## 流处理 — `ai.stream`

> `ai.stream` 为纯函数操作，**不需要初始化**即可使用。

### 逐块处理

```ts
const processor = ai.stream.createProcessor()

for await (const chunk of ai.llm.chatStream({ messages })) {
  const delta = processor.process(chunk)
  if (delta?.content) {
    process.stdout.write(delta.content)
  }
}

// 获取完整结果
const result = processor.getResult()
// { content: string, toolCalls: ToolCall[], finishReason: string | null }

// 转为 assistant 消息（可直接 push 到 messages 数组）
const assistantMsg = processor.toAssistantMessage()
// { role: 'assistant', content: '...', tool_calls?: [...] }

// 重置（复用 processor）
processor.reset()
```

### 快捷收集

```ts
// 一次性收集全部内容（不做逐块处理）
const result = await ai.stream.collect(ai.llm.chatStream({ messages }))
// { content: string, toolCalls: ToolCall[], finishReason: string | null }
```

### 流式工具调用

流式响应中 LLM 触发工具调用时，`processor` 会同样累积 `tool_calls`，通过 `finishReason` 判断后执行工具并继续对话：

```ts
const registry = ai.tools.createRegistry()
registry.registerMany([weatherTool, searchTool])

const messages: ChatMessage[] = [{ role: 'user', content: '北京今天天气怎么样？' }]

let continueLoop = true
while (continueLoop) {
  const processor = ai.stream.createProcessor()

  for await (const chunk of ai.llm.chatStream({ messages, tools: registry.getDefinitions() })) {
    const delta = processor.process(chunk)
    if (delta?.content) {
      process.stdout.write(delta.content)
    }
  }

  const result = processor.getResult()

  if (result.finishReason === 'tool_calls' && result.toolCalls.length > 0) {
    // 将 assistant 消息（含 tool_calls）追加到对话
    messages.push(processor.toAssistantMessage())

    // 执行所有工具调用
    const toolResults = await registry.executeAll(result.toolCalls, { parallel: true })
    if (toolResults.success) {
      messages.push(...toolResults.data) // 追加 tool 结果消息
    }
    // 继续循环，让 LLM 消费工具结果
  }
  else {
    // finish_reason 为 'stop'，对话结束
    messages.push(processor.toAssistantMessage())
    continueLoop = false
  }
}
```

### SSE 编解码

SSE 编解码适用于**自建 HTTP 流式接口**（如 SvelteKit `GET` 路由推送 AI 内容到前端）：

```ts
// 服务端：将 LLM 流式 chunk 编码为 SSE 事件推送给客户端
async function* streamToSSE(messages: ChatMessage[]): AsyncGenerator<string> {
  for await (const chunk of ai.llm.chatStream({ messages })) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) {
      yield ai.stream.encodeSSE({ event: 'delta', data: JSON.stringify({ text: delta }) })
    }
  }
  yield ai.stream.encodeSSE({ event: 'done', data: '' })
}

// 客户端：解码 SSE 分片（rawText 可能是不完整的多行数据）
const decoder = ai.stream.createSSEDecoder()

for await (const rawChunk of response.body) {
  for (const event of decoder.decode(rawChunk)) {
    if (event.event === 'delta') {
      const { text } = JSON.parse(event.data!)
      process.stdout.write(text)
    }
    else if (event.event === 'done') {
      break
    }
  }
}

// 重置解码器以复用（如下一次请求）
decoder.reset()
```

> `createSSEDecoder` 内部维护缓冲区，自动拼接跨分片的不完整 SSE 帧，无需手动处理粘包。

---

## Embedding — `ai.embedding`

### 单条文本嵌入

```ts
const result = await ai.embedding.embedText('这是一段需要向量化的文本')
if (result.success) {
  const vector = result.data // number[]（如 1536 维向量）
}
```

### 批量文本嵌入

```ts
const result = await ai.embedding.embedBatch([
  '第一段文本',
  '第二段文本',
  '第三段文本',
])
if (result.success) {
  const vectors = result.data // number[][]
}
```

### 完整嵌入请求

```ts
const result = await ai.embedding.embed({
  input: ['文本1', '文本2'],
  model: 'text-embedding-3-small',
  dimensions: 1536,
})
if (result.success) {
  const response = result.data
  // response.data: EmbeddingItem[]（{ index, embedding }）
  // response.usage: { prompt_tokens, total_tokens }
}
```

---

## 推理引擎 — `ai.reasoning`

支持三种推理策略：

| 策略           | 说明                       | 适用场景           |
| -------------- | -------------------------- | ------------------ |
| `cot`          | 思维链（Chain of Thought） | 分步推理           |
| `react`        | 思考-行动-观察循环         | 需要工具调用的推理 |
| `plan-execute` | 先规划后执行               | 复杂多步任务       |

### 基本推理

```ts
const result = await ai.reasoning.run('如何计算圆的面积？', {
  strategy: 'cot', // 默认 'react'
})

if (result.success) {
  const { answer, steps, rounds } = result.data
  // answer: 最终回答
  // steps: ReasoningStep[]（每步包含 type, content）
  //   type: 'thought' | 'action' | 'observation' | 'plan' | 'answer'
  // rounds: 执行轮数
}
```

### 带工具的推理

```ts
const registry = ai.tools.createRegistry()
registry.register(calculatorTool)
registry.register(searchTool)

const result = await ai.reasoning.run('北京到上海的距离是多少公里？', {
  strategy: 'react',
  tools: registry,
  maxRounds: 5, // 最大轮次（默认 10）
  model: 'gpt-4o',
  temperature: 0.2,
  systemPrompt: '你是一个地理知识专家',
})
```

---

## 检索 — `ai.retrieval`

### 注册检索源

检索源可以在 `ai.init()` 中通过 `retrieval.sources` 预配置，也可以在初始化后动态注册。

**方式一：初始化时预配置**

```ts
await ai.init({
  llm: { apiKey: 'sk-xxx', model: 'gpt-4o-mini' },
  retrieval: {
    sources: [
      { id: 'docs', collection: 'documentation', name: '产品文档', topK: 5, minScore: 0.7 },
      { id: 'faq', collection: 'faq', name: '常见问题', sourceType: 'manual' },
    ],
  },
})
```

**方式二：动态注册**

```ts
// 添加检索源（持久化到 DB）
await ai.retrieval.addSource({
  id: 'docs',
  collection: 'documentation',
  name: '产品文档',
  sourceType: 'document',
  topK: 5,
  minScore: 0.7,
})

await ai.retrieval.addSource({
  id: 'faq',
  collection: 'faq',
  name: '常见问题',
  sourceType: 'manual',
})

// 查看已注册的源（从 DB 读取）
const sources = await ai.retrieval.listSources() // RetrievalSource[]
```

### 执行检索

```ts
const result = await ai.retrieval.retrieve({
  query: '如何配置数据库连接？',
  sources: ['docs', 'faq'], // 指定源（不传则查所有源）
  topK: 10,
  minScore: 0.6,
})

if (result.success) {
  for (const item of result.data.items) {
    // item.content   — 匹配的文本内容
    // item.score     — 相似度分数
    // item.sourceId  — 来自哪个检索源
    // item.citation  — 引用信息（documentId, title, url 等）
  }
}
```

### 移除检索源

```ts
await ai.retrieval.removeSource('docs')
```

---

## RAG 问答 — `ai.rag`

基于 Retrieval + LLM 的检索增强问答。

```ts
const result = await ai.rag.query('项目的部署流程是什么？', {
  sources: ['docs'],
  topK: 5,
  minScore: 0.6,
  model: 'gpt-4o-mini',
  temperature: 0.3,
  systemPrompt: '根据检索到的文档内容回答问题，注明信息来源。',
})

if (result.success) {
  const { answer, citations, context } = result.data
  // answer: LLM 生成的回答
  // citations: Citation[]（引用来源列表）
  // context: RagContextItem[]（使用的上下文片段）
}
```

### 自定义上下文格式

```ts
const result = await ai.rag.query('问题', {
  formatContext: (items) => {
    return items
      .map((item, i) => `[来源${i + 1}] ${item.content}`)
      .join('\n\n')
  },
})
```

### 多轮 RAG 对话

```ts
const result = await ai.rag.query('更详细地解释第二点', {
  messages: [
    { role: 'user', content: '部署流程是什么？' },
    { role: 'assistant', content: '部署分为三步：1. 构建镜像 2. 推送仓库 3. 更新集群' },
  ],
})
```

---

## 知识库 — `ai.knowledge`

完整的知识库管理：文档入库（自动分块 + 向量化 + 实体提取）→ 语义检索 → 知识问答。

### 初始化知识库

```ts
await ai.knowledge.setup({
  collection: 'my-knowledge',
  dimension: 1536,
})
```

### 文档入库

```ts
const result = await ai.knowledge.ingest({
  documentId: 'doc-001',
  content: markdownContent,
  title: '产品使用手册',
  url: 'https://docs.example.com/manual',
  enableEntityExtraction: true, // 自动提取人物、项目、概念等实体
  chunkMode: 'markdown', // sentence | paragraph | markdown | page
  chunkMaxSize: 1500,
  chunkOverlap: 200,
  metadata: { category: 'manual', version: '2.0' },
})

if (result.success) {
  const { chunkCount, entities, duration } = result.data
  // chunkCount: 分块数量
  // entities: KnowledgeEntity[]（提取到的实体）
  // duration: 耗时（毫秒）
}
```

### 知识检索

```ts
const result = await ai.knowledge.retrieve('数据库配置方法', {
  topK: 10,
  minScore: 0.6,
  enableEntityBoost: true, // 实体命中时加权（提高相关性）
  collection: 'my-knowledge',
})

if (result.success) {
  for (const item of result.data.items) {
    // item.content         — 匹配的文本
    // item.score           — 综合分数
    // item.citation        — 引用（documentId, title, url）
    // item.matchedEntities — 命中的实体名称
  }
}
```

### 知识问答

```ts
const result = await ai.knowledge.ask('如何配置 Redis 缓存？', {
  topK: 5,
  model: 'gpt-4o-mini',
  temperature: 0.3,
  systemPrompt: '基于提供的知识回答，标注信息来源。',
})

if (result.success) {
  const { answer, citations, usage } = result.data
  // answer: LLM 生成的回答
  // citations: Citation[]（引用列表）
  // usage: { prompt_tokens, completion_tokens, total_tokens }
}
```

### 多轮知识问答

```ts
const result = await ai.knowledge.ask('请详细解释第二步', {
  messages: [
    { role: 'user', content: 'Redis 配置流程？' },
    { role: 'assistant', content: '分三步：1. 安装 2. 配置 3. 连接测试' },
  ],
})
```

### 实体管理

```ts
// 按实体名查找相关文档
const result = await ai.knowledge.findByEntity('Redis', {
  collection: 'my-knowledge',
  type: 'concept',
})
if (result.success) {
  for (const item of result.data) {
    // item.entity: KnowledgeEntity
    // item.documents: Array<{ documentId, chunkId, relevance, context }>
  }
}

// 列出所有实体
const entities = await ai.knowledge.listEntities({
  type: 'person', // person | project | concept | organization | location | event | other
  keyword: '张',
  limit: 50,
})
```

---

## 记忆管理 — `ai.memory`

从对话中自动提取关键信息（事实、偏好、事件等），存储并在后续对话中检索注入。支持 `objectId` 隔离不同对象（用户/智能体）的记忆空间。

### 记忆类型

| 类型          | 说明                 |
| ------------- | -------------------- |
| `fact`        | 事实信息             |
| `preference`  | 用户偏好、习惯       |
| `event`       | 重要事件、截止日期   |
| `entity`      | 关键人物、组织、项目 |
| `instruction` | 用户的明确指令或规则 |

### 自动提取记忆

```ts
const messages = [
  { role: 'user' as const, content: '我叫张三，我更喜欢用中文回复，我的项目叫 HAI Framework' },
  { role: 'assistant' as const, content: '好的张三，我记住了你的偏好。' },
]

const result = await ai.memory.extract(messages, {
  types: ['preference', 'entity'], // 只提取指定类型（可选）
  minImportance: 0.5, // 过滤低重要性条目（可选）
  objectId: 'user-001', // 关联到对象标识（可选，不传为全局）
  model: 'gpt-4o-mini', // 指定提取模型（可选）
})

if (result.success) {
  // result.data: MemoryEntry[]（已自动存储到内存）
  // 每条包含：id, content, type, importance, vector, createdAt 等
}
```

### 手动添加记忆

```ts
await ai.memory.add({
  content: '用户是后端开发工程师，使用 TypeScript',
  type: 'fact',
  importance: 0.8, // [0, 1]，默认 0.5
  objectId: 'user-001', // 可选，不传为全局
  metadata: { tags: ['tech', 'profile'] },
})

if (result.success) {
  const entry = result.data // MemoryEntry（含自动生成的 id 和 vector）
}
```

### 获取指定记忆

```ts
const result = await ai.memory.get('mem_1709712345_abc12345')
if (result.success) {
  // result.data: MemoryEntry
}
```

### 检索记忆

```ts
const result = await ai.memory.recall('用户的编程语言偏好', {
  topK: 5, // 返回数量（默认 10）
  types: ['preference'], // 按类型过滤
  minImportance: 0.3, // 最低重要性
  recencyWeight: 0.2, // 时间权重 [0, 1]（0 = 纯相似度，1 = 纯时间排序）
  objectId: 'user-001', // 按对象过滤（可选）
})

if (result.success) {
  for (const memory of result.data) {
    // memory.content      — 记忆内容
    // memory.type         — 类型
    // memory.importance   — 重要性
    // memory.createdAt    — 创建时间
    // memory.accessCount  — 被检索次数
  }
}
```

### 注入记忆到对话

```ts
const messages = [
  { role: 'system' as const, content: '你是一个编程助手' },
  { role: 'user' as const, content: '帮我写一个排序函数' },
]

const result = await ai.memory.injectMemories(messages, {
  topK: 5, // 注入记忆数量
  maxTokens: 500, // 记忆最大 Token 预算
  position: 'system', // 'system' = 追加到 system 末尾，'before-last' = 插入最后一条用户消息之前
  objectId: 'user-001', // 按对象过滤（可选）
})

if (result.success) {
  // result.data: ChatMessage[]（已注入记忆的消息列表）
  // system 消息末尾会追加:
  // --- Relevant Memories ---
  // [1] (preference) 用户偏好使用 TypeScript
  // [2] (fact) 用户是后端工程师
  // --- End Memories ---

  const response = await ai.llm.chat({ messages: result.data })
}
```

### 列表、删除与清空

```ts
// 列出记忆（支持过滤）
const list = await ai.memory.list({
  types: ['fact', 'preference'],
  objectId: 'user-001',
  limit: 50,
})

// 分页列出记忆
const page = await ai.memory.listPage({
  objectId: 'user-001',
  offset: 0,
  limit: 20,
})
if (page.success) {
  // page.data.items: MemoryEntry[]
  // page.data.total: number
}

// 删除指定记忆
await ai.memory.remove('mem_1709712345_abc12345')

// 按类型清空
await ai.memory.clear({ types: ['event'] })

// 按对象清空
await ai.memory.clear({ objectId: 'user-001' })

// 全部清空
await ai.memory.clear()
```

---

## Token 估算 — `ai.token`

估算文本或消息列表的 Token 数量。

```ts
// 估算消息列表的 Token 数
const result = ai.token.estimateMessages(messages)
if (result.success) {
  const tokenCount = result.data
}

// 估算纯文本的 Token 数
const count = ai.token.estimateText('Hello world')
// count: number（中文约 1.5 token/字，英文约 4 字符/token）
```

---

## 消息摘要 — `ai.summary`

对消息列表生成 LLM 摘要，支持增量追加。

```ts
// 对消息生成摘要
const result = await ai.summary.summarize(messages, {
  model: 'gpt-4o-mini',
  temperature: 0.3,
})

if (result.success) {
  const { summary, tokenCount, coveredMessages } = result.data
  // summary: 摘要文本
  // tokenCount: 摘要的估算 Token 数
  // coveredMessages: 覆盖的原始消息数
}

// 增量摘要（在已有摘要基础上追加）
const updated = await ai.summary.summarize(newMessages, {
  previousSummary: existingSummary,
})
```

---

## 上下文压缩 — `ai.compress`

压缩超长对话至指定 Token 预算。

### 压缩策略

| 策略             | 说明                                     |
| ---------------- | ---------------------------------------- |
| `sliding-window` | 保留 system + 最近 N 条消息，丢弃旧消息  |
| `summary`        | 对旧消息生成 LLM 摘要替换                |
| `hybrid`（默认） | 先滑动窗口，仍超限则对被移除部分生成摘要 |

### 压缩消息列表

```ts
const result = await ai.compress.tryCompress(messages, {
  strategy: 'hybrid', // summary | sliding-window | hybrid
  maxTokens: 4000, // 目标 Token 预算
  preserveSystem: true, // 保留 system 消息（默认 true）
  preserveLastN: 4, // 保留最近 N 条不压缩（默认 4）
  summaryModel: 'gpt-4o-mini', // 摘要用模型
})

if (result.success) {
  const { messages: compressed, originalTokens, compressedTokens, removedCount, summary } = result.data
  // compressed: 压缩后的消息列表
  // originalTokens: 原始 Token 数
  // compressedTokens: 压缩后 Token 数
  // removedCount: 被移除/合并的消息数
  // summary: 生成的摘要文本（仅 summary/hybrid 策略有值）

  const response = await ai.llm.chat({ messages: compressed })
}
```

---

## 上下文管理 — `ai.context`

有状态上下文管理器，适用于多轮对话场景。自动跟踪 Token 使用量、超限时自动压缩，并可编排 LLM / Memory / RAG / Reasoning / Tools 进行完整的对话流程。支持会话级持久化。

### 创建管理器并对话

```ts
const managerResult = ai.context.createManager({
  scope: { objectId: 'user-001', sessionId: 'sess-001' },
  systemPrompt: '你是一个友好的助手。',
  model: 'gpt-4o-mini',
  compress: {
    maxTokens: 8000,
    strategy: 'hybrid',
    preserveLastN: 4,
    auto: true,
  },
  memory: { enable: true, enableExtract: true, topK: 5 },
})

if (!managerResult.success)
  return

const manager = managerResult.data

// 直接对话（自动编排 LLM + 记忆注入/提取 + 压缩）
const chatResult = await manager.chat('你好')
if (chatResult.success) {
  // chatResult.data.reply — LLM 回复
  // chatResult.data.model — 使用的模型
  // chatResult.data.usage — Token 使用统计
}

// 流式对话
for await (const event of manager.chatStream('讲个故事')) {
  if (event.type === 'delta')
    process.stdout.write(event.text)
  if (event.type === 'done')
    console.warn('\n完成', event.model)
}

// 持久化
await manager.save()
```

### 底层消息管理

```ts
const managerResult = ai.context.createManager({
  compress: { maxTokens: 8000, strategy: 'hybrid' },
})
const manager = managerResult.data

// 手动追加消息（超限时自动触发压缩）
await manager.addMessage({ role: 'user', content: userInput })

// 获取当前消息列表（已压缩）
const msgs = manager.getMessages()
const response = await ai.llm.chat({ messages: msgs.data })

// 追加助手回复
await manager.addMessage(response.data.choices[0].message)

// 查看 Token 使用量
const usage = manager.getTokenUsage()
// usage.data.current / usage.data.budget

// 查看历史摘要
const summaries = manager.getSummaries()

// 重置
manager.reset()
```

### 恢复已有会话

```ts
const managerResult = await ai.context.restoreManager(
  { objectId: 'user-001', sessionId: 'sess-001' },
  { compress: { maxTokens: 8000 }, memory: { enable: true } },
)
if (managerResult.success) {
  const manager = managerResult.data
  // manager 已包含之前保存的消息和摘要
  const result = await manager.chat('继续上次的话题')
}
```

### 启用 RAG / Reasoning / Tools

```ts
const registry = ai.tools.createRegistry()
registry.register(ai.tools.define({
  name: 'search',
  description: '搜索',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => `结果: ${query}`,
}))

const managerResult = ai.context.createManager({
  scope: { objectId: 'user-001', sessionId: 'sess-001' },
  rag: { enable: true, sources: ['docs'], topK: 5 },
  reasoning: { enable: true, strategy: 'react', maxRounds: 5 },
  tools: registry,
})
```

### 列出对象的所有会话

```ts
const result = await ai.context.listSessions('user-001')
if (result.success) {
  for (const session of result.data) {
    // session.sessionId / session.objectId / session.createdAt / session.updatedAt
  }
}
```

---

## MCP 服务器 — `createMcpServer`

> 独立工厂函数，**不需要初始化**即可使用。

### 创建服务器

```ts
import { createMcpServer, StreamableHTTPServerTransport } from '@h-ai/ai'
import { z } from 'zod'

const mcp = createMcpServer({ name: 'my-server', version: '1.0.0' })
```

### 注册工具

```ts
mcp.registerTool('search', {
  description: '搜索文档',
  inputSchema: { query: z.string(), limit: z.number().optional() },
}, async ({ query, limit }) => ({
  content: [{ type: 'text', text: `Found ${limit ?? 10} results for: ${query}` }],
}))
```

### 注册资源

```ts
mcp.registerResource('config', 'config://app', {
  description: '应用配置',
}, async uri => ({
  contents: [{ uri: uri.href, text: JSON.stringify(appConfig) }],
}))
```

### 注册提示词

```ts
mcp.registerPrompt('summarize', {
  description: '总结文本',
  argsSchema: { text: z.string() },
}, async ({ text }) => ({
  messages: [{ role: 'user', content: { type: 'text', text: `请总结：${text}` } }],
}))
```

### 连接传输层

```ts
import { randomUUID } from 'node:crypto'

// Streamable HTTP（推荐）
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
})
await mcp.connect(transport)

// 其他传输层
// import { SSEServerTransport, StdioServerTransport } from '@h-ai/ai'
```

---

## MCP 操作 — `ai.mcp`

作为 MCP 客户端注册与调用工具、资源和提示词。

```ts
// 注册工具
ai.mcp.registerTool(
  { name: 'calc', description: '计算', inputSchema: { expr: { type: 'string' } } },
  async ({ expr }) => ({ result: '2' }),
)

// 调用工具
const result = await ai.mcp.callTool('calc', { expr: '1+1' })

// 注册并读取资源
ai.mcp.registerResource(
  { uri: 'data://users', name: 'users', description: '用户列表' },
  async () => ({ uri: 'data://users', text: JSON.stringify(users) }),
)
const resource = await ai.mcp.readResource('data://users')

// 注册并获取提示词
ai.mcp.registerPrompt(
  { name: 'greet', arguments: [{ name: 'name', required: true }] },
  async ({ name }) => [{ role: 'user', content: { type: 'text', text: `你好 ${name}` } }],
)
const prompt = await ai.mcp.getPrompt('greet', { name: '张三' })
```

---

## 前端客户端 — `createAIClient`

> 浏览器端轻量客户端，通过 API 代理层与后端 AI 通信。

```ts
import { createAIClient } from '@h-ai/ai/client'
import { api } from '@h-ai/api-client'

await api.init({ baseUrl: '/api' })
const client = createAIClient({ api })
```

### 非流式对话

```ts
const response = await client.chat({
  messages: [{ role: 'user', content: '你好' }],
})
// response: ChatCompletionResponse（同服务端返回结构）
```

### 流式对话

```ts
for await (const chunk of client.chatStream({ messages }, {
  onProgress: (progress) => {
    // progress.content — 已累积的内容
    // progress.done    — 是否结束
    // progress.finishReason — 结束原因
  },
})) {
  const delta = chunk.choices[0]?.delta?.content
  if (delta) {
    updateUI(delta)
  }
}
```

### 便捷方式

```ts
// 发送单条消息，返回回复文本
const reply = await client.sendMessage('你好', '你是一个翻译助手')

// 流式发送，返回完整回复文本
const reply = await client.sendMessageStream('写一首诗', {
  onProgress: p => updateUI(p.content),
})
```

### 记忆与会话查询

```ts
// 检索相关记忆
const memories = await client.recallMemories('用户偏好', {
  topK: 5,
  objectId: 'user-001',
})

// 分页列出记忆
const page = await client.listMemories({
  objectId: 'user-001',
  offset: 0,
  limit: 20,
})
// page.items: MemoryEntry[], page.total: number

// 列出某对象的所有会话
const sessions = await client.listSessions('user-001')
// sessions: SessionInfo[]
```

---

## 错误处理

所有需要初始化的子系统方法均返回 `Result<T, AIError>`，通过 `result.success` 判断成功/失败。

```ts
import { AIErrorCode } from '@h-ai/ai'

const result = await ai.llm.chat({ messages })

if (!result.success) {
  switch (result.error.code) {
    case AIErrorCode.NOT_INITIALIZED:
      // 未初始化，请先调用 ai.init()
      break
    case AIErrorCode.RATE_LIMITED:
      // API 限流，稍后重试
      break
    case AIErrorCode.TIMEOUT:
      // 请求超时
      break
    case AIErrorCode.CONTEXT_LENGTH_EXCEEDED:
      // 上下文超长，需压缩消息
      break
    case AIErrorCode.MEMORY_RECALL_FAILED:
      // 记忆检索失败
      break
    case AIErrorCode.CONTEXT_COMPRESS_FAILED:
      // 上下文压缩失败
      break
    default:
      // 通用错误
      break
  }
}
```

---

## 典型场景

### 带工具调用的多轮对话循环

```ts
import type { ChatMessage } from '@h-ai/ai'
import { ai } from '@h-ai/ai'
import { z } from 'zod'

// 定义并注册工具
const weatherTool = ai.tools.define({
  name: 'get_weather',
  description: '获取天气',
  parameters: z.object({ city: z.string() }),
  handler: async ({ city }) => ({ temp: 22, city, condition: '晴' }),
})

const registry = ai.tools.createRegistry()
registry.register(weatherTool)

const messages: ChatMessage[] = [
  { role: 'user', content: '北京和上海今天天气怎么样？' },
]

// 对话循环
let result = await ai.llm.chat({
  messages,
  tools: registry.getDefinitions(),
})

while (result.success && result.data.choices[0].finish_reason === 'tool_calls') {
  const assistantMsg = result.data.choices[0].message
  messages.push(assistantMsg)

  const toolResults = await registry.executeAll(assistantMsg.tool_calls!, { parallel: true })
  if (toolResults.success) {
    messages.push(...toolResults.data)
  }

  result = await ai.llm.chat({ messages, tools: registry.getDefinitions() })
}

if (result.success) {
  const finalAnswer = result.data.choices[0].message.content
}
```

### 记忆增强的长期对话

```ts
import type { ChatMessage } from '@h-ai/ai'
import { ai } from '@h-ai/ai'

await ai.init({
  llm: { model: 'gpt-4o-mini', apiKey: process.env.API_KEY },
  memory: { maxEntries: 500, embeddingEnabled: true },
  compress: { defaultStrategy: 'hybrid', preserveLastN: 6 },
})

const messages: ChatMessage[] = [
  { role: 'system', content: '你是用户的私人助手，请记住用户的偏好。' },
]

async function chat(userInput: string): Promise<string | undefined> {
  messages.push({ role: 'user', content: userInput })

  // 1. 注入历史记忆
  const enriched = await ai.memory.injectMemories(messages, {
    topK: 5,
    position: 'system',
    maxTokens: 500,
  })
  const enrichedMessages = enriched.success ? enriched.data : messages

  // 2. 压缩上下文以适应模型限制
  const compressed = await ai.compress.tryCompress(enrichedMessages, {
    maxTokens: 4000,
    strategy: 'hybrid',
  })
  const finalMessages = compressed.success ? compressed.data.messages : enrichedMessages

  // 3. 调用 LLM
  const result = await ai.llm.chat({ messages: finalMessages })
  if (!result.success)
    return undefined

  const reply = result.data.choices[0].message
  messages.push(reply)

  // 4. 异步提取新记忆（不阻塞响应）
  ai.memory.extract(messages.slice(-2), { objectId: 'chat' })

  return reply.content ?? undefined
}
```

### 知识库 + RAG 完整流程

```ts
import { ai } from '@h-ai/ai'

// 初始化（需要 vecdb + reldb 配合）
await ai.init({
  llm: { model: 'gpt-4o-mini', apiKey: process.env.API_KEY },
  embedding: { model: 'text-embedding-3-small' },
  knowledge: {
    enableEntityExtraction: true,
    chunkMode: 'markdown',
  },
})

// 1. 初始化知识库
await ai.knowledge.setup()

// 2. 批量导入文档
const documents = [
  { id: 'doc-1', content: '# 产品架构\n...', title: '架构文档' },
  { id: 'doc-2', content: '# 部署指南\n...', title: '部署文档' },
]

for (const doc of documents) {
  const result = await ai.knowledge.ingest({
    documentId: doc.id,
    content: doc.content,
    title: doc.title,
    enableEntityExtraction: true,
  })
}

// 3. 知识问答
const answer = await ai.knowledge.ask('项目的部署流程是什么？', {
  topK: 5,
  enableEntityBoost: true,
  systemPrompt: '基于文档准确回答，标注引用来源。',
})

if (answer.success) {
  // answer.data.answer — LLM 回答
  // answer.data.citations — 引用列表
}
```

### 有状态上下文管理器 + 流式输出

```ts
import { ai } from '@h-ai/ai'

await ai.init({
  llm: { model: 'gpt-4o-mini', apiKey: process.env.API_KEY },
  compress: { defaultStrategy: 'hybrid', preserveLastN: 6 },
})

// 创建管理器（使用嵌套 compress 配置）
const managerResult = ai.context.createManager({
  compress: { maxTokens: 8000, auto: true },
  memory: { enable: true, enableExtract: true },
})
if (!managerResult.success)
  return
const manager = managerResult.data

// 方式一：直接使用 chatStream（推荐，自动编排）
for await (const event of manager.chatStream('你好')) {
  if (event.type === 'delta')
    process.stdout.write(event.text)
  if (event.type === 'done')
    console.warn('\n完成，模型:', event.model)
}

// 方式二：手动编排
async function streamChat(userInput: string): Promise<string> {
  await manager.addMessage({ role: 'user', content: userInput })

  const msgs = manager.getMessages()
  if (!msgs.success)
    return ''

  const processor = ai.stream.createProcessor()
  for await (const chunk of ai.llm.chatStream({ messages: msgs.data })) {
    const delta = processor.process(chunk)
    if (delta?.content) {
      process.stdout.write(delta.content)
    }
  }

  const assistantMsg = processor.toAssistantMessage()
  await manager.addMessage(assistantMsg)
  return assistantMsg.content ?? ''
}
```

---

## 测试

```bash
pnpm --filter @h-ai/ai test
```

## License

Apache-2.0
