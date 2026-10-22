# @h-ai/vecdb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

## Introduction

A vector database module with a unified `vecdb` object for LanceDB, pgvector, Qdrant, and Chroma.

## Core features

- Create collections with a defined vector dimension.
- Store document vectors, search by similarity and filter metadata.
- Use LanceDB, pgvector, Qdrant or Chroma; backend setup is described below.

## Getting started

### Quick start

```ts
import { HaiVecdbError, vecdb } from '@h-ai/vecdb'

// 初始化（LanceDB）
const initialized = await vecdb.init({ type: 'lancedb', path: './data/vecdb' })
if (!initialized.success)
  throw new Error(initialized.error.message)

// 创建集合
await vecdb.collection.create('docs', { dimension: 1536 })

// 插入向量
await vecdb.vector.insert('docs', [
  { id: 'doc-1', vector: Array.from({ length: 1536 }).fill(0.1), content: '文档内容', metadata: { source: 'wiki' } },
])

// 搜索
const searchResult = await vecdb.vector.search('docs', Array.from({ length: 1536 }).fill(0.2), { topK: 5, minScore: 0.7 })
if (searchResult.success) {
  for (const item of searchResult.data) {
    // item.id, item.score, item.content
  }
}

// 关闭
const closeResult = await vecdb.close()
if (!closeResult.success) {
  throw new Error(closeResult.error.message)
}
```

### Configuration

```ts
// LanceDB（默认，嵌入式本地存储）
await vecdb.init({ type: 'lancedb', path: './data/vecdb' })

// pgvector（连接字符串）
await vecdb.init({ type: 'pgvector', url: 'postgres://user:pass@localhost:5432/mydb' })

// pgvector（分字段）
await vecdb.init({
  type: 'pgvector',
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'admin',
  password: 'secret',
  indexType: 'hnsw',
  tablePrefix: 'vec_',
})

// Qdrant
await vecdb.init({ type: 'qdrant', url: 'http://localhost:6333', apiKey: 'optional-key' })

// Chroma（嵌入式：自动拉起本地 `chroma run` 服务并持久化到 path）
await vecdb.init({ type: 'chroma', path: './data/chroma' })

// Chroma（直连已有服务，不拉起进程）
await vecdb.init({ type: 'chroma', url: 'http://localhost:8000' })
```

> On Node, Chroma provides only an HTTP client, with no in-process embedded database. In embedded mode, `vecdb.init`
> starts a local service with `serverCommand` (default: `chroma`, from the `chromadb` package), and `vecdb.close`
> stops the process. Install the optional `chromadb` dependency; if the command is unavailable, `init` returns `CONNECTION_FAILED`.

LanceDB stores dimensions in Arrow's fixed-size vector field and the collection metric in the same schema's metadata, including empty collections. The metric in `collection.create` takes precedence; the connection metric only supplies a default for new collections. Restarting or changing that default does not alter existing collections. Operations read persisted schemas and check other connections' commits. Missing or invalid definitions return `CONFIG_ERROR`, without dummy-vector probes or guessed metrics. Rebuild legacy/external tables that lack this definition; no compatibility inference is provided.

LanceDB is an embedded local-file backend. Processes share data only when they access the same persistent directory on a filesystem supporting LanceDB's concurrent commits. Identically named local paths on separate nodes do not share data. Prefer pgvector, Qdrant, or a Chroma server for distributed services. AI Knowledge requires persistent reldb and vecdb stores pointing to the same business dataset; changing embedding dimensions requires a matching rebuilt collection.

Search uses the persisted collection metric, mapping `euclidean` to LanceDB's `l2`. Scores follow the public 0–1, higher-is-more-similar contract: cosine uses `clamp(1 - distance / 2, 0, 1)`, euclidean uses `1 / (1 + squaredL2)`, and dot uses `sigmoid(dotProduct)` to preserve ranking, not to estimate probabilities. `minScore` filters converted scores; thresholds are not universally calibrated across metrics or backends.

