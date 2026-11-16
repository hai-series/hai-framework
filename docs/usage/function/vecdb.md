# @h-ai/vecdb 功能说明

通过 `vecdb` 把文档向量写入集合，按相似度搜索，或分批读取文档 ID。集合定义了每个向量有多少个数值，写入向量和检索向量必须具有同样的长度。

[模块 README](../../../packages/vecdb/README.md) · [配置清单](../configuration/vecdb.md) · [数据结构](../data/vecdb.md) · [数据服务接入](../development/data.md)

## 最小接入示例

搜索结果的 `score` 在 0 到 1 之间，值越大越相似。例如 `minScore: 0.7` 会滤掉转换后小于 0.7 的条目。得分不是百分比，换用距离算法或数据库后，应重新用实际数据确认阈值。

余弦使用 `(1 + cosine) / 2`，内积使用 `sigmoid(dotProduct)`，欧氏距离使用 `1 / (1 + distance)`。LanceDB 和 Chroma 返回的是欧氏距离的平方，其余后端使用欧氏距离。Qdrant 同样按模块转换后的分数筛选。

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

## 功能说明

- 创建和管理固定向量维度的集合。
- 写入文档向量，按相似度检索并过滤元数据。
- 支持 LanceDB、pgvector、Qdrant 与 Chroma；后端准备方式见[配置清单](../configuration/vecdb.md)。

### 功能输入输出

下表中的调用假定模块已经初始化成功。应用代码提供实际的业务参数，并在调用前校验输入和权限。收到 `HaiResult` 时先检查 `success`，成功时读 `data`，失败时读 `error`。成功结果为 `void` 时没有业务数据。返回 `null` 时表示没有找到值。

#### vecdb.collection

管理向量集合；create 输入名称/维度等定义，drop 输入名称均返回 void；exists 返回 boolean，info 返回维度等元数据，list 无参数返回名称数组。

| 入口                      | 输入参数      | 成功结果         | 调用示例                                                          |
| ------------------------- | ------------- | ---------------- | ----------------------------------------------------------------- |
| `vecdb.collection.create` | name, options | `void`           | `await vecdb.collection.create('documents', { dimension: 1536 })` |
| `vecdb.collection.drop`   | name          | `void`           | `await vecdb.collection.drop('documents')`                        |
| `vecdb.collection.exists` | name          | `boolean`        | `await vecdb.collection.exists('documents')`                      |
| `vecdb.collection.info`   | name          | `CollectionInfo` | `await vecdb.collection.info('documents')`                        |
| `vecdb.collection.list`   | 无参数        | `string[]`       | `await vecdb.collection.list()`                                   |

#### vecdb.vector

写入/替换输入集合和文档数组，删除输入 ID 数组，均返回 void；search 输入查询向量和过滤/topK 返回命中数组，count 返回总数。分数为统一相似度，不是概率。

| 入口                  | 输入参数                    | 成功结果               | 调用示例                                                           |
| --------------------- | --------------------------- | ---------------------- | ------------------------------------------------------------------ |
| `vecdb.vector.insert` | collection, documents       | `void`                 | `await vecdb.vector.insert('documents', vectorDocuments)`          |
| `vecdb.vector.upsert` | collection, documents       | `void`                 | `await vecdb.vector.upsert('documents', vectorDocuments)`          |
| `vecdb.vector.delete` | collection, ids             | `void`                 | `await vecdb.vector.delete('documents', ['doc-1'])`                |
| `vecdb.vector.search` | collection, vector, options | `VectorSearchResult[]` | `await vecdb.vector.search('documents', queryVector, { topK: 5 })` |
| `vecdb.vector.count`  | collection                  | `number`               | `await vecdb.vector.count('documents')`                            |
| `vecdb.vector.scan`   | collection, options         | `VectorScanPage`       | `await vecdb.vector.scan('documents', { limit: 32 })`              |

`scan` 分页返回文档 ID，可用于核对或批量清理集合。`collection` 是集合名，`options.limit` 默认为 64，取值为 1 到 128，`options.cursor` 在首页省略。每页的 `items` 只包含 `{ id }`。有 `nextCursor` 时，即使本页为空也继续读取，并将游标传给同一后端的同一集合。并发写入或删除可能改变分页结果，清理任务应重复扫描。Qdrant 只返回能映射回框架文档的记录。

```ts
// 输入集合名与页大小，输出 HaiResult<VectorScanPage>。
const page = await vecdb.vector.scan('documents', { limit: 32 })
// 成功且存在下一页时，将上一页游标与页大小传入同一集合。
if (page.success && page.data.nextCursor !== undefined) {
  const nextPage = await vecdb.vector.scan('documents', { cursor: page.data.nextCursor, limit: 32 })
  // nextPage 成功时 data.items 是下一页文档 ID，data.nextCursor 缺失时已到末页。
}
```

### 生产共享状态

生产使用 Qdrant、pgvector 或远端 Chroma；LanceDB 和嵌入式 Chroma 只用于开发/明确测试。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化发布成功前校验；仅 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试可豁免。 [状态、并发和恢复边界](../../../.agents/instructions/distributed-state.md).

### 关闭与失败恢复

```ts
const ready = vecdb.isInitialized // 无需参数，Provider 已连接并且未在关闭时为 true。
const safeType = vecdb.config?.type // 无需参数，从脱敏配置快照中读出后端类型。
const connection = vecdb.rawConnection // 无需参数，返回同进程集成使用的后端连接参数。
```

模块未初始化或正在关闭时，`vecdb.config` 与 `vecdb.rawConnection` 均返回 `null`。`rawConnection` 可能含未脱敏凭据，仅在可信服务端同进程内传递。

调用 `vecdb.close()` 后，模块停止接收新的操作，之前保存的操作对象也不能继续提交请求。多次同时关闭共用一次清理。如果连接或关闭失败后仍有资源未释放，`error.ext.cleanupPending` 会提示应用再次调用 `vecdb.close()`。资源未清理完时，`vecdb.init()` 不会另外打开连接。

使用进程内启动的 Chroma 时，模块会等待直接启动的服务器进程退出。正常终止等待 1.5 秒，超时后尝试强制终止并再等待 1.5 秒。仍未确认退出时返回失败，并保留句柄供后续清理。这一步确认的是模块直接启动的进程。

## 错误处理

收到 `HaiResult<T>` 时先检查 `result.success`。成功时读取 `result.data`，失败时查看 `result.error`。记录故障时保留错误码和追踪编号，便于从日志找到对应请求。

```ts
import { HaiVecdbError, vecdb } from '@h-ai/vecdb'

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
