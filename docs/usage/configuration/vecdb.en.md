# @h-ai/vecdb Configuration

[Chinese source](vecdb.md) · [Data structures](../data/vecdb.en.md) · [API reference](../function/vecdb.en.md)

Load `config/_vecdb.yml` and initialize the chosen backend. Choose a metric before creating collections. Existing collections retain their own metric.

```yaml schema=@h-ai/vecdb:VecdbConfigSchema
type: lancedb
path: ./data/vectors
```

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `type`, `metric` | Required, `cosine` | Choose `lancedb`, `pgvector`, `qdrant` or `chroma` and default similarity metric. |
| `lancedb.path` | Required | Local directory passed as `path` when using LanceDB. |
| `pgvector.host`, `port`, `database` | `localhost`, `5432`, required database | Connection fields. Optional `url`, `user`, and `password` are also supported. |
| `pgvector.indexType`, `tablePrefix` | `hnsw`, `vec_` | Vector index type and table prefix. |
| `qdrant.url`, `apiKey` | `http://localhost:6333`, optional key | Remote service address and credential. |
| `chroma.host`, `port`, `serverCommand`, `startupTimeout` | `localhost`, `8000`, `chroma`, `30000` | Chroma address and local startup settings; `path`, `url` and `apiKey` are optional. |
| `operationLog.read`, `write`, `maxLength`, `level` | `false`, `false`, `1000`, `debug` | Operation log switches, length and level. |

Provider names qualify the rows above. Fields are set directly inside the chosen configuration object.
