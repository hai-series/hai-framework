---
name: hai-pr-review
description: 审查 Pull Request 的交付质量、scope、风险、验证方式、AI-assisted 说明与合并准备度；当需求涉及 PR review、AI Review 策略、PR 模板、CODEOWNERS 或合并门禁时使用。
---

# hai-pr-review — PR 审查与 AI Review 规范

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 审查 Pull Request 的交付质量、scope、风险、验证方式、AI-assisted 说明与合并准备度；当需求涉及 PR review、AI Review 策略、PR 模板、CODEOWNERS 或合并门禁时使用。 |
| 适用场景 | 当任务与 `hai-pr-review` 的能力描述匹配，并且需要遵循本 Skill 的流程和边界时 |
| 输入 | 用户指定的审查范围、代码/差异、仓库规范与可复现证据 |
| 输出 | 按优先级排列的问题、影响、定位和修正建议；仅在用户要求时实施修改 |
| 限制 | 不把风格偏好当缺陷，不猜测未读取的实现，不在审查请求中擅自发布或改动外部状态 |

> PR 是团队协作和 AI 辅助开发的交付边界。AI 可以帮助发现问题，但不能替代确定性 CI 和人类最终责任。

---

## 适用场景

- 审查 AI-generated / AI-assisted PR
- 审查 Pull Request 的 scope、风险、验证方式、issue 关联与合并准备度
- 判断 AI Review 是 advisory 还是 blocking，以及是否需要人工复核
- 新增或修改 `.github/pull_request_template.md`
- 配置 CODEOWNERS、required review、branch protection
- 设计 AI PR Review 方案
- 选择 Copilot、CodeRabbit、reviewdog、DangerJS、Claude Code Action、Codex Action 等工具

不负责：代码级质量审查（用 `hai-app-review` / 模块审查技能）、测试用例设计（用 `hai-app-tests`）、workflow 触发/权限/secret 细节（用 `hai-ci`）。

---

## 审查分层

### 第 1 层：确定性检查（必须）

- CI required checks 必须全绿。
- 具体 workflow、权限、secret scan 与 required check 配置由 `hai-ci` 定义。
- 测试覆盖策略与失败用例设计由 `hai-app-tests` 定义。

### 第 2 层：结构化人工审查（必须）

- scope 是否清晰且与 issue 对齐
- 测试是否覆盖成功路径、失败路径、边界条件
- 是否符合 hai-framework 约定：HaiResult、i18n、日志、分层、TDD
- 是否引入密钥、权限扩大、workflow 风险或两仓漂移

### 第 3 层：AI Review（默认 advisory）

- AI Review 默认只评论、不阻塞 merge。
- 只有在 CI 稳定、误报可控、团队明确同意后，才考虑将特定静态规则设为 blocking。
- AI 的建议必须由人类判断，不得自动 merge。

---

## AI-assisted PR 要求

PR 描述必须说明：

- 是否使用 AI 辅助
- AI 负责了哪部分：搜索、实现、测试、review、文档
- 人类如何验证：命令、截图、日志或 reviewer 重点
- 是否复制了聊天记录；若有，只能复制脱敏后的结论，禁止包含 token、cookie、私有 URL、账号密码

---

## Issue 关联与上下文交接

- PR 必须关联 issue 或说明为什么不需要 issue。
- PR scope 必须与 issue 的目标、验收标准和明确不做事项一致。
- AI-assisted PR 必须说明 AI 负责了哪些阶段，以及人类如何复核。
- 多人或多 agent 协作时，PR 描述必须列出 reviewer focus，避免重复 review。

---

## 自动 Review 工具选择

| 工具 | 推荐定位 | 是否适合 blocking |
| --- | --- | --- |
| reviewdog | 把 lint/static analyzer 结果贴到 PR | 适合，前提是规则稳定 |
| DangerJS | PR 元数据、模板、标签、变更范围规则 | 适合，前提是规则明确 |
| GitHub Copilot Code Review | 通用 AI 代码建议 | 默认 advisory |
| CodeRabbit | 上下文型 AI review | 默认 advisory |
| Claude Code Action | 定制化深度 review / 修改建议 | 默认 advisory，严格限制权限 |
| Codex Action | 定制化 review / 修复建议 | 默认 advisory，严格控制 API key |

---

## 权限与安全红线

- ❌ 不在 `pull_request_target` 中运行 AI agent 读取 PR 代码和 secrets。
- ❌ 不给 AI Review workflow 默认 `contents: write`、`pull-requests: write`，除非只用于评论且触发源可信。
- ❌ 不允许 AI 自动合并 PR。
- ❌ 不把私有提示词、聊天原文、token、cookie、连接串写入 PR。
- ✅ AI Review 的 prompt 必须限制任务范围、禁止执行 secrets、要求引用具体文件/行。

---

## PR Review 检查清单

- [ ] PR 关联 issue，scope 单一
- [ ] PR 模板完整填写
- [ ] CI required checks 全绿
- [ ] 新行为有测试，失败路径有覆盖
- [ ] 代码级质量问题已由 `hai-app-review` / 模块审查技能覆盖
- [ ] 文档 / skill / README 与代码同步
- [ ] workflow 权限或 secrets 变化已由 `hai-ci` 审查
- [ ] AI-assisted 内容已由人类复核

---

## 相关 Skills

- `hai-ci` — CI/CD 与 workflow 安全
- `hai-review-module` / `hai-app-review` — 代码质量审查
- `hai-framework-sync` — 两仓同步审查
