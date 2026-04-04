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
- 基于 `HaiVecdbError` 做错误分支处理
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
# url: ${HAI_VECDB_PG_URL:postgres://user:pass@localhost:5432/mydb}
# indexType: hnsw
# tablePrefix: vec_

# Qdrant
# type: qdrant
# url: ${HAI_VECDB_QDRANT_URL:http://localhost:6333}
# apiKey: ${HAI_VECDB_QDRANT_API_KEY:}
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
| `create` | `(name, options) => HaiResult<void>`          | 创建集合       |
| `drop`   | `(name) => HaiResult<void>`                   | 删除集合       |
| `exists` | `(name) => HaiResult<boolean>`                | 判断集合是否存在 |
| `info`   | `(name) => HaiResult<CollectionInfo>`         | 获取集合信息   |
| `list`   | `() => HaiResult<string[]>`                   | 列出所有集合   |

> 所有方法均返回 `Promise<HaiResult<T>>`，上表省略异步与错误类型。

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
| `insert` | `(collection, documents) => HaiResult<void>`           | 批量插入       |
| `upsert` | `(collection, documents) => HaiResult<void>`           | 批量更新/插入  |
| `delete` | `(collection, ids) => HaiResult<void>`                 | 按 ID 删除     |
| `search` | `(collection, vector, options?) => HaiResult<SearchResult[]>` | 向量搜索 |
| `count`  | `(collection) => HaiResult<number>`                    | 文档计数       |

> 所有方法均返回 `Promise<HaiResult<T>>`，上表省略异步与错误类型。

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

## 错误码 — `HaiVecdbError`

| 错误码                                    | code              | 说明               |
| ----------------------------------------- | ----------------- | ------------------ |
| `HaiVecdbError.CONNECTION_FAILED`         | `hai:vecdb:001`   | 连接失败           |
| `HaiVecdbError.QUERY_FAILED`             | `hai:vecdb:002`   | 查询失败           |
| `HaiVecdbError.COLLECTION_NOT_FOUND`     | `hai:vecdb:003`   | 集合不存在         |
| `HaiVecdbError.COLLECTION_ALREADY_EXISTS`| `hai:vecdb:004`   | 集合已存在         |
| `HaiVecdbError.DIMENSION_MISMATCH`       | `hai:vecdb:005`   | 向量维度不匹配     |
| `HaiVecdbError.INSERT_FAILED`            | `hai:vecdb:006`   | 插入失败           |
| `HaiVecdbError.DELETE_FAILED`            | `hai:vecdb:007`   | 删除失败           |
| `HaiVecdbError.UPDATE_FAILED`            | `hai:vecdb:008`   | 更新失败           |
| `HaiVecdbError.INDEX_BUILD_FAILED`       | `hai:vecdb:009`   | 索引构建失败       |
| `HaiVecdbError.NOT_INITIALIZED`          | `hai:vecdb:010`   | 未初始化           |
| `HaiVecdbError.CONFIG_ERROR`             | `hai:vecdb:011`   | 配置错误           |
| `HaiVecdbError.UNSUPPORTED_TYPE`         | `hai:vecdb:012`   | 不支持的数据库类型 |
| `HaiVecdbError.DRIVER_NOT_FOUND`         | `hai:vecdb:013`   | 驱动未安装         |
| `HaiVecdbError.SERIALIZATION_FAILED`     | `hai:vecdb:014`   | 序列化失败         |

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
import { vecdb, HaiVecdbError } from '@h-ai/vecdb'

const result = await vecdb.collection.create('docs', { dimension: 1536 })
if (!result.success) {
  switch (result.error.code) {
    case HaiVecdbError.COLLECTION_ALREADY_EXISTS.code:
      // 集合已存在，可跳过
      break
    case HaiVecdbError.NOT_INITIALIZED.code:
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
- `hai-reldb`：关系型数据库（知识库需要同时使用 reldb 存储结构化数据）
- `hai-core`：配置管理、HaiResult 模型
