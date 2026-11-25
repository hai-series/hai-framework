# @h-ai/vecdb Configuration

[Chinese source](vecdb.md) · [Data structures](../data/vecdb.en.md) · [API reference](../function/vecdb.en.md)

## Configuration entry

Load `config/_vecdb.yml` and initialize the chosen backend. Choose a metric before creating collections. Existing collections retain their own metric.

## Configuration reference


| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `type`, `metric` | Required, `cosine` | Choose `lancedb`, `pgvector`, `qdrant` or `chroma` and default similarity metric. |
| `lancedb.path` | Required | Local directory passed as `path` when using LanceDB. |
| `pgvector.host`, `port`, `database` | `localhost`, `5432`, required database | Connection fields. Optional `url`, `user`, and `password` are also supported. |
| `pgvector.indexType`, `tablePrefix` | `hnsw`, `vec_` | Vector index type and table prefix. |
| `qdrant.url`, `apiKey` | `http://localhost:6333`, optional key | Remote service address and credential. |
| `chroma.host`, `port`, `serverCommand`, `startupTimeout` | `localhost`, `8000`, `chroma`, `30000` | Chroma address and local startup settings; `path`, `url` and `apiKey` are optional. |

Provider names qualify the rows above. Fields are set directly inside the chosen configuration object.

<a id="operation-logging"></a>

### Operation logging

These settings apply to every backend. Enabled operation summaries use `debug` and are filtered by the [Core logging threshold](core.en.md#application-logging).

| Field | Type | Requirement or default | Meaning |
| --- | --- | --- | --- |
| `operationLog` | Object | Optional | Omit it to disable normal-operation summaries. |
| `operationLog.read` | Boolean | `false` | Summarize reads such as collection queries and vector search. |
| `operationLog.write` | Boolean | `false` | Summarize collection changes, vector writes, and deletions. |
| `operationLog.maxLength` | Nonnegative integer | `1000` | Maximum characters in a safe summary. Use `0` to omit the summary. |

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

<a id="pgvector-schema"></a>

#### Select the PostgreSQL schema for collections

pgvector creates collection tables in the current PostgreSQL schema. Reads, writes, and deletion resolve names in `search_path` order. Listing shows tables visible on that path that the current role has permission to access. Use the same `search_path` on instances that share collections. Verify the order with `SHOW search_path` as the application role, then check `vecdb.collection.list()` for the expected collections. See the [PostgreSQL schema search path](https://www.postgresql.org/docs/17/ddl-schemas.html#DDL-SCHEMAS-PATH).

`tablePrefix` is a literal table-name prefix. Underscores and percent signs are ordinary characters. The combined table name is measured in bytes using the database encoding. A name longer than the server setting `max_identifier_length` (usually 63 bytes) returns `CONFIG_ERROR`. See [PostgreSQL identifiers](https://www.postgresql.org/docs/17/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS).

<a id="chroma-server"></a>

### Connect to a Chroma server

This connects to a separately deployed Chroma service. VecDB stores the active metadata keys on `upsert`. The server needs array-valued metadata and both `$contains` and `$not_contains` filters. This behavior was verified with Chroma 1.5.5. After connecting, follow the [metadata replacement example](../function/vecdb.en.md#chroma-metadata-replacement) to write, update, and search for a test document. Confirm that filtering on a removed key with its old value yields no match.

```yaml schema=@h-ai/vecdb:VecdbConfigSchema
type: chroma
url: http://chroma.internal:8000
```
