---
name: hai-ci
description: 设计和维护 hai-framework 应用仓库的 CI/CD、GitHub Actions、质量门禁、secret scan 与 workflow 安全；当需求涉及 CI、GitHub Actions、required checks、泄漏扫描或 release workflow 编排时使用。
---

# hai-ci — CI/CD 与质量门禁规范

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 设计和维护 hai-framework 应用仓库的 CI/CD、GitHub Actions、质量门禁、secret scan 与 workflow 安全；当需求涉及 CI、GitHub Actions、required checks、泄漏扫描或 release workflow 编排时使用。 |
| 适用场景 | 当任务与 `hai-ci` 的能力描述匹配，并且需要遵循本 Skill 的流程和边界时 |
| 输入 | 用户目标、仓库与运行环境上下文、现有配置、授权范围和质量门禁 |
| 输出 | 与目标匹配的配置/代码/文档或审查结论，以及可复现的验证结果 |
| 限制 | 不扩张用户授权，不输出或固化密钥，不跳过失败门禁，不假定外部服务状态 |

> 面向 AI 助手和团队成员的仓库自动化指南。目标是让每个 PR 都能被机器稳定验证，同时避免把 secrets 暴露给不可信 PR 或第三方 Action。

---

## 适用场景

- 新增或修改 `.github/workflows/**`
- 配置 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、E2E
- 调整 secret scan、依赖扫描、安全扫描、release workflow 编排
- 设计 required checks 的 CI 状态、workflow 权限、触发条件与 concurrency
- 排查 CI flaky、缓存、矩阵构建或执行顺序问题

不负责：PR 人工审查流程（用 `hai-pr-review`）、测试用例设计（用 `hai-app-tests`）、代码质量审查（用 `hai-app-review`）、云资源开通与应用部署 API（用 `hai-deploy`）。

---

## 核心原则

1. **确定性检查优先**：CI 只负责可重复的机器检查；测试内容设计交给 `hai-app-tests`，代码规范判断交给 `hai-app-review`。
2. **最小权限**：默认 `permissions: contents: read`，只有 release、comment、pages 等明确场景才提升权限。
3. **PR 不使用 secrets**：来自 fork 或不可信分支的 PR 不得运行读取 secrets 的 workflow。
4. **禁用高风险组合**：禁止 `pull_request_target` + checkout PR 代码 + secrets/写权限。
5. **先轻后重**：核心 CI 必须稳定；E2E、发布、安全深扫可以拆成 manual/nightly 或独立 workflow。
6. **可追溯**：workflow 改动必须说明触发条件、权限、缓存、失败路径和验证命令。

---

## 标准 CI 工作流

### PR / main 基础质量门禁

建议顺序：

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

测试覆盖范围与 TDD 断言由 `hai-app-tests` 定义；本技能只决定这些命令如何在 workflow 中稳定执行。

### E2E 策略

- 若 E2E 稳定且耗时可控，可作为 required check。
- 若 E2E 依赖浏览器、服务、密钥或容易 flaky，先放到 `workflow_dispatch` / `schedule` / 独立 job。
- 应用级 E2E 使用：`pnpm --filter <app> test:e2e`。

### hai-framework 依赖策略

- CI 默认使用 `pnpm-lock.yaml` 中的 npm/published 依赖，确保与真实安装环境一致。
- 本地联调使用 `framework:use:local` / `framework:watch`，但不要让默认 PR CI 隐式依赖本机路径。
- 需要验证本地 framework 改动时，创建显式的 sync/drift check 或双仓联动 PR。

---

## GitHub Actions 安全清单

- [ ] workflow 顶层声明 `permissions`
- [ ] PR workflow 使用 `pull_request`，不用 `pull_request_target`
- [ ] 不在 PR workflow 中读取 secrets
- [ ] 第三方 action 固定版本；高风险 action 优先改为本地脚本或官方 action
- [ ] 使用 `concurrency` 取消同分支旧任务
- [ ] 不在 CI 日志打印 token、cookie、连接串、`.env` 内容
- [ ] release workflow 独立提权，只在 main/tag/manual 触发
- [ ] 失败日志可定位，不吞错、不 `|| true` 掩盖核心质量门禁

---

## Secret scan 策略

### 推荐

- 用无 secrets 的高置信正则扫描常见密钥形态。
- 排除示例 skill、锁文件、图片等容易误报的路径。
- 需要私有关键词表时，仅在受信任分支的独立 workflow 中运行，不对 fork PR 暴露。

### 禁止

- ❌ `pull_request_target` 中 checkout 不可信 PR 代码后读取 `secrets.*`
- ❌ 把完整密钥关键词列表传给未知第三方 action
- ❌ 为了通过扫描而删除失败证据或扩大忽略范围

---

## Workflow 变更交付清单

修改 CI/CD 时，PR 描述必须包含：

- 触发条件：`pull_request` / `push` / `workflow_dispatch` / `schedule`
- 权限：顶层和 job 级 `permissions`
- 执行命令：每个 job 的核心命令
- 安全影响：是否读取 secrets、是否写仓库、是否评论 PR
- 验证方式：本地命令或 GitHub Actions dry run 结果

---

## 相关 Skills

- `hai-build` — 项目结构与质量门禁总览
- `hai-app-tests` — Vitest / Playwright 测试规范
- `hai-pr-review` — PR 审查与 AI Review 策略
- `hai-deploy` — 应用部署与云服务开通
- `hai-framework-sync` — hai-framework 与应用仓库同步策略
