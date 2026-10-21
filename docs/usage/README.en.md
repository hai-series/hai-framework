# From your first project to a running application

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

This guide follows an application through creation, development, builds, delivery, and framework updates. The examples use a project named `my-app`, with the fullstack Web + API template as the main path. Differences between templates are called out where they matter.

Commands describe the CLI and templates in this repository. For an installed release, check `hai --version`, `hai build --help`, and `hai deploy --help` first: an older release does not gain unpublished source features. Find module examples in the [root README](../../README.en.md) and package READMEs. To work on the framework itself, follow [AGENTS.md](../../AGENTS.md).

## 1. Prepare your tools

| Work | Requirements |
| --- | --- |
| Create, develop, compile, and run the CLI | Node.js `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`, pnpm 12.11.2; check the project's `engines` and `packageManager` |
| Version control and document-driven AI development | Git; an AI coding assistant that can read project files and run commands |
| Build container images | An installed, running Podman or Docker engine; use Linux containers on Windows |
| Build desktop installers | Rust, the target architecture toolchain, and Tauri's system SDKs and packaging tools on the target OS |
| Deploy automatically to Linux | Local `tar`, `ssh`, and `scp`; a server with a container engine, Compose, `sh`, `tar`, `sha256sum`, and directory permissions |
| Generate a deployment bundle only | Local `tar`, installed project dependencies, and complete build artifacts; no SSH or local container engine required |

Commands below use `pnpm`; use `pnpm.cmd` in Windows PowerShell. Engine auto-detection checks available Podman/Docker installations; it does not install or start them.

Defaults below describe what happens when an option is omitted, including cases that prompt for a choice.

| Global option | Purpose | Default | Example |
| --- | --- | --- | --- |
| `-C, --cwd <path>` | Working directory | Current directory | `pnpm exec hai build --cwd ../my-app` |
| `-v, --verbose` | Detailed output, depending on the subcommand | `false` | `hai create my-app --verbose` |
| `-h, --help` | Command help | `false` | `pnpm exec hai build --help` |
| `-V, --version` | CLI version, not the application version | `false` | `hai --version` |

## 2. Create an application

Install the CLI, then create a Web + API workspace with deployment support:

```sh
pnpm add -g @h-ai/cli
hai --version
hai create my-app --type fullstack --frontends web --features deploy --yes
cd my-app
pnpm dev
```

Creation installs dependencies and initializes Git by default. Run `hai create my-app` for interactive selection; fullstack deployment support requires an explicit `--features deploy`. With `--no-install`, run `pnpm install` in the project before starting it. Initial installation needs a reachable registry unless you have prepared the offline dependencies described later.

| Creation option | Meaning and values | Default | Example |
| --- | --- | --- | --- |
| `[name]` | Project name: lowercase letters, digits, hyphens | Prompt, initially my-app; my-app with --yes | `hai create orders-app` |
| `--type <type>` | fullstack: API + clients; api: contract + service; admin/website/h5: SvelteKit; mobile-app: Capacitor + Vite | Prompt, initially admin; admin with --yes | `--type fullstack` |
| `--frontends <targets>` | fullstack web/app/desktop, comma-separated; miniapp is a placeholder | web,app,desktop for fullstack; unused otherwise | `--frontends web,desktop` |
| `-t, --template <template>` | minimal/default/full/custom | custom for fullstack; otherwise prompt, default with --yes | `--template custom` |
| `-f, --features <features>` | Use custom for feature selection outside fullstack; see [CLI](../../packages/cli/README.en.md). In fullstack, enables optional deploy | Type/template presets; deploy off in fullstack | `--template custom --features iam,db,deploy`; fullstack: `--features deploy` |
| `--examples` / `--no-examples` | Include example code | `true` | `--no-examples` |
| `--no-install` | Defer dependency installation | Install dependencies | `--no-install` |
| `--no-git` | Skip Git initialization | Initialize Git | `--no-git` |
| `-p, --package-manager <pm>` | pnpm/npm/yarn | pnpm for fullstack/API; otherwise detected or selected interactively | `--package-manager pnpm` |
| `--git-remote <url>` | Remote repository URL | Unset | `--git-remote https://git.example.com/team/my-app.git` |
| `-y, --yes` | Create with defaults without prompts | false | `hai create my-app --yes` |

