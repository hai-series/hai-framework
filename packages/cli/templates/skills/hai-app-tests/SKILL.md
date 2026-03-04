---
name: hai-app-tests
description: 以 TDD 驱动应用开发：先分析需求、生成单元测试（Vitest）与 E2E 测试（Playwright），确认测试全部失败后再编码实现直至测试通过；当需求涉及应用测试、TDD 流程、覆盖率提升、E2E 测试时使用。
---

# hai-app-tests — TDD 驱动的应用测试规范

> 面向 AI 助手的 TDD 测试指南。**测试先行**：先写测试定义行为，再写实现让测试通过。涵盖 Vitest 单元测试与 Playwright E2E 测试。

---

## 适用场景

- 以 TDD 方式开发新功能（先写测试 → 确认失败 → 再实现 → 确认通过）
- 为 `$lib/server/services/` 编写服务层单元测试
- 为 API 端点编写 E2E 测试（Playwright）
- 为页面交互编写 UI E2E 测试（Playwright）
- 为工具函数、Schema 校验编写单元测试
- 需要提升测试覆盖率

---

## TDD 核心工作流（必须严格遵循）

### 阶段一：需求分析（Red 前准备）

1. **理解需求**：明确功能的输入、输出、边界条件、错误场景
2. **拆分测试点**：将需求转化为可验证的测试用例清单
3. **确定测试类型**：
   - **单元测试（Vitest）**：服务层、工具函数、Schema 校验、Result 处理
   - **E2E 测试（Playwright）**：API 端点、页面交互、认证流程、跨模块集成

### 阶段二：Red — 编写失败的测试

1. **编写单元测试**：覆盖正常路径、边界路径、权限路径、错误路径
2. **编写 E2E 测试**：覆盖 API 端点和关键用户交互流程
3. **运行测试确认全部失败**：
   ```bash
   pnpm --filter <app-name> test        # 单元测试 — 应全部 FAIL
   pnpm --filter <app-name> test:e2e    # E2E 测试 — 应全部 FAIL
   ```
4. 如果测试意外通过，说明测试没有测到新功能，需要修正测试

### 阶段三：Green — 最小实现

1. 参照 `hai-app-create` 技能编写实现代码
2. 每实现一个功能点，立即运行对应测试确认通过
3. 只写让测试通过的最小代码，不做过度设计
4. 运行全部测试确认通过：
   ```bash
   pnpm --filter <app-name> test        # 单元测试 — 应全部 PASS
   pnpm --filter <app-name> test:e2e    # E2E 测试 — 应全部 PASS
   ```

### 阶段四：Refactor — 重构优化

1. 参照 `hai-app-review` 技能审查代码规范
2. 重构后再次运行所有测试确认仍然通过
3. 运行质量门禁：`pnpm typecheck && pnpm lint && pnpm test`

---

## 测试目录约定

```
tests/                             # 单元测试（Vitest）
  services/
    user.test.ts                   # 服务层测试
    article.test.ts
  schemas/
    user-schema.test.ts            # Schema 校验测试
  utils/
    helper.test.ts                 # 工具函数测试
e2e/                               # E2E 测试（Playwright）
  helpers.ts                       # E2E 共用工具函数
  health.spec.ts                   # 健康检查 API
  auth-api.spec.ts                 # 认证 API 测试
  auth-ui.spec.ts                  # 认证页面 UI 测试
  users-api.spec.ts                # 用户管理 API 测试
  users-ui.spec.ts                 # 用户管理页面 UI 测试
```

---

## 核心规则

1. **测试先行**：先写测试定义预期行为，再写实现代码。
2. **统一入口**：通过框架模块公共 API 测试（`reldb.sql`、`iam.authn`），不直接调用内部实现。
3. **从实际场景出发**：测试用例验证真实业务行为，不做形式覆盖。
4. **先审查后修复**：测试不通过时先审查业务逻辑是否有问题，不直接修改测试迎合通过。
5. **Mock 外部依赖**：单元测试中，数据库、缓存、网络请求使用 mock，不直连真实服务。
6. **E2E 真实环境**：E2E 测试运行在完整应用环境中，不使用 mock。

---

## 覆盖范围

每个功能至少覆盖以下路径（单元测试 + E2E 按需）：

