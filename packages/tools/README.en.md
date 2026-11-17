# @h-ai/tools

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

Model-independent tool definitions, validation, registration and authorized execution. The lightweight entry works in Node and browsers without initialization. `@h-ai/tools/server` provides recoverable services and artifact/job factories using Runner and host authorization.

## Quick Start

Install with pnpm: `pnpm add @h-ai/tools zod`.

[Minimal integration and custom tools](../../docs/usage/function/tools.en.md#quick-start)

## Configuration Reference

[Definitions, execution and enablement](../../docs/usage/configuration/tools.en.md)

## Features

[Public operations and model adapters](../../docs/usage/function/tools.en.md)

## Data Structures

[Registry and execution data ownership](../../docs/usage/data/tools.en.md)

## Development and Testing

```sh
pnpm --filter @h-ai/tools typecheck
pnpm --filter @h-ai/tools lint
pnpm --filter @h-ai/tools build
pnpm --filter @h-ai/tools test
pnpm --filter @h-ai/tools test:jobs
```

## License

Apache-2.0
