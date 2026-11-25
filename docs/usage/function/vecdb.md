# @h-ai/vecdb 功能说明

[English](vecdb.en.md) · [日本語](vecdb.ja.md)

通过 `vecdb` 把文档向量写入集合，按相似度搜索，或分批读取文档 ID。集合定义了每个向量有多少个数值，写入向量和检索向量必须具有同样的长度。

[模块 README](../../../packages/vecdb/README.md) · [配置清单](../configuration/vecdb.md) · [数据结构](../data/vecdb.md) · [数据服务接入](../development/data.md)

<a id="quick-start"></a>

## 最小接入示例

在开发环境用空的 `./data/vecdb` 目录运行示例。示例关闭连接后保留 `docs` 集合。需要重跑时，使用另一个空目录。

搜索结果的 `score` 在 0 到 1 之间，值越大越相似。例如 `minScore: 0.7` 会滤掉转换后小于 0.7 的条目。得分不是百分比，换用距离算法或数据库后，应重新用实际数据确认阈值。

余弦使用 `(1 + cosine) / 2`，内积使用 `sigmoid(dotProduct)`，欧氏距离使用 `1 / (1 + distance)`。LanceDB 和 Chroma 返回的是欧氏距离的平方，其余后端使用欧氏距离。Qdrant 同样按模块转换后的分数筛选。

```ts
import { vecdb } from '@h-ai/vecdb'

// 打开本地 LanceDB 连接。
// 用本地 ./data/vecdb 初始化 LanceDB。成功 data 为 undefined，连接失败读取 error。
const initialized = await vecdb.init({ type: 'lancedb', path: './data/vecdb' })
if (!initialized.success)
  throw new Error(initialized.error.message)

try {
  // 创建余弦相似度集合，每个向量有 3 个数值。
  // 用 docs 名称创建三维余弦集合。成功 data 为 undefined，重复名称等失败读取 error。
  const created = await vecdb.collection.create('docs', { dimension: 3, metric: 'cosine' })
  if (!created.success)
    throw new Error(created.error.message)

  // 写入一条文档向量，content 和 metadata 会随结果返回。
  // 将文档 ID、三维向量及内容和来源写入 docs。成功 data 为 undefined，插入失败读取 error。
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
  // 用三维查询向量在 docs 中搜索分数至少 0.7 的最多 5 条记录，data 为命中数组或 []，失败读取 error。
  const matches = await vecdb.vector.search('docs', [0.9, 0.1, 0], { topK: 5, minScore: 0.7 })
  if (!matches.success)
    throw new Error(matches.error.message)
  // 命中项包含 id、score、content 和 metadata。
  const firstMatch = matches.data[0]
  process.stdout.write(`${JSON.stringify(firstMatch)}\n`)
}
finally {
  // 释放连接，即使创建、写入或搜索失败也执行。
  // 无参数释放本例连接，成功 data 为 undefined。清理失败记录错误码。
  const closed = await vecdb.close()
  if (!closed.success)
    process.stderr.write(`Vecdb close failed: ${closed.error.code}\n`)
}
```

<a id="api-reference"></a>

## 功能说明

下面的场景代码从本页最小接入中导入模块；除连接/关闭场景外，均在初始化成功后、关闭前运行。每次调用后先检查 `HaiResult.success`；失败分支返回原结果，成功分支再读取 `data`。未给出函数声明的场景是应用异步业务函数内的片段。各场景使用独立测试数据，不能把相邻片段当成无需清理的生产脚本。

<a id="connection"></a>

### 连接与关闭：`vecdb`

先连接配置的向量后端，再创建集合和操作向量；原始连接只在可信服务端传递。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `vecdb.init(config)` | 初始化配置指定的后端 | `config.type` 必填；后端字段和默认值见[配置清单](../configuration/vecdb.md) | `HaiResult<void>` | `await vecdb.init({ type: 'lancedb', path: './data/vecdb' })` |
| `vecdb.close()` | 等待并释放当前连接 | 无参数 | `HaiResult<void>`；清理失败可重试 | `await vecdb.close()` |
| `vecdb.isInitialized` | 查询能否接收新请求 | 只读属性，启动前为 `false` | `boolean` | `const ready = vecdb.isInitialized` |
| `vecdb.config` | 读取当前脱敏配置 | 只读属性，未打开或关闭中为 `null` | `VecdbConfig` 或 `null` | `const backend = vecdb.config?.type` |
| `vecdb.rawConnection` | 供同进程内的可信集成复用连接参数 | 只读属性，未打开或关闭中为 `null` | `VecdbConnection` 或 `null`。可能含凭据 | `const connection = vecdb.rawConnection` |

