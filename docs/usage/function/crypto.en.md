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
| `crypto.password.hash` | Generate a password hash for a server-side account store. | `password, config?; saltLength = 16 characters, iterations = 10000` | `HaiResult<string>` | `crypto.password.hash(password)` |
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

### HTTP helpers and store instances

These root exports serve HTTP adapters, configuration parsing and independent registry instances. They are infrastructure contracts; algorithm operations and the main transport factories remain under `crypto`. The creating application owns returned instances.

| API | Input and defaults | Output and failure | Example |
| --- | --- | --- | --- |
| `isValidSM2PublicKey` | Unknown value | `boolean`; no initialization | `isValidSM2PublicKey(value)` |
| `parseTransportServerKeyRing` | Secret JSON or object | `HaiResult<TransportServerKeyRing>`; errors omit secrets | `parseTransportServerKeyRing(secret)` |
| `createCacheTransportKeyStore` | `{ cache, ttlSeconds?, maxRegistrationsPerMinute?, maxRequestsPerMinute? }` | `TransportKeyStore`; invalid options throw TypeError, quota exhaustion rejects with `hai:crypto:072` | `createCacheTransportKeyStore({ cache })` |
| `registry.register` | Valid SM2 public key | `Promise<string>`; key/storage failure rejects | `await registry.register(publicKey)` |
| `registry.get` | Client ID | `Promise<string / undefined>`; storage failure rejects | `await registry.get(clientId)` |
| `registry.claimRequest` | Client ID, request ID, retention deadline in Unix milliseconds | Atomic `Promise<boolean>`; storage failure rejects | `await registry.claimRequest(clientId, requestId, expiresAt)` |
| `registry.delete?` | Client ID | `Promise<void>`; deletes only the key; storage failure rejects | `await registry.delete?.(clientId)` |
| `registry.close?` | None | `Promise<void>`; optional cleanup for custom stores; the built-in Cache store does not close its borrowed connection | `await registry.close?.()` |
| `resolveTransportBodyLimits` | Optional plaintext bytes and `{ requiredPlaintextBytes? }` | Immutable `TransportBodyLimits`; invalid/conflicting values throw RangeError | `resolveTransportBodyLimits(8388608)` |
| `createTransportBodyPolicy` | Optional global bytes and route mapping, default empty | Policy; invalid configuration throws RangeError | `createTransportBodyPolicy(undefined, { '/files/*': 8388608 })` |
| `policy.acquire` | Actual pathname | `{ limits, release } / null` when busy | `policy.acquire('/files/report')` |
| `lease.release` | None | `void`; releases once, repeated calls are safe | `lease.release()` |
| `readTransportBody` | Original stream or null, `{ maxBytes, signal?, direction?, stage? }` | `Promise<string>`; size, UTF-8, cancellation/read errors throw | `await readTransportBody(request.body, { maxBytes: 16384 })` |
| `authenticateTransportRequest` | Manager, actual Request, optional route limits | `Promise<HaiResult<{ plaintext, context }>>`; read/size errors throw | `await authenticateTransportRequest(manager, request)` |
| `createTransportErrorResponse` | Time/size error, optional authenticated `{ manager, context }` | `Promise<Response>`; encrypts when trusted context is supplied | `await createTransportErrorResponse(error)` |
| `TransportBodyTooLargeError` | Limit, optional observed bytes and direction/stage | RangeError subclass, `hai:crypto:070` | `new TransportBodyTooLargeError(1024, 1025)` |
| `TransportTimeError` | Optional trusted context, server Unix milliseconds | Error subclass; invalid time throws RangeError | `new TransportTimeError(undefined, Date.now())` |

`TRANSPORT_PROTOCOL`, `TRANSPORT_TIME_LIMITS`, `TRANSPORT_BODY_LIMITS` and `TRANSPORT_PLAINTEXT_RANGE` expose constants; they do not load configuration or connect to storage.

<a id="primitive-validation"></a>

### Primitive validation and compatibility

SM2 encrypts nonempty text only. Incomplete or modified ciphertext, a wrong private key, or empty plaintext fails. Private keys must be 64 hexadecimal digits with scalar 1 through n-2; n-1 cannot sign safely. Signatures must be exactly 128 hex digits; noncanonical encoding verifies as `ok(false)`. Transport empty messages still work through SM4.

