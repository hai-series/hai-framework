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

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `vecdb.init(config)`, `close()`, `isInitialized`, `config`, `rawConnection` | 接続先の初期化・終了、状態、設定、接続の確認。 | `await vecdb.init(config)` |
| `vecdb.collection.create(name, options)`, `drop`, `exists`, `info`, `list` | 名前と次元で作成・削除・確認。距離尺度の既定値は cosine。 | `await vecdb.collection.create('docs', { dimension: 3 })` |
| `vecdb.vector.insert`, `upsert`, `delete` | 文書を新規・更新保存、または ID で削除。 | `await vecdb.vector.delete('docs', ['a'])` |
| `vecdb.vector.search(collection, vector, options?)`, `count`, `scan` | 近い文書の検索（topK の既定値は 10）、件数取得、カーソル付き走査。 | `await vecdb.vector.search('docs', [1, 0, 0], { topK: 5 })` |
