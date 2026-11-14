# @h-ai/ai

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/api-contract](../api-contract/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/datapipe](../datapipe/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md) · [@h-ai/vecdb](../vecdb/README.ja.md)

共通の `ai` サービスで LLM 対話、画像生成、ツール、MCP、Embedding、記憶、検索/RAG、知識ベース、コンテキスト管理、ファイル解析、Rerank、音声（ASR/TTS）、A2A を提供します。Node.js では `ai.init()` で初期化し、ブラウザーからは API/client を経由します。

## クイックスタート

`ai.close()` は進行中の初期化を待ってから解放し、並行する close は一つにまとめます。再初期化は旧インスタンスを先に解放し、終了処理中の新規初期化は拒否します。

### 開発用 LLM のみ（DB 依存なし）

```ts
import { ai } from '@h-ai/ai'

const init = await ai.init({
  llm: {
    model: 'gpt-4o-mini',
    apiKey: process.env.HAI_AI_LLM_APIKEY,
  },
})
if (!init.success)
  throw new Error(init.error.message)

try {
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
  await ai.close()
}
```

開発・明示的テストで reldb/vecdb が未初期化の場合、一時 Store を使い、終了やインスタンス切り替えで失われます。`NODE_ENV` または `HAI_CORE_ENV` が production の場合、一時 Store・SQLite・ローカル vecdb は初期化に失敗します。共有 RelDB とネットワーク vecdb を先に初期化するか、同等の原子的契約を満たす共有 Provider を指定してください。

## 機能

### 用途・入力・出力

direct・AsyncIterable・直接の Promise 値と記載したもの以外、出力欄は success 確認後の HaiResult.data です。request/definition/options などの変数は記載した実入力型でアプリ側に用意します。ストリームと明示的な例外は消費境界で処理してください。

呼出し断片は本ページで初期化したサービスを使います。変数はアプリ側で用意する要求・Schema・リソース定義・設定を表します。初期化と失敗処理は各機能の例を参照し、HaiResult.success の確認と非同期処理の await を行ってください。

