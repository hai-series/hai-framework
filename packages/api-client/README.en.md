# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

Requests and token refresh use the current `core.i18n` locale as `Accept-Language`, so server errors follow the interface language. Set this header in `headers` to override it.

[Framework home](../../README.en.md) · Related modules: [@h-ai/api-contract](../api-contract/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md)

A cross-platform oRPC/OpenAPI typed client for hai-framework, with consistent API calls and token management across Web, apps, and mini programs.

## Quick Start

`close()` invalidates retired refreshes and drains credential writes while preserving external TokenStorage values. After close completes, the same storage may be reused. `timeout` covers headers, the complete JSON body, and every unsuccessful response body, including HTML error pages. Timeout or cancellation prevents token refresh. The built-in Cookie adapter includes credentials for login and refresh, requiring explicit credentialed CORS origins; memory and native storage preserve the original request credentials. Custom application streams remain incremental and their bodies use the caller signal for cancellation.

```ts
import type { IamAuthLoginInput } from '@h-ai/api-client'
import { apiClient } from '@h-ai/api-client'

async function loginAndLoadProfile(input: IamAuthLoginInput) {
  const initialized = await apiClient.init({ baseUrl: '/api/v1', auth: {} })
  if (!initialized.success)
    return initialized
  try {
    const actions = apiClient.createAuthActions(apiClient)
    const loggedIn = await actions.login(input)
    if (!loggedIn.success)
      return loggedIn
    const profile = await apiClient.iam.auth.currentUser()
    if (!profile.success)
      return profile
    return profile
  }
  catch (writeError) {
    try {
      await apiClient.auth.clear()
    }
    catch (cleanupError) {
      throw new AggregateError([writeError, cleanupError], 'Credential persistence and cleanup failed')
    }
    throw writeError
  }
  finally {
    await apiClient.close()
  }
}
```

## Features

### Purpose, inputs and outputs

Initialize first. Named variables are validated host input; check HaiResult.success. auth and storage Promise<void> operations may reject: surface the failure and handle cleanup faults instead of reporting successful login from a server result alone.

| Entry                                   | Input                           | Output                     | Purpose and failure boundary                                              | Example                                                      |
| --------------------------------------- | ------------------------------- | -------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `apiClient.init`                        | config: baseUrl、认证及传输选项 | `Promise<HaiResult<void>>` | Initialize; stop on failure                                               | `await apiClient.init({ baseUrl: '/api/v1', auth: {} })`     |
| `apiClient.close`                       | none                            | `Promise<void>`            | Invalidate refresh and release this instance; not server logout           | `await apiClient.close()`                                    |
| `apiClient.create`                      | shared contract                 | `ApiClient<TContract>`     | Create isolated instances, one per SSR request                            | `apiClient.create(contract)`                                 |
| `apiClient.auth.setTokens`              | trusted response                | `Promise<void>`            | Serialize credentials and invalidate old refresh; storage failures reject | `await apiClient.auth.setTokens(tokens)`                     |
| `apiClient.auth.clear`                  | none                            | `Promise<void>`            | Clear local credentials; may reject; server still needs logout            | `await apiClient.auth.clear()`                               |
| `apiClient.auth.onTokenRefreshed`       | callback(TokenPair)             | `() => void`               | Observe after persistence; returns unsubscribe; never log tokens          | `apiClient.auth.onTokenRefreshed(() => refreshProfile())`    |
| `apiClient.tokenStorage.memory`         | none                            | `TokenStorage`             | Isolated in-memory adapter for Node/SSR/tests                             | `apiClient.tokenStorage.memory()`                            |
| `apiClient.tokenStorage.httpOnlyCookie` | none                            | `TokenStorage`             | Browser access in memory, refresh in server Cookie                        | `apiClient.tokenStorage.httpOnlyCookie()`                    |
| `apiClient.createAuthActions`           | standard IAM contract           | `Auth actions object`      | Bind auth forms after init with auth enabled                              | `apiClient.createAuthActions(apiClient)`                     |
| `apiClient.observeRequests`             | observer(ApiRequestRecord)      | `() => void`               | Observe sanitized logical outcomes; returns unsubscribe                   | `apiClient.observeRequests(record => reportOutcome(record))` |

#### Authentication form actions

`const actions = apiClient.createAuthActions(apiClient)`

