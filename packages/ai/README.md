# @h-ai/ai

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/api-contract](../api-contract/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/datapipe](../datapipe/README.md) · [@h-ai/reldb](../reldb/README.md) · [@h-ai/vecdb](../vecdb/README.md)

AI 能力模块，提供统一的 `ai` 服务对象，覆盖 LLM 对话、文生图、工具调用、MCP、Embedding、记忆、检索/RAG、知识库、上下文管理、文件解析、Rerank、语音（ASR/TTS）与 A2A。Node.js 侧通过 `ai.init()` 初始化，浏览器侧通过 API/client 代理访问。

## 快速开始

`ai.close()` 等待已开始的初始化完成并清理，合并并发关闭；重初始化先清理旧实例，关闭期间不接受新初始化。

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

开发/显式测试未初始化 reldb/vecdb 时，AI 使用进程内临时 Store；关闭、退出或切换实例后不保留。`NODE_ENV` 或 `HAI_CORE_ENV` 为 production 时，临时 Store、SQLite 或本地向量后端会使初始化失败。生产必须先初始化共享 RelDB 与网络 vecdb，或传入满足同等原子契约的共享 Provider。

## 配置清单

生成项目使用 `config/_ai.yml`。应用可以通过 `ai.init(config, options)` 接入配置。

在[模块配置清单](../../docs/usage/configuration/ai.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/ai.md)中查看调用示例、输入输出、错误处理与使用要点。

- `init` / `close` / `config` / `isInitialized` — 装配模型与可选 Store
- `llm` / `stream` / `reasoning` / `token` / `summary` / `compress` / `context` — 生成、流式响应和上下文预算
- `embedding` / `rerank` / `retrieval` / `rag` / `knowledge` — 向量化、重排、检索和知识入库
- `memory` / `persona` — 维护会话记忆和角色设定
- `tools` / `mcp` / `acp` / `a2a` — 注册工具、接入 MCP、控制 ACP 会话、调用 A2A 智能体
- `file` / `image` / `audio` — 文件、图像与语音操作

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
