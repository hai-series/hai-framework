---
name: hai-usage-ai
description: "Use when: using @h-ai/ai, LLM calls, chat completion, tool calling, function calling, MCP server, streaming, memory management, context compression, summarization, token estimation, RAG, knowledge base, AI client, embeddings, reasoning, rerank, file parsing, speech recognition ASR, speech synthesis TTS, audio, A2A agent-to-agent. 使用 @h-ai/ai 进行 LLM 调用、工具定义、MCP 服务器、流式处理、记忆管理、上下文压缩、知识库、推理引擎、Rerank、文件解析、语音识别与合成、A2A 与会话持久化。"
---

# hai-usage-ai — @h-ai/ai 快速指南

`@h-ai/ai` 统一提供 LLM、工具、MCP、Embedding、Memory、Retrieval/RAG、Knowledge、Context、File、Rerank、语音（ASR/TTS）与 A2A 能力。

> 详细 API 表、错误码与长示例见同目录 `reference.md`。只有需要完整契约或边界用例时再读取，避免把长参考塞进上下文。

## 使用边界

- `ai.tools`、`ai.stream` 是纯函数能力，无需 `ai.init()`。
- `ai.llm`、`ai.embedding`、`ai.memory`、`ai.retrieval`、`ai.rag`、`ai.knowledge`、`ai.context`、`ai.audio`、`ai.a2a` 需要先 `await ai.init(...)`。
- 默认 DB Provider 需要在 `ai.init()` 前完成 `reldb.init()` 与 `vecdb.init()`；自定义 `AIStoreProvider` 可跳过这两个依赖。
- 浏览器端不要直接调用 Node-only 能力；通过 `@h-ai/api-client` 或应用自定义 API/SSE endpoint 代理。
- 公共 API 返回 `HaiResult<T>` 时按 `if (!result.success) return result` 处理；不要用 `try/catch` 包裹正常业务错误。

## 初始化与关闭

```ts
import { core } from '@h-ai/core'
import { ai } from '@h-ai/ai'
import { reldb } from '@h-ai/reldb'
import { vecdb } from '@h-ai/vecdb'

await reldb.init(core.config.get('db'))
await vecdb.init(core.config.get('vecdb'))

const init = await ai.init(core.config.get('ai'))
if (!init.success) return init

// ... 使用 ai.llm / ai.memory / ai.knowledge 等

await ai.close()
```

自定义存储：

```ts
await ai.init(core.config.get('ai'), { storeProvider: myProvider })
await ai.close()
```

## 配置要点

```yaml
llm:
  apiKey: ${HAI_AI_LLM_API_KEY:}
  baseUrl: ${HAI_AI_LLM_BASE_URL:https://api.openai.com/v1}
  model: ${HAI_AI_LLM_MODEL:gpt-4o-mini}
  api: chat # chat（默认）| responses | anthropic——底层协议，对使用方透明
  timeout: 60000
  tempModelCacheTtl: 600000 # 临时模型客户端缓存 TTL（毫秒，默认 10 分钟）
  models: # 可为单个模型指定协议（responses / anthropic）
    - { id: claude, model: claude-3-5-sonnet-latest, api: anthropic }
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
  chunkOptions:
    mode: markdown
    maxSize: 1500
    overlap: 200

# 可选：真·mem0ai/oss 引擎（嵌入式，LLM/Embedder 从 llm 配置提取，向量库复用底层 vecdb 后端或退回 mem0 自带存储）
memory:
  provider: mem0
  defaultTopK: 10
```

`ai.config` 是脱敏快照；`apiKey`、`privateKey`、URL 内嵌凭证会被隐藏。

## 常用 API

