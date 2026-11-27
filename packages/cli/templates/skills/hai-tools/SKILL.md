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
| 限制 | 轻量定义、注册和产物工厂独立使用；`@h-ai/tools-runner` 的持久服务借用 Runner，`close()` 只注销自己的处理器 |

## 选择接入方式

| 要完成的任务 | 导入与操作 |
| --- | --- |
| 直接校验和执行短时业务函数 | 从 `@h-ai/tools` 导入 `tools`，使用 `define()` 或 `createRegistry()`。 [独立调用示例](reference.md) |
| 读取、保存或分析应用文件 | 在 Node 从 `@h-ai/tools/server` 导入 `tools`，给 `tools.createArtifactTools()` 提供宿主的资源访问回调。 [产物接入](server-guide.md#接入现成作业) |
| 保存任务和回执，之后查询、恢复或取消 | 在 Node 从 `@h-ai/tools-runner` 导入 `toolsRunner`，将初始化完成的 Runner 交给 `toolsRunner.createService()`。 [求和服务与回执示例](server-guide.md) |
| 调用文档、Office、OCR、网页与视频容器 | 在 `toolsRunner.createService()` 的工具集合里加入 `toolsRunner.createJobTools()` 返回的工具和环境绑定。 [容器环境](server-guide.md#接入现成作业) |
| 从终端独立运行现成容器 | 按已安装包 `node_modules/@h-ai/tools/jobs/README.md` 中的镜像和输入示例运行。 |

为工具定义 Zod 参数。返回普通数据时用 `handler`，已有 `HaiResult` 时用 `resultHandler`。注册、执行和服务请求先检查 `success`。由可信宿主绑定身份，在访问资源时复核权限。

业务调用可独立使用。接入模型时，`ai.tools.adapt(registry)` 将模型请求转成同一个注册器的调用。
