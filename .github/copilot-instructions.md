# Copilot 工作规范（hai-framework）

> 本文件用于约束 AI 助手在本仓库中的工作方式，目标是：**可维护、可审计、可测试、可扩展**。
>
> 适用范围：本仓库所有 packages、apps、docs。

---

## 使用说明（务必遵循）

- **必须/禁止/优先/可选** 为强度约束词：
  - **必须/禁止**：强制要求，不可违反。
  - **优先**：默认选择，除非有明确理由。
  - **可选**：在需要时执行。
- 若与用户请求冲突，以用户请求优先，但需说明影响并给出最小可行替代。

---

## 执行基线（每次改动都必须满足）

- **先思考，后动手**：改动前先做影响分析，确认依赖方向与边界。
- **必须成套更新**：代码 / 测试 / 文档 同步；禁止“只改一处”。
- **必须可验证**：改动后跑完质量门禁（typecheck → lint → test）。
- **必须可追溯**：所有“引用关系”用 `grep_search` 搜索确认，不靠猜。
- **必须对齐 core 规范**：core 作为全局基础能力，所有模块需与其 API/行为保持一致（见“核心审查重点”）。

---

## 标准工作流（按顺序执行）

### 变更前：影响分析（必须写出来）

在动手改代码之前，输出以下清单，作为本次变更的“设计说明”。

#### 直接影响

- 文件：将修改哪些文件？（列出路径）
- 类型/接口：哪些对外接口/类型会变？哪些需要同步更新？（列出名称与导出点）
- 导入：哪些 import 需要新增/删除/改路径/改命名？

#### 间接影响（必须用搜索确认）

- 引用点：哪些文件引用了被修改的模块？（用 `grep_search` 列出关键引用位置）
- 测试：哪些测试需要更新/新增？（单测优先，必要时集成测试）
- 文档：哪些文档需要同步？（README / Skill 模板 / 本文件）

#### 一致性与分层（两组三问）

**命名三问**

- 看名字能知道它是做什么的吗？
- 会和项目中其他名字混淆吗？
- 6个月后还能理解这个名字的含义吗？

**模块划分三问**

- 这个函数/类属于哪一层？（UI / 业务 / 领域 / 基础设施 等）
- 它依赖了不该依赖的模块吗？（例如 UI 层依赖 DB/crypto）
- 能否独立测试？（是否可注入依赖、是否易于 mock）

若任何一项无法明确结论，必须走“澄清流程”。

### 变更后：质量门禁（必须按顺序执行）

必须逐条确认：

1. 命名、分层、导出、类型规则已满足
2. 日志/注释/用户文案符合语言与 i18n 规范
3. `pnpm typecheck` 通过
4. `pnpm lint` 通过
5. `pnpm test` 通过
6. 引用点已更新（用 `grep_search` 复核）
7. 文档已同步（README / Skill 模板 / 本文件）

#### 最小可执行命令清单（仓库根目录）

本仓库使用 Turbo + pnpm workspace 聚合执行：

- 类型检查：`pnpm typecheck`
- ESLint：`pnpm lint`
- 单元测试：`pnpm test`

可选：

- 自动修复 lint：`pnpm lint:fix`
- 覆盖率：`pnpm test:coverage`
- E2E 测试：`pnpm --filter admin-console test:e2e`
- 全量构建：`pnpm build`

只运行某个 package/app：优先使用 pnpm filter（示例：`pnpm --filter @h-ai/storage test`）。

---

## 编码约定（命名、导出、类型、分层、日志、i18n、安全）

### 文件命名与职责

- `xx-main.ts`：模块主入口（运行时对象 / 初始化 / 关闭等）。**必须保持精简**：仅包含生命周期管理（`init` / `close`）和 API 编排，**禁止在 main 中编写具体业务逻辑、调度循环、数据处理等重操作**。所有具体逻辑应委托给 `xx-functions.ts`、`xx-runner.ts` 或其他职责文件。
- `xx-types.ts`：对外接口类型定义（public types）
- `xx-config.ts`：对外配置定义与默认值

### 导出规则（强制）

- 导出统一使用 `export *`。
- 在源文件中控制导出边界；`index.ts` 仅做聚合：
  - ✅ `export * from './storage-main'`
  - ✅ `export * from './storage-types'`
  - ❌ 禁止在 `index.ts` 里选择性导出/重命名导出（除非强制兼容，并写清楚原因）

### 类型规则

- ❌ 禁止 `any`；不确定用 `unknown`，并在边界处做类型缩窄。
- 对外类型应集中在 `xx-types.ts`，避免把内部实现类型泄漏为 public API。

### 命名一致性

