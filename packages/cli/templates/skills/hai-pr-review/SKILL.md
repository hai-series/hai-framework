---
name: hai-pr-review
description: 规范 Pull Request 审查、AI-assisted PR、自动 Review、CODEOWNERS、reviewdog/DangerJS/Copilot/CodeRabbit/Claude/Codex 等方案；当需求涉及 PR 模板、自动审查、合并门禁或 AI Review 策略时使用。
---

# hai-pr-review — PR 审查与 AI Review 规范

> PR 是团队协作和 AI 辅助开发的交付边界。AI 可以帮助发现问题，但不能替代确定性 CI 和人类最终责任。

---

## 适用场景

- 新增或修改 `.github/pull_request_template.md`
- 设计 AI PR Review 方案
- 配置 CODEOWNERS、required review、branch protection
- 审查 AI-generated / AI-assisted PR
- 选择 Copilot、CodeRabbit、reviewdog、DangerJS、Claude Code Action、Codex Action 等工具

---

## 审查分层

### 第 1 层：确定性检查（必须）

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- 相关 E2E / security scan / dependency scan

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
- [ ] 文档 / skill / README 与代码同步
- [ ] 没有硬编码密钥、`any`、`console.log`、未脱敏日志
- [ ] workflow 权限没有扩大
- [ ] AI-assisted 内容已由人类复核

---

## 相关 Skills

- `hai-ci` — CI/CD 与 workflow 安全
- `hai-issue-workflow` — Issue 驱动开发流程
- `hai-review-module` / `hai-app-review` — 代码质量审查
- `hai-framework-sync` — 两仓同步审查
