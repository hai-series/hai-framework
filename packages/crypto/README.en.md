# @h-ai/crypto

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/cache](../cache/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/reldb](../reldb/README.en.md)

## Introduction

A cryptography module for asymmetric encryption, hashing, symmetric encryption, and password hashing.

## Core features

- Asymmetric cryptography (key generation, encryption/decryption, signing/verification)
- Hashing (hash, HMAC, verification)
- Symmetric encryption (ECB/CBC modes)
- Password hashing (salted iterative hashes)
- Transport encryption (`crypto.transport`: server manager + client `encryptedFetch`)
- Shared server/browser support (Node.js / browser)

## Getting started

### Security notice

- **SM4 encryption returns a structured payload by default**: `crypto.symmetric.encrypt(data, key)` uses CBC + a random IV by default and returns `{ mode, ciphertext, iv, encoding }`. Pass that object to `crypto.symmetric.decrypt(payload, key)` to decrypt.
- **SM4 `deriveKey(password, salt)` is not a KDF**: it performs a single SM3 hash and offers no resistance to password cracking. **Never use it for password storage**. Use `crypto.password.hash(password)` for password hashing and PBKDF2 / scrypt / Argon2 for password-based key derivation.
- **IVs must be unique**: never reuse an IV with the same key. Prefer default CBC or `encryptWithIV()` to generate one for each call. Transmit and store the IV with the ciphertext; the IV can be public.

### Quick start

```ts
import { crypto } from '@h-ai/crypto'

// 初始化（使用前必须调用）
const initialized = await crypto.init()
if (!initialized.success)
  throw new Error(initialized.error.message)
```

#### Asymmetric cryptography (encryption / signing)

```ts
// 生成密钥对
const keyPair = crypto.asymmetric.generateKeyPair()
if (!keyPair.success)
  throw new Error(keyPair.error.message)
const { publicKey, privateKey } = keyPair.data

// 加密 / 解密
const encrypted = crypto.asymmetric.encrypt('Hello', publicKey)
if (encrypted.success) {
  const decrypted = crypto.asymmetric.decrypt(encrypted.data, privateKey)
  // decrypted.data === 'Hello'
}

// 输出 base64 格式密文
const b64 = crypto.asymmetric.encrypt('Hello', publicKey, { outputFormat: 'base64' })

// 签名 / 验签
const sig = crypto.asymmetric.sign('important data', privateKey)
if (sig.success) {
  const valid = crypto.asymmetric.verify('important data', sig.data, publicKey)
  // valid.data === true
}

// 校验密钥格式
crypto.asymmetric.isValidPublicKey(publicKey) // true
crypto.asymmetric.isValidPrivateKey(privateKey) // true
```

#### Hashing (Hash / HMAC / verification)

```ts
// 字符串哈希
const hash = crypto.hash.hash('Hello!')
// hash.data → 64 字符十六进制哈希值

// Uint8Array 输入
const buf = new TextEncoder().encode('Hello!')
const hashBuf = crypto.hash.hash(buf)

// 十六进制编码输入
const hashHex = crypto.hash.hash('48656c6c6f21', { inputEncoding: 'hex' })

// HMAC
const hmac = crypto.hash.hmac('message', 'secret-key')

// 验证哈希是否匹配
if (hash.success) {
  const matched = crypto.hash.verify('Hello!', hash.data)
  // matched.data === true
}
```

#### Symmetric encryption (default CBC / structured payload)

```ts
// 生成随机密钥和 IV
const key = crypto.symmetric.generateKey()
const iv = crypto.symmetric.generateIV()

// 默认：CBC + 自动随机 IV，返回结构化密文
const safeEnc = crypto.symmetric.encrypt('data', key)
if (safeEnc.success) {
  // safeEnc.data: { mode: 'cbc', ciphertext, iv, encoding: 'hex' }
  const safeDec = crypto.symmetric.decrypt(safeEnc.data, key)
  // safeDec.data === 'data'
}

// CBC 指定 IV（仍然返回结构化密文）
const cbcEnc = crypto.symmetric.encrypt('data', key, { mode: 'cbc', iv })
if (cbcEnc.success) {
  const cbcDec = crypto.symmetric.decrypt(cbcEnc.data, key)
}

// 结构化结果：自动生成 IV 的 CBC 加解密
const withIV = crypto.symmetric.encryptWithIV('data', key)
if (withIV.success) {
  const dec = crypto.symmetric.decryptWithIV(withIV.data.ciphertext, key, withIV.data.iv)
}

// ECB 模式（❌ 不安全；只有底层协议明确要求时才显式指定）
const ecbEnc = crypto.symmetric.encrypt('data', key, { mode: 'ecb' })
if (ecbEnc.success) {
  const ecbDec = crypto.symmetric.decrypt(ecbEnc.data, key)
}

// 输出 base64 格式（ciphertext 字段为 base64，encoding 字段会标明）
const b64Enc = crypto.symmetric.encrypt('data', key, { outputFormat: 'base64' })

// ⚠️ 已弃用：从密码派生密钥（仅为单次 SM3 哈希，不是 KDF，禁止用于密码存储场景）
// 密码散列请用 crypto.password.hash()；如需从密码派生密钥，请在应用层自行实现 PBKDF2 / scrypt / Argon2
const derivedKey = crypto.symmetric.deriveKey('my-password', 'random-salt')

// 校验密钥/IV 格式
crypto.symmetric.isValidKey(key) // true
crypto.symmetric.isValidIV(iv) // true
```

