# @h-ai/ai

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/api-contract](../api-contract/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/datapipe](../datapipe/README.en.md) · [@h-ai/reldb](../reldb/README.en.md) · [@h-ai/vecdb](../vecdb/README.en.md)

## Introduction

AI capabilities through a unified `ai` service: LLM chat, image generation, tools, MCP, embeddings, memory, retrieval/RAG, knowledge bases, context management, file parsing, reranking, audio (ASR/TTS), and A2A. Initialize with `ai.init()` on Node.js; browsers access it through APIs/clients.

## Core features

- `ai.tools`: tool definitions, registries, and batch execution; no initialization required.
- `ai.stream`: ChatCompletion stream chunk processing; no initialization required.
- `ai.llm`: non-streaming/streaming chat, model lists, and history.
- `ai.mcp` / `createMcpServer`: an in-process MCP registry and a standalone MCP server.
- `ai.embedding`: individual/batch text embeddings.
- `ai.memory`: memory extraction, storage, recall, and injection.
- `ai.persona`: AI persona profiles (system prompts + traits) and prompt composition.
- `ai.retrieval` / `ai.rag`: multi-source vector retrieval and retrieval-augmented answers.
- `ai.knowledge`: document ingestion, entity-enhanced retrieval, and knowledge answers.
- `ai.context`: integrated sessions combining LLM + Memory + RAG + compression.
- `ai.file` / `ai.rerank`: file parsing/OCR and text reranking.
- `ai.audio`: ASR and TTS with full and streaming calls for OpenAI / MiMo / Qwen / Doubao.
- `ai.image`: OpenAI GPT Image, Google Gemini Image / Nano Banana, Qwen-Image 2.0/3.0, Seedream 4.x/5.x, and Pollinations free-quota models.
- `ai.a2a`: Agent-to-Agent request handling and remote calls.
- `@h-ai/ai/client`: lightweight frontend client for API services.
- `AIStoreProvider`: shared storage abstraction. Defaults to a temporary in-process store without databases; automatically uses persistent DB storage when reldb + vecdb are initialized.

For the full method list, error codes, and longer examples, see [REFERENCE.md (Chinese)](./REFERENCE.md).

## Getting started

### Quick start

#### LLM-only (no database dependencies)

```ts
import { ai } from '@h-ai/ai'

const init = await ai.init({
  llm: {
    model: 'gpt-4o-mini',
    apiKey: process.env.HAI_AI_LLM_APIKEY,
  },
})
if (!init.success)
  return init

const result = await ai.llm.chat({
  messages: [{ role: 'user', content: '你好！' }],
})

await ai.close()
```

Without initialized reldb/vecdb, AI stores session/runtime state in a temporary in-process store. Data does not survive `ai.close()`, process exit, or instance switching. Use the DB provider below for persistent Memory, Context, Persona, or sessions across restarts.

#### Persistent DB provider (reldb + vecdb)

```ts
import { ai } from '@h-ai/ai'
import { reldb } from '@h-ai/reldb'
import { vecdb } from '@h-ai/vecdb'

await reldb.init({ type: 'sqlite', database: './ai.db' })
await vecdb.init({ type: 'lancedb', path: './ai-vec.db' })

const init = await ai.init({
  llm: {
    model: 'gpt-4o-mini',
    apiKey: process.env.HAI_AI_LLM_APIKEY,
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

#### Custom StoreProvider

```ts
import type { AIStoreProvider } from '@h-ai/ai'
import { ai } from '@h-ai/ai'

const storeProvider: AIStoreProvider = createMyStoreProvider()

await ai.init(
  { llm: { model: 'gpt-4o-mini', apiKey: process.env.HAI_AI_LLM_APIKEY } },
  { storeProvider },
)

await ai.close()
```

### API contracts

- Public access uses the `ai` service and a few standalone factories such as `createMcpServer`.
- Lifecycle: `await ai.init(config, options?)` / `await ai.close()`; closure waits for custom `AIStoreProvider.close()`.
- Domain methods return `HaiResult<T>` or `Promise<HaiResult<T>>`, with failures expressed by `result.success === false` and `result.error.code`. Streaming `AsyncIterable`, client transports, and third-party callbacks can throw during establishment or iteration.
- `ai.tools` and `ai.stream` are pure-function subsystems usable without initialization.
- Without reldb/vecdb, storage is temporary and in-process; with both initialized, DB storage is automatic. Custom providers can encapsulate other backends.

### API overview

#### LLM

```ts
const result = await ai.llm.chat({ messages })
for await (const chunk of ai.llm.chatStream({ messages })) {
  const delta = chunk.choices[0]?.delta?.content
  if (delta) {
    process.stdout.write(delta)
  }
}

