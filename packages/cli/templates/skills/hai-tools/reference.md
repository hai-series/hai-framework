# 工具定义与执行

`@h-ai/tools` 的轻量入口可在 Node 或浏览器使用，不加载模型 SDK、Runner 或容器引擎。浏览器执行能力不代表具有服务端权限。

```ts
import { tools } from '@h-ai/tools'
import { z } from 'zod'

export async function calculateForUser(objectId: string) {
  const registry = tools.createRegistry({
    authorize: ({ context }) => context.objectId === objectId,
  })
  const registered = registry.register(tools.define({
    name: 'sum',
    description: 'Add two numbers',
    parameters: z.object({ a: z.number(), b: z.number() }),
    handler: ({ a, b }) => a + b,
  }))
  if (!registered.success)
    return registered
  return registry.execute('sum', { a: 2, b: 3 }, { objectId })
}
```

供 AI 使用时，将同一个注册器传入 `ai.tools.adapt(registry)`；取得的定义用于模型请求，模型返回的调用通过该适配器执行。AI 负责 JSON 参数与消息协议，业务授权和执行继续经过中立注册器。

注册器是当前进程中的工具实现集合。多节点应加载同一工具配置，使用相同的可信授权与共享资源；执行事实、任务进度和归属放在 Runner，业务文件放在共享 Storage。不要把进程内 Map 当作多节点任务存储。

`signal`、`deadline` 和工具超时传给处理函数。函数应把信号继续传给 HTTP、模型及文件操作。无法响应信号的进程放入受管作业；对外写入另按业务幂等键去重。

工具组由宿主按配置注册和启用。停用时同时移除模型可见定义和服务端执行授权，不能只隐藏按钮。自定义工具复用同一注册器，无需修改 Tools 内核。

已有业务接口返回 `HaiResult` 时使用 `resultHandler`，普通输出使用 `handler`，不可同时提供。`title` 和 `examples: { label, input }[]` 保留在中立定义中，用于可读名称及填表；预设不执行工具或授予权限。

可恢复任务和内置产物/作业工厂见 [服务端指南](server-guide.md)，不要在页面另建执行状态机。
