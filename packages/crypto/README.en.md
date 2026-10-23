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
- **Use random SM4 keys**: generate keys with `crypto.symmetric.generateKey()`. This module does not provide a KDF for password-based encryption keys. Store passwords with the server-only `crypto.password.hash(password)`; do not use passwords or password hashes directly as SM4 keys.
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

See the [Transport v2 wire protocol](TRANSPORT-PROTOCOL.md) for canonical encoding, verification order and replay persistence.

The `crypto.transport` namespace provides transport encryption, allowing `@h-ai/serv`, `@h-ai/kit`, and `@h-ai/api-client` to share protocol constants and payload formats.

For typical applications, use the higher-level integrations:

- Server: `serv.createApp({ transport: { crypto, serverKeyRing, keyStore } })` or `kit.createHandle({ crypto: { crypto, transport: { serverKeyRing, keyStore } } })`.
- Client: `apiClient.init({ transport: { crypto } })` or `kit.client.create({ transport: { crypto } })`.

Call `crypto.transport.createServer({ serverKeyRing, keyStore })` / `createClient()` directly only for custom runtimes, tests, or manually integrated HTTP key exchange endpoints.

##### Workflow

1. Call `await crypto.init()` to initialize `crypto.asymmetric` and `crypto.symmetric`.
2. On the server, create a `manager` with `crypto.transport.createServer({ serverKeyRing, keyStore })`. It holds the server key pair and stores client public keys. Inject a shared `keyStore` for multi-node deployments.
3. Expose a POST key exchange endpoint: accept `{ clientPublicKey }`, register it with `manager.registerClientKey()`, and return `{ serverKeyId: manager.getServerKeyId(), serverPublicKey: manager.getServerPublicKey(), clientId }`.
4. On the client, create a session with `crypto.transport.createClient({ keyExchangeUrl })`. The first `client.init()` or `client.encryptedFetch()` automatically performs key exchange.
5. Every request sends an authenticated envelope `{ context, direction, status, encryptedKey, ciphertext, iv, tag, signature }`, including empty POST and GET/HEAD.
6. Custom adapters first await `authenticateTransportRequest(manager, request)`. Only successful `data.plaintext` reaches business code; retain `data.context`.
7. Encrypt responses with `await manager.encryptResponse(context, data, response.status)`; clients verify context, status and authenticity before returning plaintext.
8. Clear a client session with `client.destroy()`. Release server resources with `manager.close()` or module-level `await crypto.close()`.

> Servers must explicitly inject the same managed `serverKeyRing` and a shared `keyStore` (Redis or a shared database). Sharing client public keys alone cannot enable cross-node decryption. There is no implicit process key or memory-registry fallback; development/tests may explicitly use `createInMemoryKeyStore(capacity)`. Reload the same ring after restart; sticky sessions are unnecessary.

For shared storage, reuse the provider factories exported from the `@h-ai/crypto` root entry:

- `createInMemoryKeyStore(maxClients)`: explicitly create the default memory store for tests or custom capacity.
- `createRedisTransportKeyStore({ cache, ttlSeconds? })`: reuse `@h-ai/cache`, typically with Redis for sharing across nodes.
- `createReldbTransportKeyStore({ reldb, ttlSeconds?, maxClients? })`: reuse initialized `@h-ai/reldb`, create key, nonce and capacity tables, and return a `ReldbTransportKeyStore` with `pruneExpired()`.

Registration validates the encoding and SM2 curve point before writing. Only 128 hex characters or `04` followed by 128 hex characters are accepted; compressed, infinity and off-curve points are rejected. The pure `isValidSM2PublicKey(value)` helper requires no initialization. serv/kit reject invalid keys with HTTP 400 before accessing the registry.

Omitting Redis/DB `ttlSeconds` keeps keys indefinitely. Explicit values must be integer seconds from 1 to 2147483647; a finite TTL is recommended. Redis uses native per-key expiration and does not expose the DB `maxClients` limit; configure memory budgets without evicting valid nonces. DB `maxClients` is a positive safe integer, defaults to 10000, and must match the persistent setting on every node. Registration locks a shared capacity row inside its transaction before counting and inserting; a full registry rejects registration without evicting valid keys or nonces. Deleting a client does not delete its valid nonces.

DB expiry uses database epoch milliseconds. Synchronize both database and node clocks within the protocol limits. Failed initial table creation can be retried. Each registration prunes one batch; `await registry.pruneExpired()` deletes at most 100 expired keys and 100 expired nonces per call. Schedule it in the application for low-traffic deployments: the registry creates no background timers and does not close the injected reldb. Migrate old timestamp key columns offline to BIGINT `created_at_ms` / `expires_at_ms`. Capacity is persisted in `hai_crypto_transport_capacity`; coordinate changes across all nodes and that row, and never clear valid nonces to recreate a registry.

```ts
const registry = createReldbTransportKeyStore({ reldb, ttlSeconds: 3600, maxClients: 10000 })
// 由应用的定期维护调度器调用；每批有界，故障后由调度器重试。
const removed = await registry.pruneExpired()
```