| 场景 | 首选 API | 备注 |
| --- | --- | --- |
| 非流式对话 | `ai.llm.chat({ messages })` | OpenAI 兼容 Chat Completion |
| 流式对话 | `ai.llm.chatStream({ messages })` | 返回 `AsyncIterable` |
| 多协议 | 模型 `api: chat/responses/anthropic` | 底层走 Chat Completions / Responses / Anthropic，公共形状不变 |
| 请求取消 | `ai.llm.chat({ messages, signal })` | 传 `AbortSignal`，`abort()` 立即停上游生成 |
| 临时模型 | `ai.llm.chat({ messages, tempModel })` | 单次请求级临时端点，客户端按 TTL 缓存 |
| 工具定义 | `ai.tools.define(...)` | Zod schema 转 JSON Schema |
| 工具执行 | `registry.executeAll(toolCalls)` | 支持并行执行 |
| MCP 服务 | `createMcpServer(...)` | 按需连接 HTTP/SSE/Stdio transport |
| Embedding | `ai.embedding.embedText(text)` | 批量用 `embedBatch` |
| 记忆 | `ai.memory.extract/recall/injectMemories` | 用 `objectId` 做主体隔离，`scope` 做业务作用域隔离；scope 隔离越细，`candidateMultiplier` 调大以防漏召回 |
| 角色人格 | `ai.persona.save/get/compose` | 定义 AI 身份（systemPrompt + traits），`compose` 组合系统提示词；按 `objectId` 隔离多租户（不传默认 `system` 平台角色），`scope: { personaId }` 关联长期记忆 |
| Retrieval/RAG | `ai.retrieval.retrieve` / `ai.rag.query` | Retrieval source 先注册或由配置预置 |
| Knowledge | `ai.knowledge.setup/ingest/ask` | 入库前会调用 datapipe 清洗分块 |
| Context | `ai.context.createManager` | 编排 LLM + Memory + RAG + 压缩；`manager.consolidate()` 把会话固化为长期记忆 |
| 语音识别 | `ai.audio.transcribe` / `transcribeStream` | 完整音频返回 `HaiResult`；持续音频输入用 `AudioInputStream` 流式返回临时文本 |
| 语音合成 | `ai.audio.synthesize` / `synthesizeStream` | `text` 可为字符串或 `AsyncIterable<string>`（可接 LLM 文本流边生成边合成） |
| A2A | `ai.a2a.registerExecutor/handleRequest` | 延迟初始化 SDK handler |

## LLM + 工具调用

```ts
import { z } from 'zod'

const registry = ai.tools.createRegistry()
registry.register(ai.tools.define({
  name: 'get_weather',
  description: '获取天气',
  parameters: z.object({ city: z.string() }),
  handler: async ({ city }) => ({ city, temperature: 20 }),
}))

const messages: ChatMessage[] = [{ role: 'user', content: '北京天气？' }]
let result = await ai.llm.chat({ messages, tools: registry.getDefinitions() })

while (result.success && result.data.choices[0]?.finish_reason === 'tool_calls') {
  const assistant = result.data.choices[0].message
  const toolCalls = assistant.tool_calls ?? []
  messages.push(assistant)

  const toolMessages = await registry.executeAll(toolCalls, { parallel: true })
  if (!toolMessages.success) return toolMessages
  messages.push(...toolMessages.data)

  result = await ai.llm.chat({ messages, tools: registry.getDefinitions() })
}
```

## 流式处理

```ts
const processor = ai.stream.createProcessor()
for await (const chunk of ai.llm.chatStream({ messages })) {
  const delta = processor.process(chunk)
  if (delta?.content) process.stdout.write(delta.content)
}
const message = processor.toAssistantMessage()
```

## 临时模型（tempModel）

单次请求级别绕过配置注册模型，直接指定端点与凭据；适用于运行时动态切换模型、多租户各带凭据。
`chat` / `chatStream` / `ask` / `askStream` 均支持。未指定字段回退全局 LLM 配置 / 环境变量；
请求显式 `max_tokens` / `temperature` 优先于 `tempModel.maxTokens` / `temperature`。
临时客户端按 `apiKey+baseUrl+timeout` 缓存，TTL 默认 10 分钟（`llm.tempModelCacheTtl` 毫秒，可配置），与常驻模型客户端隔离。

