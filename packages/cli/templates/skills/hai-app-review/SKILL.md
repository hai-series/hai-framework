---
name: hai-app-review
description: "审查 hai 应用的路由、权限、i18n、服务层与交互体验。"
---

# hai-app-review — 应用代码审查规范

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 审查 hai 应用的路由、权限、i18n、服务层与交互体验 |
| 适用场景 | 用户要求应用代码/体验审查或修复评估 |
| 输入 | 用户指定范围、代码/差异、运行证据与验收要求 |
| 输出 | 按优先级列出的证据、影响和修正建议 |
| 限制 | 只读审查不自动改代码；未读取的实现不下结论，不把偏好当缺陷。实现修复需用户已授权。 |

> 面向 AI 助手的应用代码审查指南。用于审查使用 hai-framework 构建的 SvelteKit 应用、纯 Svelte/Vite 客户端与 API service workspace。本技能也是 TDD Refactor 阶段的执行入口。

## 适用场景

- 审查应用代码是否符合 hai-framework 规范
- TDD Refactor 阶段：在测试通过后进行代码重构与规范化
- 规范化现有代码（分层、命名、日志、i18n）
- 安全审查（权限、输入校验、密钥管理）

## 工作准则

1. **先搜索再改动**：用全局检索确认引用关系，避免遗漏更新。
2. **最小变更**：除非测试暴露缺陷，不改业务行为。
3. **成套更新**：代码 / 测试 / 文档同步。
4. **重构后测试必须仍通过**：任何重构都不能破坏已有测试。

## 审查清单

### TDD 合规性

- [ ] 每个功能都有对应的单元测试（`tests/` 目录）
- [ ] 关键流程有对应的 E2E 测试（`e2e/` 目录）
- [ ] 单元测试覆盖四种路径：正常、边界、权限、错误
- [ ] E2E 测试覆盖 API 端点的未认证/认证场景
- [ ] 测试先于实现编写（TDD 流程已遵循）
- [ ] `pnpm test` 单元测试全部通过
- [ ] `pnpm test:e2e` E2E 测试全部通过

## 审查清单

### 架构分层

- [ ] `hooks.server.ts` 仅做中间件编排（初始化、i18n、`handle` hook），无业务逻辑
- [ ] `+page.server.ts` / `+server.ts` 仅做请求处理（守卫 → 校验 → 调用服务 → 响应）
- [ ] 业务逻辑集中在 `$lib/server/services/`
- [ ] 客户端组件不直接调用数据库或服务端模块
- [ ] 依赖方向：路由 → 服务 → 框架模块，不反向

### HaiResult 处理

- [ ] 投递等业务状态按 `sent` 等字段判断，失败保留用户输入；HTTP/HaiResult 成功不代替业务完成

- [ ] 返回 HaiResult 的调用先检查 `result.success`
- [ ] 上游 HaiResult 错误直接透传，不重新包装
- [ ] 不使用 `try/catch` 来处理框架模块返回的错误（HaiResult 型 API 的业务错误在结果中；流/显式抛错 API 另按契约处理）

```typescript
// ❌ 重新包装
const result = await reldb.sql.query(sql)
if (!result.success) {
  return { success: false, error: { code: 'QUERY_FAILED', message: result.error.message } }
}

// ✅ 直接透传
const result = await reldb.sql.query(sql)
if (!result.success)
  return result
```

### 权限与安全

- [ ] 受保护端点/load 有与实际框架匹配的守卫；公开路由显式允许匿名，不给 API service 强加 kit.guard
- [ ] 所有用户输入通过 Zod Schema 校验（`kit.validate.*`）
- [ ] 无硬编码 API Key / 密钥
- [ ] 日志不输出密码、token 明文

### 日志规范

- [ ] 禁止 `console.log`，统一使用 `core.logger`
- [ ] 日志级别正确：

