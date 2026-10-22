# hai Framework

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

> Currently in the `0.1.0-alpha` stage: public contracts are still evolving. Pin versions and validate security and capacity for your own use cases before production adoption.

For production deployments with multiple instances, review the [21-package shared-state and recovery matrix (Chinese)](docs/distributed-state.md). Use PostgreSQL/MySQL, Redis, and shared object/vector services; initialization rejects local state backends. The matrix documents CAS/leases, idempotency, unknown external effects and validation boundaries.

<p align="center">
  <strong>AI Runtime · Enterprise full-stack modules · Agent Skills · End-to-end type safety</strong>
</p>

<p align="center">
  A TypeScript full-stack framework for AI applications, from a single LLM call to a deployable enterprise application.
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6%20%2F%207-3178c6.svg">
  <img alt="Node" src="https://img.shields.io/badge/Node-%5E22.22.2%20%7C%20%5E24.15.0%20%7C%20%3E%3D26.0.0-339933.svg">
  <img alt="Svelte" src="https://img.shields.io/badge/Svelte-5-ff3e00.svg">
</p>

---

## Introduction

hai Framework is a TypeScript full-stack framework **centered on an AI Runtime, with composable enterprise capabilities and APIs optimized for AI coding assistants**.

Start with `@h-ai/ai` for LLM and tool calls. Add `reldb`, `vecdb`, `iam`, `audit`, `serv`, `ui`, and other modules when you need persistence, multitenancy, authentication, auditing, APIs, UI, or deployment. Applications do not need the full stack at once.

A consistent API style brings together four capability groups, helping AI assistants build complete intelligent applications:

- **AI**: LLM chat, image generation, audio (ASR / TTS), MCP, tools, RAG, and vector retrieval.
- **Security**: Chinese national cryptographic algorithms, authentication, RBAC authorization, and audit logs.
- **Data**: relational databases, caches, object storage, and data pipelines.
- **Operations**: payments, notifications, scheduled tasks, and automated deployment.

## Start here

