# hai Framework

> 研发中，敬请期待！🚀

<p align="center">
  <strong>AI-First · 模块化 · 类型安全 · 全栈</strong>
</p>

<p align="center">
  给 AI 用的全栈 TypeScript 框架 —— 让 AI 写出可维护的生产级代码
</p>

<p align="center">
  <b>19 个功能模块</b> · <b>6 个示例应用</b> · <b>69+ UI 组件</b> · <b>CLI 创建 / 一键部署</b>
</p>

---

## 为什么选 hai？

| 痛点                         | hai 的解法                                                                  |
| ---------------------------- | --------------------------------------------------------------------------- |
| AI 生成的代码风格不一致      | 统一 `init → use → close` 生命周期 + 可执行编码规范（copilot-instructions） |
| AI 不知道怎么处理错误        | 所有 API 返回 `Result<T, E>`，永远不会遗漏错误处理                          |
| 功能模块各自为政，集成成本高 | 19 个模块共享统一 API 模式、类型体系和 Provider 架构，开箱即用              |
| 从 0 搭建项目要半天          | `hai create my-app` 一行命令创建完整项目（含 AI 上下文、配置、脚手架）      |
| UI 组件不够用 / 不够现代     | 69+ Svelte 5 Runes 组件（原子 + 复合 + 业务场景），32+ 主题，内置 i18n      |
| 部署复杂，需要手动配基础设施 | `hai deploy` 一键部署到 Vercel，自动开通数据库、缓存、存储                  |
| AI 助手不了解你的框架        | 每个模块自带 Skill 文件 + LLMS.txt，AI 自动获取正确用法                     |

---

## 框架定位

hai Framework 是一个 **AI-First** 的全栈 TypeScript 开发框架。

**"AI-First"不是"只给 AI 用"，而是：框架的每一个设计决策，都优先考虑 AI 编程助手能否正确使用。** 当 AI 能正确使用时，人类开发者的体验同样更好。

大多数框架为人类开发者设计——灵活、自由、约定不强制。但当 AI 来写代码时，这些"自由"反而是问题：AI 不知道选哪种模式、不知道错误怎么处理、不知道该不该加日志……

hai Framework 的目标是：**让 AI 理解规范，自动完成应用开发，生成人类可理解可审查的代码。**

具体而言：

- **可预测的 API**：每个模块都是 `init() → use → close()`，AI 只需学一种模式就能操作所有模块
- **不抛异常**：所有操作返回 `Result<T, E>` —— 成功是 `{ success: true, data }` ，失败是 `{ success: false, error }`。AI 不会遗漏错误处理，链路完全可控
- **配置即校验**：Zod Schema 在 `init()` 时完成验证，配置错了立刻报错，不会在运行时炸
- **Skill 文件教 AI 用法**：每个模块都有标准化的 Skill 文件（`.github/skills/`），AI 助手读取后就能正确使用所有 API
- **编码规范可执行**：`.github/copilot-instructions.md` 定义了命名、分层、测试、文档的完整规范，AI 助手每次改动自动遵守
- **LLMS.txt 作为 AI 参考手册**：根目录 `LLMS.txt` 提供完整的 API 签名与示例，AI 可直接检索

**结果是**：AI 在这个框架中写的代码，风格一致、类型安全、错误处理完整、测试可验证——不再需要人类逐行审查"AI 写得对不对"。

同时，框架将 AI 能力（LLM 调用、MCP 协议、向量数据库）、安全能力（国密加密、身份认证、RBAC 权限、审计日志）、数据能力（多数据库、缓存、对象存储、数据管线）、运营能力（支付、触达、定时任务、部署）以统一的 API 风格整合在一起，让 AI 可以端到端地构建功能完整的智能应用。

### AI-First 设计原则

| 设计决策                          | 给 AI 带来的好处     | 给人类带来的好处               |
| --------------------------------- | -------------------- | ------------------------------ |
| 统一生命周期 `init → use → close` | 只需学一种模式       | 模块行为可预期                 |
| `Result<T, E>` 返回值             | 永远不会遗漏错误处理 | 不用 try-catch，链路清晰       |
| Zod 配置校验                      | 配置写错立刻知道     | 启动即验证，运行时不炸         |
| Provider 模式                     | 切换后端只需改配置   | 不同环境无缝切换               |
| 严格 TypeScript                   | 类型推断引导正确使用 | 重构有保障                     |
| Skill / LLMS.txt                  | 自动获取正确用法     | AI 生成的代码质量更高          |
| copilot-instructions              | 每次改动自动遵守规范 | 代码风格一致，减少 Review 成本 |