| 路径     | 说明                     | 单元测试示例       | E2E 测试示例            |
| -------- | ------------------------ | ------------------ | ----------------------- |
| 正常路径 | 核心功能可用             | 创建用户成功       | POST /api/users → 201   |
| 边界路径 | 非法输入、空值、格式错误 | 空名称、超长字符串 | 空表单提交 → 校验提示   |
| 权限路径 | 未认证、无权限           | 未登录调用服务     | 未登录访问 → 401/重定向 |
| 错误路径 | 服务异常、数据库错误     | DB 失败时的 Result | 服务不可用 → 错误提示页 |

---

## 单元测试（Vitest）

### 服务层测试模板

```typescript
import { createArticle, listArticles } from '$lib/server/services/article'
// tests/services/article.test.ts
import { reldb } from '@h-ai/reldb'
import { describe, expect, it, vi } from 'vitest'

// Mock 依赖模块
vi.mock('@h-ai/reldb', () => ({
  db: {
    sql: { query: vi.fn(), execute: vi.fn() },
    crud: { create: vi.fn(), findById: vi.fn(), paginate: vi.fn() },
  },
}))

vi.mock('@h-ai/core', () => ({
  core: { logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
}))

describe('ArticleService', () => {
  // 正常路径
  it('should create article successfully', async () => {
    const mockArticle = { id: '1', title: 'Test', authorId: 'u1' }
    vi.mocked(reldb.crud.create).mockResolvedValue({ success: true, data: mockArticle })

    const result = await createArticle({ title: 'Test', authorId: 'u1' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe('Test')
    }
  })

  // 边界路径
  it('should return error for empty title', async () => {
    const result = await createArticle({ title: '', authorId: 'u1' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBeDefined()
    }
  })

  // 错误路径
  it('should return error when db fails', async () => {
    vi.mocked(reldb.crud.create).mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'Connection lost' },
    })

    const result = await createArticle({ title: 'Test', authorId: 'u1' })

    expect(result.success).toBe(false)
  })
})
```

### Schema 校验测试模板

```typescript
import { CreateUserSchema } from '$lib/server/schemas/user'
// tests/schemas/user-schema.test.ts
import { describe, expect, it } from 'vitest'

describe('CreateUserSchema', () => {
  it('should accept valid input', () => {
    const result = CreateUserSchema.safeParse({
      username: 'testuser',
      email: 'test@example.com',
      password: '12345678',
    })
    expect(result.success).toBe(true)
  })

  it('should reject short username', () => {
    const result = CreateUserSchema.safeParse({
      username: 'ab',
      email: 'test@example.com',
      password: '12345678',
    })
    expect(result.success).toBe(false)
  })

  it('should reject invalid email', () => {
    const result = CreateUserSchema.safeParse({
      username: 'testuser',
      email: 'not-email',
      password: '12345678',
    })
    expect(result.success).toBe(false)
  })
})
```

---

## E2E 测试（Playwright）

### Playwright 配置

项目中应有 `playwright.config.ts`（由 CLI 生成）：

```typescript
// playwright.config.ts
import process from 'node:process'
import { defineConfig } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://localhost:4173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL,
    channel: 'chrome',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    env: { HAI_E2E: '1' },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
```

### E2E 工具函数模板

```typescript
// e2e/helpers.ts
import type { APIRequestContext, Page } from '@playwright/test'

/** 生成唯一测试用户 */
export function uniqueUser(prefix = 'e2e') {
  const safePrefix = (prefix.replace(/\W/g, '') || 'e2e').slice(0, 8)
  const entropy = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const id = entropy.slice(-10)
  const username = `${safePrefix}_${id}`.slice(0, 20)
  return {
    username,
    email: `${safePrefix}_${id}@test.local`,
    password: 'Test1234!@',
  }
}

/** 通过 API 注册用户 */
export async function registerViaApi(
  request: APIRequestContext,
  user: ReturnType<typeof uniqueUser>,
) {
  return request.post('/api/auth/register', {
    data: {
      username: user.username,
      email: user.email,
      password: user.password,
      confirmPassword: user.password,
    },
  })
}

/** 注册并登录，返回已认证的 Page */
export async function registerAndLogin(
  page: Page,
  request: APIRequestContext,
  prefix = 'e2e',
) {
  const user = uniqueUser(prefix)
  await registerViaApi(request, user)
  await page.goto('/login')
  await page.fill('[name="username"]', user.username)
  await page.fill('[name="password"]', user.password)
  await page.click('button[type="submit"]')
  await page.waitForURL('/')
  return user
}
```

### API 端点 E2E 测试模板

