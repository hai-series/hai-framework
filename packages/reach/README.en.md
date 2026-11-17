# @h-ai/reach

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/cache](../cache/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/reldb](../reldb/README.en.md)

A notification module supporting multiple providers (email, SMS, API callbacks) at once. Templates bind to providers for scenario-based routing. Includes do-not-disturb (DND) policies and configuration-defined templates.

## Quick Start

[Open the quick-start guide](../../docs/usage/function/reach.en.md#quick-start).

## Configuration Reference

Generated projects define delivery channels, templates, quiet hours, and retry rules in `config/_reach.yml`. At startup, the application reads the file and passes the settings object to `reach.init(config)`.

See the [configuration reference](../../docs/usage/configuration/reach.en.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/reach.en.md#api-reference) for entry points, inputs, results and examples (Chinese).

## Data Structures

See the [data reference](../../docs/usage/data/reach.en.md) in Chinese for notification jobs, results, dead letters, idempotency records and shared locks.

## Development and Testing

```bash
pnpm --filter @h-ai/reach test
```

`tests/reach-repository-send-log-databases.test.ts` starts isolated PostgreSQL 16.15 / MySQL 8.4.11 containers through Testcontainers and removes them afterward. A reachable Docker API is required. For Podman, point `DOCKER_HOST` at its compatible socket; rootless environments can set `TESTCONTAINERS_RYUK_DISABLED=true` as required by Testcontainers.

## License

Apache-2.0