| 入口                              | 用途                                   | 入力                                                                              | 出力                                                                      | 呼出し断片                                                                                |
| --------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `ai.llm.chat`                     | 単発応答                               | `ChatCompletionRequest: messages, model?, signal?, tools?`                        | `ChatCompletionResponse: choices, model, usage?`                          | `ai.llm.chat({ messages: [{ role: "user", content: "你好" }] })`                          |
| `ai.llm.chatStream`               | 増分応答                               | `same ChatCompletionRequest`                                                      | `AsyncIterable<ChatCompletionChunk>; iteration may throw`                 | `ai.llm.chatStream({ messages })`                                                         |
| `ai.llm.ask`                      | テキスト応答                           | `question: string, AskOptions?`                                                   | `string answer`                                                           | `ai.llm.ask("解释共享状态")`                                                              |
| `ai.llm.askStream`                | テキストストリーム                     | `question: string, AskOptions?`                                                   | `AsyncIterable<string>`                                                   | `ai.llm.askStream("解释共享状态")`                                                        |
| `ai.llm.generateObject`           | Schema 制約付き応答                    | `Zod schema, messages, model?, responseFormat?, maxRepairs?, signal?`             | `schema-inferred T`                                                       | `ai.llm.generateObject({ schema: AnswerSchema, messages })`                               |
| `ai.llm.listModels`               | モデル一覧                             | `none`                                                                            | `string[] model IDs`                                                      | `ai.llm.listModels()`                                                                     |
| `ai.llm.getHistory`               | 会話履歴                               | `{ objectId, sessionId }, { limit?, order? }?`                                    | `ChatRecord[]`                                                            | `ai.llm.getHistory({ objectId: "u1", sessionId: "s1" })`                                  |
| `ai.llm.listSessions`             | 主体の会話一覧                         | `objectId: string`                                                                | `SessionInfo[]`                                                           | `ai.llm.listSessions("u1")`                                                               |
| `ai.tools.define`                 | ツールを定義                           | `{ name, description, parameters: Zod schema, handler, timeoutMs? }`              | `direct Tool<TInput,TOutput>; no init required`                           | `ai.tools.define(toolDefinition)`                                                         |
| `ai.tools.createRegistry`         | ツール一覧を管理                       | `{ authorize? }?`                                                                 | `direct ToolRegistryOperations; no init required`                         | `ai.tools.createRegistry({ authorize })`                                                  |
| `ai.stream.createProcessor`       | 増分を蓄積                             | `none`                                                                            | `direct StreamProcessor`                                                  | `ai.stream.createProcessor()`                                                             |
| `ai.stream.collect`               | 対話ストリームを消費                   | `AsyncIterable<ChatCompletionChunk>`                                              | `Promise<StreamResult>; stream failure rejects`                           | `ai.stream.collect(ai.llm.chatStream({ messages }))`                                      |
| `ai.stream.createSSEDecoder`      | 分割 SSE の復号                        | `none`                                                                            | `direct SSEDecoder with decode/reset`                                     | `ai.stream.createSSEDecoder()`                                                            |
| `ai.stream.encodeSSE`             | SSE を符号化                           | `SSEEvent: data, event?, id?, retry?`                                             | `direct string; invalid metadata throws`                                  | `ai.stream.encodeSSE({ data: "Hello" })`                                                  |
| `ai.embedding.embed`              | 埋め込み要求                           | `EmbeddingRequest with input/model?`                                              | `EmbeddingResponse`                                                       | `ai.embedding.embed({ input: "产品说明" })`                                               |
| `ai.embedding.embedText`          | 一文のベクトル                         | `text: string`                                                                    | `number[]`                                                                | `ai.embedding.embedText("产品说明")`                                                      |
| `ai.embedding.embedBatch`         | 複数文のベクトル                       | `texts: string[]`                                                                 | `number[][] in input order`                                               | `ai.embedding.embedBatch(["简介", "部署"])`                                               |
| `ai.mcp.registerTool`             | ローカルツール登録                     | `MCPToolDefinition, typed handler`                                                | `void`                                                                    | `ai.mcp.registerTool(mcpToolDefinition, toolHandler)`                                     |
| `ai.mcp.registerResource`         | 資源登録                               | `MCPResource, async content handler`                                              | `void`                                                                    | `ai.mcp.registerResource(resourceDefinition, readContent)`                                |
| `ai.mcp.registerPrompt`           | プロンプト登録                         | `MCPPrompt, args => Promise<MCPPromptMessage[]>`                                  | `void`                                                                    | `ai.mcp.registerPrompt(promptDefinition, buildMessages)`                                  |
| `ai.mcp.callTool`                 | 登録済みツール呼出し                   | `name, arguments, MCPContext?`                                                    | `unknown tool result`                                                     | `ai.mcp.callTool("search", { query: "配置" })`                                            |
| `ai.mcp.readResource`             | 資源読取                               | `resource URI`                                                                    | `MCPResourceContent with exactly text or blob`                            | `ai.mcp.readResource("docs://intro")`                                                     |
| `ai.mcp.getPrompt`                | プロンプト生成                         | `name, Record<string,string> arguments`                                           | `MCPPromptMessage[]`                                                      | `ai.mcp.getPrompt("review", { topic: "API" })`                                            |
| `ai.mcp.services.invoke`          | 許可されたリモートツールの呼び出し     | リクエスト、認証済み主体、認可関数                                                | `HaiResult<CallToolResult>`                                               | `ai.mcp.services.invoke(request, authorization)`                                          |
| `ai.mcp.services.createBroker`    | ACP セッション用ツールのエンドポイント | 固定 URL と呼び出しごとの認可関数                                                 | `HaiResult<MCPServiceBroker>`                                             | `ai.mcp.services.createBroker(brokerOptions)`                                             |
| `ai.retrieval.addSource`          | 検索元を登録                           | `RetrievalSource: id, collection, optional metadata`                              | `void`                                                                    | `ai.retrieval.addSource({ id: "docs", collection: "manual" })`                            |
| `ai.retrieval.removeSource`       | 検索元を解除                           | `sourceId: string`                                                                | `void`                                                                    | `ai.retrieval.removeSource("docs")`                                                       |
| `ai.retrieval.listSources`        | 検索元一覧                             | `none`                                                                            | `direct Promise<RetrievalSource[]>`                                       | `ai.retrieval.listSources()`                                                              |
| `ai.retrieval.retrieve`           | 候補検索                               | `RetrievalRequest: query, sources?, topK?, minScore?, enableRerank?`              | `RetrievalResult`                                                         | `ai.retrieval.retrieve({ query: "部署" })`                                                |
| `ai.rag.query`                    | 根拠付き応答                           | `query: string, RagOptions?`                                                      | `RagResult: answer, context, citations, query, model`                     | `ai.rag.query("如何部署？", { sources: ["docs"] })`                                       |
| `ai.rag.queryStream`              | 根拠付きストリーム                     | `query: string, RagOptions?`                                                      | `AsyncIterable<RagStreamEvent>`                                           | `ai.rag.queryStream("如何部署？", { sources: ["docs"] })`                                 |
| `ai.knowledge.setup`              | コレクションを準備                     | `KnowledgeSetupOptions?`                                                          | `void; collection ready for ingest`                                       | `ai.knowledge.setup()`                                                                    |
| `ai.knowledge.ingest`             | 文書を公開                             | `{ documentId, content, title?, collection?, ...metadata }`                       | `KnowledgeIngestResult with revision/cleanupPending`                      | `ai.knowledge.ingest({ documentId: "intro", content: "入门正文" })`                       |
| `ai.knowledge.ingestFile`         | ファイルを取込                         | `KnowledgeIngestFileInput including file bytes and document identity`             | `KnowledgeIngestResult`                                                   | `ai.knowledge.ingestFile(fileInput)`                                                      |
| `ai.knowledge.ingestBatch`        | 一括取込                               | `KnowledgeIngestInput[], onProgress?`                                             | `KnowledgeIngestBatchResult with per-document outcomes`                   | `ai.knowledge.ingestBatch(documentInputs, onProgress)`                                    |
| `ai.knowledge.retrieve`           | 公開版の検索                           | `query: string, KnowledgeRetrieveOptions?`                                        | `KnowledgeRetrieveResult`                                                 | `ai.knowledge.retrieve("部署说明")`                                                       |
| `ai.knowledge.ask`                | 知識に基づく応答                       | `query: string, KnowledgeAskOptions?`                                             | `KnowledgeAskResult`                                                      | `ai.knowledge.ask("如何恢复备份？")`                                                      |
| `ai.knowledge.findByEntity`       | 実体から資料検索                       | `entityName: string, EntityQueryOptions?`                                         | `EntityDocumentResult[]`                                                  | `ai.knowledge.findByEntity("订单")`                                                       |
| `ai.knowledge.listEntities`       | 実体一覧                               | `EntityListOptions?`                                                              | `KnowledgeEntity[]`                                                       | `ai.knowledge.listEntities()`                                                             |
| `ai.knowledge.listDocuments`      | 文書一覧                               | `KnowledgeDocumentListOptions?`                                                   | `KnowledgeDocumentInfo[]`                                                 | `ai.knowledge.listDocuments()`                                                            |
| `ai.knowledge.removeDocument`     | 文書の公開解除                         | `documentId, KnowledgeDocumentRemoveOptions?`                                     | `void; may fail after visibility revocation if cleanup fails`             | `ai.knowledge.removeDocument("intro")`                                                    |
| `ai.knowledge.repair`             | 残留ベクトルの補償                     | `{ collection?, offset?, limit? }`                                                | `KnowledgeRepairResult with progress`                                     | `ai.knowledge.repair({ offset: 0, limit: 100 })`                                          |
| `ai.knowledge.deleteCollection`   | コレクションを解除                     | `collection name?`                                                                | `void; cleanup tombstone remains`                                         | `ai.knowledge.deleteCollection("retired-manual")`                                         |
| `ai.memory.scoped`                | 信頼する主体を束縛                     | `{ objectId: nonempty string, scope? }`                                           | `direct ScopedMemoryOperations; invalid binding throws TypeError`         | `ai.memory.scoped({ objectId: "u1", scope: { topicId: "orders" } })`                      |
| `ai.memory.extract`               | 記憶を抽出                             | `ChatMessage[], { objectId, scope?, model?, signal?, ...options }`                | `MemoryEntry[]`                                                           | `ai.memory.extract(messages, { objectId: "u1" })`                                         |
| `ai.memory.add`                   | 明示的記憶を保存                       | `MemoryEntryInput: objectId, content, type, scope?`                               | `MemoryEntry`                                                             | `ai.memory.add({ objectId: "u1", content: "偏好中文", type: "preference" })`              |
| `ai.memory.get`                   | 所有者の記憶を読取                     | `memoryId, { objectId, scope? } for untrusted IDs`                                | `MemoryEntry`                                                             | `ai.memory.get(memoryId, { objectId: "u1" })`                                             |
| `ai.memory.update`                | 記憶を更新                             | `memoryId, MemoryUpdateInput, trusted access scope`                               | `MemoryEntry`                                                             | `ai.memory.update(memoryId, { content: "偏好日文" }, { objectId: "u1" })`                 |
| `ai.memory.remove`                | 所有者の記憶を削除                     | `memoryId, trusted access scope`                                                  | `void`                                                                    | `ai.memory.remove(memoryId, { objectId: "u1" })`                                          |
| `ai.memory.recall`                | 関連記憶の検索                         | `query, { objectId, scope?, topK?, types?, ...options }`                          | `MemoryEntry[]`                                                           | `ai.memory.recall("语言偏好", { objectId: "u1" })`                                        |
| `ai.memory.injectMemories`        | 会話の文脈を補足                       | `ChatMessage[], { objectId, scope?, topK?, ...options }`                          | `ChatMessage[]`                                                           | `ai.memory.injectMemories(messages, { objectId: "u1" })`                                  |
| `ai.memory.list`                  | 記憶一覧                               | `MemoryListOptions with objectId/scope filters`                                   | `MemoryEntry[]; incomplete scan fails`                                    | `ai.memory.list({ objectId: "u1" })`                                                      |
| `ai.memory.listPage`              | 記憶のページ表示                       | `MemoryListPageOptions with objectId/pagination`                                  | `StorePage<MemoryEntry>`                                                  | `ai.memory.listPage({ objectId: "u1", offset: 0, limit: 20 })`                            |
| `ai.memory.clear`                 | 指定範囲を解除                         | `nonempty MemoryClearOptions`                                                     | `void; empty filters are rejected`                                        | `ai.memory.clear({ objectId: "u1" })`                                                     |
| `ai.memory.admin.clearAll`        | 信頼された管理者の全解除               | `{ confirm: true }; require host administrator authorization`                     | `void; destructive across subjects`                                       | `ai.memory.admin.clearAll({ confirm: true })`                                             |
| `ai.persona.save`                 | ペルソナを保存                         | `PersonaProfileInput: id, name, systemPrompt, objectId?, traits?`                 | `PersonaProfile`                                                          | `ai.persona.save(personaProfile)`                                                         |
| `ai.persona.get`                  | ペルソナを読取                         | `id, { objectId }?; omitted subject selects system profile`                       | `PersonaProfile`                                                          | `ai.persona.get("tutor", { objectId: "u1" })`                                             |
| `ai.persona.update`               | ペルソナを更新                         | `id, PersonaProfileUpdate, { objectId }?`                                         | `PersonaProfile`                                                          | `ai.persona.update("tutor", updates, { objectId: "u1" })`                                 |
| `ai.persona.remove`               | ペルソナを削除                         | `id, { objectId }?`                                                               | `void`                                                                    | `ai.persona.remove("tutor", { objectId: "u1" })`                                          |
| `ai.persona.list`                 | ペルソナ一覧                           | `{ objectId }?`                                                                   | `PersonaProfile[]`                                                        | `ai.persona.list({ objectId: "u1" })`                                                     |
| `ai.persona.compose`              | システム指示を合成                     | `id, { objectId }?`                                                               | `string prompt`                                                           | `ai.persona.compose("tutor", { objectId: "u1" })`                                         |
| `ai.token.estimateText`           | 文章 Token の推定                      | `text: string`                                                                    | `direct number; estimate, not billing usage`                              | `ai.token.estimateText("Hello 世界")`                                                     |
| `ai.token.estimateMessages`       | メッセージ Token の推定                | `ChatMessage[]`                                                                   | `direct number including protocol overhead`                               | `ai.token.estimateMessages(messages)`                                                     |
| `ai.summary.generate`             | 要約本文を生成                         | `ChatMessage[], SummaryOptions?`                                                  | `string`                                                                  | `ai.summary.generate(messages)`                                                           |
| `ai.summary.summarize`            | 要約と対象情報                         | `ChatMessage[], SummaryOptions?`                                                  | `{ summary, tokenCount, coveredMessages }`                                | `ai.summary.summarize(messages)`                                                          |
| `ai.compress.tryCompress`         | 予算に合わせて圧縮                     | `ChatMessage[], { strategy?, maxTokens?, preserveLastN?, ...options }`            | `CompressResult: messages and original/compressed token counts`           | `ai.compress.tryCompress(messages, { maxTokens: 4000 })`                                  |
| `ai.context.createManager`        | 複数回対話を開始                       | `ContextManagerOptions with scope { objectId, sessionId }`                        | `ContextManager`                                                          | `ai.context.createManager({ scope: { objectId: "u1", sessionId: "s1" } })`                |
| `ai.context.restoreManager`       | 対話を復元                             | `{ objectId, sessionId }, options?`                                               | `ContextManager`                                                          | `ai.context.restoreManager({ objectId: "u1", sessionId: "s1" })`                          |
| `ai.context.listSessions`         | 保存会話を一覧                         | `objectId`                                                                        | `SessionInfo[]`                                                           | `ai.context.listSessions("u1")`                                                           |
| `ai.context.renameSession`        | 会話名を変更                           | `scope, title`                                                                    | `void`                                                                    | `ai.context.renameSession({ objectId: "u1", sessionId: "s1" }, "订单讨论")`               |
| `ai.context.removeSession`        | 会話を削除                             | `scope`                                                                           | `void; tombstone prevents scope reuse`                                    | `ai.context.removeSession({ objectId: "u1", sessionId: "s1" })`                           |
| `ai.rerank.rerank`                | 文書の順位付け                         | `RerankRequest: query, documents, model?, topN?`                                  | `RerankResponse with model/results`                                       | `ai.rerank.rerank({ query: "部署", documents: ["配置说明"] })`                            |
| `ai.rerank.rerankTexts`           | テキストの順位付け                     | `query, string[] texts, topN?`                                                    | `RerankItem[] with index/relevanceScore`                                  | `ai.rerank.rerankTexts("部署", ["配置说明"], 1)`                                          |
| `ai.file.parse`                   | ファイル解析                           | `FileParseRequest with content, filename, options?`                               | `FileParseResult; extraction is not HTML sanitization`                    | `ai.file.parse({ content: "<p>正文</p>", filename: "intro.html" })`                       |
| `ai.file.parseText`               | 本文抽出                               | `Buffer\|string content, filename?`                                               | `string`                                                                  | `ai.file.parseText("Hello", "intro.txt")`                                                 |
| `ai.reasoning.run`                | 多段推論                               | `query, ReasoningOptions including strategy/tools?`                               | `ReasoningResult`                                                         | `ai.reasoning.run("审查方案", { strategy: "cot" })`                                       |
| `ai.reasoning.runStream`          | 推論過程を観察                         | `query, ReasoningOptions?`                                                        | `AsyncIterable<ReasoningStreamEvent>`                                     | `ai.reasoning.runStream("审查方案", { strategy: "react" })`                               |
| `ai.audio.transcribe`             | 音声認識                               | `TranscriptionRequest: audio, language?, model?, signal?`                         | `TranscriptionResult: text, language?, segments?`                         | `ai.audio.transcribe({ audio: { data: wavBytes, format: "wav" } })`                       |
| `ai.audio.transcribeStream`       | 連続音声認識                           | `TranscriptionStreamRequest: chunks or complete audio`                            | `AsyncIterable<TranscriptionEvent>`                                       | `ai.audio.transcribeStream(transcriptionInput)`                                           |
| `ai.audio.synthesize`             | 音声合成                               | `SynthesisRequest: text, language?, model?, signal?`                              | `SynthesisResult: audio and duration metadata`                            | `ai.audio.synthesize({ text: "你好" })`                                                   |
| `ai.audio.synthesizeStream`       | 区間ごとの音声合成                     | `SynthesisStreamRequest: text segment or async segments`                          | `AsyncIterable<SynthesisEvent>`                                           | `ai.audio.synthesizeStream(synthesisInput)`                                               |
| `ai.audio.getCapabilities`        | 能力を先に確認                         | `{ operation: transcribe\|synthesize, model? }`                                   | `AudioModelCapabilities`                                                  | `ai.audio.getCapabilities({ operation: "synthesize" })`                                   |
| `ai.image.generate`               | 画像生成                               | `{ prompt, referenceImages?, model?, size?, signal? }`                            | `{ images: GeneratedImage[] } with bytes/MIME`                            | `ai.image.generate({ prompt: "一座灯塔" })`                                               |
| `ai.a2a.registerExecutor`         | 実行器の登録                           | `SDK AgentExecutor`                                                               | `void`                                                                    | `ai.a2a.registerExecutor(executor)`                                                       |
| `ai.a2a.getAgentCard`             | 標準発見文書                           | `none; configured a2a card`                                                       | `A2AAgentCardDocument (A2A 1.0 ProtoJSON)`                                | `ai.a2a.getAgentCard()`                                                                   |
| `ai.a2a.handleRequest`            | 認証済み要求を処理                     | `unknown JSON-RPC body, trusted context.agentId?`                                 | `direct Promise<A2AHandleResult>; JSON-RPC/SSE outcome`                   | `ai.a2a.handleRequest(body, { agentId: trustedAgentId })`                                 |
| `ai.a2a.listMessages`             | 管理用メッセージ検索                   | `A2ATaskFilter: callerId?, contextId?, since?, pagination?`                       | `StorePage<A2AMessageRecord>`                                             | `ai.a2a.listMessages(messageFilter)`                                                      |
| `ai.a2a.callRemoteAgent`          | 許可された遠隔を呼出し                 | `allowlisted HTTPS URL, message, A2ACallOptions?`                                 | `A2ACallResult`                                                           | `ai.a2a.callRemoteAgent("https://agent.example.com/a2a", "请分析订单")`                   |
| `ai.init`                         | サービス準備                           | `AIConfigInput?, AIInitOptions?`                                                  | `HaiResult<void>; validate dependencies before use`                       | `ai.init({ llm: { apiKey: process.env.HAI_AI_LLM_APIKEY } })`                             |
| `ai.close`                        | サービス解放                           | `none`                                                                            | `Promise<void>; wait for cleanup`                                         | `ai.close()`                                                                              |
| `ai.config`                       | 安全な設定参照                         | `none`                                                                            | `redacted AIConfig or null`                                               | `ai.config`                                                                               |
| `ai.isInitialized`                | 状態確認                               | `none`                                                                            | `boolean`                                                                 | `ai.isInitialized`                                                                        |
| `ai.llm.models.list`              | 統合した一覧                           | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.llm.models.list()`                                                                    |
| `ai.llm.models.get`               | 出所と版を参照                         | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.llm.models.get("coding")`                                                             |
| `ai.llm.models.register`          | DB 定義を登録                          | `ModelEntry input (id/model/protocol/credentials/capabilities)`                   | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.llm.models.register(modelDefinition)`                                                 |
| `ai.llm.models.update`            | 版を条件に置換                         | `ModelEntry input (id/model/protocol/credentials/capabilities), expectedVersion?` | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.llm.models.update(modelDefinition, current.data.version)`                             |
| `ai.llm.models.remove`            | DB 定義を削除                          | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.llm.models.remove("coding", current.data.version)`                                    |
| `ai.audio.models.list`            | 統合した一覧                           | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.audio.models.list()`                                                                  |
| `ai.audio.models.get`             | 出所と版を参照                         | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.audio.models.get("speech")`                                                           |
| `ai.audio.models.register`        | DB 定義を登録                          | `AudioModelEntry input (id/provider/model/operations)`                            | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.audio.models.register(audioModelDefinition)`                                          |
| `ai.audio.models.update`          | 版を条件に置換                         | `AudioModelEntry input (id/provider/model/operations), expectedVersion?`          | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.audio.models.update(audioModelDefinition, current.data.version)`                      |
| `ai.audio.models.remove`          | DB 定義を削除                          | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.audio.models.remove("speech", current.data.version)`                                  |
| `ai.image.models.list`            | 統合した一覧                           | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.image.models.list()`                                                                  |
| `ai.image.models.get`             | 出所と版を参照                         | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.image.models.get("poster")`                                                           |
| `ai.image.models.register`        | DB 定義を登録                          | `ImageModelEntry input (id/provider/model)`                                       | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.image.models.register(imageModelDefinition)`                                          |
| `ai.image.models.update`          | 版を条件に置換                         | `ImageModelEntry input (id/provider/model), expectedVersion?`                     | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.image.models.update(imageModelDefinition, current.data.version)`                      |
| `ai.image.models.remove`          | DB 定義を削除                          | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.image.models.remove("poster", current.data.version)`                                  |
| `ai.mcp.servers.list`             | 統合した一覧                           | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.mcp.servers.list()`                                                                   |
| `ai.mcp.servers.get`              | 出所と版を参照                         | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.mcp.servers.get("tools")`                                                             |
| `ai.mcp.servers.register`         | DB 定義を登録                          | `MCPExternalServer input (id/transport/url or command)`                           | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.mcp.servers.register(mcpServerDefinition)`                                            |
| `ai.mcp.servers.update`           | 版を条件に置換                         | `MCPExternalServer input (id/transport/url or command), expectedVersion?`         | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.mcp.servers.update(mcpServerDefinition, current.data.version)`                        |
| `ai.mcp.servers.remove`           | DB 定義を削除                          | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.mcp.servers.remove("tools", current.data.version)`                                    |
| `ai.retrieval.sources.list`       | 統合した一覧                           | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.retrieval.sources.list()`                                                             |
| `ai.retrieval.sources.get`        | 出所と版を参照                         | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.retrieval.sources.get("docs")`                                                        |
| `ai.retrieval.sources.register`   | DB 定義を登録                          | `RetrievalSource input (id/collection)`                                           | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.retrieval.sources.register(sourceDefinition)`                                         |
| `ai.retrieval.sources.update`     | 版を条件に置換                         | `RetrievalSource input (id/collection), expectedVersion?`                         | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.retrieval.sources.update(sourceDefinition, current.data.version)`                     |
| `ai.retrieval.sources.remove`     | DB 定義を削除                          | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.retrieval.sources.remove("docs", current.data.version)`                               |
| `ai.acp.agents.list`              | 統合した一覧                           | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.acp.agents.list()`                                                                    |
| `ai.acp.agents.get`               | 出所と版を参照                         | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.acp.agents.get("coder")`                                                              |
| `ai.acp.agents.register`          | DB 定義を登録                          | `ACPAgent input (id/mode/adapter/modelIds)`                                       | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.acp.agents.register(agentDefinition)`                                                 |
| `ai.acp.agents.update`            | 版を条件に置換                         | `ACPAgent input (id/mode/adapter/modelIds), expectedVersion?`                     | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.acp.agents.update(agentDefinition, current.data.version)`                             |
| `ai.acp.agents.remove`            | DB 定義を削除                          | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.acp.agents.remove("coder", current.data.version)`                                     |
| `ai.acp.workspaces.list`          | 統合した一覧                           | `none`                                                                            | `HaiResult<AIResourceEntry[]>; config wins, list has no database version` | `ai.acp.workspaces.list()`                                                                |
| `ai.acp.workspaces.get`           | 出所と版を参照                         | `id: string`                                                                      | `HaiResult<AIResourceEntry> with value/source/version?`                   | `ai.acp.workspaces.get("project")`                                                        |
| `ai.acp.workspaces.register`      | DB 定義を登録                          | `ACPWorkspace input (id/storage/repositories)`                                    | `HaiResult<AIResourceEntry>; config entries are read-only`                | `ai.acp.workspaces.register(workspaceDefinition)`                                         |
| `ai.acp.workspaces.update`        | 版を条件に置換                         | `ACPWorkspace input (id/storage/repositories), expectedVersion?`                  | `HaiResult<AIResourceEntry>; full replacement, conflict fails`            | `ai.acp.workspaces.update(workspaceDefinition, current.data.version)`                     |
| `ai.acp.workspaces.remove`        | DB 定義を削除                          | `id, expectedVersion?; ACP definitions must have no session references`           | `HaiResult<void>; external files/services are retained`                   | `ai.acp.workspaces.remove("project", current.data.version)`                               |
| `ai.acp.agents.initialize`        | エージェント事前確認                   | `agentId, modelId?`                                                               | `HaiResult<{ agentId, mode, modelIds }>; no credentials`                  | `ai.acp.agents.initialize("coder")`                                                       |
| `ai.acp.agents.check`             | 実接続と握手                           | `agentId, { workspaceId?, ...ACPClientOptions }`                                  | `HaiResult<native initialize response>; owned connection is closed`       | `ai.acp.agents.check("coder", { workspaceId: "project" })`                                |
| `ai.acp.workspaces.prepare`       | 作業領域を準備                         | `workspaceId`                                                                     | `HaiResult<main absolute path>; dirty content is retained`                | `ai.acp.workspaces.prepare("project")`                                                    |
| `ai.acp.workspaces.importFiles`   | 制御ファイル取込                       | `workspaceId, { path: relative path, content: string\|Uint8Array }[]`             | `HaiResult<{ imported: string[] }>; no overwrite`                         | `ai.acp.workspaces.importFiles("project", [{ path: "notes.txt", content: "需求" }])`      |
| `ai.acp.sessions.create`          | 管理会話を開始                         | `ACPCreateSessionOptions: agentId/workspaceId/newWorktree?`                       | `HaiResult<managed session handle>`                                       | `ai.acp.sessions.create({ agentId: "coder", workspaceId: "project", newWorktree: true })` |
| `ai.acp.sessions.get`             | 会話ハンドル参照                       | `framework session id`                                                            | `HaiResult<managed session handle>; does not resume`                      | `ai.acp.sessions.get("task-1")`                                                           |
| `ai.acp.sessions.list`            | 管理会話一覧                           | `workspaceId?`                                                                    | `HaiResult<ACPSessionInfo[]>`                                             | `ai.acp.sessions.list("project")`                                                         |
| `ai.acp.sessions.resume`          | ネイティブ会話再開                     | `framework session id, ACPClientOptions?`                                         | `HaiResult<managed session handle>; definition changes may reject`        | `ai.acp.sessions.resume("task-1")`                                                        |
| `ai.acp.sessions.close`           | 所有する実行を停止                     | `framework session id`                                                            | `HaiResult<void>; source and native history retained`                     | `ai.acp.sessions.close("task-1")`                                                         |
| `ai.acp.sessions.reclaimWorktree` | 清浄な worktree を回収                 | `closed framework session id; preview stopped and changes saved`                  | `HaiResult<void>; branch and normal files retained`                       | `ai.acp.sessions.reclaimWorktree("task-1")`                                               |
| `ai.acp.sessions.remove`          | 会話記録を削除                         | `closed or failed framework session id`                                           | `HaiResult<void>; worktree and native history retained`                   | `ai.acp.sessions.remove("task-1")`                                                        |
| `ai.acp.connect`                  | 原生転送へ接続                         | `ACPTransport: stdio/http/ws, ACPClientOptions?`                                  | `HaiResult<connection handle>`                                            | `ai.acp.connect({ type: "http", url: "https://agent.example.com/acp" })`                  |
| `ai.acp.close`                    | サブシステムを閉じる                   | `none; normally call ai.close()`                                                  | `Promise<void>; cleanup may throw`                                        | `ai.acp.close()`                                                                          |

