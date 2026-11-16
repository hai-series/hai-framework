# @h-ai/ui

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

Built-in messages support `zh-CN`, `en-US` and `ja-JP`; the language selector offers all three by default.

A cross-platform Svelte 5 Runes component library with DaisyUI v5 + Tailwind CSS v4 styling and Bits UI v2 headless interactions. Includes built-in i18n (zh-CN / en-US / ja-JP) and 15 curated DaisyUI themes plus high contrast, square business and eye-care themes.

HTTP/UI boundaries expose business messages only for explicit valid 4xx statuses. Missing or invalid `httpStatus` is treated as 500 with a safe message. Custom business errors must carry a complete error definition or an explicit status.

## Quick Start

### Installation

```bash
npm install @h-ai/ui @h-ai/core
```

For a Node server, declare both UI and core as production dependencies so the adapter preserves native logging and runtime dependencies.

### 1. Configure application imports in package.json

```json
{ "imports": { "#lib/*": "./src/lib/*" } }
```

### 2. Configure vite.config.ts

SvelteKit 3 configures preprocessing, the compiler and the adapter in the Vite plugin; only a plain Svelte/Vite project keeps svelte.config.js.

Run `vitePreprocess()` or other style/template language transforms before `autoImportHaiUi()`. Auto-import reads the complete Svelte AST and does not accept unprocessed SCSS, Pug or other nonstandard syntax. Its direct markup API remains synchronous.

```ts
import { autoImportHaiUi } from '@h-ai/ui/auto-import'
import { haiOptimizeExclude, haiPrebundledDeps } from '@h-ai/ui/vite'
import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: [
        vitePreprocess(),
        autoImportHaiUi()
      ],
      compilerOptions: { runes: true },
      adapter: adapter(),
      paths: { relative: false },
    }),
    tailwindcss(),
  ],
  optimizeDeps: {
    exclude: [...haiOptimizeExclude],
    include: [...haiPrebundledDeps]
  },
  ssr: {
    noExternal: ['@h-ai/ui', '@h-ai/kit'],
    external: ['@h-ai/core', 'sm-crypto']
  },
})
```

### 3. Configure src/app.css

When using Crypto or Kit/IAM, include `sm-crypto@0.5.8` in application production dependencies. CLI projects already do this; for manual setup, run `pnpm add sm-crypto@0.5.8`. The external option alone is insufficient: adapter-node also uses direct production dependencies to preserve native package loading.

```css
@import 'tailwindcss';
@import '@h-ai/ui/styles/global.css';
@import '@h-ai/ui/styles/theme.css';
@source "../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";
@source "../../../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";

@plugin "daisyui" {
  themes:
    light --default,
    dark --prefersdark,
    cupcake,
    emerald,
    corporate,
    nord,
    dracula,
    night;
}

/* 图标（可选） */
@plugin "@iconify/tailwind4" {
  prefixes: tabler;
}
```

> `@source` makes TailwindCSS scan classes in `@h-ai/ui`; without it, component styles are missing. In nested monorepo apps, dependencies may be hoisted to root `node_modules`, so retain both paths.

### 4. Use components

```svelte
<script>
  import { Button, Card, Input } from '@h-ai/ui'
</script>

<Card title='示例表单'>
  <Input placeholder='请输入用户名' />
  <Button variant='primary' onclick={handleSubmit}>提交</Button>
</Card>
```

With auto-import enabled, use components directly in templates without individual imports:

```svelte
<!-- 无需 import { Button } from '@h-ai/ui' -->
<Button variant='primary'>提交</Button>
```

> `@h-ai/ui/auto-import` injects all public Svelte components except `toast`, type imports, and `Range` (which conflicts with the DOM `Range` constructor).

Import from the relevant component entry when a page only uses a few components. Importing `@h-ai/ui/theme` for themes avoids loading AI or chart components. Using `@h-ai/ui/i18n` for locale settings avoids loading components and onboarding styles. The example uses public import paths.

With auto-import enabled, using `<Button>` in a template adds an import at build time if the file does not already define or import `Button`. A tag in a comment, `textarea` content, or a JavaScript string does not trigger an import. Declarations in the script and names already bound by `each`, `await`, or `snippet` take precedence.

If a template uses a component imported only as a type from `@h-ai/ui`, the plugin makes it available for rendering. If a type from another package conflicts with a component name, the build identifies the file and component. Give the type an alias or explicitly import the component under a different name.

```ts
import { Card } from '@h-ai/ui/components/compounds/index'
import { Button } from '@h-ai/ui/components/primitives/index'
import { getThemeInfo, THEMES } from '@h-ai/ui/theme'
```

## Configuration Reference

Pass props to a Svelte component, such as the columns and rows of a table. Set the application theme, language, and onboarding through `@h-ai/ui/theme`, `@h-ai/ui/i18n`, and `@h-ai/ui/guide`.

See the [configuration reference](../../docs/usage/configuration/ui.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/ui.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- **Primitive, compound and layout components** — Build inputs, forms, tables, dialogs and layouts
- **Business components** — Add CRUD, IAM, feedback, files, charts, AI content and code workspaces
- `@h-ai/ui/theme` / `@h-ai/ui/i18n` / `@h-ai/ui/toast` / `@h-ai/ui/guide` — Manage appearance, locale, notifications and onboarding
- `@h-ai/ui/vite` / `@h-ai/ui/auto-import` — Configure Vite dependencies and automatic imports

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/ui.md) in Chinese for where themes, language settings, and onboarding progress are stored in the browser.

## Development and Testing

```sh
pnpm --filter @h-ai/ui typecheck
pnpm --filter @h-ai/ui lint
pnpm --filter @h-ai/ui build
pnpm --filter @h-ai/ui test
```

## License

Apache-2.0
