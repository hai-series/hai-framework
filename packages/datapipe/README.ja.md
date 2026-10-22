# @h-ai/datapipe

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

## 概要

テキストのクリーニング（clean）、分割（chunk）、パイプラインの合成（pipeline）を提供するデータ処理モジュールです。純粋関数で構成され、初期化は不要です。

## 主な機能

| 機能                   | 説明                                                                  |
| ---------------------- | --------------------------------------------------------------------- |
| テキストのクリーニング | HTML タグ・URL・Email の除去、空白の正規化、独自の正規表現による置換  |
| テキストの分割         | 文、段落、Markdown 見出し、改ページ、単語数、文字数、独自の区切り文字 |
| パイプラインの合成     | クリーニング → 変換 → 分割 → 後処理を連結し、一度に実行               |

> セキュリティ：`customReplacements` と `mode: 'custom'` の `separator` は正規表現として使用されます。信頼できる検証済みのパターンのみを渡し、ReDoS や意図しない広範囲の置換を防ぐため、ユーザー入力を直接正規表現に組み込まないでください。

## 使い始める

### クイックスタート

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

// 管线模式（链式组合多步操作）
const result = await datapipe.pipeline()
  .clean({ removeHtml: true, removeUrls: true })
  .transform(text => text.toLowerCase())
  .chunk({ mode: 'paragraph', maxSize: 1000, overlap: 100 })
  .chunkTransform(chunks => chunks.filter(c => c.content.length > 50))
  .run(rawText)
```

### 分割モード

| モード    | 説明                                 |
| --------- | ------------------------------------ |
| sentence  | 文単位で分割                         |
| paragraph | 段落単位で分割                       |
| markdown  | Markdown 見出しで分割                |
| page      | 改ページで分割                       |
| word      | 単語数で分割                         |
| character | 文字数で分割                         |
| custom    | 独自の区切り文字（separator が必要） |

### エラー処理

すべての操作は `HaiResult<T>` を返します。`result.success` で成功・失敗を判定します。エラーコードは文字列形式 `hai:datapipe:NNN` です。

```ts
const result = datapipe.chunk(text, { mode: 'custom' })
if (!result.success) {
  switch (result.error.code) {
    case HaiDatapipeError.MISSING_SEPARATOR.code:
      // mode='custom' 时需要提供 separator
      break
    case HaiDatapipeError.CONFIG_ERROR.code:
      // 配置参数校验失败
      break
    case HaiDatapipeError.CHUNK_FAILED.code:
      // 输入或自定义正则导致处理失败；记录错误并回退到安全默认策略
      break
  }
}
```

## 開発とテスト

```bash
pnpm --filter @h-ai/datapipe test
```

## ライセンス

Apache-2.0