#### 场景：连接与关闭

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 打开 ./data/docs-demo 中的 LanceDB，成功可访问集合且无 data，失败时返回原失败结果。
const initResult = await vecdb.init({ type: 'lancedb', path: './data/docs-demo' })
if (!initResult.success)
  return initResult
// 直接读取就绪属性，连接成功后为 true。
vecdb.isInitialized // true
// 从连接后的脱敏配置读取 type，本例为 lancedb。
vecdb.config?.type // 'lancedb'
// 读取同进程集成需要的后端连接信息，可能含凭据。
const connection = vecdb.rawConnection // backend-specific connection; may contain credentials
// 不传参数关闭当前连接，成功 data 为 undefined，失败时返回原失败结果。
const closeResult = await vecdb.close()
if (!closeResult.success)
  return closeResult
// 直接读取关闭后的配置，返回 null。
vecdb.config // null
```

本地示例限开发使用。close 成功后业务连接不可用；其他示例先重新连接。不要把 rawConnection 写入日志或返回浏览器。

- 创建和管理固定向量维度的集合。
- 写入文档向量，按相似度检索并过滤元数据。
- 支持 LanceDB、pgvector、Qdrant 与 Chroma；后端准备方式见[配置清单](../configuration/vecdb.md)。

异步操作返回 `Promise<HaiResult<T>>`。下表的返回值说明成功时 `data` 的内容，失败时读取 `error`。集合和向量操作要在 `vecdb.init()` 成功后调用。

<a id="production-backends"></a>

#### 生产后端要求

生产部署选择 Qdrant、pgvector 或独立运行的 Chroma 服务。设置 `NODE_ENV=production` 或 `HAI_CORE_ENV=production` 时，`init` 会拒绝 LanceDB 和嵌入式 Chroma。设置 `HAI_E2E=1` 或 `HAI_E2E_MOCK=1` 可在明确的测试环境中豁免此限制。参见[状态、并发和恢复边界](../../../.agents/instructions/distributed-state.md)。

已有连接时，`init` 先校验新配置和部署环境。校验失败时返回 `CONFIG_ERROR`，已有连接继续可用。通过校验后，模块关闭旧连接再尝试连接新后端。

<a id="connection-recovery"></a>

#### 场景：连接清理失败后恢复

pgvector 的空闲连接断开后，连接池会移除该连接，后续操作按需建立新连接。故障期间的操作仍可能返回失败，应用应检查 `success`。

调用 `vecdb.close()` 会停止接收新操作，包括应用通过已保存的操作对象发起的请求。并发调用共享同一次清理。若初始化或关闭失败且 `error.ext.cleanupPending` 为 `true`，调用 `close()` 重试清理。`init()` 也会先处理待清理资源，清理成功后才连接后端。

```ts
// 应用异步函数片段。关闭当前连接，成功时 data 为 undefined。
const closed = await vecdb.close()
if (!closed.success) {
  if (!closed.error.ext?.cleanupPending)
    return closed
  // 有待清理资源时再尝试关闭，仍失败则把错误交给调用方处理。
  const retried = await vecdb.close()
  if (!retried.success)
    return retried
}
```

嵌入式 Chroma 关闭时等待模块直接启动的服务进程退出。模块发出终止信号后最多等待 1.5 秒，超时则尝试强制终止，再等待 1.5 秒。若仍未确认退出，模块返回失败并保留进程句柄供重试。

<a id="collections"></a>

### 准备与删除集合：`vecdb.collection`

集合固定向量维度和距离算法。删除集合会删除其中所有向量。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `vecdb.collection.create(name, options)` | 创建集合 | `name` 是集合名，`options.dimension` 必填且为正整数。维度须匹配写入与查询向量。`metric` 为 `cosine`、`euclidean` 或 `dot`，默认沿用连接配置，未设置时为 `cosine` | `void` | `await vecdb.collection.create('documents', { dimension: 3 })` |
| `vecdb.collection.drop(name)` | 删除集合和其中的文档向量 | `name: string` 必填的已配置集合名 | `void` | `await vecdb.collection.drop('documents')` |
| `vecdb.collection.exists(name)` | 检查集合是否存在 | `name: string` 必填的已配置集合名 | `boolean` | `await vecdb.collection.exists('documents')` |
| `vecdb.collection.info(name)` | 查询集合的维度、度量和文档数 | `name: string` 必填的已配置集合名 | `CollectionInfo` | `await vecdb.collection.info('documents')` |
| `vecdb.collection.list()` | 列出集合名称 | 无参数 | `string[]` | `await vecdb.collection.list()` |

多个实例同时在 Chroma、pgvector 或 Qdrant 创建同名集合时，后续创建调用会返回 `COLLECTION_ALREADY_EXISTS`。准备共享集合的应用可读取已有集合的维度和度量，确认匹配后再继续。Qdrant 删除不存在的集合时返回 `COLLECTION_NOT_FOUND`。

对于通过 Chroma 原生接口创建、尚未写入过向量的集合，`vecdb.collection.info()` 的 `dimension` 为 `0`。第一次写入确定维度，之后即使删光文档也会保留。度量以服务端索引配置为准。创建框架集合时仍用 `options.dimension` 明确指定维度。

#### 场景：准备与删除集合

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 创建名为 demo-docs 的三维余弦集合。成功无 data，创建失败时返回原失败结果。
const createResult = await vecdb.collection.create('demo-docs', { dimension: 3, metric: 'cosine' })
if (!createResult.success)
  return createResult
// 检查刚创建的 demo-docs，成功 data 为 true，后端错误时返回原失败结果。
const existsResult = await vecdb.collection.exists('demo-docs')
if (!existsResult.success)
  return existsResult
existsResult.data // true
// 不传名称，读取全部集合名，data 包含 demo-docs。读取失败时返回原失败结果。
const listResult = await vecdb.collection.list()
if (!listResult.success)
  return listResult
listResult.data // 包含 demo-docs 集合
// 按 demo-docs 读取三维余弦集合信息，此时文档数为 0，读取失败时返回原失败结果。
const infoResult = await vecdb.collection.info('demo-docs')
if (!infoResult.success)
  return infoResult
const info = infoResult.data // 维度为 3、使用余弦度量，当前文档数为 0
// 删除 demo-docs 及其中数据，成功无 data，删除失败时返回原失败结果。
const dropResult = await vecdb.collection.drop('demo-docs')
if (!dropResult.success)
  return dropResult
// 再检查已删除的 demo-docs，data 为 false，查询失败时返回原失败结果。
const existsResult2 = await vecdb.collection.exists('demo-docs')
if (!existsResult2.success)
  return existsResult2
existsResult2.data // false
```

