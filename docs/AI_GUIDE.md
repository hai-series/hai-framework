# hai Admin Framework - 模块使用指南

## @hai/core - 核心模块

### Result 类型（错误处理）

```typescript
import { AppError, err, ok, Result } from '@hai/core'

// 成功
function getUser(): Result<User, AppError> {
  return ok({ id: '1', name: 'Alice' })
}

// 失败
function getUser(): Result<User, AppError> {
  return err(AppError.notFound('用户不存在'))
}

// 使用
const result = getUser()
if (result.ok) {
  console.log(result.value) // User
}
else {
  console.log(result.error.code, result.error.message)
}

// 链式处理
const name = result
  .map(user => user.name)
  .unwrapOr('Unknown')
```

### 错误类型

```typescript
// 预定义错误
AppError.validation('验证失败')
AppError.notFound('资源不存在')
AppError.unauthorized('未授权')
AppError.forbidden('禁止访问')
AppError.internal('服务器错误')

// 自定义错误
AppError.create('CUSTOM_ERROR', '自定义错误消息', { extra: 'data' })
```

### 依赖注入

```typescript
import { Container, inject, injectable } from '@hai/core'

@injectable()
class UserRepository {
  async find(id: string) { /* ... */ }
}

@injectable()
class UserService {
  constructor(@inject(UserRepository) private repo: UserRepository) {}

  async getUser(id: string) {
    return this.repo.find(id)
  }
}

// 使用
const container = new Container()
container.register(UserRepository)
container.register(UserService)

const service = container.resolve(UserService)
```

### 工具函数

```typescript
import {
  debounce, // 防抖
  deepClone, // 深拷贝
  generateId, // 生成 nanoid
  omit, // 排除属性
  pick, // 选取属性
  retry, // 重试机制
  sleep, // 延迟执行
  throttle, // 节流
} from '@hai/core'

// 使用
const id = generateId() // 'V1StGXR8_Z5jdHi6B-myT'
await sleep(1000) // 等待 1 秒
await retry(() => fetch(url), { times: 3 }) // 重试 3 次
```

---

## @hai/core - 配置模块

### 定义配置

```typescript
import { defineConfig } from '@hai/core'

export const appConfig = defineConfig({
  // 简单配置
  name: { default: 'My App' },

  // 从环境变量读取
  port: { default: 3000, env: 'PORT' },

  // 必填配置
  secret: { required: true, env: 'SECRET' },

  // 嵌套配置
  database: {
    url: { required: true, env: 'DATABASE_URL' },
    pool: { default: 10 },
  },

  // 数组配置
  allowedOrigins: { default: ['http://localhost:3000'] },
})
```

### 加载配置

```typescript
// 加载所有配置
const config = appConfig.load()

// 访问配置
console.log(config.name)
console.log(config.database.url)

// 验证配置（启动时调用）
appConfig.validate() // 如果必填项缺失会抛出错误
```

---

## @hai/crypto - 加密模块

### 密码哈希

```typescript
import { hashPassword, verifyPassword } from '@hai/crypto'

// 哈希密码
const hashed = await hashPassword('mypassword')

// 验证密码
const isValid = await verifyPassword('mypassword', hashed)
```

### JWT

```typescript
import { createJWT, verifyJWT } from '@hai/crypto'

// 创建 JWT
const token = await createJWT(
  { userId: '123', role: 'admin' },
  'secret-key',
  { expiresIn: '7d' }
)

// 验证 JWT
const payload = await verifyJWT(token, 'secret-key')
// { userId: '123', role: 'admin', iat: ..., exp: ... }
```

### 加解密

```typescript
import { decrypt, encrypt, generateKey } from '@hai/crypto'

const key = generateKey()
const encrypted = encrypt('敏感数据', key)
const decrypted = decrypt(encrypted, key) // '敏感数据'
```

---

## @hai/db - 数据库模块

### 连接数据库

```typescript
import { createDB } from '@hai/db'

// SQLite
const db = createDB({ url: 'file:./app.db' })

// PostgreSQL
const db = createDB({ url: 'postgres://user:pass@host/db' })

// MySQL
const db = createDB({ url: 'mysql://user:pass@host/db' })
```

### 定义 Schema

```typescript
import { defineSchema } from '@hai/db'
import { integer, real, text } from 'drizzle-orm/sqlite-core'

export const users = defineSchema('users', {
  id: text('id').primaryKey(),
  email: text('email').unique().notNull(),
  name: text('name'),
  age: integer('age'),
  balance: real('balance').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(Date.now()),
})

export const posts = defineSchema('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  authorId: text('author_id').references(() => users.id),
})
```

### CRUD 操作