## 技术栈

| 层面       | 选型                                                      |
| ---------- | --------------------------------------------------------- |
| 前端框架   | Svelte 5 (Runes) + SvelteKit 2                            |
| UI         | TailwindCSS 4 + DaisyUI 5 + Bits UI v2                    |
| 语言       | TypeScript 5.7+（严格模式）                               |
| 关系数据库 | SQLite / PostgreSQL / MySQL（原生 SQL，非 ORM）           |
| 向量数据库 | LanceDB / pgvector / Qdrant                               |
| 缓存       | 内存 / Redis（单机 / Cluster / Sentinel）                 |
| 存储       | 本地文件系统 / S3 兼容云存储（AWS / MinIO / OSS）         |
| AI         | OpenAI 兼容 API + MCP 协议                                |
| 加密       | 国密 SM2/SM3/SM4                                          |
| 支付       | 微信支付 / 支付宝 / Stripe                                |
| 验证       | Zod                                                       |
| 构建       | pnpm + Turborepo + Vite + tsup                            |
| 部署       | Vercel + Neon (PG) + Upstash (Redis) + Cloudflare R2 (S3) |
| 移动端     | Capacitor（Android / iOS）                                |

## AI-First 基础设施

使用 `hai create` 创建项目时，CLI 会自动生成一套完整的 AI 上下文体系，覆盖 GitHub Copilot、Claude Code、Cursor 等主流 AI 助手：

```
my-app/
├── .github/
│   ├── copilot-instructions.md       # GitHub Copilot 项目指令
│   └── skills/                       # AI Skill 文件（教 AI 用框架）
│       ├── hai-build/SKILL.md        # 项目架构总览与 Skill 导航（入口）
│       ├── hai-core/SKILL.md         # @h-ai/core 用法
│       ├── hai-reldb/SKILL.md        # @h-ai/reldb 用法
│       ├── hai-vecdb/SKILL.md        # @h-ai/vecdb 用法
│       ├── hai-datapipe/SKILL.md     # @h-ai/datapipe 用法
│       ├── hai-iam/SKILL.md          # @h-ai/iam 用法
│       ├── hai-reach/SKILL.md        # @h-ai/reach 用法
│       ├── hai-cache/SKILL.md        # @h-ai/cache 用法
│       ├── hai-storage/SKILL.md      # @h-ai/storage 用法
│       ├── hai-ai/SKILL.md           # @h-ai/ai 用法
│       ├── hai-crypto/SKILL.md       # @h-ai/crypto 用法
│       ├── hai-payment/SKILL.md       # @h-ai/payment 用法
│       ├── hai-audit/SKILL.md         # @h-ai/audit 用法
│       ├── hai-scheduler/SKILL.md     # @h-ai/scheduler 用法
│       ├── hai-capacitor/SKILL.md        # @h-ai/capacitor 用法
│       ├── hai-deploy/SKILL.md        # @h-ai/deploy 用法
│       ├── hai-kit/SKILL.md          # @h-ai/kit 用法
│       ├── hai-ui/SKILL.md           # @h-ai/ui 组件用法
│       ├── hai-api-client/SKILL.md           # @h-ai/api-client 用法
│       ├── hai-app-create/SKILL.md   # 教 AI 创建新功能
│       ├── hai-app-review/SKILL.md   # 教 AI 做代码审查
│       └── hai-app-tests/SKILL.md    # 教 AI 编写测试
├── AGENTS.md                         # Claude Code / 通用 AI 指引
└── CLAUDE.md                         # Claude Code 专用指引
```

**工作方式**：AI 助手进入项目后，自动读取指令文件获得编码规范和框架用法，按需读取 Skill 文件获取各模块 API 细节，改动后自动执行 `typecheck → lint → test` 质量门禁 —— 整个过程无需人类干预。

Skill 模板统一管理在 `packages/cli/templates/skills/` 中，通过 `@h-ai/cli` 分发到用户项目。

当前 CLI 模板内置 **22 个 Skill 模板**：18 个模块 Skill、`hai-build` 总览 Skill，以及 `hai-app-create`、`hai-app-review`、`hai-app-tests` 3 个工作流 Skill，便于 AI 助手在“搭应用、补测试、做 Review、查模块用法”之间自动切换上下文。

## 模块总览（19 个模块）

### 基础能力

