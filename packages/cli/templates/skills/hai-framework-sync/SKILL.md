---
name: hai-framework-sync
description: "同步 hai-framework 通用 skills、AI 入口与应用依赖，排查 npm/本地联调漂移。"
---

# hai-framework-sync — hai-framework 与应用仓库同步规范

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 同步 hai-framework 通用 skills、AI 入口与应用依赖，排查 npm/本地联调漂移 |
| 适用场景 | 有明确源/目标仓库的模板或版本同步 |
| 输入 | 框架源目录、应用目录、版本、现有本地覆盖 |
| 输出 | 同步后的完整 skill 目录、入口及版本验证结果 |
| 限制 | 仅操作授权仓库；保留应用私有规则。先查 scripts，不假定 framework:* 联调命令存在；未发布行为不能当 npm 已支持。 |

> hai-framework 是能力与 skill 模板源头；应用仓库消费这些能力，并可以有少量项目本地覆盖。同步的目标是减少漂移，而不是把两个仓库混成一个仓库。

## 适用场景

- 修改 `.agents/skills/**`，且内容应成为所有 hai-framework 应用通用规范
- 修改 `packages/cli/templates/skills/**`
- 调整 `AGENTS.md`、`CLAUDE.md`、`opencode.json`、Copilot 指令模板
- 使用 `framework:use:local` / `framework:watch` 联调本地 hai-framework
- 排查应用仓库与 hai-framework npm 版本不一致
- 规划双仓 PR 或同步发布

## 同步原则

1. **通用规范先改 hai-framework**：可复用的 skill、模板、AI 工作流从 `packages/cli/templates/skills/` 起源。
2. **应用仓库只保留项目差异**：业务上下文、项目私有路径、产品决策可以留在应用仓库。
3. **默认 CI 使用 npm 依赖**：确保 PR 能代表真实安装环境；本地路径联调必须显式开启。
4. **双仓改动要成套**：framework 模板、应用本地 `.agents/skills`、AGENTS/Copilot 路由同时更新。
5. **不复制敏感聊天记录**：只同步脱敏后的团队规则和流程。

## 标准同步流程

### 1. 判断来源

先读取当前应用入口与 package.json/lockfile，记录实际 npm/local 模式及解析版本。同步 skill 不能证明新 API 已安装或可用：以目标依赖的公开 exports/types 验证示例与配置，未发布框架能力仅用于已授权本地联调。

| 变更类型 | 首选位置 |
| --- | --- |
| 通用 hai 模块用法 | `hai-framework/packages/cli/templates/skills/hai-*/SKILL.md` |
| 通用 CI/PR/Issue/AI 协作流程 | `hai-framework/packages/cli/templates/skills/` |
| 应用私有业务规则 | 应用仓库 `AGENTS.md` 或本地 skill |
| Copilot/Claude/OpenCode 入口模板 | hai-framework 模板 + 应用仓库入口文件 |

### 2. 修改源头

先在 hai-framework 模板中修改或新增 skill。

### 3. 同步到应用仓库

把源头完整 skill 目录（含 reference.md 等被引用资源）复制到应用仓库 `.agents/skills/<skill>/`，并同步入口引用：

- `AGENTS.md`
- `.github/copilot-instructions.md`
- `CLAUDE.md`（如存在，通过 `@AGENTS.md` 复用共享规则；不另复制 `.claude/skills/`，保留用户已有规则和技能）
- `opencode.json`（如结构变化）

新增/修改/修复任务入口必须能到达 `hai-app-create` 与其 `development.md`；审查入口能到达 `hai-app-review`。按目标架构/依赖交付所需模块技能，不把 SvelteKit 指令套到 API/Vite 项目。复制前比对应用私有覆盖，合并通用修正并保留差异，不能直接覆盖业务规则。

### 4. 验证

按变更类型选择验证方式：

- 仅模板 / skill 变更：检查 diff、目标中实际存在的入口/相邻资源及其相对引用，确认没有框架仓库私有路径/命令；本地能力导航对可选 skill 先检查存在，不把目录缺失当成能力缺失。
- 同步到应用仓库：按 `hai-ci` 定义的质量门禁运行。
- 涉及 framework runtime 时，先确认应用 package.json 已定义下列脚本；没有时按 README 的本地联调方式操作：

```bash
pnpm framework:status
pnpm framework:use:local <package>
pnpm framework:watch <package>
```

## 漂移检查清单

- [ ] framework 模板和应用 `.agents/skills` 对同名 skill 内容一致，除非 PR 明确说明本地覆盖
- [ ] 普通功能修改/修复也路由到能力匹配与安全/质量自查，不仅“创建项目”或手工调用 skill 才生效
- [ ] 技能示例与目标实际依赖版本、架构、公开 API 一致；没有把模板更新当成 runtime 升级
- [ ] `AGENTS.md` 的 skill 列表包含新增/重命名 skill
- [ ] Copilot/Claude/OpenCode 入口能找到新增 skill
- [ ] CI 默认不依赖 `/home/.../hai-framework` 本地路径
- [ ] 本地联调结束后可恢复 npm 模式
- [ ] README 或 PR 描述说明双仓改动顺序

## 禁止事项

- ❌ 只改应用 `.agents/skills`，忘记更新 hai-framework 模板中的通用规范
- ❌ 在 CI 默认路径中依赖本机绝对路径
- ❌ 把 unpublished framework 行为当成已发布 npm 行为
- ❌ 把聊天记录原文、token、私有 URL 写入模板
- ❌ 双仓 PR 没有关联 issue 或同步说明

## 相关 Skills

- `hai-ci` — CI 对 npm/local framework 模式的验证策略
- `hai-pr-review` — 双仓 PR 审查要点
- `hai-build` — 应用开发入口
