# @h-ai/ai reference

本文件承载 `SKILL.md` 中不常用但仍需要保留的 API 参考。优先读取 `SKILL.md`；只有当任务需要完整方法清单、错误码或长示例时再读取本文件。

## 初始化与依赖

未初始化 reldb/vecdb 时，`ai.init()` 自动使用进程内临时 Store；两者均已初始化时使用持久化 DB Provider。需要跨进程持久化时必须使用 DB 或自定义 Provider。

| 能力 | 是否需要 `ai.init()` | 依赖 |
| --- | --- | --- |
| `ai.tools` | 否 | 无 |
| `ai.stream` | 否 | 无 |
| `ai.llm` | 是 | OpenAI 兼容 LLM 配置 |
| `ai.embedding` | 是 | LLM/Embedding 模型配置 |
| `ai.memory` | 是 | Store + 可选 Embedding |
| `ai.retrieval` / `ai.rag` | 是 | Embedding + Store |
| `ai.knowledge` | 是 | LLM + Embedding + Store + datapipe |
| `ai.context` | 是 | LLM + Store + 可选 Memory/RAG/Reasoning |
| `ai.a2a` | 是 | A2A 配置 + executor |

关闭必须使用 `await ai.close()`，这样才能确定释放自定义 `AIStoreProvider.close()`。

## LLM

| 方法 | 说明 |
| --- | --- |
| `chat(options)` | 非流式 Chat Completion |
| `chatStream(options)` | 流式 Chat Completion |
| `ask(query, options?)` | 返回纯文本的简易问答 |
| `askStream(query, options?)` | 流式纯文本问答 |
| `listModels()` | 查询可用模型 |
| `getHistory(scope, options?)` | 查询会话历史 |
| `listSessions(objectId)` | 查询主体会话 |

```ts
const result = await ai.llm.chat({
  model: 'fast',
  messages: [
    { role: 'system', content: '你是一个翻译助手' },
    { role: 'user', content: '你好世界' },
  ],
})
if (result.success) {
  const reply = result.data.choices[0]?.message.content ?? ''
}
```

## Tools

- `ai.tools.define({ name, description, parameters, handler })`
- `ai.tools.createRegistry({ authorize? })`
- `registry.register(tool)` / `registry.registerMany(tools)`：返回 `HaiResult<void>`，默认拒绝同名
- `registry.replace(tool)`：显式替换已存在工具
- `registry.unregister(name)`
- `registry.getDefinitions()`：传给 LLM 的工具定义
- `registry.execute(toolCall, { signal, objectId, sessionId, deadline?, timeoutMs?, authorize? })` / `registry.executeAll(toolCalls, { parallel?, ...ctx })`；默认串行；Registry/单次授权均 fail-closed；handler `(input, ctx)` 可响应取消/超时（默认 30s）

工具 handler 输入由 Zod schema 约束，外部输入不要绕过 schema。

## MCP

### 独立服务器

```ts
const mcp = createMcpServer({ name: 'my-server', version: '1.0.0' })
mcp.registerResource('config', 'config://app', { description: '应用配置' }, async uri => ({
  contents: [{ uri: uri.href, text: '{}' }],
}))
await mcp.connect(new StdioServerTransport())
```

### `ai.mcp`

这是进程内注册表，不会自动绑定独立 MCP Server 的 transport。工具注册时编译 JSON Schema、调用时校验输入；非法输入不执行 handler。资源必须恰好含 text/blob 之一；提示词必填参数必须是自身字符串属性，输出使用 SDK 消息类型（含 image/audio）。同名注册覆盖，缺失 requestId 自动补 UUID。已移除未使用的 MCPProvider 与 AIMCPFunctionsDeps 类型；使用 MCPOperations 即可。

| 方法 | 说明 |
| --- | --- |
| `registerTool(definition, handler)` | 注册内置工具 |
| `callTool(name, args, context?)` | 调用工具 |
| `registerResource(resource, handler)` | 注册资源 |
| `readResource(uri)` | 读取资源 |
| `registerPrompt(prompt, handler)` | 注册提示词 |
| `getPrompt(name, args)` | 生成提示词消息 |

## Embedding

Embedding OpenAI 客户端按 `apiKey + baseURL + timeout` 缓存；同一 key 指向不同网关时不会复用错误客户端。

| 方法 | 说明 |
| --- | --- |
| `embed(request)` | 支持单条/批量输入 |
| `embedText(text)` | 返回单条向量 |
| `embedBatch(texts)` | 返回向量数组 |

## Memory

