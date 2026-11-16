# @h-ai/vecdb 功能说明

在服务端连接向量存储并操作向量集合，按统一相似度搜索，或按游标遍历文档 ID。集合维度必须与写入和查询向量一致。

[模块 README](../../../packages/vecdb/README.md) · [配置清单](../configuration/vecdb.md) · [数据结构](../data/vecdb.md) · [数据服务接入](../development/data.md)

## 最小接入示例

所有 Provider 的 `score` 都为 0–1，越大越相似；`minScore` 在转换后过滤。余弦使用 `(1 + cosine) / 2`，内积使用 `sigmoid(dotProduct)`，欧氏使用 `1 / (1 + distance)`；LanceDB/Chroma 的 distance 是原生 squared L2，其余后端使用原生 L2。不同 metric/后端的阈值仍需按业务校准，score 不代表概率。Qdrant 的公开 minScore 使用统一相似度，而非原生距离阈值。

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

以下片段依赖上面的最小接入示例。示例中的业务值由宿主校验和授权后传入；异步领域结果先判断 success，再读取 data。表中 void 表示操作已完成且没有返回数据，null 表示不存在；同步工厂/工具直接返回表中类型。

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

close 立即停止当前操作与此前取得的操作引用；连接失败候选和关闭失败资源仅作为待清理所有权保留，不再提供业务服务。并发 close 合并，进行中的 init 先确定资源归属再关闭。失败结果的 error.ext.cleanupPending 表示仍须用同一模块的 close 重试；清理成功前 init 不创建替代资源。内嵌 Chroma 等待实际 spawn，终止直接启动的服务器后等待 exit；普通终止超过 1.5 秒后升级强制终止，再等待 1.5 秒，未确认退出返回失败并保留句柄。该验证覆盖直接子进程，不把信号回执等同于进程树退出或真实 Chroma CLI 上线验收。

## 错误处理

返回 `HaiResult<T>` 的操作通过 `result.success` 区分成功与失败。业务成功后读取 `data`，诊断失败时记录 `error.code` 和关联编号。

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