// 请求取消：传入 AbortSignal，主持人打断/用户切换时 abort() 立即停止上游生成与计费
const controller = new AbortController()
const cancellable = ai.llm.chat({ messages, signal: controller.signal })
// controller.abort()

// 多协议：模型的 api 决定底层走 Chat Completions / Responses / Anthropic，公共请求响应形状不变
// - chat（默认）：OpenAI Chat Completions（兼容绝大多数厂商）
// - responses：OpenAI Responses API（/v1/responses）
// - anthropic：Anthropic Messages API（Claude 原生协议，环境变量 ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL）
const claude = await ai.llm.chat({ messages, model: 'claude' }) // 该模型配置 api: anthropic

// 临时模型：单次请求绕过配置注册模型，直接指定端点与凭据（chat/chatStream/ask/askStream 均支持）
// 临时客户端按 TTL 缓存（llm.tempModelCacheTtl，默认 10 分钟），与常驻模型客户端隔离
const temp = await ai.llm.chat({
  messages,
  tempModel: { model: 'claude-3-5-sonnet', api: 'anthropic', apiKey: 'sk-temp' },
})
```

#### Tool calls

```ts
import { z } from 'zod'

const registry = ai.tools.createRegistry({
  // 统一授权在 Zod 校验后、handler 前执行；false/异常均 fail-closed
  authorize: ({ toolName, context }) => canExecuteTool(context.objectId, toolName),
})
const registered = registry.register(ai.tools.define({
  name: 'get_weather',
  description: '获取天气',
  parameters: z.object({ city: z.string() }),
  // handler 第二参为执行上下文：可响应取消（打断/超时）、感知截止时间与交互主体
  handler: async ({ city }, { signal }) => {
    const res = await fetch(`https://api.example.com/weather?city=${city}`, { signal })
    return res.json()
  },
  timeoutMs: 10_000, // 本工具默认超时（可被 execute 的 deadline / timeoutMs 覆盖）
}))
if (!registered.success)
  return registered

// 执行时可传入取消信号 / 超时 / 作用域；取消或超时返回 TOOL_TIMEOUT，且不再等待未响应的 handler
const result = await registry.execute(toolCall, { signal: controller.signal, objectId: 'user-001', timeoutMs: 30_000 })

// 批量调用默认串行，避免副作用工具并发启动；纯读取且确认安全时才显式并行
const batch = await registry.executeAll(toolCalls)

const chat = await ai.llm.chat({ messages, tools: registry.getDefinitions() })
```

#### A2A protocol boundaries

`ai.a2a.getAgentCard()` returns a complete A2A 0.3 Agent Card with `protocolVersion`, MIME, and streaming capabilities. Kit discovery defaults to `/.well-known/agent-card.json`. `handleRequest()` always returns JSON-RPC/SSE results; uninitialized calls return JSON-RPC errors. Trusted HTTP `agentId` maps to executor `context.user.userName`. JSON-RPC/SSE are supported; push notifications, gRPC, and REST are not claimed. Applications remain responsible for business resource authorization.

A2A task/message tables initialize during `ai.init()`. Tasks are read in trusted `agentId` scopes, including get/cancel/continuation. Anonymous requests share one scope, so deployments requiring isolation must enable authentication. `listMessages` is a server administration API with `callerId`, `contextId`, and `since` filters; never expose it to unauthorized clients. Legacy tasks lack reliable subjects; upgrades neither infer ownership nor delete data. After review, applications must migrate `object_id` to `user:<agentId>` (`anonymous` for anonymous records). Legacy messages lacking subject/context fields do not match corresponding filters.

#### MCP Server

`ai.mcp` is an in-process registry; standalone `createMcpServer` uses SDK transports, with no automatic registration between them. `ai.mcp` compiles tool JSON schemas at registration and validates call inputs. Resources must contain exactly one of `text` / `blob`. Prompt arguments and SDK message outputs are validated, with image/audio support. HTTP examples show transport connection only; applications must mount request handling/authentication and close the server on exit.

```ts
import { createMcpServer, StreamableHTTPServerTransport } from '@h-ai/ai'
import { z } from 'zod'

