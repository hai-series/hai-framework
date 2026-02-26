---
name: hai-app-create
description: 以 TDD 方式在应用中创建新功能：先编写测试定义行为，再编码实现直至测试通过；当需求涉及新增页面/路由、API、服务、数据模型、组件时使用。
---

# hai-app-create — TDD 驱动的应用功能创建规范

> 面向 AI 助手的应用功能创建指南。**必须遵循 TDD**：先写测试（Red）→ 再实现（Green）→ 再重构（Refactor）。

---

## 适用场景

- 新增页面（路由）
- 新增 API 端点
- 新增服务层模块（`$lib/server/services/`）
- 新增数据库表 / 数据模型
- 新增业务组件

---

## TDD 开发流程（强制）

创建任何新功能时，必须按以下顺序执行：

### Step 1：需求分析与测试设计

1. 明确功能的输入、输出、边界条件、错误场景
2. 确定需要创建的文件（服务、路由、Schema、组件等）
3. 设计测试用例清单（参照 `hai-app-tests` 技能的覆盖范围要求）

### Step 2：编写测试（Red 阶段）

1. **创建单元测试**：在 `tests/` 下为服务层、Schema 编写 Vitest 测试
2. **创建 E2E 测试**：在 `e2e/` 下为 API 端点、页面交互编写 Playwright 测试
3. **创建空的实现文件**：仅包含函数签名和类型定义，不写实际逻辑（确保 import 不报错）
4. **运行测试确认全部失败**：
   ```bash
   pnpm --filter <app-name> test        # 应全部 FAIL
   ```

### Step 3：编写实现（Green 阶段）

按照下文的「创建指南」编写实际功能代码，每完成一个功能点立即运行测试确认通过。

### Step 4：重构与验证（Refactor 阶段）

1. 参照 `hai-app-review` 审查代码规范
2. 运行质量门禁：`pnpm typecheck && pnpm lint && pnpm test`
3. 运行 E2E：`pnpm --filter <app-name> test:e2e`

---

## 目录结构约定

```
src/
  hooks.server.ts                # Handle Hook 入口
  hooks.ts                       # 通用 Hooks（reroute 等）
  app.css                        # 全局样式（TailwindCSS 4）
  lib/
    server/
      init.ts                    # 应用初始化（模块 init 顺序）
      services/                  # 业务服务层（Server-only）
        index.ts                 # 服务聚合导出
        user.ts                  # 示例：用户服务
      schemas/                   # 请求校验 Schema（Zod）
    components/                  # 业务组件（非 @h-ai/ui 通用组件）
    stores/                      # 客户端 Store（Svelte 5 Runes）
    paraglide/                   # i18n 生成文件（禁止手动修改）
  routes/
    +layout.svelte               # 根布局
    +page.svelte                 # 首页
    (auth)/                      # 认证分组路由
      login/+page.svelte
    admin/                       # 管理区域
      users/
        +page.svelte             # 列表页
        +page.server.ts          # 列表数据加载
        [id]/
          +page.svelte           # 详情页
          +page.server.ts
    api/                         # API 端点
      auth/+server.ts
      health/+server.ts
      iam/
        users/+server.ts
  messages/                      # i18n 消息文件
    en-US.json
    zh-CN.json
  config/                        # 模块配置文件
    _core.yml
    _db.yml
    _cache.yml
    _iam.yml
```

---

## 创建页面

### 页面路由规则

使用 SvelteKit 文件路由，参考 `src/routes/` 约定：

| 类型     | 路径示例                           | 说明                 |
| -------- | ---------------------------------- | -------------------- |
| 静态页面 | `routes/about/+page.svelte`        | 常规页面             |
| 动态路由 | `routes/users/[id]/+page.svelte`   | URL 参数             |
| 分组路由 | `routes/(auth)/login/+page.svelte` | 共享布局，不影响 URL |
| API 端点 | `routes/api/users/+server.ts`      | RESTful API          |

### 页面文件模板

```svelte
<!-- +page.svelte -->
<script lang="ts">
  // Svelte 5 Runes 语法
  let { data } = $props()
  let loading = $state(false)

  async function handleAction() {
    loading = true
    try {
      // 业务逻辑
    } finally {
      loading = false
    }
  }
</script>

<div class="container mx-auto p-4">
  <!-- 使用 @h-ai/ui 组件 -->
</div>
```

### 数据加载（+page.server.ts）

```typescript
import type { PageServerLoad } from './$types'
import { kit } from '@h-ai/kit'

export const load: PageServerLoad = async (event) => {
  // 权限守卫
  const guard = kit.guard.requireAuth(event)
  if (!guard.success)
    return kit.response.redirect('/login')

  // 加载数据
  const result = await someService.list()
  if (!result.success)
    return kit.response.error(500, result.error.message)

  return { items: result.data }
}
```

---

## 创建 API 端点

### RESTful 端点模板

