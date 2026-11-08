---
name: hai-ai
description: "接入 @h-ai/ai 的 LLM、工具/MCP、RAG、会话记忆、图像、语音、A2A 及 ACP。"
---

# hai-ai

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 接入 @h-ai/ai 的 LLM、工具/MCP、RAG、会话记忆、图像、语音、A2A 及 ACP |
| 适用场景 | AI 应用服务端集成或浏览器代理接入 |
| 输入 | AIConfigInput、消息/音频/图片、scope、AbortSignal |
| 输出 | 领域操作为 HaiResult；流为 AsyncIterable，迭代可抛错 |
| 限制 | tools/stream 无需 init；其他领域先初始化。生产须先初始化共享 PostgreSQL/MySQL + 网络 vecdb 或传 stateScope=shared 的 Provider；临时 Store 仅开发/测试，关闭后丢失。工具调用仍需业务授权。 |

## 使用路径

按 [共享使用契约](../../../packages/cli/templates/skills/hai-ai/SKILL.md) 选择操作与相邻参考，仅加载当前任务所需小节；模块 API、安全限制、生命周期和失败行为只在共享正文维护。

仓库内修改另按 [工作规范](../../instructions/workspace.md) 与 [模块规范](../../instructions/module-conventions.md)；公开签名以当前源码为准，发布包使用以实际安装版本为准。公共变化同步实现、调用方、模板、文档与测试。