```typescript
// e2e/articles-api.spec.ts
import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('Articles API', () => {
  test('GET /api/articles 未认证返回 401', async ({ request }) => {
    const response = await request.get('/api/articles')
    expect(response.status()).toBe(401)
  })

  test('POST /api/articles 创建文章成功', async ({ page, request }) => {
    await registerAndLogin(page, request, 'article')

    const response = await page.request.post('/api/articles', {
      data: { title: 'E2E Test Article', content: 'Test content' },
    })
    expect(response.status()).toBe(201)

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.title).toBe('E2E Test Article')
  })

  test('POST /api/articles 空标题返回 400', async ({ page, request }) => {
    await registerAndLogin(page, request, 'article')

    const response = await page.request.post('/api/articles', {
      data: { title: '', content: '' },
    })
    expect(response.status()).toBe(400)
  })

  test('GET /api/articles 认证后获取列表', async ({ page, request }) => {
    await registerAndLogin(page, request, 'article')

    const response = await page.request.get('/api/articles')
    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })
})
```

### 页面 UI E2E 测试模板

```typescript
// e2e/articles-ui.spec.ts
import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('Articles Page', () => {
  test('未登录跳转登录页', async ({ page }) => {
    await page.goto('/admin/articles')
    await expect(page).toHaveURL(/login/)
  })

  test('已登录显示文章列表', async ({ page, request }) => {
    await registerAndLogin(page, request, 'artui')
    await page.goto('/admin/articles')

    await expect(page.locator('h1, h2').first()).toContainText(/文章|article/i)
  })

  test('创建文章表单提交', async ({ page, request }) => {
    await registerAndLogin(page, request, 'artui')
    await page.goto('/admin/articles/new')

    await page.fill('[name="title"]', 'E2E Article')
    await page.fill('[name="content"]', 'E2E content')
    await page.click('button[type="submit"]')

    // 验证跳转或成功提示
    await expect(page.locator('.alert-success, .toast')).toBeVisible({ timeout: 5000 })
  })
})
```

---

## TDD 用例设计策略

### 从需求到测试用例的转换

```
需求：用户可以创建文章，标题必填且不超过 100 字符，需要登录后才能操作

↓ 拆分测试点

单元测试（Vitest）：
  ✅ 创建文章成功返回 Result.ok
  ✅ 空标题返回 Result.err + VALIDATION_FAILED
  ✅ 超长标题（>100 字符）返回 Result.err
  ✅ DB 异常时透传错误

Schema 测试（Vitest）：
  ✅ 合法输入通过校验
  ✅ 空标题被拒绝
  ✅ 超长标题被拒绝
  ✅ 缺少必填字段被拒绝

E2E 测试（Playwright）：
  ✅ POST /api/articles 未认证 → 401
  ✅ POST /api/articles 合法数据 → 201
  ✅ POST /api/articles 空标题 → 400
  ✅ 页面表单提交成功 → 跳转/提示
  ✅ 未登录访问创建页 → 重定向登录
```

---

## 断言规范

- 始终校验 `Result.success`
- 失败时校验 `error.code`（不只检查 `success === false`）
- 使用类型缩窄后访问 data 或 error
- E2E 断言使用 Playwright 内置 expect 匹配器

```typescript
// ✅ 单元测试断言
const result = await service.create(input)
expect(result.success).toBe(true)
if (result.success) {
  expect(result.data.id).toBeDefined()
}

// ✅ 单元测试错误断言
const result = await service.create(invalidInput)
expect(result.success).toBe(false)
if (!result.success) {
  expect(result.error.code).toBe('VALIDATION_FAILED')
}

// ✅ E2E API 断言
const response = await request.post('/api/articles', { data: input })
expect(response.status()).toBe(201)
const body = await response.json()
expect(body.success).toBe(true)

// ✅ E2E UI 断言
await expect(page.locator('.alert-success')).toBeVisible()
await expect(page).toHaveURL('/admin/articles')
```

---

## 质量门禁

```bash
# 运行单元测试
pnpm --filter <app-name> test

# 运行 E2E 测试
pnpm --filter <app-name> test:e2e

# 覆盖率
pnpm --filter <app-name> test:coverage

# 全量门禁
pnpm typecheck && pnpm lint && pnpm test
```

---

## 相关 Skills

- `hai-app-create`：应用功能创建规范（TDD Green 阶段参照）
- `hai-app-review`：应用代码审查规范（TDD Refactor 阶段参照）
- `hai-build`：项目架构总览与 TDD 工作流导航