```typescript
// src/routes/api/[resource]/+server.ts
import type { RequestHandler } from './$types'
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
})

// GET - 列表
export const GET: RequestHandler = async (event) => {
  const guard = kit.guard.requirePermission(event, 'resource:read')
  if (!guard.success)
    return kit.response.forbidden()

  const result = await service.list()
  if (!result.success)
    return kit.response.error(500, result.error.message)
  return kit.response.ok(result.data)
}

// POST - 创建
export const POST: RequestHandler = async (event) => {
  const guard = kit.guard.requirePermission(event, 'resource:create')
  if (!guard.success)
    return kit.response.forbidden()

  const { valid, data } = await kit.validate.form(event.request, CreateSchema)
  if (!valid)
    return kit.response.badRequest('Invalid input')

  const result = await service.create(data!)
  if (!result.success)
    return kit.response.error(500, result.error.message)
  return kit.response.created(result.data)
}
```

### 要点

- 所有端点必须进行权限守卫（`kit.guard`）
- 输入参数必须通过 Zod Schema 校验（`kit.validate`）
- 返回统一使用 `kit.response.*`
- Result 错误直接透传，不重新包装
- 框架模块 API 不抛异常，不要用 `try/catch` 处理模块返回的错误，直接检查 `result.success`

---

## 创建服务层

服务层位于 `$lib/server/services/`，处理业务逻辑。

```typescript
import type { Result } from '@h-ai/core'
// src/lib/server/services/article.ts
import { core } from '@h-ai/core'
import { db } from '@h-ai/db'

const logger = core.logger

/** 创建文章 */
export async function createArticle(input: CreateArticleInput): Promise<Result<Article>> {
  logger.debug('Creating article', { title: input.title })

  const result = await db.crud.create('articles', {
    id: crypto.randomUUID(),
    ...input,
    created_at: new Date().toISOString(),
  })
  if (!result.success)
    return result

  logger.info('Article created', { id: result.data.id })
  return result
}

/** 获取文章列表 */
export async function listArticles(params: ListParams): Promise<Result<PaginatedResult<Article>>> {
  logger.debug('Listing articles', { page: params.page })
  return db.crud.paginate('articles', params)
}
```

### 服务层规则

- 统一返回 `Result<T>`
- 写操作需 `debug`（进入）+ `info`（成功）日志
- 读操作仅 `debug` 日志
- 禁止 `console.log`，使用 `core.logger`
- 服务层不处理 HTTP 响应格式，只返回 Result

---

## 创建数据模型

### Schema 定义（SQL DDL）

数据库表 Schema 定义在 `$lib/server/init.ts` 中：

```typescript
const BUSINESS_SCHEMA = `
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  author_id TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_articles_author_id ON articles(author_id);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
`
```

### 类型定义

```typescript
// 在服务文件或独立类型文件中定义
interface Article {
  id: string
  title: string
  content: string | null
  authorId: string
  status: 'draft' | 'published' | 'archived'
  createdAt: string
  updatedAt: string
}

interface CreateArticleInput {
  title: string
  content?: string
  authorId: string
}
```

---

## 创建业务组件

业务组件放在 `$lib/components/`，通用 UI 使用 `@h-ai/ui`。

```svelte
<!-- src/lib/components/ArticleCard.svelte -->
<script lang="ts">
  import type { Article } from '$lib/server/services/article'

  let { article, onEdit }: { article: Article, onEdit?: () => void } = $props()
</script>

<div class="card bg-base-100 shadow">
  <div class="card-body">
    <h2 class="card-title">{article.title}</h2>
    <p>{article.content ?? ''}</p>
    {#if onEdit}
      <div class="card-actions justify-end">
        <button class="btn btn-primary" onclick={onEdit}>编辑</button>
      </div>
    {/if}
  </div>
</div>
```

### 组件规则

- 使用 Svelte 5 Runes 语法（`$props()`、`$state()`、`$derived()`、`$effect()`）
- 事件回调通过 props 传入（非 `createEventDispatcher`）
- 样式使用 TailwindCSS 4 + DaisyUI 5 class
- 通用 UI 组件优先使用 `@h-ai/ui`，不重复实现
- i18n 文本使用 `$lib/paraglide/messages.js` 中的 key

---

## 初始化顺序

在 `$lib/server/init.ts` 中管理模块初始化顺序：

```
core.init() → db.init() → cache.init() → iam.init() → createBusinessTables()
```

新增模块时需在此文件中按依赖顺序添加初始化调用。

---

## 检查清单

- [ ] **TDD 流程已执行**：先写测试 → 确认失败 → 再实现 → 确认通过
- [ ] 单元测试已编写（服务层、Schema）
- [ ] E2E 测试已编写（API 端点、页面交互）
- [ ] 页面使用 Svelte 5 Runes 语法
- [ ] API 端点有权限守卫与输入校验
- [ ] 服务层统一返回 `Result<T>`
- [ ] 日志级别正确（读 debug / 写 debug+info / 失败 warn|error）
- [ ] 禁止 `console.log`、`any`、硬编码密钥
- [ ] 用户可见文本走 i18n
- [ ] 新增表有索引定义
- [ ] 组件优先使用 `@h-ai/ui`
- [ ] `pnpm typecheck && pnpm lint && pnpm test` 通过

---

## 相关 Skills

- `hai-build`：项目架构与模块初始化顺序
- `hai-app-tests`：TDD 测试规范（Red 阶段详细指引）
- `hai-app-review`：代码审查规范（Refactor 阶段参照）
- `hai-kit`：SvelteKit 集成的完整 API
- `hai-ui`：UI 组件库使用
- `hai-db`：数据库操作详细 API
- `hai-iam`：认证与权限管理