```typescript
import { and, desc, eq, like, or } from 'drizzle-orm'

// 查询全部
const allUsers = await db.select().from(users)

// 条件查询
const user = await db.select()
  .from(users)
  .where(eq(users.id, '123'))
  .get()

// 模糊查询
const matchedUsers = await db.select()
  .from(users)
  .where(like(users.name, '%张%'))

// 复杂条件
const result = await db.select()
  .from(users)
  .where(and(
    eq(users.role, 'admin'),
    or(
      like(users.name, '%张%'),
      like(users.email, '%@example.com')
    )
  ))
  .orderBy(desc(users.createdAt))
  .limit(10)

// 插入
await db.insert(users).values({
  id: generateId(),
  email: 'new@example.com',
  name: '新用户',
})

// 批量插入
await db.insert(users).values([
  { id: '1', email: 'a@b.com' },
  { id: '2', email: 'c@d.com' },
])

// 更新
await db.update(users)
  .set({ name: '新名字' })
  .where(eq(users.id, '123'))

// 删除
await db.delete(users).where(eq(users.id, '123'))
```

### 事务

```typescript
await db.transaction(async (tx) => {
  const user = await tx.insert(users).values({ ... }).returning().get()
  await tx.insert(logs).values({ userId: user.id, action: 'created' })
})
```

---

## @hai/auth - 认证模块

### 配置认证

```typescript
import { createAuth } from '@hai/auth'

const auth = createAuth({
  secret: process.env.JWT_SECRET!,
  tokenExpiry: '7d',
  refreshExpiry: '30d',
})
```

### 用户认证

```typescript
// 注册
const result = await auth.register({
  email: 'user@example.com',
  password: 'password123',
  name: '用户名',
})

// 登录
const result = await auth.login('user@example.com', 'password123')
if (result.ok) {
  const { user, accessToken, refreshToken } = result.value
}

// 验证 Token
const user = await auth.verify(accessToken)

// 刷新 Token
const newTokens = await auth.refresh(refreshToken)

// 登出
await auth.logout(userId)
```

### RBAC 权限

```typescript
// 定义权限
const permissions = {
  'users:read': ['admin', 'user'],
  'users:write': ['admin'],
  'users:delete': ['admin'],
}

// 检查权限
const canEdit = auth.can(user, 'users:write') // true/false

// 守卫装饰器
@requirePermission('users:write')
async function updateUser(id: string, data: any) {
  // ...
}
```

---

## @hai/ai - AI 模块

### 创建 AI 客户端

```typescript
import { createAI } from '@hai/ai'

// OpenAI
const ai = createAI({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o',
})

// Anthropic
const ai = createAI({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-5-sonnet-20241022',
})
```

### 基本对话

```typescript
// 简单调用
const response = await ai.chat('你好，请介绍一下自己')

// 带系统提示
const response = await ai.chat('分析这段代码', {
  system: '你是一个资深的代码审查专家',
})

// 多轮对话
const response = await ai.chat([
  { role: 'user', content: '什么是 TypeScript?' },
  { role: 'assistant', content: 'TypeScript 是...' },
  { role: 'user', content: '它和 JavaScript 有什么区别?' },
])
```

### 流式响应

```typescript
// 流式输出
for await (const chunk of ai.stream('写一首诗')) {
  process.stdout.write(chunk)
}

// 在 SvelteKit 中使用
export async function GET() {
  const stream = ai.stream('讲个故事')

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(new TextEncoder().encode(chunk))
        }
        controller.close()
      }
    }),
    { headers: { 'Content-Type': 'text/event-stream' } }
  )
}
```

### 结构化输出

```typescript
import { z } from 'zod'

const analysisSchema = z.object({
  score: z.number().min(0).max(100),
  issues: z.array(z.object({
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    description: z.string(),
    line: z.number().optional(),
    suggestion: z.string(),
  })),
  summary: z.string(),
})

const result = await ai.structured(
  `分析以下代码:\n\n${code}`,
  analysisSchema,
  { system: '你是代码审查专家' }
)

// result 的类型是 z.infer<typeof analysisSchema>
console.log(result.score)
console.log(result.issues)
```

---

## @hai/ui - UI 组件

### 基础组件

```svelte
<script>
  import { Button, Input, Select, Textarea, Checkbox, Switch } from '@hai/ui'
</script>

<!-- 按钮 -->
<Button variant="primary" size="md" onclick={handleClick}>主按钮</Button>
<Button variant="ghost" loading={isLoading}>加载中</Button>
<Button variant="error" disabled>禁用</Button>

<!-- 输入框 -->
<Input label="用户名" bind:value={username} placeholder="请输入" />
<Input label="密码" type="password" bind:value={password} error={errors.password} />

<!-- 下拉选择 -->
<Select
  label="角色"
  bind:value={role}
  options={[
    { value: 'admin', label: '管理员' },
    { value: 'user', label: '普通用户' },
  ]}
/>

<!-- 多选 -->
<MultiSelect
  label="选择用户"
  options={userOptions}
  selected={selectedUserIds}
  onchange={(ids) => selectedUserIds = ids}
/>

<!-- 文本域 -->
<Textarea label="描述" bind:value={description} rows={4} />

<!-- 开关 -->
<Switch bind:checked={enabled} label="启用" />
```

