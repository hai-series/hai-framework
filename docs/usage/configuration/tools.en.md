# @h-ai/tools configuration

`tools.define` and `tools.createRegistry` are pure definitions and factories. They have no module-level YAML, environment variables, or `init/close`.

| Location | Field | Default and effect |
| --- | --- | --- |
| Tool definition | `name/description/parameters/handler` | Required; names contain 1–64 ASCII characters, start with a letter, and otherwise contain letters, digits, underscores, or hyphens; input is validated with Zod |
| Tool definition | `timeoutMs` | Integer from 0 to 2147483647 milliseconds; defaults to 30 seconds and can be overridden per call; 0 times out immediately |
| Registry | `authorize` | Optional; when configured, every registry call must pass it |
| Execution options | `signal` | Cancellation signal, propagated to the handler |
| Execution options | `objectId/sessionId` | Trusted identity and session context; must not come from unauthenticated model input |
| Execution options | `deadline/timeoutMs` | Absolute deadline takes precedence, followed by per-call timeout, tool timeout, then 30 seconds |
| Execution options | `authorize` | Additional per-call authorization; applies together with registry authorization |
| Batch execution options | `parallel` | Defaults to false; enable only for calls confirmed to be safe to run in parallel |

The host controls which tools are enabled. Unregistered tools cannot be called, and unregistering a tool also removes it from the definition list. Filter model-visible tools for the current identity, and continue checking authorization during server execution.

An invalid name or default timeout in `tools.define` is a configuration error and throws `TypeError`. Registries accept only tools created by this method, not handwritten objects that bypass the common execution boundary. Direct business tools can use richer Schemas. For model use, the Schema must be convertible to JSON Schema, typically with object parameters.

Standalone jobs use Runner environments, MCP service configuration, and fixed images. Their configuration belongs to the corresponding module and host. See [Runner](runner.md), [AI MCP](ai.md#mcp和a2a), and [job instructions](../../../packages/tools/jobs/README.md). Installing Tools does not start these services.
