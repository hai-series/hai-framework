# @h-ai/cli

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

[Framework home](../../README.en.md)

## Introduction

Use `hai` to create applications, add modules, generate starter code, build and deliver releases. It supports SvelteKit, independent APIs and separate frontend/backend workspaces. Follow the [usage guide](../../docs/usage/README.en.md) for the complete workflow.

## Core features

- Create admin, website, H5, API, mobile or fullstack applications.
- Add modules, configuration and AI guidance to existing projects.
- Generate starter pages, components, endpoints, models and migrations.
- Build selected images, deliver complete offline bundles or update selected services.

## Getting started

### Install the CLI

Use Node.js matching `engines` (`^22.22.2 || ^24.15.0 || >=26.0.0`) and pnpm 12.11.2. In PowerShell use `pnpm.cmd`.

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

Use `--template minimal|default|full|custom` for module presets and `--features iam,db,...` for application modules. Fullstack keeps IAM, database, cache, crypto, storage and audit for its default management UI. It does not install AI/ONNX/CUDA by default.

A standalone `mobile-app` with IAM or crypto installs frontend crypto and enables encrypted typed-client transport by default. Without crypto, a deliberate plaintext API remains supported. Use `PUBLIC_API_TRANSPORT=off` only with a matching plaintext service; `PUBLIC_API_KEY_EXCHANGE_PATH` overrides the public exchange subpath. A failed handshake never falls back to plaintext, and server private keys never enter the client. Cleanup closes client transport before crypto initialized by that client.

### Fullstack mini administration

Includes user management, roles, audit logs, avatars, personal settings, themes, languages, onboarding and help. Sign in as `admin` using the random `HAI_ADMIN_DEFAULT_PASSWORD` in root `.env.local`. Existing users are not reset. Adapt the sample business rules as needed; authorization remains on the server.

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

CLI messages support Chinese and English. The first nonempty value from `HAI_CORE_DEFAULTLOCALE`, `LC_ALL`, `LC_MESSAGES` and `LANG` selects the initial language. Regional `en`/`zh` variants use the existing dictionaries; `C`/`POSIX` use English. Unknown languages preserve the current core locale, which defaults to Chinese. In PowerShell, run `$env:HAI_CORE_DEFAULTLOCALE='en-US'` before `hai generate`. Internal commands also honor in-process locale changes via `core.i18n.setGlobalLocale('en-US')`. Omitting a type or name opens a prompt; cancellation writes no files. Generated Chinese code comments and user-supplied names remain unchanged.

Prompts, validation, module/template names, descriptions and completion messages in `create`, `add`, `init` and `generate` use the current CLI locale. Catalog labels are translated when read, including after an in-process locale change. The CLI locale is separate from the generated application’s `core.defaultLocale`; generated Chinese README text, configuration/code comments, user input and original external-tool diagnostics remain unchanged.

### Build and deploy

Database connections are validated against the selected backend’s public schema before saving. MySQL `ssl` accepts only `false` or a strict TLS object; `{}` verifies the certificate chain and DNS identity by default. PostgreSQL keeps its modes. CLI bundles the pure schemas and Zod, so validation needs no database package or driver in the target application; running that application still requires its dependencies. Deployment still requires an installed, resolvable `@h-ai/deploy` (a development dependency in generated projects).

`pnpm build` compiles sources. Each image has its own Dockerfile in `images/`, selected through `hai.build.json`. `--images` selects build outputs; `--services` selects deployed services. Automatic engine detection prefers reachable Podman, then Docker. Downloads, installation and production dependency packaging share package and SQLite driver caches to avoid downloading them again.

The default container supports CPU workloads or remote AI services without downloading extra GPU runtimes. To use the deployment host's GPU, customize the image and container runtime settings.

```sh
pnpm build --target docker
pnpm run deploy --env prod
pnpm run deploy --env prod --build --services web
pnpm run deploy --env prod --build --bundle-only --output release-prod.tar
```

Complete bundles include application and self-hosted middleware images. Bundle-only mode creates a tar plus Windows `deploy.ps1` and Linux/macOS `deploy.sh`. On an isolated Linux server, extract and run `sh apply.sh`. First installations require a complete bundle; partial updates preserve other services and volumes. Each step reports its result; failure exits nonzero and attempts recovery. See [deployment](../deploy/README.en.md) for prerequisites, caching, versions and recovery.

Failures display local managed-process termination separately from remote unknown/finished-script state and the server result path. Local SSH exit does not prove remote termination. Inspect unknown server state first; CLI never reruns deployment or rollback automatically. Windows command execution uses an embedded system PowerShell/.NET Job and requires Add-Type; failure never starts an unmanaged command.

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
pnpm --filter @h-ai/cli test:scaffold-gates --i18n
pnpm --filter @h-ai/cli test:deploy-gates
```

Scaffold gates generate real projects and run install, typecheck, lint, build, tests and browser workflows. Deployment gates cover actual resource ownership and dynamic host port isolation, as well as offline bundles, SSH/manual deployment, incremental updates and rollback. Cleanup uses only container IDs and private image tags recorded by the current run. Safe metadata remains in ignored `tmp/validation/module-review/VERIFY-05/`; temporary projects, SSH keys and project data are still removed. Produced browser screenshots, traces and reports remain under ignored `tmp/validation/module-review/scaffold-browser/` or `deploy-browser/` by default. Explicit evidence, HTML report and output paths are respected; temporary projects, keys, data and processes are still cleaned up. Native shells and real cloud providers need separate acceptance.

`--generate` runs focused route gates: it reuses installed workspace dependencies, generates and builds real SvelteKit, serv API and fullstack backend projects, then accesses their new routes, including transport. It does not replace the full installation and browser matrix.

`test:e2e` gives each server explicit isolated backends and an absolute data directory. Server children do not inherit external `HAI_*` / `PUBLIC_*` / `VITE_*` settings or read the user's `.env.local`. Test-only `HAI_E2E=1` preserves ordinary development/production dotenv behavior and shared-backend requirements; transport cases use a fresh trusted SM2 ring and the actual registry. Scaffold browser runs also use an independent TCP counter to verify that external database settings are never contacted. Complete deployment acceptance retains real Redis/S3, incremental updates and rollback for fullstack.

`--i18n` builds the CLI and checks language precedence, help, successful generation and errors in separate processes, alongside Chinese/English prompt, validation and cancellation cases.

## License

Apache-2.0
