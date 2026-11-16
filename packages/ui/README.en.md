# @h-ai/ui

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

Built-in messages support `zh-CN`, `en-US` and `ja-JP`; the language selector offers all three by default.

A cross-platform Svelte 5 Runes component library with DaisyUI v5 + Tailwind CSS v4 styling and Bits UI v2 headless interactions. Includes built-in i18n (zh-CN / en-US / ja-JP) and 15 curated DaisyUI themes plus high contrast, square business and eye-care themes.

HTTP/UI boundaries expose business messages only for explicit valid 4xx statuses. Missing or invalid `httpStatus` is treated as 500 with a safe message. Custom business errors must carry a complete error definition or an explicit status.

## Quick Start

[Open the quick-start guide](../../docs/usage/function/ui.md#最小接入示例) (Chinese).

## Configuration Reference

Pass props to a Svelte component, such as the columns and rows of a table. Set the application theme, language, and onboarding through `@h-ai/ui/theme`, `@h-ai/ui/i18n`, and `@h-ai/ui/guide`.

See the [configuration reference](../../docs/usage/configuration/ui.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/ui.md#api-reference) for entry points, inputs, results and examples (Chinese).

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