```ts
const result = await ai.llm.chat({
  messages: [{ role: 'user', content: '你好' }],
  tempModel: {
    model: 'claude-3-5-sonnet',
    apiKey: 'sk-temp-xxx',
    baseUrl: 'https://temp.endpoint/v1',
    maxTokens: 2048, // 可选
    temperature: 0.3, // 可选
    timeout: 30000, // 可选
  },
})

// ask 便捷方法同样支持
await ai.llm.ask('翻译这段话', { tempModel: { model: 'gpt-4o', apiKey: 'sk-xxx' } })
```

## MCP 服务器

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

## 记忆、RAG 与知识库

`memory.provider` 默认为 `native`（推荐）：HAI 原生引擎，复用 vecdb/reldb/LLM/Embedding，`extract` 采用 **Mem0 式批量合并**（一次 LLM 调用对整批事实与相关既有记忆做 ADD/UPDATE/DELETE/NONE，支持 `category`）。`mem0` 则直接使用 `mem0ai/oss` 的 `Memory` 引擎：LLM/Embedder 从 `llm` 配置提取（OpenAI 兼容），向量库从底层 vecdb 后端提取（qdrant/pgvector 复用，lancedb/chroma 退回 mem0 自带 in-memory 存储）。两者对外 `ai.memory.*` API 完全一致。

```ts
const enriched = await ai.memory.injectMemories(messages, { objectId: 'user-001', topK: 5 })
if (!enriched.success) return enriched

const compressed = await ai.compress.tryCompress(enriched.data, { strategy: 'hybrid', maxTokens: 4000 })
if (!compressed.success) return compressed

const answer = await ai.rag.query('核心架构是什么？', { sources: ['docs'], topK: 5 })
```

知识库流程：

```ts
const setup = await ai.knowledge.setup()
if (!setup.success) return setup

const ingest = await ai.knowledge.ingest({
  documentId: 'doc-001',
  content: markdownText,
  title: '产品手册',
  enableEntityExtraction: true,
})
if (!ingest.success) return ingest

const answer = await ai.knowledge.ask('核心架构是什么？')
```

## Context 管理器

```ts
const managerResult = ai.context.createManager({
  scope: { objectId: 'user-001', sessionId: 'sess-001' },
  systemPrompt: '你是一个友好的助手。',
  compress: { auto: true, strategy: 'hybrid', maxTokens: 8000 },
  memory: { enable: true, enableExtract: true },
})
if (!managerResult.success) return managerResult

const reply = await managerResult.data.chat('你好')
await managerResult.data.save()
```

### 真实对话状态（Conversation Commit Layer）

`turnCommit: 'manual'` 时，`chat` / `chatStream` 不自动写入生成文本，只返回 `turnId`；由调用方提交**实际发生的内容**（TTS 播放、被打断等场景）。`chatStream` 在调用上游模型前就产出 `turn_started`（事件序列 `turn_started → delta* → done`，中途取消 `→ cancelled`），取消时保留 `turnId` 与已生成文本：

```ts
const m = ai.context.createManager({ turnCommit: 'manual', scope }).data
const controller = new AbortController()
for await (const ev of m.chatStream('展开讲讲', { signal: controller.signal })) {
  if (ev.type === 'delta') feedTts(ev.text)
  else if (ev.type === 'done') await m.commitTurn(ev.turnId) // 完整提交
  else if (ev.type === 'cancelled') await m.interruptTurn(ev.turnId, { text: spokenSoFar }) // 只提交播放出去的部分
}
```

- 只有 `committed` 的内容进入上下文与记忆；`getTurns()` 可观测 `generated` / `committed` / `status`。
- 主持人抢话时可在 `turn_started` / 迭代过程中随时 `interruptTurn`；轮次进入终态后即便上游流恰好正常结束，`chatStream` 也**不会再产出 `done`**，业务层不会误判为正常完成。


## 语音（Audio）

`ai.audio` 提供 ASR/TTS，Provider（OpenAI / MiMo / Qwen / 豆包）作为内部实现，凭据未配置时回退平台环境变量。调用方只表达「音频还是文本、完整还是流式」，不感知 WebSocket / SSE / 厂商事件。