- `ai.tools`：ツール定義・登録・一括実行。初期化不要。
- `ai.stream`：ChatCompletion のストリーミング chunk 処理。初期化不要。
- `ai.llm`：通常・ストリーミング対話、モデル一覧、履歴。
- `ai.mcp` / `createMcpServer`：組み込み MCP 登録機能と独立した MCP Server。
- `ai.embedding`：単一・一括テキストのベクトル化。
- `ai.memory`：記憶の抽出・保存・呼び出し・注入。
- `ai.persona`：AI の人格プロフィール（システムプロンプト + 特性）とプロンプトの合成。
- `ai.retrieval` / `ai.rag`：複数ソースのベクトル検索と検索拡張型の回答。
- `ai.knowledge`：文書の取り込み、エンティティを使う検索、知識ベースの回答。
- `ai.context`：LLM + Memory + RAG + 圧縮を組み合わせたセッション管理。
- `ai.file` / `ai.rerank`：ファイル解析/OCR とテキストの再順位付け。
- `ai.audio`：通常・ストリーミングの音声認識（ASR）と音声合成（TTS）。OpenAI / MiMo / Qwen / Doubao に対応。
- `ai.image`：OpenAI GPT Image、Google Gemini Image / Nano Banana、Qwen-Image 2.0/3.0、Seedream 4.x/5.x、Pollinations の無料枠モデルによる画像生成。
- `ai.a2a`：Agent-to-Agent のリクエスト処理とリモート呼び出し。
- `@h-ai/ai/client`：独立したブラウザー Audio WebSocket クライアント。

`@h-ai/ai/client` は `createAudioClient({ url, getTicket })` と Audio クライアント型のみを公開します。HTTP は `@h-ai/api-client` の型付きドメインメソッドを使います。既定のチャット補完は非ストリーミングで、ストリームと A2A はアプリ独自の contract に結び付けます。ブラウザーには Node の `ai` シングルトンを公開しません。

- `AIStoreProvider`：ストレージ抽象。本番は `stateScope: 'shared'` が必須で、組み込み実装は PostgreSQL/MySQL とネットワーク vecdb の初期化を必要とします。開発・明示的テストでは一時 Store を利用できます。

詳しいメソッド一覧・エラーコード・長い例は [REFERENCE.md（中国語）](./REFERENCE.md) を参照してください。

### 永続 DB Provider（reldb + vecdb）

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
  const result = await ai.llm.chat({
    messages: [
      { role: 'user', content: 'Hello!' }
    ]
  })
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

標準の PostgreSQL Store では、新規データベースやアップグレード時に複数ノードから `ai.init` を同時に呼び出せます。トランザクション単位のアドバイザリロックでテーブル、インデックス、書き込み制御用の行を順番に準備します。失敗時はトランザクションをロールバックし、権限や構造を修正した後に再試行できます。既存のインデックスは再利用します。ベクトルの再構築はコミット後に実行され、稼働中の別ノードで再開できます。

MySQL の初回初期化は複数ノードで実行できます。mysql2 の明示的な ER_DUP_KEYNAME/1061 だけを受け入れ、実際の列・順序、非一意・列全体・昇順・可視 BTREE・式なしを再確認します。同名でも構造が異なれば失敗します。テーブル作成と INDEX 権限が必要で、メタデータ取得・権限・その他 DDL の失敗は ai.init の CONFIGURATION_ERROR になります。開始した全 DDL の終了を待ってから返します。MySQL DDL はロールバックされないため、権限や構造を修正してから再試行してください。各初期化結果を確認し、失敗時は業務リクエストを受けず、AI・vecdb・reldb の逆順で終了します。

### 独自 StoreProvider

