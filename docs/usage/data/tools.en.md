# @h-ai/tools data structures

Lightweight tool definitions and registries have no database tables, cache keys, or persistent leases of their own. Names, Schemas, handlers, and authorization callbacks remain in the current process and are not retained after `clear()` or process exit.

| Data | Owner and lifecycle |
| --- | --- |
| Tool implementation collection | The host registers tools from configuration, and each node assembles its own collection; this is not shared task state |
| Business records and document versions | The actual business service manages ownership, version conflicts, and retention |
| Execution tasks, leases, status, and events | [Runner](runner.md) stores and cleans them up |
| Input file and output artifact bytes | [Storage](storage.md) stores them; the host validates authorized file/artifact IDs |
| MCP service catalog and Broker | Currently managed by [AI](ai.md) |

Return authorized references for large files. Do not put images, videos, or secrets into tool definitions, LLM messages, or task events. Logs should retain only sanitized operational diagnostics.