```ts
// 服务端：通常由 serv.createApp({ transport: { crypto, serverKeyRing, keyStore } }) 或 kit.createHandle({ crypto }) 内部调用
const server = crypto.transport.createServer({ serverKeyRing, keyStore })
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
  serverKeyRing,
  keyStore: createRedisTransportKeyStore({ cache, ttlSeconds: 3600 }),
})
if (!server.success)
  throw new Error(server.error.message)
```

`encryptedFetch()` follows native `fetch` semantics: it rejects on network, key exchange, request encryption, or response decryption failures. Catch these at the call site using the application's fetch error strategy.

Access protocol constants through `crypto.transport.protocol` (or `TRANSPORT_PROTOCOL`): `X-Client-Id`, `X-Encrypted`, and the default `/_hai/key-exchange`.

Both `serverKeyRing` and `keyStore` are required by `createServer({ serverKeyRing, keyStore })`. A ring is `{ activeKeyId, keys: { [id]: { publicKey, privateKey } } }`; IDs contain 1–64 letters, digits, underscores or hyphens. Creation verifies key pairing and captures a snapshot; invalid/missing configuration returns a sanitized HaiResult error. In these examples, `keyStore` is a connected Redis/shared-database registry; memory is an explicit development/test choice.

```ts
import { parseTransportServerKeyRing } from '@h-ai/crypto'

const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
if (!ring.success)
  throw new Error(ring.error.message)
const serverKeyRing = ring.data
const server = crypto.transport.createServer({ serverKeyRing, keyStore })
```

Key exchange returns `{ serverKeyId, serverPublicKey, clientId }`. Encrypted requests carry `serverKeyId`; the server selects that private key and rejects unknown/revoked IDs without trying other keys. Responses use the client's public key. Rotate by distributing both old and new versions to every node, then switching `activeKeyId` and rebuilding managers during rollout. Retain the old version through the transition, then remove it from every node. Old clients must call `destroy()` and negotiate again; do not automatically replay non-idempotent operations. Distribute the same ring through a Secret Manager or server-only private environment. Never put it in ordinary YAML, PUBLIC_/VITE_ variables, logs or public responses. CLI project creation provisions one independent development ring in ignored `.env.local`; runtime does not generate keys. Deploy with target-managed secrets.

Only authenticated protocol v2 is accepted. Independent random SM4-CBC and HMAC-SM3 keys are wrapped with SM2; verify the sender signature and MAC before CBC decryption. Clients sign requests and the selected server key version signs responses. Authentication covers version, direction, serverKeyId, clientId, a random 128-bit requestId acting as the nonce, issuedAt, HTTP method, the SM3 pathHash of pathname plus the original search, and response status. Requests have a five-minute lifetime and at most 30 seconds of future clock skew. The shared registry atomically consumes (clientId, requestId), retaining it until at least issuedAt plus six minutes to cover node skew; storage failures reject requests. Synchronize node clocks and use a Redis noeviction/durable policy that preserves live nonces. Transport replay prevention does not replace business idempotency keys.

Empty POSTs still send an authenticated envelope for empty plaintext. GET/HEAD carry it in X-Hai-Transport; bodyless responses such as 204/304/HEAD use the same header. Other requests/responses carry a JSON envelope and X-Encrypted: true. The client must match the original request context and HTTP status; missing markers, old formats and authentication failures reject. Exclude plaintext endpoints explicitly with excludePaths. CORS must allow and expose X-Hai-Transport. TLS authenticates handshake keys; this protocol does not replace IAM authorization.

serv, kit and the client share `TRANSPORT_BODY_LIMITS`: 16 KiB key exchange JSON, 4 KiB per public key, 1 MiB plaintext, and 2 MiB + 32 KiB encrypted JSON. All limits count actual UTF-8 bytes. Client key exchange has a 30-second timeout. Exceeding a limit, invalid UTF-8 or cancellation stops the original stream and releases its reader without cloning/teeing it. Caller signals remain active; cancelling one request does not cancel another request's shared handshake. Invalid encrypted responses reject instead of returning raw ciphertext.

Custom HTTP adapters can import the pure `readTransportBody(stream, { maxBytes, signal? })` helper from the root entry without `crypto.init()`. Pass the original stream, rebuild Request/Response after reading, and clear stale Content-Length/Content-Encoding. The helper throws RangeError for byte limits, TypeError for invalid UTF-8, and preserves the original read/abort failure.

```ts
import { readTransportBody, TRANSPORT_BODY_LIMITS } from '@h-ai/crypto'

const text = await readTransportBody(request.body, {
  maxBytes: TRANSPORT_BODY_LIMITS.keyExchangeBytes,
  signal: request.signal,
})
const payload: unknown = JSON.parse(text)
```

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

## Production shared state

Production transport registries must declare stateScope=shared and actually use Redis or PostgreSQL/MySQL. Memory, Redis factories over memory, and RelDB factories over SQLite are rejected. All nodes load the same managed versioned key ring. Initialization checks apply when NODE_ENV or HAI_CORE_ENV is production; only explicit HAI_E2E=1/HAI_E2E_MOCK=1 tests are exempt. [State, concurrency and recovery (Chinese)](../../.agents/instructions/distributed-state.md)。

## Development and testing

```bash
pnpm --filter @h-ai/crypto test
```

## License

Apache-2.0
