# @h-ai/cli

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[Framework home](../../README.en.md) · Related modules: [@h-ai/core](../core/README.en.md)

> hai Agent Framework CLI: interactive project scaffolding and code generation.

## Capabilities

`hai deploy` exits nonzero on missing modules/configuration, credential loading, scanning, initialization, deployment, or closure failures. Scripts must check the exit code; only complete deployment success can unlock subsequent steps.

- **Project creation**: guided creation of SvelteKit apps, Svelte 5 mobile/desktop frontends, and hai backends.
- **Module addition**: incrementally enable modules in an existing project with dependency resolution.
- **Configuration initialization**: validate completeness and create missing configuration files.
- **Code generation**: pages, components, API endpoints, data models, and migrations.
- **Templates**: minimal / default / full / custom project templates.
- **Feature composition**: enable IAM, DB, AI, Storage, Crypto, and more as needed.
- **API service scaffolding**: compose contracts/procedures with `@h-ai/api-contract` + `@h-ai/serv`, consumed through the `@h-ai/api-client` typed client.
- **Dependency resolution**: selecting features automatically includes their dependencies (for example, IAM adds Crypto).

## AI usage guidance

Claude Code v2.1.277 and later can also read root `AGENTS.md` directly when no higher-priority project CLAUDE file overrides it and the built-in support is enabled. The single-line `@AGENTS.md` bridge supports older or disabled sessions without duplicating instructions or requiring a `.claude/` directory. See [AGENTS.md support](https://code.claude.com/docs/en/memory#agentsmd).

The CLI copies complete selected skill directories from `templates/skills/` into the generated project's `.agents/skills/`. `SKILL.md` defines boundaries and task navigation; `reference.md`/`guide.md` hold on-demand examples. Do not copy only the entry file. AGENTS.md holds application constraints and Claude/Copilot bridge files reference it. Template changes must sync relevant repository skills. Generation tests verify delivery of reference files.

Every application type includes `hai-spec-review` to review requirements and designs before generation: completeness, ambiguity, technical/framework correctness, and consistent naming. It reports located issues with concrete corrections and declares generation readiness only when issues are resolved and evidence is sufficient. `hai init` / `hai add` also backfill this workflow skill while preserving custom files.

Business behavior follows the user's current explicit requirements and designated requirements/design documents. Template AGENTS, README, skills, generated code and tests provide adjustable defaults for roles, permissions, workflows, limits and architecture. Review lists differences as template adaptations rather than requirements defects; authorized implementation updates conflicting code, tests and outdated guidance. Installed public API contracts, server authorization, resource isolation, input validation and credential protection still apply. Existing projects must merge this guidance explicitly; `hai init` preserves existing files.

After review, the separate `hai-spec-implement` skill handles implementation from documents. Every application includes it, and `hai init` / `hai add` backfill its complete resources. AI splits work by independently verifiable features and actual dependencies, using `docs/task-list.md` and `docs/tasks/<id>-<slug>.md` by default. Each task uses its own Git branch, TDD, quality gates and a local merge; records are marked complete after the actual merge commit and integration checks. Rework keeps the same task ID, file and branch, adding a new cycle linked to prior evidence. This uses Markdown, Git and existing development/test skills, with no new runtime dependency or workflow engine. Requests can plan only, implement a document, execute T003, or repair and merge T002. Planning does not start implementation; selected tasks require completed dependencies, and remote actions follow the user's authorization.

For everyday feature additions, changes and fixes, `AGENTS.md` routes to `hai-app-create/SKILL.md` and `development.md`. Map requirements to existing framework features, configuration and extension points before implementing against the installed package's exports and types. Reuse applicable capabilities and explain concrete gaps; do not install unrelated dependencies to increase module coverage. Codex uses `.agents/skills/` and the project root's persistent `AGENTS.md` rules.

Tool entry points share one set of rules and skills: Codex/Cursor use AGENTS and `.agents/skills/`; Copilot's `.github/copilot-instructions.md` only references the shared `AGENTS.md`, with application-specific rules maintained there; OpenCode's opencode.json references the shared rules directly through `instructions: ["AGENTS.md"]`. Claude Code's root CLAUDE.md contains only `@AGENTS.md`; task navigation in the shared rules leads to skill bodies and references in `.agents/skills/` as needed. The CLI does not create `.claude/`, duplicate skills or require symlinks. This setup does not register native Claude skills or `/skill` commands; existing Claude settings and skills are preserved. Sources: [Claude project instructions](https://code.claude.com/docs/en/memory), [Claude native skills](https://code.claude.com/docs/en/skills), [Copilot](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills), [OpenCode](https://docs.opencode.ai/docs/skills/), [Cursor](https://cursor.com/docs/skills).

Codex discovers `.agents/skills/` natively and selects skills as needed. Invoke `$hai-app-create`, `$hai-app-review`, or another skill explicitly when useful; entry points and references remain on demand. No additional `.codex/skills` tree or Copilot settings are required. Sources: [Codex skills](https://learn.chatgpt.com/docs/build-skills), [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

Generated projects share `eslint-rules.js`. Lint rejects explicit `any`, console calls, unexplained suppressions, double unknown assertions, internal framework source imports and writes to known sensitive localStorage keys. A necessary third-party workaround requires a documented local exception. Static rules do not prove authorization, input safety, transaction behavior or log redaction; verify those through tests and review.

For existing projects, update the CLI and run `hai init` to fill missing workflow skills, resources and entry files. Existing files are preserved, including AI rules when using `--force`. Merge existing entry files, skills, ESLint configuration and scripts against a newly generated project, and restore missing .npmrc/.gitignore files; filling missing files does not upgrade old rules. Before release, use the CLI built from this repository to create the comparison project and keep unpublished capabilities separate from installed package capabilities.

Before writing AI files, the CLI resolves existing file and directory links. Shared skills and project bridges must stay inside the project; external targets stop the write. Existing `.claude/` directories and links are outside generation; `hai init` / `hai add` do not modify or delete their contents.

Delivery checks cover both the package archive and generated projects. Source `.npmrc` / `.gitignore` templates use a `.hbs` suffix to avoid packaging exclusions; generation restores their normal names and preserves dependency layout and sensitive-artifact ignore rules. An archive regression verifies every template is in the `.tgz`, beyond creation from the source checkout.

## Quick start

Requires Node.js 22.22.2+ / 24.15.0+ / 26+; generated root projects and workspace packages declare the same minimum.

### Install the CLI

First install `@h-ai/cli` globally. It provides the `hai` command; the quick-start examples below assume this installation is complete.

```bash
pnpm add -g @h-ai/cli
hai --version
```

In PowerShell, use `pnpm.cmd add -g @h-ai/cli`. To update an installed CLI to the current published version, run the same installation command. Check available commands with `hai --help`. For unpublished templates, follow the local development section below to build and run the CLI from this repository.

### Create a project

Generated `@h-ai/*` dependencies are pinned to the CLI version; pnpm references that exact version through `catalog:`. Upgrade framework packages together and verify the versions resolved in the lockfile.

In your application repository, ask the AI to "upgrade Hai-framework to the latest version". Project instructions route to [hai-framework-sync](templates/skills/hai-framework-sync/SKILL.md) to check published versions online, compare cumulative changes and application impact, request decisions or blocker resolution when needed, then migrate dependencies/code/configuration, merge skills and AI instructions, and validate. Comparison-only requests do not modify the application. `hai init` / `hai add` backfill the upgrade skill, adjacent resources and referenced CI/PR workflow skills even when the original template cannot be identified. Existing files are preserved; older skills and routing still need to be merged.

Creation messages are written directly to the terminal. Installation failures display the package manager command, exit code and stdout/stderr, and retain generated files for a retry from the project directory. The `prebuild-install@7.1.3` deprecation warning comes from the upstream `better-sqlite3` installer dependency. That warning alone does not fail installation; do not override or remove the native installer to hide it.

```bash
# 交互式创建（推荐）
hai create my-admin-app

# 指定模板与功能
hai create my-app -t full
hai create my-app -t custom -f iam,db,ai
```

Interactive steps:

1. Enter the project name.
2. Choose a template (minimal / default / full / custom).
3. Select feature modules (custom template).
4. Choose whether to include example code.
5. Choose a package manager (pnpm / npm / yarn).
6. Choose whether to install dependencies.
7. Choose whether to initialize Git.

### Add modules

```bash
# 交互式选择
hai add

# 指定模块
hai add iam
hai add storage
```

Add modules incrementally to an existing project. The CLI updates `package.json`, creates configuration, and resolves dependencies.

### Initialize/validate configuration

```bash
# 校验配置完整性，补全缺失配置
hai init

# 强制重新生成所有配置
hai init --force
```

### Code generation

Names must start with a letter and contain only letters, digits, hyphens, or underscores; paths are rejected. All outputs are preflighted and overwrites rejected by default; only explicit `--force` replaces files. Outputs and symlink targets must stay in the working directory.

Page/API generators target SvelteKit; components use Svelte 5 children snippets. APIs use `kit.handler` and Zod validation. Migrations export explicit `up()` / `down()`; initialize `reldb` before calling and check HaiResult afterward. This is not an automatic migration runner. `down()` deletes tables and requires application confirmation before execution.

```bash
# 交互式生成
hai generate

# 指定类型
hai generate page users
hai generate component UserCard
hai generate api users
hai generate model user
hai generate migration add-users

# 快捷命令
hai g:page dashboard
hai g:component StatusBadge
hai g:api orders
hai g:model order
```

## Project templates

| Template  | Description | Included features                                         |
| --------- | ----------- | --------------------------------------------------------- |
| `minimal` | Minimal     | Basic SvelteKit/hai skeleton (Svelte 5 + Vite on mobile)  |
| `default` | Default     | IAM + DB + Cache + Crypto                                 |
| `full`    | Full        | All business modules + API Service / contract integration |
| `custom`  | Custom      | Choose as needed                                          |

## Fullstack mini administration

The default workspace includes `@h-ai/ui/guide` onboarding and help: first-use invitations, element tours, searchable instructions, manual replay and profile setup tours. Web/App/Desktop share content and translations; Web uses Cookies and native WebViews use localStorage, isolated by user and tour version. Extend the shared guide-store and data-guide anchors; see the [guide skill](templates/skills/hai-ui/guide.md).

`--type fullstack` generates an administration workspace with IAM, reldb, cache, audit, storage and crypto by default. The required management modules remain enabled even with the minimal preset. `--frontends` selects Web, Capacitor App and Tauri Desktop; miniapp remains a documentation placeholder excluded from runtime and builds.

```powershell
hai create mini-admin --type fullstack --frontends web,app,desktop
cd mini-admin
pnpm.cmd install
pnpm.cmd dev
```

The CLI generates a root `.env` with a unique random strong `HAI_ADMIN_DEFAULT_PASSWORD`, so `dev` / `start` work directly. Sign in as `admin` using that password; an environment variable with the same name overrides it. Passwords follow `_iam.yml` policy, with a default minimum of 8 characters. Startup logs include the specific validation reason and error code when a password violates the policy. Once users exist, the variable does not reset accounts or passwords. Git and container builds ignore `.env`, while `.env.example` contains only a placeholder. Set a separate password in each deployment environment.

- Administrators can search, paginate, create, edit, enable, disable and delete users and upload avatars. The server protects the current administrator and rechecks authorization inside a mutation lock so concurrent actions cannot remove every administrator's access.
- Initial roles are `admin` / `user`. The role page shows member counts and edits descriptions; the user page assigns roles. By default, ordinary users only access personal settings, and the server rejects direct management API calls from them. Adapt these business rules to actual requirements.
- The audit page filters by action, resource and date. Successful login, logout, password changes and management writes produce audit records without passwords, tokens or avatar contents.
- Personal settings cover profile, avatar, language, theme and password changes. Preferences are stored in IAM user metadata. Avatars accept PNG/JPEG/WebP up to 512 KiB; the server validates image contents and generates the storage key.

The typed api-client and serv crypto transport encrypt JSON business requests, login and refresh in both directions. Web uses an in-memory access token and an HttpOnly refresh Cookie. Native App uses Capacitor secure TokenStorage; native Desktop stores tokens only in memory and requires login after restart. The native refresh body channel verifies the client identifier, explicit transport header and trusted Origin; browser previews use Cookie mode. Public avatars are binary image resources restricted by a whitelist.

Web/App/Desktop share one `AdminWorkspace`, management store and typed client. Current-user and refresh routes use the framework's default IAM procedures; theme caching and DOM updates use `@h-ai/ui/theme`. Application code composes initial roles, self-protection, avatars and auditing as example business rules that can change with actual requirements.

Default SQLite, local storage and memory cache suit a single-instance mini administration service. Management writes support one writer instance. Multiple read instances require shared database, storage, Redis cache and sticky transport sessions; all management writes must still reach the same writer. Redis alone does not provide atomic last-administrator protection across arbitrary writers. Generated root scripts provide typecheck, lint, build, test and test:e2e; Capacitor/Tauri delivery additionally requires the appropriate native build and packaging.

## Application configuration and display

Every generated `.gitignore` includes `**/data/`, covering runtime data and `.gitkeep` at every workspace depth. Runtime code creates the required directories.

Fullstack always includes 13 `.yml` files in `packages/<project>-serv/config/`: `_core`, `_serv`, `_db`, `_cache`, `_iam`, `_storage`, `_audit`, `_reach`, `_ai`, `_vecdb`, `_payment`, `_scheduler`, and `_deploy`. Used modules retain working defaults; unused modules, optional fields, and alternative providers remain as comments. `.env.example` also includes commented credentials for unused modules. Module choices entered during creation are preserved.

To extend the service, install the required package in its workspace, validate with the public schema, initialize it and close it in reverse order in `src/server/runtime.ts`, then uncomment the relevant configuration. For a fully commented file, remove one outer comment layer first and enable optional blocks as needed. A configuration file alone does not connect business features. Replace connection blocks when switching SQLite/Redis/S3 or Reach providers, keeping each provider name unique. `crypto.init()` takes no configuration and datapipe provides pure functions; neither gets an invented YAML file.

Every template reads `name`, `version`, `env`, `defaultLocale` and `logging` from `_core.yml`, obtains metadata through `core.config` and uses `core.logger`. Single-app configuration lives in `config/`, API workspace configuration in `apps/<project>-service/config/`, and fullstack configuration in `packages/<project>-serv/config/`. YAML controls log level and format; initialization does not replace them with a fixed `logging` option.

Core environment overrides include `HAI_CORE_NAME`, `HAI_CORE_VERSION`, `HAI_CORE_ENV` and `HAI_CORE_LOGGING_LEVEL`; a whole `HAI_CORE` override follows parent-node precedence. Restart services after server configuration changes. Containers explicitly set `HAI_CORE_ENV=production`, which enables production security policy.

Leaf overrides apply only to existing YAML paths: uncomment the key first, or replace the whole object with `HAI_DB`, `HAI_CACHE`, etc. CamelCase remains one segment: `connectTimeout` maps to `HAI_CACHE_CONNECTTIMEOUT`. Locale lists belong in each frontend/shared `project.inlang/settings.json`; `_core.yml` specifies only the default locale.

The automatically generated fullstack `.env` enables only the initial administrator password and `PUBLIC_API_BASE`. Module overrides remain commented so YAML supplies defaults. Explicitly uncomment environment overrides when needed, and check existing overrides when editing YAML.

SvelteKit server layouts expose only whitelisted public metadata such as name, version, environment and default locale. Standalone mobile-app Vite configuration parses YAML through core in the Node build process and injects public values plus browser logging level/format; YAML or override changes require a rebuild. Fullstack frontends obtain public server metadata through encrypted `app.info`. No template exposes complete core/module configuration, secrets or log-redaction context to the browser.

## Global options

| Option             | Description               |
| ------------------ | ------------------------- |
| `-v, --verbose`    | Verbose output            |
| `-C, --cwd <path>` | Set the working directory |

## Local development usage

> For local CLI development in the monorepo before publishing to npm.

### 1. Build

```bash
# 构建 CLI（生成 dist/）
pnpm --filter @h-ai/cli build

# 或启动 watch 模式（修改源码后自动重建）
pnpm --filter @h-ai/cli dev
```

### 2. Run directly (no installation)

After building, invoke `dist/index.js` directly with `node`:

```bash
# 从仓库根目录运行
node packages/cli/dist/index.js create my-app
node packages/cli/dist/index.js create my-app --type admin --features iam,db
```

Or invoke it by absolute path from any directory:

```bash
node /path/to/hai-framework/packages/cli/dist/index.js create my-app
```

### 3. Global linking (`pnpm link`)

To use `hai` directly in a terminal, create a global link:

```bash
# 在 packages/cli 目录下执行
cd packages/cli
pnpm link --global

# 验证
hai --version
hai create my-app
```

> Remove the link afterward with `pnpm unlink --global @h-ai/cli`.

### 4. Use in other monorepo apps

Projects in `apps/*` reference local packages through `workspace:*` and can use them directly:

```bash
# 在仓库根目录执行，对任意 app 类型生成项目
node packages/cli/dist/index.js create ../my-new-project
```

## 5. Configuration driven authentication

Agreements support configuration-loaded userAgreementMarkdown/privacyPolicyMarkdown and URLs. Markdown takes priority for the same agreement and is safely rendered in a modal.

Admin/H5/website templates with IAM include AuthPanel and standard routes; mobile and fullstack clients share API actions. Server config/_iam.yml controls methods, registration, recovery, agreement modals and branding. LDAP/Reach are optional: install ldapts only for the default LDAP client, then enable login.ldap and set connection settings. Email/SMS use Reach templates or custom callbacks. Forms expose header/extraFields/footer snippets and AuthPanel forwards login*/register* snippets. Multiple nodes share a database and Redis.

[完整 IAM 配置 / IAM configuration](../iam/README.en.md)

### 6. Run tests

```bash
# 单元测试 + E2E 模板生成测试
pnpm --filter @h-ai/cli test

# 真实脚手架 E2E 门禁（生成项目后执行 install/typecheck/lint/build/test/e2e）
pnpm --filter @h-ai/cli test:e2e

# watch 模式
pnpm --filter @h-ai/cli test:watch

# 覆盖率
pnpm --filter @h-ai/cli test:coverage
```

Admin and fullstack gates also verify public types and runtime behavior from installed local tarballs: streams/checksums/create-only writes, API Key scopes/revocation, current authorization, batch users/role pagination, Reach templates and Audit metadata. Fullstack also verifies trusted peer IPs.

Successful screenshots default to the CLI's `test-results/scaffold-evidence/`. Set `HAI_AUTH_EVIDENCE_DIR` to retain them in a chosen directory after generated projects are cleaned up. Fullstack E2E starts every selected Web/App/Desktop browser preview and checks login, tours, help and profile navigation. Miniapp and native shells require separate platform acceptance.

Failures and degraded-state messages must also be localized: website APIs use the request locale for AI fallback and email delivery status; undelivered messages must not be described as received. CLI deployment status uses cliM, and Gallery encryption limitations use bilingual messages. Verify unconfigured, failed, and successful paths in Chinese and English without paid service calls.

Provisioned configuration: Neon emits HAI_DB (PostgreSQL JSON), Upstash HAI_CACHE (Redis rediss URL JSON), and R2 HAI_STORAGE (flat S3 JSON). Email/SMS emit HAI_REACH_PROVIDERS; deployApp merges both channels while preserving YAML message templates, replacing the original providers array. Core supports whole-object/array overrides, with parents preceding leaves and schema validation retained. Build subprocesses and target runtimes share provisioned values. R2 needs existing S3 accessKeyId/secretAccessKey, Resend a verified-domain from address, and Alibaba Cloud approved signName/templates. Applications need matching `_db.yml` / `_cache.yml` / `_storage.yml` / `_reach.yml` loaded at startup; network clients require Node.

Deployment recovery: `ProvisionResult.resourceStatus` marks created/reused. `getDeployRecovery(result.error)` reads projectName, stage, platformProjectId, and resource lists; unknown means an uncertain request result that must first be checked in the provider console. Preserve returned IDs for failed resources. Recovery excludes envVars, raw exceptions, and credentials; the CLI shows resources and advice. Same-name retries reuse resources. Reused resources are never deleted automatically; clean up newly created resources only after manually confirming they are unused.

## Generated form layouts

Website contact forms and fullstack management screens reuse UI FormLayout/FormField: one or two columns, stacked or inline labels, automatic spans and narrow-container fallback. User, profile and password forms share the same options and built-in Chinese/English validation. The generated hai-ui skill documents the complete contract.

## License

Apache-2.0
