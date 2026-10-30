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

Delivery roles are `serv` for a separate API backend, `web` for a static or SSR browser site, `app` for Android/iOS installers, and `desktop` for desktop installers. Fullstack containers use serv plus optional web; API uses serv; browser images for admin/website/h5/mobile-app use web. Native app/desktop outputs are not server Compose services. Use serv/web with `--images` and `--services`, and `--target app` or `--target desktop` for native packages. API service directories are `apps/<project>-serv`. Images and containers share the normalized root `package.json.name`: remove scope, lowercase, and replace invalid character runs with a hyphen. Missing or invalid names fail without falling back to directory names. Images use `localhost/hai-<project>-<role>:<buildId>`; containers use `hai-<project>-<environment>-<role>`. Images remain reusable across environments.

```sh
pnpm build
pnpm build --target image
pnpm build --target image --images web
pnpm build --target desktop --platform windows --arch x64
```

#### Build options

`--target` selects compile (default), image, app or desktop. `--images serv|web|serv,web` selects images. `--runtime auto|podman|docker` selects the local engine; auto prefers reachable Podman. `--network` overrides build networking, `--no-http-proxy` disables inherited Podman proxies, and `--sqlite-prebuild-mirror` selects a trusted HTTP(S) binary mirror. Native `--platform` and `--arch` require the matching host SDK and Rust toolchain. Builds do not load deployment environments or runtime secrets.

#### Describe packaging in hai.json

```json
{
  "build": {
    "images": [
      {
        "name": "serv",
        "context": ".",
        "dockerfile": "images/serv.Dockerfile",
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

Set `transport.maxPlaintextBytes` for both request and response JSON plaintext, measured in UTF-8 bytes: default 1 MiB, integer range 1 KiB–64 MiB. Clients learn the server limit during key exchange. `resolveTransportBodyLimits()` derives encrypted/proxy bytes as twice the plaintext limit plus 32 KiB. Handshake, public-key, header and replay constraints remain independent. Oversized streams are cancelled and readers released: requests return 413; oversized responses return an encrypted 500 capacity error, recognized as `TransportBodyTooLargeError` / `hai:crypto:070`. Full and serv-only incremental deployments derive the proxy limit from resolved `_serv.yml`. Capacity changes recreate the proxy using its installed Web image and restore the prior configuration on health failure. SvelteKit deployments also derive adapter-node `BODY_SIZE_LIMIT` from `_kit.yml`. [Transport capacity and upgrade](../crypto/TRANSPORT-CAPACITY.md)。

Bodyless authenticated envelopes use X-Hai-Transport. Generated proxies set large_client_header_buffers 4 32k and proxy_buffer_size 32k to admit these headers; custom proxies must preserve and admit them.

Dependency inputs are prepared under images/dependencies/ from package manifests, local archives and patches. Combine pnpm store caching with stable dependency layers. Source changes should reuse downloaded packages. Empty caches still permit online builds. Windows node_modules cannot supply Linux native dependencies. Offline builds additionally require base images, tools and matching ABI/architecture/libc binaries.

The root package.json.version identifies the application. `.hai/build/docker/<buildId>/` contains the manifest, selected image archives and SHA-256. Root sites use format 4; non-root sites use format 5 with webBasePath. partial marks incremental builds and hasWeb records topology. servContainerPort and webContainerPort retain explicitly configured serv/web listening ports, including the image left out of a partial build. Omitted ports keep the deployment defaults. Rebuilding the same application version is allowed; unique build IDs/image references distinguish contents. Publish the local build pointer only after all exports succeed. Pin base images, middleware and tools; do not use latest.

#### Website mount path

The default is the site root. For `https://example.com/yyy/`, explicitly set `PUBLIC_BASE_PATH=/yyy` in the application build process. CLI produces format 5; webBasePath is build metadata, not an environment override at deployment. Segments allow ASCII letters, digits, `_`, `.` and `-`, without a trailing slash or standalone `.`/`..` segments. Use CLI/Deploy versions supporting format 5; older tools reject it. Do not edit the format number to bypass validation.

