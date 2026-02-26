# hai Framework

<p align="center">
  <strong>AI 原生 · 模块化 · 类型安全</strong>
</p>

<p align="center">
  面向智能应用的全栈 TypeScript 开发框架，基于 SvelteKit 2 + Svelte 5
</p>

---

## 框架定位

hai Framework 是一个**面向 AI 智能应用**的全栈开发框架。

它不只是另一个 Web 框架——它将 AI 能力（LLM 调用、MCP 协议、工具注册）、安全能力（国密加密、身份认证、权限控制）、数据能力（多数据库、缓存、对象存储）以统一的 API 风格整合在一起，让开发者可以用最少的代码构建功能完整的智能应用。

**核心设计原则：**

- **统一的服务生命周期**：每个模块都遵循 `init() → use → close()` 模式，配置用 Zod 校验，初始化即完成全部验证
- **一致的错误处理**：所有操作返回 `Result<T, E>` 类型（`{ success, data }` 或 `{ success, error }`），不抛异常，链路可控
- **Provider 可替换**：数据库、缓存、存储等模块支持多种后端，通过配置切换，API 不变
- **Node / Browser 双端**：核心模块自动适配运行环境，服务端用 pino 日志 + YAML 配置，浏览器端用 loglevel + 轻量 API

## 技术栈

| 层面     | 选型                                            |
| -------- | ----------------------------------------------- |
| 前端框架 | Svelte 5 (Runes) + SvelteKit 2                  |
| UI       | TailwindCSS 4 + DaisyUI 5                       |
| 语言     | TypeScript 5.7+（严格模式）                     |
| 数据库   | SQLite / PostgreSQL / MySQL（原生 SQL，非 ORM） |
| 缓存     | 内存 / Redis                                    |
| 存储     | 本地文件系统 / S3 兼容云存储                    |
| AI       | OpenAI 兼容 API + MCP 协议                      |
| 加密     | 国密 SM2/SM3/SM4                                |
| 验证     | Zod                                             |
| 构建     | pnpm + Turborepo + Vite + tsup                  |

## 模块总览

| 包名            | 职责                                                                      |     Provider 支持      |
| --------------- | ------------------------------------------------------------------------- | :--------------------: |
| `@h-ai/core`    | 基础能力：`Result` 类型、日志、配置加载、ID 生成、i18n、工具函数          |           —            |
| `@h-ai/crypto`  | 国密算法：SM2 非对称加密/签名、SM3 哈希、SM4 对称加密、密码哈希           |           —            |
| `@h-ai/db`      | 数据库访问：DDL、原生 SQL、事务、分页、CRUD 仓库                          | ✅ SQLite / PG / MySQL |
| `@h-ai/cache`   | 缓存：KV、Hash、List、Set、SortedSet，Redis 风格 API                      |   ✅ Memory / Redis    |
| `@h-ai/storage` | 文件存储：上传/下载/删除/复制/预签名 URL                                  |     ✅ Local / S3      |
| `@h-ai/iam`     | 身份与访问管理：认证（密码/OTP/LDAP）、RBAC 授权、会话管理、用户管理      |           —            |
| `@h-ai/ai`      | AI 集成：LLM 调用（同步/流式）、MCP Server、工具定义与注册                |           —            |
| `@h-ai/kit`     | SvelteKit 集成：Handle Hook、中间件（CORS/CSRF/限流）、路由守卫、表单校验 |           —            |
| `@h-ai/ui`      | UI 组件库：57+ Svelte 5 Runes 组件（原子 + 复合 + 业务场景）              |           —            |
| `@h-ai/cli`     | CLI 脚手架：项目创建、模块添加、代码生成                                  |           —            |

## 架构

