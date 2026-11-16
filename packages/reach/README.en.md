# @h-ai/reach

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/cache](../cache/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/reldb](../reldb/README.en.md)

A notification module supporting multiple providers (email, SMS, API callbacks) at once. Templates bind to providers for scenario-based routing. Includes do-not-disturb (DND) policies and configuration-defined templates.

## Quick Start

### Dependencies

- `@h-ai/reldb` stores delivery logs and templates. Call `reldb.init()` first if you configure templates or want to save messages during quiet hours and send them later. If Reach cannot prepare the required tables or save templates, `reach.init()` closes the connections it just opened and returns `CONFIG_ERROR`. Immediate delivery without either feature can run without a database.
- `@h-ai/cache`: optional distributed locks for DND delay; enabled automatically when initialized.

#### Installation

```bash
pnpm add @h-ai/reach
```

Install `nodemailer` for email delivery.

#### Initialize multiple providers

```ts
import { core } from '@h-ai/core'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'

const runtime = core.module.createRuntime([
  {
    name: 'reldb',
    start: () => reldb.init({ type: 'sqlite', database: ':memory:' }),
    close: () => reldb.close()
  },
  {
    name: 'reach',
    start: () => reach.init({
      providers: [
        { name: 'local', type: 'console' }
      ],
      templates: [
        {
          name: 'welcome',
          provider: 'local',
          subject: 'Welcome',
          body: 'Hello {userName}'
        }
      ],
    }),
    close: () => reach.close()
  },
])
const initialized = await runtime.start()
if (!initialized.success)
  throw new Error(initialized.error.message)

let result: Awaited<ReturnType<typeof reach.send>>
try {
  result = await reach.send({
    to: 'user@example.com',
    template: 'welcome',
    vars: { userName: 'Alice' }
  })
}
catch (error) {
  const closed = await runtime.close()
  throw new AggregateError(closed.success
    ? [error]
    : [error, closed.error], 'Reach operation failed')
}
const closed = await runtime.close()
if (!closed.success) {
  throw new AggregateError(result.success
    ? [closed.error]
    : [result.error, closed.error], 'Reach cleanup failed')
}
if (!result.success)
  throw new Error(result.error.message)
```

This example uses the development Console provider. It records delivery metadata and does not send email or SMS. Configure SMTP, SMS or API providers below for real delivery; initialize optional persistence/shared cache when needed.

`reach.config` returns a **redacted configuration snapshot**. Embedded credentials in `api.url` / `endpoint`, every custom header value, SMTP `pass` and SMS keys are hidden. Gateway bodies are omitted. Deployment stores API headers entirely in private environment files, regardless of header names.

Provider failures retain the complete module error definition, including HTTP status. Raw SMTP/SMS responses are excluded from returned messages and causes; clients receive localized guidance while server logs retain diagnostic context.

Each template send uses one template snapshot for its subject, body and default provider, keeping concurrent edits from mixing versions. An explicit `provider` still overrides the template route.

## Configuration Reference

Generated projects define delivery channels, templates, quiet hours, and retry rules in `config/_reach.yml`. At startup, the application reads the file and passes the settings object to `reach.init(config)`.

See the [configuration reference](../../docs/usage/configuration/reach.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/reach.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `reach.init` / `reach.close` / `reach.config` / `reach.isInitialized` — Configure delivery channels such as email, SMS, or an HTTP gateway, and start or close the queue
- `reach.send` / `reach.template` — Send email, SMS or API notifications and render templates
- `reach.queue` — Check delivery results and handle messages that exhausted retries or have an unconfirmed result

## Data Structures

See the [data reference](../../docs/usage/data/reach.md) in Chinese for notification jobs, results, dead letters, idempotency records and shared locks.

## Development and Testing

```bash
pnpm --filter @h-ai/reach test
```

`tests/reach-repository-send-log-databases.test.ts` starts isolated PostgreSQL 16.15 / MySQL 8.4.11 containers through Testcontainers and removes them afterward. A reachable Docker API is required. For Podman, point `DOCKER_HOST` at its compatible socket; rootless environments can set `TESTCONTAINERS_RYUK_DISABLED=true` as required by Testcontainers.

## License

Apache-2.0
