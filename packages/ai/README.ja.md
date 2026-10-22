# @h-ai/ai

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/api-contract](../api-contract/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/datapipe](../datapipe/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md) · [@h-ai/vecdb](../vecdb/README.ja.md)

## 概要

共通の `ai` サービスで LLM 対話、画像生成、ツール、MCP、Embedding、記憶、検索/RAG、知識ベース、コンテキスト管理、ファイル解析、Rerank、音声（ASR/TTS）、A2A を提供します。Node.js では `ai.init()` で初期化し、ブラウザーからは API/client を経由します。

## 主な機能

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

`@h-ai/ai/client` は `createAudioClient({ url, getTicket })` と Audio クライアント型のみを公開します。HTTP は `@h-ai/api-client` の型付きドメインメソッドを使います。既定のチャット補完は非ストリーミングで、ストリームと A2A はアプリ独自の contract に結び付けます。文字列パスの旧クライアントと重複 SSE helper は削除しました。ブラウザーには Node の `ai` シングルトンを公開しません。

- `AIStoreProvider`：ストレージ抽象。本番は `stateScope: 'shared'` が必須で、組み込み実装は PostgreSQL/MySQL とネットワーク vecdb の初期化を必要とします。開発・明示的テストでは一時 Store を利用できます。

詳しいメソッド一覧・エラーコード・長い例は [REFERENCE.md（中国語）](./REFERENCE.md) を参照してください。

## 使い始める

### クイックスタート

#### 開発用 LLM のみ（DB 依存なし）

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

開発・明示的テストで reldb/vecdb が未初期化の場合、一時 Store を使い、終了やインスタンス切り替えで失われます。`NODE_ENV` または `HAI_CORE_ENV` が production の場合、一時 Store・SQLite・ローカル vecdb は初期化に失敗します。共有 RelDB とネットワーク vecdb を先に初期化するか、同等の原子的契約を満たす共有 Provider を指定してください。

#### 永続 DB Provider（reldb + vecdb）

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

MySQL の初回初期化は複数ノードで実行できます。mysql2 の明示的な ER_DUP_KEYNAME/1061 だけを受け入れ、実際の列・順序、非一意・列全体・昇順・可視 BTREE・式なしを再確認します。同名でも構造が異なれば失敗します。テーブル作成と INDEX 権限が必要で、メタデータ取得・権限・その他 DDL の失敗は ai.init の CONFIGURATION_ERROR になります。開始した全 DDL の終了を待ってから返します。MySQL DDL はロールバックされないため、権限や構造を修正してから再試行してください。各初期化結果を確認し、失敗時は業務リクエストを受けず、AI・vecdb・reldb の逆順で終了します。

#### 独自 StoreProvider

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

### API 契約

- 公開入口は `ai` サービスと `createMcpServer` など少数の独立ファクトリー。
- ライフサイクルは `await ai.init(config, options?)` / `await ai.close()`。終了時は独自 `AIStoreProvider.close()` を待ちます。
- ドメイン操作は `HaiResult<T>` または `Promise<HaiResult<T>>` を返し、`result.success === false` と `result.error.code` で失敗を表します。`AsyncIterable`、クライアント通信、外部コールバックは開始・反復時に例外を投げる場合があります。
- `ai.tools` と `ai.stream` は純粋関数で、初期化せず使用できます。
- 開発・テストで reldb/vecdb がなければ一時 Store、両方が初期化済みなら DB Provider を使います。本番では実際の DB/vecdb 共有能力を検証し、独自 Provider も正確な `stateScope` を宣言する必要があります。

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

#### A2A プロトコルの境界

`ai.a2a.getAgentCard()` は `protocolVersion`、MIME、streaming 機能を含む完全な A2A 0.3 Agent Card を返します。Kit の既定検出パスは `/.well-known/agent-card.json`。`handleRequest()` は常に JSON-RPC/SSE の結果を返し、未初期化時は JSON-RPC エラーです。信頼された HTTP の `agentId` を executor の `context.user.userName` に対応付けます。JSON-RPC/SSE に対応し、push notifications・gRPC・REST 対応は宣言しません。業務リソースの認可はアプリの責任です。

