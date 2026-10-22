# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/api-contract](../api-contract/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md)

## Introduction

A cross-platform oRPC/OpenAPI typed client for hai-framework, with consistent API calls and token management across Web, apps, and mini programs.

## Core features

- `apiClient`: the default typed client for the iam/storage/ai domains.
- `apiClient.create(contract)`: create a typed client for a custom contract.
- `apiClient.tokenStorage.{memory,httpOnlyCookie}()`: token storage factories. Browsers keep access tokens in memory and refresh tokens in server-managed httpOnly cookies; native clients inject platform secure storage. Credentials are never written to Web Storage.
- Custom `fetch` support for browsers, Node, Capacitor, and mini-program bridges.
- Automatic Bearer token injection, with token refresh and one retry after a 401.
- Network failures are converted to `HaiResult` errors.
- Optional transport encryption: `apiClient.init({ transport: { crypto } })` automatically uses `crypto.transport.createClient()`.
- Transport encryption and automatic refresh can run together: `/auth/refresh` after a 401 still uses encrypted fetch without falling back to plaintext.

## Getting started

### Quick start

```ts
import { apiClient } from '@h-ai/api-client'

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {}, // 默认使用 httpOnly cookie 存储（推荐）；SSR 测试请显式传入 apiClient.tokenStorage.memory()
})

const login = await apiClient.iam.auth.login({
  identifier: 'alice',
  password: 'secret',
})

if (login.success) {
  // httpOnly cookie 模式下 refresh token 由服务端 Set-Cookie 管理，
  // api-client 默认存储只需要把 access token 写入内存。
  await apiClient.auth.setTokens(login.data.tokens)
}

const me = await apiClient.iam.auth.currentUser()
if (me.success) {
  // 身份资料与服务端重新校验后的访问范围一次返回，客户端无需持久化权限快照。
  const { roles, permissions, ...user } = me.data
}

await apiClient.close()
```

#### Enable transport encryption

First enable `serv.createApp({ transport: { crypto, serverKeyRing, keyStore } })` on the server. The client only needs the same `@h-ai/crypto` service instance; no manual key exchange code is required.

The server injects a managed serverKeyRing and shared registry. Clients receive only serverKeyId/public keys and include the negotiated version in encrypted requests; private keys never enter client configuration. After retirement of a key version, destroy the transport session and negotiate again; do not automatically replay non-idempotent operations.

```ts
import { apiClient } from '@h-ai/api-client'
import { crypto } from '@h-ai/crypto'

await crypto.init()

await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: {},
  transport: { crypto }, // 默认协商路径：/api/v1/_hai/key-exchange
})

await apiClient.close()
await crypto.close()
```

Only authenticated protocol v2 is accepted. Independent random SM4-CBC and HMAC-SM3 keys are wrapped with SM2; verify the sender signature and MAC before CBC decryption. Clients sign requests and the selected server key version signs responses. Authentication covers version, direction, serverKeyId, clientId, a random 128-bit requestId acting as the nonce, issuedAt, HTTP method, the SM3 pathHash of pathname plus the original search, and response status. Requests have a five-minute lifetime and at most 30 seconds of future clock skew. The shared registry atomically consumes (clientId, requestId), retaining it until at least issuedAt plus six minutes to cover node skew; storage failures reject requests. Synchronize node clocks and use a Redis noeviction/durable policy that preserves live nonces. Transport replay prevention does not replace business idempotency keys.

Empty POSTs still send an authenticated envelope for empty plaintext. GET/HEAD carry it in X-Hai-Transport; bodyless responses such as 204/304/HEAD use the same header. Other requests/responses carry a JSON envelope and X-Encrypted: true. The client must match the original request context and HTTP status; missing markers, old formats and authentication failures reject. Exclude plaintext endpoints explicitly with excludePaths. CORS must allow and expose X-Hai-Transport. TLS authenticates handshake keys; this protocol does not replace IAM authorization.

### API contracts

The default `apiClient.ai.chats.createCompletion({ messages, tools, tool_choice })` uses a non-streaming JSON contract and retains complete nested function JSON Schema and `strict`. Check `success` before reading `data.choices[].message.tool_calls`. After authorization and execution, include the assistant tool calls and tool results with matching `tool_call_id` in the next `messages`. The input does not support `stream`; the server rejects it even if TypeScript is bypassed. Bind an application's own stream contract for streaming.

Custom applications can bind their own oRPC contract:

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