| 包名           | 职责                                                                                           | Provider 支持 |
| -------------- | ---------------------------------------------------------------------------------------------- | :-----------: |
| `@h-ai/core`   | 框架基石：`Result` 类型、日志（child 上下文）、配置加载、ID 生成、i18n、错误定义体系、工具函数 |       —       |
| `@h-ai/crypto` | 国密算法：SM2 非对称加密/签名、SM3 哈希、SM4 对称加密、密码哈希                                |       —       |

### 数据层

| 包名             | 职责                                                                 |         Provider 支持          |
| ---------------- | -------------------------------------------------------------------- | :----------------------------: |
| `@h-ai/reldb`    | 关系数据库：DDL、原生 SQL、事务、分页、CRUD 仓库                     |     ✅ SQLite / PG / MySQL     |
| `@h-ai/vecdb`    | 向量数据库：集合管理、向量插入、相似度搜索                           | ✅ LanceDB / pgvector / Qdrant |
| `@h-ai/cache`    | 缓存与分布式锁：KV、Hash、List、Set、SortedSet、Lock，Redis 风格 API |       ✅ Memory / Redis        |
| `@h-ai/storage`  | 文件存储：上传/下载/删除/复制/预签名 URL                             |         ✅ Local / S3          |
| `@h-ai/datapipe` | 数据管线：文本清洗、7 种分块模式、可组合管线（纯函数，无需 init）    |               —                |

### 业务能力

| 包名              | 职责                                                                              |       Provider 支持        |
| ----------------- | --------------------------------------------------------------------------------- | :------------------------: |
| `@h-ai/iam`       | 身份与访问管理：认证（密码/OTP/LDAP）、RBAC 授权、会话管理、用户管理              |             —              |
| `@h-ai/reach`     | 用户触达：邮件、短信、API 回调，模板引擎、免打扰（DND）                           | ✅ SMTP / 阿里云短信 / API |
| `@h-ai/ai`        | AI 集成：LLM 调用（同步/流式）、MCP、工具调用、RAG、知识库、推理、上下文压缩、A2A |  ✅ OpenAI 兼容 / 可扩展   |
| `@h-ai/payment`   | 统一支付：订单创建、多端调起、回调通知                                            | ✅ 微信 / 支付宝 / Stripe  |
| `@h-ai/audit`     | 审计日志：操作记录、分页查询、统计聚合、定时清理                                  |             —              |
| `@h-ai/scheduler` | 定时任务：Cron 调度、JS 函数 / HTTP API 执行、DB 持久化、分布式锁、执行日志       |             —              |

### 集成层

| 包名               | 职责                                                                      | Provider 支持 |
| ------------------ | ------------------------------------------------------------------------- | :-----------: |
| `@h-ai/kit`        | SvelteKit 集成：Handle Hook、中间件（CORS/CSRF/限流）、路由守卫、表单校验 |       —       |
| `@h-ai/api-client` | HTTP 客户端：Bearer Token 自动管理、契约调用、文件上传、SSE 流式响应      |       —       |
| `@h-ai/capacitor`  | 移动端桥接：安全 Token 存储、设备信息、推送通知、相机、状态栏             |       —       |

### 界面与工具

| 包名           | 职责                                                                             |                     Provider 支持                     |
| -------------- | -------------------------------------------------------------------------------- | :---------------------------------------------------: |
| `@h-ai/ui`     | UI 组件库：69+ Svelte 5 Runes 组件（原子 + 复合 + 业务场景），32+ 主题           |                           —                           |
| `@h-ai/cli`    | CLI 脚手架：项目创建、模块添加、代码生成、一键部署                               |                           —                           |
| `@h-ai/deploy` | 自动化部署：Vercel 部署 + 基础设施自动开通（数据库 / 缓存 / 存储 / 邮件 / 短信） | ✅ Vercel / Neon / Upstash / R2 / Resend / 阿里云短信 |

### 模块文档索引