A2A の journal・context 所有者・メッセージテーブルは `ai.init()` で初期化します。取得・キャンセル・継続は信頼された `agentId` で分離します。匿名は共通主体のため、本番は信頼された伝送層で認証してください。`listMessages` は `callerId`・`contextId`・`since` を持つ管理 API であり、未認可クライアントへ公開しません。

Task とイベントは同じ共有 journal を使用し、従来の独立 TaskStore は組み込みません。push notification 設定と authenticated extended card の RPC は SDK 標準の未対応・未設定エラーを返し、タスクを実行しません。executor 関連型は公開を維持し、内部 handler/Store の組み立て型は公開契約に含めません。

入力メッセージの永続化後、共有実行世代と期限を再確認してから executor を開始します。agent メッセージは既存の有界イベントキューでログ保存を待ち、journal に公開します。保存失敗は failed/interrupted Task となり、成功を偽装せず、同じメッセージの再送で業務を再実行しません。ログと journal は別レコードなので、ログの存在だけで配信成功と判断せず、Task の `requiresEffectReconciliation` に従って副作用を確認します。照会失敗は SQL・接続情報を含まない `A2A_LIST_MESSAGES_FAILED`（984）です。

Task とイベントは同じ CAS で保存し、任意ノードで購読できます。同一 message ID/内容の再試行は同じ結果を返し、内容変更や古いラウンドは拒否します。別ノードからのキャンセルは実行 owner の executor.cancelTask を呼び、確認待ちの間は同じ Task の新規メッセージを拒否して古いコールバックの影響を防ぎます。input-required は再起動後も継続できます。租約切れ・実行期限・working のまま終了した実行器は failed/interrupted となり、`metadata.haiExecution.requiresEffectReconciliation=true` を付けます。古い owner の書き込みと未知の外部効果の自動再実行を禁止します。`a2a.execution` の既定値は `leaseMs: 30000`、`pollIntervalMs: 250`、`maxExecutionMs: 300000`。上限はメッセージ 1 MiB、journal 8 MiB、1 ラウンド 2048 イベント、Task 256 回执、reference tasks 32 件です。安定した業務冪等キーと外部効果の照合が必要です。[共有状態表（中国語）](../../docs/distributed-state.md)に保証と検証範囲を記載しています。

#### MCP Server

`ai.mcp` はプロセス内の登録機能、独立 `createMcpServer` は SDK transport を使い、互いの自動登録はしません。`ai.mcp` は登録時にツールの JSON Schema をコンパイルし、呼び出し時に入力を検証します。リソースは `text` / `blob` のいずれか一方だけを持ちます。プロンプト引数・SDK メッセージ出力も検証し、画像・音声に対応します。HTTP 例は transport 接続のみで、アプリがリクエスト処理・認証を接続し、終了時に server を閉じる必要があります。

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

- `commitTurn(turnId, { text? })`：実際の文を保存（省略時は生成全文）し、`completed` に設定。
- `interruptTurn(turnId, { text? })`：実際に表現した部分のみ保存（省略時は未発話として保存なし）し、`interrupted` に設定。
- `committed` の内容のみが context・記憶抽出に入り、未保存・破棄された部分は後続ターンへ影響しません。
- 流れの完了前に `interruptTurn` で遮った場合（司会が割り込む瞬間にモデルが終了する場合など）、`chatStream` は **`done` を返しません**。正常終了と誤認した追加保存を防ぎます。

##### セッションの定着（Memory ライフサイクル）

セッション中は各ターンで `scope: { sessionId }` の**短期セッション記憶**を抽出し、終了時に `consolidate()` で
短期記憶 + 要約を**セッションをまたぐ長期記憶**にします。`Session Memory → Summary → Long-term Memory` の流れです：

