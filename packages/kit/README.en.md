# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md) · [@h-ai/crypto](../crypto/README.en.md) · [@h-ai/iam](../iam/README.en.md)

`@h-ai/kit` integrates SvelteKit with hai-framework, providing a shared request pipeline and same-origin endpoint utilities:

Use runtime operations through `kit.xx`. Public namespace types are `KitFunctions` on the server and `BrowserKitFunctions` in the browser. The browser condition exposes only clients, CRUD, page tokens, and default locale operations. `AuthCookieWriter` describes the current request's minimal server authentication cookie writer. Re-exported methods and namespaces support consumer declaration emission without importing internal helpers.

## Quick Start

`sequence` preserves SvelteKit resolve options: page transformations run from inner to outer, while the first preload and serialized-header filter win. This preserves the i18n HTML language replacement.

### Installation

```bash
npm install @h-ai/kit @h-ai/core sm-crypto@0.5.8
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/vite-plugin-svelte vite
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

Generated projects use `config/_kit.yml`. Pass parsed settings to the relevant SvelteKit hooks, clients and build adapters.

See the [configuration reference](../../docs/usage/configuration/kit.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/kit.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `createHandle` / `sequence` / `middleware` / `guard` / `handler` — Compose SvelteKit hooks, endpoints and access checks
- `response` / `validate` / `crud` / `i18n` — Validate inputs and produce responses, CRUD definitions and localized content
- `auth` / `client` / `createFeedbackHandler` — Connect authentication, browser clients and feedback endpoints
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
