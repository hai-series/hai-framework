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

| API | Purpose | Input | Output | Example |
| --- | --- | --- | --- | --- |
| `crypto.init` | Prepare the algorithms before using them. | None | `Promise<HaiResult<void>>` | `await crypto.init()` |
| `crypto.close` | Clear module state. Close transport managers and sessions when their owners are done with them. | None | `Promise<void>` | `await crypto.close()` |
| `crypto.isInitialized` | Read readiness (property). | None | `boolean` | `crypto.isInitialized` |
| `crypto.asymmetric.generateKeyPair` | Create an SM2 key pair. | None | `HaiResult<KeyPair>` | `crypto.asymmetric.generateKeyPair()` |
| `crypto.asymmetric.encrypt` | Encrypt text with the recipient's public key. | `data, publicKey, options?; cipherMode = 1, outputFormat = 'hex'` | `HaiResult<string>` | `crypto.asymmetric.encrypt('orders', publicKey)` |
| `crypto.asymmetric.decrypt` | Recover plain text with the matching private key and the same cipher mode. | `ciphertext, privateKey, options?; cipherMode = 1` | `HaiResult<string>` | `crypto.asymmetric.decrypt(ciphertext, privateKey)` |
| `crypto.asymmetric.sign` | Sign a message with a private key. | `data, privateKey, options?; hash = true, userId = '1234567812345678'` | `HaiResult<string>` | `crypto.asymmetric.sign('orders', privateKey)` |
| `crypto.asymmetric.verify` | Test the signature with the public key and the same options as signing. | `data, signature, publicKey, options?; hash = true, userId = '1234567812345678'` | `HaiResult<boolean>` | `crypto.asymmetric.verify('orders', signature, publicKey)` |
| `crypto.asymmetric.isValidPublicKey` | Check the SM2 public key format. | `publicKey` | `boolean` | `crypto.asymmetric.isValidPublicKey(publicKey)` |
| `crypto.asymmetric.isValidPrivateKey` | Check the SM2 private key format. | `privateKey` | `boolean` | `crypto.asymmetric.isValidPrivateKey(privateKey)` |
| `crypto.hash.hash` | Compute a 64-digit hexadecimal SM3 digest. | `data: string / Uint8Array, options?; inputEncoding = 'utf8'` | `HaiResult<string>` | `crypto.hash.hash('orders')` |
| `crypto.hash.hmac` | Compute a keyed SM3 digest. | `data, key` | `HaiResult<string>` | `crypto.hash.hmac('orders', secretKey)` |
| `crypto.hash.verify` | Compute the digest again and compare it with the expected value. | `data, expectedHash` | `HaiResult<boolean>` | `crypto.hash.verify('orders', digest)` |
| `crypto.symmetric.generateKey` | Generate a random SM4 key (32 hexadecimal digits). | None | `string` | `crypto.symmetric.generateKey()` |
| `crypto.symmetric.generateIV` | Generate a random initialization vector (32 hexadecimal digits). | None | `string` | `crypto.symmetric.generateIV()` |
| `crypto.symmetric.encrypt` | Encrypt text as a payload. CBC generates a new IV if none is supplied. | `data, key, options?; mode = 'cbc', outputFormat = 'hex'` | `HaiResult<SymmetricEncryptedPayload>` | `crypto.symmetric.encrypt('orders', key)` |
| `crypto.symmetric.decrypt` | Decrypt a payload with the same key. | `payload, key` | `HaiResult<string>` | `crypto.symmetric.decrypt(payload, key)` |
| `crypto.symmetric.encryptWithIV` | Encrypt in CBC and include the newly generated IV in the result. | `data, key` | `HaiResult<EncryptWithIVResult>` | `crypto.symmetric.encryptWithIV('orders', key)` |
| `crypto.symmetric.decryptWithIV` | Decrypt hex-encoded CBC ciphertext with the original key and IV. | `ciphertext, key, iv` | `HaiResult<string>` | `crypto.symmetric.decryptWithIV(ciphertext, key, iv)` |
| `crypto.symmetric.isValidKey` | Check the SM4 key format. | `key` | `boolean` | `crypto.symmetric.isValidKey(key)` |
| `crypto.symmetric.isValidIV` | Check the initialization vector format. | `iv` | `boolean` | `crypto.symmetric.isValidIV(iv)` |
| `crypto.password.hash` | Generate a password hash for a server-side account store. | `password, config?; saltLength = 16 bytes, iterations = 10000` | `HaiResult<string>` | `crypto.password.hash(password)` |
| `crypto.password.verify` | Check a password against the stored hash. | `password, storedHash` | `HaiResult<boolean>` | `crypto.password.verify(password, storedHash)` |
| `crypto.transport.createServer` | Make the transport manager. Supply the server key ring and a shared key store on the server. | `{ serverKeyRing, keyStore, … }` | `HaiResult<TransportEncryptionManager>` | `crypto.transport.createServer({ serverKeyRing, keyStore })` |
| `crypto.transport.createClient` | Make a client session. Its key exchange URL must resolve to the configured server endpoint. | `{ keyExchangeUrl, fetch?, maxPlaintextBytes? }` | `TransportClient` | `crypto.transport.createClient({ keyExchangeUrl: 'https://api.example.com/api/_hai/key-exchange' })` |
| `crypto.transport.protocol` | Read the shared header names and protocol constants (property). | None | `TRANSPORT_PROTOCOL_T` | `crypto.transport.protocol` |

### Transport manager and client session

Check `success` before reading `data` from a `HaiResult`. Ciphertext, signatures and hashes in the examples come from prior successful calls. The `manager` comes from `createServer().data` after checking `success`; `createClient()` returns the `session` directly. The server supplies the actual HTTP request context.

| API | Purpose | Input | Output | Example |
| --- | --- | --- | --- | --- |
| `manager.getServerKeyId` | Read the active server key ID. | None | `string` | `manager.getServerKeyId()` |
| `manager.getServerPublicKey` | Read the current public key for exchange. | None | `string` | `manager.getServerPublicKey()` |
| `manager.registerClientKey` | Register a client's public key; returns its client ID. | `clientPublicKey` | `Promise<string>` | `await manager.registerClientKey(clientPublicKey)` |
| `manager.getClientPublicKey` | Look up the registered key, or return undefined if absent. | `clientId` | `Promise<string \| undefined>` | `await manager.getClientPublicKey(clientId)` |
| `manager.decryptRequest` | Validate the encrypted request against the server's actual request context and decrypt it. | `payload, expectedContext` | `Promise<HaiResult<string>>` | `await manager.decryptRequest(payload, expectedContext)` |
| `manager.encryptResponse` | Encrypt the response and bind it to the originating request. | `requestContext, data, httpStatus` | `Promise<HaiResult<EncryptedPayload>>` | `await manager.encryptResponse(requestContext, '{}', 200)` |
| `manager.close` | Close this transport manager. | None | `Promise<void>` | `await manager.close()` |
| `session.init` | Perform key exchange before sending encrypted requests. | None | `Promise<HaiResult<void>>` | `await session.init()` |
| `session.encryptedFetch` | Send a request with the Fetch signature through the encrypted session. | `input, init?` | `Promise<Response>` | `await session.encryptedFetch(ordersUrl)` |
| `session.ready` | Check whether the session can send a new request. | None | `boolean` | `session.ready()` |
| `session.destroy` | Remove the local session's key material. | None | `void` | `session.destroy()` |

Still untranslated: the detailed transport setup, key rotation and HTTP integration examples. Read the [Chinese source section](crypto.md#detailed-workflow).
