# @h-ai/ai API Reference

<!-- translation: partial -->

[Chinese source](ai.md) · [Configuration](../configuration/ai.en.md) · [Data structures](../data/ai.en.md)

<a id="module-dependencies"></a>

## Dependencies

| Dependency | Purpose | When required | Setup order |
| --- | --- | --- | --- |
| Model service | Generate chat responses, embeddings, images, or audio | When calling the corresponding model | Prepare the model, any endpoint, and required credentials before `ai.init()` |
| `@h-ai/reldb`, `@h-ai/vecdb` | Provide default persistent storage | When using the default persistent store. Production requires shared storage | Initialize both modules before `ai.init()`. In production, use PostgreSQL or MySQL with a networked VecDB, or inject a shared `storeProvider` |
| `@h-ai/runner` | Run recoverable MCP and ACP jobs | When enabling background jobs backed by Runner | Initialize Runner and pass it to `ai.init(config, { runner })` |
| `@h-ai/core`, `@h-ai/api-contract`, `@h-ai/datapipe`, `@h-ai/tools` | Provide framework utilities, audio protocols, document processing, and tool registration | Installed with AI. Create a tool registry to integrate custom tools as needed | Initialize Core first if the app uses its configuration service. Create a tool registry when needed |
| Application HTTP or WebSocket endpoint | Provide chat or speech access for browsers | When calling AI from a browser | Configure AI and authentication on the server first. Call the app’s HTTP API for chat. Connect the audio client to WebSocket and provide `getTicket` |
| `pdfjs-dist`, `mammoth` | Parse PDF and DOCX natively | When using the native parser for the corresponding format | Install the package for that format before use |

