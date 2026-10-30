# From your first project to a running application

[简体中文](../README.md) | [English](workflow.en.md) | [日本語](workflow.ja.md)

## Introduction

This guide follows an application through creation, development, builds, delivery, and framework updates. The examples use a project named `my-app`, with the fullstack Web + API template as the main path. Differences between templates are called out where they matter.

Commands describe the CLI and templates in this repository. For an installed release, check `hai --version`, `hai build --help`, and `hai deploy --help` first: an older release does not gain unpublished source features. Find module examples in the [root README](../../../README.en.md) and package READMEs. To work on the framework itself, follow [AGENTS.md](../../../AGENTS.md).

## Core features

### Guides by task

The detailed domain guides below are currently in Chinese. They distinguish framework defaults, template settings, example recommendations, verified behavior and environment-dependent work:

| Task | Guide |
| --- | --- |
| Purpose, defaults, value changes, complete examples and current screenshots | [Application configuration handbook (Chinese)](../configuration/README.md) |
| Environment loading, precedence and module lifecycle | [Runtime configuration (Chinese)](../configuration/runtime.md) |
| Find settings by existing module name | [Configuration index](../configuration-reference.md) |
| Shared APIs, CORS and transport | [Frontend/backend separation](../development/frontend-backend.md) |
| SQL, transactions, cache, files and chunking | [Data access](../development/data.md) |
| Login, passwords, sessions and permissions | [Authentication and security](../development/authentication.md) |
| Models, retrieval, tools and persistence | [AI](../development/ai.md) |
| Forms, themes, feedback and keyboard interaction | [UI](../development/ui.md) |
| Delivery and recovery | [Deployment](../operations/deployment.md) |
| Logs, feedback, notifications, audit and jobs | [Operations](../operations/feedback.md) |
| Payment and native devices | [Integrations](../development/integrations.md) |
| Current run evidence, screenshots and limitations | [Verification](../governance/verification.md) |

### Main workflow

- Create applications and configure environments.
- Develop manually or with AI; compile and build container/native artifacts.
- Deliver offline, update selected services and upgrade the framework.

## Getting started

### 1. Prepare your tools

| Work | Requirements |
| --- | --- |
| Create, develop, compile, and run the CLI | `Node.js` `^22.23.4 \|\| ^24.22.1 \|\| ^26.12.1`, `pnpm 12`.11.2; check the project's `engines` and `packageManager` |
| Version control and document-driven AI development | Git; an AI coding assistant that can read project files and run commands |
| Build container images | An installed, running Podman or Docker engine; use Linux containers on Windows |
| Build desktop installers | Rust, the target architecture toolchain, and Tauri's system SDKs and packaging tools on the target OS |
| Deploy automatically to Linux | Local `tar`, `ssh`, and `scp`; a server with a container engine, Compose, `sh`, `tar`, `sha256sum`, `awk`, `curl`, util-linux `flock`, a filesystem supporting flock and directory permissions |
| Generate a deployment bundle only | Local `tar`, installed project dependencies, and complete build artifacts; exporting middleware images also requires a local container engine; no SSH required |

Commands below use `pnpm`; use `pnpm.cmd` in Windows PowerShell. Engine auto-detection checks available Podman/Docker installations; it does not install or start them.

Defaults below describe what happens when an option is omitted, including cases that prompt for a choice.

| Global option | Purpose | Default | Example |
| --- | --- | --- | --- |
| `-C, --cwd <path>` | Working directory | Current directory | `pnpm exec hai build --cwd ../my-app` |
| `-v, --verbose` | Detailed output, depending on the subcommand | `false` | `hai create my-app --verbose` |
| `-h, --help` | Command help | `false` | `pnpm exec hai build --help` |
| `-V, --version` | CLI version, not the application version | `false` | `hai --version` |

### 2. Create an application

Install the CLI, then create a Web + API workspace with deployment support:

An unversioned install selects npm's `latest` tag. Query `pnpm view @h-ai/cli@latest version` and `pnpm view @h-ai/cli dist-tags` for the current versions. Use `@h-ai/cli@latest` for the default release, `@beta` for the beta channel, or replace the tag with the returned exact version to pin it. Completed releases advance `latest` after all packages are published while retaining their channel tags. Upgrade application packages to the same exact framework version.

