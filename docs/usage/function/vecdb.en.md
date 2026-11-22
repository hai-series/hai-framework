# @h-ai/vecdb API reference

[Chinese source](vecdb.md) · [Configuration](../configuration/vecdb.en.md) · [Data structures](../data/vecdb.en.md)

## Quick start

Initialize a vector backend, create a named collection with its dimension, then insert vectors and query the collection. Use the same backend and collection on each cursor scan.

```ts
import { vecdb } from '@h-ai/vecdb'

// 打开本地 LanceDB 连接。
// Open LanceDB at ./data/vecdb. Success has no data. Read error on connection failure.
const initialized = await vecdb.init({ type: 'lancedb', path: './data/vecdb' })
if (!initialized.success)
  throw new Error(initialized.error.message)

try {
  // 创建余弦相似度集合，每个向量有 3 个数值。
  // Create docs with three dimensions and cosine scoring. Success has no data. Read error if the name is taken or creation fails.
  const created = await vecdb.collection.create('docs', { dimension: 3, metric: 'cosine' })
  if (!created.success)
    throw new Error(created.error.message)

  // 写入一条文档向量，content 和 metadata 会随结果返回。
  // Insert the ID, three-dimensional vector, content, and source into docs. Success has no data. Read error on failure.
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
  // Search docs with this three-dimensional vector for up to five hits scoring at least 0.7. Success returns a hit array or []. Read error on failure.
  const matches = await vecdb.vector.search('docs', [0.9, 0.1, 0], { topK: 5, minScore: 0.7 })
  if (!matches.success)
    throw new Error(matches.error.message)
  // 命中项包含 id、score、content 和 metadata。
  const firstMatch = matches.data[0]
  process.stdout.write(`${JSON.stringify(firstMatch)}\n`)
}
finally {
  // 释放连接，即使创建、写入或搜索失败也执行。
  // Close this connection without arguments. Success has no data. A failure is logged by code.
  const closed = await vecdb.close()
  if (!closed.success)
    process.stderr.write(`Vecdb close failed: ${closed.error.code}\n`)
}
```

<a id="api-list"></a>

<a id="api-reference"></a>

## Features

Each section lists individual interfaces, then follows the calls through a task. Parameters and defaults describe the arguments; call examples show the invocation, and returns describe the result or successful data as noted below. Check `success` on `HaiResult` before reading `data`. Detailed parameter defaults and advanced constraints remain linked to the Chinese reference.

Import the module as in the quick start. Except for lifecycle examples, run scenarios after initialization and before closure. Each call checks HaiResult.success before reading data and returns the original failed result to its caller. Scenarios without a function declaration are fragments inside an async application function. Use isolated test data and explicit cleanup.

<a id="connection"></a>

### Connect and close: `vecdb`

Connect to a vector backend before using collections; keep raw connection details within trusted server code.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `vecdb.init(config)` | Initialize the configured backend | Required `config: VecdbConfigInput` selects a backend via `type`. See [configuration](../configuration/vecdb.en.md). | `HaiResult<void>` | `await vecdb.init({ type: 'lancedb', path: './data/vecdb' })` |
| `vecdb.close()` | Wait and release the current connection | None | `HaiResult<void>` | `await vecdb.close()` |
| `vecdb.isInitialized` | Read whether operations can run | Read-only property | `boolean` | `vecdb.isInitialized` |
| `vecdb.config` | Read the current config with credentials removed | Read-only property | `VecdbConfig or null` | `vecdb.config` |
| `vecdb.rawConnection` | Read connection details for trusted server code, possibly including credentials | Read-only property | `VecdbConnection or null` | `vecdb.rawConnection` |

#### Scenario: Connect and close

```ts
// Fragment inside an async application function; return failed results to its caller.
// Open LanceDB at ./data/docs-demo. Success enables collection access and has no data. Return the original failed result on failure.
const initResult = await vecdb.init({ type: 'lancedb', path: './data/docs-demo' })
if (!initResult.success)
  return initResult
// Read readiness directly. After successful connection this is true.
vecdb.isInitialized // true
// Read type from the sanitized configuration after connection. Here it is lancedb.
vecdb.config?.type // 'lancedb'
// Read backend connection details for in-process integration. They can contain credentials.
const connection = vecdb.rawConnection // backend-specific connection; may contain credentials
// Close the connection without arguments. Success has no data. Return the failed result on failure.
const closeResult = await vecdb.close()
if (!closeResult.success)
  return closeResult
// Read the configuration after close. It is null.
vecdb.config // null
```

Use this local backend in development. Reconnect before the next examples. Never log rawConnection or return it to a browser.

Each async operation returns a HaiResult. The table shows successful data; check success before using it.

Scores run from 0 to 1 and are not percentages. Test a threshold with the actual metric and provider. A scan returns only IDs. Pass the returned nextCursor even after an empty page, and keep using the same collection and backend.

