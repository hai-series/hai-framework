# @h-ai/api-contract API reference

[Chinese source](api-contract.md) · [Configuration](../configuration/api-contract.en.md) · [Data structures](../data/api-contract.en.md)

<a id="quick-start"></a>

Import `apiContract` from `@h-ai/api-contract`. Assemble an application contract, then share it with the server procedures and the typed client.

<a id="api-reference"></a>

| API | Input and result | Example |
| --- | --- | --- |
| `apiContract.create(domains)` | Build a router from active domains. A false domain is omitted. | `apiContract.create({ iam: apiContract.iam, payment: false })` |
| `apiContract.route(options)` | Declare an HTTP method and path. Returns a builder for input and output schemas. | `apiContract.route({ method: 'GET', path: '/status' })` |
| `apiContract.pathOf(procedure)` | Returns the path from a contract procedure. | `apiContract.pathOf(apiContract.iam.auth.login)` |
| `apiContract.haiResultSchema(schema)`, `voidResultSchema` | Validate a success or error response, including success with no payload. | `apiContract.haiResultSchema(z.string())` |
| `apiContract.paginatedSchema(itemSchema)` | Returns a page schema with entries and total count. | `apiContract.paginatedSchema(z.string())` |
| `apiContract.iam`, `storage`, `ai`, `feedback`, `payment` | Built-in domain contracts. Mount them only when the application implements the associated procedures. | `apiContract.create({ storage: apiContract.storage })` |
