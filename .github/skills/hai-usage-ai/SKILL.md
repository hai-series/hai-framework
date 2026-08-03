---
name: hai-usage-ai
description: "Use when: using @h-ai/ai, LLM calls, chat completion, tool calling, function calling, MCP server, streaming, memory management, context compression, summarization, token estimation, RAG, knowledge base, AI client, embeddings, reasoning, rerank, file parsing, image generation, text-to-image, GPT Image, Gemini Image, Qwen Image, Seedream, speech recognition ASR, speech synthesis TTS, audio, A2A agent-to-agent. 使用 @h-ai/ai 进行 LLM 调用、工具定义、MCP 服务器、流式处理、记忆管理、上下文压缩、知识库、推理引擎、Rerank、文件解析、文生图、语音识别与合成、A2A 与会话持久化。"
---

# hai-usage-ai — @h-ai/ai 快速指南

`@h-ai/ai` 统一提供 LLM、工具、MCP、Embedding、Memory、Retrieval/RAG、Knowledge、Context、File、Rerank、Image、语音（ASR/TTS）与 A2A 能力。

> 详细 API 表、错误码与长示例见同目录 `reference.md`。只有需要完整契约或边界用例时再读取，避免把长参考塞进上下文。

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | LLM/流式生成、结构化 Tool、MCP、Embedding、Memory、RAG/Knowledge、Context、Image、Audio、A2A |
| 适用场景 | 服务端 AI 对话、Agent 工具链、知识问答、长期记忆、语音交互和 Agent-to-Agent；浏览器通过 client/API 代理 |
| 输入 | `AIConfigInput`、消息/文本/音频、Zod Tool schema、`objectId/sessionId/scope`、`AbortSignal` |
| 输出 | 领域操作返回 `HaiResult<T>`；流式 API 返回 `AsyncIterable`；Tool 返回 `ToolMessage`；客户端传输可能抛异常 |
| 限制 | 框架不替代业务授权、沙箱、人工确认和网络出口策略；临时 Store 不持久化；Prompt、检索内容和模型 Tool Call 均视为不可信输入 |

## 使用边界

- `ai.tools`、`ai.stream` 是纯函数能力，无需 `ai.init()`。
- `ai.llm`、`ai.embedding`、`ai.memory`、`ai.retrieval`、`ai.rag`、`ai.knowledge`、`ai.context`、`ai.image`、`ai.audio`、`ai.a2a` 需要先 `await ai.init(...)`。
- 未初始化 reldb/vecdb 时，`ai.init()` 使用进程内临时 Store，适合 LLM-only 与本地原型；数据在 `ai.close()` 或进程退出后丢失。
- reldb 与 vecdb 均已初始化时自动使用持久化 DB Provider；生产 Memory/Context/Persona/Knowledge 应使用该路径或自定义 `AIStoreProvider`。
- 浏览器端不要直接调用 Node-only 能力；通过 `@h-ai/api-client` 或应用自定义 API/SSE endpoint 代理。
- 公共 API 返回 `HaiResult<T>` 时按 `if (!result.success) return result` 处理；不要用 `try/catch` 包裹正常业务错误。

## 初始化与关闭

```ts
import { core } from '@h-ai/core'
import { ai } from '@h-ai/ai'

const init = await ai.init(core.config.get('ai'))
if (!init.success) return init

// LLM-only：未初始化 DB 时使用进程内临时 Store
// ... 使用 ai.llm

await ai.close()
```

需要持久化时先初始化 DB：

```ts
import { reldb } from '@h-ai/reldb'
import { vecdb } from '@h-ai/vecdb'

await reldb.init(core.config.get('db'))
await vecdb.init(core.config.get('vecdb'))
await ai.init(core.config.get('ai'))
```

自定义存储：

```ts
await ai.init(core.config.get('ai'), { storeProvider: myProvider })
await ai.close()
```

## 配置要点

```yaml
llm:
  apiKey: ''
  baseUrl: https://api.openai.com/v1
  model: gpt-4o-mini
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

# 可选：mem0ai/oss 引擎；无法映射持久化后端时默认 fail-fast
memory:
  provider: mem0
  defaultTopK: 10
  # allowEphemeralFallback: true # 仅明确接受重启丢失数据时开启
```

YAML 写默认值；`HAI_AI_LLM_APIKEY`、`HAI_AI_LLM_BASEURL`、
`HAI_AI_LLM_MODEL` 等约定环境变量自动覆盖对应叶子项，且优先级更高。

`ai.config` 是脱敏快照；`apiKey`、`privateKey`、URL 内嵌凭证会被隐藏。

## 常用 API