- 类名、文件名、变量名三者一致。
- 接口名与实现类名对应（例如 `StorageProvider` ↔ `S3StorageProvider`）。
- 重命名必须同步更新：引用点、测试、注释、文档。
- 禁止含糊命名（如 data / info / handle / process）。
- 统一命名模式（详见 hai-create §4.6）：
  - 服务对象：小写模块名（`export const storage`）
  - 函数接口：`{Module}Functions`；错误码：`{Module}ErrorCode`；错误类型：`{Module}Error`
  - 子操作接口：`{Domain}Operations`
  - Provider 接口：`{Module}Provider`；Provider 工厂：`create{Impl}Provider`
  - Repository 类：`{Module}{Entity}Repository`
  - i18n 获取器：`{缩写}M()`；消息键：`{module}_{camelCase}`

### 错误码段位

- 每个模块拥有独占的千位段错误码，禁止与已有模块冲突。
- `NOT_INITIALIZED` 固定为 `X010`。
- 完整段位注册表见 hai-create §3.1。新模块必须在注册表中选取未占用段位。

### 分层与依赖约束（架构红线）

- ❌ 禁止在 UI 层写业务逻辑，在 services 层写 UI 代码。
- 依赖方向必须向内收敛：上层可以依赖 Core 等基础能力，Core 不反向依赖上层。
- 引入新依赖前先确认是否已有同类能力，避免重复建设。
- 如各模块已有同类功能，必须优先复用，不得重复造轮子。
- 如 @h-ai/ui 已有组件，应用/业务层必须直接使用，不得重复实现。

### 文本、日志与 i18n

- 日志与 `package.json` 字段统一使用英文。
- 代码注释统一使用中文。
- ❌ 禁止 `console.log`：使用模块 logger（如 `core.logger` 或模块自身 logger），并尽量结构化输出。
- 所有用户可见字符串必须使用 i18n key（UI 文案、Toast、Alert、标题、按钮、校验提示、错误信息等）。
- ❌ 禁止直接修改 `src/lib/paraglide` 生成文件。

### @h-ai/ui 组件 i18n 规则

- **组件内置翻译**：`@h-ai/ui` 场景组件（`scenes/`）内置中英文翻译，自动响应全局 locale。
- **应用层只管页面级文本**：标题、错误提示、导航链接等由应用层 i18n 处理。
- **不要为 UI 组件传入翻译 props**：组件内部文本由 `@h-ai/ui` 统一管理。
- **可选覆盖**：通过 `submitText` 等 props 覆盖特定文本（如需要自定义按钮文字）。
- 翻译文件位于 `packages/ui/src/lib/messages/{zh-CN,en-US}.json`。

### 错误处理与异常规范

> 核心原则：**公共模块 API 不抛异常，统一返回 `Result<T, E>`**。

#### 禁止在公共 API 中 throw

- 所有 `packages/*/src/` 下对外暴露的函数/方法，返回值必须是 `Result<T, XxError>` 或 `Promise<Result<T, XxError>>`。
- ❌ 禁止在公共 API 中 `throw`；调用方不应使用 `try/catch` 来处理模块返回的错误。

#### 允许 throw 的场景（合规模式）

以下场景中的 `throw` 是合规的，不违反此规范：

| 场景                                     | 说明                                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **内部 throw + 外层 try-catch → Result** | 模块内部函数 throw，由外层 `try { } catch { return err(...) }` 转为 Result 返回。这是标准 catch-and-wrap 模式。 |
| **SvelteKit 控制流**                     | `throw redirect()`、`throw error()` 等 SvelteKit 框架约定的控制流用法。                                         |
| **浏览器端 Client 代码**                 | `client/xx-client.ts` 等浏览器端封装，不属于模块公共 API。                                                      |
| **CLI 命令**                             | `packages/cli/` 中的命令行工具，非模块 API。                                                                    |
| **`getOrThrow()` 等显式命名的函数**      | 函数名已明确表达会 throw 的语义。                                                                               |
| **async generator（如 `chatStream()`）** | 异步生成器无法返回 Result，只能 throw。需在 JSDoc 中注明。                                                      |

#### 使用模式

```ts
// ✅ 返回 Result
async function create(input: Input): Promise<Result<Item, XxError>> {
  try {
    const item = await doCreate(input)
    return ok(item)
  }
  catch (error) {
    return err({ code: XxErrorCode.CREATE_FAILED, message: xxM('xx_createFailed'), cause: error })
  }
}

// ❌ 公共 API 中直接 throw
function register(tool: Tool): void {
  if (!isInitialized)
    throw new Error('Not initialized')
  // ...
}

// ✅ 公共 API 中返回 Result
function register(tool: Tool): Result<void, XxError> {
  if (!isInitialized)
    return notInitialized.result()
  // ...
  return ok(undefined)
}
```