const server = createMcpServer({ name: 'my-server', version: '1.0.0' })
server.registerTool('search', {
  description: '搜索',
  inputSchema: { query: z.string() },
}, async ({ query }) => ({
  content: [{ type: 'text', text: `Results for ${query}` }],
}))
await server.connect(new StreamableHTTPServerTransport({ sessionIdGenerator: () => globalThis.crypto.randomUUID() }))
```

#### Memory / RAG / Knowledge

The default DB Store propagates vector upsert and collection lookup/creation failures, so Knowledge ingestion stops before recording failed vector writes as successful documents. LanceDB uses native atomic merge with persisted primary keys: insert preserves existing IDs and upsert replaces rows. Vector and relational writes do not share a transaction; reconcile and compensate by document/vector ID.

With LanceDB, collection dimensions and metrics persist in the Arrow schema; connection metrics only affect new collections. Reuse the same persistent directory after restart and rebuild collections when embedding dimensions change. Local paths on separate nodes do not share data; distributed Knowledge should use a server vector backend.

Knowledge `retrieve/ask` and the default DB Store forward `filter` to the vector provider and propagate validation/query failures. Knowledge returns `KNOWLEDGE_RETRIEVE_FAILED` (`RAG_FAILED` from ask), without disguising failure as empty results. LanceDB supports AND equality on literal top-level keys with string, finite number, boolean, or null values, such as `{ tenant: 'acme', active: true }`. Null never matches missing keys; objects, arrays, and undefined are unsupported. Filtering precedes vector topK. Check null/complex-value semantics separately for other backends. LanceDB metadata now uses native JSON fields and retains nested JSON; rebuild legacy string-metadata collections before writing or filtering.

```ts
const enriched = await ai.memory.injectMemories(messages, { objectId: 'user-001', topK: 5 })
if (!enriched.success) {
  return enriched
}

// 多租户推荐入口：scoped() 绑定主体与作用域，所有操作自动携带 objectId / scope（含归属校验），杜绝「忘记传 objectId」越权
const memory = ai.memory.scoped({ objectId: 'user-001', scope: { topicId: 't-1', personaId: 'p-1' } })
await memory.add({ content: '用户偏好中文', type: 'preference' })
const recalled = await memory.recall('语言偏好')

// clear 拒绝空过滤（防误清全局）；全局清空只能显式走管理接口
await memory.clear({ types: ['event'] }) // 仅清该作用域内的 event
await ai.memory.admin.clearAll({ confirm: true }) // 危险：清空整个记忆后端，需显式确认

const rag = await ai.rag.query('核心架构是什么？', { sources: ['docs'], topK: 5 })

const setup = await ai.knowledge.setup()
if (setup.success) {
  await ai.knowledge.ingest({ documentId: 'doc-001', content: markdownText, title: '产品手册' })
}
```

#### Audio

Register audio models in `ai.init()` and map the default transcription/synthesis models first. Credentials fall back to platform environment variables. Enable `inheritLlmApiKey` explicitly only when LLM and audio models are confirmed to share credentials:

`provider` identifies the protocol, not deployment location. `openai` / `mimo` / `qwen` / `doubao` are cloud platforms; `whisper` (ASR) / `indextts` (TTS) are self-hostable protocols with no canonical endpoint and require explicit `baseUrl`. One protocol can switch among cloud, intranet, and local endpoints without changing business code. Missing cloud credentials return `CONFIGURATION_ERROR`. Self-hosted services may omit credentials; configured `apiKey` is sent as `Authorization: Bearer`.

```ts
await ai.init({
  llm: {
    apiKey: process.env.HAI_AI_LLM_APIKEY,
  },
  audio: {
    inheritLlmApiKey: true,
    models: [
      { id: 'asr', provider: 'qwen', model: 'qwen3-asr-flash-realtime', operations: ['transcribe'] },
      { id: 'tts', provider: 'qwen', model: 'qwen3-tts-flash-realtime', operations: ['synthesize'] },
      // 自托管：whisper / indextts 必须显式配置 baseUrl
      { id: 'whisper', provider: 'whisper', model: 'faster-whisper-large-v3', operations: ['transcribe'], baseUrl: 'http://127.0.0.1:8101/v1' },
      { id: 'indextts', provider: 'indextts', model: 'indextts-2.5', operations: ['synthesize'], baseUrl: 'http://127.0.0.1:8102/v1' },
    ],
    transcribeModel: 'asr',
    synthesizeModel: 'tts',
  },
})

