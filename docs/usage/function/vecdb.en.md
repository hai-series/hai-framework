# @h-ai/vecdb API reference

[Chinese source](vecdb.md) · [Configuration](../configuration/vecdb.en.md) · [Data structures](../data/vecdb.en.md)

<a id="quick-start"></a>

## Quick start

Initialize a vector backend, create a named collection with its dimension, then insert vectors and query the collection. Use the same backend and collection on each cursor scan.

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

## API list

| API | Input and result | Example |
| --- | --- | --- |
| `vecdb.init(config)`, `close()`, `isInitialized`, `config`, `rawConnection` | Manage the backend lifecycle and inspect initialized state and connection. | `await vecdb.init(config)` |
| `vecdb.collection.create(name, options)`, `drop`, `exists`, `info`, `list` | Create a collection from name and dimension, remove it, or inspect collections. Default metric is cosine. | `await vecdb.collection.create('docs', { dimension: 3 })` |
| `vecdb.vector.insert`, `upsert`, `delete` | Write documents or remove them by ID. | `await vecdb.vector.delete('docs', ['a'])` |
| `vecdb.vector.search(collection, vector, options?)`, `count`, `scan` | Rank matches (default topK 10), count documents or return cursor results. | `await vecdb.vector.search('docs', [1, 0, 0], { topK: 5 })` |
