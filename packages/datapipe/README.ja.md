# @h-ai/datapipe

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

テキストのクリーニング（clean）、分割（chunk）、パイプラインの合成（pipeline）を提供するデータ処理モジュールです。純粋関数で構成され、初期化は不要です。

## クイックスタート

```ts
import { datapipe, HaiDatapipeError } from '@h-ai/datapipe'

const rawText = '<p>Hello framework.</p>'
const text = '# Getting started\n\nHello framework.'

// 直接清洗
const cleaned = datapipe.clean(rawText, { removeHtml: true })
if (!cleaned.success)
  throw new Error(cleaned.error.message)

// 按 Markdown 标题分块
const chunks = datapipe.chunk(text, { mode: 'markdown', maxSize: 2000 })
if (!chunks.success)
  throw new Error(chunks.error.message)

// 管线模式（链式组合多步操作）
const result = await datapipe.pipeline()
  .clean({ removeHtml: true, removeUrls: true })
  .transform(text => text.toLowerCase())
  .chunk({ mode: 'paragraph', maxSize: 1000, overlap: 100 })
  .chunkTransform(chunks => chunks.filter(c => c.content.length > 50))
  .run(rawText)
if (!result.success)
  throw new Error(result.error.message)
```

## 設定一覧

クリーニングの設定は `datapipe.clean()` に、長さや重複範囲などの分割設定は `datapipe.chunk()` に渡します。`datapipe.pipeline()` には両方の設定を渡せます。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/datapipe.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/datapipe.md)（中国語）を参照してください。

- `datapipe.clean` — テキストの正規化とフィルタリング
- `datapipe.chunk` / `datapipe.pipeline` — テキスト分割、またはクリーニングから分割までを連続処理

## データ構造

モジュール独自のデータベーステーブルは作成しません。

クリーニング結果、テキストチャンク、アプリ側の保存責務については[データ構造](../../docs/usage/data/datapipe.md)（中国語）を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/datapipe test
```

ソース例は純関数・同期 HaiResult・非同期パイプラインを区別します。[JSDoc 規約（中国語）](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) を参照してください。

## ライセンス

Apache-2.0