```yaml
# ai.init 配置片段
audio:
  models:
    - { id: asr, provider: qwen, model: qwen3-asr-flash-realtime, operations: [transcribe] }
    - { id: tts, provider: qwen, model: qwen3-tts-flash-realtime, operations: [synthesize] }
  transcribeModel: asr
  synthesizeModel: tts
```

```ts
// 完整识别 / 合成（HaiResult）
const t = await ai.audio.transcribe({ audio: { data: wavBytes, format: 'wav' }, language: 'zh' })
if (!t.success) return t
const s = await ai.audio.synthesize({ text: '欢迎', voice: 'Cherry', format: 'pcm16' })

// 实时识别：持续音频输入 → 增量文本（chunk.final 标记语句最终态，可直接覆盖临时文本）
for await (const chunk of ai.audio.transcribeStream({ audio: { chunks: micChunks, format: 'pcm16', sampleRate: 16000 } })) {
  updateTranscript(chunk.text, chunk.final)
}

// 分段合成：稳定 ID 关联文本与音频，支持 AbortSignal 打断
const controller = new AbortController()
for await (const event of ai.audio.synthesizeStream({ text: { id: 'seg-1', text: '欢迎。' }, voice: 'Cherry', signal: controller.signal })) {
  if (event.type === 'segment_started')
    prepareDecoder(event.format, event.sampleRate, event.channels) // 真实输出格式来自服务端解析后的 Provider 输出
  else if (event.type === 'audio')
    await player.write(event.data)
}
```

- 流式方法是 `AsyncIterable`，迭代期间的连接/协议/上游错误会终止迭代（抛出），不返回 `HaiResult`。
- `segment_started` 携带服务端解析 Provider 后的真实输出参数（`format` / `sampleRate?` / `channels?`）；播放器据此解码，不按请求参数猜测格式。
- 平台不支持的输入方式（如 OpenAI/MiMo 的持续音频输入）会抛 `AUDIO_UNSUPPORTED_INPUT`，不伪装成实时。
- 浏览器/移动端经 `@h-ai/serv` 统一语音 WebSocket 入口访问；客户端用已登录 HTTP 请求获取短期一次性 ticket，`@h-ai/ai/client` 通过 `audio.getTicket` 建连，不把 IAM access token 放入 URL。浏览器客户端区分正常结束、取消（`AUDIO_CANCELLED`）与 `end` 前异常断连（`AUDIO_CONNECTION_FAILED`）；服务端 error 帧保留领域错误码，`synthesize` 不返回未完成的部分音频。


## SvelteKit API 端点模式

```ts
export const POST = kit.handler(async ({ request }) => {
  const data = await kit.validate.body(request, ChatSchema)
  const result = await ai.llm.chat({ messages: data.messages })
  if (!result.success) return kit.response.error(result.error.code, result.error.message)
  return kit.response.ok(result.data)
})
```

## 质量与安全检查

- API Key 只从配置 / 环境变量读取，禁止写死。
- 工具 handler 必须校验输入；用户可见错误走 i18n/错误码。
- 模型输出、Prompt 和检索内容均不可信；不要把用户内容拼入不可覆盖的系统规则。Zod 只保证参数形状，高权限工具还必须在 handler 内校验身份、租户、资源归属和配额。
- 只向模型注册允许自动执行的工具；写操作默认要求业务侧确认或幂等键，不能把“模型请求调用”当作授权。
- 批量导入、批量 embedding 用批量 API，避免 await-in-loop。
- 文件解析/OCR 失败按 `HaiAIError.FILE_*` 返回，不抛业务异常。
- A2A 认证失败返回 `A2A_AUTH_FAILED`；`callRemoteAgent` 只依赖 `ai.init()`，无需注册本地 executor。远端 URL 仅接受 HTTP(S) 且不得内嵌凭据，应用仍须配置 origin 白名单与出口网络策略。不要记录 token、apiKey、私钥、完整 headers 或带 query 的 URL。
