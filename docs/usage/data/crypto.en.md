# @h-ai/crypto Data Structures

<a id="crypto-data-structures"></a>

[中文](crypto.md) · [日本語](crypto.ja.md)

[Data index](README.en.md) · [File configuration](../configuration/crypto.en.md) · [API](../function/crypto.en.md)

Encryption, decryption, signing and hashing do not need saved records. HTTP transport encryption needs to remember each client's public key and which requests have already been used, and to limit how quickly these records grow. Crypto stores this state through `@h-ai/cache`; it creates no database tables.

<a id="transport-state"></a>
<a id="example-data"></a>

## Cache

These examples follow one client connecting to a service. They contain fictional IDs and a public key, never a private key. Keys shown here are the names passed to Cache; Redis also adds the application's `keyPrefix`.

HTTP transport encryption uses the four cache families below. Client and request IDs come from key exchange and encrypted requests. Nodes sharing a backend and prefix see the same records.

| Key or family | Purpose | Default expiry and cleanup |
| --- | --- | --- |
| [`hai:crypto:transport:cache:client:<clientId>`](#cache-crypto-client) | Find a public key to verify requests and encrypt replies. | Defaults to 3600 seconds. Reads leave expiry unchanged. Exchange keys again after expiry. |
| [`hai:crypto:transport:cache:request:<clientId>:<requestId>`](#cache-crypto-request) | Mark a request ID as consumed. | Expires at `issuedAt + 3660000` milliseconds. |
| [`hai:crypto:transport:cache:quota:register`](#cache-crypto-registration) | Check remaining new-key registrations. | 60 seconds from the first write. Increments preserve expiry. |
| [`hai:crypto:transport:cache:quota:request`](#cache-crypto-request-quota) | Check remaining admissions for new requests. | 60 seconds from the first write. Increments preserve expiry. |

<a id="cache-crypto-client"></a>

### Client public key: recognize requests and encrypt replies for that client

Key exchange registers the client's public key and assigns a `clientId`. The server uses this ID to find the key, verify request signatures and encrypt responses for the client.

The key is `hai:crypto:transport:cache:client:<clientId>` and the value is a public-key string:

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| whole value | `string` | — | Client public key string. The full value is shown below. | `<SM2 public key>` |

```json
{
  "hai:crypto:transport:cache:client:c_example-42": "0432c4ae2c1f1981195f9904466a39c9948fe30bbff2660be1715a4589334c74c7bc3736a2f4f6779c59bdcee36b692153d0a9877cc62a474002df32e52139f0a0"
}
```

This means `c_example-42` is registered with this SM2 key. The sample is the publicly known SM2 curve generator; real clients generate their own key pairs. Registration lasts one hour by default, configurable to 1–86400 seconds. Reading it does not extend the lifetime. On expiry the client performs key exchange again. This does not log the user out: IAM manages login sessions separately.

<a id="cache-crypto-request"></a>

### Used request ID: stop the same encrypted request executing again

The client creates a fresh `requestId` for each request. After checking the signature, contents and time, the server records that the ID has been used. Only a request that successfully creates this marker reaches business code. A later request with the same client and ID is rejected. Even when two servers receive it together, only one can create the marker.

The key is `hai:crypto:transport:cache:request:<clientId>:<requestId>`. Its value is simply `true`: only existence matters, so the request body is not stored.

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| whole value | `boolean` | — | Writes `true` after successfully claiming the request ID. | `true` |

```json
{
  "hai:crypto:transport:cache:request:c_example-42:0123456789abcdef0123456789abcdef": true
}
```

This says client `c_example-42` has already used request `0123456789abcdef0123456789abcdef`. It must not execute again. `true` does not mean the business operation succeeded; a later business failure does not free the ID.

A request issued at 00:00 keeps its marker until 01:01 (`issuedAt + 3660000` ms). The 61 minutes cover the longest request lifetime of 60 minutes and a one-minute margin for node clock differences. If the request timestamp is 30 minutes ahead of the server clock, the marker may live for 91 minutes after the write. Size Redis for that retention window and keep live markers until they expire. A fresh submission with a new ID still needs business duplicate protection, such as an order idempotency key.

<a id="replay-window-upgrade"></a>

#### Enable a longer request lifetime after upgrading

To use a request lifetime above the previous 600-second limit, upgrade all nodes using the original settings first. Records created by the previous version have their own expiration times. After the last old node stops accepting requests, wait until requests accepted by old nodes would also expire under the new lifetime, then raise the setting on all nodes. For a new lifetime of 3600 seconds, wait 66 minutes to cover the previous maximum future skew of 300 seconds and a 60-second clock margin.

<a id="cache-crypto-registration"></a>

### New-key counter: stop repeated key exchanges filling the cache

All servers share the one key `hai:crypto:transport:cache:quota:register`. Each new registration reserves one slot:

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `used` | `number` | — | Registrations already admitted. The first write stores `1`. | `1` |
| `limit` | `number` | `10000` | Maximum keys admitted in one window. Default comes from the store factory. | `10000` |

```json
{
  "hai:crypto:transport:cache:quota:register": {
    "used": 1,
    "limit": 10000
  }
}
```

`used: 1` means one slot has been reserved in this window; `limit: 10000` allows at most 10000. A failed later write can still consume a slot, so this is an admission counter, not the number of live public keys. The first reservation starts a 60-second window; it does not reset on the clock's minute boundary. When full, Serv/Kit reject new key exchanges with HTTP 503. Existing registrations remain valid.

<a id="cache-crypto-request-quota"></a>

### New-request counter: stop used-ID records growing too quickly

All servers share `hai:crypto:transport:cache:quota:request` to limit newly admitted request IDs:

| Value field | Type | Default | Meaning | Example |
| --- | --- | --- | --- | --- |
| `used` | `number` | — | Requests already admitted in the window. The first write stores `1`. | `1` |
| `limit` | `number` | `100000` | Maximum requests admitted in one window. Default comes from the store factory. | `100000` |

```json
{
  "hai:crypto:transport:cache:quota:request": {
    "used": 1,
    "limit": 100000
  }
}
```

One request has been admitted in this window; the default maximum is 100000. This window also lasts 60 seconds from the first reservation. A known used ID is rejected without another slot. Simultaneous duplicates can conservatively reserve several slots, but only one reaches business code. Full quota returns HTTP 503; existing markers are kept.

## The 60-second windows, exhaustion and business rate limits

These are application-wide cache-capacity safeguards against excessive record growth. They do not allocate allowances by IP, user or route and do not replace business rate limits. Aggregate admissions may reach this safeguard even when no individual business limit has fired.

| Record | Default new admissions per window | When full | Recovery |
| --- | --- | --- | --- |
| Client public keys | 10000 | New exchanges return 503; existing keys remain | 60 seconds after this window’s first reservation |
| Used request IDs | 100000 | New requests return 503; existing markers remain | 60 seconds after this window’s first reservation |

Each counter has its own timer. A first registration at **00:00:10** ends that window at **00:01:10**. Filling it at 00:00:30 does not start a fresh window. The first registration after expiry starts the next 60-second window. Request counting follows its own first write.

These are not lifetime totals or concurrent-client limits. Registering 10000 keys in each of two windows can leave 20000 valid keys. Public keys default to one hour; used-ID markers follow request time, independently of the counter window. Factory arguments can change the safeguards. Setting them too low can return 503 to normal traffic; raising them requires more Redis memory while keeping per-IP/user/route business limits.

## Why these records do not grow forever

Public keys and used IDs expire. The two counter keys expire after 60 seconds and keep fixed names, rather than creating a new key each minute. Lifetimes and admission limits bound live records. A conservative default estimate is about 610000 public keys and 1700000 used-ID markers. Memory also includes keys and backend overhead, and expired data may be reclaimed later.

Registries on the same backend and keyPrefix share these counters; give separate applications different Cache prefixes when they need independent budgets. All nodes of one application must use the same Redis, prefix and quotas so that every node sees used requests. Use `noeviction`: refuse writes on insufficient memory instead of silently discarding valid markers. Reliable persistence is also needed; losing markers during restart or rollback weakens duplicate protection. Cache failures reject requests. Memory mode is for development and tests.

The application opens and closes Cache. Closing a transport manager does not erase shared records; client `destroy()` clears its local session. Private keys remain with the server keyring or client. Keep node clocks synchronized and verify the deployment within ±30 seconds.

[Lifetime and quota arguments](../function/crypto.en.md#call-options) · [Request authentication](../function/crypto.en.md#transport-protocol)