```ts
import type { AIStoreProvider } from '@h-ai/ai'
import { ai } from '@h-ai/ai'

const storeProvider: AIStoreProvider = createMyStoreProvider()

await ai.init(
  {
    llm: { model: 'gpt-4o-mini', apiKey: process.env.HAI_AI_LLM_APIKEY }
  },
  { storeProvider },
)

await ai.close()
```

### API 契約

- 公開入口は `ai` サービスと `createMcpServer` など少数の独立ファクトリー。
- ライフサイクルは `await ai.init(config, options?)` / `await ai.close()`。終了時は独自 `AIStoreProvider.close()` を待ちます。
- ドメイン操作は `HaiResult<T>` または `Promise<HaiResult<T>>` を返し、`result.success === false` と `result.error.code` で失敗を表します。`AsyncIterable`、クライアント通信、外部コールバックは開始・反復時に例外を投げる場合があります。
- `ai.tools` と `ai.stream` は純粋関数で、初期化せず使用できます。
- 開発・テストで reldb/vecdb がなければ一時 Store、両方が初期化済みなら DB Provider を使います。本番では実際の DB/vecdb 共有能力を検証し、独自 Provider も正確な `stateScope` を宣言する必要があります。

Store の拡張には公開 AIStoreProvider を使用します。組み込み LLM Provider、ファクトリ依存、Context 内部依存は非公開です。モデル接続は設定で行い、履歴照会、AskOptions、ChatRecord は公開を維持します。

### API 一覧

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

// 多协议：模型的 protocol 决定底层走 Chat Completions / Responses / Anthropic，公共请求响应形状不变
// - chat（默认）：OpenAI Chat Completions（兼容绝大多数厂商）
// - responses：OpenAI Responses API（/v1/responses）
// - anthropic：Anthropic Messages API（Claude 原生协议，环境变量 ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL）
const claude = await ai.llm.chat({ messages, model: 'claude' }) // 该模型配置 protocol: anthropic

// 临时模型：单次请求绕过配置注册模型，直接指定端点与凭据（chat/chatStream/ask/askStream 均支持）
// 临时客户端按 TTL 缓存（llm.tempModelCacheTtl，默认 10 分钟），与常驻模型客户端隔离
const temp = await ai.llm.chat({
  messages,
  tempModel: { model: 'claude-3-5-sonnet', protocol: 'anthropic', apiKey: process.env.TEMP_LLM_API_KEY },
})
```

SSE は [WHATWG のイベントストリーム規則](https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation)に従い、分割された LF/CRLF/CR、複数 data 行、コロン直後の空白一つ、id/retry の継承、既定の message を扱います。EOF の未完了イベントは配信しません。encodeSSE は data の改行を正規化し、不正なメタデータは明示的に例外を返します。Anthropic/MiMo は UTF-8 reader を共有し、終了・取消・失敗時に本文を取消して解放します。自動再接続や業務再実行は行わず、Anthropic の timeout は本文まで、MiMo は各 HTTP リクエスト単位で適用します。

##### `ai.llm.generateObject` で構造化出力を得る

モデルまたはゲートウェイの対応機能に合わせて `responseFormat` を選びます。既定の `json_schema` は厳密な JSON Schema を上流へ送ります。`schemaName` はこの方式だけで使い、既定値は `result` です。汎用 JSON モードの Chat ゲートウェイには `json_object` を指定し、フレームワークが Schema をプロンプトに含めます。両方式とも同じ Zod Schema でローカル検証を行います。解析・検証に失敗したときの修復回数は `maxRepairs` で制御し、既定は 1 回です。

```ts
import { ai } from '@h-ai/ai'
import { z } from 'zod'

// 汎用 JSON モードに対応するテキストモデルで AI を初期化済み。
const result = await ai.llm.generateObject({
  schema: z.object({
    title: z.string()
  }), // title 文字列を持つオブジェクトを要求する。
  messages: [
    { role: 'user', content: 'リリース確認表のタイトルを考えてください。' }
  ], // 今回の入力。
  responseFormat: 'json_object', // 汎用 JSON を要求し、Zod でローカル検証する。
  maxRepairs: 1, // 解析または検証の失敗後に 1 回だけ修復を試す。
})
if (result.success)
  process.stdout.write(result.data.title) // 例: リリース確認表。
```

#### ツール呼び出し

```ts
import { z } from 'zod'