```sh
pnpm add -g @h-ai/cli@latest
hai --version
hai create my-app --type fullstack --frontends web --defaults
cd my-app
pnpm dev
```

Creation installs dependencies and initializes Git by default. Run `hai create my-app` for interactive selection; deployment tooling is included by default; use `--no-deploy` to opt out. With `--no-install`, run `pnpm install` in the project before starting it. Initial installation needs a reachable registry unless you have prepared the offline dependencies described later.

| Creation option | Meaning and values | Default | Example |
| --- | --- | --- | --- |
| `[name]` | Project name: lowercase letters, digits, hyphens | Prompt, initially my-app; my-app with `--defaults` | `hai create orders-app` |
| `--type <type>` | fullstack: API + clients; api: contract + service; admin/website/h5: SvelteKit; mobile-app: Capacitor + Vite | Prompt, initially admin; admin with `--defaults` | `--type fullstack` |
| `--frontends <targets>` | fullstack web/app/desktop, comma-separated; miniapp is a placeholder | web,app,desktop for fullstack; unused otherwise | `--frontends web,desktop` |
| `--no-install` | Defer dependency installation | Install dependencies | `--no-install` |
| `--no-git` | Skip Git initialization | Initialize Git | `--no-git` |
| `-p, --package-manager <pm>` | pnpm/npm/yarn | `pnpm for fullstack/API`; otherwise detected or selected interactively | `--package-manager pnpm` |
| `--git-remote <url>` | Remote repository URL | Unset | `--git-remote https://git.example.com/team/my-app.git` |
| `--defaults` | Create with defaults without prompts | false | `hai create my-app --defaults` |

To include a desktop client, use `--frontends web,desktop`. Existing applications can add supported modules with `hai add <module>`, for example `hai add deploy`.

In fullstack, `packages/my-app-contract` defines APIs, `packages/my-app-serv` implements them, `packages/my-app-shared` holds shared code, and `apps/my-app-web` provides the Web client. Environment files live at the project root. In the API template they live in `apps/my-app-serv`. Read your generated README and `AGENTS.md` before making changes.

Creation always uses the full applicable modules and examples, including AI, vector storage and feedback on servers. Clients retain their dependency boundaries. Installation is larger, and examples need adaptation. `--template`, `--features` and `--examples/--no-examples` have been removed; `create --yes/-y` is now `--defaults`. Old options fail explicitly. `deploy --yes` and existing projects keep their behavior.

### 3. Configure the application and develop features

Configuration files describe module structure: for example, `_db.yml` references `HAI_DB_TYPE` for its database type. Environment-specific addresses, ports, providers, and credentials come from the shared variable naming scheme. Avoid copying the implementation for each environment. Keep server secrets out of `PUBLIC_` and `VITE_` variables.

| File | Purpose | Commit to Git |
| --- | --- | --- |
| `.env.example` | The full configuration reference, with descriptions, examples, and enum values; not automatically loaded at runtime | Yes |
| `.env` | Public base configuration shared by all environments | Yes |
| `.env.dev` | Public development overrides | Yes |
| `.env.test` | Public test overrides | Yes |
| `.env.prod` | Public production overrides | Yes |
| `.env.local` | Private settings, credentials, and SSH paths for this machine | No |

Precedence is **existing process variables > `.env.local` > `.env.<environment>` > `.env`**. Check local overrides when changing environments: a connection in `.env.local` can still point to a different environment. JSON object overrides take precedence over individual child fields. Your generated `.env.example` describes available variables and allowed values; the framework-wide catalog is in the [root `.env.example`](../../../.env.example). Apart from the CLI-generated shared bootstrap password and transport key ring for each environment, keep real credentials in private files or the deployment process environment.

```sh
pnpm dev
pnpm dev:test
pnpm dev:prod
```

These commands select configuration for development servers. Builds are independent of deployment environments. Built Node services use `start:test` or `start:prod`. The fullstack root `start` runs the API only; run `preview` in a client workspace for local Web previews. Container deployment starts both Web and API.

#### Traditional development

Define the inputs, outputs, permissions, data changes, and acceptance scenarios before coding against existing public module APIs. In fullstack, start with the contract, then implement the service and client calls. SvelteKit applications retain file routing and server-side loading. Fullstack and mobile clients use automatically discovered hash routes, so new pages do not require edits to a central route table and refreshing preserves the current page. Keep the shared header and footer in page layouts.