| 分类       | 模块               | README                                                             |
| ---------- | ------------------ | ------------------------------------------------------------------ |
| 基础能力   | `@h-ai/core`       | [`packages/core/README.md`](./packages/core/README.md)             |
| 基础能力   | `@h-ai/crypto`     | [`packages/crypto/README.md`](./packages/crypto/README.md)         |
| 数据层     | `@h-ai/reldb`      | [`packages/reldb/README.md`](./packages/reldb/README.md)           |
| 数据层     | `@h-ai/vecdb`      | [`packages/vecdb/README.md`](./packages/vecdb/README.md)           |
| 数据层     | `@h-ai/cache`      | [`packages/cache/README.md`](./packages/cache/README.md)           |
| 数据层     | `@h-ai/storage`    | [`packages/storage/README.md`](./packages/storage/README.md)       |
| 数据层     | `@h-ai/datapipe`   | [`packages/datapipe/README.md`](./packages/datapipe/README.md)     |
| 业务能力   | `@h-ai/iam`        | [`packages/iam/README.md`](./packages/iam/README.md)               |
| 业务能力   | `@h-ai/reach`      | [`packages/reach/README.md`](./packages/reach/README.md)           |
| 业务能力   | `@h-ai/ai`         | [`packages/ai/README.md`](./packages/ai/README.md)                 |
| 业务能力   | `@h-ai/payment`    | [`packages/payment/README.md`](./packages/payment/README.md)       |
| 业务能力   | `@h-ai/audit`      | [`packages/audit/README.md`](./packages/audit/README.md)           |
| 业务能力   | `@h-ai/scheduler`  | [`packages/scheduler/README.md`](./packages/scheduler/README.md)   |
| 集成层     | `@h-ai/kit`        | [`packages/kit/README.md`](./packages/kit/README.md)               |
| 集成层     | `@h-ai/api-client` | [`packages/api-client/README.md`](./packages/api-client/README.md) |
| 集成层     | `@h-ai/capacitor`  | [`packages/capacitor/README.md`](./packages/capacitor/README.md)   |
| 界面与工具 | `@h-ai/ui`         | [`packages/ui/README.md`](./packages/ui/README.md)                 |
| 界面与工具 | `@h-ai/cli`        | [`packages/cli/README.md`](./packages/cli/README.md)               |
| 界面与工具 | `@h-ai/deploy`     | [`packages/deploy/README.md`](./packages/deploy/README.md)         |

### 常见初始化顺序

多数项目可以按下面的顺序初始化模块，既符合依赖关系，也便于 AI 助手推断：

`core → reldb → cache → iam / audit / scheduler / reach → ai / payment → kit / api-client / ui / capacitor`

- `iam` 依赖已初始化的 `reldb` 与 `cache`
- `audit` 依赖已初始化的 `reldb`
- `scheduler` 在启用 DB 持久化时建议先初始化 `reldb`；若 `cache` 已初始化，会自动启用分布式锁能力
- `reach`、`payment`、`ai` 会按功能场景复用下游模块能力，详细配置以各模块 README 为准

## 架构

```
                              ┌──────────────────────────────┐
                              │         应用层 (apps/)        │
                              │  admin · api · website · h5  │
                              └──────────────┬───────────────┘
                                             │
                  ┌──────────────────────────▼───────────────────────────┐
                  │            @h-ai/kit   SvelteKit 集成                 │
                  │         hooks · guards · middleware · response        │
                  └──────────────────────────┬───────────────────────────┘
                                             │
    ┌──────────┬──────────┬──────────┬───────┴────┬──────────┬──────────┐
    │          │          │          │            │          │          │
┌───▼───┐ ┌───▼────┐ ┌───▼───┐ ┌───▼─────┐ ┌───▼────┐ ┌───▼───┐ ┌───▼────┐
│  iam  │ │ reach  │ │  ai   │ │ payment │ │ audit  │ │sched. │ │  ui    │
│认证授权│ │用户触达│ │LLM+MCP│ │统一支付 │ │审计日志│ │定时任务│ │组件库  │
└───┬───┘ └────────┘ └───┬───┘ └─────────┘ └───┬────┘ └───┬───┘ └────────┘
    │                    │                     │          │
┌───▼────┐ ┌────────┐ ┌─▼──────┐ ┌─────────┐  │          │
│ reldb  │ │ cache  │ │ vecdb  │ │ storage │  │          │
│关系数据库│ │  缓存  │ │向量数据库│ │文件存储  │  │          │
└───┬────┘ └───┬────┘ └────────┘ └────┬────┘  │          │
    │          │                      │       │          │
SQLite│PG│MySQL Memory│Redis  LanceDB│pgvec│Qdrant  S3│Local
    │          │                      │       │          │
┌───▼──────────▼──────────────────────▼───────▼──────────▼──┐
│                       @h-ai/core                           │
│        Result · Logger · ID · Config · i18n · Utils        │
└───────────────────────────────────────────────────────────┘
     ┌───────────┐  ┌──────────────┐  ┌──────────────┐
     │ @h-ai/cli │  │ @h-ai/deploy │  │@h-ai/capacitor│
     │ 脚手架    │  │ 一键部署     │  │ 移动端桥接    │
     └───────────┘  └──────────────┘  └──────────────┘
```

**依赖方向**：上层依赖下层，`@h-ai/core` 是最底层基础，不反向依赖任何模块。