The SDK generates matching Nginx paths, runtime configuration URLs, SSR health checks and the returned URL. Preserve the prefix at any additional gateway. Serv http.apiPrefix independently controls the same-origin API; CORS origins contain only scheme, host and port. Standalone Vite sites keep their configured external API URL. Full and partial builds must use the same PUBLIC_BASE_PATH, including serv-only builds. Incremental deployment rejects mismatches before replacement; use a full deployment to change paths. Recovery checks the previous release's recorded health paths. See [configuration, framework differences and runtime screenshots](../../docs/usage/configuration/delivery.md#网站部署在子目录).

### Deploy artifacts

#### Prepare the environment and destination

The default deployment name comes from `package.json.name` at the project root (the nearest `hai.json` or lockfile directory), rejecting missing or invalid names, with an explicit environment appended. A fullstack `hai-delivery` project scanned at `packages/hai-delivery-serv` with `--env test` generates `/opt/hai/apps/hai-delivery-test` and `bundle-hai-delivery-test-<deploymentId>-<version>.tar.gz`. Remote directories, bundles, the Compose project, API/Web/middleware containers, data volumes, server credential state and incremental baselines share this name. Actual project names ending in `-serv` are preserved.

Artifact formats 4 and 5 record primaryService (serv/web); hasWeb describes the complete browser topology. Format 5 also records a non-root webBasePath. Only serv + web generates a same-origin API proxy. Rebuild artifacts using formats 1–3. Back up the existing deployment and verify project identity, volumes and managed credentials before establishing a new full deployment baseline. Tools do not migrate data across projects. Full deployments still remove obsolete service containers under the same Compose project; editing deploy-target.json.directory alone does not migrate resources.

For existing projects, update build.images names in hai.json, Dockerfile filenames and references first. Rename API service directories/packages and dependent references to -serv, then reinstall dependencies and build a complete artifact. Renaming archives or editing manifest files does not replace a new build.

The CLI --project-name option and SDK DeployAppOptions.projectName override have been removed. Obsolete overrides fail explicitly; maintain resource identity in the root package.json.name.

Prepare `.env.<environment>` and the project root `hai.json`, with image/native configuration in `build` and application deployment in `deploy`. Fullstack scripts still point to packages/<project>-serv, and API workspaces to apps/<project>-serv, only to scan runtime dependencies and module YAML. Frontend and backend share the project configuration.

`deploy` supports `${VARIABLE:fallback}` and hierarchical `HAI_DEPLOY_*` overrides, including whole JSON objects. Known SSH leaf fields can also create an omitted SSH node. A parent object from a higher-priority source overrides lower-source leaves; leaves take precedence within the same source. SSH text stays verbatim, including numeric passwords, leading zeros and surrounding spaces.

The deployment SDK uses these priorities, highest first:

- `HAI_DEPLOY_*`: process > `.env.<environment>.local` > `.env.<environment>` > legacy `.env.local` > `.env`.
- Other modules: process > `.env.<environment>.local` > legacy `.env.local` > `.env.<environment>` > `.env`, preserving existing private credentials.

New connection settings and middleware secrets go to the Git-ignored `.env.<environment>.local`; public backends and addresses stay in `.env.<environment>`. Legacy `.env.local` remains a shared fallback and is never migrated or deleted automatically. Explicit deployment targets for the selected environment take precedence. Only the deployment SDK loads the environment-specific private file; ordinary Core application loading is unchanged. Builds do not load deployment environments or secrets.

For existing projects, move the previous build object into `hai.json.build`, convert deployment YAML into `hai.json.deploy`, remove the old files and retain `HAI_DEPLOY_*` variables. Existing self-hosted S3 installations must use a full deployment for this upgrade: their old baseline contains an exited initialization service, which fails the dependency checks of new incremental packages. The full deployment also refreshes the `createBucket` middleware setting; subsequent incremental updates work normally.

