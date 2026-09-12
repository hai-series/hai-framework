# hai-build — 详细用法

从 [SKILL.md](SKILL.md) 选择主题后读取对应小节。代码片段展示 API 用法；省略的业务变量、schema、依赖与 return 上下文需由应用补齐。

框架开发、CLI、服务端最低 Node.js 版本统一为 22.12.0；包与脚手架 engines、共享 node22 编译目标和 CI 最低版本必须同步。不再按 Node 20 编写兼容分支。

tsup 包的 Turbo `build` 依赖不缓存的 `build:clean`（仅清本包 dist），再执行构建或恢复缓存。不要移除此步骤：Turbo 缓存恢复不会自动移除另一模式的多余文件。

使用 Turbo 时，影响构建的环境变量必须进入任务 `env`，共享构建配置进入 `globalDependencies`。框架的 `HAI_DOCKER_PROD_BUILD=true` 关闭声明和 sourcemap，应与普通构建使用不同缓存；PUBLIC/VITE/TAURI 变量同样参与构建缓存。切换后验证实际产物并恢复普通开发构建。

> 本技能是 hai-framework 应用开发的起点。帮助理解项目结构、定位正确的技能、并遵循 **TDD 驱动的标准工作流**。支持 SSR Web、SPA、Android/iOS 原生 App 等多端构建。

## 适用场景

- 初次接触项目，需要了解整体架构与模块关系
- 不确定应使用哪个技能来完成任务
- 需要了解模块初始化顺序与依赖关系
- 需要执行跨模块操作或全局配置变更
- 多端构建切换（SSR ↔ SPA ↔ 原生 App）

## 项目架构

### 技术栈

| 层次     | 技术                           |
| -------- | ------------------------------ |
| 框架     | SvelteKit 2 + Svelte 5 (Runes) |
| 样式     | TailwindCSS 4 + DaisyUI 5      |
| 语言     | TypeScript 5.7+ (strict)       |
| 构建     | Vite + tsup                    |
| 包管理   | pnpm                           |
| 单元测试 | Vitest                         |
| E2E 测试 | Playwright                     |
| 原生 App | Capacitor 7                    |
| 公共 API | oRPC contract + Hono + typed client |
| 认证     | Bearer access token + httpOnly refresh cookie（浏览器推荐） |

### 多端构建模式

| 模式    | Adapter        | 认证方式              | 部署目标                |
| ------- | -------------- | --------------------- | ----------------------- |
| SSR Web | adapter-node   | Bearer access token + Cookie | Node.js 服务器          |
| SPA     | adapter-static | Bearer access token + httpOnly refresh cookie | CDN / 静态托管          |
| Android | adapter-static | Bearer access token + Capacitor secure storage | Capacitor → Android APK |
| iOS     | adapter-static | Bearer access token + Capacitor secure storage | Capacitor → iOS IPA     |

**Adapter 切换**：

```typescript
// svelte.config.js — 使用 kit 提供的 createAdapter
import { createAdapter } from '@h-ai/kit/adapter'

const config = {
  kit: {
    adapter: createAdapter(), // 根据 VITE_ADAPTER 环境变量自动选择
  },
}
```

- `VITE_ADAPTER=node`（默认）→ adapter-node（SSR）
- `VITE_ADAPTER=static` → adapter-static（SPA / 原生 App）

### 目录结构

```
项目根/
  config/                         # 模块配置（YAML）
    _core.yml                     # Core 配置（必须）
    _db.yml                       # DB 配置（按需）
    _cache.yml                    # Cache 配置（按需）
    _iam.yml                      # IAM 配置（按需）
    _storage.yml                  # Storage 配置（按需）
    _ai.yml                       # AI 配置（按需）
  src/
    app.html                      # HTML 入口
    app.d.ts                      # 全局类型声明
    hooks.server.ts               # 服务端 Hook（模块初始化 + 请求管道）
    lib/
      api.ts                      # @h-ai/api-client 初始化（SPA / 原生 App 使用）
      capacitor.ts                # Capacitor 初始化（原生 App）
      server/
        init.ts                   # 模块初始化入口（单例，SSR）
        procedures/               # 应用私有 oRPC procedures（仅 API Service 场景）
      paraglide/                  # i18n 生成文件（禁止手动修改）
      components/                 # 应用组件
    routes/
      +layout.svelte              # 根布局
      +page.svelte                # 首页
      (auth)/                     # 认证相关页面组
      api/                        # API 端点
        v1/                       # API v1 版本
          payment/                # 支付端点（按需）
  static/                         # 静态资源
  messages/                       # i18n 翻译文件
  capacitor.config.ts             # Capacitor 配置（原生 App）
```

### 模块依赖图

