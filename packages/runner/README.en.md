# @h-ai/runner

Runner hosts managed agent and tool containers. API nodes submit work and read status. Executor nodes claim work and own the containers and connections. A shared database holds tasks, ownership, cancellation requests, and events. The application authenticates users and applies business authorization.

## Start and submit

Initialize `@h-ai/reldb` before Runner. A single node can use SQLite. Multiple instances use shared PostgreSQL or MySQL with a stable nodeId per executor. API nodes can set `executor: false`. This example assumes the database is ready and uses a trusted server-side handler.

```ts
import { core } from '@h-ai/core'
import { runner } from '@h-ai/runner'

const scope = { tenantId: 'studio', userId: 'alice' }
const started = await runner.init({ nodeId: 'worker-east' })
if (!started.success)
  throw new Error(started.error.message)

try {
  const registration = runner.register('report.v1', async (input, context) => {
    const published = await context.emit({ phase: 'ready' })
    if (!published.success)
      throw new Error(published.error.message)
    return { summary: input }
  })
  if (!registration.success)
    throw new Error(registration.error.message)
  const accepted = await runner.submit({
    scope,
    kind: 'report.v1',
    idempotencyKey: 'report-2026-11',
    input: 'Monthly report',
  })
  if (!accepted.success)
    throw new Error(accepted.error.message)

  const task = await runner.get(scope, accepted.data.id)
  if (!task.success)
    throw new Error(task.error.message)
  void task.data.status
}
finally {
  const closed = await runner.close()
  if (!closed.success)
    core.logger.error('Runner shutdown failed', { code: closed.error.code })
}
```

Use `get` for status, `find` to recover a receipt by scope and idempotency key, `events` for paged sequence cursors, and `cancel` to request cancellation. The cancelled state is published after the container is stopped and cleanup is verified. A child task's `parentId` routes it to the node holding the connection. Child tasks have a separate control concurrency limit.

## Container environments and resources

Each `environments` entry supplies an ID, a locally available image digest, CPU cores, memory MiB, PID count, and scratch MiB. Callers select the environment by `environmentId` and can request lower limits. Executors claim work and reserve resources in the same database transaction. Queue and concurrency limits apply by scope and node.

Handlers use `context.start` to obtain process streams and exit information. Images require Linux cgroup v2 support, `/bin/sh`, and support for UID/GID 1000. The root filesystem is read-only. Runner assigns bounded tmpfs mounts at `/state`, `/workspace`, and `/tmp`, and copies launch files into `/state`. Networking is disabled by default. A registered internal network must pass the engine's internal-network check. Networked tasks should use a gateway configured for their trust boundary.

The executor holds credentials and native connections in memory. Inputs, events, and outputs accept bounded JSON. Pass business identifiers and object references in execution records. When an owner disappears or cleanup cannot be verified, Runner preserves the `unknown` state and resource reservation pending operator reconciliation.

Tool handlers can stage canonical Base64 files by basename in read-only `/input` using `inputs`. While the container is running, `artifact(name, maxBytes)` reads a regular file from `/output`. Total inputs and a single output are each limited to 50 MiB and remain subject to the scratch limit. Images that export artifacts provide `/usr/bin/python3`.

## Development

```bash
pnpm --filter @h-ai/runner typecheck
pnpm --filter @h-ai/runner lint
pnpm --filter @h-ai/runner build
pnpm --filter @h-ai/runner test
```

Tests use real SQLite, PostgreSQL, MySQL, and Docker/Podman containers. Set `HAI_TEST_CONTAINER_ENGINE` to select an engine. The PostgreSQL and MySQL tests use Testcontainers with that engine's Docker-compatible API.

## License

Apache-2.0