```
                         ┌─────────────────────────┐
                         │      应用层 (apps/)      │
                         │   admin / website / h5   │
                         └────────────┬────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │ @h-ai/kit  SvelteKit 集成  │
                         │ hooks · guards · middleware│
                         └────────────┬────────────┘
                                      │
         ┌────────────┬───────────────┼───────────────┬────────────┐
         │            │               │               │            │
    ┌────▼────┐  ┌────▼────┐   ┌──────▼──────┐  ┌────▼────┐  ┌───▼───┐
    │ @h-ai/iam│  │ @h-ai/ai │   │@h-ai/storage  │  │@h-ai/ui  │  │  ...  │
    │ 认证授权 │  │ LLM+MCP │   │  文件存储    │  │ 组件库  │  │       │
    └────┬────┘  └─────────┘   └──────┬──────┘  └─────────┘  └───────┘
         │                            │
    ┌────▼────┐  ┌─────────┐   ┌──────▼──────┐
    │ @h-ai/db │  │@h-ai/cache│   │ S3 / Local  │
    │  数据库  │  │   缓存   │   │  Provider   │
    └────┬────┘  └────┬────┘   └─────────────┘
         │            │
   SQLite│PG│MySQL  Memory│Redis
         │            │
    ┌────▼────────────▼────┐
    │      @h-ai/core       │
    │ Result · Logger · ID │
    │ Config · i18n · Utils│
    └──────────────────────┘
```

**依赖方向**：上层依赖下层，`@h-ai/core` 是最底层基础，不反向依赖任何模块。

## 快速开始

### 创建新项目

```bash
# 全局安装 CLI
pnpm add -g @h-ai/cli

# 交互式创建项目（选择应用类型、功能模块）
hai create my-app

# 进入项目并启动
cd my-app && pnpm install && pnpm dev
```

### 在现有项目中使用

```bash
pnpm add @h-ai/core              # 基础能力（必装）
pnpm add @h-ai/db                # 数据库
pnpm add @h-ai/cache             # 缓存
pnpm add @h-ai/iam               # 身份认证/授权
pnpm add @h-ai/ai                # AI / LLM / MCP
pnpm add @h-ai/storage           # 文件存储
pnpm add @h-ai/crypto            # 国密加密
pnpm add @h-ai/kit               # SvelteKit 集成
pnpm add @h-ai/ui                # UI 组件库
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
  console.log(result.data) // 5
}
else {
  console.error(result.error)
}
```

### 数据库

```typescript
import { db } from '@h-ai/db'

// 初始化（SQLite）
await db.init({ type: 'sqlite', database: './data/app.db' })

// DDL — 建表
await db.ddl.createTable('users', {
  id: { type: 'TEXT', primaryKey: true },
  email: { type: 'TEXT', notNull: true, unique: true },
  name: { type: 'TEXT' },
}, true)

// 查询
const users = await db.sql.query<User>('SELECT * FROM users WHERE name = ?', ['Alice'])
if (users.success)
  console.log(users.data)

// 分页查询
const page = await db.sql.queryPage<User>({
  sql: 'SELECT * FROM users',
  page: 1,
  pageSize: 20,
})

// 事务
await db.tx.wrap(async (tx) => {
  await tx.execute('INSERT INTO users (id, email) VALUES (?, ?)', ['1', 'a@b.com'])
  await tx.execute('INSERT INTO logs (action) VALUES (?)', ['user_created'])
})

// CRUD 仓库（自动生成 SQL）
const userRepo = db.crud.table<User>({ tableName: 'users', primaryKey: 'id' })
await userRepo.create({ id: '1', email: 'a@b.com', name: 'Alice' })
const user = await userRepo.findById('1')
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
ai.init({
  llm: { apiKey: process.env.HAI_OPENAI_API_KEY, model: 'gpt-4o-mini' },
})

// 同步调用
const result = await ai.llm.chat({
  messages: [{ role: 'user', content: '用一句话解释量子计算' }],
})
if (result.success)
  console.log(result.data.choices[0].message.content)

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

### 文件存储

```typescript
import { storage } from '@h-ai/storage'

// 初始化（本地 or S3 兼容）
await storage.init({ type: 'local', root: './uploads' })

// 上传
await storage.file.put('docs/readme.txt', Buffer.from('Hello'))

// 下载
const data = await storage.file.get('docs/readme.txt')

// 预签名 URL（前端直传场景）
const url = await storage.presign.putUrl('uploads/image.png', { expiresIn: 3600 })
```

### 身份认证 & 授权

```typescript
import { cache } from '@h-ai/cache'
import { db } from '@h-ai/db'
import { iam } from '@h-ai/iam'

