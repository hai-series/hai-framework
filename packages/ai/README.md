# @h-ai/ai

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/api-contract](../api-contract/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/datapipe](../datapipe/README.md) · [@h-ai/reldb](../reldb/README.md) · [@h-ai/vecdb](../vecdb/README.md)

## 简介

AI 能力模块，提供统一的 `ai` 服务对象，覆盖 LLM 对话、文生图、工具调用、MCP、Embedding、记忆、检索/RAG、知识库、上下文管理、文件解析、Rerank、语音（ASR/TTS）与 A2A。Node.js 侧通过 `ai.init()` 初始化，浏览器侧通过 API/client 代理访问。

## 核心功能清单

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
- `@h-ai/ai/client`：独立浏览器 Audio WebSocket 客户端。

`@h-ai/ai/client` 仅提供 `createAudioClient({ url, getTicket })` 与 Audio 客户端类型。HTTP 使用 `@h-ai/api-client` 的 typed 领域方法；默认聊天补全非流式，流与 A2A 使用应用自行绑定的 contract。旧字符串路径客户端和重复 SSE helper 已删除，浏览器不导出 Node 单例 `ai`。

```ts
import { apiClient } from '@h-ai/api-client'

const ready = await apiClient.init({ baseUrl: 'https://api.example.com/api/v1' })
if (!ready.success)
  throw new Error(ready.error.message)
try {
  const response = await apiClient.ai.chats.createCompletion({ messages: [{ role: 'user', content: '你好' }] })
  if (!response.success)
    throw new Error(response.error.message)
  const reply = response.data.choices[0]?.message.content
}
finally {
  await apiClient.close()
}
```

- `AIStoreProvider`：统一存储抽象；生产要求 `stateScope: 'shared'`，内置实现须先初始化 PostgreSQL/MySQL 与网络 vecdb。开发/显式测试无数据库时使用临时 Store。

更完整的方法清单、错误码与长示例见 [REFERENCE.md](./REFERENCE.md)。

## 使用入门

### 快速开始

#### 开发 LLM-only（零数据库依赖）

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

开发/显式测试未初始化 reldb/vecdb 时，AI 使用进程内临时 Store；关闭、退出或切换实例后不保留。`NODE_ENV` 或 `HAI_CORE_ENV` 为 production 时，临时 Store、SQLite 或本地向量后端会使初始化失败。生产必须先初始化共享 RelDB 与网络 vecdb，或传入满足同等原子契约的共享 Provider。

#### 持久化 DB Provider（reldb + vecdb）

```ts
import { ai } from '@h-ai/ai'
import { reldb } from '@h-ai/reldb'
import { vecdb } from '@h-ai/vecdb'

// 开发/测试使用本地后端；生产改为共享 PostgreSQL/MySQL 与网络 vecdb。
const failures: unknown[] = []
try {
  const database = await reldb.init({ type: 'sqlite', database: './ai.db' })
  if (!database.success)
    throw new Error(database.error.message)
  const vectors = await vecdb.init({ type: 'lancedb', path: './ai-vec.db' })
  if (!vectors.success)
    throw new Error(vectors.error.message)
  const initialized = await ai.init({
    llm: { model: 'gpt-4o-mini', apiKey: process.env.HAI_AI_LLM_APIKEY },
  })
  if (!initialized.success)
    throw new Error(initialized.error.message)
  const result = await ai.llm.chat({ messages: [{ role: 'user', content: 'Hello!' }] })
  if (!result.success)
    throw new Error(result.error.message)
  const reply = result.data.choices[0]?.message.content ?? ''
}
catch (error) {
  failures.push(error)
}
finally {
  await ai.close()
  for (const service of [vecdb, reldb]) {
    const closed = await service.close()
    if (!closed.success)
      failures.push(new Error(closed.error.message))
  }
}
if (failures.length)
  throw new AggregateError(failures, 'AI operation or cleanup failed')
```

MySQL 首次初始化允许多个节点并发建索引：仅接受 mysql2 明确的 ER_DUP_KEYNAME/1061，并重新核对列及顺序、非唯一完整列、升序可见 BTREE 和无表达式；已有同名错误结构仍失败。账户需要建表和 INDEX 权限，元数据读取、权限或其他 DDL 错误使 ai.init 返回 CONFIGURATION_ERROR。返回前等待全部已启动 DDL 结束；MySQL DDL 不回滚，失败保留已创建结构，修复权限/结构后再重试。逐步检查初始化结果，失败不接收业务请求，并逆序关闭 AI、vecdb、reldb。

