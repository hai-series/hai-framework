# @h-ai/ai

AI 能力模块，提供统一的 `ai` 服务对象，覆盖 LLM 对话、工具调用、MCP、Embedding、记忆、检索/RAG、知识库、上下文管理、文件解析、Rerank 与 A2A。Node.js 侧通过 `ai.init()` 初始化，浏览器侧通过 API/client 代理访问。

## 能力概览

- `ai.tools`：工具定义、注册表、批量执行；无需初始化。
- `ai.stream`：ChatCompletion 流式 chunk 处理；无需初始化。
- `ai.llm`：非流式/流式对话、模型列表、历史记录。
- `ai.mcp` / `createMcpServer`：内置 MCP 注册表与独立 MCP Server。
- `ai.embedding`：单条/批量文本向量化。
- `ai.memory`：记忆提取、存储、召回、注入。
- `ai.retrieval` / `ai.rag`：多源向量检索与检索增强问答。
- `ai.knowledge`：文档入库、实体增强检索、知识问答。
- `ai.context`：LLM + Memory + RAG + 压缩的一体化会话管理。
- `ai.file` / `ai.rerank`：文件解析/OCR 与文本重排序。
- `ai.a2a`：Agent-to-Agent 请求处理与远端调用。
- `@h-ai/ai/client`：前端轻量客户端（配合 API 服务）。
- `AIStoreProvider`：统一存储抽象；默认 DB Provider 基于 reldb + vecdb。

更完整的方法清单、错误码与长示例见 [REFERENCE.md](./REFERENCE.md)。

## 快速开始

### 默认 DB Provider（reldb + vecdb）

```ts
import { ai } from '@h-ai/ai'
import { reldb } from '@h-ai/reldb'
import { vecdb } from '@h-ai/vecdb'

await reldb.init({ type: 'sqlite', database: './ai.db' })
await vecdb.init({ type: 'lancedb', path: './ai-vec.db' })

const init = await ai.init({
  llm: {
    model: 'gpt-4o-mini',
    apiKey: process.env.HAI_AI_LLM_API_KEY,
  },
})
if (!init.success) {
  // 按 init.error.code 处理配置/依赖错误
}

const result = await ai.llm.chat({
  messages: [{ role: 'user', content: '你好！' }],
})
if (result.success) {
  const reply = result.data.choices[0]?.message.content ?? ''
}

await ai.close()
await vecdb.close()
await reldb.close()
```

### 自定义 StoreProvider

```ts
import type { AIStoreProvider } from '@h-ai/ai'
import { ai } from '@h-ai/ai'

const storeProvider: AIStoreProvider = createMyStoreProvider()

await ai.init(
  { llm: { model: 'gpt-4o-mini', apiKey: process.env.HAI_AI_LLM_API_KEY } },
  { storeProvider },
)

await ai.close()
```

## API 契约

- 对外只通过 `ai` 服务对象和少量独立工厂（如 `createMcpServer`）访问。
- 生命周期为 `await ai.init(config, options?)` / `await ai.close()`；关闭会等待自定义 `AIStoreProvider.close()`。
- 公共方法返回 `HaiResult<T>` 或 `Promise<HaiResult<T>>`；业务失败通过 `result.success === false` 和 `result.error.code` 表达。
- `ai.tools` 与 `ai.stream` 是纯函数子系统，无需初始化即可使用。
- 默认 DB Provider 需要 reldb/vecdb 已初始化；自定义 Provider 可隐藏其他存储后端。

## API 概览

### LLM

```ts
const result = await ai.llm.chat({ messages })
for await (const chunk of ai.llm.chatStream({ messages })) {
  const delta = chunk.choices[0]?.delta?.content
  if (delta) {
    process.stdout.write(delta)
  }
}
```

### 工具调用

```ts
const registry = ai.tools.createRegistry()
registry.register(ai.tools.define({
  name: 'get_weather',
  description: '获取天气',
  parameters: z.object({ city: z.string() }),
  handler: async ({ city }) => ({ city, temperature: 20 }),
}))

const chat = await ai.llm.chat({ messages, tools: registry.getDefinitions() })
```

### MCP Server

```ts
import { createMcpServer, StreamableHTTPServerTransport } from '@h-ai/ai'

const server = createMcpServer({ name: 'my-server', version: '1.0.0' })
server.registerTool('search', {
  description: '搜索',
  inputSchema: { query: z.string() },
}, async ({ query }) => ({
  content: [{ type: 'text', text: `Results for ${query}` }],
}))
await server.connect(new StreamableHTTPServerTransport({ sessionIdGenerator: crypto.randomUUID }))
```

### Memory / RAG / Knowledge

```ts
const enriched = await ai.memory.injectMemories(messages, { objectId: 'user-001', topK: 5 })
if (!enriched.success) {
  return enriched
}

const rag = await ai.rag.query('核心架构是什么？', { sources: ['docs'], topK: 5 })

const setup = await ai.knowledge.setup()
if (setup.success) {
  await ai.knowledge.ingest({ documentId: 'doc-001', content: markdownText, title: '产品手册' })
}
```

### Context 管理器

```ts
const manager = ai.context.createManager({
  scope: { objectId: 'user-001', sessionId: 'sess-001' },
  compress: { auto: true, strategy: 'hybrid', maxTokens: 8000 },
  memory: { enable: true, enableExtract: true },
})
if (manager.success) {
  const reply = await manager.data.chat('你好')
  await manager.data.save()
}
```

## 配置

```yaml
llm:
  apiKey: ${HAI_AI_LLM_API_KEY:}
  baseUrl: ${HAI_AI_LLM_BASE_URL:https://api.openai.com/v1}
  model: ${HAI_AI_LLM_MODEL:gpt-4o-mini}
  timeout: 60000
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
  maxEntries: 1000
  recencyDecay: 0.95
  embeddingEnabled: true
  defaultTopK: 10
```

`ai.config` 返回脱敏后的配置快照；`apiKey`、`privateKey`、URL 内嵌凭证等敏感字段不会原样暴露。

## 错误处理

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

常见错误段位：

- `hai:ai:010-012`：初始化/配置。
- `hai:ai:100-107`：LLM 与历史记录。
- `hai:ai:300-302`：Embedding。
- `hai:ai:600-701`：Retrieval/RAG。
- `hai:ai:800-805`：Knowledge。
- `hai:ai:900-904`：Memory。
- `hai:ai:980-984`：A2A。

## 测试

```bash
pnpm --filter @h-ai/ai typecheck
pnpm --filter @h-ai/ai lint
pnpm --filter @h-ai/ai test
pnpm --filter @h-ai/ai build
```

## License

Apache-2.0
