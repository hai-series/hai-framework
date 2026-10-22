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

### Fullstack mini administration

Includes user management, roles, audit logs, avatars, personal settings, themes, languages, onboarding and help. Sign in as `admin` using the random `HAI_ADMIN_DEFAULT_PASSWORD` in root `.env.local`. Existing users are not reset. Adapt the sample business rules as needed; authorization remains on the server.

### Application configuration and display

See `.env.example` for settings. Commit shared `.env` and `.env.dev/.env.test/.env.prod`; keep private overrides in `.env.local`. Precedence is process environment > local private file > selected environment > shared base. API projects keep these files in the service directory; fullstack uses the root. See the [usage guide](../../docs/usage/README.en.md) for YAML, environment overrides and application metadata.

### Existing projects and code generation

```sh
hai add storage
hai init
hai generate page dashboard
hai generate component UserCard
hai generate api orders
hai generate model order
hai generate migration add-orders
```

`hai add` resolves module dependencies and fills configuration. `hai init` fills missing configuration and AI files while preserving custom content. `--force` regenerates module configuration; review the diff before using it.

The page/api generators target SvelteKit. Extend fullstack/API projects through their contract/procedure structure. Names cannot contain paths; existing files are protected unless `--force` is explicit. Migrations generate up/down functions only; inspect data effects before running them.

### Build and deploy

`pnpm build` compiles sources. Each image has its own Dockerfile in `images/`, selected through `hai.build.json`. `--images` selects build outputs; `--services` selects deployed services. Automatic engine detection prefers reachable Podman, then Docker. Downloads, installation and production dependency packaging share package and SQLite driver caches to avoid downloading them again.

The default container supports CPU workloads or remote AI services without downloading extra GPU runtimes. To use the deployment host's GPU, customize the image and container runtime settings.

```sh
pnpm build --target docker
pnpm run deploy --env prod
pnpm run deploy --env prod --build --services web
pnpm run deploy --env prod --build --bundle-only
```

Complete bundles include application and self-hosted middleware images. Deployment caches, archives and operation directories default to `.hai/deploy/<environment>/` at the project root; `--output` can explicitly override the archive path relative to the command's working directory. Bundle-only mode creates a tar plus Windows `deploy.ps1` and Linux/macOS `deploy.sh`. On an isolated Linux server, extract and run `sh apply.sh`. First installations require a complete bundle; partial updates preserve other services and volumes. Each step reports its result; failure exits nonzero and attempts recovery. See [deployment](../deploy/README.en.md) for prerequisites, caching, versions and recovery.

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
pnpm --filter @h-ai/cli test:deploy-gates
```

Scaffold gates generate real projects and run install, typecheck, lint, build, tests and browser workflows. Deployment gates cover offline bundles, SSH/manual deployment and partial updates. Tests clean up their resources; save requested evidence in a designated directory. Native shells and real cloud providers need separate acceptance.

## License

Apache-2.0
