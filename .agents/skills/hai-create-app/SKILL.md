---
name: hai-create-app
description: "在 hai 应用中新增、修改或修复功能，按需求复用框架能力并验证安全、质量和代码规范。"
---

# hai-create-app

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 在 hai 应用中新增、修改或修复页面、API、服务、模型或组件 |
| 适用场景 | 已确定需求的应用功能实现 |
| 输入 | 功能需求、现有路由/contract、数据模型和验收场景 |
| 输出 | 框架能力选择依据、最小实现、必要测试、i18n 与同步文档 |
| 限制 | 优先复用；TDD 验证本次目标行为，仍适用的回归保持通过。保留 API workspace 架构时不混入 SvelteKit 路由。 |

## 使用路径

- 业务以用户当前明确要求及其指定文档为准；模板规则、示例、代码与测试是初始方案，冲突时在已授权范围内适配并同步过期 AGENTS/skills/README，不要求将需求改回模板。具体判断见下方应用开发共同规则。
- 根据需求/设计文档实施时，先使用 [hai-spec-review](../../../packages/cli/templates/skills/hai-spec-review/SKILL.md) 确认就绪，再使用 [hai-spec-implement](../../../packages/cli/templates/skills/hai-spec-implement/SKILL.md) 维护任务、TDD、分支交付与已验收基线；文档提交后按固定 Git 差异更新原任务或新建任务，整体验收后推进基线。仅要求规划或审查时不开始实现。
- 需要使用脚手架、添加模块或生成代码时，先按 [CLI 安装说明](../../../packages/cli/README.md#安装-cli) 全局安装 `@h-ai/cli`，再执行 `hai` 命令；仓库内未发布模板按该 README 的本地构建与运行说明验证。
- 先按 [应用开发共同规则](../../../packages/cli/templates/skills/hai-app-create/development.md) 将真实需求映射到框架模块、现成功能和配置，核对当前源码的 exports/类型及已有调用点；应用消费发布包时核对实际安装版本。
- 可复用能力应直接使用；需要业务组合时保留领域服务，现有能力不足或目标端不支持时说明证据后再写应用实现，不为使用率强行安装无关模块。
- 从真实路由/contract、UI 组件和服务层扩展；API workspace、SvelteKit 和 SPA 的文件结构不能混用。
- 新手引导和帮助中心使用 `@h-ai/ui/guide`，复用已有导航适配器、i18n 和主题；fullstack 共享管理界面已有默认入口，按 [引导指南](../../../packages/cli/templates/skills/hai-ui/guide.md) 扩展内容和锚点。
- 名称、版本、环境、语言与日志复用 `_core.yml` 和 core.config/core.logger；SvelteKit layout 与 fullstack app.info 只公开元信息白名单，Vite mobile-app 经 Node 构建阶段解析后注入，配置变更重新构建。不能硬编码显示副本或把完整配置交给浏览器。
- 环境配置遵守 [六类文件与加载约定](../../../packages/cli/templates/skills/hai-app-create/development.md#环境配置)：公共基础和环境文件提交 Git，本机私有值只写 `.env.local`；完整示例逐项说明字段与约束。新增或修改变量时同步应用、模板、模块说明和根 `.env.example`。
- 对新增行为先写有意义的目标用例，仍适用的回归保持通过；被明确新需求替代的模板断言同步更新并记录依据，同步 i18n、README 和调用方。

## 按需参考

详细配置、API 签名、错误码和范本在 [reference.md](reference.md)。按下列标题定位所需小节，不默认通读；用例中的业务变量需结合当前应用补齐。

- §1 应用类型与选型
- §2 目录结构
- §3 核心文件模板
- §4 路由与页面
- §5 API 端点
- §6 模块集成
- §7 i18n 规范
- §8 样式与 UI
- §9 安全规范
- §10 容器交付
- §11 测试
- §12 创建检查清单