In SvelteKit projects, commands such as `hai generate page dashboard` and `hai generate component UserCard` provide starting code. The current page/api generators emit SvelteKit file routes, not fullstack/API workspace contracts, procedures, or hash pages; implement those using the existing workspace structure. Generators do not complete business rules. Follow each package's actual lifecycle, factory, or pure-function contract; check `success` before using a `HaiResult`. Document exported functions, core logic, tables, and data structures with JSDoc and useful usage/data examples.

Use your project's scripts to validate each change:

```sh
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

Prepare the browser required by Playwright and any real services before E2E runs. Choose checks appropriate to the change; wording-only edits do not need duplicate behavior tests. Review actual interactions and screenshots for UI changes. Test teardown/finally must clean temporary projects, containers, processes, logs, screenshots, and reports on success, failure, and cancellation. Do not commit acceptance artifacts or remove pre-existing user resources.

#### AI first: agree on documents, then implement and evolve them

The CLI copies complete skills into the application's `.agents/skills/`. Skill names below identify tasks for an AI assistant, not shell commands. Ask it to “use hai-spec-review…” or read the corresponding `SKILL.md`; shortcut invocation depends on your assistant.

1. **Describe the business first.** Keep requirements and necessary designs in `docs/`. Include goals, roles, permissions, pages/APIs, fields and enums, state changes, failure feedback, acceptance criteria, and exclusions. Start small, but make business behavior clear enough that an implementer does not have to guess.
2. **Review with [hai-spec-review](../../../packages/cli/templates/skills/hai-spec-review/SKILL.md).** For example: “Review docs/requirements.md and docs/design.md for implementation readiness. Give issues and concrete corrections; do not code yet.” Resolve the issues, review again, and fix the approved document scope and version. Explicit requirements can change the template's default roles and workflows.
3. **Implement with [hai-spec-implement](../../../packages/cli/templates/skills/hai-spec-implement/SKILL.md).** Commit the agreed business documents first, then ask: “Plan and implement the reviewed documents in dependency order, validate, and merge locally. Do not push or publish.” The skill maintains `docs/task-list.md`, `docs/tasks/T001-….md`, requirement coverage, and document baselines, rather than treating a successful build as completed delivery.
4. **Implement, test, and review each task.** [hai-app-create](../../../packages/cli/templates/skills/hai-app-create/SKILL.md) handles features and framework reuse; [hai-app-tests](../../../packages/cli/templates/skills/hai-app-tests/SKILL.md) selects meaningful unit, integration, and browser tests; [hai-app-review](../../../packages/cli/templates/skills/hai-app-review/SKILL.md) checks security, return contracts, code, and real interactions. These three skills also work directly for small features and fixes.
5. **Review the proposed PR with [hai-pr-review](../../../packages/cli/templates/skills/hai-pr-review/SKILL.md).** Supply the scope, diff, check results, and unverified items to assess risks and merge readiness. AI review does not imply that CI passed or authorize posting comments, pushing, merging, or deploying.

For a requirement change, update and commit the affected business documents, review the changes, then ask: “Use hai-spec-implement to update the implementation from the accepted document baseline to this document commit, reuse existing tasks, and complete integration acceptance.” It fixes the old/new snapshots, checks related rules, and updates tasks, code, tests, and documents. The baseline moves only after full acceptance. Do not invent an old baseline from the current HEAD or mark an unmerged branch as delivered. Resume interrupted work from the task list.

All four application skills named above—`hai-app-create`, `hai-app-review`, `hai-app-tests`, and `hai-pr-review`—are distributed with the CLI. The source repository's `hai-app-create` / `hai-app-review` skills serve repository maintenance and have different names and scope.

### 4. Compile sources and package artifacts

Projects include deployment tooling by default; use `hai create my-app --no-deploy` to opt out. The deployment SDK is a development dependency and is excluded from runtime images.

Delivery roles are `serv` for a separate API backend, `web` for a static or SSR browser site, `app` for Android/`iOS` installers, and `desktop` for desktop installers. Fullstack containers use serv plus optional web; API uses serv; browser images for admin/website/h5/mobile-app use web. Native app/desktop outputs are not server Compose services. Use serv/web with `--images` and `--services`, and `--target app` or `--target desktop` for native packages. API service directories are `apps/<project>-serv`. Images and containers share the normalized root `package.json.name`: remove scope, lowercase, and replace invalid character runs with a hyphen. Missing or invalid names fail without falling back to directory names. Images use `localhost/hai-<project>-<role>:<buildId>`; containers use `hai-<project>-<environment>-<role>`. Images remain reusable across environments.

```sh
pnpm build
pnpm build --target image
pnpm build --target image --images web
pnpm build --target desktop --platform windows --arch x64
```

#### Build options

`--target` selects compile (default), image, app or desktop. `--images serv|web|serv,web` selects images. `--runtime auto|podman|docker` selects the local engine; auto prefers reachable Podman. `--network` overrides build networking, `--no-http-proxy` disables inherited Podman proxies, and `--sqlite-prebuild-mirror` selects a trusted HTTP(S) binary mirror. Native `--platform` and `--arch` require the matching host SDK and Rust toolchain. Builds do not load deployment environments or runtime secrets.

#### Describe packaging in `hai.json`

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

Dependency inputs are prepared under images/dependencies/ from package manifests, local archives and patches. Downloads, installation and production dependency packaging share `pnpm store and SQLite driver caches alongside stable dependency layers. Source changes should reuse downloaded packages. Empty caches still permit online builds. Windows node_modules cannot supply Linux native dependencies. Offline builds additionally require base images`, tools and matching ABI/architecture/libc binaries.

The default container supports CPU workloads or remote AI services without downloading extra GPU runtimes. To use the deployment host's GPU, customize the image and container runtime settings.

The root `package.json.version` identifies the application. `.hai/build/docker/<buildId>/` contains a manifest, selected image archives and SHA-256. Root sites use format 4; non-root sites use format 5 with `webBasePath`. partial marks incremental builds and `hasWeb` records topology. Rebuilding the same application version is allowed; unique build IDs/image references distinguish contents. Publish the local build pointer only after all exports succeed. Pin base images, middleware and tools; do not use latest.

For a website under `/yyy/`, set `PUBLIC_BASE_PATH`=/yyy explicitly during full and partial builds, including serv-only builds. Use matching CLI/Deploy versions supporting `format` 5; older `tools` reject it. Directory changes require a full deployment. SvelteKit fixes its base at build time; Vite defaults to relative assets and hash navigation. The API URL remains independent. See [path configuration, gateway rules and runtime screenshots](../configuration/delivery.md#网站部署在子目录).

### 5. Deploy artifacts to an environment

Node backends (Serv / SvelteKit SSR) reread the release `.env.runtime` on every start by default. Edit it, then run `docker restart <container>` or `podman restart <container>`; no image rebuild or extra override is needed. Existing deployments need one deployment with the new CLI. Removed settings do not survive through stale Compose injection. Managed connections in `middleware.env` retain precedence; private proxy identity and Node startup options remain deployment settings. Static Web, middleware, ports/mounts, and Nginx routes and limits keep their existing update flow. Gateway path, port or mount changes require a full deployment. Back up manual edits and copy permanent changes into the source environment; the next backend deployment regenerates the file.

`pnpm run deploy` offers no HTTPS, existing PEM certificate/key paths, or Let’s Encrypt for every container template. Relative paths resolve from the project root. Certificates are checked for domain, validity and key matching, then copied into private releases. A pinned official Certbot image handles issuance and renewal checks every 12 hours, with automatic Nginx reload. It requires terms acceptance, a real email, public DNS, port 80 and CA connectivity. Isolated servers use existing certificates. Certificate state stays on the server; keys stay out of application images. `--yes` reuses saved settings.

Configure `hai.json.deploy.provider.expose.https` or private `environment` overrides. Defaults are HTTPS 443 and HTTP redirection; omission retains HTTP. Enabling/disabling HTTPS or changing `mode`, `domain`, ports or supplied certificates requires a full deployment. See the [HTTPS guide](../../docs/usage/configuration/delivery.md#可选https证书). Plans use `root` for the project and `serviceDir` for the service source/configuration directory, exposing only public certificate metadata.

Image builds run at most two images concurrently by default; use `--concurrency 1` to reduce resource use. Dependency installation precedes source copies, and each side copies only its required source. Runtime images omit application declaration files, source maps and README files. Packaging validates and reuses middleware archives by image content ID and hashes application archives while copying. Delivery defaults to `.tar.gz`; explicit `--output release.tar` keeps an uncompressed archive. README is only outside the archive. Successful deployment removes its incoming upload/extraction, retains recovery configuration in releases, and keeps images in the container engine.

#### Prepare the environment and destination

The default deployment name comes from `package.json.name` at the project root (the nearest `hai.json` or lockfile directory), rejecting missing or invalid names, with an explicit environment appended. A fullstack `hai-delivery` project scanned at `packages/hai-delivery-serv` with `--env test` generates `/opt/hai/apps/hai-delivery-test` and `bundle-hai-delivery-test-<deploymentId>-<version>.tar.gz`. Remote directories, bundles, the Compose project, API/Web/middleware containers, data volumes, server credential state and incremental baselines share this name. Actual project names ending in `-serv` are preserved.

Artifact formats 4 and 5 record `primaryService` (serv/web); `hasWeb` describes the complete browser topology. Format 5 also records a non-root `webBasePath`. Only serv + web generates a same-origin API proxy. Rebuild artifacts using formats 1–3. Back up the existing deployment and verify project identity, volumes and managed credentials before establishing a new full deployment baseline. Tools do not migrate data across projects. Full deployments still remove obsolete service containers under the same Compose project; editing `deploy-target.json.directory` alone does not migrate resources.

For existing projects, update `build.images` names in `hai.json`, Dockerfile filenames and references first. Rename API service directories/packages and dependent references to -serv, then reinstall dependencies and build a complete artifact. Renaming archives or editing manifest files does not replace a new build.

The CLI `--project-name` option and SDK `DeployAppOptions.projectName` override have been removed. Obsolete overrides fail explicitly; maintain resource identity in the root `package.json.name`.

Prepare `.env.<environment>` and the project root `hai.json`, with image/native configuration in `build` and application deployment in `deploy`. Fullstack scripts still point to packages/<project>-serv, and API workspaces to apps/<project>-serv, only to scan runtime dependencies and module YAML. Frontend and backend share the project configuration.

`deploy` supports `${VARIABLE:fallback}` and hierarchical `HAI_DEPLOY_*` overrides, including whole JSON objects. Deployment precedence is process > `.env.<environment>.local` > `.env.<environment>` > legacy `.env.local` > `.env`. Other modules retain process > mode-private > legacy global-private > mode-public > base. The deployment-only private layer does not change Core runtime loading. Builds do not load deployment environments or secrets.

For existing projects, move the previous build object into `hai.json.build`, convert deployment YAML into `hai.json.deploy`, remove the old files and retain `HAI_DEPLOY_*` variables. Existing self-hosted S3 installations must use a full deployment for this upgrade: their old baseline contains an exited initialization service, which fails the dependency checks of new incremental packages. The full deployment also refreshes the `createBucket` middleware setting; subsequent incremental updates work normally.

The CLI `--project-name` option and SDK `DeployAppOptions.projectName` override have been removed. Obsolete overrides fail explicitly; maintain resource identity in the root `package.json.name`.

Direct deployment collects missing SSH settings once, supporting key/agent and password authentication. SSH settings go to `.env.<environment>.local`, with hidden password input and key paths only. Middleware public settings go to `.env.<environment>`, secrets to `.env.<environment>.local`. Use `--yes` to reuse complete settings without prompts; add `--skip-middleware` to retain middleware configuration. Bundle-only mode skips SSH questions and includes existing connections in `deploy-target.json`. Editing this file affects only that delivery. Offline passwords come from the operator environment variable referenced by the target, such as `HAI_DEPLOY_PROVIDER_SSH_PASSWORD`, and are not bundled.

Each delivery includes a private `.env.runtime` inside its tar; it is not an editable file beside the upload scripts. `--env test` defaults to `NODE_ENV=test`, dev to development, and prod/other modes to production. Explicit environment configuration can override this default. The generated file is not the saved configuration source; build optimization is separate. Regenerate old bundles after changing the saved environment.

The server persists managed middleware passwords in `<remoteDir>/managed-secrets.env` (mode 0600); back it up with data volumes. Each package supplies random first-use candidates without a build-machine cache. The online SDK, `deploy.sh`, `deploy.ps1` and `deploy-local.sh` resolve server values under the deployment lock and update both application connections and native middleware variables. The delivery tar stays immutable; only private server runtime files receive resolved values. Missing state with an existing corresponding volume stops deployment before services change: restore the server credential backup. Deployment never silently rotates passwords or deletes data. Normal deployment does not import legacy state; verified existing credentials can use the separate [controlled import](../../../packages/deploy/docs/credential-import.md), which is read-only until explicitly applied.

Whole `HAI_*` configuration supplied by sidecars or provisioners clears superseded leaf variables: Redis overrides no longer leave `HAI_CACHE_TYPE=memory`. Global `~/.hai/credentials.yml` fills missing settings only, respecting existing environment/process keys and parent objects. Deployment starts selected middleware and waits for PostgreSQL/MySQL/Redis/S3 health before serv/web; incremental deployment and recovery use the same order and preserve unselected containers.

Generated fullstack projects create different administrator passwords and transport key rings in `.env.dev/.env.test/.env.prod`. Commit these environment files to share them after cloning; local private files and process variables can override them. Before upload, deployment identifies missing or malformed `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` for transport-enabled applications. All nodes in an environment use the same valid ring from its environment file or a Secret Manager override; never generate one per node. CLI completion identifies the actual source of `HAI_ADMIN_DEFAULT_PASSWORD` without printing it, independently of log level. It applies only when initially creating the administrator. Offline scripts also identify the password variable in the server's private `.env.runtime`.

#### Configure only the middleware the application needs

Framework connections use `HAI_*`. Image-native variables such as `POSTGRES_*` and `RUSTFS_*` keep their required names in private `middleware-runtime.env`, loaded only by middleware. They no longer enter project settings or the application's `.env.runtime`; the application's incremental `middleware.env` contains framework settings only. Previously saved native entries are not automatically removed, but known generated native keys are excluded from new application environments.

Runtime lockfile dependencies and configuration determine middleware. Choose defaults, custom connections or keep settings. `--skip-middleware` skips configuration/provisioning. SQLite, memory cache and local storage need no external images. Complete bundles automatically include self-hosted middleware images. External services still require reachable destinations; cloud provisioning is not an offline operation.

#### Deployment options

`--env`/`--env-dir` select configuration. `--build` builds selected application images before packaging. `--services` selects Compose services; `--artifact-dir` selects existing artifacts. `--bundle-only` creates a tar and platform scripts without SSH. `--runtime` selects the local build/export engine; `--output` overrides the archive path, resolved from the command's working directory, and adds the application version suffix. `--yes` uses valid settings without interaction and reports missing required values.

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

Each delivery creates one `.hai/deploy/<environment>/bundle-<project>-<deploymentId>-<version>/` directory. Its outer files are the tar, `deploy.sh`, `deploy.ps1`, `deploy-target.json`, `read-target.awk`, `deploy-local.sh` and `README.txt`. Compose, private runtime environments, optional `web.conf`, the manifest and `apply.sh` are inside the tar, together with the selected application/middleware images and checksums. Copy the directory as a unit; do not expect private runtime files beside the upload scripts.

Explicit `--output release-prod.tar` produces `release-prod-<version>/release-prod-<version>.tar.gz` relative to the command directory, with companion files in that delivery directory. Before uploading, open `deploy-target.json` and check the server, SSH user and port, private-key/known-hosts paths and remote directory using the field descriptions.

Run `deploy.ps1` on Windows or `deploy.sh` on Linux/`macOS`; both read the same JSON and execute the same server workflow. The latter requires sh, awk, ssh and scp locally. Use `sh deploy.sh HOST [PORT] [USER]` to override the address, or `-IdentityFile` on `deploy.ps1` to override its key. Both support `HAI_DEPLOY_IDENTITY_FILE` and `HAI_DEPLOY_KNOWN_HOSTS_FILE` overrides. After moving to another computer or operating system, update the paths to actual files there.

On isolated Linux servers, copy the delivery directory and run `sh deploy-local.sh`, optionally passing the deployment root. The script verifies and extracts the adjacent tar and invokes the bundled `apply.sh` automatically. Every failed step exits nonzero. Image loading, service startup and HTTP checks are distinct steps. result-<deploymentId>.json records the result; current changes only after successful checks. Reapplying the same deployment ID stops clearly; a newly generated bundle for the same application version is allowed. Failed updates attempt to restore selected containers and configuration while preserving data volumes and diagnostics. Data already written by the application is not rolled back.

The bundle `manifest.json` records `partial` and `selectedServices`, and the apply script embeds the same choice. A complete build without `--services` is a full deployment; explicit service selection or a partial build is incremental. Incremental packages require a matching successful `current` baseline and cannot perform a first installation.

#### Before going fully offline

Complete bundles include self-hosted middleware archives and matching architecture; server startup never pulls images. Linux needs Docker/Podman, Docker Compose v2 or podman-compose 1.6.0+ (supports `--pull` never), sh, tar, sha256sum, awk, curl, util-linux flock, a filesystem supporting flock and filesystem/container permissions. Protect private bundle contents. Keep volume identities stable across versions. Verify actual offline startup, login, refresh, restart and persistence. HTTPS, certificates, DNS and external services need separate preparation.

Deployment and recovery retain a kernel lock on the fixed `.deploy.lock` file. Never delete, replace or steal it based on time. Active children may keep the lock after the parent is killed; all holders exiting or a restart releases it. Forced termination skips recovery traps: inspect the result, `current` and actual containers before recovering with a new bundle. See the [deployment guide](../../../packages/deploy/README.en.md).

Failures distinguish confirmed/unconfirmed local managed-process termination from unknown/finished remote scripts. SDK `getDeployCommandState(error)` exposes the deployment ID and result path. Only a fresh connection reading a complete, matching atomic result confirms the remote script and recovery finished; local SSH exit does not prove remote termination. Unknown execution never triggers automatic deployment or rollback retries.

### 6. Update the framework while keeping your application

From the application directory, ask the assistant to use [hai-framework-sync](../../../packages/cli/templates/skills/hai-framework-sync/SKILL.md):

> Upgrade hai-framework to the latest published version. Check current dependencies and the target release, explain changes and choices, then migrate dependencies, calls, configuration, and skills while preserving project-specific rules. Complete validation; do not publish or deploy the application.

You can request a specific version or ask for comparison only. The skill queries the actual registry/dist-tag, verifies target versions and engine requirements for every used package, compares cumulative changes, updates exact versions and the lockfile, and migrates public API usage, settings, scripts, and complete skill resources. Network failures or incomplete releases are reported as blockers; cached data is not presented as “latest.”

`hai init` can add missing AI entry files and skills to older projects while preserving existing files. It is not a framework upgrade command and does not overwrite old rules. Merge existing skills using the old template, application customizations, and new template. Framework `main` is not necessarily the version published to npm.

After upgrading, run the project's typecheck, lint, build, test, and affected E2E checks, including real authentication, data, and critical workflows. Rebuild deliverable images or installers, then deploy as described in section 5. A version edit or successful build alone does not complete an upgrade.

## Release inspection and native packaging

`hai upgrade 0.1.0-alpha.71` reads all consumed framework packages plus exact CLI/deploy artifacts, integrity, skills and catalog/lock/installed drift. It never installs or overwrites local/custom files; incomplete releases exit nonzero. JSON includes module migration preflight, backups and legacy-session boundaries. `hai deploy --env prod --plan` verifies local artifacts and reports identity, configuration source keys, selected/retained scope, baseline requirements and recovery directories without building, generating credentials or connecting to the target; unobserved remote state is explicitly not-inspected.

`hai build --target app --platform android|ios` creates and verifies new APK/IPA files. Add platforms and install Android SDK/JDK or `macOS`/Xcode, then configure signing. cap:sync only synchronizes. Missing platform/toolchain/artifacts fail. Release builds exclude `CAPACITOR_SERVER_URL` and reject reload URLs in synchronized native configuration. `build.app` lists App directories.

`schemaColumns(reldb, table, sql?)` inspects real columns. `migrateSchema(reldb, module, steps, { dryRun: true })` creates no ledger. Modules own their steps. Execution journals versions in `hai_schema_migrations`; SQLite/PostgreSQL are transactional, while MySQL implicit DDL commits require reentrant steps. Failures do not advance versions; retries inspect real state. Older code rejects newer ledgers. Stop old writers and back up DB/session cache first. Rollback restores compatible database and binaries together. See the [upgrade guide](workflow.en.md).

## Development and testing

Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` and `pnpm test:e2e` from the generated project, following its scripts. For container delivery, also test images, deployment scripts, health checks and recovery on the target platform. Browser checks do not replace native acceptance.

## License

Apache-2.0