To include a desktop client, use `--frontends web,desktop`. Existing applications can add supported modules with `hai add <module>`, for example `hai add deploy`. Fullstack includes database, cache, IAM, encryption, storage, and audit modules by default; it has no AI runtime dependency and does not require CUDA.

In fullstack, `packages/my-app-contract` defines APIs, `packages/my-app-serv` implements them, `packages/my-app-shared` holds shared code, and `apps/my-app-web` provides the Web client. Environment files live at the project root. In the API template they live in `apps/my-app-service`. Read your generated README and AGENTS.md before making changes.

## 3. Configure the application and develop features

Configuration files describe module structure: for example, `_db.yml` references `HAI_DB_TYPE` for its database type. Environment-specific addresses, ports, providers, and credentials come from the shared variable naming scheme. Avoid copying the implementation for each environment. Keep server secrets out of `PUBLIC_` and `VITE_` variables.

| File | Purpose | Commit to Git |
| --- | --- | --- |
| `.env.example` | The full configuration reference, with descriptions, examples, and enum values; not automatically loaded at runtime | Yes |
| `.env` | Public base configuration shared by all environments | Yes |
| `.env.dev` | Public development overrides | Yes |
| `.env.test` | Public test overrides | Yes |
| `.env.prod` | Public production overrides | Yes |
| `.env.local` | Private settings, credentials, and SSH paths for this machine | No |

Precedence is **existing process variables > `.env.local` > `.env.<environment>` > `.env`**. Check local overrides when changing environments: a connection in `.env.local` can still point to a different environment. JSON object overrides take precedence over individual child fields. Your generated `.env.example` describes available variables and allowed values; the framework-wide catalog is in the [root `.env.example`](../../.env.example). Committed files contain public settings; put real credentials in private files or the deployment process environment.

```sh
pnpm dev
pnpm dev:test
pnpm dev:prod
```

These commands select configuration for development servers. Builds are independent of deployment environments. Built Node services use `start:test` or `start:prod`. The fullstack root `start` runs the API only; run `preview` in a client workspace for local Web previews. Container deployment starts both Web and API.

### Traditional development

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

### AI first: agree on documents, then implement and evolve them

The CLI copies complete skills into the application's `.agents/skills/`. Skill names below identify tasks for an AI assistant, not shell commands. Ask it to “use hai-spec-review…” or read the corresponding `SKILL.md`; shortcut invocation depends on your assistant.

1. **Describe the business first.** Keep requirements and necessary designs in `docs/`. Include goals, roles, permissions, pages/APIs, fields and enums, state changes, failure feedback, acceptance criteria, and exclusions. Start small, but make business behavior clear enough that an implementer does not have to guess.
2. **Review with [hai-spec-review](../../packages/cli/templates/skills/hai-spec-review/SKILL.md).** For example: “Review docs/requirements.md and docs/design.md for implementation readiness. Give issues and concrete corrections; do not code yet.” Resolve the issues, review again, and fix the approved document scope and version. Explicit requirements can change the template's default roles and workflows.
3. **Implement with [hai-spec-implement](../../packages/cli/templates/skills/hai-spec-implement/SKILL.md).** Commit the agreed business documents first, then ask: “Plan and implement the reviewed documents in dependency order, validate, and merge locally. Do not push or publish.” The skill maintains `docs/task-list.md`, `docs/tasks/T001-….md`, requirement coverage, and document baselines, rather than treating a successful build as completed delivery.
4. **Implement, test, and review each task.** [hai-app-create](../../packages/cli/templates/skills/hai-app-create/SKILL.md) handles features and framework reuse; [hai-app-tests](../../packages/cli/templates/skills/hai-app-tests/SKILL.md) selects meaningful unit, integration, and browser tests; [hai-app-review](../../packages/cli/templates/skills/hai-app-review/SKILL.md) checks security, return contracts, code, and real interactions. These three skills also work directly for small features and fixes.
5. **Review the proposed PR with [hai-pr-review](../../packages/cli/templates/skills/hai-pr-review/SKILL.md).** Supply the scope, diff, check results, and unverified items to assess risks and merge readiness. AI review does not imply that CI passed or authorize posting comments, pushing, merging, or deploying.