| 方法 | 说明 |
| --- | --- |
| `extract(messages, options?)` | 从对话提取记忆并存储；`options.signal` 可取消事实抽取及 native 对账调用 |
| `add(entry)` | 手动添加记忆 |
| `get(memoryId, accessScope?)` / `update(memoryId, updates, accessScope?)` | 读取/更新（传 `accessScope: { objectId, scope? }` 做归属校验，不匹配→ `MEMORY_NOT_FOUND`） |
| `recall(query, options?)` | 检索相关记忆 |
| `injectMemories(messages, options?)` | 注入 system 记忆上下文 |
| `remove(memoryId, accessScope?)` / `clear(options?)` | 删除（`accessScope` 同上） |
| `list(options?)` / `listPage(options?)` | 列表/分页 |

推荐所有记忆操作带 `objectId`，避免不同用户或 Agent 混写。

Memory 后端通过 `memory.provider` 选择：

- `native`（默认）：HAI 原生引擎，复用 vecdb/reldb/LLM/Embedding。`extract` 采用 Mem0 式批量合并（ADD/UPDATE/DELETE/NONE + `category`）；`maxEntriesPerObject`（单主体配额）/`maxEntriesGlobal`（全局上限）/`recencyDecay`/`embeddingEnabled`/`writebackRelatedTopK` 作用于此后端；淘汰按 `objectId` 分区。
- `mem0`：直接使用 `mem0ai/oss` 的 `Memory` 引擎（嵌入式）。LLM/Embedder 从 `llm` 配置提取（OpenAI 兼容，场景模型 `extraction` / `embedding`）；向量库从底层 vecdb 后端提取（`storeProvider.getVectorBackend()`），qdrant/pgvector 复用同一后端；无法映射 lancedb/chroma 等后端时**默认 fail-fast**（除非 `memory.allowEphemeralFallback: true` 才退回 mem0 in-memory）；历史默认禁用。
- 两者对外 API（extract/recall/injectMemories/add/update/get/remove/list/listPage/clear）完全一致；`objectId` 隔离不同主体的记忆，`scope`（key-value）用于业务作用域隔离（recall/list/listPage/clear 均严格过滤）。mem0 后端 `extract` 在框架层分类打分后以 `infer:false` 写入（保留 `hai_type`/`hai_importance`），`recall` 支持 `types`/`recencyWeight`，与 native 一致；mem0 后端 `update` 涉及 type/importance/metadata 时会重建记忆并重新分配 `id`。

## Retrieval / RAG

```ts
await ai.retrieval.addSource({
  id: 'docs',
  name: '产品文档',
  collection: 'doc_vectors',
  topK: 5,
  minScore: 0.7,
})

const result = await ai.rag.query('核心架构是什么？', {
  sources: ['docs'],
  topK: 5,
})
```

`retrieve` 会并发检索目标 source 并按 score 合并排序；无 source 时返回 `RETRIEVAL_SOURCE_NOT_FOUND`。

## Knowledge

| 方法 | 说明 |
| --- | --- |
| `setup(options?)` | 初始化 collection / 表 / 索引 |
| `ingest(input)` | 文档入库 |
| `ingestFile(input)` | 从文件导入（Node.js） |
| `ingestBatch(inputs, onProgress?)` | 批量导入 |
| `retrieve(query, options?)` | 实体增强检索 |
| `ask(query, options?)` | 知识库问答 |
| `findByEntity(entityName, options?)` | 实体关联文档 |
| `listEntities(options?)` / `listDocuments(options?)` | 列表 |
| `removeDocument(documentId, options?)` | 删除文档和关联 |

入库链路：parse/clean → chunk → embedding → vecdb upsert → reldb metadata/entity index。

## Context

`ai.context.createManager(options)` 返回有状态管理器，适合多轮对话。

常用选项：

- `scope: { objectId, sessionId }`
- `systemPrompt`
- `compress: { auto, strategy, maxTokens, preserveLastN }`
- `memory: { enable, enableExtract, scope, types, minImportance, topK, position, extractionModel, extractionSystemPrompt }`（scope/types 等完整透传给 Memory 的 recall/extract）
- `rag: { enable, sources, topK, minScore }`
- `tools`

常用方法：`addMessage`、`getMessages`、`getTokenUsage`、`chat`、`chatStream`、`save`、`reset`、`flush`（等待后台记忆提取完成，`save` 前自动调用）、`pendingMemoryTasks`（挂起提取任务数）。`chat/chatStream` 支持 `signal` 取消。

## File / Rerank / Reasoning

