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
| 限制 | 优先复用；TDD 仅让新增目标用例先失败，已有回归保持通过。API workspace 不生成 SvelteKit 路由。 |

## 使用路径

- 需要使用脚手架、添加模块或生成代码时，先按 [CLI 安装说明](../../../packages/cli/README.md#安装-cli) 全局安装 `@h-ai/cli`，再执行 `hai` 命令；仓库内未发布模板按该 README 的本地构建与运行说明验证。
- 先按 [应用开发共同规则](../../../packages/cli/templates/skills/hai-app-create/development.md) 将真实需求映射到框架模块、现成功能和配置，核对当前源码的 exports/类型及已有调用点；应用消费发布包时核对实际安装版本。
- 可复用能力应直接使用；需要业务组合时保留领域服务，现有能力不足或目标端不支持时说明证据后再写应用实现，不为使用率强行安装无关模块。
- 从真实路由/contract、UI 组件和服务层扩展；API workspace、SvelteKit 和 SPA 的文件结构不能混用。
- 名称、版本、环境、语言与日志复用 `_core.yml` 和 core.config/core.logger；SvelteKit layout 与 fullstack app.info 只公开元信息白名单，Vite mobile-app 经 Node 构建阶段解析后注入，配置变更重新构建。不能硬编码显示副本或把完整配置交给浏览器。
- 对新增行为先写有意义的目标用例，已有回归保持通过；同步 i18n、README 和调用方。

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