For a requirement change, update and commit the affected business documents, review the changes, then ask: “Use hai-spec-implement to update the implementation from the accepted document baseline to this document commit, reuse existing tasks, and complete integration acceptance.” It fixes the old/new snapshots, checks related rules, and updates tasks, code, tests, and documents. The baseline moves only after full acceptance. Do not invent an old baseline from the current HEAD or mark an unmerged branch as delivered. Resume interrupted work from the task list.

All four application skills named above—`hai-app-create`, `hai-app-review`, `hai-app-tests`, and `hai-pr-review`—are distributed with the CLI. The source repository's `hai-create-app` / `hai-review-app` skills serve repository maintenance and have different names and scope.

## 4. Compile sources and package artifacts

**Build once; select the environment when deploying.** In generated applications, `pnpm build` defaults to source compilation. Select image or desktop packaging explicitly with `--target`. Builds do not load deployment overrides or inject runtime credentials; there is no `build:prod` or build-time `--env prod` path.

Choose one target per command, not all three at once:

| Target | What runs | Output and purpose |
| --- | --- | --- |
| compile | Project compile script: TypeScript, Svelte, shared contracts | dist/build outputs for checks, preview, or running yourself; no image archives, deployment tar, or installer |
| docker | Podman/Docker compiles sources through the Dockerfile, builds configured images, and exports them | API/optional Web image archives and a manifest for deploy; no server connection |
| desktop | Tauri builds the frontend, Rust application, and OS bundles | Windows NSIS exe, Linux deb/AppImage, macOS app/dmg; no Compose generation or API deployment |

Image and desktop builds perform their required source compilation, so a separate compile command is unnecessary. Image tar archives contain images; deployment tar bundles additionally contain environment-specific Compose, settings, and startup scripts.

```sh
pnpm build
pnpm build --target compile
pnpm build --target docker
pnpm build --target docker --runtime podman --no-http-proxy
pnpm build --target docker --runtime docker
pnpm build --target desktop --platform windows --arch x64
```

The project's `compile` script runs its actual compiler. Do not make it, the Dockerfile, or Tauri's `beforeBuildCommand` call the same image/native build entry recursively. Source output depends on the template: Vite uses `dist`, SvelteKit uses `build`, and contract/service workspaces have their own output directories.

### Build options

| Build option | Meaning and values | Default | Example |
| --- | --- | --- | --- |
| `--target <target>` | compile/docker/desktop, as explained above | compile | `pnpm build --target docker` |
| `--runtime <runtime>` | Images only: auto/podman/docker | auto, reachable Podman then Docker | `--target docker --runtime docker` |
| `--network <network>` | Images only: Podman private/pasta/none/host; Docker default/none/host. Other networks are engine-validated; pasta requires rootless Podman | Engine default | `--target docker --runtime podman --network pasta` |
| `--platform <platform>` | Desktop only: windows/linux/macos; must match the host | Host OS | `--target desktop --platform windows` |
| `--arch <arch>` | Desktop only: x64/arm64; matching Rust target/SDK required | Host architecture | `--target desktop --arch x64` |
| `--sqlite-prebuild-mirror <url>` | Images only: mirror root for a supporting Dockerfile; HTTP(S), no credentials/query/fragment | Upstream download source | `--target docker --sqlite-prebuild-mirror http://mirror.internal/better-sqlite3` |
| `--no-http-proxy` | Images only: disable Podman proxy inheritance; not a Docker engine flag | Podman inherits proxies | `--target docker --runtime podman --no-http-proxy` |

