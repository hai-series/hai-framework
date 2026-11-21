# @h-ai/vecdb Configuration

[Chinese source](vecdb.md) · [Data structures](../data/vecdb.en.md) · [API reference](../function/vecdb.en.md)

Load `config/_vecdb.yml` and initialize the chosen backend. Choose a metric before creating collections. Existing collections retain their own metric.

## Configuration examples

```yaml schema=@h-ai/vecdb:VecdbConfigSchema
type: lancedb
path: ./data/vectors
```

### Share Qdrant across API instances

Put this in `config/_vecdb.yml`. Instances must connect to the same service to query the same vectors. Supply the API key through the private server environment. Collection names, dimensions and metrics still belong to collection creation.

```yaml schema=@h-ai/vecdb:VecdbConfigSchema
type: qdrant
url: https://vectors.example.com
apiKey: ${HAI_VECDB_APIKEY}
```

### Use PostgreSQL with pgvector

Have the database administrator install pgvector first, then connect to the `knowledge` database. This example selects HNSW. Changing this setting does not rebuild indexes of existing collections.

```yaml schema=@h-ai/vecdb:VecdbConfigSchema
type: pgvector
host: postgres.internal
port: 5432
database: knowledge
user: knowledge_app
password: ${HAI_VECDB_PASSWORD}
indexType: hnsw
```

### Connect to a Chroma server

This uses an existing Chroma server rather than a directory in the application process. After connecting, create a test collection, insert a vector and query it to confirm that the deployed version supports the required API.

```yaml schema=@h-ai/vecdb:VecdbConfigSchema
type: chroma
url: http://chroma.internal:8000
```

## Configuration reference


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
