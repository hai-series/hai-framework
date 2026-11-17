# @h-ai/capacitor

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/api-client](../api-client/README.en.md) · [@h-ai/core](../core/README.en.md)

A Capacitor native bridge for hai Framework mobile apps, with a unified API for secure token storage, device information, push notifications, camera, and status bar access.

## Quick Start

Install with pnpm: `pnpm add @h-ai/capacitor @capacitor/core @capacitor/preferences`.

[Open the quick-start guide](../../docs/usage/function/capacitor.en.md#quick-start).

## Configuration Reference

Install and configure the native plugins you need, such as push notifications or the camera, in the Capacitor project. Call `capacitor.init()` at startup, then use the configured plugins through `capacitor.push`, `capacitor.camera`, and related APIs.

See the [configuration reference](../../docs/usage/configuration/capacitor.en.md) for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/capacitor.en.md#api-reference) for entry points, inputs, results and examples.

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/capacitor.en.md) for native preferences, credentials, photos and push tokens.

## Development and Testing

```bash
pnpm --filter @h-ai/capacitor test
```

> Tests must mock `@capacitor/*` modules because they depend on native plugins.

Public operations, internal resource scopes and types include typechecked examples; see the [JSDoc conventions (Chinese)](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证). Typechecking does not prove device permissions or live FCM/APNs delivery.

## License

Apache-2.0
