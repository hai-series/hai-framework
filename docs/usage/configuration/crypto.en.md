# @h-ai/crypto Configuration

<!-- translation: partial -->

[Chinese source](crypto.md) · [Data structures](../data/crypto.en.md) · [API reference](../function/crypto.en.md)

Configure primitives in code. The application supplies algorithm-specific options and owns private keys. HTTP transport uses server and client managers backed by a registry.

```yaml schema=@h-ai/serv:ServConfigSchema
transport:
  maxPlaintextBytes: 25165824
```

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `createInMemoryKeyStore(maxClients?)` | `10000` | Development or single-process tests. The oldest public key is evicted at capacity. |
| `createRedisTransportKeyStore({ cache })` | Required | Borrow an initialized Redis backend for shared transport state. |
| `createReldbTransportKeyStore({ reldb })` | Required | Borrow an initialized RelDB instance. |
| `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` | Optional | Server loads a JSON key ring and validates it with `parseTransportServerKeyRing()`. |

Still untranslated: provider limits, transport-body budgets and key-store options. Read the [Chinese source section](crypto.md#configuration-fields).
