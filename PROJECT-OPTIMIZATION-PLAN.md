# hai-framework 全面优化执行方案

> 目标：在不打折执行的前提下，系统性完成模块能力梳理、依赖治理、代码风格统一、功能修复、CLI 重写与 admin-console 完整可用化。

---

## 一、项目现状与模块定位

### 1.1 模块功能总览

| 模块                 | 功能定位                                              | 依赖                    | 当前状态                        |
| -------------------- | ----------------------------------------------------- | ----------------------- | ------------------------------- |
| `@hai/core`          | 基础能力层：Result、logger、config、i18n、工具函数    | 无                      | 稳定，作为基线                  |
| `@hai/crypto`        | 国密能力：SM2/SM3/SM4、密码哈希                       | core                    | 基本完善                        |
| `@hai/cache`         | 缓存能力：Memory/Redis Provider                       | core                    | 基本完善                        |
| `@hai/db`            | 数据访问：SQLite/PostgreSQL/MySQL、DDL/CRUD/事务/分页 | core                    | 基本完善                        |
| `@hai/storage`       | 对象存储：Local/S3、presign、浏览器上传下载           | core                    | 基本完善                        |
| `@hai/ai`            | AI 能力：LLM、MCP、Tools、Client                      | core                    | 基本完善                        |
| `@hai/iam`           | 身份权限：认证/授权/会话/用户管理                     | core, db, cache, crypto | 需补齐用户列表等能力            |
| `@hai/kit`           | SvelteKit 集成：hooks/guard/middleware/response       | core, db, cache, iam    | 基本完善                        |
| `@hai/ui`            | Svelte 组件库：primitives/compounds/scenes + i18n     | core                    | 基本完善                        |
| `@hai/cli`           | 工程化 CLI                                            | core                    | 需完全重写（文档缺失）          |
| `apps/admin-console` | 示例管理控制台                                        | 全部模块                | 存在 i18n、复用、功能完整性问题 |

### 1.2 依赖分层图

```text
Layer 0: @hai/core
Layer 1: @hai/crypto @hai/cache @hai/db @hai/storage @hai/ai
Layer 2: @hai/iam (→ core, db, cache, crypto)
Layer 3: @hai/kit (→ core, db, cache, iam), @hai/ui (→ core)
Layer 4: @hai/cli (→ core，调度模板与模块选择)
Layer 5: apps/admin-console (→ 全部)
```

---

## 二、执行原则（强约束）

1. **先分析后改动**：每次改动先写直接影响与间接影响。
2. **成套更新**：代码 / 测试 / 文档 同步。
3. **质量门禁顺序固定**：`pnpm typecheck` → `pnpm lint` → `pnpm test`。
4. **引用可追溯**：引用点必须通过检索确认，不靠猜测。
5. **统一风格**：遵守 `hai-create`、`hai-annotations`、`hai-tests`、`hai-review`。
6. **依赖影响评估**：被依赖模块变更后，必须复核依赖它的所有模块。

---

## 三、分阶段执行计划

## 阶段 A：模块功能梳理与 README/SKILLS 对齐

### A.1 目标

- 扫描 `packages/*` 代码与文档，明确每个模块“做什么、怎么用、边界是什么”。
- 将功能定义回写到对应 `README.md`（面向人）与 `SKILLS.md`（面向 AI）。

### A.2 输出物

- 各模块更新后的 `README.md`
- 各模块更新后的 `SKILLS.md`
- `@hai/cli` 新增 `README.md` 与 `SKILLS.md`

### A.3 验收标准

- README 只保留“是什么/怎么用”，不写内部实现清单。
- SKILLS 包含：模块概述、初始化与关闭、目录结构、配置、接口参数、错误码、注意事项。
- 文档内容与实际代码一致。

---

## 阶段 B：模块依赖治理与变更评估机制

### B.1 目标

- 明确模块间依赖方向，固化“上层依赖下层，基础层不反向依赖上层”。
- 建立“依赖模块变更 → 被依赖模块回归检查”机制。

### B.2 关键动作

- 核查每个 `package.json` 的依赖声明是否最小且准确。
- 检查跨模块 import 是否符合分层约束。
- 在根文档中维护依赖关系图与回归检查策略。

### B.3 验收标准

- 无循环依赖。
- 无违反分层的跨层调用。
- 依赖图和实际代码一致。

---

## 阶段 C：代码风格统一优化（按层次自底向上）

### C.1 涵盖模块

