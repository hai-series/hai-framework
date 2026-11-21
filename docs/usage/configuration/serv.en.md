# @h-ai/serv Configuration

<!-- translation: partial -->

[Chinese source](serv.md) · [Data structures](../data/serv.en.md) · [API reference](../function/serv.en.md)

Load `config/_serv.yml` in the server entry point. Pass the settings to the HTTP boundary and keep deployment credentials in server environment variables.

## Configuration examples

```yaml schema=@h-ai/serv:ServConfigSchema
server:
  port: 3000
http:
  apiPrefix: /api/v1
  trustedProxies: auto
  access: false
```

### Allow a separate console origin

Put this in `config/_serv.yml`. Allow the console origin to read cross-origin responses and send credentials. CORS does not replace authentication or authorization. Cookie clients also need suitable cookie attributes. Replace the origin with your console URL.

```yaml schema=@h-ai/serv:ServConfigSchema
server:
  host: 0.0.0.0
  port: 3000
cors:
  origin: https://console.example.com
  credentials: true
```

### Enable API docs and custom health paths

Serve OpenAPI at `/openapi.json`, the docs UI at `/docs`, and health checks at `/healthz` and `/readyz`. The docs UI requires an authenticated identity supplied by the application. Health endpoints support deployment probes; they do not prove every external business system is working.

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  apiPrefix: /api/v1
  openapi:
    path: /openapi.json
  docs:
    path: /docs
    requireAuth: true
  health:
    path: /healthz
    readyPath: /readyz
```

## Configuration reference


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

Still untranslated: individual CORS fields, Swagger/health switches and transport limits. Read the [Chinese source section](serv.md#configuration-fields).
