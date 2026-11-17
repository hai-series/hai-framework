# @h-ai/ai

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/api-contract](../api-contract/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/datapipe](../datapipe/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md) · [@h-ai/vecdb](../vecdb/README.ja.md)

共通の `ai` サービスで LLM 対話、画像生成、ツール、MCP、Embedding、記憶、検索/RAG、知識ベース、コンテキスト管理、ファイル解析、Rerank、音声（ASR/TTS）、A2A を提供します。Node.js では `ai.init()` で初期化し、ブラウザーからは API/client を経由します。

定義と実行は [Tools](../tools/README.ja.md) に集約します。`ai.tools.adapt` はモデルのプロトコルを変換し、`createBuiltinTools` は画像・音声・文書の書き換えと任意のURL動画制作フローを提供します。`createMcpTools/createBroker` は既存MCPを利用します。ファクトリーは直ちにモデルを呼び出さず、有効化・リソース権限・Runnerはホストが設定します。[AIツールガイド](../cli/templates/skills/hai-ai/tools.md)（中国語）を参照してください。

## クイックスタート

[最小構成の導入手順](../../docs/usage/function/ai.ja.md#quick-start)を参照してください。

## 設定一覧

生成したプロジェクトでは、モデル名や接続先の設定を `config/_ai.yml` に記述します。アプリの起動コードがファイルを読み込み、設定オブジェクトを `ai.init(config, options)` に渡します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/ai.ja.md)を参照してください。

## 機能

[API 一覧](../../docs/usage/function/ai.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

内蔵 DB Store、ベクトルコレクション、ネイティブメモリの名前空間については[データ構造](../../docs/usage/data/ai.ja.md)を参照してください。

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
