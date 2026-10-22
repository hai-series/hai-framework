# @h-ai/deploy

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

## Introduction

Deploy existing images or Vercel prebuilt output, including complete offline bundles, selected service updates, SSH automation and platform upload scripts. The SDK consumes artifacts; CLI --build explicitly orchestrates build then deployment.

## Core features

- Build, package, upload over SSH, start services and check access from one CLI command.
- Include application and self-hosted middleware images, or update selected services.
- Deliver offline tar bundles with Windows/Linux/macOS operator scripts, step results and recovery on failure.

## Getting started

### Prepare build artifacts

Projects include deployment tooling by default; use `hai create my-app --no-deploy` to opt out. The deployment SDK is a development dependency and is excluded from runtime images.

```sh
pnpm build
pnpm build --target docker
pnpm build --target docker --images web
pnpm build --target desktop --platform windows --arch x64
```

#### Build options

`--target` selects compile (default), docker or desktop. `--images app|web|app,web` selects images. `--runtime auto|podman|docker` selects the local engine; auto prefers reachable Podman. `--network` overrides build networking, `--no-http-proxy` disables inherited Podman proxies, and `--sqlite-prebuild-mirror` selects a trusted HTTP(S) binary mirror. Native `--platform` and `--arch` require the matching host SDK and Rust toolchain. Builds do not load deployment environments or runtime secrets.

#### Describe packaging in hai.build.json

```json
{ "images": [{ "name": "app", "context": ".", "dockerfile": "images/app.Dockerfile", "containerPort": 3000 }, { "name": "web", "context": ".", "dockerfile": "images/web.Dockerfile", "containerPort": 8080 }] }
```

Each image has its own Dockerfile. Web runtime assets live in images/web/. Dockerfiles retain internal build/runtime stages; configuration does not select stages. Omit absent images and add desktop directories only for native projects.

Generated `web.conf` sets `client_max_body_size 2129920` (2 MiB + 32 KiB) for the API location and disables `proxy_request_buffering` / `proxy_buffering`. This admits encrypted JSON produced from the transport's 1 MiB plaintext budget; the application still checks its smaller 16 KiB handshake, 4 KiB public key and 1 MiB plaintext budgets incrementally. Custom proxies must admit that ciphertext budget and propagate cancellation. Raising a proxy limit does not replace serv/kit's bounded reads; large uploads need an explicit separate route and size policy.

Bodyless authenticated envelopes use X-Hai-Transport. Generated proxies set large_client_header_buffers 4 32k and proxy_buffer_size 32k to admit these headers; custom proxies must preserve and admit them.

Dependency inputs are prepared under images/dependencies/ from package manifests, local archives and patches. Combine pnpm store caching with stable dependency layers. Source changes should reuse downloaded packages. Empty caches still permit online builds. Windows node_modules cannot supply Linux native dependencies. Offline builds additionally require base images, tools and matching ABI/architecture/libc binaries.

The root package.json.version identifies the application. `.hai/build/docker/<buildId>/` contains manifest format 3, selected image archives and SHA-256. partial marks incremental builds and hasWeb records topology. appContainerPort and webContainerPort retain explicitly configured app/web listening ports, including the image left out of a partial build. Omitted ports keep the deployment defaults. Rebuilding the same application version is allowed; unique build IDs/image references distinguish contents. Publish the local build pointer only after all exports succeed. Pin base images, middleware and tools; do not use latest.

### Deploy artifacts

#### Prepare the environment and destination

Prepare `.env.<environment>` and the service config/_deploy.yml. Fullstack deploy scripts point to packages/<project>-serv; API workspaces use apps/<project>-service. Artifact lookup remains rooted at the build configuration.

```yaml
provider:
  type: docker-ssh
  expose:
    hostPort: 18080
container:
  s3Engine: rustfs
```

The wizard asks for server address, SSH user, optional key/fingerprint files and public port using readable labels. Reuse valid settings; local connection settings go to .env.local, private keys are referenced by path. Bundle-only does not require SSH.

#### Configure only the middleware the application needs

Runtime lockfile dependencies and configuration determine middleware. Choose defaults, custom connections or keep settings. --skip-middleware skips configuration/provisioning. SQLite, memory cache and local storage need no external images. Complete bundles automatically include self-hosted middleware images. External services still require reachable destinations; cloud provisioning is not an offline operation.

#### Deployment options

--env/--env-dir select configuration. --build builds selected application images before packaging. --services selects Compose services; --artifact-dir selects existing artifacts. --bundle-only creates a tar and platform scripts without SSH. --runtime selects the local build/export engine; --output selects the version-suffixed archive name. --yes uses valid settings without interaction and reports missing required values.

#### When the machines can connect: automatic deployment

```sh
pnpm run deploy --env prod --build
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<buildId>
pnpm run deploy --env prod --build --services web
```

