# @h-ai/serv Configuration

<!-- translation: partial -->

[Chinese source](serv.md) · [Data structures](../data/serv.en.md) · [API reference](../function/serv.en.md)

Load `config/_serv.yml` in the server entry point. Pass the settings to the HTTP boundary and keep deployment credentials in server environment variables.

```yaml schema=@h-ai/serv:ServConfigSchema
server:
  port: 3000
http:
  apiPrefix: /api/v1
  trustedProxies: auto
  access: false
```

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `server.host`, `server.port` | `127.0.0.1`, `3000` | Listening address and port. |
| `http.trustedProxies`, `http.access` | `auto`, `false` | Trusted proxy handling and optional request policy. Supply only infrastructure addresses you trust. |
| `transport` | `false` | Pass an object to enable application-level encryption. Both client and server must agree. |
| `transport.maxPlaintextBytes`, `maxFutureSkewSeconds`, `maxRequestAgeSeconds` | `auto`, `30`, `300` | Plaintext limit in bytes and request timestamp limits in seconds. |
| `transport.routePlaintextBytes`, `excludePaths`, `keyExchangePath` | `undefined`, `[]`, `/_hai/key-exchange` | Per-route budgets, unencrypted paths, and key exchange endpoint. |
| `http.apiPrefix` | `/api/v1` | Mount API routes under this prefix. |
| `http.openapi`, `http.docs` | `false`, `false` | Expose OpenAPI or documentation on demand. Object defaults are `/openapi.json` and `/docs`; `requireAuth` can protect docs. |
| `http.health.path`, `readyPath` | `/health`, `/ready` | Health and readiness endpoints, enabled by default. |
| `cors.origin`, `cors.nativeOrigins` | Optional | Allow only the application origins that need access. |
| `cors.allowedHeaders`, `exposedHeaders`, `credentials` | Built-in headers, `[]`, `false` | Configure CORS input headers, response headers visible to clients, and credentials. |

Additional options and workflow examples are available in the [Chinese reference](serv.md).