```ts
// 会话结束时固化：整合摘要 → 提取长期记忆（写入不含 sessionId 的持久作用域）
const result = await manager.consolidate({ scope: { userId: 'user-001', personaId: 'xiaoq' } })
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
const manager = ai.context.createManager({
  scope: { objectId: 'user-001', sessionId: 'persona-session' },
  systemPrompt: composed.data,
  memory: { enable: true, enableExtract: true, scope: { personaId: 'xiaoq' } },
})
```

`ai.persona` は `save` / `get` / `update` / `remove` / `list` / `compose` を提供します。プロフィールは全体で共有し、`objectId` では分離しません。

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

`core.config.load('ai', ...)` では規約に沿う環境変数が YAML より優先されます：
例：`HAI_AI_LLM_APIKEY`、`HAI_AI_LLM_BASEURL`、`HAI_AI_LLM_MODEL`。

mem0（組み込み mem0ai/oss エンジン）の有効化：

```yaml
memory:
  provider: mem0
  defaultTopK: 10
```

- **`native`（既定・推奨）**：HAI のネイティブエンジンは vecdb、reldb、LLM、Embedding を再利用します。`extract` は **Mem0 型の一括マージ**で、抽出した事実と既存記憶に 1 回の LLM 呼び出しで ADD / UPDATE / DELETE / NONE を決定し、増分更新・重複除去・矛盾削除・`category` 分類を実現します。`maxEntriesPerObject`、`maxEntriesGlobal`、`recencyDecay`、`embeddingEnabled`、`writebackRelatedTopK` が適用されます。削除は `objectId` ごとなので、ある主体の大量書き込みでほかの主体の記憶は失いません。scope の候補は `objectId` で絞り（≤ `maxEntriesPerObject`）、PostgreSQL はさらに JSONB 包含検索へ scope を渡して **GIN インデックス**を使います。SQLite/MySQL はメモリー照合で同じ結果を返します。
- **`mem0`（mem0ai/oss）**：`mem0ai/oss` の `Memory` エンジンを直接組み込み、クラウドを使いません。LLM/Embedder は `llm` 設定から取得し、`qdrant` は vecdb を再利用できます。現在のアダプターは完全な接続設定を持つ Qdrant のみをマッピングします。本番（`NODE_ENV` または `HAI_CORE_ENV=production`）では `memory.allowEphemeralFallback: true` でも実際のメモリーへの移行を拒否し、バックエンド未指定も失敗します。一時利用は開発または明示的な `HAI_E2E=1` / `HAI_E2E_MOCK=1` に限ります。履歴は既定で無効です。

両 Provider は同じ `ai.memory.*`（`extract` / `recall` / `injectMemories` / `add` / `update` / `get` / `remove` / `list` / `listPage` / `clear`）を提供し、`objectId` の主体分離と `{ topicId, personaId }` などの `scope` をサポートします。`recall` / `list` / `listPage` / `clear` は scope を厳密に絞り、`clear` に `types` / `scope` を渡すと同時一致のみを削除します。mem0 の `extract` は共通抽出器で分類・採点（`types` / `model` / `minImportance` / `systemPrompt`）後、`infer:false` で `hai_type` / `hai_importance` を保存します。`recall` も `types` と `recencyWeight` 減衰に対応し、native と同じ動作です。Mem0 はテキストとメタデータをその場で更新し、`id` と作成時刻を保持します。SDK の検索は `filters.user_id`、書き込みと主体全体の削除は `userId` を使います。SDK に一覧カーソルがないため、`list` / `listPage` / 条件付き `clear` は期限切れを含む主体候補 1000 件まで対応します。1 件余分に読み、超過は `MEMORY_LIST_INCOMPLETE`（906）で失敗します。不正確な total や一部のみの条件付き削除は行いません。候補が完全な場合、UTC の有効期限、型、scope で絞ってからページ分割します。主体全体の `deleteAll` は一覧上限の対象外です。公開 API の空条件 clear は拒否し、全主体の削除は信頼された管理者による明示的な `admin.clearAll({ confirm: true })` に限定します。

