# @h-ai/vecdb Data structures

[Chinese source](vecdb.md) · [Configuration](../configuration/vecdb.en.md) · [API reference](../function/vecdb.en.md)

<a id="example-data"></a>

## What these records are for

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

### Database and collections

Set the name and dimension when you create a collection. New collections use cosine similarity by default. Existing collections keep their creation metric. Each backend stores a collection as shown below.

| Backend | Structure | Count and purpose |
| --- | --- | --- |
| [pgvector](#pgvector) | `<tablePrefix><collection>` | One table per collection. The default prefix is `vec_`. |
| [qdrant](#qdrant) | `point` | One point per document in the collection. |
| [lancedb](#lancedb) | `Arrow` | One Arrow table named after each collection. |
| [chroma](#chroma) | `collection` | Each collection stores documents, vectors and attributes. |

#### pgvector

| Column | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | — | Collection primary key. | `doc-42` |
| `vector` | `vector(dimension)` | — | Similarity vector. Length must match the table dimension. | `[0.1,0.2,0.3]` |
| `content` | `TEXT` | — | Document text. The vector writer supplies an empty string if omitted. | `Example shipping policy` |
| `metadata` | `JSONB` | `{}` | Application attributes, empty object if omitted. | `{"source":"policy.txt"}` |

Only `id` is non-nullable. The SQL default for `metadata` is `{}`. HNSW is the default vector index. IVFFlat is available with `lists` defaulting to 100. The `vector` column comment records `hai.vecdb.metric=<metric>`.

#### qdrant

| Column | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | — | Stable ID computed from the document ID. | `<point-uuid>` |
| `vector` | `number[]` | — | Document vector with the same dimensions as the collection. | `[0.1,0.2,0.3]` |
| `payload._id` | `string` | — | Original document ID from the caller. | `doc-42` |
| `payload._content` | `string` | `""` | Original document text returned by search. | `Example shipping policy` |
| `payload.*` | `JSON` | `{}` | Application attributes are added to payload. Reserved fields take precedence. | `{"source":"policy.txt"}` |

Collection settings store dimension and metric. `insert` with an existing ID replaces that point.

#### lancedb

| Column | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `id` | `string` | — | Non-null primary key in new tables. | `doc-42` |
| `vector` | `fixed-size list` | — | Fixed-length document vector. | `[0.1,0.2,0.3]` |
| `content` | `string` | `""` | Document text. | `Example shipping policy` |
| `metadata` | `JSON` | `{}` | Application attributes. New tables use a non-null Arrow JSON field. | `{"source":"policy.txt"}` |

The vector column fixes the dimension. Arrow schema metadata records `hai.vecdb.metric`.

#### chroma

| Column | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `ids` | `string[]` | — | Document IDs in the write batch. | `["doc-42"]` |
| `embeddings` | `number[][]` | — | Vectors in the same order as the IDs, each matching the dimension. | `[[0.1,0.2,0.3]]` |
| `documents` | `string[]` | `[""]` | Document text matching each ID. The default for an individual item is the empty string. | `["Example shipping policy"]` |
| `metadatas` | `object[]` | — | Application attributes plus reserved `_content`. Values must pass Chroma SDK validation. | `[{"source":"policy.txt","_content":"Example shipping policy"}]` |

Collection metadata `hai_dimension` and `hnsw:space` store dimension and distance metric.

### Cache

VecDB creates no Redis keys. Search reads from the vector store. Pass the previous cursor when requesting another page from the same backend and collection.
