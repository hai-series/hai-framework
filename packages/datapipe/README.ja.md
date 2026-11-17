# @h-ai/datapipe

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

テキストのクリーニング（clean）、分割（chunk）、パイプラインの合成（pipeline）を提供するデータ処理モジュールです。純粋関数で構成され、初期化は不要です。

## クイックスタート

`pnpm add @h-ai/datapipe` でインストールします。

[最小構成の導入手順](../../docs/usage/function/datapipe.ja.md#quick-start)を参照してください。

## 設定一覧

クリーニングの設定は `datapipe.clean()` に、長さや重複範囲などの分割設定は `datapipe.chunk()` に渡します。`datapipe.pipeline()` には両方の設定を渡せます。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/datapipe.ja.md)を参照してください。

## 機能

[API 一覧](../../docs/usage/function/datapipe.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

モジュール独自のデータベーステーブルは作成しません。

クリーニング結果、テキストチャンク、アプリ側の保存責務については[データ構造](../../docs/usage/data/datapipe.ja.md)を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/datapipe test
```

ソース例は純関数・同期 HaiResult・非同期パイプラインを区別します。[JSDoc 規約（中国語）](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) を参照してください。

## ライセンス

Apache-2.0
