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

The following uses the target beta version. Check the published channel and availability of `1.0.0-beta.1` before installing. The acceptance target does not mean it has been published; an unversioned install selects latest rather than beta.

```sh
pnpm view @h-ai/cli dist-tags
pnpm view @h-ai/cli@1.0.0-beta.1 version
pnpm add -g @h-ai/cli@1.0.0-beta.1
hai --version
hai --help
```

Generated framework dependencies use the exact CLI version. Installation failures show the command, exit code and output, leaving files available for retry. To test unpublished source, use the local development commands below.

### Create an application

```sh
hai create my-app --type fullstack --frontends web --defaults
cd my-app
pnpm dev
```

Omit options for interactive choices, or use `--defaults` for defaults. Installation and Git initialization are enabled; disable them with `--no-install` / `--no-git`. Deployment tools are development dependencies by default; use `--no-deploy` to omit them.

### Project templates

| Type                       | Generated project                                                               |
| -------------------------- | ------------------------------------------------------------------------------- |
| `admin` / `website` / `h5` | SvelteKit admin, website or mobile web application                              |
| `api`                      | Shared contract and API service in a pnpm workspace                             |
| `mobile-app`               | Svelte + Vite + Capacitor                                                       |
| `fullstack`                | Contract, API, shared UI and selected Web/App/Desktop; miniapp is a placeholder |

Creation always uses the full applicable modules and examples, including AI, vector storage and feedback on servers. Clients retain their dependency boundaries. Installation is larger, and examples need adaptation. `--template`, `--features` and `--examples/--no-examples` have been removed; `create --yes/-y` is now `--defaults`. Old options fail explicitly. `deploy --yes` and existing projects keep their behavior.

Standalone `mobile-app` includes frontend crypto and encrypted typed-client transport. For an existing plaintext API, explicitly set `PUBLIC_API_TRANSPORT=off`. `PUBLIC_API_KEY_EXCHANGE_PATH` overrides the public exchange subpath. Handshake failures never fall back, server private keys never enter clients, and cleanup closes transport before client-owned crypto.

### Static websites and GitHub Pages

New websites include the full modules and examples and default to Node SSR. Before static publication, remove server business dependencies and initialization, custom APIs and actions, retaining Core/Kit/UI. There is no lightweight creation option. Existing websites without these dynamic capabilities can use the static build below.

Website defaults to Node SSR. Set `HAI_BUILD_STATIC=1` and `PUBLIC_BASE_PATH=/docs-site` (replace docs-site with the repository name; segments allow only ASCII letters, digits, _, . and -; no trailing slash, empty for a root site) for `pnpm build` to generate the static build directory. The static flag accepts 0/1 and applies only to compile. PUBLIC_BASE_PATH also supports Docker website builds; native app/desktop targets reject website paths. Static builds reject server-side business modules, custom APIs/actions and pages that were not prerendered, preserve production guards and use no SPA fallback. The default health API is excluded.

