# @h-ai/reach API reference

<!-- translation: partial -->

[Chinese source](reach.md) · [Configuration](../configuration/reach.en.md) · [Data structures](../data/reach.en.md)

<a id="quick-start"></a>

Initialize Reach and the configured backend. Send with a provider and a trusted recipient. For queued delivery inspect the recorded state before deciding to retry.

<a id="api-reference"></a>

| API | Input and result | Example |
| --- | --- | --- |
| `reach.send` | Send a message or accept it for queued delivery. | `await reach.send(message)` |
| `reach.template.resolve`, `save`, `saveBatch`, `remove`, `list`, `render` | Resolve, persist, enumerate or render templates with variables. | `await reach.template.list()` |
| `reach.queue.get`, `list`, `requeueDead`, `resolveUnknown` | Read delivery status and reconcile or recover queued work. | `await reach.queue.get(queueId)` |

Additional options and workflow examples are available in the [Chinese reference](reach.md).