## 快速开始

### 创建新项目

```bash
# 全局安装 CLI
pnpm add -g @h-ai/cli

# 交互式创建项目（选择应用类型、功能模块）
hai create my-app

# 指定模板类型
hai create my-app --type admin       # 管理后台
hai create my-app --type api         # API 服务
hai create my-app --type website     # 企业官网
hai create my-app --type h5          # H5 移动应用

# 进入项目并启动
cd my-app && pnpm install && pnpm dev
```

### 代码生成

```bash
hai generate page dashboard          # 生成页面
hai generate component UserCard      # 生成组件
hai generate api users               # 生成 API 路由

# 快捷别名
hai g:page dashboard
hai g:component UserCard
```

### 一键部署

```bash
hai deploy                           # 部署当前项目到 Vercel
hai deploy --skip-provision          # 跳过基础设施开通
```

### 在现有项目中使用

```bash
pnpm add @h-ai/core              # 基础能力（必装）
pnpm add @h-ai/reldb             # 关系数据库
pnpm add @h-ai/vecdb             # 向量数据库
pnpm add @h-ai/cache             # 缓存
pnpm add @h-ai/storage           # 文件存储
pnpm add @h-ai/datapipe          # 数据管线
pnpm add @h-ai/iam               # 身份认证 / 授权
pnpm add @h-ai/reach             # 用户触达（邮件 / 短信 / API）
pnpm add @h-ai/ai                # AI / LLM / MCP
pnpm add @h-ai/payment           # 支付（微信 / 支付宝 / Stripe）
pnpm add @h-ai/audit             # 审计日志
pnpm add @h-ai/scheduler         # 定时任务
pnpm add @h-ai/crypto            # 国密加密
pnpm add @h-ai/kit               # SvelteKit 集成
pnpm add @h-ai/api-client        # HTTP 客户端
pnpm add @h-ai/ui                # UI 组件库
pnpm add @h-ai/capacitor         # 移动端原生桥接
pnpm add @h-ai/deploy            # 自动化部署
```

## 使用示例

### Result 错误处理

所有模块操作都返回 `Result` 类型，不抛异常：

```typescript
import type { Result } from '@h-ai/core'
import { err, ok } from '@h-ai/core'

function divide(a: number, b: number): Result<number, string> {
  if (b === 0)
    return err('Division by zero')
  return ok(a / b)
}

const result = divide(10, 2)
if (result.success) {
  const quotient = result.data // 5
}
else {
  console.error(result.error)
}
```

### 数据库

```typescript
import { reldb } from '@h-ai/reldb'

// 初始化（SQLite）
await reldb.init({ type: 'sqlite', database: './data/app.db' })

// DDL — 建表
await reldb.ddl.createTable('users', {
  id: { type: 'TEXT', primaryKey: true },
  email: { type: 'TEXT', notNull: true, unique: true },
  name: { type: 'TEXT' },
}, true)

// 查询
const users = await reldb.sql.query<User>('SELECT * FROM users WHERE name = ?', ['Alice'])
if (users.success)
  void users.data

// 分页查询
const page = await reldb.sql.queryPage<User>({
  sql: 'SELECT * FROM users',
  page: 1,
  pageSize: 20,
})

// 事务
await reldb.tx.wrap(async (tx) => {
  await tx.execute('INSERT INTO users (id, email) VALUES (?, ?)', ['1', 'a@b.com'])
  await tx.execute('INSERT INTO logs (action) VALUES (?)', ['user_created'])
})

// CRUD 仓库（自动生成 SQL）
const userRepo = reldb.crud.table<User>({ tableName: 'users', primaryKey: 'id' })
await userRepo.create({ id: '1', email: 'a@b.com', name: 'Alice' })
const user = await userRepo.findById('1')
```

### 向量数据库

```typescript
import { vecdb } from '@h-ai/vecdb'

// 初始化（LanceDB 嵌入式，零配置）
await vecdb.init({ type: 'lancedb', path: './data/vecdb' })

// 创建集合
await vecdb.collection.create('docs', { dimension: 1536 })

// 插入向量
await vecdb.vector.insert('docs', [
  { id: 'doc-1', vector: embeddings, content: '文档内容', metadata: { source: 'wiki' } },
])

// 相似度搜索
const results = await vecdb.vector.search('docs', queryVector, { topK: 5, minScore: 0.7 })
```

### 缓存

