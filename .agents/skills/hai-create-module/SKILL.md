---
name: hai-create-module
description: "在 hai-framework 源码仓库新增模块、子功能或 Provider，并维护公共契约。"
---

# hai-create-module — 模块创建决策手册

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 在 hai-framework 源码仓库新增模块、子功能或 Provider，并维护公共契约 |
| 适用场景 | 框架源码 packages 内新增能力 |
| 输入 | 真实调用需求、目标 packages 路径、现有模块和导出约定 |
| 输出 | 符合模块类型的实现、类型、错误定义、测试和文档 |
| 限制 | 先决定生命周期/纯函数/工厂类型；无多个真实实现时不新增 Provider 抽象。错误命名空间不可冲突。 |

> 面向 AI 助手的模块创建指南。**本文档只含决策表与原则**；代码范本（main.ts、types.ts、config.ts、package.json 等可直接套用的模板）请按需读 [reference.md](reference.md)。
>
> 模块通用约束（命名、暴露形式、HaiResult、NotInitializedKit、日志、错误码段位）见 [.agents/instructions/module-conventions.md](../../instructions/module-conventions.md)（按 AGENTS.md 路由读取）。
>
> **变量约定**：`xx` = 模块名（如 storage、iam），`yy` / `zz` = 子功能名，`aaa` = Provider 实现名。

## §1 架构决策（按顺序回答）

### 前置：模块类型

| 类型 | 特征 | 代表模块 |
| --- | --- | --- |
| **生命周期单例** | `export const xx: XxFunctions`，有 init/close | reldb, storage, cache, ai, iam, payment, crypto, capacitor, vecdb, audit, scheduler, reach, deploy, api-client |
| **纯函数/定义模块** | 无 init/close，工具按签名返回 | datapipe、api-contract、kit |
| **工厂/组件** | 生命周期由应用管理 | serv、ui |
| **基础设施模块** | 提供底层能力（日志、配置、i18n、HaiResult） | core |

### 决策红线（任一命中即停手）

- 没有第二个真实实现 → **不引入 Provider / 抽象接口 / 策略层**
- 操作域划分不能降低使用成本 → 保留简单 API，不机械拆分
- 没有跨文件复用 → **不提前提取 utils / helper / constants**
- 没有真实消费或扩展契约 → **不增加公共类型、函数、配置项**；内部跨文件复用可 export，但不自动经包入口公开。
- 只是转发上游能力 → **不要求使用方手写样板转发**

### 问题 1：是否有子功能？

| 判断 | main.ts 模式 | 说明 |
| --- | --- | --- |
| 无子功能 | main.ts 直接管理操作 | 操作接口在 xx-types.ts 定义，由 functions.ts 或 Provider 实现 |
| 有子功能 | main.ts 通过工厂创建子功能 | 各子功能在独立目录，通过 `get` 访问器暴露 |

### 问题 2：是否需要 Provider？

> Provider 是高成本抽象。**只有同 PR/仓库内已有 ≥2 个真实后端**时才用。禁止"先抽出来以后可能用"。

| 判断 | Provider 位置 |
| --- | --- |
| 不需要 | 无 Provider，功能直接实现 |
| 需要 + 无子功能 | `src/providers/xx-provider-aaa.ts`，由 main.ts 管理 |
| 需要 + 有子功能 | `src/yy/providers/xx-yy-provider-aaa.ts`，由子功能工厂内部管理，main.ts 不感知 |

### 组合速查 → 选 main.ts 模板

| 子功能 | Provider | main.ts 写法 | 范本 |
| --- | --- | --- | --- |
| 无 | 无 | 直接实现 | `reference.md` §R3.1 |
| 无 | 有（模块级） | Provider 委托 | `reference.md` §R3.2 |
| 有 | 无 或 有（子功能级） | 工厂创建子功能 | `reference.md` §R3.3 |

### 问题 3：API 风格——扁平方法 vs 子操作对象？

> **默认优先扁平 API**。只有分组能明显降低理解成本时才用子操作对象。

| 判断 | 风格 | 示例模块 |
| --- | --- | --- |
| 操作可按领域分 ≥2 组且每组 ≥2 个方法 | 子操作对象（getter） | reldb (sql/ddl/crud/tx), cache (kv/hash/list/set_/zset), ai (llm/tools/embedding/...), iam (auth/authz/user/session), crypto (asymmetric/hash/symmetric/password), capacitor (device/camera/push/statusBar/preferences), vecdb (collection/vector) |
| 操作少（≤6）或语义高度内聚 | 扁平方法 | payment, audit, scheduler, deploy, reach |

按职责保持一致；生命周期、getter、工厂与业务操作可以有不同返回契约，不因形式统一增加包装。

## §2 目录结构

按模块类型复用相邻模块的真实布局；范本见 [reference.md](reference.md)。不要在确认消费者前创建空目录或 Provider 层。

## §3 命名规范

