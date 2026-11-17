# @h-ai/vecdb API リファレンス

[原文（中国語）](vecdb.md) · [設定](../configuration/vecdb.ja.md) · [データ構造](../data/vecdb.ja.md)

<a id="quick-start"></a>

## クイックスタート

ベクトルバックエンドを初期化し、名前と次元を指定してコレクションを作成し、ベクトルの書き込みと検索を行います。カーソルを使う走査では同じ保存先とコレクションを指定します。

```ts
import { vecdb } from '@h-ai/vecdb'

// 打开本地 LanceDB 连接。
const initialized = await vecdb.init({ type: 'lancedb', path: './data/vecdb' })
if (!initialized.success)
  throw new Error(initialized.error.message)

try {
  // 创建余弦相似度集合，每个向量有 3 个数值。
  const created = await vecdb.collection.create('docs', { dimension: 3, metric: 'cosine' })
  if (!created.success)
    throw new Error(created.error.message)

  // 写入一条文档向量，content 和 metadata 会随结果返回。
  const inserted = await vecdb.vector.insert('docs', [
    {
      id: 'doc-1',
      vector: [1, 0, 0],
      content: '安装说明',
      metadata: { source: 'wiki' }
    },
  ])
  if (!inserted.success)
    throw new Error(inserted.error.message)

  // 用接近已写入向量的查询值，返回最多 5 条命中。
  const matches = await vecdb.vector.search('docs', [0.9, 0.1, 0], { topK: 5, minScore: 0.7 })
  if (!matches.success)
    throw new Error(matches.error.message)
  // 命中项包含 id、score、content 和 metadata。
  const firstMatch = matches.data[0]
  process.stdout.write(`${JSON.stringify(firstMatch)}\n`)
}
finally {
  // 释放连接，即使创建、写入或搜索失败也执行。
  const closed = await vecdb.close()
  if (!closed.success)
    process.stderr.write(`Vecdb close failed: ${closed.error.code}\n`)
}
```

<a id="api-reference"></a>

## API 一覧

非同期操作は HaiResult を返します。表は成功時のデータです。先に success を確認してください。

| API | 用途 | 入力と既定値 | 出力 | 例 |
| --- | --- | --- | --- | --- |
| `vecdb.init` | 設定したバックエンドを開く | `config` | `void` | `await vecdb.init({ type: 'lancedb', path: './data/vecdb' })` |
| `vecdb.close` | 処理終了を待って接続を解放 | なし | `void` | `await vecdb.close()` |
| `vecdb.isInitialized` | 現在操作できるか確認 | 読み取り専用プロパティ | `boolean` | `vecdb.isInitialized` |
| `vecdb.config` | 認証情報を除いた設定を読む | 読み取り専用プロパティ | `VecdbConfig or null` | `vecdb.config` |
| `vecdb.rawConnection` | 信頼済みのサーバーで接続情報を読む。認証情報を含む場合あり | 読み取り専用プロパティ | `VecdbConnection or null` | `vecdb.rawConnection` |
| `vecdb.collection.create` | コレクションを作成。距離尺度は設定を継承し、未指定時は cosine | `name, { dimension, metric? }` | `void` | `await vecdb.collection.create('docs', { dimension: 3 })` |
| `vecdb.collection.drop` | コレクションと格納済みベクトルを削除 | `name` | `void` | `await vecdb.collection.drop('docs')` |
| `vecdb.collection.exists` | コレクションが存在するか確認 | `name` | `boolean` | `await vecdb.collection.exists('docs')` |
| `vecdb.collection.info` | 次元数、距離尺度、文書数を取得 | `name` | `CollectionInfo` | `await vecdb.collection.info('docs')` |
| `vecdb.collection.list` | コレクション名を一覧取得 | なし | `string[]` | `await vecdb.collection.list()` |
| `vecdb.vector.insert` | コレクションと同じ次元数のベクトルを持つ文書を挿入 | `collection, documents` | `void` | `await vecdb.vector.insert('docs', documents)` |
| `vecdb.vector.upsert` | ID で挿入または文書全体を置換 | `collection, documents` | `void` | `await vecdb.vector.upsert('docs', documents)` |
| `vecdb.vector.delete` | 指定 ID の文書を削除 | `collection, ids` | `void` | `await vecdb.vector.delete('docs', ['doc-1'])` |
| `vecdb.vector.search` | スコアの降順で近い文書を取得 | `collection, vector, { topK = 10, minScore?, filter? }?` | `VectorSearchResult[]` | `await vecdb.vector.search('docs', [1, 0, 0], { topK: 5 })` |
| `vecdb.vector.count` | コレクション内の文書数を数える | `collection` | `number` | `await vecdb.vector.count('docs')` |
| `vecdb.vector.scan` | 文書 ID をページ取得。limit は 1〜128 | `collection, { cursor?, limit = 64 }?` | `VectorScanPage` | `await vecdb.vector.scan('docs', { limit: 32 })` |

スコアは割合ではなく 0〜1 の値です。実際の距離尺度とバックエンドでしきい値を確かめてください。走査の結果は ID のみです。空ページでも nextCursor があれば同じコレクションとバックエンドで続けます。