The CLI --project-name option and SDK DeployAppOptions.projectName override have been removed. Obsolete overrides fail explicitly; maintain resource identity in the root package.json.name.

For direct deployment, the wizard asks for missing server, SSH user, authentication and port settings using readable labels. Complete valid settings are reused, including with `--yes`. SSH accepts `auth: key` (private key/agent) or `auth: password`. Without `auth`, only a nonempty `password` selects password authentication; otherwise key/agent remains in use. Explicit `key` ignores a leftover password. Password input is hidden and preserves surrounding spaces and leading zeros. Effective passwords must not contain CR/LF/NUL and must fit within 1023 UTF-8 bytes. Private keys are referenced by path; their contents are never read or copied.

SSH settings are saved in `.env.<environment>.local`. `--bundle-only` offers to add or update SSH settings as the last interaction after builds and middleware configuration, before packaging. It saves them in the same private file and uses them for the current and subsequent `deploy-target.json` files. Declining reuses existing settings; missing fields can still be filled in the target before upload. `--yes` reuses settings without prompting. Editing a bundle's target affects that bundle only and never writes back to the project. New bundles use the project's saved environment configuration.

#### Configure only the middleware the application needs

Runtime lockfile dependencies and configuration determine middleware. Choose defaults, custom connections or keep settings. With complete target-environment settings, `--yes` preserves values without asking again or provisioning cloud resources again; interactive mode still lets you select the scope. --skip-middleware skips configuration/provisioning. SQLite, memory cache and local storage need no external images. Complete bundles automatically include self-hosted middleware images. External services still require reachable destinations; cloud provisioning is not an offline operation.

Default and custom modes preserve effective settings for the same backend, including pool, operation log, public storage URLs/prefixes, Redis retry and vector search options absent from the form. Managed services replace connection selectors and credentials; old URLs, TLS/cluster modes and credentials cannot override the new service. SMTP senders and LDAP attribute mappings remain. Switching backends clears incompatible fields. Missing fields already saved in parent JSON need recovery from the original configuration or backup: restore `publicEndpoint` in the highest-priority `HAI_STORAGE`, then rebuild and deploy the bundle. Editing YAML or leaf variables hidden by that parent JSON cannot repair an old bundle.

#### Direct private object storage access

Self-hosted S3 uses an internal endpoint. Set `_storage.yml` publicEndpoint to an external address such as `https://app.example.com/delivery/files`. Nginx exposes `/delivery/files/<bucket>/...`, removes the proxy directory and forwards the original bucket URI, signature query and Host directly to storage:9000. Files bypass Serv; omitting the directory retains root bucket routes. A route may sit under the website directory; API, asset and health conflicts fail packaging. Storage ports/consoles remain private, buffering/signature logs are disabled, and S3 handles authorization and cross-origin CORS. External ingress must retain the full entry path and Host so only the SDK gateway removes the prefix.

Managed deployments retain bucket/region/prefix/publicEndpoint/publicUrl/operationLog while replacing internal connections and managed credentials. Adding the gateway or changing access settings requires a full baseline; partial preflight rejects mismatching configuration fingerprints. App/storage partial updates refresh retained proxy DNS, and recovery restores the previous topology. External/kept storage gets no local sidecar route; Local does not expose private directories. See the [storage handbook](../../docs/usage/configuration/data.md).

#### Deployment options

--env/--env-dir select configuration. --build builds selected application images before packaging. --services selects Compose services; --artifact-dir selects existing artifacts. --bundle-only creates a tar and platform scripts without SSH. --runtime selects the local build/export engine; --output overrides the archive path, resolved from the command's working directory, and adds the application version suffix. --yes uses valid settings without interaction and reports missing required values.

#### When the machines can connect: automatic deployment

```sh
pnpm run deploy --env prod --build
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<buildId>
pnpm run deploy --env prod --build --services web
# Use one --services with comma-separated names; quote the value for PowerShell
pnpm run deploy --env prod --build --services "serv,web"
```

