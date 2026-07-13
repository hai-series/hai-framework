# @h-ai/vecdb

向量数据库模块，通过统一的 `vecdb` 对象访问 LanceDB、pgvector、Qdrant、Chroma。

## 支持的向量数据库

- LanceDB（嵌入式，本地文件存储，零配置）
- pgvector（PostgreSQL + pgvector 扩展）
- Qdrant（高性能向量搜索引擎）
- Chroma（支持嵌入式自动拉起本地服务，或直连已有服务）

## 快速开始

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

## 配置

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

> Chroma 在 Node 端只有 HTTP 客户端（无进程内嵌入式）。嵌入式模式下 `vecdb.init` 会
> 通过 `serverCommand`（默认 `chroma`，来自 `chromadb` 包）拉起本地服务，`vecdb.close`
> 时关闭进程。需安装可选依赖 `chromadb`；服务命令不可用时 `init` 返回 `CONNECTION_FAILED`。

### 操作日志

可在向量数据库配置中通过 `operationLog` 开启操作日志。日志在集合/向量操作进入真实 Provider 前输出，不在 `vecdb-main.ts` 中做统一包装。

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

> 注意：`vecdb.config` 返回的是**脱敏配置快照**；连接字符串中的用户名/密码、独立 `password` 字段和 `apiKey` 会被替换为 `[REDACTED]`。

> 行为说明：空批量 `insert/upsert/delete` 会被视为 no-op；写入与搜索会校验向量维度，不匹配时返回 `HaiVecdbError.DIMENSION_MISMATCH`；缺少可选驱动时返回 `HaiVecdbError.DRIVER_NOT_FOUND`。

## 错误处理

所有操作返回 `HaiResult<T>`，通过 `result.success` 判断成功或失败。

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

## 测试

```bash
pnpm --filter @h-ai/vecdb test
```

> pgvector / Qdrant 测试需要 Docker。

## License

Apache-2.0
