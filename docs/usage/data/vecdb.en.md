# @h-ai/vecdb Data structures

[Chinese source](vecdb.md) · [Configuration](../configuration/vecdb.en.md) · [API reference](../function/vecdb.en.md)

<a id="example-data"></a>

## What these records are for

Start with the purpose and examples, then consult field and storage details below. IDs and business content are fictional; sensitive values are redacted. Times use 2026-11-17 00:00 UTC as the example start, with units explained for each record.

### A document searchable by meaning

Structure: `VectorDocument`.

Store text with a vector representing its meaning so similarity search can return relevant text.

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

doc-42 has three vector values, so its collection needs dimension 3. metadata identifies policy.txt as the source.

## Field, storage and cleanup reference

A document is identified by `id` in its collection and contains a fixed-dimension `vector` and optional `content` and `metadata`. There are no Redis keys.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| pgvector | One `<tablePrefix><collection>` table with `id TEXT` primary key, `vector vector(dimension)`, `content TEXT` defaulting on write to empty, and `metadata JSONB` defaulting to `{}`. HNSW is default, or IVFFlat with 100 lists. The column comment records `hai.vecdb.metric`. |
| Qdrant | One point per document. Payload holds `_id`, `_content` and metadata, collection settings hold dimension and metric. |
| LanceDB | Collection as Arrow table with a fixed-length vector and metric in schema metadata. |
| Chroma | IDs, embeddings, contents and metadata. `hai_dimension` and `hnsw:space` record dimension and metric. |