- `ai.file.parse({ content, filename, options })`：text/html/pdf/docx/ocr 解析。
- `ai.file.parseText(content, filename?)`：直接返回文本。
- `ai.rerank.rerank(request)` / `rerankTexts(query, texts, topN?)`：相关性重排。
- `ai.reasoning.run(query, options?)` / `runStream(query, options?)`：`react`、`cot`、`plan-execute`。

## Audio

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `transcribe(request)` | `Promise<HaiResult<TranscriptionResult>>` | 完整音频 → 完整文本 |
| `transcribeStream(request)` | `AsyncIterable<TranscriptionEvent>` | 完整音频或 `AudioInputStream` → `speech_started` / `{type:'transcript',text,final}` / `speech_stopped`（VAD 平台产出语音起止事件） |
| `synthesize(request)` | `Promise<HaiResult<SynthesisResult>>` | 完整文本 → 完整音频 |
| `synthesizeStream(request)` | `AsyncIterable<SynthesisEvent>` | 带 ID 文本段 → `segment_started → audio* → segment_done`，事件均可关联 `segmentId`；`segment_started` 携带服务端解析后的真实 `format` / `sampleRate?` / `channels?` |
| `getCapabilities({ operation, model? })` | `HaiResult<AudioModelCapabilities>` | 按模型与操作查询 `transcribe` / `synthesize` 能力分支，并拒绝操作不匹配模型 |

- 音频类型：`AudioContent { data: Uint8Array, format: 'pcm16'|'wav'|'mp3'|'opus', sampleRate?, channels? }`；`pcm16` 等裸音频必须传 `sampleRate`。
- 播放负载：`serializePlayableAudio(audio)` 返回 `HaiResult<PlayableAudio>`；`PlayableAudio` 为 `{ audioBase64, format: 'wav'|'mp3', mimeType }`。该函数将 `pcm16` 封装为 WAV，透传 WAV/MP3；`opus` 不支持转换。
- 请求可选：识别 `contextHints?: string[]`（热词/提示）；合成 `instruction?: string`（自然语言风格指令）；均支持 `signal: AbortSignal`。
- 模型配置：`audio.models: [{ id, provider: 'openai'|'mimo'|'qwen'|'doubao', model, operations, apiKey?, baseUrl?, appKey?, accessKey?, resourceId?, workspaceId? }]`；`operations` 必须明确为识别、合成或两者。确认 LLM 与语音模型共用凭据时，可设置 `audio.inheritLlmApiKey: true`，默认关闭。
- 凭据优先级：模型条目 `apiKey` → 显式启用继承后的 LLM `apiKey` → `HAI_AI_AUDIO_<PROVIDER>_API_KEY` 或 `OPENAI_API_KEY` / `MIMO_API_KEY` / `DASHSCOPE_API_KEY` / `VOLC_API_KEY`（豆包旧版控制台额外 `VOLC_APP_KEY` / `VOLC_ACCESS_KEY`）。可选密钥中的 YAML `null`、空字符串和纯空白字符串都会规范化为未配置。
- 资源上限：`audio.maxAudioBytes`（默 10 MiB）、`audio.maxStreamDurationMs`（默 5 分钟）；所有请求支持 `signal: AbortSignal` 打断。
- Provider 为内部实现，不从根入口导出；不支持的输入方式招 `AUDIO_UNSUPPORTED_INPUT`，不伪装实时。取消 → `AUDIO_CANCELLED`，超时 → `AUDIO_TIMEOUT`，连接失败或 `end` 前异常断连 → `AUDIO_CONNECTION_FAILED`。浏览器客户端（`@h-ai/ai/client`）严格区分正常结束 / 取消 / 异常断连：取消招 `AUDIO_CANCELLED`、`end` 前断连招 `AUDIO_CONNECTION_FAILED`、服务端 error 帧保留其领域错误码，`synthesize` 不把未完成的部分音频当作成功返回。

## Image

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `generate(request)` | `Promise<HaiResult<GenerateImageResult>>` | 文本提示词 → 一张或多张已下载的图片字节 |

- 请求：`GenerateImageRequest { prompt, model?, size?: { width, height }, referenceImages?: ReferenceImage[], signal? }`；`ReferenceImage` 为 `{ data: Uint8Array, mimeType: string }`。
- 返回：`GenerateImageResult { images: Array<{ data: Uint8Array, mimeType, width?, height? }> }`。
- 模型配置：`image.models: [{ id, provider: 'openai'|'google'|'qwen'|'seedream'|'pollinations', model, apiKey?, baseUrl?, workspaceId?, timeout? }]`；`image.generateModel` 选择默认模型别名。
- 凭据优先使用模型项 `apiKey`，否则回退 `HAI_AI_IMAGE_<PROVIDER>_API_KEY` 或厂商标准环境变量。
- 厂商差异由内部 Provider 消化：OpenAI/Pollinations 的 multipart edits、Google `inlineData`、Qwen/Seedream 的 Data URL 参考图，以及各家 Base64、临时 URL 或二进制响应均归一为图片字节。
- Google 只接受其文档列出的宽高比；Qwen/Seedream 还可能对总像素与边长有限制。业务应提供厂商支持的尺寸预设，不要假设任意像素组合都可用。