```typescript
import { cache } from '@h-ai/cache'

// 初始化（内存 or Redis）
await cache.init({ type: 'memory' })
// await cache.init({ type: 'redis', url: 'redis://localhost:6379' })

// KV 操作
await cache.kv.set('key', { name: 'Alice' }, { ex: 3600 })
const val = await cache.kv.get<{ name: string }>('key')

// Hash
await cache.hash.hset('user:1', { name: 'Alice', age: 30 })
const name = await cache.hash.hget<string>('user:1', 'name')

// Sorted Set（排行榜等场景）
await cache.zset.zadd('leaderboard', { score: 100, member: 'Alice' })
```

### AI / LLM / MCP

```typescript
import { ai, createMcpServer } from '@h-ai/ai'
import { z } from 'zod'

// 初始化（OpenAI 兼容 API）
await ai.init({
  llm: { apiKey: process.env.HAI_AI_LLM_API_KEY, model: 'gpt-4o-mini' },
})

// 同步调用
const result = await ai.llm.chat({
  messages: [{ role: 'user', content: '用一句话解释量子计算' }],
})
if (result.success)
  void result.data.choices[0].message.content

// 流式调用
const stream = ai.llm.chatStream({
  messages: [{ role: 'user', content: '讲一个故事' }],
})
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '')
}

// 定义工具
const searchTool = ai.tools.define({
  name: 'search',
  description: '搜索知识库',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => ({ results: [`关于 ${query} 的结果`] }),
})

// MCP Server
const mcp = createMcpServer({ name: 'my-app', version: '1.0.0' })
```

### 数据管线

```typescript
import { datapipe } from '@h-ai/datapipe'

// 管线模式（清洗 → 转换 → 分块，无需 init）
const result = await datapipe.pipeline()
  .clean({ removeHtml: true, removeUrls: true })
  .transform(text => text.toLowerCase())
  .chunk({ mode: 'markdown', maxSize: 2000, overlap: 100 })
  .run(rawText)
```

### 文件存储

```typescript
import { storage } from '@h-ai/storage'

// 初始化（本地 or S3 兼容）
await storage.init({ type: 'local', root: './uploads' })

// 上传
await storage.file.put('docs/readme.txt', new TextEncoder().encode('Hello'))

// 下载
const data = await storage.file.get('docs/readme.txt')

// 预签名 URL（前端直传场景）
const url = await storage.presign.putUrl('uploads/image.png', { expiresIn: 3600 })
```

### 身份认证 & 授权

```typescript
import { cache } from '@h-ai/cache'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'

// 先初始化 reldb 与 cache，IAM 会复用已初始化单例
await reldb.init({ type: 'sqlite', database: './data/app.db' })
await cache.init({ type: 'memory' })

await iam.init({
  session: { secret: process.env.HAI_IAM_SESSION_SECRET! },
})

// 用户注册
await iam.user.register({ username: 'alice', password: 'StrongPass123!' })

// 登录（密码 / OTP / LDAP）
const loginResult = await iam.auth.login({ identifier: 'alice', password: 'StrongPass123!' })

// RBAC 权限控制
await iam.authz.assignRole(userId, 'admin')
const allowed = await iam.authz.checkPermission(userId, 'users:read')
```

### 统一支付

```typescript
import { payment } from '@h-ai/payment'
import { invokePayment } from '@h-ai/payment/client'

await payment.init({
  wechat: { mchId: '...', apiV3Key: '...', serialNo: '...', privateKey: '...', appId: '...' },
  alipay: { appId: '...', privateKey: '...', alipayPublicKey: '...' },
})

// 创建订单（微信 JSAPI / H5 / App / Native，支付宝，Stripe）
const result = await payment.createOrder('wechat', {
  orderNo: 'ORD001',
  amount: 100,
  description: '商品',
  tradeType: 'jsapi',
  userId: 'openid-xxx',
  notifyUrl: 'https://api.example.com/payment/notify/wechat',
})
if (result.success)
  await invokePayment(result.data)
```

### 审计日志

```typescript
import { audit } from '@h-ai/audit'
import { reldb } from '@h-ai/reldb'

// audit 依赖 reldb，请先初始化数据库
await reldb.init({ type: 'sqlite', database: './data/app.db' })
await audit.init()

// 记录操作
await audit.helper.login('user_1', '127.0.0.1')
await audit.helper.crud({ userId: 'user_1', action: 'create', resource: 'users', resourceId: 'user_2', details: { name: '张三' } })

// 查询与统计
const logs = await audit.list({ pageSize: 20, action: 'login' })
const stats = await audit.getStats(7) // 最近 7 天
```

### 定时任务