文件、服务对象、类型、表名与缓存键遵守 [模块规范](../../instructions/module-conventions.md#命名一致性)。公开入口、内部状态与客户端契约分开；已有上游类型直接复用。

## §4 错误码段位（注册表）

> 详细 ErrorInfo 格式与 Schema 模板见 `reference.md` §R1-R2。

- 每模块通过 `buildHaiErrorsDef('module', ErrorInfo)` 生成，格式 `hai:{module}:{NNN}`。
- ErrorInfo 值格式 `'NNN:HTTP'`，NNN 三位编号，HTTP 为状态码。
- 新生命周期模块 `NOT_INITIALIZED` 使用 `010`；既有命名空间以源码为准（如 common 为 001），不要仅为统一数字改动公共错误码。
- 段位规则：通用 000-009、初始化 010-019、业务操作 020+。

**已注册命名空间**：

| 命名空间 | 模块 | 说明 |
| --- | --- | --- |
| `hai:common` | core | 通用错误 |
| `hai:core` | core | 配置错误 |
| `hai:api-client` | api-client | HTTP 客户端 |
| `hai:crypto` | crypto | 加密/签名/哈希 |
| `hai:reldb` | reldb | 关系数据库 |
| `hai:vecdb` | vecdb | 向量数据库 |
| `hai:cache` | cache | 缓存 |
| `hai:iam` | iam | 身份认证与授权 |
| `hai:storage` | storage | 对象存储 |
| `hai:payment` | payment | 支付 |
| `hai:capacitor` | capacitor | 移动端原生 |
| `hai:reach` | reach | 消息触达 |
| `hai:datapipe` | datapipe | 数据管道 |
| `hai:deploy` | deploy | 部署 |
| `hai:audit` | audit | 审计 |
| `hai:scheduler` | scheduler | 定时任务 |
| `hai:ai` | ai | AI / LLM / RAG / MCP |

### 分环境配置

修改公开 Schema 或变量入口后，构建受影响模块，执行 `pnpm generate:env` 同步根清单、CLI 元数据和示例，再用 `pnpm check:env` 验证；不要读取或生成真实私有凭据。

- 运行参数使用 `HAI_<配置名>_<字段路径>`，camelCase 不拆词；YAML 显式引用并保留本地回退，逐项同步根及项目 `.env.example` 的用途、默认值、枚举与范围。`PUBLIC_` / `VITE_` 不包含密钥。
- `.env.example`、公共基础 `.env` 和环境覆盖 `.env.dev` / `.env.test` / `.env.prod` 提交 Git；`.env.local` 只保存本机私有覆盖并忽略。优先级为进程环境 > `.env.local` > 环境文件 > `.env`。
- Vite 在 Node 配置阶段检查 `core.config.loadEnvFiles` 的结果后注入；Node 脚本按同样顺序传入环境文件。`core.init` 不读取 dotenv。连接配置支持仅改环境变量切换 Provider，文案、表名和数据结构留在代码/YAML。具体约束见 [环境配置](../../../packages/cli/templates/skills/hai-app-create/development.md#环境配置)。

## §5 实施步骤（套用范本）

按下列顺序生成文件，每一步对应 `reference.md` 范本：

1. **架构决策**（§1）→ 选定模块类型 / 子功能 / Provider / API 风格
2. **目录骨架**（§2）→ 创建文件夹与空文件
3. **`xx-config.ts`** → R1
4. **`messages/{zh-CN,en-US}.json`** → R5
5. **`xx-i18n.ts`** → R4.4
6. **`xx-types.ts`** → R2
7. **子功能 types + functions**（如有）→ R4.1
8. **Provider 实现**（如需）→ R4.2
9. **Repository 实现**（如需）→ R4.3
10. **`xx-main.ts`** → R3.1/R3.2/R3.3
11. **公开入口** → 根据 package.exports 选择公共符号；全量源文件确为公共契约时才 export *，允许 selective/type-only/Svelte 默认转发与 client/server 条件分隔。内部 Provider/Deps 不经公共 barrel；保留真实扩展接口。
12. **Client / API 契约**（如有）→ R4.5/R4.6
13. **公共 API JSDoc** → R6
14. **测试** → R7
15. **包配置**（`package.json` / `tsconfig.json` / `tsup.config.ts` / `vitest.config.ts`）→ R8
16. **README** → R9

## §6 创建检查清单

测试临时工程、镜像、容器、辅助进程与数据须在 finally/teardown 自动清理，成功、失败和取消均执行；只清理本次创建的资源。日志、截图与报告保留到分析和交付结束再清理，不提交验收产物。

- [ ] 已答 §0 创建前四问
- [ ] 已通过 §1 决策红线检查（无单实现 Provider / 无单组子操作）
- [ ] 模块类型 / API 风格已确定
- [ ] 错误码段位不与注册表冲突
- [ ] 目录结构符合 §2
- [ ] 命名符合 §3（含表名/缓存 key 规则）
- [ ] 表名/缓存 key 就近定义且不可配置
- [ ] 所有公共 API JSDoc 含 `@example`
- [ ] 公共方法返回 `HaiResult<T>`，未使用 `throw`（合规场景除外）
- [ ] 已实现 NotInitializedKit + `initInProgress` 并发防护（并发调用返回 HaiResult 错误）
- [ ] 测试覆盖正常 / 边界 / 多实现
- [ ] README + 对应 CLI Skill 模板（如存在）同步
- [ ] 构建后 generate:api/check:api/test:api 验证真实入口、声明及浏览器隔离；公开变化已核对全部消费者
- [ ] 按 [工作规范](../../instructions/workspace.md#验证与交付) 分轮收集 typecheck/lint/build/test 及适用 E2E，汇总后集中修复；最终必需门禁对最终代码均有效通过