Atomic LanceDB writes are verified against `@lancedb/lancedb 0.40.0 / Lance 13`. New tables declare a non-null id primary key in their initial Arrow schema. Both insert and upsert use native merge on id for strict key conflict detection. Sources: [Lance 13 table format](https://github.com/lance-format/lance/blob/v13.0.0/docs/src/format/table/index.md#unenforced-primary-key), [Lance 13 transaction](https://github.com/lance-format/lance/blob/v13.0.0/protos/transaction.proto), [Node binding 0.40.0](https://github.com/lancedb/lancedb/blob/v0.40.0/nodejs/lancedb/table.ts).

LanceDB `insert` preserves existing IDs; `upsert` inserts or replaces complete rows. Duplicate IDs within a batch, missing merge support, or missing persisted primary keys return `CONFIG_ERROR` before writing. Rebuild old tables; no automatic migration or cleanup occurs. Each merge commits atomically, with concurrent winners determined by commit order. Multiple merges and reldb/vecdb operations do not share a transaction. No delete/add fallback is used. Reconcile unknown outcomes by ID. External native add calls bypass these safeguards.

LanceDB stores `metadata` in a native JSON field, accepts nested JSON, and restores search metadata as objects. Explicit Arrow JSON input schemas encode both insert and upsert as JSONB. Writes or filters on legacy Utf8 metadata tables return `CONFIG_ERROR`; rebuild them without automatic migration.

LanceDB `filter` supports AND equality on literal top-level keys, for example `{ tenant: 'acme', page: 1, active: true, removedAt: null }`. Values may be strings, finite numbers, booleans, or null. Types remain distinct: `1` differs from `'1'`, and `true` from `'true'`. Null matches explicit JSON null, never a missing key. Dots/brackets are literal key characters; quotes, backslashes, `%`, and `_` have no SQL or wildcard meaning. An empty object adds no restriction. Objects, arrays, undefined, and nonfinite numbers return `CONFIG_ERROR`, never an unfiltered query. Filtering precedes vector topK selection; minScore then filters scores. Other providers retain native restrictions and do not promise identical null, complex-value, or path semantics. Check capabilities when switching backends. Sources: [Lance 13 JSON UDF](https://github.com/lance-format/lance/blob/v13.0.0/rust/lance-datafusion/src/udf/json.rs), [Node 0.40.0 JSON field](https://github.com/lancedb/lancedb/blob/v0.40.0/nodejs/lancedb/arrow.ts).

#### Operation logging

Enable operation logging with `operationLog` in the vector database configuration. Logs are emitted before collection/vector operations reach the real provider, without a shared wrapper in `vecdb-main.ts`.

```yaml
# config/_vecdb.yml
type: lancedb
path: ./data/vecdb
operationLog:
  read: false # collection.exists/info/list, vector.search/count
  write: false # collection.create/drop, vector.insert/upsert/delete
  maxLength: 1000 # 参数序列化后的最大输出长度，超出会截断
  level: debug # info | debug | trace，默认 debug
```

```ts
await vecdb.init({
  type: 'lancedb',
  path: './data/vecdb',
  operationLog: {
    read: true,
    write: true,
    maxLength: 500,
    level: 'debug',
  },
})
```

> Note: `vecdb.config` returns a **redacted configuration snapshot**. Connection-string usernames/passwords, standalone `password`, and `apiKey` are replaced with `[REDACTED]`.

> Behavior: empty batch `insert/upsert/delete` calls are no-ops. Writes and searches validate vector dimensions, returning `HaiVecdbError.DIMENSION_MISMATCH` on a mismatch; missing optional drivers return `HaiVecdbError.DRIVER_NOT_FOUND`.

Qdrant `insert/upsert/delete` use `wait: true`, so success means the server applied that operation. `vector.count` requests an exact count rather than approximate collection statistics. Multiple operations do not form a transaction.

### Error handling

All operations return `HaiResult<T>`; check `result.success` for success or failure.

```ts
const result = await vecdb.collection.create('docs', { dimension: 1536 })
if (!result.success) {
  switch (result.error.code) {
    case HaiVecdbError.NOT_INITIALIZED.code:
      // 请先调用 vecdb.init()
      break
    case HaiVecdbError.COLLECTION_ALREADY_EXISTS.code:
      // 集合已存在
      break
    case HaiVecdbError.CONNECTION_FAILED.code:
      // 连接失败
      break
  }
}
```

## Development and testing

```bash
pnpm --filter @h-ai/vecdb test
```

> pgvector / Qdrant tests require Docker.

## Production shared state

Production uses Qdrant, pgvector or remote Chroma. LanceDB and embedded Chroma are for development/explicit tests. Initialization checks apply when NODE_ENV or HAI_CORE_ENV is production; only explicit HAI_E2E=1/HAI_E2E_MOCK=1 tests are exempt. [State, concurrency and recovery (Chinese)](../../docs/distributed-state.md)。

## License

Apache-2.0
