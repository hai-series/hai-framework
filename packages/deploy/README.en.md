# @h-ai/deploy

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

Deploy consumes existing artifacts. It never compiles source or builds images. Build once, deploy the same images to multiple environments.

Follow the [usage guide](../../docs/usage/README.en.md) for the complete creation, development, build, and deployment workflow. This page focuses on deployment requirements, the SDK, and module development.

## Build

Node `^22.22.2 || ^24.15.0 || >=26.0.0`, pnpm 12.11.2; Windows: `pnpm.cmd`. Node 20 / pnpm 9.5.0 are unsupported.

```sh
pnpm build                               # source only; no environment selection
pnpm build --target docker               # reachable Podman first, then Docker
pnpm build --target docker --runtime docker
pnpm build --target desktop --platform windows --arch x64
```

`hai.build.json` describes Docker targets and Tauri directories. Images and SHA-256 manifest are under `.hai/build/docker/<buildId>`. API/Web share one build ID; latest changes only after complete success. Tauri runs on the matching Windows/Linux/macOS host with Rust targets, SDKs and packaging tools installed; installers are under `src-tauri/target/<target>/release/bundle`. Build has no dev/test/prod mode and excludes deployment credentials.

Versions come from the application root package.json.version. For version 1.2.3, archives are app-1.2.3.tar/web-1.2.3.tar and Compose is docker-compose-1.2.3.yml. Manifest version: 2 is its format; appVersion is the application version. --output release-prod.tar becomes release-prod-1.2.3.tar, and Tauri receives the same root version. See the [complete guide](../../docs/usage/README.en.md) for defaults and examples.

## Deployment

```sh
pnpm run deploy --env test
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<buildId> --skip-middleware
pnpm run deploy --env prod --bundle-only --output release-prod.tar
# equivalent fullstack CLI invocation
pnpm exec hai deploy packages/my-app-serv --env prod --env-dir .
```

Requires matching `@h-ai/cli` / `@h-ai/deploy`, `_deploy.yml`, lockfile and `.env.<mode>`. Missing environment files stop deployment. Public `.env`, `.env.dev/test/prod` and documented `.env.example` are committed; private `.env.local` is ignored. Priority: process > local > mode > base. SSH fields/tokens can be stored in private `HAI_DEPLOY_PROVIDER` JSON. Bundle-only needs no SSH config or local container engine.

The wizard traverses only lockfile runtime dependencies, excluding dev/peer. Select default, custom or keep for each middleware; `--skip-middleware` bypasses all middleware work. Compose supports PostgreSQL/MySQL/Redis/RustFS/MinIO/Qdrant/pgvector/Chroma/OpenLDAP/Mailpit. Optional cloud provisioning supports Neon/Upstash/R2/Resend/Aliyun SMS and requires network access.

Optional `container.s3Engine` defaults to rustfs and chooses RustFS/MinIO only when creating a Compose S3 service. Existing custom S3 services are unaffected. Use `--skip-middleware` to bypass middleware setup; the SDK field is `skipMiddleware`.

A single private tar contains Compose, runtime env, app/web images, optional Web proxy, checksums, README and `start-<mode>.sh`. SSH uploads this tar, extracts and starts it remotely. No source upload or remote build. With app/web images, Web exposes the public port and proxies the internal API on the same origin; no API secrets enter Web. Online success requires both health checks. Vercel uploads existing `.vercel/output` , sets runtime variables and never builds locally.

## Offline / manual transfer

Prepare supported Node/pnpm and installed project CLI/SDK dependencies on Windows, plus the complete prebuilt image directory for the Linux server architecture. Deploy requires tar locally; automatic mode also needs ssh/scp, trusted host keys and reachable SSH/application ports. Bundle-only works with removable media and no network between machines.

Linux needs Docker/Podman, compose, sh, tar, sha256sum, writable deployment/data directories and container permissions. Middleware images must already be loaded with the exact names/tags printed in the bundle README; app/web archives are included. Missing images stop startup without downloading. Custom connections require reachable running services, accounts, databases/buckets and credentials.

```sh
mkdir -p release && chmod 700 release
tar -xf release-prod-1.2.3.tar -C release
cd release
HAI_DEPLOY_PROVIDER_REMOTE_RUNTIME=docker sh start-prod.sh
```

The tar contains secrets: restrict permissions and never commit it. `packaged` means no server has been started or health-checked. After manual startup, use `docker compose -f docker-compose-1.2.3.yml --env-file .env.runtime ps` (or logs), then verify Web, /health, real login/refresh, restart and persistence. Production sessions need HTTPS, trusted certificates, DNS and correct CORS; TLS is managed separately.

Prebuilt deployment needs no local container engine, Linux Node base image, compiler, CUDA or SQLite download. Fully offline **building** separately needs Linux base images, pnpm/Corepack, complete Linux dependency caches and SQLite prebuilds matching driver/ABI/architecture/libc. Windows node_modules are insufficient. Use `pnpm build --target docker --sqlite-prebuild-mirror http://trusted-host/better-sqlite3` when appropriate. No AI runtime dependency means no AI/CUDA installation. Cloud services are unsuitable offline. Prove offline behavior by actually disconnecting; online tests do not establish it.

## SDK / development

Call `deploy.init(config)`, check success, then `deploy.deployApp(appDir, { environment: 'prod', envDir: '.', artifactDir, bundleOnly: true })`, check success and finally `deploy.close()`. `deploy.scan` / credentials do not require init. Results return bundlePath/instructions for packaged mode, URL and health status for automatic deployment.

```sh
pnpm --filter @h-ai/deploy typecheck
pnpm --filter @h-ai/deploy lint
pnpm --filter @h-ai/deploy build
pnpm --filter @h-ai/deploy test
pnpm --filter @h-ai/cli test
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:deploy-gates
```

Deploy gates generate fullstack from current archives, build API/Web once, exercise SSH and manual bundle startup and run real browser flows. Tests clean temporary projects, images, containers, screenshots/reports and helper processes in finally/teardown even on failure. Native installer acceptance requires each OS. See [configuration and middleware](../cli/templates/skills/hai-deploy/middleware.md) and [complete examples](README.md).

Deploy gates do not forward host proxies by default. To download build dependencies through a proxy, set test-only `HAI_DEPLOY_E2E_CONTAINER_PROXY` (unset by default), for example `$env:HAI_DEPLOY_E2E_CONTAINER_PROXY='http://host.containers.internal:10808'` in PowerShell for Windows Podman. The address must be reachable from build containers; it is not written to application configuration or release images.

Test-only `HAI_DEPLOY_E2E_CONTAINER_NETWORK` is unset by default and forwards its value to build's `--network`. For example, rootless Podman can use `$env:HAI_DEPLOY_E2E_CONTAINER_NETWORK='pasta'`. Build and run networks may differ; verify the proxy address on the build network too.

On Windows, set test-only HAI_CLI_NATIVE_BUILD=1 (unset by default), then run `pnpm --filter @h-ai/cli test:scaffold-gates -t "fullstack scaffold"`. With Rust/MSVC/Windows SDK installed, it additionally builds the generated Tauri installer and checks that root version 2.4.6 appears in the exe filename. The temporary project and native output are cleaned automatically.
