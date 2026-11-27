# @h-ai/tools-runner

[简体中文](./README.md) · [English](./README.en.md) · [日本語](./README.ja.md)

Register Tools with an application-owned Runner in Node.js. The adapter provides persistent receipts, progress queries, recovery, and cancellation. Fixed container jobs run in environments registered by the host.

## Quick Start

Install the example dependencies with `pnpm add @h-ai/core @h-ai/reldb @h-ai/runner @h-ai/tools @h-ai/tools-runner`. Initialize RelDB and Runner, then register the tool service with `toolsRunner.createService({ ...options, runner })`. [Dependencies and startup order](../../docs/usage/function/tools-runner.en.md#module-dependencies) · [Runnable task service](../../docs/usage/function/tools-runner.en.md#service-example)

## Configuration Reference

The host supplies the service ID, enabled tools, and authorization policy to the factory. The injected Runner manages container environments, limits, and retention. [Tool service configuration](../../docs/usage/configuration/tools-runner.en.md) · [Runner configuration](../../docs/usage/configuration/runner.en.md)

## Features

- `toolsRunner.createService(options)` creates a service that submits, inspects, recovers, and cancels jobs. Authorization is checked at both submission and execution.
- `toolsRunner.createJobTools(options)` provides container-backed document, Office, OCR, web, preview, and video tools. Prepare the images before deployment. [Container job images and protocol](../tools/jobs/README.md)

## Data Structures

Tool jobs use Runner execution, event, and idempotency records. The application stores artifacts. [Tool receipts and data boundaries](../../docs/usage/data/tools-runner.en.md) · [Runner records](../../docs/usage/data/runner.en.md)

## Development and Testing

```sh
pnpm --filter @h-ai/tools-runner typecheck
pnpm --filter @h-ai/tools-runner lint
pnpm --filter @h-ai/tools-runner build
pnpm --filter @h-ai/tools-runner test
```

## License

Apache-2.0
