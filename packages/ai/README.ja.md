# @h-ai/ai

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/api-contract](../api-contract/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/datapipe](../datapipe/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md) · [@h-ai/vecdb](../vecdb/README.ja.md)

共通の `ai` サービスで LLM 対話、画像生成、ツール、MCP、Embedding、記憶、検索/RAG、知識ベース、コンテキスト管理、ファイル解析、Rerank、音声（ASR/TTS）、A2A を提供します。Node.js では `ai.init()` で初期化し、ブラウザーからは API/client を経由します。

## クイックスタート

`ai.close()` は進行中の初期化を待ってからリソースを解放します。同時に終了を呼び出しても、解放処理は一度です。設定を変更して `ai.init()` を呼び出すと、既存のインスタンスを先に閉じます。終了中に初期化を呼び出すと失敗します。

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

開発時や明示的なテストモードでは、RelDB とベクトルデータベースが使えない場合、会話などの記録をプロセスのメモリーに一時保存できます。モジュールの終了、再起動、別のインスタンスへの切り替え後は、その記録を参照できません。`NODE_ENV` または `HAI_CORE_ENV` が `production` の場合は、共有のリレーショナルデータベースとネットワーク経由のベクトルデータベースを先に接続するか、複数のインスタンスから同じ記録を読み書きでき、バージョンを確認して更新する独自ストアを渡してください。

## 設定一覧

生成したプロジェクトでは、モデル名や接続先の設定を `config/_ai.yml` に記述します。アプリの起動コードがファイルを読み込み、設定オブジェクトを `ai.init(config, options)` に渡します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/ai.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/ai.md)（中国語）を参照してください。

- `ai.init` / `ai.close` / `ai.config` / `ai.isInitialized` — モデル設定を読み込み、準備状態を確認し、モジュールを終了する。再起動後も会話を残す場合は保存先も指定可能
- `ai.llm` / `ai.stream` / `ai.reasoning` / `ai.token` / `ai.summary` / `ai.compress` / `ai.context` — チャットを呼び出し、応答をストリーミングし、トークン数を見積もって会話履歴を短くする
- `ai.embedding` / `ai.rerank` / `ai.retrieval` / `ai.rag` / `ai.knowledge` — 内容をベクトル化して検索・再順位付けし、文書をナレッジベースに登録する
- `ai.memory` / `ai.persona` — 会話メモリとペルソナの管理
- `ai.tools` / `ai.mcp` / `ai.acp` / `ai.a2a` — ツール登録、MCP 接続、ACP セッション制御、A2A エージェント呼び出し
- `ai.file` / `ai.image` / `ai.audio` — ファイル、画像、音声の操作

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