#### 自定义 StoreProvider

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

### API 契约

- 对外只通过 `ai` 服务对象和少量独立工厂（如 `createMcpServer`）访问。
- 生命周期为 `await ai.init(config, options?)` / `await ai.close()`；关闭会等待自定义 `AIStoreProvider.close()`。
- 领域方法返回 `HaiResult<T>` 或 `Promise<HaiResult<T>>`；业务失败通过 `result.success === false` 和 `result.error.code` 表达。流式 `AsyncIterable`、客户端传输和第三方回调在建立或迭代期间可能抛异常。
- `ai.tools` 与 `ai.stream` 是纯函数子系统，无需初始化即可使用。
- 开发/测试缺少 reldb/vecdb 时使用临时 Store；两者均已初始化时自动使用 DB Provider。生产校验真实数据库与向量后端共享能力，自定义 Provider 必须如实声明 `stateScope`。

公共扩展通过 AIStoreProvider 注入 Store；内置 LLM Provider/工厂依赖与 Context 内部依赖不属于公开 API。模型接入使用配置，历史查询、AskOptions 和 ChatRecord 保持公开。

### API 概览

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

SSE 文本解码遵循 [WHATWG 事件流规则](https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation)：LF/CRLF/CR 跨片、多行 data、仅去冒号后一个空格、继承有效 id/retry；空或缺省 event 按 message，EOF 不补空行派发残余事件。encodeSSE 规范化 data 换行，并对 id/event 换行、id 的 NUL 或无效 retry 显式抛错。Anthropic/MiMo 共用内部 UTF-8 流读取；消费方退出、取消、协议结束和失败均取消正文并释放 reader，不自动重连或重放业务。Anthropic timeout 覆盖正文，MiMo 保留每个 HTTP 请求的独立 timeout。

#### 工具调用

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

#### A2A 协议边界

`ai.a2a.getAgentCard()` 返回完整 A2A 0.3 Agent Card，含 `protocolVersion`、MIME 和 streaming 能力；Kit 默认发现路径为 `/.well-known/agent-card.json`。`handleRequest()` 始终返回 JSON-RPC/SSE 处理结果，未初始化返回 JSON-RPC 错误。可信 HTTP 认证上下文的 `agentId` 映射为 executor 的 `context.user.userName`。当前支持 JSON-RPC/SSE，不声明 push notifications、gRPC 或 REST 支持；业务资源授权仍由应用负责。

A2A 的 journal、context 归属与消息表在 `ai.init()` 阶段初始化。任务按可信 `agentId` 隔离（含获取、取消和续接）；匿名请求共享匿名主体，生产应在可信传输层认证。`listMessages` 是服务端管理接口，支持 `callerId`、`contextId`、`since`，不能向未授权客户端暴露。

Task 与事件使用同一共享 journal，不再装配独立的旧 TaskStore。push notification 配置和 authenticated extended card RPC 返回 SDK 标准“不支持/未配置”错误，不执行任务；executor 相关类型保留公开导出，内部 handler/Store 装配类型不属于公共契约。

入站消息必须持久化后才进入 executor，并在等待后重新校验共享执行代际与期限；agent 消息在同一有界事件队列内等待日志成功后才提交 journal。日志失败会产生 failed/interrupted Task，不会发布虚假的成功结果；同一消息重试不重新执行。日志与 journal 不是跨记录事务，已有日志不等于成功交付，最终以 Task 的 `requiresEffectReconciliation` 标记核对可能已发生的业务效果。消息查询失败返回 `A2A_LIST_MESSAGES_FAILED`（984），不暴露原始 SQL 或连接详情。

Task 与事件一次 CAS 持久化，任意节点可订阅；相同 message ID/内容重试仅返回同一轮结果，改变内容或重复旧轮消息失败。跨节点取消由真实执行 owner 调用 executor.cancelTask，取消未确认期间同一 Task 不接受新消息，避免迟到取消作用于新执行；input-required 可在节点重启后续接。DB 租约过期、绝对期限到达或执行器只返回 working 时标记 failed/interrupted，并设置 `metadata.haiExecution.requiresEffectReconciliation=true`；旧节点恢复不能写入，不自动重放未知外部效果。`a2a.execution` 默认 `leaseMs: 30000`、`pollIntervalMs: 250`、`maxExecutionMs: 300000`。单消息 1 MiB、journal 8 MiB、单轮 2048 事件、Task 256 回执、32 个 reference tasks，超限明确失败。外部副作用须使用稳定业务幂等键并核对未知结果；详细部署/验证边界见[共享状态能力表](../../.agents/instructions/distributed-state.md)。

