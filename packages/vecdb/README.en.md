# @h-ai/vecdb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

A vector database module with a unified `vecdb` object for LanceDB, pgvector, Qdrant, and Chroma.

## Supported vector databases

- LanceDB (embedded, local file storage, zero configuration)
- pgvector (PostgreSQL + pgvector extension)
- Qdrant (high-performance vector search engine; server 1.10.0+ with the Query API)
- Chroma (automatically start a local service in embedded mode, or connect to an existing service)

## Quick start

```ts
import { HaiVecdbError, vecdb } from '@h-ai/vecdb'

// 初始化（LanceDB）
await vecdb.init({ type: 'lancedb', path: './data/vecdb' })

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

## Configuration

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

### Operation logging

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

## Error handling

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

## Tests

```bash
pnpm --filter @h-ai/vecdb test
```

> pgvector / Qdrant tests require Docker.

## License

Apache-2.0
