# @h-ai/payment

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/audit](../audit/README.en.md) · [@h-ai/core](../core/README.en.md)

A unified payment module for WeChat Pay, Alipay, and Stripe, with provider-based server processing and payment initiation across clients.

## Quick Start

[Open the quick-start guide](../../docs/usage/function/payment.md#最小接入示例) (Chinese).

## Configuration Reference

Generated projects define the accounts and server-side credentials for each payment channel in `config/_payment.yml`. At startup, the application reads the file and passes the settings object to `payment.init(config)`.

See the [configuration reference](../../docs/usage/configuration/payment.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/payment.md#api-reference) for entry points, inputs, results and examples (Chinese).

## Data Structures

See the [data reference](../../docs/usage/data/payment.md) in Chinese for provider state, merchant order mappings and notification idempotency.

## Development and Testing

```bash
pnpm --filter @h-ai/payment typecheck
pnpm --filter @h-ai/payment lint
pnpm --filter @h-ai/payment build
pnpm --filter @h-ai/payment test
node scripts/check-module-jsdoc.mjs --package payment
pnpm --filter @h-ai/payment exec vitest run tests/payment-provider-alipay.test.ts tests/payment-provider-wechat.test.ts tests/payment-provider-stripe.test.ts
```

Declaration examples use the actual `@h-ai/payment` / `@h-ai/payment/client` entries and distinguish configuration input from parsed output, and `HaiResult.success` from confirmed payment or refund status. Signing, protocol parsing, and durable operation helpers are marked as internal context and are not application deep-import APIs. Run `node scripts/check-module-jsdoc.mjs --package payment` to check coverage and example types. It does not execute real payments, network calls, device bridges, or fulfillment; verify those integrations separately. See the [module JSDoc guide](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## License

Apache-2.0