| 场景 | 首选 API | 备注 |
| --- | --- | --- |
| 非流式对话 | `ai.llm.chat({ messages })` | OpenAI 兼容 Chat Completion |
| 流式对话 | `ai.llm.chatStream({ messages })` | 返回 `AsyncIterable` |
| 多协议 | 模型 `api: chat/responses/anthropic` | 底层走 Chat Completions / Responses / Anthropic，公共形状不变 |
| 请求取消 | `ai.llm.chat({ messages, signal })` | 传 `AbortSignal`，`abort()` 立即停上游生成 |
| 临时模型 | `ai.llm.chat({ messages, tempModel })` | 单次请求级临时端点，客户端按 TTL 缓存 |
| 工具定义 | `ai.tools.define(...)` | Zod schema 转 JSON Schema；`handler(input, ctx)` 第二参为执行上下文 |
| 工具注册 | `registry.register/replace` | `register` 默认拒绝同名并返回 HaiResult；只有 `replace` 可显式替换 |
| 工具执行 | `registry.execute(tc, { signal, objectId, sessionId, deadline?, timeoutMs?, authorize? })` / `executeAll(...)` | Registry/单次授权必须同时通过；默认串行，支持取消/超时；只有确认无副作用时才 `parallel: true` |
| MCP 服务 | `createMcpServer(...)` | 按需连接 HTTP/SSE/Stdio transport |
| Embedding | `ai.embedding.embedText(text)` | 批量用 `embedBatch` |
| 记忆 | `ai.memory.extract/recall/injectMemories` | `extract(..., { signal })` 可取消整条提取链；用 `objectId` 做主体隔离，`scope` 做业务作用域隔离；scope 隔离越细，`candidateMultiplier` 调大以防漏召回 |
| 记忆作用域 | `ai.memory.scoped({ objectId, scope })` | **多租户推荐入口**：所有操作自动绑定 objectId/scope（含归属校验）；`clear` 仅清作用域内 |
| 记忆管理 | `ai.memory.admin.clearAll({ confirm: true })` | 唯一的全局清空入口（需显式确认）；`ai.memory.clear()` 空过滤会被拒绝，防误清全局 |
| 角色人格 | `ai.persona.save/get/compose` | 定义 AI 身份（systemPrompt + traits），`compose` 组合系统提示词；按 `objectId` 隔离多租户（不传默认 `system` 平台角色），`scope: { personaId }` 关联长期记忆 |
| Retrieval/RAG | `ai.retrieval.retrieve` / `ai.rag.query` | Retrieval source 先注册或由配置预置 |
| Knowledge | `ai.knowledge.setup/ingest/ask` | 入库前会调用 datapipe 清洗分块 |
| Context | `ai.context.createManager` | 编排 LLM + Memory + RAG + 压缩；`manager.consolidate()` 把会话固化为长期记忆 |
| Context 并发 | `createManager({ concurrency: 'reject' \| 'queue' })` | 默认单活动生成防消息乱序；活动生成期间新 chat 返回 `CONTEXT_BUSY`（reject）或排队（queue） |
| Context 重置 | `await manager.reset({ preserveSystemPrompt?, cancelActiveTurn?, waitForMemoryTasks? })` | 异步：终止活动生成、清空消息/摘要/轮次，默认保留系统提示词 |
| 语音识别 | `ai.audio.transcribe` / `transcribeStream` | 完整音频返回 `HaiResult`；持续音频输入用 `AudioInputStream` 流式返回临时文本 |
| 语音合成 | `ai.audio.synthesize` / `synthesizeStream` | `text` 可为字符串或 `AsyncIterable<string>`（可接 LLM 文本流边生成边合成）；完整结果可用 `serializePlayableAudio` 转为浏览器播放负载 |
| 图片生成 | `ai.image.generate({ prompt, size?, model?, referenceImages? })` | 可选参考图使用字节 + MIME；Provider 协议和临时 URL 下载由模块内部处理 |
| A2A | `ai.a2a.registerExecutor/handleRequest` | 延迟初始化 SDK handler |

## LLM + 工具调用

```ts
import { z } from 'zod'

const registry = ai.tools.createRegistry({
  authorize: ({ toolName, context }) => canExecuteTool(context.objectId, toolName),
})
const registered = registry.register(ai.tools.define({
  name: 'get_weather',
  description: '获取天气',
  parameters: z.object({ city: z.string() }),
  handler: async ({ city }) => ({ city, temperature: 20 }),
}))
if (!registered.success) return registered

const messages: ChatMessage[] = [{ role: 'user', content: '北京天气？' }]
const objectId = 'user-001'
let result = await ai.llm.chat({ messages, tools: registry.getDefinitions() })

while (result.success && result.data.choices[0]?.finish_reason === 'tool_calls') {
  const assistant = result.data.choices[0].message
  const toolCalls = assistant.tool_calls ?? []
  messages.push(assistant)

  const toolMessages = await registry.executeAll(toolCalls, { objectId })
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
import { core } from '@h-ai/core'

const server = createMcpServer({ name: 'my-server', version: '1.0.0' })
server.registerTool('search', {
  description: '搜索',
  inputSchema: { query: z.string() },
}, async ({ query }) => ({
  content: [{ type: 'text', text: `Results for ${query}` }],
}))

await server.connect(new StreamableHTTPServerTransport({ sessionIdGenerator: core.id.uuid }))
```

## 记忆、RAG 与知识库

