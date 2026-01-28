# hai Admin Framework

<p align="center">
  <strong>AI-Native · Configuration-Driven · Security-First</strong>
</p>

<p align="center">
  基于 SvelteKit 2.x + Svelte 5 Runes 的现代化企业级管理后台框架
</p>

## ✨ 特性

- 🔐 **端到端加密** - 使用国密算法 SM2/SM3/SM4 + Argon2 保护数据安全
- 🤖 **AI 原生** - 内置 OpenAI 兼容 API 和 MCP 协议支持
- ⚡ **配置驱动** - YAML 配置文件，环境变量插值，运行时热重载
- 🎨 **Svelte 5 Runes** - 使用最新的 Runes 语法，组件简洁高效
- 🗃️ **多数据库支持** - SQLite、PostgreSQL、MySQL（通过 Drizzle ORM）
- 📦 **模块化设计** - 按需引入，减少打包体积
- 🛡️ **类型安全** - TypeScript 5.7+ 严格模式，Zod 验证
- 🔧 **开发体验** - CLI 脚手架，代码生成器，热重载

## 📦 包结构

| 包名           | 描述                                                | 状态 |
| -------------- | --------------------------------------------------- | ---- |
| `@hai/core`    | 核心工具：Result 类型、错误处理、DI、日志、工具函数 | ✅    |
| `@hai/config`  | 配置管理：Zod Schema、YAML 加载、环境变量           | ✅    |
| `@hai/crypto`  | 加密模块：SM2/SM3/SM4 国密算法、Argon2 密码哈希     | ✅    |
| `@hai/db`      | 数据库：Drizzle ORM、连接管理、迁移工具             | ✅    |
| `@hai/auth`    | 认证授权：会话管理、E2EE 登录、JWT                  | ✅    |
| `@hai/ai`      | AI 集成：OpenAI 兼容适配器、流处理、工具调用        | ✅    |
| `@hai/skills`  | 技能系统：技能定义、注册、管道组合                  | ✅    |
| `@hai/mcp`     | MCP 协议：服务端、客户端、工具/资源/提示            | ✅    |
| `@hai/storage` | 文件存储：本地、内存驱动，存储管理器                | ✅    |
| `@hai/ui`      | UI 组件：20+ Svelte 5 组件，表单、表格、弹窗等      | ✅    |
| `@hai/kit`     | SvelteKit 集成：Handle Hook、中间件、守卫           | ✅    |
| `@hai/cli`     | CLI 工具：项目脚手架、代码生成器                    | ✅    |

## 🚀 快速开始

### 创建新项目

```bash
# 全局安装 CLI
pnpm add -g @hai/cli

# 创建项目
hai create my-admin-app

# 进入目录
cd my-admin-app

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

### 在现有项目中使用

```bash
# 安装核心包
pnpm add @hai/core @hai/config @hai/kit @hai/ui

# 安装可选包
pnpm add @hai/auth @hai/db @hai/crypto  # 认证和数据库
pnpm add @hai/ai @hai/skills @hai/mcp   # AI 能力
pnpm add @hai/storage                    # 文件存储
```

## 📖 使用示例

### 配置管理

```typescript
// config/app.yml
app:
  name: ${APP_NAME:my-app}
  port: ${PORT:3000}

// 使用配置
import { loadConfig, appSchema } from '@hai/config'

const config = await loadConfig('config/app.yml', appSchema)
console.log(config.app.name)
```

### 错误处理

```typescript
import { Ok, Err, fromPromise } from '@hai/core'

// Result 类型
function divide(a: number, b: number): Result<number, string> {
  if (b === 0) return Err('Division by zero')
  return Ok(a / b)
}

// 链式操作
const result = divide(10, 2)
  .map(x => x * 2)
  .flatMap(x => divide(x, 2))
  .match(
    value => `Result: ${value}`,
    error => `Error: ${error}`
  )
