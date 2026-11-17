# @h-ai/crypto API reference

<!-- translation: partial -->

[Chinese source](crypto.md) · [Configuration](../configuration/crypto.en.md) · [Data structures](../data/crypto.en.md)

<a id="quick-start"></a>

## Quick start

Initialize Crypto before using providers. Obtain configuration and keys from trusted startup code. Use the transport managers to integrate encryption with the server or Fetch client.

```ts
import { crypto } from '@h-ai/crypto'

// 初始化（使用前必须调用）
const initialized = await crypto.init()
if (!initialized.success)
  throw new Error(initialized.error.message)
```

<a id="api-reference"></a>

## API list

| API | Input and result | Example |
| --- | --- | --- |
| `crypto.init`, `close`, `isInitialized` | Control initialization, shutdown and readiness. | `crypto.isInitialized` |
| `crypto.asymmetric.generateKeyPair`, `encrypt`, `decrypt`, `sign`, `verify`, `isValidPublicKey`, `isValidPrivateKey` | Generate keys, encrypt or decrypt data, sign and verify, and check key formats. | `crypto.asymmetric.generateKeyPair()` |
| `crypto.symmetric.generateKey`, `generateIV`, `encrypt`, `decrypt`, `encryptWithIV`, `decryptWithIV`, `isValidKey`, `isValidIV` | Generate and validate keys or IVs and process symmetric ciphertext. | `crypto.symmetric.generateKey()` |
| `crypto.hash.hash`, `hmac`, `verify`, `crypto.password.hash`, `verify` | Compute or verify hashes, keyed hashes and password hashes. | `await crypto.password.hash(password)` |
| `crypto.transport.createServer`, `createClient`, `protocol` | Build a server manager and a client session. Use `protocol` for the shared wire contract. | `crypto.transport.createClient(options)` |
| `manager.getServerKeyId`, `getServerPublicKey`, `registerClientKey`, `getClientPublicKey`, `decryptRequest`, `encryptResponse`, `close` | Inspect and register transport keys, process requests and responses, then close. | `manager.getServerPublicKey()` |
| `session.init`, `encryptedFetch`, `ready`, `destroy` | Establish or end the encrypted client session and send requests through it. | `await session.encryptedFetch(url)` |

Additional options and workflow examples are available in the [Chinese reference](crypto.md).
