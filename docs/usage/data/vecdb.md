# vecdb 数据结构

[数据结构索引](README.md) · [模块配置](../configuration/vecdb.md) · [功能说明](../function/vecdb.md)

## 数据库与集合

调用方定义集合名和向量维度。集合保存自己的距离度量，默认新集合使用 cosine。更改连接默认值不会重写旧集合。每个逻辑文档包含 `id`（集合内标识）、`vector`（指定维度的数值数组）、可选 `content`（正文）与可选 `metadata`（业务属性）。

| 后端     | 物理结构与默认值                                                                                                                                                                                                                                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pgvector | 每集合一张 `<tablePrefix><collection>` 表，前缀默认 `vec_`。`id TEXT` 为主键，`vector vector(dimension)` 保存向量，`content TEXT` 为正文，`metadata JSONB` 的 SQL 默认值为 `{}`。写入未提供正文或属性时分别使用空字符串和空对象。按度量建立向量索引，默认 HNSW，可选 IVFFlat（lists 默认 100）。`vector` 列注释保存 `hai.vecdb.metric=<metric>` |
| Qdrant   | 每集合保存 Qdrant point。公开文档 ID 与正文映射到 payload 的 `_id`、`_content`，其余 payload 字段保存业务属性。向量维度与距离度量随集合保存                                                                                                                                                                                                     |
| LanceDB  | 以集合名保存 Arrow 表。向量列为固定长度，schema metadata 中的 `hai.vecdb.metric` 保存相似度类型。表 schema 保存 ID、向量、正文和属性                                                                                                                                                                                                            |
| Chroma   | collection 保存 ID、embeddings、文档和元数据，`hai_dimension` 与 `hnsw:space` 分别保存维度和距离度量                                                                                                                                                                                                                                            |

## 缓存

模块不创建 Redis 键。集合和向量以连接的后端为准。分页游标绑定原后端及集合，由调用方持有。
