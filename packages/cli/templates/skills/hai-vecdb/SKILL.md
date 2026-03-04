---
name: hai-vecdb
description: 使用 @h-ai/vecdb 进行向量数据库操作（LanceDB/pgvector/Qdrant）的集合管理与向量增删改查；当需求涉及向量存储、相似度搜索、嵌入检索或语义搜索时使用。
---

# hai-vecdb

> `@h-ai/vecdb` 提供统一的向量数据库操作接口，支持 LanceDB、pgvector、Qdrant，包含集合管理和向量 CRUD/搜索。

---

## 适用场景

- 新增或修改向量数据库访问逻辑（集合管理/向量插入/搜索）
- 接入不同向量数据库后端（LanceDB / pgvector / Qdrant）
- 基于 `VecdbErrorCode` 做错误分支处理
- 构建 RAG、语义搜索、知识库等 AI 场景

---

## 使用步骤

### 1. 配置

```yaml
# config/_vecdb.yml

# LanceDB（默认，嵌入式本地存储）
type: lancedb
path: ./data/vecdb

# pgvector
# type: pgvector
# url: ${VECDB_PG_URL:postgres://user:pass@localhost:5432/mydb}
# indexType: hnsw
# tablePrefix: vec_

# Qdrant
# type: qdrant
# url: ${VECDB_QDRANT_URL:http://localhost:6333}
# apiKey: ${VECDB_QDRANT_API_KEY:}
```

### 2. 初始化与关闭

```typescript
import { core } from '@h-ai/core'
import { vecdb } from '@h-ai/vecdb'

await vecdb.init(core.config.get('vecdb'))
// ... 使用向量数据库
await vecdb.close()
```

### 3. 选择操作接口

| 接口       | 用途                       | 入口              |
| ---------- | -------------------------- | ----------------- |
| collection | 集合创建/删除/查询/判断存在 | `vecdb.collection` |
| vector     | 向量插入/更新/删除/搜索/计数 | `vecdb.vector`     |

---

## 核心 API

### 集合操作 — `vecdb.collection`

| 方法     | 签名                                       | 说明           |
| -------- | ------------------------------------------ | -------------- |
| `create` | `(name, options) => Result<void>`          | 创建集合       |
| `drop`   | `(name) => Result<void>`                   | 删除集合       |
| `exists` | `(name) => Result<boolean>`                | 判断集合是否存在 |
| `info`   | `(name) => Result<CollectionInfo>`         | 获取集合信息   |
| `list`   | `() => Result<string[]>`                   | 列出所有集合   |

> 所有方法均返回 `Promise<Result<T, VecdbError>>`，上表省略异步与错误类型。

```typescript
// 创建集合（指定维度和度量）
await vecdb.collection.create('docs', { dimension: 1536, metric: 'cosine' })

// 查询集合信息
const info = await vecdb.collection.info('docs')
if (info.success) {
  // info.data => { name, dimension, metric, count }
}

// 列出所有集合
const list = await vecdb.collection.list()
```

**CollectionCreateOptions**：

```typescript
interface CollectionCreateOptions {
  dimension: number            // 向量维度（必填）
  metric?: 'cosine' | 'euclidean' | 'dot'  // 距离度量（默认 cosine）
}
```

### 向量操作 — `vecdb.vector`

| 方法     | 签名                                                | 说明           |
| -------- | --------------------------------------------------- | -------------- |
| `insert` | `(collection, documents) => Result<void>`           | 批量插入       |
| `upsert` | `(collection, documents) => Result<void>`           | 批量更新/插入  |
| `delete` | `(collection, ids) => Result<void>`                 | 按 ID 删除     |
| `search` | `(collection, vector, options?) => Result<SearchResult[]>` | 向量搜索 |
| `count`  | `(collection) => Result<number>`                    | 文档计数       |

> 所有方法均返回 `Promise<Result<T, VecdbError>>`，上表省略异步与错误类型。

```typescript
// 插入向量文档
await vecdb.vector.insert('docs', [
  { id: 'doc-1', vector: embedding, content: '文档内容', metadata: { source: 'wiki' } },
  { id: 'doc-2', vector: embedding2, content: '另一段内容' },
])

// 向量搜索（返回相似度排序结果）
const result = await vecdb.vector.search('docs', queryVector, {
  topK: 10,
  minScore: 0.7,
  filter: { source: 'wiki' },
})
if (result.success) {
  for (const item of result.data) {
    // item => { id, score, content, metadata }
  }
}

// 更新已有文档（按 id 匹配）
await vecdb.vector.upsert('docs', [
  { id: 'doc-1', vector: newEmbedding, content: '更新后的内容' },
])

// 删除
await vecdb.vector.delete('docs', ['doc-1', 'doc-2'])
```