// 完整识别（可选热词、时间戳粒度与 VAD；strictCapabilities 要求模型真实支持所请求能力）
const result = await ai.audio.transcribe({
  audio: { data: wavBytes, format: 'wav' },
  language: 'zh',
  contextHints: ['专有名词'],
  timestampGranularities: ['segment', 'word'],
  vad: true,
  model: 'whisper',
})
if (result.success) {
  const text = result.data.text
  const language = result.data.language // 实际检测语言
  const words = result.data.segments?.[0]?.words // 词级时间轴（毫秒整数）
}

// 说话人 / 风格参考合成（IndexTTS）：speakerReference 表达“谁在说”，styleReference 表达“怎么说”
const cloned = await ai.audio.synthesize({
  text: '我们下午三点出发。',
  language: 'zh',
  model: 'indextts',
  speakerReference: { audio: speakerWav, language: 'ja' },
  styleReference: { audio: styleWav },
  styleStrength: 0.8,
  targetDurationMs: 3280, // 目标时长（与 speed 互斥），metadata.durationMatched 反馈是否达标
  durationToleranceMs: 120,
})

// 实时识别（持续音频输入 → 领域事件流：speech_started / transcript / speech_stopped）
for await (const event of ai.audio.transcribeStream({
  audio: { chunks: microphoneChunks, format: 'pcm16', sampleRate: 16000 },
})) {
  if (event.type === 'speech_started')
    onSpeechStart() // 支持服务端 VAD 的平台会在检测到说话时立即产出，可据此取消上游生成
  else if (event.type === 'transcript')
    updateTranscript(event.text, event.final)
}

// 流式合成：调用方为文本段分配稳定 ID，事件可精确关联文本与音频；signal 可随时打断
const controller = new AbortController()
for await (const event of ai.audio.synthesizeStream({
  text: { id: 'answer-1', text: '欢迎参加访谈。' },
  voice: 'Cherry',
  instruction: '用轻快的语气',
  signal: controller.signal,
})) {
  if (event.type === 'segment_started')
    prepareDecoder(event.format, event.sampleRate, event.channels) // 真实输出格式来自服务端解析后的 Provider 输出
  else if (event.type === 'audio')
    await player.write(event.data)
  else if (event.type === 'segment_done')
    markSegmentReadyToCommit(event.segmentId)
}

// 实时会话启动前按操作校验模型能力
const caps = ai.audio.getCapabilities({ operation: 'synthesize', model: 'tts' })
if (caps.success && caps.data.synthesize?.streamingAudioOutput) { /* 可实时 TTS */ }
```

`ai.audio.synthesize` returns normalized `AudioContent` bytes. To return browser-playable Base64 over an API, use `serializePlayableAudio(result.data)`, which wraps `pcm16` in a WAV container and passes WAV/MP3 through:

```ts
import { serializePlayableAudio } from '@h-ai/ai'

const synthesized = await ai.audio.synthesize({ text: '欢迎参加访谈。', voice: 'Cherry' })
if (!synthesized.success)
  return synthesized

const playable = serializePlayableAudio(synthesized.data)
if (!playable.success)
  return playable

return playable.data
```

`OptionalSecretSchema` covers optional LLM, Audio, and Image secrets: YAML `null`, empty strings, and whitespace-only strings normalize to `undefined`. Audio key precedence is model `apiKey` → inherited LLM `apiKey` when enabled → platform environment variables. `inheritLlmApiKey` is off by default to avoid using keys across vendors.

> `synthesizeStream` emits `segment_started → audio* → segment_done` strictly. `segment_started` carries **actual output audio parameters** (`format` / `sampleRate` / `channels`) resolved by the server/provider. Players must decode from these rather than guess from requested parameters, and add segment text to `spokenText` only after its audio has actually finished playing. Applications manage playback state.

Cancellation, timeout, and connection problems become domain errors: `AbortSignal` → `AUDIO_CANCELLED`, timeout → `AUDIO_TIMEOUT`, connection failure or abnormal disconnect before `end` → `AUDIO_CONNECTION_FAILED`. `audio.maxStreamDurationMs` limits real-time connections (default five minutes).

Browsers/mobile clients use the unified audio WebSocket exposed by `@h-ai/serv`. `@h-ai/ai/client` offers the same `audio.*` API as Node, hiding transport details. Browser clients distinguish completion, cancellation (`AUDIO_CANCELLED`), and abnormal disconnect (`AUDIO_CONNECTION_FAILED`); cancellation or disconnect before `end` throws the domain code. `synthesize` never treats incomplete audio as success.

> For self-hosted CPU/GPU model services (faster-whisper / IndexTTS / Qwen3-4B), weight downloads, and offline bundles, see [models/ (Chinese)](./models/README.md). Images and weights prefer ModelScope, with automatic HuggingFace mirror fallback.

#### Image generation

After model registration in `ai.init()`, callers receive normalized image bytes without vendor-specific Base64, inline data, or temporary URLs:

```ts
await ai.init({
  image: {
    models: [
      { id: 'image', provider: 'openai', model: 'gpt-image-2' },
      { id: 'free', provider: 'pollinations', model: 'zimage' },
    ],
    generateModel: 'image',
  },
})

