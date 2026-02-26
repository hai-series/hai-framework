---
name: hai-app-tests
description: 为 hai-framework 应用补充单元测试（Vitest），覆盖服务层、API 端点与工具函数；当需求涉及应用测试、覆盖率提升、测试补全时使用。
---

# hai-app-tests — 应用测试规范

> 面向 AI 助手的应用测试指南。使用 Vitest 为 hai-framework 应用编写单元测试。

---

## 适用场景

- 为 `$lib/server/services/` 编写服务层测试
- 为工具函数、Schema 校验编写测试
- 需要提升测试覆盖率

---

## 测试目录约定

```
tests/
  services/
    user.test.ts           # 服务层测试
    article.test.ts
  schemas/
    user-schema.test.ts    # Schema 校验测试
  utils/
    helper.test.ts         # 工具函数测试
```

---

## 核心规则

1. **统一入口**：通过框架模块公共 API 测试（`db.sql`、`iam.authn`），不直接调用内部实现。
2. **从实际场景出发**：测试用例验证真实业务行为，不做形式覆盖。
3. **先审查后修复**：测试不通过时先审查业务逻辑是否有问题，不直接修改测试迎合通过。
4. **Mock 外部依赖**：数据库、缓存、网络请求使用 mock，不直连真实服务。

---

## 覆盖范围

每个功能至少覆盖：

| 路径     | 说明                     | 示例                   |
| -------- | ------------------------ | ---------------------- |
| 正常路径 | 核心功能可用             | 创建用户成功           |
| 边界路径 | 非法输入、空值、格式错误 | 空名称、超长字符串     |
| 权限路径 | 未认证、无权限           | 未登录访问管理页面     |
| 错误路径 | 服务异常、数据库错误     | DB 连接失败时的 Result |

---

## 服务层测试模板

```typescript
import { core } from '@h-ai/core'
import { db } from '@h-ai/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Mock 依赖模块
vi.mock('@h-ai/db', () => ({
  db: {
    sql: {
      query: vi.fn(),
      execute: vi.fn(),
    },
    crud: {
      create: vi.fn(),
      findById: vi.fn(),
      paginate: vi.fn(),
    },
  },
}))

describe('ArticleService', () => {
  it('should create article successfully', async () => {
    const mockArticle = { id: '1', title: 'Test', authorId: 'u1' }
    vi.mocked(db.crud.create).mockResolvedValue({ success: true, data: mockArticle })

    const result = await createArticle({ title: 'Test', authorId: 'u1' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe('Test')
    }
  })

  it('should return error for empty title', async () => {
    const result = await createArticle({ title: '', authorId: 'u1' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBeDefined()
    }
  })
})
```

---

## Schema 校验测试模板

```typescript
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const CreateUserSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8),
})

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

## 断言规范

- 始终校验 `Result.success`
- 失败时校验 `error.code`（不只检查 `success === false`）
- 使用类型缩窄后访问 data 或 error

```typescript
// ✅ 正确断言
const result = await service.create(input)
expect(result.success).toBe(true)
if (result.success) {
  expect(result.data.id).toBeDefined()
}

// ✅ 错误断言
const result = await service.create(invalidInput)
expect(result.success).toBe(false)
if (!result.success) {
  expect(result.error.code).toBe('VALIDATION_FAILED')
}
```

---

## 质量门禁

```bash
# 运行指定应用测试
pnpm --filter <app-name> test

# 覆盖率
pnpm --filter <app-name> test:coverage
```

---

## 相关 Skills

- `hai-app-create`：应用功能创建规范
- `hai-app-review`：应用代码审查规范
