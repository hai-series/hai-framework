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

#### Describe packaging in hai.json

```json
{
  "build": {
    "images": [
      {
        "name": "app",
        "context": ".",
        "dockerfile": "images/app.Dockerfile",
        "containerPort": 3000
      },
      {
        "name": "web",
        "context": ".",
        "dockerfile": "images/web.Dockerfile",
        "containerPort": 8080
      }
    ]
  },
  "deploy": {
    "provider": {
      "type": "docker-ssh",
      "expose": {
        "hostPort": "${HAI_DEPLOY_PROVIDER_EXPOSE_HOSTPORT:18080}"
      }
    },
    "container": {
      "s3Engine": "rustfs"
    }
  }
}
```

Each image has its own Dockerfile. Web runtime assets live in images/web/. Dockerfiles retain internal build/runtime stages; configuration does not select stages. Omit absent images and add desktop directories only for native projects.

Set `transport.maxPlaintextBytes` for both request and response JSON plaintext, measured in UTF-8 bytes: default 1 MiB, integer range 1 KiB–64 MiB. Clients learn the server limit during key exchange. `resolveTransportBodyLimits()` derives encrypted/proxy bytes as twice the plaintext limit plus 32 KiB. Handshake, public-key, header and replay constraints remain independent. Oversized streams are cancelled and readers released: requests return 413; oversized responses return an encrypted 500 capacity error, recognized as `TransportBodyTooLargeError` / `hai:crypto:070`. Full and app-only incremental deployments derive the proxy limit from resolved `_serv.yml`. Capacity changes recreate the proxy using its installed Web image and restore the prior configuration on health failure. SvelteKit deployments also derive adapter-node `BODY_SIZE_LIMIT` from `_kit.yml`. [Transport capacity and upgrade](../crypto/TRANSPORT-CAPACITY.md)。

Bodyless authenticated envelopes use X-Hai-Transport. Generated proxies set large_client_header_buffers 4 32k and proxy_buffer_size 32k to admit these headers; custom proxies must preserve and admit them.

Dependency inputs are prepared under images/dependencies/ from package manifests, local archives and patches. Combine pnpm store caching with stable dependency layers. Source changes should reuse downloaded packages. Empty caches still permit online builds. Windows node_modules cannot supply Linux native dependencies. Offline builds additionally require base images, tools and matching ABI/architecture/libc binaries.

The root package.json.version identifies the application. `.hai/build/docker/<buildId>/` contains manifest format 3, selected image archives and SHA-256. partial marks incremental builds and hasWeb records topology. appContainerPort and webContainerPort retain explicitly configured app/web listening ports, including the image left out of a partial build. Omitted ports keep the deployment defaults. Rebuilding the same application version is allowed; unique build IDs/image references distinguish contents. Publish the local build pointer only after all exports succeed. Pin base images, middleware and tools; do not use latest.

### Deploy artifacts

#### Prepare the environment and destination

Prepare `.env.<environment>` and the project root `hai.json`, with image/native configuration in `build` and application deployment in `deploy`. Fullstack scripts still point to packages/<project>-serv, and API workspaces to apps/<project>-service, only to scan runtime dependencies and module YAML. Frontend and backend share the project configuration.

`deploy` supports `${VARIABLE:fallback}` and hierarchical `HAI_DEPLOY_*` overrides, including whole JSON objects. Known SSH leaf fields can also create an omitted SSH node. A parent object from a higher-priority source overrides lower-source leaves; leaves take precedence within the same source. SSH text stays verbatim, including numeric passwords, leading zeros and surrounding spaces.

The deployment SDK uses these priorities, highest first:

- `HAI_DEPLOY_*`: process > `.env.<environment>.local` > `.env.<environment>` > legacy `.env.local` > `.env`.
- Other modules: process > `.env.<environment>.local` > legacy `.env.local` > `.env.<environment>` > `.env`, preserving existing private credentials.

New connection settings and middleware secrets go to the Git-ignored `.env.<environment>.local`; public backends and addresses stay in `.env.<environment>`. Legacy `.env.local` remains a shared fallback and is never migrated or deleted automatically. Explicit deployment targets for the selected environment take precedence. Only the deployment SDK loads the environment-specific private file; ordinary Core application loading is unchanged. Builds do not load deployment environments or secrets.

For existing projects, move the previous build object into `hai.json.build`, convert deployment YAML into `hai.json.deploy`, remove the old files and retain `HAI_DEPLOY_*` variables. Existing self-hosted S3 installations must use a full deployment for this upgrade: their old baseline contains an exited initialization service, which fails the dependency checks of new incremental packages. The full deployment also refreshes the `createBucket` middleware setting; subsequent incremental updates work normally.