const result = await ai.image.generate({
  prompt: '一个正在构建开源框架的友好机器人',
  size: { width: 1024, height: 1024 },
  referenceImages: [
    { data: await readImage('character.png'), mimeType: 'image/png' },
  ],
})
if (result.success) {
  const { data, mimeType } = result.data.images[0]!
  await saveImage(data, mimeType)
}
```

`referenceImages` is optional. Public APIs accept only image bytes and MIME; providers convert multipart, `inlineData`, and Data URLs. Set credentials on model entries or with `HAI_AI_IMAGE_<PROVIDER>_APIKEY` / vendor environment variables. Qwen and Seedream temporary URLs are downloaded immediately inside providers and never exposed publicly. See [REFERENCE.md (Chinese)](./REFERENCE.md#image) for model details and API differences.

Downloads require public HTTPS on default port 443 without URL credentials. Socket DNS lookup validates every returned address and connects using those same results. Private, loopback, link-local, mapped/translated, and reserved IPv4/IPv6 addresses are blocked. Each of at most three redirects is checked again. Downloads use isolated connections without vendor authentication or application cookies. `baseUrl` is trusted operator configuration; vendor API calls reject redirects.

`image.maxImageBytes` defaults to 20971520 (20 MiB; maximum 100 MiB) per output/reference image. `image.maxImages` defaults to 4 (maximum 16) for output/reference counts, with sequential URL downloads. Actual streamed bytes, including decompressed bytes, are bounded and excess responses are cancelled. JSON responses are limited to `max(64 KiB, 2 × maxImageBytes)` and error bodies to 64 KiB. Model `timeout` defaults to 120000ms for the entire vendor request, redirects, and downloads; `signal` cancels the whole process. Outputs require matching PNG/JPEG/GIF/WebP MIME and magic bytes; SVG is rejected. Magic checks do not decode complete images or verify dimensions. Address rejection, limits, and deadlines return `IMAGE_DOWNLOAD_BLOCKED`, `IMAGE_TOO_LARGE`, and `IMAGE_TIMEOUT`; check success before use.

#### Context manager

```ts
const manager = ai.context.createManager({
  scope: { objectId: 'user-001', sessionId: 'sess-001' },
  compress: { auto: true, strategy: 'hybrid', maxTokens: 8000 },
  memory: { enable: true, enableExtract: true },
  concurrency: 'reject', // 单活动生成（默认）：活动生成期间的新 chat 返回 CONTEXT_BUSY；'queue' 则排队
})
if (manager.success) {
  const reply = await manager.data.chat('你好')
  await manager.data.save()
  // reset 生命周期完整：终止活动生成、清空消息/摘要/轮次，默认保留系统提示词
  await manager.data.reset() // 可传 { preserveSystemPrompt, cancelActiveTurn, waitForMemoryTasks }
}
```

A manager permits **one active generation** by default, preventing out-of-order messages when the next user message is written before the previous AI run exits. `reset()` is asynchronous: it stops active generation, releases concurrency barriers, clears turns, and rewrites Persona/System Prompt by default.

##### Actual conversation state (Conversation Commit Layer)

By default (`turnCommit: 'auto'`), `chat` / `chatStream` store the **full generated text** in context. In a generation → TTS → playback flow, however, speech can be interrupted halfway. The next turn's shared conversation state should contain **what was actually played**, rather than everything the model intended to say.

With `turnCommit: 'manual'`, results are not stored automatically. A `turnId` is returned so the caller can explicitly commit the text reflecting what actually happened.

`chatStream` registers a turn and emits `turn_started` **before calling the model** (`turn_started → delta* → done`, or `turn_started → delta* → cancelled` on cancellation). Even if `AbortSignal` cancels generation midway, the caller gets `turnId` and generated text for committing actual content:

```ts
const m = ai.context.createManager({ turnCommit: 'manual' /* ... */ }).data
const controller = new AbortController()