// IAM 依赖 db 和 cache，通过参数注入
await iam.init({
  db,
  cache,
  session: { secret: process.env.HAI_SESSION_SECRET },
})

// 用户注册
await iam.user.register({ username: 'alice', password: 'StrongPass123!' })

// 登录
const loginResult = await iam.auth.login({ identifier: 'alice', password: 'StrongPass123!' })

// RBAC 权限控制
await iam.authz.assignRole(userId, 'admin')
const allowed = await iam.authz.checkPermission(userId, 'users:read')
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

await crypto.init({})

// SM2 非对称加密
const keyPair = crypto.sm2.generateKeyPair()
const encrypted = crypto.sm2.encrypt('敏感数据', keyPair.data.publicKey)
const decrypted = crypto.sm2.decrypt(encrypted.data, keyPair.data.privateKey)

// SM4 对称加密
const key = crypto.sm4.generateKey()
const cipher = crypto.sm4.encrypt('明文', key)

// 密码哈希
const hashed = crypto.password.hash('MyPassword123')
const valid = crypto.password.verify('MyPassword123', hashed.data)
```

### Svelte 5 UI 组件

```svelte
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

仓库 `apps/` 目录包含 4 种应用模板：

| 应用                | 说明                     | 使用的模块         |
| ------------------- | ------------------------ | ------------------ |
| `admin-console`     | 管理后台（完整功能参考） | 全部 @h-ai/\* 模块 |
| `api-service`       | 纯 API 后端服务          | core, db, iam, kit |
| `corporate-website` | 企业官网                 | core, kit, ui      |
| `h5-app`            | H5 移动应用              | core, kit, ui      |

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
pnpm --filter @h-ai/db test
```

## 环境变量

复制 `.env.example` 为 `.env` 填入实际值。命名规范：`HAI_<MODULE>_<SETTING>`。

| 变量                        | 说明                                      | 默认值           |
| --------------------------- | ----------------------------------------- | ---------------- |
| `HAI_ENV`                   | 运行环境                                  | `development`    |
| `HAI_DEBUG`                 | 调试模式                                  | `false`          |
| `HAI_DB_TYPE`               | 数据库类型（sqlite / postgresql / mysql） | `sqlite`         |
| `HAI_DB_DATABASE`           | 数据库路径或名称                          | `./data/app.db`  |
| `HAI_DB_HOST`               | 数据库主机                                | `localhost`      |
| `HAI_DB_PORT`               | 数据库端口                                | `5432`           |
| `HAI_DB_USER`               | 数据库用户                                | `postgres`       |
| `HAI_DB_PASSWORD`           | 数据库密码                                | —                |
| `HAI_SESSION_SECRET`        | JWT 签名密钥（**必填**，≥32 字符）        | —                |
| `HAI_CACHE_TYPE`            | 缓存类型（memory / redis）                | `memory`         |
| `HAI_CACHE_REDIS_URL`       | Redis 连接 URL                            | —                |
| `HAI_STORAGE_TYPE`          | 存储类型（local / s3）                    | `local`          |
| `HAI_STORAGE_PATH`          | 本地存储路径                              | `./data/uploads` |
| `HAI_STORAGE_S3_BUCKET`     | S3 存储桶                                 | —                |
| `HAI_STORAGE_S3_REGION`     | S3 区域                                   | `us-east-1`      |
| `HAI_STORAGE_S3_ACCESS_KEY` | S3 Access Key                             | —                |
| `HAI_STORAGE_S3_SECRET_KEY` | S3 Secret Key                             | —                |
| `HAI_OPENAI_API_KEY`        | OpenAI API Key                            | —                |
| `HAI_OPENAI_BASE_URL`       | OpenAI 兼容 Base URL                      | —                |
| `HAI_ANTHROPIC_API_KEY`     | Anthropic API Key                         | —                |
| `HAI_E2E`                   | E2E 测试模式                              | —                |

完整列表见各应用的 `.env.example`。

## 许可证

[Apache-2.0](./LICENSE)
