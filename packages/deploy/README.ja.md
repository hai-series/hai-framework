# @h-ai/deploy

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

deploy は既存の成果物だけを配布します。ソースのコンパイルやイメージのビルドは行いません。同じイメージを複数環境へ配布できます。

作成、開発、ビルド、デプロイの全体は[使用ガイド](../../docs/usage/README.ja.md)を参照してください。本ページではデプロイの準備、SDK、モジュール開発を説明します。

## Build

Node `^22.22.2 || ^24.15.0 || >=26.0.0`, pnpm 12.11.2; Windows: `pnpm.cmd`. Node 20 / pnpm 9.5.0 are unsupported.

```sh
pnpm build                               # source only; no environment selection
pnpm build --target docker               # reachable Podman first, then Docker
pnpm build --target docker --runtime docker
pnpm build --target desktop --platform windows --arch x64
```

`hai.build.json` describes Docker targets and Tauri directories. Images and SHA-256 manifest are under `.hai/build/docker/<buildId>`. API/Web share one build ID; latest changes only after complete success. Tauri runs on the matching Windows/Linux/macOS host with Rust targets, SDKs and packaging tools installed; installers are under `src-tauri/target/<target>/release/bundle`. Build has no dev/test/prod mode and excludes deployment credentials.

## デプロイ

```sh
pnpm run deploy --env test
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<buildId> --skip-middleware
pnpm run deploy --env prod --bundle-only --output release-prod.tar
# equivalent fullstack CLI invocation
pnpm exec hai deploy packages/my-app-serv --env prod --env-dir .
```

Requires matching `@h-ai/cli` / `@h-ai/deploy`, `_deploy.yml`, lockfile and `.env.<mode>`. Missing environment files stop deployment. Public `.env`, `.env.dev/test/prod` and documented `.env.example` are committed; private `.env.local` is ignored. Priority: process > local > mode > base. SSH fields/tokens can be stored in private `HAI_DEPLOY_PROVIDER` JSON. Bundle-only needs no SSH config or local container engine.

The wizard traverses only lockfile runtime dependencies, excluding dev/peer. Select default, custom or keep for each middleware; `--skip-middleware` bypasses all middleware work. Compose supports PostgreSQL/MySQL/Redis/RustFS/MinIO/Qdrant/pgvector/Chroma/OpenLDAP/Mailpit. Optional cloud provisioning supports Neon/Upstash/R2/Resend/Aliyun SMS and requires network access.

A single private tar contains Compose, runtime env, app/web images, optional Web proxy, checksums, README and `start-<mode>.sh`. SSH uploads this tar, extracts and starts it remotely. No source upload or remote build. With app/web images, Web exposes the public port and proxies the internal API on the same origin; no API secrets enter Web. Online success requires both health checks. Vercel uploads existing `.vercel/output` , sets runtime variables and never builds locally.

## Offline / manual transfer

Prepare supported Node/pnpm and installed project CLI/SDK dependencies on Windows, plus the complete prebuilt image directory for the Linux server architecture. Deploy requires tar locally; automatic mode also needs ssh/scp, trusted host keys and reachable SSH/application ports. Bundle-only works with removable media and no network between machines.

Linux needs Docker/Podman, compose, sh, tar, sha256sum, writable deployment/data directories and container permissions. Middleware images must already be loaded with the exact names/tags printed in the bundle README; app/web archives are included. Missing images stop startup without downloading. Custom connections require reachable running services, accounts, databases/buckets and credentials.

```sh
mkdir -p release && chmod 700 release
tar -xf release-prod.tar -C release
cd release
HAI_DEPLOY_PROVIDER_REMOTE_RUNTIME=docker sh start-prod.sh
```

The tar contains secrets: restrict permissions and never commit it. `packaged` means no server has been started or health-checked. After manual startup verify compose ps/logs, Web, /health, real login/refresh, restart and persistence. Production sessions need HTTPS, trusted certificates, DNS and correct CORS; TLS is managed separately.

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