for await (const ev of m.chatStream('请展开讲讲', { signal: controller.signal })) {
  if (ev.type === 'turn_started') {
    m.markTurnSpeaking(ev.turnId) // 可选：标记进入播放
  }
  else if (ev.type === 'delta') {
    feedTts(ev.text) // 边生成边合成播放
  }
  else if (ev.type === 'done') {
    await m.commitTurn(ev.turnId) // 完整提交
  }
  else if (ev.type === 'cancelled') {
    // 生成被 controller.abort() 取消：轮次保留，只提交实际播放出去的部分
    await m.interruptTurn(ev.turnId, { text: actuallySpokenText })
  }
}

// 观测每一轮的 generated / committed / status
const turns = m.getTurns()
```

- `commitTurn(turnId, { text? })`: commit actual text (defaults to full generated text), setting state to `completed`.
- `interruptTurn(turnId, { text? })`: store only what was actually expressed (omission means nothing was expressed, so nothing is stored), setting state to `interrupted`.
- Only `committed` content enters context and memory extraction. Uncommitted/discarded text does not affect future turns.
- If `interruptTurn` interrupts before stream completion (for example a host interrupts just as the model finishes), `chatStream` **does not emit `done`**, preventing accidental post-completion commits.

##### Session consolidation (Memory lifecycle)

During a session, each turn extracts **short-term session memory** with `scope: { sessionId }`. At session end, `consolidate()`
turns short-term memory + summaries into **cross-session long-term memory**, completing `Session Memory → Summary → Long-term Memory`:

```ts
// 会话结束时固化：整合摘要 → 提取长期记忆（写入不含 sessionId 的持久作用域）
const result = await manager.consolidate({ scope: { userId: 'user-001', personaId: 'xiaoq' } })
if (result.success) {
  // result.data.summary  —— 本次会话整合摘要
  // result.data.memories —— 固化到长期记忆的条目
}
```

#### Persona (AI character profiles)

Memory uses `objectId` / `scope` to identify whose memories they are; Persona defines who the AI is through
stable system prompts and character traits, linked to long-term memory through `scope: { personaId }`:

```ts
await ai.persona.save({
  id: 'xiaoq',
  name: '小Q',
  systemPrompt: '你是一位经济学家，善于从长期视角分析问题。',
  traits: ['数据驱动', '偏好引用真实案例'],
})

// 组合出可直接喂给 ContextManager 的系统提示词（systemPrompt + traits）
const composed = await ai.persona.compose('xiaoq')
const manager = ai.context.createManager({
  systemPrompt: composed.data,
  memory: { enable: true, enableExtract: true, scope: { personaId: 'xiaoq' } },
})
```

`ai.persona` exposes `save` / `get` / `update` / `remove` / `list` / `compose`. Profiles are shared globally, not isolated by `objectId`.

```yaml
llm:
  apiKey: ''
  baseUrl: https://api.openai.com/v1
  model: gpt-4o-mini
  api: chat # chat（默认）| responses | anthropic —— 底层 API 协议，对使用方透明
  timeout: 60000
  tempModelCacheTtl: 600000 # 临时模型客户端缓存 TTL（毫秒，默认 10 分钟）
  models: # 可为每个模型单独指定协议
    - {id: fast, model: gpt-4o-mini}
    - {id: strong, model: gpt-4.1, api: responses}
    - {id: claude, model: claude-3-5-sonnet-latest, api: anthropic}
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
  provider: native # native | mem0
  maxEntriesPerObject: 1000 # 单主体（objectId）最大记忆条数
  maxEntriesGlobal: 100000 # 跨所有主体的全局上限
  recencyDecay: 0.95
  embeddingEnabled: true
  defaultTopK: 10
  candidateMultiplier: 5 # 候选池倍数：先取回 topK×倍数 条候选，再按 scope/重要性过滤，最后截取 topK
  writebackRelatedTopK: 20
