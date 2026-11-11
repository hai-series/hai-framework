# Create, configure and deliver an application

[Usage guide](../README.en.md) · [Environment](../overview/environment.md) · [Configuration manual](../configuration/README.md)

Follow this workflow for a generated application. Module READMEs provide English API examples; the shared configuration and operations chapters linked here are in Chinese. Run application commands in the generated project, not in the framework repository.

## 1. Install and create

```sh
pnpm view @h-ai/cli dist-tags
pnpm view @h-ai/cli@latest version
pnpm add -g @h-ai/cli@latest
hai --version
hai create my-app --type fullstack --frontends web --defaults
cd my-app
pnpm dev
```

The first queries return published channels and the exact default version. Pin that version instead of `@latest` when reproducibility matters. `hai --version` confirms the installed CLI. The creation command generates a Web frontend, shared contract and Node service, installs dependencies and initializes Git; it does not push the repository. `pnpm dev` keeps the development processes running and prints their addresses. In PowerShell use `pnpm.cmd`.

Choose `--type api` for an independent service, `admin/website/h5` for SvelteKit, or `mobile-app` for a Capacitor/Vite client. Fullstack/API workspaces use pnpm. `--defaults` accepts defaults; `--no-install`, `--no-git` and `--no-deploy` omit those steps. [Creation choices](create.md)

## 2. Configure the environment

In fullstack projects, `packages/my-app-contract` owns HTTP input/output schemas, `packages/my-app-serv` implements authorization and business operations, `packages/my-app-shared` holds shared code, and `apps/my-app-web` owns the interface. Start with the generated README and AGENTS.md. API workspaces keep service files under `apps`; do not infer paths from a different template.

Use `config/_<name>.yml` for module configuration and private `.env.<mode>.local` files for credentials. The order is **process > mode-private > global-private > mode-public > base .env > YAML**. Within one source, fields override parent JSON regardless of line order; a higher-source whole-object replacement clears lower-source fields. The host loads files and checks schemas before initializing modules. Saving configuration does not reconnect running clients automatically. [Loading and defaults](../configuration/runtime.md)

For IAM templates, the initial account is `admin`; obtain its generated password from `HAI_ADMIN_DEFAULT_PASSWORD` in the matching private environment file. Do not put it in screenshots or logs. Production uses shared databases, caches and storage; development memory/SQLite/Local backends do not become production-ready by changing an environment label.

## 3. Implement one complete capability

Define the accepted input, output, owner/tenant boundary and failure behavior first. Reuse [module capabilities](../development/README.md); define HTTP schemas in the contract, enforce authorization in the service, and call it through the typed client. Hiding a button is not authorization. The server derives the trusted resource owner from the authenticated context.

Initialize lifecycle modules in dependency order, check every `HaiResult.success`, and close in reverse order. Factories, schemas and UI components follow their own contracts. Handle storage/transport rejection at the documented boundary; show safe localized errors and keep a trace ID for server diagnostics. Use the module's [English README](../../../README.en.md#find-modules-by-domain) for a complete example rather than copying an internal source file.

## 4. Verify behavior

Run the project's typecheck, lint, applicable build, tests and affected E2E commands. Check both success and refusal, retained form data after failure, retries, cancellation and cleanup. Template tests must generate and validate a real project. A configuration schema or mock response does not prove that an external provider works. [Verification boundaries](../governance/verification.md)

For sites under a subdirectory, build with the intended `PUBLIC_BASE_PATH`, then check assets, deep links, authentication, API routing and refresh through the real gateway. A path or deployment topology change needs a full delivery. [Website paths](../configuration/delivery.md#网站部署在子目录)

## 5. Build and deploy

Keep build and deployment settings in the generated project's root `hai.json`, under `build` and `deploy`. Use the project scripts:

```sh
pnpm build --target image --runtime auto
hai deploy --env prod --plan
```

The build returns the owned batch location and its source/checksum metadata. The read-only plan reports the target, selected and retained services, configuration-source keys and recovery conditions; unobserved remote state remains `not-inspected`. Inspect the plan before executing `hai deploy --env prod`. SSH and middleware credentials belong in private environment files. [Deployment configuration](../configuration/delivery.md) · [Deployment procedure](../operations/deployment.md)

For Android, `pnpm build --target app --platform android --runtime auto --debug` creates a debug APK; signed releases require the application's signing configuration. iOS uses macOS/Xcode. Install artifacts on actual target devices and verify startup, permissions, authentication, storage and upgrades. [Native builds](build.md#原生和离线条件)

## 6. Upgrade and recover

Query the exact published target version, then run `hai upgrade TARGET_VERSION`, replacing the placeholder with that version. This inspects release completeness, package/lock/skill drift; it does not install or overwrite project files. Apply the required interface, configuration and skill changes together, then repeat the affected checks and rebuild deliverables.

Before changing persistent data, stop incompatible writers and back up the database, session cache, objects and managed credentials. Verify that the target release initializes against a copy of the database. Container rollback does not undo business writes or external effects. Keep recovery materials and verify the deployed version, health, login and persistent records. [Upgrade workflow](upgrade.md) · [Recovery conditions](../configuration/delivery.md#失败恢复与发布后回滚)