const registry = ai.tools.createRegistry({
  // 统一授权在 Zod 校验后、handler 前执行；false/异常均 fail-closed
  authorize: ({ toolName, context }) => canExecuteTool(context.objectId, toolName),
})
const registered = registry.register(ai.tools.define({
  name: 'get_weather',
  description: '获取天气',
  parameters: z.object({
    city: z.string()
  }),
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

const chat = await ai.llm.chat({
  messages,
  tools: registry.getDefinitions()
})
```

#### ACP エージェント、ワークスペースとセッション

`ai.acp` は Node サーバーで動作します。`embedded` はローカルプロセス、`builtin-service` は Podman/Docker コンテナ（利用可能な Podman を優先）、`custom-service` は既存の HTTP/WS ACP サービスです。Codex/dsh は stdio を使用し、未対応の転送方式を暗黙に変換しません。

Podman はリモートサービスのプロキシ環境変数を自動継承しません。必要なプロキシは Agent/workspace の `environmentRefs` で明示し、コンテナから到達可能なアドレスを使用してください。

Goose 1.57.0 イメージは `goose serve` のネイティブ HTTP/WS `/acp` を提供し、custom-service と `X-Secret-Key` で接続します。モデルは Goose 側で管理し、ワークスペースと状態 volume は配備側がマウントします。実際のリモート E2E では宣言された復元機能を検証します。

- `agents.register/get/list/update/remove/initialize/check` で管理します。`codex`、`deepseek-harness` は `llm.models` を参照し、その他は `generic` または信頼された `AIInitOptions.acpAdapters` を使用します。外部サービスは自身でモデルを管理します。
- `workspaces.register/prepare/importFiles` は永続ディレクトリ/volume、複数 Git、通常ファイルを管理します。各 Git の `mainBranch` は必須で、prepare は未コミットの変更を上書きしません。
- リモート Git 専用の資格情報は workspace の `gitEnvironmentRefs`、エージェント専用の変数は agent の `environmentRefs` に設定します。既存の workspace の `environmentRefs` は引き続き共有です。
- `sessions.create/resume/get/list/close` と `newWorktree: true` で各ローカル主ブランチから同名ブランチを作成します。`repositoryId` を指定すると、登録済みリポジトリのルートで開始・再開し、エージェントがそのルールとスキルを検出できます。prompt/stream、厳密な構造化結果、権限、MCP、設定、キャンセルは ACP の能力を確認して実行します。
- `session.info()` が成功すると `data.workspace` から同じノード上のプレビューに必要なパスとボリューム情報を取得できます。プレビューを停止して変更を保存した後、`sessions.reclaimWorktree(id)` で対象のクリーンな worktree を削除できます。ブランチ、通常ファイル、履歴、ボリュームは保持されます。
- `session.updateMain()` は指定主ブランチを fetch/ff-only 更新します。`publish({ mode: 'merge-main' | 'push-branch', message, author })` は管理対象の分離セッションだけを公開し、リポジトリ単位の部分失敗を報告します。強制 push は行いません。実行環境を停止してから操作し、続行には明示的に resume します。

確認済み容量、モダリティ、推論能力は `llm.models[].capabilities` に設定します。Codex は Responses を必要とし、既存 Hai 変換は逆方向ゲートウェイではありません。close 後もコード/状態を保持し、所有プロセス停止を確認後 CAS 占有を解放します。worktree はセキュリティサンドボックスではありません。

DeepSeek Harness から公式の DeepSeek Chat に接続する場合、モデルに `protocol: 'chat'` と `baseUrl: 'https://api.deepseek.com'` を指定します。内部リレーでも公式モデル ID `deepseek-flash` または `deepseek-v4-pro` を維持すると、同じ設定が適用されます。Harness は指示を `system` ロールで送信し、DeepSeek の出力上限フィールドを使用します。ツール結果を送信する際は `reasoning_content` を保持します。 [DeepSeek Chat API](https://api-docs.deepseek.com/api/create-chat-completion/)

Agent イメージのビルドでは `minimal`、`documents`、`office`、`browser`、`developer` を選択できます。既定のイメージには Git、Node、ネイティブ Agent が含まれ、Codex には bubblewrap も含まれます。実行環境にはローカルのイメージ ID またはリモートのマニフェスト digest を登録します。[Agent イメージ](models/agents/README.md)

ACP は Node サービスで実行します。通常の API は HaiResult を返し、ストリームの失敗は例外になります。[ACP ガイド](../cli/templates/skills/hai-ai/acp.md)

管理対象 Git でサブモジュールや Git LFS 属性を検出すると ACP_UNSUPPORTED を返し、不完全な内容を準備完了として扱いません。

##### 認証済みユーザーの管理対象 ACP を実行する

RelDB と [Runner](../runner/README.ja.md) を起動し、起動済みのインスタンスを `ai.init(config, { runner, acpPolicy })` に渡します。`acp.agents` に Agent を登録し、`environmentIds` で固定イメージの Runner 環境を、`modelIds` で `llm.models` のモデルを指定します。Codex には Responses ゲートウェイが必要です。API ノードと実行ノードではデータベースと環境定義を揃えます。終了時は AI、Runner、データベースの順に閉じます。

`task` はそのセッション用の専用 Worker を起動します。`user` は主体と起動設定が一致する場合に Worker を再利用できます。`auto` はアプリのポリシーに基づいて選択します。`shared` を利用できるのは、共有を明示的に承認した読み取り専用アダプターで、非公開コンテキスト、ワークスペース、ツールを要求しない場合です。組み込みの Codex、DeepSeek Harness、Goose は専用モードを使用します。[ACP 設定例](../../docs/usage/configuration/ai.md#acp-接入与模型能力)

```ts
import type { RunnerScope } from '@h-ai/runner' // 認証済みアプリセッションから tenantId と userId を取得する。
import { ai } from '@h-ai/ai' // Runner を渡して初期化済みのサーバーインスタンス。

async function summarize(identity: RunnerScope, requestId: string) {
  const agent = ai.acp.scoped(identity) // 以降のジョブ、セッション、承認をこの主体に紐づける。
  const options = {
    agentId: 'assistant',
    execution: { mode: 'auto' as const }
  } // assistant は登録済み Agent。
  const plan = await agent.plan(options) // コンテナを取得せず、有効なモード、環境、モデル、リソースを返す。
  if (!plan.success)
    return plan // 環境や権限が合わない場合は投入しない。
  const result = await agent.run({ ...options, prompt: 'リリースの確認項目を三つ挙げて', idempotencyKey: requestId }) // taskId、output、有効なオプションを返す。
  if (!result.success)
    return result // 投入、実行、後片付けの失敗を HaiResult として返す。
  const events = await agent.tasks.events(result.data.taskId, 0, 20) // 最初の 20 イベントを読み、空なら []。
  if (!events.success)
    return events
  return { result: result.data, events: events.data } // 例として output.text に回答、events に順序付きのイベントが入る。
}
```

```ts
import type { RunnerScope } from '@h-ai/runner' // サーバーで認証した主体。
import { ai } from '@h-ai/ai' // assistant を登録し、同じユーザー内の Worker 再利用が可能とする。

async function continueWork(identity: RunnerScope) {
  const agent = ai.acp.scoped(identity) // アクセスをこの主体に紐づける。
  const created = await agent.sessions.create({
    agentId: 'assistant',
    execution: { mode: 'user' }
  }) // 成功時は id 付きのセッションハンドル。
  if (!created.success)
    return created
  const session = created.data // prompt、stream、changeExecution、close が使える。
  const run = async () => {
    const first = await session.prompt('受け入れ条件を記録して') // このターンの taskId、output、有効なオプションを返す。
    if (!first.success)
      return first
    const switched = await session.changeExecution({ mode: 'task', acceptNewSession: true }) // 業務上の id を維持し、新しいネイティブセッションを開始する。
    if (!switched.success)
      return switched
    return await session.prompt('独立した受け入れチェックリストを出して') // 成功時の回答は data.output。
  }
  return run().finally(async () => {
    const closed = await session.close() // 成功時の data は undefined。セッションまたは専用環境を解放する。
    if (!closed.success)
      throw new Error(closed.error.message)
  })
}
```

`agents.describe(agentId)` で組み込みアダプターの機能を確認できます。`sessions.get(id)` は同じ主体が別の API ノードからハンドルを取得するために使います。`session.stream(prompt, options)` は保存済みイベントを順に返し、失敗時は例外を送出します。`tasks.get(taskId)` は実行受付票、`tasks.cancel(taskId)` はキャンセル受理後の状態を返します。`run` や `prompt` の `onEvent` に届く `accepted` イベントから `taskId` を取得し、別のリクエストで照会やキャンセルを行えます。

`acpPolicy` で `workspaceId` のスナップショット、ナレッジ、メモリ、ファイル、スキル、ツールを認可します。下記の MCP 入口には `allowTools` と `bindTools` を使います。`approval` イベントの `approvalId` に対して、同じ主体で `approvals.respond(id, 'allow-once' | 'allow-session' | 'always-allow' | 'deny')` を呼びます。成功時は `undefined` です。`approvals.rules(offset, limit)` は `expiresAt` を持つ有効なルールをページ取得し、`approvals.revoke(ruleId)` は主体自身のルールを取り消します。`full-access` にはアプリの明示的な承認と `task` モードが必要です。ワークスペースは読み取り専用スナップショットです。モード切り替え時にユーザーが確認した `historySummary` を渡せます。[管理対象 ACP の利用例](../../docs/usage/development/ai-acp.md#多用户应用的受管调用)

#### 設定とデータベースのリソース一覧

`llm.models`、`audio.models`、`image.models`、`mcp.servers`、`retrieval.sources`、`acp.agents/workspaces` は設定と DB を統合します。同じ ID は設定を優先し、設定は読み取り専用です。DB は list/get/register/update/remove に対応し、value/source/version と任意のバージョン照合を使用します。非同期呼び出しは最新の定義を読み、同期音声機能照会は直近のローカル情報を使います。エラーは 090–094。定義には認証情報が含まれるため、信頼できるサーバー管理 API として使用します。

[Resource catalogs](../cli/templates/skills/hai-ai/resources.md) · [ACP](../cli/templates/skills/hai-ai/acp.md)

#### A2A プロトコルの境界

リモート呼び出しのヘッダーは大文字小文字を区別せず上書きします。固定 JSON-RPC URL は HTTP リダイレクトを拒否し、認証ヘッダーを転送先へ渡しません。

`ai.a2a.getAgentCard()` は `supportedInterfaces`、MIME、streaming 機能を含むHTTP 検出応答に直接使える標準 A2A 1.0 ProtoJSON を返します。Kit の既定検出パスは `/.well-known/agent-card.json`。`handleRequest()` は常に JSON-RPC/SSE の結果を返し、未初期化時は JSON-RPC エラーです。信頼された HTTP の `agentId` を executor の `context.user.userName` に対応付けます。JSON-RPC/SSE に対応し、push notifications・gRPC・REST 対応は宣言しません。業務リソースの認可はアプリの責任です。

A2A の journal・context 所有者・メッセージテーブルは `ai.init()` で初期化します。取得・キャンセル・継続は信頼された `agentId` で分離します。匿名は共通主体のため、本番は信頼された伝送層で認証してください。`listMessages` は `callerId`・`contextId`・`since` を持つ管理 API であり、未認可クライアントへ公開しません。

Task とイベントは同じ共有 journal を使用し、従来の独立 TaskStore は組み込みません。push notification 設定と authenticated extended card の RPC は SDK 標準の未対応・未設定エラーを返し、タスクを実行しません。executor 関連型は公開を維持し、内部 handler/Store の組み立て型は公開契約に含めません。

入力メッセージの永続化後、共有実行世代と期限を再確認してから executor を開始します。agent メッセージは既存の有界イベントキューでログ保存を待ち、journal に公開します。保存失敗は failed/interrupted Task となり、成功を偽装せず、同じメッセージの再送で業務を再実行しません。ログと journal は別レコードなので、ログの存在だけで配信成功と判断せず、Task の `requiresEffectReconciliation` に従って副作用を確認します。照会失敗は SQL・接続情報を含まない `A2A_LIST_MESSAGES_FAILED`（984）です。

Task とイベントは同じ CAS で保存し、任意ノードで購読できます。同一 message ID/内容の再試行は同じ結果を返し、内容変更や古いラウンドは拒否します。別ノードからのキャンセルは実行 owner の executor.cancelTask を呼び、確認待ちの間は同じ Task の新規メッセージを拒否して古いコールバックの影響を防ぎます。input-required は再起動後も継続できます。租約切れ・実行期限・working のまま終了した実行器は failed/interrupted となり、`metadata.haiExecution.requiresEffectReconciliation=true` を付けます。古い owner の書き込みと未知の外部効果の自動再実行を禁止します。`a2a.execution` の既定値は `leaseMs: 30000`、`pollIntervalMs: 250`、`maxExecutionMs: 300000`。上限はメッセージ 1 MiB、journal 8 MiB、1 ラウンド 2048 イベント、Task 256 回执、reference tasks 32 件です。安定した業務冪等キーと外部効果の照合が必要です。[共有状態表（中国語）](../../.agents/instructions/distributed-state.md)に保証と検証範囲を記載しています。

#### MCP Server

`ai.mcp` はプロセス内の登録機能、独立 `createMcpServer` は SDK transport を使い、互いの自動登録はしません。`ai.mcp` は登録時にツールの JSON Schema をコンパイルし、呼び出し時に入力を検証します。リソースは `text` / `blob` のいずれか一方だけを持ちます。プロンプト引数・SDK メッセージ出力も検証し、画像・音声に対応します。HTTP 例は transport 接続のみで、アプリがリクエスト処理・認証を接続し、終了時に server を閉じる必要があります。

```ts
import { createMcpServer, StreamableHTTPServerTransport } from '@h-ai/ai'
import { z } from 'zod'

const server = createMcpServer({ name: 'my-server', version: '1.0.0' })
server.registerTool('search', {
  description: '搜索',
  inputSchema: {
    query: z.string()
  },
}, async ({ query }) => ({
  content: [
    { type: 'text', text: `Results for ${query}` }
  ],
}))
await server.connect(new StreamableHTTPServerTransport({
  sessionIdGenerator: () => globalThis.crypto.randomUUID()
}))
```

##### リモート MCP と独立ツールジョブを呼び出す

`mcp.servers` の `transport: http` に外部 Streamable HTTP の URL と `allowedTools` を登録します。認証には `headerEnv` からサーバーの環境変数を参照します。`transport: job` では同じ API からオフラインの文書、Office、OCR を実行できます。`environmentId`、許可する操作、任意の `pool` を設定し、Runner と `mcpJobFiles` を `ai.init` に渡します。ジョブには認可済みの `fileId` を渡します。実行ノードがアクセス権を再確認し、成果物をオブジェクト ID で返します。ブラウザーイメージは独立して運用します。[MCP の設定](../../docs/usage/configuration/ai.md#mcp和a2a) · [ツールイメージ](tools/README.md)

```ts
import type { MCPServiceAuthorization } from '@h-ai/ai' // IAM に基づく主体と、実際の引数を検証する認可コールバックを渡す。
import { ai } from '@h-ai/ai' // manual と office を登録済みのサーバーインスタンス。

async function searchManual(access: MCPServiceAuthorization, query: string) {
  const result = await ai.mcp.services.invoke({
    serviceId: 'manual',
    tool: 'search_manual',
    arguments: { query }
  }, access) // 登録と認可を確認し、標準の MCP ツール結果を返す。
  if (!result.success)
    return result // 拒否または上流サービスの失敗を返す。
  return result.data.content // 例: [{ type: 'text', text: '...' }]。
}

async function convertDocument(access: MCPServiceAuthorization, fileId: string) {
  const result = await ai.mcp.services.invoke({
    serviceId: 'office',
    tool: 'office.convert',
    arguments: { fileId }
  }, access) // 認可済みオブジェクト ID でオフライン変換を投入する。
  if (!result.success)
    return result
  return result.data.structuredContent // 例: { fileId: 'pdf-123', name: 'result.pdf' }。ダウンロード時に再認可する。
}
```

```ts
import type { MCPServiceAuthorization, MCPServiceBrokerOptions } from '@h-ai/ai' // デプロイ時の URL と、主体・ジョブ・引数を再確認する authorize を渡す。
import { createServer } from 'node:http' // 例の HTTP 入口を作成する。
import { ai } from '@h-ai/ai' // manual を登録済みのサーバーインスタンス。

function mountTools(options: MCPServiceBrokerOptions) {
  const result = ai.mcp.services.createBroker(options) // 成功時は bind、handleRequest、close を提供する。
  if (!result.success)
    throw new Error(result.error.message)
  const broker = result.data // 各実行ノードで Broker を作る。
  const server = createServer((req, res) => {
    void broker.handleRequest(req, res)
  }) // 入口の MCP リクエストを処理する。
  return { broker, server } // ホストが固定アドレスを待ち受け、通信を保護し、終了時に broker.close() と server.close() を呼ぶ。
}

async function bindManual(broker: ReturnType<typeof mountTools>['broker'], principal: MCPServiceAuthorization['principal'], sessionId: string, signal: AbortSignal) {
  const result = await broker.bind({
    principal,
    taskId: sessionId,
    signal,
    tools: [
      {
        id: 'manual_search',
        serviceId: 'manual',
        tool: 'search_manual', // モデルに表示する名前と登録済みの操作名を設定する。
        description: 'Search authorized manuals', // モデルに渡す説明。
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query'],
          additionalProperties: false
        }, // 呼び出し時に引数を検証する。
      }
    ]
  }) // 成功時は { servers, revoke }。servers に現在のセッション用の短期 Bearer が入る。
  if (!result.success)
    throw new Error(result.error.message)
  return result.data // ACPPlatformPolicy.bindTools から返す。セッション終了時に資格情報が無効になる。
}
```

#### Memory / RAG / Knowledge

標準のデータベース Store は、ネイティブメモリとベクトル同期の保留操作を同じトランザクションで確定します。追加、更新、削除、一括削除の成功はリレーショナル側の確定を表します。ベクトル索引は後から同期されます。ベクトルストア障害時も確定済みのリレーショナルレコードを参照します。両方のストアを共有する各ノードが、再起動後も保留操作を分割して再試行できます。

ネイティブメモリの名前空間は `ai.init({ memory: { vectorNamespace: 'orders-prod' } })` で指定します。既定値は `default` です。Qdrant を共有する場合も、リレーショナルデータベースごとに個別のコレクションが割り当てられます。同じアプリのノードではデータベース、名前空間、ベクトル基盤を揃えてください。アップグレード時は保存済みの埋め込みから索引を再構築します。既存のメモリは検索でき、旧共有コレクションは保持されます。専用コレクションを巡回して遅延書き込みを削除し、ページごとの進捗を保存して再起動後に再開します。 [アップグレード手順](../../docs/usage/configuration/ai.md#从旧共享集合升级)

`ai.memory.scoped({ objectId })` は空でなく空白のみでもない主体 ID を要求し、不正な入力ではファクトリーが直ちに `TypeError` を送出します。未束縛のインスタンスは作成しません。`clear({ scope: {} })` など空範囲の公開削除は失敗し、主体横断の全削除には明示的な管理 API が必要です。ネイティブ記憶のアクセス統計と更新はバージョン CAS を使い、遅れた読み取りで削除済みデータを復活させません。リレーショナル側のトランザクションに失敗した場合は HaiResult で返します。ベクトル同期は自動的に再試行されます。

Knowledge は取り込みごとに一意の `revision` と chunk ID を生成します。全文・ベクトル・エンティティを準備し、永続ステージングマニフェストとベクトルを書いた後、共有 Store CAS で完全なスナップショットを一度に公開します。同じ文書の再構築は一つの writer に制限され、失敗時は完全な旧版を保持します。短い新版に旧末尾 chunk が混在しません。検索は未公開版を除外し、公開と競合すれば再試行します。競合が続く場合はエラーを返します。候補拡張や清掃待ちは検索負荷を増やすことがあります。

成功結果の `revision` と `cleanupPending` を確認してください。後者が true の場合、新版は公開済みですが旧ベクトルの清掃が残っています。`repair({ collection, offset, limit })` で全ページを定期処理してください。setup は最初の 100 マニフェストを確認します。ステージングは保存先時計で 5 分後に失効し、旧 writer は公開できません。遅延した外部書き込みを繰り返し清掃するため、放棄版の墓碑は永久保持し、ログと共に削除しません。SQL とベクトルは共通トランザクションではありません。文書・集合の削除は先に可視性を取り消し、清掃失敗を返します。集合削除は空ベクトル集合と世代墓碑を補償用に残し、再 setup で旧世代を復元しません。

DB Store は集合・ベクトルの失敗を伝播します。LanceDB は永続主キーの原子 merge を使い、Qdrant は書き込み・削除の適用を待ち、正確な件数を取得します。分散ノードは同一の関係保存先とサーバー型ベクトル基盤を共有します。独自 KnowledgeStore も同じ公開・補償契約が必要です。

LanceDB の集合次元と metric は Arrow schema に永続化され、接続設定は新規集合にのみ影響します。再起動後は同じ永続ディレクトリを使い、embedding 次元を変更する場合は集合を再作成してください。別ノードのローカルパスは自動共有されないため、分散 Knowledge にはサーバー型ベクトルバックエンドを使用します。

Knowledge の `retrieve/ask` と既定 DB Store は `filter` をベクトル Provider に渡し、検証・検索エラーを上位に伝えます。Knowledge は空結果に偽装せず `KNOWLEDGE_RETRIEVE_FAILED`（ask は `RAG_FAILED`）を返します。LanceDB は最上位のリテラルキーについて string・有限 number・boolean・null の AND 完全一致のみを支援します。例：`{ tenant: 'acme', active: true }`。null は欠落キーに一致せず、オブジェクト・配列・undefined は非対応です。フィルターはベクトル topK の前に適用します。他バックエンドの null・複合値の意味は個別に確認してください。LanceDB metadata は入れ子 JSON も保存できるネイティブ JSON フィールドになり、旧文字列形式は書き込み・フィルター前に再作成が必要です。

```ts
const enriched = await ai.memory.injectMemories(messages, { objectId: 'user-001', topK: 5 })
if (!enriched.success) {
  return enriched
}

// 多租户推荐入口：scoped() 绑定主体与作用域，所有操作自动携带 objectId / scope（含归属校验），杜绝「忘记传 objectId」越权
const memory = ai.memory.scoped({
  objectId: 'user-001',
  scope: { topicId: 't-1', personaId: 'p-1' }
})
await memory.add({ content: '用户偏好中文', type: 'preference' })
const recalled = await memory.recall('语言偏好')

// clear 拒绝空过滤（防误清全局）；全局清空只能显式走管理接口
await memory.clear({
  types: ['event']
}) // 仅清该作用域内的 event
await ai.memory.admin.clearAll({ confirm: true }) // 危险：清空整个记忆后端，需显式确认

const rag = await ai.rag.query('核心架构是什么？', {
  sources: ['docs'],
  topK: 5
})

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

Knowledge は datapipe の単位と上限に従い、word は語数、その他は Unicode code point として清洗後テキストの区切りを保持します。AI の既定は markdown/maxSize=1500/overlap=200 のままです。maxSize を小さく上書きする際は継承する overlap もそれ未満にしてください。不正な分割設定・正規表現は embedding と版の公開前に KNOWLEDGE_INGEST_FAILED を返し、文書全体への無制限フォールバックは行いません。

#### 音声（Audio）

先に `ai.init()` で音声モデルを登録し、既定の認識・合成モデルを対応付けます。認証情報はプラットフォームの環境変数へフォールバックします。LLM と音声が同じ認証情報を使うと確認できた場合にのみ、`inheritLlmApiKey` を明示的に有効化してください：

`provider` は展開場所ではなく呼び出しプロトコルを表します。`openai` / `mimo` / `qwen` / `doubao` はクラウド、`whisper`（ASR）/ `indextts`（TTS）は自前配置可能なプロトコルです。既定 endpoint がないため `baseUrl` が必要で、同じ方式でクラウド・社内・ローカルを切り替えても業務コードは変わりません。クラウドの認証不足は `CONFIGURATION_ERROR`。自前サービスは認証情報を省略可能で、`apiKey` 指定時は `Authorization: Bearer` を送信します。

```ts
await ai.init({
  llm: {
    apiKey: process.env.HAI_AI_LLM_APIKEY,
  },
  audio: {
    inheritLlmApiKey: true,
    models: [
      {
        id: 'asr',
        provider: 'qwen',
        model: 'qwen3-asr-flash-realtime',
        operations: ['transcribe']
      },
      {
        id: 'tts',
        provider: 'qwen',
        model: 'qwen3-tts-flash-realtime',
        operations: ['synthesize']
      },
      // 自托管：whisper / indextts 必须显式配置 baseUrl
      {
        id: 'whisper',
        provider: 'whisper',
        model: 'faster-whisper-large-v3',
        operations: ['transcribe'],
        baseUrl: 'http://127.0.0.1:8101/v1'
      },
      {
        id: 'indextts',
        provider: 'indextts',
        model: 'indextts-2.5',
        operations: ['synthesize'],
        baseUrl: 'http://127.0.0.1:8102/v1'
      },
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

`ai.audio.synthesize` は共通の `AudioContent` バイト列を返します。API でブラウザー再生可能な Base64 を返すには `serializePlayableAudio(result.data)` を使い、`pcm16` を WAV コンテナーに包み、WAV/MP3 はそのまま渡します：

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

`OptionalSecretSchema` は LLM・Audio・Image の任意の鍵に共通で、YAML の `null`、空文字列、空白のみを `undefined` に正規化します。音声の優先順位はモデルの `apiKey` → 継承有効時の LLM `apiKey` → プラットフォーム環境変数です。異なるサービスの鍵の誤使用を防ぐため `inheritLlmApiKey` は既定で無効です。

> `synthesizeStream` は厳密に `segment_started → audio* → segment_done` を返します。`segment_started` はサーバーが Provider を解決した**実際の出力音声パラメーター**（`format` / `sampleRate` / `channels`）を持ちます。プレイヤーは要求値から推測せず、この値で復号し、実際の再生完了後にのみ該当テキストを `spokenText` へ追加してください。再生状態はアプリが管理します。

キャンセル・時間超過・接続障害はドメインエラーです。`AbortSignal` は `AUDIO_CANCELLED`、時間超過は `AUDIO_TIMEOUT`、接続失敗・`end` 前の異常切断は `AUDIO_CONNECTION_FAILED`。接続時間は `audio.maxStreamDurationMs`（既定 5 分）で制限します。

ブラウザー・モバイルは `@h-ai/serv` の共通音声 WebSocket を使用します。`@h-ai/ai/client` は通信詳細を隠して Node と同じ `audio.*` API を提供します。クライアントは正常終了・キャンセル（`AUDIO_CANCELLED`）・異常切断（`AUDIO_CONNECTION_FAILED`）を区別し、キャンセルや `end` 前の切断で対応コードを throw します。`synthesize` は未完了の部分音声を成功として返しません。

Node の IndexTTS は同じ Undici バージョンの fetch・Agent・multipart 型を組み合わせます。モデル `timeout` は応答ヘッダーと本文の待機に適用し、利用者の取消は `AUDIO_CANCELLED`、期限超過は `AUDIO_TIMEOUT` です。成功・失敗・取消のいずれも専用接続を閉じ、区間単位ストリーミングのエラーは反復中に送出します。

> 自前の CPU/GPU モデルサービス（faster-whisper / IndexTTS / Qwen3-4B）、重み取得、オフライン化は [models/（中国語）](./models/README.md) を参照してください。イメージ・重みは ModelScope を優先し、HuggingFace ミラーへ自動フォールバックします。

#### 画像生成（Image）

`ai.init()` で登録後、呼び出し元は標準化された画像バイト列のみを受け取り、サービス固有の Base64・インラインデータ・一時 URL を意識しません：

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

`referenceImages` は省略可能です。公開層は画像バイト列と MIME のみを受け付け、multipart・`inlineData`・Data URL は Provider が変換します。認証情報はモデル項目、`HAI_AI_IMAGE_<PROVIDER>_APIKEY`、サービス環境変数で指定できます。Qwen・Seedream の一時 URL は Provider 内ですぐダウンロードし、公開戻り値に出しません。詳細は [REFERENCE.md（中国語）](./REFERENCE.md#image) を参照してください。

ダウンロードは認証情報を含まない既定ポート 443 の公開 HTTPS に限定します。socket の DNS 解決で全アドレスを検証し、同じ結果で接続します。IPv4/IPv6 のプライベート・ループバック・リンクローカル・変換/マップ・予約アドレスを拒否します。リダイレクトは最大 3 回で各段階を再検証し、独立接続に厂商認証ヘッダーやアプリ Cookie を渡しません。`baseUrl` は運用者が管理する信頼された設定で、厂商 API 自体のリダイレクトは拒否します。

`image.maxImageBytes` は出力/参照画像ごとに既定 20971520（20 MiB、最大 100 MiB）、`image.maxImages` は出力/参照画像数ごとに既定 4（最大 16）です。URL は順次取得し、解凍後を含む実測バイト数が上限を超えると応答をキャンセルします。JSON は `max(64 KiB, 2 × maxImageBytes)`、エラー本文は 64 KiB までです。モデル `timeout` は既定 120000ms で API・リダイレクト・全ダウンロードを含み、`signal` で全体をキャンセルできます。出力は PNG/JPEG/GIF/WebP の MIME とマジック値の一致を要求し、SVG は拒否します。完全な画像デコード・寸法検証は行いません。アドレス拒否・上限超過・タイムアウトはそれぞれ `IMAGE_DOWNLOAD_BLOCKED`・`IMAGE_TOO_LARGE`・`IMAGE_TIMEOUT` を返すため、success を確認してください。

#### ファイル解析（File）

業務のファイル内容と名前を `ai.file.parse({ content, filename, options: { outputFormat: 'markdown' } })` に渡します。`success` を確認してから `data.text` を読み、通常のテキストには `outputFormat: 'text'` を使います。HTML は parse5 と反復走査で処理し、script/style を除外して、見出し・リスト・リンク・画像・引用・コード・表などの一般的な Markdown 構造を保持します。不正なタグの正規表現バックトラック対策として正常な文書を切り詰めません。

結果はテキストまたは Markdown であり、信頼済み HTML ではありません。テキストバインディングまたはフレームワークの `MarkdownRenderer` で表示し、直接 `{@html}` に渡さないでください。設定、引数、エラーコードは従来の契約を維持します。

#### Context 管理

自動記憶抽出は現在のノードのバックグラウンドで動作し、`pendingMemoryTasks=0` だけでは成功を示しません。`flush()` は当該バッチを待ち、例外と失敗 HaiResult を件数付き `MEMORY_EXTRACT_FAILED` として返します。同時の観測者は同じ結果を受け取り、戻り時点で報告を確認済みとし、次回は新規タスクだけを観測します。部分実行の可能性がある処理を自動再実行しません。`save()`・`reset({ waitForMemoryTasks: true })`・`consolidate()` は失敗時に後続の書き込みへ進まず、プロセス停止後の外部効果は別途確認します。

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

同じ管理器では既定で**同時に 1 つの生成のみ**を許可し、前の AI が終了する前に次の user が書き込まれる順序乱れを防ぎます。`reset()` は非同期で、活動中の生成を停止し、並行処理の障壁を解放、ターンを消去し、既定で Persona/System Prompt を再登録します。

##### 実際の対話状態（Conversation Commit Layer）

既定（`turnCommit: 'auto'`）では `chat` / `chatStream` が**生成した全文**を context に保存します。しかし生成 → TTS → 再生の途中で発話が遮られた場合、次のターンで共有すべき状態は全文ではなく**実際に再生された部分**です。

`turnCommit: 'manual'` では自動保存せず `turnId` を返し、呼び出し元が実際に起きた内容を確認して明示的に保存します。

`chatStream` は**モデル呼び出し前**にターン登録と `turn_started` を行います（`turn_started → delta* → done`、キャンセル時は `turn_started → delta* → cancelled`）。途中で `AbortSignal` により中止しても `turnId` と生成済みテキストを取得し、実際の内容を保存できます：

```ts
const created = ai.context.createManager({
  scope: { objectId: 'user-001', sessionId: 'sess-001' },
  turnCommit: 'manual'
})
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

- `commitTurn(turnId, { text? })`：実際の文を保存（省略時は生成全文）し、`completed` に設定。
- `interruptTurn(turnId, { text? })`：実際に表現した部分のみ保存（省略時は未発話として保存なし）し、`interrupted` に設定。
- `committed` の内容のみが context・記憶抽出に入り、未保存・破棄された部分は後続ターンへ影響しません。
- 流れの完了前に `interruptTurn` で遮った場合（司会が割り込む瞬間にモデルが終了する場合など）、`chatStream` は **`done` を返しません**。正常終了と誤認した追加保存を防ぎます。

##### セッションの定着（Memory ライフサイクル）

セッション中は各ターンで `scope: { sessionId }` の**短期セッション記憶**を抽出し、終了時に `consolidate()` で
短期記憶 + 要約を**セッションをまたぐ長期記憶**にします。`Session Memory → Summary → Long-term Memory` の流れです：

```ts
// 会话结束时固化：整合摘要 → 提取长期记忆（写入不含 sessionId 的持久作用域）
const created = ai.context.createManager({
  scope: { objectId: 'user-001', sessionId: 'sess-001' }
})
if (!created.success)
  return created
const result = await created.data.consolidate({
  scope: { userId: 'user-001', personaId: 'xiaoq' }
})
if (result.success) {
  // result.data.summary  —— 本次会话整合摘要
  // result.data.memories —— 固化到长期记忆的条目
}
```

#### Persona（AI の人格）

Memory は `objectId` / `scope` で誰の記憶かを表し、Persona は AI が誰かを定義します。各 AI に
安定したシステムプロンプト・性格を定義し、`scope: { personaId }` で長期記憶と関連付けます：

```ts
await ai.persona.save({
  id: 'xiaoq',
  name: '小Q',
  systemPrompt: '你是一位经济学家，善于从长期视角分析问题。',
  traits: ['数据驱动', '偏好引用真实案例'],
})

// 组合出可直接喂给 ContextManager 的系统提示词（systemPrompt + traits）
const composed = await ai.persona.compose('xiaoq')
if (!composed.success)
  return composed
const manager = ai.context.createManager({
  scope: { objectId: 'user-001', sessionId: 'persona-session' },
  systemPrompt: composed.data,
  memory: {
    enable: true,
    enableExtract: true,
    scope: { personaId: 'xiaoq' }
  },
})
```

`ai.persona` は `save` / `get` / `update` / `remove` / `list` / `compose` を提供し、`[objectId, id]` ごとにプロフィールを分離します。保存時は `objectId`、その他は `{ objectId }` を渡し、省略すると `system` のプラットフォーム用プロフィールを参照します。テナント操作には信頼された認証主体を結び付けてください。クライアントが送るプロフィール ID 自体はアクセス権を与えません。

### セキュリティ上の境界

- Prompt・検索文書・モデル出力は信頼できない入力として扱い、変更不可のシステム規則へユーザー内容を組み込まないでください。
- Zod はツール引数の形を検証するだけで権限を保証しません。高権限 handler は主体・テナント・所有者・割当量を確認し、自動実行を許可したツールのみをモデルへ登録してください。
- `callRemoteAgent()` は `ai.init()` のみで使える独立クライアントで、Agent Card・ローカル executor は不要です。非 HTTP(S)・URL 内認証情報を拒否しますが、アプリは origin 許可リストと出口側での DNS リバインディング・内部網へのリダイレクト・クラウドメタデータ対策を行う必要があります。
- 完全な Prompt・ツール引数・A2A headers・一時認証情報・query 付き遠隔 URL を記録せず、監査が必要な場合もマスク済みの概要のみ保存してください。

### 返されたハンドルの使用

registry は ai.tools.createRegistry()、manager は context.createManager/restoreManager の成功 data、session は管理 ACP sessions.create/get/resume の data、connection は acp.connect の data です。各ハンドルの生命周期と認可範囲を守ってください。scoped Memory は上記十操作と同名ですが、objectId/scope は工場で束縛され、呼出しごとに上書きしません。

| 入口                       | 用途                   | 入力                                                       | 出力                                                                   | 呼出し断片                                               |
| -------------------------- | ---------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| `registry.register`        | ツール登録             | `Tool`                                                     | `HaiResult<void>; duplicate rejected`                                  | `registry.register(tool)`                                |
| `registry.registerMany`    | 一括ツール登録         | `Tool[]`                                                   | `HaiResult<void>`                                                      | `registry.registerMany(tools)`                           |
| `registry.replace`         | ツールを明示的に置換   | `Tool with existing name`                                  | `HaiResult<void>`                                                      | `registry.replace(tool)`                                 |
| `registry.unregister`      | ツール解除             | `tool name`                                                | `boolean`                                                              | `registry.unregister("search")`                          |
| `registry.get`             | ツール参照             | `tool name`                                                | `Tool or undefined`                                                    | `registry.get("search")`                                 |
| `registry.has`             | ツール有無             | `tool name`                                                | `boolean`                                                              | `registry.has("search")`                                 |
| `registry.getNames`        | ツール名               | `none`                                                     | `string[]`                                                             | `registry.getNames()`                                    |
| `registry.getDefinitions`  | モデル用定義           | `none`                                                     | `ToolDefinition[]`                                                     | `registry.getDefinitions()`                              |
| `registry.execute`         | 認可後ツール実行       | `ToolCall, ToolExecutionOptions?`                          | `Promise<HaiResult<ToolMessage>>`                                      | `registry.execute(toolCall, { objectId: "u1" })`         |
| `registry.executeAll`      | 複数呼出し実行         | `ToolCall[], { parallel?, ...executionOptions }`           | `Promise<HaiResult<ToolMessage[]>>`                                    | `registry.executeAll(toolCalls)`                         |
| `registry.clear`           | ローカル一覧解除       | `none`                                                     | `void`                                                                 | `registry.clear()`                                       |
| `registry.size`            | ツール数               | `none`                                                     | `number`                                                               | `registry.size`                                          |
| `manager.addMessage`       | メッセージを追加       | `ChatMessage`                                              | `Promise<HaiResult<void>>`                                             | `manager.addMessage({ role: "user", content: "你好" })`  |
| `manager.getMessages`      | 会話スナップショット   | `none`                                                     | `HaiResult<ChatMessage[]>`                                             | `manager.getMessages()`                                  |
| `manager.reload`           | 共有状態を再読込       | `none`                                                     | `Promise<HaiResult<void>>`                                             | `manager.reload()`                                       |
| `manager.getTokenUsage`    | 文脈予算を観察         | `none`                                                     | `HaiResult<{ current, budget }>`                                       | `manager.getTokenUsage()`                                |
| `manager.getSummaries`     | 要約参照               | `none`                                                     | `HaiResult<SummaryResult[]>`                                           | `manager.getSummaries()`                                 |
| `manager.save`             | 文脈を保存             | `none`                                                     | `Promise<HaiResult<void>>`                                             | `manager.save()`                                         |
| `manager.flush`            | 背景記憶処理を待機     | `none`                                                     | `Promise<HaiResult<void>>`                                             | `manager.flush()`                                        |
| `manager.reset`            | 会話をリセット         | `ContextResetOptions?`                                     | `Promise<HaiResult<void>>`                                             | `manager.reset({ preserveSystemPrompt: true })`          |
| `manager.getTurns`         | 実際のターンを参照     | `none`                                                     | `HaiResult<ConversationTurn[]>`                                        | `manager.getTurns()`                                     |
| `manager.markTurnSpeaking` | 再生開始を記録         | `turnId`                                                   | `Promise<HaiResult<void>>`                                             | `manager.markTurnSpeaking(turnId)`                       |
| `manager.commitTurn`       | 実際の内容を確定       | `turnId, { text? }`                                        | `Promise<HaiResult<void>>`                                             | `manager.commitTurn(turnId, { text: spokenText })`       |
| `manager.interruptTurn`    | 中断前の内容を確定     | `turnId, { text? }`                                        | `Promise<HaiResult<void>>`                                             | `manager.interruptTurn(turnId, { text: spokenText })`    |
| `manager.consolidate`      | 長期記憶へ統合         | `ConsolidateOptions?`                                      | `Promise<HaiResult<{ summary, memories }>>`                            | `manager.consolidate({ scope: { personaId: "tutor" } })` |
| `manager.chat`             | 状態付き応答           | `message: string, ContextChatOptions?`                     | `Promise<HaiResult<ContextChatResult>>`                                | `manager.chat("请继续")`                                 |
| `manager.chatStream`       | 状態付きストリーム     | `message: string, ContextChatOptions?`                     | `AsyncIterable<ContextStreamEvent>`                                    | `manager.chatStream("请继续")`                           |
| `session.info`             | 管理会話参照           | `none`                                                     | `Promise<HaiResult<ACPSessionInfo>>`                                   | `session.info()`                                         |
| `session.prompt`           | 開発ターン実行         | `ContentBlock[], AbortSignal?`                             | `Promise<HaiResult<{ text, stopReason, events }>>`                     | `session.prompt([{ type: "text", text: "检查工程" }])`   |
| `session.promptStructured` | JSON 出力検証          | `ContentBlock[], Zod schema, AbortSignal?`                 | `Promise<HaiResult<schema-inferred T>>`                                | `session.promptStructured(content, OutputSchema)`        |
| `session.stream`           | 原生イベント観察       | `ContentBlock[], AbortSignal?`                             | `AsyncIterable<SessionNotification>; failure throws`                   | `session.stream([{ type: "text", text: "检查工程" }])`   |
| `session.cancel`           | 現在ターン取消         | `none`                                                     | `Promise<HaiResult<void>>`                                             | `session.cancel()`                                       |
| `session.setMode`          | 公開されたモードを選択 | `native mode ID`                                           | `Promise<HaiResult<native mode response>>`                             | `session.setMode("code")`                                |
| `session.setConfigOption`  | 公開された設定を指定   | `native option key and allowed value`                      | `Promise<HaiResult<native config response>>`                           | `session.setConfigOption("model", "coding")`             |
| `session.updateMain`       | 主分岐を早送り更新     | `none; execution and preview must be stopped`              | `Promise<HaiResult<ACPGitReport[]>>; partial failure reports in cause` | `session.updateMain()`                                   |
| `session.publish`          | コミットと push        | `{ mode, message, author }; managed isolated session only` | `Promise<HaiResult<ACPGitReport[]>>`                                   | `session.publish(publishOptions)`                        |
| `session.close`            | 実行停止と状態保持     | `none`                                                     | `Promise<HaiResult<void>>`                                             | `session.close()`                                        |
| `connection.authenticate`  | 原生認証               | `advertised authentication method ID`                      | `Promise<HaiResult<native auth response>>`                             | `connection.authenticate("api-key")`                     |
| `connection.createSession` | 低層原生会話作成       | `absolute remote cwd, McpServer[]?`                        | `Promise<HaiResult<{ id, prompt, cancel }>>`                           | `connection.createSession("/workspace/project", [])`     |
| `connection.listSessions`  | 原生会話一覧           | `cursor?`                                                  | `Promise<HaiResult<native paginated response>>`                        | `connection.listSessions()`                              |
| `connection.deleteSession` | 原生会話削除           | `native session ID`                                        | `Promise<HaiResult<native delete response>>`                           | `connection.deleteSession(nativeId)`                     |
| `connection.close`         | 低層接続を閉じる       | `none`                                                     | `Promise<HaiResult<void>>`                                             | `connection.close()`                                     |

## 設定

### 用途に応じた設定入口

| 設定入口    | 用途                       | 入力                                                                       | 効果                                                                 | 例                                                                                                        |
| ----------- | -------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `llm`       | モデル接続と要求形式       | model, protocol, apiKey/baseUrl, timeout, models/scenarios                 | chat/Responses/Anthropic selection; normalized model requests        | `{ llm: { model: "gpt-4o-mini", timeout: 60000 } }`                                                       |
| `embedding` | 検索ベクトル               | model?, dimensions?, batchSize?                                            | consistent vector dimensions for the target collection               | `{ embedding: { dimensions: 1536, batchSize: 100 } }`                                                     |
| `mcp`       | 外部ツールサービス         | servers with transport/endpoints or commands                               | registered server definitions; application authorizes tool execution | `{ mcp: { servers: [] } }`                                                                                |
| `retrieval` | 既定の検索元               | sources: { id, collection, topK?, minScore?, filter? }[]                   | queryable source definitions; does not import documents              | `{ retrieval: { sources: [{ id: "docs", collection: "manual", topK: 5 }] } }`                             |
| `knowledge` | 文書公開と分割             | collection, dimension, cleanOptions, chunkOptions                          | versioned document/vector publication and bounded chunks             | `{ knowledge: { collection: "manual", dimension: 1536, chunkOptions: { maxSize: 1500, overlap: 200 } } }` |
| `memory`    | 主体記憶の保存先           | provider, quotas, recencyDecay, defaultTopK, candidateMultiplier           | native or Mem0-format behavior with explicit persistence limits      | `{ memory: { provider: "native", defaultTopK: 10 } }`                                                     |
| `token`     | Token 推定                 | tokenRatio > 0; default 0.25                                               | local token budget estimates; not provider billing usage             | `{ token: { tokenRatio: 0.25 } }`                                                                         |
| `summary`   | 要約方針                   | systemPrompt?                                                              | prompt used by summary generation; model from llm.scenarios          | `{ summary: { systemPrompt: "保留已确认决策和待办" } }`                                                   |
| `compress`  | 文脈の圧縮予算             | defaultStrategy, defaultMaxTokens, preserveLastN                           | compression defaults; 0 budget derives from model limit              | `{ compress: { defaultStrategy: "hybrid", defaultMaxTokens: 4000, preserveLastN: 4 } }`                   |
| `file`      | OCR 抽出方針               | systemPrompt?; model via llm.scenarios.ocr                                 | text extraction instructions; not HTML sanitization                  | `{ file: { systemPrompt: "只提取可见文字" } }`                                                            |
| `audio`     | 音声モデルと上限           | models, transcribeModel/synthesizeModel, maxAudioBytes/maxStreamDurationMs | provider capability/operation selection and bounded input/stream     | `see Audio examples`                                                                                      |
| `image`     | 画像モデルと取得上限       | models, generateModel, maxImageBytes, maxImages; timeout per model         | generated bytes with MIME; unsafe downloads rejected                 | `see Image examples`                                                                                      |
| `a2a`       | エージェント発見と実行期限 | agentCard and execution lease/poll/deadline options                        | ProtoJSON discovery and shared task journal                          | `see A2A protocol section`                                                                                |
| `acp`       | エージェント実行制約       | agents/workspaces and execution content/event limits                       | validated definitions and managed native sessions                    | `see ACP guide`                                                                                           |

Rerank は LLM 全体の timeout を継承し、モデル単位で上書きできます。期限は応答本文まで含み、超過時は RERANK_API_ERROR を返します。

リクエスト形式は `llm.protocol`、`llm.models[].protocol` または呼出し単位の `tempModel.protocol` で指定し、`chat | responses | anthropic` を使います。環境変数は `HAI_AI_LLM_PROTOCOL`、`HAI_AI_LLM_MODELS_0_PROTOCOL`（モデルの添字に対応）です。認証情報は `apiKey` または非公開環境変数で渡します。

```yaml
llm:
  apiKey: ''
  baseUrl: https://api.openai.com/v1
  model: gpt-4o-mini
  protocol: chat # chat（默认）| responses | anthropic —— 底层 API 协议，对使用方透明
  timeout: 60000
  tempModelCacheTtl: 600000 # 临时模型客户端缓存 TTL（毫秒，默认 10 分钟）
  models: # 可为每个模型单独指定协议
    - {id: fast, model: gpt-4o-mini}
    - {id: strong, model: gpt-4.1, protocol: responses}
    - {id: claude, model: claude-3-5-sonnet-latest, protocol: anthropic}
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

`core.config.load('ai', ...)` では規約に沿う環境変数が YAML より優先されます：
例：`HAI_AI_LLM_APIKEY`、`HAI_AI_LLM_BASEURL`、`HAI_AI_LLM_MODEL`。

Mem0 データ形式アダプターの有効化：

```yaml
memory:
  provider: mem0
  defaultTopK: 10
```

- **`native`（既定・推奨）**：HAI のネイティブエンジンは vecdb、reldb、LLM、Embedding を再利用します。`extract` は **Mem0 型の一括マージ**で、抽出した事実と既存記憶に 1 回の LLM 呼び出しで ADD / UPDATE / DELETE / NONE を決定し、増分更新・重複除去・矛盾削除・`category` 分類を実現します。`maxEntriesPerObject`、`maxEntriesGlobal`、`recencyDecay`、`embeddingEnabled`、`writebackRelatedTopK` が適用されます。削除は `objectId` ごとなので、ある主体の大量書き込みでほかの主体の記憶は失いません。scope の候補は `objectId` で絞り（≤ `maxEntriesPerObject`）、PostgreSQL はさらに JSONB 包含検索へ scope を渡して **GIN インデックス**を使います。SQLite/MySQL はメモリー照合で同じ結果を返します。
- **`mem0`（データ形式アダプター）**：抽出と Embedding は Hai が行い、ネイティブ HTTP で Qdrant の Mem0 UUID/payload 形式を読み書きします。既存データも読み取れます。上流の完全なエンジン、テレメトリー、履歴 DB は実行しません。完全な接続設定を持つ Qdrant のみ対応します。本番（`NODE_ENV` または `HAI_CORE_ENV=production`）は一時ストレージへの移行を拒否します。開発・明示的 E2E のみ `memory.allowEphemeralFallback: true` を指定できます。他の永続バックエンドは `native` を選択します。

両 Provider は同じ `ai.memory.*`（`extract` / `recall` / `injectMemories` / `add` / `update` / `get` / `remove` / `list` / `listPage` / `clear`）を提供し、`objectId` の主体分離と `{ topicId, personaId }` などの `scope` をサポートします。`recall` / `list` / `listPage` / `clear` は scope を厳密に絞り、`clear` に `types` / `scope` を渡すと同時一致のみを削除します。mem0 の `extract` は共通抽出器で分類・採点（`types` / `model` / `minImportance` / `systemPrompt`）後、直接 `hai_type` / `hai_importance` を保存します。`recall` も `types` と `recencyWeight` 減衰に対応し、native と同じ動作です。Mem0 はテキストとメタデータをその場で更新し、`id` と作成時刻を保持します。候補走査は有界のため、`list` / `listPage` / 条件付き `clear` は期限切れを含む主体候補 1000 件まで対応します。1 件余分に読み、超過は `MEMORY_LIST_INCOMPLETE`（906）で失敗します。不正確な total や一部のみの条件付き削除は行いません。候補が完全な場合、UTC の有効期限、型、scope で絞ってからページ分割します。主体全体の削除 は一覧上限の対象外です。公開 API の空条件 clear は拒否し、全主体の削除は信頼された管理者による明示的な `admin.clearAll({ confirm: true })` に限定します。

Mem0 形式ストレージと VecDB の Qdrant Provider は追加 SDK なしでネイティブ HTTP を使います。固定 REST 要求は `query` とエンコードしたパスを使用し、30 秒のタイムアウトは応答本文全体を含みます。16 MiB を超える応答は明示的に失敗します。書き込みと削除は `wait=true` の適用完了を待ちます。一覧と条件付き削除は期限切れを含む主体候補 1000 件まで完全性を確認し、超過時は `MEMORY_LIST_INCOMPLETE` を返して部分削除しません。主体全体の削除はこの一覧上限の対象外です。

Qdrant 形式バックエンドは 1.19 以降が必要で、HTTP リダイレクトを拒否します。更新はサーバーの `update_only` と主体・版条件を同じ原子書き込みに適用し、削除済み・同時変更済みの行を拒否します。遅延更新で削除行は復活しません。書き込み後の版確認に失敗した場合は実際の効果を照合してください。

追加書き込みの応答には完全な業務フィールドがないため、`add` / `extract` は書き込み後に保存済みレコードを読み取ります。extract は全ての進行中の書き込み完了を待ちます。書き込みまたは再読み取り失敗時、`error.ext.requiresEffectReconciliation=true` と既知の ID の `memoryIds` を返します（応答消失時は空の場合もあります）。主体の実データを照合してから復旧し、add/extract を無条件に繰り返さないでください。自動再実行は行いません。

**候補集合と scope の検索漏れ**：`topK` で先に切り捨てると、別の話題・人格の関連性が高い記憶が対象 scope を押し出します。そのため `recall` / `injectMemories` は `topK × candidateMultiplier`（既定 5）件を取得してから絞り、`topK` 件にします。`topicId` + `personaId` など細かく分離する場合は `candidateMultiplier` を増やせます：

```ts
const memories = await ai.memory.recall('经济发展', {
  objectId: 'user-001',
  scope: { topicId: 'C' },
  topK: 10,
  candidateMultiplier: 8, // 覆盖配置默认值，扩大候选池
})
```

`ai.config` はマスク済み設定を返し、`apiKey`、`privateKey`、URL 内認証情報などをそのまま公開しません。

ネイティブメモリの追加は、共有データベースのトランザクション内で主体別と全体の上限を確認します。古い候補を一度に最大 64 件読み出し、重要度と経過時間から削除対象を選びます。既存データが上限を超えている間は、追加前に分割して整理します。カスタム共有 Store では `AIRelStore.withWriteLock` によって同じノード間の保証を提供できます。

## エラー処理

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

主なエラーコード範囲：

- `hai:ai:010-012`：初期化・設定。
- `hai:ai:100-107`：LLM・履歴。
- `hai:ai:300-302`：Embedding。
- `hai:ai:600-701`：Retrieval/RAG。
- `hai:ai:800-805`：Knowledge。
- `hai:ai:050-059`：Audio。
- `hai:ai:060-068`：Image（ダウンロード拒否、リソース上限、全体タイムアウトを含む）。
- `hai:ai:900-906`：Memory。
- `hai:ai:980-984`：A2A。

## 開発とテスト

```bash
pnpm --filter @h-ai/ai typecheck
pnpm --filter @h-ai/ai lint
pnpm --filter @h-ai/ai test
pnpm --filter @h-ai/ai build
```

公開 JSDoc の例は実際のパッケージ入口から import し、内部ファクトリの例はモジュール内部コンテキストを明示して実宣言で型検証します。ルートで `pnpm check:jsdoc --package ai` を実行すると網羅性と例の型を検証できます。通常の業務 API は HaiResult を確認し、ストリームとブラウザー AudioClient は明示された例外契約に従います。

## ライセンス

Apache-2.0
