# vecdb 数据结构

[English](vecdb.en.md) · [日本語](vecdb.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/vecdb.md) · [功能说明](../function/vecdb.md)

## 数据库与集合

调用 `vecdb.collection.create()` 时指定集合名与向量维度，也可指定比较向量的方法。新集合默认使用余弦相似度（`cosine`）。修改默认设置后，已有集合仍采用创建时的方法。每个文档包含 `id`（集合内标识）、`vector`（指定维度的数值数组）、可选 `content`（正文）与可选 `metadata`（业务属性）。

| 后端     | 物理结构与默认值                                                                                                                                                                                                                                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pgvector | 每集合一张 `<tablePrefix><collection>` 表，前缀默认 `vec_`。`id TEXT` 为主键，`vector vector(dimension)` 保存向量，`content TEXT` 为正文，`metadata JSONB` 的 SQL 默认值为 `{}`。写入未提供正文或属性时分别使用空字符串和空对象。按度量建立向量索引，默认 HNSW，可选 IVFFlat（lists 默认 100）。`vector` 列注释保存 `hai.vecdb.metric=<metric>` |
| Qdrant   | 每个文档写成一条 Qdrant point。点的附加数据（payload）保存文档 ID `_id`、正文 `_content` 和应用传入的其他属性。向量维度与比较方法保存在集合设置中                                                                                                                                                                                               |
| LanceDB  | 以集合名保存 Arrow 表。向量列为固定长度，schema metadata 中的 `hai.vecdb.metric` 保存相似度类型。表 schema 保存 ID、向量、正文和属性                                                                                                                                                                                                            |
| Chroma   | collection 保存 ID、embeddings、文档和元数据，`hai_dimension` 与 `hnsw:space` 分别保存维度和距离度量                                                                                                                                                                                                                                            |

## 缓存

模块不创建 Redis 键。查询直接从已连接的向量数据库读取。应用要把一页结果返回的游标保存下来，在同一个数据库、同一个集合的下一次查询中传回。
