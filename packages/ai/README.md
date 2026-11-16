# @h-ai/ai

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/api-contract](../api-contract/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/datapipe](../datapipe/README.md) · [@h-ai/reldb](../reldb/README.md) · [@h-ai/vecdb](../vecdb/README.md)

AI 能力模块，提供统一的 `ai` 服务对象，覆盖 LLM 对话、文生图、工具调用、MCP、Embedding、记忆、检索/RAG、知识库、上下文管理、文件解析、Rerank、语音（ASR/TTS）与 A2A。Node.js 侧通过 `ai.init()` 初始化，浏览器侧通过 API/client 代理访问。

## 快速开始

`ai.close()` 会等正在进行的初始化结束，再释放资源。多个关闭请求共用同一次清理。如果要换一套配置，`ai.init()` 会先关闭已有实例。关闭进行中时，新初始化会返回失败。

### 开发 LLM-only（零数据库依赖）

```ts
import { ai } from '@h-ai/ai'

const init = await ai.init({
  llm: {
    model: 'gpt-4o-mini',
    apiKey: process.env.HAI_AI_LLM_APIKEY,
  },
})
if (!init.success)
  throw new Error(init.error.message)

try {
  const result = await ai.llm.chat({
    messages: [
      { role: 'user', content: '你好！' }
    ],
  })
  if (!result.success)
    throw new Error(result.error.message)
  const reply = result.data.choices[0]?.message.content ?? ''
}
finally {
  await ai.close()
}
```

开发或显式测试时，如果没有可用的 RelDB 和向量数据库，AI 可以把会话等记录暂存在当前进程内。关闭模块、重启进程或切换到其他实例后便读不到这些记录。只要 `NODE_ENV` 或 `HAI_CORE_ENV` 为 `production`，初始化就要求多个实例能读写同一份数据。请先连接共享关系数据库和网络向量数据库，或传入支持共享数据及按版本更新的自定义存储。

## 配置清单

生成的项目在 `config/_ai.yml` 中设置模型列表、模型名称和服务地址。应用启动代码读取该文件，把配置对象传给 `ai.init(config, options)`。

在[模块配置清单](../../docs/usage/configuration/ai.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/ai.md)中查看调用示例、输入输出、错误处理与使用要点。

- `ai.init` / `ai.close` / `ai.config` / `ai.isInitialized` — 初始化模型连接，查看或关闭模块。需要跨进程保存会话时可另配存储
- `ai.llm` / `ai.stream` / `ai.reasoning` / `ai.token` / `ai.summary` / `ai.compress` / `ai.context` — 发送聊天请求、逐段接收响应、估算 Token 数并缩短对话历史
- `ai.embedding` / `ai.rerank` / `ai.retrieval` / `ai.rag` / `ai.knowledge` — 把内容转成向量，搜索和重新排序匹配结果，将文档加入知识库
- `ai.memory` / `ai.persona` — 维护会话记忆和角色设定
- `ai.tools` / `ai.mcp` / `ai.acp` / `ai.a2a` — 注册工具、接入 MCP、控制 ACP 会话、调用 A2A 智能体
- `ai.file` / `ai.image` / `ai.audio` — 文件、图像与语音操作

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
