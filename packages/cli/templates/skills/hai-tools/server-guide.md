# 提交工具任务与运行容器作业

短时业务函数可直接走[轻量注册器](reference.md)。需要在请求返回后继续运行任务，或需要回执来恢复、查询和取消时，在 Node 安装 `@h-ai/tools-runner`、`@h-ai/runner` 和 `@h-ai/reldb`。宿主依次初始化 RelDB 和 Runner，再调用 `@h-ai/tools-runner` 的 `toolsRunner.createService()`。结束时先注销工具服务，再由宿主关闭 Runner 和数据库。

## 用现有 Runner 执行求和工具

在本地接入验证时调用一次下面的 `runSum()`。示例直接导入 `@h-ai/tools` 和 `zod`，将两者也加入应用依赖。传入已初始化并可执行任务的 Runner，以及经宿主认证取得的主体 `scope`。示例只允许 `demo/alice` 调用工具。

```ts
import type { RunnerFunctions } from '@h-ai/runner'
import type { ToolServiceContext } from '@h-ai/tools/server'
import { tools } from '@h-ai/tools'
import { toolsRunner } from '@h-ai/tools-runner'
import { z } from 'zod'

export async function runSum(runner: RunnerFunctions, scope: ToolServiceContext['scope']) {
  // 定义两个数字相加的工具，配置错误时抛 TypeError；此时没有运行任务。
  const sum = tools.define({
    name: 'sum',
    description: 'Add two numbers',
    parameters: z.object({ a: z.number(), b: z.number() }),
    handler: ({ a, b }) => a + b,
  })

  // 在借用的 Runner 上注册 sum-demo 服务，只启用 sum。
  // 创建成功的 data 是服务实例；配置错误或处理器注册失败时返回 error。
  const created = toolsRunner.createService({
    id: 'sum-demo',
    runner,
    createTools: () => ({ tools: [sum] }),
    enabled: { tools: ['sum'] },
    authorize: ({ name, context }) =>
      name === 'sum' && context.scope.tenantId === 'demo' && context.scope.userId === 'alice',
  })
  if (!created.success)
    return created

  try {
    // 按宿主认证后的主体提交并等待结果。输入为 2 和 3，成功的 data 是数字 5。
    // 校验、授权、执行或超时失败时，返回已有的 HaiResult 错误。
    return await created.data.invoke({
      name: 'sum',
      input: { a: 2, b: 3 },
      idempotencyKey: 'sum-2-plus-3',
    }, { scope })
  }
  finally {
    // 注销本示例服务的处理器。返回 void，由外部宿主继续管理 Runner。
    created.data.close()
  }
}
```

应用通常在启动时创建一次服务，并在每次请求中使用同一个实例。示例的固定键只代表这一次求和操作。业务调用为每个不同操作分配新键，为同一操作的重试保留原键。宿主应按请求绑定身份，并在最终访问文件时核对资源归属。启用列表限制可选工具，授权仍在提交和执行阶段分别检查。

## 选用等待结果或保存回执

- 请求需要结果时用 `service.invoke(request, context)`。成功后从 `data` 读取 JSON 结果。
- 请求可以先返回时用 `service.submit(request, context)`。成功的 `data` 有 `receipt: { id, key }` 和当前 `status`。保存完整回执。
- 响应中断时，用原键调用 `service.find(key, context)`。同一主体和服务下有记录就返回现有任务，未找到时 `data` 为 `undefined`。
- 用 `service.inspect(receipt, context, { after })` 查看状态，以返回的 `next` 继续读事件。`queued`、`running`、`cancelling` 都需继续观察。成功看 `output`，失败看 `failure` 和错误事件。
- 用 `service.cancel(receipt, context)` 发出停止请求，再查最终状态。写入 Runner 已开始时，`submit()` 等实际受理结果。若 `invoke()` 在此期间被取消且已有回执，可在 `error.ext.receipt` 找回任务。服务生成键的任务会被请求取消，调用方给键时由调用方结合回执决定。
- `service.catalog(context)` 返回当前启用的工具定义和分组，适合构建选择列表。按主体控制可见项应在 `enabled` 或 `createTools` 中完成。

`enabled` 可选定 `tools`、`groups`，再用 `exclude` 排除。空选择全部停用。默认运行和排队时限各为 300000 毫秒。执行授权拿到的 `context.signal` 包含工具期限。执行节点使用首次提交的语言生成错误事件。

## 接入现成作业

- **需要文件操作**时，从 `@h-ai/tools/server` 导入 `tools` 并调用 `tools.createArtifactTools({ context, files })`。可直接注册这些工具，也可在 `createTools(context)` 中与持久任务一起装配。宿主实现 `files.read()` 和 `files.publish()`，有版本保存时再提供 `files.save()`。
- **需要容器作业**时，在 `createTools(context)` 中调用 `toolsRunner.createJobTools({ context, files, runner, environments })`。单独使用时返回整个 `RunnerToolSet`。合并其他工具时保留容器工具的 `environments` 映射。工厂参数接受 `documents/office/ocr/browser/web/preview/video` 到 Runner 环境 ID 的映射。需要联网的 `browser/web` 另外传入部署控制的 `browserProxy`。
- **只想在终端运行镜像**时，按安装包 `node_modules/@h-ai/tools/jobs/README.md` 准备输入和输出目录，将 JSON 请求从标准输入传给容器内的 `hai-tool`。这条路径由调用方管理文件和容器。

受管作业把输入文件 ID 交给宿主读取，成功清理容器后才调用 `files.publish()`。业务传参使用文件引用，Runner 的提交、事件和输出各有 512 KiB JSON 限制。文件字节还受作业和容器的资源限额约束。网页截图和采集只接受不超过 2048 个 Unicode 字符的 HTTPS DNS 地址及默认端口。

`@h-ai/tools/server` 的 `ToolServiceContext` 包含可信 `scope`、可选 `sessionId` 和 `signal`。执行时可从 `execution.id` 取得稳定编号，并用 `execution.emit(data)` 写入 JSON 进度。适配包的 `RunnerToolServiceContext` 在执行节点绑定真实 Runner 上下文，固定容器工具由该上下文调用 `start()`。调用方提交前只传宿主认证后的主体、会话和取消信号。

多个节点使用同一服务 ID、工具配置、Runner 数据库和文件存储。只接收请求的节点可用 `executor: false`，执行节点登记相同服务并提供独立稳定的节点 ID。区分本机临时目录和应用的共享产物存储。