### 数据展示

```svelte
<script>
  import { Card, DataTable, Badge, Avatar, Progress, ScoreBar } from '@hai/ui'
</script>

<!-- 卡片 -->
<Card title="用户信息">
  <p>内容区域</p>
  {#snippet footer()}
    <Button>操作</Button>
  {/snippet}
</Card>

<!-- 数据表格 -->
<DataTable
  data={users}
  columns={[
    { key: 'name', label: '姓名' },
    { key: 'email', label: '邮箱' },
    { key: 'createdAt', label: '创建时间' },
  ]}
  keyField="id"
>
  {#snippet actions(user)}
    <Button size="xs" onclick={() => edit(user)}>编辑</Button>
    <Button size="xs" variant="error" onclick={() => remove(user)}>删除</Button>
  {/snippet}
</DataTable>

<!-- 徽章 -->
<Badge variant="success">已启用</Badge>
<Badge variant="warning">待审核</Badge>

<!-- 分数条 -->
<ScoreBar value={85} />
```

### 反馈组件

```svelte
<script>
  import { Modal, Alert, Toast, Spinner } from '@hai/ui'

  let showModal = $state(false)
  let toasts = $state([])
</script>

<!-- 模态框 -->
<Modal bind:open={showModal} title="确认删除">
  <p>确定要删除吗？此操作不可撤销。</p>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => showModal = false}>取消</Button>
    <Button variant="error" onclick={handleDelete}>确认删除</Button>
  {/snippet}
</Modal>

<!-- 警告框 -->
<Alert variant="warning">请注意，此操作不可撤销</Alert>
<Alert variant="error">发生错误：{errorMessage}</Alert>

<!-- 全局通知 -->
<Toast
  messages={toasts}
  ondismiss={(id) => toasts = toasts.filter(t => t.id !== id)}
/>

<!-- 加载状态 -->
{#if loading}
  <Spinner size="lg" />
{/if}
```

### 页面组件

```svelte
<script>
  import { PageHeader, Breadcrumb, Pagination, Tabs } from '@hai/ui'
</script>

<!-- 页面头部 -->
<PageHeader title="用户管理" description="管理系统用户">
  {#snippet actions()}
    <Button onclick={createUser}>新建用户</Button>
  {/snippet}
</PageHeader>

<!-- 面包屑 -->
<Breadcrumb items={[
  { label: '首页', href: '/' },
  { label: '用户', href: '/users' },
  { label: '详情' },
]} />

<!-- 标签页 -->
<Tabs
  items={['基本信息', '安全设置', '操作日志']}
  bind:activeIndex={activeTab}
/>

<!-- 分页 -->
<Pagination
  currentPage={page}
  totalPages={totalPages}
  onchange={(p) => page = p}
/>
```

---

## @hai/kit - SvelteKit 集成

### 认证钩子

```typescript
// src/hooks.server.ts
import { authHook } from '@hai/kit'

export const handle = authHook({
  publicPaths: ['/login', '/register', '/api/public'],
  loginPath: '/login',
  onAuthError: (error) => {
    console.error('Auth error:', error)
  },
})
```

### API 中间件

```typescript
import { withAuth, withValidation } from '@hai/kit'
// src/routes/api/users/+server.ts
import { json } from '@sveltejs/kit'

// 需要认证
export const GET = withAuth(async ({ locals }) => {
  const user = locals.user
  // ...
})

// 需要认证 + 验证
export const POST = withAuth(
  withValidation(createUserSchema, async ({ request, locals }) => {
    const data = await request.json()
    // data 已经过验证
  })
)
```

### 路由守卫

```typescript
// src/routes/(app)/admin/+page.server.ts
import { requireRole } from '@hai/kit'

export const load = requireRole(['admin'], async ({ locals }) => {
  // 只有 admin 角色可以访问
  return { ... }
})
```

---

## @hai/cli - 脚手架

### 创建项目

```bash
# 交互式创建
pnpm create hai

# 指定项目名
pnpm create hai my-admin

# 使用模板
pnpm create hai my-admin --template admin-console
```

### 代码生成

```bash
# 生成 CRUD 页面
hai generate crud users

# 生成 API 路由
hai generate api users

# 生成组件
hai generate component UserCard

# 生成服务
hai generate service user
```

### 数据库命令

```bash
# 生成迁移
hai db:generate

# 执行迁移
hai db:migrate

# 推送 schema（开发用）
hai db:push

# 打开 Drizzle Studio
hai db:studio
```
