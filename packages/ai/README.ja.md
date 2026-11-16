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

## 設定一覧

生成プロジェクトは `config/_ai.yml` を使用します。アプリで設定を取り込む入口は `ai.init(config, options)` です。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/ai.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/ai.md)（中国語）を参照してください。

- `init` / `close` / `config` / `isInitialized` — モデルと任意のストアを構成
- `llm` / `stream` / `reasoning` / `token` / `summary` / `compress` / `context` — コンテンツ生成、ストリーミング、コンテキスト予算
- `embedding` / `rerank` / `retrieval` / `rag` / `knowledge` — 埋め込み、再順位付け、検索、ナレッジ登録
- `memory` / `persona` — 会話メモリとペルソナの管理
- `tools` / `mcp` / `acp` / `a2a` — ツール登録、MCP 接続、ACP セッション制御、A2A エージェント呼び出し
- `file` / `image` / `audio` — ファイル、画像、音声の操作

## データ構造

内蔵 DB Store、ベクトルコレクション、ネイティブメモリの名前空間については[データ構造](../../docs/usage/data/ai.md)（中国語）を参照してください。

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