#### MCP Server

`ai.mcp` 是进程内注册表，独立 `createMcpServer` 使用 SDK transport，两者不会自动互相注册。`ai.mcp` 在注册时编译工具 JSON Schema，调用时校验输入；资源输出必须恰好含 `text` / `blob` 之一；提示词参数与 SDK 消息输出均校验，支持图片和音频内容。HTTP 示例只展示 transport 连接，应用仍须挂载请求处理与认证，并在退出时关闭 server。

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

Knowledge 每次导入生成唯一 `revision` 和分块 ID，先完整准备分块、向量及实体，再持久化暂存清单、写入向量，最后通过共享 Store CAS 一次发布正文、实体和元数据。相同文档并发重建只允许一个写入者；失败时保留完整旧版，缩短文档不会留下可见旧尾块。检索只接受当前发布版本，并在发布穿插时重试，持续冲突返回错误供调用方重试。向量候选可能按需扩大，清理积压会增加查询成本。

`ingest` 成功结果包含 `revision` 与 `cleanupPending`：后者为 true 表示新版本已经发布，但旧向量删除仍待补偿。调用 `repair({ collection, offset, limit })` 分页重试；`setup` 自动检查前 100 份清单，生产环境应定期扫描全部页。暂存期限为存储端时钟的 5 分钟，超时写入者不能发布；故障暂存的永久墓碑用于反复删除迟到的外部写入，不能随日志保留期删除。SQL 与 vecdb 不组成跨库事务，恢复依赖持久清单和持续补偿。`removeDocument` / `deleteCollection` 先撤销可见性，清理失败返回错误；集合删除保留空向量集合及代际墓碑以支持补偿，重新 setup 不显示上一代内容。

默认 DB Store 传播集合查询/创建及向量写入失败。LanceDB 使用持久主键原子 merge；Qdrant 写入/删除等待应用完成，计数使用精确计数。多节点必须共享关系存储和服务端向量后端；自定义 `KnowledgeStore` 须实现相同的版本发布与补偿契约。

使用 LanceDB 时，集合维度与 metric 随 Arrow schema 持久化；连接 metric 只影响新集合。重启后复用同一持久目录，embedding 维数改变时重建匹配集合；多个节点各自的本地路径不会自动共享，分布式 Knowledge 推荐服务端向量后端。

