# hai Framework

**AI capabilities, security controls and business delivery in one TypeScript workspace.**

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

[![npm latest](https://img.shields.io/npm/v/%40h-ai%2Fcli?label=npm%20latest)](https://www.npmjs.com/package/@h-ai/cli)
[![CI](https://github.com/hai-series/hai-framework/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/hai-series/hai-framework/actions/workflows/ci.yml)
[![CodeQL](https://github.com/hai-series/hai-framework/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/hai-series/hai-framework/actions/workflows/codeql.yml)
[![Documentation website](https://github.com/hai-series/hai-framework/actions/workflows/pages.yml/badge.svg?branch=main)](https://hai-series.github.io/hai-framework/)
[![License](https://img.shields.io/github/license/hai-series/hai-framework)](LICENSE)

[Website and template previews](https://hai-series.github.io/hai-framework/) · [Usage guide](docs/usage/README.en.md) · [Configuration handbook](docs/usage/configuration/README.md) · [Releases](https://github.com/hai-series/hai-framework/releases/latest)

Build business dashboards, AI assistants, knowledge bases and applications across platforms with **22 composable packages**, runnable CLI templates, shared UI and deployment tools. Frontends and backends share types and API contracts; developers and AI assistants share instructions, Skills and validation entry points.

## Why hai

### AI: turn model calls into application features

Connect OpenAI-compatible models, tool calls and MCP, then compose RAG, conversation memory, images, speech and A2A. Reuse chat, Markdown, document and Mermaid components to bring model output into business interfaces.

![Document component with navigation, dark theme and Mermaid content](docs/usage/images/ai-document-dark.png)

Actual component screenshot. Model inference requires the selected provider and credentials; this image demonstrates content presentation. [AI development](docs/usage/development/ai.md) · [Models and knowledge configuration](docs/usage/configuration/ai.md)

### Security: connect accounts, APIs and audit controls

Use authentication and RBAC, active/dormant/deactivated account states, password and session policies, security auditing, and request rules by path, method, IP and time. Choose application encryption requirements for individual external APIs; trusted proxy handling establishes the client address used for access checks.

![System administrator selecting a role when creating a Fullstack account](docs/usage/images/account-role-choices.png)

Actual template screenshot. System administrators manage all accounts and roles; audit and other business permissions remain separately authorized. [Identity and security](docs/usage/configuration/identity.md) · [Request policies](docs/usage/configuration/request-access.md) · [Security review](docs/usage/governance/security-review.md)

### Data: start locally and choose the backends you need

Choose SQLite, PostgreSQL or MySQL for relational data, Memory/Redis for caching, Local/S3 for files, and LanceDB, pgvector, Qdrant or Chroma for vector search. Transactions, pagination, presigned URLs and text chunking have dedicated modules.

Multiple production instances need suitable shared databases, Redis and object storage; configure external services separately. [Data access](docs/usage/development/data.md) · [Data configuration](docs/usage/configuration/data.md)

### Operations: move feedback into a support workflow

Associate feedback with captured interactions, page replay, logs, requests and business evidence. Administrators can filter, handle, reopen and export diagnostic packages. Audit, notifications and scheduling support ongoing application operations.

![Feedback handling with notes, status and history](docs/usage/images/feedback-handled.png)

Actual example application screenshot. The version inside the feedback identifies its capture context. Configure collection scope, redaction, capacity and notifications for your application. [Feedback and troubleshooting](docs/usage/operations/feedback.md) · [Operations configuration](docs/usage/configuration/operations.md)

### UI and delivery: carry the template through to deployment

Shared Svelte 5 components cover forms, tables, dialogs, authentication, onboarding and help. Themes and Chinese, English and Japanese messages carry across applications. ToastContainer presents readable warnings and errors, with trace identifiers available on demand.

![Component gallery with login form and unified error feedback](docs/usage/images/gallery-scenes-zh-CN.png)

Create same-origin SvelteKit applications or separate APIs with Web/App/Desktop clients. Deploy images or offline bundles, update selected services and recover failed releases; static Website output can run on GitHub Pages. [UI configuration](docs/usage/configuration/experience.md) · [Delivery handbook](docs/usage/configuration/delivery.md)

## Create your first application

Use Node.js `^22.23.4 || ^24.22.1 || ^26.12.1` and pnpm 12.11.2. Node.js 24.22.1 matches CI. Use `pnpm.cmd` in Windows PowerShell.

```sh
pnpm dlx @h-ai/cli@latest create my-app --type fullstack --frontends web --defaults
cd my-app
pnpm dev
```

The CLI installs dependencies and initializes Git by default. Sign in as `admin`; find the random initial password in `HAI_ADMIN_DEFAULT_PASSWORD` in the generated `.env.dev`, then change it when prompted. Keep environment files and passwords private.

New projects include the full applicable modules and examples, including server AI/vector dependencies. Use `hai create --defaults` to skip prompts; default containers skip extra CUDA downloads. Follow the generated README for directories, environment files and addresses, or use the [first-run guide](docs/usage/getting-started/create.md).

The installation version follows [npm's latest tag](https://www.npmjs.com/package/@h-ai/cli?activeTab=versions), which the badge reads directly. Run `pnpm view @h-ai/cli@latest version` to query it; replace `@latest` with the returned version for reproducible team installations. npm installation tags and GitHub's Latest presentation setting are managed separately.

### Choose a template

| Template    | Purpose                                               | Creation options                   |
| ----------- | ----------------------------------------------------- | ---------------------------------- |
| Fullstack   | Separate API and multiple clients sharing a contract  | `--type fullstack --frontends web` |
| API         | Independent Node.js service and public APIs           | `--type api`                       |
| Admin       | Same-origin dashboard with account and business pages | `--type admin`                     |
| Website     | Corporate, product and static documentation sites     | `--type website`                   |
| H5 / Mobile | Mobile web or Capacitor application                   | `--type h5` / `--type mobile-app`  |

![Login page from an actual CLI-generated Admin project](apps/framework-website/public/template-previews/admin-login.png)

[Explore real Fullstack, Website, Admin and Mobile previews](https://hai-series.github.io/hai-framework/#template-previews). Website uses SSR by default; follow the [static build instructions](docs/usage/configuration/delivery.md#静态website与github-pages) for static hosting. Native packages require the platform toolchain.

### Build and release

Configure the environment and deployment destination in the generated project, then run:

```sh
pnpm build --target image
pnpm run deploy --env prod --plan
pnpm run deploy --env prod
pnpm run deploy --env prod --build --services "serv,web"
pnpm run deploy --env prod --build --bundle-only
```

`--plan` performs a read-only preflight, `--services` selects services to update, and `--bundle-only` produces a portable offline bundle. Automatic recovery covers services and configuration snapshots; database migrations and external side effects need their own recovery plans. See [delivery configuration](docs/usage/configuration/delivery.md) for real client IPs, subpaths, direct storage access and policy files.

## Find modules by domain

Install `@h-ai/*` as needed in existing projects, or use `hai add <module>` to add modules and configuration to supported templates. Each link documents the public API, configuration and examples.

| Domain                  | Modules and responsibilities                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation and security | [core](packages/core/README.en.md): results, configuration, logs, lifecycle and request policies; [crypto](packages/crypto/README.en.md): SM2/SM3/SM4 and password hashing; [iam](packages/iam/README.en.md): authentication, sessions and RBAC                                                                                              |
| Data                    | [reldb](packages/reldb/README.en.md): relational data and transactions; [cache](packages/cache/README.en.md): cache and distributed locks; [storage](packages/storage/README.en.md): files and presigned URLs; [vecdb](packages/vecdb/README.en.md): vector search; [datapipe](packages/datapipe/README.en.md): text processing and chunking |
| AI                      | [ai](packages/ai/README.en.md): LLM, tools/MCP, RAG, memory, images, speech and A2A                                                                                                                                                                                                                                                          |
| Business and operations | [feedback](packages/feedback/README.en.md): feedback and diagnostics; [audit](packages/audit/README.en.md): audits and alerts; [reach](packages/reach/README.en.md): messaging; [scheduler](packages/scheduler/README.en.md): scheduled jobs; [payment](packages/payment/README.en.md): payment providers                                    |
| APIs and platforms      | [api-contract](packages/api-contract/README.en.md): shared contracts; [serv](packages/serv/README.en.md): Hono/oRPC runtime; [api-client](packages/api-client/README.en.md): typed clients; [kit](packages/kit/README.en.md): SvelteKit integration; [capacitor](packages/capacitor/README.en.md): native bridge                             |
| UI and engineering      | [ui](packages/ui/README.en.md): Svelte components and themes; [cli](packages/cli/README.en.md): scaffolding, generation and upgrades; [deploy](packages/deploy/README.en.md): Vercel and Docker SSH delivery                                                                                                                                 |

Lifecycle modules follow `init → use → close`, checking `HaiResult.success` at each step. Core, pure functions, contracts and service factories follow their actual type contracts. Consult the [configuration handbook](docs/usage/configuration/README.md) for shared state, provider prerequisites and authorization boundaries.

## Reading paths

| Your task                             | Start here                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Evaluate and create                   | [Capabilities and environment](docs/usage/overview/README.md) → [first delivery](docs/usage/getting-started/README.md) |
| Develop business features or AI       | [Development guide](docs/usage/development/README.md) → module README                                                  |
| Manage configuration and deployment   | [Defaults and configuration index](docs/usage/configuration/README.md) → [operations](docs/usage/operations/README.md) |
| Review security and diagnose problems | [Security review](docs/usage/governance/security-review.md) → [feedback](docs/usage/operations/feedback.md)            |
| Maintain the framework with AI        | [AGENTS.md](AGENTS.md) → [LLMS.txt](LLMS.txt) → task-specific Skills                                                   |

The role-based domain handbook is currently in Chinese; the [English guide](docs/usage/README.en.md) links to the translated creation-to-delivery workflow.

## Development

`packages/*` contains framework packages, `apps/*` contains examples and the documentation site, and `packages/cli/templates/` contains generated applications and shared Skills. Keep callers, configuration examples, documentation, screenshots and tests aligned with feature changes.

```sh
pnpm install --frozen-lockfile
pnpm --filter admin-console dev
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @h-ai/cli test:scaffold-gates
```

[CI runs in parallel stages](docs/ci.md) and reuses eligible successful results by input fingerprint. **CI** validates types, builds, tests and browser flows. **CodeQL** analyzes JavaScript/TypeScript for security findings, available in GitHub Security. **Leak Checker** checks a maintainer-configured word list. Badges report workflow results; assess findings alongside business authorization and deployment reviews.

npm scans packages before making them available. CI waits up to thirty minutes for every package to become queryable before promoting `latest`; see [release recovery](docs/ci.md#查看结果与重新运行).

Local commit/push hooks use `scripts/check-leak-words.mjs`; keep `.leak-words.json` private. Container gates clean up resources registered for that run. Preview historical test image cleanup with `node scripts/cleanup-test-images.mjs --runtime=podman --legacy` before adding `--apply`. [Verification notes](docs/usage/governance/verification.md) distinguish actual runs, reuse and environment dependencies.

## License

[Apache-2.0](LICENSE)