**VectorDocument**：

```typescript
interface VectorDocument {
  id: string                            // 文档唯一标识
  vector: number[]                      // 向量数据
  content?: string                      // 文本内容（可选）
  metadata?: Record<string, unknown>    // 元数据（可选）
}
```

**VectorSearchOptions**：

```typescript
interface VectorSearchOptions {
  topK?: number                         // 返回数量（默认 10）
  filter?: Record<string, unknown>      // 元数据过滤（键值精确匹配）
  minScore?: number                     // 最低相似度阈值（0-1）
}
```

---

## 错误码 — `VecdbErrorCode`

| 错误码                       | 值   | 说明               |
| ---------------------------- | ---- | ------------------ |
| `CONNECTION_FAILED`          | 3500 | 连接失败           |
| `QUERY_FAILED`               | 3501 | 查询失败           |
| `COLLECTION_NOT_FOUND`       | 3502 | 集合不存在         |
| `COLLECTION_ALREADY_EXISTS`  | 3503 | 集合已存在         |
| `DIMENSION_MISMATCH`         | 3504 | 向量维度不匹配     |
| `INSERT_FAILED`              | 3505 | 插入失败           |
| `DELETE_FAILED`              | 3506 | 删除失败           |
| `UPDATE_FAILED`              | 3507 | 更新失败           |
| `INDEX_BUILD_FAILED`         | 3508 | 索引构建失败       |
| `NOT_INITIALIZED`            | 3509 | 未初始化           |
| `CONFIG_ERROR`               | 3510 | 配置错误           |
| `UNSUPPORTED_TYPE`           | 3511 | 不支持的数据库类型 |
| `DRIVER_NOT_FOUND`           | 3512 | 驱动未安装         |
| `SERIALIZATION_FAILED`       | 3513 | 序列化失败         |

---

## 常见模式

### RAG 检索

```typescript
import { ai } from '@h-ai/ai'
import { vecdb } from '@h-ai/vecdb'

// 将查询文本转为向量
const embedResult = await ai.embedding.embedText(query)
if (!embedResult.success) return embedResult

// 检索最相似的文档
const searchResult = await vecdb.vector.search('knowledge', embedResult.data, {
  topK: 5,
  minScore: 0.7,
})
if (!searchResult.success) return searchResult

// 拼接上下文，送入 LLM
const context = searchResult.data.map(r => r.content).join('\n\n')
const chatResult = await ai.llm.chat({
  messages: [
    { role: 'system', content: `参考以下资料回答用户问题：\n${context}` },
    { role: 'user', content: query },
  ],
})
```

### 文档入库

```typescript
import { datapipe } from '@h-ai/datapipe'
import { ai } from '@h-ai/ai'
import { vecdb } from '@h-ai/vecdb'

// 清洗 + 分块
const pipeline = await datapipe.pipeline()
  .clean({ removeHtml: true })
  .chunk({ mode: 'markdown', maxSize: 1000, overlap: 100 })
  .run(rawText)

if (!pipeline.success) return pipeline

// 批量生成嵌入
const embeddings = await ai.embedding.embedBatch(
  pipeline.data.chunks.map(c => c.content),
)
if (!embeddings.success) return embeddings

// 批量入库
const docs = pipeline.data.chunks.map((chunk, i) => ({
  id: `doc-${i}`,
  vector: embeddings.data[i],
  content: chunk.content,
  metadata: chunk.metadata,
}))
await vecdb.vector.insert('knowledge', docs)
```

### 错误分支处理

```typescript
import { vecdb, VecdbErrorCode } from '@h-ai/vecdb'

const result = await vecdb.collection.create('docs', { dimension: 1536 })
if (!result.success) {
  switch (result.error.code) {
    case VecdbErrorCode.COLLECTION_ALREADY_EXISTS:
      // 集合已存在，可跳过
      break
    case VecdbErrorCode.NOT_INITIALIZED:
      // 未初始化，需先 vecdb.init()
      break
    default:
      // 意外错误
      break
  }
}
```

---

## 相关 Skills

- `hai-ai`：LLM 与 Embedding 能力
- `hai-datapipe`：文本清洗与分块
- `hai-db`：关系型数据库（知识库需要同时使用 reldb 存储结构化数据）
- `hai-core`：配置管理、Result 模型
