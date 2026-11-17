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

Each async operation returns a HaiResult. The table shows successful data; check success before using it.

| API | Purpose | Inputs and defaults | Output | Example |
| --- | --- | --- | --- | --- |
| `vecdb.init` | Open the selected backend | `config` | `void` | `await vecdb.init({ type: 'lancedb', path: './data/vecdb' })` |
| `vecdb.close` | Release the connection after pending operations | None | `void` | `await vecdb.close()` |
| `vecdb.isInitialized` | Read whether operations can run | Read-only property | `boolean` | `vecdb.isInitialized` |
| `vecdb.config` | Read the current config with credentials removed | Read-only property | `VecdbConfig or null` | `vecdb.config` |
| `vecdb.rawConnection` | Read connection details for trusted server code, possibly including credentials | Read-only property | `VecdbConnection or null` | `vecdb.rawConnection` |
| `vecdb.collection.create` | Create a collection. The metric follows backend configuration (cosine if unset) | `name, { dimension, metric? }` | `void` | `await vecdb.collection.create('docs', { dimension: 3 })` |
| `vecdb.collection.drop` | Delete a collection and its vectors | `name` | `void` | `await vecdb.collection.drop('docs')` |
| `vecdb.collection.exists` | Check whether a collection exists | `name` | `boolean` | `await vecdb.collection.exists('docs')` |
| `vecdb.collection.info` | Read the size, metric and document count | `name` | `CollectionInfo` | `await vecdb.collection.info('docs')` |
| `vecdb.collection.list` | List collections | None | `string[]` | `await vecdb.collection.list()` |
| `vecdb.vector.insert` | Insert documents with vectors matching the collection dimension | `collection, documents` | `void` | `await vecdb.vector.insert('docs', documents)` |
| `vecdb.vector.upsert` | Insert or replace the complete document by ID | `collection, documents` | `void` | `await vecdb.vector.upsert('docs', documents)` |
| `vecdb.vector.delete` | Delete matching IDs | `collection, ids` | `void` | `await vecdb.vector.delete('docs', ['doc-1'])` |
| `vecdb.vector.search` | Return nearest matches in decreasing score order | `collection, vector, { topK = 10, minScore?, filter? }?` | `VectorSearchResult[]` | `await vecdb.vector.search('docs', [1, 0, 0], { topK: 5 })` |
| `vecdb.vector.count` | Count documents in the collection | `collection` | `number` | `await vecdb.vector.count('docs')` |
| `vecdb.vector.scan` | Page through document IDs. Valid limits are 1–128 | `collection, { cursor?, limit = 64 }?` | `VectorScanPage` | `await vecdb.vector.scan('docs', { limit: 32 })` |

Scores run from 0 to 1 and are not percentages. Test a threshold with the actual metric and provider. A scan returns only IDs. Pass the returned nextCursor even after an empty page, and keep using the same collection and backend.
