# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/api-contract](../api-contract/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md)

> A cross-platform oRPC/OpenAPI typed client for hai-framework, with consistent API calls and token management across Web, apps, and mini programs.

## Capabilities

- `apiClient`: the default typed client for the iam/storage/ai domains.
- `apiClient.create(contract)`: create a typed client for a custom contract.
- `apiClient.tokenStorage.{memory,localStorage,httpOnlyCookie}()`: token storage factories.
- Custom `fetch` support for browsers, Node, Capacitor, and mini-program bridges.
- Automatic Bearer token injection, with token refresh and one retry after a 401.
- Network failures are converted to `HaiResult` errors.
- Optional transport encryption: `apiClient.init({ transport: { crypto } })` automatically uses `crypto.transport.createClient()`.
- Transport encryption and automatic refresh can run together: `/auth/refresh` after a 401 still uses encrypted fetch without falling back to plaintext.

## Quick start

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

### Enable transport encryption

First enable `serv.createApp({ transport: { crypto } })` on the server. The client only needs the same `@h-ai/crypto` service instance; no manual key exchange code is required.

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

## API contracts

Custom applications can bind their own oRPC contract:

```ts
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'

const contract = apiContract.create({ iam: apiContract.iam })
const client = apiClient.create(contract)

await client.init({ baseUrl: 'https://api.example.com/api/v1' })
const result = await client.iam.auth.login({ identifier: 'alice', password: 'secret' })
```

## API overview

- `apiClient.init(config)`: initialize the default client.
- `apiClient.close()`: clear client state.
- `apiClient.auth.setTokens(tokens)`: store the access token; storage other than httpOnly also stores the refresh token.
- `apiClient.auth.clear()`: clear tokens.
- `apiClient.create(contract)`: create a custom typed client.

Calling `init()` on an initialized client returns `CONFIG_ERROR` and leaves the existing client intact. To change `baseUrl` / `fetch` / `transport`, call `await apiClient.close()` before initializing again.

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

## Error handling

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

## Tests

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

## License

Apache-2.0
