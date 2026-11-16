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

工具定义和执行的共享契约见 [使用流程](../../../packages/cli/templates/skills/hai-tools/SKILL.md)，具体 API 见 [参考](../../../packages/cli/templates/skills/hai-tools/reference.md)。轻量工具为纯定义/工厂，无 `init/close`；Runner 负责受管执行，AI 只做模型协议适配。

修改框架实现时先按 [工作规范](../../instructions/workspace.md) 和 [模块规范](../../instructions/module-conventions.md) 核对真实消费者、公共导出、浏览器边界及对应测试。
