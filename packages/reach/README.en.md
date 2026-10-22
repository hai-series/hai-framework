# @h-ai/reach

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/cache](../cache/README.en.md) · [@h-ai/core](../core/README.en.md) · [@h-ai/reldb](../reldb/README.en.md)

## Introduction

A notification module supporting multiple providers (email, SMS, API callbacks) at once. Templates bind to providers for scenario-based routing. Includes do-not-disturb (DND) policies and configuration-defined templates.

Template sends need only `template`, `to` and `vars`; the provider comes from the template. An explicit `provider` still overrides it. Direct sends require a provider; omitting it returns a failed HaiResult.

## Core features

| Provider     | Channel | Description                                        |
| ------------ | ------- | -------------------------------------------------- |
| `console`    | General | Console output (development/tests)                 |
| `smtp`       | Email   | SMTP email (requires nodemailer)                   |
| `aliyun-sms` | SMS     | Alibaba Cloud SMS through HTTP API, without an SDK |
| `api`        | General | HTTP API callback (generic webhook)                |

## Getting started

### Dependencies

- `@h-ai/reldb`: persistence for delivery logs and templates. With `dnd.enabled: true` and `strategy: delay`, initialize it first and ensure the queue table is available; otherwise `reach.init()` returns `CONFIG_ERROR`. Optional for other sends.
- `@h-ai/cache`: optional distributed locks for DND delay; enabled automatically when initialized.

### Quick start

#### Installation

```bash
pnpm add @h-ai/reach
```

Install `nodemailer` for email delivery.

#### Initialize multiple providers

```ts
import { reach } from '@h-ai/reach'

const initialized = await reach.init({
  providers: [{ name: 'local', type: 'console' }],
  templates: [{ name: 'welcome', provider: 'local', subject: 'Welcome', body: 'Hello {userName}' }],
})
if (!initialized.success)
  throw new Error(initialized.error.message)
try {
  const result = await reach.send({
    to: 'user@example.com',
    template: 'welcome',
    vars: { userName: 'Alice' },
  })
  if (!result.success)
    throw new Error(result.error.message)
}
finally {
  await reach.close()
}
```

This example uses the development Console provider. It records delivery metadata and does not send email or SMS. Configure SMTP, SMS or API providers below for real delivery; initialize optional persistence/shared cache when needed.

`reach.config` returns a **redacted configuration snapshot**. Embedded credentials in `api.url` / `endpoint`, `headers.Authorization`, SMTP `pass`, SMS keys, and other secrets are hidden automatically.

### Configuration

#### Console (development/tests)

```ts
const config = { name: 'dev', type: 'console' }
```

#### SMTP

| Field    | Type      | Required | Default | Description             |
| -------- | --------- | -------- | ------- | ----------------------- |
| `name`   | `string`  | ✅       | —       | Provider name           |
| `type`   | `string`  | ✅       | —       | Fixed `'smtp'`          |
| `host`   | `string`  | ✅       | —       | SMTP server address     |
| `port`   | `number`  | —        | `465`   | SMTP port               |
| `secure` | `boolean` | —        | `true`  | Whether to use TLS      |
| `user`   | `string`  | —        | —       | Authentication username |
| `pass`   | `string`  | —        | —       | Authentication password |
| `from`   | `string`  | ✅       | —       | Sender address          |

#### Alibaba Cloud SMS

| Field             | Type     | Required | Default                 | Description          |
| ----------------- | -------- | -------- | ----------------------- | -------------------- |
| `name`            | `string` | ✅       | —                       | Provider name        |
| `type`            | `string` | ✅       | —                       | Fixed `'aliyun-sms'` |
| `accessKeyId`     | `string` | ✅       | —                       | AccessKey ID         |
| `accessKeySecret` | `string` | ✅       | —                       | AccessKey Secret     |
| `signName`        | `string` | ✅       | —                       | SMS signature        |
| `endpoint`        | `string` | —        | `dysmsapi.aliyuncs.com` | API endpoint         |

#### API callbacks