For browser-facing chat, memory, and media HTTP calls, see the [API Client AI operations](api-client.en.md#ai-requests).

## Quick start

### Example

This example starts with chat. Add embeddings, tools, retrieval, and durable sessions as needed. Assign the authenticated scope on the server and apply tool authorization there.

```ts
import { ai } from '@h-ai/ai'

// Initialize gpt-4o-mini with the key from the environment. Success enables LLM access; setup failure stops the request.
const init = await ai.init({
  llm: {
    model: 'gpt-4o-mini',
    apiKey: process.env.HAI_AI_LLM_APIKEY,
  },
})
if (!init.success)
  throw new Error(init.error.message)

try {
  // Send the user message below to the configured model. Success exposes the response in choices; provider failure enters the error branch.
  const result = await ai.llm.chat({
    messages: [
      { role: 'user', content: '你好！' }
    ],
  })
  if (!result.success)
    throw new Error(result.error.message)
  const reply = result.data.choices[0]?.message.content ?? ''
}
finally {
  // Release AI-owned resources without arguments. There is no business data; the host closes any dependencies it supplied.
  await ai.close()
}
```


<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Import the module as in the quick start. Except for lifecycle examples, run scenarios after initialization and before closure. Each call checks HaiResult.success, returns the original failed result, and reads data only on success. Scenarios without a function declaration are fragments inside an async application function. Use isolated test data and explicit cleanup.


<a id="lifecycle"></a>

### Prepare models and stores: `ai`

Choose models and state storage before starting in dependency order. Temporary development stores differ from shared production stores.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.init(config?, options?)` | 准备服务 | `config?: AIConfigInput, options?: AIInitOptions`. See [AI settings](../configuration/ai.en.md) for configuration fields. Options can supply `storeProvider`, managed execution `runner`, ACP authorization `acpPolicy` and `acpAdapters`, and MCP job file access `mcpJobFiles`. | `HaiResult<void>; validate dependencies before use` | `ai.init({ llm: { apiKey: process.env.HAI_AI_LLM_APIKEY } })` |
| `ai.close()` | 反序释放服务 | No arguments | `Promise<void>; wait for cleanup` | `ai.close()` |
| `ai.config` | 诊断当前配置 | `none` | `redacted AIConfig or null` | `ai.config` |
| `ai.isInitialized` | 检查生命周期状态 | `none` | `boolean` | `ai.isInitialized` |
| `ai.resolveModelEntry(llmConfig, scenario, explicit?, options?)` | Resolve a model entry by identifier | `llmConfig: LLMConfig, scenario: ModelScenario, explicit?: string, options?: ResolveRequiredModelEntryOptions` | `HaiResult<ResolvedModelEntry>` | `ai.resolveModelEntry(llmConfig, 'summary')` |
| `ai.resolveModelApi(llmConfig, explicitModel?, tempApi?)` | Resolve model API capabilities | `llmConfig: LLMConfig, explicitModel?: string, tempApi?: ApiType` | `ApiType` (`'chat'`, `'responses'`, `'anthropic'`) | `ai.resolveModelApi(llmConfig, 'claude')` |
| `ai.resolveImageModel(imageConfig, explicit?)` | Resolve an image model | `imageConfig: ImageConfig, explicit?: string` | `HaiResult<ResolvedImageModel>` | `ai.resolveImageModel(imageConfig)` |
| `ai.resolveAudioModel(audioConfig, operation, explicit?, llmApiKey?)` | Resolve an audio model | `audioConfig: AudioConfig, operation: 'transcribe' \| 'synthesize', explicit?: string, llmApiKey?: string` | `HaiResult<ResolvedAudioModel>` | `ai.resolveAudioModel(audioConfig, 'transcribe')` |
| `ai.ensureAudioCredential(model)` | Check audio model credentials | `model: ResolvedAudioModel` | `HaiError or null` | `ai.ensureAudioCredential(model)` |

#### Initialization dependencies and model selection arguments

| Method or object | Fields | Requirements, defaults, and conditions |
| --- | --- | --- |
| `init`, `AIInitOptions` | `config`, `runner`, `storeProvider` | Config and options are optional. See [AI settings](../configuration/ai.en.md) for model and file fields. The host owns Runner initialization and shutdown. An explicit store provider takes precedence. Omission uses initialized RelDB + VecDB or permitted ephemeral storage |
| `AIInitOptions` | `acpPolicy`, `acpAdapters`, `mcpJobFiles` | Optional host policy, adapter name-to-implementation map, and callbacks for MCP job reads and staged publication. Supply these for the managed features that need them. See [ACP](#acp) and [MCP](#mcp) |
| `ai.resolveModelEntry`, `ai.resolveModelApi` | `llmConfig`, `scenario`, `explicit/explicitModel`, `options.missingApiKeyMessage`, `tempApi` | Pass validated LLM settings. Entry resolution requires the scenario and prefers an explicit model, then the scenario, default scenario, and global model settings. Optionally supply a missing-key message. Protocol resolution can use a temporary API override |
| `ai.resolveImageModel` | `imageConfig`, `explicit` | Pass validated image settings with optional model override. Omission uses the configured generation model |
| `ai.resolveAudioModel`, `ai.ensureAudioCredential` | `audioConfig`, `operation`, `explicit`, `llmApiKey`, `model` | Pass validated audio settings and transcription or synthesis. Omission uses the operation’s configured model. An LLM credential applies only when inheritance is enabled. Credential validation separately takes the resolved model and returns a provider error or `null` |

With `scenarios: { summary: 'brief' }`, `ai.resolveModelEntry(config, 'summary')` selects the brief entry. With valid credentials it returns that model’s protocol and runtime settings.

#### Scenario: Prepare models and stores

The quick start covers init/close. config is a sanitized snapshot and isInitialized a boolean. Resolvers take validated settings and return resolved models or failures; ensureAudioCredential returns an error or null without calling a model.

[Detailed parameters and workflows](ai.md#lifecycle)

<a id="chat"></a>

### Chat, structured output and models: `ai.llm`

Chat returns a complete response while streams yield chunks. Model management and history queries follow current identity and storage capabilities.

When a model uses `protocol: "responses"`, `chat` and `chatStream` send text and images in the order supplied in the user message. Images accept URLs or Base64 data URLs, and an omitted `detail` defaults to `auto`. Set `response_format` on either call for structured output. Responses maps `json_object` or `json_schema` with a supplied schema to the provider request’s `text.format`.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.llm.chat(request)` | 单次回答 | `request: ChatCompletionRequest` | `ChatCompletionResponse: choices, model, usage?` | `ai.llm.chat({ messages: [{ role: "user", content: "你好" }] })` |
| `ai.llm.chatStream(request)` | 逐块回答 | `request: ChatCompletionRequest` | `AsyncIterable<ChatCompletionChunk>; iteration may throw` | `ai.llm.chatStream({ messages })` |
| `ai.llm.ask(question, options?)` | 纯文本问答 | `question: string, options?: AskOptions` | `string answer` | `ai.llm.ask("解释共享状态")` |
| `ai.llm.askStream(question, options?)` | 纯文本流 | `question: string, options?: AskOptions` | `AsyncIterable<string>` | `ai.llm.askStream("解释共享状态")` |
| `ai.llm.generateObject(request)` | 受 Schema 约束的答案 | `request: GenerateObjectRequest<T>` | `schema-inferred T` | `ai.llm.generateObject({ schema: AnswerSchema, messages })` |
| `ai.llm.listModels()` | 查询模型 | No arguments | `string[] model IDs` | `ai.llm.listModels()` |
| `ai.llm.getHistory(scope, options?)` | Read conversation history | `scope: InteractionScope, options?: ChatHistoryOptions`. Omit the session ID to read history for the subject across sessions. | `ChatRecord[]` | `ai.llm.getHistory({ objectId: "u1", sessionId: "s1" })` |
| `ai.llm.listSessions(objectId)` | 列出主体会话 | `objectId: string` | `SessionInfo[]` | `ai.llm.listSessions("u1")` |
| `ai.llm.models.list()` | 列出合并清单 | No arguments | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.llm.models.list()` |
| `ai.llm.models.get(id)` | 读取来源和版本 | `id: string` | `HaiResult<AIResourceEntry> with value/source/version?` | `ai.llm.models.get("coding")` |
| `ai.llm.models.register(input)` | 登记数据库定义 | `input: z.input<typeof ModelEntrySchema>` | `HaiResult<AIResourceEntry>; config entries are read-only` | `ai.llm.models.register(modelDefinition)` |
| `ai.llm.models.update(input, expectedVersion?)` | 按版本替换定义 | `input: z.input<typeof ModelEntrySchema>, expectedVersion?: string` | `HaiResult<AIResourceEntry>; full replacement, conflict fails` | `ai.llm.models.update(modelDefinition, current.version)` |
| `ai.llm.models.remove(id, expectedVersion?)` | Remove a database model definition | `id: string, expectedVersion?: string`. Pass the last read version to detect concurrent updates. | `HaiResult<void>` | `ai.llm.models.remove("coding", current.version)` |

#### Chat, structured output, and history arguments

| API | Fields | Behavior and defaults |
| --- | --- | --- |
| `chat`, `chatStream` | `messages`, `model` | Required messages in send order. `model` optionally selects a configured model ID. Omission uses the default chat model. The method controls streaming |
| `chat`, `chatStream` | `temperature`, `max_tokens`, `tools`, `tool_choice`, `response_format` | Provider fields for sampling, output budget, available tools, tool choice, and output format. The installed OpenAI SDK type describes additional standard fields. Supported fields depend on the model and protocol |
| `ask`, `askStream` | `question`, `systemPrompt`, `temperature` | Required question text. The optional system prompt precedes the question. Override the default sampling temperature with a value such as `0.2` |
| `chat`, `chatStream`, `ask`, `askStream` | `objectId`, `sessionId`, `enablePersist` | Associate history with a server-verified subject and session. With record storage and a subject ID, the default is to save history. Omission of `sessionId` uses `default`. Set `enablePersist: false` to skip this write |
| The calls above and `generateObject` | `model`, `tempModel`, `signal` | `tempModel` selects a temporary endpoint for this call and takes precedence over `model`. Pass a request `AbortSignal` to support cancellation |
| `tempModel` | `model`, `protocol`, `apiKey`, `baseUrl` | Required provider model name. Protocol supports `chat`, `responses`, or `anthropic`. It inherits the global setting and falls back to `chat`. Supply credentials and the address on the server. Omitted values inherit applicable global or protocol defaults |
| `tempModel` | `maxTokens`, `temperature`, `timeout` | Override the output token limit, sampling temperature, and timeout in milliseconds. For example, `timeout: 15000` sets fifteen seconds. Explicit request budget and temperature take precedence |
| `generateObject` | `schema`, `messages`, `systemPrompt`, `temperature` | Required Zod schema for local validation and messages. Optionally prepend a system prompt or override sampling temperature |
| `generateObject` | `responseFormat`, `schemaName`, `maxRepairs` | `responseFormat` defaults to `json_schema` and also accepts `json_object`. `schemaName` applies to `json_schema` and defaults to `result`. A local parse or validation failure gets one repair by default. Set `maxRepairs: 0` to try only once |
| `generateObject` | `maxTokens`, `preview` | Cap completion tokens. An optional callback previews the requested top-level field while the final result still requires schema validation. |
| `getHistory`, `listSessions` | `objectId`, `sessionId`, `limit`, `order` | Both require a trusted subject ID. `getHistory` optionally filters by session and takes a second object for count and time order. Default `desc` puts the newest first. `asc` puts the oldest first. `listSessions` takes the subject ID directly |
| `models.register`, `models.update`, `models.remove` | Model definition, `expectedVersion` | Register and replace use the model configuration fields. Pass the database version from `models.get` to update or remove with a concurrent change check |

See [AI settings](../configuration/ai.en.md) for model configuration fields and defaults.

#### Scenario: Chat, structured output and models

```ts
// Fragment inside an async application function; return failed results to its caller.
// Send the order status question to the default model. The completion contains text in choices; return the failed result on provider failure.
const replyResult = await ai.llm.chat({ messages: [{ role: 'user', content: 'Explain order status in one sentence.' }] })
if (!replyResult.success)
  return replyResult
const reply = replyResult.data
const text = reply.choices[0]?.message.content // model-generated text, not a fixed literal
// Ask the default model what pending means. Success yields answer text; return the failed result on a provider failure.
const answerResult = await ai.llm.ask('What does pending mean?')
if (!answerResult.success)
  return answerResult
const answer = answerResult.data // string answer
// Stream Hello to the default model and iterate completion chunks. Connection or generation failure throws from the stream.
for await (const chunk of ai.llm.chatStream({ messages: [{ role: 'user', content: 'Hello' }] })) {
  const delta = chunk.choices[0]?.delta?.content // incremental text when present
}
// Ask Hello as plain text and consume answer deltas. Provider errors end iteration by throwing.
for await (const delta of ai.llm.askStream('Hello')) {
  // consume each returned text fragment; handle stream errors outside the loop
}
// List available models with no arguments. Return the failed result if the catalog cannot be read.
const modelsResult = await ai.llm.listModels()
if (!modelsResult.success)
  return modelsResult
const models = modelsResult.data // configured model summaries
```

Questions are concrete, but model text varies. Structured generation validates against a local schema below. Resource CRUD uses one stable model name; history uses server-verified identities and sessions.

[Detailed parameters and workflows](ai.md#chat)


#### Scenario: Maintain a stored definition

Supply a validated complete definition with an unused demo ID. File-backed entries are read-only. get supplies the version, update replaces the full definition, and remove retains external resources.

```ts
async function maintain_llm_models(definition: Parameters<typeof ai.llm.models.register>[0]) {
  // Persist the supplied language model definition and get its database version. Duplicate or configuration-owned IDs fail.
  const createdResult = await ai.llm.models.register(definition)
  if (!createdResult.success)
    return createdResult
  const created = createdResult.data
  // List configured and database language model entries without arguments. Configuration takes precedence for duplicate IDs; the newly registered entry appears here.
  const listedResult = await ai.llm.models.list()
  if (!listedResult.success)
    return listedResult
  const listed = listedResult.data
  // Look up the saved language model ID and its database version. A missing ID fails.
  const currentResult = await ai.llm.models.get(definition.id)
  if (!currentResult.success)
    return currentResult
  const current = currentResult.data
  // Replace this language model definition using the observed version and get the new version. Stale versions and configuration-owned entries fail.
  const updatedResult = await ai.llm.models.update(definition, current.version)
  if (!updatedResult.success)
    return updatedResult
  const updated = updatedResult.data
  // Delete the example language model entry against its latest version. Success has no data; a conflict or config-owned entry fails.
  const removeResult = await ai.llm.models.remove(definition.id, updated.version)
  if (!removeResult.success)
    return removeResult
  return { created, listed, updated } // entries include value/source and database version
}
```

<a id="model-tools"></a>

### Give models business tools: `ai.tools`

Adapt Tools definitions to model protocols and combine built-in or remote tools under host authorization.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.tools.adapt(registry)` | 将中立工具适配给模型 | `registry: ToolRegistryOperations`. Pass the [Tools registry](tools.en.md). | `ToolRegistryOperations; no init required` | `ai.tools.adapt(registry)` |
| `ai.tools.createBuiltinTools(options)` | 组合图片、语音、文档改写与可选网址视频 | `options: BuiltinToolOptions`. Provide context and file access. `executeJob` is optional. | `direct ToolSet; model calls run only during execution` | `ai.tools.createBuiltinTools(options)` |
| `ai.tools.createMcpTools(options)` | 将已登记 MCP 纳入统一执行 | `options: McpToolOptions`. Provide context, MCP definitions, and an authorization callback. | `HaiResult<ToolSet>` | `ai.tools.createMcpTools(options)` |
| `ai.tools.createBroker(options)` | 向原生 Agent 开放同一工具服务 | `options: BuiltinToolBrokerOptions`. Pass the tool service and its fixed URL. | `HaiResult<BuiltinToolBroker>` | `ai.tools.createBroker({ service, url })` |
| `modelTools.getDefinitions()` | 传给模型的定义 | No arguments | `ToolDefinition[]` | `modelTools.getDefinitions()` |
| `modelTools.execute(toolCall, options?)` | 执行模型工具调用 | `toolCall: ToolCall, options?: ToolExecutionOptions` | `Promise<HaiResult<ToolMessage>>` | `modelTools.execute(toolCall, { objectId: "u1" })` |
| `modelTools.executeAll(toolCalls, options?)` | 批量执行模型工具调用 | `toolCalls: ToolCall[], options?: ToolExecutionOptions & { parallel?: boolean }` | `Promise<HaiResult<ToolMessage[]>>` | `modelTools.executeAll(toolCalls)` |

#### Tool composition and execution fields

| Object or method | Fields | Defaults, conditions, and effect |
| --- | --- | --- |
| `BuiltinToolOptions` | `context`, `files`, `executeJob` | Require trusted context and authorized artifact callbacks, as in [Tools file access](tools.en.md#artifact-jobs). Omitting optional `executeJob(request, context)` leaves URL video jobs out of the catalog |
| `McpToolOptions` | `context`, `definitions`, `authorize` | All required. Each definition supplies the tool name, description, JSON Schema, service ID, and remote tool name. The callback authorizes the actual call |
| `BuiltinToolBrokerOptions` | `service`, `url` | Both required. Pass the local tool service and the fixed endpoint operated by the host |
| `modelTools.execute/executeAll` | `toolCall/toolCalls`, `options` | Require one or more model tool calls. See [Tools execution options](tools.en.md#call-options). The default batch is sequential. Use `parallel: true` for independent calls |

For local composition with just `{ context, files }`, the factory returns tools such as image, audio, and document groups. Add `executeJob` to include URL video jobs.

#### Scenario: Give models business tools

Create modelTools, pass getDefinitions to the model and execute its calls with trusted context. Results are business outputs; model arguments cannot claim identity. Media and documents use authorized artifact references.

[Detailed parameters and workflows](ai.md#model-tools)

<a id="streams"></a>

### Process streams and SSE: `ai.stream`

Process chunks, collect responses and encode/decode SSE without initializing AI.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.stream.createProcessor()` | 积累增量文本 | No arguments | `direct StreamProcessor` | `ai.stream.createProcessor()` |
| `ai.stream.collect(stream)` | 完整消费聊天流 | `stream: AsyncIterable<ChatCompletionChunk>` | `Promise<StreamResult>; stream failure rejects` | `ai.stream.collect(ai.llm.chatStream({ messages }))` |
| `ai.stream.createSSEDecoder()` | 跨片段解码 SSE | No arguments | `direct SSEDecoder with decode/reset` | `ai.stream.createSSEDecoder()` |
| `ai.stream.encodeSSE(event)` | 编码事件流 | `event: SSEEvent` | `direct string; invalid metadata throws` | `ai.stream.encodeSSE({ data: "Hello" })` |

#### Stream and event fields

`collect` consumes one `AsyncIterable<ChatCompletionChunk>` to completion, usually from `ai.llm.chatStream`. Stream failures propagate from iteration.

| `SSEEvent` field | Use |
| --- | --- |
| `data` | Optional string. Line breaks become separate data lines |
| `event`, `id` | Optional event type and cursor. An omitted event type leaves `event` absent in the decoded object. EventSource consumers can treat it as `message`. `id: ''` clears the cursor. The encoder rejects line breaks in either and NUL in an ID |
| `retry` | Optional retry interval in milliseconds. Must be a nonnegative safe integer |
| `ai.stream.createJsonFieldPreview` | JSON text preview | `field, maxLength? (12000), maxInputLength? (1000000)` | `push(fragment)` → prefix or `undefined`; invalid limits and excess input throw | `ai.stream.createJsonFieldPreview('text')` |

`encodeSSE({ data: 'one' + String.fromCharCode(10) + 'two', retry: 1500 })` yields a retry line, two data lines, and an empty line. Decoding returns the joined two-line `data` and `retry` of 1500.

#### Scenario: Process streams and SSE

To show an explanation while an object is being generated, pass `preview: { field: "text", onPrefix }` to `ai.llm.generateObject`. The callback receives only the cumulative prefix of that top-level string, followed by an empty string if the attempt fails. Check the final `success` before consuming the schema-validated `data`. For application-managed retries, create a fresh preview parser on every attempt.

```ts
import { ai } from '@h-ai/ai'

// Create a fresh parser for one response. It keeps only the top-level text prefix for the preview.
const preview = ai.stream.createJsonFieldPreview('text', { maxLength: 1000 })
// Supply the first JSON fragment. The growing field is visible before the JSON object closes.
const first = preview.push('{"text":"Done') // "Done"
// Complete the chosen field. ready belongs to the final object and does not appear in the preview.
const next = preview.push(' today","ready":true}') // "Done today"
```

Input is SSE text and a real chat stream. decode waits for the blank event delimiter; collect consumes a complete stream and rejects on failure.

```ts
// Encode ready as an SSE text frame with the default event.
const encoded = ai.stream.encodeSSE({ data: 'ready' })
// Create an SSE decoder without arguments. It retains incomplete frames between chunks.
const decoder = ai.stream.createSSEDecoder()
// Pass the first five characters. The partial frame yields no event.
const first = [...decoder.decode(encoded.slice(0, 5))] // []
// Supply the remaining characters to complete the default message event with data ready.
const second = [...decoder.decode(encoded.slice(5))] // [{ event: 'message', data: 'ready', ... }]
// Clear buffered decoder data without arguments before a fresh stream.
decoder.reset()
// Create an empty completion chunk accumulator with no arguments.
const processor = ai.stream.createProcessor()
// Process the simulated Hello chunk and record its text and stop finish reason.
processor.process({ id: 'demo', object: 'chat.completion.chunk', created: 0, model: 'configured-model', choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: 'stop' }] })
// Read accumulated Hello and any available usage or tool calls without arguments.
processor.getResult() // accumulated text and optional usage/tool calls
// Convert accumulated data to an assistant message with text Hello.
processor.toAssistantMessage() // assistant message containing Hello
// Reset accumulated text and calls without arguments for the next stream.
processor.reset()
// chatStream sends Hello to the default model. collect consumes it to completion and returns the aggregate; stream errors reject the promise.
const collected = await ai.stream.collect(ai.llm.chatStream({ messages: [{ role: 'user', content: 'Hello' }] }))
// collected contains the full stream result; text is produced by the model.
```

<a id="embeddings"></a>

### Generate text embeddings: `ai.embedding`

Use the same model and dimensions for documents and queries; batch outputs retain input indices.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.embedding.embed(request)` | 通用向量请求 | `request: EmbeddingRequest` | `EmbeddingResponse` | `ai.embedding.embed({ input: "产品说明" })` |
| `ai.embedding.embedText(text)` | 单段向量 | `text: string` | `number[]` | `ai.embedding.embedText("产品说明")` |
| `ai.embedding.embedBatch(texts)` | 批量向量 | `texts: string[]` | `number[][] in input order` | `ai.embedding.embedBatch(["简介", "部署"])` |

#### Text embedding arguments

| Field | Requirements, defaults, and effect |
| --- | --- |
| `input`, `text`, `texts` | Required text. `embed` accepts a string or string array. `embedText` takes one string and `embedBatch` takes an array |
| `model` | `embed` can override the embedding scenario model. Omission uses current settings |
| `dimensions` | `embed` can request vector dimensions. Omission uses configured dimensions or model output. Supply this only when the model supports it and match the dimensions of the destination collection |

For `embed({ input: ['deploy', 'rollback'] })`, the two vector entries carry an `index` for their input positions. Use `embedBatch(['deploy', 'rollback'])` for just the vectors.

#### Scenario: Generate text embeddings

```ts
// Fragment inside an async application function; return failed results to its caller.
// Embed the supplied installation-guide text as one numeric vector. Return the failed result on a provider failure.
const oneResult = await ai.embedding.embedText('Order installation guide')
if (!oneResult.success)
  return oneResult
const one = oneResult.data // number[]
// Embed Install and Refund together and return the two corresponding vectors. Return the failed result on provider failure.
const batchResult = await ai.embedding.embedBatch(['Install', 'Refund'])
if (!batchResult.success)
  return batchResult
const batch = batchResult.data // vectors in input order
// Read the full embedding response for the same inputs, including item vectors and indices. Return the failed result on request failure.
const detailedResult = await ai.embedding.embed({ input: ['Install', 'Refund'] })
if (!detailedResult.success)
  return detailedResult
const detailed = detailedResult.data // model, data, usage
```

The inputs contain one or two texts. Values and dimensions depend on the model; index 0 identifies Install in the detailed response.

[Detailed parameters and workflows](ai.md#embeddings)

<a id="mcp"></a>

### Publish and call MCP: `ai.mcp`

Distinguish local registrations from remote services and authorize each remote call using current identity.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.mcp.registerTool(definition, handler)` | 注册本进程工具 | `definition: MCPToolDefinition, handler: MCPToolHandler<TInput, TOutput>` | `void` | `ai.mcp.registerTool(mcpToolDefinition, toolHandler)` |
| `ai.mcp.registerResource(resource, handler)` | 注册资源 | `resource: MCPResource, handler: () => Promise<MCPResourceContent>` | `void` | `ai.mcp.registerResource(resourceDefinition, readContent)` |
| `ai.mcp.registerPrompt(prompt, handler)` | 注册提示词 | `prompt: MCPPrompt, handler: (args: Record<string, string>) => Promise<MCPPromptMessage[]>` | `void` | `ai.mcp.registerPrompt(promptDefinition, buildMessages)` |
| `ai.mcp.callTool(name, args, context?)` | 调用已注册工具 | `name: string, args: unknown, context?: MCPContext`. `args` follows the registered tool’s input contract. | `unknown tool result` | `ai.mcp.callTool("search", { query: "配置" })` |
| `ai.mcp.readResource(uri)` | 读取资源 | `uri: string` | `MCPResourceContent with exactly text or blob` | `ai.mcp.readResource("docs://intro")` |
| `ai.mcp.getPrompt(name, args)` | 构建提示词 | `name: string, args: Record<string, string>` | `MCPPromptMessage[]` | `ai.mcp.getPrompt("review", { topic: "API" })` |
| `ai.mcp.services.invoke(request, authorization)` | 调用授权的远程工具 | `request: MCPServiceRequest, authorization: MCPServiceAuthorization`. Send the request and authorization context containing a server-verified principal and policy callback. | `HaiResult<CallToolResult>` | `ai.mcp.services.invoke(request, authorization)` |
| `ai.mcp.services.createBroker(options)` | 为 ACP 会话挂载工具入口 | `options: MCPServiceBrokerOptions`. Options include the fixed URL and live authorization callback. | `HaiResult<MCPServiceBroker>` | `ai.mcp.services.createBroker(brokerOptions)` |
| `ai.mcp.servers.list()` | 列出合并清单 | No arguments | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.mcp.servers.list()` |
| `ai.mcp.servers.get(id)` | 读取来源和版本 | `id: string` | `HaiResult<AIResourceEntry> with value/source/version?` | `ai.mcp.servers.get("tools")` |
| `ai.mcp.servers.register(input)` | 登记数据库定义 | `input: z.input<typeof MCPExternalServerSchema>` | `HaiResult<AIResourceEntry>; config entries are read-only` | `ai.mcp.servers.register(mcpServerDefinition)` |
| `ai.mcp.servers.update(input, expectedVersion?)` | 按版本替换定义 | `input: z.input<typeof MCPExternalServerSchema>, expectedVersion?: string` | `HaiResult<AIResourceEntry>; full replacement, conflict fails` | `ai.mcp.servers.update(mcpServerDefinition, current.version)` |
| `ai.mcp.servers.remove(id, expectedVersion?)` | 删除数据库定义 | `id: string, expectedVersion?: string` | `HaiResult<void>; external files/services are retained` | `ai.mcp.servers.remove("tools", current.version)` |

#### MCP registration and call arguments

| Input object or method | Fields | Defaults, conditions, and effect |
| --- | --- | --- |
| `MCPToolDefinition` | `name`, `description`, `inputSchema` | All required. Use a unique name and a JSON Schema. The framework validates `args` against that schema before running the handler |
| `registerTool` | `handler(input, context)` | Required. Receives validated input and request context and returns a value or Promise. Failure is reported as a tool error |
| `MCPContext` | `requestId`, `clientInfo`, `metadata` | All optional. An omitted request ID becomes a UUID. Client information has a `name` and `version`. Metadata carries application context |
| `MCPResource` | `uri`, `name`, `description`, `mimeType` | URI and name are required. Description and MIME type are optional. `readResource` looks up the registered URI and calls a no-argument handler that returns its URI and `text` or Base64 `blob` |
| `MCPPrompt` | `name`, `description`, `arguments` | Name is required. Declare optional arguments as `{ name, description?, required? }` entries. `required` defaults to `false` |
| `getPrompt` | `name`, `args` | Pass a registered name and a map of strings. Required arguments must be own properties. The registered handler then renders the prompt messages |
| `MCPServiceRequest` | `serviceId`, `tool`, `arguments` | Service ID and tool name are required. The optional argument object follows the remote tool definition. The server-side registry supplies the address and credentials |
| `MCPServiceAuthorization` | `principal`, `authorize`, `taskId`, `signal` | The trusted principal has `tenantId` and `userId`. The callback receives the principal, request, and cancellation signal and returns allow or deny. Optional task IDs come from server bindings and `signal` cancels the wait |
| `MCPServiceBrokerOptions` | `url`, `authorize` | Both required. The execution environment must reach the fixed endpoint. The callback checks the principal, tool, actual arguments, and task ID for each call |
| `servers.register/update/remove` | Server input, `id`, `expectedVersion` | See [AI settings](../configuration/ai.en.md) for server fields. `get` selects an ID. Updates and removals can use the previously read database version as a concurrency condition |

For a registered prompt `explain` with `arguments: [{ name: 'topic', required: true }]`, `getPrompt('explain', { topic: 'caching' })` passes the topic to the handler, which builds the messages. Passing `{}` returns an argument error before the handler runs.

#### Scenario: Publish and call MCP

Register tools/resources/prompts, then call or read them. Remote server CRUD and services.invoke/createBroker have distinct inputs and authorization. Use and close returned brokers.

[Detailed parameters and workflows](ai.md#mcp)


#### Scenario: Maintain a stored definition

Supply a validated complete definition with an unused demo ID. File-backed entries are read-only. get supplies the version, update replaces the full definition, and remove retains external resources.

```ts
async function maintain_mcp_servers(definition: Parameters<typeof ai.mcp.servers.register>[0]) {
  // Persist the supplied MCP server definition and get its database version. Duplicate or configuration-owned IDs fail.
  const createdResult = await ai.mcp.servers.register(definition)
  if (!createdResult.success)
    return createdResult
  const created = createdResult.data
  // List configured and database MCP server entries without arguments. Configuration takes precedence for duplicate IDs; the newly registered entry appears here.
  const listedResult = await ai.mcp.servers.list()
  if (!listedResult.success)
    return listedResult
  const listed = listedResult.data
  // Look up the saved MCP server ID and its database version. A missing ID fails.
  const currentResult = await ai.mcp.servers.get(definition.id)
  if (!currentResult.success)
    return currentResult
  const current = currentResult.data
  // Replace this MCP server definition using the observed version and get the new version. Stale versions and configuration-owned entries fail.
  const updatedResult = await ai.mcp.servers.update(definition, current.version)
  if (!updatedResult.success)
    return updatedResult
  const updated = updatedResult.data
  // Delete the example MCP server entry against its latest version. Success has no data; a conflict or config-owned entry fails.
  const removeResult = await ai.mcp.servers.remove(definition.id, updated.version)
  if (!removeResult.success)
    return removeResult
  return { created, listed, updated } // entries include value/source and database version
}
```

<a id="retrieval"></a>

### Register sources and rerank: `ai.retrieval`, `ai.rerank`

Register source collections before retrieval and optionally rerank the candidates afterward.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.retrieval.addSource(source)` | 登记检索源 | `source: RetrievalSource` | `void` | `ai.retrieval.addSource({ id: "docs", collection: "manual" })` |
| `ai.retrieval.removeSource(sourceId)` | 撤销检索源 | `sourceId: string` | `void` | `ai.retrieval.removeSource("docs")` |
| `ai.retrieval.listSources()` | 列出可用检索源 | No arguments | `direct Promise<RetrievalSource[]>` | `ai.retrieval.listSources()` |
| `ai.retrieval.retrieve(request)` | 向量检索 | `request: RetrievalRequest` | `RetrievalResult` | `ai.retrieval.retrieve({ query: "部署" })` |
| `ai.rerank.rerank(request)` | 重排文档对象 | `request: RerankRequest` | `RerankResponse with model/results` | `ai.rerank.rerank({ query: "部署", documents: ["配置说明"] })` |
| `ai.rerank.rerankTexts(query, texts, topN?)` | 重排文本候选 | `query: string, texts: string[], topN?: number` | `RerankItem[] with index/relevanceScore` | `ai.rerank.rerankTexts("部署", ["配置说明"], 1)` |
| `ai.retrieval.sources.list()` | 列出合并清单 | No arguments | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.retrieval.sources.list()` |
| `ai.retrieval.sources.get(id)` | 读取来源和版本 | `id: string` | `HaiResult<AIResourceEntry> with value/source/version?` | `ai.retrieval.sources.get("docs")` |
| `ai.retrieval.sources.register(input)` | 登记数据库定义 | `input: z.input<typeof RetrievalSourceSchema>` | `HaiResult<AIResourceEntry>; config entries are read-only` | `ai.retrieval.sources.register(sourceDefinition)` |
| `ai.retrieval.sources.update(input, expectedVersion?)` | 按版本替换定义 | `input: z.input<typeof RetrievalSourceSchema>, expectedVersion?: string` | `HaiResult<AIResourceEntry>; full replacement, conflict fails` | `ai.retrieval.sources.update(sourceDefinition, current.version)` |
| `ai.retrieval.sources.remove(id, expectedVersion?)` | Remove a database definition | `id: string, expectedVersion?: string`. Pass the last read version to detect concurrent updates. | `HaiResult<void>` | `ai.retrieval.sources.remove("docs", current.version)` |

#### Source, search, and reranking arguments

| API or object | Fields | Behavior and defaults |
| --- | --- | --- |
| `RetrievalSource` | `id`, `collection` | Both required. Requests select a source by `id`. `collection` identifies its populated vector collection |
| `RetrievalSource` | `name`, `url` | Optional display label and source address. Citations use them when a vector record lacks its own title or address |
| `RetrievalSource` | `topK`, `minScore`, `filter` | Fetch `5` candidates from this source by default. Optionally set a minimum similarity and a metadata filter supported by the vector backend, such as `{ category: 'deployment' }` |
| `retrieve` | `query`, `sources` | Pass the search text and optionally source IDs such as `['docs']`. Omission and `[]` both search all registered sources |
| `retrieve` | `topK`, `minScore` | `topK` sets both the per-source candidate count and the combined result limit. By default each source uses its own limit or `5`, and the combined result contains at most `10` items. `minScore` overrides per-source thresholds |
| `retrieve` | `enableRerank`, `rerankModel` | Sort on vector scores by default. `enableRerank: true` uses an initialized reranker, with optional model override. Search keeps vector scores when reranking is unavailable or fails |
| `rerank` | `query`, `documents` | Both required. Pass candidate strings or `{ text, id? }` objects to retain a business document ID |
| `rerank` | `model`, `topN`, `returnDocuments` | Uses the configured rerank model by default. Set `topN` to limit the rankings. Omit it to request all candidates. `returnDocuments` defaults to `false`. Set it to `true` to include text |
| `rerankTexts` | `query`, `texts`, `topN` | Required query and string array, with an optional result count. For example, `topN: 1` requests just the highest ranked candidate |
| `sources.update`, `sources.remove` | `expectedVersion` | Use the database source version from the last `sources.get`. A supplied version that no longer matches returns a conflict |

#### Scenario: Register sources and rerank

Prepare a populated manual collection matching the embedding dimensions, then register docs. Scores depend on the backend; removing a source retains its documents.

```ts
// Fragment inside an async application function; return failed results to its caller.
// Register docs for the manual vector collection. Success has no data; a duplicate ID fails.
const addSourceResult = await ai.retrieval.addSource({ id: 'docs', collection: 'manual' })
if (!addSourceResult.success)
  return addSourceResult
try {
  // List retrieval sources without arguments. The returned array now includes docs.
  const sources = await ai.retrieval.listSources() // direct RetrievalSource[]
  // Find up to five deployment matches in docs, with citations. Return the failed result on missing sources or retrieval failures.
  const foundResult = await ai.retrieval.retrieve({ query: 'deployment', sources: ['docs'], topK: 5 })
  if (!foundResult.success)
    return foundResult
  const found = foundResult.data
  // Rerank the two supplied documents for deployment relevance. The result includes ranked items and scores; return the failed result on provider errors.
  const rankedResult = await ai.rerank.rerank({ query: 'deployment', documents: ['Deployment guide', 'Refund policy'] })
  if (!rankedResult.success)
    return rankedResult
  const ranked = rankedResult.data
  // Rerank the same texts and return only the top-ranked text.
  const textsResult = await ai.rerank.rerankTexts('deployment', ['Deployment guide', 'Refund policy'], 1)
  if (!textsResult.success)
    return textsResult
  const texts = textsResult.data
  // found has source candidates; ranked/texts carry original indexes and relevance scores.
}
finally {
  // Remove the docs source registered for this example. Success has no data; a missing source fails.
  const removeSourceResult = await ai.retrieval.removeSource('docs')
  if (!removeSourceResult.success)
    return removeSourceResult
}
```


#### Scenario: Maintain a stored definition

Supply a validated complete definition with an unused demo ID. File-backed entries are read-only. get supplies the version, update replaces the full definition, and remove retains external resources.

```ts
async function maintain_retrieval_sources(definition: Parameters<typeof ai.retrieval.sources.register>[0]) {
  // Persist the supplied retrieval source definition and get its database version. Duplicate or configuration-owned IDs fail.
  const createdResult = await ai.retrieval.sources.register(definition)
  if (!createdResult.success)
    return createdResult
  const created = createdResult.data
  // List configured and database retrieval source entries without arguments. Configuration takes precedence for duplicate IDs; the newly registered entry appears here.
  const listedResult = await ai.retrieval.sources.list()
  if (!listedResult.success)
    return listedResult
  const listed = listedResult.data
  // Look up the saved retrieval source ID and its database version. A missing ID fails.
  const currentResult = await ai.retrieval.sources.get(definition.id)
  if (!currentResult.success)
    return currentResult
  const current = currentResult.data
  // Replace this retrieval source definition using the observed version and get the new version. Stale versions and configuration-owned entries fail.
  const updatedResult = await ai.retrieval.sources.update(definition, current.version)
  if (!updatedResult.success)
    return updatedResult
  const updated = updatedResult.data
  // Delete the example retrieval source entry against its latest version. Success has no data; a conflict or config-owned entry fails.
  const removeResult = await ai.retrieval.sources.remove(definition.id, updated.version)
  if (!removeResult.success)
    return removeResult
  return { created, listed, updated } // entries include value/source and database version
}
```

<a id="rag"></a>

### Answer with sources and citations: `ai.rag`

Pass the question and registered sources to RAG, retain citations with answers and consume stream events incrementally.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.rag.query(query, options?)` | 带引用回答 | `query: string, options?: RagOptions` | `RagResult: answer, context, citations, query, model` | `ai.rag.query("如何部署？", { sources: ["docs"] })` |
| `ai.rag.queryStream(query, options?)` | 带引用流式回答 | `query: string, options?: RagOptions` | `AsyncIterable<RagStreamEvent>` | `ai.rag.queryStream("如何部署？", { sources: ["docs"] })` |

#### Question and `RagOptions`

Both methods take a required `query` string and an optional `options` object.

| Option | Behavior and default |
| --- | --- |
| `sources` | Source ID array. Omission and `[]` both search all registered sources. Pass `['docs']` to search deployment documentation after the application authorizes that source |
| `topK`, `minScore` | `topK` defaults to `5` and limits both candidates per source and total context items. `minScore` overrides source thresholds and otherwise inherits them |
| `enableRerank`, `rerankModel` | Enable an initialized reranker with `true` and optionally override its model. The default ranking uses vector scores |
| `model`, `temperature` | Override the answer model or sampling temperature. Otherwise use LLM settings. For example, `temperature: 0.2` reduces sampling randomness |
| `systemPrompt`, `messages` | Replace the built-in instruction for answering from sources. The retrieved context is still appended to it. Pass earlier chat messages in `messages`. The framework appends the current `query` |
| `formatContext` | Convert retrieved `RagContextItem[]` into a string for the model. The default is a numbered source list. For example, `items => items.map(item => item.content).join('\n\n')` supplies only the excerpt text in the prompt |
| `objectId`, `sessionId` | Server-selected subject and session IDs for the internal LLM's conversation history. With a subject and persistence enabled, an omitted session ID uses `default` |
| `enablePersist` | Allows the internal LLM to save history by default. Pass `false` when the application already records the turn |
| `signal` | Optional request `AbortSignal` to cancel LLM generation |

#### Scenario: Answer with sources and citations

```ts
// Fragment inside an async application function; return failed results to its caller.
// Retrieve deployment context from docs and ask the model. Success includes answer, context, and citations; return the failed result on retrieval or generation failure.
const answerResult = await ai.rag.query('How do I deploy?', { sources: ['docs'] })
if (!answerResult.success)
  return answerResult
const answer = answerResult.data
// answer contains answer, context, citations, query and model
// Stream the same deployment question over docs and consume context, text deltas, and the completion event.
for await (const event of ai.rag.queryStream('How do I deploy?', { sources: ['docs'] })) {
  // Render only events applicable to the UI; preserve citation events as references.
}
```

docs must be registered and authorized. Text varies and citations refer to retrieved content. A failed stream must not become a complete successful answer.

[Detailed parameters and workflows](ai.md#rag)

<a id="knowledge"></a>

### Publish, search and revoke knowledge: `ai.knowledge`

Publish document revisions from text or files, then retrieve or ask questions. Revoke visibility before cleanup and repair residual vectors.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.knowledge.setup(options?)` | 准备集合 | `options?: KnowledgeSetupOptions` | `void; collection ready for ingest` | `ai.knowledge.setup()` |
| `ai.knowledge.ingest(input)` | Publish a text document | `input: KnowledgeIngestInput`. `documentId` and `content` are required. `cleanOptions` and `chunkOptions` override processing settings for this document. | `KnowledgeIngestResult` with `revision` and `cleanupPending`. Cleaning or chunking failure returns `KNOWLEDGE_INGEST_FAILED` | `ai.knowledge.ingest({ documentId: "intro", content: "Getting started" })` |
| `ai.knowledge.ingestFile(input)` | Import a server-side text file | `input: KnowledgeIngestFileInput`. `filePath` is required. Encoding, document details, cleaning, and chunking options are optional. | `KnowledgeIngestResult` | `ai.knowledge.ingestFile({ filePath: "docs/intro.md" })` |
| `ai.knowledge.ingestBatch(inputs, onProgress?)` | 批量导入 | `inputs: KnowledgeIngestInput[], onProgress?: (progress: KnowledgeIngestBatchProgress) => void` | `KnowledgeIngestBatchResult with per-document outcomes` | `ai.knowledge.ingestBatch(documentInputs, onProgress)` |
| `ai.knowledge.retrieve(query, options?)` | 检索发布版本 | `query: string, options?: KnowledgeRetrieveOptions` | `KnowledgeRetrieveResult` | `ai.knowledge.retrieve("部署说明")` |
| `ai.knowledge.ask(query, options?)` | 基于知识回答 | `query: string, options?: KnowledgeAskOptions` | `KnowledgeAskResult` | `ai.knowledge.ask("如何恢复备份？")` |
| `ai.knowledge.findByEntity(entityName, options?)` | 按实体找资料 | `entityName: string, options?: EntityQueryOptions` | `EntityDocumentResult[]` | `ai.knowledge.findByEntity("订单")` |
| `ai.knowledge.listEntities(options?)` | 实体清单 | `options?: EntityListOptions` | `KnowledgeEntity[]` | `ai.knowledge.listEntities()` |
| `ai.knowledge.listDocuments(options?)` | 文档清单 | `options?: KnowledgeDocumentListOptions` | `KnowledgeDocumentInfo[]` | `ai.knowledge.listDocuments()` |
| `ai.knowledge.removeDocument(documentId, options?)` | 撤销文档 | `documentId: string, options?: KnowledgeDocumentRemoveOptions` | `void; may fail after visibility revocation if cleanup fails` | `ai.knowledge.removeDocument("intro")` |
| `ai.knowledge.repair(options?)` | 补偿残留向量 | `options?: KnowledgeRepairOptions` | `KnowledgeRepairResult with progress` | `ai.knowledge.repair({ offset: 0, limit: 100 })` |
| `ai.knowledge.deleteCollection(collection?)` | 撤销整个集合 | `collection?: string` | `void; cleanup tombstone remains` | `ai.knowledge.deleteCollection("retired-manual")` |

#### Collection, ingestion, and search arguments

Set up each collection before its first ingestion or search.

| API | Fields | Behavior and defaults |
| --- | --- | --- |
| `setup` | `collection`, `dimension` | Override `knowledge.collection` and `knowledge.dimension`, which default to `hai_ai_knowledge` and `1536`. The dimension must match the embedding model |
| `ingest` | `documentId`, `content` | Both required. Reuse the ID within a collection to publish a new revision of the same document. Pass the source text in `content` |
| `ingest` | `title`, `url`, `metadata` | Optional citation title and address and business metadata attached to chunks. For example, store `{ category: 'deployment' }` in `metadata` and filter on the same field when searching |
| `ingest`, `ingestFile` | `collection`, `enableEntityExtraction` | Inherit the configured collection and entity extraction setting. `enableEntityExtraction: false` still generates embeddings for search |
| `ingest`, `ingestFile` | `cleanOptions` | Override knowledge cleaning settings field by field. Indentation is preserved by default. For plain text, pass `normalizeWhitespace: true, trim: true` to normalize spaces and trim the input |
| `ingest`, `ingestFile` | `chunkOptions` | If supplied, include `mode`. Other fields override the knowledge settings. Defaults are `markdown`, `maxSize: 1500`, `overlap: 200`. For example, `{ mode: 'paragraph', maxSize: 100, overlap: 10 }` explicitly lowers overlap to satisfy `overlap < maxSize` |
| `ingestFile` | `filePath`, `encoding` | Required trusted path to a text file on the Node.js host. `encoding` defaults to `utf-8`. File text is ingested and the path is saved with the citation |
| `ingestFile` | `documentId`, `title`, `metadata` | ID and title each default to the file basename. Assign distinct IDs to keep files with the same name separate. Metadata is attached to their chunks |
| `ingestBatch` | `inputs`, `onProgress` | Array of `ingest` inputs processed in order. The optional synchronous callback receives `completed`, `total`, `currentDocumentId`, and that document's `result` or `error`. Check `data.failureCount` and `data.results` for partial failures |
| `retrieve`, `ask` | `query`, `collection` | Required search text or question. The collection defaults to `knowledge.collection` |
| `retrieve`, `ask` | `topK`, `minScore`, `enableEntityBoost` | Return up to `topK` items, default `10`. Optionally set a minimum vector score. Entity boosting defaults to `true`. Set it to `false` to rank on vector scores |
| `retrieve`, `ask` | `filter` | Metadata condition passed to the vector backend, for example `{ category: 'deployment' }`. LanceDB accepts top-level strings, finite numbers, booleans and `null`. All keys must match and `null` matches explicitly null fields |
| `ask` | `model`, `temperature`, `systemPrompt`, `messages` | Override the LLM model or temperature, replace the knowledge-answer instruction, or include previous chat messages. The instruction still includes retrieved context and the question follows the previous messages |
| `findByEntity` | `entityName`, `collection`, `type` | Required search name. The default database store matches substrings of names and aliases without regard to case. Optionally restrict entity type or override the configured collection |
| `listEntities` | `collection`, `type`, `keyword`, `limit` | All optional. The default database store lists entities from published revisions in all collections, ordered by name. `keyword` matches names and aliases. `limit` caps the list |
| `listDocuments` | `collection`, `offset`, `limit` | Uses the configured collection. The default store starts at `0` and returns remaining visible documents when `limit` is omitted. For example, `{ offset: 20, limit: 20 }` skips the first twenty documents |
| `removeDocument`, `deleteCollection` | `documentId`, `collection` | `removeDocument` requires a document ID and accepts `{ collection }` as its second argument. `deleteCollection` takes the collection name directly. Both default to `knowledge.collection` |
| `repair` | `collection`, `offset`, `limit` | Uses the configured collection. The manifest offset defaults to `0` and includes cleanup records for deleted documents. `limit` defaults to `100` and accepts integers `1–1000` |

See the individual cleaning and chunking fields in the [Datapipe options](datapipe.en.md#call-options).

#### Scenario: Publish, search and revoke knowledge

Existing vectors do not make a revision visible. This distinguishes revision preparation, conditional publication and cleanup of old vectors.

![Knowledge ingestion: prepare, publish, clean up](../images/function-ai-knowledge-publication.en.svg)

Only a published revision becomes current for retrieval. Cleanup failure can leave cleanupPending for repair. Removal revokes visibility before cleanup. Retrieval must check the published revision rather than trusting any old chunk still in the vector store.

The Markdown document below includes an indented code line. Default cleaning preserves the four leading spaces, so `# maintenance note` stays inside that line and the guide becomes one Markdown chunk. For plain text, pass `cleanOptions: { normalizeWhitespace: true, trim: true }` to clean up whitespace for that import. If cleaning or chunking fails, ingestion stops before generating embeddings. The failure retains its original cause and any previously published revision remains searchable. [Knowledge ingestion settings](../configuration/ai.en.md#knowledge)

```ts
// Fragment inside an async application function; return failed results to its caller.
// Set up the default knowledge collection and revision records with no arguments. Success has no data; setup failure blocks ingestion.
const setupResult = await ai.knowledge.setup()
if (!setupResult.success)
  return setupResult
const restartGuide = '# Restart the service\n\n    # maintenance note\n\nRestart the service after updating configuration.'
// Ingest the guide with its indented code as demo-intro. Default settings publish one chunk. Return any cleaning or chunking failure.
const publishedResult = await ai.knowledge.ingest({ documentId: 'demo-intro', content: restartGuide })
if (!publishedResult.success)
  return publishedResult
const published = publishedResult.data
// Retrieve restart guidance from the default collection with citations. Return the failed result on a retrieval failure.
const matchesResult = await ai.knowledge.retrieve('When should the service restart?')
if (!matchesResult.success)
  return matchesResult
const matches = matchesResult.data
// Answer the same restart question using retrieved evidence. Success includes the answer and references; return the failed result on failure.
const answerResult = await ai.knowledge.ask('When should the service restart?')
if (!answerResult.success)
  return answerResult
const answer = answerResult.data
// Read visible documents from the default collection; the list includes demo-intro.
const documentsResult = await ai.knowledge.listDocuments()
if (!documentsResult.success)
  return documentsResult
const documents = documentsResult.data
// List entities with no arguments. Actual entries depend on extraction.
const entitiesResult = await ai.knowledge.listEntities()
if (!entitiesResult.success)
  return entitiesResult
const entities = entitiesResult.data
// Find documents associated with entity service. With no match, the list is empty.
const relatedResult = await ai.knowledge.findByEntity('service')
if (!relatedResult.success)
  return relatedResult
const related = relatedResult.data
// Remove the visible revision for the ingested document ID. Success has no data; handle cleanup failure.
const removeDocumentResult = await ai.knowledge.removeDocument('demo-intro')
if (!removeDocumentResult.success)
  return removeDocumentResult
// no longer visible to retrieval
// Reconcile expired staging or old vectors for up to 100 records from offset 0. Success returns repair progress.
const repairedResult = await ai.knowledge.repair({ offset: 0, limit: 100 })
if (!repairedResult.success)
  return repairedResult
const repaired = repairedResult.data // cleanup progress
```

Use an isolated test collection. Revisions, retrieval and cleanup depend on storage and models.

#### Scenario: Import a file and track a batch

Run this in a Node.js service with the collection already set up and an application-owned `docs/intro.md`. Assign a document ID to the file, then import two plain-text instructions in a batch.

```ts
// Read the UTF-8 file and publish intro-file. Return the error if reading or ingestion fails.
const file = await ai.knowledge.ingestFile({ filePath: 'docs/intro.md', encoding: 'utf-8', documentId: 'intro-file' })
if (!file.success)
  return file

const progress: string[] = []
// Import two instructions in order. The callback records progress as each finishes and the batch reports each result or error.
const batch = await ai.knowledge.ingestBatch([
  { documentId: 'startup', content: 'Start the service after updating its configuration.' },
  { documentId: 'backup', content: 'Verify the backup before upgrading.' },
], ({ completed, total, currentDocumentId }) => {
  progress.push(`${completed}/${total}: ${currentDocumentId}`)
})
if (!batch.success)
  return batch
const failedIds = batch.data.results.filter(item => item.error).map(item => item.documentId)
```

Once both documents have been processed, `progress` contains `1/2: startup` and `2/2: backup` in that order. `failedIds` identifies the documents in this batch that need attention.

[Detailed parameters and workflows](ai.md#knowledge)

<a id="memory"></a>

### Save and recall scoped memory: `ai.memory`

Bind a trusted objectId and optional topic scope before memory access; keep administrative deletion separate.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.memory.scoped(binding)` | 绑定可信主体 | `binding: ScopedMemoryBinding`. Pass a trusted, nonempty `objectId` and optional scope. | `direct ScopedMemoryOperations; invalid binding throws TypeError` | `ai.memory.scoped({ objectId: "u1", scope: { topicId: "orders" } })` |
| `ai.memory.extract(messages, options?)` | 提取事实记忆 | `messages: ChatMessage[], options?: MemoryExtractOptions` | `MemoryEntry[]` | `ai.memory.extract(messages, { objectId: "u1" })` |
| `ai.memory.add(entry)` | 保存明确事实 | `entry: MemoryEntryInput` | `MemoryEntry` | `ai.memory.add({ objectId: "u1", content: "偏好中文", type: "preference" })` |
| `ai.memory.get(memoryId, accessScope?)` | 授权读取记忆 | `memoryId: string, accessScope?: MemoryAccessScope`. For externally supplied memory IDs, pass the access scope verified by the server from the current identity. | `MemoryEntry` | `ai.memory.get(memoryId, { objectId: "u1" })` |
| `ai.memory.update(memoryId, updates, accessScope?)` | 更新已有事实 | `memoryId: string, updates: MemoryUpdateInput, accessScope?: MemoryAccessScope`. For externally supplied memory IDs, pass the access scope verified by the server from the current identity. | `MemoryEntry` | `ai.memory.update(memoryId, { content: "偏好日文" }, { objectId: "u1" })` |
| `ai.memory.remove(memoryId, accessScope?)` | 删除授权记忆 | `memoryId: string, accessScope?: MemoryAccessScope`. For externally supplied memory IDs, pass the access scope verified by the server from the current identity. | `void` | `ai.memory.remove(memoryId, { objectId: "u1" })` |
| `ai.memory.recall(query, options?)` | 召回相关事实 | `query: string, options?: MemoryRecallOptions` | `MemoryEntry[]` | `ai.memory.recall("语言偏好", { objectId: "u1" })` |
| `ai.memory.injectMemories(messages, options?)` | 补充对话上下文 | `messages: ChatMessage[], options?: MemoryInjectionOptions` | `ChatMessage[]` | `ai.memory.injectMemories(messages, { objectId: "u1" })` |
| `ai.memory.list(options?)` | 读取完整列表 | `options?: MemoryListOptions` | `MemoryEntry[]; incomplete scan fails` | `ai.memory.list({ objectId: "u1" })` |
| `ai.memory.listPage(options?)` | 分页浏览记忆 | `options?: MemoryListPageOptions` | `StorePage<MemoryEntry>` | `ai.memory.listPage({ objectId: "u1", offset: 0, limit: 20 })` |
| `ai.memory.clear(options?)` | 清理指定范围 | `options?: MemoryClearOptions` | `void; empty filters are rejected` | `ai.memory.clear({ objectId: "u1" })` |
| `ai.memory.admin.clearAll(options)` | 可信管理员全清 | `options: MemoryClearAllOptions`. The host must authorize an administrator. Pass `confirm: true`. | `void; destructive across subjects` | `ai.memory.admin.clearAll({ confirm: true })` |

#### Memory writing, filtering, and injection options

| Input object or method | Fields | Defaults, conditions, and effect |
| --- | --- | --- |
| `ScopedMemoryBinding`, `MemoryAccessScope` | `objectId`, `scope` | The subject ID is required and comes from server authentication. An optional scope such as `{ topicId: 'shipping' }` restricts visible entries by key and value. Pass a trusted access scope to `get/update/remove` when handling external memory IDs |
| `MemoryEntryInput` | `content`, `type`, `importance`, `objectId`, `scope`, `metadata` | Content and type are required. Types are `fact/preference/event/entity/instruction`. Importance ranges from 0 to 1 and defaults to 0.5 with the native provider. Subject, scope, and metadata are optional. Use a bound instance for subject isolation |
| `MemoryUpdateInput` | `content`, `type`, `importance`, `metadata` | Supply only fields to update. Changing content invalidates the old vector and triggers a vector update |
| `MemoryExtractOptions` | `types`, `model`, `systemPrompt`, `minImportance`, `objectId`, `scope`, `tempModel`, `signal` | `extract` starts with the supplied message array. Filter types and importance, which defaults to 0. Override the extraction model or prompt, or use an LLM temporary model and cancellation signal. Subject and scope set ownership |
| `MemoryRecallOptions` | `topK`, `candidateMultiplier`, `types`, `minImportance`, `recencyWeight`, `objectId`, `scope` | `recall` uses a query string. See [AI settings](../configuration/ai.en.md) for count and candidate multiplier defaults. It expands retrieval before type, importance, and scope filtering. Recency weight ranges from 0 to 1. Omission uses `1 - recencyDecay` for the native provider and preserves retrieval order for Mem0 |
| `MemoryInjectionOptions` | `topK`, `candidateMultiplier`, `maxTokens`, `position`, `objectId`, `scope`, `types`, `minImportance` | Extracts a query from the messages and injects up to 5 entries by default. Recall filters apply. A positive `maxTokens` caps estimated injected tokens. The default `system` appends to the system message. `before-last` inserts before the last user message |
| `MemoryListOptions`, `MemoryListPageOptions` | `types`, `objectId`, `scope`, `limit`, page `offset` | Use the same subject and scope filters and optionally cap `list` results. Page `offset` defaults to 0 and `limit` to 20 |
| `MemoryClearOptions`, `MemoryClearAllOptions` | `types`, `objectId`, `scope`, `confirm` | Ordinary clearing applies the subject and filters. Global clearing requires administrator authorization from the host and explicit `confirm: true` |

For example, bind `memory.scoped({ objectId: 'reader-1', scope: { topicId: 'shipping' } })`, then recall `'delivery preferences'` with `{ topK: 2, types: ['preference'] }`. The successful array contains at most two entries matching that subject, topic, and type.

#### Scenario: Save and recall scoped memory

Use a trusted session subject throughout. Add, read, update, recall and remove only the demo entry; administrator-wide clearing is a separate operation.

```ts
async function rememberPreference(objectId: string) {
  // Bind the trusted subject and demo-preference topic to a memory instance for subsequent calls.
  const memory = ai.memory.scoped({ objectId, scope: { topicId: 'demo-preference' } })
  // Store the Chinese-reply preference in the bound scope. Success returns the entry and ID; return the failed result on persistence or embedding failure.
  const savedResult = await memory.add({ content: 'Prefers Chinese replies', type: 'preference' })
  if (!savedResult.success)
    return savedResult
  const saved = savedResult.data
  const access = { objectId, scope: { topicId: 'demo-preference' } }
  // Read the saved ID in the same subject and topic. Missing or out-of-scope entries fail.
  const getResult = await ai.memory.get(saved.id, access)
  if (!getResult.success)
    return getResult
  getResult.data
  // Change this scoped entry to Japanese replies. Success returns the updated memory with a recalculated embedding; return the failed result on errors.
  const updateResult = await ai.memory.update(saved.id, { content: 'Prefers Japanese replies' }, access)
  if (!updateResult.success)
    return updateResult
  updateResult.data
  // Find language preference memories in the bound scope. No match gives an empty array.
  const recalledResult = await memory.recall('language preference')
  if (!recalledResult.success)
    return recalledResult
  const recalled = recalledResult.data
  const messages = [{ role: 'user' as const, content: 'Hello' }]
  // Inject relevant scoped memories into a new list based on the Hello messages.
  const enrichedResult = await ai.memory.injectMemories(messages, access)
  if (!enrichedResult.success)
    return enrichedResult
  const enriched = enrichedResult.data
  // Analyze the Hello message and persist any extracted memories in the same scope. The returned array can be empty.
  const extractedResult = await ai.memory.extract(messages, access)
  if (!extractedResult.success)
    return extractedResult
  const extracted = extractedResult.data
  // List memories for the same subject and topic; return the failed result on read failure.
  const allResult = await ai.memory.list(access)
  if (!allResult.success)
    return allResult
  const all = allResult.data
  // Read up to 20 scoped entries from offset 0 and their pagination information.
  const pageResult = await ai.memory.listPage({ ...access, offset: 0, limit: 20 })
  if (!pageResult.success)
    return pageResult
  const page = pageResult.data
  // Delete the original preference using its ID and scope. Success has no data; a scope mismatch fails.
  const removeResult = await ai.memory.remove(saved.id, access)
  if (!removeResult.success)
    return removeResult
  // Clear the remaining preference entries only within the bound subject and topic. Success has no data.
  const clearResult = await memory.clear({ types: ['preference'] })
  if (!clearResult.success)
    return clearResult
  return { recalled, enriched, extracted, all, page }
}
```

<a id="personas"></a>

### Maintain personas and prompts: `ai.persona`

Personas define role and tone while memory stores facts. Identical persona names remain isolated by owner.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.persona.save(profile)` | 保存角色 | `profile: PersonaProfileInput` | `PersonaProfile` | `ai.persona.save(personaProfile)` |
| `ai.persona.get(id, options?)` | 读取角色 | `id: string, options?: PersonaScopeOptions`. Omit the subject to read a system persona. | `PersonaProfile` | `ai.persona.get("tutor", { objectId: "u1" })` |
| `ai.persona.update(id, updates, options?)` | 更新角色 | `id: string, updates: PersonaProfileUpdate, options?: PersonaScopeOptions` | `PersonaProfile` | `ai.persona.update("tutor", updates, { objectId: "u1" })` |
| `ai.persona.remove(id, options?)` | 删除角色 | `id: string, options?: PersonaScopeOptions` | `void` | `ai.persona.remove("tutor", { objectId: "u1" })` |
| `ai.persona.list(options?)` | 列出主体角色 | `options?: PersonaScopeOptions` | `PersonaProfile[]` | `ai.persona.list({ objectId: "u1" })` |
| `ai.persona.compose(id, options?)` | 生成系统提示词 | `id: string, options?: PersonaScopeOptions` | `string prompt` | `ai.persona.compose("tutor", { objectId: "u1" })` |

#### Persona definitions, updates, and scope

| Input object | Fields | Requirements, defaults, and effect |
| --- | --- | --- |
| `PersonaProfileInput` | `id`, `systemPrompt`, `name`, `objectId`, `traits`, `metadata` | ID and system prompt are required. Display name and metadata are optional, and traits are a string array defaulting to empty. Omit subject for system persona scope |
| `PersonaProfileUpdate` | `name`, `systemPrompt`, `traits`, `metadata` | All optional. Pass the changed fields. Persona ID remains a separate argument |
| `PersonaScopeOptions` | `objectId` | Optional trusted subject. `get/update/remove/list/compose` use this scope and select system persona scope when omitted |

If a system persona and reader-1’s custom persona are both named `guide`, `get('guide', { objectId: 'reader-1' })` reads the reader’s profile. `compose` in that scope combines its system prompt and traits.

#### Scenario: Maintain personas and prompts

Use demo-tutor under one subject; compose returns prompt text without changing model permissions.

```ts
async function usePersona(objectId: string) {
  const access = { objectId }
  // Save demo-tutor with the stated prompt for this subject. Success returns the full profile; return the failed result on storage failure.
  const saveResult = await ai.persona.save({ id: 'demo-tutor', objectId, name: 'Tutor', systemPrompt: 'Explain terms clearly.' })
  if (!saveResult.success)
    return saveResult
  saveResult.data
  // Read the profile ID in the same subject scope. A missing profile returns a failed result.
  const getResult = await ai.persona.get('demo-tutor', access)
  if (!getResult.success)
    return getResult
  getResult.data
  // Rename this subject's demo-tutor to Order tutor and return the updated profile.
  const updateResult = await ai.persona.update('demo-tutor', { name: 'Order tutor' }, access)
  if (!updateResult.success)
    return updateResult
  updateResult.data
  // List profiles for this subject, including the updated profile.
  const profilesResult = await ai.persona.list(access)
  if (!profilesResult.success)
    return profilesResult
  const profiles = profilesResult.data
  // Compose the system prompt for this scoped persona ID. Success gives text; a missing profile fails.
  const promptResult = await ai.persona.compose('demo-tutor', access)
  if (!promptResult.success)
    return promptResult
  const prompt = promptResult.data
  // Remove the example profile for this subject. Success has no data.
  const removeResult = await ai.persona.remove('demo-tutor', access)
  if (!removeResult.success)
    return removeResult
  return { profiles, prompt }
}
```

<a id="token-summary"></a>

### Estimate and compress context: `ai.token`, `summary`, `compress`

Estimate message budgets before summarizing or compressing. Estimates are not exact provider billing counts.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.token.estimateText(text)` | 估算单段 Token | `text: string` | `direct number; estimate, not billing usage` | `ai.token.estimateText("Hello 世界")` |
| `ai.token.estimateMessages(messages)` | 估算消息 Token | `messages: ChatMessage[]` | `direct number including protocol overhead` | `ai.token.estimateMessages(messages)` |
| `ai.summary.generate(messages, options?)` | 生成摘要文本 | `messages: ChatMessage[], options?: SummaryOptions` | `string` | `ai.summary.generate(messages)` |
| `ai.summary.summarize(messages, options?)` | 生成摘要及覆盖信息 | `messages: ChatMessage[], options?: SummaryOptions` | `{ summary, tokenCount, coveredMessages }` | `ai.summary.summarize(messages)` |
| `ai.compress.tryCompress(messages, options?)` | 按预算压缩 | `messages: ChatMessage[], options?: CompressOptions` | `CompressResult: messages and original/compressed token counts` | `ai.compress.tryCompress(messages, { maxTokens: 4000 })` |

#### Summary, budget, and compression fields

Estimation takes a single `text` or ordered `messages`. Summarization and compression take message arrays and use estimated counts for budgets.

| Input object | Fields | Defaults and effect |
| --- | --- | --- |
| `SummaryOptions` | `model`, `temperature`, `systemPrompt`, `previousSummary` | The model follows the summary settings. Temperature defaults to 0.3. Override the instruction or supply a previous summary to incorporate new messages |
| `CompressOptions` | `strategy`, `maxTokens` | Defaults come from [AI settings](../configuration/ai.en.md). `sliding-window` drops the oldest messages, `summary` summarizes older content, and `hybrid` tries windowing before summarization. The budget is in tokens. A value of 0 uses 80% of the model’s budget |
| `CompressOptions` | `preserveSystem`, `preserveLastN`, `summaryModel` | Keep system messages by default. The recent-message count follows settings and the summary model can be overridden. Protected messages over budget return `CONTEXT_BUDGET_EXCEEDED` |

With `{ strategy: 'sliding-window', maxTokens: 100, preserveLastN: 2 }`, success has an estimated `compressedTokens` no greater than 100 and protects the two latest messages.

#### Scenario: Estimate and compress context

```ts
const messages = [{ role: 'user' as const, content: 'Order is pending.' }]
// Estimate tokens for the literal text locally. The result is approximate.
const textTokens = ai.token.estimateText('Order is pending.') // estimate number
// Estimate the one user message above, including message overhead.
const messageTokens = ai.token.estimateMessages(messages) // estimate including message overhead
```

Concrete text and messages produce nonnegative estimates. Summary and compression call real models; options determine summaries and preserved messages.

[Detailed parameters and workflows](ai.md#token-summary)

<a id="contexts"></a>

### Manage sessions and turns: `ai.context`

Create or restore a manager, add messages, chat and persist. Commit voice turns after confirmed delivery.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.context.createManager(options)` | 开始多轮对话 | `options: ContextManagerOptions`. Options require `scope.objectId` and `scope.sessionId`. | `ContextManager` | `ai.context.createManager({ scope: { objectId: "u1", sessionId: "s1" } })` |
| `ai.context.restoreManager(scope, options?)` | 恢复对话 | `scope: InteractionScope, options?: Omit<ContextManagerOptions, 'scope'>` | `ContextManager` | `ai.context.restoreManager({ objectId: "u1", sessionId: "s1" })` |
| `ai.context.listSessions(objectId)` | 列出可恢复会话 | `objectId: string` | `SessionInfo[]` | `ai.context.listSessions("u1")` |
| `ai.context.renameSession(scope, title)` | 修改会话标题 | `scope: InteractionScope, title: string` | `void` | `ai.context.renameSession({ objectId: "u1", sessionId: "s1" }, "订单讨论")` |
| `ai.context.removeSession(scope)` | 删除指定会话 | `scope: InteractionScope` | `void; tombstone prevents scope reuse` | `ai.context.removeSession({ objectId: "u1", sessionId: "s1" })` |
| `manager.addMessage(message)` | 补充对话消息 | `message: ChatMessage` | `Promise<HaiResult<void>>` | `manager.addMessage({ role: "user", content: "你好" })` |
| `manager.getMessages()` | 读取对话快照 | No arguments | `HaiResult<ChatMessage[]>` | `manager.getMessages()` |
| `manager.reload()` | 刷新共享快照 | No arguments | `Promise<HaiResult<void>>` | `manager.reload()` |
| `manager.getTokenUsage()` | 观察上下文预算 | No arguments | `HaiResult<{ current, budget }>` | `manager.getTokenUsage()` |
| `manager.getSummaries()` | 读取摘要 | No arguments | `HaiResult<SummaryResult[]>` | `manager.getSummaries()` |
| `manager.save()` | 持久保存 | No arguments | `Promise<HaiResult<void>>` | `manager.save()` |
| `manager.flush()` | 等待后台记忆写入 | No arguments | `Promise<HaiResult<void>>` | `manager.flush()` |
| `manager.reset(options?)` | 终止并重置对话 | `options?: ContextResetOptions` | `Promise<HaiResult<void>>` | `manager.reset({ preserveSystemPrompt: true })` |
| `manager.getTurns()` | 读取真实轮次 | No arguments | `HaiResult<ConversationTurn[]>` | `manager.getTurns()` |
| `manager.markTurnSpeaking(turnId)` | 记录开始播放 | `turnId: string` | `Promise<HaiResult<void>>` | `manager.markTurnSpeaking(turnId)` |
| `manager.commitTurn(turnId, input?)` | 提交已表达内容 | `turnId: string, input?: CommitTurnInput` | `Promise<HaiResult<void>>` | `manager.commitTurn(turnId, { text: spokenText })` |
| `manager.interruptTurn(turnId, input?)` | 提交打断前内容 | `turnId: string, input?: CommitTurnInput` | `Promise<HaiResult<void>>` | `manager.interruptTurn(turnId, { text: spokenText })` |
| `manager.consolidate(options?)` | 固化长期记忆 | `options?: ConsolidateOptions` | `Promise<HaiResult<{ summary, memories }>>` | `manager.consolidate({ scope: { personaId: "tutor" } })` |
| `manager.chat(message, options?)` | 多轮回答 | `message: string, options?: ContextChatOptions` | `Promise<HaiResult<ContextChatResult>>` | `manager.chat("请继续")` |
| `manager.chatStream(message, options?)` | 多轮流式回答 | `message: string, options?: ContextChatOptions` | `AsyncIterable<ContextStreamEvent>` | `manager.chatStream("请继续")` |

#### Session scope, generation, and commit arguments

| Input object or method | Fields | Defaults, conditions, and effect |
| --- | --- | --- |
| `createManager`, `restoreManager` | `scope`, `systemPrompt`, `model`, `temperature` | The scope requires a server-verified nonempty `objectId` and `sessionId`. Include scope in creation options or pass it separately when restoring. Creation can prepend a system prompt. Model and temperature override generation defaults |
| `ContextManagerOptions` | `turnCommit`, `concurrency` | Default `auto` commits the full generated text. `manual` returns a pending turn. Default `reject` reports `CONTEXT_BUSY` with an active turn in the same scope. `queue` waits for the prior turn to end and supports cancellation |
| `ContextManagerOptions` | `compress` | [Compression options](#token-summary) override defaults. `auto` defaults to `true`. Set `false` to skip automatic compression |
| `ContextManagerOptions.memory` | `enable`, `enableExtract`, `scope`, `types`, `minImportance` | Injection and automatic extraction have separate switches, both off by default. The remaining fields apply business scope, type, and importance filters to [memory operations](#memory) |
| `ContextManagerOptions.memory` | `topK`, `maxTokens`, `position`, `extractionModel`, `extractionSystemPrompt` | The first three control injection count, estimated token budget, and placement. The last two override the model and instruction for automatic extraction |
| `ContextManagerOptions` | `rag`, `reasoning`, `tools`, `maxToolRounds` | RAG and reasoning are disabled by default. Set `enable` and use `sources/topK/minScore/enableRerank/rerankModel` from [RAG](#rag) or `strategy/maxRounds` from [reasoning](#reasoning). Supply an [authorized tool registry](tools.en.md#registry). Tool rounds default to 10 |
| `manager.chat/chatStream` | `message`, `model`, `temperature`, `enablePersist`, `signal` | Require the user text. Override the model and temperature for this turn or cancel generation. `enablePersist` defaults to off for internal LLM history while the manager owns context persistence |
| `commitTurn/interruptTurn`, `markTurnSpeaking` | `turnId`, `input.text` | Use the current turn ID. Supply the text actually played or displayed. Omission commits the full generated text for commit and an empty string for interrupt. The speaking marker takes just the turn ID |
| `reset` | `preserveSystemPrompt`, `cancelActiveTurn`, `waitForMemoryTasks` | Default to `true`, `true`, and `false`, respectively. With waiting enabled, a background memory failure preserves current context |
| `consolidate` | `scope`, `types`, `model`, `extractionSystemPrompt` | Optionally set a lasting memory scope, types, summarization and extraction model, and extraction instruction. Omission uses the manager’s memory scope |
| `listSessions/renameSession/removeSession`, `addMessage` | `objectId`, `scope`, `title`, `message` | Listing requires a trusted subject ID. Rename and remove require the full session scope, and rename also takes a new title. Append a `ChatMessage`, such as `{ role: 'user', content: 'What is the shipping fee?' }` |

For example, `turnCommit: 'manual'` generates “It should arrive tomorrow. Watch for an update.” If playback stops after “It should arrive tomorrow,” call `interruptTurn(turnId, { text: 'It should arrive tomorrow' })`. A successful commit leaves the played text in context.

#### Scenario: Manage sessions and turns

Several requests or nodes may share one scope. This shows chat generation and persistence; streamed audio uses prepareTurn / commitTurn to retain what was actually played.

![Context manager: committing one turn](../images/function-ai-context-turn.en.svg)

Execution ownership precedes turn mutation, and final writes still verify version and deadline. reject returns busy; queue waits. Memory extraction may continue in the background. Check save/flush results: generation completion does not prove persistence or memory success.

Factories and manager methods below connect messages, budget, chat, save/flush, reload/reset and turn commits. Session listing, renaming and deletion address persisted data, not an automatically managed background service.

[Detailed parameters and workflows](ai.md#contexts)

<a id="files"></a>

### Parse text and files: `ai.file`

Node runs installed PDF and DOCX parsers in a Worker and offloads large HTML extraction. A local parser failure can fall back to OCR. The video tool validates and unpacks captures and compresses its render project in a Worker. The managed job renders the video.

Validate file type and size before extracting text; OCR formats require configured models.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.file.parse(request)` | 识别文件并提取 | `request: FileParseRequest` (`signal` optional) | `FileParseResult; extraction is not HTML sanitization` | `ai.file.parse({ content: "<p>正文</p>", filename: "intro.html" })` |
| `ai.file.parseText(content, filename?)` | 直接提取文本 | `content: Uint8Array \| string, filename?: string` | `string` | `ai.file.parseText("Hello", "intro.txt")` |

#### File content and parsing options

| Field | Requirements, defaults, and effect |
| --- | --- |
| `content`, `filename` | Content is required. Use a string for text and `Buffer` for binary data. An optional filename assists MIME detection. `parseText` takes just these two direct arguments and returns parsed text |
| `options.mimeType`, `options.useOcr` | Set a MIME type to override detection. `useOcr: true` sends supported input to a vision model, subject to file type |
| `options.model`, `options.systemPrompt` | Take effect for OCR. Omission uses the OCR scenario model and the configured or built-in file prompt |
| `options.maxPages`, `options.outputFormat` | Native PDF parsing can limit pages and defaults to all. Output defaults to `text`. Use `markdown` to retain headings and similar structure in supported parsers |

For example, parse `'<h1>Title</h1><p>Body</p>'` as `guide.html` with `{ outputFormat: 'markdown' }`. Success returns `method: 'html'` and preserves the heading as Markdown.

#### Scenario: Parse text and files

```ts
// Fragment inside an async application function; return failed results to its caller.
// Parse the supplied order-status text into the common document result. Return the failed result on a parse error.
const plainResult = await ai.file.parseText('Order status: pending.')
if (!plainResult.success)
  return plainResult
const plain = plainResult.data // parsed text result
```

parse takes a file input and parseText takes text. Outputs carry text and metadata for later chunking/indexing. Unsupported formats or read failures stop ingestion.

[Detailed parameters and workflows](ai.md#files)

<a id="bounded-local-files"></a>

For private attachments use `options.mode: "local"`. Install `pdfjs-dist` for PDF and `mammoth` for DOCX. Local parsing runs in a Node worker and is available before AI initialization. The regular mode retains OCR fallback. Local defaults are 4 MiB per file, 100 PDF pages, 512 DOCX entries and 24 MiB expanded, 12,000 UTF-16 code units of text, and 20 seconds. Page or text truncation returns an ellipsis and `metadata.truncated: true`. Oversized input, empty text, timeout, cancellation, and a busy parser return failures.

```ts
import { ai } from '@h-ai/ai'

// Parse the supplied private text in Node without AI init. Inspect the HaiResult before reading the body.
const parsed = await ai.file.parse({
  content: new TextEncoder().encode('Internal review'),
  filename: 'review.txt',
  options: { mode: 'local', maxInputBytes: 1024, timeoutMs: 5000 },
})
if (parsed.success) {
  const body = parsed.data.text // "Internal review"
}
else {
  const errorCode = parsed.error.code
}
```

<a id="reasoning"></a>

### Run multi-step reasoning: `ai.reasoning`

Use an explicit reasoning request for complex tasks and consume final results or stream events under host tool authorization.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.reasoning.run(query, options?)` | 多步骤求解 | `query: string, options?: ReasoningOptions` | `ReasoningResult` | `ai.reasoning.run("审查方案", { strategy: "cot" })` |
| `ai.reasoning.runStream(query, options?)` | 观察推理过程 | `query: string, options?: ReasoningOptions` | `AsyncIterable<ReasoningStreamEvent>` | `ai.reasoning.runStream("审查方案", { strategy: "react" })` |

#### Reasoning options

| Field | Defaults and effect |
| --- | --- |
| `query`, `options.strategy`, `maxRounds` | Question string is required. Default strategy is `react`. Choose `cot` for one generation or `plan-execute` for planning followed by execution. Iterative rounds default to a limit of 10 |
| `model`, `planModel`, `executeModel` | Override the reasoning model. Planning and execution overrides only apply to `plan-execute` and fall back to `model`, the stage’s model, then the reasoning model |
| `systemPrompt`, `messages`, `temperature` | Override the strategy prompt, insert history before the current question, and set sampling temperature |
| `objectId`, `sessionId`, `enablePersist` | Optional trusted subject and session. Internal LLM recording is allowed by default. Disable it when context already records the turn |
| `tools`, `signal` | `react` and `plan-execute` accept an authorized tool registry. Pass a signal to cancel waiting and generation |

For `{ strategy: 'cot', enablePersist: false }`, the question goes through one strategy call and success contains the generated answer. This example needs no tool registry.

#### Scenario: Run multi-step reasoning

run takes a problem/options and returns a reasoning result. runStream yields events; text and order depend on the model and iteration failures must be reported.

[Detailed parameters and workflows](ai.md#reasoning)

<a id="audio"></a>

### Transcribe and synthesize audio: `ai.audio`

Inspect model capabilities before choosing complete or streaming audio. Browser WebSockets authenticate with server-issued short-lived tickets.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.audio.transcribe(request)` | 识别完整音频 | `request: TranscriptionRequest` | `TranscriptionResult: text, language?, segments?` | `ai.audio.transcribe({ audio: { data: wavBytes, format: "wav" } })` |
| `ai.audio.transcribeStream(request)` | 持续语音识别 | `request: TranscriptionStreamRequest`. Provide complete audio or an audio chunk stream. | `AsyncIterable<TranscriptionEvent>` | `ai.audio.transcribeStream(transcriptionInput)` |
| `ai.audio.synthesize(request)` | 合成完整语音 | `request: SynthesisRequest` | `SynthesisResult: audio and duration metadata` | `ai.audio.synthesize({ text: "你好" })` |
| `ai.audio.synthesizeStream(request)` | 按段合成 | `request: SynthesisStreamRequest`. Provide text or a stream of asynchronous text segments. | `AsyncIterable<SynthesisEvent>` | `ai.audio.synthesizeStream(synthesisInput)` |
| `ai.audio.getCapabilities(request)` | 先检查模型能力 | `request: AudioCapabilitiesRequest`. Choose `transcribe` or `synthesize` for `operation` and optionally select a model. | `AudioModelCapabilities` | `ai.audio.getCapabilities({ operation: "synthesize" })` |
| `ai.audio.models.list()` | 列出合并清单 | No arguments | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.audio.models.list()` |
| `ai.audio.models.get(id)` | 读取来源和版本 | `id: string` | `HaiResult<AIResourceEntry> with value/source/version?` | `ai.audio.models.get("speech")` |
| `ai.audio.models.register(input)` | 登记数据库定义 | `input: z.input<typeof AudioModelEntrySchema>` | `HaiResult<AIResourceEntry>; config entries are read-only` | `ai.audio.models.register(audioModelDefinition)` |
| `ai.audio.models.update(input, expectedVersion?)` | 按版本替换定义 | `input: z.input<typeof AudioModelEntrySchema>, expectedVersion?: string` | `HaiResult<AIResourceEntry>; full replacement, conflict fails` | `ai.audio.models.update(audioModelDefinition, current.version)` |
| `ai.audio.models.remove(id, expectedVersion?)` | 删除数据库定义 | `id: string, expectedVersion?: string` | `HaiResult<void>; external files/services are retained` | `ai.audio.models.remove("speech", current.version)` |

#### Transcription, synthesis, and capability fields

| Input object | Fields | Requirements, defaults, and conditions |
| --- | --- | --- |
| `AudioContent`, `AudioInputStream` | `data` or `chunks`, `format`, `sampleRate`, `channels` | Require complete bytes or an async byte stream and encoding. Formats are `pcm16/wav/mp3/opus`. Streamed input and raw PCM require a sample rate in Hz. Channels are 1 or 2 and default to 1 |
| `TranscriptionOptions` | `language`, `contextHints`, `timestampGranularities`, `vad` | Optional language hint, vocabulary, timestamp granularity, and voice activity detection. Omitted language uses model detection. Timestamp granularities are `segment` or `word`. Check model capabilities |
| `SynthesisRequest`, `SynthesisStreamRequest` | `text` | Full synthesis takes a string. Streaming takes `{ id, text }` or an async sequence of segments. Each ID correlates audio events |
| `SynthesisOptions` | `language`, `voice`, `speakerReference`, `styleReference`, `styleStrength`, `instruction` | Optional language, voice, identity and style references, strength, and instruction. A reference has `audio` and optional `transcript/language`. Strength ranges from 0 to 1. An omitted voice uses the model default |
| `SynthesisOptions` | `speed`, `format`, `sampleRate` | Speed is a multiplier with 1 as normal. Output format defaults to the model’s format. An optional sample rate is in Hz |
| Full synthesis only | `targetDurationMs`, `durationToleranceMs` | Target is a positive integer in ms. Tolerance is a nonnegative integer in ms and requires a target. Target is mutually exclusive with `speed` and requires model support |
| Transcription and synthesis options | `model`, `strictCapabilities`, `signal` | Omitted model uses the operation’s configuration. Strict mode is off by default. With it on, unsupported advanced capabilities fail before the request. Pass a signal to cancel |
| `AudioCapabilitiesRequest` and `models` resources | `operation`, `model`, definition, and version | Choose `transcribe` or `synthesize` for capability queries, with optional model. See [AI settings](../configuration/ai.en.md) for model definition fields. Use the version read from the model registry |
| `ai.blobToWav` | Convert browser audio | `blob: Blob, options?: AudioWavOptions` | `Promise<Blob>`, audio/wav; rejects on invalid input | `ai.blobToWav(blob, { maxDurationSeconds: 30 })` |
| `ai.createAudioRecorder` | Manage microphone recording | `audio?, encoding?, timesliceMs?, maxDurationSeconds?, maxInputBytes?, onStop, onError?` | Browser recorder with `start/stop/snapshot/close` | `ai.createAudioRecorder({ onStop })` |

For example, transcribe prepared audio with `{ timestampGranularities: ['word'], strictCapabilities: true }`. A supporting model can return word times in milliseconds. An unsupported model returns a capability error before dispatch.

#### Scenario: Transcribe and synthesize audio

ASR takes real audio bytes and TTS text, returning transcription or formatted audio. Stream methods yield events/bytes. Model CRUD uses stable names; credential checks are described in lifecycle.

[Detailed parameters and workflows](ai.md#audio)


<a id="browser-recording"></a>

#### Scenario: Record and convert browser audio

Request microphone access from a user action. The application can transcribe snapshots during recording or wait for the final Blob from `onStop`. Call `close()` on cancellation or unmount to release tracks and discard the session.

```ts
import { ai } from '@h-ai/ai/client'

function setupRecording(onReady: (wav: Blob) => void, onError: (error: unknown) => void) {
  // Create a session with a 30-second stop and a 1 MiB encoded-size limit. No tracks are opened until start().
  const recorder = ai.createAudioRecorder({
    maxDurationSeconds: 30,
    maxInputBytes: 1_048_576,
    onError,
    onStop(recorded) {
      // Convert the complete Blob to mono PCM16. A delayed final chunk is trimmed to 30 seconds.
      void ai.blobToWav(recorded, { maxInputBytes: 1_048_576, maxDurationSeconds: 30, overflow: 'truncate' })
        .then(onReady, onError)
    },
  })
  return {
    // Request microphone permission and start. A denied request rejects.
    start: () => recorder.start(),
    // End normally. onStop receives the recording including its final data.
    stop: () => recorder.stop(),
    // Discard the recording and release microphone tracks on cancel or unmount.
    cancel: () => recorder.close(),
  }
}
```

The browser checks Blob size before decoding and duration after decoding. The default sample rate is 16000 Hz. Use `ai.blobToWav(recorded, { sampleRate: 8000 })` to select 8000 Hz. A duration limit rejects by default. Set `overflow: "truncate"` to keep the beginning. Validate uploaded audio on the server.

#### Scenario: Maintain a stored definition

Supply a validated complete definition with an unused demo ID. File-backed entries are read-only. get supplies the version, update replaces the full definition, and remove retains external resources.

```ts
async function maintain_audio_models(definition: Parameters<typeof ai.audio.models.register>[0]) {
  // Persist the supplied audio model definition and get its database version. Duplicate or configuration-owned IDs fail.
  const createdResult = await ai.audio.models.register(definition)
  if (!createdResult.success)
    return createdResult
  const created = createdResult.data
  // List configured and database audio model entries without arguments. Configuration takes precedence for duplicate IDs; the newly registered entry appears here.
  const listedResult = await ai.audio.models.list()
  if (!listedResult.success)
    return listedResult
  const listed = listedResult.data
  // Look up the saved audio model ID and its database version. A missing ID fails.
  const currentResult = await ai.audio.models.get(definition.id)
  if (!currentResult.success)
    return currentResult
  const current = currentResult.data
  // Replace this audio model definition using the observed version and get the new version. Stale versions and configuration-owned entries fail.
  const updatedResult = await ai.audio.models.update(definition, current.version)
  if (!updatedResult.success)
    return updatedResult
  const updated = updatedResult.data
  // Delete the example audio model entry against its latest version. Success has no data; a conflict or config-owned entry fails.
  const removeResult = await ai.audio.models.remove(definition.id, updated.version)
  if (!removeResult.success)
    return removeResult
  return { created, listed, updated } // entries include value/source and database version
}
```

<a id="images"></a>

### Generate images and manage models: `ai.image`

Generate images from prompts and configured models. Successful results contain image bytes and MIME types; the application stores and displays them.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.image.generate(request)` | 生成或参考图片 | `request: GenerateImageRequest` | `{ images: GeneratedImage[] } with bytes/MIME` | `ai.image.generate({ prompt: "一座灯塔" })` |
| `ai.image.models.list()` | 列出合并清单 | No arguments | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.image.models.list()` |
| `ai.image.models.get(id)` | 读取来源和版本 | `id: string` | `HaiResult<AIResourceEntry> with value/source/version?` | `ai.image.models.get("poster")` |
| `ai.image.models.register(input)` | 登记数据库定义 | `input: z.input<typeof ImageModelEntrySchema>` | `HaiResult<AIResourceEntry>; config entries are read-only` | `ai.image.models.register(imageModelDefinition)` |
| `ai.image.models.update(input, expectedVersion?)` | 按版本替换定义 | `input: z.input<typeof ImageModelEntrySchema>, expectedVersion?: string` | `HaiResult<AIResourceEntry>; full replacement, conflict fails` | `ai.image.models.update(imageModelDefinition, current.version)` |
| `ai.image.models.remove(id, expectedVersion?)` | 删除数据库定义 | `id: string, expectedVersion?: string` | `HaiResult<void>; external files/services are retained` | `ai.image.models.remove("poster", current.version)` |

#### Image request fields

| Field | Requirements, defaults, and conditions |
| --- | --- |
| `prompt`, `model` | Text prompt is required. Omitted model uses image generation settings |
| `size` | Optional `{ width, height }` in positive integer pixels. Supported dimensions vary by model. Omission lets the model choose |
| `referenceImages` | Optional array. Each entry has nonempty `data: Uint8Array` and an `image/*` MIME type. See [AI settings](../configuration/ai.en.md) for count and byte limits, default 4 images and 20 MiB each |
| `signal` | Cancels the provider request and image downloads. The model timeout covers the whole operation |
| `models` definition, ID, and version | Register and replace using image model settings. Read or remove by ID. Update and removal can use the previously read database version as a condition |

For `{ prompt: 'A lighthouse in black-and-white line art', size: { width: 1024, height: 1024 } }` with a supporting model, success contains the generated image bytes and MIME type.

#### Scenario: Generate images and manage models

generate takes a prompt and returns image data with model information. Format, size and storage prerequisites follow. Model management does not generate images.

[Detailed parameters and workflows](ai.md#images)


#### Scenario: Maintain a stored definition

Supply a validated complete definition with an unused demo ID. File-backed entries are read-only. get supplies the version, update replaces the full definition, and remove retains external resources.

```ts
async function maintain_image_models(definition: Parameters<typeof ai.image.models.register>[0]) {
  // Persist the supplied image model definition and get its database version. Duplicate or configuration-owned IDs fail.
  const createdResult = await ai.image.models.register(definition)
  if (!createdResult.success)
    return createdResult
  const created = createdResult.data
  // List configured and database image model entries without arguments. Configuration takes precedence for duplicate IDs; the newly registered entry appears here.
  const listedResult = await ai.image.models.list()
  if (!listedResult.success)
    return listedResult
  const listed = listedResult.data
  // Look up the saved image model ID and its database version. A missing ID fails.
  const currentResult = await ai.image.models.get(definition.id)
  if (!currentResult.success)
    return currentResult
  const current = currentResult.data
  // Replace this image model definition using the observed version and get the new version. Stale versions and configuration-owned entries fail.
  const updatedResult = await ai.image.models.update(definition, current.version)
  if (!updatedResult.success)
    return updatedResult
  const updated = updatedResult.data
  // Delete the example image model entry against its latest version. Success has no data; a conflict or config-owned entry fails.
  const removeResult = await ai.image.models.remove(definition.id, updated.version)
  if (!removeResult.success)
    return removeResult
  return { created, listed, updated } // entries include value/source and database version
}
```

<a id="acp"></a>

### Manage agents, workspaces and ACP sessions: `ai.acp`

Bind trusted identity, register agents/workspaces and create sessions. Verify approved snapshots and patches before repository publication.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.acp.scoped(scope)` | 给当前工作区或用户创建限定范围的 Agent API | `scope: RunnerScope`. The application supplies the scope from the authenticated identity. | `plan`; `sessions`; `tasks`; `approvals` | `const agent = ai.acp.scoped(identity)` |
| `scoped.tasks.findSubmission(sessionId, idempotencyKey)` | Recover an accepted turn receipt | `sessionId: string, idempotencyKey: string`. Use the original session and the idempotency key from the submission. | `HaiResult<{ taskId, status }\|null>` with `null` when no execution is found | `await scoped.tasks.findSubmission(sessionId, turnKey)` |
| `ai.acp.agents.list()` | 列出合并清单 | No arguments | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.acp.agents.list()` |
| `ai.acp.agents.get(id)` | 读取来源和版本 | `id: string` | `HaiResult<AIResourceEntry> with value/source/version?` | `ai.acp.agents.get("coder")` |
| `ai.acp.agents.register(input)` | 登记数据库定义 | `input: z.input<typeof ACPAgentSchema>` | `HaiResult<AIResourceEntry>; config entries are read-only` | `ai.acp.agents.register(agentDefinition)` |
| `ai.acp.agents.update(input, version?)` | 按版本替换定义 | `input: z.input<typeof ACPAgentSchema>, version?: string` | `HaiResult<AIResourceEntry>; full replacement, conflict fails` | `ai.acp.agents.update(agentDefinition, current.version)` |
| `ai.acp.agents.remove(id, version?)` | 删除数据库定义 | `id: string, version?: string`. Removal requires the agent to have no session references. | `HaiResult<void>; external files/services are retained` | `ai.acp.agents.remove("coder", current.version)` |
| `ai.acp.workspaces.list()` | 列出合并清单 | No arguments | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.acp.workspaces.list()` |
| `ai.acp.workspaces.get(id)` | 读取来源和版本 | `id: string` | `HaiResult<AIResourceEntry> with value/source/version?` | `ai.acp.workspaces.get("project")` |
| `ai.acp.workspaces.register(input)` | 登记数据库定义 | `input: z.input<typeof ACPWorkspaceSchema>` | `HaiResult<AIResourceEntry>; config entries are read-only` | `ai.acp.workspaces.register(workspaceDefinition)` |
| `ai.acp.workspaces.update(input, version?)` | 按版本替换定义 | `input: z.input<typeof ACPWorkspaceSchema>, version?: string` | `HaiResult<AIResourceEntry>; full replacement, conflict fails` | `ai.acp.workspaces.update(workspaceDefinition, current.version)` |
| `ai.acp.workspaces.remove(id, version?)` | 删除数据库定义 | `id: string, version?: string`. Removal requires the workspace to have no session references. | `HaiResult<void>; external files/services are retained` | `ai.acp.workspaces.remove("project", current.version)` |
| `ai.acp.agents.initialize(id, modelId?)` | 预检适配器配置 | `id: string, modelId?: string` | `HaiResult<{ agentId, mode, modelIds }>; no credentials` | `ai.acp.agents.initialize("coder")` |
| `ai.acp.agents.check(id, options?)` | 实际连接并握手 | `id: string, options?: ACPClientOptions & { workspaceId?: string }` | `HaiResult<native initialize response>; owned connection is closed` | `ai.acp.agents.check("coder", { workspaceId: "project" })` |
| `ai.acp.workspaces.prepare(id)` | 准备工作目录 | `id: string` | `HaiResult<main absolute path>; dirty content is retained` | `ai.acp.workspaces.prepare("project")` |
| `ai.acp.workspaces.importFiles(id, files)` | 导入受控文件 | `id: string, files: Array<{ path: string, content: string \| Uint8Array }>`. Each file path is relative to the workspace. | `HaiResult<{ imported: string[] }>; no overwrite` | `ai.acp.workspaces.importFiles("project", [{ path: "notes.txt", content: "需求" }])` |
| `ai.acp.sessions.create(options)` | 启动受管开发会话 | `options: ACPCreateSessionOptions` | `HaiResult<managed session handle>` | `ai.acp.sessions.create({ agentId: "coder", workspaceId: "project", newWorktree: true })` |
| `ai.acp.sessions.get(id)` | 读取会话句柄 | `id: string` | `HaiResult<managed session handle>; does not resume` | `ai.acp.sessions.get("task-1")` |
| `ai.acp.sessions.list(workspaceId?)` | 查询受管会话 | `workspaceId?: string` | `HaiResult<ACPSessionInfo[]>` | `ai.acp.sessions.list("project")` |
| `ai.acp.sessions.resume(id, options?)` | Resume or reopen the native session | `id: string, options?: ACPClientOptions & { restartNative?: boolean }`. `restartNative` defaults to `false`. | `HaiResult` with a session handle. Changed definitions, an invalid worktree or a busy session can prevent recovery | `ai.acp.sessions.resume("task-1")` |
| `ai.acp.sessions.close(id)` | 停止拥有的执行环境 | `id: string` | `HaiResult<void>; source and native history retained` | `ai.acp.sessions.close("task-1")` |
| `ai.acp.sessions.reclaimWorktree(id)` | 回收干净检出目录 | `id: string`. Close the session, stop its preview, and save its changes before reclaiming the worktree. | `HaiResult<void>; branch and normal files retained` | `ai.acp.sessions.reclaimWorktree("task-1")` |
| `ai.acp.sessions.remove(id)` | 移除会话记录 | `id: string`. Pass the framework ID of a closed or failed session. | `HaiResult<void>; worktree and native history retained` | `ai.acp.sessions.remove("task-1")` |
| `ai.acp.connect(transport, options?)` | 接入原生传输 | `transport: ACPTransport, options?: ACPClientOptions`. The transport is `stdio`, `http`, or `ws`. | `HaiResult<connection handle>` | `ai.acp.connect({ type: "http", url: "https://agent.example.com/acp" })` |
| `ai.acp.close()` | 关闭子系统 | No arguments. Applications usually close the full lifecycle with `ai.close()`. | `Promise<void>; cleanup may throw` | `ai.acp.close()` |
| `session.info()` | 读取受管会话 | No arguments | `Promise<HaiResult<ACPSessionInfo>>` | `session.info()` |
| `session.prompt(content, signal?)` | 执行一轮开发 | `content: ContentBlock[], signal?: AbortSignal` | `Promise<HaiResult<{ text, stopReason, events }>>` | `session.prompt([{ type: "text", text: "检查工程" }])` |
| `session.promptStructured(content, schema, signal?)` | 校验一份 JSON | `content: ContentBlock[], schema: z.ZodType<T>, signal?: AbortSignal` | `Promise<HaiResult<schema-inferred T>>` | `session.promptStructured(content, OutputSchema)` |
| `session.stream(content, signal?)` | 观察原生事件 | `content: ContentBlock[], signal?: AbortSignal` | `AsyncIterable<SessionNotification>; failure throws` | `session.stream([{ type: "text", text: "检查工程" }])` |
| `session.cancel()` | 取消当前轮次 | No arguments | `Promise<HaiResult<void>>` | `session.cancel()` |
| `session.setMode(mode)` | 选择已公布模式 | `mode: string` | `Promise<HaiResult<native mode response>>` | `session.setMode("code")` |
| `session.setConfigOption(key, value)` | 设置已公布选项 | `key: string, value: string` | `Promise<HaiResult<native config response>>` | `session.setConfigOption("model", "coding")` |
| `session.updateMain()` | 仅快进更新主分支 | No arguments. Execution and preview must be stopped. | `Promise<HaiResult<ACPGitReport[]>>; partial failure reports in cause` | `session.updateMain()` |
| `session.publish(request)` | 提交并推送 | `request: z.input<typeof ACPPublishSchema>`. Provide `mode`, `message`, and `author` from a managed isolated session. | `Promise<HaiResult<ACPGitReport[]>>` | `session.publish(publishOptions)` |
| `session.close()` | 停止执行保留状态 | No arguments | `Promise<HaiResult<void>>` | `session.close()` |
| `connection.authenticate(method)` | 原生认证 | `method: string`. Use an authentication method ID advertised in the handshake. | `Promise<HaiResult<native auth response>>` | `connection.authenticate("api-key")` |
| `connection.createSession(cwd, mcpServers?)` | 创建低层原生会话 | `cwd: string, mcpServers?: McpServer[]`. `cwd` is the absolute directory visible to the peer. | `Promise<HaiResult<{ id, prompt, cancel }>>` | `connection.createSession("/workspace/project", [])` |
| `connection.listSessions(cursor?)` | 原生分页会话 | `cursor?: string` | `Promise<HaiResult<native paginated response>>` | `connection.listSessions()` |
| `connection.deleteSession(id)` | 删除原生会话 | `id: string` | `Promise<HaiResult<native delete response>>` | `connection.deleteSession(nativeId)` |
| `connection.close()` | 关闭低层连接 | No arguments | `Promise<HaiResult<void>>` | `connection.close()` |
| `ai.acp.registerManagedExecutors()` | Register managed ACP executors with Runner | No arguments. Normal initialization registers the executors. | `void` | `ai.acp.registerManagedExecutors()` |
| `ai.acp.workspaces.readGitSnapshot(input, signal?)` | Read a workspace Git snapshot | `input: { directory: string, revision: string, maxBytes?: number }, signal?: AbortSignal`. Pass an authorized repository’s absolute directory and commit reference. `maxBytes` defaults to 16 MiB. | `Promise<HaiResult<ACPProjectSnapshot>>` | `await ai.acp.workspaces.readGitSnapshot({ directory, revision })` |
| `ai.acp.workspaces.diffSnapshot(before, after, signal?)` | Compare workspace snapshots | `before: Record<string, string>, after: Record<string, string>, signal?: AbortSignal`. Both snapshot maps associate relative paths with Base64 file content. | `Promise<HaiResult<ACPProjectChanges>>` | `await ai.acp.workspaces.diffSnapshot(before, after)` |
| `ai.acp.workspaces.publishSnapshot(input, signal?)` | Publish an approved workspace snapshot | `input: ACPPublishSnapshot, signal?: AbortSignal`. Input includes the source directory, remote, base commit, approved patch, task branch, date, and author. | `Promise<HaiResult<{ branch: string, commit: string }>>` | `await ai.acp.workspaces.publishSnapshot(approvedSnapshot)` |

#### Connection, session, and workspace arguments

| Input object or method | Fields | Defaults, conditions, and effect |
| --- | --- | --- |
| `ACPTransport` | `type`, `command/args/cwd/env`, `url/headers` | `stdio` requires a command and accepts argument array, working directory, and temporary environment. `http` or `ws` requires the matching URL and accepts per-connection authentication headers |
| `ACPClientOptions` | `onEvent`, `handlers`, `capabilities`, `signal` | All optional. Events include notifications before creation finishes. A throwing callback closes the connection. Declare only capabilities implemented by the host. The default permission response is denial. The signal cancels connection setup; turns have separate signals |
| `agents.initialize/check`, `workspaces.prepare/importFiles` | `id`, `modelId`, `options.workspaceId`, `files` | Use the registered agent or workspace ID. Select a model for preflight or a workspace and connection callbacks for the handshake test. Import files as `{ path, content }[]`, with workspace-relative paths and string or `Uint8Array` content |
| `ACPCreateSessionOptions` | `id`, `agentId`, `workspaceId`, `repositoryId`, `cwd` | Requires an agent. Omitted session ID becomes a UUID. Managed mode requires a workspace and derives the directory, optionally using a registered repository root. Custom remote mode takes an absolute `cwd` visible to the peer |
| `ACPCreateSessionOptions` | `newWorktree`, `branch`, `modelId`, `mcpServers`, `mcpServerIds` | `newWorktree` defaults to `false`. With it enabled, the default branch is `acp/<session ID>`. The model must be in the agent’s `modelIds`. Combine native MCP definitions with registered service IDs and the connection options above |
| `sessions.get/list/resume/close/reclaimWorktree/remove` | `id`, `workspaceId`, `options.restartNative` | Use the framework session ID. List can filter by workspace. Resume preserves native history by default. Restart is for a trusted host holding exclusive execution rights that has confirmed the first turn was never sent |
| `session.prompt/promptStructured/stream` | `content`, `schema`, `signal` | Native content blocks are required, for example `[{ type: 'text', text: 'List the document headings' }]`. Structured prompting also requires a Zod schema that validates the parsed text. The optional turn signal cancels generation |
| `session.setMode/setConfigOption`, `connection.authenticate/createSession/listSessions/deleteSession` | `mode`, `key/value`, `method`, `cwd`, `mcpServers`, `cursor`, `id` | Mode, option key and value, and authentication method come from the peer’s advertised choices. Native session creation uses a peer-visible absolute directory and optional MCP server array. Pagination uses the previous cursor. Deletion takes the native session ID |
| `session.publish`, `workspaces.publishSnapshot` | Session publication request, `ACPPublishSnapshot` | Session publication takes `mode` (`merge-main` or `push-branch`), commit message, and author. Snapshot publication takes a source directory, remote, base commit, approved patch, task branch, date, and author. Call after publication has been authorized |
| Resource `get/register/update/remove` | `id`, definition, `version` | Look up by ID. See [ACP settings](../configuration/ai.en.md) for agent and workspace fields. Update and removal can use the database version just read. A definition with session references cannot be removed |

For example, use `{ agentId: 'editor', workspaceId: 'manual', newWorktree: true }` with an initialized test configuration. After creation succeeds, call `info()` on the returned handle to read the framework session ID, branch, and directory.

#### Scenario: Manage agents, workspaces and ACP sessions

Managed ACP connects application identity, durable Runner tasks and the native agent. plan describes resources without allocating a container.

![Managed ACP: acceptance, execution and results](../images/function-ai-acp-task.en.svg)

submit returns a resumable receipt; run waits for its result. Acceptance is not completion. After disconnect, use the same identity and taskId for events/get. Cancellation requires checking execution and cleanup; publishing a patch requires renewed authorization and user approval.

If the submission response is lost, load the original session ID and idempotency key from durable storage and call `tasks.findSubmission`. It also restores the receipt index. Use the returned `taskId` to read events, check status or request cancellation. A `null` result means no execution record is currently available and the application can keep the turn pending verification.

The workflow covers resource CRUD, preparation, sessions and returned handles. Identity comes from the server. updateMain/publish mutate repositories; documentation checks do not publish anything.

Use `ai.acp.sessions.resume(id)` to recover the original native history. Agent definitions are compared by JSON content regardless of object key order. After a preparation interruption, a trusted server that holds the task execution lease can use `ai.acp.sessions.resume(id, { restartNative: true })` if durable task state proves the first turn was never sent. Once the old execution environment has stopped and the Git worktree has been verified, the new native session uses the original framework session ID, directory, branch and files. Use default recovery if the first turn was sent or its dispatch status is uncertain.

[Detailed parameters and workflows](ai.md#acp)

#### Scenario: Preview a Git change before publication

Run this on Node.js after authorizing the absolute repository directory and revision. The sample revision has no `notes.txt`. Reading and comparing snapshots produces a patch without changing or pushing the source repository.

```ts

import { type ACPPublishSnapshot, ai } from '@h-ai/ai'

async function previewChange(directory: string, revision: string) {
  // Read a snapshot for the supplied directory and Git revision, including the resolved revision. A read failure returns an error.
  const snapshot = await ai.acp.workspaces.readGitSnapshot({ directory, revision })
  if (!snapshot.success)
    return snapshot
  const before = snapshot.data.files
  const after = { ...before, 'notes.txt': 'aGVsbG8K' }
  // Compare the snapshot with the copy containing notes.txt. Success gives changed paths and a Git patch; diff failure returns an error.
  const changes = await ai.acp.workspaces.diffSnapshot(before, after)
  if (!changes.success)
    return changes
  return { revision: snapshot.data.revision, ...changes.data }
}

async function publishApprovedChange(approvedSnapshot: ACPPublishSnapshot) {
  // Publish the approved snapshot to its authorized branch. Success returns branch and commit IDs; publication failure returns an error.
  const result = await ai.acp.workspaces.publishSnapshot(approvedSnapshot)
  if (!result.success)
    return result
  return result.data
}
```

The Base64 value decodes to `hello` plus a newline. Preview returns the resolved revision, `paths: ['notes.txt']` and its Git patch. Call the second function only after rechecking authorization and obtaining approval for the exact remote, `agent/` branch and patch. Publication returns the branch and actual commit ID; on failure inspect the remote before retrying. Normal `ai.init(..., { runner })` already calls `ai.acp.registerManagedExecutors()`.


#### Scenario: Maintain a stored definition

Supply a validated complete definition with an unused demo ID. File-backed entries are read-only. get supplies the version, update replaces the full definition, and remove retains external resources.

```ts
async function maintain_acp_agents(definition: Parameters<typeof ai.acp.agents.register>[0]) {
  // Persist the supplied ACP agent definition and get its database version. Duplicate or configuration-owned IDs fail.
  const createdResult = await ai.acp.agents.register(definition)
  if (!createdResult.success)
    return createdResult
  const created = createdResult.data
  // List configured and database ACP agent entries without arguments. Configuration takes precedence for duplicate IDs; the newly registered entry appears here.
  const listedResult = await ai.acp.agents.list()
  if (!listedResult.success)
    return listedResult
  const listed = listedResult.data
  // Look up the saved ACP agent ID and its database version. A missing ID fails.
  const currentResult = await ai.acp.agents.get(definition.id)
  if (!currentResult.success)
    return currentResult
  const current = currentResult.data
  // Replace this ACP agent definition using the observed version and get the new version. Stale versions and configuration-owned entries fail.
  const updatedResult = await ai.acp.agents.update(definition, current.version)
  if (!updatedResult.success)
    return updatedResult
  const updated = updatedResult.data
  // Delete the example ACP agent entry against its latest version. Success has no data; a conflict or config-owned entry fails.
  const removeResult = await ai.acp.agents.remove(definition.id, updated.version)
  if (!removeResult.success)
    return removeResult
  return { created, listed, updated } // entries include value/source and database version
}
```

<a id="a2a"></a>

### Publish and call remote agents: `ai.a2a`

Publish Agent Cards, register executors and handle A2A requests with host-validated addresses, identity and task ownership.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `ai.a2a.registerExecutor(executor)` | 注册任务执行器 | `executor: AgentExecutor` | `void` | `ai.a2a.registerExecutor(executor)` |
| `ai.a2a.getAgentCard()` | 提供标准发现文档 | No arguments. Reads the configured Agent Card. | `A2AAgentCardDocument (A2A 1.0 ProtoJSON)` | `ai.a2a.getAgentCard()` |
| `ai.a2a.handleRequest(requestBody, context?)` | 处理认证的协议请求 | `requestBody: unknown, context?: Record<string, unknown>`. `requestBody` is the received A2A JSON-RPC request value. The entry validates it. | `direct Promise<A2AHandleResult>; JSON-RPC/SSE outcome` | `ai.a2a.handleRequest(body, { agentId: trustedAgentId })` |
| `ai.a2a.listMessages(filter)` | 可信管理查询 | `filter: A2ATaskFilter` | `StorePage<A2AMessageRecord>` | `ai.a2a.listMessages(messageFilter)` |
| `ai.a2a.callRemoteAgent(remoteUrl, message, options?)` | 调用获准远端 | `remoteUrl: string, message: string, options?: A2ACallOptions` | `A2ACallResult` | `ai.a2a.callRemoteAgent("https://agent.example.com/a2a", "请分析订单")` |

#### A2A request, page, and call arguments

| Object or method | Fields | Defaults, conditions, and effect |
| --- | --- | --- |
| `registerExecutor`, `handleRequest` | `executor`, `requestBody`, `context` | Supply the application executor for protocol tasks. The entry takes raw JSON-RPC and optional server-verified call context. Protocol validation errors return a protocol failure |
| `A2ATaskFilter` | `status`, `contextId`, `callerId`, `since`, `limit`, `offset` | Filter by message role `user/agent`, context, or trusted caller. `since` is an inclusive starting timestamp in Unix milliseconds. Defaults are offset 0 and limit 50 |
| `callRemoteAgent`, `A2ACallOptions` | `remoteUrl`, `message`, `timeout`, `headers` | The remote address and text are required. Timeout defaults to 60000 ms. Pass additional server-side headers, with case-insensitive overrides of the same name |

For `{ callerId: 'docs-reader', status: 'agent', limit: 10 }`, the page contains at most ten agent messages for that caller. Task outcomes are available on their corresponding task results.

#### Scenario: Publish and call remote agents

getAgentCard returns public capabilities; handleRequest maps protocol input to JSON/events, callRemoteAgent returns remote results and listMessages reads authorized task messages. Protocol construction grants no authorization.

[Detailed parameters and workflows](ai.md#a2a)

<a id="http-contract-extensions"></a>

### Enable optional HTTP contracts

The shared HTTP contracts support chat deltas, memory editing, image generation, transcription, and speech synthesis. Before opening a voice WebSocket, obtain a 30-second, single-use ticket with `audio.issueTicket`. [Endpoints and fields](api-contract.en.md#http-contract-extensions)
