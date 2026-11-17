# @h-ai/ai API リファレンス

<!-- translation: partial -->

[原文（中国語）](ai.md) · [設定](../configuration/ai.ja.md) · [データ構造](../data/ai.ja.md)

<a id="quick-start"></a>

## クイックスタート

AI を呼び出す前にプロバイダーを初期化します。チャットまたは埋め込みから始め、必要に応じてツール、検索、永続セッションを追加します。認証済みのスコープとツールの認可はサーバーで決定します。

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

<a id="api-reference"></a>

## API 一覧

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `ai.llm.chat`, `chatStream`, `ask`, `askStream`, `generateObject` | メッセージや質問を送信し、必要に応じてストリーミングや構造化した出力の検証を行う。 | `await ai.llm.chat(request)` |
| `ai.llm.listModels`, `getHistory`, `listSessions` | 設定済みモデルや過去のやりとり・セッションを取得。 | `await ai.llm.listModels()` |
| `ai.tools.adapt`, `createBuiltinTools`, `createMcpTools`, `createBroker` | モデル用に定義を変換し、対応ツールを用意して選択された実行を調整。 | `ai.tools.createBuiltinTools(options)` |
| `ai.stream.createProcessor`, `collect`, `createSSEDecoder`, `encodeSSE` | ストリームのイベント処理・集約、SSE の変換。 | `ai.stream.createSSEDecoder()` |
| `ai.embedding.embed`, `embedText` | 対応する埋め込み設定で文書やテキストのベクトルを作成。 | `await ai.embedding.embedText(text)` |
| `ai.memory`, `ai.rag`, `ai.knowledge`, `ai.context`, `ai.persona` | メモリーの保存・取得、ナレッジの登録・検索、文脈とペルソナの管理。 | `ai.knowledge` |
| `ai.audio`, `ai.image`, `ai.file` | 設定済みのメディアモデルを利用し、ファイルを解析。 | `ai.audio` |
| `ai.acp`, `ai.a2a`, `ai.mcp` | アプリの権限に従いエージェントセッション、プロトコル、リモートツールを連携。 | `ai.acp` |

追加の設定項目や利用例は[中国語リファレンス](ai.md)に掲載しています。
