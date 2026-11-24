# vecdb 数据结构

[English](vecdb.en.md) · [日本語](vecdb.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/vecdb.md) · [功能说明](../function/vecdb.md)

应用写入检索文档时，把文档 ID、向量、正文及属性一起交给 VecDB。搜索时后端按向量距离查询指定集合，返回匹配项。

<a id="vector-collections"></a>

## 向量集合

创建集合时指定名称和维度，新集合默认用余弦相似度（`cosine`）。已有集合沿用创建时的度量。下表按后端列出每个集合的存储结构。

| 后端 | 结构 | 数量与用途 |
| --- | --- | --- |
| [pgvector](#pgvector) | `<tablePrefix><collection>` | 每个集合一张表，前缀默认 `vec_`。 |
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

只有 `id` 不可空，`metadata` 的 SQL 默认值是 `{}`。默认向量索引为 HNSW，可选 IVFFlat（`lists` 默认 100）。`vector` 列注释保存 `hai.vecdb.metric=<metric>`。

### qdrant

| 字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | — | 由文档 ID 计算出的稳定编号。 | `<point-uuid>` |
| `vector` | `number[]` | — | 文档向量，长度与集合维度相同。 | `[0.1,0.2,0.3]` |
| `payload._id` | `string` | — | 调用方提供的原始文档 ID。 | `doc-42` |
| `payload._content` | `string` | `""` | 可以检索的原始正文。 | `Example shipping policy` |
| `payload.*` | `JSON` | `{}` | 应用属性写在 payload 里，不能覆盖上面的保留字段。 | `{"source":"policy.txt"}` |

集合设置保存维度和度量。已有 ID 的 `insert` 会覆盖对应 point。

### lancedb

| 字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `id` | `string` | — | 新表的非空主键。 | `doc-42` |
| `vector` | `fixed-size list` | — | 固定长度的文档向量。 | `[0.1,0.2,0.3]` |
| `content` | `string` | `""` | 文档正文。 | `Example shipping policy` |
| `metadata` | `JSON` | `{}` | 应用属性。新表使用非空 Arrow JSON 字段。 | `{"source":"policy.txt"}` |

维度由向量列长度决定，`hai.vecdb.metric` 保存在 Arrow schema 元数据中。

### chroma

| 字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `ids` | `string[]` | — | 写入批次中的文档 ID。 | `["doc-42"]` |
| `embeddings` | `number[][]` | — | 与 ID 顺序一致的向量，每条符合指定维度。 | `[[0.1,0.2,0.3]]` |
| `documents` | `string[]` | `[""]` | 与 ID 对应的文档正文。默认每项为空字符串。 | `["Example shipping policy"]` |
| `metadatas` | `object[]` | — | 业务属性加上保留的 `_content`。取值须能通过 Chroma SDK 校验。 | `[{"source":"policy.txt","_content":"Example shipping policy"}]` |

集合元数据的 `hai_dimension` 和 `hnsw:space` 分别记录维度和距离度量。

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
