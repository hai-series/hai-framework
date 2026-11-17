# @h-ai/runner

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · [Relational database](../reldb/README.en.md) · [AI agents](../ai/README.en.md)

Runner executes managed agent workers and tool jobs on Node.js. API nodes submit work, read status, and request cancellation. Executor nodes claim work and own its containers. A relational database shares tasks, leases, events, and execution results.

## Quick Start

Install with pnpm: `pnpm add @h-ai/runner @h-ai/reldb`.

[Open the quick-start guide](../../docs/usage/function/runner.en.md#quick-start).

## Configuration Reference

At startup, use `runner.init(options)` to decide whether this node executes tasks, which container environments it may use, and how long to keep completed tasks. Disable execution on nodes that only submit and query tasks.

See the [configuration reference](../../docs/usage/configuration/runner.en.md) for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/runner.en.md#api-reference) for entry points, inputs, results and examples.

## Data Structures

See the [data reference](../../docs/usage/data/runner.en.md) for persistent tasks, execution leases, events, workspaces and artifacts.

## Development and Testing

Run from the repository root (use `pnpm.cmd` in PowerShell). SQLite covers task flow, PostgreSQL and MySQL cover shared ownership, and Podman/Docker cover actual container limits, cancellation, and artifacts. Set `HAI_TEST_CONTAINER_ENGINE` to choose the container engine. Database tests also need a Docker-compatible Testcontainers endpoint. Set `HAI_TEST_RUNNER_ARTIFACT_IMAGE` to a prebuilt tool test image to enable artifact and cross-node warm-pool tests.

```sh
pnpm --filter @h-ai/runner typecheck
pnpm --filter @h-ai/runner lint
pnpm --filter @h-ai/runner build
pnpm --filter @h-ai/runner test
```

## License

Apache-2.0