输入为尚不存在的 demo-docs。后续向量场景需要再创建这个三维集合；删除不存在或无法访问的集合按后端返回失败。

<a id="vectors"></a>

### 写入、检索和清理文档：`vecdb.vector`

LanceDB 和 pgvector 的大批次使用 Worker 构造 Arrow 批次或 SQL 参数。写入仍通过宿主提交。Qdrant 的大响应在线程内解码和校验，滚动读取保留完整的 uint64 游标。

使用相同维度的向量写入和搜索，按 ID 修改或删除文档；扫描用于分页盘点。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `vecdb.vector.insert(collection, documents)` | 写入文档向量 | `collection: string` 必填的集合名。`documents: VectorDocument[]` 必填文档数组，见[文档字段](#vecdb-vector-options) | `void` | `await vecdb.vector.insert('documents', [{ id: 'doc-1', vector: [1, 0, 0] }])` |
| `vecdb.vector.upsert(collection, documents)` | 插入文档，或按 ID 整条替换 | `collection: string` 必填的集合名。`documents: VectorDocument[]` 必填文档数组，见[文档字段](#vecdb-vector-options) | `void` | `await vecdb.vector.upsert('documents', [{ id: 'doc-1', vector: [1, 0, 0], content: '新版' }])` |
| `vecdb.vector.delete(collection, ids)` | 按 ID 删除文档 | `collection: string` 必填的集合名。`ids: string[]` 待删除的文档 ID 数组 | `void` | `await vecdb.vector.delete('documents', ['doc-1'])` |
| `vecdb.vector.search(collection, vector, options?)` | 根据相似度搜索向量 | `collection: string` 必填的集合名。`vector: number[]` 与集合维度一致的查询向量。`options?: VectorSearchOptions` 见[搜索字段](#vecdb-vector-options) | 按分数从高到低排列的 `VectorSearchResult[]` | `await vecdb.vector.search('documents', [0.9, 0.1, 0], { topK: 5 })` |
| `vecdb.vector.count(collection)` | 统计集合中的文档数。Qdrant 返回集合中点的总数 | `collection: string` 必填的集合名 | `number` | `await vecdb.vector.count('documents')` |
| `vecdb.vector.scan(collection, options?)` | 按页列出文档 ID | `collection: string` 必填的集合名。`options?: VectorScanOptions` 见[扫描字段](#vecdb-vector-options) | `VectorScanPage` | `await vecdb.vector.scan('documents', { limit: 32 })` |

<a id="vecdb-vector-options"></a>

**文档、搜索与扫描选项**

| 字段 | 类型 | 必填与默认 | 用途及生效条件 |
| --- | --- | --- | --- |
| `VectorDocument.id` | `string` | 必填 | 应用的稳定文档标识，用于覆盖和删除。 |
| `VectorDocument.vector` | `number[]` | 必填 | 浮点数数组，维度必须与集合相同。 |
| `VectorDocument.content` | `string` | 可省略 | 随命中结果返回的原始文本。 |
| `VectorDocument.metadata` | `Record<string, unknown>` | 可省略 | 存储额外业务信息，例如 source，后续可据此筛选。Chroma 保留键见[元数据替换](#chroma-metadata-replacement)。 |
| `VectorSearchOptions.topK` | `number` | `10` | 返回的条数上限，按相似度排序。 |
| `VectorSearchOptions.minScore` | `number` | `0` | 0–1 的分数下限，等于阈值的结果也保留。 |
| `VectorSearchOptions.filter` | `Record<string, unknown>` | 不筛选元数据 | 按指定集合中每份文档的 `VectorDocument.metadata` 筛选，例如 `{ tenantId: 'tenant-a' }`。 |
| `VectorScanOptions.cursor` | `string` | 首页省略 | 传上次 nextCursor，保持相同后端和集合。 |
| `VectorScanOptions.limit` | `number` | `64` | 每页 ID 数量，取整数 1–128。 |

`topK` 是按相似度返回的条数上限。`minScore` 是 0–1 的分数下限，结果必须大于等于该值。写入时指定 `metadata: { source: 'handbook' }`，搜索时直接传 `filter: { source: 'handbook' }`。VecDB 会在各后端的[对应存储字段](../data/vecdb.md#document-field-mapping)中匹配。

四个后端通用的写法是用顶层字符串字段做等值匹配，多个字段须同时命中。数值、`null`、嵌套字段和操作符的比较规则取决于后端。LanceDB 区分字段类型，支持字符串、有限数字、布尔值和 `null`。字段缺失时无法匹配 `null`，不支持的值返回 `CONFIG_ERROR`。

##### 重复文档 ID

假设 `doc-1` 已保存正文 `Install`，随后用 `insert` 提交相同 ID 和新正文 `Install v2`。第二次调用的结果取决于后端。

| 后端 | 第二次 `insert` 的结果 |
| --- | --- |
| LanceDB | 成功，保留 `Install`。同一批次中有重复 ID 时，整批返回 `CONFIG_ERROR`。 |
| pgvector | 返回 `INSERT_FAILED`，整批没有写入，`doc-1` 保留 `Install`。 |
| Qdrant | 成功，正文替换为 `Install v2`。 |
| Chroma | 成功，保留 `Install`。 |

要更新已存在的文档，请调用 `upsert`。Chroma 的已有 ID 行为来自其 [`add` 接口](https://docs.trychroma.com/docs/collections/add-data#behaviors)。

要使用现有文档建立 LanceDB 集合，参见[导入现有文档](../data/vecdb.md#lancedb-import-documents)。

<a id="chroma-metadata-replacement"></a>

##### Chroma 元数据替换

下例先用 `{ legacyTag: 'draft' }` 写入 `doc-1`，再对同一个 ID 调用 `upsert` 并传入 `{ source: 'handbook' }`。在 Chroma 上，VecDB 搜索结果只返回新的业务属性，使用 `{ legacyTag: 'draft' }` 过滤时不会命中。有效字段清单与向量、正文通过同一次 `upsert` 提交。缺少有效字段清单的记录按存储中的业务元数据读取。直接通过 Chroma 查看存储数据时，可能仍看到被移除的字段。框架保留 `_hai_vecdb_metadata_keys`，`insert` 和 `upsert` 会拒绝显式提供该键。部署版本的要求见 [Chroma 连接示例](../configuration/vecdb.md#chroma-server)。

<a id="qdrant-document-visibility"></a>

##### Qdrant 文档与集合中的点

`search` 和 `scan` 都只返回能映射回 VecDB 文档 ID 的点。其他点仍留在原集合，也不会占用 `topK`。例如同一集合有一条 VecDB 文档和一个无法映射的原生点。即使原生点的相似度更高，`topK: 1` 仍可返回那条符合条件的 VecDB 文档。`vector.count()` 精确统计所有点，本例返回 `2`。达到候选上限后，如果仍无法确认已取到所需文档，搜索会返回 `QUERY_FAILED`。

#### 场景：写入、检索和清理文档

VecDB 保存和比较数字向量，不会自动把文本变成向量。写入端与查询端必须使用同一模型和维度。

![从文本到检索结果：谁负责生成向量](../images/function-vecdb-responsibilities.svg)

例中的集合维度为 3，所以写入和查询都传 [1,0,0]；同向向量的余弦转换分数约为 1。真实文本由应用或 AI embedding 先转换，搜索返回匹配及 score，不自动生成回答，score 也不是百分比。

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 创建名为 demo-docs 的三维余弦集合。成功无 data，创建失败时返回原失败结果。
const createResult = await vecdb.collection.create('demo-docs', { dimension: 3, metric: 'cosine' })
if (!createResult.success)
  return createResult
// 将 doc-1、三维向量、原文 Install 和草稿标记写入 demo-docs。成功无 data，失败时返回原结果。
const insertResult = await vecdb.vector.insert('demo-docs', [{ id: 'doc-1', vector: [1, 0, 0], content: 'Install', metadata: { legacyTag: 'draft' } }])
if (!insertResult.success)
  return insertResult
// 按集合名统计插入后的文档数，data 为 1，失败时返回原失败结果。
const countResult = await vecdb.vector.count('demo-docs')
if (!countResult.success)
  return countResult
countResult.data // 1
// 用同一 doc-1 替换正文与元数据，写入 source=handbook。成功无 data，失败时返回原失败结果。
const upsertResult = await vecdb.vector.upsert('demo-docs', [{ id: 'doc-1', vector: [1, 0, 0], content: 'Install v2', metadata: { source: 'handbook' } }])
if (!upsertResult.success)
  return upsertResult
// 查询同一向量，仅取 source=handbook 且分数至少 0.9 的最高 1 条。返回更新后的 doc-1；失败时返回原失败结果。
const matchesResult = await vecdb.vector.search('demo-docs', [1, 0, 0], { topK: 1, minScore: 0.9, filter: { source: 'handbook' } })
if (!matchesResult.success)
  return matchesResult
const matches = matchesResult.data
// 首个结果是 doc-1，正文为 Install v2，元数据为 { source: 'handbook' }，分数约 1。
// 查询已移除的 legacyTag=draft。成功 data 为 []，失败时返回原结果。
const excluded = await vecdb.vector.search('demo-docs', [1, 0, 0], { filter: { legacyTag: 'draft' } })
if (!excluded.success)
  return excluded
excluded.data // []
// 从 demo-docs 首页读取最多 32 个文档 ID，成功 data 含 items 及可选 nextCursor，失败时返回原失败结果。
const pageResult = await vecdb.vector.scan('demo-docs', { limit: 32 })
if (!pageResult.success)
  return pageResult
const page = pageResult.data
// page.items: [{ id: 'doc-1' }]; continue using nextCursor when present
// 从 demo-docs 删除列表中唯一的 doc-1，成功无 data，失败时返回原失败结果。
const deleteResult = await vecdb.vector.delete('demo-docs', ['doc-1'])
if (!deleteResult.success)
  return deleteResult
// 删除后再统计 demo-docs，data 为 0，查询失败时返回原失败结果。
const countResult2 = await vecdb.vector.count('demo-docs')
if (!countResult2.success)
  return countResult2
countResult2.data // 0
```

输入向量 [1,0,0] 与被存储向量一致，余弦转换分数约为 1。内容来自最新的整条 upsert。并发变化时扫描可能不完整，游标规则见下文；不要把 score 当百分比。

<a id="tenant-filter"></a>

#### 场景：按已授权租户检索文档

共享集合中的文档写入时，由服务端把归属租户保存到 `metadata.tenantId`。处理搜索请求时，服务端先通过 IAM 验证身份和集合访问权限，从已验证的会话或授权结果取得 `authorizedTenantId`。查询向量 `queryVector` 由应用用同一嵌入模型生成。

```ts
// 服务端异步函数片段。documents 是已授权访问的共享集合。
const result = await vecdb.vector.search('documents', queryVector, {
  topK: 5,
  filter: { tenantId: authorizedTenantId },
})
if (!result.success)
  return result
const matches = result.data
```

如果集合里有属于 `tenant-a` 和 `tenant-b` 的文档，已授权为 `tenant-a` 的请求只会从 `tenant-a` 的文档中取至多五条。按所有者限制搜索时，可以同样保存并筛选 `metadata.ownerId`。搜索出错时保留原失败结果。写入、删除和扫描各自需要服务端授权。

<a id="scan-pages"></a>

#### 场景：按后端游标继续盘点文档

用 `scan` 分页核对集合中的文档 ID。每页 `items` 只有 `{ id }`。只要有 `nextCursor`，即使本页为空也继续读取，并把游标交回同一后端的同一集合。扫描期间发生写入或删除时，分页结果可能变化。盘点或清理任务可在数据稳定后再扫描一轮。Qdrant 的扫描范围见[集合中的点](#qdrant-document-visibility)。

```ts
// 应用异步函数片段。documents 是一个已存在的集合。
const firstPage = await vecdb.vector.scan('documents', { limit: 32 })
if (!firstPage.success)
  return firstPage
// 成功时 data.items 含最多 32 个 ID。仅在返回游标时续页。
const cursor = firstPage.data.nextCursor
if (cursor !== undefined) {
  const nextPage = await vecdb.vector.scan('documents', { cursor, limit: 32 })
  if (!nextPage.success)
    return nextPage
  // data.items 是下一页 ID，data.nextCursor 缺失时已到末页。
}
```

<a id="vecdb-errors"></a>

## 错误处理

收到 `HaiResult<T>` 时先检查 `success`，再读取 `data` 或 `error`。记录故障时保留错误码和返回的追踪编号。

```ts
import { HaiVecdbError, vecdb } from '@h-ai/vecdb'

// 尝试创建 1536 维的 docs 集合，成功无业务数据。
const result = await vecdb.collection.create('docs', { dimension: 1536 })
if (!result.success) {
  switch (result.error.code) {
    case HaiVecdbError.NOT_INITIALIZED.code:
      // 先完成 vecdb.init()。
      break
    case HaiVecdbError.COLLECTION_ALREADY_EXISTS.code:
      // 读取已有集合的维度和度量，确认是否能复用。
      break
    case HaiVecdbError.QUERY_FAILED.code:
      // 检查集合操作的 error 和后端状态。
      break
  }
}
```