Partial updates require a successful full server installation and matching ports/layout. Merge selected services into the server's successful baseline; preserve unselected services, settings and volumes. The deployment script first removes only the selected old containers by project and service labels, retaining their volumes. It then runs `compose up -d --no-deps --no-build --pull never --no-recreate web` to create replacements while other containers keep running, without project-wide down. The application initializes self-hosted S3 buckets through the optional `storage.init()` setting `createBucket`.

Here `-d` starts in the background; `--no-deps` leaves dependencies untouched; `--no-build` prevents server builds; `--pull never` forbids registry pulls; `--no-recreate` preserves containers that still exist; the selected old containers were already removed by the script, so their replacements are created. `web` is a Compose service name, not an image tag; separate multiple services with spaces.

S3 `createBucket` defaults to `false`. Self-hosted S3 deployments set `HAI_STORAGE_CREATEBUCKET=true`; application initialization creates a missing bucket and preserves an existing one. External S3 remains opt-in. Compose uses the `hai-app` network without YAML anchors. Storage-only updates need no application image; new buckets are initialized on the next application startup.

#### When the machines cannot connect: copy a bundle

```sh
pnpm run deploy --env prod --build --bundle-only
```

Each delivery creates one `.hai/deploy/<environment>/bundle-<project>-<deploymentId>-<version>/` directory containing only the tar, deploy.sh, deploy.ps1, deploy-target.json, read-target.awk, deploy-local.sh and README.txt. Compose, runtime environments, web.conf and manifest.json remain inside the tar; the external README also records the deployment ID. Copy that directory as a unit. Explicit `--output release-prod.tar` produces `release-prod-<version>/release-prod-<version>.tar.gz` relative to the command directory, with all companion files alongside it. The tar includes selected application/middleware images, configurations, private environment files, checksums, README and apply.sh. Before running either upload script, open `deploy-target.json` in the operation directory and use its per-field descriptions to edit and check the server, SSH user and port, private key and known-hosts files, remote directory and other settings. Run deploy.ps1 on Windows or deploy.sh on Linux/macOS; both scripts read this JSON to upload over SSH and execute the same server workflow. Running deploy.sh locally requires sh, awk, ssh and scp. Use `sh deploy.sh HOST [PORT] [USER]` to override the connection address, or pass `-IdentityFile` to deploy.ps1 to override its private key. Both scripts support HAI_DEPLOY_IDENTITY_FILE and HAI_DEPLOY_KNOWN_HOSTS_FILE to override key and known-hosts paths. After moving to another computer or operating system, update these paths to files on that computer.

Offline upload supports key and password authentication. `deploy-target.json` stores only the authentication choice and `passwordEnv` name (default `HAI_DEPLOY_PROVIDER_SSH_PASSWORD`), never the password value. Supply the password in the operator machine environment; it reaches only the current SSH/SCP child processes, not application environments, the tar or manifest. Windows can also read the persisted user environment. Windows needs PowerShell 5+ and OpenSSH; Linux/macOS uses sh, awk, ssh and scp. Neither uploader needs Node/pnpm. Target edits apply only to that delivery directory and never write back to the project; new deliveries use the saved project environment.

Uploaders reuse the operator environment password first. If unset or empty, `deploy.sh` / `deploy.ps1` immediately request hidden input and continue the current deployment. Input is never saved to files; noninteractive calls fail clearly without waiting. POSIX prompting requires a terminal and `stty`. Invalid input and cancellation are reported clearly. Progress shows received/total bytes and percentage, reaching 100% only after success; PowerShell forwards redacted SSH output continuously. Incremental deployment restores stopped or Compose-down services from the installed baseline and local images before checking dependencies and updating selected services; failed recovery does not advance current.

On isolated Linux servers, copy the delivery directory and run `sh deploy-local.sh`, optionally passing the deployment root. The script verifies and extracts the adjacent tar and invokes the bundled apply.sh automatically. Every failed step exits nonzero. Image loading, service startup and HTTP checks are distinct steps. result-<deploymentId>.json records the result; current changes only after successful checks. Reapplying the same deployment ID stops clearly; a newly generated bundle for the same application version is allowed. Failed updates attempt to restore selected containers and configuration while preserving data volumes and diagnostics. Data already written by the application is not rolled back.

