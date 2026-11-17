# @h-ai/vecdb API reference

[Chinese source](vecdb.md) · [Configuration](../configuration/vecdb.en.md) · [Data structures](../data/vecdb.en.md)

<a id="quick-start"></a>

Initialize a vector backend, create a named collection with its dimension, then insert vectors and query the collection. Use the same backend and collection on each cursor scan.

<a id="api-reference"></a>

| API | Input and result | Example |
| --- | --- | --- |
| `vecdb.init(config)`, `close()`, `isInitialized`, `config`, `rawConnection` | Manage the backend lifecycle and inspect initialized state and connection. | `await vecdb.init(config)` |
| `vecdb.collection.create(name, options)`, `drop`, `exists`, `info`, `list` | Create a collection from name and dimension, remove it, or inspect collections. Default metric is cosine. | `await vecdb.collection.create('docs', { dimension: 3 })` |
| `vecdb.vector.insert`, `upsert`, `delete` | Write documents or remove them by ID. | `await vecdb.vector.delete('docs', ['a'])` |
| `vecdb.vector.search(collection, vector, options?)`, `count`, `scan` | Rank matches, count documents or return cursor results. | `await vecdb.vector.search('docs', [1, 0, 0])` |
