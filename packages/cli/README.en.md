# @h-ai/cli

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

[Framework home](../../README.en.md)

## Introduction

Generated projects enable `zh-CN`, `en-US` and `ja-JP` by default. Interactive setup can select Japanese as the default; fullstack can restrict locales through `fullstack.i18n.locales`. CLI messages select Chinese, English or Japanese using `HAI_CORE_DEFAULTLOCALE` → `LC_ALL` → `LC_MESSAGES` → `LANG`.

Use `hai` to create applications, add modules, generate starter code, build and deliver releases. It supports SvelteKit, independent APIs and separate frontend/backend workspaces. Follow the [usage guide](../../docs/usage/README.en.md) for the complete workflow.

## Core features

- Create admin, website, H5, API, mobile or fullstack applications.
- Add modules, configuration and AI guidance to existing projects.
- Generate starter pages, components, endpoints, models and migrations.
- Build selected images, deliver complete offline bundles or update selected services.

## Getting started

### Install the CLI

Use Node.js matching `engines` (`^22.23.4 || ^24.22.1 || ^26.12.1`) and pnpm 12.11.2. In PowerShell use `pnpm.cmd`.

```sh
pnpm add -g @h-ai/cli
hai --version
hai --help
```

Generated framework dependencies use the exact CLI version. Installation failures show the command, exit code and output, leaving files available for retry. To test unpublished source, use the local development commands below.

### Create an application

```sh
hai create my-app --type fullstack --frontends web --yes
cd my-app
pnpm dev
```

Omit options for interactive choices, or use `--yes` for defaults. Installation and Git initialization are enabled; disable them with `--no-install` / `--no-git`. Deployment tools are development dependencies by default; use `--no-deploy` to omit them.

### Project templates

| Type                       | Generated project                                                               |
| -------------------------- | ------------------------------------------------------------------------------- |
| `admin` / `website` / `h5` | SvelteKit admin, website or mobile web application                              |
| `api`                      | Shared contract and API service in a pnpm workspace                             |
| `mobile-app`               | Svelte + Vite + Capacitor                                                       |
| `fullstack`                | Contract, API, shared UI and selected Web/App/Desktop; miniapp is a placeholder |

Use `--template minimal|default|full|custom` for module presets and `--features iam,db,...` for application modules. Fullstack keeps IAM, database, cache, crypto, storage and audit for its management UI. When `--features` is omitted, it also enables feedback and reach. An explicit feature list keeps optional modules under your control; other application types still require feedback to be selected. AI/ONNX/CUDA are not installed by default.

A standalone `mobile-app` with IAM or crypto installs frontend crypto and enables encrypted typed-client transport by default. Without crypto, a deliberate plaintext API remains supported. Use `PUBLIC_API_TRANSPORT=off` only with a matching plaintext service; `PUBLIC_API_KEY_EXCHANGE_PATH` overrides the public exchange subpath. A failed handshake never falls back to plaintext, and server private keys never enter the client. Cleanup closes client transport before crypto initialized by that client.

### Fullstack mini administration

Includes user management, roles, audit logs, avatars, personal settings, themes, languages, onboarding and help. Sign in as `admin` using the random `HAI_ADMIN_DEFAULT_PASSWORD` in root `.env.local`. Existing users are not reset. Adapt the sample business rules as needed; authorization remains on the server.

Generated fullstack projects save the initial administrator password and development transport key ring in ignored `.env.local`; deployment modes may override them in `.env.<mode>.local`. Before upload, deployment identifies missing or malformed `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` for transport-enabled applications. Distribute the same valid managed ring through a Secret Manager instead of generating one per node. CLI completion identifies the actual source of `HAI_ADMIN_DEFAULT_PASSWORD` without printing it, independently of log level. It applies only when initially creating the administrator. Offline scripts also identify the password variable in the server's private `.env.runtime`.

### Application configuration and display

See `.env.example` for settings. Commit shared `.env` and `.env.dev/.env.test/.env.prod`; keep private overrides in `.env.local`. Precedence is process environment > local private file > selected environment > shared base. API projects keep these files in the service directory; fullstack uses the root. See the [usage guide](../../docs/usage/README.en.md) for YAML, environment overrides and application metadata.

### Existing projects and code generation

Creating or adding AI also installs reldb and vecdb. Generated startup initializes database → vector store → AI and checks reverse cleanup failures. Production profiles select PostgreSQL (or the chosen MySQL), Redis, S3 and Qdrant for enabled modules, using Compose DNS names `db/cache/storage/vecdb`. Inject database/cache passwords, S3 credentials, model keys and protected Qdrant keys privately. Override internal addresses when running outside Compose. Production Reach intentionally rejects an empty provider array until a real `HAI_REACH_PROVIDERS` JSON secret is supplied. `hai add` preserves configured production values, adds missing fields, and requires integration into the existing application entry point.