The bundle `manifest.json` records `partial` and `selectedServices`, and the apply script embeds the same choice. A complete build without `--services` is a full deployment; explicit service selection or a partial build is incremental. Incremental packages require a matching successful `current` baseline and cannot perform a first installation.

The server holds a nonblocking kernel lock with util-linux `flock` on `.deploy.lock` in the deployment root, throughout deployment and recovery. Normal foreground deployment and synchronous failure recovery explicitly unlock after finalization and terminal-result publication, so background services do not block later deployments. Keep this file permanently: never delete, replace or steal it based on elapsed time, and use a filesystem that supports `flock`. On HUP/INT/TERM or a killed parent shell, active child commands retain the inherited lock until every holder exits or the server restarts. The old `.deploy-lock` directory is ignored and left untouched; stop old deployment processes before upgrading and avoid mixing old bundles. Forced termination or power loss skips recovery traps. Without a result file, execution is unknown: inspect containers, images and the successful `current` baseline before recovering with a new bundle. An unlocked file does not prove success or rolled-back effects.

#### Failure recovery and reverting a successful release

Preflight verifies the actual named volume and backend family for self-hosted `db`, `storage` and `vecdb`. The server's `<remoteDir>/persistent-backends` ledger records these bindings before any service starts and preserves them when a service is removed, a first installation fails, or recovery runs. Removing PostgreSQL while retaining its volume and later adding MySQL is therefore refused. Protect and back up the ledger together with `managed-secrets.env` and the data volumes. Never delete or edit it to force adoption of an old volume. These are private deployment metadata, with no new public configuration option.

Legacy adoption requires a known family from the successful baseline, one actual service container, and matching named-volume mounts and image family. Unknown volumes left by removed services are not identified by their names or passwords; verify the data and plan an explicit migration. A missing volume owned by the active baseline stops deployment instead of silently creating an empty database. Each new release saves verified old bindings in `previous-state-backends`; recovery checks that snapshot, the permanent ledger and existing volumes without reverting the ledger.

The separate [controlled credential import](docs/credential-import.md) path can supply evidence for an unclaimed volume: valid v2 state must bind the exact project, credential group and volume, and one running original container must confirm the same project/service through consistent Docker/Podman labels, actual mounts and image family. Missing evidence still fails closed. Import never overrides a known ledger claim or engine identity conflict and does not create a successful baseline. Without `current`, use the current CLI to create a **new full bundle with a new ID** for the first takeover; incremental updates require that full deployment to succeed first.

These checks apply to `apply.sh` on the **target Linux server over SSH**: keep the SSH user and local daemon/store fixed. Docker must use its default context; Podman must actually run locally. Remote connections and explicit storage overrides are refused. In production, pin `remote.runtime` to the verified `docker` or `podman`. If installing Podman changes the engine selected by `auto`, first restore the original runtime, SSH user and store. Intentional server, daemon or storage changes need a separate migration; matching user IDs or directory names do not prove compatibility. Building and packaging on Windows/macOS with Docker Desktop or a Podman VM, then deploying over SSH, remains supported.

This check compares engine families and does not certify major-version data-directory compatibility. Middleware images currently use framework-pinned versions; inspect engine migration requirements and backups before upgrading the framework. Full deployment, including a new full bundle made from old artifacts, removes undeclared service containers in the same Compose project while retaining volumes. Incremental updates preserve unselected services. Assess the whole topology before reverting if newly added services must remain available.

Automatic recovery starts the previous configuration and verifies containers and HTTP using that release's port and health paths. The server's `result-<deploymentId>.json` includes `recoveryStatus`: `not-needed`, `passed` (previous services passed health checks), `failed` (restoration or verification failed), or `stopped` (failed first installation was stopped). Deployment still exits nonzero and keeps the last successful `current`. Inspect preserved diagnostics after recovery failure; Compose startup alone is not confirmation.