#### Password hashing (salted iterations)

```ts
// 哈希密码（输出格式: $hai$<iterations>$<salt>$<hash>）
const hashed = crypto.password.hash('myPassword123')

// 自定义盐值长度和迭代次数
const custom = crypto.password.hash('myPassword123', {
  saltLength: 32,
  iterations: 20000,
})

// 验证密码
if (hashed.success) {
  const ok = crypto.password.verify('myPassword123', hashed.data)
  // ok.data === true

  const wrong = crypto.password.verify('wrongPassword', hashed.data)
  // wrong.data === false
}
```

#### Transport encryption (crypto.transport)

The `crypto.transport` namespace provides transport encryption, allowing `@h-ai/serv`, `@h-ai/kit`, and `@h-ai/api-client` to share protocol constants and payload formats.

For typical applications, use the higher-level integrations:

- Server: `serv.createApp({ transport: { crypto } })` or `kit.createHandle({ crypto: { crypto, transport: true } })`.
- Client: `apiClient.init({ transport: { crypto } })` or `kit.client.create({ transport: { crypto } })`.

Call `crypto.transport.createServer()` / `createClient()` directly only for custom runtimes, tests, or manually integrated HTTP key exchange endpoints.

##### Workflow

1. Call `await crypto.init()` to initialize `crypto.asymmetric` and `crypto.symmetric`.
2. On the server, create a `manager` with `crypto.transport.createServer()`. It holds the server key pair and stores client public keys. Inject a shared `keyStore` for multi-node deployments.
3. Expose a POST key exchange endpoint: accept `{ clientPublicKey }`, register it with `manager.registerClientKey()`, and return `{ serverPublicKey: manager.getServerPublicKey(), clientId }`.
4. On the client, create a session with `crypto.transport.createClient({ keyExchangeUrl })`. The first `client.init()` or `client.encryptedFetch()` automatically performs key exchange.
5. After key exchange, requests include `X-Client-Id`. A request body is wrapped as `{ encryptedKey, ciphertext, iv }` with `X-Encrypted: true`. Bodyless requests include only `X-Client-Id` and do not create an encrypted body.
6. The server looks up the client public key by `clientId`, decrypts the body with `manager.decryptRequest()`, then runs the business logic.
7. Before returning JSON, encrypt it with `manager.encryptResponse(clientId, data)` and set `X-Encrypted: true`. The client decrypts the response automatically.
8. Clear a client session with `client.destroy()`. Release server resources with `manager.close()` or module-level `await crypto.close()`.

> The default `keyStore` is an in-process FIFO store; exceeding `maxClients` evicts the earliest registered client. Multi-node deployments need sticky sessions or a shared `TransportKeyStore` implementation for client public keys.

For shared storage, reuse the provider factories exported from the `@h-ai/crypto` root entry:

- `createInMemoryKeyStore(maxClients)`: explicitly create the default memory store for tests or custom capacity.
- `createRedisTransportKeyStore({ cache, ttlSeconds? })`: reuse `@h-ai/cache`, typically with Redis for sharing across nodes.
- `createReldbTransportKeyStore({ reldb, ttlSeconds? })`: reuse `@h-ai/reldb`, automatically creating `hai_crypto_transport_client_keys`.

```ts
// 服务端：通常由 serv.createApp({ transport: { crypto } }) 或 kit.createHandle({ crypto }) 内部调用
const server = crypto.transport.createServer({ maxClients: 10000 })
if (!server.success)
  throw new Error(server.error.message)

// 客户端：通常由 apiClient.init({ transport: { crypto } }) 或 kit.client.create({ transport }) 内部调用
const client = crypto.transport.createClient({
  keyExchangeUrl: 'https://api.example.com/api/v1/_hai/key-exchange',
})

const response = await client.encryptedFetch('https://api.example.com/api/v1/echo', {
  method: 'POST',
  body: JSON.stringify({ hello: 'world' }),
})
```

```ts
import { cache } from '@h-ai/cache'
import { createRedisTransportKeyStore, crypto } from '@h-ai/crypto'

await crypto.init()
await cache.init({ type: 'redis', host: '127.0.0.1', port: 6379 })

const server = crypto.transport.createServer({
  keyStore: createRedisTransportKeyStore({ cache, ttlSeconds: 3600 }),
})
if (!server.success)
  throw new Error(server.error.message)
```

`encryptedFetch()` follows native `fetch` semantics: it rejects on network, key exchange, request encryption, or response decryption failures. Catch these at the call site using the application's fetch error strategy.

Access protocol constants through `crypto.transport.protocol` (or `TRANSPORT_PROTOCOL`): `X-Client-Id`, `X-Encrypted`, and the default `/_hai/key-exchange`.

#### Close the module

```ts
// 使用完毕后关闭，释放内部状态
await crypto.close()
```

### Error handling

All operations return `HaiResult<T>`:

```ts
const result = crypto.asymmetric.encrypt('data', publicKey)
if (!result.success) {
  // result.error.code / result.error.message
}
```

### Optional integrations

The admin console's online encryption demo calls the Crypto SM3/SM4 APIs directly. SM4 uses a random temporary key and IV and verifies decryption before showing success; keys are not saved. Changing input clears previous results. Random digests or Base64 must not be presented as cryptographic results.

## Development and testing

```bash
pnpm --filter @h-ai/crypto test
```

## License

Apache-2.0
