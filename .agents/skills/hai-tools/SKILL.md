---
name: hai-tools
description: "使用 @h-ai/tools 定义、注册和授权执行可选工具，并接入 AI 或独立业务调用。"
---

# hai-tools

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用中立工具定义、注册和授权执行，并接入模型协议 |
| 适用场景 | 框架工具扩展及应用接入可选工具 |
| 输入 | 工具 Schema、处理函数、启用集合与可信执行上下文 |
| 输出 | 工具实例、注册器及业务 HaiResult |
| 限制 | 纯定义/工厂无需生命周期；任务和容器使用 Runner |

从 `@h-ai/tools` 导入可直接执行工具或创建内存注册器。Node 中通过 `@h-ai/tools/server` 使用产物工具，通过 `@h-ai/tools-runner` 的 `toolsRunner` 创建保存任务回执的服务并接入受管容器作业。分别见 [独立调用](../../../docs/usage/function/tools.md#quick-start)、[提交和恢复任务](../../../docs/usage/function/tools-runner.md#quick-start)、[命令行作业示例](../../../packages/tools/jobs/README.md#job-operations)和[生成应用使用流程](../../../packages/cli/templates/skills/hai-tools/SKILL.md)。

修改框架实现时先按 [工作规范](../../instructions/workspace.md) 和 [模块规范](../../instructions/module-conventions.md) 核对真实消费者、公共导出、浏览器边界及对应测试。
