# @h-ai/vecdb 数据结构

<a id="vecdb-数据结构"></a>

[English](vecdb.en.md) · [日本語](vecdb.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/vecdb.md) · [功能说明](../function/vecdb.md)

应用写入检索文档时，把文档 ID、向量、正文及属性一起交给 VecDB。搜索时后端按向量距离查询指定集合，返回匹配项。

<a id="document-field-mapping"></a>

## 文档字段映射

应用通过 VecDB 写入文档时使用统一的 `VectorDocument` 字段。下表将[示例文档](#example-data)中的字段对应到各后端的存储字段。

| 应用字段 | [pgvector](#pgvector) | [Qdrant](#qdrant) | [LanceDB](#lancedb) | [Chroma](#chroma) |
| --- | --- | --- | --- | --- |
| `id` | `id` | `payload._id` | `id` | `ids[i]` |
| `vector` | `vector` | `vector` | `vector` | `embeddings[i]` |
| `content` | `content` | `payload._content` | `content` | `documents[i]` |
| `metadata` | `metadata` | `payload` 中的业务属性 | `metadata` | `metadatas[i]` 中的业务属性 |

pgvector、LanceDB 和 Chroma 直接保存原始字符串 `id`。Qdrant 的点 ID 只接受无符号 64 位整数或 UUID。VecDB 根据原始 `id` 确定性地生成点的 UUID，同一个文档 ID 在写入、更新和删除时对应同一个点。保留字段 `payload._id` 保存原始业务 ID，供搜索和扫描返回给应用。参见 [Qdrant 点 ID](https://qdrant.tech/documentation/manage-data/points/#point-ids)。

Chroma 写入批次中同一索引 `i` 的数组元素属于同一份文档。正文也写入 `metadatas[i]._content`，供 VecDB 检索返回。调用方按业务属性筛选，例如 `filter: { source: 'policy.txt' }`。Qdrant 在 `payload` 中匹配 `source`，其他后端从对应的元数据字段匹配。

<a id="vector-collections"></a>

## 向量集合

创建集合时指定名称和维度，新集合默认用余弦相似度（`cosine`）。已有集合沿用创建时的度量。下表按后端列出每个集合的存储结构。

| 后端 | 结构 | 数量与用途 |
| --- | --- | --- |
| [pgvector](#pgvector) | `<schema>.<tablePrefix><collection>` | 每个集合一张表，前缀默认 `vec_`。 |
| [qdrant](#qdrant) | `point` | 每份文档保存为集合中的一个 point。 |
| [lancedb](#lancedb) | `Arrow` | 每个集合对应一张同名 Arrow 表。 |
| [chroma](#chroma) | `collection` | 每个集合保存文档、向量和业务属性。 |

### pgvector

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 集合内主键。 | `doc-42` |
| `vector` | `vector(dimension)` | 是 | — | 用来计算相似度的向量，长度须与建表维度相同。 | `[0.1,0.2,0.3]` |
| `content` | `TEXT` | 是 | — | 文档正文。调用向量写入接口省略正文时写空字符串。 | `Example shipping policy` |
| `metadata` | `JSONB` | 是 | `{}` | 应用自定的属性，省略时为空对象。 | `{"source":"policy.txt"}` |

只有 `id` 不可空，`metadata` 的 SQL 默认值是 `{}`。默认向量索引为 HNSW，可选 IVFFlat（`lists` 默认 100）。`vector` 列注释保存 `hai.vecdb.metric=<metric>`。`collection.info()` 和 `vector.search()` 从该注释读取度量。缺少有效注释时返回 `CONFIG_ERROR`。

pgvector 在同一事务内建表、建索引并保存度量。三项在提交时一同生效，建索引失败会回滚本次建表。新表位于当前 PostgreSQL schema。已有表按 `search_path` 的顺序解析。参见[连接配置和验证方法](../configuration/vecdb.md#pgvector-schema)。

### qdrant

| 字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | — | 由文档 ID 计算出的稳定编号。 | `<point-uuid>` |
| `vector` | `number[]` | — | 文档向量，长度与集合维度相同。 | `[0.1,0.2,0.3]` |
| `payload._id` | `string` | — | 调用方提供的原始文档 ID。 | `doc-42` |
| `payload._content` | `string` | `""` | 可以检索的原始正文。 | `Example shipping policy` |
| `payload.*` | `JSON` | `{}` | 应用属性写在 payload 里，不能覆盖上面的保留字段。 | `{"source":"policy.txt"}` |

集合设置保存维度和度量。已有 ID 的 `insert` 会覆盖对应 point。框架文档要求字符串 `payload._id` 与对应的 point UUID 映射一致。通过 Qdrant 原生接口写入、无法映射回框架文档 ID 的点会保留在集合中。它们计入 `vector.count()`，不出现在 VecDB 搜索或 ID 扫描结果中。参见[混合集合示例](../function/vecdb.md#qdrant-document-visibility)。

### lancedb

| 字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `id` | `string` | — | 非空字段，声明为 Lance 的非强制主键。 | `doc-42` |
| `vector` | `fixed-size list` | — | 固定长度的文档向量。 | `[0.1,0.2,0.3]` |
| `content` | `string` | `""` | 文档正文。 | `Example shipping policy` |
| `metadata` | `JSON` | `{}` | 应用属性，使用非空 Arrow JSON 字段。 | `{"source":"policy.txt"}` |

维度由向量列长度决定，`hai.vecdb.metric` 保存在 Arrow schema 元数据中。框架的 `insert` 和 `upsert` 使用 LanceDB 的 merge 写入按 ID 处理冲突。通过原生 `add` 直接追加可能产生重复 ID。

<a id="lancedb-upgrade"></a>

<a id="升级已有-lancedb-集合"></a>

<a id="lancedb-import-documents"></a>

#### 将现有文档导入 LanceDB 集合

集合需要固定长度的向量列和已保存的距离度量。缺少任一项时，查看集合信息、搜索和写入均返回 `CONFIG_ERROR`。通过 VecDB 写入还要求将非空 `id` 声明为主键并使用 Arrow JSON 元数据列。向量搜索也要求 Arrow JSON 元数据列。即使省略 `filter`，缺少该列也会返回 `CONFIG_ERROR`。

如果来源集合的结构不满足这些要求，可以把现有文档导入由 VecDB 创建的集合。

1. 暂停向来源集合写入，备份完整的 LanceDB 目录。通过文档原始数据或能读取来源格式的工具导出记录，并记录嵌入模型、向量维度和距离度量。
2. 用 `vecdb.collection.create()` 创建目标集合，例如 `policy_search`。继续使用原向量时，指定与来源一致的维度和距离度量。
3. 先处理导出数据中的重复 ID，再以小批次调用 `vecdb.vector.upsert()`，写入稳定 ID、向量、正文和元数据对象。每批检查 `success`，失败时处理原因后再继续。
4. 用 `vecdb.collection.info()` 和 `vecdb.vector.count()` 核对目标集合的定义和文档数，并用一条已知文档验证搜索及元数据过滤。核对通过后切换应用的读写目标并恢复写入。按应用的回退周期保留备份和来源集合。

### chroma

| 字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `ids` | `string[]` | — | 写入批次中的文档 ID。 | `["doc-42"]` |
| `embeddings` | `number[][]` | — | 与 ID 顺序一致的向量，每条符合指定维度。 | `[[0.1,0.2,0.3]]` |
| `documents` | `string[]` | `[""]` | 与 ID 对应的文档正文。默认每项为空字符串。 | `["Example shipping policy"]` |
| `metadatas` | `object[]` | — | 业务属性及框架保留的 `_content` 和有效键清单。取值须能通过 Chroma SDK 校验。 | `[{"source":"policy.txt","_content":"Example shipping policy","_hai_vecdb_metadata_keys":["v1","k:source","k:_content"]}]` |

VecDB 创建的集合保留框架的维度和度量定义。`collection.info()` 和 `vector.search()` 读取 Chroma 原生索引定义中的度量。仅在集合元数据中给出度量时返回 `CONFIG_ERROR`。原生集合的维度在收到第一批向量后由 Chroma 记录，删空文档不会清除这一维度。

VecDB 在 `insert` 和 `upsert` 时把有效业务键清单写入保留字段 `_hai_vecdb_metadata_keys`，与向量和正文在同一次请求提交。搜索结果和筛选使用该清单。记录缺少有效清单时，无筛选搜索仍可返回 ID、分数及可用的正文，结果不含其业务元数据。任何非空业务元数据筛选都不会命中这类记录。Chroma 原生接口可能仍能读到已从 VecDB 视图移除的键值。参见[元数据替换示例](../function/vecdb.md#chroma-metadata-replacement)。

VecDB 不创建 Redis 键。查询直接读取对应向量库。分页时，应用需在同一个数据库和集合的下一次查询中传回上次的游标。

<a id="example-data"></a>

### 可按含义搜索的文档

正文与代表其含义的向量一起保存，搜索时用相近向量找到相关内容，再把正文交给应用。

```json
{
  "id": "doc-42",
  "vector": [
    0.1,
    0.2,
    0.3
  ],
  "content": "Example shipping policy",
  "metadata": {
    "source": "policy.txt"
  }
}
```

doc-42 的向量有3个数，所以集合维度必须是3；metadata 说明正文来自 policy.txt。
