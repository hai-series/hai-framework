# @h-ai/ai

AI 能力模块，提供统一的 `ai` 服务对象，覆盖 LLM 对话、文生图、工具调用、MCP、Embedding、记忆、检索/RAG、知识库、上下文管理、文件解析、Rerank、语音（ASR/TTS）与 A2A。Node.js 侧通过 `ai.init()` 初始化，浏览器侧通过 API/client 代理访问。

## 能力概览

- `ai.tools`：工具定义、注册表、批量执行；无需初始化。
- `ai.stream`：ChatCompletion 流式 chunk 处理；无需初始化。
- `ai.llm`：非流式/流式对话、模型列表、历史记录。
- `ai.mcp` / `createMcpServer`：内置 MCP 注册表与独立 MCP Server。
- `ai.embedding`：单条/批量文本向量化。
- `ai.memory`：记忆提取、存储、召回、注入。
- `ai.persona`：AI 角色人格档案（系统提示词 + 特征）与系统提示词组合。
- `ai.retrieval` / `ai.rag`：多源向量检索与检索增强问答。
- `ai.knowledge`：文档入库、实体增强检索、知识问答。
- `ai.context`：LLM + Memory + RAG + 压缩的一体化会话管理。
- `ai.file` / `ai.rerank`：文件解析/OCR 与文本重排序。
- `ai.audio`：语音识别（ASR）与语音合成（TTS），支持完整与流式调用，覆盖 OpenAI / MiMo / Qwen / 豆包平台。
- `ai.image`：文生图，覆盖 OpenAI GPT Image、Google Gemini Image / Nano Banana、Qwen-Image 2.0/3.0、Seedream 4.x/5.x 与 Pollinations 免费额度模型。
- `ai.a2a`：Agent-to-Agent 请求处理与远端调用。
- `@h-ai/ai/client`：前端轻量客户端（配合 API 服务）。
- `AIStoreProvider`：统一存储抽象；无数据库时默认使用进程内临时 Store，已初始化 reldb + vecdb 时自动使用持久化 DB Provider。

更完整的方法清单、错误码与长示例见 [REFERENCE.md](./REFERENCE.md)。

## 快速开始

### LLM-only（零数据库依赖）

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

未初始化 reldb/vecdb 时，AI 使用进程内临时 Store 保存会话等运行时状态；`ai.close()`、进程退出或多实例切换后数据不会保留。需要 Memory、Context、Persona 或会话跨重启持久化时，使用下面的 DB Provider。

### 持久化 DB Provider（reldb + vecdb）

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

### 自定义 StoreProvider

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

## API 契约

- 对外只通过 `ai` 服务对象和少量独立工厂（如 `createMcpServer`）访问。
- 生命周期为 `await ai.init(config, options?)` / `await ai.close()`；关闭会等待自定义 `AIStoreProvider.close()`。
- 领域方法返回 `HaiResult<T>` 或 `Promise<HaiResult<T>>`；业务失败通过 `result.success === false` 和 `result.error.code` 表达。流式 `AsyncIterable`、客户端传输和第三方回调在建立或迭代期间可能抛异常。
- `ai.tools` 与 `ai.stream` 是纯函数子系统，无需初始化即可使用。
- 未初始化 reldb/vecdb 时默认使用进程内临时 Store；两者均已初始化时自动使用 DB Provider。自定义 Provider 可隐藏其他存储后端。

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

### 工具调用

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

