# @h-ai/vecdb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

A vector database module with a unified `vecdb` object for LanceDB, pgvector, Qdrant, and Chroma.

## Quick Start

Every provider returns `score` in 0–1, with larger values indicating greater similarity; `minScore` filters converted scores. Cosine uses `(1 + cosine) / 2`, dot uses `sigmoid(dotProduct)`, and Euclidean uses `1 / (1 + distance)`. LanceDB/Chroma use native squared L2 while other backends use native L2. Calibrate thresholds for each metric/backend; scores are not probabilities. Qdrant no longer treats the public minScore as a native distance threshold.

```ts
import { vecdb } from '@h-ai/vecdb'

// Open the local LanceDB database.
const initialized = await vecdb.init({ type: 'lancedb', path: './data/vecdb' })
if (!initialized.success)
  throw new Error(initialized.error.message)

try {
  // Create a cosine-similarity collection with three values per vector.
  const created = await vecdb.collection.create('docs', { dimension: 3, metric: 'cosine' })
  if (!created.success)
    throw new Error(created.error.message)

  // Insert a document vector with content and metadata for the search result.
  const inserted = await vecdb.vector.insert('docs', [
    {
      id: 'doc-1',
      vector: [1, 0, 0],
      content: 'Installation guide',
      metadata: { source: 'wiki' }
    },
  ])
  if (!inserted.success)
    throw new Error(inserted.error.message)

  // Search with a vector close to the inserted one and return up to five matches.
  const matches = await vecdb.vector.search('docs', [0.9, 0.1, 0], { topK: 5, minScore: 0.7 })
  if (!matches.success)
    throw new Error(matches.error.message)
  // Each match contains id, score, content and metadata.
  const firstMatch = matches.data[0]
  process.stdout.write(`${JSON.stringify(firstMatch)}\n`)
}
finally {
  // Release the connection even if creation, insertion or search fails.
  const closed = await vecdb.close()
  if (!closed.success)
    process.stderr.write(`Vecdb close failed: ${closed.error.code}\n`)
}
```

## Configuration Reference

Generated projects define the vector database type and its connection settings in `config/_vecdb.yml`. At startup, the application reads the file and passes the settings object to `vecdb.init(config)`.

See the [configuration reference](../../docs/usage/configuration/vecdb.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/vecdb.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `vecdb.init` / `vecdb.close` / `vecdb.config` / `vecdb.isInitialized` / `vecdb.rawConnection` — Connect to a vector database, inspect configuration and readiness, or access the underlying connection in the current process
- `vecdb.collection` — Create, list and delete collections
- `vecdb.vector` — Write, search, scan and delete vectors

## Data Structures

See the [data reference](../../docs/usage/data/vecdb.md) in Chinese for collections, vectors, metadata, filters and provider storage layouts.

## Development and Testing

```bash
pnpm --filter @h-ai/vecdb test
```

> pgvector / Qdrant tests require Docker.

Source JSDoc follows the [shared conventions](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证): public examples use published entry points, and internal examples are checked in their module scope. After building, run `pnpm check:jsdoc --package vecdb`; compiling examples does not replace backend behavior tests.

## License

Apache-2.0