| Your task                               | Entry point                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------- |
| Create an application                   | [Create, develop and deliver](docs/usage/README.en.md)                      |
| Use a capability in an existing project | [Module catalog](#module-catalog), then the package getting started section |
| Develop with an AI assistant            | [AI index](LLMS.txt) and the generated project AGENTS.md                    |
| Build images or deploy offline          | [Build and deployment](packages/deploy/README.en.md)                        |
| Contribute to the framework             | [Development](#development) and [workspace rules](AGENTS.md)                |

## Highlights

| Feature                        | Description                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| **AI-first design**            | APIs prioritize correct use by AI coding assistants, improving usability for human developers too. |
| **Consistent lifecycle**       | Stateful modules follow `init() → use → close()` with a consistent usage pattern.                  |
| **Explicit failures**          | Domain operations return `HaiResult<T>`, distinguishing success from failure at the type level.    |
| **Validated configuration**    | Zod validates configuration during `init()`, exposing errors at startup.                           |
| **Composable modules**         | 21 independently published modules, with `@h-ai/core` as the minimum dependency, added as needed.  |
| **End-to-end type safety**     | Strict TypeScript with inference across `api-contract → serv → api-client`.                        |
| **Cross-platform UI**          | Svelte 5 Runes components (primitives / compounds / scenes) for desktop and mobile.                |
| **Scaffolding and deployment** | `hai create` scaffolds projects; `hai deploy` targets Vercel or self-hosted machines.              |
| **Built-in Agent Skills**      | Standardized module skills give AI assistants direct access to correct usage.                      |

## Design philosophy

**AI-first means prioritizing whether an AI coding assistant can correctly use each design, rather than limiting the framework to AI users.** Clear, correct usage also improves the human developer experience.

Many frameworks emphasize flexibility and conventions for human developers. AI-generated code can become inconsistent when patterns, errors, and logging lack constraints. hai Framework combines shared contracts, executable conventions, and skills to keep generated code consistent, typed, complete in error handling, and reviewable by people.

This philosophy leads to these decisions:

| Design decision                       | Value for AI                          | Value for developers                         |
| ------------------------------------- | ------------------------------------- | -------------------------------------------- |
| Shared lifecycle `init → use → close` | One usage pattern to learn            | Predictable module behavior                  |
| `HaiResult<T>` domain results         | Explicit failures in the main flow    | Less business try-catch; clearer call chains |
| Zod configuration validation          | Immediate configuration feedback      | Startup validation before runtime            |
| Provider pattern                      | Switch backends through configuration | Migrate between environments                 |
| Strict TypeScript                     | Inference guides correct calls        | Safer refactoring                            |
| Skill files + LLMS.txt                | Discover correct usage automatically  | Better generated code                        |
| Executable coding conventions         | Apply conventions to every change     | Consistent style and easier reviews          |

> **Failure semantics**: domain operations prefer `HaiResult<T>`: `{ success: true, data }` or `{ success: false, error }`. Boundaries that must throw, such as `AsyncIterable`, client transports, callbacks, and SvelteKit control flow, are documented separately in types and guides.

## Technology stack

| Layer                | Technology                                                         |
| -------------------- | ------------------------------------------------------------------ |
| Language             | TypeScript 6 / 7 (strict mode)                                     |
| Runtime              | Node.js 22.22.2+ / 24.15.0+ / 26+                                  |
| Frontend             | Svelte 5（Runes）+ SvelteKit 2                                     |
| UI                   | Tailwind CSS 4 + DaisyUI 5 + Bits UI v2                            |
| API contracts        | oRPC + Zod + OpenAPI 3.1（`api-contract → serv → api-client`）     |
| API service          | Hono + oRPC + Scalar docs                                          |
| Relational databases | SQLite / PostgreSQL / MySQL (raw SQL, no ORM)                      |
| Vector databases     | LanceDB / pgvector / Qdrant / Chroma                               |
| Cache                | Memory / Redis (standalone / Cluster / Sentinel)                   |
| Object storage       | Local filesystem / S3-compatible (AWS / MinIO / Alibaba Cloud OSS) |
| AI                   | OpenAI-compatible API + MCP                                        |
| Cryptography         | Chinese national algorithms SM2 / SM3 / SM4                        |
| Payments             | WeChat Pay / Alipay / Stripe                                       |
| Desktop              | Tauri                                                              |
| Mobile               | Capacitor（Android / iOS）                                         |
| Build                | pnpm + Turborepo + Vite + tsup                                     |
| Deployment           | Vercel (SaaS) · docker-ssh self-hosting · Neon / Upstash / R2      |

## Getting started

Follow the complete guide for prerequisites, traditional or AI-first development, compilation, image/native packaging, automatic or offline deployment, and framework updates: [English](docs/usage/README.en.md) · [简体中文](docs/usage/README.md) · [日本語](docs/usage/README.ja.md). It includes command options, `hai.build.json`, and the skills used throughout the workflow.

Use Node.js matching the project's `engines` (`^22.22.2 || ^24.15.0 || >=26.0.0`) and pnpm 12.11.2. In PowerShell, use `pnpm.cmd`.

### Create a project

```bash
# Install the CLI
pnpm add -g @h-ai/cli

# Create Web + API with deployment support; omit options for prompts
hai create my-app --type fullstack --frontends web --yes

# Dependencies are installed by default
cd my-app
pnpm dev
```

### Code generation

The page/api generators below emit SvelteKit file routes. For fullstack/API workspace contracts, procedures, and hash pages, follow the generated structure and the [usage guide](docs/usage/README.en.md).

```bash
hai generate page dashboard         # Generate a page
hai generate component UserCard     # Generate a component
hai generate api users              # Generate an API

# Short aliases
hai g:page dashboard
hai g:component UserCard
```

### Build and deploy

```bash
# Environment-independent build; auto prefers reachable Podman, then Docker
pnpm build --target docker
# Configure .env.prod and the destination, then publish existing API/Web images
pnpm run deploy --env prod
pnpm run deploy --env prod --build --services web
# Without connectivity between machines, transfer and start the bundle manually
pnpm run deploy --env prod --build --bundle-only --output release-prod.tar
```

Deployment tools are development dependencies by default; use `--no-deploy` when creating a project to omit them. Each image uses a separate Dockerfile under `images/`, selected by `hai.build.json`. Complete offline bundles include self-hosted middleware and Windows/Linux/macOS upload scripts; isolated servers run the bundled apply.sh. Partial updates preserve unselected services and volumes using the server success baseline, without project-wide down. Rebuilds of the same version use distinct build IDs and checksums. See the [usage guide](docs/usage/README.en.md) for caching, manual deployment and recovery.

### Integrate into an existing project

`@h-ai/core` is required; add other modules as needed:

```bash
pnpm add @h-ai/core                 # 基础能力（必装）
pnpm add @h-ai/ai                   # AI / LLM / MCP / 文生图 / 语音
pnpm add @h-ai/reldb                # 关系数据库
pnpm add @h-ai/vecdb                # 向量数据库
pnpm add @h-ai/iam                  # 身份认证 / 授权
pnpm add @h-ai/ui                   # UI 组件库
# …按需添加其余模块
```

> Run `hai add <module>` at an existing project root to enable modules incrementally; the CLI resolves dependencies and completes configuration.

## Module catalog

The framework provides **21 independently published modules**, organized into five layers.

### Foundation

| Package        | Responsibility                                                                                     | Provider support |                                            Latest on npm                                            |
| -------------- | -------------------------------------------------------------------------------------------------- | :--------------: | :-------------------------------------------------------------------------------------------------: |
| `@h-ai/core`   | Foundation: `HaiResult`, contextual child loggers, configuration, IDs, i18n, errors, and utilities |        —         |   [![npm](https://img.shields.io/npm/v/%40h-ai%2Fcore)](https://www.npmjs.com/package/@h-ai/core)   |
| `@h-ai/crypto` | SM2 asymmetric encryption/signatures, SM3 hashes, SM4 encryption, and password hashing             |        —         | [![npm](https://img.shields.io/npm/v/%40h-ai%2Fcrypto)](https://www.npmjs.com/package/@h-ai/crypto) |

### Data

| Package          | Responsibility                                                                     |            Provider support             |                                              Latest on npm                                              |
| ---------------- | ---------------------------------------------------------------------------------- | :-------------------------------------: | :-----------------------------------------------------------------------------------------------------: |
| `@h-ai/reldb`    | Relational databases: DDL, raw SQL, transactions, pagination, CRUD repositories    |         ✅ SQLite / PG / MySQL          |    [![npm](https://img.shields.io/npm/v/%40h-ai%2Freldb)](https://www.npmjs.com/package/@h-ai/reldb)    |
| `@h-ai/vecdb`    | Vector databases: collections, vector insertion, similarity search                 | ✅ LanceDB / pgvector / Qdrant / Chroma |    [![npm](https://img.shields.io/npm/v/%40h-ai%2Fvecdb)](https://www.npmjs.com/package/@h-ai/vecdb)    |
| `@h-ai/cache`    | Cache and distributed locks: KV, Hash, List, Set, SortedSet, Lock; Redis-style API |            ✅ Memory / Redis            |    [![npm](https://img.shields.io/npm/v/%40h-ai%2Fcache)](https://www.npmjs.com/package/@h-ai/cache)    |
| `@h-ai/storage`  | File storage: upload/download/delete/copy/presigned URLs                           |              ✅ Local / S3              |  [![npm](https://img.shields.io/npm/v/%40h-ai%2Fstorage)](https://www.npmjs.com/package/@h-ai/storage)  |
| `@h-ai/datapipe` | Data pipelines: cleaning, 7 chunking modes, composition (pure functions, no init)  |                    —                    | [![npm](https://img.shields.io/npm/v/%40h-ai%2Fdatapipe)](https://www.npmjs.com/package/@h-ai/datapipe) |

### Business capabilities

| Package           | Responsibility                                                                                                   |         Provider support          |                                               Latest on npm                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | :-------------------------------: | :-------------------------------------------------------------------------------------------------------: |
| `@h-ai/iam`       | Identity/access management: password/OTP/LDAP authentication, RBAC, sessions, users                              |                 —                 |       [![npm](https://img.shields.io/npm/v/%40h-ai%2Fiam)](https://www.npmjs.com/package/@h-ai/iam)       |
| `@h-ai/reach`     | Notifications: email, SMS, API callbacks, templates, do-not-disturb (DND)                                        | ✅ SMTP / Alibaba Cloud SMS / API |     [![npm](https://img.shields.io/npm/v/%40h-ai%2Freach)](https://www.npmjs.com/package/@h-ai/reach)     |
| `@h-ai/ai`        | AI: full/streaming chat, images, ASR/TTS, tools, MCP, embeddings, RAG/knowledge, memory, context, reranking, A2A | ✅ OpenAI-compatible / extensible |        [![npm](https://img.shields.io/npm/v/%40h-ai%2Fai)](https://www.npmjs.com/package/@h-ai/ai)        |
| `@h-ai/payment`   | Payments: order creation, cross-platform initiation, callbacks                                                   |  ✅ WeChat Pay / Alipay / Stripe  |   [![npm](https://img.shields.io/npm/v/%40h-ai%2Fpayment)](https://www.npmjs.com/package/@h-ai/payment)   |
| `@h-ai/audit`     | Audit logs: recording, paginated queries, statistics, scheduled cleanup                                          |                 —                 |     [![npm](https://img.shields.io/npm/v/%40h-ai%2Faudit)](https://www.npmjs.com/package/@h-ai/audit)     |
| `@h-ai/scheduler` | Scheduling: cron, JS/HTTP execution, DB persistence, distributed locks, logs                                     |                 —                 | [![npm](https://img.shields.io/npm/v/%40h-ai%2Fscheduler)](https://www.npmjs.com/package/@h-ai/scheduler) |

### Integration

| Package              | Responsibility                                                                                     | Provider support |                                                  Latest on npm                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------- | :--------------: | :-------------------------------------------------------------------------------------------------------------: |
| `@h-ai/api-contract` | Public HTTP contracts: oRPC + Zod, application domain composition, unified `HaiResult<T>`          |        —         | [![npm](https://img.shields.io/npm/v/%40h-ai%2Fapi-contract)](https://www.npmjs.com/package/@h-ai/api-contract) |
| `@h-ai/serv`         | API runtime: Hono + oRPC, contracts/procedures, OpenAPI 3.1 and Scalar docs                        |        —         |         [![npm](https://img.shields.io/npm/v/%40h-ai%2Fserv)](https://www.npmjs.com/package/@h-ai/serv)         |
| `@h-ai/kit`          | SvelteKit: hooks, middleware, guards, validation, same-origin endpoints (no public HTTP contracts) |        —         |          [![npm](https://img.shields.io/npm/v/%40h-ai%2Fkit)](https://www.npmjs.com/package/@h-ai/kit)          |
| `@h-ai/api-client`   | Cross-platform typed clients: nested contract calls, Bearer/httpOnly tokens, 401 refresh           |        —         |   [![npm](https://img.shields.io/npm/v/%40h-ai%2Fapi-client)](https://www.npmjs.com/package/@h-ai/api-client)   |
| `@h-ai/capacitor`    | Mobile bridge: secure token storage, device info, push, camera, status bar                         |        —         |    [![npm](https://img.shields.io/npm/v/%40h-ai%2Fcapacitor)](https://www.npmjs.com/package/@h-ai/capacitor)    |

### UI and tooling

| Package        | Responsibility                                                                     |                             Provider support                              |                                            Latest on npm                                            |
| -------------- | ---------------------------------------------------------------------------------- | :-----------------------------------------------------------------------: | :-------------------------------------------------------------------------------------------------: |
| `@h-ai/ui`     | Svelte 5 Runes components (20 primitives + 36 compounds + 36 scenes), 15 themes    |                                     —                                     |     [![npm](https://img.shields.io/npm/v/%40h-ai%2Fui)](https://www.npmjs.com/package/@h-ai/ui)     |
| `@h-ai/cli`    | CLI: project creation, module addition, code generation, deployment                |                                     —                                     |    [![npm](https://img.shields.io/npm/v/%40h-ai%2Fcli)](https://www.npmjs.com/package/@h-ai/cli)    |
| `@h-ai/deploy` | Deployment: Vercel with cloud provisioning; docker-ssh with feature-based sidecars | ✅ Vercel / docker-ssh · Neon / Upstash / R2 / Resend / Alibaba Cloud SMS | [![npm](https://img.shields.io/npm/v/%40h-ai%2Fdeploy)](https://www.npmjs.com/package/@h-ai/deploy) |

### Module documentation index

| Category       | Module               | README                                                                       |
| -------------- | -------------------- | ---------------------------------------------------------------------------- |
| Foundation     | `@h-ai/core`         | [`packages/core/README.en.md`](./packages/core/README.en.md)                 |
| Foundation     | `@h-ai/crypto`       | [`packages/crypto/README.en.md`](./packages/crypto/README.en.md)             |
| Data           | `@h-ai/reldb`        | [`packages/reldb/README.en.md`](./packages/reldb/README.en.md)               |
| Data           | `@h-ai/vecdb`        | [`packages/vecdb/README.en.md`](./packages/vecdb/README.en.md)               |
| Data           | `@h-ai/cache`        | [`packages/cache/README.en.md`](./packages/cache/README.en.md)               |
| Data           | `@h-ai/storage`      | [`packages/storage/README.en.md`](./packages/storage/README.en.md)           |
| Data           | `@h-ai/datapipe`     | [`packages/datapipe/README.en.md`](./packages/datapipe/README.en.md)         |
| Business       | `@h-ai/iam`          | [`packages/iam/README.en.md`](./packages/iam/README.en.md)                   |
| Business       | `@h-ai/reach`        | [`packages/reach/README.en.md`](./packages/reach/README.en.md)               |
| Business       | `@h-ai/ai`           | [`packages/ai/README.en.md`](./packages/ai/README.en.md)                     |
| Business       | `@h-ai/payment`      | [`packages/payment/README.en.md`](./packages/payment/README.en.md)           |
| Business       | `@h-ai/audit`        | [`packages/audit/README.en.md`](./packages/audit/README.en.md)               |
| Business       | `@h-ai/scheduler`    | [`packages/scheduler/README.en.md`](./packages/scheduler/README.en.md)       |
| Integration    | `@h-ai/api-contract` | [`packages/api-contract/README.en.md`](./packages/api-contract/README.en.md) |
| Integration    | `@h-ai/serv`         | [`packages/serv/README.en.md`](./packages/serv/README.en.md)                 |
| Integration    | `@h-ai/kit`          | [`packages/kit/README.en.md`](./packages/kit/README.en.md)                   |
| Integration    | `@h-ai/api-client`   | [`packages/api-client/README.en.md`](./packages/api-client/README.en.md)     |
| Integration    | `@h-ai/capacitor`    | [`packages/capacitor/README.en.md`](./packages/capacitor/README.en.md)       |
| UI and tooling | `@h-ai/ui`           | [`packages/ui/README.en.md`](./packages/ui/README.en.md)                     |
| UI and tooling | `@h-ai/cli`          | [`packages/cli/README.en.md`](./packages/cli/README.en.md)                   |
| UI and tooling | `@h-ai/deploy`       | [`packages/deploy/README.en.md`](./packages/deploy/README.en.md)             |

### Typical initialization order

Most projects can initialize in this dependency order, which also helps AI assistants reason about usage:

`core → reldb / cache / storage / vecdb → iam / audit / scheduler / reach → ai / payment → api-contract → serv → kit / api-client / ui / capacitor`

- `iam` requires initialized `reldb` and `cache`.
- `audit` requires initialized `reldb`.
- For persisted `scheduler` tasks, initialize `reldb` first. Initialized `cache` enables distributed locking automatically.
- `reach`, `payment`, and `ai` reuse other module capabilities as needed; see their READMEs for configuration.
- `api-contract` needs no initialization; it defines public HTTP schemas and oRPC contracts only.
- `serv` creates the Hono app after business modules initialize; `contract` and `procedures` must have matching shapes.
- `kit` provides SvelteKit hooks/guards/same-origin endpoints; cross-platform contracts are defined elsewhere.
- `api-client` consumes one application contract on Web / App / SSR and returns `HaiResult<T>` by default.

## Architecture

```mermaid
graph TD
    APP["Applications · apps/<br/>admin-console · api-service · corporate-website · h5-app<br/>desktop-app · mobile-app · ai-playground"]

    subgraph INTEG["Integration"]
        KIT["kit (SvelteKit pipelines / guards)"]
        SERV["serv (Hono + oRPC · OpenAPI)"]
        CLIENT["api-client (typed client · Token)"]
    end

    CONTRACT["api-contract (Schema + oRPC Contract source)"]

    subgraph BIZ["Business capabilities"]
        B["iam · ai · payment · reach · audit · scheduler"]
    end

    subgraph DATA["Data"]
        D["reldb · vecdb · cache · storage · datapipe"]
    end

    CORE["core (HaiResult · Logger · Config · i18n · Utils)"]
    TOOL["Tooling: cli · deploy · capacitor · ui · crypto"]

    APP --> INTEG
    SERV --> CONTRACT
    CLIENT --> CONTRACT
    INTEG --> BIZ
    BIZ --> DATA
    BIZ --> CORE
    DATA --> CORE
    TOOL -.-> APP
```

**Dependency direction**: higher layers depend on lower ones. `@h-ai/core` is the foundation and never depends on other modules. Public HTTP APIs follow **`api-contract` (definition) → `serv` (implementation/mounting) → `api-client` (calls)**. `kit` handles SvelteKit pipelines and same-origin endpoints, not shared cross-platform contracts.

## Examples

These are representative snippets. Supply application-specific variables and schemas. For full APIs, codes, and examples, see module READMEs and [LLMS.txt (Chinese)](./LLMS.txt).

### HaiResult error handling

Domain failures use `HaiResult`. Stream iteration, network clients, framework control flow, and third-party callbacks may throw; catch at the documented API boundary:

```typescript
import type { HaiResult } from '@h-ai/core'
import { core, err, HaiCommonError, ok } from '@h-ai/core'

function divide(a: number, b: number): HaiResult<number> {
  if (b === 0)
    return err(HaiCommonError.VALIDATION_ERROR, 'Division by zero')
  return ok(a / b)
}

const result = divide(10, 2)
if (result.success) {
  const quotient = result.data // 5
}
else {
  core.logger.warn('Division failed', { code: result.error.code, message: result.error.message })
}
```

### Relational databases

```typescript
import { reldb } from '@h-ai/reldb'

const initResult = await reldb.init({ type: 'sqlite', database: './data/app.db' })
if (!initResult.success)
  throw new Error(initResult.error.message)

// DDL — 建表
await reldb.ddl.createTable('users', {
  id: { type: 'TEXT', primaryKey: true },
  email: { type: 'TEXT', notNull: true, unique: true },
  name: { type: 'TEXT' },
}, true)

// 参数化查询与分页
const users = await reldb.sql.query<User>('SELECT * FROM users WHERE name = ?', ['Alice'])
const page = await reldb.sql.queryPage<User>({
  sql: 'SELECT * FROM users',
  pagination: { page: 1, pageSize: 20 },
})

// 事务
await reldb.tx.wrap(async (tx) => {
  await tx.execute('INSERT INTO users (id, email) VALUES (?, ?)', ['1', 'a@b.com'])
  await tx.execute('INSERT INTO logs (action) VALUES (?)', ['user_created'])
})

// CRUD 仓库（自动生成 SQL）
const userRepo = reldb.crud.table<User>({
  table: 'users',
  idColumn: 'id',
  select: ['id', 'email', 'name'],
  createColumns: ['id', 'email', 'name'],
  updateColumns: ['email', 'name'],
  dbType: 'sqlite',
})
await userRepo.create({ id: '1', email: 'a@b.com', name: 'Alice' })
```

### Vector databases

```typescript
import { vecdb } from '@h-ai/vecdb'

const initResult = await vecdb.init({ type: 'lancedb', path: './data/vecdb' })
if (!initResult.success)
  throw new Error(initResult.error.message)

await vecdb.collection.create('docs', { dimension: 1536 })
await vecdb.vector.insert('docs', [
  { id: 'doc-1', vector: embeddings, content: '文档内容', metadata: { source: 'wiki' } },
])
const results = await vecdb.vector.search('docs', queryVector, { topK: 5, minScore: 0.7 })
```

### Cache

```typescript
import { cache } from '@h-ai/cache'

const initResult = await cache.init({ type: 'memory' })
if (!initResult.success)
  throw new Error(initResult.error.message)
// await cache.init({ type: 'redis', url: 'redis://localhost:6379' })

await cache.kv.set('key', { name: 'Alice' }, { ex: 3600 })
const val = await cache.kv.get<{ name: string }>('key')
await cache.zset.zadd('leaderboard', { score: 100, member: 'Alice' })
```

### AI / LLM / images / audio

```typescript
import { ai } from '@h-ai/ai'

// 初始化（OpenAI 兼容 API）；未初始化 reldb/vecdb 时使用进程内临时 Store
const initResult = await ai.init({
  llm: { apiKey: process.env.HAI_AI_LLM_APIKEY, model: 'gpt-4o-mini' },
})
if (!initResult.success)
  throw new Error(initResult.error.message)

// 同步调用
const chat = await ai.llm.chat({
  messages: [{ role: 'user', content: '用一句话解释量子计算' }],
})
if (chat.success)
  void chat.data.choices[0].message.content

// 流式调用
const stream = ai.llm.chatStream({ messages: [{ role: 'user', content: '讲一个故事' }] })
for await (const chunk of stream)
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '')

// 文生图
const image = await ai.image.generate({ prompt: '一只在星空下的猫', size: '1024x1024' })

// 语音合成（TTS）
const speech = await ai.audio.synthesize({ text: '你好，世界', voice: 'default' })
```

### Authentication and authorization

```typescript
import { cache } from '@h-ai/cache'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'

// 先初始化 reldb 与 cache，IAM 会复用已初始化单例
const dbInit = await reldb.init({ type: 'sqlite', database: './data/app.db' })
if (!dbInit.success)
  throw new Error(dbInit.error.message)
const cacheInit = await cache.init({ type: 'memory' })
if (!cacheInit.success)
  throw new Error(cacheInit.error.message)
const iamInit = await iam.init({ session: { maxAge: 86400, sliding: true } })
if (!iamInit.success)
  throw new Error(iamInit.error.message)

await iam.user.register({ username: 'alice', password: 'StrongPass123!' })
const loginResult = await iam.auth.login({ identifier: 'alice', password: 'StrongPass123!' })

// RBAC 权限控制
await iam.authz.assignRole(userId, 'admin')
const allowed = await iam.authz.checkPermission(userId, 'users:read')
```

### Public APIs: contract → service → client

```typescript
// 1) 契约（api-contract）：只描述“有哪些 API”，纯定义、无业务实现
import { apiContract } from '@h-ai/api-contract'

export const contract = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  ai: apiContract.ai,
})
```

```typescript
// 2) 服务（serv）：挂载 contract + procedures，生成 OpenAPI 与文档页
import { serv } from '@h-ai/serv'
import { createAiProcedures } from '@h-ai/serv/features/ai'
import { createIamProcedures } from '@h-ai/serv/features/iam'
import { createStorageProcedures } from '@h-ai/serv/features/storage'

const app = serv.createApp({
  contract,
  procedures: {
    iam: createIamProcedures({ iam }),
    storage: createStorageProcedures({ storage }),
    ai: createAiProcedures({ ai }),
  },
  http: {
    apiPrefix: '/api/v1',
    openapi: { path: '/openapi.json' },
    docs: { path: '/docs' },
  },
  iam, // 顶层传入后自动派生 access token 校验
})
serv.listen(app, { host: '0.0.0.0', onClose: closeApp })
```

```typescript
// 3) 客户端（api-client）：Web / App / SSR 消费同一份契约，默认返回 HaiResult<T>
import { apiClient } from '@h-ai/api-client'

const initResult = await apiClient.init({ baseUrl: '/api/v1', auth: {} })
if (!initResult.success)
  throw new Error(initResult.error.message)

const login = await apiClient.iam.auth.login({ identifier: 'alice', password: 'xxx' })
if (login.success)
  await apiClient.auth.setTokens(login.data.tokens)
```

### Svelte 5 UI components

```text
<script lang="ts">
  import { Button, Card, DataTable, Input, Modal } from '@h-ai/ui'

  let showModal = $state(false)
  let users = $state([])
</script>

<Card>
  <DataTable
    data={users}
    columns={[
      { key: 'name', label: '姓名' },
      { key: 'email', label: '邮箱' },
    ]}
    keyField="id"
  >
    {#snippet actions(user)}
      <Button size="xs" onclick={() => edit(user)}>编辑</Button>
    {/snippet}
  </DataTable>
</Card>

<Button onclick={() => (showModal = true)}>新建用户</Button>

<Modal bind:open={showModal} title="新建用户">
  <Input label="姓名" bind:value={name} />
  <Input label="邮箱" bind:value={email} type="email" />
</Modal>
```

> See individual READMEs and `LLMS.txt` for `storage` / `datapipe` / `payment` / `audit` / `scheduler` / `reach` / `crypto` / `kit` / `capacitor` / `deploy`.

## Onboarding and help center

`@h-ai/ui/guide` provides `createGuide`, `GuideHost` and `HelpCenter` for first-use cookie invitations, manual replay, navigation to guided pages and searchable Markdown help. Tours follow existing themes; built-in controls support Chinese and English, while business content uses application i18n.

The admin-console example and CLI fullstack Web/App/Desktop enable this by default. Preferences are isolated by user and tour version, with later and dismiss options. See [UI onboarding](packages/ui/README.en.md#onboarding-and-help-center).

## Example applications

`apps/` contains seven runnable examples that serve as scaffolding references and integration samples. `api-service-contract` is their shared API contract package.

| Application         | Description                                         | Modules used                                             |
| ------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| `admin-console`     | Admin console (all-module integration reference)    | core, reldb, iam, cache, storage, crypto, ai, kit, ui    |
| `ai-playground`     | AI playground (LLM / images / memory / audio)       | core, ai, kit, ui                                        |
| `api-service`       | Hono + oRPC API service (contract composition root) | core, reldb, cache, iam, storage, ai, api-contract, serv |
| `corporate-website` | Corporate website + registration + AI support       | core, reldb, cache, storage, ai, reach, kit, ui          |
| `h5-app`            | Mobile H5 (photo recognition / cart / login)        | core, reldb, iam, cache, storage, ai, kit, ui            |
| `desktop-app`       | Tauri desktop application                           | api-client, api-service-contract, crypto, ui             |
| `mobile-app`        | Capacitor Android / iOS application                 | api-client, api-service-contract, crypto, ui, capacitor  |

### Start individual applications

| Application         | Start command                           |
| ------------------- | --------------------------------------- |
| `admin-console`     | `pnpm --filter admin-console dev`       |
| `ai-playground`     | `pnpm --filter ai-playground dev`       |
| `api-service`       | `pnpm --filter api-service dev`         |
| `corporate-website` | `pnpm --filter corporate-website dev`   |
| `h5-app`            | `pnpm --filter h5-app dev`              |
| `desktop-app`       | `cd apps/desktop-app && pnpm tauri:dev` |
| `mobile-app`        | `pnpm --filter mobile-app dev`          |

## Development

### Local development

```bash
pnpm install                    # 安装依赖
pnpm dev                        # 全量开发模式
pnpm typecheck                  # 类型检查
pnpm lint                       # ESLint（含 check:skills）
pnpm test                       # 单元测试
pnpm --filter @h-ai/reldb test  # 只运行某个模块
```

### Project structure

```
hai-framework/
├── packages/            # 21 framework packages (@h-ai/*)
│   └── cli/templates/   # CLI scaffolding and skills distributed to generated apps
├── apps/                # Example applications
├── scripts/             # Validation and release scripts
├── AGENTS.md            # AI assistant workflow entry
├── LLMS.txt             # AI usage index
├── .agents/             # Shared development instructions/ and repository skills/
├── AGENTS.md            # Shared AI entry point and task navigation
└── .github/             # GitHub Actions and lightweight Copilot entry points
```

### AI-first infrastructure

This repository uses [AGENTS.md](AGENTS.md) as its shared entry point, `.agents/instructions/` for detailed conventions, and `.agents/skills/` for repository development skills. Copilot path instructions contain matching metadata and links; Claude and OpenCode entry points reuse the shared rules. Codex reads `AGENTS.md` and discovers `.agents/skills/` natively. Invoke skills such as `$hai-create-module` or `$hai-review-module` in the project and load references as needed. Sources: [Codex skills](https://learn.chatgpt.com/docs/build-skills), [project instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

`hai create` generates the same shared entry points and skills, with application-specific `AGENTS.md` rules:

```
my-app/
├── .agents/
│   └── skills/                       # Shared skill bodies and references; native Codex discovery
├── .github/
│   └── copilot-instructions.md       # References the shared AGENTS.md
├── AGENTS.md                         # Codex / OpenCode / shared AI guidance
├── CLAUDE.md                         # Claude Code guidance reusing @AGENTS.md
└── opencode.json                     # instructions references AGENTS.md directly
```

| AI assistant   | Generated files                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------ |
| GitHub Copilot | `.github/copilot-instructions.md` → `AGENTS.md` + `.agents/skills/`                              |
| Cursor         | `AGENTS.md` + `.agents/skills/`                                                                  |
| Claude Code    | `CLAUDE.md` + `AGENTS.md` (reuse through `@AGENTS.md`; no native discovery of `.agents/skills/`) |
| Codex          | `AGENTS.md` + `.agents/skills/`                                                                  |
| OpenCode       | `AGENTS.md` + `.agents/skills/` + `opencode.json`                                                |

Skills are managed in `packages/cli/templates/skills/` and distributed by `@h-ai/cli` into user projects' `.agents/skills/`. Alongside module guides, workflows cover document review and implementation (`hai-spec-review`, `hai-spec-implement`), feature development and validation (`hai-app-create`, `hai-app-review`, `hai-app-tests`), and delivery and maintenance (`hai-build`, `hai-deploy`, `hai-ci`, `hai-pr-review`, `hai-framework-sync`). The [complete usage guide](docs/usage/README.en.md) connects these steps. Repository development skills and application templates retain their own task boundaries while sharing public contracts. Run scoped `typecheck → lint → build → test` checks, followed by the relevant E2E gates for UI, routes, or CLI templates.

### Configuration and environment variables

Applications and templates share `HAI_<CONFIG>_<PATH>`. The root [`.env.example`](.env.example) lists available variables, descriptions, enums and bounds. Each example application lists its complete variables in its own `.env.example`.

Track `.env.example` (complete descriptions and constraints), `.env` (shared public values), and `.env.dev` / `.env.test` / `.env.prod` (public environment overrides). Ignore `.env.local` for machine secrets. Priority: process environment > `.env.local` > environment file > `.env`. Each application example lists its complete available settings.

After changing a public Schema, YAML configuration or an environment-variable reader, build the affected modules and run `pnpm generate:env` to update the root catalog, CLI metadata and example applications. Run `pnpm check:env` to detect stale output. The generator reads public source and examples, never `.env.local`, and preserves project values in base and mode files. Document each field’s purpose, type, enums, units, bounds and activation conditions; validate indexed/dynamic keys and parent-object overrides through the module Schema and runtime tests.

Entry scanning excludes genuine JSDoc in JS/TS, including Svelte scripts; Schema field comments still supply documentation. Optional template/YAML comments and generated-code references inside strings remain included. Documentation examples do not create runtime settings.

Use `pnpm dev` / `dev:test` / `dev:prod` for the selected mode and `start:test` / `start:prod` for built Node services. Vite checks `core.config.loadEnvFiles({ mode, envDir })` before injecting values; Node loads base, mode and local files in that order with `--env-file`. `core.init` does not read dotenv. File modes map `development` / `production` to `dev` / `prod`. Provider switching and migration steps are included in the application skill’s [environment configuration](packages/cli/templates/skills/hai-app-create/development.md#环境配置).

- **Naming**: `HAI_<CONFIG_NAME>_<YAML_PATH>`, levels separated by `_`, camelCase kept intact (such as `llm.apiKey` → `HAI_AI_LLM_APIKEY`).
- **Precedence**: convention-based variables > explicit YAML `${VAR}` > YAML defaults.
- **AI compatibility**: `OPENAI_*` is only a fallback for `@h-ai/ai`.
- **Secrets**: never hardcode, log, or expose secrets through client `PUBLIC_*` / `VITE_*` variables.

| Group          | Example variables                        | Description                                                            |
| -------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| Runtime        | `HAI_CORE_ENV`、`HAI_CORE_LOGGING_LEVEL` | Runtime environment and logging level                                  |
| Database       | `HAI_DB_*`                               | SQLite / PostgreSQL / MySQL in `_db.yml`                               |
| Cache          | `HAI_CACHE_*`                            | Memory / Redis / Upstash for `@h-ai/cache`                             |
| Session / Auth | `HAI_IAM_*`、`HAI_KIT_COOKIE_KEY`        | Authentication/security for `@h-ai/iam` and `@h-ai/kit`                |
| API Service    | `PORT`、`HOST`、`PUBLIC_API_BASE`        | Listen/frontend addresses for `apps/api-service` / `@h-ai/serv`        |
| Storage        | `HAI_STORAGE_*`                          | Local / S3 for `@h-ai/storage`                                         |
| AI             | `HAI_AI_LLM_*`                           | LLM API keys, base URLs, and models for `@h-ai/ai`                     |
| VecDB          | `HAI_VECDB_*`                            | LanceDB / pgvector / Qdrant / Chroma for `@h-ai/vecdb`                 |
| Reach          | `HAI_REACH_*`                            | SMTP, SMS, webhooks for `@h-ai/reach`                                  |
| Payment        | `HAI_PAYMENT_*`                          | WeChat Pay / Alipay / Stripe merchant settings for `@h-ai/payment`     |
| Deploy         | `HAI_DEPLOY_*`                           | Deployment/infrastructure credentials for `@h-ai/deploy` / `@h-ai/cli` |

The root `.env.example` defines complete fields and defaults. When working on an example app, consult its `README.md` and `.env.example` for additional settings.

### Quality gates

Choose commands by impact scope; use root commands for cross-package contracts or root configuration changes:

| Gate               | Command                   | Scope                                                    |
| ------------------ | ------------------------- | -------------------------------------------------------- |
| Type checking      | `pnpm typecheck`          | All changes                                              |
| Lint               | `pnpm lint`               | All changes, including `check:skills`                    |
| Build              | `pnpm build`              | Build / templates / publishing / cross-package contracts |
| Unit tests         | `pnpm test`               | All changes                                              |
| End-to-end         | `pnpm e2e`                | UI / routes / end-to-end flows                           |
| Release acceptance | `pnpm test:release-local` | Full pre-release validation (installation → E2E)         |

> Use `pnpm.cmd` in Windows PowerShell. Root `pnpm e2e` covers CLI scaffolding and Playwright suites for Admin Console, AI Playground, Corporate Website, H5, and Mobile Web. Container unit tests require working Docker / Podman.

### Commit checks (Leak Hooks)

Git hooks check leakage keywords before `git commit` / `git push`. Create local `.leak-words.json` (ignored by Git and local-only):

```json
["your-leak-word"]
```

The entry points are `.husky/pre-commit`, `.husky/commit-msg`, `.husky/pre-push`, and `scripts/check-leak-words.mjs`.

## License

[Apache-2.0](./LICENSE)

See the [21-package configuration and consumer map (Chinese)](docs/configuration-map.md) for schema defaults, runtime consumers, environment names and generated apps.
