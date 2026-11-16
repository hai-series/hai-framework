# @h-ai/cli

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) · [Framework home](../../README.en.md)

Use `hai` to create applications, add modules, generate starter code, and build Web, API and native artifacts. Follow the [usage guide](../../docs/usage/README.en.md) for the full workflow.

## Quick Start

### Install the CLI

Use Node.js matching `engines` (`^22.23.4 || ^24.22.1 || ^26.12.1`) and pnpm 12.11.2. In PowerShell use `pnpm.cmd`.

```sh
pnpm view @h-ai/cli@latest version
pnpm add -g @h-ai/cli@latest
hai --version
hai create my-app --type fullstack --frontends web
cd my-app
pnpm dev
```

Input a project name and template type; output is a project with dependency installation and Git initialization enabled. `--defaults` accepts defaults. `--no-install`, `--no-git` and `--no-deploy` omit installation, Git and deployment development dependencies respectively. Missing choices are interactive. Check each installed command with `hai <command> --help`.

## Configuration Reference

Command-line flags configure the current run. The project’s `hai.json` stores build and deployment settings.

See the [configuration reference](../../docs/usage/configuration/cli.md) in Chinese for configuration entry points, defaults, accepted values and when changes take effect.

## Features

See the [feature reference](../../docs/usage/function/cli.md) in Chinese for examples, inputs, outputs, error handling and usage notes.

- `create` / `add` / `init` — Create projects, add modules and fill in configuration
- `generate` / `g` — Scaffold pages, components, APIs, models and migrations
- `build` / `deploy` — Build artifacts, inspect deployment plans, publish and recover
- `upgrade` / `feedback` — Check an upgrade target and inspect offline feedback bundles

## Data Structures

The module creates no database tables of its own.

See the [data reference](../../docs/usage/data/cli.md) in Chinese for generated projects, configuration, build caches and deployment records.

## Development and Testing

Use current source from the repository root:

```sh
pnpm --filter @h-ai/cli typecheck
pnpm --filter @h-ai/cli lint
pnpm --filter @h-ai/cli build
node packages/cli/dist/index.js create ../my-app
pnpm --filter @h-ai/cli test
pnpm check:skills
pnpm --filter @h-ai/cli test:scaffold-gates
pnpm --filter @h-ai/cli test:deploy-gates
```

Scaffold gates install, compile and run generated project tests/browser flows; deployment gates need Podman/Docker. Focused `--generate` and `--i18n` cover routes and terminal locale. Isolated fixtures do not prove production data or external-provider acceptance. Windows native gates require Rust/MSVC and explicit HAI_CLI_NATIVE_BUILD=1. Real-device interaction needs separate verification.

## License

Apache-2.0