```typescript
import { scheduler } from '@h-ai/scheduler'

await scheduler.init({ enableDb: true })

// 注册 Cron 任务（API 任务自动持久化，重启自动恢复）
await scheduler.register({
  id: 'health-check',
  name: '健康检查',
  cron: '*/5 * * * *',
  handler: {
    kind: 'api',
    url: 'https://api.example.com/health',
    method: 'GET',
  },
})

scheduler.start()
```

### SvelteKit 集成

```typescript
// src/hooks.server.ts
import { kit } from '@h-ai/kit'

export const handle = kit.createHandle({
  logging: true,
  middleware: [
    kit.middleware.cors({ origins: ['https://example.com'] }),
    kit.middleware.rateLimit({ windowMs: 60000, maxRequests: 100 }),
  ],
  guards: [
    { guard: kit.guard.auth(), paths: ['/admin/*', '/api/v1/*'] },
  ],
})
```

### 国密加密

```typescript
import { crypto } from '@h-ai/crypto'

await crypto.init()

// 非对称加密
const keyPair = crypto.asymmetric.generateKeyPair()
const encrypted = crypto.asymmetric.encrypt('敏感数据', keyPair.data.publicKey)
const decrypted = crypto.asymmetric.decrypt(encrypted.data, keyPair.data.privateKey)

// 对称加密
const key = crypto.symmetric.generateKey()
const cipher = crypto.symmetric.encrypt('明文', key)

// 密码哈希
const hashed = crypto.password.hash('MyPassword123')
const valid = crypto.password.verify('MyPassword123', hashed.data)
```

### HTTP 客户端

```typescript
import { api } from '@h-ai/api-client'

await api.init({
  baseUrl: '/api/v1',
  auth: { refreshUrl: '/auth/refresh' },
})

// 契约调用（类型安全）
const result = await api.call(iamEndpoints.login, { identifier: 'alice', password: 'xxx' })

// SSE 流式响应
for await (const chunk of api.stream('/ai/chat', { messages: [] })) {
  void chunk
}
```

### 用户触达

```typescript
import { reach } from '@h-ai/reach'

await reach.init({
  providers: [
    { name: 'email', type: 'smtp', host: 'smtp.example.com', from: 'noreply@example.com' },
    { name: 'sms', type: 'aliyun-sms', accessKeyId: '...', accessKeySecret: '...', signName: '某某科技' },
  ],
  templates: [
    { name: 'welcome', provider: 'email', subject: '欢迎 {userName}', body: '亲爱的 {userName}，欢迎！' },
  ],
  dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' },
})

await reach.send({ provider: 'email', to: 'user@example.com', template: 'welcome', vars: { userName: '张三' } })
```

### Svelte 5 UI 组件

```text
<script lang="ts">
  import { Button, Input, Modal, DataTable, Card } from '@h-ai/ui'

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

<Button onclick={() => showModal = true}>新建用户</Button>

<Modal bind:open={showModal} title="新建用户">
  <Input label="姓名" bind:value={name} />
  <Input label="邮箱" bind:value={email} type="email" />
</Modal>
```

## 示例应用

仓库 `apps/` 目录包含 6 个可直接运行的示例应用，既能作为脚手架参考，也能作为模块联调样板：

| 应用                | 说明                                  | 使用的模块                                            |
| ------------------- | ------------------------------------- | ----------------------------------------------------- |
| `admin-console`     | 管理后台（全模块集成参考）            | core, reldb, iam, cache, storage, crypto, ai, kit, ui |
| `api-service`       | 无头 REST API 服务                    | core, reldb, cache, kit                               |
| `corporate-website` | 企业官网 + 合作登记 + AI 客服         | core, reldb, cache, storage, ai, reach, kit, ui       |
| `h5-app`            | 移动端 H5（拍照识别 / 购物车 / 登录） | core, reldb, iam, cache, storage, ai, kit, ui         |
| `desktop-app`       | Tauri 桌面应用                        | core, kit, ui                                         |
| `android-app`       | Capacitor Android 应用                | core, kit, ui, capacitor                              |

### 按应用快速启动

| 应用                | 启动方式                                  |
| ------------------- | ----------------------------------------- |
| `admin-console`     | `pnpm --filter admin-console dev`         |
| `api-service`       | `pnpm --filter api-service dev`           |
| `corporate-website` | `pnpm --filter corporate-website dev`     |
| `h5-app`            | `pnpm --filter h5-app dev`                |
| `desktop-app`       | `cd apps/desktop-app && pnpm tauri:dev`   |
| `android-app`       | `cd apps/android-app && pnpm cap:android` |

