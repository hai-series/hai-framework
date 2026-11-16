---
name: hai-tools
description: "使用 @h-ai/tools 定义、注册和授权执行可选工具，并接入 AI 或独立业务调用。"
---

# hai-tools

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 `tools.define/createRegistry` 定义与模型无关的工具，复用同一实现供业务和 AI 调用 |
| 适用场景 | 接入可选工具、自定义业务操作，或将同一实现提供给模型调用 |
| 输入 | Zod 参数、处理函数、工具集合、可信身份和授权条件 |
| 输出 | 定义和注册器实例；业务执行返回 `HaiResult` |
| 限制 | 轻量定义/工厂无 `init/close`；服务端工厂借用 Runner，服务 `close` 只注销自己的处理器 |

## 使用路径

1. 短时函数从 `@h-ai/tools` 导入；可恢复任务和产物/容器作业从 `@h-ai/tools/server` 导入。通过 `tools.define` 描述参数；普通数据用 `handler`，已有 `HaiResult` 用 `resultHandler`，二者只选一个。`title/examples` 用于可读表单和预设，名称保持稳定。
2. 用 `tools.createRegistry({ authorize })` 创建需要的集合，只注册当前启用的工具。执行前按可信身份及最终资源复核权限，身份不由模型输入决定。
3. 注册和执行结果先检查 `success`。注册器直接接收工具名和业务输入；给 LLM 使用时，通过 `ai.tools.adapt(registry)` 转换为模型协议，不手写另一份工具实现。
4. 长任务用 `tools.createService` 的 `submit/find/inspect/cancel/invoke`，复用 Runner 原有任务、租约和事件。界面和智能体共用同一个服务、启用集合与授权，不另建队列或状态表。文件由宿主授权后交给 Storage，工具只返回产物引用。
5. 产物和确定性分析用 `tools.createArtifactTools`；独立文档、Office、OCR、网页和视频作业用 `tools.createJobTools`。未绑定环境的作业不出目录；`browser/web` 还需可信宿主配置 `browserProxy`。取消只代表请求，继续读取真实终态。

轻量扩展示例见 [reference.md](reference.md)，长任务、多节点与产物接入见 [server-guide.md](server-guide.md)。安装包不自动启用全部工具或启动容器。
