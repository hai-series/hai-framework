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

## Features

### Commands, inputs and outputs

These are terminal commands; no framework service initialization is required. Observe actual output and exit status. Replace TARGET_VERSION with the published exact version returned by pnpm view; do not pass the placeholder literally.

| Command      | Purpose and input                                  | Output and example                                                                                                                                    |
| ------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| create       | Project name, type and fullstack frontend choices  | `hai create orders --type admin --defaults` creates an admin application                                                                              |
| add          | Add a named module to the current project          | `hai add ai` adds dependencies, configuration and skills while preserving business files; wire initialization, shutdown and routes in the application |
| init         | Complete project configuration and AI entry points | `hai init` fills missing files; review changes before `--force` rebuilds module configuration                                                         |
| generate / g | Type, name and target workspace                    | `hai generate api orders --workspace orders-serv` creates routes or contract/procedure files; shortcuts are g:page/g:component/g:api/g:model          |
| build        | Target, images/platform and source inputs          | `hai build --target image --json` emits the current artifact JSON; build has no deployment environment option                                         |
| deploy       | Environment, artifacts and selected services       | `hai deploy --env prod --plan` emits a read-only plan; omit plan to enter delivery                                                                    |
| upgrade      | Exact release version and project                  | `hai upgrade TARGET_VERSION` reports dependencies, integrity, configuration and skill drift without installation or overwrites                        |
| feedback     | Action, diagnostic ZIP and filters                 | `hai feedback summary feedback.zip` prints a summary; inspect/evidence/view provide manifest, evidence or a local viewer                              |

Global `--cwd/-C` selects the project and `--verbose/-v` enables detailed diagnostics. CLI language follows `HAI_CORE_DEFAULTLOCALE` → `LC_ALL` → `LC_MESSAGES` → `LANG`, independently of the generated application's language.

### Templates

| type                 | Generated application and use case                                                   |
| -------------------- | ------------------------------------------------------------------------------------ |
| admin / website / h5 | SvelteKit admin, presentation website or mobile Web; website starts with Core/Kit/UI |
| api                  | Shared contract and independent Serv in a pnpm workspace                             |
| mobile-app           | Svelte/Vite/Capacitor client connected to an independent API                         |
| fullstack            | Contract, Serv, shared UI and selected Web/App/Desktop; miniapp is a placeholder     |

Templates install modules they actually use and retain commented optional configuration plus `.env.example`. Uncommenting a block does not wire a feature. Add AI/payment/vecdb/datapipe when needed; production uses shared database, Redis and file backends. Chinese, English and Japanese are enabled by default; fullstack can restrict `fullstack.i18n.locales`.