```

When loading through `core.config.load('ai', ...)`, convention-based environment variables override YAML:
for example `HAI_AI_LLM_APIKEY`, `HAI_AI_LLM_BASEURL`, and `HAI_AI_LLM_MODEL`.

Enable mem0 (the embedded mem0ai/oss engine):

```yaml
memory:
  provider: mem0
  defaultTopK: 10
```

- **`native` (default, recommended)**: HAI's native engine reuses vecdb, reldb, LLM, and Embedding. `extract` uses **Mem0-style batch merging**: one LLM call decides ADD / UPDATE / DELETE / NONE for extracted facts and related existing memories, providing incremental updates, deduplication, contradiction removal, and `category` labels. `maxEntriesPerObject`, `maxEntriesGlobal`, `recencyDecay`, `embeddingEnabled`, and `writebackRelatedTopK` apply. Eviction is partitioned by `objectId`, so heavy writes by one subject do not evict others' memories. `scope` candidates are narrowed by `objectId` (≤ `maxEntriesPerObject`); PostgreSQL also pushes scope into a JSONB containment query using a **GIN index**. SQLite/MySQL fall back to equivalent in-memory matching.
- **`mem0` (mem0ai/oss)**: directly embeds the `mem0ai/oss` `Memory` engine without cloud services. LLM/Embedder come from `llm` configuration; `qdrant` / `pgvector` can reuse vecdb. Unmappable backends such as `lancedb` / `chroma` fail fast unless `memory.allowEphemeralFallback: true` explicitly allows mem0 in-memory storage, preventing silent memory loss after restart. History is disabled by default.

Both providers share `ai.memory.*` (`extract` / `recall` / `injectMemories` / `add` / `update` / `get` / `remove` / `list` / `listPage` / `clear`) with `objectId` isolation and key-value `scope` filters such as `{ topicId, personaId }`. `recall` / `list` / `listPage` / `clear` strictly filter scope; `clear` with `types` / `scope` deletes only jointly matching entries. mem0 `extract` uses the shared extractor for classification/scoring (`types` / `model` / `minImportance` / `systemPrompt`), then writes with `infer:false`, preserving `hai_type` / `hai_importance`. Its `recall` supports `types` and `recencyWeight` decay, matching native behavior. One difference: mem0 `update` of type/importance/metadata rebuilds memory and changes `id`; native keeps IDs stable.

**Candidate pools and scope recall misses**: filtering scope after truncating to `topK` can let higher-ranked memories from other topics/personas displace the target scope. `recall` / `injectMemories` therefore fetch `topK × candidateMultiplier` candidates (default multiplier 5), filter, then take `topK`. Increase `candidateMultiplier` for finer isolation such as `topicId` + `personaId`:

```ts
const memories = await ai.memory.recall('经济发展', {
  objectId: 'user-001',
  scope: { topicId: 'C' },
  topK: 10,
  candidateMultiplier: 8, // 覆盖配置默认值，扩大候选池
})
```

`ai.config` returns a redacted snapshot without exposing original `apiKey`, `privateKey`, embedded URL credentials, or other secrets.

### Security boundaries

- Treat prompts, retrieved documents, and model outputs as untrusted. Do not insert user content into non-overridable system rules.
- Zod validates tool argument shapes, not caller permissions. High-privilege handlers must verify identity, tenant, ownership, and quota, and expose only tools allowed to execute automatically.
- `callRemoteAgent()` is an independent client requiring only `ai.init()`, without Agent Card or local executors. It rejects non-HTTP(S) and embedded URL credentials; applications must still allowlist origins and enforce egress protection against DNS rebinding, private-network redirects, and cloud metadata access.
- Do not log full prompts, tool arguments, A2A headers, temporary model credentials, or remote URLs with queries. Audits should retain redacted summaries only.

### Error handling

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

Common error ranges:

- `hai:ai:010-012`: initialization/configuration.
- `hai:ai:100-107`: LLM and history.
- `hai:ai:300-302`：Embedding。
- `hai:ai:600-701`：Retrieval/RAG。
- `hai:ai:800-805`：Knowledge。
- `hai:ai:050-059`：Audio。
- `hai:ai:060-068`: Image, including blocked downloads, resource limits, and total deadlines.
- `hai:ai:900-905`：Memory。
- `hai:ai:980-984`：A2A。

## Development and testing

```bash
pnpm --filter @h-ai/ai typecheck
pnpm --filter @h-ai/ai lint
pnpm --filter @h-ai/ai test
pnpm --filter @h-ai/ai build
```

## License

Apache-2.0