## 开发

```bash
# 安装依赖
pnpm install

# 全量开发模式
pnpm dev

# 类型检查
pnpm typecheck

# ESLint
pnpm lint

# 单元测试
pnpm test

# E2E 测试（admin-console）
pnpm --filter admin-console test:e2e

# 只运行某个模块
pnpm --filter @h-ai/reldb test
```

## 环境变量与配置

仓库根目录提供统一样例：[`./.env.example`](./.env.example)。复制为 `.env` 后按需填写；各 `apps/*/.env.example` 仅补充应用侧差异化变量。

### 命名与组织约定

- 通用命名：`HAI_<MODULE>_<SETTING>`
- AI 兼容回退：`OPENAI_*` 仅用于 `@h-ai/ai` 的兼容 fallback
- 应用级配置通常放在 `apps/*/config/*.yml`；环境变量用于本地开发、CI/CD 与部署覆盖

### 根目录 `.env.example` 的关键分组

| 分组           | 代表变量                                                    | 说明                                                                              |
| -------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Runtime        | `HAI_ENV`、`HAI_DEBUG`                                      | 运行环境、调试与日志开关                                                          |
| Database       | `HAI_RELDB_*`                                               | `@h-ai/reldb` 的 SQLite / PostgreSQL / MySQL 配置                                 |
| Cache          | `HAI_CACHE_*`                                               | `@h-ai/cache` 的 memory / Redis / Upstash 配置                                    |
| Session / Auth | `HAI_IAM_SESSION_SECRET`、`HAI_IAM_*`、`HAI_KIT_COOKIE_KEY` | `@h-ai/iam` 与 `@h-ai/kit` 的会话、Cookie、安全配置                               |
| Storage        | `HAI_STORAGE_*`                                             | `@h-ai/storage` 的 local / S3 配置                                                |
| AI             | `HAI_AI_LLM_*`                                              | `@h-ai/ai` 的 LLM API Key、Base URL、模型配置（兼容 `OPENAI_*` 回退）             |
| VecDB          | `HAI_VECDB_*`                                               | `@h-ai/vecdb` 的 LanceDB / pgvector / Qdrant 配置                                 |
| Reach          | `HAI_REACH_*`                                               | `@h-ai/reach` 的 SMTP、短信、Webhook 配置                                         |
| Payment        | `HAI_PAYMENT_*`                                             | `@h-ai/payment` 的微信、支付宝、Stripe 商户配置                                   |
| Deploy         | `HAI_DEPLOY_*`                                              | `@h-ai/deploy` / `@h-ai/cli` 的 Vercel、Neon、Upstash、R2、Resend、阿里云短信凭据 |
| App-specific   | `HAI_PARTNER_*`、`HAI_CRYPTO_DATA_KEY`                      | 示例应用专用变量（如企业官网后台、业务数据加密）                                  |
| Dev / Test     | `HAI_E2E`、`BASE_URL`、`PUBLIC_API_BASE`、`CI`              | 本地联调、E2E 与构建辅助                                                          |

### 常见模块变量速查

| 模块            | 常见变量前缀                                                           | 用途                                                           |
| --------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| `@h-ai/reldb`   | `HAI_RELDB_*`                                                          | 数据库连接、DSN、用户名密码                                    |
| `@h-ai/cache`   | `HAI_CACHE_*`                                                          | Redis / Upstash 连接、超时、前缀                               |
| `@h-ai/storage` | `HAI_STORAGE_*`                                                        | 本地路径、S3 Bucket / Endpoint / AK/SK                         |
| `@h-ai/ai`      | `HAI_AI_LLM_*`                                                         | LLM API Key、Base URL、默认模型                                |
| `@h-ai/reach`   | `HAI_REACH_SMTP_*`、`HAI_REACH_SMS_*`、`HAI_REACH_WEBHOOK_URL`         | 邮件、短信、Webhook 触达配置                                   |
| `@h-ai/payment` | `HAI_PAYMENT_WECHAT_*`、`HAI_PAYMENT_ALIPAY_*`、`HAI_PAYMENT_STRIPE_*` | 支付商户与回调配置                                             |
| `@h-ai/deploy`  | `HAI_DEPLOY_*`                                                         | Vercel / Neon / Upstash / Cloudflare / Resend / 阿里云短信凭据 |

完整字段与默认值以仓库根目录 `.env.example` 为准；当你在某个示例应用中工作时，再对照该应用自己的 `README.md` 与 `.env.example` 查看增量配置。

## 许可证

[Apache-2.0](./LICENSE)
