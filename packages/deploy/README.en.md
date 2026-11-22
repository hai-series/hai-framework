# @h-ai/deploy

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

Deploy existing images or Vercel prebuilt output, including complete offline bundles, selected service updates, SSH automation and platform upload scripts. The SDK consumes artifacts; CLI --build explicitly orchestrates build then deployment.

## Quick Start

Install with pnpm: `pnpm add @h-ai/deploy`.

[Open the quick-start guide](../../docs/usage/function/deploy.en.md#quick-start).

## Configuration Reference

Set deployment targets in the project’s `hai.json.deploy`. When you run `hai deploy --env prod`, the CLI reads deployment variables for prod. Keep the application’s connection settings and credentials in the configuration for that environment.

See the [configuration reference](../../docs/usage/configuration/deploy.en.md) for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/deploy.en.md#api-reference) for entry points, inputs, results and examples.

Automation can share the CLI build receipt and execute and verify staged releases by their persisted deployment ID. [Staged release workflow](../../docs/usage/function/deploy.en.md#programmatic-release-verification)

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/deploy.en.md) for artifacts, successful baselines, state, environment files and middleware data.

## Development and Testing

```sh
pnpm --filter @h-ai/deploy typecheck
pnpm --filter @h-ai/deploy lint
pnpm --filter @h-ai/deploy build
pnpm --filter @h-ai/deploy test
pnpm --filter @h-ai/deploy test:e2e
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:deploy-gates
```

Real deployment selects API, SSR, static mobile and fullstack representatives. Admin covers the SSR Dockerfile and production deployment branch shared by website/h5; all application types retain their own installation, compilation and HTTP/browser acceptance in the eight scaffold scenarios. Measured resource contention keeps scaffold and generated-route runtime in sequential batches; three smaller CLI gates can share the runtime batch with at most two file workers. Generated scenarios reuse the complete E2E build while preserving production build isolation and actual output checks. CLI deployment gates preserve authentication/transport, incremental updates, damaged artifacts and rollback, and run the production Nginx version against a public deployment bundle with `nginx -t`. Fixtures enable init and verify that adopted orphan PIDs actually disappear.

Run actual generated projects and SSH/manual deployment, including an isolated registry environment, incremental updates, damaged archives, same-version releases and failed health checks. Clean only test-owned projects, images, containers, logs and processes in finally/teardown.

`test:e2e` builds the current package and enables both Linux lock and process gates in a child process, running the files serially. Root `pnpm e2e` includes this entry. The gates require reachable Podman (preferred) or Docker to run the public API's generated `apply.sh`: concurrent execution, child-held locks after killing the parent, full termination and restart recovery. Compose/HTTP use deterministic fixtures; this does not replace real service deployment acceptance.

Process gates run with `pnpm --filter @h-ai/deploy exec vitest run tests/deploy-command-process.test.ts tests/deploy-secret-masker.test.ts`. With the same `HAI_DEPLOY_E2E=1`, build deploy first and run `tests/deploy-command-runtime.e2e.test.ts` for real Linux/OpenSSH, published dist, remote continuation/completion and local process groups. The fixture needs network access to install sshd; Compose/HTTP are deterministic fixtures. It scales deployment deadlines to 2500 milliseconds and pauses output consumption to inject lost acknowledgments.

Deployment fixtures inspect pinned public base images and pull only confirmed missing images; HAI_DEPLOY_E2E_MIRROR remains available. Public image caches are never cleanup targets. A successful create records its container ID before asynchronous APT/pip/sshd preparation inside a private PID namespace. Preparation errors, deadlines and cooperative cancellation wait for the local client to close, then remove and verify that exact owned ID; only the nested Podman fixture is privileged. HAI_DEPLOY_E2E_APT_MIRROR accepts a mirror hostname and keeps HTTPS. Ownership tests use run-specific private tags of pinned public images while preserving foreign same-content tags, retag protection, dynamic ports and external sentinels. A lost create acknowledgment without a trusted ID, or a forcibly terminated test process, remains unknown and never authorizes adoption by name or label.

## License

Apache-2.0