### 环境变量与密钥

- ❌ 禁止硬编码 API Key / 密钥。
- 使用环境变量读取；新增变量时：
  - 若仓库根目录缺少 `.env`，必须创建并写入占位符（不写真实值）。
  - 在对应模块文档说明变量用途与示例。

### 测试要求

- 每个新功能/修复必须有对应测试（Vitest）。
- 避免真实外部依赖：使用注入 + mock（网络/数据库/云服务不直连）。
- 变更边界行为时，补齐边界用例（空值、异常分支、权限、超时等）。
- 涉及跨端能力（Node/Browser）时，测试需拆分环境或显式隔离，避免互相污染。

---

## 核心审查重点（对齐 core 模块基线）

> 以下规范来自 core 模块审查结论，**所有模块必须对齐执行**。

### 初始化与入口一致性

- Node 与 Browser 的 API 形态必须一致，统一通过 `<模块名>.init(...)` 调用初始化。
- 浏览器端不暴露独立 init 函数；如需内部实现必须保持私有。

### 配置加载与校验

- `core.init` 会统一加载配置文件，但不会自动校验其他模块配置。
- **模块在使用配置前必须显式调用** `core.config.validate(name, schema)` 做合法性校验。
- 不允许在模块入口做隐式注册/自动校验（避免副作用和隐藏依赖）。

### 错误处理与异常

- 公共模块 API **禁止 throw**，必须返回 `Result<T, XxError>`。
- 允许在内部函数中 throw，但外层必须 catch 并转为 Result。
- 合规的 throw 场景：内部 throw + 外层 catch、SvelteKit 控制流、浏览器 Client、CLI、`getOrThrow()` 显式命名、async generator。
- 详细规范见"编码约定 > 错误处理与异常规范"。

### 导出与文档同步

- 公共入口只做 `export *` 聚合，避免新增隐式导出。
- 任何 API 变更必须同步 README / Skill 模板 / 测试。

### 日志与 i18n

- 统一使用 `core.logger`（或模块 logger），禁止 `console.log`。
- 用户可见文本必须走 i18n，不得在核心/模块中硬编码。

---

## 文档要求（README 与 Skill 模板）

- 各模块 README 的描述必须与实现一致。
- Skill 模板统一管理在 `packages/cli/templates/skills/` 中，通过 CLI 分发到用户项目。

### README（给人看的）

- 聚焦"是什么 / 怎么用"，以使用示例为主。
- 固定章节顺序：一句话描述 → 能力概览 → 快速开始 → API 契约（条件）→ API 概览（条件）→ 配置 → 错误处理 → 测试 → License。
- 快速开始必须包含 init → 核心操作 → close 完整生命周期。
- 不要包含完整接口清单、完整类型定义、内部实现细节。
- 详细规范见 `hai-create` Skill §6.1。

### Skill 模板（给 AI 看的）

- 位于 `packages/cli/templates/skills/hai-<模块名>/SKILL.md`。
- 必须包含：YAML frontmatter（name + description）、模块概述、使用步骤、核心 API、错误码、常见模式。
- 遵循 agentskills.io 标准。

---

## 澄清流程（遇到模糊需求时必须执行）

当需求不明确或存在多种实现路径时：

1. 列出“已知”与“不确定”要点
2. 用仓库检索验证假设（必要时使用 Context7 获取外部库权威用法）
3. 针对不确定点提出最小澄清问题（一次问最关键的 1-3 个）
4. 输出最小实现方案（可落地、可测试、可回滚）
5. 高风险假设必须标记：需确认

---

## 禁止事项（任一触发需立即修正）

- 只改一处，不改关联处
- 重命名后不更新引用点/测试/文档
- 添加用户可见文本但不走 i18n
- 修改架构但不更新 README / Skill 模板
- 提交 typecheck/lint/test 不通过的代码
- UI 层写业务逻辑，或 services 层写 UI 代码
- 在 `xx-main.ts` 中编写具体业务逻辑（调度循环、数据处理等），main 仅做生命周期管理和 API 编排
- 使用 `console.log`
- 硬编码密钥
- 使用 `any`
- 修改 `src/lib/paraglide` 生成文件
- README 描述内部实现细节
- 在公共模块 API 中使用 `throw`（必须返回 `Result<T, E>`）
- 用模块级 `Map` / `Set` 缓存需跨节点一致的业务数据（模板、锁、配置等），必须使用数据库持久化
- 错误码段位与已有模块冲突（段位注册表见 hai-create §3.1）
- 同一模块混用扁平方法与子操作对象两种 API 风格
- 做兼容性处理。目前处于开发期，不用考虑兼容旧版本
