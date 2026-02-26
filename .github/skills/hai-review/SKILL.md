---
name: hai-review
description: 对 hai-framework 模块进行代码审查与规范化：对照 hai-create 规范优化代码、完善注释、确保测试与 lint 通过，并按规范重写 README 与 Skill 模板。
---

# hai-review

## 适用场景

- 对单个模块进行整体审查与规范化（代码、注释、文档、测试）
- 需要确保测试与 lint 通过，并输出可追溯的改动
- 需要按仓库规范重写 README 与 Skill 模板

## 工作准则

1. **先搜索再改动**：用全局检索确认引用关系，避免遗漏更新。
2. **最小变更**：除非测试暴露缺陷，不改业务行为；优化以可读性与安全为主。
3. **注释规范**：公共 API 与内部函数补齐中文 JSDoc，包含参数、返回值、示例、边界说明。
4. **文档规范**：
   - README：只写"是什么/怎么用"，不写接口清单与内部实现（hai-create §6.1）。
   - Skill 模板：面向 AI，位于 `packages/cli/templates/skills/hai-<模块名>/SKILL.md`，需包含 YAML frontmatter、模块概述、API、错误码、常见模式（hai-create §6.2）。
5. **质量门禁**：按顺序执行 `pnpm typecheck` → `pnpm lint` → `pnpm test`（优先 filter 指定模块）。
6. **参照 hai-create 规范**：审查前先读取 `.github/skills/hai-create/SKILL.md`，以其中的目录结构、架构决策、代码规范作为审查基准。

---

## 重要审查点

### 架构决策（hai-create §2）

- **两个独立问题**：模块是否有子功能？是否需要 Provider？答案的组合决定 main.ts 写法和 Provider 位置。
- **Provider 位置规则**：
  - 不需要多后端 → 无 Provider
  - 需要多后端 + 无子功能 → 模块级 Provider（`src/providers/xx-provider-aaa.ts`），由 main.ts 管理
  - 需要多后端 + 有子功能 → 子功能级 Provider（`src/yy/providers/xx-yy-provider-aaa.ts`），由子功能工厂内部管理，main.ts 不感知
- **影响分析必须写出**：直接影响（文件/类型/导入）+ 间接影响（引用点/测试/文档）。
- **禁止只改一处**：代码/测试/文档必须成套更新。
- **分层与依赖**：依赖方向向内收敛，禁止 UI 层写业务逻辑。
- **core 对齐**：初始化 API、配置校验与导出规则需对齐 core 基线。

### 导出与类型（hai-create §3.2 / §3.5）

- **导出规则**：`index.ts` 仅做 `export *` 聚合，禁止选择性导出/重命名导出。
- **类型规则**：禁止 `any`，不确定用 `unknown` 并在边界缩窄。
- **对外类型**：必须集中在 `xx-types.ts`，禁止把内部实现类型泄漏为 public API。
- **配置类型**：必须导出 `XxConfig`（parse 后）和 `XxConfigInput`（用户输入）。
- **子功能类型聚合**：有子功能时，`xx-types.ts` 必须 re-export 子功能类型（hai-create §3.7.3）。

### 代码质量（hai-create §4）

- **return 语句**：不得包含复杂逻辑（条件判断、循环、多级调用链），应只返回已计算的值。

```ts
// ❌ return 中嵌套复杂逻辑
return items.filter(i => i.active).map(i => ({ ...i, createdAt: new Date(i.created_at) }))

// ✅ 拆分为步骤
const activeItems = items.filter(i => i.active)
const result = activeItems.map(mapToItem)
return result
```

- **提前返回**：使用 Early Return 减少嵌套，禁止超过 2 层的 if 嵌套。

```ts
// ❌ 深层嵌套
if (input) {
  if (input.name) {
    if (input.name.length > 0) { /* ... */ }
  }
}

// ✅ 提前返回
if (!input?.name?.length) {
  return err({ code: XxErrorCode.VALIDATION, message: xxM('xx_nameRequired') })
}
// 实际逻辑
```

- **函数体量**：单个函数 ≤ 60 行（不含注释和空行），超过时拆分。
- **错误透传**：上游 Result 错误直接透传，不要重新包装。

```ts
// ❌ 重新包装
const result = await sql.query(sql)
if (!result.success) {
  return err({ code: XxErrorCode.QUERY_FAILED, message: result.error.message })
}

// ✅ 直接透传
const result = await sql.query(sql)
if (!result.success) {
  return result
}
```