Knowledge 的 `retrieve/ask` 及默认 DB Store 会将 `filter` 传给向量 Provider，过滤校验/查询失败会向上传播；Knowledge 返回 `KNOWLEDGE_RETRIEVE_FAILED`（ask 包装为 `RAG_FAILED`），不会伪装成空结果。LanceDB 的过滤只支持顶层键的 string/有限 number/boolean/null AND 精确匹配，例如 `{ tenant: 'acme', active: true }`；null 不匹配缺失字段，不支持对象/数组/undefined。条件在向量 topK 前执行；其它后端的 null/复杂值语义须单独核对。LanceDB 元数据改用原生 JSON 字段，仍可保存嵌套 JSON；旧字符串元数据集合须重建后才能写入或过滤。

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
  const ingested = await ai.knowledge.ingest({ documentId: 'doc-001', content: markdownText, title: '产品手册' })
  if (!ingested.success)
    return ingested
  if (ingested.data.cleanupPending) {
    const repaired = await ai.knowledge.repair({ offset: 0, limit: 100 })
    if (!repaired.success)
      return repaired
  }
}
```

Knowledge 分块直接遵循 datapipe 的单位与硬上限：word 为词，其他为 Unicode code point，保留清洗后文本的分隔符；AI 默认 chunkOptions 仍为 markdown/maxSize=1500/overlap=200，覆盖较小 maxSize 时须同时保证继承的 overlap 小于它。分块配置/表达式失败返回 KNOWLEDGE_INGEST_FAILED，embedding 与版本发布均不会执行，不退回整篇文本绕过预算。

#### 语音（Audio）

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

IndexTTS 的 Node HTTP 请求使用同版本 Undici fetch/Agent 与 multipart 类型，避免混用 Node 内置 fetch 的调度器协议；模型 `timeout` 覆盖响应头与正文等待。主动取消返回 `AUDIO_CANCELLED`，超时返回 `AUDIO_TIMEOUT`，成功、失败和取消均关闭独立连接；按段流式降级仍在迭代时抛出领域错误。

> 自托管模型服务（faster-whisper / IndexTTS / Qwen3-4B 的 CPU/GPU Docker 镜像、权重下载与离线打包）见 [`models/`](./models/README.md)。镜像与权重下载优先使用 ModelScope，自动回退 HuggingFace 镜像。

#### 文生图（Image）

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

`referenceImages` 可省略；公共层只接受图片字节与 MIME，multipart、`inlineData`、Data URL 等差异由 Provider 转换。凭据可在模型条目传入，或使用 `HAI_AI_IMAGE_<PROVIDER>_APIKEY` / 厂商环境变量。Qwen 与 Seedream 返回的临时 URL 会在 Provider 内立即下载，不会泄漏到公共返回值。完整接口差异与模型说明见 [REFERENCE.md](./REFERENCE.md#image)。

图片下载只允许无凭证、默认 443 端口的公网 HTTPS，每次 socket DNS 解析校验全部地址并直接使用该批地址；阻止 IPv4/IPv6 私网、回环、链路本地、映射/转换及保留地址，重定向最多 3 次且每跳重新校验。下载使用独立连接，不传递厂商认证头或应用 Cookie。`baseUrl` 是可信运维配置，厂商 API 请求拒绝重定向。

`image.maxImageBytes` 默认 20971520（20 MiB，最大 100 MiB），限制单张输出和参考图；`image.maxImages` 默认 4（最大 16），限制输出与参考图数量，临时 URL 串行下载。实际读取（含解压后）超过上限立即取消；JSON 响应最多 `max(64 KiB, 2 × maxImageBytes)`，错误正文最多 64 KiB。模型 `timeout` 默认 120000ms，覆盖厂商请求、重定向和全部下载；`signal` 可取消整个过程。输出仅支持 PNG/JPEG/GIF/WebP 的 MIME 与魔数匹配，拒绝 SVG；魔数校验不等于完整图片解码或尺寸核验。拒绝地址、超限、超时分别返回 `IMAGE_DOWNLOAD_BLOCKED`、`IMAGE_TOO_LARGE`、`IMAGE_TIMEOUT`，调用方须先检查 success。

#### Context 管理器

自动记忆提取在本节点后台运行；`pendingMemoryTasks=0` 不代表全部成功。`flush()` 等待本批任务，异常和失败 HaiResult 都返回 `MEMORY_EXTRACT_FAILED`（含失败数量），同轮并发观察者共享结果。返回即确认该批报告，后续只观察新任务，不自动重放可能部分完成的提取。`save()`、`reset({ waitForMemoryTasks: true })`、`consolidate()` 遇到该失败立即返回，不继续后续状态或记忆写入。进程崩溃后的外部效果仍须人工核对。

`scope: { objectId, sessionId }` 必填。相同 scope 的所有节点共用一条版本记录，原子保存消息、摘要、生成 owner、轮次及待提交状态；`addMessage`、每个对外流式 delta 和最终提交即时持久化，`save()` 只刷新共享快照、等待本节点记忆任务并同步会话目录。`getMessages/getTurns/getSummaries/getTokenUsage` 返回最近一次成功读写的独立快照；跨节点读取前调用 `await manager.reload()` 或 `restoreManager()`。

并发限制按共享 scope 生效；`reject` 立即返回忙，`queue` 可取消地轮询（不承诺 FIFO）。生成租约为存储端时钟 30 秒，每 10 秒续租，最终写入同时校验版本、owner 和期限。失联生成过期后由下一次操作标为 interrupted，保留生成记录，不自动重放 LLM、工具或记忆提取。manual 的 pending 不自动过期，可在另一节点/重启后按同一 turnId 提交；相同终态与文本重复提交幂等，不同内容拒绝。外部工具/LLM/后台记忆不与上下文跨系统原子提交，进程失联后须核对未知副作用，不能据此承诺外部恰好一次。`reset` 更换共享纪元；`removeSession` 清空正文并保留永久墓碑，同一 scope 不复用，旧节点不能重建。

自定义 `AIRelStore` 必须提供 `readVersioned`、`compareAndSwap` 和存储端 `currentTime`；普通 save/saveMany 也要更换不可复用版本。CAS 的 `expectedVersion: undefined` 仅创建，`notAfter` 在最终写入以存储时钟严格检查，冲突/截止返回 undefined，存储故障抛错。默认 PostgreSQL/MySQL/SQLite 实现均执行这些条件；SQLite 仅供开发/测试，生产使用 PostgreSQL/MySQL。新 schema 含 version 列，不提供旧表自动迁移。

```ts
const manager = ai.context.createManager({
  scope: { objectId: 'user-001', sessionId: 'sess-001' },
  compress: { auto: true, strategy: 'hybrid', maxTokens: 8000 },
  memory: { enable: true, enableExtract: true },
  concurrency: 'reject', // 单活动生成（默认）：活动生成期间的新 chat 返回 CONTEXT_BUSY；'queue' 则排队
})
if (manager.success) {
  const reply = await manager.data.chat('你好')
  const saved = await manager.data.save()
  if (!saved.success)
    return saved
  // reset 生命周期完整：终止活动生成、清空消息/摘要/轮次，默认保留系统提示词
  await manager.data.reset() // 可传 { preserveSystemPrompt, cancelActiveTurn, waitForMemoryTasks }
}
```

同一 scope 默认实行**跨节点单活动生成**，避免「上一轮 AI 尚未退出，下一轮 user 消息先写入」导致的消息乱序；`reset()` 现为异步并会终止活动生成、释放并发屏障、清空轮次并默认重新写入 Persona/System Prompt。

##### 真实对话状态（Conversation Commit Layer）

默认（`turnCommit: 'auto'`）下，`chat` / `chatStream` 会把**模型生成的完整文本**写入上下文。但在「模型生成 → TTS 合成 → 实际播放」链路中，AI 可能说到一半就被打断——此时进入下一轮所有参与者可见的对话状态，应当是**实际播放出去的部分**，而非模型本想说完的全文。

设置 `turnCommit: 'manual'` 后，生成结果不会自动写入上下文，而是返回一个 `turnId`；由调用方在确定「实际发生了什么」后显式提交真实文本。

`chatStream` 在**调用上游模型前**就登记轮次并产出 `turn_started`（事件序列 `turn_started → delta* → done`，中途取消时 `turn_started → delta* → cancelled`）。因此即使生成到一半被 `AbortSignal` 取消，也能拿到 `turnId` 与已生成文本，用真实内容提交：

```ts
const created = ai.context.createManager({ scope: { objectId: 'user-001', sessionId: 'sess-001' }, turnCommit: 'manual' })
if (!created.success)
  return created