`core → crypto/cache/db/storage/ai → iam → kit/ui`

### C.2 统一项

- `index.ts` 仅做 `export *` 聚合。
- 对外类型集中在 `xx-types.ts`，禁止 `any`。
- `init/close` 生命周期规范、日志级别规范。
- return 不嵌套复杂逻辑，优先 early return。
- Provider 统一工厂 + 闭包模式（避免 class）。
- 公共 API 与关键内部函数补齐中文 JSDoc。

### C.3 验收标准

- 风格一致性显著提升。
- 无 `console.log`。
- i18n、日志、错误码、类型规范符合技能要求。

---

## 阶段 D：功能审查与缺陷修复

### D.1 目标

- 以“真实可用”为标准，修复功能不完整与逻辑错误。

### D.2 优先修复

- `@hai/iam`：补齐用户列表（分页/搜索/筛选），完善管理员侧用户管理能力。
- 角色/权限/会话相关边界行为与错误码一致性。
- 配置校验时机与错误提示统一。

### D.3 验收标准

- 关键业务路径可用。
- Result 错误分支可预测、可测试。
- 与上层应用集成无断点。

---

## 阶段 E：CLI 模块重写（重点）

> 说明：按你的要求，CLI 因特殊性不必完全受前述 skills 约束，但仍需保持可维护与可测试。

### E.1 目标

构建类 Svelte CLI 的引导式体验：

- 交互式选择启用模块
- 生成对应示例工程（如 `apps/admin-console` 风格）
- 支持模块增量启用

### E.2 命令设计（建议）

- `hai create`：创建新工程（交互式）
- `hai add <module>`：向现有工程增量启用模块
- `hai init`：初始化/校验配置

### E.3 交互流程

1. 项目名与包管理器
2. 选择模块（db/cache/storage/iam/ai/crypto/ui/kit）
3. 选择 provider（如 db/cache/storage）
4. 生成配置文件与初始化代码
5. 生成页面/路由/API 示例
6. 安装依赖并输出下一步指引

### E.4 验收标准

- 可从 0 到 1 生成可启动项目。
- 选择不同模块组合可得到不同工程结构。
- 生成内容可通过 typecheck/lint/test。

---

## 阶段 F：admin-console 全面完善

### F.1 目标

1. 杜绝重复造轮子，最大化复用 `@hai/*` 与 `@hai/ui`。
2. 根据 CLI 的“选择性启用”能力动态加载模块。
3. 提升页面布局与代码规范一致性。
4. 功能完整可用，不留 TODO/空实现。

### F.2 已识别重点问题

- API 与服务层存在较多硬编码文案（需 i18n 化）。
- 存在重复验证逻辑（应统一 schema/validator）。
- 局部功能为存根实现（用户列表、删除、重置密码等）。
- 存在遗留页面/测试与真实流程不一致。

### F.3 改造方向

- 统一复用 `@hai/kit` 的校验、响应、middleware/guard。
- 统一复用 `@hai/ui` 组件，不重复实现 UI 逻辑。
- 模块能力按配置动态启停：菜单、路由、初始化联动。
- 管理台 API 与页面以真实业务流程为驱动。

### F.4 验收标准

- 关键业务（登录、用户/角色/权限管理、设置、模块演示）完整可用。
- 页面结构、状态管理、错误处理一致。
- 与 CLI 生成的模块启用配置一致工作。

---

## 阶段 G：E2E 测试全面补强（Playwright）

### G.1 原则

- 从真实场景出发模拟操作，不为通过测试而伪造流程。
- 每个页面具备 API + UI 两类测试。
- 覆盖正常路径 + 关键异常路径。

### G.2 覆盖范围

- 认证全流程：注册、登录、登出、找回/重置密码。
- IAM 全流程：用户、角色、权限 CRUD 与联动。
- Dashboard：统计、快捷操作、最近活动。
- Settings / Modules / UI Gallery：核心交互与可见性。
- 路由守卫、权限控制、错误提示。

### G.3 验收标准

- 所有测试稳定通过。
- 测试数据生命周期可控、可重复执行。
- 能真实反映生产行为。

---

## 阶段 H：全局质量门禁与收尾

### H.1 必跑项

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- admin-console e2e（Playwright）

### H.2 复核项

- 引用点是否全部同步更新。
- README / SKILLS / 代码行为是否一致。
- 依赖变更是否完成下游回归检查。

### H.3 交付标准

- 功能可用、风格统一、测试通过、文档完整。
