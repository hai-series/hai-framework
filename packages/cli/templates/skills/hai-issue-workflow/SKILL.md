---
name: hai-issue-workflow
description: 使用 GitHub Issue 和 PR 管理 hai-framework 应用团队开发，规范 AI task、planning、bug、feature、分支命名、worktree 隔离、上下文交接和验收标准；当需求涉及 issue 驱动开发、多 AI 协作或团队流程时使用。
---

# hai-issue-workflow — Issue 驱动的团队与 AI 协作流程

> Issue 是需求、计划和上下文的长期记忆；PR 是实现、验证和审查的交付边界。

---

## 适用场景

- 使用 Issue/PR 推动项目开发
- 多个人或多个 AI agent 并行开发
- 需要把聊天记录、设计决策、验收标准固化成团队流程
- 需要拆分 roadmap、bug、feature、AI task、planning
- 需要减少上下文丢失、重复劳动、分支冲突

---

## 标准生命周期

### 1. Issue Create

每个任务必须有单一目标：

- 问题 / 目标
- 相关文件、skill、PR、外部资料
- 可执行验收标准
- 明确不做什么
- reviewer 或 owner

### 2. Issue Plan

复杂任务先在 issue 中沉淀计划：

- 影响文件
- 测试策略
- 风险和回滚
- 是否需要 hai-framework 同步
- 是否需要安全 / 架构 review

### 3. Implementation

建议分支命名：

```text
ai/<issue-number>-<short-topic>
feat/<issue-number>-<short-topic>
fix/<issue-number>-<short-topic>
ci/<issue-number>-<short-topic>
```

多 AI 并行时使用独立 worktree，避免共享工作区互相覆盖。

### 4. Pull Request

PR 必须链接 issue，填写：

- scope
- AI assistance
- verification
- risk / rollback
- reviewer focus

### 5. Review & Merge

- CI 先通过，再进行深入 review。
- AI Review 只作为补充信号。
- 人类对最终 merge 负责。

---

## Issue 类型

| 类型 | 用途 | 关键字段 |
| --- | --- | --- |
| Bug | 可复现缺陷 | 复现步骤、期望、实际、环境 |
| Feature | 新能力或增强 | 问题、验收、范围边界 |
| AI Task | 指派给 AI 辅助流程 | 上下文、验收、Must Not Do、review level |
| Planning | 架构/路线图决策 | 选项、证据、建议、决策 |

---

## 聊天记录固化规则

### 可以固化

- 可复用流程：先计划、再实现、再验证
- review 清单：测试、风险、scope、回滚
- 命名、分层、HaiResult、日志、i18n 等长期规范
- AI 协作边界：不自动 merge、不泄漏 secrets、不复制敏感原文

### 禁止固化

- token、cookie、密码、连接串、私有 URL
- 用户账号、内部部署地址、未脱敏日志
- 一次性调试细节和过期 workaround
- 个人偏好但没有团队收益的提示词

---

## 验收标准写法

使用可执行或可观察标准：

```text
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0
- [ ] 新增 PR 模板包含 scope、verification、risk、AI assistance
- [ ] `.agents/skills/hai-ci/SKILL.md` 存在并被 AGENTS.md 引用
```

避免模糊标准：

```text
- [ ] 看起来没问题
- [ ] 优化一下
- [ ] AI 检查过
```

---

## 相关 Skills

- `hai-ci` — CI 与质量门禁
- `hai-pr-review` — PR 审查和 AI Review
- `hai-framework-sync` — 两仓同步
- `hai-build` — 项目开发入口
