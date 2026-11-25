# @h-ai/ai

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/api-contract](../api-contract/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/datapipe](../datapipe/README.md) · [@h-ai/reldb](../reldb/README.md) · [@h-ai/vecdb](../vecdb/README.md)

AI 能力模块，提供统一的 `ai` 服务对象，覆盖 LLM 对话、文生图、工具调用、MCP、Embedding、记忆、检索/RAG、知识库、上下文管理、文件解析、Rerank、语音（ASR/TTS）与 A2A。Node.js 侧通过 `ai.init()` 初始化，浏览器侧通过 API/client 代理访问。

工具定义与执行由 [Tools](../tools/README.md) 统一提供；`ai.tools.adapt` 负责模型协议，`createBuiltinTools` 包装图片、语音、文档改写及可选完整网址视频，`createMcpTools/createBroker` 复用现有 MCP。工厂不立即执行模型，启用集合、资源权限与 Runner 仍由宿主装配。见 [AI 工具指南](../cli/templates/skills/hai-ai/tools.md)。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/ai`。

[跟着最小示例完成接入](../../docs/usage/function/ai.md#quick-start)。

[依赖与接入顺序](../../docs/usage/function/ai.md#module-dependencies)。

## 配置清单

生成的项目在 `config/_ai.yml` 中设置模型列表、模型名称和服务地址。应用启动代码读取该文件，把配置对象传给 `ai.init(config, options)`。

在[模块配置清单](../../docs/usage/configuration/ai.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/ai.md#api-reference)，包含调用入口、输入、返回值和用法。
私有文件可在 [Node 本地解析](../../docs/usage/function/ai.md#bounded-local-files)。模型流可预览指定 JSON 字段，[浏览器录音](../../docs/usage/function/ai.md#browser-recording)支持麦克风生命周期和有界 WAV 转换。

## 数据结构

查看[数据结构](../../docs/usage/data/ai.md)，了解内置 DB Store、向量集合与原生记忆命名空间。

## 开发测试

```bash
pnpm --filter @h-ai/ai typecheck
pnpm --filter @h-ai/ai lint
pnpm --filter @h-ai/ai test
pnpm --filter @h-ai/ai build
```

源码 JSDoc 的公开示例从实际包入口导入，内部工厂示例标记“模块内部上下文”，分别按真实声明编译。根目录执行 `pnpm check:jsdoc --package ai` 核验覆盖与示例类型；普通业务方法检查 HaiResult，流式与浏览器 AudioClient 保留显式抛错契约。

## 许可证

Apache-2.0