To revert a successful release after business acceptance fails, retain the previous complete artifacts and matching configuration/private environment backup. Confirm database compatibility or follow the application's data recovery plan, restore matching configuration, then run:

```sh
pnpm run deploy --env prod --artifact-dir .hai/build/docker/<previousBuildId>
```

Use the current CLI and omit `--build` and `--services` to create a new complete bundle with a new deployment ID from the old artifacts. It applies the lock, ledger, checksums, startup and health checks; offline delivery also requires a newly generated bundle. Do not bypass protection with an old tool or bundle. An old build ID usually retains serv/web application images; middleware is planned using the current CLI's pinned versions, so this does not precisely revert every middleware version. Check major-version, data-directory and schema compatibility, and retain artifacts, matching settings, the ledger, credentials and data backups. Never edit `current` alone, delete volumes or overwrite image tags manually. Container recovery does not undo written data, incompatible migrations or external effects.

After the server passes local health checks and commits `current`, the SDK separately probes public access from the operator's machine. Network, firewall or ingress failures at this point preserve `remoteStage: 'complete'` and `remoteExitCode: 0`; the server release may already be successful. Inspect its matching result and actual access before retrying or reverting.

#### Before going fully offline

Complete bundles include self-hosted middleware archives and matching architecture; server startup never pulls images. Linux needs Docker/Podman, Docker Compose v2 or podman-compose 1.6.0+ (supports --pull never), sh, tar, sha256sum, awk, curl, util-linux flock and filesystem/container permissions. Protect private bundle contents. Keep volume identities stable across versions. Verify actual offline startup, login, refresh, restart and persistence. HTTPS, certificates, DNS and external services need separate preparation.

### Build and packaging improvements

Image builds run at most two images concurrently by default; use `--concurrency 1` to reduce resource use. Dependency installation precedes source copies, and each side copies only its required source. Runtime images omit application declaration files, source maps and README files. Packaging validates and reuses middleware archives by image content ID and hashes application archives while copying. Delivery defaults to `.tar.gz`; explicit `--output release.tar` keeps an uncompressed archive. README is only outside the archive. Successful deployment removes its incoming upload/extraction, retains recovery configuration in releases, and keeps images in the container engine.

### Optional HTTPS certificates

`pnpm run deploy` offers no HTTPS, existing PEM certificate/key paths, or Let’s Encrypt for every container template. Relative paths resolve from the project root. Certificates are checked for domain, validity and key matching, then copied into private releases. A pinned official Certbot image handles issuance and renewal checks every 12 hours, with automatic Nginx reload. It requires terms acceptance, a real email, public DNS, port 80 and CA connectivity. Isolated servers use existing certificates. Certificate state stays on the server; keys stay out of application images. `--yes` reuses saved settings.