SM3 hex input must contain complete valid bytes; odd lengths and invalid characters return `INVALID_INPUT`. HMAC measures UTF-8 key bytes and hashes keys longer than 64 bytes first, following [RFC 2104](https://www.rfc-editor.org/rfc/rfc2104). Previously incorrect results for long non-ASCII keys change and external stored verification values must be regenerated. Transport's 64-byte ASCII MAC keys are unaffected.

SM4 allows empty plaintext but requires nonempty ciphertext in complete 16-byte blocks, valid encoding, strict PKCS#7 padding and valid UTF-8. Unknown modes/encodings fail. Base64 conversion processes chunks to support large input. CBC itself remains unauthenticated; use transport for HTTP.

Password records strictly follow `$hai$iterations$salt$hash`: canonical decimal iterations 1–1000000, an 8–128 character alphanumeric salt and a 64-digit lowercase hex digest. Malformed records return `INVALID_INPUT`; normally generated historical records remain valid.

<a id="transport-protocol"></a>

### Transport v2 encoding and verification

Serv, Kit, api-client and browser/mobile clients share this application protocol. TLS authenticates exchange public keys; IAM authorization and business idempotency remain required. Exchange POST JSON `{ clientPublicKey }` registers the client and returns `clientId`, `serverKeyId`, `serverPublicKey`, `maxPlaintextBytes` and optional `clientKeyTtlSeconds`. Keys accept only valid uncompressed SM2 points: 128 hex digits, optionally prefixed with `04`.

A fixed registry TTL starts at registration. The client counts from sending exchange and renews one tenth of the TTL early, capped at 30 seconds. Concurrent callers share exchange; already sent requests verify responses using their sending session. Omitted TTL means no automatic renewal deadline. Custom stores can declare `clientKeyTtlSeconds`.

All nodes use the same private managed ring. Deploy old and new versions first, switch `activeKeyId` and recreate managers, then remove the old version after transition. Removal revokes that ID. Old clients destroy and exchange again; never automatically replay a potentially completed write. Secrets belong in protected server configuration, never public YAML, `PUBLIC_*`, `VITE_*`, logs or responses.

An envelope has exactly `{ context, direction, status, encryptedKey, ciphertext, iv, tag, signature }`. Context has exactly these fields:

```ts
interface Context {
  version: 2
  serverKeyId: string
  clientId: string
  requestId: string
  issuedAt: number
  method: string
  pathHash: string
}
```

Server IDs are 1–64 and client IDs 1–128 letters, digits, underscores or hyphens. `requestId` is a fresh 128-bit random value encoded as 32 lowercase hex digits; `issuedAt` is positive safe-integer Unix milliseconds. `method` is the actual uppercase HTTP method. `pathHash` is lowercase SM3 of `URL.pathname + URL.search`, without decoding or reordering queries, limited to 8192 UTF-8 input bytes. Proxies preserve the original path and query.

Each message generates independent 16-byte SM4, 32-byte MAC and 16-byte IV values. SM2 C1C3C2/hex encrypts the UTF-8 JSON `[sm4KeyHex, macKeyHex]` into `encryptedKey`. SM4-CBC uses PKCS#7, hex ciphertext and hex IV. HMAC uses the 64 UTF-8/ASCII bytes of `macKeyHex`, not its hex-decoded bytes.

The authentication text is `JSON.stringify()` of this fixed-position array, without whitespace (line breaks below are illustrative):

```text
["hai-transport", context.version, direction, context.serverKeyId,
 context.clientId, context.requestId, context.issuedAt, context.method,
 context.pathHash, status, encryptedKey, ciphertext, iv]
```

`tag = HMAC_SM3(authenticatedText, macKeyHex)` is 64 lowercase hex digits. Sign `JSON.stringify([authenticatedText, tag])` with SM2 defaults `hash=true`, `userId=1234567812345678`; the signature is 128 hex digits. Requests use the client's private key, direction `request` and status 0. Responses use the private key for the request's `serverKeyId`, direction `response`, actual HTTP status and an exact copy of request context.

1. Read within bounds and reject extra envelope/context fields. Derive expected client ID, method and path from the actual HTTP Request and compare the recomputed path hash.
2. Look up the registered sender key; verify SM2 signature, unwrap keys, compare HMAC in constant time, then decrypt CBC. Failed authentication never reaches CBC. This follows the authenticate-before-decrypt principle in [RFC 7366](https://www.rfc-editor.org/rfc/rfc7366); this envelope is not a TLS record.
3. Reject `issuedAt > now + futureSkew` or `now >= issuedAt + maxAge`: future boundary is inclusive, expiry is exclusive. Only authenticated requests atomically claim `(clientId, requestId)`, then recheck expiry. Duplicates, storage failure and expiry during claim reject; business failure never refunds a nonce.
4. A time-window failure after trusted binding/signature/MAC yields encrypted 400 / `hai:crypto:071` with validation-time `serverTime`. HEAD carries the envelope in a header. The client compares every response-context field and actual HTTP status before signature/MAC/decryption; only then does it trust time or capacity diagnostics. Missing markers, malformed or unrelated responses reject without plaintext fallback.

Every message sets `X-Encrypted: true`; requests also set `X-Client-Id`. Body-bearing methods use JSON envelopes even for empty plaintext. GET/HEAD use an empty-plaintext envelope in `X-Hai-Transport` and no body. Normal responses use JSON; HEAD, 204/205/304 or actually bodyless responses use that header. Never carry one envelope in both header and body. CORS allows and exposes the header. Plaintext routes require matching server/client exclusions; Kit has no `requireEncryption` / `encryptResponse` downgrade switches.

Custom adapters call `await authenticateTransportRequest(manager, request)` and use `data.plaintext` only on success; bind replies through `await manager.encryptResponse(data.context, json, status)`. For authenticated time failures, pass the error's trusted context to `createTransportErrorResponse()`. See [retention and recovery](../data/crypto.en.md#transport-state) and [capacity and deployment](crypto.en.md#transport-capacity).

Still untranslated: extended worked examples. Read the [Chinese source section](crypto.md#detailed-workflow).

<a id="call-options"></a>

## Call options

These are code arguments, not `_crypto.yml` fields. Initialize Crypto first; the application initializes and closes the borrowed cache connection.

### Algorithm options

| Option | Default | Accepted values and effect |
| --- | --- | --- |
| SM2 `cipherMode` | `1` (C1C3C2) | `0` selects C1C2C3; use the same mode to decrypt. |
| SM2 `outputFormat` | `hex` | `hex` or `base64`; ciphertext encoding. |
| SM2 `hash` | `true` | Whether signing hashes the input; verification must match. |
| SM2 `userId` | `1234567812345678` | Signing identity; verification must match. |
| SM3 `inputEncoding` | `utf8` | `utf8` or `hex` for strings; Uint8Array is already bytes. Hex must contain complete valid bytes. |
| SM4 `mode` | `cbc` | `cbc` or explicit `ecb` for existing formats. |
| SM4 `iv` | Random for CBC | 32 hexadecimal digits; use a fresh IV per encryption. |
| SM4 `outputFormat` | `hex` | `hex` or `base64`. |
| Password `saltLength` | `16` | Alphanumeric salt characters, integer 8–128. |
| Password `iterations` | `10000` | Integer 1–1000000. |

### Transport server and client options

| Option | Default | Meaning |
| --- | --- | --- |
| Server `serverKeyRing` | Required | Managed `{ activeKeyId, keys }`, injected by trusted server startup. |
| Server `keyStore` | Required | Registry from `createCacheTransportKeyStore({ cache })`; production uses Redis. |
| Server `maxPlaintextBytes` | 1048576 | Request/response UTF-8 plaintext bytes, integer 1024–67108864; the host may forward Serv/Kit file settings. |
| Server `maxFutureSkewSeconds` | 30 | Allowed future skew, integer 0–300 seconds. |
| Server `maxRequestAgeSeconds` | 300 | Request age from issuance, integer 1–600 seconds. |
| Client `keyExchangeUrl` | Required | Trusted server key-exchange URL. |
| Client `maxPlaintextBytes` | Follow server | An explicit local limit selects the smaller local/exchanged value. |
| Client `fetch` | Global fetch | Standard Fetch implementation preserving body and cancellation semantics. |

### Cache registry options

| Option | Default | Meaning |
| --- | --- | --- |
| `cache` | Required | Initialized `@h-ai/cache`: memory for development/tests, Redis for shared production state. |
| `ttlSeconds` | 3600 | Fixed public-key lifetime, integer 1–86400 seconds; reads never renew it and permanent keys are disallowed. |
| `maxRegistrationsPerMinute` | 10000 | Positive safe integer of registrations per shared 60-second window. |
| `maxRequestsPerMinute` | 100000 | Positive safe integer of new requests per shared 60-second window. |

These application-wide safeguards bound cache growth and do not replace per-IP/user/route rate limits. Defaults are 10000 registrations and 100000 new IDs per 60-second window starting at first reservation. Full windows return 503 and recover on expiry; live keys/markers remain. See [examples](../data/crypto.en.md#transport-state). Raising limits also requires a Redis memory review.


Each quota window starts with its first write and expires through cache TTL. CAS consumes capacity atomically while preserving the original TTL; application clock differences do not reset the window. All nodes use identical limits. Exhaustion or sustained contention returns `hai:crypto:072`, mapped by Serv/Kit to 503 without automatic replay. Failed writes and concurrent duplicates may conservatively consume quota; ordinary replays of existing nonces consume none. Keys, nonces and the two fixed quota counters all expire. No full-key scan or eviction of live nonces is used. State is bounded approximately by minute quota times retained minutes: default public keys span at most 61 windows; nonces at most 17. Configure Redis memory, noeviction and reliable persistence as well.

<a id="transport-capacity"></a>

## HTTP capacity and file sizing

`maxPlaintextBytes` limits the complete JSON plaintext in UTF-8 bytes, equally for requests and responses. The default is 1 MiB; the integer range is 1 KiB–64 MiB. Strings, null, zero, negative/fractional values and unlimited settings are invalid. Only Serv/Kit host configuration accepts `auto`, normalized to omission before calling Crypto.

Set `transport.maxPlaintextBytes` in `config/_serv.yml` using `HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES`, or in `config/_kit.yml` using `HAI_KIT_TRANSPORT_MAXPLAINTEXTBYTES`. The host forwards it to the manager; generated API/fullstack templates already do so. Direct integrations pass `maxPlaintextBytes` to `crypto.transport.createServer()` and recreate the manager after changes.

Key exchange returns `manager.bodyLimits.plaintextBytes`; clients follow it unless a smaller local limit is configured. Custom exchange endpoints must return `maxPlaintextBytes` while retaining the separate 16 KiB handshake limit. Lowering the server budget takes effect immediately; existing clients must exchange keys again to learn it.

Measure `new TextEncoder().encode(JSON.stringify(payload)).byteLength`, not character count. File Base64 uses `4 * ceil(fileBytes / 3)` characters, plus JSON fields, names, escaping and other business data. A 4 MiB XLSX file uses `5592408` Base64 bytes; an 8 MiB plaintext budget can fit typical wrapping. Keep the application's JSON/Base64 format rather than treating binary as UTF-8.

`resolveTransportBodyLimits(limit).encryptedPayloadBytes` derives `2 * limit + 32768` for hex-encoded SM4-CBC and the bounded authentication envelope. An 8 MiB plaintext budget requires `16809984` proxy request bytes. Memory also holds JSON, Base64, ciphertext and authentication intermediates. Applications still enforce raw-file, archive expansion, worksheet/row, permission and business concurrency limits.

Ordinary routes use the global budget. Feedback report, evidence, attachment and ZIP routes declare `feedback.budget.maxTransportBytes` through host `routePlaintextBytes`; explicit host values take precedence. `*` matches one complete path segment; overlapping patterns use the smaller budget. Exchange and deployment adapters reserve the maximum route budget. Explicit routes above 1 MiB have 2 concurrency slots, separate from 16 ordinary slots, released after response completion or failure. Busy admission returns 503 / `hai:crypto:072` without automatically replaying writes.

Handshake JSON 16 KiB, public keys 4 KiB, envelope headers 16 KiB, paths 8 KiB and exchange timeout 30 seconds remain independent, as do authentication and shared replay checks. Reading over budget stops, cancels the original stream and releases its reader, without relying on Content-Length or clone/tee. `TransportBodyTooLargeError` extends RangeError (`hai:crypto:070`) and contains only `direction`, `stage`, `limitBytes` and optional observed `actualBytes`. Stages are `plaintext`, `encrypted` or `header`; early cancellation may observe less than the full body.

Oversized requests return 413. An oversized response to an authenticated request becomes an encrypted 500 capacity error; clients restore its diagnostics only after authentication. Unauthenticated 413 means request capacity failure and its body is cancelled. api-client maps capacity errors to `HaiApiClientError.PAYLOAD_TOO_LARGE` (`hai:api-client:020`) with direction, stage and byte counts.

### Deployment and incremental updates

docker-ssh derives Nginx `client_max_body_size` from resolved `_serv.yml`, disabling request/response buffering. Both endpoints check response size; header buffers remain separate. SvelteKit deployment derives adapter-node `BODY_SIZE_LIMIT` from `_kit.yml`. Self-managed proxies and launchers should use `resolveTransportBodyLimits()`; operators configure external CDN/gateway limits.

Full deployment uses the new budget. App incremental packages also include proxy configuration: a capacity change recreates Web with its existing image and includes it in health checks and rollback, without uploading another Web image. Incremental updates allow capacity directives only; port, API route or other proxy changes require full deployment. A capacity change without app selected is rejected; unchanged capacity retains Web. See [deployment](../function/deploy.en.md).

Custom managers and test doubles derive `bodyLimits` with `resolveTransportBodyLimits()` and return that plaintext budget during exchange.

<a id="browser-support"></a>

## Browser support

This integration guide was moved from the configuration handbook because it describes code arguments. The complete walkthrough is currently available in [Chinese](crypto.md#browser-support); this subsection is partially translated.
