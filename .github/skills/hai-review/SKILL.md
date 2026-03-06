---
name: hai-review
description: 对 hai-framework 模块进行代码审查：4 角色独立评审 → 交叉辩论 → 优先级排序 → 修复 → 门禁验收。
---

# hai-review

## 工作准则

1. **先搜索再改动**：用 `grep_search` 确认引用关系，避免遗漏。
2. **最小变更**：除非测试暴露缺陷，不改业务行为。
3. **成套更新**：代码 / 测试 / 文档同步，禁止只改一处。
4. **参照 hai-create**：审查前先读取 `.github/skills/hai-create/SKILL.md`，以其规范作为审查基准。

---

## 审查要点

> 以下各项均为强制审查内容。详细规范参照 hai-create 对应章节。

### 架构决策（hai-create §2）

- 模块类型正确（生命周期单例 / 工厂 / 纯函数 / 基础设施），与 §2 前置分类一致
- 子功能 / Provider 组合方式符合决策表；Provider 位置正确
- API 风格一致（§2 问题 3）：扁平方法 vs 子操作对象，整个模块统一，不混用
- main.ts 仅做生命周期管理和 API 编排，不含具体业务逻辑
- 分层与依赖方向向内收敛；core 基线对齐（init API、配置校验、导出规则）

### 导出与类型（hai-create §3）

- `index.ts` 仅做 `export *` 聚合，禁止选择性导出
- 禁止 `any`；对外类型集中在 `xx-types.ts`，不泄漏内部类型
- 配置导出 `XxConfig`（parse 后）+ `XxConfigInput`（用户输入）
- 有子功能时 `xx-types.ts` 须 re-export 子功能类型
- 错误码段位在 §3.1 注册表中、与已有模块不冲突
- `NOT_INITIALIZED` 错误码固定为 `X010`（模块段 + 010）

### 代码质量（hai-create §4）

- 公共 API 不 `throw`，返回 `Result<T, XxError>`（合规场景除外：内部 catch-and-wrap、SvelteKit 控制流、Client、CLI、`getOrThrow()`、async generator）
- return 仅返回已计算值，禁止嵌套条件/循环
- 提前返回，禁止 >2 层 if 嵌套；单函数 ≤ 60 行
- 上游 Result 直接透传，不重新包装
- 错误创建：错误码 + `xxM('key')`，禁止硬编码消息
- Provider 用工厂 + 闭包，不用 class；子功能用 Deps 接口聚合依赖
- Repository 用 class + 继承 `BaseReldbCrudRepository`（§3.7.4），命名为 `{Module}{Entity}Repository`

### 日志审查（hai-create §4.10）

消息英文、动宾结构；上下文携带业务标识，禁止密码/token 明文。

| 位置                                   | 级别                               | 审查项                                      |
| -------------------------------------- | ---------------------------------- | ------------------------------------------- |
| `init()` 重复初始化走 re-init 分支     | `warn`                             | 提示已初始化正在重新初始化                  |
| `init()` 进入初始化                    | `info`                             | —                                           |
| `init()` 配置校验失败                  | `error`                            | 附带校验错误信息                            |
| `init()` 成功                          | `info`                             | 附带关键配置参数                            |
| `init()` 异常                          | `error`                            | `{ error }`                                 |
| `close()` 已关闭时跳过                 | `info`                             | 提示已关闭正在跳过                          |
| `close()` 进入关闭                     | `info`                             | —                                           |
| `close()` 完成                         | `info`                             | —                                           |
| `close()` 异常（有 Provider 需断开时） | `error`                            | `{ error }`                                 |
| 业务写操作进入 / 成功 / 失败           | `debug` / `info` / `warn`或`error` | 携带业务标识；校验失败 warn、系统异常 error |
| Provider connect / disconnect          | `info` / `info`                    | 附带连接目标信息                            |
| 读操作 / 查询                          | `debug`                            | 不使用 info                                 |
| 循环体内详细记录                       | `trace`                            | —                                           |

### 构建配置（tsup.config.ts）

- `defineConfig()` + `...baseConfig`，不覆盖基础属性（`format` / `dts` / `clean` / `sourcemap` / `treeshake` / `target`）
- `@h-ai/core` 列入 `external`（core 自身除外）；原生/大体积依赖必须 external
- entry 模式与模块类型匹配：

| 模式              | entry                                | 适用                      |
| ----------------- | ------------------------------------ | ------------------------- |
| 单入口 Node-only  | `{ index: 'src/index.ts' }`          | reldb, cache, crypto 等   |
| 双端 Node+Browser | `{ index: …, browser: … }`           | core, storage, ai, iam    |
| 多子路径          | 追加 `'client/index'`、`'api/index'` | storage, ai, iam, payment |
| CLI               | `['src/index.ts']` + shebang banner  | cli                       |