These options go to hai build; global options are in section 1. Inspect help with `pnpm exec hai build --help`. Options for the wrong target are rejected. Image architecture follows the engine and Dockerfile; desktop --arch is not a Docker cross-platform option.

Podman builds forward host `HTTP_PROXY`, `HTTPS_PROXY`, `FTP_PROXY`, `NO_PROXY`, and their lowercase forms as build arguments by default, including remote engines on Windows/macOS. Use an address reachable from containers, such as `http://host.containers.internal:10808` for Windows Podman, rather than the host's `127.0.0.1`. `--no-http-proxy` disables forwarding; do not persist proxies with Dockerfile ENV instructions.

Some WSL/Podman setups resolve hostnames or connect differently during build and run. Verify proxy connectivity on the build network. Rootless Podman can explicitly use `--network pasta` with a proxy address reachable on that network. This affects builds only, leaving deployed service networks unchanged.

### Describe packaging in hai.build.json

Place this file at the application root. It describes build structure, not environments, servers, or secrets. A fullstack project with Web and desktop could use the following; omit `desktop` for Web-only projects:

```json
{
  "images": [
    { "name": "app", "context": ".", "dockerfile": "Dockerfile", "target": "runtime", "containerPort": 3000 },
    { "name": "web", "context": ".", "dockerfile": "Dockerfile", "target": "web", "containerPort": 8080 }
  ],
  "desktop": ["apps/my-app-desktop"]
}
```

| Field | Meaning and constraints | Default | Example |
| --- | --- | --- | --- |
| `images` | Required for docker: one app, optionally one web | Unset; configure before image builds | `[{"name":"app","target":"runtime"}]` |
| `images[].name` | app/web archive role; Web is deployed alongside API | Required, no default | `"web"` |
| `images[].context` | Context relative to the project root | `"."` | `"../.."` |
| `images[].dockerfile` | Dockerfile relative to context | `"Dockerfile"` | `"apps/api-service/Dockerfile"` |
| `images[].target` | An actual Dockerfile stage name, not the CLI target enum | Dockerfile's final stage; templates explicitly select runtime/web | `"runtime"` / `"web"` |
| `images[].containerPort` | Internal port, integer 1–65535, matching the server | API: deployment port configuration, normally 3000; Web: 8080 | `3000` / `8080` |
| `desktop` | Required for desktop: relative Tauri directories, built in order | Unset; configure before desktop builds | `["apps/my-app-desktop"]` |

`images[].target` means “which Dockerfile stage to build.” The CLI's --target means “which build method to use.” For the fullstack Dockerfile:

| Stage | Contents and use | Default selection | Configuration example |
| --- | --- | --- | --- |
| runtime | API and production dependencies: the app delivery image | Selected for app | `{"name":"app","target":"runtime","containerPort":3000}` |
| web | Nginx and static Web files; exists only with the Web frontend | Selected for web; also the final stage when Web exists | `{"name":"web","target":"web","containerPort":8080}` |
| build, service-build, service | Compiler, service dependency preparation, or a base inherited by runtime | Normally not delivery targets | Use `"target":"build"` only when inspecting an intermediate stage |

Other templates may have runtime-base; custom Dockerfiles can define their own names. The engine rejects nonexistent stages. Do not omit the app target in fullstack: with Web enabled, the final stage is web, which would incorrectly be treated as the API image.

Repository examples under `apps/*` may use `context: "../.."` and `dockerfile: "apps/<name>/Dockerfile"` to build from the monorepo root. Standalone generated projects normally use `.`. Keep `target` in sync with Dockerfile stages.

The version comes from package.json.version at the application root where build runs, for example 1.2.3. Prerelease/build metadata is supported, up to 80 characters. Fullstack only needs the root version changed, not each service/desktop package. Images produce `.hai/build/docker/1.2.3-<timestamp>-<random>/manifest.json`, `app-1.2.3.tar`, and optional `web-1.2.3.tar`. Manifest `version: 2` describes its format; `appVersion: "1.2.3"` is the application version. It also records buildId, image references, ports, and hashes. Image tags include both version and unique build ID, so rebuilding a version does not overwrite an earlier artifact. latest updates only after complete export. Transfer the entire directory without editing the manifest.