```
core（基础能力：配置、日志、i18n、HaiResult）
  ├── crypto（加密：SM2/SM3/SM4）
  ├── db（数据库：SQLite/PostgreSQL/MySQL）
  ├── cache（缓存：内存/Redis）
  ├── storage（存储：本地/S3）
  ├── ai（AI：LLM/MCP/Agent）
  ├── iam（身份管理）← 依赖 crypto + db + cache
  ├── payment（支付）← 依赖 db + crypto
  ├── api-contract（公共 HTTP API 契约）← 纯定义，依赖 core + zod + oRPC contract
  ├── serv（Hono + oRPC API Service）← 依赖 api-contract；features 按需依赖 iam/storage/ai
  ├── kit（SvelteKit 集成）← Hook / guard / validate / response，不定义公共 contract
  ├── api-client（typed API 客户端）← 依赖 api-contract + oRPC client
  ├── capacitor（原生能力）← 纯浏览器端
  └── ui（UI 组件库）← 依赖 core
```

### 模块初始化顺序

#### SSR 模式（hooks.server.ts）

在 `src/lib/server/init.ts` 中按依赖顺序初始化：

```typescript
import { core } from '@h-ai/core'
import { cache, CacheConfigSchema } from '@h-ai/cache'
import { reldb, ReldbConfigSchema } from '@h-ai/reldb'
import { iam, IamConfigSchema } from '@h-ai/iam'

// 放入应用已有的启动函数；并发防护和关闭钩子复用当前模板。
core.init({ configDir: './config' })
const dbConfig = core.config.validate('db', ReldbConfigSchema)
if (!dbConfig.success) return dbConfig
const cacheConfig = core.config.validate('cache', CacheConfigSchema)
if (!cacheConfig.success) return cacheConfig
const iamConfig = core.config.validate('iam', IamConfigSchema)
if (!iamConfig.success) return iamConfig
const db = await reldb.init(dbConfig.data)
if (!db.success) return db
const cached = await cache.init(cacheConfig.data)
if (!cached.success) {
  await reldb.close()
  return cached
}
const identity = await iam.init(iamConfig.data)
if (!identity.success) {
  await cache.close()
  await reldb.close()
  return identity
}
// 应用结束时 await iam.close()、cache.close()、reldb.close()；
// 检查关闭结果；core 无 close，kit/api-contract/serv 不需要 init。
```

#### SPA / 原生 App 模式（src/lib/api.ts）

```typescript
import { apiClient } from '@h-ai/api-client'

export async function initApi() {
  return apiClient.init({
    baseUrl: import.meta.env.VITE_API_BASE_URL,
    auth: {}, // 浏览器默认 httpOnly cookie；原生 App 传入 Capacitor TokenStorage
    timeout: 15_000,
  })
}

export { apiClient }
```

#### 原生 App 追加初始化（src/lib/capacitor.ts）

```typescript
import { capacitor } from '@h-ai/capacitor'

export async function initCapacitor() {
  const initialized = await capacitor.init()
  if (!initialized.success) return initialized
  return capacitor.statusBar.configure({ style: 'dark' })
}
```

### 配置文件格式

所有模块配置使用 YAML 保存默认值；`HAI_<配置名>_<YAML 路径>` 环境变量
自动覆盖对应叶子项，且优先级更高：

```yaml
# config/_core.yml
name: my-app
env: development
logging:
  level: info
```

以上字段分别对应 `HAI_CORE_NAME`、`HAI_CORE_ENV`、
`HAI_CORE_LOGGING_LEVEL`。

## 技能导航

根据任务类型选择正确的技能：

### 模块使用（API 与集成）

| 任务                  | 技能             | 触发关键词                                        |
| --------------------- | ---------------- | ------------------------------------------------- |
| 配置/日志/i18n/HaiResult | `hai-core`       | core.init, core.logger, core.config, HaiResult       |
| 数据库操作            | `hai-reldb`      | reldb.init, SQL, CRUD, 事务, 分页, DDL               |
| 缓存操作              | `hai-cache`      | cache.init, cache.kv.get/set, TTL, Redis             |
| 文件存储              | `hai-storage`    | storage.init, 上传, 下载, S3, 本地存储            |
| 加密/签名/哈希        | `hai-crypto`     | crypto.init, SM2, SM3, SM4, 加密, 签名            |
| 身份认证/授权         | `hai-iam`        | iam.init, 登录, 注册, RBAC, Token, Bearer         |
| AI/LLM/MCP            | `hai-ai`         | ai.init, LLM, MCP, Agent, 工具调用                |
| 公共 API 契约         | `hai-api-contract` | apiContract.create, contract, schema, oRPC, HaiResult |
| API Service 运行时    | `hai-serv`       | serv.createApp, Hono, procedures, OpenAPI, docs, route guard |
| SvelteKit 集成        | `hai-kit`        | kit.createHandle, guard, middleware, validate, response |
| UI 组件               | `hai-ui`         | 表单, 按钮, 表格, Modal, Toast, 移动端组件        |
| typed API 客户端      | `hai-api-client` | apiClient.init, typed client, Bearer, 401 refresh, custom fetch |
| 原生 App 能力         | `hai-capacitor`  | capacitor, 相机, 推送, 状态栏, 设备信息           |
| 支付                  | `hai-payment`    | payment, 微信支付, 支付宝, Stripe, 订单           |