Configure `hai.json.deploy.provider.expose.https` or private environment overrides. Defaults are HTTPS 443 and HTTP redirection; omission retains HTTP. Enabling/disabling HTTPS or changing mode, domain, ports or supplied certificates requires a full deployment. See the [HTTPS guide](../../docs/usage/configuration/delivery.md#可选https证书). Plans use `root` for the project and `serviceDir` for the service source/configuration directory, exposing only public certificate metadata.

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

Delivery removes every HAI child variable hidden by a parent and omits settings supplied by `middleware.env` from `.env.runtime`. Container paths stay in delivery files; pruning leaves the source environment intact. Edit the retained parent object or managed connection file.

Node backends (Serv / SvelteKit SSR) reread the release `.env.runtime` on every start by default. Edit it, then run `docker restart <container>` or `podman restart <container>`; no image rebuild or extra override is needed. Existing deployments need one deployment with the new CLI. Removed settings do not survive through stale Compose injection. Managed connections in `middleware.env` retain precedence; private proxy identity and Node startup options remain deployment settings. Static Web, middleware, ports/mounts, and Nginx routes and limits keep their existing update flow. Gateway path, port or mount changes require a full deployment. Back up manual edits and copy permanent changes into the source environment; the next backend deployment regenerates the file.

Persisted framework configuration uses `HAI_*` names. Native `POSTGRES_*`, `MYSQL_*`, `RUSTFS_*`, `MINIO_*`, and `LDAP_*` variables keep the names required by middleware images, but are generated only in private `middleware-runtime.env`, loaded by middleware containers. They are no longer saved to project environment files or the application's `.env.runtime`. The `middleware.env` retained for incremental application updates contains framework `HAI_*` settings only. Previously saved native entries are not deleted automatically and are excluded from new application environments. Existing services keep their original release files when a new bundle is deployed incrementally.

Whole `HAI_*` configuration supplied by sidecars or provisioners clears superseded leaf variables: Redis overrides no longer leave `HAI_CACHE_TYPE=memory`. Global `~/.hai/credentials.yml` fills missing settings only, respecting existing environment/process keys and parent objects. Deployment starts selected middleware and waits for PostgreSQL/MySQL/Redis/S3 health before serv/Web; incremental deployment and recovery use the same order and preserve unselected containers.

On Podman, deployment actively runs each configured container healthcheck and rereads its status, independent of automatic systemd scheduling. A failed current probe cannot authorize app startup even if the stored status is still `healthy`.

Only the first startup batch removes orphan containers; later serv/Web startup preserves the middleware that is already ready.

Generated fullstack projects create different administrator passwords and transport key rings in `.env.dev/.env.test/.env.prod`. Commit these environment files to share them after cloning; local private files and process variables can override them. Before upload, deployment identifies missing or malformed `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` for transport-enabled applications. All nodes in an environment use the same valid ring from its environment file or a Secret Manager override; never generate one per node. CLI completion identifies the actual source of `HAI_ADMIN_DEFAULT_PASSWORD` without printing it, independently of log level. It applies only when initially creating the administrator. Offline scripts also identify the password variable in the server's private `.env.runtime`.

Each delivery still generates `.hai/deploy/<environment>/bundle-.../.env.runtime` for Compose. This is generated output, not the saved configuration source. The default `NODE_ENV` follows the target: `test` → `test`, `dev/development` → `development`, and `prod/production` or other modes → `production`. Explicit `NODE_ENV` values in environment configuration override this default; build optimization does not select the runtime environment. Rebuild the bundle to update old deliveries.

Project-root `hai.json.deploy` stores deployment structure, `.env.<environment>` stores public settings, and `.env.<environment>.local` stores SSH settings and middleware secrets. Environment files default to the project/workspace root; override with `--env-dir`. After configuration, `pnpm run deploy --env test --build --bundle-only --yes` reuses complete settings without prompts; add `--skip-middleware` to retain middleware configuration. Interactive bundle-only mode offers to save or update SSH settings at the final configuration step; editing a delivery's `deploy-target.json` does not update the project.

The server persists managed middleware passwords in `<remoteDir>/managed-secrets.env` (mode 0600); back it up with data volumes. Each package supplies random first-use candidates without a build-machine cache. The online SDK, deploy.sh, deploy.ps1 and deploy-local.sh resolve server values under the deployment lock and update both application connections and native middleware variables. The delivery tar stays immutable; only private server runtime files receive resolved values. Missing state with an existing corresponding volume stops deployment before services change: restore the server credential backup. Deployment never silently rotates passwords or deletes data. Legacy credentials can be explicitly verified and imported using the procedure below.

## Read-only deployment plan

`createDeploymentPlan(appDir, config, options)` initializes no provider, generates no credentials/output and connects to no target. It shares real scanning, environment resolution, resource naming and artifact checksums, reporting project `root`, service source/configuration `serviceDir`, versions, build ID, selected/retained services, source files/key names, baseline requirements and recovery paths without values or SSH credentials. Unread remote current is not-inspected; execution still strictly requires a successful baseline for partial updates. Compose recovery does not undo database changes/migrations. CLI: `hai deploy --env prod --plan`.

Use `--plan --inspect-remote` (SDK inspectRemote:true) to read current and the successful release directory over SSH. It reports verified/missing/unavailable and the actual recovery release ID without target writes.

Resources use the complete execution topology. `containers` lists selected explicit container names; Compose-named LDAP/SMTP services appear in `composeManagedServices`. The SSR/API storage gateway appears in the actual selected or retained scope. `logicalVolumes` declares the complete Compose topology, including retained services and data volumes still mounted by the app; it does not mean those volumes will be created or replaced. Engine names are scoped by the Compose project. Unselected middleware has action keep, and cloud provisioning follows the actual selection without exposing credentials.

## Capacity consistency and legacy credential import

Explicit plaintext limits are preserved. Packaging rejects feedback requirements above an explicit limit with a configuration conflict. Omitted/auto values derive capacity; the Web proxy and Kit BODY_SIZE_LIMIT use the same encrypted budget. Plan target.runtime reports remote provider.remote.runtime separately from local packaging options.runtime; auto is not a detected runtime.

Use `importDeploymentSecrets({ directory, inputFile, runtime })` or run `hai deploy-secrets <directory> --import <private.json>` on the server for read-only verification. Only explicit `--apply` / dryRun:false imports state. The tool verifies projects, containers, volumes and live credentials; it never infers passwords from old bundles, rotates credentials or rebuilds services. V2 state supports special characters and is atomically written with mode 0600 under the deployment flock. Ordinary offline deployment still requires no server Node; this one-time import tool needs supported Node and installed CLI/deploy. See the [import and recovery procedure](docs/credential-import.en.md).

## Request policy files and trusted proxies

Serv `http.access` and SvelteKit `access` can reference separate yml/yaml files. Deployment reads effective application configuration, including environment overrides such as `HAI_SERV`, `HAI_SERV_HTTP_ACCESS` and `HAI_KIT_ACCESS`, validates the file and includes a normalized snapshot in the bundle. Runtime configuration points to `/run/hai/request-access.yml` with a read-only Compose mount. The project retains its original file reference. The snapshot participates in SHA-256 verification; missing or invalid files fail before upload. The upload archive and its policy snapshot are integrity-checked inputs; replacing the SDK-managed snapshot requires a new bundle and deployment. The deployed Node backend reads its mounted `.env.runtime` on restart as described above. Inline rule changes do not rewrite the policy snapshot or Nginx configuration.

Full deployments and backend increments carry their own snapshot; frontend-only increments retain the backend mount. Failed deployment recovery uses the previous successful release's Compose and policy file. Non-root containers can read the policy inside a private release directory. Image and policy rollback does not undo database migrations or completed business effects.

For operator-managed rules that reload on restart, manage a read-only file outside the bundle and use a Compose override to replace the same `/run/hai/request-access.yml` mount. SDK rollback does not restore this external file. Recreate the container once to apply the mount; later file changes require a restart. A custom container that only injects variables through Compose `env_file` still needs recreation after file changes, usually without rebuilding the image. SDK Node backends instead read the mounted `.env.runtime` on restart. See [mounted policy setup and verification](../../docs/usage/configuration/request-access.md#44-运维独立管理文件修改后重启生效).

Managed Compose sets `HAI_DEPLOY_PRIVATE_PROXY=1` only when a Web/gateway proxy fronts a backend without public ports. Serv/Kit default `trustedProxies: auto` uses container networks there and ignores forwarded headers on other hosts. Generated Nginx overwrites client-supplied forwarding headers with the actual peer. For an upstream load balancer, explicitly set Docker SSH Provider `trustedEdgeProxies` to its IPs/CIDRs; omitting it trusts no upstream, and `[]` explicitly selects the same behavior. Source addresses lost before Nginx cannot be reconstructed, including some rootless forwarding environments. See the [request access handbook](../../docs/usage/configuration/request-access.md) for examples and verification.

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
