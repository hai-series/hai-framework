# @h-ai/kit API reference

<!-- translation: partial -->

[Chinese source](kit.md) · [Configuration](../configuration/kit.en.md) · [Data structures](../data/kit.en.md)

<a id="quick-start"></a>

## Quick start

Use Kit in SvelteKit hooks, route handlers and the browser client. Server code protects routes and validates input as well as translating domain results into HTTP responses.

```bash
npm install @h-ai/kit @h-ai/core sm-crypto@0.5.8
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/vite-plugin-svelte vite
```

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

<a id="api-reference"></a>

## API list

| API | Input and result | Example |
| --- | --- | --- |
| `kit.createHandle`, `kit.sequence`, `kit.handler` | Create a hook, compose hooks in order, or wrap a route handler. | `kit.sequence(first, second)` |
| `kit.guard.check`, `require`, `requireSensitive` | Check authorization and enforce normal or sensitive access. | `kit.guard.require(session, permission)` |
| `kit.response.ok`, `created`, `noContent`, `error`, `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `validationError`, `internalError`, `redirect`, `fromResult`, `fromError` | Build an HTTP response or map a business result/error to its status and body. | `kit.response.fromResult(result)` |
| `kit.validate.body`, `query`, `params`, `IdParamSchema`, `PaginationQuerySchema` | Validate request data against schemas and return typed input. | `await kit.validate.body(request, schema)` |
| `kit.client.create`, `createAuthActions`, `installBrowserTransport`, `installBrowserTransportFetch` | Create the same-origin client and install authentication or encrypted Fetch behavior. | `kit.client.create()` |
| `kit.auth.publicPaths` | Obtain public authentication paths for authentication guards. | `kit.auth.publicPaths` |

Still untranslated: the SvelteKit request hook, session guards and encrypted fetch setup. Read the [Chinese source section](kit.md#detailed-workflow).