| Field     | Type                     | Required | Default | Description             |
| --------- | ------------------------ | -------- | ------- | ----------------------- |
| `name`    | `string`                 | ✅       | —       | Provider name           |
| `type`    | `string`                 | ✅       | —       | Fixed `'api'`           |
| `url`     | `string`                 | ✅       | —       | HTTP(S) callback URL    |
| `method`  | `'POST' \| 'PUT'`        | —        | `POST`  | HTTP method             |
| `headers` | `Record<string, string>` | —        | —       | Custom request headers  |
| `timeout` | `number`                 | —        | `10000` | Timeout in milliseconds |

API callback addresses are trusted server configuration. Logs contain only the callback origin, not URL credentials, query parameters, recipients, or third-party failure bodies. For tenant/user-supplied addresses, applications must enforce a domain allowlist; enterprise deployments should also block internal metadata access through egress proxies or network policies.

#### DND (do not disturb)

| Field      | Type                   | Required | Default   | Description                           |
| ---------- | ---------------------- | -------- | --------- | ------------------------------------- |
| `enabled`  | `boolean`              | —        | `false`   | Enable DND                            |
| `strategy` | `'discard' \| 'delay'` | —        | `discard` | discard: drop / delay: send after DND |
| `start`    | `string`               | —        | `00:00`   | Start time (HH:mm)                    |
| `end`      | `string`               | —        | `00:00`   | End time (HH:mm)                      |

`delay` returns a successful `HaiResult` containing `{ success: true, deferred: true, queueId }` only after the database confirms the insert. This means queued, awaiting delivery. The receipt UUID is stored in `hai_reach_send_log.queue_id`; its row tracks `status` (`pending` / `processing` / `sent`). Missing storage, disconnection, or insertion failure never produces deferred success; enqueue failures return `SEND_FAILED`. After restart, another node connected to the same database with the same Provider name can resume delivery outside DND. Optional log failures after an immediate send do not report an already delivered message as failed.

```ts
const result = await reach.send(message)
if (!result.success)
  throw new Error(result.error.message)
if (result.data.deferred) {
  // Save the receipt for tracking; delivery is still pending.
  await savePendingReceipt(result.data.queueId)
}
```

### Error handling

All operations return `HaiResult<T>`. Error codes are defined in `HaiReachError`:

| Error code                             | code            | Description               |
| -------------------------------------- | --------------- | ------------------------- |
| `HaiReachError.SEND_FAILED`            | `hai:reach:001` | Delivery failed           |
| `HaiReachError.TEMPLATE_NOT_FOUND`     | `hai:reach:002` | Template not found        |
| `HaiReachError.TEMPLATE_RENDER_FAILED` | `hai:reach:003` | Template rendering failed |
| `HaiReachError.INVALID_RECIPIENT`      | `hai:reach:004` | Invalid recipient         |
| `HaiReachError.PROVIDER_NOT_FOUND`     | `hai:reach:005` | Provider not registered   |
| `HaiReachError.DND_BLOCKED`            | `hai:reach:006` | Dropped by DND            |
| `HaiReachError.NOT_INITIALIZED`        | `hai:reach:010` | Not initialized           |
| `HaiReachError.UNSUPPORTED_TYPE`       | `hai:reach:011` | Unsupported type          |
| `HaiReachError.CONFIG_ERROR`           | `hai:reach:012` | Invalid configuration     |

```ts
const result = await reach.send({ provider: 'email', to: 'user@example.com', body: 'hello' })
if (!result.success) {
  // result.error.code / result.error.message
}
```

### Distributed locks

Across nodes, flushing pending DND-delay messages is protected by `@h-ai/cache` distributed locks, allowing only one node to flush at a time.

- Uses `cache.lock.acquire('reach:flush-pending')` with a 300-second TTL.
- Claims pending records in batches. In-progress records expire, allowing another node to take over after failure and reducing duplicate delivery risk.
- Without initialized `@h-ai/cache`, distributed locking is disabled automatically; single-node operation continues.
- A stable process-level owner identifier prevents releasing another owner's lock.

## Development and testing

```bash
pnpm --filter @h-ai/reach test
```

## License

Apache-2.0
