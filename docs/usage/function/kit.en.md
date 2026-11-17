# @h-ai/kit API reference

<!-- translation: partial -->

[Chinese source](kit.md) · [Configuration](../configuration/kit.en.md) · [Data structures](../data/kit.en.md)

<a id="quick-start"></a>

Use Kit in SvelteKit hooks, route handlers and the browser client. Server code protects routes and validates input as well as translating domain results into HTTP responses.

<a id="api-reference"></a>

| API | Input and result | Example |
| --- | --- | --- |
| `kit.createHandle`, `kit.sequence`, `kit.handler` | Create a hook, compose hooks in order, or wrap a route handler. | `kit.sequence(first, second)` |
| `kit.guard.check`, `require`, `requireSensitive` | Check authorization and enforce normal or sensitive access. | `kit.guard.require(event, permission)` |
| `kit.response.ok`, `created`, `noContent`, `error`, `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `validationError`, `internalError`, `redirect`, `fromResult`, `fromError` | Build an HTTP response or map a business result/error to its status and body. | `kit.response.fromResult(result)` |
| `kit.validate.body`, `query`, `params`, `IdParamSchema`, `PaginationQuerySchema` | Validate request data against schemas and return typed input. | `await kit.validate.body(request, schema)` |
| `kit.client.create`, `createAuthActions`, `installBrowserTransport`, `installBrowserTransportFetch` | Create a typed browser client and install authentication or encrypted Fetch behavior. | `kit.client.create(contract)` |
| `kit.auth.publicPaths` | Obtain public authentication paths for authentication guards. | `kit.auth.publicPaths` |

Additional options and workflow examples are available in the [Chinese reference](kit.md).
