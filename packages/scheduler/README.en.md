# @h-ai/scheduler

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md) · [@h-ai/reldb](../reldb/README.en.md)

Use `scheduler` to run JavaScript handlers or call HTTP endpoints on a cron schedule. It saves task settings and execution logs in the database and can call application callbacks before and after runs.

## Quick Start

Install with pnpm: `pnpm add @h-ai/scheduler @h-ai/reldb`.

[Open the quick-start guide](../../docs/usage/function/scheduler.en.md#quick-start).

## Configuration Reference

Generated projects define how often to check for work and how long a worker owns a task in `config/_scheduler.yml`. At startup, the application reads the file and passes the settings object to `scheduler.init(config)`.

See the [configuration reference](../../docs/usage/configuration/scheduler.en.md) for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/scheduler.en.md#api-reference) for entry points, inputs, results and examples.

## Data Structures

See the [data reference](../../docs/usage/data/scheduler.en.md) for tasks, execution logs, distributed leases and recovery state.

## Development and Testing

```bash
pnpm --filter @h-ai/scheduler test
```

Declaration JSDoc examples import real public entries. Internal repositories, the runner, compiler and cron helpers are marked as internal module context and are not root exports. Examples distinguish HaiResult, explicit cancellation rejection, and close returning Promise<void>; business status and log persistence remain separate, and log repair never reruns business work. Maintainers can run `node scripts/check-module-jsdoc.mjs --package scheduler` to check declaration coverage and real types. Compiling examples does not replace shared-database and independent-process validation.

## License

Apache-2.0
