# 配置与数据库资源清单

AI 的可维护资源统一使用两份来源：初始化配置（通常来自 config/ai.yml）和 AIStoreProvider 数据库。按 ID 合并，同 ID 配置优先；配置条目只读，不复制到数据库。移除配置后，原来被遮蔽的数据库条目重新可见。数据库变更不会修改配置文件。

| 清单入口 | 配置数组 | 使用方 |
| --- | --- | --- |
| `ai.llm.models` | `llm.models` | LLM、embedding、rerank、ACP 原生模型配置 |
| `ai.audio.models` | `audio.models` | ASR/TTS |
| `ai.image.models` | `image.models` | 图像生成 |
| `ai.mcp.servers` | `mcp.servers` | ACP `mcpServerIds`，外部 MCP 连接资料 |
| `ai.retrieval.sources` | `retrieval.sources` | 检索源及旧 addSource/removeSource/listSources 接口 |
| `ai.acp.agents` | `acp.agents` | 智能体接入、初始化和会话 |
| `ai.acp.workspaces` | `acp.workspaces` | 工程准备、会话目录及 Git 操作 |

这些清单支持 `list/get/register/update/remove`。`list/get` 返回 `HaiResult`，条目为 `{ value, source, version? }`；`source` 是 config 或 database，数据库 `get` 带版本。`update` 接受完整定义，不是部分 patch。编辑前 get，再把 version 传给 update/remove，过期写入返回冲突。已有运行中的 ACP 会话保留原模型绑定；新会话读取最新清单，恢复会话会校验模型与智能体定义是否仍兼容。

```ts
import { ai } from '@h-ai/ai'

// 已按应用生命周期成功初始化 reldb、vecdb 和 ai。
async function changeModel() {
  const current = await ai.llm.models.get('coding')
  if (!current.success) return current
  if (current.data.source === 'config') return current
  return ai.llm.models.update({ ...current.data.value, temperature: 0.2 }, current.data.version)
}
```

配置示例（模型名、地址与路径由部署提供）：

```yaml
llm:
  models:
    - id: coding
      model: your-model
      protocol: responses
acp:
  agents:
    - id: coder
      name: Codex
      mode: embedded
      adapter: codex
      modelIds: [coding]
  workspaces:
    - id: project
      storage:
        type: directory
        path: /srv/projects/project
      repositories:
        - id: api
          url: https://git.example.com/team/api.git
          mainBranch: trunk
mcp:
  servers:
    - id: docs
      name: Docs
      transport: stdio
      command: docs-mcp
      environmentRefs:
        API_TOKEN: DOCS_API_TOKEN
```

创建会话时传 `mcpServerIds: ['docs']`；配置和数据库 MCP 条目都可选择。环境变量在实际启动时解析，不将引用替换为密钥后保存到 MCP 定义。HTTP/SSE 的 headers 使用 `headerEnv`，stdio 的环境变量使用 `environmentRefs`。这份清单只维护外部服务器；`ai.mcp.registerTool/registerResource/registerPrompt` 仍是宿主进程的函数注册，不将可执行函数存进数据库。

框架的异步模型调用每次读取最新清单；mem0 外部运行时在初始化时读取合并快照，其内置模型配置修改后需要重新初始化 AI。音频 `getCapabilities()` 保留原同步契约，使用本进程最近一次目录读写或异步音频调用刷新的快照；跨节点修改后先 await `ai.audio.models.get/list` 再同步查询能力。清单不是业务会话历史：session、聊天记录、persona 等继续使用各自已有的持久化 API，不从配置导入运行历史。

配置项改写返回 `hai:ai:090`，缺失为 091，版本/重复冲突为 092，无效定义为 093，存储失败为 094。工作区路径重叠、仍被会话引用等使用 ACP 错误。数据库工作区更新/删除前需关闭并移除引用它的会话记录；移除记录不删除磁盘目录、worktree 或 volume。

清单 API 是可信服务端管理接口，模型原始定义可能包含 apiKey。应用必须鉴权并自行选择可返回浏览器的字段，不直接透传整个 value。生产继续沿用 AI 模块已有共享数据库及向量库前置要求。
