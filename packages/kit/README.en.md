# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md) · [@h-ai/iam](../iam/README.en.md)

`@h-ai/kit` helps SvelteKit applications handle requests, check identity, and write APIs. When the same site serves both the page and the API, the browser can call the API using that site’s address.

On the SvelteKit server, import `kit` from `@h-ai/kit` and use `kit.createHandle()` to create a request handler. In browser code, import `kit` from `@h-ai/kit/client` for HTTP clients, list and form utilities, page tokens, and locale settings. The root entry point uses `KitFunctions` for the server and `BrowserKitFunctions` for the browser. `AuthCookieWriter` describes the server methods for setting cookies on the current response, such as after sign-in.

For a standalone HTTP service shared across platforms, define contracts with `@h-ai/api-contract`, mount routes with `@h-ai/serv`, and use the typed `@h-ai/api-client` to call them.

- `kit.guard.matchPermission()` controls which actions the page displays. The server enforces permissions with `kit.guard.require()`.
- `kit.crud.resolveText()` and `kit.crud.resolveOptions()` resolve labels and choices for lists and forms.
- Pass `ai.a2a.createHttpHandler()` to `kit.createHandle({ a2a })` on the server. Use `kit.crypto` on the server and `@h-ai/kit/adapter` at build time.

## Quick Start

Install with pnpm: `pnpm add @h-ai/kit`.

[Open the quick-start guide](../../docs/usage/getting-started/kit.en.md#quick-start). [Dependencies and setup order](../../docs/usage/function/kit.en.md#module-dependencies).

## Configuration Reference

The Node server in a generated project reads its listening address and port from `HOST` and `PORT`. Pass the `http` and `transport` settings from `config/_kit.yml` to `kit.createHandle({ http, transport })`. For enabled transport, inject initialized Crypto, the server key ring, and the shared registration store. Set trusted proxies and access rules under `http`, and use an origin-root absolute pathname for `transport.keyExchangePath`.

See the [configuration reference](../../docs/usage/configuration/kit.en.md) for listener, trusted proxy, access control and transport settings and deployment examples. For a standalone HTTP service, see the [Serv configuration reference](../../docs/usage/configuration/serv.en.md).

Set request access, trusted proxies, and rate limiting under `http`. Supply a counter store when enabling `http.rateLimit`. [Rate-limit and reset example](../../docs/usage/function/kit.en.md#rate-limit-example)

With transport enabled, Kit encrypts the mounted contract API by default. When using a custom prefix, pass the same full path to the browser installer. [Reporting example under a subdirectory](../../docs/usage/function/kit.en.md#kit-custom-contract-transport)

## Features

[Browse the API list](../../docs/usage/function/kit.en.md#api-reference) for entry points, inputs, results and examples.

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/kit.en.md) for request context, cookies and application-owned persistence.

## Development and Testing

```bash
pnpm --filter @h-ai/kit test
```

Kit has no module-wide init/close. The application initializes and closes shared cache, IAM and crypto dependencies. See the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) for typechecked public examples. Authenticate requests with iam.auth.verifyToken; a nonempty token is not proof of identity.

## License

Apache-2.0
