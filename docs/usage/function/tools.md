# @h-ai/tools 功能说明

通过 `tools` 定义、注册和执行业务工具。它与模型协议分离，轻量入口可用于 Node 和浏览器，无需初始化、数据库或容器。

[模块 README](../../../packages/tools/README.md) · [配置](../configuration/tools.md) · [数据归属](../data/tools.md)

## 最小接入

```sh
pnpm add @h-ai/tools zod
```

下面是独立业务调用。`registry` 只包含宿主显式注册的工具，身份由可信服务端传入。

```ts
import { tools } from '@h-ai/tools'
import { z } from 'zod'

export async function calculate(objectId: string) {
  const registry = tools.createRegistry({
    authorize: ({ context }) => context.objectId === objectId,
  })
  const registered = registry.register(tools.define({
    name: 'sum',
    description: 'Add two numbers',
    parameters: z.object({ a: z.number(), b: z.number() }),
    handler: ({ a, b }) => ({ total: a + b }),
  }))
  if (!registered.success)
    return registered
  return registry.execute('sum', { a: 2, b: 3 }, { objectId })
  // 成功结果的 data 为 { total: 5 }。
}
```

## 公开入口与实例方法

| 入口 | 用途 | 输入与默认值 | 返回值 |
| --- | --- | --- | --- |
| `tools.define` | 定义带参数校验的工具 | 名称、描述、Zod Schema、handler；工具默认超时 30 秒 | 工具实例 |
| `tools.createRegistry` | 创建明确启用的工具集合 | 可选 `authorize` | 注册器实例 |
| `tool.execute` | 执行单个定义 | 业务输入、可选执行上下文 | `Promise<HaiResult<TOutput>>` |
| `tool.toDefinition` | 读取中立工具描述 | 无 | 名称、描述和输入 JSON Schema |
| `registry.register/registerMany` | 登记工具 | 单工具或工具数组 | `HaiResult<void>`；重名不覆盖，批量原子登记 |
| `registry.replace` | 显式替换已有工具 | 工具实例 | `HaiResult<void>`；名称不存在则失败 |
| `registry.get/has/getNames` | 查询当前集合 | 名称或无参数 | 工具、存在性或名称列表 |
| `registry.getDefinitions` | 读取当前中立定义 | 无 | 中立定义数组 |
| `registry.execute` | 按名称执行 | 名称、业务输入、可选上下文 | `Promise<HaiResult<unknown>>` |
| `registry.executeAll` | 批量执行 | `{ name, input }[]`，默认串行，可显式并行 | `Promise<HaiResult<unknown[]>>` |
| `registry.unregister/clear/size` | 停用、清空和统计 | 名称或无参数 | 删除结果、void 或数量 |

上述 `tool` 和 `registry` 是创建操作返回的实例，不是包级独立函数。注册器不隐式发现或启用其他工具。

## 自定义扩展和模型接入

新增工具只需提供 Schema 和处理函数，通过 `tools.define` 创建，再注册到所需集合，不修改 Tools 内核。注册器拒绝手写或复制的工具对象，确保所有执行都经过同一套校验、授权和取消处理。处理函数可组合已有模块，但 Tools 本身不反向依赖 AI。

名称使用 1～64 个 ASCII 字符，以字母开头，其余为字母、数字、下划线或连字符。定义时名称或默认超时无效会抛出 `TypeError`；这是开发配置错误，业务执行仍返回 `HaiResult`。模型工具参数应采用可转换成 JSON Schema 的对象 Schema；`z.date()`、不可表达的自定义类型等不能直接用作模型参数，定义描述转换会报告错误。

需要模型使用时，安装 `@h-ai/ai` 并通过 `ai.tools.adapt(registry)` 获取协议适配器：`getDefinitions()` 用于模型请求，`execute(toolCall)` 将模型消息转换成同一个注册器的业务调用。详见 [AI 工具调用](ai.md#工具调用)。

## 授权、失败和取消

参数验证通过后再执行授权和 handler。注册器级与单次授权均须通过；授权返回 false 或发生异常时拒绝执行。处理函数仍需针对最终访问的资源复核权限。

执行选项中的 `signal`、`objectId`、`sessionId`、`deadline` 和 `timeoutMs` 传给处理函数。优先级是绝对 `deadline`、单次超时、工具超时、默认 30 秒。期限覆盖异步参数校验、授权和处理函数，各阶段还会检查实际截止时间。取消与超时能停止等待并透传信号；不响应信号的函数仍可能继续执行。进程和容器的停止证明由 Runner 提供。

业务失败返回 `HaiResult`，先检查 `success` 再读 `data`。Tools 的验证、授权、执行、超时和取消错误采用 `hai:tools` 命名空间；模型 JSON 解析错误由 AI 适配层处理。

## 多节点与独立作业

各节点从相同配置建立工具集合，业务授权和资源使用共享后端。注册器是进程内实现集合；任务领取、租约、事件和取消沿用 Runner，产物字节沿用 Storage，不能用注册器保存分布式执行状态。

文档、Office、OCR 和浏览器的独立镜像位于 [jobs](../../../packages/tools/jobs/README.md)。MCP 的受管作业继续经 `ai.mcp.services` 进入 Runner；只提供授权文件 ID，执行节点复核后读取和发布产物。

## 开发测试

运行 `pnpm --filter @h-ai/tools test` 验证中立内核，运行 `pnpm --filter @h-ai/tools test:jobs` 验证独立作业协议。容器验收另需按作业说明准备固定镜像，不把单元结果当成真实镜像验收。