### i18n / 安全 / 命名

- 用户可见文本全部走 i18n key，消息键前缀正确（`{module}_{camelCase}`）
- 禁止 `console.log`；禁止硬编码密钥，新变量补 `.env` 占位
- 命名三问：看名字能知道职责？不会混淆？6 个月后仍可理解？
- 文件 kebab-case；服务对象 `export const xx`；错误码 `XxErrorCode.UPPER_SNAKE`
- 函数接口 `{Module}Functions`；子操作接口 `{Domain}Operations`；错误类型 `{Module}Error`
- Provider 接口 `{Module}Provider`；Repository 类 `{Module}{Entity}Repository`
- i18n 获取器 `{缩写}M()`；端点对象 `{module}Endpoints`

---

## 审查清单

> 每次审查均须逐条确认。

### 目录与入口

- [ ] 目录结构符合 hai-create §1（命名、分层、子功能无 index.ts）
- [ ] `index.ts` 仅做 `export *` 聚合

### 架构

- [ ] 模块类型与 §2 前置分类一致（生命周期单例 / 工厂 / 纯函数 / 基础设施）
- [ ] 子功能 / Provider 组合方式与决策表一致
- [ ] Provider 位置正确（无子功能 → `src/providers/`；有子功能 → 子功能目录内）
- [ ] main.ts 不感知子功能内部的 Provider
- [ ] API 风格适当（§2 问题 3）：扁平 or 子操作，全模块统一

### 类型与配置

- [ ] 错误码段位在 §3.1 注册表中、与已有模块不冲突
- [ ] `NOT_INITIALIZED` 固定为 `X010`
- [ ] Zod Schema 完整、导出 Config + ConfigInput
- [ ] 对外类型集中在 `xx-types.ts`，无内部类型泄漏
- [ ] 有子功能时 `xx-types.ts` re-export 了子功能类型

### main.ts

- [ ] init 流程：已初始化则 warn + close → Zod parse → 创建功能 → save
- [ ] init 日志：重复初始化 warn → 进入 info → 成功 info / 失败 error
- [ ] close 日志：已关闭 info（跳过） → 进入 info → 完成 info
- [ ] get 访问器：`currentXxx ?? notInitializedXxx`（禁止裸返回 `null` / `undefined`）
- [ ] NotInitializedKit 模式完整性（见 hai-create §3.4「NotInitializedKit 安全访问模式」）：
  - [ ] 使用 `core.module.createNotInitializedKit<XxError>(XxErrorCode.NOT_INITIALIZED, () => xxM('xx_notInitialized'))` 创建工具集
  - [ ] 每个子操作接口都有对应的 `notInitialized.proxy<T>()` 占位
  - [ ] Proxy 对象在模块顶层创建（非 getter 内部创建）
  - [ ] async 操作用默认 `proxy<T>()`；同步操作用 `proxy<T>('sync')`
  - [ ] `close()` 后状态回到未初始化，getter 自动切换回 Proxy 占位
  - [ ] Getter 变体正确：有 Provider 用 `provider?.xx ?? proxy`；工厂实例用 `current ?? proxy`；静态操作用 `initialized ? ops : proxy`

### 代码

- [ ] 公共 API 不 `throw`，统一返回 `Result<T, XxError>`
- [ ] throw 仅出现在合规场景
- [ ] return 仅返回已计算值
- [ ] 无 >2 层 if 嵌套；单函数 ≤ 60 行
- [ ] 上游 Result 直接透传
- [ ] 错误创建用错误码 + i18n
- [ ] Provider 用工厂 + 闭包
- [ ] Repository 用 class + 继承 `BaseReldbCrudRepository`，类名 `{Module}{Entity}Repository`
- [ ] 无模块级 `Map` / `Set` 缓存业务数据（需跨节点一致的数据必须 DB 持久化）

### 日志与 i18n

- [ ] 无 `console.log`；日志级别符合上表
- [ ] init/close、写操作、connect/disconnect 均有对应级别日志
- [ ] 失败分支有 warn/error + 错误上下文
- [ ] 读操作使用 debug
- [ ] 日志无敏感信息明文
- [ ] 用户可见文本全部走 i18n key

### 构建

- [ ] tsup: `defineConfig()` + `...baseConfig`，未覆盖基础属性
- [ ] `@h-ai/core` 在 external（core 除外）；原生依赖已 external
- [ ] entry 模式正确

### 安全与类型

- [ ] 无 `any`
- [ ] 无硬编码密钥

### 命名一致性

