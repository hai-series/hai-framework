# @h-ai/vecdb Data Structures

[简体中文](vecdb.md) · [日本語](vecdb.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/vecdb.en.md) · [API reference](../function/vecdb.en.md)

When an application indexes a document, it supplies an ID, embedding, content, and metadata to VecDB. The backend searches the selected collection by vector distance and returns matches.

<a id="document-field-mapping"></a>

## Document field mapping

Applications write documents to VecDB using the same `VectorDocument` fields on every backend. The table maps the fields in the [example document](#example-data) to each backend's storage fields.

| Application field | [pgvector](#pgvector) | [Qdrant](#qdrant) | [LanceDB](#lancedb) | [Chroma](#chroma) |
| --- | --- | --- | --- | --- |
| `id` | `id` | `payload._id` | `id` | `ids[i]` |
| `vector` | `vector` | `vector` | `vector` | `embeddings[i]` |
| `content` | `content` | `payload._content` | `content` | `documents[i]` |
| `metadata` | `metadata` | Application fields in `payload` | `metadata` | Application fields in `metadatas[i]` |

pgvector, LanceDB, and Chroma store the original string `id` directly. Qdrant point IDs accept unsigned 64-bit integers and UUIDs. VecDB derives a deterministic point UUID from the original `id`, so writing, updating, and deleting with that document ID address the same point. The reserved `payload._id` field preserves the original ID for VecDB search and scan results. See [Qdrant point IDs](https://qdrant.tech/documentation/manage-data/points/#point-ids).

In a Chroma write batch, entries at the same index `i` belong to one document. VecDB also writes the text to `metadatas[i]._content` for its search results. Callers filter on application attributes, for example `filter: { source: 'policy.txt' }`. Qdrant matches `source` in `payload`, and the other backends match it in their metadata fields.

## Vector collections

Set the name and dimension when you create a collection. New collections use cosine similarity by default. Existing collections keep their creation metric. Each backend stores a collection as shown below.

| Backend | Structure | Count and purpose |
| --- | --- | --- |
| [pgvector](#pgvector) | `<schema>.<tablePrefix><collection>` | One table per collection. The default prefix is `vec_`. |
| [qdrant](#qdrant) | `point` | One point per document in the collection. |
| [lancedb](#lancedb) | `Arrow` | One Arrow table named after each collection. |
| [chroma](#chroma) | `collection` | Each collection stores documents, vectors and attributes. |

### pgvector

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Collection primary key. | `doc-42` |
| `vector` | `vector(dimension)` | Yes | — | Similarity vector. Length must match the table dimension. | `[0.1,0.2,0.3]` |
| `content` | `TEXT` | Yes | — | Document text. The vector writer supplies an empty string if omitted. | `Example shipping policy` |
| `metadata` | `JSONB` | Yes | `{}` | Application attributes, empty object if omitted. | `{"source":"policy.txt"}` |

Only `id` is non-nullable. The SQL default for `metadata` is `{}`. HNSW is the default vector index. IVFFlat is available with `lists` defaulting to 100. The `vector` column comment records `hai.vecdb.metric=<metric>`.

pgvector creates the table, builds the index, and records the metric in one transaction. They take effect together when the transaction commits. An index creation failure rolls back the table creation. New tables live in the current PostgreSQL schema. Existing names resolve in `search_path` order. See [connection configuration and verification](../configuration/vecdb.en.md#pgvector-schema).

### qdrant

| Column | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | — | Stable ID computed from the document ID. | `<point-uuid>` |
| `vector` | `number[]` | — | Document vector with the same dimensions as the collection. | `[0.1,0.2,0.3]` |
| `payload._id` | `string` | — | Original document ID from the caller. | `doc-42` |
| `payload._content` | `string` | `""` | Original document text returned by search. | `Example shipping policy` |
| `payload.*` | `JSON` | `{}` | Application attributes are added to payload. Reserved fields take precedence. | `{"source":"policy.txt"}` |

Collection settings store dimension and metric. `insert` with an existing ID replaces that point. A VecDB document has a string `payload._id` and a point UUID that matches the framework mapping for that ID. Points written through native Qdrant that cannot be mapped back to a VecDB document ID remain stored. They contribute to `vector.count()` and are excluded from VecDB search and ID scans. See the [mixed collection example](../function/vecdb.en.md#qdrant-document-visibility).

### lancedb

| Column | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `id` | `string` | — | Non-null field declared as a Lance unenforced primary key in new tables. | `doc-42` |
| `vector` | `fixed-size list` | — | Fixed-length document vector. | `[0.1,0.2,0.3]` |
| `content` | `string` | `""` | Document text. | `Example shipping policy` |
| `metadata` | `JSON` | `{}` | Application attributes. New tables use a non-null Arrow JSON field. | `{"source":"policy.txt"}` |

The vector column fixes the dimension. Arrow schema metadata records `hai.vecdb.metric`. The framework uses LanceDB merge writes in `insert` and `upsert` to handle conflicts by ID. Appending directly with native `add` can create duplicate IDs.

<a id="lancedb-upgrade"></a>

#### Upgrade an existing LanceDB collection

When an older collection lacks a persisted dimension or metric, reading collection information, searching, and writing return `CONFIG_ERROR`. The framework rejects writes to a table without the new key declaration. A legacy Utf8 metadata column also prevents writes and metadata filtering. For the migration, use records from your document source or from a tool that can read the original format.

1. Pause writes to the old collection and back up the whole LanceDB directory before exporting the records. Record the collection's embedding model, dimension, and metric.
2. Create a new collection such as `docs_v2` with `vecdb.collection.create()`. Use the original dimension and metric if you are reusing the vectors.
3. Use `vecdb.vector.upsert()` in small batches to backfill stable IDs, vectors, text, and metadata objects. Resolve duplicate IDs in the exported records first. Check `success` after each batch and retain the backup while addressing any failure.
4. Verify the definition and document count with `vecdb.collection.info()` and `vecdb.vector.count()`. Test search and metadata filtering with a known document. After verification, switch the application reads and writes to the new collection and resume writing. Keep the backup and old collection for your application's rollback period.

### chroma

| Column | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `ids` | `string[]` | — | Document IDs in the write batch. | `["doc-42"]` |
| `embeddings` | `number[][]` | — | Vectors in the same order as the IDs, each matching the dimension. | `[[0.1,0.2,0.3]]` |
| `documents` | `string[]` | `[""]` | Document text matching each ID. The default for an individual item is the empty string. | `["Example shipping policy"]` |
| `metadatas` | `object[]` | — | Application attributes, reserved `_content`, and the active-key list. Values must pass Chroma SDK validation. | `[{"source":"policy.txt","_content":"Example shipping policy"}]` |

Collections created through VecDB retain the framework's dimension and metric definitions. Collections created through native Chroma use the server index metric. Chroma records the dimension when the first vectors arrive and retains it after all records are deleted.

VecDB stores the active application metadata keys in the reserved `_hai_vecdb_metadata_keys` field in the same `upsert` request. Search results and filters use this list. Older records without the list remain readable in their original format, and the next VecDB `upsert` sets the list. Direct Chroma reads may still show key values removed from the VecDB view. See the [metadata replacement example](../function/vecdb.en.md#chroma-metadata-replacement).

VecDB creates no Redis keys. Search reads from the vector store. Pass the previous cursor when requesting another page from the same backend and collection.

<a id="example-data"></a>

### A document searchable by meaning

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