const contract = apiContract.create({ iam: apiContract.iam })
const client = apiClient.create(contract)

await client.init({ baseUrl: 'https://api.example.com/api/v1' })
const result = await client.iam.auth.login({ identifier: 'alice', password: 'secret' })
```

### API overview

- `apiClient.init(config)`: initialize the default client.
- `apiClient.close()`: clear client state.
- `apiClient.auth.setTokens(tokens)`: replace credentials and store the access token; non-httpOnly storage saves the supplied refresh token or clears its previous value when omitted.
- `apiClient.auth.clear()`: clear tokens.
- `apiClient.create(contract)`: create a custom typed client.

`auth.clear()` and `auth.setTokens()` immediately cancel and invalidate this client's previous refresh request. A late success or 401 cannot restore a logged-out session, overwrite a new account, or notify stale refresh callbacks. Storage writes are serialized, so an earlier asynchronous write cannot overwrite credentials after either method completes. Use these methods when logging out or switching accounts instead of writing to storage directly. The server logout endpoint must still revoke the httpOnly cookie and server session.

Calling `init()` on an initialized client returns `CONFIG_ERROR` and leaves the existing client intact. To change `baseUrl` / `fetch` / `transport`, call `await apiClient.close()` before initializing again.

### Configuration

- `baseUrl`: API base URL, usually including `/api/v1`.
- `auth.storage`: token storage adapter; defaults to `apiClient.tokenStorage.httpOnlyCookie()` (recommended for browsers). Explicitly use `apiClient.tokenStorage.memory()` for SSR / tests.
- `auth.refreshPath`: token refresh path; defaults to `/auth/refresh`.
- `timeout`: request timeout; defaults to 30000 ms.
- `headers`: static or dynamic shared request headers.
- `fetch`: custom fetch implementation.
- `transport.crypto`: transparent request/response encryption and decryption; requires an initialized `@h-ai/crypto` instance.
- `transport.keyExchangePath`: key exchange subpath; defaults to `/_hai/key-exchange` and is appended to `baseUrl` automatically.
- `apiClient.config`: a **redacted snapshot of runtime configuration**; credentials embedded in `baseUrl`, `headers.authorization`, and other sensitive values are hidden automatically.

### Configuration driven authentication

Agreements support configuration-loaded userAgreementMarkdown/privacyPolicyMarkdown and URLs. Markdown takes priority for the same agreement and is safely rendered in a modal.

apiClient.createAuthActions(client) supplies publicConfig, login, register, sendOtp and password-reset actions for a client containing the standard IAM contract. Login uses identifier/password/method/code; successful authentication saves tokens through the existing configured storage. Applications only refresh their own state or navigate after authentication.

[完整 IAM 配置 / IAM configuration](../iam/README.en.md)

### Error handling

Business APIs return `HaiResult<T>`:

```ts
const result = await apiClient.iam.auth.currentUser()
if (!result.success) {
  // result.error.code / result.error.message
}
else {
  // result.data = User & { roles: string[], permissions: string[] }
}
```

Client-side failures such as missing initialization, network errors, timeouts, and 401/403/404 responses are also converted to failed `HaiResult` values.

Automatic refresh handles an actual HTTP 401 (`Response.status`) or a valid failed HaiResult over HTTP 200 (`success=false`, string `error.code/message` and `error.httpStatus=401`). After a successful refresh, the original request is retried once. Built-in login and registration routes and the configured `auth.refreshPath` never trigger automatic refresh; other failures such as 403/500 do not trigger it either. Ordinary serv procedures still return HTTP 200. Callers must check the final `success` and `error.code` and handle expired authentication when refresh fails.

## Development and testing

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

## License

Apache-2.0

## Input limits and HTTP capabilities

Object keys are limited to 1024 UTF-8 bytes and reject absolute paths, backslashes, control characters and dot segments. Each public HTTP batch delete accepts 1–1000 entries. `@h-ai/storage/schemas` exposes the shared browser-safe rules. Presign expiry is an integer from 1 to 604800 seconds (Node default 3600, HTTP default 900). Upload signing accepts only key/contentType/expiresIn; contentLength/maxSize/metadata/checksum are unsupported. Invalid input returns HTTP 400 and the typed client maps it to VALIDATION_FAILED. FileUpload limits guide file selection; applications must validate actual objects on the server. Node streaming/checksum/conditional-write options have no default HTTP endpoints. See the [capability and authorization matrix (Chinese)](../../docs/storage-api-capabilities.md).