```sh
hai add storage
hai init
hai generate
hai generate page dashboard
hai generate component UserCard
hai generate api orders
hai generate model order
hai generate migration add-orders
```

`hai add` resolves module dependencies and fills configuration. `hai init` fills missing configuration and AI files while preserving custom content. `--force` regenerates module configuration; review the diff before using it.

Pages use SvelteKit file routes. APIs use either SvelteKit routes or the target serv application's shared contract/procedure structure. API/fullstack roots select a unique backend automatically; use `--workspace <package-name-or-relative-path>` when multiple applications apply, or enter the target workspace. Plain Vite page/API combinations are rejected. Serv does not accept `--output`; SvelteKit route output must stay inside `src/routes`; custom `kit.files` layouts are rejected rather than guessed. SvelteKit API targets must already install `@h-ai/kit` and `zod`. Serv updates only existing aggregation points with `@hai-generator` markers; unknown structures require manual integration. Names cannot contain paths. Existing files require `--force`, which never replaces registered business domains. Files are checked as one batch and rolled back on write failure. Migrations only generate up/down functions; inspect data effects before running them.

CLI messages support Chinese, English and Japanese. The first nonempty value from `HAI_CORE_DEFAULTLOCALE`, `LC_ALL`, `LC_MESSAGES` and `LANG` selects the initial language. Regional `en`/`zh`/`ja` variants use the existing dictionaries; `C`/`POSIX` use English. Unknown languages preserve the current core locale, which defaults to Chinese. In PowerShell, run `$env:HAI_CORE_DEFAULTLOCALE='en-US'` before `hai generate`. Internal commands also honor in-process locale changes via `core.i18n.setGlobalLocale('en-US')`. Omitting a type or name opens a prompt; cancellation writes no files. Generated Chinese code comments and user-supplied names remain unchanged.

Prompts, validation, module/template names, descriptions and completion messages in `create`, `add`, `init` and `generate` use the current CLI locale. Catalog labels are translated when read, including after an in-process locale change. The CLI locale is separate from the generated application’s `core.defaultLocale`; generated Chinese README text, configuration/code comments, user input and original external-tool diagnostics remain unchanged.

### Build and deploy

Database connections are validated against the selected backend’s public schema before saving. MySQL `ssl` accepts only `false` or a strict TLS object; `{}` verifies the certificate chain and DNS identity by default. PostgreSQL keeps its modes. CLI bundles the pure schemas and Zod, so validation needs no database package or driver in the target application; running that application still requires its dependencies. Deployment still requires an installed, resolvable `@h-ai/deploy` (a development dependency in generated projects).

`pnpm build` compiles sources. Each image has its own Dockerfile in `images/`, selected through `hai.json.build.images`, alongside the project deployment settings in `deploy`. `--images` selects build outputs; `--services` selects deployed services. Automatic engine detection prefers reachable Podman, then Docker. Downloads, installation and production dependency packaging share package and SQLite driver caches to avoid downloading them again.

The default container supports CPU workloads or remote AI services without downloading extra GPU runtimes. To use the deployment host's GPU, customize the image and container runtime settings.

After filtering caller `HAI_/PUBLIC_/VITE_` values, CLI injects only internally generated `HAI_BUILD_ID/HAI_BUILD_COMMIT`; Docker passes the image batch identity to compilation. Feedback reads each browser/server artifact's own `appVersion/buildId/commit`, with its own manifest version and a shared ID within one SSR build. Missing owning Git commits are explicitly `unknown`. The three-field `build-metadata.json` matches inlined code and supports comparison with actual API/ZIP evidence.

```sh
pnpm build --target docker
pnpm run deploy --env prod
pnpm run deploy --env prod --build --services web
pnpm run deploy --env prod --build --bundle-only
```

The default deployment name comes from `package.json.name` at the project root (the nearest `hai.json` or lockfile directory), falling back to the root directory name, with an explicit environment appended. A fullstack `hai-delivery` project scanned at `packages/hai-delivery-serv` with `--env test` generates `/opt/hai/apps/hai-delivery-test` and `bundle-hai-delivery-test-<deploymentId>-<version>.tar`. Remote directories, bundles, the Compose project, API/Web/middleware containers, data volumes, credential cache filenames and incremental baselines share this name. Actual project names ending in `-serv` are preserved.

