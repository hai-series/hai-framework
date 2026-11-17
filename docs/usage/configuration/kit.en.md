# @h-ai/kit Configuration

[Chinese source](kit.md) · [Data structures](../data/kit.en.md) · [API reference](../function/kit.en.md)

Read `config/_kit.yml` when the SvelteKit server starts. The startup code uses `server` to choose an address and port. In `hooks.server.ts`, the app passes the request policy and trusted proxies to `kit.createHandle()`. If you enable request encryption, the server also passes `transport` to `crypto.transport`. Keep the private keys and connections to shared storage on the server.

```yaml schema=@h-ai/kit:KitConfigSchema
server:
  port: 3000
trustedProxies: auto
access: false
```

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `server` | May be omitted | Groups listening settings. If omitted, use the defaults below. |
| `server.host` | `127.0.0.1` | Nonempty hostname or IP to listen on. A nonempty `HOST` environment variable takes precedence. |
| `server.port` | `3000` | Listening port, 1–65535. A valid `PORT` environment variable takes precedence. |
| `trustedProxies` | `auto` | Proxy IPs or CIDR ranges permitted to supply forwarded client IPs. With `auto`, only proxies on a private Compose network set up by the framework are trusted. Other deployments ignore forwarded IP headers by default. |
| `access` | `false` | Check path, IP or time for each request. Use inline rules or a separate YAML file. See [request access policy](core.en.md#request-access). |
| `transport` | `false` | Pass an object to enable application-level encryption. Configure both the server and client. |
| `transport.maxPlaintextBytes` | `auto` | Plaintext size limit in both directions. The fallback is 1 MiB; explicit values must be integers from 1024 to 67108864 bytes. |
| `transport.maxFutureSkewSeconds` | `30` | Seconds by which the client's request timestamp may be ahead of the server clock (0–300). |
| `transport.maxRequestAgeSeconds` | `300` | Seconds a request remains valid after its timestamp (1–600). |
| `transport.routePlaintextBytes` | May be omitted | Per-path limit in both directions, in bytes (1024–67108864 per entry). Keys start with `/`; `*` matches one path segment. |
| `transport.excludePaths` | `[]` | Paths that bypass application-level encryption. |
| `transport.keyExchangePath` | `/api/_hai/key-exchange` | Full path to the key exchange endpoint; the client's configured URL must reach it. |

After changing these settings, restart the service. From the same URL that users open, verify that cookies work, the server sees the expected IP behind the proxy, and the access policy rejects a request that should be blocked. If encryption is enabled, check that the client can exchange keys and complete a request.
