# @h-ai/serv API reference

<!-- translation: partial -->

[Chinese source](serv.md) · [Configuration](../configuration/serv.en.md) · [Data structures](../data/serv.en.md)

<a id="quick-start"></a>

Use Serv to mount a typed HTTP contract in a standalone Node server. Configure authentication, transport encryption and trusted request parsing before listening.

<a id="api-reference"></a>

| API | Input and result | Example |
| --- | --- | --- |
| `serv.implement(contract)`, `createApp(options)` | Bind procedures to the contract and build the HTTP application. | `serv.implement(contract)` |
| `serv.listen(app, options?)`, `toFetch(app)` | Start the Node listener or adapt the application to a Fetch handler. | `serv.toFetch(app)` |
| `serv.parseRequestContext(input)`, `buildAuthContextFactory(verifyToken)` | Read trusted request metadata and create an authentication context with the given verifier. | `serv.buildAuthContextFactory(verifyToken)` |
| `serv.cors(config?)`, `createRuntimeSecurityPolicy(input)`, `storageAssets(config)` | Build origin handling, request rules and asset delivery behavior. | `serv.cors()` |
| `serv.generateSpec(contract, options?)` | Produce the OpenAPI specification from the contract. | `serv.generateSpec(contract)` |
| `serv.validateInputOrFail(schema, input, locale?)`, `resolveRequestLocale(headers)`, `m(key, options?)` | Resolve request language, validate input and format a localized message. | `serv.resolveRequestLocale(request.headers)` |

Additional options and workflow examples are available in the [Chinese reference](serv.md).