Partial updates require a successful full server installation and matching ports/layout. Merge selected services into the server's successful baseline; preserve unselected services, settings and volumes. The deployment script first removes only the selected old containers by project and service labels, retaining their volumes. It then runs `compose up -d --no-deps --no-build --pull never --no-recreate web` to create replacements while other containers keep running, without project-wide down. storage-init is a one-time S3 bucket initialization task, executed only when storage initialization is selected.

Here `-d` starts in the background; `--no-deps` leaves dependencies untouched; `--no-build` prevents server builds; `--pull never` forbids registry pulls; `--no-recreate` preserves containers that still exist; the selected old containers were already removed by the script, so their replacements are created. `web` is a Compose service name, not an image tag; separate multiple services with spaces.

`storage-init` uses the application's S3 SDK to wait for storage and create a missing bucket without deleting data. Start storage first, then run `compose up --no-deps --no-build --pull never --force-recreate --exit-code-from storage-init storage-init`. Start selected application services only after initialization exits with zero. For partial updates, the script first removes the old storage-init container and uses `--no-recreate` instead of `--force-recreate` here, preserving running application containers. Updating only `storage` still requires an artifact containing the `app` image for initialization. If the most recent build contains only Web, select the original complete artifact with `--artifact-dir`, or run `pnpm build --target docker --images app` first. This image is used for initialization without updating the running `app` service.

#### When the machines cannot connect: copy a bundle

```sh
pnpm run deploy --env prod --build --bundle-only --output release-prod.tar
```

Application 1.2.3 produces release-prod-1.2.3.tar and an adjacent -deploy/ directory. The tar includes selected application/middleware images, configurations, private environment files, checksums, README and apply.sh. Run deploy.ps1 on Windows or deploy.sh on Linux/macOS to upload using saved SSH settings and execute the same server workflow. After moving to another computer or operating system, update both the private key and known-hosts paths to files on that computer. On Windows, edit deploy-target.json; on Linux/macOS, set HAI_DEPLOY_IDENTITY_FILE and HAI_DEPLOY_KNOWN_HOSTS_FILE.

On isolated Linux servers, extract into a separate package directory and run `sh apply.sh`, optionally passing the deployment root. Every failed step exits nonzero. Image loading, service startup and HTTP checks are distinct steps. result-<deploymentId>.json records the result; current changes only after successful checks. Reapplying the same deployment ID stops clearly; a newly generated bundle for the same application version is allowed. Failed updates attempt to restore selected containers and configuration while preserving data volumes and diagnostics. Data already written by the application is not rolled back.

#### Before going fully offline

Complete bundles include self-hosted middleware archives and matching architecture; server startup never pulls images. Linux needs Docker/Podman, Docker Compose v2 or podman-compose 1.6.0+ (supports --pull never), sh, tar, sha256sum, awk, curl and filesystem/container permissions. Protect private bundle contents. Keep volume identities stable across versions. Verify actual offline startup, login, refresh, restart and persistence. HTTPS, certificates, DNS and external services need separate preparation.

### SDK

```ts
import { deploy } from '@h-ai/deploy'

const initialized = await deploy.init({ provider: { type: 'docker-ssh', expose: { hostPort: 18080 } } })
if (!initialized.success)
  throw new Error(initialized.error.message)
try {
  const result = await deploy.deployApp('./packages/demo-serv', {
    environment: 'prod',
    envDir: '.',
    bundleOnly: true,
    artifactDir: './.hai/build/docker/<buildId>',
    runtime: 'auto',
  })
  if (!result.success)
    throw new Error(result.error.message)
  // result.data.bundlePath / instructions; packaged does not mean server ready.
}
finally {
  await deploy.close()
}
```

`selectedServices: ['web']` selects a partial update. `onProgress` receives actual packaging/server stages. `deploy.scan` and `deploy.credentials.*` are available before init. Check HaiResult.success before using data. Vercel uploads existing .vercel/output through the prebuilt API and requires internet; it does not provide offline or Compose partial deployment.


Command execution redacts correctly decoded UTF-8 logical streams, including known secrets split across stdout/stderr chunks. Successful captures, errors and output callbacks use the same boundary. Internal command callers must enumerate sensitive literals in `secrets`, including separately encoded or transformed forms. Each stream captures only its last 1 Mi characters by default; `maxCaptureChars` accepts 1 through 16 Mi characters. Check `stdoutTruncated` / `stderrTruncated` before parsing structured output. Async `onOutput` callbacks receive all safe stdout in order with pipe backpressure; deployment progress parses only the first 512 characters of each line. Total secret length is limited to 1 Mi UTF-16 units; invalid redaction fails closed. A timeout reports failure; remote process termination still requires confirmation.

## Development and testing

```sh
pnpm --filter @h-ai/deploy typecheck
pnpm --filter @h-ai/deploy lint
pnpm --filter @h-ai/deploy build
pnpm --filter @h-ai/deploy test
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:deploy-gates
```

Run actual generated projects and SSH/manual deployment, including an isolated registry environment, incremental updates, damaged archives, same-version releases and failed health checks. Clean only test-owned projects, images, containers, logs and processes in finally/teardown.

## License

Apache-2.0