## LLM 结构化输出

`ai.llm.generateObject({ schema, messages, model?, systemPrompt?, maxRepairs?, signal? })`：按 Zod schema 约束模型输出（json_schema）并解析为对象，解析/校验失败自动带错误提示重试（默 1 次）。适用于“是否为问题/意图分类/置信度”等需要稳定结构结果的场景，避免手写 `JSON.parse`。

## A2A

| 方法 | 说明 |
| --- | --- |
| `registerExecutor(executor)` | 注册 Agent executor |
| `getAgentCard()` | 获取 Agent Card |
| `handleRequest(body, context?)` | 处理 A2A JSON-RPC 请求 |
| `listMessages(filter)` | 查询 A2A 消息记录 |
| `callRemoteAgent(remoteUrl, message, options?)` | 调用远端 Agent；只依赖 `ai.init()`，不要求本地 executor |

A2A 服务端 SDK handler 在注册 executor 时延迟创建；远端客户端调用不依赖服务端配置。getAgentCard 返回完整 A2A 0.3 Card（MIME、streaming、安全方案）；Kit 默认发现路径为 `/.well-known/agent-card.json`。handleRequest 在未初始化时也返回 JSON-RPC 错误；可信 context.agentId 映射 SDK user.userName。Kit 配置 authenticate 后空身份返回 401；不声明 push notifications、gRPC、REST 支持。

`callRemoteAgent` 只接受 HTTP(S) 且拒绝 URL 内嵌凭据。该校验不是完整 SSRF 防护：remote URL 若来自外部输入，应用必须先按 origin 白名单过滤，并通过出口代理限制 DNS 重绑定、重定向到私网与云元数据地址。

## 错误码速查

| 分段 | 代表错误 |
| --- | --- |
| `hai:ai:000` | `INTERNAL_ERROR` |
| `hai:ai:010-012` | 初始化：`NOT_INITIALIZED` / `CONFIGURATION_ERROR` / `INIT_IN_PROGRESS` |
| `hai:ai:020-033` | Rerank / File |
| `hai:ai:050-059` | Audio：`AUDIO_INVALID_REQUEST` / `MODEL_NOT_FOUND` / `PROVIDER_NOT_FOUND` / `UNSUPPORTED_INPUT` / `UPSTREAM_ERROR` / `PROTOCOL_ERROR` / `CONNECTION_FAILED` / `TIMEOUT` / `INPUT_TOO_LARGE` / `CANCELLED` |
| `hai:ai:060-065` | Image：`IMAGE_INVALID_REQUEST` / `MODEL_NOT_FOUND` / `PROVIDER_NOT_FOUND` / `UPSTREAM_ERROR` / `PROTOCOL_ERROR` / `CANCELLED` |
| `hai:ai:100-107` | LLM / 历史记录 |
| `hai:ai:200-204` | MCP |
| `hai:ai:300-302` | Embedding |
| `hai:ai:400-405` | Tool（含重复注册、授权拒绝） |
| `hai:ai:500-502` | Reasoning |
| `hai:ai:600-701` | Retrieval / RAG |
| `hai:ai:800-805` | Knowledge |
| `hai:ai:900-905` | Memory |
| `hai:ai:950-971` | Context / Store / Session |
| `hai:ai:980-984` | A2A |

## 浏览器端

浏览器端通过 `@h-ai/api-client` 或自定义 endpoint 访问服务端 AI 能力。`ai.stream` 可在浏览器直接用于解析服务端流式 chunk。

```ts
const response = await apiClient.ai.chats.createCompletion({ messages })
const memories = await apiClient.ai.memories.recall({ query: '偏好', objectId: 'user-001', topK: 5 })
```

语音：`@h-ai/ai/client` 的 `createAIClient({ api, audio: { url, getTicket } })` 提供 `client.audio.transcribe/transcribeStream/synthesize/synthesizeStream`。`getTicket(request)` 接收本次操作摘要（`operation` / `model`），应通过已登录 HTTP 请求签发与本次操作严格绑定的短期、一次性 Audio ticket（推荐 `iam.ticket.issue({ grant })`）；IAM access token 不进入 WebSocket URL。
