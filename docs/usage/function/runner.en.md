# @h-ai/runner API reference

[Chinese source](runner.md) · [Configuration](../configuration/runner.en.md) · [Data structures](../data/runner.en.md)

<a id="quick-start"></a>

Initialize the runner after the database. The API may submit work, but only a node configured as executor runs handlers. Use the same scope and idempotency key to recover an uncertain submission.

<a id="api-reference"></a>

| API | Input and result | Example |
| --- | --- | --- |
| `runner.init(config)`, `close()`, `isExecutor`, `environment(id)` | Initialize, stop and inspect execution role or configured environment. | `runner.environment('documents')` |
| `runner.register(kind, handler)`, `registerWarmPool(pool)` | Register a trusted handler or prewarmed pool on a worker. | `runner.register(kind, handler)` |
| `runner.submit(request)`, `find(scope, kind, key)`, `get(scope, id)` | Submit jobs or retrieve a job by deduplication key or ID. | `await runner.get(scope, id)` |
| `runner.cancel(scope, id)`, `events(scope, id, after?, limit?)` | Request cancellation or page through events after a sequence. | `await runner.events(scope, id, 0, 50)` |
| `runner.reconcileUnknown(scope, id, review)` | Record a trusted review of an unknown result. Confirm the remote effect before retrying. | `await runner.reconcileUnknown(scope, id, review)` |
