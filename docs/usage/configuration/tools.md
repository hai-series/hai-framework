# @h-ai/tools 配置清单

`tools.define` 和 `tools.createRegistry` 是纯定义与工厂，无模块级 YAML、环境变量或 `init/close`。

| 配置位置 | 字段 | 默认和作用 |
| --- | --- | --- |
| 工具定义 | `name/description/parameters/handler` | 必填；名称为 1～64 个 ASCII 字符，以字母开头，其余为字母、数字、下划线或连字符；输入使用 Zod 校验 |
| 工具定义 | `timeoutMs` | 整数 0～2147483647 毫秒；省略时 30 秒，可被单次配置覆盖；0 立即超时 |
| 注册器 | `authorize` | 可选；配置后每次注册器调用都需通过 |
| 执行选项 | `signal` | 取消信号，继续透传给处理函数 |
| 执行选项 | `objectId/sessionId` | 可信主体和会话上下文，不能取自未经认证的模型输入 |
| 执行选项 | `deadline/timeoutMs` | 绝对截止时间优先；之后为单次超时、工具超时、30 秒 |
| 执行选项 | `authorize` | 单次额外授权，与注册器授权共同生效 |
| 批量执行选项 | `parallel` | 默认 false；仅对确认可并行的调用启用 |

工具启用由宿主决定：省略登记即不可调用，注销工具后也不再出现在定义列表。模型可见工具还需要按当前主体过滤，服务端执行时继续检查。

`tools.define` 的无效名称或默认超时属于配置错误，抛出 `TypeError`。注册器只接受该方法创建的工具，不接受绕过统一执行边界的手写对象。直接业务工具可使用较丰富的 Schema；提供给模型时须能转换为 JSON Schema，通常使用对象参数。

独立作业使用 Runner 环境、MCP 服务配置与固定镜像；配置属于对应模块和宿主，见 [Runner](runner.md)、[AI MCP](ai.md#mcp和a2a) 及 [作业说明](../../../packages/tools/jobs/README.md)。安装 Tools 不会启动这些服务。