For direct deployment, the wizard asks for missing server, SSH user, authentication and port settings using readable labels. Complete valid settings are reused, including with `--yes`. SSH accepts `auth: key` (private key/agent) or `auth: password`. Without `auth`, only a nonempty `password` selects password authentication; otherwise key/agent remains in use. Explicit `key` ignores a leftover password. Password input is hidden and preserves surrounding spaces and leading zeros. Effective passwords must not contain CR/LF/NUL and must fit within 1023 UTF-8 bytes. Private keys are referenced by path; their contents are never read or copied.

SSH settings are saved in `.env.<environment>.local`. `--bundle-only` asks no SSH questions and carries existing connection settings into the delivery directory; fill missing fields in `deploy-target.json` before upload. Editing a bundle's target affects that bundle only and never writes back to the project. New bundles use the project's saved environment configuration.

#### Configure only the middleware the application needs

Runtime lockfile dependencies and configuration determine middleware. Choose defaults, custom connections or keep settings. With complete target-environment settings, `--yes` preserves values without asking again or provisioning cloud resources again; interactive mode still lets you select the scope. --skip-middleware skips configuration/provisioning. SQLite, memory cache and local storage need no external images. Complete bundles automatically include self-hosted middleware images. External services still require reachable destinations; cloud provisioning is not an offline operation.

#### Deployment options

--env/--env-dir select configuration. --build builds selected application images before packaging. --services selects Compose services; --artifact-dir selects existing artifacts. --bundle-only creates a tar and platform scripts without SSH. --runtime selects the local build/export engine; --output overrides the archive path, resolved from the command's working directory, and adds the application version suffix. --yes uses valid settings without interaction and reports missing required values.

#### When the machines can connect: automatic deployment

```sh
pnpm run deploy --env prod --build
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<buildId>
pnpm run deploy --env prod --build --services web
```

Partial updates require a successful full server installation and matching ports/layout. Merge selected services into the server's successful baseline; preserve unselected services, settings and volumes. The deployment script first removes only the selected old containers by project and service labels, retaining their volumes. It then runs `compose up -d --no-deps --no-build --pull never --no-recreate web` to create replacements while other containers keep running, without project-wide down. The application initializes self-hosted S3 buckets through the optional `storage.init()` setting `createBucket`.

Here `-d` starts in the background; `--no-deps` leaves dependencies untouched; `--no-build` prevents server builds; `--pull never` forbids registry pulls; `--no-recreate` preserves containers that still exist; the selected old containers were already removed by the script, so their replacements are created. `web` is a Compose service name, not an image tag; separate multiple services with spaces.

S3 `createBucket` defaults to `false`. Self-hosted S3 deployments set `HAI_STORAGE_CREATEBUCKET=true`; application initialization creates a missing bucket and preserves an existing one. External S3 remains opt-in. Compose uses the `hai-app` network without YAML anchors. Storage-only updates need no application image; new buckets are initialized on the next application startup.

#### When the machines cannot connect: copy a bundle

```sh
pnpm run deploy --env prod --build --bundle-only
```

Each delivery creates one `.hai/deploy/<environment>/bundle-<project>-<deploymentId>-<version>/` directory containing its tar, Compose, environment, web.conf, manifest and cross-platform scripts. Copy that directory as a unit. Explicit `--output release-prod.tar` produces `release-prod-<version>/release-prod-<version>.tar` relative to the command directory, with all companion files alongside it. The tar includes selected application/middleware images, configurations, private environment files, checksums, README and apply.sh. Before running either upload script, open `deploy-target.json` in the operation directory and use its per-field descriptions to edit and check the server, SSH user and port, private key and known-hosts files, remote directory and other settings. Run deploy.ps1 on Windows or deploy.sh on Linux/macOS; both scripts read this JSON to upload over SSH and execute the same server workflow. Running deploy.sh locally requires sh, awk, ssh and scp. Use `sh deploy.sh HOST [PORT] [USER]` to override the connection address, or pass `-IdentityFile` to deploy.ps1 to override its private key. Both scripts support HAI_DEPLOY_IDENTITY_FILE and HAI_DEPLOY_KNOWN_HOSTS_FILE to override key and known-hosts paths. After moving to another computer or operating system, update these paths to files on that computer.

Offline upload supports key and password authentication. `deploy-target.json` stores only the authentication choice and `passwordEnv` name (default `HAI_DEPLOY_PROVIDER_SSH_PASSWORD`), never the password value. Supply the password in the operator machine environment; it reaches only the current SSH/SCP child processes, not application environments, the tar or manifest. Windows can also read the persisted user environment. Windows needs PowerShell 5+ and OpenSSH; Linux/macOS uses sh, awk, ssh and scp. Neither uploader needs Node/pnpm. Target edits apply only to that delivery directory and never write back to the project; new deliveries use the saved project environment.