- **错误创建**：错误码 + i18n 消息（`xxM('key')`），禁止硬编码消息字符串。
- **Provider 实现**：使用工厂函数 + 闭包，不使用 class。
- **依赖注入**：子功能使用 Deps 接口聚合依赖，不散乱传入回调（hai-create §4.5）。
- **工厂返回形式**：无异步初始化时同步返回 `XxYyFunctions`；有异步初始化时返回 `Promise<Result<XxYyFunctions, XxError>>`。

### i18n 与日志

- **i18n**：用户可见文本必须走 i18n key（`xxM('key')`），禁止硬编码字符串。
- **日志**：禁止 `console.log`，统一使用 `core.logger`（trace/debug/info/warn/error/fatal）。
- **日志分级**：
  - `trace`：详细调试（循环内、变量值）
  - `debug`：流程节点（函数进入、参数）
  - `info`：业务事件（初始化完成、连接就绪）
  - `warn`：异常但可恢复（重试、降级）
  - `error`：操作失败（需人工排查）
  - `fatal`：致命错误（服务无法继续）

#### 日志输出审查要点（hai-create §4.10）

审查时必须确认以下位置**已输出日志且级别正确**：

| 位置                                   | 必须级别                       | 审查项                                                                  |
| -------------------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| `init()` 成功                          | `info`                         | 模块/服务初始化完成，附带配置类型等关键参数                             |
| `init()` 失败                          | `error`                        | 初始化异常，附带 `{ error }`                                            |
| `close()`                              | `info`                         | 模块/服务关闭                                                           |
| 业务写操作成功（create/update/delete） | `info`                         | 携带业务标识（`id`、`userId` 等）                                       |
| 业务写操作进入                         | `debug`                        | 携带输入参数概要                                                        |
| 业务写操作失败                         | `warn` 或 `error`              | 校验失败用 `warn`，系统异常用 `error`，附带 `{ error }` 或 `{ reason }` |
| Provider connect 成功/失败             | `info` / `error`               | 附带连接目标信息（`host`、`type`）                                      |
| Provider disconnect                    | `info`                         | —                                                                       |
| 安全敏感操作（登录/登出/授权）         | `info`（成功）/ `warn`（失败） | 附带 `userId`、`type`；禁止输出密码/token 明文                          |
| 读操作 / 查询                          | `debug`                        | 不使用 `info`，避免日志过多                                             |
| 循环体内详细记录                       | `trace`                        | 生产环境默认不输出                                                      |

**日志内容规范**：

- 消息文本：英文，简洁动宾结构（如 `'XX module initialized'`、`'Failed to create yy item'`）
- 上下文对象：携带关键业务标识（`id`、`userId`、`type`），禁止输出密码、token 明文等敏感信息
- 错误上下文：失败日志携带 `{ error }` 或 `{ reason: errorCode }`，便于排查

**常见审查不合格示例**：

```ts
// ❌ init 成功后没有日志
const badExample = {
  async init(config) {
    const parsed = XxConfigSchema.parse(config)
    currentConfig = parsed
    return ok(undefined)
  },
}

// ✅ init 成功必须输出 info 日志
const goodExample = {
  async init(config) {
    const parsed = XxConfigSchema.parse(config)
    currentConfig = parsed
    logger.info('XX module initialized', { type: parsed.type })
    return ok(undefined)
  },
}
```

```ts
// ❌ 业务操作成功没有日志
const badExample = {
  async create(input) {
    const item = await doCreate(input)
    return ok(item)
  },
}

// ✅ 写操作需有 debug 进入 + info 成功
const goodExample = {
  async create(input) {
    logger.debug('Creating yy item', { name: input.name })
    const item = await doCreate(input)
    logger.info('Yy item created', { itemId: item.id })
    return ok(item)
  },
}
```

```ts
// ❌ 日志级别不当：把每次查询都用 info
const badExample = {
  async get(id) {
    logger.info('Getting item', { id }) // 读操作不应用 info
    return ok(await dataSource.get(id))
  },
}

// ✅ 读操作用 debug
const goodExample = {
  async get(id) {
    logger.debug('Getting item', { id })
    return ok(await dataSource.get(id))
  },
}
```

### 安全与配置

- **环境变量**：禁止硬编码密钥；新增变量需补 `.env` 占位与文档说明。
- **配置校验**：模块在使用配置前必须显式通过 Zod Schema 校验。