| Entry                          | Input                                           | Output                                        | Purpose and failure boundary                                 | Example                                                              |
| ------------------------------ | ----------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| `actions.publicConfig`         | —                                               | `Promise<HaiResult<T>>` → IamPublicConfig     | Read public auth policy                                      | `await actions.publicConfig()`                                       |
| `actions.createCaptcha`        | { operation }                                   | `Promise<HaiResult<T>>` → IamCaptchaChallenge | Request an operation challenge                               | `await actions.createCaptcha({ operation: 'login' })`                |
| `actions.login`                | IamAuthLoginInput                               | `Promise<HaiResult<T>>` → auth result         | Map password/ldap/email/sms and await credential persistence | `await actions.login({ identifier, password })`                      |
| `actions.register`             | IamRegisterInput                                | `Promise<HaiResult<T>>` → auth result         | Register under server policy and save credentials            | `await actions.register({ username, password })`                     |
| `actions.sendOtp`              | identifier, { captcha? }?                       | `Promise<HaiResult<T>>` → { expiresAt }       | Send email/phone OTP; does not log in                        | `await actions.sendOtp(identifier)`                                  |
| `actions.requestPasswordReset` | identifier, { captcha? }?                       | `Promise<HaiResult<T>>` → void                | Request reset under server account-enumeration policy        | `await actions.requestPasswordReset(identifier)`                     |
| `actions.confirmPasswordReset` | token, newPassword                              | `Promise<HaiResult<T>>` → void                | Consume the dedicated reset token                            | `await actions.confirmPasswordReset(resetToken, newPassword)`        |
| `actions.renewPassword`        | { identifier, password, newPassword, captcha? } | `Promise<HaiResult<T>>` → void                | Renew an expired password                                    | `await actions.renewPassword({ identifier, password, newPassword })` |
| `actions.reauthenticate`       | password, operation                             | `Promise<HaiResult<T>>` → purpose ticket      | Obtain a short-lived operation-bound credential              | `await actions.reauthenticate(password, 'users:delete')`             |
| `actions.bindPageExit`         | { enabled? }                                    | `() => void`                                  | Bind best-effort page-exit revocation; returns cleanup       | `actions.bindPageExit({ enabled: endOnPageHide })`                   |

#### Secure storage instance

`const storage = apiClient.tokenStorage.memory()`

| Entry                     | Input | Output                    | Purpose and failure boundary                                     | Example                                       |
| ------------------------- | ----- | ------------------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| `storage.getAccessToken`  | —     | `Promise<string \| null>` | Read access; null means absent only                              | `await storage.getAccessToken()`              |
| `storage.setAccessToken`  | token | `Promise<void>`           | Save access; bound clients use auth.setTokens                    | `await storage.setAccessToken(accessToken)`   |
| `storage.getRefreshToken` | —     | `Promise<string \| null>` | Cookie mode yields an internal sentinel, not Cookie contents     | `await storage.getRefreshToken()`             |
| `storage.setRefreshToken` | token | `Promise<void>`           | Memory saves; Cookie adapter does not change server Cookie       | `await storage.setRefreshToken(refreshToken)` |
| `storage.clear`           | —     | `Promise<void>`           | Clear adapter credentials; failures reject; no server revocation | `await storage.clear()`                       |

#### Default business domains

Default domains mirror HTTP contracts in api-contract, not the complete server module objects. A custom client contains only the supplied contract.

- `apiClient.iam`: IAM login, registration, users, roles and permissions — [API Contract](../api-contract/README.md), [IAM](../iam/README.md).
- `apiClient.storage`: Storage listing, metadata, presigning and deletion — [API Contract](../api-contract/README.md), [Storage](../storage/README.md).
- `apiClient.ai`: Non-streaming AI chat — [API Contract](../api-contract/README.md), [AI](../ai/README.md).

Follow the actual contract for arrays, permissions and business errors. The server authorizes identity/resources; client settings grant no permission.

```ts
const files = await apiClient.storage.files.list({ prefix: 'reports/', maxKeys: 20 })
if (!files.success)
  throw new Error(files.error.message)
const chat = await apiClient.ai.chats.createCompletion({
  messages: [
    { role: 'user', content: 'Summarize this public report.' }
  ],
})
if (!chat.success)
  throw new Error(chat.error.message)
```

`apiClient.config` is a redacted runtime snapshot (null before initialization), not a source for restoring secrets. `apiClient.isInitialized` is the ready boolean. Both are read-only properties and make no network request.

### Enable transport encryption

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

Only authenticated protocol v2 is accepted. Independent random SM4-CBC and HMAC-SM3 keys are wrapped with SM2; verify the sender signature and MAC before CBC decryption. Clients sign requests and the selected server key version signs responses. Authentication covers version, direction, serverKeyId, clientId, a random 128-bit requestId acting as the nonce, issuedAt, HTTP method, the SM3 pathHash of pathname plus the original search, and response status. By default, requests expire after five minutes and client timestamps may be up to 30 seconds ahead. Set `maxRequestAgeSeconds` (1–600) and `maxFutureSkewSeconds` (0–300) on the server to adjust these limits in whole seconds. The shared registry atomically consumes (clientId, requestId) and retains the nonce until issuedAt plus 11 minutes, covering the longest configurable window and server clock differences. Storage failures reject requests. Synchronize node clocks and use a Redis noeviction/durable policy that preserves live nonces. Transport replay prevention does not replace business idempotency keys.

