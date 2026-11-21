# @h-ai/ui

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

Built-in messages support `zh-CN`, `en-US` and `ja-JP`; the language selector offers all three by default.

A cross-platform Svelte 5 Runes component library with DaisyUI v5 + Tailwind CSS v4 styling and Bits UI v2 headless interactions. It includes built-in i18n (zh-CN / en-US / ja-JP), 15 curated DaisyUI themes, and high-contrast, square business, eye-care, and Liquid Glass themes.

HTTP/UI boundaries expose business messages only for explicit valid 4xx statuses. Missing or invalid `httpStatus` is treated as 500 with a safe message. Custom business errors must carry a complete error definition or an explicit status.

## Quick Start

Install with pnpm: `pnpm add @h-ai/ui`.

[Open the quick-start guide](../../docs/usage/function/ui.en.md#quick-start).

## Configuration Reference

This module has no standalone runtime configuration file. See [file ownership](../../docs/usage/configuration/ui.en.md); arguments or response structures are in the [reference](../../docs/usage/function/ui.en.md#call-options).

## Features

[Browse the API list](../../docs/usage/function/ui.en.md#api-reference) for entry points, inputs, results and examples.

[Switch themes](../../docs/usage/function/ui.en.md#theme) to apply the light Liquid Glass theme (`liquid-glass`) through the existing selector and save that preference. Set `ThemeSelector`’s `themeIds` prop to limit the built-in choices.

[Tool and artifact workspaces](../../docs/usage/function/ui.en.md#tool-workspaces) provide parameter forms, examples, task progress, document editing, version conflicts, and media previews. Applications connect authorized read, write, and execution callbacks.

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/ui.en.md) for where themes, language settings, and onboarding progress are stored in the browser.

## Development and Testing

```sh
pnpm --filter @h-ai/ui typecheck
pnpm --filter @h-ai/ui lint
pnpm --filter @h-ai/ui build
pnpm --filter @h-ai/ui test
```

## License

Apache-2.0