Desktop builds pass the same root version to Tauri. Windows installer exe names (for example `my-app_1.2.3_x64-setup.exe`), Linux deb/AppImage names, and macOS dmg names include it. The macOS app carries the version metadata while retaining its application name. Output is in each project's `src-tauri/target/<Rust target>/release/bundle/`. Use --platform linux/macos on those hosts, with a separate runner per OS; cross-OS builds are not promised. See the generated README for Capacitor scripts and SDKs; desktop does not generate APK/IPA.

The fullstack `tauri.conf.json` uses `"version": "../../../package.json"` to read the application root version. This is a [version-file path supported by Tauri](https://v2.tauri.app/reference/config/#version), three levels above `apps/<project>-desktop/src-tauri/`.

Static clients receive public API settings at runtime. Native clients can receive `PUBLIC_API_BASE` before the application process starts. Keep credentials out of public settings; changing deployment environments does not require rebuilding images.

## 5. Deploy artifacts to an environment

`hai deploy` is the CLI entry backed by `@h-ai/deploy`; it only consumes finished artifacts. Run these commands at the generated application root. Use `pnpm run deploy` to explicitly select the project script and avoid confusion with pnpm's own command of the same name:

```sh
pnpm build --target docker
pnpm run deploy --env test
pnpm run deploy --env prod --skip-middleware
```

pnpm run deploy executes the script already generated in the root package.json. Fullstack uses `hai deploy packages/my-app-serv`: that service directory is the entry for backend configuration and runtime dependency analysis, **not a request to deploy only the API**. The deployer finds the root artifact manifest, takes both app and web from it, and publishes them together. You do not deploy Web separately.

The API template contains only contract and API, without Web, so its script `hai deploy apps/my-app-service` publishes only app. These paths reflect template layouts; run the same pnpm run deploy command at the root rather than changing into service directories. Single-package scripts use hai deploy. To specify fullstack's entry explicitly:

```sh
pnpm exec hai deploy packages/my-app-serv --env prod --env-dir .
```

### Prepare the environment and destination

Deployment first selects an environment and checks its `.env.test`, `.env.prod`, or other mode file. If missing, create it using `.env.example` before continuing. The tool does not guess production settings. `--env-dir` selects the file directory relative to the command's working directory.

The service's `config/_deploy.yml` selects the provider and public port:

```yaml
provider:
  type: docker-ssh
  expose:
    hostPort: 18080
container:
  s3Engine: ${HAI_DEPLOY_CONTAINER_S3ENGINE:rustfs}
```

container.s3Engine is optional. HAI_STORAGE_TYPE=s3 selects a protocol, not which S3 server to create. Only when default configuration creates a Compose S3 service does this field choose RustFS or MinIO images, startup, and bucket initialization. Local storage, a custom existing S3 connection, and skipped middleware do not create a new S3 service because of this setting.

| S3 setting | Meaning and values | Default | Example |
| --- | --- | --- | --- |
| container.s3Engine | Automatically created S3 implementation: rustfs/minio | rustfs, including when container is omitted | Environment reference in the YAML above |
| HAI_DEPLOY_CONTAINER_S3ENGINE | Shared variable saved in the selected environment file | Schema/YAML default rustfs when unset | `HAI_DEPLOY_CONTAINER_S3ENGINE=minio` in .env.prod |

The wizard saves the choice and adds the YAML reference if missing, so you do not have to add it manually.

The first automatic deployment asks for the Linux host, SSH user/port, private-key and known_hosts paths, remote directory, engine, and public port. It saves the configuration in `.env.local` for reuse. Private keys are referenced by path, never copied into this file. You can also set the provider object yourself:

```dotenv
HAI_DEPLOY_PROVIDER='{"type":"docker-ssh","ssh":{"host":"10.0.0.20","username":"deploy","port":22,"identityFile":"C:/Users/me/.ssh/hai_deploy"},"remote":{"baseDir":"/opt/hai/apps","runtime":"docker"},"expose":{"hostPort":18080,"containerPort":3000}}'
```

Replace the example address and paths. Verify the SSH host fingerprint and prepare noninteractive authentication; the account needs container and directory permissions. Do not disable host checks to fix authentication. The whole `HAI_DEPLOY_PROVIDER` object overrides YAML provider settings, so check it when changing destinations. See the [deploy module](../../packages/deploy/README.en.md) and [environment/middleware reference](../../packages/cli/templates/skills/hai-deploy/middleware.md) for more fields.

### Configure only the middleware the application needs

The deployer traverses the target application's runtime dependencies in `pnpm-lock.yaml`, excluding dev/peer-only requirements. It combines those dependencies with configuration to identify database, cache, S3, vector, LDAP, mail, and other backends. With `HAI_DB_TYPE=postgresql`, the prompt explains that the current default is PostgreSQL and what it serves.

For each dependency, choose defaults or a custom connection; a complete configuration in the target environment also enables “keep unchanged.” Defaults add Compose services or use the supported cloud provisioner. Custom mode asks for connection fields individually; keeping a dependency unchanged skips it. Public settings and private credentials are written to environment files and `.env.local` respectively. Never commit passwords.

If all connections are ready, skip middleware in the prompt or use `--skip-middleware`; it neither rewrites connections nor provisions resources. Having an image is different from having a running service: custom mode needs reachable services, accounts, databases/buckets, and container networking.

### Deployment options

| Deploy option | Purpose | Default | Example |
| --- | --- | --- | --- |
| `[appDir]` | Backend configuration and runtime dependency entry; generated scripts fill it in | Current directory for direct hai calls | `pnpm exec hai deploy packages/my-app-serv` |
| `--env <environment>` | test/prod or a custom name with a matching file | No fixed value: prompt, or required in noninteractive mode | `--env prod` |
| `--env-dir <path>` | Environment file directory | Auto-detected: root for fullstack, service for API | `--env-dir .` |
| `-y, --yes` | Use complete target configuration/current backend defaults without prompts; required files/target are still checked | false | `--env prod --yes` |
| `--project-name <name>` | Override application name before adding the environment suffix; affects directories and volumes | Scanned service package name, falling back to directory name | `--project-name orders` |
| `--skip-middleware` | Skip all middleware setup/provisioning; SDK: skipMiddleware | false | `--skip-middleware` |
| `--artifact-dir <path>` | Manifest directory or parent containing latest | `.hai/build/docker` at the nearest build-entry/lockfile root | `--artifact-dir .hai/build/docker/1.2.3-<build-id>` |
| `--bundle-only` | docker-ssh tar only, without SSH | false: deploy online | `--bundle-only` |
| `--output <path>` | Output path; appends -version.tar unless that suffix is already present | Service `.hai/deploy/<environment>/bundle-<project>-<deployment-id>-<version>.tar` | `--output release-prod.tar` → release-prod-1.2.3.tar |

Missing artifacts stop deployment; no build runs implicitly. For automation, use `pnpm run deploy --env prod --yes --skip-middleware --artifact-dir .hai/build/docker/<buildId>` after replacing the buildId and configuring the destination. Cloud provisioners may create paid resources; use only authorized accounts and scope.

### When the machines can connect: automatic deployment

The local machine generates Compose configuration, runtime settings, and a startup script, bundles these with app/web image archives into one tar, and uploads it over SSH. Linux extracts it, loads images, starts Compose, and checks API/Web health. No source is uploaded and no images are built remotely. The local deployment machine does not need a container engine.

Fullstack exposes Web and a same-origin API proxy on the public port. Private API variables are not mounted into Web. Check login, page refresh, critical actions, and data after restart. Configure external HTTPS, DNS, certificates, and any required CORS for your ingress; deployment does not configure TLS automatically.

### When the machines cannot connect: copy a bundle

```sh
pnpm run deploy --env prod --bundle-only --output release-prod.tar
```

For version 1.2.3 this creates release-prod-1.2.3.tar. The result is packaged, not a running server. It contains docker-compose-1.2.3.yml, manifest.json, .env.runtime, optional web.conf, images/, SHA256SUMS, start-prod.sh, and README.txt. Compose also records x-hai-version and application container version labels; project and volume identities stay stable through upgrades. Restrict access to this private bundle and keep it out of Git. Transfer it to Linux and follow its README:

```sh
mkdir -p release && chmod 700 release
tar -xf release-prod-1.2.3.tar -C release
cd release
HAI_DEPLOY_PROVIDER_REMOTE_RUNTIME=docker sh start-prod.sh
```

For Podman, change the runtime value to `podman` and prepare a working Compose command. The script verifies files, loads API/Web, checks every image reference, exports the selected environment markers, and starts the services. Missing middleware images stop startup without pulling from a registry. **Middleware images are not included automatically**: import the exact names and tags listed in the bundle README beforehand.

The script selects the versioned Compose file automatically. For manual status checks use `docker compose -f docker-compose-1.2.3.yml --env-file .env.runtime ps`; replace ps with logs to view logs.

Repeated deployment of the same project/environment reuses persistent volumes. Back up data before updates, create a new bundle for that environment, and repeat the procedure. Retain old manifests and images to redeploy an earlier build if needed. Image rollback does not reverse database migrations; plan data backup and recovery separately.

### Before going fully offline

- On the Windows deployment machine, prepare supported Node/pnpm, the full project, installed CLI/SDK dependencies, tar, and the complete `.hai/build/docker/<buildId>` directory. Automatic deployment additionally needs ssh/scp; manual transfer does not. Offline deployment alone needs no local Docker, CUDA, or Linux compiler.
- Build matching Linux/CPU images beforehand. If building must also work offline, prepare a Linux container engine, every base image, Corepack/pnpm, Linux dependency caches, and SQLite prebuilt binaries matching the driver version, Node ABI, architecture, and libc. Windows node_modules cannot replace Linux native dependencies.
- On Linux, prepare Docker/Podman, Compose, sh/tar/sha256sum, exact middleware image tags, storage, and permissions. Existing PostgreSQL, Redis, and RustFS images still need matching names/tags. External services must be reachable from containers; container localhost is not the host machine.
- Prepare `.env.prod` and private local overrides, ports, certificates, and data directories. Rehearse packaging, transfer, startup, login, refresh, and persistence with external networking actually disconnected.

Vercel uses a separate path: it requires network access, platform credentials, and Build Output API v3 `.vercel/output` from a compatible adapter. Deployment uploads prebuilt output and runtime variables; it neither converts ordinary Node output nor rebuilds sources on the platform. `--bundle-only` does not apply to Vercel.

## 6. Update the framework while keeping your application

From the application directory, ask the assistant to use [hai-framework-sync](../../packages/cli/templates/skills/hai-framework-sync/SKILL.md):

> Upgrade hai-framework to the latest published version. Check current dependencies and the target release, explain changes and choices, then migrate dependencies, calls, configuration, and skills while preserving project-specific rules. Complete validation; do not publish or deploy the application.

You can request a specific version or ask for comparison only. The skill queries the actual registry/dist-tag, verifies target versions and engine requirements for every used package, compares cumulative changes, updates exact versions and the lockfile, and migrates public API usage, settings, scripts, and complete skill resources. Network failures or incomplete releases are reported as blockers; cached data is not presented as “latest.”

`hai init` can add missing AI entry files and skills to older projects while preserving existing files. It is not a framework upgrade command and does not overwrite old rules. Merge existing skills using the old template, application customizations, and new template. Framework `main` is not necessarily the version published to npm.

After upgrading, run the project's typecheck, lint, build, test, and affected E2E checks, including real authentication, data, and critical workflows. Rebuild deliverable images or installers, then deploy as described in section 5. A version edit or successful build alone does not complete an upgrade.
