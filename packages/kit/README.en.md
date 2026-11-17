# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md) · [@h-ai/iam](../iam/README.en.md)

`@h-ai/kit` helps SvelteKit applications handle requests, check identity, and write APIs. When the same site serves both the page and the API, the browser can call the API using that site’s address.

On the SvelteKit server, import `kit` from `@h-ai/kit` and use `kit.createHandle()` to create a request handler. In the browser, the same import supplies HTTP clients, list and form utilities, page tokens, and default locale settings. Use `KitFunctions` for the server object and `BrowserKitFunctions` for the browser object. `AuthCookieWriter` describes the cookie-writing methods the server needs to set cookies on the current response, such as after sign-in.

## Quick Start

[Open the quick-start guide](../../docs/usage/function/kit.en.md#quick-start).

## Configuration Reference

Generated projects set the listening address and port in `config/_kit.yml`. At startup, pass the access and encryption settings to `kit.createHandle(options)`. Use the returned function as a SvelteKit server hook.

See the [configuration reference](../../docs/usage/configuration/kit.en.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/kit.en.md#api-reference) for entry points, inputs, results and examples (Chinese).

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/kit.en.md) in Chinese for request context, cookies and application-owned persistence.

## Development and Testing

```bash
pnpm --filter @h-ai/kit test
```

Kit has no module-wide init/close. The application initializes and closes shared cache, IAM and crypto dependencies. See the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) for typechecked public examples. Authenticate requests with iam.auth.verifyToken; a nonempty token is not proof of identity.

## License

Apache-2.0
