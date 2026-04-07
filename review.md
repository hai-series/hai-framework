# 审查文档

> 适用范围：`hai-framework` 仓库全部应用与模块。

## 1. 审查要求

### 1.1 基本原则

1. **禁止完全依赖 AI 审查**：AI 仅作为辅助工具，不能替代人工主审与复审。
2. **必须双人审查**：每个模块至少包含 1 名主审人 + 1 名复审人。
3. **必须可追溯**：审查结论需记录问题、风险等级、处理状态与结论日期。
4. **必须成套检查**：代码、测试、文档、配置变更必须同步审查。
5. **先自动化后人工**：先通过 typecheck / lint / test，再进入人工审查。

### 1.2 禁止项

- 禁止“只看 AI 总结，不看代码与测试变更”。
- 禁止未通过质量门禁（typecheck/lint/test）即标记“可用”。
- 禁止主审人和复审人为同一人。
- 禁止仅审查功能正确性而忽略安全、性能与分层规范。

### 1.3 可用性判定（建议）

- `是`：主审通过 + 复审通过 + 关键问题已关闭 + 质量门禁通过。
- `否`：任一核心条件未满足。
- `待定`：仍在审查中或信息不完整。

---

## 2. 审查进度

> 说明：当前主审人/复审人先使用占位值，分配后请替换为真实姓名或账号。

| 模块                     | 类型 | 主审人     | 复审人           | 主审完成 | 复审完成 | 备注 |
| ------------------------ | ---- | ---------- | ---------------- | -------- | -------- | ---- |
| `packages/core`          | 模块 | @gudaoxuri | @LiJieLong       | ✅       | 待定     | -    |
| `packages/crypto`        | 模块 | @gudaoxuri | @LiJieLong       | ✅       | 待定     | -    |
| `packages/reldb`         | 模块 | @gudaoxuri | @LiJieLong       | 待定     | 待定     | -    |
| `packages/vecdb`         | 模块 | @gudaoxuri | @RWDai           | 待定     | 待定     | -    |
| `packages/cache`         | 模块 | @gudaoxuri | @LiJieLong       | ✅       | 待定     | -    |
| `packages/scheduler`     | 模块 | @gudaoxuri | @LiJieLong       | ✅       | 待定     | -    |
| `packages/storage`       | 模块 | @gudaoxuri | @LiJieLong       | ✅       | 待定     | -    |
| `packages/audit`         | 模块 | @gudaoxuri | @LiJieLong       | ✅       | 待定     | -    |
| `packages/reach`         | 模块 | @gudaoxuri | @LiJieLong       | 待定     | 待定     | -    |
| `packages/datapipe`      | 模块 | @gudaoxuri | @RWDai           | ✅       | 待定     | -    |
| `packages/ai`            | 模块 | @gudaoxuri | @RWDai           | 待定     | 待定     | -    |
| `packages/iam`           | 模块 | @gudaoxuri | @LiJieLong       | 待定     | 待定     | -    |
| `packages/api-client`    | 模块 | @gudaoxuri | @LiJieLong       | 待定     | 待定     | -    |
| `packages/ui`            | 模块 | @akfdwjx   | @wangjinpeng1235 | 待定     | 待定     | -    |
| `packages/kit`           | 模块 | @akfdwjx   | @wangjinpeng1235 | 待定     | 待定     | -    |
| `packages/cli`           | 模块 | @gudaoxuri | @LiJieLong       | 待定     | 待定     | -    |
| `packages/capacitor`     | 模块 | 待分配     | 待分配           | 待定     | 待定     | -    |
| `packages/payment`       | 模块 | 待分配     | 待分配           | 待定     | 待定     | -    |
| `packages/deploy`        | 模块 | 待分配     | 待分配           | 待定     | 待定     | -    |
| `apps/admin-console`     | 应用 | @gudaoxuri | @LiJieLong       | 待定     | 待定     | -    |
| `apps/api-service`       | 应用 | @gudaoxuri | @LiJieLong       | 待定     | 待定     | -    |
| `apps/corporate-website` | 应用 | @gudaoxuri | @LiJieLong       | 待定     | 待定     | -    |
| `apps/h5-app`            | 应用 | @gudaoxuri | 待分配           | 待定     | 待定     | -    |
| `apps/android-app`       | 应用 | 待分配     | 待分配           | 待定     | 待定     | -    |
| `apps/desktop-app`       | 应用 | 待分配     | 待分配           | 待定     | 待定     | -    |

---

## 3. 更新规则

1. 每次审查结束后，主审人更新“是否可用”和“备注”。
2. 复审完成后补充复审结论（通过/驳回 + 原因）。
3. 模块状态变更（如回归失败）需在 24 小时内回写表格。