### MCP Server

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
await server.connect(new StreamableHTTPServerTransport({ sessionIdGenerator: crypto.randomUUID }))
```

### Memory / RAG / Knowledge

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

### 语音（Audio）

先在 `ai.init()` 中注册语音模型并映射默认识别/合成模型。凭据默认回退到平台环境变量；只有 LLM 与语音模型确认使用同一凭据时，才显式启用 `inheritLlmApiKey`：

平台（`provider`）表示调用协议而非部署位置：`openai` / `mimo` / `qwen` / `doubao` 为云服务；`whisper`（ASR）/ `indextts`（TTS）为可自托管协议，无 canonical 端点，必须显式配置 `baseUrl`，同一协议可切换多个 Endpoint（云 / 内网 / 本地）而不改业务代码。云平台缺少凭据返回 `CONFIGURATION_ERROR`；自托管平台可无凭据（配置 `apiKey` 后按 `Authorization: Bearer` 发送）。

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

`ai.audio.synthesize` 返回统一的 `AudioContent` 字节。需要通过 API 返回浏览器可播放的 Base64 负载时，使用 `serializePlayableAudio(result.data)`；该函数会将 `pcm16` 补齐为 WAV 容器，并透传 WAV/MP3：

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

`OptionalSecretSchema` 统一用于 LLM、Audio 与 Image 的可选密钥字段：YAML `null`、空字符串和纯空白字符串都会规范化为 `undefined`。语音密钥优先级为模型条目 `apiKey` → 启用继承后的 LLM `apiKey` → 对应平台环境变量；`inheritLlmApiKey` 默认关闭，避免跨供应商误用密钥。

> `synthesizeStream` 严格按 `segment_started → audio* → segment_done` 产出事件。`segment_started` 携带服务端解析 Provider 后的**真实输出音频参数**（`format` / `sampleRate` / `channels`），播放器据此正确解码，不应按请求参数猜测格式。播放器只有在对应音频真正播放完成后才应把该段文本计入 `spokenText`；播放状态仍由应用管理。

取消/超时/连接错误统一为领域错误：`AbortSignal` 触发 → `AUDIO_CANCELLED`（超时 → `AUDIO_TIMEOUT`），连接失败或 `end` 前异常断连 → `AUDIO_CONNECTION_FAILED`。实时连接时长受 `audio.maxStreamDurationMs`（默认 5 分钟）限制。

浏览器 / 移动端通过 `@h-ai/serv` 暴露的统一语音 WebSocket 入口访问，`@h-ai/ai/client` 提供与 Node 端一致的 `audio.*` API（传输细节内部隐藏）。浏览器客户端严格区分正常结束、取消（`AUDIO_CANCELLED`）与异常断连（`AUDIO_CONNECTION_FAILED`）：取消或在 `end` 前断连会抛出对应领域错误码，`synthesize` 不会把未完成的部分音频当作成功结果返回。

> 自托管模型服务（faster-whisper / IndexTTS / Qwen3-4B 的 CPU/GPU Docker 镜像、权重下载与离线打包）见 [`models/`](./models/README.md)。镜像与权重下载优先使用 ModelScope（中国网络友好），自动回退 HuggingFace 镜像。

### 文生图（Image）

在 `ai.init()` 注册模型后，调用方只接收标准化图片字节，不感知厂商 Base64、内联数据或临时 URL：

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

`referenceImages` 可省略；公共层只接受图片字节与 MIME，multipart、`inlineData`、Data URL 等差异由 Provider 转换。凭据可在模型条目传入，或使用 `HAI_AI_IMAGE_<PROVIDER>_API_KEY` / 厂商环境变量。Qwen 与 Seedream 返回的临时 URL 会在 Provider 内立即下载，不会泄漏到公共返回值。完整接口差异与模型说明见 [REFERENCE.md](./REFERENCE.md#image)。

### Context 管理器

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

同一管理器默认实行**单活动生成**，避免「上一轮 AI 尚未退出，下一轮 user 消息先写入」导致的消息乱序；`reset()` 现为异步并会终止活动生成、释放并发屏障、清空轮次并默认重新写入 Persona/System Prompt。

#### 真实对话状态（Conversation Commit Layer）

默认（`turnCommit: 'auto'`）下，`chat` / `chatStream` 会把**模型生成的完整文本**写入上下文。但在「模型生成 → TTS 合成 → 实际播放」链路中，AI 可能说到一半就被打断——此时进入下一轮所有参与者可见的对话状态，应当是**实际播放出去的部分**，而非模型本想说完的全文。

设置 `turnCommit: 'manual'` 后，生成结果不会自动写入上下文，而是返回一个 `turnId`；由调用方在确定「实际发生了什么」后显式提交真实文本。

`chatStream` 在**调用上游模型前**就登记轮次并产出 `turn_started`（事件序列 `turn_started → delta* → done`，中途取消时 `turn_started → delta* → cancelled`）。因此即使生成到一半被 `AbortSignal` 取消，也能拿到 `turnId` 与已生成文本，用真实内容提交：

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

- `commitTurn(turnId, { text? })` — 提交真实文本（缺省用完整生成文本），状态转 `completed`。
- `interruptTurn(turnId, { text? })` — 只写入实际表达出去的部分（缺省视为未表达，不写入），状态转 `interrupted`。
- 只有 `committed` 的内容进入上下文与记忆提取；未提交/被打断丢弃的部分不会污染后续轮次。
- 若轮次在流完成前已被 `interruptTurn` 打断（如主持人抢话，同时上游模型恰好正常结束），`chatStream` **不会再产出 `done`**，避免业务层误判为正常完成后继续提交文本。

#### 会话固化（Memory 生命周期）

会话进行中，每轮对话按 `scope: { sessionId }` 提取**短期会话记忆**；会话结束时用 `consolidate()`
把「短期记忆 + 摘要」沉淀为**跨会话长期记忆**，形成 `Session Memory → Summary → Long-term Memory` 闭环：

```ts
// 会话结束时固化：整合摘要 → 提取长期记忆（写入不含 sessionId 的持久作用域）
const result = await manager.consolidate({ scope: { userId: 'user-001', personaId: 'xiaoq' } })
if (result.success) {
  // result.data.summary  —— 本次会话整合摘要
  // result.data.memories —— 固化到长期记忆的条目
}
```

### Persona（AI 角色人格）

Memory 用 `objectId` / `scope` 回答「谁的记忆」；Persona 回答「AI 是谁」——为每个 AI 角色定义
稳定的系统提示词与性格特征，并通过 `scope: { personaId }` 关联其长期记忆：

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

`ai.persona` 提供 `save` / `get` / `update` / `remove` / `list` / `compose`；角色档案全局共享（不按 `objectId` 隔离）。

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

通过 `core.config.load('ai', ...)` 加载时，约定环境变量优先于 YAML；
例如 `HAI_AI_LLM_APIKEY`、`HAI_AI_LLM_BASEURL`、`HAI_AI_LLM_MODEL`。

启用 mem0（真·嵌入式 mem0ai/oss 引擎）：

```yaml
memory:
  provider: mem0
  defaultTopK: 10