`memory.provider` 默认为 `native`（推荐）：HAI 原生引擎，复用 vecdb/reldb/LLM/Embedding，`extract` 采用 **Mem0 式批量合并**（一次 LLM 调用对整批事实与相关既有记忆做 ADD/UPDATE/DELETE/NONE，支持 `category`）。`mem0` 则直接使用 `mem0ai/oss` 的 `Memory` 引擎：LLM/Embedder 从 `llm` 配置提取（OpenAI 兼容），向量库从底层 vecdb 后端提取（qdrant/pgvector 复用）。**mem0 无法映射 lancedb/chroma 等后端时默认 fail-fast**（初始化失败，避免重启后记忆静默丢失）；只有显式 `memory.allowEphemeralFallback: true` 才退回 mem0 自带 in-memory 存储。两者对外 `ai.memory.*` API 完全一致。

```ts
const enriched = await ai.memory.injectMemories(messages, { objectId: 'user-001', topK: 5 })
if (!enriched.success) return enriched

const compressed = await ai.compress.tryCompress(enriched.data, { strategy: 'hybrid', maxTokens: 4000 })
if (!compressed.success) return compressed

const answer = await ai.rag.query('核心架构是什么？', { sources: ['docs'], topK: 5 })
```

`tryCompress` 的成功结果一定满足 `compressedTokens <= maxTokens`。如果永久 system 指令、最近消息或最新 user 输入自身已超过预算，会返回 `HaiAIError.CONTEXT_BUDGET_EXCEEDED`；调用方应停止本次模型请求或提高预算，不能继续发送原始超长消息。

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

需要通过 API 返回浏览器可播放的 Base64 音频时，调用 `serializePlayableAudio(result.data)`；该函数会将 `pcm16` 封装为 WAV，并透传 WAV/MP3，`opus` 不支持该转换。

```ts
import { serializePlayableAudio } from '@h-ai/ai'

const synthesized = await ai.audio.synthesize({ text: '欢迎参加访谈。' })
if (!synthesized.success)
  return synthesized

const playable = serializePlayableAudio(synthesized.data)
if (!playable.success)
  return playable
```

- 流式方法是 `AsyncIterable`，迭代期间的连接/协议/上游错误会终止迭代（抛出），不返回 `HaiResult`。
- `segment_started` 携带服务端解析 Provider 后的真实输出参数（`format` / `sampleRate?` / `channels?`）；播放器据此解码，不按请求参数猜测格式。
- 平台不支持的输入方式（如 OpenAI/MiMo 的持续音频输入）会抛 `AUDIO_UNSUPPORTED_INPUT`，不伪装成实时。
- 浏览器/移动端经 `@h-ai/serv` 统一语音 WebSocket 入口访问；客户端用已登录 HTTP 请求获取短期一次性 ticket，`@h-ai/ai/client` 通过 `audio.getTicket` 建连，不把 IAM access token 放入 URL。浏览器客户端区分正常结束、取消（`AUDIO_CANCELLED`）与 `end` 前异常断连（`AUDIO_CONNECTION_FAILED`）；服务端 error 帧保留领域错误码，`synthesize` 不返回未完成的部分音频。

## 文生图（Image）

`ai.image` 只暴露稳定的提示词、模型别名、像素尺寸、可选参考图和图片字节；OpenAI、Google、Qwen、Seedream 与 Pollinations 的请求结构、鉴权、响应解析和临时 URL 下载均封装在内部 Provider。

```yaml
image:
  models:
    - { id: free, provider: pollinations, model: zimage }
    - { id: openai, provider: openai, model: gpt-image-2 }
    - { id: google, provider: google, model: gemini-3.1-flash-image-preview }
    - { id: qwen, provider: qwen, model: qwen-image-2.0-pro }
    - { id: seedream, provider: seedream, model: doubao-seedream-5-0-260128 }
  generateModel: free
```

```ts
const image = await ai.image.generate({
  prompt: '水墨风格的未来城市，清晨薄雾',
  size: { width: 1024, height: 1024 },
  referenceImages: [{ data: referenceBytes, mimeType: 'image/png' }],
})
if (!image.success) return image
await saveImage(image.data.images[0].data, image.data.images[0].mimeType)
```

- `Pollinations` 提供可免费起步的开发额度，但仍需 API key；不要把“免费额度”描述为匿名或无限调用。
- 应用应通过 `core.init({ configDir: './config' })` 加载 `_core.yml` / `_ai.yml`，再以 `core.config.validate('ai', AIConfigSchema)` 校验并传给 `ai.init`；不要在启动代码中重复拼装模型、端点和超时，也不要传入 `logging` 覆盖 `_core.yml`。
- Pollinations 的 HTTP 402 表示账户余额或该 API Key 的预算耗尽；401 是密钥无效，403 是权限或模型访问被拒。诊断日志记录厂商、模型、状态、上游错误码和请求 ID，不记录密钥、提示词或图片内容。
- Qwen 等返回的临时图片 URL 会在 Provider 内立即下载，公共结果不泄漏易过期 URL。
- 参考图统一使用 `{ data: Uint8Array, mimeType: 'image/...' }`；不要把厂商 URL、multipart 或 Base64 结构泄漏到业务层。
- Provider 请求/响应格式变更时，先更新契约测试，再修改实现。


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