```

### SvelteKit 集成

```typescript
// src/hooks.server.ts
import { createHandle, authGuard, rateLimitMiddleware } from '@hai/kit'

export const handle = createHandle({
  logging: true,
  middleware: [
    rateLimitMiddleware({ windowMs: 60000, maxRequests: 100 })
  ],
  guards: [
    { guard: authGuard(), paths: ['/admin/*'] }
  ]
})
```

### Svelte 5 组件

```svelte
<script lang="ts">
  import { Button, Input, Modal } from '@hai/ui'
  
  let open = $state(false)
  let name = $state('')
</script>

<Button onclick={() => open = true}>打开弹窗</Button>

<Modal bind:open title="输入名称">
  <Input bind:value={name} placeholder="请输入名称" />
  <svelte:fragment slot="footer">
    <Button variant="ghost" onclick={() => open = false}>取消</Button>
    <Button onclick={() => console.log(name)}>确认</Button>
  </svelte:fragment>
</Modal>
```

### AI 技能

```typescript
import { z } from 'zod'
import { defineSkill, SkillRegistry } from '@hai/skills'

const searchSkill = defineSkill({
  name: 'search',
  description: '搜索内容',
  schema: z.object({
    query: z.string().describe('搜索关键词'),
  }),
  handler: async ({ query }) => {
    // 执行搜索
    return { results: [] }
  },
})

const registry = new SkillRegistry()
registry.register(searchSkill)
```

## 🔧 CLI 命令

```bash
# 创建项目
hai create <name> [--template <template>]

# 生成代码
hai generate page <name>       # 生成页面
hai generate component <name>  # 生成组件
hai generate api <name>        # 生成 API
hai generate model <name>      # 生成数据模型
hai generate skill <name>      # 生成 AI 技能
hai generate migration <name>  # 生成数据库迁移

# 快捷命令
hai g:page dashboard
hai g:component UserCard
hai g:api users
```

## 🏗️ 项目结构

```
hai-framework/
├── packages/
│   ├── core/       # 核心工具
│   ├── config/     # 配置管理
│   ├── crypto/     # 加密模块
│   ├── db/         # 数据库
│   ├── auth/       # 认证授权
│   ├── ai/         # AI 集成
│   ├── skills/     # 技能系统
│   ├── mcp/        # MCP 协议
│   ├── storage/    # 文件存储
│   ├── ui/         # UI 组件
│   ├── kit/        # SvelteKit 集成
│   └── cli/        # CLI 工具
├── apps/
│   └── admin-console/  # 示例应用
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## 📋 技术栈

- **运行时**: Node.js v20+
- **包管理**: pnpm 9.x workspaces
- **框架**: SvelteKit 2.x
- **UI**: Svelte 5 Runes
- **语言**: TypeScript 5.7+ (strict mode)
- **验证**: Zod 3.x
- **日志**: Pino 9.x
- **ORM**: Drizzle ORM
- **加密**: sm-crypto (国密算法) + @noble/hashes (Argon2)
- **JWT**: jose
- **AI**: OpenAI SDK
- **MCP**: @modelcontextprotocol/sdk
- **构建**: tsup, Turbo
- **测试**: Vitest 2.x

## 🔐 安全特性

- **E2EE 登录**: 前端使用 SM2 公钥加密密码，服务端解密后 Argon2 验证
- **会话管理**: Cookie + 数据库 token hash 存储
- **国密算法**: SM2 非对称加密、SM3 哈希、SM4 对称加密
- **CSRF 防护**: 内置 CSRF 中间件
- **速率限制**: 可配置的请求速率限制

## 📝 开发

```bash
# 克隆仓库
git clone https://github.com/hai-framework/hai.git
cd hai

# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 运行测试
pnpm test

# 启动示例应用
pnpm --filter admin-console dev
```

## 📄 License

MIT © 2024 hai Admin Framework

---

<p align="center">
  Made with ❤️ for modern web development
</p>