```

- **`native`（默认，推荐）**：HAI 原生引擎，复用同一套 vecdb（向量库）、reldb（关系库）、LLM 与 Embedding。`extract` 采用 **Mem0 式批量合并**——一次 LLM 调用对整批抽取事实与相关既有记忆做 ADD / UPDATE / DELETE / NONE 决策，实现增量更新、跨条去重与矛盾删除，并支持 `category` 主题标签。`maxEntriesPerObject`、`maxEntriesGlobal`、`recencyDecay`、`embeddingEnabled`、`writebackRelatedTopK` 均作用于此后端；淘汰按 `objectId` 分区触发，不会因某一主体写入过多而淘汰其他主体的记忆。native 后端的 `scope` 过滤：候选集已被 `objectId` 索引收窄（≤ `maxEntriesPerObject`），PostgreSQL 上还会把 scope 下推为 `data @> '{"scope":...}'::jsonb` 包含查询并命中 JSONB **GIN 索引**（SQLite / MySQL 退回内存匹配，结果一致）。
- **`mem0`（真·mem0ai/oss）**：直接使用 `mem0ai/oss` 的 `Memory` 引擎（嵌入式，无云服务）。LLM / Embedder 从 `llm` 配置提取；`qdrant` / `pgvector` 可复用底层 vecdb。无法映射 `lancedb` / `chroma` 等后端时默认 fail-fast，只有显式设置 `memory.allowEphemeralFallback: true` 才使用 mem0 in-memory，避免重启后静默丢失记忆。历史记录默认禁用。

两个 Provider 对外 `ai.memory.*` API 完全一致（`extract` / `recall` / `injectMemories` / `add` / `update` / `get` / `remove` / `list` / `listPage` / `clear`），均支持 `objectId`（主体隔离）与 `scope`（业务作用域 key-value 过滤，如 `{ topicId, personaId }`）。`recall` / `list` / `listPage` / `clear` 均按 `scope` 严格过滤，`clear` 在传入 `types` / `scope` 时仅删除同时匹配项（避免误删）。mem0 后端的 `extract` 在框架层用统一提取器完成分类与打分（honor `types` / `model` / `minImportance` / `systemPrompt`）后以 `infer:false` 写入，保留 `hai_type` / `hai_importance`；`recall` 同样支持 `types` 过滤与 `recencyWeight` 时间衰减——二者行为与 native 一致。一个差异：mem0 后端在 `update` 涉及 type/importance/metadata 时会重建记忆并重新分配 `id`（native 后端保持 id 稳定）。

**候选池与 scope 漏召回**：`scope` 过滤在内存中完成，若先按 `topK` 截断再过滤，同一主体下相关度较高的其它主题/角色记忆会把目标 scope 的记忆挤出候选池，导致「明明有却召回 0 条」。为此 `recall` / `injectMemories` 先取回 `topK × candidateMultiplier`（默认 5）条候选，过滤后再截取 `topK`。scope 隔离越细（如按 `topicId` + `personaId`），可将 `candidateMultiplier` 调大：

```ts
const memories = await ai.memory.recall('经济发展', {
  objectId: 'user-001',
  scope: { topicId: 'C' },
  topK: 10,
  candidateMultiplier: 8, // 覆盖配置默认值，扩大候选池
})
```

`ai.config` 返回脱敏后的配置快照；`apiKey`、`privateKey`、URL 内嵌凭证等敏感字段不会原样暴露。

## 安全边界

- Prompt、检索文档和模型输出都按不可信输入处理；不要把用户内容拼进不可覆盖的系统规则。
- Zod 只校验工具参数形状，不代表调用者有权限。高权限工具必须在 handler 内再次校验身份、租户、资源归属与配额，并只把允许自动执行的工具注册给模型。
- `callRemoteAgent()` 是独立客户端能力，只依赖 `ai.init()`，不要求配置 Agent Card 或注册本地 executor。它拒绝非 HTTP(S) 和 URL 内嵌凭据，但应用仍必须对远端 origin 配置白名单，并在出口代理处限制 DNS 重绑定、重定向到私网和云元数据地址。
- 不记录完整 Prompt、工具参数、A2A headers、临时模型凭据或带 query 的远端 URL；确需审计时仅保存脱敏摘要。

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
- `hai:ai:050-059`：Audio。
- `hai:ai:060-065`：Image。
- `hai:ai:900-905`：Memory。
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