Empty POSTs still send an authenticated envelope for empty plaintext. GET/HEAD carry it in X-Hai-Transport; bodyless responses such as 204/304/HEAD use the same header. Other requests/responses carry a JSON envelope and X-Encrypted: true. The client must match the original request context and HTTP status; missing markers, old formats and authentication failures reject. Serv/Kit hosts explicitly allow plaintext through `encryption: disabled` path rules or host `excludePaths`. Callers must select ordinary requests; API Client/Kit wrappers use their own `excludePaths`. CORS must allow and expose X-Hai-Transport. TLS authenticates handshake keys; this protocol does not replace IAM authorization.

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

### Credential changes and closing

`auth.clear()` and `auth.setTokens()` immediately cancel and invalidate this client's previous refresh request. A late success or 401 cannot restore a logged-out session, overwrite a new account, or notify stale refresh callbacks. Storage writes are serialized, so an earlier asynchronous write cannot overwrite credentials after either method completes. Use these methods when logging out or switching accounts instead of writing to storage directly. The server logout endpoint must still revoke the httpOnly cookie and server session.

Calling `init()` on an initialized client returns `CONFIG_ERROR` and leaves the existing client intact. To change `baseUrl` / `fetch` / `transport`, call `await apiClient.close()` before initializing again.

### Configuration driven authentication

Password login submits only `identifier` and `password`; `AuthPanel` maps the `LoginForm` field `username` to `identifier`. Server settings `session.maxAge` / `session.refreshTokenMaxAge` control session lifetimes. The login form has no per-login persistent-session option.

Agreements support configuration-loaded userAgreementMarkdown/privacyPolicyMarkdown and URLs. Markdown takes priority for the same agreement and is safely rendered in a modal.

apiClient.createAuthActions(client) supplies publicConfig, login, register, sendOtp and password-reset actions for a client containing the standard IAM contract. Login uses identifier/password/method/code; successful authentication saves tokens through the existing configured storage. Applications only refresh their own state or navigate after authentication.

[完整 IAM 配置 / IAM configuration](../iam/README.en.md)

### Input limits and HTTP capabilities