Names identify resources. For existing deployments, retain `--project-name hai-delivery-serv` in the project deploy script (`--env test` still adds the environment) and keep the original credential cache to reuse the original directory, volumes and baseline. Editing `deploy-target.json.directory` does not migrate Compose resources. Renaming requires a separate data migration and new baseline; old resources are never moved or deleted automatically. Regenerate existing offline bundles.

Complete bundles include application and self-hosted middleware images. Deployment caches, archives and operation directories default to `.hai/deploy/<environment>/` at the project root; `--output` can override the archive path relative to the command directory. Bundle-only mode asks no SSH questions, reuses existing connections, and creates a tar, `deploy-target.json` with field descriptions, Windows PowerShell 5+ `deploy.ps1` and Linux/macOS `deploy.sh`. Check the target and fill missing fields before upload. Both scripts read it, support key/agent and password authentication, and need no Node/pnpm. The target references only `passwordEnv` (default `HAI_DEPLOY_PROVIDER_SSH_PASSWORD`); the operator environment supplies the password to this SSH/SCP process tree only, never to the application environment or bundle. Target edits affect that bundle only and never write back to the project. On isolated Linux servers, copy the whole directory and run `sh deploy-local.sh` to extract and deploy automatically. First installations require a complete bundle; partial updates preserve other services and volumes. Each step reports its result; failure exits nonzero and attempts recovery. See [deployment](../deploy/README.en.md) for prerequisites, caching, versions and recovery.

Direct deployment asks for missing SSH connection and authentication fields once, then reuses complete valid settings, including with `--yes`. Password input is hidden and preserves spaces and leading zeros. New connection settings and middleware secrets go to `.env.<environment>.local`; legacy `.env.local` remains a fallback. The deployment SDK resolves `HAI_DEPLOY_*` as process > environment private > environment public > legacy global private > base; other modules use process > environment private > legacy global private > environment public > base. This private layer is specific to the deployment SDK and does not change ordinary Core loading. With complete target-environment middleware settings, `--yes` preserves them without asking or provisioning cloud resources again; interactive mode still lets you select the scope.

Failures display local managed-process termination separately from remote unknown/finished-script state and the server result path. Local SSH exit does not prove remote termination. Inspect unknown server state first; CLI never reruns deployment or rollback automatically. Windows command execution uses an embedded system PowerShell/.NET Job and requires Add-Type; failure never starts an unmanaged command.

Normal foreground deployment and synchronous failure recovery explicitly unlock `.deploy.lock` after finalization and terminal-result publication, so background services do not block later deployments. On HUP/INT/TERM or a killed parent shell, active child commands retain the inherited lock until every holder exits or the server restarts. Keep the lock file permanently; never delete or replace it.

Build desktop installers with `pnpm build --target desktop --platform windows|linux|macos --arch x64|arm64`, using the target system and toolchain. Test native installers separately from container-hosted web pages.

### AI-assisted development

Root `AGENTS.md` points to `.agents/skills/`; Claude, Copilot and OpenCode entry files reference the same rules. Use [application development](templates/skills/hai-app-create/SKILL.md) for features, [review](templates/skills/hai-spec-review/SKILL.md) and [implementation](templates/skills/hai-spec-implement/SKILL.md) for larger specifications, and [framework sync](templates/skills/hai-framework-sync/SKILL.md) for upgrades.

Skill entries define task boundaries and load adjacent references as needed. `hai init` / `hai add` fill missing content; merge existing custom rules deliberately and copy complete skill directories when syncing.

## Development and testing

### Local development usage

Run from the framework repository root to create projects from current source. Deployment gates additionally require reachable Podman/Docker.

```sh
pnpm --filter @h-ai/cli build
node packages/cli/dist/index.js create ../my-app
pnpm --filter @h-ai/cli typecheck
pnpm --filter @h-ai/cli lint
pnpm --filter @h-ai/cli test
pnpm check:skills
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:scaffold-gates --list --json
pnpm --filter @h-ai/cli test:deploy-gates
```

The eleven scaffold scenarios retain real installation, compilation and HTTP/browser checks for every application type. The heavy scaffold and generated-route runtime files run in sequential batches because measured build and installation resource contention made concurrent runs slower. The three smaller locale, CLI process and environment-consumption files can share the runtime batch, with at most two file workers. Each scenario uses the complete build already provided by its E2E entry; existing production build isolation checks inspect nonempty generated outputs after E2E. Real container deployment selects API, SSR (admin represents the shared website/h5 Dockerfile and deployment branch), static mobile and fullstack shapes. Ownership, authentication/transport, incremental updates, damaged artifacts and rollback checks remain. Fixtures enable init and verify orphan reaping; a fast gate runs the production Nginx version against the public bundle with `nginx -t`. Unit tests do not probe engines. Workspace compilation builds contracts through the dependency graph; fullstack prepares shared i18n first without compiling contracts twice.