On isolated Linux servers, copy the delivery directory and run `sh deploy-local.sh`, optionally passing the deployment root. The script verifies and extracts the adjacent tar and invokes the bundled apply.sh automatically. Every failed step exits nonzero. Image loading, service startup and HTTP checks are distinct steps. result-<deploymentId>.json records the result; current changes only after successful checks. Reapplying the same deployment ID stops clearly; a newly generated bundle for the same application version is allowed. Failed updates attempt to restore selected containers and configuration while preserving data volumes and diagnostics. Data already written by the application is not rolled back.

The bundle `manifest.json` records `partial` and `selectedServices`, and the apply script embeds the same choice. A complete build without `--services` is a full deployment; explicit service selection or a partial build is incremental. Incremental packages require a matching successful `current` baseline and cannot perform a first installation.

The server holds a nonblocking kernel lock with util-linux `flock` on `.deploy.lock` in the deployment root, throughout deployment and recovery. Normal foreground deployment and synchronous failure recovery explicitly unlock after finalization and terminal-result publication, so background services do not block later deployments. Keep this file permanently: never delete, replace or steal it based on elapsed time, and use a filesystem that supports `flock`. On HUP/INT/TERM or a killed parent shell, active child commands retain the inherited lock until every holder exits or the server restarts. The old `.deploy-lock` directory is ignored and left untouched; stop old deployment processes before upgrading and avoid mixing old bundles. Forced termination or power loss skips recovery traps. Without a result file, execution is unknown: inspect containers, images and the successful `current` baseline before recovering with a new bundle. An unlocked file does not prove success or rolled-back effects.

#### Before going fully offline

Complete bundles include self-hosted middleware archives and matching architecture; server startup never pulls images. Linux needs Docker/Podman, Docker Compose v2 or podman-compose 1.6.0+ (supports --pull never), sh, tar, sha256sum, awk, curl, util-linux flock and filesystem/container permissions. Protect private bundle contents. Keep volume identities stable across versions. Verify actual offline startup, login, refresh, restart and persistence. HTTPS, certificates, DNS and external services need separate preparation.

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

Command deadlines include helper startup and output handling. Timeouts, input/output errors and callback failures terminate managed processes. POSIX uses a separate process group. Windows uses an embedded PowerShell/.NET Job Object: create suspended, assign successfully, then resume, with no breakaway. Helper, compilation or assignment failure never falls back to an unmanaged process. System PowerShell and Add-Type are required on Windows; execution is hidden without user profiles, preserving arguments, environment and UTF-8 pipes. POSIX commands must keep descendants in the inherited group; detached system daemons and remote services are outside local termination confirmation.

`terminationTimeoutMs` separately bounds failure cleanup verification, default 10000 and maximum 60000 milliseconds. Sending kill is not confirmation. `localTermination` is `confirmed` only after the managed Job/group has no active members, `unknown` if verification fails or expires, and `not-started` before launch. In the `if (!result.success)` branch, call public `getDeployCommandState(result.error)` for the reason and state, without raw exceptions or command arguments. An output callback already entered cannot be undone; failures stop further output delivery.

SSH interruptions initially report `remoteExecution: 'unknown'`. The docker-ssh SDK reconnects read-only to inspect `result-<deploymentId>.json`. Only a complete, untruncated terminal record with the matching ID confirms `finished`, with the actual stage and exit code. Finished scripts do not imply stopped containers. Even exit code 0 preserves the original SSH/output failure. CLI shows local and remote states separately with the result path. Missing, stale, damaged or unreadable records remain unknown; deployment and rollback are never retried automatically. Manual upload scripts conservatively report unknown on SSH failure with the inspection directory; find the deployment ID in the bundle manifest. Inspect steps, `current`, actual services and data before recovery.

### Runtime environment files and repeated deployments

Each delivery still generates `.hai/deploy/<environment>/bundle-.../.env.runtime` for Compose. This is generated output, not the saved configuration source. The default `NODE_ENV` follows the target: `test` → `test`, `dev/development` → `development`, and `prod/production` or other modes → `production`. Explicit `NODE_ENV` values in environment configuration override this default; build optimization does not select the runtime environment. Rebuild the bundle to update old deliveries.

Project-root `hai.json.deploy` stores deployment structure, `.env.<environment>` stores public settings, and `.env.<environment>.local` stores SSH settings and middleware secrets. Stable generated middleware credentials are also cached under the scanned service directory at `.hai/deploy/runtime/<project>-<environment>.secrets.json`; retain this file when reusing data volumes. Environment files default to the project/workspace root; override with `--env-dir`. After configuration, `pnpm run deploy --env test --build --bundle-only --yes` reuses complete settings without prompts; add `--skip-middleware` to retain middleware configuration. Bundle-only mode does not collect SSH settings initially. Configure the project connection once; editing a delivery's `deploy-target.json` does not update the project.

## Development and testing

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