| 场景                  | 级别                           |
| --------------------- | ------------------------------ |
| 读操作 / 查询         | `debug`                        |
| 写操作进入            | `debug`                        |
| 写操作成功            | `info`                         |
| 校验失败              | `warn`                         |
| 系统异常              | `error`                        |
| 初始化完成 / 关闭     | `info`                         |
| 安全操作（登录/登出） | `info`（成功）/ `warn`（失败） |

- [ ] 日志消息英文、简洁动宾结构
- [ ] 失败日志附带 `{ error }` 或 `{ reason }`

### 类型安全

- [ ] 禁止 `any`，不确定用 `unknown` + 缩窄
- [ ] 函数返回类型明确标注（`HaiResult<T>` / `Promise<HaiResult<T>>`）

### i18n

- [ ] 所有用户可见文本走 i18n key（`$lib/paraglide/messages.js`）
- [ ] 禁止直接修改 `src/lib/paraglide` 生成文件
- [ ] `@h-ai/ui` 组件内置翻译，不传入翻译 props

### 代码质量

- [ ] return 语句不包含复杂逻辑（条件判断、循环、多级调用链）
- [ ] 无超过 2 层的 if 嵌套（使用 Early Return）
- [ ] 单函数 ≤ 120 行（不含注释和空行）
- [ ] 错误创建用错误码 + i18n 消息，无硬编码字符串

### Svelte 5 规范

- [ ] 使用 Runes 语法（`$props()`、`$state()`、`$derived()`、`$effect()`）
- [ ] 事件回调通过 props 传入（非 `createEventDispatcher`）
- [ ] 样式使用 TailwindCSS 4 + DaisyUI 5

### 产品体验与交互审查（用户视角走查）

- [ ] 页面层级与视觉重心清晰，主操作足够突出
- [ ] 响应式断点（桌面 / 平板 / 移动）下无溢出、遮挡、错位
- [ ] 暗色 / 亮色主题下文字对比度满足 WCAG AA
- [ ] 关键路径步骤最短，无多余跳转或确认
- [ ] 危险操作（删除、提交、不可逆变更）有二次确认或可撤销机制
- [ ] 所有可点击区域 hit area ≥ 44px（移动端尤其）
- [ ] 表单具备失焦校验、提交校验与首个错误项聚焦
- [ ] 长任务有进度反馈（百分比 / 预计时间 / skeleton）
- [ ] 四态反馈完整：Loading / Empty / Error / Success
- [ ] 边界场景覆盖：空数据、超长文本、并发操作、权限不足、网络抖动
- [ ] 导航无死路：用户在任意页面都能退出/返回
- [ ] 国际化文本展开后不破坏布局

### 初始化

- [ ] 模块初始化顺序正确：`core → db → cache → iam → ...`
- [ ] 初始化在 `$lib/server/init.ts` 统一管理
- [ ] 配置文件路径遵循 `config/_<module>.yml` 约定

## 质量门禁

审查完成后按顺序执行：

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test`（单元测试）
4. `pnpm --filter <app-name> test:e2e`（E2E 测试）

优先使用 `pnpm --filter <app-name>` 指定应用。

## 输出要求

- 列出改动文件与原因
- 说明是否修复了缺陷或仅做规范化
- 明确测试（单元 + E2E）与 lint 结果
- 确认重构后所有测试仍然通过

## 相关 Skills

- `hai-build`：项目架构总览与 TDD 工作流导航
- `hai-app-create`：TDD 驱动的应用功能创建规范
- `hai-app-tests`：TDD 测试规范（Red 阶段详细指引）

管理端数据读取在 HTTP 应用边界保留失败：查询异常返回 503 和可刷新错误页，分页任一页或权限关联失败均中止加载，禁止回退为空列表、零统计或空权限。未知权限代码返回 400，权限读取失败时不得继续写入。底层模块仍使用 HaiResult。

失败与降级提示也必须国际化：官网 API 按请求 locale 生成 AI 降级/邮件送达状态；未送达不能称为已接收。CLI 部署状态使用 cliM，Gallery 加密能力限制使用双语消息。中文与英文分别验证未配置、失败和成功路径，无需调用付费服务。