Scaffold gates generate real projects and run install, typecheck, lint, build, tests and browser workflows, including generated HTTP routes, CLI process locale selection and environment file consumption. Use `--generate` or `--i18n` for focused reruns. Deployment gates cover actual resource ownership and dynamic host port isolation, as well as offline bundles, SSH/manual deployment, incremental updates and rollback. Cleanup uses only container IDs and private image tags recorded by the current run. Safe metadata remains in ignored `tmp/validation/module-review/VERIFY-05/`. Produced browser screenshots, traces and reports remain under ignored `tmp/validation/module-review/scaffold-browser/` or `deploy-browser/` by default. Explicit evidence, HTML report and output paths are respected; temporary projects, keys, data and processes are still cleaned up. Native shells and real cloud providers need separate acceptance.

Optional Windows installer acceptance requires the Rust `x86_64-pc-windows-msvc` target and MSVC build tools. Set `HAI_CLI_NATIVE_BUILD=1` and run `pnpm --filter @h-ai/cli test:scaffold-gates`; the existing fullstack scenario builds an NSIS installer and checks the application-root version against its filename. `CARGO_BUILD_JOBS=2` limits Rust compilation concurrency. Native UI interactions and device capabilities require separate acceptance.

Deployment fixtures inspect pinned public base images and pull only confirmed missing images; HAI_DEPLOY_E2E_MIRROR remains available. Public image caches are never cleanup targets. A successful create records its container ID before asynchronous APT/pip/sshd preparation inside a private PID namespace. Preparation errors, deadlines and cooperative cancellation wait for the local client to close, then remove and verify that exact owned ID; only the nested Podman fixture is privileged. HAI_DEPLOY_E2E_APT_MIRROR accepts a mirror hostname and keeps HTTPS. Ownership tests use run-specific private tags of pinned public images while preserving foreign same-content tags, retag protection, dynamic ports and external sentinels. A lost create acknowledgment without a trusted ID, or a forcibly terminated test process, remains unknown and never authorizes adoption by name or label.

`--generate` runs focused route gates: it reuses installed workspace dependencies, generates and builds real SvelteKit, serv API and fullstack backend projects, then accesses their new routes, including transport. It does not replace the full installation and browser matrix.

`test:e2e` gives each server explicit isolated backends and an absolute data directory. Server children do not inherit external `HAI_*` / `PUBLIC_*` / `VITE_*` settings or read the user's `.env.local`. Test-only `HAI_E2E=1` preserves ordinary development/production dotenv behavior and shared-backend requirements; transport cases use a fresh trusted SM2 ring and the actual registry. Scaffold browser runs also use an independent TCP counter to verify that external database settings are never contacted. Complete deployment acceptance retains real Redis/S3, incremental updates and rollback for fullstack.

`--i18n` builds the CLI and checks language precedence, help, successful generation and errors in separate processes, alongside Chinese/English/Japanese prompt, validation, cancellation and create/add/init cases.

## Skill workflows and frontend guidance

The workflow uses hai-spec-review, hai-spec-implement, hai-app-create, hai-app-tests, hai-app-review and hai-pr-review. The [handoff contract](templates/skills/hai-spec-implement/handoff.md) connects requirements, acceptance, findings and evidence while retaining Git document baselines.

UI delivery includes [hai-ui-design](templates/skills/hai-ui-design/SKILL.md), hai-ui and [hai-ui-review](templates/skills/hai-ui-review/SKILL.md). API templates exclude frontend skills. init/add preserve private entrypoints and backfill missing resources. Repository entrypoints use the same names for shared responsibilities.

### Feedback and offline analysis

A new `hai create my-app --type fullstack --frontends web --yes` includes feedback by default; API projects require `--features feedback`. Signed-in users can submit reports. Only administrators see the review menu and can read, process, reopen or export reports. Database, storage, reach and authentication dependencies are included. The generated app provides intake, paginated review and server contracts. Configure recipients and the administrator URL in `_feedback.yml`; production requires shared DB, private S3 and real SMTP. Console is a development provider.

Offline commands: `hai feedback summary <bundle.zip>`, `inspect`, `evidence --request-id <ID> --page 1 --page-size 20`, and `view`. The viewer binds only to loopback and closes on Ctrl+C; no production connection is needed.

## License

Apache-2.0