Builds do not read root dotenv files, and Kit uses an isolated env directory. The static directory is public: ordinary images, fonts and other assets are copied as supplied. Keep private content out of it; static builds reject .env/.env.* files and symbolic links. Upload only build with include-hidden-files:true, then verify the repository base path, deep-link refresh, assets and absence of private sentinel values. See the [static website guide (Chinese)](../../docs/usage/configuration/delivery.md#静态website与github-pages).

The website contact form is a UI example without a message service. Submission shows a Toast explaining this and keeps the input. Connect a real service and verify loading, success and failure states before using it for enquiries.

### Host a website under a path

SvelteKit admin/h5/website templates read the build-process value `PUBLIC_BASE_PATH=/yyy` into `kit.paths.base`, defaulting to an empty string. Rebuild when changing it and preserve the prefix at the gateway. Vite Web defaults to `base: './'`, relative entry/runtime-config.js URLs and hash routing; a gateway can strip `/yyy/` when forwarding to a root-hosted static server. An explicit PUBLIC_BASE_PATH fixes the Vite base. Configure the API URL independently.

Docker builds also accept an explicit PUBLIC_BASE_PATH. A non-root path produces artifact format 5 with webBasePath, allowing the deployment SDK to generate matching proxy rules, health checks and the public URL; an extra gateway must preserve this prefix. Root artifacts remain format 4. Keep the same path for full and partial builds, including serv-only builds; path changes require a full deployment. Format 5 requires matching CLI/Deploy versions and is rejected by older tools. See [path configuration and runtime screenshots](../../docs/usage/configuration/delivery.md#网站部署在子目录).

### Fullstack mini administration

Includes user management, roles, audit logs, avatars, personal settings, themes, languages, onboarding and help. Sign in as `admin` using the random `HAI_ADMIN_DEFAULT_PASSWORD` in selected `.env.dev/.env.test/.env.prod`. Existing users are not reset. Adapt the sample business rules as needed; authorization remains on the server.

Generated fullstack projects create different administrator passwords and transport key rings in `.env.dev/.env.test/.env.prod`. Commit these environment files to share them after cloning; local private files and process variables can override them. Before upload, deployment identifies missing or malformed `HAI_CRYPTO_TRANSPORT_SERVERKEYRING` for transport-enabled applications. All nodes in an environment use the same valid ring from its environment file or a Secret Manager override; never generate one per node. CLI completion identifies the actual source of `HAI_ADMIN_DEFAULT_PASSWORD` without printing it, independently of log level. It applies only when initially creating the administrator. Offline scripts also identify the password variable in the server's private `.env.runtime`.

### Application configuration and display

Templates default to `pretty` logging and install `pino-pretty` as a runtime dependency; set `HAI_CORE_LOGGING_FORMAT=json` for JSON. Startup failures retain the module, error code and configuration fields; occupied ports report `EADDRINUSE`, address and port.

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

### SvelteKit endpoint security

Select crypto when creating admin, website or h5 projects to enable transport in `_kit.yml`; its default remains false. The server uses separately generated environment key rings, and the root layout exposes only public transport settings. Private IP/time policies remain server-side. Select db for a database registry; an in-memory registry without db is limited to development/test. Static websites have no dynamic endpoints.

Path rules use `encryption: required / disabled` for encrypted internal APIs and ordinary HTTPS integrations. Conflicts and missing required transport reject host creation. Fullstack management always requires transport; use scoped rules for plaintext exceptions. See [endpoint access and encryption](../../docs/usage/configuration/request-access.md).

### Optional HTTPS certificates

`pnpm run deploy` offers no HTTPS, existing PEM certificate/key paths, or Let’s Encrypt for every container template. Relative paths resolve from the project root. Certificates are checked for domain, validity and key matching, then copied into private releases. A pinned official Certbot image handles issuance and renewal checks every 12 hours, with automatic Nginx reload. It requires terms acceptance, a real email, public DNS, port 80 and CA connectivity. Isolated servers use existing certificates. Certificate state stays on the server; keys stay out of application images. `--yes` reuses saved settings.

Configure `hai.json.deploy.provider.expose.https` or private environment overrides. Defaults are HTTPS 443 and HTTP redirection; omission retains HTTP. Enabling/disabling HTTPS or changing mode, domain, ports or supplied certificates requires a full deployment. See the [HTTPS guide](../../docs/usage/configuration/delivery.md#可选https证书). Plans use `root` for the project and `serviceDir` for the service source/configuration directory, exposing only public certificate metadata.

### Build and deploy

Default/custom middleware configuration preserves all effective settings for the same backend, including `publicEndpoint`, pool and operation log options absent from the form. Managed services replace connection selectors and credentials. Restore fields already lost from old parent JSON before rebuilding; see [middleware settings](../deploy/README.en.md#configure-only-the-middleware-the-application-needs).

Node backends (Serv / SvelteKit SSR) reread the release `.env.runtime` on every start by default. Edit it, then run `docker restart <container>` or `podman restart <container>`; no image rebuild or extra override is needed. Existing deployments need one deployment with the new CLI. Removed settings do not survive through stale Compose injection. Managed connections in `middleware.env` retain precedence; private proxy identity and Node startup options remain deployment settings. Static Web, middleware, ports/mounts, and Nginx routes and limits keep their existing update flow. Gateway path, port or mount changes require a full deployment. Back up manual edits and copy permanent changes into the source environment; the next backend deployment regenerates the file.

Image builds run at most two images concurrently by default; use `--concurrency 1` to reduce resource use. Dependency installation precedes source copies, and each side copies only its required source. Runtime images omit application declaration files, source maps and README files. Packaging validates and reuses middleware archives by image content ID and hashes application archives while copying. Delivery defaults to `.tar.gz`; explicit `--output release.tar` keeps an uncompressed archive. README is only outside the archive. Successful deployment removes its incoming upload/extraction, retains recovery configuration in releases, and keeps images in the container engine.

Database connections are validated against the selected backend’s public schema before saving. MySQL `ssl` accepts only `false` or a strict TLS object; `{}` verifies the certificate chain and DNS identity by default. PostgreSQL keeps its modes. CLI bundles the pure schemas and Zod, so validation needs no database package or driver in the target application; running that application still requires its dependencies. Deployment still requires an installed, resolvable `@h-ai/deploy` (a development dependency in generated projects).

`pnpm build` compiles sources. Each image has its own Dockerfile in `images/`, selected through `hai.json.build.images`, alongside the project deployment settings in `deploy`. `--images` selects build outputs; `--services` selects deployed services. Automatic engine detection prefers reachable Podman, then Docker. Downloads, installation and production dependency packaging share package and SQLite driver caches to avoid downloading them again.

The default container supports CPU workloads or remote AI services without downloading extra GPU runtimes. To use the deployment host's GPU, customize the image and container runtime settings.

After filtering caller `HAI_/PUBLIC_/VITE_` values, CLI injects only internally generated `HAI_BUILD_ID/HAI_BUILD_COMMIT`; Docker passes the image batch identity to compilation. Feedback reads each browser/server artifact's own `appVersion/buildId/commit`, with its own manifest version and a shared ID within one SSR build. Missing owning Git commits are explicitly `unknown`. The three-field `build-metadata.json` matches inlined code and supports comparison with actual API/ZIP evidence.

Delivery roles are `serv` for a separate API backend, `web` for a static or SSR browser site, `app` for Android/iOS installers, and `desktop` for desktop installers. Fullstack containers use serv plus optional web; API uses serv; browser images for admin/website/h5/mobile-app use web. Native app/desktop outputs are not server Compose services. Use serv/web with `--images` and `--services`, and `--target app` or `--target desktop` for native packages. API service directories are `apps/<project>-serv`. Images and containers share the normalized root `package.json.name`: remove scope, lowercase, and replace invalid character runs with a hyphen. Missing or invalid names fail without falling back to directory names. Images use `localhost/hai-<project>-<role>:<buildId>`; containers use `hai-<project>-<environment>-<role>`. Images remain reusable across environments.

```sh
pnpm build --target image
pnpm run deploy --env prod
pnpm run deploy --env prod --build --services web
# Use one --services with comma-separated names; quote the value for PowerShell
pnpm run deploy --env prod --build --services "serv,web"
pnpm run deploy --env prod --build --bundle-only
```

The default deployment name comes from `package.json.name` at the project root (the nearest `hai.json` or lockfile directory), rejecting missing or invalid names, with an explicit environment appended. A fullstack `hai-delivery` project scanned at `packages/hai-delivery-serv` with `--env test` generates `/opt/hai/apps/hai-delivery-test` and `bundle-hai-delivery-test-<deploymentId>-<version>.tar.gz`. Remote directories, bundles, the Compose project, API/Web/middleware containers, data volumes, server credential state and incremental baselines share this name. Actual project names ending in `-serv` are preserved.

Artifact formats 4 and 5 record primaryService (serv/web); hasWeb describes the complete browser topology. Format 5 also records a non-root webBasePath. Only serv + web generates a same-origin API proxy. Rebuild artifacts using formats 1–3. Back up the existing deployment and verify project identity, volumes and managed credentials before establishing a new full deployment baseline. Tools do not migrate data across projects. Full deployments still remove obsolete service containers under the same Compose project; editing deploy-target.json.directory alone does not migrate resources.

For existing projects, update build.images names in hai.json, Dockerfile filenames and references first. Rename API service directories/packages and dependent references to -serv, then reinstall dependencies and build a complete artifact. Renaming archives or editing manifest files does not replace a new build.

The CLI --project-name option and SDK DeployAppOptions.projectName override have been removed. Obsolete overrides fail explicitly; maintain resource identity in the root package.json.name.

The server persists managed middleware passwords in `<remoteDir>/managed-secrets.env` (mode 0600); back it up with data volumes. Each package supplies random first-use candidates without a build-machine cache. The online SDK, deploy.sh, deploy.ps1 and deploy-local.sh resolve server values under the deployment lock and update both application connections and native middleware variables. The delivery tar stays immutable; only private server runtime files receive resolved values. Missing state with an existing corresponding volume stops deployment before services change: restore the server credential backup. Deployment never silently rotates passwords or deletes data. Legacy credentials can be explicitly verified and imported using the procedure below.

Complete bundles include application and self-hosted middleware images. Deployment caches, archives and operation directories default to `.hai/deploy/<environment>/` at the project root; `--output` can override the archive path relative to the command directory. Interactive bundle-only mode offers to add or update SSH settings after builds and middleware configuration, before packaging. It saves them in `.env.<environment>.local` for the current and subsequent targets; `--yes` or declining reuses existing settings. The delivery directory contains only a tar, deploy-local.sh, read-target.awk, README.txt, `deploy-target.json` with field descriptions, Windows PowerShell 5+ `deploy.ps1` and Linux/macOS `deploy.sh`. Check the target and fill missing fields before upload. Both scripts read it, support key/agent and password authentication, and need no Node/pnpm. The target references only `passwordEnv` (default `HAI_DEPLOY_PROVIDER_SSH_PASSWORD`); the operator environment supplies the password to this SSH/SCP process tree only, never to the application environment or bundle. Target edits affect that bundle only and never write back to the project. On isolated Linux servers, copy the whole directory and run `sh deploy-local.sh` to extract and deploy automatically. First installations require a complete bundle; partial updates preserve other services and volumes. Each step reports its result; failure exits nonzero and attempts recovery. See [deployment](../deploy/README.en.md) for prerequisites, caching, versions and recovery.

Direct deployment asks for missing SSH connection and authentication fields once, then reuses complete valid settings, including with `--yes`. Password input is hidden and preserves spaces and leading zeros. New connection settings and middleware secrets go to `.env.<environment>.local`; legacy `.env.local` remains a fallback. The deployment SDK resolves `HAI_DEPLOY_*` as process > environment private > environment public > legacy global private > base; other modules use process > environment private > legacy global private > environment public > base. This private layer is specific to the deployment SDK and does not change ordinary Core loading. With complete target-environment middleware settings, `--yes` preserves them without asking or provisioning cloud resources again; interactive mode still lets you select the scope.

Failures display local managed-process termination separately from remote unknown/finished-script state and the server result path. Local SSH exit does not prove remote termination. Inspect unknown server state first; CLI never reruns deployment or rollback automatically. Windows command execution uses an embedded system PowerShell/.NET Job and requires Add-Type; failure never starts an unmanaged command.

Normal foreground deployment and synchronous failure recovery explicitly unlock `.deploy.lock` after finalization and terminal-result publication, so background services do not block later deployments. On HUP/INT/TERM or a killed parent shell, active child commands retain the inherited lock until every holder exits or the server restarts. Keep the lock file permanently; never delete or replace it.

Build desktop installers with `pnpm build --target desktop --platform windows|linux|macos --arch x64|arm64`, using the target system and toolchain. Test native installers separately from container-hosted web pages.

### AI-assisted development

Root `AGENTS.md` points to `.agents/skills/`; Claude, Copilot and OpenCode entry files reference the same rules. Use [application development](templates/skills/hai-app-create/SKILL.md) for features, [review](templates/skills/hai-spec-review/SKILL.md) and [implementation](templates/skills/hai-spec-implement/SKILL.md) for larger specifications, and [framework sync](templates/skills/hai-framework-sync/SKILL.md) for upgrades.

Skill entries define task boundaries and load adjacent references as needed. `hai init` / `hai add` fill missing content; merge existing custom rules deliberately and copy complete skill directories when syncing.

## Skill workflows and frontend guidance

The workflow uses hai-spec-review, hai-spec-implement, hai-app-create, hai-app-tests, hai-app-review and hai-pr-review. The [handoff contract](templates/skills/hai-spec-implement/handoff.md) connects requirements, acceptance, findings and evidence while retaining Git document baselines.

UI delivery includes [hai-ui-design](templates/skills/hai-ui-design/SKILL.md), hai-ui and [hai-ui-review](templates/skills/hai-ui-review/SKILL.md). API templates exclude frontend skills. init/add preserve private entrypoints and backfill missing resources. Repository entrypoints use the same names for shared responsibilities.

The fullstack example separates `admin`, `audit_admin`, `config_admin`, `business_operator` and basic `user` duties in application configuration. System administrators cannot take over other duty accounts. CLI creates independent random bootstrap passwords for all four duties in each `.env.dev/.env.test/.env.prod`, preserving shared environment configuration and local or process overrides, and existing accounts are never reset or reassigned. Select security enhancements in `_iam.yml`/`_audit.yml`; see the generated README.

The [fullstack security configuration guide template](templates/apps/fullstack/docs/security-configuration.md.hbs) explains every switch, default, prerequisite and effect on users. New projects include it as `docs/security-configuration.md`, linked from their README.

### Feedback and offline analysis

A new `hai create my-app --type fullstack --frontends web --defaults` includes feedback by default; API projects also include it without additional options. Members and business operators can submit reports. Only `business_operator` sees the review menu and can read, process, reopen or export reports. Database, storage, reach and authentication dependencies are included. Fullstack provides intake, paginated review and server contracts; API projects provide the server contracts. Production uses shared DB and private S3. Notifications independently select `disabled`, `console` or `reach`; `console` defaults to `metadata` only. Select `consoleContent: summary` explicitly for summaries, or configure Reach providers and recipients for actual delivery.

Register collectEvidence through feedback.init(config, { collectEvidence }) to await business text or archives. _feedback.yml includes businessCollectionTimeoutMs and webhookUrl/webhookSecret/webhookTimeoutMs. Webhook delivery retries durably and exposes status and administrator retry in details. Keep secrets in private server environment settings; see [feedback examples](../feedback/README.en.md).

Offline commands: `hai feedback summary <bundle.zip>`, `inspect`, `evidence --request-id <ID> --page 1 --page-size 20`, and `view`. The viewer binds only to loopback and closes on Ctrl+C; no production connection is needed.

## Release inspection and native packaging

upgrade reads ESM-only packages and pnpm links from each consumer without executing entry modules, scans nested workspaces and respects exclusions. When a consumed Audit artifact publicly exports its migration function, the report includes `migrateAudit({ dryRun: true })`; it does not execute migrations. Plan target.runtime comes from remote configuration independently of the local packaging engine.

For legacy targets, run `hai deploy-secrets <directory> --import <privateJSON> --runtime docker` on the Linux server for read-only authentication; add `--apply` explicitly to import. This tool requires server Node, unlike ordinary offline deployment. Passwords stay out of command arguments. See [credential import and recovery](../deploy/docs/credential-import.en.md).

`hai upgrade 0.1.0-alpha.71` reads all consumed framework packages plus exact CLI/deploy artifacts, integrity, skills and catalog/lock/installed drift. It never installs or overwrites local/custom files; incomplete releases exit nonzero. JSON includes module migration preflight, backups and legacy-session boundaries. `hai deploy --env prod --plan` verifies local artifacts and reports identity, configuration source keys, selected/retained scope, baseline requirements and recovery directories without building, generating credentials or connecting to the target; unobserved remote state is explicitly not-inspected.

`hai build --target app --platform android|ios` creates and verifies new APK/IPA files. Add platforms and install Android SDK/JDK or macOS/Xcode, then configure signing. cap:sync only synchronizes. Missing platform/toolchain/artifacts fail. Release builds exclude CAPACITOR_SERVER_URL and reject reload URLs in synchronized native configuration. build.app lists App directories.

Use `--plan --inspect-remote` (SDK inspectRemote:true) to read current and the successful release directory over SSH. It reports verified/missing/unavailable and the actual recovery release ID without target writes.

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

## License

Apache-2.0