Browser templates check known unsupported versions before loading: Chrome/Edge111, Firefox114, Safari and iOS/iPadOS16.4 are the minimums. See [browser startup](../../docs/usage/getting-started/build.md#浏览器启动检测).

### Generate pages, components, APIs, models and migrations

```sh
hai generate page dashboard
hai generate component UserCard
hai generate api orders --workspace orders-serv
hai generate model order
hai generate migration add-orders
```

Names cannot contain paths. Existing business files are preserved by default. `--workspace` accepts a package name or relative directory; SvelteKit `--output` must remain inside src/routes and Serv does not accept it. Pages require file routing; unsupported plain-Vite page/API combinations fail clearly. Serv updates only aggregation entries marked `@hai-generator`. The batch is validated before writing and rolled back on write failure. `--force` replaces generated files only. Migration output contains up/down functions, not executed database changes.

### Build, static sites and native packages

```sh
hai build --target image --images "serv,web" --concurrency 1
hai build --target app --platform android --runtime auto --debug
hai build --target desktop --platform windows --arch x64
```

Target defaults to compile; alternatives are image/app/desktop. Image roles are serv/web; native targets are not Compose services. Images run at most two builds concurrently. Auto selects ready Podman then Docker; an explicit engine does not fall back. Android without runtime uses the host toolchain. iOS requires macOS/Xcode and signing.

Artifacts use separate `.hai/build/` batches and update relative `latest` only after archival succeeds. Image `--json` stdout contains only the current result; pass its `artifactDir` to deployment. Progress and failures go to stderr. Unknown Git provenance or dirty state is not a clean-input guarantee. See [names, signing and automation](../../docs/usage/getting-started/build.md).

For a static website, set build-process `HAI_BUILD_STATIC=1` and the actual `PUBLIC_BASE_PATH`, then run `pnpm build`. Publish build only, including .nojekyll. Static builds reject dynamic APIs/actions, server business initialization, private assets and links. An unconnected contact form explains the missing service and retains input. Changing the website path requires rebuilding; API addresses are separate. See [static/subpath configuration](../../docs/usage/configuration/delivery.md).

### Deployment, offline delivery and recovery

```sh
hai deploy --env prod --plan
hai deploy --env prod --plan --inspect-remote
hai deploy --env prod --build --bundle-only
hai deploy --env prod --build --services "serv,web"
```

Plan validates and reports; inspect-remote additionally reads baseline facts over SSH. Not-inspected is not verified. Bundle-only avoids target connections and produces the archive, target description, upload/local scripts and instructions; APPLY.txt inside describes manual deployment. Initial installation and topology changes require a complete bundle; partial updates require a matching successful server baseline.

Set `HAI_CORE_LOGGING_LEVEL=debug` for the selected environment when diagnosing packaging or deployment. `--plan` keeps stdout available for its JSON report.

Root `package.json.name` defines project identity with an environment suffix. Protect server credentials, backend bindings and volumes together. Failed updates can restore previous services, but do not undo database changes, migrations, notifications or payments. For unknown SSH results, inspect remote facts before retrying. See [deployment/recovery](../deploy/README.en.md).

HTTPS supports existing regular PEM files or Let's Encrypt. Each certificate/key is limited to1MiB and links are rejected; ACME needs DNS, email, terms acceptance and public port80. Certificate state stays on the server. Enabling, disabling or changing the layout requires full deployment. See [HTTPS](../../docs/usage/configuration/delivery.md#可选https证书).

### Diagnostics, release inspection and credential import

```sh
hai feedback evidence feedback.zip --request-id request-42 --page 1 --page-size 20
hai feedback view feedback.zip
hai upgrade TARGET_VERSION
```

Bundles must be regular single-link files up to64MiB. View listens on loopback with a random path and uses the framework viewer instead of executing bundled replacement scripts. Filtered results are not proof of complete evidence.

`hai upgrade` inspects the consumed packages, CLI/deploy artifacts, catalog, lockfile, installation state and skill differences.

### AI guidance and application experience

Generated applications use AGENTS.md and `.agents/skills/`; Claude/Copilot/OpenCode reference shared rules. Module installation completes applicable skill references while preserving custom files. Use installed public types to confirm contracts. See [template composition](templates/README.md).

Fullstack includes user/role management, audit, feedback, profile, theme and locale UI. Initial passwords are distributed through private environment files or Secrets and are never printed. They create missing accounts without resetting existing users. Native display names come from Core; artifact filenames use project identity.

## Configuration

`hai.json.build.images` selects roles, contexts, Dockerfiles and ports. Build.sources/build.proxy select image/npm sources and proxies; deploy selects delivery targets. Sources are official/cn/custom and proxy modes are inherit/system/custom/none. Command options apply to the current operation. See the [configuration manual](../../docs/usage/configuration/delivery.md).

HAI priority is process > mode-private > global-private > mode-public > base env > YAML. Within a source, child fields override parent JSON; a higher-source parent removes lower-source children. Runtime credentials and SSH settings stay private; builds do not read deployment secrets. Ordinary backend configuration needs restart; topology, proxy, HTTPS or website build paths require deployment/rebuilding. See [runtime configuration](../../docs/usage/configuration/runtime.md).

Contexts must remain trusted and stable. Dependency sources/cache files must be regular single-link files; cache ancestors reject symlinks/junctions. Tracking is limited to16MiB and archives are compared/copied in64KiB chunks. Unchanged files retain mtime; updates replace atomically. Diagnostics identify path, reason and code without echoing manifest contents.

Keep applicable deepmerge/DaisyUI patch files and patchedDependencies registrations in pnpm projects. Installing an npm package does not inherit this workspace's patch configuration. See [patches](../../patches/).

## Error Handling

Failures report a safe cause, path or step and exit nonzero. Failed installation preserves generated files for retry; failed builds do not advance successful latest. Keep secrets out of arguments and logs. Plans, preflight and import receipts have separate scopes. Correct the failing prerequisite and retry that step; inspect facts first for unknown outcomes.

## Development

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
