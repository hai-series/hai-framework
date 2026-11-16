# @h-ai/vecdb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

共通の `vecdb` オブジェクトで LanceDB、pgvector、Qdrant、Chroma を操作するベクトルデータベースモジュールです。

## クイックスタート

すべての Provider の `score` は 0–1 で、高いほど類似し、`minScore` は変換後に適用します。cosine は `(1 + cosine) / 2`、dot は `sigmoid(dotProduct)`、euclidean は `1 / (1 + distance)` です。LanceDB/Chroma はネイティブの squared L2、他のバックエンドはネイティブ L2 を使います。閾値は metric・バックエンドごとに業務で校正し、score を確率とは扱いません。Qdrant は公開 minScore をネイティブ距離の閾値として直接送信しません。

```ts
import { vecdb } from '@h-ai/vecdb'

// ローカルの LanceDB 接続を開く。
const initialized = await vecdb.init({ type: 'lancedb', path: './data/vecdb' })
if (!initialized.success)
  throw new Error(initialized.error.message)

try {
  // 3 要素のベクトルをコサイン類似度で検索するコレクションを作成。
  const created = await vecdb.collection.create('docs', { dimension: 3, metric: 'cosine' })
  if (!created.success)
    throw new Error(created.error.message)

  // ドキュメントのベクトルを登録。本文とメタデータは検索結果にも含まれる。
  const inserted = await vecdb.vector.insert('docs', [
    {
      id: 'doc-1',
      vector: [1, 0, 0],
      content: 'インストールガイド',
      metadata: { source: 'wiki' }
    },
  ])
  if (!inserted.success)
    throw new Error(inserted.error.message)

  // 登録したベクトルに近い値で検索し、最大 5 件を取得。
  const matches = await vecdb.vector.search('docs', [0.9, 0.1, 0], { topK: 5, minScore: 0.7 })
  if (!matches.success)
    throw new Error(matches.error.message)
  // 各結果には id、score、content、metadata が含まれる。
  const firstMatch = matches.data[0]
  process.stdout.write(`${JSON.stringify(firstMatch)}\n`)
}
finally {
  // 作成、登録、検索に失敗した場合も接続を閉じる。
  const closed = await vecdb.close()
  if (!closed.success)
    process.stderr.write(`Vecdb close failed: ${closed.error.code}\n`)
}
```

## 設定一覧

生成プロジェクトは `config/_vecdb.yml` を使用します。アプリで設定を取り込む入口は `vecdb.init(config)` です。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/vecdb.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/vecdb.md)（中国語）を参照してください。

- `init` / `close` / `config` / `isInitialized` / `rawConnection` — プロバイダー接続の管理と基礎クライアントへのアクセス
- `collection` — コレクションの作成、一覧取得、削除
- `vector` — ベクトルの書き込み、検索、ページング、削除

## データ構造

コレクション、ベクトル、メタデータ、フィルター、プロバイダーの保存構造については[データ構造](../../docs/usage/data/vecdb.md)（中国語）を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/vecdb test
```

> pgvector / Qdrant のテストには Docker が必要です。

ソースの JSDoc は[共通規約](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)に従います。公開例は実際の公開入口、内部例は元のモジュールスコープで型検査します。ビルド後に `pnpm check:jsdoc --package vecdb` を実行してください。例の型検査は実バックエンドの動作検証の代わりにはなりません。

## ライセンス

Apache-2.0