[Detailed parameters and workflows](vecdb.md#connection)

<a id="collections"></a>

### Prepare and remove collections: `vecdb.collection`

A collection fixes the vector dimension and metric. Dropping it removes all its vectors.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `vecdb.collection.create(name, options)` | Create a collection | `name` names the collection and `options.dimension` must be a positive integer. All stored and query vectors must match that dimension. `metric` is `cosine`, `euclidean`, or `dot`. It defaults to the connection setting or `cosine` | `void` | `await vecdb.collection.create('documents', { dimension: 3 })` |
| `vecdb.collection.drop(name)` | Drop the collection and its vectors | `name: string` Required configured collection name | `void` | `await vecdb.collection.drop('documents')` |
| `vecdb.collection.exists(name)` | Check whether the collection exists | `name: string` Required configured collection name | `boolean` | `await vecdb.collection.exists('documents')` |
| `vecdb.collection.info(name)` | Read collection dimension, metric, and document count | `name: string` Required configured collection name | `CollectionInfo` | `await vecdb.collection.info('documents')` |
| `vecdb.collection.list()` | List collection names | None | `string[]` | `await vecdb.collection.list()` |

#### Scenario: Prepare and remove collections

```ts
// Fragment inside an async application function; return failed results to its caller.
// Create demo-docs with dimension 3 and cosine scoring. Success has no data. Return the failed result on failure.
const createResult = await vecdb.collection.create('demo-docs', { dimension: 3, metric: 'cosine' })
if (!createResult.success)
  return createResult
// Check the newly created demo-docs. Success returns true. Return the failed result on a backend failure.
const existsResult = await vecdb.collection.exists('demo-docs')
if (!existsResult.success)
  return existsResult
existsResult.data // true
// List collection names without arguments. The array contains demo-docs. Return the failed result on failure.
const listResult = await vecdb.collection.list()
if (!listResult.success)
  return listResult
listResult.data // includes 'demo-docs'
// Read metadata for demo-docs. It has dimension 3, cosine scoring, and zero documents. Return the failed result on failure.
const infoResult = await vecdb.collection.info('demo-docs')
if (!infoResult.success)
  return infoResult
const info = infoResult.data // dimension 3, cosine, zero documents
// Drop demo-docs and its data. Success has no data. Return the failed result on failure.
const dropResult = await vecdb.collection.drop('demo-docs')
if (!dropResult.success)
  return dropResult
// Check the dropped demo-docs again. Success returns false. Return the failed result on query failure.
const existsResult2 = await vecdb.collection.exists('demo-docs')
if (!existsResult2.success)
  return existsResult2
existsResult2.data // false
```

Use a new collection name. Recreate the three-dimensional collection before the vector scenario; backend failures remain failed results.

[Detailed parameters and workflows](vecdb.md#collections)

<a id="vectors"></a>

### Write, search and clean documents: `vecdb.vector`

Workers prepare Arrow batches or SQL parameters for large LanceDB and pgvector writes. The host commits writes. Workers decode and validate large Qdrant responses and preserve full uint64 scroll cursors.

Insert and search vectors of the same dimension. Update or delete by ID; scan IDs for inventory and cleanup.

#### Interface list

| API | Purpose | Parameters and defaults | Return value or failure | Call example |
| --- | --- | --- | --- | --- |
| `vecdb.vector.insert(collection, documents)` | Insert document vectors | `collection: string` Required collection name. `documents: VectorDocument[]` Required documents. See [document fields](#vecdb-vector-options) | `void` | `await vecdb.vector.insert('documents', [{ id: 'doc-1', vector: [1, 0, 0] }])` |
| `vecdb.vector.upsert(collection, documents)` | Insert or replace a whole document by ID | `collection: string` Required collection name. `documents: VectorDocument[]` Required documents. See [document fields](#vecdb-vector-options) | `void` | `await vecdb.vector.upsert('documents', [{ id: 'doc-1', vector: [1, 0, 0], content: '新版' }])` |
| `vecdb.vector.delete(collection, ids)` | Delete documents by ID | `collection: string` Required collection name. `ids: string[]` Document IDs to delete | `void` | `await vecdb.vector.delete('documents', ['doc-1'])` |
| `vecdb.vector.search(collection, vector, options?)` | Search by vector similarity | `collection: string` Required collection name. `vector: number[]` Query vector matching the collection dimension. `options?: VectorSearchOptions` See [search fields](#vecdb-vector-options) | `VectorSearchResult[]` | `await vecdb.vector.search('documents', [0.9, 0.1, 0], { topK: 5 })` |
| `vecdb.vector.count(collection)` | Count documents in the collection | `collection: string` Required collection name | `number` | `await vecdb.vector.count('documents')` |
| `vecdb.vector.scan(collection, options?)` | Page through document IDs | `collection: string` Required collection name. `options?: VectorScanOptions` See [scan fields](#vecdb-vector-options) | `VectorScanPage` | `await vecdb.vector.scan('documents', { limit: 32 })` |

<a id="vecdb-vector-options"></a>

**Document, search and scan fields**

| Field | Type | Required and default | Purpose and when it applies |
| --- | --- | --- | --- |
| `VectorDocument.id` | `string` | Required | Stable application document identifier used for replacement and deletion. |
| `VectorDocument.vector` | `number[]` | Required | Floating-point values matching the collection dimension. |
| `VectorDocument.content` | `string` | Optional | Source text to return with a hit. |
| `VectorDocument.metadata` | `Record<string, unknown>` | Optional | Store auxiliary data such as source for later filtering. |
| `VectorSearchOptions.topK` | `number` | `10` | Maximum matches ranked by similarity. |
| `VectorSearchOptions.minScore` | `number` | `0` | Inclusive 0–1 score threshold. |
| `VectorSearchOptions.filter` | `Record<string, unknown>` | No metadata filter | Filter based on metadata. See backend comparison semantics below. |
| `VectorScanOptions.cursor` | `string` | Omit for the first page | Pass the previous nextCursor for the same backend and collection. |
| `VectorScanOptions.limit` | `number` | `64` | Document IDs per page, integer 1–128. |

`topK` caps the number of results ranked by similarity. `minScore` is an inclusive score threshold from 0 to 1. `filter` matches metadata, for example `{ source: "handbook" }`. LanceDB requires a typed exact match on all supplied top-level fields and supports strings, finite numbers, booleans, and `null`. A missing field does not match `null`, and unsupported values yield `CONFIG_ERROR`. Other backends may compare values differently. The portable example below uses a top-level string.

#### Scenario: Write, search and clean documents

VecDB stores and compares numeric vectors; it does not embed text. Writes and queries must use the same model and dimension.

![From text to search: who creates vectors](../images/function-vecdb-responsibilities.en.svg)

The example uses dimension 3, so both write and query use [1,0,0]; identical cosine vectors score about 1. An application or AI embedding model supplies real vectors. Search returns matches and scores, not generated answers or percentages.

```ts
// Fragment inside an async application function; return failed results to its caller.
// Create demo-docs with dimension 3 and cosine scoring. Success has no data. Return the failed result on failure.
const createResult = await vecdb.collection.create('demo-docs', { dimension: 3, metric: 'cosine' })
if (!createResult.success)
  return createResult
// Insert doc-1, its three-dimensional vector, and Install into demo-docs. Success has no data. Return the failed result on failure.
const insertResult = await vecdb.vector.insert('demo-docs', [{ id: 'doc-1', vector: [1, 0, 0], content: 'Install' }])
if (!insertResult.success)
  return insertResult
// Count documents in demo-docs after insertion. Success returns 1. Return the failed result on failure.
const countResult = await vecdb.vector.count('demo-docs')
if (!countResult.success)
  return countResult
countResult.data // 1
// Replace doc-1 content and metadata, setting source to handbook. Success has no data. Return the failed result on failure.
const upsertResult = await vecdb.vector.upsert('demo-docs', [{ id: 'doc-1', vector: [1, 0, 0], content: 'Install v2', metadata: { source: 'handbook' } }])
if (!upsertResult.success)
  return upsertResult
// Query the same vector for at most one hit with source=handbook and a score of at least 0.9. Success returns the updated doc-1. Return the failed result on failure.
const matchesResult = await vecdb.vector.search('demo-docs', [1, 0, 0], { topK: 1, minScore: 0.9, filter: { source: 'handbook' } })
if (!matchesResult.success)
  return matchesResult
const matches = matchesResult.data
// matches[0]: id 'doc-1', content 'Install v2', score approximately 1
// Query source=release-notes instead. No stored document matches, so success returns []. Return the failed result on failure.
const excluded = await vecdb.vector.search('demo-docs', [1, 0, 0], { filter: { source: 'release-notes' } })
if (!excluded.success)
  return excluded
excluded.data // []
// Read the first page of up to 32 document IDs from demo-docs. Success contains items and an optional nextCursor. Return the failed result on failure.
const pageResult = await vecdb.vector.scan('demo-docs', { limit: 32 })
if (!pageResult.success)
  return pageResult
const page = pageResult.data
// page.items: [{ id: 'doc-1' }]; continue using nextCursor when present
// Delete the listed doc-1 from demo-docs. Success has no data. Return the failed result on failure.
const deleteResult = await vecdb.vector.delete('demo-docs', ['doc-1'])
if (!deleteResult.success)
  return deleteResult
// Count demo-docs after deletion. Success returns 0. Return the failed result on failure.
const countResult2 = await vecdb.vector.count('demo-docs')
if (!countResult2.success)
  return countResult2
countResult2.data // 0
```

The query equals the stored vector, so its normalized cosine score is about 1. Content comes from the latest full upsert. Concurrent changes affect scans; a score is not a percentage.

[Detailed parameters and workflows](vecdb.md#vectors)
