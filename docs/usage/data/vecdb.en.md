# @h-ai/vecdb Data structures

[Chinese source](vecdb.md) · [Configuration](../configuration/vecdb.en.md) · [API reference](../function/vecdb.en.md)

A document is identified by `id` in its collection and contains a fixed-dimension `vector` and optional `content` and `metadata`. There are no Redis keys.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| pgvector | One `<tablePrefix><collection>` table with `id TEXT` primary key, `vector vector(dimension)`, `content TEXT` defaulting on write to empty, and `metadata JSONB` defaulting to `{}`. HNSW is default, or IVFFlat with 100 lists. The column comment records `hai.vecdb.metric`. |
| Qdrant | One point per document. Payload holds `_id`, `_content` and metadata, collection settings hold dimension and metric. |
| LanceDB | Collection as Arrow table with a fixed-length vector and metric in schema metadata. |
| Chroma | IDs, embeddings, contents and metadata. `hai_dimension` and `hnsw:space` record dimension and metric. |