Object keys are limited to 1024 UTF-8 bytes and reject absolute paths, backslashes, control characters and dot segments. Each public HTTP batch delete accepts 1–1000 entries. `@h-ai/storage/schemas` exposes the shared browser-safe rules. Presign expiry is an integer from 1 to 604800 seconds (Node default 3600, HTTP default 900). Upload signing accepts only key/contentType/expiresIn; contentLength/maxSize/metadata/checksum are unsupported. Invalid input returns HTTP 400 and the typed client maps it to VALIDATION_FAILED. FileUpload limits guide file selection; applications must validate actual objects on the server. Node streaming/checksum/conditional-write options have no default HTTP endpoints. See the [capability and authorization matrix (Chinese)](../storage/README.md#存储输入约束与跨端能力).

### Logical request observation

`client.observeRequests` observes each logical call once and returns an unsubscribe function. Records contain requestId, procedure, duration, HTTP status, final success/errorCode, and business request attempts. A failed HaiResult with HTTP 200 is a failure. Authentication retries retain the same requestId. Records exclude bodies, tokens, and URL query parameters. Refresh and key exchange are not presented as user operations. close clears subscriptions, so subscribe again after reinitializing.

```ts
import { apiClient } from '@h-ai/api-client'

const unsubscribe = apiClient.observeRequests((record) => {
  const failed = !record.success
  const requestId = record.requestId
})
unsubscribe()
```

### Optional interactive challenges

createAuthActions(client) supplies createCaptcha({operation}) and preserves captcha in login mappings, renewal and registration. sendOtp(identifier,{captcha}) and requestPasswordReset(identifier,{captcha}) take an optional second argument. AuthPanel solves automatically; custom forms reuse ALTCHA without persisting proofs in TokenStorage.

See policy, defaults and recovery boundaries in [IAM](../iam/README.en.md).

### Sensitive request reauthentication

Pass the purpose-bound proof returned by `reauthenticate` through the individual call’s `options.context.reauthentication`; the request pipeline emits `X-Hai-Reauthentication`. Never place it in global client headers, persistent storage or logs. The server checks current permissions, resource scope and proof purpose before atomic consumption. Concurrent ordinary calls do not inherit the header. Cross-origin hosts must allow it; Serv/Kit defaults already include it.

### Recovering an expired session in place

Set `auth.recoverSession` to sign in again without discarding the current page. Use UI `createSessionRecovery` / `SessionRecoveryDialog`: configure the public policy and original user in the root layout, pass `recovery.recover` as the callback, provide standard authentication actions, and cancel on teardown. IAM checks login `expectedUserId` before issuing a session; captcha, lockout, password renewal and access rules remain active. Only an explicitly authentication-rejected request is retried once. Cancellation, 5xx, timeouts and ambiguous writes are not replayed. Sensitive-operation proofs from an old session may need a new confirmation. Without the callback, behavior is unchanged; with it, recovery handles failure instead of immediate onRefreshFailed navigation. auth.terminalType (web/app/desktop/api; default web) selects a session group and does not attest hardware identity.

### Page exit session policy

`session.endOnPageHide` defaults to `false`. Hosts call `actions.bindPageExit({ enabled: config.session.endOnPageHide })` and invoke its returned cleanup on unmount; standard admin/H5/fullstack templates already bind it. A non-BFCache `pagehide` (including reload and full document navigation) makes a best effort POST to `/auth/session/close`, revoking the held access and related refresh through the existing CSRF/encrypted transport with `keepalive` and no automatic refresh. This response does not clear cookies/local credentials, avoiding a late old response overwriting a new login. Explicit logout still revokes and clears current credentials normally. Browsers may omit page exit requests; configure server `idleTimeout`/`absoluteTimeout` as appropriate. Immediate revocation on browser close is not guaranteed.

For a sensitive call, supply `reauthorize: () => sensitiveActions.authorize(operation)` in the third Kit apiFetch argument or typed-client options.context. After session rotation/recovery or an explicit proof rejection, obtain a new purpose-bound proof before one retry. Cancellation sends no further write; without a callback, an old proof is never replayed.

## Configuration

- `baseUrl`: API base URL, usually including `/api/v1`.
- `auth.storage`: token storage adapter; defaults to `apiClient.tokenStorage.httpOnlyCookie()` (recommended for browsers). Explicitly use `apiClient.tokenStorage.memory()` for SSR / tests.
- `auth.refreshPath`: token refresh path; defaults to `/auth/refresh`.
- `timeout`: request timeout; defaults to 30000 ms.
- `headers`: static or dynamic shared request headers.
- `fetch`: custom fetch implementation.
- `transport.crypto`: transparent request/response encryption and decryption; requires an initialized `@h-ai/crypto` instance.
- `transport.keyExchangePath`: key exchange subpath; defaults to `/_hai/key-exchange` and is appended to `baseUrl` automatically.
- `apiClient.config`: a **redacted snapshot of runtime configuration**; credentials embedded in `baseUrl`, `headers.authorization`, and other sensitive values are hidden automatically.

## Error Handling

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

A valid failed `HaiResult` returned with a non-2xx HTTP status retains its business error code, message and `traceId`; a 409 conflict can therefore explain how to retry. The actual HTTP response determines `httpStatus`. Internal 5xx diagnostics remain hidden even if the body claims status 400. Other response formats continue to use client error mappings.

Automatic refresh handles an actual HTTP 401 (`Response.status`) or a valid failed HaiResult over HTTP 200 (`success=false`, string `error.code/message` and `error.httpStatus=401`). After a successful refresh, the original request is retried once. Built-in login and registration routes and the configured `auth.refreshPath` never trigger automatic refresh; other failures such as 403/500 do not trigger it either. Ordinary serv procedures still return HTTP 200. Callers must check the final `success` and `error.code` and handle expired authentication when refresh fails.

### Error messages and correlated logs

HTTP errors carry safe localized messages and a reference ID. ToastContainer hides the ID by default and reveals it through its diagnostic icon. The same ID remains in `error.traceId` and `X-Trace-Id`. The framework reuses the request ID to correlate browser and server logs. Sanitized exceptions, stacks and operation context remain in logs; internal cause/ext are not exposed. Field validation returns localized field names and messages only.

Use `core.error.toPublic(error, traceId?)` at HTTP/UI boundaries and `core.error.formatMessage(error)` after translating messages; formatting is idempotent. Pass complete Error objects to logs instead of discarding their context. Database failures log driver codes, sanitized messages/stacks and table/column context; SQL text, bound values and connection credentials are excluded.

## Development

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

Clients learn `transport.maxPlaintextBytes` from server key exchange. An explicit local limit selects the smaller value. Capacity failures return `HaiApiClientError.PAYLOAD_TOO_LARGE` (`hai:api-client:020`) with direction, stage and byte diagnostics. See [capacity and upgrade](../crypto/TRANSPORT-CAPACITY.md).

Serv/Kit return an encrypted HTTP 400 for an out-of-window request after validating request binding, signature and MAC. The client throws `TransportTimeError` (`hai:crypto:071`), displays the server’s UTC time at validation, and asks the user to enable automatic synchronization or set the device time manually before refreshing. `serverTime` is Unix milliseconds. Clients still show synchronization guidance when an older server omits it. `api-client` maps the error to `VALIDATION_FAILED` and preserves `cause.transportCode` and `cause.serverTime`.

## License

Apache-2.0