### 开发流程

| 任务                   | 技能             | 触发关键词                             |
| ---------------------- | ---------------- | -------------------------------------- |
| 创建页面/组件/API/模型 | `hai-app-create` | 新建页面, 添加组件, API 端点, 数据模型 |
| 代码审查与规范化       | `hai-app-review` | 审查, review, 规范, 优化               |
| 编写/补充测试          | `hai-app-tests`  | 测试, test, 单测, 覆盖率, TDD, E2E     |
| CI/CD 与质量门禁       | `hai-ci`         | CI, CD, GitHub Actions, workflow, secret scan |
| PR / Issue 交付审查    | `hai-pr-review`  | PR, pull request, issue, CODEOWNERS, 自动 Review, AI Review |
| hai-framework 同步     | `hai-framework-sync` | hai-framework, skills 同步, framework:use:local, framework:watch |

## TDD 开发工作流（强制）

> 所有新功能开发必须遵循 TDD：**先写测试 → 确认失败 → 再实现 → 确认通过 → 重构**。

### 完整流程

```
需求分析 → 设计测试用例 → 编写测试（Red）→ 运行测试确认失败
    → 编写实现（Green）→ 运行测试确认通过
    → 重构优化（Refactor）→ 运行质量门禁
```

### 按阶段使用的技能

| 阶段                | 主要技能         | 说明                                       |
| ------------------- | ---------------- | ------------------------------------------ |
| 需求分析 + 测试设计 | `hai-app-tests`  | 拆分测试点，确定单元测试与 E2E 测试        |
| Red：编写测试       | `hai-app-tests`  | 编写 Vitest 单元测试 + Playwright E2E 测试 |
| Green：编写实现     | `hai-app-create` | 按照创建规范编写服务/路由/组件             |
| Refactor：重构审查  | `hai-app-review` | 代码规范审查、分层检查、日志/i18n 合规     |

### 快速指令

```bash
# Red：运行测试确认新增目标用例因预期行为缺失而失败（既有回归保持通过）
pnpm --filter <app-name> test
pnpm --filter <app-name> test:e2e

# Green：运行测试确认全部通过
pnpm --filter <app-name> test
pnpm --filter <app-name> test:e2e

# Refactor：质量门禁
pnpm typecheck && pnpm lint && pnpm test
```

## 统一编码规范

### 强制规则

- **禁止 `any`**：不确定类型用 `unknown`，在边界处做类型缩窄
- **禁止 `console.log`**：使用 `core.logger`（trace/debug/info/warn/error/fatal）
- **禁止硬编码密钥**：使用环境变量，新增变量需在 `.env` 中写入占位符
- **禁止硬编码用户文案**：所有用户可见文本必须使用 i18n key
- **禁止修改 `src/lib/paraglide`** 生成文件

### HaiResult 模式

返回 `HaiResult<T>` 的领域操作按以下模式处理；工具、工厂和流式 API 以签名为准：

```typescript
const result = await reldb.sql.query('SELECT * FROM users')
if (!result.success) {
  // result.error: { code, message, details? }
  core.logger.error('Query failed', { error: result.error })
  return kit.response.internalError()
}
// result.data 可安全使用
return kit.response.ok(result.data)
```

### 质量门禁

每次变更后按顺序执行：

```bash
pnpm typecheck    # TypeScript 类型检查
pnpm lint         # ESLint 检查
pnpm test         # Vitest 单元测试
```

## 标准工作流

### 变更前：需求分析 + 测试设计

1. 列出将修改的文件路径
2. 确认哪些类型/接口会变
3. 搜索确认引用关系（避免遗漏）
4. **设计测试用例清单**（单元测试 + E2E 测试）

### 变更中：TDD 三步走

1. **Red**：编写单元测试（Vitest）+ E2E 测试（Playwright），确认新增目标用例失败、既有回归通过
2. **Green**：按技能指引完成功能实现，逐步让测试通过
3. **Refactor**：审查代码规范、重构优化

### 变更后：验证

1. `pnpm typecheck` 通过
2. `pnpm lint` 通过
3. `pnpm test` 通过（单元测试）
4. `pnpm --filter <app-name> test:e2e` 通过（E2E 测试）
5. 搜索确认所有引用点已更新

原生交付必须单独执行 Tauri/Gradle/Xcode 打包，并在目标 OS/设备验证安装启动、登录/退出、重启会话、安全 TokenStore、真实 API 域名与覆盖升级。Web 构建/E2E 不代替原生验收。保存提交、包 hash、平台/工具链及逐项结果；缺平台写未验证，禁止静默 skip。hai-framework 仓库参考 `.github/workflows/native.yml` 与 desktop-app / mobile-app README 的「原生交付与验收」章节。
