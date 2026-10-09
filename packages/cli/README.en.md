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

The CLI copies complete selected skill directories from `templates/skills/` into the generated project's `.agents/skills/`. `SKILL.md` defines boundaries and task navigation; `reference.md`/`guide.md` hold on-demand examples. Do not copy only the entry file. AGENTS.md holds application constraints and Claude/Copilot bridge files reference it. Template changes must sync relevant repository skills. Generation tests verify delivery of reference files.

## Quick start

Requires Node.js ≥ 22.12.0; generated root projects and workspace packages declare the same minimum.

### Create a project

```bash
# 交互式创建（推荐）
npx hai create my-admin-app

# 指定模板与功能
npx hai create my-app -t full
npx hai create my-app -t custom -f iam,db,ai
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
npx hai add

# 指定模块
npx hai add iam
npx hai add storage
```

Add modules incrementally to an existing project. The CLI updates `package.json`, creates configuration, and resolves dependencies.

### Initialize/validate configuration

```bash
# 校验配置完整性，补全缺失配置
npx hai init

# 强制重新生成所有配置
npx hai init --force
```

### Code generation

Names must start with a letter and contain only letters, digits, hyphens, or underscores; paths are rejected. All outputs are preflighted and overwrites rejected by default; only explicit `--force` replaces files. Outputs and symlink targets must stay in the working directory.

Page/API generators target SvelteKit; components use Svelte 5 children snippets. APIs use `kit.handler` and Zod validation. Migrations export explicit `up()` / `down()`; initialize `reldb` before calling and check HaiResult afterward. This is not an automatic migration runner. `down()` deletes tables and requires application confirmation before execution.

```bash
# 交互式生成
npx hai generate

# 指定类型
npx hai generate page users
npx hai generate component UserCard
npx hai generate api users
npx hai generate model user
npx hai generate migration add-users

# 快捷命令
npx hai g:page dashboard
npx hai g:component StatusBadge
npx hai g:api orders
npx hai g:model order
```

## Project templates

| Template  | Description | Included features                                         |
| --------- | ----------- | --------------------------------------------------------- |
| `minimal` | Minimal     | Basic SvelteKit/hai skeleton (Svelte 5 + Vite on mobile)  |
| `default` | Default     | IAM + DB + Cache + Crypto                                 |
| `full`    | Full        | All business modules + API Service / contract integration |
| `custom`  | Custom      | Choose as needed                                          |

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

### 5. Run tests

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

## License

Apache-2.0

Failures and degraded-state messages must also be localized: website APIs use the request locale for AI fallback and email delivery status; undelivered messages must not be described as received. CLI deployment status uses cliM, and Gallery encryption limitations use bilingual messages. Verify unconfigured, failed, and successful paths in Chinese and English without paid service calls.

Provisioned configuration: Neon emits HAI_DB (PostgreSQL JSON), Upstash HAI_CACHE (Redis rediss URL JSON), and R2 HAI_STORAGE (flat S3 JSON). Email/SMS emit HAI_REACH_PROVIDERS; deployApp merges both channels while preserving YAML message templates, replacing the original providers array. Core supports whole-object/array overrides, with parents preceding leaves and schema validation retained. Build subprocesses and target runtimes share provisioned values. R2 needs existing S3 accessKeyId/secretAccessKey, Resend a verified-domain from address, and Alibaba Cloud approved signName/templates. Applications need matching `_db.yml` / `_cache.yml` / `_storage.yml` / `_reach.yml` loaded at startup; network clients require Node.

Deployment recovery: `ProvisionResult.resourceStatus` marks created/reused. `getDeployRecovery(result.error)` reads projectName, stage, platformProjectId, and resource lists; unknown means an uncertain request result that must first be checked in the provider console. Preserve returned IDs for failed resources. Recovery excludes envVars, raw exceptions, and credentials; the CLI shows resources and advice. Same-name retries reuse resources. Reused resources are never deleted automatically; clean up newly created resources only after manually confirming they are unused.
