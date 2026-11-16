# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md) · [@h-ai/iam](../iam/README.en.md)

`@h-ai/kit` helps SvelteKit applications handle requests, check identity, and write APIs. When the same site serves both the page and the API, the browser can call the API using that site’s address.

On the SvelteKit server, import `kit` from `@h-ai/kit` and use `kit.createHandle()` to create a request handler. In the browser, the same import supplies HTTP clients, list and form utilities, page tokens, and default locale settings. Use `KitFunctions` for the server object and `BrowserKitFunctions` for the browser object. `AuthCookieWriter` describes the cookie-writing methods the server needs to set cookies on the current response, such as after sign-in.

## Quick Start

When `kit.sequence()` combines several SvelteKit handlers, inner handlers transform the generated page first, followed by outer handlers. If more than one sets a `preload` option or a filter for serialized response headers, the first setting wins. This lets the locale middleware update the HTML `lang` attribute.

### Installation

```bash
npm install @h-ai/kit @h-ai/core sm-crypto@0.5.8
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/vite-plugin-svelte vite @tailwindcss/vite tailwindcss
```

### Project configuration

**vite.config.ts**：

```ts
import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter(),
      preprocess: [
        vitePreprocess()
      ],
      compilerOptions: { runes: true },
      // 绝对路径保持 SSR 与浏览器端认证、加密路径一致。
      paths: { base: '', relative: false },
    }),
    tailwindcss(),
  ],
  optimizeDeps: {
    exclude: ['bits-ui']
  },
  ssr: {
    noExternal: ['@h-ai/ui', '@h-ai/kit'],
    external: ['@h-ai/core', 'sm-crypto']
  },
})
```

When using Crypto or Kit/IAM, include `sm-crypto@0.5.8` in application production dependencies. CLI projects already do this; for manual setup, run `pnpm add sm-crypto@0.5.8`. The external option alone is insufficient: adapter-node also uses direct production dependencies to preserve native package loading.

## Configuration Reference

Generated projects set the listening address and port in `config/_kit.yml`. At startup, pass the access and encryption settings to `kit.createHandle(options)`. Use the returned function as a SvelteKit server hook.

See the [configuration reference](../../docs/usage/configuration/kit.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/kit.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `kit.createHandle` / `kit.sequence` / `kit.middleware` / `kit.guard` / `kit.handler` — Combine SvelteKit request handlers, routes, and permission checks
- `kit.response` / `kit.validate` / `kit.crud` / `kit.i18n` — Validate inputs and produce responses, CRUD definitions and localized content
- `kit.auth` / `kit.client` / `kit.createFeedbackHandler` — Handle browser sign-in state and requests, or create an HTTP endpoint for user feedback
- `@h-ai/kit/adapter` / `@h-ai/kit/crypto` / `@h-ai/kit/a2a` — Configure build adapters, encrypted transport and A2A routes

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/kit.md) in Chinese for request context, cookies and application-owned persistence.

## Development and Testing

```bash
pnpm --filter @h-ai/kit test
```

Kit has no module-wide init/close. The application initializes and closes shared cache, IAM and crypto dependencies. See the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) for typechecked public examples. Authenticate requests with iam.auth.verifyToken; a nonempty token is not proof of identity.

## License

Apache-2.0