const m = created.data
const controller = new AbortController()

for await (const ev of m.chatStream('请展开讲讲', { signal: controller.signal })) {
  if (ev.type === 'turn_started') {
    await m.markTurnSpeaking(ev.turnId) // 可选：标记进入播放
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

##### 会话固化（Memory 生命周期）

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

#### Persona（AI 角色人格）

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
  scope: { objectId: 'user-001', sessionId: 'persona-session' },
  systemPrompt: composed.data,
  memory: { enable: true, enableExtract: true, scope: { personaId: 'xiaoq' } },
})
```

`ai.persona` 提供 `save` / `get` / `update` / `remove` / `list` / `compose`；角色档案全局共享（不按 `objectId` 隔离）。

### 配置

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
- **`mem0`（真·mem0ai/oss）**：直接使用 `mem0ai/oss` 的 `Memory` 引擎（嵌入式，无云服务）。LLM / Embedder 从 `llm` 配置提取；`qdrant` 可复用底层 vecdb。当前适配仅映射带完整连接参数的 `qdrant`；生产环境（`NODE_ENV` 或 `HAI_CORE_ENV` 为 `production`）即使设置 `memory.allowEphemeralFallback: true` 也拒绝实际内存回退。临时回退仅限开发或明确的 `HAI_E2E=1` / `HAI_E2E_MOCK=1`；缺少后端同样不能在生产启动。历史记录默认禁用。

两个 Provider 对外 `ai.memory.*` API 完全一致（`extract` / `recall` / `injectMemories` / `add` / `update` / `get` / `remove` / `list` / `listPage` / `clear`），均支持 `objectId`（主体隔离）与 `scope`（业务作用域 key-value 过滤，如 `{ topicId, personaId }`）。`recall` / `list` / `listPage` / `clear` 均按 `scope` 严格过滤，`clear` 在传入 `types` / `scope` 时仅删除同时匹配项（避免误删）。mem0 后端的 `extract` 在框架层用统一提取器完成分类与打分（honor `types` / `model` / `minImportance` / `systemPrompt`）后以 `infer:false` 写入，保留 `hai_type` / `hai_importance`；`recall` 同样支持 `types` 过滤与 `recencyWeight` 时间衰减——二者行为与 native 一致。Mem0 的 `update` 使用 SDK 原地修改文本与元数据，保持 `id` 和创建时间。SDK 查询使用 `filters.user_id`，写入和整主体删除使用 `userId`。SDK 无列表游标：`list` / `listPage` / 条件 `clear` 最多支持每主体 1000 条原始候选（含过期条目），多取一条探测完整性；超限返回 `MEMORY_LIST_INCOMPLETE`（906），不会伪造 total 或执行部分条件删除。候选完整时按 UTC 日期剔除过期项，再按类型/scope 过滤和分页；仅 `objectId` 的清理使用 SDK `deleteAll`，不受列表上限限制。公共空条件清理被拒绝；跨主体全清仅限受信管理员显式 `admin.clearAll({ confirm: true })`。

Mem0 3.3.1 的 Qdrant 适配仍依赖 `QdrantClient.search`；项目将 `@qdrant/js-client-rest` 精确锁定为受测的 `1.18.0`，AI 的可选 peer 也声明此版本。启动会检查该公开方法，缺失时明确配置失败；不要覆盖为已移除此方法的 1.19。

Mem0 的 pgvector 组合在所有环境拒绝启动：当前 SDK 将 PostgreSQL 连接保存在私有对象中，未提供公开关闭入口，框架无法履行资源清理契约。需要 pgvector 时选择 `memory.provider: native`；该原生后端保持支持。`disableHistory: true` 使用 SDK 无资源的历史占位实现，不创建历史 SQLite 文件。工厂通过公开的一条有界只读查询等待实际后端 ready 后才发布成功。

`add` / `extract` 的 SDK 回执不含完整业务字段，框架写后读取权威记录再返回；并发提取等待全部在途写入结束。若写入或写后读失败，`error.ext.requiresEffectReconciliation=true`，`memoryIds` 保存已知写入 ID（回执丢失时可能为空）。应按主体核对实际记忆后决定恢复，不能盲目重做 add/extract；框架不自动重放。

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

### 安全边界

- Prompt、检索文档和模型输出都按不可信输入处理；不要把用户内容拼进不可覆盖的系统规则。
- Zod 只校验工具参数形状，不代表调用者有权限。高权限工具必须在 handler 内再次校验身份、租户、资源归属与配额，并只把允许自动执行的工具注册给模型。
- `callRemoteAgent()` 是独立客户端能力，只依赖 `ai.init()`，不要求配置 Agent Card 或注册本地 executor。它拒绝非 HTTP(S) 和 URL 内嵌凭据，但应用仍必须对远端 origin 配置白名单，并在出口代理处限制 DNS 重绑定、重定向到私网和云元数据地址。
- 不记录完整 Prompt、工具参数、A2A headers、临时模型凭据或带 query 的远端 URL；确需审计时仅保存脱敏摘要。

### 错误处理

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
- `hai:ai:060-068`：Image，含下载地址拒绝、资源超限与总超时。
- `hai:ai:900-906`：Memory。
- `hai:ai:980-984`：A2A。

## 开发测试

```bash
pnpm --filter @h-ai/ai typecheck
pnpm --filter @h-ai/ai lint
pnpm --filter @h-ai/ai test
pnpm --filter @h-ai/ai build
```

源码 JSDoc 的公开示例从实际包入口导入，内部工厂示例标记“模块内部上下文”，分别按真实声明编译。根目录执行 `pnpm check:jsdoc --package ai` 核验覆盖与示例类型；普通业务方法检查 HaiResult，流式与浏览器 AudioClient 保留显式抛错契约。

## 许可证

Apache-2.0