Mem0 3.3.1 は `QdrantClient.search` を呼び出すため、カタログと AI の optional peer は検証済みの `@qdrant/js-client-rest` `1.18.0` に固定します。起動時に公開メソッドを確認し、不整合は設定エラーにします。このメソッドを削除した 1.19 への上書きはできません。

Mem0 + pgvector は全環境で起動を拒否します。SDK が PostgreSQL 接続を私有オブジェクトに保持し、公開された close API がないためです。pgvector は `memory.provider: native` で利用でき、ネイティブの対応は維持します。`disableHistory: true` はリソースを持たない履歴実装を選び、履歴 SQLite ファイルを作成しません。ファクトリーは上限付きの公開読み取りでバックエンドの準備完了を待ってから成功を公開します。

SDK の追加応答には完全な業務フィールドがないため、`add` / `extract` は書き込み後に保存済みレコードを読み取ります。extract は全ての進行中の書き込み完了を待ちます。書き込みまたは再読み取り失敗時、`error.ext.requiresEffectReconciliation=true` と既知の ID の `memoryIds` を返します（応答消失時は空の場合もあります）。主体の実データを照合してから復旧し、add/extract を無条件に繰り返さないでください。自動再実行は行いません。

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

### セキュリティ上の境界

- Prompt・検索文書・モデル出力は信頼できない入力として扱い、変更不可のシステム規則へユーザー内容を組み込まないでください。
- Zod はツール引数の形を検証するだけで権限を保証しません。高権限 handler は主体・テナント・所有者・割当量を確認し、自動実行を許可したツールのみをモデルへ登録してください。
- `callRemoteAgent()` は `ai.init()` のみで使える独立クライアントで、Agent Card・ローカル executor は不要です。非 HTTP(S)・URL 内認証情報を拒否しますが、アプリは origin 許可リストと出口側での DNS リバインディング・内部網へのリダイレクト・クラウドメタデータ対策を行う必要があります。
- 完全な Prompt・ツール引数・A2A headers・一時認証情報・query 付き遠隔 URL を記録せず、監査が必要な場合もマスク済みの概要のみ保存してください。

### エラー処理

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

Store の拡張には公開 AIStoreProvider を使用します。組み込み LLM Provider、ファクトリ依存、Context 内部依存は非公開です。モデル接続は設定で行い、履歴照会、AskOptions、ChatRecord は公開を維持します。

公開 JSDoc の例は実際のパッケージ入口から import し、内部ファクトリの例はモジュール内部コンテキストを明示して実宣言で型検証します。ルートで `pnpm check:jsdoc --package ai` を実行すると網羅性と例の型を検証できます。通常の業務 API は HaiResult を確認し、ストリームとブラウザー AudioClient は明示された例外契約に従います。

Knowledge は datapipe の単位と上限に従い、word は語数、その他は Unicode code point として清洗後テキストの区切りを保持します。AI の既定は markdown/maxSize=1500/overlap=200 のままです。maxSize を小さく上書きする際は継承する overlap もそれ未満にしてください。不正な分割設定・正規表現は embedding と版の公開前に KNOWLEDGE_INGEST_FAILED を返し、文書全体への無制限フォールバックは行いません。

SSE は [WHATWG のイベントストリーム規則](https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation)に従い、分割された LF/CRLF/CR、複数 data 行、コロン直後の空白一つ、id/retry の継承、既定の message を扱います。EOF の未完了イベントは配信しません。encodeSSE は data の改行を正規化し、不正なメタデータは明示的に例外を返します。Anthropic/MiMo は UTF-8 reader を共有し、終了・取消・失敗時に本文を取消して解放します。自動再接続や業務再実行は行わず、Anthropic の timeout は本文まで、MiMo は各 HTTP リクエスト単位で適用します。

## ライセンス

Apache-2.0
