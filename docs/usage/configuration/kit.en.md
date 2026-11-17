# @h-ai/kit Configuration

[Chinese source](kit.md) · [Data structures](../data/kit.en.md) · [API reference](../function/kit.en.md)

Load `config/_kit.yml` in the server entry point. Pass the settings to the HTTP boundary and keep deployment credentials in server environment variables.

```yaml schema=@h-ai/kit:KitConfigSchema
server:
  port: 3000
trustedProxies: auto
access: false
```

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `server.host`, `server.port` | `127.0.0.1`, `3000` | Listening address and port. |
| `trustedProxies`, `access` | `auto`, `false` | Trusted proxy handling and optional request policy. Supply only infrastructure addresses you trust. |
| `transport` | `false` | Pass an object to enable application-level encryption. Both client and server must agree. |
| `transport.maxPlaintextBytes`, `maxFutureSkewSeconds`, `maxRequestAgeSeconds` | `auto`, `30`, `300` | Plaintext limit in bytes and request timestamp limits in seconds. |
| `transport.routePlaintextBytes`, `excludePaths`, `keyExchangePath` | `undefined`, `[]`, `/api/_hai/key-exchange` | Per-route budgets, unencrypted paths, and key exchange endpoint. |