- [ ] 服务对象 `export const xx`（小写模块名）
- [ ] 函数接口 `{Module}Functions`、错误类型 `{Module}Error`、错误码 `{Module}ErrorCode`
- [ ] 子操作接口 `{Domain}Operations`（如有子操作）
- [ ] Provider 接口 `{Module}Provider`（如有）、Provider 工厂 `create{Impl}Provider`
- [ ] Repository 类 `{Module}{Entity}Repository`（如有）
- [ ] i18n 获取器 `{缩写}M()`、消息键 `{module}_{camelCase}`

### 文档

- [ ] **README 结构合规**（hai-create §6.1）：
  - [ ] 标题行后有一句话描述 + 核心价值
  - [ ] 有能力概览章节（`## 支持的 xxx`），使用表格或列表
  - [ ] 快速开始包含 init → 核心操作 → close 完整生命周期
  - [ ] 多平台/多能力用 `###` 子标题分节
  - [ ] 有配置说明（有 Schema 的给示例，无配置的一句话）
  - [ ] 有错误处理示例（Result 判断 + 常用错误码列表）
  - [ ] 有测试命令 + 外部依赖提示
  - [ ] 无完整类型定义 / 完整 API 表格 / 内部实现原理 / 安装步骤 / 依赖列表
- [ ] **Skill 模板合规**（hai-create §6.2）：YAML frontmatter、概述、使用步骤、核心 API 表、错误码、常见模式

---

## 审查流程（7 阶段）

> 每次审查均按此流程完整执行。

### 阶段 1：4 角色独立评审

| 角色             | 关注领域                                |
| ---------------- | --------------------------------------- |
| **架构师**       | 模块结构、分层、依赖方向、扩展性、解耦  |
| **性能专家**     | 时间/空间复杂度、内存泄漏、并发、热路径 |
| **安全专家**     | 注入、权限绕过、敏感信息泄漏、输入边界  |
| **代码审查专家** | 可读性、维护性、规范合规、测试覆盖      |

**强度要求**：

- 每角色至少 **8 个问题**，必须指向具体代码行/函数/设计决策
- 必须覆盖：逻辑漏洞、边界条件、异常处理、并发风险、性能瓶颈、可扩展性、安全漏洞、潜在崩溃、测试不足

**输出格式**：

```
## {角色}评审
### {角色缩写}-{序号} [{等级}] 问题标题
- 位置：`src/xx.ts` L42-58
- 问题：具体描述
- 风险：后果
- 建议：改进方案
```

### 阶段 2：交叉辩论

至少 **2 轮**交叉质疑，允许观点冲突，必须引用代码或数据支撑。最终达成一致方案，分歧标注权衡取舍。

### 阶段 3：问题汇总

合并去重，按优先级排序输出统一表格：

| 等级   | 含义                                  | 处理         |
| ------ | ------------------------------------- | ------------ |
| **P0** | 数据损坏 / 安全漏洞 / 服务崩溃        | 必须立即修复 |
| **P1** | 内存泄漏 / 竞态 / 权限绕过 / 错误吞没 | 本轮修复     |
| **P2** | 性能 / 可读性 / 冗余                  | 建议修复     |
| **P3** | 风格 / 命名 / 注释                    | 顺手修复     |

### 阶段 4：改进设计

针对 P0 / P1 输出：受影响文件、接口变更、关键代码片段、下游影响分析。

### 阶段 5：实施修复

- 代码 / 测试 / 文档成套更新
- 每个 P0/P1 必须有对应测试
- `grep_search` 确认引用点已更新

### 阶段 6：二次审查

各角色重新审视修改后代码，确认 P0/P1 已清零且未引入新问题。

### 阶段 7：质量门禁与发布判定

按顺序执行 `pnpm typecheck` → `pnpm lint` → `pnpm test`（优先 `--filter` 指定模块）。

输出判定：

```
## 发布判定
- P0 剩余：0 | P1 剩余：0
- P2/P3 剩余：N（已记录，不阻断）
- typecheck：✅ | lint：✅ | test：✅
✅ 可以进入生产
```

**P0 或 P1 未清零 → 回到阶段 4，直到清零。**

---

## 生产事故模拟

审查过程中必须分析代码在以下场景的行为：

| 场景           | 分析要点                                                                     |
| -------------- | ---------------------------------------------------------------------------- |
| **高并发**     | 多请求同时 init / 写入 / 关闭——竞态？状态一致？                              |
| **恶意输入**   | 超长字符串、特殊字符、类型不匹配——校验完整？                                 |
| **依赖不可用** | DB 断连、Redis 超时、API 限流——优雅降级？错误准确？                          |
| **资源耗尽**   | 内存不足、连接池打满——有积压？能恢复？                                       |
| **数据损坏**   | 写入中途失败——事务回滚正确？有补偿？                                         |
| **配置错误**   | 错误类型、缺必填、值越界——Zod 校验完整捕获？                                 |
| **多节点部署** | 模块级 Map/Set 是否缓存了业务数据？各节点状态是否一致？DB 是否为唯一数据源？ |