### 命名一致性（hai-create §4.6）

- **命名三问**：看名字能知道它做什么？会和其他名字混淆？6 个月后还能理解？
- **文件命名**：`{模块}-{职责}.ts`、`{模块}-{功能}-{角色}.ts`（kebab-case）
- 服务对象：`export const xx`（小写模块名）
- 错误码：`XxErrorCode.UPPER_SNAKE_CASE`
- i18n 获取器：`xxM()`
- 消息键前缀：`xx_camelCase`
- Provider 工厂：`create{Impl}Provider()`

---

## Skill 编写要求与最佳实践

### 必要要求（SKILL.md）

- 必须包含 YAML frontmatter，字段至少包括：
  - `name`：小写字母/数字/连字符，长度合理，且与目录名一致
  - `description`：描述"做什么 + 何时用"，包含关键触发词
- Markdown 正文必须清晰可执行，避免空泛描述
- 目录至少包含 `SKILL.md`，可选 `scripts/`、`references/`、`assets/`

### 最佳实践

- **保持精简**：只写必要信息，避免冗长背景
- **描述具体**：说明触发场景与输出标准，避免"帮助处理"这类模糊描述
- **渐进披露**：正文过长时拆分到引用文件，并在 SKILL.md 中建立导航
- **示例驱动**：为关键任务提供输入/输出或命令示例
- **测试迭代**：用真实场景测试 Skill，观察是否被正确触发
- **安全注意**：不要硬编码密钥；对脚本执行保持谨慎

### 资源指引

- Skill 编写指南（权威参考）：
  https://support.claude.com/en/articles/12512198-how-to-create-custom-skills

---

## 审查清单

### 目录与入口

- [ ] 目录结构符合 hai-create §1 规范（命名、分层、子功能无 index.ts）
- [ ] `index.ts` 仅做 `export *` 聚合，无选择性导出

### 架构决策

- [ ] 子功能 / Provider 组合方式符合 hai-create §2 决策表
- [ ] Provider 位置正确（无子功能 → `src/providers/`；有子功能 → 子功能目录内 `providers/`）
- [ ] main.ts 不感知子功能内部的 Provider

### 配置与类型

- [ ] 错误码段位正确、Zod Schema 完整、导出 Config + ConfigInput
- [ ] 对外类型集中在 `xx-types.ts`，无内部类型泄漏
- [ ] 有子功能时，`xx-types.ts` re-export 了子功能类型

### main.ts

- [ ] init 流程：close → Zod parse → 创建功能（或 Provider / 子功能） → save
- [ ] get 访问器使用 `currentXxx ?? notInitializedXxx`
- [ ] 未初始化使用 `core.module.createNotInitializedKit`

### 代码规范

- [ ] return 仅返回已计算值，无嵌套条件/循环
- [ ] 无超过 2 层的 if 嵌套
- [ ] 单函数 ≤ 60 行
- [ ] 上游 Result 直接透传，未重新包装
- [ ] 错误创建用错误码 + i18n，无硬编码消息
- [ ] Provider 用工厂 + 闭包，非 class

### 注释、i18n、日志

- [ ] 中文注释、英文日志、命名一致
- [ ] 所有用户可见文本走 i18n key，消息键前缀正确
- [ ] 无 `console.log`，日志级别符合场景
- [ ] init/close 有 info 日志输出
- [ ] 业务写操作有 debug（进入）+ info（成功）日志
- [ ] 失败分支有 warn 或 error 日志，附带错误上下文
- [ ] Provider connect/disconnect 有 info 日志
- [ ] 读操作使用 debug 而非 info
- [ ] 日志不包含密码、token 明文等敏感信息

### 安全与类型

- [ ] 无 `any`，全部使用 `unknown` + 缩窄
- [ ] 无硬编码密钥，新变量有 `.env` 占位

### 文档

- [ ] README 符合 hai-create §6.1（是什么/怎么用，无接口清单）
- [ ] Skill 模板符合 hai-create §6.2（YAML frontmatter、模块概述、API、错误码、常见模式）
- [ ] 依赖方向向内收敛，未引入重复能力

---

## 输出要求

- 列出改动文件与原因
- 说明是否修复了缺陷或仅做规范化
- 明确测试与 lint 结果

## 示例触发语句

- "对 crypto 模块做一次整体审查"
- "review storage 模块"
- "优化代码并重写 README/Skill 模板"
- "完善注释并确保测试通过"
